// shared/adapters/storage.js 单测：验证 storage 在「小程序 / Web」两套运行时下读写一致。
import assert from 'node:assert';
import { storage } from '../../shared/adapters/storage.js';

let pass = 0;
function ok(name, cond) { assert.ok(cond, name); console.log('  ✓', name); pass++; }

// ---- 小程序运行时 ----
function runMp() {
  const m = {};
  globalThis.wx = {
    getStorageSync: (k) => (k in m ? m[k] : ''),
    setStorageSync: (k, v) => { m[k] = v; },
    removeStorageSync: (k) => { delete m[k]; },
    clearStorageSync: () => { for (const k in m) delete m[k]; }
  };
  delete globalThis.window;

  storage.set('token', 'abc');
  ok('mp: set/get 字符串', storage.get('token') === 'abc');
  storage.set('user', { name: 'x' }); // mp 保留类型
  ok('mp: 对象原样返回', storage.get('user') && storage.get('user').name === 'x');
  storage.remove('token');
  ok('mp: remove', storage.get('token') === '');
  storage.set('a', 1); storage.clear();
  ok('mp: clear', storage.get('a') === '');
}

// ---- Web 运行时 ----
function runWeb() {
  const m = {};
  globalThis.window = {
    localStorage: {
      getItem: (k) => (k in m ? m[k] : null),
      setItem: (k, v) => { m[k] = String(v); },
      removeItem: (k) => { delete m[k]; },
      clear: () => { for (const k in m) delete m[k]; }
    }
  };
  delete globalThis.wx;

  storage.set('token', 'abc');
  ok('web: set/get 字符串', storage.get('token') === 'abc');
  storage.set('user', { name: 'x' }); // web 自动 JSON.stringify
  ok('web: 对象 JSON 存储后需 parse', storage.get('user') === JSON.stringify({ name: 'x' }));
  storage.remove('token');
  ok('web: remove', storage.get('token') === '');
  storage.set('a', 1); storage.clear();
  ok('web: clear', storage.get('a') === '');
}

(async () => {
  runMp();
  runWeb();
  console.log('\nstorage adapter: ' + pass + ' assertions passed');
})();
