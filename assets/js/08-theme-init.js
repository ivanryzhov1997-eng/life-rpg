
    // ===================== THEME =====================
    function getPreferredTheme() {
      try {
        const saved = localStorage.getItem('life_rpg_theme');
        if (saved === 'light' || saved === 'dark') return saved;
        if (saved === 'system' || !saved) {
          return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
        }
      } catch (e) {}
      return 'dark';
    }


    // ===================== VISUAL PRESETS =====================
    const VISUAL_THEMES = [
      { id: 'teal', name: 'Teal', desc: 'графит + бирюза' },
      { id: 'ember', name: 'Ember', desc: 'тёплый мёд' },
      { id: 'ink', name: 'Ink', desc: 'ч/б жёсткий' },
      { id: 'violet', name: 'Violet', desc: 'ночь + фиолет' },
      { id: 'forest', name: 'Forest', desc: 'тёмный лес' },
      { id: 'ocean', name: 'Ocean', desc: 'глубокий синий' },
      { id: 'rose', name: 'Rose', desc: 'пыльная роза' }
    ];
    const LS_VISUAL = 'life_rpg_visual';

    function getVisualTheme() {
      try { return localStorage.getItem(LS_VISUAL) || 'teal'; } catch (e) { return 'teal'; }
    }

    function applyVisualTheme(id) {
      const ok = VISUAL_THEMES.some(v => v.id === id);
      const v = ok ? id : 'teal';
      if (v === 'teal') document.documentElement.removeAttribute('data-visual');
      else document.documentElement.setAttribute('data-visual', v);
      try { localStorage.setItem(LS_VISUAL, v); } catch (e) {}
      renderVisualThemeGrid();
    }

    function setVisualTheme(id) {
      applyVisualTheme(id);
      toast('Стиль: ' + (VISUAL_THEMES.find(x => x.id === id)?.name || id), 'success');
    }

    function renderVisualThemeGrid() {
      const el = document.getElementById('visualThemeGrid');
      if (!el) return;
      const cur = getVisualTheme();
      el.innerHTML = VISUAL_THEMES.map(v => `
        <button type="button" class="btn ${cur === v.id ? 'btn-primary' : 'btn-secondary'} btn-sm"
          style="flex-direction:column;align-items:flex-start;min-height:52px;padding:10px 12px;text-align:left"
          onclick="setVisualTheme('${v.id}')">
          <span style="font-weight:700">${v.name}</span>
          <span style="font-size:0.72rem;opacity:0.75;font-weight:500">${v.desc}</span>
        </button>
      `).join('');
    }

    function applyTheme(theme) {
      const t = theme === 'light' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', t);
      const meta = document.getElementById('metaThemeColor');
      if (meta) meta.setAttribute('content', t === 'light' ? '#f6f1ea' : '#141210');
      const btn = document.getElementById('themeToggle');
      if (btn) btn.textContent = t === 'light' ? 'Тёмная' : 'Светлая';
    }

    function setTheme(mode) {
      try {
        if (mode === 'system') localStorage.setItem('life_rpg_theme', 'system');
        else localStorage.setItem('life_rpg_theme', mode);
      } catch (e) {}
      applyTheme(mode === 'system' ? getPreferredTheme() : mode);
      toast(mode === 'light' ? 'Светлая тема' : mode === 'dark' ? 'Тёмная тема' : 'Как в системе', 'success');
    }

    function toggleTheme() {
      const cur = document.documentElement.getAttribute('data-theme') || 'dark';
      setTheme(cur === 'light' ? 'dark' : 'light');
    }

    applyTheme(getPreferredTheme());
    try {
      window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
        const saved = localStorage.getItem('life_rpg_theme');
        if (!saved || saved === 'system') applyTheme(getPreferredTheme());
      });
    } catch (e) {}

    // ===================== INIT =====================
    try {
      applyVisualTheme(getVisualTheme());
    } catch (e) { console.warn('visual', e); }
    try {
      load();
    } catch (e) {
      console.error('load', e);
      try { showBootError(e); } catch (e2) {}
    }
    try {
      const tg = window.Telegram && window.Telegram.WebApp;
      if (tg && tg.ready) tg.ready();
      if (tg && tg.expand) tg.expand();
    } catch (e) {}

    function showBootError(err) {
      try {
        const msg = (err && (err.message || String(err))) || 'unknown';
        console.error('LIFE RPG boot', err);
        document.body.insertAdjacentHTML('afterbegin',
          '<div style="padding:20px;font-family:system-ui;background:#1a1a1a;color:#fee;z-index:99999;position:relative">' +
          '<b>Ошибка загрузки LIFE RPG</b><p style="font-size:13px;opacity:.85;margin:8px 0">' + msg.replace(/</g,'&lt;') +
          '</p><p style="font-size:12px;opacity:.6">Если видишь это — пришли текст ошибки.</p></div>');
      } catch (e) {}
    }

    async function boot() {
      try {
        try {
          if (supabaseClient) {
            const {data}=await supabaseClient.auth.getSession();
            authUser=data.session?.user||null;
            supabaseClient.auth.onAuthStateChange((_event, session) => {
              const oldId = authUser && authUser.id;
              authUser = session?.user || null;
              const newId = authUser && authUser.id;
              if (oldId !== newId) {
                // Freeze writes while the newly selected account is being loaded.
                clearTimeout(cloudSaveTimer);
                cloudSaveTimer = null;
                cloudReady = false;
                resetCloudBase();
                cloudLastError = '';
                if (newId) setTimeout(() => afterAuthReady(), 0);
              }
              updateAuthUI();
            });
          }
          updateAuthUI();
          if (cloudConfigured()) await cloudLoad();
        } catch (e) {
          console.warn('cloudLoad', e);
        }
        try {
          checkTitlesAndAchievements();
        } catch (e) {
          console.warn('checkTitles failed', e);
        }
        try { resetHabitsForToday(); } catch (e) {}
        renderAll();
        try { populateCloudSettings(); } catch (e) {}
        try {
          if (!localStorage.getItem('life_rpg_v5_onboarded') && !localStorage.getItem('life_rpg_v4_onboarded')) {
            setTimeout(showOnboarding, 400);
          } else {
            try { localStorage.setItem('life_rpg_v5_onboarded', '1'); } catch(e) {}
            maybeEveningRitual();
            maybeSundayReview();
            maybeShowMicroTip();
          }
        } catch (e) {}
      } catch (e) {
        showBootError(e);
      }
    }

    window.addEventListener('error', function (ev) {
      if (ev && ev.error) showBootError(ev.error);
      else if (ev && ev.message) showBootError(ev.message);
    });
    window.addEventListener('unhandledrejection', function (ev) {
      showBootError(ev.reason || 'promise');
    });

    try {
      boot();
    } catch (e) {
      showBootError(e);
    }

    // Prevent accidental zoom on double-tap (iOS)
    let lastTouch = 0;
    document.addEventListener('touchend', (e) => {
      const now = Date.now();
      if (now - lastTouch <= 300) e.preventDefault();
      lastTouch = now;
    }, { passive: false });

  