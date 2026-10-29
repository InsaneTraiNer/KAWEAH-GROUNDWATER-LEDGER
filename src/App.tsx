import React, { useMemo, useState } from 'react';
import { EvidentiaryRebuttalView } from './components/EvidentiaryRebuttalView';
import { HydraulicCharts } from './components/HydraulicCharts';
import { IntervalLedgerTable } from './components/IntervalLedgerTable';
import { PythonRepositoryView } from './components/PythonRepositoryView';
import {
  buildEvidentiaryHTMLDocument,
  DWR_CASGEM_CATALOG,
  generateDefaultPGEIntervals,
  SUBBASIN_PRESETS,
} from './data/subbasinPresets';
import {
  computeTDH,
  DWRMonitoringRecord,
  EfficiencySource,
  inferPlausibleKwBounds,
  parseDWRCasgemCSV,
  parsePGEDataFile,
  RawEnergyInterval,
  runCompleteSGMAAudit,
  TIER1_MANUFACTURER_OPE,
  TIER2_REGIONAL_OPE,
  WellProfile,
} from './engine/sgmaEngine';

type WorkspaceView = 'workspace' | 'rebuttal' | 'python_repo';

export default function App() {
  const [activeView, setActiveView] = useState<WorkspaceView>('workspace');
  const [selectedPresetId, setSelectedPresetId] = useState<string>('kaweah');
  const [well, setWell] = useState<WellProfile>(SUBBASIN_PRESETS[0].well);
  const [landIqBilledAf, setLandIqBilledAf] = useState<number>(
    SUBBASIN_PRESETS[0].landIqBilledAf
  );
  const [gsaPenaltyRatePerAf, setGsaPenaltyRatePerAf] = useState<number>(
    SUBBASIN_PRESETS[0].gsaPenaltyRatePerAf
  );

  // Draft string states for numeric inputs so typing/backspacing never hijacks keystrokes
  const [psiDraft, setPsiDraft] = useState<string>(
    String(SUBBASIN_PRESETS[0].well.discharge_pressure_psi)
  );
  const [frictionDraft, setFrictionDraft] = useState<string>(
    String(SUBBASIN_PRESETS[0].well.friction_loss_ft)
  );
  const [minKwDraft, setMinKwDraft] = useState<string>(
    String(SUBBASIN_PRESETS[0].well.min_operating_kw)
  );
  const [maxKwDraft, setMaxKwDraft] = useState<string>(
    String(SUBBASIN_PRESETS[0].well.max_operating_kw)
  );
  const [bowlDepthDraft, setBowlDepthDraft] = useState<string>(
    String(SUBBASIN_PRESETS[0].well.ope_test_metadata?.bowl_intake_depth_ft ?? 265)
  );
  const [landIqDraft, setLandIqDraft] = useState<string>(
    String(SUBBASIN_PRESETS[0].landIqBilledAf)
  );
  const [penaltyRateDraft, setPenaltyRateDraft] = useState<string>(
    String(SUBBASIN_PRESETS[0].gsaPenaltyRatePerAf)
  );

  const defaultIntervals = useMemo(() => generateDefaultPGEIntervals(), []);
  const [customIntervals, setCustomIntervals] = useState<RawEnergyInterval[] | null>(null);
  const [csvUploadStatus, setCsvUploadStatus] = useState<string | null>(null);
  const [csvError, setCsvError] = useState<string | null>(null);

  const [customDwrCatalog, setCustomDwrCatalog] = useState<DWRMonitoringRecord[] | null>(null);
  const [dwrUploadStatus, setDwrUploadStatus] = useState<string | null>(null);
  const [dwrError, setDwrError] = useState<string | null>(null);

  const activeIntervals = customIntervals ?? defaultIntervals;
  const activeDwrCatalog = customDwrCatalog ?? DWR_CASGEM_CATALOG;

  // Sanitize well parameters for engine execution even while user is mid-keystroke
  const sanitizedWell = useMemo<WellProfile>(() => {
    const safeMinKw = Math.max(
      1,
      Number.isFinite(well.min_operating_kw) ? well.min_operating_kw : 10
    );
    const safeMaxKw = Math.max(
      safeMinKw + 5,
      Number.isFinite(well.max_operating_kw) ? well.max_operating_kw : safeMinKw + 40
    );
    const safePsi = Math.max(
      0,
      Number.isFinite(well.discharge_pressure_psi) ? well.discharge_pressure_psi : 0
    );
    const safeFriction = Math.max(
      0,
      Number.isFinite(well.friction_loss_ft) ? well.friction_loss_ft : 0
    );
    const safeOpe = Math.min(0.85, Math.max(0.2, Number.isFinite(well.ope) ? well.ope : 0.6));
    return {
      ...well,
      discharge_pressure_psi: safePsi,
      friction_loss_ft: safeFriction,
      ope: safeOpe,
      min_operating_kw: safeMinKw,
      max_operating_kw: safeMaxKw,
    };
  }, [well]);

  const auditResult = useMemo(() => {
    return runCompleteSGMAAudit({
      well: sanitizedWell,
      rawIntervals: activeIntervals,
      dwrCatalog: activeDwrCatalog,
      landIqBilledAf: Math.max(0, Number.isFinite(landIqBilledAf) ? landIqBilledAf : 0),
      gsaPenaltyRatePerAf: Math.max(
        0,
        Number.isFinite(gsaPenaltyRatePerAf) ? gsaPenaltyRatePerAf : 0
      ),
    });
  }, [sanitizedWell, activeIntervals, activeDwrCatalog, landIqBilledAf, gsaPenaltyRatePerAf]);

  const { records, summary, matchedDwrRecords } = auditResult;

  const nominalTdh = computeTDH(
    sanitizedWell.static_depth_to_water_ft,
    sanitizedWell.drawdown_ft,
    sanitizedWell.discharge_pressure_psi,
    sanitizedWell.friction_loss_ft
  );
  const nominalKwhPerAf = (1.024 * nominalTdh) / sanitizedWell.ope;

  const syncDraftsFromWell = (w: WellProfile, landIq: number, rate: number) => {
    setPsiDraft(String(w.discharge_pressure_psi));
    setFrictionDraft(String(w.friction_loss_ft));
    setMinKwDraft(String(w.min_operating_kw));
    setMaxKwDraft(String(w.max_operating_kw));
    setBowlDepthDraft(String(w.ope_test_metadata?.bowl_intake_depth_ft ?? 280));
    setLandIqDraft(String(landIq));
    setPenaltyRateDraft(String(rate));
  };

  const handleSelectPreset = (presetId: string) => {
    const found = SUBBASIN_PRESETS.find((p) => p.id === presetId);
    if (!found) return;
    setSelectedPresetId(found.id);
    const nextWell: WellProfile = {
      ...found.well,
      ope_test_metadata: found.well.ope_test_metadata
        ? { ...found.well.ope_test_metadata }
        : undefined,
    };
    setWell(nextWell);
    setLandIqBilledAf(found.landIqBilledAf);
    setGsaPenaltyRatePerAf(found.gsaPenaltyRatePerAf);
    syncDraftsFromWell(nextWell, found.landIqBilledAf, found.gsaPenaltyRatePerAf);
    setCsvError(null);
    setDwrError(null);
  };

  const handleAutoFitKwEnvelope = (targetIntervals: RawEnergyInterval[] = activeIntervals) => {
    const bounds = inferPlausibleKwBounds(targetIntervals);
    const minDepthSafe = Math.max(
      well.ope_test_metadata?.bowl_intake_depth_ft ?? 280,
      Math.round(well.static_depth_to_water_ft + well.drawdown_ft + 45)
    );
    setWell((prev) => ({
      ...prev,
      min_operating_kw: bounds.recommendedMinKw,
      max_operating_kw: bounds.recommendedMaxKw,
      ope_test_metadata: prev.ope_test_metadata
        ? {
            ...prev.ope_test_metadata,
            measured_kw_input: bounds.medianActiveKw,
            bowl_intake_depth_ft: minDepthSafe,
          }
        : undefined,
    }));
    setMinKwDraft(String(bounds.recommendedMinKw));
    setMaxKwDraft(String(bounds.recommendedMaxKw));
    setBowlDepthDraft(String(minDepthSafe));
  };

  const handleCSVFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fileName = file.name;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = String(ev.target?.result || '');
        const parsed = parsePGEDataFile(text);
        setCustomIntervals(parsed.intervals);

        // Extract optional grower metadata from PG&E CSV preamble if present
        const metaName =
          parsed.metadata['Name'] ||
          parsed.metadata['Account Name'] ||
          parsed.metadata['Customer Name'];
        const metaSaid =
          parsed.metadata['Service Agreement ID'] ||
          parsed.metadata['Service Agreement'] ||
          parsed.metadata['SAID'];
        const metaMeter =
          parsed.metadata['Meter Number'] ||
          parsed.metadata['Meter ID'] ||
          parsed.metadata['Meter'];

        // Check if current kW thresholds would exclude the uploaded pump's median active demand
        const bounds = inferPlausibleKwBounds(parsed.intervals);
        const needsKwAutoFit =
          bounds.medianActiveKw < well.min_operating_kw * 1.05 ||
          bounds.medianActiveKw > well.max_operating_kw * 0.95;

        setWell((prev) => {
          const nextMinKw = needsKwAutoFit ? bounds.recommendedMinKw : prev.min_operating_kw;
          const nextMaxKw = needsKwAutoFit ? bounds.recommendedMaxKw : prev.max_operating_kw;
          if (needsKwAutoFit) {
            setMinKwDraft(String(nextMinKw));
            setMaxKwDraft(String(nextMaxKw));
          }
          return {
            ...prev,
            client_id: metaName ? metaName.toUpperCase().replace(/\s+/g, '-') : prev.client_id,
            service_agreement_id: metaSaid || prev.service_agreement_id,
            meter_id: metaMeter || prev.meter_id,
            min_operating_kw: nextMinKw,
            max_operating_kw: nextMaxKw,
          };
        });

        const durMin = Math.round((parsed.intervals[0]?.duration_hours ?? 0.25) * 60);
        setCsvUploadStatus(
          `Loaded ${parsed.intervals.length.toLocaleString('en-US')} intervals (${durMin}-min step) from ${fileName}${
            needsKwAutoFit
              ? ` · Auto-fitted kW envelope [${bounds.recommendedMinKw}–${bounds.recommendedMaxKw} kW]`
              : ''
          }`
        );
        setCsvError(null);
      } catch (err) {
        setCsvError(err instanceof Error ? err.message : 'Invalid PG&E CSV/XML format.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleDWRFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fileName = file.name;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = String(ev.target?.result || '');
        const parsedRecords = parseDWRCasgemCSV(text);
        setCustomDwrCatalog(parsedRecords);
        const uniqueSites = Array.from(new Set(parsedRecords.map((r) => r.site_code)));
        setDwrUploadStatus(
          `Loaded ${parsedRecords.length} DWR soundings (${uniqueSites.join(', ')}) from ${fileName}`
        );
        setDwrError(null);
      } catch (err) {
        setDwrError(err instanceof Error ? err.message : 'Invalid DWR CASGEM CSV format.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleExportHTMLPacket = () => {
    const html = buildEvidentiaryHTMLDocument(sanitizedWell, summary);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `SGMA_Evidentiary_Rebuttal_${summary.apn}_2026.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Detect if current calibration parameters are excluding a high fraction of energized intervals
  const totalAnomalousIntervals =
    summary.broken_suction_intervals +
    summary.deadhead_overload_intervals +
    summary.intermittent_cycling_intervals;
  const energizedCount = records.filter((r) => r.kw_demand >= 1.0).length;
  const highExclusionWarning =
    energizedCount > 0 && totalAnomalousIntervals / energizedCount > 0.35;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Top Bar Contract: 3 Zones separated by gap-8 */}
      <header className="flex items-center justify-between gap-8 px-6 py-3.5 bg-white border-b border-slate-200">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            setActiveView('workspace');
          }}
          className="text-base font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
        >
          SGMA Extraction Auditor
        </a>

        {/* Zone 2: Concise single-line navigation links */}
        <nav
          aria-label="Primary Workspace Views"
          className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600"
        >
          <button
            type="button"
            onClick={() => setActiveView('workspace')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
              activeView === 'workspace'
                ? 'border-sky-600 text-slate-900 font-semibold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            Audit Workspace
          </button>
          <button
            type="button"
            onClick={() => setActiveView('rebuttal')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
              activeView === 'rebuttal'
                ? 'border-sky-600 text-slate-900 font-semibold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            Evidentiary Rebuttal Packet
          </button>
          <button
            type="button"
            onClick={() => setActiveView('python_repo')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
              activeView === 'python_repo'
                ? 'border-sky-600 text-slate-900 font-semibold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            Python Repository &amp; CLI
          </button>
        </nav>

        {/* Zone 3: 1 Primary Action */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={handleExportHTMLPacket}
            className="px-4 py-2 text-xs font-medium text-white bg-slate-900 rounded hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
          >
            Export Rebuttal HTML
          </button>
        </div>
      </header>

      {/* Mobile Navigation Bar (visible only on small screens) */}
      <div className="grid grid-cols-3 md:hidden gap-1.5 px-4 py-2 bg-white border-b border-slate-200">
        <button
          type="button"
          onClick={() => setActiveView('workspace')}
          className={`px-2 py-1.5 text-xs font-medium rounded text-center whitespace-nowrap truncate ${
            activeView === 'workspace' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'
          }`}
        >
          Audit Workspace
        </button>
        <button
          type="button"
          onClick={() => setActiveView('rebuttal')}
          className={`px-2 py-1.5 text-xs font-medium rounded text-center whitespace-nowrap truncate ${
            activeView === 'rebuttal' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'
          }`}
        >
          Rebuttal Packet
        </button>
        <button
          type="button"
          onClick={() => setActiveView('python_repo')}
          className={`px-2 py-1.5 text-xs font-medium rounded text-center whitespace-nowrap truncate ${
            activeView === 'python_repo' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'
          }`}
        >
          Python &amp; CLI
        </button>
      </div>

      {/* Main Split Console */}
      <div className="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 py-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Control & Parameter Column */}
        <aside
          aria-label="Well Hydraulic Calibration and GSA Parameters"
          className="lg:col-span-4 xl:col-span-3 bg-white border border-slate-200 p-5 space-y-4"
        >
          <div className="border-b border-slate-200 pb-3">
            <h1 className="text-sm font-bold text-slate-900">
              Well &amp; Subbasin Calibration
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Engine A Algebraic Ledger · Official DWR &amp; GSA Telemetry
            </p>
          </div>

          {/* Subbasin Preset Selector */}
          <div>
            <label
              htmlFor="subbasin-preset-select"
              className="block text-xs font-medium text-slate-700 mb-1"
            >
              California SGMA Subbasin Preset
            </label>
            <select
              id="subbasin-preset-select"
              value={selectedPresetId}
              onChange={(e) => handleSelectPreset(e.target.value)}
              className="w-full px-2.5 py-2 text-xs bg-slate-50 border border-slate-300 rounded text-slate-900 font-medium"
            >
              {SUBBASIN_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
            </select>
          </div>

          {/* Editable Grower, Parcel & Meter Identity */}
          <div className="space-y-2.5 pt-2 border-t border-slate-200">
            <div className="text-xs font-semibold text-slate-800">
              Grower, Parcel &amp; Well Identity
            </div>
            <div>
              <label
                htmlFor="client-id-input"
                className="block text-[11px] text-slate-600 mb-0.5"
              >
                Ranch / Legal Entity Name
              </label>
              <input
                id="client-id-input"
                type="text"
                value={well.client_id}
                onChange={(e) =>
                  setWell((prev) => ({ ...prev, client_id: e.target.value }))
                }
                className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded text-slate-900"
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label
                  htmlFor="apn-input"
                  className="block text-[11px] text-slate-600 mb-0.5"
                >
                  Parcel APN
                </label>
                <input
                  id="apn-input"
                  type="text"
                  value={well.apn}
                  onChange={(e) =>
                    setWell((prev) => ({ ...prev, apn: e.target.value }))
                  }
                  className="w-full px-2 py-1 text-xs font-mono border border-slate-300 rounded text-slate-900"
                />
              </div>
              <div>
                <label
                  htmlFor="well-id-input"
                  className="block text-[11px] text-slate-600 mb-0.5"
                >
                  Well ID
                </label>
                <input
                  id="well-id-input"
                  type="text"
                  value={well.well_id}
                  onChange={(e) =>
                    setWell((prev) => ({ ...prev, well_id: e.target.value }))
                  }
                  className="w-full px-2 py-1 text-xs font-mono border border-slate-300 rounded text-slate-900"
                />
              </div>
              <div>
                <label
                  htmlFor="meter-id-input"
                  className="block text-[11px] text-slate-600 mb-0.5"
                >
                  PG&amp;E Meter
                </label>
                <input
                  id="meter-id-input"
                  type="text"
                  value={well.meter_id}
                  onChange={(e) =>
                    setWell((prev) => ({ ...prev, meter_id: e.target.value }))
                  }
                  className="w-full px-2 py-1 text-xs font-mono border border-slate-300 rounded text-slate-900"
                />
              </div>
            </div>
          </div>

          {/* Official DWR Groundwater Station Summary */}
          <div className="pt-2 border-t border-slate-200 space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-800">Matched DWR / GSA Station</span>
              <span className="font-mono text-sky-700 font-semibold">
                {summary.dwr_monitoring_site_used}
              </span>
            </div>
            <div className="text-[11px] text-slate-600 leading-snug">
              {summary.dwr_monitoring_agency} · {summary.dwr_measurement_method} ({matchedDwrRecords.length} soundings)
            </div>
          </div>

          {/* Hydraulic Lift Inputs */}
          <div className="space-y-3 pt-2 border-t border-slate-200">
            <div className="flex items-center justify-between text-xs">
              <label htmlFor="swl-input" className="font-medium text-slate-700">
                Static Water Level (SWL ft)
              </label>
              <span className="font-mono tabular-nums font-semibold text-slate-900">
                {well.static_depth_to_water_ft.toFixed(1)} ft
              </span>
            </div>
            <input
              id="swl-input"
              type="range"
              min={30}
              max={380}
              step={1.0}
              value={well.static_depth_to_water_ft}
              onChange={(e) => {
                const nextSwl = parseFloat(e.target.value);
                setWell((prev) => {
                  const minSafeBowl = Math.max(
                    prev.ope_test_metadata?.bowl_intake_depth_ft ?? 280,
                    Math.round(nextSwl + prev.drawdown_ft + 40)
                  );
                  setBowlDepthDraft(String(minSafeBowl));
                  return {
                    ...prev,
                    static_depth_to_water_ft: nextSwl,
                    ope_test_metadata: prev.ope_test_metadata
                      ? { ...prev.ope_test_metadata, bowl_intake_depth_ft: minSafeBowl }
                      : undefined,
                  };
                });
              }}
              className="w-full accent-sky-600"
            />

            <div className="flex items-center justify-between text-xs">
              <label htmlFor="drawdown-input" className="font-medium text-slate-700">
                Pumping Drawdown (ft)
              </label>
              <span className="font-mono tabular-nums font-semibold text-slate-900">
                {well.drawdown_ft.toFixed(1)} ft
              </span>
            </div>
            <input
              id="drawdown-input"
              type="range"
              min={2}
              max={120}
              step={0.5}
              value={well.drawdown_ft}
              onChange={(e) => {
                const nextDrawdown = parseFloat(e.target.value);
                setWell((prev) => {
                  const minSafeBowl = Math.max(
                    prev.ope_test_metadata?.bowl_intake_depth_ft ?? 280,
                    Math.round(prev.static_depth_to_water_ft + nextDrawdown + 40)
                  );
                  setBowlDepthDraft(String(minSafeBowl));
                  return {
                    ...prev,
                    drawdown_ft: nextDrawdown,
                    ope_test_metadata: prev.ope_test_metadata
                      ? { ...prev.ope_test_metadata, bowl_intake_depth_ft: minSafeBowl }
                      : undefined,
                  };
                });
              }}
              className="w-full accent-sky-600"
            />

            <div className="grid grid-cols-3 gap-2 pt-1">
              <div>
                <label
                  htmlFor="psi-input"
                  className="block text-[11px] font-medium text-slate-600 mb-1"
                >
                  Discharge PSI
                </label>
                <input
                  id="psi-input"
                  type="number"
                  min={0}
                  max={150}
                  step={1}
                  value={psiDraft}
                  onChange={(e) => {
                    setPsiDraft(e.target.value);
                    const val = parseFloat(e.target.value);
                    if (!Number.isNaN(val) && val >= 0) {
                      setWell((prev) => ({ ...prev, discharge_pressure_psi: val }));
                    }
                  }}
                  onBlur={() => {
                    const val = Math.max(0, parseFloat(psiDraft) || 0);
                    setPsiDraft(String(val));
                    setWell((prev) => ({ ...prev, discharge_pressure_psi: val }));
                  }}
                  className="w-full px-2 py-1.5 text-xs font-mono border border-slate-300 rounded text-slate-900"
                />
              </div>
              <div>
                <label
                  htmlFor="friction-input"
                  className="block text-[11px] font-medium text-slate-600 mb-1"
                >
                  Friction Hf (ft)
                </label>
                <input
                  id="friction-input"
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  value={frictionDraft}
                  onChange={(e) => {
                    setFrictionDraft(e.target.value);
                    const val = parseFloat(e.target.value);
                    if (!Number.isNaN(val) && val >= 0) {
                      setWell((prev) => ({ ...prev, friction_loss_ft: val }));
                    }
                  }}
                  onBlur={() => {
                    const val = Math.max(0, parseFloat(frictionDraft) || 0);
                    setFrictionDraft(String(val));
                    setWell((prev) => ({ ...prev, friction_loss_ft: val }));
                  }}
                  className="w-full px-2 py-1.5 text-xs font-mono border border-slate-300 rounded text-slate-900"
                />
              </div>
              <div>
                <label
                  htmlFor="bowl-depth-input"
                  className="block text-[11px] font-medium text-slate-600 mb-1"
                >
                  Bowl Depth (ft)
                </label>
                <input
                  id="bowl-depth-input"
                  type="number"
                  min={50}
                  max={1200}
                  step={5}
                  value={bowlDepthDraft}
                  onChange={(e) => {
                    setBowlDepthDraft(e.target.value);
                    const val = parseFloat(e.target.value);
                    if (!Number.isNaN(val) && val >= 20) {
                      setWell((prev) => ({
                        ...prev,
                        ope_test_metadata: prev.ope_test_metadata
                          ? { ...prev.ope_test_metadata, bowl_intake_depth_ft: val }
                          : undefined,
                      }));
                    }
                  }}
                  onBlur={() => {
                    const val = Math.max(
                      40,
                      parseFloat(bowlDepthDraft) ||
                        Math.round(well.static_depth_to_water_ft + well.drawdown_ft + 45)
                    );
                    setBowlDepthDraft(String(val));
                    setWell((prev) => ({
                      ...prev,
                      ope_test_metadata: prev.ope_test_metadata
                        ? { ...prev.ope_test_metadata, bowl_intake_depth_ft: val }
                        : undefined,
                    }));
                  }}
                  className="w-full px-2 py-1.5 text-xs font-mono border border-slate-300 rounded text-slate-900"
                />
              </div>
            </div>

            <div className="flex items-center justify-between text-xs pt-1">
              <label htmlFor="ope-input" className="font-medium text-slate-700">
                Overall Plant Efficiency (OPE)
              </label>
              <span className="font-mono tabular-nums font-semibold text-sky-700">
                {(well.ope * 100).toFixed(1)}%
              </span>
            </div>
            <input
              id="ope-input"
              type="range"
              min={0.35}
              max={0.78}
              step={0.01}
              value={well.ope}
              onChange={(e) =>
                setWell((prev) => ({
                  ...prev,
                  ope: parseFloat(e.target.value),
                }))
              }
              className="w-full accent-sky-600"
            />

            <div>
              <label
                htmlFor="eff-source-select"
                className="block text-[11px] font-medium text-slate-600 mb-1"
              >
                Evidentiary OPE Source Tier
              </label>
              <select
                id="eff-source-select"
                value={well.efficiency_source}
                onChange={(e) => {
                  const nextTier = e.target.value as EfficiencySource;
                  setWell((prev) => {
                    let nextOpe = prev.ope;
                    if (nextTier === EfficiencySource.REGIONAL_ESTIMATE) {
                      nextOpe = TIER2_REGIONAL_OPE;
                    } else if (nextTier === EfficiencySource.MANUFACTURER_DEFAULT) {
                      nextOpe = TIER1_MANUFACTURER_OPE;
                    }
                    return {
                      ...prev,
                      efficiency_source: nextTier,
                      ope: nextOpe,
                    };
                  });
                }}
                className="w-full px-2.5 py-1.5 text-xs font-mono bg-white border border-slate-300 rounded text-slate-800"
              >
                <option value={EfficiencySource.CERTIFIED_APET}>
                  TIER 3: CERTIFIED_APET (Highest Weight)
                </option>
                <option value={EfficiencySource.REGIONAL_ESTIMATE}>
                  TIER 2: REGIONAL_ESTIMATE (0.53 Baseline)
                </option>
                <option value={EfficiencySource.MANUFACTURER_DEFAULT}>
                  TIER 1: MANUFACTURER_DEFAULT (0.68 Ceiling)
                </option>
              </select>
            </div>
          </div>

          {/* Forensic Anomaly Power Thresholds */}
          <div className="space-y-2.5 pt-3 border-t border-slate-200">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-800">
                Forensic Plausibility Envelope (kW)
              </span>
              <button
                type="button"
                onClick={() => handleAutoFitKwEnvelope(activeIntervals)}
                className="px-2 py-0.5 text-[11px] font-medium text-sky-700 bg-sky-50 hover:bg-sky-100 border border-sky-200 rounded transition-colors whitespace-nowrap"
              >
                Auto-Fit to Meter
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="min-kw-input"
                  className="block text-[11px] text-slate-600 mb-1"
                >
                  Min Active Lift (kW)
                </label>
                <input
                  id="min-kw-input"
                  type="number"
                  min={1}
                  max={250}
                  step={1}
                  value={minKwDraft}
                  onChange={(e) => {
                    setMinKwDraft(e.target.value);
                    const val = parseFloat(e.target.value);
                    if (!Number.isNaN(val) && val >= 1) {
                      setWell((prev) => ({
                        ...prev,
                        min_operating_kw: val,
                      }));
                    }
                  }}
                  onBlur={() => {
                    const val = Math.max(1, parseFloat(minKwDraft) || 10);
                    setMinKwDraft(String(val));
                    setWell((prev) => {
                      const nextMax = Math.max(val + 5, prev.max_operating_kw);
                      setMaxKwDraft(String(nextMax));
                      return {
                        ...prev,
                        min_operating_kw: val,
                        max_operating_kw: nextMax,
                      };
                    });
                  }}
                  className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded text-slate-900"
                />
              </div>
              <div>
                <label
                  htmlFor="max-kw-input"
                  className="block text-[11px] text-slate-600 mb-1"
                >
                  Max Before Deadhead (kW)
                </label>
                <input
                  id="max-kw-input"
                  type="number"
                  min={10}
                  max={500}
                  step={1}
                  value={maxKwDraft}
                  onChange={(e) => {
                    setMaxKwDraft(e.target.value);
                    const val = parseFloat(e.target.value);
                    if (!Number.isNaN(val) && val > 0) {
                      setWell((prev) => ({
                        ...prev,
                        max_operating_kw: val,
                      }));
                    }
                  }}
                  onBlur={() => {
                    const val = Math.max(
                      well.min_operating_kw + 5,
                      parseFloat(maxKwDraft) || well.min_operating_kw + 40
                    );
                    setMaxKwDraft(String(val));
                    setWell((prev) => ({
                      ...prev,
                      max_operating_kw: val,
                    }));
                  }}
                  className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded text-slate-900"
                />
              </div>
            </div>
          </div>

          {/* GSA Land IQ Billing & Penalty Inputs */}
          <div className="space-y-2.5 pt-3 border-t border-slate-200">
            <div className="text-xs font-semibold text-slate-800">
              GSA Satellite ET Assessment &amp; Tier Rate
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="land-iq-af-input"
                  className="block text-[11px] text-slate-600 mb-1"
                >
                  Land IQ Billed (AF)
                </label>
                <input
                  id="land-iq-af-input"
                  type="number"
                  min={0}
                  max={5000}
                  step={0.5}
                  value={landIqDraft}
                  onChange={(e) => {
                    setLandIqDraft(e.target.value);
                    const val = parseFloat(e.target.value);
                    if (!Number.isNaN(val) && val >= 0) {
                      setLandIqBilledAf(val);
                    }
                  }}
                  onBlur={() => {
                    const val = Math.max(0, parseFloat(landIqDraft) || 0);
                    setLandIqDraft(String(val));
                    setLandIqBilledAf(val);
                  }}
                  className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded text-slate-900"
                />
              </div>
              <div>
                <label
                  htmlFor="gsa-rate-input"
                  className="block text-[11px] text-slate-600 mb-1"
                >
                  Penalty Rate ($/AF)
                </label>
                <input
                  id="gsa-rate-input"
                  type="number"
                  min={0}
                  max={2000}
                  step={5}
                  value={penaltyRateDraft}
                  onChange={(e) => {
                    setPenaltyRateDraft(e.target.value);
                    const val = parseFloat(e.target.value);
                    if (!Number.isNaN(val) && val >= 0) {
                      setGsaPenaltyRatePerAf(val);
                    }
                  }}
                  onBlur={() => {
                    const val = Math.max(0, parseFloat(penaltyRateDraft) || 0);
                    setPenaltyRateDraft(String(val));
                    setGsaPenaltyRatePerAf(val);
                  }}
                  className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded text-slate-900"
                />
              </div>
            </div>
          </div>

          {/* Custom PG&E Green Button CSV / XML Upload */}
          <div className="space-y-2 pt-3 border-t border-slate-200">
            <label
              htmlFor="pge-csv-upload"
              className="block text-xs font-semibold text-slate-800"
            >
              Ingest PG&amp;E Green Button CSV or XML
            </label>
            <input
              id="pge-csv-upload"
              type="file"
              accept=".csv,.txt,.xml"
              onChange={handleCSVFileUpload}
              className="block w-full text-xs text-slate-600 file:mr-2 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:font-medium file:bg-slate-100 file:text-slate-800 hover:file:bg-slate-200"
            />
            {csvUploadStatus && (
              <div className="text-[11px] text-emerald-700 font-mono">
                {csvUploadStatus}
              </div>
            )}
            {csvError && (
              <div role="alert" className="text-[11px] text-rose-700 font-medium">
                {csvError}
              </div>
            )}
          </div>

          {/* Custom DWR CASGEM CSV Upload */}
          <div className="space-y-2 pt-3 border-t border-slate-200">
            <label
              htmlFor="dwr-csv-upload"
              className="block text-xs font-semibold text-slate-800"
            >
              Ingest DWR CASGEM Groundwater CSV (Optional)
            </label>
            <input
              id="dwr-csv-upload"
              type="file"
              accept=".csv,.txt"
              onChange={handleDWRFileUpload}
              className="block w-full text-xs text-slate-600 file:mr-2 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:font-medium file:bg-slate-100 file:text-slate-800 hover:file:bg-slate-200"
            />
            {dwrUploadStatus && (
              <div className="text-[11px] text-emerald-700 font-mono">
                {dwrUploadStatus}
              </div>
            )}
            {dwrError && (
              <div role="alert" className="text-[11px] text-rose-700 font-medium">
                {dwrError}
              </div>
            )}
          </div>

          <div className="pt-2 border-t border-slate-200 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => {
                handleSelectPreset(selectedPresetId);
                setCustomIntervals(null);
                setCsvUploadStatus(null);
                setCustomDwrCatalog(null);
                setDwrUploadStatus(null);
              }}
              className="w-full py-2 px-3 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded transition-colors"
            >
              Reset Subbasin Defaults
            </button>
          </div>
        </aside>

        {/* Right Main Viewport Stage (8 cols on lg, 9 on xl) */}
        <main className="lg:col-span-8 xl:col-span-9 space-y-6">
          {/* Self-Healing Calibration Diagnostic Banner if >35% of intervals are excluded */}
          {highExclusionWarning && (
            <div
              role="alert"
              className="bg-amber-50 border border-amber-300 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            >
              <div>
                <div className="text-xs font-bold text-amber-900">
                  Calibration Notice: {totalAnomalousIntervals.toLocaleString('en-US')} of{' '}
                  {energizedCount.toLocaleString('en-US')} energized intervals are currently excluded by your kW or Bowl Depth thresholds
                </div>
                <p className="text-xs text-amber-800 mt-0.5">
                  If your pump pulls less than {sanitizedWell.min_operating_kw} kW, more than{' '}
                  {sanitizedWell.max_operating_kw} kW, or pumps deeper than your Bowl Depth setting (
                  {sanitizedWell.ope_test_metadata?.bowl_intake_depth_ft ?? 280} ft), click Auto-Fit to match your meter&apos;s operating range.
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleAutoFitKwEnvelope(activeIntervals)}
                className="px-3 py-1.5 text-xs font-semibold text-white bg-amber-800 hover:bg-amber-900 rounded transition-colors whitespace-nowrap shrink-0"
              >
                Auto-Fit Power &amp; Bowl Depth
              </button>
            </div>
          )}

          {/* 4-Column Reconciliation KPI Strip */}
          <section
            aria-label="Executive Reconciliation Metrics"
            className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4"
          >
            <div className="bg-white border border-slate-200 p-4">
              <div className="text-xs text-slate-500">Audited Physical Extraction</div>
              <div className="mt-1 flex items-baseline">
                <span
                  data-testid="kpi-audited-af"
                  className="text-2xl font-mono tabular-nums font-bold text-slate-900"
                >
                  {summary.total_af_pumped.toFixed(2)}
                </span>
                <span className="text-xs font-mono text-slate-500 ml-1.5">AF</span>
              </div>
              <div className="mt-1.5 text-[11px] font-mono tabular-nums text-slate-500">
                Bracket: [{summary.uncertainty_bracket_total.af_min.toFixed(2)} –{' '}
                {summary.uncertainty_bracket_total.af_max.toFixed(2)} AF]
              </div>
            </div>

            <div className="bg-white border border-slate-200 p-4">
              <div className="text-xs text-slate-500">GSA Land IQ Satellite Billed</div>
              <div className="mt-1 flex items-baseline">
                <span
                  data-testid="kpi-landiq-af"
                  className="text-2xl font-mono tabular-nums font-bold text-rose-700"
                >
                  {summary.land_iq_billed_af.toFixed(2)}
                </span>
                <span className="text-xs font-mono text-slate-500 ml-1.5">AF</span>
              </div>
              <div className="mt-1.5 text-[11px] text-slate-500">
                Remote-sensing canopy ET proxy
              </div>
            </div>

            <div className="bg-white border border-slate-200 p-4">
              <div className="text-xs text-slate-500">Net Satellite Over-Estimation</div>
              <div className="mt-1 flex items-baseline">
                <span
                  data-testid="kpi-discrepancy-af"
                  className={`text-2xl font-mono tabular-nums font-bold ${
                    summary.net_discrepancy_af >= 0 ? 'text-emerald-700' : 'text-amber-700'
                  }`}
                >
                  {summary.net_discrepancy_af >= 0 ? '+' : ''}
                  {summary.net_discrepancy_af.toFixed(2)}
                </span>
                <span className="text-xs font-mono text-slate-500 ml-1.5">
                  AF ({summary.discrepancy_pct >= 0 ? '+' : ''}
                  {summary.discrepancy_pct.toFixed(1)}%)
                </span>
              </div>
              <div className="mt-1.5 text-[11px] font-mono tabular-nums text-slate-500">
                Nominal Lift: {nominalTdh.toFixed(1)} ft ({nominalKwhPerAf.toFixed(1)} kWh/AF)
              </div>
            </div>

            <div className="bg-white border border-slate-200 p-4">
              <div className="text-xs text-slate-500">Contested GSA Penalty Variance</div>
              <div className="mt-1 flex items-baseline">
                <span
                  data-testid="kpi-dollar-variance"
                  className="text-2xl font-mono tabular-nums font-bold text-sky-700"
                >
                  ${summary.dollar_variance.toLocaleString('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </div>
              <div className="mt-1.5 text-[11px] font-mono tabular-nums text-slate-500">
                At ${summary.gsa_penalty_rate_per_af.toFixed(2)}/AF ·{' '}
                {summary.phantom_af_prevented.toFixed(3)} AF phantom excluded
              </div>
            </div>
          </section>

          {/* Dynamic Workspace View */}
          {activeView === 'workspace' && (
            <>
              <HydraulicCharts
                well={sanitizedWell}
                summary={summary}
                matchedDwrRecords={matchedDwrRecords}
              />
              <IntervalLedgerTable
                records={records}
                brokenSuctionCount={summary.broken_suction_intervals}
                deadheadCount={summary.deadhead_overload_intervals}
                cyclingCount={summary.intermittent_cycling_intervals}
                phantomAfPrevented={summary.phantom_af_prevented}
              />
            </>
          )}

          {activeView === 'rebuttal' && (
            <EvidentiaryRebuttalView well={sanitizedWell} summary={summary} />
          )}

          {activeView === 'python_repo' && (
            <PythonRepositoryView
              landIqAf={landIqBilledAf}
              gsaPenaltyRate={gsaPenaltyRatePerAf}
            />
          )}
        </main>
      </div>

      {/* Quiet Regulatory & Engineering Footer */}
      <footer className="mt-auto bg-white border-t border-slate-200 px-6 py-4 text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-2">
        <div>
          SGMA Extraction Auditor &amp; Water Ledger Engine · California Water Code § 10726.4 &amp; CPUC Electric Tariff Rule 17
        </div>
        <div className="font-mono">
          Kaweah (5-022.11) · Tule (5-022.13) · Kings (5-022.08)
        </div>
      </footer>
    </div>
  );
}
