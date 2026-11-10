// Pure classification of the PostgREST response used by cloudLoad().
// A malformed existing row must never be treated as an empty table.
function classifyCloudRows(rows, validate) {
  if (!Array.isArray(rows)) {
    return { kind: 'invalid', error: 'Некорректный ответ облачного хранилища' };
  }
  if (rows.length > 1) {
    return { kind: 'invalid', error: 'В облаке найдено несколько сохранений для одного аккаунта' };
  }
  if (rows.length === 0) return { kind: 'empty' };

  const row = rows[0];
  const error = row && row.data
    ? validate(row.data)
    : 'облачная запись не содержит data';
  if (error) return { kind: 'invalid', error };
  return { kind: 'record', row };
}

// Decide whether syncCloudNow may fall back to uploading local state.
// Upload is safe only when cloudLoad completed successfully and found no row.
function getCloudSyncFallback(lastError) {
  if (lastError && lastError.startsWith('конфликт сохранений')) return 'conflict';
  if (lastError) return 'blocked';
  return 'upload';
}

function inspectLocalSave(raw, updatedAt, validate) {
  const timestamp = updatedAt || '';
  if (raw === null || raw === '') {
    return { hasData: false, isValid: false, updatedAt: timestamp };
  }
  try {
    const error = validate(JSON.parse(raw));
    return { hasData: true, isValid: !error, updatedAt: timestamp };
  } catch (e) {
    return { hasData: true, isValid: false, updatedAt: timestamp };
  }
}

 
// Prevent an existing local save from being silently copied between accounts.
function isLocalSaveOwnedByAnotherAccount(localOwner, userId, hasLocalData) {
  return !!(hasLocalData && localOwner && userId && localOwner !== userId);
}
 
// Build a compare-and-swap write. Existing rows are updated only when the
// server timestamp still matches the version last observed by this client.
// The first insert ignores a concurrent duplicate instead of overwriting it.
function buildCloudWriteRequest(tableName, userId, baseUpdatedAt, payload) {
  const table = encodeURIComponent(String(tableName));
  const uid = encodeURIComponent(String(userId));
  if (baseUpdatedAt) {
    return {
      method: 'PATCH',
      path: `/rest/v1/${table}?user_id=eq.${uid}&updated_at=eq.${encodeURIComponent(String(baseUpdatedAt))}`,
      prefer: 'return=representation',
      body: payload
    };
  }
  return {
    method: 'POST',
    path: `/rest/v1/${table}?on_conflict=user_id`,
    prefer: 'resolution=ignore-duplicates,return=representation',
    body: payload
  };
}

// A successful conditional write must return exactly one row and its
// server-generated updated_at. An empty representation means the CAS lost.
function classifyCloudWriteRows(rows) {
  if (!Array.isArray(rows)) {
    return { kind: 'invalid', error: 'Некорректный ответ записи облачного сохранения' };
  }
  if (rows.length === 0) return { kind: 'conflict' };
  if (rows.length !== 1) {
    return { kind: 'invalid', error: 'Облачная запись вернула неожиданное число строк' };
  }
  const row = rows[0];
  if (!row || typeof row.updated_at !== 'string' || !row.updated_at) {
    return { kind: 'invalid', error: 'Облачная запись не вернула updated_at' };
  }
  return { kind: 'saved', row };
}
 
// Timestamps are opaque server version tokens, not wall-clock comparisons.
// Any local divergence requires an explicit choice; this avoids clock-skew loss.
function needsCloudConflictChoice(localInfo, cloudRow, localOwner, userId) {
  if (!localInfo || !localInfo.isValid) return false;
  if (isLocalSaveOwnedByAnotherAccount(localOwner, userId, localInfo.hasData)) return true;
  const localVersion = localInfo.updatedAt || '';
  const cloudVersion = cloudRow && cloudRow.updated_at || '';
  return !localVersion || !cloudVersion || localVersion !== cloudVersion;
}
