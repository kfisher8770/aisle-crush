const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const archiver = require('archiver');
const P = require('./points');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Persisted data lives under DATA_DIR. Locally that's the project folder; on Railway
// set DATA_DIR=/data and mount a volume there so photos + scores survive restarts.
const DATA_DIR = process.env.DATA_DIR || __dirname;
const DATA_FILE = path.join(DATA_DIR, 'data.json');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
// Serve uploaded photos from the volume (their stored URLs are /uploads/<file>).
app.use('/uploads', express.static(UPLOAD_DIR));

// ---- Photo uploads (multer → UPLOAD_DIR i.e. <DATA_DIR>/uploads, URL stored in data) ----
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = (path.extname(file.originalname || '') || '.jpg').toLowerCase().slice(0, 5);
    const safe = `${Date.now()}-${Math.round(Math.random() * 1e9).toString(36)}${ext}`;
    cb(null, safe);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 12 * 1024 * 1024 }, // 12MB — phone photos
  fileFilter: (req, file, cb) => cb(null, /^image\//.test(file.mimetype)),
});
const photoUrl = (req) => (req.file ? `/uploads/${req.file.filename}` : null);

// ---- Data store with lightweight migration on read ----
const EMPTY = { assignments: [], profiles: [] };

function migrateProfile(p) {
  const photoUrls = Array.isArray(p.photoUrls) && p.photoUrls.length
    ? p.photoUrls.slice(0, 3)
    : (p.photoUrl ? [p.photoUrl] : []);
  return {
    id: p.id,
    singleName: p.singleName || '',
    createdBy: p.createdBy || p.wingmanName || p.singleName || 'Unknown',
    selfMade: p.selfMade != null ? !!p.selfMade : (p.createdBy || p.wingmanName) === p.singleName,
    photoUrls,
    photoUrl: photoUrls[0] || null, // alias kept for leaderboard / "Me" thumbnails
    pitch: p.pitch || '',
    askAbout: p.askAbout || '',
    prompts: Array.isArray(p.prompts) ? p.prompts : [],
    secret: p.secret || '',
    // legacy fields kept so pre-redesign profiles still render
    age: p.age || '',
    vibes: Array.isArray(p.vibes) ? p.vibes : [],
    habit: p.habit || '',
    cry: p.cry || '',
    dance: p.dance || 0,
    greenFlag: p.greenFlag || '',
    redFlag: p.redFlag || '',
    drinkLevel: p.drinkLevel || 0,
    reactions: Array.isArray(p.reactions) ? p.reactions : [],
    matches: Array.isArray(p.matches) ? p.matches : [],
    events: Array.isArray(p.events) ? p.events : [],
    createdAt: p.createdAt || new Date().toISOString(),
  };
}

// Canonical prompt library (keys + questions + types). Mirrors PROMPTS in app.js.
const PROMPT_DEFS = {
  'two-truths': { question: 'Two truths and a lie', type: 'triple' },
  'green-flag': { question: 'Biggest green flag', type: 'text' },
  'one-catch': { question: 'Their one catch', type: 'text' },
  'win-them-over': { question: 'The way to win them over is…', type: 'text' },
  'wont-shut-up': { question: "They won't shut up about…", type: 'text' },
  'go-crazy-for': { question: 'They go crazy for…', type: 'text' },
  'get-along-if': { question: "You'll get along if…", type: 'text' },
  'irrational-fear': { question: 'Their most irrational fear…', type: 'text' },
  'simple-pleasure': { question: 'Their simple pleasures…', type: 'text' },
  'toxic-trait': { question: 'Their toxic trait (affectionately)…', type: 'text' },
  'dont-hate-if': { question: "Don't hate them if they…", type: 'text' },
  'hot-take': { question: 'Their most controversial opinion…', type: 'text' },
  'hidden-talent': { question: 'Their hidden talent…', type: 'text' },
  'secret-weapon': { question: 'Secret weapon', type: 'secret' },
};

// Parse + validate the prompts payload (JSON string). Max 4, known keys only.
function sanitizePrompts(raw) {
  let arr = [];
  try { arr = typeof raw === 'string' ? JSON.parse(raw) : (Array.isArray(raw) ? raw : []); } catch { arr = []; }
  const out = [];
  for (const item of Array.isArray(arr) ? arr : []) {
    const def = PROMPT_DEFS[item && item.key];
    if (!def) continue;
    if (def.type === 'triple') {
      const answers = (Array.isArray(item.answers) ? item.answers : []).slice(0, 3).map((s) => String(s || '').slice(0, 160));
      while (answers.length < 3) answers.push('');
      out.push({ key: item.key, type: 'triple', question: def.question, answers });
    } else {
      out.push({ key: item.key, type: def.type, question: def.question, answer: String(item.answer || '').slice(0, 200) });
    }
    if (out.length >= 4) break;
  }
  return out;
}

function secretFromPrompts(prompts) {
  const s = prompts.find((p) => p.type === 'secret');
  return s ? (s.answer || '') : '';
}

// Build the ordered photoUrls from multipart: `photoOrder` lists existing /uploads URLs
// and `new:N` placeholders mapped to the Nth uploaded file in req.files.
function buildPhotoUrls(req) {
  const files = req.files || [];
  let order = [];
  try { order = JSON.parse((req.body && req.body.photoOrder) || '[]'); } catch { order = []; }
  const urls = [];
  for (const o of Array.isArray(order) ? order : []) {
    if (typeof o !== 'string') continue;
    if (o.startsWith('new:')) {
      const n = Number(o.slice(4));
      if (files[n]) urls.push('/uploads/' + files[n].filename);
    } else if (o.startsWith('/uploads/')) {
      urls.push(o);
    }
  }
  if (!urls.length && files.length) for (const f of files) urls.push('/uploads/' + f.filename); // defensive
  return urls.slice(0, 3);
}

function readData() {
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(EMPTY, null, 2));
    return JSON.parse(JSON.stringify(EMPTY));
  }
  const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  return {
    // support old "wingmenSingles" key
    assignments: Array.isArray(raw.assignments)
      ? raw.assignments
      : Array.isArray(raw.wingmenSingles)
      ? raw.wingmenSingles
      : [],
    profiles: Array.isArray(raw.profiles) ? raw.profiles.map(migrateProfile) : [],
  };
}

function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// Shape a profile for public consumption. `revealFor` is a single's name; if they
// have matched this profile (or it's revealed), include the secret.
// Shape a profile for consumption. `owner` = the wingman's own view, which is the only
// place intro requests (matcher name + photo) are exposed. Public browse never sees them.
function publicProfile(p, revealFor, owner = false) {
  const matchedByViewer =
    revealFor && p.matches.some((m) => m.by === 'single:' + revealFor.toLowerCase());
  const { secret, matches, ...rest } = p;
  // The secret-weapon prompt's answer must stay hidden until the viewer matches.
  const safePrompts = (Array.isArray(p.prompts) ? p.prompts : []).map((pr) =>
    pr.type === 'secret' && !matchedByViewer ? { ...pr, answer: '' } : pr,
  );
  // Only the wingman sees the intro list; everyone else gets a count.
  const intros = owner
    ? (Array.isArray(matches) ? matches : [])
        .filter((m) => m && m.name)
        .map((m) => ({ name: m.name, photoUrl: m.photoUrl || null, recommendedBy: m.recommendedBy || '', at: m.at }))
    : undefined;
  return {
    ...rest,
    prompts: safePrompts,
    points: P.computePoints(p),
    reactionTally: P.reactionTally(p.reactions),
    matchCount: P.uniqueMatchCount(p.matches),
    intros,
    drinkStatus: P.drinkStatus(p.drinkLevel),
    secretUnlocked: !!matchedByViewer,
    secret: matchedByViewer ? secret : undefined,
    hasSecret: !!secret,
  };
}

function findProfile(data, id) {
  return data.profiles.find((p) => String(p.id) === String(id));
}

// ---------------- API ----------------

// Server-owned scoring catalog so the client can render chips consistently.
app.get('/api/event-catalog', (req, res) => {
  res.json({
    reactionEmojis: P.REACTION_EMOJIS,
    drinkLevels: P.DRINK_LEVELS,
    maxDrinkLevel: P.MAX_DRINK_LEVEL,
    catalog: P.EVENT_CATALOG,
    points: {
      reaction: P.REACTION_POINTS,
      match: P.MATCH_POINTS,
      drinkStep: P.DRINK_STEP_POINTS,
      custom: P.CUSTOM_EVENT_POINTS,
    },
  });
});

app.get('/api/assignments', (req, res) => {
  res.json(readData().assignments);
});

// All profiles (for browsing). Optional ?revealFor=<single> to unlock matched secrets.
app.get('/api/profiles', (req, res) => {
  const data = readData();
  res.json(data.profiles.map((p) => publicProfile(p, req.query.revealFor)));
});

// Profiles created by a given person (the "Me" dashboard).
app.get('/api/profiles/by/:creator', (req, res) => {
  const data = readData();
  const creator = req.params.creator.toLowerCase();
  res.json(
    data.profiles
      .filter((p) => (p.createdBy || '').toLowerCase() === creator)
      .map((p) => publicProfile(p, req.query.revealFor, true))
  );
});

// Create a profile (multipart: up to 3 `photos` + photoOrder + fields + prompts JSON).
app.post('/api/profiles', upload.array('photos', 3), (req, res) => {
  const b = req.body || {};
  const singleName = (b.singleName || '').trim();
  const createdBy = (b.createdBy || '').trim();
  if (!singleName || !createdBy) {
    return res.status(400).json({ error: 'singleName and createdBy are required' });
  }
  const photoUrls = buildPhotoUrls(req);
  if (!photoUrls.length) return res.status(400).json({ error: 'add at least one photo' });
  const prompts = sanitizePrompts(b.prompts);

  const data = readData();
  const profile = migrateProfile({
    id: Date.now(),
    singleName,
    createdBy,
    selfMade: b.selfMade === 'true' || createdBy.toLowerCase() === singleName.toLowerCase(),
    photoUrls,
    pitch: (b.pitch || '').slice(0, 240),
    askAbout: (b.askAbout || '').slice(0, 200),
    prompts,
    secret: secretFromPrompts(prompts),
    createdAt: new Date().toISOString(),
  });
  data.profiles.push(profile);
  writeData(data);
  res.json({ success: true, profile: publicProfile(profile) });
});

// Edit a profile (creator name must match).
app.put('/api/profiles/:id', upload.array('photos', 3), (req, res) => {
  const data = readData();
  const p = findProfile(data, req.params.id);
  if (!p) return res.status(404).json({ error: 'not found' });
  const b = req.body || {};
  if ((b.createdBy || '').toLowerCase() !== (p.createdBy || '').toLowerCase()) {
    return res.status(403).json({ error: 'only the creator can edit this profile' });
  }
  if (b.pitch != null) p.pitch = String(b.pitch).slice(0, 240);
  if (b.askAbout != null) p.askAbout = String(b.askAbout).slice(0, 200);
  if (b.prompts != null) {
    const prompts = sanitizePrompts(b.prompts);
    // The client can't see an existing secret (it's redacted), so a blank secret
    // answer on edit means "unchanged" — preserve it rather than wiping it.
    const incoming = prompts.find((x) => x.type === 'secret');
    if (incoming && !incoming.answer && p.secret) incoming.answer = p.secret;
    p.prompts = prompts; // may be empty — prompts are optional
    p.secret = secretFromPrompts(prompts);
  }
  if (b.photoOrder != null) {
    const urls = buildPhotoUrls(req);
    if (urls.length) { p.photoUrls = urls; p.photoUrl = urls[0]; }
  }
  writeData(data);
  res.json({ success: true, profile: publicProfile(p) });
});

app.delete('/api/profiles/:id', (req, res) => {
  const data = readData();
  const p = findProfile(data, req.params.id);
  if (!p) return res.status(404).json({ error: 'not found' });
  const by = (req.body && req.body.createdBy ? req.body.createdBy : '').toLowerCase();
  if (by !== (p.createdBy || '').toLowerCase()) {
    return res.status(403).json({ error: 'only the creator can delete this profile' });
  }
  data.profiles = data.profiles.filter((x) => String(x.id) !== String(p.id));
  writeData(data);
  res.json({ success: true });
});

// Toggle an emoji reaction (one of each emoji per guest per profile).
app.post('/api/profiles/:id/react', (req, res) => {
  const { guestId, emoji } = req.body || {};
  if (!guestId || !emoji) return res.status(400).json({ error: 'guestId and emoji required' });
  if (!P.REACTION_EMOJIS.includes(emoji)) return res.status(400).json({ error: 'unknown emoji' });
  const data = readData();
  const p = findProfile(data, req.params.id);
  if (!p) return res.status(404).json({ error: 'not found' });
  const idx = p.reactions.findIndex((r) => r.guestId === guestId && r.emoji === emoji);
  let reacted;
  if (idx >= 0) {
    p.reactions.splice(idx, 1); // toggle off
    reacted = false;
  } else {
    p.reactions.push({ guestId, emoji, at: new Date().toISOString() });
    reacted = true;
  }
  writeData(data);
  res.json({ success: true, reacted, reactionTally: P.reactionTally(p.reactions), points: P.computePoints(p) });
});

// A single hits 💍 Match (worth a lot, once per single per profile).
// Match a single: requires an intro (matcher name + photo). Every submission is a
// distinct match — anyone can match, as many times as they like, each worth points.
app.post('/api/profiles/:id/match', upload.single('photo'), (req, res) => {
  const b = req.body || {};
  const name = (b.name || '').trim();
  if (!name) return res.status(400).json({ error: 'your name is required' });
  const photo = photoUrl(req);
  if (!photo) return res.status(400).json({ error: 'a photo is required' });
  const recommendedBy = (b.recommendedBy || '').trim().slice(0, 60);
  const data = readData();
  const p = findProfile(data, req.params.id);
  if (!p) return res.status(404).json({ error: 'not found' });
  const by = 'm_' + Date.now().toString(36) + Math.round(Math.random() * 1e6).toString(36);
  p.matches.push({ by, name, photoUrl: photo, recommendedBy, at: new Date().toISOString() });
  writeData(data);
  res.json({
    success: true,
    secret: p.secret || '',
    hasSecret: !!p.secret,
    wingman: p.createdBy,
    singleName: p.singleName,
    points: P.computePoints(p),
  });
});

// Log a real-life event (multipart: required `photo` + event descriptor).
app.post('/api/profiles/:id/events', upload.single('photo'), (req, res) => {
  const data = readData();
  const p = findProfile(data, req.params.id);
  if (!p) return res.status(404).json({ error: 'not found' });
  if (!req.file) return res.status(400).json({ error: 'photo proof is required' });

  const b = req.body || {};
  let descriptor = { type: b.type, key: b.key, label: b.label };
  if (b.type === 'drink') {
    descriptor.nextDrinkLevel = Math.min(P.MAX_DRINK_LEVEL, (p.drinkLevel || 0) + 1);
    if (descriptor.nextDrinkLevel === p.drinkLevel) {
      return res.status(400).json({ error: 'drink-o-meter is already maxed out 🆘' });
    }
  }
  const resolved = P.resolveEvent(descriptor);
  if (!resolved) return res.status(400).json({ error: 'invalid event' });

  if (b.type === 'drink') p.drinkLevel = descriptor.nextDrinkLevel;

  const event = {
    id: `${Date.now()}-${Math.round(Math.random() * 1e6).toString(36)}`,
    ...resolved,
    photoUrl: photoUrl(req),
    at: new Date().toISOString(),
  };
  p.events.unshift(event); // newest first
  writeData(data);
  res.json({ success: true, event, points: P.computePoints(p), drinkLevel: p.drinkLevel });
});

app.get('/api/leaderboard', (req, res) => {
  res.json(P.leaderboard(readData().profiles));
});

// ---- Admin ----
app.post('/api/admin/assignments', (req, res) => {
  const data = readData();
  data.assignments = Array.isArray(req.body.assignments) ? req.body.assignments : [];
  writeData(data);
  res.json({ success: true });
});

app.post('/api/admin/reset', (req, res) => {
  const data = readData();
  writeData({ assignments: data.assignments, profiles: [] }); // keep assignments
  res.json({ success: true });
});

app.post('/api/admin/reset-all', (req, res) => {
  writeData(JSON.parse(JSON.stringify(EMPTY)));
  res.json({ success: true });
});

app.get('/api/admin/data', (req, res) => {
  res.json(readData());
});

// Diagnose where data is being written and whether it survives redeploys.
//   /api/admin/health?key=YOUR_PASSWORD
// persistent:true means DATA_DIR points at a mounted volume, not the throwaway disk.
app.get('/api/admin/health', (req, res) => {
  if (process.env.EXPORT_PASSWORD && (req.query.key || '') !== process.env.EXPORT_PASSWORD) {
    return res.status(401).json({ error: 'wrong or missing ?key= password' });
  }
  let profileCount = null;
  let uploadCount = null;
  let writable = false;
  try { profileCount = (readData().profiles || []).length; } catch {}
  try { uploadCount = fs.readdirSync(UPLOAD_DIR).filter((f) => f !== '.gitkeep').length; } catch {}
  try {
    const probe = path.join(DATA_DIR, '.write-probe');
    fs.writeFileSync(probe, 'ok');
    fs.unlinkSync(probe);
    writable = true;
  } catch {}
  res.json({
    dataDir: DATA_DIR,
    appDir: __dirname,
    dataDirFromEnv: !!process.env.DATA_DIR,
    persistent: !!process.env.DATA_DIR && DATA_DIR !== __dirname, // false ⇒ data WILL be lost on redeploy
    writable,
    dataFile: DATA_FILE,
    dataFileExists: fs.existsSync(DATA_FILE),
    profileCount,
    uploadDir: UPLOAD_DIR,
    uploadCount,
  });
});

// Download everything (all photos + data.json) as a single zip, so the host can
// keep a copy on their PC after the event. Password-gated via EXPORT_PASSWORD.
//   /api/admin/export?key=YOUR_PASSWORD
app.get('/api/admin/export', (req, res) => {
  const pass = process.env.EXPORT_PASSWORD;
  if (!pass) {
    return res.status(503).json({ error: 'export disabled: set the EXPORT_PASSWORD env var to enable it' });
  }
  if ((req.query.key || '') !== pass) {
    return res.status(401).json({ error: 'wrong or missing ?key= password' });
  }
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  res.attachment(`haaave-you-met-export-${stamp}.zip`);
  // level 0 (store) — photos are already JPEG/PNG, so compression buys nothing and is slower.
  const archive = archiver('zip', { zlib: { level: 0 } });
  archive.on('error', () => { try { res.status(500).end(); } catch {} });
  archive.pipe(res);
  if (fs.existsSync(DATA_FILE)) archive.file(DATA_FILE, { name: 'data.json' });
  if (fs.existsSync(UPLOAD_DIR)) archive.directory(UPLOAD_DIR, 'uploads');
  archive.finalize();
});

// Multer / error handler.
app.use((err, req, res, next) => {
  if (err) return res.status(400).json({ error: err.message || 'upload error' });
  next();
});

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => console.log(`Haaave you met…? running on http://localhost:${PORT}`));
}

module.exports = app;
