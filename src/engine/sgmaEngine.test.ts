import test from 'node:test';
import assert from 'node:assert/strict';
import {
  brentqSolver,
  computeTDH,
  EfficiencySource,
  IntervalStatus,
  parsePGEGreenButtonCSV,
  runCompleteSGMAAudit,
  solveEngineBInterval,
  type WellProfile,
  type DWRMonitoringRecord,
} from './sgmaEngine.ts';

const SAMPLE_WELL: WellProfile = {
  client_id: 'VALLEY-HERITAGE-PISTACHIOS-LLC',
  apn: '142-080-019',
  well_id: '19S24E14M001M',
  subbasin: 'Kaweah Subbasin (5-022.11)',
  gsa_name: 'Greater Kaweah GSA',
  service_agreement_id: '9482710455',
  meter_id: '1008492031',
  latitude: 36.2077,
  longitude: -119.3473,
  static_depth_to_water_ft: 148.0,
  drawdown_ft: 31.5,
  discharge_pressure_psi: 28.0,
  friction_loss_ft: 6.8,
  ope: 0.61,
  efficiency_source: EfficiencySource.CERTIFIED_APET,
  ope_test_metadata: {
    test_date: '2026-02-14',
    testing_agency: 'CSU Fresno CIT',
    technician_license_or_pe: 'CA-PE-M84912',
    measured_flow_gpm: 1145.0,
    measured_tdh_ft: 250.98,
    measured_kw_input: 88.8,
    bowl_intake_depth_ft: 265.0,
  },
  min_operating_kw: 52.0,
  max_operating_kw: 118.0,
  pump_curve: {
    head_a: -0.0000485,
    head_b: -0.012,
    head_c: 345.0,
    eff_a: -0.00000052,
    eff_b: 0.00118,
    eff_c: 0.05,
    max_flow_gpm: 2200.0,
  },
};

const SAMPLE_DWR: DWRMonitoringRecord[] = [
  {
    site_code: '362077N1193473W001',
    measurement_date: '2026-03-18',
    depth_to_water_ft: 148.0,
    ground_surface_elevation_ft: 288.0,
    quality_flag: 'GOOD',
    latitude: 36.2077,
    longitude: -119.3473,
    basin_name: 'Kaweah Subbasin (5-022.11)',
  },
  {
    site_code: '362077N1193473W001',
    measurement_date: '2026-10-22',
    depth_to_water_ft: 172.0,
    ground_surface_elevation_ft: 288.0,
    quality_flag: 'GOOD',
    latitude: 36.2077,
    longitude: -119.473,
    basin_name: 'Kaweah Subbasin (5-022.11)',
  },
];

test('computeTDH calculates exact Total Dynamic Head', () => {
  const tdh = computeTDH(148.0, 31.5, 28.0, 6.8);
  assert.equal(Number(tdh.toFixed(2)), 250.98);
});

test('brentqSolver converges accurately on non-linear polynomial roots', () => {
  const root = brentqSolver((x) => x * x - 144, 0, 20, 1e-6);
  assert.ok(Math.abs(root - 12.0) < 1e-4);
});

test('solveEngineBInterval converges for normal load and flags sub-idle and deadhead', () => {
  const normal = solveEngineBInterval(88.8, 148.0, SAMPLE_WELL);
  assert.equal(normal.flag, 'BRENTQ_CONVERGED');
  assert.ok(normal.flow_gpm > 900 && normal.flow_gpm < 1500);

  const subIdle = solveEngineBInterval(18.0, 148.0, SAMPLE_WELL);
  assert.equal(subIdle.flag, 'SUB_IDLE_NO_LIFT');
  assert.equal(subIdle.flow_gpm, 0);

  const deadhead = solveEngineBInterval(128.0, 148.0, SAMPLE_WELL);
  assert.equal(deadhead.flag, 'OVERLOAD_OR_DEADHEAD_FAULT');
  assert.equal(deadhead.flow_gpm, 0);
});

test('parsePGEGreenButtonCSV and runCompleteSGMAAudit isolate forensic anomalies', () => {
  const csv = `Name,VALLEY HERITAGE PISTACHIOS LLC
Service Agreement ID,9482710455
Meter Number,1008492031

TYPE,DATE,START TIME,END TIME,USAGE (kWh),COST,NOTES
Electric usage,2026-05-11,08:00,08:15,22.40,$4.48,Normal irrigation
Electric usage,2026-05-11,08:15,08:30,22.50,$4.50,Normal irrigation
Electric usage,2026-05-11,08:30,08:45,5.20,$1.04,Broken suction
Electric usage,2026-05-11,08:45,09:00,31.60,$6.32,Closed valve deadhead`;

  const parsed = parsePGEGreenButtonCSV(csv);
  assert.equal(parsed.metadata['Service Agreement ID'], '9482710455');
  assert.equal(parsed.intervals.length, 4);

  const audit = runCompleteSGMAAudit({
    well: SAMPLE_WELL,
    rawIntervals: parsed.intervals,
    dwrCatalog: SAMPLE_DWR,
    landIqBilledAf: 1.0,
    gsaPenaltyRatePerAf: 185.0,
    engineMode: 'ENGINE_A_ALGEBRAIC',
  });

  assert.equal(audit.records[0].status, IntervalStatus.NORMAL);
  assert.equal(audit.records[2].status, IntervalStatus.SUSPECT_SUCTION_LOSS_OR_IDLE);
  assert.equal(audit.records[2].calculated_af, 0);
  assert.equal(audit.records[3].status, IntervalStatus.OVERLOAD_OR_DEADHEAD);
  assert.equal(audit.records[3].calculated_af, 0);
  assert.equal(audit.summary.broken_suction_intervals, 1);
  assert.equal(audit.summary.deadhead_overload_intervals, 1);
  assert.ok(audit.summary.phantom_af_prevented > 0.05);
});
