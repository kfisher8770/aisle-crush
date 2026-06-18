'use strict';

/* ---------------- identity & local state ---------------- */
const LS = {
  guest: 'hym_guest', name: 'hym_name', splash: 'hym_splash',
  reactions: 'hym_reactions', matches: 'hym_matches',
};
function guestId() {
  let g = localStorage.getItem(LS.guest);
  if (!g) { g = 'g_' + Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem(LS.guest, g); }
  return g;
}
function myName() { return localStorage.getItem(LS.name) || ''; }
function setMyName(n) { localStorage.setItem(LS.name, n); }
function lsJSON(key, def) { try { return JSON.parse(localStorage.getItem(key)) || def; } catch { return def; } }
function myReactionsFor(id) { return lsJSON(LS.reactions, {})[id] || []; }
function toggleMyReaction(id, emoji, on) {
  const all = lsJSON(LS.reactions, {});
  const set = new Set(all[id] || []);
  on ? set.add(emoji) : set.delete(emoji);
  all[id] = [...set]; localStorage.setItem(LS.reactions, JSON.stringify(all));
}
function iMatched(id) { return lsJSON(LS.matches, []).includes(String(id)); }
function markMatched(id) {
  const arr = lsJSON(LS.matches, []); if (!arr.includes(String(id))) arr.push(String(id));
  localStorage.setItem(LS.matches, JSON.stringify(arr));
}

/* ---------------- app state ---------------- */
const state = { catalog: null, profiles: [], deckIndex: 0, formMode: 'create', editingId: null, photos: [], builderPrompts: [], eventProfileId: null, eventSel: null, eventDrinkLevel: 0, evtPhotoFile: null };

const COLORS = ['#D4537E', '#378ADD', '#1D9E75', '#7F77DD', '#D85A30', '#BA7517', '#639922', '#185FA5'];
function colorFor(name) { let h = 0; for (const c of (name || 'X')) h = (h * 31 + c.charCodeAt(0)) & 0xffff; return COLORS[h % COLORS.length]; }
function initials(name) {
  if (!name) return '?';
  const p = name.trim().split(' ');
  return p.length > 1 ? (p[0][0] + p[p.length - 1][0]).toUpperCase() : name.slice(0, 2).toUpperCase();
}
function esc(s) { return (s == null ? '' : String(s)).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

const REACTION_LABELS = { '🔥': 'a catch', '😍': 'cutie', '💯': 'the real deal' };

const DARES = [
  'Sneak a selfie with the couple without them noticing.',
  'Both steal a bread roll from the table next to yours.',
  'Challenge each other to the cheesiest dance move before midnight.',
  'Find the oldest guest and get their best relationship advice together.',
  'Both sign a napkin and leave it for the couple as a memento.',
  'Get a photo with the wedding cake without cutting it.',
  'Ask the DJ to play your song, together.',
  'Find three strangers, introduce yourselves, report back.',
];

/* ---------------- API ---------------- */
async function api(path, opts) { const r = await fetch(path, opts); if (!r.ok) { let m = 'Request failed'; try { m = (await r.json()).error || m; } catch {} throw new Error(m); } return r.json(); }
const getJSON = (p) => api(p);
const postJSON = (p, body) => api(p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

/* ---------------- toast / nav ---------------- */
let toastT;
function toast(msg) { const t = document.getElementById('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600); }

function goScreen(id, { hideNav = false } = {}) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  document.getElementById('tabbar').classList.toggle('hidden', hideNav);
  document.getElementById('brandbar').classList.toggle('hidden', hideNav);
  window.scrollTo(0, 0);
}
function switchTab(btn) {
  document.querySelectorAll('.tab').forEach((t) => t.classList.remove('on'));
  btn.classList.add('on');
  const id = btn.dataset.screen;
  goScreen(id);
  if (id === 's-browse') renderDeck();
  if (id === 's-leaderboard') loadLeaderboard();
  if (id === 's-me') renderMe();
}
function setTab(screen) { const b = document.querySelector(`.tab[data-screen="${screen}"]`); if (b) switchTab(b); }

/* ---------------- splash ---------------- */
function maybeSplash() { if (!localStorage.getItem(LS.splash)) document.getElementById('splash').classList.add('show'); }
function dismissSplash() { localStorage.setItem(LS.splash, '1'); document.getElementById('splash').classList.remove('show'); }
function showSplash() { document.getElementById('splash').classList.add('show'); }
function showExplain() { document.getElementById('explain').classList.add('show'); }
function hideExplain() { document.getElementById('explain').classList.remove('show'); }
function enterFromExplain() { hideExplain(); dismissSplash(); }

/* ---------------- load + deck ---------------- */
async function loadProfiles() {
  const q = myName() ? `?revealFor=${encodeURIComponent(myName())}` : '';
  state.profiles = await getJSON('/api/profiles' + q);
  if (state.deckIndex >= state.profiles.length) state.deckIndex = Math.max(0, state.profiles.length - 1);
}

async function renderDeck() {
  const deck = document.getElementById('deck');
  try { await loadProfiles(); } catch { deck.innerHTML = '<div class="loading">Could not load profiles.</div>'; return; }
  if (!state.profiles.length) {
    document.getElementById('deck-progress').hidden = true;
    deck.innerHTML = `<div class="empty"><div class="section-title">No singles yet</div><div class="section-sub">Be the first wingman. Head to the <b>You</b> tab and build a profile for a single friend.</div><button class="btn btn-pink" onclick="setTab('s-me')">Become a wingman</button></div>`;
    return;
  }
  deck.innerHTML = `<div class="deck-stage" id="deck-stage"></div>
    <div class="deck-controls" id="deck-controls"></div>`;
  renderCard();
}

function updateDeckProgress() {
  const wrap = document.getElementById('deck-progress');
  const singles = state.profiles.length;
  if (!wrap || !singles) { if (wrap) wrap.hidden = true; return; }
  // count the "become a wingman" card in the total so the bar isn't full
  // until you've flipped all the way to it
  const total = singles + 1;
  const pos = state.deckIndex + 1;
  wrap.hidden = false;
  document.getElementById('deck-progress-fill').style.width = `${(pos / total) * 100}%`;
  document.getElementById('deck-progress-label').textContent =
    state.deckIndex >= singles ? `That's everyone` : `${pos} of ${total}`;
}

function renderCard() {
  const stage = document.getElementById('deck-stage');
  if (!stage) return;
  updateDeckProgress();
  // virtual last card: a "become a wingman" CTA after the real singles
  if (state.deckIndex >= state.profiles.length) { renderWingmanCTA(stage); return; }
  const p = state.profiles[state.deckIndex];
  if (!p) return;
  const col = colorFor(p.singleName);
  const photos = (p.photoUrls && p.photoUrls.length) ? p.photoUrls : (p.photoUrl ? [p.photoUrl] : []);
  const badges = `<div class="wingman-badge">by ${esc(p.createdBy)}</div>
        <div class="card-count">${state.deckIndex + 1} / ${state.profiles.length}</div>
        <div class="pts-badge">${p.points} pts</div>`;
  let gallery;
  if (photos.length) {
    const slides = photos.map((u, i) => `<div class="gal-slide ${i === 0 ? 'active' : ''}" style="background-image:url('${esc(u)}')"></div>`).join('');
    const nav = photos.length > 1
      ? `<button class="gal-zone gal-prev" aria-label="Previous photo" onclick="galleryNav(this,-1)"></button>
         <button class="gal-zone gal-next" aria-label="Next photo" onclick="galleryNav(this,1)"></button>
         <div class="gal-dots">${photos.map((_, i) => `<span class="gal-dot ${i === 0 ? 'on' : ''}"></span>`).join('')}</div>`
      : '';
    gallery = `<div class="swipe-gallery" data-i="0">${slides}${nav}${badges}</div>`;
  } else {
    gallery = `<div class="swipe-gallery" data-i="0"><div class="gal-slide active" style="background:linear-gradient(135deg, ${col}33, ${col}66)"><div class="avatar" style="background:${col}">${esc(initials(p.singleName))}</div></div>${badges}</div>`;
  }
  const myR = myReactionsFor(p.id);
  // dating-app action bar (below the card): 3 reactions + match as the 4th
  const reactActions = state.catalog.reactionEmojis.map((e) => {
    const cnt = (p.reactionTally && p.reactionTally[e]) || 0;
    const lbl = REACTION_LABELS[e] || '';
    return `<button class="act-btn react ${myR.includes(e) ? 'on' : ''}" onclick="pickReaction('${p.id}','${e}')" aria-label="${esc(lbl)} (+1)"><span class="act-emoji">${e}</span><span class="act-label">${esc(lbl)}</span><span class="act-pts">+1</span><span class="act-count">${cnt || ''}</span></button>`;
  }).join('');

  const events = p.events || [];
  const timeline = events.length
    ? events.map((ev) => `<div class="tl-item">
        ${ev.photoUrl ? `<img class="tl-photo" src="${esc(ev.photoUrl)}" onclick="viewPhoto('${esc(ev.photoUrl)}')" alt="">` : `<div class="tl-photo"></div>`}
        <div class="tl-label">${esc(ev.label)}</div>
        <div class="tl-pts">+${ev.points}</div></div>`).join('')
    : `<div class="tl-empty">Nothing caught yet. Log the first moment.</div>`;

  stage.innerHTML = `
    <div class="swipe-card" id="card">
      ${gallery}
      <div class="swipe-body">
        <div class="swipe-name">${esc(p.singleName)}</div>
        ${p.pitch ? `<div class="swipe-pitch">${esc(p.pitch)}</div>` : ''}
        ${p.askAbout ? `<div class="ask-about"><span class="aa-label">Ask them about</span>${esc(p.askAbout)}</div>` : ''}
        ${p.drinkStatus && p.drinkStatus.level > 0 ? `<div class="meter">Drink-o-meter: <b>${esc(p.drinkStatus.label)}</b></div>` : ''}
        ${renderCardPrompts(p)}
        <div class="give-head">Give ${esc(p.singleName)} points</div>
        <button class="btn btn-ghost btn-log" onclick="openEvent('${p.id}', ${p.drinkLevel || 0}, '${esc(p.singleName)}')">Log a moment <span class="log-pts">+5 to +25</span></button>
        <div class="give-or">Or upvote them by tapping a reaction below. Each adds +1.</div>
        <div class="tl-head">Caught in the act${events.length ? ` (${events.length})` : ''}</div>
        ${timeline}
      </div>
    </div>`;

  document.getElementById('deck-controls').innerHTML = `<div class="act-row">${reactActions}</div>`;

  attachSwipe(document.getElementById('card'));
}

// Terminal card shown after the last single — mirrors the empty-state CTA.
function renderWingmanCTA(stage) {
  stage.innerHTML = `
    <div class="swipe-card cta-card" id="card">
      <div class="cta-inner">
        <svg class="brand-mark cta-mark" viewBox="0 0 56 36" aria-hidden="true" focusable="false">
          <path class="bm-wing" d="M21 19C13 12 5 13 1.5 16.5 7 16 13 18 19 23Z"/>
          <path class="bm-wing" d="M35 19c8-7 16-6 19.5-2.5C49 16 43 18 37 23Z"/>
          <path class="bm-heart" d="M28 32c-2-2-8-7-8-12.5 0-2.7 2-4.5 4.3-4.5 1.7 0 3.1 1 3.7 2.3.6-1.3 2-2.3 3.7-2.3 2.3 0 4.3 1.8 4.3 4.5C36 25 30 30 28 32Z"/>
        </svg>
        <div class="cta-title">That's everyone… for now</div>
        <div class="cta-sub">Know a single who belongs here? Build them a profile and rack up points as their wingman.</div>
        <button class="btn btn-pink" onclick="setTab('s-me')">Become a wingman</button>
      </div>
    </div>`;
  document.getElementById('deck-controls').innerHTML = `<div class="cta-hint">Swipe back to keep browsing</div>`;
  attachSwipe(document.getElementById('card'));
}

function renderCardPrompts(p) {
  const list = Array.isArray(p.prompts) ? p.prompts : [];
  let html = '';
  for (const pr of list) {
    if (pr.type === 'triple') {
      if (!(pr.answers || []).some((a) => a && a.trim())) continue;
      html += `<div class="card-prompt tt"><div class="cp-q">Two truths and a lie</div>
        <ol class="tt-list">${(pr.answers || []).map((a) => `<li>${esc(a)}</li>`).join('')}</ol>
        <div class="tt-cap">One of these is a lie. Go find out which.</div></div>`;
    } else if (pr.type === 'secret') {
      html += (p.secretUnlocked && pr.answer)
        ? `<div class="card-prompt secret"><div class="cp-q">${esc(pr.question || 'Secret weapon')}</div><div class="cp-a">${esc(pr.answer)}</div></div>`
        : `<div class="card-prompt secret"><div class="cp-q">${esc(pr.question || 'Secret weapon')}</div><div class="cp-a cp-locked">Unlocks once they match</div></div>`;
    } else if (!pr.answer) {
      continue;
    } else if (pr.key === 'green-flag') {
      html += `<div class="card-prompt flag-green"><div class="cp-q">${esc(pr.question || 'Green flag')}</div><div class="cp-a">${esc(pr.answer)}</div></div>`;
    } else if (pr.key === 'one-catch') {
      html += `<div class="card-prompt flag-red"><div class="cp-q">${esc(pr.question || 'One catch')}</div><div class="cp-a">${esc(pr.answer)}</div></div>`;
    } else {
      html += `<div class="card-prompt"><div class="cp-q">${esc(pr.question || '')}</div><div class="cp-a">${esc(pr.answer)}</div></div>`;
    }
  }
  // legacy fallback for pre-redesign profiles (no prompts array)
  if (!list.length) {
    if (p.greenFlag) html += `<div class="card-prompt flag-green"><div class="cp-q">Green flag</div><div class="cp-a">${esc(p.greenFlag)}</div></div>`;
    if (p.redFlag) html += `<div class="card-prompt flag-red"><div class="cp-q">Red flag</div><div class="cp-a">${esc(p.redFlag)}</div></div>`;
    if (p.hasSecret) html += (p.secretUnlocked && p.secret)
      ? `<div class="card-prompt secret"><div class="cp-q">Secret</div><div class="cp-a">${esc(p.secret)}</div></div>`
      : `<div class="card-prompt secret"><div class="cp-q">Secret</div><div class="cp-a cp-locked">Unlocks once they match</div></div>`;
  }
  return html;
}

function galleryNav(zone, dir) {
  const g = zone.closest('.swipe-gallery'); if (!g) return;
  const slides = g.querySelectorAll('.gal-slide');
  const dots = g.querySelectorAll('.gal-dot');
  if (slides.length < 2) return;
  const i = (Number(g.dataset.i || 0) + dir + slides.length) % slides.length;
  g.dataset.i = i;
  slides.forEach((s, n) => s.classList.toggle('active', n === i));
  dots.forEach((d, n) => d.classList.toggle('on', n === i));
}

/* swipe gesture: horizontal drag flips; vertical scrolls the body */
function attachSwipe(card) {
  let x0 = 0, y0 = 0, dragging = false, decided = false, horizontal = false;
  card.addEventListener('pointerdown', (e) => { x0 = e.clientX; y0 = e.clientY; dragging = true; decided = false; horizontal = false; });
  card.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - x0, dy = e.clientY - y0;
    if (!decided) { if (Math.abs(dx) > 12 || Math.abs(dy) > 12) { decided = true; horizontal = Math.abs(dx) > Math.abs(dy); if (horizontal) card.setPointerCapture(e.pointerId); } }
    if (decided && horizontal) { card.classList.add('dragging'); card.style.transform = `translateX(${dx}px) rotate(${dx / 40}deg)`; card.style.opacity = 1 - Math.min(Math.abs(dx) / 500, 0.4); }
  });
  const end = (e) => {
    if (!dragging) return; dragging = false;
    const dx = e.clientX - x0;
    card.classList.remove('dragging');
    if (decided && horizontal && Math.abs(dx) > 80) { flip(dx < 0 ? 1 : -1, dx < 0 ? -1 : 1); }
    else { card.style.transform = ''; card.style.opacity = ''; }
  };
  card.addEventListener('pointerup', end);
  card.addEventListener('pointercancel', end);
}

function flip(dir, animDir) {
  const n = state.profiles.length + 1; // +1 = the "become a wingman" card
  if (n <= 1 && !state.profiles.length) return;
  const card = document.getElementById('card');
  state.deckIndex = (state.deckIndex + dir + n) % n;
  if (card && animDir) {
    card.classList.add('anim');
    card.style.transform = `translateX(${animDir < 0 ? -500 : 500}px) rotate(${animDir < 0 ? -18 : 18}deg)`;
    card.style.opacity = 0;
    setTimeout(renderCard, 180);
  } else { renderCard(); }
}

// Pick at most one of the three reactions: selecting a new one clears the old.
async function pickReaction(id, emoji) {
  const mine = myReactionsFor(id);
  const current = mine.find((e) => Object.prototype.hasOwnProperty.call(REACTION_LABELS, e));
  if (current === emoji) { await react(id, emoji); return; } // tap active = remove
  if (current) await react(id, current);                    // clear the previous vote
  await react(id, emoji);                                    // cast the new one
}

async function react(id, emoji) {
  const p = state.profiles.find((x) => String(x.id) === String(id)); if (!p) return;
  const had = myReactionsFor(id).includes(emoji);
  // optimistic
  p.reactionTally = p.reactionTally || {};
  p.reactionTally[emoji] = Math.max(0, (p.reactionTally[emoji] || 0) + (had ? -1 : 1));
  toggleMyReaction(id, emoji, !had);
  renderCard();
  try {
    const res = await postJSON(`/api/profiles/${id}/react`, { guestId: guestId(), emoji });
    p.reactionTally = res.reactionTally; p.points = res.points; toggleMyReaction(id, emoji, res.reacted);
    renderCard();
  } catch (e) { toast(e.message); }
}

async function doMatch() {
  const p = state.profiles[state.deckIndex]; if (!p) return;
  if (iMatched(p.id)) { toast('You already matched ' + p.singleName); return; }
  let name = myName();
  if (!name) {
    name = (window.prompt("What's your name? (matching puts your name on it)") || '').trim();
    if (!name) return; setMyName(name);
  }
  try {
    const res = await postJSON(`/api/profiles/${p.id}/match`, { single: name });
    markMatched(p.id); p.points = res.points;
    showMatch(res);
  } catch (e) { toast(e.message); }
}

function showMatch(res) {
  document.getElementById('match-sub').textContent = `You and ${res.singleName}. Wingman ${res.wingman} just scored big.`;
  const rev = document.getElementById('match-reveal');
  if (res.hasSecret && res.secret) { rev.style.display = ''; document.getElementById('match-secret-text').textContent = res.secret; }
  else { rev.style.display = 'none'; }
  document.getElementById('match-dare').textContent = DARES[Math.floor(Math.random() * DARES.length)];
  openSheet('match-overlay');
  renderCard();
}

/* ---------------- leaderboard ---------------- */
async function loadLeaderboard() {
  const el = document.getElementById('lb-content');
  el.innerHTML = '<div class="loading">Loading…</div>';
  try {
    const data = await getJSON('/api/leaderboard');
    if (!data.length) { el.innerHTML = '<div class="empty"><div class="section-sub">No wingmen on the board yet. Build a profile to get on it.</div></div>'; return; }
    el.innerHTML = '<div class="card">' + data.map((row, i) => `
      <div class="lb-row">
        <div class="lb-rank">${i + 1}</div>
        <div class="lb-avatar" style="background:${colorFor(row.wingman)}">${esc(initials(row.wingman))}</div>
        <div class="lb-info">
          <div class="lb-name">${esc(row.wingman)}</div>
          <div class="lb-single">${esc(row.singles.join(', ') || 'No singles yet')}</div>
        </div>
        <div class="lb-pts">${row.points}<small> pts</small></div>
      </div>`).join('') + '</div>';
  } catch { el.innerHTML = '<div class="loading">Could not load leaderboard.</div>'; }
}

/* ---------------- Me dashboard ---------------- */
async function renderMe() {
  const el = document.getElementById('me-content');
  const name = myName();
  if (!name) {
    el.innerHTML = `<div class="card">
      <div class="section-title">Who are you?</div>
      <div class="section-sub">Enter your name to manage your singles, log their wedding antics, and earn points.</div>
      <div class="field"><label>Your name</label><input type="text" id="me-name-input" placeholder="e.g. Sophie" autocomplete="off"></div>
      <button class="btn btn-pink" onclick="saveMyName()">Continue</button>
    </div>`;
    return;
  }
  el.innerHTML = '<div class="loading">Loading…</div>';
  let mine = [], assignments = [];
  try { [mine, assignments] = await Promise.all([getJSON(`/api/profiles/by/${encodeURIComponent(name)}`), getJSON('/api/assignments')]); } catch {}
  const total = mine.reduce((s, p) => s + (p.points || 0), 0);
  const assigned = assignments.find((a) => a.wingman.toLowerCase() === name.toLowerCase());
  const assignHint = assigned && !mine.some((p) => p.singleName.toLowerCase() === assigned.single.toLowerCase())
    ? `<div class="card" style="background:var(--pink-light);border-color:var(--pink-mid)"><b>Your assignment:</b> build a profile for <b>${esc(assigned.single)}</b>.</div>` : '';

  const list = mine.length
    ? mine.map((p) => `<div class="mine-row">
        <div class="mine-av" style="${p.photoUrl ? `background-image:url('${esc(p.photoUrl)}')` : `background:${colorFor(p.singleName)}`}">${p.photoUrl ? '' : esc(initials(p.singleName))}</div>
        <div class="mine-info"><div class="mine-name">${esc(p.singleName)}${p.selfMade ? ' <span style="font-size:11px;color:var(--text-muted)">(you)</span>' : ''}</div><div class="mine-meta">${p.points} pts, ${(p.events || []).length} events</div></div>
        <div class="mine-actions">
          <button class="icon-btn" title="Log moment" onclick="openEvent('${p.id}', ${p.drinkLevel || 0}, '${esc(p.singleName)}')">Log</button>
          <button class="icon-btn" title="Edit" onclick="editProfile('${p.id}')">Edit</button>
          <button class="icon-btn" title="Delete" onclick="deleteProfile('${p.id}','${esc(p.singleName)}')">Delete</button>
        </div></div>`).join('')
    : '<div class="tl-empty">No profiles yet. Build one below.</div>';

  el.innerHTML = `
    <div class="card" style="text-align:center">
      <div class="mine-av" style="margin:0 auto 8px;width:60px;height:60px;font-size:22px;background:${colorFor(name)}">${esc(initials(name))}</div>
      <div class="section-title" style="font-size:19px">Hey ${esc(name)}!</div>
      <div style="font-size:34px;font-weight:900;color:var(--pink);margin-top:6px">${total} <span style="font-size:15px;color:var(--text-muted);font-weight:700">pts</span></div>
      <div class="section-sub" style="margin:2px 0 0">across ${mine.length} profile${mine.length === 1 ? '' : 's'}</div>
      <button class="btn btn-outline btn-sm" style="width:auto;margin-top:10px" onclick="changeName()">Not you? Switch name</button>
    </div>
    ${assignHint}
    <div class="card">
      <div class="label" style="margin-bottom:10px">Your singles</div>
      ${list}
    </div>
    <button class="btn btn-pink" onclick="newProfile()">Build a new profile</button>
    <button class="btn btn-ghost" onclick="newProfile(true)" style="margin-top:8px">Make a profile for myself</button>`;
}

function saveMyName() { const n = document.getElementById('me-name-input').value.trim(); if (!n) { toast('Enter your name'); return; } setMyName(n); renderMe(); }
function changeName() { const n = (window.prompt('Your name:', myName()) || '').trim(); if (n) { setMyName(n); renderMe(); } }

/* ---------------- profile builder ---------------- */
// Prompt library, mirrors PROMPT_DEFS in server.js.
const PROMPTS = [
  { key: 'two-truths', q: 'Two truths and a lie', type: 'triple', ph: ['A true thing about them', 'Another true thing', 'Or the lie'] },
  { key: 'green-flag', q: 'Biggest green flag', type: 'text', ph: 'e.g. texts back within a reasonable human timeframe' },
  { key: 'one-catch', q: 'Their one catch', type: 'text', ph: "e.g. will make you watch every Christopher Nolan film" },
  { key: 'win-them-over', q: 'The way to win them over is…', type: 'text', ph: 'e.g. bring snacks and let them pick the playlist' },
  { key: 'wont-shut-up', q: "They won't shut up about…", type: 'text', ph: 'e.g. their half-marathon nobody asked about' },
  { key: 'go-crazy-for', q: 'They go crazy for…', type: 'text', ph: 'e.g. a perfectly crispy roast potato' },
  { key: 'get-along-if', q: "You'll get along if…", type: 'text', ph: 'e.g. you also think pineapple belongs on pizza' },
  { key: 'irrational-fear', q: 'Their most irrational fear…', type: 'text', ph: 'e.g. geese. all geese.' },
  { key: 'simple-pleasure', q: 'Their simple pleasures…', type: 'text', ph: 'e.g. a fresh notebook and an oat flat white' },
  { key: 'toxic-trait', q: 'Their toxic trait (affectionately)…', type: 'text', ph: 'e.g. always 10 minutes late but worth the wait' },
  { key: 'dont-hate-if', q: "Don't hate them if they…", type: 'text', ph: 'e.g. quote The Office at every opportunity' },
  { key: 'hot-take', q: 'Their most controversial opinion…', type: 'text', ph: 'e.g. cereal is a soup' },
  { key: 'hidden-talent', q: 'Their hidden talent…', type: 'text', ph: 'e.g. can name any song in 3 notes' },
  { key: 'secret-weapon', q: 'Secret weapon', type: 'secret', ph: 'Stays hidden until someone matches. Make it count.' },
];
function promptDef(key) { return PROMPTS.find((p) => p.key === key); }

function resetBuilder() {
  state.photos.forEach((ph) => { if (ph.preview) URL.revokeObjectURL(ph.preview); });
  state.photos = [];
  state.builderPrompts = [];
  document.getElementById('b-name').value = '';
  document.getElementById('b-pitch').value = '';
  document.getElementById('b-ask').value = '';
  renderPhotoTiles();
  renderPromptCards();
}

/* photos */
function renderPhotoTiles() {
  const wrap = document.getElementById('photo-tiles');
  let html = state.photos.map((ph, i) => `
    <div class="photo-tile filled" style="background-image:url('${esc(ph.url || ph.preview)}')">
      ${i === 0 ? '<span class="cover-badge">Cover</span>' : ''}
      <button class="tile-x" onclick="removePhoto(${i})" aria-label="Remove photo">×</button>
    </div>`).join('');
  if (state.photos.length < 3) {
    html += `<button class="photo-tile add" onclick="document.getElementById('photo-input').click()" aria-label="Add photo"><span>+</span><small>Add</small></button>`;
  }
  wrap.innerHTML = html;
}
function removePhoto(i) {
  const ph = state.photos[i]; if (ph && ph.preview) URL.revokeObjectURL(ph.preview);
  state.photos.splice(i, 1); renderPhotoTiles();
}
function onPhotoInput(e) {
  for (const f of [...e.target.files]) { if (state.photos.length >= 3) break; state.photos.push({ file: f, preview: URL.createObjectURL(f) }); }
  e.target.value = ''; renderPhotoTiles();
}

/* prompts */
function openPromptPicker() {
  if (state.builderPrompts.length >= 4) { toast('Max 4 prompts'); return; }
  const used = new Set(state.builderPrompts.map((p) => p.key));
  const avail = PROMPTS.filter((p) => !used.has(p.key));
  document.getElementById('prompt-picker-list').innerHTML = avail
    .map((p) => `<button class="prompt-pick-item" onclick="addPrompt('${p.key}')">${p.emoji ? p.emoji + ' ' : ''}${esc(p.q)}</button>`).join('');
  openSheet('prompt-picker-overlay');
}
function addPrompt(key) {
  if (state.builderPrompts.length >= 4) return;
  const def = promptDef(key); if (!def) return;
  const entry = { key, type: def.type };
  if (def.type === 'triple') entry.answers = ['', '', '']; else entry.answer = '';
  state.builderPrompts.push(entry);
  closeSheet('prompt-picker-overlay');
  renderPromptCards();
}
function removePrompt(i) { state.builderPrompts.splice(i, 1); renderPromptCards(); }
function updatePromptAnswer(i, val) { if (state.builderPrompts[i]) state.builderPrompts[i].answer = val; }
function updatePromptTriple(i, j, val) { if (state.builderPrompts[i]) state.builderPrompts[i].answers[j] = val; }

function renderPromptCards() {
  const wrap = document.getElementById('prompt-cards');
  wrap.innerHTML = state.builderPrompts.map((pr, i) => {
    const def = promptDef(pr.key) || { q: pr.key };
    let body;
    if (pr.type === 'triple') {
      body = `<div class="tt-inputs">${[0, 1, 2].map((j) =>
        `<input type="text" placeholder="${esc((def.ph && def.ph[j]) || '')}" value="${esc(pr.answers[j])}" oninput="updatePromptTriple(${i},${j},this.value)">`).join('')}</div>`;
    } else {
      body = `<input type="text" placeholder="${esc(def.ph || '')}" value="${esc(pr.answer)}" oninput="updatePromptAnswer(${i},this.value)">`;
    }
    return `<div class="prompt-card">
      <div class="pc-head"><span class="pc-q">${def.emoji ? def.emoji + ' ' : ''}${esc(def.q)}</span>
        <button class="tile-x dark" onclick="removePrompt(${i})" aria-label="Remove prompt">×</button></div>
      ${body}
    </div>`;
  }).join('');
  document.getElementById('prompt-count').textContent = `${state.builderPrompts.length}/4`;
  document.getElementById('add-prompt-btn').style.display = state.builderPrompts.length >= 4 ? 'none' : '';
}

/* open / edit / submit */
function newProfile(self) {
  if (!myName()) { setTab('s-me'); return; }
  state.formMode = 'create'; state.editingId = null; resetBuilder();
  document.getElementById('name-field').style.display = '';
  document.getElementById('form-title').textContent = self ? 'Your profile' : 'New profile';
  if (self) document.getElementById('b-name').value = myName();
  document.getElementById('form-submit-btn').textContent = 'Post profile';
  goScreen('s-form', { hideNav: true });
}

function editProfile(id) {
  getJSON('/api/profiles').then((all) => {
    const prof = all.find((x) => String(x.id) === String(id)); if (!prof) { toast('Not found'); return; }
    state.formMode = 'edit'; state.editingId = id; resetBuilder();
    document.getElementById('name-field').style.display = 'none';
    document.getElementById('form-title').textContent = `Edit ${prof.singleName}`;
    document.getElementById('b-pitch').value = prof.pitch || '';
    document.getElementById('b-ask').value = prof.askAbout || '';
    const urls = (prof.photoUrls && prof.photoUrls.length) ? prof.photoUrls : (prof.photoUrl ? [prof.photoUrl] : []);
    state.photos = urls.slice(0, 3).map((u) => ({ url: u }));
    state.builderPrompts = (prof.prompts || []).slice(0, 4).map((pr) => {
      if (pr.type === 'triple') return { key: pr.key, type: 'triple', answers: (Array.isArray(pr.answers) && pr.answers.length === 3) ? pr.answers.slice() : ['', '', ''] };
      return { key: pr.key, type: pr.type, answer: pr.answer || '' };
    });
    renderPhotoTiles(); renderPromptCards();
    document.getElementById('form-submit-btn').textContent = 'Save changes';
    goScreen('s-form', { hideNav: true });
  }).catch((e) => toast(e.message));
}

function cancelForm() { setTab('s-me'); }

function validateBuilder() {
  if (state.photos.length < 1) return 'Add at least one photo.';
  if (state.formMode === 'create' && !document.getElementById('b-name').value.trim()) return 'Enter their first name.';
  if (!document.getElementById('b-pitch').value.trim()) return 'Give them a one-line pitch.';
  if (!document.getElementById('b-ask').value.trim()) return 'Add something to ask them about.';
  for (const pr of state.builderPrompts) {
    if (pr.type === 'triple') { if (pr.answers.some((a) => !a.trim())) return 'Fill all three lines of Two truths and a lie.'; }
    else if (!pr.answer.trim()) return 'Fill in every prompt you added (or remove it).';
  }
  return null;
}

function buildBuilderData() {
  const fd = new FormData();
  fd.append('createdBy', myName());
  if (state.formMode === 'create') fd.append('singleName', document.getElementById('b-name').value.trim());
  fd.append('pitch', document.getElementById('b-pitch').value.trim());
  fd.append('askAbout', document.getElementById('b-ask').value.trim());
  const order = []; let n = 0;
  for (const ph of state.photos) {
    if (ph.url) order.push(ph.url);
    else { fd.append('photos', ph.file); order.push('new:' + (n++)); }
  }
  fd.append('photoOrder', JSON.stringify(order));
  fd.append('prompts', JSON.stringify(state.builderPrompts.map((p) =>
    p.type === 'triple' ? { key: p.key, type: 'triple', answers: p.answers } : { key: p.key, type: p.type, answer: p.answer })));
  return fd;
}

async function submitForm() {
  const err = validateBuilder(); if (err) { toast(err); return; }
  const btn = document.getElementById('form-submit-btn'); btn.disabled = true;
  try {
    if (state.formMode === 'create') await api('/api/profiles', { method: 'POST', body: buildBuilderData() });
    else await api('/api/profiles/' + state.editingId, { method: 'PUT', body: buildBuilderData() });
    toast(state.formMode === 'create' ? 'Profile is live!' : 'Saved');
    setTab('s-me');
  } catch (e) { toast(e.message); } finally { btn.disabled = false; }
}

async function deleteProfile(id, name) {
  if (!window.confirm(`Delete ${name}'s profile? This can't be undone.`)) return;
  try { await api('/api/profiles/' + id, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ createdBy: myName() }) }); toast('Deleted'); renderMe(); }
  catch (e) { toast(e.message); }
}

/* ---------------- log event sheet ---------------- */
function openEvent(id, drinkLevel, name) {
  state.eventProfileId = id; state.eventSel = null; state.evtPhotoFile = null;
  state.eventDrinkLevel = Number(drinkLevel) || 0;
  document.getElementById('evt-title').textContent = name ? `Log a moment for ${name}` : 'Log a moment';
  document.getElementById('evt-photo').value = '';
  document.getElementById('evt-photo-pick').classList.remove('has-img');
  document.getElementById('evt-photo-text').textContent = 'Snap or upload the proof';
  document.getElementById('evt-custom-text').value = '';
  renderCatalog();
  openSheet('event-overlay');
}

// Build the segmented chooser; each segment reveals one category, so the sheet
// is never a wall of identical chips.
function renderCatalog() {
  const SEGS = [['drink', '🍺', 'Bar'], ['ladder', '💘', 'Romance'], ['deed', '🎉', 'Chaos'], ['custom', '✏️', 'Custom']];
  const bar = `<div class="evt-segs" role="tablist">${SEGS.map(([k, e, l]) =>
    `<button class="evt-seg${k === 'drink' ? ' on' : ''}" data-seg="${k}" onclick="selectSegment('${k}')"><span class="evt-seg-ico">${e}</span>${l}</button>`).join('')}</div>
    <div class="evt-panel" id="evt-panel"></div>`;
  document.getElementById('evt-catalog').innerHTML = bar;
  selectSegment('drink');
}

function selectSegment(seg) {
  state.eventSeg = seg;
  state.eventSel = null;
  document.querySelectorAll('.evt-seg').forEach((b) => b.classList.toggle('on', b.dataset.seg === seg));
  const cat = state.catalog;
  const panel = document.getElementById('evt-panel');
  const customField = document.getElementById('evt-custom-field');
  customField.style.display = 'none';

  if (seg === 'ladder' || seg === 'deed') {
    const group = cat.catalog[seg];
    const isLadder = seg === 'ladder';
    panel.innerHTML =
      (isLadder ? `<div class="evt-hint">The further they get, the bigger the points.</div>` : '') +
      `<div class="moment-list${isLadder ? ' ladder' : ''}">` +
      group.events.map((e) => `
        <button class="moment" data-type="${seg}" data-key="${e.key}" data-pts="${e.points}" onclick="selectEvent(this)">
          <span class="moment-ico">${e.emoji}</span>
          <span class="moment-label">${esc(e.label)}</span>
          <span class="moment-pts">+${e.points}</span>
        </button>`).join('') + `</div>`;
  } else if (seg === 'drink') {
    const lvl = state.eventDrinkLevel || 0;
    const maxed = lvl >= cat.maxDrinkLevel;
    const next = cat.drinkLevels[Math.min(cat.maxDrinkLevel, lvl + 1)];
    const dots = cat.drinkLevels.slice(1).map((d, i) =>
      `<span class="drink-dot${i < lvl ? ' on' : ''}">${i < lvl ? d.emoji : '○'}</span>`).join('<span class="drink-bar"></span>');
    const now = cat.drinkLevels[lvl];
    panel.innerHTML = `<div class="drink-panel">
      <div class="drink-now"><span class="label">Currently</span><b>${now.emoji} ${esc(now.label)}</b></div>
      <div class="drink-track">${dots}</div>
      ${maxed
        ? `<div class="drink-maxed">🆘 Fully sent. The meter can't go any higher.</div>`
        : `<button class="moment moment-wide" data-type="drink" data-pts="${cat.points.drinkStep}" onclick="selectEvent(this)">
             <span class="moment-ico">${next.emoji}</span>
             <span class="moment-label">Bump the meter to ${esc(next.label)}</span>
             <span class="moment-pts">+${cat.points.drinkStep}</span>
           </button>`}
    </div>`;
  } else if (seg === 'custom') {
    panel.innerHTML = `<div class="evt-hint">Something the list didn't cover? Spell it out, worth +${cat.points.custom}.</div>`;
    customField.style.display = '';
    state.eventSel = { type: 'custom' };
    setTimeout(() => document.getElementById('evt-custom-text').focus(), 60);
  }
  updateSubmit();
}

function selectEvent(btn) {
  document.querySelectorAll('#evt-panel .moment').forEach((c) => c.classList.remove('on'));
  btn.classList.add('on');
  state.eventSel = { type: btn.dataset.type, key: btn.dataset.key, pts: Number(btn.dataset.pts) || 0 };
  updateSubmit();
}

// Reflect the pending selection on the submit button (shows the points you'll earn).
function updateSubmit() {
  const btn = document.getElementById('evt-submit');
  const sel = state.eventSel;
  if (!sel) { btn.innerHTML = 'Pick a moment above'; btn.classList.add('btn-muted'); return; }
  const pts = sel.type === 'custom' ? (state.catalog.points.custom || 5) : (sel.pts || 0);
  btn.innerHTML = `Log it <span class="log-pts">+${pts}</span>`;
  btn.classList.remove('btn-muted');
}

async function submitEvent() {
  if (!state.evtPhotoFile) { toast('Add a photo as proof'); return; }
  if (!state.eventSel) { toast('Pick what happened'); return; }
  const fd = new FormData();
  fd.append('photo', state.evtPhotoFile);
  fd.append('type', state.eventSel.type);
  if (state.eventSel.key) fd.append('key', state.eventSel.key);
  if (state.eventSel.type === 'custom') { const t = document.getElementById('evt-custom-text').value.trim(); if (!t) { toast('Describe the moment'); return; } fd.append('label', t); }
  const btn = document.getElementById('evt-submit'); btn.disabled = true;
  try {
    const res = await api(`/api/profiles/${state.eventProfileId}/events`, { method: 'POST', body: fd });
    toast(`Logged! +${res.event.points} pts`);
    closeSheet('event-overlay');
    // refresh whichever view is showing so the new moment + points appear
    if (document.getElementById('s-browse').classList.contains('active')) renderDeck();
    else renderMe();
  } catch (e) { toast(e.message); } finally { btn.disabled = false; }
}

/* ---------------- sheets / photo viewer ---------------- */
function openSheet(id) { document.getElementById(id).classList.add('show'); }
function closeSheet(id) { document.getElementById(id).classList.remove('show'); }
function viewPhoto(url) { document.getElementById('full-photo-img').src = url; document.getElementById('full-photo').classList.add('show'); }

/* close overlay when tapping backdrop */
document.querySelectorAll('.overlay').forEach((o) => o.addEventListener('click', (e) => { if (e.target === o) o.classList.remove('show'); }));

/* photo input wiring */
function wirePhoto(inputId, pickId, textId, stateKey) {
  document.getElementById(inputId).addEventListener('change', (e) => {
    const f = e.target.files[0]; if (!f) return;
    state[stateKey] = f;
    const pick = document.getElementById(pickId); pick.classList.add('has-img');
    const url = URL.createObjectURL(f);
    document.getElementById(textId).innerHTML = `<img src="${url}" alt="">`;
  });
}

/* ---------------- init ---------------- */
async function init() {
  guestId();
  maybeSplash();
  document.getElementById('photo-input').addEventListener('change', onPhotoInput);
  wirePhoto('evt-photo', 'evt-photo-pick', 'evt-photo-text', 'evtPhotoFile');
  try { state.catalog = await getJSON('/api/event-catalog'); } catch { state.catalog = { reactionEmojis: [], drinkLevels: [], catalog: {}, points: {} }; }
  renderDeck();
}
init();
