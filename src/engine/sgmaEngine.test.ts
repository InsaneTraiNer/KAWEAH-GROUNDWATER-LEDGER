import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeTDH,
  decodeSiteCodeCoords,
  EfficiencySource,
  GALLONS_PER_ACRE_FOOT,
  HYDRAULIC_KWH_CONSTANT,
  inferPlausibleKwBounds,
  IntervalStatus,
  parseDWRCasgemCSV,
  parsePGEDataFile,
  parsePGEGreenButtonCSV,
  runCompleteSGMAAudit,
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
  latitude: 36.1737,
  longitude: -119.4798,
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
};

const SAMPLE_DWR: DWRMonitoringRecord[] = [
  {
    site_code: '361737N1194798W003',
    measurement_date: '2026-03-15',
    depth_to_water_ft: 221.6,
    ground_surface_elevation_ft: 220.96,
    quality_flag: 'GOOD',
    latitude: 36.1737,
    longitude: -119.4798,
    basin_name: 'Kaweah Subbasin (5-022.11)',
    measurement_method: 'Electronic pressure transducer',
    monitoring_agency: 'Department of Water Resources / Mid-Kaweah GSA',
  },
  {
    site_code: '361737N1194798W003',
    measurement_date: '2026-07-15',
    depth_to_water_ft: 240.6,
    ground_surface_elevation_ft: 220.96,
    quality_flag: 'GOOD',
    latitude: 36.1737,
    longitude: -119.4798,
    basin_name: 'Kaweah Subbasin (5-022.11)',
    measurement_method: 'Electric sounder measurement',
    monitoring_agency: 'Department of Water Resources / Mid-Kaweah GSA',
  },
  {
    site_code: '361737N1194798W003',
    measurement_date: '2026-10-15',
    depth_to_water_ft: 237.4,
    ground_surface_elevation_ft: 220.96,
    quality_flag: 'GOOD',
    latitude: 36.1737,
    longitude: -119.4798,
    basin_name: 'Kaweah Subbasin (5-022.11)',
    measurement_method: 'Electronic pressure transducer',
    monitoring_agency: 'Department of Water Resources / Mid-Kaweah GSA',
  },
];

test('computeTDH and Engine A match published UC ANR / CSU Fresno CIT hydraulic benchmarks', () => {
  const tdh = computeTDH(148.0, 31.5, 28.0, 6.8);
  assert.equal(Number(tdh.toFixed(2)), 250.98);

  // Published UC ANR / CSU Fresno CIT benchmark: TDH = 400.85 ft, OPE = 0.60 -> 684.12 kWh/AF
  const benchmarkTdh = computeTDH(250.0, 45.0, 45.0, 1.9);
  assert.equal(Number(benchmarkTdh.toFixed(2)), 400.85);
  const benchmarkKwhPerAf = (HYDRAULIC_KWH_CONSTANT * benchmarkTdh) / 0.6;
  assert.ok(Math.abs(benchmarkKwhPerAf - 684.12) < 0.05);

  // 24 hours at 125.78 kW (3,018.72 kWh) -> 4.4126 AF (~1,000 GPM continuous)
  const af24h = 3018.72 / benchmarkKwhPerAf;
  const gpm24h = (af24h * GALLONS_PER_ACRE_FOOT) / 1440.0;
  assert.ok(Math.abs(gpm24h - 1000.0) < 2.0);
});

test('decodeSiteCodeCoords and parseDWRCasgemCSV extract official DWR coordinates and metadata', () => {
  const coords = decodeSiteCodeCoords('361737N1194798W003');
  assert.deepEqual(coords, { latitude: 36.1737, longitude: -119.4798 });

  const dwrCsv = `site_code,measurement_date,depth_to_water_ft,ground_surface_elevation_ft,quality_flag,basin_name,measurement_method,monitoring_agency
361737N1194798W003,2026-07-15,240.60,220.96,GOOD,Kaweah Subbasin (5-022.11),Electric sounder measurement,Department of Water Resources / Mid-Kaweah GSA`;
  const recs = parseDWRCasgemCSV(dwrCsv);
  assert.equal(recs.length, 1);
  assert.equal(recs[0].latitude, 36.1737);
  assert.equal(recs[0].longitude, -119.4798);
  assert.equal(recs[0].monitoring_agency, 'Department of Water Resources / Mid-Kaweah GSA');
});

test('parsePGEGreenButtonCSV and runCompleteSGMAAudit isolate forensic anomalies with Engine A', () => {
  const csv = `Name,VALLEY HERITAGE PISTACHIOS LLC
Service Agreement ID,9482710455
Meter Number,1008492031

TYPE,DATE,START TIME,END TIME,USAGE (kWh),COST,NOTES
Electric usage,2026-05-11,08:00,08:15,22.40,$4.48,Normal irrigation
Electric usage,2026-05-11,08:15,08:30,22.50,$4.50,Normal irrigation
Electric usage,2026-05-11,08:30,08:45,22.30,$4.46,Normal irrigation
Electric usage,2026-05-11,08:45,09:00,5.20,$1.04,Broken suction
Electric usage,2026-05-11,09:00,09:15,31.60,$6.32,Closed valve deadhead`;

  const parsed = parsePGEGreenButtonCSV(csv);
  assert.equal(parsed.metadata['Service Agreement ID'], '9482710455');
  assert.equal(parsed.intervals.length, 5);

  const audit = runCompleteSGMAAudit({
    well: SAMPLE_WELL,
    rawIntervals: parsed.intervals,
    dwrCatalog: SAMPLE_DWR,
    landIqBilledAf: 1.0,
    gsaPenaltyRatePerAf: 185.0,
  });

  assert.equal(audit.summary.engine_mode, 'ENGINE_A_ALGEBRAIC_LEDGER');
  assert.equal(audit.summary.dwr_monitoring_site_used, '361737N1194798W003');
  assert.equal(
    audit.summary.dwr_monitoring_agency,
    'Department of Water Resources / Mid-Kaweah GSA'
  );
  assert.equal(audit.records[0].status, IntervalStatus.NORMAL);
  assert.equal(audit.records[1].status, IntervalStatus.NORMAL);
  assert.equal(audit.records[2].status, IntervalStatus.NORMAL);
  assert.equal(audit.records[3].status, IntervalStatus.SUSPECT_SUCTION_LOSS_OR_IDLE);
  assert.equal(audit.records[3].calculated_af, 0);
  assert.equal(audit.records[4].status, IntervalStatus.OVERLOAD_OR_DEADHEAD);
  assert.equal(audit.records[4].calculated_af, 0);
  assert.equal(audit.summary.broken_suction_intervals, 1);
  assert.equal(audit.summary.deadhead_overload_intervals, 1);
  assert.ok(audit.summary.phantom_af_prevented > 0.05);
});

test('parsePGEDataFile handles quoted CSV cells, US slash dates, 12h AM/PM, and 60-minute hourly intervals', () => {
  const hourlyCsv = `"Name","HERFURTH FAMILY FARMS"
"Service Agreement ID","9988776655"

"TYPE","INTERVAL DATE","START TIME","END TIME","USAGE (kWh)","COST ($)","NOTES"
"Electric usage","4/4/2026","4:00 AM","5:00 AM","88.80","$18.65","North block, valve 1"
"Electric usage","4/4/2026","5:00 AM","6:00 AM","89.20","$18.73","North block, valve 1"
"Electric usage","4/4/2026","6:00 AM","7:00 AM","88.40","$18.56","North block, valve 1"`;

  const parsed = parsePGEDataFile(hourlyCsv);
  assert.equal(parsed.intervals.length, 3);
  assert.equal(parsed.intervals[0].year_month, '2026-04');
  assert.equal(parsed.intervals[0].duration_hours, 1.0);
  assert.equal(parsed.intervals[0].kw_demand, 88.8);

  const bounds = inferPlausibleKwBounds(parsed.intervals);
  assert.ok(bounds.recommendedMinKw < 88.8 && bounds.recommendedMaxKw > 89.2);

  const audit = runCompleteSGMAAudit({
    well: SAMPLE_WELL,
    rawIntervals: parsed.intervals,
    dwrCatalog: SAMPLE_DWR,
    landIqBilledAf: 1.5,
    gsaPenaltyRatePerAf: 185.0,
  });
  assert.equal(audit.summary.monthly_breakdown.length, 1);
  assert.equal(audit.summary.monthly_breakdown[0].active_pumping_hours, 3.0);
  assert.ok(audit.summary.total_af_pumped > 0.6);
});
