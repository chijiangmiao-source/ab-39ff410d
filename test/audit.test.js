import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runAudit } from '../src/audit.js';

// 可覆盖样例（与页面按钮一致）：阀位计数 V 无界
const coverableDraft = {
  places: [{ name: 'P0' }, { name: 'W' }, { name: 'V' }, { name: 'S' }],
  initial: ['1', '0', '0', '0'],
  hazards: { V: '3' },
  transitions: [
    { id: 't_a', rows: [{ consume: '1', produce: '0' }, { consume: '0', produce: '1' }, { consume: '0', produce: '1' }, { consume: '0', produce: '0' }] },
    { id: 't_b', rows: [{ consume: '0', produce: '1' }, { consume: '1', produce: '0' }, { consume: '0', produce: '0' }, { consume: '0', produce: '0' }] },
    { id: 't_c', rows: [{ consume: '1', produce: '0' }, { consume: '0', produce: '0' }, { consume: '0', produce: '0' }, { consume: '0', produce: '1' }] },
    { id: 't_d', rows: [{ consume: '0', produce: '1' }, { consume: '0', produce: '0' }, { consume: '0', produce: '0' }, { consume: '1', produce: '0' }] },
  ],
};

// 不可覆盖样例：资源守恒 R+A+B=2，A≥3 不成立
const uncoverableDraft = {
  places: [{ name: 'R' }, { name: 'A' }, { name: 'B' }],
  initial: ['2', '0', '0'],
  hazards: { A: '3' },
  transitions: [
    { id: 't1', rows: [{ consume: '1', produce: '0' }, { consume: '0', produce: '1' }, { consume: '0', produce: '0' }] },
    { id: 't2', rows: [{ consume: '0', produce: '1' }, { consume: '1', produce: '0' }, { consume: '0', produce: '0' }] },
    { id: 't3', rows: [{ consume: '1', produce: '0' }, { consume: '0', produce: '0' }, { consume: '0', produce: '1' }] },
    { id: 't4', rows: [{ consume: '0', produce: '1' }, { consume: '0', produce: '0' }, { consume: '1', produce: '0' }] },
  ],
};

test('端到端：可覆盖网给出覆盖节点、逐迁移路径与祖先加速链', () => {
  const r = runAudit(coverableDraft);
  assert.equal(r.ok, true);
  const a = r.audit;
  assert.equal(a.coverable, true);
  assert.ok(a.evidence.node.markingText.includes('ω'));
  assert.ok(a.evidence.path.length >= 1);
  // 路径符号全是已声明迁移标识
  for (const step of a.evidence.path) {
    assert.ok(['t_a', 't_b', 't_c', 't_d'].includes(step.transition));
    assert.match(step.edge, /^n\d+ —t_[a-d]→ n\d+$/);
  }
  // V 经 t_a/t_b 循环无界 ⇒ 必有一次祖先加速写入 ω
  assert.ok(a.evidence.accelerationChain.length >= 1);
  for (const c of a.evidence.accelerationChain) {
    assert.match(c.edge, /—t_[ab]→/);
    assert.ok(c.rawMarking.includes(','));
    assert.ok(c.finalMarking.includes('ω'));
  }
  assert.equal(a.closedTree, null, '可覆盖时不展示闭合树摘要');
});

test('端到端：不可覆盖网给出已闭合规范树与每个叶子的原因', () => {
  const r = runAudit(uncoverableDraft);
  assert.equal(r.ok, true);
  const a = r.audit;
  assert.equal(a.coverable, false);
  assert.equal(a.evidence, null);
  const t = a.closedTree;
  assert.ok(t.ascii.includes('[根]'));
  assert.ok(t.ascii.includes('[死锁叶]') || t.ascii.includes('[剪枝'));
  assert.ok(t.leaves.length >= 1);
  for (const leaf of t.leaves) {
    assert.ok(leaf.kind === 'pruned' || leaf.kind === 'deadlock');
    assert.ok(Array.isArray(leaf.path));
    if (leaf.kind === 'pruned') {
      assert.match(leaf.detail.dominatedBy, /^n\d+$/);
      assert.ok(leaf.detail.reason.includes('支配'));
    } else {
      assert.ok(leaf.detail.reason.includes('死锁') || leaf.detail.reason.includes('可发生'));
    }
  }
  // 全部叶子数 = 剪枝 + 死锁
  assert.equal(t.leaves.length, t.prunedLeaves + t.deadlockLeaves);
});

test('端到端：非法输入返回错误且不产生审计结论', () => {
  const bad = {
    places: [{ name: 'P' }],
    initial: ['-1'],
    hazards: { P: '0' },
    transitions: [{ id: 'z', rows: [{ consume: '0', produce: '0' }] }],
  };
  const r = runAudit(bad);
  assert.equal(r.ok, false);
  assert.ok(r.errors.length >= 3, '初始值、阈值0、全零迁移应合并反馈');
  assert.equal(r.audit, undefined);
});

test('端到端：多个危险库所的合取判定', () => {
  // r=1；a: r→r+x（x 无界）；y 始终为 0
  const draft = {
    places: [{ name: 'r' }, { name: 'x' }, { name: 'y' }],
    initial: ['1', '0', '0'],
    hazards: { x: '10', y: '1' },
    transitions: [
      { id: 'a', rows: [{ consume: '1', produce: '1' }, { consume: '0', produce: '1' }, { consume: '0', produce: '0' }] },
    ],
  };
  const r = runAudit(draft);
  assert.equal(r.audit.coverable, false, 'y 永远为 0，合取不可覆盖');
});
