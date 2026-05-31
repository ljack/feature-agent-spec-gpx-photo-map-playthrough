class GalleryFeature {
  constructor() {
    this.leafletMarkersMap = {};
    this.allPhotos = []; // Chronological flat list of all photos
    this.currentPhotoIdx = 0;
    this.listenersBound = false;
  }

  onInit(context) {
    const state = context.state;
    const mapEngine = context.mapEngine;

    // Render gallery container UI
    this.renderUI();

    // Flatten all photo clusters into a single chronological list
    this.allPhotos = [];
    state.photoClusters.forEach(cluster => {
      cluster.properties.photos.forEach(photo => {
        this.allPhotos.push({
          ...photo,
          clusterId: cluster.properties.id,
          km: cluster.properties.km,
          time: photo.photo_time_local
        });
      });
    });

    // Render initial unvisited circle markers on map
    state.photoClusters.forEach(cluster => {
      const p = cluster.properties;
      const pt = state.getInterpolatedPoint(p.km);
      
      const marker = L.circleMarker([pt.lat, pt.lon], {
        radius: Math.min(14, 6 + p.count),
        color: "#111827",
        fillColor: "#b45309",
        fillOpacity: 0.92,
        weight: 2
      });

      marker.on('click', () => {
        this.seekToStop(state, p.km);
      });

      mapEngine.addMarker(marker);
      this.leafletMarkersMap[p.id] = marker;
    });

    // Subscribe to state updates
    state.subscribe('stopVisited', () => {
      this.updateFilmstrip(state, mapEngine);
    });

    state.subscribe('reset', () => {
      this.resetGallery(state, mapEngine);
    });

    // Initial sync
    this.updateFilmstrip(state, mapEngine);
  }

  onReset(context) {
    this.resetGallery(context.state, context.mapEngine);
  }

  renderUI() {
    const container = document.getElementById('galleryContainer');
    if (!container) return;

    container.innerHTML = `
      <div class="glass-panel parked-gallery-panel" id="parkedGalleryPanel" style="display: none;">
        <h3 class="parked-gallery-title">Visited Photos</h3>
        <div class="parked-grid" id="parkedGridInner"></div>
      </div>
      
      <!-- Fullscreen Slideshow Modal -->
      <div id="fullscreenSlideshowModal" class="fullscreen-modal" style="display: none;">
        <button class="fullscreen-close-btn" id="fsCloseBtn">✕</button>
        <button class="fullscreen-nav-btn prev" id="fsPrevBtn">‹</button>
        <button class="fullscreen-nav-btn next" id="fsNextBtn">›</button>
        
        <div class="fullscreen-content">
          <a id="fsLink" href="" target="_blank" rel="noreferrer">
            <img id="fsImage" src="" class="fullscreen-image" />
          </a>
          <div class="fullscreen-meta">
            <h3 id="fsTitle">Photo 1 of 10</h3>
            <p id="fsInfo">Km 12.25 — 16:12:59</p>
          </div>
        </div>
      </div>
    `;
  }

  bindGalleryEvents(state) {
    if (this.listenersBound) return;
    this.listenersBound = true;

    const inner = document.getElementById('parkedGridInner');
    if (!inner) return;

    // Handle clicks on filmstrip thumbnails to open fullscreen slideshow
    inner.addEventListener('click', (e) => {
      const wrapper = e.target.closest('.parked-thumb-wrapper');
      if (wrapper) {
        const stopId = parseInt(wrapper.getAttribute('data-stop-id'));
        const idx = this.allPhotos.findIndex(p => p.clusterId === stopId);
        if (idx !== -1) {
          this.openFullscreenSlideshow(state, idx);
        }
      }
    });

    // Close button click handler
    const closeBtn = document.getElementById('fsCloseBtn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.closeFullscreenSlideshow());
    }

    // Prev/Next buttons click handlers
    const prevBtn = document.getElementById('fsPrevBtn');
    if (prevBtn) {
      prevBtn.addEventListener('click', () => this.navigateFullscreenSlideshow(state, -1));
    }

    const nextBtn = document.getElementById('fsNextBtn');
    if (nextBtn) {
      nextBtn.addEventListener('click', () => this.navigateFullscreenSlideshow(state, 1));
    }

    // Close on background click
    const modal = document.getElementById('fullscreenSlideshowModal');
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          this.closeFullscreenSlideshow();
        }
      });
    }

    // Keyboard navigation (ArrowLeft, ArrowRight, Escape)
    window.addEventListener('keydown', (e) => {
      const fsModal = document.getElementById('fullscreenSlideshowModal');
      if (!fsModal || fsModal.style.display === 'none') return;

      if (e.key === 'ArrowRight' || e.key === 'Right') {
        this.navigateFullscreenSlideshow(state, 1);
      } else if (e.key === 'ArrowLeft' || e.key === 'Left') {
        this.navigateFullscreenSlideshow(state, -1);
      } else if (e.key === 'Escape') {
        this.closeFullscreenSlideshow();
      }
    });
  }

  openFullscreenSlideshow(state, photoIdx) {
    this.currentPhotoIdx = photoIdx;
    const modal = document.getElementById('fullscreenSlideshowModal');
    if (!modal) return;

    modal.style.display = 'flex';
    this.updateFullscreenPhoto(state);
    
    // Disable main page scrolling while slideshow is open
    document.body.style.overflow = 'hidden';
  }

  closeFullscreenSlideshow() {
    const modal = document.getElementById('fullscreenSlideshowModal');
    if (modal) {
      modal.style.display = 'none';
    }
    document.body.style.overflow = '';
  }

  navigateFullscreenSlideshow(state, direction) {
    if (this.allPhotos.length === 0) return;
    
    this.currentPhotoIdx = (this.currentPhotoIdx + direction + this.allPhotos.length) % this.allPhotos.length;
    this.updateFullscreenPhoto(state);

    // Sync bike / map position with active photo
    const photo = this.allPhotos[this.currentPhotoIdx];
    this.seekToStop(state, photo.km);
  }

  updateFullscreenPhoto(state) {
    if (this.allPhotos.length === 0) return;
    const photo = this.allPhotos[this.currentPhotoIdx];
    
    const fsImage = document.getElementById('fsImage');
    const fsLink = document.getElementById('fsLink');
    const fsTitle = document.getElementById('fsTitle');
    const fsInfo = document.getElementById('fsInfo');

    if (fsImage) fsImage.src = photo.thumb;
    if (fsLink) fsLink.href = `file://${photo.source_path}`;
    if (fsTitle) fsTitle.innerText = `Photo ${this.currentPhotoIdx + 1} of ${this.allPhotos.length}`;
    if (fsInfo) fsInfo.innerText = `Km ${photo.km.toFixed(2)} — ${photo.time.substring(11)}`;
  }

  seekToStop(state, km) {
    state.setPausedForPhoto(false);

    // Recalculate visited stops list on seek
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

  resetGallery(state, mapEngine) {
    const panel = document.getElementById('parkedGalleryPanel');
    if (panel) panel.style.display = 'none';

    const inner = document.getElementById('parkedGridInner');
    if (inner) inner.innerHTML = '';

    this.closeFullscreenSlideshow();

    // Revert all markers to default circles
    state.photoClusters.forEach(cluster => {
      const p = cluster.properties;
      const currentMarker = this.leafletMarkersMap[p.id];
      
      if (currentMarker && currentMarker._isThumbnail) {
        mapEngine.removeMarker(currentMarker);

        const pt = state.getInterpolatedPoint(p.km);
        const originalMarker = L.circleMarker([pt.lat, pt.lon], {
          radius: Math.min(14, 6 + p.count),
          color: "#111827",
          fillColor: "#b45309",
          fillOpacity: 0.92,
          weight: 2
        });

        originalMarker.on('click', () => {
          this.seekToStop(state, p.km);
        });

        mapEngine.addMarker(originalMarker);
        this.leafletMarkersMap[p.id] = originalMarker;
      }
    });
  }

  updateFilmstrip(state, mapEngine) {
    const panel = document.getElementById('parkedGalleryPanel');
    const inner = document.getElementById('parkedGridInner');
    if (!panel || !inner) return;

    const visitedStops = state.photoClusters
      .filter(c => state.visitedStopsSet.has(c.properties.id))
      .sort((a, b) => a.properties.km - b.properties.km);

    this.updateVisitedMarkers(state, mapEngine);

    if (visitedStops.length === 0) {
      panel.style.display = 'none';
      return;
    }

    panel.style.display = 'flex';

    let html = "";
    visitedStops.forEach(stop => {
      const photo = stop.properties.photos[0];
      const count = stop.properties.count;

      html += `
        <div class="parked-thumb-wrapper" title="Km ${stop.properties.km.toFixed(1)}" data-km="${stop.properties.km}" data-stop-id="${stop.properties.id}">
          <img src="${photo.thumb}" class="parked-thumb-img" />
          ${count > 1 ? `<div class="parked-thumb-count">${count}</div>` : ''}
          
          <!-- Floating Hover Preview Tooltip Card -->
          <div class="gallery-hover-preview">
            <img src="${photo.thumb}" class="hover-preview-img" />
            <div class="hover-preview-meta">
              <span>Km ${stop.properties.km.toFixed(2)}</span>
              <span>${photo.photo_time_local.substring(11)}</span>
            </div>
          </div>
        </div>
      `;
    });
    inner.innerHTML = html;
    this.bindGalleryEvents(state);
  }

  updateVisitedMarkers(state, mapEngine) {
    state.photoClusters.forEach(cluster => {
      const p = cluster.properties;
      const currentMarker = this.leafletMarkersMap[p.id];
      const isVisited = state.visitedStopsSet.has(p.id);

      if (isVisited) {
        if (currentMarker && currentMarker._isThumbnail) {
          return; // already upgraded
        }
        if (currentMarker) {
          mapEngine.removeMarker(currentMarker);
        }

        const firstPhoto = p.photos[0];
        const thumbIcon = L.divIcon({
          html: `
            <div class="parked-map-thumb-container">
              <img src="${firstPhoto.thumb}" class="parked-map-thumb" />
              ${p.count > 1 ? `<div class="parked-map-thumb-count">${p.count}</div>` : ''}
            </div>
          `,
          className: '',
          iconSize: [40, 40],
          iconAnchor: [20, 20]
        });

        const pt = state.getInterpolatedPoint(p.km);
        const newMarker = L.marker([pt.lat, pt.lon], {
          icon: thumbIcon
        });

        newMarker._isThumbnail = true;
        newMarker.properties = p;

        newMarker.on('click', () => {
          this.seekToStop(state, p.km);
        });

        mapEngine.addMarker(newMarker);
        this.leafletMarkersMap[p.id] = newMarker;

      } else {
        if (currentMarker && currentMarker._isThumbnail) {
          mapEngine.removeMarker(currentMarker);

          const pt = state.getInterpolatedPoint(p.km);
          const originalMarker = L.circleMarker([pt.lat, pt.lon], {
            radius: Math.min(14, 6 + p.count),
            color: "#111827",
            fillColor: "#b45309",
            fillOpacity: 0.92,
            weight: 2
          });

          originalMarker.on('click', () => {
            this.seekToStop(state, p.km);
          });

          mapEngine.addMarker(originalMarker);
          this.leafletMarkersMap[p.id] = originalMarker;
        }
      }
    });
  }
}

// Register the feature
window.AppRegistry.register('gallery', new GalleryFeature());
