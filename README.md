# Intentional Code

**About**

This repository contains the Intentional Code reference site.


**Prerequisites:**

1. Clone the repository using the project's Git URL
2. Navigate to the project directory
3. Install dependencies: `npm ci --legacy-peer-deps`
4. Run the app locally: `npm run dev`
5. Run `npm run build && node scripts/generate-sitemap.js` to generate the sitemap.xml file for production deployment.

## Project context and goal

You are helping build the MVP for **Sparkboard** (working name, change as you like), a web-based design and compliance tool for Australian electricians, electrical contractors, and solar installation companies operating in Victoria. The user is a licensed Victorian electrician (REC) or a designer at a small electrical contracting or solar installation firm. They need to design and document a low-voltage electrical job — typically a residential or light commercial installation involving solar PV and/or battery storage — and produce the calculations, single-line diagram, switchboard schedule, and Victorian Certificate of Electrical Safety required for compliance and lodgement.

The MVP is deliberately narrow: **Victoria only, residential and light commercial only, jobs up to 100A three-phase or 100A single-phase mains, with optional solar/battery integration**. Do not build for other states, larger industrial work, or features outside this scope unless I explicitly ask.

The product must produce outputs that are **technically correct, defensible in an audit, and accepted by Energy Safe Victoria**. The calculation engine is the heart of the product and must be implemented with extreme care. Bugs in the calculations are existential risks. Bugs in the UI are not.

## Regulatory and standards basis

The product must implement calculations and compliance checks per the following Australian Standards. You will need to reference these throughout. **You do not have access to the standards themselves; do not fabricate table values or clauses. Where you need a value from a standard, leave a clearly marked TODO and a placeholder, and I will provide the actual values from the standard.** This is critical — do not invent regulatory values.

The relevant standards are:

- **AS/NZS 3000:2018** (Wiring Rules) — the core installation standard. Particularly Section 1 (scope/definitions), Section 2 (general arrangement), Section 3 (selection and installation of wiring systems), Appendix B (verification), Appendix C (maximum demand).
- **AS/NZS 3008.1.1:2017** — cable selection for AC voltages up to and including 0.6/1 kV. The current-carrying capacity tables, voltage drop tables, and derating factors live here.
- **AS/NZS 4777.1:2016** — grid connection of energy systems via inverters, installation requirements.
- **AS/NZS 4777.2:2020** — grid connection of energy systems via inverters, inverter requirements.
- **AS/NZS 5033:2021** — installation and safety requirements for photovoltaic arrays.
- **AS/NZS 5139:2019** — electrical installations, safety of battery systems for use with power conversion equipment.
- **Energy Safe Victoria** Electricity Safety Act 1998 and Electricity Safety (General) Regulations 2019 — the legal basis for the Certificate of Electrical Safety in Victoria.

For Victorian DNSP requirements, the product must be aware of the five distribution network service providers and their respective territories: **CitiPower, Powercor, Jemena, AusNet Services, United Energy**. Each has its own connection requirements and flexible export policy for solar. These are subject to change — implement the DNSP rules as a configurable data table that can be updated without code changes.

## Technical

The calculation engine must be implemented as a **pure-functional library** with no state, no I/O, and no side effects. Inputs go in, outputs come out. This makes it testable, portable, and verifiable. All persistence, UI, and document generation are layers on top of this core.

## Data model

Implement the following entities. Use Prisma schema or equivalent. Treat this as a starting point and refine as needed.

**User** — id, email, password_hash, full_name, REC_number (Victorian Registered Electrical Contractor licence number), REC_class, phone, business_name, business_ABN, business_address, created_at, updated_at.

**Job** — id, user_id (FK), job_number (user-defined), site_address, site_suburb, site_postcode, customer_name, customer_phone, customer_email, DNSP (enum: citipower, powercor, jemena, ausnet, united_energy), supply_type (enum: single_phase, three_phase), supply_voltage (default 230/400V), supply_arrangement (enum: TN-C-S, TT, TN-S — most Australian residential is MEN which is TN-C-S downstream), main_switch_rating_A, status (enum: draft, designed, certified, archived), created_at, updated_at.

**LoadItem** — id, job_id (FK), description, load_type (enum: lighting, GPO, fixed_appliance, hot_water, air_conditioning, cooktop, oven, EV_charger, other), connected_load_W or connected_load_VA, phase (L1, L2, L3, or single), demand_factor_basis (enum from AS/NZS 3000 Table C1 categories — leave as placeholder TODO), is_existing (boolean), is_new (boolean).

**Circuit** — id, job_id (FK), circuit_number, description, circuit_type (enum: final_subcircuit, submain, mains, solar_AC, solar_DC, battery_DC), origin_board_id (FK), destination, design_current_A, cable_type (enum: V90, V75, X90 etc.), cable_cores (enum: 2C+E, 4C+E, single core, etc.), cable_size_mm2, cable_length_m, installation_method (enum from AS/NZS 3008 — placeholder), grouping_factor, ambient_temp_C, ambient_temp_factor, calculated_ampacity_A, voltage_drop_V, voltage_drop_percent, protective_device_type (enum: MCB, RCBO, RCD+MCB, fuse), protective_device_rating_A, RCD_type (enum: Type A, Type AC, Type B, none), RCD_trip_mA, earth_fault_loop_impedance_ohms, status (enum: ok, warning, fail), warnings (JSON).

**Switchboard** — id, job_id (FK), name (e.g. "Main Switchboard", "Subboard 1"), location_description, supply_voltage, fault_level_kA (assumed or calculated), main_switch_rating_A, available_ways, used_ways.

**SolarSystem** — id, job_id (FK), inverter_manufacturer, inverter_model, inverter_rated_AC_output_kW, inverter_max_AC_current_A, number_of_MPPTs, panel_manufacturer, panel_model, panel_Pmax_W, panel_Voc_V, panel_Vmp_V, panel_Isc_A, panel_Imp_A, panel_temp_coeff_Voc_pct_per_C, number_of_strings, panels_per_string, total_DC_capacity_kW, export_limit_kW, export_limit_type (enum: zero_export, fixed_export, flexible_export, no_limit), DC_isolator_rating_A, DC_isolator_voltage_V.

**BatterySystem** — id, job_id (FK), battery_manufacturer, battery_model, battery_capacity_kWh, battery_max_charge_kW, battery_max_discharge_kW, battery_DC_voltage_V, battery_max_current_A, BMS_type, AS5139_classification.

**ComplianceCertificate** — id, job_id (FK), certificate_type (enum: CES_Victoria), certificate_number, issued_date, work_description, prescribed_work (boolean — high-risk work requiring different treatment), pdf_url, lodgement_status (enum: not_lodged, lodged, accepted, rejected), lodgement_reference.

**DesignReport** — id, job_id (FK), generated_at, pdf_url, calculation_snapshot (JSONB — the full state of the design at generation time, for audit purposes).

## Calculation engine specification

This is the most important part of the system. Implement each calculation as a pure function with explicit inputs and outputs, fully unit-tested. **Do not invent values from standards.** Where a standard's table or formula is referenced, leave a clearly marked `TODO_STANDARD_LOOKUP` constant and a comment indicating exactly which table or clause is needed. I will provide the actual values.

### Maximum demand calculation (AS/NZS 3000 Appendix C)

Input: array of LoadItems with type, connected load, phase allocation.
Output: maximum demand per phase in amperes, total maximum demand, working shown as a structured calculation breakdown.

The calculation must apply the diversity factors from AS/NZS 3000 Appendix C Table C1 (residential) or Table C2 (non-residential). The categories include general lighting, general purpose socket outlets, range/cooking appliances, fixed water heating, air conditioning, EV charging, motor loads, and other appliances. Each has its own demand calculation method.

For each load category, the function must:
1. Identify the relevant Table C1 or C2 row based on installation type and load category.
2. Apply the calculation method (e.g. "first 2000W at 100% plus remainder at 75%").
3. Sum across categories per phase.
4. Output the result with full working.

Leave the Table C1/C2 values as `TODO_STANDARD_LOOKUP` constants in a single configuration file `src/standards/as3000_appendix_c.ts`.

### Cable current-carrying capacity (AS/NZS 3008.1.1)

Input: cable type, cable size, number of cores, installation method, ambient temperature, grouping factor.
Output: derated current-carrying capacity in amperes.

The base ampacity comes from AS/NZS 3008.1.1 Tables 3 through 21 depending on cable construction and installation method. Apply derating factors from Tables 22 through 29 for grouping and ambient temperature.

Leave the table values as `TODO_STANDARD_LOOKUP` constants in `src/standards/as3008_tables.ts`.

### Voltage drop calculation (AS/NZS 3008.1.1 and AS/NZS 3000 Clause 3.6)

Input: cable size, cable length, design current, power factor, circuit type (single/three phase).
Output: voltage drop in volts and percent.

Use the AS/NZS 3008.1.1 voltage drop tables (mV/A·m) or the resistance and reactance values from the cable tables.

Standard limits per AS/NZS 3000 Clause 3.6.2:
- 5% total from point of supply to any point in the installation
- Distribution allowance typically 2.5% for mains and submains, 2.5% for final subcircuits

Implement these as configurable limits with the standard defaults.

### Cable size selection

Input: design current, installation context, voltage drop limit, run length.
Output: minimum compliant cable size, with rationale showing both the ampacity-driven and voltage-drop-driven minimums.

The function selects the larger of:
- Smallest cable whose derated ampacity meets or exceeds design current
- Smallest cable whose voltage drop at design current and length is within the allowed percentage

### Earth fault loop impedance (AS/NZS 3000 Appendix B)

Input: cable type, length, size, supply earth-fault-loop-impedance at origin (Ze), protective device characteristic.
Output: total earth fault loop impedance, maximum permitted per AS/NZS 3000 Table B1 for the selected device, pass/fail.

The calculation: Zs = Ze + R1 + R2, where R1 and R2 are the phase and protective earth conductor resistances. Compare against the maximum permitted Zs for automatic disconnection within the required time.

Leave Table B1 values as `TODO_STANDARD_LOOKUP` constants in `src/standards/as3000_appendix_b.ts`.

### Protective device selection

Input: cable size, cable derated ampacity, design current, downstream fault current.
Output: recommended MCB or RCBO rating that:
1. Carries the design current (In >= Ib)
2. Protects the cable (In <= Iz where Iz is derated ampacity)
3. Has a breaking capacity adequate for the available fault level

For final subcircuits supplying socket outlets and lighting in domestic and similar installations, RCD protection is mandatory per AS/NZS 3000 — flag this requirement automatically. Most domestic final subcircuits in modern installations use RCBOs (Type A typically for resistive loads, Type B where required for solar inverters with DC components — refer to AS/NZS 4777.1 for specifics).

### Solar PV DC string design (AS/NZS 5033)

Input: panel electrical parameters, number of panels per string, site minimum and maximum ambient temperatures.
Output: minimum and maximum string voltage at temperature extremes, string short-circuit current with irradiance correction (typically 125% per AS/NZS 5033), DC isolator and cable sizing requirements.

Maximum string voltage at minimum temperature:
```
V_string_max = N_panels * V_oc * (1 + temp_coeff_Voc * (T_min - 25))
```
This must not exceed the inverter's maximum DC input voltage and must not exceed 600V for residential or 1000V for commercial per AS/NZS 5033 unless specific conditions are met.

Maximum DC current for isolator and cable sizing per AS/NZS 5033: 1.25 × Isc (the 1.25 factor accounts for irradiance variability — verify the exact factor against the current edition of the standard).

### Solar inverter AC connection (AS/NZS 4777.1)

Input: inverter AC output rating, switchboard rating, supply type.
Output: AC circuit sizing, protective device, compliance flags.

The inverter circuit must be sised to carry the maximum AC output current with margin. The protective device coordinates with the inverter's internal protection. The total inverter capacity per phase is subject to DNSP limits — in Victoria, single phase inverter limits vary by DNSP (typically 5kW or 10kW depending on the network). Multi-phase systems must be balanced within DNSP requirements.

Implement the DNSP limits as a configurable data table — they change frequently.

### Export limiting compliance

Input: inverter capacity, DNSP, customer NMI (or postcode as proxy), proposed export limit.
Output: compliance status with the DNSP's current export rules.

In Victoria as of 2024-2025, flexible export is being rolled out. The product must check the proposed system against the relevant DNSP rules and flag whether flexible export, zero export, or fixed export limiting is required. This is a moving target — implement as a rules engine driven by a YAML or JSON configuration file that can be updated as policies change.

### Battery system compliance (AS/NZS 5139)

Input: battery chemistry, capacity, installation location.
Output: compliance flags for installation location restrictions, ventilation, fire separation, and signage requirements per AS/NZS 5139.

This is largely a checklist-based compliance check rather than a calculation. Implement as a structured questionnaire with pass/fail outputs.

## User interface specification

The UI is mobile-first and must work cleanly on a phone in a ute as well as on a desktop in an office. Use Tailwind for styling. The visual aesthetic is **clean, utilitarian, and dense** — this is a tool for professionals, not a consumer app. Inspirations: Linear, Vercel dashboard, Stripe dashboard. Not: Notion, Airtable, Figma.

Screens to build for MVP:

**Login and signup.** Email + password, email verification on signup, REC number capture during onboarding with validation against a format regex (Victorian REC numbers follow a specific format — verify the format and implement validation).

**Jobs list.** Table of jobs with job number, site address, customer name, status, last modified. Search and filter. Tap to open. Big "New Job" button.

**New job wizard.** Multi-step form:
1. Site and customer details
2. Supply arrangement (single/three phase, DNSP, main switch rating)
3. Scope of work (existing installation modification, new installation, solar addition, battery addition, switchboard upgrade, etc.)

After the wizard, drop the user into the **Job workspace**.

**Job workspace.** Tabbed interface with:
1. **Loads** — add/edit/delete load items, see running maximum demand calculation update in real time.
2. **Switchboards & Circuits** — add switchboards, define circuits, configure each circuit with cable and protective device. The calculation engine runs on every change and shows pass/fail status inline. Failed checks are highlighted in red with a one-line explanation.
3. **Solar & Battery** — if applicable, configure the PV array, inverter, and battery. Compliance checks against AS/NZS 5033, 4777, 5139, and DNSP rules.
4. **Single Line Diagram** — auto-generated SVG view of the installation, with the ability to download as PDF.
5. **Documents** — generate and download the Design Report PDF and the Certificate of Electrical Safety PDF.

**Real-time validation.** Every input change re-runs the relevant calculations and updates the UI. Errors and warnings are surfaced inline, not on a separate "validate" button. Pass status is shown with a small green tick. Warnings are amber. Failures are red.

**Calculation transparency.** For every calculation result, the user can click an "i" icon and see the full working — inputs, formula, intermediate values, table references, output. This is critical for trust and for audit defence.

## Document generation

### Design Report PDF

A multi-page PDF including:

1. Cover page: job details, electrician details, generation date, REC number.
2. Scope of work summary.
3. Maximum demand calculation with full working.
4. Cable schedule: every circuit with all parameters and calculation results.
5. Switchboard schedule(s).
6. Protective device coordination summary.
7. Solar PV design (if applicable): array configuration, string voltage and current calculations, AS/NZS 5033 compliance checklist.
8. Battery system design (if applicable): AS/NZS 5139 compliance checklist.
9. Single-line diagram (one or more pages).
10. Declaration page with electrician's signature line and REC number.

Generate the PDF with Puppeteer rendering a styled HTML template. Use a clean, professional typeface (Inter or similar). A4 page size.

### Single Line Diagram

Generated as SVG from the design data, then embedded in the Design Report and exportable as a standalone PDF. Use standard AS/NZS 3000 electrical symbols. The diagram shows:

- Point of supply with DNSP name and supply arrangement notation
- Main switchboard with main switch rating, fault level
- Mains cable (size, length, voltage drop annotation)
- Submain cables (if any)
- Subboards (if any)
- All final subcircuits as a tabular schedule attached to the switchboard
- Solar inverter, PV array, and DC isolators
- Battery system if present
- Earthing arrangement

The layout is auto-generated — single phase systems are drawn as a single vertical line with branches, three phase systems show three conductors. Do not try to build a draggable canvas in MVP. The auto-layout is sufficient and forces consistency.

### Certificate of Electrical Safety (Victorian CES)

The CES is a specific form prescribed by Energy Safe Victoria. The MVP must:

1. Capture all data required by the current CES form (work description, prescribed/non-prescribed classification, electrician details, REC number, customer details, site address, date of completion).
2. Generate a PDF that matches the format of the official CES.
3. Allow the electrician to digitally sign the certificate.
4. Provide a clear next-step pathway to lodge the certificate (initially as a manual workflow — the electrician downloads and lodges via the ESV portal; integration with the ESV lodgement system is post-MVP).

**Important:** the exact CES format and required fields must be verified against current ESV documentation. Do not fabricate the form layout — leave it as a clearly marked placeholder template that I will fill in with the actual CES format.

## Security and data handling

The product handles personal data (electrician licence numbers, customer addresses, customer contact details) and design data that has compliance and liability implications. Apply standard security practices:

- HTTPS only.
- Password hashing with bcrypt or argon2.
- Session tokens with sensible expiry.
- Rate limiting on auth endpoints.
- SQL injection protection via parameterised queries (Prisma handles this).
- XSS protection in document generation (escape user input in PDFs).
- Backup the database daily.
- Audit log: every change to a job is logged with user, timestamp, and the diff. This is essential for compliance defensibility.
- Soft delete only — never hard delete a job. Archive instead.

Do not implement multi-tenancy isolation beyond user-level row scoping for MVP. Single-business accounts only.

## What you must not do

- **Do not invent values from standards.** If you need a current-carrying capacity value, a derating factor, a Table B1 maximum impedance, or any other regulatory number, mark it as `TODO_STANDARD_LOOKUP` and stop. I will provide the value.
- **Do not implement features outside the MVP scope** unless I explicitly ask. No collaborative editing, no API access, no other states, no industrial work, no transmission/distribution analysis.
- **Do not skip the calculation engine tests.** If you find yourself writing UI without writing tests for the underlying calculation, stop and write the tests first.
- **Do not fabricate the CES form format.** Use a clearly marked placeholder.
- **Do not implement DNSP-specific rules in code.** Use a configuration file.
