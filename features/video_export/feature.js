class VideoExportFeature {
  constructor() {
    this.stream = null;
    this.mediaRecorder = null;
    this.chunks = [];
    this.isRecording = false;
    this.recordingSpeed = 200; // Optimal speed multiplier for recording
    this.routeName = 'default_route';
  }

  onLoadData(geojsonData) {
    const routeFeature = geojsonData.features.find(
      f => f.geometry.type === 'LineString'
    );
    if (routeFeature && routeFeature.properties && routeFeature.properties.name) {
      this.routeName = routeFeature.properties.name;
    }
  }

  onInit(context) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      console.warn("[Video Export] browser does not support getDisplayMedia API.");
      return;
    }

    this.renderUI();
    this.bindEvents(context);
  }

  onTick(context) {
    if (this.isRecording) {
      const state = context.state;
      // Stop recording automatically when the bike reaches the end of the route
      if (state.currentProgressKm >= state.totalDist) {
        console.log("[Video Export] Reached route end. Stopping recording...");
        setTimeout(() => {
          this.stopRecording(state);
        }, 1000); // 1s buffer at the end of the video
      }
    }
  }

  onReset(context) {
    if (this.isRecording) {
      this.cancelRecording(context.state);
    }
  }

  renderUI() {
    const controlsPanel = document.querySelector('.controls-panel');
    if (!controlsPanel) return;

    // Create export button row
    const btnRow = document.createElement('div');
    btnRow.className = 'export-btn-row';
    btnRow.innerHTML = `
      <button class="btn export-btn" id="exportMovieBtn">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" id="movieIcon">
          <path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z"/>
        </svg>
        <span>Export Movie (WebM)</span>
      </button>
      <div id="recordingIndicator" class="recording-indicator" style="display: none;">
        <span class="red-dot"></span>
        <span>Recording Tab...</span>
      </div>
    `;

    // Insert right before stats grid or at the bottom
    const statsGrid = controlsPanel.querySelector('.stats-grid');
    if (statsGrid) {
      controlsPanel.insertBefore(btnRow, statsGrid);
    } else {
      controlsPanel.appendChild(btnRow);
    }
  }

  bindEvents(context) {
    const btn = document.getElementById('exportMovieBtn');
    if (btn) {
      btn.addEventListener('click', () => {
        if (this.isRecording) {
          this.stopRecording(context.state);
        } else {
          this.startRecording(context);
        }
      });
    }
  }

  async startRecording(context) {
    const state = context.state;
    this.chunks = [];

    try {
      console.log("[Video Export] Requesting browser tab display stream...");
      this.stream = await navigator.mediaDevices.getDisplayMedia({
        preferCurrentTab: true,
        selfBrowserSurface: "include",
        video: { 
          displaySurface: "browser",
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30 }
        },
        audio: false
      });

      // Handle stream end (user cancels sharing)
      this.stream.getVideoTracks()[0].onended = () => {
        if (this.isRecording) {
          this.cancelRecording(state);
        }
      };

      // Set recording state
      this.isRecording = true;
      document.body.classList.add('is-recording');
      
      const btn = document.getElementById('exportMovieBtn');
      const indicator = document.getElementById('recordingIndicator');
      if (btn) btn.innerHTML = `<span>Stop Recording</span>`;
      if (indicator) indicator.style.display = 'flex';

      // Setup MediaRecorder
      const options = { mimeType: 'video/webm;codecs=vp9' };
      this.mediaRecorder = new MediaRecorder(this.stream, options);
      
      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          this.chunks.push(e.data);
        }
      };

      this.mediaRecorder.onstop = () => {
        this.saveMovieFile();
      };

      // Start simulation loop at target recording speed
      state.reset();
      state.setSpeed(this.recordingSpeed);
      
      const speedSlider = document.getElementById('speedSlider');
      if (speedSlider) {
        speedSlider.value = this.recordingSpeed;
        document.getElementById('speedLabel').innerText = `${this.recordingSpeed}x`;
      }

      // Start recording and launch loop after brief delay to let UI hide config
      setTimeout(() => {
        this.mediaRecorder.start();
        window.ControlLoop.start();
      }, 500);

    } catch (err) {
      console.error("[Video Export] Failed to start stream recording:", err);
      alert("Failed to start recording. Please make sure display/tab sharing permission was granted.");
      this.resetUI();
    }
  }

  stopRecording(state) {
    if (!this.isRecording) return;

    console.log("[Video Export] Finalizing recording stream...");
    
    // Stop MediaRecorder
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }

    // Stop all stream tracks
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
    }

    window.ControlLoop.stop();
    this.isRecording = false;
    this.resetUI();
  }

  cancelRecording(state) {
    console.log("[Video Export] Recording cancelled by user.");
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
    }
    this.chunks = [];
    this.isRecording = false;
    this.resetUI();
    window.ControlLoop.stop();
  }

  resetUI() {
    document.body.classList.remove('is-recording');
    const btn = document.getElementById('exportMovieBtn');
    const indicator = document.getElementById('recordingIndicator');
    
    if (btn) {
      btn.innerHTML = `
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" id="movieIcon">
          <path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z"/>
        </svg>
        <span>Export Movie (WebM)</span>
      `;
    }
    if (indicator) indicator.style.display = 'none';
  }

  saveMovieFile() {
    if (this.chunks.length === 0) return;

    console.log("[Video Export] Packaging movie blob...");
    const blob = new Blob(this.chunks, { type: 'video/webm' });
    const url = URL.createObjectURL(blob);
    
    // Download prompt
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = `${this.routeName.toLowerCase()}_playthrough.webm`;
    document.body.appendChild(a);
    a.click();
    
    setTimeout(() => {
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    }, 100);
  }
}

// Register the feature
window.AppRegistry.register('video_export', new VideoExportFeature());
