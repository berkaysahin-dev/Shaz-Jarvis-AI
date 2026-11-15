import { useState, useEffect, useRef, type ReactNode, type CSSProperties } from 'react';
import { motion, AnimatePresence, MotionConfig, useSpring, useTransform } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import { Canvas } from '@react-three/fiber';
import { Orb } from './components/Orb';
import { useJarvis, type JarvisLanguage } from './hooks/useJarvis';

// Apple-style ring gauge (Activity / Batteries widget look)
function levelColor(value: number) {
  if (value >= 90) return '#ff453a';
  if (value >= 70) return '#ff9f0a';
  return '#30d158';
}

function Gauge({ value, label, detail }: { value: number; label: string; detail: string }) {
  const size = 58;
  const stroke = 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value));
  const color = levelColor(pct);

  // One spring drives both the arc and the number, so they always agree
  // and glide between samples instead of jumping.
  const spring = useSpring(pct, { bounce: 0, duration: 1.2 });
  useEffect(() => { spring.set(pct); }, [pct, spring]);
  const dashOffset = useTransform(spring, v => c * (1 - v / 100));
  const shown = useTransform(spring, v => Math.round(v));

  return (
    <div className="gauge">
      <div className="gauge-ring" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeOpacity={0.18} strokeWidth={stroke} />
          <motion.circle
            className="gauge-arc"
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            style={{ strokeDashoffset: dashOffset }}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </svg>
        <span className="gauge-value"><motion.span>{shown}</motion.span><small>%</small></span>
      </div>
      <span className="gauge-label">{label}</span>
      <span className="gauge-detail">{detail}</span>
    </div>
  );
}

export function App() {
  // Read persisted settings synchronously so the setup sheet never flashes on launch
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('jarvis_api_key') || '');
  const [language, setLanguage] = useState<JarvisLanguage>(() => (localStorage.getItem('jarvis_language') as JarvisLanguage) || 'tr-TR');
  const [showSettings, setShowSettings] = useState(() => !localStorage.getItem('jarvis_api_key'));
  const [hasSavedKey, setHasSavedKey] = useState(() => !!localStorage.getItem('jarvis_api_key'));
  const [showQR, setShowQR] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [showChat, setShowChat] = useState(true);
  const [activeApp, setActiveApp] = useState<string | null>(null);
  const [qrData, setQrData] = useState<{ url: string; ip: string; port: number } | null>(null);
  const [textInput, setTextInput] = useState('');
  const [notes, setNotes] = useState<{ id: string; text: string; date: string }[]>([]);
  const [newNoteText, setNewNoteText] = useState('');
  
  // Real-time system performance & historical sparkline tracking
  const [systemStats, setSystemStats] = useState<{ cpuUsage: number; memUsage: number; usedMemGB: string; totalMemGB: string; cores?: number }>({
    cpuUsage: 0,
    memUsage: 0,
    usedMemGB: '0.0',
    totalMemGB: '0.0'
  });

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const { 
    status, 
    audioLevel,
    conversation,
    currentResponse,
    liveTranscript,
    errorMessage,
    isMuted,
    isAlwaysListening,
    toggleAlwaysListening,
    voicePitch,
    setVoicePitch,
    voiceRate,
    setVoiceRate,
    toggleMute,
    startListening,
    stopListening,
    stopVoiceChat,
    sendTextMessage,
    sendImageToGemini
  } = useJarvis(apiKey, language);

  // Global Escape Key listener to stop voice chat & speech immediately
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && (status === 'speaking' || status === 'listening' || status === 'processing')) {
        stopVoiceChat();
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [status, stopVoiceChat]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversation, currentResponse]);

  // System stats: one steady 2s poll for the app's lifetime. This used to live in the
  // effect below, which re-runs on every render and so fetched (and re-rendered) in a loop.
  useEffect(() => {
    if (typeof window === 'undefined' || !(window as any).require) return;
    let ipcRenderer: any;
    try {
      ipcRenderer = (window as any).require('electron').ipcRenderer;
    } catch {
      return;
    }
    let alive = true;
    const fetchStats = async () => {
      try {
        const stats = await ipcRenderer.invoke('get-system-stats');
        if (alive && stats) setSystemStats(stats);
      } catch {}
    };
    fetchStats();
    const interval = setInterval(fetchStats, 2000);
    return () => { alive = false; clearInterval(interval); };
  }, []);

  // IPC Event Listeners
  useEffect(() => {
    if (typeof window !== 'undefined' && (window as any).require) {
      try {
        const { ipcRenderer } = (window as any).require('electron');
        
        const handleMobileCmd = (_event: any, data: any) => {
          if (data && data.text) {
            console.log('[JARVIS Mobile Command Received]:', data.text);
            sendTextMessage(data.text);
          }
        };

        const handleTriggerListening = () => {
          console.log('[JARVIS Global Hotkey Alt+Space Triggered]');
          startListening();
        };

        const handleReminderTriggered = (_event: any, data: any) => {
          console.log('[JARVIS Reminder Triggered]:', data);
        };

        ipcRenderer.on('mobile-command', handleMobileCmd);
        ipcRenderer.on('trigger-voice-listening', handleTriggerListening);
        ipcRenderer.on('reminder-triggered', handleReminderTriggered);

        return () => {
          ipcRenderer.removeListener('mobile-command', handleMobileCmd);
          ipcRenderer.removeListener('trigger-voice-listening', handleTriggerListening);
          ipcRenderer.removeListener('reminder-triggered', handleReminderTriggered);
        };
      } catch (e) {
        console.error('IPC Listener Error:', e);
      }
    }
  }, [sendTextMessage, startListening]);

  const openExternalLink = (url: string) => {
    if (typeof window !== 'undefined' && (window as any).require) {
      try {
        const { shell } = (window as any).require('electron');
        shell.openExternal(url);
        return;
      } catch (e) {}
    }
    window.open(url, '_blank');
  };

  const handleSaveSettings = () => {
    localStorage.setItem('jarvis_api_key', apiKey);
    localStorage.setItem('jarvis_language', language);
    setHasSavedKey(!!apiKey.trim());
    setShowSettings(false);
  };

  // Dismiss settings without saving: restore what is persisted
  const handleCloseSettings = () => {
    setApiKey(localStorage.getItem('jarvis_api_key') || '');
    setLanguage((localStorage.getItem('jarvis_language') as JarvisLanguage | null) || 'tr-TR');
    setShowSettings(false);
  };

  const handleWindowControl = (action: string) => {
    if (typeof window !== 'undefined' && (window as any).require) {
      try {
        const { ipcRenderer } = (window as any).require('electron');
        ipcRenderer.send(`window-${action}`);
      } catch (e) {
        console.error('Electron not found');
      }
    }
  };

  const handleOpenQR = async () => {
    if (typeof window !== 'undefined' && (window as any).require) {
      try {
        const { ipcRenderer } = (window as any).require('electron');
        const info = await ipcRenderer.invoke('get-qr-info');
        setQrData(info);
        setShowQR(true);
      } catch (e) {
        console.error('IPC error', e);
      }
    }
  };

  const handleToggleCamera = async () => {
    if (!showCamera) {
      setShowCamera(true);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (e) {
        console.error('Camera access error:', e);
      }
    } else {
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(t => t.stop());
      }
      setShowCamera(false);
    }
  };

  const handleCaptureAndAnalyze = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        const base64 = dataUrl.split(',')[1];
        sendImageToGemini(base64, "Kameradaki bu görüntüyü detaylıca analiz et ve açıkla.");
        handleToggleCamera();
      }
    }
  };

  const handleAnalyzeScreen = async () => {
    if (typeof window !== 'undefined' && (window as any).require) {
      try {
        const { ipcRenderer } = (window as any).require('electron');
        const dataUrl = await ipcRenderer.invoke('capture-screen');
        if (dataUrl) {
          const base64 = dataUrl.split(',')[1];
          sendImageToGemini(base64, "Ekranımdaki bu anlık görüntüyü, kodları, görselleri ve yazıları Türkçe detaylıca incele ve çözüm sun.");
        }
      } catch (e) {
        console.error('Screen capture error:', e);
      }
    }
  };

  const handleMediaControl = async (action: string) => {
    if (typeof window !== 'undefined' && (window as any).require) {
      try {
        const { ipcRenderer } = (window as any).require('electron');
        await ipcRenderer.invoke('execute-tool', { name: 'control_media', args: { action } });
      } catch(e) {}
    }
  };

  const handleLoadNotes = async () => {
    setShowNotes(true);
    if (typeof window !== 'undefined' && (window as any).require) {
      try {
        const { ipcRenderer } = (window as any).require('electron');
        const notesJson = await ipcRenderer.invoke('execute-tool', { name: 'get_notes', args: {} });
        if (notesJson) setNotes(JSON.parse(notesJson));
      } catch(e) {}
    }
  };

  const handleAddNote = async () => {
    if (!newNoteText.trim()) return;
    if (typeof window !== 'undefined' && (window as any).require) {
      try {
        const { ipcRenderer } = (window as any).require('electron');
        await ipcRenderer.invoke('execute-tool', { name: 'save_note', args: { text: newNoteText } });
        setNewNoteText('');
        handleLoadNotes();
      } catch(e) {}
    }
  };

  const handleDeleteNote = async (id: string) => {
    if (typeof window !== 'undefined' && (window as any).require) {
      try {
        const { ipcRenderer } = (window as any).require('electron');
        await ipcRenderer.invoke('execute-tool', { name: 'delete_note', args: { id } });
        handleLoadNotes();
      } catch(e) {}
    }
  };

  const handleOrbClick = () => {
    if (status === 'listening') {
      stopListening();
    } else {
      startListening();
    }
  };

  const handleSendText = () => {
    if (textInput.trim()) {
      sendTextMessage(textInput);
      setTextInput('');
    }
  };

  const handleAppLaunch = (appId: string, commandText: string) => {
    setActiveApp(appId);
    sendTextMessage(commandText);
  };

  const t = (tr: string, en: string) => (language === 'tr-TR' ? tr : en);
  const isActive = status === 'listening' || status === 'speaking' || status === 'processing';

  // Status capsule content (Dynamic Island–style)
  const renderCapsuleLead = () => {
    switch (status) {
      case 'listening':
        return <Wave level={audioLevel} color="var(--blue)" />;
      case 'speaking':
        return <Wave level={audioLevel} color="var(--orange)" />;
      case 'processing':
        return <div className="thinking-dots"><span /><span /><span /></div>;
      case 'error':
        return <span style={{ color: 'var(--red)', display: 'flex' }}><Icon.alert size={18} /></span>;
      default:
        return <span className="capsule-dot" />;
    }
  };

  const renderCapsuleText = () => {
    switch (status) {
      case 'listening':
        return liveTranscript
          ? <span className="capsule-caption live">{liveTranscript}</span>
          : <>
              <span className="capsule-title">{t('Dinliyorum…', 'Listening…')}</span>
              <span className="capsule-caption">{t('Konuşmaya başlayın', 'Go ahead, I’m listening')}</span>
            </>;
      case 'processing':
        return <span className="capsule-title">{t('Düşünüyor…', 'Thinking…')}</span>;
      case 'speaking':
        return currentResponse
          ? <span className="capsule-caption live">{currentResponse}</span>
          : <span className="capsule-title">{t('Yanıtlıyor…', 'Responding…')}</span>;
      case 'error':
        return <>
          <span className="capsule-title">{t('Bağlantı sorunu', 'Connection problem')}</span>
          <span className="capsule-caption">{t('Tekrar denemek için dokunun', 'Tap to try again')}</span>
        </>;
      default:
        return <span className="capsule-title">{t('Konuşmak için dokunun', 'Tap to talk')}</span>;
    }
  };

  const formatMessage = (content: string) => {
    if (content.startsWith('🎤')) {
      return <span className="msg-meta"><Icon.mic size={14} /> {t('Sesli mesaj', 'Voice message')}</span>;
    }
    if (content.startsWith('📷')) {
      return <span className="msg-meta"><Icon.camera size={14} /> {t('Kamera görüntüsü', 'Camera image')}</span>;
    }
    return content;
  };

  const apps = [
    { id: 'chrome', name: 'Google Chrome', icon: <AppIcon.chrome />, cmd: 'Tarayıcıyı aç' },
    { id: 'spotify', name: 'Spotify', icon: <AppIcon.spotify />, cmd: "Spotify'ı aç" },
    { id: 'vscode', name: 'VS Code', icon: <AppIcon.vscode />, cmd: 'VS Code aç' },
    { id: 'notepad', name: t('Not Defteri', 'Notepad'), icon: <AppIcon.notes />, cmd: 'Not defterini aç' },
    { id: 'calc', name: t('Hesap Makinesi', 'Calculator'), icon: <AppIcon.calculator />, cmd: 'Hesap makinesi aç' },
  ];

  const suggestions = [
    { icon: <Icon.note size={16} />, label: t('Bugünkü hedeflerimi not al', 'Take a note of today’s goals'), cmd: t('Bugünkü hedeflerimi not al', 'Take a note of my goals for today') },
    { icon: <Icon.clock size={16} />, label: t('10 dakika sonra su içmeyi hatırlat', 'Remind me to drink water in 10 min'), cmd: t('10 dakika sonra bana su içmeyi hatırlat', 'Remind me to drink water in 10 minutes') },
    { icon: <Icon.music size={16} />, label: t('Spotify’da müzik başlat', 'Play music on Spotify'), cmd: t("Spotify'ı aç ve müziği başlat", 'Open Spotify and start the music') },
  ];

  const panelSpring = { type: 'spring', bounce: 0, duration: 0.42 } as const;
  const layoutSpring = { type: 'spring', bounce: 0.12, duration: 0.45 } as const;

  return (
    <MotionConfig reducedMotion="user">
    <div className="app-container">
      {/* Window chrome */}
      <div className="titlebar">
        <div className="titlebar-title">JARVIS</div>
        <div className="titlebar-controls">
          <button className="titlebar-btn" aria-label={t('Küçült', 'Minimize')} onClick={() => handleWindowControl('minimize')}>
            <svg width="10" height="10" viewBox="0 0 10 10"><line x1="0" y1="5" x2="10" y2="5" stroke="currentColor" strokeWidth="1" /></svg>
          </button>
          <button className="titlebar-btn" aria-label={t('Büyüt', 'Maximize')} onClick={() => handleWindowControl('maximize')}>
            <svg width="10" height="10" viewBox="0 0 10 10"><rect x="0.5" y="0.5" width="9" height="9" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1" /></svg>
          </button>
          <button className="titlebar-btn close" aria-label={t('Kapat', 'Close')} onClick={() => handleWindowControl('close')}>
            <svg width="10" height="10" viewBox="0 0 10 10"><path d="M0.5 0.5l9 9M9.5 0.5l-9 9" stroke="currentColor" strokeWidth="1" /></svg>
          </button>
        </div>
      </div>

      <div className="layout">
        {/* Sidebar — macOS source list */}
        <aside className="left-sidebar">
          <div className="sidebar-section-title">{t('Sistem', 'System')}</div>
          <div className="sys-widget">
            <Gauge
              value={systemStats.cpuUsage}
              label={t('İşlemci', 'CPU')}
              detail={systemStats.cores ? t(`${systemStats.cores} çekirdek`, `${systemStats.cores} cores`) : t('Ölçülüyor', 'Measuring')}
            />
            <span className="sys-divider" />
            <Gauge
              value={systemStats.memUsage}
              label={t('Bellek', 'Memory')}
              detail={`${systemStats.usedMemGB} / ${systemStats.totalMemGB} GB`}
            />
          </div>

          <div className="sidebar-section-title">{t('Uygulamalar', 'Apps')}</div>
          <div className="nav-list">
            {apps.map(a => (
              <button
                key={a.id}
                className={`nav-row app ${activeApp === a.id ? 'active' : ''}`}
                onClick={() => handleAppLaunch(a.id, a.cmd)}
              >
                <span className="app-icon">{a.icon}</span>
                <span className="row-label">{a.name}</span>
                {activeApp === a.id && <span className="live-dot" />}
              </button>
            ))}
          </div>

          <div className="sidebar-section-title">{t('Medya', 'Media')}</div>
          <div className="media-group">
            <button className="media-btn" onClick={() => handleMediaControl('voldown')} title={t('Sesi kıs', 'Volume down')} aria-label={t('Sesi kıs', 'Volume down')}>
              <Icon.volLow size={16} />
            </button>
            <button className="media-btn primary" onClick={() => handleMediaControl('playpause')} title={t('Oynat / Duraklat', 'Play / Pause')} aria-label={t('Oynat / Duraklat', 'Play / Pause')}>
              <Icon.playPause size={18} />
            </button>
            <button className="media-btn primary" onClick={() => handleMediaControl('next')} title={t('Sonraki', 'Next')} aria-label={t('Sonraki', 'Next')}>
              <Icon.forward size={18} />
            </button>
            <button className="media-btn" onClick={() => handleMediaControl('volup')} title={t('Sesi aç', 'Volume up')} aria-label={t('Sesi aç', 'Volume up')}>
              <Icon.volHigh size={16} />
            </button>
          </div>

          <div className="sidebar-section-title">{t('Araçlar', 'Tools')}</div>
          <div className="nav-list">
            <button className="nav-row" onClick={handleAnalyzeScreen}>
              <span className="nav-icon plain"><Icon.display size={16} /></span>
              <span className="row-label">{t('Ekranı Analiz Et', 'Analyze Screen')}</span>
            </button>
            <button className={`nav-row ${showCamera ? 'active' : ''}`} onClick={handleToggleCamera}>
              <span className="nav-icon plain"><Icon.camera size={16} /></span>
              <span className="row-label">{t('Kamerayla Analiz', 'Camera Analysis')}</span>
            </button>
            <button className={`nav-row ${showNotes ? 'active' : ''}`} onClick={handleLoadNotes}>
              <span className="nav-icon plain"><Icon.note size={16} /></span>
              <span className="row-label">{t('Notlar', 'Notes')}</span>
            </button>
            <button className={`nav-row ${showQR ? 'active' : ''}`} onClick={handleOpenQR}>
              <span className="nav-icon plain"><Icon.phone size={16} /></span>
              <span className="row-label">{t('Telefondan Bağlan', 'Connect Phone')}</span>
            </button>
          </div>

          <button className="sidebar-footer" onClick={() => openExternalLink('https://shazagency.com')}>
            Designed by <strong>Shaz Agency</strong>
            <Icon.arrowUpRight size={11} />
          </button>
        </aside>

        {/* Stage */}
        <main className="main-content">
          {/* Toolbar */}
          <div className="toolbar" role="toolbar">
            <button
              className={`tool-btn ${isAlwaysListening ? 'on' : ''}`}
              onClick={toggleAlwaysListening}
              data-tip={isAlwaysListening ? t('Sürekli dinleme açık', 'Always listening on') : t('“Jarvis” ile uyandır', 'Wake with “Jarvis”')}
              aria-pressed={isAlwaysListening}
              aria-label={t('Sürekli dinleme', 'Always listening')}
            >
              <Icon.waveform size={17} />
            </button>
            <button
              className={`tool-btn ${isMuted ? 'danger' : ''}`}
              onClick={toggleMute}
              data-tip={isMuted ? t('Mikrofonu aç', 'Unmute') : t('Mikrofonu kapat', 'Mute')}
              aria-pressed={isMuted}
              aria-label={t('Mikrofon', 'Microphone')}
            >
              {isMuted ? <Icon.micOff size={17} /> : <Icon.mic size={17} />}
            </button>
            <span className="toolbar-divider" />
            <button
              className={`tool-btn ${showChat ? 'on' : ''}`}
              onClick={() => setShowChat(!showChat)}
              data-tip={t('Sohbet', 'Chat')}
              aria-pressed={showChat}
              aria-label={t('Sohbet', 'Chat')}
            >
              <Icon.bubble size={17} />
            </button>
            <button
              className="tool-btn"
              onClick={() => setShowSettings(true)}
              data-tip={t('Ayarlar', 'Settings')}
              aria-label={t('Ayarlar', 'Settings')}
            >
              <Icon.gear size={17} />
            </button>
          </div>

          {/* Error toast */}
          <AnimatePresence>
            {errorMessage && (
              <motion.div
                className="toast"
                role="alert"
                style={{ x: '-50%' }}
                initial={{ opacity: 0, y: -16, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -16, scale: 0.96 }}
                transition={panelSpring}
              >
                <span className="toast-icon"><Icon.alert size={16} /></span>
                <span className="toast-text">
                  <strong>{t('Bağlantı hatası', 'Connection error')}</strong>
                  <span>{errorMessage}</span>
                </span>
                <button className="btn btn-plain" onClick={startListening}>{t('Tekrar Dene', 'Try Again')}</button>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="ai-presence">
            <div className="fui-radar-backdrop" />

            {/* 3D Visualizer Orb Canvas (unchanged) */}
            <motion.div
              className="orb-container"
              onClick={handleOrbClick}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.96 }}
              style={{ cursor: 'pointer', width: '380px', height: '380px', position: 'relative', zIndex: 2 }}
            >
              <Canvas camera={{ position: [0, 0, 4.3], fov: 46 }}>
                <ambientLight intensity={0.6} />
                <pointLight position={[10, 10, 10]} intensity={1.5} color="#00f0ff" />
                <pointLight position={[-10, -10, -10]} intensity={0.8} color="#ff007f" />
                <pointLight position={[0, 0, 5]} intensity={0.5} />
                <Orb status={status} audioLevel={audioLevel} />
              </Canvas>
            </motion.div>

            {/* Status capsule — fixed-height slot keeps the orb from shifting between states */}
            <div className="capsule-slot">
              <motion.div
                layout
                className={`status-capsule ${status}`}
                onClick={handleOrbClick}
                transition={layoutSpring}
                style={{ borderRadius: 22 }}
                whileTap={{ scale: 0.97 }}
                role="button"
                aria-live="polite"
              >
                <motion.div layout="position" className="capsule-lead">{renderCapsuleLead()}</motion.div>
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.div
                    key={status}
                    layout="position"
                    className="capsule-text"
                    initial={{ opacity: 0, filter: 'blur(4px)' }}
                    animate={{ opacity: 1, filter: 'blur(0px)' }}
                    exit={{ opacity: 0, filter: 'blur(4px)' }}
                    transition={{ duration: 0.18 }}
                  >
                    {renderCapsuleText()}
                  </motion.div>
                </AnimatePresence>
                {status === 'idle' && <motion.span layout="position" className="kbd">Alt + Space</motion.span>}
                {isActive && (
                  <motion.button
                    layout="position"
                    className="capsule-stop"
                    onClick={(e) => { e.stopPropagation(); stopVoiceChat(); }}
                    title={t('Durdur (Esc)', 'Stop (Esc)')}
                    aria-label={t('Durdur', 'Stop')}
                    initial={{ opacity: 0, scale: 0.6 }}
                    animate={{ opacity: 1, scale: 1 }}
                  >
                    <svg width="10" height="10" viewBox="0 0 10 10"><rect width="10" height="10" rx="2.5" fill="currentColor" /></svg>
                  </motion.button>
                )}
              </motion.div>
              <div className="stage-hint" style={{ visibility: isAlwaysListening && status === 'idle' ? 'visible' : 'hidden' }}>
                {t('Sürekli dinleme açık — “Jarvis” demeniz yeterli', 'Always listening — just say “Jarvis”')}
              </div>
            </div>
          </div>
        </main>

        {/* Chat panel */}
        <AnimatePresence initial={false}>
          {showChat && (
            <motion.div
              className="chat-shell"
              initial={{ width: 0 }}
              animate={{ width: 340 }}
              exit={{ width: 0 }}
              transition={panelSpring}
            >
              <aside className="chat-sidebar">
                <div className="chat-header">
                  <span className="chat-title">{t('Sohbet', 'Chat')}</span>
                  <button className="icon-btn" onClick={() => setShowChat(false)} aria-label={t('Sohbeti kapat', 'Close chat')}>
                    <Icon.close size={12} />
                  </button>
                </div>

                <div className="chat-messages">
                  {conversation.length === 0 && (
                    <div className="chat-empty-state">
                      <div className="chat-empty-title">{t('Size nasıl yardımcı olabilirim?', 'How can I help?')}</div>
                      <p className="chat-empty-desc">
                        {t('Konuşmak için küreye dokunun ya da aşağıya yazın.', 'Tap the orb to talk, or type below.')}
                      </p>
                      <div className="suggestion-list">
                        {suggestions.map(sg => (
                          <button key={sg.label} className="suggestion" onClick={() => sendTextMessage(sg.cmd)}>
                            {sg.icon}
                            <span>{sg.label}</span>
                            <span className="chev"><Icon.chevron size={12} /></span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {conversation.map((msg, i) => {
                    const prev = conversation[i - 1];
                    const next = conversation[i + 1];
                    const runStart = !prev || prev.role !== msg.role;
                    const tail = !next || next.role !== msg.role;
                    return (
                      <motion.div
                        key={i}
                        className={`chat-bubble ${msg.role} ${runStart ? 'run-start' : ''} ${tail ? 'tail' : ''}`}
                        initial={{ opacity: 0, y: 8, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
                        style={{ transformOrigin: msg.role === 'user' ? 'bottom right' : 'bottom left' }}
                      >
                        {formatMessage(msg.content)}
                      </motion.div>
                    );
                  })}
                  <div ref={chatEndRef} />
                </div>

                <div className="chat-input-container">
                  <div className="chat-input-wrap">
                    <input
                      type="text"
                      className="chat-input"
                      placeholder={t('JARVIS’e yazın', 'Message JARVIS')}
                      value={textInput}
                      onChange={(e) => setTextInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSendText()}
                    />
                    <AnimatePresence>
                      {textInput.trim() && (
                        <motion.button
                          className="chat-send-btn"
                          onClick={handleSendText}
                          aria-label={t('Gönder', 'Send')}
                          initial={{ opacity: 0, scale: 0.5 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.5 }}
                          transition={{ type: 'spring', bounce: 0.2, duration: 0.28 }}
                          whileTap={{ scale: 0.9 }}
                        >
                          <Icon.arrowUp size={15} />
                        </motion.button>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </aside>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Notes */}
      <Sheet open={showNotes} onClose={() => setShowNotes(false)} width={480}>
        <div className="sheet-header">
          <div>
            <h2 className="sheet-title">{t('Notlar', 'Notes')}</h2>
            <p className="sheet-subtitle">{t('Sesle ya da buradan eklediğiniz notlar.', 'Notes you added by voice or here.')}</p>
          </div>
          <button className="btn btn-plain" onClick={() => setShowNotes(false)}>{t('Bitti', 'Done')}</button>
        </div>

        <div className="group">
          <div className="group-row">
            <input
              type="text"
              className="text-field"
              placeholder={t('Yeni not', 'New note')}
              value={newNoteText}
              onChange={(e) => setNewNoteText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddNote()}
            />
            <button className="btn btn-primary" onClick={handleAddNote} disabled={!newNoteText.trim()}>{t('Ekle', 'Add')}</button>
          </div>
        </div>

        <div className="group" style={{ marginTop: 12 }}>
          {notes.length === 0 && <div className="empty-hint">{t('Henüz not yok.', 'No notes yet.')}</div>}
          {notes.map(note => (
            <div key={note.id} className="note-row">
              <div style={{ minWidth: 0 }}>
                <div className="note-text">{note.text}</div>
                <div className="note-date">{note.date}</div>
              </div>
              <button className="icon-btn note-delete" onClick={() => handleDeleteNote(note.id)} aria-label={t('Notu sil', 'Delete note')} style={{ color: 'var(--red)' }}>
                <Icon.trash size={13} />
              </button>
            </div>
          ))}
        </div>
      </Sheet>

      {/* Camera */}
      <Sheet open={showCamera} onClose={handleToggleCamera} width={520}>
        <div className="sheet-header">
          <div>
            <h2 className="sheet-title">{t('Kamerayla Analiz', 'Camera Analysis')}</h2>
            <p className="sheet-subtitle">{t('Görüntüyü yakalayın, JARVIS ne gördüğünü anlatsın.', 'Capture a frame and JARVIS will describe what it sees.')}</p>
          </div>
        </div>
        <div className="camera-frame">
          <video ref={videoRef} autoPlay playsInline />
        </div>
        <canvas ref={canvasRef} style={{ display: 'none' }} />
        <div className="sheet-footer">
          <button className="btn btn-secondary" onClick={handleToggleCamera}>{t('Vazgeç', 'Cancel')}</button>
          <button className="btn btn-primary" onClick={handleCaptureAndAnalyze}>{t('Analiz Et', 'Analyze')}</button>
        </div>
      </Sheet>

      {/* Phone */}
      <Sheet open={showQR && !!qrData} onClose={() => setShowQR(false)} width={380}>
        <div className="sheet-header">
          <div>
            <h2 className="sheet-title">{t('Telefondan Bağlan', 'Connect Your Phone')}</h2>
            <p className="sheet-subtitle">{t('Aynı Wi‑Fi ağındayken QR kodu telefonunuzun kamerasıyla okutun.', 'On the same Wi‑Fi, scan this code with your phone’s camera.')}</p>
          </div>
        </div>
        {qrData && (
          <div style={{ textAlign: 'center' }}>
            <div className="qr-frame"><QRCodeSVG value={qrData.url} size={188} /></div>
            <div className="qr-url">{qrData.url}</div>
          </div>
        )}
        <div className="sheet-footer">
          <button className="btn btn-primary" onClick={() => setShowQR(false)}>{t('Bitti', 'Done')}</button>
        </div>
      </Sheet>

      {/* Settings */}
      <Sheet open={showSettings} onClose={handleCloseSettings} width={460}>
        <div className="sheet-header">
          <div>
            <h2 className="sheet-title">{hasSavedKey ? t('Ayarlar', 'Settings') : t('JARVIS’e Hoş Geldiniz', 'Welcome to JARVIS')}</h2>
            <p className="sheet-subtitle">
              {hasSavedKey
                ? t('Asistanınızın bağlantısını ve sesini ayarlayın.', 'Adjust your assistant’s connection and voice.')
                : t('Başlamak için Google Gemini API anahtarınızı girin.', 'Enter your Google Gemini API key to get started.')}
            </p>
          </div>
          <button className="icon-btn" onClick={handleCloseSettings} aria-label={t('Kapat', 'Close')}>
            <Icon.close size={12} />
          </button>
        </div>

        <div className="group-label">{t('Gemini API Anahtarı', 'Gemini API Key')}</div>
        <div className="group">
          <div className="group-row stack">
            <input
              type="password"
              className="text-field"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="AIzaSy…"
              autoFocus={!hasSavedKey}
            />
          </div>
        </div>
        <div className="group-footnote">
          {t('Anahtar yalnızca bu cihazda saklanır.', 'The key is stored only on this device.')}{' '}
          <button className="link-btn" onClick={() => openExternalLink('https://aistudio.google.com/apikey')}>
            {t('Anahtar al', 'Get a key')}
          </button>
        </div>

        <div className="group-label" style={{ marginTop: 16 }}>{t('Genel', 'General')}</div>
        <div className="group">
          <div className="group-row">
            <span>{t('Dil', 'Language')}</span>
            <Segmented
              id="lang"
              value={language}
              onChange={(v) => setLanguage(v as JarvisLanguage)}
              options={[{ value: 'tr-TR', label: 'Türkçe' }, { value: 'en-US', label: 'English' }]}
            />
          </div>
        </div>

        <div className="group-label" style={{ marginTop: 16 }}>{t('Ses', 'Voice')}</div>
        <div className="group">
          <div className="group-row stack">
            <div className="row-head">
              <span>{t('Ton', 'Pitch')}</span>
              <span className="row-value">{voicePitch.toFixed(2)}</span>
            </div>
            <Slider min={0.5} max={1.5} step={0.05} value={voicePitch} onChange={setVoicePitch} />
          </div>
          <div className="group-row stack">
            <div className="row-head">
              <span>{t('Hız', 'Speed')}</span>
              <span className="row-value">{voiceRate.toFixed(2)}×</span>
            </div>
            <Slider min={0.5} max={1.5} step={0.05} value={voiceRate} onChange={setVoiceRate} />
          </div>
        </div>

        <div className="sheet-footer">
          <button className="btn btn-secondary btn-lg" onClick={handleCloseSettings}>
            {hasSavedKey ? t('Vazgeç', 'Cancel') : t('Şimdi Değil', 'Not Now')}
          </button>
          <button className="btn btn-primary btn-lg" onClick={handleSaveSettings} disabled={!apiKey.trim()}>
            {hasSavedKey ? t('Kaydet', 'Save') : t('Kaydet ve Başla', 'Save and Start')}
          </button>
        </div>
      </Sheet>
    </div>
    </MotionConfig>
  );
}

/* ==========================================================================
   UI primitives
   ========================================================================== */

const sheetSpring = { type: 'spring', bounce: 0, duration: 0.34 } as const;

function Sheet({ open, onClose, width = 440, children }: { open: boolean; onClose: () => void; width?: number; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="modal-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
        >
          <motion.div
            className="modal-content"
            role="dialog"
            aria-modal="true"
            style={{ maxWidth: width }}
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 6 }}
            transition={sheetSpring}
            onClick={(e) => e.stopPropagation()}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Segmented({ id, value, options, onChange }: { id: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }) {
  return (
    <div className="segmented" role="radiogroup">
      {options.map(o => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          className={value === o.value ? 'selected' : ''}
          onClick={() => onChange(o.value)}
        >
          {value === o.value && (
            <motion.span layoutId={`seg-${id}`} className="segmented-thumb" transition={{ type: 'spring', bounce: 0, duration: 0.3 }} />
          )}
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Slider({ min, max, step, value, onChange }: { min: number; max: number; step: number; value: number; onChange: (v: number) => void }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <input
      type="range"
      className="slider"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      style={{ '--pct': `${pct}%` } as CSSProperties}
    />
  );
}

function Wave({ level, color }: { level: number; color: string }) {
  const weights = [0.55, 0.85, 1, 0.8, 0.5];
  return (
    <div className="wave" aria-hidden="true">
      {weights.map((w, i) => (
        <span key={i} style={{ height: `${Math.max(3, Math.min(18, 3 + level * 30 * w))}px`, background: color }} />
      ))}
    </div>
  );
}

/* SF Symbols–style line icons */
type IconProps = { size?: number };
const svgProps = (size = 16) => ({
  width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
  strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true,
});

const Icon = {
  mic: ({ size }: IconProps) => <svg {...svgProps(size)}><rect x="9" y="2.5" width="6" height="12" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" /></svg>,
  micOff: ({ size }: IconProps) => <svg {...svgProps(size)}><path d="M15 9.5V5.5a3 3 0 0 0-5.7-1.3M9 9v2.5a3 3 0 0 0 4.9 2.3M18.5 11a6.4 6.4 0 0 1-1 3.4M5.5 11a6.5 6.5 0 0 0 10.4 5.2M12 17.5V21M3 3l18 18" /></svg>,
  waveform: ({ size }: IconProps) => <svg {...svgProps(size)}><path d="M3 11v2M7 8v8M11 4v16M15 7v10M19 10v4" /></svg>,
  bubble: ({ size }: IconProps) => <svg {...svgProps(size)}><path d="M12 4c4.7 0 8.5 3 8.5 6.8s-3.8 6.7-8.5 6.7c-.9 0-1.8-.1-2.6-.3L5 19.5l1-3.4C4.4 14.9 3.5 13 3.5 10.8 3.5 7 7.3 4 12 4z" /></svg>,
  gear: ({ size }: IconProps) => <svg {...svgProps(size)}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>,
  globe: ({ size }: IconProps) => <svg {...svgProps(size)} strokeWidth={2}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></svg>,
  music: ({ size }: IconProps) => <svg {...svgProps(size)} strokeWidth={2}><path d="M9 18V5l11-2v13" /><circle cx="6.5" cy="18" r="2.5" /><circle cx="17.5" cy="16" r="2.5" /></svg>,
  code: ({ size }: IconProps) => <svg {...svgProps(size)} strokeWidth={2.2}><path d="M16 18l6-6-6-6M8 6l-6 6 6 6" /></svg>,
  doc: ({ size }: IconProps) => <svg {...svgProps(size)} strokeWidth={2}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></svg>,
  calc: ({ size }: IconProps) => <svg {...svgProps(size)} strokeWidth={2}><rect x="5" y="3" width="14" height="18" rx="2.5" /><path d="M8.5 7.5h7M9 12h.01M12 12h.01M15 12h.01M9 16h.01M12 16h.01M15 16h.01" /></svg>,
  display: ({ size }: IconProps) => <svg {...svgProps(size)}><rect x="2.5" y="4" width="19" height="13" rx="2" /><path d="M8.5 20.5h7M12 17v3.5" /></svg>,
  camera: ({ size }: IconProps) => <svg {...svgProps(size)}><path d="M3.5 8.5a2 2 0 0 1 2-2h2l1.5-2h6l1.5 2h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" /><circle cx="12" cy="13" r="3.5" /></svg>,
  note: ({ size }: IconProps) => <svg {...svgProps(size)}><rect x="4.5" y="3" width="15" height="18" rx="2.5" /><path d="M8.5 8h7M8.5 12h7M8.5 16h4" /></svg>,
  phone: ({ size }: IconProps) => <svg {...svgProps(size)}><rect x="6.5" y="2.5" width="11" height="19" rx="2.5" /><path d="M10.5 18.5h3" /></svg>,
  clock: ({ size }: IconProps) => <svg {...svgProps(size)}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>,
  volLow: ({ size }: IconProps) => <svg {...svgProps(size)}><path d="M4 9.5h3l4.5-4v13l-4.5-4H4z" /><path d="M15 10a3 3 0 0 1 0 4" /></svg>,
  volHigh: ({ size }: IconProps) => <svg {...svgProps(size)}><path d="M3 9.5h3l4.5-4v13l-4.5-4H3z" /><path d="M14 10a3 3 0 0 1 0 4M17 7.5a7 7 0 0 1 0 9" /></svg>,
  playPause: ({ size }: IconProps) => <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M2 5.6v12.8a.8.8 0 0 0 1.2.7l9.6-6.4a.8.8 0 0 0 0-1.4L3.2 4.9A.8.8 0 0 0 2 5.6z" /><rect x="15" y="5" width="2.6" height="14" rx="1" /><rect x="19.4" y="5" width="2.6" height="14" rx="1" /></svg>,
  forward: ({ size }: IconProps) => <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M2.5 6.2v11.6a.8.8 0 0 0 1.2.7l8.3-5.8a.8.8 0 0 0 0-1.4L3.7 5.5a.8.8 0 0 0-1.2.7zM12 6.2v11.6a.8.8 0 0 0 1.2.7l8.3-5.8a.8.8 0 0 0 0-1.4l-8.3-5.8a.8.8 0 0 0-1.2.7z" /></svg>,
  alert: ({ size }: IconProps) => <svg {...svgProps(size)} strokeWidth={2}><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5M12 16.2v.3" /></svg>,
  close: ({ size }: IconProps) => <svg {...svgProps(size)} strokeWidth={2.4}><path d="M6 6l12 12M18 6L6 18" /></svg>,
  chevron: ({ size }: IconProps) => <svg {...svgProps(size)} strokeWidth={2.2}><path d="M9 5l7 7-7 7" /></svg>,
  arrowUp: ({ size }: IconProps) => <svg {...svgProps(size)} strokeWidth={2.4}><path d="M12 19V5M6 11l6-6 6 6" /></svg>,
  arrowUpRight: ({ size }: IconProps) => <svg {...svgProps(size)} strokeWidth={2}><path d="M7 17L17 7M8 7h9v9" /></svg>,
  trash: ({ size }: IconProps) => <svg {...svgProps(size)} strokeWidth={2}><path d="M4 7h16M10 11v6M14 11v6M5.5 7l1 12a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2l1-12M9 7V4.5h6V7" /></svg>,
};

/* iOS-style app icons (squircle, full-bleed artwork) */
const AppIcon = {
  chrome: () => (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <defs>
        <linearGradient id="ai-chrome-bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffffff" /><stop offset="1" stopColor="#e6e6eb" /></linearGradient>
      </defs>
      <rect width="24" height="24" fill="url(#ai-chrome-bg)" />
      <path d="M12 12L4.2 7.5A9 9 0 0 1 19.8 7.5Z" fill="#ea4335" />
      <path d="M12 12L19.8 7.5A9 9 0 0 1 12 21Z" fill="#fbbc04" />
      <path d="M12 12L12 21A9 9 0 0 1 4.2 7.5Z" fill="#34a853" />
      <circle cx="12" cy="12" r="4.3" fill="#fff" />
      <circle cx="12" cy="12" r="3.4" fill="#4285f4" />
    </svg>
  ),
  spotify: () => (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect width="24" height="24" fill="#0a0a0a" />
      <circle cx="12" cy="12" r="8" fill="#1ed760" />
      <g fill="none" stroke="#0a0a0a" strokeLinecap="round">
        <path d="M7.4 9.7c3-1 6.6-.7 9.3.8" strokeWidth="1.6" />
        <path d="M7.9 12.3c2.5-.7 5.4-.4 7.6.8" strokeWidth="1.35" />
        <path d="M8.4 14.8c2-.5 4.1-.3 5.9.6" strokeWidth="1.15" />
      </g>
    </svg>
  ),
  vscode: () => (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <defs>
        <linearGradient id="ai-code-bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3a3a3e" /><stop offset="1" stopColor="#1c1c1e" /></linearGradient>
        <linearGradient id="ai-code-fg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#3fb6ff" /><stop offset="1" stopColor="#0065a9" /></linearGradient>
      </defs>
      <rect width="24" height="24" fill="url(#ai-code-bg)" />
      <g transform="translate(5 5) scale(0.5833)">
        <path fill="url(#ai-code-fg)" d="M23.15 2.587L18.21.21a1.494 1.494 0 0 0-1.705.29l-9.46 8.63-4.12-3.128a.999.999 0 0 0-1.276.057L.327 7.261A1 1 0 0 0 .326 8.74L3.899 12 .326 15.26a1 1 0 0 0 .001 1.479L1.65 17.94a.999.999 0 0 0 1.276.057l4.12-3.128 9.46 8.63a1.492 1.492 0 0 0 1.704.29l4.942-2.377A1.5 1.5 0 0 0 24 20.06V3.939a1.5 1.5 0 0 0-.85-1.352zm-5.146 14.861L10.826 12l7.178-5.448v10.896z" />
      </g>
    </svg>
  ),
  notes: () => (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <defs>
        <linearGradient id="ai-notes-top" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffe066" /><stop offset="1" stopColor="#ffc700" /></linearGradient>
      </defs>
      <rect width="24" height="24" fill="#fbfbf8" />
      <rect width="24" height="7.2" fill="url(#ai-notes-top)" />
      <path d="M2 7.9h20" stroke="#c9c6bd" strokeWidth="0.5" strokeDasharray="0.6 0.9" />
      <path d="M0 11.6h24M0 15.2h24M0 18.8h24" stroke="#d9d6cf" strokeWidth="0.6" />
    </svg>
  ),
  calculator: () => (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <defs>
        <linearGradient id="ai-calc-bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2c2c2e" /><stop offset="1" stopColor="#0d0d0f" /></linearGradient>
      </defs>
      <rect width="24" height="24" fill="url(#ai-calc-bg)" />
      {[0, 1, 2, 3].map(row => [0, 1, 2, 3].map(col => (
        <circle
          key={`${row}-${col}`}
          cx={5.4 + col * 4.4}
          cy={5.4 + row * 4.4}
          r={1.75}
          fill={col === 3 ? '#ff9f0a' : row === 0 ? '#a5a5aa' : '#4d4d52'}
        />
      )))}
    </svg>
  ),
};

export default App;
