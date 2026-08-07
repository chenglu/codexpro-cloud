const styles = String.raw`
:root {
  color-scheme: light;
  --ink: #18201f;
  --muted: #5f6b68;
  --line: #d8dfdc;
  --panel: #ffffff;
  --canvas: #f4f7f5;
  --brand: #087a5b;
  --brand-hover: #066248;
  --focus: #1769aa;
  --danger: #b42318;
  --warning: #8a5a00;
  --ok-bg: #e9f6ef;
  --error-bg: #fff0ee;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
* { box-sizing: border-box; }
body { margin: 0; min-width: 320px; background: var(--canvas); color: var(--ink); }
button, input, select { font: inherit; letter-spacing: 0; }
button, input, select { border-radius: 6px; }
button { cursor: pointer; }
a { color: var(--focus); }
.shell { width: min(860px, calc(100% - 32px)); margin: 0 auto; padding: 30px 0 48px; }
.topbar { display: flex; align-items: center; justify-content: space-between; gap: 20px; margin-bottom: 28px; }
.brand { display: flex; align-items: center; gap: 12px; min-width: 0; }
.mark { display: grid; place-items: center; width: 38px; height: 38px; border-radius: 7px; background: var(--ink); color: white; font-weight: 800; }
.brand strong { display: block; font-size: 18px; }
.brand span { color: var(--muted); font-size: 13px; }
.language { display: inline-flex; border: 1px solid var(--line); border-radius: 7px; overflow: hidden; flex: 0 0 auto; }
.language button { min-width: 46px; border: 0; border-radius: 0; padding: 7px 10px; background: white; color: var(--muted); }
.language button[aria-pressed="true"] { background: var(--ink); color: white; }
.panel { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 28px; }
.panel + .panel { margin-top: 16px; }
.heading { margin: 0 0 7px; font-size: 27px; line-height: 1.2; letter-spacing: 0; }
.lede { margin: 0 0 26px; max-width: 680px; color: var(--muted); line-height: 1.55; }
.section-title { margin: 28px 0 14px; padding-top: 24px; border-top: 1px solid var(--line); font-size: 16px; }
.form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; }
.full { grid-column: 1 / -1; }
label.field { display: grid; gap: 7px; min-width: 0; }
.label { font-size: 14px; font-weight: 700; }
.hint { color: var(--muted); font-size: 12px; line-height: 1.45; }
input, select { width: 100%; min-height: 43px; border: 1px solid #b8c3bf; background: white; color: var(--ink); padding: 9px 11px; }
input:focus, select:focus, button:focus-visible { outline: 3px solid rgba(23, 105, 170, .2); outline-offset: 1px; border-color: var(--focus); }
.modes { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.mode { position: relative; display: block; min-width: 0; }
.mode input { position: absolute; opacity: 0; pointer-events: none; }
.mode-body { display: block; min-height: 96px; border: 1px solid var(--line); border-radius: 7px; padding: 13px; background: white; }
.mode-title { display: block; margin-bottom: 5px; font-weight: 750; }
.mode-copy { display: block; color: var(--muted); font-size: 12px; line-height: 1.4; }
.mode input:checked + .mode-body { border-color: var(--brand); box-shadow: inset 0 0 0 1px var(--brand); background: #f0faf6; }
.mode input:focus-visible + .mode-body { outline: 3px solid rgba(23, 105, 170, .2); }
.actions { display: flex; align-items: center; justify-content: flex-end; gap: 12px; margin-top: 24px; }
.primary, .secondary, .danger { min-height: 42px; border: 1px solid transparent; padding: 9px 16px; font-weight: 700; }
.primary { background: var(--brand); color: white; }
.primary:hover { background: var(--brand-hover); }
.secondary { background: white; color: var(--ink); border-color: var(--line); }
.danger { background: white; color: var(--danger); border-color: #e4aaa4; }
button:disabled { cursor: wait; opacity: .62; }
.notice { display: none; margin-top: 18px; border-radius: 7px; padding: 12px 14px; font-size: 14px; line-height: 1.45; }
.notice.show { display: block; }
.notice.error { background: var(--error-bg); color: var(--danger); border: 1px solid #f0c3be; }
.notice.ok { background: var(--ok-bg); color: #075b43; border: 1px solid #b9dfcb; }
.success { display: none; }
.success.show { display: block; }
.secret-output { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; align-items: stretch; margin: 12px 0; }
.secret-output code { display: block; min-width: 0; overflow-wrap: anywhere; border: 1px solid var(--line); border-radius: 6px; background: #f8faf9; padding: 11px 12px; font: 13px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace; }
.secret-output button { min-width: 74px; border: 1px solid var(--line); background: white; font-weight: 700; }
.footnote { margin: 20px 0 0; color: var(--muted); font-size: 12px; line-height: 1.5; }
.login-panel { width: min(460px, 100%); margin: 70px auto 0; }
.stack { display: grid; gap: 16px; }
.status-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); border: 1px solid var(--line); border-radius: 7px; overflow: hidden; }
.status-item { padding: 14px; background: #fafcfb; }
.status-item + .status-item { border-left: 1px solid var(--line); }
.status-label { display: block; color: var(--muted); font-size: 12px; }
.status-value { display: block; margin-top: 5px; font-weight: 750; overflow-wrap: anywhere; }
.dot { display: inline-block; width: 8px; height: 8px; margin-right: 7px; border-radius: 50%; background: #9aa5a1; }
.dot.ok { background: #0a8f66; }
.dot.bad { background: var(--danger); }
.toolbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.toolbar h1 { margin: 0; font-size: 24px; }
.toolbar-actions { display: flex; gap: 8px; }
.setting-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(220px, 280px) auto; align-items: end; gap: 12px; }
[data-lang-copy] { display: none; }
html[data-language="zh"] [data-lang-copy="zh"], html[data-language="en"] [data-lang-copy="en"] { display: revert; }
@media (max-width: 680px) {
  .shell { width: min(100% - 20px, 860px); padding-top: 18px; }
  .panel { padding: 20px; }
  .topbar { align-items: flex-start; }
  .heading { font-size: 23px; }
  .form-grid, .modes, .status-grid { grid-template-columns: 1fr; }
  .status-item + .status-item { border-left: 0; border-top: 1px solid var(--line); }
  .mode-body { min-height: 0; }
  .setting-row { grid-template-columns: 1fr; align-items: stretch; }
  .actions, .toolbar { align-items: stretch; flex-direction: column; }
  .toolbar-actions { width: 100%; }
  .toolbar-actions button { flex: 1; }
  .secret-output { grid-template-columns: 1fr; }
  .secret-output button { min-height: 40px; }
}
`;

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function documentShell({ title, body, script = '' }) {
  return `<!doctype html>
<html lang="zh-CN" data-language="zh">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="referrer" content="no-referrer">
  <title>${escapeHtml(title)}</title>
  <style>${styles}</style>
</head>
<body>${body}<script>${languageScript()}${script}</script></body>
</html>`;
}

function languageScript() {
  return String.raw`
function setLanguage(language) {
  var next = language === 'en' ? 'en' : 'zh';
  document.documentElement.dataset.language = next;
  document.documentElement.lang = next === 'zh' ? 'zh-CN' : 'en';
  try { localStorage.setItem('codexpro-cloud-language', next); } catch (_) {}
  document.querySelectorAll('[data-language-button]').forEach(function (button) {
    button.setAttribute('aria-pressed', String(button.dataset.languageButton === next));
  });
}
document.querySelectorAll('[data-language-button]').forEach(function (button) {
  button.addEventListener('click', function () { setLanguage(button.dataset.languageButton); });
});
try { setLanguage(localStorage.getItem('codexpro-cloud-language') || 'zh'); } catch (_) { setLanguage('zh'); }
`;
}

function topbar(subtitleZh, subtitleEn) {
  return `<header class="topbar">
    <div class="brand"><div class="mark">CP</div><div><strong>CodexPro Cloud</strong><span data-lang-copy="zh">${escapeHtml(subtitleZh)}</span><span data-lang-copy="en">${escapeHtml(subtitleEn)}</span></div></div>
    <div class="language" aria-label="Language"><button type="button" data-language-button="zh" aria-pressed="true">中文</button><button type="button" data-language-button="en" aria-pressed="false">EN</button></div>
  </header>`;
}

export function setupPage() {
  const body = `<main class="shell">
    ${topbar('首次安装', 'First setup')}
    <section class="panel" id="setup-panel">
      <h1 class="heading"><span data-lang-copy="zh">连接你的云端工作区</span><span data-lang-copy="en">Connect your cloud workspace</span></h1>
      <p class="lede" data-lang-copy="zh">填完这一页后，容器会创建固定的 Cloudflare Tunnel，并生成 ChatGPT 可直接使用的 MCP 地址。</p>
      <p class="lede" data-lang-copy="en">This creates a stable Cloudflare Tunnel and a private MCP URL ready for ChatGPT.</p>
      <form id="setup-form">
        <div class="form-grid">
          <label class="field full"><span class="label"><span data-lang-copy="zh">安装码</span><span data-lang-copy="en">Installation code</span></span><input name="installationCode" autocomplete="one-time-code" required maxlength="128"><span class="hint"><span data-lang-copy="zh">来自容器日志。</span><span data-lang-copy="en">Printed in the container log.</span></span></label>
          <label class="field"><span class="label"><span data-lang-copy="zh">管理密码</span><span data-lang-copy="en">Admin password</span></span><input name="adminPassword" type="password" autocomplete="new-password" required minlength="12" maxlength="256"><span class="hint"><span data-lang-copy="zh">至少 12 个字符，仅用于本地管理页。</span><span data-lang-copy="en">At least 12 characters, used only by the local admin page.</span></span></label>
          <label class="field"><span class="label"><span data-lang-copy="zh">确认管理密码</span><span data-lang-copy="en">Confirm admin password</span></span><input name="adminPasswordConfirm" type="password" autocomplete="new-password" required minlength="12" maxlength="256"><span class="hint"><span data-lang-copy="zh">再次输入同一个密码。</span><span data-lang-copy="en">Enter the same password again.</span></span></label>
          <label class="field full"><span class="label"><span data-lang-copy="zh">MCP 域名</span><span data-lang-copy="en">MCP hostname</span></span><input name="hostname" inputmode="url" autocomplete="off" placeholder="mcp.example.com" required maxlength="253"><span class="hint"><span data-lang-copy="zh">该域名必须属于当前 Cloudflare 账号，且尚未存在 DNS 记录。</span><span data-lang-copy="en">It must belong to this Cloudflare account and have no existing DNS record.</span></span></label>
          <label class="field"><span class="label"><span data-lang-copy="zh">Tunnel 名称（可选）</span><span data-lang-copy="en">Tunnel name (optional)</span></span><input name="tunnelName" autocomplete="off" maxlength="100" placeholder="codexpro-workspace"><span class="hint"><span data-lang-copy="zh">留空会自动生成。</span><span data-lang-copy="en">Leave blank to generate one.</span></span></label>
          <label class="field"><span class="label"><span data-lang-copy="zh">Cloudflare API Token</span><span data-lang-copy="en">Cloudflare API token</span></span><input name="cloudflareApiToken" type="password" autocomplete="off" required maxlength="4096"><span class="hint"><span data-lang-copy="zh">需要 Tunnel 编辑、DNS 编辑和 Zone 读取权限；不会保存。</span><span data-lang-copy="en">Requires Tunnel Edit, DNS Edit, and Zone Read; it is never saved.</span></span></label>
        </div>
        <h2 class="section-title"><span data-lang-copy="zh">工作区权限</span><span data-lang-copy="en">Workspace access</span></h2>
        <div class="modes" role="radiogroup">
          <label class="mode"><input type="radio" name="runtimeMode" value="readonly"><span class="mode-body"><span class="mode-title"><span data-lang-copy="zh">只读</span><span data-lang-copy="en">Read only</span></span><span class="mode-copy"><span data-lang-copy="zh">查看和分析代码，不修改文件，不运行命令。</span><span data-lang-copy="en">Inspect code without edits or commands.</span></span></span></label>
          <label class="mode"><input type="radio" name="runtimeMode" value="edit" checked><span class="mode-body"><span class="mode-title"><span data-lang-copy="zh">编辑</span><span data-lang-copy="en">Edit</span></span><span class="mode-copy"><span data-lang-copy="zh">允许修改文件，默认不运行命令。</span><span data-lang-copy="en">Allow file edits, with commands disabled.</span></span></span></label>
          <label class="mode"><input type="radio" name="runtimeMode" value="develop"><span class="mode-body"><span class="mode-title"><span data-lang-copy="zh">开发</span><span data-lang-copy="en">Develop</span></span><span class="mode-copy"><span data-lang-copy="zh">允许修改文件并运行受限命令。</span><span data-lang-copy="en">Allow edits and guarded commands.</span></span></span></label>
        </div>
        <div class="notice error" id="setup-error" role="alert"></div>
        <div class="actions"><button class="primary" id="setup-submit" type="submit"><span data-lang-copy="zh">创建并连接</span><span data-lang-copy="en">Create and connect</span></button></div>
      </form>
    </section>
    <section class="panel success" id="setup-success">
      <h1 class="heading"><span data-lang-copy="zh">连接已创建</span><span data-lang-copy="en">Connection created</span></h1>
      <p class="lede"><span data-lang-copy="zh">把下面的完整地址粘贴到 ChatGPT 的 MCP Server URL。</span><span data-lang-copy="en">Paste the complete URL below into ChatGPT as the MCP Server URL.</span></p>
      <div class="secret-output"><code id="server-url"></code><button type="button" data-copy-target="server-url"><span data-lang-copy="zh">复制</span><span data-lang-copy="en">Copy</span></button></div>
      <p class="footnote"><span data-lang-copy="zh">这个地址包含私密访问令牌。不要转发或截图。Cloudflare API Token 没有写入磁盘，现在可以在 Cloudflare 中撤销。</span><span data-lang-copy="en">This URL contains a private access token. Do not share or screenshot it. The Cloudflare API token was not written to disk and can now be revoked.</span></p>
    </section>
  </main>`;
  const script = String.raw`
document.querySelectorAll('[data-copy-target]').forEach(function (button) {
  button.addEventListener('click', async function () {
    var target = document.getElementById(button.dataset.copyTarget);
    await navigator.clipboard.writeText(target.textContent || '');
    var old = button.textContent;
    button.textContent = document.documentElement.dataset.language === 'zh' ? '已复制' : 'Copied';
    setTimeout(function () { button.textContent = old; }, 1400);
  });
});
document.getElementById('setup-form').addEventListener('submit', async function (event) {
  event.preventDefault();
  var form = event.currentTarget;
  var submit = document.getElementById('setup-submit');
  var errorBox = document.getElementById('setup-error');
  errorBox.classList.remove('show');
  submit.disabled = true;
  try {
    var data = new FormData(form);
    var response = await fetch('/api/setup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(Object.fromEntries(data.entries()))
    });
    var payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Setup failed.');
    document.getElementById('server-url').textContent = payload.serverUrl;
    document.getElementById('setup-panel').hidden = true;
    document.getElementById('setup-success').classList.add('show');
    history.replaceState(null, '', '/setup');
  } catch (error) {
    errorBox.textContent = error && error.message ? error.message : String(error);
    errorBox.classList.add('show');
  } finally {
    submit.disabled = false;
  }
});
`;
  return documentShell({ title: 'CodexPro Cloud Setup', body, script });
}

export function loginPage() {
  const body = `<main class="shell"><section class="panel login-panel">
    ${topbar('本地管理', 'Local admin')}
    <h1 class="heading"><span data-lang-copy="zh">管理工作区</span><span data-lang-copy="en">Manage workspace</span></h1>
    <p class="lede"><span data-lang-copy="zh">使用首次安装时设置的管理密码。</span><span data-lang-copy="en">Use the admin password created during first setup.</span></p>
    <form class="stack" id="login-form"><label class="field"><span class="label"><span data-lang-copy="zh">管理密码</span><span data-lang-copy="en">Admin password</span></span><input name="password" type="password" autocomplete="current-password" required maxlength="256"></label><div class="notice error" id="login-error" role="alert"></div><button class="primary" id="login-submit" type="submit"><span data-lang-copy="zh">登录</span><span data-lang-copy="en">Sign in</span></button></form>
  </section></main>`;
  const script = String.raw`
document.getElementById('login-form').addEventListener('submit', async function (event) {
  event.preventDefault();
  var submit = document.getElementById('login-submit');
  var errorBox = document.getElementById('login-error');
  errorBox.classList.remove('show');
  submit.disabled = true;
  try {
    var password = new FormData(event.currentTarget).get('password');
    var response = await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: password }) });
    var payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'Sign in failed.');
    location.replace('/admin');
  } catch (error) {
    errorBox.textContent = error && error.message ? error.message : String(error);
    errorBox.classList.add('show');
  } finally { submit.disabled = false; }
});
`;
  return documentShell({ title: 'CodexPro Cloud Admin', body, script });
}

export function dashboardPage(csrfToken) {
  const body = `<main class="shell">
    ${topbar('本地管理', 'Local admin')}
    <section class="panel">
      <div class="toolbar"><h1><span data-lang-copy="zh">工作区状态</span><span data-lang-copy="en">Workspace status</span></h1><div class="toolbar-actions"><button class="secondary" id="refresh" type="button"><span data-lang-copy="zh">刷新</span><span data-lang-copy="en">Refresh</span></button><button class="secondary" id="logout" type="button"><span data-lang-copy="zh">退出</span><span data-lang-copy="en">Sign out</span></button></div></div>
      <div class="status-grid" style="margin-top: 20px"><div class="status-item"><span class="status-label">CodexPro</span><span class="status-value" id="core-status"><span class="dot"></span>...</span></div><div class="status-item"><span class="status-label">MCP Gateway</span><span class="status-value" id="gateway-status"><span class="dot"></span>...</span></div><div class="status-item"><span class="status-label">Cloudflare</span><span class="status-value" id="public-status"><span class="dot"></span>...</span></div></div>
      <h2 class="section-title"><span data-lang-copy="zh">ChatGPT 连接地址</span><span data-lang-copy="en">ChatGPT connection URL</span></h2>
      <div class="secret-output"><code id="admin-server-url">...</code><button type="button" id="copy-url"><span data-lang-copy="zh">复制</span><span data-lang-copy="en">Copy</span></button></div>
      <div class="notice ok" id="admin-success" role="status"></div><div class="notice error" id="admin-error" role="alert"></div>
      <h2 class="section-title"><span data-lang-copy="zh">工作区权限</span><span data-lang-copy="en">Workspace access</span></h2>
      <div class="setting-row"><label class="field"><span class="label"><span data-lang-copy="zh">运行模式</span><span data-lang-copy="en">Runtime mode</span></span><select id="runtime-mode"><option value="readonly">Read only</option><option value="edit">Edit</option><option value="develop">Develop</option></select></label><span class="hint"><span data-lang-copy="zh">保存后内部服务会自动重启。</span><span data-lang-copy="en">Internal services restart automatically after saving.</span></span><button class="primary" id="save-mode" type="button"><span data-lang-copy="zh">保存</span><span data-lang-copy="en">Save</span></button></div>
      <h2 class="section-title"><span data-lang-copy="zh">访问令牌</span><span data-lang-copy="en">Access token</span></h2>
      <div class="setting-row"><div><strong><span data-lang-copy="zh">轮换 MCP 地址</span><span data-lang-copy="en">Rotate MCP URL</span></strong><div class="hint"><span data-lang-copy="zh">旧地址会立即失效，需要在 ChatGPT 中更新。</span><span data-lang-copy="en">The old URL stops working and must be replaced in ChatGPT.</span></div></div><span></span><button class="danger" id="rotate-token" type="button"><span data-lang-copy="zh">轮换</span><span data-lang-copy="en">Rotate</span></button></div>
    </section>
  </main>`;
  const script = String.raw`
var csrfToken = ${JSON.stringify(csrfToken)};
var lastStatus = null;
function statusText(ok) { return '<span class="dot ' + (ok ? 'ok' : 'bad') + '"></span>' + (ok ? 'Online' : 'Offline'); }
function showMessage(kind, message) {
  document.getElementById('admin-success').classList.remove('show');
  document.getElementById('admin-error').classList.remove('show');
  var box = document.getElementById(kind === 'ok' ? 'admin-success' : 'admin-error');
  box.textContent = message;
  box.classList.add('show');
}
async function api(path, options) {
  var next = options || {};
  next.headers = Object.assign({}, next.headers || {}, { 'x-csrf-token': csrfToken });
  var response = await fetch(path, next);
  var payload = await response.json();
  if (response.status === 401) { location.replace('/admin'); throw new Error('Session expired.'); }
  if (!response.ok) throw new Error(payload.error || 'Request failed.');
  return payload;
}
async function refreshStatus() {
  try {
    var payload = await api('/api/status');
    lastStatus = payload;
    document.getElementById('core-status').innerHTML = statusText(payload.services.codexpro);
    document.getElementById('gateway-status').innerHTML = statusText(payload.services.gateway);
    document.getElementById('public-status').innerHTML = statusText(payload.services.public);
    document.getElementById('admin-server-url').textContent = payload.serverUrl;
    document.getElementById('runtime-mode').value = payload.runtimeMode;
  } catch (error) { showMessage('error', error.message || String(error)); }
}
document.getElementById('refresh').addEventListener('click', refreshStatus);
document.getElementById('copy-url').addEventListener('click', async function () {
  await navigator.clipboard.writeText(document.getElementById('admin-server-url').textContent || '');
  showMessage('ok', document.documentElement.dataset.language === 'zh' ? '连接地址已复制。' : 'Connection URL copied.');
});
document.getElementById('save-mode').addEventListener('click', async function (event) {
  event.currentTarget.disabled = true;
  try {
    await api('/api/runtime', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ runtimeMode: document.getElementById('runtime-mode').value }) });
    showMessage('ok', document.documentElement.dataset.language === 'zh' ? '已保存，服务正在重启。' : 'Saved. The service is restarting.');
    setTimeout(refreshStatus, 1800);
  } catch (error) { showMessage('error', error.message || String(error)); }
  finally { event.currentTarget.disabled = false; }
});
document.getElementById('rotate-token').addEventListener('click', async function (event) {
  var prompt = document.documentElement.dataset.language === 'zh' ? '旧地址会立即失效。继续轮换？' : 'The old URL will stop working. Rotate it now?';
  if (!confirm(prompt)) return;
  event.currentTarget.disabled = true;
  try {
    var payload = await api('/api/token/rotate', { method: 'POST' });
    document.getElementById('admin-server-url').textContent = payload.serverUrl;
    showMessage('ok', document.documentElement.dataset.language === 'zh' ? '新地址已生成。' : 'A new URL was generated.');
    setTimeout(refreshStatus, 1800);
  } catch (error) { showMessage('error', error.message || String(error)); }
  finally { event.currentTarget.disabled = false; }
});
document.getElementById('logout').addEventListener('click', async function () {
  await api('/api/logout', { method: 'POST' });
  location.replace('/admin');
});
refreshStatus();
`;
  return documentShell({ title: 'CodexPro Cloud Admin', body, script });
}
