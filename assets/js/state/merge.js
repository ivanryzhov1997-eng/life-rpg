// Pure ID-mapped merge for imported saves. Migration and ID generation are injected.
function mergeImportedStateData(incoming, target, migrate, createId) {
  if (typeof migrate !== 'function' || typeof createId !== 'function') throw new TypeError('Merge dependencies are required');
  const src = migrate(incoming);
  const out = JSON.parse(JSON.stringify(target || {}));
  const clone = value => JSON.parse(JSON.stringify(value));
  const arr = key => Array.isArray(out[key]) ? out[key] : (out[key] = []);
  const srcArr = key => Array.isArray(src[key]) ? src[key] : [];
  const norm = value => String(value || '').trim().toLocaleLowerCase();
  const reserve = (candidate, used) => {
    let id = candidate == null ? '' : String(candidate);
    if (!id || used.has(id)) id = String(createId());
    while (!id || used.has(id)) id = String(createId());
    used.add(id);
    return id;
  };

  const directions = arr('directions');
  const directionIds = new Set(directions.map(x => String(x.id || '')).filter(Boolean));
  const nodeIds = new Set(directions.flatMap(x => (x.nodes || []).map(n => String(n.id || '')).filter(Boolean)));
  const directionMap = new Map(), nodeMap = new Map();

  srcArr('directions').forEach(source => {
    let dest = directions.find(x => source.id && x.id === source.id)
      || directions.find(x => norm(x.name) && norm(x.name) === norm(source.name));
    if (!dest) {
      dest = clone(source);
      dest.id = reserve(source.id, directionIds);
      dest.nodes = [];
      directions.push(dest);
    }
    if (!Array.isArray(dest.nodes)) dest.nodes = [];
    dest.xp = Math.max(Number(dest.xp) || 0, Number(source.xp) || 0);
    dest.lastActiveAt = Math.max(Number(dest.lastActiveAt) || 0, Number(source.lastActiveAt) || 0);
    if (!dest.description && source.description) dest.description = source.description;
    if (source.id != null) directionMap.set(String(source.id), String(dest.id));

    let pending = (source.nodes || []).map(clone);
    for (let pass = 0; pass <= pending.length && pending.length; pass++) {
      const next = [];
      pending.forEach(node => {
        const oldParent = node.parentId == null ? null : String(node.parentId);
        const mappedParent = oldParent == null ? null : nodeMap.get(oldParent);
        const parentPresent = oldParent == null || mappedParent || dest.nodes.some(n => String(n.id) === oldParent);
        if (!parentPresent && pass < pending.length) { next.push(node); return; }
        const parentId = oldParent == null ? null : (mappedParent || null);
        const match = (node.id && dest.nodes.find(n => String(n.id) === String(node.id)))
          || dest.nodes.find(n => norm(n.name) === norm(node.name) && (n.parentId || null) === parentId);
        let actual = match;
        if (!actual) {
          actual = clone(node);
          actual.id = reserve(node.id, nodeIds);
          actual.parentId = parentId;
          dest.nodes.push(actual);
        }
        actual.xp = Math.max(Number(actual.xp) || 0, Number(node.xp) || 0);
        actual.lastActiveAt = Math.max(Number(actual.lastActiveAt) || 0, Number(node.lastActiveAt) || 0);
        if (!actual.description && node.description) actual.description = node.description;
        if (node.isKey) actual.isKey = true;
        if (node.id != null) nodeMap.set(String(node.id), String(actual.id));
      });
      pending = next;
    }
    // Malformed legacy parent chains are retained as root nodes instead of being lost.
    pending.forEach(node => {
      const match = dest.nodes.find(n => norm(n.name) === norm(node.name) && !n.parentId);
      const actual = match || clone(node);
      if (!match) {
        actual.id = reserve(node.id, nodeIds);
        actual.parentId = null;
        dest.nodes.push(actual);
      }
      if (node.id != null) nodeMap.set(String(node.id), String(actual.id));
    });
  });

  const goals = arr('goals'), goalIds = new Set(goals.map(x => String(x.id || '')).filter(Boolean));
  const goalMap = new Map();
  srcArr('goals').forEach(source => {
    const directionId = source.directionId == null ? null : (directionMap.get(String(source.directionId)) || null);
    const dest = goals.find(x => source.id && x.id === source.id)
      || goals.find(x => norm(x.title) === norm(source.title)
        && (x.horizon || 'medium') === (source.horizon || 'medium')
        && (x.directionId || null) === directionId);
    if (dest) {
      const a = dest.metric || (dest.metric = { target: 1, current: 0, unitLabel: 'ед.' });
      const b = source.metric || {};
      a.target = Math.max(1, Number(a.target) || 1, Number(b.target) || 1);
      a.current = Math.min(a.target, Math.max(0, Number(a.current) || 0, Number(b.current) || 0));
      if (!a.unitLabel) a.unitLabel = b.unitLabel || 'ед.';
      if (a.current >= a.target || source.status === 'done') {
        dest.status = 'done';
        dest.completedAt = Math.max(Number(dest.completedAt) || 0, Number(source.completedAt) || 0) || dest.completedAt;
      }
      if (source.id != null) goalMap.set(String(source.id), String(dest.id));
    } else {
      const goal = clone(source);
      goal.id = reserve(source.id, goalIds);
      goal.directionId = directionId;
      goals.push(goal);
      if (source.id != null) goalMap.set(String(source.id), String(goal.id));
    }
  });

  const quests = arr('quests'), questIds = new Set(quests.map(x => String(x.id || '')).filter(Boolean));
  const questMap = new Map();
  srcArr('quests').forEach(source => {
    // Stable IDs identify the same quest. Legacy records without IDs are
    // deduplicated only by exact content; equal titles alone are not sufficient.
    const dest = (source.id && quests.find(x => x.id === source.id))
      || (!source.id && quests.find(x => JSON.stringify(x) === JSON.stringify(source)));
    if (dest) {
      if (source.id != null) questMap.set(String(source.id), String(dest.id));
      // A newer backup may contain the completion of a quest that is still open locally.
      if (source.done && !dest.done) {
        ['done', 'completedAt', 'result', 'goalResultUnits', 'earnedXp', 'lastRewardEventId',
          'habitStreak', 'habitBest', 'lastHabitDay', 'habitStreakBeforeUndo', 'habitStreakUndoDay'].forEach(key => {
          if (source[key] !== undefined) dest[key] = clone(source[key]);
        });
      }
      if (source.lastHabitRewardDay && (!dest.lastHabitRewardDay || source.lastHabitRewardDay > dest.lastHabitRewardDay)) {
        dest.lastHabitRewardDay = source.lastHabitRewardDay;
      }
      return;
    }
    const quest = clone(source);
    quest.id = reserve(source.id, questIds);
    if (quest.targetType === 'DIRECTION') {
      const oldId = String(quest.targetId);
      quest.targetId = directionMap.get(oldId) || (directions.some(x => String(x.id) === oldId) ? oldId : null);
    } else if (quest.targetType === 'SKILL') {
      const oldId = String(quest.targetId);
      quest.targetId = nodeMap.get(oldId) || (directions.some(d => (d.nodes || []).some(n => String(n.id) === oldId)) ? oldId : null);
    } else quest.targetId = null;
    if (!quest.targetId) quest.targetType = 'GENERAL';
    if (quest.goalId != null) {
      const oldGoalId = String(quest.goalId);
      quest.goalId = goalMap.get(oldGoalId) || (goals.some(g => String(g.id) === oldGoalId) ? oldGoalId : null);
    } else quest.goalId = null;
    if (!quest.goalId) quest.goalUnits = 0;
    quests.push(quest);
    if (source.id != null) questMap.set(String(source.id), String(quest.id));
  });

  const ledger = arr('rewardLedger'), activity = arr('activityLog');
  const eventIds = new Set([
    ...ledger.map(x => String(x.eventId || '')).filter(Boolean),
    ...activity.map(x => String(x.id || '')).filter(Boolean)
  ]);
  const eventMap = new Map();
  [...srcArr('rewardLedger'), ...srcArr('activityLog')].forEach(item => {
    const id = item.eventId || item.id;
    if (id == null || eventMap.has(String(id))) return;
    const exists = ledger.some(x => String(x.eventId) === String(id))
      || activity.some(x => String(x.id) === String(id));
    eventMap.set(String(id), exists ? String(id) : reserve(id, eventIds));
  });
  srcArr('rewardLedger').forEach(item => {
    if (item.eventId == null) return;
    const event = clone(item), id = eventMap.get(String(item.eventId)) || String(item.eventId);
    if (ledger.some(x => String(x.eventId) === id)) return;
    event.eventId = id;
    if (event.questId != null) {
      const oldQuestId = String(event.questId);
      event.questId = questMap.get(oldQuestId) || (quests.some(q => String(q.id) === oldQuestId) ? oldQuestId : null);
    }
    ledger.push(event);
  });
  srcArr('activityLog').forEach(item => {
    if (item.id == null) return;
    const event = clone(item), id = eventMap.get(String(item.id)) || String(item.id);
    if (activity.some(x => String(x.id) === id)) return;
    event.id = id;
    if (event.questId != null) {
      const oldQuestId = String(event.questId);
      event.questId = questMap.get(oldQuestId) || (quests.some(q => String(q.id) === oldQuestId) ? oldQuestId : null);
    }
    if (event.goalId != null) {
      const oldGoalId = String(event.goalId);
      event.goalId = goalMap.get(oldGoalId) || (goals.some(g => String(g.id) === oldGoalId) ? oldGoalId : null);
    }
    activity.push(event);
  });
  quests.forEach(q => {
    if (q.lastRewardEventId && eventMap.has(String(q.lastRewardEventId))) q.lastRewardEventId = eventMap.get(String(q.lastRewardEventId));
  });

  const reflections = arr('reflections');
  srcArr('reflections').forEach(item => {
    const reflection = clone(item);
    if (reflection.questId != null) {
      const oldQuestId = String(reflection.questId);
      reflection.questId = questMap.get(oldQuestId) || (quests.some(q => String(q.id) === oldQuestId) ? oldQuestId : null);
    }
    if (!reflections.some(x => reflection.id && x.id ? x.id === reflection.id : JSON.stringify(x) === JSON.stringify(reflection))) reflections.push(reflection);
  });
  const lore = arr('lore');
  srcArr('lore').forEach(item => {
    if (!lore.some(x => x.text === item.text && x.date === item.date)) lore.push(clone(item));
  });

  if ((src.hero?.xp || 0) > (out.hero?.xp || 0)) out.hero = Object.assign({}, out.hero || {}, clone(src.hero));
  out.stats = Object.assign({}, out.stats || {});
  Object.keys(src.stats || {}).forEach(key => {
    if (typeof src.stats[key] === 'number') out.stats[key] = Math.max(Number(out.stats[key]) || 0, src.stats[key]);
  });
  out.streak = Object.assign({}, out.streak || {});
  out.streak.longest = Math.max(Number(out.streak.longest) || 0, Number(src.streak?.longest) || 0);
  if (src.streak?.lastDate && (!out.streak.lastDate || src.streak.lastDate > out.streak.lastDate)) {
    out.streak.current = src.streak.current || 0;
    out.streak.lastDate = src.streak.lastDate;
  }
  out.unlockedTitles = [...new Set([...(out.unlockedTitles || []), ...(src.unlockedTitles || [])])];
  out.unlockedAchievements = [...new Set([...(out.unlockedAchievements || []), ...(src.unlockedAchievements || [])])];
  const eventTime = value => {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) return numeric;
    const parsed = Date.parse(value || '');
    return Number.isFinite(parsed) ? parsed : 0;
  };
  ledger.sort((a, b) => eventTime(a.at) - eventTime(b.at));
  activity.sort((a, b) => eventTime(b.at) - eventTime(a.at));
  if (ledger.length > 500) out.rewardLedger = ledger.slice(-500);
  if (activity.length > 300) out.activityLog = activity.slice(0, 300);
  return out;
}
