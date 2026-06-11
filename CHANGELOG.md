# Changelog

All notable changes to the **Configurable Form Engine (CFE)** project — the form engine solution and the CFE Configurator Copilot Studio agent.

---

## [Unreleased]

Planned / under consideration:
- Environment variable for the Dataverse org URL (currently hardcoded — search-replace when moving environments)
- Power Automate flow + `InvokeFlowTaskAction` for lookup-field *updates* (the direct Dataverse connector cannot update lookups — see 2026-06-11 notes below)
- Form engine: form-type scoping, conditional-validation gating, instant Lock-When-Set

---

## 2026-06-11 — CFE Configurator agent: deterministic rewrite & hardening

### Added
- **CFE Configurator** — a Copilot Studio agent that lets PMs/BAs configure form behaviour conversationally, with **zero JavaScript and zero manual Dataverse data entry**. 11 guided topics:
  - Register Table / Register Form
  - Create Rule (visibility, requirement, editability, form lock)
  - Add Condition / Set Default Value / Set Rule Validation
  - Assign Role to Rule / Enable-Disable Rule / Delete Rule
  - List Rules / List Managed Tables
- Confirmation step before **every** create, update and delete — the agent shows the full summary and asks before writing.
- Real record IDs echoed back after every create, so follow-up operations (conditions, validation, roles) can chain off them.
- Automatic **security-role GUID lookup by display name** — users type the role name; the agent resolves the GUID from the `roles` table itself.
- Duplicate-registration check on Register Table; "table not registered" guards on Register Form / Create Rule / List Rules.

### Changed
- **All wizard topics rewritten to be fully deterministic.** Previously the topics collected answers and relied on the generative orchestrator to perform the writes — meaning the agent could announce *"Creating the record now..."* and create nothing. Every topic now invokes the Dataverse connector itself, with friendly-word → option-set mapping done in Power Fx (e.g. `hide` → `734000002`), not in the LLM's head.
- Agent instructions rewritten: guided topics are routed first; raw connector tools reserved for operations the topics don't cover; documented that managed tables can't be deleted while rules reference them (Restrict cascade).
- All 24 topic files validated against the official Copilot Studio authoring schema (via [microsoft/skills-for-copilot-studio](https://github.com/microsoft/skills-for-copilot-studio)).

### Fixed
- **Lookup fields on create — 400 `ODataException`.** The Dataverse connector rejects a bare GUID for lookup columns ("a primitive node with non-null value was found... StartObject or null expected"). Verified working format through live testing:
  - field name: `<lookup>@odata.bind`
  - value: `/<entitysetname>/<guid>` (leading slash, slash-separated — **not** `entityset(guid)`)
- **Lookup fields on update — connector bug documented.** `UpdateRecordWithOrganization` strips the `@` from property names (`field@odata.bind` → `fieldodata.bind` → "instance annotation name must start with @"). There is no workaround in the direct connector; lookup updates require a Power Automate flow. The agent is now instructed to never modify lookups via the update tool. None of the guided topics need to — they only update scalar fields.
- **Delete Rule never deleted.** The confirmation branch only sent a message; the delete call is now actually wired and runs after an explicit "yes".
- **`mab_validationparam` poisoning.** Typing "none" for a not-applicable parameter would have stored the literal text — making MaxLength reject every value (`parseInt("none") || 0` → max length 0) and Regex match anything containing "none". "none"/"blank"/dynamic types now write real blanks.
- Removed the **default field/tab visibility** questions and instructions — the columns exist in the schema but the form engine never reads them, so configuring them did nothing (deny-by-default is parked until the engine implements it).
- GUID inputs normalized everywhere (trimmed, lowercased, braces stripped); `maxlength` validation refuses to save without a numeric parameter; the "enableing/disableing" message typo.

---

## 2026-06-09 — Form engine packaging fixes

### Fixed
- Re-minified the web resource with terser so `MAB.FormEngine.onLoad` resolves correctly on form load.
- Switched the shipped web resource from minified to full, readable source JS for easier debugging in customer environments.

### Changed
- Clean public release packaging: user-facing documentation, simplified repo layout.

---

## 2026-06-08 — Initial release: Configurable Form Engine v1.0

### Added
- **One generic web resource** (`mab_formengine.js`) that drives model-driven app form behaviour entirely from Dataverse configuration records — register it once on a form's OnLoad and control everything from data:
  - Show / hide fields, tabs, sections
  - Required / optional, editable / read-only, full form lock
  - Default values: text, number, boolean, choice, lookup, **Today**, **Current User**
  - Value locks: lock when set, lock after save
  - Field validation: alpha, numeric, email, no future/past date, max length, regex
  - Conditions on driver fields (equals, contains, in, empty, greater/less than...) with AND/OR matching, re-evaluated live on change
  - Per-security-role rule targeting and per-form scoping
- 5 configuration tables (`mab_managedtable`, `mab_managedform`, `mab_formrule`, `mab_formrulecondition`, `mab_formrulerole`) with cascade-delete wiring.
- Unmanaged solution zip ready to import, full onboarding documentation and rule examples.

---

*Maintained by Abdul Basit ([@Abdul-Basit-545](https://github.com/Abdul-Basit-545)) — free to use and redistribute.*
