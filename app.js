'use strict';

(() => {
  const RESET_HOUR = 4; // the day runs 04:00 → 04:00
  const STORE_KEY = 'unitCounter.v1';
  const PREP_STORE_KEY = 'unitCounter.mealprep.v1';
  const APP_VERSION = 'v5'; // shown in Settings — keep in sync with CACHE in sw.js

  const $ = (id) => document.getElementById(id);

  const els = {
    main: $('view-main'),
    settings: $('view-settings'),
    todayLabel: $('todayLabel'),
    settingsBtn: $('settingsBtn'),
    backBtn: $('backBtn'),
    budget: $('budgetCard'),
    remainingValue: $('remainingValue'),
    remainingCaption: $('remainingCaption'),
    usedLabel: $('usedLabel'),
    keypad: $('keypad'),
    logBtn: $('logBtn'),
    logAmount: $('logAmount'),
    logUnit: $('logUnit'),
    undoBtn: $('undoBtn'),
    supCard: $('supCard'),
    supName: $('supName'),
    supCount: $('supCount'),
    supAddBtn: $('supAddBtn'),
    setAllowance: $('setAllowance'),
    setSupName: $('setSupName'),
    setSupTarget: $('setSupTarget'),
    versionLabel: $('versionLabel'),
    mealprep: $('view-mealprep'),
    mpOpenBtn: $('mpOpenBtn'),
    mpBackBtn: $('mpBackBtn'),
    mpDivisor: $('mpDivisor'),
    mpProtein: $('mpProtein'),
    mpGrams: $('mpGrams'),
    mpLabel: $('mpLabel'),
    mpPreview: $('mpPreview'),
    mpAddBtn: $('mpAddBtn'),
    mpIngredientsCard: $('mpIngredientsCard'),
    mpIngredientsList: $('mpIngredientsList'),
    mpTotalUnits: $('mpTotalUnits'),
    mpResultCard: $('mpResultCard'),
    mpTotalWeight: $('mpTotalWeight'),
    mpResultValue: $('mpResultValue'),
    mpResultSub: $('mpResultSub'),
    mpPrepName: $('mpPrepName'),
    mpSaveBtn: $('mpSaveBtn'),
    mpClearBtn: $('mpClearBtn'),
    mpSavedCard: $('mpSavedCard'),
    mpSavedList: $('mpSavedList'),
    toast: $('toast'),
  };

  // ---------- state ----------

  const defaultSettings = {
    allowance: 10,      // units per day, any decimal
    supName: 'Supplement',
    supTarget: 4,       // servings per day
  };

  let settings = { ...defaultSettings };
  /** days[dayKey] = { used, sups, entries: [{k:'u'|'s', a?, ts}] } */
  let days = {};
  let activeDay = null;
  let amt = ''; // keypad buffer
  let toastTimer = null;
  let lastRenderedRemaining = null;

  /** meal prep calculator — separate storage, not tied to the daily counters */
  let prep = { divisor: 80, ingredients: [], totalWeight: null };
  let savedPreps = [];

  // ---------- storage ----------

  function load() {
    let raw = null;
    try {
      raw = localStorage.getItem(STORE_KEY);
    } catch (err) {
      return false;
    }
    if (!raw) return false;
    try {
      const data = JSON.parse(raw);
      if (!data || typeof data !== 'object') return false;
      if (data.settings) {
        if (Number.isFinite(Number(data.settings.allowance)) && Number(data.settings.allowance) >= 0) {
          settings.allowance = Number(data.settings.allowance);
        }
        if (typeof data.settings.supName === 'string') settings.supName = data.settings.supName;
        if (Number.isInteger(Number(data.settings.supTarget)) && Number(data.settings.supTarget) >= 0) {
          settings.supTarget = Number(data.settings.supTarget);
        }
      }
      if (data.days && typeof data.days === 'object') days = data.days;
      if (typeof data.dayKey === 'string') activeDay = data.dayKey;
      return true;
    } catch (err) {
      return false;
    }
  }

  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ settings, dayKey: activeDay, days }));
    } catch (err) {
      /* storage blocked (e.g. private mode) — keep working in-session */
    }
  }

  // ---------- day logic ----------

  // A day runs 04:00 → 04:00 local time, so 00:00–03:59 belongs to the
  // previous day. Day key = the local calendar date of (now − 4 hours).
  function dayKey(ts) {
    const t = ts === undefined ? Date.now() : ts;
    const d = new Date(t - RESET_HOUR * 3600 * 1000);
    const p = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  function ensureToday() {
    const key = dayKey();
    if (activeDay !== key) {
      // Keep only the current day (no history is stored).
      const carried = days[key];
      days = carried ? { [key]: carried } : {};
      activeDay = key;
      amt = '';
      save();
    }
    if (!days[key] || typeof days[key] !== 'object') {
      days[key] = { used: 0, sups: 0, entries: [] };
      save();
    }
    const t = days[key];
    if (typeof t.used !== 'number' || !Number.isFinite(t.used)) t.used = 0;
    if (!Number.isInteger(t.sups)) t.sups = 0;
    if (!Array.isArray(t.entries)) t.entries = [];
    return t;
  }

  // ---------- helpers ----------

  const round2 = (n) => Math.round(n * 100) / 100;

  const fmt = (n) => String(round2(n));

  const pretty = (n) => fmt(n).replace('-', '−');

  // ---------- units ----------

  function pressKey(k) {
    if (k === 'back') {
      amt = amt.slice(0, -1);
    } else if (k === '.') {
      if (amt.indexOf('.') !== -1) return;
      amt = amt === '' ? '0.' : amt + '.';
    } else {
      if (amt.length >= 6) return;
      if (amt === '0') amt = k;
      else amt += k;
    }
    updateLogButton();
  }

  function updateLogButton() {
    // Default: tapping Log without typing registers 1 unit.
    const n = amt === '' ? 1 : round2(parseFloat(amt));
    els.logBtn.disabled = !(Number.isFinite(n) && n > 0);
    els.logAmount.textContent = pretty(n);
    els.logAmount.classList.toggle('dim', amt === '');
    els.logUnit.textContent = n === 1 ? 'unit' : 'units';
  }

  function logUnits() {
    const n = amt === '' ? 1 : round2(parseFloat(amt));
    if (!Number.isFinite(n) || n <= 0) {
      toast('Enter an amount');
      return;
    }
    const t = ensureToday();
    t.used = round2(t.used + n);
    t.entries.push({ k: 'u', a: n, ts: Date.now() });
    amt = '';
    save();
    render();
    const left = round2(settings.allowance - t.used);
    toast(left < 0
      ? fmt(n) + ' units logged · ' + fmt(-left) + ' over budget'
      : fmt(n) + ' units logged');
  }

  // ---------- supplement ----------

  function addSupplement() {
    const t = ensureToday();
    t.sups += 1;
    t.entries.push({ k: 's', ts: Date.now() });
    save();
    render();
    toast('+1 ' + settings.supName);
  }

  // ---------- undo ----------

  function undo() {
    const t = ensureToday();
    const e = t.entries.pop();
    if (!e) return;
    if (e.k === 'u') t.used = round2(t.used - e.a);
    else t.sups = Math.max(0, t.sups - 1);
    save();
    render();
    toast('Undone');
  }

  // ---------- render ----------

  function render() {
    const t = ensureToday();

    updateLogButton();

    // Show the date of the PKU day (04:00 → 04:00), not the calendar date.
    els.todayLabel.textContent = new Date(Date.now() - RESET_HOUR * 3600 * 1000)
      .toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

    const left = round2(settings.allowance - t.used);
    const over = left < 0;
    els.budget.classList.toggle('over', over);
    els.remainingValue.textContent = pretty(Math.abs(left));
    els.remainingCaption.textContent = over ? 'units over budget' : 'units left';
    els.usedLabel.textContent = pretty(t.used) + ' of ' + pretty(settings.allowance) + ' used';

    if (lastRenderedRemaining !== left) {
      els.remainingValue.classList.remove('pop');
      void els.remainingValue.offsetWidth; // restart animation
      els.remainingValue.classList.add('pop');
      lastRenderedRemaining = left;
    }

    const last = t.entries[t.entries.length - 1];
    if (last) {
      const time = new Date(last.ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
      els.undoBtn.classList.remove('ghosted');
      els.undoBtn.textContent = last.k === 'u'
        ? 'Undo ' + fmt(last.a) + ' units (' + time + ')'
        : 'Undo ' + settings.supName + ' (' + time + ')';
    } else {
      els.undoBtn.classList.add('ghosted');
      els.undoBtn.textContent = 'Undo';
    }

    const showSup = settings.supName.trim() !== '';
    els.supCard.classList.toggle('hidden', !showSup);
    if (showSup) {
      els.supName.textContent = settings.supName;
      els.supCount.textContent = t.sups + ' of ' + settings.supTarget + ' taken';
      els.supCount.classList.toggle('over', t.sups > settings.supTarget);
    }
  }

  // ---------- toast ----------

  function toast(msg) {
    els.toast.textContent = msg;
    els.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove('show'), 1900);
  }

  // ---------- settings ----------

  function openSettings() {
    els.setAllowance.value = fmt(settings.allowance);
    els.setSupName.value = settings.supName;
    els.setSupTarget.value = String(settings.supTarget);
    els.main.classList.add('hidden');
    els.mealprep.classList.add('hidden');
    els.settings.classList.remove('hidden');
  }

  function closeSettings() {
    els.settings.classList.add('hidden');
    els.main.classList.remove('hidden');
    render();
  }

  // Commits on change/blur (never mid-typing, so intermediate values like
  // "1" while entering "10" are never persisted).
  function bindSetting(input, parse, format, get, set) {
    const commit = () => {
      const v = parse(input.value);
      if (v !== null) {
        set(v);
        save();
        render();
      }
    };
    input.addEventListener('change', commit);
    input.addEventListener('blur', () => {
      commit();
      input.value = format(get());
    });
  }

  // Accepts both "1.5" and "1,5" (locale decimal comma).
  function parseAllowance(raw) {
    if (raw === '') return null;
    const v = Number(raw.replace(',', '.'));
    if (!Number.isFinite(v) || v < 0 || v > 9999) return null;
    return round2(v);
  }

  function parseTarget(raw) {
    if (raw === '') return null;
    const v = Number(raw.replace(',', '.'));
    if (!Number.isFinite(v) || !Number.isInteger(v) || v < 0 || v > 99) return null;
    return v;
  }

  // ---------- meal prep ----------

  const round1 = (n) => Math.round(n * 10) / 10;
  const fmt1 = (n) => String(round1(n));

  function mpParseNum(raw) {
    if (raw === '' || raw === null || raw === undefined) return null;
    const v = Number(String(raw).replace(',', '.'));
    if (!Number.isFinite(v) || v < 0 || v > 1e6) return null;
    return v;
  }

  // Validate and normalize an ingredient loaded from storage: never trust
  // the stored `units` — always recompute it from the raw inputs.
  function mpValidIngredient(i) {
    if (!i || typeof i !== 'object') return false;
    const d = Number(i.divisor);
    const p = Number(i.protein);
    const g = Number(i.grams);
    return Number.isFinite(d) && d > 0 &&
           Number.isFinite(p) && p >= 0 &&
           Number.isFinite(g) && g > 0;
  }

  function mpNormalizeIngredient(i) {
    const divisor = Number(i.divisor);
    const protein = Number(i.protein);
    const grams = Number(i.grams);
    return {
      divisor,
      protein: round2(protein),
      grams: round2(grams),
      units: round2(grams * protein / divisor),
    };
  }

  // Validate a saved prep loaded from storage; derived numbers (units,
  // totals, g/unit) are recomputed, never trusted. Returns null if invalid.
  function mpValidPrep(p) {
    if (!p || typeof p !== 'object' || !Array.isArray(p.ingredients)) return null;
    const ings = p.ingredients.filter(mpValidIngredient).map(mpNormalizeIngredient);
    if (ings.length === 0) return null;
    const w = Number(p.totalWeight);
    if (!Number.isFinite(w) || w <= 0) return null;
    if (typeof p.name !== 'string' || p.name.trim() === '') return null;
    let total = 0;
    for (const ing of ings) total += ing.units;
    total = round2(total);
    if (total <= 0) return null;
    return {
      id: Number.isFinite(Number(p.id)) ? Number(p.id) : Date.now(),
      name: p.name,
      date: typeof p.date === 'string' ? p.date
        : new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
      ingredients: ings,
      totalWeight: round2(w),
      totalUnits: total,
      gPerUnit: round1(w / total),
    };
  }

  function mpTotalUnits() {
    let total = 0;
    for (const ing of prep.ingredients) total += ing.units;
    return round2(total);
  }

  function mpSave() {
    try {
      localStorage.setItem(PREP_STORE_KEY, JSON.stringify({ prep, savedPreps }));
    } catch (err) {
      /* storage blocked — keep working in-session */
    }
  }

  function mpLoad() {
    try {
      const raw = localStorage.getItem(PREP_STORE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (!data || typeof data !== 'object') return;
      if (Array.isArray(data.savedPreps)) {
        savedPreps = data.savedPreps
          .map(mpValidPrep)
          .filter(Boolean);
      }
      if (data.prep && typeof data.prep === 'object' && Array.isArray(data.prep.ingredients)) {
        prep.ingredients = data.prep.ingredients
          .filter(mpValidIngredient)
          .map(mpNormalizeIngredient);
        const w = mpParseNum(data.prep.totalWeight);
        prep.totalWeight = (w === null || w === 0) ? null : w;
        const d = Number(data.prep.divisor);
        if (d === 80 || d === 60 || d === 50) prep.divisor = d;
      }
    } catch (err) {
      /* corrupted — start fresh */
    }
  }

  function mpFormValues() {
    return {
      divisor: Number(els.mpDivisor.value),
      protein: mpParseNum(els.mpProtein.value),
      grams: mpParseNum(els.mpGrams.value),
    };
  }

  function mpUpdatePreview() {
    const { divisor, protein, grams } = mpFormValues();
    const ok = Number.isFinite(protein) && protein > 0 && protein <= 100 &&
               Number.isFinite(grams) && grams > 0;
    els.mpAddBtn.disabled = !ok;
    if (!ok) {
      els.mpPreview.textContent = '';
      els.mpPreview.classList.remove('has');
      return;
    }
    const gPerUnit = divisor / protein;
    const units = grams / gPerUnit;
    els.mpPreview.textContent =
      fmt1(gPerUnit) + ' g per unit · ≈ ' + fmt(units) + ' units';
    els.mpPreview.classList.add('has');
  }

  function mpAddIngredient() {
    const { divisor, protein, grams } = mpFormValues();
    if (!(Number.isFinite(protein) && protein > 0 && protein <= 100 &&
          Number.isFinite(grams) && grams > 0)) return;
    const units = round2(grams * protein / divisor);
    prep.ingredients.push({ divisor, protein: round2(protein), grams: round2(grams), units });
    els.mpProtein.value = '';
    els.mpGrams.value = '';
    mpSave();
    mpUpdatePreview();
    mpRender();
    toast('+' + fmt(units) + ' units');
  }

  function mpRemoveIngredient(idx) {
    prep.ingredients.splice(idx, 1);
    mpSave();
    mpRender();
  }

  // Live-updates the result while typing; persistence happens on
  // change/blur (same pattern as the settings inputs).
  function mpUpdateWeight() {
    const w = mpParseNum(els.mpTotalWeight.value);
    prep.totalWeight = (w === null || w === 0) ? null : w;
    mpRender();
  }

  function mpRender() {
    // Ingredient list
    const list = els.mpIngredientsList;
    list.textContent = '';
    prep.ingredients.forEach((ing, i) => {
      const row = document.createElement('div');
      row.className = 'mp-ing-row';
      const info = document.createElement('div');
      info.className = 'mp-ing-info';
      const main = document.createElement('div');
      main.textContent = fmt(ing.grams) + ' g · ' + fmt(ing.units) + ' units';
      const sub = document.createElement('div');
      sub.className = 'mp-ing-sub';
      sub.textContent = '÷ ' + ing.divisor + ' · ' + fmt(ing.protein) + ' g protein/100 g';
      info.appendChild(main);
      info.appendChild(sub);
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'mp-ing-del';
      del.textContent = '✕';
      del.setAttribute('aria-label', 'Remove ingredient');
      del.addEventListener('click', () => mpRemoveIngredient(i));
      row.appendChild(info);
      row.appendChild(del);
      list.appendChild(row);
    });

    const hasIngredients = prep.ingredients.length > 0;
    els.mpIngredientsCard.classList.toggle('hidden', !hasIngredients);
    const total = mpTotalUnits();
    els.mpTotalUnits.textContent = hasIngredients ? 'Total: ' + fmt(total) + ' units' : '';

    // Label result
    els.mpResultCard.classList.toggle('hidden', !hasIngredients);
    const w = prep.totalWeight;
    if (hasIngredients && Number.isFinite(w) && w > 0 && total > 0) {
      const gPerUnit = w / total;
      els.mpResultValue.textContent = fmt1(gPerUnit) + ' g per unit';
      els.mpResultSub.textContent = fmt(100 / gPerUnit) + ' units per 100 g';
      els.mpResultValue.classList.remove('dim');
      els.mpSaveBtn.disabled = false;
    } else {
      els.mpResultValue.textContent = '—';
      els.mpResultValue.classList.add('dim');
      els.mpResultSub.textContent = hasIngredients ? 'Enter total weight above' : '';
      els.mpSaveBtn.disabled = true;
    }

    // Saved preps
    const savedList = els.mpSavedList;
    savedList.textContent = '';
    els.mpSavedCard.classList.toggle('hidden', savedPreps.length === 0);
    savedPreps.forEach((p) => {
      const row = document.createElement('div');
      row.className = 'mp-saved-row';
      const info = document.createElement('div');
      info.className = 'mp-saved-info';
      const name = document.createElement('div');
      name.className = 'mp-saved-name';
      name.textContent = p.name;
      const sub = document.createElement('div');
      sub.className = 'mp-ing-sub';
      sub.textContent = fmt(p.totalUnits) + ' units · ' + fmt1(p.gPerUnit) + ' g/unit · ' + p.date;
      info.appendChild(name);
      info.appendChild(sub);
      info.addEventListener('click', () => mpLoadPrep(p.id));
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'mp-ing-del';
      del.textContent = '✕';
      del.setAttribute('aria-label', 'Delete saved prep');
      del.addEventListener('click', () => mpDeletePrep(p.id));
      row.appendChild(info);
      row.appendChild(del);
      savedList.appendChild(row);
    });
  }

  function mpSavePrep() {
    const total = mpTotalUnits();
    const w = prep.totalWeight;
    if (!(total > 0) || !(Number.isFinite(w) && w > 0)) {
      toast('Add ingredients and total weight first');
      return;
    }
    let name = els.mpPrepName.value.trim();
    if (!name) {
      name = new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
    }
    savedPreps.unshift({
      id: Date.now(),
      name,
      date: new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
      ingredients: prep.ingredients.map((i) => ({ ...i })),
      totalWeight: w,
      totalUnits: total,
      gPerUnit: round1(w / total),
    });
    mpSave();
    mpRender();
    toast('Saved "' + name + '"');
  }

  function mpDeletePrep(id) {
    savedPreps = savedPreps.filter((p) => p.id !== id);
    mpSave();
    mpRender();
    toast('Deleted');
  }

  function mpLoadPrep(id) {
    const p = savedPreps.find((x) => x.id === id);
    if (!p) return;
    prep.ingredients = p.ingredients.map((i) => ({ ...i }));
    prep.totalWeight = p.totalWeight;
    els.mpTotalWeight.value = String(p.totalWeight);
    els.mpPrepName.value = p.name;
    els.mpProtein.value = '';
    els.mpGrams.value = '';
    mpSave();
    mpUpdatePreview();
    mpRender();
    toast('Loaded "' + p.name + '"');
    window.scrollTo(0, 0);
  }

  function mpClearPrep() {
    prep.ingredients = [];
    prep.totalWeight = null;
    els.mpTotalWeight.value = '';
    els.mpPrepName.value = '';
    els.mpProtein.value = '';
    els.mpGrams.value = '';
    mpSave();
    mpUpdatePreview();
    mpRender();
    toast('Meal prep cleared');
  }

  function openMealPrep() {
    els.main.classList.add('hidden');
    els.settings.classList.add('hidden');
    els.mealprep.classList.remove('hidden');
    els.mpDivisor.value = String(prep.divisor);
    els.mpTotalWeight.value = prep.totalWeight === null ? '' : String(prep.totalWeight);
    window.scrollTo(0, 0);
    mpUpdatePreview();
    mpRender();
  }

  function closeMealPrep() {
    els.mealprep.classList.add('hidden');
    els.main.classList.remove('hidden');
    render();
  }

  // ---------- init ----------

  function init() {
    const loaded = load();

    els.keypad.addEventListener('click', (ev) => {
      const btn = ev.target.closest('[data-k]');
      if (btn) pressKey(btn.getAttribute('data-k'));
    });
    els.logBtn.addEventListener('click', logUnits);
    els.undoBtn.addEventListener('click', undo);
    els.supAddBtn.addEventListener('click', addSupplement);
    els.settingsBtn.addEventListener('click', openSettings);
    els.backBtn.addEventListener('click', closeSettings);

    els.mpOpenBtn.addEventListener('click', openMealPrep);
    els.mpBackBtn.addEventListener('click', closeMealPrep);
    els.mpAddBtn.addEventListener('click', mpAddIngredient);
    els.mpDivisor.addEventListener('change', () => {
      prep.divisor = Number(els.mpDivisor.value);
      mpSave();
      mpUpdatePreview();
    });
    els.mpProtein.addEventListener('input', mpUpdatePreview);
    els.mpGrams.addEventListener('input', mpUpdatePreview);
    els.mpTotalWeight.addEventListener('input', mpUpdateWeight);
    els.mpTotalWeight.addEventListener('change', mpSave);
    els.mpTotalWeight.addEventListener('blur', () => {
      mpSave();
      els.mpTotalWeight.value = prep.totalWeight === null ? '' : String(prep.totalWeight);
    });
    els.mpSaveBtn.addEventListener('click', mpSavePrep);
    els.mpClearBtn.addEventListener('click', mpClearPrep);
    mpLoad();

    bindSetting(els.setAllowance, parseAllowance, fmt,
      () => settings.allowance,
      (v) => { settings.allowance = v; });
    bindSetting(els.setSupName, (raw) => raw, (v) => v,
      () => settings.supName,
      (v) => { settings.supName = v; });
    bindSetting(els.setSupTarget, parseTarget, String,
      () => settings.supTarget,
      (v) => { settings.supTarget = v; });

    updateLogButton();
    render();
    els.versionLabel.textContent = 'Version ' + APP_VERSION;

    if (!loaded) {
      openSettings();
      toast('Set up your daily allowance');
    }

    // Reset counters when the 04:00 boundary passes while the app is closed
    // or in the background.
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) render();
    });
    window.addEventListener('pageshow', (ev) => {
      if (ev.persisted) render(); // bfcache restore
    });
    setInterval(() => {
      if (!document.hidden) render();
    }, 20000);

    if ('serviceWorker' in navigator &&
        (location.protocol === 'https:' || location.hostname === 'localhost')) {
      // updateViaCache: 'none' — always fetch sw.js fresh, so updates are
      // detected on every open with internet (not subject to HTTP caching).
      navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' })
        .catch((err) => console.warn('Service worker registration failed:', err));

      // If a newly installed service worker takes over while the app is
      // open, refresh once so the new version shows immediately.
      if (navigator.serviceWorker.controller) {
        let reloaded = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (!reloaded) {
            reloaded = true;
            location.reload();
          }
        });
      }
    }
  }

  init();
})();
