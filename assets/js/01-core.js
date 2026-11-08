
// ===================== CONSTANTS & XP =====================
    const STORAGE_KEY = 'life_rpg_v4';
    // Timestamp of the last local state change, used to avoid blindly replacing newer progress with an older cloud save.
    const LOCAL_UPDATED_AT_KEY = 'life_rpg_v5_local_updated_at';
    const CLOUD_PRE_REPLACE_BACKUP_PREFIX = 'life_rpg_v5_precloud_';
    const SECRET_KEY = 'life_rpg_v4_secret';
    const PROXY_KEY = 'life_rpg_v4_proxy';
    const SCHEMA_VERSION = 5;
    const MAX_LEVEL = 200;
    // Optional: hardcode your Worker URL after deploy so users need nothing:
    // ВШИТЫЙ proxy (Supabase Edge Function). Пользователи ключ НЕ вводят.
    // 1) URL функции:
    // const DEFAULT_PROXY_URL = 'https://PROJECT_ID.supabase.co/functions/v1/groq-proxy';
    // 2) Anon key из Supabase → Settings → API → anon public (нужен для вызова с телефона):
    // const DEFAULT_SUPABASE_ANON_KEY = 'eyJhbGciOi...';
    const DEFAULT_PROXY_URL = 'https://sghoucsrxbywiafpxxyw.supabase.co/functions/v1/Qroq-proxy';
    const DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable_vUKnyvXGOcqUdq4tBv03FA_RWkH30qP';
    // Облачный сейв (тот же проект Supabase). Можно вставить в Настройки.
    const DEFAULT_SUPABASE_URL = 'https://sghoucsrxbywiafpxxyw.supabase.co';
    const CLOUD_TABLE = 'life_rpg_saves';
    const LS_SB_URL = 'life_rpg_v4_sb_url';
    const LS_SB_ANON = 'life_rpg_v4_sb_anon';
    const LS_PROXY = 'life_rpg_v4_proxy_url';
    const LS_PROXY_ANON = 'life_rpg_v4_proxy_anon';
    const LS_CLOUD_ON = 'life_rpg_v4_cloud_on';
    const AUTH_SUPABASE_URL = DEFAULT_SUPABASE_URL;
    const AUTH_SUPABASE_KEY = DEFAULT_SUPABASE_ANON_KEY;
    let supabaseClient = null;
    let authUser = null;
    try {
      if (window.supabase && window.supabase.createClient) {
        supabaseClient = window.supabase.createClient(AUTH_SUPABASE_URL, AUTH_SUPABASE_KEY, {
          auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
        });
      }
    } catch (e) { console.warn('Supabase Auth init failed', e); }

    const QUEST_XP = {
      SIDE:  { 1: 20,  2: 50,  3: 120, 4: 280,  5: 650  },
      MAIN:  { 1: 80,  2: 180, 3: 400, 4: 800,  5: 1600 },
      BOSS:  { 1: 250, 2: 600, 3: 1200,4: 2500, 5: 5000 },
      HABIT: { 1: 10,  2: 15,  3: 25,  4: 40,   5: 60   }
    };

    const DIFF_LABELS = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V' };
    const QUEST_TAGS = [
      { id: 'home', label: 'Дом' },
      { id: 'work', label: 'Работа' },
      { id: 'sport', label: 'Спорт' },
      { id: 'people', label: 'Люди' },
      { id: 'study', label: 'Учёба' },
      { id: 'other', label: 'Другое' }
    ];

    const DIR_STAGES = [
      { id: 'beginner', label: 'Новичок', hint: 'первые шаги, 10–30 мин' },
      { id: 'intermediate', label: 'Средний', hint: 'уже есть база' },
      { id: 'advanced', label: 'Продвинутый', hint: 'уверенная практика' },
      { id: 'pro', label: 'Профи', hint: 'высокие цели и BOSS' }
    ];

    function stageLabel(id) {
      return (DIR_STAGES.find(s => s.id === id) || DIR_STAGES[0]).label;
    }

    function stageRules(stage) {
      const s = stage || 'beginner';
      if (s === 'beginner') return {
        maxDiff: { SIDE: 2, MAIN: 1, BOSS: 0 },
        allowBoss: false,
        allowMain: false,
        prompt: 'Уровень НОВИЧОК. Только простые SIDE (сложность 1–2). Никаких выступлений, концертов, экзаменов, клиентов, публикации «на аудиторию». Только домашняя практика, основы, короткие упражнения 10–30 минут.'
      };
      if (s === 'intermediate') return {
        maxDiff: { SIDE: 3, MAIN: 2, BOSS: 0 },
        allowBoss: false,
        allowMain: true,
        prompt: 'Уровень СРЕДНИЙ. SIDE 1–3, изредка лёгкий MAIN (1–2). Без крупных публичных событий. Фокус на регулярной практике и понятных мини-целях.'
      };
      if (s === 'advanced') return {
        maxDiff: { SIDE: 4, MAIN: 3, BOSS: 2 },
        allowBoss: true,
        allowMain: true,
        prompt: 'Уровень ПРОДВИНУТЫЙ. Можно SIDE/MAIN, редкий небольшой BOSS. Задачи сложнее, но реалистичные для одного человека.'
      };
      return {
        maxDiff: { SIDE: 5, MAIN: 5, BOSS: 5 },
        allowBoss: true,
        allowMain: true,
        prompt: 'Уровень ПРОФИ. Допустимы сложные MAIN и BOSS, если они конкретны и выполнимы.'
      };
    }

    function clampQuestToStage(q, stage) {
      const rules = stageRules(stage);
      let type = String(q.type || 'SIDE').toUpperCase();
      if (!['SIDE', 'MAIN', 'BOSS'].includes(type)) type = 'SIDE';
      if (type === 'BOSS' && !rules.allowBoss) type = 'SIDE';
      if (type === 'MAIN' && !rules.allowMain) type = 'SIDE';
      let difficulty = parseInt(q.difficulty, 10);
      if (!(difficulty >= 1 && difficulty <= 5)) difficulty = 2;
      const maxD = rules.maxDiff[type] || 2;
      if (maxD <= 0) { type = 'SIDE'; difficulty = Math.min(difficulty, rules.maxDiff.SIDE || 2); }
      else difficulty = Math.min(difficulty, maxD);
      let minutes = parseInt(q.minutes, 10);
      if (!(minutes > 0 && minutes <= 300)) minutes = null;
      return {
        title: String(q.title || 'Квест').slice(0, 120),
        type,
        difficulty,
        description: String(q.description || '').slice(0, 900),
        minutes,
        skillName: String(q.skillName || q.targetSkill || '').slice(0, 60) || null,
        xp: QUEST_XP[type][difficulty]
      };
    }

    // ===== TITLES (Identity) =====
    const TITLES = [
      { id: 'newbie', name: 'Новичок', desc: 'Только начинает путь', minLevel: 1 },
      { id: 'seeker', name: 'Искатель', desc: 'Уже ищет свой путь', minLevel: 5 },
      { id: 'doer', name: 'Делатель', desc: 'Превращает намерения в действия', minLevel: 10 },
      { id: 'persistent', name: 'Упорный', desc: 'Не бросает начатое', minLevel: 20 },
      { id: 'adept', name: 'Адепт', desc: 'Серьёзно относится к развитию', minLevel: 35 },
      { id: 'master', name: 'Мастер', desc: 'Достиг значительных высот', minLevel: 50 },
      { id: 'legend', name: 'Легенда', desc: 'Живая легенда собственной жизни', minLevel: 75 },
      { id: 'myth', name: 'Миф', desc: 'То, о чём будут рассказывать', minLevel: 100 },
      { id: 'immortal', name: 'Бессмертный', desc: 'LVL 150+', minLevel: 150 },
      { id: 'transcendent', name: 'Превосходящий', desc: 'LVL 200 — потолок пробит', minLevel: 200 },
      // Action-based
      { id: 'boss_slayer', name: 'Убийца боссов', desc: 'Победил первого BOSS', condition: 'boss1' },
      { id: 'boss_hunter', name: 'Охотник на боссов', desc: '5 BOSS повержено', condition: 'boss5' },
      { id: 'quest_100', name: 'Сотня квестов', desc: 'Выполнил 100 квестов', condition: 'quests100' },
      { id: 'streak_7', name: 'Неделя силы', desc: 'Серия 7 дней', condition: 'streak7' },
      { id: 'streak_30', name: 'Месяц дисциплины', desc: 'Серия 30 дней', condition: 'streak30' },
      { id: 'deep_tree', name: 'Архитектор навыков', desc: 'Дерево глубиной 5+', condition: 'depth5' },
      { id: 'polymath', name: 'Полимат', desc: '5+ направлений', condition: 'dirs5' },
    ];

    // ===== ACHIEVEMENTS =====
    const ACHIEVEMENTS = [
      { id: 'first_quest', name: 'Первый шаг', desc: 'Выполнил первый квест', icon: '👣', hidden: false },
      { id: 'first_boss', name: 'Первая кровь', desc: 'Победил первого BOSS', icon: '☠', hidden: false },
      { id: 'first_dir', name: 'Выбор пути', desc: 'Создал первое направление', icon: '🌳', hidden: false },
      { id: 'first_skill', name: 'Зерно мастерства', desc: 'Создал первый навык', icon: '🌱', hidden: false },
      { id: 'level_10', name: 'Двузначный', desc: 'Достиг LVL 10', icon: '🔟', hidden: false },
      { id: 'level_25', name: 'Четверть пути', desc: 'Достиг LVL 25', icon: '⭐', hidden: false },
      { id: 'level_50', name: 'Полтинник', desc: 'Достиг LVL 50', icon: '💎', hidden: false },
      { id: 'level_100', name: 'Сотня', desc: 'Достиг LVL 100', icon: '👑', hidden: false },
      { id: 'quests_10', name: 'Десятка', desc: '10 выполненных квестов', icon: '📜', hidden: false },
      { id: 'quests_50', name: 'Полтинник квестов', desc: '50 выполненных квестов', icon: '🔥', hidden: false },
      { id: 'quests_100', name: 'Легенда квестов', desc: '100 выполненных квестов', icon: '🏆', hidden: false },
      { id: 'boss_3', name: 'Тройной удар', desc: '3 BOSS повержено', icon: '⚔', hidden: false },
      { id: 'boss_10', name: 'Коллекционер голов', desc: '10 BOSS повержено', icon: '💀', hidden: true },
      { id: 'streak_3', name: 'Три дня подряд', desc: 'Серия 3 дня', icon: '🔥', hidden: false },
      { id: 'streak_7', name: 'Неделя без пропусков', desc: 'Серия 7 дней', icon: '📅', hidden: false },
      { id: 'streak_30', name: 'Месяц силы', desc: 'Серия 30 дней', icon: '🏔', hidden: true },
      { id: 'deep_5', name: 'Глубина', desc: 'Ветка навыков глубиной 5+', icon: '🕳', hidden: false },
      { id: 'dirs_3', name: 'Три пути', desc: '3 направления', icon: '🗺', hidden: false },
      { id: 'luck', name: 'Везунчик', desc: 'Получил бонус удачи', icon: '🍀', hidden: true },
      { id: 'reflector', name: 'Рефлектор', desc: 'Написал первое отражение', icon: '🪞', hidden: false },
      { id: 'lore_10', name: 'Летописец', desc: '10 записей в лоре', icon: '📖', hidden: false },
    ];

    // Non-linear XP curve: total XP required to REACH level L
    // XP(level) cumulative ≈ 300 * (L-1)^2.38
    function xpForLevel(level) {
      if (level <= 1) return 0;
      if (level > MAX_LEVEL) level = MAX_LEVEL;
      return Math.floor(300 * Math.pow(level - 1, 2.38));
    }

    function levelFromXp(xp) {
      let lvl = 1;
      while (lvl < MAX_LEVEL && xpForLevel(lvl + 1) <= xp) {
        lvl++;
      }
      return lvl;
    }

    function xpProgress(xp) {
      const lvl = levelFromXp(xp);
      if (lvl >= MAX_LEVEL) return { level: MAX_LEVEL, current: 0, needed: 0, percent: 100 };
      const curBase = xpForLevel(lvl);
      const nextBase = xpForLevel(lvl + 1);
      const into = xp - curBase;
      const need = nextBase - curBase;
      return {
        level: lvl,
        current: into,
        needed: need,
        percent: need > 0 ? Math.min(100, (into / need) * 100) : 100
      };
    }

    function uid() {
      return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
    }

    // ===================== STATE =====================
    let state = {
      schemaVersion: SCHEMA_VERSION,
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

    let currentTreeDirId = null;
    let treeScale = 1;
    let treePanX = 0;
    let treePanY = 0;
    let treeMode = 'list'; // list | map
    let treeCollapsed = {}; // nodeId -> true if children collapsed
    let treePanBound = false;
    let questFilter = 'active';
    let questSearch = '';
    let questSort = 'default';
    let editingId = null;
    let editingType = null;
    let skillParentId = null;
    let pendingReflectionQuest = null;
    let toastQueue = [];
    let toastShowing = false;
