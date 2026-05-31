class AppState {
  constructor() {
    this.currentProgressKm = 0;
    this.isPlaying = false;
    this.speedMultiplier = 200;
    this.isPausedForPhoto = false;
    this.lastVisitedStopId = null;
    this.visitedStopsSet = new Set();
    this.autoPauseEnabled = true;
    this.isFollowEnabled = true;

    // Route geometries extracted from geojson
    this.routeCoords = [];
    this.distances = [];
    this.totalDist = 0;
    this.ascentM = 0;
    
    // Photo stop properties
    this.photoClusters = [];

    // PubSub listeners
    this.listeners = {};
  }

  // Load GeoJSON data into state
  loadGeoJSON(geojsonData) {
    const routeFeature = geojsonData.features.find(
      f => f.geometry.type === 'LineString'
    );
    this.photoClusters = geojsonData.features.filter(
      f => f.geometry.type === 'Point' && f.properties.marker === 'photo_cluster'
    );

    if (routeFeature) {
      this.routeCoords = routeFeature.geometry.coordinates;
      this.ascentM = routeFeature.properties.ascent_m || 0;
      this.calculateDistances();
    }
  }

  // Calculates cumulative haversine distances at each index along the route
  calculateDistances() {
    this.distances = [0];
    let accum = 0;
    for (let i = 1; i < this.routeCoords.length; i++) {
      const p1 = this.routeCoords[i - 1];
      const p2 = this.routeCoords[i];
      accum += this.haversine(p1[1], p1[0], p2[1], p2[0]);
      this.distances.push(accum);
    }
    this.totalDist = accum;
  }

  // Haversine distance in km
  haversine(lat1, lon1, lat2, lon2) {
    const R = 6371.009; // Earth's mean radius in km
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

  // Interpolates the coordinate along the route for a given progress in km
  getInterpolatedPoint(km) {
    if (!this.routeCoords || this.routeCoords.length === 0) {
      return { lat: 0, lon: 0, ele: 0 };
    }
    const distances = this.distances;
    const routeCoords = this.routeCoords;
    const totalDist = this.totalDist;

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

  // PubSub mechanism
  subscribe(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
    return () => {
      this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    };
  }

  notify(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(callback => {
        try {
          callback(data);
        } catch (e) {
          console.error(`Error notifying subscriber for event "${event}":`, e);
        }
      });
    }
  }

  // Setters that trigger notifications
  setProgress(km, forceUpdate = false) {
    this.currentProgressKm = Math.max(0, Math.min(this.totalDist, km));
    this.notify('progress', { km: this.currentProgressKm, force: forceUpdate });
  }

  setPlaying(playing) {
    if (this.isPlaying !== playing) {
      this.isPlaying = playing;
      this.notify('playState', { isPlaying: this.isPlaying });
    }
  }

  setSpeed(speed) {
    this.speedMultiplier = speed;
    this.notify('speed', { speed: this.speedMultiplier });
  }

  setPausedForPhoto(paused) {
    this.isPausedForPhoto = paused;
    this.notify('photoPause', { isPaused: this.isPausedForPhoto });
  }

  setAutoPause(enabled) {
    this.autoPauseEnabled = enabled;
    this.notify('autoPause', { enabled: this.autoPauseEnabled });
  }

  setFollow(enabled) {
    this.isFollowEnabled = enabled;
    this.notify('follow', { enabled: this.isFollowEnabled });
  }

  markStopVisited(stopId) {
    if (!this.visitedStopsSet.has(stopId)) {
      this.visitedStopsSet.add(stopId);
      this.notify('stopVisited', { stopId, visitedSet: this.visitedStopsSet });
    }
  }

  reset() {
    this.currentProgressKm = 0;
    this.isPlaying = false;
    this.isPausedForPhoto = false;
    this.lastVisitedStopId = null;
    this.visitedStopsSet.clear();
    this.notify('reset', null);
  }
}

window.AppState = new AppState();
