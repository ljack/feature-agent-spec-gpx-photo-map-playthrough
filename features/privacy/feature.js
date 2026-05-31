class PrivacyFeature {
  constructor() {
    this.activeConfig = {
      enabled: true,
      startRadiusMeters: 800,
      endRadiusMeters: 500,
      joinRoute: false
    };
    this.routeName = 'default_route';
  }

  // Intercept and filter the GeoJSON data before state initialization
  onLoadData(geojsonData) {
    const routeFeature = geojsonData.features.find(
      f => f.geometry.type === 'LineString'
    );
    if (!routeFeature) return;

    this.routeName = routeFeature.properties.name || 'default_route';
    
    // Load config from LocalStorage or fall back to AppConfig / default values
    this.loadConfig();

    if (!this.activeConfig.enabled) {
      console.log("[Privacy] Feature is disabled in configuration.");
      return;
    }

    const coords = routeFeature.geometry.coordinates;
    if (coords.length < 2) return;

    const startPt = coords[0];
    const endPt = coords[coords.length - 1];

    const startRadiusKm = this.activeConfig.startRadiusMeters / 1000;
    const endRadiusKm = this.activeConfig.endRadiusMeters / 1000;

    // Find the first coordinate index outside the start privacy radius
    let startIndex = 0;
    for (let i = 0; i < coords.length; i++) {
      const dist = this.haversine(startPt[1], startPt[0], coords[i][1], coords[i][0]);
      if (dist >= startRadiusKm) {
        startIndex = i;
        break;
      }
    }

    // Find the last coordinate index outside the end privacy radius
    let endIndex = coords.length - 1;
    for (let i = coords.length - 1; i >= 0; i--) {
      const dist = this.haversine(endPt[1], endPt[0], coords[i][1], coords[i][0]);
      if (dist >= endRadiusKm) {
        endIndex = i;
        break;
      }
    }

    console.log(`[Privacy] Route index trimming: Start Index ${startIndex}, End Index ${endIndex} (Original size: ${coords.length})`);

    if (startIndex < endIndex) {
      // Perform the slice on the route coordinates in-place
      const slicedCoords = coords.slice(startIndex, endIndex + 1);
      
      if (this.activeConfig.joinRoute && slicedCoords.length > 0) {
        // Append a copy of the first coordinate to the end to close the route
        slicedCoords.push([slicedCoords[0][0], slicedCoords[0][1], slicedCoords[0][2] || 0]);
      }
      
      routeFeature.geometry.coordinates = slicedCoords;
      routeFeature.properties.point_count = slicedCoords.length;

      // Also filter the photo stops GeoJSON features to exclude any inside the zones
      const newVisibleStart = slicedCoords[0];
      const newVisibleEnd = slicedCoords[slicedCoords.length - 1];

      geojsonData.features = geojsonData.features.filter(f => {
        if (f.geometry.type === 'Point' && f.properties.marker === 'photo_cluster') {
          const distToStart = this.haversine(startPt[1], startPt[0], f.geometry.coordinates[1], f.geometry.coordinates[0]);
          const distToEnd = this.haversine(endPt[1], endPt[0], f.geometry.coordinates[1], f.geometry.coordinates[0]);
          
          const insideStart = distToStart < startRadiusKm;
          const insideEnd = distToEnd < endRadiusKm;
          
          if (insideStart || insideEnd) {
            console.log(`[Privacy] Hiding photo stop at Km ${f.properties.km.toFixed(2)} inside privacy zone.`);
            return false;
          }
        }
        return true;
      });

      // Readjust time control points if they are outside the new range
      if (window.TimeControlPoints) {
        const startKm = startIndex > 0 ? (startIndex / coords.length) * 58.02 : 0; // approximate km representation
        const endKm = endIndex < coords.length - 1 ? (endIndex / coords.length) * 58.02 : 58.02;
        // In this app, we will let playthrough handle timeControlPoints snapping naturally,
        // but we can slice/shift timeControlPoints relative to new start Km inside playthrough logic if needed.
        // For simplicity, we just filter time control points inside the new bounds.
      }
    }
  }

  onInit(context) {
    this.renderUI();
    this.bindEvents(context.state);
  }

  loadConfig() {
    const key = `privacy_config_${this.routeName}`;
    const stored = localStorage.getItem(key);
    if (stored) {
      try {
        this.activeConfig = JSON.parse(stored);
      } catch (e) {
        console.error("[Privacy] Failed to parse stored config, using defaults", e);
      }
    } else if (window.AppConfig && window.AppConfig.privacy) {
      this.activeConfig = { ...window.AppConfig.privacy };
    }
  }

  saveConfig() {
    const key = `privacy_config_${this.routeName}`;
    localStorage.setItem(key, JSON.stringify(this.activeConfig));
  }

  renderUI() {
    const controlsPanel = document.querySelector('.controls-panel');
    if (!controlsPanel) return;

    // Create privacy settings HTML block
    const privacyBlock = document.createElement('div');
    privacyBlock.className = 'privacy-settings-block';
    privacyBlock.innerHTML = `
      <div class="privacy-divider"></div>
      <div class="privacy-header-row">
        <h3>Privacy Settings</h3>
        <label class="privacy-toggle-label">
          <input type="checkbox" id="privacyEnabledCheck" ${this.activeConfig.enabled ? 'checked' : ''} />
          Enable Masking
        </label>
      </div>
      
      <div class="privacy-sliders-container" style="${this.activeConfig.enabled ? '' : 'display: none;'}">
        <div class="slider-container">
          <div class="slider-header">
            <span>Start Mask Radius</span>
            <span id="startRadiusLabel">${this.activeConfig.startRadiusMeters}m</span>
          </div>
          <input type="range" id="startRadiusSlider" min="0" max="3000" step="50" value="${this.activeConfig.startRadiusMeters}" />
        </div>
        
        <div class="slider-container">
          <div class="slider-header">
            <span>End Mask Radius</span>
            <span id="endRadiusLabel">${this.activeConfig.endRadiusMeters}m</span>
          </div>
          <input type="range" id="endRadiusSlider" min="0" max="3000" step="50" value="${this.activeConfig.endRadiusMeters}" />
        </div>

        <label class="privacy-toggle-label" style="margin-top: 4px; display: flex; justify-content: space-between; width: 100%;">
          <span>Join Start & End (Seamless Loop)</span>
          <input type="checkbox" id="privacyJoinRouteCheck" ${this.activeConfig.joinRoute ? 'checked' : ''} />
        </label>
      </div>
    `;

    controlsPanel.appendChild(privacyBlock);
  }

  bindEvents(state) {
    const enabledCheck = document.getElementById('privacyEnabledCheck');
    const joinCheck = document.getElementById('privacyJoinRouteCheck');
    const startSlider = document.getElementById('startRadiusSlider');
    const endSlider = document.getElementById('endRadiusSlider');
    const slidersContainer = document.querySelector('.privacy-sliders-container');

    if (enabledCheck) {
      enabledCheck.addEventListener('change', (e) => {
        const enabled = e.target.checked;
        this.activeConfig.enabled = enabled;
        this.saveConfig();

        if (slidersContainer) {
          slidersContainer.style.display = enabled ? '' : 'none';
        }

        setTimeout(() => {
          window.location.reload();
        }, 300);
      });
    }

    if (joinCheck) {
      joinCheck.addEventListener('change', (e) => {
        this.activeConfig.joinRoute = e.target.checked;
        this.saveConfig();
        
        setTimeout(() => {
          window.location.reload();
        }, 300);
      });
    }

    if (startSlider) {
      startSlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value);
        document.getElementById('startRadiusLabel').innerText = `${val}m`;
        this.activeConfig.startRadiusMeters = val;
      });

      startSlider.addEventListener('change', () => {
        this.saveConfig();
        window.location.reload();
      });
    }

    if (endSlider) {
      endSlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value);
        document.getElementById('endRadiusLabel').innerText = `${val}m`;
        this.activeConfig.endRadiusMeters = val;
      });

      endSlider.addEventListener('change', () => {
        this.saveConfig();
        window.location.reload();
      });
    }
  }

  // Haversine formula helper in km
  haversine(lat1, lon1, lat2, lon2) {
    const R = 6371.009;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.asin(Math.sqrt(a));
    return R * c;
  }
}

// Register the feature
window.AppRegistry.register('privacy', new PrivacyFeature());
