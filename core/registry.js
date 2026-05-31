class Registry {
  constructor() {
    this.features = {};
  }

  register(featureId, featureObj) {
    this.features[featureId] = featureObj;
    console.log(`[Registry] Feature registered: ${featureId}`);
  }

  isFeatureEnabled(featureId) {
    const config = window.AppConfig;
    return config && config.features && config.features[featureId] === true;
  }

  triggerLoadData(geojsonData) {
    for (const [id, feature] of Object.entries(this.features)) {
      if (this.isFeatureEnabled(id) && typeof feature.onLoadData === 'function') {
        try {
          feature.onLoadData(geojsonData);
        } catch (e) {
          console.error(`Error executing onLoadData for feature ${id}:`, e);
        }
      }
    }
  }

  triggerInit(context) {
    for (const [id, feature] of Object.entries(this.features)) {
      if (this.isFeatureEnabled(id) && typeof feature.onInit === 'function') {
        try {
          feature.onInit(context);
        } catch (e) {
          console.error(`Error executing onInit for feature ${id}:`, e);
        }
      }
    }
  }

  triggerTick(context) {
    for (const [id, feature] of Object.entries(this.features)) {
      if (this.isFeatureEnabled(id) && typeof feature.onTick === 'function') {
        try {
          feature.onTick(context);
        } catch (e) {
          console.error(`Error executing onTick for feature ${id}:`, e);
        }
      }
    }
  }

  triggerSeek(context, km) {
    for (const [id, feature] of Object.entries(this.features)) {
      if (this.isFeatureEnabled(id) && typeof feature.onSeek === 'function') {
        try {
          feature.onSeek(context, km);
        } catch (e) {
          console.error(`Error executing onSeek for feature ${id}:`, e);
        }
      }
    }
  }

  triggerPlayStateChange(context, isPlaying) {
    for (const [id, feature] of Object.entries(this.features)) {
      if (this.isFeatureEnabled(id) && typeof feature.onPlayStateChange === 'function') {
        try {
          feature.onPlayStateChange(context, isPlaying);
        } catch (e) {
          console.error(`Error executing onPlayStateChange for feature ${id}:`, e);
        }
      }
    }
  }

  triggerReset(context) {
    for (const [id, feature] of Object.entries(this.features)) {
      if (this.isFeatureEnabled(id) && typeof feature.onReset === 'function') {
        try {
          feature.onReset(context);
        } catch (e) {
          console.error(`Error executing onReset for feature ${id}:`, e);
        }
      }
    }
  }
}

window.AppRegistry = new Registry();
