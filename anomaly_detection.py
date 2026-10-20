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
            else 500.0
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
        #    Detect rapid on/off state transitions in a 6-interval (90-minute) rolling window
        #    or isolated single-interval fractional starts (< 65% of nominal operating kW)
        #    where column pipe fills and drains back down the well column without sustained delivery.
        normal_load_candidate = is_energized & (~is_broken_suction) & (~is_deadhead)
        state_binary = normal_load_candidate.astype(np.int32)
        transitions = np.abs(np.diff(state_binary, prepend=state_binary[0]))

        # Rolling sum of transitions over 6 intervals (90 minutes)
        window_size = 6
        if n >= window_size:
            kernel = np.ones(window_size, dtype=np.int32)
            rolling_transitions = np.convolve(transitions, kernel, mode="same")
        else:
            rolling_transitions = transitions

        # Isolated single-interval spike surrounded by off-states with partial load
        prev_off = np.roll(~normal_load_candidate, 1)
        prev_off[0] = True
        next_off = np.roll(~normal_load_candidate, -1)
        next_off[-1] = True
        isolated_single_interval = normal_load_candidate & prev_off & next_off

        nominal_mid_kw = 0.5 * (well.min_operating_kw + well.max_operating_kw)
        is_cycling = (
            normal_load_candidate
            & (
                (rolling_transitions >= 3)
                | (isolated_single_interval & (kw_arr < 0.72 * nominal_mid_kw))
            )
        )

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
