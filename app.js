/* ===== Constants & helpers ===== */

const APP_VERSION = '1.5.0';

const GOLD = '#c9a463';
const GAIN = '#5fb88c';
const LOSS = '#c2584f';
const MUTED = '#8f8aa8';
const LINE = '#322f45';
const INK = '#ece8f5';
const SURFACE = '#1e1c2a';

const STORE_KEYS = {
  collection: 'mtg_collection',
  priceHistory: 'mtg_priceHistory',
  portfolioHistory: 'mtg_portfolioHistory',
  settings: 'mtg_settings',
};

const fmtEUR = (n) => {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n);
};

const todayISO = () => new Date().toISOString().slice(0, 10);

const uid = () =>
  (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2);

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str == null ? '' : String(str);
  return d.innerHTML;
}

function safeParse(str, fallback) {
  if (!str) return fallback;
  try { return JSON.parse(str); } catch (e) { return fallback; }
}

/* ===== State ===== */

let state = { collection: [], priceHistory: {}, portfolioHistory: [], settings: { alertThreshold: 10 } };

function loadState() {
  return {
    collection: safeParse(localStorage.getItem(STORE_KEYS.collection), []),
    priceHistory: safeParse(localStorage.getItem(STORE_KEYS.priceHistory), {}),
    portfolioHistory: safeParse(localStorage.getItem(STORE_KEYS.portfolioHistory), []),
    settings: safeParse(localStorage.getItem(STORE_KEYS.settings), { alertThreshold: 10 }),
  };
}

function persist(key) {
  try {
    localStorage.setItem(STORE_KEYS[key], JSON.stringify(state[key]));
  } catch (e) {
    console.error('Sauvegarde locale impossible', e);
  }
}

/* ===== Shared: card confirmation preview (used by search + scanner) ===== */

function cardConfirmHTML(card) {
  const img = card.image_uris?.small || card.card_faces?.[0]?.image_uris?.small;
  const priceEur = card.prices?.eur ? parseFloat(card.prices.eur) : null;
  const priceFoil = card.prices?.eur_foil ? parseFloat(card.prices.eur_foil) : null;
  return `
    <div class="card-preview">
      ${img ? `<img src="${img}" alt="">` : `<div class="card-thumb-placeholder"></div>`}
      <div style="flex:1; min-width:0;">
        <div style="font-weight:500;">${escapeHtml(card.name)}</div>
        <div class="text-muted" style="margin-bottom:8px;">${escapeHtml(card.set_name || '')} · ${(card.set || '').toUpperCase()}</div>
        <div style="font-family:var(--font-mono); font-size:12px; margin-bottom:10px;">
          <span style="color:var(--gold);">Normal : ${fmtEUR(priceEur)}</span>
          ${priceFoil ? `<span style="color:var(--gold); margin-left:10px;">Foil : ${fmtEUR(priceFoil)}</span>` : ''}
        </div>
        <div style="display:flex; flex-wrap:wrap; align-items:center; gap:10px;">
          <label class="text-muted" style="font-size:12px; display:flex; align-items:center; gap:4px;">
            Qté <input type="number" min="1" value="1" class="input qty-input" style="width:60px; padding:6px 8px;">
          </label>
          <label class="text-muted" style="font-size:12px; display:flex; align-items:center; gap:4px;">
            <input type="checkbox" class="foil-input"> Foil
          </label>
          <button type="button" class="btn-gold add-btn" style="padding:8px 12px; font-size:13px;">+ Ajouter</button>
          <button type="button" class="btn-ghost cancel-btn" style="padding:8px 12px; font-size:13px;">Annuler</button>
        </div>
      </div>
    </div>
  `;
}

function openCardConfirm(card, containerEl, onDone) {
  containerEl.innerHTML = cardConfirmHTML(card);
  containerEl.hidden = false;
  const addBtn = containerEl.querySelector('.add-btn');
  const cancelBtn = containerEl.querySelector('.cancel-btn');
  const qtyInput = containerEl.querySelector('.qty-input');
  const foilInput = containerEl.querySelector('.foil-input');

  addBtn.addEventListener('click', () => {
    addCardToCollection(card, qtyInput.value, foilInput.checked);
    containerEl.hidden = true;
    containerEl.innerHTML = '';
    if (onDone) onDone();
  });
  cancelBtn.addEventListener('click', () => {
    containerEl.hidden = true;
    containerEl.innerHTML = '';
    if (onDone) onDone();
  });
}

/* ===== Multi-printing resolution (same name, different editions) ===== */

async function resolvePrintings(name) {
  // Scoped to English prints: Cardmarket pricing is most reliable there, and the
  // artwork is identical across languages so visual matching still works fine
  // even if the physical card the user owns is in French, German, etc.
  const q = encodeURIComponent(`!"${name}" lang:en`);
  const res = await fetch(`https://api.scryfall.com/cards/search?q=${q}&unique=prints&order=released&dir=desc`);
  if (!res.ok) throw new Error('search failed');
  const data = await res.json();
  return data.data || [];
}

function printingThumb(p) {
  return p.image_uris?.small || p.card_faces?.[0]?.image_uris?.small || '';
}

function openPrintingPicker(printings, containerEl, onPick, highlightId) {
  containerEl.innerHTML = `
    <div class="section-eyebrow">⚠ ${printings.length} éditions trouvées — laquelle as-tu ?</div>
    <div class="printing-grid">
      ${printings.map(p => `
        <button type="button" class="printing-item${p.id === highlightId ? ' likely' : ''}" data-id="${p.id}">
          ${p.id === highlightId ? '<span class="likely-badge">Probable</span>' : ''}
          <img src="${printingThumb(p)}" alt="">
          <div class="printing-label">${escapeHtml(p.set_name)}<br><span class="text-muted">${(p.set || '').toUpperCase()}${p.released_at ? ' · ' + p.released_at.slice(0, 4) : ''}</span></div>
        </button>
      `).join('')}
    </div>
    <button type="button" class="btn-ghost cancel-printing" style="margin-top:10px;">Annuler</button>
  `;
  containerEl.hidden = false;
  containerEl.querySelectorAll('.printing-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const card = printings.find(p => p.id === btn.dataset.id);
      if (card) onPick(card);
    });
  });
  containerEl.querySelector('.cancel-printing').addEventListener('click', () => {
    containerEl.hidden = true;
    containerEl.innerHTML = '';
  });
}

/* ===== Lightweight perceptual hash (for auto-ranking editions from a photo) ===== */

function loadImageEl(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function computeAHash(imgLike, size = 16) {
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d');
  ctx.drawImage(imgLike, 0, 0, size, size);
  const data = ctx.getImageData(0, 0, size, size).data;
  const gray = [];
  let sum = 0;
  for (let i = 0; i < data.length; i += 4) {
    const g = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    gray.push(g);
    sum += g;
  }
  const avg = sum / gray.length;
  let hash = '';
  for (const g of gray) hash += (g >= avg ? '1' : '0');
  return hash;
}

function hammingDistance(a, b) {
  let d = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) if (a[i] !== b[i]) d++;
  return d + Math.abs(a.length - b.length);
}

// Compares the photographed art region against each candidate printing's
// art crop from Scryfall, and returns the id of the closest visual match.
async function rankPrintingsByArt(sourceCanvas, artX, artY, artW, artH, printings) {
  let capHash;
  try {
    const capCanvas = document.createElement('canvas');
    capCanvas.width = artW; capCanvas.height = artH;
    capCanvas.getContext('2d').drawImage(sourceCanvas, artX, artY, artW, artH, 0, 0, artW, artH);
    capHash = computeAHash(capCanvas);
  } catch (e) {
    return null;
  }

  let bestId = null;
  let bestDist = Infinity;
  const limited = printings.slice(0, 40); // keep runtime reasonable for heavily-reprinted cards
  for (const p of limited) {
    const artUrl = p.image_uris?.art_crop || p.card_faces?.[0]?.image_uris?.art_crop;
    if (!artUrl) continue;
    try {
      const img = await loadImageEl(artUrl);
      const hash = computeAHash(img);
      const dist = hammingDistance(capHash, hash);
      if (dist < bestDist) { bestDist = dist; bestId = p.id; }
    } catch (e) { /* image failed to load or CORS-blocked: skip this candidate */ }
  }
  return bestId;
}

/* ===== Collector number / set code OCR (bottom-left of the card) ===== */

async function ocrCollectorArea(sourceCanvas, infoX, infoY, infoW, infoH) {
  if (!window.Tesseract) return '';
  try {
    const scale = 4;
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(infoW * scale));
    c.height = Math.max(1, Math.round(infoH * scale));
    const cx = c.getContext('2d');
    cx.imageSmoothingEnabled = true;
    cx.drawImage(sourceCanvas, infoX, infoY, infoW, infoH, 0, 0, c.width, c.height);
    const { data: { text } } = await Tesseract.recognize(c.toDataURL('image/png'), 'eng+fra');
    return (text || '').toUpperCase();
  } catch (e) {
    return '';
  }
}

function matchPrintingByCollectorText(rawText, printings) {
  if (!rawText) return null;
  for (const p of printings) {
    const setCode = (p.set || '').toUpperCase();
    const num = (p.collector_number || '').toUpperCase();
    if (!setCode || !num) continue;
    const numNoZeros = num.replace(/^0+/, '') || num;
    if (rawText.includes(setCode) && (rawText.includes(num) || rawText.includes(numNoZeros))) {
      return p;
    }
  }
  return null;
}

function addCardToCollection(scryfallCard, qty, foil) {
  const imageUrl = scryfallCard.image_uris?.small
    || scryfallCard.card_faces?.[0]?.image_uris?.small
    || null;
  const newCard = {
    id: uid(),
    scryfallId: scryfallCard.id,
    name: scryfallCard.name,
    setCode: (scryfallCard.set || '').toUpperCase(),
    setName: scryfallCard.set_name || '',
    releasedAt: scryfallCard.released_at || null,
    imageUrl,
    foil: !!foil,
    quantity: Math.max(1, Number(qty) || 1),
    dateAdded: new Date().toISOString(),
  };
  state.collection.push(newCard);

  const priceEur = scryfallCard.prices?.eur ? parseFloat(scryfallCard.prices.eur) : null;
  const priceEurFoil = scryfallCard.prices?.eur_foil ? parseFloat(scryfallCard.prices.eur_foil) : null;
  state.priceHistory[newCard.id] = [{ date: todayISO(), price: priceEur, priceFoil: priceEurFoil }];

  persist('collection');
  persist('priceHistory');
  renderAll();
}

function removeCard(id) {
  state.collection = state.collection.filter(c => c.id !== id);
  delete state.priceHistory[id];
  persist('collection');
  persist('priceHistory');
  renderAll();
}

/* ===== Tabs ===== */

function switchTab(name) {
  document.querySelectorAll('nav.tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.tab-section').forEach(s => s.classList.toggle('active', s.id === `tab-${name}`));
  if (name !== 'scanner') stopCamera();
  if (name === 'evolution') renderEvolution();
}

/* ===== Collection tab: search & add ===== */

let searchInput, suggestionsBox, searchIdle, searchPreview, searchErrorEl, searchLoadingEl;
let searchDebounce = null;

function initCollectionTab() {
  searchInput = document.getElementById('search-input');
  suggestionsBox = document.getElementById('suggestions');
  searchIdle = document.getElementById('search-idle');
  searchPreview = document.getElementById('search-preview');
  searchErrorEl = document.getElementById('search-error');
  searchLoadingEl = document.getElementById('search-loading');

  searchInput.addEventListener('input', () => {
    const q = searchInput.value.trim();
    searchErrorEl.hidden = true;
    clearTimeout(searchDebounce);
    if (q.length < 2) { suggestionsBox.hidden = true; suggestionsBox.innerHTML = ''; return; }
    searchDebounce = setTimeout(() => fetchSuggestions(q), 300);
  });

  suggestionsBox.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-name]');
    if (!btn) return;
    await selectCardByName(btn.dataset.name);
  });

  document.getElementById('collection-list').addEventListener('click', (e) => {
    const removeBtn = e.target.closest('button[data-remove]');
    if (removeBtn) { removeCard(removeBtn.dataset.remove); return; }

    const toggleBtn = e.target.closest('button[data-set-toggle]');
    if (toggleBtn) {
      const key = toggleBtn.dataset.setToggle;
      if (collapsedSets.has(key)) collapsedSets.delete(key); else collapsedSets.add(key);
      renderCollectionList();
    }
  });
}

// Scryfall's search de-prioritizes/ignores localized (printed) names unless
// explicitly told to widen the language scope — confirmed empirically that
// plain text alone finds nothing for a French name, but adding lang:any does.
async function searchCardsAnyLanguage(query) {
  const q = `${query} lang:any`;
  const res = await fetch(`https://api.scryfall.com/cards/search?q=${encodeURIComponent(q)}&unique=cards&order=name`);
  if (res.status === 404) return []; // no matches — expected while typing, not an error
  if (!res.ok) throw new Error('search failed');
  const data = await res.json();
  return data.data || [];
}

async function fetchSuggestions(q) {
  try {
    const results = await searchCardsAnyLanguage(q);
    renderSuggestions(results);
  } catch (e) {
    searchErrorEl.textContent = 'Connexion à Scryfall impossible. Réessaie dans un instant.';
    searchErrorEl.hidden = false;
  }
}

function renderSuggestions(cards) {
  const seen = new Set();
  const items = [];
  for (const c of cards) {
    if (seen.has(c.name)) continue;
    seen.add(c.name);
    items.push(c);
    if (items.length >= 8) break;
  }
  if (!items.length) { suggestionsBox.hidden = true; suggestionsBox.innerHTML = ''; return; }
  suggestionsBox.innerHTML = items.map(c => {
    const localized = c.printed_name && c.printed_name !== c.name
      ? ` <span class="text-muted">(${escapeHtml(c.printed_name)})</span>` : '';
    return `<button type="button" data-name="${escapeHtml(c.name)}">${escapeHtml(c.name)}${localized}</button>`;
  }).join('');
  suggestionsBox.hidden = false;
}

async function selectCardByName(name) {
  suggestionsBox.hidden = true;
  suggestionsBox.innerHTML = '';
  searchInput.value = name;
  searchLoadingEl.hidden = false;
  try {
    const printings = await resolvePrintings(name);
    if (printings.length === 0) throw new Error('not found');
    searchIdle.hidden = true;
    if (printings.length === 1) {
      openCardConfirm(printings[0], searchPreview, resetSearchBox);
    } else {
      openPrintingPicker(printings, searchPreview, (card) => {
        openCardConfirm(card, searchPreview, resetSearchBox);
      }, null);
    }
  } catch (err) {
    searchErrorEl.textContent = 'Impossible de récupérer cette carte sur Scryfall.';
    searchErrorEl.hidden = false;
  }
  searchLoadingEl.hidden = true;
}

function resetSearchBox() {
  searchInput.value = '';
  searchIdle.hidden = false;
  searchPreview.hidden = true;
  searchPreview.innerHTML = '';
}

function fallbackToManualSearch(prefill) {
  switchTab('collection');
  resetSearchBox();
  searchInput.value = prefill || '';
  searchInput.dispatchEvent(new Event('input'));
  searchInput.focus();
}

let collapsedSets = new Set();

function renderCollectionList() {
  const container = document.getElementById('collection-list');
  if (state.collection.length === 0) {
    container.innerHTML = `<div class="empty-state">Ta collection est vide. Cherche une carte ci-dessus, ou scanne-la avec l'appareil photo dans l'onglet Scanner.</div>`;
    return;
  }

  // Group cards by edition (set code)
  const groups = new Map();
  for (const card of state.collection) {
    const key = card.setCode || '—';
    if (!groups.has(key)) {
      groups.set(key, { setCode: key, setName: card.setName || key, releasedAt: card.releasedAt || null, cards: [] });
    }
    groups.get(key).cards.push(card);
  }

  // Most recent edition first; cards added before this feature (no releasedAt
  // stored yet) fall back to alphabetical so nothing breaks for older entries.
  const groupList = Array.from(groups.values()).sort((a, b) => {
    if (a.releasedAt && b.releasedAt) return b.releasedAt.localeCompare(a.releasedAt);
    if (a.releasedAt) return -1;
    if (b.releasedAt) return 1;
    return a.setName.localeCompare(b.setName);
  });

  container.innerHTML = groupList.map(group => {
    const isCollapsed = collapsedSets.has(group.setCode);
    let groupTotal = 0;

    const rowsHtml = group.cards.map(card => {
      const hist = state.priceHistory[card.id] || [];
      const last = hist[hist.length - 1];
      const prev = hist[hist.length - 2];
      const price = last ? (card.foil ? last.priceFoil : last.price) : null;
      const prevPrice = prev ? (card.foil ? prev.priceFoil : prev.price) : null;
      const pct = (price != null && prevPrice) ? ((price - prevPrice) / prevPrice) * 100 : null;
      const deltaColor = pct === null ? '' : (pct >= 0 ? 'var(--gain)' : 'var(--loss)');
      const deltaArrow = pct === null ? '' : (pct >= 0 ? '▲' : '▼');
      if (price != null) groupTotal += price * card.quantity;
      return `
        <div class="card-row">
          ${card.imageUrl ? `<img src="${card.imageUrl}" alt="">` : `<div class="row-thumb-placeholder"></div>`}
          <div style="flex:1; min-width:0;">
            <div class="name">${escapeHtml(card.name)}${card.foil ? '<span class="foil-badge">FOIL</span>' : ''}</div>
            <div class="text-muted">x${card.quantity}</div>
          </div>
          <div class="price-block">
            <div class="main">${fmtEUR(price)}</div>
            ${price != null ? `<div class="sub">${fmtEUR(price * card.quantity)} total</div>` : ''}
          </div>
          <div class="delta" style="color:${deltaColor};">${pct !== null ? `${deltaArrow} ${Math.abs(pct).toFixed(1)}%` : ''}</div>
          <button type="button" class="trash-btn" data-remove="${card.id}">🗑</button>
        </div>
      `;
    }).join('');

    return `
      <div class="edition-group">
        <button type="button" class="edition-header${isCollapsed ? ' collapsed' : ''}" data-set-toggle="${escapeHtml(group.setCode)}">
          <span class="edition-chevron">▾</span>
          <span class="edition-name">${escapeHtml(group.setName)}</span>
          <span class="edition-code text-muted">${escapeHtml(group.setCode)}</span>
          <span class="edition-count text-muted">${group.cards.length} carte${group.cards.length > 1 ? 's' : ''}</span>
          <span class="edition-value">${fmtEUR(groupTotal)}</span>
        </button>
        <div class="edition-body"${isCollapsed ? ' hidden' : ''}>
          ${rowsHtml}
        </div>
      </div>
    `;
  }).join('');
}

/* ===== Update prices ===== */

function initUpdateBar() {
  document.getElementById('btn-update-prices').addEventListener('click', updateAllPrices);
}

async function updateAllPrices() {
  if (state.collection.length === 0) return;
  const btn = document.getElementById('btn-update-prices');
  const icon = document.getElementById('update-icon');
  const label = document.getElementById('update-label');
  const errEl = document.getElementById('update-error');
  const msgEl = document.getElementById('update-msg');

  btn.disabled = true;
  icon.classList.add('spin');
  label.textContent = 'Mise à jour…';
  errEl.hidden = true;
  msgEl.hidden = true;

  const today = todayISO();
  let failCount = 0;

  for (const card of state.collection) {
    try {
      const res = await fetch(`https://api.scryfall.com/cards/${card.scryfallId}`);
      if (!res.ok) throw new Error('fetch failed');
      const data = await res.json();
      const priceEur = data.prices?.eur ? parseFloat(data.prices.eur) : null;
      const priceEurFoil = data.prices?.eur_foil ? parseFloat(data.prices.eur_foil) : null;
      const entry = { date: today, price: priceEur, priceFoil: priceEurFoil };
      const existing = state.priceHistory[card.id] ? [...state.priceHistory[card.id]] : [];
      const idx = existing.findIndex(e => e.date === today);
      if (idx >= 0) existing[idx] = entry; else existing.push(entry);
      state.priceHistory[card.id] = existing;
      await new Promise(r => setTimeout(r, 120));
    } catch (e) {
      failCount++;
    }
  }

  const total = state.collection.reduce((sum, card) => {
    const hist = state.priceHistory[card.id] || [];
    if (hist.length === 0) return sum;
    const last = hist[hist.length - 1];
    const price = card.foil ? last.priceFoil : last.price;
    return sum + (price ? price * card.quantity : 0);
  }, 0);

  const pIdx = state.portfolioHistory.findIndex(e => e.date === today);
  const pEntry = { date: today, totalValue: Math.round(total * 100) / 100 };
  if (pIdx >= 0) state.portfolioHistory[pIdx] = pEntry; else state.portfolioHistory.push(pEntry);

  persist('priceHistory');
  persist('portfolioHistory');

  if (failCount > 0) {
    errEl.textContent = `${failCount} carte(s) n'ont pas pu être mises à jour.`;
    errEl.hidden = false;
  } else {
    msgEl.textContent = `Prix mis à jour pour ${state.collection.length} carte(s).`;
    msgEl.hidden = false;
  }

  icon.classList.remove('spin');
  label.textContent = 'Mettre à jour les prix';
  btn.disabled = false;

  renderAll();
}

function updateTotalValue() {
  const total = state.collection.reduce((sum, card) => {
    const hist = state.priceHistory[card.id] || [];
    if (hist.length === 0) return sum;
    const last = hist[hist.length - 1];
    const price = card.foil ? last.priceFoil : last.price;
    return sum + (price ? price * card.quantity : 0);
  }, 0);
  document.getElementById('total-value').textContent = fmtEUR(total);
  const last = state.portfolioHistory[state.portfolioHistory.length - 1];
  document.getElementById('last-update').textContent = last ? `Dernière mise à jour : ${last.date}` : 'Pas encore mis à jour';
}

/* ===== Alerts ===== */

function refreshAlerts() {
  const threshold = state.settings.alertThreshold || 10;
  const alerts = state.collection.map(card => {
    const hist = state.priceHistory[card.id] || [];
    if (hist.length < 2) return null;
    const last = hist[hist.length - 1];
    const prev = hist[hist.length - 2];
    const lastPrice = card.foil ? last.priceFoil : last.price;
    const prevPrice = card.foil ? prev.priceFoil : prev.price;
    if (!lastPrice || !prevPrice) return null;
    const pct = ((lastPrice - prevPrice) / prevPrice) * 100;
    if (Math.abs(pct) >= threshold) return { card, pct, lastPrice, prevPrice };
    return null;
  }).filter(Boolean).sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));

  document.getElementById('alerts-title').textContent = `Cartes avec un mouvement ≥ ${threshold}% depuis la dernière mise à jour`;

  const badge = document.getElementById('alert-badge');
  if (alerts.length > 0) { badge.hidden = false; badge.textContent = String(alerts.length); } else { badge.hidden = true; }

  const emptyEl = document.getElementById('alerts-empty');
  const listEl = document.getElementById('alerts-list');
  if (alerts.length === 0) {
    emptyEl.hidden = false;
    listEl.innerHTML = '';
    return;
  }
  emptyEl.hidden = true;
  listEl.innerHTML = alerts.map(({ card, pct, lastPrice, prevPrice }) => `
    <div class="alert-row" style="border:1px solid ${pct >= 0 ? 'var(--gain)' : 'var(--loss)'};">
      ${card.imageUrl ? `<img src="${card.imageUrl}" alt="">` : ''}
      <div style="flex:1; min-width:0;">
        <div style="font-size:14px; font-weight:500;">${escapeHtml(card.name)}${card.foil ? ' (foil)' : ''}</div>
        <div style="font-family:var(--font-mono); font-size:12px; color:var(--muted);">${fmtEUR(prevPrice)} → ${fmtEUR(lastPrice)}</div>
      </div>
      <div class="alert-pct" style="color:${pct >= 0 ? 'var(--gain)' : 'var(--loss)'};">${pct >= 0 ? '▲' : '▼'} ${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%</div>
    </div>
  `).join('');
}

/* ===== Evolution charts ===== */

let portfolioChart = null;
let cardChart = null;

function chartConfig(labels, data, label, color) {
  return {
    type: 'line',
    data: { labels, datasets: [{ label, data, borderColor: color, backgroundColor: color + '33', tension: 0.3, pointRadius: 3, fill: true }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: SURFACE, borderColor: LINE, borderWidth: 1, titleColor: INK, bodyColor: INK,
          callbacks: { label: (ctx) => fmtEUR(ctx.parsed.y) },
        },
      },
      scales: {
        x: { ticks: { color: MUTED, font: { size: 10 } }, grid: { color: LINE } },
        y: { ticks: { color: MUTED, font: { size: 10 }, callback: (v) => fmtEUR(v) }, grid: { color: LINE } },
      },
    },
  };
}

function renderEvolution() {
  const emptyEl = document.getElementById('evolution-empty');
  const boxEl = document.getElementById('portfolio-chart-box');
  if (state.portfolioHistory.length === 0) {
    emptyEl.hidden = false;
    boxEl.hidden = true;
  } else {
    emptyEl.hidden = true;
    boxEl.hidden = false;
    if (window.Chart) {
      const ctx = document.getElementById('portfolio-chart').getContext('2d');
      const labels = state.portfolioHistory.map(p => p.date);
      const data = state.portfolioHistory.map(p => p.totalValue);
      if (portfolioChart) portfolioChart.destroy();
      portfolioChart = new Chart(ctx, chartConfig(labels, data, 'Valeur (€)', GOLD));
    }
  }

  const histBlock = document.getElementById('card-history-block');
  const select = document.getElementById('history-select');
  if (state.collection.length === 0) {
    histBlock.hidden = true;
  } else {
    histBlock.hidden = false;
    const current = select.value;
    select.innerHTML = '<option value="">Choisir une carte…</option>' +
      state.collection.map(c => `<option value="${c.id}">${escapeHtml(c.name)}${c.foil ? ' (foil)' : ''}</option>`).join('');
    select.value = current;
    renderCardHistory(select.value);
  }
}

function renderCardHistory(cardId) {
  const emptyEl = document.getElementById('card-history-empty');
  const boxEl = document.getElementById('card-chart-box');
  if (!cardId) {
    emptyEl.hidden = true;
    boxEl.hidden = true;
    if (cardChart) { cardChart.destroy(); cardChart = null; }
    return;
  }
  const card = state.collection.find(c => c.id === cardId);
  const hist = state.priceHistory[cardId] || [];
  if (!card || hist.length < 2) {
    emptyEl.hidden = false;
    boxEl.hidden = true;
    return;
  }
  emptyEl.hidden = true;
  boxEl.hidden = false;
  if (!window.Chart) return;
  const labels = hist.map(h => h.date);
  const data = hist.map(h => card.foil ? h.priceFoil : h.price);
  const ctx = document.getElementById('card-chart').getContext('2d');
  if (cardChart) cardChart.destroy();
  cardChart = new Chart(ctx, chartConfig(labels, data, 'Prix (€)', GAIN));
}

function initEvolutionTab() {
  document.getElementById('history-select').addEventListener('change', (e) => renderCardHistory(e.target.value));
}

/* ===== Settings ===== */

function initSettingsTab() {
  document.getElementById('threshold-input').value = state.settings.alertThreshold || 10;

  document.getElementById('btn-save-threshold').addEventListener('click', () => {
    const val = Math.max(1, Number(document.getElementById('threshold-input').value) || 10);
    state.settings.alertThreshold = val;
    persist('settings');
    refreshAlerts();
  });

  let resetArmed = false;
  const resetBtn = document.getElementById('btn-reset-data');
  resetBtn.addEventListener('click', () => {
    if (!resetArmed) {
      resetArmed = true;
      resetBtn.textContent = 'Confirmer la suppression';
      setTimeout(() => {
        resetArmed = false;
        resetBtn.textContent = 'Réinitialiser toutes les données';
      }, 4000);
      return;
    }
    state.collection = [];
    state.priceHistory = {};
    state.portfolioHistory = [];
    persist('collection'); persist('priceHistory'); persist('portfolioHistory');
    resetArmed = false;
    resetBtn.textContent = 'Réinitialiser toutes les données';
    renderAll();
  });
}

/* ===== Scanner (camera + OCR) ===== */

let mediaStream = null;

function initScannerTab() {
  document.getElementById('btn-scan-start').addEventListener('click', startCamera);
  document.getElementById('btn-scan-stop').addEventListener('click', stopCamera);
  document.getElementById('btn-scan-capture').addEventListener('click', captureAndRecognize);
}

function setScanStatus(msg) {
  document.getElementById('scan-status').textContent = msg;
}

async function startCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    setScanStatus("La caméra n'est pas accessible ici (nécessite HTTPS et un navigateur récent).");
    return;
  }
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } },
      audio: false,
    });
  } catch (e) {
    setScanStatus("Impossible d'accéder à la caméra. Vérifie l'autorisation caméra donnée à l'app dans les réglages Android.");
    return;
  }
  const video = document.getElementById('scan-video');
  video.srcObject = mediaStream;
  await video.play();
  document.getElementById('scan-guide').hidden = false;
  document.getElementById('btn-scan-start').hidden = true;
  document.getElementById('btn-scan-capture').hidden = false;
  document.getElementById('btn-scan-stop').hidden = false;
  setScanStatus('Cadre la carte, puis appuie sur Capturer.');
}

function stopCamera() {
  if (mediaStream) {
    mediaStream.getTracks().forEach(t => t.stop());
    mediaStream = null;
  }
  document.getElementById('scan-guide').hidden = true;
  document.getElementById('btn-scan-start').hidden = false;
  document.getElementById('btn-scan-capture').hidden = true;
  document.getElementById('btn-scan-stop').hidden = true;
  document.getElementById('scan-status').textContent = '';
  document.getElementById('scan-preview').innerHTML = '';
}

function getCoverRect(srcW, srcH, targetRatio) {
  const srcRatio = srcW / srcH;
  let sx, sy, sw, sh;
  if (srcRatio > targetRatio) {
    sh = srcH;
    sw = srcH * targetRatio;
    sx = (srcW - sw) / 2;
    sy = 0;
  } else {
    sw = srcW;
    sh = srcW / targetRatio;
    sx = 0;
    sy = (srcH - sh) / 2;
  }
  return { sx, sy, sw, sh };
}

async function captureAndRecognize() {
  if (!mediaStream) return;
  const captureBtn = document.getElementById('btn-scan-capture');
  const scanPreviewEl = document.getElementById('scan-preview');
  const video = document.getElementById('scan-video');
  const canvas = document.getElementById('scan-canvas');

  captureBtn.disabled = true;
  scanPreviewEl.innerHTML = '';
  setScanStatus('Capture…');

  try {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Match the on-screen guide box exactly, accounting for the video's
    // object-fit: cover crop inside its 3:4 container.
    const { sx, sy, sw, sh } = getCoverRect(canvas.width, canvas.height, 3 / 4);
    const gx = sx + sw * 0.12;
    const gyTop = sy + sh * 0.08;
    const gw = sw * 0.76;
    const gBoxH = sh * 0.84;
    const nameH = gBoxH * 0.22;

    const scale = 2.2;
    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = gw * scale;
    cropCanvas.height = nameH * scale;
    const cctx = cropCanvas.getContext('2d');
    cctx.imageSmoothingEnabled = true;
    cctx.drawImage(canvas, gx, gyTop, gw, nameH, 0, 0, cropCanvas.width, cropCanvas.height);
    const dataUrl = cropCanvas.toDataURL('image/png');

    if (!window.Tesseract) {
      setScanStatus("Le module de lecture de texte n'a pas pu se charger (connexion internet nécessaire au premier lancement).");
      renderScanFallback('');
      captureBtn.disabled = false;
      return;
    }

    setScanStatus('Lecture du texte…');
    const { data: { text } } = await Tesseract.recognize(dataUrl, 'eng+fra');
    const cleaned = (text || '').replace(/[^a-zA-Z0-9À-ÿ',\-\s]/g, ' ').replace(/\s+/g, ' ').trim();

    if (!cleaned || cleaned.length < 2) {
      setScanStatus('Texte illisible. Réessaie avec plus de lumière, à plat, sans reflet — ou cherche la carte manuellement.');
      renderScanFallback('');
      captureBtn.disabled = false;
      return;
    }

    setScanStatus(`Texte détecté : « ${cleaned} » — recherche des éditions…`);
    try {
      // Resolve OCR'd text (which may be in French, German, etc. on a
      // physical card) to a card name via the multilingual search, then
      // fetch every English printing of that exact name.
      const candidates = await searchCardsAnyLanguage(cleaned);
      if (candidates.length === 0) throw new Error('no match');
      const nameCard = candidates[0];
      const printings = await resolvePrintings(nameCard.name);
      const list = printings.length > 0 ? printings : [nameCard];

      if (list.length === 1) {
        setScanStatus("Carte trouvée — vérifie que c'est la bonne avant d'ajouter :");
        openCardConfirm(list[0], scanPreviewEl, resetScanIdle);
        captureBtn.disabled = false;
        return;
      }

      // Multiple editions exist for this name — try to disambiguate automatically.
      setScanStatus(`${list.length} éditions trouvées — lecture du numéro de collection…`);
      const infoX = gx;
      const infoY = gyTop + gBoxH * 0.93;
      const infoW = gw * 0.45;
      const infoH = gBoxH * 0.055;
      const collectorText = await ocrCollectorArea(canvas, infoX, infoY, infoW, infoH);
      const exactMatch = matchPrintingByCollectorText(collectorText, list);

      if (exactMatch) {
        setScanStatus(`Édition identifiée automatiquement (${exactMatch.set_name}) — vérifie avant d'ajouter :`);
        openCardConfirm(exactMatch, scanPreviewEl, resetScanIdle);
        captureBtn.disabled = false;
        return;
      }

      // Fall back to visual ranking of the illustration against each candidate edition.
      setScanStatus('Numéro illisible — comparaison visuelle des éditions…');
      const artX = gx + gw * 0.07;
      const artY = gyTop + gBoxH * 0.10;
      const artW = gw * 0.86;
      const artH = gBoxH * 0.34;
      const bestId = await rankPrintingsByArt(canvas, artX, artY, artW, artH, list);

      setScanStatus("Plusieurs éditions possibles — confirme laquelle c'est (celle en surbrillance est la plus probable) :");
      openPrintingPicker(list, scanPreviewEl, (card) => {
        openCardConfirm(card, scanPreviewEl, resetScanIdle);
      }, bestId);
    } catch (e) {
      setScanStatus(`Pas de correspondance sûre pour « ${cleaned} ».`);
      renderScanFallback(cleaned);
    }
  } catch (e) {
    setScanStatus('Erreur pendant la capture. Réessaie.');
  }
  captureBtn.disabled = false;
}

function resetScanIdle() {
  setScanStatus('Cadre la carte, puis appuie sur Capturer.');
}

function renderScanFallback(prefill) {
  const scanPreviewEl = document.getElementById('scan-preview');
  scanPreviewEl.innerHTML = `<button type="button" class="btn-ghost" id="btn-manual-fallback">Chercher manuellement${prefill ? ` « ${escapeHtml(prefill)} »` : ''}</button>`;
  document.getElementById('btn-manual-fallback').addEventListener('click', () => fallbackToManualSearch(prefill));
}

/* ===== Render orchestration ===== */

function renderAll() {
  renderCollectionList();
  updateTotalValue();
  refreshAlerts();
  renderEvolution();
}

/* ===== Version tracking & update detection ===== */

function initVersionTracking() {
  const tagEl = document.getElementById('version-tag');
  if (tagEl) tagEl.textContent = 'v' + APP_VERSION;

  if (!('serviceWorker' in navigator)) return;

  // If a controller already exists on load, this is a repeat visit — any
  // later controllerchange therefore means a *new* deploy just took over.
  const hadController = !!navigator.serviceWorker.controller;

  navigator.serviceWorker.register('service-worker.js').then((reg) => {
    // Re-check for a fresher service-worker.js periodically while the
    // app stays open — useful right after a GitHub Pages deploy, which
    // can take a minute or two to go live.
    setInterval(() => reg.update().catch(() => {}), 60000);
  }).catch(() => {});

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) showUpdateBanner();
  });
}

function showUpdateBanner() {
  const banner = document.getElementById('update-banner');
  if (!banner) return;
  banner.hidden = false;
  const btn = document.getElementById('btn-apply-update');
  if (btn) btn.addEventListener('click', () => window.location.reload());
}

/* ===== Init ===== */

document.addEventListener('DOMContentLoaded', () => {
  state = loadState();

  document.querySelectorAll('nav.tabs button').forEach(b => {
    b.addEventListener('click', () => switchTab(b.dataset.tab));
  });

  initCollectionTab();
  initUpdateBar();
  initEvolutionTab();
  initSettingsTab();
  initScannerTab();
  initVersionTracking();

  renderAll();
});
