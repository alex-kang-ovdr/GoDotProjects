import { ArenaRenderer } from './renderer.js';
import { ArenaRenderer3D } from './renderer3d.js';

// A presentation switch over one game and one input surface. Neither renderer
// owns simulation time or recreates the current battle.
export class ArenaView {
  constructor(canvas, glCanvas, { onFallback = () => {} } = {}) {
    this.canvas = canvas;
    this.glCanvas = glCanvas;
    this.onFallback = onFallback;
    // The first 2D context request determines alpha for the canvas lifetime.
    // The 3D view needs this canvas to be a transparent HUD over WebGL.
    canvas.getContext('2d', { alpha: true });
    this.twoD = new ArenaRenderer(canvas);
    this.threeD = null;
    this.mode = '2d';
    this.orientation = 'landscape';
    this.glCanvas.hidden = true;
    this.twoD.setOrientation(this.orientation);
  }

  get active() { return this.mode === '3d' ? this.threeD : this.twoD; }

  setMode(mode) {
    const next = mode === '3d' ? '3d' : '2d';
    if (next === this.mode) return this.mode;
    if (next === '3d') {
      try {
        this.glCanvas.hidden = false;
        this.threeD ||= new ArenaRenderer3D(this.canvas, this.glCanvas, {
          onContextLost: () => this.fallback('3D 그래픽 연결이 해제되어 2D로 전환했습니다.'),
        });
        this.threeD.setOrientation(this.orientation);
        this.mode = '3d';
        this.threeD.resize();
      } catch {
        this.fallback('이 환경에서 3D를 사용할 수 없어 2D로 실행합니다.');
      }
    } else {
      this.mode = '2d';
      this.glCanvas.hidden = true;
      this.twoD.setOrientation(this.orientation);
      this.twoD.resize();
    }
    return this.mode;
  }

  fallback(message) {
    this.mode = '2d';
    this.glCanvas.hidden = true;
    this.threeD?.destroy();
    this.threeD = null;
    this.twoD.setOrientation(this.orientation);
    this.twoD.resize();
    this.onFallback(message);
  }

  setOrientation(orientation) {
    this.orientation = orientation === 'landscape' ? 'landscape' : 'portrait';
    this.twoD.setOrientation(this.orientation);
    this.threeD?.setOrientation(this.orientation);
  }

  worldToScreen(x, y) { return this.active.worldToScreen(x, y); }
  screenToWorld(x, y) { return this.active.screenToWorld(x, y); }
  pickEntity(x, y, entities) { return this.mode === '3d' ? this.threeD.pickEntity(x, y, entities) : null; }

  draw(game, options) {
    if (this.mode !== '3d') { this.twoD.draw(game, options); return; }
    try { this.threeD.draw(game, options); }
    catch {
      this.fallback('3D 화면을 복구하는 동안 2D로 전투를 계속합니다.');
      this.twoD.draw(game, options);
    }
  }
}
