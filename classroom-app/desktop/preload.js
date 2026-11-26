/**
 * 预加载脚本 —— 页面与主进程之间唯一的通道
 * ==========================================================================
 * 只暴露「设未读数」一个动作，不开任何 Node 能力：
 *   页面是全静态的 web 产物，理论上不需要碰系统；唯一做不到的事就是
 *   「把数字画到任务栏图标上」—— 那必须由主进程调 setOverlayIcon。
 * 所以这里刻意只开一道窄门（contextBridge），而不是 nodeIntegration。
 */
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('classroomDesktop', {
  /**
   * 推送未读消息数到任务栏角标。
   * @param {number} count 未读数；0 表示清除角标
   */
  setUnread(count) {
    const n = Math.max(0, Math.min(9999, Math.floor(Number(count) || 0)));
    ipcRenderer.send('unread:set', n);
  },
});
