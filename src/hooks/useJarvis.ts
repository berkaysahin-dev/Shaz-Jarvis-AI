import { useState, useRef, useCallback, useEffect } from 'react';
import { GEMINI_CONFIG } from '../config/geminiConfig';
import { MicRecorder, playAudio, playJarvisSound, base64ToBytes, type Playback, type RecordingEnd } from '../lib/audio';
import { generate, synthesizeSpeech, testConnection, GeminiError, type Content, type Part, type GeminiErrorKind } from '../lib/gemini';

export { playJarvisSound };
export type JarvisStatus = 'idle' | 'listening' | 'processing' | 'speaking' | 'error';
export type JarvisLanguage = 'tr-TR' | 'en-US';
export type VoiceEngine = 'gemini' | 'edge';
export type JarvisErrorKind = GeminiErrorKind | 'mic' | 'key';
type ListenMode = 'active' | 'followup' | 'passive';

export interface Message {
  role: 'user' | 'model' | 'system';
  content: string;
}

// Gemini HD voices (studio quality, many languages including Turkish)
export const GEMINI_VOICES = [
  { id: 'Charon', tr: 'Charon — derin, bilgilendirici', en: 'Charon — deep, informative' },
  { id: 'Orus', tr: 'Orus — kararlı, net', en: 'Orus — firm, clear' },
  { id: 'Fenrir', tr: 'Fenrir — enerjik', en: 'Fenrir — energetic' },
  { id: 'Iapetus', tr: 'Iapetus — sakin, berrak', en: 'Iapetus — calm, clear' },
  { id: 'Kore', tr: 'Kore — kadın, net', en: 'Kore — female, firm' },
  { id: 'Aoede', tr: 'Aoede — kadın, akıcı', en: 'Aoede — female, breezy' },
];

// Microsoft neural voices (fast, free, used as fallback)
export const EDGE_VOICES = [
  { id: 'tr-TR-AhmetNeural', tr: 'Ahmet — Türkçe erkek', en: 'Ahmet — Turkish male' },
  { id: 'tr-TR-EmelNeural', tr: 'Emel — Türkçe kadın', en: 'Emel — Turkish female' },
  { id: 'en-US-AndrewMultilingualNeural', tr: 'Andrew — çok dilli', en: 'Andrew — multilingual' },
  { id: 'en-GB-RyanNeural', tr: 'Ryan — İngiliz aksanı', en: 'Ryan — British' },
];

const isElectron = typeof window !== 'undefined' && !!(window as any).require;
const ipc = (): any | null => {
  if (!isElectron) return null;
  try { return (window as any).require('electron').ipcRenderer; } catch { return null; }
};

function readPref<T extends string | number | boolean>(key: string, fallback: T): T {
  const v = localStorage.getItem(key);
  if (v === null) return fallback;
  if (typeof fallback === 'number') return (parseFloat(v) || fallback) as T;
  if (typeof fallback === 'boolean') return (v === 'true') as T;
  return v as T;
}

/* --------------------------------------------------------------------------
   Tools Gemini can call to act on the computer
   -------------------------------------------------------------------------- */

const TOOLS = [{
  functionDeclarations: [
    {
      name: 'open_app',
      description: 'Bilgisayarda bir uygulamayı veya klasörü açar.',
      parameters: {
        type: 'OBJECT',
        properties: {
          app: {
            type: 'STRING',
            enum: ['chrome', 'brave', 'edge', 'firefox', 'operagx', 'youtube', 'spotify', 'discord', 'steam', 'whatsapp', 'telegram', 'vscode', 'notepad', 'calculator', 'explorer', 'downloads', 'desktop', 'documents', 'settings', 'task_manager', 'paint', 'terminal', 'camera_app', 'mail', 'calendar'],
          },
        },
        required: ['app'],
      },
    },
    {
      name: 'web_search',
      description: 'Tarayıcıda arama yapar veya YouTube’da video/şarkı açar, haritada yer arar.',
      parameters: {
        type: 'OBJECT',
        properties: {
          query: { type: 'STRING' },
          site: { type: 'STRING', enum: ['google', 'youtube', 'maps', 'wikipedia', 'translate'] },
        },
        required: ['query'],
      },
    },
    {
      name: 'control_media',
      description: 'Müzik/medya ve sistem sesini kontrol eder.',
      parameters: {
        type: 'OBJECT',
        properties: { action: { type: 'STRING', enum: ['playpause', 'next', 'previous', 'volume_up', 'volume_down', 'mute'] } },
        required: ['action'],
      },
    },
    {
      name: 'set_reminder',
      description: 'Belirli bir süre sonra bildirimle hatırlatma yapar.',
      parameters: {
        type: 'OBJECT',
        properties: {
          message: { type: 'STRING' },
          delay_seconds: { type: 'NUMBER' },
        },
        required: ['message', 'delay_seconds'],
      },
    },
    {
      name: 'save_note',
      description: 'Kullanıcının notlarına yeni bir not ekler.',
      parameters: { type: 'OBJECT', properties: { text: { type: 'STRING' } }, required: ['text'] },
    },
    {
      name: 'get_notes',
      description: 'Kayıtlı notları okur.',
      parameters: { type: 'OBJECT', properties: {} },
    },
    {
      name: 'search_file',
      description: 'İndirilenler, Masaüstü veya Belgeler’de adıyla dosya bulup açar.',
      parameters: {
        type: 'OBJECT',
        properties: {
          file_name: { type: 'STRING' },
          folder: { type: 'STRING', enum: ['downloads', 'desktop', 'documents', 'any'] },
        },
        required: ['file_name'],
      },
    },
    {
      name: 'remember',
      description: 'Kullanıcı hakkında kalıcı bir bilgiyi hatırlar (ör. adı, sevdiği şeyler).',
      parameters: {
        type: 'OBJECT',
        properties: { key: { type: 'STRING' }, value: { type: 'STRING' } },
        required: ['key', 'value'],
      },
    },
    {
      name: 'get_system_status',
      description: 'İşlemci, bellek ve pil durumunu verir.',
      parameters: { type: 'OBJECT', properties: {} },
    },
    {
      name: 'lock_screen',
      description: 'Bilgisayarı kilitler.',
      parameters: { type: 'OBJECT', properties: {} },
    },
  ],
}];

// Tools whose result must be read and summarised by the model before replying
const INFO_TOOLS = new Set(['get_notes', 'get_system_status']);

async function runTool(name: string, args: any): Promise<string> {
  const r = ipc();
  if (!r) return 'Bu işlem yalnızca masaüstü uygulamasında yapılabilir.';
  const map: Record<string, [string, any]> = {
    open_app: ['open_app', { appName: args.app }],
    web_search: ['web_search', { query: args.query, site: args.site || 'google' }],
    control_media: ['control_media', { action: args.action }],
    set_reminder: ['set_reminder', { title: args.message, delaySeconds: Math.max(1, Math.round(args.delay_seconds || 60)) }],
    save_note: ['save_note', { text: args.text }],
    get_notes: ['get_notes', {}],
    search_file: ['search_file', { fileName: args.file_name, targetFolder: args.folder === 'any' ? '' : args.folder }],
    remember: ['save_memory', { key: args.key, value: args.value }],
    get_system_status: ['get_system_status', {}],
    lock_screen: ['lock_screen', {}],
  };
  const target = map[name];
  if (!target) return 'Bilinmeyen işlem.';
  try {
    const res = await r.invoke('execute-tool', { name: target[0], args: target[1] });
    return typeof res === 'string' ? res : JSON.stringify(res);
  } catch (e: any) {
    return `İşlem başarısız: ${e?.message || e}`;
  }
}

/* --------------------------------------------------------------------------
   Speech helpers
   -------------------------------------------------------------------------- */

// How "Jarvis" comes back from speech-to-text, especially with a Turkish accent:
// "Jarvis", "Jarvis'e", "Carvis", "Çarvis", "Cervis", "Jervis", "Javis", "Jarwis"…
const WAKE_WORD = /^(jarv|carv|çarv|cerv|çerv|jerv|charv|jarw|carw|jav[iıy]s|jarb[iı]s)/;
// Words that may come before the name: "Hey, Jarvis", "Merhaba Jarvis", "Tamam Jarvis"
const WAKE_FILLERS = new Set(['hey', 'heyy', 'hei', 'hay', 'ey', 'hi', 'hello', 'merhaba', 'selam', 'alo', 'ok', 'okay', 'tamam', 'oke']);
const wordKey = (w: string) => w.toLocaleLowerCase('tr-TR').replace(/[^a-zçğıöşü]/g, '');

function stripWakeWord(text: string): { woke: boolean; rest: string } {
  const t = text.trim();
  const words = t.split(/\s+/);
  for (let i = 0; i < Math.min(words.length, 3); i++) {
    if (!WAKE_WORD.test(wordKey(words[i]))) continue;
    if (!words.slice(0, i).every(w => WAKE_FILLERS.has(wordKey(w)))) break;
    const rest = words.slice(i + 1).join(' ').replace(/^[\s,.!?;:]+/, '').trim();
    return { woke: true, rest };
  }
  return { woke: false, rest: t };
}

/* --------------------------------------------------------------------------
   Custom commands ("routines") the user sets up in Settings
   -------------------------------------------------------------------------- */

export type RoutineActionType = 'app' | 'url' | 'search' | 'youtube' | 'media' | 'file';
export interface RoutineAction { type: RoutineActionType; value: string }
export interface Routine {
  id: string;
  /** What the user says. Empty = just "Hey Jarvis" on its own. */
  trigger: string;
  reply: string;
  actions: RoutineAction[];
  enabled?: boolean;
}

const normalizePhrase = (s: string) =>
  s.toLocaleLowerCase('tr-TR').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();

export function findRoutine(routines: Routine[], request: string, wakeWordOnly: boolean): Routine | undefined {
  const req = normalizePhrase(request);
  for (const r of routines) {
    if (r.enabled === false) continue;
    const trig = normalizePhrase(r.trigger || '');
    if (!trig) {
      // "" means "just Hey Jarvis"; a phrase command with nothing typed yet never matches
      if (wakeWordOnly && !r.trigger) return r;
      continue;
    }
    if (req && (req === trig || (trig.length >= 3 && req.includes(trig)))) return r;
  }
  return undefined;
}

async function runRoutineAction(a: RoutineAction): Promise<string> {
  const r = ipc();
  if (!r) return 'Bu işlem yalnızca masaüstü uygulamasında yapılabilir.';
  try {
    const res = await r.invoke('execute-tool', { name: 'routine_action', args: { type: a.type, value: a.value } });
    return typeof res === 'string' ? res : '';
  } catch (e: any) {
    return `İşlem başarısız: ${e?.message || e}`;
  }
}

const STOP_PHRASES = new Set([
  'dur', 'durdur', 'sus', 'yeter', 'iptal', 'kes', 'sessiz ol', 'tamam dur', 'tamam sus', 'tamam yeter', 'vazgeç',
  'stop', 'cancel', 'be quiet', 'quiet', 'shut up', 'never mind', 'nevermind',
]);

// Only a whole utterance that is a stop phrase stops JARVIS. "Müziği durdur" must reach Gemini.
function isStopCommand(text: string): boolean {
  const clean = text.toLocaleLowerCase('tr-TR').replace(/[.,!?;:'"]/g, '').replace(/\s+/g, ' ').trim();
  const { rest } = stripWakeWord(clean);
  return STOP_PHRASES.has(clean) || STOP_PHRASES.has(rest);
}

function speakable(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/[*#_`~>[\]()]/g, '')
    .replace(/\bhttps?:\/\/\S+/gi, '')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/* --------------------------------------------------------------------------
   Hook
   -------------------------------------------------------------------------- */

export function useJarvis(apiKey: string, language: JarvisLanguage = 'tr-TR', routines: Routine[] = []) {
  const tr = language === 'tr-TR';
  const [status, setStatus] = useState<JarvisStatus>('idle');
  const [audioLevel, setAudioLevel] = useState(0);
  const [conversation, setConversation] = useState<Message[]>([]);
  const [currentResponse, setCurrentResponse] = useState('');
  const [liveTranscript, setLiveTranscript] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [errorKind, setErrorKind] = useState<JarvisErrorKind | null>(null);
  const [notice, setNotice] = useState('');
  const [isMuted, setIsMuted] = useState(false);

  const [voicePitch, setVoicePitchState] = useState<number>(() => readPref<number>('jarvis_voice_pitch', 1.0));
  const [voiceRate, setVoiceRateState] = useState<number>(() => readPref<number>('jarvis_voice_rate', 1.0));
  const [voiceEngine, setVoiceEngineState] = useState<VoiceEngine>(() => readPref<string>('jarvis_voice_engine', 'gemini') as VoiceEngine);
  const [geminiVoice, setGeminiVoiceState] = useState<string>(() => readPref<string>('jarvis_gemini_voice', 'Charon'));
  const [edgeVoice, setEdgeVoiceState] = useState<string>(() => readPref<string>('jarvis_edge_voice', 'tr-TR-AhmetNeural'));
  const [isAlwaysListening, setIsAlwaysListening] = useState<boolean>(() => {
    // "Hey Jarvis" is on by default from this version; the toolbar button still turns it off
    if (!localStorage.getItem('jarvis_wake_v2')) {
      localStorage.setItem('jarvis_wake_v2', '1');
      localStorage.setItem('jarvis_always_listening', 'true');
      return true;
    }
    return readPref<boolean>('jarvis_always_listening', false);
  });

  const persist = <T,>(key: string, setter: (v: T) => void) => (v: T) => { setter(v); localStorage.setItem(key, String(v)); };
  const setVoicePitch = persist<number>('jarvis_voice_pitch', setVoicePitchState);
  const setVoiceRate = persist<number>('jarvis_voice_rate', setVoiceRateState);
  const setVoiceEngine = persist<VoiceEngine>('jarvis_voice_engine', setVoiceEngineState);
  const setGeminiVoice = persist<string>('jarvis_gemini_voice', setGeminiVoiceState);
  const setEdgeVoice = persist<string>('jarvis_edge_voice', setEdgeVoiceState);

  // Refs keep async callbacks reading current values instead of stale closures
  const live = useRef({ apiKey, language, isMuted, isAlwaysListening, voicePitch, voiceRate, voiceEngine, geminiVoice, edgeVoice, routines });
  live.current = { apiKey, language, isMuted, isAlwaysListening, voicePitch, voiceRate, voiceEngine, geminiVoice, edgeVoice, routines };

  const statusRef = useRef<JarvisStatus>('idle');
  const sessionRef = useRef(0);
  const recorderRef = useRef<MicRecorder | null>(null);
  const playbackRef = useRef<Playback | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const historyRef = useRef<Content[]>([]);
  const geminiTtsPausedUntil = useRef(0);
  const noticeTimer = useRef<any>(null);
  const startListeningRef = useRef<(mode?: ListenMode) => void>(() => {});
  const passiveFailures = useRef(0);

  const updateStatus = useCallback((s: JarvisStatus) => {
    statusRef.current = s;
    setStatus(s);
    if (s !== 'listening') setLiveTranscript('');
  }, []);

  const flashNotice = useCallback((text: string) => {
    setNotice(text);
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(''), 3500);
  }, []);

  const showError = useCallback((kind: JarvisErrorKind, message: string) => {
    setErrorKind(kind);
    setErrorMessage(message);
    updateStatus('error');
    playJarvisSound('error');
  }, [updateStatus]);

  const clearError = useCallback(() => { setErrorMessage(''); setErrorKind(null); }, []);

  const focusAppWindow = useCallback(() => { ipc()?.send('show-and-focus-window'); }, []);

  /** Cancels whatever JARVIS is doing and starts a new session id. */
  const haltAll = useCallback(() => {
    sessionRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    recorderRef.current?.cancel();
    recorderRef.current = null;
    playbackRef.current?.stop();
    playbackRef.current = null;
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    setAudioLevel(0);
    return sessionRef.current;
  }, []);

  const stopVoiceChat = useCallback(() => {
    haltAll();
    updateStatus('idle');
    playJarvisSound('stop');
  }, [haltAll, updateStatus]);

  /* ---------------- speaking ---------------- */

  const afterSpeaking = useCallback((session: number) => {
    if (session !== sessionRef.current) return;
    setAudioLevel(0);
    updateStatus('idle');
    if (live.current.isAlwaysListening && !live.current.isMuted) {
      // Keep the conversation going: a follow-up right after a reply needs no "Jarvis"
      setTimeout(() => {
        if (session === sessionRef.current && statusRef.current === 'idle') startListeningRef.current('followup');
      }, 350);
    }
  }, [updateStatus]);

  const speakWithBrowser = useCallback((text: string, session: number) => new Promise<void>((resolve) => {
    if (!('speechSynthesis' in window)) return resolve();
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = live.current.language;
    u.pitch = live.current.voicePitch;
    u.rate = live.current.voiceRate;
    const voices = window.speechSynthesis.getVoices();
    const lang = live.current.language.slice(0, 2);
    u.voice = voices.find(v => v.lang.startsWith(lang) && /natural|neural|online/i.test(v.name)) || voices.find(v => v.lang.startsWith(lang)) || null;
    u.onstart = () => { if (session === sessionRef.current) updateStatus('speaking'); };
    u.onend = () => resolve();
    u.onerror = () => resolve();
    window.speechSynthesis.speak(u);
  }), [updateStatus]);

  const speakText = useCallback(async (text: string, session = sessionRef.current, force?: { engine: VoiceEngine; voice: string }) => {
    const clean = speakable(text);
    if (!clean || session !== sessionRef.current) { afterSpeaking(session); return; }
    const p = live.current;
    const engine = force?.engine ?? p.voiceEngine;
    const controller = new AbortController();
    abortRef.current = controller;

    const play = async (bytes: Uint8Array, mime: string) => {
      if (session !== sessionRef.current) return;
      const pb = await playAudio(bytes, mime, setAudioLevel);
      playbackRef.current = pb;
      updateStatus('speaking');
      await pb.done;
    };

    try {
      // 1. Gemini HD voice
      if (engine === 'gemini' && p.apiKey && Date.now() > geminiTtsPausedUntil.current) {
        try {
          // Send only the reply text: the TTS model reads any style instruction aloud
          const voice = force?.engine === 'gemini' ? force.voice : p.geminiVoice;
          const audio = await synthesizeSpeech(p.apiKey, clean, voice, controller.signal);
          await play(base64ToBytes(audio.data), audio.mimeType);
          afterSpeaking(session);
          return;
        } catch (e) {
          if (e instanceof GeminiError && e.kind === 'aborted') return;
          if (session !== sessionRef.current) return;
          console.warn('[JARVIS] Gemini voice unavailable, using neural fallback', e);
          // Don't wait on a failing HD voice for every reply (free-tier quota is small)
          geminiTtsPausedUntil.current = Date.now() + 10 * 60 * 1000;
        }
      }

      // 2. Microsoft neural voice via the Electron main process
      const r = ipc();
      if (r) {
        try {
          const voice = force?.engine === 'edge' ? force.voice : p.edgeVoice;
          const b64: string | null = await r.invoke('synthesize-speech', {
            text: clean,
            voice,
            rate: p.voiceRate,
            pitch: p.voicePitch,
          });
          if (session !== sessionRef.current) return;
          if (b64) {
            await play(base64ToBytes(b64), 'audio/mpeg');
            afterSpeaking(session);
            return;
          }
        } catch (e) {
          console.warn('[JARVIS] neural voice failed', e);
        }
      }

      // 3. Built-in system voice
      if (session !== sessionRef.current) return;
      await speakWithBrowser(clean, session);
      afterSpeaking(session);
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      playbackRef.current = null;
    }
  }, [afterSpeaking, speakWithBrowser, tr, updateStatus]);

  /* ---------------- thinking ---------------- */

  const systemPrompt = async (): Promise<string> => {
    const now = new Date();
    const when = now.toLocaleString(live.current.language, { dateStyle: 'full', timeStyle: 'short' });
    let memory = '';
    try {
      const raw = await ipc()?.invoke('execute-tool', { name: 'get_memory', args: {} });
      if (raw && raw.trim().startsWith('{')) {
        const obj = JSON.parse(raw);
        memory = Object.entries(obj).map(([k, v]: any) => `${k}: ${v?.value ?? v}`).join('; ');
      }
    } catch { /* no memory yet */ }
    return live.current.language === 'tr-TR'
      ? [
          'Sen JARVIS’sin: Windows bilgisayarda çalışan zeki, nazik, hafif esprili ve son derece yetkin bir kişisel asistan.',
          'Yanıtların sesli okunacak: kısa (çoğunlukla 1-2 cümle), doğal ve akıcı Türkçe konuş. Markdown, liste, emoji veya bağlantı kullanma.',
          'Kullanıcıya zaman zaman "efendim" diye hitap edebilirsin. Bilmediğin güncel bilgiler için uydurma; gerekirse web_search ile tarayıcıda aç.',
          'Bilgisayarda bir işlem istenirse (uygulama açma, arama, müzik, hatırlatma, not, dosya, kilit) ilgili aracı çağır ve sonucu tek cümleyle bildir.',
          'Kullanıcı kendisiyle ilgili kalıcı bir bilgi paylaşırsa remember aracıyla kaydet.',
          `Şu an: ${when}.`,
          memory ? `Kullanıcı hakkında bildiklerin: ${memory}.` : '',
        ].filter(Boolean).join('\n')
      : [
          'You are JARVIS: a witty, polite and highly capable personal assistant running on a Windows PC.',
          'Your replies are spoken aloud: keep them short (usually 1-2 sentences) and natural. No markdown, lists, emoji or links.',
          'You may address the user as "sir". Do not invent current facts; use web_search to open the browser when needed.',
          'When asked to do something on the computer, call the matching tool and confirm in one sentence.',
          'When the user shares a lasting personal fact, save it with remember.',
          `Now: ${when}.`,
          memory ? `What you know about the user: ${memory}.` : '',
        ].filter(Boolean).join('\n');
  };

  const pushHistory = (c: Content) => {
    historyRef.current = [...historyRef.current, c].slice(-GEMINI_CONFIG.HISTORY_TURNS);
  };

  const handleFailure = useCallback((e: any, session: number) => {
    if (session !== sessionRef.current) return;
    if (e instanceof GeminiError) {
      if (e.kind === 'aborted') return;
      showError(e.kind, e.message);
    } else {
      console.error('[JARVIS]', e);
      showError('server', e?.message || (tr ? 'Beklenmeyen bir hata oluştu.' : 'Something went wrong.'));
    }
  }, [showError, tr]);

  /** Sends one user turn (text and/or media) and speaks the answer. */
  const runTurn = useCallback(async (parts: Part[], display: string, session: number, opts: { tools?: boolean } = {}) => {
    const key = live.current.apiKey;
    if (!key.trim()) {
      showError('key', tr ? 'Önce Ayarlar’dan Gemini API anahtarınızı girin.' : 'Add your Gemini API key in Settings first.');
      return;
    }
    clearError();
    setConversation(prev => [...prev, { role: 'user', content: display }]);
    updateStatus('processing');
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const system = await systemPrompt();
      const userContent: Content = { role: 'user', parts };
      const contents = [...historyRef.current, userContent];
      const result = await generate({
        apiKey: key,
        contents,
        system,
        tools: opts.tools === false ? undefined : TOOLS,
        signal: controller.signal,
      });
      if (session !== sessionRef.current) return;

      let reply = result.text;
      if (result.functionCalls.length) {
        const outputs: { name: string; result: string }[] = [];
        for (const call of result.functionCalls) {
          const out = await runTool(call.name, call.args);
          outputs.push({ name: call.name, result: out });
          setConversation(prev => [...prev, { role: 'system', content: out }]);
        }
        if (session !== sessionRef.current) return;
        playJarvisSound('success');

        if (!reply || outputs.some(o => INFO_TOOLS.has(o.name))) {
          // Let the model phrase the result naturally (needed for notes / status)
          const follow = await generate({
            apiKey: key,
            system,
            signal: controller.signal,
            contents: [
              ...contents,
              { role: 'model', parts: result.functionCalls.map(fc => ({ functionCall: fc })) },
              { role: 'user', parts: outputs.map(o => ({ functionResponse: { name: o.name, response: { result: o.result } } })) },
            ],
          }).catch(() => null);
          if (session !== sessionRef.current) return;
          reply = follow?.text || reply || outputs.map(o => o.result).join(' ');
        }
      }

      // Keep text-only history: small, and valid for every model
      const textParts = parts.filter(p => p.text);
      pushHistory({ role: 'user', parts: textParts.length ? textParts : [{ text: display }] });
      pushHistory({ role: 'model', parts: [{ text: reply }] });

      setConversation(prev => [...prev, { role: 'model', content: reply }]);
      setCurrentResponse(reply);
      if (abortRef.current === controller) abortRef.current = null;
      await speakText(reply, session);
    } catch (e) {
      handleFailure(e, session);
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, [clearError, handleFailure, showError, speakText, tr, updateStatus]);

  /** Runs a custom command: speaks its reply while its actions run. */
  const runRoutine = useCallback(async (r: Routine, display: string, session: number) => {
    clearError();
    setConversation(prev => [...prev, { role: 'user', content: display }]);
    const actions = (async () => {
      for (const a of r.actions) {
        if (!a.value?.trim() && a.type !== 'media') continue;
        const out = await runRoutineAction(a);
        if (out) setConversation(prev => [...prev, { role: 'system', content: out }]);
      }
      if (r.actions.length) playJarvisSound('success');
    })();
    const reply = r.reply.trim();
    if (reply) {
      setConversation(prev => [...prev, { role: 'model', content: reply }]);
      setCurrentResponse(reply);
      await speakText(reply, session);
    }
    await actions;
    if (!reply) afterSpeaking(session);
  }, [afterSpeaking, clearError, speakText]);

  /* ---------------- listening ---------------- */

  const transcribe = async (wavBase64: string, signal: AbortSignal): Promise<string> => {
    const res = await generate({
      apiKey: live.current.apiKey,
      fast: true,
      signal,
      temperature: 0,
      maxOutputTokens: 400,
      deadlineMs: 15000,
      system: 'You are a speech-to-text engine. Transcribe the audio exactly as spoken, in the language spoken (usually Turkish, sometimes English). The speaker often addresses the assistant by the name "Jarvis" (for example "Hey Jarvis"); always spell that name exactly "Jarvis". Output only the transcript text with normal punctuation. If there is no intelligible speech, output nothing.',
      contents: [{
        role: 'user',
        parts: [
          { text: 'Transcribe this recording.' },
          { inline_data: { mime_type: 'audio/wav', data: wavBase64 } },
        ],
      }],
    });
    return res.text.replace(/^["“]|["”]$/g, '').trim();
  };

  /**
   * active   – the user tapped or pressed Alt+Space: chime, "Listening…", no wake word needed
   * followup – right after JARVIS answered (hands-free mode): no chime, no wake word, short wait
   * passive  – background wake-word loop: silent, status stays idle, only "Jarvis …" is answered
   */
  const startListening = useCallback(async (mode: ListenMode = 'active') => {
    const p = live.current;
    const passive = mode === 'passive';
    if (!p.apiKey.trim()) {
      if (!passive) showError('key', tr ? 'Önce Ayarlar’dan Gemini API anahtarınızı girin.' : 'Add your Gemini API key in Settings first.');
      return;
    }
    if (p.isMuted) {
      if (!passive) flashNotice(tr ? 'Mikrofon kapalı' : 'Microphone is muted');
      return;
    }

    const session = haltAll();
    if (!passive) {
      clearError();
      setLiveTranscript('');
      updateStatus('listening');
      if (mode === 'active') playJarvisSound('start');
    }

    const backToWakeLoop = (delay = 0) => {
      if (statusRef.current === 'listening' || statusRef.current === 'processing') updateStatus('idle');
      if (!live.current.isAlwaysListening || live.current.isMuted) return;
      setTimeout(() => {
        if (session === sessionRef.current && statusRef.current === 'idle') startListeningRef.current('passive');
      }, delay);
    };

    const recorder = new MicRecorder();
    recorderRef.current = recorder;
    let result: RecordingEnd;
    try {
      result = await recorder.record({
        onLevel: (l) => { if (!passive && session === sessionRef.current) setAudioLevel(l); },
        endSilenceMs: passive ? 900 : 1300,
        noSpeechTimeoutMs: passive ? 30000 : mode === 'followup' ? 6000 : 8000,
        maxDurationMs: passive ? 9000 : 25000,
      });
    } catch (e: any) {
      if (session !== sessionRef.current) return;
      const denied = e?.name === 'NotAllowedError' || e?.name === 'SecurityError';
      const missing = e?.name === 'NotFoundError' || e?.name === 'OverconstrainedError';
      if (passive && !denied) { backToWakeLoop(5000); return; } // e.g. mic briefly busy
      showError('mic', denied
        ? (tr ? 'Mikrofon izni verilmedi. Windows Ayarlar › Gizlilik › Mikrofon’dan izin verin.' : 'Microphone access was denied.')
        : missing
          ? (tr ? 'Mikrofon bulunamadı. Bir mikrofon bağlı olduğundan emin olun.' : 'No microphone found.')
          : (tr ? `Mikrofon açılamadı: ${e?.message || e}` : `Could not open the microphone: ${e?.message || e}`));
      return;
    } finally {
      if (recorderRef.current === recorder) recorderRef.current = null;
    }

    if (session !== sessionRef.current || result.reason === 'cancelled') return;
    setAudioLevel(0);

    if (result.reason !== 'speech') {
      if (mode === 'active' && !live.current.isAlwaysListening) {
        updateStatus('idle');
        flashNotice(tr ? 'Ses algılanmadı' : 'Didn’t catch that');
        return;
      }
      backToWakeLoop();
      return;
    }

    // A wake phrase is short; long background talk (TV, a call) is never sent anywhere
    if (passive && result.durationMs > 8500) { backToWakeLoop(); return; }

    if (!passive) {
      playJarvisSound('process');
      updateStatus('processing');
    }
    const controller = new AbortController();
    abortRef.current = controller;
    let text = '';
    try {
      text = await transcribe(result.wavBase64, controller.signal);
      passiveFailures.current = 0;
    } catch (e) {
      if (session !== sessionRef.current) return;
      if (passive && !(e instanceof GeminiError && (e.kind === 'auth' || e.kind === 'region'))) {
        // Quiet retry with back-off instead of an error toast every few seconds
        passiveFailures.current += 1;
        backToWakeLoop(Math.min(60000, 3000 * passiveFailures.current));
        return;
      }
      handleFailure(e, session);
      return;
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
    if (session !== sessionRef.current) return;

    if (!text) {
      if (mode === 'active' && !live.current.isAlwaysListening) {
        updateStatus('idle');
        flashNotice(tr ? 'Anlaşılır bir konuşma algılanmadı' : 'No clear speech detected');
        return;
      }
      backToWakeLoop();
      return;
    }

    const { woke, rest } = stripWakeWord(text);
    if (passive) {
      if (!woke) { backToWakeLoop(); return; }
      // "Hey Jarvis": bring JARVIS up even if its window was closed to the tray
      focusAppWindow();
      playJarvisSound('wake');
    }

    if (isStopCommand(text)) { stopVoiceChat(); backToWakeLoop(400); return; }

    const routine = findRoutine(live.current.routines, woke ? rest : text, woke && !rest);
    if (routine) { await runRoutine(routine, text, session); return; }

    if (woke && !rest) {
      const reply = tr ? 'Buyurun efendim.' : 'Yes, sir?';
      setConversation(prev => [...prev, { role: 'user', content: text }, { role: 'model', content: reply }]);
      setCurrentResponse(reply);
      await speakText(reply, session);
      return;
    }
    const request = woke ? rest : text;
    await runTurn([{ text: request }], text, session);
  }, [clearError, flashNotice, focusAppWindow, haltAll, handleFailure, runRoutine, runTurn, showError, speakText, stopVoiceChat, tr, updateStatus]);

  startListeningRef.current = startListening;

  /** User tapped while listening: finish now and send what was said. */
  const stopListening = useCallback(() => {
    if (recorderRef.current) recorderRef.current.stopAndSend();
    else if (statusRef.current === 'listening') updateStatus('idle');
  }, [updateStatus]);

  /* ---------------- public actions ---------------- */

  const sendTextMessage = useCallback(async (text: string) => {
    const t = text.trim();
    if (!t) return;
    if (isStopCommand(t)) { stopVoiceChat(); return; }
    const session = haltAll();
    const { woke, rest } = stripWakeWord(t);
    const routine = findRoutine(live.current.routines, woke ? rest : t, woke && !rest);
    if (routine) { await runRoutine(routine, t, session); return; }
    await runTurn([{ text: woke && rest ? rest : t }], t, session);
  }, [haltAll, runRoutine, runTurn, stopVoiceChat]);

  const sendImageToGemini = useCallback(async (base64Image: string, promptText: string, display?: string) => {
    const session = haltAll();
    // Image questions only need a description, not computer actions: no tools keeps it fast
    await runTurn(
      [{ text: promptText || (tr ? 'Bu görüntüde ne var? Kısaca açıkla.' : 'What is in this image? Briefly explain.') }, { inline_data: { mime_type: 'image/jpeg', data: base64Image } }],
      display || (tr ? '📷 [Görüntü analizi]' : '📷 [Image analysis]'),
      session,
      { tools: false },
    );
  }, [haltAll, runTurn, tr]);

  const previewVoice = useCallback(async (engine: VoiceEngine, voice: string) => {
    const session = haltAll();
    updateStatus('processing');
    const sample = tr ? 'Merhaba efendim, ben JARVIS. Sizin için ne yapabilirim?' : 'Good evening, sir. I am JARVIS. How may I help?';
    if (engine === 'gemini') geminiTtsPausedUntil.current = 0;
    await speakText(sample, session, { engine, voice });
  }, [haltAll, speakText, tr, updateStatus]);

  const checkConnection = useCallback(async (key: string): Promise<{ ok: boolean; message: string }> => {
    try {
      const model = await testConnection(key);
      geminiTtsPausedUntil.current = 0;
      return { ok: true, message: tr ? `Bağlantı başarılı · ${model}` : `Connected · ${model}` };
    } catch (e: any) {
      return { ok: false, message: e?.message || String(e) };
    }
  }, [tr]);

  const clearConversation = useCallback(() => {
    historyRef.current = [];
    setConversation([]);
    setCurrentResponse('');
  }, []);

  const toggleMute = useCallback(() => {
    const next = !live.current.isMuted;
    live.current.isMuted = next;
    setIsMuted(next);
    if (next && (recorderRef.current || statusRef.current === 'listening')) {
      haltAll();
      updateStatus('idle');
    }
    if (!next && live.current.isAlwaysListening && statusRef.current === 'idle') {
      setTimeout(() => startListeningRef.current('passive'), 200);
    }
  }, [haltAll, updateStatus]);

  const toggleAlwaysListening = useCallback(() => {
    const next = !live.current.isAlwaysListening;
    live.current.isAlwaysListening = next;
    setIsAlwaysListening(next);
    localStorage.setItem('jarvis_always_listening', String(next));
    if (next && statusRef.current === 'idle') setTimeout(() => startListeningRef.current('passive'), 200);
    if (!next && statusRef.current !== 'processing' && statusRef.current !== 'speaking' && (recorderRef.current || statusRef.current === 'listening')) {
      haltAll();
      updateStatus('idle');
    }
  }, [haltAll, updateStatus]);

  // Hands-free mode: start the background wake-word loop on launch and once a key is saved
  useEffect(() => {
    if (!isAlwaysListening || !apiKey.trim() || isMuted) return;
    const t = setTimeout(() => {
      if (statusRef.current === 'idle' && !recorderRef.current) startListeningRef.current('passive');
    }, 800);
    return () => clearTimeout(t);
  }, [apiKey, isAlwaysListening, isMuted]);

  // Clean up the microphone and audio when the app unmounts
  useEffect(() => () => { haltAll(); }, [haltAll]);

  return {
    status,
    audioLevel,
    conversation,
    currentResponse,
    liveTranscript,
    errorMessage,
    errorKind,
    notice,
    isMuted,
    isAlwaysListening,
    toggleAlwaysListening,
    voicePitch,
    setVoicePitch,
    voiceRate,
    setVoiceRate,
    voiceEngine,
    setVoiceEngine,
    geminiVoice,
    setGeminiVoice,
    edgeVoice,
    setEdgeVoice,
    previewVoice,
    checkConnection,
    clearConversation,
    clearError,
    toggleMute,
    startListening,
    stopListening,
    stopVoiceChat,
    sendTextMessage,
    sendImageToGemini,
    playJarvisSound,
    focusAppWindow,
  };
}
