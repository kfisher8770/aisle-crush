# 💍 Aisle Crush — Wedding Matchmaker App

Katherine & Antoine · June 20, 2025

## Quick start

```bash
node server.js
```

App runs on http://localhost:3000

## Pages

| URL | Who uses it |
|-----|-------------|
| `/` | All guests — welcome screen, wingman form, swiping, leaderboard |
| `/admin.html` | You (Katherine) — paste match list, monitor live |

## Setup before the wedding

1. Go to `/admin.html`
2. Paste your wingman → single list in the box (any of these formats work):
   ```
   Sophie → Lucas
   Marc, Camille
   Anaïs - Théo
   ```
3. Click **Save assignments**

## On the day

- Share the app URL with guests (use a QR code at each table!)
- Wingmen tap "Wingman", enter their name, and get directed to their single's profile form
- Singles tap "I'm single", enter their name, and start swiping
- Matches are mutual (both need to swipe yes/maybe on each other)
- Track progress at `/admin.html` — it auto-refreshes every 15 seconds

## Data

All data is stored in `data.json` in the project folder. Back it up after the wedding if you want to keep the match history!

## Deploying online

To make it accessible on guests' phones, deploy to any Node.js host:
- **Railway**: `railway up` (free tier works)
- **Render**: connect GitHub repo, set start command to `node server.js`
- **Fly.io**: `fly launch` then `fly deploy`

Or run on a laptop and share via local WiFi — works great for a single venue.
