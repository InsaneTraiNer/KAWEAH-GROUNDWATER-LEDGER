"""
SGMA Extraction Auditor & Water Ledger Engine
Module: ingestion.py

Deterministic ingestion pipelines for:
1. CPUC-regulated PG&E Green Button 15-minute interval data (CSV and ESPI XML formats),
   including dynamic header detection beneath utility account metadata and
   America/Los_Angeles Daylight Saving Time (DST) normalization.
2. California Department of Water Resources (DWR) CASGEM / Periodic Groundwater Level
   measurements (live CKAN DataStore API connector with local CSV/synthetic fallback),
   including Haversine spatial matching and daily linear interpolation between Spring
   and Fall static water levels across the April-October irrigation season.
"""

from __future__ import annotations

import csv
import io
import json
import math
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Sequence, Tuple, Union
from zoneinfo import ZoneInfo

try:
    import numpy as np
except ImportError:
    from _compat import NumpyShim as np  # type: ignore

from schemas import DWRMonitoringRecord, WellProfile

PACIFIC_TZ = ZoneInfo("America/Los_Angeles")
UTC_TZ = timezone.utc


@dataclass(frozen=True)
class RawEnergyInterval:
    """Normalized 15-minute PG&E interval measurement in Pacific Time."""
    interval_start: datetime
    interval_end: datetime
    kwh: float
    cost_usd: Optional[float] = None
    notes: Optional[str] = None

    @property
    def kw_demand(self) -> float:
        """Average power demand (kW) across the 15-minute (0.25 hr) interval."""
        duration_hours = (self.interval_end - self.interval_start).total_seconds() / 3600.0
        if duration_hours <= 0:
            duration_hours = 0.25
        return self.kwh / duration_hours


class PGEGreenButtonParser:
    """
    Production parser for PG&E Share My Data / Green Button CSV and ESPI XML exports.
    Handles variable-length utility preamble lines (Name, Account, Service Agreement,
    Meter ID), normalizes timestamps into America/Los_Angeles (handling PST/PDT shifts),
    and validates 15-minute energy intervals.
    """

    REQUIRED_CSV_COLUMNS = {"date", "start time", "usage"}
    USAGE_ALIASES = ("usage", "usage (kwh)", "kwh", "value", "consumption (kwh)", "energy (kwh)")
    END_TIME_ALIASES = ("end time", "end")
    COST_ALIASES = ("cost", "cost ($)", "amount")

    @classmethod
    def parse_file(cls, file_path: Union[str, Path]) -> Tuple[Dict[str, str], List[RawEnergyInterval]]:
        """Auto-detects CSV vs XML PG&E export and returns (metadata, intervals)."""
        path = Path(file_path)
        if not path.exists():
            raise FileNotFoundError(f"PG&E interval file not found: {path}")

        raw_text = path.read_text(encoding="utf-8-sig")
        if path.suffix.lower() == ".xml" or raw_text.lstrip().startswith("<?xml") or "<feed" in raw_text[:500]:
            return cls.parse_xml_string(raw_text)
        return cls.parse_csv_string(raw_text)

    @classmethod
    def parse_csv_string(cls, csv_content: str) -> Tuple[Dict[str, str], List[RawEnergyInterval]]:
        """
        Dynamically scans past utility preamble metadata until locating the Green Button
        tabular header row, then parses and normalizes all 15-minute kWh intervals.
        """
        lines = [line.strip() for line in csv_content.splitlines() if line.strip()]
        if not lines:
            raise ValueError("PG&E CSV content is empty.")

        metadata: Dict[str, str] = {}
        header_idx: Optional[int] = None
        parsed_header: List[str] = []

        for idx, line in enumerate(lines):
            row = next(csv.reader([line]))
            normalized = [cell.strip().lower() for cell in row if cell.strip()]
            has_date = any(c in ("date", "interval date", "read date") for c in normalized)
            has_start = any(c in ("start time", "start", "interval start", "time") for c in normalized)
            has_usage = any(c in cls.USAGE_ALIASES for c in normalized)

            if has_date and has_start and has_usage:
                header_idx = idx
                parsed_header = [cell.strip().lower() for cell in row]
                break
            elif len(row) >= 2 and row[0].strip():
                key = row[0].strip().rstrip(":")
                val = row[1].strip()
                metadata[key] = val

        if header_idx is None:
            raise ValueError(
                "Could not locate valid PG&E Green Button header row containing "
                "Date, Start Time, and Usage (kWh) columns."
            )

        col_map: Dict[str, int] = {}
        for i, col_name in enumerate(parsed_header):
            if col_name in ("date", "interval date", "read date"):
                col_map["date"] = i
            elif col_name in ("start time", "start", "interval start", "time"):
                col_map["start_time"] = i
            elif col_name in cls.END_TIME_ALIASES:
                col_map["end_time"] = i
            elif col_name in cls.USAGE_ALIASES:
                col_map["usage"] = i
            elif col_name in cls.COST_ALIASES:
                col_map["cost"] = i
            elif col_name in ("notes", "quality", "flags"):
                col_map["notes"] = i

        intervals: List[RawEnergyInterval] = []
        reader = csv.reader(lines[header_idx + 1 :])

        for row_num, row in enumerate(reader, start=header_idx + 2):
            if not row or all(not cell.strip() for cell in row):
                continue
            if len(row) <= max(col_map["date"], col_map["start_time"], col_map["usage"]):
                continue

            date_str = row[col_map["date"]].strip()
            start_str = row[col_map["start_time"]].strip()
            usage_str = row[col_map["usage"]].strip().replace(",", "")

            if not date_str or not start_str or not usage_str:
                continue

            try:
                kwh_val = float(usage_str)
            except ValueError as exc:
                raise ValueError(f"Invalid kWh value '{usage_str}' at CSV line {row_num}") from exc

            if kwh_val < 0.0:
                kwh_val = 0.0

            start_dt = cls._parse_pacific_datetime(date_str, start_str)
            end_dt = start_dt + timedelta(minutes=15)

            cost_val: Optional[float] = None
            if "cost" in col_map and col_map["cost"] < len(row):
                raw_cost = row[col_map["cost"]].strip().replace("$", "").replace(",", "")
                if raw_cost:
                    try:
                        cost_val = float(raw_cost)
                    except ValueError:
                        cost_val = None

            notes_val: Optional[str] = None
            if "notes" in col_map and col_map["notes"] < len(row):
                notes_val = row[col_map["notes"]].strip() or None

            intervals.append(
                RawEnergyInterval(
                    interval_start=start_dt,
                    interval_end=end_dt,
                    kwh=kwh_val,
                    cost_usd=cost_val,
                    notes=notes_val,
                )
            )

        if not intervals:
            raise ValueError("No valid 15-minute intervals parsed from PG&E CSV.")

        intervals.sort(key=lambda r: r.interval_start)
        return metadata, intervals

    @classmethod
    def parse_xml_string(cls, xml_content: str) -> Tuple[Dict[str, str], List[RawEnergyInterval]]:
        """
        Parses ESPI (Energy Services Provider Interface) Green Button Atom XML feeds.
        Extracts ReadingType powerOfTenMultiplier (e.g., Wh to kWh conversion) and
        IntervalReading timePeriod start (epoch UTC) + duration (900 seconds).
        """
        root = ET.fromstring(xml_content)
        metadata: Dict[str, str] = {"format": "ESPI_GREEN_BUTTON_XML"}

        # Extract feed title or UsagePoint metadata
        for elem in root.iter():
            tag_local = elem.tag.split("}")[-1]
            if tag_local == "title" and elem.text and "title" not in metadata:
                metadata["title"] = elem.text.strip()

        # Detect ReadingType multiplier (default Wh = 10^-3 kWh if multiplier is 0 or -3)
        multiplier_to_kwh = 0.001  # Standard ESPI reports in Watt-hours (Wh)
        for elem in root.iter():
            tag_local = elem.tag.split("}")[-1]
            if tag_local == "ReadingType":
                pow10_text = None
                uom_text = None
                for child in elem:
                    c_tag = child.tag.split("}")[-1]
                    if c_tag == "powerOfTenMultiplier" and child.text:
                        pow10_text = int(child.text.strip())
                    elif c_tag == "uom" and child.text:
                        uom_text = child.text.strip()
                if pow10_text is not None:
                    # UOM 72 is Wh. kWh = value * (10 ** pow10) / 1000.0
                    multiplier_to_kwh = (10.0 ** pow10_text) / 1000.0

        intervals: List[RawEnergyInterval] = []
        for elem in root.iter():
            tag_local = elem.tag.split("}")[-1]
            if tag_local == "IntervalReading":
                start_epoch: Optional[int] = None
                duration_sec: int = 900
                raw_val: Optional[float] = None

                for child in elem:
                    c_tag = child.tag.split("}")[-1]
                    if c_tag == "timePeriod":
                        for tp_child in child:
                            tp_tag = tp_child.tag.split("}")[-1]
                            if tp_tag == "start" and tp_child.text:
                                start_epoch = int(tp_child.text.strip())
                            elif tp_tag == "duration" and tp_child.text:
                                duration_sec = int(tp_child.text.strip())
                    elif c_tag == "value" and child.text:
                        raw_val = float(child.text.strip())

                if start_epoch is not None and raw_val is not None:
                    utc_start = datetime.fromtimestamp(start_epoch, tz=UTC_TZ)
                    pac_start = utc_start.astimezone(PACIFIC_TZ)
                    pac_end = pac_start + timedelta(seconds=duration_sec)
                    kwh = max(0.0, raw_val * multiplier_to_kwh)
                    intervals.append(
                        RawEnergyInterval(
                            interval_start=pac_start,
                            interval_end=pac_end,
                            kwh=round(kwh, 6),
                        )
                    )

        if not intervals:
            raise ValueError("No IntervalReading entries found in PG&E Green Button XML.")

        intervals.sort(key=lambda r: r.interval_start)
        return metadata, intervals

    @staticmethod
    def _parse_pacific_datetime(date_str: str, time_str: str) -> datetime:
        """
        Parses combined date and start time strings and attaches America/Los_Angeles
        timezone cleanly across Daylight Saving transitions.
        """
        # Handle ISO strings if present in date_str
        combined = f"{date_str} {time_str}".strip()
        formats = (
            "%Y-%m-%d %H:%M",
            "%Y-%m-%d %H:%M:%S",
            "%m/%d/%Y %H:%M",
            "%m/%d/%Y %H:%M:%S",
            "%m/%d/%y %H:%M",
            "%Y/%m/%d %H:%M",
        )
        for fmt in formats:
            try:
                naive = datetime.strptime(combined, fmt)
                return naive.replace(tzinfo=PACIFIC_TZ)
            except ValueError:
                continue

        # Fallback ISO parser
        try:
            dt = datetime.fromisoformat(date_str)
            if dt.tzinfo is None:
                return dt.replace(tzinfo=PACIFIC_TZ)
            return dt.astimezone(PACIFIC_TZ)
        except ValueError as exc:
            raise ValueError(f"Unrecognized PG&E timestamp format: '{combined}'") from exc


class DWRCasgemConnector:
    """
    Connector for California Department of Water Resources (DWR) Periodic Groundwater
    Level measurements (CASGEM / SGMA Data Viewer / CNRA Open Data CKAN API).

    Provides:
    - Live CKAN DataStore SQL/search query against data.cnra.ca.gov
    - Local CSV / synthetic Tulare Lake Hydrologic Region (Kaweah, Tule, Kings) catalog
    - Haversine spatial nearest-neighbor monitoring well matching
    - Seasonal daily interpolation of Static Water Level (SWL) across April - October
    """

    CNRA_DATASTORE_URL = "https://data.cnra.ca.gov/api/3/action/datastore_search"
    # DWR Periodic Groundwater Level Measurements resource ID on CNRA Open Data
    PERIODIC_GWL_RESOURCE_ID = "bfa9f262-24a1-45bd-8dc8-138bc8107266"

    # Curated Tulare Lake Basin reference stations (Kaweah, Tule, Kings subbasins)
    # used when running offline or in hermetic audit environments
    REFERENCE_STATIONS: Tuple[DWRMonitoringRecord, ...] = (
        # Kaweah Subbasin (Greater Kaweah / Mid-Kaweah / East Kaweah)
        DWRMonitoringRecord(
            site_code="362077N1193473W001",
            measurement_date=date(2026, 3, 18),
            depth_to_water_ft=142.4,
            ground_surface_elevation_ft=288.0,
            quality_flag="GOOD",
            latitude=36.2077,
            longitude=-119.3473,
            basin_name="Kaweah Subbasin (5-022.11)",
        ),
        DWRMonitoringRecord(
            site_code="362077N1193473W001",
            measurement_date=date(2026, 7, 15),
            depth_to_water_ft=158.9,
            ground_surface_elevation_ft=288.0,
            quality_flag="GOOD",
            latitude=36.2077,
            longitude=-119.3473,
            basin_name="Kaweah Subbasin (5-022.11)",
        ),
        DWRMonitoringRecord(
            site_code="362077N1193473W001",
            measurement_date=date(2026, 10, 22),
            depth_to_water_ft=169.8,
            ground_surface_elevation_ft=288.0,
            quality_flag="GOOD",
            latitude=36.2077,
            longitude=-119.3473,
            basin_name="Kaweah Subbasin (5-022.11)",
        ),
        # Tule Subbasin (Lower Tule River / Pixley / Eastern Tule)
        DWRMonitoringRecord(
            site_code="360145N1192210W001",
            measurement_date=date(2026, 3, 20),
            depth_to_water_ft=198.0,
            ground_surface_elevation_ft=264.5,
            quality_flag="GOOD",
            latitude=36.0145,
            longitude=-119.2210,
            basin_name="Tule Subbasin (5-022.13)",
        ),
        DWRMonitoringRecord(
            site_code="360145N1192210W001",
            measurement_date=date(2026, 10, 19),
            depth_to_water_ft=231.5,
            ground_surface_elevation_ft=264.5,
            quality_flag="GOOD",
            latitude=36.0145,
            longitude=-119.2210,
            basin_name="Tule Subbasin (5-022.13)",
        ),
        # Kings Subbasin (Alta / Consolidated / North Kings)
        DWRMonitoringRecord(
            site_code="365812N1194520W001",
            measurement_date=date(2026, 3, 15),
            depth_to_water_ft=94.2,
            ground_surface_elevation_ft=335.0,
            quality_flag="GOOD",
            latitude=36.5812,
            longitude=-119.4520,
            basin_name="Kings Subbasin (5-022.08)",
        ),
        DWRMonitoringRecord(
            site_code="365812N1194520W001",
            measurement_date=date(2026, 10, 18),
            depth_to_water_ft=116.8,
            ground_surface_elevation_ft=335.0,
            quality_flag="GOOD",
            latitude=36.5812,
            longitude=-119.4520,
            basin_name="Kings Subbasin (5-022.08)",
        ),
    )

    @staticmethod
    def haversine_miles(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        """Great-circle distance in statute miles between two WGS84 coordinates."""
        r_earth_miles = 3958.7613
        phi1, phi2 = math.radians(lat1), math.radians(lat2)
        dphi = math.radians(lat2 - lat1)
        dlambda = math.radians(lon2 - lon1)
        a = (
            math.sin(dphi / 2.0) ** 2
            + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2.0) ** 2
        )
        return 2.0 * r_earth_miles * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))

    @classmethod
    def load_records_from_csv(cls, csv_path: Union[str, Path]) -> List[DWRMonitoringRecord]:
        """Loads DWR CASGEM monitoring records from a local CSV export."""
        path = Path(csv_path)
        if not path.exists():
            raise FileNotFoundError(f"DWR CSV file not found: {path}")

        records: List[DWRMonitoringRecord] = []
        with path.open("r", encoding="utf-8-sig") as f:
            reader = csv.DictReader(f)
            for row in reader:
                site = (row.get("site_code") or row.get("SITE_CODE") or "").strip()
                mdate_str = (row.get("measurement_date") or row.get("MSMT_DATE") or "").strip()
                dtw_str = (row.get("depth_to_water_ft") or row.get("GSE_GWE") or "").strip()
                gse_str = (row.get("ground_surface_elevation_ft") or row.get("REFERENCE_POINT_ELEVATION") or "285.0").strip()
                qflag = (row.get("quality_flag") or row.get("WLM_QA_DESC") or "GOOD").strip()
                lat_str = (row.get("latitude") or row.get("LATITUDE") or "").strip()
                lon_str = (row.get("longitude") or row.get("LONGITUDE") or "").strip()
                basin = (row.get("basin_name") or row.get("BASIN_NAME") or "").strip() or None

                if not site or not mdate_str or not dtw_str:
                    continue

                mdate = date.fromisoformat(mdate_str[:10])
                records.append(
                    DWRMonitoringRecord(
                        site_code=site,
                        measurement_date=mdate,
                        depth_to_water_ft=float(dtw_str),
                        ground_surface_elevation_ft=float(gse_str),
                        quality_flag=qflag,
                        latitude=float(lat_str) if lat_str else None,
                        longitude=float(lon_str) if lon_str else None,
                        basin_name=basin,
                    )
                )
        return records

    @classmethod
    def fetch_live_cnra_records(
        cls,
        site_code: str,
        timeout_sec: float = 4.0,
    ) -> List[DWRMonitoringRecord]:
        """
        Queries the live California Natural Resources Agency (data.cnra.ca.gov) CKAN API
        for a specific DWR site_code. Falls back cleanly to curated reference stations if
        offline or rate-limited.
        """
        params = urllib.parse.urlencode(
            {
                "resource_id": cls.PERIODIC_GWL_RESOURCE_ID,
                "filters": json.dumps({"site_code": site_code}),
                "limit": 100,
            }
        )
        url = f"{cls.CNRA_DATASTORE_URL}?{params}"
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "SGMA-Extraction-Auditor/1.0"})
            with urllib.request.urlopen(req, timeout=timeout_sec) as resp:
                payload = json.loads(resp.read().decode("utf-8"))
                raw_records = payload.get("result", {}).get("records", [])
                parsed: List[DWRMonitoringRecord] = []
                for item in raw_records:
                    dtw = item.get("gse_gwe")
                    mdate = item.get("msmt_date")
                    if dtw is None or not mdate:
                        continue
                    parsed.append(
                        DWRMonitoringRecord(
                            site_code=str(item.get("site_code", site_code)),
                            measurement_date=date.fromisoformat(str(mdate)[:10]),
                            depth_to_water_ft=float(dtw),
                            ground_surface_elevation_ft=float(item.get("gse") or 285.0),
                            quality_flag=str(item.get("wlm_qa_desc") or "GOOD"),
                        )
                    )
                if parsed:
                    return sorted(parsed, key=lambda r: r.measurement_date)
        except Exception:
            pass

        return [r for r in cls.REFERENCE_STATIONS if r.site_code == site_code]

    @classmethod
    def match_closest_monitoring_well(
        cls,
        well: WellProfile,
        candidate_records: Optional[Sequence[DWRMonitoringRecord]] = None,
    ) -> Tuple[str, List[DWRMonitoringRecord]]:
        """
        Matches the audited WellProfile to the closest DWR monitoring well by Haversine
        distance (or subbasin name fallback) and returns (site_code, chronologically_sorted_records).
        """
        pool = list(candidate_records) if candidate_records else list(cls.REFERENCE_STATIONS)
        if not pool:
            pool = list(cls.REFERENCE_STATIONS)

        by_site: Dict[str, List[DWRMonitoringRecord]] = {}
        for rec in pool:
            if rec.quality_flag.upper() not in ("QUESTIONABLE", "BAD", "REJECTED"):
                by_site.setdefault(rec.site_code, []).append(rec)

        if not by_site:
            by_site.setdefault(pool[0].site_code, []).extend(pool)

        best_site: Optional[str] = None
        best_dist = float("inf")

        for site_code, site_recs in by_site.items():
            sample = site_recs[0]
            if sample.latitude is not None and sample.longitude is not None:
                dist = cls.haversine_miles(
                    well.latitude, well.longitude, sample.latitude, sample.longitude
                )
                if dist < best_dist:
                    best_dist = dist
                    best_site = site_code
            elif sample.basin_name and sample.basin_name.lower() in well.subbasin.lower():
                if best_site is None:
                    best_site = site_code

        if best_site is None:
            best_site = next(iter(by_site.keys()))

        matched_records = sorted(by_site[best_site], key=lambda r: r.measurement_date)
        return best_site, matched_records

    @classmethod
    def interpolate_seasonal_swl_vector(
        cls,
        interval_timestamps: Sequence[datetime],
        monitoring_records: Sequence[DWRMonitoringRecord],
        fallback_swl_ft: float,
    ) -> np.ndarray:
        """
        Vectorized piece-wise linear interpolation of Static Water Level (SWL) across
        the irrigation season (April through October) from Spring and Fall DWR soundings.
        Uses NumPy `np.interp` on ordinal timestamps for O(N) performance over 35,000+ intervals.
        """
        n = len(interval_timestamps)
        if n == 0:
            return np.array([], dtype=np.float64)

        if not monitoring_records:
            return np.full(n, fallback_swl_ft, dtype=np.float64)

        sorted_recs = sorted(monitoring_records, key=lambda r: r.measurement_date)
        if len(sorted_recs) == 1:
            return np.full(n, sorted_recs[0].depth_to_water_ft, dtype=np.float64)

        # Convert monitoring dates to epoch seconds at noon Pacific Time
        anchor_epochs = np.array(
            [
                datetime.combine(r.measurement_date, time(12, 0), tzinfo=PACIFIC_TZ).timestamp()
                for r in sorted_recs
            ],
            dtype=np.float64,
        )
        anchor_depths = np.array(
            [r.depth_to_water_ft for r in sorted_recs],
            dtype=np.float64,
        )

        query_epochs = np.array(
            [ts.timestamp() for ts in interval_timestamps],
            dtype=np.float64,
        )

        # np.interp clamps values outside [anchor_epochs[0], anchor_epochs[-1]] to boundary soundings
        interpolated_swl = np.interp(query_epochs, anchor_epochs, anchor_depths)
        return np.round(interpolated_swl, 3)
