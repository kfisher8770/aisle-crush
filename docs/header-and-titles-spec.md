# Header, navigation & titles — design spec

Status: implemented 2026-06-17. Owner: design.

## Brand direction

This is a **wingman / matchmaking** party app. You build profiles for your single
friends and matchmake them at the wedding.

- The HIMYM reference is used **once**, in the app title "Haaave you met…?", and
  nowhere else. Do not add umbrellas, MacLaren's, "legen-dary", Barney lines, etc.
  to new UI. The barney.png splash meme is the one allowed exception.
- Everything else should read like a modern wingman/matching app: warm, playful,
  confident, scannable.

## Three-layer header model

Previously brand + page-title were collapsed into one `.app-head` whose name changed
per screen ("Haaave you met…?" / "Best Wingman" / "Wingman HQ"), and there was no logo
mark. Fixed by splitting into three distinct layers:

1. **Brand bar** (`.brandbar`) — persistent, slim (~52px), sticky at top, identical on
   every primary screen. Logo mark + "Haaave you met…?" wordmark. Tappable: tapping it
   reopens the splash. This is the single, constant app identity.
2. **Screen title** (`.section-title`) — one H1 per screen, plain and scannable, tells
   you which tab you're on (Browse / Leaderboard / You).
3. **Subtitle** (`.section-sub`) — at most one line, plain sentence case, active voice,
   says what you *do* here.

## Logo mark

Chosen: **winged heart** — a heart flanked by two small wings. Literal "wing-man" +
matchmaking, ownable, and not a generic single-heart dating cliché. Inline SVG, pink
two-tone, scales to ~30px.

Alternates considered (note for future iterations, do NOT use HIMYM marks):
- Linked rings / two overlapping circles — "a connection / a match".
- Four-point spark / sparkle — "made a match".
- Paper plane — "sending them out there".
- Aviator wings only (no heart) — pure wingman, less matchmaking signal.

## Title & subtitle copy

Reserve the mono-uppercase `·`-separated style for true eyebrows/labels only — never
for subtitles (it reads like metadata, not a sentence).

| Screen        | Title (H1)   | Subtitle (one plain line)              |
|---------------|--------------|----------------------------------------|
| Browse        | Browse       | Swipe to meet the singles.             |
| Leaderboard   | Leaderboard  | Who's carrying their single?           |
| Me            | You          | Manage your singles and log the night. |
| Form step 1   | The basics   | Tell us about your single.             |
| Form step 2   | The hype     | Sell them hard — this is what people read first. |
| Form step 3   | The flags    | Be honest. People love transparency.   |

## Title system consolidation

One in-content title pair is used everywhere: `.section-title` + `.section-sub`
(mastheads, form steps, empty states, the "Me" header). The old `.logo-name` /
`.logo-date` masthead classes are removed. The brand bar is the only separate header
component.

## Behaviour

- Brand bar is hidden on the multi-step profile form (which has its own `.topbar` +
  back button), mirroring how the bottom tab bar is hidden there.
- `showSplash()` re-adds `.show` to the splash overlay; `dismissSplash()` hides it and
  remembers the dismissal in localStorage so it does not auto-show on reload.
