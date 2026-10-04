/**
 * AERORES-AI Multi-Sensor Fusion & On-Device AI Perception Engine
 * Realistic Geometric 3D LiDAR SLAM System (Himanshu Multi-Beam Inverted Cone Architecture)
 * Realistic Geometric LiDAR Raycasting, Volumetric Inverted Cone Detection Zone & Range Rings,
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

    // 3D Multi-Beam LiDAR SLAM System Parameters (Himanshu Branch Specification)
    this.lidarMaxRange = 25.0; // 25 meters detection range
    this.effectiveLidarRange = 25.0;
    this.lidarNominalRange = 25.0;
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

    // Tactical sensor detection pulse feedback
    this.detectionPulses = [];
    this.detectionPulseGroup = null;

    // Movement vector & trajectory line support (for drone rendering priority hierarchy)
    this.movementVectorGroup = null;
    this.lidarTrajectoryLine = null;

    // FLIR Radiometric Thermal IR Shader Engine
    this.thermalEngine = (typeof ThermalEngine !== 'undefined')
      ? new ThermalEngine(this.drone, this.environment, this.camera, this.renderer, this.drone ? this.drone.scene : null)
      : null;

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
    this.lidarVolumeFrustum.userData.isLidarObject = true;
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
    this.lidarConeWireframe.userData.isLidarObject = true;
    this.lidarConeWireframe.visible = false;
    this.drone.group.add(this.lidarConeWireframe);

    // 16-Beam Rotating Laser Array inside the Inverted Cone
    this.lidarLaserBeams = new THREE.Group();
    this.lidarLaserBeams.userData.isLidarObject = true;
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
    this.lidarBeamsMesh.userData.isLidarObject = true;
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

    // 4. Optical Detection Visual Pulse Group
    this.detectionPulseGroup = new THREE.Group();
    this.drone.scene.add(this.detectionPulseGroup);

    // 5. Movement Vector Group & Trajectory Line (for layer verification & scene attachment)
    this.movementVectorGroup = new THREE.Group();
    this.movementVectorGroup.visible = false;
    this.drone.scene.add(this.movementVectorGroup);

    this.lidarTrajectoryLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 0)]),
      new THREE.LineBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.6 })
    );
    this.lidarTrajectoryLine.visible = false;
    this.drone.scene.add(this.lidarTrajectoryLine);
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
    if (this.lidarVolumeFrustum) this.lidarVolumeFrustum.visible = isLidarMode;
    if (this.lidarConeWireframe) this.lidarConeWireframe.visible = isLidarMode;
    if (this.lidarLaserBeams) this.lidarLaserBeams.visible = isLidarMode;
    if (this.lidarRangeRings) this.lidarRangeRings.visible = isLidarMode;
    if (this.movementVectorGroup) this.movementVectorGroup.visible = isLidarMode;
    if (this.lidarTrajectoryLine) this.lidarTrajectoryLine.visible = isLidarMode;

    // Animate active detection pulse beams
    if (this.detectionPulses && this.detectionPulses.length > 0) {
      const now = Date.now();
      for (let i = this.detectionPulses.length - 1; i >= 0; i--) {
        const p = this.detectionPulses[i];
        const age = (now - p.startTime) / 1000.0;
        if (age > 1.4) {
          if (p.mesh.parent) p.mesh.parent.remove(p.mesh);
          this.detectionPulses.splice(i, 1);
        } else {
          const fade = 1.0 - (age / 1.4);
          if (p.ringMat) p.ringMat.opacity = fade * 0.85;
          if (p.ringMesh) p.ringMesh.scale.set(1.0 + age * 2.2, 1.0 + age * 2.2, 1.0);
          if (p.lineMat) p.lineMat.opacity = fade * 0.75;
        }
      }
    }

    if (!isLidarMode) return;

    // 1. Update Ground Range Rings Position & Sweep Line
    if (this.lidarRangeRings) {
      this.lidarRangeRings.position.set(dronePos.x, 0.05, dronePos.z);
    }
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
    if (this.lidarPointCloud && this.lidarPointCloud.geometry) {
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

    // Update LiDAR HUD stats text if visible
    const elPts = document.getElementById('lidar-hud-points-count');
    if (elPts) elPts.textContent = `${this.pointHistory.length} PTS`;
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

  resetLidarMap() {
    this.pointHistory = [];
    if (this.lidarPointCloud && this.lidarPointCloud.geometry) {
      const positions = this.lidarPointCloud.geometry.attributes.position.array;
      for (let i = 0; i < this.maxPoints; i++) {
        positions[i * 3 + 1] = -100;
      }
      this.lidarPointCloud.geometry.attributes.position.needsUpdate = true;
    }
    const elPts = document.getElementById('lidar-hud-points-count');
    if (elPts) elPts.textContent = '0 PTS';
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

    // 1. Evaluate Survivors in Active Scenario
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

          // 3D LiDAR Sensor Fusion
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

    // 3. Evaluate Structural Earthquake Hazards
    if (isEarthquake && this.environment.structuralHazards) {
      this.environment.structuralHazards.forEach(h => {
        const dist = dronePos.distanceTo(h.position);
        if (this.sensorMode === 'LIDAR' && dist > this.lidarMaxRange + 4) return;
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
    this.sensorMode = mode;
    const container = document.getElementById('three-canvas-container');
    const thermalScan = document.getElementById('thermal-scanlines');
    const nvgOverlay = document.getElementById('nvg-filter');
    const thermalLegend = document.getElementById('thermal-legend');
    const lidarOverlay = document.getElementById('lidar-hud-overlay');
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
      container.classList.remove('thermal-filter', 'thermal-mode', 'nvg-filter', 'nvg-mode', 'lidar-filter');
    }
    if (thermalScan) thermalScan.style.display = 'none';
    if (nvgOverlay) nvgOverlay.style.display = 'none';
    if (thermalLegend) thermalLegend.style.display = 'none';
    if (lidarOverlay) lidarOverlay.style.display = 'none';
    if (lidarPanel) lidarPanel.style.display = 'none';
    const nvgBadge = document.getElementById('nvg-hud-badge');
    if (nvgBadge) nvgBadge.style.display = 'none';

    // 3D LiDAR SLAM mode handling (Himanshu authentic system)
    const isLidar = (mode === 'LIDAR');
    if (this.drone && this.drone.scannerVolume) {
      this.drone.scannerVolume.visible = false;
    }

    if (this.lidarPointCloud) this.lidarPointCloud.visible = isLidar;
    if (this.lidarVolumeFrustum) this.lidarVolumeFrustum.visible = isLidar;
    if (this.lidarConeWireframe) this.lidarConeWireframe.visible = isLidar;
    if (this.lidarLaserBeams) this.lidarLaserBeams.visible = isLidar;
    if (this.lidarRangeRings) this.lidarRangeRings.visible = isLidar;
    if (this.movementVectorGroup) this.movementVectorGroup.visible = isLidar;
    if (this.lidarTrajectoryLine) this.lidarTrajectoryLine.visible = isLidar;

    if (isLidar) {
      if (container) container.classList.add('lidar-filter');
      if (lidarOverlay) lidarOverlay.style.display = 'block';
      // Enable authentic dark tactical void & fluorescent wireframe obstacle matrix
      if (this.environment && typeof this.environment.setLidarVisionMode === 'function') {
        this.environment.setLidarVisionMode(true);
      }
    } else {
      if (this.environment && typeof this.environment.setLidarVisionMode === 'function') {
        this.environment.setLidarVisionMode(false);
      }
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

    // Night Vision Engine Activation & Multi-Camera Sync
    const app = window.droneApp;
    const nvgEngine = (app && app.nightVisionEngine) ? app.nightVisionEngine : (this.nightVisionEngine || null);
    if (nvgEngine) {
      if (mode === 'NVG') {
        nvgEngine.enable();
      } else {
        nvgEngine.disable();
      }
    }

    if (mode === 'THERMAL') {
      if (container) {
        container.classList.add('thermal-mode');
      }
      if (thermalLegend) thermalLegend.style.display = 'flex';
    } else if (mode === 'NVG') {
      if (container) {
        container.classList.add('nvg-mode');
      }
      if (nvgOverlay) nvgOverlay.style.display = 'block';
    }
  }

  get currentMode() {
    return this.sensorMode;
  }
}

window.SensorFusionEngine = SensorFusionEngine;
