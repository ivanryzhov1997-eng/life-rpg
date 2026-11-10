
    // ===================== PERSISTENCE =====================
    function localDateKey(date = new Date()) {
      return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
    }

    function todayStr() {
      return localDateKey(new Date());
    }

    function getApiKey() {
      try { return localStorage.getItem(SECRET_KEY) || ''; } catch(e) { return ''; }
    }

    function setApiKey(key) {
      try {
        if (key) localStorage.setItem(SECRET_KEY, key);
        else localStorage.removeItem(SECRET_KEY);
      } catch(e) {}
    }

    function getProxyUrl() {
      // Вшитый URL всегда главный (скрытый авто-ИИ). localStorage только если DEFAULT пустой.
      try {
        const baked = (DEFAULT_PROXY_URL || '').trim();
        if (baked) return baked.replace(/\/$/, '');
        const ls = (localStorage.getItem(LS_PROXY) || '').trim();
        return ls.replace(/\/$/, '');
      } catch (e) {
        return (DEFAULT_PROXY_URL || '').trim().replace(/\/$/, '');
      }
    }

    function getProxyAnon() {
      try {
        const baked = (DEFAULT_SUPABASE_ANON_KEY || '').trim();
        if (baked) return baked;
        return (localStorage.getItem(LS_PROXY_ANON) || '').trim();
      } catch (e) {
        return (DEFAULT_SUPABASE_ANON_KEY || '').trim();
      }
    }

    function aiEndpoint() {
      return getProxyUrl() || '';
    }

    async function aiAuthHeaders() {
      const headers = { 'Content-Type': 'application/json' };
      const anon = getProxyAnon();
      if (anon) headers['apikey'] = anon;

      // Use the real session token for account-aware server quotas. Guest mode
      // continues to use the public key and is limited by the proxy per IP.
      let accessToken = '';
      try {
        if (supabaseClient && supabaseClient.auth && supabaseClient.auth.getSession) {
          const result = await supabaseClient.auth.getSession();
          accessToken = result && result.data && result.data.session
            ? result.data.session.access_token || ''
            : '';
        }
      } catch (e) {
        // Keep guest AI available if session restoration is temporarily unavailable.
      }

      // Publishable keys belong in apikey only. Authorization is reserved for
      // a real user access token; guests are identified by the proxy via IP.
      if (accessToken) headers['Authorization'] = 'Bearer ' + accessToken;
      return headers;
    }

    function hasAiAccess() {
      return !!getProxyUrl();
    }

    function updateAiStatusLine() {
      const el = document.getElementById('aiStatusLine');
      if (!el) return;
      el.textContent = hasAiAccess()
        ? 'Статус: ИИ подключён'
        : 'Статус: ИИ недоступен';
    }

    function saveAiProxySettings() {
      try {
        const url = (document.getElementById('aiProxyUrlInput')?.value || '').trim().replace(/\/$/, '');
        const anon = (document.getElementById('aiProxyAnonInput')?.value || '').trim();
        if (url) localStorage.setItem(LS_PROXY, url);
        else localStorage.removeItem(LS_PROXY);
        if (anon) localStorage.setItem(LS_PROXY_ANON, anon);
        else localStorage.removeItem(LS_PROXY_ANON);
      } catch (e) {}
      updateAiStatusLine();
      toast(hasAiAccess() ? 'ИИ сохранён' : 'Нужен Proxy URL', hasAiAccess() ? 'success' : 'error');
    }

    async function testAiProxy() {
      saveAiProxySettings();
      if (!hasAiAccess()) { toast('Сначала Proxy URL', 'error'); return; }
      toast('Проверяю ИИ…');
      try {
        const raw = await callGroq('Reply with one word: ok', 'ping');
        toast('ИИ ок: ' + String(raw || '').slice(0, 40), 'success');
      } catch (e) {
        toast(e.message || 'Ошибка ИИ', 'error');
      }
    }
