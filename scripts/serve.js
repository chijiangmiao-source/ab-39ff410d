// 极简纯静态服务器（零第三方依赖，可离线运行）。
// 路由：
//   GET /health      -> 200 JSON 健康探针（供 compose 健康检查/冒烟使用）
//   GET /health.html -> 人类可读健康页
//   其他路径          -> 项目根目录静态文件（/ -> index.html）
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '0.0.0.0';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'local'}`);
  const pathname = url.pathname;

  if (pathname === '/health') {
    sendJson(res, 200, {
      status: 'ok',
      service: 'km-coverability-audit',
      time: new Date().toISOString(),
      port: PORT,
    });
    return;
  }

  const rel = pathname === '/' ? '/index.html' : pathname;
  // 防目录穿越：规范化后必须仍在 ROOT 内
  const filePath = path.normalize(path.join(ROOT, rel));
  if (!filePath.startsWith(ROOT + path.sep)) {
    sendJson(res, 403, { error: 'forbidden' });
    return;
  }

  try {
    const data = await readFile(filePath);
    res.writeHead(200, {
      'content-type': MIME[path.extname(filePath)] || 'application/octet-stream',
    });
    res.end(data);
  } catch (err) {
    if (err.code === 'ENOENT') {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
    } else {
      sendJson(res, 500, { error: 'internal', detail: String(err) });
    }
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[web] 静态服务已启动: http://${HOST}:${PORT} （健康探针 /health，健康页 /health.html）`);
});
