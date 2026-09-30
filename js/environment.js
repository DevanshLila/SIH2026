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
    this.structuralHazards = []; // Structural AI detection markers for Earthquake simulation
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
    this.structuralHazards = [];
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
    } else if (type === 'earthquake') {
      // 1. Weathered Asphalt Base Terrain
      const groundGeo = new THREE.PlaneGeometry(180, 180, 32, 32);
      const groundMat = new THREE.MeshStandardMaterial({
        color: 0x181e28, // Dark weathered asphalt
        roughness: 0.94,
        metalness: 0.08
      });
      const ground = new THREE.Mesh(groundGeo, groundMat);
      ground.rotation.x = -Math.PI / 2;
      ground.receiveShadow = true;
      this.environmentGroup.add(ground);
      this.obstacleColliders.push(ground);

      // Earthen soil & debris sediment patches beneath building collapse zones
      const soilMat = new THREE.MeshStandardMaterial({ color: 0x4a3f31, roughness: 0.95 });
      const soilPatches = [
        { x: -32, z: -20, w: 42, d: 46 },
        { x: 32, z: -20, w: 42, d: 46 },
        { x: -34, z: 22, w: 38, d: 36 },
        { x: 32, z: 24, w: 42, d: 40 }
      ];
      soilPatches.forEach(sp => {
        const patch = new THREE.Mesh(new THREE.PlaneGeometry(sp.w, sp.d), soilMat);
        patch.rotation.x = -Math.PI / 2;
        patch.position.set(sp.x, 0.02, sp.z);
        patch.receiveShadow = true;
        this.environmentGroup.add(patch);
      });
    } else {
      // 1. Industrial Factory Yard Ground
      const groundGeo = new THREE.PlaneGeometry(180, 180, 32, 32);
      const groundMat = new THREE.MeshStandardMaterial({
        color: 0x181f2a, // Industrial tarmac perimeter
        roughness: 0.90,
        metalness: 0.12
      });
      const ground = new THREE.Mesh(groundGeo, groundMat);
      ground.rotation.x = -Math.PI / 2;
      ground.receiveShadow = true;
      this.environmentGroup.add(ground);
      this.obstacleColliders.push(ground);

      // Heavy Reinforced Concrete Slab Foundation Yard (Main Plant & Tank Farm Area)
      const yardMat = new THREE.MeshStandardMaterial({
        color: 0x2e3846, // Industrial concrete slab
        roughness: 0.85,
        metalness: 0.18
      });
      const yardSlab = new THREE.Mesh(new THREE.BoxGeometry(84, 0.25, 96), yardMat);
      yardSlab.position.set(-6, 0.12, -4);
      yardSlab.receiveShadow = true;
      this.environmentGroup.add(yardSlab);
      this.obstacleColliders.push(yardSlab);

      // Tactical Coordinate Grid
      const grid = new THREE.GridHelper(180, 36, 0x0284c7, 0x1e293b);
      grid.position.y = 0.26;
      this.environmentGroup.add(grid);
    }
  }

    // =========================================================================
  // SCENARIO 1: REALISTIC URBAN EARTHQUAKE DISASTER ENVIRONMENT (SERIOUS-GAME / SIMULATOR)
  // 50-70%+ Built Environment Destroyed: Pancaked Slabs, Leaning Towers, Sheared Walls,
  // Massive Fault Rupture Chasm, Rubble Fields, Active NDRF Responders & Tactical Overlays
  // =========================================================================
  buildEarthquakeScenario() {
    // -------------------------------------------------------------------------
    // 1. PALETTES & REALISTIC URBAN COLLAPSE MATERIALS
    // Desaturated cool palette: pale concrete whites, light greys, muted beige/brown rubble,
    // dusty tan earth, dark charcoal asphalt. Orange/yellow/red used exclusively as emergency/hazard accents.
    // -------------------------------------------------------------------------
    const matPaleConcrete   = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.80 });
    const matLightConcrete  = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.82 });
    const matMidConcrete    = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.85 });
    const matDarkConcrete   = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.88 });
    const matSlabConcrete   = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.90 });

    // Rubble & Earth Materials
    const matRubbleBeige    = new THREE.MeshStandardMaterial({ color: 0xd6cbbe, roughness: 0.92 });
    const matRubbleTan      = new THREE.MeshStandardMaterial({ color: 0xc4b5a0, roughness: 0.94 });
    const matRubbleBrown    = new THREE.MeshStandardMaterial({ color: 0xb8a99a, roughness: 0.92 });
    const matDustyEarth     = new THREE.MeshStandardMaterial({ color: 0xc7b597, roughness: 0.96 });
    const matSubterranean   = new THREE.MeshStandardMaterial({ color: 0x271e16, roughness: 0.98 });

    // Asphalt & Roadways
    const matAsphalt        = new THREE.MeshStandardMaterial({ color: 0x1a2130, roughness: 0.95 });
    const matCrackedAsphalt = new THREE.MeshStandardMaterial({ color: 0x111622, roughness: 0.98 });
    const matYellowStripe   = new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.60 });
    const matWhiteStripe    = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.60 });

    // Structural, Masonry & Debris Materials
    const matRebar          = new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.85, roughness: 0.35 });
    const matSteelBeam      = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.88, roughness: 0.30 });
    const matBrickRed       = new THREE.MeshStandardMaterial({ color: 0x7a6352, roughness: 0.90 }); // Muted weathered masonry/brick
    const matBrickBrown     = new THREE.MeshStandardMaterial({ color: 0x634832, roughness: 0.92 });
    const matBrickOchre     = new THREE.MeshStandardMaterial({ color: 0x8a705b, roughness: 0.90 });
    const matWoodTimber     = new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.92 });
    const matWoodBroken     = new THREE.MeshStandardMaterial({ color: 0x78533b, roughness: 0.90 });

    // Architecture & Glass
    const matGlassDark      = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.15, metalness: 0.85 });
    const matRoofTerra      = new THREE.MeshStandardMaterial({ color: 0x8a4b38, roughness: 0.85 });
    const matRoofSlate      = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.75 });
    const matRoofTinGalv    = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.72, roughness: 0.35 });
    const matWallCream      = new THREE.MeshStandardMaterial({ color: 0xf1ede4, roughness: 0.80 });
    const matWallSkyBlue    = new THREE.MeshStandardMaterial({ color: 0xd1d5db, roughness: 0.82 }); // Pale grey concrete (NOT bright blue!)
    const matWallPastelGreen= new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.80 }); // Pale concrete white (NOT pastel green!)
    const matWallBeige      = new THREE.MeshStandardMaterial({ color: 0xe2d9cc, roughness: 0.80 });

    // Emergency & Response Materials (Accents ONLY)
    const matHazardOrange   = new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.50 });
    const matHazardYellow   = new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.50 });
    const matHazardRed      = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.50 });
    const matNdrfNavy       = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.60 });
    const matNdrfWhite      = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.50 });

    // Vehicle Materials (Muted disaster-debris tones)
    const matCarRed         = new THREE.MeshStandardMaterial({ color: 0x5a2d2d, roughness: 0.60 }); // Weathered dusty maroon
    const matCarYellow      = new THREE.MeshStandardMaterial({ color: 0x8f773d, roughness: 0.60 }); // Dusty weathered ochre taxi
    const matCarWhite       = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.60 }); // Dusty white
    const matCarTire        = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.90 });

    // Environmental details
    const matPuddleWater    = new THREE.MeshStandardMaterial({
      color: 0x1e40af,
      roughness: 0.1,
      metalness: 0.4,
      transparent: true,
      opacity: 0.8
    });
    const matTrunkBrown     = new THREE.MeshStandardMaterial({ color: 0x45271a, roughness: 0.9 });
    const matLeafGreen      = new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.7 });

    // -------------------------------------------------------------------------
    // 2. BACKGROUND DEPTH: DISTANT MOUNTAINS & DAMAGED URBAN SKYLINE
    // Creates wide scale and realism for elevated isometric/third-person survey camera
    // -------------------------------------------------------------------------
    const bgGroup = new THREE.Group();

    // A. Layered Perimeter Mountain Ridges (Radius 180m - 260m)
    const mountainColors = [0x5e7c99, 0x6d8ba8, 0x7b98b5, 0x8eaac9, 0xa1bddc];
    const mountainConfigs = [
      // North Mountain Range
      { x: -140, z: -210, w: 90, h: 54, d: 70, cIdx: 0, rotY: 0.2 },
      { x: -60,  z: -230, w: 110, h: 62, d: 80, cIdx: 1, rotY: -0.1 },
      { x: 30,   z: -220, w: 95,  h: 58, d: 75, cIdx: 2, rotY: 0.3 },
      { x: 120,  z: -210, w: 85,  h: 48, d: 65, cIdx: 1, rotY: -0.2 },
      // East Mountain Range
      { x: 210,  z: -120, w: 80,  h: 50, d: 90, cIdx: 3, rotY: 0.1 },
      { x: 230,  z: -20,  w: 90,  h: 56, d: 95, cIdx: 2, rotY: -0.15 },
      { x: 215,  z: 80,   w: 85,  h: 46, d: 85, cIdx: 4, rotY: 0.25 },
      // South Mountain Range
      { x: 130,  z: 215,  w: 90,  h: 45, d: 70, cIdx: 1, rotY: 0.1 },
      { x: 40,   z: 230,  w: 105, h: 52, d: 80, cIdx: 0, rotY: -0.3 },
      { x: -50,  z: 220,  w: 95,  h: 48, d: 75, cIdx: 2, rotY: 0.15 },
      { x: -130, z: 210,  w: 85,  h: 42, d: 70, cIdx: 3, rotY: -0.2 },
      // West Mountain Range
      { x: -210, z: 120,  w: 85,  h: 48, d: 80, cIdx: 2, rotY: 0.1 },
      { x: -230, z: 10,   w: 95,  h: 58, d: 90, cIdx: 1, rotY: -0.1 },
      { x: -210, z: -100, w: 85,  h: 52, d: 85, cIdx: 3, rotY: 0.2 }
    ];

    mountainConfigs.forEach(mc => {
      const matMtn = new THREE.MeshStandardMaterial({
        color: mountainColors[mc.cIdx],
        roughness: 0.96,
        flatShading: true
      });
      // Realistic low-poly multi-ridge mountain formation with wide base
      const mtnGeo = new THREE.CylinderGeometry(mc.w * 0.12, mc.w * 0.56, mc.h, 5, 1);
      const mtnMesh = new THREE.Mesh(mtnGeo, matMtn);
      mtnMesh.position.set(mc.x, mc.h / 2 - 2, mc.z);
      mtnMesh.rotation.y = mc.rotY;
      mtnMesh.scale.set(1.4, 1.0, (mc.d / mc.w) * 0.8);
      bgGroup.add(mtnMesh);
    });

    // B. Distant Damaged Urban Skyline Silhouettes (Radius 95m - 145m)
    const skylineConfigs = [
      // North skyline silhouettes
      { x: -95, z: -125, w: 18, h: 36, d: 16, tilt: 0.08 },
      { x: -55, z: -135, w: 22, h: 44, d: 18, tilt: -0.06 },
      { x: 10,  z: -130, w: 20, h: 32, d: 16, tilt: 0.05 },
      { x: 75,  z: -125, w: 24, h: 38, d: 20, tilt: -0.09 },
      // East skyline silhouettes
      { x: 125, z: -70,  w: 18, h: 34, d: 16, tilt: 0.07 },
      { x: 135, z: 20,   w: 20, h: 40, d: 18, tilt: -0.05 },
      { x: 125, z: 95,   w: 22, h: 30, d: 16, tilt: 0.06 },
      // South skyline silhouettes
      { x: 80,  z: 125,  w: 18, h: 32, d: 16, tilt: -0.08 },
      { x: -20, z: 130,  w: 24, h: 36, d: 20, tilt: 0.07 },
      { x: -90, z: 125,  w: 20, h: 28, d: 18, tilt: -0.05 },
      // West skyline silhouettes
      { x: -125, z: 65,  w: 18, h: 35, d: 16, tilt: 0.08 },
      { x: -130, z: -45, w: 22, h: 42, d: 20, tilt: -0.06 }
    ];

    skylineConfigs.forEach(sc => {
      const matSkyline = new THREE.MeshStandardMaterial({
        color: 0x64748b,
        roughness: 0.9,
        flatShading: true
      });
      const bMesh = new THREE.Mesh(new THREE.BoxGeometry(sc.w, sc.h, sc.d), matSkyline);
      bMesh.position.set(sc.x, sc.h / 2, sc.z);
      bMesh.rotation.z = sc.tilt;
      bgGroup.add(bMesh);

      // Jagged damaged roof silhouette on top
      const topCap = new THREE.Mesh(new THREE.ConeGeometry(sc.w * 0.45, sc.h * 0.18, 4), matSkyline);
      topCap.position.set(sc.x, sc.h + (sc.h * 0.09), sc.z);
      topCap.rotation.y = Math.PI / 4;
      bgGroup.add(topCap);
    });

    // Distant Tilted Crane Silhouette on damaged building roof
    const cranePole = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 18, 6), matSteelBeam);
    cranePole.position.set(-55, 48, -135);
    cranePole.rotation.z = 0.28;
    bgGroup.add(cranePole);
    const craneJib = new THREE.Mesh(new THREE.BoxGeometry(22, 0.4, 0.4), matSteelBeam);
    craneJib.position.set(-48, 54, -135);
    craneJib.rotation.z = -0.15;
    bgGroup.add(craneJib);

    this.environmentGroup.add(bgGroup);

    // -------------------------------------------------------------------------
    // 3. DAMAGED ROAD NETWORK WITH MASSIVE SEISMIC FAULT CHASM & DISPLACEMENT SCARP
    // -------------------------------------------------------------------------
    const roadGroup = new THREE.Group();

    // A. Main North-South Boulevard (22m wide x 160m long)
    // South boulevard section (intact elevation y: 0.18)
    const blvdSouth = new THREE.Mesh(new THREE.BoxGeometry(22, 0.36, 75), matAsphalt);
    blvdSouth.position.set(0, 0.18, 40);
    blvdSouth.receiveShadow = true;
    roadGroup.add(blvdSouth);
    this.obstacleColliders.push(blvdSouth);

    // North boulevard section (SUNKEN FAULT DISPLACEMENT: dropped down by 0.9m relative to south!)
    const blvdNorth = new THREE.Mesh(new THREE.BoxGeometry(22, 0.36, 68), matAsphalt);
    blvdNorth.position.set(0, -0.72, -48);
    blvdNorth.receiveShadow = true;
    roadGroup.add(blvdNorth);
    this.obstacleColliders.push(blvdNorth);

    // Double Yellow Centerline South
    [-0.3, 0.3].forEach(offset => {
      const line = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 73), matYellowStripe);
      line.position.set(offset, 0.37, 40);
      roadGroup.add(line);
    });

    // Double Yellow Centerline North (Sunken with lateral shear offset)
    [-0.3, 0.3].forEach(offset => {
      const line = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.05, 66), matYellowStripe);
      line.position.set(offset + 0.65, -0.53, -48); // Sheared laterally by 0.65m!
      roadGroup.add(line);
    });

    // Concrete Sidewalks and Curbs along Boulevard
    [-12.5, 12.5].forEach(x => {
      // South sidewalk
      const swSouth = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.45, 75), matLightConcrete);
      swSouth.position.set(x, 0.23, 40);
      swSouth.receiveShadow = true;
      roadGroup.add(swSouth);
      this.obstacleColliders.push(swSouth);

      // North sidewalk (sunken)
      const swNorth = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.45, 68), matLightConcrete);
      swNorth.position.set(x + (x > 0 ? 0.3 : -0.3), -0.67, -48);
      swNorth.receiveShadow = true;
      roadGroup.add(swNorth);
      this.obstacleColliders.push(swNorth);
    });

    // B. East-West Cross Avenue (16m wide x 150m long at Z: 18)
    const crossBed = new THREE.Mesh(new THREE.BoxGeometry(150, 0.34, 16), matAsphalt);
    crossBed.position.set(0, 0.18, 18);
    crossBed.receiveShadow = true;
    roadGroup.add(crossBed);
    this.obstacleColliders.push(crossBed);

    const crossLine = new THREE.Mesh(new THREE.BoxGeometry(148, 0.05, 0.3), matYellowStripe);
    crossLine.position.set(0, 0.36, 18);
    roadGroup.add(crossLine);

    [9.2, 26.8].forEach(z => {
      const sidewalk = new THREE.Mesh(new THREE.BoxGeometry(150, 0.44, 2.4), matLightConcrete);
      sidewalk.position.set(0, 0.23, z);
      sidewalk.receiveShadow = true;
      roadGroup.add(sidewalk);
      this.obstacleColliders.push(sidewalk);
    });

    // C. MASSIVE PRIMARY GROUND FISSURE & SEISMIC FAULT CHASM (Z: -14 to -10)
    // Clear prominent ground fissure spanning the entire roadway in foreground/midground
    const chasmGroup = new THREE.Group();
    chasmGroup.position.set(0, 0, -12);

    // Deep subterranean chasm pit (28m wide x 5m broad x 2.2m deep)
    const chasmCavity = new THREE.Mesh(new THREE.BoxGeometry(28, 2.4, 5.2), matSubterranean);
    chasmCavity.position.set(0, -1.0, 0);
    chasmCavity.receiveShadow = true;
    chasmGroup.add(chasmCavity);
    this.obstacleColliders.push(chasmCavity);

    // Jagged exposed bedrock & subterranean strata blocks inside chasm
    const strataBlocks = [
      { x: -10, y: -0.6, z: -1.2, w: 4.5, h: 1.4, d: 2.2, rot: 0.15 },
      { x: -4,  y: -0.8, z: 1.0,  w: 5.2, h: 1.2, d: 2.5, rot: -0.22 },
      { x: 3,   y: -0.7, z: -0.8, w: 4.8, h: 1.5, d: 2.0, rot: 0.18 },
      { x: 9.5, y: -0.9, z: 0.6,  w: 5.0, h: 1.3, d: 2.4, rot: -0.12 }
    ];
    strataBlocks.forEach(sb => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(sb.w, sb.h, sb.d), matSubterranean);
      b.position.set(sb.x, sb.y, sb.z);
      b.rotation.y = sb.rot;
      chasmGroup.add(b);
      this.obstacleColliders.push(b);
    });

    // Exposed fractured concrete stormwater drainage culverts inside fault chasm
    [-6.5, 5.0].forEach(cx => {
      const pipeOuter = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 4.2, 12, 1, true), matDarkConcrete);
      pipeOuter.position.set(cx, -0.65, 0);
      pipeOuter.rotation.x = Math.PI / 2;
      chasmGroup.add(pipeOuter);

      const pipeInner = new THREE.Mesh(new THREE.CylinderGeometry(0.60, 0.60, 4.22, 12, 1, true), matSubterranean);
      pipeInner.position.set(cx, -0.65, 0);
      pipeInner.rotation.x = Math.PI / 2;
      chasmGroup.add(pipeInner);
    });

    // Dangling severed underground electrical conduit cables across chasm
    for (let c = 0; c < 4; c++) {
      const cableCurve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(-10 + c * 6, 0.15, -2.4),
        new THREE.Vector3(-10 + c * 6 + 1.2, -1.2, 0),
        new THREE.Vector3(-10 + c * 6 + 0.8, -0.7, 2.5)
      );
      const cableGeo = new THREE.TubeGeometry(cableCurve, 12, 0.035, 6, false);
      const cableMesh = new THREE.Mesh(cableGeo, matRebar);
      chasmGroup.add(cableMesh);
    }

    // 4 Massive Buckled Asphalt Slabs Tilted into Fissure (Sharp 18-24° Angles)
    // Slab 1: West buckled slab tilting into trench
    const buckledSlab1 = new THREE.Mesh(new THREE.BoxGeometry(11, 0.45, 5.2), matAsphalt);
    buckledSlab1.position.set(-5.5, 0.65, 1.8);
    buckledSlab1.rotation.set(0.24, 0.08, -0.16);
    chasmGroup.add(buckledSlab1);
    this.obstacleColliders.push(buckledSlab1);

    // Sheared Yellow Stripe on Slab 1
    const stripe1 = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.06, 5.0), matYellowStripe);
    stripe1.position.set(-0.3, 0.24, 0);
    buckledSlab1.add(stripe1);

    // Slab 2: East buckled slab tilting into trench from North side
    const buckledSlab2 = new THREE.Mesh(new THREE.BoxGeometry(10.5, 0.45, 5.0), matAsphalt);
    buckledSlab2.position.set(5.5, 0.55, -2.2);
    buckledSlab2.rotation.set(-0.26, -0.06, 0.19);
    chasmGroup.add(buckledSlab2);
    this.obstacleColliders.push(buckledSlab2);

    // Slab 3: Far West sidewalk slab broken and raised
    const buckledSlab3 = new THREE.Mesh(new THREE.BoxGeometry(5.5, 0.48, 4.8), matLightConcrete);
    buckledSlab3.position.set(-12.5, 0.72, 0.8);
    buckledSlab3.rotation.set(0.18, 0.15, -0.25);
    chasmGroup.add(buckledSlab3);
    this.obstacleColliders.push(buckledSlab3);

    // Slab 4: Far East sidewalk slab dropped and tilted
    const buckledSlab4 = new THREE.Mesh(new THREE.BoxGeometry(5.5, 0.48, 4.8), matLightConcrete);
    buckledSlab4.position.set(12.5, 0.45, -1.0);
    buckledSlab4.rotation.set(-0.22, 0.10, 0.18);
    chasmGroup.add(buckledSlab4);
    this.obstacleColliders.push(buckledSlab4);

    roadGroup.add(chasmGroup);

    // D. Crossroads Buckled Intersection (Z: 18, X: 0) - Compressed Anticlinal Ridge
    const crossroadBuckle = new THREE.Mesh(new THREE.BoxGeometry(9.0, 0.45, 9.0), matCrackedAsphalt);
    crossroadBuckle.position.set(1.5, 0.55, 19);
    crossroadBuckle.rotation.set(0.18, 0.42, -0.14);
    roadGroup.add(crossroadBuckle);
    this.obstacleColliders.push(crossroadBuckle);

    // E. North & South Transverse Road Fractures
    // Fissure at Z: -42 (North)
    const chasmNorth = new THREE.Mesh(new THREE.BoxGeometry(24, 0.9, 3.8), matSubterranean);
    chasmNorth.position.set(0, -0.65, -42);
    roadGroup.add(chasmNorth);

    const buckledNorthSlab = new THREE.Mesh(new THREE.BoxGeometry(12, 0.42, 4.5), matAsphalt);
    buckledNorthSlab.position.set(-4, -0.35, -41);
    buckledNorthSlab.rotation.set(0.20, 0.10, 0.12);
    roadGroup.add(buckledNorthSlab);
    this.obstacleColliders.push(buckledNorthSlab);

    // Fissure at Z: 46 (South)
    const chasmSouth = new THREE.Mesh(new THREE.BoxGeometry(24, 0.8, 3.5), matSubterranean);
    chasmSouth.position.set(0, 0.05, 46);
    roadGroup.add(chasmSouth);

    // F. Branching Surface Fracture Decal Lines on Asphalt
    const crackDecals = [
      { x: -3.5, z: -25, len: 16, rot: 0.38, w: 0.35 },
      { x: 4.5,  z: -4,  len: 18, rot: -0.45, w: 0.40 },
      { x: -6.0, z: 28,  len: 14, rot: 0.28, w: 0.32 },
      { x: 5.0,  z: 36,  len: 12, rot: -0.32, w: 0.30 },
      { x: 24.0, z: 17,  len: 20, rot: 0.15, w: 0.36 },
      { x: -26.0,z: 19,  len: 18, rot: -0.22, w: 0.34 },
      { x: 45.0, z: 18,  len: 16, rot: 0.25, w: 0.32 },
      { x: -48.0,z: 18,  len: 15, rot: -0.18, w: 0.30 },
      { x: -2.0, z: -60, len: 14, rot: 0.15, w: 0.35 },
      { x: 3.0,  z: 58,  len: 16, rot: -0.20, w: 0.32 }
    ];
    crackDecals.forEach(cd => {
      const cl = new THREE.Mesh(new THREE.BoxGeometry(cd.w, 0.05, cd.len), matCrackedAsphalt);
      cl.position.set(cd.x, 0.38, cd.z);
      cl.rotation.y = cd.rot;
      roadGroup.add(cl);
    });

    // G. Sheared Underground Water Main & Reflective Blue Puddle at (-6, 0.18, 16)
    const waterPuddle = new THREE.Mesh(new THREE.PlaneGeometry(7.0, 5.5), matPuddleWater);
    waterPuddle.rotation.x = -Math.PI / 2;
    waterPuddle.position.set(-6, 0.38, 16);
    roadGroup.add(waterPuddle);

    const severedPipe = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 1.8, 12), new THREE.MeshStandardMaterial({ color: 0x0284c7, metalness: 0.7 }));
    severedPipe.rotation.z = Math.PI / 3;
    severedPipe.position.set(-7.5, 0.62, 15.5);
    roadGroup.add(severedPipe);

    this.environmentGroup.add(roadGroup);

    // -------------------------------------------------------------------------
    // 4. DENSE URBAN BUILDINGS (14+ DISTINCT STRUCTURES WITH 50-70%+ DESTRUCTION)
    // -------------------------------------------------------------------------

    // =========================================================================
    // BUILDING 1: "Metropolis Towers" - Leaning & Sheared 6-Storey Apartment Tower
    // Landmark leaning collapse at (-28, 0, -28), visibly tilted ~8 degrees
    // =========================================================================
    const bldg1Group = new THREE.Group();
    bldg1Group.position.set(-28, 0, -28);

    const b1Core = new THREE.Mesh(new THREE.BoxGeometry(18, 28, 16), matPaleConcrete);
    b1Core.position.y = 14;
    b1Core.castShadow = true;
    bldg1Group.add(b1Core);
    this.obstacleColliders.push(b1Core);

    // Reinforced concrete floor dividing slabs on 6 floors
    for (let f = 1; f <= 5; f++) {
      const slab = new THREE.Mesh(new THREE.BoxGeometry(19.2, 0.7, 17.2), matSlabConcrete);
      slab.position.y = f * 4.6;
      bldg1Group.add(slab);
      this.obstacleColliders.push(slab);
    }

    // Windows strips with shattered dark glass
    for (let f = 0; f < 6; f++) {
      for (let w = -6; w <= 6; w += 4) {
        const win = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.8, 0.25), matGlassDark);
        win.position.set(w, f * 4.6 + 2.4, 8.05);
        bldg1Group.add(win);
      }
    }

    // Diagonal Structural X-Shear Crack Lines down exterior facade
    const b1Crack1 = new THREE.Mesh(new THREE.BoxGeometry(0.35, 18, 0.15), matCrackedAsphalt);
    b1Crack1.position.set(-2, 14, 8.1);
    b1Crack1.rotation.z = 0.55;
    bldg1Group.add(b1Crack1);

    const b1Crack2 = new THREE.Mesh(new THREE.BoxGeometry(0.35, 18, 0.15), matCrackedAsphalt);
    b1Crack2.position.set(2, 14, 8.1);
    b1Crack2.rotation.z = -0.55;
    bldg1Group.add(b1Crack2);

    // Violent Corner Shear Rupture on 3rd & 4th floors (outer walls missing)
    const b1ShearCavity = new THREE.Mesh(new THREE.BoxGeometry(7.0, 9.5, 7.0), matDarkConcrete);
    b1ShearCavity.position.set(6.8, 16.5, 5.8);
    bldg1Group.add(b1ShearCavity);

    // Sheared Balcony on 3rd Floor (Sheltering waving Survivor SURV-EQ-02)
    const b1Balcony = new THREE.Mesh(new THREE.BoxGeometry(6.5, 0.45, 2.8), matLightConcrete);
    b1Balcony.position.set(4.5, 14.2, 8.4);
    bldg1Group.add(b1Balcony);
    this.obstacleColliders.push(b1Balcony);

    const b1BalconyRail = new THREE.Mesh(new THREE.BoxGeometry(6.5, 0.9, 0.12), matDarkConcrete);
    b1BalconyRail.position.set(4.5, 14.8, 9.7);
    bldg1Group.add(b1BalconyRail);

    // Exposed bent rebar rods extending from sheared balcony edge
    for (let r = 0; r < 5; r++) {
      const rebar = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.6, 6), matRebar);
      rebar.position.set(1.8 + r * 1.1, 14.2, 9.9);
      rebar.rotation.x = 0.45 + (r % 2 === 0 ? 0.3 : -0.2);
      bldg1Group.add(rebar);
    }

    // Leaning Rooftop Elevator Penthouse & Tilted Water Tank
    const b1Penthouse = new THREE.Mesh(new THREE.BoxGeometry(5.5, 3.8, 5.5), matLightConcrete);
    b1Penthouse.position.set(-3, 29.8, -2);
    bldg1Group.add(b1Penthouse);

    // Water tank steel support legs connecting to roof (y: 28 to 29.2)
    [[-0.8, -0.8], [-0.8, 0.8], [0.8, -0.8], [0.8, 0.8]].forEach(([lx, lz]) => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.8, 6), matRebar);
      leg.position.set(3.5 + lx, 28.9, 2 + lz);
      bldg1Group.add(leg);
    });

    const b1WaterTank = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 2.4, 12), matRoofTinGalv);
    b1WaterTank.position.set(3.5, 29.8, 2);
    b1WaterTank.rotation.z = 0.28;
    bldg1Group.add(b1WaterTank);

    // Leaning structural tilt: 8 degrees on Z, -3 degrees on X
    bldg1Group.rotation.z = 0.12;
    bldg1Group.rotation.x = -0.05;
    this.environmentGroup.add(bldg1Group);

    // =========================================================================
    // BUILDING 2: "Grand Plaza Commercial Mall" - Catastrophic 5-Tier Pancaked Collapse
    // Complete progressive pancake collapse at (30, 0, -22)
    // =========================================================================
    const bldg2Group = new THREE.Group();
    bldg2Group.position.set(30, 0, -22);

    for (let i = 0; i < 5; i++) {
      const slabW = 24 - i * 0.8;
      const slabD = 20 - i * 0.7;
      const slab = new THREE.Mesh(new THREE.BoxGeometry(slabW, 0.85, slabD), matSlabConcrete);
      slab.position.set((i % 2 === 0 ? 0.8 : -0.8), 1.0 + i * 1.35, (i % 2 === 0 ? -0.6 : 0.6));
      slab.rotation.set(0.08 * (i % 2 === 0 ? 1 : -1), 0.05 * i, -0.09 * (i % 2 === 0 ? -1 : 1));
      slab.castShadow = true;
      bldg2Group.add(slab);
      this.obstacleColliders.push(slab);

      // Crushed concrete column stumps sandwiched between slabs creating survival cavities
      [-8, 0, 8].forEach(px => {
        const pillar = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.3, 1.3), matMidConcrete);
        pillar.position.set(px + (i % 2 === 0 ? 0.5 : -0.5), i * 1.35 + 0.55, (i % 2 === 0 ? 4 : -4));
        pillar.rotation.set(0.2, 0.15, 0.25);
        bldg2Group.add(pillar);
      });
    }

    // Protruding bent rebar cages around pancaked perimeter
    for (let rb = 0; rb < 8; rb++) {
      const rebar = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 3.2, 6), matRebar);
      rebar.position.set(-10 + rb * 2.8, 2.5 + (rb % 3) * 1.2, 9.8);
      rebar.rotation.set(0.5, 0.3 * (rb % 2 === 0 ? 1 : -1), 0.4);
      bldg2Group.add(rebar);
    }

    // Crushed Rooftop Chiller Units & Bent Metal Ducting
    const acChiller = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.6, 2.8), matRoofTinGalv);
    acChiller.position.set(2, 7.6, 1);
    acChiller.rotation.set(0.25, 0.35, -0.30);
    bldg2Group.add(acChiller);

    const duct1 = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.8, 6.0), matRoofTinGalv);
    duct1.position.set(-3, 7.2, -2);
    duct1.rotation.set(0.15, -0.4, 0.2);
    bldg2Group.add(duct1);

    this.environmentGroup.add(bldg2Group);

    // =========================================================================
    // BUILDING 3: 3-Storey Brick Townhouse - Sheared Facade & Exposed Interior Rooms
    // Front wall completely sheared off onto street at (-46, 0, -12)
    // =========================================================================
    const bldg3Group = new THREE.Group();
    bldg3Group.position.set(-46, 0, -12);

    // Back & Side brick walls
    const b3Back = new THREE.Mesh(new THREE.BoxGeometry(14, 11, 0.8), matBrickRed);
    b3Back.position.set(0, 5.5, -6);
    bldg3Group.add(b3Back);
    this.obstacleColliders.push(b3Back);

    const b3West = new THREE.Mesh(new THREE.BoxGeometry(0.8, 11, 12), matBrickRed);
    b3West.position.set(-7, 5.5, 0);
    bldg3Group.add(b3West);
    this.obstacleColliders.push(b3West);

    const b3East = new THREE.Mesh(new THREE.BoxGeometry(0.8, 11, 7), matBrickRed);
    b3East.position.set(7, 5.5, -2.5);
    bldg3Group.add(b3East);
    this.obstacleColliders.push(b3East);

    // Exposed Timber Floor Platforms on 2nd and 3rd Storeys
    const b3Floor1 = new THREE.Mesh(new THREE.BoxGeometry(13.5, 0.35, 11), matWoodTimber);
    b3Floor1.position.set(0, 3.8, 0);
    bldg3Group.add(b3Floor1);
    this.obstacleColliders.push(b3Floor1);

    const b3Floor2 = new THREE.Mesh(new THREE.BoxGeometry(13.5, 0.35, 11), matWoodTimber);
    b3Floor2.position.set(0, 7.6, 0);
    bldg3Group.add(b3Floor2);
    this.obstacleColliders.push(b3Floor2);

    // Half-Collapsed Terracotta Tile Roof
    const b3Roof = new THREE.Mesh(new THREE.BoxGeometry(15, 0.3, 7.5), matRoofTerra);
    b3Roof.position.set(0, 11.8, -2.5);
    b3Roof.rotation.x = -0.44;
    bldg3Group.add(b3Roof);
    this.obstacleColliders.push(b3Roof);

    // Multi-Level Exposed Interior Furniture (visible from elevated aerial survey!)
    // Ground floor kitchen counter & table
    const table = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.8, 1.2), matWoodBroken);
    table.position.set(-2, 0.4, -1);
    table.rotation.z = 0.2;
    bldg3Group.add(table);

    // 2nd floor bedroom bed
    const bed = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.5, 1.8), new THREE.MeshStandardMaterial({ color: 0x2563eb }));
    bed.position.set(-3.5, 4.15, 1.5);
    bldg3Group.add(bed);

    // Dangling ceiling timber rafter beam angled across room
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 7.2), matWoodTimber);
    beam.position.set(-1.0, 2.2, 1.2);
    beam.rotation.set(0.42, 0.22, -0.32);
    bldg3Group.add(beam);

    // Massive Red Brick Rubble Spill Cone pouring out 12m onto sidewalk
    const brickRubbleCone = new THREE.Mesh(new THREE.ConeGeometry(6.5, 2.5, 8), matBrickRed);
    brickRubbleCone.position.set(0, 1.25, 6.8);
    bldg3Group.add(brickRubbleCone);
    this.obstacleColliders.push(brickRubbleCone);

    this.environmentGroup.add(bldg3Group);

    // =========================================================================
    // BUILDING 4: "Apex Financial Tower" - Soft-Storey Ground Failure & Slumping Tower
    // Commercial tower with sheared ground floor columns at (25, 0, 10)
    // =========================================================================
    const bldg4Group = new THREE.Group();
    bldg4Group.position.set(25, 0, 10);

    // Upper 4 floors mass (slumped down by 3.5m and tilted)
    const b4Upper = new THREE.Mesh(new THREE.BoxGeometry(18, 15, 15), matMidConcrete);
    b4Upper.position.y = 10.5;
    b4Upper.castShadow = true;
    bldg4Group.add(b4Upper);
    this.obstacleColliders.push(b4Upper);

    // Continuous ribbon glass windows
    for (let f = 1; f <= 4; f++) {
      const winRibbon = new THREE.Mesh(new THREE.BoxGeometry(16.8, 1.6, 0.25), matGlassDark);
      winRibbon.position.set(0, 4.8 + f * 3.2, 7.55);
      bldg4Group.add(winRibbon);
    }

    // Ground floor soft-storey crushed columns (sheared sideways at 30° angles)
    [-7, -2.5, 2.5, 7].forEach((colX, idx) => {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.52, 3.8, 8), matDarkConcrete);
      col.position.set(colX, 1.8, 6.8);
      col.rotation.z = (idx % 2 === 0 ? 0.32 : -0.35);
      bldg4Group.add(col);
      this.obstacleColliders.push(col);
    });

    // West Steel Fire Escape with platform sheltering waving Survivor 5 (SURV-EQ-05)
    const b4EscapePlatform = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.35, 4.8), matSteelBeam);
    b4EscapePlatform.position.set(-9.8, 5.8, 2.0);
    bldg4Group.add(b4EscapePlatform);
    this.obstacleColliders.push(b4EscapePlatform);

    const b4EscapeRail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.95, 4.8), matRebar);
    b4EscapeRail.position.set(-10.8, 6.4, 2.0);
    bldg4Group.add(b4EscapeRail);

    // 4th Floor Corner Breach Terrace sheltering waving office worker SURV-EQ-12
    const b4CornerFloor = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.45, 4.8), matSlabConcrete);
    b4CornerFloor.position.set(6.8, 13.8, 5.5);
    bldg4Group.add(b4CornerFloor);
    this.obstacleColliders.push(b4CornerFloor);

    // Broken corner column and bent rebar
    const b4BrokenCol = new THREE.Mesh(new THREE.BoxGeometry(0.65, 2.2, 0.65), matDarkConcrete);
    b4BrokenCol.position.set(8.8, 15.0, 7.5);
    b4BrokenCol.rotation.set(0.22, 0.12, -0.32);
    bldg4Group.add(b4BrokenCol);

    for (let r = 0; r < 4; r++) {
      const rebar = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.4, 6), matRebar);
      rebar.position.set(5.8 + r * 1.0, 14.1, 7.6);
      rebar.rotation.x = 0.45 + (r % 2 === 0 ? 0.2 : -0.2);
      bldg4Group.add(rebar);
    }

    // Leaning tilt from soft-storey failure
    bldg4Group.rotation.z = -0.09;
    bldg4Group.rotation.x = 0.04;
    this.environmentGroup.add(bldg4Group);

    // =========================================================================
    // BUILDING 5: "Sunset Duplex" - Sandwich V-Shape Roof Collapse
    // Center snapped inward creating protective survival triangle at (-42, 0, 14)
    // =========================================================================
    const bldg5Group = new THREE.Group();
    bldg5Group.position.set(-42, 0, 14);

    const b5Base = new THREE.Mesh(new THREE.BoxGeometry(12, 0.5, 11), matSlabConcrete);
    b5Base.position.set(0, 0.25, 0);
    bldg5Group.add(b5Base);
    this.obstacleColliders.push(b5Base);

    // Tilted floor slabs forming lean-to
    const b5Tilt1 = new THREE.Mesh(new THREE.BoxGeometry(11, 0.55, 10), matSlabConcrete);
    b5Tilt1.position.set(-1.5, 1.8, 0);
    b5Tilt1.rotation.set(0.14, 0.06, 0.18);
    bldg5Group.add(b5Tilt1);
    this.obstacleColliders.push(b5Tilt1);

    const b5Tilt2 = new THREE.Mesh(new THREE.BoxGeometry(10, 0.5, 9), matSlabConcrete);
    b5Tilt2.position.set(-2.0, 3.0, 0);
    b5Tilt2.rotation.set(-0.10, 0.08, 0.24);
    bldg5Group.add(b5Tilt2);
    this.obstacleColliders.push(b5Tilt2);

    // Collapsed wooden staircase creating protective survival cavity for child SURV-EQ-09
    const b5Stair = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.28, 4.8), matWoodTimber);
    b5Stair.position.set(2.0, 1.3, 0.5);
    b5Stair.rotation.set(0.44, 0.12, -0.28);
    bldg5Group.add(b5Stair);
    this.obstacleColliders.push(b5Stair);

    this.environmentGroup.add(bldg5Group);

    // =========================================================================
    // BUILDING 6: Leveled Industrial Warehouse Ruin (Total Collapse Mound)
    // Leveled into massive concrete, metal & truss mound at (44, 0, -42)
    // =========================================================================
    const bldg6Group = new THREE.Group();
    bldg6Group.position.set(44, 0, -42);

    const b6Mound = new THREE.Mesh(new THREE.ConeGeometry(11, 5.5, 8), matRubbleBrown);
    b6Mound.position.y = 2.75;
    bldg6Group.add(b6Mound);
    this.obstacleColliders.push(b6Mound);

    // Fractured precast concrete beams sticking out
    for (let bm = 0; bm < 5; bm++) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.8, 9.5), matMidConcrete);
      beam.position.set((bm - 2) * 3.5, 3.2, (bm % 2 === 0 ? 2 : -2));
      beam.rotation.set(0.4 * (bm % 2 === 0 ? 1 : -1), 0.5 * bm, -0.35);
      bldg6Group.add(beam);
      this.obstacleColliders.push(beam);
    }

    // Crumpled corrugated sheet metal panels
    for (let cp = 0; cp < 4; cp++) {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.1, 3.5), matRoofTinGalv);
      panel.position.set((cp - 1.5) * 4, 3.8, (cp % 2 === 0 ? -3 : 3));
      panel.rotation.set(0.5, 0.3 * cp, -0.4);
      bldg6Group.add(panel);
    }

    this.environmentGroup.add(bldg6Group);

    // =========================================================================
    // BUILDING 7: Westside Commercial Bazaar Block
    // Crumpled roll-up shutters & collapsed concrete canopy at (14, 0, -32)
    // =========================================================================
    const bldg7Group = new THREE.Group();
    bldg7Group.position.set(14, 0, -32);

    const b7Body = new THREE.Mesh(new THREE.BoxGeometry(18, 4.6, 8.5), matWallBeige);
    b7Body.position.y = 2.3;
    bldg7Group.add(b7Body);
    this.obstacleColliders.push(b7Body);

    // 3 roll-up shop shutters (dented & buckled)
    [-5.5, 0, 5.5].forEach((sx, idx) => {
      const shutter = new THREE.Mesh(new THREE.BoxGeometry(4.4, 3.2, 0.2), matRoofTinGalv);
      shutter.position.set(sx, 1.6, 4.3);
      shutter.rotation.y = (idx === 1 ? 0.18 : -0.12);
      bldg7Group.add(shutter);
    });

    // Collapsed heavy concrete awning hanging onto sidewalk
    const b7Awning = new THREE.Mesh(new THREE.BoxGeometry(19, 0.22, 3.4), matDarkConcrete);
    b7Awning.position.set(0, 1.8, 5.4);
    b7Awning.rotation.x = 0.58;
    bldg7Group.add(b7Awning);
    this.obstacleColliders.push(b7Awning);

    this.environmentGroup.add(bldg7Group);

    // =========================================================================
    // BUILDING 8: 4-Storey Apartment Complex (Diagonal Shear Ruptures)
    // Severe structural cracking & 2 fallen balconies at (38, 0, 26)
    // =========================================================================
    const bldg8Group = new THREE.Group();
    bldg8Group.position.set(38, 0, 26);

    const b8Body = new THREE.Mesh(new THREE.BoxGeometry(16, 14, 13), matWallCream);
    b8Body.position.y = 7.0;
    b8Body.castShadow = true;
    bldg8Group.add(b8Body);
    this.obstacleColliders.push(b8Body);

    // Massive diagonal shear cracks
    const b8Crack = new THREE.Mesh(new THREE.BoxGeometry(0.35, 14, 0.15), matCrackedAsphalt);
    b8Crack.position.set(0, 7.0, 6.55);
    b8Crack.rotation.z = 0.48;
    bldg8Group.add(b8Crack);

    // 2 Fallen Balconies smashed on sidewalk
    [-3.5, 3.5].forEach((bx, idx) => {
      const fBalc = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.4, 2.0), matLightConcrete);
      fBalc.position.set(bx, 0.4, 8.2 + idx * 0.6);
      fBalc.rotation.set(0.22 * (idx === 0 ? 1 : -1), 0.35, 0.15);
      bldg8Group.add(fBalc);
      this.obstacleColliders.push(fBalc);
    });

    this.environmentGroup.add(bldg8Group);

    // =========================================================================
    // BUILDING 9: Civic Heritage Hall (Colonnade Failure)
    // Toppled fluted entrance columns at (-22, 0, -8)
    // =========================================================================
    const bldg9Group = new THREE.Group();
    bldg9Group.position.set(-22, 0, -8);

    const b9Body = new THREE.Mesh(new THREE.BoxGeometry(16, 8.5, 12), matPaleConcrete);
    b9Body.position.y = 4.25;
    b9Body.castShadow = true;
    bldg9Group.add(b9Body);
    this.obstacleColliders.push(b9Body);

    // Collapsed triangular stone pediment
    const pediment = new THREE.Mesh(new THREE.ConeGeometry(7.5, 3.2, 4), matLightConcrete);
    pediment.position.set(0, 9.8, 0);
    pediment.rotation.y = Math.PI / 4;
    pediment.rotation.z = 0.18; // Fractured skewed angle
    bldg9Group.add(pediment);
    this.obstacleColliders.push(pediment);

    // Toppled stone columns broken into drums across steps
    [-3.5, 0, 3.5].forEach((cx, idx) => {
      const colDrum = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 4.5, 10), matLightConcrete);
      colDrum.position.set(cx, 0.5, 7.5 + idx * 0.4);
      colDrum.rotation.z = Math.PI / 2 + 0.1;
      colDrum.rotation.y = 0.35 * (idx % 2 === 0 ? 1 : -1);
      bldg9Group.add(colDrum);
      this.obstacleColliders.push(colDrum);
    });

    this.environmentGroup.add(bldg9Group);

    // =========================================================================
    // BUILDING 10: Neighborhood Medical Clinic (Collapsed Portico)
    // Cracked clinic with collapsed ambulance entrance at (-28, 0, 30)
    // =========================================================================
    const bldg10Group = new THREE.Group();
    bldg10Group.position.set(-28, 0, 30);

    const b10Body = new THREE.Mesh(new THREE.BoxGeometry(14, 8.0, 11), matPaleConcrete);
    b10Body.position.y = 4.0;
    b10Body.castShadow = true;
    bldg10Group.add(b10Body);
    this.obstacleColliders.push(b10Body);

    // Red Cross emblem
    const crossH = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.55, 0.1), matHazardRed);
    crossH.position.set(0, 6.2, 5.56);
    bldg10Group.add(crossH);
    const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.55, 2.0, 0.1), matHazardRed);
    crossV.position.set(0, 6.2, 5.56);
    bldg10Group.add(crossV);

    // Collapsed ambulance portico canopy resting on pavement
    const portico = new THREE.Mesh(new THREE.BoxGeometry(7.5, 0.35, 4.5), matMidConcrete);
    portico.position.set(0, 1.2, 7.5);
    portico.rotation.x = 0.45;
    bldg10Group.add(portico);
    this.obstacleColliders.push(portico);

    this.environmentGroup.add(bldg10Group);

    // =========================================================================
    // BUILDING 11: Suburban Villa with Split Terracotta Roof
    // Split hip roof with broken ridge tiles at (-48, 0, -38)
    // =========================================================================
    const bldg11Group = new THREE.Group();
    bldg11Group.position.set(-48, 0, -38);

    const b11Body = new THREE.Mesh(new THREE.BoxGeometry(13, 5.0, 10), matWallSkyBlue);
    b11Body.position.y = 2.5;
    bldg11Group.add(b11Body);
    this.obstacleColliders.push(b11Body);

    const b11Roof = new THREE.Mesh(new THREE.ConeGeometry(9.0, 3.4, 4), matRoofTerra);
    b11Roof.position.y = 6.4;
    b11Roof.rotation.y = Math.PI / 4;
    b11Roof.rotation.z = 0.25; // Tilted split roof
    bldg11Group.add(b11Roof);
    this.obstacleColliders.push(b11Roof);

    this.environmentGroup.add(bldg11Group);

    // =========================================================================
    // BUILDING 12: Single-Storey Bungalow with Collapsed Chimney
    // Brick chimney crashed through veranda at (18, 0, 38)
    // =========================================================================
    const bldg12Group = new THREE.Group();
    bldg12Group.position.set(18, 0, 38);

    const b12Body = new THREE.Mesh(new THREE.BoxGeometry(12, 4.6, 9), matWallPastelGreen);
    b12Body.position.y = 2.3;
    bldg12Group.add(b12Body);
    this.obstacleColliders.push(b12Body);

    const b12Roof = new THREE.Mesh(new THREE.ConeGeometry(8.2, 2.8, 4), matRoofSlate);
    b12Roof.position.y = 5.9;
    b12Roof.rotation.y = Math.PI / 4;
    bldg12Group.add(b12Roof);
    this.obstacleColliders.push(b12Roof);

    // Heavy sheared brick chimney fallen onto porch
    const fallenChimney = new THREE.Mesh(new THREE.BoxGeometry(1.3, 2.4, 1.3), matBrickRed);
    fallenChimney.position.set(3.4, 1.0, 4.8);
    fallenChimney.rotation.set(0.45, 0.22, 1.15);
    bldg12Group.add(fallenChimney);

    this.environmentGroup.add(bldg12Group);

    // =========================================================================
    // BUILDING 13 & 14: Perimeter Ruined Structures (Ensuring 70%+ Area Destruction)
    // =========================================================================
    // Building 13: South-West Ruined Apartment at (-44, 0, 38)
    const bldg13Group = new THREE.Group();
    bldg13Group.position.set(-44, 0, 38);
    const b13Body = new THREE.Mesh(new THREE.BoxGeometry(14, 9.0, 11), matLightConcrete);
    b13Body.position.y = 4.5;
    bldg13Group.add(b13Body);
    this.obstacleColliders.push(b13Body);
    const b13Crack = new THREE.Mesh(new THREE.BoxGeometry(0.35, 9.2, 0.15), matCrackedAsphalt);
    b13Crack.position.set(1.5, 4.5, 5.55);
    b13Crack.rotation.z = -0.35;
    bldg13Group.add(b13Crack);
    this.environmentGroup.add(bldg13Group);

    // Building 14: South-East Ruined Commercial Block at (44, 0, 40)
    const bldg14Group = new THREE.Group();
    bldg14Group.position.set(44, 0, 40);
    const b14Body = new THREE.Mesh(new THREE.BoxGeometry(15, 8.5, 12), matPaleConcrete);
    b14Body.position.y = 4.25;
    bldg14Group.add(b14Body);
    this.obstacleColliders.push(b14Body);
    this.environmentGroup.add(bldg14Group);

    // -------------------------------------------------------------------------
    // 5. COLLAPSED PRECAST VOIDS, VEHICLES & INFRASTRUCTURE
    // -------------------------------------------------------------------------

    // A. Central Boulevard Collapsed Precast Highway Slab Void at (-6.5, 0, -6)
    // Protective cavity sheltering Survivor SURV-EQ-01
    const voidSlab = new THREE.Mesh(new THREE.BoxGeometry(8.0, 0.70, 6.0), matSlabConcrete);
    voidSlab.position.set(-6.5, 1.6, -6.0);
    voidSlab.rotation.set(0.32, 0.15, -0.28);
    voidSlab.castShadow = true;
    this.environmentGroup.add(voidSlab);
    this.obstacleColliders.push(voidSlab);

    const voidSupport = new THREE.Mesh(new THREE.BoxGeometry(2.8, 1.3, 2.8), matDarkConcrete);
    voidSupport.position.set(-8.8, 0.65, -6.5);
    this.environmentGroup.add(voidSupport);
    this.obstacleColliders.push(voidSupport);

    // B. Collapsed Brick Boundary Wall at (12, 0, -12) (Sheltering Survivor SURV-EQ-06)
    [-3.2, 0, 3.2].forEach((wx, idx) => {
      const wSec = new THREE.Mesh(new THREE.BoxGeometry(3.0, 1.4, 0.4), matBrickRed);
      wSec.position.set(12 + wx, 0.5, -12 + (idx % 2 === 0 ? 0.4 : -0.3));
      wSec.rotation.set(0.32 * (idx % 2 === 0 ? 1 : -1), 0.1, 0.2);
      this.environmentGroup.add(wSec);
      this.obstacleColliders.push(wSec);
    });

    // C. Urban Assembly Park at (-14, 0, 18)
    const parkGround = new THREE.Mesh(new THREE.BoxGeometry(16, 0.2, 14), new THREE.MeshStandardMaterial({ color: 0x365314, roughness: 0.9 }));
    parkGround.position.set(-14, 0.2, 18);
    this.environmentGroup.add(parkGround);
    this.obstacleColliders.push(parkGround);

    const fallenTree = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 7.5, 8), matTrunkBrown);
    fallenTree.position.set(-12, 0.4, 21);
    fallenTree.rotation.z = Math.PI / 2 + 0.2;
    fallenTree.rotation.y = 0.35;
    this.environmentGroup.add(fallenTree);
    this.obstacleColliders.push(fallenTree);

    // D. Scattered Vehicles (Civilian, Crushed & Overturned)
    // 1. Red Passenger Sedan Crushed under concrete slab at (4.5, 0, 15.5) (Sheltering driver SURV-EQ-11)
    const carGroup = new THREE.Group();
    carGroup.position.set(4.5, 0, 15.5);
    carGroup.rotation.y = 0.35;

    const carChassis = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.4, 2.0), matCarRed);
    carChassis.position.y = 0.25;
    carGroup.add(carChassis);
    this.obstacleColliders.push(carChassis);

    const carHood = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.45, 1.9), matCarRed);
    carHood.position.set(1.3, 0.55, 0);
    carGroup.add(carHood);

    const carTrunk = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.45, 1.9), matCarRed);
    carTrunk.position.set(-1.4, 0.55, 0);
    carGroup.add(carTrunk);

    [[-1.3, -0.95], [-1.3, 0.95], [1.2, -0.95], [1.2, 0.95]].forEach(([wx, wz]) => {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.22, 10), matCarTire);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(wx, 0.32, wz);
      carGroup.add(wheel);
    });

    const roofPillar = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.1, 1.8), matCarRed);
    roofPillar.position.set(-0.2, 1.15, -0.2);
    roofPillar.rotation.set(0.2, 0.1, 0.25);
    carGroup.add(roofPillar);

    this.environmentGroup.add(carGroup);

    // Concrete slab fallen across rear trunk of sedan
    const carSlab = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.55, 3.4), matSlabConcrete);
    carSlab.position.set(3.0, 1.35, 15.2);
    carSlab.rotation.set(0.28, 0.15, -0.25);
    this.environmentGroup.add(carSlab);
    this.obstacleColliders.push(carSlab);

    // 2. Overturned Yellow Taxi at (8.5, 1.0, 18.0)
    const taxi = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.3, 2.0), matCarYellow);
    taxi.position.set(8.5, 1.0, 18.0);
    taxi.rotation.set(0.4, 0.2, 1.4); // Rolled onto side
    this.environmentGroup.add(taxi);
    this.obstacleColliders.push(taxi);

    // 3. Crushed White Compact Car near Metropolis Tower at (-18, 0, -24)
    const compactCar = new THREE.Mesh(new THREE.BoxGeometry(3.6, 1.1, 1.8), matCarWhite);
    compactCar.position.set(-18, 0.55, -24);
    compactCar.rotation.set(0.15, -0.4, 0.1);
    this.environmentGroup.add(compactCar);
    this.obstacleColliders.push(compactCar);

    // 4. Abandoned Delivery Van at (-8, 0, -28)
    const van = new THREE.Mesh(new THREE.BoxGeometry(5.2, 2.0, 2.2), matPaleConcrete);
    van.position.set(-8, 1.0, -28);
    van.rotation.y = 0.22;
    this.environmentGroup.add(van);
    this.obstacleColliders.push(van);

    // E. 4 Fallen Concrete Utility Poles with Tangled Wires
    const fallenPoles = [
      { x: 3.5,  y: 0.35, z: 13.5, rotZ: Math.PI / 2 + 0.1, rotY: 0.4 },
      { x: -22,  y: 0.35, z: 16.5, rotZ: Math.PI / 2 + 0.15, rotY: -0.3 },
      { x: 8.0,  y: 0.35, z: -12.0,rotZ: Math.PI / 2 + 0.08, rotY: 0.25 },
      { x: -10,  y: 0.35, z: 34.0, rotZ: Math.PI / 2 + 0.12, rotY: -0.4 }
    ];
    fallenPoles.forEach(fp => {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 12, 8), matLightConcrete);
      pole.position.set(fp.x, fp.y, fp.z);
      pole.rotation.z = fp.rotZ;
      pole.rotation.y = fp.rotY;
      this.environmentGroup.add(pole);
      this.obstacleColliders.push(pole);

      // Transformer cylinder on pole
      const trans = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.1, 10), matSteelBeam);
      trans.position.set(fp.x + 3.5, fp.y + 0.2, fp.z + 1.2);
      this.environmentGroup.add(trans);
    });

    // -------------------------------------------------------------------------
    // 6. EXTENSIVE RUBBLE FIELD & SCATTERED MASONRY (DENSE DESTRUCTION)
    // -------------------------------------------------------------------------
    const rubbleClusters = [
      // Metropolis Towers Collapse Field
      { x: -24, z: -22, w: 4.8, h: 2.0, d: 3.8, mat: matDarkConcrete, rot: 0.25 },
      { x: -22, z: -27, w: 3.5, h: 1.6, d: 4.5, mat: matRubbleBeige, rot: -0.3 },
      { x: -36, z: -20, w: 5.5, h: 2.4, d: 4.0, mat: matRubbleTan, rot: 0.15 },
      { x: -34, z: -34, w: 4.2, h: 1.8, d: 4.2, mat: matDarkConcrete, rot: 0.4 },

      // Grand Plaza Mall Pancaked Debris Field
      { x: 23,  z: -20, w: 4.5, h: 1.6, d: 4.0, mat: matSlabConcrete, rot: 0.35 },
      { x: 38,  z: -14, w: 5.0, h: 2.0, d: 3.5, mat: matMidConcrete, rot: -0.2 },
      { x: 26,  z: -26, w: 5.5, h: 2.2, d: 4.2, mat: matRubbleTan, rot: 0.18 },
      { x: 42,  z: -24, w: 4.0, h: 1.5, d: 3.8, mat: matRubbleBeige, rot: -0.4 },

      // Townhouse Brick & Timber Debris
      { x: -38, z: -6,  w: 3.8, h: 1.4, d: 3.2, mat: matBrickRed, rot: 0.2 },
      { x: -46, z: -6,  w: 4.2, h: 1.8, d: 3.0, mat: matBrickBrown, rot: -0.15 },
      { x: -50, z: -16, w: 3.5, h: 1.5, d: 3.8, mat: matBrickRed, rot: 0.45 },

      // Leveled Warehouse Debris
      { x: 34,  z: -36, w: 4.5, h: 1.8, d: 3.8, mat: matRubbleBrown, rot: 0.3 },
      { x: 44,  z: -34, w: 4.0, h: 1.5, d: 4.2, mat: matSlabConcrete, rot: -0.25 },
      { x: 34,  z: -48, w: 4.8, h: 2.0, d: 3.5, mat: matMidConcrete, rot: 0.15 },

      // Fault Scarp Road Debris Blocks
      { x: -14, z: -14, w: 3.6, h: 0.9, d: 2.6, mat: matAsphalt, rot: 0.18 },
      { x: -3,  z: -15, w: 3.0, h: 0.8, d: 2.4, mat: matCrackedAsphalt, rot: -0.25 },
      { x: 5,   z: -13, w: 3.4, h: 0.9, d: 2.8, mat: matAsphalt, rot: 0.3 },
      { x: 14,  z: -14, w: 4.0, h: 1.0, d: 3.0, mat: matCrackedAsphalt, rot: -0.15 },

      // Boulevard Sidewalk Rubble Piles
      { x: -11.5, z: -26, w: 2.8, h: 1.2, d: 3.6, mat: matRubbleBeige, rot: 0.1 },
      { x: 11.5,  z: -24, w: 3.0, h: 1.3, d: 3.2, mat: matDarkConcrete, rot: -0.2 },
      { x: -11.5, z: 6,   w: 2.6, h: 1.0, d: 3.4, mat: matLightConcrete, rot: 0.3 },
      { x: 11.5,  z: 8,   w: 3.2, h: 1.1, d: 3.0, mat: matDarkConcrete, rot: -0.18 },
      { x: -11.5, z: 32,  w: 3.0, h: 1.2, d: 3.4, mat: matRubbleBeige, rot: 0.22 },
      { x: 11.5,  z: 34,  w: 3.4, h: 1.3, d: 3.2, mat: matDarkConcrete, rot: -0.3 }
    ];

    rubbleClusters.forEach(rc => {
      const chunk = new THREE.Mesh(new THREE.BoxGeometry(rc.w, rc.h, rc.d), rc.mat);
      chunk.position.set(rc.x, rc.h / 2 + 0.1, rc.z);
      chunk.rotation.set(0.15 * Math.sin(rc.rot), rc.rot, 0.12 * Math.cos(rc.rot));
      chunk.castShadow = true;
      this.environmentGroup.add(chunk);
      this.obstacleColliders.push(chunk);
    });

    // Exposed Twisted Steel Rebar Struts protruding from Rubble
    const rebarCoords = [
      { x: -23, z: -21, rot: 0.6 },
      { x: -35, z: -21, rot: -0.5 },
      { x: 25,  z: -19, rot: 0.4 },
      { x: 37,  z: -15, rot: -0.7 },
      { x: -13, z: -14, rot: 0.8 },
      { x: 6,   z: -13, rot: -0.6 },
      { x: -11, z: 7,   rot: 0.5 },
      { x: 11,  z: 9,   rot: -0.4 },
      { x: -23, z: 25,  rot: 0.7 },
      { x: 21,  z: 33,  rot: -0.5 }
    ];
    rebarCoords.forEach(rb => {
      const rebar = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 3.8, 6), matRebar);
      rebar.position.set(rb.x, 1.6, rb.z);
      rebar.rotation.set(rb.rot, rb.rot * 1.5, 0.3);
      this.environmentGroup.add(rebar);
    });

    // -------------------------------------------------------------------------
    // 7. ACTIVE EMERGENCY-RESPONSE ELEMENTS (RESPONDERS, VEHICLES, BARRICADES)
    // Conveys that this is an active modern disaster-response training simulation
    // -------------------------------------------------------------------------

    // A. NDRF Search & Rescue Command Vehicle / Ambulance at (0, 0, 56)
    const ndrfTruckGroup = new THREE.Group();
    ndrfTruckGroup.position.set(0, 0, 56);

    // Truck Body (Van/Box Ambulance)
    const truckBody = new THREE.Mesh(new THREE.BoxGeometry(6.5, 2.6, 2.6), matNdrfWhite);
    truckBody.position.set(0, 1.7, 0);
    ndrfTruckGroup.add(truckBody);
    this.obstacleColliders.push(truckBody);

    // Lower Navy Stripe
    const truckStripe = new THREE.Mesh(new THREE.BoxGeometry(6.52, 0.6, 2.62), matNdrfNavy);
    truckStripe.position.set(0, 1.1, 0);
    ndrfTruckGroup.add(truckStripe);

    // High-Vis Orange Reflective Chevrons on sides
    [-1.0, 1.0].forEach(sx => {
      const chevron = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.35, 2.64), matHazardOrange);
      chevron.position.set(sx, 1.8, 0);
      ndrfTruckGroup.add(chevron);
    });

    // Windshield & Cabin Glass
    const truckWindshield = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.0, 2.2), matGlassDark);
    truckWindshield.position.set(3.26, 2.0, 0);
    ndrfTruckGroup.add(truckWindshield);

    // Wheels
    [[-2.0, -1.35], [-2.0, 1.35], [2.0, -1.35], [2.0, 1.35]].forEach(([wx, wz]) => {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.35, 12), matCarTire);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(wx, 0.45, wz);
      ndrfTruckGroup.add(wheel);
    });

    // Roof Emergency Beacon Lightbar (Flashing Red/Blue in Day & Night!)
    const lightBar = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.22, 1.8), matNdrfNavy);
    lightBar.position.set(1.5, 3.1, 0);
    ndrfTruckGroup.add(lightBar);

    this.environmentGroup.add(ndrfTruckGroup);
    this.addEmergencyBeaconLight(new THREE.Vector3(1.5, 3.3, 56), true);

    // B. Rapid Response Rescue 4x4 Truck at (-16, 0, 48)
    const pickupGroup = new THREE.Group();
    pickupGroup.position.set(-16, 0, 48);
    pickupGroup.rotation.y = 0.3;

    const pickupCab = new THREE.Mesh(new THREE.BoxGeometry(4.8, 1.8, 2.2), matNdrfWhite);
    pickupCab.position.set(0, 1.2, 0);
    pickupGroup.add(pickupCab);
    this.obstacleColliders.push(pickupCab);

    const pickupBed = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.8, 2.1), matHazardOrange);
    pickupBed.position.set(-1.2, 1.2, 0);
    pickupGroup.add(pickupBed);

    [[-1.5, -1.15], [-1.5, 1.15], [1.5, -1.15], [1.5, 1.15]].forEach(([wx, wz]) => {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.3, 10), matCarTire);
      w.rotation.x = Math.PI / 2;
      w.position.set(wx, 0.4, wz);
      pickupGroup.add(w);
    });

    this.environmentGroup.add(pickupGroup);
    this.addEmergencyBeaconLight(new THREE.Vector3(-16, 2.4, 48), true);

    // C. 5 Stylized NDRF Emergency Responders
    const createResponder = (x, z, rotY) => {
      const respGroup = new THREE.Group();
      respGroup.position.set(x, 0, z);
      respGroup.rotation.y = rotY;

      // Navy tactical trousers
      const lLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.08, 0.82), matNdrfNavy);
      lLeg.position.set(-0.16, 0.41, 0);
      const rLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.08, 0.82), matNdrfNavy);
      rLeg.position.set(0.16, 0.41, 0);
      respGroup.add(lLeg);
      respGroup.add(rLeg);

      // High-vis orange tactical rescue jacket
      const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.24, 0.85, 10), matHazardOrange);
      torso.position.y = 0.85;
      torso.castShadow = true;
      respGroup.add(torso);
      this.obstacleColliders.push(torso);

      // Reflective silver stripes
      const sMat = new THREE.MeshBasicMaterial({ color: 0xf8fafc });
      const s1 = new THREE.Mesh(new THREE.CylinderGeometry(0.285, 0.28, 0.08, 10), sMat);
      s1.position.y = 1.0;
      respGroup.add(s1);
      const s2 = new THREE.Mesh(new THREE.CylinderGeometry(0.265, 0.26, 0.08, 10), sMat);
      s2.position.y = 0.68;
      respGroup.add(s2);

      // Arms
      const lArm = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.07, 0.65), matHazardOrange);
      lArm.position.set(-0.35, 0.85, 0.1);
      lArm.rotation.x = 0.3;
      const rArm = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.07, 0.65), matHazardOrange);
      rArm.position.set(0.35, 0.85, 0.15);
      rArm.rotation.x = 0.6;
      respGroup.add(lArm);
      respGroup.add(rArm);

      // Head & White Safety Helmet with Headlamp
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 12), new THREE.MeshStandardMaterial({ color: 0xfbbf24, roughness: 0.7 }));
      head.position.y = 1.45;
      respGroup.add(head);

      const helmetDome = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), matNdrfWhite);
      helmetDome.position.y = 1.53;
      respGroup.add(helmetDome);

      const helmetBrim = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.04, 14), matNdrfWhite);
      helmetBrim.position.y = 1.53;
      respGroup.add(helmetBrim);

      const headlamp = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.08), new THREE.MeshBasicMaterial({ color: 0xbae6fd }));
      headlamp.position.set(0, 1.56, 0.28);
      respGroup.add(headlamp);

      this.environmentGroup.add(respGroup);
      return respGroup;
    };

    // Place 5 NDRF Responders at Key Mission Points:
    createResponder(2.2, 53, -0.6);   // Incident commander near truck
    createResponder(-1.8, 52, 0.4);   // SAR squad member near staging area
    createResponder(-6.0, -8.0, 0.2); // Rescuer surveying the primary fault chasm
    createResponder(-18.0, -18.0, 0.8);// Structural engineer inspecting Metropolis Tower
    createResponder(-16.0, 17.0, -0.5);// Paramedic assisting walking wounded in Assembly Park

    // D. Temporary Chevron Warning Road Barricades (A-frame barricades)
    const createChevronBarrier = (x, z, rotY) => {
      const bGroup = new THREE.Group();
      bGroup.position.set(x, 0, z);
      bGroup.rotation.y = rotY;

      [-1.3, 1.3].forEach(lx => {
        const legA = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.2, 0.08), matNdrfWhite);
        legA.position.set(lx, 0.6, 0.25);
        legA.rotation.x = -0.3;
        bGroup.add(legA);

        const legB = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.2, 0.08), matNdrfWhite);
        legB.position.set(lx, 0.6, -0.25);
        legB.rotation.x = 0.3;
        bGroup.add(legB);
      });

      const board = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.36, 0.06), matNdrfWhite);
      board.position.set(0, 0.85, 0);
      bGroup.add(board);
      this.obstacleColliders.push(board);

      for (let s = -4; s <= 4; s++) {
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.38, 0.07), matHazardOrange);
        stripe.position.set(s * 0.32, 0.85, 0);
        stripe.rotation.z = 0.45;
        bGroup.add(stripe);
      }

      const flasher = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.16, 8), new THREE.MeshBasicMaterial({ color: 0xf59e0b }));
      flasher.position.set(0, 1.12, 0);
      bGroup.add(flasher);

      this.environmentGroup.add(bGroup);
    };

    // Barricades cordoning off the primary fault rupture and unstable zones
    createChevronBarrier(-6, -6, 0.1);
    createChevronBarrier(6, -6, -0.15);
    createChevronBarrier(-16, -18, 0.45);
    createChevronBarrier(16, 20, -0.25);

    // E. Orange Traffic Hazard Cones
    const createHazardCone = (x, z) => {
      const coneGroup = new THREE.Group();
      coneGroup.position.set(x, 0, z);

      const base = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.04, 0.48), matHazardOrange);
      base.position.y = 0.02;
      coneGroup.add(base);

      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.75, 10), matHazardOrange);
      cone.position.y = 0.39;
      coneGroup.add(cone);

      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.2, 10), matNdrfWhite);
      band.position.y = 0.38;
      coneGroup.add(band);

      this.environmentGroup.add(coneGroup);
      this.obstacleColliders.push(base);
    };

    const coneSpots = [
      [-4, -8], [4, -8], [-9, -8], [9, -8],
      [2, 22], [-2, 22], [7, 16], [-7, 16]
    ];
    coneSpots.forEach(([cx, cz]) => createHazardCone(cx, cz));

    // LED Hazard Strobe Pylons along fault edge
    this.addEmergencyBeaconLight(new THREE.Vector3(-10, 0.8, -10), true);
    this.addEmergencyBeaconLight(new THREE.Vector3(10, 0.8, -10), true);

    // -------------------------------------------------------------------------
    // 8. 12 VISIBLE EARTHQUAKE SURVIVORS (NDRF START TRIAGE PROTOCOL)
    // Distributed realistically across ground voids, sheared balconies & rubble
    // -------------------------------------------------------------------------

    // Survivor 1: Adult trapped in rubble void under tilted precast road slab (RED: Immediate)
    this.addSurvivor({
      id: 'SURV-EQ-01',
      name: 'Trapped Citizen in Void (Under Slab)',
      position: new THREE.Vector3(-6.5, 0.7, -6.0),
      posture: 'trapped',
      temperature: 37.2,
      triage: 'RED',
      clothingColor: 0xdc2626,
      vitals: 'HR: 116 bpm | Resp: 28/m | Crush Syndrome Risk | Pinned by Slab',
      gasExposure: 'Trace Methane (24 ppm)',
      detected: false
    });

    // Survivor 2: Resident waving distress cloth from 3rd-floor sheared balcony of tilted tower (YELLOW: Urgent)
    this.addSurvivor({
      id: 'SURV-EQ-02',
      name: 'Resident on Sheared Balcony (3rd Fl)',
      position: new THREE.Vector3(-25.5, 14.5, -17.8),
      posture: 'waving',
      temperature: 36.9,
      triage: 'YELLOW',
      clothingColor: 0xeab308,
      flagColor: 0xef4444,
      vitals: 'HR: 94 bpm | Left Arm Laceration | Stranded at Height',
      gasExposure: 'Clean Air',
      detected: false
    });

    // Survivor 3: Pinned victim in commercial mall pancake collapse (RED: Critical)
    this.addSurvivor({
      id: 'SURV-EQ-03',
      name: 'Pinned Survivor (Pancake Rubble)',
      position: new THREE.Vector3(30.0, 1.2, -18.0),
      posture: 'trapped',
      temperature: 37.1,
      triage: 'RED',
      clothingColor: 0x2563eb,
      vitals: 'HR: 128 bpm | Thoracic Compression | Shallow Breathing',
      gasExposure: 'Trace Dust',
      detected: false
    });

    // Survivor 4: Disoriented ambulatory citizen near buckled crossroads (GREEN: Minor)
    this.addSurvivor({
      id: 'SURV-EQ-04',
      name: 'Disoriented Citizen at Crossroads',
      position: new THREE.Vector3(-12.0, 0.6, 20.0),
      posture: 'standing',
      temperature: 36.6,
      triage: 'GREEN',
      clothingColor: 0x16a34a,
      vitals: 'Stable | Minor Abrasions | Ambulatory',
      gasExposure: 'Clean Air',
      detected: false
    });

    // Survivor 5: Stranded resident on 2nd-floor office fire escape platform (YELLOW: Urgent)
    this.addSurvivor({
      id: 'SURV-EQ-05',
      name: 'Stranded Resident (Fire Escape)',
      position: new THREE.Vector3(14.6, 6.4, 12.0),
      posture: 'waving',
      temperature: 36.8,
      triage: 'YELLOW',
      clothingColor: 0x9333ea,
      flagColor: 0xfacc15,
      vitals: 'HR: 88 bpm | Non-ambulatory | Staircase Obstructed',
      gasExposure: 'Clean Air',
      detected: false
    });

    // Survivor 6: Injured survivor sitting beside collapsed boundary wall (YELLOW: Urgent)
    this.addSurvivor({
      id: 'SURV-EQ-06',
      name: 'Injured Civilian beside Wall Rubble',
      position: new THREE.Vector3(13.0, 0.6, -10.5),
      posture: 'sitting',
      temperature: 36.7,
      triage: 'YELLOW',
      clothingColor: 0xea580c,
      vitals: 'HR: 92 bpm | Suspected Tibia Fracture | Conscious',
      gasExposure: 'Clean Air',
      detected: false
    });

    // Survivor 7: Elderly citizen trapped in exposed ground-floor bedroom (RED: Immediate)
    this.addSurvivor({
      id: 'SURV-EQ-07',
      name: 'Elderly Resident in Sheared Room',
      position: new THREE.Vector3(-43.0, 0.6, -11.0),
      posture: 'trapped',
      temperature: 37.3,
      triage: 'RED',
      clothingColor: 0x0284c7,
      vitals: 'HR: 110 bpm | Dehydrated | Wall Collapsed Inward',
      gasExposure: 'Clean Air',
      detected: false
    });

    // Survivor 8: Resident waving distress cloth from rooftop terrace of cracked duplex (YELLOW: Urgent)
    this.addSurvivor({
      id: 'SURV-EQ-08',
      name: 'Resident on Cracked Duplex Roof',
      position: new THREE.Vector3(-20.0, 11.2, -8.0),
      posture: 'waving',
      temperature: 36.9,
      triage: 'YELLOW',
      clothingColor: 0xf43f5e,
      flagColor: 0xffffff,
      vitals: 'HR: 86 bpm | Structural Integrity Failing | Evacuation Needed',
      gasExposure: 'Clean Air',
      detected: false
    });

    // Survivor 9: Child huddled in survival void under collapsed residential staircase (RED: Immediate)
    this.addSurvivor({
      id: 'SURV-EQ-09',
      name: 'Child in Staircase Void',
      position: new THREE.Vector3(-40.0, 0.55, 12.5),
      posture: 'trapped',
      temperature: 37.0,
      triage: 'RED',
      clothingColor: 0x38bdf8,
      vitals: 'HR: 122 bpm | Hypothermia Risk | Protected by Stair Stringer',
      gasExposure: 'Trace Dust',
      detected: false
    });

    // Survivor 10: Rescuer / civilian administering first aid in park clearing (GREEN: Minor)
    this.addSurvivor({
      id: 'SURV-EQ-10',
      name: 'Good Samaritan in Assembly Park',
      position: new THREE.Vector3(-15.5, 0.6, 17.5),
      posture: 'standing',
      temperature: 36.7,
      triage: 'GREEN',
      clothingColor: 0xf97316,
      vitals: 'Stable | Administering First Aid to Walking Wounded',
      gasExposure: 'Clean Air',
      detected: false
    });

    // Survivor 11: Trapped driver in partially crushed vehicle under fallen slab (RED: Immediate)
    this.addSurvivor({
      id: 'SURV-EQ-11',
      name: 'Trapped Driver in Crushed Vehicle',
      position: new THREE.Vector3(4.5, 0.55, 16.0),
      posture: 'trapped',
      temperature: 37.4,
      triage: 'RED',
      clothingColor: 0x475569,
      vitals: 'HR: 134 bpm | Vehicle Roof Deformed | Hydraulic Cutters Needed',
      gasExposure: 'Fuel Vapors Present',
      detected: false
    });

    // Survivor 12: Office worker signaling from 4th-floor corner breach of commercial bank (YELLOW: Urgent)
    this.addSurvivor({
      id: 'SURV-EQ-12',
      name: 'Office Worker (Bank 4th Floor)',
      position: new THREE.Vector3(31.6, 13.6, 15.5),
      posture: 'waving',
      temperature: 36.8,
      triage: 'YELLOW',
      clothingColor: 0x10b981,
      flagColor: 0xf59e0b,
      vitals: 'HR: 90 bpm | Internal Stairwell Smoked Out | Awaiting Aerial Extraction',
      gasExposure: 'Clean Air',
      detected: false
    });

    // -------------------------------------------------------------------------
    // 9. SUBTLE DUST PLUMES & GAS HAZARD
    // Light atmospheric debris around collapsed structures, maintaining high visibility
    // -------------------------------------------------------------------------
    this.addDustPlume({
      position: new THREE.Vector3(-28, 2.0, -26),
      radius: 12,
      height: 7,
      particleCount: 70,
      color: 0xd6cbbe,
      opacity: 0.24,
      riseSpeed: 0.40,
      driftX: 0.30
    });

    this.addDustPlume({
      position: new THREE.Vector3(30, 1.8, -20),
      radius: 14,
      height: 6,
      particleCount: 75,
      color: 0xc4b5a0,
      opacity: 0.22,
      riseSpeed: 0.35,
      driftX: 0.25
    });

    // -------------------------------------------------------------------------
    // 10. STRUCTURAL HAZARDS REGISTERED FOR SIMULATION OVERLAY
    // Tactical bounding boxes with exact required labels:
    // "STRUCTURAL COLLAPSE", "UNSTABLE BUILDING", "ROAD FRACTURE", "EARTHQUAKE ZONE"
    // -------------------------------------------------------------------------
    this.structuralHazards = [
      {
        id: 'HAZ-STRUCT-01',
        boxClass: 'structural',
        label: 'STRUCTURAL COLLAPSE',
        sublabel: 'Pancaked Mall | 5 Slabs 99.2%',
        position: new THREE.Vector3(30, 3.2, -22),
        minWidth: 70,
        minHeight: 46,
        scaleW: 1400,
        scaleH: 1000,
        triage: 'RED'
      },
      {
        id: 'HAZ-STRUCT-02',
        boxClass: 'unstable',
        label: 'UNSTABLE BUILDING',
        sublabel: 'Metropolis Tower | Tilt: 8.0°',
        position: new THREE.Vector3(-28, 14.0, -28),
        minWidth: 72,
        minHeight: 52,
        scaleW: 1500,
        scaleH: 1200,
        triage: 'RED'
      },
      {
        id: 'HAZ-STRUCT-03',
        boxClass: 'road_fracture',
        label: 'ROAD FRACTURE',
        sublabel: 'Fault Rupture Scarp 0.9m',
        position: new THREE.Vector3(0, 0.8, -12),
        minWidth: 75,
        minHeight: 42,
        scaleW: 1600,
        scaleH: 950,
        triage: 'RED'
      },
      {
        id: 'HAZ-STRUCT-04',
        boxClass: 'unstable',
        label: 'UNSTABLE BUILDING',
        sublabel: 'Apex Financial | Soft-Storey',
        position: new THREE.Vector3(25, 7.5, 10),
        minWidth: 70,
        minHeight: 48,
        scaleW: 1400,
        scaleH: 1050,
        triage: 'YELLOW'
      },
      {
        id: 'HAZ-STRUCT-05',
        boxClass: 'structural',
        label: 'STRUCTURAL COLLAPSE',
        sublabel: 'Sheared Townhouse | Cavity',
        position: new THREE.Vector3(-46, 4.5, -12),
        minWidth: 68,
        minHeight: 45,
        scaleW: 1350,
        scaleH: 950,
        triage: 'RED'
      },
      {
        id: 'HAZ-STRUCT-06',
        boxClass: 'structural',
        label: 'STRUCTURAL COLLAPSE',
        sublabel: 'Leveled Warehouse Ruin',
        position: new THREE.Vector3(44, 3.2, -42),
        minWidth: 68,
        minHeight: 44,
        scaleW: 1350,
        scaleH: 950,
        triage: 'RED'
      },
      {
        id: 'HAZ-STRUCT-07',
        boxClass: 'zone',
        label: 'EARTHQUAKE ZONE',
        sublabel: 'SAR Sector Alpha-4 | Staging',
        position: new THREE.Vector3(0, 2.0, 52),
        minWidth: 75,
        minHeight: 40,
        scaleW: 1400,
        scaleH: 900,
        triage: 'GREEN'
      }
    ];
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
    // -------------------------------------------------------------------------
    // 1. PALETTES & REALISTIC INDUSTRIAL DISASTER MATERIALS
    // -------------------------------------------------------------------------
    const steelMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.88, roughness: 0.28 });
    const steelDark = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.90, roughness: 0.25 });
    const steelGalv = new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.82, roughness: 0.35 });
    const safetyYellow = new THREE.MeshStandardMaterial({ color: 0xeab308, metalness: 0.5, roughness: 0.35 });
    const safetyOrange = new THREE.MeshStandardMaterial({ color: 0xea580c, metalness: 0.4, roughness: 0.4 });
    const rustMat = new THREE.MeshStandardMaterial({ color: 0x9a3412, metalness: 0.6, roughness: 0.75 });
    const scorchedMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.95 });

    // Machinery & Equipment
    const machineryMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.85, roughness: 0.22 });
    const machineGreen = new THREE.MeshStandardMaterial({ color: 0x166534, metalness: 0.72, roughness: 0.35 });
    const machineBlue = new THREE.MeshStandardMaterial({ color: 0x1d4ed8, metalness: 0.78, roughness: 0.3 });
    const castIron = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.92, roughness: 0.4 });

    // Industrial Pipelines (Color coded by fluid type)
    const pipeYellowGas = new THREE.MeshStandardMaterial({ color: 0xeab308, metalness: 0.65, roughness: 0.25 });
    const pipeRedFire = new THREE.MeshStandardMaterial({ color: 0xdc2626, metalness: 0.7, roughness: 0.25 });
    const pipeSilverSteam = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.85, roughness: 0.2 });
    const pipeBlueWater = new THREE.MeshStandardMaterial({ color: 0x0284c7, metalness: 0.65, roughness: 0.3 });

    // Tanks & Vessels
    const tankSilverMat = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.85, roughness: 0.25 });
    const tankWhiteMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.45, metalness: 0.2 });

    // Structural Buildings & Siding
    const corrugatedBlue = new THREE.MeshStandardMaterial({ color: 0x1e3a8a, metalness: 0.55, roughness: 0.42 });
    const corrugatedGrey = new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.62, roughness: 0.45 });
    const darkFactory = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.85 });
    const concreteYard = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.88 });
    const concreteWall = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.82 });
    const lightConcrete = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.8 });
    const matWallWhite = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.72 });
    const matGlassDark = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.15, metalness: 0.85 });

    // -------------------------------------------------------------------------
    // 2. MAIN PRODUCTION & CHEMICAL PROCESSING HALL WITH OPEN VISIBLE INTERIOR
    // Massive multi-bay facility (44m wide x 32m deep x 14m high) at (0, 0, -26)
    // Front wall has a 20m blast breach and cutaway roof trusses for UAV sightlines!
    // -------------------------------------------------------------------------
    const factoryGroup = new THREE.Group();
    factoryGroup.position.set(0, 0, -26);

    // Factory Reinforced Concrete Floor Slab
    const fFloor = new THREE.Mesh(new THREE.BoxGeometry(44, 0.4, 32), concreteYard);
    fFloor.position.y = 0.2;
    fFloor.receiveShadow = true;
    factoryGroup.add(fFloor);
    this.obstacleColliders.push(fFloor);

    // Yellow/Black Safety Walkway Borders on Floor
    [-10, 10].forEach(wx => {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 30), safetyYellow);
      stripe.position.set(wx, 0.42, 0);
      factoryGroup.add(stripe);
    });

    // Solid Back Wall with Industrial Blue Siding
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(44, 14, 1.2), corrugatedBlue);
    backWall.position.set(0, 7.0, -16);
    backWall.castShadow = true;
    factoryGroup.add(backWall);
    this.obstacleColliders.push(backWall);

    // West Side Wall with Window Apertures
    const westWall = new THREE.Mesh(new THREE.BoxGeometry(1.2, 14, 32), corrugatedGrey);
    westWall.position.set(-22, 7.0, 0);
    westWall.castShadow = true;
    factoryGroup.add(westWall);
    this.obstacleColliders.push(westWall);

    // East Side Wall
    const eastWall = new THREE.Mesh(new THREE.BoxGeometry(1.2, 14, 32), corrugatedGrey);
    eastWall.position.set(22, 7.0, 0);
    eastWall.castShadow = true;
    factoryGroup.add(eastWall);
    this.obstacleColliders.push(eastWall);

    // FRONT BREACHED WALL (Huge 20-meter opening caused by explosion blast!)
    // Left remaining wall wing
    const fWallLeft = new THREE.Mesh(new THREE.BoxGeometry(11, 14, 1.2), corrugatedBlue);
    fWallLeft.position.set(-16.5, 7.0, 16);
    fWallLeft.castShadow = true;
    factoryGroup.add(fWallLeft);
    this.obstacleColliders.push(fWallLeft);

    // Right remaining wall wing
    const fWallRight = new THREE.Mesh(new THREE.BoxGeometry(11, 14, 1.2), corrugatedBlue);
    fWallRight.position.set(16.5, 7.0, 16);
    fWallRight.castShadow = true;
    factoryGroup.add(fWallRight);
    this.obstacleColliders.push(fWallRight);

    // Blast crater scorch marks on front floor breach
    const scorchDecal = new THREE.Mesh(new THREE.CircleGeometry(7.5, 20), scorchedMat);
    scorchDecal.rotation.x = -Math.PI / 2;
    scorchDecal.position.set(-2, 0.42, 14);
    factoryGroup.add(scorchDecal);

    // ROOF STRUCTURE: Cutaway Bays with Collapsed Steel Portal Trusses
    // Intact rear roof bay
    const roofBack = new THREE.Mesh(new THREE.BoxGeometry(44, 0.7, 12), darkFactory);
    roofBack.position.set(0, 14, -10);
    factoryGroup.add(roofBack);
    this.obstacleColliders.push(roofBack);

    // Bent & Twisted steel trusses hanging into the open production hall
    for (let t = -16; t <= 16; t += 8) {
      const truss = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.2, 20), steelDark);
      truss.position.set(t, 13.8, 2);
      factoryGroup.add(truss);

      // Hanging collapsed segment angled downward
      const danglingTruss = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.9, 10), steelDark);
      danglingTruss.position.set(t, 10.5, 7);
      danglingTruss.rotation.x = 0.65;
      factoryGroup.add(danglingTruss);
      this.obstacleColliders.push(danglingTruss);
    }

    // Overhead Yellow Industrial Gantry Crane Rail traversing under ceiling
    const craneBeam = new THREE.Mesh(new THREE.BoxGeometry(43, 0.8, 1.2), safetyYellow);
    craneBeam.position.set(0, 12.2, -4);
    factoryGroup.add(craneBeam);
    this.obstacleColliders.push(craneBeam);

    const craneTrolley = new THREE.Mesh(new THREE.BoxGeometry(3.5, 1.4, 2.2), safetyYellow);
    craneTrolley.position.set(-4, 11.6, -4);
    factoryGroup.add(craneTrolley);

    // -------------------------------------------------------------------------
    // FACTORY INTERIOR EQUIPMENT & MACHINERY (Fully visible from UAV camera!)
    // -------------------------------------------------------------------------

    // 1. Massive Industrial Horizontal Steam Boiler (Central Machine)
    const boilerGroup = new THREE.Group();
    boilerGroup.position.set(-8, 3.2, -4);

    const boilerShell = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 9.0, 24), machineryMat);
    boilerShell.rotation.z = Math.PI / 2;
    boilerShell.castShadow = true;
    boilerGroup.add(boilerShell);
    this.obstacleColliders.push(boilerShell);

    // Concrete boiler saddles / cradles
    [-3.2, 3.2].forEach(bx => {
      const saddle = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.2, 5.6), concreteWall);
      saddle.position.set(bx, -1.8, 0);
      boilerGroup.add(saddle);
      this.obstacleColliders.push(saddle);
    });

    // Burner front manifold
    const burner = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.4, 1.8, 16), castIron);
    burner.rotation.z = Math.PI / 2;
    burner.position.set(4.8, 0, 0);
    boilerGroup.add(burner);

    // Boiler top steam dome & piping
    const steamDome = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 1.4, 12), pipeSilverSteam);
    steamDome.position.set(0, 2.8, 0);
    boilerGroup.add(steamDome);
    factoryGroup.add(boilerGroup);

    // 2. Vertical Chemical Reaction Column (Rising through roof cutaway)
    const columnMesh = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 18, 20), machineGreen);
    columnMesh.position.set(12, 9, -8);
    columnMesh.castShadow = true;
    factoryGroup.add(columnMesh);
    this.obstacleColliders.push(columnMesh);

    // Flange rings on distillation column
    for (let fl = 2; fl <= 16; fl += 3.5) {
      const flange = new THREE.Mesh(new THREE.CylinderGeometry(1.85, 1.85, 0.25, 16), steelGalv);
      flange.position.set(12, fl, -8);
      factoryGroup.add(flange);
    }

    // 3. Elevated Mezzanine Catwalk & Maintenance Walkway with Steel Stairs
    const catwalkGroup = new THREE.Group();
    catwalkGroup.position.set(4, 6.5, -10);

    const catDeck = new THREE.Mesh(new THREE.BoxGeometry(26, 0.35, 3.5), steelGalv);
    catDeck.receiveShadow = true;
    catwalkGroup.add(catDeck);
    this.obstacleColliders.push(catDeck);

    // Yellow Safety Railings along Catwalk
    const railFront = new THREE.Mesh(new THREE.BoxGeometry(26, 0.9, 0.1), safetyYellow);
    railFront.position.set(0, 0.6, 1.7);
    catwalkGroup.add(railFront);

    const railBack = new THREE.Mesh(new THREE.BoxGeometry(26, 0.9, 0.1), safetyYellow);
    railBack.position.set(0, 0.6, -1.7);
    catwalkGroup.add(railBack);

    // Catwalk support pillars
    [-10, 0, 10].forEach(cx => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 6.5, 8), steelDark);
      leg.position.set(cx, -3.25, 1.5);
      catwalkGroup.add(leg);
      this.obstacleColliders.push(leg);
    });

    // Catwalk staircase (partially buckled)
    const stairLen = Math.hypot(6.5, 4.5);
    const stairs = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.25, stairLen), steelGalv);
    stairs.position.set(-13, -3.25, 0);
    stairs.rotation.x = Math.atan2(4.5, 6.5);
    catwalkGroup.add(stairs);
    this.obstacleColliders.push(stairs);

    factoryGroup.add(catwalkGroup);

    // 4. Motor Control Center (MCC) & Electrical Switchgear Cabinets
    const mccBank = new THREE.Mesh(new THREE.BoxGeometry(9.0, 2.8, 1.6), darkFactory);
    mccBank.position.set(11, 1.4, 4);
    factoryGroup.add(mccBank);
    this.obstacleColliders.push(mccBank);

    // Fallen cable tray fallen on floor across switchgear
    const fallenTray = new THREE.Mesh(new THREE.BoxGeometry(8.5, 0.2, 1.4), steelGalv);
    fallenTray.position.set(10.5, 0.7, 4.5);
    fallenTray.rotation.set(0.25, 0.2, -0.3);
    factoryGroup.add(fallenTray);
    this.obstacleColliders.push(fallenTray);

    // 5. Shift Supervisor Control Room (Open Cutaway Mezzanine Office)
    // Modeled with open roof, shattered observation window, and terminal consoles for UAV sightlines
    const ctrlRoom = new THREE.Group();
    ctrlRoom.position.set(-15, 6.5, -10);

    // Office floor slab
    const ctrlFloor = new THREE.Mesh(new THREE.BoxGeometry(8.0, 0.35, 6.0), lightConcrete);
    ctrlFloor.position.y = 0.18;
    ctrlRoom.add(ctrlFloor);
    this.obstacleColliders.push(ctrlFloor);

    // Back & side enclosure walls
    const ctrlBack = new THREE.Mesh(new THREE.BoxGeometry(8.0, 3.8, 0.25), matWallWhite);
    ctrlBack.position.set(0, 1.9, -2.9);
    ctrlRoom.add(ctrlBack);
    this.obstacleColliders.push(ctrlBack);

    const ctrlWest = new THREE.Mesh(new THREE.BoxGeometry(0.25, 3.8, 6.0), matWallWhite);
    ctrlWest.position.set(-3.9, 1.9, 0);
    ctrlRoom.add(ctrlWest);

    // Front observation wall: lower half-wall with shattered window apertures
    const ctrlFrontHalf = new THREE.Mesh(new THREE.BoxGeometry(8.0, 1.1, 0.25), matWallWhite);
    ctrlFrontHalf.position.set(0, 0.55, 2.9);
    ctrlRoom.add(ctrlFrontHalf);

    // Window frame posts
    [-2.6, 0, 2.6].forEach(wx => {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.15, 2.4, 0.25), steelDark);
      post.position.set(wx, 2.3, 2.9);
      ctrlRoom.add(post);
    });

    // Control room desk console
    const desk = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.85, 1.2), steelDark);
    desk.position.set(0, 0.6, 1.2);
    ctrlRoom.add(desk);

    // Glowing terminal monitors
    [-1.2, 0, 1.2].forEach(tx => {
      const mon = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.55, 0.08), new THREE.MeshBasicMaterial({ color: 0x00f0ff }));
      mon.position.set(tx, 1.35, 1.2);
      ctrlRoom.add(mon);
    });

    factoryGroup.add(ctrlRoom);

    // 6. Blocked West Emergency Fire Exit (Sheltering Survivor SURV-GAS-12)
    const fireExitGroup = new THREE.Group();
    fireExitGroup.position.set(-21.4, 0, -9);

    const exitDoorFrame = new THREE.Mesh(new THREE.BoxGeometry(0.35, 3.6, 2.4), steelDark);
    exitDoorFrame.position.set(0, 1.8, 0);
    fireExitGroup.add(exitDoorFrame);

    // Fallen concrete beam/lintel blocking door
    const exitBlocker = new THREE.Mesh(new THREE.BoxGeometry(0.7, 2.6, 1.6), concreteWall);
    exitBlocker.position.set(0.6, 1.3, 0.2);
    exitBlocker.rotation.set(0.35, 0.1, 0.2);
    fireExitGroup.add(exitBlocker);
    this.obstacleColliders.push(exitBlocker);

    // Illuminated Emergency EXIT Sign above door
    const exitSign = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.45, 0.9), new THREE.MeshBasicMaterial({ color: 0xef4444 }));
    exitSign.position.set(0.2, 3.7, 0);
    fireExitGroup.add(exitSign);

    factoryGroup.add(fireExitGroup);

    // 7. Pumps, Compressors & Floor Debris
    [-2, 6].forEach(px => {
      const pump = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.6, 1.8), machineBlue);
      pump.position.set(px, 0.8, -12);
      factoryGroup.add(pump);
      this.obstacleColliders.push(pump);
    });

    // Scattered structural metal debris on factory floor (placed safely away from victims)
    const factoryDebrisCoords = [
      { x: -14, z: 2 }, { x: -8, z: 8 }, { x: 4, z: 10 }, { x: 14, z: 10 },
      { x: -18, z: 6 }, { x: 18, z: -2 }, { x: -12, z: -6 }, { x: 14, z: -8 }
    ];
    factoryDebrisCoords.forEach(c => {
      const debris = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.45, 1.6), steelGalv);
      debris.position.set(c.x, 0.4, c.z);
      debris.rotation.set(0.2, 0.4, 0.15);
      factoryGroup.add(debris);
      this.obstacleColliders.push(debris);
    });

    this.environmentGroup.add(factoryGroup);

    // -------------------------------------------------------------------------
    // 3. EXTERIOR CHEMICAL STORAGE TANK FARM (SPHERES, SILOS & BUND WALL)
    // Located West (X: -52 to -18, Z: -8 to +42)
    // -------------------------------------------------------------------------

    // A. Concrete Containment Bund Dike Wall (enclosing tank farm)
    const bundWallMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.85 });
    // North wall
    const bWallN = new THREE.Mesh(new THREE.BoxGeometry(36, 1.2, 0.6), bundWallMat);
    bWallN.position.set(-36, 0.6, -8);
    this.environmentGroup.add(bWallN);
    this.obstacleColliders.push(bWallN);

    // South wall
    const bWallS = new THREE.Mesh(new THREE.BoxGeometry(36, 1.2, 0.6), bundWallMat);
    bWallS.position.set(-36, 0.6, 42);
    this.environmentGroup.add(bWallS);
    this.obstacleColliders.push(bWallS);

    // West wall
    const bWallW = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.2, 50), bundWallMat);
    bWallW.position.set(-54, 0.6, 17);
    this.environmentGroup.add(bWallW);
    this.obstacleColliders.push(bWallW);

    // B. Pressurized Horton Spherical Chemical Vessel (Ammonia / LPG)
    // Ruptured sphere with explosion crater at (-38, 0, 8)
    const sphereGroup = new THREE.Group();
    sphereGroup.position.set(-38, 0, 8);

    // 8 Tubular Steel Support Columns
    for (let c = 0; c < 8; c++) {
      const ang = (c / 8) * Math.PI * 2;
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.28, 6.2, 8), steelGalv);
      leg.position.set(Math.cos(ang) * 4.8, 3.1, Math.sin(ang) * 4.8);
      sphereGroup.add(leg);
      this.obstacleColliders.push(leg);
    }

    // 12-Meter Diameter Spherical Pressure Tank
    const chemSphere = new THREE.Mesh(new THREE.SphereGeometry(6.2, 28, 24), tankWhiteMat);
    chemSphere.position.y = 8.5;
    chemSphere.castShadow = true;
    sphereGroup.add(chemSphere);
    this.obstacleColliders.push(chemSphere);

    // Scorch blast mark on south face of sphere
    const sphereBurn = new THREE.Mesh(new THREE.SphereGeometry(6.25, 16, 16, 0, Math.PI * 0.8, Math.PI * 0.3, Math.PI * 0.5), scorchedMat);
    sphereBurn.position.y = 8.5;
    sphereGroup.add(sphereBurn);

    // Top safety relief valve & vent stack
    const topRelief = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 3.5, 8), pipeRedFire);
    topRelief.position.set(0, 15.8, 0);
    sphereGroup.add(topRelief);

    this.environmentGroup.add(sphereGroup);

    // C. 3 Cylindrical Chemical Fractionating Silos / Towers
    const siloConfigs = [
      { x: -44, z: 26, h: 22, d: 4.8, mat: tankSilverMat },
      { x: -32, z: 28, h: 26, d: 5.2, mat: tankSilverMat },
      { x: -24, z: 32, h: 18, d: 4.2, mat: rustMat }
    ];
    siloConfigs.forEach(sc => {
      const silo = new THREE.Mesh(new THREE.CylinderGeometry(sc.d / 2, sc.d / 2, sc.h, 24), sc.mat);
      silo.position.set(sc.x, sc.h / 2, sc.z);
      silo.castShadow = true;
      this.environmentGroup.add(silo);
      this.obstacleColliders.push(silo);

      // Elevated spiral ladder cage around silo
      const cage = new THREE.Mesh(
        new THREE.CylinderGeometry(sc.d / 2 + 0.45, sc.d / 2 + 0.45, sc.h, 12, 1, true),
        new THREE.MeshBasicMaterial({ color: 0x64748b, wireframe: true })
      );
      cage.position.set(sc.x, sc.h / 2, sc.z);
      this.environmentGroup.add(cage);

      // Intermediate maintenance platform on Silo 2 (Sheltering Survivor SURV-GAS-03)
      if (sc.x === -32) {
        const plat = new THREE.Mesh(new THREE.CylinderGeometry(sc.d / 2 + 0.85, sc.d / 2 + 0.85, 0.25, 18), steelGalv);
        plat.position.set(sc.x, 12.5, sc.z);
        this.environmentGroup.add(plat);
        this.obstacleColliders.push(plat);

        const platRail = new THREE.Mesh(new THREE.CylinderGeometry(sc.d / 2 + 0.85, sc.d / 2 + 0.85, 0.9, 18, 1, true), new THREE.MeshBasicMaterial({ color: 0xeab308, wireframe: true }));
        platRail.position.set(sc.x, 12.95, sc.z);
        this.environmentGroup.add(platRail);
      }

      // Top maintenance dome & railing
      const dome = new THREE.Mesh(new THREE.SphereGeometry(sc.d / 2, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), sc.mat);
      dome.position.set(sc.x, sc.h, sc.z);
      this.environmentGroup.add(dome);
    });

    // D. 2 Horizontal Cylindrical Bullet Pressure Vessels
    [-2, 18].forEach((bz, idx) => {
      const bulletGroup = new THREE.Group();
      bulletGroup.position.set(-24, 2.2, bz);

      const bullet = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 8.5, 20), tankWhiteMat);
      bullet.rotation.z = Math.PI / 2;
      bullet.castShadow = true;
      bulletGroup.add(bullet);
      this.obstacleColliders.push(bullet);

      // Hemispherical end caps
      const capL = new THREE.Mesh(new THREE.SphereGeometry(1.6, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), tankWhiteMat);
      capL.rotation.z = -Math.PI / 2;
      capL.position.set(-4.25, 0, 0);
      bulletGroup.add(capL);

      const capR = new THREE.Mesh(new THREE.SphereGeometry(1.6, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), tankWhiteMat);
      capR.rotation.z = Math.PI / 2;
      capR.position.set(4.25, 0, 0);
      bulletGroup.add(capR);

      // Concrete mounting pedestals
      [-2.5, 2.5].forEach(px => {
        const ped = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.4, 3.6), concreteWall);
        ped.position.set(px, -1.4, 0);
        bulletGroup.add(ped);
        this.obstacleColliders.push(ped);
      });

      this.environmentGroup.add(bulletGroup);
    });

    // E. Ruptured Ammonia Transfer Manifold & Ruptured Flange (-26, 2.2, 10)
    // Primary leak source issuing dense pale yellowish-green toxic plume (HAZ-GAS-AMMONIA)
    const manifoldGroup = new THREE.Group();
    manifoldGroup.position.set(-26, 0, 10);

    const maniBase = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.4, 1.8), machineryMat);
    maniBase.position.y = 0.7;
    manifoldGroup.add(maniBase);
    this.obstacleColliders.push(maniBase);

    // Ruptured pipe flange with sheared bolts
    const rupFlange = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.8, 12), pipeYellowGas);
    rupFlange.position.set(0, 1.8, 0);
    rupFlange.rotation.z = Math.PI / 4;
    manifoldGroup.add(rupFlange);

    // Dial pressure gauge
    const pGauge = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.1, 10), new THREE.MeshBasicMaterial({ color: 0xf1f5f9 }));
    pGauge.position.set(-0.5, 1.7, 0);
    pGauge.rotation.x = Math.PI / 2;
    manifoldGroup.add(pGauge);

    this.environmentGroup.add(manifoldGroup);

    // -------------------------------------------------------------------------
    // 4. OVERHEAD INDUSTRIAL PIPE BRIDGES & RACKS
    // Spanning from Tank Farm to Main Production Hall & Loading Dock
    // -------------------------------------------------------------------------
    const pipeRackGroup = new THREE.Group();

    // Steel portal frames supporting East-West pipe rack at 6m elevation
    [-28, -18, -8, 2, 12].forEach(fx => {
      const colL = new THREE.Mesh(new THREE.BoxGeometry(0.35, 6.5, 0.35), steelDark);
      colL.position.set(fx, 3.25, 12);
      pipeRackGroup.add(colL);
      this.obstacleColliders.push(colL);

      const colR = new THREE.Mesh(new THREE.BoxGeometry(0.35, 6.5, 0.35), steelDark);
      colR.position.set(fx, 3.25, 16);
      pipeRackGroup.add(colR);
      this.obstacleColliders.push(colR);

      const xBeam = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.35, 4.4), steelDark);
      xBeam.position.set(fx, 6.2, 14);
      pipeRackGroup.add(xBeam);
      this.obstacleColliders.push(xBeam);
    });

    // 4-Tier East-West Pipeline Run (Yellow Gas, Red Fire, Silver Steam, Blue Water)
    const pipeMats = [pipeYellowGas, pipeRedFire, pipeSilverSteam, pipeBlueWater];
    pipeMats.forEach((pMat, pIdx) => {
      const pY = 5.8 + (pIdx % 2) * 0.7;
      const pZ = 12.8 + Math.floor(pIdx / 2) * 1.6;
      const pipeRun = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 46, 12), pMat);
      pipeRun.rotation.z = Math.PI / 2;
      pipeRun.position.set(-8, pY, pZ);
      pipeRackGroup.add(pipeRun);
      this.obstacleColliders.push(pipeRun);
    });

    // North-South connecting bridge from Tank Farm (Z: 14) to Factory Hall (Z: -10) along X: -10
    [6, -2].forEach(fz => {
      const colB = new THREE.Mesh(new THREE.BoxGeometry(0.35, 6.5, 0.35), steelDark);
      colB.position.set(-10, 3.25, fz);
      pipeRackGroup.add(colB);
      this.obstacleColliders.push(colB);
    });

    // Connecting high-pressure gas pipe run along North-South bridge
    const nsPipe = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 14, 12), pipeYellowGas);
    nsPipe.position.set(-10, 6.2, 4);
    pipeRackGroup.add(nsPipe);
    this.obstacleColliders.push(nsPipe);

    // Severed & Dangling Pipeline Rupture Section at (-10, 6.2, -6)
    // Secondary leak source issuing pressurized high-velocity white gas jet (HAZ-GAS-PIPE-JET)
    const severedPipe = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 3.5, 12), pipeYellowGas);
    severedPipe.position.set(-10, 5.2, -6);
    severedPipe.rotation.set(0.45, 0.2, 0.6);
    pipeRackGroup.add(severedPipe);
    this.obstacleColliders.push(severedPipe);

    this.environmentGroup.add(pipeRackGroup);

    // -------------------------------------------------------------------------
    // 5. CHEMICAL LOADING DOCK & TRUCK TRANSFER BAY (EAST, X: 18 to 48, Z: -5 to +35)
    // -------------------------------------------------------------------------
    const loadingGroup = new THREE.Group();
    loadingGroup.position.set(30, 0, 14);

    // Elevated Concrete Loading Platform
    const dockPlatform = new THREE.Mesh(new THREE.BoxGeometry(16, 1.2, 22), concreteYard);
    dockPlatform.position.y = 0.6;
    dockPlatform.receiveShadow = true;
    loadingGroup.add(dockPlatform);
    this.obstacleColliders.push(dockPlatform);

    // Yellow/Black Hazard Border along Dock Edge
    const hazardEdge = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.1, 22), safetyYellow);
    hazardEdge.position.set(-8.0, 1.22, 0);
    loadingGroup.add(hazardEdge);

    // Corrugated Overhead Loading Canopy
    const dockRoof = new THREE.Mesh(new THREE.BoxGeometry(18, 0.4, 24), corrugatedBlue);
    dockRoof.position.set(0, 6.2, 0);
    loadingGroup.add(dockRoof);
    this.obstacleColliders.push(dockRoof);

    // Canopy steel pillars
    [-8, 8].forEach(px => {
      [ -10, 10 ].forEach(pz => {
        const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.35, 5.6, 0.35), steelDark);
        pillar.position.set(px, 3.4, pz);
        loadingGroup.add(pillar);
        this.obstacleColliders.push(pillar);
      });
    });

    // Parked Chemical Tanker Truck (Cab + Cylindrical Trailer Tank)
    const truckGroup = new THREE.Group();
    truckGroup.position.set(-12, 0, 2);

    // Truck Cab
    const cab = new THREE.Mesh(new THREE.BoxGeometry(3.0, 2.8, 3.2), safetyOrange);
    cab.position.set(0, 1.8, 6.5);
    truckGroup.add(cab);
    this.obstacleColliders.push(cab);

    // Tanker Trailer Tank (Cylinder in Silver)
    const trailerTank = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 10, 20), tankSilverMat);
    trailerTank.rotation.x = Math.PI / 2;
    trailerTank.position.set(0, 2.4, -1.0);
    trailerTank.castShadow = true;
    truckGroup.add(trailerTank);
    this.obstacleColliders.push(trailerTank);

    loadingGroup.add(truckGroup);

    // Stacks of 200L Chemical Storage Drums on Wooden Pallets
    const drumMatBlue = new THREE.MeshStandardMaterial({ color: 0x0284c7, metalness: 0.5, roughness: 0.35 });
    const drumMatYellow = new THREE.MeshStandardMaterial({ color: 0xeab308, metalness: 0.5, roughness: 0.35 });
    const drumCoords = [
      { x: 3, z: -6, mat: drumMatBlue },
      { x: 5, z: -6, mat: drumMatBlue },
      { x: 3, z: -4, mat: drumMatYellow },
      { x: 4, z: 6, mat: drumMatYellow },
      { x: 6, z: 6, mat: drumMatBlue }
    ];
    drumCoords.forEach(dc => {
      const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.2, 14), dc.mat);
      drum.position.set(dc.x, 1.8, dc.z);
      loadingGroup.add(drum);
      this.obstacleColliders.push(drum);
    });

    this.environmentGroup.add(loadingGroup);

    // -------------------------------------------------------------------------
    // 6. ELECTRICAL SUBSTATION & TRANSFORMER YARD (SOUTHEAST, X: 20 to 45, Z: -42 to -18)
    // -------------------------------------------------------------------------
    const subGroup = new THREE.Group();
    subGroup.position.set(30, 0, -30);

    // 2 Step-Down Transformers with Radiator Fins
    [-4, 4].forEach((tx, idx) => {
      const transBody = new THREE.Mesh(new THREE.BoxGeometry(3.6, 3.2, 2.8), machineryMat);
      transBody.position.set(tx, 1.6, 0);
      transBody.castShadow = true;
      subGroup.add(transBody);
      this.obstacleColliders.push(transBody);

      // Ceramic high-voltage insulators on top
      for (let ins = -1.0; ins <= 1.0; ins += 1.0) {
        const insulator = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 1.2, 8), new THREE.MeshStandardMaterial({ color: 0x78350f }));
        insulator.position.set(tx + ins, 3.8, 0);
        subGroup.add(insulator);
      }

      // Fire scorch marks on transformer #1
      if (idx === 0) {
        const tScorch = new THREE.Mesh(new THREE.BoxGeometry(3.65, 2.0, 2.85), scorchedMat);
        tScorch.position.set(tx, 1.4, 0);
        subGroup.add(tScorch);
      }
    });

    // Substation Perimeter Security Fence (Wireframe boundary)
    const fenceMat = new THREE.MeshBasicMaterial({ color: 0x94a3b8, wireframe: true });
    const subFence = new THREE.Mesh(new THREE.BoxGeometry(18, 2.8, 16), fenceMat);
    subFence.position.y = 1.4;
    subGroup.add(subFence);
    this.obstacleColliders.push(subFence);

    this.environmentGroup.add(subGroup);

    // -------------------------------------------------------------------------
    // 7. INDUSTRIAL CHIMNEYS & EXHAUST STACKS
    // -------------------------------------------------------------------------
    // 30m Tall Concrete Emissions Stack with Red/White Aviation Warning Bands
    const chimneyGroup = new THREE.Group();
    chimneyGroup.position.set(34, 0, -38);

    const chimneyStack = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.8, 30, 24), concreteWall);
    chimneyStack.position.y = 15;
    chimneyStack.castShadow = true;
    chimneyGroup.add(chimneyStack);
    this.obstacleColliders.push(chimneyStack);

    // Aviation Red Warning Stripes near apex
    [24, 27].forEach(sy => {
      const redBand = new THREE.Mesh(new THREE.CylinderGeometry(1.75, 1.85, 1.4, 24), pipeRedFire);
      redBand.position.y = sy;
      chimneyGroup.add(redBand);
    });

    this.environmentGroup.add(chimneyGroup);

    // -------------------------------------------------------------------------
    // 8. SECURITY GATEHOUSE, ENTRANCE BARRIER & MUSTER POINT (SOUTH)
    // -------------------------------------------------------------------------
    const gateGroup = new THREE.Group();
    gateGroup.position.set(24, 0, 38);

    const guardhouse = new THREE.Mesh(new THREE.BoxGeometry(4.8, 3.2, 4.0), matWallWhite);
    guardhouse.position.y = 1.6;
    gateGroup.add(guardhouse);
    this.obstacleColliders.push(guardhouse);

    // Red/White Barrier Arm across road
    const barrier = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 6.0), pipeRedFire);
    barrier.rotation.z = Math.PI / 2;
    barrier.position.set(-4.0, 1.0, 0);
    gateGroup.add(barrier);

    // Emergency Assembly Muster Point Signboard
    const musterSign = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.4, 0.1), machineGreen);
    musterSign.position.set(4.0, 2.2, 0);
    gateGroup.add(musterSign);

    this.environmentGroup.add(gateGroup);

    // -------------------------------------------------------------------------
    // 9. VISIBLE MULTI-POINT GAS LEAKAGE, CHEMICAL PLUMES & ATMOSPHERE
    // Semi-transparent pale yellowish-green & white gas effects at identifiable points
    // -------------------------------------------------------------------------

    // Leak 1: PRIMARY LEAK - Ruptured ammonia manifold flange at Tank Farm (-26, 2.2, 10)
    this.addGasLeakSource({
      id: 'HAZ-GAS-AMMONIA',
      type: 'Anhydrous Ammonia (NH3) & VOCs',
      position: new THREE.Vector3(-26, 2.2, 10),
      peakConcentrationPPM: 1480,
      radius: 34,
      severity: 'LETHAL TOXIC PLUME',
      color: 0xd9f99d, // Distinct pale yellowish-green ammonia plume
      particleCount: 120,
      particleSize: 3.2,
      opacity: 0.48,
      spreadX: 10,
      spreadY: 12,
      spreadZ: 10,
      riseSpeed: 1.8,
      driftSpeedX: 1.5,
      isPrimary: true
    });

    // Leak 2: SECONDARY LEAK - Sheared pipeline connection on overhead pipe bridge (-10, 6.2, -6)
    this.addGasLeakSource({
      id: 'HAZ-GAS-PIPE-JET',
      type: 'Pressurized Combustible Gas Jet',
      position: new THREE.Vector3(-10, 6.2, -6),
      peakConcentrationPPM: 780,
      radius: 20,
      severity: 'HIGH EXPLOSIVE HAZARD',
      color: 0xf1f5f9, // Pressurized white/pale vapor jet
      particleCount: 85,
      particleSize: 2.2,
      opacity: 0.42,
      spreadX: 6,
      spreadY: 8,
      spreadZ: 6,
      riseSpeed: 2.4,
      driftSpeedX: 1.8,
      isPrimary: false
    });

    // Leak 3: INDOOR LEAK - Leaking gas accumulating inside production hall near boiler (-6, 1.4, -27)
    this.addGasLeakSource({
      id: 'HAZ-GAS-INDOOR',
      type: 'Methane (CH4) Line Leak',
      position: new THREE.Vector3(-6, 1.4, -27),
      peakConcentrationPPM: 640,
      radius: 16,
      severity: 'INDOOR FLAMMABLE ACCUMULATION',
      color: 0xfef08a, // Soft yellowish haze
      particleCount: 70,
      particleSize: 2.6,
      opacity: 0.35,
      spreadX: 12,
      spreadY: 7,
      spreadZ: 10,
      riseSpeed: 0.8,
      driftSpeedX: 0.4,
      isPrimary: false
    });

    // Active Chemical Fire near ruptured flange (-16, 0.6, 12)
    this.addFireHazard({
      id: 'HAZ-FIRE-IND',
      type: 'Chemical & Hydrocarbon Combustion',
      position: new THREE.Vector3(-16, 0.6, 12),
      intensity: 2.2,
      radius: 8
    });

    // Localized dust haze around collapsed factory roof
    this.addDustPlume({
      position: new THREE.Vector3(0, 4.0, -10),
      radius: 16,
      height: 8,
      particleCount: 75,
      color: 0xc8c2b4,
      opacity: 0.24,
      riseSpeed: 0.4,
      driftX: 0.4
    });

    // -------------------------------------------------------------------------
    // 10. 12 VISIBLE INDUSTRIAL DISASTER SURVIVORS (6 OUTSIDE + 6 INSIDE FACTORY)
    // Full NDRF START triage protocol, hardhats, realistic positions & vitals
    // -------------------------------------------------------------------------

    // OUTSIDE SURVIVORS:
    // Survivor 1: Chemical loader collapsed beside ruptured ammonia manifold in lethal toxic zone (RED: Immediate)
    this.addSurvivor({
      id: 'SURV-GAS-01',
      name: 'Loader Collapsed Near Ruptured Tank',
      position: new THREE.Vector3(-25.0, 0.6, 11.0),
      posture: 'trapped',
      temperature: 37.4,
      triage: 'RED',
      clothingColor: 0xea580c, // Safety orange coveralls
      hasHardhat: true,
      hardhatColor: 0xfacc15,
      hasReflectiveStripe: true,
      vitals: 'Unconscious | Acute Ammonia Inhalation (1200+ ppm) | Chemical Burns',
      gasExposure: 'LETHAL TOXIC ZONE (1400+ ppm)',
      detected: false
    });

    // Survivor 2: Plant safety warden at exterior muster gate guiding responders (GREEN: Minor)
    this.addSurvivor({
      id: 'SURV-GAS-02',
      name: 'Safety Warden at Exterior Gate',
      position: new THREE.Vector3(24.0, 0.6, 36.0),
      posture: 'standing',
      temperature: 36.7,
      triage: 'GREEN',
      clothingColor: 0x16a34a, // Green safety vest
      hasHardhat: true,
      hardhatColor: 0xf8fafc, // White supervisor hardhat
      hasReflectiveStripe: true,
      vitals: 'Ambulatory | Guiding Responders | LoRa Radio Active',
      gasExposure: 'Low (18 ppm)',
      detected: false
    });

    // Survivor 3: Tank farm technician stranded on elevated fractionating column ladder platform (YELLOW: Urgent)
    this.addSurvivor({
      id: 'SURV-GAS-03',
      name: 'Technician on Silo Platform',
      position: new THREE.Vector3(-30.0, 12.65, 27.5),
      posture: 'waving',
      temperature: 36.8,
      triage: 'YELLOW',
      clothingColor: 0x0284c7, // Blue coveralls
      flagColor: 0xfacc15,
      hasHardhat: true,
      hardhatColor: 0xfacc15,
      vitals: 'HR: 96 bpm | Ladder Cage Buckled | Non-ambulatory at Height',
      gasExposure: 'Moderate (92 ppm)',
      detected: false
    });

    // Survivor 4: Truck driver injured beside chemical tanker at loading dock (YELLOW: Urgent)
    this.addSurvivor({
      id: 'SURV-GAS-04',
      name: 'Truck Driver (Loading Dock)',
      position: new THREE.Vector3(28.0, 1.35, 14.0),
      posture: 'sitting',
      temperature: 36.9,
      triage: 'YELLOW',
      clothingColor: 0x475569, // Grey jacket
      vitals: 'HR: 90 bpm | Blast Concussion | Minor Inhalation',
      gasExposure: 'Moderate (45 ppm)',
      detected: false
    });

    // Survivor 5: Utility technician trapped behind transformer substation fence (RED: Immediate)
    this.addSurvivor({
      id: 'SURV-GAS-05',
      name: 'Electrician (Substation Enclosure)',
      position: new THREE.Vector3(23.2, 0.6, -28.2),
      posture: 'trapped',
      temperature: 37.2,
      triage: 'RED',
      clothingColor: 0xd97706, // Amber flame-retardant suit
      hasHardhat: true,
      hardhatColor: 0xfacc15,
      vitals: 'HR: 120 bpm | Electrical Arc Burns | Locked in Enclosure',
      gasExposure: 'Trace Smoke & Ozone',
      detected: false
    });

    // Survivor 6: Logistics worker in open container yard signaling for help (GREEN: Minor)
    this.addSurvivor({
      id: 'SURV-GAS-06',
      name: 'Logistics Clerk (Container Yard)',
      position: new THREE.Vector3(36.0, 0.6, 32.0),
      posture: 'waving',
      temperature: 36.6,
      triage: 'GREEN',
      clothingColor: 0xf59e0b, // Yellow shirt
      flagColor: 0xffffff,
      vitals: 'Stable | Awaiting Evacuation Order | Clear Route Available',
      gasExposure: 'Baseline (20 ppm)',
      detected: false
    });

    // INSIDE FACTORY SURVIVORS:
    // Survivor 7: Chemical operator trapped in production hall behind main boiler (RED: Immediate)
    this.addSurvivor({
      id: 'SURV-GAS-07',
      name: 'Operator Behind Boiler (Interior)',
      position: new THREE.Vector3(-6.0, 0.6, -26.0),
      posture: 'trapped',
      temperature: 37.3,
      triage: 'RED',
      clothingColor: 0xe11d48, // Crimson coveralls
      hasHardhat: true,
      hardhatColor: 0xfacc15,
      vitals: 'HR: 136 bpm | Lethal Gas Zone (NH3 680 ppm) | Crush Injury',
      gasExposure: 'LETHAL TOXIC ZONE',
      detected: false
    });

    // Survivor 8: Maintenance technician stranded on elevated mezzanine catwalk (YELLOW: Urgent)
    this.addSurvivor({
      id: 'SURV-GAS-08',
      name: 'Technician on Catwalk (Interior)',
      position: new THREE.Vector3(4.0, 6.68, -36.0),
      posture: 'waving',
      temperature: 36.9,
      triage: 'YELLOW',
      clothingColor: 0x2563eb, // Royal blue
      flagColor: 0xef4444,
      hasHardhat: true,
      hardhatColor: 0xfacc15,
      vitals: 'HR: 94 bpm | Mezzanine Staircase Collapsed | Elevated VOCs',
      gasExposure: 'Elevated (85 ppm)',
      detected: false
    });

    // Survivor 9: Worker pinned beneath fallen cable tray near electrical switchgear (RED: Immediate)
    this.addSurvivor({
      id: 'SURV-GAS-09',
      name: 'Worker Pinned by Cable Tray (Interior)',
      position: new THREE.Vector3(10.5, 0.6, -21.5),
      posture: 'trapped',
      temperature: 37.0,
      triage: 'RED',
      clothingColor: 0x9333ea, // Purple uniform
      vitals: 'HR: 118 bpm | Thoracic Compression | Conscious',
      gasExposure: 'Elevated VOCs (110 ppm)',
      detected: false
    });

    // Survivor 10: Shift supervisor inside observation control room (YELLOW: Urgent)
    this.addSurvivor({
      id: 'SURV-GAS-10',
      name: 'Supervisor in Control Room (Interior)',
      position: new THREE.Vector3(-15.0, 6.68, -35.5),
      posture: 'standing',
      temperature: 36.8,
      triage: 'YELLOW',
      clothingColor: 0xf1f5f9, // White lab coat
      hasHardhat: true,
      hardhatColor: 0xf8fafc,
      vitals: 'HR: 88 bpm | Glass Lacerations | Sealed in Observation Office',
      gasExposure: 'Low Inside Sealed Office (35 ppm)',
      detected: false
    });

    // Survivor 11: Assembly worker sitting against machinery column near air duct (YELLOW: Urgent)
    this.addSurvivor({
      id: 'SURV-GAS-11',
      name: 'Assembly Worker by Machine (Interior)',
      position: new THREE.Vector3(0.0, 0.6, -18.0),
      posture: 'sitting',
      temperature: 36.7,
      triage: 'YELLOW',
      clothingColor: 0x15803d, // Dark green
      vitals: 'HR: 92 bpm | Smoke Inhalation | Mild Disorientation',
      gasExposure: 'Moderate (70 ppm)',
      detected: false
    });

    // Survivor 12: Evacuating worker trapped near partially blocked internal fire exit (RED: Immediate)
    this.addSurvivor({
      id: 'SURV-GAS-12',
      name: 'Worker at Blocked Fire Exit (Interior)',
      position: new THREE.Vector3(-20.0, 0.6, -35.0),
      posture: 'trapped',
      temperature: 37.1,
      triage: 'RED',
      clothingColor: 0xdc2626, // Red
      hasHardhat: true,
      hardhatColor: 0xfacc15,
      vitals: 'HR: 124 bpm | Blocked by Collapsed Wall Slab | Low Oxygen',
      gasExposure: 'Elevated (95 ppm)',
      detected: false
    });

    // Night Mode Factory Emergency Flashers
    this.addEmergencyBeaconLight(new THREE.Vector3(-38, 3.5, 8));
    this.addEmergencyBeaconLight(new THREE.Vector3(24, 2.5, 38));
    this.addEmergencyBeaconLight(new THREE.Vector3(30, 2.0, 14));
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

    // Reflective safety stripes on torso
    if (data.hasReflectiveStripe || data.hasHardhat) {
      const stripeMat = new THREE.MeshBasicMaterial({ color: 0xf1f5f9 });
      const s1 = new THREE.Mesh(new THREE.CylinderGeometry(0.285, 0.28, 0.07, 10), stripeMat);
      s1.position.y = 1.0;
      group.add(s1);
      const s2 = new THREE.Mesh(new THREE.CylinderGeometry(0.265, 0.26, 0.07, 10), stripeMat);
      s2.position.y = 0.68;
      group.add(s2);
    }

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

    // Industrial Safety Hardhat if specified
    if (data.hasHardhat) {
      const hardhatMat = new THREE.MeshStandardMaterial({
        color: data.hardhatColor || 0xfacc15,
        roughness: 0.35,
        metalness: 0.2
      });
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), hardhatMat);
      dome.position.y = 0.08;
      head.add(dome);
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.04, 14), hardhatMat);
      brim.position.y = 0.08;
      head.add(brim);
    }

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
    } else if (data.posture === 'crouching') {
      group.rotation.x = 0.25;
      leftLeg.position.set(-0.16, 0.28, 0.15);
      leftLeg.rotation.x = 0.8;
      rightLeg.position.set(0.16, 0.28, 0.15);
      rightLeg.rotation.x = 0.8;
      leftArm.position.set(-0.32, 0.7, 0.2);
      leftArm.rotation.x = 0.5;
      rightArm.position.set(0.32, 0.7, 0.2);
      rightArm.rotation.x = 0.5;
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
    data.wavingArm = (data.posture === 'waving') ? leftArm : null;
    this.obstacleColliders.push(torso);
    this.survivors.push(data);
  }

  // =========================================================================
  // HAZARDS: VOLUMETRIC GAS DISPERSION, DUST & FIRE
  // =========================================================================
  addFireHazard(data) {
    data.type = data.type || 'Active Fire Hazard';
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

    const pCount = data.particleCount || 85;
    const pGeo = new THREE.BufferGeometry();
    const pPos = new Float32Array(pCount * 3);

    const spreadX = data.spreadX || 7;
    const spreadY = data.spreadY || 9;
    const spreadZ = data.spreadZ || 7;

    for (let i = 0; i < pCount; i++) {
      pPos[i * 3] = (Math.random() - 0.5) * spreadX;
      pPos[i * 3 + 1] = Math.random() * spreadY;
      pPos[i * 3 + 2] = (Math.random() - 0.5) * spreadZ;
    }

    pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
    const pMat = new THREE.PointsMaterial({
      color: data.color || (data.type.includes('Ammonia') ? 0xd9f99d : (data.type.includes('Methane') ? 0xfef08a : 0x38bdf8)),
      size: data.particleSize || 2.4,
      transparent: true,
      opacity: data.opacity || 0.44,
      depthWrite: false
    });

    const gasCloud = new THREE.Points(pGeo, pMat);
    gasGroup.add(gasCloud);

    this.environmentGroup.add(gasGroup);
    data.gasCloud = gasCloud;
    data.particleGeo = pGeo;
    data.spreadX = spreadX;
    data.spreadY = spreadY;
    data.spreadZ = spreadZ;
    data.riseSpeed = data.riseSpeed || 1.6;
    data.driftSpeedX = data.driftSpeedX || 1.4;
    data.maxHeight = data.maxHeight || (spreadY + 1.2);

    if (!this.gasPlumeEmitter || data.isPrimary) {
      this.gasPlumeEmitter = data;
    }
    this.hazards.push(data);
  }

  addDustPlume(data) {
    const dustGroup = new THREE.Group();
    dustGroup.position.copy(data.position);

    const count = data.particleCount || 65;
    const pGeo = new THREE.BufferGeometry();
    const pPos = new Float32Array(count * 3);

    const radius = data.radius || 10;
    const height = data.height || 6;

    for (let i = 0; i < count; i++) {
      pPos[i * 3] = (Math.random() - 0.5) * radius * 2;
      pPos[i * 3 + 1] = Math.random() * height;
      pPos[i * 3 + 2] = (Math.random() - 0.5) * radius * 2;
    }

    pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
    const pMat = new THREE.PointsMaterial({
      color: data.color || 0xd1c7b7,
      size: data.size || 2.8,
      transparent: true,
      opacity: data.opacity || 0.28,
      depthWrite: false
    });

    const dustCloud = new THREE.Points(pGeo, pMat);
    dustGroup.add(dustCloud);
    this.environmentGroup.add(dustGroup);

    this.particles.push({
      cloud: dustCloud,
      geo: pGeo,
      count: count,
      radius: radius,
      height: height,
      riseSpeed: data.riseSpeed || 0.45,
      driftX: data.driftX || 0.3
    });
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

      for (let i = 0; i < pos.count; i++) {
        const vx = init[i * 3];
        const vy = init[i * 3 + 1];
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

    // 5. Animate fire & smoke particles
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
        const rise = h.riseSpeed || 1.6;
        const drift = h.driftSpeedX || 1.4;
        const maxH = h.maxHeight || 9.5;
        const spX = h.spreadX || 2.5;
        const spZ = h.spreadZ || 2.5;

        for (let j = 0; j < gPos.length; j += 3) {
          gPos[j + 1] += rise * delta; // rise
          gPos[j] += drift * delta;     // wind drift along X
          if (gPos[j + 1] > maxH) {
            gPos[j + 1] = 0.4;
            gPos[j] = (Math.random() - 0.5) * spX;
            gPos[j + 2] = (Math.random() - 0.5) * spZ;
          }
        }
        h.particleGeo.attributes.position.needsUpdate = true;
      }
    });

    // 6. Animate atmospheric dust plumes
    this.particles.forEach(p => {
      if (p.geo) {
        const arr = p.geo.attributes.position.array;
        for (let j = 0; j < p.count; j++) {
          arr[j * 3 + 1] += p.riseSpeed * delta;
          arr[j * 3] += p.driftX * delta;
          if (arr[j * 3 + 1] > p.height) {
            arr[j * 3 + 1] = 0.2;
            arr[j * 3] = (Math.random() - 0.5) * p.radius * 2;
            arr[j * 3 + 2] = (Math.random() - 0.5) * p.radius * 2;
          }
        }
        p.geo.attributes.position.needsUpdate = true;
      }
    });
  }

  getGasConcentrationAt(pos) {
    let maxPpm = 15;
    let closestEmitter = null;
    let minDist = Infinity;

    this.hazards.forEach(h => {
      if (h.peakConcentrationPPM) {
        const dist = pos.distanceTo(h.position);
        if (dist <= h.radius) {
          const factor = Math.exp(-Math.pow(dist / (h.radius * 0.45), 2));
          const ppm = Math.round(15 + factor * h.peakConcentrationPPM);
          if (ppm > maxPpm) {
            maxPpm = ppm;
          }
        }
        if (dist < minDist) {
          minDist = dist;
          closestEmitter = h;
        }
      }
    });

    if (closestEmitter) {
      this.gasPlumeEmitter = closestEmitter;
    }

    return maxPpm;
  }
}

window.DisasterEnvironment = DisasterEnvironment;
