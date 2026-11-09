// ===================== INITIAL STATE =====================
// Pure factory: every app instance starts with a fresh, independent state object.
function createInitialState(schemaVersion) {
  return {
    schemaVersion,
    hero: { name: 'Безымянный герой', xp: 0, titleId: 'newbie' },
    directions: [],
    quests: [],
    goals: [],
    lore: [],
    activityLog: [],
    rewardLedger: [],
    stats: { completed: 0, totalXp: 0 },
    streak: { current: 0, longest: 0, lastDate: null },
    unlockedTitles: ['newbie'],
    unlockedAchievements: [],
    reflections: [],
    ai: {
      model: 'openai/gpt-oss-20b',
      preferredDifficulty: { SIDE: 2, MAIN: 3, BOSS: 2 }
    },
    ui: {
      lastEveningRitual: null,
      questSort: 'default'
    }
  };
}
