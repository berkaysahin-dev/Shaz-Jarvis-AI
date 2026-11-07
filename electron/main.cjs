const { app, BrowserWindow, ipcMain, Tray, Menu } = require('electron');
const path = require('path');
const http = require('http');
const os = require('os');
const crypto = require('crypto');

const isDev = process.env.NODE_ENV === 'development';

let mainWindow;
let tray = null;
// Cryptographically random per-session token. Every request to the LAN
// remote server must carry it, otherwise anyone on the same network (or any
// web page open in a local browser) could send commands to JARVIS.
const qrToken = crypto.randomBytes(16).toString('hex');
const PORT = 3001;
const MAX_BODY_BYTES = 4 * 1024;
const MAX_COMMAND_CHARS = 500;

function isValidToken(candidate) {
  if (typeof candidate !== 'string' || candidate.length !== qrToken.length) return false;
  return crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(qrToken));
}

function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return '127.0.0.1';
}

// Simple Mobile Web Server for QR Connection
const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const token = url.searchParams.get('token');

  if (!isValidToken(token)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden: scan the QR code shown in the JARVIS desktop app.');
    return;
  }

  if (url.pathname === '/api/command') {
    if (req.method !== 'POST' || !(req.headers['content-type'] || '').startsWith('application/json')) {
      res.writeHead(405);
      res.end();
      return;
    }
    let body = '';
    let tooLarge = false;
    req.on('data', chunk => {
      body += chunk;
      if (body.length > MAX_BODY_BYTES) {
        tooLarge = true;
        req.destroy();
      }
    });
    req.on('end', () => {
      if (tooLarge) return;
      try {
        const data = JSON.parse(body);
        const text = typeof data?.text === 'string' ? data.text.trim().slice(0, MAX_COMMAND_CHARS) : '';
        if (!text) {
          res.writeHead(400);
          res.end();
          return;
        }
        if (mainWindow) {
          mainWindow.webContents.send('mobile-command', { text });
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
      } catch (e) {
        res.writeHead(400);
        res.end();
      }
    });
    return;
  }

  // Serve simple Mobile Control Web App
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`
    <!DOCTYPE html>
    <html lang="tr">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>JARVIS Mobile Remote</title>
      <style>
        body { margin: 0; background: #0a0a0c; color: white; font-family: -apple-system, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; text-align: center; padding: 20px; box-sizing: border-box; }
        .card { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); padding: 30px; border-radius: 24px; backdrop-filter: blur(20px); width: 100%; max-width: 360px; }
        h1 { font-size: 24px; font-weight: 600; margin-bottom: 8px; letter-spacing: 2px; }
        p { color: rgba(255,255,255,0.6); font-size: 14px; margin-bottom: 24px; }
        input { width: 100%; padding: 14px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.15); background: rgba(0,0,0,0.4); color: white; font-size: 16px; box-sizing: border-box; margin-bottom: 12px; }
        button { width: 100%; padding: 14px; border-radius: 12px; border: none; background: white; color: black; font-weight: 600; font-size: 16px; cursor: pointer; }
        .status { margin-top: 16px; font-size: 12px; color: #34c759; }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>JARVIS</h1>
        <p>Telefondan Komut Gönder</p>
        <input type="text" id="cmd" placeholder="Komut yazın (örn: Merhaba)" />
        <button onclick="sendCmd()">Gönder</button>
        <div class="status" id="st">Bağlandı</div>
      </div>
      <script>
        function sendCmd() {
          const val = document.getElementById('cmd').value;
          if (!val) return;
          fetch('/api/command?token=${token}', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: val })
          }).then(() => {
            document.getElementById('st').innerText = 'Komut gönderildi!';
            document.getElementById('cmd').value = '';
            setTimeout(() => document.getElementById('st').innerText = 'Bağlandı', 2000);
          });
        }
      </script>
    </body>
    </html>
  `);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[Mobile Server] Running at http://${getLocalIp()}:${PORT}`);
});

function bringWindowToFront() {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.setAlwaysOnTop(true);
    mainWindow.focus();
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.setAlwaysOnTop(false);
      }
    }, 300);
  }
}

function createTray() {
  try {
    const iconPath = path.join(__dirname, 'icon.ico');
    tray = new Tray(iconPath);
    const contextMenu = Menu.buildFromTemplate([
      {
        label: '🤖 JARVIS 2.0 Aç',
        click: () => bringWindowToFront()
      },
      {
        label: '🎙️ Dinlemeyi Başlat (Alt+Space)',
        click: () => {
          bringWindowToFront();
          if (mainWindow) mainWindow.webContents.send('trigger-voice-listening');
        }
      },
      { type: 'separator' },
      {
        label: 'Çıkış',
        click: () => {
          app.isQuitting = true;
          app.quit();
        }
      }
    ]);

    tray.setToolTip('JARVIS 2.0 — Arka Planda Dinlemede');
    tray.setContextMenu(contextMenu);
    tray.on('click', () => {
      bringWindowToFront();
    });
  } catch (e) {
    console.warn('[Tray Error]:', e);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 450,
    height: 700,
    minWidth: 350,
    minHeight: 500,
    frame: false,
    backgroundColor: '#050505',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false,
      backgroundThrottling: false
    },
    icon: path.join(__dirname, 'icon.ico'),
    titleBarStyle: 'hidden',
  });

  mainWindow.maximize();

  if (isDev) {
    mainWindow.loadURL('https://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Handle window controls via IPC
  ipcMain.on('window-minimize', () => mainWindow.minimize());
  ipcMain.on('window-maximize', () => {
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  });
  ipcMain.on('window-close', () => mainWindow.close());
  ipcMain.on('show-and-focus-window', () => bringWindowToFront());
  ipcMain.handle('focus-app', () => {
    bringWindowToFront();
    return true;
  });

  // IPC for QR Mobile connection info
  ipcMain.handle('get-qr-info', () => {
    return {
      ip: getLocalIp(),
      port: PORT,
      token: qrToken,
      url: `http://${getLocalIp()}:${PORT}?token=${qrToken}`
    };
  });

  // Local Memory Path
  const memoryPath = path.join(app.getPath('userData'), 'jarvis_memory.json');

  // Tool Execution IPC Handler
  ipcMain.handle('execute-tool', async (event, { name, args }) => {
    const { exec } = require('child_process');
    const fs = require('fs');

    console.log(`[Electron Tool] Executing ${name} with args:`, args);

    if (name === 'open_app') {
      const appName = (args.appName || '').toLowerCase();
      let cmd = '';

      if (appName.includes('chrome') || appName.includes('tarayıcı') || appName.includes('browser') || appName.includes('google') || appName.includes('internet')) {
        cmd = 'start https://www.google.com';
      } else if (appName.includes('youtube')) {
        cmd = 'start https://www.youtube.com';
      } else if (appName.includes('spotify')) {
        cmd = 'start spotify';
      } else if (appName.includes('code') || appName.includes('vscode')) {
        cmd = 'code .';
      } else if (appName.includes('notepad') || appName.includes('not defteri')) {
        cmd = 'start notepad';
      } else if (appName.includes('download') || appName.includes('indirilen')) {
        cmd = 'explorer %userprofile%\\Downloads';
      } else if (appName.includes('desktop') || appName.includes('masaüstü')) {
        cmd = 'explorer %userprofile%\\Desktop';
      } else if (appName.includes('calc') || appName.includes('hesap makinesi')) {
        cmd = 'start calc';
      } else {
        // Never pass free-form (AI- or remote-provided) text to the shell:
        // `start ${appName}` allowed command injection (e.g. "calc & del ...").
        return `${appName} için tanımlı bir kısayol yok. Desteklenenler: Chrome, YouTube, Spotify, VS Code, Not Defteri, Hesap Makinesi, İndirilenler, Masaüstü.`;
      }

      return new Promise((resolve) => {
        exec(cmd, (err) => {
          if (err) resolve(`Tarayıcı / Uygulama başlatıldı.`);
          else resolve(`${appName} başarıyla açıldı.`);
        });
      });
    }

    if (name === 'save_memory') {
      try {
        let memory = {};
        if (fs.existsSync(memoryPath)) {
          memory = JSON.parse(fs.readFileSync(memoryPath, 'utf-8'));
        }
        memory[args.key] = { value: args.value, timestamp: new Date().toISOString() };
        fs.writeFileSync(memoryPath, JSON.stringify(memory, null, 2));
        return `Hafızaya kaydedildi: ${args.key} = ${args.value}`;
      } catch (e) {
        return `Hafıza hatası: ${e.message}`;
      }
    }

    if (name === 'get_memory') {
      try {
        if (!fs.existsSync(memoryPath)) return "Hafızada henüz kayıtlı bilgi yok.";
        const memory = JSON.parse(fs.readFileSync(memoryPath, 'utf-8'));
        return JSON.stringify(memory);
      } catch (e) {
        return "Hafıza okunamadı.";
      }
    }

    if (name === 'search_file') {
      const fileName = (args.fileName || args.query || '').toLowerCase();
      const targetFolder = (args.targetFolder || '').toLowerCase();
      const userHome = app.getPath('home');

      let searchPaths = [
        path.join(userHome, 'Downloads'),
        path.join(userHome, 'Desktop'),
        path.join(userHome, 'Documents')
      ];

      if (targetFolder.includes('download') || targetFolder.includes('indirilen')) {
        searchPaths = [path.join(userHome, 'Downloads')];
      } else if (targetFolder.includes('desktop') || targetFolder.includes('masaüstü')) {
        searchPaths = [path.join(userHome, 'Desktop')];
      } else if (targetFolder.includes('document') || targetFolder.includes('belge')) {
        searchPaths = [path.join(userHome, 'Documents')];
      }

      for (const dirPath of searchPaths) {
        try {
          if (fs.existsSync(dirPath)) {
            const files = fs.readdirSync(dirPath);
            // Never auto-launch executables/scripts found by a fuzzy name match.
            const blocked = /\.(exe|msi|bat|cmd|com|scr|ps1|vbs|vbe|js|jse|wsf|wsh|hta|lnk|pif|cpl|jar|reg)$/i;
            const found = fileName && files.find(f => f.toLowerCase().includes(fileName) && !blocked.test(f));
            if (found) {
              const fullPath = path.join(dirPath, found);
              exec(`start "" "${fullPath}"`);
              return `${found} dosyası bulundu ve açıldı.`;
            }
          }
        } catch(e) {}
      }
      return `${fileName} adlı dosya veya klasör bulunamadı.`;
    }

    if (name === 'set_reminder') {
      const title = args.title || 'Anımsatıcı';
      const delaySeconds = parseInt(args.delaySeconds || 10, 10);

      setTimeout(() => {
        const { Notification } = require('electron');
        if (Notification.isSupported()) {
          new Notification({
            title: '🤖 JARVIS Anımsatıcı',
            body: title
          }).show();
        }
        if (mainWindow) {
          mainWindow.webContents.send('reminder-triggered', { title });
        }
      }, delaySeconds * 1000);

      return `Zamanlayıcı ayarlandı: ${delaySeconds} saniye sonra "${title}" hatırlatılacak.`;
    }

    if (name === 'control_media') {
      const action = (args.action || '').toLowerCase();
      let key = '';
      if (action.includes('play') || action.includes('pause') || action.includes('durdur') || action.includes('başlat')) key = '[char]179';
      else if (action.includes('next') || action.includes('sonraki') || action.includes('geç')) key = '[char]176';
      else if (action.includes('prev') || action.includes('önceki')) key = '[char]177';
      else if (action.includes('volup') || action.includes('yükselt') || action.includes('arttır')) key = '[char]175';
      else if (action.includes('voldown') || action.includes('kıs') || action.includes('azalt')) key = '[char]174';

      if (key) {
        const psCmd = `powershell -c "$wshell = New-Object -ComObject WScript.Shell; $wshell.SendKeys('${key}')"`;
        exec(psCmd);
        return `Medya kontrolü uygulandı: ${action}`;
      }
      return 'Medya aksiyonu anlaşılamadı.';
    }

    if (name === 'save_note') {
      const notesPath = path.join(app.getPath('userData'), 'jarvis_notes.json');
      try {
        let notes = [];
        if (fs.existsSync(notesPath)) {
          notes = JSON.parse(fs.readFileSync(notesPath, 'utf-8'));
        }
        const newNote = { id: Date.now().toString(), text: args.text, date: new Date().toLocaleString('tr-TR') };
        notes.unshift(newNote);
        fs.writeFileSync(notesPath, JSON.stringify(notes, null, 2));
        return `Not kaydedildi: "${args.text}"`;
      } catch (e) {
        return `Not kaydetme hatası: ${e.message}`;
      }
    }

    if (name === 'get_notes') {
      const notesPath = path.join(app.getPath('userData'), 'jarvis_notes.json');
      try {
        if (!fs.existsSync(notesPath)) return JSON.stringify([]);
        return fs.readFileSync(notesPath, 'utf-8');
      } catch (e) {
        return JSON.stringify([]);
      }
    }

    if (name === 'delete_note') {
      const notesPath = path.join(app.getPath('userData'), 'jarvis_notes.json');
      try {
        if (fs.existsSync(notesPath)) {
          let notes = JSON.parse(fs.readFileSync(notesPath, 'utf-8'));
          notes = notes.filter(n => n.id !== args.id);
          fs.writeFileSync(notesPath, JSON.stringify(notes, null, 2));
        }
        return 'Not silindi.';
      } catch (e) {
        return 'Not silinemedi.';
      }
    }

    return "Bilinmeyen sistem fonksiyonu.";
  });

  // Additional IPC Listeners for System Metrics & Screen Capture
  ipcMain.handle('get-system-stats', async () => {
    const os = require('os');
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const memUsage = Math.round((usedMem / totalMem) * 100);

    const cpus = os.cpus();
    let userTicks = 0, sysTicks = 0, idleTicks = 0;
    cpus.forEach(cpu => {
      userTicks += cpu.times.user;
      sysTicks += cpu.times.sys;
      idleTicks += cpu.times.idle;
    });
    const totalTicks = userTicks + sysTicks + idleTicks;
    const cpuUsage = Math.min(100, Math.round(((userTicks + sysTicks) / (totalTicks || 1)) * 100));

    return {
      cpuUsage,
      memUsage,
      usedMemGB: (usedMem / (1024 ** 3)).toFixed(1),
      totalMemGB: (totalMem / (1024 ** 3)).toFixed(1)
    };
  });

  ipcMain.handle('capture-screen', async () => {
    const { desktopCapturer } = require('electron');
    try {
      const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1280, height: 720 } });
      if (sources.length > 0) {
        return sources[0].thumbnail.toDataURL();
      }
    } catch(e) {
      console.error('Screen capture error:', e);
    }
    return null;
  });

  ipcMain.handle('synthesize-speech', async (_event, { text, voice }) => {
    try {
      const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');
      const tts = new MsEdgeTTS();
      const selectedVoice = voice || 'tr-TR-AhmetNeural'; // Natural human Turkish assistant voice
      await tts.setMetadata(selectedVoice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
      
      const { audioStream } = tts.toStream(text);
      return new Promise((resolve, reject) => {
        const chunks = [];
        audioStream.on('data', chunk => chunks.push(chunk));
        audioStream.on('end', () => {
          const buffer = Buffer.concat(chunks);
          resolve(buffer.toString('base64'));
        });
        audioStream.on('error', err => reject(err));
      });
    } catch (e) {
      console.error('[Edge TTS Error]:', e);
      return null;
    }
  });

  // Only trust the self-signed mkcert certificate of the local Vite dev server.
  // Accepting every invalid certificate would allow MITM of Gemini API traffic.
  app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
    let host = '';
    try { host = new URL(url).hostname; } catch (e) { /* ignore */ }
    if (isDev && (host === 'localhost' || host === '127.0.0.1')) {
      event.preventDefault();
      callback(true);
      return;
    }
    callback(false);
  });
}

app.whenReady().then(() => {
  createWindow();
  createTray();

  // Register Global Hotkey (Alt+Space)
  const { globalShortcut } = require('electron');
  globalShortcut.register('Alt+Space', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
      mainWindow.webContents.send('trigger-voice-listening');
    }
  });

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('will-quit', () => {
  const { globalShortcut } = require('electron');
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

