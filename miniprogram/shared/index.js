// 跨端共享核心：统一出口（barrel）。
// 小程序端经 sync 拷贝到 miniprogram/shared/ 后 import；Web 端可经桥接文件挂到 window。
export * from './constants.js';
export * from './format.js';
export * from './apiPaths.js';
export * from './terms.js';
