export default class TemporalLoop {
  constructor({ canvas, temporalObjects }) {
    this.canvas = canvas;
    this.ctx = this.canvas.getContext("2d"); // 2D rendering context
    this.temporalObjects = temporalObjects; // Plugin instances to update/render
    this.lastTick = performance.now(); // Timestamp of last frame
    this.frame = null; // RequestAnimationFrame ID
  }

  start() {
    this.frame = requestAnimationFrame(this.tick.bind(this));
  }

  stop() {
    if (this.frame) {
      cancelAnimationFrame(this.frame);
      this.frame = null;
    }
  }

  update(ctx) {
    for (let obj in this.temporalObjects) {
      this.temporalObjects[obj].update?.(ctx);
    }
  }

  render(ctx) {
    for (let obj in this.temporalObjects) {
      this.temporalObjects[obj].render?.(ctx);
    }
  }

  tick = (now) => {
    const fps = 60;
    const frameDuration = 1000 / fps; // ~16.67ms per frame

    if (now - this.lastTick >= frameDuration) {
      // Clear the entire canvas for the new frame
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      // Update game state
      this.update(this.ctx);
      // Render graphics
      this.render(this.ctx);
      // Update timestamp for next frame check
      this.lastTick = now;
    }
    // Schedule next frame
    this.frame = requestAnimationFrame(this.tick);
  };
}
