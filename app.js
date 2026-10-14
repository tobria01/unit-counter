'use strict';

(() => {
  const RESET_HOUR = 4; // the day runs 04:00 → 04:00
  const STORE_KEY = 'unitCounter.v1';

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
      navigator.serviceWorker.register('./sw.js')
        .catch((err) => console.warn('Service worker registration failed:', err));
    }
  }

  init();
})();
