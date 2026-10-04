/**
 * AERORES-AI Radiometric Thermal IR Shader Engine (FLIR LWIR Simulation)
 * Physically-based false-color Ironbow/Rainbow SAR Palette:
 * Cold -> Hot: Dark Blue -> Blue -> Cyan -> Green -> Yellow -> Orange -> Red -> White
 * Features:
 * 1. Realistic surface temperature simulation (buildings, roads, roofs, windows, rubble, water, vegetation, machinery, fires)
 * 2. High-fidelity survivor human body heat signatures (head/hands: 39.5°C-43.5°C vivid orange/red, torso: 36°C-38.5°C warm yellow/orange, limbs: 32°C-34.5°C, clothing: 24°C-27°C)
 * 3. Surface normal solar absorption, elevation gradients, micro-thermal variation & physical Fresnel cold-sky emissivity reflection
 * 4. Blazing fire cores (>450°C white/yellow) with continuous radial thermal radiant dissipation (hot -> warm -> cool)
 * 5. Full support across Main Viewport, Gimbal FPV, Secondary PIP, Follow, Top-down & Orbit cameras
 * 6. Dynamic atmosphere preservation across scenario changes and dynamic weather
 * 7. Zero full-screen pink/red tint, zero scanlines, zero random magenta surfaces
 * Team Pegasus - SIH 2026
 */

class ThermalEngine {
  constructor(drone, environment, camera, renderer, scene) {
    this.drone = drone;
    this.environment = environment;
    this.camera = camera;
    this.renderer = renderer;
    this.scene = scene || (drone ? drone.scene : null);

    this.isActive = false;
    this.time = 0;
    this.sunDir = new THREE.Vector3(0.5, 0.8, 0.3).normalize();
    this.originalAtmosphere = null;
    this.suppressedGasClouds = [];

    // Cache of shared GPU ShaderMaterials for high performance (60+ FPS)
    this.materials = {};
    this.initShaders();
  }

  initShaders() {
    // Shared Vertex Shader for all thermal meshes
    const vertexShader = `
      varying vec3 vNormal;
      varying vec3 vWorldPosition;
      varying vec3 vViewPosition;
      varying vec2 vUv;

      void main() {
        vUv = uv;
        vNormal = normalize(normalMatrix * normal);
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPos.xyz;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vViewPosition = -mvPosition.xyz;
        gl_Position = projectionMatrix * mvPosition;
      }
    `;

    // Shared Fragment Shader implementing radiometric thermal physics & the Ironbow palette
    const fragmentShader = `
      precision highp float;

      uniform float uTime;
      uniform vec3 uSunDir;
      uniform float uBaseTemp;
      uniform float uTempVariation;
      uniform float uEmissivity;
      uniform int uThermalType;
      uniform float uOpacity;

      varying vec3 vNormal;
      varying vec3 vWorldPosition;
      varying vec3 vViewPosition;
      varying vec2 vUv;

      // Exact FLIR false-color thermal palette:
      // Dark Blue -> Blue -> Cyan -> Green -> Yellow -> Orange -> Red -> White
      vec3 getThermalColor(float temp) {
        vec3 cDarkBlue = vec3(0.012, 0.035, 0.26); // <= 5°C
        vec3 cBlue     = vec3(0.025, 0.20, 0.72);  // ~ 11°C
        vec3 cCyan     = vec3(0.02, 0.65, 0.85);   // ~ 16°C
        vec3 cCyanGrn  = vec3(0.05, 0.76, 0.55);   // ~ 20°C
        vec3 cGreen    = vec3(0.12, 0.82, 0.22);   // ~ 25°C
        vec3 cYelGrn   = vec3(0.68, 0.88, 0.08);   // ~ 31°C
        vec3 cYellow   = vec3(0.98, 0.84, 0.05);   // ~ 35.5°C
        vec3 cOrange   = vec3(0.98, 0.44, 0.02);   // ~ 38.0°C
        vec3 cRed      = vec3(0.92, 0.09, 0.08);   // ~ 44.0°C
        vec3 cYelWhite = vec3(1.0, 0.88, 0.40);    // ~ 75.0°C
        vec3 cWhite    = vec3(1.0, 1.0, 1.0);      // >= 95.0°C

        if (temp <= 8.0) {
          float f = clamp((temp - 2.0) / 6.0, 0.0, 1.0);
          return mix(cDarkBlue, cBlue, f);
        } else if (temp <= 14.0) {
          float f = (temp - 8.0) / 6.0;
          return mix(cBlue, cCyan, f);
        } else if (temp <= 19.0) {
          float f = (temp - 14.0) / 5.0;
          return mix(cCyan, cCyanGrn, f);
        } else if (temp <= 25.0) {
          float f = (temp - 19.0) / 6.0;
          return mix(cCyanGrn, cGreen, f);
        } else if (temp <= 31.0) {
          float f = (temp - 25.0) / 6.0;
          return mix(cGreen, cYelGrn, f);
        } else if (temp <= 36.0) {
          float f = (temp - 31.0) / 5.0;
          return mix(cYelGrn, cYellow, f);
        } else if (temp <= 39.0) {
          float f = (temp - 36.0) / 3.0;
          return mix(cYellow, cOrange, f);
        } else if (temp <= 46.0) {
          float f = (temp - 39.0) / 7.0;
          return mix(cOrange, cRed, f);
        } else if (temp <= 75.0) {
          float f = (temp - 46.0) / 29.0;
          return mix(cRed, cYelWhite, f);
        } else {
          float f = clamp((temp - 75.0) / 25.0, 0.0, 1.0);
          return mix(cYelWhite, cWhite, f);
        }
      }

      void main() {
        vec3 normal = normalize(vNormal);
        vec3 viewDir = normalize(vViewPosition);
        float nDotV = max(0.0, dot(normal, viewDir));

        float temp = uBaseTemp;

        // Specific thermal signatures per category
        if (uThermalType == 1) {
          // SURVIVOR EXPOSED SKIN: Head, Face, Hands
          // Distinct hot metabolic core signature (39.5°C - 43.5°C) -> Vivid Orange / Hot Red!
          float pulse = sin(uTime * 2.8) * 0.4;
          float centerHeat = pow(nDotV, 1.4) * 3.5;
          temp = 39.5 + pulse + centerHeat;
        }
        else if (uThermalType == 2) {
          // SURVIVOR TORSO: Warm core body heat (36.0°C - 38.5°C) -> Warm Yellow / Orange!
          float pulse = sin(uTime * 2.8) * 0.3;
          float coreHeat = pow(nDotV, 1.2) * 2.0;
          temp = 36.2 + pulse + coreHeat;
        }
        else if (uThermalType == 3) {
          // SURVIVOR LIMBS: Clothed arms & legs (31.5°C - 34.5°C) -> Green-Yellow / Yellow!
          float pulse = sin(uTime * 2.8) * 0.2;
          temp = 32.0 + pulse + (nDotV * 1.2);
        }
        else if (uThermalType == 4) {
          // SURVIVOR CLOTHING / VEST / HARDHAT: Insulated fabric (24.0°C - 27.5°C) -> Green / Cyan-Green!
          temp = 25.0 + (nDotV * 1.5);
        }
        else if (uThermalType == 5) {
          // SURVIVOR HEAT HALO: Subtle radiant limb heat envelope
          float limb = pow(clamp(dot(normal, viewDir), 0.0, 1.0), 1.8);
          float alpha = limb * 0.28 * uOpacity;
          temp = 36.5;
          vec3 color = getThermalColor(temp);
          gl_FragColor = vec4(color, alpha);
          return;
        }
        else if (uThermalType == 6) {
          // FIRE HAZARD / EXPLOSION CORE (>450°C)
          // Blinding white-hot core with turbulent flame flicker
          float flick = sin(uTime * 14.0 + vWorldPosition.y * 7.0) * 45.0 +
                        cos(uTime * 22.0 + vWorldPosition.x * 5.0) * 35.0;
          temp = clamp(uBaseTemp + flick, 90.0, 750.0);
        }
        else if (uThermalType == 7) {
          // FLOOD WATER / RIVER / CANAL / PUDDLES
          // Cool 10.0°C - 13.0°C with dynamic wave temperature ripples
          float wave = sin(vWorldPosition.x * 0.35 + uTime * 1.6) *
                       cos(vWorldPosition.z * 0.35 + uTime * 1.3) * 1.5;
          temp = uBaseTemp + wave;
        }
        else if (uThermalType == 8) {
          // VEGETATION / TREES / FOLIAGE
          // Cool green-cyan 13.5°C - 16.0°C
          float leafNoise = (fract(sin(dot(floor(vWorldPosition * 8.0), vec3(12.98, 78.23, 45.16))) * 43758.5) - 0.5) * 1.6;
          temp = uBaseTemp + leafNoise;
        }
        else if (uThermalType == 9) {
          // HOT MACHINERY / RUPTURED STEAM PIPES / BOILERS / GENERATORS
          // 52°C - 85°C localized heat zones (vivid orange / red)
          float pulse = sin(uTime * 4.0) * 3.0;
          temp = uBaseTemp + pulse;
        }
        else if (uThermalType == 10) {
          // WARM EQUIPMENT / VEHICLES / ENGINE BONNETS / ELECTRONICS
          // 30°C - 36°C warm green-yellow / yellow
          float engWarmth = (fract(sin(dot(floor(vWorldPosition * 1.5), vec3(33.1, 81.2, 57.3))) * 43758.5) - 0.5) * 2.5;
          temp = uBaseTemp + engWarmth;
        }
        else if (uThermalType == 11) {
          // ROOFS: Solar thermal absorption (19.5°C - 23.5°C variable blue/green)
          float sunAbsorb = max(0.0, dot(normal, normalize(uSunDir))) * 4.0;
          temp = uBaseTemp + sunAbsorb;
        }
        else if (uThermalType == 12) {
          // WINDOWS: Glass thermal response (18.0°C)
          temp = uBaseTemp;
        }
        else if (uThermalType == 13) {
          // ROADS & ASPHALT: Cool dark blue (10.5°C - 12.5°C)
          float roadNoise = (fract(sin(dot(floor(vWorldPosition * 2.0), vec3(12.98, 78.23, 45.16))) * 43758.5) - 0.5) * 0.8;
          temp = uBaseTemp + roadNoise;
        }
        else if (uThermalType == 14) {
          // RUBBLE & CONCRETE DEBRIS
          // Mixed temperatures (15°C - 23°C) across fractured chunks
          float chunkHash = fract(sin(dot(floor(vWorldPosition * 1.8), vec3(23.7, 67.1, 91.3))) * 43758.54);
          float rubbleBase = 15.0 + chunkHash * 6.0;
          float sunAbsorb = max(0.0, dot(normal, normalize(uSunDir))) * 2.5;
          temp = rubbleBase + sunAbsorb;
        }
        else if (uThermalType == 15) {
          // FLIR RADIOMETRIC SKY DOME: Cold deep navy (2.0°C - 5.0°C)
          temp = clamp(uBaseTemp + (1.0 - nDotV) * 2.0, 2.0, 7.0);
        }
        else if (uThermalType == 16) {
          // FIRE GROUND RADIANT DISSIPATION ZONE
          // Smooth radial falloff: Hot core (75°C) -> Warm (45°C - 35°C) -> Green (25°C) -> Cool blue ground (14°C)
          float r = clamp(length(vUv - 0.5) * 2.0, 0.0, 1.0);
          temp = mix(75.0, 13.5, pow(r, 1.3));
          float alpha = (1.0 - pow(r, 2.5)) * uOpacity;
          vec3 color = getThermalColor(temp);
          gl_FragColor = vec4(color, alpha);
          return;
        }
        else if (uThermalType == 17) {
          // STRUCTURAL METAL / REBAR / STEEL BEAMS
          // Distinct metallic emissivity response (15.5°C)
          float metalFresnel = pow(1.0 - nDotV, 2.5) * 3.5;
          temp = uBaseTemp - metalFresnel;
        }
        else {
          // TYPE 0: GENERIC BUILDING WALLS & CONCRETE
          // Mostly cool blue (13.5°C - 16.5°C)
          float heightGrad = clamp((vWorldPosition.y - 0.5) * 0.08, -1.0, 2.0);
          float sunWarmth = max(0.0, dot(normal, normalize(uSunDir))) * 2.2 * uEmissivity;
          float microNoise = (fract(sin(dot(floor(vWorldPosition * 4.0), vec3(12.98, 78.23, 45.16))) * 43758.5) - 0.5) * uTempVariation;
          temp = uBaseTemp + heightGrad + sunWarmth + microNoise;
        }

        // Physical Fresnel cold sky reflection (effective emissivity drop at glancing angles)
        if (uThermalType != 1 && uThermalType != 5 && uThermalType != 6 && uThermalType != 15 && uThermalType != 16) {
          float fresnel = pow(1.0 - nDotV, 3.2);
          temp -= fresnel * (1.0 - uEmissivity * 0.7) * 4.0;
        }

        vec3 color = getThermalColor(temp);
        gl_FragColor = vec4(color, uOpacity);
      }
    `;

    this.commonUniforms = {
      uTime: { value: 0 },
      uSunDir: { value: this.sunDir }
    };

    // Helper to generate customized ShaderMaterial instances
    const createThermalMaterial = (typeId, baseTemp, emissivity = 0.90, tempVariation = 1.4, transparent = false, opacity = 1.0, depthTest = true, depthWrite = true) => {
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uTime: this.commonUniforms.uTime,
          uSunDir: this.commonUniforms.uSunDir,
          uThermalType: { value: typeId },
          uBaseTemp: { value: baseTemp },
          uEmissivity: { value: emissivity },
          uTempVariation: { value: tempVariation },
          uOpacity: { value: opacity }
        },
        vertexShader,
        fragmentShader,
        transparent,
        depthTest,
        depthWrite: depthWrite && !transparent,
        side: THREE.DoubleSide
      });
      mat.userData = {
        isThermal: true,
        thermalTypeId: typeId,
        baseTemp: baseTemp
      };
      return mat;
    };

    // Instantiate and cache all category materials
    this.materials = {
      generic: createThermalMaterial(0, 14.0, 0.90, 1.4),
      survivor_skin: createThermalMaterial(1, 41.5, 0.98, 0.5),
      survivor_torso: createThermalMaterial(2, 37.0, 0.95, 0.6),
      survivor_limbs: createThermalMaterial(3, 32.5, 0.92, 0.8),
      survivor_clothing: createThermalMaterial(4, 25.5, 0.88, 0.5),
      survivor_halo: createThermalMaterial(5, 36.5, 0.95, 0.0, true, 0.45, true, false),
      fire: createThermalMaterial(6, 480.0, 0.99, 50.0),
      water: createThermalMaterial(7, 11.5, 0.96, 1.5),
      vegetation: createThermalMaterial(8, 14.5, 0.94, 1.2),
      hot_machinery: createThermalMaterial(9, 62.0, 0.85, 4.0),
      warm_equipment: createThermalMaterial(10, 32.5, 0.85, 2.0),
      roof: createThermalMaterial(11, 19.5, 0.88, 1.8),
      window: createThermalMaterial(12, 18.0, 0.75, 1.0),
      road: createThermalMaterial(13, 11.5, 0.92, 0.8),
      rubble: createThermalMaterial(14, 17.5, 0.90, 2.5),
      sky: createThermalMaterial(15, 3.5, 0.99, 0.5),
      fire_ground_dissipation: createThermalMaterial(16, 75.0, 0.95, 0.0, true, 0.85, true, false),
      metal_structural: createThermalMaterial(17, 15.5, 0.72, 1.2),
      drone_chassis: createThermalMaterial(0, 16.5, 0.82, 1.0),
      drone_motor: createThermalMaterial(9, 44.0, 0.88, 3.0)
    };

    for (const key in this.materials) {
      this.materials[key].userData.thermalType = key;
    }

    // Special fire points material for particle systems
    this.firePointsMaterial = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 1.8,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending
    });
  }

  classifyMesh(mesh) {
    // 1. Explicit tag on mesh or immediate ancestors
    if (mesh.userData && mesh.userData.thermalType) {
      const type = mesh.userData.thermalType;
      return this.materials[type] || this.materials.generic;
    }

    let parent = mesh.parent;
    while (parent) {
      if (parent.userData && parent.userData.thermalType) {
        const type = parent.userData.thermalType;
        return this.materials[type] || this.materials.generic;
      }
      if (parent.userData && parent.userData.isSurvivorGroup) {
        return this.materials.survivor_clothing;
      }
      if (parent.userData && parent.userData.isVehicleGroup) {
        return this.materials.warm_equipment;
      }
      parent = parent.parent;
    }

    // 2. Identify by geometry, names, or scene context
    const name = (mesh.name || '').toLowerCase();
    const parentName = (mesh.parent && mesh.parent.name ? mesh.parent.name : '').toLowerCase();
    const rawMat = mesh.material;
    const firstMat = Array.isArray(rawMat) ? rawMat[0] : rawMat;
    const matColor = (firstMat && firstMat.color) ? firstMat.color.getHex() : 0x000000;

    // Check water instances
    if (this.environment) {
      if (mesh === this.environment.waterMesh || mesh === this.environment.channelMesh) {
        return this.materials.water;
      }
    }

    // Name-based heuristics
    if (name.includes('head') || parentName.includes('head') || name.includes('hand') || parentName.includes('hand')) {
      return this.materials.survivor_skin;
    }
    if (name.includes('torso') || parentName.includes('torso')) return this.materials.survivor_torso;
    if (name.includes('leg') || name.includes('arm') || parentName.includes('arm')) return this.materials.survivor_limbs;
    if (name.includes('halo') || name.includes('core') || name.includes('heatcore')) return this.materials.survivor_halo;
    if (name.includes('fire_radiant') || name.includes('heatglow')) return this.materials.fire_ground_dissipation;
    if (name.includes('fire') || parentName.includes('fire')) return this.materials.fire;
    if (name.includes('water') || name.includes('puddle') || name.includes('channel') || name.includes('pool')) return this.materials.water;
    if (name.includes('leaf') || name.includes('tree') || name.includes('plant') || name.includes('trunk') || name.includes('hyacinth') || name.includes('palm') || name.includes('reed')) {
      return this.materials.vegetation;
    }
    if (name.includes('roof') || name.includes('slate') || name.includes('terrace') || name.includes('thatch') || name.includes('tile')) {
      return this.materials.roof;
    }
    if (name.includes('window') || name.includes('glass') || name.includes('aperture')) return this.materials.window;
    if (name.includes('road') || name.includes('asphalt') || name.includes('street') || name.includes('ground') || name.includes('tarmac') || name.includes('highway')) {
      return this.materials.road;
    }
    if (name.includes('rubble') || name.includes('debris') || name.includes('slab') || name.includes('brick') || name.includes('fracture') || name.includes('collapse') || name.includes('timber')) {
      return this.materials.rubble;
    }
    if (name.includes('boiler') || name.includes('generator') || name.includes('transformer') || name.includes('turbine') || name.includes('exhaust') || name.includes('steampipe') || name.includes('steam')) {
      return this.materials.hot_machinery;
    }
    if (name.includes('motor') || name.includes('prop') || parentName.includes('prop')) return this.materials.drone_motor;
    if (name.includes('lens')) return this.materials.warm_equipment;
    if (name.includes('skid') || name.includes('chassis') || name.includes('hull') || name.includes('carbon')) return this.materials.drone_chassis;
    if (name.includes('truck') || name.includes('car') || name.includes('taxi') || name.includes('van') || name.includes('rickshaw') || name.includes('ambulance') || name.includes('cab')) {
      return this.materials.warm_equipment;
    }
    if (name.includes('rebar') || name.includes('steel') || name.includes('beam') || name.includes('corrugated') || name.includes('truss')) {
      return this.materials.metal_structural;
    }
    if (name.includes('sky') || name.includes('dome')) return this.materials.sky;

    // Color-based heuristics for materials in environment.js
    // 1. Water blues
    if (matColor === 0x1e6091 || matColor === 0x0f4c81 || matColor === 0x168aad || matColor === 0x1e40af || matColor === 0x0284c7) {
      return this.materials.water;
    }
    // 2. Flesh/skin tones
    if (matColor === 0xfbbf24 || matColor === 0xf59e0b) {
      return this.materials.survivor_skin;
    }
    // 3. Foliage / Botanical greens
    if (matColor === 0x15803d || matColor === 0x22c55e || matColor === 0x166534 || matColor === 0x4ade80 || matColor === 0x14532d || matColor === 0x84cc16 || matColor === 0x65a30d) {
      return this.materials.vegetation;
    }
    // 4. Dark asphalt & roads
    if (matColor === 0x181e28 || matColor === 0x1a2130 || matColor === 0x111622) {
      return this.materials.road;
    }
    // 5. Rubble, earth, masonry, bricks
    if (matColor === 0xd6cbbe || matColor === 0xc4b5a0 || matColor === 0xb8a99a || matColor === 0xc7b597 ||
        matColor === 0x271e16 || matColor === 0x7a6352 || matColor === 0x634832 || matColor === 0x8a705b ||
        matColor === 0x5c4033 || matColor === 0x78533b || matColor === 0xd4b996) {
      return this.materials.rubble;
    }
    // 6. Roofs (terra, tin, slate, thatch)
    if (matColor === 0x8a4b38 || matColor === 0xa16207 || matColor === 0xc2410c || matColor === 0x991b1b) {
      return this.materials.roof;
    }
    // 7. Dark glass / windows
    if (matColor === 0x0f172a && mesh.geometry && (mesh.geometry.type === 'PlaneGeometry' || mesh.geometry.type === 'BoxGeometry')) {
      if (mesh.position.y > 1.2) return this.materials.window;
    }
    // 8. Structural metal / rebar
    if (matColor === 0x64748b || matColor === 0x475569) {
      if (firstMat && firstMat.metalness && firstMat.metalness > 0.6) return this.materials.metal_structural;
    }
    // 9. Vehicles / Machinery
    if (matColor === 0x5a2d2d || matColor === 0x8f773d || matColor === 0x1d4ed8 || matColor === 0x881337) {
      return this.materials.warm_equipment;
    }

    return this.materials.generic;
  }

  applyThermalAtmosphere(app, scene) {
    if (!scene) return;
    scene.background = new THREE.Color(0x020514); // Cold deep navy FLIR sky
    if (scene.fog) {
      scene.fog.color.setHex(0x040a1c);
      scene.fog.density = 0.0038;
    }
    if (app) {
      if (app.skyDome) app.skyDome.visible = false;
      if (app.sunGroup) app.sunGroup.visible = false;
      if (app.moonGroup) app.moonGroup.visible = false;
      if (app.stars) app.stars.visible = false;
      if (app.cloudsGroup) app.cloudsGroup.visible = false;
      if (app.cloudsLowerGroup) app.cloudsLowerGroup.visible = false;
    }
  }

  enable() {
    if (this.isActive) return;
    this.isActive = true;

    const app = window.droneApp;
    const scene = this.scene || (app ? app.scene : null);
    if (!scene) return;

    // 1. Save original optical atmosphere & set dark radiometric FLIR background
    if (app) {
      this.originalAtmosphere = {
        background: scene.background ? scene.background.clone() : new THREE.Color(0x38bdf8),
        fogColor: scene.fog ? scene.fog.color.clone() : new THREE.Color(0x93c5fd),
        fogDensity: scene.fog ? scene.fog.density : 0.0032,
        skyDomeVisible: app.skyDome ? app.skyDome.visible : true,
        sunVisible: app.sunGroup ? app.sunGroup.visible : true,
        moonVisible: app.moonGroup ? app.moonGroup.visible : true,
        starsVisible: app.stars ? app.stars.visible : true,
        cloudsVisible: app.cloudsGroup ? app.cloudsGroup.visible : true,
        cloudsLowerVisible: app.cloudsLowerGroup ? app.cloudsLowerGroup.visible : false
      };

      this.applyThermalAtmosphere(app, scene);
    }

    // 2. Traverse scene and swap materials to thermal shaders
    this.suppressedGasClouds = [];
    scene.traverse(node => {
      if (node.isMesh) {
        // Skip UI, LiDAR, HUD, or internal helper lines
        let p = node;
        let isOverlay = false;
        while (p) {
          const pName = (p.name || '').toLowerCase();
          if (pName.includes('lidar') || pName.includes('hud') || pName.includes('helper') || pName.includes('reticle') || pName.includes('beacon') || pName.includes('pulse')) {
            isOverlay = true;
            break;
          }
          if (app && app.sensors && (p === app.sensors.lidarRangeRings || p === app.sensors.lidarVolumeFrustum || p === app.sensors.lidarPointCloud || p === app.sensors.lidarScanRays || p === app.sensors.lidarImpactPoints || p === app.sensors.lidarBlindZone)) {
            isOverlay = true;
            break;
          }
          if (app && app.environment && (p === app.environment.rainGroup || p === app.environment.snowGroup || p === app.environment.dustGroup || p === app.environment.windGroup)) {
            isOverlay = true;
            break;
          }
          p = p.parent;
        }
        if (isOverlay) return;

        if (node.userData._origMat === undefined) {
          node.userData._origMat = node.material;
        }

        const thermalMat = this.classifyMesh(node);
        node.material = thermalMat;

        // If it's a survivor heat core, make sure it is visible in thermal mode
        if (node.userData && (node.userData.thermalType === 'survivor_halo' || node.name.includes('heatcore'))) {
          node.visible = true;
        }
      } else if (node.isPoints) {
        // Fire particles
        if (node.userData && node.userData.thermalType === 'fire') {
          if (node.userData._origMat === undefined) {
            node.userData._origMat = node.material;
          }
          node.material = this.firePointsMaterial;
        }
        // Gas particles: In thermal IR, ambient gas has no thermal signature unless specified
        else if (node.userData && node.userData.isGasCloud) {
          if (node.userData._origVis === undefined) {
            node.userData._origVis = node.visible;
          }
          node.visible = false;
          this.suppressedGasClouds.push(node);
        }
      }
    });

    // 3. UI: Show Thermal Legend HUD and remove old incorrect CSS filters
    const legend = document.getElementById('thermal-legend');
    if (legend) legend.style.display = 'flex';

    const scanlines = document.getElementById('thermal-scanlines');
    if (scanlines) scanlines.style.display = 'none';

    const container = document.getElementById('three-canvas-container');
    if (container) {
      container.classList.remove('thermal-filter');
      container.classList.add('thermal-mode');
    }
  }

  disable() {
    if (!this.isActive) return;
    this.isActive = false;

    const app = window.droneApp;
    const scene = this.scene || (app ? app.scene : null);
    if (!scene) return;

    // 1. Restore original materials across the scene
    scene.traverse(node => {
      if (node.userData && node.userData._origMat !== undefined) {
        node.material = node.userData._origMat;
        delete node.userData._origMat;

        // Hide wireframe heat core sphere in RGB optical mode
        if (node.userData && (node.userData.thermalType === 'survivor_halo' || node.name.includes('heatcore'))) {
          node.visible = false;
        }
      }
      if (node.userData && node.userData._origVis !== undefined) {
        node.visible = node.userData._origVis;
        delete node.userData._origVis;
      }
    });

    this.suppressedGasClouds = [];

    // 2. Restore atmosphere & sky system
    if (app && this.originalAtmosphere) {
      scene.background = this.originalAtmosphere.background;
      if (scene.fog) {
        scene.fog.color.copy(this.originalAtmosphere.fogColor);
        scene.fog.density = this.originalAtmosphere.fogDensity;
      }
      if (app.skyDome) app.skyDome.visible = this.originalAtmosphere.skyDomeVisible;
      if (app.sunGroup) app.sunGroup.visible = this.originalAtmosphere.sunVisible;
      if (app.moonGroup) app.moonGroup.visible = this.originalAtmosphere.moonVisible;
      if (app.stars) app.stars.visible = this.originalAtmosphere.starsVisible;
      if (app.cloudsGroup) app.cloudsGroup.visible = this.originalAtmosphere.cloudsVisible;
      if (app.cloudsLowerGroup) app.cloudsLowerGroup.visible = this.originalAtmosphere.cloudsLowerVisible;
      app.updateAtmosphereForScenario(app.environment ? app.environment.currentScenario : 'earthquake');
    }

    // 3. UI: Hide Thermal Legend
    const legend = document.getElementById('thermal-legend');
    if (legend) legend.style.display = 'none';

    const container = document.getElementById('three-canvas-container');
    if (container) {
      container.classList.remove('thermal-mode');
      container.classList.remove('thermal-filter');
    }
  }

  update(delta, activeCamera) {
    if (!this.isActive) return;

    this.time += delta;
    this.commonUniforms.uTime.value = this.time;

    // Update sun direction from app if available
    const app = window.droneApp;
    if (app && app.sunDir) {
      this.commonUniforms.uSunDir.value.copy(app.sunDir);
    }
  }

  onScenarioChanged() {
    if (!this.isActive) return;

    const app = window.droneApp;
    const scene = this.scene || (app ? app.scene : null);
    if (!scene) return;

    // Keep thermal radiometric atmosphere in place
    this.applyThermalAtmosphere(app, scene);

    // Reapply thermal materials to newly created scenario objects
    scene.traverse(node => {
      if (node.isMesh) {
        // Skip UI, LiDAR, HUD, or internal helper lines
        let p = node;
        let isOverlay = false;
        while (p) {
          const pName = (p.name || '').toLowerCase();
          if (pName.includes('lidar') || pName.includes('hud') || pName.includes('helper') || pName.includes('reticle') || pName.includes('beacon') || pName.includes('pulse')) {
            isOverlay = true;
            break;
          }
          if (app && app.sensors && (p === app.sensors.lidarRangeRings || p === app.sensors.lidarVolumeFrustum || p === app.sensors.lidarPointCloud)) {
            isOverlay = true;
            break;
          }
          p = p.parent;
        }
        if (isOverlay) return;

        if (node.userData._origMat === undefined) {
          node.userData._origMat = node.material;
        }
        node.material = this.classifyMesh(node);
        if (node.userData && (node.userData.thermalType === 'survivor_halo' || node.name.includes('heatcore'))) {
          node.visible = true;
        }
      } else if (node.isPoints) {
        if (node.userData && node.userData.thermalType === 'fire') {
          if (node.userData._origMat === undefined) {
            node.userData._origMat = node.material;
          }
          node.material = this.firePointsMaterial;
        } else if (node.userData && node.userData.isGasCloud) {
          if (node.userData._origVis === undefined) {
            node.userData._origVis = node.visible;
          }
          node.visible = false;
        }
      }
    });
  }

  onAtmosphereChanged() {
    if (!this.isActive) return;
    const app = window.droneApp;
    const scene = this.scene || (app ? app.scene : null);
    if (!scene) return;
    this.applyThermalAtmosphere(app, scene);
  }
}

window.ThermalEngine = ThermalEngine;
