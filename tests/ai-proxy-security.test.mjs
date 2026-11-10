import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ALLOWED_AI_MODELS,
  MAX_COMPLETION_TOKENS,
  MAX_PROMPT_CHARS,
  buildAiProxyQuotaWindows,
  classifyAiProxyToken,
  validateAiProxyPayload,
} from '../supabase/functions/_shared/ai-proxy-security.mjs';

const validRequest = (overrides = {}) => ({
  model: 'openai/gpt-oss-20b',
  messages: [
    { role: 'system', content: 'You are a useful assistant.' },
    { role: 'user', content: 'Create one useful quest.' },
  ],
  temperature: 0.7,
  max_tokens: 3500,
  ...overrides,
});

test('accepts the app model and clamps completion parameters', () => {
  assert.ok(ALLOWED_AI_MODELS.includes('openai/gpt-oss-20b'));
  assert.ok(ALLOWED_AI_MODELS.includes('openai/gpt-oss-120b'));

  const result = validateAiProxyPayload(validRequest({
    temperature: 1.5,
    max_tokens: 9000,
    extra_provider_option: true,
  }));

  assert.equal(result.ok, true);
  assert.equal(result.payload.temperature, 1);
  assert.equal(result.payload.max_tokens, MAX_COMPLETION_TOKENS);
  assert.equal('extra_provider_option' in result.payload, false);
});

test('rejects unsupported models and malformed message structure', () => {
  assert.equal(validateAiProxyPayload(validRequest({ model: 'unknown/model' })).ok, false);
  assert.equal(validateAiProxyPayload(validRequest({ messages: [] })).ok, false);
  assert.equal(validateAiProxyPayload(validRequest({
    messages: [
      { role: 'tool', content: 'x' },
      { role: 'user', content: 'y' },
    ],
  })).ok, false);
});

test('rejects empty and oversized prompts', () => {
  assert.equal(validateAiProxyPayload(validRequest({
    messages: [
      { role: 'system', content: '  ' },
      { role: 'user', content: 'prompt' },
    ],
  })).ok, false);

  const tooLarge = 'x'.repeat(MAX_PROMPT_CHARS + 1);
  assert.equal(validateAiProxyPayload(validRequest({
    messages: [
      { role: 'system', content: tooLarge },
      { role: 'user', content: 'prompt' },
    ],
  })).ok, false);
});

test('classifies public keys as guests and access tokens as users', () => {
  assert.deepEqual(classifyAiProxyToken('', 'legacy-anon'), { kind: 'guest' });
  assert.deepEqual(classifyAiProxyToken('legacy-anon', 'legacy-anon'), { kind: 'guest' });
  assert.deepEqual(classifyAiProxyToken('sb_publishable_public', 'legacy-anon'), { kind: 'guest' });
  assert.deepEqual(classifyAiProxyToken('user-access-token', 'legacy-anon'), {
    kind: 'user',
    token: 'user-access-token',
  });
});

test('builds stable minute and daily quota buckets', () => {
  const first = buildAiProxyQuotaWindows('guest:hashed-ip', 1_800_000);
  const sameMinute = buildAiProxyQuotaWindows('guest:hashed-ip', 1_830_000);
  const nextMinute = buildAiProxyQuotaWindows('guest:hashed-ip', 1_860_000);

  assert.equal(first[0].bucket, sameMinute[0].bucket);
  assert.notEqual(first[0].bucket, nextMinute[0].bucket);
  assert.equal(first[1].bucket, nextMinute[1].bucket);
  assert.deepEqual(first.map((window) => window.windowSeconds), [60, 86400]);
});
