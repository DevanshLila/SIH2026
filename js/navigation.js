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
        this.drone.telemetry.flightMode === 'LANDING' || this.drone.telemetry.flightMode === 'LANDED') {
      return;
    }

    const homePos = this.drone.homePosition || new THREE.Vector3(0, this.drone.groundElevation, 0);
    const dronePos = this.drone.group.position;
    // Also ignore when positioned at or near Home Station
    if (Math.hypot(dronePos.x - homePos.x, dronePos.z - homePos.z) < 1.5 && Math.abs(dronePos.y - homePos.y) < 0.6) {
      return;
    }

    const minSafeAltitude = 1.2;
    if (dronePos.y < minSafeAltitude && this.drone.telemetry.isFlying) {
      this.drone.targetPosition.y = minSafeAltitude + 0.5;
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
