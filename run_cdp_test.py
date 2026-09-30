import http.server, threading, time, subprocess, os, json, socket, base64, struct, urllib.request

server = http.server.ThreadingHTTPServer(('127.0.0.1', 8089), http.server.SimpleHTTPRequestHandler)
t = threading.Thread(target=server.serve_forever, daemon=True)
t.start()

edge = r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
import tempfile
temp_profile = tempfile.mkdtemp(prefix='edge_test_')

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
    'http://127.0.0.1:8089/index.html'
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

def send_cdp(s, msg_id, method, params=None):
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

try:
    tabs = json.loads(urllib.request.urlopen('http://127.0.0.1:9222/json').read())
    sim_tab = None
    for tab in tabs:
        if '8089' in tab.get('url', ''):
            sim_tab = tab
            break
    print('Found sim tab:', sim_tab.get('url') if sim_tab else 'None')
    if sim_tab:
        ws = create_ws(sim_tab['webSocketDebuggerUrl'])
        
        # 1. State check
        send_cdp(ws, 1, 'Runtime.evaluate', {
            'expression': '''JSON.stringify({
                ready: document.readyState,
                hasApp: !!window.droneApp,
                scenario: window.droneApp ? window.droneApp.environment.currentScenario : null,
                altitude: window.droneApp ? window.droneApp.drone.telemetry.altitudeAGL.toFixed(1) : null,
                groundSpeed: window.droneApp ? window.droneApp.drone.telemetry.groundSpeed.toFixed(1) : null,
                dronePos: window.droneApp ? window.droneApp.drone.group.position : null,
                camMode: window.droneApp ? window.droneApp.cameraMode : null,
                survivors: window.droneApp ? window.droneApp.environment.survivors.length : 0,
                detectedSurvivors: window.droneApp ? window.droneApp.environment.survivors.filter(s => s.detected).length : 0,
                structuralHazards: window.droneApp ? window.droneApp.environment.structuralHazards.length : 0,
                activeDetections: window.droneApp ? window.droneApp.sensors.activeDetections.length : 0,
                colliders: window.droneApp ? window.droneApp.environment.obstacleColliders.length : 0
            })'''
        })
        res1 = recv_cdp(ws, 1)
        print('1. Simulation State:', res1.get('result', {}).get('result', {}).get('value'))

        # 2. PIP Gimbal capture
        send_cdp(ws, 2, 'Runtime.evaluate', {
            'expression': '''(() => {
                const app = window.droneApp;
                const canvas = document.getElementById("pip-canvas");
                if (app && app.pipRenderer && app.pipCamera) {
                    const isPipGimbal = (app.cameraMode === 'FOLLOW' || app.cameraMode === 'ISO');
                    if (isPipGimbal && app.drone && app.drone.group) app.drone.group.visible = false;
                    app.pipRenderer.render(app.scene, app.pipCamera);
                    if (isPipGimbal && app.drone && app.drone.group) app.drone.group.visible = true;
                    return canvas.toDataURL("image/png");
                }
                return "no pip";
            })()'''
        })
        res2 = recv_cdp(ws, 2)
        pip_data = res2.get('result', {}).get('result', {}).get('value')
        if pip_data and pip_data.startswith('data:image/png;base64,'):
            b64_pip = pip_data.split(',', 1)[1]
            with open('pip_view.png', 'wb') as f:
                f.write(base64.b64decode(b64_pip))
            print('2. Inset PIP captured to pip_view.png, size:', os.path.getsize('pip_view.png'))

        # 3. Take main viewport screenshot
        send_cdp(ws, 3, 'Page.captureScreenshot', {'format': 'png'})
        res3 = recv_cdp(ws, 3)
        b64data = res3.get('result', {}).get('data')
        if b64data:
            with open('current_view.png', 'wb') as img_f:
                img_f.write(base64.b64decode(b64data))
            print('3. Main viewport screenshot saved to current_view.png, size:', os.path.getsize('current_view.png'))

        # 4. Test Scenario Switching
        send_cdp(ws, 4, 'Runtime.evaluate', {
            'expression': '''(() => {
                const app = window.droneApp;
                const results = {};
                // Test Flood
                app.setScenario('flash_flood');
                results.flood = {
                    scenario: app.environment.currentScenario,
                    hasWater: !!app.environment.waterMesh,
                    survivors: app.environment.survivors.length,
                    colliders: app.environment.obstacleColliders.length
                };
                // Test Gas/Fire
                app.setScenario('chemical_fire');
                results.chemical_fire = {
                    scenario: app.environment.currentScenario,
                    hasGasPlume: !!app.environment.gasPlumeEmitter,
                    survivors: app.environment.survivors.length,
                    colliders: app.environment.obstacleColliders.length
                };
                // Switch back to earthquake
                app.setScenario('earthquake');
                results.earthquake = {
                    scenario: app.environment.currentScenario,
                    survivors: app.environment.survivors.length,
                    hazards: app.environment.structuralHazards.length,
                    colliders: app.environment.obstacleColliders.length
                };
                return JSON.stringify(results);
            })()'''
        })
        res4 = recv_cdp(ws, 4)
        print('4. Scenario Switching Test:', res4.get('result', {}).get('result', {}).get('value'))

        # 5. Test Sensor Modes
        send_cdp(ws, 5, 'Runtime.evaluate', {
            'expression': '''(() => {
                const app = window.droneApp;
                const modes = ['THERMAL', 'NVG', 'LIDAR', 'GAS', 'RGB'];
                const sensorResults = {};
                modes.forEach(m => {
                    app.sensors.setSensorMode(m);
                    sensorResults[m] = {
                        activeMode: app.sensors.sensorMode,
                        thermalFilter: document.getElementById('three-canvas-container').classList.contains('thermal-filter'),
                        nvgFilter: document.getElementById('nvg-filter').style.display === 'block',
                        lidarPoints: !!app.sensors.lidarPointsGroup
                    };
                });
                return JSON.stringify(sensorResults);
            })()'''
        })
        res5 = recv_cdp(ws, 5)
        print('5. Sensor Modes Test:', res5.get('result', {}).get('result', {}).get('value'))

        # 6. Test Camera Modes
        send_cdp(ws, 6, 'Runtime.evaluate', {
            'expression': '''(() => {
                const app = window.droneApp;
                const cams = ['FOLLOW', 'FPV', 'TOPDOWN', 'ORBIT', 'ISO'];
                const camResults = {};
                cams.forEach(c => {
                    app.cameraMode = c;
                    app.updateCamera();
                    camResults[c] = {
                        mode: app.cameraMode,
                        camY: app.camera.position.y.toFixed(1)
                    };
                });
                return JSON.stringify(camResults);
            })()'''
        })
        res6 = recv_cdp(ws, 6)
        print('6. Camera Modes Test:', res6.get('result', {}).get('result', {}).get('value'))

        # 7. Check Console Errors across all tests
        send_cdp(ws, 7, 'Runtime.evaluate', {
            'expression': 'JSON.stringify(window.errors || [])'
        })
        res7 = recv_cdp(ws, 7)
        print('7. Console Errors:', res7.get('result', {}).get('result', {}).get('value'))

finally:
    proc.terminate()
    proc.wait()
    server.shutdown()
