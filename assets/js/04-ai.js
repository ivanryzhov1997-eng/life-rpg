
    // ===================== ONBOARDING & HELP =====================
    const TREE_EXAMPLES = [
      {
        name: '🎸 Музыка / Гитара',
        tree: `Музыка
├── Аккорды
│   ├── Открытые (Am, C, G, Em)
│   ├── Баррэ
│   │   ├── F
│   │   └── Bm
│   └── Смены аккордов
├── Ритм
│   ├── Бой
│   └── Перебор
└── Песни
    ├── Простые
    └── Средние`
      },
      {
        name: '💰 Деньги / Карьера',
        tree: `Деньги
├── Навыки
│   ├── Переговоры
│   ├── Письмо
│   └── Презентации
├── Продукт
│   ├── Идея
│   └── Запуск
└── Сеть
    ├── Знакомства
    └── Репутация`
      },
      {
        name: '💪 Тело',
        tree: `Физическая форма
├── Сила
│   ├── Верх
│   └── Низ
├── Выносливость
└── Мобильность
    ├── Гибкость
    └── Осанка`
      }
    ];

    let onboardStep = 0;
    const ONBOARD_STEPS = [
      {
        id: 'welcome',
        title: 'LIFE RPG',
        html: `
          <p>Твоя реальная жизнь — как RPG. Делаешь дело → получаешь XP → растёт герой и навыки.</p>
          <div class="highlight">Всё твоё: направления, дерево навыков, квесты. Без чужих «привычек на всех».</div>
          <p style="font-size:0.85rem;color:var(--text-muted)">Онбординг ~5–7 минут. Потом можно сразу закрыть первый квест.</p>
        `
      },
      {
        id: 'types',
        title: 'Квесты',
        html: `
          <p><strong>SIDE</strong> — сегодня, 10–60 мин<br>
          <strong>MAIN</strong> — цель на дни<br>
          <strong>BOSS</strong> — серьёзное испытание</p>
          <div class="highlight">ИИ смотрит на <em>уровень в теме</em>: новичку не выдаст «концерт на 50 человек».</div>
        `
      },
      {
        id: 'create',
        title: 'Первое направление',
        interactive: true
      },
      {
        id: 'done',
        title: 'Готово к игре',
        html: `
          <p>Дальше:</p>
          <p>1. <strong>Квесты → На день</strong> или кнопка «Квесты ИИ» у направления<br>
          2. Закрой один SIDE кнопкой ✓ на экране Героя<br>
          3. При желании — цели, дерево навыков, лор</p>
          <div class="highlight">LVL героя ≠ уровень направления. Это разные шкалы.</div>
        `
      }
    ];

    function showOnboarding() {
      onboardStep = 0;
      renderOnboardStep();
      document.getElementById('onboardOverlay').classList.add('open');
    }

    function renderOnboardStep() {
      const s = ONBOARD_STEPS[onboardStep];
      const isLast = onboardStep === ONBOARD_STEPS.length - 1;
      let body = s.html || '';
      if (s.interactive) {
        body = `
          <p style="margin-bottom:12px;font-size:0.9rem;color:var(--text-dim)">Область жизни, которую качаешь (учёба, спорт, навык…).</p>
          <div class="form-group">
            <label>Название</label>
            <input type="text" id="obDirName" placeholder="Например: Английский" maxlength="40">
          </div>
          <div class="form-group">
            <label>Твой уровень в теме</label>
            <select id="obDirStage">
              <option value="beginner">Новичок</option>
              <option value="intermediate">Средний</option>
              <option value="advanced">Продвинутый</option>
              <option value="pro">Профи</option>
            </select>
          </div>
          <p style="font-size:0.78rem;color:var(--text-muted)">Можно пропустить и создать позже в «Навыках».</p>
        `;
      }
      document.getElementById('onboardCard').innerHTML = `
        <div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:8px">${onboardStep + 1} / ${ONBOARD_STEPS.length}</div>
        <h2>${s.title}</h2>
        ${body}
        <div class="modal-actions" style="margin-top:20px">
          ${onboardStep > 0 ? `<button class="btn btn-secondary" onclick="onboardStep--;renderOnboardStep()">Назад</button>` : `<button class="btn btn-secondary" onclick="closeOnboarding()">Пропустить</button>`}
          <button class="btn btn-primary" onclick="${isLast ? 'closeOnboarding(true)' : 'onboardNext()'}">${isLast ? 'В игру' : 'Далее'}</button>
        </div>
      `;
    }

    function onboardNext() {
      const s = ONBOARD_STEPS[onboardStep];
      if (s && s.interactive) {
        const name = (document.getElementById('obDirName')?.value || '').trim();
        const stage = document.getElementById('obDirStage')?.value || 'beginner';
        if (name) {
          state.directions.push({
            id: uid(),
            name,
            description: '',
            stage,
            xp: 0,
            nodes: [],
            createdAt: Date.now()
          });
          save();
          toast('Направление «' + name + '» создано', 'success');
        }
      }
      onboardStep++;
      renderOnboardStep();
    }

    function closeOnboarding(finished) {
      document.getElementById('onboardOverlay').classList.remove('open');
      try { localStorage.setItem('life_rpg_v5_onboarded', '1'); } catch(e) {}
      if (finished) {
        toast(state.directions.length ? 'Поехали' : 'Поехали. Создай направление в «Навыках»', 'success');
        if (!state.directions.length) setTimeout(() => switchScreen('skills'), 400);
        else setTimeout(() => switchScreen('hero'), 200);
      }
      renderAll();
    }

    function openHelp() {
      document.getElementById('modalContent').innerHTML = `
        <h2>❓ Помощь и философия</h2>
        <div class="tip-box">
          <strong>Главное правило:</strong> это не список задач. Это оболочка, которая превращает твои реальные действия в прогресс персонажа.
        </div>
        <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px">
          <button class="btn btn-secondary btn-block" onclick="closeModal();showOnboarding()">📖 Пройти введение заново</button>
          <button class="btn btn-secondary btn-block" onclick="showTreeExamples()">🌳 Примеры деревьев навыков</button>
          <button class="btn btn-secondary btn-block" onclick="showPhilosophy()">⚔️ Философия LIFE RPG</button>
        </div>
        <div class="tip-box">
          <strong>Совет по дереву:</strong> начинай с 1 направления → 2–3 корневых навыка → углубляй то, что реально качаешь. Не пытайся сразу построить идеальное дерево.
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary btn-block" onclick="closeModal()">Закрыть</button>
        </div>
      `;
      openModal();
    }

    function showTreeExamples() {
      document.getElementById('modalContent').innerHTML = `
        <h2>🌳 Примеры структур</h2>
        <p class="text-dim" style="margin-bottom:14px;font-size:0.88rem">Это не готовый контент — только идеи, как можно думать о дереве.</p>
        ${TREE_EXAMPLES.map(ex => `
          <div class="example-card">
            <h4>${ex.name}</h4>
            <pre>${ex.tree}</pre>
          </div>
        `).join('')}
        <div class="tip-box">
          <strong>Принцип:</strong> корень → столпы → конкретика. Глубина важнее ширины.
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary btn-block" onclick="closeModal()">Закрыть</button>
        </div>
      `;
      openModal();
    }

    function showPhilosophy() {
      document.getElementById('modalContent').innerHTML = `
        <h2>⚔️ Философия</h2>
        <p>Обычная задача → <strong>Квест</strong><br>
        Область жизни → <strong>Направление</strong><br>
        Компетенция → <strong>Навык</strong><br>
        Система развития → <strong>Дерево</strong><br>
        Большое испытание → <strong>BOSS</strong><br>
        Важное событие → <strong>Лор</strong><br>
        Реальный прогресс → <strong>XP и уровни</strong></p>
        <div class="highlight" style="margin:14px 0">
          Ты не заполняешь трекер привычек.<br>
          Ты развиваешь своего персонажа.
        </div>
        <p class="text-dim" style="font-size:0.88rem">Система не наказывает. Не требует серий. Не навязывает контент. Ты сам решаешь, во что играть.</p>
        <div class="modal-actions">
          <button class="btn btn-secondary btn-block" onclick="openHelp()">← Назад</button>
        </div>
      `;
    }

    function toggleKeySkill(nodeId) {
      const dir = state.directions.find(d => d.id === currentTreeDirId);
      if (!dir) return;
      const node = (dir.nodes || []).find(n => n.id === nodeId);
      if (!node) return;
      node.isKey = !node.isKey;
      save();
      renderTree(currentTreeDirId);
      toast(node.isKey ? '★ Ключевой навык' : 'Метка снята');
    }
