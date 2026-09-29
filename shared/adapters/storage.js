// 存储适配层（单一权威源，零平台特定副作用）。
// 运行时自动探测：小程序用 wx.getStorageSync/setStorageSync；Web 用 localStorage。
// 接口与浏览器 localStorage 对齐：get/set/remove/clear。
// 约定：写入时 Web 端非字符串值自动 JSON.stringify（localStorage 只收字符串）；
//       读出时两端均原样返回（mp 保留类型，Web 返回字符串由调用方按需 JSON.parse）。
// 调用方（如 getSession）已对「字符串/对象」两种形态做兼容，故本层不做二次序列化。

function isMp() {
  return typeof wx !== 'undefined' && typeof wx.getStorageSync === 'function';
}
function getWin() {
  return (typeof window !== 'undefined') ? window : null;
}

export const storage = {
  get(key) {
    if (isMp()) { try { return wx.getStorageSync(key); } catch (e) { return ''; } }
    const w = getWin();
    if (w && w.localStorage) { try { return w.localStorage.getItem(key); } catch (e) { return ''; } }
    return '';
  },
  set(key, val) {
    const v = (typeof val === 'string') ? val : JSON.stringify(val);
    if (isMp()) { try { wx.setStorageSync(key, val); } catch (e) { /* ignore */ } return; }
    const w = getWin();
    if (w && w.localStorage) { try { w.localStorage.setItem(key, v); } catch (e) { /* ignore */ } }
  },
  remove(key) {
    if (isMp()) { try { wx.removeStorageSync(key); } catch (e) { /* ignore */ } return; }
    const w = getWin();
    if (w && w.localStorage) { try { w.localStorage.removeItem(key); } catch (e) { /* ignore */ } }
  },
  clear() {
    if (isMp()) { try { wx.clearStorageSync(); } catch (e) { /* ignore */ } return; }
    const w = getWin();
    if (w && w.localStorage) { try { w.localStorage.clear(); } catch (e) { /* ignore */ } }
  }
};

export default { storage };
