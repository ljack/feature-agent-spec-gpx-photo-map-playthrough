class ThreeDPlaythroughFeature {
  constructor() {
    this.displayMode = '2d'; // '2d', '3d-map', '3d-flight'
    this.pitch = window.AppConfig.three_d?.defaultPitch || 55;
    this.yaw = 0;
    this.zoom3d = 1.0;
    this.chaseCam = window.AppConfig.three_d?.chaseCam !== false;
    this.autoOrbit = window.AppConfig.three_d?.autoOrbit !== false;
    
    this.currentYaw = 0;
    this.routeShadow = null;
    
    // MapLibre specific objects
    this.maplibreMap = null;
    this.maplibreMarker = null;
    this.maplibrePhotoMarkers = [];
  }

  onInit(context) {
    const state = context.state;

    // 1. Create the Leaflet flat ground shadow polyline (shown only in 3D Map mode)
    const routeCoords = state.routeCoords;
    const latLns = routeCoords.map(c => [c[1], c[0]]);
    this.routeShadow = L.polyline(latLns, {
      className: 'route-line-shadow',
      color: 'rgba(24, 49, 45, 0.12)',
      weight: 6,
      opacity: 0.7,
      lineJoin: 'round'
    });
    context.mapEngine.addMarker(this.routeShadow, false);

    // 2. Inject the "3D View" cycle button into the standard playthrough controls
    const btnRow = document.querySelector('.controls-panel .btn-row');
    if (btnRow) {
      const threeDBtn = document.createElement('button');
      threeDBtn.className = 'btn three-d-btn';
      threeDBtn.id = 'threeDBtn';
      threeDBtn.innerHTML = `
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style="margin-right: 4px;">
          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
        </svg>
        <span>3D View</span>
      `;
      btnRow.appendChild(threeDBtn);
      threeDBtn.addEventListener('click', () => this.toggle3DMode(context));
    }

    // 3. Inject the Camera HUD control panel into the page body
    const hud = document.createElement('div');
    hud.id = 'cameraHud';
    hud.className = 'glass-panel camera-hud-panel hidden';
    hud.innerHTML = `
      <div class="camera-hud-title">3D Viewport Controls</div>
      
      <div class="camera-hud-row">
        <div class="camera-hud-label-row">
          <span>Camera Pitch (Tilt)</span>
          <span class="camera-hud-value" id="pitchVal">${this.pitch}°</span>
        </div>
        <input type="range" class="camera-hud-slider" id="pitchSlider" min="30" max="85" value="${this.pitch}" />
      </div>
      
      <div class="camera-hud-row">
        <div class="camera-hud-label-row">
          <span>Camera Yaw (Rotate)</span>
          <span class="camera-hud-value" id="yawVal">${this.yaw}°</span>
        </div>
        <input type="range" class="camera-hud-slider" id="yawSlider" min="0" max="359" value="${this.yaw}" />
      </div>

      <div class="camera-hud-row">
        <div class="camera-hud-label-row">
          <span>Alt / Viewport Scale</span>
          <span class="camera-hud-value" id="zoomVal">${this.zoom3d.toFixed(1)}x</span>
        </div>
        <input type="range" class="camera-hud-slider" id="zoomSlider" min="0.5" max="2.5" step="0.05" value="${this.zoom3d}" />
      </div>

      <div class="camera-hud-toggle-row">
        <label for="chaseCamCheck">Chase Cam (Follow Path)</label>
        <input type="checkbox" class="camera-hud-checkbox" id="chaseCamCheck" ${this.chaseCam ? 'checked' : ''} />
      </div>

      <div class="camera-hud-toggle-row">
        <label for="autoOrbitCheck">Orbit on Slideshow</label>
        <input type="checkbox" class="camera-hud-checkbox" id="autoOrbitCheck" ${this.autoOrbit ? 'checked' : ''} />
      </div>

      <button class="camera-hud-btn" id="resetCamBtn">Reset Camera</button>
    `;
    document.body.appendChild(hud);

    // 4. Inject the transparent mouse/touch drag overlay into the page body
    const overlay = document.createElement('div');
    overlay.id = 'cameraDragOverlay';
    overlay.className = 'camera-drag-overlay';
    document.body.appendChild(overlay);

    // 5. Bind events
    this.setupHUDControls();
    this.setupDragEvents();

    // 6. Subscribe to visited stop events to sync MapLibre markers
    state.subscribe('stopVisited', () => {
      if (this.displayMode === '3d-flight' && this.maplibreMap) {
        this.updateMaplibrePhotoMarkers(state);
      }
    });
  }

  onTick(context) {
    if (this.displayMode === '2d') return;
    
    const state = context.state;
    const km = state.currentProgressKm;
    const pt = this.getPointAtProgress(state, km);

    // Calculate heading/bearing
    const pt2 = this.getPointAtProgress(state, km + 0.03); // look 30m ahead
    const bearing = this.calculateBearing(pt.lat, pt.lon, pt2.lat, pt2.lon);

    // A. Photo pause orbit animation
    if (state.isPausedForPhoto && this.autoOrbit) {
      this.currentYaw = (this.currentYaw + 0.25) % 360;
      this.yaw = Math.round(((this.currentYaw % 360) + 360) % 360);
      
      this.updateHUDValues();
      
      if (this.displayMode === '3d-flight' && this.maplibreMap) {
        this.maplibreMap.jumpTo({
          center: [pt.lon, pt.lat],
          bearing: this.currentYaw,
          pitch: this.pitch
        });
      } else {
        this.apply3DTransform();
      }
    }
    // B. Active flight chase camera rotation
    else if (state.isPlaying && this.chaseCam) {
      let diff = (-bearing) - this.currentYaw;
      while (diff < -180) diff += 360;
      while (diff > 180) diff -= 360;
      this.currentYaw += diff * 0.08;
      this.yaw = Math.round(((this.currentYaw % 360) + 360) % 360);

      this.updateHUDValues();

      if (this.displayMode === '3d-flight' && this.maplibreMap) {
        const mlBearing = (this.currentYaw + 360) % 360;
        this.maplibreMap.jumpTo({
          center: [pt.lon, pt.lat],
          bearing: mlBearing,
          pitch: this.pitch,
          zoom: 14.5 + (this.zoom3d - 1.0) * 2
        });
      } else {
        this.apply3DTransform();
      }
    }
    // C. Non-chase camera movement sync (just center map on bike)
    else if (state.isPlaying || context.dt === 0) {
      if (this.displayMode === '3d-flight' && this.maplibreMap) {
        this.maplibreMap.setCenter([pt.lon, pt.lat]);
      }
    }

    // D. Update marker location in MapLibre
    if (this.displayMode === '3d-flight' && this.maplibreMap && this.maplibreMarker) {
      this.maplibreMarker.setLngLat([pt.lon, pt.lat]);
    }
  }

  onSeek(context) {
    if (this.displayMode === '2d') return;

    const state = context.state;
    const km = state.currentProgressKm;
    const pt = this.getPointAtProgress(state, km);

    const pt2 = this.getPointAtProgress(state, km + 0.03);
    const bearing = this.calculateBearing(pt.lat, pt.lon, pt2.lat, pt2.lon);

    if (this.chaseCam) {
      this.currentYaw = -bearing;
      this.yaw = Math.round(((this.currentYaw % 360) + 360) % 360);
      this.updateHUDValues();
    }

    if (this.displayMode === '3d-flight' && this.maplibreMap) {
      const mlBearing = this.chaseCam ? (this.currentYaw + 360) % 360 : this.maplibreMap.getBearing();
      this.maplibreMap.jumpTo({
        center: [pt.lon, pt.lat],
        bearing: mlBearing,
        pitch: this.pitch
      });
      if (this.maplibreMarker) this.maplibreMarker.setLngLat([pt.lon, pt.lat]);
    } else {
      this.apply3DTransform();
    }
  }

  onReset(context) {
    if (this.displayMode !== '2d') {
      this.displayMode = '2d';
      this.applyDisplayModeChanges(context);
    }
  }

  toggle3DMode(context) {
    if (this.displayMode === '2d') {
      this.displayMode = '3d-map';
    } else if (this.displayMode === '3d-map') {
      this.displayMode = '3d-flight';
    } else {
      this.displayMode = '2d';
    }
    this.applyDisplayModeChanges(context);
  }

  applyDisplayModeChanges(context) {
    const mapEl = document.getElementById('map');
    const maplibreEl = document.getElementById('maplibre-container');
    const overlay = document.getElementById('cameraDragOverlay');
    const hud = document.getElementById('cameraHud');
    const btn = document.getElementById('threeDBtn');
    
    if (!mapEl || !btn || !maplibreEl) return;

    // Reset styles and modes
    mapEl.classList.remove('mode-3d');
    mapEl.style.display = 'block';
    maplibreEl.style.display = 'none';
    btn.classList.remove('active');

    if (this.displayMode === '2d') {
      overlay.classList.remove('active');
      hud.classList.add('hidden');
      
      mapEl.classList.add('transitioning');
      mapEl.style.removeProperty('--map-pitch');
      mapEl.style.removeProperty('--map-yaw');
      mapEl.style.removeProperty('--map-zoom-3d');
      
      btn.querySelector('span').innerText = '3D View';

      setTimeout(() => {
        context.mapEngine.map.invalidateSize();
        mapEl.classList.remove('transitioning');
      }, 800);

    } else if (this.displayMode === '3d-map') {
      overlay.classList.add('active');
      hud.classList.remove('hidden');
      btn.classList.add('active');

      mapEl.classList.add('transitioning');
      mapEl.classList.add('mode-3d');
      
      btn.querySelector('span').innerText = '3D Map';

      this.alignYawToRoute(context.state, true);

      setTimeout(() => {
        context.mapEngine.map.invalidateSize();
        mapEl.classList.remove('transitioning');
      }, 800);

    } else if (this.displayMode === '3d-flight') {
      // Hide Leaflet, show MapLibre WebGL
      mapEl.style.display = 'none';
      maplibreEl.style.display = 'block';
      btn.classList.add('active');
      
      overlay.classList.remove('active'); // Disable drag overlay to allow MapLibre direct interactions
      hud.classList.remove('hidden');
      
      btn.querySelector('span').innerText = '3D Flight';

      this.initMaplibre(context);
    }
  }

  initMaplibre(context) {
    if (this.maplibreMap) {
      // Trigger resize and center immediately in case of window change
      setTimeout(() => {
        this.maplibreMap.resize();
        this.onSeek(context);
        this.updateMaplibrePhotoMarkers(context.state);
      }, 100);
      return;
    }

    const state = context.state;
    const startCoord = state.routeCoords[0];

    this.maplibreMap = new maplibregl.Map({
      container: 'maplibre-container',
      style: {
        version: 8,
        sources: {
          'raster-tiles': {
            type: 'raster',
            tiles: [
              'https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png'
            ],
            tileSize: 256,
            attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
          }
        },
        layers: [
          {
            id: 'simple-tiles',
            type: 'raster',
            source: 'raster-tiles',
            minzoom: 0,
            maxzoom: 20
          }
        ]
      },
      center: [startCoord[0], startCoord[1]],
      zoom: 14.5,
      pitch: this.pitch,
      bearing: this.yaw,
      maxPitch: 85,
      dragPan: false,
      dragRotate: false
    });

    this.maplibreMap.on('load', () => {
      // 1. Add 3D Terrain mesh using AWS Mapzen PNG tiles
      this.maplibreMap.addSource('terrain', {
        type: 'raster-dem',
        tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
        encoding: 'terrarium',
        tileSize: 256,
        maxzoom: 15
      });
      this.maplibreMap.setTerrain({ source: 'terrain', exaggeration: 1.5 });

      // 2. Add GPX Route Line geojson layer
      this.maplibreMap.addSource('route', {
        type: 'geojson',
        data: {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: state.routeCoords
          }
        }
      });

      this.maplibreMap.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route',
        layout: {
          'line-join': 'round',
          'line-cap': 'round'
        },
        paint: {
          'line-color': '#2f7d57', // Forest green flight path
          'line-width': 6,
          'line-opacity': 0.85
        }
      });

      // 3. Setup custom marker element for the bike position indicator
      const el = document.createElement('div');
      el.className = 'bike-marker';
      el.innerHTML = '<div class="bike-pulse"></div><div class="bike-core"></div>';

      this.maplibreMarker = new maplibregl.Marker({ element: el })
        .setLngLat([startCoord[0], startCoord[1]])
        .addTo(this.maplibreMap);

      // 4. Draw photo stop markers
      this.updateMaplibrePhotoMarkers(state);

      // 5. Connect native MapLibre cameras to programmatically sync HUD values
      this.maplibreMap.on('pitch', () => {
        this.pitch = Math.round(this.maplibreMap.getPitch());
        this.updateHUDValues();
      });

      this.maplibreMap.on('rotate', () => {
        const bearing = this.maplibreMap.getBearing();
        this.yaw = Math.round(((bearing % 360) + 360) % 360);
        this.currentYaw = bearing;
        this.updateHUDValues();
      });

      this.maplibreMap.on('zoom', () => {
        const currentZoom = this.maplibreMap.getZoom();
        this.zoom3d = Math.max(0.5, Math.min(2.5, (currentZoom - 14.5) / 2 + 1.0));
        this.updateHUDValues();
      });

      // 6. Disable Chase Cam immediately on click/touch/scroll DOM events to prevent jumpTo overrides
      const disableChase = () => {
        if (this.chaseCam) {
          this.chaseCam = false;
          const check = document.getElementById('chaseCamCheck');
          if (check) check.checked = false;
        }
      };

      const mapContainer = document.getElementById('maplibre-container');
      if (mapContainer) {
        mapContainer.addEventListener('mousedown', disableChase);
        mapContainer.addEventListener('touchstart', disableChase, { passive: true });
        mapContainer.addEventListener('wheel', disableChase, { passive: true });
      }

      this.maplibreMap.on('dragstart', disableChase);
      this.maplibreMap.on('zoomstart', disableChase);
      this.maplibreMap.on('rotatestart', disableChase);

      // Connect custom left-click drag rotate/tilt events
      this.setupMaplibreDragEvents();

      // Final camera centering trigger
      this.onSeek(context);
    });
  }

  setupMaplibreDragEvents() {
    const container = document.getElementById('maplibre-container');
    if (!container) return;

    let isDragging = false;
    let startX = 0, startY = 0;
    let startPitch = 0, startBearing = 0;

    const onStart = (e) => {
      // Only handle left click (e.button === 0) or touches
      if (e.button !== undefined && e.button !== 0) return;
      if (!this.maplibreMap) return;

      isDragging = true;
      const touch = e.touches ? e.touches[0] : e;
      startX = touch.clientX;
      startY = touch.clientY;
      startPitch = this.maplibreMap.getPitch();
      startBearing = this.maplibreMap.getBearing();

      // Disable Chase Cam immediately on click/drag
      if (this.chaseCam) {
        this.chaseCam = false;
        const check = document.getElementById('chaseCamCheck');
        if (check) check.checked = false;
      }
    };

    const onMove = (e) => {
      if (!isDragging || !this.maplibreMap) return;
      const touch = e.touches ? e.touches[0] : e;
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;

      // Map horizontal drag to bearing/rotation (yaw)
      let newBearing = (startBearing - dx * 0.5) % 360;
      if (newBearing < 0) newBearing += 360;
      this.yaw = Math.round(newBearing);
      this.currentYaw = this.yaw;
      this.maplibreMap.setBearing(this.yaw);

      // Map vertical drag to pitch/tilt (pitch)
      let newPitch = startPitch - dy * 0.4;
      newPitch = Math.max(30, Math.min(85, newPitch));
      this.pitch = Math.round(newPitch);
      this.maplibreMap.setPitch(this.pitch);

      this.updateHUDValues();
    };

    const onEnd = () => {
      isDragging = false;
    };

    container.addEventListener('mousedown', onStart);
    container.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);

    container.addEventListener('touchstart', onStart, { passive: true });
    container.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onEnd);
  }

  updateMaplibrePhotoMarkers(state) {
    if (!this.maplibreMap) return;

    // Clear existing photo markers
    this.maplibrePhotoMarkers.forEach(m => m.remove());
    this.maplibrePhotoMarkers = [];

    state.photoClusters.forEach(cluster => {
      const p = cluster.properties;
      const isVisited = state.visitedStopsSet.has(p.id);

      const el = document.createElement('div');
      if (isVisited) {
        el.className = 'maplibre-photo-marker';
        el.innerHTML = `
          <div class="parked-map-thumb-container">
            <img src="${p.photos[0].thumb}" class="parked-map-thumb" />
            ${p.count > 1 ? `<div class="parked-map-thumb-count">${p.count}</div>` : ''}
          </div>
        `;
      } else {
        el.className = 'maplibre-photo-marker-unvisited';
        el.style.width = '16px';
        el.style.height = '16px';
        el.style.borderRadius = '50%';
        el.style.background = '#b45309';
        el.style.border = '2px solid #111827';
      }

      el.addEventListener('click', (e) => {
        e.stopPropagation();
        
        // Decoupled stop seeking: update state directly and trigger seek hook across all active features
        state.setPausedForPhoto(false);
        state.visitedStopsSet.clear();
        state.photoClusters.forEach(c => {
          if (p.km >= c.properties.km) {
            state.markStopVisited(c.properties.id);
          }
        });
        state.setProgress(p.km, true);

        const context = {
          state: state,
          mapEngine: window.MapEngine,
          dt: 0
        };
        window.AppRegistry.triggerSeek(context, p.km);
      });

      const pt = state.getInterpolatedPoint(p.km);
      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([pt.lon, pt.lat])
        .addTo(this.maplibreMap);

      this.maplibrePhotoMarkers.push(marker);
    });
  }

  apply3DTransform() {
    const mapEl = document.getElementById('map');
    if (!mapEl) return;
    mapEl.style.setProperty('--map-pitch', `${this.pitch}deg`);
    mapEl.style.setProperty('--map-yaw', `${this.yaw}deg`);
    mapEl.style.setProperty('--map-zoom-3d', `${this.zoom3d}`);
  }

  updateHUDValues() {
    const pitchVal = document.getElementById('pitchVal');
    const yawVal = document.getElementById('yawVal');
    const zoomVal = document.getElementById('zoomVal');

    const pitchSlider = document.getElementById('pitchSlider');
    const yawSlider = document.getElementById('yawSlider');
    const zoomSlider = document.getElementById('zoomSlider');

    if (pitchVal) pitchVal.innerText = `${this.pitch}°`;
    if (yawVal) yawVal.innerText = `${this.yaw}°`;
    if (zoomVal) zoomVal.innerText = `${this.zoom3d.toFixed(1)}x`;

    if (pitchSlider) pitchSlider.value = this.pitch;
    if (yawSlider) yawSlider.value = this.yaw;
    if (zoomSlider) zoomSlider.value = this.zoom3d;
  }

  setupHUDControls() {
    const pitchSlider = document.getElementById('pitchSlider');
    const yawSlider = document.getElementById('yawSlider');
    const zoomSlider = document.getElementById('zoomSlider');
    const chaseCamCheck = document.getElementById('chaseCamCheck');
    const autoOrbitCheck = document.getElementById('autoOrbitCheck');
    const resetCamBtn = document.getElementById('resetCamBtn');

    if (pitchSlider) {
      pitchSlider.addEventListener('input', (e) => {
        this.pitch = parseInt(e.target.value);
        this.updateHUDValues();
        if (this.displayMode === '3d-flight' && this.maplibreMap) {
          this.maplibreMap.setPitch(this.pitch);
        } else {
          this.apply3DTransform();
        }
      });
    }

    if (yawSlider) {
      yawSlider.addEventListener('input', (e) => {
        this.yaw = parseInt(e.target.value);
        this.currentYaw = this.yaw;
        this.chaseCam = false;
        if (chaseCamCheck) chaseCamCheck.checked = false;
        this.updateHUDValues();
        if (this.displayMode === '3d-flight' && this.maplibreMap) {
          this.maplibreMap.setBearing(this.yaw);
        } else {
          this.apply3DTransform();
        }
      });
    }

    if (zoomSlider) {
      zoomSlider.addEventListener('input', (e) => {
        this.zoom3d = parseFloat(e.target.value);
        this.updateHUDValues();
        if (this.displayMode === '3d-flight' && this.maplibreMap) {
          this.maplibreMap.setZoom(14.5 + (this.zoom3d - 1.0) * 2);
        } else {
          this.apply3DTransform();
        }
      });
    }

    if (chaseCamCheck) {
      chaseCamCheck.addEventListener('change', (e) => {
        this.chaseCam = e.target.checked;
        if (this.chaseCam) {
          this.alignYawToRoute(window.AppState, false);
        }
      });
    }

    if (autoOrbitCheck) {
      autoOrbitCheck.addEventListener('change', (e) => {
        this.autoOrbit = e.target.checked;
      });
    }

    if (resetCamBtn) {
      resetCamBtn.addEventListener('click', () => {
        this.pitch = 55;
        this.zoom3d = 1.0;
        this.chaseCam = true;
        if (chaseCamCheck) chaseCamCheck.checked = true;
        
        this.alignYawToRoute(window.AppState, false);
        this.updateHUDValues();
        
        if (this.displayMode === '3d-flight' && this.maplibreMap) {
          const mlBearing = (this.currentYaw + 360) % 360;
          this.maplibreMap.setPitch(this.pitch);
          this.maplibreMap.setZoom(14.5);
          this.maplibreMap.setBearing(mlBearing);
        } else {
          this.apply3DTransform();
        }
      });
    }
  }

  setupDragEvents() {
    const overlay = document.getElementById('cameraDragOverlay');
    if (!overlay) return;

    let isDragging = false;
    let startX = 0, startY = 0;
    let startPitch = 0, startYaw = 0;
    let initialTouchDist = null;
    let startZoom = 1.0;

    const onDragStart = (e) => {
      isDragging = true;
      const touch = e.touches ? e.touches[0] : e;
      startX = touch.clientX;
      startY = touch.clientY;
      startPitch = this.pitch;
      startYaw = this.yaw;
    };

    const onDragMove = (e) => {
      if (!isDragging) return;
      const touch = e.touches ? e.touches[0] : e;
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;

      // Mouse left drag maps to rotation yaw (1px = 0.5 degrees)
      let newYaw = (startYaw - dx * 0.5) % 360;
      if (newYaw < 0) newYaw += 360;
      this.yaw = Math.round(newYaw);
      this.currentYaw = this.yaw;

      // Mouse drag vertical maps to pitch tilt (1px = 0.4 degrees)
      let newPitch = startPitch - dy * 0.4;
      newPitch = Math.max(30, Math.min(85, newPitch));
      this.pitch = Math.round(newPitch);

      // Disable Chase Cam on manual interaction
      this.chaseCam = false;
      const chaseCamCheck = document.getElementById('chaseCamCheck');
      if (chaseCamCheck) chaseCamCheck.checked = false;

      this.updateHUDValues();
      this.apply3DTransform();
    };

    const onDragEnd = () => {
      isDragging = false;
    };

    // 1. Desktop mouse drag rotation
    overlay.addEventListener('mousedown', onDragStart);
    overlay.addEventListener('mousemove', onDragMove);
    window.addEventListener('mouseup', onDragEnd);

    // 2. Desktop mouse wheel zoom
    overlay.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomStep = 0.05;
      if (e.deltaY > 0) {
        this.zoom3d = Math.max(0.5, this.zoom3d - zoomStep);
      } else {
        this.zoom3d = Math.min(2.5, this.zoom3d + zoomStep);
      }
      this.updateHUDValues();
      this.apply3DTransform();
    }, { passive: false });

    // 3. Mobile touch drag and pinch-to-zoom
    overlay.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) {
        isDragging = false;
        initialTouchDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        startZoom = this.zoom3d;
      } else if (e.touches.length === 1) {
        onDragStart(e);
      }
    }, { passive: true });

    overlay.addEventListener('touchmove', (e) => {
      if (e.touches.length === 2 && initialTouchDist !== null) {
        const currentDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        const factor = currentDist / initialTouchDist;
        
        // Scale from startZoom
        this.zoom3d = Math.max(0.5, Math.min(2.5, startZoom * factor));
        
        this.updateHUDValues();
        this.apply3DTransform();
      } else if (e.touches.length === 1) {
        onDragMove(e);
      }
    }, { passive: true });

    overlay.addEventListener('touchend', (e) => {
      if (e.touches.length < 2) {
        initialTouchDist = null;
      }
      onDragEnd();
    });
  }

  alignYawToRoute(state, instant = false) {
    const km = state.currentProgressKm;
    const pt1 = this.getPointAtProgress(state, km);
    const pt2 = this.getPointAtProgress(state, km + 0.03); // look 30m ahead
    const bearing = this.calculateBearing(pt1.lat, pt1.lon, pt2.lat, pt2.lon);
    
    const targetYaw = -bearing;
    
    if (instant) {
      this.currentYaw = targetYaw;
    } else {
      let diff = targetYaw - this.currentYaw;
      while (diff < -180) diff += 360;
      while (diff > 180) diff -= 360;
      this.currentYaw += diff * 0.08;
    }
    
    this.yaw = Math.round(((this.currentYaw % 360) + 360) % 360);
    this.updateHUDValues();
    this.apply3DTransform();
  }

  getPointAtProgress(state, km) {
    const distances = state.distances;
    const routeCoords = state.routeCoords;
    const totalDist = state.totalDist;

    if (!routeCoords || routeCoords.length === 0) return { lat: 0, lon: 0 };
    if (km <= 0) return { lat: routeCoords[0][1], lon: routeCoords[0][0], ele: routeCoords[0][2] || 0 };
    if (km >= totalDist) return { lat: routeCoords[routeCoords.length - 1][1], lon: routeCoords[routeCoords.length - 1][0], ele: routeCoords[routeCoords.length - 1][2] || 0 };

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

  calculateBearing(lat1, lon1, lat2, lon2) {
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const lat1Rad = (lat1 * Math.PI) / 180;
    const lat2Rad = (lat2 * Math.PI) / 180;

    const y = Math.sin(dLon) * Math.cos(lat2Rad);
    const x =
      Math.cos(lat1Rad) * Math.sin(lat2Rad) -
      Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);

    const brng = (Math.atan2(y, x) * 180) / Math.PI;
    return (brng + 360) % 360;
  }
}

// Register the feature
window.AppRegistry.register('three_d_playthrough', new ThreeDPlaythroughFeature());
