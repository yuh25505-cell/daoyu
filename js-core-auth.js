/* 岛屿 · 登录注册门（位于启动动画与主屏幕之间） */
'use strict';
(function(){
  var AUTH_CONFIG = {
    API_BASE: 'https://daoyu-auth-api.yuh25505.workers.dev',
    PATHS: { login: '/api/login', register: '/api/register', me: '/api/me', logout: '/api/logout' },
    TIMEOUT: 15000
  };
  var KEY = 'island.auth.session';
  var gate = document.getElementById('authGate');
  if (!gate) return;
  var els = {
    tabLogin: document.getElementById('authTabLogin'),
    tabRegister: document.getElementById('authTabRegister'),
    qq: document.getElementById('authQQ'),
    pwd: document.getElementById('authPwd'),
    invite: document.getElementById('authInvite'),
    err: document.getElementById('authError'),
    submit: document.getElementById('authSubmit'),
    reqLabel: document.getElementById('authReqLabel'),
    eye: document.getElementById('authEye'),
    form: document.getElementById('authForm'),
    reqBtn: document.getElementById('authReqBtn')
  };
  var mode = 'login';

  function deviceLabel(){
    var ua = navigator.userAgent || '';
    var os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : '设备';
    var isApp = !!window.Capacitor || location.hostname === 'localhost';
    if (isApp) return os + ' · 岛屿APK';
    var br = /MicroMessenger/.test(ua) ? '微信' : /MiuiBrowser/.test(ua) ? '小米浏览器' : /SamsungBrowser/.test(ua) ? '三星浏览器' : /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox/.test(ua) ? 'Firefox' : /QQBrowser|MQQBrowser/.test(ua) ? 'QQ浏览器' : /CriOS|Chrome/.test(ua) ? 'Chrome' : /Safari/.test(ua) ? 'Safari' : '浏览器';
    var standalone = false;
    try { standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; } catch(e) {}
    return os + ' · ' + br + (standalone ? '（主屏幕）' : '');
  }

  function readSession(){ try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch(e) { return null; } }
  function writeSession(s){ try { localStorage.setItem(KEY, JSON.stringify(s)); } catch(e) {} }
  function clearSession(){ try { localStorage.removeItem(KEY); } catch(e) {} }

  function url(path){ return AUTH_CONFIG.API_BASE.replace(/\/+$/, '') + path; }

  function request(path, method, body, token){
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function(){ ctrl.abort(); }, AUTH_CONFIG.TIMEOUT) : 0;
    var headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = 'Bearer ' + token;
    return fetch(url(path), {
      method: method, headers: headers, cache: 'no-store',
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl ? ctrl.signal : undefined
    }).then(function(resp){
      return resp.json().catch(function(){ return {}; }).then(function(data){
        return { ok: resp.ok, status: resp.status, data: data || {} };
      });
    }).finally(function(){ if (timer) clearTimeout(timer); });
  }

  function pick(data){
    var d = data && data.data && typeof data.data === 'object' ? data.data : {};
    return {
      token: data.token || d.token || '',
      status: String((data.user && data.user.status) || data.status || '').toLowerCase(),
      message: data.error || data.message || ''
    };
  }


  function setError(text){ els.err.textContent = text || ''; }

  var REQ_KEY = 'island.auth.inviteReq';
  function readReq(){ try { return JSON.parse(localStorage.getItem(REQ_KEY) || 'null'); } catch(e) { return null; } }
  function writeReq(r){ try { localStorage.setItem(REQ_KEY, JSON.stringify(r)); } catch(e) {} }
  function clearReq(){ try { localStorage.removeItem(REQ_KEY); } catch(e) {} }

  function syncReqButton(){
    var r = readReq();
    var same = !!(r && r.qq === els.qq.value.trim());
    els.reqLabel.textContent = same ? '查看申请结果' : '申请邀请码';
    if (same && r.code && !els.invite.value.trim()) els.invite.value = r.code;
  }

  function checkReq(silent){
    var r = readReq();
    if (!r) return;
    request('/api/invite/request/status', 'POST', { requestId: r.requestId, requestToken: r.requestToken }).then(function(res){
      var st = res.data.status;
      if (res.status === 404) { clearReq(); syncReqButton(); if (!silent) setError('申请不存在，请重新申请'); return; }
      if (!res.ok) { if (!silent) setError(res.data.error || '查询失败'); return; }
      if (st === 'approved' && res.data.code) {
        r.code = res.data.code; writeReq(r);
        els.invite.value = r.code;
        syncReqButton();
        setError('邀请码已发放');
      } else if (st === 'rejected' || st === 'used') {
        clearReq(); syncReqButton();
        if (!silent) setError(st === 'rejected' ? '申请未通过' : '邀请码已使用');
      } else if (!silent) {
        setError('仍在审核中');
      }
    }).catch(function(){ if (!silent) setError('网络连接失败'); });
  }

  function requestInvite(){
    var qq = els.qq.value.trim();
    if (!/^\d{5,15}$/.test(qq)) { setError('QQ号格式不正确'); return; }
    var r = readReq();
    if (r && r.qq === qq) { checkReq(false); return; }
    els.reqBtn.disabled = true;
    setError('');
    request('/api/invite/request', 'POST', { qq: qq }).then(function(res){
      if (res.ok && res.data.requestId) {
        writeReq({ qq: qq, requestId: res.data.requestId, requestToken: res.data.requestToken });
        syncReqButton();
        setError('申请已提交');
      } else {
        setError(res.data.error || '申请失败');
      }
    }).catch(function(){ setError('网络连接失败'); }).then(function(){ els.reqBtn.disabled = false; });
  }

  function setMode(next){
    mode = next;
    gate.setAttribute('data-mode', next);
    els.tabLogin.classList.toggle('is-active', next === 'login');
    els.tabRegister.classList.toggle('is-active', next === 'register');
    els.submit.textContent = next === 'login' ? '登录' : '注册';
    els.pwd.setAttribute('autocomplete', next === 'login' ? 'current-password' : 'new-password');
    setError('');
    syncReqButton();
  }

  function openGate(){
    gate.classList.remove('is-leaving');
    gate.classList.add('is-open');
    gate.setAttribute('aria-hidden', 'false');
    setMode('login');
  }

  function closeGate(){
    gate.classList.add('is-leaving');
    setTimeout(function(){
      gate.classList.remove('is-open', 'is-leaving');
      gate.setAttribute('aria-hidden', 'true');
      els.pwd.value = '';
    }, 460);
  }

  function validate(){
    var qq = els.qq.value.trim();
    var pwd = els.pwd.value;
    if (!/^\d{5,15}$/.test(qq)) return 'QQ号格式不正确';
    if (pwd.length < 12) return '密码至少12位';
    if (mode === 'register' && !els.invite.value.trim()) return '请输入邀请码';
    return '';
  }

  function submit(){
    var problem = validate();
    if (problem) { setError(problem); return; }
    var qq = els.qq.value.trim();
    var body = { qq: qq, password: els.pwd.value };
    if (mode === 'register') body.inviteCode = els.invite.value.trim();
    els.submit.disabled = true;
    setError('');
    var chain = mode === 'register'
      ? request(AUTH_CONFIG.PATHS.register, 'POST', body).then(function(res){
          if (!res.ok) { setError(pick(res.data).message || '注册失败'); return null; }
          clearReq();
          return request(AUTH_CONFIG.PATHS.login, 'POST', { qq: qq, password: body.password, deviceLabel: deviceLabel() });
        })
      : request(AUTH_CONFIG.PATHS.login, 'POST', { qq: qq, password: body.password, deviceLabel: deviceLabel() });
    chain.then(function(res){
      if (!res) return;
      var p = pick(res.data);
      if (res.ok && p.token && p.status === 'approved') {
        writeSession({ token: p.token, qq: qq, role: (res.data.user && res.data.user.role) || 'user', at: Date.now() });
        applyRole();
        closeGate();
        return;
      }
      if (res.ok && p.token) request(AUTH_CONFIG.PATHS.logout, 'POST', null, p.token).catch(function(){});
      if (mode === 'register') { setMode('login'); setError('注册成功，请登录'); return; }
      setError(p.message || '登录失败');
    }).catch(function(){
      setError('网络连接失败');
    }).then(function(){ els.submit.disabled = false; });
  }

  function verifySession(session){
    request(AUTH_CONFIG.PATHS.me, 'GET', null, session.token).then(function(res){
      var p = pick(res.data);
      if (res.ok && res.data.user) {
        var cur = readSession();
        if (cur) { cur.role = res.data.user.role || 'user'; cur.hasInvite = !!res.data.hasGeneratedInvite; writeSession(cur); }
        applyRole();
      }
      if (res.status === 401 || res.status === 403 || (res.ok && p.status && p.status !== 'approved')) { clearSession(); openGate(); setError('登录已失效，请重新登录'); }
    }).catch(function(){});
  }

  function authRequest(path, method, body){
    var s = readSession();
    if (!s || !s.token) { openGate(); return Promise.reject(new Error('no session')); }
    return request(path, method, body, s.token).then(function(res){
      if (res.status === 401) { clearSession(); openGate(); throw new Error('expired'); }
      return res;
    });
  }

  function $(id){ return document.getElementById(id); }

  function applyRole(){
    var s = readSession();
    var invite = $('inviteRow'), review = $('adminReviewRow'), devices = $('devicesRow');
    if (devices) devices.style.display = s ? '' : 'none';
    if (invite) invite.style.display = s ? '' : 'none';
    if (review) review.style.display = s && s.role === 'admin' ? '' : 'none';
    if (s && s.role === 'admin') refreshPendingCount();
  }

  function fmtTime(v){
    if (!v) return '';
    var d = new Date(String(v).replace(' ', 'T') + 'Z');
    if (isNaN(d.getTime())) return String(v);
    var pad = function(n){ return n < 10 ? '0' + n : '' + n; };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function say(msg){ try { toast(msg); } catch(e) {} }

  function copyText(text){
    var done = function(){ say('已复制'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function(){ fallbackCopy(text); done(); });
    } else { fallbackCopy(text); done(); }
  }
  function fallbackCopy(text){
    var t = document.createElement('textarea');
    t.value = text; t.style.position = 'fixed'; t.style.opacity = '0';
    document.body.appendChild(t); t.select();
    try { document.execCommand('copy'); } catch(e) {}
    document.body.removeChild(t);
  }

  function inviteKey(){ var s = readSession(); return 'island.auth.invite.' + (s ? s.qq : ''); }
  function savedInvite(){ try { return localStorage.getItem(inviteKey()) || ''; } catch(e) { return ''; } }

  function el(tag, cls, text){
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function renderInvite(){
    var body = $('inviteBody');
    if (!body) return;
    body.textContent = '';
    body.appendChild(el('div', 'auth-empty', '加载中'));
    authRequest(AUTH_CONFIG.PATHS.me, 'GET').then(function(res){
      body.textContent = '';
      if (!res.ok) { body.appendChild(el('div', 'auth-empty', res.data.error || '加载失败')); return; }
      var generated = !!res.data.hasGeneratedInvite;
      var code = generated ? savedInvite() : '';
      if (generated && code) {
        var card = el('div', 'auth-card');
        card.appendChild(el('div', 'auth-code', code));
        var actions = el('div', 'auth-card-actions');
        var copy = el('button', 'api-btn secondary', '复制'); copy.type = 'button';
        copy.addEventListener('click', function(){ copyText(code); });
        actions.appendChild(copy); card.appendChild(actions); body.appendChild(card);
      } else if (generated) {
        body.appendChild(el('div', 'auth-card', '邀请码已生成'));
      } else {
        var gen = el('button', 'api-btn primary', '生成邀请码'); gen.type = 'button';
        gen.addEventListener('click', function(){ generateInvite(gen); });
        body.appendChild(gen);
      }
    }).catch(function(){
      body.textContent = '';
      body.appendChild(el('div', 'auth-empty', '网络连接失败'));
    });
  }

  function generateInvite(btn){
    if (!window.confirm('邀请码只显示一次，确认生成？')) return;
    btn.disabled = true;
    authRequest('/api/invite/generate', 'POST', {}).then(function(res){
      if (res.ok && res.data.code) {
        try { localStorage.setItem(inviteKey(), res.data.code); } catch(e) {}
        renderInvite();
      } else {
        say(res.data.error || '生成失败');
        btn.disabled = false;
      }
    }).catch(function(){ say('网络连接失败'); btn.disabled = false; });
  }

  function fmtTs(sec){
    if (!sec) return '';
    var d = new Date(Number(sec) * 1000);
    if (isNaN(d.getTime())) return '';
    var pad = function(n){ return n < 10 ? '0' + n : '' + n; };
    return (d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function renderDevices(){
    var list = $('devicesList');
    if (!list) return;
    list.textContent = '';
    list.appendChild(el('div', 'auth-empty', '加载中'));
    authRequest('/api/devices', 'GET').then(function(res){
      list.textContent = '';
      if (!res.ok) { list.appendChild(el('div', 'auth-empty', res.data.error || '加载失败')); return; }
      var devices = res.data.devices || [];
      if (!devices.length) { list.appendChild(el('div', 'auth-empty', '暂无设备')); return; }
      devices.forEach(function(d){
        var c = el('div', 'auth-card');
        var meta = el('div', 'auth-card-meta');
        var title = el('strong', '', d.label);
        meta.appendChild(title);
        var login = fmtTs(d.loginAt), seen = fmtTs(d.lastSeenAt);
        if (login) meta.appendChild(el('span', '', '登录 ' + login));
        if (seen) meta.appendChild(el('span', '', '活跃 ' + seen));
        c.appendChild(meta);
        var actions = el('div', 'auth-card-actions');
        if (d.current) {
          actions.appendChild(el('span', 'auth-badge', '本机'));
        } else {
          var off = el('button', 'auth-mini', '下线'); off.type = 'button';
          off.addEventListener('click', function(){
            if (!window.confirm('让「' + d.label + '」下线？')) return;
            off.disabled = true;
            authRequest('/api/devices/revoke', 'POST', { sessionId: d.id }).then(function(r){
              say(r.ok ? '已下线' : (r.data.error || '操作失败'));
              renderDevices();
            }).catch(function(){ say('网络连接失败'); off.disabled = false; });
          });
          actions.appendChild(off);
        }
        c.appendChild(actions);
        list.appendChild(c);
      });
    }).catch(function(){
      list.textContent = '';
      list.appendChild(el('div', 'auth-empty', '网络连接失败'));
    });
  }

  function setPendingCount(n){
    var c = $('adminReviewCount');
    if (c) { c.textContent = n > 0 ? String(n) : ''; c.classList.toggle('is-hot', n > 0); }
  }

  function refreshPendingCount(){
    authRequest('/api/admin/invite-requests', 'GET').then(function(res){
      if (res.ok && Array.isArray(res.data.requests)) setPendingCount(res.data.requests.length);
    }).catch(function(){});
  }

  function renderReview(){
    var list = $('adminReviewList');
    if (!list) return;
    list.textContent = '';
    list.appendChild(el('div', 'auth-empty', '加载中'));
    authRequest('/api/admin/invite-requests', 'GET').then(function(res){
      list.textContent = '';
      if (!res.ok) { list.appendChild(el('div', 'auth-empty', res.data.error || '加载失败')); return; }
      var reqs = res.data.requests || [];
      setPendingCount(reqs.length);
      if (!reqs.length) { list.appendChild(el('div', 'auth-empty', '暂无待审核')); return; }
      reqs.forEach(function(r){
        var c = el('div', 'auth-card');
        var meta = el('div', 'auth-card-meta');
        meta.appendChild(el('strong', '', r.qq_number));
        meta.appendChild(el('span', '', fmtTime(r.created_at)));
        var actions = el('div', 'auth-card-actions');
        var no = el('button', 'auth-mini', '拒绝'); no.type = 'button';
        var yes = el('button', 'auth-mini is-primary', '通过'); yes.type = 'button';
        no.addEventListener('click', function(){
          if (window.confirm('确定拒绝 ' + r.qq_number + '？')) reviewRequest(r, false, [no, yes]);
        });
        yes.addEventListener('click', function(){ reviewRequest(r, true, [no, yes]); });
        actions.appendChild(no); actions.appendChild(yes);
        c.appendChild(meta); c.appendChild(actions);
        list.appendChild(c);
      });
    }).catch(function(){
      list.textContent = '';
      list.appendChild(el('div', 'auth-empty', '网络连接失败'));
    });
  }

  function reviewRequest(r, approve, btns){
    btns.forEach(function(b){ b.disabled = true; });
    authRequest('/api/admin/invite-requests/' + (approve ? 'approve' : 'reject'), 'POST', { requestId: r.id }).then(function(res){
      say(res.ok ? (approve ? '已发放' : '已拒绝') : (res.data.error || '操作失败'));
      renderReview();
    }).catch(function(){ say('网络连接失败'); btns.forEach(function(b){ b.disabled = false; }); });
  }

  function bindPanels(){
    var inviteRow = $('inviteRow'), reviewRow = $('adminReviewRow'), refresh = $('adminReviewRefresh');
    if (inviteRow) inviteRow.addEventListener('click', function(){ switchSettingsPanel('invite'); renderInvite(); });
    if (reviewRow) reviewRow.addEventListener('click', function(){ switchSettingsPanel('adminReview'); renderReview(); });
    if (refresh) refresh.addEventListener('click', renderReview);
    var devRow = $('devicesRow');
    if (devRow) devRow.addEventListener('click', function(){ switchSettingsPanel('devices'); renderDevices(); });
    Array.prototype.forEach.call(document.querySelectorAll('.js-auth-back'), function(b){
      b.addEventListener('click', function(){ switchSettingsPanel('main'); });
    });
  }

  function logout(){
    var s = readSession();
    if (s && s.token) request(AUTH_CONFIG.PATHS.logout, 'POST', null, s.token).catch(function(){});
    clearSession();
    applyRole();
    els.qq.value = ''; els.pwd.value = ''; els.invite.value = '';
    openGate();
  }

  els.reqBtn.addEventListener('click', requestInvite);
  els.qq.addEventListener('input', syncReqButton);
  setInterval(function(){
    var r = readReq();
    if (gate.classList.contains('is-open') && mode === 'register' && r && !r.code) checkReq(true);
  }, 8000);
  els.tabLogin.addEventListener('click', function(){ setMode('login'); });
  els.tabRegister.addEventListener('click', function(){ setMode('register'); });
  els.form.addEventListener('submit', function(e){ e.preventDefault(); submit(); });
  els.eye.addEventListener('click', function(){
    var show = els.pwd.type === 'password';
    els.pwd.type = show ? 'text' : 'password';
    els.eye.classList.toggle('is-on', show);
  });

  var logoutRow = document.getElementById('logoutRow');
  if (logoutRow) logoutRow.addEventListener('click', function(){
    if (window.confirm('确定退出登录？')) logout();
  });

  window.IslandAuth = { logout: logout, session: readSession };

  document.addEventListener('visibilitychange', function(){
    if (document.visibilityState !== 'visible') return;
    var cur = readSession();
    if (cur && cur.token && !gate.classList.contains('is-open')) verifySession(cur);
  });
  bindPanels();
  applyRole();
  var session = readSession();
  if (session && session.token) verifySession(session);
  else openGate();
})();
