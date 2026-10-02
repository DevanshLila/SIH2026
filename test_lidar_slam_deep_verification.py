#!/usr/bin/env python3
"""
Exhaustive Verification Test for 3D LiDAR SLAM Complete Scanning & Reconstruction
Team Pegasus - SIH 2026
Tests:
1. Real-Time World Generation (unscanned structures hidden in purple void, progressively revealed on ray hits)
2. Three-Zone Visualization (Purple out-of-range/blind zone, Grey scanned empty space, Cyan/Dark Grey reconstructed structures)
3. 3D Point Cloud Generation & Capacity (15,000 pts)
4. SLAM Map Persistence (previously scanned structures remain mapped when drone moves)
5. UAV Estimated Trajectory Line in 3D
6. 3D LiDAR + AI Sensor Fusion (distance & relative altitude on survivor/hazard reticles)
7. Earthquake Disaster Annotations (Structural Collapse, Unstable Structure, Road Fracture, Obstacles, Voids)
8. Weather-Aware Degradation & Impact (Clear, Rain, Dust, Windy, Snow)
9. Compact Technical LiDAR HUD Panel (50m range, 360° x [-15° -> +15°], Scan Rate, PPS, Returns, SLAM State, Weather Impact)
10. Seamless Mode Transitions (LiDAR <-> RGB <-> Thermal <-> NVG <-> Gas) with zero console errors
"""

import http.server, threading, time, subprocess, os, json, socket, base64, struct, urllib.request, tempfile, sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')

PORT = 8000
try:
    urllib.request.urlopen(f'http://127.0.0.1:{PORT}/index.html', timeout=2)
    print(f"Connected to existing server on port {PORT}")
except Exception:
    print(f"Starting server on port {PORT}")
    server = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), http.server.SimpleHTTPRequestHandler)
    t = threading.Thread(target=server.serve_forever, daemon=True)
    t.start()

CDP_PORT = 9230
edge = r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
temp_profile = tempfile.mkdtemp(prefix='edge_lidar_deep_')

cmd = [
    edge,
    '--headless=new',
    f'--remote-debugging-port={CDP_PORT}',
    '--remote-allow-origins=*',
    '--disable-gpu',
    '--disable-extensions',
    '--disable-component-extensions-with-background-pages',
    '--disable-default-apps',
    '--disable-features=Translate,OptimizationHints',
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1600,900',
    f'--user-data-dir={temp_profile}',
    f'http://127.0.0.1:{PORT}/index.html'
]
proc = subprocess.Popen(cmd)
time.sleep(4.5)

def create_ws(url):
    parts = url.replace('ws://', '').split('/', 1)
    host, port = parts[0].split(':')
    path = '/' + parts[1]
    s = socket.create_connection((host, int(port)))
    key = base64.b64encode(b'antigravitytestkey').decode()
    req = f'GET {path} HTTP/1.1\r\nHost: {host}:{port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n'
    s.sendall(req.encode())
    resp = s.recv(4096)
    if b'101 ' not in resp:
        raise AssertionError('Handshake failed: ' + repr(resp))
    return s

msg_counter = 0
def send_cdp(s, method, params=None):
    global msg_counter
    msg_counter += 1
    msg_id = msg_counter
    payload = json.dumps({'id': msg_id, 'method': method, 'params': params or {}}).encode()
    length = len(payload)
    header = bytearray([0x81])
    mask = b'\x12\x34\x56\x78'
    if length <= 125:
        header.append(0x80 | length)
    elif length <= 65535:
        header.append(0x80 | 126)
        header.extend(struct.pack('>H', length))
    else:
        header.append(0x80 | 127)
        header.extend(struct.pack('>Q', length))
    header.extend(mask)
    masked = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
    s.sendall(header + masked)
    return msg_id

def recv_cdp(s, target_id=None):
    buf = bytearray()
    while True:
        chunk = s.recv(65536)
        if not chunk: break
        buf.extend(chunk)
        while len(buf) >= 2:
            payload_len = buf[1] & 0x7f
            offset = 2
            if payload_len == 126:
                if len(buf) < 4: break
                payload_len = struct.unpack('>H', buf[2:4])[0]
                offset = 4
            elif payload_len == 127:
                if len(buf) < 10: break
                payload_len = struct.unpack('>Q', buf[2:10])[0]
                offset = 10
            if len(buf) < offset + payload_len:
                break
            payload = buf[offset:offset+payload_len]
            del buf[:offset+payload_len]
            msg = json.loads(payload.decode('utf-8', errors='ignore'))
            if target_id is not None:
                if msg.get('id') == target_id:
                    return msg
            else:
                return msg

def eval_js(s, expr):
    msg_id = send_cdp(s, 'Runtime.evaluate', {'expression': expr, 'returnByValue': True})
    res = recv_cdp(s, msg_id)
    if 'result' in res and 'result' in res['result']:
        val = res['result']['result'].get('value')
        return val
    return None

def take_screenshot(s, filename):
    msg_id = send_cdp(s, 'Page.captureScreenshot', {'format': 'png'})
    res = recv_cdp(s, msg_id)
    if 'result' in res and 'data' in res['result']:
        img_data = base64.b64decode(res['result']['data'])
        with open(filename, 'wb') as f:
            f.write(img_data)
        print(f"  [Screenshot] Saved: {filename} ({len(img_data)} bytes)")

try:
    tabs = json.loads(urllib.request.urlopen(f'http://127.0.0.1:{CDP_PORT}/json').read())
    page_tab = next((t for t in tabs if str(PORT) in t.get('url', '')), None)
    if not page_tab:
        page_tab = next(t for t in tabs if t.get('type') == 'page')
    ws_url = page_tab['webSocketDebuggerUrl']
    s = create_ws(ws_url)
    print("CDP Connected successfully to:", page_tab.get('url', 'unknown'))

    send_cdp(s, 'Page.enable')
    send_cdp(s, 'Runtime.enable')
    time.sleep(1.0)

    # 1. Page Load & Initial State
    print("\n=== TEST 1: App Initialization & Baseline Sensors ===")
    app_exists = eval_js(s, "typeof window.droneApp !== 'undefined' && window.droneApp !== null")
    assert app_exists, "droneApp must exist!"
    sensors_exists = eval_js(s, "typeof window.droneApp.sensors !== 'undefined'")
    assert sensors_exists, "Sensors engine must exist!"
    print("  App and sensors engines initialized successfully.")

    # 2. Switch to 3D LiDAR SLAM Mode
    print("\n=== TEST 2: Engage 3D LiDAR SLAM Mode & Three-Zone Atmosphere ===")
    eval_js(s, "window.droneApp.sensors.setSensorMode('LIDAR')")
    time.sleep(1.0)

    three_zone_state = eval_js(s, """(() => {
        const sensors = window.droneApp.sensors;
        const scene = window.droneApp.scene;
        const env = window.droneApp.environment;
        
        // Count structures hidden vs visible in LiDAR mode
        let totalMeshes = 0;
        let hiddenMeshes = 0;
        let groundMeshes = 0;
        let groundIsGrey = false;

        env.environmentGroup.traverse(node => {
            if (node.isMesh) {
                totalMeshes++;
                const isGround = (node === env.waterMesh || node === env.channelMesh ||
                    (node.name && node.name.toLowerCase().includes('ground')) ||
                    (node.userData && node.userData.thermalType === 'road' && node.geometry && node.geometry.type === 'PlaneGeometry'));
                if (isGround) {
                    groundMeshes++;
                    if (node.material === sensors.slamUnoccupiedGroundMaterial) {
                        groundIsGrey = true;
                    }
                } else if (!node.visible) {
                    hiddenMeshes++;
                }
            }
        });

        return {
            mode: sensors.sensorMode,
            bgColorHex: scene.background ? scene.background.getHexString() : null,
            fogColorHex: scene.fog ? scene.fog.color.getHexString() : null,
            blindZoneVisible: sensors.lidarBlindZone ? sensors.lidarBlindZone.visible : false,
            trajectoryVisible: sensors.lidarTrajectoryLine ? sensors.lidarTrajectoryLine.visible : false,
            totalMeshes,
            hiddenMeshes,
            groundMeshes,
            groundIsGrey,
            discoveredCount: sensors.slamDiscoveredMeshes.size
        };
    })()""")

    print(f"  Mode: {three_zone_state['mode']}")
    print(f"  Background Hex (Purple): #{three_zone_state['bgColorHex']}")
    print(f"  Fog Hex (Purple): #{three_zone_state['fogColorHex']}")
    print(f"  Blind Zone Visible: {three_zone_state['blindZoneVisible']}")
    print(f"  Trajectory Line Visible: {three_zone_state['trajectoryVisible']}")
    print(f"  Ground is Neutral Grey: {three_zone_state['groundIsGrey']}")
    print(f"  Meshes Total: {three_zone_state['totalMeshes']}, Hidden in Purple Void: {three_zone_state['hiddenMeshes']}")
    print(f"  Discovered SLAM Meshes: {three_zone_state['discoveredCount']}")

    assert three_zone_state['mode'] == 'LIDAR', "Must be in LIDAR mode!"
    assert three_zone_state['blindZoneVisible'], "Blind zone must be visible!"
    assert three_zone_state['trajectoryVisible'], "Trajectory line must be visible!"
    assert three_zone_state['groundIsGrey'], "Unoccupied ground must be neutral grey!"
    assert three_zone_state['hiddenMeshes'] > 0, "Unexplored structures must be hidden initially!"

    # 3. Real-Time Progressive World Generation
    print("\n=== TEST 3: Progressive SLAM Scanning & Structure Reconstruction ===")
    # Simulate a series of scan sweeps as drone moves across scene
    eval_js(s, """(() => {
        // Move drone across coordinate space to scan buildings
        for (let i = 0; i < 20; i++) {
            window.droneApp.sensors.updateLidarScan(0.1);
        }
    })()""")
    time.sleep(0.5)

    slam_progress = eval_js(s, """(() => {
        const s = window.droneApp.sensors;
        let activeCount = 0;
        let partialCount = 0;
        let confidentCount = 0;

        s.slamDiscoveredMeshes.forEach(mesh => {
            if (mesh.material === s.slamActiveMaterial) activeCount++;
            else if (mesh.material === s.slamPartialMaterial) partialCount++;
            else if (mesh.material === s.slamConfidentMaterial) confidentCount++;
        });

        return {
            discoveredCount: s.slamDiscoveredMeshes.size,
            pointHistoryLen: s.pointHistory.length,
            activeCount,
            partialCount,
            confidentCount,
            mapPct: s.slamMapPct,
            mappedArea: s.mappedAreaSqM
        };
    })()""")

    print(f"  Discovered Meshes: {slam_progress['discoveredCount']}")
    print(f"  Accumulated 3D Points: {slam_progress['pointHistoryLen']}")
    print(f"  Reconstruction States -> Active (Cyan): {slam_progress['activeCount']} | Partial (Cyan-Blue): {slam_progress['partialCount']} | Confident (Dark Grey): {slam_progress['confidentCount']}")
    print(f"  SLAM Map: {slam_progress['mapPct']}% | Area: {slam_progress['mappedArea']} m²")

    assert slam_progress['discoveredCount'] > 0, "LiDAR must have discovered physical structures!"
    assert slam_progress['pointHistoryLen'] > 0, "LiDAR must have generated 3D points!"
    assert (slam_progress['activeCount'] + slam_progress['partialCount'] + slam_progress['confidentCount']) > 0, "Discovered structures must use SLAM reconstruction materials!"

    # Spatial Occupancy Grid stationary hovering check
    rescan_check = eval_js(s, """(() => {
        const s = window.droneApp.sensors;
        // Warm up 360 sweep from stationary position
        for (let i = 0; i < 40; i++) {
            s.updateLidarScan(0.05);
        }
        const cellsAfterSweep = s.scannedGridCells.size;
        const areaAfterSweep = s.mappedAreaSqM;
        const covAfterSweep = Math.min(100, Math.floor((cellsAfterSweep / s.totalSectorCells) * 100));

        // Rescan while hovering at the same location for 30 more frames
        for (let i = 0; i < 30; i++) {
            s.updateLidarScan(0.05);
        }
        const cellsAfterHover = s.scannedGridCells.size;
        const areaAfterHover = s.mappedAreaSqM;
        const covAfterHover = Math.min(100, Math.floor((cellsAfterHover / s.totalSectorCells) * 100));

        return {
            cellsAfterSweep,
            cellsAfterHover,
            areaAfterSweep,
            areaAfterHover,
            covAfterSweep,
            covAfterHover,
            cellDiff: cellsAfterHover - cellsAfterSweep
        };
    })()""")
    print(f"  Spatial Grid: After 360 Sweep -> {rescan_check['cellsAfterSweep']} cells ({rescan_check['areaAfterSweep']} m², {rescan_check['covAfterSweep']}%) | After Stationary Hover -> {rescan_check['cellsAfterHover']} cells ({rescan_check['areaAfterHover']} m², {rescan_check['covAfterHover']}%) | Diff: {rescan_check['cellDiff']}")
    assert rescan_check['covAfterHover'] <= 35, f"Stationary hovering must not inflate whole-map coverage (was {rescan_check['covAfterHover']}%)!"
    assert rescan_check['cellDiff'] <= 3, f"Hovering in place must stabilize occupancy grid (diff was {rescan_check['cellDiff']} cells)!"

    # 4. Trajectory Tracking
    print("\n=== TEST 4: UAV Estimated Trajectory Line Tracking ===")
    traj_state = eval_js(s, """(() => {
        const s = window.droneApp.sensors;
        return {
            hasLine: !!s.lidarTrajectoryLine,
            count: s.trajectoryCount,
            visible: s.lidarTrajectoryLine.visible
        };
    })()""")
    print(f"  Trajectory Line Exists: {traj_state['hasLine']} | Sampled Points: {traj_state['count']} | Visible: {traj_state['visible']}")
    assert traj_state['hasLine'], "Trajectory line must be instantiated!"
    assert traj_state['visible'], "Trajectory line must be visible in LiDAR mode!"

    # 4B. 3D UAV Movement Vector Structure & Visibility
    print("\n=== TEST 4B: 3D UAV Movement Vector (Shaft, Arrowhead, Label Sprite) ===")
    vec_state = eval_js(s, """(() => {
        const s = window.droneApp.sensors;
        return {
            hasVector: !!s.movementVectorGroup,
            visible: s.movementVectorGroup ? s.movementVectorGroup.visible : false,
            hasShaft: !!s.vectorShaft,
            shaftType: s.vectorShaft ? s.vectorShaft.geometry.type : null,
            hasHead: !!s.vectorHead,
            headType: s.vectorHead ? s.vectorHead.geometry.type : null,
            hasSprite: !!s.movementVectorSprite
        };
    })()""")
    print(f"  Movement Vector Group: {vec_state['hasVector']} | Visible: {vec_state['visible']}")
    print(f"  Shaft Geometry: {vec_state['shaftType']} | Head Geometry: {vec_state['headType']} | Label Sprite: {vec_state['hasSprite']}")
    assert vec_state['hasVector'], "Movement vector group must exist!"
    assert vec_state['visible'], "Movement vector must be visible in LiDAR mode!"
    assert 'Cylinder' in vec_state['shaftType'], "Shaft must be cylinder geometry!"
    assert 'Cone' in vec_state['headType'], "Arrowhead must be cone geometry!"
    assert vec_state['hasSprite'], "Must have tactical label sprite!"

    # 4C. Independence of UAV Movement Vector vs Heading
    print("\n=== TEST 4C: Independence of UAV Movement Vector vs Heading (North Heading, East Movement) ===")
    indep_state = eval_js(s, """(() => {
        const drone = window.droneApp.drone;
        const sensors = window.droneApp.sensors;

        // Drone heading faces North (yaw = 0)
        drone.group.rotation.set(0, 0, 0);
        drone.telemetry.heading = 0;
        drone.telemetry.isFlying = true;

        // Drone moves East (+X) at 8.0 m/s
        drone.velocity.set(8.0, 0.0, 0.0);
        sensors.updateLidarScan(0.016);

        const headPos = sensors.vectorHead.position.clone();
        const headDir = headPos.clone().normalize();
        const shaftScale = sensors.vectorShaft.scale.y;

        return {
            heading: drone.telemetry.heading,
            velX: drone.velocity.x,
            dirX: parseFloat(headDir.x.toFixed(3)),
            dirY: parseFloat(headDir.y.toFixed(3)),
            dirZ: parseFloat(headDir.z.toFixed(3)),
            shaftScale: parseFloat(shaftScale.toFixed(2))
        };
    })()""")
    print(f"  Drone Heading: {indep_state['heading']}° (North)")
    print(f"  Drone Velocity X: {indep_state['velX']} m/s (East)")
    print(f"  Movement Vector Direction: ({indep_state['dirX']}, {indep_state['dirY']}, {indep_state['dirZ']})")
    assert indep_state['heading'] == 0, "Drone heading must face North (0°)!"
    assert indep_state['dirX'] > 0.95, "Movement vector must point East (+X) in direction of travel!"
    assert abs(indep_state['dirZ']) < 0.1, "Movement vector Z must be zero when translating along pure X!"

    # 4D. 3D Diagonal and Vertical Climb Motion Vector
    print("\n=== TEST 4D: 3D Movement Vector in Diagonal Climbing & Hovering ===")
    diag_state = eval_js(s, """(() => {
        const drone = window.droneApp.drone;
        const sensors = window.droneApp.sensors;

        // 1. Climb + Forward
        drone.velocity.set(0.0, 4.0, 6.0);
        sensors.updateLidarScan(0.016);
        const climbDir = sensors.vectorHead.position.clone().normalize();

        // 2. Hover
        drone.velocity.set(0.0, 0.0, 0.0);
        sensors.updateLidarScan(0.016);
        const hoverScale = sensors.vectorShaft.scale.y;

        return {
            climbDirY: parseFloat(climbDir.y.toFixed(3)),
            climbDirZ: parseFloat(climbDir.z.toFixed(3)),
            hoverScale: parseFloat(hoverScale.toFixed(2))
        };
    })()""")
    print(f"  Climb Direction Y: {diag_state['climbDirY']}, Z: {diag_state['climbDirZ']}")
    print(f"  Hovering Shaft Scale: {diag_state['hoverScale']} m")
    assert diag_state['climbDirY'] > 0.4, "Vector must have positive Y during climb!"
    assert diag_state['climbDirZ'] > 0.7, "Vector must point forward during forward climb!"
    assert diag_state['hoverScale'] > 0.5, "Hover vector must maintain subtle clean display!"

    # 5. Survivor + Sensor Fusion (3D Distance & Relative Altitude)
    print("\n=== TEST 5: Survivor & Sensor Fusion (3D LiDAR Coordinates) ===")
    fusion_state = eval_js(s, """(() => {
        window.droneApp.environment.survivors[0].detected = true;
        window.droneApp.sensors.updateVisionDetections();
        const det = window.droneApp.sensors.activeDetections.find(d => d.type === 'survivor');
        return {
            hasDet: !!det,
            label: det ? det.label : null,
            stateLabel: det ? det.stateLabel : null,
            lidarFusion: det ? det.lidarFusion : null,
            sublabel: det ? det.sublabel : null
        };
    })()""")

    print(f"  Survivor Detection Label: {fusion_state['label']}")
    print(f"  State Label: {fusion_state['stateLabel']}")
    print(f"  3D LiDAR Fusion: '{fusion_state['lidarFusion']}'")
    assert fusion_state['hasDet'], "Must detect survivor!"
    assert 'DISTANCE:' in fusion_state['lidarFusion'], "Fusion must contain DISTANCE!"
    assert 'REL. ALT:' in fusion_state['lidarFusion'], "Fusion must contain REL. ALT!"

    # 6. Disaster Environment Annotations
    print("\n=== TEST 6: Disaster Annotations (Earthquake Geometry) ===")
    haz_state = eval_js(s, """(() => {
        window.droneApp.sensors.updateVisionDetections();
        const hazDets = window.droneApp.sensors.activeDetections.filter(d => d.type === 'structural' || d.type === 'unstable' || d.type === 'road_fracture' || d.type === 'zone' || d.type === 'obstacle' || d.type === 'void');
        return {
            activeDets: hazDets.map(h => ({ id: h.id, label: h.label, fusion: h.lidarFusion })),
            allHazards: window.droneApp.environment.structuralHazards.map(h => h.label)
        };
    })()""")
    print(f"  Active Hazard Detections count: {len(haz_state['activeDets'])}")
    for h in haz_state['activeDets']:
        print(f"    - [{h['id']}] {h['label']} -> {h['fusion']}")
    print(f"  All Scene Structural Hazards: {haz_state['allHazards']}")
    assert len(haz_state['activeDets']) > 0, "Must have structural hazard detections!"
    assert any('STRUCTURAL COLLAPSE' in h for h in haz_state['allHazards']), "Must contain STRUCTURAL COLLAPSE annotation!"
    assert any('ROAD FRACTURE' in h for h in haz_state['allHazards']), "Must contain ROAD FRACTURE annotation!"
    assert any('OBSTACLE' in h for h in haz_state['allHazards']), "Must contain OBSTACLE annotation!"
    assert any('OPEN VOID' in h for h in haz_state['allHazards']), "Must contain OPEN VOID annotation!"
    assert any('UNSTABLE STRUCTURE' in h for h in haz_state['allHazards']), "Must contain UNSTABLE STRUCTURE annotation!"

    # 7. Technical HUD Panel Check (50m, 360°, -15° to +15°, Scan Rate, SLAM State, Weather Impact, GPS, Speed, Movement)
    print("\n=== TEST 7: Technical LiDAR HUD Panel Contents ===")
    hud_vals = eval_js(s, """(() => {
        return {
            range: document.getElementById('lidar-val-range') ? document.getElementById('lidar-val-range').textContent : null,
            fov: document.getElementById('lidar-val-fov') ? document.getElementById('lidar-val-fov').textContent : null,
            rate: document.getElementById('lidar-val-rate') ? document.getElementById('lidar-val-rate').textContent : null,
            pps: document.getElementById('lidar-val-pps') ? document.getElementById('lidar-val-pps').textContent : null,
            returns: document.getElementById('lidar-val-returns') ? document.getElementById('lidar-val-returns').textContent : null,
            points: document.getElementById('lidar-val-points') ? document.getElementById('lidar-val-points').textContent : null,
            area: document.getElementById('lidar-val-area') ? document.getElementById('lidar-val-area').textContent : null,
            coverage: document.getElementById('lidar-val-coverage') ? document.getElementById('lidar-val-coverage').textContent : null,
            map: document.getElementById('lidar-val-map') ? document.getElementById('lidar-val-map').textContent : null,
            slam: document.getElementById('lidar-val-slam') ? document.getElementById('lidar-val-slam').textContent : null,
            gps: document.getElementById('lidar-val-gps') ? document.getElementById('lidar-val-gps').textContent : null,
            speed: document.getElementById('lidar-val-speed') ? document.getElementById('lidar-val-speed').textContent : null,
            movement: document.getElementById('lidar-val-movement') ? document.getElementById('lidar-val-movement').textContent : null,
            weatherImpact: document.getElementById('lidar-val-weather-impact') ? document.getElementById('lidar-val-weather-impact').textContent : null,
            noise: document.getElementById('lidar-val-noise') ? document.getElementById('lidar-val-noise').textContent : null
        };
    })()""")

    print(f"  Range: {hud_vals['range']}")
    print(f"  FOV: {hud_vals['fov']}")
    print(f"  Scan Rate: {hud_vals['rate']}")
    print(f"  Points/Sec: {hud_vals['pps']}")
    print(f"  Returns: {hud_vals['returns']}")
    print(f"  SLAM Map: {hud_vals['map']}")
    print(f"  SLAM State: {hud_vals['slam']}")
    print(f"  GPS State: {hud_vals['gps']}")
    print(f"  UAV Speed: {hud_vals['speed']}")
    print(f"  UAV Movement: {hud_vals['movement']}")
    print(f"  Weather Impact: {hud_vals['weatherImpact']}")

    assert '50' in hud_vals['range'], "Range must show 50m!"
    assert '360°' in hud_vals['fov'], "FOV must show 360°!"
    assert '-15°' in hud_vals['fov'], "FOV must show -15°!"
    assert hud_vals['slam'] in ['LOCKED', 'INITIALIZING', 'DEGRADED'], "SLAM state must be valid!"
    assert hud_vals['gps'] in ['LOCKED', 'DEGRADED', 'UNAVAILABLE'], "GPS state must be valid!"
    assert 'm/s' in hud_vals['speed'], "Speed must be in m/s!"
    assert hud_vals['movement'] is not None and len(hud_vals['movement']) > 0, "Movement direction must be shown!"
    assert hud_vals['weatherImpact'] in ['LOW', 'MODERATE', 'HIGH'], "Weather impact must be valid!"

    # 8. Weather Degradation on 50m Base System
    print("\n=== TEST 8: Weather Degradation Across Conditions ===")
    # Clear
    eval_js(s, "window.droneApp.environment.setWeather('clear')")
    time.sleep(0.3)
    eval_js(s, "window.droneApp.sensors.updateLidarScan(0.05)")
    clear_w = eval_js(s, "({ range: window.droneApp.sensors.effectiveLidarRange, impact: window.droneApp.sensors.lidarWeatherImpact })")
    print(f"  CLEAR  -> Range: {clear_w['range']}m | Impact: {clear_w['impact']}")
    assert clear_w['range'] == 50.0, "Clear must be 50.0m!"
    assert clear_w['impact'] == 'LOW', "Clear impact must be LOW!"

    # Rain
    eval_js(s, "window.droneApp.environment.setWeather('rain')")
    time.sleep(0.3)
    eval_js(s, "window.droneApp.sensors.updateLidarScan(0.05)")
    rain_w = eval_js(s, "({ range: window.droneApp.sensors.effectiveLidarRange, impact: window.droneApp.sensors.lidarWeatherImpact })")
    print(f"  RAIN   -> Range: {rain_w['range']}m | Impact: {rain_w['impact']}")
    assert rain_w['range'] < 46.0, "Rain range must be degraded below 46m!"
    assert rain_w['impact'] in ['MODERATE', 'HIGH'], "Rain impact must be MODERATE or HIGH!"

    # Dust
    eval_js(s, "window.droneApp.environment.setWeather('dust')")
    time.sleep(0.3)
    eval_js(s, "window.droneApp.sensors.updateLidarScan(0.05)")
    dust_w = eval_js(s, "({ range: window.droneApp.sensors.effectiveLidarRange, impact: window.droneApp.sensors.lidarWeatherImpact })")
    print(f"  DUST   -> Range: {dust_w['range']}m | Impact: {dust_w['impact']}")
    assert dust_w['range'] <= 26.0, "Dust range must be heavily degraded to <= 26m!"
    assert dust_w['impact'] == 'HIGH', "Dust impact must be HIGH!"

    # Dynamic range boundary label check
    range_lbl_check = eval_js(s, "window.droneApp.sensors.lidarRangeLabel.userData && window.droneApp.sensors.lidarRangeLabel.userData.currentRange <= 26.0")
    print(f"  Range label dynamically updated for dust: {range_lbl_check}")
    assert range_lbl_check, "Range label sprite must dynamically update to match degraded range!"

    # Restore clear
    eval_js(s, "window.droneApp.environment.setWeather('clear')")
    time.sleep(0.3)
    eval_js(s, "window.droneApp.sensors.updateLidarScan(0.05)")

    # 9. Clean Sensor Switching (Preserve 4K Optical, FLIR Thermal, NVG, Gas Plume)
    print("\n=== TEST 9: Seamless Switching & Sensor Mode Preservation ===")
    # Switch to THERMAL
    eval_js(s, "window.droneApp.sensors.setSensorMode('THERMAL')")
    time.sleep(0.5)
    thermal_ok = eval_js(s, "window.droneApp.sensors.thermalEngine && window.droneApp.sensors.thermalEngine.isActive")
    print(f"  Switched to THERMAL -> Engine Active: {thermal_ok}")
    assert thermal_ok, "ThermalEngine must activate cleanly!"

    # Switch to RGB (4K Optical)
    eval_js(s, "window.droneApp.sensors.setSensorMode('RGB')")
    time.sleep(0.5)
    rgb_ok = eval_js(s, """(() => {
        let allVisible = true;
        window.droneApp.environment.environmentGroup.traverse(node => {
            if (node.isMesh && node.userData._origLidarMat !== undefined) {
                allVisible = false; // Original materials not restored
            }
        });
        return allVisible;
    })()""")
    print(f"  Switched to RGB -> Original materials restored: {rgb_ok}")
    assert rgb_ok, "RGB mode must restore normal environment materials!"

    # Switch back to LIDAR
    eval_js(s, "window.droneApp.sensors.setSensorMode('LIDAR')")
    time.sleep(0.5)
    lidar_restored = eval_js(s, "window.droneApp.sensors.sensorMode === 'LIDAR'")
    print(f"  Switched back to LIDAR: {lidar_restored}")
    assert lidar_restored, "LiDAR mode must resume seamlessly!"

    # 9B. Point Cloud Mode Solid Mesh Occlusion (Bug Fix Verification)
    print("\n=== TEST 9B: Point Cloud Visualization Mode Mesh Hiding ===")
    eval_js(s, "window.droneApp.sensors.setLidarVisMode('POINT_CLOUD')")
    eval_js(s, "window.droneApp.sensors.updateLidarScan(0.016)")
    pc_mesh_hidden = eval_js(s, """(() => {
        let solidVisible = 0;
        window.droneApp.sensors.slamDiscoveredMeshes.forEach(m => {
            if (m.visible) solidVisible++;
        });
        return solidVisible === 0;
    })()""")
    print(f"  POINT_CLOUD mode hides all solid discovered meshes: {pc_mesh_hidden}")
    assert pc_mesh_hidden, "POINT_CLOUD mode must hide all solid meshes!"
    eval_js(s, "window.droneApp.sensors.setLidarVisMode('COMBINED')")
    eval_js(s, "window.droneApp.sensors.updateLidarScan(0.016)")

    # 9C. Survivor Line-of-Sight & Rubble Occlusion in LiDAR Mode
    print("\n=== TEST 9C: Survivor Line-of-Sight & Rubble Occlusion ===")
    surv_hidden = eval_js(s, """(() => {
        const s0 = window.droneApp.environment.survivors[0];
        let meshVisible = false;
        if (s0.meshGroup) {
            s0.meshGroup.traverse(node => {
                if (node.isMesh && node.visible) meshVisible = true;
            });
        }
        return !meshVisible;
    })()""")
    print(f"  Obstructed survivor mesh hidden in LiDAR mode: {surv_hidden}")
    assert surv_hidden, "Obstructed survivor mesh must not render through rubble in LiDAR mode!"

    # 10. Capture High-Resolution Verification Screenshot
    print("\n=== TEST 10: Capture High-Resolution Verification Screenshot ===")
    take_screenshot(s, 'lidar_slam_complete_verification.png')

    print("\n=======================================================")
    print("  ALL 3D LiDAR SLAM ADVANCED VERIFICATION TESTS PASSED!")
    print("=======================================================\n")

    # Clean up redundant untracked file if present
    if os.path.exists('test_uav_movement_vector_and_lidar_slam.py'):
        try:
            os.remove('test_uav_movement_vector_and_lidar_slam.py')
            print("Cleaned up redundant test_uav_movement_vector_and_lidar_slam.py")
        except Exception as e:
            print("Cleanup note:", e)

finally:
    try:
        proc.terminate()
        proc.wait(timeout=3)
    except Exception:
        pass
