export const ALLOWED_AI_MODELS = Object.freeze([
  'openai/gpt-oss-20b',
  'openai/gpt-oss-120b'
]);

export const MAX_PROMPT_CHARS = 50000;
export const MAX_COMPLETION_TOKENS = 3500;

export function validateAiProxyPayload(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, error: 'Invalid JSON body' };
  }

  if (!ALLOWED_AI_MODELS.includes(input.model)) {
    return { ok: false, error: 'Unsupported model' };
  }

  if (!Array.isArray(input.messages) || input.messages.length !== 2) {
    return { ok: false, error: 'Exactly two messages are required' };
  }

  const [system, user] = input.messages;
  if (!system || system.role !== 'system' || typeof system.content !== 'string' ||
      !user || user.role !== 'user' || typeof user.content !== 'string') {
    return { ok: false, error: 'Messages must contain system and user text' };
  }

  const systemText = system.content.trim();
  const userText = user.content.trim();
  if (!systemText || !userText) {
    return { ok: false, error: 'Messages cannot be empty' };
  }

  if (systemText.length + userText.length > MAX_PROMPT_CHARS) {
    return { ok: false, error: 'Prompt is too large' };
  }

  const requestedTokens = Number.isInteger(input.max_tokens) ? input.max_tokens : MAX_COMPLETION_TOKENS;
  const maxTokens = Math.min(MAX_COMPLETION_TOKENS, Math.max(1, requestedTokens));
  const requestedTemperature = Number.isFinite(input.temperature) ? input.temperature : 0.7;
  const temperature = Math.min(1, Math.max(0, requestedTemperature));

  // Forward only the fields the application needs; ignore arbitrary client options.
  return {
    ok: true,
    payload: {
      model: input.model,
      messages: [
        { role: 'system', content: systemText },
        { role: 'user', content: userText }
      ],
      temperature,
      max_tokens: maxTokens
    }
  };
}

export function classifyAiProxyToken(token, anonKey) {
  if (!token || token === anonKey || token.startsWith('sb_publishable_')) {
    return { kind: 'guest' };
  }
  return { kind: 'user', token };
}

export function buildAiProxyQuotaWindows(identity, now = Date.now()) {
  const minute = Math.floor(now / 60000);
  const day = Math.floor(now / 86400000);
  return [
    { bucket: identity + ':minute:' + minute, windowSeconds: 60 },
    { bucket: identity + ':day:' + day, windowSeconds: 86400 }
  ];
}
