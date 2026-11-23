export const GEMINI_CONFIG = {
  // Used only when the model list can't be fetched. Normally JARVIS asks the API which
  // models this key can use and picks the newest fast "flash" model automatically,
  // so retired model names no longer break the assistant.
  MODELS: [
    'gemini-flash-latest',
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
  ],
  TTS_MODELS: [
    'gemini-2.5-flash-preview-tts',
  ],
  // One request may take this long before the next model is tried...
  REQUEST_TIMEOUT_MS: 12000,
  // ...but the whole answer must arrive within this, so "Thinking…" never hangs.
  TOTAL_DEADLINE_MS: 25000,
  TTS_TIMEOUT_MS: 15000,
  DISCOVERY_TIMEOUT_MS: 4000,
  // Messages of context sent with every request: the whole conversation since JARVIS was
  // opened (kept until it quits), capped only as a safety net for very long sessions
  HISTORY_TURNS: 400,
};
