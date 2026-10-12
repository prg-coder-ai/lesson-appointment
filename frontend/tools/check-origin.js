#!/usr/bin/env node
'use strict';
/*
 * 站点地址硬编码检查（origin lint）
 *
 * 背景：前后端分离后，页面与接口在同一站点（Nginx 伺服 frontend/dist，反代 /api/v1）。
 * 只要代码里出现「拼主机名 + 拼端口」的写法（如 'http://' + location.hostname + ':8080'），
 * 在本地 dev 代理下正常，一旦上了生产就会跳到未开放的端口（曾导致平台管理员注册后跳 :8080 报错）。
 *
 * 用法：
 *   node frontend/tools/check-origin.js            # 默认告警，不影响构建退出码
 *   node frontend/tools/check-origin.js --strict   # 发现即视为失败（CI / 发版前推荐）
 *   ORIGIN_LINT_STRICT=1 node frontend/tools/check-origin.js
 *
 * 豁免：在命中行的行尾（或上一行）加注释 `ORIGIN-LINT-DISABLE`，用于确属说明文案的场景。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const STRICT = process.argv.includes('--strict') || process.env.ORIGIN_LINT_STRICT === '1';

const SKIP_DIR = new Set(['node_modules', 'dist', 'target', 'tools', '.git']);
const SKIP_REL = [/^js[\\/]test[\\/]/, /^js[\\/]vendor[\\/]/];
const SCAN_EXT = ['.js', '.html'];

const RULES = [
    {
        id: 'HOSTNAME_PORT',
        re: /location\.hostname\s*\+[^;\n]{0,80}?['"]\s*:\s*['"]?\d{2,5}/,
        why: '用 hostname 拼接端口构造站点地址（旧架构遗留）',
        fix: '改成 location.origin（同源）；确需跨站时读取页面注入的 window.ADMIN_ORIGIN / window.FRONTEND_ORIGIN'
    },
    {
        id: 'PROTO_HOSTNAME',
        re: /['"]https?:\/\/['"]\s*\+[^;\n]{0,60}?location\.(hostname|host)\b/,
        why: '用协议常量拼 hostname 构造绝对地址',
        fix: '改成 location.origin；接口统一用相对路径或 window.API_BASE_URL（默认同源）'
    },
    {
        id: 'LOCALHOST_URL',
        re: /['"]https?:\/\/(localhost|127\.0\.0\.1)(:\d{2,5})?['"]/,
        why: '硬编码 localhost / 127.0.0.1 服务地址',
        fix: '生产环境该地址指向访客自己的机器，必错；改用同源相对路径'
    },
    {
        id: 'IP_URL',
        re: /['"]https?:\/\/\d{1,3}(\.\d{1,3}){3}(:\d{2,5})?['"]/,
        why: '硬编码 IP 形式的站点地址',
        fix: '服务器 IP / 域名会变，写死必漂移；改用 location.origin 或外置注入变量'
    }
];

function walk(dir, out) {
    out = out || [];
    for (const name of fs.readdirSync(dir)) {
        if (SKIP_DIR.has(name)) continue;
        const p = path.join(dir, name);
        const st = fs.statSync(p);
        if (st.isDirectory()) walk(p, out);
        else out.push(p);
    }
    return out;
}

const hits = [];
for (const abs of walk(ROOT)) {
    const rel = path.relative(ROOT, abs).replace(/\\/g, '/');
    if (SKIP_REL.some(r => r.test(rel))) continue;
    if (!SCAN_EXT.includes(path.extname(abs).toLowerCase())) continue;

    const lines = fs.readFileSync(abs, 'utf8').split(/\r?\n/);
    lines.forEach((line, i) => {
        if (/ORIGIN-LINT-DISABLE/.test(line)) return;
        if (i > 0 && /ORIGIN-LINT-DISABLE/.test(lines[i - 1])) return;
        for (const r of RULES) {
            if (r.re.test(line)) {
                hits.push({ file: rel, no: i + 1, text: line.trim().slice(0, 140), rule: r });
                break;
            }
        }
    });
}

if (!hits.length) {
    console.log('[origin-lint] OK 未发现硬编码站点地址 (扫描 ' + ROOT + ')');
    process.exit(0);
}

console.error('[origin-lint] 发现 ' + hits.length + ' 处硬编码站点地址：\n');
for (const h of hits) {
    console.error('  ' + h.rule.id + '  ' + h.file + ':' + h.no);
    console.error('      ' + h.text);
    console.error('      问题：' + h.rule.why);
    console.error('      改法：' + h.rule.fix);
    console.error('');
}
console.error('若该处确属说明文案而非真实地址，在该行行尾加注释 /* ORIGIN-LINT-DISABLE */ 豁免。');

process.exit(STRICT ? 1 : 0);
