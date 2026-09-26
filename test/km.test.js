import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  OMEGA,
  componentLE,
  strictlyLess,
  isEnabled,
  accelerate,
  buildCoverabilityTree,
  findCoverability,
  coversTarget,
  formatMarking,
} from '../src/km.js';

const t = (id, consume, produce) => ({ id, consume, produce });

test('ω 是符号而非大整数：分量比较语义', () => {
  assert.equal(componentLE([1, 2], [OMEGA, 3]), true);
  assert.equal(componentLE([OMEGA, 1], [OMEGA, 1]), true);
  assert.equal(componentLE([OMEGA, 1], [2, 1]), false, 'ω 不可能小于有限数');
  assert.equal(componentLE([OMEGA], [OMEGA]), true);

  assert.equal(strictlyLess([1, 2], [OMEGA, 2]), true, '有限 < ω 记严格');
  assert.equal(strictlyLess([1, 2], [1, 2]), false, '相等不严格');
  assert.equal(strictlyLess([OMEGA, 1], [OMEGA, 2]), true);
  assert.equal(strictlyLess([OMEGA, 2], [OMEGA, 1]), false);
  assert.equal(strictlyLess([OMEGA, 1], [OMEGA, 1]), false, 'ω 与 ω 不严格');
});

test('可发生判定：ω 库所永远有足够令牌，但有限库所必须够', () => {
  const tr = t('x', [1, 2], [0, 0]);
  assert.equal(isEnabled(tr, [OMEGA, 2]), true);
  assert.equal(isEnabled(tr, [OMEGA, 1]), false);
  assert.equal(isEnabled(tr, [0, OMEGA]), false);
});

test('祖先加速取全部严格更小祖先的并集（波动路径不漏 ω）', () => {
  // 构造祖先链 (0,0) -> (1,0) -> (0,1)，新触发结果 raw=(1,1)。
  // 最近祖先 (0,1) 只能暴露第 0 分量；定点后再由 (0,0) 暴露第 1 分量 ⇒ (ω,ω)。
  const n0 = { marking: [0, 0], parent: null, id: 'n0' };
  const n1 = { marking: [1, 0], parent: n0, id: 'n1' };
  const n2 = { marking: [0, 1], parent: n1, id: 'n2' };
  const { marking, accelerator } = accelerate([1, 1], n2);
  assert.deepEqual(marking, [OMEGA, OMEGA]);
  assert.equal(accelerator.id, 'n2', '证据祖先取最近合格者');
});

test('无新 ω 写入时不记为加速（仅 ω 分量相同不算）', () => {
  const n0 = { marking: [OMEGA, 0], parent: null, id: 'n0' };
  const { marking, accelerator } = accelerate([OMEGA, 0], n0);
  assert.deepEqual(marking, [OMEGA, 0]);
  assert.equal(accelerator, null);
});


test('单库所自增长网：祖先加速写入 ω，任意大阈值可覆盖', () => {
  // p 初始 1；迁移 a：消耗 1 产生 2（净 +1）⇒ p 无界
  const tree = buildCoverabilityTree(['p'], [1], [t('a', [1], [2])]);
  const labels = tree.nodes.map((n) => formatMarking(n.marking));
  assert.ok(labels.includes('(ω)'), `应出现 ω 节点，实际 ${labels}`);
  assert.ok(tree.stats.accelerations >= 1);
  assert.ok(tree.stats.omegaWrites >= 1);

  for (const k of [1, 2, 3, 5, 1000]) {
    const r = findCoverability(tree, [k]);
    assert.equal(r.coverable, true, `阈值 ${k} 应可覆盖`);
    if (k >= 2) assert.ok(r.path.length >= 1, `阈值 ${k} 需经迁移达到`);
  }

  // ω 后继触发后仍为 ω，并被既有 ω 节点支配剪枝 ⇒ 树有限终止
  assert.ok(
    tree.leaves.some((l) => l.marking[0] === OMEGA && l.status === 'dominated'),
    '应有 ω 标记的支配剪枝叶',
  );
  assert.equal(tree.stats.pruned >= 1, true);
});

test('零净变化自环：不写 ω，被根支配剪枝，界内安全', () => {
  // p=1；a：1→1（纯自环，可达标记只有 (1)）
  const tree = buildCoverabilityTree(['p'], [1], [t('a', [1], [1])]);
  assert.equal(tree.stats.omegaWrites, 0);
  assert.equal(tree.stats.accelerations, 0);
  assert.equal(tree.stats.pruned, 1);
  assert.equal(findCoverability(tree, [2]).coverable, false);
  assert.equal(findCoverability(tree, [1]).coverable, true);
});

test('有界互斥资源网：A 永远到不了 3（不可覆盖，全部叶子闭合）', () => {
  // R=2；t1 R→A, t2 A→R, t3 R→B, t4 B→R
  const trs = [
    t('t1', [1, 0, 0], [0, 1, 0]),
    t('t2', [0, 1, 0], [1, 0, 0]),
    t('t3', [1, 0, 0], [0, 0, 1]),
    t('t4', [0, 0, 1], [1, 0, 0]),
  ];
  const tree = buildCoverabilityTree(['R', 'A', 'B'], [2, 0, 0], trs);
  const r = findCoverability(tree, [0, 3, 0]);
  assert.equal(r.coverable, false);
  assert.equal(tree.stats.omegaWrites, 0, '有界网不应出现 ω');
  // 每个叶子要么死锁要么被支配
  for (const leaf of tree.leaves) {
    assert.ok(['dominated', 'deadlock', 'deadlock-root'].includes(leaf.status));
  }
  // 守恒：R+A+B 恒为 2
  for (const n of tree.nodes) {
    const sum = n.marking.reduce((s, v) => s + (v === OMEGA ? 0 : v), 0);
    assert.equal(sum, 2);
  }
});

test('双计数器同步增长：同一节点两个分量同时 ω（合取危险可覆盖）', () => {
  // r=1；a: r→c1+c2+r 型：消耗 r 产生 r、c1、c2（净：c1,c2 各 +1）
  // b: 无（仅 a 即可，a 可反复触发因 r 被补充）
  const trs = [t('a', [1, 0, 0], [1, 1, 1])];
  const tree = buildCoverabilityTree(['r', 'c1', 'c2'], [1, 0, 0], trs);
  assert.equal(findCoverability(tree, [0, 5, 7]).coverable, true);
  const both = tree.nodes.find(
    (n) => n.marking[1] === OMEGA && n.marking[2] === OMEGA,
  );
  assert.ok(both, '同一条可重复增长序列应使两分量在同一节点升 ω');
});

test('合取下限：一个分量无界但另一分量有界且不足 ⇒ 不可覆盖', () => {
  // r=1；a: r→r+x（x 无界）；b: r→y, c: y→r（y 在 0/1 间摆动，有界）
  const trs = [
    t('a', [1, 0, 0], [1, 1, 0]),
    t('b', [1, 0, 0], [0, 0, 1]),
    t('c', [0, 0, 1], [1, 0, 0]),
  ];
  const tree = buildCoverabilityTree(['r', 'x', 'y'], [1, 0, 0], trs);
  assert.equal(findCoverability(tree, [0, 1, 2]).coverable, false, 'y 永远 ≤1');
  assert.equal(findCoverability(tree, [0, 999, 1]).coverable, true, 'x 无界且 y=1 可达');
});

test('初始即死锁：根兼死锁叶，结论不可覆盖', () => {
  const tree = buildCoverabilityTree(['p'], [0], [t('a', [1], [2])]);
  assert.equal(tree.leaves.length, 1);
  assert.equal(tree.leaves[0].status, 'deadlock-root');
  assert.equal(findCoverability(tree, [1]).coverable, false);
});

test('迁移标识字典序稳定展开：重复构造结果逐节点一致', () => {
  const trs = [
    t('z', [1, 0], [0, 1]),
    t('a', [0, 1], [1, 0]),
    t('m', [1, 0], [1, 1]),
  ];
  const t1 = buildCoverabilityTree(['p', 'q'], [1, 0], trs);
  const t2 = buildCoverabilityTree(['p', 'q'], [1, 0], trs.slice().reverse());
  const sig = (tree) =>
    tree.nodes
      .map((n) => `${n.id}:${formatMarking(n.marking)}:${n.parentTransition ?? ''}`)
      .join('|');
  assert.equal(sig(t1), sig(t2));
});

test('树有限终止：7 库所 10 迁移的较密网，无回放深度上限也快速闭合', () => {
  const places = ['p0', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6'];
  const m0 = [1, 0, 0, 0, 0, 0, 0];
  const mk = (id, ci, pi, co, po) => {
    const c = new Array(7).fill(0);
    const p = new Array(7).fill(0);
    c[ci] = 1;
    p[pi] = 1;
    p[co === undefined ? ci : co] = (p[co === undefined ? ci : co] || 0) + (po ?? 0);
    return t(id, c, p);
  };
  const trs = [
    t('t0', [1, 0, 0, 0, 0, 0, 0], [1, 1, 0, 0, 0, 0, 0]), // p1 无界增长
    t('t1', [1, 1, 0, 0, 0, 0, 0], [1, 0, 1, 0, 0, 0, 0]),
    t('t2', [0, 0, 1, 0, 0, 0, 0], [0, 1, 0, 0, 0, 0, 0]),
    t('t3', [1, 0, 0, 0, 0, 0, 0], [0, 0, 0, 1, 0, 0, 0]),
    t('t4', [0, 0, 0, 1, 0, 0, 0], [1, 0, 0, 0, 0, 0, 0]),
    t('t5', [1, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 1, 0, 0]),
    t('t6', [0, 0, 0, 0, 1, 0, 0], [1, 0, 0, 0, 0, 0, 0]),
    t('t7', [1, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 1, 0]),
    t('t8', [0, 0, 0, 0, 0, 1, 0], [1, 0, 0, 0, 0, 0, 0]),
    t('t9', [1, 0, 0, 0, 0, 0, 0], [1, 0, 0, 0, 0, 0, 1]), // p6 无界
  ];
  void mk;
  const started = Date.now();
  const tree = buildCoverabilityTree(places, m0, trs);
  assert.ok(Date.now() - started < 5000, '构造应在 5s 内终止');
  assert.ok(tree.nodes.every((n) => n.children.length > 0 || tree.leaves.includes(n)));
  assert.equal(findCoverability(tree, [0, 0, 0, 0, 0, 0, 100]).coverable, true);
  // p3 在 r/p3 两态间摆动，永远 ≤1
  assert.equal(findCoverability(tree, [0, 0, 0, 2, 0, 0, 0]).coverable, false);
});

test('coversTarget 对未列入库所阈值按 0 处理', () => {
  assert.equal(coversTarget([1, 0], [2, 0]), false);
  assert.equal(coversTarget([OMEGA, 0], [2, 0]), true);
});

test('证据路径逐迁移符号完整且从根出发', () => {
  const trs = [
    t('t_a', [1, 0], [0, 1]),
    t('t_b', [0, 1], [0, 2]),
  ];
  const tree = buildCoverabilityTree(['p', 'q'], [1, 0], trs);
  const r = findCoverability(tree, [0, 2]);
  assert.equal(r.coverable, true);
  assert.deepEqual(
    r.path.map((s) => s.transition),
    ['t_a', 't_b'],
  );
  assert.equal(r.path[0].from, tree.root.id);
  assert.equal(r.path[r.path.length - 1].to, r.node.id);
});
