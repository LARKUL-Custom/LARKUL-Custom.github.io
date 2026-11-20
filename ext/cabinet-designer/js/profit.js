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
const PF_KEY = () => KEY + '.profitOpen';
function profitOpen() { if (ui.profitOpen == null) { try { ui.profitOpen = localStorage.getItem(PF_KEY()) === '1'; } catch (_) { ui.profitOpen = false; } } return ui.profitOpen; }
function profitOf(ps, q) {
  const P = ps.profit || {}, topsPct = numOr(P.topsPct, 80), laborPct = numOr(P.laborPct, 0);
  const jl = q.jobLines.reduce((a, l) => a + (+l.amount || 0), 0), f = q.sub > 0 ? (q.sub + q.markup) / q.sub : 1;
  const sum = (ls, fn) => ls.reduce((a, l) => a + (fn ? fn(l) : +l.amount || 0), 0);
  const rooms = q.rooms.map(R => {
    const c = { mat: 0, doors: 0, hw: 0, ins: 0 };
    R.cabs.forEach(k => { if (k.cost) Object.keys(c).forEach(x => { c[x] += +k.cost[x] || 0; }); });
    const inst = sum(R.lines.filter(l => l.inst)), bought = sum(R.lines.filter(l => l.top || /^Molding\b/.test(l.name))) * topsPct / 100, lam = sum(R.lines, l => +l.cost || 0);
    const price = R.total * f, labor = price * laborPct / 100;
    const cost = c.mat + c.doors + c.hw + c.ins + inst + bought + lam + labor;
    return { R, price, c, inst, bought, lam, labor, cost, profit: price - cost };
  });
  // Job lines: installation and percent charges are paid out; other job lines (window sills, per-job extras) are price.
  const jobInst = sum(q.jobLines.filter(l => l.inst)), pct = sum(q.jobLines.filter(l => l.xi != null)), jobOther = jl - jobInst - pct;
  const price = q.sub + q.markup, tot = k => rooms.reduce((a, r) => a + (typeof k === 'function' ? k(r) : r[k]), 0);
  const cost = tot('cost') + jobInst + pct;
  return { rooms, topsPct, laborPct, jobInst, pct, jobOther, jobPrice: jl * f, price, cost, profit: price - cost,
    lines: [['Sheet goods and edge banding', tot(r => r.c.mat)], ['Doors and fronts (material, or the door maker\'s price)', tot(r => r.c.doors)], ['Hardware', tot(r => r.c.hw)], ['Inserts', tot(r => r.c.ins)],
      ['Laminate (laminated bottoms)', tot('lam')], ['Installation (paid to the installer)', tot('inst') + jobInst], [`Countertops and molding (${topsPct}% of what we charge)`, tot('bought')],
      ['Percent charges (fuel and delivery, marketing, commission)', pct], [`Shop labor and overhead (${laborPct}% of the price)`, tot('labor')]] };
}
const pctOf = (a, b) => b ? `${Math.round(a / b * 1000) / 10}%` : '–';
function profitCard(ps, q) {
  const open = profitOpen();
  const head = `<button class="sechead teal prx-fold" data-act="profit-fold" aria-expanded="${open}" title="${open ? 'Hide' : 'Show'} the estimated profit">${icon('chevr', open ? 'rot90' : '')}<span>Estimated profit</span><span class="prx-n">not printed</span></button>`;
  if (!open) return `<div class="psec box prx-profit shut">${head}</div>`;
  const P = profitOf(ps, q), ref = `pshp:${ps.id}:profit`;
  const inp = (f, v, l) => `<span class="prx-pct">${ctl(ref, f, v, 'num', { label: l })}%</span>`;
  return `<div class="psec box prx-profit">${head}
    <div class="prx-pfgrid"><div><table class="t prx-pft"><tbody>
      <tr><td><b>Price before tax</b></td><td class="n"><b>${money(P.price)}</b></td></tr>
      ${P.lines.filter(([, v]) => Math.abs(v) > 0.005).map(([l, v]) => `<tr><td>${esc(l)}</td><td class="n">−${money(v)}</td></tr>`).join('')}
      <tr class="grand"><td>Estimated profit</td><td class="n">${money(P.profit)} <span class="prx-pfm">${pctOf(P.profit, P.price)}</span></td></tr></tbody></table>
      <div class="prx-pfin"><label>Countertops and molding cost ${inp('topsPct', P.topsPct, 'Countertops and molding cost percent of what we charge')} of what we charge</label>
        <label>Shop labor and overhead ${inp('laborPct', P.laborPct, 'Shop labor and overhead percent of the price')} of the price</label></div>
      <div class="note">Only on this screen: the printed quote, Print pages and the quote CSV leave it out. Shop labor, paint and markup are in the profit unless you fill in shop labor and overhead.</div></div>
    <div class="tscroll"><table class="t prx-pfr"><thead><tr><th>Room</th><th class="r">Price</th><th class="r">Costs</th><th class="r">Profit</th><th class="r">Margin</th></tr></thead><tbody>
      ${P.rooms.map(r => `<tr><td>${esc(r.R.r.name)}</td><td class="n">${money(r.price)}</td><td class="n">${money(r.cost)}</td><td class="n">${money(r.profit)}</td><td class="n">${pctOf(r.profit, r.price)}</td></tr>`).join('')}
      ${P.jobInst || P.pct || P.jobOther ? `<tr><td>Job charges</td><td class="n">${money(P.jobPrice)}</td><td class="n">${money(P.jobInst + P.pct)}</td><td class="n">${money(P.jobPrice - P.jobInst - P.pct)}</td><td></td></tr>` : ''}</tbody>
      <tfoot><tr><td>Job</td><td class="n">${money(P.price)}</td><td class="n">${money(P.cost)}</td><td class="n">${money(P.profit)}</td><td class="n">${pctOf(P.profit, P.price)}</td></tr></tfoot></table></div></div></div>`;
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-act="profit-fold"]'); if (!b) return;
  ui.profitOpen = !profitOpen(); try { localStorage.setItem(PF_KEY(), ui.profitOpen ? '1' : '0'); } catch (_) {}
  if (typeof renderPricing === 'function') renderPricing();
});
