// Karp–Miller 覆盖树（coverability tree）核心算法
//
// 记号：
//   marking: Array<number|'ω'>，每个库所的令牌数，'ω' 表示“无界”符号；
//            绝不把 ω 表示成某个大整数（ω + n = ω，ω > 任何有限数）。
//   transition: { id, consume: number[], produce: number[] }
//
// 关键性质（按经典 Karp–Miller 1969）：
//   1. 从节点 x 经可发生迁移 t 得到后继标记 m'（有限后继分量）。
//   2. 祖先加速：在 x 的祖先链上找严格小于 m' 的标记 a（逐分量 ≤ 且至少一个
//      严格 <），则所有“增大”的分量写入 ω（ω 对严格比较具有传染性）。
//   3. 支配剪枝：新节点若被当前树上任一已有节点（含自身/祖先）逐分量支配
//      （existing >= new，含 ω >= ω），则不再展开（dominated 叶）。
//   4. 无可发生迁移的节点为 deadlock 叶。
//   因此树必然有限终止；不设置任何回放/搜索深度上限。

export const OMEGA = 'ω';

const isOmega = (v) => v === OMEGA;

// 逐分量比较：a <= b（ω 视为 +∞；ω<=ω 成立；有限数永远 < ω）
export function componentLE(a, b) {
  for (let i = 0; i < a.length; i++) {
    if (isOmega(b[i])) continue;
    if (isOmega(a[i])) return false;
    if (a[i] > b[i]) return false;
  }
  return true;
}

// a 严格小于 b：a <= b 且至少一个分量严格 <
// （有限数 < ω 算严格；两个 ω 之间不严格）
export function strictlyLess(a, b) {
  if (!componentLE(a, b)) return false;
  for (let i = 0; i < a.length; i++) {
    if (isOmega(a[i]) && isOmega(b[i])) continue;
    if (isOmega(b[i])) return true; // 有限 < ω
    if (isOmega(a[i])) return false;
    if (a[i] < b[i]) return true;
  }
  return false;
}

// 迁移 t 在标记 m 下是否可发生（被 ω 覆盖的库所视为永远有足够令牌）
export function isEnabled(t, m) {
  for (let i = 0; i < m.length; i++) {
    if (isOmega(m[i])) continue;
    if (m[i] < t.consume[i]) return false;
  }
  return true;
}

// 触发迁移：m' = m - consume + produce；ω 分量保持 ω。
function fire(m, t) {
  const out = new Array(m.length);
  for (let i = 0; i < m.length; i++) {
    if (isOmega(m[i])) out[i] = OMEGA;
    else out[i] = m[i] - t.consume[i] + t.produce[i];
  }
  return out;
}

// 祖先加速：遍历父链上的每一个祖先标记 a，只要 a 严格小于 raw，
// 就把所有满足 a[i] < raw[i] 的分量提升为 ω；对所有合格祖先取并集。
// 只看单个祖先在标记沿路径波动时可能漏掉更早祖先暴露出的无界分量，
// 故逐一枚举（Karp–Miller 加速是“存在严格更小祖先”的分量级并集规则）。
// accelerator 取最近的合格祖先用于证据展示；raw 本身由 fire 产生，不含 ω。
function accelerate(raw, parent) {
  const next = raw.slice();
  let firstQualifying = null;
  // 定点：随 ω 写入 next 变大，可能有更早的祖先新满足严格小于条件，
  // 故重复向上扫描直到一轮内无新增 ω（至多 n 轮）。
  let changed = true;
  while (changed) {
    changed = false;
    let cur = parent;
    while (cur) {
      if (strictlyLess(cur.marking, next)) {
        if (!firstQualifying) firstQualifying = cur;
        for (let i = 0; i < next.length; i++) {
          if (!isOmega(cur.marking[i]) && !isOmega(next[i]) && cur.marking[i] < next[i]) {
            next[i] = OMEGA;
            changed = true;
          }
        }
      }
      cur = cur.parent;
    }
  }
  const wrote = next.some((v, i) => isOmega(v) && !isOmega(raw[i]));
  // 只有确实写入了新的 ω 分量才算一次加速
  return wrote ? { marking: next, accelerator: firstQualifying } : { marking: raw, accelerator: null };
}

export { accelerate };

const markKey = (m) => m.map((v) => (isOmega(v) ? 'ω' : v)).join(',');

// 构造覆盖树。
// 输入：places: string[]；m0: number[]；transitions: 已校验的迁移数组
// 展开顺序按迁移标识字典序稳定排序，保证同构输入产生相同的树与结论。
// 返回树对象：
// {
//   root, nodes, leaves, stats: { nodes, edges, omegaWrites, accelerations, pruned, deadlocks }
// }
// 节点：
// { id, seq, marking, parent:Node|null, parentTransition:id|null,
//   children:Node[], depth, status: 'open'|'deadlock'|'dominated'|'root',
//   acceleratedFrom: id|null, edge: {transition, accelerated, rawMarking, reason} }
export function buildCoverabilityTree(places, m0, transitions) {
  const n = places.length;
  const ordered = transitions.slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  let seqCounter = 0;
  const makeNode = (marking, parent, transitionId, edgeMeta) => ({
    id: `n${seqCounter}`,
    seq: seqCounter++,
    marking,
    parent,
    parentTransition: transitionId,
    children: [],
    depth: parent ? parent.depth + 1 : 0,
    status: 'open',
    acceleratedFrom: edgeMeta?.accelerator?.id ?? null,
    edge: edgeMeta
      ? {
          transition: transitionId,
          accelerated: edgeMeta.accelerated,
          rawMarking: edgeMeta.rawMarking,
          reason: edgeMeta.reason ?? null,
        }
      : null,
  });

  const root = makeNode(m0.slice(), null, null, null);
  root.status = 'root';
  const allNodes = [root];

  // 工作栈：深度优先展开。不设深度限制——有限性由 Karp–Miller 定理保证。
  const stack = [root];

  let omegaWrites = 0;
  let accelerations = 0;
  let pruned = 0;
  let deadlocks = 0;

  while (stack.length > 0) {
    const node = stack.pop();

    // 根节点本身也参与支配判定之外的处理；只有新生成的后继才做支配检查。
    const enabled = ordered.filter((t) => isEnabled(t, node.marking));
    if (enabled.length === 0) {
      if (node !== root) {
        node.status = 'deadlock';
        node.reason = '没有任何迁移在该标记下可发生（输入令牌不足），死锁叶';
        deadlocks++;
      } else {
        // 根即死锁：保持 root 状态，但记录为闭合叶子
        node.status = 'deadlock-root';
        node.reason = '初始标记下即无任何迁移可发生，根节点兼作死锁叶';
        deadlocks++;
      }
      continue;
    }

    // 以稳定顺序压栈（倒序压入使字典序最小的迁移先弹出）
    for (let k = ordered.length - 1; k >= 0; k--) {
      const t = ordered[k];
      if (!isEnabled(t, node.marking)) continue;

      const raw = fire(node.marking, t);
      const { marking: accMarking, accelerator } = accelerate(raw, node);
      const accelerated = accelerator !== null;
      if (accelerated) {
        accelerations++;
        for (let i = 0; i < n; i++) if (isOmega(accMarking[i]) && !isOmega(raw[i])) omegaWrites++;
      }

      const child = makeNode(accMarking, node, t.id, {
        accelerated,
        rawMarking: raw,
        accelerator,
        reason: accelerated ? `祖先 ${accelerator.id} 严格小于触发后标记，增大分量写入 ω` : null,
      });

      // 支配剪枝：树中已有节点 d 满足 child <= d（d 逐分量 ≥ child），
      // 则 child 子树可达标记已被 d 的展开覆盖，剪去。
      let dominator = null;
      for (const d of allNodes) {
        if (componentLE(child.marking, d.marking)) {
          dominator = d;
          break;
        }
      }

      node.children.push(child);
      allNodes.push(child);

      if (dominator) {
        child.status = 'dominated';
        child.edge.reason = `被已构造节点 ${dominator.id} ${formatMarking(dominator.marking)} 逐分量支配，剪枝`;
        child.dominatedBy = dominator.id;
        pruned++;
      } else {
        stack.push(child);
      }
    }
  }

  const leaves = allNodes.filter(
    (x) => x.status === 'dominated' || x.status === 'deadlock' || x.status === 'deadlock-root',
  );

  return {
    root,
    nodes: allNodes,
    leaves,
    stats: {
      nodes: allNodes.length,
      edges: allNodes.length - 1,
      omegaWrites,
      accelerations,
      pruned,
      deadlocks,
    },
  };
}

// 目标 target（各危险库所最低令牌数，未列入的库所阈值为 0）是否被标记 m 覆盖
export function coversTarget(m, target) {
  for (let i = 0; i < m.length; i++) {
    const need = target[i] ?? 0;
    if (need === 0) continue;
    if (!isOmega(m[i]) && m[i] < need) return false;
  }
  return true;
}

// 在覆盖树中寻找危险下限的覆盖证据。
// 返回 { coverable, node, path }：
//   path 为从根到覆盖节点的逐迁移边描述 [{from,to,transition,marking,accelerated,rawMarking}]
export function findCoverability(tree, target) {
  // 取深度最浅（seq 最小）的覆盖节点，证据最短
  let hit = null;
  for (const node of tree.nodes) {
    if (coversTarget(node.marking, target)) {
      if (!hit || node.seq < hit.seq) hit = node;
    }
  }
  if (!hit) return { coverable: false, node: null, path: [] };

  const path = [];
  let cur = hit;
  while (cur && cur.parent) {
    path.unshift({
      from: cur.parent.id,
      to: cur.id,
      transition: cur.parentTransition,
      marking: cur.marking,
      accelerated: cur.edge.accelerated,
      rawMarking: cur.edge.rawMarking,
      acceleratedFrom: cur.acceleratedFrom,
    });
    cur = cur.parent;
  }
  return { coverable: true, node: hit, path };
}

export function formatMarking(m) {
  return `(${m.map((v) => (isOmega(v) ? 'ω' : String(v))).join(', ')})`;
}
