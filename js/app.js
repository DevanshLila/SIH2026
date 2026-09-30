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
        this.setScenario(scenario);
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

    const pipCanvas = document.getElementById('pip-canvas');
    if (pipCanvas && this.pipCamera && this.pipRenderer) {
      this.pipCamera.aspect = pipCanvas.clientWidth / pipCanvas.clientHeight;
      this.pipCamera.updateProjectionMatrix();
      this.pipRenderer.setSize(pipCanvas.clientWidth, pipCanvas.clientHeight);
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
    } else {
      this.drone.setGroundElevation(0.75);
    }
    this.updateAtmosphereForScenario(scenario);
    this.navigator.setNavMode('GRID');
    this.gisMap.trail = [];
    this.sensors.pointHistory = [];
    if (this.sensors) {
      this.sensors.activeDetections = [];
      this.sensors.gasReading.ppm = 18;
      this.sensors.gasReading.peakPpm = 18;
      this.sensors.gasReading.type = 'BASELINE ATMOSPHERE';
      this.sensors.gasReading.status = 'NORMAL';
    }
    if (this.gcs) this.gcs.updateTriageTable();
  }

  initSkySystem() {
    // 1. Procedural High-Res Canvas Textures
    this.daySkyTexture = this.generateSkyTexture('#0284c7', '#38bdf8', '#bae6fd', true);
    this.nightSkyTexture = this.generateSkyTexture('#020617', '#081226', '#0f1d3a', false);

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
  }

  generateSkyTexture(topHex, midHex, botHex, withClouds = false) {
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

    if (withClouds) {
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
    if (this.isNightMode) {
      // 1. Night Mode across all scenarios: Midnight dark blue sky, visible Moon, subtle stars, moonlight
      if (this.skyDomeMat && this.nightSkyTexture) {
        this.skyDomeMat.map = this.nightSkyTexture;
        this.skyDomeMat.needsUpdate = true;
      }
      this.scene.background.setHex(0x030712);
      if (this.scene.fog) {
        this.scene.fog.color.setHex(0x050b1a);
        this.scene.fog.density = 0.0048;
      }
      if (this.sunGroup) this.sunGroup.visible = false;
      if (this.moonGroup) this.moonGroup.visible = true;
      if (this.stars) this.stars.visible = true;
      if (this.cloudMat) {
        this.cloudMat.color.setHex(0x1e293b);
        this.cloudMat.opacity = 0.35;
      }

      // Moonlight direction and realistic nighttime illumination
      this.sunLight.position.copy(this.moonDir).multiplyScalar(150);
      this.sunLight.color.setHex(0x93c5fd);
      this.sunLight.intensity = 0.52;

      this.ambientLight.color.setHex(0x1e293b);
      this.ambientLight.intensity = 0.44;

      this.hemiLight.color.setHex(0x1e293b);
      this.hemiLight.groundColor.setHex(0x020617);
      this.hemiLight.intensity = 0.32;
    } else {
      // 2. Day Mode: Bright realistic blue daytime sky, visible Sun, bright natural lighting, natural shadows
      if (this.skyDomeMat && this.daySkyTexture) {
        this.skyDomeMat.map = this.daySkyTexture;
        this.skyDomeMat.needsUpdate = true;
      }
      this.scene.background.setHex(0x38bdf8);
      if (this.sunGroup) this.sunGroup.visible = true;
      if (this.moonGroup) this.moonGroup.visible = false;
      if (this.stars) this.stars.visible = false;
      if (this.cloudMat) {
        this.cloudMat.color.setHex(0xffffff);
        this.cloudMat.opacity = 0.82;
      }

      // Sunlight direction and brilliant daylight illumination
      this.sunLight.position.copy(this.sunDir).multiplyScalar(150);
      this.sunLight.color.setHex(0xfffbeb);
      this.sunLight.intensity = 1.85;

      this.ambientLight.color.setHex(0xbfe0f7);
      this.ambientLight.intensity = 1.15;

      this.hemiLight.color.setHex(0x38bdf8);
      this.hemiLight.groundColor.setHex(0x1e3a5f);
      this.hemiLight.intensity = 0.72;

      if (scenario === 'flash_flood') {
        // Bright disaster response scene with soft atmospheric blue haze
        if (this.scene.fog) {
          this.scene.fog.color.setHex(0x93c5fd);
          this.scene.fog.density = 0.0032;
        }
      } else if (scenario === 'chemical_fire') {
        if (this.scene.fog) {
          this.scene.fog.color.setHex(0x7dd3fc);
          this.scene.fog.density = 0.0038;
        }
      } else {
        // Realistic 3D Earthquake Simulation: strong daylight, cool blue/turquoise ambient shadows, subtle dust haze
        this.scene.background.setHex(0x38bdf8);
        this.sunLight.color.setHex(0xfffdf5);
        this.sunLight.intensity = 1.65;

        this.ambientLight.color.setHex(0xbfdbfe);
        this.ambientLight.intensity = 0.60;

        this.hemiLight.color.setHex(0x38bdf8);
        this.hemiLight.groundColor.setHex(0x1e3a5f);
        this.hemiLight.intensity = 0.45;

        if (this.scene.fog) {
          this.scene.fog.color.setHex(0xb8d5e5);
          this.scene.fog.density = 0.0018;
        }
      }
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
    this.environment.update(delta);
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
    if (this.cloudsGroup) {
      this.cloudsGroup.children.forEach(c => {
        c.position.x += 0.35 * delta;
        if (c.position.x > 250) c.position.x = -250;
      });
    }

    // 3. Camera tracking
    this.updateCamera();

    // 4. Render WebGL scene
    const isMainFPV = (this.cameraMode === 'FPV');
    if (isMainFPV && this.drone && this.drone.group) this.drone.group.visible = false;
    this.renderer.render(this.scene, this.camera);
    if (isMainFPV && this.drone && this.drone.group) this.drone.group.visible = true;

    // 5. Render Inset PIP scene
    if (this.pipRenderer && this.pipCamera) {
      const isPipGimbal = (this.cameraMode === 'FOLLOW' || this.cameraMode === 'ISO');
      if (isPipGimbal && this.drone && this.drone.group) this.drone.group.visible = false;
      this.pipRenderer.render(this.scene, this.pipCamera);
      if (isPipGimbal && this.drone && this.drone.group) this.drone.group.visible = true;
    }
  }
}

// Instantiate on DOM load
window.addEventListener('DOMContentLoaded', () => {
  window.droneApp = new App();
});
