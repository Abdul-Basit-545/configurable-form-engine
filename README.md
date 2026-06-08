# Configurable Form Engine (CFE)

**Author:** Abdul Basit · **Publisher prefix:** `mab`  
**Platform:** Microsoft Dynamics 365 / Power Platform (Model-driven apps)

> Stop writing JavaScript for every form. Configure field behaviour from data.

---

## What it does

A single web resource that drives model-driven app form behaviour entirely from Dataverse configuration records. Register it once on a form's OnLoad event — then control field visibility, requirement, editability, default values, and value locking from data, not code.

**No per-table JavaScript. No republishing. Just data.**

---

## Quick start

1. **Download** [`Form Engine/solution/ConfigurableFormEngine_unmanaged.zip`](Form%20Engine/solution/ConfigurableFormEngine_unmanaged.zip)
2. **Import** it into your Dynamics 365 / Power Platform environment
3. **Register** the OnLoad handler on any form:
   - Library: `mab_formengine`
   - Function: `MAB.FormEngine.onLoad`
   - ✅ Pass execution context as first parameter
4. **Configure** behaviour from the 4 `mab_` tables — see the [full documentation](Form%20Engine/README.md)

---

## Full documentation

See **[Form Engine/README.md](Form%20Engine/README.md)** for:
- All configuration tables and fields
- Step-by-step onboarding guide
- Common rule examples (hide, required, defaults, locking)
- Debugging and cache clearing

---

*Author: Abdul Basit — free to use and redistribute.*
