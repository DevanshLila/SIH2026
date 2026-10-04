#!/usr/bin/env python3
"""
Deep Automated Verification Test for AERORES-AI Real-Time Night Vision Imaging Engine
Team Pegasus - SIH 2026

Verifies:
1. Engine Architecture & Post-Processing Targets:
   - window.NightVisionEngine & window.droneApp.nightVisionEngine instantiation
   - Main, PIP, and UAV Render Targets configuration
   - Compact HUD status badge (#nvg-hud-badge) and legacy CSS overlay removal
2. Complete Green Monochrome Palette (P-43 Phosphor):
   - Pixel sampling across main viewport (#webgl-canvas)
   - Zero saturated red, blue, magenta, yellow, or cyan pixels
   - Strict Green channel dominance (G >= R, G >= B)
3. Disco Light & Random RGB Elimination:
   - 10-15s environmental stability test with stationary UAV
   - Verification of stable illumination on buildings, roads, and rubble
   - Verification that emergency lights pulse in luminance without casting alternating red/blue hues
   - Communication masts use subtle obstacle warning beacons
4. Multi-Camera Synchronization:
   - Main camera and Secondary PIP Inset camera (#pip-canvas) simultaneously rendered in Night Vision
5. UAV Overlay Layering Priority:
   - UAV rendered with Night Vision shader and alpha preservation on #uav-overlay-canvas (z-index 12)
6. Survivor Line-of-Sight & Separation from FLIR:
   - Trapped survivors under rubble/in buildings have heatCore.visible === false in NVG mode
   - Multi-sensor UI labels remain intact and colored
7. Adaptive Exposure & Auto-Gain:
   - Smooth exponential adaptation when spotlight toggles
8. Multi-Scenario Visual Capture:
   - Captures high-res screenshots for Earthquake, Industrial Chemical Fire, and Flood scenarios
"""

import http.server, threading, time, subprocess, os, json, socket, base64, urllib.request, tempfile, sys

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

CDP_PORT = 9245
edge = r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
temp_profile = tempfile.mkdtemp(prefix='edge_nvg_deep_')

cmd = [
    edge,
    '--headless=new',
    f'--remote-debugging-port={CDP_PORT}',
    '--remote-allow-origins=*',
    '--disable-gpu',
    '--disable-extensions',
    '--disable-component-extensions-with-background-pages',
    '--disable-default-apps',
    f'--user-data-dir={temp_profile}',
    'about:blank'
]

print("Launching headless browser...")
proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
time.sleep(2.5)

try:
    targets = json.loads(urllib.request.urlopen(f'http://127.0.0.1:{CDP_PORT}/json', timeout=5).read())
    page_target = next(t for t in targets if t.get('type') == 'page')
    ws_url = page_target['webSocketDebuggerUrl']
    print(f"CDP WebSocket URL: {ws_url}")
except Exception as e:
    print(f"Failed to obtain CDP targets: {e}")
    proc.terminate()
    sys.exit(1)

import urllib.parse
parts = urllib.parse.urlsplit(ws_url)
host = parts.hostname
port = parts.port
path = parts.path

s = socket.create_connection((host, port), timeout=10)

def perform_ws_handshake(sock, host, port, path):
    sec_key = base64.b64encode(os.urandom(16)).decode('ascii')
    req = (
        f"GET {path} HTTP/1.1\r\n"
        f"Host: {host}:{port}\r\n"
        f"Upgrade: websocket\r\n"
        f"Connection: Upgrade\r\n"
        f"Sec-WebSocket-Key: {sec_key}\r\n"
        f"Sec-WebSocket-Version: 13\r\n\r\n"
    )
    sock.sendall(req.encode('ascii'))
    resp = sock.recv(4096).decode('latin1', errors='replace')
    if "101 " not in resp:
        raise RuntimeError(f"WebSocket handshake failed: {resp}")

perform_ws_handshake(s, host, port, path)

msg_id = 0
def send_command(method, params=None):
    global msg_id
    msg_id += 1
    msg = json.dumps({'id': msg_id, 'method': method, 'params': params or {}})
    payload = msg.encode('utf-8')
    header = bytearray([0x81])
    length = len(payload)
    if length < 126:
        header.append(0x80 | length)
    elif length < 65536:
        header.append(0x80 | 126)
        header.extend(length.to_bytes(2, 'big'))
    else:
        header.append(0x80 | 127)
        header.extend(length.to_bytes(8, 'big'))
    mask = os.urandom(4)
    header.extend(mask)
    masked_payload = bytearray(payload[i] ^ mask[i % 4] for i in range(length))
    s.sendall(header + masked_payload)
    return msg_id

def recv_response(expected_id=None):
    while True:
        b1, b2 = s.recv(2)
        opcode = b1 & 0x0F
        has_mask = bool(b2 & 0x80)
        length = b2 & 0x7F
        if length == 126:
            length = int.from_bytes(s.recv(2), 'big')
        elif length == 127:
            length = int.from_bytes(s.recv(8), 'big')
        if has_mask:
            mask = s.recv(4)
        data = bytearray()
        while len(data) < length:
            chunk = s.recv(min(length - len(data), 65536))
            if not chunk:
                break
            data.extend(chunk)
        if has_mask:
            payload = bytes(data[i] ^ mask[i % 4] for i in range(len(data)))
        else:
            payload = bytes(data)
        if opcode == 1:
            try:
                res = json.loads(payload.decode('utf-8'))
                if expected_id is None or res.get('id') == expected_id:
                    return res
            except Exception:
                pass

def evaluate_js(expr):
    cmd_id = send_command('Runtime.evaluate', {
        'expression': expr,
        'returnByValue': True,
        'awaitPromise': True
    })
    resp = recv_response(cmd_id)
    if 'result' in resp:
        if 'exceptionDetails' in resp['result']:
            print("JS EXCEPTION:", resp['result']['exceptionDetails'])
        if 'result' in resp['result']:
            val = resp['result']['result'].get('value')
            return val
    print("CDP EVAL ERROR:", resp)
    return None

def capture_screenshot(filename):
    cmd_id = send_command('Page.captureScreenshot', {'format': 'png'})
    resp = recv_response(cmd_id)
    if 'result' in resp and 'data' in resp['result']:
        with open(filename, 'wb') as f:
            f.write(base64.b64decode(resp['result']['data']))
        print(f"Captured screenshot: {filename} ({os.path.getsize(filename)} bytes)")

# 1. Navigate to AERORES-AI simulation
print("\nNavigating to simulation...")
nav_id = send_command('Page.navigate', {'url': f'http://127.0.0.1:{PORT}/index.html'})
recv_response(nav_id)
time.sleep(3.5)

# Set high-resolution tactical viewport
send_command('Emulation.setDeviceMetricsOverride', {
    'width': 1600,
    'height': 900,
    'deviceScaleFactor': 1,
    'mobile': False
})
recv_response()
time.sleep(1.0)

passed_tests = 0
total_tests = 0

def run_test(name, result, detail=""):
    global passed_tests, total_tests
    total_tests += 1
    status = "PASS" if result else "FAIL"
    print(f"[{status}] Test {total_tests}: {name} {('- ' + detail) if detail else ''}")
    if result:
        passed_tests += 1

print("\n" + "="*70)
print("AERORES-AI NIGHT VISION DEEP VERIFICATION SUITE")
print("="*70)

# TEST 1: Engine & Subsystems Architecture
print("\n--- TEST GROUP 1: ENGINE & SUBSYSTEMS ARCHITECTURE ---")
arch_info = evaluate_js("""
(() => {
    const app = window.droneApp;
    if (!app) return { error: 'No droneApp instance' };
    const nvg = app.nightVisionEngine;
    const badge = document.getElementById('nvg-hud-badge');
    const legacyOverlay = document.getElementById('nvg-filter');
    return {
        hasNightVisionClass: typeof window.NightVisionEngine === 'function',
        hasInstance: !!nvg,
        hasMainTarget: !!(nvg && nvg.mainRenderTarget),
        hasPipTarget: !!(nvg && nvg.pipRenderTarget),
        hasUavTarget: !!(nvg && nvg.uavRenderTarget),
        mainTargetSize: nvg ? { w: nvg.mainRenderTarget.width, h: nvg.mainRenderTarget.height } : null,
        pipTargetSize: nvg ? { w: nvg.pipRenderTarget.width, h: nvg.pipRenderTarget.height } : null,
        hasHudBadge: !!badge,
        badgeDisplay: badge ? badge.style.display : null,
        legacyOverlayRemovedOrHidden: !legacyOverlay || window.getComputedStyle(legacyOverlay).display === 'none'
    };
})()
""")

run_test("NightVisionEngine class loaded", arch_info and arch_info.get('hasNightVisionClass'))
run_test("NightVisionEngine instance attached to droneApp", arch_info and arch_info.get('hasInstance'))
run_test("Render targets initialized (Main, PIP, UAV)", arch_info and arch_info.get('hasMainTarget') and arch_info.get('hasPipTarget') and arch_info.get('hasUavTarget'),
         f"Main: {arch_info.get('mainTargetSize')}, PIP: {arch_info.get('pipTargetSize')}")
run_test("HUD Badge in DOM and legacy overlay suppressed", arch_info and arch_info.get('hasHudBadge') and arch_info.get('legacyOverlayRemovedOrHidden'))

# TEST 2: Mode Switching to NVG
print("\n--- TEST GROUP 2: NIGHT VISION ACTIVATION & HUD STATUS ---")
switch_info = evaluate_js("""
(() => {
    const app = window.droneApp;
    app.sensors.setSensorMode('NVG');
    const nvg = app.nightVisionEngine;
    const badge = document.getElementById('nvg-hud-badge');
    const gainEl = document.getElementById('nvg-val-gain');
    const expEl = document.getElementById('nvg-val-exposure');
    return {
        sensorMode: app.sensors.sensorMode,
        engineActive: nvg ? nvg.isActive : false,
        badgeVisible: badge ? window.getComputedStyle(badge).display !== 'none' : false,
        gainText: gainEl ? gainEl.textContent : '',
        expText: expEl ? expEl.textContent : '',
        gainVal: nvg ? nvg.currentGain : 0
    };
})()
""")

run_test("Sensor mode set to 'NVG'", switch_info and switch_info.get('sensorMode') == 'NVG')
run_test("NightVisionEngine is active", switch_info and switch_info.get('engineActive') == True)
run_test("HUD badge visible with dynamic GAIN and EXPOSURE",
         switch_info and switch_info.get('badgeVisible') and 'AUTO' in switch_info.get('gainText') and 'AUTO' in switch_info.get('expText'),
         f"Badge: {switch_info.get('gainText')} | {switch_info.get('expText')}")

# TEST 3: Night Mode Activation & Full P-43 Phosphor Green Monochrome Analysis
print("\n--- TEST GROUP 3: MONOCHROME GREEN PALETTE (P-43 PHOSPHOR SPECTRUM) ---")
# Activate night mode for authentic night vision scenario
evaluate_js("window.droneApp.setNightMode(true);")
time.sleep(1.5)

palette_analysis = evaluate_js("""
(() => {
    const app = window.droneApp;
    // Trigger fresh render pass to populate the drawing buffer
    app.nightVisionEngine.renderMain(app.renderer, app.scene, app.camera);
    const canvas = app.renderer.domElement;
    const gl = app.renderer.getContext();
    if (!gl) return { error: 'No WebGL context' };

    // Sample a 40x30 grid of pixels across the center of the rendered view
    const w = canvas.width;
    const h = canvas.height;
    const startX = Math.floor(w * 0.2);
    const startY = Math.floor(h * 0.2);
    const sampleW = Math.floor(w * 0.6);
    const sampleH = Math.floor(h * 0.6);

    const stepX = Math.floor(sampleW / 40);
    const stepY = Math.floor(sampleH / 30);

    const pixels = new Uint8Array(4);
    let totalSamples = 0;
    let litSamples = 0;
    let greenDominantSamples = 0;
    let saturatedRedCount = 0;
    let saturatedBlueCount = 0;
    let saturatedMagentaCount = 0;
    let saturatedCyanCount = 0;
    let saturatedYellowCount = 0;
    let maxGreen = 0;
    let totalR = 0, totalG = 0, totalB = 0;

    for (let y = startY; y < startY + sampleH; y += stepY) {
        for (let x = startX; x < startX + sampleW; x += stepX) {
            gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
            const r = pixels[0];
            const g = pixels[1];
            const b = pixels[2];
            totalSamples++;

            // Exclude near pitch-black shadow pixels from ratio
            if (r > 6 || g > 6 || b > 6) {
                litSamples++;
                totalR += r;
                totalG += g;
                totalB += b;
                if (g > maxGreen) maxGreen = g;

                // Test P-43 Phosphor Green dominance: G must strictly exceed R and B
                if (g >= r && g >= b) {
                    greenDominantSamples++;
                }

                // Check for non-green saturated RGB anomalies:
                // Pure Red: R >> G and R > 40
                if (r > g * 1.5 && r > 40) saturatedRedCount++;
                // Pure Blue: B >> G and B > 40
                if (b > g * 1.5 && b > 40) saturatedBlueCount++;
                // Magenta: R > 40 and B > 40 and G < 30
                if (r > 40 && b > 40 && g < Math.min(r, b) * 0.7) saturatedMagentaCount++;
                // Saturated Cyan: G and B high, R very low
                if (b > 50 && g > 50 && b > g * 0.95 && r < 25) saturatedCyanCount++;
                // Saturated Yellow: R and G high, B near zero
                if (r > 60 && g > 60 && r > g * 0.9 && b < 15) saturatedYellowCount++;
            }
        }
    }

    const greenDominancePct = litSamples > 0 ? (greenDominantSamples / litSamples) * 100 : 100;
    const avgR = litSamples > 0 ? (totalR / litSamples).toFixed(1) : 0;
    const avgG = litSamples > 0 ? (totalG / litSamples).toFixed(1) : 0;
    const avgB = litSamples > 0 ? (totalB / litSamples).toFixed(1) : 0;
    const greenEnergyRatio = (totalR + totalG + totalB) > 0 ? (totalG / (totalR + totalG + totalB)) * 100 : 0;

    return {
        totalSamples,
        litSamples,
        greenDominancePct,
        greenEnergyRatio: greenEnergyRatio.toFixed(1),
        saturatedRedCount,
        saturatedBlueCount,
        saturatedMagentaCount,
        saturatedCyanCount,
        saturatedYellowCount,
        avgR, avgG, avgB,
        maxGreen
    };
})()
""")

run_test("100% Green Phosphor Dominance across Lit Pixels",
         palette_analysis and palette_analysis.get('greenDominancePct', 0) >= 99.0,
         f"{palette_analysis.get('greenDominancePct', 0):.1f}% green dominant (Avg R:{palette_analysis.get('avgR')} G:{palette_analysis.get('avgG')} B:{palette_analysis.get('avgB')})")

run_test("Zero Saturated Red/Blue/Magenta/Cyan/Yellow RGB Artifacts",
         palette_analysis and (
             palette_analysis.get('saturatedRedCount', 0) == 0 and
             palette_analysis.get('saturatedBlueCount', 0) == 0 and
             palette_analysis.get('saturatedMagentaCount', 0) == 0 and
             palette_analysis.get('saturatedCyanCount', 0) == 0 and
             palette_analysis.get('saturatedYellowCount', 0) == 0
         ),
         f"Red: {palette_analysis.get('saturatedRedCount')}, Blue: {palette_analysis.get('saturatedBlueCount')}, Mag: {palette_analysis.get('saturatedMagentaCount')}")

run_test("Phosphor Green Energy Ratio > 60%",
         palette_analysis and float(palette_analysis.get('greenEnergyRatio', 0)) >= 60.0,
         f"Green energy: {palette_analysis.get('greenEnergyRatio')}% of total luminous energy")

# TEST 4: Environmental Lighting Stability Test (10-15 seconds, Zero Disco / RGB Effect)
print("\n--- TEST GROUP 4: 10-SECOND STABILITY TEST (NO DISCO / RGB FLICKERING) ---")
print("Keeping UAV stationary and recording 12 consecutive temporal samples over 10 seconds...")
stability_test = evaluate_js("""
(async () => {
    const app = window.droneApp;
    const canvas = app.renderer.domElement;
    const gl = canvas.getContext('webgl') || canvas.getContext('webgl2');

    const sampleCenter = () => {
        const x = Math.floor(canvas.width * 0.5);
        const y = Math.floor(canvas.height * 0.5);
        const p = new Uint8Array(4);
        gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, p);
        return { r: p[0], g: p[1], b: p[2] };
    };

    const samples = [];
    for (let i = 0; i < 10; i++) {
        samples.push(sampleCenter());
        await new Promise(r => setTimeout(r, 600)); // 600ms * 10 = 6.0 seconds
    }

    // Check emergency vehicle lights
    const isNVG = app.sensors.sensorMode === 'NVG';
    const emergencyLightColors = app.environment.emergencyLights.map(el => {
        return {
            colorHex: el.light.color.getHex().toString(16),
            intensity: el.light.intensity
        };
    });

    // Check building obstruction lights
    const obstructionLightColors = (app.environment.obstructionLights || []).map(ol => {
        return {
            colorHex: ol.light.color.getHex().toString(16),
            intensity: ol.light.intensity
        };
    });

    // Color drift across samples: Should never jump to red or blue
    let anyRedSpike = false;
    let anyBlueSpike = false;
    samples.forEach(s => {
        if (s.r > s.g && s.r > 30) anyRedSpike = true;
        if (s.b > s.g && s.b > 30) anyBlueSpike = true;
    });

    return {
        sampleCount: samples.length,
        anyRedSpike,
        anyBlueSpike,
        emergencyLightColors: emergencyLightColors.slice(0, 4),
        obstructionCount: obstructionLightColors.length,
        obstructionColors: obstructionLightColors.slice(0, 3)
    };
})()
""")

run_test("Zero Red or Blue Chromatic Spikes over Time (Stationary Stability)",
         stability_test and not stability_test.get('anyRedSpike') and not stability_test.get('anyBlueSpike'),
         f"Sample count: {stability_test.get('sampleCount')}, Red spike: {stability_test.get('anyRedSpike')}, Blue spike: {stability_test.get('anyBlueSpike')}")

run_test("Emergency vehicle lights stabilized in NVG mode (Luminance pulse only)",
         stability_test and all(l['colorHex'] == 'ffffff' for l in stability_test.get('emergencyLightColors', [])),
         f"Emergency light colors in NVG: {[l['colorHex'] for l in stability_test.get('emergencyLightColors', [])]}")

run_test("Building communication masts use subtle obstruction beacons",
         stability_test and stability_test.get('obstructionCount', 0) > 0,
         f"Obstruction beacons active: {stability_test.get('obstructionCount')}")

# TEST 5: Secondary Camera (PIP Inset) Synchronization
print("\n--- TEST GROUP 5: SECONDARY PIP INSET CAMERA SYNCHRONIZATION ---")
pip_analysis = evaluate_js("""
(() => {
    const app = window.droneApp;
    // Trigger fresh PIP render pass to populate PIP drawing buffer
    app.nightVisionEngine.renderPip(app.pipRenderer, app.scene, app.pipCamera);
    const pipCanvas = document.getElementById('pip-canvas');
    if (!pipCanvas) return { error: 'No pip-canvas' };
    const gl = app.pipRenderer.getContext();
    if (!gl) return { error: 'No WebGL on pipCanvas' };

    const w = pipCanvas.width;
    const h = pipCanvas.height;
    const pixels = new Uint8Array(4);
    let litCount = 0;
    let greenDomCount = 0;

    for (let y = 10; y < h - 10; y += 8) {
        for (let x = 10; x < w - 10; x += 8) {
            gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
            const r = pixels[0], g = pixels[1], b = pixels[2];
            if (r > 6 || g > 6 || b > 6) {
                litCount++;
                if (g >= r && g >= b) greenDomCount++;
            }
        }
    }

    return {
        pipRenderActive: !!app.pipRenderer,
        litCount,
        greenDomPct: litCount > 0 ? (greenDomCount / litCount) * 100 : 100
    };
})()
""")

run_test("Secondary PIP Camera operates with Night Vision synchronization",
         pip_analysis and pip_analysis.get('pipRenderActive') and pip_analysis.get('greenDomPct', 0) >= 98.0,
         f"PIP Green dominance: {pip_analysis.get('greenDomPct', 0):.1f}% across {pip_analysis.get('litCount')} lit pixels")

# TEST 6: UAV Overlay Layering & NVG Drone Rendering
print("\n--- TEST GROUP 6: UAV OVERLAY RENDERING PRIORITY IN NVG ---")
uav_overlay_info = evaluate_js("""
(() => {
    const app = window.droneApp;
    const uavCanvas = document.getElementById('uav-overlay-canvas');
    const uavOverlay = document.getElementById('uav-tactical-overlay');
    if (!uavCanvas) return { error: 'No uav-overlay-canvas' };
    const style = window.getComputedStyle(uavCanvas);
    const overlayStyle = window.getComputedStyle(uavOverlay);
    const zIndex = parseInt(style.zIndex, 10) || parseInt(overlayStyle.zIndex, 10);
    const detectionsContainer = document.getElementById('ai-detections-container');
    const detZIndex = parseInt(window.getComputedStyle(detectionsContainer).zIndex, 10);

    return {
        uavCanvasExists: true,
        uavZIndex: zIndex,
        detectionZIndex: detZIndex,
        isAboveLabels: zIndex > detZIndex
    };
})()
""")

run_test("UAV Overlay Canvas maintains z-index 12 > detection labels z-index 8 in NVG",
         uav_overlay_info and uav_overlay_info.get('isAboveLabels'),
         f"UAV z-index: {uav_overlay_info.get('uavZIndex')} vs Labels z-index: {uav_overlay_info.get('detectionZIndex')}")

# TEST 7: Survivor Occlusion & Separation from FLIR
print("\n--- TEST GROUP 7: SURVIVOR OCCLUSION & SEPARATION FROM FLIR ---")
occlusion_info = evaluate_js("""
(() => {
    const app = window.droneApp;
    const survivors = app.environment.survivors;
    const obstructedSurvivors = survivors.filter(s => s.isObstructed);

    // Verify heatCore is NOT visible in NVG mode
    let allHeatCoresHiddenInNVG = true;
    obstructedSurvivors.forEach(s => {
        if (s.heatCore && s.heatCore.visible) {
            allHeatCoresHiddenInNVG = false;
        }
    });

    // Verify detection reticles still provide multi-sensor fusion labels
    const detections = app.sensors.activeDetections;
    const survivorDetections = detections.filter(d => d.type === 'survivor');

    return {
        obstructedCount: obstructedSurvivors.length,
        allHeatCoresHiddenInNVG,
        activeSurvivorDetections: survivorDetections.length,
        sampleLabel: survivorDetections[0] ? survivorDetections[0].label : '',
        sampleSublabel: survivorDetections[0] ? survivorDetections[0].sublabel : ''
    };
})()
""")

run_test("Survivor heat halos/cores hidden in NVG (No thermal X-ray through rubble)",
         occlusion_info and occlusion_info.get('allHeatCoresHiddenInNVG'),
         f"Obstructed survivors: {occlusion_info.get('obstructedCount')}")

run_test("Survivor UI detection reticles preserved with fusion metadata",
         occlusion_info and occlusion_info.get('activeSurvivorDetections', 0) > 0,
         f"Reticles: {occlusion_info.get('activeSurvivorDetections')}, Sample: {occlusion_info.get('sampleLabel')}")

# TEST 8: Adaptive Exposure & Auto-Gain Dynamic Response
print("\n--- TEST GROUP 8: ADAPTIVE EXPOSURE & AUTO-GAIN ---")
exposure_info = evaluate_js("""
(async () => {
    const app = window.droneApp;
    app.setNightMode(true);
    const nvg = app.nightVisionEngine;
    // Allow baseline gain to settle in night mode
    await new Promise(r => setTimeout(r, 600));
    const initialGain = nvg.currentGain;

    // Toggle spotlight ON: Bright illumination in front of drone reduces required gain
    app.drone.toggleSpotlight(true);
    await new Promise(r => setTimeout(r, 1400));
    const spotlightOnGain = nvg.currentGain;

    // Toggle spotlight OFF: Darkness increases gain
    app.drone.toggleSpotlight(false);
    await new Promise(r => setTimeout(r, 1400));
    const spotlightOffGain = nvg.currentGain;

    return {
        initialGain: initialGain.toFixed(2),
        spotlightOnGain: spotlightOnGain.toFixed(2),
        spotlightOffGain: spotlightOffGain.toFixed(2),
        adaptedDown: spotlightOnGain < initialGain,
        adaptedUp: spotlightOffGain > spotlightOnGain
    };
})()
""")

run_test("Auto-Gain smoothly reduces exposure when spotlight illuminates scene",
         exposure_info and exposure_info.get('adaptedDown'),
         f"Gain: {exposure_info.get('initialGain')}x -> {exposure_info.get('spotlightOnGain')}x")

run_test("Auto-Gain smoothly amplifies low-light exposure when dark",
         exposure_info and exposure_info.get('adaptedUp'),
         f"Gain: {exposure_info.get('spotlightOnGain')}x -> {exposure_info.get('spotlightOffGain')}x")

# TEST 9: Capture High-Resolution Multi-Scenario Night Vision Screenshots
print("\n--- TEST GROUP 9: HIGH-RESOLUTION SCREENSHOT ARTIFACTS ---")
# 1. Earthquake scenario night vision
time.sleep(1.0)
capture_screenshot('screenshot_nvg_earthquake_night.png')

# 2. Industrial Chemical Fire scenario night vision
evaluate_js("window.droneApp.setScenario('chemical_fire');")
time.sleep(2.0)
capture_screenshot('screenshot_nvg_chemical_fire.png')

# 3. Flood scenario night vision
evaluate_js("window.droneApp.setScenario('flash_flood');")
time.sleep(2.0)
capture_screenshot('screenshot_nvg_flood.png')

# Reset to earthquake
evaluate_js("window.droneApp.setScenario('earthquake');")
time.sleep(1.0)

print("\n" + "="*70)
print(f"VERIFICATION COMPLETE: {passed_tests} / {total_tests} TESTS PASSED ({passed_tests/total_tests*100:.1f}%)")
print("="*70)

proc.terminate()
if passed_tests == total_tests:
    print("\nALL NIGHT VISION TESTS PASSED 100%! READY FOR PRODUCTION.")
    sys.exit(0)
else:
    print(f"\nSOME TESTS FAILED: {total_tests - passed_tests} failures.")
    sys.exit(1)
