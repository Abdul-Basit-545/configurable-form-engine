# Configurable Form Engine (CFE) — Design Specification

**Module type:** Reusable, org-wide platform module (deployed across multiple projects)
**Status:** Design — for review before build
**Surface:** Microsoft Dynamics 365 / Power Platform — **model-driven app forms only**
**Layer:** **Form experience (client-side UX)** — field/tab/section visibility, field requirement, editability (read-only/disable), default values, and value-locking
**Author/owner:** Platform team · **Date:** 6 June 2026

---

## Table of contents

1. [Purpose & problem statement](#1-purpose--problem-statement)
2. [Goals, non-goals, scope](#2-goals-non-goals-scope)
3. [How model-driven form behaviour actually works](#3-how-model-driven-form-behaviour-actually-works)
4. [Solution architecture](#4-solution-architecture)
5. [Configurability stance (why this is a justified L3)](#5-configurability-stance)
6. [Configuration data model](#6-configuration-data-model)
7. [Runtime engine logic](#7-runtime-engine-logic)
8. [Deny-by-default mechanics & guard rails](#8-deny-by-default-mechanics--guard-rails)
9. [Onboarding a new table (the developer workflow)](#9-onboarding-a-new-table)
10. [Performance & caching](#10-performance--caching)
11. [Security & governance](#11-security--governance)
12. [ALM, packaging & deployment](#12-alm-packaging--deployment)
13. [Naming conventions](#13-naming-conventions)
14. [Edge cases & known limitations](#14-edge-cases--known-limitations)
15. [Testing strategy](#15-testing-strategy)
16. [Roadmap (future phases)](#16-roadmap)
17. [Worked example](#17-worked-example)
18. [Decisions log & open questions](#18-decisions-log--open-questions)

---

## 1. Purpose & problem statement

Across the org's projects, developers repeatedly write **bespoke JavaScript web resources per table** to control form behaviour — showing/hiding fields, tabs and sections, and making fields conditionally mandatory. Every table is a fresh script, fresh testing, fresh maintenance, and inconsistent patterns between developers and projects.

**CFE replaces that with a single, generic, configuration-driven engine.** Behaviour becomes **data** (rows in Dataverse config tables) instead of **code** (per-table JS). One reusable script is registered on forms; what it does is decided entirely by configuration. The result:

- **Less code** — one maintained web resource instead of N per-table scripts.
- **Faster delivery** — a new table's form behaviour is configured, not coded.
- **Consistency** — identical, tested behaviour everywhere; no per-developer divergence.
- **Lower-skill changes** — analysts/admins adjust behaviour via config rows, no deployment.

> **Design intent in one line:** *form visibility and requirement become declarative configuration interpreted at runtime by one shared engine, for any model-driven table org-wide.*

---

## 2. Goals, non-goals, scope

### In scope (v1)
- **Field visibility** — show/hide a field's control(s).
- **Tab & section visibility** — show/hide tabs and sections.
- **Field requirement** — set required / optional (business-required vs none).
- **Field editability (read-only / disable)** — make a field read-only or editable, conditionally.
- **Default values** — set a field's value (static or dynamic, e.g. *Today* / *Current User*) when it is empty, typically on Create.
- **Value-locking** — make a field read-only once it has a value, or once the record is saved ("set-once" fields).
- **Conditional behaviour** — apply any of the above based on the values of other fields, re-evaluated live as the user types.
- **Deny-by-default** — per the org requirement, a managed table can hide everything by default and reveal only what config opts in.
- **Generic across all model-driven tables** — driven by `getEntityName()` at runtime.
- **Form-experience enforcement only** — the platform's own required-level behaviour blocks save on the form.

### Non-goals (explicitly deferred / out of scope — see [Roadmap](#16-roadmap))
- **Server-side enforcement** (plugin) — UX layer can be bypassed via API/import/Excel. A generic plugin is a **future phase**, not v1.
- **Canvas apps / Power Pages** — different model entirely; not covered.
- **Field-level security** — that is a platform feature, not this engine.
- **Layout/cosmetic changes** beyond visibility (positioning, colours, relabelling).
- **Cross-record / server-computed values** — default values are client-side and field-local in v1.

---

## 3. How model-driven form behaviour actually works

This grounds the design — the engine doesn't invent a new mechanism, it centralises the standard one.

Form UI behaviour is **client-side** and runs on **form events** via the Client API (`formContext`):

| Event | When | What the engine does |
|---|---|---|
| **OnLoad** | Form opens | Read entity + form type, load config, apply deny-by-default, apply all rules, wire OnChange handlers |
| **OnChange** | A driving field changes | Re-evaluate conditional rules and re-apply |
| **OnSave** | Before commit | (Mostly handled implicitly — see below) |

The Client API methods the engine uses:

```js
formContext.data.entity.getEntityName()                  // which table → generic dispatch
formContext.ui.getFormType()                             // 1=Create, 2=Update, ...
formContext.getControl(name).setVisible(true|false)      // field visibility
formContext.getControl(name).setDisabled(true|false)     // read-only / editable
formContext.getAttribute(name).setRequiredLevel('required'|'none')  // requirement
formContext.getAttribute(name).getValue() / setValue(v)  // default values / value-lock checks
formContext.getAttribute(name).setSubmitMode('always')   // ensure a defaulted value is saved
formContext.ui.tabs.get(tabName).setVisible(true|false)  // tab visibility
formContext.ui.tabs.get(tabName).sections.get(sectionName).setVisible(...) // section
formContext.getAttribute(name).addOnChange(handler)      // live re-evaluation
```

Note the split between **attribute** (data: value, requirement, submit mode) and **control** (UI: visible, disabled). Visibility and editability act on the *control*; requirement, value and defaults act on the *attribute*.

**Key fact that makes a single generic script possible:** `getEntityName()` returns the current table at runtime, so the *same* file behaves correctly on every form. Nothing is hard-coded to a table.

**Why JavaScript and not the no-code Business Rules feature:** Business Rules can also show/hide/require without code, but each rule is authored **per table in the maker portal** — it is not queryable data, cannot be bulk-managed, templated, or migrated as configuration, and still grows linearly with tables. It does not meet the "stop building per-table artefacts" goal. CFE makes behaviour **data**, authored once-per-rule and reused via the shared engine.

---

## 4. Solution architecture

```
            ┌──────────────────────── Dataverse ────────────────────────┐
            │  Configuration tables                                      │
            │  ┌──────────────┐   ┌────────────┐   ┌──────────────────┐  │
            │  │ Managed Table│1─n│  Form Rule │1─n│ Form Rule        │  │
            │  │ (registration│   │ (behaviour │   │ Condition        │  │
            │  │  + defaults) │   │  instruction)│  │ (predicate)      │  │
            │  └──────┬───────┘   └─────┬──────┘   └──────────────────┘  │
            │     1─n │  Managed Form ──┘ (optional form scope:           │
            │  ┌──────▼───────┐          blank = all forms of the table)  │
            │  │ Managed Form │  per-form enable + default-visibility     │
            │  └──────────────┘                                          │
            └───────────────────────────┬───────────────────────────────┘
                                         │  Xrm.WebApi (read, cached)
   ┌──────────────────────────────────────▼──────────────────────────────────┐
   │  cfe_formEngine.js   — ONE generic web resource, registered on forms      │
   │                                                                            │
   │   OnLoad(ctx):                                                             │
   │     entity = getEntityName(); formType = getFormType()                     │
   │     cfg = loadConfig(entity)            // cached                          │
   │     if !cfg.enabled: return                                                │
   │     applyDenyByDefault(cfg)             // hide all if configured          │
   │     rules = cfg.rules filtered by form + formType, ordered by priority     │
   │     applyRules(rules)                                                      │
   │     wireDriverFieldOnChange(rules)                                         │
   │                                                                            │
   │   OnChange(ctx): reapply conditional rules                                 │
   └────────────────────────────────────────────────────────────────────────────┘
```

**Components shipped by the module:**
1. **Three config tables** (below) — the declarative behaviour store.
2. **One web resource** `cfe_formEngine.js` — the interpreter.
3. *(Optional)* a small **shared library** web resource for caching/helpers if split out.
4. **A solution + publisher** with a stable prefix for clean ALM across projects.
5. *(Optional)* **environment variable(s)** for engine on/off and debug logging.

---

## 5. Configurability stance

Per the org's L0–L3 configurability framework, CFE is a deliberate, **justified L3 (metadata/rules engine)** — the one place the highest level earns its cost:

| Element | Level | Justification |
|---|---|---|
| The engine (`cfe_formEngine.js`) | **L0 — fixed code** | Built once, generic, never changes per project. |
| The behaviour rules | **L3 — metadata-driven** | Open-ended, authored as data by makers/admins, change with **no deployment**; reused across many tables, projects, environments — genuine product-grade reuse. |
| Supported actions / operators | **L1 — extend deliberately** | v1 ships five action types (visibility, requirement, editability, default value, value-lock); add further action/operator types per the rule of three. |

**Anti-over-engineering guard rails (so the L3 doesn't become "a worse Dataverse"):**
- Ship a **closed set of five action types** (visibility, requirement, editability, default value, value-lock). Add more only against a real, named need — do **not** build an open scripting surface.
- Keep condition logic to **rule-level AND/OR** across simple predicates — no nested boolean trees in v1.
- Provide a **rule-test / debug mode** so config is verifiable (the original pain was *unverifiable* logic).
- Reuse Dataverse-native concepts (logical names, option values) — invent no DSL.

---

## 6. Configuration data model

> **Built prefix is `mab_`** (publisher *Abdul Basit*, solution *ConfigurableFormEngine*). The tables below show `cfe_` for readability in the original design; the live schema uses `mab_` (e.g. `mab_managedtable`, `mab_formrule`, `mab_formrulecondition`, `mab_managedform`).

### 6.1 Managed Table — `cfe_managedtable`
Registers a table into the engine and sets its per-table defaults. **The engine does nothing on tables that are not registered + enabled** (safety).

| Display name | Logical name | Type | Notes |
|---|---|---|---|
| Table Logical Name *(primary)* | `cfe_name` | string | The target table, e.g. `account`. Primary column. |
| Engine Enabled | `cfe_enabled` | boolean | Master on/off for this table. |
| Default Field Visibility | `cfe_defaultfieldvisibility` | choice | `Hidden` (100000000) / `Visible` (100000001). Default **Hidden** = deny-by-default. |
| Default Tab/Section Visibility | `cfe_defaulttabvisibility` | choice | `Hidden` / `Visible`. Default **Hidden**. |
| Notes | `cfe_notes` | multiline text | |

### 6.1b Managed Form — `mab_managedform`
A specific **form** of a managed table. Lets rules and default-visibility be scoped per form (a table like Account has several forms — main, sales, service, quick-create). Child of Managed Table.

| Display name | Logical name | Type | Notes |
|---|---|---|---|
| Form Name *(primary)* | `mab_name` | string | The form's display name, e.g. "Account for Sales". |
| Managed Table | `mab_managedtableid` | lookup → `mab_managedtable` | Owning table (parental). App-required. |
| Form Id | `mab_formid` | string | The form's GUID — exact, rename-proof match (preferred over name). |
| Form Type | `mab_formtype` | choice | `Main` / `Quick Create` / `Quick View` / `Card`. |
| Engine Enabled | `mab_enabled` | boolean | Per-form on/off (default Yes). |
| Default Field Visibility (override) | `mab_defaultfieldvisibility` | choice | `Use Table Default` / `Hidden` / `Visible`. Overrides the table default for this form. |
| Default Tab/Section Visibility (override) | `mab_defaulttabvisibility` | choice | `Use Table Default` / `Hidden` / `Visible`. |

The engine resolves the current form at runtime (by `formid`, falling back to name) → finds its Managed Form row → applies that form's defaults, then the rules scoped to it **plus** table-wide rules (rules with no Managed Form).

### 6.2 Form Rule — `cfe_formrule`
One behaviour instruction for one element. A rule may set any combination of the action columns (visibility, requirement, editability, default value, value-lock) — every action defaults to `No Change`, so a rule only does what it explicitly sets.

| Display name | Logical name | Type | Notes |
|---|---|---|---|
| Rule Name *(primary)* | `cfe_name` | string | Human label, e.g. "Show Credit Limit for Corporate". |
| Managed Table | `mab_managedtableid` | lookup → `mab_managedtable` | Owning table registration. |
| Managed Form | `mab_managedformid` | lookup → `mab_managedform` | Optional. **Blank = applies to all forms** of the table; set to scope the rule to one specific form. (Replaces the old free-text Form Name.) |
| Element Type | `cfe_elementtype` | choice | `Field` (100000000) / `Tab` (100000001) / `Section` (100000002). |
| Element Logical Name | `cfe_elementname` | string | Field logical name, or tab/section **name** as defined in the form designer. |
| Set Visibility | `cfe_setvisibility` | choice | `No Change` (0) / `Show` (1) / `Hide` (2). |
| Set Requirement | `cfe_setrequirement` | choice | `No Change` (0) / `Required` (1) / `Optional` (2). Fields only. |
| Set Editability | `cfe_seteditability` | choice | `No Change` (0) / `Editable` (1) / `Read-Only (Disabled)` (2). Fields only. |
| Set Default Value | `cfe_setdefault` | choice | `No Change` (0) / `Apply When Empty` (1). When `Apply When Empty`, engine writes `Default Value` only if the field is currently empty. Fields only. |
| Default Value | `cfe_defaultvalue` | string | The value to apply. For choice use the numeric option value; for lookup use `logicalname:guid:name`; supports dynamic tokens (see Default Value Type). |
| Default Value Type | `cfe_defaultvaluetype` | choice | `Text` (1) / `Number` (2) / `Boolean` (3) / `Choice` (4) / `Lookup` (5) / `Today` (6, dynamic) / `Current User` (7, dynamic). Dynamic types ignore `Default Value`. |
| Value Lock | `cfe_valuelock` | choice | `No Change` (0) / `Lock When Set` (1, read-only once it has a value) / `Lock After Save` (2, editable on Create, read-only on Update — "set-once") / `Unlocked` (3). Fields only. |
| Applies On | `cfe_applieson` | choice | `Create` (1) / `Update` (2) / `Both` (3). Maps to form type. |
| Condition Match | `cfe_conditionmatch` | choice | `All (AND)` (1) / `Any (OR)` (2). How its conditions combine. Ignored if no conditions. |
| Priority | `cfe_priority` | integer | Higher wins on conflict (two rules, same element). Default 0. |
| Active | `cfe_active` | boolean | Soft on/off (don't delete — audit trail). |
| Description | `cfe_description` | multiline text | |

> A rule **with no conditions** applies unconditionally. **With conditions**, it applies only when they evaluate true (and is re-checked on driver-field change).

### 6.3 Form Rule Condition — `cfe_formrulecondition`
A single predicate. N conditions per rule, combined per the rule's `Condition Match`.

| Display name | Logical name | Type | Notes |
|---|---|---|---|
| Condition Name *(primary)* | `cfe_name` | string | Auto/label. |
| Form Rule | `cfe_formruleid` | lookup → `cfe_formrule` | Required parent. **Parental** relationship (delete with rule). |
| Driver Field | `cfe_driverfield` | string | Logical name of the field whose value is tested. |
| Operator | `cfe_operator` | choice | `Equals` (1) / `Not Equals` (2) / `Contains` (3) / `Does Not Contain` (4) / `Is Empty` (5) / `Is Not Empty` (6) / `In` (7) / `Greater Than` (8) / `Less Than` (9). |
| Comparison Value | `cfe_value` | string | For `In` use comma-separated; for choice fields use the numeric option value; for boolean use `true`/`false`. Ignored for `Is Empty`/`Is Not Empty`. |
| Value Type | `cfe_valuetype` | choice | `Text` (1) / `Number` (2) / `Boolean` (3) / `Choice` (4) / `Lookup` (5). Tells the engine how to parse/compare. |
| Sequence | `cfe_sequence` | integer | Display/evaluation order. |

### 6.4 Relationships
- `mab_managedtable` **1—n** `mab_managedform` (**parental** — forms belong to the table).
- `mab_managedtable` **1—n** `mab_formrule` (referential; restrict delete while rules exist).
- `mab_managedform` **1—n** `mab_formrule` (referential, remove-link; optional form scope).
- `mab_formrule` **1—n** `mab_formrulecondition` (**parental** — conditions are owned by the rule).

---

## 7. Runtime engine logic

Pseudocode for `cfe_formEngine.js`. (Implementation is the build step; this is the agreed behaviour.)

```js
// ---- Registered on form OnLoad, "Pass execution context as first parameter" = TRUE ----
async function onLoad(executionContext) {
  const fc = executionContext.getFormContext();
  const entity = fc.data.entity.getEntityName();
  const formType = fc.ui.getFormType();          // 1=Create, 2=Update
  const formId   = fc.ui.formSelector?.getCurrentItem()?.getId?.() ?? null;   // GUID (preferred)
  const formName = fc.ui.formSelector?.getCurrentItem()?.getLabel?.() ?? null; // fallback

  const cfg = await loadConfig(entity);          // cached; see §10
  if (!cfg || !cfg.enabled) return;              // table not managed → do nothing

  const form = matchManagedForm(cfg.forms, formId, formName); // by id, fallback name; may be null
  if (form && form.enabled === false) return;    // engine off for this form
  applyDenyByDefault(fc, cfg, form);             // §8 — form override wins over table default
  // rules for THIS form + table-wide rules (no managed form set)
  const rules = selectRules(cfg.rules, form, formType);
  applyRules(fc, rules);
  wireDrivers(fc, rules, () => {                 // re-run conditional rules on change
     applyDenyByDefault(fc, cfg);
     applyRules(fc, selectRules(cfg.rules, formName, formType));
  });
}

function applyRules(fc, rules) {
  for (const r of rules) {                        // already ordered by priority asc → later wins
    if (!conditionsMet(fc, r)) continue;
    applyAction(fc, r);
  }
}

function conditionsMet(fc, rule) {
  if (rule.conditions.length === 0) return true;
  const results = rule.conditions.map(c => evalCondition(fc, c));
  return rule.match === 'AND' ? results.every(Boolean) : results.some(Boolean);
}

function evalCondition(fc, c) {
  const attr = fc.getAttribute(c.driverField);
  const actual = attr ? attr.getValue() : null;
  return compare(actual, c.operator, parseValue(c.value, c.valueType));
}

function applyAction(fc, r) {
  if (r.elementType === 'Field') {
    setFieldVisibility(fc, r.elementName, r.setVisibility);      // Show / Hide
    setFieldRequirement(fc, r.elementName, r.setRequirement);    // required / none
    setFieldEditability(fc, r.elementName, r.setEditability);    // setDisabled(true|false)
    applyDefaultValue(fc, r);                                    // only if empty (see below)
    applyValueLock(fc, r);                                       // conditional setDisabled
  } else if (r.elementType === 'Tab') {
    setVisible(fc.ui.tabs.get(r.elementName), r.setVisibility);
  } else if (r.elementType === 'Section') {
    setVisible(findSection(fc, r.elementName), r.setVisibility);
  }
}

function applyDefaultValue(fc, r) {
  if (r.setDefault !== 'ApplyWhenEmpty') return;
  const attr = fc.getAttribute(r.elementName);
  if (!attr) return;
  const cur = attr.getValue();
  if (cur !== null && cur !== undefined && cur !== '') return;   // never overwrite
  attr.setValue(resolveDefault(r.defaultValue, r.defaultValueType)); // Today/CurrentUser resolved dynamically
  attr.setSubmitMode('always');                                  // ensure it persists
}

function applyValueLock(fc, r) {
  const ctrls = controlsFor(fc, r.elementName);
  if (r.valueLock === 'LockWhenSet') {
    const hasVal = fc.getAttribute(r.elementName)?.getValue() != null;
    ctrls.forEach(c => c.setDisabled(hasVal));
  } else if (r.valueLock === 'LockAfterSave') {
    ctrls.forEach(c => c.setDisabled(fc.ui.getFormType() === 2)); // 2 = Update
  } else if (r.valueLock === 'Unlocked') {
    ctrls.forEach(c => c.setDisabled(false));
  }
}
```

Editability and value-lock both act through `setDisabled`; when several apply to one field, **Priority order** (rules applied last win) plus the guard rails in §8 resolve the final state.

**Order of operations (critical):**
1. Deny-by-default (hide everything the table marks hidden-by-default).
2. Apply rules ordered by **Priority ascending** so the **highest priority is applied last and wins**.
3. Within a field rule apply in this order: **visibility → default value → requirement → editability → value-lock**. Defaults are written before editability so a field can be defaulted *and then* locked read-only in the same pass; value-lock is applied last so it has the final say on the disabled state. Enforce the *hide ⇒ not-required* and *disabled+empty+required* guards (§8).

---

## 8. Deny-by-default mechanics & guard rails

Per the org requirement: **a managed table can hide every field/tab/section by default**, revealing only what config opts in.

`applyDenyByDefault(fc, cfg)`:
- If `Default Field Visibility = Hidden`: iterate `fc.getControl()` collection → `setVisible(false)`, **except guarded controls** (below).
- If `Default Tab/Section Visibility = Hidden`: iterate `fc.ui.tabs` and each tab's `sections` → `setVisible(false)`.

### Guard rails (mandatory — prevent broken/un-saveable forms)
1. **System-required fields are never hidden.** Before hiding, check `getAttribute(name).getRequiredLevel()`; if `'required'` (system-mandated), keep visible. Hiding a required field makes the record un-saveable. (Engine logs a skip in debug mode.)
2. **Hide ⇒ clear requirement.** When the engine hides a field, it also sets requirement to `none`, *unless* a higher-priority rule explicitly Shows + Requires it. A hidden + required field blocks save with a confusing error.
3. **Primary field protection.** Never hide the table's primary column.
4. **Business Process Flow / header fields** may not have standard controls — engine wraps calls in try/catch and skips silently (debug-logs).
5. **Multiple controls per field** (field placed twice on a form) — engine iterates all controls for that logical name, not just the first.
6. **Non-existent elements** (config references a field not on this form) — try/catch, skip, debug-log. Config can be broader than any single form.
7. **Deny-by-default is opt-in per table** via `cfe_defaultfieldvisibility`. Default recommended **Hidden** per the requirement, but a table can be set `Visible` if a project prefers allow-list-of-hides instead. This directly resolves the earlier open question — *true deny-by-default, made safe by guards 1–3, and switchable per table.*
8. **Default value never overwrites.** Defaults are written only when the field is empty (`Apply When Empty`), so a user's or existing record's value is never clobbered. Dynamic types (`Today`, `Current User`) are resolved at apply time.
9. **Defaulted values must persist.** After `setValue`, the engine calls `setSubmitMode('always')` so a programmatic default is saved even if the control is read-only/disabled.
10. **Disabled + empty + required = save trap.** A field that is read-only (via editability or value-lock) *and* required *and* empty cannot be completed by the user and blocks save. The engine detects this combination and, in debug mode, warns; design rules so a locked-required field is either pre-defaulted or only locked once it has a value.
11. **Editability vs value-lock precedence.** Both set the disabled state; value-lock is applied last (per §7 order) and therefore wins when both target the same field. Use one or the other per field to avoid confusion.
12. **`Lock After Save` is form-type driven**, not value driven — the field is editable on Create and read-only on Update regardless of content; pair with a default or a create-time required rule if it must be filled before it locks.

---

## 9. Onboarding a new table

The payoff. Once the module is deployed, adding form behaviour to **any** table — including a brand-new custom table — is **two steps, no code**:

1. **Register the engine on the form (one-time per form).** In the form designer, add `cfe_formEngine.js` as a library and register `onLoad` on the **OnLoad** event with *"Pass execution context as first parameter" = true*. (This single registration can also be applied in bulk via solution form XML / pac for many forms at once.) The file is identical for every form and never edited.
2. **Configure behaviour as data:**
   - Create a **Managed Table** row for the table (`Engine Enabled = yes`, choose default visibility).
   - *(If the table has multiple forms)* add a **Managed Form** row per form you want to manage (capture its Form Id, set per-form enable / default-visibility override).
   - Add **Form Rule** rows (show this field, make that one required, hide that tab…). Leave **Managed Form** blank to apply to all forms, or set it to scope the rule to one form. Add optional **Form Rule Condition** rows for conditional logic.

That's it. The field becomes mandatory, or the tab appears, through configuration — no JS written, no deployment. **This is how the org stops writing per-table form scripts.**

---

## 10. Performance & caching

- **One Web API read per table per session.** On first load for an entity, `Xrm.WebApi.retrieveMultipleRecords` pulls its Managed Table + Form Rules + Conditions (expand or batched). Config is small.
- **Cache** the parsed config in a module-level variable and/or `sessionStorage`, keyed by entity logical name. Subsequent form loads for the same entity reuse it.
- **Cache invalidation:** include a config `modifiedon` high-water mark or a version env variable; simplest v1 = per-session cache (new session picks up changes). Document this so admins know changes apply on reload/new session.
- **OnChange re-evaluation** is in-memory only (no server calls) — fast.
- Keep selects tight (`$select` only needed columns) and filter server-side by entity.

---

## 11. Security & governance

- **Who configures:** restrict create/update on the three config tables to a **CFE Administrator** security role (makers/BAs). End users have no access.
- **Auditing:** enable auditing on the config tables — behaviour changes are traceable.
- **No data exposure:** the engine controls UI only; it does **not** replace field-level security or row security. Sensitive-field protection still uses platform Field Security Profiles.
- **Bypass awareness:** because this is UX-only, document clearly that mandatory here is *not* a data-integrity guarantee — integrations/imports bypass it. If hard enforcement is needed, schedule the Phase-2 plugin (§16).

---

## 12. ALM, packaging & deployment

- **Dedicated publisher + prefix.** Choose the org-standard prefix **once** (it is permanent) — e.g. `cfe` or the org's platform prefix. All three tables + the web resource live under it.
- **Dedicated solution** `ConfigurableFormEngine` containing: 3 tables, the web resource(s), choice definitions, security role, env variables.
- **Ship as a managed solution** into each project environment. The engine is identical everywhere.
- **Config is data, not solution.** Form Rules/Conditions are per-project data — manage them with the **Configuration Migration tool** (or environment-specific seeding), not baked into the managed solution (except optional default samples).
- **Form registration** is per-form and travels with each project's own solution (the OnLoad handler reference). Provide a documented standard + optional script to apply it in bulk.
- **Environment variables:** `cfe_Enabled` (global kill-switch), `cfe_DebugMode` (verbose console logging + skip diagnostics).

---

## 13. Naming conventions

- Tables/columns: `<prefix>_<name>` (e.g. `cfe_formrule`, `cfe_setvisibility`).
- Web resource: `<prefix>_/formengine/formEngine.js`.
- Choice (global option set) names: `<prefix>_elementtype`, `<prefix>_operator`, etc. — define as **global** choices so they're reusable and consistent.
- Security role: `CFE Administrator`.

---

## 14. Edge cases & known limitations

| Area | Handling |
|---|---|
| **Quick Create forms** | Separate form type; register engine on them explicitly if needed. |
| **Quick View forms** | Read-only embedded; out of scope. |
| **Editable grids / views** | Not form events; out of scope (UX engine is form-only). |
| **Business Process Flow fields** | Header/BPF controls differ; engine try/catches and skips. |
| **Field on form multiple times** | Engine iterates all controls for the logical name. |
| **Tab/section names differ per form** | Use the **Form Name** scope on rules; names come from form designer, not metadata. |
| **System-required fields** | Never hidden (guard rail 1). |
| **Config references missing element** | Skipped safely; broader-than-form config is allowed. |
| **Performance on very large forms** | Single config read + in-memory apply; negligible. |
| **Default value on calculated/rollup fields** | These are read-only by platform; engine skips `setValue` (try/catch, debug-log). |
| **Default value type mismatch** | `Default Value Type` tells the engine how to parse; a bad parse is skipped and debug-logged rather than throwing. |
| **Locked field that is also required & empty** | Save trap — see guard rail 10; engine warns in debug mode, design must avoid. |
| **`Lock When Set` on free-text fields** | OnChange fires on commit/blur, so the field locks after the user leaves it; document so authors expect it. |
| **Disabled fields and submit** | Programmatic defaults use `setSubmitMode('always')` so they persist despite being read-only. |
| **Canvas / Power Pages** | Out of scope — different architecture. |

---

## 15. Testing strategy

- **Unit-style harness:** a test form with a mix of fields/tabs/sections + seeded rules covering each action and operator.
- **Scenarios:** unconditional show; conditional show (AND); conditional show (OR); required-when; hide-clears-required; deny-by-default reveals only configured; priority conflict resolution; missing-element safety; create-vs-update scoping; live OnChange re-evaluation; system-required not hidden.
- **Debug mode** prints every decision (element, rule, result) to console for verification — the antidote to the original "unverifiable logic" pain.
- **Regression:** because one script serves all tables, maintain a fixed regression deck run before each engine release.

---

## 16. Roadmap

| Phase | Capability | Notes |
|---|---|---|
| **v1 (this spec)** | Visibility, requirement, **editability (read-only/disable)**, **default values**, **value-locking** — conditional, deny-by-default, model-driven, UX-only | The agreed scope. |
| **v2** | **Generic server-side plugin** enforcing mandatory (and optionally locked/immutable fields) on Create/Update | Un-bypassable enforcement; reads the same config tables. |
| **v3** | **Admin UX + rule tester** (model-driven app) | Author and test rules without raw rows. |
| **v3** | **More operators / value types**, nested condition groups, further action types (set field label, set notification) | Only if real demand appears. |
| **Future** | Canvas app component (Power Fx reading same config) | Separate pattern; only if canvas adoption grows. |

---

## 17. Worked example

**Goal on `account`:** hide everything by default; always show Account Name; show Credit Limit and make it required, but only when Customer Type = Corporate.

| Config | Values |
|---|---|
| Managed Table | `cfe_name = account`, `Engine Enabled = yes`, `Default Field Visibility = Hidden`, `Default Tab/Section Visibility = Hidden` |
| Form Rule 1 | Name "Always show Account Name"; Element Type `Field`; Element `name`; Set Visibility `Show`; Applies On `Both`; (no conditions) |
| Form Rule 2 | Name "Show Credit Limit for Corporate"; Element `creditlimit`; Set Visibility `Show`; Set Requirement `Required`; Applies On `Both`; Condition Match `All (AND)` |
| Rule 2 → Condition | Driver Field `customertypecode`; Operator `Equals`; Value `3` (Corporate option value); Value Type `Choice` |

**Runtime:** form opens → all hidden → Account Name shown → if Customer Type is Corporate, Credit Limit shown + required; if the user changes Customer Type away from Corporate, OnChange hides Credit Limit and clears its requirement. **Zero JavaScript written.**

**Second example — editability, default, value-lock (`account`):**

| Config | Values |
|---|---|
| Form Rule 3 | Name "Default Onboarding Date today"; Element `cfe_onboardingdate`; Set Default Value `Apply When Empty`; Default Value Type `Today`; Applies On `Create` |
| Form Rule 4 | Name "Account Number is set-once"; Element `accountnumber`; Value Lock `Lock After Save`; Applies On `Both` |
| Form Rule 5 | Name "Lock Tax ID once entered"; Element `cfe_taxid`; Value Lock `Lock When Set`; Applies On `Both` |
| Form Rule 6 | Name "Risk Rating read-only unless Compliance"; Element `cfe_riskrating`; Set Editability `Read-Only (Disabled)`; Condition: Driver `cfe_userisCompliance`-style flag `Equals` `false` |

**Runtime:** on Create, Onboarding Date is pre-filled with today (and saved); Account Number is editable on Create but locked on every subsequent open; Tax ID becomes read-only the moment a value is entered; Risk Rating is read-only unless the relevant condition is met — **all by configuration, no per-table script.**

---

## 18. Decisions log & open questions

### Decisions (confirmed)
| # | Decision |
|---|---|
| D1 | Surface = **model-driven app forms only**. |
| D2 | Layer = **form experience (UX)**; JS web resource; **no plugin in v1**. |
| D3 | Built as a **reusable org-wide module** across projects to cut per-table JS. |
| D4 | Scope of actions v1 = **visibility (field/tab/section) + field requirement**. |
| D5 | **Deny-by-default** supported, per-table switchable, made safe by guard rails. |
| D6 | Behaviour stored as **data in 3 config tables**; engine is fixed generic code (justified L3). |
| D7 | v1 action set **expanded to five**: visibility, requirement, **editability (read-only/disable)**, **default values** (incl. dynamic Today/Current User), **value-locking** (lock-when-set / lock-after-save). |
| D8 | **Multiple forms per table** modelled with a first-class **Managed Form** child table (matched by Form Id / name, per-form enable + default-visibility override). Form Rules link to a Managed Form (blank = all forms); the old free-text Form Name field was removed. |

### Open questions for review
- **Publisher prefix** — confirm the org-standard permanent prefix (spec uses `cfe_`).
- **Environment to build in** — use the connected `SysAIWorkshopDataverse` for the prototype, or a dedicated platform environment?
- **Default visibility default** — confirm Hidden as the org default (recommended) vs Visible.
- **Conflict model** — confirm "highest Priority wins, ties → last loaded" is acceptable.
- **Caching** — confirm per-session cache is acceptable for v1 (changes apply on new session/reload).
- **Bulk form registration** — do we want the optional script to register the OnLoad handler across many forms, or leave it manual per form?
```
