// ===================== STATE SERIALIZATION =====================
// Returns a detached, storage-safe snapshot. Never mutates live application state.
function createPersistedState(currentState, schemaVersion) {
  const snapshot = JSON.parse(JSON.stringify(currentState));
  if (snapshot.ai) delete snapshot.ai.apiKey;
  snapshot.schemaVersion = schemaVersion;
  return snapshot;
}


// The local version marker is written first so any interrupted primary write
// remains visibly dirty and cannot be mistaken for an already-synced cloud copy.
function persistStateSnapshot(storage, storageKey, timestampKey, currentState, schemaVersion, localVersion) {
  const snapshot = createPersistedState(currentState, schemaVersion);
  const serialized = JSON.stringify(snapshot);
  let previousRaw;
  let previousVersion;
  try {
    previousRaw = storage.getItem(storageKey);
    previousVersion = storage.getItem(timestampKey);
  } catch (error) {
    throw new Error('Не удалось прочитать предыдущее сохранение перед записью');
  }
  try {
    storage.setItem(timestampKey, localVersion);
    storage.setItem(storageKey, serialized);
  } catch (error) {
    try {
      if (previousRaw === null) storage.removeItem(storageKey);
      else storage.setItem(storageKey, previousRaw);
      if (previousVersion === null) storage.removeItem(timestampKey);
      else storage.setItem(timestampKey, previousVersion);
    } catch (rollbackError) {
      error.rollbackFailed = true;
      error.rollbackError = rollbackError;
    }
    throw error;
  }
  return snapshot;
}
