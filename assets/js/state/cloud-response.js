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
