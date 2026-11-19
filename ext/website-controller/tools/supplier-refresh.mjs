#!/usr/bin/env node
/* Refresh supplier items for the LARKUL website.
   Reads the public product lists of Ayden's suppliers and writes site/supplier-items.json:
     - Hardware Resources: legs, posts, feet, corbels, appliques (every size and wood, with item numbers)
     - Mantels Direct: fireplace mantel surrounds
     - Vent Covers Unlimited: wood and toe-kick vent covers
   Read only: it never signs in, never adds to a cart, never orders.
   Run:  node extensions/website-controller/tools/supplier-refresh.mjs
   (GitHub runs it from .github/workflows/supplier-refresh.yml.) Needs Node 18+ (built-in fetch). */
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "site", "supplier-items.json");
const UA = "Mozilla/5.0 (compatible; LARKUL-price-refresh/1.0)";
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function get(url, as = "text", tries = 3){
  for (let i = 1; ; i++){
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA, Accept: as === "json" ? "application/json" : "text/html" } });
      if (!r.ok) throw new Error(`${r.status} ${url}`);
      return as === "json" ? await r.json() : await r.text();
    } catch (e){ if (i >= tries) throw e; await sleep(1500 * i); }
  }
}
async function pool(list, n, fn){
  const out = new Array(list.length); let next = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (next < list.length){ const i = next++; out[i] = await fn(list[i], i); await sleep(150); } }));
  return out;
}
const decode = s => String(s || "").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#x27;/g, "'").trim();
const meta = (html, prop) => { const m = html.match(new RegExp(`<meta[^>]+(?:property|name)="${prop}"[^>]+content="([^"]*)"`, "i")) || html.match(new RegExp(`<meta[^>]+content="([^"]*)"[^>]+(?:property|name)="${prop}"`, "i")); return m ? decode(m[1]) : ""; };

/* ---------- Hardware Resources (Magento: every product page carries its options and prices) ---------- */
const HR = "https://www.hardwareresources.com";
const HR_CATS = { "cabinet-feet-legs": "feet", "legs-corner-posts": "legs", "posts": "legs", "corbels": "corbels", "fireplace-corbels": "corbels", "onlays-appliques": "appliques" };
export function hrLinks(html, cat){
  const re = new RegExp(`href="(${HR.replace(/\./g, "\\.")}/decorative-wood-moulding/decorative-wood/${cat}/[^"?#]+\\.html)"`, "g");
  return [...new Set([...html.matchAll(re)].map(m => m[1]))];
}
export function hrProduct(html, url, cat){
  const slug = url.split("/").pop().replace(/\.html$/, "");
  let name = decode((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1] || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim() || meta(html, "og:title");
  let size = "";
  const m = name.match(/^(.+"\s*[HLWD])\s+([A-Z].+)$/); if (m && /x/.test(m[1])){ size = m[1]; name = m[2]; }
  const img = meta(html, "og:image").split("?")[0];
  const inits = [...html.matchAll(/<script type="text\/x-magento-init">([\s\S]*?)<\/script>/g)].map(x => x[1]);
  const conf = inits.find(t => /"jsonConfig"/.test(t));
  const it = { id: "hr-" + slug, src: "hr", cat: HR_CATS[cat], name, sku: slug.toUpperCase(), size, url, img, opts: [], v: [] };
  if (conf){
    const o = JSON.parse(conf), first = Object.values(o)[0], jc = Object.values(first)[0].jsonConfig;
    const attrs = Object.values(jc.attributes).sort((a, b) => a.position - b.position);
    it.opts = attrs.map(a => [a.label === "Dimensions" ? "Size" : a.label, a.options.map(x => decode(x.label))]);
    const skus = jc.skus || jc.sku || {};
    it.v = Object.entries(jc.index).map(([pid, sel]) => [...attrs.map(a => a.options.findIndex(x => x.id === sel[a.id])), +((jc.optionPrices[pid] || {}).finalPrice || {}).amount || 0, skus[pid] || "", null])
      .filter(v => v[attrs.length] > 0 && v.slice(0, attrs.length).every(i => i >= 0));
    // drop option values no variant uses
    it.opts.forEach((o, oi) => { const used = [...new Set(it.v.map(v => v[oi]))].sort((a, b) => a - b); if (used.length < o[1].length){ o[1] = used.map(i => o[1][i]); it.v.forEach(v => v[oi] = used.indexOf(v[oi])); } });
  } else {
    const p = inits.map(t => t.match(/"final_price":([\d.]+)/)).find(Boolean);
    const sku = (html.match(/itemprop="sku"[^>]*>([^<]+)</) || [])[1] || it.sku;
    if (p) it.v = [[+p[1], decode(sku), null]];
    it.sku = decode(sku);
  }
  return it.v.length ? it : null;
}
async function hardwareResources(){
  const items = [], seen = new Set();
  for (const cat of Object.keys(HR_CATS)){
    const links = new Set();
    for (let p = 1; p < 20; p++){
      const html = await get(`${HR}/decorative-wood-moulding/decorative-wood/${cat}.html?p=${p}&product_list_limit=96`);
      const before = links.size; hrLinks(html, cat).forEach(u => links.add(u));
      if (links.size === before) break;
    }
    const found = await pool([...links].filter(u => !seen.has(u)), 4, async u => { seen.add(u); try { return hrProduct(await get(u), u, cat); } catch (e){ console.warn("skip", u, e.message); return null; } });
    found.filter(Boolean).forEach(x => items.push(x));
    console.log(`Hardware Resources ${cat}: ${links.size} pages, ${found.filter(Boolean).length} items`);
  }
  return items;
}

/* ---------- Shopify stores (Mantels Direct, Vent Covers Unlimited): /collections/<c>/products.json ---------- */
async function shopify(base, collection){
  const all = [];
  for (let p = 1; p < 40; p++){
    const j = await get(`${base}/collections/${collection}/products.json?limit=250&page=${p}`, "json");
    if (!j.products || !j.products.length) break;
    all.push(...j.products);
  }
  return all;
}
const tag = (p, k) => p.tags.filter(t => t.startsWith(k + ":")).map(t => t.slice(k.length + 1)).filter(Boolean);
const minPrice = p => Math.min(...p.variants.map(v => +v.price).filter(x => x > 0));
export function mdItem(p){
  if (/sample/i.test(p.title)) return null;
  const len = tag(p, "length")[0] || "", dep = tag(p, "depth")[0] || "";
  const price = minPrice(p); if (!isFinite(price) || price <= 0 || price >= 10000 && /stacked/i.test(p.title)) return null;
  return { id: "md-" + p.handle, src: "md", cat: "mantels", name: p.title, sku: p.variants[0].sku || String(p.id),
    size: [/^[\d.]+$/.test(len) ? `${len}" W` : len ? `${len}" W` : "", /^[\d.]+$/.test(dep) ? `${dep}" D` : ""].filter(Boolean).join(" x "),
    material: tag(p, "material")[0] || (p.product_type || "").replace(/ Mantels?$/, ""),
    finishes: [...new Set(tag(p, "Finish/Color"))], custom: p.tags.includes("is_custom:T"),
    url: `https://www.mantelsdirect.com/products/${p.handle}`, img: (p.images[0] || {}).src ? p.images[0].src.split("?")[0] : "",
    opts: [], v: [[price, p.variants[0].sku || String(p.id), null]] };
}
export function vcuItem(p, kind){
  if (/sample|disclaimer|finish|thickness|damper/i.test(p.product_type + " " + p.title)) return null;
  const price = minPrice(p); if (!isFinite(price) || price <= 0) return null;
  const wo = p.options.findIndex(o => /wood|species|material/i.test(o.name));
  const species = wo >= 0 ? p.options[wo].values.map(v => v.replace(/\*|-(Standard|Premium.*|Exotic.*)$/g, "").replace(/\s*\(Paint Grade\)/, "").trim()) : [];
  return { id: "vcu-" + p.handle, src: "vcu", cat: "vents", name: p.title, sku: p.variants[0].sku || String(p.id), from: true,
    style: kind, material: /metal|aluminum|steel/i.test(species.join(" ")) ? "Metal" : "Wood", species: [...new Set(species)],
    url: `https://www.ventcoversunlimited.com/products/${p.handle}`, img: (p.images[0] || {}).src ? p.images[0].src.split("?")[0] : "",
    opts: [], v: [[price, p.variants[0].sku || String(p.id), null]] };
}

async function main(){
  const only = process.argv.slice(2);
  const want = k => !only.length || only.includes(k);
  const items = [];
  if (want("hr")) items.push(...await hardwareResources());
  if (want("md")) { const md = (await shopify("https://www.mantelsdirect.com", "shop-all-fireplace-mantels")).map(mdItem).filter(Boolean); console.log(`Mantels Direct: ${md.length} surrounds`); items.push(...md); }
  if (want("vcu")) {
    const seen = new Set();
    for (const [c, kind] of [["toe-kick-vent-covers", "toe-kick"], ["wood-vent-covers", "wood"]]){
      const list = (await shopify("https://www.ventcoversunlimited.com", c)).filter(p => !seen.has(p.id) && seen.add(p.id)).map(p => vcuItem(p, kind)).filter(Boolean);
      console.log(`Vent Covers Unlimited ${c}: ${list.length}`); items.push(...list);
    }
  }
  if (items.length < 50) throw new Error(`Only ${items.length} items came back. Not saving, so the website keeps its last good list.`);
  await writeFile(OUT, JSON.stringify({ updated: new Date().toISOString().slice(0, 10), count: items.length, items }) + "\n");
  console.log(`Saved ${items.length} items to ${OUT}`);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main().catch(e => { console.error(e.message); process.exit(1); });
