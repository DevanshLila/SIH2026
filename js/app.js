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
    this.sensors = null;
    this.navigator = null;
    this.gcs = null;
    this.gisMap = null;

    this.skyDome = null;
    this.skyDomeMat = null;
    this.daySkyTexture = null;
    this.nightSkyTexture = null;
    this.sunGroup = null;
    this.moonGroup = null;
    this.stars = null;
    this.cloudsGroup = null;
    this.cloudMat = null;
    this.cloudsLowerGroup = null;
    this.cloudMatLower = null;
    this.currentWeather = 'clear';
    this.skyTextures = {};
    this.sunDir = new THREE.Vector3(0.52, 0.72, 0.45).normalize();
    this.moonDir = new THREE.Vector3(-0.55, 0.68, -0.48).normalize();

    this.cameraMode = 'ISO'; // 'ISO', 'FOLLOW', 'FPV', 'TOPDOWN', 'ORBIT'
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
    this.scene.background = new THREE.Color(0x38bdf8);
    this.scene.fog = new THREE.FogExp2(0x93c5fd, 0.0032);

    // 2. Primary Camera (Elevated Isometric Survey framing the disaster zone)
    this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
    this.camera.position.set(24, 34, 38);
    this.camera.lookAt(-2, 2, -3);

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
      this.pipCamera = new THREE.PerspectiveCamera(70, pipCanvas.clientWidth / pipCanvas.clientHeight, 0.1, 1000);
      this.pipRenderer = new THREE.WebGLRenderer({ canvas: pipCanvas, antialias: true });
      this.pipRenderer.setSize(pipCanvas.clientWidth, pipCanvas.clientHeight);
    }

    // 5. Dedicated Synchronized UAV Overlay Renderer
    // Visual hierarchy requirement: UAV renders strictly ABOVE all floating detection labels
    const uavCanvas = document.getElementById('uav-overlay-canvas');
    if (uavCanvas) {
      this.uavRenderer = new THREE.WebGLRenderer({
        canvas: uavCanvas,
        alpha: true,
        antialias: true,
        powerPreference: 'high-performance'
      });
      this.uavRenderer.setSize(width, height);
      this.uavRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      this.uavRenderer.setClearColor(0x000000, 0); // Transparent background

      uavCanvas.addEventListener('webglcontextlost', (e) => {
        e.preventDefault();
        console.warn('UAV Overlay WebGL context lost. Falling back to base pass rendering.');
        this.uavRenderer = null;
      });
    }

    // 5. Lighting
    this.ambientLight = new THREE.AmbientLight(0xbfe0f7, 1.15);
    this.scene.add(this.ambientLight);

    this.sunLight = new THREE.DirectionalLight(0xfffbeb, 1.85);
    this.sunLight.position.copy(this.sunDir).multiplyScalar(150);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
    this.sunLight.shadow.camera.near = 10;
    this.sunLight.shadow.camera.far = 300;
    const d = 80;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.0005;
    this.scene.add(this.sunLight);

    // Natural blue sky-fill horizon light
    this.hemiLight = new THREE.HemisphereLight(0x38bdf8, 0x1e3a5f, 0.72);
    this.scene.add(this.hemiLight);

    // 6. Sky Dome, Celestial Objects (Sun/Moon), Stars & Clouds
    this.initSkySystem();

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

    // 3b. Real-Time Night Vision Imaging & Intensification Engine
    if (typeof NightVisionEngine !== 'undefined') {
      this.nightVisionEngine = new NightVisionEngine(this.renderer, this.scene, this.camera, this.pipRenderer, this.pipCamera, this.uavRenderer);
      if (this.sensors) {
        this.sensors.nightVisionEngine = this.nightVisionEngine;
      }
    }

    // 4. Autonomous Navigator
    this.navigator = new AutonomousNavigator(this.drone, this.environment);

    // 5. GCS Dashboard
    this.gcs = new TacticalGcsDashboard(this.drone, this.environment, this.sensors, this.navigator);
    window.gcs = this.gcs;

    // 6. 2D Tactical GIS Map
    this.gisMap = new TacticalGisMap('gis-canvas', this.drone, this.environment, this.navigator);

    // Initial scenario atmosphere & ground elevation
    this.updateAtmosphereForScenario(this.environment.currentScenario);
    if (this.environment.currentScenario === 'flash_flood') {
      this.drone.setGroundElevation(2.65);
    } else {
      this.drone.setGroundElevation(0.75);
    }

    // Save actual initial launch/spawn coordinates as HOME STATION
    this.drone.saveHomePosition();
    this.environment.createHomeStationMarker(this.drone.homePosition, this.drone.homeRotation);

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
        if (btn.id === 'btn-return-home') return; // Handled by dedicated rthHandler
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
        this.setScenario(scenario);
      });
    }

    // Dynamic Weather Conditions Selector
    const weatherSelect = document.getElementById('select-weather');
    if (weatherSelect) {
      weatherSelect.addEventListener('change', (e) => {
        const weather = e.target.value;
        this.setWeather(weather);
      });
    }

    // Dynamic Rain Intensity Selector
    const rainIntensitySelect = document.getElementById('select-rain-intensity');
    if (rainIntensitySelect) {
      rainIntensitySelect.addEventListener('change', (e) => {
        this.setRainIntensity(e.target.value);
      });
    }

    // Day / Night Mode Toggle
    const btnDayNight = document.getElementById('btn-day-night');
    if (btnDayNight) {
      btnDayNight.addEventListener('click', () => this.toggleDayNightMode());
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

    // Return to Home Buttons (Footer, Manual HUD, and GCS)
    const rthHandler = () => {
      this.navigator.returnToHome();
    };

    const btnReturnHome = document.getElementById('btn-return-home');
    if (btnReturnHome) {
      btnReturnHome.addEventListener('click', rthHandler);
    }

    const btnManualRth = document.getElementById('btn-manual-rth');
    if (btnManualRth) {
      btnManualRth.addEventListener('click', rthHandler);
    }

    const btnRth = document.getElementById('btn-rth');
    if (btnRth) {
      btnRth.addEventListener('click', rthHandler);
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

    // SIH Presentation Tour Mode
    const btnTour = document.getElementById('btn-start-tour');
    if (btnTour) {
      btnTour.addEventListener('click', () => this.startJudgePresentationTour());
    }

    // PIP window click to swap
    const pipWin = document.getElementById('pip-window');
    if (pipWin) {
      pipWin.addEventListener('click', () => {
        if (this.cameraMode === 'FPV') this.cameraMode = 'ISO';
        else if (this.cameraMode === 'ISO') this.cameraMode = 'FPV';
        else if (this.cameraMode === 'FOLLOW') this.cameraMode = 'FPV';
        else this.cameraMode = 'ISO';
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

    if (this.uavRenderer) {
      this.uavRenderer.setSize(w, h);
    }

    const pipCanvas = document.getElementById('pip-canvas');
    if (pipCanvas && this.pipCamera && this.pipRenderer) {
      this.pipCamera.aspect = pipCanvas.clientWidth / pipCanvas.clientHeight;
      this.pipCamera.updateProjectionMatrix();
      this.pipRenderer.setSize(pipCanvas.clientWidth, pipCanvas.clientHeight);
    }

    if (this.nightVisionEngine) {
      const pipW = (pipCanvas && pipCanvas.clientWidth) ? pipCanvas.clientWidth : 280;
      const pipH = (pipCanvas && pipCanvas.clientHeight) ? pipCanvas.clientHeight : 170;
      this.nightVisionEngine.handleResize(w, h, pipW, pipH);
    }
  }

  updateCamera() {
    const dronePos = this.drone.group.position;
    const yaw = this.drone.group.rotation.y;

    if (this.cameraMode === 'FOLLOW') {
      // Elevated third-person smooth follow overlooking drone and disaster
      const offsetDist = 15;
      const offsetHeight = 8.0;
      const targetCamX = dronePos.x - Math.sin(yaw) * offsetDist;
      const targetCamZ = dronePos.z - Math.cos(yaw) * offsetDist;
      const targetCamY = dronePos.y + offsetHeight;

      this.camera.position.lerp(new THREE.Vector3(targetCamX, targetCamY, targetCamZ), 0.08);
      this.camera.lookAt(dronePos.x, dronePos.y + 0.5, dronePos.z);
    } else if (this.cameraMode === 'ISO') {
      // Elevated isometric survey perspective overlooking the disaster zone
      const isoDist = 34;
      const isoHeight = 30;
      const targetCamX = dronePos.x + 24;
      const targetCamY = dronePos.y + isoHeight;
      const targetCamZ = dronePos.z + isoDist;

      this.camera.position.lerp(new THREE.Vector3(targetCamX, targetCamY, targetCamZ), 0.08);
      this.camera.lookAt(dronePos.x - 2, dronePos.y + 0.5, dronePos.z - 3);
    } else if (this.cameraMode === 'FPV') {
      // First Person Gimbal View looking forward-down
      this.camera.position.set(dronePos.x, dronePos.y - 0.45, dronePos.z);
      const lookDist = 25;
      const targetLook = new THREE.Vector3(
        dronePos.x + Math.sin(yaw) * lookDist,
        Math.max(0, dronePos.y - 12),
        dronePos.z + Math.cos(yaw) * lookDist
      );
      this.camera.lookAt(targetLook);
    } else if (this.cameraMode === 'TOPDOWN') {
      // Orthographic survey view from 48m altitude
      this.camera.position.lerp(new THREE.Vector3(dronePos.x, 48, dronePos.z + 0.1), 0.1);
      this.camera.lookAt(dronePos.x, 0, dronePos.z);
    } else if (this.cameraMode === 'ORBIT') {
      // Slow rotation around drone
      this.orbitAngle += 0.005;
      const r = 24;
      this.camera.position.set(
        dronePos.x + Math.cos(this.orbitAngle) * r,
        dronePos.y + 12,
        dronePos.z + Math.sin(this.orbitAngle) * r
      );
      this.camera.lookAt(dronePos);
    }

    // Inset PIP Camera follows complementary perspective
    const pipHeaderTitle = document.getElementById('pip-header-title');
    if (this.pipCamera) {
      if (this.cameraMode === 'FOLLOW' || this.cameraMode === 'ISO') {
        const fwdDist = 22;
        this.pipCamera.position.set(dronePos.x + Math.sin(yaw) * 0.35, dronePos.y - 0.45, dronePos.z + Math.cos(yaw) * 0.35);
        this.pipCamera.lookAt(
          dronePos.x + Math.sin(yaw) * fwdDist,
          Math.max(0, dronePos.y - 8),
          dronePos.z + Math.cos(yaw) * fwdDist
        );
      } else if (this.cameraMode === 'FPV') {
        if (pipHeaderTitle) pipHeaderTitle.textContent = 'SECONDARY INSET FEED [ISOMETRIC SURVEY]';
        this.pipCamera.position.set(dronePos.x + 24, dronePos.y + 28, dronePos.z + 34);
        this.pipCamera.lookAt(dronePos.x - 2, dronePos.y + 0.5, dronePos.z - 3);
      } else {
        if (pipHeaderTitle) pipHeaderTitle.textContent = 'SECONDARY INSET FEED [TOPDOWN]';
        this.pipCamera.position.set(dronePos.x, 40, dronePos.z + 0.1);
        this.pipCamera.lookAt(dronePos.x, 0, dronePos.z);
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
        text: '📍 STEP 1/6: Autonomous Takeoff & ROS2 Lawnmower Coverage Grid Initialized',
        action: () => {
          this.cameraMode = 'FOLLOW';
          this.sensors.setSensorMode('RGB');
          this.navigator.setNavMode('GRID');
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

  setScenario(scenario) {
    this.environment.buildScenario(scenario);
    if (scenario === 'flash_flood') {
      this.drone.setGroundElevation(2.65); // Elevated NDRF launch wharf pad (surface y = 1.90m + 0.75m skids)
      this.drone.homePosition.set(0, 2.65, 0);
    } else {
      this.drone.setGroundElevation(0.75);
      this.drone.homePosition.set(0, 0.75, 0);
    }
    // Update Home Station for new scenario
    this.environment.createHomeStationMarker(this.drone.homePosition, this.drone.homeRotation);
    this.updateAtmosphereForScenario(scenario);
    this.navigator.setNavMode('GRID');
    this.gisMap.trail = [];
    if (this.sensors) {
      if (typeof this.sensors.resetLidarMap === 'function') {
        this.sensors.resetLidarMap();
      } else {
        this.sensors.pointHistory = [];
      }
      this.sensors.activeDetections = [];
      this.sensors.gasReading.ppm = 18;
      this.sensors.gasReading.peakPpm = 18;
      this.sensors.gasReading.type = 'BASELINE ATMOSPHERE';
      this.sensors.gasReading.status = 'NORMAL';
      if (this.sensors.thermalEngine && this.sensors.sensorMode === 'THERMAL') {
        this.sensors.thermalEngine.onScenarioChanged();
      }
    }
    if (this.gcs) this.gcs.updateTriageTable();
  }

  setWeather(weather) {
    this.currentWeather = weather;
    const weatherSelect = document.getElementById('select-weather');
    if (weatherSelect && weatherSelect.value !== weather) {
      weatherSelect.value = weather;
    }

    const rainIntensityWrap = document.getElementById('rain-intensity-wrap');
    if (rainIntensityWrap) {
      rainIntensityWrap.style.display = (weather === 'rain') ? 'inline-flex' : 'none';
    }

    const hudWeatherBadge = document.getElementById('hud-weather-badge');
    const hudWindIndicator = document.getElementById('hud-wind-indicator');
    const hudVisIndicator = document.getElementById('hud-visibility-indicator');

    const weatherLabels = {
      clear: '☀️ CLEAR',
      cloudy: '☁️ CLOUDY',
      rain: this.rainIntensity ? `🌧️ RAIN (${this.rainIntensity.toUpperCase()})` : '🌧️ RAIN',
      windy: '💨 WINDY',
      dust: '🌪️ DUST STORM',
      snow: '❄️ SNOW'
    };
    if (hudWeatherBadge) {
      hudWeatherBadge.textContent = weatherLabels[weather] || '☀️ CLEAR';
    }

    if (hudWindIndicator) {
      const showWind = (weather === 'windy' || weather === 'dust' || weather === 'rain');
      hudWindIndicator.style.display = showWind ? 'inline-flex' : 'none';
      if (weather === 'windy') {
        hudWindIndicator.textContent = 'WIND: 18 m/s →';
      } else if (weather === 'dust') {
        hudWindIndicator.textContent = 'WIND: 22 m/s →';
      } else if (weather === 'rain') {
        hudWindIndicator.textContent = 'WIND: 10 m/s →';
      }
    }
    if (hudVisIndicator) {
      hudVisIndicator.style.display = (weather === 'dust') ? 'inline-flex' : 'none';
      hudVisIndicator.textContent = 'VISIBILITY: REDUCED';
    }

    if (this.environment) {
      this.environment.setWeather(weather);
    }
    this.updateAtmosphereForScenario(this.environment ? this.environment.currentScenario : 'earthquake');
  }

  setRainIntensity(level) {
    if (level !== 'light' && level !== 'moderate' && level !== 'heavy') return;
    this.rainIntensity = level;
    const rainSelect = document.getElementById('select-rain-intensity');
    if (rainSelect && rainSelect.value !== level) {
      rainSelect.value = level;
    }
    if (this.environment && this.environment.setRainIntensity) {
      this.environment.setRainIntensity(level);
    }
    const hudWeatherBadge = document.getElementById('hud-weather-badge');
    if (hudWeatherBadge && this.currentWeather === 'rain') {
      hudWeatherBadge.textContent = `🌧️ RAIN (${level.toUpperCase()})`;
    }
    this.updateAtmosphereForScenario(this.environment ? this.environment.currentScenario : 'earthquake');
  }

  initSkySystem() {
    // 1. Procedural High-Res Canvas Textures for all weather conditions
    this.skyTextures = {
      day_clear: this.generateSkyTexture('#0284c7', '#38bdf8', '#bae6fd', 'wisps'),
      day_cloudy: this.generateSkyTexture('#334155', '#64748b', '#94a3b8', 'overcast'),
      day_rain: this.generateSkyTexture('#1e293b', '#334155', '#475569', 'storm'),
      day_windy: this.generateSkyTexture('#0369a1', '#38bdf8', '#93c5fd', 'streaks'),
      day_dust: this.generateSkyTexture('#78350f', '#92400e', '#b45309', 'dust'),
      day_snow: this.generateSkyTexture('#475569', '#94a3b8', '#cbd5e1', 'winter'),

      night_clear: this.generateSkyTexture('#020617', '#081226', '#0f1d3a', 'night'),
      night_cloudy: this.generateSkyTexture('#050b14', '#0f172a', '#1e293b', 'night_overcast'),
      night_rain: this.generateSkyTexture('#020408', '#090e17', '#131c2e', 'night_storm'),
      night_windy: this.generateSkyTexture('#020617', '#0b1528', '#162540', 'night_windy'),
      night_dust: this.generateSkyTexture('#1a0f05', '#2c1a0a', '#3d240e', 'night_dust'),
      night_snow: this.generateSkyTexture('#060d1a', '#0f1a2e', '#1a2a44', 'night_snow')
    };

    this.daySkyTexture = this.skyTextures.day_clear;
    this.nightSkyTexture = this.skyTextures.night_clear;

    // 2. 3D Sky Dome Sphere
    const skyGeo = new THREE.SphereGeometry(600, 32, 24);
    this.skyDomeMat = new THREE.MeshBasicMaterial({
      map: this.daySkyTexture,
      side: THREE.BackSide,
      fog: false,
      depthWrite: false
    });
    this.skyDome = new THREE.Mesh(skyGeo, this.skyDomeMat);
    this.scene.add(this.skyDome);

    // 3. Subtle Twinkling Starfield (Night Mode)
    const starCount = 1200;
    const starPositions = new Float32Array(starCount * 3);
    const starColors = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const radius = 540 + Math.random() * 40;
      const theta = Math.random() * Math.PI * 2;
      const phi = 0.08 + Math.random() * (Math.PI * 0.42); // Upper dome hemisphere
      const x = radius * Math.sin(phi) * Math.cos(theta);
      const y = radius * Math.cos(phi);
      const z = radius * Math.sin(phi) * Math.sin(theta);
      starPositions[i * 3] = x;
      starPositions[i * 3 + 1] = y;
      starPositions[i * 3 + 2] = z;

      // Varied star tints (white, diamond blue, soft warm gold)
      const tint = Math.random();
      if (tint > 0.8) {
        starColors[i * 3] = 1.0; starColors[i * 3 + 1] = 0.95; starColors[i * 3 + 2] = 0.8;
      } else if (tint > 0.4) {
        starColors[i * 3] = 0.85; starColors[i * 3 + 1] = 0.92; starColors[i * 3 + 2] = 1.0;
      } else {
        starColors[i * 3] = 1.0; starColors[i * 3 + 1] = 1.0; starColors[i * 3 + 2] = 1.0;
      }
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    starGeo.setAttribute('color', new THREE.BufferAttribute(starColors, 3));
    const starMat = new THREE.PointsMaterial({
      size: 2.6,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      fog: false,
      depthWrite: false
    });
    this.stars = new THREE.Points(starGeo, starMat);
    this.stars.visible = false;
    this.scene.add(this.stars);

    // 4. Visible Sun ☀️ Mesh & Solar Corona Flare (Day Mode)
    this.sunGroup = new THREE.Group();
    const sunCore = new THREE.Mesh(
      new THREE.SphereGeometry(15, 32, 32),
      new THREE.MeshBasicMaterial({ color: 0xfffde7, fog: false })
    );
    this.sunGroup.add(sunCore);

    const coronaTex = this.generateRadialTexture([
      { offset: 0, color: 'rgba(255, 255, 255, 1)' },
      { offset: 0.2, color: 'rgba(254, 240, 138, 0.9)' },
      { offset: 0.5, color: 'rgba(251, 191, 36, 0.45)' },
      { offset: 0.8, color: 'rgba(245, 158, 11, 0.15)' },
      { offset: 1.0, color: 'rgba(245, 158, 11, 0)' }
    ]);
    const coronaMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(55, 55),
      new THREE.MeshBasicMaterial({
        map: coronaTex,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
        side: THREE.DoubleSide
      })
    );
    this.sunGroup.add(coronaMesh);

    const flareTex = this.generateFlareTexture();
    const flareMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(120, 120),
      new THREE.MeshBasicMaterial({
        map: flareTex,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
        opacity: 0.65,
        side: THREE.DoubleSide
      })
    );
    this.sunGroup.add(flareMesh);
    this.sunGroup.position.copy(this.sunDir).multiplyScalar(420);
    this.scene.add(this.sunGroup);

    // 5. Visible Moon 🌙 Mesh & Lunar Aura (Night Mode)
    this.moonGroup = new THREE.Group();
    const moonTex = this.generateMoonTexture();
    const moonCore = new THREE.Mesh(
      new THREE.SphereGeometry(14, 32, 32),
      new THREE.MeshBasicMaterial({ map: moonTex, fog: false })
    );
    this.moonGroup.add(moonCore);

    const lunarHaloTex = this.generateRadialTexture([
      { offset: 0, color: 'rgba(241, 245, 249, 0.9)' },
      { offset: 0.3, color: 'rgba(186, 230, 253, 0.55)' },
      { offset: 0.7, color: 'rgba(56, 189, 248, 0.15)' },
      { offset: 1.0, color: 'rgba(14, 165, 233, 0)' }
    ]);
    const lunarHaloMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(48, 48),
      new THREE.MeshBasicMaterial({
        map: lunarHaloTex,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
        side: THREE.DoubleSide
      })
    );
    this.moonGroup.add(lunarHaloMesh);

    const lunarAuraMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(100, 100),
      new THREE.MeshBasicMaterial({
        map: lunarHaloTex,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
        opacity: 0.45,
        side: THREE.DoubleSide
      })
    );
    this.moonGroup.add(lunarAuraMesh);
    this.moonGroup.position.copy(this.moonDir).multiplyScalar(420);
    this.moonGroup.visible = false;
    this.scene.add(this.moonGroup);

    // 6. Atmospheric Floating Cumulus Clouds
    this.cloudsGroup = new THREE.Group();
    this.cloudMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.95,
      metalness: 0.05,
      transparent: true,
      opacity: 0.82
    });

    const cloudConfigs = [
      { x: -140, y: 100, z: -120, s: 1.4 },
      { x: -60,  y: 115, z: -160, s: 1.8 },
      { x: 40,   y: 95,  z: -110, s: 1.3 },
      { x: 120,  y: 120, z: -140, s: 1.6 },
      { x: -170, y: 105, z: 20,   s: 1.5 },
      { x: -90,  y: 110, z: 90,   s: 1.7 },
      { x: 20,   y: 125, z: 130,  s: 1.4 },
      { x: 110,  y: 100, z: 80,   s: 1.8 },
      { x: 160,  y: 115, z: -20,  s: 1.5 },
      { x: -30,  y: 130, z: -40,  s: 1.2 },
      { x: 70,   y: 105, z: -60,  s: 1.5 },
      { x: -120, y: 95,  z: 140,  s: 1.3 }
    ];

    cloudConfigs.forEach(cfg => {
      const cluster = new THREE.Group();
      cluster.position.set(cfg.x, cfg.y, cfg.z);
      const puffs = 6;
      for (let p = 0; p < puffs; p++) {
        const radius = (5.5 + Math.random() * 4.5) * cfg.s;
        const puff = new THREE.Mesh(new THREE.SphereGeometry(radius, 8, 8), this.cloudMat);
        puff.position.set(
          (Math.random() - 0.5) * 16 * cfg.s,
          (Math.random() - 0.5) * 4 * cfg.s,
          (Math.random() - 0.5) * 12 * cfg.s
        );
        cluster.add(puff);
      }
      this.cloudsGroup.add(cluster);
    });
    this.scene.add(this.cloudsGroup);

    // 7. Layered Lower Stratus Clouds (Cloudy Weather)
    this.cloudsLowerGroup = new THREE.Group();
    this.cloudMatLower = new THREE.MeshStandardMaterial({
      color: 0x64748b,
      roughness: 0.95,
      metalness: 0.05,
      transparent: true,
      opacity: 0.76
    });
    const lowerCloudConfigs = [
      { x: -110, y: 55, z: -80, s: 2.0 },
      { x: -30,  y: 62, z: -110, s: 2.4 },
      { x: 60,   y: 52, z: -60, s: 1.9 },
      { x: 130,  y: 68, z: -90, s: 2.2 },
      { x: -130, y: 58, z: 40,   s: 2.1 },
      { x: -40,  y: 64, z: 80,   s: 2.3 },
      { x: 50,   y: 56, z: 90,   s: 2.0 },
      { x: 120,  y: 65, z: 50,   s: 2.5 }
    ];
    lowerCloudConfigs.forEach(cfg => {
      const cluster = new THREE.Group();
      cluster.position.set(cfg.x, cfg.y, cfg.z);
      for (let p = 0; p < 7; p++) {
        const radius = (7.5 + Math.random() * 4.5) * cfg.s;
        const puff = new THREE.Mesh(new THREE.SphereGeometry(radius, 8, 8), this.cloudMatLower);
        puff.position.set(
          (Math.random() - 0.5) * 22 * cfg.s,
          (Math.random() - 0.5) * 5 * cfg.s,
          (Math.random() - 0.5) * 16 * cfg.s
        );
        cluster.add(puff);
      }
      this.cloudsLowerGroup.add(cluster);
    });
    this.cloudsLowerGroup.visible = false;
    this.scene.add(this.cloudsLowerGroup);
  }

  generateSkyTexture(topHex, midHex, botHex, style = 'wisps') {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0.0, topHex);
    grad.addColorStop(0.42, midHex);
    grad.addColorStop(0.85, botHex);
    grad.addColorStop(1.0, botHex);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 512);

    if (style === 'wisps' || style === true) {
      const cloudWisps = [
        { x: 120, y: 360, rx: 140, ry: 25 },
        { x: 380, y: 390, rx: 160, ry: 28 },
        { x: 220, y: 430, rx: 180, ry: 30 },
        { x: 440, y: 340, rx: 110, ry: 22 }
      ];
      cloudWisps.forEach(w => {
        const cg = ctx.createRadialGradient(w.x, w.y, 0, w.x, w.y, w.rx);
        cg.addColorStop(0, 'rgba(255, 255, 255, 0.32)');
        cg.addColorStop(0.6, 'rgba(255, 255, 255, 0.12)');
        cg.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.save();
        ctx.scale(1, w.ry / w.rx);
        ctx.fillStyle = cg;
        ctx.beginPath();
        ctx.arc(w.x, w.y * (w.rx / w.ry), w.rx, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });
    } else if (style === 'overcast') {
      const overcastBands = [
        { y: 220, h: 60, col: 'rgba(203, 213, 225, 0.35)' },
        { y: 310, h: 75, col: 'rgba(148, 163, 184, 0.45)' },
        { y: 390, h: 80, col: 'rgba(100, 116, 139, 0.50)' },
        { y: 460, h: 55, col: 'rgba(71, 85, 105, 0.40)' }
      ];
      overcastBands.forEach(b => {
        const bg = ctx.createLinearGradient(0, b.y - b.h, 0, b.y + b.h);
        bg.addColorStop(0, 'rgba(148, 163, 184, 0)');
        bg.addColorStop(0.5, b.col);
        bg.addColorStop(1, 'rgba(148, 163, 184, 0)');
        ctx.fillStyle = bg;
        ctx.fillRect(0, b.y - b.h, 512, b.h * 2);
      });
    } else if (style === 'storm') {
      const stormBands = [
        { y: 200, h: 70, col: 'rgba(30, 41, 59, 0.70)' },
        { y: 320, h: 90, col: 'rgba(15, 23, 42, 0.85)' },
        { y: 420, h: 80, col: 'rgba(30, 41, 59, 0.75)' }
      ];
      stormBands.forEach(b => {
        const bg = ctx.createLinearGradient(0, b.y - b.h, 0, b.y + b.h);
        bg.addColorStop(0, 'rgba(15, 23, 42, 0)');
        bg.addColorStop(0.5, b.col);
        bg.addColorStop(1, 'rgba(15, 23, 42, 0)');
        ctx.fillStyle = bg;
        ctx.fillRect(0, b.y - b.h, 512, b.h * 2);
      });
    } else if (style === 'streaks') {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
      for (let i = 0; i < 18; i++) {
        const y = 140 + i * 18;
        ctx.lineWidth = 2 + Math.random() * 4;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.bezierCurveTo(180, y - 12, 340, y + 14, 512, y - 6);
        ctx.stroke();
      }
    } else if (style === 'dust') {
      const dustBands = [
        { y: 260, h: 90, col: 'rgba(180, 83, 9, 0.45)' },
        { y: 370, h: 100, col: 'rgba(217, 119, 6, 0.55)' },
        { y: 460, h: 70, col: 'rgba(146, 64, 14, 0.50)' }
      ];
      dustBands.forEach(b => {
        const bg = ctx.createLinearGradient(0, b.y - b.h, 0, b.y + b.h);
        bg.addColorStop(0, 'rgba(120, 53, 15, 0)');
        bg.addColorStop(0.5, b.col);
        bg.addColorStop(1, 'rgba(120, 53, 15, 0)');
        ctx.fillStyle = bg;
        ctx.fillRect(0, b.y - b.h, 512, b.h * 2);
      });
    } else if (style === 'winter') {
      const winterBands = [
        { y: 280, h: 80, col: 'rgba(241, 245, 249, 0.40)' },
        { y: 390, h: 90, col: 'rgba(203, 213, 225, 0.50)' }
      ];
      winterBands.forEach(b => {
        const bg = ctx.createLinearGradient(0, b.y - b.h, 0, b.y + b.h);
        bg.addColorStop(0, 'rgba(203, 213, 225, 0)');
        bg.addColorStop(0.5, b.col);
        bg.addColorStop(1, 'rgba(203, 213, 225, 0)');
        ctx.fillStyle = bg;
        ctx.fillRect(0, b.y - b.h, 512, b.h * 2);
      });
    } else if (style === 'night_overcast') {
      const nocBands = [
        { y: 300, h: 90, col: 'rgba(15, 23, 42, 0.75)' },
        { y: 410, h: 80, col: 'rgba(30, 41, 59, 0.65)' }
      ];
      nocBands.forEach(b => {
        const bg = ctx.createLinearGradient(0, b.y - b.h, 0, b.y + b.h);
        bg.addColorStop(0, 'rgba(2, 6, 23, 0)');
        bg.addColorStop(0.5, b.col);
        bg.addColorStop(1, 'rgba(2, 6, 23, 0)');
        ctx.fillStyle = bg;
        ctx.fillRect(0, b.y - b.h, 512, b.h * 2);
      });
    } else if (style === 'night_dust') {
      const ndBands = [
        { y: 320, h: 100, col: 'rgba(61, 36, 14, 0.75)' }
      ];
      ndBands.forEach(b => {
        const bg = ctx.createLinearGradient(0, b.y - b.h, 0, b.y + b.h);
        bg.addColorStop(0, 'rgba(26, 15, 5, 0)');
        bg.addColorStop(0.5, b.col);
        bg.addColorStop(1, 'rgba(26, 15, 5, 0)');
        ctx.fillStyle = bg;
        ctx.fillRect(0, b.y - b.h, 512, b.h * 2);
      });
    } else if (style === 'night_snow') {
      const nsBands = [
        { y: 320, h: 90, col: 'rgba(26, 42, 68, 0.60)' }
      ];
      nsBands.forEach(b => {
        const bg = ctx.createLinearGradient(0, b.y - b.h, 0, b.y + b.h);
        bg.addColorStop(0, 'rgba(6, 13, 26, 0)');
        bg.addColorStop(0.5, b.col);
        bg.addColorStop(1, 'rgba(6, 13, 26, 0)');
        ctx.fillStyle = bg;
        ctx.fillRect(0, b.y - b.h, 512, b.h * 2);
      });
    } else if (style === 'night' || style === 'night_clear') {
      const nightWisps = [
        { x: 140, y: 350, rx: 120, ry: 20 },
        { x: 360, y: 400, rx: 140, ry: 24 }
      ];
      nightWisps.forEach(w => {
        const cg = ctx.createRadialGradient(w.x, w.y, 0, w.x, w.y, w.rx);
        cg.addColorStop(0, 'rgba(30, 58, 138, 0.22)');
        cg.addColorStop(0.7, 'rgba(15, 23, 42, 0.10)');
        cg.addColorStop(1, 'rgba(2, 6, 23, 0)');
        ctx.save();
        ctx.scale(1, w.ry / w.rx);
        ctx.fillStyle = cg;
        ctx.beginPath();
        ctx.arc(w.x, w.y * (w.rx / w.ry), w.rx, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });
    } else if (style === 'night_storm') {
      const nStormBands = [
        { y: 240, h: 80, col: 'rgba(15, 23, 42, 0.85)' },
        { y: 350, h: 95, col: 'rgba(2, 6, 23, 0.92)' },
        { y: 440, h: 75, col: 'rgba(15, 23, 42, 0.80)' }
      ];
      nStormBands.forEach(b => {
        const bg = ctx.createLinearGradient(0, b.y - b.h, 0, b.y + b.h);
        bg.addColorStop(0, 'rgba(2, 6, 23, 0)');
        bg.addColorStop(0.5, b.col);
        bg.addColorStop(1, 'rgba(2, 6, 23, 0)');
        ctx.fillStyle = bg;
        ctx.fillRect(0, b.y - b.h, 512, b.h * 2);
      });
    } else if (style === 'night_windy') {
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.16)';
      for (let i = 0; i < 14; i++) {
        const y = 160 + i * 20;
        ctx.lineWidth = 1.5 + Math.random() * 2.5;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.bezierCurveTo(180, y - 10, 340, y + 12, 512, y - 4);
        ctx.stroke();
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
  }

  generateRadialTexture(stops) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    stops.forEach(s => grad.addColorStop(s.offset, s.color));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);
    return new THREE.CanvasTexture(canvas);
  }

  generateFlareTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.85)');
    grad.addColorStop(0.3, 'rgba(253, 224, 71, 0.45)');
    grad.addColorStop(0.7, 'rgba(249, 115, 22, 0.12)');
    grad.addColorStop(1, 'rgba(239, 68, 68, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);

    ctx.strokeStyle = 'rgba(254, 240, 138, 0.2)';
    ctx.lineWidth = 2;
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
      ctx.beginPath();
      ctx.moveTo(128, 128);
      ctx.lineTo(128 + Math.cos(a) * 124, 128 + Math.sin(a) * 124);
      ctx.stroke();
    }
    return new THREE.CanvasTexture(canvas);
  }

  generateMoonTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    // Base lunar disc
    ctx.fillStyle = '#f1f5f9';
    ctx.beginPath();
    ctx.arc(128, 128, 120, 0, Math.PI * 2);
    ctx.fill();

    // Lunar maria (dark basalt plains)
    ctx.fillStyle = '#94a3b8';
    const maria = [
      { x: 100, y: 90, r: 35 },
      { x: 155, y: 110, r: 42 },
      { x: 115, y: 145, r: 30 },
      { x: 80, y: 140, r: 24 },
      { x: 150, y: 165, r: 26 },
      { x: 175, y: 85, r: 20 }
    ];
    maria.forEach(m => {
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
      ctx.fill();
    });

    // Darker crater cores
    ctx.fillStyle = '#64748b';
    [
      { x: 95, y: 95, r: 16 },
      { x: 150, y: 115, r: 22 },
      { x: 120, y: 150, r: 14 }
    ].forEach(c => {
      ctx.beginPath();
      ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
      ctx.fill();
    });

    // Outer soft rim shading
    const rimGrad = ctx.createRadialGradient(128, 128, 90, 128, 128, 122);
    rimGrad.addColorStop(0, 'rgba(0,0,0,0)');
    rimGrad.addColorStop(1, 'rgba(15, 23, 42, 0.45)');
    ctx.fillStyle = rimGrad;
    ctx.beginPath();
    ctx.arc(128, 128, 120, 0, Math.PI * 2);
    ctx.fill();

    return new THREE.CanvasTexture(canvas);
  }

  updateAtmosphereForScenario(scenario) {
    const isNight = this.isNightMode;
    const weather = this.currentWeather || 'clear';
    const texKey = (isNight ? 'night_' : 'day_') + weather;

    // 1. Sky Dome Texture
    if (this.skyDomeMat && this.skyTextures && this.skyTextures[texKey]) {
      this.skyDomeMat.map = this.skyTextures[texKey];
      this.skyDomeMat.needsUpdate = true;
    } else if (this.skyDomeMat) {
      this.skyDomeMat.map = isNight ? this.nightSkyTexture : this.daySkyTexture;
      this.skyDomeMat.needsUpdate = true;
    }

    // 2. Layered Clouds & Lower Cloud Deck
    if (this.cloudsLowerGroup) {
      this.cloudsLowerGroup.visible = (weather === 'cloudy');
    }

    if (isNight) {
      // NIGHT ATMOSPHERE
      let bgHex = 0x030712;
      let fogHex = 0x050b1a;
      let fogDensity = 0.0048;
      let moonColor = 0x93c5fd;
      let moonIntensity = 0.52;
      let ambColor = 0x1e293b;
      let ambIntensity = 0.44;
      let hemiSky = 0x1e293b;
      let hemiGround = 0x020617;
      let hemiIntensity = 0.32;
      let cloudHex = 0x1e293b;
      let cloudOpacity = 0.35;
      let showMoon = true;
      let showStars = true;

      if (weather === 'cloudy') {
        bgHex = 0x070d18;
        fogHex = 0x0a101d;
        fogDensity = 0.0055;
        moonColor = 0x64748b;
        moonIntensity = 0.28;
        ambColor = 0x0f172a;
        ambIntensity = 0.36;
        cloudHex = 0x0f172a;
        cloudOpacity = 0.65;
        showStars = false;
        if (this.cloudMatLower) {
          this.cloudMatLower.color.setHex(0x0a1018);
          this.cloudMatLower.opacity = 0.70;
        }
      } else if (weather === 'rain') {
        bgHex = 0x020408;
        fogHex = 0x070c14;
        fogDensity = (this.rainIntensity === 'light') ? 0.0048 : ((this.rainIntensity === 'moderate') ? 0.0062 : 0.0072);
        moonColor = 0x8da4be;
        moonIntensity = 0.38; // Soft stormy moonlight illuminating falling rain & water
        ambColor = 0x0a1018;
        ambIntensity = 0.32;
        cloudHex = 0x070c14;
        cloudOpacity = 0.88;
        showMoon = true; // Moon visible through stormy clouds per Requirement 8
        showStars = false;
      } else if (weather === 'windy') {
        bgHex = 0x030712;
        fogHex = 0x050b1a;
        fogDensity = 0.0048;
        moonIntensity = 0.48;
        ambIntensity = 0.40;
        cloudHex = 0x1e293b;
        cloudOpacity = 0.35;
      } else if (weather === 'dust') {
        bgHex = 0x140a04;
        fogHex = 0x241407;
        fogDensity = 0.0092;
        moonColor = 0x854d1d;
        moonIntensity = 0.28;
        ambColor = 0x1a0e05;
        ambIntensity = 0.28;
        hemiSky = 0x341e0b;
        hemiGround = 0x120703;
        cloudHex = 0x1f1106;
        cloudOpacity = 0.50;
        showStars = false;
      } else if (weather === 'snow') {
        bgHex = 0x060d1a;
        fogHex = 0x0d1b2a;
        fogDensity = 0.0055;
        moonColor = 0xbae6fd;
        moonIntensity = 0.65; // Luminous moonlight on snow
        ambColor = 0x334155;
        ambIntensity = 0.52;
        hemiSky = 0x38bdf8;
        hemiGround = 0x0f172a;
        hemiIntensity = 0.38;
        cloudHex = 0x1e293b;
        cloudOpacity = 0.40;
      }

      this.scene.background.setHex(bgHex);
      if (this.scene.fog) {
        this.scene.fog.color.setHex(fogHex);
        this.scene.fog.density = fogDensity;
      }
      if (this.sunGroup) this.sunGroup.visible = false;
      if (this.moonGroup) this.moonGroup.visible = showMoon;
      if (this.stars) this.stars.visible = showStars;
      if (this.cloudMat) {
        this.cloudMat.color.setHex(cloudHex);
        this.cloudMat.opacity = cloudOpacity;
      }

      this.sunLight.position.copy(this.moonDir).multiplyScalar(150);
      this.sunLight.color.setHex(moonColor);
      this.sunLight.intensity = moonIntensity;

      this.ambientLight.color.setHex(ambColor);
      this.ambientLight.intensity = ambIntensity;

      this.hemiLight.color.setHex(hemiSky);
      this.hemiLight.groundColor.setHex(hemiGround);
      this.hemiLight.intensity = hemiIntensity;

    } else {
      // DAY ATMOSPHERE
      let bgHex = 0x38bdf8;
      let fogHex = 0x93c5fd;
      let fogDensity = 0.0020;
      let sunColor = 0xfffbeb;
      let sunIntensity = 1.85;
      let ambColor = 0xbfe0f7;
      let ambIntensity = 1.15;
      let hemiSky = 0x38bdf8;
      let hemiGround = 0x1e3a5f;
      let hemiIntensity = 0.72;
      let cloudHex = 0xffffff;
      let cloudOpacity = 0.82;
      let showSun = true;

      // Base scenario fog adjustment
      if (scenario === 'flash_flood') {
        fogHex = 0x93c5fd;
        fogDensity = 0.0028;
      } else if (scenario === 'chemical_fire') {
        fogHex = 0x7dd3fc;
        fogDensity = 0.0032;
      } else {
        fogHex = 0xb8d5e5;
        fogDensity = 0.0018;
      }

      if (weather === 'cloudy') {
        bgHex = 0x64748b;
        fogHex = 0x94a3b8;
        fogDensity = 0.0042;
        sunColor = 0xcbd5e1;
        sunIntensity = 0.75;
        ambColor = 0x94a3b8;
        ambIntensity = 1.35; // Soft diffused overcast
        hemiSky = 0x94a3b8;
        hemiGround = 0x475569;
        hemiIntensity = 0.80;
        cloudHex = 0x94a3b8;
        cloudOpacity = 0.90;
        if (this.cloudMatLower) {
          this.cloudMatLower.color.setHex(0x64748b);
          this.cloudMatLower.opacity = 0.78;
        }
      } else if (weather === 'rain') {
        bgHex = 0x243242;
        fogHex = 0x3d4d5e;
        fogDensity = (this.rainIntensity === 'light') ? 0.0038 : ((this.rainIntensity === 'moderate') ? 0.0052 : 0.0065); // Rain haze
        sunColor = 0x829bb5;
        sunIntensity = 0.35;
        ambColor = 0x5a6d80;
        ambIntensity = 0.95;
        hemiSky = 0x4d6175;
        hemiGround = 0x1e2a36;
        hemiIntensity = 0.55;
        cloudHex = 0x334455;
        cloudOpacity = 0.92;
        showSun = false;
      } else if (weather === 'windy') {
        bgHex = 0x38bdf8;
        fogHex = 0x93c5fd;
        fogDensity = 0.0020;
        sunColor = 0xfffaed;
        sunIntensity = 1.85;
        ambColor = 0xc5e2f7;
        ambIntensity = 1.15;
        hemiSky = 0x38bdf8;
        hemiGround = 0x1e3a5f;
        hemiIntensity = 0.70;
        cloudHex = 0xf1f5f9;
        cloudOpacity = 0.85;
      } else if (weather === 'dust') {
        bgHex = 0x5c320d;
        fogHex = 0x8a6336;
        fogDensity = 0.0088; // Dense dust storm haze
        sunColor = 0xdf8c28;
        sunIntensity = 1.15;
        ambColor = 0xb46b28;
        ambIntensity = 0.90;
        hemiSky = 0xa35a18;
        hemiGround = 0x3b1c04;
        hemiIntensity = 0.65;
        cloudHex = 0x7c4618;
        cloudOpacity = 0.70;
      } else if (weather === 'snow') {
        bgHex = 0x64748b;
        fogHex = 0xcfd8dc;
        fogDensity = 0.0050; // Frosty mist
        sunColor = 0xf8fafc;
        sunIntensity = 1.25;
        ambColor = 0xcbd5e1;
        ambIntensity = 1.25; // Crisp winter daylight
        hemiSky = 0xe2e8f0;
        hemiGround = 0x64748b;
        hemiIntensity = 0.75;
        cloudHex = 0xd1d5db;
        cloudOpacity = 0.90;
      }

      this.scene.background.setHex(bgHex);
      if (this.scene.fog) {
        this.scene.fog.color.setHex(fogHex);
        this.scene.fog.density = fogDensity;
      }
      if (this.sunGroup) this.sunGroup.visible = showSun;
      if (this.moonGroup) this.moonGroup.visible = false;
      if (this.stars) this.stars.visible = false;
      if (this.cloudMat) {
        this.cloudMat.color.setHex(cloudHex);
        this.cloudMat.opacity = cloudOpacity;
      }

      this.sunLight.position.copy(this.sunDir).multiplyScalar(150);
      this.sunLight.color.setHex(sunColor);
      this.sunLight.intensity = sunIntensity;

      this.ambientLight.color.setHex(ambColor);
      this.ambientLight.intensity = ambIntensity;

      this.hemiLight.color.setHex(hemiSky);
      this.hemiLight.groundColor.setHex(hemiGround);
      this.hemiLight.intensity = hemiIntensity;
    }

    // If FLIR Thermal IR mode is active, maintain radiometric FLIR dark atmosphere
    if (this.sensors && this.sensors.sensorMode === 'THERMAL' && this.sensors.thermalEngine) {
      this.sensors.thermalEngine.onAtmosphereChanged();
    }

    // Update HUD Tactical Disaster Tag
    const hudDisasterTitle = document.getElementById('hud-disaster-title');
    const hudDisasterMetric = document.getElementById('hud-disaster-metric');
    if (hudDisasterTitle && hudDisasterMetric) {
      if (scenario === 'flash_flood') {
        hudDisasterTitle.textContent = 'FLOOD & TSUNAMI SAR // BRAHMAPUTRA BASIN';
        hudDisasterMetric.textContent = 'STAGE +4.2m';
      } else if (scenario === 'chemical_fire') {
        hudDisasterTitle.textContent = 'INDUSTRIAL GAS & CHEMICAL BLAST // SECTOR 7';
        hudDisasterMetric.textContent = 'CH4 / CO TOXIC PLUME';
      } else {
        hudDisasterTitle.textContent = 'EARTHQUAKE DISASTER SIMULATION // ZONE ALPHA-4';
        hudDisasterMetric.textContent = 'M7.2 AFTERMATH';
      }
    }
  }

  setNightMode(state) {
    this.toggleDayNightMode(state);
  }

  toggleDayNightMode(forceState = null) {
    this.isNightMode = (forceState !== null) ? forceState : !this.isNightMode;
    const btn = document.getElementById('btn-day-night');
    const toast = document.getElementById('tour-toast');
    const toastText = document.getElementById('tour-toast-text');

    if (this.isNightMode) {
      if (btn) btn.innerHTML = '🌙 Night Mode';
      this.drone.toggleSpotlight(true);
      this.environment.setNightMode(true);

      // Display prompt
      if (toast && toastText) {
        toastText.textContent = '🌙 Night Mode: Use FLIR Thermal IR or NVG Mode to detect survivors through low-light darkness!';
        toast.style.display = 'flex';
        setTimeout(() => {
          if (!this.tourActive && toast) toast.style.display = 'none';
        }, 4500);
      }
    } else {
      if (btn) btn.innerHTML = '☀️ Day Mode';
      this.drone.toggleSpotlight(false);
      this.environment.setNightMode(false);
    }

    this.updateAtmosphereForScenario(this.environment.currentScenario);
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    const delta = Math.min(0.1, this.clock.getDelta());

    // 1. Update Subsystems
    this.drone.update(delta);
    this.environment.update(delta, this.camera.position, this.drone ? this.drone.position : null, this.camera);
    this.navigator.update(delta);
    this.sensors.update(delta);
    this.gcs.update(delta);
    this.gisMap.update(delta);

    // 2. Align Sky Dome & Celestial Objects with Camera
    if (this.skyDome) {
      this.skyDome.position.copy(this.camera.position);
    }
    if (this.stars && this.stars.visible) {
      this.stars.position.copy(this.camera.position);
      this.stars.material.opacity = 0.82 + Math.sin(Date.now() * 0.0025) * 0.15;
    }
    if (this.sunGroup && this.sunGroup.visible) {
      this.sunGroup.position.copy(this.camera.position).addScaledVector(this.sunDir, 420);
      this.sunGroup.quaternion.copy(this.camera.quaternion);
    }
    if (this.moonGroup && this.moonGroup.visible) {
      this.moonGroup.position.copy(this.camera.position).addScaledVector(this.moonDir, 420);
      this.moonGroup.quaternion.copy(this.camera.quaternion);
    }

    // Dynamic Cloud Movement (Synchronized with dynamic wind vector & speed)
    const isWindy = (this.currentWeather === 'windy');
    const isDust = (this.currentWeather === 'dust');
    const isRain = (this.currentWeather === 'rain');
    const cloudSpeed = (isWindy ? 3.6 : (isDust ? 2.4 : (isRain ? 1.2 : 0.35))) * delta;
    const windVecX = (this.environment && typeof this.environment.windAngle === 'number') ? Math.cos(this.environment.windAngle) : 1;
    const windVecZ = (this.environment && typeof this.environment.windAngle === 'number') ? Math.sin(this.environment.windAngle) : 0;

    if (this.cloudsGroup) {
      this.cloudsGroup.children.forEach(c => {
        c.position.x += cloudSpeed * windVecX;
        c.position.z += cloudSpeed * windVecZ * 0.35;
        if (c.position.x > 260) c.position.x = -260;
        else if (c.position.x < -260) c.position.x = 260;
      });
    }
    if (this.cloudsLowerGroup && this.cloudsLowerGroup.visible) {
      this.cloudsLowerGroup.children.forEach(c => {
        c.position.x += (isWindy ? 4.2 : 0.6) * delta * windVecX;
        c.position.z += (isWindy ? 4.2 : 0.6) * delta * windVecZ * 0.35;
        if (c.position.x > 260) c.position.x = -260;
        else if (c.position.x < -260) c.position.x = 260;
      });
    }

    // Live HUD Wind Indicator update with variable direction and speed
    const hudWind = document.getElementById('hud-wind-indicator');
    if (hudWind && (this.currentWeather === 'windy' || this.currentWeather === 'dust' || this.currentWeather === 'rain')) {
      const liveSpeed = (this.environment && this.environment.currentLiveWindSpeed)
        ? this.environment.currentLiveWindSpeed.toFixed(1)
        : (this.currentWeather === 'dust' ? '22.0' : (this.currentWeather === 'windy' ? '18.0' : '10.5'));
      const windAngleRad = (this.environment && typeof this.environment.windAngle === 'number')
        ? this.environment.windAngle
        : 0;
      const windAngleDeg = Math.round(windAngleRad * (180 / Math.PI));
      hudWind.innerHTML = `WIND: ${liveSpeed} m/s <span class="wind-arrow-icon" style="display:inline-block; transform:rotate(${windAngleDeg}deg); transition:transform 0.2s ease;">→</span>`;
    }

    // 3. Camera tracking
    this.updateCamera();

    // 4. Base WebGL Render Pass (3D Environment + Detection Markers on #webgl-canvas, z-index: 1)
    // To ensure the UAV is strictly above detection labels (z-index: 8), hide UAV elements in base pass
    // ONLY when the dedicated overlay renderer is available; otherwise gracefully fall back to base rendering.
    const isMainFPV = (this.cameraMode === 'FPV');
    const savedDroneVis = (this.drone && this.drone.group) ? this.drone.group.visible : false;
    const savedVectorVis = (this.sensors && this.sensors.movementVectorGroup) ? this.sensors.movementVectorGroup.visible : false;
    const savedTrajVis = (this.sensors && this.sensors.lidarTrajectoryLine) ? this.sensors.lidarTrajectoryLine.visible : false;
    const overlayActive = !!this.uavRenderer;

    // Update Night Vision Engine if active
    const isNVG = (this.sensors && this.sensors.sensorMode === 'NVG' && this.nightVisionEngine && this.nightVisionEngine.isActive);
    if (this.nightVisionEngine && this.nightVisionEngine.isActive) {
      const dronePos = (this.drone && this.drone.group) ? this.drone.group.position : null;
      const hazards = (this.environment && this.environment.hazards) ? this.environment.hazards : [];
      const spotlightActive = (this.drone && this.drone.spotlight) ? this.drone.spotlight.visible : false;
      this.nightVisionEngine.update(delta, dronePos, this.isNightMode, hazards, spotlightActive);
    }

    if (overlayActive || isMainFPV) {
      if (this.drone && typeof this.drone.setDroneMeshVisibility === 'function') {
        this.drone.setDroneMeshVisibility(false);
      } else if (this.drone && this.drone.group) {
        this.drone.group.visible = false;
      }
      if (this.sensors && this.sensors.movementVectorGroup) this.sensors.movementVectorGroup.visible = false;
      if (this.sensors && this.sensors.lidarTrajectoryLine) this.sensors.lidarTrajectoryLine.visible = false;
    }

    if (isNVG) {
      this.nightVisionEngine.renderMain(this.renderer, this.scene, this.camera);
    } else {
      this.renderer.render(this.scene, this.camera);
    }

    // Restore drone visibility for overlay pass / PIP inset
    if (overlayActive || isMainFPV) {
      if (savedDroneVis && this.drone && typeof this.drone.setDroneMeshVisibility === 'function') {
        this.drone.setDroneMeshVisibility(true);
      } else if (this.drone && this.drone.group) {
        this.drone.group.visible = savedDroneVis;
      }
      if (this.sensors && this.sensors.movementVectorGroup) this.sensors.movementVectorGroup.visible = savedVectorVis;
      if (this.sensors && this.sensors.lidarTrajectoryLine) this.sensors.lidarTrajectoryLine.visible = savedTrajVis;
    }

    // 5. Dedicated Synchronized UAV Overlay Render Pass (#uav-overlay-canvas, z-index: 12)
    // Renders UAV, heading indicator, movement vector & trajectory STRICTLY ABOVE detection labels (z-index: 8)
    if (this.uavRenderer) {
      if (!isMainFPV && this.drone && this.drone.group && savedDroneVis) {
        // Temporarily clear scene background and fog so overlay canvas has transparent background without fog washouts
        const savedBg = this.scene.background;
        const savedFog = this.scene.fog;
        this.scene.background = null;
        this.scene.fog = null;

        // Temporarily hide all non-UAV and non-light scene children
        const hiddenObjects = [];
        for (let i = 0; i < this.scene.children.length; i++) {
          const obj = this.scene.children[i];
          if (obj.isLight) continue;
          if (obj === this.drone.group) continue;
          if (this.sensors && (obj === this.sensors.movementVectorGroup || obj === this.sensors.lidarTrajectoryLine)) continue;
          if (obj.visible) {
            obj.visible = false;
            hiddenObjects.push(obj);
          }
        }

        try {
          if (isNVG) {
            this.nightVisionEngine.renderUav(this.uavRenderer, this.scene, this.camera);
          } else {
            this.uavRenderer.render(this.scene, this.camera);
          }
        } catch (err) {
          console.warn('UAV overlay render error:', err);
        } finally {
          // Guaranteed restoration of scene objects, background, and atmospheric fog
          for (let i = 0; i < hiddenObjects.length; i++) {
            hiddenObjects[i].visible = true;
          }
          this.scene.background = savedBg;
          this.scene.fog = savedFog;
        }
      } else {
        this.uavRenderer.clear();
      }
    }

    // 6. Render Inset PIP scene
    if (this.pipRenderer && this.pipCamera) {
      const isPipGimbal = (this.cameraMode === 'FOLLOW' || this.cameraMode === 'ISO');
      if (isPipGimbal && this.drone && this.drone.group) this.drone.group.visible = false;
      if (isNVG) {
        this.nightVisionEngine.renderPip(this.pipRenderer, this.scene, this.pipCamera);
      } else {
        this.pipRenderer.render(this.scene, this.pipCamera);
      }
      if (isPipGimbal && this.drone && this.drone.group) this.drone.group.visible = true;
    }
  }
}

// Instantiate on DOM load
window.addEventListener('DOMContentLoaded', () => {
  window.droneApp = new App();
});
