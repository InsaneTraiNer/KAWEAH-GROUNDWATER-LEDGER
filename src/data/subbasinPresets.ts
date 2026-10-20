import {
  DWRMonitoringRecord,
  EfficiencySource,
  GSAReconciliationSummary,
  RawEnergyInterval,
  WellProfile,
} from '../engine/sgmaEngine';

export interface SubbasinPreset {
  id: string;
  label: string;
  shortName: string;
  well: WellProfile;
  landIqBilledAf: number;
  gsaPenaltyRatePerAf: number;
}

export const DWR_CASGEM_CATALOG: DWRMonitoringRecord[] = [
  // Kaweah Subbasin (5-022.11)
  {
    site_code: '362077N1193473W001',
    measurement_date: '2026-03-18',
    depth_to_water_ft: 142.4,
    ground_surface_elevation_ft: 288.0,
    quality_flag: 'GOOD',
    latitude: 36.2077,
    longitude: -119.3473,
    basin_name: 'Kaweah Subbasin (5-022.11)',
  },
  {
    site_code: '362077N1193473W001',
    measurement_date: '2026-05-15',
    depth_to_water_ft: 149.2,
    ground_surface_elevation_ft: 288.0,
    quality_flag: 'GOOD',
    latitude: 36.2077,
    longitude: -119.3473,
    basin_name: 'Kaweah Subbasin (5-022.11)',
  },
  {
    site_code: '362077N1193473W001',
    measurement_date: '2026-07-15',
    depth_to_water_ft: 158.9,
    ground_surface_elevation_ft: 288.0,
    quality_flag: 'GOOD',
    latitude: 36.2077,
    longitude: -119.3473,
    basin_name: 'Kaweah Subbasin (5-022.11)',
  },
  {
    site_code: '362077N1193473W001',
    measurement_date: '2026-09-01',
    depth_to_water_ft: 165.4,
    ground_surface_elevation_ft: 288.0,
    quality_flag: 'GOOD',
    latitude: 36.2077,
    longitude: -119.3473,
    basin_name: 'Kaweah Subbasin (5-022.11)',
  },
  {
    site_code: '362077N1193473W001',
    measurement_date: '2026-10-22',
    depth_to_water_ft: 169.8,
    ground_surface_elevation_ft: 288.0,
    quality_flag: 'GOOD',
    latitude: 36.2077,
    longitude: -119.3473,
    basin_name: 'Kaweah Subbasin (5-022.11)',
  },
  // Tule Subbasin (5-022.13)
  {
    site_code: '360145N1192210W001',
    measurement_date: '2026-03-20',
    depth_to_water_ft: 198.0,
    ground_surface_elevation_ft: 264.5,
    quality_flag: 'GOOD',
    latitude: 36.0145,
    longitude: -119.2210,
    basin_name: 'Tule Subbasin (5-022.13)',
  },
  {
    site_code: '360145N1192210W001',
    measurement_date: '2026-06-18',
    depth_to_water_ft: 214.2,
    ground_surface_elevation_ft: 264.5,
    quality_flag: 'GOOD',
    latitude: 36.0145,
    longitude: -119.2210,
    basin_name: 'Tule Subbasin (5-022.13)',
  },
  {
    site_code: '360145N1192210W001',
    measurement_date: '2026-10-19',
    depth_to_water_ft: 231.5,
    ground_surface_elevation_ft: 264.5,
    quality_flag: 'GOOD',
    latitude: 36.0145,
    longitude: -119.2210,
    basin_name: 'Tule Subbasin (5-022.13)',
  },
  // Kings Subbasin (5-022.08)
  {
    site_code: '365812N1194520W001',
    measurement_date: '2026-03-15',
    depth_to_water_ft: 94.2,
    ground_surface_elevation_ft: 335.0,
    quality_flag: 'GOOD',
    latitude: 36.5812,
    longitude: -119.4520,
    basin_name: 'Kings Subbasin (5-022.08)',
  },
  {
    site_code: '365812N1194520W001',
    measurement_date: '2026-07-12',
    depth_to_water_ft: 106.5,
    ground_surface_elevation_ft: 335.0,
    quality_flag: 'GOOD',
    latitude: 36.5812,
    longitude: -119.4520,
    basin_name: 'Kings Subbasin (5-022.08)',
  },
  {
    site_code: '365812N1194520W001',
    measurement_date: '2026-10-18',
    depth_to_water_ft: 116.8,
    ground_surface_elevation_ft: 335.0,
    quality_flag: 'GOOD',
    latitude: 36.5812,
    longitude: -119.4520,
    basin_name: 'Kings Subbasin (5-022.08)',
  },
];

export const SUBBASIN_PRESETS: SubbasinPreset[] = [
  {
    id: 'kaweah',
    label: 'Kaweah Subbasin · Greater Kaweah GSA (APN 142-080-019)',
    shortName: 'Kaweah Subbasin',
    landIqBilledAf: 145.2,
    gsaPenaltyRatePerAf: 185.0,
    well: {
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
        testing_agency: 'CSU Fresno Center for Irrigation Technology (CIT)',
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
    },
  },
  {
    id: 'tule',
    label: 'Tule Subbasin · Lower Tule River ID GSA (APN 284-110-042)',
    shortName: 'Tule Subbasin',
    landIqBilledAf: 178.5,
    gsaPenaltyRatePerAf: 240.0,
    well: {
      client_id: 'SAN-JOAQUIN-CITRUS-PARTNERS',
      apn: '284-110-042',
      well_id: '21S25E08B002M',
      subbasin: 'Tule Subbasin (5-022.13)',
      gsa_name: 'Lower Tule River Irrigation District GSA',
      service_agreement_id: '8831049210',
      meter_id: '1009384112',
      latitude: 36.0145,
      longitude: -119.2210,
      static_depth_to_water_ft: 204.0,
      drawdown_ft: 38.0,
      discharge_pressure_psi: 34.0,
      friction_loss_ft: 8.4,
      ope: 0.58,
      efficiency_source: EfficiencySource.CERTIFIED_APET,
      ope_test_metadata: {
        test_date: '2026-01-29',
        testing_agency: 'PG&E Agricultural Pump Efficiency Program (APEP)',
        technician_license_or_pe: 'CA-PE-C77401',
        measured_flow_gpm: 980.0,
        measured_tdh_ft: 328.94,
        measured_kw_input: 104.8,
        bowl_intake_depth_ft: 310.0,
      },
      min_operating_kw: 62.0,
      max_operating_kw: 136.0,
      pump_curve: {
        head_a: -0.000055,
        head_b: -0.014,
        head_c: 420.0,
        eff_a: -0.00000058,
        eff_b: 0.00122,
        eff_c: 0.04,
        max_flow_gpm: 2000.0,
      },
    },
  },
  {
    id: 'kings',
    label: 'Kings Subbasin · North Kings GSA (APN 315-040-008)',
    shortName: 'Kings Subbasin',
    landIqBilledAf: 118.0,
    gsaPenaltyRatePerAf: 150.0,
    well: {
      client_id: 'ALTA-SIERRA-ALMOND-RANCHES-INC',
      apn: '315-040-008',
      well_id: '14S22E23F003M',
      subbasin: 'Kings Subbasin (5-022.08)',
      gsa_name: 'North Kings GSA',
      service_agreement_id: '7192830041',
      meter_id: '1004819205',
      latitude: 36.5812,
      longitude: -119.4520,
      static_depth_to_water_ft: 98.0,
      drawdown_ft: 22.0,
      discharge_pressure_psi: 24.0,
      friction_loss_ft: 5.2,
      ope: 0.64,
      efficiency_source: EfficiencySource.CERTIFIED_APET,
      ope_test_metadata: {
        test_date: '2026-03-04',
        testing_agency: 'CSU Fresno Center for Irrigation Technology (CIT)',
        technician_license_or_pe: 'CA-PE-M90114',
        measured_flow_gpm: 1320.0,
        measured_tdh_ft: 180.64,
        measured_kw_input: 70.2,
        bowl_intake_depth_ft: 210.0,
      },
      min_operating_kw: 42.0,
      max_operating_kw: 98.0,
      pump_curve: {
        head_a: -0.000038,
        head_b: -0.009,
        head_c: 265.0,
        eff_a: -0.00000046,
        eff_b: 0.00115,
        eff_c: 0.06,
        max_flow_gpm: 2400.0,
      },
    },
  },
];

/**
 * Generates the default seasonal 15-minute PG&E interval dataset (April–October 2026)
 * matching `./data/pge_sample.csv`
 */
export function generateDefaultPGEIntervals(): RawEnergyInterval[] {
  const monthlyDays: Array<[number, number[], number]> = [
    [4, [4, 11, 18, 25], 10],
    [5, [2, 9, 16, 17, 23, 30], 11],
    [6, [3, 7, 12, 17, 18, 22, 27], 13],
    [7, [2, 6, 10, 14, 18, 22, 26, 30], 15],
    [8, [1, 5, 9, 14, 18, 22, 27], 14],
    [9, [3, 10, 17, 24], 11],
    [10, [3, 10, 17], 9],
  ];

  const intervals: RawEnergyInterval[] = [];
  const pad2 = (n: number) => String(n).padStart(2, '0');

  for (const [month, days, hrs] of monthlyDays) {
    for (const day of days) {
      const count = hrs * 4;
      for (let i = 0; i < count; i++) {
        const totalMinStart = 4 * 60 + i * 15;
        const totalMinEnd = totalMinStart + 15;
        const sh = Math.floor(totalMinStart / 60);
        const sm = totalMinStart % 60;
        const eh = Math.floor(totalMinEnd / 60);
        const em = totalMinEnd % 60;

        const dateStr = `2026-${pad2(month)}-${pad2(day)}`;
        const startStr = `${pad2(sh)}:${pad2(sm)}`;
        const endStr = `${pad2(eh)}:${pad2(em)}`;

        const seasonalBump = (month - 4) * 0.24;
        const wave = 0.18 * Math.sin(i * 0.3 + day);
        let kwh = Number((22.1 + seasonalBump + wave).toFixed(2));
        let notes = 'Steady-state irrigation block';

        if (month === 5 && day === 17 && [20, 21, 22, 23].includes(i)) {
          kwh = 5.35;
          notes = 'Suspect broken suction / air entrainment';
        } else if (month === 6 && day === 18 && [32, 33, 34].includes(i)) {
          kwh = 31.65;
          notes = 'Closed manifold valve deadhead overload spike';
        } else if (month === 7 && day === 22 && [40, 41, 42, 43, 44, 45].includes(i)) {
          if (i % 2 === 0) {
            kwh = 0.05;
            notes = 'Pressure switch drop';
          } else {
            kwh = 14.25;
            notes = 'Short-cycle motor restart';
          }
        } else if (month === 8 && day === 14 && [50, 51, 52, 53].includes(i)) {
          kwh = 4.9;
          notes = 'Aquifer drawdown below bowl intake cavitation';
        } else if (month === 9 && day === 10 && [12, 13].includes(i)) {
          kwh = 32.1;
          notes = 'Sand media filter backwash valve deadhead';
        }

        const epochMs = Date.parse(`${dateStr}T${startStr}:00-07:00`);
        intervals.push({
          interval_start: `${dateStr} ${startStr} PDT`,
          interval_end: `${dateStr} ${endStr} PDT`,
          epoch_ms: epochMs,
          year_month: `2026-${pad2(month)}`,
          kwh,
          kw_demand: Number((kwh * 4.0).toFixed(2)),
          cost_usd: Number((kwh * 0.21).toFixed(2)),
          notes,
        });
      }
    }
  }

  return intervals;
}

/**
 * Generates standalone HTML Evidentiary Rebuttal Packet for export/print
 */
export function buildEvidentiaryHTMLDocument(
  well: WellProfile,
  summary: GSAReconciliationSummary
): string {
  const nominalTdh =
    well.static_depth_to_water_ft +
    well.drawdown_ft +
    well.discharge_pressure_psi * 2.31 +
    well.friction_loss_ft;
  const impliedOpe =
    ((1.024 * nominalTdh * summary.land_iq_billed_af) / Math.max(summary.total_kwh_consumed, 1)) *
    100;

  const rowsHtml = summary.monthly_breakdown
    .map(
      (m) => `
      <tr>
        <td class="mono">${m.year_month}</td>
        <td class="mono num">${m.active_pumping_hours.toFixed(2)}</td>
        <td class="mono num">${m.total_kwh.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
        <td class="mono num">${m.mean_tdh_ft.toFixed(1)}</td>
        <td class="mono num">${m.mean_flow_gpm.toLocaleString('en-US', { minimumFractionDigits: 1 })}</td>
        <td class="mono num">${m.anomalous_intervals_excluded} (${m.phantom_af_excluded.toFixed(3)} AF)</td>
        <td class="mono num strong">${m.verified_af.toFixed(3)}</td>
        <td class="mono num">[${m.tier2_regional_af.toFixed(3)} – ${m.tier1_mfg_ceiling_af.toFixed(3)}]</td>
      </tr>`
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>SGMA Evidentiary Rebuttal Packet — ${summary.client_id} (${summary.apn})</title>
  <style>
    body { font-family: "IBM Plex Sans", -apple-system, sans-serif; color: #0f172a; margin: 36px; line-height: 1.55; font-size: 13.5px; }
    .packet { max-width: 1020px; margin: 0 auto; border: 1px solid #cbd5e1; padding: 32px 38px; }
    h1 { font-size: 20px; margin: 4px 0 8px 0; }
    h2 { font-size: 14px; text-transform: uppercase; border-bottom: 1px solid #cbd5e1; padding-bottom: 6px; margin-top: 26px; }
    .mono { font-family: "IBM Plex Mono", monospace; font-variant-numeric: tabular-nums; }
    .num { text-align: right; }
    .strong { font-weight: 700; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 12px; }
    th, td { border: 1px solid #cbd5e1; padding: 7px 9px; text-align: left; }
    th { background: #f8fafc; }
  </style>
</head>
<body>
  <div class="packet">
    <div class="mono" style="font-size:11px;color:#475569;">ADMINISTRATIVE EVIDENTIARY REBUTTAL · CALIFORNIA WATER CODE § 10726.4 &amp; 23 CCR § 354.18</div>
    <h1>GROUNDWATER EXTRACTION FORENSIC AUDIT &amp; SATELLITE ET REBUTTAL</h1>
    <div>Jurisdiction: <strong>${summary.gsa_name}</strong> (${summary.subbasin}) · Grower: <span class="mono">${summary.client_id}</span> · APN: <span class="mono">${summary.apn}</span> · Well: <span class="mono">${summary.well_id}</span></div>
    <h2>I. Executive Reconciliation Summary</h2>
    <p>
      <strong>1. GSA Land IQ Remote-Sensing ET Billed:</strong> <span class="mono">${summary.land_iq_billed_af.toFixed(2)} AF</span><br/>
      <strong>2. Audited PG&amp;E Physical Extraction (${summary.engine_mode}):</strong> <span class="mono">${summary.total_af_pumped.toFixed(2)} AF</span> (Uncertainty Bracket: <span class="mono">[${summary.uncertainty_bracket_total.af_min.toFixed(2)} – ${summary.uncertainty_bracket_total.af_max.toFixed(2)} AF]</span>)<br/>
      <strong>3. Net Satellite Over-Estimation:</strong> <span class="mono">+${summary.net_discrepancy_af.toFixed(2)} AF (+${summary.discrepancy_pct.toFixed(1)}%)</span><br/>
      <strong>4. Contested GSA Tier Penalty Savings:</strong> <span class="mono">$${summary.dollar_variance.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span> (@ $${summary.gsa_penalty_rate_per_af.toFixed(2)}/AF)<br/>
      <strong>5. Implied OPE Required by Land IQ Estimate:</strong> <span class="mono">${impliedOpe.toFixed(1)}%</span> (Thermodynamically impossible vs certified OPE of ${(well.ope * 100).toFixed(1)}%)
    </p>
    <h2>II. Monthly Extraction Ledger</h2>
    <table>
      <thead>
        <tr>
          <th>Month</th><th class="num">Active Hrs</th><th class="num">Metered kWh</th><th class="num">Mean TDH (ft)</th><th class="num">Mean GPM</th><th class="num">Anomalies Excluded</th><th class="num">Audited AF</th><th class="num">Bracket [Tier 2 – Tier 1]</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>
    <h2>III. Statutory &amp; California Evidence Code Legal Brief</h2>
    <p>
      Pursuant to <strong>California Evidence Code §§ 640, 1271, and 1280</strong> and <strong>California Water Code § 10726.4</strong>,
      CPUC-regulated revenue-grade PG&amp;E 15-minute interval metering (Tariff Rule 17, ANSI C12.20 ±0.2% accuracy class, Meter <span class="mono">${well.meter_id}</span>)
      coupled with official DWR CASGEM physical groundwater soundings (Station <span class="mono">${summary.dwr_monitoring_site_used}</span>)
      constituently establish physical wellhead extraction and supersede uncalibrated satellite canopy evapotranspiration proxies (Land IQ SEBAL/METRIC),
      which conflate vadose-zone precipitation storage, capillary fringe uptake, cover crop transpiration, and surface water seepage with groundwater pumping.
    </p>
  </div>
</body>
</html>`;
}
