import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateModel } from '../src/validate.js';

const base = () => ({
  places: [{ name: 'P0' }, { name: 'V' }],
  initial: ['1', '0'],
  hazards: { V: '2' },
  transitions: [
    { id: 'a', rows: [{ consume: '0', produce: '1' }, { consume: '0', produce: '0' }] },
  ],
});

test('合法模型通过', () => {
  const r = validateModel(base());
  assert.equal(r.ok, true);
  assert.equal(r.model.places.length, 2);
  assert.deepEqual(r.model.hazards[0], { place: 'V', index: 1, threshold: 2 });
});

test('重复迁移标识、重复库所名被报告', () => {
  const d = base();
  d.transitions.push({ id: 'a', rows: [{ consume: '1', produce: '0' }, { consume: '0', produce: '1' }] });
  d.places = [{ name: 'P0' }, { name: 'P0' }];
  const r = validateModel(d);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.scope === 'transitions' && /重复/.test(e.message)));
  assert.ok(r.errors.some((e) => e.scope === 'places' && /重复/.test(e.message)));
});

test('全零迁移被禁', () => {
  const d = base();
  d.transitions[0] = { id: 'z', rows: [{ consume: '0', produce: '0' }, { consume: '0', produce: '0' }] };
  const r = validateModel(d);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /全零迁移/.test(e.message)));
});

test('悬空引用：危险库所不存在、迁移行数不符', () => {
  const d = base();
  d.hazards = { GHOST: '1' };
  d.transitions[0].rows = [{ consume: '0', produce: '1' }]; // 少一行
  const r = validateModel(d);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.scope === 'hazards' && /悬空/.test(e.message)));
  assert.ok(r.errors.some((e) => /行数/.test(e.message)));
});

test('非法初始值与危险阈值合并反馈，不做遇错即停', () => {
  const d = base();
  d.initial = ['x', '-3'];
  d.hazards = { V: 'abc' };
  const r = validateModel(d);
  assert.equal(r.ok, false);
  const scopes = new Set(r.errors.map((e) => e.scope));
  assert.ok(scopes.has('initial'));
  assert.ok(scopes.has('hazards'));
  assert.ok(r.errors.length >= 2, '所有问题应合并返回');
});

test('危险阈值 0 被视为非法（恒满足，不构成危险下限）', () => {
  const d = base();
  d.hazards = { V: '0' };
  const r = validateModel(d);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /必须大于 0/.test(e.message)));
});

test('无危险库所时要求至少一个阈值', () => {
  const d = base();
  d.hazards = {};
  const r = validateModel(d);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.scope === 'hazards' && /至少/.test(e.message)));
});

test('超过 7 库所 / 10 迁移报错', () => {
  const d = {
    places: Array.from({ length: 8 }, (_, i) => ({ name: `p${i}` })),
    initial: Array(8).fill('0'),
    hazards: { p0: '1' },
    transitions: [
      {
        id: 'only',
        rows: Array.from({ length: 8 }, (_, i) => ({
          consume: i === 0 ? '1' : '0',
          produce: i === 1 ? '1' : '0',
        })),
      },
    ],
  };
  const r = validateModel(d);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /不能超过 7/.test(e.message)));

  const d2 = base();
  d2.places = [{ name: 'p' }];
  d2.initial = ['0'];
  d2.hazards = { p: '1' };
  d2.transitions = Array.from({ length: 11 }, (_, i) => ({
    id: `t${i}`,
    rows: [{ consume: '0', produce: i === 0 ? '1' : '0' }],
  }));
  const r2 = validateModel(d2);
  assert.equal(r2.ok, false);
  assert.ok(r2.errors.some((e) => /不能超过 10/.test(e.message)));
});

test('迁移标识为空、库所名为空、负数小数值均被报告', () => {
  const d = base();
  d.places = [{ name: '' }, { name: 'V' }];
  d.transitions[0].id = '   ';
  d.initial = ['1.5', '0'];
  const r = validateModel(d);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.scope === 'places' && /名称为空/.test(e.message)));
  assert.ok(r.errors.some((e) => e.scope === 'transitions' && /标识为空/.test(e.message)));
  assert.ok(r.errors.some((e) => e.scope === 'initial'));
});
