// Hub shell: tab routing, home dashboard, file library, extension frames.
const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

async function api(url, opts = {}) {
  const init = { ...opts };
  if (opts.json !== undefined) {
    init.body = JSON.stringify(opts.json);
    init.headers = { 'Content-Type': 'application/json' };
  }
  const res = await fetch(url, init);
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : await res.text();
  // On a phone whose sign-in ran out, go back to the PIN page.
  if (res.status === 401 && data?.signIn) location.href = '/login';
  if (!res.ok) throw new Error(data?.error || res.statusText);
  return data;
}

function toast(msg, type = '') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  $('#toasts').append(el);
  setTimeout(() => el.remove(), 4000);
}

function formatSize(n) {
  if (n == null) return '';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(i && n < 10 ? 1 : 0)} ${units[i]}`;
}

function formatDate(iso, withTime = true) {
  if (!iso) return '';
  const d = new Date(iso);
  const opts = { month: 'short', day: 'numeric' };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
  if (withTime && (d.getHours() || d.getMinutes())) Object.assign(opts, { hour: 'numeric', minute: '2-digit' });
  return d.toLocaleString(undefined, opts);
}

const FILE_ICONS = { pdf: '📕', doc: '📘', docx: '📘', xls: '📗', xlsx: '📗', csv: '📗', png: '🖼️', jpg: '🖼️', jpeg: '🖼️', gif: '🖼️', webp: '🖼️', mp4: '🎞️', mov: '🎞️', zip: '🗜️', txt: '📄', md: '📄' };
const fileIcon = (item) => (item.type === 'folder' ? '📁' : FILE_ICONS[item.name.split('.').pop().toLowerCase()] || '📄');

// ---- state ------------------------------------------------------------------

const state = {
  extensions: [],
  business: {},
  reminders: [],
  folder: '',
  frames: new Map(), // id -> element, kept alive so extensions keep their state between tabs
};

// ---- routing ----------------------------------------------------------------

function route() {
  const [, tab = 'home', ...rest] = location.hash.split('/');
  for (const v of document.querySelectorAll('.view')) v.hidden = true;
  for (const f of state.frames.values()) f.hidden = true;
  for (const a of document.querySelectorAll('.nav-item')) a.classList.remove('active');

  if (tab === 'ext') {
    const id = decodeURIComponent(rest[0] || '');
    $(`.nav-item[data-tab="ext:${CSS.escape(id)}"]`)?.classList.add('active');
    showExtension(id);
    setTitle();
    groupPresence();
    return;
  }
  const view = document.getElementById(`view-${tab}`) || $('#view-home');
  view.hidden = false;
  $(`.nav-item[data-tab="${view.id.slice(5)}"]`)?.classList.add('active');
  setTitle();
  if (view.id === 'view-home') loadHome();
  if (view.id === 'view-files') {
    state.folder = decodeURIComponent(rest.join('/'));
    loadFiles();
  }
  if (view.id === 'view-manage') loadManage();
  if (view.id === 'view-store') loadStore();
  if (view.id === 'view-group') loadGroup();
  groupPresence();
}
window.addEventListener('hashchange', route);

// Phone layout: the sidebar is a slide-in menu, and the top bar names the current page.
function setTitle() {
  $('#topbar-title').textContent = $('.nav-item.active span:nth-child(2)')?.textContent || 'Extension Hub';
  document.body.classList.remove('menu-open');
}
$('#menu-btn').onclick = () => document.body.classList.toggle('menu-open');
$('#scrim').onclick = () => document.body.classList.remove('menu-open');

// On a wide screen the menu can fold away, giving the open tab the whole window. Remembered per device.
function setNavHidden(hidden) {
  document.body.classList.toggle('nav-hidden', hidden);
  try { localStorage.setItem('hub.navHidden', hidden ? '1' : ''); } catch {}
}
try { if (localStorage.getItem('hub.navHidden')) document.body.classList.add('nav-hidden'); } catch {}
$('#nav-hide').onclick = () => setNavHidden(true);
$('#nav-show').onclick = () => setNavHidden(false);
// The desktop app's View menu (Ctrl+\) calls this, so it works even while an extension has the keyboard.
window.hubToggleNav = () => setNavHidden(!document.body.classList.contains('nav-hidden'));

// ---- extensions -------------------------------------------------------------

async function loadExtensions() {
  state.extensions = await api('/api/extensions');
  const nav = $('#ext-nav');
  nav.innerHTML = state.extensions.length
    ? state.extensions.map((e) => `
        <a class="nav-item" href="#/ext/${encodeURIComponent(e.id)}" data-tab="ext:${esc(e.id)}" title="${esc(e.description)}">
          <span class="nav-icon">${esc(e.icon)}</span><span>${esc(e.name)}</span>
          ${e.error ? '<span class="dot err" title="Has an error"></span>' : e.process.status === 'running' ? '<span class="dot" title="Running"></span>' : ''}
        </a>`).join('')
    : '<div class="nav-empty">None yet</div>';
  const updates = state.extensions.filter((e) => e.update?.available).length;
  $('#update-badge').textContent = updates || '';
  $('#update-badge').hidden = !updates;
  $('#ext-cards').innerHTML = state.extensions.length
    ? state.extensions.map((e) => `
        <a class="ext-card" href="#/ext/${encodeURIComponent(e.id)}">
          <span class="icon">${esc(e.icon)}</span>
          <div><div>${esc(e.name)}</div><div class="desc">${esc(e.description || (e.error ? 'Has an error, see Manage' : ''))}</div></div>
        </a>`).join('')
    : '<div class="empty">No extensions yet. See Manage extensions to add one.</div>';
}

function extById(id) {
  return state.extensions.find((e) => e.id === id);
}

function showExtension(id) {
  const ext = extById(id);
  if (!ext) {
    $('#view-home').hidden = false;
    return toast('That extension is not installed', 'error');
  }
  let frame = state.frames.get(id);
  if (!frame) {
    frame = document.createElement('div');
    frame.className = 'ext-frame';
    $('#ext-frames').append(frame);
    state.frames.set(id, frame);
    renderExtFrame(ext, frame);
  }
  frame.hidden = false;
}

function renderExtFrame(ext, frame) {
  const bar = `
    <div class="ext-bar">
      <span>${esc(ext.icon)}</span><strong>${esc(ext.name)}</strong>
      ${ext.version ? `<span class="tag">v${esc(ext.version)}</span>` : ''}
      <span class="grow"></span>
      ${ext.canRun ? `<span class="status ${ext.process.status}">${ext.process.status}</span>` : ''}
      <button class="btn ghost small" data-act="reload">Reload</button>
      <a class="btn ghost small" href="${esc(ext.src)}" target="_blank" rel="noopener">Open in new window</a>
    </div>`;

  if (ext.error) {
    frame.innerHTML = `${bar}<div class="ext-offline"><div>⚠️ This extension could not load.</div><code>${esc(ext.error)}</code></div>`;
  } else if (state.remote && ext.mode === 'url') {
    // A separate app on the PC's own address, which a phone can't open.
    frame.innerHTML = `${bar}<div class="ext-offline"><div>${esc(ext.name)} is a separate app that only opens on the PC.</div></div>`;
  } else if (ext.canRun && ext.process.status !== 'running') {
    frame.innerHTML = `${bar}<div class="ext-offline"><div>${esc(ext.name)} isn't running.</div><button class="btn primary" data-act="start">Start ${esc(ext.name)}</button></div>`;
  } else {
    frame.innerHTML = `${bar}<iframe src="${esc(ext.src)}" title="${esc(ext.name)}" allow="clipboard-read; clipboard-write; fullscreen; microphone"></iframe>`;
  }

  frame.onclick = async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'reload') {
      await loadExtensions();
      renderExtFrame(extById(ext.id) || ext, frame);
    }
    if (act === 'start') {
      e.target.disabled = true;
      e.target.textContent = 'Starting…';
      try {
        await api(`/api/extensions/${ext.id}/start`, { method: 'POST' });
        // Give the app a moment to open its port before loading it.
        await new Promise((r) => setTimeout(r, 2500));
        await loadExtensions();
        renderExtFrame(extById(ext.id), frame);
      } catch (err) {
        toast(err.message, 'error');
      }
    }
  };
}

// ---- home -------------------------------------------------------------------

async function loadHome() {
  const now = new Date();
  const h = now.getHours();
  $('#greeting').textContent = `Good ${h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening'}`;
  $('#today').textContent = now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const [business, reminders, recent] = await Promise.all([
    api('/api/home/business'),
    api('/api/home/reminders'),
    api('/api/files?recursive=1&limit=6'),
  ]);
  state.business = business;
  state.reminders = reminders;
  $('#brand-name').textContent = business.name || 'Extension Hub';
  renderBusiness();
  renderReminders();
  $('#recent-files').innerHTML = recent.length
    ? recent.map((f) => `
        <a class="file-mini" href="/api/files/raw?path=${encodeURIComponent(f.path)}" target="_blank">
          <span>${fileIcon(f)}</span><span class="grow">${esc(f.name)}</span>
          <span class="meta">${formatSize(f.size)} · ${formatDate(f.modified, false)}</span>
        </a>`).join('')
    : '<div class="empty">No files yet.</div>';
}

const BUSINESS_FIELDS = [
  ['name', 'Business name'], ['owner', 'Owner'], ['phone', 'Phone'], ['email', 'Email'],
  ['address', 'Address'], ['website', 'Website'], ['notes', 'Notes'],
];

function renderBusiness() {
  const b = state.business;
  const rows = BUSINESS_FIELDS.filter(([k]) => !['name', 'notes'].includes(k) && b[k])
    .map(([k, label]) => {
      let v = esc(b[k]);
      if (k === 'email') v = `<a href="mailto:${v}">${v}</a>`;
      if (k === 'phone') v = `<a href="tel:${v}">${v}</a>`;
      if (k === 'website') v = `<a href="${/^https?:/.test(b[k]) ? v : `https://${v}`}" target="_blank" rel="noopener">${v}</a>`;
      return `<dt>${label}</dt><dd>${v}</dd>`;
    }).join('');
  $('#business').innerHTML = `
    <div class="biz">
      <div class="biz-name">${esc(b.name || 'My Business')}</div>
      ${rows ? `<dl>${rows}</dl>` : '<div class="empty">Add your phone, email, address and other details with Edit.</div>'}
      ${b.notes ? `<div class="notes">${esc(b.notes)}</div>` : ''}
    </div>`;
}

$('#edit-business').onclick = () => {
  const b = state.business;
  openDialog(`
    <form method="dialog" id="biz-form">
      <h2>Business details</h2>
      <div class="form-grid">
        ${BUSINESS_FIELDS.map(([k, label]) => `<label>${label}${k === 'notes'
          ? `<textarea name="${k}" rows="4">${esc(b[k])}</textarea>`
          : `<input name="${k}" value="${esc(b[k])}">`}</label>`).join('')}
      </div>
      <div class="dialog-actions"><button class="btn" value="cancel">Cancel</button><button class="btn primary" value="save">Save</button></div>
    </form>`, async (dialog) => {
    if (dialog.returnValue !== 'save') return;
    state.business = await api('/api/home/business', { method: 'PUT', json: Object.fromEntries(new FormData($('#biz-form'))) });
    $('#brand-name').textContent = state.business.name || 'Extension Hub';
    renderBusiness();
  });
};

function renderReminders() {
  const showDone = $('#show-done').checked;
  const list = state.reminders.filter((r) => showDone || !r.done);
  const now = new Date();
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const groups = { overdue: [], today: [], upcoming: [], someday: [], done: [] };
  for (const r of list) {
    if (r.done) groups.done.push(r);
    else if (!r.due) groups.someday.push(r);
    else if (new Date(r.due) < now) groups.overdue.push(r);
    else if (new Date(r.due) < endOfToday) groups.today.push(r);
    else groups.upcoming.push(r);
  }
  const byDue = (a, b) => (a.due || '').localeCompare(b.due || '') || a.createdAt.localeCompare(b.createdAt);
  const labels = { overdue: 'Overdue', today: 'Today', upcoming: 'Upcoming', someday: 'No date', done: 'Done' };
  const html = Object.entries(groups).filter(([, rs]) => rs.length).map(([g, rs]) => `
    <div class="rem-group ${g}">${labels[g]}</div>
    ${rs.sort(byDue).map((r) => `
      <div class="rem ${r.done ? 'done' : ''}" data-id="${esc(r.id)}">
        <input type="checkbox" ${r.done ? 'checked' : ''} aria-label="Mark done">
        <span class="title">${esc(r.title)}</span>
        ${r.source && r.source !== 'hub' ? `<span class="tag">${esc(extById(r.source)?.name || r.source)}</span>` : ''}
        <span class="meta ${g === 'overdue' ? 'overdue' : ''}">${formatDate(r.due)}</span>
        <button class="btn ghost small del" title="Delete">✕</button>
      </div>`).join('')}`).join('');
  $('#reminders').innerHTML = html || '<div class="empty">Nothing to remember. Nice.</div>';
}

$('#show-done').onchange = renderReminders;

$('#reminders').onclick = async (e) => {
  const row = e.target.closest('.rem');
  if (!row) return;
  const id = row.dataset.id;
  if (e.target.matches('input[type=checkbox]')) {
    const updated = await api(`/api/home/reminders/${id}`, { method: 'PATCH', json: { done: e.target.checked } });
    state.reminders = state.reminders.map((r) => (r.id === id ? updated : r));
    renderReminders();
  }
  if (e.target.closest('.del')) {
    await api(`/api/home/reminders/${id}`, { method: 'DELETE' });
    state.reminders = state.reminders.filter((r) => r.id !== id);
    renderReminders();
  }
};

$('#reminder-form').onsubmit = async (e) => {
  e.preventDefault();
  const form = e.target;
  const { title, due } = Object.fromEntries(new FormData(form));
  const r = await api('/api/home/reminders', { method: 'POST', json: { title, due: due ? new Date(due).toISOString() : null } });
  state.reminders.push(r);
  form.reset();
  renderReminders();
};

// ---- files ------------------------------------------------------------------

const ARCHIVE = 'Archive';
const inArchive = (p) => p === ARCHIVE || p.startsWith(`${ARCHIVE}/`);

async function loadFiles() {
  const folder = state.folder;
  const parts = folder ? folder.split('/') : [];
  $('#crumbs').innerHTML = [`<a href="#/files">All files</a>`]
    .concat(parts.map((p, i) => `<span>/</span><a href="#/files/${parts.slice(0, i + 1).map(encodeURIComponent).join('/')}">${esc(p)}</a>`))
    .join('');
  const [items, schedules, archived] = await Promise.all([
    api(`/api/files?folder=${encodeURIComponent(folder)}`),
    api('/api/archive/schedules'),
    inArchive(folder) ? api('/api/archive') : [],
  ]);
  state.schedules = schedules;
  const zips = new Map(archived.map((z) => [z.path, z]));
  $('#archive-intro').hidden = folder !== ARCHIVE;
  $('#file-list').innerHTML = items.length ? `
    <table class="file-table">
      <thead><tr><th>Name</th><th class="hide-sm">Size</th><th class="hide-sm">Modified</th><th></th></tr></thead>
      <tbody>${items.map((f) => {
        const due = schedules[f.path];
        const zip = zips.get(f.path);
        const note = zip
          ? `<div class="file-note">${zip.originalPath ? `From ${esc(zip.originalPath)} · ` : ''}archived ${formatDate(zip.archivedAt, false)}${zip.auto ? ' (on schedule)' : ''}</div>`
          : due
            ? `<div class="file-note ${due.error ? 'error' : ''}" title="${esc(due.error || '')}">🗓️ Archives ${formatDate(due.at, false)}${due.error ? ' · last try failed, will try again' : ''}</div>`
            : '';
        return `
        <tr data-path="${esc(f.path)}" data-type="${f.type}">
          <td><span class="name" data-act="open"><span>${fileIcon(f)}</span><span>${esc(f.name)}</span></span>${note}</td>
          <td class="num hide-sm">${formatSize(f.size)}</td>
          <td class="num hide-sm">${formatDate(f.modified)}</td>
          <td class="row-actions">
            ${zip ? '<button class="btn small" data-act="restore">Restore</button>' : ''}
            ${f.type === 'file' ? '<button class="btn ghost small" data-act="download">Download</button>' : ''}
            ${state.group?.joined && !inArchive(f.path) ? (groupItemFor('library', f.path) ? '<button class="btn small shared-btn" data-act="group">👥 Shared</button>' : '<button class="btn ghost small" data-act="share">Share…</button>') : ''}
            ${inArchive(f.path) ? '' : '<button class="btn ghost small" data-act="archive">Archive…</button>'}
            <button class="btn ghost small" data-act="rename">Rename</button>
            <button class="btn ghost small danger" data-act="delete">Delete</button>
          </td>
        </tr>`;
      }).join('')}
      </tbody>
    </table>` : `<div class="empty">${folder === ARCHIVE ? 'Nothing archived yet. Use Archive… on any file or folder.' : 'This folder is empty.'}</div>`;
}

// Archive now, or pick when the hub should do it by itself.
function archiveDialog(path, type) {
  const name = path.split('/').pop();
  const current = state.schedules?.[path];
  const later = (months) => { const d = new Date(); d.setMonth(d.getMonth() + months); return d; };
  const dateValue = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const choices = [['now', 'Now'], ['1', 'In 1 month'], ['3', 'In 3 months'], ['6', 'In 6 months'], ['12', 'In 1 year'], ['date', 'On a date']];
  return new Promise((resolve) => {
    const d = openDialog(`
      <form method="dialog" class="archive-form">
        <h2>Archive "${esc(name)}"</h2>
        <p class="muted">The ${type === 'folder' ? 'folder and everything in it is' : 'file is'} zipped into the Archive folder. You can restore it from there any time.</p>
        ${current ? `<p class="file-note">🗓️ Set to archive on ${formatDate(current.at, false)}.</p>` : ''}
        <div class="choices">${choices.map(([v, label], i) => `
          <label><input type="radio" name="when" value="${v}" ${(!current && i === 0) || (current && v === 'date') ? 'checked' : ''}> ${label}</label>`).join('')}
          <input type="date" name="date" value="${dateValue(current ? new Date(current.at) : later(3))}" min="${dateValue(new Date())}">
        </div>
        <div class="dialog-actions">
          ${current ? '<button class="btn danger" value="unschedule" style="margin-right:auto">Don\'t auto-archive</button>' : ''}
          <button class="btn" value="cancel">Cancel</button><button class="btn primary" value="ok">Archive</button>
        </div>
      </form>`, (dlg) => {
      if (dlg.returnValue === 'unschedule') return resolve({ unschedule: true });
      if (dlg.returnValue !== 'ok') return resolve(null);
      const { when, date } = Object.fromEntries(new FormData($('form', dlg)));
      if (when === 'now') return resolve({ now: true });
      // A picked date archives at the start of that day, local time.
      const at = when === 'date' ? new Date(`${date}T00:00:00`) : later(Number(when));
      resolve({ at });
    });
    const sync = () => {
      const when = $('input[name=when]:checked', d).value;
      $('input[name=date]', d).disabled = when !== 'date';
      $('button[value=ok]', d).textContent = when === 'now' ? 'Archive now' : 'Set date';
    };
    d.querySelectorAll('input[name=when]').forEach((r) => (r.onchange = sync));
    $('input[name=date]', d).onfocus = () => { $('input[value=date]', d).checked = true; sync(); };
    sync();
  });
}

$('#file-list').onclick = async (e) => {
  const act = e.target.closest('[data-act]')?.dataset.act;
  const row = e.target.closest('tr');
  if (!act || !row) return;
  const { path, type } = row.dataset;
  const name = path.split('/').pop();
  if (act === 'open') {
    if (type === 'folder') location.hash = `#/files/${path.split('/').map(encodeURIComponent).join('/')}`;
    else window.open(`/api/files/raw?path=${encodeURIComponent(path)}`, '_blank');
  }
  if (act === 'download') location.href = `/api/files/raw?download=1&path=${encodeURIComponent(path)}`;
  if (act === 'rename') {
    const next = await promptDialog('Rename', name);
    if (!next || next === name) return;
    const to = path.split('/').slice(0, -1).concat(next).join('/');
    try { await api('/api/files/rename', { method: 'POST', json: { from: path, to } }); } catch (err) { toast(err.message, 'error'); }
    loadFiles();
  }
  if (act === 'delete') {
    if (!(await confirmDialog(`Delete "${name}"${type === 'folder' ? ' and everything in it' : ''}? This can't be undone.`))) return;
    await api(`/api/files?path=${encodeURIComponent(path)}`, { method: 'DELETE' });
    loadFiles();
  }
  if (act === 'archive') {
    const pick = await archiveDialog(path, type);
    if (!pick) return;
    try {
      if (pick.unschedule) {
        await api(`/api/archive/schedule?path=${encodeURIComponent(path)}`, { method: 'DELETE' });
        toast(`"${name}" won't be archived automatically.`);
      } else if (pick.now) {
        e.target.disabled = true;
        e.target.textContent = 'Archiving…';
        const zip = await api('/api/archive/now', { method: 'POST', json: { path } });
        toast(`Archived to ${zip.path}`);
      } else {
        await api('/api/archive/schedule', { method: 'PUT', json: { path, at: pick.at.toISOString() } });
        toast(`"${name}" will be archived on ${formatDate(pick.at.toISOString(), false)}.`);
      }
    } catch (err) { toast(err.message, 'error'); }
    loadFiles();
  }
  if (act === 'share') {
    if (await shareDialog({ scope: 'library', path, name, type })) loadFiles();
  }
  if (act === 'group') location.hash = '#/group';
  if (act === 'restore') {
    e.target.disabled = true;
    e.target.textContent = 'Restoring…';
    try {
      const { restored } = await api('/api/archive/restore', { method: 'POST', json: { path } });
      toast(`Restored to ${restored}`);
    } catch (err) { toast(err.message, 'error'); }
    loadFiles();
  }
};

$('#open-explorer').onclick = () => api('/api/files/reveal', { method: 'POST', json: { path: state.folder } });

$('#new-folder').onclick = async () => {
  const name = await promptDialog('New folder', '');
  if (!name) return;
  await api('/api/files/folder', { method: 'POST', json: { path: [state.folder, name].filter(Boolean).join('/') } });
  loadFiles();
};

// Uploads go through XMLHttpRequest because fetch can't report upload progress.
function uploadFiles(files, folder = state.folder, base = '/api/files') {
  return Promise.all([...files].map((file) => new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'upload';
    el.innerHTML = `<div>${esc(file.name)} <span class="muted">${formatSize(file.size)}</span> <span class="pct"></span></div><div class="bar"><div></div></div>`;
    $('#uploads').append(el);
    const body = new FormData();
    body.append('files', file);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${base}/upload?folder=${encodeURIComponent(folder)}`);
    xhr.upload.onprogress = (e) => {
      if (!e.lengthComputable) return;
      const pct = Math.round((e.loaded / e.total) * 100);
      $('.bar div', el).style.width = `${pct}%`;
      $('.pct', el).textContent = `${pct}%`;
    };
    xhr.onload = () => {
      if (xhr.status >= 300) {
        el.classList.add('error');
        $('.pct', el).textContent = 'failed';
      } else {
        el.remove();
      }
      resolve();
    };
    xhr.onerror = () => { el.classList.add('error'); $('.pct', el).textContent = 'failed'; resolve(); };
    xhr.send(body);
  }))).then(() => { if (!$('#view-files').hidden) loadFiles(); });
}

$('#file-input').onchange = (e) => { uploadFiles(e.target.files); e.target.value = ''; };
const dz = $('#dropzone');
dz.ondragover = (e) => { e.preventDefault(); dz.classList.add('drag'); };
dz.ondragleave = (e) => { if (!dz.contains(e.relatedTarget)) dz.classList.remove('drag'); };
dz.ondrop = (e) => { e.preventDefault(); dz.classList.remove('drag'); uploadFiles(e.dataTransfer.files); };

// ---- manage -----------------------------------------------------------------

async function loadManage() {
  const info = await api('/api/info');
  $('#ext-dir').textContent = info.extensionsDir;
  await loadExtensions();
  $('#manage-list').innerHTML = state.extensions.map((e) => {
    const u = e.update;
    const recent = e.lastUpdate && Date.now() - new Date(e.lastUpdate.at) < 14 * 864e5 ? e.lastUpdate : null;
    return `
    <div class="manage-item" data-id="${esc(e.id)}">
      <div class="row">
        <span class="icon">${esc(e.icon)}</span>
        <div class="grow">
          <strong>${esc(e.name)}</strong> ${e.version ? `<span class="tag">v${esc(e.version)}</span>` : ''}
          ${u?.available ? `<span class="tag update">v${esc(u.latest)} available</span>` : ''}
          <div class="muted">${esc(e.description)}</div>
          <div class="muted" style="font-size:12px">${e.mode === 'url' ? `Embeds ${esc(e.src)}` : 'Built-in page'}${e.hasServer ? ' · has server routes' : ''}${e.updateSource ? ` · ${u?.error ? 'update check failed' : u ? `checked ${formatDate(u.checkedAt)}` : 'updates on'}` : e.bundled ? ' · updates with the hub' : ' · no update source'}</div>
        </div>
        ${e.canRun ? `
          <span class="status ${e.process.status}">${e.process.status}</span>
          ${e.process.status === 'running'
            ? '<button class="btn small" data-act="stop">Stop</button>'
            : '<button class="btn small" data-act="start">Start</button>'}` : ''}
        ${u?.available ? `<button class="btn primary small" data-act="update">Update to v${esc(u.latest)}</button>` : ''}
        <details class="menu">
          <summary class="btn ghost small" aria-label="More">•••</summary>
          <div class="menu-list">
            ${e.updateSource ? '<button class="btn ghost small" data-act="check">Check for update</button>' : ''}
            <button class="btn ghost small" data-act="zip">Update from .zip…</button>
            ${e.rollbackTo ? `<button class="btn ghost small" data-act="rollback">Go back to v${esc(e.rollbackTo)}</button>` : ''}
            <button class="btn ghost small" data-act="folders">File locations…</button>
            <button class="btn ghost small" data-act="logs">Logs</button>
            <button class="btn ghost small danger" data-act="uninstall">Remove</button>
          </div>
        </details>
      </div>
      ${u?.available && u.notes ? `<div class="notes-box"><strong>What's new in v${esc(u.latest)}</strong><div>${esc(u.notes)}</div></div>` : ''}
      ${recent ? `<div class="notes-box done"><strong>${recent.from ? `Updated v${esc(recent.from)} → v${esc(recent.to)}` : `Installed v${esc(recent.to)}`} · ${formatDate(recent.at)}</strong>${recent.notes ? `<div>${esc(recent.notes)}</div>` : ''}</div>` : ''}
      ${u?.error ? `<div class="err">Couldn't check for updates: ${esc(u.error)}</div>` : ''}
      ${e.error ? `<div class="err">⚠️ ${esc(e.error)}</div>` : ''}
      <div class="log-slot"></div>
    </div>`;
  }).join('') || '<div class="empty">No extensions found.</div>';
}

// After an install, update or rollback the extension's tab must reload with the new code.
function dropFrame(id) {
  state.frames.get(id)?.remove();
  state.frames.delete(id);
}

async function afterInstall(rec, verb = 'Updated') {
  dropFrame(rec.id);
  await loadManage();
  toast(`${verb} ${rec.name}${rec.to ? ` (v${rec.to})` : ''}`);
  if (!$('#view-store').hidden) loadStore();
}

function busy(btn, text) {
  if (!btn) return;
  btn.disabled = true;
  btn.textContent = text;
}

$('#manage-list').onclick = async (e) => {
  const btn = e.target.closest('[data-act]');
  const act = btn?.dataset.act;
  const item = e.target.closest('.manage-item');
  if (!act || !item) return;
  const id = item.dataset.id;
  const ext = extById(id);
  btn.closest('details')?.removeAttribute('open');
  try {
    if (act === 'start' || act === 'stop') {
      await api(`/api/extensions/${id}/${act}`, { method: 'POST' });
      await new Promise((r) => setTimeout(r, 600));
      dropFrame(id);
      await loadManage();
    }
    if (act === 'logs') {
      const logs = await api(`/api/extensions/${id}/logs`);
      $('.log-slot', item).innerHTML = `<div class="logs">${esc(logs.join('\n') || 'No output yet.')}</div>`;
    }
    if (act === 'check') {
      const r = await api(`/api/extensions/${id}/check`, { method: 'POST' });
      toast(r.error ? `Couldn't check: ${r.error}` : r.available ? `v${r.latest} is available` : `${ext.name} is up to date`, r.error ? 'error' : '');
      await loadManage();
    }
    if (act === 'update') {
      busy(btn, 'Updating…');
      await afterInstall(await api(`/api/extensions/${id}/update`, { method: 'POST' }));
    }
    if (act === 'rollback') {
      if (!(await confirmDialog(`Go back to v${ext.rollbackTo} of ${ext.name}? Your saved data and files are not affected.`, 'Go back'))) return;
      await afterInstall(await api(`/api/extensions/${id}/rollback`, { method: 'POST' }), 'Moved');
    }
    if (act === 'uninstall') {
      const choice = await removeDialog(ext);
      if (!choice) return;
      await api(`/api/extensions/${id}/uninstall`, { method: 'POST', json: choice });
      dropFrame(id);
      await loadManage();
      toast(choice.deleteData || choice.deleteFolders.length ? `Removed ${ext.name} and deleted what you picked` : `Removed ${ext.name}`);
    }
    if (act === 'folders') {
      await fileLocationsDialog(ext);
    }
    if (act === 'zip') {
      const file = await chooseFile('.zip');
      if (!file) return;
      await afterInstall(await uploadZip(file, id));
    }
  } catch (err) {
    toast(err.message, 'error');
    loadManage();
  }
};

function chooseFile(accept) {
  return new Promise((resolve) => {
    const input = Object.assign(document.createElement('input'), { type: 'file', accept });
    input.onchange = () => resolve(input.files[0] || null);
    input.click();
  });
}

async function uploadZip(file, expectId = '') {
  const body = new FormData();
  body.append('file', file);
  return api(`/api/extensions/install-zip${expectId ? `?id=${encodeURIComponent(expectId)}` : ''}`, { method: 'POST', body });
}

// ---- get extensions (catalog) ----------------------------------------------

async function loadStore() {
  const { entries, errors } = await api('/api/catalog');
  $('#store-errors').innerHTML = errors.map((e) => `<div class="err" style="margin-bottom:10px">Couldn't load a catalog: ${esc(e)}</div>`).join('');
  $('#store-list').innerHTML = entries.map((e) => {
    let action;
    if (e.status === 'coming-soon' && !e.installed) action = '<button class="btn small" disabled>Coming soon</button>';
    else if (e.newer) action = `<button class="btn primary small" data-act="install">Update to v${esc(e.version)}</button>`;
    else if (e.installed) action = `<a class="btn small" href="#/ext/${encodeURIComponent(e.id)}">Open</a>`;
    else action = '<button class="btn primary small" data-act="install">Install</button>';
    return `
      <div class="store-card ${e.status === 'coming-soon' && !e.installed ? 'soon' : ''}" data-id="${esc(e.id)}">
        <div class="head">
          <span class="icon">${esc(e.icon)}</span>
          <div><strong>${esc(e.name)}</strong><div>${e.category ? `<span class="tag">${esc(e.category)}</span> ` : ''}${e.installed ? `<span class="tag">Installed${e.installedVersion ? ` v${esc(e.installedVersion)}` : ''}</span>` : e.version ? `<span class="tag">v${esc(e.version)}</span>` : ''}</div></div>
        </div>
        <div class="desc">${esc(e.description)}</div>
        <div class="foot">${e.homepage ? `<a href="${esc(e.homepage)}" target="_blank" rel="noopener" style="font-size:13px">More info</a>` : '<span></span>'}${action}</div>
      </div>`;
  }).join('') || '<div class="empty">The catalog is empty. Add entries to catalog.json in the hub folder.</div>';
}

$('#store-list').onclick = async (e) => {
  const btn = e.target.closest('[data-act=install]');
  if (!btn) return;
  const id = btn.closest('.store-card').dataset.id;
  busy(btn, 'Installing…');
  try {
    const rec = await api(`/api/catalog/${encodeURIComponent(id)}/install`, { method: 'POST' });
    dropFrame(rec.id);
    await loadExtensions();
    toast(rec.from ? `Updated ${rec.name} to v${rec.to}` : `Installed ${rec.name}`);
  } catch (err) {
    toast(err.message, 'error');
  }
  loadStore();
};

$('#install-other').onclick = () => $('#install').click();

$('#install').onclick = () => {
  openDialog(`
    <form method="dialog" id="install-form">
      <h2>Add or update an extension</h2>
      <div class="form-grid">
        <label>From a link
          <input name="link" placeholder="owner/repo, or a link to a .zip or latest.json">
        </label>
        <div class="muted" style="font-size:13px">Or <a href="#" id="install-pick">choose a .zip file</a> from this computer.</div>
        <div class="muted" style="font-size:12px">Extensions run code on this computer. Only install ones you trust.</div>
      </div>
      <div class="dialog-actions"><button class="btn" value="cancel">Cancel</button><button class="btn primary" value="ok">Install</button></div>
    </form>`, async (d) => {
    if (d.returnValue !== 'ok') return;
    const link = new FormData($('#install-form')).get('link').trim();
    if (!link) return;
    toast('Installing…');
    try {
      const rec = await api('/api/extensions/install', { method: 'POST', json: { link } });
      await afterInstall(rec, rec.from ? 'Updated' : 'Installed');
    } catch (err) {
      toast(err.message, 'error');
    }
  });
  $('#install-pick').onclick = async (ev) => {
    ev.preventDefault();
    $('#dialog').close();
    const file = await chooseFile('.zip');
    if (!file) return;
    try {
      const rec = await uploadZip(file);
      await afterInstall(rec, rec.from ? 'Updated' : 'Installed');
    } catch (err) {
      toast(err.message, 'error');
    }
  };
};

$('#check-updates').onclick = async () => {
  const btn = $('#check-updates');
  busy(btn, 'Checking…');
  try {
    const [all, app] = await Promise.all([Object.values(await api('/api/extensions/updates?refresh=1')), checkAppUpdate(true)]);
    const n = all.filter((u) => u.available).length;
    // Extensions that ship with the hub (Website, Bid Reader…) update when the hub does.
    if (app?.needsToken) githubKeyDialog();
    else if (app?.available) toast(`Extension Hub v${String(app.latest).replace(/^v/, '')} is out, with the newest extensions. Use Update now in the sidebar.`);
    else toast(n ? `${n} extension update${n === 1 ? '' : 's'} available` : 'Everything is up to date');
    await loadManage();
  } finally {
    btn.disabled = false;
    btn.textContent = 'Check for updates';
  }
};

$('#rescan').onclick = async () => {
  await api('/api/extensions/rescan', { method: 'POST' });
  for (const f of state.frames.values()) f.remove();
  state.frames.clear();
  await loadManage();
  toast(`Found ${state.extensions.length} extension${state.extensions.length === 1 ? '' : 's'}`);
};

// ---- dialogs ----------------------------------------------------------------

function openDialog(html, onClose) {
  const d = $('#dialog');
  d.innerHTML = html;
  d.onclose = () => onClose?.(d);
  d.returnValue = '';
  d.showModal();
  return d;
}

// Where an extension saves its documents. Each folder it uses (such as "Bids") can point at any
// folder in Files; the hub sends the extension's saves there.
async function fileLocationsDialog(ext) {
  const rows = await api(`/api/extensions/${encodeURIComponent(ext.id)}/folders`);
  openDialog(`
    <form method="dialog" class="locations-form">
      <h2>${esc(ext.name)} file locations</h2>
      <p class="muted">Choose where ${esc(ext.name)} saves its files. You can pick any folder in Files or make a new one.</p>
      ${rows.length ? '' : `<p>${esc(ext.name)} doesn't keep its own folders in Files, so there's nothing to move. If it should, ask for its manifest to list them under <code>"folders"</code>.</p>`}
      ${rows.map((r) => `
        <div class="location-row">
          <div class="grow"><strong>${esc(r.alias)}</strong><div class="muted">Saves to <code>Files/${esc(r.target)}</code></div></div>
          <button class="btn small" value="change:${esc(r.alias)}">Change…</button>
        </div>`).join('')}
      <div class="dialog-actions"><button class="btn primary" value="close">Done</button></div>
    </form>`, async (d) => {
    const [act, alias] = d.returnValue.split(/:(.*)/s);
    if (act !== 'change') return;
    const row = rows.find((r) => r.alias === alias);
    const target = await folderPickerDialog(`Where should ${ext.name} keep "${alias}"?`, row.target);
    if (target == null) return fileLocationsDialog(ext);
    try {
      const r = await api(`/api/extensions/${encodeURIComponent(ext.id)}/folders`, { method: 'PUT', json: { alias, target, move: true } });
      const also = r.shared?.length ? ` ${r.shared.join(' and ')} use${r.shared.length === 1 ? 's' : ''} it too.` : '';
      toast(`${ext.name} now saves "${alias}" to Files/${r.target}${r.moved ? `. Moved ${r.moved} item${r.moved === 1 ? '' : 's'} there.` : '.'}${also}`);
    } catch (err) {
      toast(err.message, 'error');
    }
    fileLocationsDialog(ext);
  });
}

// Pick a folder in Files, with a "New folder" button. Resolves to its path ('' never), or null.
function folderPickerDialog(title, start = '') {
  let current = '';
  const parts = String(start).split('/').filter(Boolean);
  // Start in the parent of the current location, so the current folder shows in the list.
  current = parts.slice(0, -1).join('/');
  return new Promise((resolve) => {
    const d = openDialog(`
      <form method="dialog" class="folder-picker">
        <h2>${esc(title)}</h2>
        <nav class="crumbs" id="fp-crumbs"></nav>
        <div class="picker-list" id="fp-list"></div>
        <div class="dialog-actions">
          <button class="btn" type="button" id="fp-new">New folder</button>
          <span class="grow"></span>
          <button class="btn" value="cancel">Cancel</button>
          <button class="btn primary" value="pick" id="fp-pick">Use this folder</button>
        </div>
      </form>`, (dlg) => resolve(dlg.returnValue === 'pick' && current ? current : null));
    const draw = async () => {
      const crumbs = ['', ...current.split('/').filter(Boolean)];
      $('#fp-crumbs', d).innerHTML = crumbs.map((c, i) => {
        const p = crumbs.slice(1, i + 1).join('/');
        return `<a href="#" data-path="${esc(p)}">${i ? esc(c) : 'Files'}</a>`;
      }).join(' › ');
      const items = await api(`/api/files?folder=${encodeURIComponent(current)}`);
      const folders = items.filter((f) => f.type === 'folder');
      $('#fp-list', d).innerHTML = folders.length
        ? folders.map((f) => `<div class="file-mini" data-path="${esc(f.path)}">📁 ${esc(f.name)}</div>`).join('')
        : '<div class="empty" style="padding:12px">No folders here. Use New folder to make one.</div>';
      $('#fp-pick', d).disabled = !current;
      $('#fp-pick', d).textContent = current ? `Use "${current.split('/').pop()}"` : 'Open a folder to pick it';
    };
    // On the form, not the shared <dialog>, so the listener goes away with this picker.
    $('form', d).addEventListener('click', async (e) => {
      const go = e.target.closest('[data-path]');
      if (go) {
        e.preventDefault();
        current = go.dataset.path;
        draw();
      }
      if (e.target.id === 'fp-new') {
        const input = document.createElement('input');
        input.placeholder = 'New folder name';
        input.className = 'fp-new-name';
        const row = document.createElement('div');
        row.className = 'row';
        const ok = document.createElement('button');
        ok.type = 'button';
        ok.className = 'btn primary small';
        ok.textContent = 'Create';
        row.append(input, ok);
        $('#fp-list', d).prepend(row);
        input.focus();
        const create = async () => {
          const n = input.value.trim().replace(/[\\/]/g, '');
          if (!n) return;
          const p = current ? `${current}/${n}` : n;
          try {
            await api('/api/files/folder', { method: 'POST', json: { path: p } });
            current = p;
            draw();
          } catch (err) {
            toast(err.message, 'error');
          }
        };
        ok.onclick = create;
        input.onkeydown = (ev) => {
          if (ev.key === 'Enter') {
            ev.preventDefault();
            create();
          }
        };
      }
    });
    draw();
  });
}

// Remove an extension, keeping its saved data and documents (the default) or deleting them.
async function removeDialog(ext) {
  const fp = await api(`/api/extensions/${encodeURIComponent(ext.id)}/footprint`);
  const count = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const dataBits = [fp.data.files ? `settings and saved data (${formatSize(fp.data.bytes)})` : '', fp.reminders ? count(fp.reminders, 'reminder') : ''].filter(Boolean);
  return new Promise((resolve) => {
    openDialog(`
      <form method="dialog" class="remove-form">
        <h2>Remove ${esc(ext.name)}?</h2>
        <div class="choices">
          <label><input type="radio" name="mode" value="keep" checked> <span><strong>Keep its data and files</strong><br><span class="muted">Installing it again brings everything back.</span></span></label>
          <label><input type="radio" name="mode" value="delete"> <span><strong>Delete its data</strong><br><span class="muted">${dataBits.length ? `Deletes its ${esc(dataBits.join(' and '))}, plus its old versions.` : 'It has no saved data. Deletes its old versions.'} This can't be undone.</span></span></label>
          ${fp.folders.map((f) => `
            <label class="sub" hidden><input type="checkbox" name="folder" value="${esc(f.name)}"> <span>Also delete the <strong>${esc(f.name)}</strong> folder in Files <span class="muted">(${count(f.files, 'file')}, ${formatSize(f.bytes)})</span></span></label>`).join('')}
        </div>
        <div class="dialog-actions"><button class="btn" value="cancel">Cancel</button><button class="btn danger" value="remove">Remove</button></div>
      </form>`, (d) => {
      if (d.returnValue !== 'remove') return resolve(null);
      const deleteData = $('input[name=mode]:checked', d).value === 'delete';
      const deleteFolders = deleteData ? [...d.querySelectorAll('input[name=folder]:checked')].map((i) => i.value) : [];
      resolve({ deleteData, deleteFolders });
    });
    const d = $('#dialog');
    for (const r of d.querySelectorAll('input[name=mode]')) {
      r.onchange = () => { for (const sub of d.querySelectorAll('.sub')) sub.hidden = $('input[name=mode]:checked', d).value !== 'delete'; };
    }
  });
}

function promptDialog(title, value) {
  return new Promise((resolve) => {
    openDialog(`
      <form method="dialog">
        <h2>${esc(title)}</h2>
        <input name="v" value="${esc(value)}" style="width:100%" autofocus>
        <div class="dialog-actions"><button class="btn" value="cancel">Cancel</button><button class="btn primary" value="ok">OK</button></div>
      </form>`, (d) => resolve(d.returnValue === 'ok' ? $('input', d).value.trim() : null));
  });
}

function confirmDialog(text, okLabel = 'Delete') {
  return new Promise((resolve) => {
    openDialog(`
      <form method="dialog">
        <p>${esc(text)}</p>
        <div class="dialog-actions"><button class="btn" value="cancel">Cancel</button><button class="btn primary" value="ok">${esc(okLabel)}</button></div>
      </form>`, (d) => resolve(d.returnValue === 'ok'));
  });
}

// Lets an extension ask the hub to show its file picker (see hub-sdk.js).
async function pickFileDialog() {
  const files = await api('/api/files?recursive=1');
  return new Promise((resolve) => {
    let picked = null;
    const d = openDialog(`
      <form method="dialog">
        <h2>Choose a file from your library</h2>
        <input placeholder="Search…" id="pick-search" style="width:100%;margin-bottom:10px">
        <div class="picker-list" id="pick-list"></div>
        <div class="dialog-actions"><button class="btn" value="cancel">Cancel</button></div>
      </form>`, () => resolve(picked));
    const render = (q = '') => {
      const shown = files.filter((f) => f.path.toLowerCase().includes(q.toLowerCase()));
      $('#pick-list', d).innerHTML = shown.map((f, i) => `
        <div class="file-mini" data-i="${files.indexOf(f)}"><span>${fileIcon(f)}</span><span class="grow">${esc(f.path)}</span><span class="meta">${formatSize(f.size)}</span></div>`).join('')
        || '<div class="empty" style="padding:10px">No files.</div>';
    };
    render();
    $('#pick-search', d).oninput = (e) => render(e.target.value);
    $('#pick-list', d).onclick = (e) => {
      const row = e.target.closest('[data-i]');
      if (!row) return;
      picked = files[row.dataset.i];
      d.close('ok');
    };
  });
}

// ---- messages from extension iframes ---------------------------------------

window.addEventListener('message', async (e) => {
  const msg = e.data;
  if (!msg || msg.__hub !== true) return;
  const reply = (payload) => e.source.postMessage({ __hub: true, replyTo: msg.id, ...payload }, e.origin === 'null' ? '*' : e.origin);
  try {
    if (msg.type === 'notify') toast(msg.text, msg.level === 'error' ? 'error' : '');
    if (msg.type === 'navigate') location.hash = msg.to;
    if (msg.type === 'pickFile') reply({ result: await pickFileDialog() });
    if (msg.type === 'remindersChanged' && !$('#view-home').hidden) loadHome();
    // Which extension is asking comes from the frame itself, not from what the message says.
    const fromExt = [...state.frames].find(([, f]) => f.querySelector('iframe')?.contentWindow === e.source)?.[0];
    if (msg.type === 'groupStatus') reply({ result: await groupStatusFor(fromExt) });
    if (msg.type === 'groupShare') reply({ result: await shareFromExtension(fromExt, msg) });
  } catch (err) {
    reply({ error: err.message });
  }
});

// ---- updates for the hub itself ---------------------------------------------

async function checkAppUpdate(refresh = false) {
  let u;
  try {
    u = await api(`/api/app/update${refresh ? '?refresh=1' : ''}`);
  } catch {
    return null;
  }
  const box = $('#app-update');
  box.hidden = !u.available && !u.needsToken;
  if (u.needsToken) {
    // The hub's repository is private: GitHub only shows new versions to someone with a key.
    box.innerHTML = `
      <div><strong>${u.badToken ? 'Updates stopped' : 'Turn on updates'}</strong><br>${u.badToken
        ? 'GitHub didn\'t accept the saved key. Add a new one to keep getting updates.'
        : 'Add a GitHub key once, and new versions of the hub and its extensions install from here.'}</div>
      <button class="btn primary small" id="app-update-key">${u.badToken ? 'Add a new key' : 'Add GitHub key'}</button>`;
    $('#app-update-key').addEventListener('click', githubKeyDialog);
    return u;
  }
  if (!u.available) return u;
  const canInstall = u.desktop && u.asset && navigator.userAgent.includes('Windows');
  box.innerHTML = `
    <div><strong>Update available</strong><br>Extension Hub v${esc(String(u.latest).replace(/^v/, ''))} is out. You have v${esc(u.current)}.</div>
    ${canInstall
      ? '<button class="btn primary small" id="app-update-go">Update now</button>'
      : `<a class="btn primary small" href="${esc(u.pageUrl)}" target="_blank" rel="noopener">Download</a>`}
    ${u.notes ? '<a href="#" id="app-update-notes" style="font-size:12px">What\'s new?</a>' : ''}`;
  $('#app-update-notes')?.addEventListener('click', (e) => {
    e.preventDefault();
    openDialog(`<form method="dialog"><h2>What's new in v${esc(String(u.latest).replace(/^v/, ''))}</h2><div style="white-space:pre-wrap">${esc(u.notes)}</div><div class="dialog-actions"><button class="btn primary">OK</button></div></form>`);
  });
  $('#app-update-go')?.addEventListener('click', async (e) => {
    busy(e.target, 'Downloading…');
    try {
      await api('/api/app/update/install', { method: 'POST' });
      e.target.textContent = 'Opening setup…';
      toast('Setup is starting. The hub closes now and setup reopens it when it is done.');
    } catch (err) {
      toast(err.message, 'error');
      e.target.disabled = false;
      e.target.textContent = 'Update now';
    }
  });
  return u;
}

// One-time setup for a private hub repository: a read-only GitHub key, saved on this computer only.
async function githubKeyDialog() {
  const { saved } = await api('/api/app/github-key');
  openDialog(`
    <form method="dialog" style="max-width:520px">
      <h2>GitHub key for updates</h2>
      <p class="muted" style="margin-top:0">Your hub's code is in a private GitHub repository, so GitHub only shows new versions to someone with a key. Make a read-only key once and paste it here. It stays on this computer.</p>
      <ol style="padding-left:20px;line-height:1.6;margin:0 0 12px">
        <li>Open <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">github.com → New fine-grained token</a>.</li>
        <li>Name: <b>Extension Hub updates</b>. Expiration: the longest it allows (or "No expiration").</li>
        <li>Resource owner: <b>LARKUL-Custom</b>. Repository access: <b>Only select repositories</b> → <b>Extension-Hub</b>.</li>
        <li>Permissions → Repository permissions → <b>Contents: Read-only</b>. Nothing else.</li>
        <li>Click <b>Generate token</b>, copy it, and paste it below.</li>
      </ol>
      <input name="token" type="password" placeholder="${saved ? 'A key is saved. Paste a new one to replace it.' : 'github_pat_…'}" style="width:100%" autocomplete="off">
      <div class="dialog-actions">
        ${saved ? '<button class="btn" value="remove" style="margin-right:auto">Remove key</button>' : ''}
        <button class="btn" value="cancel">Cancel</button><button class="btn primary" value="save">Save and check</button>
      </div>
    </form>`, async (d) => {
    if (d.returnValue !== 'save' && d.returnValue !== 'remove') return;
    try {
      const token = d.returnValue === 'remove' ? '' : $('input[name=token]', d).value.trim();
      if (d.returnValue === 'save' && !token) return;
      const r = await api('/api/app/github-key', { method: 'PUT', json: { token } });
      const u = r.update || {};
      toast(!r.saved ? 'Key removed.' : u.error ? u.error : u.available ? `Extension Hub v${String(u.latest).replace(/^v/, '')} is ready to install.` : 'Updates are on. You have the latest version.', u.error ? 'error' : '');
    } catch (err) {
      toast(err.message, 'error');
    }
    checkAppUpdate();
  });
}

// ---- work group: jobs shared between the company's computers ---------------------

const ago = (iso) => {
  if (!iso) return '';
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return formatDate(iso);
};

// The shared job a path belongs to, if any.
function groupItemFor(scope, p) {
  return (state.group?.items || []).find((i) => {
    if (i.scope !== scope) return false;
    const full = i.base ? `${i.base}/${i.name}` : i.name;
    return p === full || p.startsWith(`${full}/`);
  });
}

const appName = (item) => (item.extId ? extById(item.extId)?.name || item.extId : 'Files');
const appIcon = (item) => (item.extId ? extById(item.extId)?.icon || '🧩' : '📁');
function openItemHref(item) {
  if (item.extId && extById(item.extId)) return `#/ext/${encodeURIComponent(item.extId)}`;
  if (item.scope === 'library') {
    const folder = item.kind === 'folder' ? (item.base ? `${item.base}/${item.name}` : item.name) : item.base;
    return `#/files/${folder.split('/').filter(Boolean).map(encodeURIComponent).join('/')}`;
  }
  return '#/group';
}

let lastPresence = '';
function groupPresence(force = false) {
  if (!state.group?.joined || state.remote) return;
  const [, tab = 'home', id] = location.hash.split('/');
  const ext = tab === 'ext' ? extById(decodeURIComponent(id || '')) : null;
  const p = document.hidden ? null : ext ? { app: ext.id, appName: ext.name } : { app: tab, appName: $('.nav-item.active span:nth-child(2)')?.textContent || tab };
  const key = JSON.stringify(p);
  if (!force && key === lastPresence) return;
  lastPresence = key;
  api('/api/group/presence', { method: 'PUT', json: p || {} }).catch(() => {});
}
document.addEventListener('visibilitychange', () => groupPresence());

let lastChange = null;
async function pollGroup() {
  let s;
  try {
    s = await api('/api/group/status');
  } catch {
    return;
  }
  const was = state.group;
  state.group = s;
  $('#group-dot').hidden = !s.joined;
  $('#group-dot').classList.toggle('err', s.joined && !s.connected);
  $('#group-dot').title = s.joined ? (s.connected ? 'Connected' : "Can't reach the host") : '';
  // Tell people what others changed, and tell the extension so it can load the new version.
  const changes = s.changes || [];
  if (lastChange === null) lastChange = changes.length ? changes[changes.length - 1].n : 0;
  const fresh = changes.filter((c) => c.n > lastChange);
  if (fresh.length) lastChange = fresh[fresh.length - 1].n;
  const byJob = new Map();
  for (const c of fresh) byJob.set(c.itemId, c);
  for (const c of byJob.values()) {
    toast(`${c.byName} updated ${c.title}${c.extId ? ` in ${extById(c.extId)?.name || c.extId}` : ''}`);
    const frame = c.extId && state.frames.get(c.extId)?.querySelector('iframe');
    frame?.contentWindow?.postMessage({ __hub: true, type: 'groupChanged', itemId: c.itemId, title: c.title, byName: c.byName }, '*');
  }
  if (!$('#view-group').hidden && (s.joined || !was || was.joined !== s.joined)) renderGroup();
  if (!$('#view-files').hidden && Boolean(was?.joined) !== Boolean(s.joined)) loadFiles();
}

async function loadGroup() {
  await pollGroup();
  renderGroup();
}

function renderGroup() {
  const s = state.group || { joined: false };
  const body = $('#group-body');
  if (!s.joined) {
    // Don't wipe what someone is typing.
    if (body.querySelector('.group-start')) return;
    $('#group-title').textContent = 'Work group';
    $('#group-sub').textContent = 'Share jobs with the other computers in your company. Everyone sees who is working on what, and changes save on each computer and copy to the others by themselves.';
    $('#group-actions').innerHTML = '';
    body.innerHTML = state.remote ? '<div class="empty">Set up a work group on the PC.</div>' : `
      <div class="home-grid group-start">
        <form class="card span-2" id="group-folder-form">
          <h2>☁️ Use a shared Dropbox folder</h2>
          <p class="muted">Best when people work from home. Make a folder in Dropbox (for example "Extension Hub Group") and share it with your team in Dropbox. Then, on each computer, pick that folder here. The hub keeps only the shared jobs and the group's activity in it, never anything else, and Dropbox copies it between everyone. No computer has to stay on.</p>
          <label class="field"><span>Your name</span><input name="name" placeholder="Your name" required autocomplete="name"></label>
          <button class="btn primary" type="submit">Choose the Dropbox folder…</button>
          ${s.dropbox?.length ? `<p class="muted small">Found Dropbox at <code>${esc(s.dropbox[0].path)}</code></p>` : '<p class="muted small">Dropbox doesn\'t seem to be installed on this computer yet. Install it and sign in first, or pick any other folder that a sync app shares.</p>'}
        </form>
        <form class="card" id="group-host-form">
          <h2>Or: host on this computer</h2>
          <p class="muted">For computers on the same office network. Pick one that's on most of the day, such as the office PC. It keeps the group's copy of every shared job, and the others connect to it.</p>
          <label class="field"><span>Group name</span><input name="groupName" placeholder="Larkul" required></label>
          <label class="field"><span>Your name</span><input name="name" placeholder="Ayden" required autocomplete="name"></label>
          <button class="btn primary">Start the group</button>
        </form>
        <form class="card" id="group-join-form">
          <h2>Or: join an office PC's group</h2>
          <p class="muted">On the host computer, open <strong>Work group</strong> and read out the address and join code shown there.</p>
          <label class="field"><span>Host address</span><input name="address" placeholder="192.168.1.20:4323" required></label>
          <label class="field"><span>Join code</span><input name="code" placeholder="K7QM-2XPA" required autocapitalize="characters"></label>
          <label class="field"><span>Your name</span><input name="name" placeholder="Your name" required autocomplete="name"></label>
          <button class="btn primary">Join</button>
        </form>
      </div>`;
    const submit = (form, url) => {
      form.onsubmit = async (e) => {
        e.preventDefault();
        const btn = form.querySelector('button');
        btn.disabled = true;
        try {
          state.group = await api(url, { method: 'POST', json: Object.fromEntries(new FormData(form)) });
          toast(url.endsWith('host') ? 'Your group is ready. Share the address and code with the others.' : `You joined ${state.group.group.name}.`);
          body.innerHTML = '';
          await loadGroup();
          groupPresence(true);
        } catch (err) {
          toast(err.message, 'error');
          btn.disabled = false;
        }
      };
    };
    if (!state.remote) {
      $('#group-folder-form').onsubmit = async (e) => {
        e.preventDefault();
        const name = $('#group-folder-form [name=name]').value.trim();
        const pick = await groupFolderPicker();
        if (!pick) return;
        try {
          state.group = await api('/api/group/use-folder', { method: 'POST', json: { ...pick, name } });
          toast(pick.groupName ? `Your group is ready. Share the "${pick.groupName}" folder with your team in Dropbox.` : `You joined ${state.group.group.name}.`);
          body.innerHTML = '';
          await loadGroup();
          groupPresence(true);
        } catch (err) {
          toast(err.message, 'error');
        }
      };
      submit($('#group-host-form'), '/api/group/host');
      submit($('#group-join-form'), '/api/group/join');
    }
    return;
  }

  $('#group-title').textContent = s.group.name;
  const where = s.mode === 'folder' ? ` · shared folder <code>${esc(s.folder)}</code>` : s.hosting ? ' · this computer is the host' : ` to ${esc(s.hostUrl)}`;
  $('#group-sub').innerHTML = `${s.connected
    ? `<span class="sync-ok">● Connected</span>${where}`
    : `<span class="sync-bad">● ${s.mode === 'folder' ? "Can't open the shared folder" : `Can't reach the host${s.hosting ? '' : ` at ${esc(s.hostUrl)}`}`}</span> · your changes are saved on this computer and will copy over when it's back`}${s.pending ? ` · ${s.pending} change${s.pending === 1 ? '' : 's'} waiting` : ''}`;
  $('#group-actions').innerHTML = `
    <button class="btn" id="group-sync">Sync now</button>
    <button class="btn primary" id="group-share">Share a job…</button>`;
  $('#group-sync').onclick = async (e) => {
    e.target.disabled = true;
    try { state.group = await api('/api/group/sync-now', { method: 'POST' }); renderGroup(); } catch (err) { toast(err.message, 'error'); }
    e.target.disabled = false;
  };
  $('#group-share').onclick = () => sharePicker();

  const me = s.me.id;
  const others = s.members.filter((m) => m.id !== me);
  const items = [...s.items].sort((a, b) => (b.last?.at || b.sharedAt).localeCompare(a.last?.at || a.sharedAt));
  const working = (item) => s.members.filter((m) => m.presence && item.extId && m.presence.app === item.extId && m.id !== me);
  body.innerHTML = `
    ${s.error && s.connected ? `<p class="err">${esc(s.error)}</p>` : ''}
    <div class="home-grid">
      <div class="card span-2">
        <div class="card-head"><h2>Shared jobs</h2></div>
        ${items.length ? `<div class="job-list">${items.map((i) => {
          const here = working(i);
          return `
          <div class="job-row" data-id="${esc(i.id)}">
            <span class="job-icon">${appIcon(i)}</span>
            <div class="grow">
              <div><a href="${openItemHref(i)}"><strong>${esc(i.title)}</strong></a> <span class="tag">${esc(appName(i))}</span>${i.live ? ' <span class="live">● Live</span>' : ''}</div>
              <div class="muted small">${i.last ? `${esc(i.last.by === me ? 'You' : i.last.byName)} ${esc(i.last.text)} ${ago(i.last.at)}` : ''}${here.length ? ` · ${here.map((m) => esc(m.name)).join(', ')} ${here.length === 1 ? 'has' : 'have'} ${esc(appName(i))} open` : ''}</div>
              <div class="muted small">Shared by ${esc(i.sharedBy === me ? 'you' : i.sharedByName)} · ${i.files} file${i.files === 1 ? '' : 's'} · <code>${esc(i.scope === 'library' ? 'Files/' : '')}${esc(i.base ? `${i.base}/` : '')}${esc(i.name)}</code></div>
            </div>
            ${i.sharedBy === me || s.admin ? '<button class="btn ghost small" data-act="unshare">Stop sharing</button>' : ''}
          </div>`;
        }).join('')}</div>` : '<div class="empty">Nothing shared yet. Click <strong>Share a job…</strong>, or <strong>Share…</strong> next to a folder in Files.</div>'}
      </div>

      <div class="card">
        <div class="card-head"><h2>People</h2></div>
        <div class="people">
          <div class="person"><span class="dot ${s.connected ? '' : 'off'}"></span><strong>${esc(s.me.name)}</strong> <span class="muted">(you${s.hosting ? ', host' : s.admin ? ', started the group' : ''})</span></div>
          ${others.map((m) => `
            <div class="person" data-id="${esc(m.id)}">
              <span class="dot ${m.online ? '' : 'off'}"></span>
              <div class="grow"><strong>${esc(m.name)}</strong>${m.host ? ` <span class="muted">(${s.mode === 'folder' ? 'started the group' : 'host'})</span>` : ''}
                <div class="muted small">${m.online ? (m.presence ? `In ${esc(m.presence.appName || m.presence.app)}` : 'Online') : m.lastSeen ? `Last on ${ago(m.lastSeen)}` : 'Not connected yet'}</div></div>
              ${s.hosting && !m.host ? '<button class="btn ghost small danger" data-act="remove">Remove</button>' : ''}
            </div>`).join('')}
        </div>
        <label class="toggle"><input type="checkbox" id="show-presence" ${s.showPresence ? 'checked' : ''}> Let others see which app I have open</label>
      </div>

      <div class="card">
        <div class="card-head"><h2>Recent activity</h2></div>
        <div class="activity">${s.activity.length ? s.activity.slice(0, 25).map((a) => {
          const item = s.items.find((i) => i.id === a.itemId);
          return `<div><strong>${esc(a.by === me ? 'You' : a.byName)}</strong> ${esc(a.text)}${item && !/this job/.test(a.text) ? ` in ${esc(item.title)}` : item ? ` (${esc(item.title)})` : ''} <span class="muted small">${ago(a.at)}${a.count > 1 ? ` · ${a.count} saves` : ''}</span></div>`;
        }).join('') : '<div class="empty">Nothing yet.</div>'}</div>
      </div>

      ${s.mode === 'folder' ? `
      <div class="card span-2">
        <div class="card-head"><h2>Add a computer</h2></div>
        <p>In Dropbox, share the folder <code>${esc(s.folder.split(/[\\/]/).pop())}</code> with the person. On their computer, install Dropbox and sign in, then in the hub open <strong>Work group › Use a shared Dropbox folder</strong> and pick that folder.</p>
        <p class="muted small">Changes copy between computers as fast as Dropbox does, usually within half a minute. Anyone the folder is shared with is in the group, so to take someone out, stop sharing the folder with them in Dropbox.</p>
      </div>` : ''}
      ${s.hosting ? `
      <div class="card span-2">
        <div class="card-head"><h2>Add a computer</h2><button class="btn ghost small" id="group-code">New join code</button></div>
        ${s.host.error ? `<p class="err">${esc(s.host.error)}</p>` : ''}
        <p>On the other computer, install Extension Hub, open <strong>Work group › Join a group</strong>, and type:</p>
        <div class="invite">
          <div><span class="muted">Host address</span><code>${esc(s.host.addresses[0]?.address || `this PC's address:${s.host.port}`)}</code></div>
          <div><span class="muted">Join code</span><code>${esc(s.host.code)}</code></div>
        </div>
        ${s.host.addresses.length > 1 ? `<p class="muted small">Other addresses for this PC: ${s.host.addresses.slice(1).map((a) => `<code>${esc(a.address)}</code>${a.kind === 'tailscale' ? ' (Tailscale)' : ''}`).join(', ')}</p>` : ''}
        <p class="muted small">This works for computers on the same office network. For someone working from home, install the free Tailscale app on this PC and theirs, signed in to the same account, and use this PC's Tailscale address (it starts with 100.). If Windows asks whether Extension Hub may use the network, click <strong>Allow</strong>. This PC needs the hub open for the others to sync; when it's off, everyone keeps working and catches up later.</p>
        <p class="muted small">Making a new code stops it being used by anyone new. People already in the group stay in.</p>
      </div>` : ''}
    </div>
    <p class="group-leave">${s.hosting
      ? '<button class="btn ghost small danger" id="group-stop">Stop hosting and close the group…</button>'
      : '<button class="btn ghost small danger" id="group-leave">Leave this group…</button>'}</p>`;

  body.onclick = async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    const id = e.target.closest('[data-id]')?.dataset.id;
    try {
      if (act === 'unshare') {
        const item = s.items.find((i) => i.id === id);
        if (!(await confirmDialog(`Stop sharing "${item.title}"? Everyone keeps the copy they have now, but changes stop copying between computers.`, 'Stop sharing'))) return;
        await api(`/api/group/items/${encodeURIComponent(id)}`, { method: 'DELETE' });
        toast(`${item.title} is no longer shared.`);
      }
      if (act === 'remove') {
        const m = s.members.find((x) => x.id === id);
        if (!(await confirmDialog(`Remove ${m.name} from the group? Their computer stops syncing. They keep the files they have.`, 'Remove'))) return;
        await api(`/api/group/members/${encodeURIComponent(id)}`, { method: 'DELETE' });
      }
      if (e.target.id === 'group-code') {
        if (!(await confirmDialog('Make a new join code? The old one stops working for anyone new.', 'New code'))) return;
        await api('/api/group/new-code', { method: 'POST' });
      }
      if (e.target.id === 'group-leave') {
        if (!(await confirmDialog(`Leave ${s.group.name}? Shared jobs stay on this computer, but stop syncing.${s.mode === 'folder' ? ' The Dropbox folder stays as it is for the others.' : ''}`, 'Leave'))) return;
        await api('/api/group/leave', { method: 'POST' });
      }
      if (e.target.id === 'group-stop') {
        if (!(await confirmDialog(`Close ${s.group.name}? The other computers stop syncing and will need to join a new group. Everyone keeps the files they have now.`, 'Close the group'))) return;
        await api('/api/group/stop-hosting', { method: 'POST' });
      }
      if (act || /^group-(code|leave|stop)$/.test(e.target.id)) {
        body.innerHTML = '';
        await loadGroup();
      }
    } catch (err) {
      toast(err.message, 'error');
    }
  };
  $('#show-presence').onchange = (e) => api('/api/group/show-presence', { method: 'PUT', json: { on: e.target.checked } }).then(() => groupPresence(true));
}

// Pick the shared Dropbox folder. Resolves to { folder } to join a group already there,
// { folder, groupName } to start one, or null.
async function groupFolderPicker(dir = '') {
  let r;
  try {
    r = await api(`/api/group/folders${dir ? `?dir=${encodeURIComponent(dir)}` : ''}`);
  } catch (err) {
    toast(err.message, 'error');
    if (dir) return groupFolderPicker('');
    return null;
  }
  return new Promise((resolve) => {
    openDialog(`
      <form method="dialog" class="folder-picker">
        <h2>Choose the shared folder</h2>
        ${r.dropbox.length > 1 ? `<p class="muted small">Dropbox: ${r.dropbox.map((d) => `<button class="linkish" value="open:${esc(d.path)}">${esc(d.kind)}</button>`).join(' · ')}</p>` : ''}
        <p class="muted small"><code>${esc(r.at)}</code></p>
        ${r.isGroup ? '<p><strong>👥 This folder has a group in it.</strong></p>' : ''}
        <div class="picker-list">
          ${r.parent ? `<button class="picker-item" value="open:${esc(r.parent)}"><span>⬆️</span><span>Up a level</span></button>` : ''}
          ${r.folders.map((f) => `<div class="picker-row">
            <button class="picker-item grow" value="open:${esc(f.path)}"><span>${f.group ? '👥' : '📁'}</span><span>${esc(f.name)}</span></button>
            ${f.group ? `<button class="btn small primary" value="join:${esc(f.path)}">Join</button>` : ''}
          </div>`).join('') || '<div class="empty">No folders here.</div>'}
        </div>
        ${r.isGroup ? '' : `
        <label class="field"><span>Or start a new group: make a folder here called</span>
          <div class="row"><input name="newName" placeholder="Extension Hub Group"><button class="btn" value="new">Start group</button></div>
        </label>`}
        <div class="dialog-actions">
          <button class="btn" value="cancel">Cancel</button><span class="grow"></span>
          ${r.isGroup ? `<button class="btn primary" value="join:${esc(r.at)}">Join this group</button>` : ''}
        </div>
      </form>`, (d) => {
      const v = d.returnValue || '';
      if (v.startsWith('open:')) return resolve(groupFolderPicker(v.slice(5)));
      if (v.startsWith('join:')) return resolve({ folder: v.slice(5) });
      if (v === 'new') {
        const name = ($('input[name=newName]', d).value.trim() || 'Extension Hub Group').replace(/[\\/:*?"<>|]/g, '_');
        const sep = r.at.includes('\\') ? '\\' : '/';
        return resolve({ folder: r.at.replace(/[\\/]+$/, '') + sep + name, groupName: name });
      }
      resolve(null);
    });
  });
}

// Share one folder or file. Resolves true if it was shared.
async function shareDialog({ scope, path, name, type }) {
  const where = scope === 'library' ? 'Files' : extById(scope.slice(4))?.name || scope.slice(4);
  const suggested = type === 'folder' ? String(name) : String(name).replace(/\.cdjob\.json$|\.[^.]+$/, '');
  const title = await new Promise((resolve) => {
    openDialog(`
      <form method="dialog">
        <h2>Share with ${esc(state.group.group.name)}</h2>
        <p class="muted">Every computer in the group gets a copy of ${type === 'folder' ? 'this folder and everything in it' : 'this file'}. When anyone saves a change, it copies to the others by itself, and everyone sees who changed it.</p>
        <label class="field"><span>Job name</span><input name="v" value="${esc(suggested)}" autofocus></label>
        <div class="dialog-actions"><button class="btn" value="cancel" type="button" onclick="this.closest('dialog').close('cancel')">Cancel</button><button class="btn primary" value="ok">Share</button></div>
      </form>`, (d) => resolve(d.returnValue === 'ok' ? $('input', d).value.trim() : null));
  });
  if (title == null) return false;
  try {
    await api('/api/group/share', { method: 'POST', json: { scope, path, title } });
    toast(`${title || name} from ${where} is shared.`);
    await pollGroup();
    return true;
  } catch (err) {
    toast(err.message, 'error');
    return false;
  }
}

// Pick a job to share: in Files, or in an extension's own folder (Cabinet Designer keeps its jobs there).
async function sharePicker(scope = '', folder = '') {
  if (!scope) {
    const exts = state.extensions.filter((e) => !e.error);
    openDialog(`
      <form method="dialog" class="folder-picker">
        <h2>Share a job</h2>
        <p class="muted">Where is the job saved?</p>
        <div class="picker-list">
          <button class="picker-item" value="library"><span>📁</span><span>Files <span class="muted">(bids, schedules, documents)</span></span></button>
          ${exts.map((e) => `<button class="picker-item" value="ext:${esc(e.id)}"><span>${esc(e.icon)}</span><span>${esc(e.name)} <span class="muted">(its own saved jobs)</span></span></button>`).join('')}
        </div>
        <div class="dialog-actions"><button class="btn" value="cancel">Cancel</button></div>
      </form>`, (d) => {
      if (d.returnValue && d.returnValue !== 'cancel') sharePicker(d.returnValue, '');
    });
    return;
  }
  const list = await api(`/api/group/browse?scope=${encodeURIComponent(scope)}&folder=${encodeURIComponent(folder)}`).catch((err) => (toast(err.message, 'error'), []));
  const label = scope === 'library' ? 'Files' : extById(scope.slice(4))?.name || scope;
  const parts = folder ? folder.split('/') : [];
  openDialog(`
    <form method="dialog" class="folder-picker">
      <h2>Share a job from ${esc(label)}</h2>
      <nav class="crumbs"><button class="linkish" value="open:">${esc(label)}</button>${parts.map((p, i) => `<span>/</span><button class="linkish" value="open:${esc(parts.slice(0, i + 1).join('/'))}">${esc(p)}</button>`).join('')}</nav>
      <div class="picker-list">
        ${list.length ? list.map((f) => `
          <div class="picker-row">
            ${f.type === 'folder' ? `<button class="picker-item grow" value="open:${esc(f.path)}"><span>📁</span><span>${esc(f.name)}</span></button>` : `<span class="picker-item grow"><span>${fileIcon(f)}</span><span>${esc(f.name)}</span></span>`}
            ${f.shared ? '<span class="tag">Shared</span>' : `<button class="btn small" value="share:${esc(f.type)}:${esc(f.path)}">Share</button>`}
          </div>`).join('') : `<div class="empty">${folder ? 'This folder is empty.' : `${esc(label)} hasn't saved anything yet.`}</div>`}
      </div>
      <p class="muted small">Share a whole folder to share everything in it, including files added later.</p>
      <div class="dialog-actions"><button class="btn" value="back">Back</button><span class="grow"></span><button class="btn" value="cancel">Close</button></div>
    </form>`, async (d) => {
    const v = d.returnValue || '';
    if (v === 'back') return sharePicker();
    if (v.startsWith('open:')) return sharePicker(scope, v.slice(5));
    if (v.startsWith('share:')) {
      const [, type, ...rest] = v.split(':');
      const p = rest.join(':');
      if (await shareDialog({ scope, path: p, name: p.split('/').pop(), type })) renderGroup();
      else sharePicker(scope, folder);
    }
  });
}

// For extensions (Hub.group in hub-sdk.js).
async function groupStatusFor(extId) {
  const s = state.group || (await api('/api/group/status'));
  if (!s.joined) return { joined: false };
  return {
    joined: true,
    group: s.group.name,
    me: s.me.name,
    connected: s.connected,
    people: s.members.map((m) => ({ name: m.name, online: m.online, here: Boolean(extId && m.presence?.app === extId), me: m.id === s.me.id })),
    shared: s.items.filter((i) => i.scope === `ext:${extId}` || (i.extId && i.extId === extId)).map((i) => ({
      id: i.id, title: i.title, path: i.base ? `${i.base}/${i.name}` : i.name, inFiles: i.scope === 'library', live: i.live, last: i.last,
    })),
  };
}

async function shareFromExtension(extId, { path, title, inFiles }) {
  if (!extId) throw new Error('Unknown extension');
  const s = state.group || (await api('/api/group/status'));
  if (!s.joined) throw new Error('This computer is not in a work group. Set one up under Work group.');
  const item = await api('/api/group/share', { method: 'POST', json: { scope: inFiles ? 'library' : `ext:${extId}`, path, title } });
  await pollGroup();
  return { id: item.id, title: item.title };
}

// ---- boot -------------------------------------------------------------------

// ---- phone and tablet access -------------------------------------------------

async function phoneAccessDialog() {
  const s = await api('/api/remote/status');
  const best = s.addresses[0];
  const tailscale = s.addresses.find((a) => a.kind === 'tailscale');
  openDialog(`
    <form method="dialog" class="phone-dialog">
      <h2>Phone &amp; tablet</h2>
      <p class="muted">Open the hub on your iPhone, iPad or Android phone. It signs in with a PIN, and your files stay on this PC, so the PC and the hub need to be on.</p>
      <label class="field"><span>${s.hasPin ? 'Change PIN' : 'Choose a PIN (6 to 12 digits)'}</span>
        <div class="row"><input name="pin" type="password" inputmode="numeric" autocomplete="new-password" placeholder="${s.hasPin ? 'PIN is set' : '6 to 12 digits'}"><button class="btn" value="pin">Save PIN</button></div>
      </label>
      <label class="toggle"><input type="checkbox" name="enabled" ${s.enabled ? 'checked' : ''} ${s.hasPin ? '' : 'disabled'}> Let my phones and tablets connect</label>
      ${s.error ? `<p class="err">${esc(s.error)}</p>` : ''}
      ${s.enabled && best ? `
        <div class="phone-connect">
          <div class="qr">${s.qr || ''}</div>
          <div>
            <p><strong>On your phone, open:</strong><br><code>${esc(best.url)}</code></p>
            ${tailscale ? '<p class="muted">This is your Tailscale address, so it works anywhere your phone has internet.</p>'
              : '<p class="muted">This works on the same Wi-Fi as this PC. To use it anywhere, install the free Tailscale app on this PC and your phone and sign in to both with the same account. A Tailscale address then shows up here.</p>'}
            <p class="muted">Scan the code with the phone camera, sign in with your PIN, then in Safari tap <strong>Share › Add to Home Screen</strong> to get an app icon.</p>
            ${s.addresses.length > 1 ? `<details><summary class="muted">Other addresses</summary>${s.addresses.slice(1).map((a) => `<div><code>${esc(a.url)}</code> <span class="muted">${a.kind === 'tailscale' ? 'Tailscale' : esc(a.name)}</span></div>`).join('')}</details>` : ''}
            <p class="muted">If Windows asks whether Extension Hub may use the network, click <strong>Allow</strong>.</p>
          </div>
        </div>` : ''}
      ${s.devices ? `<p class="muted">${s.devices} device${s.devices === 1 ? '' : 's'} signed in. <button class="btn ghost small" value="signout">Sign them all out</button></p>` : ''}
      <div class="dialog-actions"><button class="btn primary" value="close">Done</button></div>
    </form>`, async (d) => {
    try {
      if (d.returnValue === 'pin') {
        await api('/api/remote/pin', { method: 'PUT', json: { pin: $('input[name=pin]', d).value.trim() } });
        toast(s.hasPin ? 'PIN changed. Phones need to sign in again.' : 'PIN saved.');
        return phoneAccessDialog();
      }
      if (d.returnValue === 'signout') {
        await api('/api/remote/sign-out-all', { method: 'POST' });
        toast('All phones and tablets are signed out.');
      }
    } catch (err) {
      toast(err.message, 'error');
      return phoneAccessDialog();
    }
  });
  $('input[name=enabled]', $('#dialog')).onchange = async (e) => {
    try {
      await api('/api/remote/enabled', { method: 'PUT', json: { enabled: e.target.checked } });
      $('#dialog').close();
      phoneAccessDialog();
    } catch (err) {
      e.target.checked = !e.target.checked;
      toast(err.message, 'error');
    }
  };
}

// ---- boot -------------------------------------------------------------------

const info = await api('/api/info');
// The phone app (phone/) runs this page with no PC: like a remote phone, but with no PC to reach.
state.remote = info.remote || info.standalone;
$('#open-explorer').hidden = Boolean(state.remote);
document.body.classList.toggle('remote', info.remote);
document.body.classList.toggle('standalone', Boolean(info.standalone));
if (info.standalone) {
  // phone-boot.js adds the phone's own menu items.
} else if (info.remote) {
  $('#sign-out').hidden = false;
  $('#sign-out').onclick = async (e) => {
    e.preventDefault();
    await fetch('/api/remote/logout', { method: 'POST' });
    location.href = '/login';
  };
} else {
  $('#phone-access').hidden = false;
  $('#phone-access').onclick = (e) => {
    e.preventDefault();
    document.body.classList.remove('menu-open');
    phoneAccessDialog().catch((err) => toast(err.message, 'error'));
  };
}
await loadExtensions();
await pollGroup();
if (!location.hash) location.hash = '#/home';
route();
setInterval(pollGroup, 5000);
// Keeps "In Cabinet Designer" fresh for the others while this window is open.
setInterval(() => groupPresence(true), 20000);
// Hub updates are installed on the PC, not from a phone.
if (!state.remote) {
  checkAppUpdate();
  setInterval(checkAppUpdate, 6 * 60 * 60 * 1000);
}
