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
    this.lidarSweepLine = null;
    this.lidarScanAngle = 0;
    this.pointHistory = [];
    this.maxPoints = 850;

    this.initLidarSystem();
  }

  initLidarSystem() {
    // 1. Point Cloud Buffer (Realistic environmental surface hits)
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(this.maxPoints * 3);
    const colors = new Float32Array(this.maxPoints * 3);

    for (let i = 0; i < this.maxPoints; i++) {
      positions[i * 3] = 0;
      positions[i * 3 + 1] = -100; // start hidden
      positions[i * 3 + 2] = 0;

      colors[i * 3] = 0.0;
      colors[i * 3 + 1] = 0.9;
      colors[i * 3 + 2] = 1.0;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 0.42,
      vertexColors: true,
      transparent: true,
      opacity: 0.9
    });

    this.lidarPointCloud = new THREE.Points(geometry, material);
    this.lidarPointCloud.visible = false;
    this.drone.scene.add(this.lidarPointCloud);

    // 2. LiDAR Detection Zone: Semi-Transparent 3D Scanning Frustum / Cone
    const frustumGeo = new THREE.ConeGeometry(this.lidarMaxRange * 0.75, this.lidarMaxRange, 32, 1, true);
    const frustumMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      wireframe: false,
      transparent: true,
      opacity: 0.08,
      side: THREE.DoubleSide
    });
    this.lidarVolumeFrustum = new THREE.Mesh(frustumGeo, frustumMat);
    this.lidarVolumeFrustum.rotation.x = Math.PI;
    this.lidarVolumeFrustum.position.y = -this.lidarMaxRange / 2;
    this.lidarVolumeFrustum.visible = false;
    this.drone.group.add(this.lidarVolumeFrustum);

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
    this.lidarRangeRings.visible = isLidarMode;

    if (!isLidarMode) return;

    // 1. Update Ground Range Rings Position & Sweep Line
    this.lidarRangeRings.position.set(dronePos.x, 0.05, dronePos.z);
    this.lidarScanAngle += 4.5 * delta;
    if (this.lidarSweepLine) {
      this.lidarSweepLine.rotation.y = this.lidarScanAngle;
    }

    // 2. Perform Real Geometric Raycasts against Obstacle Colliders
    const colliders = this.environment.obstacleColliders;
    if (!colliders || colliders.length === 0) return;

    const raysPerFrame = 28;
    const verticalElevationBands = [-0.65, -0.45, -0.25, -0.05, 0.1]; // Multi-layer 3D LiDAR elevation
    const origin = dronePos.clone().add(new THREE.Vector3(0, -0.5, 0));

    for (let r = 0; r < raysPerFrame; r++) {
      const azimuth = this.lidarScanAngle + (r / raysPerFrame) * Math.PI * 0.8;
      const elevation = verticalElevationBands[r % verticalElevationBands.length];

      // Ray direction unit vector
      const dir = new THREE.Vector3(
        Math.cos(azimuth),
        elevation,
        Math.sin(azimuth)
      ).normalize();

      this.raycaster.set(origin, dir);
      this.raycaster.near = 0.5;
      this.raycaster.far = this.lidarMaxRange;

      const intersects = this.raycaster.intersectObjects(colliders, false);

      if (intersects.length > 0) {
        const hit = intersects[0];
        const dist = hit.distance;

        // Realistic small sensor noise (+/- 0.02m)
        const noise = (Math.random() - 0.5) * 0.04;
        const hitPoint = hit.point.clone().add(new THREE.Vector3(noise, noise, noise));

        // Color coding by obstacle proximity
        let rCol, gCol, bCol;
        if (dist < 4.0) {
          // Red: Collision Alert
          rCol = 1.0; gCol = 0.15; bCol = 0.15;
        } else if (dist < 10.0) {
          // Yellow: Caution Warning
          rCol = 1.0; gCol = 0.8; bCol = 0.1;
        } else {
          // Cyan / Green: Clear Safe Range
          rCol = 0.0; gCol = 0.95; bCol = 0.85;
        }

        // Store into rolling history
        this.pointHistory.push({
          pos: hitPoint,
          r: rCol,
          g: gCol,
          b: bCol,
          age: 0
        });

        if (this.pointHistory.length > this.maxPoints) {
          this.pointHistory.shift();
        }
      }
    }

    // 3. Write Hit Points into BufferGeometry
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

    const isVisible = (vector.z >= -1.0 && vector.z <= 1.0 && vector.x >= -1.1 && vector.x <= 1.1 && vector.y >= -1.1 && vector.y <= 1.1);

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

    // Reset post-processing effects
    container.classList.remove('thermal-filter');
    if (thermalScan) thermalScan.style.display = 'none';
    if (nvgOverlay) nvgOverlay.style.display = 'none';

    if (mode === 'THERMAL') {
      container.classList.add('thermal-filter');
      if (thermalScan) thermalScan.style.display = 'block';
    } else if (mode === 'NVG') {
      if (nvgOverlay) nvgOverlay.style.display = 'block';
    }
  }
}

window.SensorFusionEngine = SensorFusionEngine;
