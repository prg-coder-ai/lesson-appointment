// 小程序端 UI 适配层包装：转发到共享权威源 shared/adapters/ui.js（由 sync 镜像到 miniprogram/shared/adapters）。
// 业务页统一从本文件 import { alert, confirm, prompt }，避免散调 wx.showModal。
// 同时在此固化 mp 的 prompt 策略：小程序无原生输入，默认拒绝并提示注入解析器。
import * as UI from '../shared/adapters/ui.js';

export const alert = UI.alert;
export const confirm = UI.confirm;
export const prompt = UI.prompt;
export const setPromptResolver = UI.setPromptResolver;

// mp 默认 prompt 解析器：无原生输入控件，给出明确错误，引导业务页接入页面内输入框组件。
UI.setPromptResolver(() =>
  Promise.reject(new Error('小程序端暂不支持 prompt：请使用页面内输入框组件，并调用 setPromptResolver 注入解析器'))
);
