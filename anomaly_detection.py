"""
SGMA Extraction Auditor & Water Ledger Engine
Module: anomaly_detection.py

Forensic time-series filter that scans 15-minute PG&E SmartMeter electrical intervals
and hydraulic states to detect and isolate non-pumping electrical consumption:
1. Broken Suction / Unloaded Motor (`SUSPECT_SUCTION_LOSS_OR_IDLE`):
   - Motor energized with non-zero demand (e.g., > 1.5 kW auxiliary threshold) but below
     `well.min_operating_kw`, OR dynamic pumping water level (SWL + Drawdown) drops below
     the physical pump bowl intake depth (`bowl_intake_depth_ft`), causing cavitation / lost prime.
2. Overload / Closed-Valve Deadhead (`OVERLOAD_OR_DEADHEAD`):
   - Power demand spikes above `well.max_operating_kw` or hydraulic solver flags shutoff head
     exceeded, indicating pump operating against a closed manifold valve, plugged sand media
     filter, or electrical fault with zero net discharge to the field.
3. Intermittent Short-Cycling (`INTERMITTENT_CYCLING`):
   - Rapid on/off motor starts within a rolling window (e.g., isolated 15-minute blips or
     >= 4 state transitions inside a 90-minute rolling window with low load factor) where
     column pipe fill/drain cycles prevent steady-state check-valve discharge.

Flagged intervals have their billable extraction zeroed (`calculated_af = 0.0`, `gallons = 0.0`,
`flow_gpm = 0.0`) while preserving `raw_unfiltered_af` so the audit ledger proves exact
phantom water prevented.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import List, Sequence

try:
    import numpy as np
except ImportError:
    from _compat import NumpyShim as np  # type: ignore

from hydraulics import VectorizedHydraulicResult
from ingestion import RawEnergyInterval
from schemas import (
    IntervalAuditRecord,
    IntervalStatus,
    UncertaintyBracket,
    WellProfile,
)


@dataclass(frozen=True)
class ForensicAuditBatch:
    """Complete result of applying the forensic anomaly filter to an interval series."""
    records: List[IntervalAuditRecord]
    broken_suction_count: int
    deadhead_overload_count: int
    intermittent_cycling_count: int
    phantom_af_prevented: float


class ForensicAnomalyDetector:
    """
    Vectorized forensic time-series anomaly filter for agricultural groundwater wells.
    """

    AUXILIARY_NOISE_KW_FLOOR: float = 1.0  # Below 1.0 kW is transformer/panel parasitic load

    @classmethod
    def audit_intervals(
        cls,
        raw_intervals: Sequence[RawEnergyInterval],
        interpolated_swl_ft: np.ndarray,
        hydraulics: VectorizedHydraulicResult,
        well: WellProfile,
    ) -> ForensicAuditBatch:
        """
        Scans all 15-minute intervals, classifies operational anomalies, zeroes phantom
        extraction on faulted intervals, and builds validated `IntervalAuditRecord` objects.
        """
        n = len(raw_intervals)
        if n == 0:
            return ForensicAuditBatch(
                records=[],
                broken_suction_count=0,
                deadhead_overload_count=0,
                intermittent_cycling_count=0,
                phantom_af_prevented=0.0,
            )

        kwh_arr = np.array([r.kwh for r in raw_intervals], dtype=np.float64)
        kw_arr = np.array([r.kw_demand for r in raw_intervals], dtype=np.float64)

        bowl_depth_ft = (
            well.ope_test_metadata.bowl_intake_depth_ft
            if well.ope_test_metadata is not None
            else max(500.0, well.static_depth_to_water_ft + well.drawdown_ft + 50.0)
        )
        pumping_water_level_ft = interpolated_swl_ft + well.drawdown_ft

        # 1. Identify energized intervals (above parasitic panel standby load)
        is_energized = kw_arr >= cls.AUXILIARY_NOISE_KW_FLOOR

        # 2. Broken Suction / Idle detection:
        #    (a) Energized motor running below min_operating_kw, OR
        #    (b) Pumping water level drawn below physical bowl intake depth
        is_broken_suction = is_energized & (
            (kw_arr < well.min_operating_kw) | (pumping_water_level_ft >= bowl_depth_ft)
        )

        # 3. Deadhead / Overload detection:
        #    Demand exceeds max_operating_kw OR Engine B flagged shutoff head exceeded
        solver_shutoff = np.array(
            [flag in ("SHUTOFF_HEAD_EXCEEDED_ZERO_FLOW", "OVERLOAD_OR_DEADHEAD_FAULT") for flag in hydraulics.solver_flags],
            dtype=bool,
        )
        is_deadhead = is_energized & ((kw_arr > well.max_operating_kw) | solver_shutoff)

        # 4. Intermittent Cycling detection:
        #    Only flag short, non-sustained active runs (run_length <= 2 consecutive intervals)
        #    surrounded by rapid on/off transitions within a continuous timestamp window, or
        #    isolated sub-nominal blips (< 75% of mid operating kW). Never strip intervals from
        #    a sustained (>= 3 intervals) steady-state irrigation block.
        normal_load_candidate = is_energized & (~is_broken_suction) & (~is_deadhead)
        state_bool = [bool(normal_load_candidate[idx]) for idx in range(n)]
        epochs = [r.interval_start.timestamp() for r in raw_intervals]
        durs = [r.duration_hours * 3600.0 for r in raw_intervals]

        # Compute contiguous active run length for each interval respecting timestamp continuity
        run_lengths = [0] * n
        idx_start = 0
        while idx_start < n:
            if not state_bool[idx_start]:
                idx_start += 1
                continue
            idx_end = idx_start
            while (
                idx_end + 1 < n
                and state_bool[idx_end + 1]
                and (epochs[idx_end + 1] - epochs[idx_end]) <= durs[idx_end] * 1.6
            ):
                idx_end += 1
            length = idx_end - idx_start + 1
            for k in range(idx_start, idx_end + 1):
                run_lengths[k] = length
            idx_start = idx_end + 1

        transitions = [0] * n
        for idx in range(1, n):
            if (epochs[idx] - epochs[idx - 1]) <= durs[idx - 1] * 2.5:
                if state_bool[idx] != state_bool[idx - 1]:
                    transitions[idx] = 1

        nominal_mid_kw = 0.5 * (well.min_operating_kw + well.max_operating_kw)
        is_cycling = [False] * n
        for idx in range(n):
            if not state_bool[idx] or run_lengths[idx] >= 3:
                continue
            win_trans = 0
            for w in range(max(0, idx - 2), min(n, idx + 4)):
                if abs(epochs[w] - epochs[idx]) <= 5400.0:
                    win_trans += transitions[w]
            isolated_blip = run_lengths[idx] == 1 and float(kw_arr[idx]) < 0.78 * nominal_mid_kw
            if win_trans >= 3 or isolated_blip:
                is_cycling[idx] = True

        records: List[IntervalAuditRecord] = []
        broken_suction_count = 0
        deadhead_count = 0
        cycling_count = 0
        phantom_af_prevented = 0.0

        for i in range(n):
            raw_af = float(hydraulics.raw_af[i])
            kw_val = float(kw_arr[i])

            if not is_energized[i]:
                # Idle / off standby
                status = IntervalStatus.NORMAL
                calc_af = 0.0
                gal = 0.0
                gpm = 0.0
                bracket = UncertaintyBracket(af_min=0.0, af_expected=0.0, af_max=0.0)
            elif is_deadhead[i]:
                status = IntervalStatus.OVERLOAD_OR_DEADHEAD
                deadhead_count += 1
                phantom_af_prevented += raw_af
                calc_af = 0.0
                gal = 0.0
                gpm = 0.0
                bracket = UncertaintyBracket(af_min=0.0, af_expected=0.0, af_max=0.0)
            elif is_broken_suction[i]:
                status = IntervalStatus.SUSPECT_SUCTION_LOSS_OR_IDLE
                broken_suction_count += 1
                phantom_af_prevented += raw_af
                calc_af = 0.0
                gal = 0.0
                gpm = 0.0
                bracket = UncertaintyBracket(af_min=0.0, af_expected=0.0, af_max=0.0)
            elif is_cycling[i]:
                status = IntervalStatus.INTERMITTENT_CYCLING
                cycling_count += 1
                phantom_af_prevented += raw_af
                calc_af = 0.0
                gal = 0.0
                gpm = 0.0
                bracket = UncertaintyBracket(af_min=0.0, af_expected=0.0, af_max=0.0)
            else:
                status = IntervalStatus.NORMAL
                calc_af = raw_af
                gal = float(hydraulics.gallons[i])
                gpm = float(hydraulics.flow_gpm[i])
                bracket = UncertaintyBracket(
                    af_min=float(hydraulics.af_min_tier2[i]),
                    af_expected=calc_af,
                    af_max=float(hydraulics.af_max_tier1[i]),
                )

            records.append(
                IntervalAuditRecord(
                    interval_start=raw_intervals[i].interval_start,
                    interval_end=raw_intervals[i].interval_end,
                    kwh=round(float(kwh_arr[i]), 4),
                    kw_demand=round(kw_val, 3),
                    interpolated_swl_ft=float(interpolated_swl_ft[i]),
                    tdh_ft=float(hydraulics.tdh_ft[i]),
                    kwh_per_af=float(hydraulics.kwh_per_af[i]),
                    calculated_af=round(calc_af, 6),
                    raw_unfiltered_af=round(raw_af, 6),
                    gallons=round(gal, 2),
                    flow_gpm=round(gpm, 2),
                    status=status,
                    uncertainty_bracket=bracket,
                )
            )

        return ForensicAuditBatch(
            records=records,
            broken_suction_count=broken_suction_count,
            deadhead_overload_count=deadhead_count,
            intermittent_cycling_count=cycling_count,
            phantom_af_prevented=round(phantom_af_prevented, 4),
        )
