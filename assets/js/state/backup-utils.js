// Pure helpers for deterministic local backup naming and retention.
function createDailyBackupKey(day, prefix = 'life_rpg_v4_backup_') {
  if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    throw new TypeError('day must use YYYY-MM-DD format');
  }
  return prefix + day.replace(/-/g, '');
}

function getBackupKeysToDelete(keys, prefix, keep) {
  if (!Array.isArray(keys)) throw new TypeError('keys must be an array');
  if (typeof prefix !== 'string' || !prefix) throw new TypeError('prefix is required');
  if (!Number.isInteger(keep) || keep < 0) throw new TypeError('keep must be a non-negative integer');
  return keys
    .filter(key => typeof key === 'string' && key.startsWith(prefix))
    .sort()
    .reverse()
    .slice(keep);
}
