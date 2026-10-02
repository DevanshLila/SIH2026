/**
 * AERORES-AI Real-Time Night Vision Imaging & Intensification Engine
 * High-Fidelity Gen-3 Image Intensifier (P-43 Green Phosphor Pipeline)
 * Team Pegasus - SIH 2026
 *
 * Core Capabilities:
 * 1. True Rec.709 Luminance Extraction: Y = 0.2126*R + 0.7152*G + 0.0722*B (100% Monochrome Green, zero RGB remnants)
 * 2. Authentic P-43 Phosphor Curve: Black -> Dark Green -> Green -> Bright Phosphor Green
 * 3. Smooth Adaptive Exposure & Auto-Gain: Dynamic scene lighting evaluation with exponential damping (zero flicker/oscillation)
 * 4. Micro-Channel Scintillation Noise: Dynamic photocathode electron avalanche grain, stronger in amplified dark zones
 * 5. Controlled Highlight Bloom: Phosphor tube halo around bright lights (fires, headlights, searchlights)
 * 6. Optical Lens Vignette & Structural Contrast S-Curve
 * 7. Multi-Feed Synchronization: Main Viewport, Secondary Inset PIP Camera, and Dedicated UAV Overlay Canvas
 * 8. Strict Optical Physical Consistency: Visible light only, zero wall penetration, complete separation from FLIR thermal
 */

class NightVisionEngine {
  constructor(renderer, scene, camera, pipRenderer, pipCamera, uavRenderer) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.pipRenderer = pipRenderer;
    this.pipCamera = pipCamera;
    this.uavRenderer = uavRenderer;

    this.isActive = false;
    this.time = 0;
    this.currentGain = 2.8;
    this.targetGain = 2.8;
    this.gainLerpSpeed = 2.4; // Exponential damping factor

    // Orthographic post-processing camera & fullscreen quad
    this.postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quadGeo = new THREE.PlaneGeometry(2, 2);

    // Get initial canvas sizes
    const canvas = renderer ? renderer.domElement : null;
    const width = canvas ? (canvas.clientWidth || window.innerWidth) : window.innerWidth;
    const height = canvas ? (canvas.clientHeight || window.innerHeight) : window.innerHeight;

    const pipCanvas = pipRenderer ? pipRenderer.domElement : null;
    const pipW = pipCanvas ? (pipCanvas.clientWidth || 280) : 280;
    const pipH = pipCanvas ? (pipCanvas.clientHeight || 170) : 170;

    // Render Targets
    this.mainRenderTarget = new THREE.WebGLRenderTarget(width, height, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType
    });

    this.pipRenderTarget = new THREE.WebGLRenderTarget(pipW, pipH, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType
    });

    this.uavRenderTarget = new THREE.WebGLRenderTarget(width, height, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType
    });

    this.initShaders(width, height, pipW, pipH);
    this.setupPostScenes();
  }

  initShaders(width, height, pipW, pipH) {
    // Vertex Shader: Fullscreen quad
    const vertexShader = `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `;

    // Fragment Shader: Gen-3 P-43 Phosphor Night Vision Intensifier
    const fragmentShader = `
      precision highp float;

      uniform sampler2D tDiffuse;
      uniform float uTime;
      uniform float uGain;
      uniform float uNoiseIntensity;
      uniform float uBloomIntensity;
      uniform vec2 uResolution;
      uniform float uVignette;
      uniform float uContrast;
      uniform float uIsOverlay; // 1.0 for UAV overlay with alpha preservation

      varying vec2 vUv;

      // Rec. 709 Luminance extraction (strips all non-green color hues)
      float getLuminance(vec3 c) {
        return dot(c, vec3(0.2126, 0.7152, 0.0722));
      }

      // High-Fidelity Gen-3 Military Phosphor (P-43) transfer curve
      // Black -> Dark Green -> Green -> Bright Phosphor Green -> Highlight White-Green
      vec3 phosphorPalette(float lum) {
        vec3 cBlack       = vec3(0.002, 0.030, 0.005); // pure shadow / night void
        vec3 cDarkGreen   = vec3(0.020, 0.250, 0.035); // low light / shadowed terrain
        vec3 cMidGreen    = vec3(0.080, 0.880, 0.120); // military green phosphor
        vec3 cBrightGreen = vec3(0.220, 0.980, 0.250); // bright green / direct light
        vec3 cPeakWhite   = vec3(0.550, 1.000, 0.580); // highlight / fire core / headlights

        if (lum <= 0.20) {
          float f = clamp(lum / 0.20, 0.0, 1.0);
          return mix(cBlack, cDarkGreen, f);
        } else if (lum <= 0.55) {
          float f = (lum - 0.20) / 0.35;
          return mix(cDarkGreen, cMidGreen, f);
        } else if (lum <= 0.85) {
          float f = (lum - 0.55) / 0.30;
          return mix(cMidGreen, cBrightGreen, f);
        } else {
          float f = clamp((lum - 0.85) / 0.35, 0.0, 1.0);
          return mix(cBrightGreen, cPeakWhite, f);
        }
      }

      // Pseudo-random photocathode electron scintillation noise
      float hashNoise(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123) - 0.5;
      }

      void main() {
        vec2 uv = vUv;
        vec4 sceneSample = texture2D(tDiffuse, uv);

        // Alpha handling for UAV overlay canvas pass
        if (uIsOverlay > 0.5) {
          if (sceneSample.a < 0.02) {
            discard;
          }
        }

        // 1. Luminance extraction
        float lum = getLuminance(sceneSample.rgb);

        // 2. Controlled Highlight Bloom / Phosphor Tube Glow
        vec2 texel = 1.0 / uResolution;
        float tap1 = getLuminance(texture2D(tDiffuse, uv + vec2(-2.5, 0.0) * texel).rgb);
        float tap2 = getLuminance(texture2D(tDiffuse, uv + vec2( 2.5, 0.0) * texel).rgb);
        float tap3 = getLuminance(texture2D(tDiffuse, uv + vec2(0.0, -2.5) * texel).rgb);
        float tap4 = getLuminance(texture2D(tDiffuse, uv + vec2(0.0,  2.5) * texel).rgb);
        float avgSurround = (tap1 + tap2 + tap3 + tap4) * 0.25;

        // Isolate bright light sources for halo
        float halo = max(0.0, avgSurround - 0.52) * 1.4;

        // 3. Low-Light Amplification with Adaptive Gain
        float amplifiedLum = lum * uGain + (halo * uBloomIntensity);

        // 4. Structural Contrast S-Curve (Preserves buildings, rubble, roads, obstacles)
        float contrastLum = clamp((amplifiedLum - 0.5) * uContrast + 0.5, 0.0, 1.6);
        contrastLum = pow(contrastLum, 0.94);

        // 5. Transfer to pure monochrome green phosphor
        vec3 greenColor = phosphorPalette(contrastLum);

        // 6. Micro-Channel Scintillation Noise
        vec2 grainCoord = uv * uResolution * 0.85 + vec2(uTime * 47.1, uTime * 89.3);
        float grain = hashNoise(grainCoord);
        float grainAmp = (1.0 + (1.0 - clamp(contrastLum, 0.0, 1.0)) * 0.65) * uNoiseIntensity;
        greenColor += vec3(0.18, 0.82, 0.28) * (grain * grainAmp);

        // 7. Optical Lens Vignette
        if (uIsOverlay < 0.5) {
          float dist = length(uv - vec2(0.5));
          float vig = 1.0 - smoothstep(0.42, 0.90, dist) * uVignette;
          greenColor *= vig;
        }

        greenColor = clamp(greenColor, 0.0, 1.0);

        if (uIsOverlay > 0.5) {
          gl_FragColor = vec4(greenColor * sceneSample.a, sceneSample.a);
        } else {
          gl_FragColor = vec4(greenColor, 1.0);
        }
      }
    `;

    // Uniforms for Main Viewport
    this.mainShaderMat = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        tDiffuse: { value: null },
        uTime: { value: 0 },
        uGain: { value: 2.8 },
        uNoiseIntensity: { value: 0.038 },
        uBloomIntensity: { value: 0.35 },
        uResolution: { value: new THREE.Vector2(width, height) },
        uVignette: { value: 0.38 },
        uContrast: { value: 1.18 },
        uIsOverlay: { value: 0.0 }
      },
      depthTest: false,
      depthWrite: false
    });

    // Uniforms for PIP Inset Camera
    this.pipShaderMat = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        tDiffuse: { value: null },
        uTime: { value: 0 },
        uGain: { value: 2.8 },
        uNoiseIntensity: { value: 0.038 },
        uBloomIntensity: { value: 0.35 },
        uResolution: { value: new THREE.Vector2(pipW, pipH) },
        uVignette: { value: 0.28 },
        uContrast: { value: 1.18 },
        uIsOverlay: { value: 0.0 }
      },
      depthTest: false,
      depthWrite: false
    });

    // Uniforms for Dedicated UAV Overlay Canvas (z-index 12, alpha: true)
    this.uavShaderMat = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        tDiffuse: { value: null },
        uTime: { value: 0 },
        uGain: { value: 2.6 },
        uNoiseIntensity: { value: 0.025 },
        uBloomIntensity: { value: 0.25 },
        uResolution: { value: new THREE.Vector2(width, height) },
        uVignette: { value: 0.0 },
        uContrast: { value: 1.15 },
        uIsOverlay: { value: 1.0 }
      },
      transparent: true,
      depthTest: false,
      depthWrite: false
    });
  }

  setupPostScenes() {
    this.postSceneMain = new THREE.Scene();
    this.meshMain = new THREE.Mesh(this.quadGeo, this.mainShaderMat);
    this.postSceneMain.add(this.meshMain);

    this.postScenePip = new THREE.Scene();
    this.meshPip = new THREE.Mesh(this.quadGeo, this.pipShaderMat);
    this.postScenePip.add(this.meshPip);

    this.postSceneUav = new THREE.Scene();
    this.meshUav = new THREE.Mesh(this.quadGeo, this.uavShaderMat);
    this.postSceneUav.add(this.meshUav);
  }

  enable() {
    this.isActive = true;
    const hudBadge = document.getElementById('nvg-hud-badge');
    if (hudBadge) hudBadge.style.display = 'block';

    // Disable legacy CSS overlay color-dodge filter
    const legacyOverlay = document.getElementById('nvg-filter');
    if (legacyOverlay) legacyOverlay.style.display = 'none';

    // Ensure environment is aware for lighting stability
    const app = window.droneApp;
    if (app && app.environment) {
      app.environment.isNightVisionActive = true;
    }
  }

  disable() {
    this.isActive = false;
    const hudBadge = document.getElementById('nvg-hud-badge');
    if (hudBadge) hudBadge.style.display = 'none';

    const legacyOverlay = document.getElementById('nvg-filter');
    if (legacyOverlay) legacyOverlay.style.display = 'none';

    const app = window.droneApp;
    if (app && app.environment) {
      app.environment.isNightVisionActive = false;
    }
  }

  update(delta, dronePos = null, isNightMode = false, hazards = [], spotlightActive = false) {
    if (!this.isActive) return;

    this.time += delta;
    this.mainShaderMat.uniforms.uTime.value = this.time;
    this.pipShaderMat.uniforms.uTime.value = this.time;
    this.uavShaderMat.uniforms.uTime.value = this.time;

    // 1. Calculate Target Gain dynamically based on environmental illumination
    let baseGain = isNightMode ? 3.1 : 1.15;

    // Proximity to bright fire hazards decreases gain smoothly to avoid blowout
    if (dronePos && hazards && hazards.length > 0) {
      let closestFireDist = 999;
      for (let i = 0; i < hazards.length; i++) {
        const h = hazards[i];
        if (h.type === 'fire' || !h.type) {
          const d = dronePos.distanceTo(h.position);
          if (d < closestFireDist) closestFireDist = d;
        }
      }
      if (closestFireDist < 25) {
        const fireFactor = Math.max(0, 1.0 - closestFireDist / 25);
        baseGain = Math.max(1.1, baseGain - fireFactor * 1.5);
      }
    }

    // UAV searchlight illumination reduces required optical gain
    if (spotlightActive) {
      baseGain = Math.max(0.75, baseGain * 0.55);
    }

    this.targetGain = baseGain;

    // 2. Exponential low-pass damping filter (smooth adaptation, zero flicker/oscillation)
    const lerpFactor = 1.0 - Math.exp(-delta * this.gainLerpSpeed);
    this.currentGain += (this.targetGain - this.currentGain) * lerpFactor;

    // Apply smoothed gain to uniforms
    this.mainShaderMat.uniforms.uGain.value = this.currentGain;
    this.pipShaderMat.uniforms.uGain.value = this.currentGain;
    this.uavShaderMat.uniforms.uGain.value = Math.max(1.0, this.currentGain * 0.88);

    // 3. Update HUD Badge Live Readings
    const gainValEl = document.getElementById('nvg-val-gain');
    if (gainValEl) {
      gainValEl.textContent = `AUTO (${this.currentGain.toFixed(1)}x)`;
    }
    const expValEl = document.getElementById('nvg-val-exposure');
    if (expValEl) {
      const expLevel = this.currentGain > 2.6 ? 'HIGH' : (this.currentGain > 1.6 ? 'NOMINAL' : 'LOW');
      expValEl.textContent = `AUTO [${expLevel}]`;
    }
  }

  renderMain(renderer, scene, camera) {
    if (!renderer || !scene || !camera) return;

    // Render 3D scene to offscreen render target
    renderer.setRenderTarget(this.mainRenderTarget);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);

    // Render fullscreen quad through P-43 phosphor shader to main canvas
    this.mainShaderMat.uniforms.tDiffuse.value = this.mainRenderTarget.texture;
    renderer.render(this.postSceneMain, this.postCamera);
  }

  renderPip(pipRenderer, scene, pipCamera) {
    if (!pipRenderer || !scene || !pipCamera) return;

    // Render 3D scene to PIP offscreen render target
    pipRenderer.setRenderTarget(this.pipRenderTarget);
    pipRenderer.clear();
    pipRenderer.render(scene, pipCamera);
    pipRenderer.setRenderTarget(null);

    // Render fullscreen quad through P-43 phosphor shader to PIP canvas
    this.pipShaderMat.uniforms.tDiffuse.value = this.pipRenderTarget.texture;
    pipRenderer.render(this.postScenePip, this.postCamera);
  }

  renderUav(uavRenderer, scene, camera) {
    if (!uavRenderer || !scene || !camera) return;

    // Render UAV overlay to offscreen target with alpha channel
    uavRenderer.setRenderTarget(this.uavRenderTarget);
    uavRenderer.clear();
    uavRenderer.render(scene, camera);
    uavRenderer.setRenderTarget(null);

    // Render UAV overlay through P-43 phosphor shader with alpha preservation
    this.uavShaderMat.uniforms.tDiffuse.value = this.uavRenderTarget.texture;
    uavRenderer.render(this.postSceneUav, this.postCamera);
  }

  handleResize(width, height, pipW, pipH) {
    if (this.mainRenderTarget) this.mainRenderTarget.setSize(width, height);
    if (this.uavRenderTarget) this.uavRenderTarget.setSize(width, height);
    if (this.pipRenderTarget) this.pipRenderTarget.setSize(pipW, pipH);

    if (this.mainShaderMat) this.mainShaderMat.uniforms.uResolution.value.set(width, height);
    if (this.uavShaderMat) this.uavShaderMat.uniforms.uResolution.value.set(width, height);
    if (this.pipShaderMat) this.pipShaderMat.uniforms.uResolution.value.set(pipW, pipH);
  }
}

window.NightVisionEngine = NightVisionEngine;
