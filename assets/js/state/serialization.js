// ===================== STATE SERIALIZATION =====================
// Returns a detached, storage-safe snapshot. Never mutates live application state.
function createPersistedState(currentState, schemaVersion) {
  const snapshot = JSON.parse(JSON.stringify(currentState));
  if (snapshot.ai) delete snapshot.ai.apiKey;
  snapshot.schemaVersion = schemaVersion;
  return snapshot;
}
