/* ---------- Estimated profit (Ayden 2026-11-20: "a separate part in pricing that tells me my estimated profit that doesnt get printed") ----------
   On Pricing › Quote only. The printed quote, Print pages and the quote CSV never include it.
   Price = what the customer pays before tax. Costs = what the shop pays out:
   - sheet goods and edge banding for every part (cabinet, drawer boxes, shelves, panels, fillers), at the material prices
   - shop-made fronts: their material; bought fronts (Bywater...): what the door maker charges
   - hardware at the price sheet's hardware prices, inserts at their library prices
   - laminate for laminated bottoms, installation (paid to the installer)
   - countertops and molding: a % of what we charge (bought in); percent charges (fuel and delivery, marketing, commission)
   - shop labor and overhead: a % of the price, if filled in.
   Everything else (labor in the cabinet prices, paint, markup) is what is left: the estimated profit. */
// 0.59.37 (Ayden 2026-11-20: "its not taking into account labor, i get its hard to calculate but we need to try"): shop hours
// counted from the drawing, at the shop rate. Every number is a starting guess, editable on the tab (saved on the price sheet).
const LAB_ITEMS = [
  ['sheet', 'CNC, per sheet (load, cut, unload)', 0.35], ['part', 'Edge band, sand and sort, per part', 0.03],
  ['Base', 'Assemble, per base cabinet', 0.75], ['Wall', 'Assemble, per wall cabinet', 0.5], ['Tall', 'Assemble, per tall cabinet', 1.25],
  ['door', 'Hinge, hang and adjust, per door', 0.25], ['drawer', 'Box, slides and front, per drawer', 0.5],
  ['panel', 'Fit, per applied panel or filler', 0.25], ['paint', 'Finishing, per painted sq ft', 0.04], ['own', 'Own-price products (floating shelves...), each', 1],
];
const LAB_RATE = 55;
const labH = (P, k) => numOr(((P.h || {})[k]), LAB_ITEMS.find(x => x[0] === k)[2]);
// What one room has, for the labor estimate.
function labCounts(R, ps) {
  const n = Object.fromEntries(LAB_ITEMS.map(([k]) => [k, 0])), area = {};
  R.cabs.forEach(k => { const L = k.cost && k.cost.lab; if (!L) return;
    n.part += L.parts; n.door += L.doors; n.drawer += L.drawers; n.panel += L.panels + L.fillers;
    if (n[k.c.cat] != null && !k.c.noCount) n[k.c.cat]++; n.paint += (k.sq && k.sq.total) || 0;
    Object.entries(L.area).forEach(([id, a]) => { area[id] = (area[id] || 0) + a; }); });
  const waste = 1 + (+((ps.materials || {}).waste) || 0) / 100;
  n.sheet = Object.entries(area).reduce((a, [id, sq]) => { const m = mat(id); return a + sq * waste / (((m && m.sheetW) || 49) * ((m && m.sheetL) || 97)); }, 0);
  n.own = R.lines.filter(l => l.own).length;
  return n;
}
function profitOf(ps, q) {
  const P = ps.profit || {}, topsPct = numOr(P.topsPct, 80), overPct = numOr(P.overPct, 0), rate = numOr(P.rate, LAB_RATE);
  const jl = q.jobLines.reduce((a, l) => a + (+l.amount || 0), 0), f = q.sub > 0 ? (q.sub + q.markup) / q.sub : 1;
  const sum = (ls, fn) => ls.reduce((a, l) => a + (fn ? fn(l) : +l.amount || 0), 0);
  const rooms = q.rooms.map(R => {
    const c = { mat: 0, doors: 0, hw: 0, ins: 0 };
    R.cabs.forEach(k => { if (k.cost) Object.keys(c).forEach(x => { c[x] += +k.cost[x] || 0; }); });
    const inst = sum(R.lines.filter(l => l.inst)), bought = sum(R.lines.filter(l => l.top || /^Molding\b/.test(l.name))) * topsPct / 100, lam = sum(R.lines, l => +l.cost || 0);
    const n = labCounts(R, ps), hours = LAB_ITEMS.reduce((a, [k]) => a + n[k] * labH(P, k), 0);
    const price = R.total * f, labor = hours * rate, over = price * overPct / 100;
    const cost = c.mat + c.doors + c.hw + c.ins + inst + bought + lam + labor + over;
    return { R, price, c, inst, bought, lam, n, hours, labor, over, cost, profit: price - cost };
  });
  // Job lines: installation and percent charges are paid out; other job lines (window sills, per-job extras) are price.
  const jobInst = sum(q.jobLines.filter(l => l.inst)), pct = sum(q.jobLines.filter(l => l.xi != null)), jobOther = jl - jobInst - pct;
  const price = q.sub + q.markup, tot = k => rooms.reduce((a, r) => a + (typeof k === 'function' ? k(r) : r[k]), 0);
  const cost = tot('cost') + jobInst + pct;
  const hours = tot('hours');
  return { rooms, topsPct, overPct, rate, hours, P, jobInst, pct, jobOther, jobPrice: jl * f, price, cost, profit: price - cost,
    lines: [['Sheet goods and edge banding', tot(r => r.c.mat)], ['Doors and fronts (material, or the door maker\'s price)', tot(r => r.c.doors)], ['Hardware', tot(r => r.c.hw)], ['Inserts', tot(r => r.c.ins)],
      ['Laminate (laminated bottoms)', tot('lam')], ['Installation (paid to the installer)', tot('inst') + jobInst], [`Countertops and molding (${topsPct}% of what we charge)`, tot('bought')],
      [`Shop labor (${Math.round(hours * 10) / 10} hours × ${money(rate)}/hour)`, tot('labor')], ['Percent charges (fuel and delivery, marketing, commission)', pct], [`Overhead (${overPct}% of the price)`, tot('over')]] };
}
const pctOf = (a, b) => b ? `${Math.round(a / b * 1000) / 10}%` : '–';
function profitCard(ps, q) {
  // 0.59.37 (Ayden 2026-11-20): its own tab next to Quote, Edit prices and Order, not a card on the Quote.
  const head = `<div class="sechead teal"><span>Estimated profit</span><span class="prx-n">not printed</span></div>`;
  const P = profitOf(ps, q), ref = `pshp:${ps.id}:profit`;
  const inp = (f, v, l) => `<span class="prx-pct">${ctl(ref, f, v, 'num', { label: l })}%</span>`;
  return `<div class="psec box prx-profit">${head}
    <div class="prx-pfgrid"><div><table class="t prx-pft"><tbody>
      <tr><td><b>Price before tax</b></td><td class="n"><b>${money(P.price)}</b></td></tr>
      ${P.lines.filter(([, v]) => Math.abs(v) > 0.005).map(([l, v]) => `<tr><td>${esc(l)}</td><td class="n">−${money(v)}</td></tr>`).join('')}
      <tr class="grand"><td>Estimated profit</td><td class="n">${money(P.profit)} <span class="prx-pfm">${pctOf(P.profit, P.price)}</span></td></tr></tbody></table>
      <div class="prx-pfin"><label>Countertops and molding cost ${inp('topsPct', P.topsPct, 'Countertops and molding cost percent of what we charge')} of what we charge</label>
        <label>Shop rate <span class="prx-pct">$${ctl(ref, 'rate', P.rate ?? LAB_RATE, 'num', { label: 'Shop labor dollars per hour' })}</span> per hour</label>
        <label>Overhead (rent, power, tools) ${inp('overPct', P.overPct, 'Overhead percent of the price')} of the price</label></div>
      <div class="note">Only on this screen: the printed quote, Print pages and the quote CSV leave it out. Shop labor is estimated from the drawing; tune the hours below.</div></div>
    <div class="tscroll"><table class="t prx-pfr"><thead><tr><th>Room</th><th class="r">Price</th><th class="r">Labor h</th><th class="r">Costs</th><th class="r">Profit</th><th class="r">Margin</th></tr></thead><tbody>
      ${P.rooms.map(r => `<tr><td>${esc(r.R.r.name)}</td><td class="n">${money(r.price)}</td><td class="n">${Math.round(r.hours * 10) / 10}</td><td class="n">${money(r.cost)}</td><td class="n">${money(r.profit)}</td><td class="n">${pctOf(r.profit, r.price)}</td></tr>`).join('')}
      ${P.jobInst || P.pct || P.jobOther ? `<tr><td>Job charges</td><td class="n">${money(P.jobPrice)}</td><td></td><td class="n">${money(P.jobInst + P.pct)}</td><td class="n">${money(P.jobPrice - P.jobInst - P.pct)}</td><td></td></tr>` : ''}</tbody>
      <tfoot><tr><td>Job</td><td class="n">${money(P.price)}</td><td class="n">${Math.round(P.hours * 10) / 10}</td><td class="n">${money(P.cost)}</td><td class="n">${money(P.profit)}</td><td class="n">${pctOf(P.profit, P.price)}</td></tr></tfoot></table>
      <h4 class="prx-pflh">Labor hours: how they're counted</h4><table class="t prx-pflab"><thead><tr><th>Work</th><th class="r">Count</th><th class="r">Hours each</th><th class="r">Hours</th></tr></thead><tbody>
        ${LAB_ITEMS.map(([k, l]) => { const cnt = P.rooms.reduce((a, r) => a + r.n[k], 0); return `<tr><td>${esc(l)}</td><td class="n">${k === 'sheet' ? Math.round(cnt * 10) / 10 : k === 'paint' ? sqft(cnt) : cnt}</td><td class="n" style="width:90px">${ctl(ref + '.h', k, labH(P.P, k), 'num', { label: l + ' hours' })}</td><td class="n">${Math.round(cnt * labH(P.P, k) * 10) / 10}</td></tr>`; }).join('')}</tbody>
        <tfoot><tr><td colspan="3">Shop labor</td><td class="n">${Math.round(P.hours * 10) / 10} h</td></tr></tfoot></table>
      <div class="note">Starting guesses: change the hours each to match your shop. Sheets are the cut sheet area (with waste) over the sheet size.</div></div></div></div>`;
}
