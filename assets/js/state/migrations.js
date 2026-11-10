// ===================== STATE MIGRATIONS & VALIDATION =====================
// No DOM, network, localStorage, or application globals are accessed here.
// Dependencies are explicit so this module can be tested in isolation.
function normalizeStateData(data, schemaVersion, questXp) {
      data = data && typeof data === 'object' ? JSON.parse(JSON.stringify(data)) : {};
      const SCHEMA_VERSION = schemaVersion;
      const QUEST_XP = questXp;
      const s = {
        schemaVersion: SCHEMA_VERSION,
        hero: Object.assign({ name: 'Безымянный герой', xp: 0, titleId: 'newbie' }, data.hero || {}),
        directions: Array.isArray(data.directions) ? data.directions : [],
        quests: Array.isArray(data.quests) ? data.quests : [],
        goals: Array.isArray(data.goals) ? data.goals : [],
        lore: Array.isArray(data.lore) ? data.lore : [],
        activityLog: Array.isArray(data.activityLog) ? data.activityLog : [],
        rewardLedger: Array.isArray(data.rewardLedger) ? data.rewardLedger : [],
        stats: Object.assign({ completed: 0, totalXp: 0 }, data.stats || {}),
        streak: Object.assign({ current: 0, longest: 0, lastDate: null }, data.streak || {}),
        unlockedTitles: Array.isArray(data.unlockedTitles) ? data.unlockedTitles : ['newbie'],
        unlockedAchievements: Array.isArray(data.unlockedAchievements) ? data.unlockedAchievements : [],
        reflections: Array.isArray(data.reflections) ? data.reflections : [],
        ai: Object.assign({
          model: 'openai/gpt-oss-20b',
          preferredDifficulty: { SIDE: 2, MAIN: 3, BOSS: 2 }
        }, data.ai || {}),
        ui: Object.assign({ lastEveningRitual: null, questSort: 'default', dailyCapacity: 60 }, data.ui || {})
      };
      normalizeSkillTreeParents(s.directions);
      // API key migration is intentionally handled by the persistence wrapper.
      const deprecated = {
        'llama-3.3-70b-versatile': 'openai/gpt-oss-120b',
        'llama-3.1-8b-instant': 'openai/gpt-oss-20b',
        'gemma2-9b-it': 'openai/gpt-oss-20b',
        'llama-3.1-70b-versatile': 'openai/gpt-oss-120b'
      };
      if (deprecated[s.ai.model]) s.ai.model = deprecated[s.ai.model];
      if (!s.ai.model) s.ai.model = 'openai/gpt-oss-20b';
      if (!s.ai.preferredDifficulty) s.ai.preferredDifficulty = { SIDE: 2, MAIN: 3, BOSS: 2 };

      s.directions.forEach(d => {
        d.xp = d.xp || 0;
        if (!d.stage) d.stage = 'beginner';
        if (!Array.isArray(d.nodes)) d.nodes = [];
        d.nodes.forEach(n => { n.xp = n.xp || 0; });
      });
      s.quests.forEach(q => {
        if (typeof q.done !== 'boolean') q.done = !!q.done;
        if (!q.type || !QUEST_XP[q.type]) q.type = q.habit ? 'HABIT' : 'SIDE';
        if (q.type === 'HABIT') q.habit = true;
        if (!(q.difficulty >= 1 && q.difficulty <= 5)) q.difficulty = 2;
        if (!q.xp) q.xp = QUEST_XP[q.type]?.[q.difficulty] || 50;
        if (q.goalId === undefined) q.goalId = null;
        if (q.goalUnits == null) q.goalUnits = 0;
      });
      if (!Array.isArray(s.goals)) s.goals = [];
      s.goals.forEach(g => {
        if (!g.horizon || !['long','medium','short'].includes(g.horizon)) g.horizon = 'medium';
        if (!g.status) g.status = 'active';
        if (!g.metric) g.metric = { target: 1, current: 0, unitLabel: 'ед.' };
        g.metric.target = Math.max(1, Number(g.metric.target) || 1);
        g.metric.current = Math.max(0, Number(g.metric.current) || 0);
        if (!g.metric.unitLabel) g.metric.unitLabel = 'ед.';
      });
      if (!Array.isArray(s.unlockedTitles) || !s.unlockedTitles.length) s.unlockedTitles = ['newbie'];
      return s;
    }

    function validateImport(data) {
      if (!data || typeof data !== 'object') return 'Не объект';
      if (!data.hero || typeof data.hero !== 'object') return 'Нет hero';
      if (data.hero.xp != null && typeof data.hero.xp !== 'number') return 'hero.xp не число';
      if (data.directions && !Array.isArray(data.directions)) return 'directions не массив';
      if (data.quests && !Array.isArray(data.quests)) return 'quests не массив';
      if (data.lore && !Array.isArray(data.lore)) return 'lore не массив';
      return null;
    }

