// points.js — the single source of truth for the scoring game.
// Pure functions only (no I/O) so they're trivially unit-testable and the
// client can never tamper with point values: the server assigns them by type.

const REACTION_POINTS = 1; // per unique guest+emoji+profile
const MATCH_POINTS = 10; // a single hitting 💍, once per single per profile
const DRINK_STEP_POINTS = 2; // each advance of the drink-o-meter
const CUSTOM_EVENT_POINTS = 5; // freeform "write your own" event

// Playful, intentionally-not-romantic reaction set (incl. the requested 🍑 🍆).
const REACTION_EMOJIS = ['🔥', '😍']; // curated reactions (Match is a separate action)

// Drink-o-meter statuses by level (index 0 = stone sober, not an event).
const DRINK_LEVELS = [
  { level: 0, emoji: '🫗', label: 'Stone-cold sober' },
  { level: 1, emoji: '🍺', label: 'Tipsy' },
  { level: 2, emoji: '🍷', label: 'Feeling it' },
  { level: 3, emoji: '🥂', label: 'Toasting strangers' },
  { level: 4, emoji: '🥴', label: 'Someone hide their keys' },
  { level: 5, emoji: '💃', label: 'Dancing on the furniture' },
  { level: 6, emoji: '😵‍💫', label: 'Seeing double' },
  { level: 7, emoji: '🆘', label: "We've lost them" },
];
const MAX_DRINK_LEVEL = 7;

// The event catalog. `type` groups them; `key` is the stable id the client sends.
const EVENT_CATALOG = {
  // Escalating romantic ladder.
  ladder: {
    title: '💘 Romantic ladder',
    events: [
      { key: 'eye', emoji: '👀', label: 'Sustained eye contact', points: 2 },
      { key: 'handshake', emoji: '🤝', label: 'Firm handshake', points: 4 },
      { key: 'hug', emoji: '🫂', label: 'Hug', points: 6 },
      { key: 'dance', emoji: '💃', label: 'Danced together', points: 8 },
      { key: 'cheek', emoji: '😘', label: 'Cheek kiss', points: 12 },
      { key: 'kiss', emoji: '💋', label: 'The real deal', points: 18 },
      { key: 'number', emoji: '📱', label: 'Got the number', points: 25 },
    ],
  },
  // Flat-value deeds & chaos.
  deed: {
    title: '🎉 Deeds & chaos',
    events: [
      { key: 'bouquet', emoji: '💐', label: 'Caught the bouquet', points: 10 },
      { key: 'speech', emoji: '🎤', label: 'Nailed a speech', points: 8 },
      { key: 'dancefloor', emoji: '🕺', label: 'Owned the dance floor', points: 8 },
      { key: 'cried', emoji: '😭', label: 'Cried at the ceremony', points: 5 },
      { key: 'worm', emoji: '🪱', label: 'Attempted the worm', points: 5 },
      { key: 'networking', emoji: '🤵', label: 'Aggressively "networking" with the parents', points: 5 },
      { key: 'conga', emoji: '👯', label: 'Started a conga line', points: 5 },
    ],
  },
};

// Flat lookup: key -> { type, emoji, label, points }.
const EVENT_BY_KEY = {};
for (const [type, group] of Object.entries(EVENT_CATALOG)) {
  for (const e of group.events) EVENT_BY_KEY[e.key] = { type, ...e };
}

function drinkStatus(level) {
  const l = Math.max(0, Math.min(MAX_DRINK_LEVEL, level || 0));
  return DRINK_LEVELS[l];
}

// Count unique reactions: at most one of each emoji per guest per profile.
function uniqueReactionCount(reactions = []) {
  const seen = new Set();
  for (const r of reactions) {
    if (!r || !r.guestId || !r.emoji) continue;
    seen.add(r.guestId + '|' + r.emoji);
  }
  return seen.size;
}

// Tally reactions by emoji for display, e.g. { '😂': 12, '🔥': 8 }.
function reactionTally(reactions = []) {
  const tally = {};
  const seen = new Set();
  for (const r of reactions) {
    if (!r || !r.guestId || !r.emoji) continue;
    const k = r.guestId + '|' + r.emoji;
    if (seen.has(k)) continue;
    seen.add(k);
    tally[r.emoji] = (tally[r.emoji] || 0) + 1;
  }
  return tally;
}

function uniqueMatchCount(matches = []) {
  const seen = new Set();
  for (const m of matches) {
    if (!m || !m.by) continue;
    seen.add(m.by);
  }
  return seen.size;
}

function eventsPoints(events = []) {
  return events.reduce((sum, e) => sum + (Number(e && e.points) || 0), 0);
}

// Total points a single profile has earned for its creator.
function computePoints(profile) {
  if (!profile) return 0;
  return (
    uniqueReactionCount(profile.reactions) * REACTION_POINTS +
    uniqueMatchCount(profile.matches) * MATCH_POINTS +
    eventsPoints(profile.events)
  );
}

// Resolve an event submission from the client into a trusted, scored record.
// `type` is 'ladder' | 'deed' | 'drink' | 'custom'. Returns null if invalid.
//  - ladder/deed: looked up by `key`; points come from the catalog.
//  - drink: advancing the meter; points = DRINK_STEP_POINTS.
//  - custom: freeform label; fixed CUSTOM_EVENT_POINTS.
function resolveEvent({ type, key, label, nextDrinkLevel } = {}) {
  if (type === 'custom') {
    const text = (label || '').toString().trim();
    if (!text) return null;
    return { type: 'custom', emoji: '✨', label: text.slice(0, 120), points: CUSTOM_EVENT_POINTS };
  }
  if (type === 'drink') {
    const status = drinkStatus(nextDrinkLevel);
    if (status.level === 0) return null;
    return { type: 'drink', emoji: status.emoji, label: status.label, points: DRINK_STEP_POINTS };
  }
  const def = EVENT_BY_KEY[key];
  if (!def) return null;
  return { type: def.type, emoji: def.emoji, label: def.label, points: def.points };
}

// Build the leaderboard: one row per creator, summing points across their profiles.
function leaderboard(profiles = []) {
  const byCreator = new Map();
  for (const p of profiles) {
    const creator = p.createdBy || p.singleName || 'Unknown';
    const pts = computePoints(p);
    const row = byCreator.get(creator) || { wingman: creator, points: 0, singles: [], profileCount: 0 };
    row.points += pts;
    row.profileCount += 1;
    if (p.singleName && !row.singles.some((s) => s.name === p.singleName)) {
      const photoUrl = p.photoUrl || (Array.isArray(p.photoUrls) && p.photoUrls[0]) || null;
      row.singles.push({ name: p.singleName, photoUrl });
    }
    byCreator.set(creator, row);
  }
  return [...byCreator.values()].sort(
    (a, b) => b.points - a.points || a.wingman.localeCompare(b.wingman)
  );
}

module.exports = {
  REACTION_POINTS,
  MATCH_POINTS,
  DRINK_STEP_POINTS,
  CUSTOM_EVENT_POINTS,
  MAX_DRINK_LEVEL,
  REACTION_EMOJIS,
  DRINK_LEVELS,
  EVENT_CATALOG,
  EVENT_BY_KEY,
  drinkStatus,
  uniqueReactionCount,
  reactionTally,
  uniqueMatchCount,
  eventsPoints,
  computePoints,
  resolveEvent,
  leaderboard,
};
