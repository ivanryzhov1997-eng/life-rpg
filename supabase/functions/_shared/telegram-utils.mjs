export const MAX_ACTIVITIES = 5;
export const ALLOWED_CATEGORIES = new Set(['study','programming','sport','creative','work','personal','other']);

export function normalizeProposal(input) {
  if (!input || typeof input !== 'object' || !Array.isArray(input.activities)) throw new Error('AI response must contain an activities array');
  if (input.activities.length < 1 || input.activities.length > MAX_ACTIVITIES) throw new Error('Activity count must be between 1 and 5');
  return input.activities.map((item) => {
    if (!item || typeof item !== 'object') throw new Error('Invalid activity');
    const title = String(item.title || '').trim().slice(0, 160);
    const description = String(item.description || '').trim().slice(0, 500);
    const category = ALLOWED_CATEGORIES.has(item.category) ? item.category : 'other';
    const duration = Number.isFinite(Number(item.duration_minutes)) ? Math.max(0, Math.min(1440, Math.floor(Number(item.duration_minutes)))) : 0;
    const quantity = Number.isFinite(Number(item.quantity)) ? Math.max(0, Math.min(1000000, Number(item.quantity))) : 0;
    const unit = String(item.unit || '').trim().slice(0, 24);
    if (!title) throw new Error('Activity title is required');
    return { title, description, category, duration_minutes: duration, quantity, unit };
  });
}

export function parseAiJson(content) {
  if (typeof content !== 'string' || !content.trim()) throw new Error('Empty AI response');
  const cleaned = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  return normalizeProposal(JSON.parse(cleaned));
}

export function constantTimeEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string' || left.length !== right.length) return false;
  let mismatch = 0;
  for (let i = 0; i < left.length; i++) mismatch |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return mismatch === 0;
}

export function isUuid(value) {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function formatProposal(activities) {
  return activities.map((item, index) => {
    const details = item.description ? ' — ' + item.description : '';
    const time = item.duration_minutes ? ' (' + item.duration_minutes + ' мин.)' : '';
    const amount = item.quantity ? ' · ' + item.quantity + (item.unit ? ' ' + item.unit : '') : '';
    return (index + 1) + '. ' + item.title + details + time + amount;
  }).join('\n');
}
