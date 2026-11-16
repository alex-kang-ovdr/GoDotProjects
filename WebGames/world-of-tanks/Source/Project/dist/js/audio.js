/**
 * Small, dependency-free Web Audio soundscape.
 * The context is deliberately created only by unlock(), called from a user gesture.
 */
export class BattleAudio {
  constructor() {
    this.muted = false;
    this.context = null;
    this.master = null;
    this.engine = null;
    this.listener = { x: 0, y: 0 };
    this.lastSound = new Map();
    this.disposed = false;
  }

  async unlock() {
    if (this.disposed) return false;
    try {
      const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!Context) return false;
      if (!this.context) {
        const ctx = this.context = new Context();
        const compressor = ctx.createDynamicsCompressor();
        compressor.threshold.value = -18;
        compressor.knee.value = 16;
        compressor.ratio.value = 5;
        compressor.attack.value = 0.004;
        compressor.release.value = 0.22;
        this.master = ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 0.5;
        this.master.connect(compressor);
        compressor.connect(ctx.destination);
        this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
        const data = this.noise.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        this.makeEngine();
      }
      if (this.context.state === 'suspended') await this.context.resume();
      return this.context.state === 'running';
    } catch (_) {
      return false;
    }
  }

  setMuted(value) {
    this.muted = Boolean(value);
    if (this.master && this.context?.state !== 'closed') {
      this.master.gain.setTargetAtTime(this.muted ? 0 : 0.5, this.context.currentTime, 0.035);
    }
    return this.muted;
  }

  makeEngine() {
    const ctx = this.context;
    const oscillator = ctx.createOscillator();
    const undertone = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    oscillator.type = 'sawtooth';
    oscillator.frequency.value = 38;
    undertone.type = 'triangle';
    undertone.frequency.value = 19;
    filter.type = 'lowpass';
    filter.frequency.value = 145;
    filter.Q.value = 0.55;
    gain.gain.value = 0;
    oscillator.connect(filter);
    undertone.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    oscillator.start();
    undertone.start();
    this.engine = { oscillator, undertone, filter, gain };
  }

  update(state) {
    if (!this.context || !this.engine || this.context.state !== 'running') return;
    const tank = state?.tanks?.find(t => t.id === state.playerId);
    const moving = state?.phase === 'playing' && !state.paused && tank?.alive;
    if (tank) this.listener = { x: tank.x, y: tank.y };
    const speed = moving ? Math.min(1, Math.abs(tank.speed || 0) / 125) : 0;
    const now = this.context.currentTime;
    this.engine.gain.gain.setTargetAtTime(moving ? 0.035 + speed * 0.045 : 0, now, 0.12);
    this.engine.oscillator.frequency.setTargetAtTime(34 + speed * 38, now, 0.15);
    this.engine.undertone.frequency.setTargetAtTime(17 + speed * 19, now, 0.15);
    this.engine.filter.frequency.setTargetAtTime(120 + speed * 180, now, 0.15);
  }

  play(eventOrType) {
    if (!this.context || this.muted || this.context.state !== 'running' || this.disposed) return;
    const event = typeof eventOrType === 'string' ? { type: eventOrType } : eventOrType;
    if (!event) return;
    const type = event.type;
    const now = this.context.currentTime;
    const minimumGap = type === 'fire' ? 0.055 : 0.035;
    if (now - (this.lastSound.get(type) ?? -100) < minimumGap) return;
    this.lastSound.set(type, now);
    let level = 1;
    let pan = 0;
    if (Number.isFinite(event.x) && Number.isFinite(event.y)) {
      const dx = event.x - this.listener.x;
      const dy = event.y - this.listener.y;
      const distance = Math.hypot(dx, dy);
      level = Math.max(0.08, 1 / (1 + distance / 460));
      pan = Math.max(-0.75, Math.min(0.75, dx / 650));
    }
    switch (type) {
      case 'fire':
        this.tone('sine', 95, 31, 0.26, 0.72 * level, pan);
        this.burst(0.19, 1200, 0.38 * level, pan, 'lowpass');
        break;
      case 'hit':
        this.tone('triangle', 180, 55, 0.21, 0.37 * level, pan);
        this.burst(0.14, 2200, 0.22 * level, pan, 'bandpass');
        break;
      case 'bounce':
      case 'ricochet':
        this.tone('sine', 2100, 720, 0.18, 0.14 * level, pan);
        this.burst(0.1, 3800, 0.13 * level, pan, 'highpass');
        break;
      case 'destroyed':
      case 'explosion':
        this.tone('sine', 68, 22, 0.6, 0.6 * level, pan);
        this.burst(0.65, 850, 0.48 * level, pan, 'lowpass');
        break;
      case 'spotted':
        this.tone('sine', 720, 620, 0.11, 0.14, 0);
        this.tone('sine', 720, 620, 0.11, 0.14, 0, 0.17);
        break;
      case 'repair':
        this.tone('sine', 440, 440, 0.12, 0.11, 0);
        this.tone('sine', 660, 660, 0.19, 0.12, 0, 0.12);
        break;
      case 'smoke':
        this.tone('sine', 105, 42, 0.16, 0.21 * level, pan);
        this.burst(0.72, 1800, 0.2 * level, pan, 'bandpass');
        break;
      case 'order':
        this.tone('sine', 610, 610, 0.075, 0.09, 0);
        this.tone('sine', 870, 870, 0.1, 0.09, 0, 0.1);
        break;
      case 'capture':
        this.tone('sine', 500, 600, 0.17, 0.09, 0);
        break;
      case 'end':
      case 'victory':
        [330, 440, 660].forEach((f, i) => this.tone('triangle', f, f, 0.42, 0.1, 0, i * 0.14));
        break;
      case 'defeat':
        [330, 261, 196].forEach((f, i) => this.tone('triangle', f, f, 0.4, 0.1, 0, i * 0.17));
        break;
      case 'click':
      case 'select':
        this.tone('sine', 850, 580, 0.055, 0.075, 0);
        break;
      default:
        break;
    }
  }

  output(gain, pan) {
    if (this.context.createStereoPanner) {
      const panner = this.context.createStereoPanner();
      panner.pan.value = pan;
      gain.connect(panner);
      panner.connect(this.master);
      return panner;
    }
    gain.connect(this.master);
    return null;
  }

  tone(type, startHz, endHz, duration, volume, pan = 0, delay = 0) {
    const ctx = this.context;
    const now = ctx.currentTime + delay;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(startHz, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(8, endHz), now + duration);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain);
    const panner = this.output(gain, pan);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); panner?.disconnect(); };
    oscillator.start(now);
    oscillator.stop(now + duration + 0.03);
  }

  burst(duration, cutoff, volume, pan = 0, filterType = 'lowpass') {
    const ctx = this.context;
    const now = ctx.currentTime;
    const source = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    source.buffer = this.noise;
    filter.type = filterType;
    filter.frequency.setValueAtTime(cutoff, now);
    filter.frequency.exponentialRampToValueAtTime(Math.max(70, cutoff * 0.22), now + duration);
    filter.Q.value = 0.65;
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.connect(filter);
    filter.connect(gain);
    const panner = this.output(gain, pan);
    source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); panner?.disconnect(); };
    source.start(now, Math.random() * 0.8);
    source.stop(now + duration + 0.025);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    if (this.engine) {
      this.engine.oscillator.stop();
      this.engine.undertone.stop();
    }
    this.context?.close().catch(() => {});
    this.context = null;
    this.engine = null;
    this.master = null;
  }
}
