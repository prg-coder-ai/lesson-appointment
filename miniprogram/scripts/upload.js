// 小程序上传脚本（miniprogram-ci）
// 用法：
//   MINI_PRIVATE_KEY=/path/to/private.key node scripts/upload.js [version] [desc]
// 说明：
//   - appid 读取 project.config.json（占位符 touristappid 上线前需替换为真实 appid）
//   - 私钥为微信公众平台「开发管理 → 开发设置 → 小程序代码上传」下载的 key，勿入库
//   - version 默认取 package.json 的 version；desc 默认「CI 自动上传」

const fs = require('fs');
const path = require('path');
const ci = require('miniprogram-ci');

const ROOT = path.resolve(__dirname, '..');

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

function main() {
  const keyPath = process.env.MINI_PRIVATE_KEY;
  if (!keyPath) {
    console.error('[upload] 缺少环境变量 MINI_PRIVATE_KEY（小程序上传私钥路径）');
    process.exit(2);
  }
  if (!fs.existsSync(keyPath)) {
    console.error('[upload] 私钥文件不存在：' + keyPath);
    process.exit(2);
  }

  const proj = readJson(path.join(ROOT, 'project.config.json'));
  const pkg = readJson(path.join(ROOT, 'package.json'));
  const appid = proj.appid;
  if (!appid || appid === 'touristappid') {
    console.error('[upload] project.config.json 的 appid 仍为占位符 touristappid，请替换为真实 appid');
    process.exit(2);
  }

  const version = process.argv[2] || pkg.version || '1.0.0';
  const desc = process.argv[3] || 'CI 自动上传';

  const project = new ci.Project({
    appid,
    type: 'miniProgram',
    projectPath: ROOT,
    privateKeyPath: keyPath,
    ignores: ['node_modules/**', 'scripts/**', '*.md', 'miniprogram_npm/**']
  });

  console.log('[upload] appid=' + appid + ' version=' + version + ' desc=' + desc);
  ci.upload({
    project,
    version,
    desc,
    setting: { es6: true, minified: true, autoPrefixWXSS: true },
    onProgressUpdate: (info) => { if (info && info.message) console.log('[upload]', info.message); }
  }).then(() => {
    console.log('[upload] 上传成功');
    process.exit(0);
  }).catch((err) => {
    console.error('[upload] 上传失败：', err);
    process.exit(1);
  });
}

main();
