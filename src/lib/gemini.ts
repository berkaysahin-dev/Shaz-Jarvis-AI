// Thin Gemini REST client: model discovery, failover with a hard deadline,
// clear error kinds for the UI, and text-to-speech.

import { GEMINI_CONFIG } from '../config/geminiConfig';

const API = 'https://generativelanguage.googleapis.com/v1beta';

export type GeminiErrorKind = 'auth' | 'quota' | 'region' | 'network' | 'timeout' | 'server' | 'empty' | 'blocked' | 'aborted';

export class GeminiError extends Error {
  kind: GeminiErrorKind;
  constructor(kind: GeminiErrorKind, message: string) {
    super(message);
    this.kind = kind;
  }
}

export interface Part {
  text?: string;
  inline_data?: { mime_type: string; data: string };
  functionCall?: { name: string; args: any };
  functionResponse?: { name: string; response: any };
}
export interface Content { role: 'user' | 'model'; parts: Part[] }

export interface GenerateResult {
  text: string;
  functionCalls: { name: string; args: any }[];
  model: string;
}

/* --------------------------------------------------------------------------
   Model discovery
   -------------------------------------------------------------------------- */

let modelCache: { key: string; names: string[] } | null = null;

async function listModels(apiKey: string): Promise<string[]> {
  if (modelCache?.key === apiKey) return modelCache.names;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GEMINI_CONFIG.DISCOVERY_TIMEOUT_MS);
  try {
    const res = await fetch(`${API}/models?pageSize=200`, {
      headers: { 'x-goog-api-key': apiKey },
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw toGeminiError(res.status, data?.error);
    const names: string[] = (data.models || [])
      .filter((m: any) => (m.supportedGenerationMethods || []).includes('generateContent'))
      .map((m: any) => String(m.name).replace(/^models\//, ''));
    modelCache = { key: apiKey, names };
    return names;
  } catch (e) {
    // Auth problems are worth surfacing right away; anything else falls back to defaults
    if (e instanceof GeminiError && (e.kind === 'auth' || e.kind === 'region')) throw e;
    console.warn('[Gemini] model discovery failed, using defaults', e);
    return [];
  } finally {
    clearTimeout(timer);
  }
}

const EXCLUDE = /(tts|image|live|native-audio|embedding|computer-use|robotics|learnlm|gemma|aqa|veo|imagen|lyria|thinking-exp|deep-research|customtools)/i;

function versionOf(name: string): number {
  const m = name.match(/gemini-(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : 0;
}

function isPreview(name: string) {
  return /(preview|exp|\d{2}-\d{2}$)/i.test(name);
}

function rankChat(names: string[], preferLite: boolean): string[] {
  const usable = names.filter(n => n.startsWith('gemini') && !EXCLUDE.test(n) && /(flash|pro)/.test(n));
  const score = (n: string) => {
    if (n === 'gemini-flash-latest') return preferLite ? 900 : 1000;
    if (n === 'gemini-flash-lite-latest') return preferLite ? 1000 : 880;
    const lite = /flash-lite/.test(n);
    const flash = /flash/.test(n) && !lite;
    let s = versionOf(n) * 100;
    if (flash) s += preferLite ? 30 : 50;
    else if (lite) s += preferLite ? 50 : 20;
    else s -= 40; // pro: slowest, last resort for a voice assistant
    if (isPreview(n)) s -= 15;
    return s;
  };
  return [...usable].sort((a, b) => score(b) - score(a));
}

function rankTts(names: string[]): string[] {
  const tts = names.filter(n => /tts/i.test(n) && n.startsWith('gemini'));
  const score = (n: string) => versionOf(n) * 100 + (/flash/.test(n) ? 20 : 0) - (isPreview(n) ? 5 : 0);
  return [...tts].sort((a, b) => score(b) - score(a));
}

async function candidates(apiKey: string, kind: 'chat' | 'fast' | 'tts'): Promise<string[]> {
  const names = await listModels(apiKey);
  let ranked: string[];
  if (kind === 'tts') ranked = rankTts(names);
  else ranked = rankChat(names, kind === 'fast');
  const defaults = kind === 'tts' ? GEMINI_CONFIG.TTS_MODELS : GEMINI_CONFIG.MODELS;
  // Discovered models first (they are known to exist for this key), defaults after
  return Array.from(new Set([...ranked, ...(names.length ? [] : defaults)])).slice(0, 3);
}

/* --------------------------------------------------------------------------
   Errors
   -------------------------------------------------------------------------- */

function toGeminiError(status: number, err: any): GeminiError {
  const msg = String(err?.message || '');
  const code = String(err?.status || '');
  if (/API key not valid|API_KEY_INVALID|api key expired/i.test(msg) || status === 401 || code === 'UNAUTHENTICATED') {
    return new GeminiError('auth', 'API anahtarı geçersiz. Ayarlardan doğru Gemini anahtarını girin.');
  }
  if (status === 403 || code === 'PERMISSION_DENIED') {
    return new GeminiError('auth', 'Bu API anahtarının Gemini erişimi yok. AI Studio’da yeni bir anahtar oluşturun.');
  }
  if (/location is not supported|User location/i.test(msg) || code === 'FAILED_PRECONDITION') {
    return new GeminiError('region', 'Gemini API bulunduğunuz bölgede kullanılamıyor.');
  }
  if (status === 429 || code === 'RESOURCE_EXHAUSTED') {
    return new GeminiError('quota', 'Gemini kullanım kotası doldu. Biraz bekleyip tekrar deneyin.');
  }
  if (status >= 500) return new GeminiError('server', 'Gemini sunucuları şu an yanıt vermiyor.');
  return new GeminiError('server', msg || `Gemini hatası (${status}).`);
}

/* --------------------------------------------------------------------------
   generateContent with failover and a total deadline
   -------------------------------------------------------------------------- */

function thinkingFor(model: string): any | undefined {
  // Thinking adds seconds of latency that a voice assistant can't afford
  if (/2\.5-flash/.test(model)) return { thinkingBudget: 0 };
  if (/gemini-3/.test(model) || /flash-latest|flash-lite-latest/.test(model)) return { thinkingLevel: 'low' };
  return undefined;
}

interface GenerateOptions {
  apiKey: string;
  contents: Content[];
  system?: string;
  tools?: any[];
  fast?: boolean;
  maxOutputTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
  deadlineMs?: number;
}

export async function generate(opts: GenerateOptions): Promise<GenerateResult> {
  const apiKey = opts.apiKey.trim();
  if (!apiKey) throw new GeminiError('auth', 'API anahtarı eksik. Ayarlardan Gemini anahtarınızı girin.');

  const models = await candidates(apiKey, opts.fast ? 'fast' : 'chat');
  const deadline = Date.now() + (opts.deadlineMs ?? GEMINI_CONFIG.TOTAL_DEADLINE_MS);
  let lastError: GeminiError | null = null;

  for (const model of models) {
    let thinking = thinkingFor(model);
    for (let attempt = 0; attempt < 2; attempt++) {
      if (opts.signal?.aborted) throw new GeminiError('aborted', 'İptal edildi.');
      const remaining = deadline - Date.now();
      if (remaining < 1500) break;

      const controller = new AbortController();
      const onAbort = () => controller.abort();
      opts.signal?.addEventListener('abort', onAbort);
      const timer = setTimeout(() => controller.abort(), Math.min(remaining, GEMINI_CONFIG.REQUEST_TIMEOUT_MS));

      const body: any = {
        contents: opts.contents,
        generationConfig: {
          maxOutputTokens: opts.maxOutputTokens ?? 1024,
          temperature: opts.temperature ?? 0.7,
          ...(thinking ? { thinkingConfig: thinking } : {}),
        },
      };
      if (opts.system) body.systemInstruction = { parts: [{ text: opts.system }] };
      if (opts.tools?.length) body.tools = opts.tools;

      try {
        const res = await fetch(`${API}/models/${model}:generateContent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          const msg = String(data?.error?.message || '');
          // This model doesn't accept the thinking setting: retry the same model without it
          if (res.status === 400 && thinking && /thinking/i.test(msg)) { thinking = undefined; continue; }
          const err = toGeminiError(res.status, data?.error);
          if (err.kind === 'auth' || err.kind === 'region') throw err; // another model won't help
          console.warn(`[Gemini] ${model} failed (${res.status}): ${msg}`);
          lastError = res.status === 404 || res.status === 400 ? (lastError ?? err) : err;
          break;
        }

        const cand = data?.candidates?.[0];
        const parts: any[] = cand?.content?.parts || [];
        const text = parts.filter(p => p.text && !p.thought).map(p => p.text).join('').trim();
        const functionCalls = parts.filter(p => p.functionCall).map(p => ({ name: p.functionCall.name, args: p.functionCall.args || {} }));

        if (!text && functionCalls.length === 0) {
          const reason = cand?.finishReason || data?.promptFeedback?.blockReason || 'UNKNOWN';
          if (/SAFETY|BLOCK|PROHIBITED/i.test(reason)) {
            throw new GeminiError('blocked', 'Bu isteğe güvenlik filtresi nedeniyle yanıt verilemedi.');
          }
          console.warn(`[Gemini] ${model} returned no content (finishReason: ${reason})`);
          lastError = new GeminiError('empty', 'Gemini boş yanıt döndürdü. Lütfen tekrar deneyin.');
          break;
        }
        return { text, functionCalls, model };
      } catch (e: any) {
        if (e instanceof GeminiError) throw e;
        if (opts.signal?.aborted) throw new GeminiError('aborted', 'İptal edildi.');
        if (e?.name === 'AbortError') {
          lastError = new GeminiError('timeout', 'Gemini zamanında yanıt vermedi. İnternet bağlantınızı kontrol edin.');
        } else {
          // fetch() rejects only when the request never reached Google
          throw new GeminiError('network', 'İnternete bağlanılamadı. Bağlantınızı kontrol edin.');
        }
        break;
      } finally {
        clearTimeout(timer);
        opts.signal?.removeEventListener('abort', onAbort);
      }
    }
  }

  throw lastError ?? new GeminiError('server', 'Gemini yanıt vermedi.');
}

/** Verifies the key and returns the model JARVIS will use. */
export async function testConnection(apiKey: string): Promise<string> {
  modelCache = null;
  const res = await generate({
    apiKey,
    contents: [{ role: 'user', parts: [{ text: 'Sadece "tamam" yaz.' }] }],
    fast: true,
    maxOutputTokens: 20,
    deadlineMs: 15000,
  });
  return res.model;
}

/* --------------------------------------------------------------------------
   Text-to-speech
   -------------------------------------------------------------------------- */

export async function synthesizeSpeech(apiKey: string, text: string, voice: string, style: string, signal?: AbortSignal): Promise<{ data: string; mimeType: string }> {
  const models = await candidates(apiKey.trim(), 'tts');
  let lastError: GeminiError | null = null;
  for (const model of models) {
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    signal?.addEventListener('abort', onAbort);
    const timer = setTimeout(() => controller.abort(), GEMINI_CONFIG.TTS_TIMEOUT_MS);
    try {
      const res = await fetch(`${API}/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey.trim() },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: `${style}\n\n${text}` }] }],
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
          },
        }),
        signal: controller.signal,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        lastError = toGeminiError(res.status, data?.error);
        if (lastError.kind === 'auth') throw lastError;
        continue;
      }
      const part = (data?.candidates?.[0]?.content?.parts || []).find((p: any) => p.inlineData?.data);
      if (part) return { data: part.inlineData.data, mimeType: part.inlineData.mimeType || 'audio/L16;rate=24000' };
      lastError = new GeminiError('empty', 'Ses üretilemedi.');
    } catch (e: any) {
      if (e instanceof GeminiError) throw e;
      if (signal?.aborted) throw new GeminiError('aborted', 'İptal edildi.');
      lastError = new GeminiError(e?.name === 'AbortError' ? 'timeout' : 'network', 'Ses servisine ulaşılamadı.');
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  }
  throw lastError ?? new GeminiError('server', 'Ses üretilemedi.');
}
