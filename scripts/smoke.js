// 健康页 HTTP 冒烟测试：启动静态服务，探测 /health 与 /health.html，
// 并拉取首页与关键模块确认可离线提供；以退出码报告结果。
// 用法：node scripts/smoke.js [baseUrl]
//   不给参数时自行在随机端口启动服务（compose verify 中对已启动的 web 探测）
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function get(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.setTimeout(5000, () => req.destroy(new Error('请求超时')));
  });
}

async function waitReady(base, tries = 40) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await get(`${base}/health`);
      if (r.status === 200 && JSON.parse(r.body).status === 'ok') return r;
    } catch {
      /* 重试 */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('服务在预期时间内未就绪');
}

let child = null;
let baseUrl;

async function main() {
  const arg = process.argv[2];
  if (arg) {
    baseUrl = arg.replace(/\/$/, '');
  } else {
    const port = 8080 + Math.floor(Math.random() * 1000);
    baseUrl = `http://127.0.0.1:${port}`;
    child = spawn(process.execPath, [path.join(ROOT, 'scripts', 'serve.js')], {
      cwd: ROOT,
      env: { ...process.env, PORT: String(port), HOST: '127.0.0.1' },
      stdio: 'ignore',
    });
    await waitReady(baseUrl);
  }

  let failures = 0;
  const check = (cond, msg) => {
    if (cond) console.log(`✓ ${msg}`);
    else {
      console.error(`✗ ${msg}`);
      failures++;
    }
  };

  try {
    const health = await waitReady(baseUrl);
    check(health.status === 200, '/health 返回 200');
    const payload = JSON.parse(health.body);
    check(payload.service === 'km-coverability-audit', '/health 负载标识正确');
    check(payload.port !== undefined, '/health 含端口信息');

    const page = await get(`${baseUrl}/health.html`);
    check(page.status === 200 && page.body.includes('服务健康'), '/health.html 健康页可访问且含健康标识');

    const index = await get(`${baseUrl}/`);
    check(index.status === 200 && index.body.includes('Karp'), '/ 审计页可访问（含引擎标识）');

    const appjs = await get(`${baseUrl}/src/app.js`);
    check(appjs.status === 200 && appjs.body.includes('runAudit'), '/src/app.js 模块可加载');

    const kmjs = await get(`${baseUrl}/src/km.js`);
    check(kmjs.status === 200 && kmjs.body.includes('buildCoverabilityTree'), '/src/km.js 引擎模块可加载');

    const css = await get(`http://127.0.0.1:${new URL(baseUrl).port}/styles.css`);
    check(css.status === 200 && css.body.length > 0, '/styles.css 可加载');
  } finally {
    if (child) child.kill('SIGTERM');
  }

  if (failures > 0) {
    console.error(`\n冒烟失败：${failures} 项`);
    process.exit(1);
  }
  console.log('\nHTTP 冒烟全部通过');
}

main().catch((e) => {
  if (child) child.kill('SIGTERM');
  console.error('冒烟执行异常:', e);
  process.exit(1);
});
