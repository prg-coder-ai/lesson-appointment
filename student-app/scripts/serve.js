/**
 * 本地预览服务器（浏览器端验证用，零依赖）
 * 用法：node student-app/scripts/serve.js [port]   默认 8099
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', 'www');
const PORT = parseInt(process.argv[2], 10) || 8099;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.pdf': 'application/pdf'
};

http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  // local 模式下后端 API 走 apiOrigin 绝对地址，不经过本服务器；
  // 若 apiOrigin 为空且请求 /api/*，给出明确提示而不是 404 HTML。
  if (urlPath.indexOf('/api/') === 0) {
    res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('请先在 config/environments.js 配置 apiOrigin（local 模式）或使用 server 模式。');
    return;
  }
  let file = path.join(ROOT, urlPath);
  // 防目录穿越
  if (!file.startsWith(ROOT)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 ' + urlPath);
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(PORT, () => {
  console.log('学生端预览: http://localhost:' + PORT);
  console.log('静态目录:', ROOT);
});
