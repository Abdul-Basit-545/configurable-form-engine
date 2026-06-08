/*
 * Configurable Form Engine (CFE)  —  mab_formengine.js
 * ----------------------------------------------------------------------------
 * ONE generic web resource that drives model-driven form behaviour from the
 * mab_ configuration tables. Register MAB.FormEngine.onLoad on a form's OnLoad
 * event with "Pass execution context as first parameter" = TRUE.
 *
 * Behaviour is DATA, not code: see the four tables
 *   mab_managedtable   – per-table registration + default visibility
 *   mab_managedform    – per-form scope (enable + default-visibility override)
 *   mab_formrule       – one behaviour instruction (visibility/requirement/
 *                        editability/default/value-lock) for one element
 *   mab_formrulecondition – predicate(s) that gate when a rule applies
 *
 * Design spec: "Form Engine/Design - Configurable Form Engine (CFE).md"
 * Publisher: Abdul Basit (mab) · Solution: ConfigurableFormEngine
 * ----------------------------------------------------------------------------
 */
var MAB = MAB || {};
MAB.FormEngine = (function () {
    "use strict";

    // ---- Option-set values (must match what was built; base 734000000) -------
    var B = 734000000;
    var TBL_VIS = { HIDDEN: B, VISIBLE: B + 1 };
    var FRM_VIS = { USE_DEFAULT: B, HIDDEN: B + 1, VISIBLE: B + 2 };
    var ELEM    = { FIELD: B, TAB: B + 1, SECTION: B + 2 };
    var VIS     = { NOCHANGE: B, SHOW: B + 1, HIDE: B + 2 };
    var REQ     = { NOCHANGE: B, REQUIRED: B + 1, OPTIONAL: B + 2 };
    var EDIT    = { NOCHANGE: B, EDITABLE: B + 1, READONLY: B + 2 };
    var DEF     = { NOCHANGE: B, APPLY_WHEN_EMPTY: B + 1 };
    var DVT     = { TEXT: B, NUMBER: B + 1, BOOLEAN: B + 2, CHOICE: B + 3, LOOKUP: B + 4, TODAY: B + 5, CURRENTUSER: B + 6 };
    var LOCK    = { NOCHANGE: B, WHEN_SET: B + 1, AFTER_SAVE: B + 2, UNLOCKED: B + 3 };
    var APPLY   = { CREATE: B, UPDATE: B + 1, BOTH: B + 2 };
    var MATCH   = { AND: B, OR: B + 1 };
    var OP      = { EQ: B, NEQ: B + 1, CONTAINS: B + 2, NCONTAINS: B + 3, EMPTY: B + 4, NEMPTY: B + 5, IN: B + 6, GT: B + 7, LT: B + 8 };
    var VT      = { TEXT: B, NUMBER: B + 1, BOOLEAN: B + 2, CHOICE: B + 3, LOOKUP: B + 4 };

    var FORMTYPE_CREATE = 1, FORMTYPE_UPDATE = 2;

    // ---- Module-level cache (per app session) --------------------------------
    var _cache = {};      // entityLogicalName -> config object
    var _debug = (typeof window !== "undefined" && window.MAB_FORMENGINE_DEBUG === true);

    function log() { if (_debug && window.console) { console.log.apply(console, ["[CFE]"].concat([].slice.call(arguments))); } }
    function warn() { if (window.console) { console.warn.apply(console, ["[CFE]"].concat([].slice.call(arguments))); } }

    // ====================================================================== //
    //  ENTRY POINT                                                           //
    // ====================================================================== //
    function onLoad(executionContext) {
        try {
            var fc = executionContext.getFormContext();
            var entity = fc.data.entity.getEntityName();

            loadConfig(entity).then(function (cfg) {
                if (!cfg || !cfg.table || cfg.table.enabled === false) { log("table not managed / disabled:", entity); return; }

                var form = resolveForm(fc, cfg.forms);
                if (form && form.enabled === false) { log("engine disabled for this form:", form.name); return; }

                // Wire OnChange for every driver field used by a conditional rule (once).
                wireDrivers(fc, cfg, form, executionContext);

                applyAll(fc, cfg, form);
            }, function (err) { warn("config load failed for " + entity + ":", err && err.message ? err.message : err); });
        } catch (e) { warn("onLoad error:", e && e.message ? e.message : e); }
    }

    // Re-run the full pass (used by OnChange and after default writes).
    function applyAll(fc, cfg, form) {
        var formType = fc.ui.getFormType();
        applyDenyByDefault(fc, cfg, form);
        var rules = selectRules(cfg.rules, form, formType);   // already priority-asc
        for (var i = 0; i < rules.length; i++) { applyRule(fc, rules[i]); }
    }

    // ====================================================================== //
    //  CONFIG LOADING                                                        //
    // ====================================================================== //
    function loadConfig(entity) {
        if (_cache[entity]) { return Promise.resolve(_cache[entity]); }

        var tSel = "$select=mab_name,mab_enabled,mab_defaultfieldvisibility,mab_defaulttabvisibility,mab_managedtableid";
        var tFilter = "$filter=mab_name eq '" + entity.replace(/'/g, "''") + "'";

        return Xrm.WebApi.retrieveMultipleRecords("mab_managedtable", "?" + tSel + "&" + tFilter + "&$top=1")
            .then(function (res) {
                if (!res.entities.length) { _cache[entity] = { table: null }; return _cache[entity]; }
                var t = res.entities[0];
                var cfg = {
                    table: {
                        id: t.mab_managedtableid,
                        enabled: t.mab_enabled !== false,
                        defaultFieldVis: t.mab_defaultfieldvisibility,
                        defaultTabVis: t.mab_defaulttabvisibility
                    },
                    forms: [],
                    rules: []
                };
                var tid = t.mab_managedtableid;

                var formsP = Xrm.WebApi.retrieveMultipleRecords("mab_managedform",
                    "?$select=mab_name,mab_formid,mab_formtype,mab_enabled,mab_defaultfieldvisibility,mab_defaulttabvisibility" +
                    "&$filter=_mab_managedtableid_value eq " + tid);

                var rulesP = Xrm.WebApi.retrieveMultipleRecords("mab_formrule",
                    "?$select=mab_elementtype,mab_elementname,mab_setvisibility,mab_setrequirement,mab_seteditability," +
                    "mab_setdefault,mab_defaultvalue,mab_defaultvaluetype,mab_valuelock,mab_applieson,mab_conditionmatch,mab_priority" +
                    "&$filter=_mab_managedtableid_value eq " + tid + " and mab_active eq true" +
                    "&$expand=mab_formrule_formrulecondition($select=mab_driverfield,mab_operator,mab_value,mab_valuetype,mab_sequence)" +
                    "&$orderby=mab_priority asc");

                return Promise.all([formsP, rulesP]).then(function (r) {
                    r[0].entities.forEach(function (f) {
                        cfg.forms.push({
                            name: f.mab_name,
                            formId: normGuid(f.mab_formid),
                            formType: f.mab_formtype,
                            enabled: f.mab_enabled !== false,
                            defaultFieldVis: f.mab_defaultfieldvisibility,
                            defaultTabVis: f.mab_defaulttabvisibility
                        });
                    });
                    r[1].entities.forEach(function (ru) {
                        cfg.rules.push({
                            elementType: ru.mab_elementtype,
                            elementName: (ru.mab_elementname || "").toLowerCase(),
                            setVisibility: ru.mab_setvisibility,
                            setRequirement: ru.mab_setrequirement,
                            setEditability: ru.mab_seteditability,
                            setDefault: ru.mab_setdefault,
                            defaultValue: ru.mab_defaultvalue,
                            defaultValueType: ru.mab_defaultvaluetype,
                            valueLock: ru.mab_valuelock,
                            appliesOn: ru.mab_applieson,
                            conditionMatch: ru.mab_conditionmatch,
                            priority: ru.mab_priority || 0,
                            formId: normGuid(ru["_mab_managedformid_value"]),
                            conditions: (ru.mab_formrule_formrulecondition || []).map(function (c) {
                                return {
                                    driverField: (c.mab_driverfield || "").toLowerCase(),
                                    operator: c.mab_operator,
                                    value: c.mab_value,
                                    valueType: c.mab_valuetype
                                };
                            })
                        });
                    });
                    _cache[entity] = cfg;
                    log("config loaded:", entity, cfg);
                    return cfg;
                });
            });
    }

    // ====================================================================== //
    //  FORM RESOLUTION                                                       //
    // ====================================================================== //
    function resolveForm(fc, forms) {
        if (!forms || !forms.length) { return null; }
        var item = fc.ui.formSelector ? fc.ui.formSelector.getCurrentItem() : null;
        var id = item && item.getId ? normGuid(item.getId()) : null;
        var label = item && item.getLabel ? item.getLabel() : null;
        var byId = id ? firstMatch(forms, function (f) { return f.formId && f.formId === id; }) : null;
        if (byId) { return byId; }
        return label ? firstMatch(forms, function (f) { return f.name && f.name.toLowerCase() === label.toLowerCase(); }) : null;
    }

    // Rules that apply on this form (matching managed form OR table-wide) and this form type.
    function selectRules(rules, form, formType) {
        var formId = form ? form.formId : null;
        return rules.filter(function (r) {
            if (r.formId && (!formId || r.formId !== formId)) { return false; }   // scoped to a different form
            return appliesOnFormType(r.appliesOn, formType);
        });
    }

    function appliesOnFormType(appliesOn, formType) {
        if (appliesOn === APPLY.BOTH || appliesOn === null || appliesOn === undefined) { return true; }
        if (appliesOn === APPLY.CREATE) { return formType === FORMTYPE_CREATE; }
        if (appliesOn === APPLY.UPDATE) { return formType === FORMTYPE_UPDATE; }
        return true;
    }

    // ====================================================================== //
    //  DENY-BY-DEFAULT                                                       //
    // ====================================================================== //
    function effectiveFieldHidden(cfg, form) {
        if (form && form.defaultFieldVis != null && form.defaultFieldVis !== FRM_VIS.USE_DEFAULT) {
            return form.defaultFieldVis === FRM_VIS.HIDDEN;
        }
        return cfg.table.defaultFieldVis === TBL_VIS.HIDDEN;
    }
    function effectiveTabHidden(cfg, form) {
        if (form && form.defaultTabVis != null && form.defaultTabVis !== FRM_VIS.USE_DEFAULT) {
            return form.defaultTabVis === FRM_VIS.HIDDEN;
        }
        return cfg.table.defaultTabVis === TBL_VIS.HIDDEN;
    }

    function applyDenyByDefault(fc, cfg, form) {
        if (effectiveFieldHidden(cfg, form)) {
            fc.ui.controls.forEach(function (ctrl) {
                try {
                    if (!ctrl.setVisible) { return; }
                    var attr = ctrl.getAttribute ? ctrl.getAttribute() : null;
                    // Guard rail 1: never hide a system/business-required field (would block save).
                    if (attr && attr.getRequiredLevel && attr.getRequiredLevel() === "required") { return; }
                    ctrl.setVisible(false);
                } catch (e) { /* BPF/header/special controls — skip */ }
            });
        }
        if (effectiveTabHidden(cfg, form)) {
            fc.ui.tabs.forEach(function (tab) {
                try {
                    tab.setVisible(false);
                    tab.sections.forEach(function (sec) { try { sec.setVisible(false); } catch (e) { } });
                } catch (e) { }
            });
        }
    }

    // ====================================================================== //
    //  RULE APPLICATION                                                      //
    // ====================================================================== //
    function applyRule(fc, rule) {
        if (!conditionsMet(fc, rule)) { return; }
        if (rule.elementType === ELEM.FIELD) { applyFieldRule(fc, rule); }
        else if (rule.elementType === ELEM.TAB) { setTabVisible(fc, rule.elementName, rule.setVisibility); }
        else if (rule.elementType === ELEM.SECTION) { setSectionVisible(fc, rule.elementName, rule.setVisibility); }
    }

    // Order (per §7): visibility -> default -> requirement -> editability -> value-lock
    function applyFieldRule(fc, rule) {
        var name = rule.elementName;
        var attr = fc.getAttribute(name);

        // visibility
        if (rule.setVisibility === VIS.SHOW) { eachControl(attr, function (c) { c.setVisible(true); }); }
        else if (rule.setVisibility === VIS.HIDE) {
            eachControl(attr, function (c) { c.setVisible(false); });
            if (attr) { attr.setRequiredLevel("none"); }            // guard rail 2: hide => clear required
        }

        // default value (only when empty)
        applyDefaultValue(fc, attr, rule);

        // requirement
        if (rule.setRequirement === REQ.REQUIRED && attr) { attr.setRequiredLevel("required"); }
        else if (rule.setRequirement === REQ.OPTIONAL && attr) { attr.setRequiredLevel("none"); }

        // editability
        if (rule.setEditability === EDIT.READONLY) { eachControl(attr, function (c) { c.setDisabled(true); }); }
        else if (rule.setEditability === EDIT.EDITABLE) { eachControl(attr, function (c) { c.setDisabled(false); }); }

        // value-lock (applied last; wins on disabled state)
        applyValueLock(fc, attr, rule);

        // guard rail 10: warn on disabled + required + empty (save trap)
        if (_debug && attr && attr.getRequiredLevel && attr.getRequiredLevel() === "required" && isEmpty(attr.getValue())) {
            var anyDisabled = false; eachControl(attr, function (c) { if (c.getDisabled && c.getDisabled()) { anyDisabled = true; } });
            if (anyDisabled) { warn("save-trap: field is required, read-only and empty:", name); }
        }
    }

    function applyDefaultValue(fc, attr, rule) {
        if (rule.setDefault !== DEF.APPLY_WHEN_EMPTY || !attr) { return; }
        if (!isEmpty(attr.getValue())) { return; }                  // guard rail 8: never overwrite
        var v = resolveDefault(rule.defaultValue, rule.defaultValueType);
        if (v === undefined) { return; }
        try { attr.setValue(v); attr.setSubmitMode("always"); }     // guard rail 9: persist
        catch (e) { log("default value skipped for", attr.getName(), e && e.message); }
    }

    function applyValueLock(fc, attr, rule) {
        if (!attr) { return; }
        if (rule.valueLock === LOCK.WHEN_SET) {
            var has = !isEmpty(attr.getValue());
            eachControl(attr, function (c) { c.setDisabled(has); });
        } else if (rule.valueLock === LOCK.AFTER_SAVE) {
            var isUpdate = fc.ui.getFormType() === FORMTYPE_UPDATE;
            eachControl(attr, function (c) { c.setDisabled(isUpdate); });
        } else if (rule.valueLock === LOCK.UNLOCKED) {
            eachControl(attr, function (c) { c.setDisabled(false); });
        }
    }

    function resolveDefault(raw, type) {
        switch (type) {
            case DVT.TEXT: return raw == null ? "" : String(raw);
            case DVT.NUMBER: return raw == null || raw === "" ? undefined : Number(raw);
            case DVT.BOOLEAN: return raw === true || raw === "true" || raw === "1";
            case DVT.CHOICE: return raw == null || raw === "" ? undefined : Number(raw);
            case DVT.LOOKUP: return parseLookup(raw);             // "logicalname:guid:name"
            case DVT.TODAY: return new Date();
            case DVT.CURRENTUSER:
                var g = Xrm.Utility.getGlobalContext().userSettings;
                return [{ id: normGuid(g.userId), entityType: "systemuser", name: g.userName }];
            default: return raw == null ? undefined : String(raw);
        }
    }

    // ====================================================================== //
    //  CONDITIONS                                                            //
    // ====================================================================== //
    function conditionsMet(fc, rule) {
        if (!rule.conditions || !rule.conditions.length) { return true; }
        var results = rule.conditions.map(function (c) { return evalCondition(fc, c); });
        if (rule.conditionMatch === MATCH.OR) { return results.some(Boolean); }
        return results.every(Boolean);          // default AND
    }

    function evalCondition(fc, c) {
        var attr = fc.getAttribute(c.driverField);
        var actual = attr ? attr.getValue() : null;
        return compare(actual, c.operator, c.value, c.valueType);
    }

    function compare(actual, op, rawExpected, valueType) {
        if (op === OP.EMPTY) { return isEmpty(actual); }
        if (op === OP.NEMPTY) { return !isEmpty(actual); }

        var a = coerce(actual);                 // lookup -> {id,name}; choice -> number; else as-is
        switch (op) {
            case OP.EQ: return eq(a, rawExpected, valueType);
            case OP.NEQ: return !eq(a, rawExpected, valueType);
            case OP.CONTAINS: return str(a).toLowerCase().indexOf(String(rawExpected).toLowerCase()) >= 0;
            case OP.NCONTAINS: return str(a).toLowerCase().indexOf(String(rawExpected).toLowerCase()) < 0;
            case OP.IN: return String(rawExpected).split(",").map(function (s) { return s.trim(); })
                                .some(function (e) { return eq(a, e, valueType); });
            case OP.GT: return num(a) > Number(rawExpected);
            case OP.LT: return num(a) < Number(rawExpected);
            default: return false;
        }
    }

    function eq(a, rawExpected, valueType) {
        if (a && a.__lookup) {
            var ex = String(rawExpected).toLowerCase();
            return (a.id && a.id === normGuid(ex)) || (a.name && a.name.toLowerCase() === ex);
        }
        switch (valueType) {
            case VT.NUMBER: case VT.CHOICE: return num(a) === Number(rawExpected);
            case VT.BOOLEAN: return Boolean(a) === (rawExpected === true || rawExpected === "true" || rawExpected === "1");
            default: return String(a) === String(rawExpected);
        }
    }

    // ====================================================================== //
    //  ONCHANGE WIRING                                                       //
    // ====================================================================== //
    function wireDrivers(fc, cfg, form, executionContext) {
        if (fc._mabWired) { return; }
        var formType = fc.ui.getFormType();
        var rules = selectRules(cfg.rules, form, formType);
        var seen = {};
        rules.forEach(function (r) {
            (r.conditions || []).forEach(function (c) {
                if (c.driverField && !seen[c.driverField]) {
                    var attr = fc.getAttribute(c.driverField);
                    if (attr) { attr.addOnChange(function () { applyAll(fc, cfg, form); }); seen[c.driverField] = true; }
                }
            });
        });
        fc._mabWired = true;
    }

    // ====================================================================== //
    //  HELPERS                                                               //
    // ====================================================================== //
    function eachControl(attr, fn) { if (attr && attr.controls) { attr.controls.forEach(function (c) { try { fn(c); } catch (e) { } }); } }

    function setTabVisible(fc, tabName, setVis) {
        if (setVis !== VIS.SHOW && setVis !== VIS.HIDE) { return; }
        var tab = fc.ui.tabs.get(tabName);
        if (tab) { try { tab.setVisible(setVis === VIS.SHOW); } catch (e) { log("tab not found:", tabName); } }
    }
    function setSectionVisible(fc, sectionName, setVis) {
        if (setVis !== VIS.SHOW && setVis !== VIS.HIDE) { return; }
        var sec = getSection(fc, sectionName);
        if (sec) { try { sec.setVisible(setVis === VIS.SHOW); } catch (e) { } }
        else { log("section not found:", sectionName); }
    }
    function getSection(fc, name) {
        var found = null;
        fc.ui.tabs.forEach(function (tab) { if (found) { return; } var s = tab.sections.get(name); if (s) { found = s; } });
        return found;
    }

    function coerce(v) {
        if (v == null) { return v; }
        if (Object.prototype.toString.call(v) === "[object Array]" && v.length && v[0] && v[0].id) {
            return { __lookup: true, id: normGuid(v[0].id), name: v[0].name || "" };
        }
        return v;
    }
    function isEmpty(v) {
        if (v == null || v === "") { return true; }
        if (Object.prototype.toString.call(v) === "[object Array]") { return v.length === 0; }
        return false;
    }
    function num(v) { return (v && v.__lookup) ? NaN : Number(v); }
    function str(v) { return (v && v.__lookup) ? v.name : (v == null ? "" : String(v)); }
    function normGuid(g) { return g ? String(g).replace(/[{}]/g, "").toLowerCase() : g; }
    function parseLookup(raw) {
        if (!raw) { return undefined; }
        var p = String(raw).split(":");
        if (p.length < 2) { return undefined; }
        return [{ entityType: p[0], id: normGuid(p[1]), name: p[2] || "" }];
    }
    function firstMatch(arr, pred) { for (var i = 0; i < arr.length; i++) { if (pred(arr[i])) { return arr[i]; } } return null; }

    // Public API: clear cache (e.g. after editing config without a new session)
    function clearCache() { _cache = {}; }

    return { onLoad: onLoad, clearCache: clearCache };
})();
