// ===================== STATE SERIALIZATION =====================
// Returns a detached, storage-safe snapshot. Never mutates live application state.
function createPersistedState(currentState, schemaVersion) {
  const snapshot = JSON.parse(JSON.stringify(currentState));
  if (snapshot.ai) delete snapshot.ai.apiKey;
  snapshot.schemaVersion = schemaVersion;
  return snapshot;
}


// Writes the primary snapshot first. Timestamp metadata is best-effort and must
// not make a successful primary save look like a failure.
function persistStateSnapshot(storage, storageKey, timestampKey, currentState, schemaVersion, savedAt) {
  const snapshot = createPersistedState(currentState, schemaVersion);
  storage.setItem(storageKey, JSON.stringify(snapshot));
  try {
    storage.setItem(timestampKey, savedAt);
  } catch (error) {
    // The primary state record is already durable; metadata can be repaired later.
  }
  return snapshot;
}
