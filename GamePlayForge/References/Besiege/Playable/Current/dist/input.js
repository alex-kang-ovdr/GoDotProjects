/** One input contract for keyboard and touch, independent of DOM and renderer. */
export function getControlProfile(parts = [], mission = {}) {
  const wingCount = parts.filter(p => p.type === 'wing').length;
  const propellerCount = parts.filter(p => p.type === 'propeller').length;
  return { flight: wingCount > 0 || mission.environment === 'air', powered: propellerCount > 0,
    mechanism: parts.some(p => p.type === 'piston'),
    water: mission.environment === 'water', route: mission.objective === 'route' };
}

export function readControls(keys, touch, { flight = false, assist = true } = {}) {
  const has = (...codes) => codes.some(code => keys.has(code) || touch.has(code));
  const forward = has('KeyW', 'forward') || (!flight && has('ArrowUp'));
  const back = has('KeyS', 'back') || (!flight && has('ArrowDown'));
  const left = has('KeyA', 'left') || (!flight && has('ArrowLeft'));
  const right = has('KeyD', 'right') || (!flight && has('ArrowRight'));
  return {
    forward: Number(forward) - Number(back), turn: Number(left) - Number(right),
    turret: Number(has('KeyQ', 'turretLeft')) - Number(has('KeyE', 'turretRight')),
    aim: Number(has('KeyI', 'aimUp')) - Number(has('KeyK', 'aimDown')),
    actuate: Number(has('KeyZ', 'extend')) - Number(has('KeyX', 'retract')),
    pitch: flight ? Number(has('ArrowUp', 'pitchUp')) - Number(has('ArrowDown', 'pitchDown')) : 0,
    roll: flight ? Number(has('ArrowLeft', 'rollLeft')) - Number(has('ArrowRight', 'rollRight')) : 0,
    brake: has('KeyB', 'brake'), fire: has('KeyF', 'fire'), assist: Boolean(assist),
  };
}
