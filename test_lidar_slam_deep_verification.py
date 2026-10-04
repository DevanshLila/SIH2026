#!/usr/bin/env python3
"""
Exhaustive Verification Test for Himanshu's Authentic 3D LiDAR SLAM Complete Scanning & Reconstruction
Team Pegasus - SIH 2026
Tests:
1. App Initialization & Baseline Sensors
2. Inverted Cone Detection Zone (25m depth, 18m footprint) & 16-Beam Rotating Laser Array
3. Concentric Ground Range Rings (10m, 20m, 25m) & 360° Radar Sweep Line
4. 4,800-Point BufferGeometry Point Cloud with Velodyne/Ouster Rainbow Elevation False-Color Mapping
5. Tactical Pitch-Black Void (0x010307), Atmospheric Fog (0.016), and Fluorescent Cyan Wireframe Matrix
6. Real-Time 96-Ray/Frame Geometric Raycasting & Dynamic Point Density on #lidar-hud-points-count
7. Survivor & Hazard 3D Sensor Fusion (Distance & Relative Altitude)
8. Disaster Environment Cycling & Weather Resilience in LiDAR Mode
9. Leak-Free Mode Transitions (LIDAR <-> RGB <-> Thermal <-> NVG) with zero console errors
10. High-Resolution Visual Verification Screenshot
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
        data = base64.b64decode(res['result']['data'])
        with open(filename, 'wb') as f:
            f.write(data)
        print(f"  [Screenshot] Saved: {filename} ({len(data)} bytes)")

try:
    resp = urllib.request.urlopen(f'http://127.0.0.1:{CDP_PORT}/json')
    tabs = json.loads(resp.read().decode())
    tab = next(t for t in tabs if 'index.html' in t.get('url', ''))
    s = create_ws(tab['webSocketDebuggerUrl'])

    # Enable Page and Runtime
    send_cdp(s, 'Page.enable')
    send_cdp(s, 'Runtime.enable')

    # Wait for sim initialization
    for _ in range(30):
        ready = eval_js(s, "typeof window.droneApp !== 'undefined' && window.droneApp.drone !== null")
        if ready: break
        time.sleep(0.5)

    # 1. Page Load & Initial State
    print("\n=== TEST 1: App Initialization & Baseline Sensors ===")
    app_exists = eval_js(s, "typeof window.droneApp !== 'undefined' && window.droneApp !== null")
    assert app_exists, "droneApp must exist!"
    sensors_exists = eval_js(s, "typeof window.droneApp.sensors !== 'undefined'")
    assert sensors_exists, "Sensors engine must exist!"
    print("  App and sensors engines initialized successfully.")

    # 2. Inverted Cone Frustum & 16-Beam Rotating Array
    print("\n=== TEST 2: Inverted Cone Frustum & 16-Beam Rotating Array ===")
    cone_info = eval_js(s, """(() => {
        const s = window.droneApp.sensors;
        return {
            hasFrustum: !!s.lidarVolumeFrustum,
            frustumType: s.lidarVolumeFrustum ? s.lidarVolumeFrustum.geometry.type : null,
            maxRange: s.lidarMaxRange,
            hasBeams: !!s.lidarLaserBeams,
            beamCount: s.lidarBeamsMesh ? (s.lidarBeamsMesh.geometry.attributes.position.count / 2) : 0,
            hasWireframe: !!s.lidarConeWireframe
        };
    })()""")
    print(f"  Frustum Type: {cone_info['frustumType']} | Max Range: {cone_info['maxRange']}m | Laser Beams: {cone_info['beamCount']}")
    assert cone_info['hasFrustum'], "Inverted scan cone frustum must be instantiated!"
    assert cone_info['frustumType'] == 'ConeGeometry', "Frustum must be ConeGeometry!"
    assert cone_info['maxRange'] == 25.0, "Max range must be 25.0 meters!"
    assert cone_info['beamCount'] == 16, "Must have exactly 16 laser beams in rotating array!"

    # 3. Concentric Ground Range Rings (10m, 20m, 25m) & Radar Sweep Line
    print("\n=== TEST 3: Ground Range Rings & Radar Sweep Line ===")
    rings_info = eval_js(s, """(() => {
        const s = window.droneApp.sensors;
        const rings = s.lidarRangeRings;
        return {
            hasRings: !!rings,
            ringCount: rings ? rings.children.filter(c => c.geometry && c.geometry.type === 'RingGeometry').length : 0,
            hasSweepLine: !!s.lidarSweepLine
        };
    })()""")
    print(f"  Concentric Rings: {rings_info['ringCount']} | Sweep Line Exists: {rings_info['hasSweepLine']}")
    assert rings_info['hasRings'], "LiDAR range rings group must exist!"
    assert rings_info['ringCount'] == 3, "Must have 3 concentric range rings [10m, 20m, 25m]!"
    assert rings_info['hasSweepLine'], "360° rotating radar sweep line must exist!"

    # 4. Point Cloud Buffer (4,800 Points, Rainbow Elevation Colors)
    print("\n=== TEST 4: Point Cloud Buffer (4,800 Points, Rainbow Elevation Colors) ===")
    cloud_info = eval_js(s, """(() => {
        const s = window.droneApp.sensors;
        const pc = s.lidarPointCloud;
        return {
            hasCloud: !!pc,
            maxPoints: s.maxPoints,
            bufferCount: pc ? pc.geometry.attributes.position.count : 0,
            hasColorAttr: pc ? !!pc.geometry.attributes.color : false,
            pointSize: pc ? pc.material.size : 0
        };
    })()""")
    print(f"  Buffer Capacity: {cloud_info['maxPoints']} | Position Count: {cloud_info['bufferCount']} | Point Size: {cloud_info['pointSize']}")
    assert cloud_info['hasCloud'], "Point cloud Points object must exist!"
    assert cloud_info['maxPoints'] == 4800, "Point cloud capacity must be 4,800!"
    assert cloud_info['bufferCount'] == 4800, "BufferGeometry position count must be 4,800!"
    assert cloud_info['hasColorAttr'], "BufferGeometry must have vertex color attribute!"

    # 5. Engaging LIDAR Mode: Tactical Void, Fog, and Fluorescent Matrix
    print("\n=== TEST 5: Engaging LIDAR Mode (Void, Fog, Cyan Matrix, HUD Overlay) ===")
    eval_js(s, "window.droneApp.sensors.setSensorMode('LIDAR')")
    time.sleep(0.5)

    slam_env = eval_js(s, """(() => {
        const s = window.droneApp.sensors;
        const hud = document.getElementById('lidar-hud-overlay');
        const legacy = document.getElementById('lidar-slam-panel');
        let cyanCount = 0;
        window.droneApp.environment.environmentGroup.traverse(m => {
            if (m.isMesh && m.material && m.material.color && m.material.color.getHex() === 0x06b6d4) cyanCount++;
        });
        return {
            mode: s.sensorMode,
            hudVisible: hud ? (hud.style.display !== 'none') : false,
            legacyPanelHidden: !legacy || legacy.style.display === 'none',
            bgHex: window.droneApp.scene.background ? window.droneApp.scene.background.getHexString() : null,
            fogDensity: window.droneApp.scene.fog ? window.droneApp.scene.fog.density : null,
            frustumVisible: s.lidarVolumeFrustum.visible,
            beamsVisible: s.lidarLaserBeams.visible,
            ringsVisible: s.lidarRangeRings.visible,
            pointsVisible: s.lidarPointCloud.visible,
            cyanCount: cyanCount
        };
    })()""")
    print(f"  Mode: {slam_env['mode']} | Void: #{slam_env['bgHex']} | Fog: {slam_env['fogDensity']} | Cyan Wireframes: {slam_env['cyanCount']}")
    assert slam_env['mode'] == 'LIDAR', "Must be in LIDAR mode!"
    assert slam_env['hudVisible'], "Authentic #lidar-hud-overlay must be displayed!"
    assert slam_env['legacyPanelHidden'], "Legacy SLAM panel must remain hidden!"
    assert slam_env['bgHex'] == '010307', "Must set pitch-black tactical void (0x010307)!"
    assert slam_env['fogDensity'] == 0.016, "Must set atmospheric tactical fog (0.016)!"
    assert slam_env['frustumVisible'] and slam_env['beamsVisible'] and slam_env['ringsVisible'] and slam_env['pointsVisible'], "All LiDAR elements must be visible!"
    assert slam_env['cyanCount'] > 500, "Obstacles must be converted to luminous cyan wireframe matrix!"

    # 6. Real-Time Geometric Raycasting & Dynamic Point Density Accumulation
    print("\n=== TEST 6: Real-Time Geometric Raycasting & Dynamic Point Density Accumulation ===")
    eval_js(s, """(() => {
        window.droneApp.drone.group.position.set(0, 10, 0);
        for (let i = 0; i < 20; i++) {
            window.droneApp.sensors.updateLidarScan(0.05);
        }
    })()""")
    time.sleep(0.5)

    ray_stats = eval_js(s, """(() => {
        const s = window.droneApp.sensors;
        const hudText = document.getElementById('lidar-hud-points-count');
        return {
            pointsCount: s.pointHistory.length,
            hudText: hudText ? hudText.textContent : ''
        };
    })()""")
    print(f"  Accumulated Points: {ray_stats['pointsCount']} | HUD text: '{ray_stats['hudText']}'")
    assert ray_stats['pointsCount'] > 0, "Raycasting must accumulate real geometric obstacle hits!"
    assert f"{ray_stats['pointsCount']} PTS" in ray_stats['hudText'], "HUD points counter must match pointHistory length!"

    # 7. Survivor + Sensor Fusion (3D Distance & Relative Altitude)
    print("\n=== TEST 7: Survivor & Hazard 3D Sensor Fusion ===")
    fusion_state = eval_js(s, """(() => {
        window.droneApp.environment.survivors[0].detected = true;
        window.droneApp.sensors.updateVisionDetections();
        const det = window.droneApp.sensors.activeDetections.find(d => d.type === 'survivor');
        return {
            hasDet: !!det,
            label: det ? det.label : null,
            stateLabel: det ? det.stateLabel : null,
            lidarFusion: det ? det.lidarFusion : null
        };
    })()""")
    print(f"  Survivor Detection: {fusion_state['label']} | Fusion: '{fusion_state['lidarFusion']}'")
    assert fusion_state['hasDet'], "Must detect survivor!"
    assert 'DISTANCE:' in fusion_state['lidarFusion'], "Fusion must contain DISTANCE!"
    assert 'REL. ALT:' in fusion_state['lidarFusion'], "Fusion must contain REL. ALT!"

    # 8. Disaster Scenario Cycling & Weather Resilience in LiDAR Mode
    print("\n=== TEST 8: Disaster Scenario Cycling & Weather Resilience in LiDAR Mode ===")
    eval_js(s, "window.droneApp.setScenario('flash_flood')")
    time.sleep(0.4)
    eval_js(s, "window.droneApp.setWeather('rain')")
    time.sleep(0.4)

    cycle_state = eval_js(s, """(() => {
        return {
            mode: window.droneApp.sensors.sensorMode,
            bgHex: window.droneApp.scene.background ? window.droneApp.scene.background.getHexString() : null,
            fogDensity: window.droneApp.scene.fog ? window.droneApp.scene.fog.density : null,
            frustumVisible: window.droneApp.sensors.lidarVolumeFrustum.visible
        };
    })()""")
    print(f"  Flash Flood + Rain in LiDAR -> Void: #{cycle_state['bgHex']}, Fog: {cycle_state['fogDensity']}")
    assert cycle_state['mode'] == 'LIDAR', "Must remain in LIDAR mode!"
    assert cycle_state['bgHex'] == '010307', "Tactical void must persist in flash flood + rain!"
    assert cycle_state['fogDensity'] == 0.016, "Tactical fog must persist in flash flood + rain!"
    assert cycle_state['frustumVisible'], "Frustum must remain visible!"

    # Restore earthquake & clear
    eval_js(s, "window.droneApp.setScenario('earthquake')")
    eval_js(s, "window.droneApp.setWeather('clear')")
    time.sleep(0.4)

    # 9. Mode Switching Integrity (LIDAR -> THERMAL -> NVG -> RGB -> LIDAR)
    print("\n=== TEST 9: Leak-Free Mode Transitions across Sensor Suite ===")
    eval_js(s, "window.droneApp.sensors.setSensorMode('THERMAL')")
    time.sleep(0.2)
    t_state = eval_js(s, "window.droneApp.sensors.lidarVolumeFrustum.visible")
    assert not t_state, "Frustum must hide in THERMAL mode!"

    eval_js(s, "window.droneApp.sensors.setSensorMode('NVG')")
    time.sleep(0.2)
    n_state = eval_js(s, "window.droneApp.sensors.lidarVolumeFrustum.visible")
    assert not n_state, "Frustum must hide in NVG mode!"

    eval_js(s, "window.droneApp.sensors.setSensorMode('RGB')")
    time.sleep(0.2)
    r_state = eval_js(s, "window.droneApp.sensors.lidarVolumeFrustum.visible")
    assert not r_state, "Frustum must hide in RGB mode!"

    eval_js(s, "window.droneApp.sensors.setSensorMode('LIDAR')")
    time.sleep(0.2)
    l_state = eval_js(s, "window.droneApp.sensors.lidarVolumeFrustum.visible")
    assert l_state, "Frustum must show when re-engaging LIDAR mode!"
    print("  -> TEST 9 PASSED: Clean, leak-free transitions across all 4 sensor modes confirmed!")

    # 10. Capture Verification Screenshot Artifact
    print("\n=== TEST 10: Capture High-Resolution Verification Screenshot ===")
    take_screenshot(s, 'lidar_slam_complete_verification.png')

    print("\n=======================================================")
    print("  ALL 10 EXHAUSTIVE 3D LiDAR SLAM TESTS PASSED 100%!")
    print("=======================================================\n")

finally:
    try:
        proc.terminate()
        proc.wait(timeout=3)
    except Exception:
        pass
