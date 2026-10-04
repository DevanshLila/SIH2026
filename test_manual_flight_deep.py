import http.server, threading, time, subprocess, os, json, socket, base64, struct, urllib.request, tempfile, sys, math

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')

# Check if port 8000 is running
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
temp_profile = tempfile.mkdtemp(prefix='edge_manual_test_')

cmd = [
    edge,
    '--headless=new',
    '--remote-debugging-port=9223',
    '--remote-allow-origins=*',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1600,900',
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

try:
    tabs = json.loads(urllib.request.urlopen('http://127.0.0.1:9223/json').read())
    sim_tab = next(t for t in tabs if str(PORT) in t.get('url', ''))
    ws = create_ws(sim_tab['webSocketDebuggerUrl'])
    print("WebSocket connected successfully")

    # Wait for app readiness
    for _ in range(20):
        ready = eval_js(ws, '!!(window.droneApp && window.droneApp.drone && window.droneApp.navigator)')
        if ready:
            break
        time.sleep(0.5)

    print("App Ready:", eval_js(ws, '!!window.droneApp'))

    # Enable MANUAL mode
    eval_js(ws, """
        window.droneApp.navigator.setNavMode('MANUAL');
        window.droneApp.drone.telemetry.isFlying = true;
        window.droneApp.drone.telemetry.isArmed = true;
        // Place drone at (0, 10, 0) with 0 rotation
        window.droneApp.drone.group.position.set(0, 10, 0);
        window.droneApp.drone.targetPosition.set(0, 10, 0);
        window.droneApp.drone.group.rotation.set(0, 0, 0);
        window.droneApp.drone.targetRotation.set(0, 0, 0);
    """)

    # Verify panel and active badge
    panel_info = json.loads(eval_js(ws, """
        JSON.stringify({
            display: document.getElementById('manual-control-panel').style.display,
            badge: document.getElementById('manual-hud-status-badge').textContent,
            mode: window.droneApp.navigator.navMode
        })
    """))
    print("Manual Panel Info:", panel_info)
    assert panel_info['display'] == 'block', "Panel must be displayed"
    assert panel_info['badge'] == 'ACTIVE', "Badge must say ACTIVE"
    assert panel_info['mode'] == 'MANUAL', "Mode must be MANUAL"

    # --- TEST 1: W (Forward) at Heading 0 (facing +Z) ---
    print("\n--- TEST 1: W (Forward) at Heading 0 ---")
    eval_js(ws, """
        (() => {
            const nav = window.droneApp.navigator;
            nav.resetKeys();
            window.droneApp.drone.group.position.set(0, 10, 0);
            window.droneApp.drone.targetPosition.set(0, 10, 0);
            window.droneApp.drone.group.rotation.set(0, 0, 0);
            window.droneApp.drone.targetRotation.set(0, 0, 0);
            nav.handleKeyDown({ code: 'KeyW', key: 'w', preventDefault: () => {} });
        })()
    """)

    key_w_state = json.loads(eval_js(ws, """
        JSON.stringify({
            forwardKey: window.droneApp.navigator.keys.forward,
            boxActive: document.getElementById('key-w').classList.contains('active'),
            itemActive: document.getElementById('item-w').classList.contains('active')
        })
    """))
    print("Key W state:", key_w_state)
    assert key_w_state['forwardKey'] and key_w_state['boxActive'] and key_w_state['itemActive'], "Key W highlight and state must be active"

    # Run physics updates
    for _ in range(15):
        eval_js(ws, 'window.droneApp.navigator.update(0.05); window.droneApp.drone.update(0.05);')

    pos_w = json.loads(eval_js(ws, """
        JSON.stringify({
            x: window.droneApp.drone.group.position.x,
            y: window.droneApp.drone.group.position.y,
            z: window.droneApp.drone.group.position.z
        })
    """))
    print("Position after W:", pos_w)
    assert pos_w['z'] > 0.5, f"W must move forward in +Z direction towards nose, got {pos_w['z']}"
    assert abs(pos_w['x']) < 0.01, f"W must not drift horizontally in X, got {pos_w['x']}"

    # Release W
    eval_js(ws, """window.droneApp.navigator.handleKeyUp({ code: 'KeyW', key: 'w', preventDefault: () => {} });""")
    w_released = json.loads(eval_js(ws, """
        JSON.stringify({
            forwardKey: window.droneApp.navigator.keys.forward,
            boxActive: document.getElementById('key-w').classList.contains('active')
        })
    """))
    assert not w_released['forwardKey'] and not w_released['boxActive'], "Key W released"
    print("[PASS] TEST 1: Key W moved forward toward nose (+Z) correctly.")

    # --- TEST 2: S (Backward) at Heading 0 (facing +Z) ---
    print("\n--- TEST 2: S (Backward) at Heading 0 ---")
    eval_js(ws, """
        (() => {
            const nav = window.droneApp.navigator;
            nav.resetKeys();
            window.droneApp.drone.group.position.set(0, 10, 0);
            window.droneApp.drone.targetPosition.set(0, 10, 0);
            window.droneApp.drone.group.rotation.set(0, 0, 0);
            window.droneApp.drone.targetRotation.set(0, 0, 0);
            nav.handleKeyDown({ code: 'KeyS', key: 's', preventDefault: () => {} });
        })()
    """)

    key_s_state = json.loads(eval_js(ws, """
        JSON.stringify({
            backwardKey: window.droneApp.navigator.keys.backward,
            boxActive: document.getElementById('key-s').classList.contains('active'),
            itemActive: document.getElementById('item-s').classList.contains('active')
        })
    """))
    print("Key S state:", key_s_state)
    assert key_s_state['backwardKey'] and key_s_state['boxActive'] and key_s_state['itemActive'], "Key S highlight and state must be active"

    for _ in range(15):
        eval_js(ws, 'window.droneApp.navigator.update(0.05); window.droneApp.drone.update(0.05);')

    pos_s = json.loads(eval_js(ws, """
        JSON.stringify({
            x: window.droneApp.drone.group.position.x,
            y: window.droneApp.drone.group.position.y,
            z: window.droneApp.drone.group.position.z
        })
    """))
    print("Position after S:", pos_s)
    assert pos_s['z'] < -0.5, f"S must move backward in -Z direction, got {pos_s['z']}"
    assert abs(pos_s['x']) < 0.01, f"S must not drift horizontally in X, got {pos_s['x']}"

    eval_js(ws, """window.droneApp.navigator.handleKeyUp({ code: 'KeyS', key: 's', preventDefault: () => {} });""")
    print("[PASS] TEST 2: Key S moved backward opposite nose (-Z) correctly.")

    # --- TEST 3: A (Left) at Heading 0 (facing +Z) ---
    print("\n--- TEST 3: A (Left) at Heading 0 ---")
    eval_js(ws, """
        (() => {
            const nav = window.droneApp.navigator;
            nav.resetKeys();
            window.droneApp.drone.group.position.set(0, 10, 0);
            window.droneApp.drone.targetPosition.set(0, 10, 0);
            window.droneApp.drone.group.rotation.set(0, 0, 0);
            window.droneApp.drone.targetRotation.set(0, 0, 0);
            nav.handleKeyDown({ code: 'KeyA', key: 'a', preventDefault: () => {} });
        })()
    """)

    key_a_state = json.loads(eval_js(ws, """
        JSON.stringify({
            leftKey: window.droneApp.navigator.keys.left,
            boxActive: document.getElementById('key-a').classList.contains('active'),
            itemActive: document.getElementById('item-a').classList.contains('active')
        })
    """))
    print("Key A state:", key_a_state)
    assert key_a_state['leftKey'] and key_a_state['boxActive'] and key_a_state['itemActive'], "Key A highlight and state must be active"

    for _ in range(15):
        eval_js(ws, 'window.droneApp.navigator.update(0.05); window.droneApp.drone.update(0.05);')

    pos_a = json.loads(eval_js(ws, """
        JSON.stringify({
            x: window.droneApp.drone.group.position.x,
            y: window.droneApp.drone.group.position.y,
            z: window.droneApp.drone.group.position.z
        })
    """))
    print("Position after A:", pos_a)
    # When facing +Z, Left is +X
    assert pos_a['x'] > 0.5, f"A must move left towards UAV's left (+X), got {pos_a['x']}"
    assert abs(pos_a['z']) < 0.01, f"A must not drift in Z, got {pos_a['z']}"

    eval_js(ws, """window.droneApp.navigator.handleKeyUp({ code: 'KeyA', key: 'a', preventDefault: () => {} });""")
    print("[PASS] TEST 3: Key A moved toward drone left (+X) correctly.")

    # --- TEST 4: D (Right) at Heading 0 (facing +Z) ---
    print("\n--- TEST 4: D (Right) at Heading 0 ---")
    eval_js(ws, """
        (() => {
            const nav = window.droneApp.navigator;
            nav.resetKeys();
            window.droneApp.drone.group.position.set(0, 10, 0);
            window.droneApp.drone.targetPosition.set(0, 10, 0);
            window.droneApp.drone.group.rotation.set(0, 0, 0);
            window.droneApp.drone.targetRotation.set(0, 0, 0);
            nav.handleKeyDown({ code: 'KeyD', key: 'd', preventDefault: () => {} });
        })()
    """)

    key_d_state = json.loads(eval_js(ws, """
        JSON.stringify({
            rightKey: window.droneApp.navigator.keys.right,
            boxActive: document.getElementById('key-d').classList.contains('active'),
            itemActive: document.getElementById('item-d').classList.contains('active')
        })
    """))
    print("Key D state:", key_d_state)
    assert key_d_state['rightKey'] and key_d_state['boxActive'] and key_d_state['itemActive'], "Key D highlight and state must be active"

    for _ in range(15):
        eval_js(ws, 'window.droneApp.navigator.update(0.05); window.droneApp.drone.update(0.05);')

    pos_d = json.loads(eval_js(ws, """
        JSON.stringify({
            x: window.droneApp.drone.group.position.x,
            y: window.droneApp.drone.group.position.y,
            z: window.droneApp.drone.group.position.z
        })
    """))
    print("Position after D:", pos_d)
    # When facing +Z, Right is -X
    assert pos_d['x'] < -0.5, f"D must move right towards UAV's right (-X), got {pos_d['x']}"
    assert abs(pos_d['z']) < 0.01, f"D must not drift in Z, got {pos_d['z']}"

    eval_js(ws, """window.droneApp.navigator.handleKeyUp({ code: 'KeyD', key: 'd', preventDefault: () => {} });""")
    print("[PASS] TEST 4: Key D moved toward drone right (-X) correctly.")

    # --- TEST 5: ROTATED UAV (Yaw = +90 deg / +PI/2, Drone facing +X) ---
    print("\n--- TEST 5: Movement Relative to UAV Orientation (Yaw = +90 deg / +PI/2) ---")
    eval_js(ws, """
        (() => {
            const nav = window.droneApp.navigator;
            nav.resetKeys();
            window.droneApp.drone.group.position.set(0, 10, 0);
            window.droneApp.drone.targetPosition.set(0, 10, 0);
            window.droneApp.drone.group.rotation.set(0, Math.PI / 2, 0);
            window.droneApp.drone.targetRotation.set(0, Math.PI / 2, 0);
        })()
    """)

    # Test W facing +X -> must move along +X
    eval_js(ws, """window.droneApp.navigator.handleKeyDown({ code: 'KeyW', key: 'w', preventDefault: () => {} });""")
    for _ in range(15):
        eval_js(ws, 'window.droneApp.navigator.update(0.05); window.droneApp.drone.update(0.05);')
    pos_rot_w = json.loads(eval_js(ws, 'JSON.stringify(window.droneApp.drone.group.position)'))
    print("Yaw=+90 deg, Position after W:", pos_rot_w)
    assert pos_rot_w['x'] > 0.5, f"W must move forward along +X when yaw=PI/2, got {pos_rot_w['x']}"
    assert abs(pos_rot_w['z']) < 0.02, f"W must not drift along Z when yaw=PI/2, got {pos_rot_w['z']}"
    eval_js(ws, """window.droneApp.navigator.handleKeyUp({ code: 'KeyW', key: 'w', preventDefault: () => {} });""")

    # Test S facing +X -> must move along -X
    eval_js(ws, """
        window.droneApp.drone.group.position.set(0, 10, 0);
        window.droneApp.drone.targetPosition.set(0, 10, 0);
        window.droneApp.navigator.handleKeyDown({ code: 'KeyS', key: 's', preventDefault: () => {} });
    """)
    for _ in range(15):
        eval_js(ws, 'window.droneApp.navigator.update(0.05); window.droneApp.drone.update(0.05);')
    pos_rot_s = json.loads(eval_js(ws, 'JSON.stringify(window.droneApp.drone.group.position)'))
    print("Yaw=+90 deg, Position after S:", pos_rot_s)
    assert pos_rot_s['x'] < -0.5, f"S must move backward along -X when yaw=PI/2, got {pos_rot_s['x']}"
    assert abs(pos_rot_s['z']) < 0.02, f"S must not drift along Z when yaw=PI/2, got {pos_rot_s['z']}"
    eval_js(ws, """window.droneApp.navigator.handleKeyUp({ code: 'KeyS', key: 's', preventDefault: () => {} });""")

    # Test D (Right) facing +X -> drone's right is +Z!
    eval_js(ws, """
        window.droneApp.drone.group.position.set(0, 10, 0);
        window.droneApp.drone.targetPosition.set(0, 10, 0);
        window.droneApp.navigator.handleKeyDown({ code: 'KeyD', key: 'd', preventDefault: () => {} });
    """)
    for _ in range(15):
        eval_js(ws, 'window.droneApp.navigator.update(0.05); window.droneApp.drone.update(0.05);')
    pos_rot_d = json.loads(eval_js(ws, 'JSON.stringify(window.droneApp.drone.group.position)'))
    print("Yaw=+90 deg, Position after D (Right):", pos_rot_d)
    assert pos_rot_d['z'] > 0.5, f"D must move right along +Z when yaw=PI/2, got {pos_rot_d['z']}"
    assert abs(pos_rot_d['x']) < 0.02, f"D must not drift along X when yaw=PI/2, got {pos_rot_d['x']}"
    eval_js(ws, """window.droneApp.navigator.handleKeyUp({ code: 'KeyD', key: 'd', preventDefault: () => {} });""")

    # Test A (Left) facing +X -> drone's left is -Z!
    eval_js(ws, """
        window.droneApp.drone.group.position.set(0, 10, 0);
        window.droneApp.drone.targetPosition.set(0, 10, 0);
        window.droneApp.navigator.handleKeyDown({ code: 'KeyA', key: 'a', preventDefault: () => {} });
    """)
    for _ in range(15):
        eval_js(ws, 'window.droneApp.navigator.update(0.05); window.droneApp.drone.update(0.05);')
    pos_rot_a = json.loads(eval_js(ws, 'JSON.stringify(window.droneApp.drone.group.position)'))
    print("Yaw=+90 deg, Position after A (Left):", pos_rot_a)
    assert pos_rot_a['z'] < -0.5, f"A must move left along -Z when yaw=PI/2, got {pos_rot_a['z']}"
    assert abs(pos_rot_a['x']) < 0.02, f"A must not drift along X when yaw=PI/2, got {pos_rot_a['x']}"
    eval_js(ws, """window.droneApp.navigator.handleKeyUp({ code: 'KeyA', key: 'a', preventDefault: () => {} });""")

    print("[PASS] TEST 5: UAV movement at yaw=+90 deg strictly adheres to drone-relative coordinates.")

    # --- TEST 6: ROTATED UAV (Yaw = -90 deg / -PI/2, Drone facing -X) ---
    print("\n--- TEST 6: Movement Relative to UAV Orientation (Yaw = -90 deg / -PI/2) ---")
    eval_js(ws, """
        (() => {
            const nav = window.droneApp.navigator;
            nav.resetKeys();
            window.droneApp.drone.group.position.set(0, 10, 0);
            window.droneApp.drone.targetPosition.set(0, 10, 0);
            window.droneApp.drone.group.rotation.set(0, -Math.PI / 2, 0);
            window.droneApp.drone.targetRotation.set(0, -Math.PI / 2, 0);
        })()
    """)

    # Test W facing -X -> must move along -X
    eval_js(ws, """window.droneApp.navigator.handleKeyDown({ code: 'KeyW', key: 'w', preventDefault: () => {} });""")
    for _ in range(15):
        eval_js(ws, 'window.droneApp.navigator.update(0.05); window.droneApp.drone.update(0.05);')
    pos_rot_neg_w = json.loads(eval_js(ws, 'JSON.stringify(window.droneApp.drone.group.position)'))
    print("Yaw=-90 deg, Position after W:", pos_rot_neg_w)
    assert pos_rot_neg_w['x'] < -0.5, f"W must move along -X when yaw=-PI/2, got {pos_rot_neg_w['x']}"
    eval_js(ws, """window.droneApp.navigator.handleKeyUp({ code: 'KeyW', key: 'w', preventDefault: () => {} });""")

    # Test D (Right) facing -X -> drone's right is -Z!
    eval_js(ws, """
        window.droneApp.drone.group.position.set(0, 10, 0);
        window.droneApp.drone.targetPosition.set(0, 10, 0);
        window.droneApp.navigator.handleKeyDown({ code: 'KeyD', key: 'd', preventDefault: () => {} });
    """)
    for _ in range(15):
        eval_js(ws, 'window.droneApp.navigator.update(0.05); window.droneApp.drone.update(0.05);')
    pos_rot_neg_d = json.loads(eval_js(ws, 'JSON.stringify(window.droneApp.drone.group.position)'))
    print("Yaw=-90 deg, Position after D (Right):", pos_rot_neg_d)
    assert pos_rot_neg_d['z'] < -0.5, f"D must move along -Z when yaw=-PI/2, got {pos_rot_neg_d['z']}"
    eval_js(ws, """window.droneApp.navigator.handleKeyUp({ code: 'KeyD', key: 'd', preventDefault: () => {} });""")

    print("[PASS] TEST 6: UAV movement at yaw=-90 deg strictly adheres to drone-relative coordinates.")

    # --- TEST 7: Altitude Controls (ArrowUp / ArrowDown) ---
    print("\n--- TEST 7: Altitude Controls (ArrowUp / ArrowDown) ---")
    eval_js(ws, """
        (() => {
            const nav = window.droneApp.navigator;
            nav.resetKeys();
            window.droneApp.drone.group.position.set(0, 10, 0);
            window.droneApp.drone.targetPosition.set(0, 10, 0);
            nav.handleKeyDown({ code: 'ArrowUp', key: 'ArrowUp', preventDefault: () => {} });
        })()
    """)
    key_up_state = json.loads(eval_js(ws, """
        JSON.stringify({
            upKey: window.droneApp.navigator.keys.up,
            boxActive: document.getElementById('key-up').classList.contains('active'),
            itemActive: document.getElementById('item-up').classList.contains('active')
        })
    """))
    print("ArrowUp state:", key_up_state)
    assert key_up_state['upKey'] and key_up_state['boxActive'] and key_up_state['itemActive'], "ArrowUp must highlight"

    for _ in range(15):
        eval_js(ws, 'window.droneApp.navigator.update(0.05); window.droneApp.drone.update(0.05);')
    pos_up = json.loads(eval_js(ws, 'JSON.stringify(window.droneApp.drone.group.position)'))
    print("Position after ArrowUp:", pos_up)
    assert pos_up['y'] > 10.5, f"ArrowUp must increase altitude, got {pos_up['y']}"
    eval_js(ws, """window.droneApp.navigator.handleKeyUp({ code: 'ArrowUp', key: 'ArrowUp', preventDefault: () => {} });""")

    # ArrowDown
    eval_js(ws, """window.droneApp.navigator.handleKeyDown({ code: 'ArrowDown', key: 'ArrowDown', preventDefault: () => {} });""")
    for _ in range(25):
        eval_js(ws, 'window.droneApp.navigator.update(0.05); window.droneApp.drone.update(0.05);')
    pos_down = json.loads(eval_js(ws, 'JSON.stringify(window.droneApp.drone.group.position)'))
    print("Position after ArrowDown:", pos_down)
    assert pos_down['y'] < pos_up['y'] - 0.5, f"ArrowDown must decrease altitude, got {pos_down['y']}"
    eval_js(ws, """window.droneApp.navigator.handleKeyUp({ code: 'ArrowDown', key: 'ArrowDown', preventDefault: () => {} });""")
    print("[PASS] TEST 7: Altitude controls function accurately.")

    # --- TEST 8: Yaw Controls (ArrowLeft / ArrowRight) ---
    print("\n--- TEST 8: Yaw Controls (ArrowLeft / ArrowRight) ---")
    eval_js(ws, """
        (() => {
            const nav = window.droneApp.navigator;
            nav.resetKeys();
            window.droneApp.drone.group.rotation.set(0, 0, 0);
            window.droneApp.drone.targetRotation.set(0, 0, 0);
            nav.handleKeyDown({ code: 'ArrowLeft', key: 'ArrowLeft', preventDefault: () => {} });
        })()
    """)
    for _ in range(15):
        eval_js(ws, 'window.droneApp.navigator.update(0.05); window.droneApp.drone.update(0.05);')
    yaw_left = eval_js(ws, 'window.droneApp.drone.group.rotation.y')
    print("Yaw after ArrowLeft:", yaw_left)
    assert yaw_left > 0.1, f"ArrowLeft must rotate left (positive yaw rate), got {yaw_left}"
    eval_js(ws, """window.droneApp.navigator.handleKeyUp({ code: 'ArrowLeft', key: 'ArrowLeft', preventDefault: () => {} });""")

    eval_js(ws, """window.droneApp.navigator.handleKeyDown({ code: 'ArrowRight', key: 'ArrowRight', preventDefault: () => {} });""")
    for _ in range(30):
        eval_js(ws, 'window.droneApp.navigator.update(0.05); window.droneApp.drone.update(0.05);')
    yaw_right = eval_js(ws, 'window.droneApp.drone.group.rotation.y')
    print("Yaw after ArrowRight:", yaw_right)
    assert yaw_right < yaw_left - 0.2, f"ArrowRight must rotate right, got {yaw_right}"
    eval_js(ws, """window.droneApp.navigator.handleKeyUp({ code: 'ArrowRight', key: 'ArrowRight', preventDefault: () => {} });""")
    print("[PASS] TEST 8: Yaw controls function accurately.")

    # --- TEST 9: Pointer / Click Controls Synchronized ---
    print("\n--- TEST 9: HUD Pointer / Click Controls Synchronized ---")
    pointer_test = json.loads(eval_js(ws, """
        (() => {
            const nav = window.droneApp.navigator;
            nav.resetKeys();
            const itemW = document.getElementById('item-w');
            const itemD = document.getElementById('item-d');
            
            // Dispatch mousedown on itemW
            itemW.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
            const wPressed = nav.keys.forward;
            const wBoxActive = document.getElementById('key-w').classList.contains('active');
            
            // Release itemW
            itemW.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
            const wReleased = !nav.keys.forward;
            
            // Dispatch mousedown on itemD
            itemD.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
            const dPressed = nav.keys.right;
            const dBoxActive = document.getElementById('key-d').classList.contains('active');
            itemD.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

            return JSON.stringify({
                wPressed, wBoxActive, wReleased, dPressed, dBoxActive
            });
        })()
    """))
    print("Pointer click test:", pointer_test)
    assert pointer_test['wPressed'] and pointer_test['wBoxActive'] and pointer_test['wReleased'], "Pointer click on W must activate and release"
    assert pointer_test['dPressed'] and pointer_test['dBoxActive'], "Pointer click on D must activate and release"
    print("[PASS] TEST 9: HUD UI pointer interactions work seamlessly.")

    # --- TEST 10: Diagonal / Combined Movement (e.g. W + D) ---
    print("\n--- TEST 10: Diagonal Movement (W + D at Heading 0) ---")
    eval_js(ws, """
        (() => {
            const nav = window.droneApp.navigator;
            nav.resetKeys();
            window.droneApp.drone.group.position.set(0, 10, 0);
            window.droneApp.drone.targetPosition.set(0, 10, 0);
            window.droneApp.drone.group.rotation.set(0, 0, 0);
            window.droneApp.drone.targetRotation.set(0, 0, 0);
            nav.handleKeyDown({ code: 'KeyW', key: 'w', preventDefault: () => {} });
            nav.handleKeyDown({ code: 'KeyD', key: 'd', preventDefault: () => {} });
        })()
    """)
    for _ in range(15):
        eval_js(ws, 'window.droneApp.navigator.update(0.05); window.droneApp.drone.update(0.05);')
    pos_diag = json.loads(eval_js(ws, 'JSON.stringify(window.droneApp.drone.group.position)'))
    print("Position after W + D (Forward + Right):", pos_diag)
    # Forward is +Z, Right is -X
    assert pos_diag['z'] > 0.5, f"W component must move forward (+Z), got {pos_diag['z']}"
    assert pos_diag['x'] < -0.5, f"D component must move right (-X), got {pos_diag['x']}"
    eval_js(ws, """
        window.droneApp.navigator.handleKeyUp({ code: 'KeyW', key: 'w', preventDefault: () => {} });
        window.droneApp.navigator.handleKeyUp({ code: 'KeyD', key: 'd', preventDefault: () => {} });
    """)
    print("[PASS] TEST 10: Simultaneous multi-key translation functions correctly.")

    print("\n" + "=" * 55)
    print("  ALL 10 MANUAL FLIGHT TESTS PASSED!")
    print("=" * 55)

finally:
    proc.terminate()
