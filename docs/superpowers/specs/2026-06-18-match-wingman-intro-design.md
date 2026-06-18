# Match button + wingman intro requests — design spec

Date: 2026-06-18
Status: approved

## Goal

Bring back a Match action as a proper dating-app "like", gated behind an **intro request**:
matching requires the matcher to leave their **name + 1 photo**, which is delivered to the
single's **wingman** (in the You section) so the wingman can make the introduction.

## Intro sheet fields

The "Ask for a wingman intro" sheet collects:

- **Name** (required) — the person to introduce. Usually you; can be a single friend you're
  putting forward.
- **Photo** (required) — one photo of that person.
- **Recommended by** (optional, secondary section) — your name, when you're matchmaking on a
  friend's behalf. Shown to the wingman so they know who vouched. Empty in the common
  "introduce me" case.

## A. Reaction bar

Replace the 💯 "the real deal" reaction with **❤️ Match (+10)**. The bar becomes:

```
[ 🔥 a catch +1 ]  [ 😍 cutie +1 ]  [ ❤️ Match +10 ]
```

- 🔥 and 😍 remain the two mutually-exclusive reactions (+1 each, one per device).
- Match is a separate action. `points.js` `REACTION_EMOJIS` drops to `['🔥','😍']`.
- The Match button shows the match count and a "matched" state once you've matched.

## B. Flow (points gated on the intro)

1. Tap **❤️ Match** → opens the **"Ask for a wingman intro"** sheet. No celebration yet.
2. Sheet fields (both required): **your name** + **1 photo**. Copy explains the photo + name
   go to {single}'s wingman so they can introduce you. Name pre-fills from the saved device
   name if present.
3. **Submit** → records the match + intro, awards **+10** to the profile (→ its wingman),
   THEN shows the existing celebration overlay (It's a match! + secret reveal + dare).
4. **Cancel/close** → nothing recorded, no points.
5. **No dedup.** Every submission is a distinct match worth a fresh +10. Anyone can match any
   single any number of times (e.g. matching yourself, or matching on behalf of a friend). The
   button always reads "Match"; the sheet always opens blank.

## C. Data model

Each match record holds the intro:

```
p.matches[] = { by: <unique id>, name: <string>, photoUrl: <string>,
                recommendedBy: <string|''>, at: <iso> }
```

- `by` is a server-generated unique id per match (no dedup) so every match counts.
- `MATCH_POINTS` stays 10; `computePoints` / `matchCount` count every match.
- Bringing Match back also restores the **secret-weapon reveal** (it unlocks on match) via the
  celebration response.

## D. Server

- `POST /api/profiles/:id/match` becomes **multipart** (`upload.single('photo')`):
  - Required: `name`, `photo` (file). Optional: `recommendedBy`. Reject with 400 if name or
    photo missing.
  - Always pushes a new match record (server-generated `by` id). No dedup, no `guestId`.
  - Response: `{ success, secret, hasSecret, wingman, singleName, points }`.
- **Privacy** — `publicProfile(p, revealFor, owner=false)`:
  - Always expose `matchCount` (a number).
  - When `owner` is true (the wingman's own view), include `matches` mapped to
    `{ name, photoUrl, at }` (the intro list).
  - When not owner (public browse), **omit the `matches` array entirely** so intro names/photos
    never appear in the swipe feed.
  - Browse `GET /api/profiles` → `owner=false`. `GET /api/profiles/by/:creator` → `owner=true`.
  - (No real auth in this party app; `by/:creator` is trust-based, same as today. The privacy
    requirement is that intros never surface in the public browse feed.)

## E. "You" section

In the You dashboard, under each of the wingman's singles, render an **INTRO REQUESTS** block:
a stacked list of `[photo] <Name> wants an intro` for each match on that profile, plus a
`Recommended by <X>` line when present. Tapping a photo opens the existing full-screen photo
viewer. Hidden when a single has no intros.

## F. Client

- New **intro sheet** overlay: name input + photo picker (reusing the `wirePhoto` pattern) + a
  secondary "Recommended by" input + "Send intro and match" / "Cancel".
- `openIntro(id, singleName)` opens it with all fields blank; `submitIntro()` validates name +
  photo, POSTs multipart (`name`, `photo`, optional `recommendedBy`) to `/match`, updates
  points, closes the sheet, shows the celebration, and refreshes the deck. It does not touch the
  device's saved wingman name or any "matched" local state.
- The old `doMatch()` (which prompted for a name inline) is replaced by this flow.

## Out of scope

- Notifying the wingman in real time (they see intros next time they open You).
- Matcher authentication / preventing someone querying another wingman's `by/:creator` view.
- Deleting/curating intro requests.
