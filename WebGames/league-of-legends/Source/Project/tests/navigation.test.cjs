'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Navigation, WALLS } = require('../dist/navigation.js');

const radius = 19;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function assertSafePath(nav, start, points, actorRadius = radius) {
  let previous = nav.nearestWalkable(start.x, start.y, actorRadius);
  for (const point of points) {
    assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
    assert.equal(nav.isWalkable(point.x, point.y, actorRadius), true, 'Every waypoint has actor clearance');
    assert.equal(nav.segmentClear(previous.x, previous.y, point.x, point.y, actorRadius), true,
      `The segment ${previous.x},${previous.y} -> ${point.x},${point.y} must not cross a wall`);
    previous = point;
  }
}

test('navigation routes around a circular wall with safe continuous segments', () => {
  const nav = new Navigation({ width: 400, height: 400, obstacles: [{ x: 200, y: 200, r: 60 }] });
  const start = { x: 60, y: 200 }, goal = { x: 340, y: 200 };
  assert.equal(nav.segmentClear(start.x, start.y, goal.x, goal.y, radius), false);
  const route = nav.findPath(start.x, start.y, goal.x, goal.y, radius);
  assert.ok(route.length >= 2, 'A blocked straight line requires an actual detour');
  assertSafePath(nav, start, route);
  assert.ok(distance(route.at(-1), goal) < 0.01);
  assert.ok(route.some(p => Math.abs(p.y - 200) > 79), 'The detour clears the expanded circular wall');
});

test('navigation projects blocked endpoints and reports disconnected regions without a false route', () => {
  const nav = new Navigation({ width: 400, height: 400, obstacles: [{ x: 200, y: 200, r: 60 }] });
  const start = { x: 60, y: 200 }, blocked = { x: 200, y: 200 };
  const route = nav.findPath(start.x, start.y, blocked.x, blocked.y, radius);
  assert.ok(route.length > 0);
  assertSafePath(nav, start, route);
  assert.equal(nav.isWalkable(route.at(-1).x, route.at(-1).y, radius), true);
  assert.ok(distance(route.at(-1), blocked) >= 79);
  const fromBlocked = nav.findPath(200, 200, 340, 200, radius);
  assert.ok(fromBlocked.length > 0);
  assertSafePath(nav, blocked, fromBlocked);
  const barrier = new Navigation({ width: 400, height: 400,
    obstacles: [0, 80, 160, 240, 320, 400].map(y => ({ x: 200, y, r: 45 })) });
  assert.equal(barrier.isWalkable(60, 200, radius), true);
  assert.equal(barrier.isWalkable(340, 200, radius), true);
  assert.deepEqual(barrier.findPath(60, 200, 340, 200, radius), []);
});

test('diagonal corner gaps cannot yield a path that intersects expanded walls', () => {
  const nav = new Navigation({ width: 240, height: 240,
    obstacles: [{ x: 120, y: 80, r: 35 }, { x: 80, y: 120, r: 35 }] });
  const start = { x: 40, y: 40 }, goal = { x: 180, y: 180 };
  assert.equal(nav.segmentClear(start.x, start.y, goal.x, goal.y, radius), false);
  const route = nav.findPath(start.x, start.y, goal.x, goal.y, radius);
  assert.ok(route.length > 1);
  assertSafePath(nav, start, route);
});

test('swept movement blocks a direct wall crossing and slides along its tangent', () => {
  const nav = new Navigation({ width: 400, height: 400, obstacles: [{ x: 200, y: 200, r: 60 }] });
  const headOn = nav.resolveMove(100, 200, 300, 200, radius);
  assert.ok(headOn.x <= 121.01 && Math.abs(headOn.y - 200) < 0.01);
  assert.equal(nav.isWalkable(headOn.x, headOn.y, radius), true);
  let position = { x: 100, y: 160 };
  let maxVerticalChange = 0;
  for (let i = 0; i < 120; i++) {
    position = nav.resolveMove(position.x, position.y, position.x + 3, position.y + 0.4, radius);
    assert.equal(nav.isWalkable(position.x, position.y, radius), true);
    maxVerticalChange = Math.max(maxVerticalChange, Math.abs(position.y - 160));
  }
  assert.ok(maxVerticalChange > 10, 'Contact produces a real tangent slide');
  assert.ok(position.x > 280, 'Continuous oblique input eventually clears the obstacle');
});

test('the shipped wall layout leaves all three lane centerlines and base approaches open', () => {
  assert.equal(WALLS.length, 12);
  const nav = new Navigation({ width: 1600, height: 1600, obstacles: WALLS });
  const lanes = {
    top: [[165, 1435], [165, 800], [165, 165], [800, 165], [1435, 165]],
    mid: [[165, 1435], [800, 800], [1435, 165]],
    bot: [[165, 1435], [800, 1435], [1435, 1435], [1435, 800], [1435, 165]],
  };
  for (const [lane, points] of Object.entries(lanes)) {
    for (let i = 1; i < points.length; i++) {
      const [ax, ay] = points[i - 1], [bx, by] = points[i];
      assert.equal(nav.segmentClear(ax, ay, bx, by, radius), true, `${lane} segment ${i} stays open`);
    }
  }
  for (const wall of WALLS) {
    const start = nav.nearestWalkable(wall.x - wall.r - 90, wall.y, radius);
    const end = nav.nearestWalkable(wall.x + wall.r + 90, wall.y, radius);
    const route = nav.findPath(start.x, start.y, end.x, end.y, radius);
    assert.ok(route.length > 0, `A route exists around wall ${wall.x},${wall.y}`);
    assertSafePath(nav, start, route);
    assert.ok(distance(route.at(-1), end) < 0.01);
  }
});

test('mutating a returned path cannot corrupt later cached path results', () => {
  const nav = new Navigation({ width: 400, height: 400, obstacles: [{ x: 200, y: 200, r: 60 }] });
  const path = nav.findPath(60, 200, 340, 200, radius);
  assert.ok(path.length > 0);
  path[0].x = -999;
  path.push({ x: NaN, y: Infinity });
  const again = nav.findPath(60, 200, 340, 200, radius);
  assertSafePath(nav, { x: 60, y: 200 }, again);
  assert.ok(distance(again.at(-1), { x: 340, y: 200 }) < 0.01);
});
