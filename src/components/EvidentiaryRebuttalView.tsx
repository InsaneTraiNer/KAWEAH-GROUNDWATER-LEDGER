import React, { useState } from 'react';
import { buildEvidentiaryHTMLDocument } from '../data/subbasinPresets';
import { computeTDH, GSAReconciliationSummary, WellProfile } from '../engine/sgmaEngine';

interface EvidentiaryRebuttalViewProps {
  well: WellProfile;
  summary: GSAReconciliationSummary;
}

export const EvidentiaryRebuttalView: React.FC<EvidentiaryRebuttalViewProps> = ({
  well,
  summary,
}) => {
  const [formatMode, setFormatMode] = useState<'rendered' | 'markdown'>('rendered');
  const [copiedNotice, setCopiedNotice] = useState<string | null>(null);

  const nominalTdh = computeTDH(
    well.static_depth_to_water_ft,
    well.drawdown_ft,
    well.discharge_pressure_psi,
    well.friction_loss_ft
  );
  const impliedImpossibleOpe =
    ((1.024 * nominalTdh * summary.land_iq_billed_af) /
      Math.max(summary.total_kwh_consumed, 1.0)) *
    100;

  const markdownPacket = `# ADMINISTRATIVE EVIDENTIARY REBUTTAL & EXTRACTION AUDIT LEDGER
**Jurisdiction:** ${summary.gsa_name} — ${summary.subbasin}
**Statutory Authority:** California Water Code § 10720 et seq.; § 10726.4; 23 CCR § 354.18
**Grower / Legal Entity:** ${summary.client_id} | **APN:** ${summary.apn} | **Well ID:** ${summary.well_id}
**PG&E Service Agreement ID:** ${well.service_agreement_id} | **SmartMeter ID:** ${well.meter_id}
**DWR CASGEM Monitoring Site:** ${summary.dwr_monitoring_site_used} | **Hydraulic Solver:** ${summary.engine_mode}

## I. EXECUTIVE RECONCILIATION SUMMARY
- **1. GSA Land IQ Remote-Sensing ET Billed:** ${summary.land_iq_billed_af.toFixed(2)} AF
- **2. Audited PG&E Physical Extraction:** ${summary.total_af_pumped.toFixed(2)} AF (Metered ${summary.total_kwh_consumed.toLocaleString('en-US', { minimumFractionDigits: 2 })} kWh)
- **3. Physical Uncertainty Bracket [Tier 2 (0.53 OPE) – Tier 1 (0.68 OPE)]:** [${summary.uncertainty_bracket_total.af_min.toFixed(2)} – ${summary.uncertainty_bracket_total.af_max.toFixed(2)} AF]
- **4. Net Satellite Over-Estimation Discrepancy:** ${summary.net_discrepancy_af >= 0 ? '+' : ''}${summary.net_discrepancy_af.toFixed(2)} AF (${summary.discrepancy_pct >= 0 ? '+' : ''}${summary.discrepancy_pct.toFixed(1)}%)
- **5. Contested GSA Over-Pumping Penalty Variance:** $${summary.dollar_variance.toLocaleString('en-US', { minimumFractionDigits: 2 })} (@ $${summary.gsa_penalty_rate_per_af.toFixed(2)}/AF)
- **6. Phantom Water Excluded via Forensic Filter:** ${summary.phantom_af_prevented.toFixed(3)} AF (${summary.broken_suction_intervals} suction loss, ${summary.deadhead_overload_intervals} deadhead, ${summary.intermittent_cycling_intervals} cycling intervals)

## II. THERMODYNAMIC CONSERVATION & HYDRAULIC PROOF
TDH = SWL (${well.static_depth_to_water_ft.toFixed(1)} ft) + Drawdown (${well.drawdown_ft.toFixed(1)} ft) + (2.31 × ${well.discharge_pressure_psi.toFixed(1)} PSI) + Hf (${well.friction_loss_ft.toFixed(1)} ft) = ${nominalTdh.toFixed(2)} ft
Specific Energy = (1.024 × ${nominalTdh.toFixed(2)} ft) / ${well.ope.toFixed(2)} = ${((1.024 * nominalTdh) / well.ope).toFixed(2)} kWh/AF

Even at a brand-new factory pump bowl ceiling (Tier 1 OPE = 68.0%), ${summary.total_kwh_consumed.toLocaleString('en-US', { minimumFractionDigits: 2 })} kWh can physically lift at most ${summary.uncertainty_bracket_total.af_max.toFixed(2)} AF. Land IQ's satellite estimate of ${summary.land_iq_billed_af.toFixed(2)} AF would require an impossible wire-to-water efficiency of ${impliedImpossibleOpe.toFixed(1)}%.

## III. CALIFORNIA EVIDENCE CODE & SGMA LEGAL ARGUMENT
1. **CPUC Revenue-Grade Metering (Cal. Evid. Code § 1271):** PG&E SmartMeter ${well.meter_id} is governed by CPUC Electric Tariff Rule 17 and ANSI C12.20 (±0.2% accuracy).
2. **Official DWR Soundings (Cal. Evid. Code § 1280):** DWR CASGEM Station ${summary.dwr_monitoring_site_used} provides official state groundwater elevation records.
3. **Inadmissibility of Uncalibrated Canopy ET Proxies to Override Physical Metering (Water Code § 10726.4 & 23 CCR § 354.18):** Remote-sensing evapotranspiration measures vegetative canopy vapor flux, conflating vadose-zone winter rainfall storage, capillary fringe uptake, cover crop transpiration, and surface canal seepage with groundwater pumping.`;

  const handleCopyMarkdown = () => {
    navigator.clipboard.writeText(markdownPacket);
    setCopiedNotice('Copied Markdown Rebuttal Packet to clipboard.');
    setTimeout(() => setCopiedNotice(null), 3000);
  };

  const handleDownloadHTML = () => {
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
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="bg-white border border-slate-200 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Administrative GSA Evidentiary Rebuttal Packet
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Prepared for filing before the {summary.gsa_name} Board of Directors &amp; Technical Advisory Committee
          </p>
        </div>

        <div className="flex flex-wrap xl:flex-nowrap items-center gap-2 shrink-0">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-md">
            <button
              type="button"
              onClick={() => setFormatMode('rendered')}
              className={`px-3 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                formatMode === 'rendered'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Formatted Legal Brief
            </button>
            <button
              type="button"
              onClick={() => setFormatMode('markdown')}
              className={`px-3 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                formatMode === 'markdown'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Markdown Source
            </button>
          </div>

          <button
            type="button"
            onClick={handleCopyMarkdown}
            className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded transition-colors whitespace-nowrap shrink-0"
          >
            Copy Markdown
          </button>
          <button
            type="button"
            onClick={handleDownloadHTML}
            className="px-3 py-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded transition-colors whitespace-nowrap shrink-0"
          >
            Download HTML Packet
          </button>
        </div>
      </div>

      {copiedNotice && (
        <div
          role="status"
          className="bg-emerald-50 border border-emerald-200 px-4 py-2.5 text-xs text-emerald-900 font-medium"
        >
          {copiedNotice}
        </div>
      )}

      {formatMode === 'markdown' ? (
        <pre className="bg-slate-900 text-slate-100 p-6 text-xs font-mono overflow-x-auto leading-relaxed border border-slate-800">
          {markdownPacket}
        </pre>
      ) : (
        <article className="bg-white border border-slate-300 p-8 max-w-5xl mx-auto space-y-6">
          <div className="border-b-2 border-slate-900 pb-4">
            <div className="text-xs font-mono text-slate-500">
              ADMINISTRATIVE EVIDENTIARY REBUTTAL PACKET · CALIFORNIA WATER CODE § 10726.4 &amp; 23 CCR § 354.18
            </div>
            <h1 className="text-xl font-bold text-slate-900 mt-1">
              GROUNDWATER EXTRACTION FORENSIC AUDIT &amp; SATELLITE ET REBUTTAL
            </h1>
            <div className="text-xs text-slate-600 mt-1">
              Jurisdiction: <strong className="text-slate-900">{summary.gsa_name}</strong> ({summary.subbasin})
              <span aria-hidden="true"> · </span>
              Respondent: <strong className="font-mono text-slate-900">{summary.client_id}</strong>
              <span aria-hidden="true"> · </span>
              APN: <strong className="font-mono text-slate-900">{summary.apn}</strong>
              <span aria-hidden="true"> · </span>
              Well ID: <strong className="font-mono text-slate-900">{summary.well_id}</strong>
            </div>
          </div>

          {/* Section I: Comparison Table */}
          <div>
            <h3 className="text-sm font-semibold text-slate-900 border-b border-slate-200 pb-1.5 mb-3">
              I. Executive Reconciliation: GSA Satellite ET vs. CPUC Electrical Ledger
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse border border-slate-200">
                <thead>
                  <tr className="bg-slate-50 text-slate-700">
                    <th className="border border-slate-200 py-2 px-3 text-left">Evidentiary Metric</th>
                    <th className="border border-slate-200 py-2 px-3 text-right">Volume / Valuation</th>
                    <th className="border border-slate-200 py-2 px-3 text-left">Statutory &amp; Engineering Basis</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  <tr>
                    <td className="border border-slate-200 py-2 px-3 font-medium">
                      1. GSA Land IQ Remote-Sensing ET Billed
                    </td>
                    <td className="border border-slate-200 py-2 px-3 text-right font-mono tabular-nums font-bold text-rose-700">
                      {summary.land_iq_billed_af.toFixed(2)} AF
                    </td>
                    <td className="border border-slate-200 py-2 px-3 text-slate-600">
                      Uncalibrated satellite canopy energy-balance model (SEBAL/METRIC)
                    </td>
                  </tr>
                  <tr>
                    <td className="border border-slate-200 py-2 px-3 font-medium">
                      2. Audited PG&amp;E Physical Hydraulic Extraction
                    </td>
                    <td className="border border-slate-200 py-2 px-3 text-right font-mono tabular-nums font-bold text-emerald-700">
                      {summary.total_af_pumped.toFixed(2)} AF
                    </td>
                    <td className="border border-slate-200 py-2 px-3 text-slate-600">
                      CPUC Tariff Rule 17 SmartMeter ({summary.total_kwh_consumed.toLocaleString('en-US', { minimumFractionDigits: 1 })} kWh) + DWR SWL ({summary.dwr_monitoring_site_used})
                    </td>
                  </tr>
                  <tr>
                    <td className="border border-slate-200 py-2 px-3 font-medium">
                      3. Three-Tier Evidentiary Uncertainty Bracket
                    </td>
                    <td className="border border-slate-200 py-2 px-3 text-right font-mono tabular-nums text-slate-800">
                      [{summary.uncertainty_bracket_total.af_min.toFixed(2)} – {summary.uncertainty_bracket_total.af_max.toFixed(2)} AF]
                    </td>
                    <td className="border border-slate-200 py-2 px-3 text-slate-600">
                      Bounded between Tier 2 Regional OPE (0.53) and Tier 1 New Bowl Ceiling OPE (0.68)
                    </td>
                  </tr>
                  <tr>
                    <td className="border border-slate-200 py-2 px-3 font-medium">
                      4. Net Satellite Over-Estimation Discrepancy
                    </td>
                    <td className="border border-slate-200 py-2 px-3 text-right font-mono tabular-nums font-semibold text-slate-900">
                      {summary.net_discrepancy_af >= 0 ? '+' : ''}
                      {summary.net_discrepancy_af.toFixed(2)} AF (
                      {summary.discrepancy_pct >= 0 ? '+' : ''}
                      {summary.discrepancy_pct.toFixed(1)}%)
                    </td>
                    <td className="border border-slate-200 py-2 px-3 text-slate-600">
                      Non-existent groundwater extraction erroneously billed to APN {summary.apn}
                    </td>
                  </tr>
                  <tr>
                    <td className="border border-slate-200 py-2 px-3 font-medium">
                      5. Contested GSA Tier Penalty Abatement
                    </td>
                    <td className="border border-slate-200 py-2 px-3 text-right font-mono tabular-nums font-bold text-sky-700">
                      ${summary.dollar_variance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="border border-slate-200 py-2 px-3 text-slate-600">
                      Evaluated at GSA Tier Penalty Rate of ${summary.gsa_penalty_rate_per_af.toFixed(2)}/AF
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Section II: Thermodynamic Proof */}
          <div>
            <h3 className="text-sm font-semibold text-slate-900 border-b border-slate-200 pb-1.5 mb-2.5">
              II. Thermodynamic Conservation &amp; Certified Pump Engineering Proof
            </h3>
            <p className="text-xs text-slate-700 leading-relaxed">
              Lifting 1.00 Acre-Foot (325,851.43 US gallons) of water against a measured Total Dynamic Head (TDH)
              requires an invariant physical work input governed by{' '}
              <code className="bg-slate-100 px-1.5 py-0.5 text-slate-900">
                kWh/AF = (1.024 × TDH) / OPE
              </code>
              . Across the 2026 irrigation season, PG&amp;E Revenue SmartMeter{' '}
              <span className="font-mono font-semibold">{well.meter_id}</span> (Service Agreement{' '}
              <span className="font-mono">{well.service_agreement_id}</span>) recorded{' '}
              <strong className="font-mono">{summary.total_kwh_consumed.toLocaleString('en-US', { minimumFractionDigits: 2 })} kWh</strong>{' '}
              against a nominal TDH of <strong className="font-mono">{nominalTdh.toFixed(2)} ft</strong> and a certified
              Overall Plant Efficiency (OPE) of <strong className="font-mono">{(well.ope * 100).toFixed(1)}%</strong>.
            </p>
            <p className="text-xs text-slate-700 leading-relaxed mt-2">
              Even if Well <span className="font-mono">{summary.well_id}</span> operated at the theoretical physical
              ceiling of a brand-new factory pump bowl (<strong>Tier 1 OPE = 68.0%</strong>), the metered electricity
              could physically lift at most{' '}
              <strong className="font-mono">{summary.uncertainty_bracket_total.af_max.toFixed(2)} AF</strong>. For the
              GSA&apos;s Land IQ remote-sensing estimate of{' '}
              <strong className="font-mono">{summary.land_iq_billed_af.toFixed(2)} AF</strong> to occur physically, the
              pump would have had to achieve an impossible wire-to-water efficiency of{' '}
              <strong className="font-mono text-rose-700">{impliedImpossibleOpe.toFixed(1)}%</strong>.
            </p>
          </div>

          {/* Section III: Monthly Breakdown Table */}
          <div>
            <h3 className="text-sm font-semibold text-slate-900 border-b border-slate-200 pb-1.5 mb-3">
              III. Monthly Extraction &amp; Forensic Anomaly Exclusion Schedule
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse border border-slate-200">
                <thead>
                  <tr className="bg-slate-50 text-slate-700">
                    <th className="border border-slate-200 py-2 px-2.5 text-left">Month</th>
                    <th className="border border-slate-200 py-2 px-2.5 text-right">Active Hours</th>
                    <th className="border border-slate-200 py-2 px-2.5 text-right">Metered kWh</th>
                    <th className="border border-slate-200 py-2 px-2.5 text-right">Mean SWL (ft)</th>
                    <th className="border border-slate-200 py-2 px-2.5 text-right">Mean TDH (ft)</th>
                    <th className="border border-slate-200 py-2 px-2.5 text-right">Mean Flow (GPM)</th>
                    <th className="border border-slate-200 py-2 px-2.5 text-right">Anomalies Excluded</th>
                    <th className="border border-slate-200 py-2 px-2.5 text-right">Audited Lift (AF)</th>
                    <th className="border border-slate-200 py-2 px-2.5 text-right">Bracket [Tier 2 – Tier 1]</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-mono tabular-nums">
                  {summary.monthly_breakdown.map((m) => (
                    <tr key={m.year_month}>
                      <td className="border border-slate-200 py-1.5 px-2.5">{m.year_month}</td>
                      <td className="border border-slate-200 py-1.5 px-2.5 text-right">
                        {m.active_pumping_hours.toFixed(2)}
                      </td>
                      <td className="border border-slate-200 py-1.5 px-2.5 text-right">
                        {m.total_kwh.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="border border-slate-200 py-1.5 px-2.5 text-right">
                        {m.mean_swl_ft.toFixed(1)}
                      </td>
                      <td className="border border-slate-200 py-1.5 px-2.5 text-right">
                        {m.mean_tdh_ft.toFixed(1)}
                      </td>
                      <td className="border border-slate-200 py-1.5 px-2.5 text-right">
                        {m.mean_flow_gpm.toFixed(1)}
                      </td>
                      <td className="border border-slate-200 py-1.5 px-2.5 text-right text-slate-600">
                        {m.anomalous_intervals_excluded} ({m.phantom_af_excluded.toFixed(3)} AF)
                      </td>
                      <td className="border border-slate-200 py-1.5 px-2.5 text-right font-bold text-slate-900">
                        {m.verified_af.toFixed(3)}
                      </td>
                      <td className="border border-slate-200 py-1.5 px-2.5 text-right text-slate-600">
                        [{m.tier2_regional_af.toFixed(3)} – {m.tier1_mfg_ceiling_af.toFixed(3)}]
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section IV: Legal Argument */}
          <div className="bg-slate-50 border border-slate-200 p-4 space-y-2.5 text-xs text-slate-700 leading-relaxed">
            <h3 className="text-sm font-semibold text-slate-900">
              IV. Legal &amp; Regulatory Rebuttal Brief (California Evidence Code &amp; SGMA)
            </h3>
            <p>
              <strong>1. Evidentiary Presumption of CPUC Revenue Metering (Cal. Evid. Code §§ 640, 1271):</strong>{' '}
              Pacific Gas &amp; Electric 15-minute interval records are continuously calibrated under CPUC Electric
              Tariff Rule 17 and ANSI C12.20 revenue accuracy standards (±0.2%). They constitute contemporaneous
              business records admissible under California Evidence Code § 1271.
            </p>
            <p>
              <strong>2. Official Hydrologic Records (Cal. Evid. Code § 1280):</strong>{' '}
              Groundwater depth soundings from DWR CASGEM Station{' '}
              <span className="font-mono">{summary.dwr_monitoring_site_used}</span> constitute official state records
              under California Evidence Code § 1280 and 23 CCR § 354.34.
            </p>
            <p>
              <strong>3. Inadmissibility of Satellite Canopy ET Proxies to Override Physical Metering (Water Code § 10726.4 &amp; 23 CCR § 354.18):</strong>{' '}
              Land IQ satellite evapotranspiration models measure total vegetative vapor flux—conflating vadose-zone
              winter precipitation storage, capillary fringe uptake, cover crop transpiration, advective wind transfer,
              and surface water seepage with groundwater pumping. Under California Water Code § 10726.4(a)(2) and
              Proposition 26/218 proportionality mandates, a GSA cannot assess over-pumping penalties on water that
              thermodynamic conservation proves never exited the wellhead.
            </p>
          </div>
        </article>
      )}
    </div>
  );
};
