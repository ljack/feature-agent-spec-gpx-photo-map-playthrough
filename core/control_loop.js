class RequestAnimationFrameLoop {
  constructor() {
    this.lastTime = 0;
    this.animationFrameId = null;
    this.boundAnimate = this.animate.bind(this);
  }

  start() {
    if (!window.AppState.isPlaying) {
      window.AppState.setPlaying(true);
      this.lastTime = 0;
      this.animationFrameId = requestAnimationFrame(this.boundAnimate);
      
      const context = this.getContext(0);
      window.AppRegistry.triggerPlayStateChange(context, true);
    }
  }

  stop() {
    if (window.AppState.isPlaying) {
      window.AppState.setPlaying(false);
      if (this.animationFrameId) {
        cancelAnimationFrame(this.animationFrameId);
        this.animationFrameId = null;
      }
      this.lastTime = 0;
      
      const context = this.getContext(0);
      window.AppRegistry.triggerPlayStateChange(context, false);
    }
  }

  getContext(dt) {
    return {
      state: window.AppState,
      mapEngine: window.MapEngine,
      dt: dt
    };
  }

  animate(timestamp) {
    if (!window.AppState.isPlaying) {
      this.lastTime = 0;
      return;
    }

    if (this.lastTime === 0) {
      this.lastTime = timestamp;
      this.animationFrameId = requestAnimationFrame(this.boundAnimate);
      return;
    }

    const dt = (timestamp - this.lastTime) / 1000; // delta time in seconds
    this.lastTime = timestamp;

    const state = window.AppState;
    const context = this.getContext(dt);

    if (state.isPausedForPhoto) {
      // Slideshow auto-pause handles ticking countdown
      window.AppRegistry.triggerTick(context);
    } else {
      // Progress simulation based on speed and base average bike speed
      const baseSpeedKmh = window.AppConfig.baseBikeSpeedKmh || 14.5;
      const speedKms = (baseSpeedKmh * state.speedMultiplier) / 3600;
      
      let nextKm = state.currentProgressKm + speedKms * dt;
      if (nextKm >= state.totalDist) {
        nextKm = state.totalDist;
        this.stop();
      }

      state.setProgress(nextKm);
      window.AppRegistry.triggerTick(context);
    }

    if (state.isPlaying) {
      this.animationFrameId = requestAnimationFrame(this.boundAnimate);
    }
  }
}

window.ControlLoop = new RequestAnimationFrameLoop();
