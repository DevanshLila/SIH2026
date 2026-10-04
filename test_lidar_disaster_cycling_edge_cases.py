#!/usr/bin/env python3
"""
Automated CDP Test Suite for 3D LiDAR SLAM Disaster Cycling, Weather Resilience, and Atmosphere Integrity
Team Pegasus - SIH 2026
"""

import http.server, threading, time, subprocess, json, socket, base64, struct, urllib.request, tempfile, sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')

PORT = 8000
try:
    urllib.request.urlopen(f'http://127.0.0.1:{PORT}/index.html', timeout=2)
    print(f"Connected to existing simulation server on port {PORT}")
except Exception:
    print(f"Starting server on port {PORT}")
    server = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), http.server.SimpleHTTPRequestHandler)
    t = threading.Thread(target=server.serve_forever, daemon=True)
    t.start()

CDP_PORT = 9295
edge = r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
temp_profile = tempfile.mkdtemp(prefix='edge_lidar_cycle_')

cmd = [
    edge,
    '--headless=new',
    f'--remote-debugging-port={CDP_PORT}',
    '--remote-allow-origins=*',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1600,900',
    f'--user-data-dir={temp_profile}',
    f'http://127.0.0.1:{PORT}/index.html'
]
proc = subprocess.Popen(cmd)
time.sleep(3.5)

def create_ws(url):
    parts = url.replace('ws://', '').split('/', 1)
    host, port = parts[0].split(':')
    path = '/' + parts[1]
    s = socket.create_connection((host, int(port)))
    key = base64.b64encode(b'antigravitylidartest').decode()
    req = f'GET {path} HTTP/1.1\r\nHost: {host}:{port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n'
    s.sendall(req.encode())
    resp = s.recv(4096)
    if b'101 ' not in resp:
        raise AssertionError('Handshake failed: ' + repr(resp))
    return s

counter = 0
def send_cdp(s, method, params=None):
    global counter
    counter += 1
    msg_id = counter
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
            total_len = offset + payload_len
            if len(buf) < total_len: break
            raw_payload = bytes(buf[offset:total_len])
            buf = buf[total_len:]
            data = json.loads(raw_payload.decode('utf-8', errors='ignore'))
            if target_id is None or data.get('id') == target_id:
                return data

def eval_js(s, expr):
    msg_id = send_cdp(s, 'Runtime.evaluate', {'expression': expr, 'returnByValue': True})
    res = recv_cdp(s, msg_id)
    if 'result' in res and 'result' in res['result']:
        return res['result']['result'].get('value')
    return None

try:
    resp = urllib.request.urlopen(f'http://127.0.0.1:{CDP_PORT}/json')
    targets = json.loads(resp.read().decode())
    target = next(t for t in targets if 'index.html' in t.get('url', ''))
    s = create_ws(target['webSocketDebuggerUrl'])

    print("CDP Connected successfully to simulation!")
    time.sleep(1.0)

    # TEST 1: Activate LIDAR Mode Baseline
    print("\n=======================================================")
    print("  TEST 1: Activate LiDAR SLAM Mode Baseline")
    print("=======================================================")
    eval_js(s, "window.droneApp.sensors.setSensorMode('LIDAR')")
    time.sleep(0.5)

    base_state = eval_js(s, """(() => {
        const s = window.droneApp.sensors;
        const env = window.droneApp.environment;
        let cyanCount = 0;
        env.environmentGroup.traverse(m => {
            if (m.isMesh && m.material && m.material.color && m.material.color.getHex() === 0x06b6d4) cyanCount++;
        });
        return {
            mode: s.sensorMode,
            bgHex: window.droneApp.scene.background ? window.droneApp.scene.background.getHexString() : null,
            fogDensity: window.droneApp.scene.fog ? window.droneApp.scene.fog.density : null,
            cyanCount: cyanCount
        };
    })()""")
    print("  Base State in Earthquake:", base_state)
    assert base_state['mode'] == 'LIDAR', "Must be in LIDAR mode!"
    assert base_state['bgHex'] == '010307', "Baseline background must be pitch-black tactical void (0x010307)!"
    assert base_state['fogDensity'] == 0.016, "Baseline fog density must be 0.016!"
    assert base_state['cyanCount'] > 500, "Must have >500 cyan wireframe obstacle meshes in earthquake!"
    print("  -> TEST 1 PASSED: Baseline LiDAR SLAM environment verified!")

    # TEST 2: Rapid Disaster Scenario Cycling in Active LiDAR Mode
    print("\n=======================================================")
    print("  TEST 2: Rapid Disaster Scenario Cycling in Active LiDAR Mode")
    print("=======================================================")
    for scenario in ['flash_flood', 'chemical_fire', 'earthquake', 'flash_flood']:
        eval_js(s, f"window.droneApp.setScenario('{scenario}')")
        time.sleep(0.4)
        scen_state = eval_js(s, """(() => {
            const s = window.droneApp.sensors;
            const env = window.droneApp.environment;
            let cyanCount = 0;
            env.environmentGroup.traverse(m => {
                if (m.isMesh && m.material && m.material.color && m.material.color.getHex() === 0x06b6d4) cyanCount++;
            });
            return {
                mode: s.sensorMode,
                scenario: env.currentScenario,
                bgHex: window.droneApp.scene.background ? window.droneApp.scene.background.getHexString() : null,
                fogDensity: window.droneApp.scene.fog ? window.droneApp.scene.fog.density : null,
                cyanCount: cyanCount,
                frustumVisible: s.lidarVolumeFrustum ? s.lidarVolumeFrustum.visible : false,
                ringsVisible: s.lidarRangeRings ? s.lidarRangeRings.visible : false
            };
        })()""")
        print(f"  Switched to '{scen_state['scenario']}' -> Void: #{scen_state['bgHex']} | Fog: {scen_state['fogDensity']} | Cyan: {scen_state['cyanCount']} | Frustum: {scen_state['frustumVisible']}")
        assert scen_state['mode'] == 'LIDAR', "Must remain in LIDAR mode!"
        assert scen_state['bgHex'] == '010307', f"Tactical void must persist in {scenario}!"
        assert scen_state['fogDensity'] == 0.016, f"Tactical fog must persist in {scenario}!"
        assert scen_state['cyanCount'] > 100, f"New scenario meshes must be converted to cyan wireframes in {scenario}!"
        assert scen_state['frustumVisible'], f"Frustum must remain visible in {scenario}!"
    print("  -> TEST 2 PASSED: Seamless disaster scenario cycling in LiDAR mode verified!")

    # TEST 3: Ground Range Rings Elevation Alignment in Flash Flood
    print("\n=======================================================")
    print("  TEST 3: Ground Range Rings Elevation Alignment in Flash Flood")
    print("=======================================================")
    eval_js(s, "window.droneApp.setScenario('flash_flood')")
    time.sleep(0.4)
    eval_js(s, "window.droneApp.sensors.updateLidarScan(0.05)")

    flood_ring_y = eval_js(s, "window.droneApp.sensors.lidarRangeRings.position.y")
    print(f"  Flash Flood Range Rings Y: {flood_ring_y}m (Water surface ~1.48m)")
    assert flood_ring_y >= 1.50, "Ground range rings must ride above water surface in flash flood!"

    eval_js(s, "window.droneApp.setScenario('earthquake')")
    time.sleep(0.4)
    eval_js(s, "window.droneApp.sensors.updateLidarScan(0.05)")

    eq_ring_y = eval_js(s, "window.droneApp.sensors.lidarRangeRings.position.y")
    print(f"  Earthquake Range Rings Y: {eq_ring_y}m")
    assert eq_ring_y == 0.05, "Ground range rings must ride at ground level 0.05m in earthquake!"
    print("  -> TEST 3 PASSED: Dynamic scenario terrain altitude alignment for range rings verified!")

    # TEST 4: Weather Cycling in Active LiDAR Mode
    print("\n=======================================================")
    print("  TEST 4: Weather Cycling in Active LiDAR Mode")
    print("=======================================================")
    for weather in ['rain', 'dust', 'snow', 'windy', 'cloudy', 'clear']:
        eval_js(s, f"window.droneApp.setWeather('{weather}')")
        time.sleep(0.2)
        w_state = eval_js(s, """(() => {
            return {
                mode: window.droneApp.sensors.sensorMode,
                bgHex: window.droneApp.scene.background ? window.droneApp.scene.background.getHexString() : null,
                fogDensity: window.droneApp.scene.fog ? window.droneApp.scene.fog.density : null
            };
        })()""")
        assert w_state['bgHex'] == '010307', f"Weather {weather} must not overwrite tactical void background!"
        assert w_state['fogDensity'] == 0.016, f"Weather {weather} must not overwrite tactical void fog!"
    print("  -> TEST 4 PASSED: Weather changes while in LiDAR mode preserve authentic SLAM void!")

    # TEST 5: Day / Night Mode Toggle in Active LiDAR Mode
    print("\n=======================================================")
    print("  TEST 5: Day / Night Mode Toggle in Active LiDAR Mode")
    print("=======================================================")
    eval_js(s, "window.droneApp.toggleDayNightMode(true)") # Switch to Night
    time.sleep(0.3)
    night_lidar_bg = eval_js(s, "window.droneApp.scene.background.getHexString()")
    assert night_lidar_bg == '010307', "Night mode toggle must preserve LiDAR void!"

    eval_js(s, "window.droneApp.toggleDayNightMode(false)") # Switch to Day
    time.sleep(0.3)
    day_lidar_bg = eval_js(s, "window.droneApp.scene.background.getHexString()")
    assert day_lidar_bg == '010307', "Day mode toggle must preserve LiDAR void!"
    print("  -> TEST 5 PASSED: Day/Night mode toggles preserve LiDAR void!")

    # TEST 6: Switching Back to RGB, Thermal, NVG and Restoring Scenario Atmosphere
    print("\n=======================================================")
    print("  TEST 6: Mode Switching Restores Authentic Scenario Atmosphere & Materials")
    print("=======================================================")
    eval_js(s, "window.droneApp.setScenario('flash_flood')")
    time.sleep(0.4)
    # In flood, switch to RGB
    eval_js(s, "window.droneApp.sensors.setSensorMode('RGB')")
    time.sleep(0.3)

    rgb_flood_state = eval_js(s, """(() => {
        const env = window.droneApp.environment;
        let wireframeCount = 0;
        env.environmentGroup.traverse(m => {
            if (m.isMesh && m.material && m.material.wireframe) wireframeCount++;
        });
        return {
            bgHex: window.droneApp.scene.background ? window.droneApp.scene.background.getHexString() : null,
            wireframeCount: wireframeCount,
            isLidarVision: env.isLidarVision
        };
    })()""")
    print("  RGB in Flash Flood:", rgb_flood_state)
    assert not rgb_flood_state['isLidarVision'], "LiDAR vision must be disabled in RGB!"
    assert rgb_flood_state['wireframeCount'] == 0, "All meshes must restore solid PBR materials (0 wireframes) in RGB!"
    assert rgb_flood_state['bgHex'] != '010307', "Atmosphere must restore authentic daytime sky color in RGB!"

    # Re-engage LiDAR
    eval_js(s, "window.droneApp.sensors.setSensorMode('LIDAR')")
    time.sleep(0.3)
    resumed_lidar_bg = eval_js(s, "window.droneApp.scene.background.getHexString()")
    assert resumed_lidar_bg == '010307', "Re-engaging LiDAR must restore tactical void!"
    print("  -> TEST 6 PASSED: Sensor mode transitions restore and clean up atmosphere and materials!")

    # TEST 7: Sustained Raycasting & Buffer Recycling
    print("\n=======================================================")
    print("  TEST 7: Sustained Raycasting & Buffer Capacity Stabilization")
    print("=======================================================")
    eval_js(s, """(() => {
        window.droneApp.drone.group.position.set(0, 10, 0);
        for (let i = 0; i < 60; i++) {
            window.droneApp.sensors.updateLidarScan(0.05);
        }
    })()""")
    time.sleep(0.5)

    buffer_stats = eval_js(s, """(() => {
        const s = window.droneApp.sensors;
        return {
            pointHistoryLen: s.pointHistory.length,
            maxPoints: s.maxPoints
        };
    })()""")
    print(f"  Accumulated Buffer Points: {buffer_stats['pointHistoryLen']} / {buffer_stats['maxPoints']}")
    assert buffer_stats['pointHistoryLen'] > 1000, "High density raycasts must accumulate >1000 points!"
    assert buffer_stats['pointHistoryLen'] <= buffer_stats['maxPoints'], "Must not exceed maxPoints capacity!"
    print("  -> TEST 7 PASSED: Rolling history buffer operates stably within limits!")

    print("\n=======================================================")
    print("  ALL 7 3D LiDAR SLAM CYCLING & RESILIENCE TESTS PASSED 100%!")
    print("=======================================================\n")
    s.close()
finally:
    try:
        proc.terminate()
        proc.wait(timeout=3)
    except Exception:
        pass
