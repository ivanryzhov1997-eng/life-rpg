
    // ===================== SAVE / EXPORT / IMPORT =====================
    function exportSave() {
      const data = createPersistedState(state, SCHEMA_VERSION);
      data.backupMeta = { app: 'LIFE RPG', format: 'json-backup', exportedAt: new Date().toISOString(), includesActivityLog: true };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      a.href = url;
      a.download = `life-rpg-backup-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast('Резервная копия экспортирована (без API-ключа)');
    }

    function exportMarkdown() {
      const lines = [];
      lines.push('# LIFE RPG — экспорт');
      lines.push('');
      lines.push('Герой: **' + (state.hero.name || '') + '** · LVL ' + levelFromXp(state.hero.xp || 0));
      lines.push('Серия: ' + (state.streak?.current || 0) + ' (рекорд ' + (state.streak?.longest || 0) + ')');
      lines.push('');
      lines.push('## Лор');
      lines.push('');
      (state.lore || []).slice().reverse().forEach(l => {
        lines.push('### ' + (l.date || ''));
        lines.push((l.text || '').trim());
        lines.push('');
      });
      lines.push('## Рефлексии');
      lines.push('');
      (state.reflections || []).slice().reverse().forEach(r => {
        if (r.type === 'evening') {
          lines.push('- Вечерний: ' + [r.did, r.felt, r.next].filter(Boolean).join(' / '));
        } else {
          lines.push('- ' + (r.text || JSON.stringify(r)));
        }
      });
      lines.push('');
      lines.push('## Квесты (выполненные)');
      lines.push('');
      state.quests.filter(q => q.done).forEach(q => {
        lines.push('- [x] **' + q.title + '** (' + q.type + ' ' + (DIFF_LABELS[q.difficulty]||'') + ', +' + q.xp + ' XP)');
      });
      const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'life-rpg-export.md';
      a.click();
      URL.revokeObjectURL(url);
      toast('Markdown экспортирован');
    }

    function mergeImportedState(incoming) {
      const src = migrateState(incoming);
      // merge directions by name
      src.directions.forEach(d => {
        const existing = state.directions.find(x => x.name === d.name);
        if (!existing) {
          state.directions.push(d);
        } else {
          (d.nodes || []).forEach(n => {
            if (!(existing.nodes || []).some(en => en.name === n.name && en.parentId === n.parentId)) {
              if (!existing.nodes) existing.nodes = [];
              existing.nodes.push(n);
            }
          });
        }
      });
      // merge quests by title+done uniqueness soft
      src.quests.forEach(q => {
        const exists = state.quests.some(x => x.title === q.title && x.done === q.done && x.type === q.type);
        if (!exists) state.quests.push(q);
      });
      src.lore.forEach(l => {
        const exists = state.lore.some(x => x.text === l.text && x.date === l.date);
        if (!exists) state.lore.push(l);
      });
      (src.reflections || []).forEach(r => state.reflections.push(r));
      // keep higher XP hero
      if ((src.hero.xp || 0) > (state.hero.xp || 0)) {
        state.hero.xp = src.hero.xp;
        if (src.hero.name) state.hero.name = src.hero.name;
      }
    }

    function importSave(e, merge) {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target.result);
          const err = validateImport(data);
          if (err) throw new Error(err);
          if (merge) {
            mergeImportedState(data);
            toast('Данные добавлены к текущим', 'success');
          } else {
            replaceState(migrateState(data));
            toast('Сохранение загружено', 'success');
          }
          save();
          renderAll();
        } catch (err) {
          toast('Импорт: ' + (err.message || 'некорректный JSON'), 'error');
        }
      };
      reader.readAsText(file);
      e.target.value = '';
    }

    function resetAll() {
      if (!confirm('Сбросить ВЕСЬ прогресс? Это нельзя отменить.')) return;
      if (!confirm('Точно? Все квесты, навыки и лор будут удалены.')) return;
      const keepModel = state.ai?.model;
      const keepDiff = state.ai?.preferredDifficulty;
      replaceState(migrateState({
        hero: { name: 'Безымянный герой', xp: 0, titleId: 'newbie' },
        directions: [],
        quests: [],
        goals: [],
        lore: [],
        stats: { completed: 0, totalXp: 0 },
        streak: { current: 0, longest: 0, lastDate: null },
        unlockedTitles: ['newbie'],
        unlockedAchievements: [],
        reflections: [],
        ai: { model: keepModel || 'openai/gpt-oss-20b', preferredDifficulty: keepDiff }
      }));
      save();
      closeTreeView();
      renderAll();
      toast('Прогресс сброшен');
    }

    // ===================== MODAL & NAV =====================
    function openModal() {
      document.getElementById('modalOverlay').classList.add('open');
    }

    function closeModal() {
      document.getElementById('modalOverlay').classList.remove('open');
      editingId = null;
      editingType = null;
      skillParentId = null;
    }

    document.getElementById('modalOverlay').addEventListener('click', (e) => {
      if (e.target === document.getElementById('modalOverlay')) closeModal();
    });

    function switchScreen(name) {
      document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
      document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
      document.getElementById('screen-' + name).classList.add('active');
      document.querySelector(`.nav-btn[data-screen="${name}"]`).classList.add('active');

      if (name === 'hero') renderHero();
      if (name === 'quests') renderQuests();
      if (name === 'skills') renderDirections();
      if (name === 'lore') renderLore();
      if (name === 'save') { updateAiStatusLine(); populateCloudSettings(); renderVisualThemeGrid(); }
      if (name === 'goals') renderGoals();
    }

    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.addEventListener('click', () => switchScreen(btn.dataset.screen));
    });

    document.getElementById('questFilters').addEventListener('click', (e) => {
      const btn = e.target.closest('.filter-btn');
      if (!btn) return;
      questFilter = btn.dataset.filter || 'active';
      renderQuests();
    });

    function renderAll() {
      renderHero();
      renderQuests();
      renderDirections();
      renderGoals();
      renderLore();
    }

    // ===================== EVENING RITUAL =====================
    function maybeEveningRitual() {
      try {
        if (!state.ui) state.ui = { lastEveningRitual: null };
        const hour = new Date().getHours();
        if (hour < 20) return;
        const today = todayStr();
        if (state.ui.lastEveningRitual === today) return;
        // delay so it doesn't clash with onboarding
        setTimeout(() => {
          if (state.ui.lastEveningRitual === today) return;
          showEveningRitual();
        }, 1200);
      } catch(e) {}
    }

    function showEveningRitual() {
      document.getElementById('modalContent').innerHTML = `
        <h2>Вечерний ритуал</h2>
        <p class="text-dim" style="margin-bottom:14px;font-size:0.9rem">Коротко зафиксируй день. Можно пропустить.</p>
        <div class="form-group">
          <label>Что сделал?</label>
          <textarea id="erDid" placeholder="Главное действие дня" rows="2"></textarea>
        </div>
        <div class="form-group">
          <label>Что почувствовал?</label>
          <textarea id="erFelt" placeholder="Ощущение, настроение" rows="2"></textarea>
        </div>
        <div class="form-group">
          <label>Что завтра?</label>
          <textarea id="erNext" placeholder="Один шаг на завтра" rows="2"></textarea>
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" onclick="skipEveningRitual()">Пропустить</button>
          <button class="btn btn-primary" onclick="saveEveningRitual()">Сохранить</button>
        </div>
      `;
      openModal();
    }

    function skipEveningRitual() {
      if (!state.ui) state.ui = {};
      state.ui.lastEveningRitual = todayStr();
      save();
      closeModal();
    }

    function saveEveningRitual() {
      const did = (document.getElementById('erDid')?.value || '').trim();
      const felt = (document.getElementById('erFelt')?.value || '').trim();
      const next = (document.getElementById('erNext')?.value || '').trim();
      if (!state.ui) state.ui = {};
      state.ui.lastEveningRitual = todayStr();
      if (did || felt || next) {
        let text = '🌙 Вечерний ритуал\n';
        if (did) text += 'Сделал: ' + did + '\n';
        if (felt) text += 'Почувствовал: ' + felt + '\n';
        if (next) text += 'Завтра: ' + next;
        addAutoLore(text.trim());
        state.reflections.push({ id: uid(), type: 'evening', did, felt, next, at: Date.now() });
      }
      save();
      closeModal();
      renderLore();
      toast('Ритуал сохранён', 'success');
    }

    // ===================== AI MENTOR — HYBRID FLOW =====================
    window._mentorDraft = null;
    function isMeaningfulMentorAnswer(value){
      const letters=String(value||'').toLocaleLowerCase('ru-RU').replace(/[^a-zа-яё]/gi,'');
      if(letters.length<3||new Set(letters).size<2||!/[аеёиоуыэюяaeiouy]/i.test(letters))return false;
      if(/(.)\\1{2,}/i.test(letters))return false;
      if(letters.length>=6&&/(.{2})\\1{2,}/i.test(letters))return false;
      return true;
    }
    function validateMentorForm(showErrors=false){
      const goal=document.getElementById('mGoal'),current=document.getElementById('mCurrent'),button=document.getElementById('mCreateRoute');
      if(!goal||!current||!button)return false;
      const goalOk=isMeaningfulMentorAnswer(goal.value),currentOk=isMeaningfulMentorAnswer(current.value);
      const goalError=document.getElementById('mGoalError'),currentError=document.getElementById('mCurrentError');
      if(goalError){goalError.textContent=goalOk?'':'Укажи понятное направление, например «английский» или «гитара»';goalError.style.visibility=showErrors&&!goalOk?'visible':'hidden';}
      if(currentError){currentError.textContent=currentOk?'':'Опиши реальный уровень: что уже знаешь или умеешь';currentError.style.visibility=showErrors&&!currentOk?'visible':'hidden';}
      button.disabled=!(goalOk&&currentOk);
      return goalOk&&currentOk;
    }
    function openAiMentor(){document.getElementById('modalContent').innerHTML=`<h2>🧠 ИИ-наставник</h2><p class="text-dim" style="font-size:.85rem;line-height:1.5;margin-bottom:14px">Два ответа — и ИИ соберёт стартовый маршрут. Детали можно добавить, но это необязательно.</p><div class="mentor-step"><div class="form-group"><label>1. Какое направление хочешь развивать?</label><input id="mGoal" maxlength="80" placeholder="Например: гитара, бег 3 км, монтаж видео" autocomplete="off" oninput="validateMentorForm()"><div id="mGoalError" class="mentor-validation-error" aria-live="polite">Укажи понятное направление</div></div><div class="form-group"><label>2. Какой у тебя сейчас уровень?</label><textarea id="mCurrent" rows="2" placeholder="Например: новичок; знаю основные аккорды, но медленно меняю их" oninput="validateMentorForm()"></textarea><div id="mCurrentError" class="mentor-validation-error" aria-live="polite">Опиши, что уже знаешь или умеешь</div></div><details style="margin:10px 0 14px;padding:12px;border:1px solid var(--border);border-radius:12px;background:var(--surface2,var(--card))"><summary style="cursor:pointer;font-weight:600">＋ Уточнить детали <span style="font-weight:400;color:var(--text-muted)">(необязательно)</span></summary><div style="padding-top:14px"><div class="form-group"><label>Желаемый результат</label><textarea id="mOutcome" rows="2" placeholder="Что хочешь уметь через несколько недель или месяцев?"></textarea></div><div class="form-group"><label>Где сейчас затык?</label><textarea id="mWeak" rows="2" placeholder="Что не получается? Можно оставить пустым."></textarea></div><div class="form-row"><div class="form-group"><label>Минут за подход</label><input id="mMinutes" type="number" min="5" max="180" value="30"></div><div class="form-group"><label>Раз в неделю</label><input id="mDays" type="number" min="1" max="14" value="3"></div></div><div class="form-group"><label>Ограничения</label><textarea id="mLimits" rows="2" placeholder="Например: нет спортзала, только турник дома"></textarea></div></div></details><div class="mentor-note"><strong>Важно:</strong> ИИ предложит реалистичный старт сам. Ничего не изменится, пока ты не подтвердишь маршрут.</div><div class="modal-actions"><button class="btn btn-secondary" onclick="closeModal()">Отмена</button><button id="mCreateRoute" class="btn btn-primary" disabled onclick="runAiMentorDiagnosis()">Создать маршрут →</button></div></div>`;openModal();validateMentorForm();}
    async function runAiMentorDiagnosis(){const goal=(document.getElementById('mGoal')?.value||'').trim(),outcome=(document.getElementById('mOutcome')?.value||'').trim(),current=(document.getElementById('mCurrent')?.value||'').trim(),weak=(document.getElementById('mWeak')?.value||'').trim(),minutes=Math.max(5,Math.min(180,parseInt(document.getElementById('mMinutes')?.value,10)||30)),days=Math.max(1,Math.min(14,parseInt(document.getElementById('mDays')?.value,10)||3)),limits=(document.getElementById('mLimits')?.value||'').trim();if(!validateMentorForm(true))return;if(!hasAiAccess()){toast('ИИ временно недоступен','error');return}document.getElementById('modalContent').innerHTML='<h2>🧠 Диагностика</h2><div style="text-align:center;padding:30px;color:var(--text-muted)">◌ ИИ определяет стартовую точку и собирает маршрут…</div>';openModal();const system=`Ты персональный наставник life-RPG.
КРИТИЧЕСКОЕ ПРАВИЛО ЯЗЫКА: ВСЁ, ЧТО УВИДИТ ПОЛЬЗОВАТЕЛЬ, ДОЛЖНО БЫТЬ НА РУССКОМ ЯЗЫКЕ. Значения всех текстовых полей JSON (diagnosis, directionDescription, name, description, title, completionCriteria, skillPath и любые другие текстовые значения) пиши ТОЛЬКО на русском языке. Не отвечай на английском и не вставляй английские фразы. Исключения: только названия брендов, технологий или общепринятые термины, для которых естественно используется оригинальное написание. Технические JSON-ключи и значения enum stage/type могут оставаться техническими и нужны только приложению.
Ты персональный наставник life-RPG. СНАЧАЛА проверь осмысленность цели. Если цель бессмысленна, непонятна, состоит из случайных символов, повторяющихся букв/звуков, бессвязного набора букв или по ней нельзя определить конкретную область развития (например: «ааааа», «Ааааа», «хз», «qwerty»), НЕ ПЫТАЙСЯ УГАДАТЬ СМЫСЛ и НЕ ПОДБИРАЙ УНИВЕРСАЛЬНУЮ ТЕМУ вроде общения, дисциплины или саморазвития. В таком случае ответь ТОЛЬКО JSON-объектом {"error":"Цель не распознана. Уточните запрос"} и НЕ создавай diagnosis, tree или quests. Не считай цель корректной только потому, что в ней есть гласные. Если цель понятна, не отклоняй её из-за краткости. Не давай банальные основы автоматически. Оцени фактический уровень только по описанию и предложи ближайший маршрут. Ответь ТОЛЬКО JSON-массивом из одного объекта: [{"diagnosis":"...","stage":"beginner|intermediate|advanced|expert","directionDescription":"...","tree":[{"name":"...","description":"...","children":[{"name":"...","description":"...","children":[]}]}],"quests":[{"title":"...","description":"...","completionCriteria":"...","minutes":20,"difficulty":1,"type":"SIDE","skillPath":"..."}]}]. Правила: не откатывай к уверенно освоенным основам; при нехватке данных скажи это и предложи проверочный квест; tree 3–5 корней, у каждого 2–4 поднавыка, максимум 3 уровня; дай 3–5 квестов только ближайшего этапа; каждый квест обязан иметь измеримый результат в completionCriteria; нельзя использовать критерии «посмотреть», «почитать», «позаниматься N минут», «попробовать»; не награждай бытовые действия, развлечения или открытие приложения; skillPath должен совпадать с tree; учитывай ${minutes} минут за подход и ${days} раз/неделю.`;const user=`Направление: ${goal}\nЖелаемый результат: ${outcome||'не указан'}\nУже умеет: ${current||'не указано'}\nЗатыки: ${weak||'не указаны'}\nВремя: ${minutes} минут, ${days} раз/неделю\nОграничения: ${limits||'нет'}`;try{const parsed=parseJsonFromAi(await callGroq(system,user));const data=Array.isArray(parsed)?parsed[0]:parsed;if(data&&data.error){document.getElementById('modalContent').innerHTML=`<h2>Цель не распознана</h2><p class="text-dim">${escapeHtml(data.error)}</p><div class="modal-actions"><button class="btn btn-primary" onclick="openAiMentor()">Уточнить цель</button><button class="btn btn-secondary" onclick="closeModal()">Закрыть</button></div>`;openModal();return}if(!data||!Array.isArray(data.tree)||!Array.isArray(data.quests))throw new Error('ИИ вернул неполную диагностику');showAiMentorDraft({...data,goal,outcome,current,weak,minutes,days,limits});}catch(e){document.getElementById('modalContent').innerHTML=`<h2>Диагностика не удалась</h2><p class="text-dim">${escapeHtml(e.message||'Ошибка ИИ')}</p><div class="modal-actions"><button class="btn btn-primary" onclick="openAiMentor()">Повторить</button><button class="btn btn-secondary" onclick="closeModal()">Закрыть</button></div>`;openModal();}}
    function mentorFlatten(nodes,parentPath,depth,out){(nodes||[]).forEach(n=>{const name=String(n.name||'').trim().slice(0,70);if(!name)return;const path=parentPath?parentPath+' → '+name:name;out.push({key:path,name,description:String(n.description||'').trim().slice(0,220),depth,parentPath:parentPath||null});if(Array.isArray(n.children))mentorFlatten(n.children,path,depth+1,out)});return out;}
    function showAiMentorDraft(d){const flat=mentorFlatten(d.tree,'',0,[]),quests=(d.quests||[]).slice(0,5).map(q=>({title:String(q.title||'').trim().slice(0,120),description:String(q.description||'').trim().slice(0,700),completionCriteria:String(q.completionCriteria||'').trim().slice(0,500),minutes:Math.max(5,Math.min(180,parseInt(q.minutes,10)||d.minutes||30)),difficulty:Math.max(1,Math.min(5,parseInt(q.difficulty,10)||2)),type:['SIDE','MAIN','BOSS'].includes(q.type)?q.type:'SIDE',skillPath:String(q.skillPath||'').trim()})).filter(q=>q.title&&q.completionCriteria);if(!flat.length||!quests.length)throw new Error('Нужно дерево и хотя бы один квест с измеримым критерием');window._mentorDraft={...d,flat,quests};document.getElementById('modalContent').innerHTML=`<h2>🧠 Предложение наставника</h2><div class="form-group"><label>Направление</label><input id="mentorName" value="${escapeHtml(d.goal)}" maxlength="60"></div><div class="form-group"><label>Диагноз</label><div class="mentor-diagnosis">${escapeHtml(d.diagnosis||'Без диагноза')}<br><span style="color:var(--gold)">Старт: ${escapeHtml(stageLabel(d.stage||'beginner'))}</span></div></div><div class="form-group"><label>Описание</label><textarea id="mentorDesc">${escapeHtml(d.directionDescription||'')}</textarea></div><div class="mentor-section-title">Дерево</div><div style="max-height:34vh;overflow:auto">${flat.map((n,i)=>`<label class="mentor-item" style="display:flex;gap:9px;cursor:pointer"><input type="checkbox" class="mentor-tree-check" data-i="${i}" checked style="width:18px;height:18px;margin-top:2px"><span style="padding-left:${n.depth*12}px"><span class="mi-title">${n.depth?'↳ ':''}${escapeHtml(n.name)}</span>${n.description?`<span class="mi-sub">${escapeHtml(n.description)}</span>`:''}</span></label>`).join('')}</div><div class="mentor-section-title" style="margin-top:12px">Ближайшие квесты</div><div style="max-height:32vh;overflow:auto">${quests.map((q,i)=>`<label class="mentor-quest" style="display:block;cursor:pointer"><div style="display:flex;gap:9px"><input type="checkbox" class="mentor-quest-check" data-i="${i}" checked style="width:18px;height:18px;margin-top:2px"><div><div class="mq-title">${escapeHtml(q.title)}</div><div class="mi-sub">${escapeHtml(q.description)}</div><div class="mq-criterion"><strong>Критерий:</strong> ${escapeHtml(q.completionCriteria)}</div><div class="mi-sub">~${q.minutes} мин · ${q.type==='MAIN'?'Основной':q.type==='BOSS'?'Босс':'Побочный'} · ${escapeHtml(q.skillPath||'без привязки')}</div></div></div></label>`).join('')}</div><div class="mentor-note">Ничего не записывается, пока ты не нажмёшь «Принять маршрут».</div><div class="modal-actions" style="flex-direction:column;gap:8px"><button class="btn btn-primary btn-block" onclick="acceptAiMentor()">Принять маршрут</button><button class="btn btn-secondary btn-block" onclick="openAiMentor()">Изменить диагностику</button><button class="btn btn-secondary btn-block" onclick="closeModal()">Отмена</button></div>`;openModal();}
    function acceptAiMentor(){const d=window._mentorDraft;if(!d)return;const name=(document.getElementById('mentorName')?.value||'').trim().slice(0,60),desc=(document.getElementById('mentorDesc')?.value||'').trim().slice(0,700);if(!name){toast('Укажи название','error');return}const selectedTree=[];document.querySelectorAll('.mentor-tree-check:checked').forEach(e=>{const n=d.flat[parseInt(e.dataset.i,10)];if(n)selectedTree.push(n)});const selectedQuests=[];document.querySelectorAll('.mentor-quest-check:checked').forEach(e=>{const q=d.quests[parseInt(e.dataset.i,10)];if(q)selectedQuests.push(q)});if(!selectedTree.length||!selectedQuests.length){toast('Выбери хотя бы один навык и квест','error');return}const snap=snapshotState();let dir=state.directions.find(x=>x.name.trim().toLowerCase()===name.toLowerCase());if(!dir){dir={id:uid(),name,description:desc,stage:d.stage||'beginner',xp:0,nodes:[]};state.directions.push(dir);addAutoLore(`🧠 ИИ-наставник: создано направление «${name}» (${stageLabel(dir.stage)})`)}else{if(desc)dir.description=desc;dir.stage=d.stage||dir.stage||'beginner'}if(!Array.isArray(dir.nodes))dir.nodes=[];const pathToId={};dir.nodes.forEach(n=>pathToId[n.name]=n.id);const newIds={};[...selectedTree].sort((a,b)=>a.depth-b.depth).forEach(n=>{const parentId=n.parentPath?(newIds[n.parentPath]||pathToId[n.parentPath.split(' → ').pop()]||null):null;let node=dir.nodes.find(x=>x.name.trim().toLowerCase()===n.name.trim().toLowerCase()&&(x.parentId||null)===parentId);if(!node){node={id:uid(),name:n.name,description:n.description||'',parentId,xp:0};dir.nodes.push(node)}newIds[n.key]=node.id});const findSkillId=path=>{const p=String(path||'').toLowerCase();const exact=selectedTree.find(n=>n.key.toLowerCase()===p);if(exact&&newIds[exact.key])return newIds[exact.key];const last=p.split(' → ').pop().trim();const hit=dir.nodes.find(n=>n.name.toLowerCase()===last);if(hit)return hit.id;const partial=dir.nodes.find(n=>p.includes(n.name.toLowerCase()));return partial?partial.id:(dir.nodes[0]?.id||null)};selectedQuests.forEach(q=>{const skillId=findSkillId(q.skillPath),type=q.type||'SIDE',difficulty=q.difficulty||2;state.quests.push({id:uid(),title:q.title,type,difficulty,xp:QUEST_XP[type]?.[difficulty]||QUEST_XP.SIDE[difficulty]||25,description:q.description||'',completionCriteria:q.completionCriteria,minutes:q.minutes,targetType:skillId?'SKILL':'DIRECTION',targetId:skillId||dir.id,tags:['MENTOR'],done:false,createdAt:Date.now(),fromAi:true,fromMentor:true})});save();closeModal();pushUndo(snap,`ИИ-наставник: ${name}`);renderDirections();renderQuests();renderHero();toast(`Маршрут «${name}» принят`,'success');}
