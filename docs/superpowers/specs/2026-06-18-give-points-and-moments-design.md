# "Give points" + open moment logging — design spec

Date: 2026-06-18
Status: approved

## Problem

Two card sections were unclear:
- **Reactions** ("React — it's just for fun 😄"): 8 emoji (😂🔥🍑🍆💀😍👏🥂), each +1 point. The
  wording undercut the purpose and the suggestive emoji read as "for laughs," not support.
- **"The night so far"**: a photo timeline of logged real-life moments. The label didn't say
  what it was, and only the **wingman** could log (from the Me tab).

## Reframe

Both are the same act at different weights: **giving a single points** (which climbs their
wingman on the Best Wingman leaderboard). A tap is a quick point; a logged photo is a bigger
point with proof. Unify them under one heading and make the points mechanic visible.

Accepted consequence: opening logging to everyone means a single's score reflects the whole
room, not just their wingman. This is intended — popular singles rise and everyone participates.

## A. "Give [name] points" section

One block on the browse card, below the prompts, above the feed. Heading: **"Give Lucas
points"**. Every action shows its +points so cause/effect is explicit.

- **Quick reactions — 3 curated** (replaces the 8):
  - 🔥 a catch · 😍 cutie · 💯 the real deal
  - Each is +1 (unchanged `REACTION_POINTS`), one per guest per emoji per profile.
  - Each button shows: emoji, short label, and the running count; conveys "+1".
  - `REACTION_EMOJIS` in points.js becomes `['🔥','😍','💯']`.
- **Log a moment button**: `📸 Log a moment · +5 to +25`. Opens the existing event sheet for
  THIS profile. Available to everyone on the browse card (not just the wingman). Photo proof
  still required (it's the point, and blocks spam). Same catalog (romantic ladder / deeds /
  drink-o-meter) or write-your-own.

## B. "Caught in the act" feed

Rename "The night so far" → **"Caught in the act"** with a count (e.g. "Caught in the act · 12").
Same timeline rows (photo, label, +points). Empty state: "Nothing caught yet — log the first
moment 📸".

## Behaviour / data

- The events endpoint already accepts a log from anyone (only requires a photo) — no server
  auth change needed. The only change is exposing the **Log a moment** button on the browse
  card and wiring it to `openEvent(profileId, drinkLevel, name)`.
- After a successful log, refresh the view in place: if Browse is active, reload + re-render the
  current deck card (so the new moment and updated points show); if Me is active, `renderMe()`.
- `openEvent` gains a `name` arg to personalise the sheet title ("Log a moment for Lucas").
- Reaction counting, points math, and the leaderboard are unchanged. Old demo reactions using
  retired emoji still count toward points; they just no longer have a button (acceptable).

## Card order (browse)

```
[ photo carousel ]
Lucas
"pitch"  ·  🗣️ ask them about…
prompts (green flag / two-truths / secret …)
──────────────────────────────
GIVE LUCAS POINTS
[🔥 a catch +1] [😍 cutie +1] [💯 the real deal +1]
[ 📸  Log a moment · +5 to +25 ]
──────────────────────────────
CAUGHT IN THE ACT · 12
[📷] Danced together     +8
[📷] Caught the bouquet +10
```

## Revision (2026-06-18, post-build)

Layout reworked toward a dating-app pattern:

- The three reactions are now **mutually exclusive** — one vote per guest (picking a new one
  clears the old), via `pickReaction()`.
- **Match becomes the 4th option**, relabelled **"I'm interested" (+10)**, and keeps its full
  flow (celebration overlay, secret reveal, dare).
- The reactions + match move **out of the card body into an action bar below the card**
  (where the Match button used to be), flanked by the ‹ › nav arrows. Each button shows
  emoji, short label, its +points (+1 / +10), and the running count.
- The card-body section is now just: **"Give [name] points"** → the **Log a moment** box →
  a line "…or upvote them — tap a reaction below. Each adds +1." → the "Caught in the act" feed.

## Out of scope

- Recording WHO logged a moment (no logger attribution for now).
- Changing point values or the leaderboard formula.
- Reordering/limiting the catalog.
