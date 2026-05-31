class PlaythroughFeature {
  constructor() {
    this.bikeMarker = null;
    this.timeControlPoints = window.TimeControlPoints || [];
  }

  onInit(context) {
    const state = context.state;
    const mapEngine = context.mapEngine;

    // Create bike marker custom icon
    const bikeIcon = L.divIcon({
      html: '<div class="bike-marker"><div class="bike-pulse"></div><div class="bike-core"></div></div>',
      className: '',
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    });

    const startPt = this.getInterpolatedPoint(state, 0);
    this.bikeMarker = L.marker([startPt.lat, startPt.lon], { icon: bikeIcon });
    mapEngine.addMarker(this.bikeMarker, false);

    // Render controls panel UI
    this.renderUI();
    this.bindEvents(state);

    // Initial update
    this.updateStats(state, startPt, 0);
  }

  onTick(context) {
    this.updateMarkerAndStats(context.state, context.mapEngine, false);
  }

  onSeek(context) {
    this.updateMarkerAndStats(context.state, context.mapEngine, true);
  }

  onPlayStateChange(context, isPlaying) {
    this.updatePlayButton(isPlaying, context.state.isPausedForPhoto);
  }

  onReset(context) {
    this.updatePlayButton(false, false);
    const speedSlider = document.getElementById('speedSlider');
    if (speedSlider) {
      speedSlider.value = 200;
      document.getElementById('speedLabel').innerText = '200x';
    }
    const autoPause = document.getElementById('autoPauseCheck');
    if (autoPause) autoPause.checked = true;
    const follow = document.getElementById('followCheck');
    if (follow) follow.checked = true;

    this.updateMarkerAndStats(context.state, context.mapEngine, true);
  }

  renderUI() {
    const container = document.getElementById('controlsContainer');
    if (!container) return;

    container.innerHTML = `
      <div class="glass-panel controls-panel">
        <h1>Lepsämä-Veikkola Playthrough</h1>
        
        <div class="btn-row">
          <button class="btn" id="playBtn">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" id="playIcon">
              <path d="M8 5v14l11-7z"/>
            </svg>
            <span id="playBtnText">Play Flight</span>
          </button>
          <button class="btn secondary" id="resetBtn">Reset</button>
        </div>

        <div class="slider-container">
          <div class="slider-header">
            <span>Flight Speed multiplier</span>
            <span id="speedLabel">200x</span>
          </div>
          <input type="range" id="speedSlider" min="1" max="1000" value="200" />
        </div>

        <div class="checkbox-row">
          <label class="checkbox-label">
            <input type="checkbox" id="autoPauseCheck" checked />
            Auto-Pause at Photos
          </label>
          <label class="checkbox-label">
            <input type="checkbox" id="followCheck" checked />
            Follow Bike
          </label>
        </div>

        <div class="stats-grid">
          <div class="stat-box">
            <span class="stat-label">Distance</span>
            <span class="stat-val" id="statDist">0.00 / 0.00 km</span>
          </div>
          <div class="stat-box">
            <span class="stat-label">Elevation</span>
            <span class="stat-val" id="statElev">-- m</span>
          </div>
          <div class="stat-box">
            <span class="stat-label">Elapsed Time</span>
            <span class="stat-val" id="statTime">00:00:00</span>
          </div>
          <div class="stat-box">
            <span class="stat-label">Section Speed</span>
            <span class="stat-val" id="statSpeed">-- km/h</span>
          </div>
        </div>
      </div>
    `;
  }

  bindEvents(state) {
    const playBtn = document.getElementById('playBtn');
    const resetBtn = document.getElementById('resetBtn');
    const speedSlider = document.getElementById('speedSlider');
    const autoPause = document.getElementById('autoPauseCheck');
    const follow = document.getElementById('followCheck');

    if (playBtn) {
      playBtn.addEventListener('click', () => {
        if (state.isPlaying) {
          window.ControlLoop.stop();
          if (state.isPausedForPhoto) {
            state.setPausedForPhoto(false);
          }
        } else {
          if (state.currentProgressKm >= state.totalDist) {
            state.setProgress(0, true);
          }
          window.ControlLoop.start();
        }
      });
    }

    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        state.reset();
        window.ControlLoop.stop();
      });
    }

    if (speedSlider) {
      speedSlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value);
        state.setSpeed(val);
        document.getElementById('speedLabel').innerText = val + "x";
      });
    }

    if (autoPause) {
      autoPause.addEventListener('change', (e) => {
        state.setAutoPause(e.target.checked);
      });
    }

    if (follow) {
      follow.addEventListener('change', (e) => {
        state.setFollow(e.target.checked);
      });
    }
  }

  updatePlayButton(isPlaying, isPausedForPhoto) {
    const icon = document.getElementById('playIcon');
    const text = document.getElementById('playBtnText');
    if (!icon || !text) return;

    if (isPlaying) {
      icon.innerHTML = '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>';
      text.innerText = isPausedForPhoto ? "Photos Paused" : "Pause Flight";
    } else {
      icon.innerHTML = '<path d="M8 5v14l11-7z"/>';
      text.innerText = "Play Flight";
    }
  }

  updateMarkerAndStats(state, mapEngine, forceUpdate) {
    const km = state.currentProgressKm;
    const pt = this.getInterpolatedPoint(state, km);

    if (this.bikeMarker) {
      this.bikeMarker.setLatLng([pt.lat, pt.lon]);
    }

    if (state.isFollowEnabled && (state.isPlaying || forceUpdate)) {
      mapEngine.panTo(pt.lat, pt.lon);
    }

    this.updateStats(state, pt, km);
  }

  updateStats(state, pt, km) {
    const distEl = document.getElementById('statDist');
    const elevEl = document.getElementById('statElev');
    const timeEl = document.getElementById('statTime');
    const speedEl = document.getElementById('statSpeed');

    if (distEl) distEl.innerText = `${km.toFixed(2)} / ${state.totalDist.toFixed(2)} km`;
    if (elevEl) elevEl.innerText = `${Math.round(pt.ele)} m`;
    if (timeEl) timeEl.innerText = this.formatTime(this.getElapsedTime(state, km));
    if (speedEl) speedEl.innerText = `${this.getSpeed(state, km).toFixed(1)} km/h`;
  }

  getInterpolatedPoint(state, km) {
    const distances = state.distances;
    const routeCoords = state.routeCoords;
    const totalDist = state.totalDist;

    if (km <= 0) return { lat: routeCoords[0][1], lon: routeCoords[0][0], ele: routeCoords[0][2] };
    if (km >= totalDist) return { lat: routeCoords[routeCoords.length-1][1], lon: routeCoords[routeCoords.length-1][0], ele: routeCoords[routeCoords.length-1][2] };
    
    let lo = 0, hi = distances.length - 1;
    while (lo < hi - 1) {
      const mid = Math.floor((lo + hi) / 2);
      if (distances[mid] <= km) {
        lo = mid;
      } else {
        hi = mid;
      }
    }

    const pct = (km - distances[lo]) / (distances[hi] - distances[lo]);
    const p1 = routeCoords[lo];
    const p2 = routeCoords[hi];
    return {
      lat: p1[1] + pct * (p2[1] - p1[1]),
      lon: p1[0] + pct * (p2[0] - p1[0]),
      ele: (p1[2] || 0) + pct * ((p2[2] || 0) - (p1[2] || 0))
    };
  }

  getElapsedTime(state, km) {
    const totalDist = state.totalDist;
    if (km <= 0) return 0;
    if (km >= totalDist) return 21962;
    for (let i = 1; i < this.timeControlPoints.length; i++) {
      const p1 = this.timeControlPoints[i-1];
      const p2 = this.timeControlPoints[i];
      if (km >= p1.km && km <= p2.km) {
        const pct = (km - p1.km) / (p2.km - p1.km);
        return p1.s + pct * (p2.s - p1.s);
      }
    }
    return km * (21962 / totalDist);
  }

  getSpeed(state, km) {
    const totalDist = state.totalDist;
    if (km <= 0 || km >= totalDist) return 0;
    for (let i = 1; i < this.timeControlPoints.length; i++) {
      const p1 = this.timeControlPoints[i-1];
      const p2 = this.timeControlPoints[i];
      if (km >= p1.km && km <= p2.km) {
        const dist = p2.km - p1.km;
        const hours = (p2.s - p1.s) / 3600;
        return hours > 0 ? (dist / hours) : 9.5;
      }
    }
    return 9.5;
  }

  formatTime(totalSeconds) {
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = Math.floor(totalSeconds % 60);
    return String(hrs).padStart(2, '0') + ':' + String(mins).padStart(2, '0') + ':' + String(secs).padStart(2, '0');
  }
}

// Register the feature
window.AppRegistry.register('playthrough', new PlaythroughFeature());
