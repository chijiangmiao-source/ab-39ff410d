// 审计编排：校验 -> 构造 Karp–Miller 覆盖树 -> 危险覆盖判定 -> 组织结论证据。
import { validateModel } from './validate.js';
import {
  buildCoverabilityTree,
  findCoverability,
  formatMarking,
  OMEGA,
} from './km.js';

// 生成每个叶子的闭合说明（剪枝 / 死锁）
function summarizeLeaves(tree) {
  return tree.leaves.map((leaf) => {
    const chain = [];
    let cur = leaf;
    while (cur && cur.parent) {
      chain.unshift(cur.parentTransition);
      cur = cur.parent;
    }
    return {
      id: leaf.id,
      depth: leaf.depth,
      marking: leaf.marking,
      markingText: formatMarking(leaf.marking),
      path: chain,
      pathText: chain.length ? chain.join(' → ') : '（根）',
      kind: leaf.status === 'dominated' ? 'pruned' : 'deadlock',
      detail:
        leaf.status === 'dominated'
          ? { dominatedBy: leaf.dominatedBy, reason: leaf.edge?.reason }
          : { reason: leaf.reason },
    };
  });
}

// 规范树摘要（不可覆盖时展示，证明整棵树已闭合枚举）
function treeSummary(tree, places) {
  const lines = [];
  const walk = (node, prefix, isLast) => {
    if (node.parent) {
      const branch = prefix + (isLast ? '└─ ' : '├─ ');
      const tag =
        node.status === 'dominated'
          ? ` [剪枝·被 ${node.dominatedBy} 支配]`
          : node.status === 'deadlock' || node.status === 'deadlock-root'
            ? ' [死锁叶]'
            : '';
      const accel = node.edge?.accelerated ? ` (祖先 ${node.acceleratedFrom} 加速→ω)` : '';
      lines.push(`${branch}—${node.parentTransition}→ ${node.id} ${formatMarking(node.marking)}${accel}${tag}`);
    } else {
      lines.push(`${node.id} ${formatMarking(node.marking)} [根]`);
    }
    const childPrefix = node.parent ? prefix + (isLast ? '   ' : '│  ') : '';
    node.children.forEach((c, i) => walk(c, childPrefix, i === node.children.length - 1));
  };
  walk(tree.root, '', true);

  return {
    places,
    ascii: lines.join('\n'),
    nodeCount: tree.stats.nodes,
    edgeCount: tree.stats.edges,
    omegaWrites: tree.stats.omegaWrites,
    accelerations: tree.stats.accelerations,
    prunedLeaves: tree.stats.pruned,
    deadlockLeaves: tree.stats.deadlocks,
    leaves: summarizeLeaves(tree),
  };
}

// draft: 页面草稿；返回 { ok:false, errors } 或 { ok:true, audit }
export function runAudit(draft) {
  const v = validateModel(draft);
  if (!v.ok) return { ok: false, errors: v.errors };

  const { model } = v;
  const tree = buildCoverabilityTree(model.places, model.initial, model.transitions);

  // 合成目标向量（未列入的库所阈值为 0）
  const target = new Array(model.places.length).fill(0);
  for (const h of model.hazards) target[h.index] = h.threshold;

  const verdict = findCoverability(tree, target);

  // 祖先加速链：从覆盖节点沿父链收集所有发生 ω 加速的边
  const accelerationChain = [];
  if (verdict.coverable) {
    for (const step of verdict.path) {
      if (step.accelerated) {
        accelerationChain.push({
          edge: `${step.from} —${step.transition}→ ${step.to}`,
          ancestor: step.acceleratedFrom,
          rawMarking: formatMarking(step.rawMarking),
          finalMarking: formatMarking(step.marking),
        });
      }
    }
  }

  const audit = {
    places: model.places,
    initial: model.initial,
    transitions: model.transitions,
    hazards: model.hazards,
    target,
    targetText: formatMarking(target),
    stats: tree.stats,
    coverable: verdict.coverable,
    evidence: verdict.coverable
      ? {
          node: {
            id: verdict.node.id,
            depth: verdict.node.depth,
            marking: verdict.node.marking,
            markingText: formatMarking(verdict.node.marking),
          },
          path: verdict.path.map((s) => ({
            edge: `${s.from} —${s.transition}→ ${s.to}`,
            transition: s.transition,
            from: s.from,
            to: s.to,
            markingText: formatMarking(s.marking),
            accelerated: s.accelerated,
            acceleratedFrom: s.acceleratedFrom,
            rawMarkingText: s.accelerated ? formatMarking(s.rawMarking) : null,
          })),
          accelerationChain,
        }
      : null,
    closedTree: verdict.coverable ? null : treeSummary(tree, model.places),
  };

  return { ok: true, audit };
}

export { OMEGA };
