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

    this.initKeyboardControls();
    this.generateLawnmowerGrid();
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
