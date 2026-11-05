// Updating the screen in place, so editing something does not make it flash.
// setHTML(el, html) changes only the parts of el that differ from html: unchanged buttons, fields,
// pictures and drawings stay the very same elements. Pictures do not load again, the field you are
// typing in keeps its cursor, hover and scroll stay put, and the browser repaints only what moved.
// Use it instead of el.innerHTML = html for anything that is drawn again after each edit.
'use strict';
const MORPH_SVG = 'http://www.w3.org/2000/svg';
// Parses html in el's own context (an <svg> parses as SVG, a <select> takes options).
function morphParse(el, html) {
  const t = el.namespaceURI === MORPH_SVG ? document.createElementNS(MORPH_SVG, el.localName) : document.createElement(el.localName === 'select' ? 'select' : 'div');
  t.innerHTML = html; return t;
}
const morphSame = (a, b) => a.nodeType === b.nodeType && a.nodeName === b.nodeName && (a.nodeType !== 1 || (a.getAttribute('id') || '') === (b.getAttribute('id') || ''));
function morphAttrs(a, b) {
  for (let i = a.attributes.length - 1; i >= 0; i--) { const n = a.attributes[i]; if (!b.hasAttributeNS(n.namespaceURI, n.localName)) a.removeAttributeNS(n.namespaceURI, n.localName); }
  for (const n of b.attributes) if (a.getAttributeNS(n.namespaceURI, n.localName) !== n.value) a.setAttributeNS(n.namespaceURI, n.name, n.value);
}
function morphNode(a, b) {
  if (a.nodeType !== 1) { if (a.nodeValue !== b.nodeValue) a.nodeValue = b.nodeValue; return; }
  morphAttrs(a, b);
  // A live drawing (like the editor's 3D view) owns its insides: only its attributes change.
  if (a.hasAttribute('data-morph-keep')) return;
  const tag = a.localName, focused = a === document.activeElement;
  if (tag === 'textarea') { if (!focused && a.value !== b.value) a.value = b.value; return; }
  morphKids(a, b);
  // Fields show what the new screen says, except the one being typed in.
  if (tag === 'input' && !focused) {
    if (a.type === 'checkbox' || a.type === 'radio') a.checked = b.hasAttribute('checked');
    else if (a.type !== 'file' && a.value !== (b.getAttribute('value') ?? '')) a.value = b.getAttribute('value') ?? '';
  }
  if (tag === 'select' && !focused) morphPick(a, b);
}
// A list shows the choice marked selected in the new screen (the first one when none is).
function morphPick(a, b) { const i = [...b.querySelectorAll('option')].findIndex(o => o.hasAttribute('selected')); a.selectedIndex = i < 0 ? (a.options.length ? 0 : -1) : i; }
function morphKids(a, b) {
  const want = [...b.childNodes];
  let cur = a.firstChild;
  for (const n of want) {
    if (cur && morphSame(cur, n)) { morphNode(cur, n); cur = cur.nextSibling; continue; }
    // A keyed element (with an id) that moved further down: bring it up instead of making a new one.
    const id = n.nodeType === 1 && n.getAttribute('id');
    const far = id && [...a.children].find(x => x.getAttribute('id') === id && x.localName === n.localName);
    if (far) { a.insertBefore(far, cur); morphNode(far, n); continue; }
    a.insertBefore(n, cur);
  }
  while (cur) { const nx = cur.nextSibling; a.removeChild(cur); cur = nx; }
}
// html can be a string or an element whose children are the new content.
function setHTML(el, html) {
  if (!el) return;
  const t = typeof html === 'string' ? morphParse(el, html) : html;
  morphKids(el, t);
  if (el.localName === 'select' && el !== document.activeElement) morphPick(el, t);
}

// Wood and other picture textures in the 2D drawings: each pattern is made once here and every
// drawing points at it, so redrawing a drawing never loads its pictures again (which flashed them white).
function texPatterns(list) {
  let box = document.getElementById('texpats');
  if (!box) {
    box = document.createElementNS(MORPH_SVG, 'svg'); box.id = 'texpats'; box.setAttribute('aria-hidden', 'true');
    // Not display:none: patterns inside a hidden svg do not paint in some browsers.
    box.setAttribute('style', 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none');
    box.innerHTML = '<defs></defs>'; document.body.prepend(box);
  }
  const defs = box.firstChild;
  list.forEach(([id, href, k]) => {
    let p = document.getElementById(id);
    if (p && p.parentNode !== defs) p = null;
    if (!p) { p = document.createElementNS(MORPH_SVG, 'pattern'); p.id = id; p.setAttribute('patternUnits', 'userSpaceOnUse'); p.innerHTML = '<image preserveAspectRatio="none"/>'; defs.appendChild(p); }
    const im = p.firstChild;
    if (p.getAttribute('width') !== String(k)) { p.setAttribute('width', k); p.setAttribute('height', k); im.setAttribute('width', k); im.setAttribute('height', k); }
    if (im.getAttribute('href') !== href) im.setAttribute('href', href);
  });
}
