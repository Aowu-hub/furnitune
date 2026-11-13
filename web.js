// YR FurniTune — GitHub app bridge (round 36). Loaded in <head> before App.html's script.
// window.FT_WEB.call(fn, args) sends a server call to the Apps Script web door (POST, text/plain JSON = no CORS preflight)
// with this device's session. No session yet → "Sign in with Google" card → Google ID token → door checks it + the Members
// list → 60-day session kept in localStorage. Also: offline helper (sw.js) + a "new version ready" card.
(function () {
  'use strict';
  var C = window.FT_CONFIG || {};
  var SKEY = 'ft-session';
  var session = '';
  try { session = localStorage.getItem(SKEY) || ''; } catch (e) { session = ''; }
  var waiting = null;          // one sign-in shared by every call that needs it

  function store(s) { session = s || ''; try { if (s) localStorage.setItem(SKEY, s); else localStorage.removeItem(SKEY); } catch (e) {} }

  function post(body) {
    return fetch(C.door, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), redirect: 'follow', credentials: 'omit' })
      .catch(function () { throw new Error(navigator.onLine === false ? 'No internet connection. Check the Wi-Fi and try again.' : 'Could not reach Google. Please try again.'); })
      .then(function (r) {
        if (!r.ok) throw new Error('Google answered ' + r.status + '. Please try again in a moment.');
        return r.text();
      })
      .then(function (t) {
        try { return JSON.parse(t); } catch (e) { throw new Error('The server sent an unexpected answer. Please reload the page.'); }
      });
  }

  function call(fn, args, again) {
    return ensureSession().then(function () {
      return post({ op: 'call', fn: fn, args: args || [], session: session });
    }).then(function (j) {
      if (j && j.ok) {
        var r = j.result;
        // the list no longer has this account: forget it, so "Reload" offers the sign-in again
        if (fn === 'apiBootstrap' && r && r.error && /^(NOT_MEMBER|NO_EMAIL)/.test(r.error)) store('');
        return r;
      }
      var err = String((j && j.error) || 'Unknown error');
      if (/^SIGNED_OUT/.test(err) && !again) { store(''); return call(fn, args, true); }
      throw new Error(err.replace(/^[A-Z_]+:\s*/, ''));
    });
  }

  function ensureSession() {
    if (session) return Promise.resolve();
    if (!waiting) waiting = new Promise(showSignIn).then(function () { waiting = null; });
    return waiting;
  }

  // ---------- sign-in card ----------
  var CSS = '#ftSign{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:24px;' +
    'background:#113866;background-image:linear-gradient(rgba(255,255,255,.07) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.07) 1px,transparent 1px);' +
    'background-size:96px 96px;font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans Thai",sans-serif}' +
    '#ftSign .c{width:100%;max-width:400px;background:#fbf8f0;color:#1d2733;border-radius:18px;padding:26px 24px 22px;box-shadow:0 24px 60px rgba(0,0,0,.35)}' +
    '#ftSign .b{display:flex;align-items:center;gap:14px;margin-bottom:16px}#ftSign img{width:56px;height:56px;border-radius:13px}' +
    '#ftSign h1{font-size:1.4rem;margin:0;line-height:1.2}#ftSign p{margin:0 0 14px;color:#5d6b7c;font-size:.95rem}' +
    '#ftSign .g{min-height:44px;display:flex;justify-content:center}#ftSign .m{margin:14px 0 0;padding:10px 12px;border-radius:10px;font-size:.92rem;display:none}' +
    '#ftSign .m.err{display:block;background:#fff1ee;color:#8a2b1b}#ftSign .m.wait{display:block;background:#eef3fa;color:#113866}' +
    '#ftSign small{display:block;margin-top:14px;color:#8a95a3;font-size:.78rem;text-align:center}';

  function showSignIn(resolve) {
    var el = document.getElementById('ftSign');
    if (!el) {
      var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
      el = document.createElement('div'); el.id = 'ftSign'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Sign in');
      el.innerHTML = '<div class="c"><div class="b"><img src="icons/icon-192.png" alt=""><div><h1>YR FurniTune</h1></div></div>' +
        '<p>Sign in with your Google account to open the family plans.</p><div class="g" id="ftG"></div>' +
        '<div class="m" id="ftM"></div><small>Only family members on the app\'s list can open it.</small></div>';
      (document.body || document.documentElement).appendChild(el);
    }
    el.style.display = 'flex';
    var msg = function (cls, text) { var m = document.getElementById('ftM'); m.className = 'm ' + cls; m.textContent = text; };
    if (!C.clientId) { msg('err', 'Setup needed: the Google sign-in client is missing (GOOGLE_CLIENT_ID).'); return; }
    var onCred = function (resp) {
      msg('wait', 'Checking your account…');
      post({ op: 'signin', idToken: resp && resp.credential }).then(function (j) {
        if (!j || !j.ok) {
          var e = String((j && j.error) || '');
          if (/^NOT_MEMBER:/.test(e)) msg('err', e.split(':')[1] + ' is not on the family list yet. Ask the owner to add it under Family members, or sign in with another account.');
          else msg('err', e.replace(/^[A-Z_]+:\s*/, '') || 'Sign-in failed. Please try again.');
          return;
        }
        store(j.result.session);
        el.style.display = 'none';
        resolve();
      }, function (e) { msg('err', e.message); });
    };
    loadGis(function () {
      try {
        google.accounts.id.initialize({ client_id: C.clientId, callback: onCred, auto_select: true, itp_support: true, use_fedcm_for_prompt: true, context: 'signin' });
        google.accounts.id.renderButton(document.getElementById('ftG'), { theme: 'filled_blue', size: 'large', shape: 'pill', text: 'signin_with', width: 280 });
        google.accounts.id.prompt();
      } catch (e) { msg('err', 'Google sign-in could not start: ' + e.message); }
    }, function () { msg('err', navigator.onLine === false ? 'No internet connection. Connect and reload.' : 'Google sign-in could not load. Please reload.'); });
  }

  function loadGis(ok, fail) {
    if (window.google && google.accounts && google.accounts.id) return ok();
    var s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
    s.onload = ok; s.onerror = fail; document.head.appendChild(s);
  }

  function signOut() {
    var s = session; store('');
    var done = function () { try { if (window.google && google.accounts && google.accounts.id) google.accounts.id.disableAutoSelect(); } catch (e) {} location.reload(); };
    if (s) post({ op: 'signout', session: s }).then(done, done); else done();
  }

  // ---------- offline helper + "new version ready" card ----------
  function updateCard(reg) {
    if (document.getElementById('ftUpd')) return;
    var b = document.createElement('button'); b.id = 'ftUpd'; b.type = 'button';
    b.textContent = '🆕 New version ready — tap to update';
    b.style.cssText = 'position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:2147482000;border:0;border-radius:999px;' +
      'padding:12px 20px;background:#113866;color:#fbf8f0;font:600 15px system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.3);cursor:pointer';
    b.onclick = function () { b.textContent = 'Updating…'; if (reg.waiting) reg.waiting.postMessage('skipWaiting'); else location.reload(); };
    document.body.appendChild(b);
  }
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').then(function (reg) {
        var watch = function (w) { if (!w) return; w.addEventListener('statechange', function () { if (w.state === 'installed' && navigator.serviceWorker.controller) updateCard(reg); }); };
        if (reg.waiting && navigator.serviceWorker.controller) updateCard(reg);
        watch(reg.installing); reg.addEventListener('updatefound', function () { watch(reg.installing); });
        setInterval(function () { reg.update().catch(function () {}); }, 30 * 60 * 1000);
      }).catch(function () {});
      var reloaded = false;
      navigator.serviceWorker.addEventListener('controllerchange', function () { if (document.getElementById('ftUpd') && !reloaded) { reloaded = true; location.reload(); } });
    });
  }

  window.FT_WEB = { call: call, signOut: signOut, version: C.version || '' };
})();
