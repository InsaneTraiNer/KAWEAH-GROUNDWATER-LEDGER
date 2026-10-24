"""
SGMA Extraction Auditor & Water Ledger Engine
Module: test_auditor.py

Unit test suite validating Pydantic v2 schemas, PG&E Green Button CSV/XML ingestion,
DWR CASGEM seasonal SWL interpolation, Engine A (Algebraic) & Engine B (Brentq Non-Linear)
hydraulics, forensic anomaly detection, and GSA Evidentiary Rebuttal Packet generation.
"""

from __future__ import annotations

import unittest
from datetime import date, datetime
from pathlib import Path
from zoneinfo import ZoneInfo

try:
    import numpy as np
except ImportError:
    from _compat import NumpyShim as np  # type: ignore

from anomaly_detection import ForensicAnomalyDetector
from audit_report import AuditReportGenerator
from hydraulics import HydraulicEngineA, HydraulicEngineB
from ingestion import DWRCasgemConnector, PGEGreenButtonParser, RawEnergyInterval
from schemas import (
    DWRMonitoringRecord,
    EfficiencySource,
    IntervalStatus,
    OPETestMetadata,
    PumpCurveCoefficients,
    WellProfile,
)

PACIFIC_TZ = ZoneInfo("America/Los_Angeles")


class TestSGMAExtractionAuditor(unittest.TestCase):
    def setUp(self) -> None:
        self.well = WellProfile(
            client_id="VALLEY-HERITAGE-PISTACHIOS-LLC",
            apn="142-080-019",
            well_id="19S24E14M001M",
            subbasin="Kaweah Subbasin (5-022.11)",
            gsa_name="Greater Kaweah GSA",
            service_agreement_id="9482710455",
            meter_id="1008492031",
            latitude=36.2077,
            longitude=-119.3473,
            static_depth_to_water_ft=148.0,
            drawdown_ft=31.5,
            discharge_pressure_psi=28.0,
            friction_loss_ft=6.8,
            ope=0.61,
            efficiency_source=EfficiencySource.CERTIFIED_APET,
            ope_test_metadata=OPETestMetadata(
                test_date=date(2026, 2, 14),
                testing_agency="CSU Fresno CIT",
                technician_license_or_pe="CA-PE-M84912",
                measured_flow_gpm=1145.0,
                measured_tdh_ft=250.98,
                measured_kw_input=88.8,
                bowl_intake_depth_ft=265.0,
            ),
            min_operating_kw=52.0,
            max_operating_kw=118.0,
            pump_curve=PumpCurveCoefficients(),
        )

    def test_well_profile_validation_and_tdh(self) -> None:
        # Nominal TDH = 148.0 + 31.5 + (28.0 * 2.31) + 6.8 = 250.98 ft
        self.assertAlmostEqual(self.well.nominal_tdh_ft, 250.98, places=2)

        with self.assertRaises(ValueError):
            WellProfile(
                client_id="INVALID-WELL",
                apn="142-080-019",
                well_id="W1",
                service_agreement_id="12345",
                meter_id="M123",
                static_depth_to_water_ft=100.0,
                drawdown_ft=20.0,
                discharge_pressure_psi=20.0,
                friction_loss_ft=5.0,
                ope=0.95,  # Exceeds 0.85 max physical bound
                efficiency_source=EfficiencySource.MANUFACTURER_DEFAULT,
                min_operating_kw=40.0,
                max_operating_kw=90.0,
            )

    def test_pge_csv_and_xml_ingestion(self) -> None:
        meta_csv, intervals_csv = PGEGreenButtonParser.parse_file(Path("./data/pge_sample.csv"))
        self.assertEqual(meta_csv.get("Service Agreement ID"), "9482710455")
        self.assertGreater(len(intervals_csv), 100)
        self.assertIsNotNone(intervals_csv[0].interval_start.tzinfo)

        meta_xml, intervals_xml = PGEGreenButtonParser.parse_file(Path("./data/pge_sample.xml"))
        self.assertEqual(len(intervals_xml), 4)
        self.assertAlmostEqual(intervals_xml[0].kwh, 22.15, places=2)

    def test_dwr_casgem_matching_and_interpolation(self) -> None:
        site_code, recs = DWRCasgemConnector.match_closest_monitoring_well(self.well)
        self.assertEqual(site_code, "362077N1193473W001")
        self.assertGreaterEqual(len(recs), 2)

        ts = [
            datetime(2026, 3, 18, 12, 0, tzinfo=PACIFIC_TZ),
            datetime(2026, 7, 15, 12, 0, tzinfo=PACIFIC_TZ),
            datetime(2026, 10, 22, 12, 0, tzinfo=PACIFIC_TZ),
        ]
        swl_vec = DWRCasgemConnector.interpolate_seasonal_swl_vector(ts, recs, 148.0)
        self.assertAlmostEqual(float(swl_vec[0]), 142.4, places=1)
        self.assertAlmostEqual(float(swl_vec[2]), 169.8, places=1)
        self.assertTrue(float(swl_vec[0]) < float(swl_vec[1]) < float(swl_vec[2]))

    def test_engine_a_and_engine_b_hydraulics(self) -> None:
        kwh_vec = np.array([22.2, 5.1, 31.8, 0.0], dtype=float)
        swl_vec = np.array([148.0, 148.0, 148.0, 148.0], dtype=float)

        res_a = HydraulicEngineA.evaluate_intervals(kwh_vec, swl_vec, self.well)
        # At TDH=250.98 and OPE=0.61: kWh/AF = (1.024 * 250.98) / 0.61 = 421.3174
        self.assertAlmostEqual(float(res_a.kwh_per_af[0]), 421.3174, places=3)
        self.assertAlmostEqual(float(res_a.raw_af[0]), 22.2 / 421.3174, places=5)
        self.assertLess(float(res_a.af_min_tier2[0]), float(res_a.af_expected_tier3[0]))
        self.assertGreater(float(res_a.af_max_tier1[0]), float(res_a.af_expected_tier3[0]))

        res_b = HydraulicEngineB.evaluate_intervals(kwh_vec, swl_vec, self.well)
        self.assertEqual(res_b.solver_flags[0], "BRENTQ_CONVERGED")
        self.assertGreater(float(res_b.flow_gpm[0]), 900.0)
        self.assertEqual(res_b.solver_flags[1], "SUB_IDLE_NO_LIFT")
        self.assertEqual(res_b.solver_flags[2], "OVERLOAD_OR_DEADHEAD_FAULT")
        self.assertEqual(res_b.solver_flags[3], "ZERO_LOAD")

    def test_forensic_anomaly_detection_and_report(self) -> None:
        _, raw_intervals = PGEGreenButtonParser.parse_file(Path("./data/pge_sample.csv"))
        _, dwr_recs = DWRCasgemConnector.match_closest_monitoring_well(self.well)
        ts = [r.interval_start for r in raw_intervals]
        swl_vec = DWRCasgemConnector.interpolate_seasonal_swl_vector(ts, dwr_recs, 148.0)
        kwh_vec = np.array([r.kwh for r in raw_intervals], dtype=float)
        hyd = HydraulicEngineA.evaluate_intervals(kwh_vec, swl_vec, self.well)

        batch = ForensicAnomalyDetector.audit_intervals(raw_intervals, swl_vec, hyd, self.well)
        self.assertGreater(batch.broken_suction_count, 0)
        self.assertGreater(batch.deadhead_overload_count, 0)
        self.assertGreater(batch.intermittent_cycling_count, 0)
        self.assertGreater(batch.phantom_af_prevented, 0.0)

        summary = AuditReportGenerator.build_reconciliation_summary(
            well=self.well,
            audit_batch=batch,
            land_iq_billed_af=145.2,
            gsa_penalty_rate_per_af=185.0,
        )
        self.assertGreater(summary.net_discrepancy_af, 30.0)
        self.assertGreater(summary.dollar_variance, 5000.0)

        md = AuditReportGenerator.render_markdown_rebuttal(self.well, summary)
        self.assertIn("ADMINISTRATIVE EVIDENTIARY REBUTTAL", md)
        self.assertIn("California Evidence Code", md)

    def test_adversarial_pge_formats_and_hourly_intervals(self) -> None:
        # Test quoted CSV cells, US slash dates (M/D/YYYY), 12-hour AM/PM times, and 60-min hourly intervals
        adversarial_csv = '''"Account Name","HERFURTH FAMILY FARMS"
"Service Agreement","9988776655"

"TYPE","INTERVAL DATE","START TIME","END TIME","USAGE (kWh)","COST ($)","NOTES"
"Electric Usage","4/4/2026","4:00 AM","5:00 AM","88.80","$18.65","Steady hourly block, north valve"
"Electric Usage","4/4/2026","5:00 AM","6:00 AM","89.20","$18.73","Steady hourly block, north valve"
"Electric Usage","4/4/2026","6:00 AM","7:00 AM","88.40","$18.56","Steady hourly block, north valve"
'''
        meta, intervals = PGEGreenButtonParser.parse_csv_string(adversarial_csv)
        self.assertEqual(len(intervals), 3)
        self.assertAlmostEqual(intervals[0].duration_hours, 1.0, places=3)
        # 88.80 kWh over 1.0 hour = 88.80 kW (NOT 355.2 kW!)
        self.assertAlmostEqual(intervals[0].kw_demand, 88.80, places=2)


if __name__ == "__main__":
    unittest.main()
