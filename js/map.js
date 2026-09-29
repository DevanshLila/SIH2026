/**
 * AERORES-AI 2D Tactical GIS Disaster Map
 * Live Geo-Tagged Tracking, Survivor Triage Pins, Hazard Zones & Safe Egress Routing
 * Interactive Click-and-Drag Manual GPS Search Area Allotment (Archimedean Spiral)
 * Team Pegasus - SIH 2026
 */

class TacticalGisMap {
  constructor(canvasId, drone, environment, navigator) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.drone = drone;
    this.environment = environment;
    this.navigator = navigator;

    this.trail = [];
    this.maxTrailPoints = 120;
    this.mapCenter = { x: 0, z: 0 };
    this.scale = 3.2; // pixels per meter

    // Interactive Drag State for Manual Area Allotment
    this.isDragging = false;
    this.dragStartScreen = null;
    this.dragCurrentScreen = null;
    this.dragStartWorld = null;
    this.dragCurrentWorld = null;
    this.dragRadiusMeters = 0;

    this.initCanvasSize();
    window.addEventListener('resize', () => this.initCanvasSize());

    this.initInteractiveHandlers();
  }

  initCanvasSize() {
    if (!this.canvas) return;
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.canvas.width = rect.width || 380;
    this.canvas.height = rect.height || 280;
  }

  initInteractiveHandlers() {
    if (!this.canvas) return;

    this.canvas.style.cursor = 'crosshair';
    this.canvas.title = 'Click & drag anywhere on map to allot custom circular search zone to UAV';

    const getPos = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      return {
        sx: e.clientX - rect.left,
        sy: e.clientY - rect.top
      };
    };

    // Mouse Down: Start center of search circle
    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return; // Left click only
      const { sx, sy } = getPos(e);
      this.isDragging = true;
      this.dragStartScreen = { x: sx, y: sy };
      this.dragCurrentScreen = { x: sx, y: sy };
      this.dragStartWorld = this.screenToWorld(sx, sy);
      this.dragCurrentWorld = this.screenToWorld(sx, sy);
      this.dragRadiusMeters = 0;
    });

    // Window Mouse Move: Compute live radius in meters
    window.addEventListener('mousemove', (e) => {
      if (!this.isDragging || !this.dragStartWorld) return;
      const rect = this.canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;

      this.dragCurrentScreen = { x: sx, y: sy };
      this.dragCurrentWorld = this.screenToWorld(sx, sy);

      const dx = this.dragCurrentWorld.x - this.dragStartWorld.x;
      const dz = this.dragCurrentWorld.z - this.dragStartWorld.z;
      const distMeters = Math.hypot(dx, dz);

      // Clamp radius between 12m and 60m for safe UAV search bounds
      this.dragRadiusMeters = Math.max(12, Math.min(60, distMeters));
    });

    // Window Mouse Up: Commit custom allotted circular GPS search sector
    window.addEventListener('mouseup', (e) => {
      if (!this.isDragging || !this.dragStartWorld) return;
      this.isDragging = false;

      const centerWorld = this.dragStartWorld;
      let radius = this.dragRadiusMeters;

      // Handle simple click without dragging (short distance < 6px)
      const screenDist = Math.hypot(
        this.dragCurrentScreen.x - this.dragStartScreen.x,
        this.dragCurrentScreen.y - this.dragStartScreen.y
      );
      if (screenDist < 6 || radius < 10) {
        radius = 32.0; // Default standard 32m radius circle
      }

      const centerGps = this.navigator.meterOffsetToGps(centerWorld.x, centerWorld.z);

      // Feed custom allotted circular GPS search sector to autonomous navigator
      this.navigator.feedCircularGpsTargetArea({
        centerLat: centerGps.lat,
        centerLng: centerGps.lng,
        radiusMeters: radius,
        altitude: 14.0,
        sectorName: `MANUAL ALLOTTED (${radius.toFixed(0)}m R &bull; ${centerGps.lat.toFixed(4)}°N)`
      });

      this.dragStartScreen = null;
      this.dragCurrentScreen = null;
      this.dragStartWorld = null;
      this.dragCurrentWorld = null;
    });

    // Touch Support for Tablets / Mobile Tactical Stations
    this.canvas.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) return;
      const touch = e.touches[0];
      const rect = this.canvas.getBoundingClientRect();
      const sx = touch.clientX - rect.left;
      const sy = touch.clientY - rect.top;
      this.isDragging = true;
      this.dragStartScreen = { x: sx, y: sy };
      this.dragCurrentScreen = { x: sx, y: sy };
      this.dragStartWorld = this.screenToWorld(sx, sy);
      this.dragCurrentWorld = this.screenToWorld(sx, sy);
      this.dragRadiusMeters = 0;
    }, { passive: false });

    window.addEventListener('touchmove', (e) => {
      if (!this.isDragging || e.touches.length !== 1 || !this.dragStartWorld) return;
      const touch = e.touches[0];
      const rect = this.canvas.getBoundingClientRect();
      const sx = touch.clientX - rect.left;
      const sy = touch.clientY - rect.top;
      this.dragCurrentScreen = { x: sx, y: sy };
      this.dragCurrentWorld = this.screenToWorld(sx, sy);

      const dx = this.dragCurrentWorld.x - this.dragStartWorld.x;
      const dz = this.dragCurrentWorld.z - this.dragStartWorld.z;
      this.dragRadiusMeters = Math.max(12, Math.min(60, Math.hypot(dx, dz)));
    }, { passive: false });

    window.addEventListener('touchend', () => {
      if (!this.isDragging || !this.dragStartWorld) return;
      this.isDragging = false;
      let radius = this.dragRadiusMeters < 10 ? 32.0 : this.dragRadiusMeters;
      const centerGps = this.navigator.meterOffsetToGps(this.dragStartWorld.x, this.dragStartWorld.z);

      this.navigator.feedCircularGpsTargetArea({
        centerLat: centerGps.lat,
        centerLng: centerGps.lng,
        radiusMeters: radius,
        altitude: 14.0,
        sectorName: `MANUAL ALLOTTED (${radius.toFixed(0)}m R)`
      });

      this.dragStartScreen = null;
      this.dragCurrentScreen = null;
      this.dragStartWorld = null;
    });

    // Reset Allotted GPS Sector Button
    const btnReset = document.getElementById('btn-clear-gps-sector');
    if (btnReset) {
      btnReset.addEventListener('click', () => {
        this.navigator.circularSector = null;
        this.navigator.fedGpsSector = null;
        this.navigator.isCircularSearch = false;
        // Clear 3D holographic geofence
        while (this.navigator.geofenceGroup.children.length > 0) {
          const child = this.navigator.geofenceGroup.children[0];
          this.navigator.geofenceGroup.remove(child);
          if (child.geometry) child.geometry.dispose();
          if (child.material) child.material.dispose();
        }
        this.navigator.generateSpiralPath();
        this.navigator.navMode = 'SPIRAL';
        this.drone.telemetry.flightMode = 'AUTO: SPIRAL RECON';

        const toast = document.getElementById('tour-toast');
        const toastText = document.getElementById('tour-toast-text');
        if (toast && toastText) {
          toastText.innerHTML = `↺ <strong>GPS SECTOR RESET:</strong> Reverted to baseline mission grid.`;
          toast.style.display = 'flex';
          setTimeout(() => { if (toast) toast.style.display = 'none'; }, 3000);
        }
      });
    }
  }

  screenToWorld(sx, sy) {
    const cx = this.canvas.width / 2;
    const cy = this.canvas.height / 2;
    const wx = (sx - cx) / this.scale + this.mapCenter.x;
    const wz = (sy - cy) / this.scale + this.mapCenter.z;
    return { x: wx, z: wz };
  }

  worldToScreen(wx, wz) {
    const cx = this.canvas.width / 2;
    const cy = this.canvas.height / 2;
    const sx = cx + (wx - this.mapCenter.x) * this.scale;
    const sy = cy + (wz - this.mapCenter.z) * this.scale;
    return { x: sx, y: sy };
  }

  update(delta) {
    if (!this.canvas || !this.ctx) return;

    // Track drone breadcrumb trail
    const dronePos = this.drone.group.position;
    if (this.drone.telemetry.isFlying) {
      if (this.trail.length === 0 || this.drone.group.position.distanceTo(this.trail[this.trail.length - 1]) > 1.0) {
        this.trail.push(new THREE.Vector3().copy(dronePos));
        if (this.trail.length > this.maxTrailPoints) this.trail.shift();
      }
    }

    this.render();
  }

  render() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    // Clear background (Dark military tactical grid)
    ctx.fillStyle = '#050914';
    ctx.fillRect(0, 0, w, h);

    // Draw Tactical Grid Lines
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.08)';
    ctx.lineWidth = 1;
    const gridSize = 20 * this.scale;

    for (let x = (w / 2) % gridSize; x < w; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = (h / 2) % gridSize; y < h; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Draw Hazard Zones (Gas dispersion radius)
    if (this.environment.gasPlumeEmitter) {
      const gPos = this.environment.gasPlumeEmitter.position;
      const gScreen = this.worldToScreen(gPos.x, gPos.z);
      const gRadiusPx = this.environment.gasPlumeEmitter.radius * this.scale;

      // Pulsing gas danger circle
      ctx.fillStyle = 'rgba(168, 85, 247, 0.15)';
      ctx.beginPath();
      ctx.arc(gScreen.x, gScreen.y, gRadiusPx, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = 'rgba(168, 85, 247, 0.6)';
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(gScreen.x, gScreen.y, gRadiusPx, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // Gas Label
      ctx.fillStyle = '#c084fc';
      ctx.font = '9px "JetBrains Mono"';
      ctx.fillText(`☣ GAS ZONE [${this.environment.gasPlumeEmitter.type}]`, gScreen.x - 30, gScreen.y - gRadiusPx - 4);
    }

    // Draw Safe Ground Extraction Route for NDRF Rescue Squads
    this.drawSafeExtractionRoute();

    // 1. Draw Active ALLOTTED CIRCULAR GPS SEARCH AREA (Archimedean Spiral)
    if (this.navigator.circularSector && this.navigator.circularSector.isFed) {
      const sec = this.navigator.circularSector;
      const cScreen = this.worldToScreen(sec.centerX, sec.centerZ);
      const rPx = sec.radiusMeters * this.scale;

      // Radial glowing fill
      const grad = ctx.createRadialGradient(cScreen.x, cScreen.y, 0, cScreen.x, cScreen.y, rPx);
      grad.addColorStop(0, 'rgba(56, 189, 248, 0.22)');
      grad.addColorStop(0.75, 'rgba(56, 189, 248, 0.10)');
      grad.addColorStop(1, 'rgba(56, 189, 248, 0.02)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cScreen.x, cScreen.y, rPx, 0, Math.PI * 2);
      ctx.fill();

      // Glowing dashed perimeter ring
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2.0;
      ctx.setLineDash([6, 3]);
      ctx.beginPath();
      ctx.arc(cScreen.x, cScreen.y, rPx, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // Outer boundary aura
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.3)';
      ctx.lineWidth = 1.0;
      ctx.beginPath();
      ctx.arc(cScreen.x, cScreen.y, rPx + 3, 0, Math.PI * 2);
      ctx.stroke();

      // Center Anchor Pin & Crosshair
      ctx.fillStyle = '#00f0ff';
      ctx.beginPath();
      ctx.arc(cScreen.x, cScreen.y, 4, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#00f0ff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cScreen.x - 7, cScreen.y); ctx.lineTo(cScreen.x + 7, cScreen.y);
      ctx.moveTo(cScreen.x, cScreen.y - 7); ctx.lineTo(cScreen.x, cScreen.y + 7);
      ctx.stroke();

      // Radius line indicator (45 degrees)
      const radAngle = Math.PI / 4;
      const edgeX = cScreen.x + Math.cos(radAngle) * rPx;
      const edgeY = cScreen.y + Math.sin(radAngle) * rPx;
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.2;
      ctx.setLineDash([3, 2]);
      ctx.beginPath();
      ctx.moveTo(cScreen.x, cScreen.y);
      ctx.lineTo(edgeX, edgeY);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#7dd3fc';
      ctx.font = '8px "JetBrains Mono"';
      ctx.fillText(`R = ${sec.radiusMeters.toFixed(1)}m`, (cScreen.x + edgeX) / 2 + 4, (cScreen.y + edgeY) / 2 - 2);

      // Archimedean Spiral Flight Path Lines
      if (this.navigator.waypoints.length > 1) {
        ctx.strokeStyle = 'rgba(16, 185, 129, 0.65)';
        ctx.lineWidth = 1.4;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        const startWp = this.worldToScreen(this.navigator.waypoints[0].x, this.navigator.waypoints[0].z);
        ctx.moveTo(startWp.x, startWp.y);
        for (let w = 1; w < this.navigator.waypoints.length; w++) {
          const pt = this.worldToScreen(this.navigator.waypoints[w].x, this.navigator.waypoints[w].z);
          ctx.lineTo(pt.x, pt.y);
        }
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Title & Telemetry Header
      ctx.fillStyle = '#f1f5f9';
      ctx.font = 'bold 9px "JetBrains Mono"';
      ctx.fillText(`🎯 ALLOTTED AREA (${sec.radiusMeters.toFixed(0)}m R &bull; ${Math.round(Math.PI * sec.radiusMeters * sec.radiusMeters)} m²)`, cScreen.x - 65, cScreen.y - rPx - 8);
      ctx.fillStyle = '#38bdf8';
      ctx.font = '8px "JetBrains Mono"';
      ctx.fillText(`GPS: ${sec.centerLat.toFixed(5)}°N, ${sec.centerLng.toFixed(5)}°E &bull; SPIRAL`, cScreen.x - 65, cScreen.y - rPx + 3);
    }
    // 2. OR Draw Rectangular Fed GPS Sector (if fed via modal)
    else if (this.navigator.fedGpsSector && this.navigator.fedGpsSector.isFed) {
      const sec = this.navigator.fedGpsSector;
      const nw = this.worldToScreen(sec.minX, sec.minZ);
      const ne = this.worldToScreen(sec.maxX, sec.minZ);
      const se = this.worldToScreen(sec.maxX, sec.maxZ);
      const sw = this.worldToScreen(sec.minX, sec.maxZ);

      // Shaded Target Search Zone
      ctx.fillStyle = 'rgba(56, 189, 248, 0.14)';
      ctx.beginPath();
      ctx.moveTo(nw.x, nw.y);
      ctx.lineTo(ne.x, ne.y);
      ctx.lineTo(se.x, se.y);
      ctx.lineTo(sw.x, sw.y);
      ctx.closePath();
      ctx.fill();

      // Glowing dashed border
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.8;
      ctx.setLineDash([6, 3]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Corner GPS Lat/Lng markers
      ctx.fillStyle = '#38bdf8';
      [nw, ne, se, sw].forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
        ctx.fill();
      });

      // Labels
      ctx.font = '8px "JetBrains Mono"';
      ctx.fillStyle = '#7dd3fc';
      if (sec.cornerCoordinates && sec.cornerCoordinates.length >= 4) {
        ctx.fillText(`NW: ${sec.cornerCoordinates[0].lat.toFixed(5)}°N, ${sec.cornerCoordinates[0].lng.toFixed(5)}°E`, nw.x + 4, nw.y - 4);
        ctx.fillText(`SE: ${sec.cornerCoordinates[2].lat.toFixed(5)}°N, ${sec.cornerCoordinates[2].lng.toFixed(5)}°E`, se.x - 120, se.y + 11);
      }
      ctx.fillStyle = '#f1f5f9';
      ctx.font = 'bold 9px "JetBrains Mono"';
      ctx.fillText(`📍 FED GPS TARGET: ${sec.sectorName}`, nw.x + 4, nw.y + 12);

      // Draw Planned Waypoint Grid Lines inside the fed sector
      if (this.navigator.waypoints.length > 1) {
        ctx.strokeStyle = 'rgba(16, 185, 129, 0.45)';
        ctx.lineWidth = 1.2;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        const startWp = this.worldToScreen(this.navigator.waypoints[0].x, this.navigator.waypoints[0].z);
        ctx.moveTo(startWp.x, startWp.y);
        for (let w = 1; w < this.navigator.waypoints.length; w++) {
          const pt = this.worldToScreen(this.navigator.waypoints[w].x, this.navigator.waypoints[w].z);
          ctx.lineTo(pt.x, pt.y);
        }
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // 3. Draw LIVE INTERACTIVE DRAG PREVIEW (When user is actively dragging on the map)
    if (this.isDragging && this.dragStartScreen && this.dragCurrentScreen) {
      const sStart = this.dragStartScreen;
      const sCurr = this.dragCurrentScreen;
      const screenDist = Math.hypot(sCurr.x - sStart.x, sCurr.y - sStart.y);
      const previewRadiusMeters = Math.max(12, screenDist / this.scale);
      const previewPx = previewRadiusMeters * this.scale;

      // Pulsing amber preview circle
      ctx.fillStyle = 'rgba(245, 158, 11, 0.18)';
      ctx.beginPath();
      ctx.arc(sStart.x, sStart.y, previewPx, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2.0;
      ctx.setLineDash([5, 3]);
      ctx.beginPath();
      ctx.arc(sStart.x, sStart.y, previewPx, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // Radius drag rubberband line
      ctx.strokeStyle = '#fde68a';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(sStart.x, sStart.y);
      ctx.lineTo(sCurr.x, sCurr.y);
      ctx.stroke();

      // Center crosshair
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.arc(sStart.x, sStart.y, 4.5, 0, Math.PI * 2);
      ctx.fill();

      // Live Drag HUD Tooltip Card
      const centerGps = this.navigator.meterOffsetToGps(this.dragStartWorld.x, this.dragStartWorld.z);
      const areaSqM = Math.round(Math.PI * previewRadiusMeters * previewRadiusMeters);

      const cardW = 160;
      const cardH = 38;
      const cardX = Math.min(w - cardW - 8, Math.max(8, sCurr.x + 12));
      const cardY = Math.min(h - cardH - 8, Math.max(8, sCurr.y - 44));

      ctx.fillStyle = 'rgba(10, 16, 28, 0.94)';
      ctx.fillRect(cardX, cardY, cardW, cardH);
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1.2;
      ctx.strokeRect(cardX, cardY, cardW, cardH);

      ctx.fillStyle = '#fde68a';
      ctx.font = 'bold 9px "JetBrains Mono"';
      ctx.fillText(`ALLOTTING RADIUS: ${previewRadiusMeters.toFixed(1)}m`, cardX + 6, cardY + 12);
      ctx.fillStyle = '#cbd5e1';
      ctx.font = '8px "JetBrains Mono"';
      ctx.fillText(`Area: ${areaSqM} m² &bull; Archimedean Spiral`, cardX + 6, cardY + 23);
      ctx.fillStyle = '#38bdf8';
      ctx.fillText(`GPS: ${centerGps.lat.toFixed(5)}°N, ${centerGps.lng.toFixed(5)}°E`, cardX + 6, cardY + 33);
    }

    // Draw Flight Breadcrumb Trail
    if (this.trail.length > 1) {
      ctx.strokeStyle = '#00f0ff';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      const first = this.worldToScreen(this.trail[0].x, this.trail[0].z);
      ctx.moveTo(first.x, first.y);
      for (let i = 1; i < this.trail.length; i++) {
        const p = this.worldToScreen(this.trail[i].x, this.trail[i].z);
        ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    }

    // Draw UWB Anchor Nodes
    this.environment.uwbAnchors.forEach(a => {
      const p = this.worldToScreen(a.position.x, a.position.z);
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - 5);
      ctx.lineTo(p.x + 5, p.y + 4);
      ctx.lineTo(p.x - 5, p.y + 4);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#fde68a';
      ctx.font = '8px "JetBrains Mono"';
      ctx.fillText(a.id, p.x + 6, p.y + 2);
    });

    // Draw Discovered Survivors
    this.environment.survivors.forEach(s => {
      const p = this.worldToScreen(s.position.x, s.position.z);
      const color = s.triage === 'RED' ? '#ef4444' : (s.triage === 'YELLOW' ? '#f59e0b' : '#10b981');

      // Outer ripple if detected
      if (s.detected) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 8 + (Date.now() % 1000) / 100, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = '9px "JetBrains Mono"';
      ctx.fillText(`${s.id} [${s.triage}]`, p.x + 7, p.y + 3);
    });

    // Draw Drone Position & Sensor FOV Cone
    const dronePos = this.drone.group.position;
    const dScreen = this.worldToScreen(dronePos.x, dronePos.z);
    const yaw = this.drone.group.rotation.y;

    // Sensor FOV wedge
    ctx.fillStyle = 'rgba(0, 240, 255, 0.12)';
    ctx.beginPath();
    ctx.moveTo(dScreen.x, dScreen.y);
    const fovAngle = 0.6;
    const fovLen = 35;
    ctx.arc(dScreen.x, dScreen.y, fovLen, -yaw - Math.PI / 2 - fovAngle / 2, -yaw - Math.PI / 2 + fovAngle / 2);
    ctx.closePath();
    ctx.fill();

    // Drone Icon
    ctx.save();
    ctx.translate(dScreen.x, dScreen.y);
    ctx.rotate(-yaw);

    // Cross frame
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(-7, -7); ctx.lineTo(7, 7);
    ctx.moveTo(7, -7); ctx.lineTo(-7, 7);
    ctx.stroke();

    // Center core
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, 0, 3.5, 0, Math.PI * 2);
    ctx.fill();

    // Nose pointer
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.lineTo(3, -4);
    ctx.lineTo(-3, -4);
    ctx.closePath();
    ctx.fill();

    ctx.restore();

    // Map Legend / Scale Bar
    this.drawLegend(ctx, w, h);
  }

  drawSafeExtractionRoute() {
    if (!this.environment.survivors || this.environment.survivors.length === 0) return;

    const ctx = this.ctx;
    ctx.strokeStyle = '#10b981';
    ctx.setLineDash([3, 3]);
    ctx.lineWidth = 1.5;
    ctx.beginPath();

    const startPos = { x: -38, z: 34 }; // NDRF Ingress Base Point
    const start = this.worldToScreen(startPos.x, startPos.z);
    ctx.moveTo(start.x, start.y);

    // Dynamic corridor through detected/active survivors
    this.environment.survivors.forEach(s => {
      const pt = this.worldToScreen(s.position.x, s.position.z);
      ctx.lineTo(pt.x, pt.y);
    });

    ctx.stroke();
    ctx.setLineDash([]);

    // Entry flag
    ctx.fillStyle = '#10b981';
    ctx.font = '8px "JetBrains Mono"';
    ctx.fillText('🚩 NDRF SAFE EXTRACTION CORRIDOR', start.x + 6, start.y);
  }

  drawLegend(ctx, w, h) {
    ctx.fillStyle = 'rgba(7, 10, 18, 0.85)';
    ctx.fillRect(8, h - 30, 210, 22);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '8px "JetBrains Mono"';
    ctx.fillText('MAP: 160m² SECTOR | DRAG TO ALLOT CIRCLE', 12, h - 16);
  }
}

window.TacticalGisMap = TacticalGisMap;
