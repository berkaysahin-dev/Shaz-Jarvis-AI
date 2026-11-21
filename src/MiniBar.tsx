import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

// Desktop mini menu: a small capsule that floats over the desktop. It mirrors JARVIS's state
// (sent by the main window through the Electron main process), can be dragged anywhere, and
// has buttons for screen analysis, the microphone and talking.

type Status = 'idle' | 'listening' | 'processing' | 'speaking' | 'error';
interface JarvisState { status: Status; text?: string; wake?: boolean; muted?: boolean; language?: string }

const ipc = (): any | null => {
  try { return (window as any).require('electron').ipcRenderer; } catch { return null; }
};

const DRAG_THRESHOLD = 4;

export function MiniBar() {
  const [state, setState] = useState<JarvisState>({ status: 'idle', wake: false, muted: false, language: 'tr-TR' });
  const [level, setLevel] = useState(0);
  const [now, setNow] = useState(() => new Date());
  const [dragging, setDragging] = useState(false);
  const pillRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ x: number; y: number; moved: boolean; id: number } | null>(null);

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

  /* Drag anywhere on the capsule to move it; a click without movement opens JARVIS */
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    drag.current = { x: e.screenX, y: e.screenY, moved: false, id: e.pointerId };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.screenX - d.x;
    const dy = e.screenY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    if (!d.moved) { d.moved = true; setDragging(true); }
    d.x = e.screenX;
    d.y = e.screenY;
    ipc()?.send('mini-move', { dx, dy });
  };
  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* already released */ }
    if (!d) return;
    if (d.moved) {
      setDragging(false);
      ipc()?.send('mini-move-end');
    } else {
      ipc()?.send('mini-action', 'open');
    }
  };

  // Buttons must not start a drag or open the window
  const button = (action: string) => ({
    onPointerDown: (e: ReactPointerEvent) => e.stopPropagation(),
    onPointerUp: (e: ReactPointerEvent) => e.stopPropagation(),
    onClick: (e: React.MouseEvent) => { e.stopPropagation(); ipc()?.send('mini-action', action); },
  });

  const tr = (state.language || 'tr-TR') === 'tr-TR';
  const t = (a: string, b: string) => (tr ? a : b);
  const active = state.status === 'listening' || state.status === 'processing' || state.status === 'speaking';

  const caption = (() => {
    switch (state.status) {
      case 'listening': return state.text || t('Dinliyorum…', 'Listening…');
      case 'processing': return t('Düşünüyor…', 'Thinking…');
      case 'speaking': return state.text || t('Yanıtlıyor…', 'Responding…');
      case 'error': return state.text || t('Bir sorun oluştu', 'Something went wrong');
      default: return state.text || '';
    }
  })();

  const time = now.toLocaleTimeString(tr ? 'tr-TR' : 'en-US', { hour: '2-digit', minute: '2-digit' });
  const expanded = state.status === 'speaking' || (state.status === 'listening' && !!state.text);

  return (
    <div className="mini-root">
      <div
        ref={pillRef}
        className={`mini-pill ${state.status} ${expanded ? 'expanded' : ''} ${dragging ? 'dragging' : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => { drag.current = null; setDragging(false); }}
        title={t('Açmak için tıklayın, taşımak için sürükleyin', 'Click to open, drag to move')}
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
          {caption && <span className="mini-caption">{caption}</span>}
        </span>

        {!expanded && <span className="mini-time">{time}</span>}

        <span className="mini-actions">
          <button
            className="mini-btn"
            {...button('screen')}
            aria-label={t('Ekranı analiz et', 'Analyze screen')}
            title={t('Ekranı analiz et', 'Analyze screen')}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="2.5" y="4" width="19" height="13" rx="2" />
              <path d="M8.5 20.5h7M12 17v3.5" />
              <path d="M12 7.6l.7 1.6 1.6.7-1.6.7-.7 1.6-.7-1.6-1.6-.7 1.6-.7z" fill="currentColor" strokeWidth="1" />
            </svg>
          </button>

          <button
            className={`mini-btn ${state.muted ? 'muted' : ''}`}
            {...button('mute')}
            aria-pressed={!!state.muted}
            aria-label={state.muted ? t('Mikrofonu aç', 'Unmute microphone') : t('Mikrofonu kapat', 'Mute microphone')}
            title={state.muted ? t('Mikrofonu aç', 'Unmute microphone') : t('Mikrofonu kapat', 'Mute microphone')}
          >
            {state.muted ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M15 9.5V5.5a3 3 0 0 0-5.7-1.3M9 9v2.5a3 3 0 0 0 4.9 2.3M18.5 11a6.4 6.4 0 0 1-1 3.4M5.5 11a6.5 6.5 0 0 0 10.4 5.2M12 17.5V21M3 3l18 18" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <rect x="9" y="2.5" width="6" height="12" rx="3" />
                <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
              </svg>
            )}
          </button>

          <button
            className={`mini-btn talk ${active ? 'stop' : ''}`}
            {...button('listen')}
            disabled={!!state.muted && !active}
            aria-label={active ? t('Durdur', 'Stop') : t('Konuş', 'Talk')}
            title={active ? t('Durdur', 'Stop') : t('Konuş', 'Talk')}
          >
            {active ? (
              <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden="true"><rect width="10" height="10" rx="2.5" fill="currentColor" /></svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M3 11v2M7 8v8M11 4v16M15 7v10M19 10v4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" fill="none" />
              </svg>
            )}
          </button>
        </span>
      </div>
    </div>
  );
}

export default MiniBar;
