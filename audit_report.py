"""
SGMA Extraction Auditor & Water Ledger Engine
Module: audit_report.py

Aggregates 15-minute forensic interval audit records into monthly and seasonal
water ledgers and generates an Administrative GSA Evidentiary Rebuttal Packet
in both Markdown and standalone publication-grade HTML formats.

Explicitly contrasts:
1. The GSA's Land IQ remote-sensing ET billing estimate.
2. The CPUC-regulated PG&E physical electrical ledger total.
3. The California Evidence Code (§§ 640, 1271, 1280) and California Water Code
   (§ 10726.4 / 23 CCR § 354.18) administrative legal brief demonstrating why
   revenue-grade utility metering and physical DWR CASGEM soundings supersede
   uncalibrated satellite canopy evapotranspiration models.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Sequence, Tuple, Union

from anomaly_detection import ForensicAuditBatch
from schemas import (
    GSAReconciliationSummary,
    IntervalAuditRecord,
    IntervalStatus,
    MonthlyExtractionSummary,
    UncertaintyBracket,
    WellProfile,
)


class AuditReportGenerator:
    """
    Aggregates 15-minute interval audit records and renders formal SGMA Administrative
    Evidentiary Rebuttal Packets.
    """

    @classmethod
    def build_reconciliation_summary(
        cls,
        well: WellProfile,
        audit_batch: ForensicAuditBatch,
        land_iq_billed_af: float,
        gsa_penalty_rate_per_af: float,
        dwr_site_code: str = "362077N1193473W001",
        engine_mode: str = "ENGINE_A_ALGEBRAIC",
    ) -> GSAReconciliationSummary:
        """
        Aggregates 15-minute `IntervalAuditRecord` items into monthly summaries and
        computes the seasonal `GSAReconciliationSummary`.
        """
        records = audit_batch.records
        if not records:
            raise ValueError("Cannot generate GSA Reconciliation Summary from empty interval list.")

        by_month: Dict[str, List[IntervalAuditRecord]] = defaultdict(list)
        for rec in records:
            ym = rec.interval_start.strftime("%Y-%m")
            by_month[ym].append(rec)

        monthly_summaries: List[MonthlyExtractionSummary] = []
        total_kwh = 0.0
        total_af = 0.0
        total_af_min = 0.0
        total_af_max = 0.0

        for ym in sorted(by_month.keys()):
            m_recs = by_month[ym]
            m_kwh = sum(r.kwh for r in m_recs)
            m_af = sum(r.calculated_af for r in m_recs)
            m_af_min = sum(r.uncertainty_bracket.af_min for r in m_recs)
            m_af_max = sum(r.uncertainty_bracket.af_max for r in m_recs)

            active_normal = [
                r for r in m_recs if r.status == IntervalStatus.NORMAL and r.calculated_af > 0
            ]
            active_hours = sum(
                max(0.0, (r.interval_end - r.interval_start).total_seconds() / 3600.0) or 0.25
                for r in active_normal
            )
            anomalous = [r for r in m_recs if r.status != IntervalStatus.NORMAL]
            phantom_af = sum(r.raw_unfiltered_af for r in anomalous)

            mean_tdh = (
                sum(r.tdh_ft for r in m_recs) / len(m_recs) if m_recs else well.nominal_tdh_ft
            )
            mean_gpm = (
                sum(r.flow_gpm for r in active_normal) / len(active_normal)
                if active_normal
                else 0.0
            )

            monthly_summaries.append(
                MonthlyExtractionSummary(
                    year_month=ym,
                    total_intervals=len(m_recs),
                    active_pumping_hours=round(active_hours, 2),
                    anomalous_intervals_excluded=len(anomalous),
                    phantom_af_excluded=round(phantom_af, 4),
                    total_kwh=round(m_kwh, 2),
                    mean_tdh_ft=round(mean_tdh, 2),
                    mean_flow_gpm=round(mean_gpm, 1),
                    verified_af=round(m_af, 4),
                    tier2_regional_af=round(m_af_min, 4),
                    tier1_mfg_ceiling_af=round(m_af_max, 4),
                )
            )

            total_kwh += m_kwh
            total_af += m_af
            total_af_min += m_af_min
            total_af_max += m_af_max

        total_af_rounded = round(total_af, 4)
        net_discrepancy_af = round(land_iq_billed_af - total_af_rounded, 4)
        discrepancy_pct = (
            round((net_discrepancy_af / total_af_rounded) * 100.0, 2)
            if total_af_rounded > 0
            else 0.0
        )
        dollar_variance = round(max(0.0, net_discrepancy_af) * gsa_penalty_rate_per_af, 2)

        bracket_total = UncertaintyBracket(
            af_min=round(min(total_af_min, total_af_rounded), 4),
            af_expected=total_af_rounded,
            af_max=round(max(total_af_max, total_af_rounded), 4),
        )

        return GSAReconciliationSummary(
            client_id=well.client_id,
            apn=well.apn,
            well_id=well.well_id,
            subbasin=well.subbasin,
            gsa_name=well.gsa_name,
            audit_period_start=records[0].interval_start,
            audit_period_end=records[-1].interval_end,
            engine_mode=engine_mode,
            total_kwh_consumed=round(total_kwh, 2),
            total_af_pumped=total_af_rounded,
            uncertainty_bracket_total=bracket_total,
            phantom_af_prevented=audit_batch.phantom_af_prevented,
            broken_suction_intervals=audit_batch.broken_suction_count,
            deadhead_overload_intervals=audit_batch.deadhead_overload_count,
            intermittent_cycling_intervals=audit_batch.intermittent_cycling_count,
            land_iq_billed_af=round(land_iq_billed_af, 4),
            net_discrepancy_af=net_discrepancy_af,
            discrepancy_pct=discrepancy_pct,
            gsa_penalty_rate_per_af=round(gsa_penalty_rate_per_af, 2),
            dollar_variance=dollar_variance,
            evidentiary_confidence_tier=well.efficiency_source,
            dwr_monitoring_site_used=dwr_site_code,
            monthly_breakdown=monthly_summaries,
        )

    @classmethod
    def render_markdown_rebuttal(
        cls,
        well: WellProfile,
        summary: GSAReconciliationSummary,
    ) -> str:
        """
        Generates a complete Markdown Administrative GSA Evidentiary Rebuttal Packet.
        """
        apet = well.ope_test_metadata
        apet_line = (
            f"Certified APET by {apet.testing_agency} (License `{apet.technician_license_or_pe}`) on {apet.test_date.isoformat()}"
            if apet
            else f"{well.efficiency_source.value} (OPE = {well.ope:.2f})"
        )

        rows_md = []
        for m in summary.monthly_breakdown:
            rows_md.append(
                f"| {m.year_month} | {m.active_pumping_hours:,.2f} hrs | {m.total_kwh:,.2f} kWh | "
                f"{m.mean_tdh_ft:.1f} ft | {m.mean_flow_gpm:,.1f} GPM | {m.anomalous_intervals_excluded} "
                f"({m.phantom_af_excluded:.3f} AF) | **{m.verified_af:.3f} AF** | "
                f"[{m.tier2_regional_af:.3f} – {m.tier1_mfg_ceiling_af:.3f} AF] |"
            )
        monthly_table = "\n".join(rows_md)

        return f"""# ADMINISTRATIVE EVIDENTIARY REBUTTAL & EXTRACTION AUDIT LEDGER
**Jurisdiction:** {summary.gsa_name} — {summary.subbasin}  
**Statutory Authority:** Sustainable Groundwater Management Act (California Water Code § 10720 et seq.; § 10726.4; 23 CCR § 354.18)  
**Grower / Legal Entity:** `{summary.client_id}`  
**Assessor Parcel Number (APN):** `{summary.apn}`  
**Well Identifier:** `{summary.well_id}` | **PG&E Service Agreement ID:** `{well.service_agreement_id}` | **Meter ID:** `{well.meter_id}`  
**Audit Period:** {summary.audit_period_start.strftime('%Y-%m-%d %H:%M %Z')} to {summary.audit_period_end.strftime('%Y-%m-%d %H:%M %Z')}  
**Hydraulic Solver Engine:** `{summary.engine_mode}` | **DWR CASGEM Reference Station:** `{summary.dwr_monitoring_site_used}`  

---

## I. EXECUTIVE RECONCILIATION SUMMARY: SATELLITE ET VS. PHYSICAL ELECTRICAL LEDGER

| Evidentiary Metric | Valuation / Volume | Statutory & Engineering Basis |
| :--- | :--- | :--- |
| **1. GSA Land IQ Remote-Sensing ET Assessment** | **{summary.land_iq_billed_af:,.2f} AF** | Proprietary satellite canopy energy-balance model (SEBAL/METRIC) |
| **2. Audited PG&E Physical Hydraulic Extraction** | **{summary.total_af_pumped:,.2f} AF** | CPUC-regulated 15-min revenue meter ({summary.total_kwh_consumed:,.1f} kWh) + DWR SWL |
| **3. Physical Uncertainty Bracket (Tier 2 – Tier 1)** | **[{summary.uncertainty_bracket_total.af_min:,.2f} – {summary.uncertainty_bracket_total.af_max:,.2f} AF]** | Bounded between Regional OPE (0.53) and New Bowl Ceiling OPE (0.68) |
| **4. Net Satellite Over-Estimation Discrepancy** | **{summary.net_discrepancy_af:+,.2f} AF ({summary.discrepancy_pct:+.1f}%)** | Unpumped volume erroneously attributed to groundwater extraction |
| **5. Contested GSA Over-Pumping Penalty Variance** | **${summary.dollar_variance:,.2f}** | Evaluated at GSA Tier Penalty Rate of ${summary.gsa_penalty_rate_per_af:,.2f}/AF |
| **6. Phantom Water Excluded via Forensic Filter** | **{summary.phantom_af_prevented:,.3f} AF** | {summary.broken_suction_intervals} suction-loss, {summary.deadhead_overload_intervals} deadhead, {summary.intermittent_cycling_intervals} cycling intervals |

---

## II. CERTIFIED HYDRAULIC PARAMETERS & THERMODYNAMIC CONSERVATION PROOF

Groundwater extraction is governed by the First Law of Thermodynamics and classical fluid mechanics: lifting a known mass of water against a measured gravity and pressure head requires an invariant minimum input of electrical energy.

$$\\text{{TDH (ft)}} = \\text{{SWL}}(t) + \\text{{Drawdown}} + (\\text{{Discharge PSI}} \\times 2.31) + H_f$$

$$\\text{{Specific Energy (kWh/AF)}} = \\frac{{1.024 \\times \\text{{TDH}}}}{{\\text{{OPE}}}}$$

- **Baseline Static Depth-to-Water (SWL):** `{well.static_depth_to_water_ft:.1f} ft` (interpolated daily across season via DWR CASGEM Station `{summary.dwr_monitoring_site_used}`)
- **Pumping Drawdown:** `{well.drawdown_ft:.1f} ft` | **Discharge Pressure:** `{well.discharge_pressure_psi:.1f} PSI` (`{well.discharge_pressure_psi * 2.31:.2f} ft` head) | **Column Friction ($H_f$):** `{well.friction_loss_ft:.1f} ft`
- **Nominal Total Dynamic Head (TDH):** `{well.nominal_tdh_ft:.2f} ft`
- **Overall Plant Efficiency (OPE):** `{well.ope * 100:.1f}%` ({apet_line})
- **Operating Demand Plausibility Envelope:** `[{well.min_operating_kw:.1f} kW – {well.max_operating_kw:.1f} kW]`

Even if this well operated at the theoretical physical ceiling of a brand-new factory pump bowl (**Tier 1 OPE = 0.68**), the `15-minute` electrical energy delivered by PG&E (`{summary.total_kwh_consumed:,.2f} kWh`) could physically lift at most **`{summary.uncertainty_bracket_total.af_max:,.2f} AF`** from the aquifer. The GSA's Land IQ assessment of **`{summary.land_iq_billed_af:,.2f} AF`** violates conservation of energy by requiring either an impossible wire-to-water efficiency exceeding `{((1.024 * well.nominal_tdh_ft * summary.land_iq_billed_af) / max(summary.total_kwh_consumed, 1.0)) * 100:.1f}%` or unrecorded off-grid generation that does not exist on APN `{summary.apn}`.

---

## III. MONTHLY & SEASONAL EXTRACTION LEDGER (15-MINUTE INTERVAL AGGREGATION)

| Month | Active Pumping Hours | Metered Energy (kWh) | Mean TDH (ft) | Mean Flow (GPM) | Forensic Anomalies Excluded | Audited Extraction (AF) | Evidentiary Bracket [Tier 2 – Tier 1] |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
{monthly_table}
| **TOTAL** | **{sum(m.active_pumping_hours for m in summary.monthly_breakdown):,.2f} hrs** | **{summary.total_kwh_consumed:,.2f} kWh** | **—** | **—** | **{summary.broken_suction_intervals + summary.deadhead_overload_intervals + summary.intermittent_cycling_intervals} ({summary.phantom_af_prevented:.3f} AF)** | **{summary.total_af_pumped:,.3f} AF** | **[{summary.uncertainty_bracket_total.af_min:,.3f} – {summary.uncertainty_bracket_total.af_max:,.3f} AF]** |

---

## IV. LEGAL & REGULATORY REBUTTAL BRIEF (CALIFORNIA EVIDENCE CODE & SGMA)

### 1. Evidentiary Superiority of CPUC Revenue-Grade Metering & Official DWR Soundings
1. **CPUC Electric Tariff Rule 17 & ANSI C12.20 Accuracy Class (Cal. Evid. Code § 1271):** Pacific Gas & Electric (PG&E) SmartMeter interval telemetry (`Meter ID: {well.meter_id}`, `SAID: {well.service_agreement_id}`) is continuously calibrated and audited under California Public Utilities Commission (CPUC) authority to within $\\pm 0.2\\%$ to $\\pm 0.5\\%$ revenue accuracy. These 15-minute intervals constitute contemporaneous business records admissible under California Evidence Code § 1271.
2. **Official DWR / CASGEM Groundwater Elevations (Cal. Evid. Code § 1280):** Physical depth-to-water soundings recorded in the California Department of Water Resources (DWR) Monitoring Network (`Station {summary.dwr_monitoring_site_used}`) are official public records made by public employees within the scope of duty under California Evidence Code § 1280 and 23 CCR § 354.34.
3. **Inadmissibility of Uncalibrated Remote-Sensing Proxy Estimates to Override Physical Metering (Water Code § 10726.4 & 23 CCR § 354.18):** Remote-sensing evapotranspiration (Land IQ) does not measure groundwater pumping; it estimates total canopy consumptive vapour flux from multispectral satellite passes every 8–16 days. Canopy ET conflates (a) stored vadose-zone winter precipitation, (b) capillary fringe uptake, (c) cover crop / weed transpiration, (d) adjacent parcel advective heat transfer, and (e) surface water deliveries with groundwater extraction. Under California Water Code § 10726.4(a)(2) and constitutional due process requirements against arbitrary administrative penalties (Proposition 218 / Proposition 26), a GSA cannot levy extraction fees or tier penalties on phantom water that thermodynamic law proves was never pumped from the wellhead.

### 2. Relief Requested
Respondent (`{summary.client_id}`, APN `{summary.apn}`) formally petitions the **{summary.gsa_name}** Board of Directors and Technical Advisory Committee to:
1. Adjust the official groundwater extraction ledger for Well `{summary.well_id}` from `{summary.land_iq_billed_af:,.2f} AF` to **`{summary.total_af_pumped:,.2f} AF`**; and
2. Abate **`${summary.dollar_variance:,.2f}`** in contested over-pumping tier penalties.
"""

    @classmethod
    def render_html_rebuttal(
        cls,
        well: WellProfile,
        summary: GSAReconciliationSummary,
    ) -> str:
        """
        Renders a standalone, print-ready HTML Administrative GSA Evidentiary Rebuttal Packet.
        """
        apet = well.ope_test_metadata
        apet_desc = (
            f"Certified APET ({apet.testing_agency}, License {apet.technician_license_or_pe}, {apet.test_date.isoformat()})"
            if apet
            else f"{well.efficiency_source.value} ({well.ope * 100:.1f}%)"
        )

        implied_impossible_ope = (
            (1.024 * well.nominal_tdh_ft * summary.land_iq_billed_af)
            / max(summary.total_kwh_consumed, 1.0)
        ) * 100.0

        monthly_rows_html = []
        for m in summary.monthly_breakdown:
            monthly_rows_html.append(
                f"""
                <tr>
                  <td class="mono">{m.year_month}</td>
                  <td class="mono num">{m.active_pumping_hours:,.2f}</td>
                  <td class="mono num">{m.total_kwh:,.2f}</td>
                  <td class="mono num">{m.mean_tdh_ft:.1f}</td>
                  <td class="mono num">{m.mean_flow_gpm:,.1f}</td>
                  <td class="mono num">{m.anomalous_intervals_excluded} ({m.phantom_af_excluded:.3f} AF)</td>
                  <td class="mono num strong">{m.verified_af:.3f}</td>
                  <td class="mono num">[{m.tier2_regional_af:.3f} – {m.tier1_mfg_ceiling_af:.3f}]</td>
                </tr>
                """
            )

        return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>SGMA Evidentiary Rebuttal Packet — {summary.client_id} ({summary.apn})</title>
  <style>
    :root {{
      --ink: #0f172a;
      --muted: #475569;
      --border: #cbd5e1;
      --bg-panel: #f8fafc;
      --accent: #0284c7;
      --alert: #b91c1c;
      --ok: #15803d;
    }}
    * {{ box-sizing: border-box; }}
    body {{
      font-family: "IBM Plex Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: var(--ink);
      background: #ffffff;
      margin: 0;
      padding: 40px;
      line-height: 1.55;
      font-size: 14px;
    }}
    .packet {{
      max-width: 1040px;
      margin: 0 auto;
      border: 1px solid var(--border);
      padding: 36px 42px;
    }}
    header {{
      border-bottom: 2px solid var(--ink);
      padding-bottom: 18px;
      margin-bottom: 24px;
    }}
    .kicker {{
      font-family: "IBM Plex Mono", monospace;
      font-size: 11px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--muted);
      margin-bottom: 6px;
    }}
    h1 {{
      font-size: 22px;
      margin: 0 0 8px 0;
      letter-spacing: -0.01em;
    }}
    h2 {{
      font-size: 15px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      border-bottom: 1px solid var(--border);
      padding-bottom: 6px;
      margin-top: 28px;
      margin-bottom: 14px;
    }}
    .meta-grid {{
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
      background: var(--bg-panel);
      border: 1px solid var(--border);
      padding: 14px 16px;
      font-size: 12.5px;
    }}
    .meta-grid div span {{
      display: block;
      color: var(--muted);
      font-size: 11px;
    }}
    .kpi-grid {{
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 14px;
      margin: 20px 0;
    }}
    .kpi-box {{
      border: 1px solid var(--border);
      padding: 14px 16px;
      background: #fff;
    }}
    .kpi-box .label {{
      font-size: 11px;
      color: var(--muted);
      text-transform: uppercase;
    }}
    .kpi-box .val {{
      font-family: "IBM Plex Mono", monospace;
      font-size: 22px;
      font-weight: 700;
      margin-top: 4px;
    }}
    .kpi-box .sub {{
      font-size: 11.5px;
      color: var(--muted);
      margin-top: 4px;
    }}
    table {{
      width: 100%;
      border-collapse: collapse;
      margin: 14px 0 22px 0;
      font-size: 12.5px;
    }}
    th, td {{
      border: 1px solid var(--border);
      padding: 8px 10px;
      text-align: left;
    }}
    th {{
      background: var(--bg-panel);
      font-weight: 600;
      font-size: 11.5px;
    }}
    .mono {{
      font-family: "IBM Plex Mono", monospace;
      font-variant-numeric: tabular-nums;
    }}
    .num {{ text-align: right; }}
    .strong {{ font-weight: 700; }}
    .legal-box {{
      background: var(--bg-panel);
      border: 1px solid var(--border);
      padding: 16px 20px;
      margin-top: 14px;
    }}
    .legal-box h3 {{
      margin-top: 0;
      font-size: 14px;
    }}
    .sig-block {{
      margin-top: 36px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 32px;
      padding-top: 20px;
      border-top: 1px solid var(--border);
    }}
  </style>
</head>
<body>
  <div class="packet">
    <header>
      <div class="kicker">Administrative Evidentiary Rebuttal Packet · California Water Code § 10726.4 &amp; 23 CCR § 354.18</div>
      <h1>GROUNDWATER EXTRACTION FORENSIC AUDIT &amp; SATELLITE ET REBUTTAL</h1>
      <div>Submitted to: <strong>{summary.gsa_name}</strong> ({summary.subbasin})</div>
    </header>

    <div class="meta-grid">
      <div><span>Grower / Legal Entity</span><strong class="mono">{summary.client_id}</strong></div>
      <div><span>Assessor Parcel Number (APN)</span><strong class="mono">{summary.apn}</strong></div>
      <div><span>State / GSA Well ID</span><strong class="mono">{summary.well_id}</strong></div>
      <div><span>PG&amp;E Service Agreement &amp; Meter</span><strong class="mono">SAID {well.service_agreement_id} / Meter {well.meter_id}</strong></div>
      <div><span>DWR CASGEM Monitoring Site</span><strong class="mono">{summary.dwr_monitoring_site_used}</strong></div>
      <div><span>Certified Pump Efficiency Basis</span><strong class="mono">OPE {well.ope * 100:.1f}% · {apet_desc}</strong></div>
    </div>

    <div class="kpi-grid">
      <div class="kpi-box">
        <div class="label">Land IQ Satellite ET Billed</div>
        <div class="val" style="color: var(--alert);">{summary.land_iq_billed_af:,.2f} AF</div>
        <div class="sub">Remote-sensing proxy estimate</div>
      </div>
      <div class="kpi-box">
        <div class="label">Audited Physical Extraction</div>
        <div class="val" style="color: var(--ok);">{summary.total_af_pumped:,.2f} AF</div>
        <div class="sub">Bracket: [{summary.uncertainty_bracket_total.af_min:,.2f} – {summary.uncertainty_bracket_total.af_max:,.2f} AF]</div>
      </div>
      <div class="kpi-box">
        <div class="label">Net Satellite Over-Estimate</div>
        <div class="val">+{summary.net_discrepancy_af:,.2f} AF</div>
        <div class="sub">{summary.discrepancy_pct:+.1f}% variance over physical lift</div>
      </div>
      <div class="kpi-box">
        <div class="label">Contested GSA Penalty</div>
        <div class="val" style="color: var(--accent);">${summary.dollar_variance:,.2f}</div>
        <div class="sub">At ${summary.gsa_penalty_rate_per_af:,.2f}/AF tier penalty rate</div>
      </div>
    </div>

    <h2>I. Thermodynamic &amp; Hydraulic Conservation Proof</h2>
    <p>
      Under classical fluid mechanics and the First Law of Thermodynamics, lifting 1.00 Acre-Foot (325,851.43 US gallons)
      of groundwater against a Total Dynamic Head (TDH) requires an invariant specific electrical energy of
      <span class="mono">kWh/AF = (1.024 × TDH) / OPE</span>.
      Across the audited period, revenue-grade PG&amp;E SmartMeter <span class="mono">{well.meter_id}</span> recorded a cumulative energy consumption of
      <strong class="mono">{summary.total_kwh_consumed:,.2f} kWh</strong> against a nominal TDH of <strong class="mono">{well.nominal_tdh_ft:.2f} ft</strong>
      (SWL <span class="mono">{well.static_depth_to_water_ft:.1f} ft</span> + Drawdown <span class="mono">{well.drawdown_ft:.1f} ft</span> +
      Discharge Head <span class="mono">{well.discharge_pressure_psi * 2.31:.2f} ft</span> + Friction <span class="mono">{well.friction_loss_ft:.1f} ft</span>).
    </p>
    <p>
      Even if Well <span class="mono">{summary.well_id}</span> operated at the upper physical boundary of a brand-new factory pump bowl
      (<strong>Tier 1 OPE = 68.0%</strong>), the metered electrical energy could physically lift at most
      <strong class="mono">{summary.uncertainty_bracket_total.af_max:,.2f} AF</strong>.
      For the GSA's Land IQ satellite estimate of <strong class="mono">{summary.land_iq_billed_af:,.2f} AF</strong> to be physically true,
      the well pump would have had to operate at an impossible wire-to-water efficiency of
      <strong class="mono">{implied_impossible_ope:.1f}%</strong>.
      Additionally, forensic interval screening isolated and excluded <strong class="mono">{summary.phantom_af_prevented:.3f} AF</strong> of
      non-discharging electrical consumption ({summary.broken_suction_intervals} broken-suction/idle intervals,
      {summary.deadhead_overload_intervals} closed-valve deadhead intervals, and {summary.intermittent_cycling_intervals} short-cycling intervals).
    </p>

    <h2>II. Monthly Extraction &amp; Forensic Audit Ledger</h2>
    <table>
      <thead>
        <tr>
          <th>Year-Month</th>
          <th class="num">Active Hours</th>
          <th class="num">Metered kWh</th>
          <th class="num">Mean TDH (ft)</th>
          <th class="num">Mean Flow (GPM)</th>
          <th class="num">Anomalies Excluded</th>
          <th class="num">Audited Extraction (AF)</th>
          <th class="num">Uncertainty Bracket [Tier 2 – Tier 1]</th>
        </tr>
      </thead>
      <tbody>
        {"".join(monthly_rows_html)}
      </tbody>
      <tfoot>
        <tr class="strong" style="background: var(--bg-panel);">
          <td>SEASONAL TOTAL</td>
          <td class="mono num">{sum(m.active_pumping_hours for m in summary.monthly_breakdown):,.2f}</td>
          <td class="mono num">{summary.total_kwh_consumed:,.2f}</td>
          <td class="mono num">{well.nominal_tdh_ft:.1f}</td>
          <td class="mono num">—</td>
          <td class="mono num">{summary.broken_suction_intervals + summary.deadhead_overload_intervals + summary.intermittent_cycling_intervals} ({summary.phantom_af_prevented:.3f} AF)</td>
          <td class="mono num">{summary.total_af_pumped:,.3f} AF</td>
          <td class="mono num">[{summary.uncertainty_bracket_total.af_min:,.3f} – {summary.uncertainty_bracket_total.af_max:,.3f} AF]</td>
        </tr>
      </tfoot>
    </table>

    <h2>III. Statutory &amp; Evidentiary Legal Argument</h2>
    <div class="legal-box">
      <h3>1. CPUC Revenue-Grade Utility Metering &amp; DWR Soundings Supersede Remote-Sensing ET Proxies</h3>
      <p>
        <strong>A. Admissibility and Presumption of Accuracy (Cal. Evid. Code §§ 640, 1271, 1280):</strong>
        PG&amp;E 15-minute interval data is metered under CPUC Electric Tariff Rule 17 and ANSI C12.20 revenue accuracy standards (±0.2%).
        Concurrent groundwater depth measurements from DWR CASGEM Station <span class="mono">{summary.dwr_monitoring_site_used}</span> constitute official
        state hydrologic records under California Evidence Code § 1280.
      </p>
      <p>
        <strong>B. Physical Distinction Between Canopy Evapotranspiration and Wellhead Extraction (Water Code § 10726.4 &amp; 23 CCR § 354.18):</strong>
        Land IQ satellite models estimate surface energy flux and vegetative evapotranspiration (ET)—not subsurface groundwater extraction.
        Satellite ET cannot distinguish between groundwater pumped through a wellhead and root-zone moisture derived from winter rainfall storage,
        perched water tables, capillary rise, adjacent parcel wind advection, or surface canal seepage. Under SGMA (Water Code § 10726.4(a)(2)),
        groundwater extraction fees and penalties must bear a fair and reasonable relationship to actual groundwater extracted from the basin.
      </p>
    </div>

    <div class="sig-block">
      <div>
        <div><strong>Certified Engineering &amp; Hydrologic Audit Attestation</strong></div>
        <div style="color: var(--muted); font-size: 12px; margin-top: 4px;">
          Generated deterministically via SGMA Extraction Auditor ({summary.engine_mode})
        </div>
      </div>
      <div>
        <div><strong>Requested Administrative Action:</strong></div>
        <div style="color: var(--muted); font-size: 12px; margin-top: 4px;">
          Credit APN <span class="mono">{summary.apn}</span> for <strong>{summary.net_discrepancy_af:,.2f} AF</strong> and abate <strong>${summary.dollar_variance:,.2f}</strong> in GSA penalties.
        </div>
      </div>
    </div>
  </div>
</body>
</html>
"""

    @classmethod
    def write_reports(
        cls,
        well: WellProfile,
        summary: GSAReconciliationSummary,
        output_html_path: Union[str, Path],
        output_md_path: Optional[Union[str, Path]] = None,
    ) -> Tuple[Path, Path]:
        """Writes both HTML and Markdown rebuttal packets to disk."""
        html_path = Path(output_html_path)
        html_path.parent.mkdir(parents=True, exist_ok=True)
        html_content = cls.render_html_rebuttal(well, summary)
        html_path.write_text(html_content, encoding="utf-8")

        if output_md_path is None:
            md_path = html_path.with_suffix(".md")
        else:
            md_path = Path(output_md_path)
            md_path.parent.mkdir(parents=True, exist_ok=True)

        md_content = cls.render_markdown_rebuttal(well, summary)
        md_path.write_text(md_content, encoding="utf-8")
        return html_path, md_path
