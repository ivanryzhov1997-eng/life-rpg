// Pure reward idempotency helpers.
function hasHabitRewardForDay(quest, rewardLedger, dayKey) {
  if (!quest || !quest.id || !dayKey) return false;
  if (quest.lastHabitRewardDay === dayKey) return true;
  if (!Array.isArray(rewardLedger)) return false;
  return rewardLedger.some(event => {
    if (!event || event.questId !== quest.id || !event.habit || event.at == null) return false;
    const date = new Date(event.at);
    if (Number.isNaN(date.getTime())) return false;
    const eventDay = date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0')
      + '-' + String(date.getDate()).padStart(2, '0');
    return eventDay === dayKey;
  });
}

function recordHabitStreakUndo(quest, dayKey) {
  if (!quest || !dayKey) return quest;
  if (quest.lastHabitDay === dayKey) {
    quest.habitStreakBeforeUndo = Math.max(0, Number(quest.habitStreak) || 1);
    quest.habitStreakUndoDay = dayKey;
    quest.habitStreak = Math.max(0, (Number(quest.habitStreak) || 1) - 1);
    quest.lastHabitDay = null;
  }
  return quest;
}

function applyHabitStreakCompletion(quest, dayKey, yesterdayKey, rewardAlreadyGrantedToday) {
  if (!quest || !dayKey) return quest;
  if (quest.habitStreakUndoDay && quest.habitStreakUndoDay !== dayKey) {
    delete quest.habitStreakBeforeUndo;
    delete quest.habitStreakUndoDay;
  }
  if (rewardAlreadyGrantedToday && quest.habitStreakUndoDay === dayKey) {
    quest.habitStreak = Math.max(0, Number(quest.habitStreakBeforeUndo) || 0);
    delete quest.habitStreakBeforeUndo;
    delete quest.habitStreakUndoDay;
  } else {
    const last = quest.lastHabitDay || null;
    if (last === yesterdayKey) quest.habitStreak = (quest.habitStreak || 0) + 1;
    else if (last !== dayKey) quest.habitStreak = 1;
  }
  quest.lastHabitDay = dayKey;
  quest.habitBest = Math.max(quest.habitBest || 0, quest.habitStreak || 0);
  return quest;
}
