/**
 * 屏幕区域录制器 · preload
 * 只向渲染进程暴露必要的三个方法，保持 contextIsolation 隔离
 */
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('native', {
  /** 桌面版标识：渲染层据此切换到"窗口列表"模式 */
  isDesktop: true,

  /** 枚举可捕获的窗口 / 屏幕 */
  listSources: () => ipcRenderer.invoke('list-sources'),

  /** 告知主进程本次使用哪个源、是否需要系统声音 */
  setSource: (id, wantAudio) => ipcRenderer.invoke('set-source', id, wantAudio),

  /** 选定窗口失效时的回落通知 */
  onFallback: (cb) => {
    ipcRenderer.on('source-fallback', (_event, name) => cb(name));
  }
});
