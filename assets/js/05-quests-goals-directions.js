
    // ===================== GROQ AI =====================
    function ensureAi() {
      if (!state.ai) {
        state.ai = {
          model: 'openai/gpt-oss-20b',
          preferredDifficulty: { SIDE: 2, MAIN: 3, BOSS: 2 }
        };
      }
      if (!state.ai.preferredDifficulty) {
        state.ai.preferredDifficulty = { SIDE: 2, MAIN: 3, BOSS: 2 };
      }
      if (state.ai.apiKey) {
        if (!getApiKey()) setApiKey(state.ai.apiKey);
        delete state.ai.apiKey;
      }
      const deprecated = {
        'llama-3.3-70b-versatile': 'openai/gpt-oss-120b',
        'llama-3.1-8b-instant': 'openai/gpt-oss-20b',
        'gemma2-9b-it': 'openai/gpt-oss-20b',
        'llama-3.1-70b-versatile': 'openai/gpt-oss-120b'
      };
      if (deprecated[state.ai.model]) state.ai.model = deprecated[state.ai.model];
      if (!state.ai.model) state.ai.model = 'openai/gpt-oss-20b';
    }

    function populateAiSettings() {
      updateAiStatusLine();
    }

    function saveAiSettings() {
      /* AI is built-in; no user settings */
    }

    async function callGroq(systemPrompt, userPrompt) {
      ensureAi();
      if (!hasAiAccess()) throw new Error('ИИ временно недоступен');
      const url = aiEndpoint();
      let res;
      try {
        res = await fetch(url, {
          method: 'POST',
          headers: aiAuthHeaders(),
          body: JSON.stringify({
            model: state.ai.model || 'openai/gpt-oss-20b',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt }
            ],
            temperature: 0.7,
            max_tokens: 3500
          })
        });
      } catch (e) {
        // iOS/Telegram often shows "Load failed" on CORS / blocked network
        const hint = !getProxyAnon()
          ? 'Добавь anon/publishable key в Настройки → ИИ.'
          : 'Проверь URL proxy, JWT (verify_jwt off) и секрет GROQ_API_KEY.';
        throw new Error('Сеть: ' + (e.message || 'Load failed') + '. ' + hint);
      }
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        let msg = 'HTTP ' + res.status;
        try {
          const err = JSON.parse(errText);
          msg = err.error?.message || err.message || err.msg || msg;
          if (err.error && typeof err.error === 'string') msg = err.error;
        } catch (_) {
          if (errText) msg = errText.slice(0, 160);
        }
        if (res.status === 401 || res.status === 403) {
          msg += ' — нужен anon key или отключи Verify JWT у функции.';
        }
        if (res.status === 500 && /GROQ_API_KEY/i.test(msg)) {
          msg = 'На сервере нет GROQ_API_KEY (Secrets) — добавь и Redeploy.';
        }
        throw new Error(msg);
      }
      const data = await res.json();
      return data.choices?.[0]?.message?.content || '';
    }

    function parseJsonFromAi(text) {
      if (!text) return null;
      let t = String(text).trim();
      // strip markdown fences
      const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
      if (fence) t = fence[1].trim();
      // if model returned object wrapper
      if (t[0] === '{' && t.includes('[')) {
        const a = t.indexOf('[');
        const b = t.lastIndexOf(']');
        if (a >= 0 && b > a) t = t.slice(a, b + 1);
      }
      const start = t.indexOf('[');
      let end = t.lastIndexOf(']');
      if (start >= 0) {
        if (end > start) t = t.slice(start, end + 1);
        else t = t.slice(start); // truncated — try repair below
      }

      function tryParse(s) {
        try { return JSON.parse(s); } catch (e) { return null; }
      }

      let parsed = tryParse(t);
      if (parsed) return parsed;

      // Repair truncated JSON array: close open braces/brackets/strings
      let fix = t;
      // remove trailing incomplete object fragment after last complete }
      const lastComplete = fix.lastIndexOf('}');
      if (lastComplete > 0) {
        fix = fix.slice(0, lastComplete + 1);
        // close array if needed
        if (!fix.trim().endsWith(']')) fix = fix + ']';
        // remove trailing comma before ]
        fix = fix.replace(/,\s*]$/, ']');
        parsed = tryParse(fix);
        if (parsed) return parsed;
      }

      // Fallback: extract individual {...} objects
      const objs = [];
      const re = /\{[^{}]*\}/g;
      let m;
      while ((m = re.exec(t)) !== null) {
        const o = tryParse(m[0]);
        if (o && typeof o === 'object') objs.push(o);
      }
      if (objs.length) return objs;

      // last resort: throw with short preview
      throw new Error('ИИ вернул неполный JSON. Нажми «Повторить».');
    }

    async function generateQuestsForDirection(dirId) {
      ensureAi();
      if (!hasAiAccess()) {
        toast('ИИ временно недоступен', 'error');
        return;
      }
      const dir = state.directions.find(d => d.id === dirId);
      if (!dir) return;

      const skills = (dir.nodes || []).map(n => n.name).slice(0, 20);
      const stage = dir.stage || 'beginner';
      const rules = stageRules(stage);
      const pref = state.ai.preferredDifficulty || { SIDE: 2, MAIN: 3, BOSS: 2 };
      const existing = state.quests
        .filter(q => !q.done && (q.targetType === 'DIRECTION' && q.targetId === dirId ||
          (q.targetType === 'SKILL' && (dir.nodes || []).some(n => n.id === q.targetId))))
        .map(q => q.title)
        .slice(0, 10);

      toast('Генерирую квесты…');
      document.getElementById('modalContent').innerHTML = `
        <h2>ИИ-квесты</h2>
        <p class="text-dim" style="margin-bottom:16px">«${escapeHtml(dir.name)}» · ${stageLabel(stage)}</p>
        <div style="text-align:center;padding:28px 16px">
          <div style="font-size:1.4rem;margin-bottom:10px;opacity:0.7">◌</div>
          <div style="color:var(--text-muted);font-size:0.9rem">ИИ подбирает квесты…</div>
          <div style="color:var(--text-muted);font-size:0.78rem;margin-top:6px">Обычно 3–10 секунд</div>
        </div>
      `;
      openModal();

      try {
        const mix = stage === 'beginner' ? '5 SIDE (без MAIN и BOSS)'
          : stage === 'intermediate' ? '4 SIDE и 1 лёгкий MAIN'
          : stage === 'advanced' ? '3 SIDE, 1 MAIN, опционально 1 небольшой BOSS'
          : '2 SIDE, 2 MAIN, 1 BOSS';

        const system = `Ты помощник в life-RPG.
ЯЗЫК: ВСЕГДА ТОЛЬКО РУССКИЙ. Все значения текстовых полей JSON (title, description, skillName и любые другие текстовые значения) ОБЯЗАТЕЛЬНО пиши на русском языке. Не отвечай на английском. Не используй английские слова в пользовательском тексте, кроме названий брендов, технологий и общепринятых терминов, если без них нельзя.
Ответь ТОЛЬКО валидным JSON-массивом, без текста до/после, без markdown.
Ровно 3–5 объектов. Каждый объект ЗАКРОЙ. Массив ЗАКРОЙ символом ].
Формат:
[{"title":"...","type":"SIDE","difficulty":2,"description":"...","skillName":""}]
ЖЁСТКИЕ ПРАВИЛА УРОВНЯ:
${rules.prompt}
- Конкретно, без воды и лозунгов
- Не предлагай то, что явно выше уровня
- Не дублируй существующие квесты
- SIDE = действие на сегодня (10–60 мин)
- MAIN = цель на дни/недели (только если уровень позволяет)
- BOSS = серьёзное испытание (только если уровень позволяет)
- description: 2–4 полных предложения на русском: что сделать, как понять что готово, сколько примерно минут. Не обрывай мысль.
- skillName: если у направления есть навыки в дереве — укажи ОДИН ближайший; иначе пустая строка`;

        const goalHints = activeGoals().filter(g => !g.directionId || g.directionId === dirId)
          .slice(0, 4)
          .map(g => `${g.title} (${g.metric.current}/${g.metric.target} ${g.metric.unitLabel || ''})`)
          .join('; ');
        const user = `Направление: ${dir.name}
Уровень пользователя: ${stageLabel(stage)} (${stage})
Описание: ${dir.description || 'нет'}
Навыки: ${skills.length ? skills.join(', ') : 'пока нет — значит совсем старт'}
Активные цели (желательно двигать): ${goalHints || 'нет'}
Активные квесты: ${existing.length ? existing.join('; ') : 'нет'}
Предпочтительная сложность (ориентир, но НЕ выше лимита уровня): SIDE=${pref.SIDE}, MAIN=${pref.MAIN}, BOSS=${pref.BOSS}
Состав: ${mix}`;

        const raw = await callGroq(system, user);
        let list = parseJsonFromAi(raw);
        if (!Array.isArray(list) || !list.length) throw new Error('Пустой ответ ИИ');

        list = list.slice(0, 6).map(q => clampQuestToStage(q, stage));
        showAiQuestSuggestions(dirId, list);
      } catch (e) {
        document.getElementById('modalContent').innerHTML = `
          <h2>Не вышло</h2>
          <p class="text-dim" style="margin-bottom:14px">${escapeHtml(e.message || 'ошибка ИИ')}</p>
          <div class="modal-actions" style="flex-direction:column;gap:8px">
            <button class="btn btn-primary btn-block" onclick="generateQuestsForDirection('${dirId}')">Повторить</button>
            <button class="btn btn-secondary btn-block" onclick="closeModal()">Закрыть</button>
          </div>`;
        openModal();
      }
    }

    async function generateDailyQuests() {
      ensureAi();
      if (!hasAiAccess()) {
        toast('ИИ временно недоступен', 'error');
        return;
      }
      if (!state.directions.length) {
        toast('Сначала создай направление', 'error');
        switchScreen('skills');
        return;
      }
      // capacity picker
      const prev = (state.ui && state.ui.dailyCapacity) || 60;
      document.getElementById('modalContent').innerHTML = `
        <h2>Квесты на день</h2>
        <p class="text-dim" style="margin-bottom:14px;font-size:0.9rem">Сколько времени реально есть сегодня? ИИ подстроит объём и сложность под уровень каждого направления.</p>
        <div class="form-group">
          <label>Время сегодня</label>
          <select id="dailyCap">
            <option value="20" ${prev===20?'selected':''}>~20 минут</option>
            <option value="40" ${prev===40?'selected':''}>~40 минут</option>
            <option value="60" ${prev===60?'selected':''}>~1 час</option>
            <option value="120" ${prev===120?'selected':''}>~2 часа</option>
            <option value="180" ${prev===180?'selected':''}>~3 часа</option>
          </select>
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" onclick="closeModal()">Отмена</button>
          <button class="btn btn-primary" onclick="runDailyQuestGen()">Собрать план</button>
        </div>
      `;
      openModal();
    }

    async function runDailyQuestGen() {
      const cap = parseInt(document.getElementById('dailyCap')?.value || '60', 10);
      if (!state.ui) state.ui = {};
      state.ui.dailyCapacity = cap;
      if (!save()) return;
      toast('Собираю квесты на день…');
      document.getElementById('modalContent').innerHTML = `
        <h2>Квесты на день</h2>
        <p class="text-dim" style="margin-bottom:16px">~${cap} мин · уровни направлений учтены</p>
        <div style="text-align:center;padding:28px 16px">
          <div style="font-size:1.4rem;margin-bottom:10px;opacity:0.7">◌</div>
          <div style="color:var(--text-muted);font-size:0.9rem">ИИ подбирает квесты…</div>
          <div style="color:var(--text-muted);font-size:0.78rem;margin-top:6px">Обычно 3–10 секунд</div>
        </div>
      `;
      openModal();

      try {
        const dirBrief = state.directions.map(d => {
          const st = d.stage || 'beginner';
          const skills = (d.nodes || []).map(n => n.name).slice(0, 12);
          return {
            id: d.id,
            name: d.name,
            stage: st,
            stageLabel: stageLabel(st),
            skills
          };
        });

        const existing = state.quests.filter(q => !q.done).map(q => q.title).slice(0, 15);
        const heroLvl = levelFromXp(state.hero.xp || 0);
        const perDir = state.directions.length >= 4 ? 1 : (cap >= 120 ? 2 : 1);

        const system = `Ты помощник в life-RPG.
ЯЗЫК: ВСЕГДА ТОЛЬКО РУССКИЙ. Все значения текстовых полей JSON (title, description, skillName и любые другие текстовые значения) ОБЯЗАТЕЛЬНО пиши на русском языке. Не отвечай на английском. Не используй английские слова в пользовательском тексте, кроме названий брендов, технологий и общепринятых терминов, если без них нельзя.
План на ОДИН день. Ответь ТОЛЬКО JSON-массивом:
[{"dirId":"...","title":"...","type":"SIDE","difficulty":1-5,"description":"...","minutes":15,"skillName":"навык из дерева или пусто"}]
Правила:
- На каждое направление примерно ${perDir} квест(а)
- Суммарно minutes всех квестов ≤ ${cap}
- Почти все SIDE; MAIN только если stage не beginner и влезает в бюджет времени
- BOSS запрещён
- beginner: 10–25 мин, домашняя практика, без публики и «концертов»
- intermediate: 15–40 мин
- advanced/pro: можно плотнее, но в пределах бюджета
- Конкретно, без мотивационной воды
- dirId = id из списка
- Не дублируй активные квесты
- description: 2–4 предложения — что сделать, критерий «готово», ориентир по минутам. Не обрывай фразу.
- skillName: привяжи к навыку из дерева направления, если есть; иначе ""`;

        const user = `Герой LVL ${heroLvl} (это ОБЩИЙ уровень, не уровень в теме)
Бюджет времени: ${cap} минут
Направления: ${JSON.stringify(dirBrief)}
Активные квесты: ${existing.length ? existing.join('; ') : 'нет'}`;

        const raw = await callGroq(system, user);
        let list = parseJsonFromAi(raw);
        if (!Array.isArray(list) || !list.length) throw new Error('Пустой ответ ИИ');

        // normalize + attach dir
        const validIds = new Set(state.directions.map(d => d.id));
        const byName = {};
        state.directions.forEach(d => { byName[d.name.toLowerCase()] = d.id; });

        list = list.slice(0, 20).map(q => {
          let dirId = q.dirId;
          if (!validIds.has(dirId)) {
            // try match by name in title/description — or first dir
            const maybe = state.directions.find(d =>
              String(q.title || '').toLowerCase().includes(d.name.toLowerCase())
            );
            dirId = maybe ? maybe.id : (state.directions[0] && state.directions[0].id);
          }
          const dir = state.directions.find(d => d.id === dirId);
          const stage = dir?.stage || 'beginner';
          const clamped = clampQuestToStage({ ...q, type: 'SIDE' }, stage);
          // daily: force SIDE for beginners/intermediate mostly already clamped
          if (stage === 'beginner' || stage === 'intermediate') {
            clamped.type = 'SIDE';
            clamped.difficulty = Math.min(clamped.difficulty, stage === 'beginner' ? 2 : 3);
            clamped.xp = QUEST_XP.SIDE[clamped.difficulty];
          }
          let minutes = parseInt(q.minutes, 10);
          if (!(minutes > 0 && minutes <= 300)) minutes = clamped.minutes;
          return {
            ...clamped,
            minutes: minutes || clamped.minutes,
            skillName: clamped.skillName || q.skillName || null,
            dirId,
            dirName: dir?.name || ''
          };
        }).filter(q => q.dirId);

        showDailyQuestSuggestions(list);
      } catch (e) {
        document.getElementById('modalContent').innerHTML = `
          <h2>Не вышло</h2>
          <p class="text-dim" style="margin-bottom:14px">${escapeHtml(e.message || 'ошибка ИИ')}</p>
          <div class="modal-actions" style="flex-direction:column;gap:8px">
            <button class="btn btn-primary btn-block" onclick="runDailyQuestGen()">Повторить</button>
            <button class="btn btn-secondary btn-block" onclick="closeModal()">Закрыть</button>
          </div>`;
        openModal();
      }
    }

    function renderAiDraftCard(q, i, opts) {
      const showDir = opts && opts.showDir;
      return `
        <div class="card" style="padding:12px;margin:0" data-draft="${i}">
          <div style="display:flex;gap:10px;align-items:flex-start">
            <input type="checkbox" class="ai-q-check" data-i="${i}" checked style="margin-top:6px;width:18px;height:18px;flex-shrink:0">
            <div style="flex:1;min-width:0">
              ${showDir ? `<div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:6px">${escapeHtml(q.dirName || '')}</div>` : ''}
              <input type="text" class="ai-q-title" data-i="${i}" value="${escapeHtml(q.title)}" maxlength="120"
                style="width:100%;margin-bottom:8px;padding:8px 10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:0.9rem;font-weight:600;font-family:inherit">
              <div class="quest-meta" style="margin-bottom:8px">
                <span class="badge badge-${q.type.toLowerCase()}">${q.type}</span>
                <span class="badge badge-diff">${DIFF_LABELS[q.difficulty] || q.difficulty}</span>
                <span class="quest-xp">+${q.xp} XP</span>
                ${q.minutes ? `<span class="badge">~${q.minutes} мин</span>` : ''}
              </div>
              <textarea class="ai-q-desc" data-i="${i}" rows="3"
                style="width:100%;padding:8px 10px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text-dim);font-size:0.85rem;line-height:1.45;font-family:inherit;resize:vertical">${escapeHtml(q.description || '')}</textarea>
              <div class="mq-criterion" style="margin-top:8px"><strong>Критерий:</strong> ${escapeHtml(q.completionCriteria || 'Нет измеримого критерия — лучше не добавлять.')}</div>
            </div>
          </div>
        </div>`;
    }

    function collectAiDraftsFromDom(baseDrafts) {
      const out = [];
      document.querySelectorAll('.ai-q-check:checked').forEach(ch => {
        const i = parseInt(ch.dataset.i, 10);
        const base = baseDrafts[i];
        if (!base) return;
        const titleEl = document.querySelector('.ai-q-title[data-i="' + i + '"]');
        const descEl = document.querySelector('.ai-q-desc[data-i="' + i + '"]');
        const title = (titleEl?.value || base.title || '').trim();
        if (!title) return;
        out.push({
          ...base,
          title: title.slice(0, 120),
          description: (descEl?.value || base.description || '').trim().slice(0, 900),
          completionCriteria: String(base.completionCriteria || '').trim().slice(0, 500)
        });
      });
      return out;
    }

    function showDailyQuestSuggestions(list) {
      window._aiDailyDrafts = list;
      window._aiDraftMode = 'daily';
      document.getElementById('modalContent').innerHTML = `
        <h2>Квесты на день</h2>
        <p class="text-dim" style="margin-bottom:12px;font-size:0.85rem">Можно поправить текст прямо здесь, потом добавить.</p>
        <div id="aiQuestList" style="display:flex;flex-direction:column;gap:10px;max-height:48vh;overflow-y:auto">
          ${list.map((q, i) => renderAiDraftCard(q, i, { showDir: true })).join('')}
        </div>
        <div class="modal-actions mt-16" style="flex-direction:column;gap:8px">
          <button class="btn btn-primary btn-block" onclick="acceptDailyQuests()">Добавить выбранные</button>
          <button class="btn btn-secondary btn-block" onclick="runDailyQuestGen()">Другие варианты</button>
          <button class="btn btn-secondary btn-block" onclick="closeModal()">Отмена</button>
        </div>
      `;
      openModal();
    }

    function acceptDailyQuests() {
      const picked = collectAiDraftsFromDom(window._aiDailyDrafts || []);
      if (!picked.length) { toast('Ничего не выбрано', 'error'); return; }
      const snap = snapshotState();
      let added = 0;
      picked.forEach(q => {
        const tgt = resolveQuestTarget(q, q.dirId);
        state.quests.push({
          id: uid(),
          title: q.title,
          type: q.type,
          difficulty: q.difficulty,
          xp: QUEST_XP[q.type][q.difficulty],
          description: q.description || '',
          completionCriteria: q.completionCriteria || '',
          minutes: q.minutes || null,
          targetType: tgt.targetType,
          targetId: tgt.targetId,
          tags: [],
          done: false,
          createdAt: Date.now(),
          fromAi: true,
          daily: true
        });
        added++;
      });
      if (!save()) {
        replaceState(snap);
        renderAll();
        toast('AI-квесты не добавлены: не удалось сохранить данные', 'error');
        return;
      }
      closeModal();
      pushUndo(snap, `+${added} квестов на день`);
      renderQuests();
      renderHero();
    }

    function showAiQuestSuggestions(dirId, list) {
      const dir = state.directions.find(d => d.id === dirId);
      window._aiQuestDrafts = list;
      window._aiDraftDirId = dirId;
      window._aiDraftMode = 'dir';
      document.getElementById('modalContent').innerHTML = `
        <h2>Идеи квестов</h2>
        <p class="text-dim" style="margin-bottom:12px;font-size:0.85rem">«${escapeHtml(dir?.name || '')}» · ${stageLabel(dir?.stage || 'beginner')}. Править текст до добавления.</p>
        <div id="aiQuestList" style="display:flex;flex-direction:column;gap:10px;max-height:48vh;overflow-y:auto">
          ${list.map((q, i) => renderAiDraftCard(q, i, { showDir: false })).join('')}
        </div>
        <div class="modal-actions mt-16" style="flex-direction:column;gap:8px">
          <button class="btn btn-primary btn-block" onclick="acceptAiQuests('${dirId}')">Добавить выбранные</button>
          <button class="btn btn-secondary btn-block" onclick="generateQuestsForDirection('${dirId}')">Другие варианты</button>
          <button class="btn btn-secondary btn-block" onclick="closeModal()">Отмена</button>
        </div>
      `;
      openModal();
    }

    function acceptAiQuests(dirId) {
      const picked = collectAiDraftsFromDom(window._aiQuestDrafts || []);
      if (!picked.length) { toast('Ничего не выбрано', 'error'); return; }
      ensureAi();
      const snap = snapshotState();
      let added = 0;
      picked.forEach(q => {
        const tgt = resolveQuestTarget({ ...q, dirId }, dirId);
        state.quests.push({
          id: uid(),
          title: q.title,
          type: q.type,
          difficulty: q.difficulty,
          xp: QUEST_XP[q.type][q.difficulty],
          description: q.description || '',
          completionCriteria: q.completionCriteria || '',
          minutes: q.minutes || null,
          targetType: tgt.targetType,
          targetId: tgt.targetId,
          tags: [],
          done: false,
          createdAt: Date.now(),
          fromAi: true
        });
        if (!state.ai.preferredDifficulty) state.ai.preferredDifficulty = {};
        state.ai.preferredDifficulty[q.type] = q.difficulty;
        added++;
      });
      if (!save()) {
        replaceState(snap);
        renderAll();
        toast('AI-квесты не добавлены: не удалось сохранить данные', 'error');
        return;
      }
      closeModal();
      pushUndo(snap, `+${added} квестов`);
      renderQuests();
      renderHero();
      renderDirections();
    }

    function flattenSkillTreeDraft(nodes, parentKey, depth, acc) {
      (nodes || []).forEach((n, i) => {
        const key = parentKey + '/' + i;
        const name = String(n.name || n.title || '').trim().slice(0, 60);
        if (!name) return;
        acc.push({
          key,
          name,
          description: String(n.description || '').slice(0, 200),
          depth,
          parentKey: parentKey === 'root' ? null : parentKey
        });
        if (Array.isArray(n.children) && n.children.length) {
          flattenSkillTreeDraft(n.children, key, depth + 1, acc);
        }
      });
      return acc;
    }

    async function generateSkillTree(dirId, parentNodeId) {
      ensureAi();
      if (!hasAiAccess()) {
        toast('ИИ временно недоступен', 'error');
        return;
      }
      const dir = state.directions.find(d => d.id === dirId);
      if (!dir) return;
      const stage = dir.stage || 'beginner';
      const existing = (dir.nodes || []).map(n => {
        const parent = n.parentId ? (dir.nodes.find(x => x.id === n.parentId)?.name || '') : '';
        return parent ? parent + ' → ' + n.name : n.name;
      }).slice(0, 40);

      const parentNode = parentNodeId ? (dir.nodes || []).find(n => n.id === parentNodeId) : null;
      const mode = parentNode ? 'expand' : 'tree';

      document.getElementById('modalContent').innerHTML = `
        <h2>${mode === 'expand' ? 'Поднавыки' : 'Дерево навыков'}</h2>
        <p class="text-dim" style="margin-bottom:12px;font-size:0.85rem">
          ${mode === 'expand' ? 'Ветка «' + escapeHtml(parentNode.name) + '»' : '«' + escapeHtml(dir.name) + '» · ' + stageLabel(stage)}
        </p>
        <div style="text-align:center;padding:28px 16px">
          <div style="font-size:1.4rem;margin-bottom:10px;opacity:0.7">◌</div>
          <div style="color:var(--text-muted);font-size:0.9rem">ИИ собирает дерево…</div>
        </div>
      `;
      openModal();

      try {
        let system, user;
        if (mode === 'expand') {
          system = `Ты архитектор skill-tree в life-RPG. Разбей ОДИН навык на поднавыки.
Ответь ТОЛЬКО JSON:
{"name":"...","children":[{"name":"...","description":"зачем этот кусок"},...]}
Правила:
- 3–6 детей первого уровня
- Можно 1 уровень вложенности у детей (children у child)
- Имена короткие, конкретные, на русском
- Без мотивационной воды
- Учитывай уровень пользователя: ${stageLabel(stage)}`;
          user = `Направление: ${dir.name}
Родительский навык: ${parentNode.name}
Уже есть в дереве: ${existing.length ? existing.join('; ') : 'пусто'}
Дай логичную декомпозицию «${parentNode.name}».`;
        } else {
          system = `Ты архитектор skill-tree в life-RPG. Построй иерархию навыков.
Ответь ТОЛЬКО JSON:
{"roots":[{"name":"...","description":"...","children":[{"name":"...","description":"...","children":[]}]}]}
Правила:
- 3–5 корневых столпов направления
- У каждого корня 2–4 поднавыка
- Глубже 3 уровней не иди
- Имена короткие, конкретные, на русском
- Новичок: базовые блоки (постановка, основы). Не «мастерство сцены»
- Средний: техника + практика
- Продвинутый/профи: можно узкие спецветки
- Не повторяй уже существующие узлы
- description — 1 короткая фраза «что это»`;
          user = `Направление: ${dir.name}
Уровень в теме: ${stageLabel(stage)} (${stage})
Описание направления: ${dir.description || 'нет'}
Уже есть: ${existing.length ? existing.join('; ') : 'дерево пустое — построй с нуля'}
Собери полезное дерево под реальную прокачку.`;
        }

        const raw = await callGroq(system, user);
        const data = parseJsonFromAi(raw);
        let flat = [];
        if (mode === 'expand') {
          const root = data && (data.children ? data : { name: parentNode.name, children: data });
          const children = Array.isArray(root) ? root : (root.children || []);
          flat = flattenSkillTreeDraft(children, 'root', 1, []);
        } else {
          const roots = data?.roots || data?.tree || (Array.isArray(data) ? data : []);
          flat = flattenSkillTreeDraft(roots, 'root', 0, []);
        }
        if (!flat.length) throw new Error('Пустое дерево от ИИ');

        window._aiTreeDrafts = flat;
        window._aiTreeDirId = dirId;
        window._aiTreeParentId = parentNodeId || null;

        document.getElementById('modalContent').innerHTML = `
          <h2>${mode === 'expand' ? 'Поднавыки' : 'Дерево навыков'}</h2>
          <p class="text-dim" style="margin-bottom:12px;font-size:0.85rem">Сними галочки с лишнего. Потом можно править в дереве.</p>
          <div style="display:flex;flex-direction:column;gap:6px;max-height:48vh;overflow-y:auto">
            ${flat.map((n, i) => `
              <label class="card" style="padding:10px 12px;display:flex;gap:10px;align-items:flex-start;cursor:pointer;margin:0">
                <input type="checkbox" class="ai-tree-check" data-i="${i}" checked style="margin-top:3px;width:18px;height:18px;flex-shrink:0">
                <div style="flex:1;min-width:0">
                  <div style="font-weight:600;font-size:0.9rem;padding-left:${n.depth * 14}px">
                    ${n.depth ? '↳ '.repeat(Math.min(n.depth, 3)) : ''}${escapeHtml(n.name)}
                  </div>
                  ${n.description ? `<div class="text-dim" style="font-size:0.78rem;padding-left:${n.depth * 14}px;margin-top:2px">${escapeHtml(n.description)}</div>` : ''}
                </div>
              </label>
            `).join('')}
          </div>
          <div class="modal-actions mt-16" style="flex-direction:column;gap:8px">
            <button class="btn btn-primary btn-block" onclick="acceptAiSkillTree()">Добавить в дерево</button>
            <button class="btn btn-secondary btn-block" onclick="generateSkillTree('${dirId}'${parentNodeId ? ',\'' + parentNodeId + '\'' : ''})">Другие варианты</button>
            <button class="btn btn-secondary btn-block" onclick="closeModal()">Отмена</button>
          </div>
        `;
        openModal();
      } catch (e) {
        document.getElementById('modalContent').innerHTML = `
          <h2>Не вышло</h2>
          <p class="text-dim" style="margin-bottom:14px">${escapeHtml(e.message || 'ошибка')}</p>
          <div class="modal-actions" style="flex-direction:column;gap:8px">
            <button class="btn btn-primary btn-block" onclick="generateSkillTree('${dirId}'${parentNodeId ? ',\'' + parentNodeId + '\'' : ''})">Повторить</button>
            <button class="btn btn-secondary btn-block" onclick="closeModal()">Закрыть</button>
          </div>`;
        openModal();
      }
    }

    function acceptAiSkillTree() {
      const dirId = window._aiTreeDirId;
      const parentId = window._aiTreeParentId || null;
      const dir = state.directions.find(d => d.id === dirId);
      if (!dir) return;
      if (!dir.nodes) dir.nodes = [];
      const snap = snapshotState();
      const drafts = window._aiTreeDrafts || [];
      const selected = [];
      document.querySelectorAll('.ai-tree-check:checked').forEach(ch => {
        const i = parseInt(ch.dataset.i, 10);
        if (drafts[i]) selected.push(drafts[i]);
      });
      if (!selected.length) { toast('Ничего не выбрано', 'error'); return; }

      // map draft keys -> real ids, only for selected + their ancestors if parent selected chain
      const keyToId = {};
      let added = 0;
      // parents first by depth
      selected.sort((a, b) => a.depth - b.depth).forEach(n => {
        const exists = dir.nodes.find(x => x.name === n.name && (x.parentId || null) === (
          n.parentKey ? (keyToId[n.parentKey] || null) : parentId
        ));
        if (exists) {
          keyToId[n.key] = exists.id;
          return;
        }
        let realParent = parentId;
        if (n.parentKey) {
          realParent = keyToId[n.parentKey] || parentId;
          // if parent wasn't selected, attach to expand parent or root
          if (!keyToId[n.parentKey] && !parentId) {
            // skip orphan deep nodes without parent
            if (n.depth > 0) return;
          }
        }
        const id = uid();
        keyToId[n.key] = id;
        dir.nodes.push({
          id,
          name: n.name,
          description: n.description || '',
          parentId: n.depth === 0 ? parentId : (keyToId[n.parentKey] || parentId),
          xp: 0,
          lastActiveAt: 0
        });
        added++;
      });

      if (added) {
        // undo was not snapshotted before loop — fix by snapshot at start
      }
      if (added && !save()) {
        replaceState(snap);
        renderAll();
        toast('Дерево не изменено: не удалось сохранить данные', 'error');
        return;
      }
      if (!added && !save()) return;
      closeModal();
      if (added) pushUndo(snap, `Дерево +${added}`);
      else toast('Уже было в дереве', 'success');
      renderDirections();
      if (currentTreeDirId === dirId) renderTree(dirId);
      else openTreeView(dirId);
    }

    // back-compat alias
    function generateSkillIdeas(dirId) {
      generateSkillTree(dirId);
    }

    // ===================== XP APPLICATION =====================
    function applyXp(amount, targetType, targetId, opts = {}) {
      if (amount <= 0) return;

      const oldHeroLvl = levelFromXp(state.hero.xp);
      state.hero.xp += amount;
      state.stats.totalXp = (state.stats.totalXp || 0) + amount;
      const newHeroLvl = levelFromXp(state.hero.xp);

      if (newHeroLvl > oldHeroLvl) {
        showLevelUp(oldHeroLvl, newHeroLvl);
      } else if (!opts.silent) {
        const bonusNote = opts.bonus ? ` (🍀 +${opts.bonus} удача!)` : '';
        toast(`+${amount} XP${bonusNote}`, 'success');
      }

      if (targetType === 'DIRECTION' && targetId) {
        const dir = state.directions.find(d => d.id === targetId);
        if (dir) {
          const old = levelFromXp(dir.xp);
          dir.xp += amount;
          dir.lastActiveAt = Date.now();
          const neu = levelFromXp(dir.xp);
          if (neu > old) toast(`${dir.name}: LVL ${neu}!`, 'levelup');
        }
      } else if (targetType === 'SKILL' && targetId) {
        for (const dir of state.directions) {
          const node = (dir.nodes || []).find(n => n.id === targetId);
          if (node) {
            const oldN = levelFromXp(node.xp);
            node.xp += amount;
            node.lastActiveAt = Date.now();
            const neuN = levelFromXp(node.xp);
            if (neuN > oldN) toast(`${node.name}: LVL ${neuN}!`, 'levelup');
            const oldD = levelFromXp(dir.xp);
            dir.xp += amount;
            const neuD = levelFromXp(dir.xp);
            if (neuD > oldD) toast(`${dir.name}: LVL ${neuD}!`, 'levelup');
            break;
          }
        }
      }

      checkTitlesAndAchievements();
      if (!save()) return;
    }

    // ===================== RENDER HELPERS =====================
    function escapeHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    function formatNum(n) {
      return Math.floor(n).toLocaleString('ru-RU');
    }

    // ===================== WEEKLY PULSE =====================
    function localDayKey(date) {
      return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
    }

    function renderWeeklyPulseBlock() {
      const now = new Date();
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      start.setDate(start.getDate() - 6);
      const recent = (state.quests || []).filter(q => q.done && Number(q.completedAt) >= start.getTime() && Number(q.completedAt) <= now.getTime());
      const xp = recent.reduce((sum, q) => sum + Math.max(0, Number(q.earnedXp ?? q.xp) || 0), 0);
      const goalUnits = recent.reduce((sum, q) => sum + Math.max(0, Number(q.goalResultUnits ?? q.goalUnits) || 0), 0);
      const days = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        const key = localDayKey(d);
        const count = recent.filter(q => localDayKey(new Date(Number(q.completedAt))) === key).length;
        days.push({ key, label: ['Вс','Пн','Вт','Ср','Чт','Пт','Сб'][d.getDay()], count });
      }
      const max = Math.max(1, ...days.map(d => d.count));
      const activeDays = days.filter(d => d.count > 0).length;
      const directionCounts = {};
      recent.forEach(q => {
        const id = getQuestDirectionId(q);
        if (!id) return;
        const dir = state.directions.find(d => d.id === id);
        if (dir) directionCounts[dir.name] = (directionCounts[dir.name] || 0) + 1;
      });
      const topDirection = Object.entries(directionCounts).sort((a, b) => b[1] - a[1])[0];
      const bars = days.map(d => `<div style="flex:1;min-width:0;text-align:center"><div style="height:54px;display:flex;align-items:flex-end;justify-content:center"><div title="${d.count} квестов" style="width:70%;max-width:24px;height:${d.count ? Math.max(8, Math.round(d.count / max * 50)) : 3}px;border-radius:5px 5px 2px 2px;background:${d.count ? 'var(--accent)' : 'var(--border)'};opacity:${d.count ? '1' : '.7'}"></div></div><div style="font-size:.68rem;color:var(--text-muted);margin-top:5px">${d.label}</div><div style="font-size:.72rem;font-weight:650">${d.count || '·'}</div></div>`).join('');
      return `<div class="card mt-12"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:10px"><div><div style="font-weight:700">📊 Пульс недели</div><div class="text-dim" style="font-size:.75rem">Последние 7 календарных дней</div></div><div style="font-size:.75rem;color:var(--text-muted)">${activeDays}/7 активных</div></div><div style="display:flex;gap:8px;margin-bottom:12px"><div style="flex:1;background:var(--surface-2,rgba(127,127,127,.08));border-radius:10px;padding:10px"><div style="font-size:1.15rem;font-weight:750">${recent.length}</div><div class="text-dim" style="font-size:.72rem">квестов</div></div><div style="flex:1;background:var(--surface-2,rgba(127,127,127,.08));border-radius:10px;padding:10px"><div style="font-size:1.15rem;font-weight:750">+${formatNum(xp)}</div><div class="text-dim" style="font-size:.72rem">XP начислено</div></div><div style="flex:1;background:var(--surface-2,rgba(127,127,127,.08));border-radius:10px;padding:10px"><div style="font-size:1.15rem;font-weight:750">${formatNum(goalUnits)}</div><div class="text-dim" style="font-size:.72rem">ед. целей*</div></div></div><div style="display:flex;gap:6px;align-items:flex-end">${bars}</div><div class="text-dim" style="font-size:.72rem;margin-top:10px">${topDirection ? `Главный фокус: <strong>${escapeHtml(topDirection[0])}</strong> (${topDirection[1]} квест.)` : 'Выполни квест, чтобы здесь появился твой главный фокус недели.'}</div><div class="text-dim" style="font-size:.66rem;margin-top:4px">*Сумма единиц вклада из связанных квестов; разные единицы измерения могут отличаться.</div></div>`;
    }

    // ===================== HERO =====================
    function renderHero() {
      const h = state.hero;
      const prog = xpProgress(h.xp);
      const totalQuests = state.quests.length;
      const doneQuests = state.quests.filter(q => q.done).length;
      const totalDirs = state.directions.length;
      const title = getTitle(h.titleId || 'newbie');
      const nearMiss = prog.percent >= 85 && prog.level < MAX_LEVEL;
      const streak = state.streak || { current: 0, longest: 0 };
      const today = todayStr();
      const doneToday = state.quests.filter(q => q.done && q.completedAt && new Date(q.completedAt).toISOString().slice(0,10) === today).length;
      const active = state.quests.filter(q => !q.done);
      const todayPicks = active.slice().sort((a, b) => {
        const prio = { BOSS: 0, MAIN: 1, SIDE: 2 };
        const pa = prio[a.type] ?? 3, pb = prio[b.type] ?? 3;
        if (pa !== pb) return pa - pb;
        if ((a.difficulty || 3) !== (b.difficulty || 3)) return (a.difficulty || 3) - (b.difficulty || 3);
        return (a.createdAt || 0) - (b.createdAt || 0);
      }).slice(0, 4);
      const showExtras = doneQuests >= 3 || prog.level >= 3;
      const cap = (state.ui && state.ui.dailyCapacity) || 60;

      const el = document.getElementById('heroContent');

      // Guided empty / next step
      let nextBlock = '';
      if (totalDirs === 0) {
        nextBlock = `
          <div class="card mt-12">
            <div style="font-size:0.75rem;color:var(--text-muted);font-weight:600;margin-bottom:8px">ЧТО СДЕЛАТЬ</div>
            <p class="text-dim" style="font-size:0.9rem;margin-bottom:12px">Шаг 1 из 3 — область жизни и твой уровень в ней (новичок / средний…).</p>
            <button class="btn btn-primary btn-block" onclick="switchScreen('skills');setTimeout(()=>openDirectionModal(),200)">+ Создать направление</button>
          </div>`;
      } else if (active.length === 0) {
        nextBlock = `
          <div class="card mt-12">
            <div style="font-size:0.75rem;color:var(--text-muted);font-weight:600;margin-bottom:8px">ЧТО СДЕЛАТЬ</div>
            <p class="text-dim" style="font-size:0.9rem;margin-bottom:12px">Шаг 2 — квесты на сегодня под уровень направлений и твоё время.</p>
            <button class="btn btn-primary btn-block" onclick="openAssistant()">Помощник ИИ</button>
          </div>`;
      } else {
        nextBlock = `
          <div class="card mt-12">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
              <div style="font-size:0.75rem;color:var(--text-muted);font-weight:600">СЕЙЧАС</div>
              <div style="display:flex;gap:6px">
                <button class="btn btn-secondary btn-sm" onclick="openAssistant()" style="min-height:30px;padding:4px 10px;font-size:0.75rem">ИИ</button>
                <button class="btn btn-secondary btn-sm" onclick="switchScreen('quests')" style="min-height:30px;padding:4px 10px;font-size:0.75rem">Все</button>
              </div>
            </div>
            ${todayPicks.map(q => `
              <div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-top:1px solid var(--border)">
                <div style="flex:1;min-width:0">
                  <div style="font-weight:600;font-size:0.9rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(q.title)}</div>
                  <div style="font-size:0.72rem;color:var(--text-muted)">${q.type}${q.minutes ? ' · ~' + q.minutes + 'м' : ''} · +${q.xp} XP</div>
                </div>
                <button class="btn btn-success btn-sm" onclick="completeQuest('${q.id}')" style="min-height:36px;min-width:44px">✓</button>
              </div>
            `).join('')}
          </div>`;
      }

      el.innerHTML = `
        <div class="hero-card">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">
            <div class="hero-name" style="margin:0">${escapeHtml(h.name)}</div>
            <button type="button" class="btn btn-secondary btn-sm" onclick="editHeroName()">Изменить ник</button>
          </div>
          <div class="text-dim" style="font-size:0.78rem;margin:8px 0 6px">Уровень героя (общий прогресс)</div>
          <div class="hero-lvl">LVL ${prog.level}</div>
          <div class="progress-wrap" style="max-width:280px;margin:12px auto;position:relative">
            <div class="progress-bar gold" style="width:${prog.percent}%"></div>
          </div>
          <div class="hero-xp">
            <span>${formatNum(h.xp)}</span> XP
            ${prog.level < MAX_LEVEL ? ` · до LVL ${prog.level + 1}: <span>${formatNum(prog.needed - prog.current)}</span>` : ' · MAX'}
          </div>
          ${nearMiss ? `<div style="margin-top:10px;color:var(--gold);font-weight:600;font-size:0.88rem">⚡ Почти новый уровень героя</div>` : ''}
        </div>

        <div class="stats-grid">
          <div class="stat-box"><div class="val">${doneToday}</div><div class="lbl">Сегодня</div></div>
          <div class="stat-box"><div class="val">${streak.current}</div><div class="lbl">Серия, дн</div></div>
          <div class="stat-box"><div class="val">${totalDirs}</div><div class="lbl">Направлений</div></div>
          <div class="stat-box"><div class="val">${doneQuests}</div><div class="lbl">Квестов ✓</div></div>
        </div>

        ${nextBlock}

        ${heroGoalsBlock()}

        ${renderWeeklyPulseBlock()}

        ${showExtras ? `
        <div class="card mt-12">
          <div style="display:flex;flex-wrap:wrap;gap:8px">
            <button class="btn btn-secondary btn-sm" onclick="openTitlePicker()">${escapeHtml(title.name)}</button>
            <button class="btn btn-secondary btn-sm" onclick="openAchievements()">🏆 ${state.unlockedAchievements.length}</button>
            <button class="btn btn-secondary btn-sm" onclick="showWeeklyReview()">Обзор</button>
            <button class="btn btn-secondary btn-sm" onclick="takeRestDay()" ${!canTakeRestDay() ? 'disabled style="opacity:0.45"' : ''}>Отдых</button>
          </div>
          <p class="text-dim" style="font-size:0.75rem;margin-top:10px">Титул героя: ${escapeHtml(title.name)}. Это не уровень направления.</p>
        </div>` : ''}
      `;
    }

    function easyStart() {
      const active = state.quests.filter(q => !q.done);
      if (active.length === 0) {
        toast('Нет активных квестов. Создай новый!', 'error');
        switchScreen('quests');
        return;
      }
      // Prefer SIDE I-II, then any SIDE, then any
      let pick = active.filter(q => q.type === 'SIDE' && q.difficulty <= 2);
      if (!pick.length) pick = active.filter(q => q.type === 'SIDE');
      if (!pick.length) pick = active;
      const q = pick[Math.floor(Math.random() * pick.length)];
      toast(`💡 Попробуй: «${q.title}»`, 'success');
      switchScreen('quests');
    }

    function editHeroName() {
      document.getElementById('modalContent').innerHTML = `
        <h2>Ник героя</h2>
        <p class="text-dim" style="font-size:0.88rem;margin-bottom:14px">Так тебя видно на главном экране и в истории.</p>
        <div class="form-group">
          <label>Ник</label>
          <input type="text" id="heroNameInput" value="${escapeHtml(state.hero.name || '')}" maxlength="40" placeholder="Как тебя зовут?" autocomplete="nickname">
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" onclick="closeModal()">Отмена</button>
          <button class="btn btn-primary" onclick="saveHeroName()">Сохранить</button>
        </div>
      `;
      openModal();
      setTimeout(() => {
        const inp = document.getElementById('heroNameInput');
        if (inp) { inp.focus(); inp.select(); }
      }, 100);
    }

    function saveHeroName() {
      const name = (document.getElementById('heroNameInput')?.value || '').trim();
      if (!name) { toast('Введи ник', 'error'); return; }
      state.hero.name = name.slice(0, 40);
      if (!save()) return;
      closeModal();
      renderHero();
      toast('Ник обновлён', 'success');
    }

    // ===================== QUESTS =====================
    function xpToNextLevel() {
      const prog = xpProgress(state.hero.xp || 0);
      if (prog.level >= MAX_LEVEL) return 0;
      return Math.max(0, prog.needed - prog.current);
    }

    function questWouldLevel(q) {
      if (q.done) return false;
      const need = xpToNextLevel();
      if (need <= 0) return false;
      const prog = xpProgress(state.hero.xp || 0);
      // near-miss: less than 15% remaining OR this quest alone finishes the level
      const remainPct = prog.needed > 0 ? (need / prog.needed) * 100 : 100;
      return q.xp >= need || remainPct < 15 && q.xp >= need * 0.5;
    }

    function getQuestDirectionId(q) {
      if (!q) return null;
      if (q.targetType === 'DIRECTION' && q.targetId) {
        return state.directions.some(d => d.id === q.targetId) ? q.targetId : null;
      }
      if (q.targetType === 'SKILL' && q.targetId) {
        const dir = state.directions.find(d => (d.nodes || []).some(n => n.id === q.targetId));
        return dir ? dir.id : null;
      }
      return null;
    }

    function getQuestRecommendations(limit = 3) {
      const now = Date.now();
      const active = (state.quests || []).filter(q => !q.done && !isHabitQuest(q));
      const ranked = active.map(q => {
        let score = 0;
        const reasons = [];
        if (q.goalId) {
          const goal = getGoal(q.goalId);
          if (goal && goal.status === 'active') { score += 5; reasons.push('двигает активную цель'); }
        }
        if (q.targetType === 'SKILL' && q.targetId) {
          const found = state.directions.flatMap(d => (d.nodes || []).map(n => ({ node: n, dir: d }))).find(x => x.node.id === q.targetId);
          if (found) {
            const last = Number(found.node.lastActiveAt) || 0;
            if (!last || now - last > 14 * 86400000) { score += 3; reasons.push('возвращает практику навыка'); }
          }
        }
        if (questWouldLevel(q)) { score += 4; reasons.push('приближает новый уровень'); }
        const minutes = Math.max(0, Number(q.minutes) || 0);
        if (minutes > 0 && minutes <= 20) { score += 2; reasons.push('можно закрыть за короткую сессию'); }
        if (q.type === 'BOSS') score -= 1;
        if (!reasons.length) reasons.push('поддерживает регулярный прогресс');
        return { q, score, reasons };
      });
      return ranked.sort((a, b) => b.score - a.score || (Number(a.q.minutes) || 999) - (Number(b.q.minutes) || 999)).slice(0, limit);
    }

    function renderQuestFilters() {
      const wrap = document.getElementById('questFilters');
      if (!wrap) return;
      const items = [
        { id: 'active', label: 'Активные' },
        { id: 'HABIT', label: 'Привычки' },
        { id: 'done', label: 'Готово' },
        { id: 'general', label: 'Общие' },
        ...state.directions.map(d => ({ id: 'dir:' + d.id, label: d.name }))
      ];
      if (!items.some(x => x.id === questFilter)) questFilter = 'active';
      wrap.innerHTML = items.map(x =>
        `<button class="filter-btn ${questFilter === x.id ? 'active' : ''}" data-filter="${escapeHtml(x.id)}">${escapeHtml(x.label)}</button>`
      ).join('');
    }

    function renderQuests() {
      const list = document.getElementById('questsList');
      if (!list) return;
      try { resetHabitsForToday(); } catch (e) {}
      renderQuestFilters();

      const isHabitQ = isHabitQuest;
      const habits = (state.quests || []).filter(isHabitQ);
      let quests = (state.quests || []).filter(q => !isHabitQ(q));

      // Hide completed one-shot quests unless viewing "done"
      if (questFilter === 'active') {
        quests = quests.filter(q => !q.done);
      } else if (questFilter === 'done') {
        quests = quests.filter(q => q.done);
      } else if (questFilter === 'HABIT') {
        quests = [];
      } else if (questFilter === 'general') {
        quests = quests.filter(q => !q.done && !getQuestDirectionId(q));
      } else if (String(questFilter).startsWith('dir:')) {
        const dirId = questFilter.slice(4);
        quests = quests.filter(q => !q.done && getQuestDirectionId(q) === dirId);
      } else {
        // legacy "all" → active only
        quests = quests.filter(q => !q.done);
      }

      if (questSearch) {
        const s = questSearch;
        quests = quests.filter(q =>
          (q.title || '').toLowerCase().includes(s) ||
          (q.description || '').toLowerCase().includes(s)
        );
      }

      if (questSort === 'xp') quests.sort((a, b) => (b.xp || 0) - (a.xp || 0));
      else if (questSort === 'date') quests.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      else if (questSort === 'diff') quests.sort((a, b) => (b.difficulty || 0) - (a.difficulty || 0));
      else quests.reverse();

      function questCardHtml(q) {
        const targetLabel = getQuestTargetLabel(q);
        const near = !q.done && questWouldLevel(q);
        const habit = isHabitQ(q);
        const doneToday = habit && habitDoneToday(q);
        return `
          <div class="card quest-card ${q.done ? 'done' : ''} ${q.type === 'BOSS' ? 'boss-card' : ''} ${habit ? 'habit-card' : ''}" style="${near ? 'border-color:rgba(212,165,116,0.55)' : ''}">
            <div class="quest-header">
              <div class="quest-title">${habit ? '🔁 ' : ''}${escapeHtml(q.title)}</div>
              <div class="quest-xp">+${formatNum(q.xp)} XP</div>
            </div>
            <div class="quest-meta">
              <span class="badge badge-${(q.type || 'SIDE').toLowerCase()}">${q.type === 'BOSS' ? '☠ ' : ''}${habit ? 'ПРИВЫЧКА' : q.type}</span>
              ${!habit ? `<span class="badge badge-diff">${DIFF_LABELS[q.difficulty] || q.difficulty}</span>` : ''}
              ${q.minutes ? `<span class="badge">~${q.minutes} мин</span>` : ''}
              ${habit && (q.habitStreak || 0) > 0 ? `<span class="badge badge-done">🔥 ${q.habitStreak} дн</span>` : ''}
              ${doneToday || (q.done && !habit) ? '<span class="badge badge-done">✓</span>' : ''}
              ${near ? '<span class="badge" style="color:var(--gold);border-color:rgba(212,165,116,0.4)">⚡ Уровень</span>' : ''}
              ${(q.tags||[]).map(tg => {
                const meta = QUEST_TAGS.find(x => x.id === tg);
                return meta ? `<span class="badge">${meta.label}</span>` : '';
              }).join('')}
            </div>
            ${q.description ? `<div class="quest-desc">${escapeHtml(q.description)}</div>` : ''}
            ${q.completionCriteria ? `<div class="quest-desc" style="opacity:.85"><strong>Критерий:</strong> ${escapeHtml(q.completionCriteria)}</div>` : ''}
            ${q.done && q.result ? `<div class="quest-desc" style="opacity:.9;border-left:2px solid var(--teal);padding-left:9px"><strong>Результат:</strong> ${escapeHtml(q.result)}</div>` : ''}
            ${q.done && q.goalId && q.goalResultUnits != null ? `<div class="quest-desc" style="opacity:.85"><strong>Вклад в цель:</strong> +${formatNum(q.goalResultUnits)} ${escapeHtml((getGoal(q.goalId)?.metric?.unitLabel) || 'ед.')}</div>` : ''}
            ${targetLabel ? `<div class="quest-target">🎯 ${escapeHtml(targetLabel)}</div>` : ''}
            <div class="quest-actions">
              ${!q.done ? `<button class="btn btn-success btn-sm" onclick="completeQuest('${q.id}')">${habit ? '✓ Сделано' : '✓'}</button>` : ''}
              ${q.done && habit ? `<button class="btn btn-secondary btn-sm" onclick="uncompleteHabit('${q.id}')">↩</button>` : ''}
              <button class="btn btn-secondary btn-sm" onclick="openQuestModal('${q.id}')">✎</button>
              <button class="btn btn-danger btn-sm" onclick="deleteQuest('${q.id}')">✕</button>
            </div>
          </div>
        `;
      }

      let habitsHtml = '';
      if (questFilter !== 'done' && (questFilter === 'active' || questFilter === 'HABIT' || questFilter === 'all')) {
        let showHabits = habits;
        if (questSearch) {
          showHabits = habits.filter(hh => (hh.title || '').toLowerCase().includes(questSearch));
        }
        const doneN = showHabits.filter(habitDoneToday).length;
        habitsHtml = `
          <div class="habits-block" style="margin-bottom:16px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;gap:8px">
              <strong style="font-size:0.95rem">🔁 Привычки · ${doneN}/${showHabits.length}</strong>
              <button type="button" class="btn btn-secondary btn-sm" onclick="openQuestModal(null,'HABIT')">+</button>
            </div>
            ${showHabits.length ? showHabits.map(questCardHtml).join('') : '<p style="font-size:0.85rem;opacity:0.7;margin:0 0 8px">Ежедневные рутины. Отмечай каждый день — снова появятся завтра.</p>'}
          </div>`;
      }

      if (!quests.length && !habitsHtml) {
        list.innerHTML = `
          <div class="empty-state">
            <div class="big-icon">📜</div>
            <h3>Нет активных квестов</h3>
            <p>Выполненные в «Готово». Добавь квест или привычку.</p>
            <div style="display:flex;flex-direction:column;gap:8px;max-width:280px;margin:0 auto">
              <button class="btn btn-primary" onclick="openQuestModal()">+ Квест</button>
              <button class="btn btn-secondary" onclick="openQuestModal(null,'HABIT')">+ Привычка</button>
            </div>
          </div>`;
        return;
      }

      const questsBlock = quests.length
        ? (habitsHtml ? '<div style="font-size:0.8rem;opacity:0.65;margin:10px 0 6px">Квесты (разовые)</div>' : '') + quests.map(questCardHtml).join('')
        : '';
      let recommendationsHtml = '';
      if (questFilter === 'active' && !questSearch) {
        const recommendations = getQuestRecommendations(3);
        if (recommendations.length) {
          recommendationsHtml = `<div class="tip-box" style="margin:0 0 14px"><strong>🧠 Что сделать дальше</strong><div class="text-dim" style="font-size:.78rem;margin:3px 0 8px">Рекомендации учитывают цели, практику навыков, длительность и близость нового уровня.</div>${recommendations.map(({ q, reasons }) => `<div style="padding:9px 0;border-top:1px solid var(--border)"><div style="font-weight:650">${escapeHtml(q.title)}</div><div class="text-dim" style="font-size:.78rem;margin:3px 0 7px">${escapeHtml(reasons[0])}${q.minutes ? ` · ~${formatNum(q.minutes)} мин` : ''} · +${formatNum(q.xp || 0)} XP</div><button class="btn btn-success btn-sm" onclick="completeQuest('${String(q.id).replace(/'/g, '&#39;')}')">Приступить</button></div>`).join('')}</div>`;
        }
      }
      list.innerHTML = recommendationsHtml + habitsHtml + questsBlock;
    }

    function quickAddQuest() {
      const input = document.getElementById('quickQuestInput');
      const title = (input?.value || '').trim();
      if (!title) { toast('Введи название', 'error'); return; }
      ensureAi();
      const type = 'SIDE';
      const difficulty = state.ai.preferredDifficulty?.SIDE || 2;
      state.quests.push({
        id: uid(),
        title: title.slice(0, 120),
        type,
        difficulty,
        xp: QUEST_XP[type][difficulty],
        description: '',
        targetType: 'GENERAL',
        targetId: null,
        done: false,
        createdAt: Date.now()
      });
      if (input) input.value = '';
      if (!save()) return;
      renderQuests();
      renderHero();
      toast('Квест добавлен', 'success');
      haptic();
    }

    function copyQuest(id) {
      const q = state.quests.find(x => x.id === id);
      if (!q) return;
      state.quests.push({
        id: uid(),
        title: q.title,
        type: q.type,
        difficulty: q.difficulty,
        xp: QUEST_XP[q.type][q.difficulty],
        description: q.description || '',
        completionCriteria: q.completionCriteria || '',
        targetType: q.targetType || 'GENERAL',
        targetId: q.targetId || null,
        done: false,
        createdAt: Date.now()
      });
      if (!save()) return;
      renderQuests();
      toast('Квест скопирован', 'success');
    }

    function openAiQuestPicker() {
      ensureAi();
      if (!hasAiAccess()) {
        toast('ИИ временно недоступен', 'error');
        return;
      }
      const dirs = state.directions;
      document.getElementById('modalContent').innerHTML = `
        <h2>ИИ: квесты</h2>
        <p class="text-dim" style="margin-bottom:14px;font-size:0.88rem">Выбери направление — ИИ предложит квесты под него.</p>
        <div class="form-group">
          <label>Направление</label>
          <select id="aiQuestDir">
            ${dirs.length ? dirs.map(d => `<option value="${d.id}">${escapeHtml(d.name)}</option>`).join('') : '<option value="">Сначала создай направление</option>'}
          </select>
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" onclick="closeModal()">Отмена</button>
          <button class="btn btn-primary" onclick="const id=document.getElementById('aiQuestDir').value;if(id){closeModal();generateQuestsForDirection(id)}else toast('Нет направления','error')">Сгенерировать</button>
        </div>
      `;
      openModal();
    }

    function getQuestTargetLabel(q) {
      if (q.targetType === 'GENERAL' || !q.targetId) return null;
      if (q.targetType === 'DIRECTION') {
        const d = state.directions.find(x => x.id === q.targetId);
        return d ? `Направление: ${d.name}` : 'Направление (удалено)';
      }
      if (q.targetType === 'SKILL') {
        for (const d of state.directions) {
          const n = (d.nodes || []).find(x => x.id === q.targetId);
          if (n) return `Навык: ${n.name} (${d.name})`;
        }
        return 'Навык (удалён)';
      }
      return null;
    }

    function openQuestModal(id, defaultType) {
      editingId = id || null;
      editingType = 'quest';
      const q = id ? state.quests.find(x => x.id === id) : null;

      const dirOptions = state.directions.map(d =>
        `<option value="dir:${d.id}" ${q && q.targetType === 'DIRECTION' && q.targetId === d.id ? 'selected' : ''}>${escapeHtml(d.name)}</option>`
      ).join('');

      let skillOptions = '';
      state.directions.forEach(d => {
        (d.nodes || []).forEach(n => {
          skillOptions += `<option value="skill:${n.id}" ${q && q.targetType === 'SKILL' && q.targetId === n.id ? 'selected' : ''}>${escapeHtml(d.name)} → ${escapeHtml(n.name)}</option>`;
        });
      });

      ensureAi();
      const type = q ? q.type : (defaultType === 'HABIT' ? 'HABIT' : 'SIDE');
      const diff = q ? q.difficulty : (state.ai.preferredDifficulty?.[type] || 3);
      const tags = (q && Array.isArray(q.tags)) ? q.tags : [];

      document.getElementById('modalContent').innerHTML = `
        <h2>${q ? 'Редактировать квест' : 'Новый квест'}</h2>
        <div class="form-group">
          <label>Название</label>
          <input type="text" id="qTitle" value="${q ? escapeHtml(q.title) : ''}" placeholder="Что нужно сделать?" maxlength="120">
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Тип</label>
            <select id="qType" onchange="updateXpPreview()">
              <option value="SIDE" ${type==='SIDE'?'selected':''}>SIDE</option>
              <option value="MAIN" ${type==='MAIN'?'selected':''}>MAIN</option>
              <option value="BOSS" ${type==='BOSS'?'selected':''}>☠ BOSS</option>
              <option value="HABIT" ${type==='HABIT'?'selected':''}>ПРИВЫЧКА (каждый день)</option>
            </select>
          </div>
          <div class="form-group">
            <label>Сложность</label>
            <select id="qDiff" onchange="updateXpPreview()">
              ${[1,2,3,4,5].map(d => `<option value="${d}" ${diff===d?'selected':''}>${DIFF_LABELS[d]}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="xp-preview">
          <div class="val" id="xpPreviewVal">+${QUEST_XP[type][diff]} XP</div>
          <div class="lbl">Награда (автоматически)</div>
        </div>
        <div class="form-group">
          <label>Теги</label>
          <div style="display:flex;flex-wrap:wrap;gap:6px" id="qTags">
            ${QUEST_TAGS.map(tg => `
              <label style="display:flex;align-items:center;gap:4px;font-size:0.82rem;border:1px solid var(--border);padding:6px 10px;border-radius:99px;cursor:pointer">
                <input type="checkbox" value="${tg.id}" ${tags.includes(tg.id)?'checked':''} style="width:14px;height:14px"> ${tg.label}
              </label>
            `).join('')}
          </div>
        </div>
        <div class="form-group">
          <label>Критерий выполнения <span style="color:var(--text-muted);font-weight:500">(необязательно)</span></label>
          <textarea id="qCriteria" placeholder="Как понять, что квест реально выполнен? Например: 10 чистых переходов Em → F подряд без остановки">${q ? escapeHtml(q.completionCriteria || '') : ''}</textarea>
          <p class="text-dim" style="font-size:0.76rem;margin-top:5px">Критерий нужен для честного XP: не «позаниматься», а конкретный измеримый результат.</p>
        </div>
        <div class="form-group">
          <label>Описание</label>
          <textarea id="qDesc" rows="4" placeholder="Что сделать и как понять, что готово">${q ? escapeHtml(q.description || '') : ''}</textarea>
        </div>
        <div class="form-group">
          <label>Привязка награды (XP)</label>
          <select id="qTarget">
            <option value="general" ${!q || q.targetType==='GENERAL' ? 'selected' : ''}>Общий XP (только герой)</option>
            ${dirOptions ? `<optgroup label="Направления">${dirOptions}</optgroup>` : ''}
            ${skillOptions ? `<optgroup label="Навыки">${skillOptions}</optgroup>` : ''}
          </select>
        </div>
        <div class="form-group">
          <label>Вклад в цель</label>
          <select id="qGoal">${goalOptionsHtml(q && q.goalId)}</select>
        </div>
        <div class="form-group">
          <label>Сколько единиц к цели при ✓</label>
          <input type="number" id="qGoalUnits" min="0" value="${q && q.goalUnits ? q.goalUnits : 1}" placeholder="1">
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" onclick="closeModal()">Отмена</button>
          <button class="btn btn-primary" onclick="saveQuest()">${q ? 'Сохранить' : 'Создать'}</button>
        </div>
      `;
      openModal();
      updateXpPreview();
    }

    function updateXpPreview() {
      const type = document.getElementById('qType')?.value || 'SIDE';
      const diff = parseInt(document.getElementById('qDiff')?.value || 3, 10);
      const xp = QUEST_XP[type]?.[diff] || 0;
      const el = document.getElementById('xpPreviewVal');
      if (el) el.textContent = `+${xp} XP`;
    }

    function saveQuest() {
      const title = document.getElementById('qTitle').value.trim();
      if (!title) { toast('Введи название', 'error'); return; }

      const type = document.getElementById('qType').value;
      const difficulty = parseInt(document.getElementById('qDiff').value, 10);
      const description = document.getElementById('qDesc').value.trim();
      const completionCriteria = (document.getElementById('qCriteria')?.value || '').trim().slice(0, 500);
      const targetRaw = document.getElementById('qTarget').value;
      const xp = QUEST_XP[type][difficulty];
      const tags = Array.from(document.querySelectorAll('#qTags input:checked')).map(el => el.value);

      let targetType = 'GENERAL';
      let targetId = null;
      if (targetRaw.startsWith('dir:')) {
        targetType = 'DIRECTION';
        targetId = targetRaw.slice(4);
      } else if (targetRaw.startsWith('skill:')) {
        targetType = 'SKILL';
        targetId = targetRaw.slice(6);
      }

      const goalId = document.getElementById('qGoal')?.value || null;
      const goalUnits = Math.max(0, parseInt(document.getElementById('qGoalUnits')?.value, 10) || 0);

      if (!QUEST_XP[type]) { toast('Тип квеста?', 'error'); return; }
      if (editingId) {
        const q = state.quests.find(x => x.id === editingId);
        if (q && (!q.done || isHabitQuest(q))) {
          q.title = title;
          q.type = type;
          q.difficulty = difficulty;
          q.xp = xp;
          q.description = description;
          q.completionCriteria = completionCriteria;
          q.targetType = targetType;
          q.targetId = targetId;
          q.tags = tags;
          q.goalId = goalId || null;
          q.goalUnits = goalId ? goalUnits : 0;
          q.habit = type === 'HABIT';
          if (type === 'HABIT') {
            if (q.habitStreak == null) q.habitStreak = 0;
            if (q.habitBest == null) q.habitBest = 0;
          }
          toast('Сохранено');
        }
      } else {
        state.quests.push({
          id: uid(),
          title,
          type,
          difficulty,
          xp,
          description,
          completionCriteria,
          targetType,
          targetId,
          tags,
          goalId: goalId || null,
          goalUnits: goalId ? goalUnits : 0,
          done: false,
          createdAt: Date.now(),
          habit: type === 'HABIT',
          habitStreak: type === 'HABIT' ? 0 : undefined,
          habitBest: type === 'HABIT' ? 0 : undefined
        });
        toast(type === 'HABIT' ? 'Привычка создана' : 'Квест создан');
      }
      ensureAi();
      if (!state.ai.preferredDifficulty) state.ai.preferredDifficulty = {};
      state.ai.preferredDifficulty[type] = difficulty;
      if (!save()) return;
      closeModal();
      renderQuests();
      renderHero();
    }

    function completeQuest(id) {
      const q = state.quests.find(x => x.id === id);
      if (!q || q.done) return;
      const isHabit = isHabitQuest(q);
      const criteriaHtml = q.completionCriteria
        ? `<div class="mentor-quest"><div class="mq-title">${escapeHtml(q.title)}</div><div class="mq-criterion"><strong>Критерий:</strong><br>${escapeHtml(q.completionCriteria)}</div></div>`
        : `<div class="mentor-quest"><div class="mq-title">${escapeHtml(q.title)}</div></div>`;
      const verifyHtml = q.completionCriteria && !isHabit
        ? `<label class="verify-box"><input type="checkbox" id="questVerifyCheck"><span>Я действительно выполнил указанный критерий. Это не просто попытка.</span></label>`
        : '';
      const resultHtml = !isHabit
        ? `<div class="form-group" style="margin-top:12px"><label>Результат <span style="color:var(--text-muted);font-weight:500">(что фактически получилось)</span></label><textarea id="questResult" rows="3" maxlength="500" placeholder="Например: решил 17/20 задач; создал рабочую функцию; сдал лабораторную"></textarea><p class="text-dim" style="font-size:0.76rem;margin-top:5px">Коротко зафиксируй итог. Это попадёт в историю героя.</p></div>`
        : '';
      const linkedGoal = !isHabit && q.goalId ? getGoal(q.goalId) : null;
      const goalUnitsHtml = linkedGoal && linkedGoal.status === 'active'
        ? `<div class="form-group" style="margin-top:12px"><label>Фактический вклад в цель (${escapeHtml(linkedGoal.metric.unitLabel || 'ед.')})</label><input type="number" id="questGoalActual" min="0" step="1" inputmode="numeric" value="${Math.max(0, parseInt(q.goalUnits, 10) || 0)}"><p class="text-dim" style="font-size:0.76rem;margin-top:5px">Цель: ${escapeHtml(linkedGoal.title)} · сейчас ${formatNum(linkedGoal.metric.current || 0)}/${formatNum(linkedGoal.metric.target || 1)}. Измени число, если фактический результат отличается от плана; 0 — не добавлять прогресс.</p></div>`
        : '';
      document.getElementById('modalContent').innerHTML = `<h2>Завершить квест</h2><p class="text-dim" style="margin-bottom:10px">XP начисляется за выполненный результат, а не просто за нажатие кнопки.</p>${criteriaHtml}${resultHtml}${goalUnitsHtml}${verifyHtml}<div class="modal-actions"><button class="btn btn-secondary" onclick="closeModal()">Отмена</button><button class="btn btn-primary" id="questVerifyBtn" ${q.completionCriteria && !isHabit ? 'disabled' : ''} onclick="confirmQuestCompletion('${id}')">${isHabit ? 'Засчитать' : 'Завершить и получить XP'}</button></div>`;
      openModal();
      const cb=document.getElementById('questVerifyCheck'), btn=document.getElementById('questVerifyBtn');
      if(cb&&btn) cb.addEventListener('change',()=>btn.disabled=!cb.checked);
    }
    function confirmQuestCompletion(id){
      const q = state.quests.find(x => x.id === id);
      if (!q || q.done) return;
      const cb=document.getElementById('questVerifyCheck');
      if (cb && !cb.checked) return;
      const result=(document.getElementById('questResult')?.value || '').trim().slice(0,500);
      const goalUnitsEl = document.getElementById('questGoalActual');
      const resultUnits = goalUnitsEl ? Math.max(0, parseInt(goalUnitsEl.value, 10) || 0) : null;
      closeModal();
      finishQuestCompletion(id, result, resultUnits);
    }

    function todayKey() {
      return new Date().toISOString().slice(0, 10);
    }

    function isHabitQuest(q) {
      return !!(q && (q.type === 'HABIT' || q.habit));
    }

    function habitDoneToday(q) {
      if (!q || !q.done || !q.completedAt) return false;
      return new Date(q.completedAt).toISOString().slice(0, 10) === todayKey();
    }

    function resetHabitsForToday() {
      const today = todayKey();
      let changed = false;
      (state.quests || []).forEach(q => {
        if (!isHabitQuest(q)) return;
        q.habit = true;
        q.type = 'HABIT';
        if (q.habitStreak == null) q.habitStreak = 0;
        if (q.habitBest == null) q.habitBest = 0;
        const doneDay = q.completedAt ? new Date(q.completedAt).toISOString().slice(0, 10) : null;
        if (q.done && doneDay && doneDay !== today) {
          q.done = false;
          changed = true;
        } else if (q.done && !doneDay) {
          q.done = false;
          changed = true;
        }
      });
      if (changed && !save()) return;
    }

    function uncompleteHabit(id) {
      const q = state.quests.find(x => x.id === id);
      if (!q || !isHabitQuest(q)) return;
      q.done = false;
      // Older saves may have the reward event ID but no daily idempotency field.
      if (q.lastRewardEventId) q.lastHabitRewardDay = todayKey();
      if (q.lastHabitDay === todayKey()) {
        q.habitStreakBeforeUndo = Math.max(0, Number(q.habitStreak) || 1);
        q.habitStreakUndoDay = todayKey();
        q.habitStreak = Math.max(0, (q.habitStreak || 1) - 1);
        q.lastHabitDay = null;
      }
      delete q.completedAt;
      if (!save()) return;
      renderQuests();
      renderHero();
      toast('Снято на сегодня');
    }

    function finishQuestCompletion(id, result = '', resultUnits = null) {
      const q = state.quests.find(x => x.id === id);
      if (!q || q.done) return;
      const isHabit = isHabitQuest(q);
      const rewardAlreadyGrantedToday = isHabit
        && hasHabitRewardForDay(q, state.rewardLedger, todayKey());
      q.done = true;
      q.completedAt = Date.now();
      if (!isHabit && result) q.result = result;
      else if (isHabit) delete q.result;
      if (!isHabit && q.goalId) {
        const actualUnits = resultUnits == null ? Math.max(0, parseInt(q.goalUnits, 10) || 0) : Math.max(0, parseInt(resultUnits, 10) || 0);
        q.goalResultUnits = actualUnits;
      } else {
        delete q.goalResultUnits;
      }
      if (!isHabit) {
        state.stats.completed = (state.stats.completed || 0) + 1;
      } else {
        const today = todayKey();
        if (q.habitStreakUndoDay && q.habitStreakUndoDay !== today) {
          delete q.habitStreakBeforeUndo;
          delete q.habitStreakUndoDay;
        }
        if (rewardAlreadyGrantedToday && q.habitStreakUndoDay === today) {
          q.habitStreak = Math.max(0, Number(q.habitStreakBeforeUndo) || 0);
          delete q.habitStreakBeforeUndo;
          delete q.habitStreakUndoDay;
        } else {
          const yesterday = new Date();
          yesterday.setDate(yesterday.getDate() - 1);
          const yKey = yesterday.toISOString().slice(0, 10);
          const last = q.lastHabitDay || null;
          if (last === yKey) q.habitStreak = (q.habitStreak || 0) + 1;
          else if (last !== today) q.habitStreak = 1;
        }
        q.lastHabitDay = today;
        q.habitBest = Math.max(q.habitBest || 0, q.habitStreak || 0);
        if (!rewardAlreadyGrantedToday) {
          state.stats.habitChecks = (state.stats.habitChecks || 0) + 1;
        }
      }
      haptic();

      // Streak
      updateStreak();

      // A habit may be unchecked and checked again on the same day. Its reward
      // is still earned only once per day; toggling completion must not mint XP.
      if (rewardAlreadyGrantedToday) {
        q.lastHabitRewardDay = todayKey();
        if (!save()) return;
        renderQuests();
        renderHero();
        renderDirections();
        toast('Привычка отмечена. XP за сегодня уже начислен.', 'success');
        return;
      }
      if (isHabit) q.lastHabitRewardDay = todayKey();

      // Variable reward (luck)
      const luck = tryLuckBonus(q.xp);
      const finalXp = luck.total;
      q.earnedXp = finalXp;

      applyXp(finalXp, q.targetType, q.targetId, { bonus: luck.bonus });

      // Goal progress
      let goalNote = '';
      const actualGoalUnits = !isHabit && q.goalId
        ? Math.max(0, parseInt(q.goalResultUnits, 10) || 0)
        : Math.max(0, parseInt(q.goalUnits, 10) || 0);
      if (q.goalId && actualGoalUnits > 0) {
        const g = applyGoalProgress(q.goalId, actualGoalUnits);
        if (g) goalNote = ` · цель «${g.title}» +${actualGoalUnits} ${g.metric.unitLabel || 'ед.'} · ${g.metric.current}/${g.metric.target}`;
      }

      // Audit trail + reward ledger. A completed quest is guarded above by q.done,
      // so repeated taps cannot issue a second reward for the same completion.
      const eventId = uid();
      q.lastRewardEventId = eventId;
      if (!Array.isArray(state.rewardLedger)) state.rewardLedger = [];
      state.rewardLedger.push({ eventId, questId: q.id, at: q.completedAt, xp: finalXp, baseXp: Math.max(0, Number(q.xp) || 0), bonusXp: Math.max(0, Number(luck.bonus) || 0), habit: isHabit });
      if (state.rewardLedger.length > 500) state.rewardLedger.splice(0, state.rewardLedger.length - 500);
      if (!Array.isArray(state.activityLog)) state.activityLog = [];
      const linkedGoalForLog = q.goalId ? getGoal(q.goalId) : null;
      state.activityLog.unshift({
        id: eventId, at: q.completedAt, type: 'quest_completed', questId: q.id,
        title: String(q.title || 'Без названия').slice(0, 160), xp: finalXp,
        bonusXp: Math.max(0, Number(luck.bonus) || 0), habit: isHabit,
        result: !isHabit ? String(q.result || '').slice(0, 500) : '',
        goalId: q.goalId || null, goalTitle: linkedGoalForLog ? linkedGoalForLog.title : '',
        goalUnits: q.goalId ? Math.max(0, Number(q.goalResultUnits ?? q.goalUnits) || 0) : 0,
        unitLabel: linkedGoalForLog?.metric?.unitLabel || 'ед.'
      });
      if (state.activityLog.length > 300) state.activityLog.length = 300;

      // Auto-lore
      const targetLabel = getQuestTargetLabel(q);
      let loreText = '';
      const dest = getQuestTargetLabel(q) || 'герою';
      if (q.type === 'BOSS') {
        loreText = `☠ BOSS повержен: «${q.title}» (+${finalXp} XP${luck.bonus ? ', 🍀 удача!' : ''})`;
        toast(`BOSS: +${finalXp} XP → ${dest}`, 'levelup');
      } else if (q.type === 'MAIN') {
        loreText = `📜 Главный квест выполнен: «${q.title}» (+${finalXp} XP${luck.bonus ? ', 🍀 удача!' : ''})`;
        toast(`+${finalXp} XP → герой и ${dest}`, 'success');
      } else if (isHabit) {
        loreText = `🔁 Привычка: «${q.title}» (+${finalXp} XP · серия ${q.habitStreak || 1})`;
        toast(`🔁 +${finalXp} XP · серия ${q.habitStreak || 1}`, 'success');
      } else {
        loreText = `✓ Квест выполнен: «${q.title}» (+${finalXp} XP${luck.bonus ? ', 🍀 удача!' : ''})`;
        toast(`+${finalXp} XP → герой${dest !== 'герою' ? ' · ' + dest : ''}`, 'success');
      }
      if (targetLabel) loreText += `\n🎯 ${targetLabel}`;
      if (!isHabit && q.result) loreText += `\n📌 Результат: ${q.result}`;
      if (!isHabit && q.goalId && q.goalResultUnits != null) {
        const goalForLore = getGoal(q.goalId);
        loreText += `\n🎯 Вклад в цель: +${q.goalResultUnits} ${(goalForLore && goalForLore.metric && goalForLore.metric.unitLabel) || 'ед.'}`;
      }
      if (goalNote) loreText += `\n${goalNote.trim()}`;
      if (state.streak.current > 1) loreText += `\n🔥 Серия: ${state.streak.current} дн.`;
      if (q.type === 'BOSS') addAutoLore(loreText, 'boss');
      else if (q.type === 'MAIN') addAutoLore(loreText, 'main');
      else addAutoLore(loreText, 'side');

      checkTitlesAndAchievements();
      if (!save()) return;
      renderQuests();
      renderHero();
      if (currentTreeDirId) renderTree(currentTreeDirId);
      renderDirections();

      // Reflection ritual for MAIN and BOSS
      if (q.type === 'MAIN' || q.type === 'BOSS') {
        setTimeout(() => openReflectionModal(q), 600);
      }
    }

    function showActivityLog() {
      const events = Array.isArray(state.activityLog) ? state.activityLog.slice(0, 40) : [];
      const fmtDate = (value) => {
        const d = new Date(Number(value) || value || 0);
        return Number.isNaN(d.getTime()) ? 'Дата неизвестна' : d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
      };
      const body = events.length ? events.map(e => `<div class="mentor-quest" style="margin-bottom:8px"><div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start"><div class="mq-title">${escapeHtml(e.title || 'Событие')}</div><strong style="white-space:nowrap;color:var(--gold)">+${formatNum(e.xp || 0)} XP</strong></div><div class="text-dim" style="font-size:.75rem;margin-top:4px">${escapeHtml(fmtDate(e.at))}${e.habit ? ' · привычка' : ''}${Number(e.bonusXp) > 0 ? ` · бонус +${formatNum(e.bonusXp)} XP` : ''}</div>${e.result ? `<div style="font-size:.82rem;margin-top:6px">Результат: ${escapeHtml(e.result)}</div>` : ''}${e.goalTitle && Number(e.goalUnits) > 0 ? `<div style="font-size:.8rem;margin-top:4px">Цель «${escapeHtml(e.goalTitle)}»: +${formatNum(e.goalUnits)} ${escapeHtml(e.unitLabel || 'ед.')}</div>` : ''}</div>`).join('') : '<div class="tip-box">История начнёт заполняться после следующих завершений квестов. Старые события автоматически не восстанавливаются.</div>';
      document.getElementById('modalContent').innerHTML = `<h2>История действий</h2><p class="text-dim" style="font-size:.82rem;margin-bottom:12px">Последние 40 событий. Записи сохраняются в локальном сейве и включаются в экспорт JSON.</p><div style="max-height:58vh;overflow:auto">${body}</div><div class="modal-actions"><button class="btn btn-secondary" onclick="closeModal()">Закрыть</button><button class="btn btn-primary" onclick="closeModal();exportSave()">Сделать резервную копию</button></div>`;
      openModal();
    }

    function deleteQuest(id) {
      if (!confirm('Удалить квест?')) return;
      state.quests = state.quests.filter(x => x.id !== id);
      if (!save()) return;
      renderQuests();
      renderHero();
      toast('Квест удалён');
    }


    // ===================== GOALS =====================
    const GOAL_HORIZON = {
      long: { label: 'Долгосрок', hint: '12–36 мес. · кем становишься' },
      medium: { label: 'Среднесрок', hint: '2–12 недель · конкретный результат' },
      short: { label: 'Краткосрок', hint: '1–7 дней · фокус недели' }
    };

    function ensureGoals() {
      if (!Array.isArray(state.goals)) state.goals = [];
    }

    function goalProgressPct(g) {
      const t = Math.max(1, Number(g.metric && g.metric.target) || 1);
      const c = Math.max(0, Number(g.metric && g.metric.current) || 0);
      return Math.min(100, Math.round((c / t) * 100));
    }

    function activeGoals(horizon) {
      ensureGoals();
      return state.goals.filter(g => g.status === 'active' && (!horizon || g.horizon === horizon));
    }

    function getGoal(id) {
      ensureGoals();
      return state.goals.find(g => g.id === id) || null;
    }

    function applyGoalProgress(goalId, units) {
      if (!goalId || !units) return null;
      const g = getGoal(goalId);
      if (!g || g.status !== 'active') return null;
      const before = g.metric.current || 0;
      g.metric.current = Math.min(g.metric.target || 1, before + Number(units));
      if (g.metric.current >= g.metric.target) {
        g.status = 'done';
        g.completedAt = Date.now();
        addAutoLore('🎯 Цель достигнута: «' + g.title + '»', 'main');
        toast('Цель закрыта: ' + g.title, 'levelup');
      }
      return g;
    }

    function renderGoals() {
      ensureGoals();
      const el = document.getElementById('goalsContent');
      if (!el) return;

      const order = ['short', 'medium', 'long'];
      const sections = order.map(h => {
        const list = state.goals.filter(g => g.horizon === h && g.status !== 'done');
        const done = state.goals.filter(g => g.horizon === h && g.status === 'done');
        const meta = GOAL_HORIZON[h];
        let body;
        if (!list.length) {
          body = `<p class="text-dim" style="font-size:0.85rem;margin:8px 0 4px">Пока пусто. ${escapeHtml(meta.hint)}</p>`;
        } else {
          body = list.map(g => {
            const pct = goalProgressPct(g);
            const dir = g.directionId ? state.directions.find(d => d.id === g.directionId) : null;
            const dl = g.deadline ? (' · до ' + g.deadline) : '';
            return `
              <div class="card" style="margin-bottom:10px;padding:14px">
                <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start">
                  <div style="min-width:0;flex:1">
                    <div style="font-weight:700;font-size:0.95rem">${escapeHtml(g.title)}</div>
                    <div class="text-dim" style="font-size:0.75rem;margin-top:4px">
                      ${dir ? escapeHtml(dir.name) + ' · ' : ''}${g.metric.current}/${g.metric.target} ${escapeHtml(g.metric.unitLabel || 'ед.')}${dl}
                    </div>
                  </div>
                  <span class="badge badge-gold">${pct}%</span>
                </div>
                <div class="progress-wrap" style="margin:10px 0 12px"><div class="progress-bar gold" style="width:${pct}%"></div></div>
                ${g.description ? `<p class="text-dim" style="font-size:0.82rem;margin-bottom:10px;line-height:1.45">${escapeHtml(g.description)}</p>` : ''}
                <div style="display:flex;gap:6px;flex-wrap:wrap">
                  <button class="btn btn-secondary btn-sm" onclick="openGoalModal('${g.id}')">Изменить</button>
                  <button class="btn btn-secondary btn-sm" onclick="nudgeGoal('${g.id}',1)">+1</button>
                  <button class="btn btn-success btn-sm" onclick="completeGoalManual('${g.id}')">Готово</button>
                  <button class="btn btn-danger btn-sm" onclick="deleteGoal('${g.id}')">✕</button>
                </div>
              </div>`;
          }).join('');
        }
        const doneLine = done.length
          ? `<p class="text-dim" style="font-size:0.75rem;margin-top:6px">Закрыто: ${done.length}</p>` : '';
        return `
          <div style="margin-bottom:18px">
            <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px">
              <div>
                <div style="font-weight:700;font-size:0.88rem">${meta.label}</div>
                <div class="text-dim" style="font-size:0.72rem">${meta.hint}</div>
              </div>
              <button class="btn btn-secondary btn-sm" style="min-height:32px" onclick="openGoalModal(null,'${h}')">+</button>
            </div>
            ${body}${doneLine}
          </div>`;
      }).join('');

      el.innerHTML = `
        <div class="tip-box" style="margin-bottom:14px">
          <strong>Как связано</strong><br>
          Долгосрок — зачем. Среднесрок — куда за месяц. Краткосрок — фокус недели.
          Квесты могут добавлять единицы к цели (задачи, темы, сессии).
        </div>
        ${sections}
        <button class="btn btn-secondary btn-block" onclick="switchScreen('lore')">Лор (история)</button>
      `;
    }

    function openGoalModal(id, presetHorizon) {
      ensureGoals();
      editingId = id || null;
      editingType = 'goal';
      const g = id ? getGoal(id) : null;
      const horizon = (g && g.horizon) || presetHorizon || 'medium';
      const dirOpts = state.directions.map(d =>
        `<option value="${d.id}" ${g && g.directionId === d.id ? 'selected' : ''}>${escapeHtml(d.name)}</option>`
      ).join('');

      document.getElementById('modalContent').innerHTML = `
        <h2>${g ? 'Цель' : 'Новая цель'}</h2>
        <div class="form-group">
          <label>Горизонт</label>
          <select id="gHorizon">
            <option value="short" ${horizon==='short'?'selected':''}>Краткосрок (неделя)</option>
            <option value="medium" ${horizon==='medium'?'selected':''}>Среднесрок (недели–месяцы)</option>
            <option value="long" ${horizon==='long'?'selected':''}>Долгосрок (год+)</option>
          </select>
        </div>
        <div class="form-group">
          <label>Название</label>
          <input type="text" id="gTitle" maxlength="100" value="${g ? escapeHtml(g.title) : ''}" placeholder="Например: 20 задач по сопромату">
        </div>
        <div class="form-group">
          <label>Критерий / описание</label>
          <textarea id="gDesc" rows="3" placeholder="Как поймёшь, что готово?">${g ? escapeHtml(g.description || '') : ''}</textarea>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>Нужно единиц</label>
            <input type="number" id="gTarget" min="1" value="${g ? (g.metric.target || 1) : 10}">
          </div>
          <div class="form-group">
            <label>Уже есть</label>
            <input type="number" id="gCurrent" min="0" value="${g ? (g.metric.current || 0) : 0}">
          </div>
        </div>
        <div class="form-group">
          <label>Единица (задачи, темы, часы…)</label>
          <input type="text" id="gUnit" maxlength="20" value="${g ? escapeHtml(g.metric.unitLabel || 'ед.') : 'задачи'}">
        </div>
        <div class="form-group">
          <label>Направление (опционально)</label>
          <select id="gDir">
            <option value="">—</option>
            ${dirOpts}
          </select>
        </div>
        <div class="form-group">
          <label>Дедлайн (опционально)</label>
          <input type="date" id="gDeadline" value="${g && g.deadline ? g.deadline : ''}">
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" onclick="closeModal()">Отмена</button>
          <button class="btn btn-primary" onclick="saveGoal()">${g ? 'Сохранить' : 'Создать'}</button>
        </div>
      `;
      openModal();
    }

    function saveGoal() {
      ensureGoals();
      const title = (document.getElementById('gTitle')?.value || '').trim();
      if (!title) { toast('Введи название', 'error'); return; }
      const horizon = document.getElementById('gHorizon')?.value || 'medium';
      const description = (document.getElementById('gDesc')?.value || '').trim();
      const target = Math.max(1, parseInt(document.getElementById('gTarget')?.value, 10) || 1);
      let current = Math.max(0, parseInt(document.getElementById('gCurrent')?.value, 10) || 0);
      current = Math.min(current, target);
      const unitLabel = (document.getElementById('gUnit')?.value || 'ед.').trim() || 'ед.';
      const directionId = document.getElementById('gDir')?.value || null;
      const deadline = document.getElementById('gDeadline')?.value || null;

      const activeSame = state.goals.filter(g => g.status === 'active' && g.horizon === horizon && g.id !== editingId);
      if (horizon === 'long' && activeSame.length >= 1 && !editingId) {
        toast('Долгосрок: лучше одна активная цель', 'error');
        return;
      }
      if (horizon === 'medium' && activeSame.length >= 3 && !editingId) {
        toast('Среднесрок: максимум 3 активных', 'error');
        return;
      }
      if (horizon === 'short' && activeSame.length >= 3 && !editingId) {
        toast('Краткосрок: максимум 3 активных', 'error');
        return;
      }

      if (editingId) {
        const g = getGoal(editingId);
        if (!g) return;
        g.title = title;
        g.horizon = horizon;
        g.description = description;
        g.metric = { target, current, unitLabel };
        g.directionId = directionId;
        g.deadline = deadline;
        if (current >= target) { g.status = 'done'; g.completedAt = Date.now(); }
        else if (g.status === 'done') { g.status = 'active'; delete g.completedAt; }
        toast('Цель сохранена');
      } else {
        state.goals.unshift({
          id: uid(),
          title,
          description,
          horizon,
          directionId,
          deadline,
          metric: { target, current, unitLabel },
          status: current >= target ? 'done' : 'active',
          createdAt: Date.now()
        });
        toast('Цель создана');
      }
      if (!save()) return;
      closeModal();
      renderGoals();
      renderHero();
    }

    function nudgeGoal(id, delta) {
      const g = applyGoalProgress(id, delta);
      if (!g) return;
      if (!save()) return;
      renderGoals();
      renderHero();
      toast('+' + delta + ' · ' + g.metric.current + '/' + g.metric.target);
    }

    function completeGoalManual(id) {
      const g = getGoal(id);
      if (!g) return;
      g.metric.current = g.metric.target;
      g.status = 'done';
      g.completedAt = Date.now();
      addAutoLore('🎯 Цель достигнута: «' + g.title + '»', 'main');
      if (!save()) return;
      renderGoals();
      renderHero();
      toast('Цель закрыта', 'levelup');
    }

    function deleteGoal(id) {
      if (!confirm('Удалить цель? Квесты останутся, привязка сбросится.')) return;
      ensureGoals();
      state.goals = state.goals.filter(g => g.id !== id);
      state.quests.forEach(q => {
        if (q.goalId === id) { q.goalId = null; q.goalUnits = 0; }
      });
      if (!save()) return;
      renderGoals();
      renderHero();
      toast('Цель удалена');
    }

    function goalOptionsHtml(selectedId) {
      ensureGoals();
      const act = state.goals.filter(g => g.status === 'active');
      if (!act.length) return '<option value="">— нет активных целей —</option>';
      return '<option value="">— без цели —</option>' + act.map(g => {
        const h = GOAL_HORIZON[g.horizon]?.label || g.horizon;
        return `<option value="${g.id}" ${selectedId === g.id ? 'selected' : ''}>${h}: ${escapeHtml(g.title)}</option>`;
      }).join('');
    }

    function heroGoalsBlock() {
      ensureGoals();
      const focus = [
        ...activeGoals('short').slice(0, 2),
        ...activeGoals('medium').slice(0, 2)
      ].slice(0, 3);
      if (!focus.length) {
        return `
          <div class="card mt-12">
            <div style="font-size:0.75rem;color:var(--text-muted);font-weight:600;margin-bottom:8px">ЦЕЛИ</div>
            <p class="text-dim" style="font-size:0.88rem;margin-bottom:12px">Задай среднесрок (например долг по сопромату) — квесты смогут двигать прогресс.</p>
            <button class="btn btn-primary btn-block" onclick="switchScreen('goals')">Открыть цели</button>
          </div>`;
      }
      return `
        <div class="card mt-12">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
            <div style="font-size:0.75rem;color:var(--text-muted);font-weight:600">ЦЕЛИ В ФОКУСЕ</div>
            <button class="btn btn-secondary btn-sm" style="min-height:30px;padding:4px 10px;font-size:0.75rem" onclick="switchScreen('goals')">Все</button>
          </div>
          ${focus.map(g => {
            const pct = goalProgressPct(g);
            return `
              <div style="padding:8px 0;border-top:1px solid var(--border)">
                <div style="display:flex;justify-content:space-between;gap:8px;font-size:0.88rem;font-weight:600">
                  <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(g.title)}</span>
                  <span style="color:var(--gold);flex-shrink:0">${pct}%</span>
                </div>
                <div class="progress-wrap" style="margin-top:6px"><div class="progress-bar gold" style="width:${pct}%"></div></div>
                <div class="text-dim" style="font-size:0.72rem;margin-top:4px">${g.metric.current}/${g.metric.target} ${escapeHtml(g.metric.unitLabel || '')}</div>
              </div>`;
          }).join('')}
        </div>`;
    }
