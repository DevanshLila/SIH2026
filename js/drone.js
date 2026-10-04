/**
 * AERORES-AI Drone Flight Dynamics & 3D Model
 * Hexacopter Search & Rescue Platform
 * Team Pegasus - SIH 2026
 */

class DroneModel {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.propellers = [];
    this.strobeLights = [];
    this.spotlight = null;
    this.lidarBeam = null;
    
    // Physics and state
    this.position = new THREE.Vector3(0, 0.2, 0);
    this.targetPosition = new THREE.Vector3(0, 15, 0);
    this.velocity = new THREE.Vector3(0, 0, 0);
    this.rotation = new THREE.Euler(0, 0, 0, 'YXZ');
    this.targetRotation = new THREE.Euler(0, 0, 0, 'YXZ');
    
    // Drone telemetry
    this.telemetry = {
      altitudeAGL: 0,
      altitudeBaro: 0,
      groundSpeed: 0,
      verticalSpeed: 0,
      pitch: 0,
      roll: 0,
      yaw: 0,
      batteryPercent: 98,
      batteryVoltage: 24.8,
      currentDraw: 26.5,
      motorRPM: 0,
      isArmed: false,
      isFlying: false,
      flightMode: 'STANDBY',
      satellites: 21,
      loraRssi: -74,
      uwbDistance: [4.2, 6.8, 11.5, 9.1],
      npuLoad: 42,
      heading: 0
    };

    this.create3DModel();
    this.scene.add(this.group);
  }

  create3DModel() {
    // 1. Central Avionics Hull (Hexagonal carbon fiber body)
    const hullGeo = new THREE.CylinderGeometry(0.85, 1.0, 0.35, 6);
    const carbonMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.35,
      metalness: 0.8
    });
    const hull = new THREE.Mesh(hullGeo, carbonMat);
    hull.castShadow = true;
    this.group.add(hull);

    // Top Dome (GPS Antenna & Electronics cover with Qualcomm/Pegasus marking)
    const domeGeo = new THREE.SphereGeometry(0.55, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    const domeMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      roughness: 0.2,
      metalness: 0.5
    });
    const dome = new THREE.Mesh(domeGeo, domeMat);
    dome.position.y = 0.17;
    this.group.add(dome);

    // GPS Mast
    const mastGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.45);
    const mastMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.9 });
    const mast = new THREE.Mesh(mastGeo, mastMat);
    mast.position.set(-0.35, 0.35, -0.35);
    const gpsPuckGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.08, 16);
    const gpsPuckMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2 });
    const gpsPuck = new THREE.Mesh(gpsPuckGeo, gpsPuckMat);
    gpsPuck.position.set(-0.35, 0.57, -0.35);
    this.group.add(mast);
    this.group.add(gpsPuck);

    // 2. Hexacopter Rotor Arms (6 arms radiating at 60 deg)
    const armGeo = new THREE.CylinderGeometry(0.05, 0.05, 2.2);
    const motorMountGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.18, 16);
    const motorMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.9, roughness: 0.2 });

    for (let i = 0; i < 6; i++) {
      const angle = (i * Math.PI) / 3;
      const armGroup = new THREE.Group();
      armGroup.rotation.y = angle;

      const arm = new THREE.Mesh(armGeo, carbonMat);
      arm.rotation.z = Math.PI / 2;
      arm.position.x = 1.1;
      armGroup.add(arm);

      // Motor bell
      const motor = new THREE.Mesh(motorMountGeo, motorMat);
      motor.position.x = 2.15;
      motor.position.y = 0.08;
      armGroup.add(motor);

      // Propeller (2-blade carbon fiber propeller)
      const propGroup = new THREE.Group();
      propGroup.position.set(2.15, 0.22, 0);

      const bladeGeo = new THREE.BoxGeometry(1.6, 0.02, 0.12);
      const bladeMat = new THREE.MeshStandardMaterial({
        color: (i % 2 === 0) ? 0x00f0ff : 0x0f172a,
        roughness: 0.2,
        metalness: 0.4
      });
      const blade = new THREE.Mesh(bladeGeo, bladeMat);
      propGroup.add(blade);
      armGroup.add(propGroup);

      this.propellers.push({
        group: propGroup,
        direction: (i % 2 === 0) ? 1 : -1
      });

      // Navigation LEDs on arm tips
      const ledGeo = new THREE.SphereGeometry(0.06, 8, 8);
      const isFront = (i === 0 || i === 1);
      const ledColor = isFront ? 0xff0033 : (i % 2 === 0 ? 0x00ff66 : 0x00f0ff);
      const ledMat = new THREE.MeshBasicMaterial({ color: ledColor });
      const led = new THREE.Mesh(ledGeo, ledMat);
      led.position.set(2.15, -0.06, 0);
      armGroup.add(led);

      this.group.add(armGroup);
    }

    // 3. Landing Gear Skids
    const skidMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.8 });
    const legGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.8);
    const footGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.8);

    [-0.6, 0.6].forEach(side => {
      const leg1 = new THREE.Mesh(legGeo, skidMat);
      leg1.position.set(side, -0.35, 0.4);
      leg1.rotation.z = side > 0 ? -0.25 : 0.25;
      this.group.add(leg1);

      const leg2 = new THREE.Mesh(legGeo, skidMat);
      leg2.position.set(side, -0.35, -0.4);
      leg2.rotation.z = side > 0 ? -0.25 : 0.25;
      this.group.add(leg2);

      const foot = new THREE.Mesh(footGeo, skidMat);
      foot.rotation.x = Math.PI / 2;
      foot.position.set(side * 1.15, -0.75, 0);
      this.group.add(foot);
    });

    // 4. Sensor Gimbal Pod (3-Axis Stabilized Turret underneath)
    const gimbalBaseGeo = new THREE.SphereGeometry(0.38, 16, 16);
    const gimbalMat = new THREE.MeshStandardMaterial({ color: 0x111827, metalness: 0.9, roughness: 0.1 });
    const gimbal = new THREE.Mesh(gimbalBaseGeo, gimbalMat);
    gimbal.position.y = -0.32;
    this.group.add(gimbal);

    // 4K Optical Camera Lens
    const lensGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.18, 16);
    const lensMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, metalness: 0.9, roughness: 0.1 });
    const lens = new THREE.Mesh(lensGeo, lensMat);
    lens.rotation.x = Math.PI / 2;
    lens.position.set(-0.12, -0.36, 0.32);
    this.group.add(lens);

    // FLIR Radiometric Thermal IR Lens (Germanium window with gold/amber tint)
    const thermalLensGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.16, 16);
    const thermalLensMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.95, roughness: 0.1 });
    const thermalLens = new THREE.Mesh(thermalLensGeo, thermalLensMat);
    thermalLens.rotation.x = Math.PI / 2;
    thermalLens.position.set(0.12, -0.36, 0.32);
    this.group.add(thermalLens);

    // LiDAR Rotating Puck / Dome (Slide 7 Sonar/LiDAR)
    const lidarGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.18, 20);
    const lidarMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.75 });
    const lidarPuck = new THREE.Mesh(lidarGeo, lidarMat);
    lidarPuck.position.set(0, -0.52, 0);
    this.group.add(lidarPuck);

    // Gas Sensor Sniffer Snout (MQ-4/MQ-7 sensor chamber)
    const snifferGeo = new THREE.CylinderGeometry(0.06, 0.08, 0.22, 8);
    const snifferMat = new THREE.MeshStandardMaterial({ color: 0xa855f7, metalness: 0.7 });
    const sniffer = new THREE.Mesh(snifferGeo, snifferMat);
    sniffer.rotation.x = Math.PI / 2;
    sniffer.position.set(0, -0.25, 0.55);
    this.group.add(sniffer);

    // 5. Downward Search & Rescue Spotlight
    this.spotlight = new THREE.SpotLight(0xffffff, 2.5, 45, Math.PI / 5, 0.45, 1.2);
    this.spotlight.position.set(0, -0.5, 0);
    this.spotlight.target.position.set(0, -25, 5);
    this.group.add(this.spotlight);
    this.group.add(this.spotlight.target);

    // 6. Dynamic LiDAR Scanning Rig (Realistic inverted downward scanning cone)
    this.lidarRig = new THREE.Group();
    this.lidarRig.position.set(0, -0.52, 0); // Apex anchored at LiDAR puck under drone

    const coneHeight = 24;
    const coneRadius = 12;

    // A. Outer translucent volumetric beam cone (Apex at y=0, widening downwards to y=-24)
    const coneGeo = new THREE.ConeGeometry(coneRadius, coneHeight, 32, 4, true);
    coneGeo.translate(0, -coneHeight / 2, 0);

    const coneMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      wireframe: false,
      transparent: true,
      opacity: 0.12,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    this.lidarCone = new THREE.Mesh(coneGeo, coneMat);
    this.lidarRig.add(this.lidarCone);

    // B. Inner wireframe scanning ribs (multi-channel beam array)
    const wireGeo = new THREE.ConeGeometry(coneRadius * 0.99, coneHeight, 16, 6, true);
    wireGeo.translate(0, -coneHeight / 2, 0);
    const wireMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      wireframe: true,
      transparent: true,
      opacity: 0.22,
      depthWrite: false
    });
    this.lidarWire = new THREE.Mesh(wireGeo, wireMat);
    this.lidarRig.add(this.lidarWire);

    // C. 360° Rotating Vertical Laser Fan / Scan Plane
    const fanPoints = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(coneRadius * 0.98, -coneHeight, 0),
      new THREE.Vector3(-coneRadius * 0.98, -coneHeight, 0)
    ];
    const fanGeo = new THREE.BufferGeometry().setFromPoints(fanPoints);
    fanGeo.setIndex([0, 1, 2]);
    const fanMat = new THREE.MeshBasicMaterial({
      color: 0x00ffcc,
      transparent: true,
      opacity: 0.26,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    this.lidarFan = new THREE.Mesh(fanGeo, fanMat);
    this.lidarRig.add(this.lidarFan);

    // D. Descending Laser Pulse Rings (travel down from puck to ground)
    this.lidarPulseRings = [];
    for (let i = 0; i < 3; i++) {
      const ringGeo = new THREE.RingGeometry(0.08, 0.22, 32);
      ringGeo.rotateX(-Math.PI / 2);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.45,
        side: THREE.DoubleSide,
        depthWrite: false
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.userData = { progress: i / 3 };
      this.lidarRig.add(ring);
      this.lidarPulseRings.push(ring);
    }

    this.group.add(this.lidarRig);
    this.lidarBeam = this.lidarRig; // backward compatibility
  }

  update(delta) {
    // 1. Spin propellers based on armed state & throttle
    const propSpeed = this.telemetry.isFlying ? 38 : (this.telemetry.isArmed ? 10 : 0);
    this.propellers.forEach(prop => {
      prop.group.rotation.y += propSpeed * prop.direction * delta;
    });

    // 2. Pulse LiDAR beam rotation & downward scanning wave animation
    if (this.lidarRig) {
      if (this.lidarWire) this.lidarWire.rotation.y += 2.2 * delta;
      if (this.lidarFan) this.lidarFan.rotation.y += 4.5 * delta;

      const coneHeight = 24;
      const coneRadius = 12;
      this.lidarPulseRings.forEach(ring => {
        ring.userData.progress = (ring.userData.progress + 0.45 * delta) % 1.0;
        const p = ring.userData.progress;
        ring.position.y = -p * coneHeight;
        const rScale = Math.max(0.1, p * coneRadius * 4.5);
        ring.scale.set(rScale, rScale, 1);
        ring.material.opacity = Math.sin(p * Math.PI) * 0.55;
      });
    }

    // 3. Flight physics interpolation toward target
    if (this.telemetry.isFlying) {
      const posError = new THREE.Vector3().subVectors(this.targetPosition, this.group.position);
      
      // Calculate speeds
      const moveSpeed = 7.5; // m/s
      const climbSpeed = 4.0; // m/s
      
      // Interpolate position
      const step = new THREE.Vector3(
        posError.x * Math.min(1, moveSpeed * delta),
        posError.y * Math.min(1, climbSpeed * delta),
        posError.z * Math.min(1, moveSpeed * delta)
      );

      this.group.position.add(step);
      this.velocity.copy(step).divideScalar(Math.max(0.001, delta));

      // Calculate roll/pitch based on horizontal velocity (banking/tilting physics)
      const targetRoll = -Math.max(-0.4, Math.min(0.4, this.velocity.x * 0.04));
      const targetPitch = Math.max(-0.4, Math.min(0.4, this.velocity.z * 0.04));
      
      // Smooth attitude
      this.group.rotation.z += (targetRoll - this.group.rotation.z) * 0.1;
      this.group.rotation.x += (targetPitch - this.group.rotation.x) * 0.1;

      // Smooth yaw to target
      this.group.rotation.y += (this.targetRotation.y - this.group.rotation.y) * 0.08;

      // Update telemetry
      this.telemetry.groundSpeed = Math.hypot(this.velocity.x, this.velocity.z);
      this.telemetry.verticalSpeed = this.velocity.y;
      this.telemetry.pitch = THREE.MathUtils.radToDeg(this.group.rotation.x);
      this.telemetry.roll = THREE.MathUtils.radToDeg(this.group.rotation.z);
      this.telemetry.yaw = THREE.MathUtils.radToDeg(this.group.rotation.y);
      this.telemetry.heading = ((this.telemetry.yaw % 360) + 360) % 360;

      // Battery discharge simulation
      if (this.telemetry.batteryPercent > 10) {
        this.telemetry.batteryPercent -= 0.004 * delta;
        this.telemetry.batteryVoltage = 22.2 + (this.telemetry.batteryPercent / 100) * 3.0;
      }
    } else {
      // Resting on ground
      this.group.position.y = 0.75;
      this.group.rotation.set(0, this.group.rotation.y, 0);
      this.telemetry.groundSpeed = 0;
      this.telemetry.verticalSpeed = 0;
      this.telemetry.pitch = 0;
      this.telemetry.roll = 0;
    }

    this.telemetry.altitudeAGL = Math.max(0, this.group.position.y - 0.75);
    this.telemetry.altitudeBaro = this.telemetry.altitudeAGL + 214.5; // ASL offset
    this.position.copy(this.group.position);
  }

  takeoff(altitude = 12) {
    this.telemetry.isArmed = true;
    this.telemetry.isFlying = true;
    this.telemetry.flightMode = 'TAKEOFF';
    this.targetPosition.set(this.group.position.x, altitude, this.group.position.z);
  }

  land() {
    this.telemetry.flightMode = 'LANDING';
    this.targetPosition.y = 0.75;
    setTimeout(() => {
      if (this.group.position.y <= 1.2) {
        this.telemetry.isFlying = false;
        this.telemetry.isArmed = false;
        this.telemetry.flightMode = 'LANDED';
      }
    }, 4000);
  }

  setWaypoint(x, y, z, yaw = null) {
    this.targetPosition.set(x, y, z);
    if (yaw !== null) {
      this.targetRotation.y = yaw;
    } else {
      // Face direction of travel
      const dx = x - this.group.position.x;
      const dz = z - this.group.position.z;
      if (Math.hypot(dx, dz) > 1.0) {
        this.targetRotation.y = Math.atan2(dx, dz);
      }
    }
  }

  toggleSpotlight(on = null) {
    if (on === null) {
      this.spotlight.visible = !this.spotlight.visible;
    } else {
      this.spotlight.visible = on;
    }
    return this.spotlight.visible;
  }
}

window.DroneModel = DroneModel;
