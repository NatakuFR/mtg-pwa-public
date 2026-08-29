/* ===== Constants & helpers ===== */

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
    const btn = e.target.closest('button[data-remove]');
    if (!btn) return;
    removeCard(btn.dataset.remove);
  });
}

async function fetchSuggestions(q) {
  try {
    const res = await fetch(`https://api.scryfall.com/cards/autocomplete?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    renderSuggestions(data.data || []);
  } catch (e) {
    searchErrorEl.textContent = 'Connexion à Scryfall impossible. Réessaie dans un instant.';
    searchErrorEl.hidden = false;
  }
}

function renderSuggestions(names) {
  if (!names.length) { suggestionsBox.hidden = true; suggestionsBox.innerHTML = ''; return; }
  suggestionsBox.innerHTML = names.slice(0, 8)
    .map(n => `<button type="button" data-name="${escapeHtml(n)}">${escapeHtml(n)}</button>`).join('');
  suggestionsBox.hidden = false;
}

async function selectCardByName(name) {
  suggestionsBox.hidden = true;
  suggestionsBox.innerHTML = '';
  searchInput.value = name;
  searchLoadingEl.hidden = false;
  try {
    const res = await fetch(`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}`);
    if (!res.ok) throw new Error('not found');
    const card = await res.json();
    searchIdle.hidden = true;
    openCardConfirm(card, searchPreview, resetSearchBox);
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

function renderCollectionList() {
  const container = document.getElementById('collection-list');
  if (state.collection.length === 0) {
    container.innerHTML = `<div class="empty-state">Ta collection est vide. Cherche une carte ci-dessus, ou scanne-la avec l'appareil photo dans l'onglet Scanner.</div>`;
    return;
  }
  container.innerHTML = state.collection.map(card => {
    const hist = state.priceHistory[card.id] || [];
    const last = hist[hist.length - 1];
    const prev = hist[hist.length - 2];
    const price = last ? (card.foil ? last.priceFoil : last.price) : null;
    const prevPrice = prev ? (card.foil ? prev.priceFoil : prev.price) : null;
    const pct = (price != null && prevPrice) ? ((price - prevPrice) / prevPrice) * 100 : null;
    const deltaColor = pct === null ? '' : (pct >= 0 ? 'var(--gain)' : 'var(--loss)');
    const deltaArrow = pct === null ? '' : (pct >= 0 ? '▲' : '▼');
    return `
      <div class="card-row">
        ${card.imageUrl ? `<img src="${card.imageUrl}" alt="">` : `<div class="row-thumb-placeholder"></div>`}
        <div style="flex:1; min-width:0;">
          <div class="name">${escapeHtml(card.name)}${card.foil ? '<span class="foil-badge">FOIL</span>' : ''}</div>
          <div class="text-muted">${escapeHtml(card.setName)} · x${card.quantity}</div>
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
    const { data: { text } } = await Tesseract.recognize(dataUrl, 'eng');
    const cleaned = (text || '').replace(/[^a-zA-Z0-9À-ÿ',\-\s]/g, ' ').replace(/\s+/g, ' ').trim();

    if (!cleaned || cleaned.length < 2) {
      setScanStatus('Texte illisible. Réessaie avec plus de lumière, à plat, sans reflet — ou cherche la carte manuellement.');
      renderScanFallback('');
      captureBtn.disabled = false;
      return;
    }

    setScanStatus(`Texte détecté : « ${cleaned} » — recherche sur Scryfall…`);
    try {
      const res = await fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(cleaned)}`);
      if (!res.ok) throw new Error('no match');
      const card = await res.json();
      setScanStatus("Carte trouvée — vérifie que c'est la bonne avant d'ajouter :");
      openCardConfirm(card, scanPreviewEl, () => setScanStatus('Cadre la carte, puis appuie sur Capturer.'));
    } catch (e) {
      setScanStatus(`Pas de correspondance sûre pour « ${cleaned} ».`);
      renderScanFallback(cleaned);
    }
  } catch (e) {
    setScanStatus('Erreur pendant la capture. Réessaie.');
  }
  captureBtn.disabled = false;
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

  renderAll();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js').catch(() => {});
  }
});
