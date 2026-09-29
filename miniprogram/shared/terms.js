// shared/terms.js
// 向后兼容转发层：术语领域层的权威实现已迁移到 ./domain/term.js（P1 领域层下沉 / P0 词典归一）。
// 保留本文件仅为了不改变已有 import 路径（小程序端 miniprogram/core/term.js 仍 from '../shared/terms.js'）。
// 新代码请直接 import from './domain/term.js'。
export * from './domain/term.js';
