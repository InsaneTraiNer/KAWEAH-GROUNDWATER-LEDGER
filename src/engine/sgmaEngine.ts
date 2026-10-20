/**
 * SGMA Extraction Auditor & Water Ledger Engine
 * Pure TypeScript Deterministic Hydraulic, Forensic & Rebuttal Engine
 * Mirrors the production Python modules (schemas.py, ingestion.py, hydraulics.py,
 * anomaly_detection.py, audit_report.py) with 1:1 mathematical parity.
 */

export const EfficiencySource = {
  MANUFACTURER_DEFAULT: 'MANUFACTURER_DEFAULT',
  REGIONAL_ESTIMATE: 'REGIONAL_ESTIMATE',
  CERTIFIED_APET: 'CERTIFIED_APET',
} as const;
export type EfficiencySource = (typeof EfficiencySource)[keyof typeof EfficiencySource];

export const IntervalStatus = {
  NORMAL: 'NORMAL',
  SUSPECT_SUCTION_LOSS_OR_IDLE: 'SUSPECT_SUCTION_LOSS_OR_IDLE',
  OVERLOAD_OR_DEADHEAD: 'OVERLOAD_OR_DEADHEAD',
  INTERMITTENT_CYCLING: 'INTERMITTENT_CYCLING',
} as const;
export type IntervalStatus = (typeof IntervalStatus)[keyof typeof IntervalStatus];

export interface PumpCurveCoefficients {
  head_a: number;
  head_b: number;
  head_c: number;
  eff_a: number;
  eff_b: number;
  eff_c: number;
  max_flow_gpm: number;
}

export interface OPETestMetadata {
  test_date: string;
  testing_agency: string;
  technician_license_or_pe: string;
  measured_flow_gpm: number;
  measured_tdh_ft: number;
  measured_kw_input: number;
  bowl_intake_depth_ft: number;
}

export interface WellProfile {
  client_id: string;
  apn: string;
  well_id: string;
  subbasin: string;
  gsa_name: string;
  service_agreement_id: string;
  meter_id: string;
  latitude: number;
  longitude: number;
  static_depth_to_water_ft: number;
  drawdown_ft: number;
  discharge_pressure_psi: number;
  friction_loss_ft: number;
  ope: number;
  efficiency_source: EfficiencySource;
  ope_test_metadata?: OPETestMetadata;
  min_operating_kw: number;
  max_operating_kw: number;
  pump_curve: PumpCurveCoefficients;
}

export interface DWRMonitoringRecord {
  site_code: string;
  measurement_date: string;
  depth_to_water_ft: number;
  ground_surface_elevation_ft: number;
  quality_flag: string;
  latitude: number;
  longitude: number;
  basin_name: string;
}

export interface UncertaintyBracket {
  af_min: number;
  af_expected: number;
  af_max: number;
}

export interface RawEnergyInterval {
  interval_start: string;
  interval_end: string;
  epoch_ms: number;
  year_month: string;
  kwh: number;
  kw_demand: number;
  cost_usd?: number;
  notes?: string;
}

export interface IntervalAuditRecord {
  interval_start: string;
  interval_end: string;
  year_month: string;
  kwh: number;
  kw_demand: number;
  interpolated_swl_ft: number;
  tdh_ft: number;
  kwh_per_af: number;
  calculated_af: number;
  raw_unfiltered_af: number;
  gallons: number;
  flow_gpm: number;
  status: IntervalStatus;
  solver_flag: string;
  uncertainty_bracket: UncertaintyBracket;
  notes?: string;
}

export interface MonthlyExtractionSummary {
  year_month: string;
  total_intervals: number;
  active_pumping_hours: number;
  anomalous_intervals_excluded: number;
  phantom_af_excluded: number;
  total_kwh: number;
  mean_swl_ft: number;
  mean_tdh_ft: number;
  mean_flow_gpm: number;
  verified_af: number;
  tier2_regional_af: number;
  tier1_mfg_ceiling_af: number;
}

export interface GSAReconciliationSummary {
  client_id: string;
  apn: string;
  well_id: string;
  subbasin: string;
  gsa_name: string;
  audit_period_start: string;
  audit_period_end: string;
  engine_mode: 'ENGINE_A_ALGEBRAIC' | 'ENGINE_B_SCIPY_BRENTQ_NONLINEAR';
  total_kwh_consumed: number;
  total_af_pumped: number;
  uncertainty_bracket_total: UncertaintyBracket;
  phantom_af_prevented: number;
  broken_suction_intervals: number;
  deadhead_overload_intervals: number;
  intermittent_cycling_intervals: number;
  land_iq_billed_af: number;
  net_discrepancy_af: number;
  discrepancy_pct: number;
  gsa_penalty_rate_per_af: number;
  dollar_variance: number;
  evidentiary_confidence_tier: EfficiencySource;
  dwr_monitoring_site_used: string;
  monthly_breakdown: MonthlyExtractionSummary[];
}

export const GALLONS_PER_ACRE_FOOT = 325851.4285714286;
export const HYDRAULIC_KWH_CONSTANT = 1.024;
export const KW_GPM_TDH_CONSTANT = 5308.0;
export const PSI_TO_FEET_HEAD = 2.31;
export const TIER1_MANUFACTURER_OPE = 0.68;
export const TIER2_REGIONAL_OPE = 0.53;

/**
 * Richard Brent's root-finding algorithm (matches scipy.optimize.brentq)
 */
export function brentqSolver(
  f: (x: number) => number,
  a: number,
  b: number,
  xtol = 1e-4,
  maxiter = 100
): number {
  let xpre = a;
  let xcur = b;
  let fpre = f(xpre);
  let fcur = f(xcur);

  if (fpre * fcur > 0) {
    throw new Error(`Root not bracketed on [${a}, ${b}]: f(a)=${fpre}, f(b)=${fcur}`);
  }
  if (fpre === 0) return xpre;
  if (fcur === 0) return xcur;

  let xblk = xpre;
  let fblk = fpre;
  let spre = xcur - xpre;
  let scur = xcur - xpre;

  for (let i = 0; i < maxiter; i++) {
    if (fblk !== 0 && fcur !== 0 && (fpre > 0) !== (fcur > 0)) {
      xblk = xpre;
      fblk = fpre;
      spre = xcur - xpre;
      scur = xcur - xpre;
    }
    if (Math.abs(fblk) < Math.abs(fcur)) {
      xpre = xcur;
      xcur = xblk;
      xblk = xpre;
      fpre = fcur;
      fcur = fblk;
      fblk = fpre;
    }

    const delta = (xtol + 1e-12 * Math.abs(xcur)) / 2.0;
    const sbis = (xblk - xcur) / 2.0;

    if (fcur === 0 || Math.abs(sbis) < delta) {
      return xcur;
    }

    if (Math.abs(spre) > delta && Math.abs(fcur) < Math.abs(fpre)) {
      let stry: number;
      if (xpre === xblk) {
        stry = (-fcur * (xcur - xpre)) / (fcur - fpre);
      } else {
        const dpre = (fpre - fcur) / (xpre - xcur);
        const dblk = (fblk - fcur) / (xblk - xcur);
        stry = (-fcur * (fblk * dblk - fpre * dpre)) / (dblk * dpre * (fblk - fpre));
      }
      if (2.0 * Math.abs(stry) < Math.min(Math.abs(spre), 3.0 * Math.abs(sbis) - delta)) {
        spre = scur;
        scur = stry;
      } else {
        spre = sbis;
        scur = sbis;
      }
    } else {
      spre = sbis;
      scur = sbis;
    }

    xpre = xcur;
    fpre = fcur;
    if (Math.abs(scur) > delta) {
      xcur += scur;
    } else {
      xcur += sbis > 0 ? delta : -delta;
    }
    fcur = f(xcur);
  }
  return xcur;
}

/**
 * Computes nominal Total Dynamic Head (ft)
 */
export function computeTDH(
  swl_ft: number,
  drawdown_ft: number,
  discharge_pressure_psi: number,
  friction_loss_ft: number
): number {
  return swl_ft + drawdown_ft + discharge_pressure_psi * PSI_TO_FEET_HEAD + friction_loss_ft;
}

/**
 * Evaluates Engine B pump bowl head H(Q) = a*Q^2 + b*Q + c
 */
export function evaluateBowlHeadFt(q_gpm: number, curve: PumpCurveCoefficients): number {
  return Math.max(0, curve.head_a * q_gpm * q_gpm + curve.head_b * q_gpm + curve.head_c);
}

/**
 * Evaluates Engine B wire-to-water efficiency curve eta(Q) scaled to well's nominal OPE
 */
export function evaluatePlantEfficiency(
  q_gpm: number,
  curve: PumpCurveCoefficients,
  nominal_ope: number
): number {
  let raw_eta = curve.eff_a * q_gpm * q_gpm + curve.eff_b * q_gpm + curve.eff_c;
  if (curve.eff_a < 0) {
    const q_bep = -curve.eff_b / (2.0 * curve.eff_a);
    const peak_poly = curve.eff_a * q_bep * q_bep + curve.eff_b * q_bep + curve.eff_c;
    if (peak_poly > 0) {
      raw_eta = raw_eta * (nominal_ope / peak_poly);
    }
  }
  return Math.min(0.85, Math.max(0.15, raw_eta));
}

/**
 * Solves single interval via Engine B (Brentq non-linear operating point)
 */
export function solveEngineBInterval(
  kw_demand: number,
  swl_ft: number,
  well: WellProfile
): { flow_gpm: number; tdh_ft: number; flag: string } {
  const curve = well.pump_curve;
  const base_lift_ft = computeTDH(
    swl_ft,
    well.drawdown_ft,
    well.discharge_pressure_psi,
    well.friction_loss_ft
  );

  if (kw_demand <= 0.05) {
    return { flow_gpm: 0, tdh_ft: base_lift_ft, flag: 'ZERO_LOAD' };
  }
  if (base_lift_ft >= curve.head_c) {
    return { flow_gpm: 0, tdh_ft: base_lift_ft, flag: 'SHUTOFF_HEAD_EXCEEDED_ZERO_FLOW' };
  }
  if (kw_demand < well.min_operating_kw) {
    return { flow_gpm: 0, tdh_ft: base_lift_ft, flag: 'SUB_IDLE_NO_LIFT' };
  }
  if (kw_demand > well.max_operating_kw) {
    return { flow_gpm: 0, tdh_ft: base_lift_ft, flag: 'OVERLOAD_OR_DEADHEAD_FAULT' };
  }

  const disc = curve.head_b * curve.head_b - 4.0 * curve.head_a * (curve.head_c - base_lift_ft);
  let q_upper = curve.max_flow_gpm;
  if (disc > 0 && curve.head_a < 0) {
    const q_hyd = (-curve.head_b - Math.sqrt(disc)) / (2.0 * curve.head_a);
    q_upper = Math.min(curve.max_flow_gpm, Math.max(50.0, q_hyd));
  }

  const q_lower = 1.0;
  const reqKw = (q: number): { p_kw: number; tdh: number } => {
    const h_bowl = evaluateBowlHeadFt(q, curve);
    const tdh = Math.max(base_lift_ft, h_bowl);
    const eta = evaluatePlantEfficiency(q, curve, well.ope);
    const p_kw = (q * tdh) / (KW_GPM_TDH_CONSTANT * eta);
    return { p_kw, tdh };
  };

  const f_low = reqKw(q_lower).p_kw - kw_demand;
  const f_high = reqKw(q_upper).p_kw - kw_demand;

  if (f_low >= 0) {
    return { flow_gpm: 0, tdh_ft: base_lift_ft, flag: 'BELOW_MIN_BOWL_CURVE' };
  }
  if (f_high <= 0) {
    const lim = reqKw(q_upper);
    return { flow_gpm: q_upper, tdh_ft: lim.tdh, flag: 'CLAMPED_AT_HYDRAULIC_LIMIT' };
  }

  try {
    const solved_q = brentqSolver((q) => reqKw(q).p_kw - kw_demand, q_lower, q_upper, 1e-3, 100);
    const res = reqKw(solved_q);
    return { flow_gpm: solved_q, tdh_ft: res.tdh, flag: 'BRENTQ_CONVERGED' };
  } catch {
    return { flow_gpm: 0, tdh_ft: base_lift_ft, flag: 'BRENTQ_NON_CONVERGENT' };
  }
}

/**
 * Dynamic PG&E Green Button CSV parser
 */
export function parsePGEGreenButtonCSV(csvText: string): {
  metadata: Record<string, string>;
  intervals: RawEnergyInterval[];
} {
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    throw new Error('PG&E CSV content is empty.');
  }

  const metadata: Record<string, string> = {};
  let headerIdx = -1;
  let headerCols: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const cells = lines[i].split(',').map((c) => c.trim());
    const lower = cells.map((c) => c.toLowerCase());
    const hasDate = lower.some((c) => c === 'date' || c === 'interval date' || c === 'read date');
    const hasStart = lower.some((c) => c === 'start time' || c === 'start' || c === 'time');
    const hasUsage = lower.some((c) =>
      ['usage', 'usage (kwh)', 'kwh', 'value', 'consumption (kwh)'].includes(c)
    );

    if (hasDate && hasStart && hasUsage) {
      headerIdx = i;
      headerCols = lower;
      break;
    } else if (cells.length >= 2 && cells[0]) {
      metadata[cells[0].replace(/:$/, '')] = cells[1];
    }
  }

  if (headerIdx === -1) {
    throw new Error(
      'Could not locate valid PG&E Green Button header row with Date, Start Time, and Usage (kWh).'
    );
  }

  const dateCol = headerCols.findIndex((c) => ['date', 'interval date', 'read date'].includes(c));
  const startCol = headerCols.findIndex((c) => ['start time', 'start', 'time'].includes(c));
  const endCol = headerCols.findIndex((c) => ['end time', 'end'].includes(c));
  const usageCol = headerCols.findIndex((c) =>
    ['usage', 'usage (kwh)', 'kwh', 'value', 'consumption (kwh)'].includes(c)
  );
  const costCol = headerCols.findIndex((c) => ['cost', 'cost ($)', 'amount'].includes(c));
  const notesCol = headerCols.findIndex((c) => ['notes', 'quality', 'flags'].includes(c));

  const intervals: RawEnergyInterval[] = [];

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const row = lines[i].split(',').map((c) => c.trim());
    if (row.length <= Math.max(dateCol, startCol, usageCol)) continue;

    const dateStr = row[dateCol];
    const startStr = row[startCol];
    const endStr = endCol >= 0 && row[endCol] ? row[endCol] : '';
    const kwhVal = parseFloat(row[usageCol].replace(/,/g, ''));

    if (!dateStr || !startStr || Number.isNaN(kwhVal)) continue;

    const cleanKwh = Math.max(0, kwhVal);
    const isoStart = `${dateStr}T${startStr.length === 5 ? startStr + ':00' : startStr}-07:00`;
    const epochMs = Date.parse(isoStart) || Date.parse(`${dateStr} ${startStr}`);
    const isoEnd = endStr
      ? `${dateStr}T${endStr.length === 5 ? endStr + ':00' : endStr}-07:00`
      : new Date(epochMs + 15 * 60 * 1000).toISOString();

    const costRaw = costCol >= 0 && row[costCol] ? parseFloat(row[costCol].replace(/[$,]/g, '')) : undefined;
    const notes = notesCol >= 0 && row[notesCol] ? row[notesCol] : undefined;

    intervals.push({
      interval_start: `${dateStr} ${startStr} PDT`,
      interval_end: `${dateStr} ${endStr || '15m'} PDT`,
      epoch_ms: epochMs,
      year_month: dateStr.slice(0, 7),
      kwh: cleanKwh,
      kw_demand: cleanKwh * 4.0,
      cost_usd: Number.isNaN(costRaw as number) ? undefined : costRaw,
      notes,
    });
  }

  if (intervals.length === 0) {
    throw new Error('No valid 15-minute intervals found in CSV.');
  }

  intervals.sort((a, b) => a.epoch_ms - b.epoch_ms);
  return { metadata, intervals };
}

/**
 * Great-circle Haversine distance in statute miles
 */
export function haversineMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const r = 3958.7613;
  const toRad = (d: number) => (d * Math.PI) / 180.0;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Matches closest DWR CASGEM monitoring well and interpolates daily Static Water Level (SWL)
 */
export function matchAndInterpolateDWR(
  well: WellProfile,
  intervals: RawEnergyInterval[],
  dwrCatalog: DWRMonitoringRecord[]
): { matchedSiteCode: string; matchedRecords: DWRMonitoringRecord[]; swlVector: number[] } {
  const bySite = new Map<string, DWRMonitoringRecord[]>();
  for (const rec of dwrCatalog) {
    if (rec.quality_flag !== 'BAD' && rec.quality_flag !== 'REJECTED') {
      const list = bySite.get(rec.site_code) || [];
      list.push(rec);
      bySite.set(rec.site_code, list);
    }
  }

  let bestSite = '';
  let bestDist = Infinity;
  for (const [site, recs] of bySite.entries()) {
    const dist = haversineMiles(well.latitude, well.longitude, recs[0].latitude, recs[0].longitude);
    if (dist < bestDist) {
      bestDist = dist;
      bestSite = site;
    }
  }

  const matchedRecords = (bySite.get(bestSite) || []).slice().sort((a, b) =>
    a.measurement_date.localeCompare(b.measurement_date)
  );

  if (matchedRecords.length === 0) {
    return {
      matchedSiteCode: 'WELLHEAD_STATIC_DEFAULT',
      matchedRecords: [],
      swlVector: intervals.map(() => well.static_depth_to_water_ft),
    };
  }

  // Scale station baseline offset to wellhead static_depth_to_water_ft so user adjustments
  // to well.static_depth_to_water_ft shift the seasonal curve deterministically
  const baseStationSwl = matchedRecords[0].depth_to_water_ft;
  const wellOffset = well.static_depth_to_water_ft - baseStationSwl;

  const anchorPoints = matchedRecords.map((r) => ({
    epoch: Date.parse(`${r.measurement_date}T12:00:00-07:00`),
    dtw: r.depth_to_water_ft + wellOffset,
  }));

  const swlVector = intervals.map((interval) => {
    const t = interval.epoch_ms;
    if (t <= anchorPoints[0].epoch) return Number(anchorPoints[0].dtw.toFixed(2));
    if (t >= anchorPoints[anchorPoints.length - 1].epoch) {
      return Number(anchorPoints[anchorPoints.length - 1].dtw.toFixed(2));
    }
    for (let i = 0; i < anchorPoints.length - 1; i++) {
      const p0 = anchorPoints[i];
      const p1 = anchorPoints[i + 1];
      if (t >= p0.epoch && t <= p1.epoch) {
        const frac = p1.epoch > p0.epoch ? (t - p0.epoch) / (p1.epoch - p0.epoch) : 0;
        const val = p0.dtw + frac * (p1.dtw - p0.dtw);
        return Number(val.toFixed(2));
      }
    }
    return well.static_depth_to_water_ft;
  });

  return { matchedSiteCode: bestSite, matchedRecords, swlVector };
}

/**
 * Runs complete SGMA forensic audit pipeline (Engine A or Engine B + Anomaly Detection + GSA Summary)
 */
export function runCompleteSGMAAudit(params: {
  well: WellProfile;
  rawIntervals: RawEnergyInterval[];
  dwrCatalog: DWRMonitoringRecord[];
  landIqBilledAf: number;
  gsaPenaltyRatePerAf: number;
  engineMode: 'ENGINE_A_ALGEBRAIC' | 'ENGINE_B_SCIPY_BRENTQ_NONLINEAR';
}): {
  records: IntervalAuditRecord[];
  summary: GSAReconciliationSummary;
  matchedDwrRecords: DWRMonitoringRecord[];
} {
  const { well, rawIntervals, dwrCatalog, landIqBilledAf, gsaPenaltyRatePerAf, engineMode } = params;
  const { matchedSiteCode, matchedRecords, swlVector } = matchAndInterpolateDWR(
    well,
    rawIntervals,
    dwrCatalog
  );

  const n = rawIntervals.length;
  const bowlDepthFt = well.ope_test_metadata?.bowl_intake_depth_ft ?? 285.0;

  // Step 1: Compute hydraulic state per interval
  const tdhArr = new Array<number>(n);
  const kwhPerAfArr = new Array<number>(n);
  const rawAfArr = new Array<number>(n);
  const gallonsArr = new Array<number>(n);
  const flowGpmArr = new Array<number>(n);
  const afMinArr = new Array<number>(n);
  const afMaxArr = new Array<number>(n);
  const solverFlags = new Array<string>(n);

  const brentCache = new Map<string, { flow_gpm: number; tdh_ft: number; flag: string }>();

  for (let i = 0; i < n; i++) {
    const kwh = rawIntervals[i].kwh;
    const kw = rawIntervals[i].kw_demand;
    const swl = swlVector[i];

    if (engineMode === 'ENGINE_A_ALGEBRAIC') {
      const tdh = computeTDH(swl, well.drawdown_ft, well.discharge_pressure_psi, well.friction_loss_ft);
      const safeTdh = Math.max(tdh, 1.0);
      const kwhPerAf = (HYDRAULIC_KWH_CONSTANT * safeTdh) / well.ope;
      const kwhPerAfT1 = (HYDRAULIC_KWH_CONSTANT * safeTdh) / TIER1_MANUFACTURER_OPE;
      const kwhPerAfT2 = (HYDRAULIC_KWH_CONSTANT * safeTdh) / TIER2_REGIONAL_OPE;

      const af = kwh > 0 ? kwh / kwhPerAf : 0;
      const afT1 = kwh > 0 ? kwh / kwhPerAfT1 : 0;
      const afT2 = kwh > 0 ? kwh / kwhPerAfT2 : 0;

      tdhArr[i] = Number(tdh.toFixed(2));
      kwhPerAfArr[i] = Number(kwhPerAf.toFixed(3));
      rawAfArr[i] = af;
      gallonsArr[i] = af * GALLONS_PER_ACRE_FOOT;
      flowGpmArr[i] = kwh > 0 ? (af * GALLONS_PER_ACRE_FOOT) / 15.0 : 0;
      afMinArr[i] = Math.min(afT2, af, afT1);
      afMaxArr[i] = Math.max(afT1, af, afT2);
      solverFlags[i] = kwh > 0 ? 'ALGEBRAIC_OK' : 'ZERO_LOAD';
    } else {
      const key = `${kw.toFixed(2)}_${swl.toFixed(1)}`;
      let solved = brentCache.get(key);
      if (!solved) {
        solved = solveEngineBInterval(kw, swl, well);
        brentCache.set(key, solved);
      }
      const gal = solved.flow_gpm * 15.0;
      const af = gal / GALLONS_PER_ACRE_FOOT;
      const safeTdh = Math.max(solved.tdh_ft, 1.0);
      const kwhPerAf = (HYDRAULIC_KWH_CONSTANT * safeTdh) / well.ope;

      tdhArr[i] = Number(solved.tdh_ft.toFixed(2));
      kwhPerAfArr[i] = Number(kwhPerAf.toFixed(3));
      rawAfArr[i] = af;
      gallonsArr[i] = gal;
      flowGpmArr[i] = solved.flow_gpm;
      const afT2 = af * (TIER2_REGIONAL_OPE / well.ope);
      const afT1 = af * (TIER1_MANUFACTURER_OPE / well.ope);
      afMinArr[i] = Math.min(afT2, af, afT1);
      afMaxArr[i] = Math.max(afT1, af, afT2);
      solverFlags[i] = solved.flag;
    }
  }

  // Step 2: Forensic Anomaly Filter
  const isEnergized = rawIntervals.map((r) => r.kw_demand >= 1.0);
  const isBrokenSuction = rawIntervals.map(
    (r, idx) =>
      isEnergized[idx] &&
      (r.kw_demand < well.min_operating_kw || swlVector[idx] + well.drawdown_ft >= bowlDepthFt)
  );
  const isDeadhead = rawIntervals.map(
    (r, idx) =>
      isEnergized[idx] &&
      (r.kw_demand > well.max_operating_kw ||
        solverFlags[idx] === 'SHUTOFF_HEAD_EXCEEDED_ZERO_FLOW' ||
        solverFlags[idx] === 'OVERLOAD_OR_DEADHEAD_FAULT')
  );
  const normalCandidate = rawIntervals.map(
    (_, idx) => isEnergized[idx] && !isBrokenSuction[idx] && !isDeadhead[idx]
  );

  // Detect short-cycling transitions
  const transitions = new Array<number>(n).fill(0);
  for (let i = 1; i < n; i++) {
    transitions[i] = normalCandidate[i] !== normalCandidate[i - 1] ? 1 : 0;
  }

  const nominalMidKw = 0.5 * (well.min_operating_kw + well.max_operating_kw);
  const records: IntervalAuditRecord[] = [];
  let brokenSuctionCount = 0;
  let deadheadCount = 0;
  let cyclingCount = 0;
  let phantomAfPrevented = 0;

  for (let i = 0; i < n; i++) {
    let rollingTrans = 0;
    for (let w = Math.max(0, i - 2); w <= Math.min(n - 1, i + 3); w++) {
      rollingTrans += transitions[w];
    }
    const prevOff = i === 0 ? true : !normalCandidate[i - 1];
    const nextOff = i === n - 1 ? true : !normalCandidate[i + 1];
    const isolatedBlip = normalCandidate[i] && prevOff && nextOff && rawIntervals[i].kw_demand < 0.72 * nominalMidKw;
    const isCycling = normalCandidate[i] && (rollingTrans >= 3 || isolatedBlip);

    // Compute what raw algebraic AF would have been if unfiltered
    const unfilteredAf =
      rawAfArr[i] > 0
        ? rawAfArr[i]
        : rawIntervals[i].kwh / ((HYDRAULIC_KWH_CONSTANT * Math.max(tdhArr[i], 1)) / well.ope);

    let status = IntervalStatus.NORMAL;
    let calcAf = rawAfArr[i];
    let gal = gallonsArr[i];
    let gpm = flowGpmArr[i];
    let bracket: UncertaintyBracket = {
      af_min: Number(afMinArr[i].toFixed(6)),
      af_expected: Number(calcAf.toFixed(6)),
      af_max: Number(afMaxArr[i].toFixed(6)),
    };

    if (!isEnergized[i]) {
      status = IntervalStatus.NORMAL;
      calcAf = 0;
      gal = 0;
      gpm = 0;
      bracket = { af_min: 0, af_expected: 0, af_max: 0 };
    } else if (isDeadhead[i]) {
      status = IntervalStatus.OVERLOAD_OR_DEADHEAD;
      deadheadCount++;
      phantomAfPrevented += unfilteredAf;
      calcAf = 0;
      gal = 0;
      gpm = 0;
      bracket = { af_min: 0, af_expected: 0, af_max: 0 };
    } else if (isBrokenSuction[i]) {
      status = IntervalStatus.SUSPECT_SUCTION_LOSS_OR_IDLE;
      brokenSuctionCount++;
      phantomAfPrevented += unfilteredAf;
      calcAf = 0;
      gal = 0;
      gpm = 0;
      bracket = { af_min: 0, af_expected: 0, af_max: 0 };
    } else if (isCycling) {
      status = IntervalStatus.INTERMITTENT_CYCLING;
      cyclingCount++;
      phantomAfPrevented += unfilteredAf;
      calcAf = 0;
      gal = 0;
      gpm = 0;
      bracket = { af_min: 0, af_expected: 0, af_max: 0 };
    }

    records.push({
      interval_start: rawIntervals[i].interval_start,
      interval_end: rawIntervals[i].interval_end,
      year_month: rawIntervals[i].year_month,
      kwh: Number(rawIntervals[i].kwh.toFixed(3)),
      kw_demand: Number(rawIntervals[i].kw_demand.toFixed(2)),
      interpolated_swl_ft: swlVector[i],
      tdh_ft: tdhArr[i],
      kwh_per_af: kwhPerAfArr[i],
      calculated_af: Number(calcAf.toFixed(6)),
      raw_unfiltered_af: Number(unfilteredAf.toFixed(6)),
      gallons: Number(gal.toFixed(1)),
      flow_gpm: Number(gpm.toFixed(1)),
      status,
      solver_flag: solverFlags[i],
      uncertainty_bracket: bracket,
      notes: rawIntervals[i].notes,
    });
  }

  // Step 3: Monthly aggregation
  const byMonth = new Map<string, IntervalAuditRecord[]>();
  for (const r of records) {
    const list = byMonth.get(r.year_month) || [];
    list.push(r);
    byMonth.set(r.year_month, list);
  }

  const monthlyBreakdown: MonthlyExtractionSummary[] = [];
  let totalKwh = 0;
  let totalAf = 0;
  let totalAfMin = 0;
  let totalAfMax = 0;

  for (const ym of Array.from(byMonth.keys()).sort()) {
    const mRecs = byMonth.get(ym)!;
    const mKwh = mRecs.reduce((s, r) => s + r.kwh, 0);
    const mAf = mRecs.reduce((s, r) => s + r.calculated_af, 0);
    const mMin = mRecs.reduce((s, r) => s + r.uncertainty_bracket.af_min, 0);
    const mMax = mRecs.reduce((s, r) => s + r.uncertainty_bracket.af_max, 0);
    const activeNormal = mRecs.filter((r) => r.status === IntervalStatus.NORMAL && r.calculated_af > 0);
    const anomalous = mRecs.filter((r) => r.status !== IntervalStatus.NORMAL);
    const phantomAf = anomalous.reduce((s, r) => s + r.raw_unfiltered_af, 0);

    const meanSwl = mRecs.reduce((s, r) => s + r.interpolated_swl_ft, 0) / mRecs.length;
    const meanTdh = mRecs.reduce((s, r) => s + r.tdh_ft, 0) / mRecs.length;
    const meanGpm =
      activeNormal.length > 0
        ? activeNormal.reduce((s, r) => s + r.flow_gpm, 0) / activeNormal.length
        : 0;

    monthlyBreakdown.push({
      year_month: ym,
      total_intervals: mRecs.length,
      active_pumping_hours: Number((activeNormal.length * 0.25).toFixed(2)),
      anomalous_intervals_excluded: anomalous.length,
      phantom_af_excluded: Number(phantomAf.toFixed(4)),
      total_kwh: Number(mKwh.toFixed(2)),
      mean_swl_ft: Number(meanSwl.toFixed(1)),
      mean_tdh_ft: Number(meanTdh.toFixed(1)),
      mean_flow_gpm: Number(meanGpm.toFixed(1)),
      verified_af: Number(mAf.toFixed(3)),
      tier2_regional_af: Number(mMin.toFixed(3)),
      tier1_mfg_ceiling_af: Number(mMax.toFixed(3)),
    });

    totalKwh += mKwh;
    totalAf += mAf;
    totalAfMin += mMin;
    totalAfMax += mMax;
  }

  const totalAfRounded = Number(totalAf.toFixed(3));
  const netDiscrepancyAf = Number((landIqBilledAf - totalAfRounded).toFixed(3));
  const discrepancyPct =
    totalAfRounded > 0 ? Number(((netDiscrepancyAf / totalAfRounded) * 100.0).toFixed(1)) : 0;
  const dollarVariance = Number((netDiscrepancyAf * gsaPenaltyRatePerAf).toFixed(2));

  const summary: GSAReconciliationSummary = {
    client_id: well.client_id,
    apn: well.apn,
    well_id: well.well_id,
    subbasin: well.subbasin,
    gsa_name: well.gsa_name,
    audit_period_start: records[0]?.interval_start ?? '2026-04-04 04:00 PDT',
    audit_period_end: records[records.length - 1]?.interval_end ?? '2026-10-17 13:00 PDT',
    engine_mode: engineMode,
    total_kwh_consumed: Number(totalKwh.toFixed(2)),
    total_af_pumped: totalAfRounded,
    uncertainty_bracket_total: {
      af_min: Number(Math.min(totalAfMin, totalAfRounded).toFixed(3)),
      af_expected: totalAfRounded,
      af_max: Number(Math.max(totalAfMax, totalAfRounded).toFixed(3)),
    },
    phantom_af_prevented: Number(phantomAfPrevented.toFixed(3)),
    broken_suction_intervals: brokenSuctionCount,
    deadhead_overload_intervals: deadheadCount,
    intermittent_cycling_intervals: cyclingCount,
    land_iq_billed_af: Number(landIqBilledAf.toFixed(2)),
    net_discrepancy_af: netDiscrepancyAf,
    discrepancy_pct: discrepancyPct,
    gsa_penalty_rate_per_af: Number(gsaPenaltyRatePerAf.toFixed(2)),
    dollar_variance: dollarVariance,
    evidentiary_confidence_tier: well.efficiency_source,
    dwr_monitoring_site_used: matchedSiteCode,
    monthly_breakdown: monthlyBreakdown,
  };

  return { records, summary, matchedDwrRecords: matchedRecords };
}
