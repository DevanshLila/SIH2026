/**
 * AERORES-AI Tactical Ground Control Station (GCS) Dashboard & Analytics
 * Includes: Primary Flight Display (PFD), Telemetry, Victim Triage, Serial Stream & SITREP Generator
 * Team Pegasus - SIH 2026
 */

class TacticalGcsDashboard {
  constructor(drone, environment, sensors, navigator) {
    this.drone = drone;
    this.environment = environment;
    this.sensors = sensors;
    this.navigator = navigator;

    this.audioContext = null;
    this.droneOscillator = null;
    this.droneGain = null;
    this.isMuted = true;

    this.serialBuffer = [];
    this.missionStartTime = Date.now();
    this.medkitDropped = false;

    this.initAudio();
    this.bindEvents();
  }

  initAudio() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.audioContext = new AudioCtx();
    } catch (e) {
      console.warn('Web Audio not supported');
    }
  }

  startDroneAudio() {
    if (!this.audioContext || this.isMuted) return;
    if (this.droneOscillator) return;

    try {
      this.audioContext.resume();
      this.droneOscillator = this.audioContext.createOscillator();
      this.droneGain = this.audioContext.createGain();

      this.droneOscillator.type = 'sawtooth';
      this.droneOscillator.frequency.setValueAtTime(110, this.audioContext.currentTime);

      this.droneGain.gain.setValueAtTime(0.04, this.audioContext.currentTime);
      this.droneOscillator.connect(this.droneGain);
      this.droneGain.connect(this.audioContext.destination);

      this.droneOscillator.start();
    } catch (e) {}
  }

  stopDroneAudio() {
    if (this.droneOscillator) {
      try {
        this.droneOscillator.stop();
        this.droneOscillator.disconnect();
      } catch (e) {}
      this.droneOscillator = null;
    }
  }

  playAlarmBeep() {
    if (!this.audioContext || this.isMuted) return;
    try {
      this.audioContext.resume();
      const osc = this.audioContext.createOscillator();
      const gain = this.audioContext.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, this.audioContext.currentTime);
      gain.gain.setValueAtTime(0.12, this.audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + 0.3);
      osc.connect(gain);
      gain.connect(this.audioContext.destination);
      osc.start();
      osc.stop(this.audioContext.currentTime + 0.3);
    } catch (e) {}
  }

  toggleSound() {
    this.isMuted = !this.isMuted;
    const btn = document.getElementById('btn-sound-toggle');
    if (btn) {
      btn.innerHTML = this.isMuted ? '🔇 Audio Off' : '🔊 Audio On';
    }
    if (this.isMuted) {
      this.stopDroneAudio();
    } else {
      if (this.drone.telemetry.isFlying) this.startDroneAudio();
    }
    return !this.isMuted;
  }

  update(delta) {
    const t = this.drone.telemetry;

    // 1. Update Primary Flight Display (PFD)
    this.updatePFD(t);

    // 2. Update Avionics & Telemetry text
    this.updateAvionicsUI(t);

    // 3. Update AI Bounding Box Screen Overlays
    this.renderAIBoundingBoxes();

    // 4. Update Victim Triage Registry Table
    this.updateTriageTable();

    // 5. Update Serial Packet Console
    this.updateSerialStream();

    // 6. Audio pitch modulation based on motor throttle
    if (this.droneOscillator && !this.isMuted && this.audioContext) {
      const targetFreq = 100 + t.groundSpeed * 12 + (t.isFlying ? 35 : 0);
      this.droneOscillator.frequency.setTargetAtTime(targetFreq, this.audioContext.currentTime, 0.1);
    }
  }

  updatePFD(t) {
    // Artificial Horizon pitch and roll
    const horizon = document.getElementById('pfd-horizon');
    if (horizon) {
      const pitchOffset = Math.max(-25, Math.min(25, t.pitch * 1.5));
      horizon.style.transform = `rotate(${-t.roll}deg)`;
      horizon.style.backgroundPosition = `center ${50 + pitchOffset}%`;
    }

    // Compass heading ribbon
    const compass = document.getElementById('hud-compass-text');
    if (compass) {
      const deg = Math.round(t.heading);
      const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
      const dirName = dirs[Math.floor(((deg + 22.5) % 360) / 45)];
      compass.textContent = `HDG: ${deg}° ${dirName}`;
    }
  }

  updateAvionicsUI(t) {
    // Altitude
    const elAlt = document.getElementById('val-alt-agl');
    if (elAlt) elAlt.textContent = `${t.altitudeAGL.toFixed(1)} m`;

    const elAltBaro = document.getElementById('val-alt-baro');
    if (elAltBaro) elAltBaro.textContent = `${t.altitudeBaro.toFixed(1)} m`;

    // Speed
    const elSpeed = document.getElementById('val-speed');
    if (elSpeed) elSpeed.textContent = `${t.groundSpeed.toFixed(1)} m/s`;

    const elClimb = document.getElementById('val-climb');
    if (elClimb) elClimb.textContent = `${t.verticalSpeed.toFixed(1)} m/s`;

    // Battery
    const elBat = document.getElementById('val-bat-pct');
    if (elBat) elBat.textContent = `${t.batteryPercent.toFixed(0)}%`;

    const elBatVolt = document.getElementById('val-bat-volt');
    if (elBatVolt) elBatVolt.textContent = `${t.batteryVoltage.toFixed(1)} V`;

    const elBatBar = document.getElementById('bar-bat-fill');
    if (elBatBar) {
      elBatBar.style.width = `${Math.max(0, Math.min(100, t.batteryPercent))}%`;
      if (t.batteryPercent < 25) elBatBar.classList.add('warning');
      else elBatBar.classList.remove('warning');
    }

    // Gas Sensor
    const elGasPpm = document.getElementById('val-gas-ppm');
    if (elGasPpm) elGasPpm.textContent = `${this.sensors.gasReading.ppm} PPM`;

    const elGasType = document.getElementById('val-gas-type');
    if (elGasType) elGasType.textContent = this.sensors.gasReading.type;

    // Signal & GNSS
    const elRssi = document.getElementById('val-rssi');
    if (elRssi) elRssi.textContent = `${t.loraRssi} dBm`;

    const elSats = document.getElementById('val-sats');
    if (elSats) elSats.textContent = `${t.satellites} Locked`;

    // Footer stats
    const elMissionTime = document.getElementById('footer-mission-time');
    if (elMissionTime) {
      const elapsedSec = Math.floor((Date.now() - this.missionStartTime) / 1000);
      const mins = Math.floor(elapsedSec / 60).toString().padStart(2, '0');
      const secs = (elapsedSec % 60).toString().padStart(2, '0');
      elMissionTime.textContent = `${mins}:${secs}`;
    }

    const elArea = document.getElementById('footer-area-scanned');
    if (elArea) {
      elArea.textContent = `${Math.floor(this.navigator.searchAreaCoveredSqM)} m²`;
    }

    const elSurvivorsCount = document.getElementById('footer-survivors-count');
    if (elSurvivorsCount) {
      const detected = this.environment.survivors.filter(s => s.detected).length;
      elSurvivorsCount.textContent = `${detected} / ${this.environment.survivors.length}`;
    }
  }

  updateUAVReticle(uavScreen) {
    const reticle = document.getElementById('uav-screen-reticle');
    if (!reticle) return;

    const isFpv = (this.sensors.cameraMode === 'FPV');
    if (isFpv || !uavScreen || !uavScreen.visible) {
      reticle.style.display = 'none';
      return;
    }

    reticle.style.display = 'block';
    reticle.style.left = `${uavScreen.x.toFixed(1)}px`;
    reticle.style.top = `${uavScreen.y.toFixed(1)}px`;

    const tagText = document.getElementById('uav-tag-text');
    if (tagText) {
      const altM = Math.max(0, this.drone.position.y - this.drone.groundElevation);
      tagText.textContent = `UAV-1 // ${altM.toFixed(1)}m`;
    }
  }

  renderAIBoundingBoxes() {
    const container = document.getElementById('ai-detections-container');
    if (!container) return;

    if (!this.aiLabelsListenerBound) {
      container.addEventListener('click', (e) => {
        const lbl = e.target.closest('.ai-label');
        if (lbl) {
          lbl.classList.toggle('expanded');
        }
      });
      this.aiLabelsListenerBound = true;
    }

    const screenW = container.clientWidth || window.innerWidth;
    const screenH = container.clientHeight || window.innerHeight;

    // Get UAV screen position for repulsion and dedicated overlay
    const uavScreen = this.sensors.toScreenPosition(this.drone.position);
    this.updateUAVReticle(uavScreen);

    if (!this.sensors.activeDetections || this.sensors.activeDetections.length === 0) {
      container.innerHTML = '';
      return;
    }

    // 1. Establish Strict Exclusion Zones (UAV, Crosshair, Panels, HUD edges)
    const placedBoxes = [];

    // UAV Strict Exclusion Zone (Guarantees drone is NEVER covered)
    if (uavScreen && uavScreen.visible) {
      placedBoxes.push({
        x1: uavScreen.x - 65,
        y1: uavScreen.y - 50,
        x2: uavScreen.x + 65,
        y2: uavScreen.y + 50,
        isUav: true
      });
    }

    // Center Crosshair Exclusion Zone
    placedBoxes.push({
      x1: screenW * 0.5 - 38,
      y1: screenH * 0.5 - 38,
      x2: screenW * 0.5 + 38,
      y2: screenH * 0.5 + 38,
      isCrosshair: true
    });

    // Top Navigation & Weather HUD Bar
    placedBoxes.push({
      x1: 0,
      y1: 0,
      x2: screenW,
      y2: 48
    });

    // Bottom Action / Flight Mode Bar
    placedBoxes.push({
      x1: 0,
      y1: screenH - 52,
      x2: screenW,
      y2: screenH
    });

    // Secondary Camera Inset (PIP Window)
    placedBoxes.push({
      x1: 0,
      y1: screenH - 165,
      x2: 195,
      y2: screenH
    });

    // Top-Right LiDAR Status Panel (if in LiDAR mode)
    if (this.sensors.sensorMode === 'LIDAR') {
      placedBoxes.push({
        x1: screenW - 250,
        y1: 45,
        x2: screenW,
        y2: 360
      });
    }

    // 2D box overlap test with margin
    const overlaps = (b1, b2, margin = 4) => {
      return !(
        b1.x2 + margin <= b2.x1 ||
        b1.x1 - margin >= b2.x2 ||
        b1.y2 + margin <= b2.y1 ||
        b1.y1 - margin >= b2.y2
      );
    };

    const isAreaClear = (box) => {
      if (box.x1 < 4 || box.x2 > screenW - 4 || box.y1 < 4 || box.y2 > screenH - 4) {
        return false;
      }
      for (let i = 0; i < placedBoxes.length; i++) {
        if (overlaps(box, placedBoxes[i], 3)) {
          return false;
        }
      }
      return true;
    };

    // 2. Prioritize Detections (Requirement 4 & 8)
    const scoredDetections = this.sensors.activeDetections.map(det => {
      let pWeight = 20;
      if (det.type === 'survivor') {
        pWeight = det.triage === 'RED' ? 100 : (det.triage === 'YELLOW' ? 90 : 80);
      } else if (det.type === 'fire' || det.type === 'gas') {
        pWeight = 85;
      } else if (det.type === 'structural' || det.type === 'unstable') {
        pWeight = 65;
      } else if (det.type === 'obstacle' || det.type === 'void' || det.type === 'road_fracture') {
        pWeight = 50;
      }

      const dist = (det.data && det.data.position) ? this.drone.position.distanceTo(det.data.position) : 30;
      const score = pWeight - (dist * 0.45);
      return { det, dist, score };
    });

    scoredDetections.sort((a, b) => b.score - a.score);

    let html = '';
    let svgConnectors = '';

    scoredDetections.forEach((item, index) => {
      const { det, dist } = item;
      const left = det.x - det.width / 2;
      const top = det.y - det.height / 2;
      const cx = det.x;
      const cy = det.y;
      const bw = det.width;
      const bh = det.height;

      // Determine LOD Tier based on priority rank and distance
      let lod = 'standard';
      let estW = 168;
      let estH = 48;

      if (dist > 75 || index >= 10) {
        lod = 'micro';
        estW = 85;
        estH = 18;
      } else if (dist > 45 || index >= 5) {
        lod = 'mini';
        estW = 128;
        estH = 26;
      }

      // Generate Candidate Placement Slots relative to bounding box
      const pad = 6;
      const candidateSlots = [
        // Slot 0: Above bbox
        { x1: cx - estW / 2, y1: cy - bh / 2 - estH - pad, x2: cx + estW / 2, y2: cy - bh / 2 - pad },
        // Slot 1: Below bbox
        { x1: cx - estW / 2, y1: cy + bh / 2 + pad, x2: cx + estW / 2, y2: cy + bh / 2 + estH + pad },
        // Slot 2: Right of bbox
        { x1: cx + bw / 2 + pad, y1: cy - estH / 2, x2: cx + bw / 2 + estW + pad, y2: cy + estH / 2 },
        // Slot 3: Left of bbox
        { x1: cx - bw / 2 - estW - pad, y1: cy - estH / 2, x2: cx - bw / 2 - pad, y2: cy + estH / 2 },
        // Slot 4: Top-Right
        { x1: cx + bw / 2 + pad, y1: cy - bh / 2 - estH - pad, x2: cx + bw / 2 + estW + pad, y2: cy - bh / 2 - pad },
        // Slot 5: Top-Left
        { x1: cx - bw / 2 - estW - pad, y1: cy - bh / 2 - estH - pad, x2: cx - bw / 2 - pad, y2: cy - bh / 2 - pad },
        // Slot 6: Bottom-Right
        { x1: cx + bw / 2 + pad, y1: cy + bh / 2 + pad, x2: cx + bw / 2 + estW + pad, y2: cy + bh / 2 + estH + pad },
        // Slot 7: Bottom-Left
        { x1: cx - bw / 2 - estW - pad, y1: cy + bh / 2 + pad, x2: cx - bw / 2 - pad, y2: cy + bh / 2 + estH + pad }
      ];

      let chosenBox = null;
      for (let s = 0; s < candidateSlots.length; s++) {
        if (isAreaClear(candidateSlots[s])) {
          chosenBox = candidateSlots[s];
          break;
        }
      }

      // If all 8 standard slots are occupied, search radially outward
      if (!chosenBox) {
        const radii = [bh / 2 + 35, bh / 2 + 65, bh / 2 + 95, bh / 2 + 130];
        const angles = [
          Math.PI * 0.25, Math.PI * 0.75, -Math.PI * 0.25, -Math.PI * 0.75,
          0, Math.PI * 0.5, Math.PI, -Math.PI * 0.5,
          Math.PI * 0.125, Math.PI * 0.375, Math.PI * 0.625, Math.PI * 0.875
        ];
        for (let r = 0; r < radii.length && !chosenBox; r++) {
          for (let a = 0; a < angles.length; a++) {
            const rad = radii[r];
            const ang = angles[a];
            const testX = cx + rad * Math.cos(ang) - estW / 2;
            const testY = cy + rad * Math.sin(ang) - estH / 2;
            const testBox = { x1: testX, y1: testY, x2: testX + estW, y2: testY + estH };
            if (isAreaClear(testBox)) {
              chosenBox = testBox;
              break;
            }
          }
        }
      }

      // If still no space, demote to mini, then micro to prevent screen overlap
      if (!chosenBox && lod === 'standard') {
        lod = 'mini';
        estW = 128;
        estH = 26;
        for (let s = 0; s < candidateSlots.length; s++) {
          const slot = { x1: candidateSlots[s].x1, y1: candidateSlots[s].y1, x2: candidateSlots[s].x1 + estW, y2: candidateSlots[s].y1 + estH };
          if (isAreaClear(slot)) {
            chosenBox = slot;
            break;
          }
        }
      }

      if (!chosenBox && lod !== 'micro') {
        lod = 'micro';
        estW = 85;
        estH = 18;
        for (let s = 0; s < candidateSlots.length; s++) {
          const slot = { x1: candidateSlots[s].x1, y1: candidateSlots[s].y1, x2: candidateSlots[s].x1 + estW, y2: candidateSlots[s].y1 + estH };
          if (isAreaClear(slot)) {
            chosenBox = slot;
            break;
          }
        }
      }

      const triageClass = det.triage ? det.triage.toLowerCase() : 'yellow';
      const obstructedClass = det.isObstructed ? 'obstructed' : '';
      const acquiringClass = det.isAcquiring ? 'acquiring-lock' : '';
      const thermalIcon = det.isObstructed ? '<span class="ai-thermal-indicator" title="Thermal Hotspot Detected">🔥</span>' : '';
      const lockBanner = det.isAcquiring ? '<span class="ai-lock-reticle mono">[LOCK]</span>' : '';

      // Leader connector line if shifted away from anchor reticle
      if (chosenBox) {
        placedBoxes.push(chosenBox);
        const placedX = chosenBox.x1;
        const placedY = chosenBox.y1;
        const offsetLeft = placedX - left;
        const offsetTop = placedY - top;

        const labelCenterX = placedX + estW / 2;
        const labelCenterY = placedY + estH / 2;
        const distFromAnchor = Math.hypot(labelCenterX - cx, labelCenterY - cy);

        if (distFromAnchor > 18) {
          const targetX = Math.max(placedX, Math.min(placedX + estW, cx));
          const targetY = Math.max(placedY, Math.min(placedY + estH, cy));
          const anchorX = Math.max(left, Math.min(left + bw, targetX));
          const anchorY = Math.max(top, Math.min(top + bh, targetY));

          let lineColor = '#00f0ff';
          if (det.type === 'survivor') {
            lineColor = det.triage === 'RED' ? '#ef4444' : (det.triage === 'YELLOW' ? '#f59e0b' : '#10b981');
          } else if (det.type === 'fire') {
            lineColor = '#f97316';
          } else if (det.type === 'gas') {
            lineColor = '#a855f7';
          } else if (det.type === 'structural' || det.type === 'unstable') {
            lineColor = '#f59e0b';
          } else if (det.type === 'void') {
            lineColor = '#c084fc';
          }

          svgConnectors += `
            <line x1="${anchorX.toFixed(1)}" y1="${anchorY.toFixed(1)}" x2="${targetX.toFixed(1)}" y2="${targetY.toFixed(1)}" stroke="${lineColor}" stroke-width="1.2" stroke-dasharray="3,2" opacity="0.45" />
            <circle cx="${anchorX.toFixed(1)}" cy="${anchorY.toFixed(1)}" r="1.5" fill="${lineColor}" opacity="0.75" />
          `;
        }

        // Render Bounding Box and decoupled Label with relative offset
        html += `
          <div class="ai-bbox ${det.type} ${obstructedClass} ${acquiringClass}" style="left:${left.toFixed(1)}px; top:${top.toFixed(1)}px; width:${bw.toFixed(1)}px; height:${bh.toFixed(1)}px;">
            <div class="ai-bbox-corner top-left"></div>
            <div class="ai-bbox-corner top-right"></div>
            <div class="ai-bbox-corner bottom-left"></div>
            <div class="ai-bbox-corner bottom-right"></div>
            <div class="ai-label ${det.type} ${lod}" style="left:${offsetLeft.toFixed(1)}px; top:${offsetTop.toFixed(1)}px;" data-id="${det.id}" title="Click to toggle full info">
              <div class="ai-label-title">
                <span class="ai-status-dot ${triageClass}"></span>
                <span class="ai-label-code">${det.label}</span>
                ${lockBanner}
                ${thermalIcon}
              </div>
              ${det.stateLabel && lod === 'standard' ? `<div class="ai-label-state">${det.stateLabel}</div>` : ''}
              ${det.lidarFusion && lod !== 'micro' ? `<div class="ai-label-lidar-fusion">${det.lidarFusion}</div>` : ''}
              ${det.sublabel && lod === 'standard' ? `<span class="ai-label-sub">${det.sublabel}</span>` : ''}
            </div>
          </div>
        `;
      } else {
        // Marker only (reticle corners on object without dialog to keep screen clear)
        html += `
          <div class="ai-bbox ${det.type} ${obstructedClass} ${acquiringClass}" style="left:${left.toFixed(1)}px; top:${top.toFixed(1)}px; width:${bw.toFixed(1)}px; height:${bh.toFixed(1)}px;">
            <div class="ai-bbox-corner top-left"></div>
            <div class="ai-bbox-corner top-right"></div>
            <div class="ai-bbox-corner bottom-left"></div>
            <div class="ai-bbox-corner bottom-right"></div>
          </div>
        `;
      }
    });

    container.innerHTML = `
      <svg class="ai-connectors-svg" style="position:absolute; top:0; left:0; width:100%; height:100%; pointer-events:none; z-index:9;">
        ${svgConnectors}
      </svg>
      ${html}
    `;
  }

  updateTriageTable() {
    const tbody = document.getElementById('triage-table-body');
    if (!tbody) return;

    let html = '';
    this.environment.survivors.forEach(s => {
      const statusBadge = s.detected 
        ? `<span class="triage-badge badge-${s.triage.toLowerCase()}">${s.triage}: ${s.id}</span>`
        : `<span style="color:#64748b; font-size:0.65rem;">SCANNING SECTOR...</span>`;

      let latBase = 28.6139;
      let lonBase = 77.2090;
      let sectorName = 'Urban Ruin Alpha-4';
      if (this.environment.currentScenario === 'flash_flood') {
        latBase = 26.2006;
        lonBase = 92.9376;
        sectorName = 'FLOOD / TSUNAMI Sector';
      } else if (this.environment.currentScenario === 'chemical_fire') {
        latBase = 22.3072;
        lonBase = 73.1812;
        sectorName = 'Industrial Corridor';
      }

      const coords = s.detected
        ? `${latBase.toFixed(4)}°N, ${lonBase.toFixed(4)}°E (${sectorName} X:${s.position.x.toFixed(0)}, Z:${s.position.z.toFixed(0)})`
        : `---`;

      const actionBtn = s.detected
        ? `<button class="btn-tactical" onclick="window.gcs.dispatchSquad('${s.id}')" style="padding:2px 6px; font-size:0.65rem;">🚨 Dispatch</button>`
        : `<span style="color:#475569;">--</span>`;

      html += `
        <tr>
          <td>${statusBadge}</td>
          <td>${s.detected ? s.name : 'Unknown Target'}</td>
          <td class="mono">${s.detected ? s.temperature + '°C' : '--'}</td>
          <td class="mono" style="font-size:0.65rem;">${coords}</td>
          <td>${actionBtn}</td>
        </tr>
      `;
    });

    tbody.innerHTML = html;
  }

  updateSerialStream() {
    const consoleEl = document.getElementById('serial-console-logs');
    if (!consoleEl) return;

    if (Math.random() > 0.35) return; // Rate throttle log emission

    const t = this.drone.telemetry;
    const now = new Date().toTimeString().split(' ')[0];

    const samplePackets = [
      `[${now}] <span class="serial-line rx">[MAVLINK_RAW] #ATT: roll=${t.roll.toFixed(1)} pitch=${t.pitch.toFixed(1)} yaw=${t.yaw.toFixed(1)}</span>`,
      `[${now}] <span class="serial-line">[ARDUINO_MEGA:2560] #IMU_FUSION: ax=${(t.verticalSpeed).toFixed(2)} gz=0.04 temp=31.2C</span>`,
      `[${now}] <span class="serial-line rx">[MQ_GAS_SENSOR] #CH4: ${this.sensors.gasReading.ppm} ppm status=${this.sensors.gasReading.status}</span>`,
      `[${now}] <span class="serial-line">[UWB_DWM1000] #RANGING: [A1:${t.uwbDistance[0]}m A2:${t.uwbDistance[1]}m A3:${t.uwbDistance[2]}m A4:${t.uwbDistance[3]}m]</span>`,
      `[${now}] <span class="serial-line alert">[NPU_YOLOv8] #INFERENCE: 58.4ms | Detections: ${this.sensors.activeDetections.length} objects</span>`,
      `[${now}] <span class="serial-line rx">[HYDRO_SONAR] #FLOOD_STAGE: 1.48m MSL flow=2.1m/s silt_turbidity=88NTU</span>`,
      `[${now}] <span class="serial-line alert">[NDRF_SAR] #RESCUE_ACTIVE: ${this.environment.survivors.filter(s => s.detected).length}/${this.environment.survivors.length} located | Ingress boats dispatched</span>`
    ];

    const pick = samplePackets[Math.floor(Math.random() * samplePackets.length)];
    this.serialBuffer.push(pick);
    if (this.serialBuffer.length > 35) this.serialBuffer.shift();

    consoleEl.innerHTML = this.serialBuffer.join('<br>');
    consoleEl.scrollTop = consoleEl.scrollHeight;
  }

  dispatchSquad(survivorId) {
    alert(`[NDRF DISPATCH]: Quick Reaction Team (QRT-1) assigned to ${survivorId}. Safe Ingress Route broadcasted to responder tactical radios.`);
  }

  dropPayload() {
    this.medkitDropped = true;
    alert('[PAYLOAD DEPLOYED]: High-impact Medical Kit, Rations & LoRa Emergency Beacon successfully dropped over designated coordinates.');
  }

  generateSITREPModal() {
    const modal = document.getElementById('sitrep-modal');
    if (!modal) return;

    const detectedCount = this.environment.survivors.filter(s => s.detected).length;
    const timeStr = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

    let survivorRows = this.environment.survivors.map(s => `
      <tr>
        <td style="padding:6px; border:1px solid #334155;"><strong>${s.id}</strong></td>
        <td style="padding:6px; border:1px solid #334155; color:${s.triage === 'RED' ? '#ef4444' : (s.triage === 'GREEN' ? '#10b981' : '#f59e0b')}; font-weight:700;">${s.triage}</td>
        <td style="padding:6px; border:1px solid #334155;">${s.name}</td>
        <td style="padding:6px; border:1px solid #334155;">${s.temperature}°C (FLIR)</td>
        <td style="padding:6px; border:1px solid #334155;">${s.vitals}</td>
        <td style="padding:6px; border:1px solid #334155;">${s.gasExposure}</td>
      </tr>
    `).join('');

    const content = `
      <div style="font-family:'Inter',sans-serif; color:#f1f5f9; line-height:1.5;">
        <div style="text-align:center; border-bottom:2px solid #0284c7; padding-bottom:12px; margin-bottom:16px;">
          <h2 style="font-family:'Chakra Petch',sans-serif; color:#38bdf8; margin:0; font-size:1.35rem;">
            NATIONAL DISASTER RESPONSE FORCE (NDRF) / SDRF
          </h2>
          <h4 style="margin:4px 0; color:#94a3b8; font-size:0.85rem;">
            AERORES-AI AUTONOMOUS DRONE SEARCH & RESCUE SITUATIONAL REPORT (SITREP #04)
          </h4>
          <p style="margin:2px 0; font-size:0.75rem; color:#64748b;">
            MISSION: SIH-2026 QUALCOMM PS-26177 | UNIT: TEAM PEGASUS UAV | TIMESTAMP: ${timeStr}
          </p>
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:16px; font-size:0.8rem;">
          <div style="background:#1e293b; padding:10px; border-radius:6px;">
            <p><strong>Disaster Zone:</strong> ${
              this.environment.currentScenario === 'earthquake' ? 'Post-Earthquake Urban Collapse Zone Alpha-4' :
              this.environment.currentScenario === 'flash_flood' ? 'FLOOD / TSUNAMI Inundation Sector Bravo-2' :
              'Industrial Chemical Complex & Gas Blast Charlie-1'
            }</p>
            <p><strong>UAV Flight Mode:</strong> Multi-Sensor Autonomous SLAM & Gas Localization</p>
            <p><strong>Area Scanned:</strong> ${Math.floor(this.navigator.searchAreaCoveredSqM)} m²</p>
            <p><strong>Navigation Reliability:</strong> GNSS + UWB Trilateration (GPS-Denied Ready)</p>
          </div>
          <div style="background:#1e293b; padding:10px; border-radius:6px;">
            <p><strong>Total Victims Located:</strong> <span style="color:#38bdf8; font-weight:700;">${detectedCount} / ${this.environment.survivors.length}</span></p>
            <p><strong>Hazard Identification:</strong> ${this.sensors.gasReading.type} (${this.sensors.gasReading.ppm} PPM)</p>
            <p><strong>Gas Leak Threat Level:</strong> <span style="color:${this.sensors.gasReading.ppm > 300 ? '#ef4444' : '#10b981'}; font-weight:700;">${this.sensors.gasReading.status}</span></p>
            <p><strong>UAV Battery Reserve:</strong> ${this.drone.telemetry.batteryPercent.toFixed(1)}% (${this.drone.telemetry.batteryVoltage.toFixed(1)}V)</p>
          </div>
        </div>

        <h4 style="color:#38bdf8; margin-bottom:8px; font-size:0.9rem;">1. VICTIM TRIAGE & LOCALIZATION LOG (NDRF START PROTOCOL)</h4>
        <table style="width:100%; border-collapse:collapse; font-size:0.75rem; margin-bottom:16px;">
          <thead>
            <tr style="background:#0f172a; color:#94a3b8; text-align:left;">
              <th style="padding:6px; border:1px solid #334155;">ID</th>
              <th style="padding:6px; border:1px solid #334155;">Triage</th>
              <th style="padding:6px; border:1px solid #334155;">Classification</th>
              <th style="padding:6px; border:1px solid #334155;">Thermal IR</th>
              <th style="padding:6px; border:1px solid #334155;">Field Vitals</th>
              <th style="padding:6px; border:1px solid #334155;">Toxic Gas Risk</th>
            </tr>
          </thead>
          <tbody>
            ${survivorRows}
          </tbody>
        </table>

        <h4 style="color:#38bdf8; margin-bottom:8px; font-size:0.9rem;">2. INCIDENT COMMANDER TACTICAL DIRECTIVE</h4>
        <div style="background:#0f2537; border-left:4px solid #00f0ff; padding:10px; font-size:0.78rem; border-radius:4px;">
          <p><strong>RECOMMENDED EXTRACTION VECTOR:</strong> ${
            this.environment.currentScenario === 'flash_flood'
              ? 'NDRF motorized inflatable rescue boats (IRB) and SDRF disaster squads to ingress via elevated road embankment and western river channel. Priority evacuation for rooftop family (SURV-FL-01) and stranded raft victim (SURV-FL-02). Life jackets and hypothermia blankets required.'
              : this.environment.currentScenario === 'earthquake'
                ? 'NDRF search and rescue squads to ingress via South-East Boulevard (X:0, Z:30) avoiding central seismic fault scarp and downed power conduits. Structural shoring gear and heavy pneumatic lifters required for pancaked ruins and voids.'
                : 'Ground squads must enter via Western Corridor Alpha (X:-35, Z:32) to circumvent toxic gas plume. First priority is critical RED triage casualties with FLIR core temp >37°C. Hazmat breathing apparatus required if gas level >150 PPM.'
          }</p>
        </div>

        <div style="margin-top:16px; display:flex; justify-content:flex-end; gap:8px;">
          <button class="btn-tactical btn-primary" onclick="window.print()">🖨️ Print / Save Official PDF</button>
          <button class="btn-tactical" onclick="document.getElementById('sitrep-modal').classList.remove('active')">Close</button>
        </div>
      </div>
    `;

    document.getElementById('sitrep-modal-content').innerHTML = content;
    modal.classList.add('active');
  }

  bindEvents() {
    // Sound button
    const btnSound = document.getElementById('btn-sound-toggle');
    if (btnSound) {
      btnSound.addEventListener('click', () => this.toggleSound());
    }

    // SITREP button
    const btnSitrep = document.getElementById('btn-generate-sitrep');
    if (btnSitrep) {
      btnSitrep.addEventListener('click', () => this.generateSITREPModal());
    }

    // Payload button
    const btnPayload = document.getElementById('btn-drop-payload');
    if (btnPayload) {
      btnPayload.addEventListener('click', () => this.dropPayload());
    }

    // LiDAR Visualization Mode Buttons
    const lidarVisBtns = document.querySelectorAll('.lidar-vis-btn');
    lidarVisBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.vismode;
        if (this.sensors && typeof this.sensors.setLidarVisMode === 'function') {
          this.sensors.setLidarVisMode(mode);
        }
      });
    });
  }
}

window.TacticalGcsDashboard = TacticalGcsDashboard;
