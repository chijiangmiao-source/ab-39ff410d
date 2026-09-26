import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runAudit } from '../src/audit.js';
import { renderResult, renderErrorList, renderMarkingText } from '../src/render.js';

const coverableDraft = {
  places: [{ name: 'r' }, { name: 'x' }],
  initial: ['1', '0'],
  hazards: { x: '3' },
  transitions: [
    { id: 'a', rows: [{ consume: '1', produce: '1' }, { consume: '0', produce: '1' }] },
  ],
};

const uncoverableDraft = {
  places: [{ name: 'R' }, { name: 'A' }],
  initial: ['1', '0'],
  hazards: { A: '2' },
  transitions: [
    { id: 't1', rows: [{ consume: '1', produce: '0' }, { consume: '0', produce: '1' }] },
    { id: 't2', rows: [{ consume: '0', produce: '1' }, { consume: '1', produce: '0' }] },
  ],
};

test('可覆盖结论含覆盖节点、逐迁移路径、祖先加速链与 ω 高亮', () => {
  const { audit } = runAudit(coverableDraft);
  const html = renderResult(audit);
  assert.match(html, /可被覆盖/);
  assert.match(html, /覆盖节点/);
  assert.match(html, /逐迁移符号标识路径/);
  assert.match(html, /祖先加速链/);
  assert.ok(html.includes('class="omega">ω</span>'));
  assert.match(html, /—a→/);
});

test('不可覆盖结论含规范树 ASCII 与每叶剪枝/死锁原因', () => {
  const { audit } = runAudit(uncoverableDraft);
  const html = renderResult(audit);
  assert.match(html, /不可覆盖/);
  assert.match(html, /已闭合规范树摘要/);
  assert.ok(html.includes('[根]'));
  assert.ok(html.includes('支配剪枝') || html.includes('死锁'));
  assert.match(html, /剪枝 \/ 死锁原因/);
});

test('动态文本经 HTML 转义，恶意库所名不注入标签', () => {
  const evil = '<img src=x onerror=alert(1)>';
  const { audit } = runAudit({
    places: [{ name: evil }, { name: 'x' }],
    initial: ['1', '0'],
    hazards: { x: '3' },
    transitions: [
      { id: 'a', rows: [{ consume: '1', produce: '1' }, { consume: '0', produce: '1' }] },
    ],
  });
  const html = renderResult(audit);
  assert.ok(!html.includes(evil), '原样恶意串不得出现');
  assert.ok(html.includes('&lt;img'), '应被转义');

  const errHtml = renderErrorList([{ scope: 'hazards', ref: evil, message: 'x' }]);
  assert.ok(!errHtml.includes('<img'), '错误项中也不得出现未转义标签');
  assert.ok(errHtml.includes('&lt;img'));
});

test('renderMarkingText 仅高亮 ω，数字与括号保持转义', () => {
  assert.equal(renderMarkingText('(1, ω, 0)'), '(1, <span class="omega">ω</span>, 0)');
  assert.equal(renderMarkingText('<b>'), '&lt;b&gt;');
});
