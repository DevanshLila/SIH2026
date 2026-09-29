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
    this.waterGeo = null;
    this.waterInitialZ = null;
    this.channelMesh = null;
    this.channelGeo = null;
    this.channelInitialZ = null;
    this.floatingObjects = []; // Objects bobbing on water
    this.currentScenario = 'earthquake';
    this.isNightMode = false;

    this.scene.add(this.environmentGroup);
    this.buildScenario(this.currentScenario);
  }

  clear() {
    while (this.environmentGroup.children.length > 0) {
      const obj = this.environmentGroup.children[0];
      this.environmentGroup.remove(obj);
      obj.traverse(child => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
          else child.material.dispose();
        }
      });
    }
    this.survivors = [];
    this.hazards = [];
    this.particles = [];
    this.uwbAnchors = [];
    this.gasPlumeEmitter = null;
    this.obstacleColliders = [];
    this.emergencyLights = [];
    this.waterMesh = null;
    this.waterGeo = null;
    this.waterInitialZ = null;
    this.channelMesh = null;
    this.channelGeo = null;
    this.channelInitialZ = null;
    this.floatingObjects = [];
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
      // 1. Natural Flood Water Basin (Dynamic reflective blue water)
      const waterGeo = new THREE.PlaneGeometry(240, 240, 64, 64);
      const waterMat = new THREE.MeshStandardMaterial({
        color: 0x1e6091, // Realistic natural medium/deep blue
        roughness: 0.10,
        metalness: 0.32,
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide
      });
      const water = new THREE.Mesh(waterGeo, waterMat);
      water.rotation.x = -Math.PI / 2;
      water.position.y = 1.48; // Main flood water surface elevation
      water.receiveShadow = true;
      this.environmentGroup.add(water);
      this.waterMesh = water;
      this.waterGeo = waterGeo;
      this.waterInitialZ = new Float32Array(waterGeo.attributes.position.array);
      this.obstacleColliders.push(water);

      // 2. Churning Deep River Current Channel (Darker deep blue corridor)
      const channelGeo = new THREE.PlaneGeometry(240, 44, 48, 12);
      const channelMat = new THREE.MeshStandardMaterial({
        color: 0x0f4c81, // Deep oceanic navy blue channel
        roughness: 0.08,
        metalness: 0.38,
        transparent: true,
        opacity: 0.88,
        side: THREE.DoubleSide
      });
      const channel = new THREE.Mesh(channelGeo, channelMat);
      channel.rotation.x = -Math.PI / 2;
      channel.rotation.z = 0.22;
      channel.position.set(0, 1.49, 0);
      this.environmentGroup.add(channel);
      this.channelMesh = channel;
      this.channelGeo = channelGeo;
      this.channelInitialZ = new Float32Array(channelGeo.attributes.position.array);

      // 3. Elevated Terraced Flooded Paddies & Retention Basins (Multi-level water depths)
      const matTerraceWater = new THREE.MeshStandardMaterial({
        color: 0x168aad, // Crisp turquoise/azure flood water
        roughness: 0.10,
        metalness: 0.28,
        transparent: true,
        opacity: 0.82,
        side: THREE.DoubleSide
      });
      const terracePools = [
        { x: -32, z: 26, w: 28, d: 24, y: 1.62 }, // Higher western flooded terrace
        { x: 34, z: 24, w: 32, d: 26, y: 1.58 }   // Higher eastern retention basin
      ];
      terracePools.forEach(tp => {
        const pool = new THREE.Mesh(new THREE.PlaneGeometry(tp.w, tp.d, 8, 8), matTerraceWater);
        pool.rotation.x = -Math.PI / 2;
        pool.position.set(tp.x, tp.y, tp.z);
        pool.receiveShadow = true;
        this.environmentGroup.add(pool);

        // Retention earthen mud bunds ("ali") holding water in higher terraces
        const bundMat = new THREE.MeshStandardMaterial({ color: 0x5a4328, roughness: 0.92 });
        const bundH = 0.35;
        [-tp.d / 2, tp.d / 2].forEach(bz => {
          const bMesh = new THREE.Mesh(new THREE.BoxGeometry(tp.w + 0.8, bundH, 0.9), bundMat);
          bMesh.position.set(tp.x, tp.y + 0.05, tp.z + bz);
          bMesh.receiveShadow = true;
          this.environmentGroup.add(bMesh);
          this.obstacleColliders.push(bMesh);
        });
        [-tp.w / 2, tp.w / 2].forEach(bx => {
          const bMesh = new THREE.Mesh(new THREE.BoxGeometry(0.9, bundH, tp.d), bundMat);
          bMesh.position.set(tp.x + bx, tp.y + 0.05, tp.z);
          bMesh.receiveShadow = true;
          this.environmentGroup.add(bMesh);
          this.obstacleColliders.push(bMesh);
        });
      });

      // 4. Emerging Mud Shoals, Riverbank Sandbars & High-Ground Islands ("Chapori")
      const shoalMat = new THREE.MeshStandardMaterial({
        color: 0x786b59, // Silt & alluvial river sediment
        roughness: 0.88,
        metalness: 0.1
      });
      const grassShoalMat = new THREE.MeshStandardMaterial({
        color: 0x16a34a, // Riverbank alluvial grass (lush green)
        roughness: 0.90
      });
      const shoalIslands = [
        { x: -30, z: -22, w: 34, d: 26, y: 1.55, hasGrass: true }, // West homestead island
        { x: 26, z: -26, w: 28, d: 24, y: 1.56, hasGrass: true },  // East bank
        { x: -16, z: 22, w: 22, d: 20, y: 1.53, hasGrass: false }, // River silt bar
        { x: 28, z: 20, w: 38, d: 32, y: 1.55, hasGrass: true },  // Public building terrace bank
        { x: -6, z: -14, w: 16, d: 14, y: 1.52, hasGrass: false }  // Breached eddy sandbar
      ];
      shoalIslands.forEach(si => {
        const island = new THREE.Mesh(new THREE.BoxGeometry(si.w, 0.45, si.d), si.hasGrass ? grassShoalMat : shoalMat);
        island.position.set(si.x, si.y - 0.15, si.z);
        island.receiveShadow = true;
        this.environmentGroup.add(island);
        this.obstacleColliders.push(island);
      });

      // 5. Flood Depth Marker Staff Gauges (metric water stage indicators)
      const gaugeCoords = [
        { x: -8, z: -2 },
        { x: 10, z: -6 },
        { x: -22, z: 12 },
        { x: 22, z: 10 }
      ];
      gaugeCoords.forEach(gc => {
        const staffGroup = new THREE.Group();
        staffGroup.position.set(gc.x, 0, gc.z);
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.2, 8), new THREE.MeshStandardMaterial({ color: 0xf1f5f9 }));
        pole.position.y = 1.6;
        staffGroup.add(pole);
        for (let s = 0; s < 4; s++) {
          const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.25, 8), new THREE.MeshBasicMaterial({ color: 0xef4444 }));
          stripe.position.y = 0.8 + s * 0.6;
          staffGroup.add(stripe);
        }
        this.environmentGroup.add(staffGroup);
      });

      // 6. Deep Riverbed Ground Underneath (Substrate base - deep oceanic bed)
      const groundGeo = new THREE.PlaneGeometry(240, 240, 16, 16);
      const groundMat = new THREE.MeshStandardMaterial({ color: 0x0c233c, roughness: 0.92 });
      const ground = new THREE.Mesh(groundGeo, groundMat);
      ground.rotation.x = -Math.PI / 2;
      ground.position.y = -0.5;
      ground.receiveShadow = true;
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
    // -------------------------------------------------------------------------
    // 1. PALETTES & REALISTIC MATERIALS
    // -------------------------------------------------------------------------
    // Roof materials
    const matTinGalv = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.78, roughness: 0.32 });
    const matTinRed = new THREE.MeshStandardMaterial({ color: 0x991b1b, metalness: 0.68, roughness: 0.38 });
    const matTinBlue = new THREE.MeshStandardMaterial({ color: 0x1e3a8a, metalness: 0.72, roughness: 0.35 });
    const matTinGreen = new THREE.MeshStandardMaterial({ color: 0x166534, metalness: 0.70, roughness: 0.36 });
    const matThatch = new THREE.MeshStandardMaterial({ color: 0xa16207, roughness: 0.95 });
    const matTileTerra = new THREE.MeshStandardMaterial({ color: 0xc2410c, roughness: 0.82 });

    // Wood, timber, bamboo materials
    const matWoodDark = new THREE.MeshStandardMaterial({ color: 0x451a03, roughness: 0.85 });
    const matWoodStilt = new THREE.MeshStandardMaterial({ color: 0x5c3d1e, roughness: 0.9 });
    const matBambooMat = new THREE.MeshStandardMaterial({ color: 0xca8a04, roughness: 0.88 });
    const matBambooStalk = new THREE.MeshStandardMaterial({ color: 0x84cc16, roughness: 0.7 });
    const matFrameTimber = new THREE.MeshStandardMaterial({ color: 0x2e1808, roughness: 0.88 });

    // Exterior wall plasters (distinct vibrant Assam regional colors)
    const matWallMustard = new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.72 });
    const matWallCream = new THREE.MeshStandardMaterial({ color: 0xfef3c7, roughness: 0.7 });
    const matWallSkyBlue = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.7 });
    const matWallSage = new THREE.MeshStandardMaterial({ color: 0x86efac, roughness: 0.75 });
    const matWallPeach = new THREE.MeshStandardMaterial({ color: 0xfb923c, roughness: 0.72 });
    const matWallPink = new THREE.MeshStandardMaterial({ color: 0xf472b6, roughness: 0.7 });
    const matWallYellow = new THREE.MeshStandardMaterial({ color: 0xfde047, roughness: 0.7 });
    const matWallWhite = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.7 });
    const matBrickOchre = new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.82 });
    const matConcreteGrey = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.85 });
    const matDarkConcrete = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.9 });

    // Infrastructure & Flood details
    const matAsphalt = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.92 });
    const matYellowStripe = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.6 });
    const matSandbag = new THREE.MeshStandardMaterial({ color: 0xd4b996, roughness: 0.92 });
    const matSintexBlue = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.35, metalness: 0.2 });
    const matWaterLine = new THREE.MeshStandardMaterial({ color: 0x272016, roughness: 0.4 });
    const matBrass = new THREE.MeshStandardMaterial({ color: 0xd97706, metalness: 0.85, roughness: 0.25 });
    const matCanvasTarp = new THREE.MeshStandardMaterial({ color: 0xea580c, roughness: 0.8 });

    // Botanical materials
    const matPalmTrunk = new THREE.MeshStandardMaterial({ color: 0x5a4a3a, roughness: 0.85 });
    const matLeafBright = new THREE.MeshStandardMaterial({ color: 0x22c55e, roughness: 0.65 });
    const matLeafMed = new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.7 });
    const matLeafDark = new THREE.MeshStandardMaterial({ color: 0x14532d, roughness: 0.75 });
    const matBananaLeaf = new THREE.MeshStandardMaterial({ color: 0x4ade80, roughness: 0.6 });
    const matTrunkBrown = new THREE.MeshStandardMaterial({ color: 0x45271a, roughness: 0.9 });
    const matReedPlume = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.95 });
    const matReedStalk = new THREE.MeshStandardMaterial({ color: 0x65a30d, roughness: 0.75 });
    const matShrubLeaf = new THREE.MeshStandardMaterial({ color: 0x166534, roughness: 0.8 });

    // -------------------------------------------------------------------------
    // 2. HELPER GENERATORS
    // -------------------------------------------------------------------------
    // Helper: Assam Stilt House ("Chang Ghar") with authentic gable roof & timber framing
    const buildStiltHouse = (cfg) => {
      const houseGroup = new THREE.Group();
      houseGroup.position.set(cfg.x, 0, cfg.z);
      if (cfg.rotY) houseGroup.rotation.y = cfg.rotY;

      const w = cfg.w || 9;
      const d = cfg.d || 8;
      const h = cfg.h || 3.2;
      const stiltH = cfg.stiltH || 3.4;
      const floorY = stiltH + 0.15;

      // 1. Bamboo/Timber Stilts rising through water
      const stiltGeo = new THREE.CylinderGeometry(0.14, 0.16, stiltH + 0.8, 8);
      const cols = cfg.stiltCols || 3;
      const rows = cfg.stiltRows || 3;
      for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows; r++) {
          const sx = -w / 2 + 0.6 + (c / (cols - 1)) * (w - 1.2);
          const sz = -d / 2 + 0.6 + (r / (rows - 1)) * (d - 1.2);
          const stilt = new THREE.Mesh(stiltGeo, matWoodStilt);
          stilt.position.set(sx, (stiltH + 0.8) / 2 - 0.4, sz);
          stilt.castShadow = true;
          houseGroup.add(stilt);
          this.obstacleColliders.push(stilt);
        }
      }

      // Wooden crossbeams supporting floor
      const beamX = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.22, 0.22), matWoodDark);
      beamX.position.set(0, stiltH, 0);
      houseGroup.add(beamX);

      // 2. Floor Platform & Veranda Deck
      const porchDepth = cfg.porch ? 2.4 : 0;
      const platformD = d + porchDepth;
      const floorPlatform = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, 0.25, platformD), matWoodDark);
      floorPlatform.position.set(0, floorY, porchDepth / 2);
      floorPlatform.receiveShadow = true;
      houseGroup.add(floorPlatform);
      this.obstacleColliders.push(floorPlatform);

      // 3. Main Ekra Wall Living Enclosure
      const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), cfg.wallMat || matWallMustard);
      body.position.set(0, floorY + h / 2, 0);
      body.castShadow = true;
      body.receiveShadow = true;
      houseGroup.add(body);
      this.obstacleColliders.push(body);

      // Exterior dark timber post-and-beam framing overlay (traditional Assam ekra design)
      const postGeo = new THREE.BoxGeometry(0.16, h, 0.16);
      [-w / 2, -w / 4, 0, w / 4, w / 2].forEach(px => {
        const postFront = new THREE.Mesh(postGeo, matFrameTimber);
        postFront.position.set(px, floorY + h / 2, d / 2 + 0.04);
        houseGroup.add(postFront);
      });
      const girt = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, 0.14, 0.12), matFrameTimber);
      girt.position.set(0, floorY + h * 0.55, d / 2 + 0.05);
      houseGroup.add(girt);

      // Wet water-level silt band on lower stilts
      const waterBand = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, 0.35, d + 0.1), matWaterLine);
      waterBand.position.set(0, 1.48, 0);
      houseGroup.add(waterBand);

      // Windows (dark glass with timber frame & open wooden shutters)
      [-w / 3.2, w / 3.2].forEach(wx => {
        const win = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.1, 0.12), matDarkConcrete);
        win.position.set(wx, floorY + h * 0.55, d / 2 + 0.06);
        houseGroup.add(win);
        const shutterL = new THREE.Mesh(new THREE.BoxGeometry(0.28, 1.1, 0.08), matWoodDark);
        shutterL.position.set(wx - 0.72, floorY + h * 0.55, d / 2 + 0.18);
        shutterL.rotation.y = 0.45;
        houseGroup.add(shutterL);
        const shutterR = new THREE.Mesh(new THREE.BoxGeometry(0.28, 1.1, 0.08), matWoodDark);
        shutterR.position.set(wx + 0.72, floorY + h * 0.55, d / 2 + 0.18);
        shutterR.rotation.y = -0.45;
        houseGroup.add(shutterR);
      });

      // Front Doorway
      const door = new THREE.Mesh(new THREE.BoxGeometry(1.3, 2.2, 0.12), matWoodDark);
      door.position.set(0, floorY + 1.1, d / 2 + 0.06);
      houseGroup.add(door);

      // Veranda railings and entry ladder
      if (cfg.porch) {
        const railZ = d / 2 + porchDepth;
        const frontRail = new THREE.Mesh(new THREE.BoxGeometry(w, 0.8, 0.1), matWoodDark);
        frontRail.position.set(0, floorY + 0.5, railZ - 0.05);
        houseGroup.add(frontRail);

        const sideRailL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.8, porchDepth), matWoodDark);
        sideRailL.position.set(-w / 2 + 0.05, floorY + 0.5, d / 2 + porchDepth / 2);
        houseGroup.add(sideRailL);

        const sideRailR = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.8, porchDepth), matWoodDark);
        sideRailR.position.set(w / 2 - 0.05, floorY + 0.5, d / 2 + porchDepth / 2);
        houseGroup.add(sideRailR);

        // Sloped wooden ladder descending from veranda to water
        const ladderGroup = new THREE.Group();
        ladderGroup.position.set(w / 3.5, floorY, railZ);
        const ladderLen = Math.hypot(floorY - 1.48, 1.5) + 0.4;
        const ladderAngle = Math.atan2(1.5, floorY - 1.48);
        const railGeo = new THREE.BoxGeometry(0.08, ladderLen, 0.08);
        const leftRail = new THREE.Mesh(railGeo, matWoodDark);
        leftRail.position.set(-0.4, -ladderLen / 2 + 0.2, 0.7);
        leftRail.rotation.x = ladderAngle;
        ladderGroup.add(leftRail);
        const rightRail = new THREE.Mesh(railGeo, matWoodDark);
        rightRail.position.set(0.4, -ladderLen / 2 + 0.2, 0.7);
        rightRail.rotation.x = ladderAngle;
        ladderGroup.add(rightRail);
        houseGroup.add(ladderGroup);
      }

      // 4. Authentic Pitched Gable Corrugated Tin / Thatch Roof
      const roofH = cfg.roofH || 2.4;
      const roofSlopeLen = Math.hypot(d / 2 + (cfg.porch ? 0.6 : 0), roofH) + 0.5;
      const pitchAngle = Math.atan2(roofH, d / 2);

      const roofMat = (cfg.roofType === 'thatch') ? matThatch : (cfg.roofMat || matTinRed);

      // Front slope panel
      const frontSlope = new THREE.Mesh(new THREE.BoxGeometry(w + 1.0, 0.12, roofSlopeLen), roofMat);
      frontSlope.position.set(0, floorY + h + roofH / 2, (d / 4) + (cfg.porch ? 0.3 : 0));
      frontSlope.rotation.x = pitchAngle;
      frontSlope.castShadow = true;
      houseGroup.add(frontSlope);
      this.obstacleColliders.push(frontSlope);

      // Back slope panel
      const backSlope = new THREE.Mesh(new THREE.BoxGeometry(w + 1.0, 0.12, roofSlopeLen), roofMat);
      backSlope.position.set(0, floorY + h + roofH / 2, -(d / 4));
      backSlope.rotation.x = -pitchAngle;
      backSlope.castShadow = true;
      houseGroup.add(backSlope);
      this.obstacleColliders.push(backSlope);

      // Galvanized metal ridge capping
      const ridge = new THREE.Mesh(new THREE.BoxGeometry(w + 1.2, 0.16, 0.32), matTinGalv);
      ridge.position.set(0, floorY + h + roofH + 0.06, (cfg.porch ? 0.15 : 0));
      houseGroup.add(ridge);

      // Triangular gable ends (left & right side triangular walls)
      const gableGeo = new THREE.CylinderGeometry(0, Math.max(w, d) * 0.45, roofH, 3);
      const gableLeft = new THREE.Mesh(gableGeo, cfg.wallMat || matWallMustard);
      gableLeft.position.set(-w / 2 + 0.02, floorY + h + roofH / 2, 0);
      gableLeft.rotation.z = Math.PI / 2;
      gableLeft.rotation.y = Math.PI / 2;
      gableLeft.scale.set(d / (Math.max(w, d) * 0.9), 0.1, 1);
      houseGroup.add(gableLeft);

      const gableRight = new THREE.Mesh(gableGeo, cfg.wallMat || matWallMustard);
      gableRight.position.set(w / 2 - 0.02, floorY + h + roofH / 2, 0);
      gableRight.rotation.z = Math.PI / 2;
      gableRight.rotation.y = Math.PI / 2;
      gableRight.scale.set(d / (Math.max(w, d) * 0.9), 0.1, 1);
      houseGroup.add(gableRight);

      this.environmentGroup.add(houseGroup);
      return {
        group: houseGroup,
        floorY: floorY,
        roofH: roofH,
        roofRidgeY: floorY + h + roofH,
        porchZ: cfg.porch ? (d / 2 + porchDepth / 2) : (d / 2)
      };
    };

    // Helper: Partially Submerged Low-Lying Rural House / Hut
    const buildSubmergedHut = (cfg) => {
      const hutGroup = new THREE.Group();
      hutGroup.position.set(cfg.x, cfg.y || 0.45, cfg.z);
      if (cfg.rotY) hutGroup.rotation.y = cfg.rotY;

      const w = cfg.w || 7.0;
      const d = cfg.d || 5.8;
      const h = cfg.h || 2.8;

      // Mud & ekra body deep in water
      const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), cfg.wallMat || matWallCream);
      body.position.y = h / 2;
      body.castShadow = true;
      body.receiveShadow = true;
      hutGroup.add(body);
      this.obstacleColliders.push(body);

      // Silt waterline mark at flood height
      const waterLine = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, 0.45, d + 0.1), matWaterLine);
      waterLine.position.y = 1.48 - (cfg.y || 0.45);
      hutGroup.add(waterLine);

      // Flooded window
      const win = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.9, 0.1), matDarkConcrete);
      win.position.set(w / 4, 1.4, d / 2 + 0.04);
      hutGroup.add(win);

      // Low pitched tin/thatch roof
      const roofH = 1.8;
      const roofMat = cfg.roofMat || matTinBlue;
      const roofSlope = Math.hypot(d / 2, roofH) + 0.4;
      const pitch = Math.atan2(roofH, d / 2);

      const fSlope = new THREE.Mesh(new THREE.BoxGeometry(w + 0.8, 0.1, roofSlope), roofMat);
      fSlope.position.set(0, h + roofH / 2, d / 4);
      fSlope.rotation.x = pitch;
      hutGroup.add(fSlope);
      this.obstacleColliders.push(fSlope);

      const bSlope = new THREE.Mesh(new THREE.BoxGeometry(w + 0.8, 0.1, roofSlope), roofMat);
      bSlope.position.set(0, h + roofH / 2, -d / 4);
      bSlope.rotation.x = -pitch;
      hutGroup.add(bSlope);
      this.obstacleColliders.push(bSlope);

      // Driftwood branch snagged against upstream side
      const snag = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 3.2, 8), matTrunkBrown);
      snag.rotation.z = Math.PI / 2.4;
      snag.position.set(-w / 2 - 0.6, 1.48 - (cfg.y || 0.45), 0);
      hutGroup.add(snag);

      this.environmentGroup.add(hutGroup);
      return hutGroup;
    };

    // Helper: Traditional Assam Village Community Namghar (Prayer Pavilion)
    const buildNamghar = (cfg) => {
      const namGroup = new THREE.Group();
      namGroup.position.set(cfg.x, 0, cfg.z);
      if (cfg.rotY) namGroup.rotation.y = cfg.rotY;

      const w = cfg.w || 14;
      const d = cfg.d || 18;
      const plinthH = 1.62; // Raised high-ground plinth above floodwaters

      // Plinth platform
      const plinth = new THREE.Mesh(new THREE.BoxGeometry(w, plinthH, d), matWallWhite);
      plinth.position.y = plinthH / 2;
      plinth.receiveShadow = true;
      namGroup.add(plinth);
      this.obstacleColliders.push(plinth);

      // Plinth steps
      const step = new THREE.Mesh(new THREE.BoxGeometry(4.0, plinthH, 1.8), matWallWhite);
      step.position.set(0, plinthH / 2, d / 2 + 0.9);
      namGroup.add(step);

      // Open Pillared Hall (White round columns)
      const colGeo = new THREE.CylinderGeometry(0.2, 0.22, 3.5, 12);
      for (let cx = -w / 2 + 1.2; cx <= w / 2 - 1.2; cx += (w - 2.4) / 3) {
        for (let cz = -d / 2 + 1.2; cz <= d / 2 - 1.2; cz += (d - 2.4) / 4) {
          const col = new THREE.Mesh(colGeo, matWallWhite);
          col.position.set(cx, plinthH + 1.75, cz);
          col.castShadow = true;
          namGroup.add(col);
          this.obstacleColliders.push(col);
        }
      }

      // Enclosed Sanctum Sanctorum ("Manikut") at rear
      const mani = new THREE.Mesh(new THREE.BoxGeometry(w - 2.4, 3.4, 5.0), matWallCream);
      mani.position.set(0, plinthH + 1.7, -d / 2 + 3.0);
      namGroup.add(mani);
      this.obstacleColliders.push(mani);

      // Tier 1 Roof: Wide lower hip roof in corrugated red tin
      const roof1H = 2.4;
      const roof1 = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.72, roof1H, 4), matTinRed);
      roof1.position.set(0, plinthH + 3.5 + roof1H / 2, 0);
      roof1.rotation.y = Math.PI / 4;
      roof1.scale.set(w / Math.max(w, d), 1, d / Math.max(w, d));
      roof1.castShadow = true;
      namGroup.add(roof1);
      this.obstacleColliders.push(roof1);

      // Tier 2 Clerestory Roof: Raised central ridge tier
      const roof2H = 1.6;
      const roof2 = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.42, roof2H, 4), matTinBlue);
      roof2.position.set(0, plinthH + 3.5 + roof1H + roof2H / 2, 0);
      roof2.rotation.y = Math.PI / 4;
      roof2.scale.set(w / Math.max(w, d), 1, d / Math.max(w, d));
      namGroup.add(roof2);
      this.obstacleColliders.push(roof2);

      // Brass Kalasa Pinnacle Ornament on Apex
      const kalasa = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.28, 1.2, 12), matBrass);
      kalasa.position.set(0, plinthH + 3.5 + roof1H + roof2H + 0.6, 0);
      namGroup.add(kalasa);

      this.environmentGroup.add(namGroup);
      return namGroup;
    };

    // Helper: Concrete Pucca Building / Public Shelter
    const buildConcreteBuilding = (cfg) => {
      const bldgGroup = new THREE.Group();
      bldgGroup.position.set(cfg.x, 0, cfg.z);
      if (cfg.rotY) bldgGroup.rotation.y = cfg.rotY;

      const w = cfg.w;
      const d = cfg.d;
      const h = cfg.h;
      const floors = cfg.floors || 2;
      const floorH = h / floors;

      // Main structural mass
      const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), cfg.wallMat || matWallYellow);
      body.position.y = h / 2;
      body.castShadow = true;
      body.receiveShadow = true;
      bldgGroup.add(body);
      this.obstacleColliders.push(body);

      // Dark wet silt line marking water level on building
      const waterLine = new THREE.Mesh(new THREE.BoxGeometry(w + 0.12, 0.45, d + 0.12), matWaterLine);
      waterLine.position.y = 1.48;
      bldgGroup.add(waterLine);

      // Floor dividing slab bands
      for (let f = 1; f < floors; f++) {
        const slab = new THREE.Mesh(new THREE.BoxGeometry(w + 0.5, 0.35, d + 0.5), matConcreteGrey);
        slab.position.y = f * floorH;
        bldgGroup.add(slab);
      }

      // Parapet wall on roof terrace
      const parapetH = 0.9;
      const parapet = new THREE.Mesh(new THREE.BoxGeometry(w + 0.2, parapetH, d + 0.2), matDarkConcrete);
      parapet.position.y = h + parapetH / 2;
      bldgGroup.add(parapet);
      this.obstacleColliders.push(parapet);

      // Rooftop inner floor
      const roofFloor = new THREE.Mesh(new THREE.BoxGeometry(w, 0.2, d), matConcreteGrey);
      roofFloor.position.y = h;
      bldgGroup.add(roofFloor);

      // Overhead Blue Sintex Water Tanks
      const tankCount = cfg.tanks || 1;
      for (let t = 0; t < tankCount; t++) {
        const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 2.0, 16), matSintexBlue);
        tank.position.set(w / 3.2 - t * 2.8, h + 1.2, d / 3.2);
        bldgGroup.add(tank);
        this.obstacleColliders.push(tank);
      }

      // Windows and door bays on upper floors
      const winCountX = Math.floor(w / 4);
      for (let f = (cfg.groundFlooded ? 1 : 0); f < floors; f++) {
        for (let i = 0; i < winCountX; i++) {
          const wx = -w / 2 + 2.0 + i * (w - 4.0) / Math.max(1, winCountX - 1);
          const winF = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.4, 0.12), matDarkConcrete);
          winF.position.set(wx, f * floorH + floorH * 0.55, d / 2 + 0.04);
          bldgGroup.add(winF);

          const chajja = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.1, 0.6), matConcreteGrey);
          chajja.position.set(wx, f * floorH + floorH * 0.55 + 0.8, d / 2 + 0.3);
          bldgGroup.add(chajja);

          const winB = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.4, 0.12), matDarkConcrete);
          winB.position.set(wx, f * floorH + floorH * 0.55, -d / 2 - 0.04);
          bldgGroup.add(winB);
        }
      }

      // Balcony on 1st/2nd floor if specified
      if (cfg.balcony) {
        const balW = cfg.balcony.w || w * 0.6;
        const balH = 0.9;
        const balSlab = new THREE.Mesh(new THREE.BoxGeometry(balW, 0.3, 2.0), matConcreteGrey);
        balSlab.position.set(0, floorH, d / 2 + 1.0);
        bldgGroup.add(balSlab);
        this.obstacleColliders.push(balSlab);

        const balRail = new THREE.Mesh(new THREE.BoxGeometry(balW, balH, 0.1), matDarkConcrete);
        balRail.position.set(0, floorH + balH / 2 + 0.15, d / 2 + 2.0);
        bldgGroup.add(balRail);
      }

      // Exterior Emergency Staircase tower if specified
      if (cfg.stairs) {
        const stairTower = new THREE.Mesh(new THREE.BoxGeometry(3.5, h, 3.5), matConcreteGrey);
        stairTower.position.set(w / 2 + 1.75, h / 2, 0);
        bldgGroup.add(stairTower);
        this.obstacleColliders.push(stairTower);
      }

      // Communication Mast / Flag if specified
      if (cfg.mast) {
        const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 6.0), matTinGalv);
        mast.position.set(-w / 3, h + 3.0, -d / 3);
        bldgGroup.add(mast);
        this.obstacleColliders.push(mast);

        this.addEmergencyBeaconLight(new THREE.Vector3(cfg.x - w / 3, h + 6.0, cfg.z - d / 3), true);
      }

      this.environmentGroup.add(bldgGroup);
      return bldgGroup;
    };

    // Helper: Roadside Grocery Kiosk ("Mudi Dukan")
    const buildKiosk = (cfg) => {
      const kioskGroup = new THREE.Group();
      kioskGroup.position.set(cfg.x, 0, cfg.z);
      if (cfg.rotY) kioskGroup.rotation.y = cfg.rotY;

      const body = new THREE.Mesh(new THREE.BoxGeometry(6.0, 3.6, 5.0), matWallCream);
      body.position.y = 1.8;
      kioskGroup.add(body);
      this.obstacleColliders.push(body);

      // Sloping blue corrugated tin awning
      const awning = new THREE.Mesh(new THREE.BoxGeometry(6.8, 0.15, 6.0), matTinBlue);
      awning.position.set(0, 3.7, 0.4);
      awning.rotation.x = 0.12;
      kioskGroup.add(awning);
      this.obstacleColliders.push(awning);

      // Wooden merchandise counter
      const counter = new THREE.Mesh(new THREE.BoxGeometry(4.8, 1.1, 0.8), matWoodDark);
      counter.position.set(0, 1.1, 2.6);
      kioskGroup.add(counter);

      this.environmentGroup.add(kioskGroup);
      return kioskGroup;
    };

    // Helper: Traditional Elevated Rice Granary ("Bhoral Ghar")
    const buildGranary = (cfg) => {
      const granaryGroup = new THREE.Group();
      granaryGroup.position.set(cfg.x, 0, cfg.z);

      const stiltH = 3.6;
      // Tall slender stilts with anti-rodent discs
      for (let cx of [-1.8, 1.8]) {
        for (let cz of [-1.8, 1.8]) {
          const stilt = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, stiltH + 0.6, 8), matWoodStilt);
          stilt.position.set(cx, (stiltH + 0.6) / 2 - 0.3, cz);
          granaryGroup.add(stilt);
          this.obstacleColliders.push(stilt);

          const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.08, 12), matTinGalv);
          disc.position.set(cx, stiltH - 0.4, cz);
          granaryGroup.add(disc);
        }
      }

      // Granary body (bamboo mat walls)
      const gBody = new THREE.Mesh(new THREE.BoxGeometry(4.8, 2.6, 4.8), matBambooMat);
      gBody.position.y = stiltH + 1.3;
      granaryGroup.add(gBody);
      this.obstacleColliders.push(gBody);

      // Steep pyramidal thatch roof
      const gRoof = new THREE.Mesh(new THREE.ConeGeometry(4.2, 2.8, 4), matThatch);
      gRoof.position.y = stiltH + 2.6 + 1.4;
      gRoof.rotation.y = Math.PI / 4;
      granaryGroup.add(gRoof);
      this.obstacleColliders.push(gRoof);

      this.environmentGroup.add(granaryGroup);
      return granaryGroup;
    };

    // Helper: High-Ground Community Refuge Mound ("Chapori" / "High Ground")
    const buildHighGroundMound = (cfg) => {
      const moundGroup = new THREE.Group();
      moundGroup.position.set(cfg.x, 0, cfg.z);

      const topY = 1.95; // 47cm above floodwater level
      // Earthen mound platform
      const mound = new THREE.Mesh(new THREE.CylinderGeometry(11, 14, topY + 0.5, 24), new THREE.MeshStandardMaterial({ color: 0x365314, roughness: 0.9 }));
      mound.position.y = (topY + 0.5) / 2 - 0.25;
      mound.receiveShadow = true;
      moundGroup.add(mound);
      this.obstacleColliders.push(mound);

      // Sandbag perimeter dikes around mound edge
      const sandGeo = new THREE.BoxGeometry(0.8, 0.35, 0.45);
      for (let a = 0; a < Math.PI * 2; a += 0.35) {
        const sx = Math.cos(a) * 9.8;
        const sz = Math.sin(a) * 9.8;
        const sBag = new THREE.Mesh(sandGeo, matSandbag);
        sBag.position.set(sx, topY + 0.18, sz);
        sBag.rotation.y = -a;
        moundGroup.add(sBag);
      }

      // Emergency Relief Shelter Tent (Orange/white canvas tarp over bamboo frame)
      const tentFrame = new THREE.Mesh(new THREE.ConeGeometry(4.5, 2.8, 4), matCanvasTarp);
      tentFrame.position.set(0, topY + 1.4, 0);
      tentFrame.rotation.y = Math.PI / 4;
      moundGroup.add(tentFrame);
      this.obstacleColliders.push(tentFrame);

      // Medical & food supply crates
      const cr1 = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.8, 1.0), new THREE.MeshStandardMaterial({ color: 0x15803d }));
      cr1.position.set(-3.2, topY + 0.4, 2.5);
      moundGroup.add(cr1);

      const cr2 = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.7, 0.9), new THREE.MeshStandardMaterial({ color: 0xca8a04 }));
      cr2.position.set(-3.2, topY + 1.1, 2.5);
      moundGroup.add(cr2);

      this.environmentGroup.add(moundGroup);
      return moundGroup;
    };

    // Helper: Assam Botanical Coverage & Dense Flora
    const buildTree = (x, z, type = 'areca_palm', scale = 1.0, fixedTrunkH = null) => {
      const treeGroup = new THREE.Group();
      treeGroup.position.set(x, 0, z);

      if (type === 'areca_palm') {
        // Tall, slender Betel Nut Palm (Tamul Gos)
        const trunkH = (7.5 + Math.random() * 2.8) * scale;
        const trunkGeo = new THREE.CylinderGeometry(0.12 * scale, 0.18 * scale, trunkH, 8);
        const trunk = new THREE.Mesh(trunkGeo, matPalmTrunk);
        trunk.position.y = trunkH / 2;
        trunk.castShadow = true;
        treeGroup.add(trunk);
        this.obstacleColliders.push(trunk);

        // Water submersion band on lower trunk
        const wetTrunk = new THREE.Mesh(new THREE.CylinderGeometry(0.19 * scale, 0.20 * scale, 1.6, 8), matWaterLine);
        wetTrunk.position.y = 0.8;
        treeGroup.add(wetTrunk);

        // Crown of radiating arching palm fronds with realistic droop
        const frondCount = 10;
        for (let f = 0; f < frondCount; f++) {
          const frondAngle = (f / frondCount) * Math.PI * 2 + Math.random() * 0.15;
          const frondLen = (3.2 + Math.random() * 0.8) * scale;
          const frond = new THREE.Mesh(new THREE.BoxGeometry(0.32 * scale, 0.05, frondLen), matLeafBright);
          frond.position.set(0, trunkH - 0.2, 0);
          frond.rotation.y = frondAngle;
          frond.rotation.x = 0.58 + Math.random() * 0.2;
          frond.translateZ(frondLen / 2);
          treeGroup.add(frond);
        }
      } else if (type === 'banana_plant') {
        // Clustered Banana Plant (Kol Gos)
        const stemH = (3.8 + Math.random() * 1.0) * scale;
        const stemGeo = new THREE.CylinderGeometry(0.22 * scale, 0.34 * scale, stemH, 8);
        const stem = new THREE.Mesh(stemGeo, matBananaLeaf);
        stem.position.y = stemH / 2;
        treeGroup.add(stem);
        this.obstacleColliders.push(stem);

        const leafCount = 7;
        for (let l = 0; l < leafCount; l++) {
          const leafAngle = (l / leafCount) * Math.PI * 2;
          const leafLen = (2.8 + Math.random() * 0.6) * scale;
          const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.75 * scale, 0.05, leafLen), matLeafMed);
          leaf.position.set(0, stemH - 0.4, 0);
          leaf.rotation.y = leafAngle;
          leaf.rotation.x = 0.52 + Math.random() * 0.2;
          leaf.translateZ(leafLen / 2);
          treeGroup.add(leaf);
        }
      } else if (type === 'banyan_tree') {
        // Giant Banyan / Peepal Tree with Spreading Canopy and Aerial Prop Roots
        const trunkH = fixedTrunkH ? (fixedTrunkH * scale) : ((6.5 + Math.random() * 1.5) * scale);
        const trunkGeo = new THREE.CylinderGeometry(1.2 * scale, 1.7 * scale, trunkH, 10);
        const trunk = new THREE.Mesh(trunkGeo, matTrunkBrown);
        trunk.position.y = trunkH / 2;
        trunk.castShadow = true;
        treeGroup.add(trunk);
        this.obstacleColliders.push(trunk);

        // Aerial Roots reaching into floodwater
        for (let r = 0; r < 6; r++) {
          const rx = (Math.random() - 0.5) * 3.8 * scale;
          const rz = (Math.random() - 0.5) * 3.8 * scale;
          const rootH = trunkH * 0.92;
          const root = new THREE.Mesh(new THREE.CylinderGeometry(0.09 * scale, 0.14 * scale, rootH), matTrunkBrown);
          root.position.set(rx, rootH / 2, rz);
          treeGroup.add(root);
        }

        // Horizontal lateral bough extending out over floodwater (Used for Survivor 4 landmark!)
        const bough = new THREE.Mesh(new THREE.CylinderGeometry(0.35 * scale, 0.5 * scale, 4.2 * scale, 8), matTrunkBrown);
        bough.rotation.z = Math.PI / 2.3;
        bough.position.set(2.0 * scale, trunkH * 0.72, 1.8 * scale);
        treeGroup.add(bough);
        this.obstacleColliders.push(bough);

        // Multi-layered lush foliage dome clusters
        const canopyLayers = [
          { y: trunkH * 0.85, r: 5.0 * scale, mat: matLeafDark },
          { y: trunkH * 1.15, r: 4.4 * scale, mat: matLeafMed },
          { y: trunkH * 1.45, r: 3.4 * scale, mat: matLeafBright },
          { x: 2.6 * scale, y: trunkH * 0.95, z: 1.8 * scale, r: 3.6 * scale, mat: matLeafMed },
          { x: -2.2 * scale, y: trunkH * 0.9, z: -2.0 * scale, r: 3.5 * scale, mat: matLeafDark }
        ];

        canopyLayers.forEach(c => {
          const dome = new THREE.Mesh(new THREE.DodecahedronGeometry(c.r, 1), c.mat);
          dome.position.set(c.x || 0, c.y, c.z || 0);
          dome.castShadow = true;
          treeGroup.add(dome);
          this.obstacleColliders.push(dome);
        });
      } else if (type === 'bamboo_cluster') {
        // Clustered flexible bamboo grove
        const culmCount = 8;
        for (let b = 0; b < culmCount; b++) {
          const bx = (Math.random() - 0.5) * 1.8 * scale;
          const bz = (Math.random() - 0.5) * 1.8 * scale;
          const bH = (5.8 + Math.random() * 2.2) * scale;
          const bamboo = new THREE.Mesh(new THREE.CylinderGeometry(0.08 * scale, 0.1 * scale, bH), matBambooStalk);
          bamboo.position.set(bx, bH / 2, bz);
          bamboo.rotation.z = (Math.random() - 0.5) * 0.18;
          bamboo.rotation.x = (Math.random() - 0.5) * 0.18;
          treeGroup.add(bamboo);

          // Feathery foliage tufts
          const plume = new THREE.Mesh(new THREE.SphereGeometry(1.3 * scale, 6, 6), matLeafBright);
          plume.position.set(bx, bH, bz);
          treeGroup.add(plume);
        }
      } else if (type === 'reeds') {
        // Brahmaputra Floodplain Reeds / Elephant Grass ("Kahuwa") with white feathery tassels
        const reedCount = 10;
        for (let r = 0; r < reedCount; r++) {
          const rx = (Math.random() - 0.5) * 1.6 * scale;
          const rz = (Math.random() - 0.5) * 1.6 * scale;
          const rH = (2.6 + Math.random() * 1.2) * scale;
          const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.04 * scale, 0.05 * scale, rH, 6), matReedStalk);
          stalk.position.set(rx, rH / 2, rz);
          stalk.rotation.z = (Math.random() - 0.5) * 0.2;
          treeGroup.add(stalk);

          // Silver-white feathery tassel at top
          const tassel = new THREE.Mesh(new THREE.ConeGeometry(0.25 * scale, 0.8 * scale, 6), matReedPlume);
          tassel.position.set(rx, rH + 0.3 * scale, rz);
          treeGroup.add(tassel);
        }
      } else if (type === 'bush') {
        // Floodplain Riverbank Shrub
        const shrub = new THREE.Mesh(new THREE.DodecahedronGeometry(1.6 * scale, 1), matShrubLeaf);
        shrub.position.y = 1.2 * scale;
        treeGroup.add(shrub);
      }

      this.environmentGroup.add(treeGroup);
      return treeGroup;
    };

    // Helper: Water Hyacinth Floating Mats ("Pani Meteka")
    const buildWaterHyacinth = (x, z, scale = 1.0) => {
      const matSpongy = new THREE.MeshStandardMaterial({ color: 0x16a34a, roughness: 0.6 });
      const matFlower = new THREE.MeshBasicMaterial({ color: 0xc084fc });
      const matMesh = new THREE.Mesh(new THREE.CylinderGeometry(1.4 * scale, 1.2 * scale, 0.18, 8), matSpongy);
      matMesh.position.set(x, 1.5, z);

      const floret = new THREE.Mesh(new THREE.SphereGeometry(0.18 * scale, 6, 6), matFlower);
      floret.position.set(0, 0.14, 0);
      matMesh.add(floret);

      this.environmentGroup.add(matMesh);
      this.floatingObjects.push({
        mesh: matMesh,
        baseY: 1.5,
        baseRotZ: 0,
        baseRotX: 0,
        phase: Math.random() * Math.PI * 2
      });
    };

    // -------------------------------------------------------------------------
    // 3. VILLAGE ARCHITECTURE (16+ DISTINCT STRUCTURES & SETTLEMENTS)
    // -------------------------------------------------------------------------
    // Cluster A: West Stilt Village ("Pachim Gaon")
    // Stilt House 1: Mustard yellow ekra house with red corrugated tin roof (Sheltering Survivor 1)
    const sh1 = buildStiltHouse({ x: -28, z: -22, w: 9.5, d: 8.5, h: 3.4, stiltH: 3.5, wallMat: matWallMustard, roofMat: matTinRed, porch: true });
    // Stilt House 2: Cream house with galvanized tin roof
    buildStiltHouse({ x: -14, z: -32, w: 8.0, d: 7.2, h: 3.0, stiltH: 3.2, wallMat: matWallCream, roofMat: matTinGalv, porch: true });
    // Stilt House 3: Sky-blue house with blue tin roof (Sheltering Survivor 5 on front veranda)
    const sh3 = buildStiltHouse({ x: -4, z: -28, w: 10.0, d: 8.0, h: 3.5, stiltH: 3.6, wallMat: matWallSkyBlue, roofMat: matTinBlue, porch: true });
    // Stilt House 4: Peach ekra house with red tin roof
    buildStiltHouse({ x: -36, z: -10, w: 8.5, d: 7.5, h: 3.2, stiltH: 3.4, wallMat: matWallPeach, roofMat: matTinRed, porch: true });
    // Stilt House 5: Traditional woven bamboo mat house with steep golden thatch roof
    buildStiltHouse({ x: -24, z: 24, w: 7.5, d: 6.5, h: 3.0, stiltH: 3.2, wallMat: matBambooMat, roofType: 'thatch', porch: true });
    // Stilt House 6: Sage green house with galvanized roof
    buildStiltHouse({ x: -38, z: 8, w: 8.5, d: 7.5, h: 3.2, stiltH: 3.3, wallMat: matWallSage, roofMat: matTinGalv, porch: false });

    // Submerged Rural Cottages & Low-Lying Huts (waterlogged dwellings)
    // Low-lying hut 1: Flooded up to window sills in west channel
    buildSubmergedHut({ x: -20, y: 0.45, z: -8, w: 7.2, d: 5.6, h: 2.8, wallMat: matWallCream, roofMat: matTinBlue });
    // Low-lying hut 2: Thatch hut partially submerged in northern paddy
    buildSubmergedHut({ x: -30, y: 0.50, z: 14, w: 6.5, d: 5.2, h: 2.6, wallMat: matBambooMat, roofMat: matThatch });

    // Cluster B: East Semi-Urban Settlement & Public Infrastructure ("Pub Gaon")
    // 1. Primary School Flood Shelter ("Prathmik Vidyalaya")
    buildConcreteBuilding({
      x: 24, z: 18, w: 26, d: 11, h: 8.8, floors: 2,
      wallMat: matBrickOchre, groundFlooded: true, tanks: 2,
      balcony: { w: 18 }, stairs: true, mast: true
    });

    // 2. Panchayat Disaster Relief Centre & Clinic
    buildConcreteBuilding({
      x: 28, z: -8, w: 22, d: 12, h: 11.5, floors: 3,
      wallMat: matWallWhite, groundFlooded: true, tanks: 3,
      balcony: { w: 14 }, stairs: true, mast: true
    });

    // 3. Modern 2-Story Residential Pucca House
    buildConcreteBuilding({
      x: 10, z: 32, w: 11, d: 9, h: 7.2, floors: 2,
      wallMat: matWallYellow, groundFlooded: true, tanks: 1,
      balcony: { w: 7 }, stairs: false
    });

    // 4. 1-Story Pucca House with Terracotta Tile Roof
    const housePinkGroup = new THREE.Group();
    housePinkGroup.position.set(34, 0, -26);
    const pinkBody = new THREE.Mesh(new THREE.BoxGeometry(10, 3.8, 8), matWallPink);
    pinkBody.position.y = 1.9;
    pinkBody.castShadow = true;
    housePinkGroup.add(pinkBody);
    this.obstacleColliders.push(pinkBody);
    const pinkRoof = new THREE.Mesh(new THREE.ConeGeometry(7.5, 2.5, 4), matTileTerra);
    pinkRoof.position.y = 5.05;
    pinkRoof.rotation.y = Math.PI / 4;
    pinkRoof.castShadow = true;
    housePinkGroup.add(pinkRoof);
    this.obstacleColliders.push(pinkRoof);
    this.environmentGroup.add(housePinkGroup);

    // 5. 1-Story Masonry House (White with Cyan trim)
    buildConcreteBuilding({
      x: 30, z: 26, w: 9, d: 7.5, h: 4.2, floors: 1,
      wallMat: matWallWhite, groundFlooded: true, tanks: 1
    });

    // 6. Mint Green Residence
    buildConcreteBuilding({
      x: 14, z: 20, w: 8.5, d: 7.5, h: 4.8, floors: 1,
      wallMat: matWallSage, groundFlooded: true, tanks: 1
    });

    // 7. Traditional Assam Village Community Namghar (Prayer Pavilion)
    buildNamghar({ x: 6, z: -32, w: 13, d: 17 });

    // 8. Roadside Grocery Kiosk ("Mudi Dukan")
    buildKiosk({ x: 12, z: -2 });

    // 9. Elevated Rice Granary ("Bhoral Ghar")
    buildGranary({ x: 18, z: -34 });

    // 10. High-Ground Community Refuge Mound ("Chapori" / "High Ground")
    buildHighGroundMound({ x: 32, z: -28 });

    // -------------------------------------------------------------------------
    // 4. ELEVATED PWD EMBANKMENT ROAD, BREACHED CULVERT & STAGING WHARF
    // -------------------------------------------------------------------------
    // Elevated PWD Asphalt Embankment Road traversing across sector
    // Road Segment 1: West road (X: -52 to -12)
    const roadWest = new THREE.Mesh(new THREE.BoxGeometry(40, 0.45, 7.5), matAsphalt);
    roadWest.position.set(-32, 1.85, 0);
    roadWest.receiveShadow = true;
    this.environmentGroup.add(roadWest);
    this.obstacleColliders.push(roadWest);

    // Road Segment 2: East road (X: -4 to 52)
    const roadEast = new THREE.Mesh(new THREE.BoxGeometry(56, 0.45, 7.5), matAsphalt);
    roadEast.position.set(24, 1.85, 0);
    roadEast.receiveShadow = true;
    this.environmentGroup.add(roadEast);
    this.obstacleColliders.push(roadEast);

    // Yellow Centerline Stripes
    const stripeWest = new THREE.Mesh(new THREE.BoxGeometry(38, 0.05, 0.3), matYellowStripe);
    stripeWest.position.set(-32, 2.09, 0);
    this.environmentGroup.add(stripeWest);

    const stripeEast = new THREE.Mesh(new THREE.BoxGeometry(54, 0.05, 0.3), matYellowStripe);
    stripeEast.position.set(24, 2.09, 0);
    this.environmentGroup.add(stripeEast);

    // Breached Culvert Section (8m gap at X: -12 to -4 where flood rushed through)
    // Buckled fractured asphalt chunks tilted in the swirling water
    const brokenChunk1 = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.4, 4.0), matAsphalt);
    brokenChunk1.position.set(-10.5, 1.35, 1.0);
    brokenChunk1.rotation.set(-0.25, 0.1, -0.2);
    this.environmentGroup.add(brokenChunk1);
    this.obstacleColliders.push(brokenChunk1);

    const brokenChunk2 = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.4, 3.8), matAsphalt);
    brokenChunk2.position.set(-5.5, 1.3, -1.2);
    brokenChunk2.rotation.set(0.3, -0.15, 0.18);
    this.environmentGroup.add(brokenChunk2);
    this.obstacleColliders.push(brokenChunk2);

    // Warning Barricades at breach edges
    const matBarrier = new THREE.MeshStandardMaterial({ color: 0xea580c, roughness: 0.4 });
    const barWest = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.1, 7.0), matBarrier);
    barWest.position.set(-12.2, 2.6, 0);
    this.environmentGroup.add(barWest);
    this.obstacleColliders.push(barWest);

    const barEast = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.1, 7.0), matBarrier);
    barEast.position.set(-3.8, 2.6, 0);
    this.environmentGroup.add(barEast);
    this.obstacleColliders.push(barEast);

    // Sandbag Defensive Dikes along road shoulders
    const sandbagGeo = new THREE.BoxGeometry(0.7, 0.32, 0.45);
    for (let s = -48; s <= 48; s += 1.8) {
      if (s >= -13 && s <= -3) continue; // Skip breach
      const bagFront = new THREE.Mesh(sandbagGeo, matSandbag);
      bagFront.position.set(s, 2.15, 3.9);
      bagFront.rotation.y = (Math.random() - 0.5) * 0.15;
      this.environmentGroup.add(bagFront);

      const bagBack = new THREE.Mesh(sandbagGeo, matSandbag);
      bagBack.position.set(s, 2.15, -3.9);
      bagBack.rotation.y = (Math.random() - 0.5) * 0.15;
      this.environmentGroup.add(bagBack);
    }

    // Elevated NDRF Drone Staging Platform / Wharf at (0, 1.72, 0)
    // Top surface at y = 1.90m
    const wharf = new THREE.Mesh(new THREE.BoxGeometry(10, 0.35, 10), matConcreteGrey);
    wharf.position.set(0, 1.72, 0);
    wharf.receiveShadow = true;
    this.environmentGroup.add(wharf);
    this.obstacleColliders.push(wharf);

    // Helipad Landing 'H' and Yellow Hazard Border
    const padBorder = new THREE.Mesh(new THREE.RingGeometry(3.6, 4.0, 32), matYellowStripe);
    padBorder.rotation.x = -Math.PI / 2;
    padBorder.position.set(0, 1.91, 0);
    this.environmentGroup.add(padBorder);

    const hStemL = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.05, 3.2), matYellowStripe);
    hStemL.position.set(-1.1, 1.91, 0);
    this.environmentGroup.add(hStemL);
    const hStemR = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.05, 3.2), matYellowStripe);
    hStemR.position.set(1.1, 1.91, 0);
    this.environmentGroup.add(hStemR);
    const hCross = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.05, 0.4), matYellowStripe);
    hCross.position.set(0, 1.91, 0);
    this.environmentGroup.add(hCross);

    // LoRa Communications Mast on Wharf
    const comsMast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 5.5), matTinGalv);
    comsMast.position.set(4.2, 4.4, 4.2);
    this.environmentGroup.add(comsMast);
    this.obstacleColliders.push(comsMast);
    this.addEmergencyBeaconLight(new THREE.Vector3(4.2, 7.2, 4.2), true);

    // Tactical NDRF Equipment Crates on Wharf
    const crateMat = new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.5 });
    const crate1 = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.8, 1.0), crateMat);
    crate1.position.set(-3.5, 2.3, 3.5);
    this.environmentGroup.add(crate1);
    this.obstacleColliders.push(crate1);

    // -------------------------------------------------------------------------
    // 5. VEHICLES AND RESCUE WATERCRAFT
    // -------------------------------------------------------------------------
    // A. NDRF Inflatable Rescue Boat (IRB #1) patrolling near floodwaters
    const irb1Group = new THREE.Group();
    irb1Group.position.set(8, 1.5, -4);
    irb1Group.rotation.y = 0.35;

    const matIrbOrange = new THREE.MeshStandardMaterial({ color: 0xea580c, roughness: 0.4 });
    const matIrbBlack = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.6 });

    // Sponsons (inflatable collar)
    const sponsonL = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 5.0, 16), matIrbOrange);
    sponsonL.rotation.x = Math.PI / 2;
    sponsonL.position.set(-1.1, 0.35, 0);
    irb1Group.add(sponsonL);

    const sponsonR = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 5.0, 16), matIrbOrange);
    sponsonR.rotation.x = Math.PI / 2;
    sponsonR.position.set(1.1, 0.35, 0);
    irb1Group.add(sponsonR);

    // Bow curved tube
    const bowTube = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 2.2, 16), matIrbOrange);
    bowTube.rotation.z = Math.PI / 2;
    bowTube.position.set(0, 0.42, 2.4);
    irb1Group.add(bowTube);

    // Aluminum Deck
    const deck = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.15, 4.6), matTinGalv);
    deck.position.set(0, 0.15, 0);
    irb1Group.add(deck);
    this.obstacleColliders.push(deck);

    // Transom & Outboard Motor
    const motor = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.1, 0.7), matIrbBlack);
    motor.position.set(0, 0.45, -2.4);
    irb1Group.add(motor);

    // Lifebuoy ring on bow
    const lifebuoy = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.12, 10, 24), new THREE.MeshStandardMaterial({ color: 0xffffff }));
    lifebuoy.position.set(0, 0.8, 1.6);
    irb1Group.add(lifebuoy);

    this.environmentGroup.add(irb1Group);
    this.floatingObjects.push({ mesh: irb1Group, baseY: 1.5, baseRotZ: 0, baseRotX: 0, phase: 0.8 });
    this.addEmergencyBeaconLight(new THREE.Vector3(8, 2.8, -4), true);

    // B. NDRF Inflatable Rescue Boat (IRB #2) patrolling West village
    const irb2Group = new THREE.Group();
    irb2Group.position.set(-20, 1.5, -6);
    irb2Group.rotation.y = -0.6;
    const deck2 = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.6, 5.0), matIrbOrange);
    deck2.position.y = 0.3;
    irb2Group.add(deck2);
    this.environmentGroup.add(irb2Group);
    this.obstacleColliders.push(deck2);
    this.floatingObjects.push({ mesh: irb2Group, baseY: 1.5, baseRotZ: 0, baseRotX: 0, phase: 2.2 });
    this.addEmergencyBeaconLight(new THREE.Vector3(-20, 2.6, -6), true);

    // C. Traditional Assamese Wooden Country Boats ("Naao")
    // Boat 1: East waterway
    const boat1 = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.85, 6.8), matWoodDark);
    boat1.position.set(18, 1.52, -20);
    boat1.rotation.y = 0.55;
    this.environmentGroup.add(boat1);
    this.obstacleColliders.push(boat1);
    this.floatingObjects.push({ mesh: boat1, baseY: 1.52, baseRotZ: 0, baseRotX: 0, phase: 1.4 });

    // Boat 2: South-West banana grove
    const boat2 = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.8, 5.8), matWoodDark);
    boat2.position.set(-12, 1.52, 20);
    boat2.rotation.y = -0.4;
    this.environmentGroup.add(boat2);
    this.obstacleColliders.push(boat2);
    this.floatingObjects.push({ mesh: boat2, baseY: 1.52, baseRotZ: 0, baseRotX: 0, phase: 3.1 });

    // D. Makeshift Bamboo Raft ("Bhur") carrying Survivor 2
    const raftGroup = new THREE.Group();
    raftGroup.position.set(-26, 1.52, 14);
    for (let r = 0; r < 8; r++) {
      const bLog = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 4.8), matBambooMat);
      bLog.rotation.x = Math.PI / 2;
      bLog.position.x = (r - 3.5) * 0.36;
      raftGroup.add(bLog);
    }
    // Raft solid collision deck for raycasting
    const raftCollider = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.35, 4.8), matWoodDark);
    raftCollider.position.y = 0.1;
    raftCollider.visible = false;
    raftGroup.add(raftCollider);
    this.obstacleColliders.push(raftCollider);

    this.environmentGroup.add(raftGroup);
    this.floatingObjects.push({ mesh: raftGroup, baseY: 1.52, baseRotZ: 0, baseRotX: 0, phase: 1.9 });

    // E. Submerged Indian Highway Truck (Tata 1613 style)
    const truckGroup = new THREE.Group();
    truckGroup.position.set(-8, 0, 8);
    truckGroup.rotation.set(0.12, 0.45, -0.15); // Tilted in flooded ditch

    const matTruckBlue = new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.35 });
    const matBumperYellow = new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.4 });

    // Cabin
    const truckCab = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.6, 3.2), matTruckBlue);
    truckCab.position.set(0, 2.3, 1.4);
    truckCab.castShadow = true;
    truckGroup.add(truckCab);
    this.obstacleColliders.push(truckCab);

    // Windshield
    const windshield = new THREE.Mesh(new THREE.BoxGeometry(2.8, 1.0, 0.1), matDarkConcrete);
    windshield.position.set(0, 2.8, 3.02);
    truckGroup.add(windshield);

    // Decorative Yellow Front Bumper
    const bumper = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.6, 0.4), matBumperYellow);
    bumper.position.set(0, 1.3, 3.1);
    truckGroup.add(bumper);

    // Cargo Bed with submerged freight
    const bed = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.8, 4.6), matWoodDark);
    bed.position.set(0, 2.1, -2.4);
    truckGroup.add(bed);
    this.obstacleColliders.push(bed);

    this.environmentGroup.add(truckGroup);

    // F. Submerged Indian Auto-Rickshaw
    const rickshawGroup = new THREE.Group();
    rickshawGroup.position.set(6, 0.8, -10);
    rickshawGroup.rotation.set(0.2, -0.6, 0.25);

    const autoHood = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.4, 2.6), new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.4 }));
    autoHood.position.y = 1.0;
    rickshawGroup.add(autoHood);
    this.obstacleColliders.push(autoHood);

    const autoBody = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.8, 2.6), new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.5 }));
    autoBody.position.y = 0.3;
    rickshawGroup.add(autoBody);
    this.environmentGroup.add(rickshawGroup);

    // G. Submerged Maroon Passenger Sedan
    const carGroup = new THREE.Group();
    carGroup.position.set(16, 0.8, 8);
    carGroup.rotation.set(0.18, 0.8, -0.1);

    const carBody = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.3, 4.8), new THREE.MeshStandardMaterial({ color: 0x881337, roughness: 0.35 }));
    carBody.position.y = 0.9;
    carGroup.add(carBody);
    this.obstacleColliders.push(carBody);
    this.environmentGroup.add(carGroup);

    // H. Stranded NDRF Emergency Support Ambulance on Dry Embankment
    const ambGroup = new THREE.Group();
    ambGroup.position.set(-34, 1.85, 0);
    const ambBody = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.2, 5.6), matWallWhite);
    ambBody.position.y = 1.3;
    ambGroup.add(ambBody);
    this.obstacleColliders.push(ambBody);

    const ambStripe = new THREE.Mesh(new THREE.BoxGeometry(2.65, 0.3, 5.65), new THREE.MeshBasicMaterial({ color: 0xdc2626 }));
    ambStripe.position.y = 1.4;
    ambGroup.add(ambStripe);

    this.environmentGroup.add(ambGroup);
    this.addEmergencyBeaconLight(new THREE.Vector3(-34, 4.4, 0), true);

    // -------------------------------------------------------------------------
    // 6. DENSE ASSAM VEGETATION & BOTANICAL COVERAGE (100+ TREES, REEDS & HYACINTHS)
    // -------------------------------------------------------------------------
    // A. Betel Nut / Areca Palms ("Tamul Gos") (24 trees in homestead groves)
    const palmCoords = [
      [-22, -18], [-26, -26], [-32, -16], [-30, -28], [-16, -28],
      [-12, -36], [-34, -4], [-38, -2], [20, 26], [26, 28],
      [28, 22], [32, 24], [30, -14], [34, -12], [36, -20],
      [38, -18], [14, -36], [20, -36], [-18, 28], [-22, 32],
      [-26, 28], [-30, 22], [-8, -36], [38, 28]
    ];
    palmCoords.forEach(([px, pz]) => {
      buildTree(px, pz, 'areca_palm', 0.85 + Math.random() * 0.35);
    });

    // B. Banana Plant Clumps ("Kol Gos") (20 plants near houses & waters)
    const bananaCoords = [
      [-20, -12], [-18, -14], [-12, -22], [-32, 16], [-28, 18],
      [-20, 18], [16, 24], [18, 22], [28, 10], [26, -4],
      [12, -18], [14, -22], [-6, 26], [-8, 24], [8, 28],
      [22, -24], [-34, 18], [36, 12], [-2, 22], [2, 26]
    ];
    bananaCoords.forEach(([bx, bz]) => {
      buildTree(bx, bz, 'banana_plant', 0.9 + Math.random() * 0.3);
    });

    // C. Large Banyan and Peepal Trees ("Ahot Gos") (8 massive trees)
    // Tree 1: Giant Banyan standing in deep water cradling Survivor 4 on horizontal bough!
    buildTree(16, -16, 'banyan_tree', 1.0, 6.8);
    // Tree 2: West village sacred banyan with hanging aerial prop roots
    buildTree(-22, -4, 'banyan_tree', 1.2);
    // Tree 3: Near primary school
    buildTree(32, 8, 'banyan_tree', 1.15);
    // Tree 4: Submerged tree in North water
    buildTree(-12, 32, 'banyan_tree', 1.1);
    // Tree 5: South corner
    buildTree(8, -36, 'banyan_tree', 1.25);
    // Tree 6: West corner landmark
    buildTree(-38, -36, 'banyan_tree', 1.2);
    // Tree 7: East perimeter
    buildTree(38, -38, 'banyan_tree', 1.15);
    // Tree 8: North riverbank
    buildTree(0, 36, 'banyan_tree', 1.2);

    // D. Bamboo Groves ("Banhoni") (14 flexible clumps)
    const bambooCoords = [
      [-16, -8], [-24, -14], [-34, 2], [6, -22], [10, -28],
      [22, -14], [-10, 18], [-4, 20], [24, 34], [34, 16],
      [-36, -24], [2, -34], [-28, 32], [36, -16]
    ];
    bambooCoords.forEach(([gx, gz]) => {
      buildTree(gx, gz, 'bamboo_cluster', 0.95 + Math.random() * 0.25);
    });

    // E. Brahmaputra Floodplain Reeds / Elephant Grass ("Kahuwa") (18 tall clumps)
    const reedCoords = [
      [-14, 16], [-18, 20], [-8, 18], [-22, 10], [6, 18],
      [10, 22], [14, 12], [-6, -10], [-10, -12], [22, -18],
      [26, -22], [30, -20], [-26, -16], [-30, -14], [4, -18],
      [18, -12], [-14, 28], [12, 28]
    ];
    reedCoords.forEach(([rx, rz]) => {
      buildTree(rx, rz, 'reeds', 0.9 + Math.random() * 0.3);
    });

    // F. Floodplain Riverbank Shrubs & Bushes (12 clumps)
    const shrubCoords = [
      [-36, -3], [-30, 3], [-24, 3], [-18, 3], [14, 3],
      [20, 3], [28, 3], [36, 3], [44, 3], [-44, -3],
      [36, -32], [28, -32]
    ];
    shrubCoords.forEach(([sx, sz]) => {
      buildTree(sx, sz, 'bush', 0.85 + Math.random() * 0.3);
    });

    // G. Floating Water Hyacinth Mats ("Pani Meteka") (20 patches)
    const hyacinthCoords = [
      [-18, 10], [-10, -6], [-28, 4], [-22, 16], [10, -8],
      [14, -14], [20, -10], [6, 14], [12, 12], [-6, -14],
      [-2, -22], [22, 4], [26, -18], [-14, 26], [4, 24],
      [-32, -8], [18, 28], [-4, 12], [-16, 6], [16, -6]
    ];
    hyacinthCoords.forEach(([hx, hz]) => {
      buildWaterHyacinth(hx, hz, 0.8 + Math.random() * 0.5);
    });

    // -------------------------------------------------------------------------
    // 7. STRUCTURED FLOATING DEBRIS FIELD (40+ COLLISION-FREE OBJECTS)
    // -------------------------------------------------------------------------
    // Driftwood logs bobbing in open waterways
    const logSpots = [
      [-16, 8], [-12, -4], [-8, 14], [4, -8], [12, -12],
      [16, -4], [-20, 18], [-6, 22], [8, 16], [14, 8],
      [-24, -8], [22, -12], [-14, -16], [6, -16], [20, 14],
      [-10, 24]
    ];
    logSpots.forEach(([lx, lz], idx) => {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 3.2 + (idx % 3), 8), matTrunkBrown);
      log.rotation.z = Math.PI / 2;
      log.rotation.y = (idx * 0.7);
      log.position.set(lx, 1.52, lz);
      this.environmentGroup.add(log);
      this.floatingObjects.push({ mesh: log, baseY: 1.52, baseRotZ: Math.PI / 2, baseRotX: 0, phase: idx * 0.6 });
    });

    // Floating banana pseudostems (traditional emergency flood floats in Assam)
    const bananaStemSpots = [
      [-14, 12], [-8, -6], [2, 12], [14, -8], [-22, 8], [18, 6], [8, -14], [-4, 16]
    ];
    bananaStemSpots.forEach(([bx, bz], idx) => {
      const bFloat = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 3.6, 8), matBananaLeaf);
      bFloat.rotation.z = Math.PI / 2;
      bFloat.rotation.y = idx * 1.1;
      bFloat.position.set(bx, 1.50, bz);
      this.environmentGroup.add(bFloat);
      this.floatingObjects.push({ mesh: bFloat, baseY: 1.50, baseRotZ: Math.PI / 2, baseRotX: 0, phase: idx * 0.8 });
    });

    // Blue chemical & water barrels bobbing with current
    const matBarrel = new THREE.MeshStandardMaterial({ color: 0x0284c7, metalness: 0.4, roughness: 0.4 });
    const barrelSpots = [
      [-14, 4], [-10, 10], [-6, -2], [4, 6], [10, -4],
      [16, 10], [-18, 14], [2, -12], [12, 18], [-22, -4]
    ];
    barrelSpots.forEach(([bx, bz], idx) => {
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.15, 12), matBarrel);
      barrel.rotation.z = Math.PI / 2.3;
      barrel.position.set(bx, 1.48, bz);
      this.environmentGroup.add(barrel);
      this.floatingObjects.push({ mesh: barrel, baseY: 1.48, baseRotZ: Math.PI / 2.3, baseRotX: 0, phase: idx * 0.7 });
    });

    // Floating wooden crates & cargo pallets
    const matCrate = new THREE.MeshStandardMaterial({ color: 0x854d0e, roughness: 0.85 });
    const crateSpots = [
      [-12, 2], [-4, -8], [6, 2], [14, 4], [-16, 20],
      [8, 20], [18, -16], [-24, 2]
    ];
    crateSpots.forEach(([cx, cz], idx) => {
      const crate = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.85, 1.2), matCrate);
      crate.position.set(cx, 1.47, cz);
      crate.rotation.y = idx * 0.9;
      this.environmentGroup.add(crate);
      this.floatingObjects.push({ mesh: crate, baseY: 1.47, baseRotZ: 0, baseRotX: 0, phase: idx * 0.8 });
    });

    // Dislodged floating corrugated tin roofing sheets
    const tinSpots = [
      [-8, 6], [10, 8], [-18, -2], [4, -14]
    ];
    tinSpots.forEach(([tx, tz], idx) => {
      const tinSheet = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.04, 3.2), matTinGalv);
      tinSheet.position.set(tx, 1.49, tz);
      tinSheet.rotation.y = idx * 1.3;
      this.environmentGroup.add(tinSheet);
      this.floatingObjects.push({ mesh: tinSheet, baseY: 1.49, baseRotZ: 0, baseRotX: 0, phase: idx * 1.2 });
    });

    // -------------------------------------------------------------------------
    // 8. 8 VISIBLE ASSAM FLOOD SURVIVORS (EXACT, REALISTIC, UNCLIPPED SITING)
    // -------------------------------------------------------------------------
    // Survivor 1: Family stranded on corrugated stilt house rooftop (RED: Immediate)
    // Placed accurately on the red corrugated tin roof slope of Stilt House 1
    this.addSurvivor({
      id: 'SURV-FL-01',
      name: 'Family on Corrugated Rooftop',
      position: new THREE.Vector3(-28, 8.28, -20.0),
      posture: 'waving',
      temperature: 36.4,
      triage: 'RED',
      clothingColor: 0xea580c, // High-vis rescue orange
      flagColor: 0xdc2626,     // Red distress cloth
      hasLifejacket: true,
      vitals: 'Hypothermia Risk | Infant Present | Urgent Aerial Extraction',
      gasExposure: 'Clean (River Gale)',
      detected: false
    });

    // Survivor 2: Villager clinging to drifting makeshift bamboo raft (YELLOW: Urgent)
    // Placed directly on the bamboo raft platform, moving synchronously with the raft!
    this.addSurvivor({
      id: 'SURV-FL-02',
      name: 'Villager on Bamboo Raft',
      position: new THREE.Vector3(-26, 1.72, 14),
      floatingHost: raftGroup,
      posture: 'sitting',
      temperature: 36.6,
      triage: 'YELLOW',
      clothingColor: 0xeab308, // Mustard yellow shirt
      holdingPaddle: true,
      vitals: 'HR: 94 bpm | Exhaustion | Adrift in Current',
      gasExposure: 'Clean',
      detected: false
    });

    // Survivor 3: Displaced civilians stranded on school building terrace (GREEN: Minor)
    // Placed on the open flat concrete rooftop terrace of the Primary School flood shelter
    this.addSurvivor({
      id: 'SURV-FL-03',
      name: 'Displaced Civilians (School Terrace)',
      position: new THREE.Vector3(24, 8.95, 18),
      posture: 'waving',
      temperature: 36.8,
      triage: 'GREEN',
      clothingColor: 0xf1f5f9, // White kurta
      flagColor: 0xef4444,
      vitals: 'Stable | Signaling for Food/Water Airdrop | 4 Sheltered',
      gasExposure: 'Clean',
      detected: false
    });

    // Survivor 4: Trapped person perched safely on sturdy horizontal bough of flooded banyan tree (RED: Immediate)
    // Tree 1 at (16, -16) has a horizontal bough extending over the water; survivor is on the limb!
    this.addSurvivor({
      id: 'SURV-FL-04',
      name: 'Trapped Citizen in Tree Canopy',
      position: new THREE.Vector3(18.0, 4.95, -14.2),
      posture: 'waving',
      temperature: 36.5,
      triage: 'RED',
      clothingColor: 0xdc2626, // Bright red shirt
      flagColor: 0xfacc15,
      vitals: 'HR: 126 bpm | Acute Stress | Water Surging Beneath',
      gasExposure: 'Clean',
      detected: false
    });

    // Survivor 5: Stranded farmer standing on elevated chang-ghar front veranda (YELLOW: Urgent)
    // Stilt House 3 has front veranda at z: -22.8, floor top at y: 3.88
    this.addSurvivor({
      id: 'SURV-FL-05',
      name: 'Farmer on Elevated Stilt Porch',
      position: new THREE.Vector3(-4, 3.90, -22.8),
      posture: 'standing',
      temperature: 36.9,
      triage: 'YELLOW',
      clothingColor: 0x16a34a, // Green check shirt
      vitals: 'Isolated | Livestock Stranded Below | Needs Medical Kit',
      gasExposure: 'Clean',
      detected: false
    });

    // Survivor 6: Stranded truck driver on submerged cab roof (RED: Immediate)
    // Seated on the cab roof of the submerged Tata 1613 truck
    this.addSurvivor({
      id: 'SURV-FL-06',
      name: 'Truck Driver on Submerged Roof',
      position: new THREE.Vector3(-8.0, 3.65, 8.8),
      posture: 'sitting',
      temperature: 36.7,
      triage: 'RED',
      clothingColor: 0x2563eb, // Blue shirt & orange vest
      hasLifejacket: true,
      vitals: 'HR: 108 bpm | Floodwater Rising Fast | Cold Exposure',
      gasExposure: 'Clean',
      detected: false
    });

    // Survivor 7: Displaced resident and child on clinic 1st-floor balcony (YELLOW: Urgent)
    // Balcony slab at y = 3.98, z = -1.2
    this.addSurvivor({
      id: 'SURV-FL-07',
      name: 'Displaced Resident (Clinic Balcony)',
      position: new THREE.Vector3(28, 4.05, -1.2),
      posture: 'waving',
      temperature: 36.8,
      triage: 'YELLOW',
      clothingColor: 0xec4899, // Pink / magenta saree
      flagColor: 0xffffff,
      vitals: 'HR: 88 bpm | Awaiting Ingress Boat Rescue | Dehydrated',
      gasExposure: 'Clean',
      detected: false
    });

    // Survivor 8: Evacuees on High-Ground Community Refuge Mound ("Chapori") (GREEN: Minor)
    // Standing on the open grass refuge mound near sandbags and relief tent
    this.addSurvivor({
      id: 'SURV-FL-08',
      name: 'Evacuees on High-Ground Mound',
      position: new THREE.Vector3(35.5, 2.05, -24.5),
      posture: 'waving',
      temperature: 37.0,
      triage: 'GREEN',
      clothingColor: 0xd97706, // Amber attire
      flagColor: 0xfacc15,
      vitals: 'Stable | Sheltered at High Ground | Awaiting Rations',
      gasExposure: 'Clean',
      detected: false
    });

    // Rescue Boat Flashing Strobe Light
    this.addEmergencyBeaconLight(new THREE.Vector3(18, 2.6, -20), true);

    // Update all object world matrices immediately for LiDAR SLAM raycasting
    this.scene.updateMatrixWorld(true);
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

    // Anatomical body proportions
    // High-visibility orange / blue / custom clothing
    const clothColor = data.clothingColor || (data.triage === 'RED' ? 0xe11d48 : (data.triage === 'YELLOW' ? 0xd97706 : 0x0284c7));
    const vestMat = new THREE.MeshStandardMaterial({
      color: clothColor,
      roughness: 0.6
    });
    const skinMat = new THREE.MeshStandardMaterial({ color: data.skinColor || 0xfbbf24, roughness: 0.7 });
    const pantsMat = new THREE.MeshStandardMaterial({ color: data.pantsColor || 0x1e293b, roughness: 0.8 });

    // Torso
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.24, 0.85, 10), vestMat);
    torso.position.y = 0.85;
    torso.castShadow = true;
    group.add(torso);

    // Lifejacket / Hi-vis Vest overlay if specified
    if (data.hasLifejacket) {
      const lj = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.7, 0.55), new THREE.MeshStandardMaterial({ color: 0xea580c, roughness: 0.5 }));
      lj.position.y = 0.9;
      group.add(lj);
    }

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

      // Signaling distress cloth in hand
      const flagMat = new THREE.MeshBasicMaterial({ color: data.flagColor || 0xff2222, side: THREE.DoubleSide });
      const clothFlag = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.32), flagMat);
      clothFlag.position.set(0, 0.36, 0);
      leftArm.add(clothFlag);
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

      if (data.holdingPaddle) {
        const paddle = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.8), new THREE.MeshStandardMaterial({ color: 0x78350f }));
        paddle.rotation.x = 0.6;
        paddle.position.set(0.45, 0.4, 0.4);
        group.add(paddle);
      }
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

    if (data.floatingHost) {
      group.position.set(
        data.position.x - data.floatingHost.position.x,
        data.position.y - data.floatingHost.position.y,
        data.position.z - data.floatingHost.position.z
      );
      data.floatingHost.add(group);
    } else {
      group.position.copy(data.position);
      this.environmentGroup.add(group);
    }
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

  addEmergencyBeaconLight(pos, alwaysActive = false) {
    const beacon = new THREE.PointLight(0xff0044, alwaysActive ? 2.0 : 2.5, 30, 2);
    beacon.position.copy(pos);
    beacon.visible = alwaysActive || this.isNightMode;
    this.environmentGroup.add(beacon);
    this.emergencyLights.push({ light: beacon, basePos: pos, phase: Math.random() * Math.PI, alwaysActive });
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
      item.light.visible = item.alwaysActive || isNight;
      item.light.intensity = isNight ? 2.8 : (item.alwaysActive ? 1.8 : 0);
    });
  }

  update(delta) {
    // 1. Animate survivors waving arms & sync floating host world positions
    this.survivors.forEach(s => {
      if (s.wavingArm) {
        s.wavingArm.rotation.z = 2.2 + Math.sin(Date.now() * 0.007) * 0.45;
      }
      if (s.meshGroup && s.floatingHost) {
        s.meshGroup.getWorldPosition(s.position);
      }
    });

    // 2. Animate dynamic flood water waves and ripples (Flood / Tsunami scenario)
    if (this.waterMesh && this.waterGeo && this.waterInitialZ) {
      const time = Date.now() * 0.0022;
      this.waterMesh.position.y = 1.48 + Math.sin(time * 0.7) * 0.03;

      const pos = this.waterGeo.attributes.position;
      const arr = pos.array;
      const init = this.waterInitialZ;

      // Displace water vertices to create undulating swells, chop and wind ripples
      for (let i = 0; i < pos.count; i++) {
        const vx = init[i * 3];
        const vy = init[i * 3 + 1];
        // In PlaneGeometry before rotation.x = -PI/2, local Z corresponds to World Y
        const wave = Math.sin(vx * 0.07 + time * 1.6) * 0.11 +
                     Math.cos(vy * 0.06 + time * 1.3) * 0.08 +
                     Math.sin((vx * 0.14 + vy * 0.11) + time * 2.2) * 0.04 +
                     Math.cos((vx * 0.2 - vy * 0.15) + time * 2.8) * 0.02;
        arr[i * 3 + 2] = wave;
      }
      pos.needsUpdate = true;
      this.waterGeo.computeVertexNormals();
    } else if (this.waterMesh) {
      const time = Date.now() * 0.002;
      this.waterMesh.position.y = 1.48 + Math.sin(time) * 0.05;
    }

    // Animate deep river channel surface swells in sync
    if (this.channelMesh && this.channelGeo && this.channelInitialZ) {
      const time = Date.now() * 0.0022;
      this.channelMesh.position.y = 1.49 + Math.sin(time * 0.7) * 0.03;

      const pos = this.channelGeo.attributes.position;
      const arr = pos.array;
      const init = this.channelInitialZ;

      for (let i = 0; i < pos.count; i++) {
        const vx = init[i * 3];
        const vy = init[i * 3 + 1];
        arr[i * 3 + 2] = Math.sin(vx * 0.07 + time * 1.8) * 0.09 +
                         Math.cos(vy * 0.08 + time * 1.4) * 0.06 +
                         Math.sin((vx * 0.18 + vy * 0.14) + time * 2.5) * 0.03;
      }
      pos.needsUpdate = true;
      this.channelGeo.computeVertexNormals();
    }

    // 3. Animate floating debris, rafts & boats bobbing on floodwaters
    if (this.floatingObjects && this.floatingObjects.length > 0) {
      const time = Date.now() * 0.002;
      this.floatingObjects.forEach(item => {
        const p = time + (item.phase || 0);
        item.mesh.position.y = item.baseY + Math.sin(p * 2.2) * 0.06;
        item.mesh.rotation.z = (item.baseRotZ || 0) + Math.sin(p * 1.6) * 0.04;
        item.mesh.rotation.x = (item.baseRotX || 0) + Math.cos(p * 1.4) * 0.03;
      });
    }

    // 4. Animate emergency vehicle / boat beacon flashing
    this.emergencyLights.forEach(item => {
      if (this.isNightMode || item.alwaysActive) {
        const now = Date.now() * 0.008;
        const isRed = Math.sin(now + item.phase) > 0;
        item.light.color.setHex(isRed ? 0xff0044 : 0x0066ff);
        item.light.intensity = (this.isNightMode ? 2.5 : 1.6) + Math.sin(now * 2) * 1.0;
      }
    });

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
}

window.DisasterEnvironment = DisasterEnvironment;
