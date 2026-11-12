/* Kühlschrank-Modus der Rezepte-App.
   Ziel: Samsung Family Hub (Tizen 7, Chromium 108, 721×1230 CSS-px, Touch meldet sich als Maus, langsame CPU).
   Aktiv nur, wenn index.html <html class="fridge"> gesetzt hat (UA „Family Hub“ oder ?fridge).
   Hintergründe und Messwerte: FAMILY_HUB.md im Projektordner. */
(() => {
  'use strict';

  const root = document.documentElement;
  if (!root.classList.contains('fridge')) return;

  const IS_FRIDGE = /Family Hub/.test(navigator.userAgent);
  if (IS_FRIDGE) root.classList.add('fh-device'); // echtes Gerät: Abstand für die Systemleiste ohne Vollbild (--sysbar)
  // Handy (iPhone als Home-Bildschirm-App): Das Layout passt sich per Media Query in fridge.css an (< 600 px Breite).
  // Vollbild-Knopf nur, wo es die Fullscreen-API gibt und die App nicht ohnehin randlos läuft (iPhone hat keine).
  const IS_STANDALONE = navigator.standalone === true || matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches;
  if (!IS_FRIDGE && (IS_STANDALONE || !(document.fullscreenEnabled || document.webkitFullscreenEnabled))) root.classList.add('fh-nofs');
  const BUILD = window.FRIDGE_BUILD || { v: '', t: '' }; // von generate.sh in index.html gesetzt
  let lastInteraction = Date.now();
  // Einkauf (Picnic-Warenkorb, eigenes Projekt auf dem NAS). Unter der Küchen-Adresse auf dem NAS (alles außer github.io)
  // liegt der Einkauf same-origin unter /einkauf/ und wird als Tab eingebettet: eine App, das Vollbild bleibt beim Wechsel.
  // Auf GitHub Pages bleibt es beim Link ins Heimnetz (http → kein Einbetten möglich, Mixed Content).
  const EMBED_SHOP = !/github\.io$/.test(location.hostname);
  const SHOP_URL = EMBED_SHOP ? '/einkauf/' : 'http://192.168.178.100:8090/';
  // Landet der Kühlschrank auf der GitHub-Version (altes Lesezeichen), geht es zur Küchen-App auf dem NAS weiter –
  // aber nur, wenn die erreichbar ist. Sonst bleibt alles hier (NAS aus → Rezepte funktionieren trotzdem).
  const KUECHE_URL = 'https://kueche-maue.duckdns.org:8443/';
  if (IS_FRIDGE && !EMBED_SHOP) {
    fetch(KUECHE_URL + 'tokens.css', { mode: 'no-cors', cache: 'no-store' })
      .then(() => location.replace(KUECHE_URL + location.hash), () => { /* nicht erreichbar → hier bleiben */ });
  }
  const SESSION_MAX_AGE = 12 * 3600 * 1000;

  // ---------- Speicher ----------
  const store = {
    get(key, fallback) {
      try { const v = localStorage.getItem('fridge.' + key); return v === null ? fallback : JSON.parse(v); } catch { return fallback; }
    },
    set(key, value) { try { localStorage.setItem('fridge.' + key, JSON.stringify(value)); } catch { /* Speicher voll/gesperrt */ } },
    del(key) { try { localStorage.removeItem('fridge.' + key); } catch { /* egal */ } },
  };
  const settings = Object.assign({ autoRead: false, voice: false, keepAwake: true }, store.get('settings', {}));
  const saveSettings = () => store.set('settings', settings);
  if (!settings.v || settings.v < 3) { // v3: Video-Wachtest am Kühlschrank erfolgreich (2026-11-08) → Wachhalten standardmäßig an
    settings.keepAwake = true;
    delete settings.autoFs;
    settings.v = 3;
    saveSettings();
  }
  // Automatisches Vollbild beim Antippen. Der Vollbild-Knopf schaltet es nur bis zum nächsten Laden ab.
  let autoFs = true;

  // ---------- Helfer ----------
  const $ = (sel, scope = document) => scope.querySelector(sel);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

  const ICONS = {
    back: '<path d="M15 5l-7 7 7 7"/>',
    chevR: '<path d="M9 5l7 7-7 7"/>',
    fullscreen: '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    timer: '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 10v3.5l2.5 1.5M9.5 2.5h5M19 5.5l1.5 1.5"/>',
    users: '<circle cx="9" cy="8.5" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-3.5-5.8"/>',
    pen: '<path d="M4 20h4L18.5 9.5l-4-4L4 16v4zM13 7l4 4"/>',
    play: '<path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    list: '<path d="M9 6.5h11M9 12h11M9 17.5h11"/><circle cx="4.5" cy="6.5" r="1.2" fill="currentColor"/><circle cx="4.5" cy="12" r="1.2" fill="currentColor"/><circle cx="4.5" cy="17.5" r="1.2" fill="currentColor"/>',
    speaker: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4.5 4.5 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11"/>',
    mic: '<rect x="9" y="3" width="6" height="11.5" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3"/>',
    // Rezepte- und Einkauf-Icon identisch zum Einkaufs-Dienst
    cart: '<path d="M3 9h18l-1.8 9.2A2 2 0 0 1 17.2 20H6.8a2 2 0 0 1-2-1.8L3 9Z"/><path d="m8 9 3-5M16 9l-3-5"/>',
    book: '<path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5v-15Z"/><path d="M5 19.5A1.5 1.5 0 0 0 6.5 21H19M9 7.5h6"/>',
    cal: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L20.5 20.5"/>',
    refresh: '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 4.5v4.5H15"/>',
    move: '<path d="M4 8h13M13.5 4.5 17 8l-3.5 3.5M20 16H7M10.5 12.5 7 16l3.5 3.5"/>',
    trash: '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v5.5M14 11v5.5"/>',
  };
  const icon = (name) => `<svg class="fh-ic" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;
  const pill = (name, text) => (text ? `<span class="fh-pill">${icon(name)}${esc(text)}</span>` : '');

  // Zeitangaben aus dem Frontmatter: „45 Minuten“, „25min“, „20–30 Min.“, „1,5 h“, „1 Std.“, optional mit Zusatz in
  // Klammern, etwa „45 Minuten (plus mind. 1 Std. Marinieren)“
  const DUR = '(\\d+(?:[.,]\\d+)?)(?:\\s*[–-]\\s*(\\d+(?:[.,]\\d+)?))?\\s*(min(?:\\.|uten?)?|h|std\\.?|stunden?)';
  const DUR_ONLY = new RegExp(`^${DUR}$`, 'i');
  const DUR_ANY = new RegExp(`${DUR}(?![a-zäöüß])`, 'i');
  const parseDur = (m) => m && { n: m[2] ? `${m[1]}–${m[2]}` : m[1], hours: /^[hs]/i.test(m[3]) };
  function splitTime(t) {
    const m = /^(.*?)\s*(?:\((.*)\))?$/.exec(String(t || '').trim());
    return { main: parseDur(DUR_ONLY.exec(m[1])), raw: m[1], extra: (m[2] || '').trim() };
  }
  // Rezeptansicht: „45 Min. + mind. 1 Std. Marinieren“
  function fmtTime(t) {
    const { main, raw, extra } = splitTime(t);
    const base = main ? `${main.n} ${main.hours ? 'Std.' : 'Min.'}` : raw;
    return extra ? `${base} + ${extra.replace(/^plus\s+/i, '')}` : base;
  }
  // Kachel-Badge: nur Zahlen, eine Zusatzzeit (z. B. Marinieren) knapp mit „+“, also „45′ + 1 h“
  function shortTime(t) {
    const { main, raw, extra } = splitTime(t);
    const fmt = (d) => d.n + (d.hours ? ' h' : '′');
    const add = parseDur(DUR_ANY.exec(extra));
    return (main ? fmt(main) : raw) + (add ? ` + ${fmt(add)}` : '');
  }
  const fmtYield = (y) => (/^\d+$/.test(String(y || '').trim()) ? `${y} Portionen` : y || '');
  const shopUrl = (term) => SHOP_URL + (term ? '?suche=' + encodeURIComponent(term) : '');
  // Ziel für Links/Knöpfe: eingebettet über die Hash-Route #/einkauf[/suche/<wort>], sonst direkt zum NAS
  const shopLink = (term) => (EMBED_SHOP ? '#/einkauf' + (term ? '/suche/' + encodeURIComponent(term) : '') : shopUrl(term));

  // „400 g Kartoffeln“ → „Kartoffeln“, „1 Zoll frischer Ingwer“ → „Ingwer“
  const UNITS = 'g|kg|mg|ml|cl|dl|l|liter|el|tl|esslöffel|teelöffel|msp|prisen?|packung(?:en)?|pck|dosen?|zehen?|bund|stück|stk|scheiben?|zoll|cm|handvoll|becher|gläser|glas|tassen?|blatt|blätter|zweige?|knollen?|würfel|beutel|blöcke|block|köpfe|kopf';
  const UNIT_RE = new RegExp(`^(?:${UNITS})\\.?(?![a-zäöüß])\\s*`, 'i');
  function shopTerm(ingredient) {
    let s = ingredient.replace(/\(.*?\)/g, ' ').replace(/[‘’'"„“‚][^‘’'"„“‚]*[‘’'"„“‚]/g, ' ');
    s = s.replace(/^[\s\d.,/½¼¾⅓⅔–-]+/, '').replace(UNIT_RE, '');
    s = s.replace(/^(?:etwas|ca\.|circa|einige|frische[rns]?|kleine[rns]?|große[rns]?)\s+/i, '');
    s = s.split(',')[0].replace(/\s+/g, ' ').trim();
    return s.slice(0, 40) || ingredient.slice(0, 40);
  }

  // ---------- Zeitangaben im Schritt → Timer ----------
  const NUM_WORDS = { ein: 1, eine: 1, einer: 1, einen: 1, zwei: 2, drei: 3, vier: 4, 'fünf': 5, sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10 };
  const NUM = '(\\d+(?:[.,]\\d+)?|eine[nr]?|ein|zwei|drei|vier|fünf|sechs|sieben|acht|neun|zehn)';
  const TIME_RE = new RegExp(
    `(?<![\\wäöüß])(?:ca\\.\\s*)?${NUM}(?:\\s*(?:-|–|bis)\\s*${NUM})?\\s*(Stunden?|Std\\.?|h|Minuten?|Min\\.?|Sekunden?|Sek\\.?)(?![a-zäöüß])`, 'gi');
  const toNum = (s) => NUM_WORDS[s.toLowerCase()] || parseFloat(s.replace(',', '.'));
  const unitSeconds = (u) => (/^(stu|std|h)/i.test(u) ? 3600 : /^m/i.test(u) ? 60 : 1);

  function stepHtml(text, stepNo) {
    let out = '', last = 0;
    for (const m of text.matchAll(TIME_RE)) {
      const sec = Math.round(toNum(m[1]) * unitSeconds(m[3])); // bei Spannen („8–10 Min.“) die untere Grenze
      if (!sec) continue;
      out += esc(text.slice(last, m.index)) +
        `<button class="fh-timechip" data-act="timer" data-sec="${sec}" data-step="${stepNo}" data-label="${esc(m[0])}">${icon('timer')}${esc(m[0])}</button>`;
      last = m.index + m[0].length;
    }
    return out + esc(text.slice(last));
  }

  // ---------- Gerüst ----------
  document.body.insertAdjacentHTML('afterbegin', `
    <video class="fh-awake-bg" id="fh-awake" loop playsinline preload="none" disablepictureinpicture aria-hidden="true" tabindex="-1"></video>
    <div id="fh-app">
      <div class="fh-sticky">
        <header class="fh-top">
          <div class="fh-brand">Rezepte<span class="fh-dot">.</span></div>
          <div class="fh-clock" id="fh-clock"></div>
          <label class="fh-search">${icon('search')}<input id="fh-q" type="search" placeholder="Zutat, z. B. Lachs"
            autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="search"><span class="fh-q-count" id="fh-q-count"></span></label>
          <button class="fh-round" data-act="search" id="fh-search-btn" aria-label="Zutaten suchen" aria-expanded="false">${icon('search')}</button>
          <button class="fh-round" data-act="fs" aria-label="Vollbild">${icon('fullscreen')}</button>
        </header>
        <nav class="fh-chips" id="fh-chips"></nav>
      </div>
      <div id="fh-resume"></div>
      <main id="fh-home"><p class="fh-msg">Rezepte werden geladen …</p></main>
      <nav class="fh-dock" aria-label="Bereiche"><div class="fh-dock-inner">
        <a class="fh-tab is-active" id="fh-tab-rezepte" href="#/" data-act="top">${icon('book')}Rezepte</a>
        <a class="fh-tab" id="fh-tab-planen" href="#/planen" data-act="pv-top"${EMBED_SHOP ? '' : ' hidden'}>${icon('cal')}Planen</a>
        <a class="fh-tab" id="fh-tab-einkauf" href="${shopLink('')}">${icon('cart')}Einkauf<span class="fh-badge" id="fh-shop-badge" hidden></span></a>
      </div></nav>
    </div>
    <section class="fh-pv" id="fh-pv" hidden>
      <div class="fh-sticky">
        <header class="fh-top">
          <div class="fh-brand">Planen<span class="fh-dot">.</span></div>
          <div class="fh-clock"></div>
          <button class="fh-round" data-act="fs" aria-label="Vollbild">${icon('fullscreen')}</button>
        </header>
      </div>
      <div class="fh-pv-body" id="fh-pv-body"></div>
      <div class="fh-pv-bar" id="fh-pv-bar" hidden></div>
    </section>
    <section class="fh-layer" id="fh-recipe" hidden></section>
    <section class="fh-layer fh-cook" id="fh-cook" hidden></section>
    <section class="fh-shop" id="fh-shop" hidden></section>
    <div class="fh-timers" id="fh-timers" hidden></div>
    <div class="fh-alarm" id="fh-alarm" hidden></div>
    <div class="fh-toast" id="fh-toast" hidden></div>`);

  const el = {
    home: $('#fh-home'), chips: $('#fh-chips'), resume: $('#fh-resume'), recipe: $('#fh-recipe'), cook: $('#fh-cook'), shop: $('#fh-shop'),
    timers: $('#fh-timers'), alarm: $('#fh-alarm'), toast: $('#fh-toast'), clocks: document.querySelectorAll('.fh-clock'),
    top: $('.fh-top'), q: $('#fh-q'), qCount: $('#fh-q-count'), searchBtn: $('#fh-search-btn'),
    pv: $('#fh-pv'), pvBody: $('#fh-pv-body'), pvBar: $('#fh-pv-bar'),
  };

  let toastTimer = 0;
  function toast(msg, ms = 2400) {
    el.toast.textContent = msg;
    el.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.toast.hidden = true; }, ms);
  }

  // ---------- Daten ----------
  let recipes = [];
  let byId = new Map();
  let byCookidoo = new Map(); // Cookidoo-ID (Frontmatter cookidoo:) → Rezept, für den Planen-Tab

  function load() {
    fetch('recipes.json', { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))))
      .then((data) => {
        recipes = data.recipes || [];
        byId = new Map(recipes.map((r) => [r.id, r]));
        byCookidoo = new Map(recipes.filter((r) => r.cookidoo).map((r) => [r.cookidoo, r]));
        renderHome();
        route();
        applyCooked();   // zuletzt Gekochte sofort aus dem Zwischenstand ausblenden
        loadKochbuch();  // frischen Stand vom NAS nachladen
        // Korb-Anzahl fürs Badge direkt von der Einkauf-API. Den Einkauf selbst NICHT mehr vorladen: Er blieb sonst dauerhaft
        // als zweite App im Speicher, und der Kühlschrank beendete den Tab im Standby („Renderer process has crashed“).
        refreshBadge();
      })
      .catch((err) => {
        el.home.innerHTML = `<div class="fh-msg">Rezepte konnten nicht geladen werden (${esc(err.message)}).<br>
          <button class="fh-btn fh-primary" data-act="reload">Neu laden</button></div>`;
      });
  }

  function session() {
    const s = store.get('session', null);
    return s && Date.now() - s.ts < SESSION_MAX_AGE && byId.has(s.id) ? s : null;
  }

  // ---------- Startseite ----------
  // Übersicht: alle Rezepte als gleich große Kacheln (5 pro Reihe), damit fast alle auf einen Bildschirm passen.
  // Die Kategorie-Knöpfe filtern („Alle“ ist Standard).
  // Eigene Bereiche (Backen, Kids) erscheinen nur über ihren Knopf, nicht unter „Alle“, und stehen hinten.
  const SEPARATE_CATS = ['Backen', 'Kids'];
  const isSeparate = (c) => SEPARATE_CATS.includes(c);
  let homeCats = [];
  function renderHome() {
    const cats = [];
    for (const r of recipes) if (!cats.includes(r.category)) cats.push(r.category);
    cats.sort((a, b) => isSeparate(a) - isSeparate(b)); // stabil: sonst bleibt die Reihenfolge aus recipes.json
    homeCats = cats;
    searchIndex = null;
    const inAll = recipes.filter((r) => !isSeparate(r.category)).length;
    el.chips.innerHTML = `<button class="fh-chip is-active" data-act="cat" data-cat="-1">Alle<span>${inAll}</span></button>` +
      cats.map((c, i) => `<button class="fh-chip" data-act="cat" data-cat="${i}">${esc(c)}</button>`).join('');
    el.home.dataset.cat = '-1';
    el.home.removeAttribute('data-show-recent');
    el.home.innerHTML = `<div class="fh-grid">${recipes.map((r) => card(r, cats.indexOf(r.category))).join('')}</div>
      <button class="fh-recent-toggle" id="fh-recent-toggle" data-act="toggle-recent" hidden></button>
      <div class="fh-msg" id="fh-nohit" hidden></div>
      <button class="fh-version" data-act="reload">Stand ${esc(BUILD.t || '?')} · ${esc(BUILD.v)} · antippen zum Neuladen</button>`;
    // Filtern per CSS: eine Regel je Kategorie, umgeschaltet wird nur data-cat am Container (eine Änderung statt 31).
    // Unter „Alle“ (-1) blendet für jeden eigenen Bereich eine weitere Regel dessen Kacheln aus – außer bei einer Suche
    // (data-q): Die soll auch Backen und Kids finden.
    const css = cats.map((c, i) => `#fh-home[data-cat="${i}"] .fh-card:not([data-cat="${i}"]){display:none}` +
      (isSeparate(c) ? `#fh-home[data-cat="-1"]:not([data-q]) .fh-card[data-cat="${i}"]{display:none}` : '')).join('') +
      // Zuletzt gekochte Rezepte (14 Tage) standardmäßig ausblenden – außer bei einer Suche oder wenn der Schalter sie zeigt.
      `#fh-home:not([data-q]):not([data-show-recent]) .fh-card.is-recent{display:none}`;
    let style = document.getElementById('fh-catcss');
    if (!style) { style = document.createElement('style'); style.id = 'fh-catcss'; document.head.appendChild(style); }
    style.textContent = css;
  }

  function filterCategory(i) {
    if (el.home.dataset.cat === String(i)) return;
    el.home.dataset.cat = String(i);
    const prev = el.chips.querySelector('.is-active');
    if (prev) prev.classList.remove('is-active');
    const next = el.chips.querySelector(`[data-cat="${i}"]`);
    if (next) next.classList.add('is-active');
    const scroller = document.getElementById('fh-app'); // die Übersicht scrollt in #fh-app, nicht im Dokument
    if (scroller.scrollTop > 0) scroller.scrollTop = 0;
    searchInfo();
  }

  // ---------- Kochbuch (zuletzt gekocht / Probe gekocht) ----------
  // Eigenes Logbuch auf dem NAS (Picnic-Dienst, data/kochbuch.json), nur unter der Küchen-Adresse same-origin erreichbar
  // als /einkauf/api/kochbuch:
  //   GET  → { eintraege: { "<rezeptId>": { zuletzt: "JJJJ-MM-TT", anzahl: N } } }
  //   POST { recipeId, date: "JJJJ-MM-TT", action: "add" | "remove" } → frisches { eintraege }
  // Wofür: Rezepte der letzten 14 Tage auf der Startseite ausblenden (die Suche zeigt sie weiter), „Probe gekocht“
  // anzeigen und „Heute gekocht“ merken. Auf GitHub Pages (kein Backend) ist das Kochbuch aus.
  const KOCH_API = '/einkauf/api/kochbuch';
  const RECENT_DAYS = 14;
  let cooked = store.get('kochbuch', {}) || {}; // Zwischenstand für sofortige Anzeige nach dem Aufwachen
  const dayIso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  function todayIso() { const d = new Date(); d.setHours(12, 0, 0, 0); return dayIso(d); }
  function daysSince(iso) {
    if (!iso) return Infinity;
    const [y, m, d] = iso.split('-').map(Number);
    const then = new Date(y, m - 1, d, 12, 0, 0, 0), now = new Date(); now.setHours(12, 0, 0, 0);
    return Math.round((now - then) / 86400000);
  }
  const cookCount = (id) => { const e = cooked[id]; return e && e.anzahl > 0 ? e.anzahl : 0; };
  const isRecent = (id) => { const e = cooked[id]; return !!(e && daysSince(e.zuletzt) < RECENT_DAYS); };
  function fmtDateRel(iso) {
    const n = daysSince(iso);
    if (n <= 0) return 'heute';
    if (n === 1) return 'gestern';
    if (n < 7) return `vor ${n} Tagen`;
    const [y, m, d] = iso.split('-');
    return `${+d}.${+m}.${y}`;
  }

  function loadKochbuch() {
    if (!EMBED_SHOP) return;
    fetch(KOCH_API, { credentials: 'same-origin', cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d && d.eintraege) { cooked = d.eintraege; store.set('kochbuch', cooked); applyCooked(); } }, () => {});
  }

  // Kacheln der letzten 14 Tage als is-recent markieren (CSS blendet sie außerhalb der Suche aus) und den Zeige-Schalter nachführen.
  function applyCooked() {
    if (!el.home) return;
    let hidden = 0;
    for (const c of el.home.querySelectorAll('.fh-card')) {
      const recent = isRecent(c.dataset.id);
      c.classList.toggle('is-recent', recent);
      if (recent) hidden++;
    }
    updateRecentToggle(hidden);
    if (view === 'recipe') updateCookedBlock(byId.get(currentId()));
  }

  function updateRecentToggle(count) {
    const t = $('#fh-recent-toggle');
    if (!t) return;
    const showing = el.home.hasAttribute('data-show-recent');
    if (el.home.dataset.q || (!count && !showing)) { t.hidden = true; return; }
    t.hidden = false;
    t.innerHTML = showing
      ? `${icon('check')}Zuletzt Gekochte werden gezeigt – wieder ausblenden`
      : `${icon('refresh')}${count} zuletzt gekocht – ausgeblendet, trotzdem zeigen`;
  }

  // Als heute gekocht merken bzw. zurücknehmen. Der NAS liefert den frischen Stand zurück, danach wird alles neu gezeichnet.
  function markCooked(id, on, btn) {
    if (!EMBED_SHOP || !id) return;
    if (btn) btn.disabled = true;
    fetch(KOCH_API, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ recipeId: id, date: todayIso(), action: on ? 'add' : 'remove' }) })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))))
      .then((d) => { cooked = (d && d.eintraege) || cooked; store.set('kochbuch', cooked); applyCooked(); if (btn) toast(on ? 'Als heute gekocht gemerkt' : 'Eintrag entfernt'); })
      .catch(() => { if (btn) { btn.disabled = false; toast('Kochbuch nicht erreichbar', 3000); } });
  }

  // Statuszeile + Knopf im Rezeptkopf (nur mit Backend)
  function cookedInner(rec) {
    if (!rec) return '';
    const n = cookCount(rec.id), e = cooked[rec.id], today = n && e.zuletzt === todayIso();
    const status = n
      ? `<span class="fh-tag fh-tag-ok">${icon('check')}Probe gekocht</span><span class="fh-cooked-when">zuletzt ${esc(fmtDateRel(e.zuletzt))}${n > 1 ? ` · ${n}×` : ''}</span>`
      : `<span class="fh-tag fh-tag-todo">${icon('book')}Noch nicht probegekocht</span>`;
    const btn = today
      ? `<button class="fh-btn fh-cooked-btn is-done" data-act="cooked-off">${icon('check')}Heute gekocht – rückgängig</button>`
      : `<button class="fh-btn fh-cooked-btn" data-act="cooked-on">${icon('check')}Heute gekocht</button>`;
    return `<div class="fh-cooked-row">${status}</div>${btn}`;
  }
  const cookedBlock = (rec) => (EMBED_SHOP ? `<div class="fh-cooked" id="fh-cooked">${cookedInner(rec)}</div>` : '');
  function updateCookedBlock(rec) { const b = $('#fh-cooked'); if (b) b.innerHTML = cookedInner(rec); }

  // ---------- Zutatensuche ----------
  // Selten gebraucht, deshalb eingeklappt: Die Lupe im Kopf klappt das Suchfeld anstelle von Titel und Uhr aus, es kostet
  // also nie eigenen Platz. Gesucht wird in Zutaten und Titel, ohne Groß-/Kleinschreibung und Umlautpunkte („hahnchen“
  // findet Hähnchen). Mehrere Wörter müssen alle vorkommen. Wörter unter 3 Zeichen zählen nur am Wortanfang, sonst fände
  // „Ei“ fast alles (Zwiebel, Reis, weiß …). Die Suche wirkt zusätzlich zur Kategorie, unter „Alle“ auch für Backen und
  // Kids. Gefiltert wird wie bei den Kategorien per CSS: #fh-home[data-q] plus Klasse is-hit an den Treffern.
  // Zustand bleibt beim Öffnen eines Rezepts erhalten, ein Neuladen setzt ihn zurück (wie die Kategorie).
  const fold = (s) => String(s).toLowerCase().replace(/ß/g, 'ss').normalize('NFD').replace(/[̀-ͯ]/g, '');
  let searchIndex = null; // gefalteter Text je Rezept in Kachel-Reihenfolge, erst bei der ersten Suche gebaut
  let searchTimer = 0;
  const searchOpen = () => el.top.classList.contains('is-search');

  function toggleSearch(open) {
    el.top.classList.toggle('is-search', open);
    el.searchBtn.setAttribute('aria-expanded', String(open));
    el.searchBtn.setAttribute('aria-label', open ? 'Suche schließen' : 'Zutaten suchen');
    el.searchBtn.innerHTML = icon(open ? 'x' : 'search');
    if (open) { el.q.focus(); return; }
    el.q.value = '';
    el.q.blur();
    runSearch();
  }

  function runSearch() {
    clearTimeout(searchTimer);
    const terms = fold(el.q.value).split(/[\s,;+]+/).filter(Boolean);
    if (!terms.length) { el.home.removeAttribute('data-q'); searchInfo(); return; }
    if (!searchIndex) {
      // Zwischenüberschriften („Für die Soße:“) und Artikel („in einem Stück“) gehören nicht dazu
      searchIndex = recipes.map((r) => fold([r.name, r.title, ...(r.ingredients || []).filter((x) => !/:\s*$/.test(x))].join('\n'))
        .replace(/\bein(?:e[mnrs]?)?\b/g, ' '));
    }
    const tests = terms.map((t) => {
      if (t.length >= 3) return (s) => s.includes(t);
      const re = new RegExp('(?:^|[^a-z0-9])' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      return (s) => re.test(s);
    });
    el.home.querySelectorAll('.fh-card').forEach((c, i) => c.classList.toggle('is-hit', tests.every((f) => f(searchIndex[i]))));
    el.home.dataset.q = '1';
    searchInfo();
    const scroller = document.getElementById('fh-app');
    if (scroller.scrollTop > 0) scroller.scrollTop = 0;
  }

  // Trefferzahl im Suchfeld. Passt nichts, ein Hinweis – mit Knopf, falls es nur in anderen Kategorien Treffer gibt.
  function searchInfo() {
    const nohit = $('#fh-nohit');
    if (!nohit) return;
    if (!el.home.dataset.q) { el.qCount.textContent = ''; nohit.hidden = true; return; }
    const cat = el.home.dataset.cat;
    let all = 0, shown = 0;
    for (const c of el.home.querySelectorAll('.fh-card.is-hit')) { all++; if (cat === '-1' || c.dataset.cat === cat) shown++; }
    el.qCount.textContent = !shown ? '' : shown === 1 ? '1 Rezept' : `${shown} Rezepte`;
    nohit.hidden = shown > 0;
    if (shown) return;
    nohit.innerHTML = all
      ? `Kein Treffer in „${esc(homeCats[+cat])}“.<br><button class="fh-btn fh-primary" data-act="cat" data-cat="-1">${all} Treffer in allen Kategorien</button>`
      : `Kein Rezept mit „${esc(el.q.value.trim())}“.`;
  }

  el.q.addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(runSearch, 200); });
  el.q.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    runSearch();
    el.q.blur(); // Bildschirmtastatur zu, damit die Treffer frei liegen
  });

  // Kacheln: kleine quadratische Bilder (300 px, tiles/), sofort laden – alle 31 sind ohnehin auf dem ersten Bildschirm
  const card = (r, cat) => `
    <a class="fh-card" href="#/r/${r.id}" data-cat="${cat}" data-id="${r.id}">
      ${r.tile || r.thumb ? `<img src="${esc(r.tile || r.thumb)}" alt="" width="300" height="300" decoding="async">` : ''}
      ${r.prepTime ? `<span class="fh-card-time">${esc(shortTime(r.prepTime))}</span>` : ''}
      <span class="fh-card-title"><span>${esc(r.name)}</span></span>
    </a>`;

  function renderResume() {
    const s = session();
    const r = s && byId.get(s.id);
    el.resume.innerHTML = r ? `<button class="fh-resume" data-act="resume">${icon('play')}
      <span><b>Weiterkochen:</b> ${esc(r.name)} · Schritt ${s.step} von ${r.steps.length}</span>${icon('chevR')}</button>` : '';
  }

  // ---------- Navigation (Hash-Routen: #/  #/r/<id>  #/r/<id>/k/<schritt>) ----------
  let currentHash = null;
  let view = 'home';
  let recipeScroll = { id: null, top: 0 };

  function parseHash() {
    const h = location.hash.replace(/^#/, '');
    let m;
    if ((m = /^\/r\/([a-z0-9-]+)\/k\/(\d+)$/.exec(h))) return { view: 'cook', id: m[1], step: +m[2] };
    if ((m = /^\/r\/([a-z0-9-]+)$/.exec(h))) return { view: 'recipe', id: m[1] };
    if ((m = /^\/einkauf(?:\/suche\/(.+))?$/.exec(h))) return { view: 'shop', term: m[1] ? decodeURIComponent(m[1]) : '' };
    if (h === '/planen') return { view: 'plan' };
    return { view: 'home' };
  }

  // Einkauf als Tab: Das iframe entsteht beim ersten Öffnen und wird wieder entladen, wenn der Tab 5 Minuten nicht benutzt
  // wurde oder der Kühlschrank in den Standby geht (Speicher, siehe refreshBadge). Absprache mit dem Einkaufs-Dienst per postMessage
  // (gleiche Herkunft, immer origin prüfen):
  //   App → Einkauf:  {typ:'einkauf:suche', q}  sucht ohne Neuladen · {typ:'einkauf:zeigen'}  bei jedem Tab-Wechsel (Korb auffrischen)
  //   Einkauf → App:  {typ:'einkauf:bereit'}  einmal nach dem Laden · {typ:'einkauf:anzahl', anzahl}  für das Badge im Dock
  // Bis „bereit“ kommt, gilt als Rückfall src='/einkauf/?suche=…'.
  let shopFrame = null;
  let shopReady = false;
  function ensureShopFrame(term) {
    if (shopFrame || !EMBED_SHOP) return;
    el.shop.innerHTML = `<iframe class="fh-shop-frame" title="Einkauf" allow="microphone; autoplay" src="${esc(shopUrl(term))}"></iframe>`;
    shopFrame = el.shop.firstElementChild;
    // Berührungen im Einkauf (gleiche Herkunft) zählen auch für die 2-Minuten-Regel des Wachhaltens
    shopFrame.addEventListener('load', () => {
      try {
        const w = shopFrame.contentWindow;
        for (const ev of ['pointerdown', 'touchstart', 'keydown', 'scroll']) w.addEventListener(ev, markActive, { capture: true, passive: true });
        // Auch eine Berührung im Einkauf schaltet ins Vollbild (die Geste gilt für die einbettende Seite mit)
        for (const ev of ['pointerdown', 'mousedown', 'touchend', 'keydown']) w.addEventListener(ev, () => tryFullscreen(null), true);
      } catch { /* andere Herkunft – dann eben nicht */ }
    });
  }
  const toShop = (msg) => { if (shopFrame && shopFrame.contentWindow) shopFrame.contentWindow.postMessage(msg, location.origin); };
  function showShop(term) {
    if (!shopFrame) ensureShopFrame(term);
    else if (shopReady) { if (term) toShop({ typ: 'einkauf:suche', q: term }); toShop({ typ: 'einkauf:zeigen' }); }
    else if (term) { shopFrame.src = shopUrl(term); }
    el.shop.hidden = false;
  }
  window.addEventListener('message', (e) => {
    if (e.origin !== location.origin || !shopFrame || e.source !== shopFrame.contentWindow || !e.data) return;
    if (e.data.typ === 'einkauf:bereit') shopReady = true;
    else if (e.data.typ === 'einkauf:anzahl') setBadge(e.data.anzahl);
  });
  function setBadge(anzahl) {
    const n = Math.max(0, parseInt(anzahl, 10) || 0);
    const badge = $('#fh-shop-badge');
    badge.textContent = n > 99 ? '99+' : String(n);
    badge.hidden = !n;
  }
  // Badge ohne geladenes iframe: GET /einkauf/api/warenkorb → totalCount (beim Start, alle 5 min sichtbar, nach dem Aufwachen)
  function refreshBadge() {
    if (!EMBED_SHOP) return;
    fetch('/einkauf/api/warenkorb', { credentials: 'same-origin', cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((k) => { if (k && typeof k.totalCount === 'number') setBadge(k.totalCount); }, () => {});
  }
  if (EMBED_SHOP) setInterval(() => { if (!document.hidden) refreshBadge(); }, 5 * 60 * 1000);
  let shopLeftAt = 0;
  function unloadShop() {
    if (!shopFrame) return;
    el.shop.innerHTML = ''; // iframe samt seinem Speicher freigeben
    shopFrame = null;
    shopReady = false;
  }

  function route() {
    if (!recipes.length) return;
    const prev = currentHash;
    currentHash = location.hash || '#/';
    // Merken, woher wir kamen, damit „Zurück“ einen History-Eintrag zurückgeht statt neue anzulegen
    if (prev !== null && prev !== currentHash && !(history.state && history.state.from)) history.replaceState({ from: prev }, '');

    const r = parseHash();
    const rec = r.id ? byId.get(r.id) : null;
    if ((r.view === 'recipe' || r.view === 'cook') && !rec) { location.replace('#/'); return; }
    if (r.view === 'shop' && !EMBED_SHOP) { location.href = shopUrl(r.term); return; }
    if (r.view === 'plan' && !EMBED_SHOP) { location.replace('#/'); return; } // ohne Cookidoo-Brücke (GitHub Pages) kein Plan

    if (view === 'recipe' && r.view !== 'recipe') {
      const sc = $('#fh-rscroll');
      if (sc) recipeScroll = { id: parseHashId(prev), top: sc.scrollTop };
    }
    if (r.view !== 'home' && document.activeElement === el.q) el.q.blur(); // Bildschirmtastatur nicht mitnehmen
    if (r.view === 'cook') {
      el.recipe.hidden = true;
      el.shop.hidden = true;
      el.pv.hidden = true;
      showCook(rec, r.step);
    } else {
      if (view === 'cook') leaveCook();
      el.cook.hidden = true;
      el.recipe.hidden = r.view !== 'recipe';
      el.shop.hidden = r.view !== 'shop';
      el.pv.hidden = r.view !== 'plan';
      if (r.view === 'recipe') showRecipe(rec);
      else if (r.view === 'shop') showShop(r.term);
      else if (r.view === 'plan') showPlanView();
      else { recipeScroll = { id: null, top: 0 }; renderResume(); }
    }
    if (view === 'shop' && r.view !== 'shop') shopLeftAt = Date.now();
    if (view === 'plan' && r.view !== 'plan') { cancelMove(); clearDone(); renderPvBar(); } // Umplanen endet mit dem Tabwechsel
    view = r.view;
    root.setAttribute('data-fh-view', view);
    $('#fh-tab-rezepte').classList.toggle('is-active', view !== 'shop' && view !== 'plan');
    $('#fh-tab-planen').classList.toggle('is-active', view === 'plan');
    $('#fh-tab-einkauf').classList.toggle('is-active', view === 'shop');
    renderTimers(true);
    syncAwake();
  }
  const parseHashId = (hash) => { const m = /^#\/r\/([a-z0-9-]+)/.exec(hash || ''); return m ? m[1] : null; };

  function goBack(parentHash) {
    if (history.state && history.state.from === parentHash) history.back();
    else location.replace(parentHash);
  }
  // Ein Rezept, das aus dem Planen-Tab geöffnet wurde, führt mit „Zurück“ wieder dorthin
  const recipeParent = () => (history.state && history.state.from === '#/planen' ? '#/planen' : '#/');
  const currentId = () => parseHash().id;

  // ---------- Rezeptansicht ----------
  const ingrRow = (text, i, checks) => {
    // Zwischenüberschriften wie „Für die Soße:“ sind keine Zutaten: kein Häkchen, kein Einkaufswagen
    if (/:\s*$/.test(text)) return `<li class="fh-ingr-head">${esc(text.replace(/:\s*$/, ''))}</li>`;
    const term = shopTerm(text);
    return `<li class="fh-ingr-row${checks.has(i) ? ' is-done' : ''}">
      <button class="fh-ingr-main" data-act="ingr" data-i="${i}"><span class="fh-check">${icon('check')}</span><span class="fh-ingr-text">${esc(text)}</span></button>
      <a class="fh-round fh-cart" href="${esc(shopLink(term))}" aria-label="${esc(term)} im Einkauf suchen">${icon('cart')}</a></li>`;
  };

  function showRecipe(rec) {
    const checks = new Set(store.get('checks.' + rec.id, []));
    const s = session();
    const resumeStep = s && s.id === rec.id ? s.step : 0;
    el.recipe.innerHTML = `
      <div class="fh-scroll" id="fh-rscroll">
        <div class="fh-hero">${rec.thumb ? `<img id="fh-hero" src="${esc(rec.thumb)}" alt="">` : ''}
          <button class="fh-round fh-hero-back" data-act="close-recipe" aria-label="Zurück">${icon('back')}</button></div>
        <div class="fh-rec-head">
          <div class="fh-kicker">${esc(rec.category)}</div>
          <h1>${esc(rec.title)}</h1>
          <div class="fh-pills">${pill('clock', fmtTime(rec.prepTime))}${pill('users', fmtYield(rec.yield))}${pill('pen', rec.author)}</div>
          ${tagsBlock(rec)}
          ${cookedBlock(rec)}
        </div>
        <section class="fh-panel">
          <div class="fh-panel-head"><h2>Zutaten</h2>
            <button class="fh-textbtn" data-act="reset-checks"${checks.size ? '' : ' hidden'}>Häkchen löschen</button></div>
          <ul class="fh-ingr">${rec.ingredients.map((x, i) => ingrRow(x, i, checks)).join('')}</ul>
        </section>
        <section class="fh-panel">
          <h2>Zubereitung</h2>
          <ol class="fh-steplist">${rec.steps.map((t, i) => `<li data-act="cook-at" data-step="${i + 1}"><span class="fh-num">${i + 1}</span><span>${esc(t)}</span></li>`).join('')}</ol>
        </section>
      </div>
      <div class="fh-bar">${cookidooButton(rec)}${mainAction(rec, resumeStep)}</div>
      <aside class="fh-drawer" id="fh-plan" hidden></aside>`;
    el.recipe.hidden = false;
    updateCkBlock(rec);
    const sc = $('#fh-rscroll');
    if (recipeScroll.id === rec.id) sc.scrollTop = recipeScroll.top;
    // Erst das kleine Vorschaubild zeigen, dann das große Foto nachladen
    if (rec.image && rec.image !== rec.thumb) {
      const big = new Image();
      big.onload = () => { const h = $('#fh-hero'); if (h && currentId() === rec.id) h.src = rec.image; };
      big.src = rec.image;
    }
  }

  // ---------- Cookidoo (Planen in „Meine Woche“) ----------
  // Die ID des eigenen Cookidoo-Rezepts schreibt der picnic-assistent nach dem Anlegen ins Frontmatter (cookidoo: "<id>").
  // Planen läuft über den Dienst cookidoo-bridge auf dem NAS (same-origin unter /cookidoo/api/, nur unter der Küchen-Adresse):
  //   GET  /cookidoo/api/geplant?von=YYYY-MM-DD&tage=9  → { tage: { 'YYYY-MM-DD': ['<id>', …] },
  //        rezepte: { '<id>': {titel, minuten, bild, bildGross} } }  (Steckbriefe nur für Katalog-Rezepte, siehe Planen-Tab)
  //   POST /cookidoo/api/plan  { recipeId, date: 'YYYY-MM-DD', action: 'add' | 'remove' } → { ok: true }
  //   GET  /cookidoo/api/status → { verbunden: true|false }  (fehlt der Dienst oder der Login, gibt es nur das Tag)
  const CK_API = '/cookidoo/api/';
  const PLAN_DAYS = 9; // Tagesauswahl: heute + 8 Tage (Wunsch des Nutzers)
  let ckReady = null; // null = unbekannt, true = Planen möglich, false = Dienst/Login fehlt
  function refreshCkStatus() {
    return fetch(CK_API + 'status', { credentials: 'same-origin', cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : { verbunden: false }))
      .then((s) => { ckReady = !!(s && s.verbunden); }, () => { ckReady = false; });
  }
  if (EMBED_SHOP) refreshCkStatus();
  // Beim Öffnen eines angelegten Rezepts erneut prüfen: Läuft der Dienst inzwischen, wird aus dem Tag sofort der Knopf
  function updateCkBlock(rec) {
    if (!EMBED_SHOP || !rec.cookidoo || ckReady === true) return;
    const before = ckReady;
    refreshCkStatus().then(() => {
      // Status hat sich geändert → Rezeptansicht neu aufbauen (Tag oben bzw. Knopf unten neben „Kochen starten“)
      if (ckReady === before || currentId() !== rec.id || view !== 'recipe') return;
      const sc = $('#fh-rscroll');
      recipeScroll = { id: rec.id, top: sc ? sc.scrollTop : 0 };
      showRecipe(rec);
    });
  }
  const ckCanPlan = (rec) => !!rec.cookidoo && EMBED_SHOP && ckReady !== false;
  // Oben im Rezeptkopf: nur Tags. Kann geplant werden, sitzt der Knopf unten neben „Kochen starten“ (beide Haupt-Aktionen)
  function cookidooTag(rec) {
    if (!rec.cookidoo) return `<span class="fh-tag fh-tag-todo">${icon('cal')}Muss noch in Cookidoo angelegt werden</span>`;
    if (!ckCanPlan(rec)) return `<span class="fh-tag">${icon('cal')}In Cookidoo angelegt</span>`;
    return '';
  }
  // Handy mit Picnic-App (iPhone/Android, nicht der Kühlschrank): Haupt-Aktion „Bei Picnic bestellen“ statt „Kochen starten“
  // (Wunsch des Nutzers). Die ID des eigenen Picnic-Rezepts schreibt der picnic-assistent ins Frontmatter (picnic: "<id>").
  // Deep Link über das App-Schema von Picnic (so leitet auch picnic.app Handys in die App), am iPhone getestet 2026-11-08.
  // Kochen bleibt über die Schritte („Zubereitung“ antippen) und das Weiterkochen-Banner erreichbar.
  const PICNIC_APP = !IS_FRIDGE && /iPhone|iPad|iPod|Android/.test(navigator.userAgent);
  const picnicHref = (id) => `nl.picnic-supermarkt://store/page;id=selling-group-details-page,selling_group_id=${encodeURIComponent(id)}`;
  const picnicTag = (rec) => (PICNIC_APP && !rec.picnic ? `<span class="fh-tag fh-tag-todo">${icon('cart')}Muss noch in Picnic angelegt werden</span>` : '');
  function tagsBlock(rec) {
    const tags = cookidooTag(rec) + picnicTag(rec);
    return tags ? `<div class="fh-ck fh-tags">${tags}</div>` : '';
  }
  // Beschriftung der Leisten-Knöpfe in zwei festen Teilen: Stehen zwei Knöpfe nebeneinander, bricht das Handy beide
  // gleich in zwei Zeilen um (fridge.css). Einzeilig passen die Texte dort nur bei ~15 px, auf kleineren iPhones gar nicht.
  const barLabel = (a, b) => `<span class="fh-lbl"><span>${a}</span> <span>${b}</span></span>`;
  function mainAction(rec, resumeStep) {
    if (PICNIC_APP && rec.picnic) return `<a class="fh-btn fh-primary fh-wide" href="${esc(picnicHref(rec.picnic))}">${icon('cart')}${barLabel('Bei Picnic', 'bestellen')}</a>`;
    return `<button class="fh-btn fh-primary fh-wide" data-act="cook"${rec.steps.length ? '' : ' disabled'}>${icon('play')}${resumeStep ? barLabel('Weiter bei', `Schritt ${resumeStep}`) : barLabel('Kochen', 'starten')}</button>`;
  }
  const cookidooButton = (rec) => (ckCanPlan(rec) ? `<button class="fh-btn fh-ck-btn" data-act="ck-open">${icon('cal')}${barLabel('In Cookidoo', 'planen')}</button>` : '');
  const isoDate = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  function nextDays(n) {
    const noon = new Date(); noon.setHours(12, 0, 0, 0);
    const out = [];
    for (let i = 0; i < n; i++) {
      const d = new Date(noon.getTime() + i * 86400000);
      out.push({ iso: isoDate(d), label: i === 0 ? 'Heute' : i === 1 ? 'Morgen' : d.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric' }) });
    }
    return out;
  }
  function ckFetch(path, opts) {
    return fetch(CK_API + path, Object.assign({ credentials: 'same-origin', headers: { 'Content-Type': 'application/json' } }, opts || {}))
      .then((r) => {
        if (r.ok) return r.json();
        if (r.status === 404) throw new Error('Cookidoo-Planung ist auf dem NAS noch nicht eingerichtet');
        return r.json().catch(() => ({})).then((b) => { throw new Error(b.fehler || b.error || 'Cookidoo antwortet mit ' + r.status); });
      });
  }
  // Tagesauswahl: je Tag die Beschriftung und, wie im Kalenderblatt des Planen-Tabs, ein Stapel runder Vorschaubilder der
  // anderen Gerichte, die dort schon geplant sind (Wunsch des Nutzers). Ob DIESES Rezept dort steht, zeigt die Limetten-Füllung.
  // Sofort aus dem Zwischenstand des Planen-Tabs (fridge.plan), nach dem Laden frisch; der Zwischenstand wird dabei mit aufgefrischt.
  const ckThumb = (id, rezepte) => {
    const r = byCookidoo.get(id);
    return r ? r.tile || r.thumb || '' : (rezepte && rezepte[id] && rezepte[id].bild) || '';
  };
  function ckStack(ids, rezepte) {
    const n = ids.length;
    return (n > 3 ? ids.slice(0, 2) : ids).map((id) => { const src = ckThumb(id, rezepte); return src ? pvImg(src) : '<i></i>'; }).join('') +
      (n > 3 ? `<i class="fh-cal-more">+${n - 2}</i>` : '');
  }
  function fillPlanDays(panel, rec, tage, rezepte) {
    for (const b of panel.querySelectorAll('.fh-ck-day')) {
      const ids = tage[b.dataset.date];
      if (!ids) continue; // Tag liegt nicht im (Zwischen-)Stand
      b.classList.toggle('is-active', ids.includes(rec.cookidoo));
      b.querySelector('.fh-cal-stack').innerHTML = ckStack(ids.filter((id) => id !== rec.cookidoo), rezepte);
    }
  }
  function openPlan() {
    const rec = byId.get(currentId());
    const panel = $('#fh-plan');
    if (!rec || !rec.cookidoo || !panel) return;
    const days = nextDays(PLAN_DAYS);
    panel.innerHTML = `<div class="fh-scrim" data-act="ck-close"></div>
      <div class="fh-drawer-panel">
        <div class="fh-drawer-head"><h2>In Cookidoo planen</h2><button class="fh-round" data-act="ck-close" aria-label="Schließen">${icon('x')}</button></div>
        <p class="fh-ck-hint">Erscheint am Thermomix unter „Meine Woche“. Nochmal antippen nimmt es wieder heraus.</p>
        <div class="fh-ck-days">${days.map((d) => `<button class="fh-chip fh-ck-day" data-act="ck-day" data-date="${d.iso}" data-label="${esc(d.label)}">
          <span class="fh-ck-lbl">${esc(d.label)}</span><span class="fh-cal-stack"></span></button>`).join('')}</div>
        <p class="fh-ck-status" id="fh-ck-status">Lade Wochenplan …</p>
      </div>`;
    panel.hidden = false;
    root.classList.add('fh-drawer-open');
    if (plan && plan.tage) fillPlanDays(panel, rec, plan.tage, plan.rezepte);
    ckFetch(`geplant?von=${days[0].iso}&tage=${PLAN_DAYS}`).then((data) => {
      const tage = (data && data.tage) || {}, rezepte = (data && data.rezepte) || {};
      fillPlanDays(panel, rec, tage, rezepte);
      $('#fh-ck-status').textContent = '';
      if (plan && plan.tage) { // überlappende Tage in den Zwischenstand des Planen-Tabs übernehmen
        for (const iso of Object.keys(tage)) if (iso in plan.tage) plan.tage[iso] = tage[iso];
        plan.rezepte = Object.assign(plan.rezepte || {}, rezepte);
        store.set('plan', plan);
      }
    }, (err) => { $('#fh-ck-status').textContent = err.message; });
  }
  function closePlan() { const p = $('#fh-plan'); if (p) p.hidden = true; root.classList.remove('fh-drawer-open'); }
  function togglePlanDay(btn) {
    const rec = byId.get(currentId());
    if (!rec || btn.disabled) return;
    const planned = btn.classList.contains('is-active');
    btn.disabled = true;
    ckFetch('plan', { method: 'POST', body: JSON.stringify({ recipeId: rec.cookidoo, date: btn.dataset.date, action: planned ? 'remove' : 'add' }) })
      .then(() => {
        btn.classList.toggle('is-active', !planned);
        notePlanChange(btn.dataset.date, rec.cookidoo, !planned);
        toast(planned ? `Aus „Meine Woche“ entfernt: ${btn.dataset.label}` : `In Cookidoo geplant: ${btn.dataset.label}`);
      }, (err) => toast(err.message, 3500))
      .finally(() => { btn.disabled = false; });
  }

  // ---------- Planen (Tab #/planen): Cookidoo „Meine Woche“ als Kalender ----------
  // Vorerst nur eine Ansicht, geplant wird weiter im Rezept über „In Cookidoo planen“. Daten: GET geplant der Brücke für
  // diese und die nächste Woche (Mo–So, 14 Tage = Höchstwert der Brücke). Eigene Rezepte kommen über ihre Cookidoo-ID aus
  // recipes.json (Name, Bilder, Zeit, Kategorie), Katalog-Rezepte über den Steckbrief der Brücke
  // (rezepte: {id: {titel, minuten, bild, bildGross}}). Fehlt er (ältere Brücke), steht dort „Rezept aus Cookidoo“.
  // Aufbau: Bühne mit großen Fotos für heute (oder den nächsten geplanten Tag), darunter das Zwei-Wochen-Blatt und die
  // Zeitleiste der folgenden Tage. Freie Tage am Stück fasst die Zeitleiste zu einer Zeile zusammen.
  // Der letzte Stand liegt in localStorage (fridge.plan), damit der Tab nach dem Aufwachen sofort etwas zeigt.
  const PV_DAYS = 14;
  const KATALOG_ID = /^r\d+$/;
  const WD_LONG = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
  const WD_SHORT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  const MONTHS_SHORT = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
  let plan = store.get('plan', null); // { von, tage: {iso: [ids]}, rezepte: {id: steckbrief}, t, stale }
  let planLoading = false;
  let planError = '';
  let planSig = '';
  let planDay = ''; // Datum der letzten Darstellung, um Mitternacht wird neu aufgebaut

  function weekStart() { // Montag dieser Woche, 12 Uhr (Sommerzeit-Wechsel verschieben so nie das Datum)
    const d = new Date(); d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d;
  }
  function isoWeek(d) {
    const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
    return Math.ceil(((t - Date.UTC(t.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7);
  }
  const hhmm = (t) => new Date(t).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  const minutes = (m) => (m < 60 ? `${m}′` : m % 60 ? `${Math.floor(m / 60)} h ${m % 60}′` : `${m / 60} h`);
  const dayName = (x) => `${WD_LONG[x.d.getDay()]}, ${x.d.getDate()}. ${MONTHS[x.d.getMonth()]}`;
  const countText = (n) => (n === 1 ? '1 Rezept' : `${n} Rezepte`);

  function loadPlan(force) {
    if (!EMBED_SHOP || planLoading) return;
    const von = isoDate(weekStart());
    if (!force && plan && plan.von === von && !plan.stale && Date.now() - plan.t < 60000) return;
    planLoading = true;
    renderPlanStatus();
    ckFetch(`geplant?von=${von}&tage=${PV_DAYS}`)
      .then((data) => {
        plan = { von, tage: (data && data.tage) || {}, rezepte: (data && data.rezepte) || {}, t: Date.now() };
        planError = '';
        store.set('plan', plan);
      }, (err) => { planError = err instanceof TypeError ? 'NAS nicht erreichbar' : err.message; })
      .finally(() => { planLoading = false; if (view === 'plan') renderPlan(); });
  }
  // „In Cookidoo planen“ im Rezept: Zwischenstand sofort anpassen, beim nächsten Öffnen des Tabs frisch laden
  function notePlanChange(iso, id, add) {
    if (!plan || !plan.tage) return;
    const list = plan.tage[iso];
    if (list) {
      const i = list.indexOf(id);
      if (add && i < 0) list.push(id); else if (!add && i >= 0) list.splice(i, 1);
    }
    plan.stale = true;
    store.set('plan', plan);
  }

  function planItem(id) {
    const r = byCookidoo.get(id);
    if (r) return { id, rec: r, title: r.name, time: r.prepTime ? shortTime(r.prepTime) : '', meta: r.category, img: r.tile || r.thumb || '', big: r.thumb || r.tile || '' };
    const s = (plan && plan.rezepte && plan.rezepte[id]) || {};
    return { id, rec: null, title: s.titel || (KATALOG_ID.test(id) ? 'Rezept aus Cookidoo' : 'Eigenes Cookidoo-Rezept'),
      time: s.minuten ? minutes(s.minuten) : '', meta: 'Cookidoo', img: s.bild || '', big: s.bildGross || s.bild || '' };
  }
  function planDays() {
    const start = weekStart(), today = isoDate(new Date());
    const tm = new Date(); tm.setHours(12, 0, 0, 0); tm.setDate(tm.getDate() + 1);
    const tomorrow = isoDate(tm);
    const out = [];
    for (let i = 0; i < PV_DAYS; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i);
      const iso = isoDate(d);
      const ids = (plan && plan.tage && plan.tage[iso]) || [];
      out.push({ d, iso, past: iso < today, today: iso === today, tomorrow: iso === tomorrow, items: ids.map(planItem) });
    }
    return out;
  }

  // Karte eines geplanten Gerichts. Die Fläche öffnet eigene Rezepte, bei Katalog-Rezepten (gibt es nur in Cookidoo bzw. am
  // Thermomix) kommt ein Hinweis. Der Knopf oben rechts nimmt das Gericht zum Verschieben auf. Link und Knopf liegen als
  // Geschwister über der Karte (ein Knopf in einem Link wäre ungültig).
  const itemTag = (it, iso, cls, inner) => `<div class="${cls}${it.rec ? '' : ' is-foreign'}" data-ck="${esc(it.id)}" data-day="${iso}">${inner}
    ${it.rec ? `<a class="fh-stretch" href="#/r/${esc(it.rec.id)}" aria-label="${esc(it.title)} öffnen"></a>`
      : `<button class="fh-stretch" data-act="pv-foreign" aria-label="${esc(it.title)}"></button>`}
    <button class="fh-mv" data-act="pv-move" data-id="${esc(it.id)}" data-day="${iso}" aria-label="${esc(it.title)} verschieben">${icon('move')}</button></div>`;
  const pvImg = (src) => (src ? `<img src="${esc(src)}" alt="" decoding="async" referrerpolicy="no-referrer">` : '');
  const pvPh = () => `<span class="fh-ph">${icon('cal')}</span>`;
  const secHead = (kicker, title, aside) => `<div class="fh-sec-head"><div>${kicker ? `<div class="fh-kicker">${esc(kicker)}</div>` : ''}<h2>${esc(title)}</h2></div>${aside ? `<span class="fh-sec-aside">${esc(aside)}</span>` : ''}</div>`;

  // Bühne: Bento je nach Anzahl (1 groß · 2 nebeneinander · 1 groß + 2 · 2 × 2 · ab 5 drei Spalten). Große Kacheln
  // bekommen das 640-px-Vorschaubild, kleine die 300-px-Kachel.
  function stageHtml(day) {
    if (!day) {
      return `<section class="fh-stage fh-stage-empty"><span class="fh-empty-art">${icon('cal')}</span>
        <h2>Noch nichts geplant</h2>
        <p>Im Rezept unten auf „In Cookidoo planen“ tippen. Geplantes erscheint hier und am Thermomix unter „Meine Woche“.</p>
        <a class="fh-btn fh-primary" href="#/">${icon('book')}Rezepte ansehen</a></section>`;
    }
    const n = day.items.length;
    const bigFirst = n === 1 || n === 3;
    const cards = day.items.map((it, i) => {
      const small = (n === 3 && i > 0) || n >= 5;
      return itemTag(it, day.iso, 'fh-hcard' + (bigFirst && i === 0 ? ' is-big' : ''), `${pvPh()}${pvImg(small ? it.img : it.big)}
        ${it.time ? `<span class="fh-card-time">${esc(it.time)}</span>` : ''}
        <span class="fh-hcard-cap"><span class="fh-hcard-meta">${esc(it.meta)}</span><span class="fh-hcard-title">${esc(it.title)}</span></span>`);
    }).join('');
    return `<section class="fh-stage" id="fh-pv-${day.iso}">
      ${secHead(day.today ? 'Heute' : 'Als Nächstes', (day.tomorrow ? 'Morgen · ' : '') + dayName(day), countText(n))}
      <div class="fh-bento fh-n${Math.min(n, 5)}">${cards}</div></section>`;
  }

  // Zwei-Wochen-Blatt (Mo–So): je Tag die Zahl und ein Stapel runder Vorschaubilder (ab 4 Rezepten „+n“)
  function calHtml(days) {
    const first = days[0].d, last = days[days.length - 1].d;
    const month = first.getMonth() === last.getMonth() ? MONTHS[first.getMonth()] : `${MONTHS[first.getMonth()]} / ${MONTHS[last.getMonth()]}`;
    const total = days.reduce((s, d) => s + (d.past ? 0 : d.items.length), 0);
    const wds = WD_SHORT.slice(1).concat(WD_SHORT[0]).map((w, i) => `<span class="fh-cal-wd${i >= 5 ? ' is-we' : ''}">${w}</span>`).join('');
    const kw = `KW ${isoWeek(first)}–${isoWeek(last)}`;
    return `<section class="fh-cal">
      ${secHead('', month, plan ? `${kw} · ${total ? countText(total) : 'alles frei'}` : kw)}
      <div class="fh-cal-grid">${wds}${days.map(calCell).join('')}</div></section>`;
  }
  function calCell(day) {
    const n = day.items.length;
    const cls = 'fh-cal-day' + (day.past ? ' is-past' : '') + (day.today ? ' is-today' : '') + (n ? ' has-plan' : '');
    const stack = (n > 3 ? day.items.slice(0, 2) : day.items).map((it) => (it.img ? pvImg(it.img) : '<i></i>')).join('') +
      (n > 3 ? `<i class="fh-cal-more">+${n - 2}</i>` : '');
    const mon = day.d.getDate() === 1 ? `<span class="fh-cal-mon">${MONTHS_SHORT[day.d.getMonth()]}</span>` : '';
    return `<button class="${cls}" data-act="pv-day" data-date="${day.iso}"${day.past ? ' disabled' : ''}
      aria-label="${esc(dayName(day))}: ${n ? countText(n) : 'nichts geplant'}">${mon}<span class="fh-cal-num">${day.d.getDate()}</span><span class="fh-cal-stack">${stack}</span></button>`;
  }

  // Zeitleiste nach dem Bühnen-Tag: geplante Tage mit Karten, freie Tage am Stück als eine gestrichelte Zeile.
  // Ist danach gar nichts mehr geplant, genügt eine Zeile (spart am Kühlschrank das Scrollen).
  function agendaHtml(days, afterIso) {
    const rest = days.filter((d) => d.iso > afterIso);
    if (!rest.length) return '';
    const last = rest[rest.length - 1];
    if (!rest.some((d) => d.items.length)) {
      return `<div class="fh-pv-rest" id="fh-pv-${rest[0].iso}" data-to="${last.iso}">Danach bis ${esc(dayName(last))} noch nichts geplant</div>`;
    }
    let rows = '', run = [];
    const flush = () => { if (run.length) { rows += freeRow(run); run = []; } };
    for (const d of rest) { if (d.items.length) { flush(); rows += dayRow(d); } else run.push(d); }
    flush();
    return `<section class="fh-agenda">${secHead(`Bis ${dayName(last)}`, 'Demnächst')}${rows}</section>`;
  }
  const when = (d) => `<div class="fh-ag-when"><span class="fh-ag-num">${d.d.getDate()}</span><span class="fh-ag-mon">${MONTHS_SHORT[d.d.getMonth()]}</span></div>`;
  function dayRow(d) {
    const n = d.items.length;
    return `<div class="fh-ag-row has-plan" id="fh-pv-${d.iso}">${when(d)}
      <div class="fh-ag-body"><div class="fh-ag-label">${d.tomorrow ? 'Morgen · ' : ''}${WD_LONG[d.d.getDay()]}${n > 1 ? `<span> · ${countText(n)}</span>` : ''}</div>
        <div class="fh-ag-cards">${d.items.map((it) => rowCard(it, d.iso)).join('')}</div></div></div>`;
  }
  const rowCard = (it, iso) => itemTag(it, iso, 'fh-rcard', `<span class="fh-rcard-img">${pvPh()}${pvImg(it.img)}</span>
    <span class="fh-rcard-body"><span class="fh-rcard-title">${esc(it.title)}</span>
      <span class="fh-rcard-meta">${it.time ? `${icon('clock')}${esc(it.time)}<b>·</b>` : ''}${esc(it.meta)}</span></span>`);
  function freeRow(run) {
    const a = run[0], b = run[run.length - 1];
    const text = run.length === 1 ? `${WD_LONG[a.d.getDay()]} · frei`
      : `${run.length} Tage frei · ${WD_SHORT[a.d.getDay()]} – ${WD_SHORT[b.d.getDay()]} ${b.d.getDate()}.`;
    return `<div class="fh-ag-row is-free" id="fh-pv-${a.iso}" data-to="${b.iso}">${when(a)}
      <div class="fh-ag-body"><div class="fh-ag-free">${esc(text)}</div></div></div>`;
  }

  function renderPlan() {
    planDay = isoDate(new Date());
    const sig = JSON.stringify([planDay, plan && plan.tage, plan && plan.rezepte, !plan && (planLoading || planError)]);
    if (sig !== planSig) {
      planSig = sig;
      const days = planDays();
      const stage = plan ? days.find((d) => !d.past && d.items.length) || null : undefined;
      const today = days.find((d) => d.today);
      let body;
      if (stage !== undefined) body = stageHtml(stage);
      else if (planError) {
        body = `<section class="fh-stage fh-stage-empty"><span class="fh-empty-art is-warn">${icon('cal')}</span>
          <h2>Wochenplan nicht erreichbar</h2><p>${esc(planError)}</p>
          <button class="fh-btn fh-primary" data-act="pv-refresh">${icon('refresh')}Erneut versuchen</button></section>`;
      } else {
        body = `<section class="fh-stage">${secHead('Heute', dayName(today))}<div class="fh-bento fh-n1"><span class="fh-hcard fh-skel"></span></div></section>`;
      }
      el.pvBody.innerHTML = `<button class="fh-pv-status" id="fh-pv-status" data-act="pv-refresh"></button>${body}${calHtml(days)}${stage ? agendaHtml(days, stage.iso) : ''}`;
    }
    renderPlanStatus();
    applyMoveUi(); // aufgenommenes Gericht und Zieltage auch nach dem Neuaufbau markieren
  }
  function renderPlanStatus() {
    const s = document.getElementById('fh-pv-status');
    if (!s) return;
    const stand = plan ? ` · Stand ${hhmm(plan.t)}` : '';
    s.className = 'fh-pv-status' + (planLoading ? ' is-loading' : planError ? ' is-error' : '');
    s.innerHTML = `${icon('refresh')}<span>${planLoading ? 'Cookidoo wird gelesen …' : planError ? `${esc(planError)}${stand}` : `Cookidoo · Meine Woche${stand}`}</span>`;
  }
  function showPlanView() {
    renderPlan();
    loadPlan(false);
  }
  // Tag im Blatt antippen: zur passenden Stelle (Bühne, Tag oder Zeile mit freien Tagen) scrollen und sie kurz aufleuchten lassen
  function pvJump(iso) {
    const target = document.getElementById('fh-pv-' + iso) ||
      [...el.pvBody.querySelectorAll('[data-to]')].find((r) => r.id.slice(6) <= iso && iso <= r.dataset.to);
    if (!target) { el.pv.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    target.scrollIntoView({ block: 'start', behavior: 'smooth' });
    target.classList.remove('is-flash');
    void target.offsetWidth; // Animation neu starten
    target.classList.add('is-flash');
  }

  // ---------- Umplanen: Gericht aufnehmen und auf einem Tag im Blatt ablegen ----------
  // „Aufnehmen und Ablegen“ statt Ziehen (Wunsch des Nutzers: ein Gericht nach dem anderen auf andere Tage legen). Ziehen
  // taugt am Kühlschrank wenig: Der Touchscreen meldet sich als Maus, große Karten ruckeln beim Ziehen auf seiner GPU, und
  // Ziehen und Scrollen kämen sich in die Quere. Ablauf: Verschieben-Knopf auf der Karte → das Gericht ist aufgenommen, das
  // Blatt zeigt die möglichen Zieltage → Tag antippen → in Cookidoo verschoben. Reihenfolge: erst am Zieltag eintragen,
  // dann am alten Tag austragen. Scheitert das Austragen, steht das Gericht an beiden Tagen statt an keinem.
  // Danach bietet die Leiste 6 s lang „Rückgängig“. Abbrechen: ✕ in der Leiste, derselbe Knopf noch einmal, Esc oder Tabwechsel.
  // Rausnehmen (Wunsch des Nutzers, im selben Dialog): „Rausnehmen“ in der Leiste trägt das aufgenommene Gericht am bisherigen
  // Tag aus. Ohne Rückfrage, weil danach ebenfalls 6 s „Rückgängig“ kommt (plant es am selben Tag wieder ein).
  let pvMove = null; // { id, from, title, busy, removing, to }
  let pvDone = null; // { kind: 'moved' | 'removed' | 'busy', id, from, to, title, undo, timer }
  const isoDay = (iso) => new Date(iso + 'T12:00:00');
  const barDay = (iso) => { const d = isoDay(iso); return `${WD_LONG[d.getDay()]}, ${d.getDate()}.`; };
  function canDrop(iso) {
    if (!pvMove || iso < isoDate(new Date()) || iso === pvMove.from) return false;
    return !((plan && plan.tage && plan.tage[iso]) || []).includes(pvMove.id); // steht dort schon
  }
  function applyMoveUi() {
    const m = pvMove;
    root.classList.toggle('fh-moving', !!m);
    el.pv.classList.toggle('is-moving', !!m);
    for (const c of el.pvBody.querySelectorAll('[data-ck]')) c.classList.toggle('is-picked', !!m && c.dataset.ck === m.id && c.dataset.day === m.from);
    for (const b of el.pvBody.querySelectorAll('.fh-cal-day')) {
      b.classList.toggle('is-drop', !!m && !m.busy && canDrop(b.dataset.date));
      b.classList.toggle('is-source', !!m && b.dataset.date === m.from);
      b.classList.toggle('is-target', !!m && b.dataset.date === m.to);
    }
    renderPvBar();
  }
  function renderPvBar() {
    const bar = el.pvBar, m = pvMove, d = pvDone;
    el.pv.classList.toggle('has-bar', !!(m || d));
    if (m) {
      bar.className = 'fh-pv-bar' + (m.busy ? ' is-busy' : '');
      bar.innerHTML = `${icon('move')}<span class="fh-pv-bar-text"><b>${esc(m.title)}</b><span>${m.busy ? (m.removing ? 'wird herausgenommen …' : 'wird verschoben …')
        : 'Neuen Tag<span class="fh-wide-only"> im Kalender</span> antippen'}</span></span>` + (m.busy ? ''
        : `<button class="fh-pv-bar-btn" data-act="pv-remove">${icon('trash')}Rausnehmen</button>` +
          `<button class="fh-pv-bar-x" data-act="pv-move-cancel" aria-label="Abbrechen">${icon('x')}</button>`);
    } else if (d) {
      const text = d.kind === 'busy' ? 'wird wieder eingeplant …'
        : d.kind === 'removed' ? `am ${barDay(d.from)} herausgenommen` : `liegt ${d.undo ? 'wieder' : 'jetzt'} auf ${barDay(d.to)}`;
      bar.className = 'fh-pv-bar is-done' + (d.kind === 'busy' ? ' is-busy' : '');
      bar.innerHTML = `${icon(d.kind === 'removed' ? 'trash' : d.kind === 'busy' ? 'refresh' : 'check')}<span class="fh-pv-bar-text"><b>${esc(d.title)}</b><span>${esc(text)}</span></span>` +
        (d.kind === 'busy' || d.undo ? '' : '<button class="fh-pv-bar-btn" data-act="pv-undo">Rückgängig</button>');
    }
    bar.hidden = !(m || d);
  }
  function clearDone() { if (pvDone) { clearTimeout(pvDone.timer); pvDone = null; } }
  function showDone(note) { // Erfolgsmeldung, 6 s sichtbar (mit „Rückgängig“, außer nach einem Rückgängig)
    clearDone();
    pvDone = note;
    note.timer = setTimeout(() => { if (pvDone === note) { pvDone = null; renderPvBar(); } }, 6000);
  }
  // Zwischenstand sofort anpassen (danach lädt loadPlan frisch aus Cookidoo)
  function planLocal(id, iso, add) {
    if (!plan || !plan.tage) return;
    const list = plan.tage[iso] || (plan.tage[iso] = []);
    const i = list.indexOf(id);
    if (add) list.push(id); else if (i >= 0) list.splice(i, 1);
    plan.stale = true;
    store.set('plan', plan);
  }
  const postPlan = (id, date, action) => ckFetch('plan', { method: 'POST', body: JSON.stringify({ recipeId: id, date, action }) });
  function startMove(id, from) {
    if (pvMove && pvMove.busy) return;
    if (pvMove && pvMove.id === id && pvMove.from === from) { cancelMove(); return; } // gleicher Knopf = abbrechen
    clearDone();
    pvMove = { id, from, title: planItem(id).title, busy: false, to: null };
    applyMoveUi();
    // Das Blatt muss sichtbar sein (am Handy liegt es unter der Bühne, aus der Zeitleiste heraus darüber)
    const cal = el.pvBody.querySelector('.fh-cal');
    if (cal) {
      const r = cal.getBoundingClientRect(), box = el.pv.getBoundingClientRect();
      if (r.top < box.top + 90 || r.bottom > box.bottom - 110) cal.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }
  function cancelMove() {
    if (!pvMove || pvMove.busy) return;
    pvMove = null;
    applyMoveUi();
  }
  function doMove(to, undo) {
    const m = pvMove;
    if (!m || m.busy) return;
    m.busy = true;
    m.to = to;
    applyMoveUi();
    postPlan(m.id, to, 'add')
      .then(() => postPlan(m.id, m.from, 'remove').then(() => true, (err) => {
        toast(`Am neuen Tag eingeplant, am alten Tag aber nicht entfernt: ${err.message}`, 5000);
        return false;
      }))
      .then((removed) => {
        planLocal(m.id, to, true);
        if (removed) planLocal(m.id, m.from, false);
        pvMove = null;
        clearDone();
        if (removed) showDone({ kind: 'moved', id: m.id, from: m.from, to, title: m.title, undo: !!undo });
        renderPlan();
        const cell = el.pvBody.querySelector(`.fh-cal-day[data-date="${to}"]`);
        if (cell) cell.classList.add('is-flash');
        loadPlan(true);
      }, (err) => {
        m.busy = false;
        m.to = null;
        applyMoveUi();
        toast(err.message, 3500);
      });
  }
  function doRemove() {
    const m = pvMove;
    if (!m || m.busy) return;
    m.busy = true;
    m.removing = true;
    applyMoveUi();
    postPlan(m.id, m.from, 'remove').then(() => {
      planLocal(m.id, m.from, false);
      pvMove = null;
      showDone({ kind: 'removed', id: m.id, from: m.from, title: m.title });
      renderPlan();
      loadPlan(true);
    }, (err) => {
      m.busy = false;
      m.removing = false;
      applyMoveUi();
      toast(err.message, 3500);
    });
  }
  function undoMove() {
    const d = pvDone;
    if (!d || pvMove || d.kind === 'busy' || d.undo) return;
    clearDone();
    if (d.kind === 'removed') { // am selben Tag wieder einplanen
      pvDone = { kind: 'busy', title: d.title };
      renderPvBar();
      postPlan(d.id, d.from, 'add').then(() => {
        planLocal(d.id, d.from, true);
        showDone({ kind: 'moved', id: d.id, to: d.from, title: d.title, undo: true });
        renderPlan();
        loadPlan(true);
      }, (err) => {
        pvDone = null;
        renderPvBar();
        toast(`Nicht wieder eingeplant: ${err.message}`, 4000);
      });
      return;
    }
    pvMove = { id: d.id, from: d.to, title: d.title, busy: false, to: null };
    doMove(d.from, true);
  }
  function tapPlanDay(btn) {
    const iso = btn.dataset.date;
    if (!pvMove) { pvJump(iso); return; }
    if (pvMove.busy) return;
    if (canDrop(iso)) doMove(iso);
    else toast(iso === pvMove.from ? 'Das ist der bisherige Tag' : 'Steht an diesem Tag schon im Plan');
  }

  // Fremde Bilder (Cookidoo-Katalog) können fehlen: dann bleibt der Platzhalter darunter sichtbar
  el.pv.addEventListener('error', (e) => { if (e.target && e.target.tagName === 'IMG') e.target.remove(); }, true);
  el.recipe.addEventListener('error', (e) => { const t = e.target; if (t && t.tagName === 'IMG' && t.closest('.fh-cal-stack')) t.remove(); }, true);
  if (EMBED_SHOP) setInterval(() => { if (view === 'plan' && !document.hidden) loadPlan(true); }, 5 * 60 * 1000);

  function toggleIngredient(btn) {
    const id = currentId(), row = btn.closest('li'), i = +btn.dataset.i;
    const checks = new Set(store.get('checks.' + id, []));
    if (checks.has(i)) checks.delete(i); else checks.add(i);
    store.set('checks.' + id, [...checks]);
    row.classList.toggle('is-done', checks.has(i));
    const reset = $('[data-act="reset-checks"]', el.recipe);
    if (reset) reset.hidden = !checks.size;
  }

  // ---------- Kochmodus ----------
  let cookRecipeId = null;
  let cookStep = 1;

  function showCook(rec, stepNo) {
    const entering = view !== 'cook' || cookRecipeId !== rec.id;
    if (cookRecipeId !== rec.id || !$('#fh-step', el.cook)) {
      el.cook.innerHTML = `
        <header class="fh-cook-top">
          <button class="fh-round" data-act="close-cook" aria-label="Zum Rezept">${icon('back')}</button>
          <div class="fh-cook-title"><div class="fh-cook-name">${esc(rec.name)}</div><div class="fh-cook-count" id="fh-count"></div></div>
          <button class="fh-awake-btn" data-act="awake" id="fh-awake-btn" aria-label="Bildschirm wachhalten"><span class="fh-awake-dot"></span></button>
          <button class="fh-round" data-act="drawer" aria-label="Zutaten">${icon('list')}</button>
          <button class="fh-round" data-act="read" id="fh-read" aria-label="Vorlesen">${icon('speaker')}</button>
          <button class="fh-round" data-act="voice" id="fh-voice" aria-label="Sprachsteuerung">${icon('mic')}</button>
        </header>
        <div class="fh-progress"><i id="fh-prog"></i></div>
        <div class="fh-step" id="fh-step"><div class="fh-step-inner" id="fh-step-inner">
          <div class="fh-step-no" id="fh-stepno"></div><p class="fh-step-text" id="fh-steptext"></p></div></div>
        <p class="fh-nextstep" id="fh-nextstep"></p>
        <p class="fh-voicehint">Sag „weiter“, „zurück“, „wiederholen“, „Zutaten“, „Timer“ oder „… auf die Einkaufsliste“.</p>
        <nav class="fh-cook-nav">
          <button class="fh-btn fh-nav" data-act="prev" id="fh-prev">${icon('back')}Zurück</button>
          <button class="fh-btn fh-nav fh-primary" data-act="next" id="fh-next"></button>
        </nav>
        <aside class="fh-drawer" id="fh-drawer" hidden></aside>`;
    }
    cookRecipeId = rec.id;
    el.cook.hidden = false;
    renderStep(rec, stepNo, 0, settings.autoRead);
    if (entering) enterCook();
  }

  function renderStep(rec, n, direction, read) {
    const total = rec.steps.length;
    n = clamp(n, 1, total);
    cookStep = n;
    $('#fh-count').textContent = `Schritt ${n} von ${total}`;
    $('#fh-prog').style.width = (n / total) * 100 + '%';
    $('#fh-stepno').textContent = n;
    $('#fh-steptext').innerHTML = stepHtml(rec.steps[n - 1], n);
    $('#fh-nextstep').innerHTML = n < total ? `<b>Danach:</b> ${esc(rec.steps[n])}` : '<b>Letzter Schritt</b> – danach „Fertig“ tippen.';
    $('#fh-prev').disabled = n === 1;
    $('#fh-next').innerHTML = n === total ? `${icon('check')}Fertig` : `Weiter${icon('chevR')}`;
    store.set('session', { id: rec.id, step: n, ts: Date.now() });
    fitStep();
    if (direction) {
      const inner = $('#fh-step-inner');
      inner.classList.remove('fh-anim-next', 'fh-anim-prev');
      void inner.offsetWidth; // Animation neu starten
      inner.classList.add(direction > 0 ? 'fh-anim-next' : 'fh-anim-prev');
    }
    if (read) readStep();
  }

  // Schrift verkleinern, bis der Schritt ohne Scrollen passt
  function fitStep() {
    const box = $('#fh-step'), text = $('#fh-steptext');
    if (!box || !text || el.cook.hidden) return;
    const phone = window.innerWidth < 600; // Handy: kleiner anfangen und weiter schrumpfen dürfen
    let size = phone ? 32 : 38;
    const min = phone ? 18 : 22;
    text.style.fontSize = size + 'px';
    while (size > min && box.scrollHeight > box.clientHeight + 1) {
      size -= 2;
      text.style.fontSize = size + 'px';
    }
  }

  function step(delta) {
    if (view !== 'cook') return;
    const rec = byId.get(cookRecipeId);
    const n = cookStep + delta;
    if (!rec || n < 1) return;
    if (n > rec.steps.length) { finishCook(rec); return; }
    history.replaceState(history.state, '', `#/r/${rec.id}/k/${n}`);
    currentHash = location.hash;
    renderStep(rec, n, delta, settings.autoRead);
  }

  function finishCook(rec) {
    store.del('session');
    store.del('checks.' + rec.id);
    markCooked(rec.id, true); // Kochen beendet = heute gekocht (blendet es auf der Startseite aus, „Probe gekocht“)
    toast('Guten Appetit!');
    goBack('#/r/' + rec.id);
  }

  function enterCook() {
    root.classList.add('fh-cooking');
    updateToggles();
    if (settings.keepAwake) awakeStart(); // view ist hier noch nicht 'cook', route() ruft danach syncAwake()
    // Ohne dauerhafte Mikrofon-Erlaubnis nicht automatisch starten – das würde eine Abfrage aus heiterem Himmel öffnen
    if (settings.voice && micPermission === 'granted') voiceStart();
  }

  function leaveCook() {
    root.classList.remove('fh-cooking');
    voiceStop();
    if (synth) synth.cancel();
    closeDrawer();
  }

  function updateToggles() {
    const set = (id, on) => { const b = document.getElementById(id); if (b) b.setAttribute('aria-pressed', on ? 'true' : 'false'); };
    set('fh-read', settings.autoRead);
    set('fh-voice', listening); // gedrückt = hört gerade zu
    set('fh-awake-btn', settings.keepAwake);
    const mic = document.getElementById('fh-voice');
    if (mic) mic.classList.toggle('is-live', listening);
    root.classList.toggle('fh-voice-on', listening && view === 'cook');
  }

  function openDrawer() {
    const rec = byId.get(cookRecipeId);
    const d = $('#fh-drawer');
    if (!rec || !d) return;
    const checks = new Set(store.get('checks.' + rec.id, []));
    d.innerHTML = `<div class="fh-scrim" data-act="drawer-close"></div>
      <div class="fh-drawer-panel">
        <div class="fh-drawer-head"><h2>Zutaten</h2><button class="fh-round" data-act="drawer-close" aria-label="Schließen">${icon('x')}</button></div>
        <ul class="fh-ingr">${rec.ingredients.map((x, i) => ingrRow(x, i, checks)).join('')}</ul>
      </div>`;
    d.hidden = false;
    root.classList.add('fh-drawer-open');
  }
  function closeDrawer() { const d = $('#fh-drawer'); if (d) d.hidden = true; root.classList.remove('fh-drawer-open'); }
  function toggleDrawer() { const d = $('#fh-drawer'); if (d && !d.hidden) closeDrawer(); else openDrawer(); }

  // Wischen im Kochmodus
  let swipe = null;
  el.cook.addEventListener('pointerdown', (e) => { swipe = e.target.closest('#fh-step') ? { x: e.clientX, y: e.clientY } : null; });
  el.cook.addEventListener('pointerup', (e) => {
    if (!swipe) return;
    const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
    swipe = null;
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1);
  });
  el.cook.addEventListener('pointercancel', () => { swipe = null; });

  // ---------- Bildschirm wachhalten ----------
  // Am Kühlschrank getestet (2026-11-08): Ein großes, sichtbares Video mit (stummer) Tonspur, das mit Ton läuft, verhindert
  // das Einschlafen (Wake-Lock-API wirkt dort nicht). keepawake-bg.mp4 liegt bildschirmfüllend über allem, mit 1 % Deckkraft
  // und ohne Klicks abzufangen, für den Nutzer also unsichtbar.
  // Regel (Wunsch des Nutzers): wach beim Kochen, bei laufendem Timer bzw. Alarm und bis 2 Minuten nach der letzten
  // Berührung in der App (auch im Einkauf-Tab). Danach darf der Kühlschrank wie gewohnt in den Standby.
  // Handy: Dort wirkt die Wake-Lock-API (iOS ab 16.4, als Home-Bildschirm-App ab 18.4). Das Video mit Ton liefe dort NICHT,
  // es würde Musik oder Podcasts anhalten. Die 2-Minuten-Regel gilt nur am Kühlschrank, das Handy sperrt sich wie gewohnt
  // selbst und bleibt nur beim Kochen, bei laufendem Timer und beim Alarm an (ein gesperrtes Handy kann nicht klingeln).
  const AWAKE_AFTER_TOUCH_MS = 2 * 60 * 1000;
  const AWAKE_VIDEO = IS_FRIDGE;
  let wakeLock = null;
  let wakeLockPending = false;
  let awakeGrace = 0; // kurz nach „Kochen starten“/Timer schon wach halten, damit die Sperre noch in der Geste angefragt wird
  const awakeVideo = () => document.getElementById('fh-awake');
  const wantAwake = () => settings.keepAwake &&
    (view === 'cook' || Date.now() < awakeGrace || timers.some((t) => !t.rung) || !el.alarm.hidden ||
      (IS_FRIDGE && Date.now() - lastInteraction < AWAKE_AFTER_TOUCH_MS));
  // Mit Ton darf ein Video erst nach einer Berührung der Seite laufen (Autoplay-Regel), danach jederzeit
  const canPlayAudible = () => !navigator.userActivation || navigator.userActivation.hasBeenActive;
  function markAwake() {
    const v = awakeVideo();
    root.classList.toggle('fh-awake-on', AWAKE_VIDEO ? !!v && !v.paused && !v.muted : !!wakeLock);
  }
  function lockScreen() {
    if (!('wakeLock' in navigator) || wakeLock || wakeLockPending || document.hidden) return;
    wakeLockPending = true;
    navigator.wakeLock.request('screen').then((l) => {
      wakeLockPending = false;
      wakeLock = l;
      l.addEventListener('release', () => { if (wakeLock === l) wakeLock = null; markAwake(); }); // auch beim Wegwischen der App
      markAwake();
    }, () => { wakeLockPending = false; });
  }
  function awakeStart() {
    lockScreen();
    if (!AWAKE_VIDEO) return;
    const v = awakeVideo();
    if (!v || document.hidden) return; // im Standby nutzt das Video nichts (und soll dann entladen bleiben)
    if (!v.getAttribute('src')) v.src = AWAKE_SRC; // nach dem Freigeben (awakeStop) neu laden
    const audible = canPlayAudible();
    if (!v.paused && (!v.muted || !audible)) return; // läuft schon (mit Ton bzw. stumm, solange Ton nicht erlaubt ist)
    v.muted = !audible;
    v.volume = 0.05;
    const p = v.play();
    if (p && p.catch) p.catch(() => { if (!v.muted) { v.muted = true; v.play().catch(() => {}); } });
  }
  // Beim Anhalten das Video ganz entladen (src entfernen): Der Mediaplayer des Kühlschranks hält sonst seine Dekoder-
  // Ressourcen, auch über den Standby hinweg – ein Kandidat für die Abstürze beim Aufwachen.
  const AWAKE_SRC = 'keepawake-bg.mp4';
  function awakeStop() {
    const v = awakeVideo();
    if (v && !v.paused) v.pause();
    if (v && v.getAttribute('src')) { v.removeAttribute('src'); v.load(); }
    if (wakeLock) { const l = wakeLock; wakeLock = null; l.release().catch(() => {}); markAwake(); }
  }
  function syncAwake() { if (wantAwake()) awakeStart(); else awakeStop(); }
  function markActive() { lastInteraction = Date.now(); syncAwake(); }
  for (const ev of ['pointerdown', 'touchstart', 'keydown', 'scroll', 'wheel']) document.addEventListener(ev, markActive, { capture: true, passive: true });
  for (const ev of ['playing', 'pause', 'volumechange']) awakeVideo().addEventListener(ev, markAwake);

  // ---------- Vorlesen ----------
  const synth = window.speechSynthesis || null;
  let deVoice = null;
  const pickVoice = () => { if (synth) deVoice = synth.getVoices().find((v) => /^de/i.test(v.lang)) || null; };
  if (synth) { pickVoice(); synth.addEventListener('voiceschanged', pickVoice); }

  const spoken = (t) => t
    .replace(/(\d)\s*[–-]\s*(\d)/g, '$1 bis $2')
    .replace(/\bca\.\s*/gi, 'circa ')
    .replace(/\bMin\./g, 'Minuten').replace(/\bStd\./g, 'Stunden').replace(/\bSek\./g, 'Sekunden')
    .replace(/\bEL\b/g, 'Esslöffel').replace(/\bTL\b/g, 'Teelöffel')
    .replace(/(\d)\s*kg\b/g, '$1 Kilogramm').replace(/(\d)\s*g\b/g, '$1 Gramm').replace(/(\d)\s*ml\b/g, '$1 Milliliter')
    .replace(/°C/g, ' Grad').replace(/\bz\.\s*B\./g, 'zum Beispiel');

  // Während der Ansage läuft die Erkennung weiter, ihre Ergebnisse werden aber ignoriert (ownVoice).
  // Früher wurde sie dafür angehalten und neu gestartet – jeder Neustart löst auf Tizen eine Mikrofon-Abfrage aus.
  let speaking = false;
  let speakEndedAt = 0;
  function speak(text) {
    if (!synth || !window.SpeechSynthesisUtterance) return;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(spoken(text));
    u.lang = 'de-DE';
    if (deVoice) u.voice = deVoice;
    u.onstart = () => { speaking = true; };
    u.onend = () => { speaking = false; speakEndedAt = Date.now(); };
    u.onerror = u.onend;
    synth.speak(u);
  }
  function readStep() {
    const rec = byId.get(cookRecipeId);
    if (rec && view === 'cook') speak(`Schritt ${cookStep}. ${rec.steps[cookStep - 1]}`);
  }

  // ---------- Sprachsteuerung (nur im Kochmodus) ----------
  // Der Tizen-Browser fragt bei jedem recognizer.start() erneut nach dem Mikrofon, solange die Erlaubnis nicht
  // dauerhaft ist. Deshalb: Start nur per Antippen. Still neu starten nur, wenn die Permissions-API „granted“ meldet.
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognizer = null;
  let listening = false;
  let userStopped = false;
  let micPermission = 'unbekannt';
  let tapHints = 0;
  let srErrors = [];
  if (navigator.permissions && navigator.permissions.query) {
    navigator.permissions.query({ name: 'microphone' }).then((st) => {
      micPermission = st.state;
      st.onchange = () => { micPermission = st.state; };
    }, () => { /* Abfrage nicht unterstützt */ });
  }
  const ownVoice = () => speaking || Date.now() - speakEndedAt < 800; // eigene Ansage nicht als Befehl werten

  function voiceStart() {
    if (!SR) { settings.voice = false; saveSettings(); updateToggles(); toast('Spracherkennung ist hier nicht verfügbar'); return; }
    if (!recognizer) {
      recognizer = new SR();
      recognizer.lang = 'de-DE';
      recognizer.continuous = true;
      recognizer.interimResults = false;
      recognizer.maxAlternatives = 1;
      recognizer.onstart = () => { listening = true; updateToggles(); };
      recognizer.onresult = (e) => {
        const r = e.results[e.results.length - 1];
        // Tizen liefert gelegentlich ein Ergebnis ohne Alternativen (r[0] fehlt) → ignorieren
        if (r && r.isFinal && r[0] && r[0].transcript && !ownVoice()) command(r[0].transcript);
      };
      recognizer.onerror = (e) => {
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
          settings.voice = false; saveSettings(); userStopped = true; toast('Mikrofon nicht erlaubt');
        } else if (e.error !== 'no-speech' && e.error !== 'aborted') srErrors.push(Date.now());
      };
      recognizer.onend = () => {
        listening = false;
        updateToggles();
        if (userStopped || !settings.voice || view !== 'cook' || document.hidden) return;
        if (micPermission !== 'granted') {
          if (tapHints++ < 2) toast('Für den nächsten Befehl das Mikrofon antippen', 3000);
          return;
        }
        srErrors = srErrors.filter((t) => Date.now() - t < 30000);
        if (srErrors.length >= 5) { settings.voice = false; saveSettings(); toast('Spracherkennung gestoppt (zu viele Fehler)'); return; }
        setTimeout(() => { if (!listening && !userStopped && view === 'cook') try { recognizer.start(); } catch { /* läuft schon */ } }, 300);
      };
    }
    userStopped = false;
    if (!listening) try { recognizer.start(); } catch { /* läuft schon */ }
  }
  function voiceStop() {
    userStopped = true;
    if (recognizer && listening) try { recognizer.abort(); } catch { /* egal */ }
  }

  function command(raw) {
    const said = raw.trim();
    const s = said.toLowerCase();
    toast(`„${said}“`, 1800);
    const shop = /^(.+?)\s+(?:auf|zur|in)\s+(?:die\s+)?einkaufsliste/.exec(s);
    if (shop) {
      const term = shop[1].replace(/^(?:bitte|setz\w*|schreib\w*|pack\w*|tu|füg\w*)\s+/g, '').trim();
      if (term) { speak(`Ich öffne den Einkauf für ${term}.`); setTimeout(() => { location.href = shopLink(term); }, 1600); }
      return;
    }
    if (/\b(weiter|nächste[rnms]?|vorwärts|next)\b/.test(s)) step(1);
    else if (/\b(zurück|vorherige[rnms]?)\b/.test(s)) step(-1);
    else if (/\b(wiederhol\w*|nochmal|noch mal|vorlesen|lies)\b/.test(s)) readStep();
    else if (/\bzutaten\b/.test(s)) toggleDrawer();
    else if (/\b(timer|wecker|stoppuhr)\b/.test(s)) startFirstTimer();
    else if (/\b(stopp?|halt|ruhe|leise|okay|ok)\b/.test(s)) { if (synth) synth.cancel(); dismissAlarm(); }
  }

  // ---------- Timer ----------
  let timers = store.get('timers', []);
  let timerSig = null;
  let alarmTicks = 0;
  const saveTimers = () => store.set('timers', timers);

  function mmss(ms) {
    const s = Math.max(0, Math.ceil(ms / 1000));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = String(s % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
  }

  function startTimer(sec, label, stepNo) {
    const rec = byId.get(cookRecipeId) || byId.get(currentId());
    const key = `${rec ? rec.id : ''}|${stepNo}|${label}`;
    if (timers.some((t) => t.key === key && !t.rung)) { toast('Dieser Timer läuft schon'); return; }
    timers.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), key, recipeId: rec ? rec.id : '', recipe: rec ? rec.name : '', step: stepNo, label, end: Date.now() + sec * 1000, rung: false });
    saveTimers();
    renderTimers(true);
    toast(`Timer läuft: ${label}`);
  }

  function startFirstTimer() {
    const chip = $('#fh-steptext .fh-timechip');
    if (chip) startTimer(+chip.dataset.sec, chip.dataset.label, +chip.dataset.step);
    else { toast('In diesem Schritt steht keine Zeit'); speak('In diesem Schritt steht keine Zeitangabe.'); }
  }

  function renderTimers(force) {
    const active = timers.filter((t) => !t.rung);
    const sig = active.map((t) => t.id).join(',') + '|' + view + '|' + cookRecipeId;
    if (force || sig !== timerSig) {
      timerSig = sig;
      el.timers.hidden = !active.length;
      root.classList.toggle('fh-has-timers', active.length > 0);
      el.timers.innerHTML = active.map((t) => {
        const label = view === 'cook' && t.recipeId === cookRecipeId ? `Schritt ${t.step}` : `${t.recipe} · Schritt ${t.step}`;
        return `<div class="fh-timer">${icon('timer')}<span class="fh-timer-label">${esc(label)}</span><span class="fh-timer-left" data-left="${t.id}"></span>
          <button class="fh-timer-x" data-act="timer-cancel" data-id="${t.id}" aria-label="Timer stoppen">${icon('x')}</button></div>`;
      }).join('');
    }
    const now = Date.now();
    for (const t of active) {
      const span = el.timers.querySelector(`[data-left="${t.id}"]`);
      if (span) span.textContent = mmss(t.end - now);
    }
  }

  function showAlarm() {
    const ringing = timers.filter((t) => t.rung);
    if (!ringing.length) { el.alarm.hidden = true; return; }
    el.alarm.innerHTML = `<div class="fh-alarm-card">${icon('timer')}<div class="fh-alarm-title">Zeit ist um!</div>
      ${ringing.map((t) => `<div class="fh-alarm-item">${esc(t.recipe)} · Schritt ${t.step} · ${esc(t.label)}</div>`).join('')}
      <button class="fh-btn fh-primary fh-wide" data-act="alarm-ok">OK</button></div>`;
    el.alarm.hidden = false;
  }
  function dismissAlarm() {
    if (!timers.some((t) => t.rung)) return;
    timers = timers.filter((t) => !t.rung);
    saveTimers();
    el.alarm.hidden = true;
    renderTimers(true);
  }

  // Signalton über Web Audio (braucht einmal eine Berührung zum Freischalten)
  let audio = null;
  function unlockAudio() {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
    } catch { audio = null; }
  }
  function beep() {
    if (!audio || audio.state !== 'running') return;
    const t0 = audio.currentTime;
    for (let i = 0; i < 3; i++) {
      const o = audio.createOscillator(), g = audio.createGain(), t = t0 + i * 0.32;
      o.type = 'sine';
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.5, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      o.connect(g).connect(audio.destination);
      o.start(t);
      o.stop(t + 0.24);
    }
  }

  function tick() {
    const clock = new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    for (const c of el.clocks) c.textContent = clock;
    if (view === 'plan' && planDay && planDay !== isoDate(new Date())) { renderPlan(); loadPlan(true); } // Mitternacht
    syncAwake(); // 2-Minuten-Regel, Timer und Alarm laufend nachführen
    if (shopFrame && view !== 'shop' && shopLeftAt && Date.now() - shopLeftAt > 5 * 60 * 1000) unloadShop();
    heartbeat();
    const now = Date.now();
    let due = null;
    for (const t of timers) if (!t.rung && now >= t.end) { t.rung = true; due = t; }
    if (due) {
      saveTimers();
      renderTimers(true);
      alarmTicks = 0;
      showAlarm();
      beep();
      speak(`Zeit ist um: ${due.recipe}, Schritt ${due.step}.`);
    } else renderTimers(false);
    if (!el.alarm.hidden && ++alarmTicks % 5 === 0 && alarmTicks <= 300) beep(); // bis zu 5 Minuten nachklingeln
  }

  // ---------- Vollbild ----------
  const fsElement = () => document.fullscreenElement || document.webkitFullscreenElement || null;
  function enterFullscreen() {
    if (fsElement()) return;
    const de = document.documentElement;
    const req = de.requestFullscreen || de.webkitRequestFullscreen;
    if (!req) return;
    try { const p = req.call(de); if (p && p.catch) p.catch(() => {}); } catch { /* ohne Geste nicht erlaubt */ }
  }
  function exitFullscreen() {
    const ex = document.exitFullscreen || document.webkitExitFullscreen;
    if (ex && fsElement()) ex.call(document);
  }
  function onFullscreenChange() {
    root.classList.toggle('fh-fs', !!fsElement()); // im Vollbild wird der Vollbild-Knopf ausgeblendet
    setTimeout(fitStep, 300);
  }
  document.addEventListener('fullscreenchange', onFullscreenChange);
  document.addEventListener('webkitfullscreenchange', onFullscreenChange);

  // ---------- Bedienung ----------
  // Jede Berührung: Audio freischalten, auf dem Kühlschrank ins Vollbild, Wachhalte-Video ggf. mit Ton neu starten.
  // Nicht bei Links, die die Seite verlassen (Einkauf): Vollbild würde dort sofort wieder enden.
  // Samsung/Tizen: langes Drücken öffnet sonst das Browser-Kontextmenü (Kopieren/Teilen), Bilder ließen sich ziehen
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('dragstart', (e) => e.preventDefault());

  document.addEventListener('click', (e) => {
    unlockAudio();
    tryFullscreen(e);
    // Kochen oder Timer starten: Bildschirmsperre jetzt anfragen, solange die Berührung als Geste gilt (Safari)
    if (e.target.closest && e.target.closest('[data-act="cook"], [data-act="cook-at"], [data-act="resume"], [data-act="timer"]')) {
      awakeGrace = Date.now() + 3000;
    }
    markActive(); // Wachhalte-Video bzw. Wake Lock ggf. starten
  }, true);

  // Vollbild schon bei der ERSTEN Berührung, nicht erst beim Antippen: Der Kühlschrank meldet seinen Touchscreen als Maus,
  // und pointerdown/mousedown einer Maus zählen als Benutzergeste – auch wenn daraus ein Scrollen wird.
  function tryFullscreen(e) {
    if (!IS_FRIDGE || !autoFs || fsElement()) return;
    const t = e && e.target;
    if (t && t.closest && t.closest('[data-act="fs"], a[href^="http"]')) return;
    enterFullscreen();
  }
  for (const ev of ['pointerdown', 'mousedown', 'touchend', 'keydown']) document.addEventListener(ev, tryFullscreen, true);

  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-act]');
    if (!t) return;
    const id = currentId();
    switch (t.dataset.act) {
      case 'fs':
        if (fsElement()) { autoFs = false; exitFullscreen(); } else { autoFs = true; enterFullscreen(); }
        break;
      case 'top':
        if (view === 'home') { e.preventDefault(); document.getElementById('fh-app').scrollTo({ top: 0, behavior: 'smooth' }); }
        break;
      case 'cat': filterCategory(+t.dataset.cat); break;
      case 'search': toggleSearch(!searchOpen()); break;
      case 'toggle-recent': el.home.toggleAttribute('data-show-recent'); applyCooked(); break;
      case 'cooked-on': markCooked(id, true, t); break;
      case 'cooked-off': markCooked(id, false, t); break;
      case 'resume': {
        const s = session();
        if (s) location.hash = `#/r/${s.id}/k/${s.step}`;
        break;
      }
      case 'close-recipe': goBack(recipeParent()); break;
      case 'pv-top': // Planen-Tab erneut antippen: nach oben und auffrischen
        if (view === 'plan') { e.preventDefault(); el.pv.scrollTo({ top: 0, behavior: 'smooth' }); loadPlan(false); }
        break;
      case 'pv-refresh': loadPlan(true); break;
      case 'pv-day': tapPlanDay(t); break;
      case 'pv-move': startMove(t.dataset.id, t.dataset.day); break;
      case 'pv-move-cancel': cancelMove(); break;
      case 'pv-remove': doRemove(); break;
      case 'pv-undo': undoMove(); break;
      case 'pv-foreign': toast('Rezept aus dem Cookidoo-Katalog – am Thermomix unter „Meine Woche“', 3200); break;
      case 'ingr': toggleIngredient(t); break;
      case 'ck-open': openPlan(); break;
      case 'ck-close': closePlan(); break;
      case 'ck-day': togglePlanDay(t); break;
      case 'reset-checks': {
        const sc = $('#fh-rscroll');
        if (sc) recipeScroll = { id, top: sc.scrollTop };
        store.del('checks.' + id);
        showRecipe(byId.get(id));
        break;
      }
      case 'cook': {
        const s = session();
        location.hash = `#/r/${id}/k/${s && s.id === id ? s.step : 1}`;
        break;
      }
      case 'cook-at': location.hash = `#/r/${id}/k/${t.dataset.step}`; break;
      case 'close-cook': goBack('#/r/' + id); break;
      case 'prev': step(-1); break;
      case 'next': step(1); break;
      case 'read':
        settings.autoRead = !settings.autoRead;
        saveSettings();
        updateToggles();
        if (settings.autoRead) readStep(); else if (synth) synth.cancel();
        toast(settings.autoRead ? 'Schritte werden vorgelesen' : 'Vorlesen aus');
        break;
      case 'voice': // Antippen startet bzw. beendet das Zuhören
        if (listening) { settings.voice = false; saveSettings(); voiceStop(); toast('Sprachsteuerung aus'); }
        else { settings.voice = true; saveSettings(); voiceStart(); toast('Ich höre zu – sag z. B. „weiter“'); }
        updateToggles();
        break;
      case 'drawer': toggleDrawer(); break;
      case 'drawer-close': closeDrawer(); break;
      case 'awake':
        settings.keepAwake = !settings.keepAwake;
        saveSettings();
        syncAwake();
        updateToggles();
        toast(settings.keepAwake ? 'Bildschirm bleibt beim Kochen an' : 'Bildschirm darf einschlafen');
        break;
      case 'timer': startTimer(+t.dataset.sec, t.dataset.label, +t.dataset.step); break;
      case 'timer-cancel':
        timers = timers.filter((x) => x.id !== t.dataset.id);
        saveTimers();
        renderTimers(true);
        break;
      case 'alarm-ok': dismissAlarm(); if (synth) synth.cancel(); break;
      case 'reload': location.reload(); break;
    }
  });

  // Tastatur (zum Testen am Mac)
  document.addEventListener('keydown', (e) => {
    if (view === 'cook' && e.key === 'ArrowRight') step(1);
    else if (view === 'cook' && e.key === 'ArrowLeft') step(-1);
    else if (e.key === 'Escape') {
      const d = $('#fh-drawer'), p = $('#fh-plan');
      if (view === 'plan' && pvMove) cancelMove();
      else if (d && !d.hidden) closeDrawer();
      else if (p && !p.hidden) closePlan();
      else if (view === 'cook') goBack('#/r/' + cookRecipeId);
      else if (view === 'recipe') goBack(recipeParent());
      else if (view === 'home' && searchOpen()) toggleSearch(false);
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { goingToSleep(); return; }
    lastInteraction = Date.now(); // Aufwecken per Berührung → wieder 2 Minuten wach
    syncAwake();
    refreshBadge();
    if (view === 'shop' && !shopFrame) showShop(''); // Einkauf wurde im Standby entladen
    if (view === 'plan') loadPlan(false);
    // Ohne dauerhafte Mikrofon-Erlaubnis nicht automatisch starten – das würde eine Abfrage aus heiterem Himmel öffnen
    if (view === 'cook' && settings.voice && micPermission === 'granted') voiceStart();
  });
  window.addEventListener('resize', () => { if (view === 'cook') fitStep(); });
  window.addEventListener('hashchange', route);

  // ---------- Automatisches Update ----------
  // generate.sh schreibt die Build-Kennung in index.html (window.FRIDGE_BUILD) und in version.json. Die App prüft alle
  // 3 Minuten und nach dem Aufwachen. Bei neuer Version lädt sie sich auf der Startseite selbst neu, sobald 20 s niemand
  // getippt hat. Sonst passiert das beim nächsten Wechsel zur Startseite (Kochen, Timer usw. überstehen das Neuladen).
  let pendingVersion = null;
  function checkUpdate() {
    if (!BUILD.v || BUILD.v.indexOf('__') === 0) return; // lokaler Build ohne Kennung
    fetch('version.json?t=' + Date.now(), { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((v) => { if (v && v.v && v.v !== BUILD.v) { pendingVersion = v.v; applyUpdate(); } }, () => {});
  }
  function applyUpdate() {
    // Bei einer laufenden Suche länger warten (2 min), sonst verschwinden die Treffer womöglich beim Lesen
    const quiet = el.home.dataset.q ? 120000 : 20000;
    // Auch im Planen-Tab: Der Kühlschrank kann dort lange stehen, das Neuladen behält die Hash-Route
    if (!pendingVersion || (view !== 'home' && view !== 'plan') || !el.alarm.hidden || Date.now() - lastInteraction < quiet) return;
    // Nur ein Versuch pro Version: Liefert ein Cache noch die alte Seite, entsteht keine Neulade-Schleife
    let tried = null;
    try { tried = sessionStorage.getItem('fridge.reloadFor'); sessionStorage.setItem('fridge.reloadFor', pendingVersion); } catch { /* egal */ }
    if (tried === pendingVersion) { pendingVersion = null; return; }
    // Neue Kennung in der Adresse → die Startseite wird garantiert frisch geladen (an keinem Cache vorbei)
    location.replace(location.pathname + '?b=' + encodeURIComponent(pendingVersion) + location.hash);
  }
  setInterval(checkUpdate, 3 * 60 * 1000);
  setInterval(applyUpdate, 15 * 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkUpdate(); });

  // ---------- Standby, Speicher und Absturz-Protokoll ----------
  // Am Kühlschrank erschien alle paar Stunden beim Aufwachen „Renderer process has crashed!“. Wahrscheinlich beendet Tizen im
  // Standby den Tab, um Speicher zu holen (2 GB RAM). Deshalb beim Einschlafen alles Schwere freigeben, und läuft die Seite schon
  // länger als 2 h, still neu laden (frische Seite = wenig Speicher), solange nicht gekocht wird und kein Timer läuft.
  const T_LOAD = Date.now();
  const LOAD_ID = T_LOAD.toString(36);
  function goingToSleep() {
    awakeStop();
    unloadShop();
    heartbeat(true);
    const busy = view === 'cook' || timers.some((t) => !t.rung) || !el.alarm.hidden;
    if (!busy && Date.now() - T_LOAD > 2 * 3600 * 1000) location.reload();
  }
  // Absturz-Erkennung: Jede Minute ein Lebenszeichen, beim regulären Verlassen (pagehide) ein „sauber beendet“. Fehlt das beim
  // nächsten Start, ist die vorige Seite abgestürzt bzw. vom System beendet worden. Protokoll: fridge.crashes, fridge.memlog
  // (liest die Diagnose-Seite mit aus).
  (function detectCrash() {
    const alive = store.get('alive', null), clean = store.get('clean', null);
    if (alive && alive.id !== clean) {
      const crashes = store.get('crashes', []);
      crashes.push({ zuletztLebend: new Date(alive.t).toISOString(), laufzeitMin: alive.up, heapMB: alive.heap, ansicht: alive.view,
        verdeckt: alive.hidden, video: alive.video, einkauf: alive.shop, neustart: new Date().toISOString() });
      store.set('crashes', crashes.slice(-20));
    }
  })();
  let lastBeat = 0, lastLog = 0;
  function heartbeat(force) {
    const now = Date.now();
    if (!force && now - lastBeat < 60000) return;
    lastBeat = now;
    const m = window.performance && performance.memory;
    const v = awakeVideo();
    const s = { id: LOAD_ID, t: now, up: Math.round((now - T_LOAD) / 60000), heap: m ? Math.round(m.usedJSHeapSize / 1048576) : null,
      view, hidden: document.hidden, video: !!(v && v.getAttribute('src')), shop: !!shopFrame };
    store.set('alive', s);
    if (now - lastLog >= 5 * 60000) { // Speicherverlauf alle 5 min, die letzten 48 Einträge (4 h)
      lastLog = now;
      store.set('memlog', store.get('memlog', []).concat([s]).slice(-48));
    }
  }
  window.addEventListener('pagehide', () => store.set('clean', LOAD_ID));

  // ---------- Start ----------
  tick();
  setInterval(tick, 1000);
  showAlarm(); // Timer, die abgelaufen sind, während die Seite neu geladen wurde
  load();
})();
