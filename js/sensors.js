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
    this.lidarLaserTracers = null;
    this.lidarSweepLine = null;
    this.lidarScanAngle = 0;
    this.pointHistory = [];
    this.maxPoints = 2000;
    this.closestObstacleDist = 25.0;
    this.activeLaserHits = [];

    this.initLidarSystem();
  }

  initLidarSystem() {
    // 1. High-Density Point Cloud Buffer (2,000 environmental surface hits)
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
      size: 0.52,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending
    });

    this.lidarPointCloud = new THREE.Points(geometry, material);
    this.lidarPointCloud.visible = false;
    this.drone.scene.add(this.lidarPointCloud);

    // 2. Dynamic Laser Pulse Tracer Beams (Puck to obstacle contact lines)
    const maxTracers = 16;
    const tracerGeo = new THREE.BufferGeometry();
    const tracerPos = new Float32Array(maxTracers * 2 * 3);
    tracerGeo.setAttribute('position', new THREE.BufferAttribute(tracerPos, 3));
    const tracerMat = new THREE.LineBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending
    });
    this.lidarLaserTracers = new THREE.LineSegments(tracerGeo, tracerMat);
    this.lidarLaserTracers.visible = false;
    this.drone.scene.add(this.lidarLaserTracers);

    // 3. Ground Concentric Range Rings (5m, 10m, 15m, 20m, 25m Max Range)
    this.lidarRangeRings = new THREE.Group();
    const ringRadii = [5, 10, 15, 20, 25];
    ringRadii.forEach(r => {
      const ringGeo = new THREE.RingGeometry(r - 0.12, r + 0.12, 64);
      let ringColor = 0x00f0ff;
      let opacity = 0.35;
      if (r === 25) {
        ringColor = 0xef4444; // Outer boundary alert
        opacity = 0.6;
      } else if (r === 20) {
        ringColor = 0xf59e0b; // Caution buffer
        opacity = 0.45;
      }
      const ringMat = new THREE.MeshBasicMaterial({
        color: ringColor,
        transparent: true,
        opacity: opacity,
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

    if (this.lidarPointCloud) this.lidarPointCloud.visible = isLidarMode;
    if (this.lidarRangeRings) this.lidarRangeRings.visible = isLidarMode;
    if (this.lidarLaserTracers) this.lidarLaserTracers.visible = isLidarMode;

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

    const raysPerFrame = 64; // High-density scanning
    const verticalElevationBands = [
      -1.6, -1.3, -1.05, -0.85, -0.68, -0.52, -0.38, -0.26, -0.16, -0.08, -0.01, 0.06, 0.12, 0.18, 0.25, 0.32
    ];
    const origin = dronePos.clone().add(new THREE.Vector3(0, -0.52, 0));

    let minDetectedDist = 25.0;
    this.activeLaserHits = [];

    for (let r = 0; r < raysPerFrame; r++) {
      const azimuth = this.lidarScanAngle + (r / raysPerFrame) * Math.PI * 1.2;
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
        if (dist < minDetectedDist) minDetectedDist = dist;

        // Realistic LiDAR sensor jitter (+/- 0.015m)
        const noise = (Math.random() - 0.5) * 0.03;
        const hitPoint = hit.point.clone().add(new THREE.Vector3(noise, noise, noise));

        // Professional LiDAR Color Coding:
        // Priority 1: Proximity alert
        // Priority 2: Elevation height gradient (Z/Y height)
        let rCol, gCol, bCol;
        if (dist < 4.0) {
          // Red: Collision Alert
          rCol = 1.0; gCol = 0.15; bCol = 0.15;
        } else if (dist < 8.0) {
          // Amber/Yellow: Caution Warning
          rCol = 1.0; gCol = 0.75; bCol = 0.05;
        } else {
          // Elevation gradient: Blue/Cyan (ground) -> Emerald (mid) -> Magenta/Orange (high)
          const y = hitPoint.y;
          if (y < 1.0) {
            rCol = 0.0; gCol = 0.85; bCol = 1.0; // Cyan
          } else if (y < 4.0) {
            rCol = 0.15; gCol = 0.95; bCol = 0.45; // Emerald / Lime
          } else {
            rCol = 1.0; gCol = 0.45; bCol = 0.85; // Magenta / High structure
          }
        }

        // Store into rolling history
        this.pointHistory.push({
          pos: hitPoint,
          r: rCol,
          g: gCol,
          b: bCol,
          dist: dist
        });

        if (this.pointHistory.length > this.maxPoints) {
          this.pointHistory.shift();
        }

        if (dist < 15.0 && this.activeLaserHits.length < 16) {
          this.activeLaserHits.push(hitPoint);
        }
      }
    }

    this.closestObstacleDist = minDetectedDist;

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

    // 4. Update Active Laser Tracer Beams
    if (this.lidarLaserTracers) {
      const tracerPositions = this.lidarLaserTracers.geometry.attributes.position.array;
      const maxTracers = 16;
      for (let t = 0; t < maxTracers; t++) {
        if (t < this.activeLaserHits.length) {
          const target = this.activeLaserHits[t];
          tracerPositions[t * 6] = origin.x;
          tracerPositions[t * 6 + 1] = origin.y;
          tracerPositions[t * 6 + 2] = origin.z;

          tracerPositions[t * 6 + 3] = target.x;
          tracerPositions[t * 6 + 4] = target.y;
          tracerPositions[t * 6 + 5] = target.z;
        } else {
          tracerPositions[t * 6 + 1] = -100;
          tracerPositions[t * 6 + 4] = -100;
        }
      }
      this.lidarLaserTracers.geometry.attributes.position.needsUpdate = true;
    }

    // 5. Render 2D Polar Radar Scope & HUD Metrics
    this.renderPolarScope(dronePos);
  }

  renderPolarScope(dronePos) {
    const canvas = document.getElementById('lidar-polar-scope');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const maxR = cx - 6;

    ctx.clearRect(0, 0, w, h);

    // Radar background grid
    ctx.fillStyle = 'rgba(6, 15, 30, 0.85)';
    ctx.beginPath();
    ctx.arc(cx, cy, maxR, 0, Math.PI * 2);
    ctx.fill();

    // Concentric rings (5m, 10m, 15m, 20m, 25m)
    const ringRanges = [5, 10, 15, 20, 25];
    ctx.lineWidth = 1;
    ringRanges.forEach(r => {
      const radius = (r / this.lidarMaxRange) * maxR;
      ctx.strokeStyle = (r === 25) ? 'rgba(239, 68, 68, 0.45)' : (r === 10 ? 'rgba(0, 240, 255, 0.35)' : 'rgba(56, 189, 248, 0.2)');
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.stroke();
    });

    // Crosshairs
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.25)';
    ctx.beginPath();
    ctx.moveTo(cx, 4);
    ctx.lineTo(cx, h - 4);
    ctx.moveTo(4, cy);
    ctx.lineTo(w - 4, cy);
    ctx.stroke();

    // Rotating Radar Sweep Line
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(this.lidarScanAngle);
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, maxR);
    grad.addColorStop(0, 'rgba(0, 240, 255, 0.8)');
    grad.addColorStop(1, 'rgba(0, 240, 255, 0.05)');
    ctx.strokeStyle = grad;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(maxR, 0);
    ctx.stroke();
    ctx.restore();

    // Plot obstacle blips from pointHistory (downsampled)
    const step = Math.max(1, Math.floor(this.pointHistory.length / 140));
    for (let i = 0; i < this.pointHistory.length; i += step) {
      const pt = this.pointHistory[i];
      const dx = pt.pos.x - dronePos.x;
      const dz = pt.pos.z - dronePos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist <= this.lidarMaxRange) {
        const px = cx + (dx / this.lidarMaxRange) * maxR;
        const py = cy + (dz / this.lidarMaxRange) * maxR;

        if (dist < 4.0) {
          ctx.fillStyle = '#ef4444';
          ctx.beginPath();
          ctx.arc(px, py, 2.5, 0, Math.PI * 2);
          ctx.fill();
        } else if (dist < 8.0) {
          ctx.fillStyle = '#f59e0b';
          ctx.beginPath();
          ctx.arc(px, py, 2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillStyle = 'rgba(0, 240, 255, 0.65)';
          ctx.beginPath();
          ctx.arc(px, py, 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // Drone center blip
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fill();

    // Update HUD text widgets
    const elMinDist = document.getElementById('lidar-min-dist');
    if (elMinDist) {
      elMinDist.textContent = (this.closestObstacleDist < 25.0) ? `${this.closestObstacleDist.toFixed(1)} m` : '> 25 m';
      elMinDist.style.color = (this.closestObstacleDist < 4.0) ? '#ef4444' : (this.closestObstacleDist < 8.0 ? '#f59e0b' : '#38bdf8');
    }

    const elBadge = document.getElementById('lidar-status-badge');
    if (elBadge) {
      if (this.closestObstacleDist < 4.0) {
        elBadge.textContent = 'ALERT (<4m)';
        elBadge.style.color = '#ef4444';
      } else if (this.closestObstacleDist < 8.0) {
        elBadge.textContent = 'CAUTION';
        elBadge.style.color = '#f59e0b';
      } else {
        elBadge.textContent = 'CLEAR';
        elBadge.style.color = '#10b981';
      }
    }

    const elPts = document.getElementById('lidar-point-count');
    if (elPts) {
      elPts.textContent = `${this.pointHistory.length} / 2,000`;
    }
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
    const lidarOverlay = document.getElementById('lidar-filter-overlay');
    const lidarHud = document.getElementById('lidar-slam-hud');

    // Reset post-processing effects
    if (container) {
      container.classList.remove('thermal-filter');
      container.classList.remove('lidar-filter');
    }
    if (thermalScan) thermalScan.style.display = 'none';
    if (nvgOverlay) nvgOverlay.style.display = 'none';
    if (lidarOverlay) lidarOverlay.style.display = 'none';
    if (lidarHud) lidarHud.style.display = 'none';

    if (mode === 'THERMAL') {
      if (container) container.classList.add('thermal-filter');
      if (thermalScan) thermalScan.style.display = 'block';
    } else if (mode === 'NVG') {
      if (nvgOverlay) nvgOverlay.style.display = 'block';
    } else if (mode === 'LIDAR') {
      if (container) container.classList.add('lidar-filter');
      if (lidarOverlay) lidarOverlay.style.display = 'block';
      if (lidarHud) lidarHud.style.display = 'block';

      // Boost drone LiDAR cone opacity in LiDAR mode
      if (this.drone.lidarCone) this.drone.lidarCone.material.opacity = 0.26;
      if (this.drone.lidarWire) this.drone.lidarWire.material.opacity = 0.45;
      if (this.drone.lidarFan) this.drone.lidarFan.material.opacity = 0.42;
    } else {
      if (this.drone.lidarCone) this.drone.lidarCone.material.opacity = 0.10;
      if (this.drone.lidarWire) this.drone.lidarWire.material.opacity = 0.18;
      if (this.drone.lidarFan) this.drone.lidarFan.material.opacity = 0.20;
    }
  }
}

window.SensorFusionEngine = SensorFusionEngine;
