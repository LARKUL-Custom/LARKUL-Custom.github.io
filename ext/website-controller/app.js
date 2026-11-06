/* LARKUL website controller (the page). Plain JavaScript, no build step.
   Talks to ./server.js through /api/ext/website-controller, which adds your passwords on the hub's side.
   Your documents live in the hub library under Website/: Past work/, Requests/, Backups/, Guides/. */
"use strict";
const ID = "website-controller";
const BASE = `/api/ext/${ID}`;
const ROOT = "Website";
const DIRS = { work: `${ROOT}/Past work`, requests: `${ROOT}/Requests`, backups: `${ROOT}/Backups`, guides: `${ROOT}/Guides` };
const GUIDES = ["GO-LIVE.md", "Website-README.md", "Admin-setup.md", "AI-renders-setup.md", "Design-emails-setup.md"];
const GUIDES_VERSION = 2;          // 2: adds Design-emails-setup.md
const IMG = /\.(jpe?g|png|webp|avif|gif)$/i;

/* ---------- little helpers ---------- */
const $ = s => document.querySelector(s);
function h(tag, attrs, ...kids){
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})){
    if (v == null || v === false) continue;
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "class") el.className = v;
    else if (k === "style") el.style.cssText = v;
    else if (k in el && k !== "list" && typeof v !== "string") el[k] = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of kids.flat(Infinity)) if (c != null && c !== false) el.append(c.nodeType ? c : String(c));
  return el;
}
const J = JSON.stringify;
const clone = o => JSON.parse(J(o));
const plain = o => !!o && typeof o === "object" && !Array.isArray(o);
const money = n => n == null || !isFinite(n) ? "" : "$" + (+n).toLocaleString("en-US", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
const bytes = n => n == null ? "" : n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : n < 1073741824 ? `${(n / 1048576).toFixed(1)} MB` : `${(n / 1073741824).toFixed(2)} GB`;
const when = iso => { if (!iso) return ""; const d = new Date(iso); return isNaN(d) ? "" : d.toLocaleString([], { month: "short", day: "numeric", year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric", hour: "numeric", minute: "2-digit" }); };
const ago = iso => { const s = (Date.now() - new Date(iso)) / 1000; if (!isFinite(s)) return ""; if (s < 90) return "just now"; if (s < 5400) return `${Math.round(s / 60)} min ago`; if (s < 129600) return `${Math.round(s / 3600)} h ago`; return `${Math.round(s / 86400)} days ago`; };
const today = () => new Date().toISOString().slice(0, 10);
const safeName = s => String(s || "").replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim().slice(0, 80) || "untitled";
const slugOf = t => String(t || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50) || "project";
const isDir = e => /dir|folder/i.test(e.type || "") || e.isDir === true || e.directory === true;
const typeOf = name => ({ jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", avif: "image/avif", gif: "image/gif", pdf: "application/pdf" })[(name.split(".").pop() || "").toLowerCase()] || "";

let toastTimer;
function toast(msg, bad){
  const t = $("#toast"); t.textContent = msg; t.className = "wc-toast" + (bad ? " bad" : ""); t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.hidden = true, bad ? 6000 : 3500);
}
const notify = msg => { try { Hub.notify(msg); } catch { toast(msg); } };
function ask(question, yes = "OK", detail){
  return new Promise(ok => {
    const bg = h("div", { class: "modal-bg" });
    const done = v => { bg.remove(); ok(v); };
    bg.append(h("div", { class: "modal", style: "width:min(440px,100%)" }, h("h2", {}, question), detail ? h("p", { class: "muted", style: "margin:0" }, detail) : null,
      h("div", { class: "row right" }, h("button", { class: "btn", onclick: () => done(false) }, "Cancel"), h("button", { class: "btn primary", onclick: () => done(true) }, yes))));
    document.body.append(bg);
  });
}
function modal(title, ...body){
  const bg = h("div", { class: "modal-bg" });
  const box = h("div", { class: "modal" }, h("div", { class: "row" }, h("h2", { class: "grow" }, title), h("button", { class: "btn sm", onclick: () => bg.remove() }, "Close")), ...body);
  bg.append(box); document.body.append(bg);
  return { bg, box, close: () => bg.remove() };
}

/* ---------- talking to server.js ---------- */
async function api(path, opt = {}){
  const o = { ...opt, headers: { ...(opt.headers || {}) } };
  if (o.json !== undefined){ o.body = J(o.json); o.headers["Content-Type"] = "application/json"; delete o.json; }
  const r = await fetch(BASE + path, o);
  const ct = r.headers.get("content-type") || "";
  if (!ct.includes("json")){ if (!r.ok) throw Object.assign(new Error(`The hub answered ${r.status}.`), { status: r.status }); return r; }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || `The hub answered ${r.status}.`), { status: r.status });
  return j;
}
const store = {
  async get(k, d){ try { const v = await Hub.storage.get(k); return v == null ? d : v; } catch { return d; } },
  set: (k, v) => Hub.storage.set(k, v)
};
async function listLib(folder, recursive){ try { return (await Hub.files.list(folder, { recursive: !!recursive })) || []; } catch { return []; } }
async function ensureDir(path){ try { await Hub.files.mkdir(path); } catch { /* already there */ } }
async function saveToLibrary(folder, name, blob){
  await ensureDir(folder);
  try { await Hub.files.delete(`${folder}/${name}`); } catch { /* not there yet; the hub would save a second copy as "name (1)" */ }
  const file = new File([blob], name, { type: blob.type || "application/octet-stream" });
  await Hub.files.upload([file], folder, () => {});
  return `${folder}/${name}`;
}

/* ---------- the site's catalog, read the same way your admin page reads it ---------- */
let SETTINGS = {}, DEF = null, LIVE = { data: null };
async function loadCatalog(force){
  if (DEF && !force) return;
  const html = await (await api("/site/index")).text();
  const eng = html.match(/<script id="larkul-engine">([^]*?)<\/script>/);
  const cat = html.match(/<!-- ===== LARKUL CATALOG[^]*?<script>([^]*?)<\/script>\s*<!-- ===== END OF CATALOG/);
  if (!eng || !cat) throw new Error("Couldn't read the catalog in your site's index.html.");
  new Function("window", eng[1])(window);
  const fake = {}; new Function("window", cat[1])(fake);
  DEF = fake.SHOP;
  DEF.PRICING = DEF.PRICING || { values: {}, formulas: {} };
  if (DEF.DESIGNER) DEF.DESIGNER.formulas = DEF.DESIGNER.formulas || { cabinet: "build + box + doors + drawers + hardware + inside + ends + back + pocket + kick + crown", install: "baseWallFeet * perFoot + tallFeet * tallPerFoot" };
}
function build(saved){ const d = clone(DEF); if (saved) LarkulPrice.applySaved(d, clone(saved)); d.PRICING.values = d.PRICING.values || {}; d.PRICING.formulas = d.PRICING.formulas || {}; return d; }
function changesFrom(def, cur){
  const out = {};
  for (const k of Object.keys(cur)){
    if (plain(def[k]) && plain(cur[k])){
      const s = {}; for (const j of Object.keys(cur[k])) if (J(def[k][j]) !== J(cur[k][j])) s[j] = cur[k][j];
      if (Object.keys(s).length) out[k] = s;
    } else if (J(def[k]) !== J(cur[k])) out[k] = cur[k];
  }
  return out;
}
async function freshDraft(){
  await loadCatalog();
  const live = await api("/admin/catalog");
  LIVE = live && live.data ? live : { data: null };
  return build(LIVE.data);
}
// Re-reads what's live right before saving, so changes made on the admin page in the meantime aren't lost.
async function publishWith(change, note){
  const d = await freshDraft();
  change(d);
  const data = changesFrom(DEF, d);
  const r = await api("/admin/catalog", { method: "PUT", headers: { "Content-Type": "application/octet-stream" }, body: J({ data, note: (note || "").slice(0, 200) }) });
  LIVE = { savedAt: r.savedAt, note, data };
  return d;
}
const siteLink = u => { if (!u) return ""; try { return new URL(u, SETTINGS.siteUrl + "/").href; } catch { return u; } };

/* ---------- photos: shrink like the admin page does, then send to the site ---------- */
const MAX_SIDE = 2400, MAX_SEND = 5.5 * 1048576;
async function shrink(file){
  if (!/^image\/(jpeg|png|webp|avif)$/.test(file.type)) return { blob: file, type: file.type };
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error("This photo can't be opened in the browser (iPhone HEIC photos need to be saved as JPG first).")); i.src = url; });
    const w = img.naturalWidth, hh = img.naturalHeight, k = Math.min(1, MAX_SIDE / Math.max(w, hh));
    if (k === 1 && file.size < 1.5 * 1048576) return { blob: file, type: file.type, w, h: hh };
    const c = document.createElement("canvas"); c.width = Math.round(w * k); c.height = Math.round(hh * k);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    const type = file.type === "image/png" ? "image/webp" : "image/jpeg";
    const blob = await new Promise(ok => c.toBlob(ok, type, 0.86));
    return { blob: blob || file, type: blob ? type : file.type, w: c.width, h: c.height };
  } finally { URL.revokeObjectURL(url); }
}
async function sendLibraryFile(path, folder){
  const name = path.split("/").pop();
  const r = await fetch(Hub.files.url(path));
  if (!r.ok) throw new Error(`Couldn't open ${name} from the library.`);
  const blob = await r.blob();
  const s = await shrink(new File([blob], name, { type: typeOf(name) || blob.type }));
  if (s.blob.size > MAX_SEND) throw new Error(`${name} is still over 5.5 MB after shrinking.`);
  const q = new URLSearchParams({ name }); if (s.w) { q.set("w", s.w); q.set("h", s.h); } if (folder) q.set("folder", folder);
  return api("/admin/files?" + q, { method: "POST", headers: { "Content-Type": s.type }, body: s.blob });
}

/* ---------- navigation ---------- */
const TABS = [["home", "Overview"], ["preview", "Preview"], ["work", "Past work"], ["prices", "Prices"], ["requests", "Requests"], ["backups", "Backups"], ["launch", "Launch & dates"], ["settings", "Settings"]];
let TAB = "home", NEW_REQUESTS = 0;
try { TAB = sessionStorage.getItem("wc-tab") || "home"; } catch {}
function drawTabs(){
  $("#tabs").replaceChildren(...TABS.map(([id, label]) => h("a", { href: "javascript:void 0", class: id === TAB ? "on" : "", onclick: () => go(id) },
    label, id === "requests" && NEW_REQUESTS ? h("span", { class: "badge" }, NEW_REQUESTS) : id === "sync" && SYNC_PENDING ? h("span", { class: "badge" }, SYNC_PENDING) : null)));
  $("#siteLabel").textContent = SETTINGS.siteUrl ? SETTINGS.siteUrl.replace(/^https?:\/\//, "") : "not set up";
}
async function go(id){
  TAB = id; try { sessionStorage.setItem("wc-tab", id); } catch {}
  drawTabs();
  const view = $("#view");
  view.replaceChildren(h("p", { class: "muted" }, "Loading…"));
  try { view.replaceChildren(await V[id]()); }
  catch (e) { view.replaceChildren(problem(e)); }
}
function problem(e){
  const needsSetup = /Settings/.test(e.message);
  return h("div", { class: "box" }, h("p", { class: "err", style: "margin-top:0" }, e.message),
    needsSetup ? h("button", { class: "btn primary", onclick: () => go("settings") }, "Open Settings") : h("button", { class: "btn", onclick: () => go(TAB) }, "Try again"));
}
const head = (title, text) => [h("h2", {}, title), text ? h("p", { class: "lead muted" }, text) : null];
const V = {};

/* ======================= Overview ======================= */
V.home = async () => {
  if (!SETTINGS.siteUrl) return h("div", {}, head("Welcome", "This tab looks after your LARKUL website: past-work photos, prices, customer requests, backups and deploys."),
    h("div", { class: "box" }, h("h3", {}, "First, tell it where your website is"),
      h("p", { class: "muted", style: "margin-top:0" }, "Until the site is on Netlify, use the netlify.app address. After larkul.com points to Netlify, change it to https://larkul.com."),
      h("div", { class: "row" },
        h("button", { class: "btn primary", onclick: () => go("preview") }, "Preview the site on this PC"),
        h("button", { class: "btn", onclick: () => go("settings") }, "Open Settings"))),
    h("p", { class: "muted small" }, "You don't need Netlify to look at or test the site. The Preview tab runs the copy that came with this update, right here on your PC."));
  const s = await api("/status");
  const pageOk = s.page?.ok, adminOk = s.admin?.ok;
  const card = (title, state, big, sub, ...extra) => h("div", { class: "box" }, h("div", { class: "small muted" }, h("span", { class: "dot " + state }), title), h("div", { class: "big" }, big), sub ? h("div", { class: "small muted" }, sub) : null, ...extra);
  const d = s.netlify?.deploy;
  const deployState = d ? ({ ready: "ok", error: "bad", building: "warn", enqueued: "warn", processing: "warn", new: "warn", uploading: "warn" })[d.state] || "" : "";
  const deployBtn = SETTINGS.hasBuildHook ? h("button", { class: "btn sm", style: "margin-top:8px", onclick: deployNow }, "Deploy now") : null;
  const out = h("div", {}, head("Overview"),
    h("div", { class: "cards" },
      card("Website", pageOk ? "ok" : "bad", pageOk ? "Online" : "Not answering", pageOk ? `${s.siteUrl.replace(/^https?:\/\//, "")} · ${s.page.ms} ms` : (s.page?.error || `Answered ${s.page?.status}`)),
      card("Admin connection", adminOk ? "ok" : s.admin?.missing ? "warn" : "bad", adminOk ? "Connected" : s.admin?.missing ? "No password yet" : "Not connected",
        adminOk ? "Prices, photos and backups work from here." : s.admin?.missing ? "Add your admin password in Settings." : (s.admin?.error || "")),
      card("Last published", s.published?.savedAt ? "ok" : s.published?.error ? "bad" : "", s.published?.savedAt ? ago(s.published.savedAt) : s.published?.error ? "Can't tell" : "Nothing yet",
        s.published?.savedAt ? [when(s.published.savedAt), s.published.note].filter(Boolean).join(" · ") : (s.published?.error || "The site shows what's written in index.html.")),
      card("Last deploy", s.netlify?.missing ? "warn" : deployState || (s.netlify?.ok ? "" : "bad"),
        s.netlify?.missing ? "Netlify not linked" : !s.netlify?.ok ? "Can't tell" : d ? d.state[0].toUpperCase() + d.state.slice(1) : "No deploys yet",
        s.netlify?.missing ? "Add a Netlify token in Settings to see deploys and form requests." : !s.netlify?.ok ? s.netlify.error : d ? [ago(d.created), d.title].filter(Boolean).join(" · ") : "", deployBtn)),
    h("div", { class: "box", style: "margin-top:12px" }, h("h3", {}, "Open"),
      h("div", { class: "row" },
        h("button", { class: "btn primary", onclick: () => go("preview") }, "Preview on this PC"),
        h("a", { class: "btn", href: s.siteUrl, target: "_blank", rel: "noopener" }, "Website"),
        h("a", { class: "btn", href: s.siteUrl + "/admin", target: "_blank", rel: "noopener" }, "Admin page"),
        h("a", { class: "btn", href: s.siteUrl + "/#shop", target: "_blank", rel: "noopener" }, "Shop"),
        h("a", { class: "btn", href: s.siteUrl + "/#design", target: "_blank", rel: "noopener" }, "3D designer"),
        h("a", { class: "btn", href: s.siteUrl + "/#pricer", target: "_blank", rel: "noopener" }, "Quick quote"),
        s.netlifySite ? h("a", { class: "btn", href: `https://app.netlify.com/sites/${encodeURIComponent(s.netlifySite.replace(/\.netlify\.app$/, ""))}/overview`, target: "_blank", rel: "noopener" }, "Netlify") : null,
        h("button", { class: "btn", onclick: () => { try { Hub.navigate("#/files"); } catch {} } }, "Website files in the library"))),
    h("div", { class: "box", style: "margin-top:12px" }, h("h3", {}, "Do something"),
      h("div", { class: "row" },
        h("button", { class: "btn", onclick: () => go("work") }, "Add past-work photos"),
        h("button", { class: "btn", onclick: () => go("prices") }, "Change a price"),
        h("button", { class: "btn", onclick: () => go("requests") }, NEW_REQUESTS ? `See ${NEW_REQUESTS} new request${NEW_REQUESTS > 1 ? "s" : ""}` : "See quote & order requests"),
        h("button", { class: "btn", onclick: backupNow }, "Back up the site now"))));
  autoBackup(adminOk);
  return out;
};
/* ======================= Preview (the site copy bundled in site/, served by the hub) ======================= */
const PREVIEW = "site/index.html";
let PREVIEW_AT = "";
V.preview = async () => {
  const pages = [["", "Home"], ["shop", "Shop"], ["cabinets", "Custom cabinets"], ["design", "3D designer"], ["pricer", "Quick quote"], ["work", "Past work"], ["quote", "Free quote"], ["cart", "Cart"]];
  const frame = h("iframe", { class: "preview", src: PREVIEW + (PREVIEW_AT ? "#" + PREVIEW_AT : ""), title: "LARKUL website preview" });
  const open = h("a", { class: "btn", href: PREVIEW, target: "_blank", rel: "noopener" }, "Open in a new window");
  const pick = (k, b) => {
    PREVIEW_AT = k;
    [...row.querySelectorAll("button")].forEach(x => x.classList.toggle("primary", x === b));
    frame.src = PREVIEW + "?t=" + Date.now().toString(36) + (k ? "#" + k : "");
    open.href = PREVIEW + (k ? "#" + k : "");
  };
  const row = h("div", { class: "row" }, pages.map(([k, l]) => { const b = h("button", { class: "btn sm" + (k === PREVIEW_AT ? " primary" : ""), onclick: () => pick(k, b) }, l); return b; }),
    h("button", { class: "btn sm", onclick: () => { try { frame.contentWindow.location.reload(); } catch { frame.src = frame.src; } } }, "Reload page"), open);
  return h("div", {}, head("Preview", "Your website, running on this PC from the copy that came with this update. Nothing here touches Netlify or your live site."),
    row, h("div", { class: "previewWrap" }, frame),
    h("details", { class: "box", style: "margin-top:12px" }, h("summary", {}, "What works in the preview"),
      h("p", { class: "muted small" }, "Works: every page, the new look, photos, the shop, sizes and wood choices, bundles, the cart, the 3D kitchen designer and its estimates, and the quick quote."),
      h("p", { class: "muted small" }, "Needs the live site (Netlify): actually sending a quote or order, customer sign-in, AI renders, and saving from the admin page. Buttons for those will show an error here, which is expected.")));
};
async function deployNow(e){
  if (!(await ask("Deploy the website now?", "Deploy", "Netlify rebuilds the site from GitHub. It takes about a minute and the site stays up meanwhile."))) return;
  const b = e.target; b.disabled = true;
  try { await api("/netlify/deploy", { method: "POST" }); notify("Deploy started. It takes about a minute."); setTimeout(() => TAB === "home" && go("home"), 8000); }
  catch (x) { toast(x.message, true); b.disabled = false; }
}

/* ======================= Past work ======================= */
V.work = async () => {
  await ensureDir(ROOT); await ensureDir(DIRS.work);
  const [entries, sent] = await Promise.all([listLib(DIRS.work), store.get("sentJobs", {})]);
  const folders = entries.filter(isDir).sort((a, b) => String(b.modified || "").localeCompare(String(a.modified || "")));
  let S = null, siteErr = null;
  try { S = await freshDraft(); } catch (e) { siteErr = e; }

  const jobList = h("div", { class: "list" });
  for (const f of folders){
    const path = f.path || `${DIRS.work}/${f.name}`;
    const onSite = sent[path] && S && S.GALLERY.some(g => g.id === sent[path].id);
    jobList.append(h("div", { class: "item" },
      h("div", { class: "txt" }, h("b", {}, f.name), h("span", { class: "small muted" }, onSite ? `On the website since ${when(sent[path].at)}` : "Not on the website yet")),
      h("button", { class: "btn sm", onclick: () => addPhotosTo(path) }, "Add photos"),
      h("button", { class: "btn sm" + (onSite ? "" : " primary"), disabled: !S, onclick: () => putOnSite(path, f.name, S) }, onSite ? "Send again" : "Put on website")));
  }
  const left = h("div", { class: "box" }, h("div", { class: "row" }, h("h3", { class: "grow", style: "margin:0" }, "Job folders in your library"), h("button", { class: "btn sm primary", onclick: newJob }, "New job")),
    h("p", { class: "small muted" }, `Each folder in ${DIRS.work}/ is one finished job. Keep the full-size originals there (any size). "Put on website" sends smaller copies to the site.`),
    folders.length ? jobList : h("div", { class: "drop", onclick: newJob }, h("b", {}, "No job folders yet"), h("div", { class: "small muted" }, "Click to make one and add its photos.")));

  const right = h("div", { class: "box" }, h("h3", {}, "On the website now"));
  if (siteErr) right.append(h("p", { class: "err small" }, siteErr.message));
  else if (!S.GALLERY.length) right.append(h("p", { class: "muted" }, "No projects yet."));
  else right.append(h("div", { class: "list" }, S.GALLERY.map(g => h("div", { class: "item" },
    h("div", { class: "pic" }, g.image || (g.photos || [])[0] ? h("img", { src: siteLink(g.image || g.photos[0]), alt: "", loading: "lazy", onerror: e => e.target.style.visibility = "hidden" }) : null),
    h("div", { class: "txt" }, h("b", {}, g.title), h("span", { class: "small muted ell" }, [g.place, `${(g.photos || []).length || (g.image ? 1 : 0)} photos`, g.featured ? "featured" : null].filter(Boolean).join(" · "))),
    h("button", { class: "btn sm", title: g.featured ? "Take off the home page" : "Show on the home page", onclick: async e => {
      e.target.disabled = true;
      try { await publishWith(d => { const x = d.GALLERY.find(y => y.id === g.id); if (x) { if (x.featured) delete x.featured; else x.featured = true; } }, `${g.featured ? "Unfeatured" : "Featured"} ${g.title} (hub)`); notify("Saved. The site shows it now."); go("work"); }
      catch (x) { toast(x.message, true); e.target.disabled = false; } } }, g.featured ? "★" : "☆"),
    h("button", { class: "btn sm danger", onclick: async e => {
      if (!(await ask(`Take "${g.title}" off the website?`, "Take it off", "The photos stay in your library and in the site's file storage. You can put it back later."))) return;
      e.target.disabled = true;
      try { await publishWith(d => { d.GALLERY = d.GALLERY.filter(y => y.id !== g.id); }, `Removed ${g.title} (hub)`); notify("Taken off the site."); go("work"); }
      catch (x) { toast(x.message, true); e.target.disabled = false; } } }, "Remove")))));
  right.append(h("p", { class: "small muted", style: "margin-bottom:0" }, "To reorder projects or change their text, use the admin page's Past work section."));
  return h("div", {}, head("Past work", "Finished jobs shown on the website. Each one gets its own page with all its photos."), h("div", { class: "two" }, left, right));
};
function pickFromPC(accept){
  return new Promise(ok => { const i = h("input", { type: "file", multiple: true, accept: accept || "image/*" }); i.onchange = () => ok([...i.files]); i.click(); });
}
async function uploadWithBar(files, folder, bar){
  await ensureDir(folder);
  await Hub.files.upload(files, folder, p => { if (bar) bar.value = p; });
}
function newJob(){
  const name = h("input", { type: "text", placeholder: "e.g. Smith kitchen, Spanish Fork" });
  const bar = h("progress", { max: 1, value: 0, hidden: true });
  const m = modal("New finished job",
    h("label", { class: "f" }, h("span", {}, "Job name (becomes the folder name)"), name),
    h("p", { class: "small muted", style: "margin:0" }, "Next you'll pick the photos from your PC. They're copied full size into the library."), bar,
    h("div", { class: "row right" }, h("button", { class: "btn primary", onclick: async e => {
      const n = safeName(name.value); if (!name.value.trim()) { name.focus(); return; }
      const files = await pickFromPC(); if (!files.length) return;
      e.target.disabled = true; bar.hidden = false;
      try { await uploadWithBar(files, `${DIRS.work}/${n}`, bar); m.close(); notify(`Saved ${files.length} photo${files.length > 1 ? "s" : ""} to ${n}.`); go("work"); }
      catch (x) { toast(x.message, true); e.target.disabled = false; }
    } }, "Choose photos")));
  name.focus();
}
async function addPhotosTo(path){
  const files = await pickFromPC(); if (!files.length) return;
  toast(`Copying ${files.length} photo${files.length > 1 ? "s" : ""} into the library…`);
  try { await uploadWithBar(files, path); notify("Added to the job folder."); go("work"); } catch (x) { toast(x.message, true); }
}
async function putOnSite(path, folderName, S){
  const all = (await listLib(path, true)).filter(f => !isDir(f) && IMG.test(f.name)).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  if (!all.length) { toast("That folder has no photos (JPG, PNG, WebP) yet.", true); return; }
  const sent = await store.get("sentJobs", {});
  const prev = sent[path] && S.GALLERY.find(g => g.id === sent[path].id);
  const job = { title: prev?.title || folderName, place: prev?.place || "Utah County", category: prev?.category || (S.CATEGORIES.find(c => c.id === "cabinets") || S.CATEGORIES[0] || {}).id,
    wood: prev?.wood || (S.WOODS[0] || {}).id, description: prev?.description || "", cost: prev?.cost ?? "", showCost: !!prev?.showCost, featured: !!prev?.featured };
  let photos = all.map(f => f.path || `${path}/${f.name}`), skip = new Set();
  const thumbs = h("div", { class: "thumbs" });
  const draw = () => thumbs.replaceChildren(...photos.map((p, i) => h("div", { class: "thumb", style: skip.has(p) ? "opacity:.35" : "" },
    h("img", { src: Hub.files.url(p), alt: "", loading: "lazy" }),
    h("span", { class: "tag" }, skip.has(p) ? "skip" : i === photos.filter(x => !skip.has(x)).indexOf(p) && !photos.slice(0, i).some(x => !skip.has(x)) ? "Cover" : `#${i + 1}`),
    h("span", { class: "x" },
      i ? h("button", { title: "Make this the cover", onclick: () => { photos.unshift(photos.splice(i, 1)[0]); draw(); } }, "★") : null,
      h("button", { title: skip.has(p) ? "Include" : "Leave this one out", onclick: () => { skip.has(p) ? skip.delete(p) : skip.add(p); draw(); } }, skip.has(p) ? "↺" : "✕")))));
  draw();
  const inp = (k, attrs) => h("input", { ...attrs, value: job[k], oninput: e => job[k] = e.target.type === "checkbox" ? e.target.checked : e.target.value });
  const sel = (k, list) => h("select", { onchange: e => job[k] = e.target.value }, list.map(x => h("option", { value: x.id, selected: x.id === job[k] }, x.name)));
  const bar = h("progress", { max: 1, value: 0, hidden: true }), msg = h("div", { class: "small muted" });
  const go2 = h("button", { class: "btn primary" }, prev ? "Update on website" : "Put on website");
  const m = modal(prev ? `Update "${prev.title}"` : "Put a job on the website",
    h("div", { class: "fields" },
      h("label", { class: "f wide" }, h("span", {}, "Project name"), inp("title", { type: "text" })),
      h("label", { class: "f" }, h("span", {}, "Location"), inp("place", { type: "text" })),
      h("label", { class: "f" }, h("span", {}, "Type"), sel("category", S.CATEGORIES)),
      h("label", { class: "f" }, h("span", {}, "Material"), sel("wood", S.WOODS)),
      h("label", { class: "f" }, h("span", {}, "Project cost ($, optional)"), inp("cost", { type: "number", step: "any" })),
      h("label", { class: "f wide" }, h("span", {}, "Short description"), h("textarea", { value: job.description, placeholder: "e.g. Full white oak kitchen with a walnut island and floating shelves.", oninput: e => job.description = e.target.value })),
      h("label", { class: "row small" }, h("input", { type: "checkbox", checked: job.showCost, onchange: e => job.showCost = e.target.checked }), "Show the cost on the site"),
      h("label", { class: "row small" }, h("input", { type: "checkbox", checked: job.featured, onchange: e => job.featured = e.target.checked }), "Feature it on the home page")),
    h("div", { class: "small muted" }, `${photos.length} photos, sorted by file name. The first one is the cover; click ★ to change it, ✕ to leave one out.`),
    thumbs, bar, msg, h("div", { class: "row right" }, go2));
  go2.onclick = async () => {
    if (!job.title.trim()) { toast("Give the project a name.", true); return; }
    const use = photos.filter(p => !skip.has(p));
    if (!use.length) { toast("Keep at least one photo.", true); return; }
    go2.disabled = true; bar.hidden = false;
    const urls = [];
    for (const [i, p] of use.entries()){
      msg.textContent = `Sending ${i + 1} of ${use.length}: ${p.split("/").pop()}`;
      try { urls.push((await sendLibraryFile(p, job.title.trim())).url); }
      catch (x) { toast(x.message, true); }
      bar.value = (i + 1) / use.length;
    }
    if (!urls.length) { go2.disabled = false; msg.textContent = "Nothing was sent."; return; }
    msg.textContent = "Publishing…";
    try {
      let id = prev?.id;
      await publishWith(d => {
        const g = { id: id || freshId(d.GALLERY, slugOf(job.title)), title: job.title.trim(), place: job.place.trim(), category: job.category, wood: job.wood,
          description: job.description.trim(), photos: urls, image: urls[0] };
        if (job.cost !== "" && isFinite(+job.cost)) { g.cost = +job.cost; if (job.showCost) g.showCost = true; }
        if (job.featured) g.featured = true;
        if (!g.description) delete g.description;
        id = g.id;
        const at = d.GALLERY.findIndex(x => x.id === g.id);
        if (at >= 0) d.GALLERY[at] = { ...d.GALLERY[at], ...g }; else d.GALLERY.unshift(g);
      }, `${prev ? "Updated" : "Added"} past work: ${job.title.trim()} (hub)`);
      sent[path] = { id, at: new Date().toISOString() }; await store.set("sentJobs", sent);
      m.close(); notify(`"${job.title.trim()}" is on the website now.`); go("work");
    } catch (x) { toast(x.message, true); go2.disabled = false; msg.textContent = "The photos were sent but publishing failed. Try again."; }
  };
}
function freshId(list, base){ let id = base, n = 2; while (list.some(x => x.id === id)) id = `${base}-${n++}`; return id; }

/* ======================= Prices ======================= */
V.prices = async () => {
  const S = await freshDraft();
  const edits = new Map();           // "product|size|0" -> number or null
  const keyOf = (...a) => a.join("|");
  const bar = h("div", { class: "sticky row" });
  const note = h("input", { type: "text", placeholder: "What changed? (optional)", maxlength: 200, class: "grow", style: "max-width:340px" });
  const pub = h("button", { class: "btn primary" }, "Publish");
  const drawBar = () => bar.replaceChildren(h("span", { class: "grow small" + (edits.size ? "" : " muted") }, edits.size ? `${edits.size} unpublished change${edits.size > 1 ? "s" : ""}` : "Change a number, then Publish. Customers see it right away."), note, pub);
  pub.disabled = true;
  const changed = (k, v, input, was) => {
    if (J(v) === J(was)) edits.delete(k); else edits.set(k, v);
    input.classList.toggle("changed", edits.has(k)); pub.disabled = !edits.size; drawBar(); refresh.forEach(f => f());
  };
  const refresh = [];
  const num = (k, cur, apply, placeholder) => {
    const was = cur == null ? null : +cur;
    const i = h("input", { type: "number", step: "any", min: 0, value: cur == null ? "" : cur, placeholder: placeholder || "" });
    i.addEventListener("input", () => { const v = i.value === "" ? null : +i.value; apply(S, v); changed(k, v, i, was); });
    return i;
  };
  const woodOf = p => p.woodless ? undefined : (p.woods && Object.keys(p.woods)[0]) || (S.WOODS[0] || {}).id;
  const priceFor = (p, i) => { try { return LarkulPrice.unit(S, p, { size: i, wood: woodOf(p), opts: [] }); } catch { return null; } };

  const values = Object.entries(S.PRICING.values || {});
  const valuesBox = values.length ? h("div", { class: "box" }, h("h3", {}, "Your numbers"), h("p", { class: "small muted", style: "margin-top:-4px" }, "Named numbers your price formulas use (for example the floating shelf's labor per sq ft)."),
    h("div", { class: "fields" }, values.map(([k, v]) => h("label", { class: "f" }, h("span", {}, k), num(keyOf("values", k), v, (d, x) => { d.PRICING.values[k] = x == null ? 0 : x; }))))) : null;

  const cats = Object.fromEntries((S.CATEGORIES || []).map(c => [c.id, c.name]));
  const products = S.PRODUCTS.map(p => {
    const rows = (p.sizes || []).map((s, i) => {
      const shown = h("td", { class: "small muted" });
      const upd = () => { const v = priceFor(p, i); shown.textContent = v == null ? "" : money(v); };
      refresh.push(upd); upd();
      return h("tr", {}, h("td", {}, s.label || `${s.length}" × ${s.depth}"`), h("td", { class: "num" }, num(keyOf(p.id, "size", i), s.price, (d, x) => {
        const t = d.PRODUCTS.find(y => y.id === p.id).sizes[i]; if (x == null) delete t.price; else t.price = x; }, p.formula ? "formula" : "custom")), shown);
    });
    const woodRows = p.woods && Object.keys(p.woods).length ? h("div", { style: "margin-top:10px" }, h("div", { class: "small muted", style: "margin-bottom:6px" }, p.formula ? "Material numbers (woodPrice in the formula)" : "Material price factors"),
      h("div", { class: "fields" }, Object.entries(p.woods).map(([w, v]) => h("label", { class: "f" }, h("span", {}, (S.WOODS.find(x => x.id === w) || {}).name || w),
        num(keyOf(p.id, "wood", w), v, (d, x) => { d.PRODUCTS.find(y => y.id === p.id).woods[w] = x == null ? 0 : x; }))))) : null;
    return h("details", { class: "p" }, h("summary", {}, h("b", { class: "grow ell" }, p.name), h("span", { class: "pill" }, cats[p.category] || p.category || ""), p.formula ? h("span", { class: "pill acc", title: p.formula }, "formula") : null),
      p.formula ? h("p", { class: "small muted", style: "margin-top:0" }, "Formula: ", h("code", {}, p.formula)) : null,
      rows.length ? h("div", { class: "scroll" }, h("table", { class: "t" }, h("tr", {}, h("th", {}, "Size"), h("th", {}, "Price ($)"), h("th", {}, "Customer pays" + (woodOf(p) ? ` (${(S.WOODS.find(x => x.id === woodOf(p)) || {}).name || woodOf(p)})` : ""))), rows)) : h("p", { class: "muted small" }, "No sizes."),
      woodRows);
  });

  pub.onclick = async () => {
    pub.disabled = true; pub.textContent = "Publishing…";
    try {
      const list = [...edits];
      await publishWith(d => {
        for (const [k, v] of list){
          const [a, kind, b] = k.split("|");
          if (a === "values") { d.PRICING.values[kind] = v == null ? 0 : v; continue; }
          const p = d.PRODUCTS.find(y => y.id === a); if (!p) continue;
          if (kind === "size" && p.sizes[+b]) { if (v == null) delete p.sizes[+b].price; else p.sizes[+b].price = v; }
          if (kind === "wood" && p.woods) p.woods[b] = v == null ? 0 : v;
        }
      }, note.value.trim() || "Prices changed in the hub");
      notify("Published. The shop shows the new prices now."); go("prices");
    } catch (x) { toast(x.message, true); pub.disabled = false; pub.textContent = "Publish"; }
  };
  drawBar();
  return h("div", {}, head("Prices", "Quick price changes for the shop. For formulas, bundles, options and the 3D designer's cabinet prices, use the admin page."),
    h("div", { class: "grid" }, valuesBox, h("div", { class: "box" }, h("h3", {}, "Products"), h("p", { class: "small muted", style: "margin-top:-4px" }, "Blank price = the product's formula or custom-size price works it out."), products)), bar);
};

/* ======================= Requests (Netlify Forms) ======================= */
const FORM_LABEL = { quote: "Free quote", "design-quote": "3D designer quote", order: "Order" };
async function requestState(){ return { seen: "", done: {}, saved: {}, reminded: {}, ...(await store.get("requests", {})) }; }
async function countNew(){
  if (!SETTINGS.hasToken || !SETTINGS.netlifySite) { NEW_REQUESTS = 0; return; }
  try { const [r, st] = await Promise.all([api("/netlify/submissions"), requestState()]); NEW_REQUESTS = r.submissions.filter(x => !st.done[x.id] && (!st.seen || x.created > st.seen)).length; }
  catch { NEW_REQUESTS = 0; }
  drawTabs();
}
V.requests = async () => {
  if (!SETTINGS.hasToken || !SETTINGS.netlifySite) return h("div", {}, head("Requests", "Free quotes, 3D designer quotes and orders sent from your website."),
    h("div", { class: "box" }, h("p", { style: "margin-top:0" }, "Link Netlify in Settings to see them here. They also arrive by email at sales@larkul.com once form notifications are on (GO-LIVE.md step 4)."),
      h("button", { class: "btn primary", onclick: () => go("settings") }, "Open Settings")));
  const [r, st] = await Promise.all([api("/netlify/submissions"), requestState()]);
  const lastSeen = st.seen; st.seen = new Date().toISOString(); await store.set("requests", st); NEW_REQUESTS = 0; drawTabs();
  let filter = "open";
  const list = h("div", { class: "grid" });
  const draw = () => list.replaceChildren(...(r.submissions.filter(x => filter === "all" || (filter === "open" ? !st.done[x.id] : st.done[x.id])).map(x => request(x, st, lastSeen))),
    r.submissions.length ? "" : h("p", { class: "muted" }, "No requests yet."));
  const tabs = h("div", { class: "row" }, [["open", "To do"], ["done", "Done"], ["all", "All"]].map(([k, l]) => h("button", { class: "btn sm" + (k === filter ? " primary" : ""), onclick: e => { filter = k; [...tabs.children].forEach(b => b.classList.toggle("primary", b === e.target)); draw(); } }, l)),
    h("span", { class: "grow" }), h("span", { class: "small muted" }, r.forms.map(f => `${FORM_LABEL[f.name] || f.name}: ${f.count}`).join(" · ")));
  draw();
  return h("div", {}, head("Requests", "Free quotes, 3D designer quotes and orders from your website. Save a request's files to the library, and set a reminder to follow up."), tabs, h("div", { style: "height:10px" }), list);
};
function request(x, st, lastSeen){
  const isNew = !st.done[x.id] && (!lastSeen || x.created > lastSeen);
  const saveBtn = x.files.length ? h("button", { class: "btn sm", onclick: e => saveRequest(x, st, e.target) }, st.saved[x.id] ? "Saved ✓ (save again)" : `Save ${x.files.length} file${x.files.length > 1 ? "s" : ""} to library`) : h("button", { class: "btn sm", onclick: e => saveRequest(x, st, e.target) }, st.saved[x.id] ? "Saved ✓" : "Save to library");
  const box = h("details", { class: "p" },
    h("summary", {}, isNew ? h("span", { class: "pill acc" }, "new") : null, h("b", { class: "grow ell" }, `${x.name || x.email || "Someone"}`), h("span", { class: "pill" }, FORM_LABEL[x.form] || x.form), h("span", { class: "small muted" }, when(x.created))),
    h("dl", { class: "kv" }, x.email ? [h("dt", {}, "Email"), h("dd", {}, h("a", { href: `mailto:${x.email}` }, x.email))] : null, x.phone ? [h("dt", {}, "Phone"), h("dd", {}, h("a", { href: `tel:${x.phone}` }, x.phone))] : null,
      x.fields.filter(([k]) => !["name", "email", "phone"].includes(k)).map(([k, v]) => [h("dt", {}, k), h("dd", {}, v)]),
      x.files.length ? [h("dt", {}, "Files"), h("dd", {}, x.files.map(f => `${f.filename}${f.size ? ` (${bytes(f.size)})` : ""}`).join("\n"))] : null),
    h("div", { class: "row", style: "margin-top:10px" }, saveBtn,
      h("button", { class: "btn sm", onclick: () => remindRequest(x, st) }, st.reminded[x.id] ? "Reminder set ✓" : "Remind me to follow up"),
      x.email ? h("a", { class: "btn sm", href: `mailto:${x.email}?subject=${encodeURIComponent("Your LARKUL " + (FORM_LABEL[x.form] || "request").toLowerCase())}` }, "Email them") : null,
      h("span", { class: "grow" }),
      h("button", { class: "btn sm" + (st.done[x.id] ? "" : " primary"), onclick: async () => { if (st.done[x.id]) delete st.done[x.id]; else st.done[x.id] = new Date().toISOString(); await store.set("requests", st); go("requests"); } }, st.done[x.id] ? "Move back to To do" : "Mark done")));
  return box;
}
async function saveRequest(x, st, btn){
  btn.disabled = true;
  const folder = `${DIRS.requests}/${x.created.slice(0, 10)} ${safeName(x.name || x.email || "request")} (${FORM_LABEL[x.form] || x.form})`;
  try {
    await ensureDir(ROOT); await ensureDir(DIRS.requests);
    const lines = [`${FORM_LABEL[x.form] || x.form} from ${x.name || ""}`, `Received ${new Date(x.created).toLocaleString()}`, "", x.email ? `Email: ${x.email}` : "", x.phone ? `Phone: ${x.phone}` : "",
      ...x.fields.filter(([k]) => !["name", "email", "phone"].includes(k)).map(([k, v]) => `${k}: ${v}`)].filter((l, i) => l !== "" || i === 2);
    await saveToLibrary(folder, "request.txt", new Blob([lines.join("\r\n")], { type: "text/plain" }));
    for (const f of x.files){
      btn.textContent = `Saving ${f.filename}…`;
      const r = await fetch(`${BASE}/netlify/submission-file?id=${encodeURIComponent(x.id)}&field=${encodeURIComponent(f.field)}`);
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || `Couldn't get ${f.filename}.`); }
      await saveToLibrary(folder, safeName(f.filename), await r.blob());
    }
    st.saved[x.id] = folder; await store.set("requests", st);
    notify(`Saved to ${folder}`); btn.textContent = "Saved ✓";
  } catch (e) { toast(e.message, true); btn.textContent = "Save to library"; }
  btn.disabled = false;
}
function remindRequest(x, st){
  const d = new Date(Date.now() + 2 * 86400000); d.setHours(9, 0, 0, 0);
  const due = h("input", { type: "datetime-local", value: new Date(d - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16) });
  const m = modal("Remind me to follow up", h("p", { style: "margin:0" }, `${FORM_LABEL[x.form] || x.form} from ${x.name || x.email}`), h("label", { class: "f" }, h("span", {}, "When"), due),
    h("div", { class: "row right" }, h("button", { class: "btn primary", onclick: async () => {
      try {
        const r = await Hub.reminders.add({ title: `Follow up: ${x.name || x.email} (${(FORM_LABEL[x.form] || x.form).toLowerCase()})`, due: due.value ? new Date(due.value).toISOString() : null,
          notes: [x.email, x.phone, x.summary].filter(Boolean).join(" · ").slice(0, 500) });
        st.reminded[x.id] = r?.id || true; await store.set("requests", st); m.close(); notify("Reminder added to the hub home page."); go("requests");
      } catch (e) { toast(e.message, true); }
    } }, "Add reminder")));
}

/* ======================= Backups & history ======================= */
async function backupNow(silent){
  try {
    const live = await api("/admin/catalog");
    const name = `larkul-site-${new Date().toISOString().slice(0, 16).replace(/[T:]/g, "-")}.json`;
    await ensureDir(ROOT);
    await saveToLibrary(DIRS.backups, name, new Blob([J({ savedAt: live.savedAt || null, note: live.note || "", data: live.data || {} }, null, 1)], { type: "application/json" }));
    const b = await store.get("backups", { auto: true }); b.last = new Date().toISOString(); await store.set("backups", b);
    if (silent !== true) notify(`Backup saved to ${DIRS.backups}/${name}`);
    return name;
  } catch (e) { if (silent !== true) toast(e.message, true); }
}
async function autoBackup(connected){
  if (!connected) return;
  const b = await store.get("backups", { auto: true });
  if (b.auto !== false && (!b.last || Date.now() - new Date(b.last) > 7 * 86400000)) backupNow(true);
}
V.backups = async () => {
  const [hist, b, files] = await Promise.all([api("/admin/history"), store.get("backups", { auto: true }), listLib(DIRS.backups)]);
  const saved = files.filter(f => !isDir(f) && /\.json$/i.test(f.name)).sort((x, y) => y.name.localeCompare(x.name));
  const versions = hist.versions || [];
  return h("div", {}, head("Backups", "Every time you publish (here or on the admin page), the site keeps that version. Backups put a copy in your library too."),
    h("div", { class: "two" },
      h("div", { class: "box" }, h("h3", {}, "Published versions"), versions.length ? h("div", { class: "list" }, versions.map((v, i) => h("div", { class: "item" },
        h("div", { class: "txt" }, h("b", {}, when(v.savedAt) + (i === 0 ? "  (live now)" : "")), h("span", { class: "small muted ell" }, v.note || "no note")),
        h("button", { class: "btn sm", onclick: async e => { e.target.disabled = true; try { const old = await api("/admin/history/" + encodeURIComponent(v.id));
          await saveToLibrary(DIRS.backups, `larkul-site-${v.id}.json`, new Blob([J(old, null, 1)], { type: "application/json" })); notify("Saved to the library."); go("backups"); } catch (x) { toast(x.message, true); e.target.disabled = false; } } }, "Save copy"),
        i ? h("button", { class: "btn sm", onclick: async e => {
          if (!(await ask(`Put the version from ${when(v.savedAt)} back on the site?`, "Restore", "Customers see it right away. What's live now stays in this list, so you can switch back."))) return;
          e.target.disabled = true;
          try { const old = await api("/admin/history/" + encodeURIComponent(v.id)); await loadCatalog();
            await api("/admin/catalog", { method: "PUT", headers: { "Content-Type": "application/octet-stream" }, body: J({ data: changesFrom(DEF, build(old.data)), note: `Restored the version from ${when(v.savedAt)} (hub)` }) });
            notify("Restored."); go("backups"); } catch (x) { toast(x.message, true); e.target.disabled = false; } } }, "Restore") : null))) : h("p", { class: "muted" }, "Nothing published yet.")),
      h("div", { class: "box" }, h("h3", {}, "In your library"),
        h("div", { class: "row" }, h("button", { class: "btn primary", onclick: async e => { e.target.disabled = true; await backupNow(); go("backups"); } }, "Back up now"),
          h("label", { class: "row small" }, h("input", { type: "checkbox", checked: b.auto !== false, onchange: async e => { b.auto = e.target.checked; await store.set("backups", b); } }), "Back up once a week when I open this tab")),
        h("p", { class: "small muted" }, b.last ? `Last backup ${ago(b.last)}.` : "No backups yet.", ` Saved in ${DIRS.backups}/. To load one, use the admin page: History & backups → Load a backup.`),
        saved.length ? h("div", { class: "list" }, saved.slice(0, 30).map(f => h("div", { class: "item" }, h("div", { class: "txt" }, h("b", {}, f.name), h("span", { class: "small muted" }, bytes(f.size))),
          h("a", { class: "btn sm", href: Hub.files.url(f.path || `${DIRS.backups}/${f.name}`), download: f.name }, "Download")))) : null)));
};

/* ======================= Launch checklist & dates ======================= */
const STEPS = [
  ["github", "Website files are in Extension-Hub under extensions/website-controller/site", "GO-LIVE.md step 1. Claude keeps them up to date."],
  ["netlify", "Save NETLIFY_AUTH_TOKEN in Extension-Hub and run Website deploy", "Step 2. Then put the netlify.app address in Settings here."],
  ["admin", "Add ADMIN_PASSWORD in Netlify and redeploy", "Step 3. Then put the same password in Settings here."],
  ["forms", "Turn on Netlify Forms and email notifications to sales@larkul.com", "Step 4. Send a test quote."],
  ["renders", "Optional: add FAL_KEY for Render my kitchen", "Step 5"],
  ["photos", "Copy the Squarespace photos in /admin and Publish", "Step 6"],
  ["confirm", "Check the prices marked CONFIRM", "Prices tab here, or the admin page"],
  ["hoods", "Add range hood and past-work photos", "Past work tab here"],
  ["domain", "Point larkul.com at Netlify (A @ 75.2.60.5, CNAME www). Don't touch MX/TXT.", "Step 7"],
  ["https", "larkul.com opens the new site with the padlock", "Then change the address in Settings to https://larkul.com"],
  ["tests", "Test quote and test order arrived; email still works", "Step 8"],
  ["backup", "Back up the site", "Backups tab"],
  ["cancel", "Cancel the Squarespace website plan, keep the domain", "Add a date below so you get a reminder"]
];
const DATE_IDEAS = ["Cancel the Squarespace website plan", "larkul.com domain renewal", "Check fal.ai render credits", "Netlify bill / plan check", "Check prices marked CONFIRM"];
V.launch = async () => {
  const [launch, dates, guides] = await Promise.all([store.get("launch", { done: {} }), store.get("dates", []), listLib(DIRS.guides)]);
  const checks = h("div", {}, STEPS.map(([id, text, sub]) => {
    const row = h("label", { class: "check" + (launch.done[id] ? " done" : "") }, h("input", { type: "checkbox", checked: !!launch.done[id], onchange: async e => {
      if (e.target.checked) launch.done[id] = today(); else delete launch.done[id];
      row.classList.toggle("done", e.target.checked); await store.set("launch", launch); count.textContent = progressText(); } }),
      h("div", { class: "ct" }, h("div", {}, text), h("div", { class: "small muted" }, sub, launch.done[id] ? ` · done ${launch.done[id]}` : "")));
    return row;
  }));
  const progressText = () => `${Object.keys(launch.done).filter(k => STEPS.some(s => s[0] === k)).length} of ${STEPS.length} done`;
  const count = h("span", { class: "small muted" }, progressText());

  const title = h("input", { type: "text", placeholder: "e.g. larkul.com domain renewal", list: "wcIdeas" });
  const due = h("input", { type: "date" }), notes = h("input", { type: "text", placeholder: "Notes (optional)" });
  const dateList = h("div", { class: "list" }, dates.slice().sort((a, b) => String(a.due).localeCompare(String(b.due))).map(d => h("div", { class: "item" },
    h("div", { class: "txt" }, h("b", {}, d.title), h("span", { class: "small muted ell" }, [d.due ? new Date(d.due + "T12:00:00").toLocaleDateString([], { weekday: "short", month: "short", day: "numeric", year: "numeric" }) : "no date", d.notes].filter(Boolean).join(" · "))),
    h("button", { class: "btn sm danger", onclick: async () => {
      if (!(await ask(`Remove "${d.title}"?`, "Remove", "Its reminder on the hub home page is marked done too."))) return;
      if (d.reminderId && d.reminderId !== true) { try { await Hub.reminders.complete(d.reminderId); } catch {} }
      await store.set("dates", dates.filter(x => x.id !== d.id)); go("launch"); } }, "Remove"))));
  const add = async () => {
    if (!title.value.trim() || !due.value) { toast("Give it a name and a date.", true); return; }
    const item = { id: Date.now().toString(36), title: title.value.trim(), due: due.value, notes: notes.value.trim() };
    try { const r = await Hub.reminders.add({ title: item.title, due: new Date(item.due + "T16:00:00").toISOString(), notes: item.notes ? `${item.notes} (website)` : "Website" }); item.reminderId = r?.id || true; }
    catch (e) { toast("Saved, but the reminder didn't go in: " + e.message, true); }
    dates.push(item); await store.set("dates", dates); notify("Added. It shows on the hub home page."); go("launch");
  };
  const gl = guides.filter(f => !isDir(f));
  return h("div", {}, head("Launch & dates", "Getting the new site live, and the website dates you don't want to miss."),
    h("div", { class: "two" },
      h("div", { class: "box" }, h("div", { class: "row" }, h("h3", { class: "grow", style: "margin:0" }, "Go-live checklist"), count), checks),
      h("div", { class: "grid", style: "align-content:start" },
        h("div", { class: "box" }, h("h3", {}, "Website dates"), h("p", { class: "small muted", style: "margin-top:-4px" }, "Each one becomes a reminder on the hub home page."),
          dates.length ? dateList : null,
          h("div", { class: "fields", style: "margin-top:10px" }, h("label", { class: "f wide" }, h("span", {}, "What"), title), h("label", { class: "f" }, h("span", {}, "Date"), due), h("label", { class: "f" }, h("span", {}, "Notes"), notes)),
          h("datalist", { id: "wcIdeas" }, DATE_IDEAS.map(t => h("option", { value: t }))),
          h("div", { class: "row right", style: "margin-top:10px" }, h("button", { class: "btn primary", onclick: add }, "Add date"))),
        h("div", { class: "box" }, h("h3", {}, "Guides"), h("p", { class: "small muted", style: "margin-top:-4px" }, `In your library under ${DIRS.guides}/.`),
          gl.length ? h("div", { class: "list" }, gl.map(f => h("div", { class: "item" }, h("div", { class: "txt" }, h("b", {}, f.name)), h("a", { class: "btn sm", href: Hub.files.url(f.path || `${DIRS.guides}/${f.name}`), target: "_blank", rel: "noopener" }, "Open"))))
            : h("button", { class: "btn", onclick: async () => { await seedGuides(true); go("launch"); } }, "Copy the guides into the library")))));
};
async function seedGuides(force){
  const seeded = await store.get("guides", 0);
  if (seeded >= GUIDES_VERSION && !force) return;
  try {
    await ensureDir(ROOT); await ensureDir(DIRS.guides);
    const have = new Set((await listLib(DIRS.guides)).map(f => f.name));
    let missing = 0;
    for (const g of GUIDES){
      if (have.has(g) && !force) continue;
      const r = await fetch(`./guides/${g}`); if (!r.ok) { missing++; continue; }
      await saveToLibrary(DIRS.guides, g, new Blob([await r.text()], { type: "text/markdown" }));
    }
    if (!missing) await store.set("guides", GUIDES_VERSION);
  } catch (e) { console.warn("website-controller: couldn't copy the guides", e); }
}

/* ======================= Settings ======================= */
V.settings = async () => {
  const s = SETTINGS = await api("/settings");
  const site = h("input", { type: "url", value: s.siteUrl, placeholder: "https://your-site.netlify.app" });
  const pw = h("input", { type: "password", placeholder: s.hasPassword ? "Saved. Type a new one to change it." : "The ADMIN_PASSWORD you set in Netlify", autocomplete: "new-password" });
  const token = h("input", { type: "password", placeholder: s.hasToken ? "Saved. Paste a new one to change it." : "Netlify personal access token", autocomplete: "off" });
  const nsite = h("input", { type: "text", value: s.netlifySite, placeholder: "your-site.netlify.app", list: "wcSites" });
  const sites = h("datalist", { id: "wcSites" });
  const hook = h("input", { type: "password", placeholder: s.hasBuildHook ? "Saved. Paste a new one to change it." : "https://api.netlify.com/build_hooks/…", autocomplete: "off" });
  const result = h("div", { class: "small" });
  const save = async () => {
    const body = { siteUrl: site.value, netlifySite: nsite.value };
    if (pw.value) body.password = pw.value; if (token.value) body.token = token.value; if (hook.value) body.buildHook = hook.value;
    SETTINGS = await api("/settings", { method: "PUT", json: body }); drawTabs();
    pw.value = token.value = hook.value = "";
  };
  const test = async () => {
    result.replaceChildren("Checking…");
    try {
      await save();
      const st = await api("/status");
      DEF = null;
      result.replaceChildren(
        h("div", {}, h("span", { class: "dot " + (st.page?.ok ? "ok" : "bad") }), "Website: ", st.page?.ok ? "online" : (st.page?.error || `answered ${st.page?.status}`)),
        h("div", {}, h("span", { class: "dot " + (st.admin?.ok ? "ok" : st.admin?.missing ? "warn" : "bad") }), "Admin password: ", st.admin?.ok ? "works" : st.admin?.missing ? "not added" : (st.admin?.error || "doesn't work")),
        h("div", {}, h("span", { class: "dot " + (st.netlify?.ok ? "ok" : st.netlify?.missing ? "warn" : "bad") }), "Netlify: ", st.netlify?.ok ? "linked" : st.netlify?.missing ? "not linked (optional)" : st.netlify.error));
      countNew(); seedGuides();
    } catch (e) { result.replaceChildren(h("span", { class: "err" }, e.message)); }
  };
  const clear = (key, label) => h("button", { class: "btn sm", onclick: async () => { if (!(await ask(`Forget the saved ${label}?`, "Forget"))) return; SETTINGS = await api("/settings", { method: "PUT", json: { [key]: "" } }); go("settings"); } }, "Forget");
  return h("div", {}, head("Settings", "Saved on this PC by the hub. Passwords and tokens stay in the hub and are never shown again."),
    h("div", { class: "grid" },
      h("div", { class: "box" }, h("h3", {}, "Your website"),
        h("div", { class: "fields" },
          h("label", { class: "f wide" }, h("span", {}, "Website address"), site),
          h("label", { class: "f wide" }, h("span", {}, "Admin password (the same one you use on /admin)"), h("div", { class: "row" }, h("div", { class: "grow" }, pw), s.hasPassword ? clear("password", "admin password") : null))),
        h("p", { class: "small muted", style: "margin-bottom:0" }, "Use the netlify.app address until larkul.com points to Netlify, then change it to https://larkul.com.")),
      h("div", { class: "box" }, h("h3", {}, "Netlify (optional: deploys and form requests)"),
        h("div", { class: "fields" },
          h("label", { class: "f wide" }, h("span", {}, "Personal access token"), h("div", { class: "row" }, h("div", { class: "grow" }, token), s.hasToken ? clear("token", "Netlify token") : null)),
          h("label", { class: "f wide" }, h("span", {}, "Netlify site"), h("div", { class: "row" }, h("div", { class: "grow" }, nsite),
            h("button", { class: "btn sm", onclick: async () => { try { await save(); const l = await api("/netlify/sites"); sites.replaceChildren(...l.map(x => h("option", { value: x.name + ".netlify.app" }, x.domain || x.url)));
              if (l.length === 1) nsite.value = l[0].name + ".netlify.app"; toast(l.length ? `Found ${l.length} site${l.length > 1 ? "s" : ""}. Pick yours in the box.` : "No sites on that Netlify account yet."); } catch (e) { toast(e.message, true); } } }, "Find my sites")), sites),
          h("label", { class: "f wide" }, h("span", {}, "Build hook (for the Deploy now button)"), h("div", { class: "row" }, h("div", { class: "grow" }, hook), s.hasBuildHook ? clear("buildHook", "build hook") : null))),
        h("details", { class: "small", style: "margin-top:10px" }, h("summary", { style: "cursor:pointer" }, "Where do I get these?"),
          h("ol", {}, h("li", {}, "Token: app.netlify.com → your avatar (top right) → User settings → Applications → Personal access tokens → New access token. Name it \"hub\", pick an expiry, copy it."),
            h("li", {}, "Site: press Find my sites after pasting the token."),
            h("li", {}, "Build hook: your site in Netlify → Project configuration → Build & deploy → Build hooks → Add build hook. Name it \"hub\", branch main, copy the link.")))),
      h("div", { class: "row" }, h("button", { class: "btn primary", onclick: test }, "Save and test"), result)));
};

/* the logo from your site's Business settings; the LARKUL wordmark stays if it can't load */
async function showLogo(){
  if (!SETTINGS.siteUrl) return;
  try { await loadCatalog(); } catch { return; }
  const B = DEF.business || {}, cur = build(LIVE.data).business || B;
  const src = cur.logo || B.logo; if (!src) return;
  const im = new Image(); im.alt = cur.name || "LARKUL";
  im.onload = () => $("#logo").replaceChildren(im);
  im.src = siteLink(src);
}

/* ---------- start ---------- */
(async function start(){
  try { SETTINGS = await api("/settings"); }
  catch (e) { $("#view").replaceChildren(h("div", { class: "box err" }, "The hub didn't load this extension's server code (server.js). Press Rescan in the hub, then reload. ", e.message)); return; }
  if (!SETTINGS.siteUrl && TAB !== "settings") TAB = "home";
  drawTabs(); go(TAB);
  $("#logo").onclick = () => go("home");
  seedGuides(); countNew(); showLogo(); syncCheck();
})();
