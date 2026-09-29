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

  renderAIBoundingBoxes() {
    const container = document.getElementById('ai-detections-container');
    if (!container) return;

    // Only display 2D bounding boxes in FPV and Follow camera modes
    const isHUDVisible = (this.sensors.camera.position.distanceTo(this.drone.group.position) < 35);
    if (!isHUDVisible) {
      container.innerHTML = '';
      return;
    }

    let html = '';
    this.sensors.activeDetections.forEach(det => {
      const left = det.x - det.width / 2;
      const top = det.y - det.height / 2;

      html += `
        <div class="ai-bbox ${det.type}" style="left:${left}px; top:${top}px; width:${det.width}px; height:${det.height}px;">
          <div class="ai-label">
            <span>${det.label}</span>
          </div>
        </div>
      `;
    });

    container.innerHTML = html;
  }

  updateTriageTable() {
    const tbody = document.getElementById('triage-table-body');
    if (!tbody) return;

    let html = '';
    this.environment.survivors.forEach(s => {
      const statusBadge = s.detected 
        ? `<span class="triage-badge badge-${s.triage.toLowerCase()}">${s.triage}: ${s.id}</span>`
        : `<span style="color:#64748b; font-size:0.65rem;">SCANNING SECTOR...</span>`;

      const coords = s.detected
        ? `28.6139°N, 77.2090°E (X:${s.position.x.toFixed(0)}, Z:${s.position.z.toFixed(0)})`
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
      `[${now}] <span class="serial-line alert">[NPU_YOLOv8] #INFERENCE: 58.4ms | Detections: ${this.sensors.activeDetections.length} objects</span>`
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
        <td style="padding:6px; border:1px solid #334155; color:${s.triage === 'RED' ? '#ef4444' : '#f59e0b'}; font-weight:700;">${s.triage}</td>
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
              this.environment.currentScenario === 'flash_flood' ? 'Assam Brahmaputra Severe Inundation Sector Bravo-2' :
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
          <p><strong>RECOMMENDED EXTRACTION VECTOR:</strong> Ground squads must enter via Western Corridor Alpha (X:-35, Z:32) to circumvent toxic gas plume. First priority is SURV-01 (trapped under rubble void, core temp 37.1°C). Hazmat breathing apparatus required for proximity to sector center.</p>
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
  }
}

window.TacticalGcsDashboard = TacticalGcsDashboard;
