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
