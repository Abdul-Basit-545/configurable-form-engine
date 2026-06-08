# Configurable Form Engine (CFE)

**Author:** Abdul Basit · **Publisher prefix:** `mab`  
**Platform:** Microsoft Dynamics 365 / Power Platform (Model-driven apps)  
**Version:** 1.0

> Stop writing JavaScript for every form. Configure field behaviour from data — once, for any table.

---

## What it does

Register one web resource on any model-driven form's **OnLoad** event. From that point, all field/tab/section behaviour on that form is controlled entirely from Dataverse configuration records — no per-table JavaScript needed.

**Controls:**

| Behaviour | Options |
|---|---|
| Visibility | Show / Hide a field, tab, or section |
| Requirement | Required / Optional |
| Editability | Editable / Read-Only |
| Default value | Static text, number, boolean, choice, Today, Current User, Lookup |
| Value lock | Lock when a value is entered / Lock after record is saved |
| Conditions | Any of the above triggered only when a driver field equals / contains / is empty / etc. |

All rules are re-evaluated live when a driver field changes — no page refresh needed.

---

## Installation

1. Download [`ConfigurableFormEngine_unmanaged.zip`](solution/ConfigurableFormEngine_unmanaged.zip)
2. Go to **make.powerapps.com → Solutions → Import solution**
3. Import the zip — this creates 4 configuration tables and the `mab_formengine` web resource in your environment

---

## Register on a form

1. Open your form in the maker portal
2. **Form Properties → Events → On Load → + Event Handler**
   - Library: `mab_formengine`
   - Function: `MAB.FormEngine.onLoad`
   - ✅ **Pass execution context as first parameter** — mandatory
3. Save and Publish

That's it. Now configure behaviour from data.

---

## Configuration tables

The engine reads from 4 tables (all prefixed `mab_`):

```
mab_managedtable          ← register a table (use its entity logical name)
    └── mab_managedform   ← optional: scope rules to a specific form
    └── mab_formrule      ← one behaviour instruction per rule
            └── mab_formrulecondition  ← condition(s) that gate when a rule fires
```

---

## Step-by-step: onboard a new table

### 1. Register the table

Create a `mab_managedtable` record:

| Field | Value |
|---|---|
| `mab_name` | Entity logical name e.g. `account`, `sysai_project` — **must match exactly** |
| `mab_enabled` | Yes |

### 2. Register the form (optional — skip to apply rules to all forms)

Create a `mab_managedform` record:

| Field | Value |
|---|---|
| `mab_managedtableid` | The managed table record above |
| `mab_name` | Display name of the form |
| `mab_formid` | Form GUID without braces (get from form URL or form XML) |
| `mab_enabled` | Yes |

### 3. Create rules

Create a `mab_formrule` record for each behaviour:

| Field | Value |
|---|---|
| `mab_managedtableid` | The managed table record |
| `mab_managedformid` | Optional — leave blank = applies to all forms |
| `mab_active` | Yes |
| `mab_priority` | Integer — lower runs first (use 10, 20, 30...) |
| `mab_elementtype` | Field / Tab / Section |
| `mab_elementname` | Logical name of the field / internal name of tab or section |
| `mab_applieson` | Create / Update / Both |
| `mab_setvisibility` | No Change / Show / Hide |
| `mab_setrequirement` | No Change / Required / Optional |
| `mab_seteditability` | No Change / Editable / Read-Only |
| `mab_setdefault` | No Change / Apply When Empty |
| `mab_defaultvaluetype` | Text / Number / Boolean / Choice / Lookup / Today / Current User |
| `mab_defaultvalue` | The value. For Lookup: `"logicalname:guid:displayname"`. For Today/Current User: leave blank. |
| `mab_valuelock` | No Change / Lock When Set / Lock After Save / Unlocked |

### 4. Add conditions (optional)

Create a `mab_formrulecondition` record under the rule:

| Field | Value |
|---|---|
| `mab_formruleid` | The rule above |
| `mab_driverfield` | Logical name of the field to test |
| `mab_operator` | Equals / Not Equals / Contains / Does Not Contain / Is Empty / Is Not Empty / In / Greater Than / Less Than |
| `mab_value` | Expected value. For Choice/Number: numeric string e.g. `"912360002"`. For In: comma-separated e.g. `"1,2,3"`. For Is Empty/Is Not Empty: leave blank. |
| `mab_valuetype` | Text / Number / Boolean / Choice / Lookup |
| `mab_sequence` | Evaluation order (lowest first) |

Multiple conditions on one rule are AND'd together by default. Set `mab_conditionmatch = OR` on the rule to OR them.

---

## Common rule examples

### Always hide a field
```
mab_elementtype  = Field
mab_elementname  = fieldlogicalname
mab_setvisibility = Hide
mab_applieson    = Both
mab_active       = Yes
```

### Make a field required when another field = a specific choice value
```
Rule:
  mab_elementname     = targetfield
  mab_setrequirement  = Required
  mab_applieson       = Both
  mab_active          = Yes

Condition:
  mab_driverfield = statusfield
  mab_operator    = Equals
  mab_value       = 912360002        ← numeric option value as a string
  mab_valuetype   = Choice
```

> **Important:** When the condition becomes false, the engine does not auto-reset the field. Add a second rule (same condition negated, lower priority) that sets it back to Optional.

### Default a date field to today on create
```
mab_elementname      = datefieldlogicalname
mab_setdefault       = Apply When Empty
mab_defaultvaluetype = Today
mab_applieson        = Create
mab_active           = Yes
```

### Default a lookup to the current user on create
```
mab_elementname      = ownerid          ← must be a systemuser lookup
mab_setdefault       = Apply When Empty
mab_defaultvaluetype = Current User
mab_applieson        = Create
mab_active           = Yes
```

### Read-only on existing records only
```
mab_elementname    = fieldlogicalname
mab_seteditability = Read-Only
mab_applieson      = Update
mab_active         = Yes
```

### Lock a field once a value is entered (can't be changed)
```
mab_elementname = fieldlogicalname
mab_valuelock   = Lock When Set
mab_applieson   = Both
mab_active      = Yes
```

### Lock a field after the record is saved
```
mab_elementname = fieldlogicalname
mab_valuelock   = Lock After Save
mab_applieson   = Both
mab_active      = Yes
```

### Hide a whole tab
```
mab_elementtype   = Tab
mab_elementname   = tab_general       ← internal tab name (not display label)
mab_setvisibility = Hide
mab_applieson     = Both
mab_active        = Yes
```

---

## Caching and debugging

Config is cached per browser session per entity. After editing config records, run in the browser console:

```javascript
MAB.FormEngine.clearCache()
```

Then refresh the form. No need to republish the web resource.

To enable verbose logging:

```javascript
window.MAB_FORMENGINE_DEBUG = true
```

The console will show `[CFE]` prefixed messages: which rules fired, condition results, defaults applied, and any warnings.

---

## Important notes

| Note | Detail |
|---|---|
| UX layer only | Rules apply in the browser. There is no server-side enforcement in v1. |
| No auto-reset | When a conditional rule stops firing, the engine does not undo the previous state. Add a counter-rule. |
| Tab/Section names | Use the **internal name**, not the display label. Find it in browser dev tools or form XML. |
| Choice condition values | Always use the **numeric option value** as a string e.g. `"912360002"`, not the label. |
| Hiding clears required | Hiding a field automatically removes its required level so save is never blocked. |
| OnLoad only | Engine runs on form load and on OnChange of driver fields. It does not run on save. |

---

## Repository contents

| File | Description |
|---|---|
| `solution/ConfigurableFormEngine_unmanaged.zip` | Import this into your environment |
| `webresources/mab_formengine.min.js` | The minified web resource (already inside the solution zip) |
| `README.md` | This file |

---

*Author: Abdul Basit — free to use and redistribute.*
