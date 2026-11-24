import test from 'node:test';
import assert from 'node:assert/strict';
import { constantTimeEqual, formatProposal, isLinkCode, isUuid, normalizeProposal, parseAiJson } from '../supabase/functions/_shared/telegram-utils.mjs';

test('normalizes valid proposals and clamps numeric fields', () => {
  const [activity] = normalizeProposal({ activities: [{ title: ' Python practice ', description: 'Built a function', category: 'programming', duration_minutes: 9999, quantity: -3, unit: 'minutes' }] });
  assert.equal(activity.title, 'Python practice');
  assert.equal(activity.duration_minutes, 1440);
  assert.equal(activity.quantity, 0);
  assert.equal(activity.category, 'programming');
});

test('rejects empty, oversized, and malformed proposals', () => {
  assert.throws(() => normalizeProposal({ activities: [] }));
  assert.throws(() => normalizeProposal({ activities: Array(6).fill({ title: 'x' }) }));
  assert.throws(() => normalizeProposal({ activities: [{ title: '' }] }));
});

test('parses fenced JSON and validates shape', () => {
  const result = parseAiJson('```json\n{"activities":[{"title":"Run","category":"sport"}]}\n```');
  assert.equal(result[0].title, 'Run');
  assert.equal(result[0].category, 'sport');
});

test('accepts an explicit empty extraction result', () => {
  assert.deepEqual(parseAiJson('{"activities":[]}'), []);
});

test('constant-time comparator returns expected equality results', () => {
  assert.equal(constantTimeEqual('secret', 'secret'), true);
  assert.equal(constantTimeEqual('secret', 'secreT'), false);
  assert.equal(constantTimeEqual('short', 'longer'), false);
});

test('UUID validator rejects arbitrary callback data', () => {
  assert.equal(isUuid('b9e0b2c1-1e3d-4a5f-8b7c-9d0e1f2a3b4c'), true);
  assert.equal(isUuid('confirm:123'), false);
});

test('formats a compact confirmation preview', () => {
  assert.match(formatProposal([{ title: 'Study', description: 'Solved 2 problems', duration_minutes: 30 }]), /Study.*30 мин/);
});

test('link codes require 12 hexadecimal characters', () => {
  assert.equal(isLinkCode('a1b2c3d4e5f6'), true);
  assert.equal(isLinkCode('123456'), false);
  assert.equal(isLinkCode('not-a-code-!'), false);
});
