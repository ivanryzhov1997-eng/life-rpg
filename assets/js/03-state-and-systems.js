
    // ===================== CLOUD SAVE (Telegram + Supabase) =====================
    let cloudSaveTimer = null;
    let cloudReady = false;
    let cloudLastError = '';

    function getSupabaseUrl() {
      // Облачный сейв — ТОЛЬКО если пользователь сам включил в Настройках.
      // Не берём URL из AI-proxy и не подставляем чужие дефолты.
      try {
        return (localStorage.getItem(LS_SB_URL) || DEFAULT_SUPABASE_URL || '').trim().replace(/\/$/, '');
      } catch (e) {
        return (DEFAULT_SUPABASE_URL || '').trim().replace(/\/$/, '');
      }
    }

    function getSupabaseAnon() {
      // Не используем AI anon key для облака — иначе сейвы открыты тем же ключом, что и proxy.
      try {
        return (localStorage.getItem(LS_SB_ANON) || DEFAULT_SUPABASE_ANON_KEY || '').trim();
      } catch (e) {
        return '';
      }
    }

    function getTelegramUserId() {
      try {
        const tg = window.Telegram && window.Telegram.WebApp;
        if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user && tg.initDataUnsafe.user.id) {
          return String(tg.initDataUnsafe.user.id);
        }
      } catch (e) {}
      return null;
    }

    function isCloudEnabled() {
      try { return localStorage.getItem(LS_CLOUD_ON) === '1'; } catch (e) { return false; }
    }

    function setCloudEnabled(on) {
      try {
        if (on) localStorage.setItem(LS_CLOUD_ON, '1');
        else localStorage.removeItem(LS_CLOUD_ON);
      } catch (e) {}
    }

    function cloudConfigured() { return !!(isCloudEnabled() && supabaseClient && authUser); }

    async function authRefreshUser() {
      if (!supabaseClient) return null;
      const { data, error } = await supabaseClient.auth.getUser();
      if (error) throw error;
      authUser = data.user || null; updateAuthUI(); return authUser;
    }
    function updateAuthUI() {
      const status=document.getElementById('authStatus'), form=document.getElementById('authForm'), signed=document.getElementById('authSignedIn');
      if (!status) return;
      status.textContent = !supabaseClient ? 'Supabase Auth не загрузился. Обнови страницу.' : authUser ? 'Вход выполнен: '+(authUser.email||'аккаунт') : 'Не выполнен вход. Прогресс хранится локально.';
      if(form) form.style.display=authUser?'none':'block';
      if(signed) signed.style.display=authUser?'block':'none';
      updateCloudStatusLine();
    }
    async function authSignUp() {
      if(!supabaseClient){toast('Supabase Auth недоступен','error');return;}
      const email=(document.getElementById('authEmail')?.value||'').trim(), password=document.getElementById('authPassword')?.value||'';
      if(!email||password.length<6){toast('Укажи email и пароль от 6 символов','error');return;}
      try {
        const {data,error}=await supabaseClient.auth.signUp({email,password,options:{emailRedirectTo:location.origin+location.pathname}});
        if(error) throw error;
        if(data.session){authUser=data.user||data.session.user;setCloudEnabled(true);await afterAuthReady();toast('Аккаунт создан','success');}
        else {const el=document.getElementById('authStatus');if(el)el.textContent='Письмо отправлено на '+email+'. Подтверди email, затем войди.';toast('Проверь почту и подтверди регистрацию','success');}
      } catch(e){toast(e.message||'Ошибка регистрации','error');}
    }
    async function authSignIn() {
      if(!supabaseClient){toast('Supabase Auth недоступен','error');return;}
      const email=(document.getElementById('authEmail')?.value||'').trim(), password=document.getElementById('authPassword')?.value||'';
      if(!email||!password){toast('Укажи email и пароль','error');return;}
      try {const {data,error}=await supabaseClient.auth.signInWithPassword({email,password});if(error)throw error;authUser=data.user||data.session?.user||null;setCloudEnabled(true);await afterAuthReady();toast('Вход выполнен','success');}
      catch(e){toast(e.message||'Ошибка входа','error');}
    }
    async function authSignOut() {
      if(!supabaseClient)return;
      try {await cloudSave(true);const {error}=await supabaseClient.auth.signOut();if(error)throw error;authUser=null;cloudReady=false;setCloudEnabled(false);updateAuthUI();toast('Вы вышли. Локальный прогресс сохранён.','success');}
      catch(e){toast(e.message||'Не удалось выйти','error');}
    }
    let authSyncPromise = null;
    async function afterAuthReady() {
      if (authSyncPromise) return authSyncPromise;
      authSyncPromise = (async () => {
        updateAuthUI();
        // cloudLoad uploads local data only when the remote row is confirmed absent.
        // Never upload after a failed GET or an authentication/network error.
        await cloudLoad();
        updateCloudStatusLine();
      })();
      try { await authSyncPromise; } finally { authSyncPromise = null; }
    }
    function updateCloudStatusLine() {
      const el=document.getElementById('cloudStatus');if(!el)return;
      const chk=document.getElementById('cloudEnableChk'), fields=document.getElementById('cloudFields');
      if(chk)chk.checked=isCloudEnabled();if(fields)fields.style.display='none';
      if(!authUser){el.textContent='Статус: войди в аккаунт для облачной синхронизации.';return;}
      el.textContent='Статус: '+(authUser.email||authUser.id)+(cloudReady?' · синхронизировано':'')+(cloudLastError?' · '+cloudLastError:'');
    }
    function saveCloudSettings(){setCloudEnabled(true);if(authUser)syncCloudNow();else toast('Сначала войди в аккаунт','error');}
    function populateCloudSettings(){updateAuthUI();updateCloudStatusLine();}
    async function cloudFetch(path,options) {
      if(!supabaseClient||!authUser)throw new Error('Требуется вход в аккаунт');
      const {data,error}=await supabaseClient.auth.getSession();if(error||!data.session)throw new Error('Сессия истекла. Войди снова.');
      const opts=options||{},headers=Object.assign({'apikey':AUTH_SUPABASE_KEY,'Authorization':'Bearer '+data.session.access_token,'Content-Type':'application/json'},opts.headers||{});
      return fetch(AUTH_SUPABASE_URL+path,Object.assign({},opts,{headers}));
    }

    function backupLocalBeforeCloudReplace() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const key = CLOUD_PRE_REPLACE_BACKUP_PREFIX + new Date().toISOString().replace(/[:.]/g, '-');
        localStorage.setItem(key, raw);
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith(CLOUD_PRE_REPLACE_BACKUP_PREFIX)) keys.push(k);
        }
        keys.sort().reverse();
        keys.slice(5).forEach(k => localStorage.removeItem(k));
      } catch (e) {
        // A backup failure must not silently authorize overwriting local progress.
        throw new Error('Не удалось создать резервную копию локального сохранения');
      }
    }

    async function cloudLoad(forceCloudReplace = false) {
      const uid = authUser && authUser.id;
      if (!cloudConfigured() || !uid) {
        updateCloudStatusLine();
        return false;
      }
      try {
        const res = await cloudFetch(
          '/rest/v1/' + CLOUD_TABLE + '?user_id=eq.' + encodeURIComponent(uid) + '&select=data,updated_at',
          { method: 'GET' }
        );
        if (!res.ok) {
          const t = await res.text().catch(() => '');
          cloudLastError = 'load HTTP ' + res.status;
          if (res.status === 404 || /relation|does not exist/i.test(t)) {
            cloudLastError = 'нет таблицы life_rpg_saves';
          }
          updateCloudStatusLine();
          return false;
        }
        const rows = await res.json();
        if (!Array.isArray(rows)) {
          throw new Error('Некорректный ответ облачного хранилища');
        }
        if (rows.length > 1) {
          throw new Error('В облаке найдено несколько сохранений для одного аккаунта');
        }
        if (rows.length === 1) {
          const row = rows[0];
          const err = row && row.data ? validateImport(row.data) : 'облачная запись не содержит data';
          if (err) {
            cloudReady = false;
            cloudLastError = 'повреждённое облачное сохранение: ' + err;
            updateCloudStatusLine();
            return false;
          }
          // Compare timestamps before replacing local progress. Legacy local saves without
          // metadata are treated as conflicts, not as permission to overwrite them.
          let localRaw = null;
          let localExists = false;
          let localUpdatedAt = '';
          try {
            localRaw = localStorage.getItem(STORAGE_KEY);
            localExists = !!localRaw && !validateImport(JSON.parse(localRaw));
            localUpdatedAt = localStorage.getItem(LOCAL_UPDATED_AT_KEY) || '';
          } catch (e) {}
          const localMs = Date.parse(localUpdatedAt);
          const cloudMs = Date.parse(row.updated_at || '');
          const needsConflictChoice = localExists && (
            !Number.isFinite(localMs) || !Number.isFinite(cloudMs) || localMs > cloudMs + 1000
          );
          if (needsConflictChoice && !forceCloudReplace) {
            cloudReady = false;
            cloudLastError = 'конфликт сохранений: локальные данные не заменены';
            updateCloudStatusLine();
            return false;
          }
          if (localExists) backupLocalBeforeCloudReplace();
          replaceState(migrateState(row.data));
          // Mirror the accepted cloud version locally only after a backup was made.
          const toSave = createPersistedState(state, SCHEMA_VERSION);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
          if (row.updated_at) localStorage.setItem(LOCAL_UPDATED_AT_KEY, row.updated_at);
          else localStorage.removeItem(LOCAL_UPDATED_AT_KEY);
          cloudReady = true;
          cloudLastError = '';
          updateCloudStatusLine();
          return true;
        }
        // An empty result is the only proof that no remote row exists.
        cloudReady = true;
        cloudLastError = '';
        await cloudSave(true);
        updateCloudStatusLine();
        return false;
      } catch (e) {
        cloudLastError = (e && e.message) || 'load fail';
        updateCloudStatusLine();
        return false;
      }
    }

    async function cloudSave(force) {
      const uid = authUser && authUser.id;
      if (!cloudConfigured() || !uid) return;
      try {
        const payload = createPersistedState(state, SCHEMA_VERSION);
        const savedAt = new Date().toISOString();
        const body = [{
          user_id: uid,
          data: payload,
          updated_at: savedAt
        }];
        const res = await cloudFetch('/rest/v1/' + CLOUD_TABLE, {
          method: 'POST',
          headers: {
            'Prefer': 'resolution=merge-duplicates,return=minimal'
          },
          body: JSON.stringify(body)
        });
        if (!res.ok) {
          const t = await res.text().catch(() => '');
          cloudLastError = 'save HTTP ' + res.status;
          if (/relation|does not exist/i.test(t)) cloudLastError = 'нет таблицы life_rpg_saves';
          updateCloudStatusLine();
          if (force) toast('Облако: ' + cloudLastError, 'error');
          return;
        }
        try {
          const currentLocalMs = Date.parse(localStorage.getItem(LOCAL_UPDATED_AT_KEY) || '');
          const uploadedMs = Date.parse(savedAt);
          // Do not let a slow cloud request mark newer local edits as already synced.
          if (!Number.isFinite(currentLocalMs) || currentLocalMs <= uploadedMs) {
            localStorage.setItem(LOCAL_UPDATED_AT_KEY, savedAt);
          }
        } catch (e) {}
        cloudReady = true;
        cloudLastError = '';
        updateCloudStatusLine();
        if (force) toast('Сейв в облаке', 'success');
      } catch (e) {
        cloudLastError = (e && e.message) || 'save fail';
        updateCloudStatusLine();
        if (force) toast('Облако: ' + cloudLastError, 'error');
      }
    }

    function scheduleCloudSave() {
      if (!cloudConfigured() || !authUser) return;
      clearTimeout(cloudSaveTimer);
      cloudSaveTimer = setTimeout(() => { cloudSave(false); }, 1200);
    }

    async function syncCloudNow() {
      if (!cloudConfigured()) {
        toast('Сначала URL и key', 'error');
        return;
      }
      if (!authUser) { toast('Сначала войди в аккаунт', 'error'); return; }
      toast('Синхронизация…');
      const loaded = await cloudLoad();
      if (loaded) {
        toast('Загружено из облака', 'success');
        renderAll();
        return;
      }
      if (cloudLastError.startsWith('конфликт сохранений')) {
        const useCloud = confirm(
          'Найдены разные локальное и облачное сохранения. Перед заменой локальная версия будет сохранена в резервную копию.\n\n' +
          'ОК — загрузить облачную версию.\nОтмена — оставить локальный прогресс и записать его в облако.'
        );
        if (useCloud) {
          const forced = await cloudLoad(true);
          if (forced) { renderAll(); toast('Загружено из облака', 'success'); }
        } else {
          await cloudSave(true);
        }
        return;
      }
      await cloudSave(true);
    }

    function save() {
      try {
        const toSave = createPersistedState(state, SCHEMA_VERSION);
        const savedAt = new Date().toISOString();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
        localStorage.setItem(LOCAL_UPDATED_AT_KEY, savedAt);
        maybeDailyBackup(toSave);
        scheduleCloudSave();
      } catch (e) {
        console.warn('Save failed', e);
        toast('Ошибка сохранения', 'error');
      }
    }

    function maybeDailyBackup(data) {
      try {
        const key = 'life_rpg_v4_backup_' + todayStr().replace(/-/g, '');
        if (!localStorage.getItem(key)) {
          localStorage.setItem(key, JSON.stringify(data));
        }
        // keep last 7 backups
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith('life_rpg_v4_backup_')) keys.push(k);
        }
        keys.sort().reverse();
        keys.slice(7).forEach(k => localStorage.removeItem(k));
      } catch(e) {}
    }

    function migrateState(data) {
      const source = data && typeof data === 'object' ? data : {};
      const legacyApiKey = source.ai && source.ai.apiKey;
      const migrated = normalizeStateData(source, SCHEMA_VERSION, QUEST_XP);
      if (legacyApiKey) {
        if (!getApiKey()) setApiKey(legacyApiKey);
        delete migrated.ai.apiKey;
      }
      return migrated;
    }

    function load() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const data = JSON.parse(raw);
          const err = validateImport(data);
          if (!err) {
            replaceState(migrateState(data));
          } else {
            console.warn('Invalid save:', err);
          }
        }
      } catch (e) {
        console.warn('Load failed', e);
      }
    }

    // ===================== TOASTS & LEVEL UP =====================
    function toast(msg, type = '') {
      toastQueue.push({ msg, type });
      if (!toastShowing) processToastQueue();
    }

    function processToastQueue() {
      if (!toastQueue.length) { toastShowing = false; return; }
      toastShowing = true;
      const { msg, type } = toastQueue.shift();
      const el = document.createElement('div');
      el.className = 'toast' + (type ? ' ' + type : '');
      el.textContent = msg;
      document.getElementById('toasts').appendChild(el);
      setTimeout(() => {
        el.style.animation = 'toastOut 0.3s ease forwards';
        setTimeout(() => {
          el.remove();
          setTimeout(processToastQueue, 400);
        }, 280);
      }, 2400);
    }

    function haptic() {
      try { if (navigator.vibrate) navigator.vibrate(12); } catch(e) {}
    }

    function showLevelUp(from, to) {
      const ov = document.getElementById('levelupOverlay');
      const isMilestone = [10, 25, 50, 75, 100, 150, 200].includes(to);
      document.getElementById('levelupSub').textContent = isMilestone
        ? `⭐ ГЛАВА ${to} ⭐\nLVL ${from} → LVL ${to}`
        : `LVL ${from} → LVL ${to}`;
      ov.classList.add('show');
      setTimeout(() => ov.classList.remove('show'), isMilestone ? 3200 : 2200);
      addAutoLore(isMilestone
        ? `⭐ ГЛАВА ЗАВЕРШЕНА! Достигнут легендарный LVL ${to}`
        : `⚔️ LEVEL UP! Достигнут LVL ${to}`, 'level');
      checkTitlesAndAchievements();
    }

    function addAutoLore(text, kind) {
      if (!text || !text.trim()) return;
      kind = kind || 'event';
      // Throttle SIDE noise: max 1 generic side-summary per day unless MAIN/BOSS/level/ritual
      if (kind === 'side') {
        const day = todayStr();
        const already = (state.lore || []).some(l => l.auto && l.kind === 'side' && l.dayKey === day);
        if (already) return;
        // collapse to short daily line
        text = '✓ День: закрыты SIDE-квесты';
      }
      const today = new Date().toLocaleDateString('ru-RU');
      state.lore.push({
        id: uid(),
        date: today,
        dayKey: todayStr(),
        text: text.trim(),
        createdAt: Date.now(),
        auto: true,
        kind
      });
      if (state.lore.length > 400) state.lore = state.lore.slice(-400);
    }

    // Undo last AI batch (quests or skills)
    let undoTimer = null;
    function pushUndo(snapshot, label) {
      window._undo = { snapshot, label, at: Date.now() };
      if (undoTimer) clearTimeout(undoTimer);
      undoTimer = setTimeout(() => { window._undo = null; }, 12000);
      toast(label + ' · Отменить?', 'success');
      // show quick undo via second toast path - use confirm-less: dedicated toast button hard in pure DOM
      showUndoBar(label);
    }
    function showUndoBar(label) {
      let bar = document.getElementById('undoBar');
      if (!bar) {
        bar = document.createElement('div');
        bar.id = 'undoBar';
        bar.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:calc(70px + env(safe-area-inset-bottom,0px));z-index:2500;background:#1c1c1f;border:1px solid #3f3f46;border-radius:12px;padding:10px 14px;display:flex;gap:10px;align-items:center;max-width:92vw;box-shadow:0 8px 30px rgba(0,0,0,.4)';
        document.body.appendChild(bar);
      }
      bar.innerHTML = '<span style="font-size:0.85rem;color:#a1a1aa">' + escapeHtml(label) + '</span>' +
        '<button type="button" id="undoBtn" style="border:none;background:#fafafa;color:#0c0c0e;font-weight:700;border-radius:8px;padding:8px 12px;font-size:0.85rem;cursor:pointer">Отменить</button>';
      bar.style.display = 'flex';
      document.getElementById('undoBtn').onclick = () => {
        if (!window._undo) return;
        replaceState(window._undo.snapshot);
        window._undo = null;
        save();
        renderAll();
        if (currentTreeDirId) renderTree(currentTreeDirId);
        bar.style.display = 'none';
        toast('Отменено', 'success');
      };
      setTimeout(() => { if (bar) bar.style.display = 'none'; }, 12000);
    }
    function snapshotState() {
      return JSON.parse(JSON.stringify(state));
    }

    function openAssistant() {
      ensureAi();
      const aiOk = hasAiAccess();
      document.getElementById('modalContent').innerHTML = `
        <h2>Помощник</h2>
        <p class="text-dim" style="margin-bottom:14px;font-size:0.9rem">ИИ под твой уровень направлений и время.</p>
        ${!aiOk ? `<div class="tip-box warn" style="margin-bottom:12px"><strong>ИИ недоступен.</strong> Сеть или proxy. Ключи в клиенте не нужны.</div>
          <button class="btn btn-secondary btn-block" onclick="closeModal()">Закрыть</button>` : `
          <div style="display:flex;flex-direction:column;gap:8px">
            <button class="btn btn-primary btn-block" onclick="closeModal();askWhatToday()">Что делать сегодня?</button>
            <button class="btn btn-secondary btn-block" onclick="closeModal();generateDailyQuests()">Квесты на день</button>
            <button class="btn btn-secondary btn-block" onclick="closeModal();openAiQuestPicker()">Квесты для направления</button>
            <button class="btn btn-secondary btn-block" onclick="closeModal();openAiTreePicker()">Собрать дерево</button>
            <button class="btn btn-secondary btn-block" onclick="closeModal();aiWeeklyInsight()">Анализ недели</button>
          </div>
          <button class="btn btn-secondary btn-block" style="margin-top:12px" onclick="closeModal()">Закрыть</button>`}
      `;
      openModal();
    }

    async function askWhatToday() {
      ensureAi();
      if (!hasAiAccess()) { toast('ИИ недоступен', 'error'); return; }
      const dirs = state.directions.map(d => `${d.name} (${stageLabel(d.stage||'beginner')}, LVL ${levelFromXp(d.xp||0)})`).join('; ') || 'нет';
      const active = state.quests.filter(q => !q.done).slice(0, 8).map(q => q.title).join('; ') || 'нет';
      const goals = (state.goals||[]).filter(g => g.status==='active').slice(0,5).map(g => g.title).join('; ') || 'нет';
      const pref = state.ai?.preferredDifficulty || {};
      document.getElementById('modalContent').innerHTML = `<h2>Думаю…</h2><p class="text-dim">Подбираю фокус на сегодня</p>`;
      openModal();
      try {
        const text = await callGroq(
          `Ты коуч LIFE RPG. Ответь кратко на русском, 5–8 предложений. Без воды. Учти уровень в темах. Предложи 1 главный фокус и 2–3 конкретных действия на сегодня (15–60 мин).`,
          `Направления: ${dirs}
Активные квесты: ${active}
Цели: ${goals}
Предпочтительная сложность SIDE≈${pref.SIDE||2}
Серия дней: ${(state.streak&&state.streak.current)||0}`
        );
        document.getElementById('modalContent').innerHTML = `
          <h2>Сегодня</h2>
          <div class="tip-box" style="white-space:pre-wrap;line-height:1.5">${escapeHtml(text)}</div>
          <div class="modal-actions" style="flex-direction:column;gap:8px">
            <button class="btn btn-primary btn-block" onclick="closeModal();generateDailyQuests()">Сгенерировать квесты</button>
            <button class="btn btn-secondary btn-block" onclick="closeModal()">Закрыть</button>
          </div>`;
      } catch (e) {
        document.getElementById('modalContent').innerHTML = `<h2>Не вышло</h2><p class="text-dim">${escapeHtml(e.message||'')}</p>
          <button class="btn btn-secondary btn-block" onclick="closeModal()">Закрыть</button>`;
      }
    }

    async function aiWeeklyInsight() {
      ensureAi();
      if (!hasAiAccess()) { toast('ИИ недоступен', 'error'); return; }
      const done = state.quests.filter(q => q.done).length;
      const dirs = state.directions.map(d => {
        const dead = (d.nodes||[]).filter(n => n.lastActiveAt && Date.now()-n.lastActiveAt > 30*864e5).map(n=>n.name);
        return `${d.name}: XP ${d.xp||0}, мёртвые навыки: ${dead.join(', ')||'нет'}`;
      }).join('\n') || 'нет направлений';
      document.getElementById('modalContent').innerHTML = `<h2>Анализ…</h2>`;
      openModal();
      try {
        const text = await callGroq(
          `Ты аналитик прогресса LIFE RPG. На русском, коротко: что хорошо, что проседает, 1 совет на неделю. Без морали.`,
          `Квестов закрыто всего: ${done}
Серия: ${(state.streak&&state.streak.current)||0}
${dirs}`
        );
        document.getElementById('modalContent').innerHTML = `
          <h2>Обзор</h2>
          <div class="tip-box" style="white-space:pre-wrap;line-height:1.5">${escapeHtml(text)}</div>
          <button class="btn btn-secondary btn-block" onclick="closeModal()">Закрыть</button>`;
      } catch (e) {
        document.getElementById('modalContent').innerHTML = `<h2>Не вышло</h2><p class="text-dim">${escapeHtml(e.message||'')}</p>
          <button class="btn btn-secondary btn-block" onclick="closeModal()">Закрыть</button>`;
      }
    }

    function openAiTreePicker() {
      if (!state.directions.length) {
        toast('Сначала создай направление', 'error');
        switchScreen('skills');
        return;
      }
      if (state.directions.length === 1) {
        generateSkillTree(state.directions[0].id);
        return;
      }
      document.getElementById('modalContent').innerHTML = `
        <h2>Дерево навыков</h2>
        <p class="text-dim" style="margin-bottom:12px;font-size:0.88rem">Для какого направления собрать дерево?</p>
        <div style="display:flex;flex-direction:column;gap:8px">
          ${state.directions.map(d => `
            <button class="btn btn-secondary btn-block" onclick="closeModal();generateSkillTree('${d.id}')">${escapeHtml(d.name)} · ${stageLabel(d.stage || 'beginner')}</button>
          `).join('')}
        </div>
        <button class="btn btn-secondary btn-block" style="margin-top:12px" onclick="closeModal()">Отмена</button>
      `;
      openModal();
    }

    function resolveQuestTarget(q, fallbackDirId) {
      // Prefer skill by name if AI provided skillName / targetSkill
      const skillName = (q.skillName || q.targetSkill || '').trim().toLowerCase();
      if (skillName) {
        for (const d of state.directions) {
          const node = (d.nodes || []).find(n => (n.name || '').toLowerCase() === skillName);
          if (node) return { targetType: 'SKILL', targetId: node.id, dirId: d.id };
        }
      }
      let dirId = q.dirId || fallbackDirId;
      if (dirId && state.directions.some(d => d.id === dirId)) {
        return { targetType: 'DIRECTION', targetId: dirId, dirId };
      }
      return { targetType: 'GENERAL', targetId: null, dirId: null };
    }

    function stageHint(dir) {
      const stage = dir.stage || 'beginner';
      const done = state.quests.filter(q => q.done && q.targetType === 'DIRECTION' && q.targetId === dir.id).length +
        state.quests.filter(q => q.done && q.targetType === 'SKILL' && (dir.nodes || []).some(n => n.id === q.targetId)).length;
      const lvl = levelFromXp(dir.xp || 0);
      if (stage === 'beginner' && (done >= 8 || lvl >= 5)) return 'Похоже, пора сменить уровень на «Средний»';
      if (stage === 'intermediate' && (done >= 20 || lvl >= 12)) return 'Можно попробовать «Продвинутый»';
      if (stage === 'advanced' && lvl >= 20) return 'При желании — уровень «Профи»';
      return '';
    }



    // ===================== V5 MICRO TIPS =====================
    const MICRO_TIPS = [
      { id: 'first_quest', text: 'Закрой первый квест кнопкой ✓ — так качается серия и XP.' },
      { id: 'stage', text: 'Уровень направления (новичок/средний) ограничивает ИИ — не завышай.' },
      { id: 'daily', text: '«На день» в Квестах — самый быстрый способ набрать SIDE под твоё время.' },
      { id: 'goals', text: 'Цели + вклад квеста = видно, как тает долг по учёбе или навыку.' },
      { id: 'tree', text: 'Дерево навыков: «Собрать ИИ», потом правь руками — так быстрее.' }
    ];
    function maybeShowMicroTip() {
      try {
        if (!localStorage.getItem('life_rpg_v5_onboarded')) return;
        const key = 'life_rpg_v5_tips';
        const seen = JSON.parse(localStorage.getItem(key) || '[]');
        const next = MICRO_TIPS.find(t => !seen.includes(t.id));
        if (!next) return;
        if ((state.quests||[]).filter(q=>q.done).length === 0 && next.id !== 'first_quest') return;
        setTimeout(() => {
          toast(next.text, 'success');
          seen.push(next.id);
          localStorage.setItem(key, JSON.stringify(seen));
        }, 1200);
      } catch (e) {}
    }

    // ===================== PSYCHOLOGICAL SYSTEMS =====================
    function isoWeekKey(d = new Date()) {
      const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
      const dayNum = date.getUTCDay() || 7;
      date.setUTCDate(date.getUTCDate() + 4 - dayNum);
      const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
      const week = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
      return date.getUTCFullYear() + '-W' + String(week).padStart(2, '0');
    }

    function updateStreak() {
      const today = todayStr();
      const s = state.streak;
      if (!s) return;
      if (s.lastDate === today) return;
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yStr = yesterday.toISOString().slice(0, 10);
      // rest day counts as continuity bridge
      const restBridge = s.restDate === yStr || s.restDate === today;
      if (s.lastDate === yStr || restBridge) {
        s.current = (s.current || 0) + 1;
      } else {
        s.current = 1;
      }
      s.lastDate = today;
      if (s.current > (s.longest || 0)) s.longest = s.current;
    }

    function canTakeRestDay() {
      if (!state.ui) state.ui = {};
      return state.ui.lastRestWeek !== isoWeekKey();
    }

    function takeRestDay() {
      if (!canTakeRestDay()) {
        toast('Отдых уже взят на этой неделе', 'error');
        return;
      }
      if (!confirm('Взять день отдыха? Серия не сгорит, но квесты сегодня не обязательны.')) return;
      if (!state.streak) state.streak = { current: 0, longest: 0, lastDate: null };
      const today = todayStr();
      state.streak.restDate = today;
      // keep streak continuity without requiring a quest
      if (state.streak.lastDate !== today) {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yStr = yesterday.toISOString().slice(0, 10);
        if (state.streak.lastDate === yStr || state.streak.lastDate === today) {
          /* keep current */
        } else if (!state.streak.lastDate) {
          state.streak.current = Math.max(1, state.streak.current || 0);
        }
        // mark today as "covered" for streak purposes without incrementing twice
        if (state.streak.lastDate !== today) {
          state.streak.lastDate = today;
        }
      }
      if (!state.ui) state.ui = {};
      state.ui.lastRestWeek = isoWeekKey();
      addAutoLore('🛋 День отдыха. Серия сохранена.');
      save();
      renderHero();
      toast('День отдыха активирован', 'success');
    }

    function getDeadSkills() {
      const now = Date.now();
      const day = 86400000;
      const dead = [];
      state.directions.forEach(d => {
        (d.nodes || []).forEach(n => {
          const last = n.lastActiveAt || 0;
          if (!last || (now - last) > 30 * day) {
            dead.push({ dirId: d.id, dirName: d.name, node: n, days: last ? Math.floor((now - last) / day) : null });
          }
        });
      });
      return dead;
    }

    function showWeeklyReview() {
      const weekAgo = Date.now() - 7 * 86400000;
      const done = state.quests.filter(q => q.done && (q.completedAt || 0) >= weekAgo);
      // Track actual awarded XP (including luck bonus), not only the quest's base reward.
      const xp = done.reduce((s, q) => s + (Number.isFinite(Number(q.earnedXp)) ? Number(q.earnedXp) : (q.xp || 0)), 0);
      const questsWithEvidence = done.filter(q => typeof q.result === 'string' && q.result.trim()).length;
      const goalContributions = {};
      done.forEach(q => {
        const units = Math.max(0, Number(q.goalResultUnits) || 0);
        if (q.goalId && units > 0) {
          if (!goalContributions[q.goalId]) goalContributions[q.goalId] = 0;
          goalContributions[q.goalId] += units;
        }
      });
      const goalContributionList = Object.entries(goalContributions).map(([id, units]) => {
        const g = getGoal(id);
        return g ? { title: g.title, units, unitLabel: (g.metric && g.metric.unitLabel) || 'ед.', current: g.metric && g.metric.current, target: g.metric && g.metric.target } : null;
      }).filter(Boolean).sort((a, b) => b.units - a.units);
      // top skills by recent activity
      const skillGain = {};
      done.forEach(q => {
        if (q.targetType === 'SKILL' && q.targetId) {
          const awarded = Number.isFinite(Number(q.earnedXp)) ? Number(q.earnedXp) : (q.xp || 0);
          skillGain[q.targetId] = (skillGain[q.targetId] || 0) + awarded;
        }
      });
      const skillList = [];
      state.directions.forEach(d => {
        (d.nodes || []).forEach(n => {
          if (skillGain[n.id]) skillList.push({ name: n.name, dir: d.name, xp: skillGain[n.id] });
        });
      });
      skillList.sort((a, b) => b.xp - a.xp);
      const top = skillList.slice(0, 3);
      const dead = getDeadSkills().slice(0, 5);
      const goalOverview = activeGoals().map(g => {
        const pct = goalProgressPct(g);
        const nextMilestone = [25, 50, 75, 100].find(m => m > pct) || 100;
        const linkedActive = state.quests.filter(q => !q.done && q.goalId === g.id).length;
        return { goal: g, pct, nextMilestone, linkedActive };
      }).sort((a, b) => a.pct - b.pct).slice(0, 4);

      document.getElementById('modalContent').innerHTML = `
        <h2>Недельный обзор</h2>
        <div class="stats-grid" style="margin:12px 0">
          <div class="stat-box"><div class="val">${done.length}</div><div class="lbl">Квестов</div></div>
          <div class="stat-box"><div class="val">${formatNum(xp)}</div><div class="lbl">XP за неделю</div></div>
          <div class="stat-box"><div class="val">${state.streak?.current || 0}</div><div class="lbl">Серия</div></div>
          <div class="stat-box"><div class="val">${state.streak?.longest || 0}</div><div class="lbl">Рекорд</div></div>
        </div>
        <div class="tip-box"><strong>Реальный прогресс за неделю</strong><br>
          ${goalContributionList.length ? goalContributionList.map(g => `• ${escapeHtml(g.title)}: +${formatNum(g.units)} ${escapeHtml(g.unitLabel)} · сейчас ${formatNum(g.current || 0)}/${formatNum(g.target || 0)}`).join('<br>') : 'Пока нет зафиксированного вклада в измеримые цели'}
          <br><span class="text-dim">Результат записан у ${questsWithEvidence} из ${done.length} завершённых квестов.</span>
        </div>
        <div class="tip-box"><strong>Топ навыков недели</strong><br>
          ${top.length ? top.map(s => `• ${escapeHtml(s.name)} (${escapeHtml(s.dir)}) +${formatNum(s.xp)} XP`).join('<br>') : 'Пока нет привязанных к навыкам квестов'}
        </div>
        ${goalOverview.length ? `<div class="tip-box"><strong>Пульс активных целей</strong><br>${goalOverview.map(x => `<div style="margin-top:9px"><div style="display:flex;justify-content:space-between;gap:8px"><span>${escapeHtml(x.goal.title)}</span><strong>${x.pct}%</strong></div><div class="progress-wrap" style="margin:5px 0"><div class="progress-bar gold" style="width:${x.pct}%"></div></div><span class="text-dim">Следующий рубеж: ${x.nextMilestone}% · активных квестов: ${x.linkedActive}</span></div>`).join('')}</div>` : ''}
        ${dead.length ? `<div class="tip-box"><strong>Мягкий сигнал</strong><br>Давно не качались:<br>${dead.map(d => `• ${escapeHtml(d.node.name)} <span class="text-dim">(${escapeHtml(d.dirName)}${d.days != null ? ', ' + d.days + 'д' : ''})</span>`).join('<br>')}<br><span class="text-dim">Можно отпустить или вернуть в фокус.</span></div>` : ''}
        <div class="modal-actions">
          <button class="btn btn-secondary btn-block" onclick="closeModal()">Закрыть</button>
        </div>
      `;
      openModal();
    }

    function maybeSundayReview() {
      try {
        if (new Date().getDay() !== 0) return; // Sunday
        if (!state.ui) state.ui = {};
        const key = isoWeekKey();
        if (state.ui.lastWeeklyReview === key) return;
        setTimeout(() => {
          if (state.ui.lastWeeklyReview === key) return;
          state.ui.lastWeeklyReview = key;
          save();
          showWeeklyReview();
        }, 1800);
      } catch(e) {}
    }

    function getTitle(id) {
      return TITLES.find(t => t.id === id) || TITLES[0];
    }

    function checkTitlesAndAchievements() {
      const lvl = levelFromXp(state.hero.xp);
      const completed = state.quests.filter(q => q.done).length;
      const bosses = state.quests.filter(q => q.done && q.type === 'BOSS').length;
      const dirs = state.directions.length;
      let maxDepth = 0;
      state.directions.forEach(d => {
        const depth = calcMaxDepth(d.nodes || []);
        if (depth > maxDepth) maxDepth = depth;
      });

      // Unlock level-based titles
      TITLES.forEach(t => {
        if (t.minLevel && lvl >= t.minLevel && !state.unlockedTitles.includes(t.id)) {
          state.unlockedTitles.push(t.id);
          toast(`🎖 Новый титул: ${t.name}`, 'levelup');
          addAutoLore(`🎖 Получен титул «${t.name}» — ${t.desc}`);
        }
      });

      // Condition titles
      const condMap = {
        boss1: bosses >= 1,
        boss5: bosses >= 5,
        quests100: completed >= 100,
        streak7: state.streak.current >= 7 || state.streak.longest >= 7,
        streak30: state.streak.longest >= 30,
        depth5: maxDepth >= 5,
        dirs5: dirs >= 5
      };
      TITLES.forEach(t => {
        if (t.condition && condMap[t.condition] && !state.unlockedTitles.includes(t.id)) {
          state.unlockedTitles.push(t.id);
          toast(`🎖 Новый титул: ${t.name}`, 'levelup');
          addAutoLore(`🎖 Получен титул «${t.name}» — ${t.desc}`);
        }
      });

      // Achievements
      const checks = {
        first_quest: completed >= 1,
        first_boss: bosses >= 1,
        first_dir: dirs >= 1,
        first_skill: state.directions.some(d => (d.nodes || []).length > 0),
        level_10: lvl >= 10,
        level_25: lvl >= 25,
        level_50: lvl >= 50,
        level_100: lvl >= 100,
        quests_10: completed >= 10,
        quests_50: completed >= 50,
        quests_100: completed >= 100,
        boss_3: bosses >= 3,
        boss_10: bosses >= 10,
        streak_3: state.streak.longest >= 3,
        streak_7: state.streak.longest >= 7,
        streak_30: state.streak.longest >= 30,
        deep_5: maxDepth >= 5,
        dirs_3: dirs >= 3,
        lore_10: state.lore.length >= 10,
        reflector: state.reflections.length >= 1
      };

      ACHIEVEMENTS.forEach(a => {
        if (checks[a.id] && !state.unlockedAchievements.includes(a.id)) {
          state.unlockedAchievements.push(a.id);
          toast(`${a.icon} Достижение: ${a.name}`, 'levelup');
          addAutoLore(`${a.icon} Достижение разблокировано: «${a.name}» — ${a.desc}`);
        }
      });
    }

    function calcMaxDepth(nodes, parentId = null, depth = 1) {
      const children = nodes.filter(n => (n.parentId || null) === parentId);
      if (children.length === 0) return depth - 1;
      return Math.max(...children.map(c => calcMaxDepth(nodes, c.id, depth + 1)));
    }

    function tryLuckBonus(baseXp) {
      // 18% chance of bonus
      if (Math.random() < 0.18) {
        const mult = 1.15 + Math.random() * 0.2; // 15-35%
        const bonus = Math.floor(baseXp * (mult - 1));
        if (bonus > 0) {
          if (!state.unlockedAchievements.includes('luck')) {
            state.unlockedAchievements.push('luck');
            toast('🍀 Достижение: Везунчик', 'levelup');
          }
          return { total: baseXp + bonus, bonus, mult };
        }
      }
      return { total: baseXp, bonus: 0, mult: 1 };
    }

    function openReflectionModal(quest) {
      pendingReflectionQuest = quest;
      document.getElementById('modalContent').innerHTML = `
        <h2>🪞 Отражение</h2>
        <p class="text-dim" style="margin-bottom:16px;font-size:0.9rem">
          Квест «${escapeHtml(quest.title)}» выполнен.${quest.type === 'BOSS' ? ' Это был BOSS.' : ''}
          <br>Что это изменило в тебе? (необязательно)
        </p>
        <div class="form-group">
          <label>Твои мысли</label>
          <textarea id="reflectText" placeholder="Самое трудное / что понял / как себя чувствую..." style="min-height:120px"></textarea>
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" onclick="skipReflection()">Пропустить</button>
          <button class="btn btn-primary" onclick="saveReflection()">Сохранить</button>
        </div>
      `;
      openModal();
    }

    function skipReflection() {
      pendingReflectionQuest = null;
      closeModal();
    }

    function saveReflection() {
      const text = document.getElementById('reflectText')?.value?.trim();
      if (text && pendingReflectionQuest) {
        state.reflections.push({
          id: uid(),
          questId: pendingReflectionQuest.id,
          questTitle: pendingReflectionQuest.title,
          text,
          date: new Date().toLocaleDateString('ru-RU'),
          createdAt: Date.now()
        });
        addAutoLore(`🪞 Отражение после «${pendingReflectionQuest.title}»:\n${text}`);
        toast('Отражение сохранено', 'success');
        checkTitlesAndAchievements();
      }
      pendingReflectionQuest = null;
      closeModal();
      save();
    }

    function openTitlePicker() {
      const unlocked = state.unlockedTitles;
      document.getElementById('modalContent').innerHTML = `
        <h2>🎖 Титулы</h2>
        <p class="text-dim" style="margin-bottom:14px;font-size:0.85rem">Выбери титул, который отражает тебя сейчас</p>
        <div style="display:flex;flex-direction:column;gap:8px;max-height:50vh;overflow-y:auto">
          ${TITLES.filter(t => unlocked.includes(t.id)).map(t => `
            <button class="btn ${state.hero.titleId === t.id ? 'btn-primary' : 'btn-secondary'} btn-block" 
              style="justify-content:flex-start;text-align:left;padding:12px 14px"
              onclick="equipTitle('${t.id}')">
              <div>
                <div style="font-weight:800">${escapeHtml(t.name)}</div>
                <div style="font-size:0.78rem;opacity:0.7;font-weight:400">${escapeHtml(t.desc)}</div>
              </div>
            </button>
          `).join('')}
        </div>
        <div class="modal-actions mt-16">
          <button class="btn btn-secondary btn-block" onclick="closeModal()">Закрыть</button>
        </div>
      `;
      openModal();
    }

    function equipTitle(id) {
      state.hero.titleId = id;
      save();
      closeModal();
      renderHero();
      toast('Титул изменён');
    }

    function openAchievements() {
      document.getElementById('modalContent').innerHTML = `
        <h2>🏆 Достижения</h2>
        <p class="text-dim" style="margin-bottom:14px;font-size:0.85rem">
          ${state.unlockedAchievements.length} / ${ACHIEVEMENTS.length} разблокировано
        </p>
        <div style="display:flex;flex-direction:column;gap:8px;max-height:55vh;overflow-y:auto">
          ${ACHIEVEMENTS.map(a => {
            const unlocked = state.unlockedAchievements.includes(a.id);
            const show = unlocked || !a.hidden;
            if (!show) return `
              <div class="card" style="opacity:0.4;padding:12px">
                <div style="font-weight:700">❓ Скрытое достижение</div>
                <div class="text-dim" style="font-size:0.8rem">Продолжай играть...</div>
              </div>`;
            return `
              <div class="card" style="padding:12px;${unlocked ? 'border-color:rgba(255,215,0,0.35)' : 'opacity:0.55'}">
                <div style="display:flex;gap:10px;align-items:center">
                  <span style="font-size:1.5rem">${unlocked ? a.icon : '🔒'}</span>
                  <div>
                    <div style="font-weight:800">${escapeHtml(a.name)}</div>
                    <div class="text-dim" style="font-size:0.8rem">${escapeHtml(a.desc)}</div>
                  </div>
                </div>
              </div>`;
          }).join('')}
        </div>
        <div class="modal-actions mt-16">
          <button class="btn btn-secondary btn-block" onclick="closeModal()">Закрыть</button>
        </div>
      `;
      openModal();
    }
