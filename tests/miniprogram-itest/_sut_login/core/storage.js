// 小程序端：存储适配层（对齐浏览器 localStorage 的用法）
// 浏览器端用 localStorage，小程序端用 wx.getStorageSync/setStorageSync。接口保持一致，调用方无感。

export const storage = {
  get(key) {
    try { return wx.getStorageSync(key); } catch (e) { return ''; }
  },
  set(key, val) {
    try { wx.setStorageSync(key, val); } catch (e) { /* ignore */ }
  },
  remove(key) {
    try { wx.removeStorageSync(key); } catch (e) { /* ignore */ }
  },
  clear() {
    try { wx.clearStorageSync(); } catch (e) { /* ignore */ }
  }
};

// 当前登录态：结构对齐 frontend/api.js 的 currentUser
export function getSession() {
  const s = storage.get('currentUser');
  if (!s) return null;
  try { return typeof s === 'string' ? JSON.parse(s) : s; } catch (e) { return null; }
}

export function setSession(user) {
  storage.set('currentUser', user);
  if (user && user.token) storage.set('token', user.token);
  if (user && user.refreshToken) storage.set('refreshToken', user.refreshToken);
}

export function clearSession() {
  storage.remove('currentUser');
  storage.remove('token');
  storage.remove('refreshToken');
}

export function getToken() {
  return storage.get('token') || '';
}
