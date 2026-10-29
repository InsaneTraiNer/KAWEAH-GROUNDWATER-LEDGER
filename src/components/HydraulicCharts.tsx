import React, { useState } from 'react';
import {
  computeTDH,
  DWRMonitoringRecord,
  GSAReconciliationSummary,
  WellProfile,
} from '../engine/sgmaEngine';

interface HydraulicChartsProps {
  well: WellProfile;
  summary: GSAReconciliationSummary;
  matchedDwrRecords: DWRMonitoringRecord[];
}

export const HydraulicCharts: React.FC<HydraulicChartsProps> = ({
  well,
  summary,
  matchedDwrRecords,
}) => {
  const [activeChartTab, setActiveChartTab] = useState<'seasonal' | 'dwr_telemetry'>('seasonal');

  const months = summary.monthly_breakdown;
  const maxMonthAf = Math.max(
    ...months.map((m) => m.tier1_mfg_ceiling_af * 1.45),
    (summary.land_iq_billed_af / Math.max(months.length, 1)) * 1.4,
    25
  );

  // Allocate Land IQ satellite ET proportionally across months to contrast against physical lift
  const totalVerified = Math.max(summary.total_af_pumped, 0.001);

  const nominalTdh = computeTDH(
    well.static_depth_to_water_ft,
    well.drawdown_ft,
    well.discharge_pressure_psi,
    well.friction_loss_ft
  );

  return (
    <section
      aria-label="Hydraulic Telemetry and Official DWR Groundwater Soundings"
      className="bg-white border border-slate-200 p-5"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            01. Hydraulic &amp; Seasonal Extraction Telemetry
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            DWR Station <span className="font-mono text-slate-700">{summary.dwr_monitoring_site_used}</span> ({summary.dwr_monitoring_agency}) · Nominal TDH{' '}
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
            aria-selected={activeChartTab === 'dwr_telemetry'}
            onClick={() => setActiveChartTab('dwr_telemetry')}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
              activeChartTab === 'dwr_telemetry'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Official DWR / GSA Soundings ({matchedDwrRecords.length})
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
        <div className="pt-4 space-y-3">
          <div className="bg-slate-50 border border-slate-200 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
            <div>
              <span className="font-semibold text-slate-900">
                Matched Official Station:
              </span>{' '}
              <span className="font-mono text-sky-700 font-semibold">
                {summary.dwr_monitoring_site_used}
              </span>{' '}
              <span className="text-slate-600">
                ({well.latitude.toFixed(4)}° N, {well.longitude.toFixed(4)}° W)
              </span>
            </div>
            <div className="text-slate-600">
              Admissible under <strong>Cal. Evid. Code § 1280</strong> (Official Records) &amp;{' '}
              <strong>§ 1220</strong> (GSA Party Admission)
            </div>
          </div>

          <div className="overflow-x-auto max-h-64 border border-slate-200">
            <table className="w-full text-xs border-collapse">
              <thead className="bg-slate-50 text-slate-700 sticky top-0">
                <tr>
                  <th className="border-b border-slate-200 py-2 px-3 text-left">Date</th>
                  <th className="border-b border-slate-200 py-2 px-3 text-left">State Well / Site Code</th>
                  <th className="border-b border-slate-200 py-2 px-3 text-right">Depth to Water (ft bgs)</th>
                  <th className="border-b border-slate-200 py-2 px-3 text-right">GSE (ft NAVD88)</th>
                  <th className="border-b border-slate-200 py-2 px-3 text-left">Measurement Method</th>
                  <th className="border-b border-slate-200 py-2 px-3 text-left">Co-Monitoring Agency</th>
                  <th className="border-b border-slate-200 py-2 px-3 text-left">QA Flag</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-mono tabular-nums">
                {matchedDwrRecords.map((rec, idx) => (
                  <tr key={`${rec.site_code}-${rec.measurement_date}-${idx}`} className="hover:bg-slate-50">
                    <td className="py-1.5 px-3 text-slate-900">{rec.measurement_date}</td>
                    <td className="py-1.5 px-3 text-sky-700 font-medium">{rec.site_code}</td>
                    <td className="py-1.5 px-3 text-right font-semibold text-slate-900">
                      {rec.depth_to_water_ft.toFixed(2)} ft
                    </td>
                    <td className="py-1.5 px-3 text-right text-slate-600">
                      {rec.ground_surface_elevation_ft.toFixed(2)} ft
                    </td>
                    <td className="py-1.5 px-3 font-sans text-slate-700">
                      {rec.measurement_method || 'Electronic pressure transducer'}
                    </td>
                    <td className="py-1.5 px-3 font-sans text-slate-700">
                      {rec.monitoring_agency || 'Department of Water Resources'}
                    </td>
                    <td className="py-1.5 px-3 text-emerald-700 font-semibold">{rec.quality_flag}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
};
