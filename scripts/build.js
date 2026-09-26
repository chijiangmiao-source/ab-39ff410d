// 前端构建检查（离线，无第三方打包器）：
//  1) 所有 JS 文件通过语法检查（node --check 等价：new SourceTextModule 语法解析）
//  2) index.html 引用的本地资源（script/link）均存在
//  3) 非 DOM 模块（km/validate/audit）的相对 import 全部可解析
// 失败时以非零退出码报告。
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let failed = 0;

const fail = (msg) => {
  console.error(`✗ ${msg}`);
  failed++;
};
const ok = (msg) => console.log(`✓ ${msg}`);

async function listJs(dir) {
  const out = [];
  const walk = async (d) => {
    const entries = await readdir(d, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) await walk(full);
      else if (e.name.endsWith('.js')) out.push(full);
    }
  };
  await walk(dir);
  return out;
}

// 1) 语法检查：node --check 对每个 JS 文件做纯语法解析
async function syntaxCheck(file) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (err) {
    fail(`语法错误 ${path.relative(ROOT, file)}: ${String(err.stderr || err.message)}`);
    return;
  }
  ok(`语法通过 ${path.relative(ROOT, file)}`);
}

// 2) HTML 引用资源存在性
async function checkHtmlRefs() {
  const html = await readFile(path.join(ROOT, 'index.html'), 'utf8');
  const refs = [];
  const re = /(?:src|href)="([^"]+)"/g;
  let m;
  while ((m = re.exec(html))) {
    const u = m[1];
    if (/^https?:\/\//.test(u) || u.startsWith('#')) continue;
    refs.push(u.replace(/^\//, ''));
  }
  for (const ref of refs) {
    const target = path.join(ROOT, ref);
    try {
      await readFile(target);
      ok(`页面资源存在 /${ref}`);
    } catch {
      fail(`页面引用的资源缺失: /${ref}`);
    }
  }
}

// 3) 模块 import 图解析（仅检查算法层模块，DOM 模块 app.js 不做图执行）
async function checkImports(file, seen = new Set()) {
  const rel = path.relative(ROOT, file);
  if (seen.has(rel)) return;
  seen.add(rel);
  const code = await readFile(file, 'utf8');
  const re = /from\s+['"](\.[^'"]+)['"]/g;
  let m;
  while ((m = re.exec(code))) {
    const target = path.resolve(path.dirname(file), m[1]);
    try {
      await readFile(target);
      await checkImports(target, seen);
    } catch {
      fail(`模块 ${rel} 的相对导入无法解析: ${m[1]}`);
    }
  }
}

async function main() {
  const dirs = ['src', 'scripts'].map((d) => path.join(ROOT, d));
  for (const d of dirs) {
    const files = await listJs(d);
    for (const f of files) await syntaxCheck(f);
  }
  await checkHtmlRefs();
  await checkImports(path.join(ROOT, 'src', 'audit.js'));
  const health = await readFile(path.join(ROOT, 'health.html'), 'utf8');
  if (health.includes('服务健康')) ok('健康页内容正常 health.html');
  else fail('health.html 内容异常');

  if (failed > 0) {
    console.error(`\n构建检查失败：${failed} 项`);
    process.exit(1);
  }
  console.log('\n构建检查全部通过（纯前端资源完整，可离线部署）');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
