/**
 * AERORES-AI 2D Tactical GIS Disaster Map
 * Live Geo-Tagged Tracking, Survivor Triage Pins, Hazard Zones & Safe Egress Routing
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
        while (this.navigator.geofenceGroup && this.navigator.geofenceGroup.children.length > 0) {
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

    // Draw Scenario-specific GIS tactical overlays
    if (this.environment.currentScenario === 'flash_flood') {
      this.drawFloodOverlay(ctx, w, h);
    } else if (this.environment.currentScenario === 'earthquake') {
      this.drawEarthquakeOverlay(ctx, w, h);
    } else if (this.environment.currentScenario === 'chemical_fire') {
      this.drawIndustrialOverlay(ctx, w, h);
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
    if (this.navigator && this.navigator.circularSector && this.navigator.circularSector.isFed) {
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
      ctx.lineWidth = 4.0;
      ctx.beginPath();
      ctx.arc(cScreen.x, cScreen.y, rPx, 0, Math.PI * 2);
      ctx.stroke();

      // Epicenter crosshair
      ctx.strokeStyle = '#00f0ff';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(cScreen.x - 8, cScreen.y);
      ctx.lineTo(cScreen.x + 8, cScreen.y);
      ctx.moveTo(cScreen.x, cScreen.y - 8);
      ctx.lineTo(cScreen.x, cScreen.y + 8);
      ctx.stroke();

      // Sector tactical badge
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 8.5px "JetBrains Mono"';
      ctx.fillText(`◎ ALLOTTED GPS SECTOR (${sec.radiusMeters.toFixed(0)}m RADIUS)`, cScreen.x - 45, cScreen.y - rPx - 6);
      ctx.fillStyle = '#94a3b8';
      ctx.font = '7.5px "JetBrains Mono"';
      ctx.fillText(`${sec.centerLat.toFixed(4)}°N, ${sec.centerLng.toFixed(4)}°E`, cScreen.x - 45, cScreen.y - rPx + 4);
    }

    // 2. Draw Active FED RECTANGULAR GPS SECTOR
    if (this.navigator && this.navigator.fedGpsSector && this.navigator.fedGpsSector.isFed) {
      const sec = this.navigator.fedGpsSector;
      const pMin = this.worldToScreen(sec.minX, sec.minZ);
      const pMax = this.worldToScreen(sec.maxX, sec.maxZ);
      const sw = pMax.x - pMin.x;
      const sh = pMax.y - pMin.y;

      ctx.fillStyle = 'rgba(14, 165, 233, 0.10)';
      ctx.fillRect(pMin.x, pMin.y, sw, sh);

      ctx.strokeStyle = '#0284c7';
      ctx.lineWidth = 1.8;
      ctx.setLineDash([5, 3]);
      ctx.strokeRect(pMin.x, pMin.y, sw, sh);
      ctx.setLineDash([]);

      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 8px "JetBrains Mono"';
      ctx.fillText(`⛯ FED GPS SECTOR [${sec.sectorName}]`, pMin.x + 4, pMin.y - 5);
    }

    // 3. Draw DRAG-IN-PROGRESS PREVIEW CIRCLE when user is dragging on map
    if (this.isDragging && this.dragStartWorld && this.dragRadiusMeters > 0) {
      const centerScreen = this.worldToScreen(this.dragStartWorld.x, this.dragStartWorld.z);
      const rPx = this.dragRadiusMeters * this.scale;

      ctx.fillStyle = 'rgba(245, 158, 11, 0.15)';
      ctx.beginPath();
      ctx.arc(centerScreen.x, centerScreen.y, rPx, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2.0;
      ctx.setLineDash([4, 2]);
      ctx.beginPath();
      ctx.arc(centerScreen.x, centerScreen.y, rPx, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // Radius line indicator
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(centerScreen.x, centerScreen.y);
      ctx.lineTo(centerScreen.x + rPx, centerScreen.y);
      ctx.stroke();

      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 9px "JetBrains Mono"';
      ctx.fillText(`RADIUS: ${this.dragRadiusMeters.toFixed(1)}m`, centerScreen.x + 8, centerScreen.y - 6);
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

    // Draw Home Station Marker on GIS Radar Map
    const homePos = this.drone.homePosition || { x: 0, z: 0 };
    const hScreen = this.worldToScreen(homePos.x, homePos.z);

    // Outer cyan landing pad ring
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(hScreen.x, hScreen.y, 9, 0, Math.PI * 2);
    ctx.stroke();

    // Inner helipad 'H'
    ctx.fillStyle = '#00f0ff';
    ctx.font = 'bold 9px "Chakra Petch", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('H', hScreen.x, hScreen.y);

    // Label
    ctx.fillStyle = '#38bdf8';
    ctx.font = '8px "JetBrains Mono"';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('HOME STATION', hScreen.x + 12, hScreen.y);

    // Draw Drone Position & Sensor FOV Wedge
    const dronePos = this.drone.group.position;
    const dScreen = this.worldToScreen(dronePos.x, dronePos.z);
    const yaw = this.drone.group.rotation.y;
    const screenAngle = Math.PI / 2 - yaw;

    // Sensor FOV wedge
    ctx.fillStyle = 'rgba(0, 240, 255, 0.12)';
    ctx.beginPath();
    ctx.moveTo(dScreen.x, dScreen.y);
    const fovAngle = 0.6;
    const fovLen = 35;
    ctx.arc(dScreen.x, dScreen.y, fovLen, screenAngle - fovAngle / 2, screenAngle + fovAngle / 2);
    ctx.closePath();
    ctx.fill();

    // Drone Icon
    ctx.save();
    ctx.translate(dScreen.x, dScreen.y);
    ctx.rotate(screenAngle);

    // Cross frame
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(-6, -6); ctx.lineTo(6, 6);
    ctx.moveTo(6, -6); ctx.lineTo(-6, 6);
    ctx.stroke();

    // Center core
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, 0, 3.5, 0, Math.PI * 2);
    ctx.fill();

    // Nose pointer along local heading vector
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.moveTo(9, 0);
    ctx.lineTo(4, -3);
    ctx.lineTo(4, 3);
    ctx.closePath();
    ctx.fill();

    ctx.restore();

    // UAV Velocity Movement Vector (Independent from heading)
    const vel = this.drone.velocity;
    const hSpeed = vel ? Math.hypot(vel.x, vel.z) : 0;
    if (hSpeed > 0.12) {
      const vLen = Math.max(14, Math.min(36, hSpeed * 3.8));
      const dx = (vel.x / hSpeed) * vLen;
      const dy = (vel.z / hSpeed) * vLen;
      const endX = dScreen.x + dx;
      const endY = dScreen.y + dy;

      ctx.save();
      ctx.strokeStyle = '#00f0ff';
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      ctx.moveTo(dScreen.x, dScreen.y);
      ctx.lineTo(endX, endY);
      ctx.stroke();

      // Arrowhead
      const angle = Math.atan2(dy, dx);
      ctx.fillStyle = '#00f0ff';
      ctx.beginPath();
      ctx.moveTo(endX, endY);
      ctx.lineTo(endX - 7 * Math.cos(angle - Math.PI / 6), endY - 7 * Math.sin(angle - Math.PI / 6));
      ctx.lineTo(endX - 7 * Math.cos(angle + Math.PI / 6), endY - 7 * Math.sin(angle + Math.PI / 6));
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // Map Legend / Scale Bar
    this.drawLegend(ctx, w, h);
  }

  drawFloodOverlay(ctx, w, h) {
    // 1. Water inundation wash across low-lying sectors
    ctx.fillStyle = 'rgba(14, 116, 144, 0.16)';
    ctx.fillRect(0, 0, w, h);

    // 2. Churning main river channel corridor
    ctx.fillStyle = 'rgba(2, 132, 199, 0.2)';
    ctx.beginPath();
    const p1 = this.worldToScreen(-55, -45);
    const p2 = this.worldToScreen(55, -20);
    const p3 = this.worldToScreen(55, 30);
    const p4 = this.worldToScreen(-55, 10);
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.lineTo(p3.x, p3.y);
    ctx.lineTo(p4.x, p4.y);
    ctx.closePath();
    ctx.fill();

    // 3. Elevated Road Embankment & Breached Culvert
    const rStart = this.worldToScreen(-50, 0);
    const rBreachL = this.worldToScreen(-12, 0);
    const rBreachR = this.worldToScreen(-4, 0);
    const rEnd = this.worldToScreen(50, 0);

    // Intact road left
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(rStart.x, rStart.y);
    ctx.lineTo(rBreachL.x, rBreachL.y);
    ctx.stroke();

    // Intact road right
    ctx.beginPath();
    ctx.moveTo(rBreachR.x, rBreachR.y);
    ctx.lineTo(rEnd.x, rEnd.y);
    ctx.stroke();

    // Breached section marker
    ctx.strokeStyle = '#ef4444';
    ctx.setLineDash([2, 2]);
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.moveTo(rBreachL.x, rBreachL.y);
    ctx.lineTo(rBreachR.x, rBreachR.y);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#ef4444';
    ctx.font = '8px "JetBrains Mono"';
    ctx.fillText('⚠️ ROAD BREACH', rBreachL.x - 10, rBreachL.y - 6);

    // Flood Sector Tag
    ctx.fillStyle = '#38bdf8';
    ctx.font = '8px "JetBrains Mono"';
    ctx.fillText('🌊 FLOOD / TSUNAMI ZONE (LEVEL 3)', 12, 20);
  }

  drawEarthquakeOverlay(ctx, w, h) {
    // 1. Boulevard corridor
    const bTop = this.worldToScreen(0, -75);
    const bBot = this.worldToScreen(0, 75);
    ctx.strokeStyle = 'rgba(71, 85, 105, 0.45)';
    ctx.lineWidth = 14 * this.scale;
    ctx.beginPath();
    ctx.moveTo(bTop.x, bTop.y);
    ctx.lineTo(bBot.x, bBot.y);
    ctx.stroke();

    // 2. Cross Avenue
    const cLeft = this.worldToScreen(-70, 18);
    const cRight = this.worldToScreen(70, 18);
    ctx.strokeStyle = 'rgba(71, 85, 105, 0.4)';
    ctx.lineWidth = 10 * this.scale;
    ctx.beginPath();
    ctx.moveTo(cLeft.x, cLeft.y);
    ctx.lineTo(cRight.x, cRight.y);
    ctx.stroke();

    // 3. Damaged Building Footprints on GIS Radar
    const bldgOutlines = [
      { name: 'Metropolis Tower (Tilted 8°)', x: -28, z: -28, w: 18, d: 16, color: '#f59e0b' },
      { name: 'Grand Plaza (Pancaked 5 Slabs)', x: 30, z: -22, w: 22, d: 20, color: '#ef4444' },
      { name: 'Sheared Townhouse (Void)', x: -46, z: -12, w: 14, d: 12, color: '#ef4444' },
      { name: 'Apex Bank (Soft-Storey)', x: 25, z: 10, w: 18, d: 15, color: '#f59e0b' },
      { name: 'Leveled Warehouse Ruin', x: 44, z: -42, w: 20, d: 16, color: '#ef4444' }
    ];

    bldgOutlines.forEach(b => {
      const p = this.worldToScreen(b.x - b.w / 2, b.z - b.d / 2);
      const bw = b.w * this.scale;
      const bd = b.d * this.scale;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.7)';
      ctx.fillRect(p.x, p.y, bw, bd);
      ctx.strokeStyle = b.color;
      ctx.lineWidth = 1.2;
      ctx.strokeRect(p.x, p.y, bw, bd);
    });

    // 4. Primary Fault Rupture Chasm & Displacement Scarp (Z: -14 to -10)
    const fLeft = this.worldToScreen(-24, -13);
    const fRight = this.worldToScreen(24, -13);
    ctx.strokeStyle = '#ef4444';
    ctx.setLineDash([4, 2]);
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(fLeft.x, fLeft.y);
    ctx.lineTo(fRight.x, fRight.y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Fracture warning text
    ctx.fillStyle = '#ef4444';
    ctx.font = '8px "JetBrains Mono"';
    ctx.fillText('⚠️ SEISMIC FAULT CHASM (0.9m SCARP)', fLeft.x - 8, fLeft.y - 4);

    // 5. NDRF SAR Staging Post (Z: 56)
    const sp = this.worldToScreen(0, 56);
    ctx.fillStyle = '#10b981';
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = '8px "JetBrains Mono"';
    ctx.fillText('🚑 NDRF COMMAND STAGING', sp.x + 8, sp.y + 3);

    // Urban Sector Tag
    ctx.fillStyle = '#38bdf8';
    ctx.font = '8px "JetBrains Mono"';
    ctx.fillText('🏚️ URBAN COLLAPSE ZONE ALPHA-4', 12, 20);
  }

  drawIndustrialOverlay(ctx, w, h) {
    // 1. Main Production Complex Building Outline
    const pTopLeft = this.worldToScreen(-22, -42);
    const pBotRight = this.worldToScreen(22, -10);
    const pw = pBotRight.x - pTopLeft.x;
    const ph = pBotRight.y - pTopLeft.y;

    ctx.fillStyle = 'rgba(30, 58, 138, 0.22)';
    ctx.fillRect(pTopLeft.x, pTopLeft.y, pw, ph);

    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(pTopLeft.x, pTopLeft.y, pw, ph);

    ctx.fillStyle = '#93c5fd';
    ctx.font = '8px "JetBrains Mono"';
    ctx.fillText('🏭 PRODUCTION HALL (BREACHED)', pTopLeft.x + 6, pTopLeft.y + 14);

    // 2. Chemical Storage Tank Farm Perimeter
    const tTopLeft = this.worldToScreen(-52, -8);
    const tBotRight = this.worldToScreen(-18, 40);
    const tw = tBotRight.x - tTopLeft.x;
    const th = tBotRight.y - tTopLeft.y;

    ctx.fillStyle = 'rgba(234, 88, 12, 0.12)';
    ctx.fillRect(tTopLeft.x, tTopLeft.y, tw, th);

    ctx.strokeStyle = 'rgba(234, 88, 12, 0.6)';
    ctx.setLineDash([2, 2]);
    ctx.strokeRect(tTopLeft.x, tTopLeft.y, tw, th);
    ctx.setLineDash([]);

    ctx.fillStyle = '#fb923c';
    ctx.font = '8px "JetBrains Mono"';
    ctx.fillText('🛢️ TANK FARM (CONTAINMENT BUND)', tTopLeft.x + 6, tTopLeft.y + 14);

    // 3. Loading Bay Dock
    const lTopLeft = this.worldToScreen(20, -4);
    const lBotRight = this.worldToScreen(46, 30);
    ctx.strokeStyle = 'rgba(100, 116, 139, 0.5)';
    ctx.strokeRect(lTopLeft.x, lTopLeft.y, lBotRight.x - lTopLeft.x, lBotRight.y - lTopLeft.y);

    ctx.fillStyle = '#cbd5e1';
    ctx.font = '8px "JetBrains Mono"';
    ctx.fillText('🚚 CHEMICAL LOADING DOCK', lTopLeft.x + 4, lTopLeft.y + 12);

    // Industrial Sector Tag
    ctx.fillStyle = '#38bdf8';
    ctx.font = '8px "JetBrains Mono"';
    ctx.fillText('☣️ INDUSTRIAL CORRIDOR CHARLIE-1', 12, 20);
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

    // Nearest-neighbor route planning for clean tactical corridor
    const remaining = [...this.environment.survivors];
    let curr = startPos;
    while (remaining.length > 0) {
      let bestIdx = 0;
      let bestDist = Infinity;
      for (let i = 0; i < remaining.length; i++) {
        const d = Math.hypot(remaining[i].position.x - curr.x, remaining[i].position.z - curr.z);
        if (d < bestDist) {
          bestDist = d;
          bestIdx = i;
        }
      }
      const nextSurv = remaining.splice(bestIdx, 1)[0];
      const pt = this.worldToScreen(nextSurv.position.x, nextSurv.position.z);
      ctx.lineTo(pt.x, pt.y);
      curr = nextSurv.position;
    }

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
