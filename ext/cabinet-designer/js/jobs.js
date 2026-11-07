// Jobs: like Mozaik, every job is saved as its own file inside a folder. Create, open, close, rename, move, copy and delete them.
'use strict';
const JOB_ROOT = 'Jobs', JOB_EXT = '.cdjob.json';
const jobs = { open: {}, path: null, list: [], folders: [], shown: false, closed: false, folder: '', view: '', q: '', info: {}, confirm: null, status: 'saved', tab: '', sort: 'modified', dir: -1, sel: null, edit: null };
const safeName = s => String(s || '').replace(/[\\/<>:"|?*\x00-\x1f]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 80);
const jobFolderOf = path => path.slice(JOB_ROOT.length + 1, path.lastIndexOf('/'));
const jobNameOf = path => path.slice(path.lastIndexOf('/') + 1, -JOB_EXT.length);
// A folder is a path under Jobs: a customer ("Smith") or a folder inside a customer ("Smith/Estimate").
const safeFolder = s => String(s || '').split('/').map(safeName).filter(Boolean).slice(0, 2).join('/');
const jobPath = (folder, name) => `${JOB_ROOT}/${safeFolder(folder) || 'My jobs'}/${safeName(name) || 'Untitled job'}${JOB_EXT}`;
const topFolder = f => (f || '').split('/')[0];
const inFolder = (f, under) => f === under || (f || '').startsWith(under + '/');

/* ---------- Where jobs are kept: the hub's private extension folder, or this browser ---------- */
const hubJobs = {
  async list() {
    const all = await Hub.myFiles.list(JOB_ROOT, { recursive: true }).catch(() => []);
    const top = (await Hub.myFiles.list(JOB_ROOT).catch(() => [])).filter(f => f.type === 'folder').map(f => f.name);
    // Folders inside each customer, so an empty Estimate or Order folder still shows.
    const subs = await Promise.all(top.map(t => Hub.myFiles.list(`${JOB_ROOT}/${t}`).then(l => l.filter(f => f.type === 'folder').map(f => t + '/' + f.name)).catch(() => [])));
    return { files: all.filter(f => f.path.endsWith(JOB_EXT)).map(f => ({ path: f.path, modified: f.modified, size: f.size })), folders: [...top, ...subs.flat()] };
  },
  read: async path => JSON.parse(await Hub.myFiles.read(path)),
  // Upload beside the file, then swap it in, so a failed save never loses the last good copy.
  async write(path, txt) {
    const dir = path.slice(0, path.lastIndexOf('/')), [up] = await Hub.myFiles.upload(new File([txt], 'saving.tmp'), dir);
    await Hub.myFiles.delete(path).catch(() => {});
    await Hub.myFiles.rename(up.path, path);
  },
  remove: path => Hub.myFiles.delete(path),
  move: (from, to) => Hub.myFiles.rename(from, to),
  mkdir: folder => Hub.myFiles.mkdir(`${JOB_ROOT}/${folder}`),
  current: () => Hub.storage.get('current').then(r => r && (r.value || r)).catch(() => null),
  setCurrent: path => Hub.storage.set('current', path).catch(() => {}),
};
const localJobs = {
  idx() { try { return JSON.parse(localStorage.getItem(KEY + '.jobs')) || { files: {}, folders: [] }; } catch (_) { return { files: {}, folders: [] }; } },
  put(x) { localStorage.setItem(KEY + '.jobs', JSON.stringify(x)); },
  async list() { const x = this.idx(); return { files: Object.entries(x.files).map(([path, m]) => ({ path, modified: m.modified, size: m.size })), folders: x.folders }; },
  async read(path) { return JSON.parse(localStorage.getItem(KEY + '.file:' + path)); },
  async write(path, txt) { localStorage.setItem(KEY + '.file:' + path, txt); const x = this.idx(); x.files[path] = { modified: new Date().toISOString(), size: txt.length }; this.put(x); },
  async remove(path) {
    const x = this.idx();
    if (path.endsWith(JOB_EXT)) { localStorage.removeItem(KEY + '.file:' + path); delete x.files[path]; }
    else { const f = path.slice(JOB_ROOT.length + 1); x.folders = x.folders.filter(n => !inFolder(n, f)); }
    this.put(x);
  },
  async move(from, to) {
    if (!from.endsWith(JOB_EXT)) {
      const x = this.idx(), a = from.slice(JOB_ROOT.length + 1), b = to.slice(JOB_ROOT.length + 1);
      x.folders = x.folders.map(n => inFolder(n, a) ? b + n.slice(a.length) : n);
      Object.keys(x.files).filter(p => p.startsWith(from + '/')).forEach(p => { const q = to + p.slice(from.length); localStorage.setItem(KEY + '.file:' + q, localStorage.getItem(KEY + '.file:' + p)); localStorage.removeItem(KEY + '.file:' + p); x.files[q] = x.files[p]; delete x.files[p]; });
      this.put(x); return;
    }
    const txt = localStorage.getItem(KEY + '.file:' + from); await this.write(to, txt); await this.remove(from);
  },
  async mkdir(folder) { const x = this.idx(); folder.split('/').forEach((_, i, a) => { const f = a.slice(0, i + 1).join('/'); if (!x.folders.includes(f)) x.folders.push(f); }); this.put(x); },
  current: async () => { try { return localStorage.getItem(KEY + '.current'); } catch (_) { return null; } },
  setCurrent: async path => { try { localStorage.setItem(KEY + '.current', path); } catch (_) {} },
};
const jobStore = () => inHub() ? hubJobs : localJobs;

async function refreshJobs() {
  const r = await jobStore().list();
  jobs.list = r.files.map(f => ({ ...f, folder: jobFolderOf(f.path), name: jobNameOf(f.path) })).sort((a, b) => (b.modified || '').localeCompare(a.modified || ''));
  const all = [...r.folders, ...jobs.list.map(j => j.folder)].flatMap(f => f.split('/').length > 1 ? [topFolder(f), f] : [f]);
  jobs.folders = [...new Set(all)].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}
// A path for this folder and name that no other job uses (a "(2)" is added when needed).
function freePath(folder, name, except) {
  let p = jobPath(folder, name), i = 2;
  while (jobs.list.some(j => j.path === p && j.path !== except)) p = jobPath(folder, `${safeName(name)} (${i++})`);
  return p;
}

/* ---------- Saving the open job ---------- */
let jobTimer = null, jobQueue = Promise.resolve();
function saveJobSoon() {
  if (!jobs.path || jobs.closed) return;
  jobs.status = 'saving'; showSaveState();
  clearTimeout(jobTimer); jobTimer = setTimeout(() => flushJob(), 700);
}
// Writes the open job now. The file follows the job name, so renaming the job renames its file.
function flushJob() {
  clearTimeout(jobTimer);
  if (!jobs.path || !S || jobs.closed) return jobQueue;
  const txt = JSON.stringify(S), st = jobStore();
  jobQueue = jobQueue.then(async () => {
    const want = freePath(jobs.folder, S.job.name, jobs.path), old = jobs.path;
    await st.write(want, txt);
    if (want !== old) { await st.remove(old).catch(() => {}); jobs.path = want; st.setCurrent(want); }
    const j = jobs.list.find(x => x.path === old);
    if (j) Object.assign(j, { path: want, name: jobNameOf(want), modified: new Date().toISOString() }); else jobs.list.unshift({ path: want, folder: jobs.folder, name: jobNameOf(want), modified: new Date().toISOString() });
    jobs.status = 'saved'; saveNote = '';
  }).catch(e => { jobs.status = 'error'; saveNote = 'Could not save the job file: ' + e.message; }).then(showSaveState);
  return jobQueue;
}
function showSaveState() {
  const el = $('#savestate'); if (!el) return;
  el.dataset.state = jobs.status;
  el.textContent = { saving: 'Saving…', saved: 'Saved', error: 'Not saved' }[jobs.status];
  el.title = jobs.status === 'error' ? saveNote : jobs.path ? 'Saved in ' + jobs.path.slice(JOB_ROOT.length + 1) : '';
  const fl = $('#jobfolder'); if (fl) fl.textContent = jobs.folder || '';
}

/* ---------- Opening, creating and closing ---------- */
async function bootJobs() {
  const st = jobStore();
  await refreshJobs();
  const cur = await st.current();
  const tryOpen = async p => { try { const s = migrate(await st.read(p)); if (s) { setOpenJob(p); return s; } } catch (_) {} return null; };
  if (cur && jobs.list.some(j => j.path === cur)) { const s = await tryOpen(cur); if (s) return s; }
  if (jobs.list.length) { const s = await tryOpen(jobs.list[0].path); if (s) return s; }
  // First run with job files: the job saved by an older version becomes the first file, else the sample.
  let s = null, folder = 'My jobs';
  if (inHub()) { try { const r = await Hub.storage.get('job'); s = migrate(r && (r.value || r)); } catch (_) {} }
  s = s || loadLocal();
  if (!s) { s = migrate(seed()) || seed(); folder = 'Samples'; }
  const p = freePath(folder, s.job.name);
  await st.write(p, JSON.stringify(s)).catch(() => {});
  await refreshJobs(); setOpenJob(p);
  return s;
}
function setOpenJob(path) { jobs.path = path; jobs.folder = jobFolderOf(path); jobs.closed = false; jobStore().setCurrent(path); }
// Swaps the app over to another job's data and clears everything that belonged to the last one.
function loadJobState(s, path) {
  S = s; setOpenJob(path);
  undoStack = []; redoStack = [];
  Object.assign(ui, { sel: null, drawing: null, drawWalls: false, placing: null, ghost: null, open: {}, cutPick: null, cutPickOpen: false, cutRoom: 'all', setRoom: null, partSel: null });
  if (roomViewer) roomViewer.fitted = false; if (designerViewer) designerViewer.fitted = false;
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (_) {}
  hideJobs(); goTab('room'); requestAnimationFrame(fitView); showSaveState();
}
async function openJob(path) {
  if (path === jobs.path && !jobs.closed) { hideJobs(); return; }
  await flushJob();
  try {
    const s = migrate(await jobStore().read(path));
    if (!s) { flash('That file is not a Cabinet Designer job.'); return; }
    loadJobState(s, path); flash('Opened ' + s.job.name);
  } catch (e) { flash('Could not open the job: ' + e.message); }
}
// A new job starts with this job's libraries (materials, doors, hardware, products, templates) and one empty room.
function blankJob(name, customer) {
  const s = clone(S), d = seed();
  ['walls', 'cabinets', 'ctRuns'].forEach(k => delete s[k]);
  s.job = { ...s.job, name, customer: customer || '', notes: '' }; delete s.job.priceOver;
  s.rooms = [newRoom('r1', 'Room 1', [])]; s.rooms[0].wallThick = s.job.wallThick; s.rooms[0].wallHeight = s.job.wallHeight;
  s.roomId = 'r1'; s.designer = null;
  return migrate(JSON.parse(JSON.stringify(s))) || d;
}
async function newJob(name, folder, customer) {
  name = safeName(name) || 'New job'; folder = safeFolder(folder) || 'My jobs';
  await flushJob();
  const s = blankJob(name, customer), p = freePath(folder, name);
  ['status', 'stageAt', 'was', 'tag'].forEach(k => delete s.job[k]);
  await jobStore().mkdir(folder).catch(() => {});
  await jobStore().write(p, JSON.stringify(s));
  await refreshJobs();
  // The new job shows in the job manager, picked, ready to open.
  jobs.sel = p; jobs.tab = ''; jobs.view = topFolder(folder); jobs.open[topFolder(folder)] = true; jobs.q = '';
  renderJobs(); flash('Made ' + name + '. Open it to start drawing.');
}
async function closeJob() {
  await flushJob();
  jobs.closed = true; showJobs();
}

/* ---------- Job browser ---------- */
function showJobs() { jobs.shown = true; jobs.confirm = null; refreshJobs().then(renderJobs); renderJobs(); }
function hideJobs() { if (jobs.closed) return; jobs.shown = false; $('#jobsheet').hidden = true; }
// Reads each job once (per save) for its room count and a small plan picture.
async function jobInfo(j) {
  const k = j.path + '|' + j.modified;
  if (jobs.info[k]) return jobs.info[k];
  try {
    const s = j.path === jobs.path && S ? S : await jobStore().read(j.path);
    const rooms = s.rooms || [], cabs = rooms.reduce((n, r) => n + (r.cabinets || []).length, 0);
    const jb = s.job || {};
    jobs.info[k] = { customer: jb.customer || '', status: jobStatusId(jb.status), stageAt: jb.stageAt || '', was: jb.was || '', tag: jb.tag || '', rooms: rooms.length, cabs, thumb: planThumb(rooms[0]) };
  } catch (_) { jobs.info[k] = { bad: true }; }
  return jobs.info[k];
}
// Small plan drawing of a room from saved data alone (it never touches the open job).
function planThumb(r) {
  if (!r || !(r.walls || []).length) return '<div class="thumb empty">No walls yet</div>';
  const pts = r.walls.flatMap(w => [[w.x1, w.y1], [w.x2, w.y2]]), xs = pts.map(p => p[0]), ys = pts.map(p => p[1]), pad = 24;
  const x0 = Math.min(...xs) - pad, y0 = Math.min(...ys) - pad, W = Math.max(...xs) - x0 + pad, H = Math.max(...ys) - y0 + pad;
  let s = '';
  [...(r.cabinets || [])].sort((a, b) => (a.cat === 'Wall') - (b.cat === 'Wall')).forEach(c => {
    const w = r.walls.find(k => k.id === c.wall); if (!w) return;
    const g = wg(w), f = w.thick / 2 + (c.outset || 0), P = (a, b) => wallPt(w, g, c.side, a, b);
    const poly = [P(c.off, f), P(c.off + c.w, f), P(c.off + c.w, f + c.d), P(c.off, f + c.d)];
    s += `<polygon class="${c.cat === 'Wall' ? 'c-wall' : c.cat === 'Tall' ? 'c-tall' : 'c-base'} nss" points="${polyPts(poly)}"/>`;
  });
  r.walls.forEach(w => { s += `<line class="thumbwall" x1="${w.x1}" y1="${w.y1}" x2="${w.x2}" y2="${w.y2}" stroke-width="${w.thick}"/>`; });
  return `<svg class="thumb" viewBox="${x0} ${y0} ${W} ${H}" aria-hidden="true">${s}</svg>`;
}
const when = iso => { if (!iso) return ''; const d = new Date(iso), now = new Date(); return d.toDateString() === now.toDateString() ? 'Today ' + d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : d.toLocaleDateString([], { month: 'short', day: 'numeric', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' }); };
/* ---------- Trash: the only status a job has now. Customers and their folders do the sorting (the Estimates/Production/... tabs were removed 0.51.0). ---------- */
const jobStatusId = st => st === 'trash' ? 'trash' : '';
const jobMeta = j => jobs.info[j.path + '|' + j.modified] || {};
const jobStatus = j => jobStatusId(jobMeta(j).status);
// Job manager, laid out like Mozaik's: New job, the customer folders and Trash on the left, search and the job table in the middle,
// and one column of buttons on the right that act on the picked job. Customers are the top folders; each can hold folders of its own (Estimate, Order...).
function renderJobs() {
  const el = $('#jobsheet'); if (!jobs.shown) { el.hidden = true; return; }
  el.hidden = false;
  if (jobs.tab !== 'trash') jobs.tab = '';
  const q = jobs.q.toLowerCase(), cur = !jobs.closed && jobs.list.find(j => j.path === jobs.path);
  const custOf = j => jobMeta(j).customer || topFolder(j.folder);
  const subOf = j => j.folder.split('/').slice(1).join('/');
  const inView = j => !jobs.view || jobs.q || jobs.tab === 'trash' || inFolder(j.folder, jobs.view);
  const match = j => !q || [j.name, j.folder, jobMeta(j).customer, jobMeta(j).tag].join(' ').toLowerCase().includes(q);
  const rows = jobs.list.filter(j => inView(j) && match(j) && jobStatus(j) === jobs.tab);
  const key = { name: j => j.name.toLowerCase(), customer: j => custOf(j).toLowerCase(), folder: j => subOf(j).toLowerCase(), tag: j => (jobMeta(j).tag || '').toLowerCase(), cabs: j => jobMeta(j).cabs || 0, modified: j => j.modified || '' }[jobs.sort] || (j => j.modified || '');
  rows.sort((a, b) => { const x = key(a), y = key(b); return (x < y ? -1 : x > y ? 1 : 0) * jobs.dir; });
  const trashN = jobs.list.filter(j => jobStatus(j) === 'trash').length;
  const count = f => jobs.list.filter(j => inFolder(j.folder, f) && jobStatus(j) !== 'trash').length;
  const sel = rows.find(j => j.path === jobs.sel), sm = sel ? jobMeta(sel) : null, trash = jobs.tab === 'trash';
  const th = (k, l, cls = '') => `<th class="${cls}"><button class="jm-sort" data-act="jobs-sort" data-id="${k}" aria-pressed="${jobs.sort === k}">${l}${jobs.sort === k ? (jobs.dir > 0 ? ' ▲' : ' ▼') : ''}</button></th>`;
  const sid = sel ? esc(sel.path) : '', dis = sel ? '' : ' disabled';
  const custs = jobs.folders.filter(f => !f.includes('/'));
  const subsOf = c => jobs.folders.filter(f => f.startsWith(c + '/'));
  const viewTop = topFolder(jobs.view);
  const fopt = (f, on) => `<option value="${esc(f)}"${f === on ? ' selected' : ''}>${esc(f.replace('/', ' › '))}</option>`;

  // Left: New job, All jobs, then each customer with its own folders under it.
  const tree = custs.map(c => {
    const open = jobs.open[c] || viewTop === c, subs = subsOf(c);
    return `<div class="jm-cust${open ? ' open' : ''}">
      <button class="folderbtn" data-act="jobs-folder" data-id="${esc(c)}" data-drop="${esc(c)}" aria-current="${!trash && jobs.view === c}" aria-expanded="${open}">
        <i class="jm-caret" data-act="jobs-fold" data-id="${esc(c)}">${subs.length ? icon(open ? 'chevd' : 'chevr') : ''}</i>${icon('user')}<span>${esc(c)}</span><b>${count(c)}</b></button>
      ${open ? subs.map(f => `<button class="folderbtn sub" data-act="jobs-folder" data-id="${esc(f)}" data-drop="${esc(f)}" aria-current="${!trash && jobs.view === f}">${icon('folder')}<span>${esc(f.slice(c.length + 1))}</span><b>${count(f)}</b></button>`).join('') : ''}
      ${open && jobs.view && topFolder(jobs.view) === c && !jobs.view.includes('/') ? `<div class="folderadd sub"><input type="text" id="nf-sub" placeholder="New folder in ${esc(c)}" aria-label="New folder in ${esc(c)}"><button class="btn sm" data-act="folder-add-sub">${icon('plus')}Add</button></div>` : ''}
    </div>`;
  }).join('');
  const left = `<nav class="jm-left" aria-label="Customers and folders">
    <button class="jm-new" data-act="job-new-show">${icon('plus')}<span>New job</span></button>
    <div class="folders">
      <button class="folderbtn" data-act="jobs-folder" data-id="" aria-current="${!trash && !jobs.view}">${icon('stack')}<span>All jobs</span><b>${jobs.list.filter(j => jobStatus(j) !== 'trash').length}</b></button>
      <div class="jm-sec">Customers</div>
      ${tree || '<div class="muted jm-none">No customers yet.</div>'}
      <div class="folderadd"><input type="text" id="nf-name" placeholder="New customer" aria-label="New customer name"><button class="btn sm" data-act="folder-add">${icon('plus')}Add</button></div>
      <button class="folderbtn jm-trash" data-act="jobs-tab" data-id="trash" aria-current="${trash}">${icon('trash')}<span>Trash</span><b>${trashN}</b></button>
    </div>
    ${jobs.view && !trash ? `<div class="folderops">${jobs.renFolder ? `<input type="text" id="rf-name" value="${esc(jobs.view.split('/').pop())}" aria-label="Folder name"><button class="btn sm primary" data-act="folder-rename">Save</button><button class="btn sm" data-act="folder-rename-show">Cancel</button>`
      : `<button class="btn sm" data-act="folder-rename-show">${icon('edit')}Rename</button>${count(jobs.view) || jobs.list.some(j => inFolder(j.folder, jobs.view)) ? '' : `<button class="btn sm danger" data-act="folder-del">${icon('trash')}Delete</button>`}`}</div>` : ''}
  </nav>`;

  // New job: name, customer and the folder inside it. It is made here and shows in the list, picked.
  const nc = jobs.newCust ?? (viewTop || ''), ncSubs = nc ? subsOf(nc) : [];
  const newForm = !jobs.newOpen ? '' : `<div class="card newjob"><h3>${icon('plus')}New job</h3>
    <div class="newgrid"><label class="f wide"><span>Job name</span><input type="text" id="nj-name" value="${esc(jobs.newName || '')}" placeholder="Smith kitchen"></label>
    <label class="f wide"><span>Customer</span><input type="text" id="nj-cust" list="nj-custs" value="${esc(nc)}" placeholder="Smith"><datalist id="nj-custs">${custs.map(c => `<option value="${esc(c)}">`).join('')}</datalist></label>
    <label class="f wide"><span>Folder</span><select id="nj-sub"><option value="">${nc ? 'In ' + esc(nc) : 'None'}</option>${ncSubs.map(f => `<option value="${esc(f)}"${jobs.view === f ? ' selected' : ''}>${esc(f.slice(nc.length + 1))}</option>`).join('')}</select></label></div>
    <div class="row-actions"><button class="btn primary" data-act="job-create">Make job</button><button class="btn" data-act="job-new-hide">Cancel</button></div></div>`;

  // Right: one column of buttons for the picked job, like Mozaik.
  const side = trash ? `<div class="jm-side">
      <button class="btn primary" data-act="jobs-restore" data-id="${sid}"${dis}>Restore</button>
      <button class="btn danger" data-act="job-del" data-id="${sid}"${dis}>${sel && jobs.confirm === 'del' + sel.path ? 'Click again' : 'Delete forever'}</button>
      ${rows.length ? `<div class="jm-gap"></div><button class="btn danger" data-act="jobs-empty">${jobs.confirm === 'empty' ? 'Click again to empty' : 'Empty trash'}</button>` : ''}</div>`
    : `<div class="jm-side">
      <button class="btn primary" data-act="job-open" data-id="${sid}"${dis}>${sel && cur && cur.path === sel.path ? 'Keep working' : 'Open'}</button>
      <button class="btn" data-act="jobs-edit" data-id="rename"${dis}>Rename</button>
      <button class="btn" data-act="job-copy" data-id="${sid}"${dis}>Copy</button>
      <button class="btn" data-act="jobs-edit" data-id="move"${dis}>Move</button>
      <button class="btn danger" data-act="jobs-trash" data-id="${sid}"${dis}>Delete</button>
      <div class="jm-gap"></div>
      <label class="f"><span>Tag</span><input type="text" id="jm-tag" value="${esc(sm ? sm.tag || '' : '')}" placeholder="None"${dis}></label>
      <div class="jm-gap"></div>
      <button class="btn" data-act="jobs-export" data-id="${sid}"${dis}>${icon('download')}Export</button>
      <label class="btn">${icon('upload')}Import job<input type="file" multiple data-job-import hidden title="A Cabinet Designer job, or a Mozaik job (zipped job folder or .moz room files)"></label></div>`;

  const editBar = !sel ? '' : jobs.edit === 'rename' ? `<div class="jm-bar"><label class="f"><span>New name for ${esc(sel.name)}</span><input type="text" id="jm-name" value="${esc(sel.name)}"></label><button class="btn primary" data-act="jobs-rename" data-id="${sid}">Rename</button><button class="btn" data-act="jobs-edit" data-id="">Cancel</button></div>`
    : jobs.edit === 'move' ? `<div class="jm-bar"><label class="f"><span>Move ${esc(sel.name)} to</span><select id="mv-folder">${jobs.folders.map(f => fopt(f, sel.folder)).join('')}</select></label><button class="btn primary" data-act="job-move" data-id="${sid}">Move</button><button class="btn" data-act="jobs-edit" data-id="">Cancel</button></div>` : '';
  const where = jobs.q ? 'all customers' : jobs.view ? jobs.view.replace('/', ' › ') : 'all customers';

  el.innerHTML = `<div class="jobs jm">
    <div class="jobshead"><h2>${icon('folder')}Job manager</h2>
      <div class="row-actions">${cur ? `<button class="btn" data-act="jobs-back">${icon('back')}Back to ${esc(cur.name)}</button>` : ''}</div></div>
    <div class="jm-body">
      ${left}
      <section class="joblist">
        <div class="jm-top">${trash ? `<h3 class="jm-where">${icon('trash')}Trash</h3>` : ''}
          <div class="jobsearch">${icon('search')}<input type="text" id="jobq" placeholder="Search name, customer or tag" value="${esc(jobs.q)}" aria-label="Search jobs"></div></div>
        ${newForm}
        ${editBar}
        <div class="card tscroll jm-grid"><table class="t jm-table"><thead><tr><th class="jm-pic"></th>${th('name', 'Job name')}${th('customer', 'Customer', 'jm-opt')}${th('folder', 'Folder', 'jm-opt')}${th('tag', 'Tag', 'jm-opt')}${th('cabs', 'Rooms · cabinets', 'jm-opt')}${th('modified', 'Saved')}</tr></thead>
        <tbody>${rows.map(j => {
          const m = jobMeta(j), open = cur && cur.path === j.path;
          return `<tr class="jm-row${j.path === jobs.sel ? ' on' : ''}" data-act="jobs-sel" data-id="${esc(j.path)}" tabindex="0" draggable="true">
            <td class="jm-pic">${m.thumb || '<div class="thumb empty"></div>'}</td>
            <td><b class="jobname">${esc(j.name)}</b>${open ? ' <span class="chip ok">Open now</span>' : ''}</td>
            <td class="jm-opt">${esc(custOf(j))}</td><td class="jm-opt">${esc(subOf(j))}</td>
            <td class="jm-opt">${m.tag ? `<span class="chip">${esc(m.tag)}</span>` : ''}</td>
            <td class="jm-opt n">${m.bad ? '<span class="muted">Can’t read</span>' : m.rooms != null ? `${m.rooms} · ${m.cabs}` : '…'}</td>
            <td class="n">${when(j.modified)}</td></tr>`;
        }).join('') || `<tr><td colspan="7"><div class="empty-note">${jobs.q ? 'No jobs match that search.' : trash ? 'Trash is empty.' : `No jobs in ${esc(where)}.`}${trash || jobs.q ? '' : ' <button class="btn sm primary" data-act="job-new-show">New job</button>'}</div></td></tr>`}</tbody></table></div>
        <div class="jm-foot">${rows.length} job${rows.length === 1 ? '' : 's'} in ${trash ? 'Trash. Pick a job to restore it or delete it forever.' : esc(where) + '. Double-click a job to open it. Drag a job onto a customer or folder to move it.'}</div>
      </section>
      ${side}
    </div></div>`;
  // Every job is read once so the Trash count is right; the table fills in as they arrive.
  jobs.list.forEach(j => { if (!jobs.info[j.path + '|' + j.modified]) jobInfo(j).then(() => { if (jobs.shown) renderJobsSoon(); }); });
}
// Changes the job file's status or tag. The open job changes in place; any other job is read, changed and written back.
async function setJobMeta(path, patch) {
  const j = jobs.list.find(x => x.path === path); if (!j) return;
  const old = jobMeta(j);
  if (patch.status && patch.status !== old.status) patch = { ...patch, stageAt: new Date().toISOString() };
  if (path === jobs.path && !jobs.closed && S) { Object.assign(S.job, patch); try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (_) {} await flushJob(); }
  else { const st = jobStore(), s = await st.read(path); Object.assign(s.job, patch); await st.write(path, JSON.stringify(s)); }
  await refreshJobs();
  const n = jobs.list.find(x => x.path === path); if (n) jobs.info[n.path + '|' + n.modified] = { ...old, ...patch };
}
let jobsRaf = 0;
function renderJobsSoon() { cancelAnimationFrame(jobsRaf); jobsRaf = requestAnimationFrame(() => { const f = document.activeElement && document.activeElement.id; renderJobs(); if (f) { const e = document.getElementById(f); if (e) { e.focus(); if (e.setSelectionRange && e.value) e.setSelectionRange(e.value.length, e.value.length); } } }); }

async function jobAction(a, id, id2) {
  const st = jobStore();
  try {
    switch (a) {
      case 'jobs': showJobs(); break;
      case 'jobs-back': hideJobs(); break;
      case 'job-close': await closeJob(); break;
      case 'jobs-folder': jobs.tab = ''; jobs.sel = null; jobs.view = id; jobs.renFolder = false; jobs.newCust = null; if (id) jobs.open[topFolder(id)] = true; renderJobs(); break;
      case 'jobs-fold': jobs.open[id] = !(jobs.open[id] || topFolder(jobs.view) === id); if (!jobs.open[id] && topFolder(jobs.view) === id) jobs.view = id; renderJobs(); break;
      case 'jobs-tab': jobs.tab = id; jobs.sel = null; jobs.edit = null; jobs.confirm = null; renderJobs(); break;
      case 'jobs-sort': if (jobs.sort === id) jobs.dir = -jobs.dir; else { jobs.sort = id; jobs.dir = id === 'modified' || id === 'cabs' ? -1 : 1; } renderJobs(); break;
      // A second click on the same row soon after opens it (the first click redraws the table, so dblclick can't be used).
      case 'jobs-sel': {
        const again = jobs.sel === id && Date.now() - (jobs.selAt || 0) < 450; jobs.selAt = Date.now();
        if (again) { if (jobs.tab !== 'trash') await openJob(id); break; }
        if (jobs.sel !== id) { jobs.sel = id; jobs.edit = null; jobs.confirm = null; renderJobs(); }
        break;
      }
      case 'jobs-edit': jobs.edit = id || null; renderJobs(); requestAnimationFrame(() => { const i = $('#jm-name') || $('#mv-folder'); if (i) { i.focus(); i.select(); } }); break;
      case 'jobs-rename': {
        const n = safeName($('#jm-name').value), j = jobs.list.find(x => x.path === id);
        if (!n || n === j.name) { jobs.edit = null; renderJobs(); break; }
        if (id === jobs.path && !jobs.closed) { S.job.name = n; await flushJob(); jobs.sel = jobs.path; render(); }
        else { const s = await st.read(id), to = freePath(j.folder, n); s.job.name = n; await st.write(to, JSON.stringify(s)); await st.remove(id); if (id === jobs.path) { jobs.path = to; st.setCurrent(to); } jobs.sel = to; }
        jobs.edit = null; await refreshJobs(); renderJobs(); flash('Renamed'); break;
      }
      case 'jobs-trash': {
        const m = jobMeta(jobs.list.find(x => x.path === id));
        await setJobMeta(id, { status: 'trash', was: jobStatusId(m.status) });
        if (id === jobs.path && !jobs.closed) { jobs.closed = true; }
        jobs.sel = null; renderJobs(); flash('Moved to Trash'); break;
      }
      case 'jobs-restore': { const m = jobMeta(jobs.list.find(x => x.path === id)); await setJobMeta(id, { status: jobStatusId(m.was && m.was !== 'trash' ? m.was : ''), was: '' }); jobs.sel = null; renderJobs(); flash('Restored'); break; }
      case 'jobs-empty': {
        if (jobs.confirm !== 'empty') { jobs.confirm = 'empty'; renderJobs(); break; }
        jobs.confirm = null;
        for (const j of jobs.list.filter(x => jobStatus(x) === 'trash')) { if (j.path === jobs.path) { clearTimeout(jobTimer); await jobQueue; jobs.path = null; jobs.closed = true; } await st.remove(j.path); }
        await refreshJobs(); renderJobs(); flash('Trash emptied'); break;
      }
      case 'jobs-export': {
        if (id === jobs.path) await flushJob();
        const s = await st.read(id); saveFile(new Blob([JSON.stringify(s)], { type: 'application/json' }), jobNameOf(id) + JOB_EXT, 'Cabinet Designer/Jobs'); break;
      }
      case 'job-new-show': jobs.newOpen = true; jobs.newCust = null; renderJobs(); requestAnimationFrame(() => { const i = $('#nj-name'); if (i) i.focus(); }); break;
      case 'job-new-hide': jobs.newOpen = false; renderJobs(); break;
      case 'job-create': {
        const n = $('#nj-name').value, c = safeName($('#nj-cust').value), sub = $('#nj-sub').value;
        if (!safeName(n)) { $('#nj-name').focus(); flash('Give the job a name.'); break; }
        const f = sub && topFolder(sub) === c ? sub : c || 'My jobs';
        jobs.newOpen = false; jobs.newCust = null; await newJob(n, f, c); break;
      }
      case 'job-open': await openJob(id); break;
      case 'job-copy': {
        if (id === jobs.path) await flushJob();
        const j = jobs.list.find(x => x.path === id), s = await st.read(id), to = freePath(j.folder, j.name + ' copy'); s.job.name = jobNameOf(to);
        await st.write(to, JSON.stringify(s)); await refreshJobs(); jobs.sel = to; renderJobs(); flash('Copied'); break;
      }
      case 'job-move': {
        const f = safeFolder(typeof id2 === 'string' ? id2 : $('#mv-folder').value) || 'My jobs', j = jobs.list.find(x => x.path === id);
        if (f === j.folder) { jobs.edit = null; renderJobs(); break; }
        if (id === jobs.path) await flushJob();
        const to = freePath(f, j.name); await st.mkdir(f).catch(() => {}); await st.move(id, to);
        if (id === jobs.path) { jobs.path = to; jobs.folder = f; st.setCurrent(to); }
        jobs.edit = null; jobs.sel = to; await refreshJobs(); renderJobs(); showSaveState(); flash('Moved to ' + f); break;
      }
      case 'job-del': {
        if (jobs.confirm !== 'del' + id) { jobs.confirm = 'del' + id; renderJobs(); break; }
        jobs.confirm = null;
        if (id === jobs.path) { clearTimeout(jobTimer); await jobQueue; jobs.path = null; jobs.closed = true; }
        await st.remove(id); jobs.sel = null; await refreshJobs(); renderJobs(); flash('Job deleted'); break;
      }
      case 'folder-add': { const f = safeName($('#nf-name').value); if (!f) break; await st.mkdir(f); jobs.view = f; jobs.open[f] = true; await refreshJobs(); renderJobs(); requestAnimationFrame(() => { const i = $('#nf-sub'); if (i) i.focus(); }); break; }
      case 'folder-add-sub': { const c = topFolder(jobs.view), n = safeName($('#nf-sub').value); if (!c || !n) break; const f = c + '/' + n; await st.mkdir(f); jobs.view = f; jobs.open[c] = true; await refreshJobs(); renderJobs(); break; }
      case 'folder-rename-show': jobs.renFolder = !jobs.renFolder; renderJobs(); break;
      case 'folder-rename': {
        const old = jobs.view, par = old.includes('/') ? topFolder(old) + '/' : '', n = safeName($('#rf-name').value), f = n && par + n;
        if (!n || f === old) { jobs.renFolder = false; renderJobs(); break; }
        if (jobs.folders.includes(f)) { flash('A folder with that name already exists.'); break; }
        if (jobs.path && inFolder(jobs.folder, old)) await flushJob();
        await st.move(`${JOB_ROOT}/${old}`, `${JOB_ROOT}/${f}`);
        if (jobs.path && inFolder(jobFolderOf(jobs.path), old)) { jobs.folder = f + jobs.folder.slice(old.length); jobs.path = jobPath(jobs.folder, jobNameOf(jobs.path)); st.setCurrent(jobs.path); }
        if (jobs.open[old]) jobs.open[f] = true;
        jobs.view = f; jobs.renFolder = false; await refreshJobs(); renderJobs(); showSaveState(); break;
      }
      case 'folder-del': { if (jobs.list.some(j => inFolder(j.folder, jobs.view))) { flash('Move the jobs out of this folder first.'); break; } const up = jobs.view.includes('/') ? topFolder(jobs.view) : ''; await st.remove(`${JOB_ROOT}/${jobs.view}`); jobs.view = up; await refreshJobs(); renderJobs(); break; }
    }
  } catch (e) { flash('Something went wrong: ' + e.message); refreshJobs().then(renderJobs); }
}
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const a = el.dataset.act;
  if (a === 'jobs' || a === 'job-close' || a.startsWith('job-') || a.startsWith('jobs-') || a.startsWith('folder-')) { e.stopPropagation(); jobAction(a, el.dataset.id); }
}, true);
document.addEventListener('input', e => { if (e.target.id === 'jobq') { jobs.q = e.target.value; renderJobsSoon(); } });
document.addEventListener('change', e => {
  if (!jobs.shown) return;
  if (e.target.id === 'nj-cust') { jobs.newCust = safeName(e.target.value); const n = $('#nj-name') && $('#nj-name').value; jobs.newName = n; renderJobs(); requestAnimationFrame(() => { const i = $('#nj-sub'); if (i) i.focus(); }); }
  if (e.target.id === 'jm-tag' && jobs.sel) setJobMeta(jobs.sel, { tag: e.target.value.trim().slice(0, 40) }).then(renderJobs, err => flash('Could not save: ' + err.message));
  const inp = e.target.closest('input[data-job-import]');
  if (inp && inp.files[0]) { const f = [...inp.files]; (isMozaikPick(f) ? importMozaik(f).catch(err => flash('Could not import from Mozaik: ' + err.message)) : importJob(f[0])); inp.value = ''; }
});
// Drag a job row onto a customer or folder in the left column to move it there.
document.addEventListener('dragstart', e => { const r = e.target.closest && e.target.closest('tr.jm-row'); if (!r) return; e.dataTransfer.setData('text/x-cdjob', r.dataset.id); e.dataTransfer.effectAllowed = 'move'; });
document.addEventListener('dragover', e => { const d = e.target.closest && e.target.closest('[data-drop]'); if (!d || !jobs.shown || ![...e.dataTransfer.types].includes('text/x-cdjob')) return; e.preventDefault(); document.querySelectorAll('.drop-on').forEach(x => x !== d && x.classList.remove('drop-on')); d.classList.add('drop-on'); });
document.addEventListener('dragleave', e => { const d = e.target.closest && e.target.closest('[data-drop]'); if (d && !d.contains(e.relatedTarget)) d.classList.remove('drop-on'); });
document.addEventListener('drop', e => { const d = e.target.closest && e.target.closest('[data-drop]'); if (!d || !jobs.shown) return; const p = e.dataTransfer.getData('text/x-cdjob'); if (!p) return; e.preventDefault(); d.classList.remove('drop-on'); jobAction('job-move', p, d.dataset.drop); });
// A job file from Export (or another computer) comes in as a new job; it never replaces one you have.
async function importJob(file) {
  try {
    const s = migrate(JSON.parse(await file.text()));
    if (!s || !s.rooms) { flash('That file is not a Cabinet Designer job.'); return; }
    const folder = jobs.view || 'My jobs', p = freePath(folder, s.job.name || file.name.replace(/\.cdjob\.json$|\.json$/i, ''));
    s.job.name = jobNameOf(p); if (s.job.status === 'trash') s.job.status = s.job.was || '';
    await jobStore().mkdir(folder).catch(() => {}); await jobStore().write(p, JSON.stringify(s));
    await refreshJobs(); jobs.tab = jobStatusId(s.job.status); jobs.sel = p; renderJobs(); flash('Imported ' + s.job.name);
  } catch (e) { flash('Could not import: ' + e.message); }
}
document.addEventListener('keydown', e => {
  if (!jobs.shown) return;
  if (e.key === 'Enter' && e.target.closest('.newjob')) jobAction('job-create');
  else if (e.key === 'Enter' && e.target.id === 'nf-name') jobAction('folder-add');
  else if (e.key === 'Enter' && e.target.id === 'nf-sub') jobAction('folder-add-sub');
  else if (e.key === 'Enter' && e.target.id === 'rf-name') jobAction('folder-rename');
  else if (e.key === 'Enter' && e.target.id === 'jm-name') jobAction('jobs-rename', jobs.sel);
  else if (e.key === 'Enter' && e.target.id === 'mv-folder') jobAction('job-move', jobs.sel);
  else if (e.key === 'Enter' && (e.target.id === 'jm-tag')) e.target.blur();
  else if (e.key === 'Enter' && e.target.closest('tr.jm-row')) jobAction('job-open', e.target.closest('tr.jm-row').dataset.id);
  else if (e.key === 'Escape' && !jobs.closed) hideJobs();
});

/* ---------- Work group: someone on another computer saved this job ---------- */
// The hub copies a shared job's new version onto this computer and says so here. Show it right
// away, so the next save builds on their changes instead of writing over them.
if (inHub() && window.Hub && Hub.group) Hub.group.onChange(async ({ by }) => {
  await jobQueue;
  if (jobs.shown) { await refreshJobs(); renderJobs(); }
  if (!jobs.path || jobs.closed || jobs.status === 'saving') return;
  try {
    const s = migrate(await jobStore().read(jobs.path));
    if (!s || JSON.stringify(s) === JSON.stringify(S)) return;
    const keepRoom = S.roomId;
    undoStack.push(JSON.stringify(S)); redoStack = [];
    S = attachRoom(s); if (S.rooms.some(r => r.id === keepRoom)) S.roomId = keepRoom;
    fixSel(); render(); flash(`${by || 'Someone'} saved changes to this job. You're looking at the latest.`);
  } catch (_) {}
});
