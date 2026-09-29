/**
 * AERORES-AI Disaster Environment Generator - Ultra-Realistic Multi-Scenario System
 * Features:
 * 1. Post-Earthquake Urban Ruin (cracked roadways, pancaked slabs, rubble voids, fallen poles, dust)
 * 2. Assam-Style Severe Flood (muddy churning water, submerged vehicles, chang-ghar stilt huts, floating logs, rafts)
 * 3. Industrial Chemical Explosion (exterior tank farm & fully modeled damaged factory INTERIOR with broken machinery)
 * 4. Realistic 5-Survivor Rosters with unique postures & thermal cores for each scenario
 * 5. Dynamic Obstacle Colliders for clean geometric LiDAR raycasting
 * 6. Night-mode emergency beacons & scene lighting
 * Team Pegasus - SIH 2026
 */

class DisasterEnvironment {
  constructor(scene) {
    this.scene = scene;
    this.environmentGroup = new THREE.Group();
    this.survivors = [];
    this.hazards = [];
    this.particles = [];
    this.uwbAnchors = [];
    this.gasPlumeEmitter = null;
    this.obstacleColliders = []; // Real meshes used for LiDAR geometric raycasting
    this.emergencyLights = []; // Flashing emergency vehicle / scene lights
    this.waterMesh = null;
    this.currentScenario = 'earthquake';
    this.isNightMode = false;
    this.isLidarVision = false;
    this.originalMaterials = new Map();

    this.scene.add(this.environmentGroup);
    this.buildScenario(this.currentScenario);
  }

  clear() {
    while (this.environmentGroup.children.length > 0) {
      const obj = this.environmentGroup.children[0];
      this.environmentGroup.remove(obj);
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
        else obj.material.dispose();
      }
    }
    this.survivors = [];
    this.hazards = [];
    this.particles = [];
    this.uwbAnchors = [];
    this.gasPlumeEmitter = null;
    this.obstacleColliders = [];
    this.emergencyLights = [];
    this.waterMesh = null;
    this.originalMaterials.clear();
  }

  buildScenario(scenarioType) {
    this.clear();
    this.currentScenario = scenarioType;

    // 1. Base Terrain Ground
    this.createGround(scenarioType);

    // 2. Scenario-specific structures and elements
    if (scenarioType === 'earthquake') {
      this.buildEarthquakeScenario();
    } else if (scenarioType === 'chemical_fire') {
      this.buildIndustrialGasScenario();
    } else if (scenarioType === 'flash_flood') {
      this.buildAssamFloodScenario();
    }

    // 3. Setup UWB Indoor Navigation Beacons (GPS-denied reference anchors)
    this.createUWBAnchors();

    // 4. Update night mode lighting for new scenario
    this.setNightMode(this.isNightMode);
  }

  createGround(type) {
    if (type === 'flash_flood') {
      // 1. Muddy Flood Water Basin (Dynamic reflective water)
      const waterGeo = new THREE.PlaneGeometry(180, 180, 64, 64);
      const waterMat = new THREE.MeshStandardMaterial({
        color: 0x423828, // Churning brown flood mud
        roughness: 0.15,
        metalness: 0.65,
        transparent: true,
        opacity: 0.92,
        wireframe: false
      });
      const water = new THREE.Mesh(waterGeo, waterMat);
      water.rotation.x = -Math.PI / 2;
      water.position.y = 1.6; // Water surface elevation
      water.receiveShadow = true;
      this.environmentGroup.add(water);
      this.waterMesh = water;
      this.obstacleColliders.push(water);

      // Deep Riverbed / Muddy Substratum Ground underneath
      const groundGeo = new THREE.PlaneGeometry(180, 180, 16, 16);
      const groundMat = new THREE.MeshStandardMaterial({ color: 0x241d13, roughness: 0.95 });
      const ground = new THREE.Mesh(groundGeo, groundMat);
      ground.rotation.x = -Math.PI / 2;
      ground.position.y = -0.5;
      this.environmentGroup.add(ground);
    } else {
      // Concrete / Damaged Asphalt Ground
      const groundGeo = new THREE.PlaneGeometry(180, 180, 48, 48);
      const groundMat = new THREE.MeshStandardMaterial({
        color: 0x1a2130,
        roughness: 0.88,
        metalness: 0.12
      });
      const ground = new THREE.Mesh(groundGeo, groundMat);
      ground.rotation.x = -Math.PI / 2;
      ground.receiveShadow = true;
      this.environmentGroup.add(ground);
      this.obstacleColliders.push(ground);

      // Tactical Coordinate Grid
      const grid = new THREE.GridHelper(180, 36, 0x0284c7, 0x1e293b);
      grid.position.y = 0.05;
      this.environmentGroup.add(grid);
    }
  }

  // =========================================================================
  // SCENARIO 1: REALISTIC URBAN EARTHQUAKE DISASTER ENVIRONMENT
  // =========================================================================
  buildEarthquakeScenario() {
    const concreteMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.85 });
    const darkConcrete = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.9 });
    const rebarMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.85 });
    const asphaltMat = new THREE.MeshStandardMaterial({ color: 0x1e2430, roughness: 0.95 });
    const yellowStripe = new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.6 });

    // 1. Damaged Asphalt Main Boulevard with deep seismic fissures & elevation drops
    const roadGroup = new THREE.Group();
    const roadBed = new THREE.Mesh(new THREE.BoxGeometry(22, 0.3, 160), asphaltMat);
    roadBed.position.set(0, 0.15, 0);
    roadBed.receiveShadow = true;
    roadGroup.add(roadBed);
    this.obstacleColliders.push(roadBed);

    // Broken asphalt slabs creating road gaps & fault lines
    const fissurePositions = [-35, -12, 18, 42];
    fissurePositions.forEach((z, idx) => {
      const crack = new THREE.Mesh(new THREE.BoxGeometry(24, 0.7, 3.5), new THREE.MeshStandardMaterial({ color: 0x0b0f19 }));
      crack.position.set(0, 0.1, z);
      roadGroup.add(crack);

      // Buckled pavement slabs
      const buckled = new THREE.Mesh(new THREE.BoxGeometry(10, 0.4, 4), asphaltMat);
      buckled.position.set(idx % 2 === 0 ? 5 : -5, 0.5, z + 2);
      buckled.rotation.set(0.18 * (idx % 2 === 0 ? 1 : -1), 0.1, 0.15);
      roadGroup.add(buckled);
      this.obstacleColliders.push(buckled);
    });
    this.environmentGroup.add(roadGroup);

    // 2. Standing But Visibly Heavily Damaged Tower (Leaning Collapse)
    const towerGroup = new THREE.Group();
    towerGroup.position.set(-28, 0, -25);
    const towerCore = new THREE.Mesh(new THREE.BoxGeometry(20, 26, 18), concreteMat);
    towerCore.position.y = 13;
    towerCore.castShadow = true;
    towerGroup.add(towerCore);
    this.obstacleColliders.push(towerCore);

    // Sheared floors & exposed internal rebars
    for (let f = 1; f <= 3; f++) {
      const slabFloor = new THREE.Mesh(new THREE.BoxGeometry(22, 0.8, 20), darkConcrete);
      slabFloor.position.set(0, f * 7, 0);
      slabFloor.rotation.z = 0.08 * f;
      towerGroup.add(slabFloor);
      this.obstacleColliders.push(slabFloor);
    }
    // Leaning tilt
    towerGroup.rotation.z = 0.07;
    towerGroup.rotation.x = -0.05;
    this.environmentGroup.add(towerGroup);

    // 3. Pancaked Residential Building (Entire Roof & Top Floors Collapsed)
    const pancakeGroup = new THREE.Group();
    pancakeGroup.position.set(30, 0, -18);
    for (let i = 0; i < 4; i++) {
      const slab = new THREE.Mesh(new THREE.BoxGeometry(18 + i * 1.5, 0.9, 16 + i * 1.2), concreteMat);
      slab.position.set((Math.random() - 0.5) * 2, 1.2 + i * 1.6, (Math.random() - 0.5) * 2);
      slab.rotation.set((Math.random() - 0.5) * 0.15, Math.random() * 0.2, (Math.random() - 0.5) * 0.18);
      slab.castShadow = true;
      pancakeGroup.add(slab);
      this.obstacleColliders.push(slab);
    }
    this.environmentGroup.add(pancakeGroup);

    // 4. Large Rubble Field & Deep Concrete Voids
    const rubbleCount = 45;
    for (let i = 0; i < rubbleCount; i++) {
      const rx = (Math.random() - 0.5) * 55;
      const rz = (Math.random() - 0.5) * 55;
      // Keep clear of main center road
      if (Math.abs(rx) < 6 && Math.abs(rz) < 40) continue;

      const w = 2.5 + Math.random() * 6.5;
      const h = 0.8 + Math.random() * 3.2;
      const d = 2.5 + Math.random() * 6.5;

      const chunk = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), darkConcrete);
      chunk.position.set(rx, h / 2, rz);
      chunk.rotation.set(Math.random() * 0.45, Math.random() * Math.PI, Math.random() * 0.45);
      chunk.castShadow = true;
      this.environmentGroup.add(chunk);
      this.obstacleColliders.push(chunk);
    }

    // 5. Exposed Twisted Steel Rebar Struts
    for (let j = 0; j < 18; j++) {
      const rebar = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 4 + Math.random() * 5), rebarMat);
      rebar.position.set((Math.random() - 0.5) * 45, 2, (Math.random() - 0.5) * 45);
      rebar.rotation.set((Math.random() - 0.5) * 1.6, Math.random() * Math.PI, (Math.random() - 0.5) * 1.6);
      this.environmentGroup.add(rebar);
    }

    // 6. Fallen Concrete Utility Poles with Tangled Electrical Wires
    [-18, 14].forEach(x => {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 11), concreteMat);
      pole.position.set(x, 0.4, 8);
      pole.rotation.z = Math.PI / 2 + 0.15;
      pole.rotation.y = 0.4;
      this.environmentGroup.add(pole);
      this.obstacleColliders.push(pole);

      // Fallen transformer canister
      const trans = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.2, 12), rebarMat);
      trans.position.set(x + 4, 0.6, 9);
      trans.rotation.x = Math.PI / 2;
      this.environmentGroup.add(trans);
    });

    // 7. Abandoned Crushed Vehicles under Slabs
    const carMat = new THREE.MeshStandardMaterial({ color: 0x991b1b, roughness: 0.5 });
    const car = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.3, 2.1), carMat);
    car.position.set(-6, 0.7, 14);
    car.rotation.y = 0.4;
    this.environmentGroup.add(car);
    this.obstacleColliders.push(car);

    // Slab crushing vehicle hood
    const crushSlab = new THREE.Mesh(new THREE.BoxGeometry(6, 0.6, 4), darkConcrete);
    crushSlab.position.set(-5.5, 1.4, 15);
    crushSlab.rotation.set(0.3, 0.2, -0.2);
    this.environmentGroup.add(crushSlab);
    this.obstacleColliders.push(crushSlab);

    // 8. 5 Visible Earthquake Survivors (NDRF START Triage Protocol)
    // Survivor 1: Trapped under concrete slab in rubble void (RED: Immediate)
    this.addSurvivor({
      id: 'SURV-EQ-01',
      name: 'Trapped Adult in Void (Under Slab)',
      position: new THREE.Vector3(-9.5, 0.7, -7.5),
      posture: 'trapped',
      temperature: 37.2, // FLIR Thermal Body Heat
      triage: 'RED',
      vitals: 'HR: 114 bpm | Resp: 28/m | Crush Syndrome Risk',
      gasExposure: 'Trace Methane (24 ppm)',
      detected: false
    });

    // Survivor 2: Injured on cracked 3rd floor balcony waving (YELLOW: Urgent)
    this.addSurvivor({
      id: 'SURV-EQ-02',
      name: 'Resident on Sheared Balcony',
      position: new THREE.Vector3(-18.5, 14.5, -23),
      posture: 'waving',
      temperature: 36.9,
      triage: 'YELLOW',
      vitals: 'HR: 92 bpm | Left Arm Laceration',
      gasExposure: 'Clean Air',
      detected: false
    });

    // Survivor 3: Pinned victim in collapsed residential rubble (RED: Critical)
    this.addSurvivor({
      id: 'SURV-EQ-03',
      name: 'Pinned Survivor (Pancake Rubble)',
      position: new THREE.Vector3(26, 1.1, -16),
      posture: 'trapped',
      temperature: 37.1,
      triage: 'RED',
      vitals: 'HR: 125 bpm | Shallow Breathing',
      gasExposure: 'Elevated CO (42 ppm)',
      detected: false
    });

    // Survivor 4: Ambulatory survivor in road clearing (GREEN: Minor)
    this.addSurvivor({
      id: 'SURV-EQ-04',
      name: 'Disoriented Citizen in Street',
      position: new THREE.Vector3(2, 0.6, 26),
      posture: 'standing',
      temperature: 36.6,
      triage: 'GREEN',
      vitals: 'Stable | Minor Abrasions',
      gasExposure: 'Clean Air',
      detected: false
    });

    // Survivor 5: Stranded on exposed external fire escape (YELLOW: Urgent)
    this.addSurvivor({
      id: 'SURV-EQ-05',
      name: 'Stranded Resident (Fire Escape)',
      position: new THREE.Vector3(32, 5.8, -12),
      posture: 'waving',
      temperature: 36.8,
      triage: 'YELLOW',
      vitals: 'HR: 88 bpm | Dehydrated | Non-ambulatory',
      gasExposure: 'Clean Air',
      detected: false
    });

    // 9. Hazards: Ruptured Methane Conduit & Structural Smoke
    this.addGasLeakSource({
      id: 'HAZ-GAS-01',
      type: 'Methane (CH4)',
      position: new THREE.Vector3(-14, 0.4, 10),
      peakConcentrationPPM: 820,
      radius: 20,
      severity: 'EXPLOSIVE HAZARD'
    });

    this.addFireHazard({
      id: 'HAZ-FIRE-01',
      position: new THREE.Vector3(12, 0.6, 18),
      intensity: 1.4,
      radius: 6
    });

    // Add Emergency Vehicle Beacon Lights (Night-mode effect)
    this.addEmergencyBeaconLight(new THREE.Vector3(0, 1.2, 55));
    this.addEmergencyBeaconLight(new THREE.Vector3(-12, 1.2, 48));
  }

  // =========================================================================
  // SCENARIO 2: REALISTIC ASSAM-STYLE SEVERE FLOOD DISASTER ENVIRONMENT
  // =========================================================================
  buildAssamFloodScenario() {
    const tinRoofMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.8, roughness: 0.3 });
    const redTinRoof = new THREE.MeshStandardMaterial({ color: 0x991b1b, metalness: 0.7, roughness: 0.4 });
    const bambooMat = new THREE.MeshStandardMaterial({ color: 0xca8a04, roughness: 0.9 });
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.85 });
    const brickMat = new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.8 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.7 });

    // 1. Elevated Assam Stilt Houses ("Chang Ghar") with Water Submerging Lower Posts
    const houseConfigs = [
      { x: -28, z: -20, h: 5.5, roofMat: redTinRoof, roofType: 'tin' },
      { x: 0, z: -25, h: 6.8, roofMat: tinRoofMat, roofType: 'tin' },
      { x: 30, z: -18, h: 5.0, roofMat: redTinRoof, roofType: 'tin' },
      { x: -22, z: 22, h: 4.8, roofMat: bambooMat, roofType: 'thatch' }
    ];

    houseConfigs.forEach(cfg => {
      const houseGroup = new THREE.Group();
      houseGroup.position.set(cfg.x, 0, cfg.z);

      // Submerged stilts/piles rising out of floodwater
      const stiltGeo = new THREE.CylinderGeometry(0.12, 0.12, 3.5);
      [-4, 4].forEach(sx => {
        [-3.5, 3.5].forEach(sz => {
          const stilt = new THREE.Mesh(stiltGeo, woodMat);
          stilt.position.set(sx, 1.75, sz);
          houseGroup.add(stilt);
        });
      });

      // Living floor above water level
      const body = new THREE.Mesh(new THREE.BoxGeometry(9, 3.2, 8), bambooMat);
      body.position.y = 4.0;
      body.castShadow = true;
      houseGroup.add(body);
      this.obstacleColliders.push(body);

      // Pitch Corrugated Tin Roof
      const roof = new THREE.Mesh(new THREE.ConeGeometry(7, 2.6, 4), cfg.roofMat);
      roof.position.y = 6.8;
      roof.rotation.y = Math.PI / 4;
      roof.castShadow = true;
      houseGroup.add(roof);
      this.obstacleColliders.push(roof);

      this.environmentGroup.add(houseGroup);
    });

    // 2. Concrete Primary School Building (Flood Shelter with Lower Floor Inundated)
    const schoolGroup = new THREE.Group();
    schoolGroup.position.set(22, 0, 18);
    const schoolBody = new THREE.Mesh(new THREE.BoxGeometry(20, 8.5, 14), brickMat);
    schoolBody.position.y = 4.25; // 1.6m underwater
    schoolBody.castShadow = true;
    schoolGroup.add(schoolBody);
    this.obstacleColliders.push(schoolBody);

    // Concrete rooftop terrace parapet
    const parapet = new THREE.Mesh(new THREE.BoxGeometry(20.4, 0.9, 14.4), new THREE.MeshStandardMaterial({ color: 0x475569 }));
    parapet.position.y = 8.8;
    schoolGroup.add(parapet);
    this.obstacleColliders.push(parapet);

    // Overhead water tank tower on roof
    const tankTower = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 2.8, 16), new THREE.MeshStandardMaterial({ color: 0x0284c7 }));
    tankTower.position.set(6, 10.5, 3);
    schoolGroup.add(tankTower);
    this.obstacleColliders.push(tankTower);
    this.environmentGroup.add(schoolGroup);

    // 3. Partially Submerged Vehicles
    // Half-submerged truck cabin in floodwaters
    const truckMat = new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.4 });
    const truck = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.6, 6.2), truckMat);
    truck.position.set(-6, 2.1, 4); // Lower half submerged in water
    truck.rotation.set(0.12, 0.35, -0.08);
    this.environmentGroup.add(truck);
    this.obstacleColliders.push(truck);

    // Submerged Indian Auto-Rickshaw (roof and yellow hood protruding from water)
    const rickshawMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.5 });
    const autoRickshaw = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.6, 2.6), rickshawMat);
    autoRickshaw.position.set(8, 1.7, -8);
    autoRickshaw.rotation.set(0.15, -0.6, 0.1);
    this.environmentGroup.add(autoRickshaw);
    this.obstacleColliders.push(autoRickshaw);

    // 4. Floating Debris, Logs, and Tree Branches Bobbing in Floodwater
    for (let l = 0; l < 14; l++) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 4 + Math.random() * 4), woodMat);
      log.rotation.z = Math.PI / 2;
      log.rotation.y = Math.random() * Math.PI;
      log.position.set((Math.random() - 0.5) * 60, 1.62, (Math.random() - 0.5) * 60);
      this.environmentGroup.add(log);
    }

    // 5. Riverine Vegetation & Semi-Submerged Banana Trees
    const stemMat = new THREE.MeshStandardMaterial({ color: 0x4d7c0f, roughness: 0.8 });
    const treeCoords = [[-14, -8], [15, -12], [-32, 10], [12, 32], [-8, 28]];
    treeCoords.forEach(([tx, tz]) => {
      const treeGroup = new THREE.Group();
      treeGroup.position.set(tx, 1.2, tz);
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 4.5), stemMat);
      stem.position.y = 2.25;
      treeGroup.add(stem);

      // Banana fronds / palm canopy
      for (let f = 0; f < 5; f++) {
        const frond = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.08, 3.5), leafMat);
        frond.position.set(0, 4.2, 1.5);
        frond.rotation.x = 0.45;
        frond.rotation.y = (f * Math.PI * 2) / 5;
        treeGroup.add(frond);
      }
      this.environmentGroup.add(treeGroup);
      this.obstacleColliders.push(stem);
    });

    // 6. Traditional Wooden Rescue Boat (Dinghy) & Makeshift Bamboo Raft
    const raftGroup = new THREE.Group();
    raftGroup.position.set(-15, 1.65, 8);
    for (let r = 0; r < 6; r++) {
      const bLog = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 4.5), bambooMat);
      bLog.rotation.x = Math.PI / 2;
      bLog.position.x = (r - 2.5) * 0.32;
      raftGroup.add(bLog);
    }
    this.environmentGroup.add(raftGroup);
    this.obstacleColliders.push(raftGroup);

    // Country Boat (Canoe/Dinghy)
    const boat = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.9, 6.5), woodMat);
    boat.position.set(16, 1.7, -4);
    boat.rotation.y = 0.5;
    this.environmentGroup.add(boat);
    this.obstacleColliders.push(boat);

    // 7. 5 Visible Assam Flood Survivors (Stranded on Rooftops, Rafts, Trees)
    // Survivor 1: Family stranded on tin rooftop signaling UAV (RED: Immediate)
    this.addSurvivor({
      id: 'SURV-FL-01',
      name: 'Family on Corrugated Rooftop',
      position: new THREE.Vector3(0, 8.2, -25),
      posture: 'waving',
      temperature: 36.5,
      triage: 'RED',
      vitals: 'Severe Hypothermia Risk | Infant Present',
      gasExposure: 'Clean (River Gale)',
      detected: false
    });

    // Survivor 2: Villager clinging to drifting makeshift bamboo raft (YELLOW: Urgent)
    this.addSurvivor({
      id: 'SURV-FL-02',
      name: 'Villager on Bamboo Raft',
      position: new THREE.Vector3(-15, 2.3, 8),
      posture: 'sitting',
      temperature: 36.7,
      triage: 'YELLOW',
      vitals: 'HR: 96 bpm | Exhaustion | Adrift',
      gasExposure: 'Clean',
      detected: false
    });

    // Survivor 3: Survivor stranded on school building terrace (GREEN: Minor)
    this.addSurvivor({
      id: 'SURV-FL-03',
      name: 'Displaced Teacher (School Terrace)',
      position: new THREE.Vector3(20, 9.4, 16),
      posture: 'waving',
      temperature: 36.9,
      triage: 'GREEN',
      vitals: 'Stable | Signaling for Food/Water Droplet',
      gasExposure: 'Clean',
      detected: false
    });

    // Survivor 4: Trapped person on partially submerged tree branch (RED: Immediate)
    this.addSurvivor({
      id: 'SURV-FL-04',
      name: 'Trapped Citizen in Tree Canopy',
      position: new THREE.Vector3(15, 5.2, -12),
      posture: 'waving',
      temperature: 36.6,
      triage: 'RED',
      vitals: 'HR: 122 bpm | Water Surging Below',
      gasExposure: 'Clean',
      detected: false
    });

    // Survivor 5: Stranded farmer in elevated granary / stilt porch (YELLOW: Urgent)
    this.addSurvivor({
      id: 'SURV-FL-05',
      name: 'Farmer on Elevated Stilt Porch',
      position: new THREE.Vector3(-28, 5.8, -19),
      posture: 'standing',
      temperature: 36.8,
      triage: 'YELLOW',
      vitals: 'Isolated | Drinking Water Depleted',
      gasExposure: 'Clean',
      detected: false
    });

    // Emergency Rescue Boat Flashing Strobe (Night-mode effect)
    this.addEmergencyBeaconLight(new THREE.Vector3(16, 2.8, -4));
  }

  // =========================================================================
  // SCENARIO 3: REALISTIC INDUSTRIAL GAS LEAK & FACTORY BLAST ENVIRONMENT
  // =========================================================================
  buildIndustrialGasScenario() {
    const steelMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.85, roughness: 0.3 });
    const rustMat = new THREE.MeshStandardMaterial({ color: 0x9a3412, metalness: 0.6, roughness: 0.7 });
    const brightYellow = new THREE.MeshStandardMaterial({ color: 0xeab308, metalness: 0.5, roughness: 0.3 });
    const darkFactory = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.8 });
    const machineryMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.9, roughness: 0.2 });

    // 1. Exterior Chemical Tank Farm (Spheres, Silos & Manifolds)
    // Pressurized LPG/Ammonia Spherical Vessel (Ruptured with blast crater)
    const sphereGroup = new THREE.Group();
    sphereGroup.position.set(-22, 0, 15);
    const sphereLegs = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 5), steelMat);
    sphereLegs.position.y = 2.5;
    sphereGroup.add(sphereLegs);

    const chemSphere = new THREE.Mesh(new THREE.SphereGeometry(6, 24, 20), rustMat);
    chemSphere.position.y = 7.5;
    chemSphere.castShadow = true;
    sphereGroup.add(chemSphere);
    this.obstacleColliders.push(chemSphere);
    this.environmentGroup.add(sphereGroup);

    // Chemical Cylindrical Fractionating Silos
    [18, 30].forEach((x, idx) => {
      const silo = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.2, 22 + idx * 4, 24), steelMat);
      silo.position.set(x, (22 + idx * 4) / 2, 18);
      silo.castShadow = true;
      this.environmentGroup.add(silo);
      this.obstacleColliders.push(silo);

      // Elevated spiral ladder cage
      const cage = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 4.6, 22 + idx * 4, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0x64748b, wireframe: true }));
      cage.position.set(x, (22 + idx * 4) / 2, 18);
      this.environmentGroup.add(cage);
    });

    // Elevated Industrial Pipe Racks linking tanks to factory
    const pipeRackGroup = new THREE.Group();
    for (let p = 0; p < 4; p++) {
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 48), brightYellow);
      pipe.rotation.z = Math.PI / 2;
      pipe.position.set(2, 5.5 + p * 0.8, 16);
      pipeRackGroup.add(pipe);
    }
    this.environmentGroup.add(pipeRackGroup);

    // 2. Main Factory Complex with INTERIOR ACCESSIBILITY & BREACHED WALLS
    // Drone can literally look and fly INSIDE the factory!
    const factoryGroup = new THREE.Group();
    factoryGroup.position.set(0, 0, -22);

    // Factory Concrete Floor
    const factoryFloor = new THREE.Mesh(new THREE.BoxGeometry(36, 0.4, 26), darkFactory);
    factoryFloor.position.y = 0.2;
    factoryGroup.add(factoryFloor);
    this.obstacleColliders.push(factoryFloor);

    // Back Solid Wall
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(36, 12, 1.2), darkFactory);
    backWall.position.set(0, 6, -13);
    factoryGroup.add(backWall);
    this.obstacleColliders.push(backWall);

    // Left Wall
    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(1.2, 12, 26), darkFactory);
    leftWall.position.set(-18, 6, 0);
    factoryGroup.add(leftWall);
    this.obstacleColliders.push(leftWall);

    // Right Wall (Partially Breached)
    const rightWall1 = new THREE.Mesh(new THREE.BoxGeometry(1.2, 12, 12), darkFactory);
    rightWall1.position.set(18, 6, -7);
    factoryGroup.add(rightWall1);
    this.obstacleColliders.push(rightWall1);

    // FRONT BREACHED WALL (Huge 14-meter opening created by explosion blast!)
    const frontWallLeft = new THREE.Mesh(new THREE.BoxGeometry(8, 12, 1.2), darkFactory);
    frontWallLeft.position.set(-14, 6, 13);
    factoryGroup.add(frontWallLeft);
    this.obstacleColliders.push(frontWallLeft);

    const frontWallRight = new THREE.Mesh(new THREE.BoxGeometry(8, 12, 1.2), darkFactory);
    frontWallRight.position.set(14, 6, 13);
    factoryGroup.add(frontWallRight);
    this.obstacleColliders.push(frontWallRight);

    // Factory Roof with Collapsed Trusses (Open skylight for aerial UAV surveillance)
    const roofTruss1 = new THREE.Mesh(new THREE.BoxGeometry(36, 0.8, 10), darkFactory);
    roofTruss1.position.set(0, 12, -8);
    factoryGroup.add(roofTruss1);
    this.obstacleColliders.push(roofTruss1);

    // Collapsed Tilted Roof Section hanging down into interior
    const tiltedTruss = new THREE.Mesh(new THREE.BoxGeometry(16, 0.6, 14), darkFactory);
    tiltedTruss.position.set(-4, 7, 2);
    tiltedTruss.rotation.set(0.4, 0.1, -0.35);
    factoryGroup.add(tiltedTruss);
    this.obstacleColliders.push(tiltedTruss);

    // 3. FACTORY INTERIOR DETAILS: Heavy Machinery, Broken Boilers, Catwalks
    // Industrial Boiler (Central Machine)
    const boiler = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.5, 6, 16), machineryMat);
    boiler.rotation.z = Math.PI / 2;
    boiler.position.set(-6, 3, -4);
    boiler.castShadow = true;
    factoryGroup.add(boiler);
    this.obstacleColliders.push(boiler);

    // Electrical Switchgear & Generator Cabinets
    const gen = new THREE.Mesh(new THREE.BoxGeometry(4, 2.8, 2.5), machineryMat);
    gen.position.set(8, 1.4, -8);
    factoryGroup.add(gen);
    this.obstacleColliders.push(gen);

    // Elevated Mezzanine Catwalk inside Factory
    const catwalk = new THREE.Mesh(new THREE.BoxGeometry(18, 0.4, 3.5), steelMat);
    catwalk.position.set(4, 6.5, -9);
    factoryGroup.add(catwalk);
    this.obstacleColliders.push(catwalk);

    // Fallen cable trays & interior debris piles
    for (let c = 0; c < 8; c++) {
      const debris = new THREE.Mesh(new THREE.BoxGeometry(1.5 + Math.random() * 2, 0.6 + Math.random(), 1.5 + Math.random() * 2), darkFactory);
      debris.position.set((Math.random() - 0.5) * 24, 0.5, (Math.random() - 0.5) * 16);
      debris.rotation.y = Math.random() * Math.PI;
      factoryGroup.add(debris);
      this.obstacleColliders.push(debris);
    }
    this.environmentGroup.add(factoryGroup);

    // 4. Massive Ruptured Pipeline Manifold (Hazard Origin)
    const rupturedPipeGroup = new THREE.Group();
    rupturedPipeGroup.position.set(-16, 0, 12);
    const brokenFlange = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 3, 16), rustMat);
    brokenFlange.rotation.z = Math.PI / 3;
    brokenFlange.position.y = 1.5;
    rupturedPipeGroup.add(brokenFlange);
    this.environmentGroup.add(rupturedPipeGroup);

    // 5. Active Chemical Fire & Massive Toxic Gas Plume
    this.addFireHazard({
      id: 'HAZ-FIRE-IND',
      position: new THREE.Vector3(-14, 0.6, 12),
      intensity: 2.2,
      radius: 9
    });

    this.addGasLeakSource({
      id: 'HAZ-GAS-AMMONIA',
      type: 'Anhydrous Ammonia (NH3) & VOCs',
      position: new THREE.Vector3(-16, 2.0, 12),
      peakConcentrationPPM: 1480,
      radius: 30,
      severity: 'LETHAL TOXIC PLUME'
    });

    // Secondary localized methane vent near factory breach
    this.addGasLeakSource({
      id: 'HAZ-GAS-CH4-INT',
      type: 'Methane (CH4) Line Leak',
      position: new THREE.Vector3(2, 1.5, -9),
      peakConcentrationPPM: 640,
      radius: 14,
      severity: 'HIGH EXPLOSIVE'
    });

    // 6. 5 Visible Industrial Disaster Survivors (Inside & Around Facility)
    // Survivor 1: Chemical operator trapped in factory interior behind boiler (RED: Critical Inhalation)
    this.addSurvivor({
      id: 'SURV-GAS-01',
      name: 'Operator Trapped Behind Boiler (Interior)',
      position: new THREE.Vector3(-7, 1.0, -25),
      posture: 'trapped',
      temperature: 37.3,
      triage: 'RED',
      vitals: 'HR: 132 bpm | Toxic Inhalation (NH3 620 ppm)',
      gasExposure: 'LETHAL TOXIC ZONE',
      detected: false
    });

    // Survivor 2: Technician trapped on damaged interior mezzanine catwalk (YELLOW: Urgent)
    this.addSurvivor({
      id: 'SURV-GAS-02',
      name: 'Technician on Elevated Catwalk (Interior)',
      position: new THREE.Vector3(6, 7.3, -31),
      posture: 'waving',
      temperature: 36.9,
      triage: 'YELLOW',
      vitals: 'HR: 94 bpm | Catwalk Staircase Collapsed',
      gasExposure: 'Moderate (85 ppm)',
      detected: false
    });

    // Survivor 3: Maintenance worker pinned under fallen cable tray in factory (RED: Immediate)
    this.addSurvivor({
      id: 'SURV-GAS-03',
      name: 'Worker Pinned by Cable Tray (Interior)',
      position: new THREE.Vector3(8, 0.8, -18),
      posture: 'trapped',
      temperature: 37.0,
      triage: 'RED',
      vitals: 'HR: 118 bpm | Thoracic Compression',
      gasExposure: 'Elevated VOCs',
      detected: false
    });

    // Survivor 4: Chemical loader collapsed near ruptured tank valve (RED: Toxic Hazard)
    this.addSurvivor({
      id: 'SURV-GAS-04',
      name: 'Loader Collapsed Near Ruptured Tank',
      position: new THREE.Vector3(-18, 0.7, 18),
      posture: 'trapped',
      temperature: 37.4,
      triage: 'RED',
      vitals: 'Unconscious | Chemical Burn Risk',
      gasExposure: 'CRITICAL (1200+ ppm)',
      detected: false
    });

    // Survivor 5: Plant safety warden near exterior emergency muster gate (GREEN: Minor)
    this.addSurvivor({
      id: 'SURV-GAS-05',
      name: 'Safety Warden at Exterior Gate',
      position: new THREE.Vector3(26, 0.6, 2),
      posture: 'standing',
      temperature: 36.7,
      triage: 'GREEN',
      vitals: 'Ambulatory | Guiding Responders',
      gasExposure: 'Low (18 ppm)',
      detected: false
    });

    // Night Mode Factory Emergency Flashers
    this.addEmergencyBeaconLight(new THREE.Vector3(-22, 3.5, 8));
    this.addEmergencyBeaconLight(new THREE.Vector3(28, 2.5, 0));
  }

  // =========================================================================
  // SURVIVORS: HIGH-FIDELITY 3D HUMAN MODELS
  // =========================================================================
  addSurvivor(data) {
    const group = new THREE.Group();
    group.position.copy(data.position);

    // Anatomical body proportions
    // High-visibility orange / blue rescue clothing
    const vestMat = new THREE.MeshStandardMaterial({
      color: data.triage === 'RED' ? 0xe11d48 : (data.triage === 'YELLOW' ? 0xd97706 : 0x0284c7),
      roughness: 0.6
    });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xfbbf24, roughness: 0.7 });
    const pantsMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.8 });

    // Torso
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.24, 0.85, 10), vestMat);
    torso.position.y = 0.85;
    group.add(torso);

    // Head
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 14), skinMat);
    head.position.y = 1.45;
    group.add(head);

    // Legs
    const leftLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.08, 0.8), pantsMat);
    const rightLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.08, 0.8), pantsMat);

    // Arms
    const armMat = vestMat;
    const leftArm = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.07, 0.65), armMat);
    const rightArm = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.07, 0.65), armMat);

    if (data.posture === 'waving') {
      leftLeg.position.set(-0.16, 0.4, 0);
      rightLeg.position.set(0.16, 0.4, 0);
      // Left arm raised waving high in the air
      leftArm.position.set(-0.35, 1.25, 0);
      leftArm.rotation.z = 2.4;
      rightArm.position.set(0.35, 0.85, 0);
      rightArm.rotation.z = -0.3;
    } else if (data.posture === 'trapped') {
      // Horizontal / tilted under rubble
      group.rotation.x = Math.PI / 2.2;
      leftLeg.position.set(-0.15, 0.35, 0);
      rightLeg.position.set(0.15, 0.35, 0);
      leftArm.position.set(-0.32, 0.75, 0.1);
      rightArm.position.set(0.32, 0.75, -0.1);
    } else if (data.posture === 'sitting') {
      // Sitting with knees bent
      leftLeg.position.set(-0.16, 0.3, 0.25);
      leftLeg.rotation.x = Math.PI / 2;
      rightLeg.position.set(0.16, 0.3, 0.25);
      rightLeg.rotation.x = Math.PI / 2;
      leftArm.position.set(-0.35, 1.1, 0);
      leftArm.rotation.z = 2.1;
      rightArm.position.set(0.35, 0.75, 0);
    } else {
      // Standing
      leftLeg.position.set(-0.16, 0.4, 0);
      rightLeg.position.set(0.16, 0.4, 0);
      leftArm.position.set(-0.35, 0.85, 0);
      rightArm.position.set(0.35, 0.85, 0);
    }

    group.add(leftLeg);
    group.add(rightLeg);
    group.add(leftArm);
    group.add(rightArm);

    // FLIR Radiometric Thermal IR Heat Core Sphere
    // Emits vibrant infrared heat signature (36.5°C - 37.5°C) visible through darkness/rubble
    const heatCoreGeo = new THREE.SphereGeometry(0.7, 12, 12);
    const heatCoreMat = new THREE.MeshBasicMaterial({
      color: 0xffaa00,
      transparent: true,
      opacity: 0.4,
      wireframe: true
    });
    const heatCore = new THREE.Mesh(heatCoreGeo, heatCoreMat);
    heatCore.position.y = 1.0;
    group.add(heatCore);

    this.environmentGroup.add(group);
    data.meshGroup = group;
    data.wavingArm = (data.posture === 'waving' || data.posture === 'sitting') ? leftArm : null;
    this.obstacleColliders.push(torso);
    this.survivors.push(data);
  }

  // =========================================================================
  // HAZARDS: VOLUMETRIC GAS DISPERSION & FIRE
  // =========================================================================
  addFireHazard(data) {
    const fireGroup = new THREE.Group();
    fireGroup.position.copy(data.position);

    const fireLight = new THREE.PointLight(0xff6600, 3.5, 25, 1.4);
    fireLight.position.y = 1.6;
    fireGroup.add(fireLight);

    const count = 48;
    const pGeo = new THREE.BufferGeometry();
    const pPos = new Float32Array(count * 3);
    const pColors = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      pPos[i * 3] = (Math.random() - 0.5) * 3;
      pPos[i * 3 + 1] = Math.random() * 5.5;
      pPos[i * 3 + 2] = (Math.random() - 0.5) * 3;

      pColors[i * 3] = 1.0;
      pColors[i * 3 + 1] = Math.random() * 0.55;
      pColors[i * 3 + 2] = 0.05;
    }

    pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
    pGeo.setAttribute('color', new THREE.BufferAttribute(pColors, 3));

    const pMat = new THREE.PointsMaterial({
      size: 1.4,
      vertexColors: true,
      transparent: true,
      opacity: 0.85
    });

    const fireParticles = new THREE.Points(pGeo, pMat);
    fireGroup.add(fireParticles);

    this.environmentGroup.add(fireGroup);
    data.fireLight = fireLight;
    data.fireParticles = fireParticles;
    data.particleGeo = pGeo;
    this.hazards.push(data);
  }

  addGasLeakSource(data) {
    const gasGroup = new THREE.Group();
    gasGroup.position.copy(data.position);

    const pCount = 85;
    const pGeo = new THREE.BufferGeometry();
    const pPos = new Float32Array(pCount * 3);

    for (let i = 0; i < pCount; i++) {
      pPos[i * 3] = (Math.random() - 0.5) * 7;
      pPos[i * 3 + 1] = Math.random() * 9;
      pPos[i * 3 + 2] = (Math.random() - 0.5) * 7;
    }

    pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
    const pMat = new THREE.PointsMaterial({
      color: data.type.includes('Ammonia') ? 0xc084fc : 0x38bdf8,
      size: 2.0,
      transparent: true,
      opacity: 0.45
    });

    const gasCloud = new THREE.Points(pGeo, pMat);
    gasGroup.add(gasCloud);

    this.environmentGroup.add(gasGroup);
    data.gasCloud = gasCloud;
    data.particleGeo = pGeo;
    this.gasPlumeEmitter = data;
    this.hazards.push(data);
  }

  addEmergencyBeaconLight(pos) {
    const beacon = new THREE.PointLight(0xff0044, 2.5, 30, 2);
    beacon.position.copy(pos);
    this.environmentGroup.add(beacon);
    this.emergencyLights.push({ light: beacon, basePos: pos, phase: Math.random() * Math.PI });
  }

  createUWBAnchors() {
    const anchorCoords = [
      { id: 'UWB-ANC-01', pos: new THREE.Vector3(-38, 9, -38) },
      { id: 'UWB-ANC-02', pos: new THREE.Vector3(38, 9, -38) },
      { id: 'UWB-ANC-03', pos: new THREE.Vector3(38, 9, 38) },
      { id: 'UWB-ANC-04', pos: new THREE.Vector3(-38, 9, 38) }
    ];

    const tripodMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.8 });
    const puckMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });

    anchorCoords.forEach(a => {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, a.pos.y), tripodMat);
      pole.position.set(a.pos.x, a.pos.y / 2, a.pos.z);
      this.environmentGroup.add(pole);

      const puck = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.35), puckMat);
      puck.position.set(a.pos.x, a.pos.y, a.pos.z);
      this.environmentGroup.add(puck);

      this.uwbAnchors.push({ id: a.id, position: a.pos });
      this.obstacleColliders.push(pole);
    });
  }

  setNightMode(isNight) {
    this.isNightMode = isNight;
    this.emergencyLights.forEach(item => {
      item.light.visible = isNight;
    });
  }

  update(delta) {
    // 1. Animate survivors waving arms
    this.survivors.forEach(s => {
      if (s.wavingArm) {
        s.wavingArm.rotation.z = 2.2 + Math.sin(Date.now() * 0.007) * 0.45;
      }
    });

    // 2. Animate flood water waves and ripples (Assam scenario)
    if (this.waterMesh) {
      const time = Date.now() * 0.002;
      this.waterMesh.position.y = 1.6 + Math.sin(time) * 0.06;
    }

    // 3. Animate emergency vehicle beacon flashing (Night mode)
    if (this.isNightMode) {
      const now = Date.now() * 0.008;
      this.emergencyLights.forEach(item => {
        const isRed = Math.sin(now + item.phase) > 0;
        item.light.color.setHex(isRed ? 0xff0044 : 0x0066ff);
        item.light.intensity = 2.5 + Math.sin(now * 2) * 1.5;
      });
    }

    // 4. Animate fire & smoke particles
    this.hazards.forEach(h => {
      if (h.fireParticles && h.particleGeo) {
        const pos = h.particleGeo.attributes.position.array;
        for (let i = 1; i < pos.length; i += 3) {
          pos[i] += 4.5 * delta;
          if (pos[i] > 6) {
            pos[i] = 0.2;
            pos[i - 1] = (Math.random() - 0.5) * 2.5;
            pos[i + 1] = (Math.random() - 0.5) * 2.5;
          }
        }
        h.particleGeo.attributes.position.needsUpdate = true;
        if (h.fireLight) {
          h.fireLight.intensity = 2.8 + Math.sin(Date.now() * 0.02) * 1.2;
        }
      }

      // Animate chemical gas plume drift & dispersion
      if (h.gasCloud && h.particleGeo) {
        const gPos = h.particleGeo.attributes.position.array;
        for (let j = 0; j < gPos.length; j += 3) {
          gPos[j + 1] += 1.6 * delta; // rise
          gPos[j] += 1.4 * delta;     // wind drift along X
          if (gPos[j + 1] > 9.5) {
            gPos[j + 1] = 0.5;
            gPos[j] = (Math.random() - 0.5) * 2.5;
            gPos[j + 2] = (Math.random() - 0.5) * 2.5;
          }
        }
        h.particleGeo.attributes.position.needsUpdate = true;
      }
    });
  }

  getGasConcentrationAt(pos) {
    if (!this.gasPlumeEmitter) return 15; // Ambient baseline
    const dist = pos.distanceTo(this.gasPlumeEmitter.position);
    if (dist > this.gasPlumeEmitter.radius) return 15;
    
    // Gaussian dispersion gradient model
    const factor = Math.exp(-Math.pow(dist / (this.gasPlumeEmitter.radius * 0.45), 2));
    return Math.round(15 + factor * this.gasPlumeEmitter.peakConcentrationPPM);
  }

  setLidarVisionMode(enable) {
    this.isLidarVision = enable;

    // 1. Dark Tactical SLAM Void Background & Atmospheric Fog
    if (this.scene) {
      if (enable) {
        if (!this.savedSceneBackground) {
          this.savedSceneBackground = this.scene.background ? this.scene.background.clone() : new THREE.Color(0x040814);
          this.savedSceneFog = this.scene.fog ? { color: this.scene.fog.color.clone(), density: this.scene.fog.density } : null;
        }
        this.scene.background = new THREE.Color(0x010307); // Pitch black tactical void
        this.scene.fog = new THREE.FogExp2(0x010307, 0.016);
      } else if (this.savedSceneBackground) {
        this.scene.background = this.savedSceneBackground.clone();
        if (this.savedSceneFog) {
          this.scene.fog = new THREE.FogExp2(this.savedSceneFog.color.getHex(), this.savedSceneFog.density);
        }
      }
    }

    // 2. High-Definition Fluorescent Wireframe Matrix for Obstacles & Victims
    this.environmentGroup.traverse(child => {
      if (child.isMesh && child !== this.waterMesh) {
        if (enable) {
          if (!this.originalMaterials.has(child)) {
            this.originalMaterials.set(child, child.material);
          }
          
          const isSurvivor = (child.name && child.name.includes('survivor')) || child.userData?.isSurvivor;
          const isHazard = (child.name && child.name.includes('hazard')) || child.userData?.isHazard;

          if (isSurvivor) {
            // High-visibility glowing fluorescent green victim core
            child.material = new THREE.MeshBasicMaterial({
              color: 0x00ff66,
              wireframe: false,
              transparent: true,
              opacity: 0.95
            });
          } else if (isHazard) {
            // Warning Red for hazardous materials
            child.material = new THREE.MeshBasicMaterial({
              color: 0xef4444,
              wireframe: true,
              transparent: true,
              opacity: 0.75,
              depthWrite: false
            });
          } else {
            // Structural geometry & collapsed rubble in luminous Cyan SLAM Matrix
            child.material = new THREE.MeshBasicMaterial({
              color: 0x06b6d4,
              wireframe: true,
              transparent: true,
              opacity: 0.55,
              depthWrite: false
            });
          }
        } else {
          // Restore original realistic PBR material
          if (this.originalMaterials.has(child)) {
            child.material = this.originalMaterials.get(child);
          }
        }
      }
    });

    if (!enable) {
      this.originalMaterials.clear();
    }
  }
}

window.DisasterEnvironment = DisasterEnvironment;
