// 结论/错误渲染为 HTML 字符串的纯函数层（不接触 DOM），便于离线测试。
// 所有动态文本经 escapeHtml 转义；ω 单独高亮。

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// 标记数组 -> HTML，ω 紫色高亮
export function renderMarking(m) {
  return '(' + m.map((v) => (v === 'ω' ? '<span class="omega">ω</span>' : escapeHtml(v))).join(', ') + ')';
}

// "(1, ω, 0)" 文本 -> 安全 HTML（保留 ω 高亮）
export function renderMarkingText(text) {
  return escapeHtml(text).replace(/ω/g, '<span class="omega">ω</span>');
}

export function statsHtml(stats) {
  return `<div class="stats-row">
    <span class="stat">规范树节点 <b>${stats.nodes}</b></span>
    <span class="stat">边 <b>${stats.edges}</b></span>
    <span class="stat">祖先加速 <b>${stats.accelerations}</b></span>
    <span class="stat">写入 ω 分量 <b>${stats.omegaWrites}</b></span>
    <span class="stat">支配剪枝叶 <b>${stats.pruned}</b></span>
    <span class="stat">死锁叶 <b>${stats.deadlocks}</b></span>
  </div>`;
}

export function renderErrorList(errors) {
  const scopeLabel = {
    places: '库所',
    transitions: '迁移',
    initial: '初始令牌',
    hazards: '危险下限',
  };
  return errors
    .map(
      (err) =>
        `<li><span class="error-scope">[${scopeLabel[err.scope] || err.scope}${
          err.ref ? `: ${escapeHtml(err.ref)}` : ''
        }]</span>${escapeHtml(err.message)}</li>`,
    )
    .join('');
}

function renderCoverable(a) {
  const ev = a.evidence;

  const pathSafe = ev.path
    .map(
      (s) =>
        `<li>${escapeHtml(s.edge)} → 标记 ${renderMarkingText(s.markingText)}${
          s.accelerated
            ? `<span class="tag accel">祖先加速↑ω（祖先 ${escapeHtml(s.acceleratedFrom)}，加速前 ${renderMarkingText(s.rawMarkingText)}）</span>`
            : ''
        }</li>`,
    )
    .join('');

  const chain = ev.accelerationChain.length
    ? ev.accelerationChain
        .map(
          (c) =>
            `<li><span class="leaf-path">${escapeHtml(c.edge)}</span>：祖先节点 <b>${escapeHtml(c.ancestor)}</b> 的标记严格小于触发后标记 ${renderMarkingText(c.rawMarking)} → 增大分量写入 <span class="omega">ω</span>，得 ${renderMarkingText(c.finalMarking)}</li>`,
        )
        .join('')
    : '<li>本证据路径未发生 ω 加速（有限步内即覆盖）。</li>';

  const hazardText = a.hazards.map((h) => `${escapeHtml(h.place)}≥${h.threshold}`).join(' 且 ');

  return `
    <div class="verdict danger">
      <h2>⚠ 结论：危险下限<b>可被覆盖</b> —— 不得判定安全</h2>
      <p>存在可达（或被无界分量 ω 覆盖）的标记，同时满足：${hazardText}。有限回放未触发不代表安全。</p>
    </div>
    <div class="ev-grid">
      <div class="ev-box">
        <h3>覆盖节点</h3>
        <div class="kv">
          <div><span class="k">节点标识</span>${escapeHtml(ev.node.id)}（深度 ${ev.node.depth}）</div>
          <div><span class="k">节点标记</span><span class="marking">${renderMarking(ev.node.marking)}</span></div>
          <div><span class="k">危险目标向量</span><span class="marking">${renderMarkingText(a.targetText)}</span></div>
          <div><span class="k">库所顺序</span>${escapeHtml(a.places.join(', '))}</div>
        </div>
      </div>
      <div class="ev-box">
        <h3>逐迁移符号标识路径（根 → 覆盖节点）</h3>
        <ol class="path-list">${pathSafe}</ol>
      </div>
    </div>
    <div class="ev-box" style="margin-top:16px">
      <h3>祖先加速链（ω 提升证据）</h3>
      <ol class="path-list">${chain}</ol>
    </div>
    <div class="ev-box" style="margin-top:16px">
      <h3>覆盖树统计</h3>${statsHtml(a.stats)}
    </div>`;
}

function renderUncoverable(a) {
  const t = a.closedTree;
  const hazardText = a.hazards.map((h) => `${escapeHtml(h.place)}≥${h.threshold}`).join(' 且 ');
  const leavesRows = t.leaves
    .map(
      (l) => `<tr>
        <td>${escapeHtml(l.id)}</td>
        <td class="mark">${renderMarkingText(l.markingText)}</td>
        <td class="leaf-path">${escapeHtml(l.pathText)}</td>
        <td>${l.kind === 'pruned' ? '<span class="tag prune">支配剪枝</span>' : '<span class="tag dead">死锁</span>'}</td>
        <td class="leaf-detail">${escapeHtml(
          l.kind === 'pruned'
            ? `被节点 ${l.detail.dominatedBy} 逐分量支配。${l.detail.reason ?? ''}`
            : l.detail.reason,
        )}</td>
      </tr>`,
    )
    .join('');

  return `
    <div class="verdict safe">
      <h2>✓ 结论：危险下限不可覆盖</h2>
      <p>规范（有限闭合）Karp–Miller 覆盖树中不存在覆盖目标（${hazardText}）的节点；全部叶子已闭合，可据此判定该组下限不会同时被满足。</p>
    </div>
    <div class="ev-box">
      <h3>已闭合规范树摘要（按迁移标识稳定展开）</h3>
      <pre class="tree">${renderMarkingText(t.ascii)}</pre>
      ${statsHtml(a.stats)}
    </div>
    <div class="ev-box" style="margin-top:16px">
      <h3>全部叶子的闭合原因</h3>
      <div class="table-scroll">
        <table class="leaf-table">
          <thead><tr><th>叶子</th><th>标记</th><th>迁移路径</th><th>类型</th><th>剪枝 / 死锁原因</th></tr></thead>
          <tbody>${leavesRows}</tbody>
        </table>
      </div>
    </div>`;
}

export function renderResult(audit) {
  return audit.coverable ? renderCoverable(audit) : renderUncoverable(audit);
}
