window.AppConfig = {
  features: {
    playthrough: true,
    elevation: true,
    slideshow: true,
    gallery: true,
    privacy: true,
    video_export: true,
    three_d_playthrough: true
  },
  autoplayPhotos: true,
  defaultSpeed: 200,
  photoPauseDuration: 5.0, // seconds to pause when showing a photo cluster
  baseBikeSpeedKmh: 14.5, // average bike speed in km/h
  privacy: {
    enabled: true,
    startRadiusMeters: 800,
    endRadiusMeters: 500,
    joinRoute: false
  },
  three_d: {
    defaultPitch: 55, // degrees
    chaseCam: true,    // auto-rotate to match path direction
    autoOrbit: true    // spin at photo pauses
  }
};

