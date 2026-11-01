/* Price sync: keeps website prices matched to your own price data.
   Each link says "this website price = that number in my price data × times + plus, rounded".
   When your price data changes, the Price sync tab lists the website prices that would change.
   Publish sends them to the live site through the admin connection (no deploy).
   Saved with hub storage under "priceSync". Loaded after app.js and uses its helpers. */
"use strict";
const SYNC_KEY = "priceSync";
const SYNC_EVERY = 5 * 60 * 1000;        // checks again every 5 minutes while the hub has this tab loaded
const AUTO_LIMIT = 0.5;                   // "publish right away" still asks when a price moves more than 50%
let SYNC_PENDING = 0;

async function syncState(){
  return { source: { kind: "cabinet-designer", sheet: "", folder: "Price data" }, links: [], mode: "ask", notified: "", lastSync: null, ...(await store.get(SYNC_KEY, {})) };
}

/* ---------- paths into the catalog: DESIGNER.doorStyles[shaker].door, PRODUCTS[floating-shelf].sizes[0].price ---------- */
const segs = path => [...String(path).matchAll(/([^.[\]]+)|\[([^\]]+)\]/g)].map(m => m[1] != null ? { key: m[1] } : { pick: m[2] });
function pickIn(arr, p){ const i = arr.findIndex(x => x && x.id === p); return i >= 0 ? i : /^\d+$/.test(p) && +p < arr.length ? +p : -1; }
function getAt(obj, path){
  let o = obj;
  for (const s of segs(path)){
    if (o == null) return undefined;
    if (s.key != null) o = o[s.key]; else { if (!Array.isArray(o)) return undefined; const i = pickIn(o, s.pick); o = i < 0 ? undefined : o[i]; }
  }
  return o;
}
function setAt(obj, path, v){
  const ss = segs(path); let o = obj;
  for (let n = 0; n < ss.length; n++){
    const s = ss[n], last = n === ss.length - 1;
    const k = s.key != null ? s.key : Array.isArray(o) ? pickIn(o, s.pick) : -1;
    if (k === -1 || o == null || (last ? typeof o[k] !== "number" : o[k] == null)) return false;
    if (last) o[k] = v; else o = o[k];
  }
  return true;
}
const pathPart = (arr, i) => { const x = arr[i]; return x && typeof x === "object" && typeof x.id === "string" && x.id ? `[${x.id}]` : `[${i}]`; };
const nameOf = (x, i) => x && typeof x === "object" ? (x.name || x.label || x.id || `#${i + 1}`) : `#${i + 1}`;

/* ---------- every website number a link can set ---------- */
const NOT_PRICES = new Set(["w", "h", "d", "elev", "widths", "length", "depth", "lengths", "depths", "minGap", "maxGap", "max", "hingesPerDoor", "platesPerDoor",
  "islandOverhang", "room", "spread", "janka", "size", "qty", "minItems", "items", "pairsWith", "stains", "paints", "wallPaints", "floors", "countertops", "fits", "onlyWoods"]);
const SITE_NAMES = { DESIGNER: "3D designer", PRODUCTS: "Shop", PRICING: "Formulas", values: "Your numbers", WOODS: "Woods", BUNDLES: "Bundles", cartDeal: "Cart deal",
  cabinetPrices: "Cabinet prices", perFt: "per foot", perFoot: "per foot", tallPerFoot: "tall, per foot", each: "each", tallEach: "tall, each", doorStyles: "Door styles",
  doorMaterials: "Door materials", boxMaterials: "Box materials", drawerBoxes: "Drawer boxes", drawerGuides: "Drawer guides", doorHardware: "Door hardware", hardware: "Hardware",
  finishPerSqFt: "Finishing per sq ft", paintedFronts: "Painted fronts", frontMarkup: "Door markup %", toeKick: "Toe kick", crown: "Crown", listExtras: "Quick quote extras",
  islandBack: "Island back", pocketDoors: "Pocket door hardware", fillers: "Fillers", endPanels: "End panels", finishedEnds: "Finished ends", INSIDE: "Inside options",
  PIECES: "Cabinets", min: "minimum", minimumProject: "Project minimum", install: "Installation", delivery: "Delivery", percent: "%", percentOff: "% off", multiplier: "multiplier",
  sizes: "", woods: "material", options: "", choices: "", add: "adds", price: "price", custom: "custom size", minPrice: "minimum", rate: "rate", finishes: "Finishes",
  door: "door", drawer: "drawer", perSqFt: "per sq ft", hinge: "hinge", plate: "plate", formulas: "" };
function siteTargets(S){
  const out = [], woodName = id => (S.WOODS || []).find(w => w.id === id)?.name || id;
  const walk = (o, path, label, inWoods) => {
    if (typeof o === "number") { out.push({ key: path, label: label.filter(Boolean).join(" › "), value: o }); return; }
    if (Array.isArray(o)) { o.forEach((x, i) => walk(x, path + pathPart(o, i), label.concat(nameOf(x, i)))); return; }
    if (!plain(o)) return;
    for (const [k, v] of Object.entries(o)){
      if (NOT_PRICES.has(k)) continue;
      const nm = inWoods ? woodName(k) : k in SITE_NAMES ? SITE_NAMES[k] : k;
      walk(v, path ? `${path}.${k}` : k, label.concat(nm), k === "woods" || k === "doorMaterials");
    }
  };
  for (const k of ["PRODUCTS", "BUNDLES", "cartDeal", "WOODS", "DESIGNER"]) if (S[k] != null) walk(S[k], k, [SITE_NAMES[k] || k]);
  walk(S.PRICING?.values || {}, "PRICING.values", ["Your numbers"]);
  return uniqueLabels(out.filter(t => !/^DESIGNER\.PIECES\[[^\]]+\]\.(?!min$)/.test(t.key) && !/^WOODS\[[^\]]+\]\.(?!multiplier$)/.test(t.key)));
}
function uniqueLabels(list){
  const seen = {};
  for (const t of list){ const n = seen[t.label] = (seen[t.label] || 0) + 1; if (n > 1) t.label += ` (${n})`; }
  return list;
}

/* ---------- your price data: a Cabinet Designer price sheet, or the newest file in a library folder ---------- */
async function extStorage(ext, key){
  const r = await fetch(`${Hub.baseUrl || ""}/api/ext/${ext}/storage/${encodeURIComponent(key)}`);
  if (r.status === 404) throw new Error("Cabinet Designer isn't installed in this hub.");
  if (!r.ok) throw new Error(`The hub answered ${r.status} when reading Cabinet Designer.`);
  const v = await r.json(); return v && v.value !== undefined && !Array.isArray(v) && Object.keys(v).length === 1 ? v.value : v;
}
const ADDER_NAMES = { perDrawer: "Each drawer", perRollout: "Each roll-out", perOtherInsert: "Each other insert", perShelf: "Each shelf", perEndPanel: "Each end panel", perFiller: "Each filler" };
// Flattens a Cabinet Designer price sheet; names for door styles, sheets, tops and moldings come from its open job.
function cdEntries(ps, job){
  const nm = (list, id) => (job && (job[list] || []).find(x => x.id === id) || {}).name || id;
  const out = [], add = (key, label, v) => { if (typeof v === "number" || (typeof v === "string" && v !== "" && isFinite(v))) out.push({ key, label, value: +v }); };
  for (const [cat, r] of Object.entries(ps.cab || {})) { add(`cab.${cat}.base`, `${cat} cabinets › each`, r.base); add(`cab.${cat}.perFt`, `${cat} cabinets › per foot`, r.perFt); }
  for (const [k, v] of Object.entries(ps.adders || {})) add(`adders.${k}`, ADDER_NAMES[k] || k, v);
  add("doors.min", "Doors › minimum per door", ps.doors?.min);
  for (const [id, v] of Object.entries(ps.doors?.rates || {})) add(`doors.rates.${id}`, `Door style ${nm("doorStyles", id)} › per sq ft`, v);
  add("materials.waste", "Sheet waste %", ps.materials?.waste);
  for (const [id, v] of Object.entries(ps.materials?.sheets || {})) add(`materials.sheets.${id}`, `Sheet ${nm("materials", id)} › per sheet`, v);
  for (const [k, v] of Object.entries(ps.hardware?.items || {})) add(`hardware.items.${k}`, `Hardware ${k} › each`, v);
  for (const [id, v] of Object.entries(ps.tops || {})) add(`tops.${id}`, `Countertop ${nm("countertops", id)} › per sq ft`, v);
  for (const [id, v] of Object.entries(ps.molds || {})) add(`molds.${id}`, `Molding ${nm("moldings", id)} › per foot`, v);
  for (const [id, r] of Object.entries(ps.products || {})) { add(`products.${id}.base`, `Product ${id} › each`, r?.base); add(`products.${id}.perFt`, `Product ${id} › per foot`, r?.perFt); }
  (ps.extras || []).forEach((x, i) => add(`extras.${i}`, `Charge ${x.name} (per ${x.per})`, x.amount));
  add("paint.rate", "Paint › per sq ft", ps.paint?.rate);
  add("markup", "Markup %", ps.markup); add("tax", "Tax %", ps.tax);
  return uniqueLabels(out);
}
// Any JSON: every number, labeled by its keys (and names inside lists). A Cabinet Designer sheet file is read the same way as the live one.
function jsonEntries(d){
  if (d && d.cabinetDesignerPriceSheet && d.sheet) return cdEntries(d.sheet, null);
  const out = [];
  const walk = (o, path, label) => {
    if (typeof o === "number") { out.push({ key: path, label: label.join(" › ") || path, value: o }); return; }
    if (typeof o === "string" && /^\s*\$?\s*-?[\d,]*\.?\d+\s*$/.test(o) && path) { out.push({ key: path, label: label.join(" › "), value: +o.replace(/[$,\s]/g, "") }); return; }
    if (Array.isArray(o)) { o.forEach((x, i) => walk(x, `${path}[${x && typeof x === "object" && (x.id || x.sku || x.code) || i}]`, label.concat(nameOf(x, i)))); return; }
    if (plain(o)) for (const [k, v] of Object.entries(o)) if (!/^(id|sku|code|name|label)$/i.test(k) || typeof v === "number") walk(v, path ? `${path}.${k}` : k, label.concat(k));
  };
  walk(d, "", []);
  return uniqueLabels(out);
}
// CSV or tab-separated: the words in a row name it, the last number in the row is its price. A header row is skipped.
function csvEntries(text){
  const sep = text.split("\n", 1)[0].includes("\t") ? "\t" : ",";
  const rows = text.split(/\r?\n/).map(l => { const cells = []; let cur = "", q = false;
    for (let i = 0; i < l.length; i++){ const c = l[i]; if (q) { if (c === '"' && l[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; } else if (c === '"') q = true; else if (c === sep) { cells.push(cur); cur = ""; } else cur += c; }
    cells.push(cur); return cells.map(s => s.trim()); });
  const isNum = s => /^\$?\s*-?[\d,]*\.?\d+\s*%?$/.test(s);
  const out = [];
  for (const r of rows){
    const nums = r.filter(isNum), words = r.filter(s => s && !isNum(s));
    if (!nums.length || !words.length) continue;
    const label = words.join(" › ");
    out.push({ key: label, label, value: +nums[nums.length - 1].replace(/[$,%\s]/g, "") });
  }
  return uniqueLabels(out);
}
async function readSource(src){
  if (src.kind === "file"){
    const folder = (src.folder || "").replace(/^\/+|\/+$/g, "");
    const files = (await listLib(folder, true)).filter(f => !isDir(f) && /\.(json|csv|tsv|txt)$/i.test(f.name));
    if (!files.length) throw new Error(`No .json or .csv price file in Files › ${folder.replace(/\//g, " › ") || "(top)"} yet.`);
    files.sort((a, b) => String(b.modified || "").localeCompare(String(a.modified || "")));
    const f = files[0], path = f.path || `${folder}/${f.name}`;
    const r = await fetch(Hub.files.url(path)); if (!r.ok) throw new Error(`Couldn't open ${f.name}.`);
    const text = await r.text();
    let entries;
    if (/\.json$/i.test(f.name)) { try { entries = jsonEntries(JSON.parse(text)); } catch { throw new Error(`${f.name} isn't valid JSON.`); } }
    else entries = csvEntries(text);
    return { name: f.name, when: f.modified, entries, stamp: `${path}|${f.modified}|${f.size}` };
  }
  const sheets = await extStorage("cabinet-designer", "priceSheets");
  if (!Array.isArray(sheets) || !sheets.length) throw new Error("Cabinet Designer has no price sheets yet. Open Cabinet Designer › Pricing once.");
  const ps = sheets.find(s => s.id === src.sheet) || sheets[0];
  // names for door styles and materials come from the job open in Cabinet Designer (or the one an older version kept in storage)
  let job = null;
  try { const cur = await extStorage("cabinet-designer", "current"); const path = cur && (cur.value || cur);
    if (typeof path === "string") { const r = await fetch(`${Hub.baseUrl || ""}/api/ext/cabinet-designer/files/raw?path=${encodeURIComponent(path)}`); if (r.ok) job = await r.json(); } } catch {}
  if (!job) try { job = await extStorage("cabinet-designer", "job"); } catch {}
  const entries = cdEntries(ps, job);
  return { name: ps.name, sheets: sheets.map(s => ({ id: s.id, name: s.name })), sheetId: ps.id, entries, stamp: J(entries.map(e => [e.key, e.value])) };
}

/* ---------- links: website price = source × times + plus, rounded ---------- */
const ROUNDS = [["cent", "to the cent"], ["dollar", "to the dollar"], ["5", "to $5"], ["10", "to $10"], ["none", "no rounding"]];
function rounded(v, how){
  if (how === "none") return v;
  if (how === "dollar") return Math.round(v);
  if (how === "5" || how === "10") return Math.round(v / +how) * +how;
  return Math.round(v * 100) / 100;
}
const linkValue = (l, src) => rounded(src * (l.times ?? 1) + (+l.plus || 0), l.round || "cent");
function pendingChanges(st, S, data){
  const byKey = new Map(data.entries.map(e => [e.key, e])), out = [];
  for (const l of st.links){
    const e = byKey.get(l.source), cur = getAt(S, l.target);
    if (!e || typeof cur !== "number") { out.push({ link: l, missing: !e ? "source" : "target" }); continue; }
    const next = linkValue(l, e.value);
    if (Math.abs(next - cur) > 0.004) out.push({ link: l, from: cur, to: next, src: e });
  }
  return out;
}

/* ---------- "match for me": Cabinet Designer rules first, then words that match ---------- */
const CD_RULES = [
  [/^adders\.perFiller$/, ["DESIGNER.fillers.each"]], [/^adders\.perEndPanel$/, ["DESIGNER.endPanels.each"]],
  [/^hardware\.items\.(?!.*plate).*(hinge|clip top|blumotion)/i, ["DESIGNER.doorHardware.hinge"]], [/^hardware\.items\..*plate/i, ["DESIGNER.doorHardware.plate"]],
  [/^hardware\.items\..*(slide|guide|tandem|movento|legrabox)/i, ["DESIGNER.drawerGuides.each"]], [/^hardware\.items\..*pull/i, ["DESIGNER.hardware[pulls].each"]],
  [/^hardware\.items\..*knob/i, ["DESIGNER.hardware[knobs].each"]], [/^hardware\.items\..*push/i, ["DESIGNER.hardware[push].each"]]
];
const CAB_NOTE = "Cabinet Designer's base and per-foot price is the whole box; the website adds doors, drawers and hardware on top. If you link these, set Times below 1 so only the box part carries over.";
const MAYBE_RULES = [   // close but not the same thing, so they start unticked
  [/^cab\.Base\.base$/, "DESIGNER.cabinetPrices.base.each", CAB_NOTE], [/^cab\.Base\.perFt$/, "DESIGNER.cabinetPrices.base.perFt", CAB_NOTE], [/^cab\.Base\.perFt$/, "DESIGNER.cabinetPrices.sink.perFt", CAB_NOTE],
  [/^cab\.Wall\.base$/, "DESIGNER.cabinetPrices.wall.each", CAB_NOTE], [/^cab\.Wall\.perFt$/, "DESIGNER.cabinetPrices.wall.perFt", CAB_NOTE],
  [/^cab\.Tall\.base$/, "DESIGNER.cabinetPrices.tall.each", CAB_NOTE], [/^cab\.Tall\.perFt$/, "DESIGNER.cabinetPrices.tall.perFt", CAB_NOTE],
  [/^paint\.rate$/, "DESIGNER.finishPerSqFt", "Cabinet Designer paints every painted sq ft; the website charges finishing on fronts, panels and fillers."],
  [/^adders\.perDrawer$/, "DESIGNER.drawerBoxes[melamine].each", "Cabinet Designer's drawer adder is box and slides; the website adds drawer guides on top."],
  [/^molds\./, "DESIGNER.crown.perFoot", "Only if this molding is your crown."],
  [/^tops\./, "DESIGNER.listExtras.woodTopPerSqFt", "Only if this countertop is a wood top."]
];
const FILLER_WORDS = new Set(["each", "ea", "per", "price", "the", "and", "of", "sq", "ft", "sqft", "lf", "pc", "pcs", "unit", "3d", "designer", "shop", "cost", "usd"]);
const words = s => new Set(String(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").split(" ").map(w => w.replace(/(?<=..)s$/, "")).filter(w => w.length > 1 && !FILLER_WORDS.has(w)));
function suggest(st, data, targets){
  const linked = new Set(st.links.map(l => l.target + "|" + l.source)), byTarget = new Map(targets.map(t => [t.key, t])), out = [];
  const push = (e, key, sure, why) => { const t = byTarget.get(key); if (t && !linked.has(key + "|" + e.key) && !out.some(o => o.target === key && o.source === e.key)) out.push({ source: e.key, target: key, sure, why, e, t }); };
  for (const e of data.entries){
    for (const [re, keys] of CD_RULES) if (re.test(e.key)) keys.forEach(k => push(e, k, true));
    for (const [re, key, why] of MAYBE_RULES) if (re.test(e.key)) push(e, key, false, why);
    // door styles by name: Cabinet Designer prices doors per sq ft, the website per door, so times is a typical door's sq ft
    const ds = /^doors\.rates\./.test(e.key) && e.label.match(/^Door style (.+?) ›/);
    if (ds) { const w = words(ds[1]); targets.filter(t => /^DESIGNER\.doorStyles\[[^\]]+\]\.(door|drawer)$/.test(t.key)).forEach(t => { const tw = words(t.label.split(" › ")[2] || ""); if ([...w].some(x => tw.has(x))) push(e, t.key, false, "Per sq ft in Cabinet Designer, per door on the website. Set Times to your average door (or drawer front) in sq ft."); }); continue; }
    if (out.some(o => o.e === e) || /^(cab|adders|hardware|doors|paint|molds|tops|materials|markup|tax|extras|products)\b/.test(e.key) && data.kind === "cd") continue;
    // anything else: the website price whose words match best
    const w = words(e.label); if (!w.size) continue;
    let best = null, score = 0;
    // score: share of your words found in the website name, less a little for every extra website word
    for (const t of targets){ const tw = words(t.label); let n = 0; w.forEach(x => tw.has(x) && n++); const sc = n / w.size - Math.max(0, tw.size - n) * 0.05; if (sc > score) { score = sc; best = t; } }
    if (best && score >= 0.5) push(e, best.key, score >= 0.99, score >= 0.99 ? "Same name." : "Similar name. Check it's the same thing.");
  }
  return out;
}

/* ---------- publishing ---------- */
async function publishSync(list, st, data, note){
  let n = 0;
  await publishWith(d => { for (const c of list) if (setAt(d, c.link.target, c.to)) n++; }, note || `Price sync from ${data.name}: ${list.length} price${list.length > 1 ? "s" : ""}`);
  st.lastSync = { at: new Date().toISOString(), count: n, from: data.name, stamp: data.stamp };
  await store.set(SYNC_KEY, st);
  return n;
}
// Runs when the extension loads and every few minutes: counts changes, tells you once per new version, or publishes if you chose that.
async function syncCheck(){
  const st = await syncState();
  if (!st.links.length || !SETTINGS.siteUrl || !SETTINGS.hasPassword) { SYNC_PENDING = 0; drawTabs(); return; }
  try {
    const data = await readSource(st.source); data.kind = st.source.kind === "file" ? "file" : "cd";
    const S = await freshDraft(), ch = pendingChanges(st, S, data).filter(c => !c.missing);
    SYNC_PENDING = ch.length; drawTabs();
    if (!ch.length || st.notified === data.stamp) return;
    if (st.mode === "auto"){
      const ok = ch.filter(c => c.from && Math.abs(c.to - c.from) / Math.abs(c.from) <= AUTO_LIMIT);
      if (ok.length){ await publishSync(ok, st, data); SYNC_PENDING = ch.length - ok.length; drawTabs(); notify(`Price sync published ${ok.length} new website price${ok.length > 1 ? "s" : ""} from ${data.name}.` + (SYNC_PENDING ? ` ${SYNC_PENDING} big change${SYNC_PENDING > 1 ? "s" : ""} wait for you in Website › Price sync.` : "")); }
      else notify(`${ch.length} big price change${ch.length > 1 ? "s" : ""} in ${data.name} (over ${AUTO_LIMIT * 100}%) wait for you in Website › Price sync.`);
    } else notify(`${ch.length} website price${ch.length > 1 ? "s" : ""} changed in ${data.name}. Review them in Website › Price sync.`);
    st.notified = data.stamp; await store.set(SYNC_KEY, st);
    if (TAB === "sync") go("sync");
  } catch (e) { console.warn("website-controller: price sync check failed", e); }
}

/* ======================= Price sync tab ======================= */
V.sync = async () => {
  const st = await syncState(), S = await freshDraft(), targets = siteTargets(S);
  let data = null, err = null;
  try { data = await readSource(st.source); data.kind = st.source.kind === "file" ? "file" : "cd"; } catch (e) { err = e; }
  const save = async () => { await store.set(SYNC_KEY, st); go("sync"); };
  const tLabel = k => (targets.find(t => t.key === k) || {}).label || k;
  const sLabel = k => (data?.entries.find(e => e.key === k) || {}).label || k;

  /* where the prices come from */
  const kind = h("select", {}, h("option", { value: "cabinet-designer" }, "Cabinet Designer price sheet"), h("option", { value: "file" }, "Newest price file in a Files folder"));
  kind.value = st.source.kind;
  const sheet = h("select", {}, (data?.sheets || []).map(s => h("option", { value: s.id }, s.name)));
  if (data?.sheetId) sheet.value = data.sheetId;
  const folder = h("input", { type: "text", value: st.source.folder || "", placeholder: "e.g. Price data" });
  const pick = () => { sheetF.hidden = kind.value !== "cabinet-designer"; folderF.hidden = kind.value !== "file"; };
  const sheetF = h("label", { class: "f" }, h("span", {}, "Price sheet"), sheet), folderF = h("label", { class: "f" }, h("span", {}, "Folder in Files (subfolders count too)"), folder);
  kind.onchange = pick; pick();
  const srcBox = h("div", { class: "box" }, h("h3", {}, "Where your prices come from"),
    h("div", { class: "fields" }, h("label", { class: "f" }, h("span", {}, "Source"), kind), sheetF, folderF),
    h("p", { class: "small muted" }, "A Files folder works for any program: drop in a .csv (name, price on each row) or a .json export and the newest file is used."),
    h("div", { class: "row" }, h("button", { class: "btn primary", onclick: async () => { st.source = { kind: kind.value, sheet: sheet.value, folder: folder.value.trim() }; st.notified = ""; await save(); } }, "Save and read"),
      h("span", { class: "small grow" + (err ? " err" : " muted") }, err ? err.message : `Read ${data.name}${data.when ? ` (${when(data.when)})` : ""}: ${data.entries.length} prices.`)));

  /* changes waiting */
  const ch = data ? pendingChanges(st, S, data) : [];
  const real = ch.filter(c => !c.missing), broken = ch.filter(c => c.missing);
  SYNC_PENDING = real.length; drawTabs();
  const ticks = new Map(real.map(c => [c, h("input", { type: "checkbox", checked: true })]));
  const note = h("input", { type: "text", placeholder: "What changed? (optional)", maxlength: 200, style: "max-width:300px" });
  const pubBtn = h("button", { class: "btn primary" }, "Publish checked");
  pubBtn.onclick = async () => {
    const list = real.filter(c => ticks.get(c).checked); if (!list.length) { toast("Tick at least one price.", true); return; }
    pubBtn.disabled = true; pubBtn.textContent = "Publishing…";
    try { const n = await publishSync(list, st, data, note.value.trim()); notify(`Published ${n} price${n === 1 ? "" : "s"}. The website shows them now.`); go("sync"); }
    catch (x) { toast(x.message, true); pubBtn.disabled = false; pubBtn.textContent = "Publish checked"; }
  };
  const pct = c => c.from ? ` (${c.to > c.from ? "+" : ""}${Math.round((c.to - c.from) / Math.abs(c.from) * 100)}%)` : "";
  const waitBox = h("div", { class: "box" }, h("h3", {}, real.length ? `${real.length} website price${real.length > 1 ? "s" : ""} to update` : "Changes waiting"),
    !data ? h("p", { class: "muted small" }, "Fix the source above first.")
      : !st.links.length ? h("p", { class: "muted small", style: "margin:0" }, "Link some prices below (Match for me does most of it), then changes show up here.")
      : !real.length ? h("p", { class: "okc small", style: "margin:0" }, "The website matches your price data.")
      : [h("div", { class: "scroll" }, h("table", { class: "t" }, h("tr", {}, h("th", {}), h("th", {}, "Website price"), h("th", {}, "Now"), h("th", {}, "New"), h("th", {}, "From")),
          real.map(c => h("tr", {}, h("td", {}, ticks.get(c)), h("td", {}, tLabel(c.link.target)), h("td", {}, money(c.from)), h("td", {}, h("b", {}, money(c.to)), h("span", { class: "small muted" }, pct(c))),
            h("td", { class: "small muted" }, `${c.src.label}: ${money(c.src.value)}`, (c.link.times ?? 1) !== 1 ? ` × ${c.link.times}` : "", +c.link.plus ? ` + ${c.link.plus}` : ""))))),
        h("div", { class: "row", style: "margin-top:10px" }, h("span", { class: "grow small muted" }, "Goes live right away through your admin connection. No deploy. Undo from Backups."), note, pubBtn)],
    broken.length ? h("p", { class: "small err" }, `${broken.length} link${broken.length > 1 ? "s" : ""} point${broken.length > 1 ? "" : "s"} at a price that isn't there any more: `, broken.map(c => c.missing === "source" ? sLabel(c.link.source) : tLabel(c.link.target)).join(", "), ".") : null,
    st.lastSync ? h("p", { class: "small muted", style: "margin-bottom:0" }, `Last sync ${ago(st.lastSync.at)}: ${st.lastSync.count} price${st.lastSync.count === 1 ? "" : "s"} from ${st.lastSync.from}.`) : null);

  /* the links */
  const tList = h("datalist", { id: "wcTargets" }, targets.map(t => h("option", { value: t.label }))), sList = h("datalist", { id: "wcSources" }, (data?.entries || []).map(e => h("option", { value: e.label })));
  const num = (v, set, w) => { const i = h("input", { type: "number", step: "any", value: v, style: `width:${w || 80}px` }); i.onchange = async () => { set(i.value === "" ? null : +i.value); await store.set(SYNC_KEY, st); go("sync"); }; return i; };
  const roundSel = l => { const s = h("select", { style: "width:auto" }, ROUNDS.map(([v, t]) => h("option", { value: v }, t))); s.value = l.round || "cent"; s.onchange = async () => { l.round = s.value; await save(); }; return s; };
  const srcByKey = new Map((data?.entries || []).map(e => [e.key, e]));
  const linkRows = st.links.map((l, i) => {
    const e = srcByKey.get(l.source), cur = getAt(S, l.target);
    return h("tr", {}, h("td", {}, tLabel(l.target), h("div", { class: "small muted" }, typeof cur === "number" ? `now ${money(cur)}` : "not on the website any more")),
      h("td", {}, sLabel(l.source), h("div", { class: "small muted" }, e ? money(e.value) : "not in your price data")),
      h("td", {}, num(l.times ?? 1, v => l.times = v == null ? 1 : v)), h("td", {}, num(l.plus || 0, v => l.plus = v || 0)), h("td", {}, roundSel(l)),
      h("td", { class: "small" }, e ? money(linkValue(l, e.value)) : ""),
      h("td", {}, h("button", { class: "btn sm danger", onclick: async () => { st.links.splice(i, 1); await save(); } }, "Remove")));
  });
  const newT = h("input", { type: "text", list: "wcTargets", placeholder: "Website price (type to search)" }), newS = h("input", { type: "text", list: "wcSources", placeholder: "Your price (type to search)" });
  const addLink = async () => {
    const t = targets.find(x => x.label === newT.value), e = data?.entries.find(x => x.label === newS.value);
    if (!t || !e) { toast("Pick both from the lists that show when you type.", true); return; }
    st.links.push({ target: t.key, source: e.key, times: 1, plus: 0, round: "cent" }); await save();
  };
  const matchBtn = h("button", { class: "btn", disabled: !data, onclick: () => matchDialog(st, data, targets) }, "Match for me");
  const linkBox = h("div", { class: "box" }, h("div", { class: "row" }, h("h3", { class: "grow", style: "margin:0" }, `Linked prices (${st.links.length})`), matchBtn),
    h("p", { class: "small muted" }, "Website price = your price × Times + Plus, then rounded. Use Times for a markup (1.10 = +10%) or to turn a per-sq-ft price into a per-door one."),
    st.links.length ? h("div", { class: "scroll" }, h("table", { class: "t" }, h("tr", {}, ["Website price", "Your price", "Times", "Plus", "Round", "Gives", ""].map(x => h("th", {}, x))), linkRows)) : null,
    h("div", { class: "fields", style: "margin-top:10px" }, h("label", { class: "f" }, h("span", {}, "Website price"), newT), h("label", { class: "f" }, h("span", {}, "Your price"), newS),
      h("div", { class: "f", style: "align-self:end" }, h("button", { class: "btn", onclick: addLink }, "Add link"))), tList, sList);

  /* how it swaps */
  const modeSel = h("select", {}, h("option", { value: "ask" }, "Ask me first (shows a note and a badge on this tab)"), h("option", { value: "auto" }, "Publish right away"));
  modeSel.value = st.mode; modeSel.onchange = async () => { st.mode = modeSel.value; st.notified = ""; await save(); };
  const modeBox = h("div", { class: "box" }, h("h3", {}, "When your prices change"), modeSel,
    h("p", { class: "small muted", style: "margin-bottom:0" }, `The hub checks every ${SYNC_EVERY / 60000} minutes while it's running. "Publish right away" still waits for you when a price moves more than ${AUTO_LIMIT * 100}%.`));

  return h("div", {}, head("Price sync", "Link website prices to your own price data. When you change your prices, the website follows: you review and publish, or it publishes for you."),
    h("div", { class: "grid" }, h("div", { class: "two" }, srcBox, modeBox), waitBox, linkBox));
};
function matchDialog(st, data, targets){
  const list = suggest(st, data, targets);
  if (!list.length) { toast("No new matches found. Add links by hand below."); return; }
  const boxes = list.map(s => h("input", { type: "checkbox", checked: s.sure }));
  const m = modal("Match for me",
    h("p", { class: "small muted", style: "margin-top:0" }, "Ticked ones are the same thing in both places. Unticked ones are close; read the note before you tick them."),
    h("div", { class: "scroll" }, h("table", { class: "t" }, h("tr", {}, h("th", {}), h("th", {}, "Your price"), h("th", {}, "Website price"), h("th", {}, "")),
      list.map((s, i) => h("tr", {}, h("td", {}, boxes[i]), h("td", {}, s.e.label, h("div", { class: "small muted" }, money(s.e.value))), h("td", {}, s.t.label, h("div", { class: "small muted" }, `now ${money(s.t.value)}`)), h("td", { class: "small muted" }, s.why || ""))))),
    h("div", { class: "row right", style: "margin-top:10px" }, h("button", { class: "btn primary", onclick: async () => {
      list.forEach((s, i) => { if (boxes[i].checked) st.links.push({ target: s.target, source: s.source, times: 1, plus: 0, round: "cent" }); });
      await store.set(SYNC_KEY, st); m.close(); go("sync");
    } }, "Add ticked links")));
}

/* tab, badge and the background check */
TABS.splice(TABS.findIndex(t => t[0] === "prices") + 1, 0, ["sync", "Price sync"]);
setInterval(() => syncCheck(), SYNC_EVERY);
