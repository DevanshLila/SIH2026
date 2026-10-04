/**
 * AERORES-AI Multi-Sensor Fusion & On-Device AI Perception Engine
 * Realistic Geometric LiDAR Raycasting, Volumetric Detection Zone & Range Rings,
 * FLIR Radiometric Thermal IR, Night Vision NVG, Gas Plume Tracking & YOLOv8 Aerial Detections
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
    
    // AI YOLO Detections list
    this.activeDetections = [];
    
    // Gas sensor state
    this.gasReading = {
      ppm: 18,
      type: 'CLEAN AIR',
      status: 'NORMAL',
      peakPpm: 18,
      gradientVector: new THREE.Vector3()
    };

    // LiDAR System parameters
    this.lidarMaxRange = 25.0; // 25 meters detection range
    this.lidarPointCloud = null;
    this.lidarRangeRings = null;
    this.lidarVolumeFrustum = null;
    this.lidarConeWireframe = null;
    this.lidarLaserBeams = null;
    this.lidarBeamsMesh = null;
    this.lidarSweepLine = null;
    this.lidarScanAngle = 0;
    this.pointHistory = [];
    this.maxPoints = 4800; // Ultra high-density authentic 3D SLAM point cloud

    this.initLidarSystem();
  }

  initLidarSystem() {
    // 1. Point Cloud Buffer (Realistic environmental surface hits with Rainbow Elevation Colors)
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(this.maxPoints * 3);
    const colors = new Float32Array(this.maxPoints * 3);

    for (let i = 0; i < this.maxPoints; i++) {
      positions[i * 3] = 0;
      positions[i * 3 + 1] = -100; // start hidden
      positions[i * 3 + 2] = 0;

      colors[i * 3] = 0.1;
      colors[i * 3 + 1] = 0.8;
      colors[i * 3 + 2] = 1.0;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 0.42,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    this.lidarPointCloud = new THREE.Points(geometry, material);
    this.lidarPointCloud.visible = false;
    this.drone.scene.add(this.lidarPointCloud);

    // 2. Realistic INVERTED CONE Detection Zone (Apex at drone sensor, expanding downward to ground)
    const coneRadius = this.lidarMaxRange * 0.72; // ~18m wide footprint on ground
    const coneHeight = this.lidarMaxRange; // 25m scanning depth
    const frustumGeo = new THREE.ConeGeometry(coneRadius, coneHeight, 36, 6, true);
    // Translate geometry so apex is at (0, -0.22, 0) directly under drone LiDAR puck, expanding downward:
    frustumGeo.translate(0, -coneHeight / 2 - 0.22, 0);

    const frustumMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      wireframe: false,
      transparent: true,
      opacity: 0.08,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    this.lidarVolumeFrustum = new THREE.Mesh(frustumGeo, frustumMat);
    this.lidarVolumeFrustum.visible = false;
    this.drone.group.add(this.lidarVolumeFrustum);

    // Holographic Wireframe Scan Rings on the Inverted Cone
    this.lidarConeWireframe = new THREE.LineSegments(
      new THREE.WireframeGeometry(frustumGeo),
      new THREE.LineBasicMaterial({
        color: 0x00f0ff,
        transparent: true,
        opacity: 0.18,
        depthWrite: false
      })
    );
    this.lidarConeWireframe.visible = false;
    this.drone.group.add(this.lidarConeWireframe);

    // 16-Beam Rotating Laser Array inside the Inverted Cone
    this.lidarLaserBeams = new THREE.Group();
    const beamCount = 16;
    const beamGeo = new THREE.BufferGeometry();
    const beamPositions = new Float32Array(beamCount * 2 * 3);
    beamGeo.setAttribute('position', new THREE.BufferAttribute(beamPositions, 3));

    const beamMat = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending
    });
    this.lidarBeamsMesh = new THREE.LineSegments(beamGeo, beamMat);
    this.lidarLaserBeams.add(this.lidarBeamsMesh);
    this.lidarLaserBeams.visible = false;
    this.drone.group.add(this.lidarLaserBeams);

    // 3. Ground Concentric Range Rings (10m, 20m, 25m Max Range)
    this.lidarRangeRings = new THREE.Group();
    const ringRadii = [10, 20, 25];
    ringRadii.forEach(r => {
      const ringGeo = new THREE.RingGeometry(r - 0.12, r + 0.12, 64);
      const ringMat = new THREE.MeshBasicMaterial({
        color: r === 25 ? 0xef4444 : 0x00f0ff,
        transparent: true,
        opacity: r === 25 ? 0.6 : 0.35,
        side: THREE.DoubleSide
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.1;
      this.lidarRangeRings.add(ring);
    });

    // 360° Rotating Radar Sweep Line on Ground Grid
    const lineGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0.12, 0),
      new THREE.Vector3(this.lidarMaxRange, 0.12, 0)
    ]);
    const lineMat = new THREE.LineBasicMaterial({ color: 0x00f0ff, linewidth: 2 });
    this.lidarSweepLine = new THREE.Line(lineGeo, lineMat);
    this.lidarRangeRings.add(this.lidarSweepLine);

    this.lidarRangeRings.visible = false;
    this.drone.scene.add(this.lidarRangeRings);
  }

  update(delta) {
    // 1. Gas Sensor Reading & Plume Gradient Localization
    this.updateGasSensor();

    // 2. Realistic Geometric LiDAR Raycasting & Detection Zone
    this.updateLidarScan(delta);

    // 3. AI On-Device Vision Detection (YOLOv8 Inference simulator)
    this.updateVisionDetections();

    // 4. UWB Ranging Update
    this.updateUWBRanging();
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

  updateLidarScan(delta) {
    const dronePos = this.drone.group.position;
    const isLidarMode = (this.sensorMode === 'LIDAR');

    this.lidarPointCloud.visible = isLidarMode;
    this.lidarVolumeFrustum.visible = isLidarMode;
    if (this.lidarConeWireframe) this.lidarConeWireframe.visible = isLidarMode;
    if (this.lidarLaserBeams) this.lidarLaserBeams.visible = isLidarMode;
    this.lidarRangeRings.visible = isLidarMode;

    if (!isLidarMode) return;

    // 1. Update Ground Range Rings Position & Sweep Line
    this.lidarRangeRings.position.set(dronePos.x, 0.05, dronePos.z);
    this.lidarScanAngle += 5.5 * delta;
    if (this.lidarSweepLine) {
      this.lidarSweepLine.rotation.y = this.lidarScanAngle;
    }

    // 2. Animate 16 Rotating Laser Beams in the Inverted Cone
    if (this.lidarBeamsMesh) {
      const beamPos = this.lidarBeamsMesh.geometry.attributes.position.array;
      const count = 16;
      const baseRadius = this.lidarMaxRange * 0.72;
      const depth = -this.lidarMaxRange;

      for (let b = 0; b < count; b++) {
        const theta = this.lidarScanAngle + (b / count) * Math.PI * 2;
        const bIdx = b * 6;
        // Apex (sensor at drone bottom)
        beamPos[bIdx] = 0;
        beamPos[bIdx + 1] = -0.25;
        beamPos[bIdx + 2] = 0;
        // Cone base target
        beamPos[bIdx + 3] = Math.cos(theta) * baseRadius;
        beamPos[bIdx + 4] = depth;
        beamPos[bIdx + 5] = Math.sin(theta) * baseRadius;
      }
      this.lidarBeamsMesh.geometry.attributes.position.needsUpdate = true;
    }

    // 3. Perform High-Density Geometric Raycasts against Scene Colliders
    const colliders = this.environment.obstacleColliders;
    if (!colliders || colliders.length === 0) return;

    const raysPerFrame = 96; // Ultra high-density scan
    const verticalElevationBands = [-0.85, -0.65, -0.45, -0.30, -0.15, -0.05, 0.05, 0.15];
    const origin = dronePos.clone().add(new THREE.Vector3(0, -0.35, 0));

    for (let r = 0; r < raysPerFrame; r++) {
      const azimuth = this.lidarScanAngle + (r / raysPerFrame) * Math.PI * 1.5;
      const elevation = verticalElevationBands[r % verticalElevationBands.length];

      // Ray direction unit vector
      const dir = new THREE.Vector3(
        Math.cos(azimuth),
        elevation,
        Math.sin(azimuth)
      ).normalize();

      this.raycaster.set(origin, dir);
      this.raycaster.near = 0.4;
      this.raycaster.far = this.lidarMaxRange;

      const intersects = this.raycaster.intersectObjects(colliders, false);

      if (intersects.length > 0) {
        const hit = intersects[0];
        const dist = hit.distance;

        // Realistic millimeter sensor noise
        const noise = (Math.random() - 0.5) * 0.03;
        const hitPoint = hit.point.clone().add(new THREE.Vector3(noise, noise, noise));

        // Authentic LiDAR Rainbow Elevation Color Mapping (Velodyne / Ouster / RViz standard)
        const elev = Math.max(0, hitPoint.y);
        let rCol, gCol, bCol;
        if (elev < 1.0) {
          // Deep Blue to Aqua (Ground / Basements)
          const f = elev / 1.0;
          rCol = 0.1; gCol = 0.3 + f * 0.5; bCol = 1.0;
        } else if (elev < 3.2) {
          // Cyan to Mint Green (Low rubble, vehicles, debris)
          const f = (elev - 1.0) / 2.2;
          rCol = 0.0; gCol = 0.8 + f * 0.2; bCol = 1.0 - f * 0.6;
        } else if (elev < 7.0) {
          // Green to Bright Yellow (Walls, slabs, roofs)
          const f = (elev - 3.2) / 3.8;
          rCol = f; gCol = 1.0; bCol = 0.1;
        } else {
          // Yellow to Crimson Red (Elevated collapsed structures, poles, towers)
          const f = Math.min(1.0, (elev - 7.0) / 4.0);
          rCol = 1.0; gCol = 1.0 - f * 0.85; bCol = 0.1;
        }

        // Proximity warning override if obstacle is critically close (< 3.5m)
        if (dist < 3.5) {
          rCol = 1.0; gCol = 0.1; bCol = 0.25;
        }

        // Store into rolling history
        this.pointHistory.push({
          pos: hitPoint,
          r: rCol,
          g: gCol,
          b: bCol
        });

        if (this.pointHistory.length > this.maxPoints) {
          this.pointHistory.shift();
        }
      }
    }

    // 4. Write Hit Points into BufferGeometry
    const positions = this.lidarPointCloud.geometry.attributes.position.array;
    const colors = this.lidarPointCloud.geometry.attributes.color.array;

    for (let i = 0; i < this.maxPoints; i++) {
      if (i < this.pointHistory.length) {
        const pt = this.pointHistory[i];
        positions[i * 3] = pt.pos.x;
        positions[i * 3 + 1] = pt.pos.y;
        positions[i * 3 + 2] = pt.pos.z;

        colors[i * 3] = pt.r;
        colors[i * 3 + 1] = pt.g;
        colors[i * 3 + 2] = pt.b;
      } else {
        positions[i * 3 + 1] = -100; // hide unused
      }
    }

    this.lidarPointCloud.geometry.attributes.position.needsUpdate = true;
    this.lidarPointCloud.geometry.attributes.color.needsUpdate = true;

    // Update LiDAR HUD stats text if visible
    const elPts = document.getElementById('lidar-hud-points-count');
    if (elPts) elPts.textContent = `${this.pointHistory.length} PTS`;
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
    const detectionMaxDistance = 65;

    // 1. Evaluate All Survivors in Active Scenario
    this.environment.survivors.forEach(s => {
      const dist = dronePos.distanceTo(s.position);
      if (dist < detectionMaxDistance) {
        const screenPos = this.toScreenPosition(s.position);
        if (screenPos.visible) {
          s.detected = true;
          const conf = Math.min(99.6, (91 + (1 - dist / detectionMaxDistance) * 8.5)).toFixed(1);
          
          this.activeDetections.push({
            id: s.id,
            type: 'survivor',
            label: `SURVIVOR [${s.triage}] ${conf}%`,
            sublabel: `FLIR: ${s.temperature}°C | ${s.name}`,
            x: screenPos.x,
            y: screenPos.y,
            width: Math.max(50, 1200 / dist),
            height: Math.max(70, 1600 / dist),
            triage: s.triage,
            data: s
          });
        }
      }
    });

    // 2. Evaluate Hazards (Fire & Gas)
    this.environment.hazards.forEach(h => {
      const dist = dronePos.distanceTo(h.position);
      if (dist < detectionMaxDistance) {
        const screenPos = this.toScreenPosition(h.position);
        if (screenPos.visible) {
          if (h.type) {
            // Gas hazard
            this.activeDetections.push({
              id: h.id,
              type: 'gas',
              label: `CHEMICAL PLUME: ${h.type}`,
              sublabel: `${this.gasReading.ppm} PPM | ${h.severity}`,
              x: screenPos.x,
              y: screenPos.y,
              width: Math.max(75, 1700 / dist),
              height: Math.max(75, 1700 / dist),
              triage: 'RED',
              data: h
            });
          } else {
            // Fire hazard
            this.activeDetections.push({
              id: h.id,
              type: 'fire',
              label: `THERMAL HAZARD: FIRE 99.4%`,
              sublabel: `Core >450°C | Dense Smoke`,
              x: screenPos.x,
              y: screenPos.y,
              width: Math.max(80, 1800 / dist),
              height: Math.max(90, 2000 / dist),
              triage: 'RED',
              data: h
            });
          }
        }
      }
    });
  }

  toScreenPosition(worldPos) {
    const vector = new THREE.Vector3().copy(worldPos);
    vector.project(this.camera);

    const isVisible = (vector.z < 1.0 && vector.x >= -1.1 && vector.x <= 1.1 && vector.y >= -1.1 && vector.y <= 1.1);

    const canvas = this.renderer.domElement;
    const x = (vector.x * 0.5 + 0.5) * canvas.clientWidth;
    const y = (-(vector.y * 0.5) + 0.5) * canvas.clientHeight;

    return { x, y, visible: isVisible };
  }

  setSensorMode(mode) {
    this.sensorMode = mode;
    const container = document.getElementById('three-canvas-container');
    const thermalScan = document.getElementById('thermal-scanlines');
    const nvgOverlay = document.getElementById('nvg-filter');
    const lidarOverlay = document.getElementById('lidar-hud-overlay');

    // Reset post-processing effects
    container.classList.remove('thermal-filter', 'lidar-filter', 'nvg-filter');
    if (thermalScan) thermalScan.style.display = 'none';
    if (nvgOverlay) nvgOverlay.style.display = 'none';
    if (lidarOverlay) lidarOverlay.style.display = 'none';

    if (mode === 'THERMAL') {
      container.classList.add('thermal-filter');
      if (thermalScan) thermalScan.style.display = 'block';
      this.environment.setLidarVisionMode(false);
    } else if (mode === 'NVG') {
      container.classList.add('nvg-filter');
      if (nvgOverlay) nvgOverlay.style.display = 'block';
      this.environment.setLidarVisionMode(false);
    } else if (mode === 'LIDAR') {
      container.classList.add('lidar-filter');
      if (lidarOverlay) lidarOverlay.style.display = 'block';
      // Enable authentic dark void and fluorescent wireframe obstacle matrix
      this.environment.setLidarVisionMode(true);
    } else {
      this.environment.setLidarVisionMode(false);
    }
  }
}

window.SensorFusionEngine = SensorFusionEngine;
