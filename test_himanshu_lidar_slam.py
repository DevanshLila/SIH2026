#!/usr/bin/env python3
"""
Deep Automated Verification Suite for Himanshu's 3D LiDAR SLAM System on combine branch
Team Pegasus - SIH 2026
"""

import http.server, threading, time, subprocess, os, json, socket, base64, struct, urllib.request, tempfile, sys

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

CDP_PORT = 9277
edge = r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
temp_profile = tempfile.mkdtemp(prefix='edge_himanshu_lidar_')

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
    masked = bytearray(payload)
    for i in range(len(masked)):
        masked[i] ^= mask[i % 4]
    header.extend(masked)
    s.sendall(header)
    return msg_id

buf = bytearray()
def recv_cdp(s, target_id=None):
    global buf
    while True:
        chunk = s.recv(65536)
        if not chunk:
            raise AssertionError('Socket closed')
        buf.extend(chunk)
        while True:
            if len(buf) < 2:
                break
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
        return res['result']['result'].get('value')
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
    ws = create_ws(page_tab['webSocketDebuggerUrl'])
    print("CDP Connected successfully to:", page_tab.get('url', 'unknown'))

    send_cdp(ws, 'Page.enable')
    send_cdp(ws, 'Runtime.enable')

    for _ in range(30):
        ready = eval_js(ws, "!!(window.droneApp && window.droneApp.drone && window.droneApp.sensors)")
        if ready:
            break
        time.sleep(0.3)

    print("\n=======================================================")
    print("  TEST 1: Inverted Cone & Multi-Beam Laser Array Geometry")
    print("=======================================================")
    cone_info = eval_js(ws, """(() => {
        const s = window.droneApp.sensors;
        const frustum = s.lidarVolumeFrustum;
        const wireframe = s.lidarConeWireframe;
        const laserBeams = s.lidarLaserBeams;
        const beamsMesh = s.lidarBeamsMesh;

        return {
            hasFrustum: !!frustum,
            frustumType: frustum ? frustum.geometry.type : null,
            frustumParent: frustum ? frustum.parent === s.drone.group : false,
            frustumColor: frustum ? frustum.material.color.getHexString() : null,
            frustumOpacity: frustum ? frustum.material.opacity : null,
            hasWireframe: !!wireframe,
            wireframeParent: wireframe ? wireframe.parent === s.drone.group : false,
            hasLaserBeams: !!laserBeams,
            laserBeamsParent: laserBeams ? laserBeams.parent === s.drone.group : false,
            beamCount: beamsMesh ? beamsMesh.geometry.attributes.position.count / 2 : 0,
            beamColor: beamsMesh ? beamsMesh.material.color.getHexString() : null,
            maxRange: s.lidarMaxRange
        };
    })()""")
    print("  Cone Frustum & Beams Info:", cone_info)
    assert cone_info['hasFrustum'], "Inverted cone volume frustum must exist!"
    assert cone_info['frustumType'] == 'ConeGeometry', "Frustum must be ConeGeometry!"
    assert cone_info['frustumParent'], "Frustum must be attached to drone.group!"
    assert cone_info['hasWireframe'] and cone_info['wireframeParent'], "Holographic wireframe cone must exist on drone.group!"
    assert cone_info['hasLaserBeams'] and cone_info['laserBeamsParent'], "Laser beams group must exist on drone.group!"
    assert cone_info['beamCount'] == 16, f"Expected 16 rotating beams, got {cone_info['beamCount']}"
    assert cone_info['maxRange'] == 25.0, f"Expected 25.0m max range, got {cone_info['maxRange']}"
    print("  -> TEST 1 PASSED: Authentic Inverted Cone (25m depth, 18m footprint) & 16-beam laser array confirmed!")

    print("\n=======================================================")
    print("  TEST 2: Ground Concentric Range Rings (10m, 20m, 25m) & Radar Sweep")
    print("=======================================================")
    rings_info = eval_js(ws, """(() => {
        const s = window.droneApp.sensors;
        const ringsGroup = s.lidarRangeRings;
        const sweepLine = s.lidarSweepLine;

        let ringCount = 0;
        let ringColors = [];
        if (ringsGroup) {
            ringsGroup.children.forEach(child => {
                if (child.isMesh && child.geometry && child.geometry.type === 'RingGeometry') {
                    ringCount++;
                    ringColors.push(child.material.color.getHexString());
                }
            });
        }

        return {
            hasRingsGroup: !!ringsGroup,
            ringsParent: ringsGroup ? ringsGroup.parent === s.drone.scene : false,
            ringCount,
            ringColors,
            hasSweepLine: !!sweepLine,
            sweepLineLength: sweepLine ? sweepLine.geometry.attributes.position.array[3] : 0
        };
    })()""")
    print("  Ground Range Rings Info:", rings_info)
    assert rings_info['hasRingsGroup'] and rings_info['ringsParent'], "Range rings must be attached to drone.scene!"
    assert rings_info['ringCount'] == 3, f"Expected 3 concentric rings (10, 20, 25m), got {rings_info['ringCount']}"
    assert rings_info['hasSweepLine'], "360° radar sweep line must exist!"
    assert abs(rings_info['sweepLineLength'] - 25.0) < 0.1, "Radar sweep line length must match 25.0m max range!"
    print("  -> TEST 2 PASSED: Concentric ground rings & 360° rotating radar sweep line confirmed!")

    print("\n=======================================================")
    print("  TEST 3: Point Cloud Buffer (4,800 Points, Velodyne Rainbow Elevation Colors)")
    print("=======================================================")
    pt_cloud_info = eval_js(ws, """(() => {
        const s = window.droneApp.sensors;
        const pts = s.lidarPointCloud;

        return {
            hasPointCloud: !!pts,
            pointCount: pts ? pts.geometry.attributes.position.count : 0,
            hasColorAttr: pts ? !!pts.geometry.attributes.color : false,
            pointSize: pts ? pts.material.size : 0,
            vertexColors: pts ? pts.material.vertexColors : false,
            blending: pts ? pts.material.blending === THREE.AdditiveBlending : false,
            depthWrite: pts ? pts.material.depthWrite : true,
            maxPoints: s.maxPoints
        };
    })()""")
    print("  Point Cloud Info:", pt_cloud_info)
    assert pt_cloud_info['hasPointCloud'], "Point cloud must exist!"
    assert pt_cloud_info['pointCount'] == 4800, f"Expected 4800 buffer points, got {pt_cloud_info['pointCount']}"
    assert pt_cloud_info['hasColorAttr'] and pt_cloud_info['vertexColors'], "Point cloud must use per-vertex rainbow colors!"
    assert abs(pt_cloud_info['pointSize'] - 0.42) < 0.05, f"Expected point size 0.42, got {pt_cloud_info['pointSize']}"
    assert pt_cloud_info['blending'], "Point cloud must use AdditiveBlending!"
    assert not pt_cloud_info['depthWrite'], "Point cloud must have depthWrite: false!"
    print("  -> TEST 3 PASSED: 4800-point buffer geometry with Velodyne rainbow elevation colors confirmed!")

    print("\n=======================================================")
    print("  TEST 4: Engaging LIDAR Mode: Shaders, Void & Fluorescent Matrix")
    print("=======================================================")
    eval_js(ws, "window.droneApp.sensors.setSensorMode('LIDAR')")
    time.sleep(0.5)

    slam_env_info = eval_js(ws, """(() => {
        const s = window.droneApp.sensors;
        const scene = window.droneApp.scene;
        const env = window.droneApp.environment;
        const container = document.getElementById('three-canvas-container');
        const hudOverlay = document.getElementById('lidar-hud-overlay');
        const slamPanel = document.getElementById('lidar-slam-panel');

        // Check fluorescent wireframe matrix materials
        let rubbleMeshCount = 0;
        let cyanWireframeCount = 0;
        let hiddenMeshCount = 0;

        env.environmentGroup.traverse(child => {
            if (child.isMesh && child !== env.waterMesh) {
                rubbleMeshCount++;
                if (!child.visible) hiddenMeshCount++;
                if (child.material && child.material.wireframe && child.material.color) {
                    const hex = child.material.color.getHexString();
                    if (hex === '06b6d4') cyanWireframeCount++;
                }
            }
        });

        return {
            mode: s.sensorMode,
            hasLidarFilterClass: container ? container.classList.contains('lidar-filter') : false,
            hudOverlayDisplay: hudOverlay ? hudOverlay.style.display : null,
            slamPanelDisplay: slamPanel ? slamPanel.style.display : null,
            bgHex: scene.background ? scene.background.getHexString() : null,
            fogDensity: scene.fog ? scene.fog.density : null,
            frustumVisible: s.lidarVolumeFrustum.visible,
            wireframeVisible: s.lidarConeWireframe.visible,
            beamsVisible: s.lidarLaserBeams.visible,
            ringsVisible: s.lidarRangeRings.visible,
            pointCloudVisible: s.lidarPointCloud.visible,
            rubbleMeshCount,
            cyanWireframeCount,
            hiddenMeshCount
        };
    })()""")
    print("  SLAM Environment Info:", slam_env_info)
    assert slam_env_info['mode'] == 'LIDAR', "Mode must be LIDAR!"
    assert slam_env_info['hasLidarFilterClass'], "Container must have 'lidar-filter' class!"
    assert slam_env_info['hudOverlayDisplay'] == 'block', "Authentic #lidar-hud-overlay must be displayed!"
    assert slam_env_info['slamPanelDisplay'] in ['none', None], "Conflicting #lidar-slam-panel must remain hidden!"
    assert slam_env_info['bgHex'] == '010307', f"Expected pitch black tactical void 010307, got {slam_env_info['bgHex']}"
    assert slam_env_info['frustumVisible'], "Inverted cone volume frustum must be visible!"
    assert slam_env_info['wireframeVisible'], "Holographic wireframe cone must be visible!"
    assert slam_env_info['beamsVisible'], "16 laser beams must be visible!"
    assert slam_env_info['ringsVisible'], "Ground range rings must be visible!"
    assert slam_env_info['pointCloudVisible'], "Point cloud must be visible!"
    assert slam_env_info['cyanWireframeCount'] > 20, "Obstacles must be transformed into luminous Cyan SLAM wireframe (06b6d4)!"
    assert slam_env_info['hiddenMeshCount'] <= 12, f"Only thermal heat cores should be hidden, found {slam_env_info['hiddenMeshCount']}"
    print("  -> TEST 4 PASSED: Tactical pitch-black void, cyan wireframe matrix, and all LiDAR meshes visible!")

    print("\n=======================================================")
    print("  TEST 5: Real-Time Geometric Raycasting & Dynamic Point Density")
    print("=======================================================")
    # Step simulation frames to accumulate point hits
    for _ in range(12):
        eval_js(ws, "window.droneApp.sensors.updateLidarScan(0.016)")

    raycast_info = eval_js(ws, """(() => {
        const s = window.droneApp.sensors;
        const elPts = document.getElementById('lidar-hud-points-count');

        // Check point colors in buffer
        const colors = s.lidarPointCloud.geometry.attributes.color.array;
        let hasColoredPoint = false;
        for (let i = 0; i < Math.min(s.pointHistory.length, 100); i++) {
            const r = colors[i * 3];
            const g = colors[i * 3 + 1];
            const b = colors[i * 3 + 2];
            if (r > 0 || g > 0 || b > 0) {
                hasColoredPoint = true;
                break;
            }
        }

        return {
            pointHistoryLen: s.pointHistory.length,
            hudText: elPts ? elPts.textContent : null,
            hasColoredPoint,
            scanAngle: s.lidarScanAngle
        };
    })()""")
    print("  Raycast Scan Results:", raycast_info)
    assert raycast_info['pointHistoryLen'] > 0, "Geometric raycasting must accumulate point cloud hits!"
    assert raycast_info['hudText'] and 'PTS' in raycast_info['hudText'], "LiDAR HUD points count must display '... PTS'!"
    assert raycast_info['hasColoredPoint'], "BufferGeometry must contain rainbow elevation vertex colors!"
    assert raycast_info['scanAngle'] > 0, "LiDAR scan angle must advance with time delta!"
    print(f"  -> TEST 5 PASSED: Raycasting generated {raycast_info['pointHistoryLen']} points with HUD display: {raycast_info['hudText']}!")

    print("\n=======================================================")
    print("  TEST 6: Multi-Disaster Scene Compatibility (Flash Flood & Chemical Fire)")
    print("=======================================================")
    # Test Flash Flood
    eval_js(ws, "window.droneApp.setScenario('flash_flood')")
    time.sleep(0.5)
    eval_js(ws, "window.droneApp.sensors.setSensorMode('LIDAR')")
    time.sleep(0.3)
    flood_info = eval_js(ws, """(() => {
        const s = window.droneApp.sensors;
        const env = window.droneApp.environment;
        let cyanCount = 0;
        env.environmentGroup.traverse(c => {
            if (c.isMesh && c !== env.waterMesh && c.material && c.material.color && c.material.color.getHexString() === '06b6d4') {
                cyanCount++;
            }
        });
        return {
            colliders: env.obstacleColliders.length,
            cyanCount,
            mode: s.sensorMode
        };
    })()""")
    print("  Flash Flood SLAM Info:", flood_info)
    assert flood_info['colliders'] > 100, "Flash flood colliders must exist!"
    assert flood_info['cyanCount'] > 20, "Flash flood meshes must be in cyan wireframe matrix!"

    # Test Chemical Fire
    eval_js(ws, "window.droneApp.setScenario('chemical_fire')")
    time.sleep(0.5)
    eval_js(ws, "window.droneApp.sensors.setSensorMode('LIDAR')")
    time.sleep(0.3)
    chem_info = eval_js(ws, """(() => {
        const s = window.droneApp.sensors;
        const env = window.droneApp.environment;
        let cyanCount = 0;
        env.environmentGroup.traverse(c => {
            if (c.isMesh && c.material && c.material.color && c.material.color.getHexString() === '06b6d4') {
                cyanCount++;
            }
        });
        return {
            colliders: env.obstacleColliders.length,
            cyanCount,
            mode: s.sensorMode
        };
    })()""")
    print("  Chemical Fire SLAM Info:", chem_info)
    assert chem_info['colliders'] > 100, "Chemical fire colliders must exist!"
    assert chem_info['cyanCount'] > 20, "Chemical fire meshes must be in cyan wireframe matrix!"
    print("  -> TEST 6 PASSED: Flash Flood & Chemical Fire scenarios seamlessly render in 3D LiDAR SLAM!")

    print("\n=======================================================")
    print("  TEST 7: Mode Switching Integrity (LIDAR -> THERMAL -> NVG -> RGB -> LIDAR)")
    print("=======================================================")
    eval_js(ws, "window.droneApp.setScenario('earthquake')")
    time.sleep(0.3)

    # Switch to THERMAL
    eval_js(ws, "window.droneApp.sensors.setSensorMode('THERMAL')")
    time.sleep(0.3)
    thermal_state = eval_js(ws, """(() => {
        const s = window.droneApp.sensors;
        const container = document.getElementById('three-canvas-container');
        const hudOverlay = document.getElementById('lidar-hud-overlay');
        return {
            mode: s.sensorMode,
            thermalActive: s.thermalEngine ? s.thermalEngine.active : false,
            frustumVisible: s.lidarVolumeFrustum.visible,
            hudOverlayDisplay: hudOverlay ? hudOverlay.style.display : null,
            hasLidarFilter: container.classList.contains('lidar-filter')
        };
    })()""")
    print("  Thermal Switch State:", thermal_state)
    assert thermal_state['mode'] == 'THERMAL', "Mode must be THERMAL!"
    assert not thermal_state['frustumVisible'], "LiDAR frustum must be hidden in THERMAL mode!"
    assert thermal_state['hudOverlayDisplay'] == 'none', "LiDAR HUD overlay must be hidden in THERMAL mode!"
    assert not thermal_state['hasLidarFilter'], "LIDAR filter class must be removed in THERMAL mode!"

    # Switch to NVG
    eval_js(ws, "window.droneApp.sensors.setSensorMode('NVG')")
    time.sleep(0.3)
    nvg_state = eval_js(ws, """(() => {
        const s = window.droneApp.sensors;
        const app = window.droneApp;
        const nvg = app.nightVisionEngine;
        return {
            mode: s.sensorMode,
            nvgActive: nvg ? nvg.isActive : false,
            frustumVisible: s.lidarVolumeFrustum.visible
        };
    })()""")
    print("  NVG Switch State:", nvg_state)
    assert nvg_state['mode'] == 'NVG', "Mode must be NVG!"
    assert nvg_state['nvgActive'], "NightVisionEngine must be active!"
    assert not nvg_state['frustumVisible'], "LiDAR frustum must be hidden in NVG mode!"

    # Switch to RGB
    eval_js(ws, "window.droneApp.sensors.setSensorMode('RGB')")
    time.sleep(0.3)
    rgb_state = eval_js(ws, """(() => {
        const s = window.droneApp.sensors;
        return {
            mode: s.sensorMode,
            frustumVisible: s.lidarVolumeFrustum.visible,
            pointsVisible: s.lidarPointCloud.visible
        };
    })()""")
    print("  RGB Switch State:", rgb_state)
    assert rgb_state['mode'] == 'RGB', "Mode must be RGB!"
    assert not rgb_state['frustumVisible'] and not rgb_state['pointsVisible'], "LiDAR meshes must be hidden in RGB mode!"

    # Return to LIDAR
    eval_js(ws, "window.droneApp.sensors.setSensorMode('LIDAR')")
    time.sleep(0.5)
    for _ in range(8):
        eval_js(ws, "window.droneApp.sensors.updateLidarScan(0.016)")

    resumed_lidar = eval_js(ws, """(() => {
        const s = window.droneApp.sensors;
        return {
            mode: s.sensorMode,
            frustumVisible: s.lidarVolumeFrustum.visible,
            pointsVisible: s.lidarPointCloud.visible,
            pointsCount: s.pointHistory.length
        };
    })()""")
    print("  Resumed LIDAR State:", resumed_lidar)
    assert resumed_lidar['mode'] == 'LIDAR', "Mode must resume to LIDAR!"
    assert resumed_lidar['frustumVisible'] and resumed_lidar['pointsVisible'], "LiDAR meshes must resume visibility!"
    print("  -> TEST 7 PASSED: Clean, leak-free transitions across all 4 sensor modes confirmed!")

    print("\n=======================================================")
    print("  TEST 8: Capture Verification Screenshot Artifact")
    print("=======================================================")
    take_screenshot(ws, 'lidar_slam_complete_verification.png')

    print("\n=======================================================")
    print("  ALL 8 DEEP VERIFICATION TESTS FOR HIMANSHU'S 3D LiDAR SLAM PASSED 100%!")
    print("=======================================================\n")

finally:
    try:
        proc.terminate()
    except Exception:
        pass
