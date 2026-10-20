# ADMINISTRATIVE EVIDENTIARY REBUTTAL & EXTRACTION AUDIT LEDGER
**Jurisdiction:** Greater Kaweah GSA — Kaweah Subbasin (5-022.11)  
**Statutory Authority:** Sustainable Groundwater Management Act (California Water Code § 10720 et seq.; § 10726.4; 23 CCR § 354.18)  
**Grower / Legal Entity:** `VALLEY-HERITAGE-PISTACHIOS-LLC`  
**Assessor Parcel Number (APN):** `142-080-019`  
**Well Identifier:** `19S24E14M001M` | **PG&E Service Agreement ID:** `9482710455` | **Meter ID:** `1008492031`  
**Audit Period:** 2026-04-04 04:00 PDT to 2026-10-17 13:00 PDT  
**Hydraulic Solver Engine:** `ENGINE_B_SCIPY_BRENTQ_NONLINEAR` | **DWR CASGEM Reference Station:** `362077N1193473W001`  

---

## I. EXECUTIVE RECONCILIATION SUMMARY: SATELLITE ET VS. PHYSICAL ELECTRICAL LEDGER

| Evidentiary Metric | Valuation / Volume | Statutory & Engineering Basis |
| :--- | :--- | :--- |
| **1. GSA Land IQ Remote-Sensing ET Assessment** | **145.20 AF** | Proprietary satellite canopy energy-balance model (SEBAL/METRIC) |
| **2. Audited PG&E Physical Hydraulic Extraction** | **93.33 AF** | CPUC-regulated 15-min revenue meter (44,096.8 kWh) + DWR SWL |
| **3. Physical Uncertainty Bracket (Tier 2 – Tier 1)** | **[81.09 – 104.04 AF]** | Bounded between Regional OPE (0.53) and New Bowl Ceiling OPE (0.68) |
| **4. Net Satellite Over-Estimation Discrepancy** | **+51.87 AF (+55.6%)** | Unpumped volume erroneously attributed to groundwater extraction |
| **5. Contested GSA Over-Pumping Penalty Variance** | **$9,595.54** | Evaluated at GSA Tier Penalty Rate of $185.00/AF |
| **6. Phantom Water Excluded via Forensic Filter** | **0.075 AF** | 8 suction-loss, 5 deadhead, 4 cycling intervals |

---

## II. CERTIFIED HYDRAULIC PARAMETERS & THERMODYNAMIC CONSERVATION PROOF

Groundwater extraction is governed by the First Law of Thermodynamics and classical fluid mechanics: lifting a known mass of water against a measured gravity and pressure head requires an invariant minimum input of electrical energy.

$$\text{TDH (ft)} = \text{SWL}(t) + \text{Drawdown} + (\text{Discharge PSI} \times 2.31) + H_f$$

$$\text{Specific Energy (kWh/AF)} = \frac{1.024 \times \text{TDH}}{\text{OPE}}$$

- **Baseline Static Depth-to-Water (SWL):** `148.0 ft` (interpolated daily across season via DWR CASGEM Station `362077N1193473W001`)
- **Pumping Drawdown:** `31.5 ft` | **Discharge Pressure:** `28.0 PSI` (`64.68 ft` head) | **Column Friction ($H_f$):** `6.8 ft`
- **Nominal Total Dynamic Head (TDH):** `250.98 ft`
- **Overall Plant Efficiency (OPE):** `61.0%` (Certified APET by CSU Fresno Center for Irrigation Technology (CIT) (License `CA-PE-M84912`) on 2026-02-14)
- **Operating Demand Plausibility Envelope:** `[52.0 kW – 118.0 kW]`

Even if this well operated at the theoretical physical ceiling of a brand-new factory pump bowl (**Tier 1 OPE = 0.68**), the `15-minute` electrical energy delivered by PG&E (`44,096.83 kWh`) could physically lift at most **`104.04 AF`** from the aquifer. The GSA's Land IQ assessment of **`145.20 AF`** violates conservation of energy by requiring either an impossible wire-to-water efficiency exceeding `84.6%` or unrecorded off-grid generation that does not exist on APN `142-080-019`.

---

## III. MONTHLY & SEASONAL EXTRACTION LEDGER (15-MINUTE INTERVAL AGGREGATION)

| Month | Active Pumping Hours | Metered Energy (kWh) | Mean TDH (ft) | Mean Flow (GPM) | Forensic Anomalies Excluded | Audited Extraction (AF) | Evidentiary Bracket [Tier 2 – Tier 1] |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| 2026-04 | 40.00 hrs | 3,536.93 kWh | 286.3 ft | 983.6 GPM | 0 (0.000 AF) | **7.245 AF** | [6.294 – 8.076 AF] |
| 2026-05 | 65.00 hrs | 5,829.69 kWh | 283.1 ft | 1,008.7 GPM | 4 (0.000 AF) | **12.072 AF** | [10.489 – 13.458 AF] |
| 2026-06 | 90.25 hrs | 8,245.64 kWh | 280.6 ft | 1,033.9 GPM | 3 (0.000 AF) | **17.182 AF** | [14.929 – 19.154 AF] |
| 2026-07 | 118.25 hrs | 10,859.87 kWh | 278.1 ft | 1,059.3 GPM | 4 (0.075 AF) | **23.066 AF** | [20.041 – 25.713 AF] |
| 2026-08 | 97.00 hrs | 8,966.36 kWh | 274.9 ft | 1,083.9 GPM | 4 (0.000 AF) | **19.359 AF** | [16.820 – 21.580 AF] |
| 2026-09 | 43.50 hrs | 4,117.11 kWh | 272.1 ft | 1,107.7 GPM | 2 (0.000 AF) | **8.872 AF** | [7.709 – 9.890 AF] |
| 2026-10 | 27.00 hrs | 2,541.23 kWh | 271.5 ft | 1,113.6 GPM | 0 (0.000 AF) | **5.536 AF** | [4.810 – 6.172 AF] |
| **TOTAL** | **481.00 hrs** | **44,096.83 kWh** | **—** | **—** | **17 (0.075 AF)** | **93.332 AF** | **[81.092 – 104.042 AF]** |

---

## IV. LEGAL & REGULATORY REBUTTAL BRIEF (CALIFORNIA EVIDENCE CODE & SGMA)

### 1. Evidentiary Superiority of CPUC Revenue-Grade Metering & Official DWR Soundings
1. **CPUC Electric Tariff Rule 17 & ANSI C12.20 Accuracy Class (Cal. Evid. Code § 1271):** Pacific Gas & Electric (PG&E) SmartMeter interval telemetry (`Meter ID: 1008492031`, `SAID: 9482710455`) is continuously calibrated and audited under California Public Utilities Commission (CPUC) authority to within $\pm 0.2\%$ to $\pm 0.5\%$ revenue accuracy. These 15-minute intervals constitute contemporaneous business records admissible under California Evidence Code § 1271.
2. **Official DWR / CASGEM Groundwater Elevations (Cal. Evid. Code § 1280):** Physical depth-to-water soundings recorded in the California Department of Water Resources (DWR) Monitoring Network (`Station 362077N1193473W001`) are official public records made by public employees within the scope of duty under California Evidence Code § 1280 and 23 CCR § 354.34.
3. **Inadmissibility of Uncalibrated Remote-Sensing Proxy Estimates to Override Physical Metering (Water Code § 10726.4 & 23 CCR § 354.18):** Remote-sensing evapotranspiration (Land IQ) does not measure groundwater pumping; it estimates total canopy consumptive vapour flux from multispectral satellite passes every 8–16 days. Canopy ET conflates (a) stored vadose-zone winter precipitation, (b) capillary fringe uptake, (c) cover crop / weed transpiration, (d) adjacent parcel advective heat transfer, and (e) surface water deliveries with groundwater extraction. Under California Water Code § 10726.4(a)(2) and constitutional due process requirements against arbitrary administrative penalties (Proposition 218 / Proposition 26), a GSA cannot levy extraction fees or tier penalties on phantom water that thermodynamic law proves was never pumped from the wellhead.

### 2. Relief Requested
Respondent (`VALLEY-HERITAGE-PISTACHIOS-LLC`, APN `142-080-019`) formally petitions the **Greater Kaweah GSA** Board of Directors and Technical Advisory Committee to:
1. Adjust the official groundwater extraction ledger for Well `19S24E14M001M` from `145.20 AF` to **`93.33 AF`**; and
2. Abate **`$9,595.54`** in contested over-pumping tier penalties.
