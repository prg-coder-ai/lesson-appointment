// 小程序端：存储适配层（对齐浏览器 localStorage 的用法）
// 底层统一委托 shared/adapters/storage.js（由 sync 镜像到 miniprogram/shared/adapters），
// 与 Web 端 window.StorageAdapter.storage 同源，保证双端存储语义一致。

import { storage } from '../shared/adapters/storage.js';

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
