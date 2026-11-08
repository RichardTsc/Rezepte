/* Kühlschrank-Modus der Rezepte-App.
   Ziel: Samsung Family Hub (Tizen 7, Chromium 108, 721×1230 CSS-px, Touch meldet sich als Maus, langsame CPU).
   Aktiv nur, wenn index.html <html class="fridge"> gesetzt hat (UA „Family Hub“ oder ?fridge).
   Hintergründe und Messwerte: FAMILY_HUB.md im Projektordner. */
(() => {
  'use strict';

  const root = document.documentElement;
  if (!root.classList.contains('fridge')) return;

  const IS_FRIDGE = /Family Hub/.test(navigator.userAgent);
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
  const settings = Object.assign({ autoRead: false, voice: false, keepAwake: false }, store.get('settings', {}));
  const saveSettings = () => store.set('settings', settings);
  if (settings.v !== 2) { // v2: Wachhalte-Video hat am Gerät nicht geholfen → standardmäßig aus; autoFs nicht mehr dauerhaft
    settings.keepAwake = false;
    delete settings.autoFs;
    settings.v = 2;
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
  };
  const icon = (name) => `<svg class="fh-ic" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;
  const pill = (name, text) => (text ? `<span class="fh-pill">${icon(name)}${esc(text)}</span>` : '');

  function fmtTime(t) {
    const s = String(t || '').trim();
    let m;
    if ((m = /^(\d+)\s*(?:min|minuten)$/i.exec(s))) return `${m[1]} Min.`;
    if ((m = /^(\d+)\s*[–-]\s*(\d+)\s*(?:min|minuten)$/i.exec(s))) return `${m[1]}–${m[2]} Min.`;
    if ((m = /^(\d+(?:[.,]\d+)?)\s*h$/i.exec(s))) return `${m[1]} Std.`;
    return s;
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
    <div id="fh-app">
      <div class="fh-sticky">
        <header class="fh-top">
          <div class="fh-brand">Rezepte<span class="fh-dot">.</span></div>
          <div class="fh-clock" id="fh-clock"></div>
          <button class="fh-round" data-act="fs" aria-label="Vollbild">${icon('fullscreen')}</button>
        </header>
        <nav class="fh-chips" id="fh-chips"></nav>
      </div>
      <div id="fh-resume"></div>
      <main id="fh-home"><p class="fh-msg">Rezepte werden geladen …</p></main>
      <nav class="fh-dock" aria-label="Bereiche"><div class="fh-dock-inner">
        <a class="fh-tab is-active" id="fh-tab-rezepte" href="#/" data-act="top">${icon('book')}Rezepte</a>
        <a class="fh-tab" id="fh-tab-einkauf" href="${shopLink('')}">${icon('cart')}Einkauf<span class="fh-badge" id="fh-shop-badge" hidden></span></a>
      </div></nav>
    </div>
    <section class="fh-layer" id="fh-recipe" hidden></section>
    <section class="fh-layer fh-cook" id="fh-cook" hidden></section>
    <section class="fh-shop" id="fh-shop" hidden></section>
    <div class="fh-timers" id="fh-timers" hidden></div>
    <div class="fh-alarm" id="fh-alarm" hidden></div>
    <div class="fh-toast" id="fh-toast" hidden></div>`);

  const el = {
    home: $('#fh-home'), chips: $('#fh-chips'), resume: $('#fh-resume'), recipe: $('#fh-recipe'), cook: $('#fh-cook'), shop: $('#fh-shop'),
    timers: $('#fh-timers'), alarm: $('#fh-alarm'), toast: $('#fh-toast'), clock: $('#fh-clock'),
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

  function load() {
    fetch('recipes.json', { cache: 'no-cache' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status))))
      .then((data) => {
        recipes = data.recipes || [];
        byId = new Map(recipes.map((r) => [r.id, r]));
        renderHome();
        route();
        // Einkauf im Hintergrund vorladen (Badge mit Korb-Anzahl, Tab-Wechsel ohne Ladezeit) – erst wenn die Startseite steht
        if (EMBED_SHOP) setTimeout(() => ensureShopFrame(''), 3000);
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
  function renderHome() {
    const cats = [];
    for (const r of recipes) if (!cats.includes(r.category)) cats.push(r.category);
    el.chips.innerHTML = `<button class="fh-chip is-active" data-act="cat" data-cat="-1">Alle<span>${recipes.length}</span></button>` +
      cats.map((c, i) => `<button class="fh-chip" data-act="cat" data-cat="${i}">${esc(c)}</button>`).join('');
    el.home.innerHTML = `<div class="fh-grid">${recipes.map((r) => card(r, cats.indexOf(r.category))).join('')}</div>
      <button class="fh-version" data-act="reload">Stand ${esc(BUILD.t || '?')} · ${esc(BUILD.v)} · antippen zum Neuladen</button>`;
  }

  function filterCategory(i) {
    for (const chip of el.chips.children) chip.classList.toggle('is-active', +chip.dataset.cat === i);
    for (const a of el.home.querySelectorAll('.fh-card')) a.hidden = i >= 0 && +a.dataset.cat !== i;
    window.scrollTo(0, 0);
  }

  const shortTime = (t) => fmtTime(t).replace(/\s*Min\.?$/, '′').replace(/\s*Std\.?$/, ' h');
  const card = (r, cat) => `
    <a class="fh-card" href="#/r/${r.id}" data-cat="${cat}">
      ${r.thumb ? `<img src="${esc(r.thumb)}" alt="" loading="lazy" decoding="async">` : ''}
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
    return { view: 'home' };
  }

  // Einkauf als Tab: das iframe bleibt bestehen (Zustand, keine Ladezeit). Absprache mit dem Einkaufs-Dienst per postMessage
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
    else if (e.data.typ === 'einkauf:anzahl') {
      const n = Math.max(0, parseInt(e.data.anzahl, 10) || 0);
      const badge = $('#fh-shop-badge');
      badge.textContent = n > 99 ? '99+' : String(n);
      badge.hidden = !n;
    }
  });

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

    if (view === 'recipe' && r.view !== 'recipe') {
      const sc = $('#fh-rscroll');
      if (sc) recipeScroll = { id: parseHashId(prev), top: sc.scrollTop };
    }
    if (r.view === 'cook') {
      el.recipe.hidden = true;
      el.shop.hidden = true;
      showCook(rec, r.step);
    } else {
      if (view === 'cook') leaveCook();
      el.cook.hidden = true;
      el.recipe.hidden = r.view !== 'recipe';
      el.shop.hidden = r.view !== 'shop';
      if (r.view === 'recipe') showRecipe(rec);
      else if (r.view === 'shop') showShop(r.term);
      else { recipeScroll = { id: null, top: 0 }; renderResume(); }
    }
    view = r.view;
    root.setAttribute('data-fh-view', view);
    $('#fh-tab-rezepte').classList.toggle('is-active', view !== 'shop');
    $('#fh-tab-einkauf').classList.toggle('is-active', view === 'shop');
    renderTimers(true);
  }
  const parseHashId = (hash) => { const m = /^#\/r\/([a-z0-9-]+)/.exec(hash || ''); return m ? m[1] : null; };

  function goBack(parentHash) {
    if (history.state && history.state.from === parentHash) history.back();
    else location.replace(parentHash);
  }
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
          ${cookidooBlock(rec)}
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
      <div class="fh-bar">${cookidooButton(rec)}<button class="fh-btn fh-primary fh-wide" data-act="cook"${rec.steps.length ? '' : ' disabled'}>${icon('play')}${resumeStep ? `Weiter bei Schritt ${resumeStep}` : 'Kochen starten'}</button></div>
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
  //   GET  /cookidoo/api/geplant?von=YYYY-MM-DD&tage=9  → { tage: { 'YYYY-MM-DD': ['<id>', …] } }
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
  function cookidooBlock(rec) {
    if (!rec.cookidoo) return `<div class="fh-ck"><span class="fh-tag fh-tag-todo">${icon('cal')}Muss noch in Cookidoo angelegt werden</span></div>`;
    if (!ckCanPlan(rec)) return `<div class="fh-ck"><span class="fh-tag">${icon('cal')}In Cookidoo angelegt</span></div>`;
    return '';
  }
  const cookidooButton = (rec) => (ckCanPlan(rec) ? `<button class="fh-btn fh-ck-btn" data-act="ck-open">${icon('cal')}In Cookidoo planen</button>` : '');
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
  function openPlan() {
    const rec = byId.get(currentId());
    const panel = $('#fh-plan');
    if (!rec || !rec.cookidoo || !panel) return;
    const days = nextDays(PLAN_DAYS);
    panel.innerHTML = `<div class="fh-scrim" data-act="ck-close"></div>
      <div class="fh-drawer-panel">
        <div class="fh-drawer-head"><h2>In Cookidoo planen</h2><button class="fh-round" data-act="ck-close" aria-label="Schließen">${icon('x')}</button></div>
        <p class="fh-ck-hint">Erscheint am Thermomix unter „Meine Woche“. Nochmal antippen nimmt es wieder heraus.</p>
        <div class="fh-ck-days">${days.map((d) => `<button class="fh-chip fh-ck-day" data-act="ck-day" data-date="${d.iso}">${esc(d.label)}</button>`).join('')}</div>
        <p class="fh-ck-status" id="fh-ck-status">Lade Wochenplan …</p>
      </div>`;
    panel.hidden = false;
    root.classList.add('fh-drawer-open');
    ckFetch(`geplant?von=${days[0].iso}&tage=${PLAN_DAYS}`).then((data) => {
      const tage = (data && data.tage) || {};
      for (const b of panel.querySelectorAll('.fh-ck-day')) b.classList.toggle('is-active', (tage[b.dataset.date] || []).includes(rec.cookidoo));
      $('#fh-ck-status').textContent = '';
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
        toast(planned ? `Aus „Meine Woche“ entfernt: ${btn.textContent}` : `In Cookidoo geplant: ${btn.textContent}`);
      }, (err) => toast(err.message, 3500))
      .finally(() => { btn.disabled = false; });
  }

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
          <button class="fh-awake-btn" data-act="awake" id="fh-awake-btn" aria-label="Bildschirm wachhalten">
            <video class="fh-awake" id="fh-awake" src="keepawake.mp4" loop playsinline preload="auto" disablepictureinpicture></video></button>
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
    let size = 38;
    text.style.fontSize = size + 'px';
    while (size > 22 && box.scrollHeight > box.clientHeight + 1) {
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
    toast('Guten Appetit!');
    goBack('#/r/' + rec.id);
  }

  function enterCook() {
    root.classList.add('fh-cooking');
    updateToggles();
    awakeStart();
    // Ohne dauerhafte Mikrofon-Erlaubnis nicht automatisch starten – das würde eine Abfrage aus heiterem Himmel öffnen
    if (settings.voice && micPermission === 'granted') voiceStart();
  }

  function leaveCook() {
    root.classList.remove('fh-cooking');
    awakeStop();
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

  // ---------- Bildschirm wachhalten (Experiment) ----------
  // Chromium hält den Bildschirm an, solange ein sichtbares Video MIT Ton läuft (video_wake_lock.cc).
  // keepawake.mp4 hat eine stumme Tonspur und läuft deshalb unstumm. Ob Tizen das beachtet, ist offen (FAMILY_HUB.md).
  let wakeLock = null;
  function awakeStart() {
    updateToggles();
    const v = $('#fh-awake');
    if (!settings.keepAwake || !v) return;
    v.muted = false;
    v.volume = 0.05;
    const p = v.play();
    if (p && p.catch) p.catch(() => { v.muted = true; v.play().catch(() => {}); }); // ohne Benutzergeste nur stumm erlaubt
    if ('wakeLock' in navigator && !wakeLock) {
      navigator.wakeLock.request('screen').then((l) => { wakeLock = l; l.addEventListener('release', () => { wakeLock = null; }); }, () => {});
    }
  }
  function awakeStop() {
    const v = $('#fh-awake');
    if (v) v.pause();
    if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
  }

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
        if (r && r.isFinal && !ownVoice()) command(r[0].transcript);
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
    el.clock.textContent = new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
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
    lastInteraction = Date.now();
    unlockAudio();
    if (IS_FRIDGE && autoFs && !e.target.closest('[data-act="fs"], a[href^="http"]')) enterFullscreen();
    const v = $('#fh-awake');
    if (view === 'cook' && settings.keepAwake && v && (v.paused || v.muted)) awakeStart();
  }, true);

  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-act]');
    if (!t) return;
    const id = currentId();
    switch (t.dataset.act) {
      case 'fs':
        if (fsElement()) { autoFs = false; exitFullscreen(); } else { autoFs = true; enterFullscreen(); }
        break;
      case 'top':
        if (view === 'home') { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
        break;
      case 'cat': filterCategory(+t.dataset.cat); break;
      case 'resume': {
        const s = session();
        if (s) location.hash = `#/r/${s.id}/k/${s.step}`;
        break;
      }
      case 'close-recipe': goBack('#/'); break;
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
        if (settings.keepAwake) awakeStart(); else { awakeStop(); updateToggles(); }
        toast(settings.keepAwake ? 'Bildschirm wachhalten: an (Experiment)' : 'Bildschirm wachhalten: aus');
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
      if (d && !d.hidden) closeDrawer();
      else if (p && !p.hidden) closePlan();
      else if (view === 'cook') goBack('#/r/' + cookRecipeId);
      else if (view === 'recipe') goBack('#/');
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden || view !== 'cook') return;
    awakeStart();
    // Ohne dauerhafte Mikrofon-Erlaubnis nicht automatisch starten – das würde eine Abfrage aus heiterem Himmel öffnen
    if (settings.voice && micPermission === 'granted') voiceStart();
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
    if (!pendingVersion || view !== 'home' || !el.alarm.hidden || Date.now() - lastInteraction < 20000) return;
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

  // ---------- Start ----------
  tick();
  setInterval(tick, 1000);
  showAlarm(); // Timer, die abgelaufen sind, während die Seite neu geladen wurde
  load();
})();
