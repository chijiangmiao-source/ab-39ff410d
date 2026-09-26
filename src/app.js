// 前端交互：动态录入、草稿收集、审计调用、结论/证据渲染、清空。
import { runAudit } from './audit.js';
import { renderResult, renderErrorList } from './render.js';

const MAX_PLACES = 7;
const MAX_TRANSITIONS = 10;

const state = {
  places: [], // { name, initial, hazard }
  transitions: [], // { id, rows: [{consume, produce}] 按 places 索引 }
};

const $ = (sel) => document.querySelector(sel);
const placeBody = $('#placeBody');
const transitionList = $('#transitionList');
const errorPanel = $('#errorPanel');
const errorList = $('#errorList');
const resultPanel = $('#resultPanel');

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- 录入模型增删 ----------
function addPlace(name = '', initial = '', hazard = '') {
  if (state.places.length >= MAX_PLACES) return;
  state.places.push({ name, initial, hazard });
  state.transitions.forEach((t) => t.rows.push({ consume: '0', produce: '0' }));
  render();
}

function removePlace(idx) {
  state.places.splice(idx, 1);
  state.transitions.forEach((t) => t.rows.splice(idx, 1));
  render();
}

function addTransition(id = '') {
  if (state.transitions.length >= MAX_TRANSITIONS) return;
  state.transitions.push({
    id,
    rows: state.places.map(() => ({ consume: '0', produce: '0' })),
  });
  render();
}

function removeTransition(idx) {
  state.transitions.splice(idx, 1);
  render();
}

// ---------- 渲染编辑器 ----------
function render() {
  placeBody.innerHTML = '';
  state.places.forEach((p, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input data-k="name" data-pi="${i}" type="text" value="${escapeHtml(p.name)}" placeholder="如：阀位 V1 / 屏蔽 S / 许可 P"></td>
      <td><input data-k="initial" data-pi="${i}" type="text" inputmode="numeric" value="${escapeHtml(p.initial)}" placeholder="0"></td>
      <td><input data-k="hazard" data-pi="${i}" type="text" inputmode="numeric" value="${escapeHtml(p.hazard)}" placeholder="留空"></td>
      <td><button type="button" class="btn mini" data-del-place="${i}">删除</button></td>`;
    placeBody.appendChild(tr);
  });

  transitionList.innerHTML = '';
  state.transitions.forEach((t, ti) => {
    const card = document.createElement('div');
    card.className = 'transition-card';
    const rowsHtml = state.places
      .map(
        (p, pi) => `
        <tr>
          <td>${escapeHtml(p.name || `库所 ${pi + 1}`)}</td>
          <td><input class="num-input" data-k="consume" data-ti="${ti}" data-pi="${pi}" type="text" inputmode="numeric" value="${escapeHtml(t.rows[pi]?.consume ?? '0')}"></td>
          <td><input class="num-input" data-k="produce" data-ti="${ti}" data-pi="${pi}" type="text" inputmode="numeric" value="${escapeHtml(t.rows[pi]?.produce ?? '0')}"></td>
        </tr>`,
      )
      .join('');
    card.innerHTML = `
      <div class="transition-head">
        <label>迁移标识</label>
        <input data-k="tid" data-ti="${ti}" type="text" value="${escapeHtml(t.id)}" placeholder="唯一，如 t_open_v1">
        <button type="button" class="btn mini" data-del-tr="${ti}">删除迁移</button>
      </div>
      <div class="transition-body table-scroll">
        <table>
          <thead><tr><th>库所</th><th>消耗</th><th>产生</th></tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>`;
    transitionList.appendChild(card);
  });

  $('#addPlace').disabled = state.places.length >= MAX_PLACES;
  $('#addTransition').disabled = state.transitions.length >= MAX_TRANSITIONS;
}

// 事件委托：输入实时同步回 state
document.addEventListener('input', (e) => {
  const el = e.target;
  const k = el.dataset?.k;
  if (!k) return;
  if (k === 'tid') {
    state.transitions[Number(el.dataset.ti)].id = el.value;
    return;
  }
  const pi = Number(el.dataset.pi);
  if (k === 'name' || k === 'initial' || k === 'hazard') {
    state.places[pi][k] = el.value;
    return;
  }
  if (k === 'consume' || k === 'produce') {
    const ti = Number(el.dataset.ti);
    state.transitions[ti].rows[pi][k] = el.value;
  }
});

document.addEventListener('click', (e) => {
  const dp = e.target?.dataset?.delPlace;
  if (dp !== undefined) {
    removePlace(Number(dp));
    return;
  }
  const dt = e.target?.dataset?.delTr;
  if (dt !== undefined) {
    removeTransition(Number(dt));
  }
});

$('#addPlace').addEventListener('click', () => addPlace());
$('#addTransition').addEventListener('click', () => addTransition());

// ---------- 草稿收集 ----------
function collectDraft() {
  const places = state.places.map((p) => ({ name: p.name }));
  const initial = state.places.map((p) => p.initial);
  const hazards = {};
  state.places.forEach((p) => {
    if (p.hazard.trim() !== '') hazards[p.name.trim()] = p.hazard;
  });
  const transitions = state.transitions.map((t) => ({
    id: t.id,
    rows: t.rows.map((r) => ({ consume: r.consume, produce: r.produce })),
  }));
  return { places, transitions, initial, hazards };
}

// ---------- 结论清除 / 错误展示 ----------
function removeConclusion() {
  resultPanel.hidden = true;
  resultPanel.innerHTML = '';
}

function showErrors(errors) {
  removeConclusion(); // 任何非法输入都立即移除旧结论
  errorList.innerHTML = renderErrorList(errors);
  errorPanel.hidden = false;
}

function hideErrors() {
  errorPanel.hidden = true;
  errorList.innerHTML = '';
}

// ---------- 审计 / 清空 ----------
$('#auditBtn').addEventListener('click', () => {
  const draft = collectDraft();
  const result = runAudit(draft);
  if (!result.ok) {
    showErrors(result.errors);
    return;
  }
  hideErrors();
  removeConclusion();
  resultPanel.innerHTML = renderResult(result.audit);
  resultPanel.hidden = false;
});

$('#clearBtn').addEventListener('click', () => {
  state.places = [];
  state.transitions = [];
  hideErrors();
  removeConclusion();
  render();
});

// ---------- 样例 ----------
function loadDraft(draft) {
  state.places = draft.places.map((p, i) => ({
    name: p.name,
    initial: draft.initial[i],
    hazard: draft.hazards[p.name] ?? '',
  }));
  state.transitions = draft.transitions.map((t) => ({
    id: t.id,
    rows: t.rows.map((r) => ({ consume: String(r.consume), produce: String(r.produce) })),
  }));
  hideErrors();
  removeConclusion();
  render();
}

// 可覆盖：许可 P0 在“工作位 W”间循环，每循环一次阀位计数 V 净 +1（V 无界）；
// 另有 P0↔S 摆动分支（屏蔽桶计数 S 有界）。初始 (1,0,0,0)，危险 V≥3 ⇒ 可覆盖。
const coverableSample = {
  places: [{ name: 'P0' }, { name: 'W' }, { name: 'V' }, { name: 'S' }],
  initial: ['1', '0', '0', '0'],
  hazards: { V: '3' },
  transitions: [
    { id: 't_a', rows: [{ consume: 1, produce: 0 }, { consume: 0, produce: 1 }, { consume: 0, produce: 1 }, { consume: 0, produce: 0 }] },
    { id: 't_b', rows: [{ consume: 0, produce: 1 }, { consume: 1, produce: 0 }, { consume: 0, produce: 0 }, { consume: 0, produce: 0 }] },
    { id: 't_c', rows: [{ consume: 1, produce: 0 }, { consume: 0, produce: 0 }, { consume: 0, produce: 0 }, { consume: 0, produce: 1 }] },
    { id: 't_d', rows: [{ consume: 0, produce: 1 }, { consume: 0, produce: 0 }, { consume: 0, produce: 0 }, { consume: 1, produce: 0 }] },
  ],
};

// 不可覆盖：资源 R 初始 2，两个转运位 A、B 来回借用归还；R+A+B 恒为 2，
// 危险 A≥3 永不成立。
const uncoverableSample = {
  places: [{ name: 'R' }, { name: 'A' }, { name: 'B' }],
  initial: ['2', '0', '0'],
  hazards: { A: '3' },
  transitions: [
    { id: 't1', rows: [{ consume: 1, produce: 0 }, { consume: 0, produce: 1 }, { consume: 0, produce: 0 }] },
    { id: 't2', rows: [{ consume: 0, produce: 1 }, { consume: 1, produce: 0 }, { consume: 0, produce: 0 }] },
    { id: 't3', rows: [{ consume: 1, produce: 0 }, { consume: 0, produce: 0 }, { consume: 0, produce: 1 }] },
    { id: 't4', rows: [{ consume: 0, produce: 1 }, { consume: 0, produce: 0 }, { consume: 1, produce: 0 }] },
  ],
};

$('#loadCoverable').addEventListener('click', () => loadDraft(coverableSample));
$('#loadUncoverable').addEventListener('click', () => loadDraft(uncoverableSample));

// 初始给一个最小可录结构
addPlace('P0', '1', '');
addPlace('V', '0', '2');
