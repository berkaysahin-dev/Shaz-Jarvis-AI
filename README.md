# JARVIS 2.0 — AI Desktop Voice & Vision Assistant

<p align="center">
  <a href="README.md"><b>English</b></a> | <a href="README.tr.md"><b>Türkçe</b></a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/berkaysahin-dev/Shaz-Jarvis-AI/main/docs/preview.jpg" alt="JARVIS 2.0 Desktop Interface" width="100%" style="border-radius: 14px; box-shadow: 0 12px 36px rgba(0,0,0,0.6);" />
</p>

<p align="center">
  <b>Advanced Desktop AI Assistant — Voice, Vision Intelligence, and System Control</b><br/>
  Powered by <a href="https://shazagency.com">Shaz Agency</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Electron-43.4-47848F?style=for-the-badge&logo=electron&logoColor=white" alt="Electron" />
  <img src="https://img.shields.io/badge/React-19.2-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React" />
  <img src="https://img.shields.io/badge/Three.js-0.185-000000?style=for-the-badge&logo=three.js&logoColor=white" alt="Three.js" />
  <img src="https://img.shields.io/badge/Google_Gemini-Flash-8E75B2?style=for-the-badge&logo=google&logoColor=white" alt="Google Gemini" />
  <img src="https://img.shields.io/badge/Edge_Neural_TTS-tr--TR--Ahmet-0078D7?style=for-the-badge&logo=microsoft&logoColor=white" alt="Edge Neural TTS" />
</p>

---

## Next-Generation Features (JARVIS 2.0)

### 1. 3D Motion Exploration Visualizer
- **Multi-Axis Gyroscopic FUI Rings:** Independently rotating neon rings across X, Y, and Z axes with glowing photon beads gliding along orbital trajectories.
- **360° Circular Audio Equalizer:** 64 radial 3D spectrum bars that dynamically scale and pulse with real-time audio input and output.
- **1,200+ Quantum Particle Swarm:** An organic particle cloud revolving around a pulsating fluid plasma core.

### 2. Studio-Quality Voice (Gemini HD + Neural fallback)
- **Gemini HD voice:** Replies are spoken with Gemini text-to-speech voices (Charon, Orus, Kore and more) for natural, studio-quality Turkish and English.
- **Automatic fallback:** If the HD voice is unavailable or its quota runs out, JARVIS switches to Microsoft neural voices (96 kbps, pitch and speed controls), then to the system voice.
- **Voice picker:** Choose the engine and voice in Settings and preview it before saving.
- **Live 3D Sphere Synchronization:** Real-time audio stream linked directly to the 3D core via the Web Audio Analyser API; the sphere ripples and pulses rhythmically as JARVIS speaks.

### 3. Reliable Voice Input
- **Direct microphone capture:** Records with echo cancellation and noise suppression and detects the end of a sentence automatically, so listening no longer stops by itself.
- **Accurate transcription:** Speech is transcribed by Gemini and shown in the chat, so you see what JARVIS heard.
- **Automatic model selection:** JARVIS asks the API which models your key can use and picks the newest fast Flash model, so retired model names don't break it.
- **Clear errors:** An invalid key, exhausted quota, missing microphone or lost internet each get their own message instead of a generic connection error.

### ⏹ 4. Instant Interrupt & Conversational Barge-In
- Cut off voice output and ongoing tasks immediately by saying commands like *"stop"*, *"quiet"*, *"jarvis stop"*, or *"cancel"*, or by pressing the `Escape` key / clicking the **[STOP]** button in the UI.

### 5. Real-Time OS Sparkline Performance Telemetry
- Live hardware telemetry dashboard tracking the last 15 seconds of CPU and RAM utilization with smooth gradient wave sparkline charts.

### 6. Modern Typography System
- **UI Interface Font:** `Plus Jakarta Sans` for clean, contemporary readability.
- **Telemetry & Technical Font:** `JetBrains Mono` for precise developer data and system statistics.

### 7. Smart Application Control & Mobile Remote Access
- Launch applications such as Google Chrome, Spotify, VS Code, Notepad, and Calculator via voice commands or a streamlined quick-access panel.
- **Real tool calling:** Gemini decides when to act: open apps and folders, search Google / YouTube / Maps, control media and volume, set reminders, take and read notes, find files, lock the PC and report system status.
- **Memory & context:** JARVIS remembers the last turns of the conversation and lasting facts you tell it.
- **Cyan Active Indicator:** Glowing indicator along the left rail highlighting currently focused and active applications.
- **Mobile Remote Connectivity:** Connect any smartphone on the local network via QR code to monitor status and dispatch voice/text commands remotely.

---

## Architecture & Tech Stack

| Component | Technology |
| :--- | :--- |
| **Desktop Shell** | Electron 43 (Windows Native) |
| **Frontend UI** | React 19 (TypeScript) + Vite 8 |
| **3D Graphics & Shaders** | Three.js + React Three Fiber + Drei |
| **AI Engine** | Google Gemini REST (newest Flash model, chosen automatically) |
| **Speech Synthesis** | Gemini TTS (HD) + Microsoft Edge Neural TTS fallback |
| **Typography** | Plus Jakarta Sans & JetBrains Mono |

---

## Quick Start & Installation

### Prerequisites
- **Node.js**: v18.0.0 or higher
- **Google Gemini API Key**: Obtain a free API key from [Google AI Studio](https://aistudio.google.com/).

### Installation Steps

1. **Clone the Repository:**
   ```bash
   git clone https://github.com/berkaysahin-dev/Shaz-Jarvis-AI.git
   cd Shaz-Jarvis-AI
   ```

2. **Install Dependencies:**
   ```bash
   npm install
   ```

3. **Launch the Application:**
   ```bash
   BASLAT.bat
   ```
   Or in developer mode:
   ```bash
   npm run electron:dev
   ```

### Mobile Remote Access (LAN)
To control JARVIS from a smartphone on the same Wi-Fi network:
1. Run `TELEFON.bat` (or `npm run dev -- --host`).
2. Open the displayed local IP address on your phone's browser or scan the in-app QR code.

---

## Configuration

1. Launch JARVIS.
2. Click the **Settings (Gear)** icon in the top-right corner.
3. Enter your **Google Gemini API Key** and save.

---

## Brand & Developer

Developer & Design: **[Shaz Agency](https://shazagency.com)**  
Repository: [github.com/berkaysahin-dev/Shaz-Jarvis-AI](https://github.com/berkaysahin-dev/Shaz-Jarvis-AI)

---

## License

This project is licensed under the [MIT License](LICENSE).
