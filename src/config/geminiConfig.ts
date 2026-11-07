export const GEMINI_CONFIG = {
  // Gemini 1.5 and 2.0 models are retired; keep this list on current stable models.
  // Any other model the key can access is discovered at runtime and tried afterwards.
  MODELS: [
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
    'gemini-2.5-pro'
  ],
  CHAT_MODEL: 'gemini-2.5-flash',
  REQUEST_TIMEOUT_MS: 15000,
  DISCOVERY_TIMEOUT_MS: 3500
};
