"""
SGMA Extraction Auditor & Water Ledger Engine
Module: hydraulics.py

Implements the deterministic physical hydraulic ledger (Engine A — Standard Evidentiary
Efficiency-Lift Algebraic Solver) recognized under California Water Code §§ 10725.2,
10726.4, and 10730.2, CSU Fresno Center for Irrigation Technology (CIT), PG&E
Agricultural Pump Efficiency Program (APEP), and UC Cooperative Extension (UC ANR):

    TDH (ft) = SWL(t) + Drawdown + (Discharge_PSI * 2.31) + Hf
    kWh/AF   = (1.024 * TDH) / OPE
    AF       = kWh / (kWh/AF)

With three-tier evidentiary uncertainty bracketing:
    - Tier 1 (Manufacturer Default Upper Bound): OPE = 0.68
    - Tier 2 (Regional Baseline Lower Bound):    OPE = 0.53
    - Tier 3 (Certified APET Expected Value):    WellProfile.ope
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import List

try:
    import numpy as np
except ImportError:
    from _compat import NumpyShim as np  # type: ignore

from schemas import WellProfile

GALLONS_PER_ACRE_FOOT: float = 325851.4285714286
HYDRAULIC_KWH_CONSTANT: float = 1.024  # 100% efficient kWh to lift 1 AF by 1 foot of head
PSI_TO_FEET_HEAD: float = 2.31         # Feet of water column per 1 PSI gauge pressure

TIER1_MANUFACTURER_OPE: float = 0.68
TIER2_REGIONAL_OPE: float = 0.53


@dataclass(frozen=True)
class VectorizedHydraulicResult:
    """Vectorized output arrays across all metered intervals."""
    tdh_ft: np.ndarray
    kwh_per_af: np.ndarray
    raw_af: np.ndarray
    gallons: np.ndarray
    flow_gpm: np.ndarray
    af_min_tier2: np.ndarray
    af_expected_tier3: np.ndarray
    af_max_tier1: np.ndarray
    solver_flags: List[str]


class HydraulicEngineA:
    """
    Engine A: Standard Evidentiary Efficiency-Lift Ledger (Vectorized Algebraic Solver).
    Computes Total Dynamic Head (TDH), Specific Energy (kWh/AF), Volumetric Extraction (AF & Gallons),
    and 3-Tier Evidentiary Uncertainty Brackets across all revenue-grade utility intervals.
    """

    @staticmethod
    def compute_tdh_vector(
        swl_ft_vector: np.ndarray,
        drawdown_ft: float,
        discharge_pressure_psi: float,
        friction_loss_ft: float,
    ) -> np.ndarray:
        """
        TDH = SWL + Drawdown + (Discharge PSI * 2.31) + Hf
        """
        pressure_head_ft = discharge_pressure_psi * PSI_TO_FEET_HEAD
        return swl_ft_vector + drawdown_ft + pressure_head_ft + friction_loss_ft

    @classmethod
    def evaluate_intervals(
        cls,
        kwh_vector: np.ndarray,
        swl_ft_vector: np.ndarray,
        well: WellProfile,
        interval_hours: float = 0.25,
    ) -> VectorizedHydraulicResult:
        """
        Vectorized evaluation of all intervals using Engine A algebraic formulas
        plus 3-tier uncertainty bracketing (OPE 0.53, Certified OPE, OPE 0.68).
        """
        tdh_ft = cls.compute_tdh_vector(
            swl_ft_vector=swl_ft_vector,
            drawdown_ft=well.drawdown_ft,
            discharge_pressure_psi=well.discharge_pressure_psi,
            friction_loss_ft=well.friction_loss_ft,
        )
        safe_tdh = np.maximum(tdh_ft, 1.0)

        # Specific Energy (kWh / AF) = (1.024 * TDH) / OPE
        kwh_per_af_certified = (HYDRAULIC_KWH_CONSTANT * safe_tdh) / well.ope
        kwh_per_af_tier1 = (HYDRAULIC_KWH_CONSTANT * safe_tdh) / TIER1_MANUFACTURER_OPE
        kwh_per_af_tier2 = (HYDRAULIC_KWH_CONSTANT * safe_tdh) / TIER2_REGIONAL_OPE

        af_certified = np.where(kwh_vector > 0.0, kwh_vector / kwh_per_af_certified, 0.0)
        af_tier1_raw = np.where(kwh_vector > 0.0, kwh_vector / kwh_per_af_tier1, 0.0)
        af_tier2_raw = np.where(kwh_vector > 0.0, kwh_vector / kwh_per_af_tier2, 0.0)

        # Ensure strict min <= expected <= max ordering even if well.ope is outside [0.53, 0.68]
        af_min = np.minimum(np.minimum(af_tier2_raw, af_certified), af_tier1_raw)
        af_max = np.maximum(np.maximum(af_tier1_raw, af_certified), af_tier2_raw)

        gallons = af_certified * GALLONS_PER_ACRE_FOOT
        interval_minutes = max(interval_hours * 60.0, 1.0)
        flow_gpm = np.where(kwh_vector > 0.0, gallons / interval_minutes, 0.0)

        flags = ["ALGEBRAIC_OK" if kwh > 0 else "ZERO_LOAD" for kwh in kwh_vector]

        return VectorizedHydraulicResult(
            tdh_ft=np.round(tdh_ft, 3),
            kwh_per_af=np.round(kwh_per_af_certified, 4),
            raw_af=np.round(af_certified, 6),
            gallons=np.round(gallons, 2),
            flow_gpm=np.round(flow_gpm, 2),
            af_min_tier2=np.round(af_min, 6),
            af_expected_tier3=np.round(af_certified, 6),
            af_max_tier1=np.round(af_max, 6),
            solver_flags=flags,
        )
