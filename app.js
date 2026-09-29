(() => {
'use strict';

/* ================= helpers ================= */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = matchMedia('(pointer: fine)').matches;
const money = n => '$' + (Math.round((+n || 0) * 100) / 100).toFixed(2);
const shortMoney = n => { const v = +n || 0; return v >= 100 ? '$' + Math.round(v) : money(v); };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const today = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const fmtDate = d => { if (!d) return ''; const t = new Date(d + 'T12:00:00'); return isNaN(t) ? d : t.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); };
const TAGS = ['pink', 'yellow', 'blue', 'green', 'orange'];

/* ================= state ================= */
function normalize(d) {
  d = d && typeof d === 'object' ? d : {};
  const s = d.settings || {};
  return {
    v: 1,
    settings: { name: s.name || 'Worn Again', tagline: s.tagline ?? '', handle: s.handle || '' },
    outfits: Array.isArray(d.outfits) ? d.outfits.filter(o => o && o.id).map(o => ({
      id: String(o.id), title: o.title || 'Untitled fit', date: o.date || '', tag: TAGS.includes(o.tag) ? o.tag : 'pink',
      photos: Array.isArray(o.photos) ? o.photos : [], vibes: Array.isArray(o.vibes) ? o.vibes : [],
      pieces: Array.isArray(o.pieces) ? o.pieces.map(p => ({ name: p.name || '', source: p.source || '', price: +p.price || 0, thrifted: p.thrifted !== false })) : [],
      notes: o.notes || ''
    })) : []
  };
}
const CFG = window.WORN_AGAIN || {};
const configured = !!(CFG.supabaseUrl && CFG.supabaseKey && !/YOUR_/.test(CFG.supabaseUrl + CFG.supabaseKey));
const sb = configured && window.supabase ? window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey) : null;
const BUCKET = 'photos';
const CACHE_KEY = 'worn-again-cache-v1';

const ui = { vibe: 'all', sort: 'new', canWrite: false, openId: null, loaded: false, session: null };
let data = normalize({});
try { const c = JSON.parse(localStorage.getItem(CACHE_KEY)); if (c && sb) { data = normalize(c); ui.loaded = true; } } catch {}
const cacheData = () => { try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch {} };

const blobUrls = new Map();          // storage path -> object URL for photos uploaded during this visit
const imgSrc = p => !p || /^(https?:|data:|blob:)/.test(p) ? p : (blobUrls.get(p) || sb?.storage.from(BUCKET).getPublicUrl(p).data.publicUrl || p);
let samples = null;

const outfitTotal = o => o.pieces.reduce((a, p) => a + (+p.price || 0), 0);
const outfitSources = o => [...new Set(o.pieces.filter(p => p.source).map(p => p.source.trim()))];
const isSampleMode = () => ui.loaded && data.outfits.length === 0;
const list = () => !ui.loaded ? [] : isSampleMode() ? getSamples() : data.outfits;
const findFit = id => list().find(o => o.id === id);

/* ================= sample fits (drawn fabric, never saved) ================= */
function getSamples() {
  if (samples) return samples;
  const defs = [
    { title: 'Gingham picnic', date: '2026-06-14', tag: 'pink', pattern: 'gingham', shape: 'dress', bg: '#F6D5DF', ink: '#E2517F', vibes: ['summer', 'cottage'],
      pieces: [['Gingham sundress', 'Goodwill', 6.99, true], ['Canvas tote', 'Estate sale', 2, true], ['White sneakers', 'Target', 32, false]],
      notes: 'Example fit. Your notes go here: where you wore it, what you would change, the story behind a piece.' },
    { title: 'Breton on repeat', date: '2026-04-02', tag: 'blue', pattern: 'stripe', shape: 'shirt', bg: '#D7E2F7', ink: '#1F2E6B', vibes: ['classic', 'spring'],
      pieces: [['Striped boat-neck tee', 'Depop', 14, true], ['Straight-leg jeans', "Plato's Closet", 11.5, true], ['Red ballet flats', 'Salvation Army', 5, true]], notes: '' },
    { title: 'Plaid blazer era', date: '2025-11-20', tag: 'orange', pattern: 'plaid', shape: 'jacket', bg: '#F3DCC8', ink: '#8C3B1E', vibes: ['fall', 'layered', '90s'],
      pieces: [['Wool plaid blazer', 'Buffalo Exchange', 18, true], ['Black turtleneck', 'Goodwill', 3.99, true], ['Loafers', 'Poshmark', 22, true]], notes: '' },
    { title: 'Polka dot date night', date: '2025-09-05', tag: 'yellow', pattern: 'dots', shape: 'dress', bg: '#FBEBB5', ink: '#1C1C2E', vibes: ['night out', 'retro'],
      pieces: [['Silk polka dot slip', 'Estate sale', 8, true], ['Kitten heels', 'Goodwill', 6.99, true]], notes: '' },
    { title: 'Corduroy Sunday', date: '2025-10-12', tag: 'green', pattern: 'cord', shape: 'jacket', bg: '#D6EBDD', ink: '#3E6B4E', vibes: ['fall', 'cozy'],
      pieces: [['Cord chore jacket', 'Thrift haul', 12, true], ['Cream knit', 'Uniqlo', 29.9, false], ['Brown trousers', 'Savers', 7.49, true]], notes: '' }
  ];
  samples = defs.map((d, i) => ({
    id: 'sample-' + i, sample: true, title: d.title, date: d.date, tag: d.tag, vibes: d.vibes, notes: d.notes,
    pieces: d.pieces.map(([name, source, price, thrifted]) => ({ name, source, price, thrifted })),
    photos: [drawSample(d, i)]
  }));
  return samples;
}
function drawSample(d, i) {
  const W = 600, H = i % 2 ? 760 : 820, c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  x.fillStyle = d.bg; x.fillRect(0, 0, W, H);
  // soft floor shadow
  const g = x.createRadialGradient(W / 2, H * .92, 10, W / 2, H * .92, W * .45);
  g.addColorStop(0, 'rgba(0,0,0,.14)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, W, H);
  // fabric tile
  const t = document.createElement('canvas'), tx = t.getContext('2d'), s = 44; t.width = t.height = s;
  tx.fillStyle = '#FFFDF8'; tx.fillRect(0, 0, s, s);
  if (d.pattern === 'gingham') { tx.fillStyle = d.ink + '88'; tx.fillRect(0, 0, s / 2, s); tx.fillRect(0, 0, s, s / 2); }
  if (d.pattern === 'stripe') { tx.fillStyle = d.ink; tx.fillRect(0, 0, s, s * .32); }
  if (d.pattern === 'plaid') { tx.fillStyle = d.ink; tx.fillRect(0, 0, s, s); tx.fillStyle = '#D9A15A99'; tx.fillRect(0, 10, s, 12); tx.fillRect(10, 0, 12, s); tx.fillStyle = '#1B1B2A66'; tx.fillRect(0, 30, s, 3); tx.fillRect(30, 0, 3, s); }
  if (d.pattern === 'dots') { tx.fillStyle = d.ink; tx.fillRect(0, 0, s, s); tx.fillStyle = '#FFFDF8'; [[11, 11], [33, 33]].forEach(([a, b]) => { tx.beginPath(); tx.arc(a, b, 5, 0, 7); tx.fill(); }); }
  if (d.pattern === 'cord') { for (let k = 0; k < s; k += 5.5) { tx.fillStyle = k % 11 ? d.ink : '#5E8E6E'; tx.fillRect(k, 0, 4, s); } }
  const pat = x.createPattern(t, 'repeat');
  const cx = W / 2, top = 150, bot = H - 90;
  // hanger
  x.strokeStyle = '#2A2A3A'; x.lineWidth = 7; x.lineCap = 'round'; x.lineJoin = 'round';
  x.beginPath(); x.moveTo(cx, 108); x.bezierCurveTo(cx, 80, cx + 30, 80, cx + 30, 58); x.bezierCurveTo(cx + 30, 36, cx - 6, 34, cx - 12, 56); x.stroke();
  x.beginPath(); x.moveTo(cx, 108); x.lineTo(cx - 170, top + 10); x.lineTo(cx + 170, top + 10); x.closePath(); x.stroke();
  // garment
  const P = {
    dress: [[cx - 70, top], [cx - 35, top + 18], [cx, top + 30], [cx + 35, top + 18], [cx + 70, top], [cx + 88, top + 170], [cx + 205, bot], [cx - 205, bot], [cx - 88, top + 170]],
    shirt: [[cx - 70, top], [cx - 30, top + 34], [cx + 30, top + 34], [cx + 70, top], [cx + 215, top + 90], [cx + 170, top + 190], [cx + 125, top + 150], [cx + 125, bot - 90], [cx - 125, bot - 90], [cx - 125, top + 150], [cx - 170, top + 190], [cx - 215, top + 90]],
    jacket: [[cx - 80, top], [cx, top + 110], [cx + 80, top], [cx + 185, top + 50], [cx + 225, bot - 60], [cx + 170, bot - 50], [cx + 140, top + 190], [cx + 140, bot - 30], [cx - 140, bot - 30], [cx - 140, top + 190], [cx - 170, bot - 50], [cx - 225, bot - 60], [cx - 185, top + 50]]
  }[d.shape];
  x.save(); x.shadowColor = 'rgba(0,0,0,.22)'; x.shadowBlur = 30; x.shadowOffsetY = 16;
  x.beginPath(); P.forEach(([a, b], k) => k ? x.lineTo(a, b) : x.moveTo(a, b)); x.closePath();
  x.fillStyle = pat; x.fill(); x.restore();
  x.strokeStyle = 'rgba(0,0,0,.18)'; x.lineWidth = 2; x.stroke();
  if (d.shape === 'jacket') { x.fillStyle = '#2A2A3A'; for (let k = 0; k < 4; k++) { x.beginPath(); x.arc(cx, top + 150 + k * 70, 7, 0, 7); x.fill(); } x.beginPath(); x.moveTo(cx, top + 110); x.lineTo(cx, bot - 30); x.stroke(); }
  x.fillStyle = 'rgba(25,26,51,.55)'; x.font = '600 16px ui-monospace, Menlo, monospace'; x.fillText('EXAMPLE', 28, H - 30);
  return c.toDataURL('image/jpeg', .86);
}

/* ================= shell ================= */
const ICONS = {
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  left: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
  right: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>',
  plus: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>'
};
const HANGER = '<svg class="hanger-svg" viewBox="0 0 200 58" aria-hidden="true"><path d="M100 30V24c0-6 11-8 11-15C111 2 99 0 95 7" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/><path d="M100 30L10 53c-5 1.5-4 5 1 5h178c5 0 6-3.5 1-5z" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linejoin="round"/></svg>';

const app = $('#app');
app.innerHTML = `
  <header class="bar wrap" id="bar">
    <a class="bar-name" href="#top" id="bar-name"></a>
    <nav aria-label="Sections"><a href="#rail">The rail</a><a href="#archive">Archive</a></nav>
    <button class="icon-btn" id="settings-btn" hidden aria-label="Site settings">${ICONS.gear}</button>
    <button class="btn primary" id="add-btn" hidden>${ICONS.plus}<span>Add<span class="long"> a fit</span></span></button>
  </header>
  <main id="top">
    <section class="hero wrap">
      <div>
        <p class="eyebrow mono"><span class="dot"></span><span id="eyebrow"></span></p>
        <h1 class="masthead" id="masthead"></h1>
        <p class="tagline" id="tagline"></p>
      </div>
      <aside class="receipt" id="receipt" aria-label="Wardrobe totals"></aside>
    </section>
    <section class="rail-section wrap" id="rail" aria-labelledby="rail-h">
      <div class="rail-head"><h2 id="rail-h">On the rail</h2><p class="mono">Latest fits · drag to browse</p></div>
      <div class="rail" id="rail-track"><div class="rail-pole" id="rail-pole"></div></div>
    </section>
    <div class="marquee" aria-hidden="true"><div class="marquee-track" id="marquee"></div></div>
    <section class="archive wrap" id="archive" aria-labelledby="arch-h">
      <div class="archive-head">
        <div><h2 id="arch-h">The archive</h2><p class="count mono" id="arch-count"></p></div>
        <div class="controls">
          <div class="controls" id="chips" role="group" aria-label="Filter by vibe"></div>
          <label class="sr" for="sort">Sort</label>
          <select id="sort" class="sort"><option value="new">Newest</option><option value="old">Oldest</option><option value="cheap">Cheapest</option><option value="pricey">Priciest</option></select>
        </div>
      </div>
      <div id="sample-note"></div>
      <div class="grid" id="grid"></div>
    </section>
  </main>
  <footer class="foot wrap" id="foot"></footer>
  <div id="sheet-root"></div>
  <div id="drawer-root"></div>
  <div id="toast-root" aria-live="polite"></div>`;

/* ================= render ================= */
function renderAll() {
  renderHero(); renderRail(); renderMarquee(); renderChips(); renderGrid(); renderFoot();
}

function stats() {
  const fits = data.outfits;
  const pieces = fits.flatMap(o => o.pieces);
  const spent = pieces.reduce((a, p) => a + (+p.price || 0), 0);
  const thr = pieces.filter(p => p.thrifted).length;
  const stores = new Set(pieces.filter(p => p.thrifted && p.source).map(p => p.source.trim().toLowerCase()));
  return { fits: fits.length, pieces: pieces.length, spent, pct: pieces.length ? Math.round(thr / pieces.length * 100) : 0, avg: pieces.length ? spent / pieces.length : 0, stores: stores.size };
}

function renderHero() {
  const s = data.settings;
  $('#bar-name').textContent = s.name;
  const words = s.name.trim().split(/\s+/);
  let i = 0;
  $('#masthead').innerHTML = words.map(w => `<span class="w">${[...w].map(ch => `<span class="ch" style="--i:${i++}">${esc(ch)}</span>`).join('')}</span>`).join(' ');
  $('#masthead').setAttribute('aria-label', s.name);
  const handle = s.handle.replace(/^@/, '');
  $('#tagline').innerHTML = esc(s.tagline) + (handle ? ` <a href="https://instagram.com/${encodeURIComponent(handle)}" target="_blank" rel="noopener">@${esc(handle)}</a>` : '');
  const st = stats();
  const latest = data.outfits.map(o => o.date).filter(Boolean).sort().pop();
  $('#eyebrow').textContent = !ui.loaded ? 'Thrift portfolio' : st.fits ? `Thrift portfolio · updated ${fmtDate(latest) || 'recently'}` : 'Thrift portfolio · opening soon';
  const ln = (k, v, cls = '') => `<div class="ln ${cls}"><dt>${k}</dt><span class="lead"></span><dd>${v}</dd></div>`;
  $('#receipt').innerHTML = `
    <h2>${esc(s.name.toUpperCase())}</h2>
    <p class="sub">SECONDHAND DEPT. · NO RETURNS</p>
    <hr>
    <dl>
      ${ln('Fits posted', st.fits)}
      ${ln('Pieces', st.pieces)}
      ${ln('Secondhand', st.pct + '%')}
      ${ln('Shops raided', st.stores)}
      ${ln('Avg / piece', money(st.avg))}
    </dl>
    <hr>
    <dl>${ln('Total', money(st.spent), 'total')}</dl>
    <div class="barcode"></div>
    <p class="thx">THANK YOU FOR SHOPPING PRE-LOVED</p>`;
}

function railItems() { return [...list()].sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 10); }
function renderRail() {
  const track = $('#rail-track');
  $$('.hanger', track).forEach(n => n.remove());
  track.insertAdjacentHTML('beforeend', railItems().map((o, i) => `
    <div class="hanger" style="--i:${i}" data-id="${esc(o.id)}">
      ${HANGER}
      <button class="hanger-card" data-open="${esc(o.id)}" aria-label="Open ${esc(o.title)}">
        <div class="ph"><img src="${esc(imgSrc(o.photos[0] || ''))}" alt="" draggable="false" loading="lazy"></div>
        <div class="cap"><b>${esc(o.title)}</b><span class="mono">${shortMoney(outfitTotal(o))}</span></div>
      </button>
    </div>`).join(''));
  sizePole();
  swing.reset();
}
function sizePole() { const t = $('#rail-track'); $('#rail-pole').style.width = t.scrollWidth + 'px'; }

function renderMarquee() {
  const st = stats(), fits = list();
  const stores = [...new Set(fits.flatMap(outfitSources))].slice(0, 8);
  const bits = isSampleMode() || !ui.loaded
    ? ['Every piece has a past', 'Thrifted', 'Styled', 'Worn again', 'Pre-loved', 'One of one']
    : [`${st.fits} fits`, `${st.pieces} pieces`, `${st.pct}% secondhand`, `${money(st.spent)} total`, ...stores];
  const run = bits.map(b => `<span>${esc(b)}</span><i>✦</i>`).join('');
  $('#marquee').innerHTML = run + run + run + run;
}

function allVibes() {
  const counts = new Map();
  list().forEach(o => o.vibes.forEach(v => counts.set(v, (counts.get(v) || 0) + 1)));
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(e => e[0]);
}
function renderChips() {
  const vibes = allVibes();
  if (ui.vibe !== 'all' && !vibes.includes(ui.vibe)) ui.vibe = 'all';
  $('#chips').innerHTML = ['all', ...vibes].map(v => `<button class="chip" data-vibe="${esc(v)}" aria-pressed="${ui.vibe === v}">${v === 'all' ? 'All' : esc(v)}</button>`).join('');
}

function visibleFits() {
  let f = list().filter(o => ui.vibe === 'all' || o.vibes.includes(ui.vibe));
  const by = { new: (a, b) => (b.date || '').localeCompare(a.date || ''), old: (a, b) => (a.date || '').localeCompare(b.date || ''), cheap: (a, b) => outfitTotal(a) - outfitTotal(b), pricey: (a, b) => outfitTotal(b) - outfitTotal(a) }[ui.sort];
  return f.sort(by);
}
function renderGrid() {
  if (!ui.loaded) {
    $('#arch-count').textContent = 'Loading fits…';
    $('#sample-note').innerHTML = '';
    $('#grid').innerHTML = [380, 300, 420, 340, 300, 400].map(h => `<div class="card skel" aria-hidden="true"><div class="skel-photo" style="height:${h}px"></div></div>`).join('');
    return;
  }
  const fits = visibleFits();
  $('#arch-count').textContent = isSampleMode() ? 'Example fits' : `${fits.length} of ${data.outfits.length} fits`;
  $('#sample-note').innerHTML = !sb
    ? `<div class="sample-note"><span><b>Supabase is not connected yet.</b> Add the project URL and key to <code>config.js</code>, then reload.</span></div>`
    : isSampleMode()
    ? `<div class="sample-note"><span><b>These are example fits.</b> ${ui.canWrite ? 'Post your first outfit and they disappear.' : 'Real outfits are on the way.'}</span>${ui.canWrite ? `<button class="btn primary" data-add>${ICONS.plus}Add your first fit</button>` : ''}</div>`
    : '';
  $('#grid').innerHTML = fits.map((o, i) => {
    const srcs = outfitSources(o);
    return `
    <article class="card pending" style="--tag:var(--tag-${o.tag});--i:${i}" data-id="${esc(o.id)}">
      <button class="card-hit" data-open="${esc(o.id)}" aria-label="Open ${esc(o.title)}">
        <div class="card-photo">
          <img src="${esc(imgSrc(o.photos[0] || ''))}" alt="${esc(o.title)}" loading="lazy">
          ${o.sample ? '<span class="sample-badge mono">Example</span>' : ''}
          ${o.photos.length > 1 ? `<span class="count-badge mono">1/${o.photos.length}</span>` : ''}
        </div>
      </button>
      <div class="hangtag" aria-hidden="true"><span class="string"></span><div class="tag-body"><span class="tag-price">${shortMoney(outfitTotal(o))}</span><span class="tag-kind">${o.pieces.length} pc${o.pieces.length === 1 ? '' : 's'}</span></div></div>
      <div class="card-meta"><h3>${esc(o.title)}</h3><p>${esc([fmtDate(o.date), srcs.slice(0, 2).join(', ')].filter(Boolean).join(' · '))}</p></div>
    </article>`;
  }).join('') || '<p class="count">No fits with that vibe yet.</p>';
  observeCards();
}

function renderFoot() {
  const s = data.settings, handle = s.handle.replace(/^@/, '');
  $('#foot').innerHTML = `<b>${esc(s.name)}</b><span class="mono">Found secondhand · styled at home${handle ? ` · <a href="https://instagram.com/${encodeURIComponent(handle)}" target="_blank" rel="noopener">@${esc(handle)}</a>` : ''}</span>
    ${sb ? (ui.session ? `<button class="link-btn mono" data-logout>Log out</button>` : `<button class="link-btn mono" data-login>Owner login</button>`) : ''}`;
}

/* ================= motion: reveal, tilt, rail swing ================= */
let io;
function observeCards() {
  const cards = $$('.card.pending');
  if (reduce || !('IntersectionObserver' in window)) { cards.forEach(c => c.classList.remove('pending')); return; }
  io?.disconnect();
  io = new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting) { const el = e.target; setTimeout(() => el.classList.remove('pending'), (+el.style.getPropertyValue('--i') % 3) * 90); io.unobserve(el); }
  }), { rootMargin: '0px 0px -8% 0px' });
  cards.forEach(c => io.observe(c));
}

if (finePointer && !reduce) {
  $('#grid').addEventListener('pointermove', e => {
    const ph = e.target.closest('.card-photo'); if (!ph) return;
    const r = ph.getBoundingClientRect(), px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
    ph.style.setProperty('--ry', ((px - .5) * 8).toFixed(2) + 'deg');
    ph.style.setProperty('--rx', ((.5 - py) * 8).toFixed(2) + 'deg');
    ph.style.setProperty('--gx', (px * 100).toFixed(1) + '%');
    ph.style.setProperty('--gy', (py * 100).toFixed(1) + '%');
  });
  $('#grid').addEventListener('pointerout', e => {
    const ph = e.target.closest('.card-photo'); if (ph && !ph.contains(e.relatedTarget)) { ph.style.setProperty('--rx', '0deg'); ph.style.setProperty('--ry', '0deg'); }
  });
}

/* hangers swing like a damped pendulum when the rail moves */
const swing = (() => {
  let bodies = [], raf = 0, started = false;
  function reset() { bodies = $$('.hanger').map(el => ({ el, a: 0, v: 0 })); started = false; setTimeout(() => started = true, 1400); }
  function kick(amount, only) {
    if (reduce || !started) return;
    bodies.forEach(b => { if (!only || b.el === only) b.v += amount * (0.7 + Math.random() * 0.6); });
    if (!raf) raf = requestAnimationFrame(step);
  }
  function step() {
    let moving = false;
    for (const b of bodies) {
      b.v += -b.a * 0.045; b.v *= 0.94; b.a += b.v;
      b.a = Math.max(-18, Math.min(18, b.a));
      if (Math.abs(b.a) > 0.02 || Math.abs(b.v) > 0.02) moving = true; else { b.a = 0; b.v = 0; }
      b.el.style.transform = b.a ? `rotate(${b.a.toFixed(2)}deg)` : '';
    }
    raf = moving ? requestAnimationFrame(step) : 0;
  }
  return { reset, kick };
})();

(() => {
  const track = $('#rail-track');
  let last = track.scrollLeft;
  track.addEventListener('scroll', () => { const d = track.scrollLeft - last; last = track.scrollLeft; swing.kick(Math.max(-3, Math.min(3, -d * 0.09))); }, { passive: true });
  track.addEventListener('pointerover', e => { const h = e.target.closest('.hanger'); if (h && e.pointerType === 'mouse' && !h.contains(e.relatedTarget)) swing.kick((e.movementX || 4) * 0.12, h); });
  // mouse drag-to-scroll
  let drag = null;
  track.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse' || e.button) return; drag = { x: e.clientX, s: track.scrollLeft, moved: false }; });
  addEventListener('pointermove', e => {
    if (!drag) return; const dx = e.clientX - drag.x;
    if (Math.abs(dx) > 5) { drag.moved = true; track.classList.add('dragging'); }
    if (drag.moved) track.scrollLeft = drag.s - dx;
  });
  addEventListener('pointerup', () => { if (!drag) return; const moved = drag.moved; drag = null; track.classList.remove('dragging'); if (moved) { track.dataset.justDragged = '1'; setTimeout(() => delete track.dataset.justDragged, 50); } });
  addEventListener('resize', sizePole);
})();

addEventListener('scroll', () => $('#bar').classList.toggle('scrolled', scrollY > 10), { passive: true });

/* ================= detail sheet ================= */
let lastFocus = null;
function withTransition(fn) {
  if (!document.startViewTransition || reduce) { fn(); return null; }
  return document.startViewTransition(fn);
}
function openFit(id, fromImg) {
  const o = findFit(id); if (!o) return;
  lastFocus = document.activeElement;
  const first = !ui.openId;
  if (first && fromImg) fromImg.style.viewTransitionName = 'fit-photo';
  const t = withTransition(() => {
    if (fromImg) fromImg.style.viewTransitionName = '';
    ui.openId = id; renderSheet(o, first && (!fromImg || !document.startViewTransition || reduce));
    const im = $('#sheet-root .slide img'); if (im && fromImg) im.style.viewTransitionName = 'fit-photo';
  });
  t?.finished.finally(() => { const im = $('#sheet-root .slide img'); if (im) im.style.viewTransitionName = ''; });
}
function closeFit() {
  if (!ui.openId) return;
  const id = ui.openId;
  const card = $(`.card[data-id="${CSS.escape(id)}"] .card-photo img`);
  const im = $('#sheet-root .slide img');
  const inView = card && (() => { const r = card.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; })();
  if (im && inView) im.style.viewTransitionName = 'fit-photo';
  const t = withTransition(() => {
    if (im) im.style.viewTransitionName = '';
    $('#sheet-root').innerHTML = ''; ui.openId = null; document.body.classList.remove('locked');
    if (inView) card.style.viewTransitionName = 'fit-photo';
  });
  t?.finished.finally(() => { if (card) card.style.viewTransitionName = ''; });
  if (!t) { $('#sheet-root').innerHTML = ''; ui.openId = null; document.body.classList.remove('locked'); }
  lastFocus?.focus?.({ preventScroll: true });
}
function stepFit(dir) {
  const fits = visibleFits(); const i = fits.findIndex(o => o.id === ui.openId);
  if (i < 0 || fits.length < 2) return;
  const next = fits[(i + dir + fits.length) % fits.length];
  ui.openId = next.id; renderSheet(next, false);
}
function renderSheet(o, anim) {
  const total = outfitTotal(o), thr = o.pieces.filter(p => p.thrifted).length;
  const pct = o.pieces.length ? Math.round(thr / o.pieces.length * 100) : 0;
  const saved = !o.sample && ui.canWrite;
  $('#sheet-root').innerHTML = `
  <div class="sheet ${anim ? 'anim' : ''}" role="dialog" aria-modal="true" aria-labelledby="sheet-title" style="--tag:var(--tag-${o.tag})">
    <div class="sheet-gallery">
      <div class="slides" id="slides">${o.photos.map((p, i) => `<div class="slide"><img src="${esc(imgSrc(p))}" alt="${esc(o.title)}, photo ${i + 1}"></div>`).join('')}</div>
      ${o.photos.length > 1 ? `<div class="dots">${o.photos.map((_, i) => `<button data-dot="${i}" aria-label="Photo ${i + 1}" aria-current="${i === 0}"></button>`).join('')}</div>` : ''}
    </div>
    <div class="sheet-info">
      <div class="sheet-top">
        <span class="mono">${esc(fmtDate(o.date))}${o.sample ? ' · Example' : ''}</span>
        ${saved ? `<button class="btn ghost" data-edit="${esc(o.id)}">Edit</button>` : ''}
        <button class="icon-btn" data-close-sheet aria-label="Close">${ICONS.x}</button>
      </div>
      <div class="reveal" style="display:grid;gap:22px" id="reveal-${esc(o.id)}">
        <h2 id="sheet-title">${esc(o.title)}</h2>
        ${o.vibes.length ? `<div class="vibes">${o.vibes.map(v => `<span>${esc(v)}</span>`).join('')}</div>` : '<div></div>'}
        ${o.pieces.length ? `<div class="pieces"><h3>WHAT I'M WEARING</h3><ol>${o.pieces.map(p => `
          <li><span class="nm">${esc(p.name || 'Piece')}<span class="pill mono ${p.thrifted ? '' : 'new'}">${p.thrifted ? '2nd hand' : 'new'}</span></span><span class="pr">${money(p.price)}</span>${p.source ? `<span class="src">${esc(p.source)}</span>` : ''}</li>`).join('')}
          </ol><div class="sum"><span>TOTAL</span><span>${money(total)}</span></div></div>` : '<div></div>'}
        ${o.pieces.length ? `<div class="meter"><div class="mono"><span>Secondhand</span><span>${pct}%</span></div><div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div></div>` : '<div></div>'}
        ${o.notes ? `<p class="notes">${esc(o.notes)}</p>` : '<div></div>'}
      </div>
      <div class="sheet-nav">
        <button class="btn ghost" data-step="-1">${ICONS.left.replace('<svg', '<svg width="16" height="16"')}Previous</button>
        <button class="btn ghost" data-step="1">Next${ICONS.right.replace('<svg', '<svg width="16" height="16"')}</button>
      </div>
    </div>
  </div>`;
  document.body.classList.add('locked');
  const slides = $('#slides');
  slides?.addEventListener('scroll', () => {
    const i = Math.round(slides.scrollLeft / slides.clientWidth);
    $$('[data-dot]').forEach((d, k) => d.setAttribute('aria-current', String(k === i)));
  }, { passive: true });
  $('[data-close-sheet]').focus({ preventScroll: true });
}

/* ================= toasts ================= */
let toastTimer;
function toast(msg, ms = 3200) {
  clearTimeout(toastTimer);
  $('#toast-root').innerHTML = `<div class="toast">${esc(msg)}</div>`;
  toastTimer = setTimeout(() => $('#toast-root').innerHTML = '', ms);
}

/* ================= saving ================= */
async function compress(file, max = 1600) {
  let src;
  try { src = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch { src = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('decode')); i.src = URL.createObjectURL(file); }); }
  const s = Math.min(1, max / Math.max(src.width, src.height));
  const c = document.createElement('canvas'); c.width = Math.round(src.width * s); c.height = Math.round(src.height * s);
  c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
  let blob = await new Promise(r => c.toBlob(r, 'image/webp', .82));
  if (!blob || blob.type !== 'image/webp') blob = await new Promise(r => c.toBlob(r, 'image/jpeg', .84));
  return blob;
}
const rowToFit = r => ({ id: r.id, title: r.title, date: r.date || '', tag: r.tag, vibes: r.vibes || [], pieces: r.pieces || [], notes: r.notes || '', photos: r.photos || [] });
const fitToRow = o => ({ id: o.id, title: o.title, date: o.date || null, tag: o.tag, vibes: o.vibes, pieces: o.pieces, notes: o.notes, photos: o.photos });
const byDate = (a, b) => (b.date || '').localeCompare(a.date || '');

async function load() {
  if (!sb) { ui.loaded = true; renderAll(); return; }
  const [f, st] = await Promise.all([
    sb.from('outfits').select('*').order('date', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false }),
    sb.from('settings').select('*').eq('id', 1).maybeSingle()
  ]);
  if (f.error) {
    if (!ui.loaded) { ui.loaded = true; renderAll(); }
    toast('Could not load the outfits. Refresh the page to try again.', 5000);
    return;
  }
  data = normalize({ settings: st.data || {}, outfits: f.data.map(rowToFit) });
  ui.loaded = true; cacheData(); renderAll();
  if (ui.openId) { const o = findFit(ui.openId); if (o) renderSheet(o, false); }
}
const denied = () => ({ message: 'row-level security' });
async function saveFit(fit, uploads, removed) {
  for (const [path, blob] of Object.entries(uploads)) {
    const { error } = await sb.storage.from(BUCKET).upload(path, blob, { contentType: blob.type, cacheControl: '31536000', upsert: false });
    if (error) throw error;
    blobUrls.set(path, URL.createObjectURL(blob));
  }
  const { data: rows, error } = await sb.from('outfits').upsert(fitToRow(fit)).select('id');
  if (error) throw error;
  if (!rows?.length) throw denied();
  if (removed.length) await sb.storage.from(BUCKET).remove(removed);
}
async function deleteFit(fit) {
  const { data: rows, error } = await sb.from('outfits').delete().eq('id', fit.id).select('id');
  if (error) throw error;
  if (!rows?.length) throw denied();
  const paths = fit.photos.filter(p => !/^(https?:|data:)/.test(p));
  if (paths.length) await sb.storage.from(BUCKET).remove(paths);
}
async function saveSettings(settings) {
  const { data: rows, error } = await sb.from('settings').upsert({ id: 1, ...settings }).select('id');
  if (error) throw error;
  if (!rows?.length) throw denied();
}
function saveError(e) {
  const msg = String(e?.message || e?.error || '');
  if (/row-level security|violates|unauthori[sz]ed|jwt|permission|403/i.test(msg + (e?.statusCode || ''))) {
    return 'Only the site owner can post. Log in again from the footer.';
  }
  if (/payload too large|maximum allowed size|413/i.test(msg)) return 'That photo is too big to upload. Try a smaller one.';
  if (/failed to fetch|networkerror|load failed/i.test(msg)) return 'No connection. Check your internet and try again.';
  return 'Could not save. ' + (msg || 'Try again in a moment.');
}

/* ================= drawers ================= */
function openDrawer(html, onReady) {
  lastFocus = document.activeElement;
  $('#drawer-root').innerHTML = `<div class="scrim" data-close-drawer></div>${html}`;
  document.body.classList.add('locked');
  onReady?.();
  setTimeout(() => $('#drawer-root .drawer input:not([type=file]), #drawer-root .drawer textarea')?.focus({ preventScroll: true }), 60);
}
function closeDrawer() {
  if (!$('#drawer-root').innerHTML) return;
  $('#drawer-root').innerHTML = '';
  if (!ui.openId) document.body.classList.remove('locked');
  lastFocus?.focus?.({ preventScroll: true });
}

let draft = null;
function openEditor(id) {
  const o = id ? data.outfits.find(f => f.id === id) : null;
  draft = {
    id: o?.id || null,
    photos: (o?.photos || []).map(p => ({ path: p, url: imgSrc(p) })),
    pieces: o ? o.pieces.map(p => ({ ...p })) : [{ name: '', source: '', price: '', thrifted: true }],
    busy: false
  };
  openDrawer(`
  <aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="ed-h">
    <form id="ed-form" novalidate>
      <header><h2 id="ed-h">${o ? 'Edit fit' : 'New fit'}</h2><button type="button" class="icon-btn" data-close-drawer aria-label="Close">${ICONS.x}</button></header>
      <div class="body">
        <div class="field">
          <span class="label">Photos</span>
          <label class="drop" id="ed-drop"><input type="file" id="ed-files" accept="image/*" multiple><strong>Drop photos here</strong><span>or tap to choose. The first photo is the cover.</span></label>
          <div class="thumbs" id="ed-thumbs"></div>
        </div>
        <label class="field"><span class="label">Name this fit</span><input class="input" id="ed-name" maxlength="60" placeholder="Corduroy Sunday" value="${esc(o?.title || '')}"></label>
        <div class="row2">
          <label class="field"><span class="label">Date worn</span><input class="input" type="date" id="ed-date" value="${esc(o?.date || today())}"></label>
          <fieldset class="field"><legend class="label">Tag color</legend><div class="swatches">${TAGS.map(t => `<label><input type="radio" name="ed-tag" id="ed-tag-${t}" value="${t}" ${(o?.tag || 'pink') === t ? 'checked' : ''}><span style="--sw:var(--tag-${t})" title="${t}"></span><span class="sr">${t}</span></label>`).join('')}</div></fieldset>
        </div>
        <label class="field"><span class="label">Vibes</span><input class="input" id="ed-vibes" placeholder="90s, layered, fall" value="${esc(o?.vibes.join(', ') || '')}"><small>Separate with commas. Vibes become filters in the archive.</small></label>
        <div class="field">
          <span class="label">Pieces</span>
          <div class="pieces-edit">
            <div class="pieces-head"><span>What</span><span class="h-src">Where from</span><span>Price</span><span>Thrifted</span><span></span></div>
            <div id="ed-pieces" class="pieces-edit"></div>
          </div>
          <div><button type="button" class="btn ghost" id="ed-add-piece">${ICONS.plus}Add a piece</button></div>
        </div>
        <label class="field"><span class="label">Notes</span><textarea id="ed-notes" rows="3" placeholder="Where you wore it, the story behind a piece, what you'd change">${esc(o?.notes || '')}</textarea></label>
      </div>
      <footer>
        ${o ? `<button type="button" class="btn danger" id="ed-delete">Delete</button><span class="confirm" id="ed-confirm" hidden>Delete this fit? <button type="button" class="btn danger" id="ed-yes">Delete</button><button type="button" class="btn ghost" id="ed-no">Keep</button></span>` : ''}
        <span class="progress" id="ed-progress"></span>
        <span class="spacer"></span>
        <button type="button" class="btn ghost" data-close-drawer>Cancel</button>
        <button type="submit" class="btn primary" id="ed-save">${o ? 'Save changes' : 'Post fit'}</button>
      </footer>
    </form>
  </aside>`, () => { renderThumbs(); renderPieces(); wireEditor(); });
}

function renderThumbs() {
  $('#ed-thumbs').innerHTML = draft.photos.map((p, i) => `
    <div class="thumb"><img src="${esc(p.url)}" alt="Photo ${i + 1}">
      <div class="t-actions">${i ? `<button type="button" data-cover="${i}" aria-label="Make photo ${i + 1} the cover" title="Make cover">★</button>` : '<span></span>'}<button type="button" data-rm-photo="${i}" aria-label="Remove photo ${i + 1}">✕</button></div>
      ${i === 0 ? '<span class="cover-flag mono">Cover</span>' : ''}
    </div>`).join('');
}
function syncPieces() {
  $$('#ed-pieces .piece-row').forEach((r, i) => {
    const p = draft.pieces[i]; if (!p) return;
    p.name = $('[data-f=name]', r).value; p.source = $('[data-f=source]', r).value;
    p.price = $('[data-f=price]', r).value; p.thrifted = $('[data-f=thrifted]', r).checked;
  });
}
function renderPieces() {
  $('#ed-pieces').innerHTML = draft.pieces.map((p, i) => `
    <div class="piece-row">
      <input class="input" data-f="name" id="ed-p-name-${i}" aria-label="Piece ${i + 1}" placeholder="Wool blazer" value="${esc(p.name)}">
      <input class="input src-in" data-f="source" id="ed-p-src-${i}" aria-label="Where piece ${i + 1} is from" placeholder="Goodwill" value="${esc(p.source)}">
      <input class="input" data-f="price" id="ed-p-price-${i}" aria-label="Price of piece ${i + 1}" type="number" inputmode="decimal" min="0" step="0.01" placeholder="0.00" value="${esc(p.price)}">
      <label class="thr"><input type="checkbox" data-f="thrifted" id="ed-p-thr-${i}" ${p.thrifted ? 'checked' : ''}><span class="sr">Thrifted</span>2nd</label>
      <button type="button" class="rm" data-rm-piece="${i}" aria-label="Remove piece ${i + 1}">✕</button>
    </div>`).join('');
}
function addFiles(files) {
  const imgs = [...files].filter(f => f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name));
  if (!imgs.length) { toast('Those files are not photos. Choose JPG, PNG, WebP or HEIC.'); return; }
  const room = 8 - draft.photos.length;
  if (room <= 0) { toast('Eight photos is the limit for one fit.'); return; }
  imgs.slice(0, room).forEach(f => draft.photos.push({ file: f, url: URL.createObjectURL(f) }));
  if (imgs.length > room) toast('Kept the first eight photos.');
  renderThumbs();
}
function wireEditor() {
  const drop = $('#ed-drop');
  $('#ed-files').addEventListener('change', e => { addFiles(e.target.files); e.target.value = ''; });
  ['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', e => addFiles(e.dataTransfer.files));
  $('#ed-thumbs').addEventListener('click', e => {
    const c = e.target.closest('[data-cover]'), r = e.target.closest('[data-rm-photo]');
    if (c) { const [p] = draft.photos.splice(+c.dataset.cover, 1); draft.photos.unshift(p); renderThumbs(); }
    if (r) { draft.photos.splice(+r.dataset.rmPhoto, 1); renderThumbs(); }
  });
  $('#ed-add-piece').addEventListener('click', () => { syncPieces(); draft.pieces.push({ name: '', source: '', price: '', thrifted: true }); renderPieces(); $(`#ed-p-name-${draft.pieces.length - 1}`).focus(); });
  $('#ed-pieces').addEventListener('click', e => { const r = e.target.closest('[data-rm-piece]'); if (r) { syncPieces(); draft.pieces.splice(+r.dataset.rmPiece, 1); renderPieces(); } });
  $('#ed-delete')?.addEventListener('click', () => { $('#ed-delete').hidden = true; $('#ed-confirm').hidden = false; $('#ed-no').focus(); });
  $('#ed-no')?.addEventListener('click', () => { $('#ed-delete').hidden = false; $('#ed-confirm').hidden = true; });
  $('#ed-yes')?.addEventListener('click', deleteDraft);
  $('#ed-form').addEventListener('submit', e => { e.preventDefault(); submitDraft(); });
}
function busy(on, msg = '') {
  draft.busy = on; $('#ed-progress').textContent = msg;
  $$('#ed-form button').forEach(b => b.disabled = on);
}
async function submitDraft() {
  if (draft.busy) return;
  syncPieces();
  const title = $('#ed-name').value.trim();
  if (!draft.photos.length) { toast('Add at least one photo of the fit.'); $('#ed-files').focus(); return; }
  if (!title) { toast('Give the fit a name.'); $('#ed-name').focus(); return; }
  const id = draft.id || uid();
  const uploads = {}, photos = [];
  try {
    const fresh = draft.photos.filter(p => p.file);
    let n = 0;
    for (const p of draft.photos) {
      if (p.path) { photos.push(p.path); continue; }
      busy(true, `Preparing photo ${++n} of ${fresh.length}…`);
      const blob = await compress(p.file);
      const path = `${id}/${uid()}.${blob.type === 'image/webp' ? 'webp' : 'jpg'}`;
      uploads[path] = blob; photos.push(path);
    }
  } catch { busy(false); toast('One of those photos could not be read. Try saving it as a JPG first.'); return; }
  const fit = {
    id, title, date: $('#ed-date').value || today(), tag: ($('input[name=ed-tag]:checked') || {}).value || 'pink',
    vibes: [...new Set($('#ed-vibes').value.split(',').map(v => v.trim().toLowerCase()).filter(Boolean))].slice(0, 8),
    pieces: draft.pieces.filter(p => p.name.trim() || p.source.trim() || +p.price).map(p => ({ name: p.name.trim(), source: p.source.trim(), price: Math.max(0, +p.price || 0), thrifted: !!p.thrifted })),
    notes: $('#ed-notes').value.trim(), photos
  };
  const prev = data.outfits.find(o => o.id === id);
  const removed = prev ? prev.photos.filter(p => !photos.includes(p)) : [];
  busy(true, Object.keys(uploads).length ? 'Uploading photos…' : 'Saving…');
  try {
    await saveFit(fit, uploads, removed);
  } catch (e) { busy(false); toast(saveError(e), 5000); return; }
  data = { ...data, outfits: (prev ? data.outfits.map(o => o.id === id ? fit : o) : [fit, ...data.outfits]).sort(byDate) };
  cacheData();
  const wasOpen = ui.openId;
  closeDrawer(); renderAll();
  toast(prev ? 'Saved' : 'Posted. It is on the rail now.');
  if (wasOpen) { ui.openId = id; renderSheet(fit, false); }
  else setTimeout(() => $(`.card[data-id="${CSS.escape(id)}"]`)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' }), 200);
}
async function deleteDraft() {
  const prev = data.outfits.find(o => o.id === draft.id); if (!prev) return;
  busy(true, 'Deleting…');
  try { await deleteFit(prev); }
  catch (e) { busy(false); toast(saveError(e), 5000); return; }
  data = { ...data, outfits: data.outfits.filter(o => o.id !== prev.id) };
  cacheData();
  closeDrawer();
  $('#sheet-root').innerHTML = ''; ui.openId = null; document.body.classList.remove('locked');
  renderAll(); toast('Deleted');
}

function openSettings() {
  const s = data.settings;
  openDrawer(`
  <aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="st-h">
    <form id="st-form" novalidate>
      <header><h2 id="st-h">Site settings</h2><button type="button" class="icon-btn" data-close-drawer aria-label="Close">${ICONS.x}</button></header>
      <div class="body">
        <label class="field"><span class="label">Site name</span><input class="input" id="st-name" maxlength="28" value="${esc(s.name)}"><small>Shown huge at the top. Your name works great here.</small></label>
        <label class="field"><span class="label">Tagline</span><textarea id="st-tagline" rows="2" maxlength="140">${esc(s.tagline)}</textarea></label>
        <label class="field"><span class="label">Instagram handle</span><input class="input" id="st-handle" maxlength="30" placeholder="@yourname" value="${esc(s.handle)}"></label>
      </div>
      <footer><span class="progress" id="st-progress"></span><span class="spacer"></span><button type="button" class="btn ghost" data-close-drawer>Cancel</button><button type="submit" class="btn primary" id="st-save">Save</button></footer>
    </form>
  </aside>`, () => {
    $('#st-form').addEventListener('submit', async e => {
      e.preventDefault();
      const settings = { name: $('#st-name').value.trim() || 'Worn Again', tagline: $('#st-tagline').value.trim(), handle: $('#st-handle').value.trim().replace(/^@/, '') };
      $('#st-progress').textContent = 'Saving…'; $$('#st-form button').forEach(b => b.disabled = true);
      try { await saveSettings(settings); }
      catch (err) { $('#st-progress').textContent = ''; $$('#st-form button').forEach(b => b.disabled = false); toast(saveError(err), 5000); return; }
      data = { ...data, settings }; cacheData();
      closeDrawer(); renderAll(); toast('Saved');
    });
  });
}

function openLogin() {
  if (!sb) { toast('Connect Supabase in config.js first.'); return; }
  openDrawer(`
  <aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="li-h">
    <form id="li-form" novalidate>
      <header><h2 id="li-h">Owner login</h2><button type="button" class="icon-btn" data-close-drawer aria-label="Close">${ICONS.x}</button></header>
      <div class="body">
        <p class="login-copy">Only the owner of this site can post. Enter your email and you'll get a login link. Open it on this same device.</p>
        <label class="field"><span class="label">Email</span><input class="input" type="email" id="li-email" autocomplete="email" inputmode="email" placeholder="you@example.com"></label>
        <p class="progress" id="li-progress" aria-live="polite"></p>
      </div>
      <footer><span class="spacer"></span><button type="button" class="btn ghost" data-close-drawer>Cancel</button><button type="submit" class="btn primary" id="li-send">Email me a link</button></footer>
    </form>
  </aside>`, () => {
    $('#li-form').addEventListener('submit', async e => {
      e.preventDefault();
      const email = $('#li-email').value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast('Enter your full email address.'); $('#li-email').focus(); return; }
      $('#li-send').disabled = true; $('#li-progress').textContent = 'Sending…';
      const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } });
      if (error) {
        $('#li-send').disabled = false; $('#li-progress').textContent = '';
        toast(/rate|seconds/i.test(error.message) ? 'Too many tries. Wait a minute, then try again.' : /signups? not allowed/i.test(error.message) ? 'That email is not the owner of this site.' : 'Could not send the link. ' + error.message, 5000);
        return;
      }
      $('#li-progress').textContent = `Link sent to ${email}. Check your inbox (and spam).`;
      $('#li-send').textContent = 'Sent';
    });
  });
}

let ownerCheck = 0;
async function refreshOwner(session, announce) {
  const run = ++ownerCheck, wasOwner = ui.canWrite;
  ui.session = session || null;
  if (!session) { setWritable(false); return; }
  const { data: ok, error } = await sb.rpc('is_owner');
  if (run !== ownerCheck) return;
  if (error || !ok) {
    setWritable(false);
    await sb.auth.signOut();
    toast('That email is not the owner of this site.', 5000);
    return;
  }
  setWritable(true);
  if (announce && !wasOwner) toast('Logged in. Tap “Add a fit” to post.');
}

/* ================= events ================= */
document.addEventListener('click', e => {
  const t = e.target;
  const open = t.closest('[data-open]');
  if (open) {
    if ($('#rail-track').dataset.justDragged) return;
    openFit(open.dataset.open, $('img', open)); return;
  }
  if (t.closest('[data-close-sheet]')) { closeFit(); return; }
  if (t.closest('[data-close-drawer]')) { closeDrawer(); return; }
  const step = t.closest('[data-step]'); if (step) { stepFit(+step.dataset.step); return; }
  const dot = t.closest('[data-dot]'); if (dot) { const s = $('#slides'); s.scrollTo({ left: s.clientWidth * +dot.dataset.dot, behavior: reduce ? 'auto' : 'smooth' }); return; }
  const ed = t.closest('[data-edit]'); if (ed) { openEditor(ed.dataset.edit); return; }
  if (t.closest('[data-add]') || t.closest('#add-btn')) { openEditor(null); return; }
  if (t.closest('#settings-btn')) { openSettings(); return; }
  if (t.closest('[data-login]')) { openLogin(); return; }
  if (t.closest('[data-logout]')) { sb.auth.signOut().then(() => toast('Logged out')); return; }
  const chip = t.closest('[data-vibe]');
  if (chip) { ui.vibe = chip.dataset.vibe; renderChips(); withTransition(renderGrid); }
});
$('#sort').addEventListener('change', e => { ui.sort = e.target.value; withTransition(renderGrid); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { if ($('#drawer-root').innerHTML) closeDrawer(); else closeFit(); }
  if (ui.openId && !$('#drawer-root').innerHTML && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) {
    if (e.key === 'ArrowRight') stepFit(1);
    if (e.key === 'ArrowLeft') stepFit(-1);
  }
});

/* ================= boot ================= */
function setWritable(on) {
  const changed = ui.canWrite !== on;
  ui.canWrite = on;
  $('#add-btn').hidden = !on;
  $('#settings-btn').hidden = !on;
  renderFoot();
  if (changed) {
    if (ui.loaded) renderGrid();
    if (ui.openId) { const o = findFit(ui.openId); if (o) renderSheet(o, false); }
  }
}
renderAll();
load();
if (sb) {
  sb.auth.onAuthStateChange((event, session) => {
    if (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') return;
    // Supabase advises against awaiting its own calls inside this callback.
    setTimeout(() => refreshOwner(session, event === 'SIGNED_IN'), 0);
  });
  if (location.hash === '#studio') setTimeout(() => { if (!ui.session) openLogin(); }, 600);
}
})();
