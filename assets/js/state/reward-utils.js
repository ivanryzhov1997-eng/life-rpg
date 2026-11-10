// Pure reward idempotency helpers.
function hasHabitRewardForDay(quest, rewardLedger, dayKey) {
  if (!quest || !quest.id || !dayKey) return false;
  if (quest.lastHabitRewardDay === dayKey) return true;
  if (!Array.isArray(rewardLedger)) return false;
  return rewardLedger.some(event => {
    if (!event || event.questId !== quest.id || !event.habit || event.at == null) return false;
    const date = new Date(event.at);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === dayKey;
  });
}
