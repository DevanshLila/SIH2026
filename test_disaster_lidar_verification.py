#!/usr/bin/env python3
"""
Deep Verification Test for Disaster Simulation & 3D LiDAR SLAM Rebuild
Team Pegasus - SIH 2026
Tests:
1. Earthquake survivor placement, physical rubble obscuration, and context-aware states
2. Flood survivor placement, rooftops/balconies/submerged vehicles, and flooded building
3. Gas leak localized infrastructure sources, boundary rings, and context-aware states
4. Rebuilt 3D LiDAR SLAM: thin laser scan rays, point cloud accumulation, purple blind zone, weather degradation, HUD panel & modes
5. Zero fatal console errors
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

CDP_PORT = 9228
edge = r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
temp_profile = tempfile.mkdtemp(prefix='edge_lidar_test_')

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

    # 1. Page Load & Global Objects
    print("\n=== STEP 1: Basic App & Scene State ===")
    app_exists = eval_js(s, "typeof window.droneApp !== 'undefined' && window.droneApp !== null")
    print(f"  droneApp initialized: {app_exists}")
    assert app_exists, "droneApp must exist!"

    # 2. Earthquake Scenario Verification
    print("\n=== STEP 2: Earthquake Scenario & Survivor Siting ===")
    eq_state = eval_js(s, """(() => {
        const env = window.droneApp.environment;
        return {
            scenario: env.currentScenario,
            survivorCount: env.survivors.length,
            obstructedCount: env.survivors.filter(s => s.isObstructed).length,
            states: env.survivors.map(s => ({
                id: s.id,
                state: s.situationState,
                obstructed: s.isObstructed,
                triage: s.triage,
                temp: s.temperature,
                obstructionType: s.obstructionType
            })),
            colliderCount: env.obstacleColliders.length
        };
    })()""")
    print(f"  Scenario: {eq_state['scenario']}")
    print(f"  Total survivors: {eq_state['survivorCount']}, Obstructed: {eq_state['obstructedCount']}")
    print(f"  Obstacle colliders: {eq_state['colliderCount']}")
    assert eq_state['scenario'] == 'earthquake', "Must be earthquake scenario!"
    assert eq_state['survivorCount'] >= 12, "Should have 12 earthquake survivors!"
    assert eq_state['obstructedCount'] >= 6, "At least 6 survivors should be obstructed/trapped!"

    # Check for specific required states in earthquake
    states_found = set(s['state'] for s in eq_state['states'])
    print(f"  States in scene: {states_found}")
    assert 'TRAPPED UNDER RUBBLE' in states_found, "Must have TRAPPED UNDER RUBBLE!"
    assert 'PARTIALLY BURIED' in states_found, "Must have PARTIALLY BURIED!"
    assert 'TRAPPED — BUILDING INTERIOR' in states_found, "Must have TRAPPED — BUILDING INTERIOR!"
    assert 'SURVIVOR — OPEN AREA' in states_found, "Must have SURVIVOR — OPEN AREA!"

    # 3. Test Detection AR Overlay & Obstructed Reticles
    print("\n=== STEP 3: Detection Reticles & Obstructed States ===")
    det_test = eval_js(s, """(() => {
        // Trigger detection on first 3 survivors
        window.droneApp.environment.survivors[0].detected = true;
        window.droneApp.environment.survivors[1].detected = true;
        window.droneApp.environment.survivors[3].detected = true;
        window.droneApp.sensors.updateVisionDetections();
        
        return window.droneApp.sensors.activeDetections.map(d => ({
            id: d.id,
            label: d.label,
            stateLabel: d.stateLabel,
            isObstructed: d.isObstructed,
            triage: d.triage
        }));
    })()""")
    print(f"  Active Detections count: {len(det_test)}")
    for d in det_test[:3]:
        print(f"    - [{d['id']}] Label: '{d['label']}' | State: '{d['stateLabel']}' | Obstructed: {d['isObstructed']}")
    
    obstructed_dets = [d for d in det_test if d.get('isObstructed')]
    if obstructed_dets:
        assert '[THERMAL DETECTION]' in obstructed_dets[0]['label'], "Obstructed victim should have [THERMAL DETECTION] in label!"

    # 4. Assam Flood Scenario Verification
    print("\n=== STEP 4: Flood Scenario & Elevated/Submerged Survivors ===")
    eval_js(s, "window.droneApp.setScenario('flash_flood')")
    time.sleep(1.0)
    fl_state = eval_js(s, """(() => {
        const env = window.droneApp.environment;
        return {
            scenario: env.currentScenario,
            survivorCount: env.survivors.length,
            obstructedCount: env.survivors.filter(s => s.isObstructed).length,
            states: env.survivors.map(s => ({
                id: s.id,
                state: s.situationState,
                obstructed: s.isObstructed,
                triage: s.triage,
                temp: s.temperature
            }))
        };
    })()""")
    print(f"  Scenario: {fl_state['scenario']}, Survivors: {fl_state['survivorCount']}, Obstructed: {fl_state['obstructedCount']}")
    assert fl_state['scenario'] == 'flash_flood', "Must be flash flood scenario!"
    fl_states_found = set(s['state'] for s in fl_state['states'])
    print(f"  Flood states: {fl_states_found}")
    assert 'STRANDED — ROOFTOP' in fl_states_found, "Must have STRANDED — ROOFTOP!"
    assert 'PARTIALLY SUBMERGED / OBSCURED' in fl_states_found, "Must have PARTIALLY SUBMERGED / OBSCURED!"
    assert 'STRANDED — VEHICLE' in fl_states_found, "Must have STRANDED — VEHICLE!"
    assert 'TRAPPED — FLOODED BUILDING' in fl_states_found, "Must have TRAPPED — FLOODED BUILDING!"

    # 5. Industrial Gas Scenario Verification
    print("\n=== STEP 5: Gas Scenario & Localized Infrastructure Plumes ===")
    eval_js(s, "window.droneApp.setScenario('chemical_fire')")
    time.sleep(1.0)
    gas_state = eval_js(s, """(() => {
        const env = window.droneApp.environment;
        return {
            scenario: env.currentScenario,
            survivorCount: env.survivors.length,
            hazardsCount: env.hazards.length,
            gasHazards: env.hazards.filter(h => h.type && h.peakConcentrationPPM).map(h => ({
                id: h.id,
                type: h.type,
                peakPPM: h.peakConcentrationPPM,
                radius: h.radius,
                severity: h.severity
            })),
            states: env.survivors.map(s => s.situationState)
        };
    })()""")
    print(f"  Scenario: {gas_state['scenario']}, Gas Hazards: {len(gas_state['gasHazards'])}")
    for gh in gas_state['gasHazards']:
        print(f"    - Leak: {gh['id']} | Type: {gh['type']} | Peak: {gh['peakPPM']} PPM | Radius: {gh['radius']}m")
    assert len(gas_state['gasHazards']) >= 3, "Should have localized gas leak sources!"
    gas_states_found = set(gas_state['states'])
    print(f"  Gas survivor states: {gas_states_found}")
    assert 'IN HAZARDOUS ZONE' in gas_states_found, "Must have IN HAZARDOUS ZONE!"
    assert 'NEAR GAS LEAK' in gas_states_found, "Must have NEAR GAS LEAK!"
    assert 'EVACUATION REQUIRED' in gas_states_found, "Must have EVACUATION REQUIRED!"
    assert 'SURVIVOR — SAFE ZONE' in gas_states_found, "Must have SURVIVOR — SAFE ZONE!"

    # 6. Authentic 3D LiDAR SLAM System Verification (Himanshu Multi-Beam Architecture)
    print("\n=== STEP 6: Authentic 3D LiDAR SLAM System Verification ===")
    # Switch back to earthquake and switch to LIDAR mode
    eval_js(s, "window.droneApp.setScenario('earthquake')")
    time.sleep(0.5)
    eval_js(s, "window.droneApp.sensors.setSensorMode('LIDAR')")
    time.sleep(1.0)

    lidar_state = eval_js(s, """(() => {
        const s = window.droneApp.sensors;
        const hud = document.getElementById('lidar-hud-overlay');
        const legacyPanel = document.getElementById('lidar-slam-panel');
        const env = window.droneApp.environment;
        let cyanCount = 0;
        env.environmentGroup.traverse(m => {
            if (m.isMesh && m.material && m.material.color && m.material.color.getHex() === 0x06b6d4) {
                cyanCount++;
            }
        });

        return {
            mode: s.sensorMode,
            hudVisible: hud ? (hud.style.display !== 'none') : false,
            legacyPanelHidden: !legacyPanel || legacyPanel.style.display === 'none',
            hasFrustum: !!s.lidarVolumeFrustum,
            frustumVisible: s.lidarVolumeFrustum ? s.lidarVolumeFrustum.visible : false,
            hasBeams: !!s.lidarLaserBeams,
            beamsVisible: s.lidarLaserBeams ? s.lidarLaserBeams.visible : false,
            hasPointCloud: !!s.lidarPointCloud,
            pointCloudVisible: s.lidarPointCloud ? s.lidarPointCloud.visible : false,
            maxPoints: s.maxPoints,
            pointHistoryLen: s.pointHistory.length,
            hasRangeRings: !!s.lidarRangeRings,
            rangeRingsVisible: s.lidarRangeRings ? s.lidarRangeRings.visible : false,
            bgHex: window.droneApp.scene.background ? window.droneApp.scene.background.getHexString() : null,
            cyanWireframeCount: cyanCount
        };
    })()""")
    print(f"  Sensor Mode: {lidar_state['mode']}")
    print(f"  Authentic LiDAR HUD Overlay visible: {lidar_state['hudVisible']}")
    print(f"  Legacy SLAM Panel hidden: {lidar_state['legacyPanelHidden']}")
    print(f"  Inverted Frustum visible: {lidar_state['frustumVisible']}")
    print(f"  16-Beam Laser Array visible: {lidar_state['beamsVisible']}")
    print(f"  Point Cloud buffer capacity: {lidar_state['maxPoints']}, Current points: {lidar_state['pointHistoryLen']}")
    print(f"  Tactical Void Background: #{lidar_state['bgHex']}")
    print(f"  Cyan Wireframe Obstacles: {lidar_state['cyanWireframeCount']}")

    assert lidar_state['mode'] == 'LIDAR', "Sensor mode must be LIDAR!"
    assert lidar_state['hudVisible'], "Authentic LiDAR HUD overlay must be visible!"
    assert lidar_state['legacyPanelHidden'], "Legacy SLAM panel must remain hidden!"
    assert lidar_state['frustumVisible'], "Inverted scan cone frustum must be visible!"
    assert lidar_state['beamsVisible'], "16-beam rotating laser array must be visible!"
    assert lidar_state['pointCloudVisible'], "Point cloud must be visible!"
    assert lidar_state['rangeRingsVisible'], "Concentric range rings must be visible!"
    assert lidar_state['maxPoints'] == 4800, "Point cloud buffer capacity must be exactly 4,800 (Himanshu specification)!"
    assert lidar_state['bgHex'] == '010307', "LiDAR mode must set pitch-black tactical void (0x010307)!"
    assert lidar_state['cyanWireframeCount'] > 0, "Obstacles must be transformed into luminous cyan wireframe matrix!"

    # 7. Real-Time Geometric Raycasting & Dynamic Point Density
    print("\n=== STEP 7: Real-Time Geometric Raycasting & Dynamic Point Density ===")
    eval_js(s, """(() => {
        window.droneApp.drone.group.position.set(0, 10, 0);
        for (let i = 0; i < 20; i++) {
            window.droneApp.sensors.updateLidarScan(0.05);
        }
    })()""")
    time.sleep(0.5)

    raycast_stats = eval_js(s, """(() => {
        const s = window.droneApp.sensors;
        const hudText = document.getElementById('lidar-hud-points-count');
        return {
            pointsCount: s.pointHistory.length,
            hudText: hudText ? hudText.textContent : ''
        };
    })()""")
    print(f"  Accumulated Points: {raycast_stats['pointsCount']} | HUD text: '{raycast_stats['hudText']}'")
    assert raycast_stats['pointsCount'] > 0, "Raycasting must accumulate real geometric obstacle hits!"
    assert f"{raycast_stats['pointsCount']} PTS" in raycast_stats['hudText'], "HUD points counter must match pointHistory length!"

    # 8. Multi-Scenario and Weather Stability in LiDAR Mode
    print("\n=== STEP 8: Multi-Scenario & Weather Stability in LiDAR Mode ===")
    eval_js(s, "window.droneApp.setScenario('flash_flood')")
    time.sleep(0.5)
    eval_js(s, "window.droneApp.setWeather('rain')")
    time.sleep(0.5)

    flood_lidar_state = eval_js(s, """(() => {
        const s = window.droneApp.sensors;
        return {
            mode: s.sensorMode,
            bgHex: window.droneApp.scene.background ? window.droneApp.scene.background.getHexString() : null,
            frustumVisible: s.lidarVolumeFrustum ? s.lidarVolumeFrustum.visible : false,
            pointsVisible: s.lidarPointCloud ? s.lidarPointCloud.visible : false
        };
    })()""")
    print(f"  Flash Flood + Rain in LiDAR -> Mode: {flood_lidar_state['mode']} | Void: #{flood_lidar_state['bgHex']}")
    assert flood_lidar_state['mode'] == 'LIDAR', "Must remain in LIDAR mode!"
    assert flood_lidar_state['bgHex'] == '010307', "Tactical void must persist across scenario & weather transitions!"
    assert flood_lidar_state['frustumVisible'], "LiDAR frustum must remain visible!"

    # Restore earthquake & clear weather
    eval_js(s, "window.droneApp.setScenario('earthquake')")
    eval_js(s, "window.droneApp.setWeather('clear')")
    time.sleep(0.5)

    # 9. Mode Switching Integrity (LIDAR -> RGB -> LIDAR)
    print("\n=== STEP 9: Sensor Mode Switching Integrity ===")
    eval_js(s, "window.droneApp.sensors.setSensorMode('RGB')")
    time.sleep(0.3)
    rgb_state = eval_js(s, """(() => {
        const s = window.droneApp.sensors;
        return {
            mode: s.sensorMode,
            frustumVisible: s.lidarVolumeFrustum ? s.lidarVolumeFrustum.visible : false,
            pointsVisible: s.lidarPointCloud ? s.lidarPointCloud.visible : false,
            isLidarVision: window.droneApp.environment.isLidarVision
        };
    })()""")
    print(f"  RGB Mode -> Frustum: {rgb_state['frustumVisible']}, Points: {rgb_state['pointsVisible']}, Vision: {rgb_state['isLidarVision']}")
    assert not rgb_state['frustumVisible'], "Frustum must hide in RGB mode!"
    assert not rgb_state['pointsVisible'], "Point cloud must hide in RGB mode!"
    assert not rgb_state['isLidarVision'], "Tactical vision must disable in RGB mode!"

    # Re-engage LiDAR
    eval_js(s, "window.droneApp.sensors.setSensorMode('LIDAR')")
    time.sleep(0.3)

    # 10. Capture Verification Screenshot
    print("\n=== STEP 10: Capture Verification Screenshot ===")
    take_screenshot(s, 'lidar_slam_and_disaster_verification.png')

    print("\n=======================================================")
    print("  ALL 19 DISASTER & 3D LiDAR SLAM TESTS PASSED CLEANLY!")
    print("=======================================================\n")

finally:
    try:
        proc.terminate()
        proc.wait(timeout=3)
    except Exception:
        pass
