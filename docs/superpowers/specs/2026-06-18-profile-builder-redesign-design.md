# Profile builder redesign — design spec

Date: 2026-06-18
Status: implemented

## Problem

The current 3-step profile builder feels like paperwork. It collects ~10 fields, much
of it generic filler ("will they cry at the ceremony", a dance-floor star rating, an
"embarrassing habit"), and preset "vibe" interest pills that read as AI slop. None of it
helps the actual goal of the app.

## Goal & reframe

This is a **wingman** app: you build a profile for a *single friend* so other guests can
meet them. The profile's job is not just to hype the single — it should **hand a stranger
a way to start a conversation** with them. Every field should either show the person off
(photos) or plant an opener.

Direction chosen during brainstorming: **photo-first, with a light roast/icebreaker edge.**

## A. Photos — the hero

- The builder opens with photos pinned at the top: one large **cover tile (required)** plus
  two smaller **+ tiles**. Up to **3 photos**.
- Tap an empty tile → native picker (camera *or* library; no forced `capture`). Tap a
  filled tile → replace/remove. First filled photo is the cover. Support reordering
  (drag, or simple "make cover" action — see implementation notes).
- On the swipe card, the photo area becomes a **swipeable carousel** with dots. With a
  single photo it looks like today. Wingman / points / count badges stay overlaid.

## B. Fields

### Core — always shown (all required)

1. 📸 Photos — at least the cover.
2. **First name** — no age (age removed entirely).
3. ✍️ **One-liner pitch** — "Sell them in one line."
4. 🗣️ **Ask them about…** — the subtle opener. Hands a stranger a concrete topic. Never
   labelled "icebreaker".

### Optional prompts — Hinge-style picker

- **No prompts by default.** The wingman must add **at least 1** (validation) and may add
  up to **4**.
- A **"+ Add a prompt"** button opens a bottom sheet listing the prompts not yet added.
  Tap one → it appends a prompt card with the right input(s) and a remove (×) control.
  Once 4 are added, the button is disabled/hidden.
- Prompts are reframed to third person (wingman writing about their friend), lifted from
  Hinge's real prompt library. The list:

  | Key            | Question (3rd person)                  | Type   |
  |----------------|----------------------------------------|--------|
  | two-truths     | Two truths and a lie                   | triple |
  | green-flag     | 🟢 Biggest green flag                  | text   |
  | one-catch      | ⚠️ Their one catch                     | text   |
  | win-them-over  | The way to win them over is…           | text   |
  | wont-shut-up   | They won't shut up about…              | text   |
  | go-crazy-for   | They go crazy for…                     | text   |
  | get-along-if   | You'll get along if…                   | text   |
  | irrational-fear| Their most irrational fear…            | text   |
  | simple-pleasure| Their simple pleasures…                | text   |
  | toxic-trait    | Their toxic trait (affectionately)…    | text   |
  | dont-hate-if   | Don't hate them if they…               | text   |
  | hot-take       | Their most controversial opinion…      | text   |
  | hidden-talent  | Their hidden talent…                   | text   |
  | secret-weapon  | 🤫 Secret weapon                       | secret |

- **Prompt types:**
  - `text` — single short text input.
  - `triple` (two-truths-and-a-lie) — three inputs labelled 1/2/3. We do **not** store
    which is the lie; the card invites the reader to go find out. Pure icebreaker.
  - `secret` (secret weapon) — single text, but flagged as the secret: it stays **locked
    on the card until someone matches**, reusing the existing reveal-on-match mechanic.

## C. Structure

Collapse the 3-step wizard into **one scrollable screen**:

```
[ ← cancel ]
Photos:   [ COVER* ] [ + ] [ + ]
First name      [_______]
One-liner       [_______]
Ask them about… [_______]

Their prompts (add 1–4)
  ( prompt cards appear here as added )
  [ + Add a prompt ]

[ Post profile ]
```

No multi-step progress bar (that bar belongs to Browse only, already built).

## D. Card rendering

- Photo carousel (dots; swipe).
- Render core: name, pitch, "ask them about" line.
- Render the chosen prompts as clean labelled lines:
  - green-flag / one-catch keep their green/red colour treatment.
  - two-truths renders as a numbered 1/2/3 list with a caption ("one of these is a lie —
    go find out which").
  - secret-weapon shows the existing 🔒 locked state until match, then 🔓 reveals.
  - all other prompts: a mono label (the question) + the answer line.
- Removed from the card: age, "cry at ceremony", dance-floor stars, vibe tags.

## Data model

Profile (additions / changes):

```
{
  singleName: string,         // first name (unchanged key)
  photoUrls: string[],        // NEW — up to 3, ordered, [0] is cover
  photoUrl: string|null,      // KEPT as alias = photoUrls[0] (leaderboard / back-compat)
  pitch: string,              // kept
  askAbout: string,           // NEW — "ask them about…"
  prompts: [                  // NEW — 1..4 entries
    { key, question, type, answer?, answers? }   // answers: string[3] for type 'triple'
  ],
  secret: string|null,        // KEPT — populated from the secret-weapon prompt if chosen
  hasSecret: bool,            // KEPT — true when a secret-weapon prompt exists
  // REMOVED on new writes: age, vibes, habit, cry, dance, greenFlag, redFlag
}
```

- `secret` / `hasSecret` stay first-class so the server's existing reveal-stripping logic
  (hide secret unless `revealFor` has matched) keeps working unchanged. The secret-weapon
  prompt's answer is mirrored into `secret`.
- green-flag / one-catch live as prompts now, not dedicated columns.

## Back-compat

The two existing demo profiles use the old shape (photoUrl, vibes, age, greenFlag, etc.).
The card renderer must be tolerant:
- photos: read `photoUrls` if present, else `[photoUrl]`.
- prompts: render `prompts[]` if present; otherwise fall back to showing legacy
  greenFlag/redFlag/secret so old profiles still display.
Editing an old profile migrates it forward to the new shape on save. No data migration
script required (party app, disposable data).

## Server changes

- `POST /api/profiles` and `PUT /api/profiles/:id`: switch from `upload.single('photo')`
  to `upload.array('photos', 3)`.
- New multipart contract:
  - `photos`: 0–3 image files (the newly-uploaded ones).
  - `photoOrder`: JSON array describing the final ordered photo list, each entry either an
    existing URL (edit case) or a `"new:<index>"` placeholder mapped to the Nth uploaded
    file. Server reconstructs `photoUrls` from this. (On create it's just the uploaded
    files in order.)
  - `askAbout`: string.
  - `prompts`: JSON array of `{ key, type, answer | answers }`. Server validates 1–4
    entries, attaches the canonical `question` text per key, enforces known keys, and
    mirrors a `secret`-type prompt into `secret`/`hasSecret`.
- Validation (server + client): cover photo present, first name present, pitch present,
  askAbout present, 1–4 prompts. Reject otherwise with a clear message.

## Validation rules (client)

- Cover photo required → "Add at least one photo."
- First name required.
- Pitch required → "Give them a one-line pitch."
- Ask-them-about required → "Give people something to ask them about."
- ≥1 prompt → "Add at least one prompt."
- Max 4 prompts (enforced by disabling the add button).

## Out of scope

- Editing/cropping photos in-app.
- Reordering prompts after adding (add/remove only for v1).
- The Browse card's reactions and moments timeline (unchanged).

## Implementation notes / risks

- The trickiest piece is **edit-mode photo handling** (mixing kept existing URLs with new
  uploads via `photoOrder`). Build and test create-mode first, then edit.
- Carousel should be lightweight (CSS scroll-snap + dots), not a heavy library.
- Keep the two-truths card caption from implying we know the lie — we don't store it.
