import { useEffect, useLayoutEffect, useRef, useState } from 'react';

// Desktop mini menu: a small capsule pinned to the top of the screen. It mirrors JARVIS's
// state (sent by the main window through the Electron main process) and offers a mic button.

type Status = 'idle' | 'listening' | 'processing' | 'speaking' | 'error';
interface JarvisState { status: Status; text?: string; wake?: boolean; muted?: boolean; language?: string }

const ipc = (): any | null => {
  try { return (window as any).require('electron').ipcRenderer; } catch { return null; }
};

export function MiniBar() {
  const [state, setState] = useState<JarvisState>({ status: 'idle', wake: false, language: 'tr-TR' });
  const [level, setLevel] = useState(0);
  const [now, setNow] = useState(() => new Date());
  const pillRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const r = ipc();
    if (!r) return;
    const onState = (_e: any, s: JarvisState) => setState(s);
    const onLevel = (_e: any, l: number) => setLevel(l);
    r.on('jarvis-state', onState);
    r.on('jarvis-level', onLevel);
    return () => { r.removeListener('jarvis-state', onState); r.removeListener('jarvis-level', onLevel); };
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => { if (state.status !== 'listening' && state.status !== 'speaking') setLevel(0); }, [state.status]);

  // The window is sized to the capsule so it never blocks clicks around it
  useLayoutEffect(() => {
    const el = pillRef.current;
    if (!el) return;
    const send = () => {
      const r = el.getBoundingClientRect();
      ipc()?.send('mini-resize', { width: Math.ceil(r.width), height: Math.ceil(r.height) });
    };
    send();
    const ro = new ResizeObserver(send);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const tr = (state.language || 'tr-TR') === 'tr-TR';
  const t = (a: string, b: string) => (tr ? a : b);
  const active = state.status === 'listening' || state.status === 'processing' || state.status === 'speaking';

  const caption = (() => {
    switch (state.status) {
      case 'listening': return state.text || t('Dinliyorum…', 'Listening…');
      case 'processing': return t('Düşünüyor…', 'Thinking…');
      case 'speaking': return state.text || t('Yanıtlıyor…', 'Responding…');
      case 'error': return state.text || t('Bir sorun oluştu', 'Something went wrong');
      default:
        if (state.text) return state.text;
        if (state.muted) return t('Mikrofon kapalı', 'Mic is muted');
        return state.wake ? t('“Hey Jarvis” deyin', 'Say “Hey Jarvis”') : t('Konuşmak için dokunun', 'Tap to talk');
    }
  })();

  const time = now.toLocaleTimeString(tr ? 'tr-TR' : 'en-US', { hour: '2-digit', minute: '2-digit' });
  const expanded = state.status === 'speaking' || (state.status === 'listening' && !!state.text);

  return (
    <div className="mini-root">
      <div
        ref={pillRef}
        className={`mini-pill ${state.status} ${expanded ? 'expanded' : ''}`}
        onClick={() => ipc()?.send('mini-action', 'open')}
        title={t('JARVIS’i aç', 'Open JARVIS')}
      >
        <span className="mini-lead">
          {state.status === 'processing' ? (
            <span className="mini-dots"><i /><i /><i /></span>
          ) : state.status === 'listening' || state.status === 'speaking' ? (
            <span className="mini-wave">
              {[0.55, 0.9, 1, 0.75, 0.5].map((w, i) => (
                <i key={i} style={{ height: `${Math.max(3, Math.min(16, 3 + level * 26 * w))}px` }} />
              ))}
            </span>
          ) : (
            <span className={`mini-orb ${state.wake && !state.muted ? 'awake' : ''}`} />
          )}
        </span>

        <span className="mini-text">
          <span className="mini-title">JARVIS</span>
          <span className="mini-caption">{caption}</span>
        </span>

        {!expanded && <span className="mini-time">{time}</span>}

        <button
          className={`mini-btn ${active ? 'stop' : ''}`}
          onClick={(e) => { e.stopPropagation(); ipc()?.send('mini-action', 'listen'); /* main window decides: talk, finish or stop */ }}
          aria-label={active ? t('Durdur', 'Stop') : t('Konuş', 'Talk')}
          title={active ? t('Durdur', 'Stop') : t('Konuş', 'Talk')}
        >
          {active ? (
            <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden="true"><rect width="10" height="10" rx="2.5" fill="currentColor" /></svg>
          ) : (
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <rect x="9" y="2.5" width="6" height="12" rx="3" fill="currentColor" stroke="none" />
              <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}

export default MiniBar;
