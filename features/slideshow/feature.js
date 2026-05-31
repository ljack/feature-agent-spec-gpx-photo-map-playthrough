class SlideshowFeature {
  constructor() {
    this.countdownRemaining = 0;
    this.slideshowInterval = null;
  }

  onInit(context) {
    this.renderUI();
    this.bindEvents(context.state);
  }

  onTick(context) {
    const state = context.state;
    
    if (state.isPausedForPhoto) {
      // Tick countdown during auto-pause
      this.countdownRemaining -= context.dt;
      if (this.countdownRemaining <= 0) {
        state.setPausedForPhoto(false);
        this.hideOverlay(state);
      }
    } else {
      // Check for photo stops to trigger pauses and mark visited
      if (!state.isPlaying) return;

      for (let s of state.photoClusters) {
        const distDiff = state.currentProgressKm - s.properties.km;
        if (
          distDiff >= 0 && 
          distDiff < 0.12 && 
          state.lastVisitedStopId !== s.properties.id
        ) {
          // Always mark stop as visited when passing
          state.lastVisitedStopId = s.properties.id;
          state.markStopVisited(s.properties.id);

          if (state.autoPauseEnabled) {
            this.triggerPhotoPause(state, s);
          }
          break;
        }
      }
    }
  }

  onSeek(context, km) {
    // If the seek matches a photo stop distance closely, display it
    const stop = context.state.photoClusters.find(
      c => Math.abs(c.properties.km - km) < 0.05
    );
    if (stop) {
      this.triggerPhotoPause(context.state, stop);
    } else {
      this.hideOverlay(context.state);
    }
  }

  onReset(context) {
    this.hideOverlay(context.state);
  }

  renderUI() {
    const container = document.getElementById('slideshowContainer');
    if (!container) return;

    container.innerHTML = `
      <div class="glass-panel photo-overlay-panel" id="photoPanel">
        <button class="close-btn" id="closePhotoBtn">✕</button>
        <div class="photo-info">
          <h2 class="photo-title" id="photoTitle">Photo Stop</h2>
          <div class="photo-meta">
            <span id="photoDistance">Km --</span>
            <span id="photoTime">--</span>
          </div>
        </div>
        <div class="slideshow-viewport" id="slideshowViewport">
          <!-- Images dynamically injected -->
        </div>
        <div class="countdown-container">
          <div class="countdown-bar" id="countdownBar"></div>
        </div>
      </div>
    `;
  }

  bindEvents(state) {
    const closeBtn = document.getElementById('closePhotoBtn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        state.setPausedForPhoto(false);
        this.hideOverlay(state);
      });
    }
  }

  triggerPhotoPause(state, cluster) {
    const p = cluster.properties;
    state.lastVisitedStopId = p.id;
    state.markStopVisited(p.id);

    // Snap progress to the exact photo stop location so bike and photo markers align
    state.setProgress(p.km, true);

    state.setPausedForPhoto(true);
    this.countdownRemaining = window.AppConfig.photoPauseDuration || 5.0;

    // Set text labels
    document.getElementById('photoTitle').innerText = `${p.count} Photo${p.count === 1 ? '' : 's'}`;
    document.getElementById('photoDistance').innerText = `Km ${p.km.toFixed(2)}`;

    const timeText = p.first_time === p.last_time
      ? p.first_time.substring(11)
      : `${p.first_time.substring(11)} - ${p.last_time.substring(11)}`;
    document.getElementById('photoTime').innerText = timeText;

    // Inject images
    const viewport = document.getElementById('slideshowViewport');
    let imagesHTML = "";
    p.photos.forEach((photo, idx) => {
      const activeClass = idx === 0 ? "active" : "";
      imagesHTML += `
        <a href="file://${photo.source_path}" target="_blank" rel="noreferrer">
          <img src="${photo.thumb}" class="slide-img ${activeClass}" id="slide-${idx}" alt="${photo.file}" />
        </a>
      `;
    });
    viewport.innerHTML = imagesHTML;

    // Show overlay panel
    document.getElementById('photoPanel').classList.add('active');

    // Trigger visual countdown line shrinking (CSS transition scale)
    const bar = document.getElementById('countdownBar');
    if (bar) {
      bar.style.transition = 'none';
      bar.style.transform = 'scaleX(1)';
      bar.offsetHeight; // force DOM reflow
      bar.style.transition = `transform ${this.countdownRemaining}s linear`;
      bar.style.transform = 'scaleX(0)';
    }

    // Start cycle animation if multiple images
    if (this.slideshowInterval) clearInterval(this.slideshowInterval);
    
    let currentSlideIdx = 0;
    if (p.photos.length > 1) {
      this.slideshowInterval = setInterval(() => {
        const currentSlide = document.getElementById(`slide-${currentSlideIdx}`);
        if (currentSlide) currentSlide.classList.remove('active');
        
        currentSlideIdx = (currentSlideIdx + 1) % p.photos.length;
        
        const nextSlide = document.getElementById(`slide-${currentSlideIdx}`);
        if (nextSlide) nextSlide.classList.add('active');
      }, 2500); // cycle every 2.5s
    }
  }

  hideOverlay(state) {
    const panel = document.getElementById('photoPanel');
    if (panel) panel.classList.remove('active');
    
    if (this.slideshowInterval) {
      clearInterval(this.slideshowInterval);
      this.slideshowInterval = null;
    }

    // Notify state of play button update indirect triggers
    state.notify('playState', { isPlaying: state.isPlaying });
  }
}

// Register the feature
window.AppRegistry.register('slideshow', new SlideshowFeature());
