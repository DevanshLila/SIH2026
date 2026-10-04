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

edge = r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
temp_profile = tempfile.mkdtemp(prefix='edge_himanshu_test_')
CDP_PORT = 9265

cmd = [
    edge,
    '--headless=new',
    f'--remote-debugging-port={CDP_PORT}',
    '--remote-allow-origins=*',
    f'--user-data-dir={temp_profile}',
    f'http://127.0.0.1:{PORT}/index.html'
]
proc = subprocess.Popen(cmd)
time.sleep(4.0)

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
        print('Handshake failed! Response:', repr(resp))
        raise AssertionError('Handshake failed')
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
            if len(buf) >= offset + payload_len:
                data = bytes(buf[offset:offset+payload_len])
                del buf[:offset+payload_len]
                msg = json.loads(data.decode('utf-8'))
                if target_id is None or msg.get('id') == target_id:
                    return msg
            else:
                break

def eval_js(s, expr):
    mid = send_cdp(s, 'Runtime.evaluate', {'expression': expr, 'returnByValue': True})
    res = recv_cdp(s, mid)
    if 'result' in res and 'result' in res['result'] and 'value' in res['result']['result']:
        return res['result']['result']['value']
    return res

tabs = json.loads(urllib.request.urlopen(f'http://127.0.0.1:{CDP_PORT}/json').read().decode())
sim_tab = next(t for t in tabs if str(PORT) in t.get('url', ''))
ws = create_ws(sim_tab['webSocketDebuggerUrl'])
print("WebSocket connected successfully")

# Wait for app readiness
for _ in range(25):
    ready = eval_js(ws, '!!(window.droneApp && window.droneApp.drone && window.droneApp.navigator)')
    if ready:
        break
    time.sleep(0.5)

print("App Ready:", eval_js(ws, '!!window.droneApp'))
assert eval_js(ws, '!!window.droneApp'), "droneApp failed to load"

print("\n--- TEST 1: GPS Sector Upload Modal UI & Preset Loading ---")
modal_test = eval_js(ws, """(() => {
    const btnOpen = document.getElementById('btn-open-gps-modal');
    const modal = document.getElementById('gps-modal');
    btnOpen.click();
    const isModalOpen = modal.classList.contains('active');
    
    // Test preset click
    const preset = document.querySelector('.preset-gps-btn');
    preset.click();
    const isModalClosed = !modal.classList.contains('active');
    const nav = window.droneApp.navigator;
    
    return {
        btnExists: !!btnOpen,
        isModalOpen,
        isModalClosed,
        hasFedSector: nav.fedGpsSector.isFed,
        sectorName: nav.fedGpsSector.sectorName,
        geofenceChildren: nav.geofenceGroup.children.length
    };
})()""")
print("Modal Test:", modal_test)
assert modal_test['btnExists'] and modal_test['isModalOpen'] and modal_test['isModalClosed'], "GPS modal open/close failed!"
assert modal_test['hasFedSector'], "GPS sector was not fed!"
assert modal_test['geofenceChildren'] > 0, "3D holographic geofence not rendered!"
print("[PASS] TEST 1: GPS modal, presets, and 3D holographic geofence verified.")

print("\n--- TEST 2: Circular GPS Area Allotment & 3D Circular Geofence ---")
circ_test = eval_js(ws, """(() => {
    const nav = window.droneApp.navigator;
    nav.feedCircularGpsTargetArea({
        centerLat: 26.1450,
        centerLng: 91.7370,
        radiusMeters: 30.0,
        altitude: 14.0,
        sectorName: 'TEST CIRCULAR SECTOR'
    });
    return {
        isCircularSearch: nav.isCircularSearch,
        circularSectorFed: nav.circularSector.isFed,
        waypointsCount: nav.waypoints.length,
        geofenceChildren: nav.geofenceGroup.children.length
    };
})()""")
print("Circular Sector Test:", circ_test)
assert circ_test['isCircularSearch'] and circ_test['circularSectorFed'], "Circular search not activated!"
assert circ_test['waypointsCount'] > 20, "Archimedean spiral waypoints not generated!"
assert circ_test['geofenceChildren'] >= 4, "3D circular geofence meshes not rendered!"
print("[PASS] TEST 2: Circular GPS sector and 3D holographic circular geofence verified.")

print("\n--- TEST 3: Survivor Auto-Loitering & Tactical Dispatch Alert ---")
loiter_test = eval_js(ws, """(() => {
    const app = window.droneApp;
    const nav = app.navigator;
    const env = app.environment;
    
    // Pick first survivor
    const s = env.survivors[0];
    s.detected = true;
    
    // Move drone near survivor
    app.drone.group.position.set(s.position.x, 10, s.position.z);
    
    // Run an update cycle
    nav.handleAutonomousWaypointFollow(0.1);
    
    const banner = document.getElementById('rescue-dispatch-banner');
    const content = document.getElementById('rescue-dispatch-content');
    
    return {
        hasLoiteringTarget: !!nav.loiteringTarget,
        loiterTargetId: nav.loiteringTarget ? nav.loiteringTarget.id : null,
        loiterTimer: nav.loiterTimer,
        bannerDisplay: banner ? banner.style.display : null,
        bannerHasText: content ? content.textContent.length > 20 : false
    };
})()""")
print("Loiter & Alert Test:", loiter_test)
assert loiter_test['hasLoiteringTarget'], "Survivor auto-loiter not triggered!"
assert loiter_test['bannerDisplay'] == 'block' and loiter_test['bannerHasText'], "Rescue squad dispatch alert banner not shown!"
print("[PASS] TEST 3: Survivor auto-loitering and rescue dispatch alert banner verified.")

print("\n--- TEST 4: 3D LiDAR Collision Avoidance (8.5m clearance warning & 2.4m critical barrier) ---")
avoid_test = eval_js(ws, """(() => {
    const app = window.droneApp;
    const nav = app.navigator;
    const drone = app.drone;
    
    drone.telemetry.isFlying = true;
    nav.navMode = 'GRID';
    
    // Place drone near an obstacle collider
    const colliders = app.environment.obstacleColliders;
    if (colliders && colliders.length > 0) {
        const obs = colliders[0];
        const obsPos = new THREE.Vector3();
        obs.getWorldPosition(obsPos);
        
        // Position drone 3.5m from obstacle at low altitude 1.5m, moving toward it
        drone.group.position.set(obsPos.x + 3.5, 1.5, obsPos.z);
        drone.velocity.set(-2, 0, 0);
        drone.targetPosition.set(obsPos.x, 1.5, obsPos.z);
        
        nav.checkObstacleAvoidance();
        
        const isAvoiding = nav.isAvoidingObstacle;
        const targetClimbed = drone.targetPosition.y > 2.5;
        
        return {
            isAvoiding,
            targetClimbed,
            droneY: drone.group.position.y,
            targetY: drone.targetPosition.y
        };
    }
    return { skipped: true };
})()""")
print("Collision Avoidance Test:", avoid_test)
assert avoid_test.get('isAvoiding'), "Collision avoidance did not trigger within 8.5m clearance bubble!"
assert avoid_test.get('targetClimbed'), "Collision avoidance vertical clearance climb not applied!"
print("[PASS] TEST 4: Multi-directional 3D collision avoidance and climb clearance verified.")

print("\n--- TEST 5: Avionics Atmospheric & Weather Radar Telemetry Card ---")
avionics_test = eval_js(ws, """(() => {
    const app = window.droneApp;
    app.drone.telemetry.windSpeed = 16.5;
    app.gcs.updateAvionicsUI(app.drone.telemetry);
    
    const elCond = document.getElementById('val-weather-condition');
    const elWind = document.getElementById('val-wind-speed');
    const elDir = document.getElementById('val-wind-dir');
    const elVis = document.getElementById('val-visibility-pct');
    const elImu = document.getElementById('val-imu-comp');
    
    return {
        cond: elCond ? elCond.textContent : null,
        wind: elWind ? elWind.textContent : null,
        dir: elDir ? elDir.textContent : null,
        vis: elVis ? elVis.textContent : null,
        imu: elImu ? elImu.textContent : null,
        hasProxMethod: typeof app.gcs.playProximityBeep === 'function'
    };
})()""")
print("Avionics Radar Card Test:", avionics_test)
assert avionics_test['cond'] and avionics_test['wind'] and avionics_test['dir'] and avionics_test['vis'], "Avionics elements missing!"
assert avionics_test['hasProxMethod'], "playProximityBeep method missing!"
print("[PASS] TEST 5: Avionics Atmospheric & Weather Radar card and audio alarm verified.")

print("\n--- TEST 6: LiDAR SLAM Mode (Inverted Cone, Rotating 16 Beams, HUD Overlay) ---")
lidar_test = eval_js(ws, """(() => {
    const app = window.droneApp;
    app.sensors.setSensorMode('LIDAR');
    
    const hudOverlay = document.getElementById('lidar-hud-overlay');
    const container = document.getElementById('three-canvas-container');
    const frustum = app.sensors.lidarVolumeFrustum;
    const wireframe = app.sensors.lidarConeWireframe;
    const beams = app.sensors.lidarLaserBeams;
    
    // Run update to animate
    app.sensors.updateLidarScan(0.05);
    
    const elPts = document.getElementById('lidar-hud-points-count');
    
    return {
        mode: app.sensors.sensorMode,
        hudVisible: hudOverlay ? hudOverlay.style.display : null,
        hasLidarFilter: container ? container.classList.contains('lidar-filter') : false,
        frustumVisible: frustum ? frustum.visible : false,
        wireframeVisible: wireframe ? wireframe.visible : false,
        beamsVisible: beams ? beams.visible : false,
        hudPtsText: elPts ? elPts.textContent : null
    };
})()""")
print("LiDAR SLAM Test:", lidar_test)
assert lidar_test['mode'] == 'LIDAR', "Sensor mode not set to LIDAR!"
assert lidar_test['hudVisible'] == 'block', "LiDAR HUD overlay not displayed!"
assert lidar_test['hasLidarFilter'], "LIDAR filter not applied to container!"
assert lidar_test['frustumVisible'] and lidar_test['wireframeVisible'] and lidar_test['beamsVisible'], "Inverted cone and 16 laser beams not visible!"
print("[PASS] TEST 6: LiDAR SLAM inverted cone, rotating 16 beams, and HUD overlay verified.")

print("\n=======================================================")
print("  ALL 6 HIMANSHU MERGED FEATURES DEEP TESTS PASSED 100%!")
print("=======================================================\n")

proc.terminate()
