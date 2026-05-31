class ElevationFeature {
  constructor() {
    this.minEle = 0;
    this.maxEle = 0;
    this.elevations = [];
  }

  onInit(context) {
    const state = context.state;
    this.elevations = state.routeCoords.map(c => c[2] || 0);
    this.minEle = Math.min(...this.elevations) - 8;
    this.maxEle = Math.max(...this.elevations) + 8;

    this.renderUI(state);
    this.buildProfileSVG(state);
    this.bindEvents(state);

    // Initial update of playhead
    this.updatePlayhead(0, state.totalDist);
  }

  onTick(context) {
    this.updatePlayhead(context.state.currentProgressKm, context.state.totalDist);
  }

  onSeek(context) {
    this.updatePlayhead(context.state.currentProgressKm, context.state.totalDist);
  }

  onReset(context) {
    this.updatePlayhead(0, context.state.totalDist);
  }

  renderUI(state) {
    const container = document.getElementById('elevationContainer');
    if (!container) return;

    container.innerHTML = `
      <div class="glass-panel profile-panel">
        <div class="profile-header">
          <span>Elevation Profile (Click to seek)</span>
          <span>Ascent: <span id="ascentLabel">${Math.round(state.ascentM)}</span>m+ (Smoothed)</span>
        </div>
        <div class="profile-svg-container" id="profileContainer">
          <svg id="profileSvg" width="100%" height="100%" viewBox="0 0 1200 120" preserveAspectRatio="none" style="display: block;">
            <defs>
              <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#397f9d" stop-opacity="0.4" />
                <stop offset="100%" stop-color="#397f9d" stop-opacity="0.0" />
              </linearGradient>
            </defs>
            <path id="profileArea" fill="url(#areaGrad)" d="" />
            <path id="profileLine" fill="none" stroke="#397f9d" stroke-width="2.5" d="" />
            <line id="profileCursor" x1="0" y1="0" x2="0" y2="120" stroke="rgba(216, 139, 47, 0.7)" stroke-width="1.5" stroke-dasharray="3,3" style="display:none;" />
            <line id="profilePlayhead" x1="-10" y1="0" x2="-10" y2="120" stroke="var(--sun)" stroke-width="2" />
            <g id="profilePhotosGroup"></g>
          </svg>
        </div>
      </div>
    `;
  }

  buildProfileSVG(state) {
    const elevations = this.elevations;
    const minEle = this.minEle;
    const maxEle = this.maxEle;
    const totalDist = state.totalDist;
    const distances = state.distances;
    const routeCoords = state.routeCoords;

    if (routeCoords.length === 0) return;

    // Line Path
    let lineD = "M " + 25 + " " + (110 - ((elevations[0] - minEle) / (maxEle - minEle)) * 80);
    for (let i = 1; i < routeCoords.length; i++) {
      const x = (distances[i] / totalDist) * 1150 + 25;
      const y = 110 - ((elevations[i] - minEle) / (maxEle - minEle)) * 80;
      lineD += " L " + x + " " + y;
    }
    
    const lineEl = document.getElementById('profileLine');
    if (lineEl) lineEl.setAttribute('d', lineD);

    // Area Path
    const areaD = lineD + " L " + 1175 + " 120 L 25 120 Z";
    const areaEl = document.getElementById('profileArea');
    if (areaEl) areaEl.setAttribute('d', areaD);

    // Render photo circles on the SVG chart timeline
    const group = document.getElementById('profilePhotosGroup');
    if (group) {
      let photosHTML = "";
      state.photoClusters.forEach(cluster => {
        const p = cluster.properties;
        const x = (p.km / totalDist) * 1150 + 25;
        
        // Find nearest coordinate index to get elevation
        let minDiff = Infinity;
        let nearestIdx = 0;
        for (let i = 0; i < distances.length; i++) {
          const diff = Math.abs(distances[i] - p.km);
          if (diff < minDiff) {
            minDiff = diff;
            nearestIdx = i;
          }
        }
        const y = 110 - ((elevations[nearestIdx] - minEle) / (maxEle - minEle)) * 80;
        
        photosHTML += `<circle cx="${x}" cy="${y}" r="5.5" fill="#d88b2f" stroke="#fff" stroke-width="1.5" style="cursor:pointer;" class="svg-photo-stop" data-km="${p.km}" />`;
      });
      group.innerHTML = photosHTML;
    }
  }

  bindEvents(state) {
    const svgEl = document.getElementById('profileSvg');
    const cursor = document.getElementById('profileCursor');
    if (!svgEl) return;

    svgEl.addEventListener('mousemove', (e) => {
      const rect = svgEl.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const xPct = clickX / rect.width;
      if (xPct >= 0 && xPct <= 1) {
        const svgX = xPct * 1200;
        if (cursor) {
          cursor.setAttribute('x1', svgX);
          cursor.setAttribute('x2', svgX);
          cursor.style.display = 'block';
        }
      }
    });

    svgEl.addEventListener('mouseleave', () => {
      if (cursor) cursor.style.display = 'none';
    });

    svgEl.addEventListener('click', (e) => {
      // Ignore click if clicking directly on a photo stop circle
      if (e.target.classList.contains('svg-photo-stop')) {
        return;
      }

      const rect = svgEl.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const pct = Math.max(0, Math.min(1, clickX / rect.width));
      const km = pct * state.totalDist;

      this.triggerSeekUpdate(state, km);
    });

    // Make SVG photo stop circles clickable
    const group = document.getElementById('profilePhotosGroup');
    if (group) {
      group.addEventListener('click', (e) => {
        if (e.target.classList.contains('svg-photo-stop')) {
          const km = parseFloat(e.target.getAttribute('data-km'));
          this.triggerSeekUpdate(state, km);
        }
      });
    }
  }

  triggerSeekUpdate(state, km) {
    state.setPausedForPhoto(false);
    
    // Recalculate visited state on seek
    state.visitedStopsSet.clear();
    state.photoClusters.forEach(c => {
      if (km >= c.properties.km) {
        state.markStopVisited(c.properties.id);
      }
    });

    state.setProgress(km, true);

    const context = {
      state: state,
      mapEngine: window.MapEngine,
      dt: 0
    };
    window.AppRegistry.triggerSeek(context, km);
  }

  updatePlayhead(currentKm, totalDist) {
    const playhead = document.getElementById('profilePlayhead');
    if (!playhead || totalDist === 0) return;

    const playheadX = (currentKm / totalDist) * 1150 + 25;
    playhead.setAttribute('x1', playheadX);
    playhead.setAttribute('x2', playheadX);
  }
}

// Register the feature
window.AppRegistry.register('elevation', new ElevationFeature());
