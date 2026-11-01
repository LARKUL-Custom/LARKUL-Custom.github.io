// Jobs: like Mozaik, every job is saved as its own file inside a folder. Create, open, close, rename, move, copy and delete them.
'use strict';
const JOB_ROOT = 'Jobs', JOB_EXT = '.cdjob.json';
const jobs = { path: null, list: [], folders: [], shown: false, closed: false, folder: '', view: '', q: '', info: {}, confirm: null, status: 'saved', tab: '', sort: 'modified', dir: -1, sel: null, edit: null };
const safeName = s => String(s || '').replace(/[\\/<>:"|?*\x00-\x1f]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 80);
const jobFolderOf = path => path.slice(JOB_ROOT.length + 1, path.lastIndexOf('/'));
const jobNameOf = path => path.slice(path.lastIndexOf('/') + 1, -JOB_EXT.length);
const jobPath = (folder, name) => `${JOB_ROOT}/${safeName(folder) || 'My jobs'}/${safeName(name) || 'Untitled job'}${JOB_EXT}`;

/* ---------- Where jobs are kept: the hub's private extension folder, or this browser ---------- */
const hubJobs = {
  async list() {
    const all = await Hub.myFiles.list(JOB_ROOT, { recursive: true }).catch(() => []);
    const top = await Hub.myFiles.list(JOB_ROOT).catch(() => []);
    return { files: all.filter(f => f.path.endsWith(JOB_EXT)).map(f => ({ path: f.path, modified: f.modified, size: f.size })), folders: top.filter(f => f.type === 'folder').map(f => f.name) };
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
    else { const f = path.slice(JOB_ROOT.length + 1); x.folders = x.folders.filter(n => n !== f); }
    this.put(x);
  },
  async move(from, to) {
    if (!from.endsWith(JOB_EXT)) {
      const x = this.idx(), a = from.slice(JOB_ROOT.length + 1), b = to.slice(JOB_ROOT.length + 1);
      x.folders = x.folders.map(n => n === a ? b : n);
      Object.keys(x.files).filter(p => p.startsWith(from + '/')).forEach(p => { const q = to + p.slice(from.length); localStorage.setItem(KEY + '.file:' + q, localStorage.getItem(KEY + '.file:' + p)); localStorage.removeItem(KEY + '.file:' + p); x.files[q] = x.files[p]; delete x.files[p]; });
      this.put(x); return;
    }
    const txt = localStorage.getItem(KEY + '.file:' + from); await this.write(to, txt); await this.remove(from);
  },
  async mkdir(folder) { const x = this.idx(); if (!x.folders.includes(folder)) x.folders.push(folder); this.put(x); },
  current: async () => { try { return localStorage.getItem(KEY + '.current'); } catch (_) { return null; } },
  setCurrent: async path => { try { localStorage.setItem(KEY + '.current', path); } catch (_) {} },
};
const jobStore = () => inHub() ? hubJobs : localJobs;

async function refreshJobs() {
  const r = await jobStore().list();
  jobs.list = r.files.map(f => ({ ...f, folder: jobFolderOf(f.path), name: jobNameOf(f.path) })).sort((a, b) => (b.modified || '').localeCompare(a.modified || ''));
  jobs.folders = [...new Set([...r.folders, ...jobs.list.map(j => j.folder)])].sort((a, b) => a.localeCompare(b));
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
  if (!s) { s = seed(); folder = 'Samples'; }
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
  Object.assign(ui, { sel: null, drawing: null, drawWalls: false, placing: null, ghost: null, open: {}, cutCab: 'all', cutRoom: 'all', setRoom: null, partSel: null });
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
  s.job = { ...s.job, name, customer: customer || '', notes: '' };
  s.rooms = [newRoom('r1', 'Room 1', [])]; s.rooms[0].wallThick = s.job.wallThick; s.rooms[0].wallHeight = s.job.wallHeight;
  s.roomId = 'r1'; s.designer = null;
  return migrate(JSON.parse(JSON.stringify(s))) || d;
}
async function newJob(name, folder, customer) {
  name = safeName(name) || 'New job'; folder = safeName(folder) || 'My jobs';
  await flushJob();
  const s = blankJob(name, customer), p = freePath(folder, name);
  // A new job starts in the category being looked at (or the first one).
  s.job.status = jobs.cats.stages.some(x => x.id === jobs.tab) ? jobs.tab : jobs.cats.stages[0].id; s.job.stageAt = new Date().toISOString(); delete s.job.was; delete s.job.tag;
  await jobStore().mkdir(folder).catch(() => {});
  await jobStore().write(p, JSON.stringify(s));
  await refreshJobs();
  loadJobState(s, p); startWalls(); flash('New job. Click in the plan to start drawing walls.');
}
async function closeJob() {
  await flushJob();
  jobs.closed = true; showJobs();
}

/* ---------- Job browser ---------- */
function showJobs() { jobs.shown = true; jobs.confirm = null; Promise.all([refreshJobs(), stageStore.load()]).then(renderJobs); renderJobs(); }
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
/* ---------- Job categories: shop-wide stages a job moves through (Estimates, Production, Finished), then Archived, Lost and Trash ---------- */
const STAGE_DEF = { stages: [{ id: 'estimate', name: 'Estimates' }, { id: 'production', name: 'Production' }, { id: 'finished', name: 'Finished' }], archiveFrom: 'finished', archiveDays: 30 };
const FIXED_TABS = [['archived', 'Archived'], ['lost', 'Lost'], ['trash', 'Trash']];
jobs.cats = clone(STAGE_DEF);
const stageStore = {
  async load() {
    let v = null;
    if (inHub()) { try { const r = await Hub.storage.get('jobStages'); v = r && (r.value || r); } catch (_) {} }
    else { try { v = JSON.parse(localStorage.getItem(KEY + '.stages')); } catch (_) {} }
    if (v && Array.isArray(v.stages) && v.stages.length) jobs.cats = { ...clone(STAGE_DEF), ...v };
  },
  save() { const v = clone(jobs.cats); if (inHub()) return Hub.storage.set('jobStages', v).catch(() => {}); try { localStorage.setItem(KEY + '.stages', JSON.stringify(v)); } catch (_) {} },
};
const jobTabs = () => [...jobs.cats.stages.map(x => [x.id, x.name]), ...FIXED_TABS];
const tabName = id => (jobTabs().find(t => t[0] === id) || [])[1] || '';
// Jobs saved before categories (or in a category since deleted) land in the first one; Completed became Archived.
function jobStatusId(st) {
  if (st === 'completed') return 'archived';
  return jobTabs().some(t => t[0] === st) ? st : jobs.cats.stages[0].id;
}
const jobMeta = j => jobs.info[j.path + '|' + j.modified] || {};
const jobStatus = j => jobStatusId(jobMeta(j).status);
// Job manager: a tab per status, a table of jobs, and one toolbar that acts on the selected job.
function renderJobs() {
  const el = $('#jobsheet'); if (!jobs.shown) { el.hidden = true; return; }
  el.hidden = false;
  if (!jobTabs().some(t => t[0] === jobs.tab)) jobs.tab = jobs.cats.stages[0].id;
  const q = jobs.q.toLowerCase(), cur = !jobs.closed && jobs.list.find(j => j.path === jobs.path);
  const inView = j => !jobs.view || jobs.q || j.folder === jobs.view;
  const match = j => !q || [j.name, j.folder, jobMeta(j).customer, jobMeta(j).tag].join(' ').toLowerCase().includes(q);
  const rows = jobs.list.filter(j => inView(j) && match(j) && jobStatus(j) === jobs.tab);
  const key = { name: j => j.name.toLowerCase(), customer: j => (jobMeta(j).customer || '').toLowerCase(), folder: j => j.folder.toLowerCase(), tag: j => (jobMeta(j).tag || '').toLowerCase(), cabs: j => jobMeta(j).cabs || 0, modified: j => j.modified || '' }[jobs.sort] || (j => j.modified || '');
  rows.sort((a, b) => { const x = key(a), y = key(b); return (x < y ? -1 : x > y ? 1 : 0) * jobs.dir; });
  const tabN = t => jobs.list.filter(j => inView(j) && match(j) && jobStatus(j) === t).length;
  const count = f => jobs.list.filter(j => j.folder === f && jobStatus(j) !== 'trash').length;
  const sel = rows.find(j => j.path === jobs.sel), sm = sel ? jobMeta(sel) : null, trash = jobs.tab === 'trash';
  const th = (k, l, cls = '') => `<th class="${cls}"><button class="jm-sort" data-act="jobs-sort" data-id="${k}" aria-pressed="${jobs.sort === k}">${l}${jobs.sort === k ? (jobs.dir > 0 ? ' ▲' : ' ▼') : ''}</button></th>`;
  const folderList = id => `<datalist id="${id}">${jobs.folders.map(f => `<option value="${esc(f)}">`).join('')}</datalist>`;
  const sid = sel ? esc(sel.path) : '';
  const bar = !sel ? `<div class="jm-bar"><span class="muted">Click a job to pick it, double-click to open it.</span></div>`
    : jobs.edit === 'rename' ? `<div class="jm-bar"><label class="f"><span>New name</span><input type="text" id="jm-name" value="${esc(sel.name)}"></label><button class="btn sm primary" data-act="jobs-rename" data-id="${sid}">Rename</button><button class="btn sm" data-act="jobs-edit" data-id="">Cancel</button></div>`
    : jobs.edit === 'move' ? `<div class="jm-bar"><label class="f"><span>Move to folder</span><input type="text" id="mv-folder" list="jm-folders" value="${esc(sel.folder)}">${folderList('jm-folders')}</label><button class="btn sm primary" data-act="job-move" data-id="${sid}">Move</button><button class="btn sm" data-act="jobs-edit" data-id="">Cancel</button></div>`
    : trash ? `<div class="jm-bar"><b class="jm-selname">${esc(sel.name)}</b><button class="btn sm primary" data-act="jobs-restore" data-id="${sid}">Restore</button><button class="btn sm danger" data-act="job-del" data-id="${sid}">${jobs.confirm === 'del' + sel.path ? 'Click again to delete forever' : 'Delete forever'}</button></div>`
    : `<div class="jm-bar"><b class="jm-selname">${esc(sel.name)}</b>
      <button class="btn sm primary" data-act="job-open" data-id="${sid}">${cur && cur.path === sel.path ? 'Keep working' : 'Open'}</button>
      <button class="btn sm" data-act="jobs-edit" data-id="rename">Rename</button><button class="btn sm" data-act="job-copy" data-id="${sid}">Copy</button><button class="btn sm" data-act="jobs-edit" data-id="move">Move</button>
      <label class="f jm-mini"><span>Category</span><select id="jm-status">${jobTabs().filter(([k]) => k !== 'trash').map(([k, l]) => `<option value="${k}"${jobStatus(sel) === k ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
      <label class="f jm-mini"><span>Tag</span><input type="text" id="jm-tag" value="${esc(sm.tag || '')}" placeholder="None"></label>
      <button class="btn sm" data-act="jobs-export" data-id="${sid}">${icon('download')}Export</button>
      <button class="btn sm danger" data-act="jobs-trash" data-id="${sid}">Delete</button></div>`;
  el.innerHTML = `<div class="jobs">
    <div class="jobshead">
      <div class="jobstitle">${icon('folder')}<div><h2>Job manager</h2><p>Each job is saved as its own file in a folder. Open one to keep drawing, or start a new one.</p></div></div>
      <div class="row-actions">${cur ? `<button class="btn" data-act="jobs-back">${icon('back')}Back to ${esc(cur.name)}</button>` : ''}<label class="btn">${icon('upload')}Import job<input type="file" accept=".json,application/json" data-job-import hidden></label><button class="btn primary" data-act="job-new-show">${icon('plus')}New job</button></div>
    </div>
    ${jobs.newOpen ? `<div class="card newjob"><h3>${icon('plus')}New job</h3>
      <div class="newgrid"><label class="f wide"><span>Job name</span><input type="text" id="nj-name" value="${esc(jobs.newName || '')}" placeholder="Smith kitchen"></label>
      <label class="f wide"><span>Customer</span><input type="text" id="nj-cust" placeholder="Optional"></label>
      <label class="f wide"><span>Folder</span><input type="text" id="nj-folder" list="nj-folders" value="${esc(jobs.view || jobs.folder || jobs.folders[0] || 'My jobs')}">${folderList('nj-folders')}</label></div>
      <div class="note">Type a new folder name to make a folder. The new job keeps your materials, doors, hardware and products, with one empty room.</div>
      <div class="row-actions"><button class="btn primary" data-act="job-create">Create and open</button><button class="btn" data-act="job-new-hide">Cancel</button></div></div>` : ''}
    <div class="jobsbody">
      <nav class="folders" aria-label="Folders">
        <button class="folderbtn" data-act="jobs-folder" data-id="" aria-current="${!jobs.view}">${icon('stack')}<span>All jobs</span><b>${jobs.list.filter(j => jobStatus(j) !== 'trash').length}</b></button>
        ${jobs.folders.map(f => `<button class="folderbtn" data-act="jobs-folder" data-id="${esc(f)}" aria-current="${jobs.view === f}">${icon('folder')}<span>${esc(f)}</span><b>${count(f)}</b></button>`).join('')}
        <div class="folderadd"><input type="text" id="nf-name" placeholder="New folder" aria-label="New folder name"><button class="btn sm" data-act="folder-add">${icon('plus')}Add</button></div>
        ${jobs.view ? `<div class="folderops"><button class="btn sm" data-act="folder-rename-show">Rename folder</button>${jobs.list.some(j => j.folder === jobs.view) ? '' : `<button class="btn sm danger" data-act="folder-del">Delete folder</button>`}</div>
          ${jobs.renFolder ? `<div class="folderadd"><input type="text" id="rf-name" value="${esc(jobs.view)}" aria-label="Folder name"><button class="btn sm primary" data-act="folder-rename">Save</button></div>` : ''}` : ''}
      </nav>
      <section class="joblist">
        <div class="jm-top"><div class="seg jm-tabs" role="tablist" aria-label="Job status">${jobTabs().map(([k, l]) => `<button role="tab" data-act="jobs-tab" data-id="${k}" aria-selected="${jobs.tab === k}" aria-pressed="${jobs.tab === k}">${esc(l)} <b>${tabN(k)}</b></button>`).join('')}</div><button class="btn sm" data-act="jobs-cats" aria-pressed="${!!jobs.catsOpen}">${icon('sliders')}Categories</button>
          <div class="jobsearch">${icon('search')}<input type="text" id="jobq" placeholder="Search name, customer or tag" value="${esc(jobs.q)}" aria-label="Search jobs"></div></div>
        ${jobs.catsOpen ? catsPanel() : ''}
        ${bar}
        <div class="card tscroll"><table class="t jm-table"><thead><tr><th class="jm-pic"></th>${th('name', 'Job')}${th('customer', 'Customer', 'jm-opt')}${th('folder', 'Folder', 'jm-opt')}${th('tag', 'Tag', 'jm-opt')}${th('cabs', 'Rooms · cabinets', 'jm-opt')}${th('modified', 'Saved')}</tr></thead>
        <tbody>${rows.map(j => {
          const m = jobMeta(j), open = cur && cur.path === j.path;
          return `<tr class="jm-row${j.path === jobs.sel ? ' on' : ''}" data-act="jobs-sel" data-id="${esc(j.path)}" tabindex="0">
            <td class="jm-pic">${m.thumb || '<div class="thumb empty"></div>'}</td>
            <td><b class="jobname">${esc(j.name)}</b>${open ? ' <span class="chip ok">Open now</span>' : ''}</td>
            <td class="jm-opt">${esc(m.customer || '')}</td><td class="jm-opt">${esc(j.folder)}</td>
            <td class="jm-opt">${m.tag ? `<span class="chip">${esc(m.tag)}</span>` : ''}</td>
            <td class="jm-opt n">${m.bad ? '<span class="muted">Can’t read</span>' : m.rooms != null ? `${m.rooms} · ${m.cabs}` : '…'}</td>
            <td class="n">${when(j.modified)}</td></tr>`;
        }).join('') || `<tr><td colspan="7"><div class="empty-note">${jobs.q ? 'No jobs match that search.' : trash ? 'Trash is empty.' : `No jobs in ${esc(tabName(jobs.tab))}.`}${trash || jobs.q ? '' : ' <button class="btn sm primary" data-act="job-new-show">New job</button>'}</div></td></tr>`}</tbody></table></div>
        ${trash && rows.length ? `<div class="row-actions"><button class="btn sm danger" data-act="jobs-empty">${jobs.confirm === 'empty' ? `Click again to delete ${rows.length} job${rows.length > 1 ? 's' : ''} forever` : 'Empty trash'}</button></div>` : ''}
      </section>
    </div></div>`;
  // Every job is read once so the status tabs count right; the table fills in as they arrive.
  jobs.list.forEach(j => { if (!jobs.info[j.path + '|' + j.modified]) jobInfo(j).then(() => { if (jobs.shown) renderJobsSoon(); }); });
  autoArchive();
}
function catsPanel() {
  const c = jobs.cats, n = c.stages.length;
  return `<div class="card jm-cats"><h3>${icon('sliders')}Job categories</h3>
    <div class="note">Jobs move through these in order. Archived, Lost and Trash are always there.</div>
    ${c.stages.map((x, i) => `<div class="jm-cat"><input type="text" data-cat-name="${i}" value="${esc(x.name)}" aria-label="Category name" maxlength="30">
      <button class="btn sm" data-act="jobs-cat-move" data-id="${i}:-1"${i ? '' : ' disabled'} aria-label="Move up">↑</button><button class="btn sm" data-act="jobs-cat-move" data-id="${i}:1"${i < n - 1 ? '' : ' disabled'} aria-label="Move down">↓</button>
      <button class="btn sm danger" data-act="jobs-cat-del" data-id="${i}"${n > 1 ? '' : ' disabled'} aria-label="Delete ${esc(x.name)}">${icon('trash')}</button></div>`).join('')}
    <div class="row-actions"><button class="btn sm" data-act="jobs-cat-add">${icon('plus')}Add category</button></div>
    <div class="jm-arch"><span>Auto archive jobs in</span><select id="jm-archfrom" aria-label="Category to auto archive"><option value="">(off)</option>${c.stages.map(x => `<option value="${x.id}"${c.archiveFrom === x.id ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select>
      <span>after</span><input type="number" id="jm-archdays" min="1" max="3650" value="${+c.archiveDays || 30}" aria-label="Days"><span>days</span></div>
  </div>`;
}
// Jobs that have sat in the auto-archive category longer than the set days move to Archived. Runs when the job manager opens.
let archiving = false;
async function autoArchive() {
  const c = jobs.cats, days = +c.archiveDays; if (archiving || !c.archiveFrom || !(days > 0)) return;
  const due = jobs.list.filter(j => { const m = jobMeta(j); return m.status !== undefined && jobStatus(j) === c.archiveFrom && m.stageAt && Date.now() - Date.parse(m.stageAt) > days * 864e5; });
  if (!due.length) return;
  archiving = true;
  try { for (const j of due) await setJobMeta(j.path, { status: 'archived' }); flash(`${due.length} finished job${due.length > 1 ? 's' : ''} moved to Archived`); }
  catch (_) {} finally { archiving = false; }
  if (jobs.shown) renderJobs();
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

async function jobAction(a, id) {
  const st = jobStore();
  try {
    switch (a) {
      case 'jobs': showJobs(); break;
      case 'jobs-back': hideJobs(); break;
      case 'job-close': await closeJob(); break;
      case 'jobs-folder': jobs.view = id; jobs.renFolder = false; renderJobs(); break;
      case 'jobs-cats': jobs.catsOpen = !jobs.catsOpen; renderJobs(); break;
      case 'jobs-cat-add': { const i = jobs.cats.stages.length + 1; jobs.cats.stages.push({ id: uid('st'), name: 'Category ' + i }); stageStore.save(); renderJobs(); requestAnimationFrame(() => { const e = document.querySelector(`[data-cat-name="${i - 1}"]`); if (e) { e.focus(); e.select(); } }); break; }
      case 'jobs-cat-move': { const [i, d] = id.split(':').map(Number), a = jobs.cats.stages; [a[i], a[i + d]] = [a[i + d], a[i]]; stageStore.save(); renderJobs(); break; }
      case 'jobs-cat-del': {
        const x = jobs.cats.stages[+id], used = jobs.list.filter(j => jobStatus(j) === x.id).length;
        if (used && jobs.confirm !== 'cat' + x.id) { jobs.confirm = 'cat' + x.id; flash(`${used} job${used > 1 ? 's are' : ' is'} in ${x.name}. Click delete again to move ${used > 1 ? 'them' : 'it'} to ${jobs.cats.stages.find(y => y !== x).name}.`); break; }
        jobs.confirm = null; jobs.cats.stages.splice(+id, 1); if (jobs.cats.archiveFrom === x.id) jobs.cats.archiveFrom = '';
        stageStore.save(); renderJobs(); break;
      }
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
        for (const j of jobs.list.filter(x => jobStatus(x) === 'trash' && (!jobs.view || jobs.q || x.folder === jobs.view))) { if (j.path === jobs.path) { clearTimeout(jobTimer); await jobQueue; jobs.path = null; jobs.closed = true; } await st.remove(j.path); }
        await refreshJobs(); renderJobs(); flash('Trash emptied'); break;
      }
      case 'jobs-export': {
        if (id === jobs.path) await flushJob();
        const s = await st.read(id); saveFile(new Blob([JSON.stringify(s)], { type: 'application/json' }), jobNameOf(id) + JOB_EXT, 'Cabinet Designer/Jobs'); break;
      }
      case 'job-new-show': jobs.newOpen = true; renderJobs(); requestAnimationFrame(() => { const i = $('#nj-name'); if (i) i.focus(); }); break;
      case 'job-new-hide': jobs.newOpen = false; renderJobs(); break;
      case 'job-create': { const n = $('#nj-name').value, f = $('#nj-folder').value, c = $('#nj-cust').value; if (!safeName(n)) { $('#nj-name').focus(); flash('Give the job a name.'); break; } jobs.newOpen = false; await newJob(n, f, c); break; }
      case 'job-open': await openJob(id); break;
      case 'job-copy': {
        if (id === jobs.path) await flushJob();
        const j = jobs.list.find(x => x.path === id), s = await st.read(id), to = freePath(j.folder, j.name + ' copy'); s.job.name = jobNameOf(to);
        await st.write(to, JSON.stringify(s)); await refreshJobs(); jobs.sel = to; renderJobs(); flash('Copied'); break;
      }
      case 'job-move': {
        const f = safeName($('#mv-folder').value) || 'My jobs', j = jobs.list.find(x => x.path === id);
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
      case 'folder-add': { const f = safeName($('#nf-name').value); if (!f) break; await st.mkdir(f); jobs.view = f; await refreshJobs(); renderJobs(); break; }
      case 'folder-rename-show': jobs.renFolder = !jobs.renFolder; renderJobs(); break;
      case 'folder-rename': {
        const f = safeName($('#rf-name').value), old = jobs.view; if (!f || f === old) { jobs.renFolder = false; renderJobs(); break; }
        if (jobs.folders.includes(f)) { flash('A folder with that name already exists.'); break; }
        if (jobs.path && jobs.folder === old) await flushJob();
        await st.move(`${JOB_ROOT}/${old}`, `${JOB_ROOT}/${f}`);
        if (jobs.path && jobFolderOf(jobs.path) === old) { jobs.path = jobPath(f, jobNameOf(jobs.path)); jobs.folder = f; st.setCurrent(jobs.path); }
        jobs.view = f; jobs.renFolder = false; await refreshJobs(); renderJobs(); showSaveState(); break;
      }
      case 'folder-del': await st.remove(`${JOB_ROOT}/${jobs.view}`); jobs.view = ''; await refreshJobs(); renderJobs(); break;
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
  if (e.target.id === 'jm-status' && jobs.sel) setJobMeta(jobs.sel, { status: e.target.value }).then(() => { flash('Moved to ' + tabName(e.target.value)); jobs.sel = null; renderJobs(); }, err => flash('Could not save: ' + err.message));
  if (e.target.id === 'jm-tag' && jobs.sel) setJobMeta(jobs.sel, { tag: e.target.value.trim().slice(0, 40) }).then(renderJobs, err => flash('Could not save: ' + err.message));
  if (e.target.dataset.catName !== undefined) { const x = jobs.cats.stages[+e.target.dataset.catName], v = e.target.value.trim().slice(0, 30); if (x && v) { x.name = v; stageStore.save(); } renderJobs(); }
  if (e.target.id === 'jm-archfrom') { jobs.cats.archiveFrom = e.target.value; stageStore.save(); renderJobs(); }
  if (e.target.id === 'jm-archdays') { jobs.cats.archiveDays = Math.max(1, Math.min(3650, +e.target.value || 30)); stageStore.save(); renderJobs(); }
  const inp = e.target.closest('input[data-job-import]');
  if (inp && inp.files[0]) { importJob(inp.files[0]); inp.value = ''; }
});
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
  else if (e.key === 'Enter' && e.target.id === 'jm-name') jobAction('jobs-rename', jobs.sel);
  else if (e.key === 'Enter' && e.target.id === 'mv-folder') jobAction('job-move', jobs.sel);
  else if (e.key === 'Enter' && (e.target.id === 'jm-tag' || e.target.id === 'jm-archdays' || e.target.dataset.catName !== undefined)) e.target.blur();
  else if (e.key === 'Enter' && e.target.closest('tr.jm-row')) jobAction('job-open', e.target.closest('tr.jm-row').dataset.id);
  else if (e.key === 'Escape' && !jobs.closed) hideJobs();
});
