/**
 * AERORES-AI Main Application Orchestrator
 * Three.js WebGL Rendering Pipeline, Camera Management, Tour Mode & Event Dispatcher
 * Team Pegasus - SIH 2026
 */

class App {
  constructor() {
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.pipCamera = null;
    this.pipRenderer = null;

    this.drone = null;
    this.environment = null;
    this.weather = null;
    this.sensors = null;
    this.navigator = null;
    this.gcs = null;
    this.gisMap = null;

    this.cameraMode = 'FOLLOW'; // 'FOLLOW', 'FPV', 'TOPDOWN', 'ORBIT'
    this.clock = new THREE.Clock();

    this.orbitAngle = 0;
    this.tourActive = false;
    this.tourStep = 0;
    this.tourTimer = null;

    this.init();
  }

  init() {
    this.initThree();
    this.initSubsystems();
    this.initUI();
    this.animate();
  }

  initThree() {
    const container = document.getElementById('three-canvas-container');
    const width = container.clientWidth || window.innerWidth * 0.7;
    const height = container.clientHeight || window.innerHeight;

    // 1. Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x040814);
    this.scene.fog = new THREE.FogExp2(0x060c1d, 0.012);

    // 2. Primary Camera
    this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 400);
    this.camera.position.set(0, 18, 32);

    // 3. Main WebGL Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.id = 'webgl-canvas';
    container.appendChild(this.renderer.domElement);

    // 4. PIP Secondary Camera & Renderer
    const pipCanvas = document.getElementById('pip-canvas');
    if (pipCanvas) {
      this.pipCamera = new THREE.PerspectiveCamera(70, pipCanvas.clientWidth / pipCanvas.clientHeight, 0.1, 200);
      this.pipRenderer = new THREE.WebGLRenderer({ canvas: pipCanvas, antialias: true });
      this.pipRenderer.setSize(pipCanvas.clientWidth, pipCanvas.clientHeight);
    }

    // 5. Lighting
    this.ambientLight = new THREE.AmbientLight(0x2a3b5c, 1.2);
    this.scene.add(this.ambientLight);

    this.sunLight = new THREE.DirectionalLight(0x93c5fd, 1.6);
    this.sunLight.position.set(40, 60, 30);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
    this.sunLight.shadow.camera.near = 10;
    this.sunLight.shadow.camera.far = 150;
    const d = 45;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.scene.add(this.sunLight);

    // Subtle blue horizon light
    this.hemiLight = new THREE.HemisphereLight(0x38bdf8, 0x0f172a, 0.6);
    this.scene.add(this.hemiLight);

    this.isNightMode = false;

    // Resize handler
    window.addEventListener('resize', () => this.onWindowResize());
  }

  initSubsystems() {
    // 1. Drone Platform
    this.drone = new DroneModel(this.scene);

    // 2. Disaster Environment
    this.environment = new DisasterEnvironment(this.scene);

    // 3. Multi-Sensor Fusion
    this.sensors = new SensorFusionEngine(this.drone, this.environment, this.camera, this.renderer);

    // 4. Autonomous Navigator
    this.navigator = new AutonomousNavigator(this.drone, this.environment);

    // 5. GCS Dashboard
    this.gcs = new TacticalGcsDashboard(this.drone, this.environment, this.sensors, this.navigator);
    window.gcs = this.gcs;

    // 6. Dynamic Environmental Weather System
    this.weather = new WeatherSystem(this.scene, this.drone, this.gcs);
    window.weather = this.weather;

    // 7. 2D Tactical GIS Map
    this.gisMap = new TacticalGisMap('gis-canvas', this.drone, this.environment, this.navigator);

    // Auto-takeoff on startup to immediately engage judges
    setTimeout(() => {
      this.drone.takeoff(14);
    }, 800);
  }

  initUI() {
    // Sensor Mode Buttons
    const modeButtons = document.querySelectorAll('.mode-btn');
    modeButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        modeButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const mode = btn.dataset.mode;
        this.sensors.setSensorMode(mode);
      });
    });

    // Camera Mode Buttons
    const camButtons = document.querySelectorAll('.cam-btn');
    camButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        camButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.cameraMode = btn.dataset.cam;
      });
    });

    // Navigation Flight Mode Buttons
    const navButtons = document.querySelectorAll('.nav-mode-btn');
    navButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        navButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const mode = btn.dataset.nav;
        this.navigator.setNavMode(mode);
      });
    });

    // Scenario Selector
    const scenarioSelect = document.getElementById('select-scenario');
    if (scenarioSelect) {
      scenarioSelect.addEventListener('change', (e) => {
        const scenario = e.target.value;
        this.environment.buildScenario(scenario);
        this.navigator.setNavMode('SPIRAL');
        this.gisMap.trail = [];
        this.sensors.pointHistory = [];
        if (this.gcs) this.gcs.updateTriageTable();
      });
    }

    // Day / Night Mode Toggle
    const btnDayNight = document.getElementById('btn-day-night');
    if (btnDayNight) {
      btnDayNight.addEventListener('click', () => this.toggleDayNightMode());
    }

    // Dynamic Weather Selector
    const weatherSelect = document.getElementById('select-weather');
    if (weatherSelect) {
      weatherSelect.addEventListener('change', (e) => {
        if (this.weather) this.weather.setWeather(e.target.value);
      });
    }

    // Emergency Takeoff / Land Toggle
    const btnTakeoffLand = document.getElementById('btn-takeoff-land');
    if (btnTakeoffLand) {
      btnTakeoffLand.addEventListener('click', () => {
        if (this.drone.telemetry.isFlying) {
          this.drone.land();
          btnTakeoffLand.textContent = '🛫 Takeoff';
          btnTakeoffLand.classList.remove('btn-alert');
        } else {
          this.drone.takeoff(14);
          btnTakeoffLand.textContent = '🛬 Land';
          btnTakeoffLand.classList.add('btn-alert');
        }
      });
    }

    // Emergency RTH
    const btnRth = document.getElementById('btn-rth');
    if (btnRth) {
      btnRth.addEventListener('click', () => {
        this.navigator.returnToHome();
      });
    }

    // Tab switcher in GCS
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabPanes = document.querySelectorAll('.tab-pane');
    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        tabBtns.forEach(b => b.classList.remove('active'));
        tabPanes.forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        const target = btn.dataset.tab;
        document.getElementById(`tab-${target}`).classList.add('active');
        if (target === 'map') {
          setTimeout(() => this.gisMap.initCanvasSize(), 50);
        }
      });
    });

    // Architecture Modal
    const btnArch = document.getElementById('btn-show-arch');
    const archModal = document.getElementById('arch-modal');
    if (btnArch && archModal) {
      btnArch.addEventListener('click', () => archModal.classList.add('active'));
      const closeBtn = archModal.querySelector('.modal-close');
      if (closeBtn) closeBtn.addEventListener('click', () => archModal.classList.remove('active'));
    }

    // GPS Disaster Sector Modal & Mission Upload
    const btnOpenGps = document.getElementById('btn-open-gps-modal');
    const gpsModal = document.getElementById('gps-modal');
    const btnCloseGps = document.getElementById('btn-close-gps-modal');
    const btnCancelGps = document.getElementById('btn-cancel-gps-modal');
    const btnSubmitGps = document.getElementById('btn-submit-gps-upload');

    const openGps = () => gpsModal && gpsModal.classList.add('active');
    const closeGps = () => gpsModal && gpsModal.classList.remove('active');

    if (btnOpenGps) btnOpenGps.addEventListener('click', openGps);
    if (btnCloseGps) btnCloseGps.addEventListener('click', closeGps);
    if (btnCancelGps) btnCancelGps.addEventListener('click', closeGps);

    // Preset Buttons in GPS Modal
    const presetGpsBtns = document.querySelectorAll('.preset-gps-btn');
    presetGpsBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const lat = parseFloat(btn.dataset.lat);
        const lng = parseFloat(btn.dataset.lng);
        const w = parseFloat(btn.dataset.w);
        const l = parseFloat(btn.dataset.l);
        const alt = parseFloat(btn.dataset.alt);
        const name = btn.dataset.name;

        document.getElementById('input-gps-lat').value = lat.toFixed(6);
        document.getElementById('input-gps-lng').value = lng.toFixed(6);
        document.getElementById('input-gps-w').value = w;
        document.getElementById('input-gps-l').value = l;
        document.getElementById('input-gps-alt').value = alt;

        // Auto upload to UAV
        this.navigator.feedGpsTargetArea({
          centerLat: lat,
          centerLng: lng,
          widthMeters: w,
          lengthMeters: l,
          altitude: alt,
          sectorName: name
        });
        closeGps();
      });
    });

    // Submit Custom GPS Coordinates
    if (btnSubmitGps) {
      btnSubmitGps.addEventListener('click', () => {
        const lat = parseFloat(document.getElementById('input-gps-lat').value) || 26.144500;
        const lng = parseFloat(document.getElementById('input-gps-lng').value) || 91.736200;
        const w = parseFloat(document.getElementById('input-gps-w').value) || 50;
        const l = parseFloat(document.getElementById('input-gps-l').value) || 50;
        const alt = parseFloat(document.getElementById('input-gps-alt').value) || 14;
        const spacing = parseFloat(document.getElementById('input-gps-spacing').value) || 9;

        this.navigator.feedGpsTargetArea({
          centerLat: lat,
          centerLng: lng,
          widthMeters: w,
          lengthMeters: l,
          altitude: alt,
          laneSpacing: spacing,
          sectorName: `FED GPS SECTOR (${lat.toFixed(4)}°N)`
        });
        closeGps();
      });
    }

    // File Upload Handler (KML, Waypoints, JSON)
    const fileInput = document.getElementById('input-gps-file');
    const fileNameDisplay = document.getElementById('gps-file-name');
    if (fileInput) {
      fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (fileNameDisplay) fileNameDisplay.textContent = `✓ ${file.name} loaded`;

        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            let lat = 26.145200;
            let lng = 91.737100;
            if (file.name.endsWith('.json')) {
              const data = JSON.parse(event.target.result);
              if (data.lat) lat = data.lat;
              if (data.lng) lng = data.lng;
            }
            document.getElementById('input-gps-lat').value = lat.toFixed(6);
            document.getElementById('input-gps-lng').value = lng.toFixed(6);
            this.navigator.feedGpsTargetArea({
              centerLat: lat,
              centerLng: lng,
              widthMeters: 55,
              lengthMeters: 55,
              sectorName: `FILE: ${file.name}`
            });
            setTimeout(closeGps, 600);
          } catch (err) {
            console.warn('File parse error', err);
          }
        };
        reader.readAsText(file);
      });
    }

    // SIH Presentation Tour Mode
    const btnTour = document.getElementById('btn-start-tour');
    if (btnTour) {
      btnTour.addEventListener('click', () => this.startJudgePresentationTour());
    }

    // PIP window click to swap
    const pipWin = document.getElementById('pip-window');
    if (pipWin) {
      pipWin.addEventListener('click', () => {
        if (this.cameraMode === 'FPV') this.cameraMode = 'FOLLOW';
        else this.cameraMode = 'FPV';
        document.querySelectorAll('.cam-btn').forEach(b => {
          b.classList.toggle('active', b.dataset.cam === this.cameraMode);
        });
      });
    }
  }

  onWindowResize() {
    const container = document.getElementById('three-canvas-container');
    if (!container) return;
    const w = container.clientWidth;
    const h = container.clientHeight;

    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);

    const pipCanvas = document.getElementById('pip-canvas');
    if (pipCanvas && this.pipCamera && this.pipRenderer) {
      this.pipCamera.aspect = pipCanvas.clientWidth / pipCanvas.clientHeight;
      this.pipCamera.updateProjectionMatrix();
      this.pipRenderer.setSize(pipCanvas.clientWidth, pipCanvas.clientHeight);
    }
  }

  updateCamera() {
    if (!this.drone || !this.drone.group) return;
    const dronePos = this.drone.group.position;
    const px = Number.isFinite(dronePos.x) ? dronePos.x : 0;
    const py = Number.isFinite(dronePos.y) ? dronePos.y : 14;
    const pz = Number.isFinite(dronePos.z) ? dronePos.z : 0;
    const yaw = Number.isFinite(this.drone.group.rotation.y) ? this.drone.group.rotation.y : 0;

    if (this.cameraMode === 'FOLLOW') {
      // Third-person smooth follow
      const offsetDist = 14;
      const offsetHeight = 6.5;
      const targetCamX = px - Math.sin(yaw) * offsetDist;
      const targetCamZ = pz - Math.cos(yaw) * offsetDist;
      const targetCamY = py + offsetHeight;

      if (Number.isFinite(targetCamX) && Number.isFinite(targetCamY) && Number.isFinite(targetCamZ)) {
        this.camera.position.lerp(new THREE.Vector3(targetCamX, targetCamY, targetCamZ), 0.08);
      }
      this.camera.lookAt(px, py + 1.0, pz);
    } else if (this.cameraMode === 'FPV') {
      // First Person Gimbal View looking forward-down
      this.camera.position.set(px, py - 0.35, pz);
      const lookDist = 25;
      const targetLook = new THREE.Vector3(
        px + Math.sin(yaw) * lookDist,
        Math.max(0, py - 12),
        pz + Math.cos(yaw) * lookDist
      );
      this.camera.lookAt(targetLook);
    } else if (this.cameraMode === 'TOPDOWN') {
      // Orthographic survey view from 45m altitude
      this.camera.position.lerp(new THREE.Vector3(px, 48, pz + 0.1), 0.1);
      this.camera.lookAt(px, 0, pz);
    } else if (this.cameraMode === 'ORBIT') {
      // Slow rotation around drone
      this.orbitAngle += 0.005;
      const r = 20;
      this.camera.position.set(
        px + Math.cos(this.orbitAngle) * r,
        py + 9,
        pz + Math.sin(this.orbitAngle) * r
      );
      this.camera.lookAt(px, py, pz);
    }

    // Inset PIP Camera follows opposite perspective (FPV if follow, or Topdown)
    if (this.pipCamera) {
      if (this.cameraMode === 'FOLLOW') {
        this.pipCamera.position.set(px, py - 0.3, pz);
        this.pipCamera.lookAt(
          px + Math.sin(yaw) * 20,
          Math.max(0, py - 10),
          pz + Math.cos(yaw) * 20
        );
      } else {
        this.pipCamera.position.set(px, 40, pz + 0.1);
        this.pipCamera.lookAt(px, 0, pz);
      }
    }
  }

  startJudgePresentationTour() {
    if (this.tourActive) return;
    this.tourActive = true;
    this.tourStep = 0;
    const toast = document.getElementById('tour-toast');
    const toastText = document.getElementById('tour-toast-text');

    const steps = [
      {
        text: '📍 STEP 1/6: Autonomous Takeoff & Circular Spiral Recon Search Initialized',
        action: () => {
          this.cameraMode = 'FOLLOW';
          this.sensors.setSensorMode('RGB');
          this.navigator.setNavMode('SPIRAL');
          this.drone.takeoff(15);
        },
        duration: 5000
      },
      {
        text: '🔍 STEP 2/6: Real-Time Edge AI (YOLOv8) Localizing Collapsed Rubble & Victims',
        action: () => {
          this.cameraMode = 'FPV';
          this.sensors.setSensorMode('RGB');
          this.gcs.playAlarmBeep();
        },
        duration: 6000
      },
      {
        text: '🔥 STEP 3/6: FLIR Radiometric Thermal IR Activated - Spotting Trapped Human Heat Signatures (37.1°C)',
        action: () => {
          this.sensors.setSensorMode('THERMAL');
          this.gcs.playAlarmBeep();
        },
        duration: 6000
      },
      {
        text: '☣️ STEP 4/6: MQ-4/7 Gas Sensor Localization - Pinpointing Methane Leak Source & Plume Radius',
        action: () => {
          this.sensors.setSensorMode('GAS');
          this.cameraMode = 'TOPDOWN';
          // Switch GCS tab to Map to show gas radius
          document.querySelector('.tab-btn[data-tab="map"]').click();
        },
        duration: 6000
      },
      {
        text: '📡 STEP 5/6: GPS-Denied Navigation Demonstration - UWB Beacon Trilateration inside Collapsed Corridor',
        action: () => {
          this.cameraMode = 'FOLLOW';
          this.sensors.setSensorMode('LIDAR');
          this.navigator.setNavMode('UWB_DENIED');
        },
        duration: 6500
      },
      {
        text: '📄 STEP 6/6: Automated NDRF SITREP Report & Triage Summary Exported for Incident Command',
        action: () => {
          this.cameraMode = 'FOLLOW';
          this.sensors.setSensorMode('RGB');
          this.gcs.generateSITREPModal();
          this.tourActive = false;
        },
        duration: 7000
      }
    ];

    const runStep = () => {
      if (this.tourStep >= steps.length) {
        toast.style.display = 'none';
        this.tourActive = false;
        return;
      }

      const current = steps[this.tourStep];
      toastText.textContent = current.text;
      toast.style.display = 'flex';
      current.action();

      this.tourStep++;
      this.tourTimer = setTimeout(runStep, current.duration);
    };

    runStep();
  }

  toggleDayNightMode(forceState = null) {
    this.isNightMode = (forceState !== null) ? forceState : !this.isNightMode;
    const btn = document.getElementById('btn-day-night');
    const toast = document.getElementById('tour-toast');
    const toastText = document.getElementById('tour-toast-text');

    if (this.isNightMode) {
      if (btn) btn.innerHTML = '🌙 Night Mode';
      this.scene.background.setHex(0x071120); // Deep moonlit indigo night sky
      if (this.scene.fog && (!this.weather || this.weather.currentMode === 'clear')) {
        this.scene.fog.color.setHex(0x071120);
        this.scene.fog.density = 0.0055; // Crisp, crystal clear night atmosphere
      }

      this.ambientLight.color.setHex(0x38527a); // Luminous cool blue ambient fill
      this.ambientLight.intensity = 0.95; // Everything clearly visible and sharp!

      this.sunLight.color.setHex(0xa5c9eb); // Directional silver moonlight
      this.sunLight.intensity = 1.35; // Sharp moonlit highlights & casting shadows

      this.hemiLight.color.setHex(0x38bdf8);
      this.hemiLight.groundColor.setHex(0x1e293b);
      this.hemiLight.intensity = 0.8;

      // Intelligent Night Mode UAV reaction: High-power Searchlight & Floodlight
      this.drone.toggleSpotlight(true);
      this.environment.setNightMode(true);

      // Display prompt
      if (toast && toastText) {
        toastText.textContent = '🌙 Lunar Night Mode: High-power searchlight active. Switch to NVG or FLIR Thermal for tactical night vision!';
        toast.style.display = 'flex';
        setTimeout(() => {
          if (!this.tourActive && toast) toast.style.display = 'none';
        }, 4500);
      }
    } else {
      if (btn) btn.innerHTML = '☀️ Day Mode';
      this.scene.background.setHex(0x0a1426);
      if (this.scene.fog && (!this.weather || this.weather.currentMode === 'clear')) {
        this.scene.fog.color.setHex(0x0a1426);
        this.scene.fog.density = 0.009;
      }

      this.ambientLight.color.setHex(0x64748b);
      this.ambientLight.intensity = 1.1;

      this.sunLight.color.setHex(0xfff7ed);
      this.sunLight.intensity = 1.8;

      this.hemiLight.color.setHex(0x38bdf8);
      this.hemiLight.groundColor.setHex(0x0f172a);
      this.hemiLight.intensity = 0.7;

      this.drone.toggleSpotlight(false);
      this.environment.setNightMode(false);
    }
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    const delta = Math.min(0.1, this.clock.getDelta());

    // 1. Update Subsystems
    try {
      if (this.drone) this.drone.update(delta);
      if (this.environment) this.environment.update(delta);
      if (this.weather && this.drone) this.weather.update(delta, this.drone.position);
      if (this.navigator) this.navigator.update(delta);
      if (this.sensors) this.sensors.update(delta);
      if (this.gcs) this.gcs.update(delta);
      if (this.gisMap) this.gisMap.update(delta);

      // 2. Camera tracking
      this.updateCamera();

      // 3. Render WebGL scene
      if (this.renderer && this.scene && this.camera) {
        this.renderer.render(this.scene, this.camera);
      }

      // 4. Render Inset PIP scene
      if (this.pipRenderer && this.pipCamera && this.scene) {
        this.pipRenderer.render(this.scene, this.pipCamera);
      }
    } catch (err) {
      console.error('Simulation loop error:', err);
    }
  }
}

// Instantiate on DOM load
window.addEventListener('DOMContentLoaded', () => {
  window.droneApp = new App();
});
