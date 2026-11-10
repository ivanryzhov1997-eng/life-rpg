// ===================== STATE SERIALIZATION =====================
// Returns a detached, storage-safe snapshot. Never mutates live application state.
function createPersistedState(currentState, schemaVersion) {
  const snapshot = JSON.parse(JSON.stringify(currentState));
  if (snapshot.ai) delete snapshot.ai.apiKey;
  snapshot.schemaVersion = schemaVersion;
  return snapshot;
}


// The local version marker is written first. If the primary write then fails,
// the old save remains intact but is visibly dirty, so cloudLoad cannot mistake
// it for a synchronized copy and silently replace it.
function persistStateSnapshot(storage, storageKey, timestampKey, currentState, schemaVersion, localVersion) {
  const snapshot = createPersistedState(currentState, schemaVersion);
  storage.setItem(timestampKey, localVersion);
  storage.setItem(storageKey, JSON.stringify(snapshot));
  return snapshot;
}
