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

    this.initCanvasSize();
    window.addEventListener('resize', () => this.initCanvasSize());
  }

  initCanvasSize() {
    if (!this.canvas) return;
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.canvas.width = rect.width || 380;
    this.canvas.height = rect.height || 280;
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

    // Draw Flood Inundation Overlay if in flash_flood scenario
    if (this.environment.currentScenario === 'flash_flood') {
      this.drawFloodOverlay(ctx, w, h);
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
    ctx.fillStyle = 'rgba(7, 10, 18, 0.75)';
    ctx.fillRect(8, h - 28, 170, 20);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '8px "JetBrains Mono"';
    ctx.fillText('MAP: 160m² SECTOR | 1px = 0.31m', 12, h - 15);
  }
}

window.TacticalGisMap = TacticalGisMap;
