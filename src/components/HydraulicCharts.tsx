import React, { useState } from 'react';
import {
  computeTDH,
  evaluateBowlHeadFt,
  evaluatePlantEfficiency,
  GSAReconciliationSummary,
  solveEngineBInterval,
  WellProfile,
} from '../engine/sgmaEngine';

interface HydraulicChartsProps {
  well: WellProfile;
  summary: GSAReconciliationSummary;
}

export const HydraulicCharts: React.FC<HydraulicChartsProps> = ({ well, summary }) => {
  const [activeChartTab, setActiveChartTab] = useState<'seasonal' | 'bowl_curve'>('seasonal');
  const [testKwInput, setTestKwInput] = useState<number>(
    well.ope_test_metadata?.measured_kw_input ?? 88.8
  );

  const months = summary.monthly_breakdown;
  const maxMonthAf = Math.max(
    ...months.map((m) => m.tier1_mfg_ceiling_af * 1.45),
    summary.land_iq_billed_af / Math.max(months.length, 1) * 1.4,
    25
  );

  // Allocate Land IQ satellite ET proportionally across months to contrast against physical lift
  const totalVerified = Math.max(summary.total_af_pumped, 0.001);

  // Engine B Pump Curve points Q from 0 to max_flow_gpm
  const curve = well.pump_curve;
  const nominalTdh = computeTDH(
    well.static_depth_to_water_ft,
    well.drawdown_ft,
    well.discharge_pressure_psi,
    well.friction_loss_ft
  );
  const solvedPoint = solveEngineBInterval(
    testKwInput,
    well.static_depth_to_water_ft,
    well
  );

  const qSteps = 40;
  const curvePoints: Array<{ q: number; head: number; effPct: number; kwReq: number }> = [];
  for (let i = 0; i <= qSteps; i++) {
    const q = (curve.max_flow_gpm / qSteps) * i;
    const head = evaluateBowlHeadFt(q, curve);
    const eff = evaluatePlantEfficiency(q, curve, well.ope);
    const tdhEff = Math.max(nominalTdh, head);
    const kwReq = q > 0 ? (q * tdhEff) / (5308.0 * eff) : 0;
    curvePoints.push({ q, head, effPct: eff * 100, kwReq });
  }

  return (
    <section
      aria-label="Hydraulic Telemetry and Operating Point Visualizations"
      className="bg-white border border-slate-200 p-5"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            01. Hydraulic &amp; Seasonal Extraction Telemetry
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            DWR Station {summary.dwr_monitoring_site_used} · Nominal TDH{' '}
            <span className="font-mono tabular-nums text-slate-700">
              {nominalTdh.toFixed(2)} ft
            </span>{' '}
            · Specific Energy{' '}
            <span className="font-mono tabular-nums text-slate-700">
              {((1.024 * nominalTdh) / well.ope).toFixed(1)} kWh/AF
            </span>
          </p>
        </div>

        <div
          role="tablist"
          aria-label="Chart Mode Selection"
          className="flex items-center gap-1 p-1 bg-slate-100 rounded-md self-start"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeChartTab === 'seasonal'}
            onClick={() => setActiveChartTab('seasonal')}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
              activeChartTab === 'seasonal'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Seasonal Ledger &amp; DWR Drawdown
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeChartTab === 'bowl_curve'}
            onClick={() => setActiveChartTab('bowl_curve')}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
              activeChartTab === 'bowl_curve'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Engine B Non-Linear Bowl Curve (Brentq)
          </button>
        </div>
      </div>

      {activeChartTab === 'seasonal' ? (
        <div className="pt-4">
          <div className="flex flex-wrap items-center justify-between gap-4 text-xs text-slate-600 mb-3">
            <div className="flex flex-wrap items-center gap-4">
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-3 bg-sky-600" />
                <span>Audited Physical Extraction (AF)</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-3 bg-rose-600/85" />
                <span>Land IQ Satellite ET Billed (AF)</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-4 h-0.5 bg-amber-600" />
                <span>Interpolated DWR Static Water Level (ft bgs)</span>
              </span>
            </div>
            <div className="font-mono tabular-nums text-slate-500">
              Uncertainty Bracket: [{summary.uncertainty_bracket_total.af_min.toFixed(2)} –{' '}
              {summary.uncertainty_bracket_total.af_max.toFixed(2)} AF]
            </div>
          </div>

          <div className="w-full overflow-x-auto">
            <svg
              viewBox="0 0 820 270"
              className="w-full h-64 min-w-[600px]"
              role="img"
              aria-label="Monthly comparison of Audited PG&E Groundwater Extraction versus Land IQ Satellite ET and DWR Static Water Level"
            >
              {/* Horizontal Grid Lines */}
              {[0, 0.25, 0.5, 0.75, 1].map((frac, idx) => {
                const y = 220 - frac * 185;
                const afVal = (frac * maxMonthAf).toFixed(0);
                const swlVal = (260 - frac * 180).toFixed(0);
                return (
                  <g key={idx}>
                    <line
                      x1={56}
                      y1={y}
                      x2={760}
                      y2={y}
                      stroke="#e2e8f0"
                      strokeDasharray={idx === 0 ? undefined : '3 3'}
                    />
                    <text
                      x={48}
                      y={y + 4}
                      textAnchor="end"
                      className="fill-slate-500 font-mono text-[10px]"
                    >
                      {afVal} AF
                    </text>
                    <text
                      x={768}
                      y={y + 4}
                      textAnchor="start"
                      className="fill-amber-700 font-mono text-[10px]"
                    >
                      {swlVal} ft
                    </text>
                  </g>
                );
              })}

              {/* Bars per Month */}
              {months.map((m, i) => {
                const groupWidth = 700 / Math.max(months.length, 1);
                const centerX = 56 + groupWidth * (i + 0.5);
                const barW = 24;

                const auditedH = (m.verified_af / maxMonthAf) * 185;
                const auditedY = 220 - auditedH;

                const monthLandIqAf =
                  summary.land_iq_billed_af * (m.verified_af / totalVerified);
                const landIqH = (monthLandIqAf / maxMonthAf) * 185;
                const landIqY = 220 - landIqH;

                // Uncertainty whisker on Audited bar
                const minH = (m.tier2_regional_af / maxMonthAf) * 185;
                const maxH = (m.tier1_mfg_ceiling_af / maxMonthAf) * 185;
                const whiskerTopY = 220 - maxH;
                const whiskerBotY = 220 - minH;

                return (
                  <g key={m.year_month}>
                    {/* Audited Physical Extraction Bar */}
                    <rect
                      x={centerX - barW - 3}
                      y={auditedY}
                      width={barW}
                      height={Math.max(auditedH, 2)}
                      fill="#0284c7"
                    />
                    {/* Tier 1 - Tier 2 Uncertainty Whisker */}
                    <line
                      x1={centerX - barW / 2 - 3}
                      y1={whiskerTopY}
                      x2={centerX - barW / 2 - 3}
                      y2={whiskerBotY}
                      stroke="#0f172a"
                      strokeWidth={1.5}
                    />
                    <line
                      x1={centerX - barW / 2 - 8}
                      y1={whiskerTopY}
                      x2={centerX - barW / 2 + 2}
                      y2={whiskerTopY}
                      stroke="#0f172a"
                      strokeWidth={1.5}
                    />
                    <line
                      x1={centerX - barW / 2 - 8}
                      y1={whiskerBotY}
                      x2={centerX - barW / 2 + 2}
                      y2={whiskerBotY}
                      stroke="#0f172a"
                      strokeWidth={1.5}
                    />

                    {/* Land IQ Billed Bar */}
                    <rect
                      x={centerX + 3}
                      y={landIqY}
                      width={barW}
                      height={Math.max(landIqH, 2)}
                      fill="#e11d48"
                      opacity={0.85}
                    />

                    {/* Value labels above bars */}
                    <text
                      x={centerX - barW / 2 - 3}
                      y={Math.min(auditedY, whiskerTopY) - 8}
                      textAnchor="middle"
                      stroke="#ffffff"
                      strokeWidth={3.5}
                      style={{ paintOrder: 'stroke' }}
                      className="fill-slate-900 font-mono text-[9.5px] font-semibold"
                    >
                      {m.verified_af.toFixed(1)}
                    </text>
                    <text
                      x={centerX + barW / 2 + 3}
                      y={landIqY - 7}
                      textAnchor="middle"
                      stroke="#ffffff"
                      strokeWidth={3.5}
                      style={{ paintOrder: 'stroke' }}
                      className="fill-rose-700 font-mono text-[9.5px] font-medium"
                    >
                      {monthLandIqAf.toFixed(1)}
                    </text>

                    {/* X Axis Month Label */}
                    <text
                      x={centerX}
                      y={240}
                      textAnchor="middle"
                      className="fill-slate-700 font-mono text-[11px] font-medium"
                    >
                      {m.year_month}
                    </text>
                    <text
                      x={centerX}
                      y={254}
                      textAnchor="middle"
                      className="fill-slate-400 font-mono text-[9.5px]"
                    >
                      {m.total_kwh.toFixed(0)} kWh
                    </text>
                  </g>
                );
              })}

              {/* DWR SWL Line Overlay */}
              {months.length > 1 && (
                <polyline
                  fill="none"
                  stroke="#d97706"
                  strokeWidth={2.25}
                  points={months
                    .map((m, i) => {
                      const groupWidth = 700 / months.length;
                      const cx = 56 + groupWidth * (i + 0.5);
                      const frac = (260 - m.mean_swl_ft) / 180;
                      const cy = 220 - Math.min(1, Math.max(0, frac)) * 185;
                      return `${cx},${cy}`;
                    })
                    .join(' ')}
                />
              )}
              {months.map((m, i) => {
                const groupWidth = 700 / Math.max(months.length, 1);
                const cx = 56 + groupWidth * (i + 0.5);
                const frac = (260 - m.mean_swl_ft) / 180;
                const cy = 220 - Math.min(1, Math.max(0, frac)) * 185;
                return (
                  <circle
                    key={`swl-${m.year_month}`}
                    cx={cx}
                    cy={cy}
                    r={3.5}
                    fill="#ffffff"
                    stroke="#d97706"
                    strokeWidth={2}
                  />
                );
              })}
            </svg>
          </div>
        </div>
      ) : (
        <div className="pt-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-3 bg-slate-50 border border-slate-200 p-3">
            <div className="flex items-center gap-3">
              <label
                htmlFor="brentq-kw-probe"
                className="text-xs font-medium text-slate-700 whitespace-nowrap"
              >
                Interval Power Probe (kW):
              </label>
              <input
                id="brentq-kw-probe"
                type="range"
                min={10}
                max={145}
                step={0.5}
                value={testKwInput}
                onChange={(e) => setTestKwInput(parseFloat(e.target.value))}
                className="w-40 accent-sky-600"
              />
              <span className="font-mono tabular-nums text-xs font-semibold text-slate-900">
                {testKwInput.toFixed(1)} kW
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs font-mono tabular-nums">
              <span className="text-slate-600">
                Solved Flow Q*:{' '}
                <strong className="text-sky-700">{solvedPoint.flow_gpm.toFixed(1)} GPM</strong>
              </span>
              <span aria-hidden="true">·</span>
              <span className="text-slate-600">
                Effective TDH*:{' '}
                <strong className="text-slate-900">{solvedPoint.tdh_ft.toFixed(1)} ft</strong>
              </span>
              <span aria-hidden="true">·</span>
              <span className="text-slate-600">
                Solver State: <strong className="text-slate-900">{solvedPoint.flag}</strong>
              </span>
            </div>
          </div>

          <div className="w-full overflow-x-auto">
            <svg
              viewBox="0 0 820 260"
              className="w-full h-60 min-w-[600px]"
              role="img"
              aria-label="Engine B Non-Linear Pump Bowl Head-Capacity Curve H(Q) and Wire-to-Water Efficiency Curve"
            >
              {/* Grid lines */}
              {[0, 0.25, 0.5, 0.75, 1].map((frac, idx) => {
                const y = 215 - frac * 180;
                const headLabel = (frac * curve.head_c * 1.1).toFixed(0);
                const effLabel = (frac * 100).toFixed(0);
                return (
                  <g key={idx}>
                    <line
                      x1={56}
                      y1={y}
                      x2={760}
                      y2={y}
                      stroke="#e2e8f0"
                      strokeDasharray={idx === 0 ? undefined : '3 3'}
                    />
                    <text
                      x={48}
                      y={y + 4}
                      textAnchor="end"
                      className="fill-slate-600 font-mono text-[10px]"
                    >
                      {headLabel} ft
                    </text>
                    <text
                      x={768}
                      y={y + 4}
                      textAnchor="start"
                      className="fill-emerald-700 font-mono text-[10px]"
                    >
                      {effLabel}% OPE
                    </text>
                  </g>
                );
              })}

              {/* X-axis flow ticks */}
              {[0, 0.25, 0.5, 0.75, 1].map((frac, idx) => {
                const x = 56 + frac * 704;
                const qLabel = (frac * curve.max_flow_gpm).toFixed(0);
                return (
                  <g key={idx}>
                    <line x1={x} y1={215} x2={x} y2={220} stroke="#94a3b8" />
                    <text
                      x={x}
                      y={236}
                      textAnchor="middle"
                      className="fill-slate-600 font-mono text-[10px]"
                    >
                      {qLabel} GPM
                    </text>
                  </g>
                );
              })}

              {/* System Nominal TDH Horizontal Reference Line */}
              {(() => {
                const maxH = curve.head_c * 1.1;
                const sysY = 215 - Math.min(1, nominalTdh / maxH) * 180;
                return (
                  <g>
                    <line
                      x1={56}
                      y1={sysY}
                      x2={760}
                      y2={sysY}
                      stroke="#64748b"
                      strokeWidth={1.5}
                      strokeDasharray="6 4"
                    />
                    <text
                      x={64}
                      y={sysY - 6}
                      className="fill-slate-600 font-mono text-[10px]"
                    >
                      System Lift Requirement (TDH = {nominalTdh.toFixed(1)} ft)
                    </text>
                  </g>
                );
              })()}

              {/* Bowl Head Polynomial H(Q) */}
              <polyline
                fill="none"
                stroke="#0284c7"
                strokeWidth={2.5}
                points={curvePoints
                  .map((pt) => {
                    const x = 56 + (pt.q / curve.max_flow_gpm) * 704;
                    const y = 215 - (pt.head / (curve.head_c * 1.1)) * 180;
                    return `${x},${y}`;
                  })
                  .join(' ')}
              />

              {/* Efficiency Curve eta(Q) */}
              <polyline
                fill="none"
                stroke="#059669"
                strokeWidth={2}
                strokeDasharray="4 2"
                points={curvePoints
                  .map((pt) => {
                    const x = 56 + (pt.q / curve.max_flow_gpm) * 704;
                    const y = 215 - (pt.effPct / 100) * 180;
                    return `${x},${y}`;
                  })
                  .join(' ')}
              />

              {/* Solved Brentq Operating Point Marker */}
              {solvedPoint.flow_gpm > 0 && (
                <g>
                  {(() => {
                    const cx = 56 + (solvedPoint.flow_gpm / curve.max_flow_gpm) * 704;
                    const cy = 215 - (solvedPoint.tdh_ft / (curve.head_c * 1.1)) * 180;
                    return (
                      <>
                        <line
                          x1={cx}
                          y1={35}
                          x2={cx}
                          y2={215}
                          stroke="#e11d48"
                          strokeWidth={1}
                          strokeDasharray="2 2"
                        />
                        <circle
                          cx={cx}
                          cy={cy}
                          r={5.5}
                          fill="#e11d48"
                          stroke="#ffffff"
                          strokeWidth={2}
                        />
                        <text
                          x={Math.min(cx + 10, 620)}
                          y={Math.max(cy - 10, 48)}
                          className="fill-rose-700 font-mono text-[10.5px] font-semibold"
                        >
                          Brentq Root ({solvedPoint.flow_gpm.toFixed(0)} GPM, {solvedPoint.tdh_ft.toFixed(1)} ft)
                        </text>
                      </>
                    );
                  })()}
                </g>
              )}
            </svg>
          </div>
        </div>
      )}
    </section>
  );
};
