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
    if (this.waypoints.length === 0) return;

    const targetWP = this.waypoints[this.currentWaypointIndex];
    const dronePos = this.drone.group.position;
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
