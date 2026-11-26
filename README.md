# JARVIS 2.0 — AI Desktop Voice & Vision Assistant

<p align="center">
  <a href="README.md"><b>English</b></a> | <a href="README.tr.md"><b>Türkçe</b></a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/berkaysahin-dev/Shaz-Jarvis-AI/main/docs/preview.jpg" alt="JARVIS 2.0 Desktop Interface" width="100%" style="border-radius: 14px; box-shadow: 0 12px 36px rgba(0,0,0,0.6);" />
</p>

<p align="center">
  <b>Desktop AI Assistant — Voice, Vision & System Control</b><br/>
  Powered by <a href="https://shazagency.com">Shaz Agency</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Electron-43.8-47848F?style=for-the-badge&logo=electron&logoColor=white" alt="Electron" />
  <img src="https://img.shields.io/badge/React-19.2-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React" />
  <img src="https://img.shields.io/badge/Three.js-0.185-000000?style=for-the-badge&logo=three.js&logoColor=white" alt="Three.js" />
  <img src="https://img.shields.io/badge/Google_Gemini-Flash-8E75B2?style=for-the-badge&logo=google&logoColor=white" alt="Google Gemini" />
  <img src="https://img.shields.io/badge/Edge_Neural_TTS-tr--TR--Ahmet-0078D7?style=for-the-badge&logo=microsoft&logoColor=white" alt="Edge Neural TTS" />
</p>

---

## Features

### 1. 3D Audio-Reactive Orb
- **Galaxy & Classic Modes:** Spiral galaxy core with star field and dust arms, or the classic particle orb — switchable in Settings.
- **Audio Synchronization:** Connected to the Web Audio Analyser API so the orb pulses with live microphone input and spoken replies.

### 2. Voice Output (Gemini HD + Neural Fallback)
- **Gemini HD Voices:** Natural Turkish and English speech using Gemini TTS voices (`Charon`, `Orus`, `Kore`, and more).
- **Automatic Fallback:** Falls back to Microsoft Edge neural voices (96 kbps with pitch/speed controls) or the system voice if quota runs out or HD TTS is unavailable.
- **Voice Preview:** Pick your engine and voice in Settings and test playback before saving.

### 3. Voice Input & Model Selection
- **Direct Microphone Capture:** Records with echo cancellation, noise suppression, and automatic end-of-utterance detection.
- **Transcripts & Context:** Transcribes speech via Gemini, shows what was heard in the chat, and keeps session conversation memory until you quit.
- **Automatic Model Discovery:** Queries the Gemini API for available Flash models for your key and handles invalid key, quota, microphone, and network errors separately.

### 4. Instant Interrupt & Barge-In
- Interrupt speech or active tasks at any time by saying *"stop"*, *"quiet"*, *"jarvis stop"*, or *"cancel"*, pressing `Escape`, or clicking **[STOP]**.

### 5. System Telemetry & Desktop Controls
- **CPU & RAM Ring Gauges:** Live CPU load and memory usage rings in the sidebar.
- **Tool Calling:** Launch installed apps, open websites, search Google / YouTube / Maps, control media and volume, manage notes and reminders, search files, lock the PC, and analyze the screen or camera.
- **Custom Voice Commands:** Configure phrase-to-reply and action routines in Settings (ships with `"Hey Jarvis"`).

### 6. Always Available: Mini Menu, Tray & Wake Word
- **Desktop Mini Menu:** Draggable always-on-top capsule showing status, time, screen analysis, microphone, and talk controls.
- **"Hey Jarvis" Wake Word:** Closing the main window minimizes JARVIS to the system tray while background wake listening stays active.
- **Start with Windows:** Optional background autostart at login (configurable in Settings or the tray menu).
- **Mobile Remote (LAN):** Connect a phone on the same Wi-Fi network via QR code to view status and send commands.

---

## Tech Stack

| Component | Technology |
| :--- | :--- |
| **Desktop Shell** | Electron 43 (Windows) |
| **Frontend** | React 19 (TypeScript) + Vite 8 |
| **3D Graphics** | Three.js + React Three Fiber + Drei |
| **AI & Vision** | Google Gemini REST API |
| **Text-to-Speech** | Gemini TTS (HD) + Microsoft Edge Neural TTS fallback |
| **UI Font** | Inter |

---

## Download (Windows)

Get the latest release from **[Releases](https://github.com/berkaysahin-dev/Shaz-Jarvis-AI/releases/latest)**:

- **`JARVIS.Setup.x.y.z.exe`**: Installer with Start menu and desktop shortcuts.
- **`JARVIS.x.y.z.exe`**: Portable build, runs without installation.

On first launch, enter your free [Google Gemini API key](https://aistudio.google.com/apikey) in Settings. Your key is stored locally on your machine.  
Since the binaries are not code-signed yet, Windows SmartScreen may show a prompt — click **More info › Run anyway**.

## Development Setup

### Prerequisites
- **Node.js** 18+
- **Google Gemini API Key** from [Google AI Studio](https://aistudio.google.com/)

### Run Locally

1. Clone the repository:
   ```bash
   git clone https://github.com/berkaysahin-dev/Shaz-Jarvis-AI.git
   cd Shaz-Jarvis-AI
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the app:
   ```bash
   BASLAT.bat
   ```
   Or run in dev mode:
   ```bash
   npm run electron:dev
   ```

### Mobile Remote Access (LAN)
1. Run `TELEFON.bat` (or `npm run dev -- --host`).
2. Open the local IP address on your phone or scan the QR code from the sidebar.

---

## Configuration

1. Launch JARVIS.
2. Open **Settings** from the sidebar.
3. Paste your **Google Gemini API Key** and save.

---

## Developer

**[Shaz Agency](https://shazagency.com)**  
Repository: [github.com/berkaysahin-dev/Shaz-Jarvis-AI](https://github.com/berkaysahin-dev/Shaz-Jarvis-AI)

## License

This project is licensed under the [MIT License](LICENSE).
