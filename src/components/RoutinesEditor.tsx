import type { Routine, RoutineAction, RoutineActionType } from '../hooks/useJarvis';

// Editor for custom commands: "when I say X, reply Y and do Z".

export const DEFAULT_ROUTINES: Routine[] = [
  {
    id: 'welcome',
    trigger: '',
    reply: 'Merhaba efendim, hoş geldiniz.',
    actions: [{ type: 'app', value: 'brave' }],
    enabled: true,
  },
];

const APP_OPTIONS: { value: string; tr: string; en: string }[] = [
  { value: 'brave', tr: 'Brave', en: 'Brave' },
  { value: 'chrome', tr: 'Google Chrome', en: 'Google Chrome' },
  { value: 'edge', tr: 'Microsoft Edge', en: 'Microsoft Edge' },
  { value: 'operagx', tr: 'Opera GX', en: 'Opera GX' },
  { value: 'firefox', tr: 'Firefox', en: 'Firefox' },
  { value: 'youtube', tr: 'YouTube', en: 'YouTube' },
  { value: 'spotify', tr: 'Spotify', en: 'Spotify' },
  { value: 'discord', tr: 'Discord', en: 'Discord' },
  { value: 'steam', tr: 'Steam', en: 'Steam' },
  { value: 'whatsapp', tr: 'WhatsApp', en: 'WhatsApp' },
  { value: 'telegram', tr: 'Telegram', en: 'Telegram' },
  { value: 'vscode', tr: 'VS Code', en: 'VS Code' },
  { value: 'notepad', tr: 'Not Defteri', en: 'Notepad' },
  { value: 'calculator', tr: 'Hesap Makinesi', en: 'Calculator' },
  { value: 'explorer', tr: 'Dosya Gezgini', en: 'File Explorer' },
  { value: 'downloads', tr: 'İndirilenler', en: 'Downloads' },
  { value: 'desktop', tr: 'Masaüstü klasörü', en: 'Desktop folder' },
  { value: 'documents', tr: 'Belgeler', en: 'Documents' },
  { value: 'settings', tr: 'Windows Ayarları', en: 'Windows Settings' },
  { value: 'task_manager', tr: 'Görev Yöneticisi', en: 'Task Manager' },
  { value: 'terminal', tr: 'Terminal', en: 'Terminal' },
  { value: 'mail', tr: 'Posta', en: 'Mail' },
  { value: 'calendar', tr: 'Takvim', en: 'Calendar' },
];

const MEDIA_OPTIONS = [
  { value: 'playpause', tr: 'Oynat / Duraklat', en: 'Play / Pause' },
  { value: 'next', tr: 'Sonraki parça', en: 'Next track' },
  { value: 'previous', tr: 'Önceki parça', en: 'Previous track' },
  { value: 'volume_up', tr: 'Sesi aç', en: 'Volume up' },
  { value: 'volume_down', tr: 'Sesi kıs', en: 'Volume down' },
  { value: 'mute', tr: 'Sessize al', en: 'Mute' },
];

const ACTION_TYPES: { value: RoutineActionType; tr: string; en: string }[] = [
  { value: 'app', tr: 'Uygulama aç', en: 'Open app' },
  { value: 'url', tr: 'Web sitesi aç', en: 'Open website' },
  { value: 'search', tr: 'Google’da ara', en: 'Search Google' },
  { value: 'youtube', tr: 'YouTube’da ara', en: 'Search YouTube' },
  { value: 'media', tr: 'Medya kontrolü', en: 'Media control' },
  { value: 'file', tr: 'Program / dosya aç', en: 'Open program / file' },
];

const defaultValue = (type: RoutineActionType) => (type === 'app' ? 'brave' : type === 'media' ? 'playpause' : '');

const newId = () => Math.random().toString(36).slice(2, 10);

interface Props {
  routines: Routine[];
  onChange: (next: Routine[]) => void;
  onTry: (r: Routine) => void;
  language: string;
}

export function RoutinesEditor({ routines, onChange, onTry, language }: Props) {
  const tr = language === 'tr-TR';
  const t = (a: string, b: string) => (tr ? a : b);

  const update = (id: string, patch: Partial<Routine>) =>
    onChange(routines.map(r => (r.id === id ? { ...r, ...patch } : r)));
  const updateAction = (r: Routine, i: number, patch: Partial<RoutineAction>) =>
    update(r.id, { actions: r.actions.map((a, j) => (j === i ? { ...a, ...patch } : a)) });

  const pickFile = async (r: Routine, i: number) => {
    const path = await (window as any).require?.('electron')?.ipcRenderer?.invoke('pick-file').catch(() => null);
    if (path) updateAction(r, i, { value: path });
  };

  const add = () =>
    onChange([...routines, { id: newId(), trigger: '', reply: '', actions: [{ type: 'app', value: 'brave' }], enabled: true }]);

  return (
    <div className="routines">
      {routines.length === 0 && (
        <div className="group"><div className="empty-hint">{t('Henüz komut yok.', 'No commands yet.')}</div></div>
      )}

      {routines.map((r, idx) => {
        const wakeOnly = !r.trigger.trim() && r.trigger !== ' ';
        return (
          <div key={r.id} className={`group routine ${r.enabled === false ? 'off' : ''}`}>
            <div className="group-row routine-head">
              <span className="routine-index">{idx + 1}</span>
              <div className="segmented small" role="radiogroup">
                <button
                  role="radio"
                  aria-checked={wakeOnly}
                  className={wakeOnly ? 'selected' : ''}
                  onClick={() => update(r.id, { trigger: '' })}
                >{t('Sadece “Hey Jarvis”', 'Just “Hey Jarvis”')}</button>
                <button
                  role="radio"
                  aria-checked={!wakeOnly}
                  className={!wakeOnly ? 'selected' : ''}
                  onClick={() => update(r.id, { trigger: r.trigger.trim() ? r.trigger : ' ' })}
                >{t('Bir cümle', 'A phrase')}</button>
              </div>
              <div className="routine-head-actions">
                <button
                  type="button"
                  role="switch"
                  aria-checked={r.enabled !== false}
                  aria-label={t('Komut açık', 'Command on')}
                  className={`switch ${r.enabled !== false ? 'on' : ''}`}
                  onClick={() => update(r.id, { enabled: r.enabled === false })}
                >
                  <span className="switch-thumb" />
                </button>
              </div>
            </div>

            {!wakeOnly && (
              <div className="group-row stack">
                <span className="routine-label">{t('Ne dediğinizde?', 'When you say')}</span>
                <input
                  className="text-field"
                  value={r.trigger.trimStart()}
                  placeholder={t('örn. iyi geceler', 'e.g. good night')}
                  onChange={(e) => update(r.id, { trigger: e.target.value || ' ' })}
                />
              </div>
            )}

            <div className="group-row stack">
              <span className="routine-label">{t('JARVIS ne desin?', 'JARVIS says')}</span>
              <input
                className="text-field"
                value={r.reply}
                placeholder={t('örn. Merhaba efendim, hoş geldiniz.', 'e.g. Welcome back, sir.')}
                onChange={(e) => update(r.id, { reply: e.target.value })}
              />
            </div>

            <div className="group-row stack">
              <span className="routine-label">{t('Ne yapsın?', 'Then do')}</span>
              {r.actions.map((a, i) => (
                <div key={i} className="routine-action">
                  <select
                    className="select-field"
                    value={a.type}
                    onChange={(e) => {
                      const type = e.target.value as RoutineActionType;
                      updateAction(r, i, { type, value: defaultValue(type) });
                    }}
                  >
                    {ACTION_TYPES.map(o => <option key={o.value} value={o.value}>{tr ? o.tr : o.en}</option>)}
                  </select>

                  {a.type === 'app' && (
                    <select className="select-field grow" value={a.value} onChange={(e) => updateAction(r, i, { value: e.target.value })}>
                      {APP_OPTIONS.map(o => <option key={o.value} value={o.value}>{tr ? o.tr : o.en}</option>)}
                    </select>
                  )}
                  {a.type === 'media' && (
                    <select className="select-field grow" value={a.value} onChange={(e) => updateAction(r, i, { value: e.target.value })}>
                      {MEDIA_OPTIONS.map(o => <option key={o.value} value={o.value}>{tr ? o.tr : o.en}</option>)}
                    </select>
                  )}
                  {(a.type === 'url' || a.type === 'search' || a.type === 'youtube') && (
                    <input
                      className="text-field grow"
                      value={a.value}
                      placeholder={a.type === 'url' ? t('örn. instagram.com', 'e.g. instagram.com') : a.type === 'youtube' ? t('örn. lo-fi müzik', 'e.g. lo-fi music') : t('örn. hava durumu', 'e.g. weather')}
                      onChange={(e) => updateAction(r, i, { value: e.target.value })}
                    />
                  )}
                  {a.type === 'file' && (
                    <button className="btn btn-secondary btn-sm grow file-pick" onClick={() => pickFile(r, i)} title={a.value}>
                      {a.value ? a.value.split(/[\\/]/).pop() : t('Seç…', 'Choose…')}
                    </button>
                  )}

                  <button
                    className="icon-btn"
                    onClick={() => update(r.id, { actions: r.actions.filter((_, j) => j !== i) })}
                    aria-label={t('İşlemi kaldır', 'Remove action')}
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
                  </button>
                </div>
              ))}
              <button
                className="link-btn routine-add-action"
                onClick={() => update(r.id, { actions: [...r.actions, { type: 'app', value: 'brave' }] })}
              >
                + {t('İşlem ekle', 'Add action')}
              </button>
            </div>

            <div className="group-row routine-foot">
              <button className="btn btn-plain btn-sm" onClick={() => onTry(r)}>{t('Dene', 'Try it')}</button>
              <button className="btn btn-plain btn-sm danger" onClick={() => onChange(routines.filter(x => x.id !== r.id))}>
                {t('Komutu sil', 'Delete command')}
              </button>
            </div>
          </div>
        );
      })}

      <button className="btn btn-secondary routine-new" onClick={add}>+ {t('Yeni komut', 'New command')}</button>
    </div>
  );
}

export default RoutinesEditor;
