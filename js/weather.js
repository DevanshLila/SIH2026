/**
 * AERORES-AI Dynamic Weather & Atmospheric Physics System
 * Supports:
 *  1. Clear Atmosphere (Standard baseline)
 *  2. Dense Smoke & Ash Fog (Post-blast particulate plume, showcases FLIR Thermal / LiDAR penetration)
 *  3. Heavy Rain Storm & Lightning (Monsoon downpour, 3D rain streaks, lightning flash & thunder)
 *  4. High Wind Turbulence (Severe gale crosswind 45-55 km/h, aerodynamic drone buffeting & IMU compensation)
 * 
 * Team Pegasus - SIH 2026 (Qualcomm Inc. PS-26177)
 */

class WeatherSystem {
  constructor(scene, drone, gcs) {
    this.scene = scene;
    this.drone = drone;
    this.gcs = gcs;
    this.weatherGroup = new THREE.Group();
    this.scene.add(this.weatherGroup);

    this.currentMode = 'clear'; // 'clear', 'dense_fog', 'rain_storm', 'high_wind'

    // Particle Systems
    this.rainMesh = null;
    this.rainGeometry = null;
    this.rainCount = 2800;

    this.ashMesh = null;
    this.ashGeometry = null;
    this.ashCount = 1400;

    this.windDebrisMesh = null;
    this.windDebrisGeometry = null;
    this.windDebrisCount = 600;

    // Lightning System
    this.lightningLight = null;
    this.lightningTimer = 0;
    this.isFlashing = false;
    this.nextLightningInterval = 6.0;

    // Wind & Turbulence State
    this.windState = {
      speedKmh: 4.5,
      directionDeg: 310,
      directionName: 'NW',
      turbulenceIntensity: 0.0,
      gustFactor: 1.0,
      gustTimer: 0
    };

    // Original scene fog/lighting cache
    this.defaultFogColor = 0x060c1d;
    this.defaultFogDensity = 0.012;

    this.initLighting();
    this.initParticleSystems();
    this.setWeather('clear');
  }

  initLighting() {
    // Dedicated omni-directional lightning flash strobe
    this.lightningLight = new THREE.DirectionalLight(0xdbeafe, 0);
    this.lightningLight.position.set(20, 100, 20);
    this.weatherGroup.add(this.lightningLight);
  }

  initParticleSystems() {
    // ----------------------------------------------------
    // 1. RAIN PARTICLE SYSTEM (3,000 translucent falling streaks)
    // ----------------------------------------------------
    const rainRange = 90;
    const rainPositions = new Float32Array(this.rainCount * 3);
    const rainVelocities = new Float32Array(this.rainCount);

    for (let i = 0; i < this.rainCount; i++) {
      rainPositions[i * 3] = (Math.random() - 0.5) * rainRange;
      rainPositions[i * 3 + 1] = Math.random() * 45;
      rainPositions[i * 3 + 2] = (Math.random() - 0.5) * rainRange;
      rainVelocities[i] = 38 + Math.random() * 15;
    }

    this.rainGeometry = new THREE.BufferGeometry();
    this.rainGeometry.setAttribute('position', new THREE.BufferAttribute(rainPositions, 3));
    this.rainVelocities = rainVelocities;

    const rainMat = new THREE.PointsMaterial({
      color: 0x93c5fd,
      size: 0.35,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    this.rainMesh = new THREE.Points(this.rainGeometry, rainMat);
    this.rainMesh.visible = false;
    this.weatherGroup.add(this.rainMesh);

    // ----------------------------------------------------
    // 2. DENSE SMOKE & ASH PARTICLES (1,400 swirling flakes)
    // ----------------------------------------------------
    const ashRange = 80;
    const ashPositions = new Float32Array(this.ashCount * 3);
    const ashVelocities = new Float32Array(this.ashCount * 3);

    for (let i = 0; i < this.ashCount; i++) {
      ashPositions[i * 3] = (Math.random() - 0.5) * ashRange;
      ashPositions[i * 3 + 1] = Math.random() * 30;
      ashPositions[i * 3 + 2] = (Math.random() - 0.5) * ashRange;

      // Small random drift speeds
      ashVelocities[i * 3] = (Math.random() - 0.5) * 1.5;
      ashVelocities[i * 3 + 1] = -0.4 - Math.random() * 0.6;
      ashVelocities[i * 3 + 2] = (Math.random() - 0.5) * 1.5;
    }

    this.ashGeometry = new THREE.BufferGeometry();
    this.ashGeometry.setAttribute('position', new THREE.BufferAttribute(ashPositions, 3));
    this.ashVelocities = ashVelocities;

    const ashMat = new THREE.PointsMaterial({
      color: 0x94a3b8,
      size: 0.45,
      transparent: true,
      opacity: 0.6,
      blending: THREE.NormalBlending,
      depthWrite: false
    });

    this.ashMesh = new THREE.Points(this.ashGeometry, ashMat);
    this.ashMesh.visible = false;
    this.weatherGroup.add(this.ashMesh);

    // ----------------------------------------------------
    // 3. HIGH-WIND DUST & DEBRIS STREAKS (600 horizontal particles)
    // ----------------------------------------------------
    const debrisRange = 85;
    const debrisPositions = new Float32Array(this.windDebrisCount * 3);

    for (let i = 0; i < this.windDebrisCount; i++) {
      debrisPositions[i * 3] = (Math.random() - 0.5) * debrisRange;
      debrisPositions[i * 3 + 1] = 0.5 + Math.random() * 25;
      debrisPositions[i * 3 + 2] = (Math.random() - 0.5) * debrisRange;
    }

    this.windDebrisGeometry = new THREE.BufferGeometry();
    this.windDebrisGeometry.setAttribute('position', new THREE.BufferAttribute(debrisPositions, 3));

    const debrisMat = new THREE.PointsMaterial({
      color: 0xd97706,
      size: 0.28,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    this.windDebrisMesh = new THREE.Points(this.windDebrisGeometry, debrisMat);
    this.windDebrisMesh.visible = false;
    this.weatherGroup.add(this.windDebrisMesh);
  }

  setWeather(mode) {
    this.currentMode = mode;

    const hudBanner = document.getElementById('weather-hud-banner');
    const hudBannerText = document.getElementById('weather-hud-banner-text');

    // Reset default visibility
    this.rainMesh.visible = false;
    this.ashMesh.visible = false;
    this.windDebrisMesh.visible = false;
    this.lightningLight.intensity = 0;

    switch (mode) {
      case 'clear':
        if (this.scene.fog) {
          this.scene.fog.density = 0.012;
          this.scene.fog.color.setHex(0x060c1d);
        }
        this.windState.speedKmh = 4.8;
        this.windState.directionDeg = 295;
        this.windState.directionName = 'WNW';
        this.windState.turbulenceIntensity = 0.0;
        this.drone.setWindTurbulence(false, 0);

        if (hudBanner) hudBanner.style.display = 'none';
        break;

      case 'dense_fog':
        // Dramatic dense smoke & ash fog
        if (this.scene.fog) {
          this.scene.fog.density = 0.046; // Heavy occlusion
          this.scene.fog.color.setHex(0x272c35); // Smoky ash grey
        }
        this.ashMesh.visible = true;
        this.windState.speedKmh = 9.2;
        this.windState.directionDeg = 240;
        this.windState.directionName = 'WSW';
        this.windState.turbulenceIntensity = 0.15;
        this.drone.setWindTurbulence(true, 0.15);

        if (hudBanner && hudBannerText) {
          hudBannerText.innerHTML = '⚠️ <strong>DENSE SMOKE FOG ACTIVE</strong> &bull; Optical visibility degraded to 18% &bull; Switch to <strong>FLIR Thermal IR</strong> or <strong>3D LiDAR SLAM</strong>';
          hudBanner.style.display = 'flex';
          hudBanner.className = 'weather-hud-banner fog-alert';
        }
        break;

      case 'rain_storm':
        // Monsoon downpour & storm atmosphere
        if (this.scene.fog) {
          this.scene.fog.density = 0.024;
          this.scene.fog.color.setHex(0x131e33);
        }
        this.rainMesh.visible = true;
        this.windState.speedKmh = 32.4;
        this.windState.directionDeg = 190;
        this.windState.directionName = 'SSW';
        this.windState.turbulenceIntensity = 0.45;
        this.drone.setWindTurbulence(true, 0.45);
        this.nextLightningInterval = 4.0 + Math.random() * 5.0;
        this.lightningTimer = 0;

        if (hudBanner && hudBannerText) {
          hudBannerText.innerHTML = '🌧️ <strong>SEVERE MONSOON STORM</strong> &bull; Heavy precipitation &bull; Rain streaks active &bull; Crosswind: 32 km/h';
          hudBanner.style.display = 'flex';
          hudBanner.className = 'weather-hud-banner storm-alert';
        }
        break;

      case 'high_wind':
        // Gale Force Wind & Severe Turbulence
        if (this.scene.fog) {
          this.scene.fog.density = 0.016;
          this.scene.fog.color.setHex(0x1c1917);
        }
        this.windDebrisMesh.visible = true;
        this.windState.speedKmh = 48.5;
        this.windState.directionDeg = 325;
        this.windState.directionName = 'NW';
        this.windState.turbulenceIntensity = 0.85; // High turbulence
        this.drone.setWindTurbulence(true, 0.85);

        if (hudBanner && hudBannerText) {
          hudBannerText.innerHTML = '💨 <strong>GALE FORCE TURBULENCE (48.5 km/h)</strong> &bull; Autonomous flight controller applying high-torque motor trim';
          hudBanner.style.display = 'flex';
          hudBanner.className = 'weather-hud-banner wind-alert';
        }
        break;
    }

    this.updateTelemetryUI();
  }

  update(delta, dronePos) {
    if (!dronePos) return;

    // Follow drone position so particle bounding volume wraps around active flight area
    this.weatherGroup.position.set(dronePos.x, 0, dronePos.z);

    // 1. Update Rain
    if (this.rainMesh.visible && this.rainGeometry) {
      const pos = this.rainGeometry.attributes.position.array;
      const range = 90;
      const windAngle = THREE.MathUtils.degToRad(this.windState.directionDeg);
      const windX = Math.sin(windAngle) * (this.windState.speedKmh * 0.28);
      const windZ = Math.cos(windAngle) * (this.windState.speedKmh * 0.28);

      for (let i = 0; i < this.rainCount; i++) {
        const idx = i * 3;
        pos[idx + 1] -= this.rainVelocities[i] * delta;
        pos[idx] += windX * delta;
        pos[idx + 2] += windZ * delta;

        // Reset if hitting ground
        if (pos[idx + 1] <= 0) {
          pos[idx + 1] = 40 + Math.random() * 10;
          pos[idx] = (Math.random() - 0.5) * range;
          pos[idx + 2] = (Math.random() - 0.5) * range;
        }
      }
      this.rainGeometry.attributes.position.needsUpdate = true;

      // Lightning Thunder logic
      this.updateLightning(delta);
    }

    // 2. Update Dense Smoke / Ash Flakes
    if (this.ashMesh.visible && this.ashGeometry) {
      const pos = this.ashGeometry.attributes.position.array;
      const range = 80;
      const time = Date.now() * 0.001;

      for (let i = 0; i < this.ashCount; i++) {
        const idx = i * 3;
        pos[idx] += (this.ashVelocities[idx] + Math.sin(time + i) * 0.4) * delta;
        pos[idx + 1] += this.ashVelocities[idx + 1] * delta;
        pos[idx + 2] += (this.ashVelocities[idx + 2] + Math.cos(time + i) * 0.4) * delta;

        if (pos[idx + 1] <= 0) {
          pos[idx + 1] = 25 + Math.random() * 8;
          pos[idx] = (Math.random() - 0.5) * range;
          pos[idx + 2] = (Math.random() - 0.5) * range;
        }
      }
      this.ashGeometry.attributes.position.needsUpdate = true;
    }

    // 3. Update High Wind Debris Streaks
    if (this.windDebrisMesh.visible && this.windDebrisGeometry) {
      const pos = this.windDebrisGeometry.attributes.position.array;
      const range = 85;
      const windSpeedMps = this.windState.speedKmh / 3.6;

      for (let i = 0; i < this.windDebrisCount; i++) {
        const idx = i * 3;
        // High speed horizontal drift
        pos[idx] += windSpeedMps * 1.4 * delta;
        pos[idx + 2] += Math.sin(i * 0.5) * 1.5 * delta;

        if (pos[idx] > range / 2) {
          pos[idx] = -range / 2;
          pos[idx + 1] = 0.5 + Math.random() * 22;
          pos[idx + 2] = (Math.random() - 0.5) * range;
        }
      }
      this.windDebrisGeometry.attributes.position.needsUpdate = true;
    }

    // Dynamic wind gust variations
    this.windState.gustTimer += delta;
    if (this.windState.gustTimer > 0.8) {
      this.windState.gustTimer = 0;
      if (this.currentMode === 'high_wind') {
        const gust = (Math.random() - 0.5) * 14;
        this.windState.gustFactor = Math.max(35, 48.5 + gust);
      } else if (this.currentMode === 'rain_storm') {
        const gust = (Math.random() - 0.5) * 8;
        this.windState.gustFactor = Math.max(22, 32.4 + gust);
      } else {
        this.windState.gustFactor = this.windState.speedKmh;
      }
      this.updateTelemetryUI();
    }
  }

  updateLightning(delta) {
    this.lightningTimer += delta;

    if (this.isFlashing) {
      // Fade lightning light rapidly
      this.lightningLight.intensity = Math.max(0, this.lightningLight.intensity - delta * 25);
      if (this.lightningLight.intensity <= 0.05) {
        this.lightningLight.intensity = 0;
        this.isFlashing = false;
        this.nextLightningInterval = 5.0 + Math.random() * 7.0;
        this.lightningTimer = 0;
      }
    } else if (this.lightningTimer >= this.nextLightningInterval) {
      // Trigger lightning strike!
      this.isFlashing = true;
      this.lightningLight.intensity = 4.5 + Math.random() * 2.0;

      // Play synthesized thunder rumble if audio is on
      this.playThunderAudio();
    }
  }

  playThunderAudio() {
    if (!this.gcs || this.gcs.isMuted || !this.gcs.audioContext) return;
    try {
      const ctx = this.gcs.audioContext;
      ctx.resume();

      // Low frequency rumble synthesis
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(55, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(32, ctx.currentTime + 1.2);

      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.3);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 1.3);
    } catch (e) {}
  }

  updateTelemetryUI() {
    const elCond = document.getElementById('val-weather-condition');
    const elSpeed = document.getElementById('val-wind-speed');
    const elDir = document.getElementById('val-wind-dir');
    const elVis = document.getElementById('val-visibility-pct');
    const elComp = document.getElementById('val-imu-comp');

    if (!elCond) return;

    switch (this.currentMode) {
      case 'clear':
        elCond.textContent = '☀️ CLEAR';
        elCond.style.color = '#38bdf8';
        if (elSpeed) elSpeed.textContent = `${this.windState.speedKmh.toFixed(1)} km/h`;
        if (elDir) elDir.textContent = `${this.windState.directionName} (${this.windState.directionDeg}°)`;
        if (elVis) {
          elVis.textContent = '100% (OPTIMAL)';
          elVis.style.color = '#10b981';
        }
        if (elComp) {
          elComp.textContent = 'NOMINAL';
          elComp.style.color = '#10b981';
        }
        break;

      case 'dense_fog':
        elCond.textContent = '🌫️ DENSE SMOKE FOG';
        elCond.style.color = '#fbbf24';
        if (elSpeed) elSpeed.textContent = `${this.windState.speedKmh.toFixed(1)} km/h`;
        if (elDir) elDir.textContent = `${this.windState.directionName} (${this.windState.directionDeg}°)`;
        if (elVis) {
          elVis.textContent = '18% (CRITICAL)';
          elVis.style.color = '#ff3344';
        }
        if (elComp) {
          elComp.textContent = 'LOW DRIFT (0.2m)';
          elComp.style.color = '#38bdf8';
        }
        break;

      case 'rain_storm':
        elCond.textContent = '🌧️ MONSOON STORM';
        elCond.style.color = '#60a5fa';
        if (elSpeed) elSpeed.textContent = `${this.windState.gustFactor.toFixed(1)} km/h (Gale)`;
        if (elDir) elDir.textContent = `${this.windState.directionName} (${this.windState.directionDeg}°)`;
        if (elVis) {
          elVis.textContent = '42% (DEGRADED)';
          elVis.style.color = '#fbbf24';
        }
        if (elComp) {
          elComp.textContent = 'ATTITUDE TRIM ±3.2°';
          elComp.style.color = '#fbbf24';
        }
        break;

      case 'high_wind':
        elCond.textContent = '💨 GALE TURBULENCE';
        elCond.style.color = '#f97316';
        if (elSpeed) elSpeed.textContent = `${this.windState.gustFactor.toFixed(1)} km/h (HIGH)`;
        if (elDir) elDir.textContent = `${this.windState.directionName} (${this.windState.directionDeg}°)`;
        if (elVis) {
          elVis.textContent = '78% (BLOWING DUST)';
          elVis.style.color = '#38bdf8';
        }
        if (elComp) {
          elComp.textContent = 'HIGH TORQUE TRIM ±5.8°';
          elComp.style.color = '#ff3344';
        }
        break;
    }
  }
}

window.WeatherSystem = WeatherSystem;
