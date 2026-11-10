
    // ===================== DIRECTIONS =====================
    function renderDirections() {
      const list = document.getElementById('directionsList');
      if (state.directions.length === 0) {
        list.innerHTML = `
          <div class="empty-state">
            <div class="big-icon">🌳</div>
            <h3>Первое направление</h3>
            <p>Одна область жизни. Укажи уровень: новичок — и ИИ не предложит концерт.</p>
            <button class="btn btn-primary" onclick="openDirectionModal()">+ Создать направление</button>
          </div>`;
        return;
      }

      const deadAll = getDeadSkills();
      const deadBanner = deadAll.length ? `
        <div class="tip-box">
          <strong>Мягкий сигнал</strong><br>
          ${deadAll.slice(0,3).map(d => escapeHtml(d.node.name) + ' (' + escapeHtml(d.dirName) + ')').join(' · ')}
          ${deadAll.length > 3 ? ' и ещё ' + (deadAll.length-3) : ''}
          <br><span class="text-dim">Давно без прогресса — можно отпустить или вернуть в фокус.</span>
        </div>` : '';

      list.innerHTML = deadBanner + state.directions.map(d => {
        const prog = xpProgress(d.xp || 0);
        const skillCount = (d.nodes || []).length;
        return `
          <div class="card dir-card">
            <div class="dir-top">
              <div class="dir-name">${escapeHtml(d.name)}</div>
              <div class="dir-lvl">LVL ${prog.level}</div>
            </div>
            ${d.description ? `<div class="text-dim" style="font-size:0.85rem;margin-bottom:8px">${escapeHtml(d.description)}</div>` : ''}
            <div class="progress-wrap">
              <div class="progress-bar" style="width:${prog.percent}%"></div>
            </div>
            <div class="dir-meta">
              <span>${formatNum(d.xp || 0)} XP направления</span>
              <span>В теме: ${stageLabel(d.stage || 'beginner')}</span>
              <span>${skillCount} навыков</span>
            </div>
            ${stageHint(d) ? `<p class="text-dim" style="font-size:0.78rem;margin-top:8px;color:var(--gold)">${stageHint(d)} · <button type="button" class="btn btn-secondary btn-sm" style="min-height:28px;padding:2px 8px;font-size:0.72rem" onclick="openDirectionModal('${d.id}')">Сменить</button></p>` : ''}
            <div class="quest-actions mt-12" style="flex-wrap:wrap">
              <button class="btn btn-primary btn-sm" onclick="openTreeView('${d.id}')">Открыть дерево</button>
              <button class="btn btn-secondary btn-sm" onclick="generateQuestsForDirection('${d.id}')">Квесты ИИ</button>
              <button class="btn btn-secondary btn-sm" onclick="generateSkillTree('${d.id}')">Собрать ИИ</button>
              <button class="btn btn-secondary btn-sm" onclick="openDirectionModal('${d.id}')">Уровень</button>
              <button class="btn btn-danger btn-sm" onclick="deleteDirection('${d.id}')">✕</button>
            </div>
          </div>
        `;
      }).join('');
    }

    function openDirectionModal(id) {
      editingId = id || null;
      editingType = 'direction';
      const d = id ? state.directions.find(x => x.id === id) : null;

      const st = (d && d.stage) ? d.stage : 'beginner';
      document.getElementById('modalContent').innerHTML = `
        <h2>${d ? 'Редактировать направление' : 'Новое направление'}</h2>
        <div class="form-group">
          <label>Название</label>
          <input type="text" id="dName" value="${d ? escapeHtml(d.name) : ''}" placeholder="Например: Гитара, Английский, Бег" maxlength="60">
        </div>
        <div class="form-group">
          <label>Твой уровень в направлении</label>
          <select id="dStage">
            ${DIR_STAGES.map(s => `<option value="${s.id}" ${st===s.id?'selected':''}>${s.label} — ${s.hint}</option>`).join('')}
          </select>
          <p class="text-dim" style="font-size:0.78rem;margin-top:6px">ИИ подстроит квесты под этот уровень (новичку не предложит концерт).</p>
        </div>
        <div class="form-group">
          <label>Описание</label>
          <textarea id="dDesc" placeholder="Зачем это направление?">${d ? escapeHtml(d.description || '') : ''}</textarea>
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" onclick="closeModal()">Отмена</button>
          <button class="btn btn-primary" onclick="saveDirection()">${d ? 'Сохранить' : 'Создать'}</button>
        </div>
      `;
      openModal();
    }

    function saveDirection() {
      const name = document.getElementById('dName').value.trim();
      if (!name) { toast('Введи название', 'error'); return; }
      const description = document.getElementById('dDesc').value.trim();
      const stage = document.getElementById('dStage')?.value || 'beginner';

      if (editingId) {
        const d = state.directions.find(x => x.id === editingId);
        if (d) {
          d.name = name;
          d.description = description;
          d.stage = stage;
          toast('Направление обновлено');
        }
      } else {
        state.directions.push({
          id: uid(),
          name,
          description,
          stage,
          xp: 0,
          nodes: []
        });
        addAutoLore(`🌳 Новое направление: «${name}» (${stageLabel(stage)})`);
        toast('Направление создано');
        checkTitlesAndAchievements();
      }
      if (!save()) return;
      closeModal();
      renderDirections();
      renderHero();
    }

    function deleteDirection(id) {
      if (!confirm('Удалить направление и всё его дерево навыков?\nПривязанные квесты станут «Общий XP».')) return;

      // Unlink quests
      state.quests.forEach(q => {
        if (q.targetType === 'DIRECTION' && q.targetId === id) {
          q.targetType = 'GENERAL';
          q.targetId = null;
        }
        if (q.targetType === 'SKILL') {
          const dir = state.directions.find(d => d.id === id);
          if (dir && (dir.nodes || []).some(n => n.id === q.targetId)) {
            q.targetType = 'GENERAL';
            q.targetId = null;
          }
        }
      });

      state.goals.forEach(goal => {
        if (goal.directionId === id) goal.directionId = null;
      });
      state.directions = state.directions.filter(d => d.id !== id);
      if (!save()) return;
      if (currentTreeDirId === id) closeTreeView();
      renderDirections();
      renderHero();
      renderQuests();
      toast('Направление удалено');
    }

    // ===================== SKILL TREE =====================
    function openTreeView(dirId) {
      currentTreeDirId = dirId;
      treeScale = 1;
      treePanX = 0;
      treePanY = 0;
      const dir = state.directions.find(d => d.id === dirId);
      if (!dir) return;
      document.getElementById('treeTitle').textContent = dir.name;
      const n = (dir.nodes || []).length;
      const prog = xpProgress(dir.xp || 0);
      document.getElementById('treeSub').textContent =
        'LVL ' + prog.level + ' · ' + n + ' навыков · ' + stageLabel(dir.stage || 'beginner');
      document.getElementById('treeView').classList.add('open');
      setTreeMode(treeMode || 'list');
      bindTreePan();
    }

    function closeTreeView() {
      currentTreeDirId = null;
      closeNodeSheet();
      document.getElementById('treeView').classList.remove('open');
      renderDirections();
    }

    function setTreeMode(mode) {
      treeMode = mode === 'map' ? 'map' : 'list';
      const listBtn = document.getElementById('treeModeList');
      const mapBtn = document.getElementById('treeModeMap');
      const listWrap = document.getElementById('treeListWrap');
      const mapWrap = document.getElementById('treeCanvasWrap');
      if (listBtn) listBtn.classList.toggle('active', treeMode === 'list');
      if (mapBtn) mapBtn.classList.toggle('active', treeMode === 'map');
      if (listWrap) listWrap.style.display = treeMode === 'list' ? 'block' : 'none';
      if (mapWrap) mapWrap.style.display = treeMode === 'map' ? 'block' : 'none';
      if (currentTreeDirId) renderTree(currentTreeDirId);
    }

    function applyTreeTransform() {
      const canvas = document.getElementById('treeCanvas');
      if (!canvas) return;
      canvas.style.transform = 'translate(' + treePanX + 'px,' + treePanY + 'px) scale(' + treeScale + ')';
    }

    function treeZoom(delta) {
      const prev = treeScale;
      treeScale = Math.max(0.35, Math.min(2.2, treeScale + delta));
      // zoom toward center of viewport
      const wrap = document.getElementById('treeCanvasWrap');
      if (wrap) {
        const cx = wrap.clientWidth / 2;
        const cy = wrap.clientHeight / 2;
        treePanX = cx - (cx - treePanX) * (treeScale / prev);
        treePanY = cy - (cy - treePanY) * (treeScale / prev);
      }
      applyTreeTransform();
    }

    function treeResetView() {
      treeScale = 1;
      treePanX = 16;
      treePanY = 16;
      applyTreeTransform();
    }

    function bindTreePan() {
      if (treePanBound) return;
      const wrap = document.getElementById('treeCanvasWrap');
      if (!wrap) return;
      treePanBound = true;

      let dragging = false;
      let lastX = 0, lastY = 0;
      let pinchStartDist = 0;
      let pinchStartScale = 1;

      function dist(t) {
        const dx = t[0].clientX - t[1].clientX;
        const dy = t[0].clientY - t[1].clientY;
        return Math.hypot(dx, dy);
      }

      wrap.addEventListener('touchstart', (e) => {
        if (treeMode !== 'map') return;
        if (e.touches.length === 1) {
          dragging = true;
          lastX = e.touches[0].clientX;
          lastY = e.touches[0].clientY;
        } else if (e.touches.length === 2) {
          dragging = false;
          pinchStartDist = dist(e.touches);
          pinchStartScale = treeScale;
        }
      }, { passive: true });

      wrap.addEventListener('touchmove', (e) => {
        if (treeMode !== 'map') return;
        if (e.touches.length === 2 && pinchStartDist > 0) {
          e.preventDefault();
          const d = dist(e.touches);
          const next = Math.max(0.35, Math.min(2.2, pinchStartScale * (d / pinchStartDist)));
          const prev = treeScale;
          treeScale = next;
          const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2 - wrap.getBoundingClientRect().left;
          const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2 - wrap.getBoundingClientRect().top;
          treePanX = cx - (cx - treePanX) * (treeScale / prev);
          treePanY = cy - (cy - treePanY) * (treeScale / prev);
          applyTreeTransform();
        } else if (dragging && e.touches.length === 1) {
          e.preventDefault();
          const x = e.touches[0].clientX;
          const y = e.touches[0].clientY;
          treePanX += x - lastX;
          treePanY += y - lastY;
          lastX = x;
          lastY = y;
          applyTreeTransform();
        }
      }, { passive: false });

      wrap.addEventListener('touchend', () => {
        dragging = false;
        pinchStartDist = 0;
      });

      // mouse drag for desktop
      let mouseDown = false;
      wrap.addEventListener('mousedown', (e) => {
        if (treeMode !== 'map' || e.target.closest('.skill-node') || e.target.closest('.tree-zoom-fab')) return;
        mouseDown = true;
        lastX = e.clientX;
        lastY = e.clientY;
      });
      window.addEventListener('mousemove', (e) => {
        if (!mouseDown || treeMode !== 'map') return;
        treePanX += e.clientX - lastX;
        treePanY += e.clientY - lastY;
        lastX = e.clientX;
        lastY = e.clientY;
        applyTreeTransform();
      });
      window.addEventListener('mouseup', () => { mouseDown = false; });
    }

    function buildTreeIndex(nodes) {
      const byParent = {};
      (nodes || []).forEach(n => {
        const p = n.parentId || 'root';
        if (!byParent[p]) byParent[p] = [];
        byParent[p].push(n);
      });
      return byParent;
    }

    function getSkillPracticeStats(nodeId) {
      const completed = (state.quests || []).filter(q => q.done && q.targetType === 'SKILL' && q.targetId === nodeId);
      const xp = completed.reduce((sum, q) => sum + Math.max(0, Number(q.earnedXp) || Number(q.xp) || 0), 0);
      const dates = completed.map(q => Number(q.completedAt) || 0).filter(Boolean);
      return {
        completedCount: completed.length,
        recordedXp: xp,
        lastPracticedAt: dates.length ? Math.max(...dates) : null
      };
    }

    function formatPracticeDate(timestamp) {
      if (!timestamp) return 'пока не было';
      const date = new Date(timestamp);
      if (Number.isNaN(date.getTime())) return 'дата неизвестна';
      return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
    }

    // Mastery is derived from existing XP and completed linked quests; no new save fields required.
    function getSkillMastery(xp, completedCount) {
      const points = Math.max(0, Number(xp) || 0);
      const practiceCount = Math.max(0, Number(completedCount) || 0);
      const tiers = [
        { name: 'Новичок', xp: 0, quests: 0 },
        { name: 'Ученик', xp: 50, quests: 3 },
        { name: 'Практик', xp: 150, quests: 8 },
        { name: 'Уверенный уровень', xp: 350, quests: 20 },
        { name: 'Продвинутый', xp: 700, quests: 40 },
        { name: 'Мастер', xp: 1200, quests: 75 }
      ];
      let index = 0;
      for (let i = 1; i < tiers.length; i++) {
        if (points >= tiers[i].xp && practiceCount >= tiers[i].quests) index = i;
        else break;
      }
      const current = tiers[index];
      const next = tiers[index + 1] || null;
      const xpProgress = next ? Math.min(1, points / next.xp) : 1;
      const questProgress = next ? Math.min(1, practiceCount / next.quests) : 1;
      const xpRemaining = next ? Math.max(0, next.xp - points) : 0;
      const questsRemaining = next ? Math.max(0, next.quests - practiceCount) : 0;
      let nextAction = 'Продолжай практику: выбери небольшой квест и доведи его до измеримого результата.';
      if (!next) nextAction = 'Ты достиг максимального ранга по текущей системе. Поддерживай навык практикой или усложняй квесты.';
      else if (xpRemaining === 0 && questsRemaining > 0) nextAction = `XP уже достаточно. Осталось выполнить ${questsRemaining} ${questsRemaining === 1 ? 'квест' : questsRemaining < 5 ? 'квеста' : 'квестов'} по этому навыку.`;
      else if (questsRemaining === 0 && xpRemaining > 0) nextAction = `Практики достаточно. Нужно набрать ещё ${formatNum(xpRemaining)} XP по этому навыку.`;
      else if (xpRemaining > 0 && questsRemaining > 0) nextAction = `Для следующего ранга нужны оба условия: ещё ${formatNum(xpRemaining)} XP и ${questsRemaining} квестов. Начни с короткого квеста, который даёт реальный результат.`;
      return {
        name: current.name,
        nextName: next ? next.name : null,
        percent: next ? Math.round(((xpProgress + questProgress) / 2) * 100) : 100,
        requirement: next ? `${formatNum(points)} / ${formatNum(next.xp)} XP · ${practiceCount} / ${next.quests} квестов` : 'Максимальный ранг достигнут',
        xpRemaining,
        questsRemaining,
        nextAction,
        isMax: !next
      };
    }

    function openNodeSheet(nodeId) {
      const dir = state.directions.find(d => d.id === currentTreeDirId);
      if (!dir) return;
      const node = (dir.nodes || []).find(n => n.id === nodeId);
      if (!node) return;
      const prog = xpProgress(node.xp || 0);
      const kids = (dir.nodes || []).filter(n => n.parentId === nodeId).length;
      const practice = getSkillPracticeStats(nodeId);
      const mastery = getSkillMastery(node.xp || 0, practice.completedCount);
      const skillQuests = (state.quests || []).filter(q => !q.done && q.targetType === 'SKILL' && q.targetId === nodeId && !isHabitQuest(q)).slice(0, 3);
      const sheet = document.getElementById('nodeSheet');
      const overlay = document.getElementById('nodeSheetOverlay');
      sheet.innerHTML = `
        <h3>${escapeHtml(node.name)}${node.isKey ? ' ★' : ''}</h3>
        <div class="ns-meta">LVL ${prog.level} · ${formatNum(node.xp || 0)} XP · ${kids} ветк${kids === 1 ? 'а' : kids > 1 && kids < 5 ? 'и' : 'ок'}
          ${node.description ? '<br>' + escapeHtml(node.description) : ''}
        </div>
        <div class="progress-wrap" style="margin-bottom:14px"><div class="progress-bar gold" style="width:${prog.percent}%"></div></div>
        <div class="ns-meta" style="margin-bottom:8px">🏅 Мастерство: <strong>${escapeHtml(mastery.name)}</strong>${mastery.nextName ? '<br>Следующий ранг: <strong>' + escapeHtml(mastery.nextName) + '</strong>' : ''}<br>${escapeHtml(mastery.requirement)}</div>
        <div class="progress-wrap" style="margin-bottom:14px"><div class="progress-bar gold" style="width:${mastery.percent}%"></div></div>
        <div class="ns-meta" style="margin:-4px 0 14px;padding:10px 12px;border:1px solid var(--border);border-radius:12px;background:var(--surface2, var(--card))">🧭 <strong>Следующий шаг</strong><br>${escapeHtml(mastery.nextAction)}</div>
        <div class="ns-meta" style="margin-bottom:14px">📈 Практика по привязанным квестам: <strong>${practice.completedCount}</strong><br>XP из этих квестов: <strong>${formatNum(practice.recordedXp)}</strong><br>Последняя практика: <strong>${formatPracticeDate(practice.lastPracticedAt)}</strong></div>
        <div class="ns-meta" style="margin-bottom:14px"><strong>🎯 Квесты для практики (${skillQuests.length})</strong>${skillQuests.length ? '<br>' + skillQuests.map(q => `<button class="btn btn-secondary btn-sm" style="margin:6px 5px 0 0;max-width:100%;white-space:normal;text-align:left" onclick="closeNodeSheet();openQuestModal('${String(q.id).replace(/'/g, '&#39;')}')">${escapeHtml(q.title)}${q.minutes ? ' · ~' + formatNum(q.minutes) + ' мин' : ''}</button>`).join('') : '<br>Нет активных квестов, привязанных к этому навыку. Создай квест и укажи этот навык как цель.'}</div>
        <div class="ns-grid">
          <button class="btn btn-primary span2" onclick="closeNodeSheet();openSkillModal('${node.id}', true)">+ Поднавык</button>
          <button class="btn btn-secondary" onclick="closeNodeSheet();generateSkillTree('${dir.id}', '${node.id}')">ИИ-ветки</button>
          <button class="btn btn-secondary" onclick="toggleKeySkill('${node.id}');openNodeSheet('${node.id}')">${node.isKey ? '★ Ключевой' : '☆ В ключевые'}</button>
          <button class="btn btn-secondary" onclick="closeNodeSheet();openSkillModal('${node.id}')">Изменить</button>
          <button class="btn btn-danger" onclick="closeNodeSheet();deleteSkill('${node.id}')">Удалить</button>
        </div>
        <button class="btn btn-secondary btn-block" style="margin-top:10px" onclick="closeNodeSheet()">Закрыть</button>
      `;
      overlay.classList.add('open');
    }

    function closeNodeSheet() {
      const overlay = document.getElementById('nodeSheetOverlay');
      if (overlay) overlay.classList.remove('open');
    }

    function toggleTreeCollapse(nodeId, ev) {
      if (ev) ev.stopPropagation();
      treeCollapsed[nodeId] = !treeCollapsed[nodeId];
      renderTree(currentTreeDirId);
    }

    function renderTreeList(dir) {
      const wrap = document.getElementById('treeListWrap');
      const nodes = dir.nodes || [];
      const byParent = buildTreeIndex(nodes);

      if (!nodes.length) {
        wrap.innerHTML = `
          <div class="empty-state" style="padding:36px 12px">
            <div class="big-icon">🌳</div>
            <h3>Дерево пустое</h3>
            <p>Собери навыки через ИИ или добавь первый корневой навык. В списке удобнее править на телефоне.</p>
            <button class="btn btn-primary btn-block" style="margin-bottom:8px" onclick="generateSkillTree('${dir.id}')">Собрать дерево ИИ</button>
            <button class="btn btn-secondary btn-block" style="margin-bottom:8px" onclick="openSkillModal(null)">+ Корневой навык</button>
            <button class="btn btn-secondary btn-sm" onclick="showTreeExamples()">Примеры</button>
          </div>`;
        return;
      }

      function renderNode(n, depth) {
        const prog = xpProgress(n.xp || 0);
        const children = byParent[n.id] || [];
        const collapsed = !!treeCollapsed[n.id];
        const hasKids = children.length > 0;
        const indent = Math.min(depth, 6) * 8;
        let html = `
          <div class="tree-list-item ${!n.parentId ? 'root-item' : ''} ${n.isKey ? 'key-item' : ''}"
               style="margin-left:${indent}px"
               onclick="openNodeSheet('${n.id}')">
            <div class="tl-depth"></div>
            <div class="tl-main">
              <div class="tl-name">${n.isKey ? '★ ' : ''}${escapeHtml(n.name)}</div>
              <div class="tl-meta">
                <span class="gold">LVL ${prog.level}</span>
                <span>${formatNum(n.xp || 0)} XP</span>
                ${hasKids ? '<span>' + children.length + ' ↓</span>' : ''}
              </div>
              <div class="tl-bar"><i style="width:${prog.percent}%"></i></div>
            </div>
            ${hasKids
              ? `<div class="tl-chevron" onclick="toggleTreeCollapse('${n.id}', event)">${collapsed ? '▸' : '▾'}</div>`
              : `<div class="tl-chevron" style="opacity:0.35">›</div>`}
          </div>`;
        if (hasKids && !collapsed) {
          html += `<div class="tree-list-children">`;
          children.forEach(c => { html += renderNode(c, depth + 1); });
          html += `</div>`;
        }
        return html;
      }

      const roots = byParent['root'] || [];
      wrap.innerHTML = roots.map(r => renderNode(r, 0)).join('') + `
        <button class="btn btn-secondary btn-block" style="margin-top:12px" onclick="openSkillModal(null)">+ Ещё корневой навык</button>
      `;
    }

    function renderTreeMap(dir) {
      const nodes = dir.nodes || [];
      const canvas = document.getElementById('treeCanvas');
      const wrap = document.getElementById('treeCanvasWrap');
      const byParent = buildTreeIndex(nodes);

      if (!nodes.length) {
        canvas.innerHTML = `
          <div style="padding:40px 20px;text-align:center;color:var(--text-dim);max-width:340px">
            <p style="font-weight:700;color:var(--text);margin-bottom:8px">Пока пусто</p>
            <p style="font-size:0.88rem;margin-bottom:16px">Переключись на «Список» или собери дерево ИИ.</p>
            <button class="btn btn-primary" onclick="generateSkillTree('${dir.id}')">ИИ-дерево</button>
          </div>`;
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        applyTreeTransform();
        return;
      }

      const NODE_W = 160;
      const NODE_H = 100;
      const H_GAP = 28;
      const V_GAP = 56;
      const positions = {};
      let maxX = 0, maxY = 0;

      function measureWidth(nodeId) {
        const children = byParent[nodeId] || [];
        if (!children.length) return NODE_W;
        let w = 0;
        children.forEach((c, i) => {
          w += measureWidth(c.id);
          if (i < children.length - 1) w += H_GAP;
        });
        return Math.max(NODE_W, w);
      }

      function layout(parentId, depth, startX) {
        const children = byParent[parentId] || [];
        let x = startX;
        children.forEach(child => {
          const subtreeWidth = measureWidth(child.id);
          const cx = x + subtreeWidth / 2 - NODE_W / 2;
          const cy = 32 + depth * (NODE_H + V_GAP);
          positions[child.id] = { x: Math.max(16, cx), y: cy, node: child };
          maxX = Math.max(maxX, positions[child.id].x + NODE_W + 32);
          maxY = Math.max(maxY, cy + NODE_H + 32);
          layout(child.id, depth + 1, x);
          x += subtreeWidth + H_GAP;
        });
      }

      const roots = byParent['root'] || [];
      let startX = 24;
      roots.forEach(r => {
        const w = measureWidth(r.id);
        const cx = startX + w / 2 - NODE_W / 2;
        positions[r.id] = { x: Math.max(16, cx), y: 28, node: r };
        maxX = Math.max(maxX, positions[r.id].x + NODE_W + 32);
        maxY = Math.max(maxY, 28 + NODE_H + 32);
        layout(r.id, 1, startX);
        startX += w + H_GAP + 24;
      });

      const canvasW = Math.max(maxX + 40, (wrap.clientWidth || 320) / Math.max(treeScale, 0.5));
      const canvasH = Math.max(maxY + 60, (wrap.clientHeight || 400) / Math.max(treeScale, 0.5));
      canvas.style.width = canvasW + 'px';
      canvas.style.height = canvasH + 'px';

      let svgLines = '';
      nodes.forEach(n => {
        if (n.parentId && positions[n.parentId] && positions[n.id]) {
          const p = positions[n.parentId];
          const c = positions[n.id];
          const x1 = p.x + NODE_W / 2;
          const y1 = p.y + NODE_H - 6;
          const x2 = c.x + NODE_W / 2;
          const y2 = c.y + 4;
          const midY = (y1 + y2) / 2;
          svgLines += `<path d="M${x1},${y1} C${x1},${midY} ${x2},${midY} ${x2},${y2}" fill="none" stroke="rgba(224,184,120,0.22)" stroke-width="1.75"/>`;
        }
      });

      let html = `<svg class="tree-svg" width="${canvasW}" height="${canvasH}">${svgLines}</svg>`;
      Object.values(positions).forEach(({ x, y, node }) => {
        const prog = xpProgress(node.xp || 0);
        const isRoot = !node.parentId;
        html += `
          <div class="skill-node ${isRoot ? 'root' : ''} ${node.isKey ? 'key-skill' : ''}"
               style="left:${x}px;top:${y}px"
               onclick="openNodeSheet('${node.id}')">
            <div class="sn-name">${node.isKey ? '★ ' : ''}${escapeHtml(node.name)}</div>
            <div class="sn-lvl">LVL ${prog.level}</div>
            <div class="sn-xp">${formatNum(node.xp || 0)} XP</div>
            <div class="progress-wrap sn-bar">
              <div class="progress-bar gold" style="width:${prog.percent}%"></div>
            </div>
            <div class="sn-hint">нажми для действий</div>
          </div>`;
      });
      canvas.innerHTML = html;
      applyTreeTransform();
    }

    function renderTree(dirId) {
      const dir = state.directions.find(d => d.id === dirId);
      if (!dir) return;
      const n = (dir.nodes || []).length;
      const prog = xpProgress(dir.xp || 0);
      const sub = document.getElementById('treeSub');
      if (sub) sub.textContent = 'LVL ' + prog.level + ' · ' + n + ' навыков · ' + stageLabel(dir.stage || 'beginner');
      if (treeMode === 'map') renderTreeMap(dir);
      else renderTreeList(dir);
    }

    function openSkillModal(id, asChild) {
      const dir = state.directions.find(d => d.id === currentTreeDirId);
      if (!dir) return;

      skillParentId = null;
      editingId = null;
      editingType = 'skill';

      let node = null;
      if (asChild && id) {
        skillParentId = id;
      } else if (id) {
        editingId = id;
        node = (dir.nodes || []).find(n => n.id === id);
      }

      const title = node ? 'Редактировать навык' : (skillParentId ? 'Новая ветка' : 'Корневой навык');

      document.getElementById('modalContent').innerHTML = `
        <h2>${title}</h2>
        <div class="form-group">
          <label>Название</label>
          <input type="text" id="sName" value="${node ? escapeHtml(node.name) : ''}" placeholder="Например: Баррэ" maxlength="60">
        </div>
        <div class="form-group">
          <label>Описание</label>
          <textarea id="sDesc" placeholder="Зачем этот навык? Как поймёшь прогресс?">${node ? escapeHtml(node.description || '') : ''}</textarea>
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" onclick="closeModal()">Отмена</button>
          <button class="btn btn-primary" onclick="saveSkill()">${node ? 'Сохранить' : 'Создать'}</button>
        </div>
      `;
      openModal();
      setTimeout(() => {
        const inp = document.getElementById('sName');
        if (inp) inp.focus();
      }, 120);
    }

    function saveSkill() {
      const dir = state.directions.find(d => d.id === currentTreeDirId);
      if (!dir) return;
      if (!dir.nodes) dir.nodes = [];

      const name = document.getElementById('sName').value.trim();
      if (!name) { toast('Введи название', 'error'); return; }
      const description = document.getElementById('sDesc').value.trim();

      if (editingId) {
        const node = dir.nodes.find(n => n.id === editingId);
        if (node) {
          node.name = name;
          node.description = description;
          toast('Навык обновлён');
        }
      } else {
        dir.nodes.push({
          id: uid(),
          name,
          description,
          parentId: skillParentId || null,
          xp: 0
        });
        if (!skillParentId) {
          addAutoLore(`🌱 Новый навык: «${name}» в направлении «${dir.name}»`);
        }
        toast(skillParentId ? 'Ветка создана' : 'Корневой навык создан');
        checkTitlesAndAchievements();
      }

      if (!save()) return;
      closeModal();
      renderTree(currentTreeDirId);
      renderHero();
    }

    function deleteSkill(id) {
      const dir = state.directions.find(d => d.id === currentTreeDirId);
      if (!dir) return;
      if (!confirm('Удалить навык и все дочерние ветки?\\nКвесты станут «Общий XP».')) return;

      const toDelete = new Set();
      function collect(nid) {
        toDelete.add(nid);
        (dir.nodes || []).filter(n => n.parentId === nid).forEach(c => collect(c.id));
      }
      collect(id);

      state.quests.forEach(q => {
        if (q.targetType === 'SKILL' && toDelete.has(q.targetId)) {
          q.targetType = 'GENERAL';
          q.targetId = null;
        }
      });

      dir.nodes = (dir.nodes || []).filter(n => !toDelete.has(n.id));
      if (!save()) return;
      renderTree(currentTreeDirId);
      renderHero();
      toast('Удалено');
    }

    // ===================== LORE =====================
    let loreFilter = 'all';

    function renderLore() {
      const list = document.getElementById('loreList');
      let items = [...state.lore].reverse();
      if (loreFilter === 'manual') items = items.filter(l => !l.auto);
      if (loreFilter === 'auto') items = items.filter(l => l.auto);

      const filters = `
        <div class="filters" style="margin-bottom:12px">
          <button class="filter-btn ${loreFilter==='all'?'active':''}" onclick="loreFilter='all';renderLore()">Все</button>
          <button class="filter-btn ${loreFilter==='manual'?'active':''}" onclick="loreFilter='manual';renderLore()">Мои</button>
          <button class="filter-btn ${loreFilter==='auto'?'active':''}" onclick="loreFilter='auto';renderLore()">Авто</button>
        </div>`;

      if (state.lore.length === 0) {
        list.innerHTML = `
          <div class="empty-state">
            <div class="big-icon">📖</div>
            <h3>История пуста</h3>
            <p>Пиши важные моменты вручную. Авто-записи появятся после квестов.</p>
            <button class="btn btn-primary" onclick="openLoreModal()">+ Первая запись</button>
          </div>`;
        return;
      }

      if (items.length === 0) {
        list.innerHTML = filters + `<div class="empty-state"><p class="text-dim">В этом фильтре пусто</p></div>`;
        return;
      }

      list.innerHTML = filters + items.map(l => `
        <div class="card lore-card">
          <div class="lore-date">
            ${escapeHtml(l.date)}
            ${l.auto ? '<span class="badge" style="margin-left:8px;font-size:0.65rem">АВТО</span>' : ''}
          </div>
          <div class="lore-text">${escapeHtml(l.text)}</div>
          <div class="quest-actions mt-12">
            <button class="btn btn-secondary btn-sm" onclick="openLoreModal('${l.id}')">✎</button>
            <button class="btn btn-danger btn-sm" onclick="deleteLore('${l.id}')">✕</button>
          </div>
        </div>
      `).join('');
    }

    function openLoreModal(id) {
      editingId = id || null;
      editingType = 'lore';
      const l = id ? state.lore.find(x => x.id === id) : null;
      const today = new Date().toLocaleDateString('ru-RU');

      document.getElementById('modalContent').innerHTML = `
        <h2>${l ? 'Редактировать запись' : 'Новая запись лора'}</h2>
        <div class="form-group">
          <label>Дата</label>
          <input type="text" id="lDate" value="${l ? escapeHtml(l.date) : today}" placeholder="ДД.ММ.ГГГГ">
        </div>
        <div class="form-group">
          <label>Текст</label>
          <textarea id="lText" placeholder="Что произошло?" style="min-height:140px">${l ? escapeHtml(l.text) : ''}</textarea>
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" onclick="closeModal()">Отмена</button>
          <button class="btn btn-primary" onclick="saveLore()">${l ? 'Сохранить' : 'Добавить'}</button>
        </div>
      `;
      openModal();
    }

    function saveLore() {
      const date = document.getElementById('lDate').value.trim() || new Date().toLocaleDateString('ru-RU');
      const text = document.getElementById('lText').value.trim();
      if (!text) { toast('Напиши текст', 'error'); return; }

      if (editingId) {
        const l = state.lore.find(x => x.id === editingId);
        if (l) {
          l.date = date;
          l.text = text;
          toast('Запись обновлена');
        }
      } else {
        state.lore.push({ id: uid(), date, text, createdAt: Date.now() });
        toast('Запись добавлена');
      }
      if (!save()) return;
      closeModal();
      renderLore();
    }

    function deleteLore(id) {
      if (!confirm('Удалить запись?')) return;
      state.lore = state.lore.filter(x => x.id !== id);
      if (!save()) return;
      renderLore();
      toast('Запись удалена');
    }
