const { test } = require('node:test');
const assert = require('node:assert');
const P = require('./points');

test('uniqueReactionCount dedupes per guest+emoji', () => {
  const reactions = [
    { guestId: 'a', emoji: '😂' },
    { guestId: 'a', emoji: '😂' }, // dup, ignored
    { guestId: 'a', emoji: '🔥' }, // different emoji, counts
    { guestId: 'b', emoji: '😂' }, // different guest, counts
  ];
  assert.strictEqual(P.uniqueReactionCount(reactions), 3);
});

test('reactionTally counts unique reactions by emoji', () => {
  const reactions = [
    { guestId: 'a', emoji: '😂' },
    { guestId: 'b', emoji: '😂' },
    { guestId: 'a', emoji: '😂' }, // dup
    { guestId: 'a', emoji: '🍑' },
  ];
  assert.deepStrictEqual(P.reactionTally(reactions), { '😂': 2, '🍑': 1 });
});

test('uniqueMatchCount dedupes per matcher', () => {
  const matches = [
    { by: 'single:lucas' },
    { by: 'single:lucas' }, // dup
    { by: 'single:mia' },
  ];
  assert.strictEqual(P.uniqueMatchCount(matches), 2);
});

test('computePoints sums reactions, matches, and events', () => {
  const profile = {
    reactions: [
      { guestId: 'a', emoji: '😂' },
      { guestId: 'b', emoji: '🔥' },
    ], // +2
    matches: [{ by: 'single:mia' }], // +10
    events: [
      { points: 18 },
      { points: 5 },
    ], // +23
  };
  assert.strictEqual(P.computePoints(profile), 35);
});

test('computePoints handles empty/missing fields', () => {
  assert.strictEqual(P.computePoints({}), 0);
  assert.strictEqual(P.computePoints(null), 0);
});

test('resolveEvent: ladder event scored from catalog, ignores client points', () => {
  const ev = P.resolveEvent({ type: 'ladder', key: 'kiss', points: 9999 });
  assert.strictEqual(ev.points, 18);
  assert.strictEqual(ev.label, 'The real deal');
  assert.strictEqual(ev.emoji, '💋');
});

test('resolveEvent: deed event scored from catalog', () => {
  const ev = P.resolveEvent({ type: 'deed', key: 'bouquet' });
  assert.strictEqual(ev.points, 10);
});

test('resolveEvent: unknown key returns null', () => {
  assert.strictEqual(P.resolveEvent({ type: 'ladder', key: 'nope' }), null);
});

test('resolveEvent: custom event is fixed points, trimmed, capped', () => {
  const ev = P.resolveEvent({ type: 'custom', label: '  did a backflip  ' });
  assert.strictEqual(ev.points, P.CUSTOM_EVENT_POINTS);
  assert.strictEqual(ev.label, 'did a backflip');
  assert.strictEqual(P.resolveEvent({ type: 'custom', label: '   ' }), null);
});

test('resolveEvent: drink advance uses step points + correct status', () => {
  const ev = P.resolveEvent({ type: 'drink', nextDrinkLevel: 2 });
  assert.strictEqual(ev.points, P.DRINK_STEP_POINTS);
  assert.strictEqual(ev.label, P.DRINK_LEVELS[2].label);
  // level 0 is not an event
  assert.strictEqual(P.resolveEvent({ type: 'drink', nextDrinkLevel: 0 }), null);
});

test('drinkStatus clamps out-of-range levels', () => {
  assert.strictEqual(P.drinkStatus(99).level, P.MAX_DRINK_LEVEL);
  assert.strictEqual(P.drinkStatus(-5).level, 0);
});

test('leaderboard aggregates per creator and sorts by points desc', () => {
  const profiles = [
    { createdBy: 'Sophie', singleName: 'Lucas', matches: [{ by: 'x' }] }, // 10
    { createdBy: 'Sophie', singleName: 'Ben', events: [{ points: 5 }] }, // 5  → Sophie 15
    { createdBy: 'Marc', singleName: 'Camille', events: [{ points: 25 }] }, // 25
  ];
  const lb = P.leaderboard(profiles);
  assert.strictEqual(lb.length, 2);
  assert.strictEqual(lb[0].wingman, 'Marc');
  assert.strictEqual(lb[0].points, 25);
  assert.strictEqual(lb[1].wingman, 'Sophie');
  assert.strictEqual(lb[1].points, 15);
  assert.deepStrictEqual(lb[1].singles.sort(), ['Ben', 'Lucas']);
});

test('leaderboard falls back to singleName when no createdBy', () => {
  const lb = P.leaderboard([{ singleName: 'Solo', events: [{ points: 3 }] }]);
  assert.strictEqual(lb[0].wingman, 'Solo');
  assert.strictEqual(lb[0].points, 3);
});
