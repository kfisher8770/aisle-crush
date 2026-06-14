const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const DATA_FILE = path.join(__dirname, 'data.json');

function readData() {
  if (!fs.existsSync(DATA_FILE)) {
    const init = { wingmenSingles: [], profiles: [], matches: [], swipes: [] };
    fs.writeFileSync(DATA_FILE, JSON.stringify(init, null, 2));
    return init;
  }
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// Get all profiles for swiping
app.get('/api/profiles', (req, res) => {
  const data = readData();
  res.json(data.profiles);
});

// Get wingman assignments (who is whose wingman)
app.get('/api/assignments', (req, res) => {
  const data = readData();
  res.json(data.wingmenSingles);
});

// Submit a completed profile (by wingman)
app.post('/api/profiles', (req, res) => {
  const data = readData();
  const profile = { id: Date.now(), ...req.body, matches: 0, createdAt: new Date().toISOString() };
  data.profiles.push(profile);
  writeData(data);
  res.json({ success: true, profile });
});

// Record a swipe
app.post('/api/swipe', (req, res) => {
  const { swiperId, profileId, action } = req.body;
  const data = readData();

  // Prevent duplicate swipes
  const already = data.swipes.find(s => s.swiperId === swiperId && s.profileId === profileId);
  if (already) return res.json({ match: false, alreadySwiped: true });

  data.swipes.push({ swiperId, profileId, action, at: new Date().toISOString() });

  let isMatch = false;
  if (action === 'yes' || action === 'maybe') {
    // Check if the other person also swiped yes/maybe on this swiper
    const counterSwipe = data.swipes.find(
      s => s.swiperId === profileId && s.profileId === swiperId && (s.action === 'yes' || s.action === 'maybe')
    );
    if (counterSwipe) {
      isMatch = true;
      data.matches.push({ user1: swiperId, user2: profileId, at: new Date().toISOString() });
      // Increment match counts
      const p1 = data.profiles.find(p => p.id == profileId);
      if (p1) p1.matches = (p1.matches || 0) + 1;
      const p2 = data.profiles.find(p => p.id == swiperId);
      if (p2) p2.matches = (p2.matches || 0) + 1;
    }
  }

  writeData(data);
  res.json({ match: isMatch });
});

// Get leaderboard (wingmen ranked by their single's matches)
app.get('/api/leaderboard', (req, res) => {
  const data = readData();
  const lb = data.profiles.map(p => ({
    wingman: p.wingmanName,
    single: p.singleName,
    matches: p.matches || 0,
  })).sort((a, b) => b.matches - a.matches);
  res.json(lb);
});

// Admin: set wingman→single assignments
app.post('/api/admin/assignments', (req, res) => {
  const data = readData();
  data.wingmenSingles = req.body.assignments;
  writeData(data);
  res.json({ success: true });
});

// Admin: reset all data
app.post('/api/admin/reset', (req, res) => {
  writeData({ wingmenSingles: [], profiles: [], matches: [], swipes: [] });
  res.json({ success: true });
});

// Admin: view all data
app.get('/api/admin/data', (req, res) => {
  res.json(readData());
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Aisle Crush running on http://localhost:${PORT}`));
