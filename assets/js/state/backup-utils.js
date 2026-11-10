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

function backupRawSave(storage, raw, prefix, stamp, keep = 5) {
  if (!storage || typeof storage.setItem !== 'function' || typeof storage.key !== 'function'
      || typeof storage.removeItem !== 'function' || !Number.isInteger(storage.length)) {
    throw new TypeError('storage must support localStorage operations');
  }
  if (typeof raw !== 'string') throw new TypeError('raw save must be a string');
  if (typeof prefix !== 'string' || !prefix) throw new TypeError('prefix is required');
  if (typeof stamp !== 'string' || !stamp) throw new TypeError('stamp is required');
  if (!Number.isInteger(keep) || keep < 0) throw new TypeError('keep must be a non-negative integer');
  const key = prefix + stamp;
  storage.setItem(key, raw);
  const keys = [];
  for (let i = 0; i < storage.length; i++) {
    const itemKey = storage.key(i);
    if (itemKey && itemKey.startsWith(prefix)) keys.push(itemKey);
  }
  getBackupKeysToDelete(keys, prefix, keep).forEach(itemKey => storage.removeItem(itemKey));
  return key;
}
