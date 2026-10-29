/**
 * SGMA Extraction Auditor & Water Ledger Engine
 * Pure TypeScript Deterministic Hydraulic (Engine A), DWR Telemetry, Forensic & Rebuttal Engine
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
  measurement_method?: string;
  monitoring_agency?: string;
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
  duration_hours?: number;
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
  engine_mode: 'ENGINE_A_ALGEBRAIC_LEDGER';
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
  dwr_monitoring_agency: string;
  dwr_measurement_method: string;
  monthly_breakdown: MonthlyExtractionSummary[];
}

export const GALLONS_PER_ACRE_FOOT = 325851.4285714286;
export const HYDRAULIC_KWH_CONSTANT = 1.024;
export const KW_GPM_TDH_CONSTANT = 5308.0;
export const PSI_TO_FEET_HEAD = 2.31;
export const TIER1_MANUFACTURER_OPE = 0.68;
export const TIER2_REGIONAL_OPE = 0.53;

/**
 * Computes nominal Total Dynamic Head (ft)
 * TDH = SWL + Drawdown + (Discharge PSI * 2.31) + Friction Loss (Hf)
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
 * Decodes WGS84 decimal latitude and longitude directly from an 18-character
 * California DWR site_code (e.g., "361737N1194798W003" -> { latitude: 36.1737, longitude: -119.4798 }).
 */
export function decodeSiteCodeCoords(
  siteCode: string
): { latitude: number; longitude: number } | null {
  const clean = siteCode.trim().toUpperCase();
  const match = clean.match(/^(\d{6})N(\d{7})W\d{3}$/);
  if (!match) return null;
  const lat = parseInt(match[1], 10) / 10000.0;
  const lon = -(parseInt(match[2], 10) / 10000.0);
  if (lat < 32.0 || lat > 42.5 || lon < -125.0 || lon > -114.0) return null;
  return { latitude: Number(lat.toFixed(4)), longitude: Number(lon.toFixed(4)) };
}

/**
 * RFC-4180 compliant CSV line splitter handling quoted cells and escaped quotes
 */
export function splitCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result.map((c) => c.replace(/^["']|["']$/g, '').trim());
}

/**
 * Parses a local or state-exported DWR CASGEM / CNRA Periodic Groundwater Level CSV file.
 * Automatically decodes WGS84 coordinates from 18-character DWR site_code strings when
 * explicit latitude/longitude columns are omitted.
 */
export function parseDWRCasgemCSV(csvText: string): DWRMonitoringRecord[] {
  const lines = csvText
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) {
    throw new Error('DWR CASGEM CSV file must contain a header row and at least one measurement.');
  }

  const header = splitCSVLine(lines[0]).map((c) => c.toLowerCase());
  const siteIdx = header.findIndex((c) =>
    ['site_code', 'station_id', 'state_well_number', 'site code'].includes(c)
  );
  const dateIdx = header.findIndex((c) =>
    ['measurement_date', 'msmt_date', 'date', 'read_date'].includes(c)
  );
  const dtwIdx = header.findIndex((c) =>
    ['depth_to_water_ft', 'gwe_depth_ft', 'rp_to_ws_ft', 'gse_gwe', 'dtw_ft', 'depth_to_water'].includes(c)
  );
  const gseIdx = header.findIndex((c) =>
    ['ground_surface_elevation_ft', 'gse_ft', 'wlm_gse', 'gse'].includes(c)
  );
  const qaIdx = header.findIndex((c) =>
    ['quality_flag', 'wlm_qa_desc', 'qa_flag', 'quality'].includes(c)
  );
  const latIdx = header.findIndex((c) => ['latitude', 'lat'].includes(c));
  const lonIdx = header.findIndex((c) => ['longitude', 'lon', 'lng'].includes(c));
  const basinIdx = header.findIndex((c) =>
    ['basin_name', 'subbasin_name', 'basin'].includes(c)
  );
  const methodIdx = header.findIndex((c) =>
    ['measurement_method', 'wlm_mthd_desc', 'method'].includes(c)
  );
  const agencyIdx = header.findIndex((c) =>
    ['monitoring_agency', 'coop_org_name', 'agency'].includes(c)
  );

  if (siteIdx === -1 || dateIdx === -1 || dtwIdx === -1) {
    throw new Error(
      'DWR CSV must include site_code, measurement_date (or msmt_date), and depth_to_water_ft (or gse_gwe).'
    );
  }

  const records: DWRMonitoringRecord[] = [];
  for (let i = 1; i < lines.length; i++) {
    const row = splitCSVLine(lines[i]);
    if (row.length <= Math.max(siteIdx, dateIdx, dtwIdx)) continue;

    const siteCode = row[siteIdx].trim();
    const rawDate = row[dateIdx].trim().slice(0, 10);
    const dtw = parseFloat(row[dtwIdx]);
    if (!siteCode || !rawDate || Number.isNaN(dtw) || dtw < 0) continue;

    const gse = gseIdx >= 0 && row[gseIdx] ? parseFloat(row[gseIdx]) || 250.0 : 250.0;
    const rawQa = qaIdx >= 0 && row[qaIdx] ? row[qaIdx].trim().toUpperCase() : 'GOOD';
    const qualityFlag = ['GOOD', 'QUESTIONABLE', 'PROVISIONAL', 'MISSING', 'BAD', 'REJECTED'].includes(
      rawQa
    )
      ? rawQa
      : 'GOOD';

    const decoded = decodeSiteCodeCoords(siteCode);
    const lat =
      latIdx >= 0 && row[latIdx] && !Number.isNaN(parseFloat(row[latIdx]))
        ? parseFloat(row[latIdx])
        : decoded?.latitude ?? 36.1737;
    const lon =
      lonIdx >= 0 && row[lonIdx] && !Number.isNaN(parseFloat(row[lonIdx]))
        ? parseFloat(row[lonIdx])
        : decoded?.longitude ?? -119.4798;

    const basinName =
      basinIdx >= 0 && row[basinIdx] ? row[basinIdx].trim() : 'San Joaquin Valley — Tulare Lake';
    const measurementMethod =
      methodIdx >= 0 && row[methodIdx]
        ? row[methodIdx].trim()
        : 'Electric sounder / pressure transducer';
    const monitoringAgency =
      agencyIdx >= 0 && row[agencyIdx]
        ? row[agencyIdx].trim()
        : 'California Department of Water Resources';

    records.push({
      site_code: siteCode,
      measurement_date: rawDate,
      depth_to_water_ft: Number(dtw.toFixed(2)),
      ground_surface_elevation_ft: Number(gse.toFixed(2)),
      quality_flag: qualityFlag,
      latitude: lat,
      longitude: lon,
      basin_name: basinName,
      measurement_method: measurementMethod,
      monitoring_agency: monitoringAgency,
    });
  }

  if (records.length === 0) {
    throw new Error('No valid groundwater depth measurements found in DWR CSV.');
  }

  return records;
}

/**
 * Normalizes diverse PG&E date strings (YYYY-MM-DD, MM/DD/YYYY, M/D/YY, YYYY/MM/DD)
 * and time strings (24-hr or 12-hr AM/PM) into canonical YYYY-MM-DD, HH:MM, and epoch_ms.
 */
export function normalizePacificDateTime(
  rawDateStr: string,
  rawTimeStr: string
): { isoDate: string; yearMonth: string; time24: string; epochMs: number } | null {
  let dPart = rawDateStr.trim().replace(/^["']|["']$/g, '');
  let tPart = rawTimeStr.trim().replace(/^["']|["']$/g, '');

  for (const tzSuffix of [' PDT', ' PST', ' PT', ' AMERICA/LOS_ANGELES']) {
    if (tPart.toUpperCase().endsWith(tzSuffix)) {
      tPart = tPart.slice(0, -tzSuffix.length).trim();
    }
    if (dPart.toUpperCase().endsWith(tzSuffix)) {
      dPart = dPart.slice(0, -tzSuffix.length).trim();
    }
  }

  if (!tPart && (dPart.includes(' ') || dPart.includes('T'))) {
    const sepIdx = dPart.includes('T') ? dPart.indexOf('T') : dPart.indexOf(' ');
    tPart = dPart.slice(sepIdx + 1).trim();
    dPart = dPart.slice(0, sepIdx).trim();
  }

  let year = 0;
  let month = 0;
  let day = 0;

  if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(dPart)) {
    const parts = dPart.split(/[-/]/).map(Number);
    year = parts[0];
    month = parts[1];
    day = parts[2];
  } else if (/^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}$/.test(dPart)) {
    const parts = dPart.split(/[-/]/).map(Number);
    month = parts[0];
    day = parts[1];
    year = parts[2] < 100 ? 2000 + parts[2] : parts[2];
  } else {
    const fallback = new Date(dPart);
    if (Number.isNaN(fallback.getTime())) return null;
    year = fallback.getFullYear();
    month = fallback.getMonth() + 1;
    day = fallback.getDate();
  }

  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1990) {
    return null;
  }

  let hours = 0;
  let minutes = 0;
  let dayOffset = 0;

  if (tPart) {
    const upperT = tPart.toUpperCase();
    const isPM = upperT.includes('PM');
    const isAM = upperT.includes('AM');
    const cleanT = upperT.replace(/AM|PM/g, '').trim();
    const tPieces = cleanT.split(':').map((x) => parseInt(x, 10));
    if (tPieces.length >= 2 && !Number.isNaN(tPieces[0]) && !Number.isNaN(tPieces[1])) {
      hours = tPieces[0];
      minutes = tPieces[1];
      if (isPM && hours < 12) hours += 12;
      if (isAM && hours === 12) hours = 0;
      if (hours === 24) {
        hours = 0;
        dayOffset = 1;
      }
    }
  }

  const pad2 = (n: number) => String(n).padStart(2, '0');
  const tzOffset = month >= 3 && month <= 10 ? '-07:00' : '-08:00';
  const baseIso = `${year}-${pad2(month)}-${pad2(day)}T${pad2(hours)}:${pad2(minutes)}:00${tzOffset}`;
  let epochMs = Date.parse(baseIso);
  if (Number.isNaN(epochMs)) {
    epochMs = Date.UTC(year, month - 1, day, hours + 7, minutes);
  }
  if (dayOffset > 0) {
    epochMs += dayOffset * 86400 * 1000;
  }

  const isoDate = `${year}-${pad2(month)}-${pad2(day)}`;
  const yearMonth = `${year}-${pad2(month)}`;
  const time24 = `${pad2(hours)}:${pad2(minutes)}`;

  return { isoDate, yearMonth, time24, epochMs };
}

/**
 * Dynamic PG&E Green Button CSV parser supporting quoted fields, US slash dates,
 * 12h/24h timestamps, Wh/kWh units, and 15-min, 30-min, or 60-min intervals.
 */
export function parsePGEGreenButtonCSV(csvText: string): {
  metadata: Record<string, string>;
  intervals: RawEnergyInterval[];
} {
  const lines = csvText
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    throw new Error('PG&E CSV content is empty.');
  }

  const dateAliases = ['date', 'interval date', 'read date', 'service date', 'bill date'];
  const startAliases = [
    'start time',
    'start',
    'interval start',
    'time',
    'start datetime',
    'date/time',
    'datetime',
  ];
  const endAliases = ['end time', 'end', 'interval end', 'end datetime'];
  const usageAliases = [
    'usage',
    'usage (kwh)',
    'kwh',
    'value',
    'consumption (kwh)',
    'energy (kwh)',
    'net usage',
    'delivered (kwh)',
    'total kwh',
  ];
  const unitAliases = ['units', 'unit', 'uom'];
  const costAliases = ['cost', 'cost ($)', 'amount', 'charge'];
  const notesAliases = ['notes', 'quality', 'flags'];

  const metadata: Record<string, string> = {};
  let headerIdx = -1;
  let headerCols: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const cells = splitCSVLine(lines[i]);
    const lower = cells.map((c) => c.toLowerCase());
    const hasDate = lower.some((c) => dateAliases.includes(c));
    const hasStart = lower.some((c) => startAliases.includes(c));
    const hasUsage = lower.some((c) => usageAliases.includes(c));

    if ((hasDate || hasStart) && hasUsage) {
      headerIdx = i;
      headerCols = lower;
      break;
    } else if (cells.length >= 2 && cells[0]) {
      metadata[cells[0].replace(/:$/, '')] = cells[1];
    }
  }

  if (headerIdx === -1) {
    throw new Error(
      'Could not locate valid PG&E Green Button header row with Date/Start Time and Usage (kWh).'
    );
  }

  let dateCol = headerCols.findIndex((c) => dateAliases.includes(c));
  let startCol = headerCols.findIndex((c) => startAliases.includes(c));
  const endCol = headerCols.findIndex((c) => endAliases.includes(c));
  const usageCol = headerCols.findIndex((c) => usageAliases.includes(c));
  const unitCol = headerCols.findIndex((c) => unitAliases.includes(c));
  const costCol = headerCols.findIndex((c) => costAliases.includes(c));
  const notesCol = headerCols.findIndex((c) => notesAliases.includes(c));

  if (dateCol === -1 && startCol !== -1) dateCol = startCol;
  if (startCol === -1 && dateCol !== -1) startCol = dateCol;

  interface TempRow {
    isoDate: string;
    yearMonth: string;
    start24: string;
    end24: string;
    startEpoch: number;
    endEpoch: number | null;
    kwh: number;
    costUsd?: number;
    notes?: string;
  }

  const tempRows: TempRow[] = [];

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const row = splitCSVLine(lines[i]);
    if (row.length <= Math.max(dateCol, startCol, usageCol)) continue;

    const dateStr = row[dateCol];
    const startStr = startCol !== dateCol ? row[startCol] : '';
    const endStr = endCol >= 0 && row[endCol] ? row[endCol] : '';
    const rawUsage = row[usageCol].replace(/[$,]/g, '').trim();

    if (!dateStr || !rawUsage || ['n/a', 'null', 'nan', '-'].includes(rawUsage.toLowerCase())) {
      continue;
    }

    let kwhVal = parseFloat(rawUsage);
    if (Number.isNaN(kwhVal)) continue;

    if (unitCol >= 0 && row[unitCol]) {
      const unitStr = row[unitCol].toLowerCase().trim();
      if (unitStr === 'wh' || unitStr === 'watt-hours' || unitStr === 'watthours') {
        kwhVal /= 1000.0;
      }
    }

    const cleanKwh = Math.max(0, kwhVal);
    const startParsed = normalizePacificDateTime(dateStr, startStr);
    if (!startParsed) continue;

    let endEpoch: number | null = null;
    let end24 = '';
    if (endStr) {
      const endParsed = normalizePacificDateTime(dateStr, endStr);
      if (endParsed) {
        endEpoch =
          endParsed.epochMs <= startParsed.epochMs
            ? endParsed.epochMs + 86400 * 1000
            : endParsed.epochMs;
        end24 = endParsed.time24;
      }
    }

    const costRaw =
      costCol >= 0 && row[costCol] ? parseFloat(row[costCol].replace(/[$,]/g, '')) : undefined;
    const notes = notesCol >= 0 && row[notesCol] ? row[notesCol] : undefined;

    tempRows.push({
      isoDate: startParsed.isoDate,
      yearMonth: startParsed.yearMonth,
      start24: startParsed.time24,
      end24,
      startEpoch: startParsed.epochMs,
      endEpoch,
      kwh: cleanKwh,
      costUsd: Number.isNaN(costRaw as number) ? undefined : costRaw,
      notes,
    });
  }

  if (tempRows.length === 0) {
    throw new Error('No valid energy intervals found in PG&E CSV.');
  }

  tempRows.sort((a, b) => a.startEpoch - b.startEpoch);

  let defaultDurationHours = 0.25;
  if (tempRows.length >= 2) {
    const diffsSec: number[] = [];
    for (let i = 0; i < Math.min(25, tempRows.length - 1); i++) {
      const diff = (tempRows[i + 1].startEpoch - tempRows[i].startEpoch) / 1000.0;
      if (diff >= 300 && diff <= 7200) {
        diffsSec.push(diff);
      }
    }
    if (diffsSec.length > 0) {
      diffsSec.sort((a, b) => a - b);
      defaultDurationHours = diffsSec[Math.floor(diffsSec.length / 2)] / 3600.0;
    }
  }

  const intervals: RawEnergyInterval[] = tempRows.map((r) => {
    let durationHours = defaultDurationHours;
    if (r.endEpoch !== null && r.endEpoch > r.startEpoch) {
      const calcDur = (r.endEpoch - r.startEpoch) / (3600.0 * 1000.0);
      if (calcDur > 0 && calcDur <= 24) {
        durationHours = calcDur;
      }
    }
    const endLabel = r.end24 || `${Math.round(durationHours * 60)}m`;
    return {
      interval_start: `${r.isoDate} ${r.start24} PDT`,
      interval_end: `${r.isoDate} ${endLabel} PDT`,
      epoch_ms: r.startEpoch,
      year_month: r.yearMonth,
      kwh: r.kwh,
      kw_demand: Number((r.kwh / durationHours).toFixed(3)),
      duration_hours: durationHours,
      cost_usd: r.costUsd,
      notes: r.notes,
    };
  });

  return { metadata, intervals };
}

/**
 * Parses ESPI Green Button XML feeds in browser or Node
 */
export function parsePGEGreenButtonXML(xmlText: string): {
  metadata: Record<string, string>;
  intervals: RawEnergyInterval[];
} {
  const metadata: Record<string, string> = { format: 'ESPI_GREEN_BUTTON_XML' };
  const titleMatch = xmlText.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch) {
    metadata.title = titleMatch[1].trim();
  }

  let multiplierToKwh = 0.001;
  const powMatch = xmlText.match(
    /<(?:espi:)?powerOfTenMultiplier>\s*(-?\d+)\s*<\/(?:espi:)?powerOfTenMultiplier>/i
  );
  if (powMatch) {
    const pow10 = parseInt(powMatch[1], 10);
    if (!Number.isNaN(pow10)) {
      multiplierToKwh = Math.pow(10, pow10) / 1000.0;
    }
  }

  const intervals: RawEnergyInterval[] = [];
  const readingRegex = /<(?:espi:)?IntervalReading[\s\S]*?<\/(?:espi:)?IntervalReading>/gi;
  const matches = xmlText.match(readingRegex) || [];

  const pad2 = (n: number) => String(n).padStart(2, '0');

  for (const block of matches) {
    const startMatch = block.match(/<(?:espi:)?start>\s*(\d+)\s*<\/(?:espi:)?start>/i);
    const durMatch = block.match(/<(?:espi:)?duration>\s*(\d+)\s*<\/(?:espi:)?duration>/i);
    const valMatch = block.match(/<(?:espi:)?value>\s*([0-9.+-]+)\s*<\/(?:espi:)?value>/i);

    if (startMatch && valMatch) {
      const startEpochSec = parseInt(startMatch[1], 10);
      const durationSec = durMatch ? Math.max(60, parseInt(durMatch[1], 10)) : 900;
      const rawVal = parseFloat(valMatch[1]);
      if (Number.isNaN(startEpochSec) || Number.isNaN(rawVal)) continue;

      const durationHours = durationSec / 3600.0;
      const kwh = Math.max(0, Number((rawVal * multiplierToKwh).toFixed(6)));
      const epochMs = startEpochSec * 1000;

      const pacDate = new Date(epochMs - 7 * 3600 * 1000);
      const y = pacDate.getUTCFullYear();
      const m = pad2(pacDate.getUTCMonth() + 1);
      const d = pad2(pacDate.getUTCDate());
      const hh = pad2(pacDate.getUTCHours());
      const mm = pad2(pacDate.getUTCMinutes());

      const pacEnd = new Date(epochMs + durationSec * 1000 - 7 * 3600 * 1000);
      const ehh = pad2(pacEnd.getUTCHours());
      const emm = pad2(pacEnd.getUTCMinutes());

      intervals.push({
        interval_start: `${y}-${m}-${d} ${hh}:${mm} PDT`,
        interval_end: `${y}-${m}-${d} ${ehh}:${emm} PDT`,
        epoch_ms: epochMs,
        year_month: `${y}-${m}`,
        kwh,
        kw_demand: Number((kwh / durationHours).toFixed(3)),
        duration_hours: durationHours,
      });
    }
  }

  if (intervals.length === 0) {
    throw new Error('No valid IntervalReading entries found in PG&E Green Button XML.');
  }

  intervals.sort((a, b) => a.epoch_ms - b.epoch_ms);
  return { metadata, intervals };
}

/**
 * Auto-detects CSV vs ESPI XML PG&E export and parses intervals
 */
export function parsePGEDataFile(content: string): {
  metadata: Record<string, string>;
  intervals: RawEnergyInterval[];
} {
  const trimmed = content.trim();
  if (
    trimmed.startsWith('<?xml') ||
    trimmed.includes('<feed') ||
    trimmed.includes('IntervalReading')
  ) {
    return parsePGEGreenButtonXML(trimmed);
  }
  return parsePGEGreenButtonCSV(trimmed);
}

/**
 * Automatically infers plausible min_operating_kw and max_operating_kw thresholds
 * from the active kW demand distribution of an uploaded PG&E dataset.
 */
export function inferPlausibleKwBounds(intervals: RawEnergyInterval[]): {
  medianActiveKw: number;
  recommendedMinKw: number;
  recommendedMaxKw: number;
} {
  const energized = intervals
    .map((r) => r.kw_demand)
    .filter((kw) => kw >= 3.0)
    .sort((a, b) => a - b);

  if (energized.length === 0) {
    return { medianActiveKw: 85.0, recommendedMinKw: 52.0, recommendedMaxKw: 118.0 };
  }

  const medianKw = energized[Math.floor(energized.length * 0.55)];
  const recommendedMinKw = Math.max(2.0, Number((medianKw * 0.58).toFixed(1)));
  const recommendedMaxKw = Math.max(recommendedMinKw + 10.0, Number((medianKw * 1.32).toFixed(1)));
  return {
    medianActiveKw: Number(medianKw.toFixed(1)),
    recommendedMinKw,
    recommendedMaxKw,
  };
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

  const matchedRecords = (bySite.get(bestSite) || [])
    .slice()
    .sort((a, b) => a.measurement_date.localeCompare(b.measurement_date));

  if (matchedRecords.length === 0) {
    return {
      matchedSiteCode: 'WELLHEAD_STATIC_DEFAULT',
      matchedRecords: [],
      swlVector: intervals.map(() => well.static_depth_to_water_ft),
    };
  }

  const baseStationSwl = matchedRecords[0].depth_to_water_ft;
  const wellOffset = well.static_depth_to_water_ft - baseStationSwl;

  const anchorPoints = matchedRecords.map((r) => ({
    epoch: Date.parse(`${r.measurement_date}T12:00:00-07:00`),
    dtw: Math.max(0, r.depth_to_water_ft + wellOffset),
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
 * Runs complete SGMA forensic audit pipeline using Engine A (Standard Evidentiary Algebraic Ledger)
 * + Forensic Anomaly Detection + GSA Reconciliation Summary.
 */
export function runCompleteSGMAAudit(params: {
  well: WellProfile;
  rawIntervals: RawEnergyInterval[];
  dwrCatalog: DWRMonitoringRecord[];
  landIqBilledAf: number;
  gsaPenaltyRatePerAf: number;
}): {
  records: IntervalAuditRecord[];
  summary: GSAReconciliationSummary;
  matchedDwrRecords: DWRMonitoringRecord[];
} {
  const { well, rawIntervals, dwrCatalog, landIqBilledAf, gsaPenaltyRatePerAf } = params;
  const { matchedSiteCode, matchedRecords, swlVector } = matchAndInterpolateDWR(
    well,
    rawIntervals,
    dwrCatalog
  );

  const n = rawIntervals.length;
  const bowlDepthFt = well.ope_test_metadata?.bowl_intake_depth_ft ?? 500.0;

  // Step 1: Compute Engine A hydraulic state per interval
  const tdhArr = new Array<number>(n);
  const kwhPerAfArr = new Array<number>(n);
  const rawAfArr = new Array<number>(n);
  const gallonsArr = new Array<number>(n);
  const flowGpmArr = new Array<number>(n);
  const afMinArr = new Array<number>(n);
  const afMaxArr = new Array<number>(n);
  const solverFlags = new Array<string>(n);
  const durHoursArr = new Array<number>(n);

  for (let i = 0; i < n; i++) {
    const kwh = rawIntervals[i].kwh;
    const durHrs =
      rawIntervals[i].duration_hours && rawIntervals[i].duration_hours! > 0
        ? rawIntervals[i].duration_hours!
        : 0.25;
    durHoursArr[i] = durHrs;
    const durMinutes = durHrs * 60.0;
    const swl = swlVector[i];

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
    flowGpmArr[i] = kwh > 0 ? (af * GALLONS_PER_ACRE_FOOT) / durMinutes : 0;
    afMinArr[i] = Math.min(afT2, af, afT1);
    afMaxArr[i] = Math.max(afT1, af, afT2);
    solverFlags[i] = kwh > 0 ? 'ALGEBRAIC_OK' : 'ZERO_LOAD';
  }

  // Step 2: Forensic Anomaly Filter
  const isEnergized = rawIntervals.map((r) => r.kw_demand >= 1.0);
  const isBrokenSuction = rawIntervals.map(
    (r, idx) =>
      isEnergized[idx] &&
      (r.kw_demand < well.min_operating_kw || swlVector[idx] + well.drawdown_ft >= bowlDepthFt)
  );
  const isDeadhead = rawIntervals.map(
    (r, idx) => isEnergized[idx] && r.kw_demand > well.max_operating_kw
  );
  const normalCandidate = rawIntervals.map(
    (_, idx) => isEnergized[idx] && !isBrokenSuction[idx] && !isDeadhead[idx]
  );

  // Compute contiguous active run length per interval respecting timestamp continuity
  const runLengths = new Array<number>(n).fill(0);
  let idxStart = 0;
  while (idxStart < n) {
    if (!normalCandidate[idxStart]) {
      idxStart++;
      continue;
    }
    let idxEnd = idxStart;
    while (
      idxEnd + 1 < n &&
      normalCandidate[idxEnd + 1] &&
      rawIntervals[idxEnd + 1].epoch_ms - rawIntervals[idxEnd].epoch_ms <=
        durHoursArr[idxEnd] * 3600 * 1000 * 1.6
    ) {
      idxEnd++;
    }
    const len = idxEnd - idxStart + 1;
    for (let k = idxStart; k <= idxEnd; k++) {
      runLengths[k] = len;
    }
    idxStart = idxEnd + 1;
  }

  // Detect short-cycling transitions within continuous time windows
  const transitions = new Array<number>(n).fill(0);
  for (let i = 1; i < n; i++) {
    if (
      rawIntervals[i].epoch_ms - rawIntervals[i - 1].epoch_ms <=
      durHoursArr[i - 1] * 3600 * 1000 * 2.5
    ) {
      transitions[i] = normalCandidate[i] !== normalCandidate[i - 1] ? 1 : 0;
    }
  }

  const nominalMidKw = 0.5 * (well.min_operating_kw + well.max_operating_kw);
  const records: IntervalAuditRecord[] = [];
  let brokenSuctionCount = 0;
  let deadheadCount = 0;
  let cyclingCount = 0;
  let phantomAfPrevented = 0;

  for (let i = 0; i < n; i++) {
    let isCycling = false;
    if (normalCandidate[i] && runLengths[i] <= 2) {
      let rollingTrans = 0;
      for (let w = Math.max(0, i - 2); w <= Math.min(n - 1, i + 3); w++) {
        if (Math.abs(rawIntervals[w].epoch_ms - rawIntervals[i].epoch_ms) <= 5400 * 1000) {
          rollingTrans += transitions[w];
        }
      }
      const isolatedBlip =
        runLengths[i] === 1 && rawIntervals[i].kw_demand < 0.78 * nominalMidKw;
      if (rollingTrans >= 3 || isolatedBlip) {
        isCycling = true;
      }
    }

    const unfilteredAf =
      rawAfArr[i] > 0
        ? rawAfArr[i]
        : rawIntervals[i].kwh / ((HYDRAULIC_KWH_CONSTANT * Math.max(tdhArr[i], 1)) / well.ope);

    let status: IntervalStatus = IntervalStatus.NORMAL;
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
  const byMonth = new Map<string, { rec: IntervalAuditRecord; durHrs: number }[]>();
  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    const list = byMonth.get(r.year_month) || [];
    list.push({ rec: r, durHrs: durHoursArr[i] });
    byMonth.set(r.year_month, list);
  }

  const monthlyBreakdown: MonthlyExtractionSummary[] = [];
  let totalKwh = 0;
  let totalAf = 0;
  let totalAfMin = 0;
  let totalAfMax = 0;

  for (const ym of Array.from(byMonth.keys()).sort()) {
    const mItems = byMonth.get(ym)!;
    const mRecs = mItems.map((x) => x.rec);
    const mKwh = mRecs.reduce((s, r) => s + r.kwh, 0);
    const mAf = mRecs.reduce((s, r) => s + r.calculated_af, 0);
    const mMin = mRecs.reduce((s, r) => s + r.uncertainty_bracket.af_min, 0);
    const mMax = mRecs.reduce((s, r) => s + r.uncertainty_bracket.af_max, 0);
    const activeNormalItems = mItems.filter(
      (x) => x.rec.status === IntervalStatus.NORMAL && x.rec.calculated_af > 0
    );
    const activeHours = activeNormalItems.reduce((s, x) => s + x.durHrs, 0);
    const anomalous = mRecs.filter((r) => r.status !== IntervalStatus.NORMAL);
    const phantomAf = anomalous.reduce((s, r) => s + r.raw_unfiltered_af, 0);

    const meanSwl = mRecs.reduce((s, r) => s + r.interpolated_swl_ft, 0) / mRecs.length;
    const meanTdh = mRecs.reduce((s, r) => s + r.tdh_ft, 0) / mRecs.length;
    const meanGpm =
      activeNormalItems.length > 0
        ? activeNormalItems.reduce((s, x) => s + x.rec.flow_gpm, 0) / activeNormalItems.length
        : 0;

    monthlyBreakdown.push({
      year_month: ym,
      total_intervals: mRecs.length,
      active_pumping_hours: Number(activeHours.toFixed(2)),
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
  const dollarVariance = Number((Math.max(0, netDiscrepancyAf) * gsaPenaltyRatePerAf).toFixed(2));

  const primaryAgency =
    matchedRecords[0]?.monitoring_agency ?? 'California Department of Water Resources';
  const primaryMethod =
    matchedRecords[0]?.measurement_method ?? 'Electric sounder / electronic pressure transducer';

  const summary: GSAReconciliationSummary = {
    client_id: well.client_id,
    apn: well.apn,
    well_id: well.well_id,
    subbasin: well.subbasin,
    gsa_name: well.gsa_name,
    audit_period_start: records[0]?.interval_start ?? '2026-04-04 04:00 PDT',
    audit_period_end: records[records.length - 1]?.interval_end ?? '2026-10-17 13:00 PDT',
    engine_mode: 'ENGINE_A_ALGEBRAIC_LEDGER',
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
    dwr_monitoring_agency: primaryAgency,
    dwr_measurement_method: primaryMethod,
    monthly_breakdown: monthlyBreakdown,
  };

  return { records, summary, matchedDwrRecords: matchedRecords };
}
