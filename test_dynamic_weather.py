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
temp_profile = tempfile.mkdtemp(prefix='edge_weather_test_')

cmd = [
    edge,
    '--headless=new',
    '--remote-debugging-port=9225',
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
        img_data = base64.b64decode(res['result']['data'])
        with open(filename, 'wb') as f:
            f.write(img_data)
        print(f"  [Screenshot] Saved: {filename} ({len(img_data)} bytes)")

try:
    tabs = json.loads(urllib.request.urlopen('http://127.0.0.1:9225/json').read())
    page_tab = next((t for t in tabs if str(PORT) in t.get('url', '')), None)
    if not page_tab:
        page_tab = next(t for t in tabs if t.get('type') == 'page')
    ws_url = page_tab['webSocketDebuggerUrl']
    s = create_ws(ws_url)
    print("CDP Connected successfully to:", page_tab.get('url', 'unknown'))

    # Enable Page and Runtime
    send_cdp(s, 'Page.enable')
    send_cdp(s, 'Runtime.enable')
    time.sleep(1.0)

    # 1. Check Console Errors
    print("\n--- 1. Checking Page Load & Global App Object ---")
    app_exists = eval_js(s, "typeof window.droneApp !== 'undefined' && window.droneApp !== null")
    print(f"droneApp initialized: {app_exists}")
    assert app_exists, "window.droneApp must be defined!"

    # Check for any unhandled JS errors
    has_env = eval_js(s, "window.droneApp.environment !== null")
    print(f"DisasterEnvironment initialized: {has_env}")
    assert has_env, "DisasterEnvironment must be initialized!"

    # 2. Check DOM Elements
    print("\n--- 2. Checking Weather UI DOM Elements ---")
    weather_select_exists = eval_js(s, "document.getElementById('select-weather') !== null")
    print(f"Weather select dropdown exists: {weather_select_exists}")
    assert weather_select_exists, "#select-weather dropdown must exist in DOM!"

    weather_options = eval_js(s, "Array.from(document.querySelectorAll('#select-weather option')).map(o => o.value)")
    print(f"Weather select options: {weather_options}")
    expected_options = ['clear', 'cloudy', 'rain', 'windy', 'dust', 'snow']
    for opt in expected_options:
        assert opt in weather_options, f"Option '{opt}' missing from #select-weather!"

    hud_badge_exists = eval_js(s, "document.getElementById('hud-weather-badge') !== null")
    hud_wind_exists = eval_js(s, "document.getElementById('hud-wind-indicator') !== null")
    hud_vis_exists = eval_js(s, "document.getElementById('hud-visibility-indicator') !== null")
    print(f"HUD weather badge exists: {hud_badge_exists}")
    print(f"HUD wind indicator exists: {hud_wind_exists}")
    print(f"HUD visibility indicator exists: {hud_vis_exists}")
    assert hud_badge_exists and hud_wind_exists and hud_vis_exists, "All HUD indicators must exist!"

    # 3. Test Each Weather Mode Live
    print("\n--- 3. Testing All 6 Weather Conditions ---")

    # A. CLEAR
    print("\n[Weather: CLEAR]")
    eval_js(s, "window.droneApp.setWeather('clear')")
    time.sleep(0.5)
    clear_state = eval_js(s, """({
        currentWeather: window.droneApp.currentWeather,
        envWeather: window.droneApp.environment.currentWeather,
        rainVis: window.droneApp.environment.rainGroup.visible,
        snowVis: window.droneApp.environment.snowGroup.visible,
        dustVis: window.droneApp.environment.dustGroup.visible,
        windVis: window.droneApp.environment.windGroup.visible,
        puddlesVis: window.droneApp.environment.surfaceWetnessGroup.visible,
        snowAccVis: window.droneApp.environment.snowAccumulationGroup.visible,
        sunVis: window.droneApp.sunGroup.visible,
        fogDensity: window.droneApp.scene.fog.density,
        badgeText: document.getElementById('hud-weather-badge').textContent,
        windDisplay: window.getComputedStyle(document.getElementById('hud-wind-indicator')).display,
        visDisplay: window.getComputedStyle(document.getElementById('hud-visibility-indicator')).display
    })""")
    print("  Clear state:", clear_state)
    assert clear_state['currentWeather'] == 'clear'
    assert not clear_state['rainVis'] and not clear_state['snowVis'] and not clear_state['dustVis'] and not clear_state['windVis']
    assert not clear_state['puddlesVis'] and not clear_state['snowAccVis']
    assert clear_state['sunVis'] is True
    assert 'CLEAR' in clear_state['badgeText']
    assert clear_state['windDisplay'] == 'none'
    assert clear_state['visDisplay'] == 'none'
    take_screenshot(s, 'screenshot_weather_1_clear.png')

    # B. CLOUDY
    print("\n[Weather: CLOUDY]")
    eval_js(s, "window.droneApp.setWeather('cloudy')")
    time.sleep(0.5)
    cloudy_state = eval_js(s, """({
        currentWeather: window.droneApp.currentWeather,
        lowerCloudsVis: window.droneApp.cloudsLowerGroup.visible,
        sunIntensity: window.droneApp.sunLight.intensity,
        ambientIntensity: window.droneApp.ambientLight.intensity,
        fogDensity: window.droneApp.scene.fog.density,
        badgeText: document.getElementById('hud-weather-badge').textContent,
        rainVis: window.droneApp.environment.rainGroup.visible
    })""")
    print("  Cloudy state:", cloudy_state)
    assert cloudy_state['currentWeather'] == 'cloudy'
    assert cloudy_state['lowerCloudsVis'] is True, "Lower layered clouds must be visible in Cloudy mode!"
    assert cloudy_state['sunIntensity'] < 1.0, "Direct sun intensity must be reduced in Cloudy mode!"
    assert cloudy_state['ambientIntensity'] >= 1.2, "Softer/diffused ambient lighting must be higher in Cloudy mode!"
    assert not cloudy_state['rainVis'], "No precipitation in Cloudy mode!"
    assert 'CLOUDY' in cloudy_state['badgeText']
    take_screenshot(s, 'screenshot_weather_2_cloudy.png')

    # C. RAIN
    print("\n[Weather: RAIN]")
    eval_js(s, "window.droneApp.setWeather('rain')")
    time.sleep(0.5)
    rain_state = eval_js(s, """({
        currentWeather: window.droneApp.currentWeather,
        rainVis: window.droneApp.environment.rainGroup.visible,
        puddlesVis: window.droneApp.environment.surfaceWetnessGroup.visible,
        puddleCount: window.droneApp.environment.waterPuddles.length,
        splashCount: window.droneApp.environment.rainSplashRings.length,
        sunVis: window.droneApp.sunGroup.visible,
        fogDensity: window.droneApp.scene.fog.density,
        badgeText: document.getElementById('hud-weather-badge').textContent,
        windDisplay: window.getComputedStyle(document.getElementById('hud-wind-indicator')).display,
        windText: document.getElementById('hud-wind-indicator').textContent,
        rainIntensitySelectExists: document.getElementById('select-rain-intensity') !== null
    })""")
    print("  Rain state:", rain_state)
    assert rain_state['currentWeather'] == 'rain'
    assert rain_state['rainVis'] is True, "Rain particles must be visible in Rain mode!"
    assert rain_state['puddlesVis'] is True, "Surface wetness & puddles must be visible in Rain mode!"
    assert rain_state['puddleCount'] > 0, "Water puddles must be populated!"
    assert rain_state['splashCount'] == 60, f"Expected 60 splash rings, got {rain_state['splashCount']}"
    assert rain_state['sunVis'] is False, "Sun must be hidden by dark storm clouds!"
    assert rain_state['fogDensity'] >= 0.005, "Atmospheric rain haze fog must be active!"
    assert 'RAIN' in rain_state['badgeText']
    assert rain_state['windDisplay'] != 'none', "HUD wind indicator must be visible in Rain mode!"
    assert rain_state['rainIntensitySelectExists'] is True, "Rain intensity dropdown must exist!"

    # Test all 3 Rain Intensity Levels: Light, Moderate, Heavy
    for level in ['light', 'moderate', 'heavy']:
        eval_js(s, f"window.droneApp.setRainIntensity('{level}')")
        time.sleep(0.2)
        env_level = eval_js(s, "window.droneApp.environment.rainIntensity")
        badge = eval_js(s, "document.getElementById('hud-weather-badge').textContent")
        print(f"  Rain intensity [{level}]: env={env_level}, badge={badge}")
        assert env_level == level, f"Rain intensity failed to set to {level}!"
        assert level.upper() in badge, f"Badge text '{badge}' must contain '{level.upper()}'!"
    
    # Return to heavy rain for screenshot
    eval_js(s, "window.droneApp.setRainIntensity('heavy')")
    take_screenshot(s, 'screenshot_weather_3_rain.png')

    # D. WINDY
    print("\n[Weather: WINDY]")
    eval_js(s, "window.droneApp.setWeather('windy')")
    time.sleep(0.5)
    windy_state = eval_js(s, """({
        currentWeather: window.droneApp.currentWeather,
        windVis: window.droneApp.environment.windGroup.visible,
        vegCount: window.droneApp.environment.swayingVegetation.length,
        windSpeed: window.droneApp.environment.windSpeed,
        liveWind: window.droneApp.environment.currentLiveWindSpeed,
        badgeText: document.getElementById('hud-weather-badge').textContent,
        windText: document.getElementById('hud-wind-indicator').textContent,
        windDisplay: window.getComputedStyle(document.getElementById('hud-wind-indicator')).display,
        debrisSize: window.droneApp.environment.windDebrisParticles.material.size,
        streamlineCount: window.droneApp.environment.streamlineCount
    })""")
    print("  Windy state:", windy_state)
    assert windy_state['currentWeather'] == 'windy'
    assert windy_state['windVis'] is True, "Wind debris & streaks must be visible in Windy mode!"
    assert windy_state['vegCount'] > 0, "Swaying vegetation list must have trees registered!"
    assert windy_state['windDisplay'] != 'none', "HUD wind indicator must be visible in Windy mode!"
    assert 'WIND:' in windy_state['windText'] and 'm/s' in windy_state['windText'] and '→' in windy_state['windText']
    assert 14.0 <= windy_state['liveWind'] <= 24.0, "Live wind speed should oscillate around ~18 m/s"
    assert windy_state['debrisSize'] < 1.0, f"Debris size must be realistic (< 1.0m), got {windy_state['debrisSize']}"
    assert windy_state['streamlineCount'] == 220, f"Expected 220 streamlines, got {windy_state['streamlineCount']}"
    assert 'WINDY' in windy_state['badgeText']
    take_screenshot(s, 'screenshot_weather_4_windy.png')

    # E. DUST / DUST STORM
    print("\n[Weather: DUST]")
    eval_js(s, "window.droneApp.setWeather('dust')")
    time.sleep(0.5)
    dust_state = eval_js(s, """({
        currentWeather: window.droneApp.currentWeather,
        dustVis: window.droneApp.environment.dustGroup.visible,
        dustPointCount: window.droneApp.environment.dustGeo.attributes.position.count,
        fogDensity: window.droneApp.scene.fog.density,
        badgeText: document.getElementById('hud-weather-badge').textContent,
        visText: document.getElementById('hud-visibility-indicator').textContent,
        visDisplay: window.getComputedStyle(document.getElementById('hud-visibility-indicator')).display,
        windText: document.getElementById('hud-wind-indicator').textContent,
        windDisplay: window.getComputedStyle(document.getElementById('hud-wind-indicator')).display,
        dustParticleSize: window.droneApp.environment.dustMat.size,
        cloudCount: window.droneApp.environment.groundDustClouds.length
    })""")
    print("  Dust state:", dust_state)
    assert dust_state['currentWeather'] == 'dust'
    assert dust_state['dustVis'] is True, "Dust storm particles must be visible in Dust mode!"
    assert dust_state['dustPointCount'] == 10000, "Dust storm must have 10,000 particles!"
    assert dust_state['dustParticleSize'] < 1.0, f"Dust particles must be fine grit (< 1.0m), got {dust_state['dustParticleSize']}"
    assert dust_state['cloudCount'] == 40, f"Expected 40 ground rolling dust clouds, got {dust_state['cloudCount']}"
    assert dust_state['fogDensity'] >= 0.008, "Dust storm must have dense reduced visibility fog!"
    assert dust_state['visDisplay'] != 'none', "HUD visibility indicator must be visible in Dust mode!"
    assert 'VISIBILITY: REDUCED' in dust_state['visText']
    assert dust_state['windDisplay'] != 'none', "HUD wind indicator should be visible in Dust mode!"
    assert 'DUST' in dust_state['badgeText']
    take_screenshot(s, 'screenshot_weather_5_dust.png')

    # F. SNOW
    print("\n[Weather: SNOW]")
    eval_js(s, "window.droneApp.setWeather('snow')")
    time.sleep(0.5)
    snow_state = eval_js(s, """({
        currentWeather: window.droneApp.currentWeather,
        snowVis: window.droneApp.environment.snowGroup.visible,
        snowPointCount: window.droneApp.environment.snowGeo.attributes.position.count,
        snowAccVis: window.droneApp.environment.snowAccumulationGroup.visible,
        snowAccMeshCount: window.droneApp.environment.snowAccumulationGroup.children.length,
        fogDensity: window.droneApp.scene.fog.density,
        badgeText: document.getElementById('hud-weather-badge').textContent
    })""")
    print("  Snow state:", snow_state)
    assert snow_state['currentWeather'] == 'snow'
    assert snow_state['snowVis'] is True, "Snow particles must be visible in Snow mode!"
    assert snow_state['snowPointCount'] == 12000, "Snow system must have 12,000 flakes!"
    assert snow_state['snowAccVis'] is True, "Snow accumulation surfaces must be visible in Snow mode!"
    assert snow_state['snowAccMeshCount'] > 0, "Snow caps/blankets must be present!"
    assert 'SNOW' in snow_state['badgeText']
    take_screenshot(s, 'screenshot_weather_6_snow.png')

    # 4. Test Day / Night Mode Synergy with Weather
    print("\n--- 4. Testing Day / Night Mode Compatibility across Weathers ---")

    # Toggle to Night while in Snow
    print("\n[Testing Night + Snow]")
    eval_js(s, "window.droneApp.toggleDayNightMode(true)")
    time.sleep(0.5)
    night_snow_state = eval_js(s, """({
        isNight: window.droneApp.isNightMode,
        weather: window.droneApp.currentWeather,
        moonVis: window.droneApp.moonGroup.visible,
        sunVis: window.droneApp.sunGroup.visible,
        snowVis: window.droneApp.environment.snowGroup.visible,
        snowAccVis: window.droneApp.environment.snowAccumulationGroup.visible,
        moonIntensity: window.droneApp.sunLight.intensity
    })""")
    print("  Night + Snow state:", night_snow_state)
    assert night_snow_state['isNight'] is True
    assert night_snow_state['moonVis'] is True, "Moon must be visible on snow night!"
    assert night_snow_state['sunVis'] is False, "Sun must be hidden at night!"
    assert night_snow_state['snowVis'] is True, "Snow must continue falling at night!"
    assert night_snow_state['snowAccVis'] is True, "Snow accumulation must remain at night!"
    assert night_snow_state['moonIntensity'] >= 0.5, "Luminous moonlight reflecting on snow!"
    take_screenshot(s, 'screenshot_weather_7_night_snow.png')

    # Night + Rain
    print("\n[Testing Night + Rain]")
    eval_js(s, "window.droneApp.setWeather('rain')")
    time.sleep(0.5)
    night_rain_state = eval_js(s, """({
        isNight: window.droneApp.isNightMode,
        weather: window.droneApp.currentWeather,
        moonVis: window.droneApp.moonGroup.visible,
        rainVis: window.droneApp.environment.rainGroup.visible,
        puddlesVis: window.droneApp.environment.surfaceWetnessGroup.visible,
        starsVis: window.droneApp.stars ? window.droneApp.stars.visible : false,
        ringColor: window.droneApp.environment.rainSplashRings[0].mesh.material.color.getHex(),
        rainTopR: window.droneApp.environment.rainGeo.attributes.color.array[0]
    })""")
    print("  Night + Rain state:", night_rain_state)
    assert night_rain_state['rainVis'] is True, "Rain falling in night mode!"
    assert night_rain_state['puddlesVis'] is True, "Wet surfaces active at night!"
    assert night_rain_state['moonVis'] is True, "Moon must be visible in Night + Rain per Requirement 8!"
    assert night_rain_state['starsVis'] is False, "Stars obscured by stormy thunderheads!"
    assert night_rain_state['ringColor'] == 0x253342, f"Night water ring must be dark reflection 0x253342, got {hex(night_rain_state['ringColor'])}"
    assert night_rain_state['rainTopR'] < 0.35, f"Rain top vertex color must be darkened for moonlight, got {night_rain_state['rainTopR']}"
    take_screenshot(s, 'screenshot_weather_8_night_rain.png')

    # Night + Dust
    print("\n[Testing Night + Dust]")
    eval_js(s, "window.droneApp.setWeather('dust')")
    time.sleep(0.5)
    night_dust_state = eval_js(s, """({
        isNight: window.droneApp.isNightMode,
        weather: window.droneApp.currentWeather,
        dustVis: window.droneApp.environment.dustGroup.visible,
        fogDensity: window.droneApp.scene.fog.density
    })""")
    print("  Night + Dust state:", night_dust_state)
    assert night_dust_state['dustVis'] is True, "Dust blowing in night mode!"
    assert night_dust_state['fogDensity'] >= 0.009, "Dense murky night dust haze!"
    take_screenshot(s, 'screenshot_weather_9_night_dust.png')

    # Return to Day Mode
    eval_js(s, "window.droneApp.toggleDayNightMode(false)")
    time.sleep(0.5)

    # 5. Test Weather across All 3 Disaster Scenarios
    print("\n--- 5. Testing Weather across All 3 Disaster Scenarios ---")

    # A. Flash Flood scenario with Rain
    print("\n[Scenario: Flash Flood + Rain]")
    eval_js(s, "window.droneApp.setWeather('rain'); window.droneApp.setScenario('flash_flood')")
    time.sleep(1.0)
    flood_rain_state = eval_js(s, """({
        scenario: window.droneApp.environment.currentScenario,
        weather: window.droneApp.currentWeather,
        rainVis: window.droneApp.environment.rainGroup.visible,
        hasWater: window.droneApp.environment.waterMesh !== null,
        splashes: window.droneApp.environment.rainSplashRings.length,
        vegCount: window.droneApp.environment.swayingVegetation.length
    })""")
    print("  Flood + Rain state:", flood_rain_state)
    assert flood_rain_state['scenario'] == 'flash_flood'
    assert flood_rain_state['weather'] == 'rain', "Weather must be preserved on scenario switch!"
    assert flood_rain_state['rainVis'] is True, "Rain particles must be visible in Flood scenario!"
    assert flood_rain_state['hasWater'] is True, "Flood water mesh must be present!"
    assert flood_rain_state['vegCount'] >= 20, "Assam vegetation must be registered for swaying!"
    take_screenshot(s, 'screenshot_weather_10_flood_rain.png')

    # B. Chemical Fire scenario with Windy
    print("\n[Scenario: Chemical Fire + Windy]")
    eval_js(s, "window.droneApp.setWeather('windy'); window.droneApp.setScenario('chemical_fire')")
    time.sleep(1.0)
    chem_wind_state = eval_js(s, """({
        scenario: window.droneApp.environment.currentScenario,
        weather: window.droneApp.currentWeather,
        windVis: window.droneApp.environment.windGroup.visible,
        vegCount: window.droneApp.environment.swayingVegetation.length,
        gasDriftSpeed: (window.droneApp.environment.hazards.find(h => h.gasCloud) || {}).driftSpeedX
    })""")
    print("  Chemical + Wind state:", chem_wind_state)
    assert chem_wind_state['scenario'] == 'chemical_fire'
    assert chem_wind_state['weather'] == 'windy'
    assert chem_wind_state['windVis'] is True
    assert chem_wind_state['gasDriftSpeed'] >= 3.5, "Gas plume drift speed must increase in windy weather!"
    take_screenshot(s, 'screenshot_weather_11_chem_wind.png')

    # C. Earthquake scenario with Dust Storm
    print("\n[Scenario: Earthquake + Dust]")
    eval_js(s, "window.droneApp.setWeather('dust'); window.droneApp.setScenario('earthquake')")
    time.sleep(1.0)
    eq_dust_state = eval_js(s, """({
        scenario: window.droneApp.environment.currentScenario,
        weather: window.droneApp.currentWeather,
        dustVis: window.droneApp.environment.dustGroup.visible,
        vegCount: window.droneApp.environment.swayingVegetation.length,
        survivors: window.droneApp.environment.survivors.length,
        colliders: window.droneApp.environment.obstacleColliders.length
    })""")
    print("  Earthquake + Dust state:", eq_dust_state)
    assert eq_dust_state['scenario'] == 'earthquake'
    assert eq_dust_state['weather'] == 'dust'
    assert eq_dust_state['dustVis'] is True
    assert eq_dust_state['survivors'] >= 5, "Survivors must remain intact!"
    assert eq_dust_state['colliders'] > 50, "Obstacle colliders must remain intact!"
    take_screenshot(s, 'screenshot_weather_12_eq_dust.png')

    # 6. Test Sensors, Cameras, and Controls
    print("\n--- 6. Testing Sensor Feeds & Flight Functionality with Weather Active ---")
    modes = ['RGB', 'THERMAL', 'NVG', 'LIDAR', 'GAS']
    for mode in modes:
        eval_js(s, f"window.droneApp.sensors.setSensorMode('{mode}')")
        active_mode = eval_js(s, "window.droneApp.sensors.sensorMode")
        assert active_mode == mode, f"Sensor mode {mode} failed!"
    print("  All sensor payload modes verified functional!")

    # Verify PIP secondary camera render
    pip_ok = eval_js(s, "window.droneApp.pipRenderer !== null && window.droneApp.pipCamera !== null")
    assert pip_ok, "Secondary PIP camera feed must be operational!"
    print("  Secondary PIP camera feed verified operational!")

    # Verify Drone takeoff & controls
    eval_js(s, "window.droneApp.drone.takeoff(14)")
    time.sleep(0.5)
    is_flying = eval_js(s, "window.droneApp.drone.telemetry.isFlying")
    print(f"  Drone takeoff verified: {is_flying}")
    assert is_flying is True, "Drone takeoff must succeed!"

    print("\n=======================================================")
    print("🎉 ALL DYNAMIC WEATHER & ENVIRONMENT TESTS PASSED 100%! 🎉")
    print("=======================================================")

finally:
    try:
        proc.terminate()
        proc.wait(timeout=3)
    except Exception:
        pass
