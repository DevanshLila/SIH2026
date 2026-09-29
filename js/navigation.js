/**
 * AERORES-AI Autonomous Navigation & Path Planning Engine
 * Implements: Lawnmower Coverage Grid, Spiral Search, GPS-Denied UWB Navigation, Manual Flight & Obstacle Avoidance
 * References: ROS2 Navigation2 (nav2) & NIST Response Robot Standards
 * Team Pegasus - SIH 2026
 */

class AutonomousNavigator {
  constructor(drone, environment) {
    this.drone = drone;
    this.environment = environment;

    this.navMode = 'GRID'; // 'GRID', 'SPIRAL', 'UWB_DENIED', 'MANUAL'
    this.waypoints = [];
    this.currentWaypointIndex = 0;
    this.waypointTolerance = 2.0; // meters

    this.searchAreaCoveredSqM = 0;
    this.totalSectorAreaSqM = 16000;
    this.isPaused = false;

    // Manual control keys state
    this.keys = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      up: false,
      down: false,
      yawLeft: false,
      yawRight: false
    };

    // Real-World GPS Reference Frame (Incident Command Datum)
    this.gpsReference = {
      baseLat: 26.144500, // Guwahati Assam Disaster Epicenter
      baseLng: 91.736200,
      metersPerDegLat: 111320,
      metersPerDegLng: 111320 * Math.cos(26.144500 * Math.PI / 180)
    };

    // Active Fed GPS Target Disaster Sector
    this.fedGpsSector = {
      isFed: false,
      sectorName: 'DEFAULT EMERGENCY GRID',
      minX: -32,
      maxX: 32,
      minZ: -30,
      maxZ: 30,
      centerLat: 26.144500,
      centerLng: 91.736200,
      widthMeters: 64,
      lengthMeters: 60,
      altitude: 14,
      laneSpacing: 10,
      cornerCoordinates: []
    };

    // Active Circular Disaster Search Sector
    this.isCircularSearch = false;
    this.circularSector = {
      isFed: false,
      sectorName: 'CIRCULAR DISASTER SECTOR',
      centerLat: 26.144500,
      centerLng: 91.736200,
      centerX: 0,
      centerZ: 0,
      radiusMeters: 35.0,
      altitude: 14.0
    };

    // Survivor Loitering & Rescue Ground Squad Transmission
    this.loiteringTarget = null;
    this.loiterTimer = 0;
    this.reportedSurvivors = new Set();

    // 3D Holographic Geofence Mesh in the scene
    this.geofenceGroup = new THREE.Group();
    this.drone.scene.add(this.geofenceGroup);

    this.initKeyboardControls();
    this.generateLawnmowerGrid();
  }

  meterOffsetToGps(x, z) {
    const lat = this.gpsReference.baseLat - (z / this.gpsReference.metersPerDegLat);
    const lng = this.gpsReference.baseLng + (x / this.gpsReference.metersPerDegLng);
    return { lat, lng };
  }

  gpsToMeterOffset(lat, lng) {
    const x = (lng - this.gpsReference.baseLng) * this.gpsReference.metersPerDegLng;
    const z = -(lat - this.gpsReference.baseLat) * this.gpsReference.metersPerDegLat;
    return { x, z };
  }

  feedGpsTargetArea({ centerLat, centerLng, widthMeters = 50, lengthMeters = 50, altitude = 14, laneSpacing = 9, sectorName = 'CUSTOM DISASTER SECTOR' }) {
    // 1. Calculate local coordinates from GPS
    const centerOffset = this.gpsToMeterOffset(centerLat, centerLng);
    const halfW = widthMeters / 2;
    const halfL = lengthMeters / 2;

    const minX = Math.max(-55, Math.min(55, centerOffset.x - halfW));
    const maxX = Math.max(-55, Math.min(55, centerOffset.x + halfW));
    const minZ = Math.max(-55, Math.min(55, centerOffset.z - halfL));
    const maxZ = Math.max(-55, Math.min(55, centerOffset.z + halfL));

    const nwGps = this.meterOffsetToGps(minX, minZ);
    const neGps = this.meterOffsetToGps(maxX, minZ);
    const seGps = this.meterOffsetToGps(maxX, maxZ);
    const swGps = this.meterOffsetToGps(minX, maxZ);

    this.fedGpsSector = {
      isFed: true,
      sectorName: sectorName,
      minX: minX,
      maxX: maxX,
      minZ: minZ,
      maxZ: maxZ,
      centerLat: centerLat,
      centerLng: centerLng,
      widthMeters: maxX - minX,
      lengthMeters: maxZ - minZ,
      altitude: altitude,
      laneSpacing: laneSpacing,
      cornerCoordinates: [
        { name: 'NW', ...nwGps },
        { name: 'NE', ...neGps },
        { name: 'SE', ...seGps },
        { name: 'SW', ...swGps }
      ]
    };

    // 2. Generate Optimized ROS2 Nav2 Lawnmower Grid inside the fed sector
    const waypoints = [];
    const stepZ = Math.max(6, laneSpacing);
    let forward = true;

    for (let z = minZ; z <= maxZ; z += stepZ) {
      if (forward) {
        waypoints.push(new THREE.Vector3(minX, altitude, z));
        waypoints.push(new THREE.Vector3(maxX, altitude, z));
      } else {
        waypoints.push(new THREE.Vector3(maxX, altitude, z));
        waypoints.push(new THREE.Vector3(minX, altitude, z));
      }
      forward = !forward;
    }

    this.waypoints = waypoints;
    this.currentWaypointIndex = 0;
    this.navMode = 'GRID';
    this.totalSectorAreaSqM = (maxX - minX) * (maxZ - minZ);
    this.searchAreaCoveredSqM = 0;

    // 3. Update Drone Telemetry
    this.drone.telemetry.satellites = 24;
    this.drone.telemetry.flightMode = `AUTO: GPS SECTOR [${sectorName}]`;

    // 4. Update 3D Holographic Geofence in the Scene
    this.update3DGeofence();

    // 5. Trigger Visual Notification Toast
    const toast = document.getElementById('tour-toast');
    const toastText = document.getElementById('tour-toast-text');
    if (toast && toastText) {
      toastText.innerHTML = `📍 <strong>DISASTER GPS UPLOADED:</strong> Sector locked to <strong>${centerLat.toFixed(5)}°N, ${centerLng.toFixed(5)}°E</strong> (${(maxX - minX).toFixed(0)}m &times; ${(maxZ - minZ).toFixed(0)}m). Autonomous coverage initiated!`;
      toast.style.display = 'flex';
      setTimeout(() => {
        if (!window.droneApp.tourActive && toast) toast.style.display = 'none';
      }, 5500);
    }

    return this.fedGpsSector;
  }

  update3DGeofence() {
    // Clear old geofence meshes
    while (this.geofenceGroup.children.length > 0) {
      const child = this.geofenceGroup.children[0];
      this.geofenceGroup.remove(child);
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    }

    if (!this.fedGpsSector.isFed) return;

    const { minX, maxX, minZ, maxZ, altitude } = this.fedGpsSector;

    // 1. Glowing Perimeter Boundary Wireframe
    const corners = [
      new THREE.Vector3(minX, 0.2, minZ),
      new THREE.Vector3(maxX, 0.2, minZ),
      new THREE.Vector3(maxX, 0.2, maxZ),
      new THREE.Vector3(minX, 0.2, maxZ),
      new THREE.Vector3(minX, 0.2, minZ)
    ];

    const perimeterGeo = new THREE.BufferGeometry().setFromPoints(corners);
    const perimeterMat = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      linewidth: 3
    });
    const perimeterLine = new THREE.Line(perimeterGeo, perimeterMat);
    this.geofenceGroup.add(perimeterLine);

    // Upper boundary at search altitude
    const topCorners = corners.map(p => new THREE.Vector3(p.x, altitude + 2, p.z));
    const topGeo = new THREE.BufferGeometry().setFromPoints(topCorners);
    const topMat = new THREE.LineDashedMaterial({
      color: 0x00f0ff,
      dashSize: 3,
      gapSize: 2
    });
    const topLine = new THREE.Line(topGeo, topMat);
    topLine.computeLineDistances();
    this.geofenceGroup.add(topLine);

    // 2. Holographic Boundary Fence Curtain Walls (Semi-transparent glowing planes)
    const wallHeight = altitude + 2;
    const wallMat = new THREE.MeshBasicMaterial({
      color: 0x0284c7,
      transparent: true,
      opacity: 0.12,
      side: THREE.DoubleSide,
      depthWrite: false
    });

    const w = maxX - minX;
    const l = maxZ - minZ;

    // North wall
    const nWallGeo = new THREE.PlaneGeometry(w, wallHeight);
    const nWall = new THREE.Mesh(nWallGeo, wallMat);
    nWall.position.set((minX + maxX) / 2, wallHeight / 2, minZ);
    this.geofenceGroup.add(nWall);

    // South wall
    const sWall = new THREE.Mesh(nWallGeo, wallMat);
    sWall.position.set((minX + maxX) / 2, wallHeight / 2, maxZ);
    this.geofenceGroup.add(sWall);

    // West wall
    const wWallGeo = new THREE.PlaneGeometry(l, wallHeight);
    const wWall = new THREE.Mesh(wWallGeo, wallMat);
    wWall.rotation.y = Math.PI / 2;
    wWall.position.set(minX, wallHeight / 2, (minZ + maxZ) / 2);
    this.geofenceGroup.add(wWall);

    // East wall
    const eWall = new THREE.Mesh(wWallGeo, wallMat);
    eWall.rotation.y = Math.PI / 2;
    eWall.position.set(maxX, wallHeight / 2, (minZ + maxZ) / 2);
    this.geofenceGroup.add(eWall);

    // 3. Corner Telemetry Beacon Pylons (4 vertical antenna towers)
    const cornerPts = [
      { x: minX, z: minZ },
      { x: maxX, z: minZ },
      { x: maxX, z: maxZ },
      { x: minX, z: maxZ }
    ];

    const pylonGeo = new THREE.CylinderGeometry(0.12, 0.18, wallHeight, 8);
    const pylonMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      metalness: 0.85
    });

    const beaconGeo = new THREE.SphereGeometry(0.35, 12, 12);
    const beaconMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });

    cornerPts.forEach(pt => {
      const pylon = new THREE.Mesh(pylonGeo, pylonMat);
      pylon.position.set(pt.x, wallHeight / 2, pt.z);
      this.geofenceGroup.add(pylon);

      const beacon = new THREE.Mesh(beaconGeo, beaconMat);
      beacon.position.set(pt.x, wallHeight, pt.z);
      this.geofenceGroup.add(beacon);
    });
  }

  feedCircularGpsTargetArea({ centerLat, centerLng, radiusMeters = 35.0, altitude = 14.0, sectorName = 'CIRCULAR DISASTER SECTOR' }) {
    // 1. Calculate local meter offset from center GPS
    const centerOffset = this.gpsToMeterOffset(centerLat, centerLng);
    const clampedRadius = Math.max(15, Math.min(65, radiusMeters));

    this.isCircularSearch = true;
    this.circularSector = {
      isFed: true,
      sectorName: sectorName,
      centerLat: centerLat,
      centerLng: centerLng,
      centerX: centerOffset.x,
      centerZ: centerOffset.z,
      radiusMeters: clampedRadius,
      altitude: altitude
    };

    // Also update rectangular bounds for general checks
    this.fedGpsSector = {
      isFed: true,
      sectorName: sectorName,
      minX: centerOffset.x - clampedRadius,
      maxX: centerOffset.x + clampedRadius,
      minZ: centerOffset.z - clampedRadius,
      maxZ: centerOffset.z + clampedRadius,
      centerLat: centerLat,
      centerLng: centerLng,
      widthMeters: clampedRadius * 2,
      lengthMeters: clampedRadius * 2,
      altitude: altitude,
      laneSpacing: 8,
      cornerCoordinates: [
        { name: 'NW', ...this.meterOffsetToGps(centerOffset.x - clampedRadius, centerOffset.z - clampedRadius) },
        { name: 'NE', ...this.meterOffsetToGps(centerOffset.x + clampedRadius, centerOffset.z - clampedRadius) },
        { name: 'SE', ...this.meterOffsetToGps(centerOffset.x + clampedRadius, centerOffset.z + clampedRadius) },
        { name: 'SW', ...this.meterOffsetToGps(centerOffset.x - clampedRadius, centerOffset.z + clampedRadius) }
      ]
    };

    // 2. Generate Expanding Archimedean Spiral Search strictly inside the circular radius
    const waypoints = [];
    const turns = Math.max(3, Math.floor(clampedRadius / 6.0));
    const totalPoints = turns * 20;

    // Start at center epicenter
    waypoints.push(new THREE.Vector3(centerOffset.x, altitude, centerOffset.z));

    for (let i = 1; i <= totalPoints; i++) {
      const frac = i / totalPoints;
      const theta = frac * (turns * Math.PI * 2);
      const r = frac * clampedRadius;
      const x = centerOffset.x + Math.cos(theta) * r;
      const z = centerOffset.z + Math.sin(theta) * r;
      waypoints.push(new THREE.Vector3(x, altitude, z));
    }

    this.waypoints = waypoints;
    this.currentWaypointIndex = 0;
    this.navMode = 'SPIRAL';
    this.totalSectorAreaSqM = Math.PI * clampedRadius * clampedRadius;
    this.searchAreaCoveredSqM = 0;

    // 3. Drone Telemetry & 3D Circular Geofence
    this.drone.telemetry.satellites = 24;
    this.drone.telemetry.flightMode = `AUTO: CIRCULAR GPS SEARCH (${clampedRadius.toFixed(0)}m R)`;
    this.update3DCircularGeofence();

    // 4. On-screen Toast Notification
    const toast = document.getElementById('tour-toast');
    const toastText = document.getElementById('tour-toast-text');
    if (toast && toastText) {
      toastText.innerHTML = `📍 <strong>CIRCULAR GPS AREA LOCKED:</strong> Radius <strong>${clampedRadius.toFixed(1)}m</strong> at <strong>${centerLat.toFixed(5)}°N, ${centerLng.toFixed(5)}°E</strong> (${Math.round(this.totalSectorAreaSqM)} m²). Autonomous coverage initiated!`;
      toast.style.display = 'flex';
      setTimeout(() => {
        if (!window.droneApp.tourActive && toast) toast.style.display = 'none';
      }, 5500);
    }

    return this.circularSector;
  }

  update3DCircularGeofence() {
    // Clear old geofence meshes
    while (this.geofenceGroup.children.length > 0) {
      const child = this.geofenceGroup.children[0];
      this.geofenceGroup.remove(child);
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    }

    if (!this.circularSector.isFed) return;

    const { centerX, centerZ, radiusMeters, altitude } = this.circularSector;
    const wallHeight = altitude + 2;

    // 1. Glowing Ground Circular Perimeter Ring
    const ringGeo = new THREE.RingGeometry(radiusMeters - 0.25, radiusMeters + 0.25, 64);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide
    });
    const groundRing = new THREE.Mesh(ringGeo, ringMat);
    groundRing.rotation.x = -Math.PI / 2;
    groundRing.position.set(centerX, 0.15, centerZ);
    this.geofenceGroup.add(groundRing);

    // Top Ring at ceiling altitude
    const topRing = groundRing.clone();
    topRing.position.set(centerX, wallHeight, centerZ);
    this.geofenceGroup.add(topRing);

    // 2. Semi-Transparent Cylindrical Holographic Curtain Fence
    const cylGeo = new THREE.CylinderGeometry(radiusMeters, radiusMeters, wallHeight, 64, 1, true);
    const cylMat = new THREE.MeshBasicMaterial({
      color: 0x0284c7,
      transparent: true,
      opacity: 0.12,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const cyl = new THREE.Mesh(cylGeo, cylMat);
    cyl.position.set(centerX, wallHeight / 2, centerZ);
    this.geofenceGroup.add(cyl);

    // 3. Center GPS Telemetry Antenna Pylon
    const pylonGeo = new THREE.CylinderGeometry(0.18, 0.25, wallHeight, 8);
    const pylonMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.85 });
    const pylon = new THREE.Mesh(pylonGeo, pylonMat);
    pylon.position.set(centerX, wallHeight / 2, centerZ);
    this.geofenceGroup.add(pylon);

    const beaconGeo = new THREE.SphereGeometry(0.5, 16, 16);
    const beaconMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
    const beacon = new THREE.Mesh(beaconGeo, beaconMat);
    beacon.position.set(centerX, wallHeight, centerZ);
    this.geofenceGroup.add(beacon);
  }

  dispatchRescueSquadAlert(survivor) {
    const gps = this.meterOffsetToGps(survivor.position.x, survivor.position.z);
    const banner = document.getElementById('rescue-dispatch-banner');
    const content = document.getElementById('rescue-dispatch-content');

    // Play tactical alarm audio chirp
    if (window.droneApp && window.droneApp.gcs) {
      window.droneApp.gcs.playAlarmBeep();
    }

    if (banner && content) {
      content.innerHTML = `
        <div style="font-weight:700; color:#38bdf8; font-size:0.75rem; margin-bottom:3px;">
          📡 TACTICAL DATA LINK [915 MHz LoRa &bull; MAVLink Encrypted]
        </div>
        <div><strong>TRANSMITTED TO:</strong> NDRF Quick Response Squad #4 & Central Drone Base Station</div>
        <div><strong>VICTIM LOCATED:</strong> <span style="color:#f1f5f9; font-weight:700;">${survivor.name || survivor.id}</span> [Triage: <span style="color:${survivor.triage === 'RED' ? '#ef4444' : '#f59e0b'}; font-weight:700;">${survivor.triage}</span>] &bull; <strong>FLIR TEMP:</strong> ${survivor.temperature}°C</div>
        <div><strong>GPS COORDINATES:</strong> <span class="mono" style="color:#00f0ff; font-weight:700;">${gps.lat.toFixed(6)}°N, ${gps.lng.toFixed(6)}°E</span> &bull; <strong>AGL ELEVATION:</strong> ${survivor.position.y.toFixed(1)}m</div>
        <div style="color:#10b981; font-size:0.68rem; margin-top:2px;">
          ✓ Extraction corridor plotted &bull; Ground squads dispatched &bull; Drone loitering over site
        </div>
      `;
      banner.style.display = 'block';
    }

    // Log to MAVLink Serial Log in GCS
    if (window.droneApp && window.droneApp.gcs) {
      const serialMsg = `[MAVLINK-TX] EMERGENCY PACKET: SURVIVOR ${survivor.id} LOCATED AT ${gps.lat.toFixed(6)}N, ${gps.lng.toFixed(6)}E. DISPATCHED TO NDRF SQUAD 4.`;
      window.droneApp.gcs.serialBuffer.push({
        time: new Date().toISOString().substring(11, 19),
        text: serialMsg,
        color: '#10b981'
      });
    }
  }

  setNavMode(mode) {
    this.navMode = mode;
    this.currentWaypointIndex = 0;
    this.waypoints = [];

    if (mode === 'GRID') {
      this.drone.telemetry.satellites = 21;
      this.drone.telemetry.flightMode = 'AUTO: LAWNMOWER GRID';
      this.generateLawnmowerGrid();
    } else if (mode === 'SPIRAL') {
      this.drone.telemetry.satellites = 19;
      this.drone.telemetry.flightMode = 'AUTO: SPIRAL RECON';
      this.generateSpiralPath();
    } else if (mode === 'UWB_DENIED') {
      // GPS-Denied indoor simulation
      this.drone.telemetry.satellites = 0; // GPS Lost!
      this.drone.telemetry.flightMode = 'GPS-DENIED: UWB SLAM';
      this.generateUWBPenetrationPath();
    } else if (mode === 'MANUAL') {
      this.drone.telemetry.flightMode = 'MANUAL TELEOPERATION';
    }
  }

  generateLawnmowerGrid() {
    const waypoints = [];
    const minX = -32, maxX = 32;
    const minZ = -30, maxZ = 30;
    const stepZ = 12;
    const altitude = 14;

    let forward = true;
    for (let z = minZ; z <= maxZ; z += stepZ) {
      if (forward) {
        waypoints.push(new THREE.Vector3(minX, altitude, z));
        waypoints.push(new THREE.Vector3(maxX, altitude, z));
      } else {
        waypoints.push(new THREE.Vector3(maxX, altitude, z));
        waypoints.push(new THREE.Vector3(minX, altitude, z));
      }
      forward = !forward;
    }

    this.waypoints = waypoints;
    this.currentWaypointIndex = 0;
  }

  generateSpiralPath() {
    const waypoints = [];
    const altitude = 15;
    const turns = 4;
    const maxRadius = 36;
    const points = 32;

    for (let i = 0; i <= points; i++) {
      const theta = (i / points) * (turns * Math.PI * 2);
      const r = (i / points) * maxRadius + 4;
      const x = Math.cos(theta) * r;
      const z = Math.sin(theta) * r;
      waypoints.push(new THREE.Vector3(x, altitude, z));
    }

    this.waypoints = waypoints;
    this.currentWaypointIndex = 0;
  }

  generateUWBPenetrationPath() {
    // Navigates low-altitude path entering collapsed structure corridor
    const waypoints = [
      new THREE.Vector3(-25, 4.5, -25),
      new THREE.Vector3(-15, 3.5, -15),
      new THREE.Vector3(-5, 3.0, -8),
      new THREE.Vector3(0, 3.2, 0),
      new THREE.Vector3(12, 3.5, 12),
      new THREE.Vector3(25, 4.0, 25)
    ];

    this.waypoints = waypoints;
    this.currentWaypointIndex = 0;
  }

  update(delta) {
    if (!this.drone.telemetry.isFlying) return;

    if (this.navMode === 'MANUAL') {
      this.handleManualFlight(delta);
    } else {
      this.handleAutonomousWaypointFollow(delta);
    }

    // Dynamic obstacle avoidance check
    this.checkObstacleAvoidance();
  }

  handleAutonomousWaypointFollow(delta) {
    const dronePos = this.drone.group.position;

    // 1. Survivor Loitering State (6-Second Loiter & Rescue Squad Alert)
    if (this.loiteringTarget) {
      this.loiterTimer -= delta;
      // Hover directly over survivor at safe observation altitude
      this.drone.setWaypoint(this.loiteringTarget.position.x, this.loiteringTarget.position.y + 7.5, this.loiteringTarget.position.z);
      this.drone.telemetry.flightMode = `LOITERING OVER VICTIM [${Math.max(0, this.loiterTimer).toFixed(1)}s]`;

      if (this.loiterTimer <= 0) {
        this.loiteringTarget = null;
        this.drone.telemetry.flightMode = this.isCircularSearch ? 'AUTO: CIRCULAR GPS SEARCH' : 'AUTO: LAWNMOWER GRID';
        const banner = document.getElementById('rescue-dispatch-banner');
        if (banner) {
          setTimeout(() => {
            if (!this.loiteringTarget && banner) banner.style.display = 'none';
          }, 2500);
        }
      }
      return;
    }

    // 2. Proximity Check for Un-Reported Detected Survivors (Auto-Loiter Trigger)
    if (this.environment && this.environment.survivors) {
      for (let s of this.environment.survivors) {
        if (s.detected && !this.reportedSurvivors.has(s.id)) {
          const dist = dronePos.distanceTo(s.position);
          if (dist < 18.0) {
            this.loiteringTarget = s;
            this.loiterTimer = 6.0; // 6-second loitering as specified by user
            this.reportedSurvivors.add(s.id);
            this.dispatchRescueSquadAlert(s);
            return;
          }
        }
      }
    }

    // 3. Normal Waypoint Following
    if (this.waypoints.length === 0) return;

    const targetWP = this.waypoints[this.currentWaypointIndex];
    const distToWP = dronePos.distanceTo(targetWP);

    // Set drone waypoint
    this.drone.setWaypoint(targetWP.x, targetWP.y, targetWP.z);

    // Accumulate search coverage
    if (this.searchAreaCoveredSqM < this.totalSectorAreaSqM) {
      this.searchAreaCoveredSqM += Math.min(65 * delta * this.drone.telemetry.groundSpeed, 80);
    }

    if (distToWP <= this.waypointTolerance) {
      this.currentWaypointIndex++;
      if (this.currentWaypointIndex >= this.waypoints.length) {
        // Completed route -> loop or return
        this.currentWaypointIndex = 0;
      }
    }
  }

  handleManualFlight(delta) {
    const speed = 12.0 * delta;
    const climbSpeed = 8.0 * delta;
    const yawRate = 2.0 * delta;

    const forwardVector = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(0, this.drone.group.rotation.y, 0));
    const rightVector = new THREE.Vector3(1, 0, 0).applyEuler(new THREE.Euler(0, this.drone.group.rotation.y, 0));

    const newTarget = this.drone.targetPosition.clone();

    if (this.keys.forward) newTarget.add(forwardVector.clone().multiplyScalar(speed));
    if (this.keys.backward) newTarget.add(forwardVector.clone().multiplyScalar(-speed));
    if (this.keys.right) newTarget.add(rightVector.clone().multiplyScalar(speed));
    if (this.keys.left) newTarget.add(rightVector.clone().multiplyScalar(-speed));
    if (this.keys.up) newTarget.y = Math.min(35, newTarget.y + climbSpeed);
    if (this.keys.down) newTarget.y = Math.max(1.5, newTarget.y - climbSpeed);

    let newYaw = this.drone.targetRotation.y;
    if (this.keys.yawLeft) newYaw += yawRate;
    if (this.keys.yawRight) newYaw -= yawRate;

    this.drone.targetPosition.copy(newTarget);
    this.drone.targetRotation.y = newYaw;
  }

  checkObstacleAvoidance() {
    // Proximity repulsion bubble
    const dronePos = this.drone.group.position;
    const minSafeAltitude = 1.2;

    if (dronePos.y < minSafeAltitude && this.drone.telemetry.isFlying && this.drone.telemetry.flightMode !== 'LANDING') {
      this.drone.targetPosition.y = minSafeAltitude + 0.5;
    }
  }

  returnToHome() {
    this.navMode = 'RTH';
    this.drone.telemetry.flightMode = 'EMERGENCY RTH';
    this.waypoints = [
      new THREE.Vector3(this.drone.group.position.x, 18, this.drone.group.position.z), // Climb clear
      new THREE.Vector3(0, 18, 0), // Return to origin
      new THREE.Vector3(0, 0.75, 0) // Land
    ];
    this.currentWaypointIndex = 0;
  }

  initKeyboardControls() {
    window.addEventListener('keydown', (e) => {
      switch (e.code) {
        case 'KeyW': this.keys.forward = true; break;
        case 'KeyS': this.keys.backward = true; break;
        case 'KeyA': this.keys.left = true; break;
        case 'KeyD': this.keys.right = true; break;
        case 'Space': case 'ArrowUp': this.keys.up = true; break;
        case 'ShiftLeft': case 'ArrowDown': this.keys.down = true; break;
        case 'KeyQ': case 'ArrowLeft': this.keys.yawLeft = true; break;
        case 'KeyE': case 'ArrowRight': this.keys.yawRight = true; break;
      }
    });

    window.addEventListener('keyup', (e) => {
      switch (e.code) {
        case 'KeyW': this.keys.forward = false; break;
        case 'KeyS': this.keys.backward = false; break;
        case 'KeyA': this.keys.left = false; break;
        case 'KeyD': this.keys.right = false; break;
        case 'Space': case 'ArrowUp': this.keys.up = false; break;
        case 'ShiftLeft': case 'ArrowDown': this.keys.down = false; break;
        case 'KeyQ': case 'ArrowLeft': this.keys.yawLeft = false; break;
        case 'KeyE': case 'ArrowRight': this.keys.yawRight = false; break;
      }
    });
  }
}

window.AutonomousNavigator = AutonomousNavigator;
