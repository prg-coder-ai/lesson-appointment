#!/usr/bin/env node
/**
 * 管理员自锁防护守卫 —— 反向测试
 *
 * 为什么这个守卫必须有反向测试：
 *   本守卫第一版在 D 组（计数 SQL 不得含 status）**恒红** —— 用 `[^)]*` 抓 @Select
 *   的 SQL 字面量，被 COUNT(*) 的右括号截断，永远取不到 SQL。基线一跑就暴露了，
 *   属"守卫自己坏了却看起来像代码坏了"，最容易被人直接 SKIP 掉。
 *   同理也必须证明：真退化时它**会红**，不是一路绿灯的空壳。
 *
 * 反向测试项：
 *   ① 基线通过（exit 0）
 *   ② SKIP_ADMIN_SELF_LOCK=1 → exit 0
 *   ③ updateStatus 去掉 assertNoAdminSelfLock 调用 → 红（B2）
 *   ④ updateUserInfo 去掉 assertNoAdminSelfLock 调用 → 红（B4，侧门）
 *   ⑤ 删掉 assertNoAdminSelfLock 整个方法 → 红（A1）
 *   ⑥ 把「active 则放行」改成黑名单（只拦 frozen）→ 红（A3）
 *   ⑦ 控制器改用请求体 user.getUserId() 当操作者 → 红（C2/C3）
 *   ⑧ 计数 SQL 加 AND status='active' → 红（D2）
 *   ⑨ 还原后回到 exit 0 且源码逐字节零污染
 *
 * 运行：node tests/check_admin_self_lock_guard.js
 *
 * ⚠️ 不用 spawnSync：本机 node 子进程一律 EBUSY，会让基线就假红。
 * ⚠️ 变异前把 CRLF 归一成 LF（core.autocrlf=true 的工作区是 CRLF，按 \n 写的锚点会静默失配）；
 *    还原走原始 Buffer，保证逐字节回到原样。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');
const GUARD = path.join(ROOT, 'tools/check-admin-self-lock.mjs');

const F_SVC = path.join(ROOT, 'api/src/main/java/com/reservation/service/UserService.java');
const F_CTL = path.join(ROOT, 'api/src/main/java/com/reservation/controller/UserController.java');
const F_MAP = path.join(ROOT, 'api/src/main/java/com/reservation/mapper/UserMapper.java');

const results = [];
function expect(name, ok, detail) {
  results.push({ name, ok: !!ok });
  console.log(`  ${ok ? '✓' : '✗'} ${name}`);
  if (!ok && detail) {
    console.log('      ' + String(detail).split('\n').slice(0, 14).join('\n      '));
  }
}

/**
 * 同进程 import 守卫并捕获 process.exit。
 * code 用 null 表示"没收到 exit"——守卫每条路径都必须 exit，否则断言必须失败。
 */
async function runGuard() {
  const origExit = process.exit;
  const origLog = console.log;
  const origErr = console.error;
  let code = null;
  const lines = [];
  console.log = (...a) => lines.push(a.join(' '));
  console.error = (...a) => lines.push(a.join(' '));
  process.exit = (c) => {
    code = c == null ? 0 : c;
    throw { __guardExit: true };
  };
  try {
    await import(pathToFileURL(GUARD).href + '?t=' + Date.now() + Math.random());
  } catch (e) {
    if (!e || !e.__guardExit) {
      console.log = origLog; console.error = origErr; process.exit = origExit;
      throw e;
    }
  } finally {
    process.exit = origExit;
    console.log = origLog;
    console.error = origErr;
  }
  return { code, out: lines.join('\n') };
}

async function runGuardSkip() {
  const saved = process.env.SKIP_ADMIN_SELF_LOCK;
  process.env.SKIP_ADMIN_SELF_LOCK = '1';
  try {
    return await runGuard();
  } finally {
    if (saved === undefined) delete process.env.SKIP_ADMIN_SELF_LOCK;
    else process.env.SKIP_ADMIN_SELF_LOCK = saved;
  }
}

/** 备份原始字节，返回 LF 归一后的可变文本写入器 + 逐字节还原器 */
function backup(file) {
  const buf = fs.readFileSync(file);
  return {
    file,
    buf,
    /** 变异：把 oldStr 换成 newStr。未命中锚点返回 false（不写文件） */
    mutate(oldStr, newStr) {
      const txt = buf.toString('utf8').replace(/\r\n/g, '\n');
      if (!txt.includes(oldStr)) return false;
      fs.writeFileSync(file, txt.split(oldStr).join(newStr), 'utf8');
      return true;
    },
    /** 写入 LF 化后的文本（用于整段删除等复合变异） */
    writeText(txt) {
      fs.writeFileSync(file, txt, 'utf8');
      return true;
    },
    readText() {
      return fs.readFileSync(file, 'utf8');
    },
    restore() {
      fs.writeFileSync(file, buf);
      return Buffer.compare(fs.readFileSync(file), buf) === 0;
    },
  };
}

// ---------- 变异锚点（与源码一字不差；改源码时这里必须同步，否则会明确报"未找到锚点"） ----------
const ANCHOR_UPD_STATUS_CALL =
  '          assertNoAdminSelfLock(callerId, callerRole, useid, status);\n';

const ANCHOR_CTL_STATUS_CALL =
  '        int ret = userService.updateStatus(user,\n' +
  '                permissionCheck.getUserIdFromToken(token),\n' +
  '                permissionCheck.getRoleFromToken(token));';

const ANCHOR_CTL_INFO_CALL =
  '        int ret = userService.updateUserInfo(user,\n' +
  '                permissionCheck.getUserIdFromToken(token),\n' +
  '                permissionCheck.getRoleFromToken(token));';

const ANCHOR_SQL_TENANT =
  '@Select("SELECT COUNT(*) FROM user WHERE tenant_id = #{tenantId} AND role = #{role} FOR UPDATE")';

const ANCHOR_ACTIVE_PASS = '        if ("active".equals(targetStatus.trim())) {\n            return;\n        }';

(async () => {
  console.log('\n管理员自锁防护守卫反向测试\n' + '='.repeat(56));

  const touched = [];

  try {
    // ---------- ① 基线 ----------
    {
      const r = await runGuard();
      expect('① 基线通过', r.code === 0, r.out);
    }

    // ---------- ② SKIP 开关 ----------
    {
      const r = await runGuardSkip();
      expect('② SKIP_ADMIN_SELF_LOCK=1 → exit 0', r.code === 0, r.out);
    }

    // ---------- ③ updateStatus 去掉防护调用 ----------
    {
      const bak = backup(F_SVC);
      touched.push(bak);
      if (!bak.mutate(ANCHOR_UPD_STATUS_CALL, '')) {
        expect('③ updateStatus 去掉防护调用 → 应判红', false, '未找到锚点：assertNoAdminSelfLock(callerId, callerRole, useid, status);');
      } else {
        const r = await runGuard();
        expect('③ updateStatus 去掉防护调用 → exit 1（B2）', r.code === 1 && /updateStatus/.test(r.out), r.out);
      }
      expect('③ 还原逐字节一致', bak.restore());
    }

    // ---------- ④ updateUserInfo 去掉防护调用（侧门） ----------
    {
      const bak = backup(F_SVC);
      touched.push(bak);
      const txt = bak.readText().replace(/\r\n/g, '\n');
      // updateUserInfo 里的调用形式与 updateStatus 不同（多一层缩进/参数不同），
      // 这里用"出现在 updateUserInfo 方法体内"来定位：取首个出现位置之后的那一行。
      const idx = txt.indexOf('public int updateUserInfo(User user, String callerId, String callerRole)');
      if (idx < 0) {
        expect('④ updateUserInfo 去掉防护调用 → 应判红', false, '未找到 updateUserInfo 声明');
      } else {
        const tail = txt.slice(idx);
        const m = /[ \t]*assertNoAdminSelfLock\([^;]*\);[ \t]*\n/.exec(tail);
        if (!m) {
          expect('④ updateUserInfo 去掉防护调用 → 应判红', false, 'updateUserInfo 里没找到 assertNoAdminSelfLock(...) 调用（源码已变，需同步本测试）');
        } else {
          const absStart = idx + m.index;
          bak.writeText(txt.slice(0, absStart) + txt.slice(absStart + m[0].length));
          const r = await runGuard();
          expect('④ updateUserInfo 去掉防护调用 → exit 1（B4，侧门）', r.code === 1 && /updateUserInfo/.test(r.out), r.out);
        }
      }
      expect('④ 还原逐字节一致', bak.restore());
    }

    // ---------- ⑤ 删除整个防护方法 ----------
    {
      const bak = backup(F_SVC);
      touched.push(bak);
      const txt = bak.readText().replace(/\r\n/g, '\n');
      const start = txt.indexOf('    private void assertNoAdminSelfLock(');
      if (start < 0) {
        expect('⑤ 删除防护方法 → 应判红', false, '未找到 assertNoAdminSelfLock 方法声明');
      } else {
        // 从声明处向后花括号配对，删掉整个方法（含前面的 javadoc 不易定位，仅删方法体足够触发 A1）
        const open = txt.indexOf('{', start);
        let depth = 0;
        let end = -1;
        for (let i = open; i < txt.length; i++) {
          if (txt[i] === '{') depth++;
          else if (txt[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
        }
        if (end < 0) {
          expect('⑤ 删除防护方法 → 应判红', false, '花括号配对失败');
        } else {
          bak.writeText(txt.slice(0, start) + txt.slice(end));
          const r = await runGuard();
          expect('⑤ 删除防护方法 → exit 1（A1）', r.code === 1 && /assertNoAdminSelfLock/.test(r.out), r.out);
        }
      }
      expect('⑤ 还原逐字节一致', bak.restore());
    }

    // ---------- ⑥ 把白名单判定改成黑名单 ----------
    {
      const bak = backup(F_SVC);
      touched.push(bak);
      if (!bak.mutate(ANCHOR_ACTIVE_PASS, '        if ("frozen".equals(targetStatus.trim())) {\n            return;\n        }')) {
        expect('⑥ 白名单改黑名单 → 应判红', false, '未找到锚点：if ("active".equals(targetStatus.trim()))');
      } else {
        const r = await runGuard();
        expect('⑥ 「active 放行」改成「frozen 放行」→ exit 1（A3，inactive 可绕过）', r.code === 1 && /A3|active/.test(r.out), r.out);
      }
      expect('⑥ 还原逐字节一致', bak.restore());
    }

    // ---------- ⑦ 控制器改用请求体 userId ----------
    {
      const bak = backup(F_CTL);
      touched.push(bak);
      if (!bak.mutate(ANCHOR_CTL_STATUS_CALL,
        '        int ret = userService.updateStatus(user,\n' +
        '                user.getUserId(),\n' +
        '                permissionCheck.getRoleFromToken(token));')) {
        expect('⑦ 控制器改用请求体 userId → 应判红', false, '未找到 updateStatus 调用锚点');
      } else {
        const r = await runGuard();
        expect('⑦ 控制器改用请求体 userId → exit 1（C2/C3）', r.code === 1 && /updateStatus/.test(r.out), r.out);
      }
      expect('⑦ 还原逐字节一致', bak.restore());
    }

    // ---------- ⑧ 计数 SQL 掺 status ----------
    {
      const bak = backup(F_MAP);
      touched.push(bak);
      if (!bak.mutate(ANCHOR_SQL_TENANT,
        '@Select("SELECT COUNT(*) FROM user WHERE tenant_id = #{tenantId} AND role = #{role} AND status = \'active\' FOR UPDATE")')) {
        expect('⑧ 计数 SQL 掺 status → 应判红', false, '未找到 countByTenantAndRoleForUpdate 的 @Select 锚点');
      } else {
        const r = await runGuard();
        expect('⑧ 计数 SQL 加 status=\'active\' → exit 1（D2，禁用变可抢座）', r.code === 1 && /status/i.test(r.out), r.out);
      }
      expect('⑧ 还原逐字节一致', bak.restore());
    }

    // ---------- ⑨ 全部还原后复跑基线 ----------
    {
      const r = await runGuard();
      const allClean = touched.every((b) => Buffer.compare(fs.readFileSync(b.file), b.buf) === 0);
      expect('⑨ 全部还原后基线仍 exit 0', r.code === 0, r.out);
      expect('⑨ 三个源码文件逐字节无污染', allClean, '有文件未回到原始字节');
    }
  } finally {
    // 兜底：任何断言中途抛错也要把文件还原，绝不把变异留在工作区
    for (const b of touched) {
      if (Buffer.compare(fs.readFileSync(b.file), b.buf) !== 0) {
        b.restore();
        console.log('  ! 兜底还原：' + path.relative(ROOT, b.file));
      }
    }
  }

  const failed = results.filter((r) => r.ok === false);
  console.log('\n' + '='.repeat(56));
  console.log(`合计 ${results.length} 项，通过 ${results.length - failed.length} 项，失败 ${failed.length} 项`);
  if (failed.length) {
    console.log('失败项：' + failed.map((f) => f.name).join('；'));
    process.exit(1);
  }
  console.log('反向测试全部通过：真退化时守卫确实会红。');
  process.exit(0);
})();
