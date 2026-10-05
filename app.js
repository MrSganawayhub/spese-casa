'use strict';

/* ================= costanti ================= */
const COLLS = ['categorie', 'ricorrenti', 'movimenti'];
const K = { db: 'sc_db', meta: 'sc_meta', cfg: 'sc_cfg' };
const MESI = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
const MESI_BREVI = MESI.map(m => m.slice(0, 3));
const GIORNI = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
const FREQ = { mensile: 1, bimestrale: 2, trimestrale: 3, quadrimestrale: 4, semestrale: 6, annuale: 12 };
const PALETTE = ['#0f766e', '#2563eb', '#d97706', '#dc2626', '#7c3aed', '#db2777', '#059669', '#0891b2', '#65a30d', '#ea580c', '#4f46e5', '#be123c', '#0d9488', '#a16207', '#475569', '#9333ea', '#16a34a', '#0284c7', '#b45309', '#e11d48'];
const DEFAULT_CATS = [
  ['spesa', 'Spesa', '🛒', 'uscita'], ['casa', 'Casa', '🏠', 'uscita'], ['bollette', 'Bollette', '💡', 'uscita'],
  ['trasporti', 'Auto e trasporti', '🚗', 'uscita'], ['salute', 'Salute', '💊', 'uscita'], ['ristoranti', 'Ristoranti e bar', '🍕', 'uscita'],
  ['svago', 'Svago', '🎬', 'uscita'], ['abbigliamento', 'Abbigliamento', '👕', 'uscita'], ['figli', 'Figli', '🧸', 'uscita'],
  ['animali', 'Animali', '🐾', 'uscita'], ['regali', 'Regali', '🎁', 'uscita'], ['viaggi', 'Viaggi', '✈️', 'uscita'],
  ['abbonamenti', 'Abbonamenti', '📺', 'uscita'], ['assicurazioni', 'Assicurazioni', '🛡️', 'uscita'], ['tasse', 'Tasse', '🧾', 'uscita'],
  ['finanziamenti', 'Mutuo e prestiti', '🏦', 'uscita'], ['risparmio', 'Risparmio e investimenti', '🐷', 'uscita'],
  ['sport', 'Sport', '🏐', 'uscita'], ['sigaretta', 'Sigaretta elettronica', '💨', 'uscita'], ['altro', 'Altro', '📦', 'uscita'],
  ['stipendio', 'Stipendio', '💼', 'entrata'], ['altre_entrate', 'Altre entrate', '💰', 'entrata'],
];

/* ================= helper ================= */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const fmtEur = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });
const eur = n => fmtEur.format(Math.round((+n || 0) * 100) / 100);
const eur0 = n => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(+n || 0);
const oggi = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const ymOf = d => String(d || '').slice(0, 7);
const meseLabel = ym => MESI[+ym.slice(5) - 1] + ' ' + ym.slice(0, 4);
const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const sum = (a, f = x => x.importo) => a.reduce((s, x) => s + (+f(x) || 0), 0);

function num(v) {
  if (typeof v === 'number') return v;
  let s = String(v ?? '').trim().replace(/[€\s]/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return isFinite(n) ? n : 0;
}
function addMonths(ym, k) {
  let [y, m] = ym.split('-').map(Number);
  m += k;
  while (m < 1) { m += 12; y--; }
  while (m > 12) { m -= 12; y++; }
  return `${y}-${pad(m)}`;
}
function load(k, def) { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? def; } catch { return def; } }
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove('show'), 2600);
}

/* ================= stato ================= */
let db = load(K.db, null) || {};
COLLS.forEach(c => { db[c] = db[c] || {}; });
let meta = load(K.meta, null) || {};
meta.pending = meta.pending || {};
COLLS.forEach(c => { meta.pending[c] = meta.pending[c] || []; });
meta.lastPull = meta.lastPull || 0;
let cfg = Object.assign({ url: '', key: '', nome: '', annuali: 'ripartite' }, load(K.cfg, {}));

const ui = { tab: 'mese', month: ymOf(oggi()), fCat: '', fChi: '', q: '', seg: 'mensili', range: 6 };

function save() {
  localStorage.setItem(K.db, JSON.stringify(db));
  localStorage.setItem(K.meta, JSON.stringify(meta));
}
function saveCfg() { localStorage.setItem(K.cfg, JSON.stringify(cfg)); }
function list(c) { return Object.values(db[c]).filter(x => !x.deleted); }
function markPending(c, id) { if (!meta.pending[c].includes(id)) meta.pending[c].push(id); }
function put(c, o) {
  o.updatedAt = Date.now();
  o.deleted = !!o.deleted;
  db[c][o.id] = o;
  markPending(c, o.id);
  save();
  syncSoon();
  render();
}
function remove(c, id) { const o = db[c][id]; if (o) put(c, { ...o, deleted: true }); }
function pendingCount() { return COLLS.reduce((s, c) => s + meta.pending[c].length, 0); }

function seed() {
  if (Object.keys(db.categorie).length) return;
  DEFAULT_CATS.forEach(([k, nome, icona, tipo], i) => {
    const id = 'c_' + k;
    // updatedAt=1: qualunque versione già presente sul foglio ha la precedenza
    db.categorie[id] = { id, nome, icona, tipo, budget: 0, ordine: i, updatedAt: 1, deleted: false };
    markPending('categorie', id);
  });
  save();
}

/* ================= categorie ================= */
function cats(tipo) {
  return list('categorie')
    .filter(c => !tipo || c.tipo === tipo || c.tipo === 'entrambi')
    .sort((a, b) => (a.ordine ?? 99) - (b.ordine ?? 99) || a.nome.localeCompare(b.nome));
}
function cat(id) { return db.categorie[id] || { nome: 'Senza categoria', icona: '❔' }; }
function catColor(id) {
  const ids = Object.keys(db.categorie).sort();
  const i = ids.indexOf(id);
  return PALETTE[(i < 0 ? ids.length : i) % PALETTE.length];
}
function catByName(nome, tipo) {
  const n = String(nome || '').trim().toLowerCase();
  if (!n) return '';
  if (db.categorie[nome]) return nome;
  const f = list('categorie').find(c => c.nome.toLowerCase() === n || c.id === 'c_' + n);
  if (f) return f.id;
  return '';
}

/* ================= calcoli ================= */
const step = r => FREQ[r.frequenza] || 1;
function scadeNelMese(r, m) { const s = step(r); return (((m - (+r.mese || 1)) % s) + s) % s === 0; }
function quotaMese(r, m, modo = cfg.annuali) {
  const s = step(r);
  if (s === 1) return r.importo;
  if (modo === 'ripartite') return r.importo / s;
  return scadeNelMese(r, m) ? r.importo : 0;
}
const giorniMese = (y, m) => new Date(y, m, 0).getDate();
const mesiTra = (a, b) => (+b.slice(0, 4) - +a.slice(0, 4)) * 12 + (+b.slice(5, 7) - +a.slice(5, 7));
const giorniA = d => Math.round((new Date(d + 'T12:00:00') - new Date(oggi() + 'T12:00:00')) / 864e5);
const fmtData = d => `${+d.slice(8)} ${MESI_BREVI[+d.slice(5, 7) - 1].toLowerCase()} ${d.slice(0, 4)}`;
function fraGiorni(d) {
  const n = giorniA(d);
  return n === 0 ? 'oggi' : n === 1 ? 'domani' : n < 0 ? `scaduta da ${-n} giorni` : `tra ${n} giorni`;
}
const isoDate = x => `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
const addDays = (d, n) => { const t = new Date(d + 'T12:00:00'); t.setDate(t.getDate() + n); return isoDate(t); };
function minusMonths(d, k) {
  const ym = addMonths(d.slice(0, 7), -k);
  return `${ym}-${pad(Math.min(+d.slice(8), giorniMese(+ym.slice(0, 4), +ym.slice(5))))}`;
}
const isAcc = x => x.tipo === 'accantonamento';
// versamenti e pagamenti collegati a una voce periodica, in ordine di data
function eventiVoce(id) {
  return list('movimenti').filter(x => x.ricorrente === id)
    .sort((a, b) => (a.data || '').localeCompare(b.data || '') || a.updatedAt - b.updatedAt);
}
// saldo reale del salvadanaio: i versamenti lo riempiono, i pagamenti lo svuotano (mai sotto zero)
function salvadanaio(id) {
  let s = 0;
  for (const x of eventiVoce(id)) s = isAcc(x) ? s + x.importo : Math.max(0, s - x.importo);
  return s;
}
// prossima scadenza non pagata (giorno vuoto = fine mese) e quanto dovrebbe essere già accantonato.
// Una scadenza è pagata se c'è un pagamento collegato tra (scadenza − periodo + 45 gg) e (scadenza + 45 gg).
// Le scadenze passate e non pagate restano visibili per 45 giorni come "scadute".
function scadenza(r, da = oggi()) {
  const s = step(r);
  const pagamenti = r.tipo === 'entrata' ? [] : list('movimenti').filter(x => x.ricorrente === r.id && !isAcc(x));
  const inizio = r.tipo === 'entrata' ? da : addDays(da, -45);
  let [y, m] = inizio.split('-').map(Number);
  let ultimo = null;
  for (let k = 0; k <= 36; k++) {
    const mm = ((m - 1 + k) % 12) + 1, yy = y + Math.floor((m - 1 + k) / 12);
    if (!scadeNelMese(r, mm)) continue;
    const dim = giorniMese(yy, mm);
    const d = `${yy}-${pad(mm)}-${pad(Math.min(+r.giorno || dim, dim))}`;
    if (d < inizio) continue;
    const lo = addDays(minusMonths(d, s), 45), hi = addDays(d, 45);
    const pag = pagamenti.find(p => p.data > lo && p.data <= hi);
    if (pag) { ultimo = pag; continue; }
    const quota = r.importo / s;
    const maturati = Math.max(0, Math.min(s, s - mesiTra(ymOf(da), ymOf(d))));
    return { data: d, quota, accantonato: Math.min(r.importo, quota * maturati), mancano: Math.max(0, r.importo - quota * maturati), ultimo };
  }
  return null;
}
function riepilogo(ym) {
  const m = +ym.slice(5);
  const R = list('ricorrenti').filter(r => r.attiva !== false);
  const altro = cfg.annuali === 'ripartite' ? 'scadenza' : 'ripartite';
  let entrateMens = 0, entratePer = 0, entratePerAlt = 0, fisse = 0, periodiche = 0, periodicheAlt = 0;
  for (const r of R) {
    const q = quotaMese(r, m), qa = quotaMese(r, m, altro);
    if (r.tipo === 'entrata') { if (step(r) === 1) entrateMens += q; else { entratePer += q; entratePerAlt += qa; } }
    else if (step(r) === 1) fisse += q;
    else { periodiche += q; periodicheAlt += qa; }
  }
  const entrateFisse = entrateMens + entratePer;
  const movs = list('movimenti').filter(x => ymOf(x.data) === ym);
  const uscite = movs.filter(x => x.tipo === 'uscita' && !x.ricorrente);
  const extra = movs.filter(x => x.tipo === 'entrata');
  const accantonati = sum(movs.filter(isAcc));
  const variabili = sum(uscite), entrateExtra = sum(extra), entrate = entrateFisse + entrateExtra;
  return {
    m, movs, uscite, accantonati, entrateMens, entratePer, entratePerAlt, entrateFisse, entrateExtra, entrate, fisse, periodiche, periodicheAlt, variabili,
    residuoAlt: entrate - entratePer + entratePerAlt - fisse - periodicheAlt - variabili,
    disponibile: entrate - fisse - periodiche,
    residuo: entrate - fisse - periodiche - variabili,
    scadenze: R.filter(r => step(r) > 1 && scadeNelMese(r, m)),
  };
}
function perCategoria(movs) {
  const g = {};
  movs.forEach(x => { g[x.categoria] = (g[x.categoria] || 0) + x.importo; });
  return Object.entries(g).map(([id, tot]) => ({ id, tot })).sort((a, b) => b.tot - a.tot);
}
// budget settimanale: nel mese vale budget × giorni del mese / 7
function budgetMese(c, ym) {
  if (!(c.budget > 0)) return 0;
  if (c.budgetPeriodo !== 'settimana') return c.budget;
  const [y, m] = ym.split('-').map(Number);
  return c.budget * new Date(y, m, 0).getDate() / 7;
}
function settimanaCorrente() {
  const d = new Date();
  d.setDate(d.getDate() - (d.getDay() + 6) % 7); // lunedì
  const iso = isoDate;
  const da = iso(d);
  d.setDate(d.getDate() + 6);
  return { da, a: iso(d) };
}
const budgetLabel = c => c.budget ? `${eur0(c.budget)}/${c.budgetPeriodo === 'settimana' ? 'settimana' : 'mese'}` : '';
function nomiChi() {
  const s = new Set(list('movimenti').map(x => x.chi).filter(Boolean));
  if (cfg.nome) s.add(cfg.nome);
  return [...s].sort();
}

/* ================= sincronizzazione ================= */
let syncing = false, syncErr = '', syncTimer = null;
function syncSoon() { clearTimeout(syncTimer); if (cfg.url) syncTimer = setTimeout(() => sync(), 1200); }

async function api(body, url = cfg.url, key = cfg.key) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 30000);
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ ...body, key }),
      signal: ctrl.signal,
      redirect: 'follow',
    });
    let j;
    try { j = await r.json(); } catch { throw new Error('Risposta non valida: controlla l\'URL dello script'); }
    if (!j.ok) throw new Error(j.error || 'Errore del server');
    return j;
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Tempo scaduto');
    if (e instanceof TypeError) throw new Error('Nessuna connessione');
    throw e;
  } finally { clearTimeout(t); }
}

function norm(c, o) {
  o = { ...o, id: String(o.id) };
  delete o._srv;
  const bool = v => v === true || String(v).toLowerCase() === 'true';
  o.updatedAt = +o.updatedAt || 0;
  o.deleted = bool(o.deleted);
  if (c === 'categorie') {
    o.budget = num(o.budget); o.ordine = +o.ordine || 0;
    o.budgetPeriodo = o.budgetPeriodo === 'settimana' ? 'settimana' : 'mese';
    o.tipo = String(o.tipo || 'uscita').toLowerCase();
    o.icona = o.icona || '📦';
  } else {
    o.importo = Math.abs(num(o.importo));
    const t = String(o.tipo || 'uscita').toLowerCase();
    o.tipo = t.startsWith('entr') ? 'entrata' : t.startsWith('accan') ? 'accantonamento' : 'uscita';
    o.categoria = catByName(o.categoria) || o.categoria || '';
  }
  if (c === 'ricorrenti') {
    o.attiva = !(o.attiva === false || String(o.attiva).toLowerCase() === 'false');
    o.frequenza = String(o.frequenza || 'mensile').toLowerCase();
    if (!FREQ[o.frequenza]) o.frequenza = 'mensile';
    o.mese = +o.mese || 1;
    o.giorno = +o.giorno || '';
  }
  if (c === 'movimenti') { o.data = String(o.data || '').slice(0, 10); o.ricorrente = String(o.ricorrente || ''); }
  return o;
}

async function sync(manual) {
  if (!cfg.url) { if (manual) { toast('Collega il Google Sheet nelle impostazioni'); openSettings(); } return; }
  if (syncing) return;
  syncing = true; syncErr = ''; renderStatus();
  try {
    const changes = {}, sent = {};
    let n = 0;
    for (const c of COLLS) {
      changes[c] = []; sent[c] = {};
      for (const id of meta.pending[c]) {
        const o = db[c][id];
        if (o) { changes[c].push(o); sent[c][id] = o.updatedAt; n++; }
      }
    }
    if (n) {
      await api({ action: 'push', changes });
      for (const c of COLLS) {
        meta.pending[c] = meta.pending[c].filter(id => !(id in sent[c]) || (db[c][id] && db[c][id].updatedAt !== sent[c][id]));
      }
      save();
    }
    const r = await api({ action: 'pull', since: meta.lastPull ? meta.lastPull - 60000 : 0 });
    let changed = 0;
    for (const c of COLLS) {
      for (const row of (r.data && r.data[c]) || []) {
        const o = norm(c, row);
        const loc = db[c][o.id];
        if (loc && meta.pending[c].includes(o.id) && loc.updatedAt > o.updatedAt) continue;
        if (!loc || JSON.stringify(loc) !== JSON.stringify(o)) { db[c][o.id] = o; changed++; }
      }
    }
    meta.lastPull = r.now;
    meta.lastSync = Date.now();
    save();
    if (changed) render();
    if (manual) toast(changed ? `Aggiornato: ${changed} modifiche ricevute` : 'Tutto aggiornato');
  } catch (e) {
    syncErr = e.message || String(e);
    if (manual) toast('Sincronizzazione non riuscita: ' + syncErr);
  } finally {
    syncing = false;
    renderStatus();
  }
}

function renderStatus() {
  const el = $('#syncStatus');
  const p = pendingCount();
  document.querySelectorAll('[data-act="sync"].icon-btn').forEach(b => b.classList.toggle('spin', syncing));
  el.classList.toggle('err', !!syncErr);
  if (!cfg.url) { el.textContent = 'Solo su questo telefono · tocca per collegare'; return; }
  if (syncing) { el.textContent = 'Sincronizzazione…'; return; }
  if (syncErr) { el.textContent = `⚠ ${syncErr}` + (p ? ` · ${p} da inviare` : ''); return; }
  const t = meta.lastSync ? new Date(meta.lastSync) : null;
  el.textContent = (t ? `Sincronizzato alle ${pad(t.getHours())}:${pad(t.getMinutes())}` : 'Mai sincronizzato') + (p ? ` · ${p} da inviare` : '');
}

/* ================= componenti ================= */
function monthNav() {
  return `<div class="month-nav">
    <button data-act="month" data-d="-1" aria-label="Mese precedente">‹</button>
    <strong>${meseLabel(ui.month)}</strong>
    <button data-act="month" data-d="1" aria-label="Mese successivo">›</button>
  </div>`;
}
function fmtGiorno(d) {
  const dt = new Date(d + 'T12:00:00');
  if (isNaN(dt)) return d || 'Senza data';
  const o = oggi();
  const ieri = new Date(); ieri.setDate(ieri.getDate() - 1);
  if (d === o) return 'Oggi';
  if (d === `${ieri.getFullYear()}-${pad(ieri.getMonth() + 1)}-${pad(ieri.getDate())}`) return 'Ieri';
  return `${GIORNI[dt.getDay()]} ${dt.getDate()} ${MESI[dt.getMonth()].toLowerCase()}`;
}
function movRow(x, showDate) {
  if (x.ricorrente) {
    const r = db.ricorrenti[x.ricorrente];
    const sub = [showDate ? fmtGiorno(x.data) : '', isAcc(x) ? 'nel salvadanaio' : 'pagamento voce annuale', x.chi].filter(Boolean).join(' · ');
    return `<button class="item" data-act="voce" data-id="${esc(x.ricorrente)}">
      <span class="ico" style="background:${catColor(x.categoria)}22">${isAcc(x) ? '🐷' : esc(cat(x.categoria).icona)}</span>
      <span class="txt"><div class="t1">${esc(r ? r.nome : x.nota)}</div><div class="t2">${esc(sub)}</div></span>
      <span class="amt" style="${isAcc(x) ? 'color:var(--muted)' : ''}">${isAcc(x) ? '→ ' : '−'}${eur(x.importo)}</span>
    </button>`;
  }
  const c = cat(x.categoria);
  const sub = [showDate ? fmtGiorno(x.data) : '', x.nota && c.nome ? c.nome : '', x.chi].filter(Boolean).join(' · ');
  return `<button class="item" data-act="editMov" data-id="${esc(x.id)}">
    <span class="ico" style="background:${catColor(x.categoria)}22">${esc(c.icona)}</span>
    <span class="txt"><div class="t1">${esc(x.nota || c.nome)}</div><div class="t2">${esc(sub)}</div></span>
    <span class="amt ${x.tipo === 'entrata' ? 'pos' : ''}">${x.tipo === 'entrata' ? '+' : '−'}${eur(x.importo)}</span>
  </button>`;
}
function catRows(rows, ym) {
  const max = Math.max(1, ...rows.map(r => r.tot));
  const total = sum(rows, r => r.tot) || 1;
  return rows.map(r => {
    const c = cat(r.id);
    const b = ym ? budgetMese(c, ym) : 0;
    const pct = b ? Math.min(100, r.tot / b * 100) : r.tot / max * 100;
    const col = b && r.tot > b ? 'var(--red)' : catColor(r.id);
    const sub = b ? `di ${eur0(b)}` : `${Math.round(r.tot / total * 100)}%`;
    return `<div class="item">
      <span class="ico" style="background:${catColor(r.id)}22">${esc(c.icona)}</span>
      <span class="txt"><div class="t1">${esc(c.nome)}</div><div class="catbar"><i style="width:${pct}%;background:${col}"></i></div></span>
      <span class="amt">${eur(r.tot)}<small>${sub}</small></span>
    </div>`;
  }).join('');
}
function empty(icon, text, btn) {
  return `<div class="empty"><div class="e-ico">${icon}</div><p>${text}</p>${btn || ''}</div>`;
}

/* ================= viste ================= */
function viewMese() {
  const s = riepilogo(ui.month);
  const isCur = ui.month === ymOf(oggi());
  const hasFisse = list('ricorrenti').length > 0;
  let sub = '';
  if (isCur) {
    const d = new Date();
    const rim = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate() - d.getDate() + 1;
    sub = s.residuo > 0 ? `circa ${eur(s.residuo / rim)} al giorno per i prossimi ${rim} giorni` : 'Hai superato il budget del mese';
  } else if (ui.month < ymOf(oggi())) sub = s.residuo >= 0 ? 'Risparmiato nel mese' : 'Mese chiuso in negativo';
  else sub = 'Previsione';
  const pct = s.disponibile > 0 ? Math.min(100, s.variabili / s.disponibile * 100) : (s.variabili > 0 ? 100 : 0);
  const rip = cfg.annuali === 'ripartite';
  const alt = v => `<small class="t2">${rip ? 'nel mese' : 'ripartite'}: ${eur(v)}</small>`;

  let html = monthNav();
  if (!hasFisse) {
    html += `<div class="card"><h2>Per iniziare</h2>
      <p class="note">Inserisci entrate attese, spese fisse mensili e spese annuali: l'app calcolerà quanto ti resta ogni mese per le spese quotidiane.</p>
      <button class="btn block" data-act="tab" data-tab="fisse">Inserisci spese fisse ed entrate</button></div>`;
  }
  html += `<div class="card hero">
    <div class="label">Ti restano</div>
    <div class="big ${s.residuo < 0 ? 'neg' : ''}">${eur(s.residuo)}</div>
    <div class="sub">${sub}</div>
    <div class="sub">Con le annuali ${rip ? 'contate nel mese di scadenza' : 'ripartite ogni mese'}: <b>${eur(s.residuoAlt)}</b></div>
    <div class="bar ${s.variabili > s.disponibile ? 'over' : ''}"><i style="width:${pct}%"></i></div>
    <div class="bar-legend"><span>Spese quotidiane ${eur(s.variabili)}</span><span>disponibili ${eur(s.disponibile)}</span></div>
  </div>
  <div class="card rows">
    <div class="seg" style="margin-bottom:6px">
      <button class="${rip ? 'on' : ''}" data-act="annuali" data-v="ripartite">Annuali ripartite</button>
      <button class="${!rip ? 'on' : ''}" data-act="annuali" data-v="scadenza">Annuali nel mese</button>
    </div>
    <div class="row"><span>Entrate mensili</span><span class="pos">+${eur(s.entrateMens)}</span></div>
    ${s.entratePer || s.entratePerAlt ? `<div class="row"><span>Entrate annuali<br>${alt(s.entratePerAlt)}</span><span class="pos">+${eur(s.entratePer)}</span></div>` : ''}
    ${s.entrateExtra ? `<div class="row"><span>Entrate extra</span><span class="pos">+${eur(s.entrateExtra)}</span></div>` : ''}
    <div class="row"><span>Spese fisse mensili</span><span>−${eur(s.fisse)}</span></div>
    <div class="row"><span>Spese annuali e periodiche<br>${alt(s.periodicheAlt)}</span><span>−${eur(s.periodiche)}</span></div>
    <div class="row"><span>Spese quotidiane</span><span>−${eur(s.variabili)}</span></div>
    ${s.accantonati ? `<div class="row"><span>Messi nel salvadanaio 🐷<br><small class="t2">già compresi nelle annuali</small></span><span class="t2">${eur(s.accantonati)}</span></div>` : ''}
    <div class="row tot"><span>Saldo</span><span class="${s.residuo < 0 ? 'neg' : 'pos'}">${eur(s.residuo)}</span></div>
  </div>`;

  const settimanali = cats('uscita').filter(c => c.budget > 0 && c.budgetPeriodo === 'settimana');
  if (isCur && settimanali.length) {
    const w = settimanaCorrente();
    const fmtD = d => `${+d.slice(8)} ${MESI_BREVI[+d.slice(5, 7) - 1].toLowerCase()}`;
    const inSett = list('movimenti').filter(x => x.tipo === 'uscita' && !x.ricorrente && x.data >= w.da && x.data <= w.a);
    html += `<div class="card"><h2>Questa settimana <small>${fmtD(w.da)} – ${fmtD(w.a)}</small></h2>${settimanali.map(c => {
      const speso = sum(inSett.filter(x => x.categoria === c.id));
      const resta = c.budget - speso;
      return `<div class="item"><span class="ico" style="background:${catColor(c.id)}22">${esc(c.icona)}</span>
        <span class="txt"><div class="t1">${esc(c.nome)}</div><div class="catbar"><i style="width:${Math.min(100, speso / c.budget * 100)}%;background:${resta < 0 ? 'var(--red)' : catColor(c.id)}"></i></div></span>
        <span class="amt ${resta < 0 ? 'neg' : ''}">${resta < 0 ? 'sforato ' + eur(-resta) : 'restano ' + eur(resta)}<small>${eur(speso)} di ${eur0(c.budget)}</small></span></div>`;
    }).join('')}</div>`;
  }
  const periodiche = list('ricorrenti').filter(r => r.attiva !== false && r.tipo !== 'entrata' && step(r) > 1);
  const prossime = periodiche.map(r => ({ r, sc: scadenza(r) })).filter(x => x.sc && giorniA(x.sc.data) <= 60).sort((a, b) => a.sc.data.localeCompare(b.sc.data));
  if (isCur && periodiche.length) {
    html += `<div class="card"><h2>Prossime scadenze <small>60 giorni</small></h2>${prossime.length ? prossime.map(({ r, sc }) => `
      <button class="item" data-act="voce" data-id="${esc(r.id)}">
        <span class="ico" style="background:${catColor(r.categoria)}22">${esc(cat(r.categoria).icona)}</span>
        <span class="txt"><div class="t1">${esc(r.nome)}</div><div class="t2 ${giorniA(sc.data) <= 15 ? 'neg' : ''}">${fmtData(sc.data)} · ${fraGiorni(sc.data)}</div></span>
        <span class="amt">${eur(r.importo)}<small>${statoSalvadanaio(r, sc)}</small></span>
      </button>`).join('') : '<p class="note" style="margin:0">Nessuna scadenza nei prossimi 60 giorni.</p>'}
      <div class="rows" style="margin-top:6px"><div class="row"><span>Da accantonare ogni mese</span><span>${eur(sum(periodiche, r => r.importo / step(r)))}</span></div></div>
      <div style="text-align:center;margin-top:4px"><button class="link" data-act="accantonamenti">Dettaglio per voce</button></div></div>`;
  } else if (s.scadenze.length) {
    html += `<div class="card"><h2>Annuali e periodiche di questo mese</h2>${s.scadenze.map(r => ricRow(r)).join('')}</div>`;
  }
  const pc = perCategoria(s.uscite);
  html += `<div class="card"><h2>Dove vanno i soldi <small>spese quotidiane</small></h2>${
    pc.length ? catRows(pc, ui.month) : empty('🧺', 'Nessuna spesa registrata in questo mese')}</div>`;
  const ultimi = [...s.movs].sort((a, b) => (b.data || '').localeCompare(a.data || '') || b.updatedAt - a.updatedAt).slice(0, 5);
  if (ultimi.length) {
    html += `<div class="card"><h2>Ultimi movimenti</h2>${ultimi.map(x => movRow(x, true)).join('')}
      <div style="text-align:center;margin-top:8px"><button class="link" data-act="tab" data-tab="movimenti">Vedi tutti</button></div></div>`;
  }
  return html;
}

function viewMovimenti() {
  let movs = list('movimenti').filter(x => ymOf(x.data) === ui.month);
  if (ui.fCat) movs = movs.filter(x => x.categoria === ui.fCat);
  if (ui.fChi) movs = movs.filter(x => x.chi === ui.fChi);
  if (ui.q) { const q = ui.q.toLowerCase(); movs = movs.filter(x => (x.nota + ' ' + cat(x.categoria).nome).toLowerCase().includes(q)); }
  movs.sort((a, b) => (b.data || '').localeCompare(a.data || '') || b.updatedAt - a.updatedAt);
  const usc = sum(movs.filter(x => x.tipo === 'uscita')), ent = sum(movs.filter(x => x.tipo === 'entrata'));

  let html = monthNav() + `<div class="filters">
    <select data-change="fCat"><option value="">Tutte le categorie</option>${cats().map(c => `<option value="${esc(c.id)}" ${ui.fCat === c.id ? 'selected' : ''}>${esc(c.icona + ' ' + c.nome)}</option>`).join('')}</select>
    <select data-change="fChi"><option value="">Tutti</option>${nomiChi().map(n => `<option ${ui.fChi === n ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>
  </div>
  <div class="filters"><input type="search" placeholder="Cerca nelle note…" value="${esc(ui.q)}" data-input="q"></div>
  <div class="kpis">
    <div class="kpi"><div class="k">Uscite</div><div class="v">${eur(usc)}</div></div>
    <div class="kpi"><div class="k">Entrate extra</div><div class="v pos">${eur(ent)}</div></div>
    <div class="kpi"><div class="k">Movimenti</div><div class="v">${movs.length}</div></div>
  </div>`;
  if (!movs.length) return html + `<div class="card">${empty('🧾', 'Nessun movimento', '<button class="btn" data-act="newMov">Aggiungi una spesa</button>')}</div>`;
  const days = {};
  movs.forEach(x => { (days[x.data] = days[x.data] || []).push(x); });
  for (const [d, xs] of Object.entries(days)) {
    const tot = sum(xs.filter(x => x.tipo === 'uscita'));
    html += `<div class="day-h"><span>${esc(fmtGiorno(d))}</span><span>${tot ? '−' + eur(tot) : ''}</span></div>
      <div class="card" style="padding:4px 16px">${xs.map(x => movRow(x)).join('')}</div>`;
  }
  return html;
}

function ricRow(r) {
  const c = cat(r.categoria);
  const s = step(r);
  let when = r.frequenza;
  if (s > 1) {
    const mesi = [];
    for (let m = 1; m <= 12; m++) if (scadeNelMese(r, m)) mesi.push(MESI_BREVI[m - 1]);
    when += ' · ' + mesi.join(', ');
  }
  if (r.giorno && s === 1) when += ` · giorno ${r.giorno}`;
  if (s > 1 && r.attiva !== false) { const sc = scadenza(r); if (sc) when = `${r.tipo === 'entrata' ? 'arriva' : 'scade'} il ${fmtData(sc.data)} · ${fraGiorni(sc.data)}`; }
  const sub = s > 1 ? `${eur(r.importo / s)}/mese` : '';
  return `<button class="item ${r.attiva === false ? 'off' : ''}" data-act="editRic" data-id="${esc(r.id)}">
    <span class="ico" style="background:${catColor(r.categoria)}22">${esc(c.icona)}</span>
    <span class="txt"><div class="t1">${esc(r.nome)}</div><div class="t2">${esc(when)}${r.attiva === false ? ' · sospesa' : ''}</div></span>
    <span class="amt ${r.tipo === 'entrata' ? 'pos' : ''}">${eur(r.importo)}<small>${sub}</small></span>
  </button>`;
}

// salvadanaio reale se ci sono versamenti, altrimenti il valore teorico
function statoSalvadanaio(r, sc) {
  const usato = eventiVoce(r.id).some(isAcc);
  const v = usato ? salvadanaio(r.id) : sc.accantonato;
  if (r.importo - v < 0.01) return usato ? '🐷 pronto' : '✓ accantonato (teorico)';
  return `${usato ? '🐷' : 'teorico'} ${eur(v)} · mancano ${eur(r.importo - v)}`;
}
function accRow(r) {
  const c = cat(r.categoria);
  const sc = scadenza(r);
  const usato = eventiVoce(r.id).some(isAcc);
  const saldo = salvadanaio(r.id);
  const pct = sc ? Math.min(100, (usato ? saldo : sc.accantonato) / r.importo * 100) : 0;
  const vicina = sc && giorniA(sc.data) <= 30;
  const pronto = sc && r.importo - (usato ? saldo : sc.accantonato) < 0.01;
  const scad = sc ? `${sc.data < oggi() ? '⚠ ' : ''}scade il ${fmtData(sc.data)}<br>${fraGiorni(sc.data)}${sc.ultimo ? ` · ultima pagata il ${fmtData(sc.ultimo.data)}` : ''}` : '';
  return `<button class="item" data-act="voce" data-id="${esc(r.id)}" style="flex-wrap:wrap">
    <span class="ico" style="background:${catColor(r.categoria)}22">${esc(c.icona)}</span>
    <span class="txt"><div class="t1">${esc(r.nome)}</div>
      <div class="t2 wrap ${vicina ? 'neg' : ''}">${scad}</div></span>
    <span class="amt">${eur(r.importo)}<small>accantona ${eur(r.importo / step(r))}/mese</small></span>
    <span style="flex-basis:100%;padding-left:50px">
      <div class="catbar"><i style="width:${pct}%;background:${pronto ? 'var(--green)' : catColor(r.categoria)}"></i></div>
      <div class="t2 wrap" style="margin-top:3px">${!sc ? '' : usato
        ? `🐷 nel salvadanaio ${eur(saldo)} · ${pronto ? 'pronto ✓' : 'mancano ' + eur(r.importo - saldo)} <span style="opacity:.7">(teorico ${eur(sc.accantonato)})</span>`
        : (pronto ? '✓ dovresti aver già messo da parte tutto' : `teorico ~${eur(sc.accantonato)} · mancano ${eur(sc.mancano)}`)}</div>
    </span>
  </button>`;
}
function viewFisse() {
  const all = list('ricorrenti');
  const att = all.filter(r => r.attiva !== false);
  const mens = att.filter(r => r.tipo !== 'entrata' && step(r) === 1);
  const per = att.filter(r => r.tipo !== 'entrata' && step(r) > 1);
  const ent = att.filter(r => r.tipo === 'entrata');
  const totMens = sum(mens), totPerAnno = sum(per, r => r.importo * 12 / step(r));
  const totEnt = sum(ent, r => r.importo / step(r));
  const segs = { mensili: 'Mensili', periodiche: 'Annuali · accantona', entrate: 'Entrate' };
  let items;
  if (ui.seg === 'mensili') items = all.filter(r => r.tipo !== 'entrata' && step(r) === 1);
  else if (ui.seg === 'periodiche') items = all.filter(r => r.tipo !== 'entrata' && step(r) > 1);
  else items = all.filter(r => r.tipo === 'entrata');
  const prossima = r => (r.attiva !== false && step(r) > 1 && scadenza(r)?.data) || '9999';
  items.sort((a, b) => (b.attiva !== false) - (a.attiva !== false) || prossima(a).localeCompare(prossima(b)) || b.importo / step(b) - a.importo / step(a));
  let lista = items.length ? items.map(ricRow).join('') : empty('📅', 'Nessuna voce');
  let testa = '';
  if (ui.seg === 'periodiche') {
    const attive = items.filter(r => r.attiva !== false);
    lista = items.length ? attive.map(accRow).join('') + items.filter(r => r.attiva === false).map(ricRow).join('') : lista;
    const tot = sum(attive, r => r.importo / step(r));
    const acc = sum(attive, r => scadenza(r)?.accantonato || 0);
    const reale = sum(attive, r => salvadanaio(r.id));
    const meseOra = ymOf(oggi());
    const fatti = attive.filter(r => list('movimenti').some(x => isAcc(x) && x.ricorrente === r.id && ymOf(x.data) === meseOra));
    testa = `<div class="card"><h2>Accantonamento</h2>
      <div class="rows">
        <div class="row tot"><span>Da mettere da parte ogni mese</span><span>${eur(tot)}</span></div>
        <div class="row"><span>Dovresti avere da parte oggi</span><span>${eur(acc)}</span></div>
        <div class="row"><span>🐷 Nel salvadanaio</span><span class="${reale + 0.01 >= acc ? 'pos' : ''}">${eur(reale)}</span></div>
        <div class="row"><span>Totale annuo</span><span>${eur(tot * 12)}</span></div>
      </div>
      ${fatti.length < attive.length
        ? `<button class="btn block" data-act="accantonaMese" style="margin-top:10px">🐷 Metti da parte ${MESI[+meseOra.slice(5) - 1].toLowerCase()} (${eur(sum(attive.filter(r => !fatti.includes(r)), r => r.importo / step(r)))})</button>`
        : `<p class="note pos" style="margin:10px 0 0">✓ Accantonamento di ${MESI[+meseOra.slice(5) - 1].toLowerCase()} fatto</p>`}
      <p class="note" style="margin:8px 0 0">Teorico = quota mensile × mesi trascorsi dall'ultima scadenza. Tocca una voce per mettere soldi nel salvadanaio o segnarla come pagata.</p></div>`;
  }

  let html = `<div class="kpis" style="margin-top:4px">
    <div class="kpi"><div class="k">Entrate / mese</div><div class="v pos">${eur0(totEnt)}</div></div>
    <div class="kpi"><div class="k">Fisse / mese</div><div class="v">${eur0(totMens)}</div></div>
    <div class="kpi"><div class="k">Periodiche / anno</div><div class="v">${eur0(totPerAnno)}</div></div>
  </div>
  <div class="card rows">
    <div class="row"><span>Entrate medie mensili</span><span class="pos">+${eur(totEnt)}</span></div>
    <div class="row"><span>Spese fisse + quota periodiche</span><span>−${eur(totMens + totPerAnno / 12)}</span></div>
    <div class="row tot"><span>Disponibile medio per le spese quotidiane</span><span class="${totEnt - totMens - totPerAnno / 12 < 0 ? 'neg' : 'pos'}">${eur(totEnt - totMens - totPerAnno / 12)}</span></div>
  </div>
  <div class="seg">${Object.entries(segs).map(([k, v]) => `<button class="${ui.seg === k ? 'on' : ''}" data-act="seg" data-seg="${k}">${v}</button>`).join('')}</div>
  ${testa}<div class="card" style="padding:4px 16px">${lista}</div>
  <button class="btn block" data-act="newRic">+ Aggiungi ${ui.seg === 'entrate' ? 'entrata' : 'spesa'}</button>
  <p class="note" style="margin-top:12px;text-align:center">Hai già un elenco? <button class="link" data-act="importCsv">Importalo da CSV / Excel</button></p>`;
  return html;
}

function viewStats() {
  // si parte dal primo mese di utilizzo: prima non ci sono dati reali
  const primo = [cfg.inizio, ...list('movimenti').map(x => ymOf(x.data))].filter(Boolean).sort()[0] || ui.month;
  const months = [];
  for (let i = ui.range - 1; i >= 0; i--) { const ym = addMonths(ui.month, -i); if (ym >= primo) months.push(ym); }
  if (!months.length) months.push(ui.month);
  const n = months.length;
  const data = months.map(ym => ({ ym, ...riepilogo(ym) }));
  const W = 340, H = 170, pl = 4, pb = 18, pt = 8;
  const max = Math.max(1, ...data.map(d => Math.max(d.entrate, d.fisse + d.periodiche + d.variabili)));
  const bw = (W - pl * 2) / n;
  const y = v => (H - pb - pt) * (v / max);
  let bars = '';
  data.forEach((d, i) => {
    const x = pl + i * bw;
    const w = Math.min(26, bw * .42);
    const hF = y(d.fisse + d.periodiche), hV = y(d.variabili), hE = y(d.entrate);
    const base = H - pb;
    bars += `<rect x="${x + bw / 2 - w - 1}" y="${base - hE}" width="${w}" height="${hE}" rx="3" fill="var(--green)" opacity=".8"/>
      <rect x="${x + bw / 2 + 1}" y="${base - hF}" width="${w}" height="${hF}" rx="0" fill="#94a3b8"/>
      <rect x="${x + bw / 2 + 1}" y="${base - hF - hV}" width="${w}" height="${hV}" rx="0" fill="var(--accent)"/>
      <text x="${x + bw / 2}" y="${H - 4}" text-anchor="middle">${MESI_BREVI[+d.ym.slice(5) - 1]}</text>`;
  });
  const usc = data.flatMap(d => d.uscite);
  const totVar = sum(usc), totEnt = sum(data, d => d.entrate), totOut = sum(data, d => d.fisse + d.periodiche + d.variabili);
  const pc = perCategoria(usc);
  const perChi = {};
  usc.forEach(x => { perChi[x.chi || '—'] = (perChi[x.chi || '—'] || 0) + x.importo; });

  let html = `<div class="seg" style="margin-top:4px">${[3, 6, 12].map(k => `<button class="${ui.range === k ? 'on' : ''}" data-act="range" data-n="${k}">${k} mesi</button>`).join('')}</div>
  <div class="kpis">
    <div class="kpi"><div class="k">Media quotidiane/mese</div><div class="v">${eur0(totVar / n)}</div></div>
    <div class="kpi"><div class="k">Uscite totali</div><div class="v">${eur0(totOut)}</div></div>
    <div class="kpi"><div class="k">Saldo</div><div class="v ${totEnt - totOut < 0 ? 'neg' : 'pos'}">${eur0(totEnt - totOut)}</div></div>
  </div>
  <div class="card chart"><h2>Entrate e uscite <small>${n > 1 ? meseLabel(months[0]) + ' – ' : ''}${meseLabel(ui.month)}</small></h2>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Grafico entrate e uscite">${bars}</svg>
    <div class="legend"><span><i style="background:var(--green)"></i>Entrate</span><span><i style="background:#94a3b8"></i>Fisse e periodiche</span><span><i style="background:var(--accent)"></i>Quotidiane</span></div>
  </div>
  <div class="card"><h2>Spese quotidiane per categoria</h2>${pc.length ? catRows(pc) : empty('📊', 'Nessuna spesa nel periodo')}</div>`;
  const chi = Object.entries(perChi).sort((a, b) => b[1] - a[1]);
  if (chi.length) {
    html += `<div class="card rows"><h2>Chi ha registrato le spese</h2>${chi.map(([k, v]) =>
      `<div class="row"><span>${esc(k)}</span><span>${eur(v)} <small class="t2">(${Math.round(v / (totVar || 1) * 100)}%)</small></span></div>`).join('')}</div>`;
  }
  return html;
}

const VIEWS = { mese: viewMese, movimenti: viewMovimenti, fisse: viewFisse, stats: viewStats };
function render() {
  $('#view').innerHTML = VIEWS[ui.tab]();
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === ui.tab));
  $('#fab').classList.toggle('hidden', ui.tab === 'fisse');
  renderStatus();
}

/* ================= bottom sheet ================= */
let sheetOpen = false;
function openSheet(html) {
  $('#sheetPanel').innerHTML = html;
  $('#sheet').classList.remove('hidden');
  $('#sheetPanel').scrollTop = 0;
  if (!sheetOpen) { history.pushState({ sheet: 1 }, ''); sheetOpen = true; }
}
function closeSheet(fromPop) {
  if (!sheetOpen) return;
  sheetOpen = false;
  $('#sheet').classList.add('hidden');
  $('#sheetPanel').innerHTML = '';
  if (!fromPop) history.back();
}
window.addEventListener('popstate', () => { if (sheetOpen) closeSheet(true); });

/* ---- movimento ---- */
function catChips(tipo, sel) {
  return cats(tipo).map(c => `<button type="button" class="chip ${c.id === sel ? 'on' : ''}" data-act="pickCat" data-id="${esc(c.id)}"><b>${esc(c.icona)}</b>${esc(c.nome)}</button>`).join('');
}
function formMov(id, tipo) {
  const isNew = !id;
  const today = oggi();
  const o = id ? db.movimenti[id] : {
    tipo: tipo || 'uscita', importo: '', categoria: '', nota: '', chi: cfg.nome,
    data: ui.month === ymOf(today) ? today : ui.month + '-01',
  };
  openSheet(`<form data-form="mov">
    <h2>${isNew ? 'Nuovo movimento' : 'Modifica movimento'}</h2>
    <input type="hidden" name="id" value="${esc(id || '')}">
    <input type="hidden" name="categoria" value="${esc(o.categoria)}">
    <div class="radio-row" data-change-group="tipoMov">
      <label><input type="radio" name="tipo" value="uscita" ${o.tipo !== 'entrata' ? 'checked' : ''}>Spesa</label>
      <label><input type="radio" name="tipo" value="entrata" ${o.tipo === 'entrata' ? 'checked' : ''}>Entrata extra</label>
    </div>
    <input class="amount-in" name="importo" inputmode="decimal" placeholder="0,00 €" value="${o.importo ? String(o.importo).replace('.', ',') : ''}" autocomplete="off" required>
    <div class="chips" id="chips">${catChips(o.tipo, o.categoria)}</div>
    <label class="f">Nota<input name="nota" value="${esc(o.nota)}" placeholder="es. Esselunga, benzina…" autocomplete="off"></label>
    <div class="grid2">
      <label class="f">Data<input type="date" name="data" value="${esc(o.data)}" required></label>
      <label class="f">Chi<input name="chi" value="${esc(o.chi)}" list="chiList" autocomplete="off"></label>
    </div>
    <datalist id="chiList">${nomiChi().map(n => `<option value="${esc(n)}">`).join('')}</datalist>
    <div class="btn-row">
      ${isNew ? '<button type="button" class="btn ghost" data-act="closeSheet">Annulla</button>' : `<button type="button" class="btn danger" data-act="delMov" data-id="${esc(id)}">Elimina</button>`}
      <button class="btn">Salva</button>
    </div>
  </form>`);
  if (isNew) setTimeout(() => $('.amount-in')?.focus(), 150);
}

/* ---- ricorrente ---- */
function formRic(id) {
  const isNew = !id;
  const tipoDef = ui.seg === 'entrate' ? 'entrata' : 'uscita';
  const o = id ? db.ricorrenti[id] : {
    nome: '', tipo: tipoDef, importo: '', frequenza: ui.seg === 'periodiche' ? 'annuale' : 'mensile',
    mese: new Date().getMonth() + 1, giorno: '', categoria: '', attiva: true, note: '',
  };
  const catOpts = t => cats(t).map(c => `<option value="${esc(c.id)}" ${o.categoria === c.id ? 'selected' : ''}>${esc(c.icona + ' ' + c.nome)}</option>`).join('');
  openSheet(`<form data-form="ric">
    <h2>${isNew ? 'Nuova voce fissa' : 'Modifica voce fissa'}</h2>
    <input type="hidden" name="id" value="${esc(id || '')}">
    <div class="radio-row">
      <label><input type="radio" name="tipo" value="uscita" ${o.tipo !== 'entrata' ? 'checked' : ''}>Spesa</label>
      <label><input type="radio" name="tipo" value="entrata" ${o.tipo === 'entrata' ? 'checked' : ''}>Entrata</label>
    </div>
    <label class="f">Descrizione<input name="nome" value="${esc(o.nome)}" placeholder="es. Affitto, Stipendio, Bollo auto" required></label>
    <div class="grid2">
      <label class="f">Importo (€)<input name="importo" inputmode="decimal" value="${o.importo ? String(o.importo).replace('.', ',') : ''}" required></label>
      <label class="f">Frequenza<select name="frequenza" data-change="freq">${Object.keys(FREQ).map(f => `<option ${o.frequenza === f ? 'selected' : ''}>${f}</option>`).join('')}</select></label>
    </div>
    <div class="grid2">
      <label class="f" id="meseBox" style="${o.frequenza === 'mensile' ? 'display:none' : ''}">${o.frequenza === 'annuale' ? 'Mese' : 'Primo mese'}<select name="mese">${MESI.map((m, i) => `<option value="${i + 1}" ${+o.mese === i + 1 ? 'selected' : ''}>${m}</option>`).join('')}</select></label>
      <label class="f">Giorno (facolt.)<input name="giorno" inputmode="numeric" value="${esc(o.giorno)}" placeholder="1-31"></label>
    </div>
    <label class="f">Categoria<select name="categoria"><option value="">—</option>
      <optgroup label="Spese">${catOpts('uscita')}</optgroup><optgroup label="Entrate">${catOpts('entrata')}</optgroup></select></label>
    <label class="f">Note<input name="note" value="${esc(o.note)}"></label>
    <label class="check"><input type="checkbox" name="attiva" ${o.attiva !== false ? 'checked' : ''}> Attiva (conteggiata nel budget)</label>
    <div class="btn-row">
      ${isNew ? '<button type="button" class="btn ghost" data-act="closeSheet">Annulla</button>' : `<button type="button" class="btn danger" data-act="delRic" data-id="${esc(id)}">Elimina</button>`}
      <button class="btn">Salva</button>
    </div>
  </form>`);
}

/* ---- voce periodica: salvadanaio e pagamenti ---- */
function openVoce(id) {
  const r = db.ricorrenti[id];
  if (!r) return;
  if (r.tipo === 'entrata' || step(r) === 1) { formRic(id); return; }
  const c = cat(r.categoria);
  const sc = scadenza(r);
  const saldo = salvadanaio(id);
  const quota = r.importo / step(r);
  const ev = eventiVoce(id).reverse();
  const inp = v => String(Math.round(v * 100) / 100).replace('.', ',');
  const pieno = saldo + 0.01 >= r.importo;
  openSheet(`<h2>${esc(c.icona)} ${esc(r.nome)}</h2>
    <div class="rows">
      <div class="row"><span>Importo</span><span>${eur(r.importo)} · ${esc(r.frequenza)}</span></div>
      ${sc ? `<div class="row"><span>Prossima scadenza</span><span class="${giorniA(sc.data) <= 15 ? 'neg' : ''}">${fmtData(sc.data)} · ${fraGiorni(sc.data)}</span></div>` : ''}
      ${sc && sc.ultimo ? `<div class="row"><span>Ultimo pagamento</span><span>${fmtData(sc.ultimo.data)} · ${eur(sc.ultimo.importo)}</span></div>` : ''}
      <div class="row"><span>Quota mensile</span><span>${eur(quota)}</span></div>
      <div class="row tot"><span>🐷 Nel salvadanaio</span><span class="${pieno ? 'pos' : ''}">${eur(saldo)}</span></div>
      ${sc ? `<div class="row"><span>Teorico a oggi</span><span>${eur(sc.accantonato)}</span></div>` : ''}
    </div>
    <div class="bar"><i style="width:${Math.min(100, saldo / r.importo * 100)}%;${pieno ? 'background:var(--green)' : ''}"></i></div>

    <h3>Metti da parte</h3>
    <form data-form="versa" class="grid2" style="align-items:end">
      <input type="hidden" name="id" value="${esc(id)}">
      <label class="f">Importo (€)<input name="importo" inputmode="decimal" value="${inp(quota)}"></label>
      <label class="f">Data<input type="date" name="data" value="${oggi()}"></label>
      <button class="btn" style="grid-column:1/-1">🐷 Aggiungi al salvadanaio</button>
    </form>

    <h3>Pagamento</h3>
    <form data-form="paga" class="grid2" style="align-items:end">
      <input type="hidden" name="id" value="${esc(id)}">
      <label class="f">Importo pagato (€)<input name="importo" inputmode="decimal" value="${inp(r.importo)}"></label>
      <label class="f">Data<input type="date" name="data" value="${oggi()}"></label>
      <button class="btn ghost" style="grid-column:1/-1">✓ Segna come pagata</button>
    </form>
    <p class="note">Il pagamento svuota il salvadanaio della voce e sposta la scadenza al periodo successivo. Non viene contato due volte nelle spese del mese.</p>

    ${ev.length ? `<h3>Storico</h3>${ev.map(x => `<div class="item">
        <span class="ico">${isAcc(x) ? '🐷' : '✓'}</span>
        <span class="txt"><div class="t1">${isAcc(x) ? 'Messo da parte' : 'Pagata'}</div><div class="t2">${esc(fmtGiorno(x.data))}${x.chi ? ' · ' + esc(x.chi) : ''}</div></span>
        <span class="amt">${eur(x.importo)}</span>
        <button class="icon-btn" data-act="delEvento" data-id="${esc(x.id)}" data-voce="${esc(id)}" aria-label="Elimina">✕</button>
      </div>`).join('')}` : ''}
    <div class="btn-row">
      <button class="btn ghost" data-act="closeSheet">Chiudi</button>
      <button class="btn ghost" data-act="editRic" data-id="${esc(id)}">Modifica voce</button>
    </div>`);
}
function movimentoVoce(r, tipo, importo, data) {
  put('movimenti', {
    id: uid('m'), tipo, importo, data, ricorrente: r.id, categoria: r.categoria,
    nota: (tipo === 'accantonamento' ? 'Accantonamento ' : 'Pagamento ') + r.nome, chi: cfg.nome,
  });
}

/* ---- categoria ---- */
function formCat(id) {
  const o = id ? db.categorie[id] : { nome: '', icona: '📦', tipo: 'uscita', budget: 0, budgetPeriodo: 'mese', ordine: 50 };
  openSheet(`<form data-form="cat">
    <h2>${id ? 'Modifica categoria' : 'Nuova categoria'}</h2>
    <input type="hidden" name="id" value="${esc(id || '')}">
    <div class="grid2" style="grid-template-columns:80px 1fr">
      <label class="f">Icona<input name="icona" value="${esc(o.icona)}" maxlength="4" style="text-align:center"></label>
      <label class="f">Nome<input name="nome" value="${esc(o.nome)}" required></label>
    </div>
    <div class="radio-row">
      <label><input type="radio" name="tipo" value="uscita" ${o.tipo === 'uscita' ? 'checked' : ''}>Spesa</label>
      <label><input type="radio" name="tipo" value="entrata" ${o.tipo === 'entrata' ? 'checked' : ''}>Entrata</label>
      <label><input type="radio" name="tipo" value="entrambi" ${o.tipo === 'entrambi' ? 'checked' : ''}>Entrambi</label>
    </div>
    <div class="grid2">
      <label class="f">Budget (€, vuoto = nessuno)<input name="budget" inputmode="decimal" value="${o.budget ? String(o.budget).replace('.', ',') : ''}" placeholder="0"></label>
      <label class="f">Ogni<select name="budgetPeriodo">
        <option value="mese" ${o.budgetPeriodo !== 'settimana' ? 'selected' : ''}>mese</option>
        <option value="settimana" ${o.budgetPeriodo === 'settimana' ? 'selected' : ''}>settimana</option></select></label>
    </div>
    <p class="note">Il budget settimanale va da lunedì a domenica. Nella vista mensile vale budget × giorni del mese ÷ 7 (es. 120 €/settimana ≈ 531 € a ottobre).</p>
    <div class="btn-row">
      ${id ? `<button type="button" class="btn danger" data-act="delCat" data-id="${esc(id)}">Elimina</button>` : ''}
      <button type="button" class="btn ghost" data-act="settings">Indietro</button>
      <button class="btn">Salva</button>
    </div>
  </form>`);
}

/* ---- impostazioni ---- */
let installEvt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; });

function openSettings() {
  const standalone = matchMedia('(display-mode: standalone)').matches;
  openSheet(`<form data-form="cfg">
    <h2>Impostazioni</h2>
    <label class="f">Il tuo nome (su questo telefono)<input name="nome" value="${esc(cfg.nome)}" placeholder="es. Matteo" autocomplete="off"></label>
    <h3>Condivisione con Google Sheet</h3>
    <p class="note">Inserisci su entrambi i telefoni lo stesso URL e la stessa chiave. Istruzioni nel file <code>LEGGIMI.md</code>.</p>
    <label class="f">URL dello script (App web)<input name="url" value="${esc(cfg.url)}" placeholder="https://script.google.com/macros/s/…/exec" autocomplete="off"></label>
    <label class="f">Chiave<input name="key" value="${esc(cfg.key)}" autocomplete="off"></label>
    <button type="button" class="btn ghost block" data-act="testConn">Prova collegamento</button>
    <h3>Spese annuali e periodiche</h3>
    <div class="radio-row">
      <label><input type="radio" name="annuali" value="ripartite" ${cfg.annuali === 'ripartite' ? 'checked' : ''}>Ripartite ogni mese</label>
      <label><input type="radio" name="annuali" value="scadenza" ${cfg.annuali === 'scadenza' ? 'checked' : ''}>Nel mese di scadenza</label>
    </div>
    <p class="note">"Ripartite": una spesa annuale di 600 € pesa 50 € al mese (accantonamento). "Nel mese di scadenza": pesa tutta nel mese in cui la paghi.</p>
    <button class="btn block">Salva impostazioni</button>
  </form>
  <h3>Categorie</h3>
  <div>${cats().map(c => `<button class="item" data-act="editCat" data-id="${esc(c.id)}">
      <span class="ico" style="background:${catColor(c.id)}22">${esc(c.icona)}</span>
      <span class="txt"><div class="t1">${esc(c.nome)}</div><div class="t2">${c.tipo}${c.budget ? ' · budget ' + budgetLabel(c) : ''}</div></span><span class="amt">›</span></button>`).join('')}</div>
  <button class="btn ghost block" data-act="newCat" style="margin-top:8px">+ Nuova categoria</button>
  <h3>Dati</h3>
  <div class="btn-row" style="margin-top:0">
    <button class="btn ghost" data-act="importCsv">Importa CSV</button>
    <button class="btn ghost" data-act="exportCsv">Esporta CSV</button>
  </div>
  <div class="btn-row" style="margin-top:8px">
    <button class="btn ghost" data-act="exportJson">Backup JSON</button>
    <button class="btn ghost" data-act="resetLocal">Riscarica dal foglio</button>
  </div>
  ${!standalone ? `<h3>App</h3><button class="btn block" data-act="install">📲 Installa sul telefono</button>` : ''}
  <p class="note" style="margin-top:16px;text-align:center">Spese Casa · dati salvati su questo telefono${cfg.url ? ' e sul Google Sheet' : ''}</p>`);
}

/* ---- import CSV ---- */
function openImport() {
  openSheet(`<form data-form="import">
    <h2>Importa spese fisse ed entrate</h2>
    <p class="note">Incolla le righe copiate da Excel o da un CSV. Colonne nell'ordine:<br>
    <code>descrizione; importo; tipo; frequenza; mese; categoria; giorno</code><br>
    tipo = <code>uscita</code>/<code>entrata</code> · frequenza = <code>mensile</code>, <code>bimestrale</code>, <code>trimestrale</code>, <code>semestrale</code>, <code>annuale</code> · mese = 1-12 (per le non mensili). Le categorie che non esistono vengono create.</p>
    <label class="f">Dati<textarea name="txt" placeholder="Affitto;850;uscita;mensile;;Casa&#10;Stipendio Matteo;2100;entrata;mensile;;Stipendio&#10;Bollo auto;220;uscita;annuale;3;Auto e trasporti"></textarea></label>
    <label class="f">Oppure scegli un file .csv<input type="file" accept=".csv,.txt,.tsv" data-change="csvFile"></label>
    <div class="btn-row"><button type="button" class="btn ghost" data-act="closeSheet">Annulla</button><button class="btn">Importa</button></div>
  </form>`);
}
function parseRighe(txt) {
  const lines = txt.split(/\r?\n/).filter(l => l.trim());
  if (!lines.length) return [];
  const sep = ['\t', ';', ','].find(s => lines[0].includes(s)) || ';';
  const rows = lines.map(l => l.split(sep).map(x => x.trim().replace(/^"(.*)"$/, '$1')));
  let cols = ['nome', 'importo', 'tipo', 'frequenza', 'mese', 'categoria', 'giorno'];
  if (rows.length && !num(rows[0][1]) && /descr|nome|voce|import/i.test(rows[0].join(' '))) {
    const h = rows.shift().map(x => x.toLowerCase());
    const map = { nome: /descr|nome|voce/, importo: /import|€|euro/, tipo: /tipo/, frequenza: /freq|period/, mese: /mese/, categoria: /categ/, giorno: /giorno/ };
    cols = h.map(x => Object.keys(map).find(k => map[k].test(x)) || '');
  }
  const meseNum = v => { const n = parseInt(v, 10); if (n >= 1 && n <= 12) return n; const i = MESI.findIndex(m => m.toLowerCase().startsWith(String(v).toLowerCase().slice(0, 3))); return i >= 0 && v ? i + 1 : 1; };
  return rows.map(r => {
    const o = {};
    cols.forEach((k, i) => { if (k) o[k] = r[i] ?? ''; });
    let freq = String(o.frequenza || 'mensile').toLowerCase().trim();
    if (!FREQ[freq]) freq = Object.keys(FREQ).find(f => f.startsWith(freq.slice(0, 4))) || 'mensile';
    return {
      nome: o.nome || 'Senza nome', importo: Math.abs(num(o.importo)),
      tipo: /^entr/i.test(o.tipo || '') ? 'entrata' : 'uscita',
      frequenza: freq, mese: meseNum(o.mese), giorno: Math.min(31, parseInt(o.giorno, 10) || 0) || '', categoriaNome: o.categoria || '',
    };
  }).filter(o => o.importo > 0);
}
function doImport(txt) {
  const rows = parseRighe(txt);
  if (!rows.length) { toast('Nessuna riga valida trovata'); return; }
  const now = Date.now();
  rows.forEach((r, i) => {
    let catId = catByName(r.categoriaNome);
    if (!catId && r.categoriaNome) {
      catId = 'c_' + r.categoriaNome.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
      if (!db.categorie[catId] || db.categorie[catId].deleted) {
        db.categorie[catId] = { id: catId, nome: r.categoriaNome, icona: r.tipo === 'entrata' ? '💰' : '📦', tipo: r.tipo, budget: 0, ordine: 60, updatedAt: now, deleted: false };
        markPending('categorie', catId);
      }
    }
    const id = uid('r') + i;
    db.ricorrenti[id] = { id, nome: r.nome, tipo: r.tipo, importo: r.importo, frequenza: r.frequenza, mese: r.mese, giorno: r.giorno, categoria: catId || '', attiva: true, note: '', updatedAt: now, deleted: false };
    markPending('ricorrenti', id);
  });
  save(); syncSoon();
  closeSheet();
  ui.tab = 'fisse';
  render();
  toast(`Importate ${rows.length} voci`);
}

/* ---- export ---- */
function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function exportCsv() {
  const q = v => /[;"\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? '');
  const lines = ['data;tipo;importo;categoria;nota;chi'];
  list('movimenti').sort((a, b) => (a.data || '').localeCompare(b.data || '')).forEach(x =>
    lines.push([x.data, x.tipo, String(x.importo).replace('.', ','), cat(x.categoria).nome, x.nota, x.chi].map(q).join(';')));
  download(`movimenti-${oggi()}.csv`, '﻿' + lines.join('\n'), 'text/csv');
}

/* ================= azioni ================= */
const ACT = {
  tab: d => { ui.tab = d.tab; closeSheet(); render(); scrollTo(0, 0); },
  month: d => { ui.month = addMonths(ui.month, +d.d); render(); },
  seg: d => { ui.seg = d.seg; render(); },
  voce: d => openVoce(d.id),
  delEvento: d => { if (confirm('Eliminare questa registrazione?')) { remove('movimenti', d.id); openVoce(d.voce); } },
  accantonaMese: () => {
    const meseOra = ymOf(oggi());
    const da = list('ricorrenti').filter(r => r.attiva !== false && r.tipo !== 'entrata' && step(r) > 1)
      .filter(r => !list('movimenti').some(x => isAcc(x) && x.ricorrente === r.id && ymOf(x.data) === meseOra));
    const tot = sum(da, r => r.importo / step(r));
    if (!da.length || !confirm(`Mettere da parte ${eur(tot)} per ${da.length} voci?\n\n${da.map(r => `• ${r.nome}: ${eur(r.importo / step(r))}`).join('\n')}`)) return;
    da.forEach(r => movimentoVoce(r, 'accantonamento', Math.round(r.importo / step(r) * 100) / 100, oggi()));
    toast(`🐷 Messi da parte ${eur(tot)}`);
  },
  accantonamenti: () => { ui.tab = 'fisse'; ui.seg = 'periodiche'; render(); scrollTo(0, 0); },
  annuali: d => { cfg.annuali = d.v; saveCfg(); render(); },
  range: d => { ui.range = +d.n; render(); },
  sync: () => sync(true),
  settings: () => openSettings(),
  closeSheet: () => closeSheet(),
  newMov: () => formMov(null, 'uscita'),
  editMov: d => formMov(d.id),
  delMov: d => { if (confirm('Eliminare questo movimento?')) { remove('movimenti', d.id); closeSheet(); toast('Movimento eliminato'); } },
  newRic: () => formRic(null),
  editRic: d => formRic(d.id),
  delRic: d => { if (confirm('Eliminare questa voce?')) { remove('ricorrenti', d.id); closeSheet(); } },
  newCat: () => formCat(null),
  editCat: d => formCat(d.id),
  delCat: d => {
    const used = list('movimenti').some(x => x.categoria === d.id) || list('ricorrenti').some(x => x.categoria === d.id);
    if (confirm(used ? 'La categoria è usata da alcuni movimenti, che resteranno "senza categoria". Eliminare?' : 'Eliminare la categoria?')) { remove('categorie', d.id); openSettings(); }
  },
  pickCat: (d, el) => {
    const f = el.closest('form');
    f.categoria.value = d.id;
    f.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', c === el));
  },
  importCsv: () => openImport(),
  exportCsv: () => exportCsv(),
  exportJson: () => download(`spese-casa-backup-${oggi()}.json`, JSON.stringify(db, null, 1), 'application/json'),
  resetLocal: () => {
    if (!cfg.url) { toast('Prima collega il Google Sheet'); return; }
    if (pendingCount() && !confirm(`Ci sono ${pendingCount()} modifiche non ancora inviate che andranno perse. Continuare?`)) return;
    COLLS.forEach(c => { db[c] = {}; meta.pending[c] = []; });
    meta.lastPull = 0;
    save(); closeSheet(); render();
    sync(true).then(() => { seed(); render(); });
  },
  install: async () => {
    if (installEvt) { installEvt.prompt(); await installEvt.userChoice; installEvt = null; }
    else toast('Dal menu ⋮ di Chrome scegli "Installa app" o "Aggiungi a schermata Home"');
  },
  testConn: async (d, el) => {
    const f = el.closest('form');
    const url = f.url.value.trim(), key = f.key.value.trim();
    if (!url) { toast('Inserisci l\'URL'); return; }
    el.textContent = 'Verifica…';
    try { await api({ action: 'ping' }, url, key); toast('✅ Collegamento riuscito'); }
    catch (e) { toast('❌ ' + e.message); }
    el.textContent = 'Prova collegamento';
  },
};

const FORMS = {
  mov: fd => {
    const importo = num(fd.get('importo'));
    if (importo <= 0) { toast('Inserisci un importo'); return; }
    const categoria = fd.get('categoria');
    if (!categoria) { toast('Scegli una categoria'); return; }
    const id = fd.get('id') || uid('m');
    const chi = String(fd.get('chi') || '').trim();
    if (chi && !cfg.nome) { cfg.nome = chi; saveCfg(); }
    put('movimenti', {
      ...(db.movimenti[id] || {}), id, importo, categoria, tipo: fd.get('tipo'),
      data: fd.get('data'), nota: String(fd.get('nota') || '').trim(), chi,
    });
    closeSheet();
    toast('Salvato');
  },
  ric: fd => {
    const importo = num(fd.get('importo'));
    if (importo <= 0) { toast('Inserisci un importo'); return; }
    const id = fd.get('id') || uid('r');
    put('ricorrenti', {
      ...(db.ricorrenti[id] || {}), id, importo, nome: String(fd.get('nome')).trim(), tipo: fd.get('tipo'),
      frequenza: fd.get('frequenza'), mese: +fd.get('mese') || 1, giorno: +fd.get('giorno') || '',
      categoria: fd.get('categoria'), note: String(fd.get('note') || '').trim(), attiva: fd.get('attiva') === 'on',
    });
    closeSheet();
  },
  cat: fd => {
    const id = fd.get('id') || 'c_' + uid('');
    put('categorie', {
      ordine: 50, ...(db.categorie[id] || {}), id, nome: String(fd.get('nome')).trim(),
      icona: String(fd.get('icona') || '📦').trim(), tipo: fd.get('tipo'), budget: num(fd.get('budget')),
      budgetPeriodo: fd.get('budgetPeriodo') === 'settimana' ? 'settimana' : 'mese',
    });
    openSettings();
  },
  cfg: fd => {
    const url = String(fd.get('url') || '').trim(), key = String(fd.get('key') || '').trim();
    const changed = url !== cfg.url || key !== cfg.key;
    cfg = { ...cfg, nome: String(fd.get('nome') || '').trim(), url, key, annuali: fd.get('annuali') || 'ripartite' };
    saveCfg();
    if (changed && url) {
      // nuovo foglio: invia tutto quello che c'è sul telefono e riscarica
      COLLS.forEach(c => { meta.pending[c] = Object.keys(db[c]); });
      meta.lastPull = 0;
      save();
    }
    closeSheet();
    render();
    toast('Impostazioni salvate');
    if (url) sync(true);
  },
  import: fd => doImport(String(fd.get('txt') || '')),
  versa: fd => {
    const r = db.ricorrenti[fd.get('id')], importo = num(fd.get('importo'));
    if (!r || importo <= 0) { toast('Inserisci un importo'); return; }
    movimentoVoce(r, 'accantonamento', importo, fd.get('data') || oggi());
    toast(`🐷 ${eur(importo)} messi da parte`);
    openVoce(r.id);
  },
  paga: fd => {
    const r = db.ricorrenti[fd.get('id')], importo = num(fd.get('importo'));
    if (!r || importo <= 0) { toast('Inserisci un importo'); return; }
    movimentoVoce(r, 'uscita', importo, fd.get('data') || oggi());
    toast(`✓ ${r.nome} pagata`);
    openVoce(r.id);
  },
};

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el || !ACT[el.dataset.act]) return;
  e.preventDefault();
  ACT[el.dataset.act](el.dataset, el);
});
document.addEventListener('submit', e => {
  const f = e.target;
  if (!FORMS[f.dataset.form]) return;
  e.preventDefault();
  FORMS[f.dataset.form](new FormData(f), f);
});
document.addEventListener('change', e => {
  const t = e.target;
  const k = t.dataset.change;
  if (k === 'fCat' || k === 'fChi') { ui[k] = t.value; render(); }
  else if (k === 'freq') {
    const box = $('#meseBox');
    box.style.display = t.value === 'mensile' ? 'none' : '';
    box.firstChild.textContent = t.value === 'annuale' ? 'Mese' : 'Primo mese';
  } else if (k === 'csvFile' && t.files[0]) {
    t.files[0].text().then(txt => { t.form.txt.value = txt; });
  } else if (t.name === 'tipo' && t.form && t.form.dataset.form === 'mov') {
    t.form.categoria.value = '';
    $('#chips').innerHTML = catChips(t.value, '');
  }
});
let qTimer;
document.addEventListener('input', e => {
  if (e.target.dataset.input !== 'q') return;
  clearTimeout(qTimer);
  qTimer = setTimeout(() => {
    ui.q = e.target.value;
    render();
    const inp = document.querySelector('[data-input="q"]');
    if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
  }, 250);
});

/* ================= avvio ================= */
if (!cfg.inizio) { cfg.inizio = ymOf(oggi()); saveCfg(); }
seed();
render();
if (!cfg.nome) setTimeout(openSettings, 300);
sync();
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') sync(); });
setInterval(() => { if (document.visibilityState === 'visible') sync(); }, 60000);
window.addEventListener('online', () => sync());
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
