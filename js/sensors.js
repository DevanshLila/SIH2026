/**
 * AERORES-AI Multi-Sensor Fusion & On-Device AI Perception Engine
 * Realistic Geometric 3D LiDAR SLAM with Progressive Environment Reconstruction,
 * Three-Zone Environment Visualization (Purple Out-of-Range, Grey Scanned Space, Cyan/Dark-Grey Reconstructed Structure),
 * Real-Time World Generation, Sensor Fusion (Optical AI + FLIR Thermal IR + Night Vision + Gas Plume),
 * UAV Estimated Trajectory Line & Dynamic Weather Degradation
 * Team Pegasus - SIH 2026
 */

class SensorFusionEngine {
  constructor(drone, environment, camera, renderer) {
    this.drone = drone;
    this.environment = environment;
    this.camera = camera;
    this.renderer = renderer;

    this.sensorMode = 'RGB'; // 'RGB', 'THERMAL', 'NVG', 'LIDAR', 'GAS'
    this.raycaster = new THREE.Raycaster();

    // AI YOLO Detections list with 3D LiDAR Sensor Fusion
    this.activeDetections = [];

    // Gas sensor state
    this.gasReading = {
      ppm: 18,
      type: 'CLEAN AIR',
      status: 'NORMAL',
      peakPpm: 18,
      gradientVector: new THREE.Vector3()
    };

    // 3D LiDAR SLAM Parameters (Requirement 1, 9, 10)
    this.lidarNominalRange = 50.0; // 50 meters nominal base detection range
    this.lidarMaxRange = 50.0;
    this.effectiveLidarRange = 50.0;
    this.lidarVerticalFov = 30.0; // -15° nadir to +15° elevation (30° total vertical FOV)
    this.lidarScanAngle = 0;
    this.lidarScanRate = 15.0; // 15.0 Hz scan frequency
    this.lidarPointsPerSec = 1280;
    this.lidarReturnsPct = 94.2;
    this.lidarScanQuality = 98;
    this.lidarNoiseLevel = 'LOW';
    this.lidarWeatherImpact = 'LOW';
    this.lidarWeatherStatus = 'OPTIMAL (50m)';
    this.lidarSlamState = 'LOCKED'; // 'LOCKED', 'INITIALIZING', 'DEGRADED'
    this.lidarVisMode = 'COMBINED'; // 'COMBINED', 'POINT_CLOUD', 'SCAN_RAYS', 'ENVIRONMENT'
    this.mappedAreaSqM = 0;
    this.slamMapPct = 0;

    // Active Laser Scan Vectors & Impact Hits (Requirement 1)
    this.maxScanRays = 72; // 8 azimuth columns x 9 elevation bands between -15° and +15°
    this.lidarScanRays = null;
    this.lidarImpactPoints = null;

    // Persistent 3D Point Cloud Buffer (SLAM Environmental Reconstruction - Requirement 4)
    this.maxPoints = 15000;
    this.lidarPointCloud = null;
    this.pointHistory = [];
    this.pointHistoryHead = 0;
    this.pointHistoryCount = 0;

    // Three-Zone Environment Visualization & SLAM Progressive Reconstruction (Requirements 2 & 3)
    this.slamDiscoveredMeshes = new Set();
    this.slamMeshHits = new Map();
    this.slamMeshLastHit = new Map();
    this.slamOriginalAtmosphere = null;

    // Shared SLAM Reconstruction Materials:
    // Bright cyan = newly detected / actively scanning surface (1-2 hits)
    this.slamActiveMaterial = new THREE.MeshStandardMaterial({
      color: 0x00f0ff,
      emissive: 0x006688,
      roughness: 0.28,
      metalness: 0.35,
      transparent: true,
      opacity: 0.95
    });

    // Cyan-blue = partially reconstructed (3-7 hits)
    this.slamPartialMaterial = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      emissive: 0x002244,
      roughness: 0.50,
      metalness: 0.40,
      transparent: true,
      opacity: 0.98
    });

    // Dark grey/black = strongly reconstructed / high-confidence SLAM geometry (8+ hits)
    this.slamConfidentMaterial = new THREE.MeshStandardMaterial({
      color: 0x181c24,
      emissive: 0x000000,
      roughness: 0.88,
      metalness: 0.20,
      transparent: false,
      opacity: 1.0
    });

    // Dynamic Ground Exploration Canvas (Three-Zone SLAM: Purple Out-of-Range vs Grey Scanned Space)
    this.groundCanvas = document.createElement('canvas');
    this.groundCanvas.width = 512;
    this.groundCanvas.height = 512;
    this.groundCtx = this.groundCanvas.getContext('2d');
    this.groundCanvasTexture = new THREE.CanvasTexture(this.groundCanvas);
    this.groundCanvasTexture.wrapS = THREE.ClampToEdgeWrapping;
    this.groundCanvasTexture.wrapT = THREE.ClampToEdgeWrapping;
    this.groundCanvasTexture.generateMipmaps = false;
    this.groundCanvasTexture.minFilter = THREE.LinearFilter;
    this.groundCanvasTexture.magFilter = THREE.LinearFilter;

    this.clearGroundExplorationCanvas();

    // Neutral grey ground with dynamic exploration map = unoccupied scanned space (Requirement 2: ⚪ GREY)
    this.slamUnoccupiedGroundMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: this.groundCanvasTexture,
      roughness: 0.90,
      metalness: 0.10
    });

    // UAV Estimated Trajectory Line (Requirement 5)
    this.maxTrajectoryPoints = 800;
    this.trajectoryPositions = new Float32Array(this.maxTrajectoryPoints * 3);
    this.trajectoryCount = 0;
    this.lidarTrajectoryLine = null;
    this.lastTrajectoryPos = new THREE.Vector3();

    // Purple Non-Detection Blind Zone (Requirement 6)
    this.lidarBlindZone = null;
    this.lidarBlindZoneLabel = null;
    this.lidarVolumeFrustum = null; // backward-compatible alias

    // Ground Concentric Range Rings & 50m Range Boundary (Requirements 1 & 2)
    this.lidarRangeRings = null;
    this.lidarSweepLine = null;
    this.lidarOuterRing = null;
    this.lidarRangeLabel = null;

    // Tactical Sensor Detection Pulse Feedback
    this.detectionPulses = [];
    this.detectionPulseGroup = null;

    // FLIR Radiometric Thermal IR Shader Engine
    this.thermalEngine = (typeof ThermalEngine !== 'undefined')
      ? new ThermalEngine(this.drone, this.environment, this.camera, this.renderer, this.drone ? this.drone.scene : null)
      : null;

    this.initLidarSystem();
  }

  createBlindZoneSprite() {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 140;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = 'rgba(16, 6, 30, 0.90)';
    ctx.fillRect(0, 0, 320, 140);

    ctx.strokeStyle = '#c084fc';
    ctx.lineWidth = 3;
    ctx.strokeRect(4, 4, 312, 132);

    ctx.fillStyle = '#f3e8ff';
    ctx.font = 'bold 22px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('LiDAR BLIND ZONE — NO DATA', 160, 48);

    ctx.fillStyle = '#e879f9';
    ctx.font = 'bold 16px "JetBrains Mono", monospace';
    ctx.fillText('PURPLE: OUT OF RANGE', 160, 88);

    ctx.fillStyle = '#a855f7';
    ctx.font = '14px "JetBrains Mono", monospace';
    ctx.fillText('NADIR EXCLUSION < -15°', 160, 118);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: 0.88,
      depthWrite: false
    });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(3.8, 1.7, 1.0);
    return sprite;
  }

  createRangeBoundarySprite() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 80;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = 'rgba(16, 6, 30, 0.88)';
    ctx.fillRect(0, 0, 256, 80);

    ctx.strokeStyle = '#c084fc';
    ctx.lineWidth = 2;
    ctx.strokeRect(3, 3, 250, 74);

    ctx.fillStyle = '#c084fc';
    ctx.font = 'bold 20px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('LiDAR RANGE: 50 m', 128, 48);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: 0.85,
      depthWrite: false
    });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.scale.set(4.2, 1.3, 1.0);
    return sprite;
  }

  clearGroundExplorationCanvas() {
    if (!this.groundCtx) return;
    // Fill entire ground with deep tactical purple (🟣 OUTSIDE LiDAR DETECTION / UNEXPLORED)
    this.groundCtx.fillStyle = '#0c051a';
    this.groundCtx.fillRect(0, 0, 512, 512);

    // Subtle tactical grid coordinate lines in out-of-range purple
    this.groundCtx.strokeStyle = 'rgba(124, 58, 237, 0.18)';
    this.groundCtx.lineWidth = 1;
    const step = 512 / 18;
    for (let p = 0; p <= 512; p += step) {
      this.groundCtx.beginPath();
      this.groundCtx.moveTo(p, 0); this.groundCtx.lineTo(p, 512); this.groundCtx.stroke();
      this.groundCtx.beginPath();
      this.groundCtx.moveTo(0, p); this.groundCtx.lineTo(512, p); this.groundCtx.stroke();
    }
    if (this.groundCanvasTexture) this.groundCanvasTexture.needsUpdate = true;
  }

  updateGroundExplorationCanvas(dronePos) {
    if (!this.groundCtx) return;
    const cx = ((dronePos.x + 90) / 180) * 512;
    const cy = ((dronePos.z + 90) / 180) * 512;
    const cr = (this.effectiveLidarRange / 180) * 512;

    // 1. Scanned empty space: neutral grey (⚪ GREY — UNOCCUPIED SCANNED SPACE)
    const grad = this.groundCtx.createRadialGradient(cx, cy, 0, cx, cy, cr);
    grad.addColorStop(0, '#2e3846');
    grad.addColorStop(0.88, '#2e3846');
    grad.addColorStop(0.97, '#242b36');
    grad.addColorStop(1.0, '#0c051a');

    this.groundCtx.fillStyle = grad;
    this.groundCtx.beginPath();
    this.groundCtx.arc(cx, cy, cr, 0, Math.PI * 2);
    this.groundCtx.fill();

    // 2. Subtle tactical grid lines in scanned territory
    this.groundCtx.save();
    this.groundCtx.beginPath();
    this.groundCtx.arc(cx, cy, cr - 1, 0, Math.PI * 2);
    this.groundCtx.clip();
    this.groundCtx.strokeStyle = 'rgba(56, 189, 248, 0.09)';
    this.groundCtx.lineWidth = 1;
    const step = 512 / 18;
    for (let p = 0; p <= 512; p += step) {
      this.groundCtx.beginPath();
      this.groundCtx.moveTo(p, 0); this.groundCtx.lineTo(p, 512); this.groundCtx.stroke();
      this.groundCtx.beginPath();
      this.groundCtx.moveTo(0, p); this.groundCtx.lineTo(512, p); this.groundCtx.stroke();
    }
    this.groundCtx.restore();

    // 3. Nadir Blind Zone footprint directly beneath drone (🟣 PURPLE — BLIND ZONE / NO DATA)
    const alt = Math.max(1.2, (this.drone.telemetry && typeof this.drone.telemetry.altitudeAGL === 'number') ? this.drone.telemetry.altitudeAGL : 14.0);
    const blindRadiusM = Math.max(1.4, Math.min(6.5, alt * 0.268));
    const cbr = (blindRadiusM / 180) * 512;

    this.groundCtx.fillStyle = '#1c0a33'; // Tactical dark purple blind footprint
    this.groundCtx.beginPath();
    this.groundCtx.arc(cx, cy, cbr, 0, Math.PI * 2);
    this.groundCtx.fill();

    // Subtle purple border ring
    this.groundCtx.strokeStyle = '#c084fc';
    this.groundCtx.lineWidth = 1.5;
    this.groundCtx.setLineDash([3, 3]);
    this.groundCtx.beginPath();
    this.groundCtx.arc(cx, cy, cbr, 0, Math.PI * 2);
    this.groundCtx.stroke();
    this.groundCtx.setLineDash([]);

    this.groundCanvasTexture.needsUpdate = true;
  }

  initLidarSystem() {
    // 1. Persistent Accumulating 3D Point Cloud Buffer (SLAM Environmental Reconstruction)
    const pointGeo = new THREE.BufferGeometry();
    const pointPositions = new Float32Array(this.maxPoints * 3);
    const pointColors = new Float32Array(this.maxPoints * 3);

    for (let i = 0; i < this.maxPoints; i++) {
      pointPositions[i * 3] = 0;
      pointPositions[i * 3 + 1] = -500; // initially hidden
      pointPositions[i * 3 + 2] = 0;

      pointColors[i * 3] = 0.0;
      pointColors[i * 3 + 1] = 0.95;
      pointColors[i * 3 + 2] = 1.0;
    }

    pointGeo.setAttribute('position', new THREE.BufferAttribute(pointPositions, 3));
    pointGeo.setAttribute('color', new THREE.BufferAttribute(pointColors, 3));

    const pointMat = new THREE.PointsMaterial({
      size: 0.40,
      vertexColors: true,
      transparent: true,
      opacity: 0.90,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });

    this.lidarPointCloud = new THREE.Points(pointGeo, pointMat);
    this.lidarPointCloud.visible = false;
    this.drone.scene.add(this.lidarPointCloud);

    // 2. Active Laser Scan Rays (Thin individual vector beams originating from LiDAR sensor)
    const rayGeo = new THREE.BufferGeometry();
    const rayPositions = new Float32Array(this.maxScanRays * 2 * 3);
    const rayColors = new Float32Array(this.maxScanRays * 2 * 3);
    for (let i = 0; i < this.maxScanRays * 2; i++) {
      rayPositions[i * 3] = 0;
      rayPositions[i * 3 + 1] = -500;
      rayPositions[i * 3 + 2] = 0;
      rayColors[i * 3] = 0.0;
      rayColors[i * 3 + 1] = 0.94;
      rayColors[i * 3 + 2] = 1.0;
    }
    rayGeo.setAttribute('position', new THREE.BufferAttribute(rayPositions, 3));
    rayGeo.setAttribute('color', new THREE.BufferAttribute(rayColors, 3));

    const rayMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    this.lidarScanRays = new THREE.LineSegments(rayGeo, rayMat);
    this.lidarScanRays.visible = false;
    this.drone.scene.add(this.lidarScanRays);

    // 3. Active Impact Hit Points (glowing detected laser reflection returns)
    const impactGeo = new THREE.BufferGeometry();
    const impactPositions = new Float32Array(this.maxScanRays * 3);
    for (let i = 0; i < this.maxScanRays; i++) {
      impactPositions[i * 3] = 0;
      impactPositions[i * 3 + 1] = -500;
      impactPositions[i * 3 + 2] = 0;
    }
    impactGeo.setAttribute('position', new THREE.BufferAttribute(impactPositions, 3));
    const impactMat = new THREE.PointsMaterial({
      size: 0.50,
      color: 0x67e8f9,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    this.lidarImpactPoints = new THREE.Points(impactGeo, impactMat);
    this.lidarImpactPoints.visible = false;
    this.drone.scene.add(this.lidarImpactPoints);

    // 4. Purple Non-Detection Blind Zone (Realistic sensor blind spot - Requirement 6)
    // Physical geometry: compact nadir exclusion beneath sensor with ground projection marker
    this.lidarBlindZone = new THREE.Group();

    // A. Compact downward sensor collar shroud directly beneath LiDAR pod
    const shroudGeo = new THREE.CylinderGeometry(0.24, 0.44, 0.5, 16, 1, true);
    const shroudMat = new THREE.MeshBasicMaterial({
      color: 0x9333ea,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const shroudMesh = new THREE.Mesh(shroudGeo, shroudMat);
    shroudMesh.position.y = -0.25;
    this.lidarBlindZone.add(shroudMesh);

    // Accent collar rings
    const ring1 = new THREE.Mesh(
      new THREE.RingGeometry(0.23, 0.26, 24),
      new THREE.MeshBasicMaterial({ color: 0xc084fc, side: THREE.DoubleSide, transparent: true, opacity: 0.65 })
    );
    ring1.rotation.x = Math.PI / 2;
    ring1.position.y = 0.0;
    this.lidarBlindZone.add(ring1);

    const ring2 = new THREE.Mesh(
      new THREE.RingGeometry(0.42, 0.46, 24),
      new THREE.MeshBasicMaterial({ color: 0xc084fc, side: THREE.DoubleSide, transparent: true, opacity: 0.65 })
    );
    ring2.rotation.x = Math.PI / 2;
    ring2.position.y = -0.5;
    this.lidarBlindZone.add(ring2);

    // B. Ground projection exclusion footprint marker directly under UAV
    this.lidarBlindZoneGround = new THREE.Group();
    const groundDiscGeo = new THREE.RingGeometry(0.0, 1.0, 32);
    const groundDiscMat = new THREE.MeshBasicMaterial({
      color: 0x7e22ce,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.28,
      depthWrite: false
    });
    const groundDisc = new THREE.Mesh(groundDiscGeo, groundDiscMat);
    groundDisc.rotation.x = -Math.PI / 2;
    this.lidarBlindZoneGround.add(groundDisc);

    const groundBorderGeo = new THREE.RingGeometry(0.96, 1.04, 32);
    const groundBorderMat = new THREE.MeshBasicMaterial({
      color: 0xc084fc,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.70,
      depthWrite: false
    });
    const groundBorder = new THREE.Mesh(groundBorderGeo, groundBorderMat);
    groundBorder.rotation.x = -Math.PI / 2;
    this.lidarBlindZoneGround.add(groundBorder);

    this.lidarBlindZone.add(this.lidarBlindZoneGround);

    // C. 4 subtle boundary guide lines connecting shroud to ground exclusion disc
    const guideGeo = new THREE.BufferGeometry();
    const guidePos = new Float32Array(4 * 2 * 3);
    guideGeo.setAttribute('position', new THREE.BufferAttribute(guidePos, 3));
    const guideMat = new THREE.LineBasicMaterial({
      color: 0xc084fc,
      transparent: true,
      opacity: 0.35,
      depthWrite: false
    });
    this.lidarBlindGuideLines = new THREE.LineSegments(guideGeo, guideMat);
    this.lidarBlindZone.add(this.lidarBlindGuideLines);

    // D. Floating tactical label in blind zone (Requirement 6)
    this.lidarBlindZoneLabel = this.createBlindZoneSprite();
    this.lidarBlindZoneLabel.position.set(0, -1.8, 0);
    this.lidarBlindZone.add(this.lidarBlindZoneLabel);

    this.lidarBlindZone.visible = false;
    this.drone.group.add(this.lidarBlindZone);

    // Backward-compatible reference
    this.lidarVolumeFrustum = this.lidarBlindZone;

    // 5. Ground Concentric Range Rings & 50m Max Range Boundary (Requirements 1 & 2)
    this.lidarRangeRings = new THREE.Group();
    const ringRadii = [15, 30, 50];
    ringRadii.forEach(r => {
      const ringGeo = new THREE.RingGeometry(r - 0.1, r + 0.1, 80);
      const ringMat = new THREE.MeshBasicMaterial({
        color: r === 50 ? 0xc084fc : (r === 30 ? 0x38bdf8 : 0x00f0ff),
        transparent: true,
        opacity: r === 50 ? 0.45 : 0.25,
        side: THREE.DoubleSide,
        depthWrite: false
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.08;
      if (r === 50) {
        this.lidarOuterRing = ring;
        this.lidarRangeLabel = this.createRangeBoundarySprite();
        this.lidarRangeLabel.position.set(0, 1.2, -r);
        this.lidarRangeRings.add(this.lidarRangeLabel);
      }
      this.lidarRangeRings.add(ring);
    });

    // 360° Rotating Radar Sweep Line on Ground Grid
    const lineGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0.10, 0),
      new THREE.Vector3(this.lidarNominalRange, 0.10, 0)
    ]);
    const lineMat = new THREE.LineBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.65 });
    this.lidarSweepLine = new THREE.Line(lineGeo, lineMat);
    this.lidarRangeRings.add(this.lidarSweepLine);

    this.lidarRangeRings.visible = false;
    this.drone.scene.add(this.lidarRangeRings);

    // 6. UAV Estimated Trajectory Line in 3D (Requirement 5)
    const trajGeo = new THREE.BufferGeometry();
    trajGeo.setAttribute('position', new THREE.BufferAttribute(this.trajectoryPositions, 3));
    trajGeo.setDrawRange(0, 0);
    const trajMat = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    this.lidarTrajectoryLine = new THREE.Line(trajGeo, trajMat);
    this.lidarTrajectoryLine.visible = false;
    this.drone.scene.add(this.lidarTrajectoryLine);

    // 7. Tactical Sensor Detection Pulse Feedback
    this.detectionPulseGroup = new THREE.Group();
    this.drone.scene.add(this.detectionPulseGroup);
  }

  update(delta) {
    // 1. Gas Sensor Reading & Plume Gradient Localization
    this.updateGasSensor();

    // 2. Realistic 3D LiDAR SLAM Scanning, Raycasting & Reconstruction
    this.updateLidarScan(delta);

    // 3. AI On-Device Vision Detection + 3D LiDAR Sensor Fusion
    this.updateVisionDetections();

    // 4. UWB Ranging Update
    this.updateUWBRanging();

    // 5. FLIR Radiometric Thermal IR Engine Update
    if (this.thermalEngine && this.thermalEngine.isActive) {
      this.thermalEngine.update(delta, this.camera);
    }
  }

  updateGasSensor() {
    const dronePos = this.drone.group.position;
    const currentPPM = this.environment.getGasConcentrationAt(dronePos);

    this.gasReading.ppm = currentPPM;
    if (currentPPM > this.gasReading.peakPpm) {
      this.gasReading.peakPpm = currentPPM;
    }

    if (currentPPM > 350) {
      this.gasReading.type = this.environment.gasPlumeEmitter ? this.environment.gasPlumeEmitter.type : 'COMBUSTIBLE GAS';
      this.gasReading.status = 'CRITICAL LEAK HAZARD';
    } else if (currentPPM > 80) {
      this.gasReading.type = 'ELEVATED TOXIC TRACE';
      this.gasReading.status = 'WARNING';
    } else {
      this.gasReading.type = 'BASELINE ATMOSPHERE';
      this.gasReading.status = 'NORMAL';
    }

    // Calculate gradient vector toward source
    if (this.environment.gasPlumeEmitter) {
      const dir = new THREE.Vector3().subVectors(this.environment.gasPlumeEmitter.position, dronePos).normalize();
      this.gasReading.gradientVector.copy(dir);
    }
  }

  setLidarEnvironmentActive(active) {
    const app = window.droneApp;
    const scene = this.drone ? this.drone.scene : null;
    if (!scene || !this.environment || !this.environment.environmentGroup) return;

    if (active) {
      // 1. Atmosphere: Dark purple void (Requirement 2: 🟣 PURPLE — OUTSIDE LiDAR DETECTION)
      if (!this.slamOriginalAtmosphere) {
        this.slamOriginalAtmosphere = {
          background: scene.background ? scene.background.clone() : new THREE.Color(0x38bdf8),
          fogColor: scene.fog ? scene.fog.color.clone() : new THREE.Color(0x93c5fd),
          fogDensity: scene.fog ? scene.fog.density : 0.0032,
          skyDomeVis: app && app.skyDome ? app.skyDome.visible : true,
          sunVis: app && app.sunGroup ? app.sunGroup.visible : true,
          moonVis: app && app.moonGroup ? app.moonGroup.visible : true,
          starsVis: app && app.stars ? app.stars.visible : true,
          cloudsVis: app && app.cloudsGroup ? app.cloudsGroup.visible : true,
          cloudsLowerVis: app && app.cloudsLowerGroup ? app.cloudsLowerGroup.visible : false
        };
      }

      scene.background = new THREE.Color(0x0c051a); // Dark tactical purple
      if (scene.fog) {
        scene.fog.color.setHex(0x16082e);
        scene.fog.density = 0.0055;
      }

      if (app) {
        if (app.skyDome) app.skyDome.visible = false;
        if (app.sunGroup) app.sunGroup.visible = false;
        if (app.moonGroup) app.moonGroup.visible = false;
        if (app.stars) app.stars.visible = false;
        if (app.cloudsGroup) app.cloudsGroup.visible = false;
        if (app.cloudsLowerGroup) app.cloudsLowerGroup.visible = false;
      }

      // 2. Real-Time World Generation (Requirement 3):
      // Neutral grey ground (scanned unoccupied space)
      // Unscanned structures: hidden until scanned by LiDAR rays
      this.environment.environmentGroup.traverse(node => {
        if (node.isMesh) {
          if (node.userData && (node.userData.isSurvivor || node.userData.isEmergencyBeacon)) return;
          let p = node.parent;
          let isSurvivor = false;
          while (p) {
            if (p.userData && (p.userData.isSurvivorGroup || p.userData.isSurvivor)) {
              isSurvivor = true;
              break;
            }
            p = p.parent;
          }
          if (isSurvivor) return;

          if (node.userData._origLidarMat === undefined) {
            node.userData._origLidarMat = node.material;
          }
          if (node.userData._origLidarVis === undefined) {
            node.userData._origLidarVis = node.visible;
          }

          const isGround = (node === this.environment.waterMesh || node === this.environment.channelMesh ||
            (node.name && node.name.toLowerCase().includes('ground')) ||
            (node.userData && node.userData.thermalType === 'road' && node.geometry && node.geometry.type === 'PlaneGeometry'));

          if (isGround) {
            node.material = this.slamUnoccupiedGroundMaterial;
            node.visible = true;
          } else {
            // Physical structure
            if (this.slamDiscoveredMeshes.has(node)) {
              const hits = this.slamMeshHits.get(node) || 0;
              node.material = (hits >= 8) ? this.slamConfidentMaterial : (hits >= 3 ? this.slamPartialMaterial : this.slamActiveMaterial);
              node.visible = (this.lidarVisMode !== 'POINT_CLOUD');
            } else {
              // Unscanned structure: hidden in purple void until LiDAR rays scan it
              node.visible = false;
            }
          }
        }
      });

      if (this.lidarTrajectoryLine) this.lidarTrajectoryLine.visible = true;

    } else {
      // Restore original atmosphere and meshes (preserve other sensor modes)
      if (this.slamOriginalAtmosphere) {
        scene.background = this.slamOriginalAtmosphere.background;
        if (scene.fog) {
          scene.fog.color.copy(this.slamOriginalAtmosphere.fogColor);
          scene.fog.density = this.slamOriginalAtmosphere.fogDensity;
        }
        if (app) {
          if (app.skyDome) app.skyDome.visible = this.slamOriginalAtmosphere.skyDomeVis;
          if (app.sunGroup) app.sunGroup.visible = this.slamOriginalAtmosphere.sunVis;
          if (app.moonGroup) app.moonGroup.visible = this.slamOriginalAtmosphere.moonVis;
          if (app.stars) app.stars.visible = this.slamOriginalAtmosphere.starsVis;
          if (app.cloudsGroup) app.cloudsGroup.visible = this.slamOriginalAtmosphere.cloudsVis;
          if (app.cloudsLowerGroup) app.cloudsLowerGroup.visible = this.slamOriginalAtmosphere.cloudsLowerVis;
        }
        this.slamOriginalAtmosphere = null;
      }

      this.environment.environmentGroup.traverse(node => {
        if (node.isMesh) {
          if (node.userData._origLidarMat !== undefined) {
            node.material = node.userData._origLidarMat;
            delete node.userData._origLidarMat;
          }
          if (node.userData._origLidarVis !== undefined) {
            node.visible = node.userData._origLidarVis;
            delete node.userData._origLidarVis;
          }
        }
      });

      if (this.lidarTrajectoryLine) this.lidarTrajectoryLine.visible = false;
    }
  }

  registerSlamStructureHit(hitObj, now, hitPoint) {
    let target = hitObj;
    const hits = (this.slamMeshHits.get(target) || 0) + 1;
    this.slamMeshHits.set(target, hits);
    this.slamMeshLastHit.set(target, now);
    this.slamDiscoveredMeshes.add(target);

    // If previously hidden in LiDAR mode, progressively reveal it
    if (!target.visible && this.lidarVisMode !== 'POINT_CLOUD') {
      target.visible = true;
    }

    // Material progression (Requirement 2):
    // Bright cyan = newly detected / actively scanning surface (1-2 hits)
    // Cyan-blue = partially reconstructed (3-7 hits)
    // Dark grey/black = strongly reconstructed / high-confidence SLAM geometry (8+ hits)
    if (this.sensorMode === 'LIDAR' && this.lidarVisMode !== 'ENVIRONMENT') {
      if (hits <= 2) {
        target.material = this.slamActiveMaterial;
      } else if (hits <= 7) {
        target.material = this.slamPartialMaterial;
      } else {
        target.material = this.slamConfidentMaterial;
      }
    }

    // Progressively reveal architectural details in the immediate scan vicinity of the hit
    if (target.parent && target.parent !== this.environment.environmentGroup && target.parent !== this.drone.scene) {
      const parentPos = target.parent.position;
      target.parent.children.forEach(sibling => {
        if (sibling.isMesh && !this.slamDiscoveredMeshes.has(sibling)) {
          let inVicinity = true;
          if (hitPoint) {
            const worldSibPos = sibling.position.clone().add(parentPos);
            inVicinity = (worldSibPos.distanceTo(hitPoint) < 5.5);
          }
          if (inVicinity) {
            if (sibling.userData._origLidarMat === undefined) {
              sibling.userData._origLidarMat = sibling.material;
            }
            sibling.visible = (this.lidarVisMode !== 'POINT_CLOUD');
            sibling.material = this.slamActiveMaterial;
            this.slamDiscoveredMeshes.add(sibling);
            this.slamMeshHits.set(sibling, 1);
            this.slamMeshLastHit.set(sibling, now);
          }
        }
      });
    }
  }

  updateLidarScan(delta) {
    const dronePos = this.drone.group.position;
    const isLidarMode = (this.sensorMode === 'LIDAR');

    // Remove old scanning cone completely (Requirement 1 & 6)
    if (this.drone && this.drone.scannerVolume) {
      this.drone.scannerVolume.visible = false;
    }

    // LiDAR visualization mode visibility switches (Requirement 10)
    if (this.lidarPointCloud) {
      this.lidarPointCloud.visible = isLidarMode && (this.lidarVisMode === 'COMBINED' || this.lidarVisMode === 'POINT_CLOUD');
    }
    if (this.lidarScanRays) {
      this.lidarScanRays.visible = isLidarMode && (this.lidarVisMode === 'COMBINED' || this.lidarVisMode === 'SCAN_RAYS');
    }
    if (this.lidarImpactPoints) {
      this.lidarImpactPoints.visible = isLidarMode && (this.lidarVisMode === 'COMBINED' || this.lidarVisMode === 'SCAN_RAYS');
    }
    if (this.lidarBlindZone) {
      this.lidarBlindZone.visible = isLidarMode && (this.lidarVisMode !== 'ENVIRONMENT');
    }
    if (this.lidarRangeRings) {
      this.lidarRangeRings.visible = isLidarMode && (this.lidarVisMode !== 'ENVIRONMENT');
    }
    if (this.lidarTrajectoryLine) {
      this.lidarTrajectoryLine.visible = isLidarMode && (this.lidarVisMode !== 'ENVIRONMENT');
    }

    const lidarPanel = document.getElementById('lidar-slam-panel');
    if (lidarPanel) {
      lidarPanel.style.display = isLidarMode ? 'block' : 'none';
    }

    // Animate active detection pulse beams
    if (this.detectionPulses.length > 0) {
      const now = Date.now();
      for (let i = this.detectionPulses.length - 1; i >= 0; i--) {
        const p = this.detectionPulses[i];
        const age = (now - p.startTime) / 1000.0;
        if (age > 1.4) {
          if (p.mesh.parent) p.mesh.parent.remove(p.mesh);
          this.detectionPulses.splice(i, 1);
        } else {
          const fade = 1.0 - (age / 1.4);
          p.ringMat.opacity = fade * 0.85;
          p.ringMesh.scale.set(1.0 + age * 2.2, 1.0 + age * 2.2, 1.0);
          p.lineMat.opacity = fade * 0.75;
        }
      }
    }

    if (!isLidarMode) return;

    // 1. Dynamic Weather Degradation & Physics (Requirement 9)
    const weather = this.environment.currentWeather || 'clear';
    let weatherNoiseFactor = 0.02;
    let falseReturnProb = 0.0;
    let registrationJitter = 0.0;

    if (weather === 'clear') {
      this.effectiveLidarRange = 50.0;
      this.lidarScanQuality = 98;
      this.lidarNoiseLevel = 'LOW';
      this.lidarWeatherImpact = 'LOW';
      this.lidarWeatherStatus = 'OPTIMAL (50m)';
      this.lidarSlamState = 'LOCKED';
      weatherNoiseFactor = 0.02;
    } else if (weather === 'rain') {
      const isHeavy = (this.environment.rainIntensity === 'heavy');
      this.effectiveLidarRange = isHeavy ? 35.0 : 42.0;
      this.lidarScanQuality = isHeavy ? 68 : 78;
      this.lidarNoiseLevel = isHeavy ? 'HIGH' : 'MODERATE';
      this.lidarWeatherImpact = isHeavy ? 'HIGH' : 'MODERATE';
      this.lidarWeatherStatus = isHeavy ? 'HEAVY RAIN (-30% RANGE)' : 'RAIN SCATTER (-16% RANGE)';
      this.lidarSlamState = isHeavy ? 'DEGRADED' : 'LOCKED';
      weatherNoiseFactor = isHeavy ? 0.09 : 0.04;
      falseReturnProb = isHeavy ? 0.05 : 0.02;
    } else if (weather === 'dust') {
      this.effectiveLidarRange = 24.0;
      this.lidarScanQuality = 54;
      this.lidarNoiseLevel = 'HIGH';
      this.lidarWeatherImpact = 'HIGH';
      this.lidarWeatherStatus = 'HEAVY DUST (-52% RANGE)';
      this.lidarSlamState = 'DEGRADED';
      weatherNoiseFactor = 0.14;
      falseReturnProb = 0.08;
    } else if (weather === 'snow') {
      this.effectiveLidarRange = 38.0;
      this.lidarScanQuality = 80;
      this.lidarNoiseLevel = 'MODERATE';
      this.lidarWeatherImpact = 'MODERATE';
      this.lidarWeatherStatus = 'SNOW SCATTER (-24% RANGE)';
      this.lidarSlamState = 'LOCKED';
      weatherNoiseFactor = 0.05;
      falseReturnProb = 0.03;
    } else if (weather === 'windy') {
      this.effectiveLidarRange = 48.0;
      this.lidarScanQuality = 89;
      this.lidarNoiseLevel = 'LOW-MOD';
      this.lidarWeatherImpact = 'MODERATE';
      this.lidarWeatherStatus = 'WIND BUFFETING // IMU COMP';
      this.lidarSlamState = 'LOCKED';
      weatherNoiseFactor = 0.03;
      registrationJitter = 0.05;
    } else {
      // clouds
      this.effectiveLidarRange = 50.0;
      this.lidarScanQuality = 97;
      this.lidarNoiseLevel = 'LOW';
      this.lidarWeatherImpact = 'LOW';
      this.lidarWeatherStatus = 'NOMINAL (50m)';
      this.lidarSlamState = 'LOCKED';
      weatherNoiseFactor = 0.02;
    }

    // 2. Sample UAV Estimated Trajectory Line (Requirement 5)
    if (this.lidarTrajectoryLine && this.lidarTrajectoryLine.geometry) {
      if (this.trajectoryCount === 0 || this.lastTrajectoryPos.distanceTo(dronePos) > 0.35) {
        if (this.trajectoryCount < this.maxTrajectoryPoints) {
          const idx = this.trajectoryCount * 3;
          this.trajectoryPositions[idx] = dronePos.x;
          this.trajectoryPositions[idx + 1] = dronePos.y - 0.2;
          this.trajectoryPositions[idx + 2] = dronePos.z;
          this.trajectoryCount++;
        } else {
          // Circular roll
          for (let i = 0; i < (this.maxTrajectoryPoints - 1) * 3; i++) {
            this.trajectoryPositions[i] = this.trajectoryPositions[i + 3];
          }
          const lastIdx = (this.maxTrajectoryPoints - 1) * 3;
          this.trajectoryPositions[lastIdx] = dronePos.x;
          this.trajectoryPositions[lastIdx + 1] = dronePos.y - 0.2;
          this.trajectoryPositions[lastIdx + 2] = dronePos.z;
        }
        this.lastTrajectoryPos.copy(dronePos);
        this.lidarTrajectoryLine.geometry.setDrawRange(0, this.trajectoryCount);
        this.lidarTrajectoryLine.geometry.attributes.position.needsUpdate = true;
      }
    }

    // 3. Advance Sweep Angle (360° Continuous Horizontal Rotating Laser Fan)
    this.lidarScanAngle = (this.lidarScanAngle + 4.8 * delta) % (Math.PI * 2);

    // Update Ground Range Rings Position & Dynamic 50m Scale
    this.lidarRangeRings.position.set(dronePos.x, 0.05, dronePos.z);
    if (this.lidarSweepLine) {
      this.lidarSweepLine.rotation.y = this.lidarScanAngle;
      const rangeRatio = this.effectiveLidarRange / 50.0;
      this.lidarSweepLine.scale.set(rangeRatio, 1.0, 1.0);
    }
    if (this.lidarOuterRing) {
      const rangeRatio = this.effectiveLidarRange / 50.0;
      this.lidarOuterRing.scale.set(rangeRatio, rangeRatio, 1.0);
    }
    if (this.lidarRangeLabel) {
      this.lidarRangeLabel.position.set(0, 1.2, -this.effectiveLidarRange);
    }

    // Update Ground Exploration Canvas with Three-Zone Visualization (scanned grey space & purple blind footprint)
    this.updateGroundExplorationCanvas(dronePos);

    // Update Purple Blind Zone Geometry dynamically to altitude AGL (Requirement 6)
    const alt = Math.max(1.2, (this.drone.telemetry && typeof this.drone.telemetry.altitudeAGL === 'number') ? this.drone.telemetry.altitudeAGL : 14.0);
    const blindRadius = Math.max(1.4, Math.min(6.5, alt * 0.268));
    if (this.lidarBlindZoneGround) {
      this.lidarBlindZoneGround.position.y = -alt + 0.08;
      this.lidarBlindZoneGround.scale.set(blindRadius, 1.0, blindRadius);
    }
    if (this.lidarBlindGuideLines && this.lidarBlindGuideLines.geometry) {
      const gPos = this.lidarBlindGuideLines.geometry.attributes.position.array;
      const angles = [0, Math.PI / 2, Math.PI, Math.PI * 1.5];
      for (let a = 0; a < 4; a++) {
        const cos = Math.cos(angles[a]);
        const sin = Math.sin(angles[a]);
        gPos[a * 6]     = cos * 0.44;
        gPos[a * 6 + 1] = -0.5;
        gPos[a * 6 + 2] = sin * 0.44;
        gPos[a * 6 + 3] = cos * blindRadius;
        gPos[a * 6 + 4] = -alt + 0.08;
        gPos[a * 6 + 5] = sin * blindRadius;
      }
      this.lidarBlindGuideLines.geometry.attributes.position.needsUpdate = true;
    }

    // 4. Realistic 3D LiDAR Raycasting & Surface Sample Generation (Requirement 1 & 4)
    const colliders = this.environment.obstacleColliders || [];
    const origin = dronePos.clone().add(new THREE.Vector3(0, -0.45, 0));
    if (registrationJitter > 0) {
      origin.x += (Math.sin(Date.now() * 0.015) - 0.5) * registrationJitter;
      origin.z += (Math.cos(Date.now() * 0.018) - 0.5) * registrationJitter;
    }

    // Enable visible = true temporarily on obstacle colliders so raycaster can intersect physical geometry
    for (let c = 0; c < colliders.length; c++) {
      colliders[c].visible = true;
    }

    const rayPositions = this.lidarScanRays.geometry.attributes.position.array;
    const rayColors = this.lidarScanRays.geometry.attributes.color.array;
    const impactPositions = this.lidarImpactPoints.geometry.attributes.position.array;

    // Multi-beam sweeping laser curtain:
    // 8 azimuth columns x 9 vertical elevation channels spanning exactly -15° to +15° (Requirement 1 & 10)
    const sweepWedge = Math.PI * 0.16;
    const elevMin = -15 * Math.PI / 180; // -0.2618 rad (-15°)
    const elevMax = 15 * Math.PI / 180;  // +0.2618 rad (+15°)
    const elevRows = 9;
    const azCols = 8;

    const now = Date.now();
    const isFlood = (this.environment.currentScenario === 'flash_flood');
    let totalHitCount = 0;

    for (let r = 0; r < this.maxScanRays; r++) {
      const azCol = Math.floor(r / elevRows);
      const elevRow = r % elevRows;
      const az = this.lidarScanAngle + (azCol / azCols) * sweepWedge;
      const elev = elevMin + (elevRow / (elevRows - 1)) * (elevMax - elevMin);

      // Physical Ray Direction (Spherical coordinates within -15° to +15° FOV)
      const dir = new THREE.Vector3(
        Math.cos(az) * Math.cos(elev),
        Math.sin(elev),
        Math.sin(az) * Math.cos(elev)
      ).normalize();

      // Nadir Blind Zone Exclusion: downward angles steeper than -15° are excluded
      if (dir.y < -0.85) {
        rayPositions[r * 6 + 1] = -500;
        rayPositions[r * 6 + 4] = -500;
        impactPositions[r * 3 + 1] = -500;
        continue;
      }

      this.raycaster.set(origin, dir);
      this.raycaster.near = 0.3;
      this.raycaster.far = this.effectiveLidarRange;

      let rayEnd = null;
      let isHit = false;
      let hitDist = this.effectiveLidarRange;
      let isSurvivorHit = false;

      if (colliders.length > 0) {
        const intersects = this.raycaster.intersectObjects(colliders, false);
        if (intersects.length > 0) {
          const hit = intersects[0];
          const isWaterHit = isFlood && hit.object && (hit.object === this.environment.waterMesh || hit.object === this.environment.channelMesh);
          if (isWaterHit && Math.random() < 0.72) {
            // Specular reflection/absorption by open flood water
          } else {
            isHit = true;
            totalHitCount++;
            hitDist = hit.distance;
            isSurvivorHit = !!(hit.object && (hit.object.userData.isSurvivor || (hit.object.userData.thermalType && hit.object.userData.thermalType.startsWith('survivor'))));

            // Surface micro-noise based on weather & material
            const n = (Math.random() - 0.5) * weatherNoiseFactor * 2;
            const hitPoint = hit.point.clone().add(new THREE.Vector3(n, n, n));
            rayEnd = hitPoint;

            // Fast circular buffer insertion (zero Array.shift overhead)
            const ptData = {
              pos: hitPoint,
              dist: hitDist,
              timestamp: now,
              isSurvivor: isSurvivorHit
            };
            if (this.pointHistory.length < this.maxPoints) {
              this.pointHistory.push(ptData);
              this.pointHistoryCount = this.pointHistory.length;
            } else {
              this.pointHistory[this.pointHistoryHead] = ptData;
              this.pointHistoryHead = (this.pointHistoryHead + 1) % this.maxPoints;
            }

            // Progressive SLAM Reconstruction for physical structures (Requirement 2 & 3)
            const hitObj = hit.object;
            const isGround = (hitObj === this.environment.waterMesh || hitObj === this.environment.channelMesh ||
              (hitObj.name && hitObj.name.toLowerCase().includes('ground')) ||
              (hitObj.userData && hitObj.userData.thermalType === 'road' && hitObj.geometry && hitObj.geometry.type === 'PlaneGeometry'));

            if (!isGround && hitObj) {
              this.registerSlamStructureHit(hitObj, now, hitPoint);
            }
          }
        }
      }

      // Atmospheric droplet/dust scatter false return simulation
      if (!isHit && Math.random() < falseReturnProb) {
        const falseDist = 1.8 + Math.random() * (this.effectiveLidarRange * 0.55);
        const falseHit = origin.clone().addScaledVector(dir, falseDist);
        rayEnd = falseHit;
        isHit = true;
        totalHitCount++;
        const noisePt = {
          pos: falseHit,
          dist: falseDist,
          timestamp: now,
          isNoise: true
        };
        if (this.pointHistory.length < this.maxPoints) {
          this.pointHistory.push(noisePt);
          this.pointHistoryCount = this.pointHistory.length;
        } else {
          this.pointHistory[this.pointHistoryHead] = noisePt;
          this.pointHistoryHead = (this.pointHistoryHead + 1) % this.maxPoints;
        }
      }

      if (!rayEnd) {
        rayEnd = origin.clone().addScaledVector(dir, this.effectiveLidarRange);
      }

      // Update Laser Vector Line (Origin -> RayEnd)
      rayPositions[r * 6]     = origin.x;
      rayPositions[r * 6 + 1] = origin.y;
      rayPositions[r * 6 + 2] = origin.z;
      rayPositions[r * 6 + 3] = rayEnd.x;
      rayPositions[r * 6 + 4] = rayEnd.y;
      rayPositions[r * 6 + 5] = rayEnd.z;

      // Color coding along ray: glowing cyan tip, soft root
      rayColors[r * 6]     = 0.0;  rayColors[r * 6 + 1] = 0.55; rayColors[r * 6 + 2] = 0.85;
      rayColors[r * 6 + 3] = isHit ? 0.4 : 0.0;
      rayColors[r * 6 + 4] = isHit ? 1.0 : 0.75;
      rayColors[r * 6 + 5] = 1.0;

      // Impact Point
      if (isHit) {
        impactPositions[r * 3]     = rayEnd.x;
        impactPositions[r * 3 + 1] = rayEnd.y;
        impactPositions[r * 3 + 2] = rayEnd.z;
      } else {
        impactPositions[r * 3 + 1] = -500;
      }
    }

    // Re-hide unscanned colliders so WebGL renderer does not pre-render them
    for (let c = 0; c < colliders.length; c++) {
      if (!this.slamDiscoveredMeshes.has(colliders[c])) {
        const isGround = (colliders[c] === this.environment.waterMesh || colliders[c] === this.environment.channelMesh ||
          (colliders[c].name && colliders[c].name.toLowerCase().includes('ground')) ||
          (colliders[c].userData && colliders[c].userData.thermalType === 'road' && colliders[c].geometry && colliders[c].geometry.type === 'PlaneGeometry'));
        if (!isGround) {
          colliders[c].visible = false;
        }
      }
    }

    this.lidarScanRays.geometry.attributes.position.needsUpdate = true;
    this.lidarScanRays.geometry.attributes.color.needsUpdate = true;
    this.lidarImpactPoints.geometry.attributes.position.needsUpdate = true;

    // 5. Update Persistent 3D Point Cloud Buffer with SLAM Gradients (Requirement 4)
    const positions = this.lidarPointCloud.geometry.attributes.position.array;
    const colors = this.lidarPointCloud.geometry.attributes.color.array;

    for (let i = 0; i < this.maxPoints; i++) {
      if (i < this.pointHistory.length) {
        const pt = this.pointHistory[i];
        const ageSec = (now - pt.timestamp) / 1000.0;

        positions[i * 3]     = pt.pos.x;
        positions[i * 3 + 1] = pt.pos.y;
        positions[i * 3 + 2] = pt.pos.z;

        let r, g, b;
        if (pt.isNoise) {
          r = 0.75; g = 0.65; b = 0.35;
        } else if (pt.isSurvivor) {
          r = 0.98; g = 0.68; b = 0.12; // Warm amber survivor body signature
        } else if (pt.dist < 1.6) {
          r = 1.0; g = 0.20; b = 0.20; // Urgent collision proximity threshold
        } else if (ageSec < 1.5) {
          r = 0.70; g = 1.0; b = 1.0; // Fresh return: bright cyan-white
        } else if (ageSec < 6.0) {
          r = 0.0; g = 0.92; b = 1.0; // Active return: vibrant cyan
        } else if (ageSec < 20.0) {
          r = 0.03; g = 0.65; b = 0.82; // Partially reconstructed: cyan-blue
        } else {
          r = 0.02; g = 0.38; b = 0.52; // High-confidence persistent SLAM map
        }

        colors[i * 3]     = r;
        colors[i * 3 + 1] = g;
        colors[i * 3 + 2] = b;
      } else {
        positions[i * 3 + 1] = -500;
      }
    }

    this.lidarPointCloud.geometry.attributes.position.needsUpdate = true;
    this.lidarPointCloud.geometry.attributes.color.needsUpdate = true;

    // 6. Progressive SLAM Material Settling
    // Fresh cyan surfaces smoothly transition to cyan-blue and then dark grey/black
    if (this.lidarVisMode !== 'ENVIRONMENT') {
      this.slamDiscoveredMeshes.forEach(mesh => {
        const hits = this.slamMeshHits.get(mesh) || 0;
        const lastHit = this.slamMeshLastHit.get(mesh) || 0;
        const idleSec = (now - lastHit) / 1000.0;

        if (hits >= 8 || idleSec > 4.0) {
          if (mesh.material !== this.slamConfidentMaterial) {
            mesh.material = this.slamConfidentMaterial;
          }
        } else if (hits >= 3 || idleSec > 1.8) {
          if (mesh.material !== this.slamPartialMaterial) {
            mesh.material = this.slamPartialMaterial;
          }
        }
      });
    }

    // 7. Dynamic SLAM Telemetry & Status HUD (Requirement 10)
    let distTraveled = 0;
    if (this.drone && this.drone.telemetry && typeof this.drone.telemetry.flightDistanceM === 'number' && !isNaN(this.drone.telemetry.flightDistanceM)) {
      distTraveled = this.drone.telemetry.flightDistanceM;
    } else if (window.droneApp && window.droneApp.navigator && typeof window.droneApp.navigator.searchAreaCoveredSqM === 'number') {
      distTraveled = window.droneApp.navigator.searchAreaCoveredSqM * 0.15;
    }

    this.mappedAreaSqM = Math.min(24000, Math.max(0, Math.floor(this.pointHistory.length * 1.65 + distTraveled * 8.8)));
    const coveragePct = Math.min(100, Math.max(14, Math.floor((this.pointHistory.length / 5500) * 86 + 14)));
    this.slamMapPct = Math.min(100, Math.max(12, Math.floor((this.slamDiscoveredMeshes.size / Math.max(1, colliders.length - 2)) * 100)));
    this.lidarReturnsPct = parseFloat(((totalHitCount / this.maxScanRays) * 100).toFixed(1));
    this.lidarPointsPerSec = Math.round(this.maxScanRays * this.lidarScanRate * (this.lidarScanQuality / 100));

    this.updateLidarHud(coveragePct);
  }

  updateLidarHud(coveragePct) {
    const elRange = document.getElementById('lidar-val-range');
    const elFov = document.getElementById('lidar-val-fov');
    const elRate = document.getElementById('lidar-val-rate');
    const elPps = document.getElementById('lidar-val-pps');
    const elReturns = document.getElementById('lidar-val-returns');
    const elPoints = document.getElementById('lidar-val-points');
    const elArea = document.getElementById('lidar-val-area');
    const elCoverage = document.getElementById('lidar-val-coverage');
    const elMap = document.getElementById('lidar-val-map');
    const elSlam = document.getElementById('lidar-val-slam');
    const elWeatherImpact = document.getElementById('lidar-val-weather-impact');
    const elQuality = document.getElementById('lidar-val-quality');
    const elNoise = document.getElementById('lidar-val-noise');
    const elWeather = document.getElementById('lidar-val-weather');

    if (elRange) elRange.textContent = `${this.effectiveLidarRange.toFixed(1)} m`;
    if (elFov) elFov.textContent = `360° × [-15° → +15°]`;
    if (elRate) elRate.textContent = `${this.lidarScanRate.toFixed(1)} Hz`;
    if (elPps) elPps.textContent = this.lidarPointsPerSec.toLocaleString();
    if (elReturns) elReturns.textContent = `${this.lidarReturnsPct.toFixed(1)}%`;
    if (elPoints) elPoints.textContent = this.pointHistory.length.toLocaleString();
    if (elArea) elArea.textContent = `${this.mappedAreaSqM.toLocaleString()} m²`;
    if (elCoverage) elCoverage.textContent = `${coveragePct}%`;
    if (elMap) elMap.textContent = `${this.slamMapPct}%`;

    if (elSlam) {
      elSlam.textContent = this.lidarSlamState;
      elSlam.className = (this.lidarSlamState === 'LOCKED') ? 'l-val green' : ((this.lidarSlamState === 'INITIALIZING') ? 'l-val yellow' : 'l-val red');
    }
    if (elWeatherImpact) {
      elWeatherImpact.textContent = this.lidarWeatherImpact;
      elWeatherImpact.className = (this.lidarWeatherImpact === 'LOW') ? 'l-val green' : ((this.lidarWeatherImpact === 'MODERATE') ? 'l-val yellow' : 'l-val red');
    }
    if (elQuality) {
      elQuality.textContent = `${this.lidarScanQuality}%`;
      elQuality.className = (this.lidarScanQuality >= 85) ? 'l-val green' : ((this.lidarScanQuality >= 65) ? 'l-val yellow' : 'l-val red');
    }
    if (elNoise) {
      elNoise.textContent = this.lidarNoiseLevel;
      elNoise.className = (this.lidarNoiseLevel === 'LOW') ? 'l-val green' : ((this.lidarNoiseLevel.includes('MOD')) ? 'l-val yellow' : 'l-val red');
    }
    if (elWeather) elWeather.textContent = this.lidarWeatherStatus;
  }

  setLidarVisMode(mode) {
    this.lidarVisMode = mode;
    const btns = document.querySelectorAll('.lidar-vis-btn');
    btns.forEach(b => {
      b.classList.toggle('active', b.dataset.vismode === mode);
    });

    const isLidar = (this.sensorMode === 'LIDAR');
    if (this.lidarPointCloud) {
      this.lidarPointCloud.visible = isLidar && (mode === 'COMBINED' || mode === 'POINT_CLOUD');
      if (mode === 'POINT_CLOUD') {
        this.lidarPointCloud.material.size = 0.55;
        this.lidarPointCloud.material.opacity = 1.0;
      } else {
        this.lidarPointCloud.material.size = 0.40;
        this.lidarPointCloud.material.opacity = 0.90;
      }
    }
    if (this.lidarScanRays) {
      this.lidarScanRays.visible = isLidar && (mode === 'COMBINED' || mode === 'SCAN_RAYS');
      this.lidarScanRays.material.opacity = (mode === 'SCAN_RAYS') ? 0.65 : 0.45;
    }
    if (this.lidarImpactPoints) {
      this.lidarImpactPoints.visible = isLidar && (mode === 'COMBINED' || mode === 'SCAN_RAYS');
    }
    if (this.lidarBlindZone) {
      this.lidarBlindZone.visible = isLidar && (mode !== 'ENVIRONMENT');
    }
    if (this.lidarRangeRings) {
      this.lidarRangeRings.visible = isLidar && (mode !== 'ENVIRONMENT');
    }
    if (this.lidarTrajectoryLine) {
      this.lidarTrajectoryLine.visible = isLidar && (mode !== 'ENVIRONMENT');
    }

    if (isLidar) {
      if (mode === 'ENVIRONMENT') {
        // Temporarily reveal raw textured environment meshes
        this.environment.environmentGroup.traverse(node => {
          if (node.isMesh && node.userData._origLidarMat) {
            node.material = node.userData._origLidarMat;
            node.visible = true;
          }
        });
      } else {
        // Return to SLAM mode materials
        this.environment.environmentGroup.traverse(node => {
          if (node.isMesh && node.userData._origLidarMat) {
            const isGround = (node === this.environment.waterMesh || node === this.environment.channelMesh ||
              (node.name && node.name.toLowerCase().includes('ground')) ||
              (node.userData && node.userData.thermalType === 'road' && node.geometry && node.geometry.type === 'PlaneGeometry'));
            if (isGround) {
              node.material = this.slamUnoccupiedGroundMaterial;
              node.visible = true;
            } else if (this.slamDiscoveredMeshes.has(node)) {
              const hits = this.slamMeshHits.get(node) || 0;
              node.material = (hits >= 8) ? this.slamConfidentMaterial : (hits >= 3 ? this.slamPartialMaterial : this.slamActiveMaterial);
              node.visible = (mode !== 'POINT_CLOUD');
            } else {
              node.visible = false;
            }
          }
        });
      }
    }
  }

  resetLidarMap() {
    this.pointHistory = [];
    this.pointHistoryHead = 0;
    this.pointHistoryCount = 0;
    this.slamDiscoveredMeshes.clear();
    this.slamMeshHits.clear();
    this.slamMeshLastHit.clear();
    this.clearGroundExplorationCanvas();

    if (this.lidarPointCloud && this.lidarPointCloud.geometry) {
      const pos = this.lidarPointCloud.geometry.attributes.position.array;
      for (let i = 0; i < this.maxPoints; i++) {
        pos[i * 3 + 1] = -500;
      }
      this.lidarPointCloud.geometry.attributes.position.needsUpdate = true;
    }

    if (this.lidarTrajectoryLine && this.lidarTrajectoryLine.geometry) {
      this.trajectoryCount = 0;
      this.lidarTrajectoryLine.geometry.setDrawRange(0, 0);
      this.lidarTrajectoryLine.geometry.attributes.position.needsUpdate = true;
    }

    if (this.sensorMode === 'LIDAR' && this.environment && this.environment.environmentGroup) {
      this.environment.environmentGroup.traverse(node => {
        if (node.isMesh && node.userData._origLidarMat) {
          const isGround = (node === this.environment.waterMesh || node === this.environment.channelMesh ||
            (node.name && node.name.toLowerCase().includes('ground')) ||
            (node.userData && node.userData.thermalType === 'road' && node.geometry && node.geometry.type === 'PlaneGeometry'));
          if (!isGround) {
            node.visible = false;
          }
        }
      });
    }

    this.mappedAreaSqM = 0;
    this.slamMapPct = 0;
    this.updateLidarHud(0);
  }

  triggerDetectionPulse(pos) {
    if (!this.detectionPulseGroup) return;
    const dronePos = this.drone.group.position;

    const pulseRoot = new THREE.Group();
    pulseRoot.position.copy(pos);

    // Expanding ground ring
    const ringGeo = new THREE.RingGeometry(0.4, 0.55, 32);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.rotation.x = -Math.PI / 2;
    ringMesh.position.y = 0.12;
    pulseRoot.add(ringMesh);

    // Acquisition line from drone down to target
    const lineGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(dronePos.x - pos.x, dronePos.y - pos.y - 0.4, dronePos.z - pos.z),
      new THREE.Vector3(0, 0.2, 0)
    ]);
    const lineMat = new THREE.LineBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.75 });
    const line = new THREE.Line(lineGeo, lineMat);
    pulseRoot.add(line);

    this.detectionPulseGroup.add(pulseRoot);
    this.detectionPulses.push({
      mesh: pulseRoot,
      ringMesh,
      ringMat,
      lineMat,
      startTime: Date.now()
    });
  }

  updateUWBRanging() {
    const dronePos = this.drone.group.position;
    const distances = this.environment.uwbAnchors.map(a => {
      return parseFloat(dronePos.distanceTo(a.position).toFixed(2));
    });
    this.drone.telemetry.uwbDistance = distances;
  }

  updateVisionDetections() {
    this.activeDetections = [];
    const dronePos = this.drone.group.position;
    const isEarthquake = (this.environment.currentScenario === 'earthquake');
    const isFlood = (this.environment.currentScenario === 'flash_flood');
    const isGas = (this.environment.currentScenario === 'chemical_fire');

    // 1. Evaluate Survivors in Active Scenario (Requirement 8: Survivor + Sensor Fusion)
    this.environment.survivors.forEach(s => {
      const horizDist = Math.hypot(dronePos.x - s.position.x, dronePos.z - s.position.z);
      const droneDist = dronePos.distanceTo(s.position);

      const scanRadius = Math.max(26, dronePos.y * 1.55);
      if (!s.detected && (horizDist <= scanRadius || droneDist <= 28)) {
        s.detected = true;
        s.justDetected = true;
        s.detectionTime = Date.now();
        s.scanPulse = 1.0;
        this.triggerDetectionPulse(s.position);
      }

      if (s.detected) {
        const screenPos = this.toScreenPosition(s.position);
        if (screenPos.visible) {
          const camDist = this.camera.position.distanceTo(s.position);
          const conf = Math.min(99.4, (92 + (1 - Math.min(1, camDist / 90)) * 7.4)).toFixed(1);

          let labelText, stateText;
          if (s.isObstructed) {
            labelText = `[THERMAL DETECTION] SURVIVOR [${s.triage}]`;
            stateText = s.situationState || (isEarthquake ? 'TRAPPED UNDER RUBBLE' : (isFlood ? 'PARTIALLY SUBMERGED / OBSCURED' : 'IN HAZARDOUS ZONE'));
          } else {
            labelText = `SURVIVOR [${s.triage}]`;
            stateText = s.situationState || (isEarthquake ? 'SURVIVOR — OPEN AREA' : (isFlood ? 'STRANDED — ROOFTOP' : 'SURVIVOR — SAFE ZONE'));
          }

          const isAcquiring = s.detectionTime ? (Date.now() - s.detectionTime < 2200) : false;

          // 3D LiDAR Sensor Fusion (Requirement 8)
          const dist = dronePos.distanceTo(s.position);
          const relAlt = s.position.y - dronePos.y;
          const signAlt = relAlt >= 0 ? '+' : '';
          const lidarRangeStr = `DISTANCE: ${dist.toFixed(1)} m | REL. ALT: ${signAlt}${relAlt.toFixed(1)} m`;

          this.activeDetections.push({
            id: s.id,
            type: 'survivor',
            label: labelText,
            stateLabel: stateText,
            lidarFusion: lidarRangeStr,
            sublabel: `${conf}% | ${s.temperature}°C | ${dist.toFixed(1)}m`,
            x: screenPos.x,
            y: screenPos.y,
            width: Math.max(38, Math.min(76, 850 / camDist)),
            height: Math.max(48, Math.min(90, 1100 / camDist)),
            triage: s.triage,
            isObstructed: !!s.isObstructed,
            isAcquiring: isAcquiring,
            data: s
          });
        }
      }
    });

    // 2. Evaluate Hazards (Fire & Gas)
    this.environment.hazards.forEach(h => {
      const dist = dronePos.distanceTo(h.position);
      if (dist < 65) {
        const screenPos = this.toScreenPosition(h.position);
        if (screenPos.visible) {
          const camDist = this.camera.position.distanceTo(h.position);
          const relAlt = h.position.y - dronePos.y;
          const signAlt = relAlt >= 0 ? '+' : '';
          const lidarRangeStr = `DISTANCE: ${dist.toFixed(1)} m | REL. ALT: ${signAlt}${relAlt.toFixed(1)} m`;

          if (h.type) {
            const concPct = Math.min(98, Math.max(25, Math.round((this.gasReading.ppm / 500) * 100)));
            const concLevel = (this.gasReading.ppm > 350) ? 'HIGH' : (this.gasReading.ppm > 80 ? 'MODERATE' : 'TRACE');
            this.activeDetections.push({
              id: h.id,
              type: 'gas',
              label: `GAS LEAK: ${h.type.toUpperCase()}`,
              stateLabel: `HAZARD DETECTED // TOXIC GAS`,
              lidarFusion: lidarRangeStr,
              sublabel: `${concPct}% CONCENTRATION | ${this.gasReading.ppm} PPM [${concLevel}]`,
              x: screenPos.x,
              y: screenPos.y,
              width: Math.max(64, Math.min(120, 1600 / camDist)),
              height: Math.max(64, Math.min(120, 1600 / camDist)),
              triage: 'RED',
              data: h
            });
          } else {
            this.activeDetections.push({
              id: h.id,
              type: 'fire',
              label: `THERMAL HAZARD: FIRE 99%`,
              stateLabel: `STRUCTURAL INFERNO // ACTIVE`,
              lidarFusion: lidarRangeStr,
              sublabel: `Core >450°C | Intense Smoke`,
              x: screenPos.x,
              y: screenPos.y,
              width: Math.max(65, Math.min(115, 1600 / camDist)),
              height: Math.max(70, Math.min(125, 1750 / camDist)),
              triage: 'RED',
              data: h
            });
          }
        }
      }
    });

    // 3. Evaluate Structural Earthquake Hazards (Requirement 7)
    if (isEarthquake && this.environment.structuralHazards) {
      this.environment.structuralHazards.forEach(h => {
        const dist = dronePos.distanceTo(h.position);
        if (this.sensorMode === 'LIDAR' && dist > this.effectiveLidarRange + 4) return;
        const screenPos = this.toScreenPosition(h.position);
        if (screenPos.visible) {
          const camDist = this.camera.position.distanceTo(h.position);
          if (camDist < 160) {
            const relAlt = h.position.y - dronePos.y;
            const signAlt = relAlt >= 0 ? '+' : '';
            const lidarRangeStr = `DISTANCE: ${dist.toFixed(1)} m | REL. ALT: ${signAlt}${relAlt.toFixed(1)} m`;

            this.activeDetections.push({
              id: h.id,
              type: h.boxClass || 'structural',
              label: h.label,
              stateLabel: h.stateLabel || 'CRITICAL DAMAGE ZONE',
              lidarFusion: lidarRangeStr,
              sublabel: h.sublabel,
              x: screenPos.x,
              y: screenPos.y,
              width: Math.max(50, Math.min(100, (h.scaleW || 1400) / camDist)),
              height: Math.max(34, Math.min(68, (h.scaleH || 1000) / camDist)),
              triage: h.triage || 'YELLOW',
              data: h
            });
          }
        }
      });
    }
  }

  toScreenPosition(worldPos) {
    const vector = new THREE.Vector3().copy(worldPos);
    vector.project(this.camera);

    const isVisible = (vector.z >= -1.0 && vector.z <= 1.0 && vector.x >= -1.1 && vector.x <= 1.1 && vector.y >= -1.1 && vector.y <= 1.1);

    const canvas = this.renderer.domElement;
    const x = (vector.x * 0.5 + 0.5) * canvas.clientWidth;
    const y = (-(vector.y * 0.5) + 0.5) * canvas.clientHeight;

    return { x, y, visible: isVisible };
  }

  setSensorMode(mode) {
    const prevMode = this.sensorMode;
    this.sensorMode = mode;
    const container = document.getElementById('three-canvas-container');
    const thermalScan = document.getElementById('thermal-scanlines');
    const nvgOverlay = document.getElementById('nvg-filter');
    const thermalLegend = document.getElementById('thermal-legend');
    const lidarPanel = document.getElementById('lidar-slam-panel');

    // Synchronize UI sensor mode button highlights
    const modeButtons = document.querySelectorAll('.mode-btn');
    if (modeButtons && modeButtons.length > 0) {
      modeButtons.forEach(btn => {
        if (btn.dataset.mode === mode) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });
    }

    // Reset post-processing effects
    if (container) {
      container.classList.remove('thermal-filter');
      container.classList.remove('thermal-mode');
    }
    if (thermalScan) thermalScan.style.display = 'none';
    if (nvgOverlay) nvgOverlay.style.display = 'none';
    if (thermalLegend) thermalLegend.style.display = 'none';

    // 3D LiDAR SLAM mode handling & Three-Zone Environment Switch
    const isLidar = (mode === 'LIDAR');
    if (this.drone && this.drone.scannerVolume) {
      this.drone.scannerVolume.visible = false;
    }
    if (lidarPanel) lidarPanel.style.display = isLidar ? 'block' : 'none';
    if (this.lidarPointCloud) this.lidarPointCloud.visible = isLidar && (this.lidarVisMode === 'COMBINED' || this.lidarVisMode === 'POINT_CLOUD');
    if (this.lidarScanRays) this.lidarScanRays.visible = isLidar && (this.lidarVisMode === 'COMBINED' || this.lidarVisMode === 'SCAN_RAYS');
    if (this.lidarImpactPoints) this.lidarImpactPoints.visible = isLidar && (this.lidarVisMode === 'COMBINED' || this.lidarVisMode === 'SCAN_RAYS');
    if (this.lidarBlindZone) this.lidarBlindZone.visible = isLidar && (this.lidarVisMode !== 'ENVIRONMENT');
    if (this.lidarRangeRings) this.lidarRangeRings.visible = isLidar && (this.lidarVisMode !== 'ENVIRONMENT');
    if (this.lidarTrajectoryLine) this.lidarTrajectoryLine.visible = isLidar && (this.lidarVisMode !== 'ENVIRONMENT');

    if (isLidar) {
      this.setLidarEnvironmentActive(true);
    } else if (prevMode === 'LIDAR') {
      this.setLidarEnvironmentActive(false);
    }

    // Thermal Engine Instance Check & Activation
    if (!this.thermalEngine && typeof ThermalEngine !== 'undefined') {
      this.thermalEngine = new ThermalEngine(this.drone, this.environment, this.camera, this.renderer, this.drone ? this.drone.scene : null);
    }

    if (this.thermalEngine) {
      if (mode === 'THERMAL') {
        this.thermalEngine.enable();
      } else {
        this.thermalEngine.disable();
      }
    }

    if (mode === 'THERMAL') {
      if (container) {
        container.classList.add('thermal-mode');
      }
      if (thermalLegend) thermalLegend.style.display = 'flex';
    } else if (mode === 'NVG') {
      if (nvgOverlay) nvgOverlay.style.display = 'block';
    }
  }

  get currentMode() {
    return this.sensorMode;
  }
}

window.SensorFusionEngine = SensorFusionEngine;
