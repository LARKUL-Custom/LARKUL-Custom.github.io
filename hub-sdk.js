// Hub SDK: include this in an extension page to use the hub's storage, files and reminders.
//
//   <script src="/hub-sdk.js"></script>                      (extensions with a "ui" page)
//   <script src="http://localhost:4321/hub-sdk.js"
//           data-extension="my-app"></script>               (separate apps embedded by "url")
//
// Then use the global `Hub`, for example:
//   const files = await Hub.files.list();
//   await Hub.storage.set('settings', { theme: 'dark' });
//   await Hub.reminders.add({ title: 'Submit bid', due: '2026-11-03T17:00:00Z' });
(function () {
  const script = document.currentScript;
  const base = script ? new URL(script.src, location.href).origin : location.origin;
  const fromPath = location.pathname.match(/^\/ext\/([^/]+)/);
  const id = (script && script.dataset.extension) || (fromPath && decodeURIComponent(fromPath[1]));
  if (!id) console.warn('[Hub] Could not tell which extension this is. Add data-extension="your-id" to the script tag.');

  async function call(path, opts = {}) {
    // Tells the hub which extension is asking, so its files land in the folders the user chose.
    const init = { method: opts.method || 'GET', headers: id ? { 'X-Hub-Extension': id } : {} };
    if (opts.json !== undefined) {
      init.body = JSON.stringify(opts.json);
      init.headers['Content-Type'] = 'application/json';
    }
    const res = await fetch(base + path, init);
    const data = res.headers.get('content-type')?.includes('json') ? await res.json() : await res.text();
    if (!res.ok) throw new Error((data && data.error) || res.statusText);
    return data;
  }

  // Talk to the hub page this extension is shown inside.
  let seq = 0;
  const pending = new Map();
  const groupListeners = new Set();
  window.addEventListener('message', (e) => {
    const m = e.data;
    if (m && m.__hub === true && m.type === 'groupChanged' && e.source === window.parent) {
      for (const fn of groupListeners) try { fn({ id: m.itemId, title: m.title, by: m.byName }); } catch (err) { console.error(err); }
      return;
    }
    if (!m || m.__hub !== true || !pending.has(m.replyTo)) return;
    const { resolve, reject } = pending.get(m.replyTo);
    pending.delete(m.replyTo);
    m.error ? reject(new Error(m.error)) : resolve(m.result);
  });
  function toHub(type, payload = {}, expectReply = false) {
    if (window.parent === window) return Promise.resolve(null);
    const msgId = ++seq;
    window.parent.postMessage({ __hub: true, id: msgId, type, ...payload }, '*');
    if (!expectReply) return Promise.resolve();
    return new Promise((resolve, reject) => pending.set(msgId, { resolve, reject }));
  }

  function upload(prefix, files, folder = '', onProgress) {
    return new Promise((resolve, reject) => {
      const body = new FormData();
      for (const f of files instanceof File ? [files] : files) body.append('files', f);
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${base}${prefix}/upload?folder=${encodeURIComponent(folder)}`);
      if (id) xhr.setRequestHeader('X-Hub-Extension', id);
      if (onProgress) xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
      xhr.onload = () => (xhr.status < 300 ? resolve(JSON.parse(xhr.responseText)) : reject(new Error(xhr.responseText)));
      xhr.onerror = () => reject(new Error('Upload failed'));
      xhr.send(body);
    });
  }

  function fileApi(prefix) {
    const q = encodeURIComponent;
    return {
      /** List a folder ('' is the top). Pass { recursive: true } to list every file below it. */
      list: (folder = '', { recursive = false } = {}) => call(`${prefix}?folder=${q(folder)}${recursive ? '&recursive=1' : ''}`),
      /** Upload File objects (from an <input type=file> or drag and drop). onProgress gets 0..1. */
      upload: (files, folder = '', onProgress) => upload(prefix, files, folder, onProgress),
      /** URL to view a file in the browser, or to fetch() its contents. */
      url: (path) => `${base}${prefix}/raw?path=${q(path)}${id ? `&ext=${q(id)}` : ''}`,
      downloadUrl: (path) => `${base}${prefix}/raw?download=1&path=${q(path)}${id ? `&ext=${q(id)}` : ''}`,
      /** Read a file's contents: as 'text', 'json', 'blob' or 'arrayBuffer'. */
      read: async (path, as = 'text') => (await fetch(`${base}${prefix}/raw?path=${q(path)}`, { headers: id ? { 'X-Hub-Extension': id } : {} }))[as](),
      mkdir: (path) => call(`${prefix}/folder`, { method: 'POST', json: { path } }),
      rename: (from, to) => call(`${prefix}/rename`, { method: 'POST', json: { from, to } }),
      delete: (path) => call(`${prefix}?path=${q(path)}`, { method: 'DELETE' }),
      /**
       * Opens a folder in Explorer on the hub's PC (the nearest existing folder above it if it
       * isn't there yet). Resolves to { opened, path, reason? }; opened is false on a phone.
       */
      reveal: (path = '') => call(`${prefix}/reveal`, { method: 'POST', json: { path } }),
    };
  }

  window.Hub = {
    id,
    baseUrl: base,
    /** The shared file library every extension and the Files tab can see. */
    files: fileApi('/api/files'),
    /** A private folder only this extension uses. */
    myFiles: fileApi(`/api/ext/${id}/files`),
    /** Small key-value storage for this extension: settings, lists, saved state. */
    storage: {
      get: (key) => call(`/api/ext/${id}/storage/${encodeURIComponent(key)}`),
      set: (key, value) => call(`/api/ext/${id}/storage/${encodeURIComponent(key)}`, { method: 'PUT', json: { value } }),
      delete: (key) => call(`/api/ext/${id}/storage/${encodeURIComponent(key)}`, { method: 'DELETE' }),
      all: () => call(`/api/ext/${id}/storage`),
    },
    /** Reminders show on the hub's home page. `due` is an ISO date string or null. */
    reminders: {
      list: () => call('/api/home/reminders'),
      add: async ({ title, due = null, notes = '' }) => {
        const r = await call('/api/home/reminders', { method: 'POST', json: { title, due, notes, source: id } });
        toHub('remindersChanged');
        return r;
      },
      complete: (reminderId, done = true) => call(`/api/home/reminders/${reminderId}`, { method: 'PATCH', json: { done } }),
    },
    business: () => call('/api/home/business'),
    /** Calls a route defined in this extension's server.js, e.g. Hub.api('/summary'). */
    api: (path, opts) => call(`/api/ext/${id}${path}`, opts),
    /** Opens the hub's file picker. Resolves to { name, path, size, ... } or null if cancelled. */
    pickFile: () => toHub('pickFile', {}, true),
    /** Shows a small message in the corner of the hub. */
    notify: (text, level = 'info') => toHub('notify', { text, level }),
    /**
     * Work group: jobs shared with the company's other computers.
     *   await Hub.group.status()   -> { joined, group, me, connected, people: [{ name, online, here }], shared: [{ id, title, path, live, last }] }
     *   await Hub.group.share({ path: 'Jobs/My jobs/Kitchen.cdjob.json', title: 'Kitchen' })   // a path in Hub.myFiles
     *   await Hub.group.share({ path: 'Bids/Smith', inFiles: true })                           // a folder in Hub.files
     *   Hub.group.onChange(({ id, title, by }) => reloadJob())   // someone else's change just arrived on this computer
     * Shared files sync by themselves: keep saving with Hub.myFiles / Hub.files as usual.
     */
    group: {
      status: () => toHub('groupStatus', {}, true),
      share: ({ path, title = '', inFiles = false }) => toHub('groupShare', { path, title, inFiles }, true),
      onChange: (fn) => {
        groupListeners.add(fn);
        return () => groupListeners.delete(fn);
      },
    },
    /** Switches the hub to another tab, e.g. '#/files' or '#/ext/scheduler'. */
    navigate: (to) => toHub('navigate', { to }),
  };
})();
