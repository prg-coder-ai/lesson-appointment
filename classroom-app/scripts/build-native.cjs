#!/usr/bin/env node
/**
 * classroom-app 原生端打包入口
 * ==========================================================================
 * 用法：
 *   node scripts/build-native.cjs android          # 打 debug APK
 *   node scripts/build-native.cjs android --release # 打 release（需签名配置）
 *   node scripts/build-native.cjs ios              # 仅同步；真机构建必须 macOS
 *   node scripts/build-native.cjs desktop          # 提示桌面端入口
 *
 * 为什么要这个脚本而不是直接敲 gradlew：
 *   2026-11-26 首次打包踩了三个坑，全部固化进自检，避免复发：
 *     ① Capacitor 6 要 compileSdk 34 / build-tools 34.0.0，本机 SDK 只到 30 → 构建立刻失败
 *     ② Capacitor 生成的 Gradle 8.2.1 **不支持在 JDK 21 上运行**，必须 ≥8.5
 *        （本机 JAVA_HOME 是 jdk-21.0.8.9，没有 JDK 17 可退）
 *     ③ sdkmanager 的命令行参数里带分号，在 Git Bash → cmd 的转义里会被吃掉
 *        （报 "此时不应有 android-34"），必须用 --package_file 传包列表
 */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const target = (args[0] || '').toLowerCase();
const isRelease = args.includes('--release');

function log(s) { console.log(s); }
function fail(msg, hints) {
  console.error('\n✗ ' + msg);
  if (hints) for (const h of hints) console.error('  · ' + h);
  process.exit(1);
}
function run(cmd, cmdArgs, opts) {
  log('\n$ ' + cmd + ' ' + (cmdArgs || []).join(' '));
  const r = spawnSync(cmd, cmdArgs, Object.assign({ stdio: 'inherit', cwd: ROOT, shell: process.platform === 'win32' }, opts || {}));
  if (r.status !== 0) fail(`${cmd} 执行失败（exit ${r.status}）`);
}

/* ════════════ Gradle 兜底（版本 + 发行包）════════════ */
// Capacitor 6 生成 8.2.1；JDK 21 下必须 ≥8.5，否则 assembleDebug 直接失败。
// 由于 android/ 被 .gitignore 忽略（可随时 cap add 重建），这里的修正不能依赖
// "记得手工改"，必须在每次构建前自动补齐。
const GRADLE_VER = '8.7';
const GRADLE_DIST_URL = 'https://mirrors.aliyun.com/macports/distfiles/gradle/gradle-' + GRADLE_VER + '-bin.zip';
const GRADLE_MIN_FOR_JDK21 = 8.5;

function wrapperProps() {
  return path.join(ROOT, 'android', 'gradle', 'wrapper', 'gradle-wrapper.properties');
}

function gradleVersionInWrapper() {
  const p = wrapperProps();
  if (!fs.existsSync(p)) return 0;
  const m = fs.readFileSync(p, 'utf8').match(/gradle-(\d+)\.(\d+)-/);
  return m ? parseFloat(m[1] + '.' + m[2]) : 0;
}

/** JDK 21+ 时把 wrapper 拉到 8.7；返回当前版本 */
function ensureGradleWrapper(javaM) {
  const p = wrapperProps();
  if (!fs.existsSync(p)) return 0;          // android/ 没生成，由 checkAndroidEnv 报
  const cur = gradleVersionInWrapper();
  if (javaM < 21 || (cur && cur >= GRADLE_MIN_FOR_JDK21)) return cur;
  let txt = fs.readFileSync(p, 'utf8');
  txt = txt.replace(/distributionUrl=.*/, 'distributionUrl=' + GRADLE_DIST_URL.replace(':', '\\:'))
           .replace(/networkTimeout=\d+/, 'networkTimeout=60000');
  fs.writeFileSync(p, txt);
  log(`  · 已把 Gradle wrapper ${cur || '?'} → ${GRADLE_VER}（JDK ${javaM} 需要 ≥${GRADLE_MIN_FOR_JDK21}）`);
  return parseFloat(GRADLE_VER);
}

/** zip 是否完整：检查末尾是否有 EOCD 签名 PK\x05\x06（截断的包一定没有） */
function isZipComplete(p) {
  try {
    const st = fs.statSync(p);
    if (st.size < 4096) return false;
    const len = Math.min(66000, st.size);
    const fd = fs.openSync(p, 'r');
    const buf = Buffer.alloc(len);
    const read = fs.readSync(fd, buf, 0, len, st.size - len);
    fs.closeSync(fd);
    return buf.subarray(0, read).includes(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  } catch (e) { return false; }
}

/**
 * 确保 Gradle 发行包已在 wrapper 缓存里。
 * 缓存目录名 = base36(md5(distributionUrl))，与 Gradle 的 PathAssembler 一致
 * （已用腾讯 URL 实算比对过实际目录名，算法无误）。
 * 真实踩坑：腾讯镜像下到一半会截断 → "zip END header not found"，且这类失败
 * 发生在 gradlew 内部，报错信息不指向网络。所以这里先自己下好再交给 gradlew。
 */
function ensureGradleDist() {
  const hash = BigInt('0x' + require('crypto').createHash('md5').update(GRADLE_DIST_URL).digest('hex')).toString(36);
  const dir = path.join(os.homedir(), '.gradle', 'wrapper', 'dists', 'gradle-' + GRADLE_VER + '-bin', hash);
  const zip = path.join(dir, 'gradle-' + GRADLE_VER + '-bin.zip');
  if (fs.existsSync(zip) && isZipComplete(zip)) return;      // 已在且完整，不再联网

  fs.mkdirSync(dir, { recursive: true });
  if (fs.existsSync(zip)) {
    log('  · 缓存里的 Gradle 包不完整（多半是上次下载被截断），重新下载');
    fs.rmSync(zip, { force: true });
  }
  log('  · 下载 Gradle ' + GRADLE_VER + '（约 128 MB，阿里镜像）…');
  const r = spawnSync('curl', ['-L', '--retry', '3', '--retry-delay', '2', '--max-time', '900',
    '-o', zip, GRADLE_DIST_URL], { stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0 || !isZipComplete(zip)) {
    fail('Gradle 发行包下载失败', [
      '手动下载后放到：' + dir,
      '  curl -L -o "' + zip + '" ' + GRADLE_DIST_URL,
      '校验：unzip -t 该文件，必须输出 No errors detected',
    ]);
  }
}

/* ════════════ Android 环境自检 ════════════ */
function javaMajor() {
  const r = spawnSync('java', ['-version'], { encoding: 'utf8', shell: process.platform === 'win32' });
  const txt = String(r.stderr || '') + String(r.stdout || '');
  const m = txt.match(/version "(\d+)(?:\.(\d+))?/);
  return m ? parseInt(m[1], 10) : 0;
}

function checkAndroidEnv() {
  const problems = [];

  // ① JDK
  const jm = javaMajor();
  if (!jm) problems.push('找不到 java（JAVA_HOME 未配或不在 PATH）');
  else if (jm < 17) problems.push(`JDK ${jm} 太低：Capacitor 6 需要 JDK 17+`);

  // ② Android SDK 平台与构建工具
  const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || '';
  if (!sdk || !fs.existsSync(sdk)) {
    problems.push('ANDROID_HOME / ANDROID_SDK_ROOT 未指向有效 SDK 目录');
  } else {
    const hasPlatform = fs.existsSync(path.join(sdk, 'platforms', 'android-34'));
    const hasBt = fs.existsSync(path.join(sdk, 'build-tools', '34.0.0'));
    if (!hasPlatform || !hasBt) {
      const missing = [];
      if (!hasPlatform) missing.push('platforms;android-34');
      if (!hasBt) missing.push('build-tools;34.0.0');
      problems.push(`SDK 缺少：${missing.join('、')}\n    装法（注意必须用 --package_file，命令行直接带分号会被 cmd 吃掉）：\n`
        + `      printf '${missing.join('\\n')}\\n' > pkgs.txt\n`
        + `      sdkmanager.bat --package_file=pkgs.txt`);
    }
  }

  // ③ Gradle wrapper：必须存在（android/ 生成过）
  if (!fs.existsSync(wrapperProps())) {
    problems.push('android/ 未生成：先跑 npx cap add android');
  }

  if (problems.length) {
    fail('Android 构建环境不满足：', problems);
  }
  log('✓ 环境自检通过：JDK ' + jm + '，SDK ' + sdk);
  return jm;
}

/* ════════════ 三个目标 ════════════ */
/**
 * 补 Android 清单里的能力声明（幂等，每次构建前跑一遍）。
 *
 * 为什么必须自动补：`npx cap add android` 生成的清单**只有 INTERNET**，
 * 而课堂要用摄像头/麦克风（WebView 的 getUserMedia 前必须先有 manifest 权限）；
 * 源站是 http（内网调试）时还要显式开 usesCleartextTraffic —— Android 9+ 默认禁明文。
 * android/ 在 .gitignore 里、随时可能被 cap add 重建，所以不能靠"记得手工改"。
 */
function ensureAndroidManifest() {
  const p = path.join(ROOT, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
  if (!fs.existsSync(p)) { log('  · 清单未生成，跳过（先 npx cap add android）'); return; }
  let s = fs.readFileSync(p, 'utf8');
  const orig = s;

  // ① 权限：课堂音视频 + 网络
  const need = [
    'android.permission.CAMERA',
    'android.permission.RECORD_AUDIO',
    'android.permission.MODIFY_AUDIO_SETTINGS',
    'android.permission.INTERNET'
  ];
  const missing = need.filter((x) => s.indexOf('android:name="' + x + '"') < 0);
  if (missing.length) {
    const block = missing.map((x) => '    <uses-permission android:name="' + x + '" />').join('\n');
    s = s.replace('</manifest>', block + '\n</manifest>');
  }

  // ② 明文流量：只有源站是 http 才开（正式 https 源站保持关闭）
  let url = '';
  try {
    const cap = JSON.parse(fs.readFileSync(path.join(ROOT, 'capacitor.config.json'), 'utf8'));
    url = (cap.server && cap.server.url) || '';
  } catch (e) { /* 配置缺失时按 http 未启用处理 */ }
  const needCleartext = /^http:\/\//i.test(url);
  if (needCleartext && s.indexOf('usesCleartextTraffic') < 0) {
    s = s.replace(/<application(\s)/, '<application android:usesCleartextTraffic="true"$1');
  }

  if (s !== orig) {
    fs.writeFileSync(p, s, 'utf8');
    const parts = [];
    if (missing.length) parts.push('补权限 ' + missing.join('/'));
    if (needCleartext && orig.indexOf('usesCleartextTraffic') < 0) parts.push('开明文流量(源站 ' + url + ')');
    log('  · AndroidManifest：' + parts.join('，'));
  } else {
    log('  · AndroidManifest：已满足（权限/明文流量）');
  }
}

function buildAndroid() {
  const jm = checkAndroidEnv();
  log('\n[1/3] Gradle 兜底');
  const ver = ensureGradleWrapper(jm);
  if (Number(ver) === parseFloat(GRADLE_VER)) {
    ensureGradleDist();                    // 只有 wrapper 指向同一个 URL 时才预下载，否则 hash 目录对不上
    log('  · Gradle ' + GRADLE_VER + ' 已就绪');
  } else {
    log('  · wrapper 是 ' + ver + '（≥' + GRADLE_MIN_FOR_JDK21 + '），交给 gradlew 自行下载');
  }

  log('\n[2/3] 同步 www 到 android/');
  run('npx', ['cap', 'sync', 'android']);
  ensureAndroidManifest();

  log('\n[3/3] Gradle 构建（首次会下载 AGP 与 androidx 依赖，几分钟）');
  const gradle = path.join(ROOT, 'android', process.platform === 'win32' ? 'gradlew.bat' : 'gradlew');
  const task = isRelease ? 'assembleRelease' : 'assembleDebug';
  run(gradle, [task, '--no-daemon'], { cwd: path.join(ROOT, 'android') });

  const out = path.join(ROOT, 'android', 'app', 'build', 'outputs', 'apk',
    isRelease ? 'release' : 'debug');
  if (fs.existsSync(out)) {
    const apks = fs.readdirSync(out).filter((f) => f.endsWith('.apk'));
    log('\n✓ 产物：');
    for (const f of apks) {
      const p = path.join(out, f);
      log('  ' + p + '  (' + (fs.statSync(p).size / 1048576).toFixed(1) + ' MB)');
    }
    if (isRelease) {
      log('\n提示：release 包未签名时无法直接安装。签名做法见 doc-develop/08-电子课堂/ 下的打包指南。');
    } else {
      log('\n安装到已连接设备：adb install -r <上面的 apk>');
    }
  }
}

function buildIos() {
  run('npx', ['cap', 'sync', 'ios']);
  const project = path.join(ROOT, 'ios', 'App');
  if (process.platform !== 'darwin') {
    log('\n⚠ 已同步 www 到 iOS 工程，但**无法在本机构建**：iOS 编译/签名/上架只能在 macOS + Xcode 上完成。');
    log('  工程已就绪：' + project + '/App.xcworkspace');
    log('  到 Mac 上执行：');
    log('    cd classroom-app/ios/App && pod install');
    log('    open App.xcworkspace     # Xcode → Signing & Capabilities 选团队 → Run');
    log('  或者用 GitHub Actions 的 macos runner（见打包指南 §4.3）。');
    return;
  }
  log('\n工程已同步。用 Xcode 打开：' + path.join(project, 'App.xcworkspace'));
  log('命令行构建：xcodebuild -workspace App.xcworkspace -scheme App -configuration Release archive');
}

function buildDesktop() {
  const d = path.join(ROOT, 'desktop');
  log('\n桌面端（Electron）入口：' + d);
  log('  开发运行：  cd desktop && npm install && npm start');
  log('  打包 Windows：cd desktop && npm run pack:win     → dist/*.exe');
  log('  打包 macOS：  cd desktop && npm run pack:mac');
  log('  打包 Linux：  cd desktop && npm run pack:linux');
  log('\n首次运行前请改 desktop/config.json 里 upstream 三个地址（api / message / classroom）。');
}

/* ════════════ 路由 ════════════ */
switch (target) {
  case 'android': buildAndroid(); break;
  case 'ios': buildIos(); break;
  case 'desktop': case 'win': case 'windows': buildDesktop(); break;
  default:
    log('用法：node scripts/build-native.cjs <android|ios|desktop> [--release]');
    process.exit(1);
}
