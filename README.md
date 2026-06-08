# Configurable Form Engine (CFE)

**Author:** Abdul Basit  
**Publisher prefix:** `mab`  
**Solution:** `ConfigurableFormEngine`  
**Target:** Model-driven apps on Microsoft Dataverse / Dynamics 365

---

## What it is

A **single generic JavaScript web resource** that drives model-driven app form behaviour entirely from Dataverse configuration tables. Register it once on any form's OnLoad event — no per-table JavaScript ever again.

**Controls (v1):**
- Field, tab, and section **visibility** (show / hide)
- Field **requirement** (required / optional)
- Field **editability** (read-only / editable)
- Field **default values** (static, Today, Current User, Lookup)
- Field **value locking** (lock when set / lock after save)
- All of the above **conditionally** — re-evaluated on OnChange of driver fields

---

## Quick start

1. Import [`Form Engine/solution/ConfigurableFormEngine_unmanaged.zip`](Form%20Engine/solution/ConfigurableFormEngine_unmanaged.zip) into your environment
2. Register the OnLoad handler on any form:
   ```
   Library : mab_formengine.js
   Function: MAB.FormEngine.onLoad
   ✅ Pass execution context as first parameter
   ```
3. Configure behaviour from data — see the [full README](Form%20Engine/README.md)

---

## Repository structure

```
Form Engine/
├── webresources/
│   ├── mab_formengine.js         ← full source
│   └── mab_formengine.min.js     ← minified (production)
├── solution/
│   ├── ConfigurableFormEngine_unmanaged.zip   ← import this
│   └── unpack/                   ← solution XML for source control / ALM
├── README.md                     ← full documentation
└── Design - Configurable Form Engine (CFE).md ← design spec
```

---

## License

MIT — free to use, modify, and distribute with attribution to **Abdul Basit**.
