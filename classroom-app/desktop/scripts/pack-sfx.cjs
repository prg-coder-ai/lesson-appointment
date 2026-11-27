/**
 * 桌面版「自解压 EXE」打包器（Windows / NSIS）
 * ==========================================================================
 * 用法：
 *   node desktop/scripts/pack-sfx.cjs              # 复用已有 win-unpacked
 *   node desktop/scripts/pack-sfx.cjs --rebuild    # 先用 electron-builder 重新产出 win-unpacked
 *
 * 产物：deliver/eClassroom-1.0-YYYYMMDD-HHmm.exe
 *
 * 为什么是 NSIS 而不是 portable / 7-Zip SFX：
 *   · electron-builder 的 portable 是「单文件 exe 每次运行解压到 %TEMP%」，
 *     273MB 每次重解压、数据落 %APPDATA%，绿色语义不成立（2026-11-26 已否决）。
 *   · 7-Zip 的 7za.exe 不带 SFX 模块（实测 "cannot find specified SFX module"），
 *     系统也没装 7-Zip，无法生成 7z.sfx。
 *   · electron-builder 缓存里自带完整 NSIS（makensis.exe），零新增依赖。
 *     NSIS 安装器就是自解压 EXE：首次双击解压到 exe 同级的 eClassroom-1.0\，
 *     之后直接运行目录里的 eclassroom.exe，data\ 跟随目录保留 —— 绿色语义不变。
 *
 * 与 main.js 的 pickGreenDataDir() 契约：解压目录里必须有
 *   eclassroom.exe 同级的 resources/app.asar，且不在 %TEMP% → userData 指向 data\。
 *   electron-builder --dir 产出的 win-unpacked 正好满足。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const DESKTOP = path.resolve(__dirname, '..');
const APP_DIR = path.resolve(DESKTOP, '..');
const REPO = path.resolve(APP_DIR, '..');
// 输出目录可用 SFX_OUT_DIR 环境变量覆盖：旧 dist-sfx/win-unpacked/resources/app.asar
// 被残留句柄锁住时（11-26/11-27 实测 EBUSY），换一个目录即可继续打包，不必强删用户文件。
const OUT_DIR = process.env.SFX_OUT_DIR
  ? path.resolve(process.env.SFX_OUT_DIR)
  : path.join(DESKTOP, 'dist-sfx');
const UNPACKED = path.join(OUT_DIR, 'win-unpacked');
const DELIVER = path.join(REPO, 'deliver');

const STAMP = (() => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return '' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate())
    + '-' + p(d.getHours()) + p(d.getMinutes());
})();

function log(s) { console.log(s); }
function die(msg) { console.error('[pack-sfx] ERROR: ' + msg); process.exit(1); }

/** electron-builder 缓存里的 NSIS；再退到 PATH */
function findMakensis() {
  const local = process.env.LOCALAPPDATA
    || path.join(os.homedir(), 'AppData', 'Local');
  const cache = path.join(local, 'electron-builder', 'Cache', 'nsis');
  if (fs.existsSync(cache)) {
    for (const e of fs.readdirSync(cache)) {
      for (const rel of [path.join('Bin', 'makensis.exe'), 'makensis.exe']) {
        const p = path.join(cache, e, rel);
        if (fs.existsSync(p)) return p;
      }
    }
  }
  const w = spawnSync('where', ['makensis'], { encoding: 'utf8', shell: true });
  if (w.status === 0 && w.stdout && w.stdout.trim()) {
    return w.stdout.trim().split(/\r?\n/)[0];
  }
  return null;
}

/** 直接用 node 执行 electron-builder 的 CLI，绕开 Windows 下 .cmd / shell 差异 */
function electronBuilderCli() {
  const candidates = [
    path.join(DESKTOP, 'node_modules', 'electron-builder', 'cli.js'),
    path.join(DESKTOP, 'node_modules', 'electron-builder', 'out', 'cli', 'cli.js')
  ];
  for (const p of candidates) if (fs.existsSync(p)) return p;
  die('electron-builder CLI not found: ' + candidates.join(' / '));
}

function ensureUnpacked() {
  const exe = path.join(UNPACKED, 'eclassroom.exe');
  const force = process.argv.includes('--rebuild');
  if (!force && fs.existsSync(exe)) {
    log('[1/3] reuse unpacked dir: ' + UNPACKED);
    return;
  }
  log('[1/3] electron-builder --dir (unpacked, no zip) ...');
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const r = spawnSync(process.execPath, [
    electronBuilderCli(), '--win', '--x64', '--dir',
    '-c.directories.output=' + OUT_DIR
  ], { cwd: DESKTOP, stdio: 'inherit' });
  if (r.status !== 0) die('electron-builder failed (exit ' + r.status + ')');
  if (!fs.existsSync(exe)) die('win-unpacked/eclassroom.exe missing after build');
  log('    unpacked: ' + UNPACKED);
}

/**
 * 生成 .nsi。文案用 ASCII：NSIS 3 默认按系统 ANSI 读脚本，UTF-8 中文会乱码；
 * 仓库路径与产物名也都无中文，避免引入 GBK/UTF-8 转换依赖。
 */
function buildNsi(outExe) {
  const nsiPath = path.join(OUT_DIR, 'eClassroom-sfx.nsi');
  const lines = [
    'Unicode true',
    'Name "eClassroom 1.0"',
    'OutFile "' + outExe + '"',
    'RequestExecutionLevel user',
    'InstallDir "$EXEDIR\\eClassroom-1.0"',
    'Page instfiles',
    'AutoCloseWindow true',
    'ShowInstDetails nevershow',
    '',
    'Function .onInit',
    '  MessageBox MB_OKCANCEL|MB_ICONINFORMATION "eClassroom 1.0 - self-extracting package$\\n$\\nTarget: $EXEDIR\\eClassroom-1.0$\\n$\\nClick OK to extract (about 285 MB, takes a moment)." IDCANCEL cancel',
    '  Return',
    '  cancel:',
    '  Abort',
    'FunctionEnd',
    '',
    'Section "Main"',
    '  SetOutPath "$INSTDIR"',
    '  File /r "' + UNPACKED + '\\*"',
    '  Exec \'"$INSTDIR\\eclassroom.exe"\'',
    'SectionEnd'
  ];
  fs.writeFileSync(nsiPath, lines.join('\r\n') + '\r\n', 'utf8');
  return nsiPath;
}

function main() {
  if (!fs.existsSync(path.join(APP_DIR, 'www', 'index.html'))) {
    die('classroom-app/www not built: run node scripts/build.js first');
  }
  const nsis = findMakensis();
  if (!nsis) die('makensis.exe not found (electron-builder NSIS cache / PATH)');
  log('[pack-sfx] makensis: ' + nsis);

  ensureUnpacked();

  fs.mkdirSync(DELIVER, { recursive: true });
  const outExe = path.join(DELIVER, 'eClassroom-1.0-' + STAMP + '.exe');
  const nsi = buildNsi(outExe);

  log('[2/3] NSIS compile -> ' + outExe);
  const r = spawnSync(nsis, [nsi], { cwd: OUT_DIR, stdio: 'inherit' });
  if (r.status !== 0) die('makensis failed (exit ' + r.status + ')');
  if (!fs.existsSync(outExe)) die('output exe not created');

  const size = fs.statSync(outExe).size;
  if (size < 1024 * 1024) die('output too small: ' + size + ' bytes');
  log('[3/3] OK: ' + outExe + '  (' + (size / 1048576).toFixed(1) + ' MB)');
  log('  double click -> extract to <exe dir>\\eClassroom-1.0\\ then launch');
  log('  green data dir  -> <extract dir>\\data\\ (kept across re-extract)');
}
main();
