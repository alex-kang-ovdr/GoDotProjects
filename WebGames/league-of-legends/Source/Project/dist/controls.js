/* Nexus Front — pointer-owned skill aiming, independent of the simulation. */
(function (root) {
  'use strict';

  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  const point = value => !!value && finite(value.x) && finite(value.y);
  const pointer = value => Number.isInteger(value) && value >= 0;
  const SLOTS = new Set(['q', 'w', 'e', 'r', 'd', 'f', 'ward']);

  class AimGesture {
    constructor(options = {}) {
      this.threshold = finite(options.threshold) && options.threshold > 0 ? options.threshold : 12;
      this.maxDistance = finite(options.maxDistance) && options.maxDistance > this.threshold ? options.maxDistance : Math.max(72, this.threshold + 1);
      const bounds = options.bounds || {};
      this.bounds = {
        minX: finite(bounds.minX) ? bounds.minX : 28,
        minY: finite(bounds.minY) ? bounds.minY : 28,
        maxX: finite(bounds.maxX) ? bounds.maxX : 1572,
        maxY: finite(bounds.maxY) ? bounds.maxY : 1572
      };
      if (this.bounds.maxX < this.bounds.minX) this.bounds.maxX = this.bounds.minX;
      if (this.bounds.maxY < this.bounds.minY) this.bounds.maxY = this.bounds.minY;
      this._gesture = null;
    }

    get active() { return this._gesture !== null; }

    begin(event) {
      if (this.active || !point(event) || !pointer(event.pointerId) || !SLOTS.has(event.slot)) return false;
      this._gesture = {
        pointerId: event.pointerId,
        slot: event.slot,
        origin: { x: event.x, y: event.y },
        pointer: { x: event.x, y: event.y },
        direction: null,
        distance: 0,
        dragging: false,
        canceled: false
      };
      return true;
    }

    move(event) {
      const state = this._gesture;
      if (!state || !event || event.pointerId !== state.pointerId || !point(event)) return false;
      const dx = event.x - state.origin.x, dy = event.y - state.origin.y;
      const distance = Math.hypot(dx, dy);
      // Extreme, nonrepresentable differences must never enter world-space math.
      if (!finite(distance)) return false;
      state.pointer = { x: event.x, y: event.y };
      state.distance = distance;
      if (distance >= this.threshold) state.dragging = true;
      if (distance > 0.001) state.direction = { x: dx / distance, y: dy / distance };
      if (typeof event.cancel === 'boolean') state.canceled = event.cancel;
      return true;
    }

    snapshot(player, meta) {
      const state = this._gesture;
      if (!state) return { active: false, slot: null, pointerId: null, dragging: false, canceled: false, origin: null, pointer: null, direction: null, distance: 0, fraction: 0, aim: null };
      const facing = finite(player && player.facing) ? player.facing : -Math.PI / 4;
      const direction = state.direction || { x: Math.cos(facing), y: Math.sin(facing) };
      const fraction = clamp(state.distance / this.maxDistance, 0, 1);
      let aim = null;
      if (state.dragging && point(player) && meta && finite(meta.range) && meta.range >= 0) {
        const type = meta.target || 'ground';
        if (type === 'direction') {
          // A direction point is not a destination. It may extend beyond the
          // map so an outward shot at the very edge retains the drag angle.
          const x = player.x + direction.x * meta.range;
          const y = player.y + direction.y * meta.range;
          if (finite(x) && finite(y)) aim = { x, y };
        } else {
          let reach = type === 'self' ? 0 : meta.range * fraction;
          const originX = clamp(player.x, this.bounds.minX, this.bounds.maxX);
          const originY = clamp(player.y, this.bounds.minY, this.bounds.maxY);
          // Ground/dash destinations stop where the ray meets the map edge.
          if (direction.x > 0) reach = Math.min(reach, (this.bounds.maxX - originX) / direction.x);
          else if (direction.x < 0) reach = Math.min(reach, (this.bounds.minX - originX) / direction.x);
          if (direction.y > 0) reach = Math.min(reach, (this.bounds.maxY - originY) / direction.y);
          else if (direction.y < 0) reach = Math.min(reach, (this.bounds.minY - originY) / direction.y);
          const x = originX + direction.x * reach;
          const y = originY + direction.y * reach;
          if (finite(x) && finite(y)) aim = { x: clamp(x, this.bounds.minX, this.bounds.maxX), y: clamp(y, this.bounds.minY, this.bounds.maxY) };
        }
      }
      return {
        active: true,
        slot: state.slot,
        pointerId: state.pointerId,
        dragging: state.dragging,
        canceled: state.canceled,
        origin: { ...state.origin },
        pointer: { ...state.pointer },
        direction: { ...direction },
        distance: state.distance,
        fraction,
        aim
      };
    }

    finish(event, player, meta) {
      const state = this._gesture;
      if (!state || !event || event.pointerId !== state.pointerId) return { kind: 'ignore', slot: null };
      // A release can arrive without its last pointermove (e.g. a fast swipe).
      // It must use the release position, never an older cached endpoint.
      const moved = this.move(event);
      const snapshot = this.snapshot(player, meta);
      this.cancel();
      if (!moved || snapshot.canceled) return { kind: 'cancel', slot: snapshot.slot };
      if (!snapshot.dragging) return { kind: 'tap', slot: snapshot.slot };
      if (!snapshot.aim) return { kind: 'cancel', slot: snapshot.slot };
      return { kind: 'cast', slot: snapshot.slot, aim: snapshot.aim };
    }

    cancel() { this._gesture = null; }
  }

  root.NexusControls = { AimGesture };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.NexusControls;
})(typeof globalThis !== 'undefined' ? globalThis : this);
