import http.server, threading, time, subprocess, os, json, socket, base64, struct, urllib.request, tempfile, sys, math

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
temp_profile = tempfile.mkdtemp(prefix='edge_exhaustive_test_')

cmd = [
    edge,
    '--headless=new',
    '--remote-debugging-port=9224',
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
    tabs = json.loads(urllib.request.urlopen('http://127.0.0.1:9224/json').read())
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

    eval_js(ws, """
        window.droneApp.navigator.setNavMode('MANUAL');
        window.droneApp.drone.telemetry.isFlying = true;
        window.droneApp.drone.telemetry.isArmed = true;
    """)

    # Function to test translation at any given yaw angle
    def test_angle(deg):
        rad = math.radians(deg)
        print(f"\n--- TESTING ANGLE: {deg} degrees (rad={rad:.4f}) ---")
        
        # Reset drone position to (0, 15, 0) and set yaw
        eval_js(ws, f"""
            window.droneApp.navigator.resetKeys();
            window.droneApp.drone.group.position.set(0, 15, 0);
            window.droneApp.drone.targetPosition.set(0, 15, 0);
            window.droneApp.drone.group.rotation.set(0, {rad}, 0);
            window.droneApp.drone.targetRotation.set(0, {rad}, 0);
        """)

        # Theoretical unit vectors:
        # forward: (sin(rad), 0, cos(rad))
        # backward: (-sin(rad), 0, -cos(rad))
        # right: (-cos(rad), 0, sin(rad))
        # left: (cos(rad), 0, -sin(rad))
        f_exp = (math.sin(rad), math.cos(rad))
        b_exp = (-math.sin(rad), -math.cos(rad))
        r_exp = (-math.cos(rad), math.sin(rad))
        l_exp = (math.cos(rad), -math.sin(rad))

        for key_code, key_name, expected in [('KeyW', 'forward', f_exp),
                                             ('KeyS', 'backward', b_exp),
                                             ('KeyA', 'left', l_exp),
                                             ('KeyD', 'right', r_exp)]:
            # Reset position
            eval_js(ws, f"""
                window.droneApp.navigator.resetKeys();
                window.droneApp.drone.group.position.set(0, 15, 0);
                window.droneApp.drone.targetPosition.set(0, 15, 0);
                window.droneApp.navigator.handleKeyDown({{ code: '{key_code}', key: '{key_name[0]}', preventDefault: () => {{}} }});
            """)

            # Step 10 ticks
            for _ in range(10):
                eval_js(ws, 'window.droneApp.navigator.update(0.05); window.droneApp.drone.update(0.05);')

            pos = json.loads(eval_js(ws, """
                JSON.stringify({
                    x: window.droneApp.drone.group.position.x,
                    z: window.droneApp.drone.group.position.z
                })
            """))

            eval_js(ws, f"""window.droneApp.navigator.handleKeyUp({{ code: '{key_code}', key: '{key_name[0]}', preventDefault: () => {{}} }});""")

            # Compute displacement direction
            dx = pos['x']
            dz = pos['z']
            dist = math.hypot(dx, dz)
            assert dist > 1.0, f"Drone should have moved noticeably for {key_code} at {deg} deg, got dist={dist}"
            
            unit_x = dx / dist
            unit_z = dz / dist

            # Dot product with expected unit vector must be close to 1.0 (aligned)
            dot = unit_x * expected[0] + unit_z * expected[1]
            assert dot > 0.999, f"Mismatch for {key_code} at {deg} deg! Expected ({expected[0]:.3f}, {expected[1]:.3f}), got ({unit_x:.3f}, {unit_z:.3f}), dot={dot:.4f}"
            print(f"  [PASS] {key_code} ({key_name}): moved along ({unit_x:.3f}, {unit_z:.3f}) matching theoretical alignment (dot={dot:.5f})")

    # Test cardinal, diagonal, and arbitrary angles
    test_angles = [0, 45, 90, 135, 180, 225, 270, 315, 37.5, -62.3, 195.4]
    for angle in test_angles:
        test_angle(angle)

    print("\n=======================================================")
    print("  EXHAUSTIVE ANGLE & VECTOR VERIFICATION COMPLETE: ALL PASSED!")
    print("=======================================================")

finally:
    try:
        proc.terminate()
        proc.kill()
    except Exception:
        pass
