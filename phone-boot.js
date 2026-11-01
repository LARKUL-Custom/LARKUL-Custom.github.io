// Starts the phone app: installs the service worker that keeps the app offline and answers the
// hub's /api/ on the phone (sw.js), then loads the normal hub page and adds the phone's own menu.
const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function fatal(text) {
  document.body.innerHTML = `<div style="padding:24px;font:16px system-ui;max-width:520px">${text}</div>`;
}

if (!('serviceWorker' in navigator) || !window.indexedDB) {
  fatal('<h2>This browser can\'t run the hub offline</h2><p>Open this page in Safari on iPhone or Chrome on Android.</p>');
  throw new Error('No service worker support');
}

// The first visit downloads the whole app for offline use before anything else can run.
let first = !navigator.serviceWorker.controller;
if (first) {
  const box = document.createElement('div');
  box.id = 'phone-installing';
  box.style.cssText = 'position:fixed;inset:0;z-index:99;display:grid;place-items:center;background:var(--bg, #f5f6f8);font:16px system-ui;text-align:center;padding:24px';
  box.innerHTML = '<div><div style="font-size:40px">⏳</div><p><strong>Setting up the hub on this phone…</strong></p><p class="muted">This downloads everything once, so it works with no signal later.</p></div>';
  document.body.append(box);
}
try {
  await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  if (!navigator.serviceWorker.controller) {
    await new Promise((resolve) => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
  }
} catch (err) {
  fatal(`<h2>The hub couldn't set itself up</h2><p>${esc(err.message)}</p><p>Check the internet connection and open the page again.</p>`);
  throw err;
}
$('#phone-installing')?.remove();

// Ask the phone to keep the hub's data even when space runs low (Safari decides by itself).
navigator.storage?.persist?.().catch(() => {});

await import('/app.js');

// A new version arrived in the background (the phone checks each time the app opens).
navigator.serviceWorker.addEventListener('controllerchange', () => {
  if (first) { first = false; return; }
  const box = $('#app-update');
  box.hidden = false;
  box.innerHTML = '<div><strong>Update ready</strong><br>A new version of the hub is on this phone.</div><button class="btn primary small" id="phone-reload">Restart the hub</button>';
  $('#phone-reload').onclick = () => location.reload();
});
first = false;

// iPhone keeps a home-screen app running in the background, so "each time it opens" can be days apart.
// Check again whenever the app comes back to the front, at most every 10 minutes, and on request.
const reg = await navigator.serviceWorker.getRegistration();
let lastCheck = Date.now();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || Date.now() - lastCheck < 10 * 60 * 1000) return;
  lastCheck = Date.now();
  reg?.update().catch(() => {});
});

async function checkForUpdate(btn) {
  if (btn) { btn.disabled = true; btn.textContent = 'Checking…'; }
  try {
    lastCheck = Date.now();
    await reg.update();
    const next = reg.installing || reg.waiting;
    if (!next) {
      toast('You have the newest version.');
    } else {
      toast('Downloading the update…');
      await new Promise((resolve) => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
      location.reload();
      return;
    }
  } catch (err) {
    toast(navigator.onLine ? `Couldn't check for updates: ${err.message}` : 'No internet connection. Try again with signal.', 'error');
  }
  if (btn) { btn.disabled = false; btn.textContent = 'Check for updates'; }
}

// The newest version online, read from the start of the live sw.js (build.mjs writes it there).
async function onlineBuild() {
  const res = await fetch('/sw.js', { cache: 'no-store' });
  if (!res.ok) throw new Error(`the app's address answered ${res.status}`);
  const m = (await res.text()).match(/^self\.__BUILD__ = (.*);$/m);
  if (!m) throw new Error('the online app looks different than expected');
  return JSON.parse(m[1]);
}

// Throws away the app saved on this phone and downloads it fresh. The data (jobs, files,
// settings) is in IndexedDB, which this leaves alone. It first makes sure the new copy can be
// downloaded, so a phone with no signal isn't left without its app.
async function forceUpdate(btn) {
  btn.disabled = true;
  btn.textContent = 'Reinstalling…';
  try {
    await onlineBuild();
    for (const key of await caches.keys()) if (key.startsWith('hub-phone-')) await caches.delete(key);
    await reg?.unregister();
    location.reload();
  } catch (err) {
    toast(navigator.onLine ? `Couldn't reinstall: ${err.message}` : 'No internet connection. Try again with signal.', 'error');
    btn.disabled = false;
    btn.textContent = 'Force update';
  }
}

function when(iso) {
  return iso ? new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '?';
}

async function updatesDialog() {
  const info = await fetch('/api/info').then((r) => r.json());
  const d = $('#dialog');
  d.innerHTML = `
    <form method="dialog" class="updates-dialog">
      <h2>Updates</h2>
      <p style="margin-bottom:4px"><strong>On this phone:</strong> ${esc(info.phoneVersion)}<br><span class="muted">made ${esc(when(info.built))}</span></p>
      <p style="margin-top:4px" id="up-online"><strong>Online:</strong> <span class="muted">checking…</span></p>
      <div class="row">
        <button class="btn primary" type="button" id="up-check">Check for updates</button>
        <button class="btn" type="button" id="up-force">Force update</button>
      </div>
      <p class="muted" style="font-size:13px"><strong>Force update</strong> deletes the app saved on this phone and downloads it again, even if it says it's up to date. Use it if something looks stuck or old. Your jobs, files and settings stay. It needs signal.</p>
      <div class="dialog-actions"><button class="btn" value="close">Done</button></div>
    </form>`;
  d.onclose = null;
  d.showModal();
  $('#up-check', d).onclick = (e) => checkForUpdate(e.target);
  $('#up-force', d).onclick = (e) => forceUpdate(e.target);
  try {
    const online = await onlineBuild();
    const same = online.version === info.phoneVersion;
    $('#up-online', d).innerHTML = `<strong>Online:</strong> ${esc(online.version)}<br><span class="muted">made ${esc(when(online.built))}${same ? ' · you have it' : ' · newer than this phone'}</span>`;
  } catch (err) {
    $('#up-online', d).innerHTML = `<strong>Online:</strong> <span class="muted">${navigator.onLine ? `couldn't check (${esc(err.message)})` : 'no internet connection'}</span>`;
  }
}

// ---- extensions made for a computer screen ----------------------------------------------
// Cabinet Designer looks and works like it does on the PC only in a window at least about 1100 wide
// and 600 tall. While it is open, the phone shows the page at a computer's width (the browser's own
// zoom, as "desktop site" does), so it is the same designer as on the PC; turn the phone sideways for
// a bigger view. The browser's own zoom keeps touches and pinches reliable, which scaling the frame
// with CSS did not on iPhone. The hub's menu folds away to the ☰ tab on the left edge meanwhile.
const DESKTOP_SIZED = new Set(['cabinet-designer']);
const DESK_W = 1100;
const DESK_H = 600;
const viewportMeta = document.querySelector('meta[name="viewport"]');
const phoneViewport = viewportMeta?.getAttribute('content') || 'width=device-width, initial-scale=1';
let deskView = false;
let menuWasHidden = false;
function applyDeskView() {
  const id = location.hash.match(/^#\/ext\/([^/?]+)/)?.[1];
  const long = Math.max(screen.width, screen.height), short = Math.min(screen.width, screen.height);
  const [sw, sh] = matchMedia('(orientation: landscape)').matches ? [long, short] : [short, long];
  const want = DESKTOP_SIZED.has(id) && (sw < DESK_W || sh - 60 < DESK_H);
  if (want) {
    // Wide enough that the frame is also tall enough for that layout (the hub's bar takes about 60).
    const w = Math.ceil(Math.max(DESK_W, (DESK_H + 60) * sw / sh));
    viewportMeta?.setAttribute('content', `width=${w}, viewport-fit=cover`);
    if (!deskView) {
      menuWasHidden = document.body.classList.contains('nav-hidden');
      document.body.classList.add('nav-hidden', 'desk-view');
    }
  } else if (deskView) {
    viewportMeta?.setAttribute('content', phoneViewport);
    document.body.classList.remove('desk-view');
    document.body.classList.toggle('nav-hidden', menuWasHidden);
  }
  deskView = want;
}
addEventListener('hashchange', applyDeskView);
addEventListener('orientationchange', () => setTimeout(applyDeskView, 200));
applyDeskView();

// ---- the phone's menu: backup and storage ------------------------------------------------

const navSection = $('#sign-out').parentElement;
const item = document.createElement('a');
item.className = 'nav-item';
item.href = '#';
item.innerHTML = '<span class="nav-icon">💾</span><span>Backup &amp; settings</span>';
item.onclick = (e) => {
  e.preventDefault();
  document.body.classList.remove('menu-open');
  backupDialog();
};
navSection.prepend(item);

const updItem = document.createElement('a');
updItem.className = 'nav-item';
updItem.href = '#';
updItem.innerHTML = '<span class="nav-icon">🔄</span><span>Updates</span>';
updItem.onclick = (e) => {
  e.preventDefault();
  document.body.classList.remove('menu-open');
  updatesDialog();
};
item.after(updItem);

function formatSize(n) {
  if (n == null) return '?';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(i && n < 10 ? 1 : 0)} ${units[i]}`;
}

function toast(msg, type = '') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  $('#toasts').append(el);
  setTimeout(() => el.remove(), 5000);
}

async function backupDialog() {
  const get = (url) => fetch(url).then((r) => r.json());
  const [u, info, claude] = await Promise.all([get('/api/backup/usage'), get('/api/info'), get('/api/phone/claude-key')]);
  const d = $('#dialog');
  d.innerHTML = `
    <form method="dialog" class="backup-dialog">
      <h2>Backup &amp; settings</h2>
      <p class="muted" style="margin-top:0">Everything in this app lives on this phone only. Make a backup now and then, and before getting a new phone.</p>
      <p><strong>${u.files}</strong> file${u.files === 1 ? '' : 's'} (${formatSize(u.bytes)}) · ${u.used != null ? `${formatSize(u.used)} used of ${formatSize(u.quota)} this app may use` : ''}</p>
      ${u.persisted === false ? '<p class="muted">Tip: on iPhone, keep the hub on your home screen. Safari can clear data for sites you only open in the browser.</p>' : ''}
      <div class="row">
        <button class="btn primary" type="button" id="bk-export">Save a backup</button>
        <label class="btn">Restore a backup…<input type="file" id="bk-import" accept=".zip,application/zip" hidden></label>
      </div>
      <label class="toggle"><input type="checkbox" id="bk-replace"> When restoring, clear this phone first (otherwise the backup is added and replaces matching items)</label>
      <p class="muted" style="font-size:13px">A backup includes saved passwords and keys, so keep it somewhere private.</p>
      <h3 style="margin-bottom:4px">Claude</h3>
      <p class="muted" style="margin-top:0">Ask Claude in Scheduler and Ads needs an Anthropic API key on the phone (billed per use at console.anthropic.com). It stays on this phone.</p>
      <div class="row">
        <input id="ck-key" type="password" autocomplete="off" placeholder="${claude.saved ? 'A key is saved. Paste a new one to replace it.' : 'sk-ant-…'}" style="flex:1;min-width:0">
        <button class="btn" type="button" id="ck-save">Save</button>
        ${claude.saved ? '<button class="btn ghost" type="button" id="ck-remove">Remove</button>' : ''}
      </div>
      <div class="row" style="align-items:center">
        <span class="muted" style="font-size:12px;flex:1">Hub ${esc(info.version)} · phone app ${esc(info.phoneVersion)}</span>
        <button class="btn" type="button" id="bk-update">Updates…</button>
      </div>
      <div class="dialog-actions"><button class="btn" value="close">Done</button></div>
    </form>`;
  d.onclose = null;
  d.showModal();
  $('#bk-update', d).onclick = () => { d.close(); updatesDialog(); };

  const saveKey = async (key) => {
    const res = await fetch('/api/phone/claude-key', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key }) });
    const r = await res.json();
    if (!res.ok) return toast(r.error, 'error');
    toast(r.saved ? 'Claude key saved. Press Reload in a tab that was already open.' : 'Claude key removed.');
    d.close();
  };
  $('#ck-save', d).onclick = () => { const k = $('#ck-key', d).value.trim(); if (k) saveKey(k); };
  $('#ck-remove', d)?.addEventListener('click', () => saveKey(''));

  $('#bk-export', d).onclick = async (e) => {
    e.target.disabled = true;
    e.target.textContent = 'Making the backup…';
    try {
      const res = await fetch('/api/backup/export');
      if (!res.ok) throw new Error((await res.json()).error);
      const name = (res.headers.get('content-disposition') || '').match(/filename="([^"]+)"/)?.[1] || 'Hub backup.zip';
      const file = new File([await res.blob()], name, { type: 'application/zip' });
      // On iPhone the share sheet has "Save to Files" and AirDrop.
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: name }).catch((err) => { if (err.name !== 'AbortError') throw err; });
      } else {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(file);
        a.download = name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 60000);
      }
    } catch (err) {
      toast(err.message, 'error');
    }
    e.target.disabled = false;
    e.target.textContent = 'Save a backup';
  };

  $('#bk-import', d).onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const replace = $('#bk-replace', d).checked;
    try {
      const res = await fetch(`/api/backup/import?mode=${replace ? 'replace' : 'merge'}`, { method: 'POST', body: file });
      const r = await res.json();
      if (!res.ok) throw new Error(r.error);
      d.close();
      toast(`Restored ${r.files} file${r.files === 1 ? '' : 's'} and ${r.settings} saved item${r.settings === 1 ? '' : 's'}. Restarting…`);
      setTimeout(() => location.reload(), 1500);
    } catch (err) {
      toast(err.message, 'error');
    }
  };
}
