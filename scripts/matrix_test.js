const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

// 1. Create a basic JSDOM context
const dom = new JSDOM(`
  <!DOCTYPE html>
  <html>
    <head></head>
    <body>
      <div id="map"></div>
      <div id="maplibre-container"></div>
      <div id="controlsContainer"></div>
      <div id="galleryContainer"></div>
      <div id="slideshowContainer"></div>
      <div id="elevationContainer"></div>
    </body>
  </html>
`, { runScripts: "outside-only" });

const { window } = dom;
global.window = window;
global.document = window.document;

// Mock localStorage/sessionStorage
const storageMock = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
  clear: () => {}
};
Object.defineProperty(window, 'localStorage', { value: storageMock, writable: true, configurable: true });
Object.defineProperty(window, 'sessionStorage', { value: storageMock, writable: true, configurable: true });
global.localStorage = storageMock;
global.sessionStorage = storageMock;


// 2. Mock browser APIs and map libraries
window.L = {
  map: () => ({
    setView: () => {},
    on: () => {},
    invalidateSize: () => {},
    fitBounds: () => {},
    panTo: () => {},
    removeLayer: () => {}
  }),
  circleMarker: () => {
    const marker = {
      on: () => {},
      addTo: () => marker
    };
    return marker;
  },
  marker: () => {
    const m = {
      on: () => {},
      addTo: () => m
    };
    return m;
  },
  polyline: () => {
    const poly = {
      addTo: () => poly,
      getBounds: () => ({})
    };
    return poly;
  },
  divIcon: () => {},
  control: {
    zoom: () => {
      const zoomCtrl = {
        addTo: () => zoomCtrl
      };
      return zoomCtrl;
    }
  },
  tileLayer: () => {
    const layer = {
      addTo: () => layer
    };
    return layer;
  },
  layerGroup: () => {
    const group = {
      addTo: () => group,
      removeLayer: () => group
    };
    return group;
  }
};

window.maplibregl = {
  Map: function() {
    this.on = () => {};
    this.addSource = () => {};
    this.addLayer = () => {};
    this.getBearing = () => 0;
    this.getPitch = () => 0;
    this.jumpTo = () => {};
  },
  Marker: function() {
    this.setLngLat = () => this;
    this.addTo = () => this;
  }
};

window.MediaRecorder = function() {
  this.start = () => {};
  this.stop = () => {};
  this.ondataavailable = null;
  this.onstop = null;
};
window.MediaRecorder.isTypeSupported = () => true;

// 3. Load and evaluate Core Scripts
const coreScripts = [
  'data/route_data.js',
  'config.js',
  'core/registry.js',
  'core/state.js',
  'core/map_engine.js',
  'core/control_loop.js'
];

function evalScript(filePath) {
  const content = fs.readFileSync(path.join(__dirname, '..', filePath), 'utf8');
  window.eval(content);
}

// Evaluate core
coreScripts.forEach(evalScript);

// Helper to run bootstrap sequence
function runBootstrap(featuresConfig) {
  // Reset registry and state
  window.AppRegistry.features = {};
  window.AppState.reset();

  // Set config
  window.AppConfig.features = featuresConfig;

  // Load active features
  Object.keys(featuresConfig).forEach(featureId => {
    if (featuresConfig[featureId]) {
      const featureFolder = featureId === 'three_d_playthrough' ? '3d_playthrough' : featureId;
      evalScript(`features/${featureFolder}/feature.js`);
    }
  });

  // Run the boot steps
  // Step 1: triggerLoadData
  window.AppRegistry.triggerLoadData(window.RouteGeoJSON);

  // Step 2: loadGeoJSON
  window.AppState.loadGeoJSON(window.RouteGeoJSON);

  // Step 3: initialize map
  window.MapEngine.initialize('map', window.AppState.routeCoords);

  // Step 4: triggerInit
  const context = {
    state: window.AppState,
    mapEngine: window.MapEngine,
    dt: 0
  };
  window.AppRegistry.triggerInit(context);
}

// 4. Test Matrix Configurations
const allFeatures = [
  'playthrough',
  'elevation',
  'slideshow',
  'gallery',
  'privacy',
  'video_export',
  'three_d_playthrough'
];

console.log('--- Running Config Matrix Tests ---');

// A. Core-Only Mode
try {
  const config = {};
  allFeatures.forEach(f => config[f] = false);
  runBootstrap(config);
  console.log('✅ Matrix A: Core-Only succeeded.');
} catch(e) {
  console.error('❌ Matrix A: Core-Only failed!', e);
  process.exit(1);
}

// B. Single Feature Modes
allFeatures.forEach(feature => {
  try {
    const config = {};
    allFeatures.forEach(f => config[f] = (f === feature));
    runBootstrap(config);
    console.log(`✅ Matrix B: Solo-Feature "${feature}" succeeded.`);
  } catch(e) {
    console.error(`❌ Matrix B: Solo-Feature "${feature}" failed!`, e);
    process.exit(1);
  }
});

// C. All Features Active
try {
  const config = {};
  allFeatures.forEach(f => config[f] = true);
  runBootstrap(config);
  console.log('✅ Matrix C: All Features Active succeeded.');
} catch(e) {
  console.error('❌ Matrix C: All Features Active failed!', e);
  process.exit(1);
}

// D. Random Combinations
for (let run = 1; run <= 5; run++) {
  try {
    const config = {};
    allFeatures.forEach(f => config[f] = Math.random() > 0.5);
    runBootstrap(config);
    console.log(`✅ Matrix D: Random Config Run ${run} succeeded. Config:`, JSON.stringify(config));
  } catch(e) {
    console.error(`❌ Matrix D: Random Config Run ${run} failed!`, e);
    process.exit(1);
  }
}

console.log('\n=== All Matrix Configuration Tests Passed! ===');
process.exit(0);
