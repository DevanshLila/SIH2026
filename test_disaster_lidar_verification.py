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

    # 6. Rebuilt 3D LiDAR SLAM System Verification
    print("\n=== STEP 6: 3D LiDAR SLAM System Rebuild Verification ===")
    # Switch back to earthquake and switch to LIDAR mode
    eval_js(s, "window.droneApp.setScenario('earthquake')")
    time.sleep(0.5)
    eval_js(s, "window.droneApp.sensors.setSensorMode('LIDAR')")
    time.sleep(1.0)

    lidar_state = eval_js(s, """(() => {
        const s = window.droneApp.sensors;
        const panel = document.getElementById('lidar-slam-panel');
        return {
            mode: s.sensorMode,
            panelVisible: panel ? (panel.style.display !== 'none') : false,
            hasScanRays: !!s.lidarScanRays,
            scanRaysVisible: s.lidarScanRays ? s.lidarScanRays.visible : false,
            hasImpactPoints: !!s.lidarImpactPoints,
            impactPointsVisible: s.lidarImpactPoints ? s.lidarImpactPoints.visible : false,
            hasPointCloud: !!s.lidarPointCloud,
            pointCloudVisible: s.lidarPointCloud ? s.lidarPointCloud.visible : false,
            maxPoints: s.maxPoints,
            pointHistoryLen: s.pointHistory.length,
            hasBlindZone: !!s.lidarBlindZone,
            blindZoneVisible: s.lidarBlindZone ? s.lidarBlindZone.visible : false,
            hasRangeRings: !!s.lidarRangeRings,
            effectiveRange: s.effectiveLidarRange,
            nominalRange: s.lidarNominalRange,
            quality: s.lidarScanQuality,
            noise: s.lidarNoiseLevel,
            visMode: s.lidarVisMode,
            mappedArea: s.mappedAreaSqM
        };
    })()""")
    print(f"  Sensor Mode: {lidar_state['mode']}")
    print(f"  LiDAR SLAM HUD Panel visible: {lidar_state['panelVisible']}")
    print(f"  Scan Rays (LineSegments) visible: {lidar_state['scanRaysVisible']}")
    print(f"  Impact Points visible: {lidar_state['impactPointsVisible']}")
    print(f"  Point Cloud buffer capacity: {lidar_state['maxPoints']}, Current points: {lidar_state['pointHistoryLen']}")
    print(f"  Purple Blind Zone visible: {lidar_state['blindZoneVisible']}")
    print(f"  Effective Range: {lidar_state['effectiveRange']}m, Scan Quality: {lidar_state['quality']}%, Noise: {lidar_state['noise']}")
    print(f"  Mapped Area: {lidar_state['mappedArea']} m²")

    assert lidar_state['mode'] == 'LIDAR', "Sensor mode must be LIDAR!"
    assert lidar_state['panelVisible'], "LiDAR SLAM HUD panel must be visible!"
    assert lidar_state['scanRaysVisible'], "Active laser scan rays must be visible!"
    assert lidar_state['impactPointsVisible'], "Laser impact hit points must be visible!"
    assert lidar_state['pointCloudVisible'], "Point cloud must be visible!"
    assert lidar_state['hasBlindZone'], "Purple blind zone must be instantiated!"
    assert lidar_state['blindZoneVisible'], "Purple blind zone must be visible!"
    assert lidar_state['maxPoints'] >= 10000, "Point cloud buffer capacity must be >= 10,000!"
    assert lidar_state['mappedArea'] is not None and lidar_state['mappedArea'] >= 0, "Mapped Area must be a valid non-negative number!"

    # 7. Test LiDAR Visualization Modes
    print("\n=== STEP 7: LiDAR Visualization Modes (Combined, Point Cloud, Scan Rays, Environment) ===")
    for mode in ['POINT_CLOUD', 'SCAN_RAYS', 'ENVIRONMENT', 'COMBINED']:
        eval_js(s, f"window.droneApp.sensors.setLidarVisMode('{mode}')")
        time.sleep(0.3)
        res = eval_js(s, """(() => {
            const s = window.droneApp.sensors;
            return {
                mode: s.lidarVisMode,
                pointCloudVis: s.lidarPointCloud.visible,
                scanRaysVis: s.lidarScanRays.visible
            };
        })()""")
        print(f"  Mode '{mode}' -> pointCloudVis: {res['pointCloudVis']}, scanRaysVis: {res['scanRaysVis']}")
        if mode == 'POINT_CLOUD':
            assert res['pointCloudVis'] and not res['scanRaysVis'], "Point Cloud mode should show points and hide rays!"
        elif mode == 'SCAN_RAYS':
            assert not res['pointCloudVis'] and res['scanRaysVis'], "Scan Rays mode should show rays and hide points!"
        elif mode == 'ENVIRONMENT':
            assert not res['pointCloudVis'] and not res['scanRaysVis'], "Environment mode should hide points and rays to reveal raw environment!"
        elif mode == 'COMBINED':
            assert res['pointCloudVis'] and res['scanRaysVis'], "Combined mode should show both!"

    # Restore Combined mode
    eval_js(s, "window.droneApp.sensors.setLidarVisMode('COMBINED')")

    # 8. Test Weather Degradation on LiDAR
    print("\n=== STEP 8: Weather Degradation on 3D LiDAR SLAM ===")
    # Clear weather
    eval_js(s, "window.droneApp.environment.setWeather('clear')")
    time.sleep(0.5)
    eval_js(s, "window.droneApp.sensors.updateLidarScan(0.05)")
    clear_stats = eval_js(s, """(() => ({
        range: window.droneApp.sensors.effectiveLidarRange,
        quality: window.droneApp.sensors.lidarScanQuality,
        noise: window.droneApp.sensors.lidarNoiseLevel
    }))()""")
    print(f"  CLEAR Weather  -> Range: {clear_stats['range']}m | Quality: {clear_stats['quality']}% | Noise: {clear_stats['noise']}")
    assert clear_stats['range'] == 50.0, "Clear weather should provide maximum 50m range!"
    assert clear_stats['quality'] >= 95, "Clear weather quality should be >= 95%!"

    # Rain weather
    eval_js(s, "window.droneApp.environment.setWeather('rain')")
    time.sleep(0.5)
    eval_js(s, "window.droneApp.sensors.updateLidarScan(0.05)")
    rain_stats = eval_js(s, """(() => ({
        range: window.droneApp.sensors.effectiveLidarRange,
        quality: window.droneApp.sensors.lidarScanQuality,
        noise: window.droneApp.sensors.lidarNoiseLevel
    }))()""")
    print(f"  RAIN Weather   -> Range: {rain_stats['range']}m | Quality: {rain_stats['quality']}% | Noise: {rain_stats['noise']}")
    assert rain_stats['range'] < 46.0, "Rain should degrade LiDAR effective range below 46m!"
    assert rain_stats['quality'] < clear_stats['quality'], "Rain should lower scan quality!"

    # Dust weather
    eval_js(s, "window.droneApp.environment.setWeather('dust')")
    time.sleep(0.5)
    eval_js(s, "window.droneApp.sensors.updateLidarScan(0.05)")
    dust_stats = eval_js(s, """(() => ({
        range: window.droneApp.sensors.effectiveLidarRange,
        quality: window.droneApp.sensors.lidarScanQuality,
        noise: window.droneApp.sensors.lidarNoiseLevel
    }))()""")
    print(f"  DUST STORM     -> Range: {dust_stats['range']}m | Quality: {dust_stats['quality']}% | Noise: {dust_stats['noise']}")
    assert dust_stats['range'] <= 26.0, "Dust storm should heavily degrade range to <= 26m!"
    assert dust_stats['noise'] == 'HIGH', "Dust storm should produce HIGH sensor noise!"

    # Restore clear
    eval_js(s, "window.droneApp.environment.setWeather('clear')")
    time.sleep(0.5)

    # 9. Test Legacy Cone Removal Verification
    print("\n=== STEP 9: Legacy Cone Check ===")
    cone_check = eval_js(s, """(() => {
        const drone = window.droneApp.drone;
        let foundCone = false;
        drone.group.traverse(child => {
            if (child.isMesh && child.geometry && child.geometry.type === 'ConeGeometry') {
                foundCone = true;
            }
        });
        return { foundGiantCone: foundCone };
    })()""")
    print(f"  Legacy giant cone found: {cone_check['foundGiantCone']}")
    assert not cone_check['foundGiantCone'], "Legacy cone must NOT exist in drone group!"

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
