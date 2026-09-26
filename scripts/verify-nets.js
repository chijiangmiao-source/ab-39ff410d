// verify 第 1 环：对“一组可覆盖网”和“一组不可覆盖网”直接驱动审计引擎，
// 强断言结论方向与证据/闭合结构正确。任一组不符即以非零退出码失败。
import { runAudit } from '../src/audit.js';

const coverableNets = [
  {
    name: '阀位计数无界（单分量 ω）',
    draft: {
      places: [{ name: 'P0' }, { name: 'W' }, { name: 'V' }, { name: 'S' }],
      initial: ['1', '0', '0', '0'],
      hazards: { V: '3' },
      transitions: [
        { id: 't_a', rows: [{ consume: '1', produce: '0' }, { consume: '0', produce: '1' }, { consume: '0', produce: '1' }, { consume: '0', produce: '0' }] },
        { id: 't_b', rows: [{ consume: '0', produce: '1' }, { consume: '1', produce: '0' }, { consume: '0', produce: '0' }, { consume: '0', produce: '0' }] },
        { id: 't_c', rows: [{ consume: '1', produce: '0' }, { consume: '0', produce: '0' }, { consume: '0', produce: '0' }, { consume: '0', produce: '1' }] },
        { id: 't_d', rows: [{ consume: '0', produce: '1' }, { consume: '0', produce: '0' }, { consume: '0', produce: '0' }, { consume: '1', produce: '0' }] },
      ],
    },
  },
  {
    name: '双计数器同步无界（多分量同时 ω，合取可覆盖）',
    draft: {
      places: [{ name: 'r' }, { name: 'c1' }, { name: 'c2' }],
      initial: ['1', '0', '0'],
      hazards: { c1: '50', c2: '50' },
      transitions: [
        { id: 'a', rows: [{ consume: '1', produce: '1' }, { consume: '0', produce: '1' }, { consume: '0', produce: '1' }] },
      ],
    },
  },
];

const uncoverableNets = [
  {
    name: '资源守恒互斥网（有界，A≥3 不可覆盖）',
    draft: {
      places: [{ name: 'R' }, { name: 'A' }, { name: 'B' }],
      initial: ['2', '0', '0'],
      hazards: { A: '3' },
      transitions: [
        { id: 't1', rows: [{ consume: '1', produce: '0' }, { consume: '0', produce: '1' }, { consume: '0', produce: '0' }] },
        { id: 't2', rows: [{ consume: '0', produce: '1' }, { consume: '1', produce: '0' }, { consume: '0', produce: '0' }] },
        { id: 't3', rows: [{ consume: '1', produce: '0' }, { consume: '0', produce: '0' }, { consume: '0', produce: '1' }] },
        { id: 't4', rows: [{ consume: '0', produce: '1' }, { consume: '0', produce: '0' }, { consume: '1', produce: '0' }] },
      ],
    },
  },
  {
    name: '一无界一有界合取（x 无界但 y≤1，x≥1∧y≥2 不可覆盖）',
    draft: {
      places: [{ name: 'r' }, { name: 'x' }, { name: 'y' }],
      initial: ['1', '0', '0'],
      hazards: { x: '1', y: '2' },
      transitions: [
        { id: 'a', rows: [{ consume: '1', produce: '1' }, { consume: '0', produce: '1' }, { consume: '0', produce: '0' }] },
        { id: 'b', rows: [{ consume: '1', produce: '0' }, { consume: '0', produce: '0' }, { consume: '0', produce: '1' }] },
        { id: 'c', rows: [{ consume: '0', produce: '1' }, { consume: '0', produce: '0' }, { consume: '1', produce: '0' }] },
      ],
    },
  },
];

let failures = 0;

for (const { name, draft } of coverableNets) {
  const r = runAudit(draft);
  const good =
    r.ok &&
    r.audit.coverable === true &&
    r.audit.evidence.path.length >= 1 &&
    r.audit.evidence.accelerationChain.length >= 1 &&
    r.audit.evidence.node.markingText.includes('ω');
  if (good) {
    console.log(`✓ [可覆盖组] ${name}：覆盖节点 ${r.audit.evidence.node.markingText}，路径 ${r.audit.evidence.path.length} 跳，加速 ${r.audit.evidence.accelerationChain.length} 次`);
  } else {
    console.error(`✗ [可覆盖组] ${name}：未得到预期的可覆盖证据`, r.ok ? '' : r.errors);
    failures++;
  }
}

for (const { name, draft } of uncoverableNets) {
  const r = runAudit(draft);
  if (
    r.ok &&
    r.audit.coverable === false &&
    r.audit.closedTree.leaves.length >= 1 &&
    r.audit.closedTree.leaves.every((l) => l.kind === 'pruned' || l.kind === 'deadlock')
  ) {
    const t = r.audit.closedTree;
    console.log(`✓ [不可覆盖组] ${name}：规范树 ${t.nodeCount} 节点，剪枝叶 ${t.prunedLeaves}，死锁叶 ${t.deadlockLeaves}`);
  } else {
    console.error(`✗ [不可覆盖组] ${name}：误判为可覆盖或闭合树异常`);
    failures++;
  }
}

if (failures > 0) {
  console.error(`\n样例网验证失败：${failures} 项`);
  process.exit(1);
}
console.log('\n两组样例网（可覆盖 / 不可覆盖）审计结论全部符合预期');
