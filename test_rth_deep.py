import http.server, threading, time, subprocess, os, json, socket, base64, struct, urllib.request, tempfile, sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')

PORT = 8089
server = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), http.server.SimpleHTTPRequestHandler)
t = threading.Thread(target=server.serve_forever, daemon=True)
t.start()
print(f"HTTP Server started on port {PORT}")

edge = r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
temp_profile = tempfile.mkdtemp(prefix='edge_rth_test_')

cmd = [
    edge,
    '--headless=new',
    '--remote-debugging-port=9222',
    '--remote-allow-origins=*',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1600,900',
    f'--user-data-dir={temp_profile}',
    f'http://127.0.0.1:{PORT}/index.html'
]
proc = subprocess.Popen(cmd)
time.sleep(5.0)

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

def eval_js(ws, expr):
    mid = send_cdp(ws, 'Runtime.evaluate', {'expression': expr, 'returnByValue': True})
    res = recv_cdp(ws, mid)
    val = res.get('result', {}).get('result', {}).get('value')
    if val is None and 'exceptionDetails' in res.get('result', {}):
        raise RuntimeError(f"JS Exception: {res['result']['exceptionDetails']}")
    return val

errors_list = []
def check_console_errors(ws):
    return eval_js(ws, 'JSON.stringify(window.errors || [])')

try:
    tabs = json.loads(urllib.request.urlopen('http://127.0.0.1:9222/json').read())
    sim_tab = None
    for tab in tabs:
        if str(PORT) in tab.get('url', ''):
            sim_tab = tab
            break
    if not sim_tab:
        raise RuntimeError('Simulation tab not found!')
    
    ws = create_ws(sim_tab['webSocketDebuggerUrl'])
    print("WebSocket connection established to sim tab.")

    # Enable console / errors tracking
    eval_js(ws, '''
        window.errors = [];
        window.addEventListener('error', e => window.errors.push(e.message || String(e)));
    ''')

    # Wait for app readiness
    time.sleep(1.5)
    app_ready = eval_js(ws, '!!window.droneApp && !!window.droneApp.drone')
    print("App Ready:", app_ready)
    assert app_ready, "droneApp must be initialized!"

    # =========================================================================
    # TEST 1: Initial Home Station Coordinates & 3D Marker Verification
    # =========================================================================
    print("\n--- TEST 1: Initial Home Station & 3D Marker ---")
    t1_res = json.loads(eval_js(ws, '''
        (() => {
            const app = window.droneApp;
            const drone = app.drone;
            const env = app.environment;
            const homePos = drone.homePosition;
            const homeRot = drone.homeRotation;
            const marker = env.homeStationGroup;
            
            return JSON.stringify({
                hasHomePos: !!homePos,
                homeX: homePos ? homePos.x : null,
                homeY: homePos ? homePos.y : null,
                homeZ: homePos ? homePos.z : null,
                hasMarker: !!marker,
                markerInScene: marker ? !!marker.parent : false,
                markerChildrenCount: marker ? marker.children.length : 0,
                hasPulseRing: !!env.homeStationPulseRing,
                markerPos: marker ? { x: marker.position.x, y: marker.position.y, z: marker.position.z } : null
            });
        })()
    '''))
    print("Test 1 Result:", t1_res)
    assert t1_res['hasHomePos'], "homePosition must be defined on drone!"
    assert abs(t1_res['homeX'] - 0.0) < 0.01, "Initial Home X must be 0.0"
    assert abs(t1_res['homeY'] - 0.75) < 0.01, f"Initial Home Y in earthquake must be 0.75, got {t1_res['homeY']}"
    assert abs(t1_res['homeZ'] - 0.0) < 0.01, "Initial Home Z must be 0.0"
    assert t1_res['hasMarker'] and t1_res['markerInScene'], "Home Station marker must exist in the 3D scene!"
    assert t1_res['markerChildrenCount'] >= 6, "Marker must have pad, rings, beacon, label, etc."
    assert t1_res['hasPulseRing'], "Home Station must have animated pulsing sonar/radar ring!"
    print("[PASS] Test 1 PASSED: Home Station coordinates saved & 3D marker rendered.")

    # =========================================================================
    # TEST 2: UI Buttons & HUD Indicator in DOM
    # =========================================================================
    print("\n--- TEST 2: UI Buttons & HUD Indicators ---")
    t2_res = json.loads(eval_js(ws, '''
        (() => {
            const btnFooter = document.getElementById('btn-return-home');
            const btnManual = document.getElementById('btn-manual-rth');
            const btnGcs = document.getElementById('btn-rth');
            const hudIndicator = document.getElementById('hud-rth-indicator');
            const hudText = document.getElementById('hud-rth-text');
            const headerDot = document.getElementById('header-status-dot');
            const headerText = document.getElementById('header-status-text');

            return JSON.stringify({
                hasBtnFooter: !!btnFooter,
                btnFooterText: btnFooter ? btnFooter.innerText.trim() : null,
                hasBtnManual: !!btnManual,
                btnManualText: btnManual ? btnManual.innerText.trim() : null,
                hasBtnGcs: !!btnGcs,
                btnGcsText: btnGcs ? btnGcs.innerText.trim() : null,
                hasHudIndicator: !!hudIndicator,
                hudIndicatorInitialDisplay: hudIndicator ? window.getComputedStyle(hudIndicator).display : null,
                hasHudText: !!hudText,
                hasHeaderDot: !!headerDot,
                hasHeaderText: !!headerText
            });
        })()
    '''))
    print("Test 2 Result:", t2_res)
    assert t2_res['hasBtnFooter'], "Footer RETURN TO HOME button must exist!"
    assert "RETURN TO HOME" in t2_res['btnFooterText'], f"Footer button text must be 'RETURN TO HOME', got '{t2_res['btnFooterText']}'"
    assert t2_res['hasBtnManual'], "Manual HUD RETURN TO HOME button must exist!"
    assert "RETURN TO HOME" in t2_res['btnManualText'], f"Manual button text must be 'RETURN TO HOME', got '{t2_res['btnManualText']}'"
    assert t2_res['hasBtnGcs'], "GCS RETURN TO HOME button must exist!"
    assert "RETURN TO HOME" in t2_res['btnGcsText'], f"GCS button text must be 'RETURN TO HOME', got '{t2_res['btnGcsText']}'"
    assert t2_res['hasHudIndicator'], "HUD RTH status indicator must exist!"
    assert t2_res['hudIndicatorInitialDisplay'] == 'none', "HUD RTH indicator should initially be hidden"
    print("[PASS] Test 2 PASSED: All RETURN TO HOME buttons and HUD elements exist and are styled.")

    # =========================================================================
    # TEST 3: Return to Home Flight Dynamics & Live Status Indicator
    # =========================================================================
    print("\n--- TEST 3: Return to Home Behavior & Safe Altitude ---")
    
    # 1. Fly drone to an arbitrary distant location
    eval_js(ws, '''
        (() => {
            const app = window.droneApp;
            // Place drone at a distant point (x=24, y=14, z=-28)
            app.drone.group.position.set(24, 14, -28);
            app.drone.targetPosition.set(24, 14, -28);
            app.drone.telemetry.isFlying = true;
            app.drone.telemetry.isArmed = true;
            app.navigator.setNavMode('GRID');
        })()
    ''')
    time.sleep(0.5)

    # 2. Trigger RETURN TO HOME via button click
    eval_js(ws, '''
        document.getElementById('btn-return-home').click();
    ''')
    time.sleep(0.3)

    t3_start = json.loads(eval_js(ws, '''
        (() => {
            const app = window.droneApp;
            const hud = document.getElementById('hud-rth-indicator');
            const hudText = document.getElementById('hud-rth-text');
            const headerText = document.getElementById('header-status-text');
            const footerStatus = document.getElementById('footer-rth-status');

            return JSON.stringify({
                navMode: app.navigator.navMode,
                isReturningHome: app.navigator.isReturningHome,
                rthStatus: app.navigator.rthStatus,
                flightMode: app.drone.telemetry.flightMode,
                hudDisplay: hud ? window.getComputedStyle(hud).display : null,
                hudText: hudText ? hudText.innerText.trim() : null,
                headerText: headerText ? headerText.innerText.trim() : null,
                footerStatusDisplay: footerStatus ? window.getComputedStyle(footerStatus).display : null,
                btnActive: document.getElementById('btn-return-home').classList.contains('active')
            });
        })()
    '''))
    print("Test 3 Start RTH State:", t3_start)
    assert t3_start['navMode'] == 'RTH', f"navMode should be 'RTH', got {t3_start['navMode']}"
    assert t3_start['isReturningHome'] is True, "isReturningHome should be true"
    assert t3_start['rthStatus'] == 'RETURNING TO HOME', f"rthStatus should be 'RETURNING TO HOME', got {t3_start['rthStatus']}"
    assert t3_start['hudDisplay'] in ('flex', 'block'), "HUD RTH indicator must be visible while returning!"
    assert t3_start['hudText'] == 'RETURNING TO HOME', f"HUD indicator text should be 'RETURNING TO HOME', got {t3_start['hudText']}"
    assert t3_start['headerText'] == 'RETURNING TO HOME', f"Header status text should be 'RETURNING TO HOME', got {t3_start['headerText']}"
    assert t3_start['btnActive'] is True, "RETURN TO HOME button should be active"

    # Capture screenshot while returning to home
    mid_inflight = send_cdp(ws, 'Page.captureScreenshot', {'format': 'png'})
    res_inflight = recv_cdp(ws, mid_inflight)
    b64_inflight = res_inflight.get('result', {}).get('data')
    if b64_inflight:
        with open('rth_in_flight_view.png', 'wb') as img_f:
            img_f.write(base64.b64decode(b64_inflight))
        print("Captured in-flight screenshot saved to rth_in_flight_view.png")

    # Step simulation frames and verify safe altitude (> 18m during climb/transit)
    min_altitude_seen = 999
    max_altitude_seen = 0
    arrived = False

    for step in range(120):
        # Step the app update by delta=0.1
        eval_js(ws, 'window.droneApp.animateStep ? window.droneApp.animateStep(0.1) : window.droneApp.navigator.update(0.1), window.droneApp.drone.update(0.1)')
        pos = json.loads(eval_js(ws, '''
            (() => {
                const drone = window.droneApp.drone;
                const nav = window.droneApp.navigator;
                return JSON.stringify({
                    x: drone.group.position.x,
                    y: drone.group.position.y,
                    z: drone.group.position.z,
                    rthPhase: nav.rthPhase,
                    rthStatus: nav.rthStatus,
                    flightMode: drone.telemetry.flightMode
                });
            })()
        '''))
        min_altitude_seen = min(min_altitude_seen, pos['y'])
        max_altitude_seen = max(max_altitude_seen, pos['y'])
        if pos['rthStatus'] == 'HOME REACHED':
            arrived = True
            print(f"Arrived at Home Station on step {step}: pos=({pos['x']:.2f}, {pos['y']:.2f}, {pos['z']:.2f})")
            break

    assert arrived, "UAV should have arrived at Home Station within simulation steps!"
    assert max_altitude_seen >= 18.0, f"UAV should have climbed to safe altitude >= 18m, max seen was {max_altitude_seen:.2f}"
    
    # Check arrived state
    t3_arrived = json.loads(eval_js(ws, '''
        (() => {
            const app = window.droneApp;
            const hud = document.getElementById('hud-rth-indicator');
            const hudText = document.getElementById('hud-rth-text');
            const headerText = document.getElementById('header-status-text');
            const homePos = app.drone.homePosition;
            const dronePos = app.drone.group.position;
            const dist = dronePos.distanceTo(homePos);

            return JSON.stringify({
                rthStatus: app.navigator.rthStatus,
                flightMode: app.drone.telemetry.flightMode,
                hudText: hudText ? hudText.innerText.trim() : null,
                headerText: headerText ? headerText.innerText.trim() : null,
                hudArrivedClass: hud ? hud.classList.contains('arrived') : false,
                distToHome: dist,
                speed: app.drone.telemetry.groundSpeed,
                isFlying: app.drone.telemetry.isFlying
            });
        })()
    '''))
    print("Test 3 Arrived State:", t3_arrived)
    assert t3_arrived['rthStatus'] == 'HOME REACHED', "rthStatus should be 'HOME REACHED'"
    assert t3_arrived['hudText'] == 'HOME REACHED', f"HUD indicator text should be 'HOME REACHED', got {t3_arrived['hudText']}"
    assert t3_arrived['headerText'] == 'HOME REACHED', f"Header text should be 'HOME REACHED', got {t3_arrived['headerText']}"
    assert t3_arrived['hudArrivedClass'] is True, "HUD indicator should have 'arrived' class"
    assert t3_arrived['distToHome'] < 0.6, f"Drone should be within 0.6m of homePosition, got {t3_arrived['distToHome']:.2f}m"
    assert t3_arrived['speed'] < 0.1, "Drone speed should be stopped at station"

    # Step simulation 20 more frames to verify drone STAYS firmly stationed and obstacle avoidance does not push it up
    for post_step in range(20):
        eval_js(ws, 'window.droneApp.navigator.update(0.1), window.droneApp.drone.update(0.1)')
    
    t3_post_stay = json.loads(eval_js(ws, '''
        (() => {
            const app = window.droneApp;
            const homePos = app.drone.homePosition;
            const dronePos = app.drone.group.position;
            return JSON.stringify({
                distToHome: dronePos.distanceTo(homePos),
                yPos: dronePos.y,
                homeY: homePos.y,
                speed: app.drone.telemetry.groundSpeed,
                vertSpeed: app.drone.telemetry.verticalSpeed
            });
        })()
    '''))
    print("Test 3 Post-Arrival Stability State:", t3_post_stay)
    assert t3_post_stay['distToHome'] < 0.35, f"Drone drifted after arrival: {t3_post_stay['distToHome']:.2f}m"
    assert abs(t3_post_stay['yPos'] - t3_post_stay['homeY']) < 0.2, f"Drone lifted off after arrival: y={t3_post_stay['yPos']:.2f}, homeY={t3_post_stay['homeY']:.2f}"
    assert t3_post_stay['speed'] == 0, f"Drone moving after arrival: groundSpeed={t3_post_stay['speed']}"
    assert t3_post_stay['vertSpeed'] == 0, f"Drone moving vertically after arrival: vertSpeed={t3_post_stay['vertSpeed']}"
    print("[PASS] Test 3 PASSED: Smooth return, safe altitude clearance, stopped at Home Station, HOME REACHED displayed, and stationed firmly without obstacle avoidance drift.")

    # =========================================================================
    # TEST 4: Manual Mode Interaction with Return to Home
    # =========================================================================
    print("\n--- TEST 4: Manual Mode Interaction ---")
    
    # 1. Switch to Manual Mode
    eval_js(ws, '''
        window.droneApp.navigator.setNavMode('MANUAL');
    ''')
    time.sleep(0.3)

    t4_manual_start = json.loads(eval_js(ws, '''
        (() => {
            const nav = window.droneApp.navigator;
            const panel = document.getElementById('manual-control-panel');
            const badge = document.getElementById('manual-hud-status-badge');
            return JSON.stringify({
                navMode: nav.navMode,
                panelDisplay: panel ? window.getComputedStyle(panel).display : null,
                badgeText: badge ? badge.innerText.trim() : null
            });
        })()
    '''))
    print("Test 4 Manual Start:", t4_manual_start)
    assert t4_manual_start['navMode'] == 'MANUAL', "Should be in MANUAL mode"
    assert t4_manual_start['panelDisplay'] == 'block', "Manual control panel must be displayed"
    assert t4_manual_start['badgeText'] == 'ACTIVE', "Manual badge should be ACTIVE"

    # 2. Simulate manual keypresses to fly drone away
    eval_js(ws, '''
        (() => {
            const nav = window.droneApp.navigator;
            // Press W and Up
            nav.keys.forward = true;
            nav.keys.up = true;
            nav.updateKeyHighlight('forward', true);
            nav.updateKeyHighlight('up', true);
            // Move drone to (12, 8, 15)
            window.droneApp.drone.group.position.set(12, 8, 15);
            window.droneApp.drone.targetPosition.set(12, 8, 15);
        })()
    ''')

    t4_keys_active = json.loads(eval_js(ws, '''
        (() => {
            const itemW = document.getElementById('item-w');
            const itemUp = document.getElementById('item-up');
            const nav = window.droneApp.navigator;
            return JSON.stringify({
                keyWPressed: nav.keys.forward,
                itemWActive: itemW ? itemW.classList.contains('active') : false,
                itemUpActive: itemUp ? itemUp.classList.contains('active') : false
            });
        })()
    '''))
    print("Test 4 Keys Active before RTH:", t4_keys_active)
    assert t4_keys_active['keyWPressed'] and t4_keys_active['itemWActive'], "Key W should be active"

    # 3. Click RETURN TO HOME while in Manual Mode
    eval_js(ws, '''
        document.getElementById('btn-manual-rth').click();
    ''')
    time.sleep(0.3)

    t4_rth_override = json.loads(eval_js(ws, '''
        (() => {
            const nav = window.droneApp.navigator;
            const panel = document.getElementById('manual-control-panel');
            const itemW = document.getElementById('item-w');
            const itemUp = document.getElementById('item-up');
            const badge = document.getElementById('manual-hud-status-badge');
            const hudText = document.getElementById('hud-rth-text');

            return JSON.stringify({
                navMode: nav.navMode,
                wasManualMode: nav.wasManualMode,
                isReturningHome: nav.isReturningHome,
                rthStatus: nav.rthStatus,
                panelDisplay: panel ? window.getComputedStyle(panel).display : null,
                keysForward: nav.keys.forward,
                keysUp: nav.keys.up,
                itemWActive: itemW ? itemW.classList.contains('active') : false,
                itemUpActive: itemUp ? itemUp.classList.contains('active') : false,
                badgeText: badge ? badge.innerText.trim() : null,
                hudText: hudText ? hudText.innerText.trim() : null
            });
        })()
    '''))
    print("Test 4 RTH Override State:", t4_rth_override)
    assert t4_rth_override['navMode'] == 'RTH', "navMode should be temporarily RTH"
    assert t4_rth_override['wasManualMode'] is True, "wasManualMode should be true"
    assert t4_rth_override['panelDisplay'] == 'block', "Manual control panel MUST remain visible during return!"
    assert t4_rth_override['keysForward'] is False and t4_rth_override['keysUp'] is False, "Manual keys must be cleared/stopped!"
    assert t4_rth_override['itemWActive'] is False and t4_rth_override['itemUpActive'] is False, "Key highlights must be cleared!"
    assert t4_rth_override['hudText'] == 'RETURNING TO HOME', "Status indicator should display RETURNING TO HOME"

    # 4. Step simulation until Home Station is reached
    for step in range(120):
        eval_js(ws, 'window.droneApp.navigator.update(0.1), window.droneApp.drone.update(0.1)')
        status = eval_js(ws, 'window.droneApp.navigator.rthStatus')
        if status == 'HOME REACHED':
            print(f"Manual RTH arrived on step {step}")
            break

    t4_home_reached = json.loads(eval_js(ws, '''
        (() => {
            const nav = window.droneApp.navigator;
            const hudText = document.getElementById('hud-rth-text');
            const badge = document.getElementById('manual-hud-status-badge');
            return JSON.stringify({
                rthStatus: nav.rthStatus,
                hudText: hudText ? hudText.innerText.trim() : null,
                badgeText: badge ? badge.innerText.trim() : null
            });
        })()
    '''))
    print("Test 4 Home Reached State:", t4_home_reached)
    assert t4_home_reached['rthStatus'] == 'HOME REACHED'
    assert t4_home_reached['hudText'] == 'HOME REACHED'

    # Wait for the control handoff back to manual mode (1.6s timeout)
    time.sleep(2.0)

    t4_handoff = json.loads(eval_js(ws, '''
        (() => {
            const nav = window.droneApp.navigator;
            const panel = document.getElementById('manual-control-panel');
            const badge = document.getElementById('manual-hud-status-badge');
            const btnManual = document.querySelector('.nav-mode-btn[data-nav="MANUAL"]');

            return JSON.stringify({
                navMode: nav.navMode,
                flightMode: window.droneApp.drone.telemetry.flightMode,
                panelDisplay: panel ? window.getComputedStyle(panel).display : null,
                badgeText: badge ? badge.innerText.trim() : null,
                btnManualActive: btnManual ? btnManual.classList.contains('active') : false,
                headerText: document.getElementById('header-status-text') ? document.getElementById('header-status-text').innerText.trim() : null,
                hudDisplay: document.getElementById('hud-rth-indicator') ? window.getComputedStyle(document.getElementById('hud-rth-indicator')).display : null
            });
        })()
    '''))
    print("Test 4 Control Handoff State:", t4_handoff)
    assert t4_handoff['navMode'] == 'MANUAL', f"Control should have returned to MANUAL, got {t4_handoff['navMode']}"
    assert t4_handoff['panelDisplay'] == 'block', "Manual control panel should still be visible"
    assert t4_handoff['badgeText'] == 'ACTIVE', "Manual badge should be ACTIVE"
    assert t4_handoff['btnManualActive'] is True, "Manual nav button should be active"
    assert t4_handoff['headerText'] == 'MANUAL TELEOPERATION', f"Header text should update to MANUAL TELEOPERATION, got '{t4_handoff['headerText']}'"
    assert t4_handoff['hudDisplay'] == 'none', "HUD indicator should be hidden after handoff to manual"
    print("[PASS] Test 4 PASSED: Manual mode key highlights cleared, panel kept visible, smooth return, and control returned to user with clean header status.")

    # =========================================================================
    # TEST 5: Scenario Switching & Dynamic Launch Position Update
    # =========================================================================
    print("\n--- TEST 5: Scenario Switching Coordinates ---")
    
    # Switch to flash flood
    eval_js(ws, 'window.droneApp.setScenario("flash_flood")')
    time.sleep(1.0)

    t5_flood = json.loads(eval_js(ws, '''
        (() => {
            const app = window.droneApp;
            const home = app.drone.homePosition;
            const marker = app.environment.homeStationGroup;
            return JSON.stringify({
                scenario: app.environment.currentScenario,
                homeY: home.y,
                markerY: marker ? marker.position.y : null,
                elevation: app.drone.groundElevation
            });
        })()
    '''))
    print("Test 5 Flood Home Station:", t5_flood)
    assert abs(t5_flood['homeY'] - 2.65) < 0.05, f"In flash flood, Home Y should be ~2.65 (elevated wharf), got {t5_flood['homeY']}"
    assert abs(t5_flood['markerY'] - 1.93) < 0.05, f"Marker base in flash flood should sit on wharf surface ~1.93, got {t5_flood['markerY']}"

    # Switch back to earthquake
    eval_js(ws, 'window.droneApp.setScenario("earthquake")')
    time.sleep(1.0)

    t5_earthquake = json.loads(eval_js(ws, '''
        (() => {
            const app = window.droneApp;
            const home = app.drone.homePosition;
            const marker = app.environment.homeStationGroup;
            return JSON.stringify({
                scenario: app.environment.currentScenario,
                homeY: home.y,
                markerY: marker ? marker.position.y : null,
                elevation: app.drone.groundElevation
            });
        })()
    '''))
    print("Test 5 Earthquake Home Station:", t5_earthquake)
    assert abs(t5_earthquake['homeY'] - 0.75) < 0.05, f"In earthquake, Home Y should be 0.75, got {t5_earthquake['homeY']}"
    print("[PASS] Test 5 PASSED: Home Station coordinates dynamically update for scenario launch elevations.")

    # =========================================================================
    # TEST 6: Capture Screenshot of Return to Home Interface
    # =========================================================================
    print("\n--- TEST 6: Visual Capture ---")
    # Take screenshot of current viewport
    mid_ss = send_cdp(ws, 'Page.captureScreenshot', {'format': 'png'})
    res_ss = recv_cdp(ws, mid_ss)
    b64_ss = res_ss.get('result', {}).get('data')
    if b64_ss:
        with open('rth_verification_view.png', 'wb') as img_f:
            img_f.write(base64.b64decode(b64_ss))
        print(f"Captured screenshot saved to rth_verification_view.png ({os.path.getsize('rth_verification_view.png')} bytes)")

    # =========================================================================
    # TEST 7: Zero Console Errors Check
    # =========================================================================
    print("\n--- TEST 7: Console Errors Check ---")
    errs = json.loads(check_console_errors(ws))
    print("Captured Errors:", errs)
    assert len(errs) == 0, f"Found {len(errs)} console errors: {errs}"
    print("[PASS] Test 7 PASSED: 0 runtime errors.")

    # =========================================================================
    # TEST 8: Rapid Clicks & Idempotency Check
    # =========================================================================
    print("\n--- TEST 8: Rapid Clicks & Idempotency ---")
    eval_js(ws, '''
        (() => {
            for (let i = 0; i < 5; i++) {
                document.getElementById('btn-return-home').click();
            }
        })()
    ''')
    time.sleep(0.3)
    t8_res = json.loads(eval_js(ws, '''
        (() => {
            const nav = window.droneApp.navigator;
            return JSON.stringify({
                navMode: nav.navMode,
                rthStatus: nav.rthStatus,
                isReturningHome: nav.isReturningHome
            });
        })()
    '''))
    print("Test 8 Rapid Clicks State:", t8_res)
    assert t8_res['navMode'] == 'RTH', "navMode should be RTH"
    print("[PASS] Test 8 PASSED: Rapid clicks handled idempotently without error.")

    # =========================================================================
    # TEST 9: Mid-Flight RTH Cancellation & Clean UI Reset
    # =========================================================================
    print("\n--- TEST 9: Mid-Flight RTH Cancellation ---")
    eval_js(ws, '''
        (() => {
            // Cancel RTH by switching to GRID
            document.querySelector('.nav-mode-btn[data-nav="GRID"]').click();
        })()
    ''')
    time.sleep(0.3)
    t9_res = json.loads(eval_js(ws, '''
        (() => {
            const app = window.droneApp;
            const hud = document.getElementById('hud-rth-indicator');
            const panel = document.getElementById('manual-control-panel');
            const headerText = document.getElementById('header-status-text');
            return JSON.stringify({
                navMode: app.navigator.navMode,
                flightMode: app.drone.telemetry.flightMode,
                isReturningHome: app.navigator.isReturningHome,
                rthStatus: app.navigator.rthStatus,
                hudDisplay: hud ? window.getComputedStyle(hud).display : null,
                panelDisplay: panel ? window.getComputedStyle(panel).display : null,
                headerText: headerText ? headerText.innerText.trim() : null
            });
        })()
    '''))
    print("Test 9 Cancellation State:", t9_res)
    assert t9_res['navMode'] == 'GRID', f"Mode should be GRID, got {t9_res['navMode']}"
    assert t9_res['isReturningHome'] is False, "isReturningHome should be false"
    assert t9_res['rthStatus'] is None, "rthStatus should be null"
    assert t9_res['hudDisplay'] == 'none', "HUD indicator should be hidden"
    assert t9_res['panelDisplay'] == 'none', "Manual panel should be hidden"
    assert "GRID" in t9_res['headerText'], f"Header should indicate GRID, got {t9_res['headerText']}"
    print("[PASS] Test 9 PASSED: Mid-flight RTH cancellation cleans up all states and UI.")

    # =========================================================================
    # TEST 10: HUD Indicator Non-Overlapping Position
    # =========================================================================
    print("\n--- TEST 10: HUD Indicator Non-Overlapping Position ---")
    t10_res = json.loads(eval_js(ws, '''
        (() => {
            const hud = document.getElementById('hud-rth-indicator');
            const topVal = window.getComputedStyle(hud).top;
            return JSON.stringify({ top: parseInt(topVal, 10) });
        })()
    '''))
    print("Test 10 Top Offset:", t10_res)
    assert t10_res['top'] >= 135, f"HUD indicator top must be >= 135px to avoid colliding with compass (66px) & disaster header (104px), got {t10_res['top']}px"
    print("[PASS] Test 10 PASSED: HUD indicator positioned cleanly without overlapping compass or disaster headers.")

    print("\n========================================================")
    print("  ALL TESTS PASSED SUCCESSFULLY (10/10)!")
    print("========================================================\n")

finally:
    proc.terminate()
    proc.wait()
    server.shutdown()
