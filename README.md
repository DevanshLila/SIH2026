# 🚁 AERORES-AI: Autonomous Disaster-Response & Search-and-Rescue UAV
### Multi-Sensor Fusion (LiDAR + FLIR Thermal + 4K RGB + Gas MQ) & Edge AI in GPS-Denied Environments

**🏆 Smart India Hackathon (SIH) 2026**  
**🏢 Organization:** Qualcomm Inc.  
**🎯 Problem Statement ID:** 26177 (College Round ID: 12)  
**📂 Theme:** Robotics and Drones / Disaster Management | **Category:** Hardware  
**👥 Team:** **Team Pegasus**  
*Devansh Lila (2025UEC1240) • Himanshu Shah (2025UEE1347) • Kavyansh Singh (2025UCH1396) • Kushagra Katiyar (2025UEC1433) • Mihir (2025UEC1483) • Vandana Bairwa (2025UCH1833)*

---

## 🌐 Live Online Simulation (For SIH Judges & Evaluators)

**🚀 Official Public Live Demo Link:**  
👉 **[https://devanshlila.github.io/SIH2026/](https://devanshlila.github.io/SIH2026/)**

> **Note for Evaluators:**
> - Runs completely in the browser (Chrome, Edge, Safari, Firefox) on laptop, tablet, or smartphone.
> - **Zero installation or local server required!**
> - Hardware-accelerated 3D WebGL (Three.js r128), real-time LiDAR raycasting, radiometric FLIR Thermal IR, and Edge AI YOLOv8 perception simulation.

<div align="center">
  <img src="simulation_qr_code.png" alt="Scan to Launch Simulation" width="180"/>
  <p><em>Scan with any mobile camera / QR scanner to launch simulation instantly</em></p>
</div>

---

## 🌟 Executive Summary

In the critical "Golden Hours" following major disasters (earthquakes, flash floods, industrial chemical fires, landslides), ground rescue squads face severe hazards: toxic gas clouds, active fires, unstable collapsing structures, and completely severed cellular/GPS signals.

**AERORES-AI** is an autonomous deployable drone platform engineered to provide instant aerial situational awareness:
1. **Multi-Sensor Fusion Payload:** Fuses 4K RGB optical vision, FLIR radiometric thermal infrared (body heat 36.5°C-37.5°C), 360° LiDAR SLAM, and MQ-series toxic gas sniffers onto a unified edge perception framework.
2. **On-Device Edge AI Inference:** Runs real-time YOLOv8 object detection locally on Qualcomm Hexagon NPU / Raspberry Pi 4 to locate survivors and hazards with zero cloud dependency.
3. **GPS-Denied Resilience:** Uses Decawave DWM1000 Ultra-Wideband (UWB) trilateration and LiDAR visual odometry to navigate inside collapsed buildings, concrete voids, and tunnels where GPS is unavailable.
4. **Gas-Source Localization:** Analyzes chemical concentration gradients ($\nabla C$) in real time to pinpoint ruptured methane/ammonia pipelines.
5. **NDRF Tactical GCS Dashboard & SITREP:** Automatically categorizes victims via the **START Triage Protocol** (Red: Immediate, Yellow: Urgent, Green: Minor), plots safe extraction corridors avoiding hazard plumes, and generates official NDRF Disaster Situation Reports.

---

## 🎮 Interactive Simulation Features

This repository contains the complete interactive 3D WebGL simulation built to demonstrate the capabilities to SIH judges.

### 🕹️ Simulation Controls & Views:
- **☀️ Day / 🌙 Night Mode Toggle (Header):**
  - `Day Mode`: Crisp natural daylight, ambient illumination, realistic directional sun shadows.
  - `Night Mode`: Realistic low-light dark atmosphere, cold moon glow, flashing red/blue emergency vehicle beacons, street light sparks, factory floodlights, automatic UAV search spotlight activation, and enhanced FLIR Thermal / NVG sensor utility!
- **Sensor Mode Toolbar (Top of 3D Viewport):**
  - `🎥 4K Optical + AI`: Real-time YOLOv8 bounding boxes with confidence scores & triage labels.
  - `🔥 FLIR Thermal IR`: Radiometric false-color Ironbow colormap isolating human body heat (36.5°C-37.5°C) through smoke/darkness.
  - `👁️ Night Vision`: Generation-III green phosphor night vision amplification.
  - `📡 3D LiDAR SLAM`: Real geometric raycasting against physical scene obstacles, dynamic 3D detection cone, and concentric ground range rings (10m, 20m, and 25m Max Range limit) with proximity color coding (Red = Alert <4m, Yellow = Caution 4-10m, Cyan = Safe >10m).
  - `☣️ Gas Plume Gradient`: Volumetric chemical dispersion plume showing concentration (PPM).
- **Disaster Environments (Scenario Selector):**
  - `🏚️ Urban Earthquake Collapse`: Deep roadway fissures, buckled pavement, leaning cracked commercial tower, pancaked residential complex, 45+ concrete rubble blocks, fallen utility poles with tangled wires, crushed car, and 5 trapped/stranded survivors.
  - `🌊 FLOOD / TSUNAMI`: Realistic natural blue floodwaters with dynamic animated ripples and waves, traditional elevated stilt houses ("chang ghar"), tin-roof huts, partially inundated school building, submerged truck and auto-rickshaw, floating logs/debris, banana vegetation, rescue boat, bamboo raft, and 5 rooftop/raft-stranded survivors.
  - `☣️ Industrial Gas & Factory Blast`: Chemical tank farm with ruptured pressurized spherical vessel, yellow pipe racks, fractured pipeline manifolds, massive toxic plumes (Ammonia & Methane), AND a fully accessible FACTORY INTERIOR with breached walls, heavy boiler machinery, generator cabinets, fallen cable trays, elevated catwalk, and 5 interior/exterior trapped workers.
- **Camera View Angles:**
  - `Follow (3rd Person)`: Smooth cinematic chase camera following the hexacopter.
  - `Gimbal FPV`: Pilot HUD with crosshairs, pitch ladder, and laser rangefinder.
  - `Top-Down Survey`: 90-degree satellite disaster mapping view.
  - `360° Orbit`: Free orbit around the drone to inspect the frame and sensor gimbal.
  - `PIP Inset Preview`: Picture-in-picture secondary camera (click to swap viewports!).
- **Autonomous Flight Modes (Bottom Footer Bar):**
  - `Grid Lawnmower`: Systematic parallel coverage search pattern over the 160m² disaster sector.
  - `Spiral Recon`: Expanding Archimedean spiral search centered on the disaster epicenter.
  - `GPS-Denied UWB`: Indoor low-altitude tunnel navigation guided by 4 UWB anchor stations.
  - `Manual (WASD)`: Direct pilot teleoperation (`W/A/S/D` = Move, `Up/Down` = Altitude, `Q/E` = Yaw).
- **Special Presentation Tools:**
  - `⭐ SIH Presentation Mode`: Guided 6-step automated showcase tailored for SIH evaluators.
  - `📄 NDRF SITREP`: Instant printable/exportable official disaster situation report with dynamic sector name.
  - `📦 Drop Emergency Medkit`: Deploys first aid and LoRa beacon over discovered victims.
  - `🔊 Web Audio`: Synthesizes dynamic drone motor pitch and hazard radar beeps.

---

## 🚀 How to Run the Simulation Locally

### Method 1: One-Click Windows Batch Launcher (Easiest)
Simply double-click the included file:
```
run_simulation.bat
```
This automatically starts the local Python server and opens the simulation in your default browser at `http://localhost:8000`.

### Method 2: Python Command Line
```powershell
python server.py
```
Or with standard Python HTTP server:
```powershell
python -m http.server 8000
```
Open [http://localhost:8000](http://localhost:8000) in Chrome, Edge, Safari, or Firefox.

---

## 🌐 How to Host Online for Free (For Your PPT Link & QR Code)

To put a live working link in Slide 7 of your SIH PPT, use any of these free 1-minute hosting options:

### Option A: GitHub Pages (Recommended)
1. Initialize a Git repository and push this folder to your GitHub account:
   ```bash
   git init
   git add .
   git commit -m "AERORES-AI Drone Simulation - Team Pegasus SIH 2026"
   git branch -M main
   git remote add origin https://github.com/<your-username>/disaster-rescue-uav.git
   git push -u origin main
   ```
2. On GitHub, go to your repository **Settings** &rarr; **Pages**.
3. Under **Branch**, select `main` and root `/`, then click **Save**.
4. Your simulation is now live at:
   ```
   https://<your-username>.github.io/disaster-rescue-uav/
   ```

### Option B: Netlify Drop (10 Seconds, No Git Required)
1. Go to [https://app.netlify.com/drop](https://app.netlify.com/drop).
2. Drag and drop this entire `SIH` project folder into the browser window.
3. Netlify will deploy it instantly and give you a live URL like `https://aerores-ai-pegasus.netlify.app`.

---

## 📱 Generating Your QR Code for Slide 7

Once you have your live deployed URL (e.g. from GitHub Pages or Netlify), run:
```powershell
python generate_qr_code.py "https://your-username.github.io/disaster-rescue-uav/"
```
This saves `simulation_qr_code.png` directly to your folder.  
**Open your PPT, go to Slide 7 ("Online Simulation"), and insert this QR code image!**

---

## 📐 System Architecture (Slide 3)

```
[Sensors Payload]
(RGB 4K, FLIR Thermal, LiDAR, Gas MQ, UWB, IMU, GPS, Barometer)
       │
       ▼
[Sensor Fusion & Preprocessing]
(Kalman Filter, Point Cloud Registration, Radiometric Calibration)
       │
       ▼
[Perception & Edge AI]
(YOLOv8 On-Device Inference, START Triage Classification, Gas Gradient)
       │
       ▼
[Mapping & SLAM] ◄────────► [Path Planner & Coverage]
(Visual/LiDAR SLAM & UWB)   (ROS2 Nav2 Lawnmower / Spiral / Ingress)
       │                              │
       ▼                              ▼
[Ground Control Station]       [Flight Controller & Actuators]
(LoRa 868MHz Telemetry & Video) (Arduino Mega 2560, ESCs & Motors)
```

---

## 🔌 Hardware Circuit & Bill of Materials (Slide 4 & 7)

| Subsystem | Component | Interface | Role in Mission | Approx Cost (INR) |
|---|---|---|---|---|
| **Frame** | Carbon Fiber Hexacopter Frame (680mm) | -- | 3.5kg Payload Capacity | ₹12,000 |
| **Flight MCU** | Arduino Mega 2560 & Pixhawk 2.4.8 | UART / PWM / I2C | Real-time flight stabilization & telemetry | ₹9,500 |
| **Edge AI NPU** | Raspberry Pi 4 / Qualcomm Neural Board | CSI / USB 3.0 | Real-time YOLOv8 object & survivor detection | ₹7,500 |
| **Thermal Cam** | FLIR Lepton 3.5 Radiometric LWIR | SPI / VoSPI | Trapped survivor body heat localization | ₹24,000 |
| **Optical Cam** | 4K 60FPS Low-Distortion Camera | CSI / USB 3.0 | High-res surface damage inspection | ₹4,500 |
| **3D LiDAR** | RPLiDAR A2M8 360° Laser Scanner | UART Serial | 12m Obstacle avoidance & 3D SLAM | ₹14,000 |
| **Gas Sniffers** | MQ-4 (Methane) + MQ-7 (CO) + VOC PID | ADC Analog | Combustible & toxic leak pinpointing | ₹1,800 |
| **UWB Modules** | Decawave DWM1000 Transceiver (x4) | SPI Bus | Centimeter indoor GPS-Denied tracking | ₹3,200 |
| **Comms Link** | SX1276 LoRa 868MHz + 5.8GHz FPV | SPI / Analog RF | 10km offline resilient telemetry downlink | ₹5,500 |
| **Battery** | 6S 22.2V 10,000mAh LiPo | XT90 | 28-32 Minutes SAR flight endurance | ₹8,000 |
| **TOTAL** | | | **Complete Functional Prototype** | **~₹90,000** |

*(Fits comfortably within the ₹40k - 1.2L prototype budget stated in Slide 4).*

---

## 📚 Open-Source & Research References (Slide 6)

1. **ROS2 Navigation2 (nav2):** [https://github.com/ros-navigation/navigation2](https://github.com/ros-navigation/navigation2)
2. **Ultralytics YOLOv8 Aerial Detection:** [https://github.com/ultralytics/ultralytics](https://github.com/ultralytics/ultralytics)
3. **NIST Standard Test Methods for Response Robots:** [NIST Response Robot Test Methods](https://www.nist.gov/el/intelligent-systems-division-73500/standard-test-methods-response-robots)
4. **DHS Science & Technology SAVER:** [Small Unmanned Aircraft Systems Search & Rescue (FRROST)](https://www.dhs.gov/science-and-technology/saver/st-small-unmanned-aircraft-systems-search-and-rescue-frrost)
5. **Decawave UWB Indoor Localization Protocol:** [Decawave Application Notes](https://www.qorvo.com/products/p/DWM1000)

---

&copy; 2026 **Team Pegasus** &bull; Smart India Hackathon 2026 &bull; Qualcomm Inc. PS-26177
