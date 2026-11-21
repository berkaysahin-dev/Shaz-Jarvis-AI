const { app, BrowserWindow, ipcMain, Tray, Menu, nativeTheme } = require('electron');
const path = require('path');
const http = require('http');
const os = require('os');
const crypto = require('crypto');

const isDev = process.env.NODE_ENV === 'development';

let mainWindow;
let tray = null;
let lastCpuSample = null;
let cpuLoad = 0;

// Sample CPU load on a fixed 1s clock, independent of how often the UI asks.
// Absolute tick counters only give the since-boot average, so compare samples.
function sampleCpu() {
  let busy = 0, total = 0;
  os.cpus().forEach(cpu => {
    const t = cpu.times;
    busy += t.user + t.nice + t.sys + t.irq;
    total += t.user + t.nice + t.sys + t.irq + t.idle;
  });
  if (lastCpuSample) {
    const dTotal = total - lastCpuSample.total;
    if (dTotal > 0) {
      const raw = Math.max(0, Math.min(100, ((busy - lastCpuSample.busy) / dTotal) * 100));
      // Light smoothing so momentary spikes don't make the gauge twitch
      cpuLoad = cpuLoad === 0 ? raw : cpuLoad * 0.6 + raw * 0.4;
    }
  }
  lastCpuSample = { busy, total };
}
sampleCpu();
setInterval(sampleCpu, 1000).unref();
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

// Started on demand (Connect Phone), not at launch: opening a network port at startup
// made Windows Firewall ask for permission every time JARVIS was opened.
let mobileServerReady = null;
function ensureMobileServer() {
  if (!mobileServerReady) {
    mobileServerReady = new Promise((resolve) => {
      server.once('error', (err) => {
        console.warn('[Mobile Server] Could not start:', err.message);
        mobileServerReady = null;
        resolve(false);
      });
      server.listen(PORT, '0.0.0.0', () => {
        console.log(`[Mobile Server] Running at http://${getLocalIp()}:${PORT}`);
        resolve(true);
      });
    });
  }
  return mobileServerReady;
}

/* --------------------------------------------------------------------------
   App settings that the main process needs before any page has loaded
   -------------------------------------------------------------------------- */

const fs = require('fs');
const startHidden = process.argv.includes('--hidden');
let appSettings = { openAtLogin: true, miniBar: true, hideNoticeShown: false };
const settingsFile = () => path.join(app.getPath('userData'), 'jarvis_settings.json');

function loadAppSettings() {
  try { Object.assign(appSettings, JSON.parse(fs.readFileSync(settingsFile(), 'utf-8'))); } catch { /* first run */ }
}

function saveAppSettings() {
  try { fs.writeFileSync(settingsFile(), JSON.stringify(appSettings, null, 2)); } catch (e) { console.warn('[Settings]', e.message); }
}

// Start with Windows (hidden in the tray) so "Hey Jarvis" works right after boot
function applyLoginItem() {
  if (!app.isPackaged) return; // dev runs would register electron.exe itself
  // A portable build runs from a temp copy; register the exe the user actually has
  const exe = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
  app.setLoginItemSettings({ openAtLogin: !!appSettings.openAtLogin, path: exe, args: ['--hidden'] });
}

/* --------------------------------------------------------------------------
   Desktop mini menu: a small always-on-top pill at the top of the screen
   -------------------------------------------------------------------------- */

let miniWindow = null;
let miniSize = { width: 300, height: 40 };
let lastJarvisState = null;

// The menu's position is kept as its top-center point, so it stays put while its width changes
function placeMini() {
  if (!miniWindow || miniWindow.isDestroyed()) return;
  const { screen } = require('electron');
  const saved = appSettings.miniPos;
  const display = saved ? screen.getDisplayNearestPoint({ x: Math.round(saved.cx), y: Math.round(saved.y) }) : screen.getPrimaryDisplay();
  const wa = display.workArea;
  const cx = saved ? saved.cx : wa.x + wa.width / 2;
  const top = saved ? saved.y : wa.y + 6;
  // Keep it fully on screen (e.g. after a monitor was unplugged)
  const x = Math.min(Math.max(wa.x, Math.round(cx - miniSize.width / 2)), wa.x + wa.width - miniSize.width);
  const y = Math.min(Math.max(wa.y, Math.round(top)), wa.y + wa.height - miniSize.height);
  miniWindow.setBounds({ x, y, width: miniSize.width, height: miniSize.height });
}

let miniWatchdog = null;

function createMiniBar() {
  if (miniWindow && !miniWindow.isDestroyed()) return;
  miniWindow = new BrowserWindow({
    ...miniSize,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    alwaysOnTop: true,
    // Must be focusable: Windows drops clicks and drags on a non-activatable window
    // while another app is in front (the buttons only worked over the bare desktop)
    focusable: true,
    show: false,
    backgroundColor: '#00000000',
    webPreferences: { nodeIntegration: true, contextIsolation: false, backgroundThrottling: false, autoplayPolicy: 'no-user-gesture-required' },
  });
  miniWindow.setAlwaysOnTop(true, 'floating');
  // Stay visible: "Show desktop" (Win+D) or another topmost window can hide or cover it
  miniWindow.on('hide', () => setTimeout(() => {
    if (appSettings.miniBar && miniWindow && !miniWindow.isDestroyed()) miniWindow.showInactive();
  }, 300));
  miniWindow.webContents.on('render-process-gone', () => {
    destroyMiniBar();
    if (appSettings.miniBar) setTimeout(createMiniBar, 1000);
  });
  clearInterval(miniWatchdog);
  miniWatchdog = setInterval(() => {
    if (!appSettings.miniBar || !miniWindow || miniWindow.isDestroyed()) return;
    if (!miniWindow.isVisible()) miniWindow.showInactive();
    miniWindow.setAlwaysOnTop(true, 'floating');
  }, 3000);
  if (isDev) miniWindow.loadURL('https://localhost:5173/#mini');
  else miniWindow.loadFile(path.join(__dirname, '../dist/index.html'), { hash: 'mini' });
  miniWindow.webContents.on('did-finish-load', () => {
    if (lastJarvisState) miniWindow.webContents.send('jarvis-state', lastJarvisState);
  });
  miniWindow.once('ready-to-show', () => { placeMini(); miniWindow.showInactive(); });
  miniWindow.on('closed', () => { miniWindow = null; });
}

function destroyMiniBar() {
  clearInterval(miniWatchdog);
  miniWatchdog = null;
  if (miniWindow && !miniWindow.isDestroyed()) miniWindow.destroy();
  miniWindow = null;
}

let mainEverShown = false;
function bringWindowToFront() {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    if (!mainEverShown) { mainWindow.maximize(); mainEverShown = true; }
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

function refreshTrayMenu() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate(trayTemplate()));
}

function trayTemplate() {
  return [
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
      {
        label: 'Masaüstü mini menü',
        type: 'checkbox',
        checked: !!appSettings.miniBar,
        click: (item) => {
          appSettings.miniBar = item.checked;
          saveAppSettings();
          if (item.checked) createMiniBar(); else destroyMiniBar();
          if (mainWindow) mainWindow.webContents.send('app-settings-changed', appSettings);
        }
      },
      {
        label: 'Mini menüyü ortaya al',
        enabled: !!appSettings.miniBar,
        click: () => { delete appSettings.miniPos; saveAppSettings(); placeMini(); }
      },
      {
        label: 'Bilgisayar açılınca başlat',
        type: 'checkbox',
        checked: !!appSettings.openAtLogin,
        enabled: app.isPackaged,
        click: (item) => {
          appSettings.openAtLogin = item.checked;
          saveAppSettings();
          applyLoginItem();
          if (mainWindow) mainWindow.webContents.send('app-settings-changed', appSettings);
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
  ];
}

function createTray() {
  try {
    tray = new Tray(path.join(__dirname, 'icon.ico'));
    tray.setToolTip('JARVIS — “Hey Jarvis” deyin');
    refreshTrayMenu();
    tray.on('click', () => {
      bringWindowToFront();
    });
  } catch (e) {
    console.warn('[Tray Error]:', e);
  }
}

function createWindow() {
  // Dark appearance so the native Windows 11 material renders with a dark tint
  nativeTheme.themeSource = 'dark';
  const supportsMaterial = process.platform === 'win32' && Number(os.release().split('.')[2] || 0) >= 22621;

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    // The layout adapts down to phone-like widths, so the window can be snapped small
    minWidth: 380,
    minHeight: 560,
    frame: false,
    // Windows 11 22H2+: let the system Mica material show through the translucent sidebars
    ...(supportsMaterial
      ? { backgroundColor: '#00000000', backgroundMaterial: 'mica' }
      : { backgroundColor: '#050505' }),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false,
      backgroundThrottling: false,
      // The window is often hidden (tray, "Hey Jarvis", mini menu): audio must start
      // without a click inside it, or the mic and voice stay silently suspended
      autoplayPolicy: 'no-user-gesture-required',
    },
    icon: path.join(__dirname, 'icon.ico'),
    titleBarStyle: 'hidden',
    show: false,
  });

  // Started with Windows: stay in the tray and keep listening for "Hey Jarvis"
  mainWindow.once('ready-to-show', () => {
    if (!startHidden) bringWindowToFront();
  });

  // Closing the window keeps JARVIS running in the tray, so the wake word still works
  mainWindow.on('close', (e) => {
    if (app.isQuitting) return;
    e.preventDefault();
    mainWindow.hide();
    if (!appSettings.hideNoticeShown) {
      appSettings.hideNoticeShown = true;
      saveAppSettings();
      try {
        const { Notification } = require('electron');
        new Notification({
          title: 'JARVIS arka planda çalışıyor',
          body: '“Hey Jarvis” deyin ya da Alt+Space’e basın. Tamamen kapatmak için tepsi simgesinden Çıkış’ı seçin.',
        }).show();
      } catch { /* notifications unavailable */ }
    }
  });

  // Microphone/camera for our own UI only; everything else is refused
  const ses = mainWindow.webContents.session;
  ses.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(['media', 'audioCapture', 'videoCapture', 'notifications', 'clipboard-sanitized-write'].includes(permission));
  });
  ses.setPermissionCheckHandler((_wc, permission) => ['media', 'audioCapture', 'videoCapture', 'notifications'].includes(permission));

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

  // Status from the main page, mirrored by the desktop mini menu
  ipcMain.on('jarvis-state', (_e, state) => {
    lastJarvisState = state;
    if (miniWindow && !miniWindow.isDestroyed()) miniWindow.webContents.send('jarvis-state', state);
  });
  ipcMain.on('jarvis-level', (_e, level) => {
    if (miniWindow && !miniWindow.isDestroyed()) miniWindow.webContents.send('jarvis-level', level);
  });
  ipcMain.on('mini-action', (_e, action) => {
    if (action === 'open') bringWindowToFront();
    else if (action === 'listen' && mainWindow) mainWindow.webContents.send('mini-listen');
    else if (action === 'stop' && mainWindow) mainWindow.webContents.send('mini-stop');
    else if (action === 'mute' && mainWindow) mainWindow.webContents.send('mini-mute');
    else if (action === 'screen' && mainWindow) mainWindow.webContents.send('mini-screen');
    else if (action === 'center') {
      delete appSettings.miniPos;
      saveAppSettings();
      placeMini();
    } else if (action === 'hide') {
      appSettings.miniBar = false;
      saveAppSettings();
      destroyMiniBar();
      refreshTrayMenu();
      if (mainWindow) mainWindow.webContents.send('app-settings-changed', appSettings);
    }
  });
  // Dragging the mini menu: the page sends how far the pointer moved since the last event
  ipcMain.on('mini-move', (_e, d) => {
    if (!miniWindow || miniWindow.isDestroyed()) return;
    const dx = Math.round(Number(d?.dx) || 0);
    const dy = Math.round(Number(d?.dy) || 0);
    const b = miniWindow.getBounds();
    miniWindow.setBounds({ x: b.x + dx, y: b.y + dy, width: b.width, height: b.height });
  });
  ipcMain.on('mini-move-end', () => {
    if (!miniWindow || miniWindow.isDestroyed()) return;
    const b = miniWindow.getBounds();
    appSettings.miniPos = { cx: b.x + b.width / 2, y: b.y };
    saveAppSettings();
    placeMini(); // snaps back inside the screen if dropped partly off it
  });

  ipcMain.on('mini-resize', (_e, size) => {
    const w = Math.max(120, Math.min(640, Math.round(Number(size?.width) || 300)));
    const h = Math.max(32, Math.min(160, Math.round(Number(size?.height) || 40)));
    if (w === miniSize.width && h === miniSize.height) return;
    miniSize = { width: w, height: h };
    placeMini();
  });

  ipcMain.handle('get-app-settings', () => ({
    openAtLogin: !!appSettings.openAtLogin,
    miniBar: !!appSettings.miniBar,
    canAutoStart: app.isPackaged,
  }));
  ipcMain.handle('set-app-settings', (_e, patch) => {
    if (typeof patch?.openAtLogin === 'boolean') { appSettings.openAtLogin = patch.openAtLogin; applyLoginItem(); }
    if (typeof patch?.miniBar === 'boolean') {
      appSettings.miniBar = patch.miniBar;
      if (patch.miniBar) createMiniBar(); else destroyMiniBar();
    }
    saveAppSettings();
    refreshTrayMenu();
    return { openAtLogin: !!appSettings.openAtLogin, miniBar: !!appSettings.miniBar, canAutoStart: app.isPackaged };
  });
  ipcMain.handle('focus-app', () => {
    bringWindowToFront();
    return true;
  });

  // IPC for QR Mobile connection info
  ipcMain.handle('get-qr-info', async () => {
    await ensureMobileServer();
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
      const appName = String(args.appName || '').toLowerCase();
      // Fixed commands only. Never pass free-form (AI- or remote-provided) text to the
      // shell: `start ${appName}` allowed command injection (e.g. "calc & del ...").
      const apps = [
        { keys: ['youtube'], cmd: 'start https://www.youtube.com', label: 'YouTube' },
        { keys: ['chrome', 'tarayıcı', 'browser', 'google', 'internet'], cmd: 'start https://www.google.com', label: 'Tarayıcı' },
        { keys: ['spotify'], cmd: 'start spotify:', label: 'Spotify' },
        { keys: ['vscode', 'code'], cmd: 'code', label: 'VS Code' },
        { keys: ['notepad', 'not defteri'], cmd: 'start notepad', label: 'Not Defteri' },
        { keys: ['calc', 'hesap makinesi'], cmd: 'start calc', label: 'Hesap Makinesi' },
        { keys: ['downloads', 'download', 'indirilen'], cmd: 'explorer "%userprofile%\\Downloads"', label: 'İndirilenler' },
        { keys: ['desktop', 'masaüstü'], cmd: 'explorer "%userprofile%\\Desktop"', label: 'Masaüstü' },
        { keys: ['documents', 'belge'], cmd: 'explorer "%userprofile%\\Documents"', label: 'Belgeler' },
        { keys: ['explorer', 'dosya gezgini'], cmd: 'explorer', label: 'Dosya Gezgini' },
        { keys: ['settings', 'ayarlar'], cmd: 'start ms-settings:', label: 'Ayarlar' },
        { keys: ['task_manager', 'görev yöneticisi'], cmd: 'start taskmgr', label: 'Görev Yöneticisi' },
        { keys: ['paint'], cmd: 'start mspaint', label: 'Paint' },
        { keys: ['terminal'], cmd: 'start wt || start cmd', label: 'Terminal' },
        { keys: ['camera_app', 'kamera'], cmd: 'start microsoft.windows.camera:', label: 'Kamera' },
        { keys: ['mail', 'posta'], cmd: 'start outlookmail:', label: 'Posta' },
        { keys: ['calendar', 'takvim'], cmd: 'start outlookcal:', label: 'Takvim' },
      ];
      const match = apps.find(a => a.keys.some(k => appName === k || appName.includes(k)));
      if (!match) {
        return `${appName} için tanımlı bir kısayol yok.`;
      }
      return new Promise((resolve) => {
        exec(match.cmd, { windowsHide: true }, (err) => {
          resolve(err ? `${match.label} açılamadı.` : `${match.label} açıldı.`);
        });
      });
    }

    if (name === 'web_search') {
      const { shell } = require('electron');
      const query = String(args.query || '').slice(0, 300);
      const q = encodeURIComponent(query);
      const sites = {
        google: `https://www.google.com/search?q=${q}`,
        youtube: `https://www.youtube.com/results?search_query=${q}`,
        maps: `https://www.google.com/maps/search/${q}`,
        wikipedia: `https://tr.wikipedia.org/w/index.php?search=${q}`,
        translate: `https://translate.google.com/?sl=auto&tl=tr&text=${q}`,
      };
      const site = Object.prototype.hasOwnProperty.call(sites, args.site) ? args.site : 'google';
      await shell.openExternal(sites[site]);
      return `"${query}" için ${site === 'youtube' ? 'YouTube' : site === 'maps' ? 'haritada' : 'tarayıcıda'} arama açıldı.`;
    }

    if (name === 'lock_screen') {
      exec('rundll32.exe user32.dll,LockWorkStation', { windowsHide: true });
      return 'Bilgisayar kilitlendi.';
    }

    if (name === 'get_system_status') {
      const total = os.totalmem();
      const used = total - os.freemem();
      const hours = Math.floor(os.uptime() / 3600);
      return `İşlemci yükü %${Math.round(cpuLoad)}, ${os.cpus().length} çekirdek. Bellek %${Math.round((used / total) * 100)} dolu (${(used / 1024 ** 3).toFixed(1)} / ${(total / 1024 ** 3).toFixed(1)} GB). Sistem ${hours} saattir açık.`;
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
      const action = String(args.action || '').toLowerCase();
      // Virtual-key codes for the media / volume keys
      const keys = [
        { match: ['play', 'pause', 'durdur', 'başlat'], code: 179, label: 'Oynat/duraklat' },
        { match: ['next', 'sonraki', 'geç'], code: 176, label: 'Sonraki parça' },
        { match: ['prev', 'önceki'], code: 177, label: 'Önceki parça' },
        { match: ['mute', 'sessiz'], code: 173, label: 'Ses kapatıldı/açıldı' },
        { match: ['volume_up', 'volup', 'yükselt', 'arttır'], code: 175, label: 'Ses yükseltildi', repeat: 3 },
        { match: ['volume_down', 'voldown', 'kıs', 'azalt'], code: 174, label: 'Ses kısıldı', repeat: 3 },
      ];
      const k = keys.find(x => x.match.some(m => action.includes(m)));
      if (k) {
        const presses = Array(k.repeat || 1).fill(`$w.SendKeys([char]${k.code})`).join('; ');
        exec(`powershell -NoProfile -Command "$w = New-Object -ComObject WScript.Shell; ${presses}"`, { windowsHide: true });
        return `${k.label}.`;
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
    const cpuUsage = Math.round(cpuLoad);

    return {
      cpuUsage,
      cores: cpus.length,
      memUsage,
      usedMemGB: (usedMem / (1024 ** 3)).toFixed(1),
      totalMemGB: (totalMem / (1024 ** 3)).toFixed(1)
    };
  });

  // Screenshot of what the user is looking at: the monitor under the mouse, with JARVIS's
  // own windows left out (excluded from capture, so the page behind them is what's seen).
  ipcMain.handle('capture-screen', async () => {
    const { desktopCapturer, screen } = require('electron');
    const ours = [mainWindow, miniWindow].filter(w => w && !w.isDestroyed() && w.isVisible());
    try {
      ours.forEach(w => w.setContentProtection(true));
      await new Promise(r => setTimeout(r, 120)); // let the compositor apply the exclusion

      const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
      // ~1600 px wide is plenty for reading text and much faster to send than full 4K
      const scale = Math.min(1, 1600 / (display.size.width * display.scaleFactor)) * display.scaleFactor;
      const thumbnailSize = { width: Math.round(display.size.width * scale), height: Math.round(display.size.height * scale) };
      const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize });
      const source = sources.find(s => String(s.display_id) === String(display.id)) || sources[0];
      if (!source || source.thumbnail.isEmpty()) return null;
      // JPEG is ~5–10× smaller than PNG, so the upload to Gemini is quick
      return `data:image/jpeg;base64,${source.thumbnail.toJPEG(82).toString('base64')}`;
    } catch (e) {
      console.error('Screen capture error:', e);
      return null;
    } finally {
      ours.forEach(w => { if (!w.isDestroyed()) w.setContentProtection(false); });
    }
  });

  ipcMain.handle('synthesize-speech', async (_event, { text, voice, rate, pitch }) => {
    const allowed = /^[a-z]{2}-[A-Z]{2}-[A-Za-z]+Neural$/;
    const selectedVoice = allowed.test(voice || '') ? voice : 'tr-TR-AhmetNeural';
    const pct = (v) => {
      const n = Math.round(((Number(v) || 1) - 1) * 100);
      return `${n >= 0 ? '+' : ''}${Math.max(-50, Math.min(50, n))}%`;
    };
    try {
      const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');
      const tts = new MsEdgeTTS();
      // 96 kbps instead of 48 kbps: clearly cleaner voice for a few extra KB
      await tts.setMetadata(selectedVoice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
      const { audioStream } = tts.toStream(String(text || '').slice(0, 3000), { rate: pct(rate), pitch: pct(pitch) });
      return await new Promise((resolve, reject) => {
        const chunks = [];
        const timer = setTimeout(() => reject(new Error('TTS timeout')), 15000);
        audioStream.on('data', chunk => chunks.push(chunk));
        audioStream.on('end', () => {
          clearTimeout(timer);
          const buffer = Buffer.concat(chunks);
          resolve(buffer.length ? buffer.toString('base64') : null);
        });
        audioStream.on('error', err => { clearTimeout(timer); reject(err); });
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

// One JARVIS at a time: starting it again (or at login) just shows the running one
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => bringWindowToFront());
}

app.on('before-quit', () => { app.isQuitting = true; });

if (gotSingleInstanceLock) app.whenReady().then(() => {
  loadAppSettings();
  applyLoginItem();
  createWindow();
  createTray();
  if (appSettings.miniBar) createMiniBar();

  const { screen } = require('electron');
  screen.on('display-metrics-changed', placeMini);
  screen.on('display-added', placeMini);
  screen.on('display-removed', placeMini);

  // Register Global Hotkey (Alt+Space)
  const { globalShortcut } = require('electron');
  globalShortcut.register('Alt+Space', () => {
    if (mainWindow) {
      bringWindowToFront();
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

