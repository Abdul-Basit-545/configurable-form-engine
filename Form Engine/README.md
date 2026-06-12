# Configurable Form Engine (CFE)

**Author:** Abdul Basit · **Publisher prefix:** `mab`  
**Platform:** Microsoft Dynamics 365 / Power Platform (Model-driven apps)  
**Version:** 1.1

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
| Validation | AlphaOnly, NumericOnly, Email, NoFutureDate, NoPastDate, MaxLength, Regex |
| Conditions | Any of the above triggered only when a driver field equals / contains / is empty / etc. |
| Role restrictions | Apply a rule only to users in a specific security role |

All rules are re-evaluated live when a driver field changes — no page refresh needed.

---

## Installation

1. Download [`ConfigurableFormEngine_managed.zip`](solution/ConfigurableFormEngine_managed.zip) *(production)* or [`ConfigurableFormEngine_unmanaged.zip`](solution/ConfigurableFormEngine_unmanaged.zip) *(development)*
2. Go to **make.powerapps.com → Solutions → Import solution**
3. Import the zip — this creates 5 configuration tables and the `mab_formengine` web resource in your environment

---

## Register the web resource on a form

1. Open your form in the maker portal
2. **Form Properties → Events → On Load → + Event Handler**
   - Library: `mab_formengine`
   - Function: `MAB.FormEngine.onLoad`
   - ✅ **Pass execution context as first parameter** — mandatory
3. Save and Publish

That's it. Now configure behaviour from data.

---

## Configuration tables

The engine reads from 5 tables (all prefixed `mab_`):

```
mab_managedtable              ← register a table (use its entity logical name)
    └── mab_managedform       ← optional: scope rules to a specific form
    └── mab_formrule          ← one behaviour instruction per rule
            └── mab_formrulecondition  ← condition(s) that gate when a rule fires
            └── mab_formrulerole       ← restrict rule to a security role
```

---

## Method 1 — Configure via Model-Driven App

Open the **Configurable Form Engine** model-driven app that ships with the solution.

### Step 1 — Register the table

Go to **Managed Tables → New**

| Field | Value |
|---|---|
| `mab_name` | Entity logical name e.g. `account`, `contact` — **must match exactly** |
| `mab_enabled` | Yes |
| `mab_defaultfieldvisibility` | Hidden (deny-by-default) or Visible |
| `mab_defaulttabvisibility` | Hidden or Visible |

### Step 2 — Register the form *(optional — skip to apply rules to all forms)*

Go to the Managed Table record → **Managed Forms → New**

| Field | Value |
|---|---|
| `mab_managedtableid` | The managed table record above |
| `mab_name` | Display name of the form e.g. "Information" |
| `mab_formtype` | Main / Quick Create / Quick View / Card |
| `mab_formid` | Form GUID without braces (get from form URL in maker portal) |
| `mab_enabled` | Yes |

### Step 3 — Create rules

Go to **Form Rules → New** (or open the Managed Table → Form Rules subgrid)

| Field | Value |
|---|---|
| `mab_managedtableid` | The managed table record |
| `mab_managedformid` | Optional — leave blank = applies to all forms |
| `mab_active` | Yes |
| `mab_priority` | Integer — lower runs first (use 10, 20, 30…) |
| `mab_elementtype` | Field / Tab / Section / Form |
| `mab_elementname` | Logical name of the field / internal name of tab or section |
| `mab_applieson` | Create / Update / Both |
| `mab_conditionmatch` | All (AND) / Any (OR) — controls how multiple conditions combine |
| `mab_setvisibility` | No Change / Show / Hide |
| `mab_setrequirement` | No Change / Required / Optional |
| `mab_seteditability` | No Change / Editable / Read-Only |
| `mab_setdefault` | No Change / Apply When Empty |
| `mab_defaultvaluetype` | Text / Number / Boolean / Choice / Lookup / Today / Current User |
| `mab_defaultvalue` | The value. For Lookup: `"logicalname:guid:displayname"`. Today/Current User: leave blank. |
| `mab_valuelock` | No Change / Lock When Set / Lock After Save / Unlocked |
| `mab_validationtype` | AlphaOnly / NumericOnly / Email / NoFutureDate / NoPastDate / MaxLength / Regex |
| `mab_validationparam` | Digit count for MaxLength, pattern string for Regex |

### Step 4 — Add conditions *(optional)*

Open the Form Rule record → **Conditions subgrid → New**

| Field | Value |
|---|---|
| `mab_formruleid` | The rule above |
| `mab_driverfield` | Logical name of the field to test |
| `mab_operator` | Equals / Not Equals / Contains / Does Not Contain / Is Empty / Is Not Empty / In / Greater Than / Less Than |
| `mab_value` | Expected value. For Choice/Number: numeric string e.g. `"912360002"`. For In: comma-separated. For Is Empty/Is Not Empty: leave blank. |
| `mab_valuetype` | Text / Number / Boolean / Choice / Lookup |
| `mab_sequence` | Evaluation order (lowest first) |

> Multiple conditions use `mab_conditionmatch` on the rule (All = AND, Any = OR).

### Step 5 — Restrict to a role *(optional)*

Open the Form Rule record → **Role Assignments subgrid → New**

| Field | Value |
|---|---|
| `mab_ruleid` | The rule above |
| `mab_rolename` | Display name of the security role |
| `mab_roleguid` | Lowercase GUID of the role without braces |

---

## Method 2 — Configure via CFE Copilot Agent

The **CFE Agent** (included in the `copilot-agent/` folder) is a Copilot Studio agent that lets you configure the entire engine through a natural language chat interface — no form-filling required.

### Prerequisites

1. Import the CFE solution into your environment
2. Deploy the CFE Agent to Copilot Studio (see `copilot-agent/` for YAML sources)
3. Open the agent in Copilot Studio → Test panel (or embed it in a model-driven app)

### What you can say

The agent understands natural language. Just describe what you want:

**Register a table**
```
Register the sysai_project table in CFE, enable it, default all fields hidden
```

**Create a visibility rule**
```
Create a rule to hide the field 'mab_creditlimit' on the account table, applies on create only, priority 10
```

**Create a conditional rule**
```
Create a rule to make 'mab_taxid' required on the contact table when 'mab_customertype' equals 1
```

**Add a condition to an existing rule**
```
Add a condition to that rule — when sysai_status equals 2
```

**Register a form**
```
Register the Information form for the account table, form type main, enabled true, form ID 3d759411-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

**Restrict a rule to a role**
```
Assign the rule 'Hide Cost Tab - Project' to the Sales Manager role, GUID 9b7f3e00-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

**List configuration**
```
List all managed tables
List all rules for the account table
```

**Update or delete**
```
Disable the rule 'Hide Cost Tab - Project'
Delete the condition on rule fc3e4e04-xxxx
```

### How the agent works

The agent uses 7 Dataverse connector tools:

| Tool | Purpose |
|---|---|
| CFE - Create Form Rule | Creates `mab_formrule` records with lookup binding |
| CFE - Create Managed Form | Creates `mab_managedform` records with lookup binding |
| CFE - Create Rule Condition | Creates `mab_formrulecondition` records with lookup binding |
| CFE - Assign Role to Rule | Creates `mab_formrulerole` records with lookup binding |
| Add a new row to selected environment | Creates `mab_managedtable` records (no lookup) |
| List rows from selected environment | Looks up any CFE record, resolves GUIDs |
| Update a row in selected environment | Modifies existing records |
| Delete a row from selected environment | Removes records |

The agent automatically:
- Looks up parent GUIDs before creating child records
- Confirms details before writing
- Returns the record ID of everything it creates
- Reminds you when you can add conditions or role restrictions

---

## Common rule examples

### Always hide a field
```
mab_elementtype   = Field
mab_elementname   = fieldlogicalname
mab_setvisibility = Hide
mab_applieson     = Both
mab_active        = Yes
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

### Lock a field once a value is entered
```
mab_elementname = fieldlogicalname
mab_valuelock   = Lock When Set
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
| Condition Match | All (AND) = every condition must match. Any (OR) = at least one condition must match. |

---

## Repository contents

| Path | Description |
|---|---|
| `solution/ConfigurableFormEngine_managed.zip` | Import for production environments |
| `solution/ConfigurableFormEngine_unmanaged.zip` | Import for development environments |
| `webresources/mab_formengine.js` | The web resource JavaScript (already inside the solution zip) |
| `copilot-agent/` | CFE Copilot Studio agent YAML sources |
| `README.md` | This file |

---

*Author: Abdul Basit — free to use and redistribute.*
