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
  EfficiencySource,
  parsePGEGreenButtonCSV,
  RawEnergyInterval,
  runCompleteSGMAAudit,
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
  const [engineMode, setEngineMode] = useState<
    'ENGINE_A_ALGEBRAIC' | 'ENGINE_B_SCIPY_BRENTQ_NONLINEAR'
  >('ENGINE_A_ALGEBRAIC');

  const defaultIntervals = useMemo(() => generateDefaultPGEIntervals(), []);
  const [customIntervals, setCustomIntervals] = useState<RawEnergyInterval[] | null>(null);
  const [csvUploadStatus, setCsvUploadStatus] = useState<string | null>(null);
  const [csvError, setCsvError] = useState<string | null>(null);

  const activeIntervals = customIntervals ?? defaultIntervals;

  const auditResult = useMemo(() => {
    return runCompleteSGMAAudit({
      well,
      rawIntervals: activeIntervals,
      dwrCatalog: DWR_CASGEM_CATALOG,
      landIqBilledAf,
      gsaPenaltyRatePerAf,
      engineMode,
    });
  }, [well, activeIntervals, landIqBilledAf, gsaPenaltyRatePerAf, engineMode]);

  const { records, summary } = auditResult;

  const nominalTdh = computeTDH(
    well.static_depth_to_water_ft,
    well.drawdown_ft,
    well.discharge_pressure_psi,
    well.friction_loss_ft
  );
  const nominalKwhPerAf = (1.024 * nominalTdh) / well.ope;

  const handleSelectPreset = (presetId: string) => {
    const found = SUBBASIN_PRESETS.find((p) => p.id === presetId);
    if (!found) return;
    setSelectedPresetId(found.id);
    setWell({ ...found.well });
    setLandIqBilledAf(found.landIqBilledAf);
    setGsaPenaltyRatePerAf(found.gsaPenaltyRatePerAf);
    setCsvError(null);
  };

  const handleCSVFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = String(ev.target?.result || '');
        const parsed = parsePGEGreenButtonCSV(text);
        setCustomIntervals(parsed.intervals);
        setCsvUploadStatus(
          `Loaded ${parsed.intervals.length.toLocaleString()} intervals from ${file.name}`
        );
        setCsvError(null);
      } catch (err) {
        setCsvError(err instanceof Error ? err.message : 'Invalid PG&E CSV format.');
      }
    };
    reader.readAsText(file);
  };

  const handleExportHTMLPacket = () => {
    const html = buildEvidentiaryHTMLDocument(well, summary);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `SGMA_Evidentiary_Rebuttal_${summary.apn}_2026.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

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
        {/* Left Control & Parameter Column (4 cols on lg = ~360px) */}
        <aside
          aria-label="Well Hydraulic Calibration and GSA Parameters"
          className="lg:col-span-4 xl:col-span-3 bg-white border border-slate-200 p-5 space-y-5"
        >
          <div className="border-b border-slate-200 pb-3">
            <h1 className="text-sm font-bold text-slate-900">
              Well &amp; Subbasin Calibration
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Deterministic Tulare Lake Basin SGMA Water Ledger
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
            <div className="mt-1.5 text-[11px] text-slate-500 font-mono">
              APN {well.apn} · Well {well.well_id} · Meter {well.meter_id}
            </div>
          </div>

          {/* Hydraulic Engine Selector */}
          <div>
            <span className="block text-xs font-medium text-slate-700 mb-1.5">
              Hydraulic Calculation Engine
            </span>
            <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded">
              <button
                type="button"
                onClick={() => setEngineMode('ENGINE_A_ALGEBRAIC')}
                className={`px-2 py-1.5 text-[11.5px] font-medium rounded transition-colors whitespace-nowrap ${
                  engineMode === 'ENGINE_A_ALGEBRAIC'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Engine A: Algebraic
              </button>
              <button
                type="button"
                onClick={() => setEngineMode('ENGINE_B_SCIPY_BRENTQ_NONLINEAR')}
                className={`px-2 py-1.5 text-[11.5px] font-medium rounded transition-colors whitespace-nowrap ${
                  engineMode === 'ENGINE_B_SCIPY_BRENTQ_NONLINEAR'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Engine B: Brentq
              </button>
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
              min={50}
              max={320}
              step={1.0}
              value={well.static_depth_to_water_ft}
              onChange={(e) =>
                setWell((prev) => ({
                  ...prev,
                  static_depth_to_water_ft: parseFloat(e.target.value),
                }))
              }
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
              min={5}
              max={95}
              step={0.5}
              value={well.drawdown_ft}
              onChange={(e) =>
                setWell((prev) => ({
                  ...prev,
                  drawdown_ft: parseFloat(e.target.value),
                }))
              }
              className="w-full accent-sky-600"
            />

            <div className="grid grid-cols-2 gap-3 pt-1">
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
                  max={120}
                  step={1}
                  value={well.discharge_pressure_psi}
                  onChange={(e) =>
                    setWell((prev) => ({
                      ...prev,
                      discharge_pressure_psi: Math.max(0, parseFloat(e.target.value) || 0),
                    }))
                  }
                  className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded text-slate-900"
                />
              </div>
              <div>
                <label
                  htmlFor="friction-input"
                  className="block text-[11px] font-medium text-slate-600 mb-1"
                >
                  Friction Loss Hf (ft)
                </label>
                <input
                  id="friction-input"
                  type="number"
                  min={0}
                  max={60}
                  step={0.5}
                  value={well.friction_loss_ft}
                  onChange={(e) =>
                    setWell((prev) => ({
                      ...prev,
                      friction_loss_ft: Math.max(0, parseFloat(e.target.value) || 0),
                    }))
                  }
                  className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded text-slate-900"
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
                onChange={(e) =>
                  setWell((prev) => ({
                    ...prev,
                    efficiency_source: e.target.value as EfficiencySource,
                  }))
                }
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
            <div className="text-xs font-semibold text-slate-800">
              Forensic Plausibility Envelope (kW)
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
                  min={5}
                  max={100}
                  step={1}
                  value={well.min_operating_kw}
                  onChange={(e) =>
                    setWell((prev) => ({
                      ...prev,
                      min_operating_kw: Math.max(1, parseFloat(e.target.value) || 10),
                    }))
                  }
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
                  min={50}
                  max={250}
                  step={1}
                  value={well.max_operating_kw}
                  onChange={(e) =>
                    setWell((prev) => ({
                      ...prev,
                      max_operating_kw: Math.max(
                        well.min_operating_kw + 5,
                        parseFloat(e.target.value) || 120
                      ),
                    }))
                  }
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
                  min={1}
                  max={1000}
                  step={0.5}
                  value={landIqBilledAf}
                  onChange={(e) =>
                    setLandIqBilledAf(Math.max(0, parseFloat(e.target.value) || 0))
                  }
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
                  min={10}
                  max={1000}
                  step={5}
                  value={gsaPenaltyRatePerAf}
                  onChange={(e) =>
                    setGsaPenaltyRatePerAf(Math.max(0, parseFloat(e.target.value) || 0))
                  }
                  className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded text-slate-900"
                />
              </div>
            </div>
          </div>

          {/* Custom PG&E Green Button CSV Upload */}
          <div className="space-y-2 pt-3 border-t border-slate-200">
            <label
              htmlFor="pge-csv-upload"
              className="block text-xs font-semibold text-slate-800"
            >
              Ingest Custom PG&amp;E Green Button CSV
            </label>
            <input
              id="pge-csv-upload"
              type="file"
              accept=".csv,.txt"
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

          <div className="pt-2 border-t border-slate-200 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => {
                handleSelectPreset(selectedPresetId);
                setCustomIntervals(null);
                setCsvUploadStatus(null);
              }}
              className="w-full py-2 px-3 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded transition-colors"
            >
              Reset Subbasin Defaults
            </button>
          </div>
        </aside>

        {/* Right Main Viewport Stage (8 cols on lg, 9 on xl) */}
        <main className="lg:col-span-8 xl:col-span-9 space-y-6">
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
                  className="text-2xl font-mono tabular-nums font-bold text-emerald-700"
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
              <HydraulicCharts well={well} summary={summary} />
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
            <EvidentiaryRebuttalView well={well} summary={summary} />
          )}

          {activeView === 'python_repo' && (
            <PythonRepositoryView
              landIqAf={landIqBilledAf}
              gsaPenaltyRate={gsaPenaltyRatePerAf}
              engineMode={engineMode}
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
