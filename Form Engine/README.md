# Configurable Form Engine (CFE)

**Publisher:** Abdul Basit · **Prefix:** `mab` · **Solution:** `ConfigurableFormEngine`  
**Environment:** SysAIWorkShop — `https://orgf7fa940a.crm4.dynamics.com`  
**Web resource:** `mab_formengine.js` (ID `7e56da7e-b361-f111-a825-7c1e5220a28a`)

---

## What it is

A **single generic JavaScript web resource** that drives model-driven app form behaviour from Dataverse configuration tables. Register it once on any form's OnLoad event and control field/tab/section behaviour entirely from data — no per-table JavaScript ever again.

**What it controls (v1):**
- Field, tab, and section **visibility** (show / hide)
- Field **requirement** (required / optional)
- Field **editability** (read-only / disabled)
- Field **default values** (static text, number, boolean, choice, Today, Current User, lookup)
- Field **value locking** (lock when set / lock after save)
- All of the above **conditionally** — re-evaluated on OnChange of driver fields

**What it does NOT do (v1):**
- Server-side enforcement (UX layer only — a determined user can bypass via API)
- Canvas apps, portals, or any non-model-driven surface
- Deny-by-default (removed by design — form shows normally; rules only override specific behaviours)

---

## Architecture

### Tables (all prefixed `mab_`)

```
mab_managedtable          ← registers a table into the engine
    └── mab_managedform   ← one row per form of that table (optional scoping)
    └── mab_formrule      ← one behaviour instruction (can be scoped to a form or table-wide)
            └── mab_formrulecondition  ← predicate(s) that gate when a rule fires
```

### Relationships
| Parent | Child | Type |
|---|---|---|
| `mab_managedtable` | `mab_managedform` | Parental (cascade delete) |
| `mab_managedtable` | `mab_formrule` | Referential restrict-delete |
| `mab_managedform` | `mab_formrule` | Referential remove-link |
| `mab_formrule` | `mab_formrulecondition` | Parental (cascade delete) |

---

## Option-set base

All custom option values use base **`734000000`** (publisher `customizationoptionvalueprefix` = 73400).

---

## Table schemas

### `mab_managedtable` — register a table

| Field | Type | Values / Notes |
|---|---|---|
| `mab_name` | Text (PK label) | **Entity logical name** e.g. `sysai_project` — engine queries by this |
| `mab_enabled` | Boolean | `true` = engine active for this table |
| `mab_notes` | Multiline Text | Free notes |

> **`mab_name` must exactly match the entity logical name** — the engine queries `mab_managedtable` filtered by this value on every form load.

---

### `mab_managedform` — scope rules to a specific form

| Field | Type | Values / Notes |
|---|---|---|
| `mab_name` | Text | Display name of the form |
| `mab_managedtableid` | Lookup → `mab_managedtable` | **Required** |
| `mab_formid` | Text (100) | Form GUID (without braces) — used for exact matching |
| `mab_formtype` | Choice | Main `734000000` · Quick Create `734000001` · Quick View `734000002` · Card `734000003` |
| `mab_enabled` | Boolean | `false` disables engine on this form entirely |

> Form resolution order: **exact GUID match** on `mab_formid` first; fallback to **name match** on `mab_name` vs the form's label.  
> A rule with no `mab_managedformid` set applies to **all forms** of that table.

---

### `mab_formrule` — one behaviour instruction

| Field | Type | Values / Notes |
|---|---|---|
| `mab_name` | Text | Descriptive label |
| `mab_managedtableid` | Lookup → `mab_managedtable` | **Required** |
| `mab_managedformid` | Lookup → `mab_managedform` | Optional — leave blank = all forms |
| `mab_active` | Boolean | `true` = rule is active (only active rules are loaded) |
| `mab_priority` | Integer | Lower number = runs first. Use 10, 20, 30 etc. |
| `mab_elementtype` | Choice | Field `734000000` · Tab `734000001` · Section `734000002` |
| `mab_elementname` | Text | Field logical name / tab name / section name (engine lowercases it) |
| `mab_applieson` | Choice | Create `734000000` · Update `734000001` · Both `734000002` |
| `mab_conditionmatch` | Choice | All/AND `734000000` · Any/OR `734000001` |
| `mab_setvisibility` | Choice | No Change `734000000` · Show `734000001` · Hide `734000002` |
| `mab_setrequirement` | Choice | No Change `734000000` · Required `734000001` · Optional `734000002` |
| `mab_seteditability` | Choice | No Change `734000000` · Editable `734000001` · Read-Only `734000002` |
| `mab_setdefault` | Choice | No Change `734000000` · Apply When Empty `734000001` |
| `mab_defaultvaluetype` | Choice | Text `734000000` · Number `734000001` · Boolean `734000002` · Choice `734000003` · Lookup `734000004` · Today `734000005` · Current User `734000006` |
| `mab_defaultvalue` | Text | Static value string. For Lookup: `"logicalname:guid:displayname"`. For Today/Current User: leave blank. |
| `mab_valuelock` | Choice | No Change `734000000` · Lock When Set `734000001` · Lock After Save `734000002` · Unlocked `734000003` |
| `mab_description` | Multiline Text | Notes |

**Rule application order** (within one rule, all actions are applied in this fixed sequence):  
`visibility → default value → requirement → editability → value lock`

---

### `mab_formrulecondition` — gate a rule with a predicate

| Field | Type | Values / Notes |
|---|---|---|
| `mab_name` | Text | Descriptive label |
| `mab_formruleid` | Lookup → `mab_formrule` | **Required** |
| `mab_sequence` | Integer | Evaluation order (lowest first) |
| `mab_driverfield` | Text | Logical name of the field whose value is tested |
| `mab_operator` | Choice | Equals `734000000` · Not Equals `734000001` · Contains `734000002` · Does Not Contain `734000003` · Is Empty `734000004` · Is Not Empty `734000005` · In `734000006` · Greater Than `734000007` · Less Than `734000008` |
| `mab_value` | Text | Expected value. For **Choice/Number**: numeric string e.g. `"912360002"`. For **In operator**: comma-separated e.g. `"1,2,3"`. For **Lookup**: GUID or display name. For **Is Empty / Is Not Empty**: leave blank. |
| `mab_valuetype` | Choice | Text `734000000` · Number `734000001` · Boolean `734000002` · Choice `734000003` · Lookup `734000004` |

---

## Registering the engine on a form

1. Open the form in the maker portal
2. **Form Properties → Events → On Load → + Event Handler**
   - Library: `mab_formengine.js`
   - Function: `MAB.FormEngine.onLoad`
   - ✅ **Pass execution context as first parameter** — this is mandatory
3. Save and Publish

---

## Onboarding a new table — step by step

```
1. Register the table
   CREATE mab_managedtable:
     mab_name = "<entity_logical_name>"     ← must match exactly
     mab_enabled = true

2. Register forms (one row per form you want to manage)
   CREATE mab_managedform:
     mab_managedtableid = <managedtable record>
     mab_name = "<form display name>"
     mab_formid = "<form GUID without braces>"
     mab_formtype = 734000000 (Main)
     mab_enabled = true

3. Create rules
   CREATE mab_formrule for each behaviour:
     mab_managedtableid = <managedtable record>
     mab_managedformid = <leave blank for all forms, or set for form-specific>
     mab_active = true
     mab_priority = 10
     mab_elementtype = 734000000 (Field)
     mab_elementname = "<field_logical_name>"
     ... set the action fields (setvisibility, setrequirement, etc.)

4. Add conditions (optional — omit for unconditional rules)
   CREATE mab_formrulecondition:
     mab_formruleid = <formrule record>
     mab_driverfield = "<field_logical_name>"
     mab_operator = 734000000 (Equals)
     mab_value = "<expected_value>"
     mab_valuetype = 734000003 (Choice) / 734000000 (Text) / etc.
     mab_sequence = 1

5. Register OnLoad handler on the form (manual, in maker portal)
   Function: MAB.FormEngine.onLoad
   Pass execution context: true
```

---

## Common rule patterns

### Hide a field always
```
mab_elementtype = 734000000 (Field)
mab_elementname = "fieldlogicalname"
mab_setvisibility = 734000002 (Hide)
mab_applieson = 734000002 (Both)
mab_active = true
```

### Make a field required when another field equals a value
```
Rule:
  mab_elementname = "fieldlogicalname"
  mab_setrequirement = 734000001 (Required)
  mab_applieson = 734000002 (Both)
  mab_conditionmatch = 734000000 (AND)
  mab_active = true

Condition:
  mab_driverfield = "driverfieldlogicalname"
  mab_operator = 734000000 (Equals)
  mab_value = "912360002"           ← choice option value as string
  mab_valuetype = 734000003 (Choice)
```

> ⚠️ **Important:** When a conditional rule does not fire, the engine does not automatically reset the field to its previous state. If you make a field required conditionally, add a second rule (lower priority, same condition negated) that sets it back to Optional. Example: one rule sets Required when Status=Active, a second rule sets Optional when Status≠Active.

### Default value = Today on create
```
mab_elementname = "datefieldlogicalname"
mab_setdefault = 734000001 (Apply When Empty)
mab_defaultvaluetype = 734000005 (Today)
mab_applieson = 734000000 (Create)
mab_active = true
```

### Default value = Current User on create (lookup field)
```
mab_elementname = "lookupfieldlogicalname"   ← must be a systemuser lookup
mab_setdefault = 734000001 (Apply When Empty)
mab_defaultvaluetype = 734000006 (Current User)
mab_applieson = 734000000 (Create)
mab_active = true
```

### Read-only on existing records (update only)
```
mab_elementname = "fieldlogicalname"
mab_seteditability = 734000002 (Read-Only)
mab_applieson = 734000001 (Update)
mab_active = true
```

### Lock field after record is saved
```
mab_elementname = "fieldlogicalname"
mab_valuelock = 734000002 (Lock After Save)
mab_applieson = 734000002 (Both)
mab_active = true
```

### Lock field once a value is entered (can't change it)
```
mab_elementname = "fieldlogicalname"
mab_valuelock = 734000001 (Lock When Set)
mab_applieson = 734000002 (Both)
mab_active = true
```

---

## Guard rails built into the engine

| Guard rail | Behaviour |
|---|---|
| **Hide → clear required** | Hiding a field automatically clears its required level to `none` so save is never blocked |
| **Default → only when empty** | Default values are never applied if the field already has a value |
| **Default → always submit** | After setting a default, `setSubmitMode("always")` is called so the value persists on save |
| **Debug save-trap warning** | In debug mode, logs a warning if a field is required, read-only, and empty (would block save) |

---

## Runtime behaviour

1. **OnLoad fires** → engine reads entity logical name → loads config from all 4 tables (one async call chain) → **cached per browser session** per entity
2. **Form resolution** → matches `mab_managedform` by form GUID first, then by name
3. **Rule selection** → filters rules by form scope + `appliesOn` (Create / Update / Both)
4. **Rule application** → sorted by `mab_priority` ascending → each rule checks conditions → applies all set actions in order
5. **OnChange wiring** → for every driver field referenced in a condition, `addOnChange` is registered once → triggers a full re-evaluation pass on change

---

## Caching

Config is cached in-memory per browser session per entity. After editing config rows:

```javascript
MAB.FormEngine.clearCache()
```

Then refresh the form. No need to republish the web resource.

---

## Debugging

Enable verbose logging at any time without page refresh:

```javascript
window.MAB_FORMENGINE_DEBUG = true
```

Console will output `[CFE]` prefixed messages showing:
- Config loaded (full config object)
- Which rules fired
- Condition evaluation results
- Default values applied
- Any warnings (e.g. save-trap)

Disable:
```javascript
window.MAB_FORMENGINE_DEBUG = false
```

---

## Known limitations and traps

| Limitation | Detail |
|---|---|
| **UX layer only** | Rules apply in JavaScript. Server-side enforcement (e.g. mandatory check on save via plugin) is v2 scope. |
| **No automatic reset** | When a conditional rule stops firing (condition becomes false), the engine does not undo what a previous pass set. Add a counter-rule to explicitly reset. |
| **Tab/Section names** | `mab_elementname` for tabs and sections must match the internal name, not the display label. Get it from form XML or browser dev tools. |
| **Lookup default** | Current User default only works on `systemuser` lookup fields. For other lookup types use the static Lookup format: `"logicalname:guid:displayname"`. |
| **Choice condition values** | Always use the **numeric option value** as a string (e.g. `"912360002"`), not the label. |
| **In operator** | `mab_value` must be comma-separated numeric strings with no spaces e.g. `"912360000,912360002"`. |
| **Per-session cache** | If config is changed during testing, run `MAB.FormEngine.clearCache()` in the console before refreshing. |
| **OnLoad only** | Engine runs on form load and on OnChange of driver fields. It does not run on OnSave. |
| **Form registration** | The OnLoad handler must be registered manually per form in the maker portal — there is no programmatic way to do this via solution XML that is reliable. |

---

## Files

| Path | Description |
|---|---|
| `Form Engine/webresources/mab_formengine.js` | The generic engine (single file, no dependencies) |
| `Form Engine/solution/ConfigurableFormEngine_unmanaged.zip` | Latest unmanaged solution export |
| `Form Engine/Design - Configurable Form Engine (CFE).md` | Full design specification |
| `Form Engine/README.md` | This file |

---

## Existing onboarded tables

| Table | Managed Table ID | Forms |
|---|---|---|
| `sysai_project` | `e08e336a-3a62-f111-a825-e4fb1ef536c0` | Construction Project Form, Information |

---

## Environment IDs (SysAIWorkShop)

| Item | ID |
|---|---|
| Publisher (Abdul Basit) | `c4f6ad33-ad61-f111-a825-7c1e5220a28a` |
| Solution (ConfigurableFormEngine) | `7593423c-ad61-f111-a825-7c1e5220a28a` |
| Web resource `mab_formengine.js` | `7e56da7e-b361-f111-a825-7c1e5220a28a` |
| `mab_managedtable` MetadataId | `9788b9ca-af61-f111-a825-7c1e5220a28a` |
| `mab_managedform` MetadataId | `31ce1d08-b261-f111-a825-7c1e5220a28a` |
| `mab_formrule` MetadataId | `677c40f9-af61-f111-a825-7c1e5220a28a` |
| `mab_formrulecondition` MetadataId | `a1d7da08-b061-f111-a825-7c1e5220a28a` |
