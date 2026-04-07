(function () {
  var SESSION_KEY = 'fieldnotes_admin_auth';
  var PW_HASH     = '81c3b19ff0ba6d89f7c93a8836624e32ed5ea639f63fdc6a9f23813469d29e3d';

  if (sessionStorage.getItem(SESSION_KEY) === 'ok') return;

  // Block the page until authenticated
  var overlay = document.createElement('div');
  overlay.id  = 'admin-auth-overlay';
  overlay.innerHTML =
    '<div id="admin-auth-box">' +
      '<div id="admin-auth-title">Admin Access</div>' +
      '<form id="admin-auth-form">' +
        '<input id="admin-auth-pw" type="password" placeholder="Password" autocomplete="current-password">' +
        '<button type="submit">Enter</button>' +
      '</form>' +
      '<div id="admin-auth-error"></div>' +
    '</div>';

  var style = document.createElement('style');
  style.textContent =
    '#admin-auth-overlay{position:fixed;inset:0;z-index:9999;background:var(--bg,#0d1117);' +
    'display:flex;align-items:center;justify-content:center}' +
    '#admin-auth-box{background:var(--surface,#161b22);border:1px solid var(--border-soft,#30363d);' +
    'border-radius:10px;padding:40px 36px;width:100%;max-width:340px;text-align:center}' +
    '#admin-auth-title{font-size:1.05rem;font-weight:700;letter-spacing:.04em;margin-bottom:24px;' +
    'color:var(--text,#e6edf3)}' +
    '#admin-auth-form{display:flex;gap:8px}' +
    '#admin-auth-pw{flex:1;padding:8px 12px;border:1px solid var(--border-soft,#30363d);' +
    'border-radius:6px;background:var(--bg,#0d1117);color:var(--text,#e6edf3);font-size:0.9rem}' +
    '#admin-auth-form button{padding:8px 16px;background:var(--accent,#58a6ff);color:#fff;' +
    'border:none;border-radius:6px;cursor:pointer;font-size:0.9rem;font-weight:600}' +
    '#admin-auth-error{margin-top:12px;font-size:0.78rem;color:#f85149;min-height:1em}';

  document.head.appendChild(style);
  document.body.appendChild(overlay);
  document.getElementById('admin-auth-pw').focus();

  document.getElementById('admin-auth-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var pw = document.getElementById('admin-auth-pw').value;
    var buf = new TextEncoder().encode(pw);
    crypto.subtle.digest('SHA-256', buf).then(function (hashBuf) {
      var hex = Array.from(new Uint8Array(hashBuf))
        .map(function (b) { return b.toString(16).padStart(2, '0'); })
        .join('');
      if (hex === PW_HASH) {
        sessionStorage.setItem(SESSION_KEY, 'ok');
        overlay.remove();
        style.remove();
      } else {
        document.getElementById('admin-auth-error').textContent = 'Incorrect password.';
        document.getElementById('admin-auth-pw').value = '';
        document.getElementById('admin-auth-pw').focus();
      }
    });
  });
}());
