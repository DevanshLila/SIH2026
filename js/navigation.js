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

    // Return to Home (RTH) state
    this.isReturningHome = false;
    this.rthStatus = null; // null, 'RETURNING TO HOME', 'HOME REACHED'
    this.wasManualMode = false;
    this.rthPhase = null; // 'CLIMB', 'TRANSIT', 'DESCENT', 'ARRIVED'
    this.rthArrivedTimeout = null;

    // Manual control keys state (8 supported controls)
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

    // Strict 8-key keyboard mapping
    this.keyMap = {
      KeyW: 'forward',
      KeyS: 'backward',
      KeyA: 'left',
      KeyD: 'right',
      ArrowUp: 'up',
      ArrowDown: 'down',
      ArrowLeft: 'yawLeft',
      ArrowRight: 'yawRight'
    };

    // DOM element IDs for live HUD indicator highlights
    this.keyElementIds = {
      forward: { box: 'key-w', item: 'item-w' },
      backward: { box: 'key-s', item: 'item-s' },
      left: { box: 'key-a', item: 'item-a' },
      right: { box: 'key-d', item: 'item-d' },
      up: { box: 'key-up', item: 'item-up' },
      down: { box: 'key-down', item: 'item-down' },
      yawLeft: { box: 'key-left', item: 'item-left' },
      yawRight: { box: 'key-right', item: 'item-right' }
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
    if (this.drone && this.drone.scene) {
      this.drone.scene.add(this.geofenceGroup);
    }

    // Active 3D LiDAR Collision Avoidance Raycaster
    this.avoidanceRaycaster = new THREE.Raycaster();
    this.isAvoidingObstacle = false;

    this.initKeyboardControls();
    this.generateLawnmowerGrid();
  }

  updateNavButtonsUI(mode) {
    const navButtons = document.querySelectorAll('.nav-mode-btn');
    navButtons.forEach(btn => {
      if (btn.dataset.nav === mode) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
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
      toastText.innerHTML = `📍 <strong>MISSION UPLOADED:</strong> Fed GPS sector <strong>${sectorName}</strong> (${Math.round(this.totalSectorAreaSqM)} m²) with 3D Holographic Geofence barrier.`;
      toast.style.display = 'flex';
      setTimeout(() => {
        if (!window.droneApp.tourActive && toast) toast.style.display = 'none';
      }, 5000);
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

    if (!this.fedGpsSector || !this.fedGpsSector.isFed) return;

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

    if (!this.circularSector || !this.circularSector.isFed) return;

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
    if (window.droneApp && window.droneApp.gcs && typeof window.droneApp.gcs.playAlarmBeep === 'function') {
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

    // Append to live serial packet feed
    if (window.droneApp && window.droneApp.gcs && window.droneApp.gcs.serialBuffer) {
      const now = new Date().toTimeString().split(' ')[0];
      window.droneApp.gcs.serialBuffer.push(
        `[${now}] <span class="serial-line alert">[TACTICAL_DISPATCH] #ALERT: Survivor ${survivor.id} GPS: ${gps.lat.toFixed(6)}N, ${gps.lng.toFixed(6)}E -> NDRF Response Squad Dispatched</span>`
      );
    }
  }

  setNavMode(mode) {
    if (mode === 'RTH') {
      this.returnToHome();
      return;
    }

    // If cancelling or clearing RTH state by selecting another flight mode
    if (this.isReturningHome || this.navMode === 'RTH' || this.rthStatus) {
      this.isReturningHome = false;
      this.rthStatus = null;
      this.rthPhase = null;
      this.wasManualMode = false;
      if (this.rthArrivedTimeout) {
        clearTimeout(this.rthArrivedTimeout);
        this.rthArrivedTimeout = null;
      }
      this.updateRthStatusUI(null);
    }

    this.navMode = mode;
    this.currentWaypointIndex = 0;
    this.waypoints = [];

    // Keep footer nav mode buttons in sync
    this.updateNavButtonsUI(mode);

    if (mode === 'GRID') {
      if (this.fedGpsSector && this.fedGpsSector.isFed) {
        this.feedGpsTargetArea(this.fedGpsSector);
      } else {
        this.drone.telemetry.satellites = 21;
        this.drone.telemetry.flightMode = 'AUTO: LAWNMOWER GRID';
        this.generateLawnmowerGrid();
      }
    } else if (mode === 'SPIRAL') {
      if (this.isCircularSearch && this.circularSector && this.circularSector.isFed) {
        this.feedCircularGpsTargetArea(this.circularSector);
      } else {
        this.drone.telemetry.satellites = 19;
        this.drone.telemetry.flightMode = 'AUTO: SPIRAL RECON';
        this.generateSpiralPath();
      }
    } else if (mode === 'UWB_DENIED') {
      // GPS-Denied indoor simulation
      this.drone.telemetry.satellites = 0; // GPS Lost!
      this.drone.telemetry.flightMode = 'GPS-DENIED: UWB SLAM';
      this.generateUWBPenetrationPath();
    } else if (mode === 'MANUAL') {
      this.drone.telemetry.flightMode = 'MANUAL TELEOPERATION';
      if (this.drone.group) {
        this.drone.targetPosition.copy(this.drone.group.position);
        this.drone.targetRotation.y = this.drone.group.rotation.y;
      }
    }

    // Refresh header text for the newly activated mode
    const headerText = document.getElementById('header-status-text');
    if (headerText) {
      headerText.textContent = this.drone.telemetry.flightMode;
    }

    if (mode === 'MANUAL') {
      this.enableManualMode();
    } else {
      this.disableManualMode();
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
    } else if (this.navMode === 'RTH') {
      this.handleRthFlight(delta);
    } else {
      this.handleAutonomousWaypointFollow(delta);
    }

    // Dynamic obstacle avoidance check
    this.checkObstacleAvoidance();
  }

  handleAutonomousWaypointFollow(delta) {
    const dronePos = this.drone.group.position;

    // 1. Check if Drone is actively loitering above a confirmed survivor
    if (this.loiteringTarget) {
      this.drone.group.rotation.y += 0.8 * delta; // 360 observation pan
      this.loiterTimer -= delta;

      this.drone.telemetry.flightMode = `SURVIVOR CONFIRMED: LOITERING (${Math.max(0, Math.ceil(this.loiterTimer))}s)`;

      if (this.loiterTimer <= 0) {
        // Loiter complete -> resume autonomous reconnaissance search
        const banner = document.getElementById('rescue-dispatch-banner');
        setTimeout(() => {
          if (banner) banner.style.display = 'none';
        }, 4000);

        this.loiteringTarget = null;
        this.drone.telemetry.flightMode = 'MISSION RESUMED';
      }
      return;
    }

    // 2. Autonomous Survivor Interception & Loiter Trigger
    if (!this.isReturningHome && this.navMode !== 'RTH' && this.navMode !== 'MANUAL') {
      if (this.environment && this.environment.survivors) {
        for (let s of this.environment.survivors) {
          if (s.detected && !this.reportedSurvivors.has(s.id)) {
            const dist = dronePos.distanceTo(s.position);
            if (dist < 18.0) {
              // Lock onto survivor location for 6 seconds
              this.reportedSurvivors.add(s.id);
              this.loiteringTarget = s;
              this.loiterTimer = 6.0;

              // Hover stationary directly above survivor at 8m altitude
              this.drone.targetPosition.set(s.position.x, Math.max(7.5, s.position.y + 4.5), s.position.z);
              this.dispatchRescueSquadAlert(s);
              return;
            }
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

    // Relative to UAV orientation:
    // Nose/front is along +Z in drone coordinate system (heading 0 = +Z)
    // Right axis is along -X (Forward x Up = (0,0,1) x (0,1,0) = (-1,0,0))
    const forwardVector = new THREE.Vector3(0, 0, 1).applyEuler(new THREE.Euler(0, this.drone.group.rotation.y, 0));
    const rightVector = new THREE.Vector3(-1, 0, 0).applyEuler(new THREE.Euler(0, this.drone.group.rotation.y, 0));

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
    // Proximity repulsion bubble - ignore during RTH, landing, or when arrived at Home Station
    if (this.navMode === 'RTH' || this.isReturningHome || this.rthPhase === 'ARRIVED' ||
        this.drone.telemetry.flightMode === 'HOME REACHED' || this.drone.telemetry.flightMode === 'RETURNING TO HOME' ||
        this.drone.telemetry.flightMode === 'LANDING' || this.drone.telemetry.flightMode === 'LANDED' ||
        !this.drone.telemetry.isFlying) {
      this.isAvoidingObstacle = false;
      return;
    }

    const homePos = this.drone.homePosition || new THREE.Vector3(0, this.drone.groundElevation, 0);
    const dronePos = this.drone.group.position;
    // Also ignore when positioned at or near Home Station
    if (Math.hypot(dronePos.x - homePos.x, dronePos.z - homePos.z) < 1.8 && Math.abs(dronePos.y - homePos.y) < 1.0) {
      this.isAvoidingObstacle = false;
      return;
    }

    const minSafeAltitude = 1.2;
    if (dronePos.y < minSafeAltitude && this.drone.telemetry.isFlying) {
      this.drone.targetPosition.y = minSafeAltitude + 0.5;
    }

    // Active 3D LiDAR Obstacle Collision Avoidance System
    const colliders = this.environment ? this.environment.obstacleColliders : null;
    if (!colliders || colliders.length === 0) return;

    // Safety thresholds (industrial hexacopter rotor radius ~0.8m)
    const criticalStopDist = 2.4; // Absolute physical collision safety barrier
    const warningScanDist = 8.5; // Anticipatory climb & detour scanning bubble (8.5m)

    // Active flight trajectory heading vector
    const speedH = Math.hypot(this.drone.velocity.x, this.drone.velocity.z);
    let fwd = (speedH > 0.4)
      ? new THREE.Vector3(this.drone.velocity.x, 0, this.drone.velocity.z).normalize()
      : new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.drone.group.rotation.y);

    // Multi-directional LiDAR safety rays:
    // Forward, Left 35°, Right 35°, Left 70°, Right 70°, Rear, Down-Forward, Straight Down
    const scanRays = [
      { dir: fwd.clone(), weight: 1.2 },
      { dir: fwd.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.6), weight: 0.9 },
      { dir: fwd.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -0.6), weight: 0.9 },
      { dir: fwd.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), 1.2), weight: 0.7 },
      { dir: fwd.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -1.2), weight: 0.7 },
      { dir: fwd.clone().negate(), weight: 0.6 },
      { dir: new THREE.Vector3(fwd.x, -0.65, fwd.z).normalize(), weight: 1.1 },
      { dir: new THREE.Vector3(0, -1, 0), weight: 1.4 }
    ];

    let closestHit = null;
    let minDistance = warningScanDist;
    let avoidanceForce = new THREE.Vector3(0, 0, 0);

    for (let r of scanRays) {
      this.avoidanceRaycaster.set(dronePos, r.dir);
      this.avoidanceRaycaster.near = 0.25;
      this.avoidanceRaycaster.far = warningScanDist;

      const hits = this.avoidanceRaycaster.intersectObjects(colliders, true);
      if (hits.length > 0) {
        const hit = hits[0];
        // Exclude flat baseline ground when drone is at safe altitude
        if (hit.point.y < 0.45 && dronePos.y > 2.5 && r.dir.y < -0.85) continue;

        if (hit.distance < minDistance) {
          minDistance = hit.distance;
          closestHit = hit;
        }

        // Compute repulsive vector away from collider hit surface
        const repel = new THREE.Vector3().subVectors(dronePos, hit.point);
        const intensity = Math.max(0.1, (warningScanDist - hit.distance) / warningScanDist);
        repel.normalize().multiplyScalar(intensity * r.weight * 3.0);
        avoidanceForce.add(repel);
      }
    }

    // Apply Active Collision Prevention Reaction
    if (closestHit && minDistance < warningScanDist) {
      this.isAvoidingObstacle = true;

      // Vertical clearance: climb smoothly over the obstacle
      const obstacleTop = closestHit.point.y;
      const safeAltitude = obstacleTop + 3.2; // 3.2m safe clearance above obstacle
      if (this.drone.targetPosition.y < safeAltitude) {
        this.drone.targetPosition.y = Math.min(35, safeAltitude);
      }

      // Horizontal deflection: steer target away from obstacle
      this.drone.targetPosition.x += avoidanceForce.x * 0.14;
      this.drone.targetPosition.z += avoidanceForce.z * 0.14;

      // Absolute physical safety bumper: never allow drone body to penetrate inside collider
      if (closestHit.distance < criticalStopDist) {
        const pushback = new THREE.Vector3().subVectors(dronePos, closestHit.point).normalize();
        const penetration = criticalStopDist - closestHit.distance;
        this.drone.group.position.add(pushback.multiplyScalar(penetration));
        this.drone.velocity.multiplyScalar(0.45); // Dampen momentum on close approach
      }

      // Proximity alarm sound
      if (minDistance < 3.2 && window.droneApp && window.droneApp.gcs && typeof window.droneApp.gcs.playProximityBeep === 'function') {
        window.droneApp.gcs.playProximityBeep();
      }
    } else {
      this.isAvoidingObstacle = false;
    }
  }

  returnToHome() {
    if (this.isReturningHome && this.navMode === 'RTH' && this.rthPhase !== 'ARRIVED') {
      return; // Already actively returning
    }

    if (this.rthArrivedTimeout) {
      clearTimeout(this.rthArrivedTimeout);
      this.rthArrivedTimeout = null;
    }

    const wasManual = (this.navMode === 'MANUAL' || this.wasManualMode);
    this.wasManualMode = wasManual;

    // Stop manual keyboard movement and clear active key highlights
    this.resetKeys();

    if (wasManual) {
      // Keep the manual-control key panel visible, but clear all active key highlights
      const badge = document.getElementById('manual-hud-status-badge');
      if (badge) {
        badge.textContent = 'RETURNING TO HOME';
        badge.style.color = '#00f0ff';
        badge.style.borderColor = 'rgba(0, 240, 255, 0.6)';
      }
    } else {
      this.disableManualMode();
    }

    this.navMode = 'RTH';
    this.isReturningHome = true;
    this.rthStatus = 'RETURNING TO HOME';
    this.drone.telemetry.flightMode = 'RETURNING TO HOME';

    // Keep nav mode button highlighted
    this.updateNavButtonsUI('RTH');

    // Display "RETURNING TO HOME" status indicator
    this.updateRthStatusUI('RETURNING TO HOME');

    // Ensure drone is flying
    if (!this.drone.telemetry.isFlying) {
      this.drone.telemetry.isArmed = true;
      this.drone.telemetry.isFlying = true;
    }

    const homePos = this.drone.homePosition || new THREE.Vector3(0, this.drone.groundElevation, 0);
    const currentPos = this.drone.group.position;

    // Check if already at Home Station
    const horizDist = Math.hypot(currentPos.x - homePos.x, currentPos.z - homePos.z);
    const vertDist = Math.abs(currentPos.y - homePos.y);
    if (horizDist < 0.6 && vertDist < 0.5) {
      this.onHomeReached();
      return;
    }

    // Safe clearance altitude to avoid colliding with buildings, trees or terrain
    this.rthTransitAltitude = Math.max(18.0, Math.max(currentPos.y, homePos.y + 14.0));

    if (currentPos.y < this.rthTransitAltitude - 0.8) {
      this.rthPhase = 'CLIMB';
    } else {
      this.rthPhase = 'TRANSIT';
    }
  }

  handleRthFlight(delta) {
    const homePos = this.drone.homePosition || new THREE.Vector3(0, this.drone.groundElevation, 0);
    const homeRot = this.drone.homeRotation || new THREE.Euler(0, 0, 0, 'YXZ');
    const currentPos = this.drone.group.position;
    const safeAltitude = this.rthTransitAltitude || Math.max(18.0, homePos.y + 14.0);

    if (this.rthPhase === 'CLIMB') {
      // Step 1: Climb smoothly to safe clearance altitude
      this.drone.setWaypoint(currentPos.x, safeAltitude, currentPos.z);

      // Smoothly orient heading toward Home Station
      const dx = homePos.x - currentPos.x;
      const dz = homePos.z - currentPos.z;
      if (Math.hypot(dx, dz) > 1.0) {
        this.drone.targetRotation.y = Math.atan2(dx, dz);
      }

      if (currentPos.y >= safeAltitude - 0.8) {
        this.rthPhase = 'TRANSIT';
      }
    } else if (this.rthPhase === 'TRANSIT') {
      // Step 2: Smooth cruise at safe clearance altitude directly above Home Station
      this.drone.setWaypoint(homePos.x, safeAltitude, homePos.z);

      const horizDist = Math.hypot(currentPos.x - homePos.x, currentPos.z - homePos.z);
      if (horizDist <= 1.2) {
        this.rthPhase = 'DESCENT';
      }
    } else if (this.rthPhase === 'DESCENT') {
      // Step 3: Smooth final descent onto designated landing area and align launch orientation
      this.drone.setWaypoint(homePos.x, homePos.y, homePos.z, homeRot.y);

      const horizDist = Math.hypot(currentPos.x - homePos.x, currentPos.z - homePos.z);
      const vertDist = Math.abs(currentPos.y - homePos.y);
      if (horizDist <= 0.35 && vertDist <= 0.25) {
        this.onHomeReached();
      }
    } else if (this.rthPhase === 'ARRIVED') {
      // Stationed at Home Station landing pad: stop all return movement
      this.drone.group.position.copy(homePos);
      this.drone.targetPosition.copy(homePos);
      this.drone.group.rotation.set(0, homeRot.y, 0);
      this.drone.targetRotation.set(0, homeRot.y, 0);
      this.drone.velocity.set(0, 0, 0);
      this.drone.telemetry.groundSpeed = 0;
      this.drone.telemetry.verticalSpeed = 0;
    }
  }

  onHomeReached() {
    this.rthPhase = 'ARRIVED';
    this.isReturningHome = false;
    this.rthStatus = 'HOME REACHED';
    this.drone.telemetry.flightMode = 'HOME REACHED';

    const homePos = this.drone.homePosition || new THREE.Vector3(0, this.drone.groundElevation, 0);
    const homeRot = this.drone.homeRotation || new THREE.Euler(0, 0, 0, 'YXZ');

    // Position UAV at designated landing area and stop return movement
    this.drone.group.position.copy(homePos);
    this.drone.targetPosition.copy(homePos);
    this.drone.group.rotation.set(0, homeRot.y, 0);
    this.drone.targetRotation.set(0, homeRot.y, 0);
    this.drone.velocity.set(0, 0, 0);
    this.drone.telemetry.groundSpeed = 0;
    this.drone.telemetry.verticalSpeed = 0;
    this.waypoints = [];
    this.currentWaypointIndex = 0;

    // Display "HOME REACHED" status indicator
    this.updateRthStatusUI('HOME REACHED');

    // If Return to Home was activated while Manual Mode was active:
    // return control to the user according to the existing mode behavior
    if (this.wasManualMode) {
      setTimeout(() => {
        if (this.navMode === 'RTH') {
          this.navMode = 'MANUAL';
          this.rthStatus = null;
          this.rthPhase = null;
          this.wasManualMode = false;
          this.drone.telemetry.flightMode = 'MANUAL TELEOPERATION';
          this.updateNavButtonsUI('MANUAL');
          this.updateRthStatusUI(null);
          const badge = document.getElementById('manual-hud-status-badge');
          if (badge) {
            badge.textContent = 'ACTIVE';
            badge.style.color = '';
            badge.style.borderColor = '';
          }
          this.resetKeys();
        }
      }, 1500);
    }
  }

  updateRthStatusUI(status) {
    const hudIndicator = document.getElementById('hud-rth-indicator');
    const hudText = document.getElementById('hud-rth-text');
    const headerText = document.getElementById('header-status-text');
    const headerDot = document.getElementById('header-status-dot');
    const footerStatus = document.getElementById('footer-rth-status');
    const footerText = document.getElementById('footer-rth-text');
    const manualBadge = document.getElementById('manual-hud-status-badge');

    if (this.rthArrivedTimeout) {
      clearTimeout(this.rthArrivedTimeout);
      this.rthArrivedTimeout = null;
    }

    if (status === 'RETURNING TO HOME') {
      if (hudIndicator) {
        hudIndicator.style.display = 'flex';
        hudIndicator.classList.remove('arrived');
      }
      if (hudText) hudText.textContent = 'RETURNING TO HOME';
      if (headerText) headerText.textContent = 'RETURNING TO HOME';
      if (headerDot) {
        headerDot.style.background = '#00f0ff';
        headerDot.style.boxShadow = '0 0 10px #00f0ff';
      }
      if (footerStatus) footerStatus.style.display = 'flex';
      if (footerText) footerText.textContent = 'RETURNING TO HOME';
      if (manualBadge) {
        manualBadge.textContent = 'RETURNING TO HOME';
        manualBadge.style.color = '#00f0ff';
      }
    } else if (status === 'HOME REACHED') {
      if (hudIndicator) {
        hudIndicator.style.display = 'flex';
        hudIndicator.classList.add('arrived');
      }
      if (hudText) hudText.textContent = 'HOME REACHED';
      if (headerText) headerText.textContent = 'HOME REACHED';
      if (headerDot) {
        headerDot.style.background = '#10b981';
        headerDot.style.boxShadow = '0 0 10px #10b981';
      }
      if (footerStatus) footerStatus.style.display = 'flex';
      if (footerText) footerText.textContent = 'HOME REACHED';
      if (manualBadge) {
        manualBadge.textContent = 'HOME REACHED';
        manualBadge.style.color = '#10b981';
      }

      this.rthArrivedTimeout = setTimeout(() => {
        if (hudIndicator && this.navMode !== 'RTH') {
          hudIndicator.style.display = 'none';
        }
        if (footerStatus && this.navMode !== 'RTH') {
          footerStatus.style.display = 'none';
        }
      }, 3500);
    } else {
      if (hudIndicator) hudIndicator.style.display = 'none';
      if (footerStatus) footerStatus.style.display = 'none';
      if (headerText && this.navMode !== 'RTH') {
        headerText.textContent = this.drone.telemetry.flightMode || 'AUTONOMOUS SAR ACTIVE';
      }
      if (headerDot && this.navMode !== 'RTH') {
        headerDot.style.background = '#10b981';
        headerDot.style.boxShadow = '0 0 10px #10b981';
      }
      if (manualBadge && this.navMode === 'MANUAL') {
        manualBadge.textContent = 'ACTIVE';
        manualBadge.style.color = '';
        manualBadge.style.borderColor = '';
      }
    }
  }

  enableManualMode() {
    const panel = document.getElementById('manual-control-panel');
    if (panel) {
      panel.style.display = 'block';
    }
    const badge = document.getElementById('manual-hud-status-badge');
    if (badge) {
      badge.textContent = 'ACTIVE';
      badge.style.color = '';
      badge.style.borderColor = '';
    }
    this.resetKeys();
    this.bindHudPointerControls();
  }

  disableManualMode() {
    const panel = document.getElementById('manual-control-panel');
    if (panel) {
      panel.style.display = 'none';
    }
    this.resetKeys();
  }

  resetKeys() {
    for (const action of Object.keys(this.keys)) {
      this.keys[action] = false;
      this.updateKeyHighlight(action, false);
    }
  }

  getActionForEvent(e) {
    if (this.keyMap[e.code]) {
      return this.keyMap[e.code];
    }
    if (e.key === 'w' || e.key === 'W') return 'forward';
    if (e.key === 's' || e.key === 'S') return 'backward';
    if (e.key === 'a' || e.key === 'A') return 'left';
    if (e.key === 'd' || e.key === 'D') return 'right';
    if (e.key === 'ArrowUp') return 'up';
    if (e.key === 'ArrowDown') return 'down';
    if (e.key === 'ArrowLeft') return 'yawLeft';
    if (e.key === 'ArrowRight') return 'yawRight';
    return null;
  }

  updateKeyHighlight(action, isPressed) {
    const ids = this.keyElementIds[action];
    if (!ids) return;

    const box = document.getElementById(ids.box);
    const item = document.getElementById(ids.item);

    if (isPressed) {
      if (box) box.classList.add('active');
      if (item) item.classList.add('active');
    } else {
      if (box) box.classList.remove('active');
      if (item) item.classList.remove('active');
    }
  }

  handleKeyDown(e) {
    if (this.navMode !== 'MANUAL') return;

    // Prevent unwanted browser scrolling from arrow keys while Manual Mode is active
    const isArrow = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code) ||
                    ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key);
    if (isArrow) {
      e.preventDefault();
    }

    // Ignore key presses if user is focused inside an input/select/textarea
    const targetTag = e.target && e.target.tagName;
    if (targetTag === 'INPUT' || targetTag === 'SELECT' || targetTag === 'TEXTAREA') {
      return;
    }

    const action = this.getActionForEvent(e);
    if (!action) return;

    // Handle repeated keydown correctly: holding a key does not duplicate commands
    if (e.repeat || this.keys[action]) {
      return;
    }

    this.keys[action] = true;
    this.updateKeyHighlight(action, true);
  }

  handleKeyUp(e) {
    if (this.navMode !== 'MANUAL') return;

    const isArrow = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code) ||
                    ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key);
    if (isArrow) {
      e.preventDefault();
    }

    const action = this.getActionForEvent(e);
    if (!action) return;

    this.keys[action] = false;
    this.updateKeyHighlight(action, false);
  }

  bindHudPointerControls() {
    const items = document.querySelectorAll('.key-item[data-action]');
    items.forEach(item => {
      if (item._hasPointerBound) return;
      item._hasPointerBound = true;

      const action = item.dataset.action;
      if (!action) return;

      const onPress = (e) => {
        if (this.navMode !== 'MANUAL') return;
        e.preventDefault();
        this.keys[action] = true;
        this.updateKeyHighlight(action, true);
      };

      const onRelease = (e) => {
        if (this.navMode !== 'MANUAL') return;
        e.preventDefault();
        this.keys[action] = false;
        this.updateKeyHighlight(action, false);
      };

      item.addEventListener('mousedown', onPress);
      item.addEventListener('mouseup', onRelease);
      item.addEventListener('mouseleave', onRelease);
      item.addEventListener('touchstart', onPress, { passive: false });
      item.addEventListener('touchend', onRelease, { passive: false });
      item.addEventListener('touchcancel', onRelease, { passive: false });
    });
  }

  initKeyboardControls() {
    window.addEventListener('keydown', (e) => this.handleKeyDown(e));
    window.addEventListener('keyup', (e) => this.handleKeyUp(e));
    window.addEventListener('blur', () => {
      if (this.navMode === 'MANUAL') {
        this.resetKeys();
      }
    });

    this.bindHudPointerControls();
  }
}

window.AutonomousNavigator = AutonomousNavigator;
