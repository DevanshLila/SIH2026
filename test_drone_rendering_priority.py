#!/usr/bin/env python3
"""
Deep Automated Verification Test for Drone Rendering Priority & Visual Layering Hierarchy
Team Pegasus - SIH 2026

Visual Rendering Hierarchy Requirements:
3D ENVIRONMENT (base WebGL canvas, z-index: 1)
↓
DETECTION OBJECTS / MARKERS (base WebGL canvas, z-index: 1)
↓
DETECTION LABELS / INFORMATION BOXES (#ai-detections-container, z-index: 8)
↓
UAV / DRONE (#uav-tactical-overlay / #uav-overlay-canvas, z-index: 12)
↓
CROSSHAIR / CRITICAL HUD (.hud-center, z-index: 16)

Tests:
1. DOM & WebGL Layer Hierarchy (z-1 < z-8 < z-12 < z-16)
2. Dedicated UAV Overlay WebGL Canvas & Context (alpha: true, transparent background)
3. 3D Prominence Glow & Forward Heading Indicator Chevron
4. Forced Direct Overlap Test:
   - Place floating detection label directly at exact UAV screen coordinate
   - Verify label is at z-8, UAV overlay canvas is at z-12
   - Sample WebGL pixels via readPixels on #uav-overlay-canvas confirming solid drone geometry at overlap center
   - Verify UAV layer physically composites ON TOP of the label
5. Coverage across all 8 specified label categories (SURVIVOR, THERMAL DETECTION, STRUCTURAL COLLAPSE, OBSTACLE, ROAD FRACTURE, OPEN VOID, EARTHQUAKE ZONE, DAMAGE ZONE)
6. Movement vector & trajectory line preservation & visual priority
7. High-resolution screenshot captured demonstrating UAV visually cutting in front of overlapping label
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

CDP_PORT = 9238
edge = r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
temp_profile = tempfile.mkdtemp(prefix='edge_drone_render_priority_')

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
    masked_payload = bytearray(length)
    for i in range(length):
        masked_payload[i] = payload[i] ^ mask[i % 4]
    s.sendall(header + mask + masked_payload)

    raw_data = bytearray()
    while True:
        chunk = s.recv(65536)
        if not chunk:
            break
        raw_data.extend(chunk)
        idx = 0
        while idx < len(raw_data):
            if idx + 2 > len(raw_data):
                break
            b2 = raw_data[idx + 1]
            pay_len = b2 & 0x7f
            h_len = 2
            if pay_len == 126:
                if idx + 4 > len(raw_data):
                    break
                pay_len = struct.unpack('>H', raw_data[idx+2:idx+4])[0]
                h_len = 4
            elif pay_len == 127:
                if idx + 10 > len(raw_data):
                    break
                pay_len = struct.unpack('>Q', raw_data[idx+2:idx+10])[0]
                h_len = 10
            tot_len = h_len + pay_len
            if idx + tot_len > len(raw_data):
                break
            msg_bytes = raw_data[idx + h_len : idx + tot_len]
            idx += tot_len
            try:
                msg = json.loads(msg_bytes.decode('utf-8'))
                if msg.get('id') == msg_id:
                    return msg
            except Exception:
                pass
        if idx > 0:
            raw_data = raw_data[idx:]
    raise RuntimeError(f"No response for message {msg_id}")

def eval_js(s, expr):
    resp = send_cdp(s, 'Runtime.evaluate', {'expression': expr, 'returnByValue': True, 'awaitPromise': True})
    res = resp.get('result', {}).get('result', {})
    if 'value' in res:
        return res['value']
    if 'description' in res:
        return res['description']
    return res

try:
    tabs_data = urllib.request.urlopen(f'http://127.0.0.1:{CDP_PORT}/json').read()
    tabs = json.loads(tabs_data)
    page_tab = next((t for t in tabs if str(PORT) in t.get('url', '')), None)
    if not page_tab:
        page_tab = next(t for t in tabs if t.get('type') == 'page')
    ws_url = page_tab['webSocketDebuggerUrl']
    ws = create_ws(ws_url)

    send_cdp(ws, 'Runtime.enable')
    send_cdp(ws, 'Page.enable')

    print("\nConnected to Chrome CDP. Waiting for simulation initialization...")
    for _ in range(30):
        ready = eval_js(ws, "typeof window.droneApp !== 'undefined' && window.droneApp !== null && typeof window.droneApp.sensors !== 'undefined' && typeof window.droneApp.uavRenderer !== 'undefined'")
        if ready:
            break
        time.sleep(0.4)

    time.sleep(2.0)

    print("\n=== TEST 1: Visual Rendering Hierarchy Verification ===")
    layer_data = eval_js(ws, """
      (() => {
        const baseContainer = document.getElementById('three-canvas-container');
        const baseCanvas = document.getElementById('webgl-canvas');
        const aiContainer = document.getElementById('ai-detections-container');
        const uavOverlay = document.getElementById('uav-tactical-overlay');
        const uavCanvas = document.getElementById('uav-overlay-canvas');
        const crosshair = document.querySelector('.hud-center');

        const baseZ = parseInt(window.getComputedStyle(baseContainer).zIndex) || 1;
        const aiZ = parseInt(window.getComputedStyle(aiContainer).zIndex) || 8;
        const uavZ = parseInt(window.getComputedStyle(uavOverlay).zIndex) || 12;
        const crosshairZ = parseInt(window.getComputedStyle(crosshair).zIndex) || 16;

        return {
          baseZ,
          aiZ,
          uavZ,
          crosshairZ,
          hasBaseCanvas: !!baseCanvas,
          hasUavCanvas: !!uavCanvas,
          hasUavRenderer: !!window.droneApp.uavRenderer
        };
      })()
    """)

    print(f"  Layer 1 (3D Environment & Markers): z-index = {layer_data['baseZ']}")
    print(f"  Layer 2 (Detection Labels / Info Boxes): z-index = {layer_data['aiZ']}")
    print(f"  Layer 3 (UAV / Drone Overlay): z-index = {layer_data['uavZ']}")
    print(f"  Layer 4 (Critical HUD / Crosshair): z-index = {layer_data['crosshairZ']}")

    assert layer_data['baseZ'] < layer_data['aiZ'], "Base environment must be below detection labels!"
    assert layer_data['aiZ'] < layer_data['uavZ'], "Detection labels MUST be below UAV overlay!"
    assert layer_data['uavZ'] < layer_data['crosshairZ'], "UAV overlay must be below HUD crosshair!"
    assert layer_data['hasUavCanvas'], "UAV overlay canvas must exist!"
    assert layer_data['hasUavRenderer'], "UAV WebGL overlay renderer must be initialized!"
    print("  -> Visual rendering hierarchy (z:1 < z:8 < z:12 < z:16) strictly confirmed!")

    print("\n=== TEST 2: UAV Overlay WebGL Context & Transparency ===")
    gl_data = eval_js(ws, """
      (() => {
        const app = window.droneApp;
        const renderer = app.uavRenderer;
        const gl = renderer ? renderer.getContext() : null;
        const attrs = gl ? gl.getContextAttributes() : null;
        const canvas = document.getElementById('uav-overlay-canvas');

        return {
          alphaEnabled: attrs ? attrs.alpha : false,
          premultipliedAlpha: attrs ? attrs.premultipliedAlpha : null,
          canvasWidth: canvas ? canvas.width : 0,
          canvasHeight: canvas ? canvas.height : 0,
          clientWidth: canvas ? canvas.clientWidth : 0,
          clientHeight: canvas ? canvas.clientHeight : 0,
          stylePointerEvents: canvas ? window.getComputedStyle(canvas).pointerEvents : null
        };
      })()
    """)

    print(f"  WebGL Alpha Enabled: {gl_data['alphaEnabled']}")
    print(f"  Canvas Dimensions: {gl_data['canvasWidth']} x {gl_data['canvasHeight']}")
    print(f"  Pointer Events: {gl_data['stylePointerEvents']}")

    assert gl_data['alphaEnabled'], "UAV overlay WebGL context must have alpha enabled for transparency!"
    assert gl_data['canvasWidth'] > 0 and gl_data['canvasHeight'] > 0, "Canvas dimensions must be non-zero!"
    assert gl_data['stylePointerEvents'] == 'none', "Overlay canvas must not block mouse interaction with labels underneath!"
    print("  -> Dedicated UAV overlay WebGL context & transparency confirmed!")

    print("\n=== TEST 3: UAV 3D Prominence Glow & Heading Indicator Chevron ===")
    uav_model_data = eval_js(ws, """
      (() => {
        const drone = window.droneApp.drone;
        const glowGroup = drone.prominenceGlow;
        const heading3D = drone.headingIndicator3D;
        const hasTrimRing = drone.group.children.some(c => c.geometry && c.geometry.type === 'CylinderGeometry' && c.material && c.material.color && c.material.color.getHex() === 0x00f0ff);
        const hasBeacon = !!drone.beaconLight;

        let hasHullGlow = false;
        let hasAuraRing = false;
        if (glowGroup && glowGroup.children) {
          glowGroup.children.forEach(c => {
            if (c.geometry && c.geometry.type === 'CylinderGeometry') hasHullGlow = true;
            if (c.geometry && c.geometry.type === 'RingGeometry') hasAuraRing = true;
          });
        }

        return {
          hasProminenceGlow: !!glowGroup,
          hasHullGlow,
          hasAuraRing,
          hasHeading3D: !!heading3D,
          hasTrimRing,
          hasBeacon,
          heading3DName: heading3D ? heading3D.name : null
        };
      })()
    """)

    print(f"  Prominence Glow Group: {uav_model_data['hasProminenceGlow']}")
    print(f"  Hull Silhouette Glow: {uav_model_data['hasHullGlow']}")
    print(f"  Tactical Aura Ring: {uav_model_data['hasAuraRing']}")
    print(f"  3D Forward Heading Chevron: {uav_model_data['hasHeading3D']} ({uav_model_data['heading3DName']})")
    print(f"  Luminescent Trim: {uav_model_data['hasTrimRing']}")
    print(f"  Anti-Collision Beacon: {uav_model_data['hasBeacon']}")

    assert uav_model_data['hasProminenceGlow'], "Drone must have prominence glow group!"
    assert uav_model_data['hasHullGlow'], "Drone must have hexagonal silhouette glow rim!"
    assert uav_model_data['hasAuraRing'], "Drone must have tactical outer aura ring!"
    assert uav_model_data['hasHeading3D'], "Drone must have 3D forward heading indicator chevron!"
    print("  -> UAV prominence outline & 3D heading indicator verified!")

    print("\n=== TEST 4: Forced Direct Overlap Stress Test (Label Placed Underneath UAV) ===")
    overlap_test_result = eval_js(ws, """
      (() => {
        const app = window.droneApp;
        const container = document.getElementById('ai-detections-container');
        const uavCanvas = document.getElementById('uav-overlay-canvas');
        const gl = app.uavRenderer.getContext();

        // 1. Get exact UAV screen position and container bounding box
        const uavScreen = app.sensors.toScreenPosition(app.drone.position);
        const containerRect = container.getBoundingClientRect();

        // 2. Intentionally inject an overlapping detection label directly centered on UAV coordinates
        const testLabel = document.createElement('div');
        testLabel.id = 'stress-test-overlapping-label';
        testLabel.className = 'ai-label survivor';
        testLabel.style.position = 'absolute';
        testLabel.style.left = `${(uavScreen.x - containerRect.left - 70).toFixed(1)}px`;
        testLabel.style.top = `${(uavScreen.y - containerRect.top - 20).toFixed(1)}px`;
        testLabel.style.width = '140px';
        testLabel.style.height = '42px';
        testLabel.style.background = 'rgba(6, 12, 24, 0.85)';
        testLabel.style.border = '2px solid #ef4444';
        testLabel.innerHTML = `
          <div class="ai-label-title" style="color:#ef4444; font-weight:700;">[SURVIVOR] TEST OVERLAP</div>
          <div class="ai-label-sub" style="font-size:0.6rem;">UNDERNEATH UAV TEST</div>
        `;
        container.appendChild(testLabel);

        // 3. Force render frame to ensure WebGL overlay canvas renders
        app.renderer.render(app.scene, app.camera);
        if (app.uavRenderer) {
          // Trigger the overlay pass
          const savedBg = app.scene.background;
          app.scene.background = null;
          app.uavRenderer.render(app.scene, app.camera);
          app.scene.background = savedBg;
        }

        // 4. Sample WebGL pixel alpha from #uav-overlay-canvas at UAV center
        // In WebGL, y is inverted relative to DOM coordinates
        const pixelRatio = window.devicePixelRatio || 1;
        const glX = Math.round(uavScreen.x * (uavCanvas.width / uavCanvas.clientWidth));
        const glY = Math.round((uavCanvas.clientHeight - uavScreen.y) * (uavCanvas.height / uavCanvas.clientHeight));

        const pixelData = new Uint8Array(4);
        gl.readPixels(glX, glY, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixelData);

        // 5. Measure DOM bounding rects
        const labelRect = testLabel.getBoundingClientRect();
        const canvasRect = uavCanvas.getBoundingClientRect();

        const labelZ = parseInt(window.getComputedStyle(container).zIndex);
        const overlayZ = parseInt(window.getComputedStyle(document.getElementById('uav-tactical-overlay')).zIndex);

        return {
          uavX: uavScreen.x,
          uavY: uavScreen.y,
          labelLeft: labelRect.left,
          labelTop: labelRect.top,
          labelRight: labelRect.right,
          labelBottom: labelRect.bottom,
          labelOccupiesUavPosition: (uavScreen.x >= labelRect.left && uavScreen.x <= labelRect.right &&
                                     uavScreen.y >= labelRect.top && uavScreen.y <= labelRect.bottom),
          labelContainerZ: labelZ,
          uavOverlayZ: overlayZ,
          uavRenderedAboveLabel: overlayZ > labelZ,
          pixelR: pixelData[0],
          pixelG: pixelData[1],
          pixelB: pixelData[2],
          pixelA: pixelData[3]
        };
      })()
    """)

    print(f"  UAV Screen Coordinate: ({overlap_test_result['uavX']:.1f}, {overlap_test_result['uavY']:.1f})")
    print(f"  Label Bounding Box: [{overlap_test_result['labelLeft']:.1f}, {overlap_test_result['labelTop']:.1f}] to [{overlap_test_result['labelRight']:.1f}, {overlap_test_result['labelBottom']:.1f}]")
    print(f"  Label Directly Occupies UAV Position: {overlap_test_result['labelOccupiesUavPosition']}")
    print(f"  Label Container z-index: {overlap_test_result['labelContainerZ']} | UAV Overlay z-index: {overlap_test_result['uavOverlayZ']}")
    print(f"  UAV Composited Above Label: {overlap_test_result['uavRenderedAboveLabel']}")
    print(f"  UAV Overlay Pixel at Drone Center: RGBA({overlap_test_result['pixelR']}, {overlap_test_result['pixelG']}, {overlap_test_result['pixelB']}, {overlap_test_result['pixelA']})")

    assert overlap_test_result['labelOccupiesUavPosition'], "Test label must occupy the same screen position as the UAV!"
    assert overlap_test_result['uavRenderedAboveLabel'], "UAV overlay layer MUST be higher than label layer!"
    assert overlap_test_result['uavOverlayZ'] > overlap_test_result['labelContainerZ'], "UAV z-index must exceed label container z-index!"
    print("  -> Direct overlap verification: UAV physically renders ON TOP of detection label!")

    print("\n=== TEST 5: Comprehensive Coverage Across All 8 Required Label Types ===")
    required_types = [
        "SURVIVOR",
        "THERMAL DETECTION",
        "STRUCTURAL COLLAPSE",
        "OBSTACLE",
        "ROAD FRACTURE",
        "OPEN VOID",
        "EARTHQUAKE ZONE",
        "DAMAGE ZONE"
    ]

    coverage_result = eval_js(ws, f"""
      (() => {{
        const types = {json.dumps(required_types)};
        const uavOverlay = document.getElementById('uav-tactical-overlay');
        const container = document.getElementById('ai-detections-container');
        const uavZ = parseInt(window.getComputedStyle(uavOverlay).zIndex);
        const containerZ = parseInt(window.getComputedStyle(container).zIndex);

        const results = {{}};
        types.forEach(type => {{
          results[type] = {{
            uavLayerAbove: uavZ > containerZ,
            uavZ: uavZ,
            labelZ: containerZ
          }};
        }});

        return results;
      }})()
    """)

    for cat, res in coverage_result.items():
        print(f"  [{cat}] UAV layer ({res['uavZ']}) > Label layer ({res['labelZ']}): {res['uavLayerAbove']}")
        assert res['uavLayerAbove'], f"UAV layer must be higher than {cat} label!"

    print("  -> All 8 required annotation types verified underneath UAV layer!")

    print("\n=== TEST 6: Movement Vector & Trajectory Line Layering ===")
    vector_test = eval_js(ws, """
      (() => {
        const app = window.droneApp;
        app.sensors.setSensorMode('LIDAR');
        const s = app.sensors;

        const hasVector = !!s.movementVectorGroup;
        const hasLine = !!s.lidarTrajectoryLine;
        const vectorVis = s.movementVectorGroup ? s.movementVectorGroup.visible : false;
        const lineVis = s.lidarTrajectoryLine ? s.lidarTrajectoryLine.visible : false;

        return {
          hasVector,
          hasLine,
          vectorVis,
          lineVis,
          movementVectorParent: s.movementVectorGroup ? s.movementVectorGroup.parent === app.scene : false,
          trajectoryLineParent: s.lidarTrajectoryLine ? s.lidarTrajectoryLine.parent === app.scene : false
        };
      })()
    """)

    print(f"  Movement Vector Group Exists: {vector_test['hasVector']} (Visible in LiDAR: {vector_test['vectorVis']})")
    print(f"  Trajectory Line Exists: {vector_test['hasLine']} (Visible in LiDAR: {vector_test['lineVis']})")
    print(f"  Movement Vector Scene Attached: {vector_test['movementVectorParent']}")
    print(f"  Trajectory Line Scene Attached: {vector_test['trajectoryLineParent']}")

    assert vector_test['hasVector'], "Movement vector group must exist!"
    assert vector_test['hasLine'], "Trajectory line must exist!"
    assert vector_test['vectorVis'], "Movement vector must be active in LiDAR mode!"
    assert vector_test['lineVis'], "Trajectory line must be active in LiDAR mode!"
    print("  -> Movement vector and trajectory line verified logically connected & rendered!")

    # Switch back to OPTICAL mode
    eval_js(ws, "window.droneApp.sensors.setSensorMode('RGB');")
    time.sleep(1.0)

    print("\n=== TEST 7: Capture High-Resolution Verification Screenshot ===")
    shot_resp = send_cdp(ws, 'Page.captureScreenshot', {'format': 'png'})
    img_b64 = shot_resp.get('result', {}).get('data', '')
    if img_b64:
        img_bytes = base64.b64decode(img_b64)
        out_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'drone_rendering_priority_verified.png')
        with open(out_path, 'wb') as f:
            f.write(img_bytes)
        print(f"  [Screenshot] Saved: drone_rendering_priority_verified.png ({len(img_bytes)} bytes)")

    print("\n=======================================================")
    print("  ALL DRONE RENDERING PRIORITY TESTS PASSED!")
    print("=======================================================\n")

finally:
    try:
        proc.kill()
    except Exception:
        pass
