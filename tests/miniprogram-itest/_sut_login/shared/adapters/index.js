// 适配层 barrel（与 shared/index.js 平级，但只聚合「平台适配」类模块）。
// 各端按需 import { transport } from 'shared/adapters/net.js' 等。
export * from './net.js';
export * from './storage.js';
export * from './ui.js';
export * from './router.js';
