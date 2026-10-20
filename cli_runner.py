#!/usr/bin/env python3
"""
SGMA Extraction Auditor & Water Ledger Engine
Module: cli_runner.py

Production CLI runner supporting:
  python cli_runner.py audit \
    --pge-csv ./data/pge_sample.csv \
    --well-config ./data/well_config.json \
    --land-iq-af 145.2 \
    --gsa-penalty-rate 185.00 \
    --output ./reports/audit_2026.html
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import List, Optional, Sequence

from anomaly_detection import ForensicAnomalyDetector
from audit_report import AuditReportGenerator
from hydraulics import HydraulicEngineA, HydraulicEngineB
from ingestion import DWRCasgemConnector, PGEGreenButtonParser
from schemas import DWRMonitoringRecord, WellProfile

try:
    import numpy as np
except ImportError:
    from _compat import NumpyShim as np  # type: ignore


def run_audit_pipeline(
    pge_file: Path,
    well_config_file: Path,
    land_iq_af: float,
    gsa_penalty_rate: float,
    output_path: Path,
    dwr_csv_file: Optional[Path] = None,
    engine: str = "A",
) -> int:
    """Executes the end-to-end deterministic SGMA forensic extraction audit pipeline."""
    if not well_config_file.exists():
        raise FileNotFoundError(f"Well config JSON not found: {well_config_file}")

    well_raw = json.loads(well_config_file.read_text(encoding="utf-8"))
    well = WellProfile.model_validate(well_raw)

    metadata, raw_intervals = PGEGreenButtonParser.parse_file(pge_file)

    candidate_dwr: Optional[List[DWRMonitoringRecord]] = None
    if dwr_csv_file is not None and dwr_csv_file.exists():
        candidate_dwr = DWRCasgemConnector.load_records_from_csv(dwr_csv_file)

    matched_site, dwr_records = DWRCasgemConnector.match_closest_monitoring_well(
        well=well,
        candidate_records=candidate_dwr,
    )

    timestamps = [r.interval_start for r in raw_intervals]
    swl_vector = DWRCasgemConnector.interpolate_seasonal_swl_vector(
        interval_timestamps=timestamps,
        monitoring_records=dwr_records,
        fallback_swl_ft=well.static_depth_to_water_ft,
    )

    kwh_vector = np.array([r.kwh for r in raw_intervals], dtype=np.float64)

    engine_choice = engine.strip().upper()
    if engine_choice == "B":
        hydraulics_res = HydraulicEngineB.evaluate_intervals(
            kwh_vector=kwh_vector,
            swl_ft_vector=swl_vector,
            well=well,
        )
        engine_label = "ENGINE_B_SCIPY_BRENTQ_NONLINEAR"
    else:
        hydraulics_res = HydraulicEngineA.evaluate_intervals(
            kwh_vector=kwh_vector,
            swl_ft_vector=swl_vector,
            well=well,
        )
        engine_label = "ENGINE_A_ALGEBRAIC"

    audit_batch = ForensicAnomalyDetector.audit_intervals(
        raw_intervals=raw_intervals,
        interpolated_swl_ft=swl_vector,
        hydraulics=hydraulics_res,
        well=well,
    )

    summary = AuditReportGenerator.build_reconciliation_summary(
        well=well,
        audit_batch=audit_batch,
        land_iq_billed_af=land_iq_af,
        gsa_penalty_rate_per_af=gsa_penalty_rate,
        dwr_site_code=matched_site,
        engine_mode=engine_label,
    )

    html_out, md_out = AuditReportGenerator.write_reports(
        well=well,
        summary=summary,
        output_html_path=output_path,
    )

    # Also write machine-readable JSON audit ledger alongside HTML report
    json_out = html_out.with_suffix(".json")
    json_out.write_text(summary.model_dump_json(indent=2), encoding="utf-8")

    print("=" * 78)
    print("SGMA EXTRACTION AUDITOR & WATER LEDGER ENGINE — AUDIT COMPLETE")
    print("=" * 78)
    print(f"Client / Grower       : {summary.client_id} (APN: {summary.apn})")
    print(f"Well ID / Subbasin    : {summary.well_id} — {summary.subbasin}")
    print(f"PG&E Meter / SAID     : {well.meter_id} / {well.service_agreement_id}")
    print(f"DWR Monitoring Site   : {summary.dwr_monitoring_site_used}")
    print(f"Hydraulic Solver      : {summary.engine_mode}")
    print(f"Intervals Audited     : {len(audit_batch.records):,} (15-minute revenue intervals)")
    print(f"Total Metered Energy  : {summary.total_kwh_consumed:,.2f} kWh")
    print(f"Forensic Exclusions   : {summary.phantom_af_prevented:.3f} AF excluded "
          f"(Suction Loss: {summary.broken_suction_intervals}, "
          f"Deadhead: {summary.deadhead_overload_intervals}, "
          f"Cycling: {summary.intermittent_cycling_intervals})")
    print("-" * 78)
    print(f"Audited Physical Lift : {summary.total_af_pumped:,.2f} AF "
          f"[Bracket: {summary.uncertainty_bracket_total.af_min:,.2f} – "
          f"{summary.uncertainty_bracket_total.af_max:,.2f} AF]")
    print(f"Land IQ Satellite ET  : {summary.land_iq_billed_af:,.2f} AF")
    print(f"Net Over-Estimation   : +{summary.net_discrepancy_af:,.2f} AF ({summary.discrepancy_pct:+.1f}%)")
    print(f"Contested GSA Penalty : ${summary.dollar_variance:,.2f} (@ ${summary.gsa_penalty_rate_per_af:,.2f}/AF)")
    print("-" * 78)
    print(f"HTML Rebuttal Packet  : {html_out}")
    print(f"Markdown Brief        : {md_out}")
    print(f"JSON Ledger Summary   : {json_out}")
    print("=" * 78)
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="cli_runner.py",
        description="SGMA Extraction Auditor & Water Ledger Engine CLI",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    audit_cmd = subparsers.add_parser(
        "audit",
        help="Run a deterministic hydraulic and forensic audit against PG&E interval data",
    )
    audit_cmd.add_argument(
        "--pge-csv",
        required=True,
        type=Path,
        help="Path to PG&E Green Button CSV or XML interval file",
    )
    audit_cmd.add_argument(
        "--well-config",
        required=True,
        type=Path,
        help="Path to WellProfile JSON configuration file",
    )
    audit_cmd.add_argument(
        "--land-iq-af",
        required=True,
        type=float,
        help="GSA Land IQ satellite ET billed volume in Acre-Feet (AF)",
    )
    audit_cmd.add_argument(
        "--gsa-penalty-rate",
        required=True,
        type=float,
        help="GSA Tier over-pumping penalty rate in $/AF",
    )
    audit_cmd.add_argument(
        "--output",
        required=True,
        type=Path,
        help="Output path for the generated HTML Evidentiary Rebuttal Packet",
    )
    audit_cmd.add_argument(
        "--dwr-csv",
        required=False,
        default=None,
        type=Path,
        help="Optional local DWR CASGEM groundwater level CSV file",
    )
    audit_cmd.add_argument(
        "--engine",
        required=False,
        default="A",
        choices=["A", "B", "a", "b"],
        help="Hydraulic calculation engine: 'A' (Algebraic Ledger) or 'B' (SciPy Brentq Non-Linear)",
    )
    return parser


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    if args.command == "audit":
        return run_audit_pipeline(
            pge_file=args.pge_csv,
            well_config_file=args.well_config,
            land_iq_af=args.land_iq_af,
            gsa_penalty_rate=args.gsa_penalty_rate,
            output_path=args.output,
            dwr_csv_file=args.dwr_csv,
            engine=args.engine,
        )
    return 1


if __name__ == "__main__":
    sys.exit(main())
