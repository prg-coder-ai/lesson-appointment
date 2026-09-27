const fs = require('fs');
const s = fs.readFileSync('api/beforeRun/dist/index.html', 'utf8');
const start = s.indexOf('(function () {');
let d = 0, end = -1;
for (let k = start; k < s.length; k++) { const c = s[k]; if (c === '(') d++; else if (c === ')') { d--; if (d === 0) { end = k; break; } } }
let iife = s.slice(start, end + 1);
iife = iife.replace('try {', 'try { console.log("ENTER_TRY; search=", JSON.stringify(window.location.search), "URLSearchParams?", typeof URLSearchParams, "win.loc?", typeof window.location);');
iife = iife.replace('} catch (e) {}', '} catch (e) { console.log("INNER_ERR:", e && e.message, e && e.stack); }');

const search = '?tCode =tenant_A';
const store = {};
globalThis.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
globalThis.URLSearchParams = URLSearchParams;
globalThis.encodeURIComponent = encodeURIComponent;
globalThis.decodeURIComponent = decodeURIComponent;
globalThis.setTimeout = (f) => { if (typeof f === 'function') f(); };
globalThis.console = console;
let replaced = null;
const win = { location: { search, href: '' }, localStorage: globalThis.localStorage, encodeURIComponent, decodeURIComponent, URLSearchParams, console, setTimeout: globalThis.setTimeout, history: { length: 2 }, closed: false };
win.window = win; win.location.replace = (u) => { replaced = u; }; win.sanitizeTenantCode = (x) => x;
globalThis.window = win;

console.log('ENTER_TRY injected?', iife.includes('ENTER_TRY'));
try { eval(iife); } catch (e) { console.log('EVAL THREW:', e.message); }
console.log('replaced =', replaced);
