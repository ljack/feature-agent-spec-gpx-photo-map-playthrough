class MapEngine {
  constructor() {
    this.map = null;
    this.routeLine = null;
    this.photoGroup = null;
    this.leafletMarkersMap = {}; // mapping from cluster id to Leaflet marker instance
  }

  initialize(mapElementId, routeCoords) {
    // Initialize map
    this.map = L.map(mapElementId, {
      zoomControl: false
    });

    // Add zoom control in top right
    L.control.zoom({
      position: 'topright'
    }).addTo(this.map);

    // Add voyager base tiles
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
      subdomains: 'abcd',
      maxZoom: 20
    }).addTo(this.map);

    // Render route polyline
    const latLns = routeCoords.map(c => [c[1], c[0]]);
    this.routeLine = L.polyline(latLns, {
      className: 'route-line-main',
      color: 'var(--water)',
      weight: 5,
      opacity: 0.9,
      lineJoin: 'round'
    }).addTo(this.map);

    // Fit map view to route bounds
    this.map.fitBounds(this.routeLine.getBounds(), {
      padding: [40, 40]
    });

    // Layer group for photo stops
    this.photoGroup = L.layerGroup().addTo(this.map);
  }

  panTo(lat, lon, animate = true) {
    if (this.map) {
      this.map.panTo([lat, lon], {
        animate: animate,
        duration: 0.1
      });
    }
  }

  addMarker(marker, isPhotoGroup = true) {
    if (isPhotoGroup && this.photoGroup) {
      marker.addTo(this.photoGroup);
    } else if (this.map) {
      marker.addTo(this.map);
    }
  }

  removeMarker(marker, isPhotoGroup = true) {
    if (isPhotoGroup && this.photoGroup) {
      this.photoGroup.removeLayer(marker);
    } else if (this.map) {
      this.map.removeLayer(marker);
    }
  }
}

window.MapEngine = new MapEngine();
