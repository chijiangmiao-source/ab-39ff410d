// 录入数据校验：所有问题一次性合并返回，不做“遇错即停”。
// 输入为页面草稿对象：
// {
//   places: [{ name }],                       // 至多 7 个库所
//   transitions: [{ id, rows: [{consume, produce}] }], // 至多 10 条迁移
//   initial: string[],                        // 每个库所的初始令牌（字符串原样）
//   hazards: { [placeName]: string }          // 危险库所最低令牌数（字符串原样）
// }
//
// 返回 { ok, errors: [{scope, ref, message}], model }
// model 在 ok 时为规整后的数据：
// { places: string[], initial: number[],
//   transitions: [{id, consume:number[], produce:number[]}],
//   hazards: [{ place, index, threshold }] }

const MAX_PLACES = 7;
const MAX_TRANSITIONS = 10;

const isNonNegInt = (s) => {
  if (typeof s !== 'string') return false;
  const t = s.trim();
  if (!/^\d+$/.test(t)) return false;
  return Number.isSafeInteger(Number(t));
};

export function validateModel(draft) {
  const errors = [];
  const push = (scope, ref, message) => errors.push({ scope, ref, message });

  const rawPlaces = Array.isArray(draft?.places) ? draft.places : [];
  const rawTransitions = Array.isArray(draft?.transitions) ? draft.transitions : [];
  const rawInitial = Array.isArray(draft?.initial) ? draft.initial : [];
  const rawHazards = draft?.hazards && typeof draft.hazards === 'object' ? draft.hazards : {};

  // ---- 库所 --------------------------------------------------------------
  const placeNames = [];
  if (rawPlaces.length === 0) {
    push('places', null, '至少需要一个库所');
  }
  if (rawPlaces.length > MAX_PLACES) {
    push('places', null, `库所数量不能超过 ${MAX_PLACES} 个（当前 ${rawPlaces.length} 个）`);
  }

  const placeIndex = new Map();
  rawPlaces.forEach((p, i) => {
    const name = typeof p?.name === 'string' ? p.name.trim() : '';
    if (!name) {
      push('places', String(i), `第 ${i + 1} 个库所名称为空`);
      return;
    }
    if (placeIndex.has(name)) {
      push('places', name, `库所名称重复：“${name}”`);
    } else {
      placeNames.push(name);
    }
    // 重复名称仍登记首次出现的位置，供其他校验定位
    if (!placeIndex.has(name)) placeIndex.set(name, i);
  });

  // ---- 迁移 --------------------------------------------------------------
  if (rawTransitions.length === 0) {
    push('transitions', null, '至少需要一条迁移');
  }
  if (rawTransitions.length > MAX_TRANSITIONS) {
    push('transitions', null, `迁移数量不能超过 ${MAX_TRANSITIONS} 条（当前 ${rawTransitions.length} 条）`);
  }

  const seenIds = new Set();
  const transitions = [];

  rawTransitions.forEach((tr, ti) => {
    const id = typeof tr?.id === 'string' ? tr.id.trim() : '';
    const ref = id || `#${ti + 1}`;
    let idOk = true;
    if (!id) {
      push('transitions', ref, `第 ${ti + 1} 条迁移标识为空`);
      idOk = false;
    } else if (seenIds.has(id)) {
      push('transitions', id, `迁移标识重复：“${id}”`);
      idOk = false;
    } else {
      seenIds.add(id);
    }

    const rows = Array.isArray(tr?.rows) ? tr.rows : [];
    const consume = new Array(Math.max(rawPlaces.length, 0)).fill(0);
    const produce = new Array(Math.max(rawPlaces.length, 0)).fill(0);
    let allZero = true;

    if (rows.length !== rawPlaces.length) {
      // 行数与库所数不符属于结构错误（悬空引用的防御性处理）
      push('transitions', ref, `迁移“${ref}”的库所行数（${rows.length}）与库所数量（${rawPlaces.length}）不一致`);
    }

    rows.forEach((row, pi) => {
      if (pi >= rawPlaces.length) {
        push('transitions', ref, `迁移“${ref}”引用了不存在的库所行号 ${pi + 1}（悬空引用）`);
        return;
      }
      const c = row?.consume;
      const p = row?.produce;
      if (!isNonNegInt(c ?? '')) {
        push('transitions', ref, `迁移“${ref}”在库所 ${pi + 1} 的消耗量不是非负整数`);
      } else {
        consume[pi] = Number(c.trim());
        if (consume[pi] !== 0) allZero = false;
      }
      if (!isNonNegInt(p ?? '')) {
        push('transitions', ref, `迁移“${ref}”在库所 ${pi + 1} 的产生量不是非负整数`);
      } else {
        produce[pi] = Number(p.trim());
        if (produce[pi] !== 0) allZero = false;
      }
    });

    if (idOk && rows.length === rawPlaces.length && allZero && rows.length > 0) {
      push('transitions', ref, `迁移“${id}”在所有库所上消耗与产生均为 0（全零迁移无意义，禁止）`);
    }

    if (idOk) transitions.push({ id, consume, produce });
  });

  // ---- 初始令牌 ----------------------------------------------------------
  const initial = new Array(rawPlaces.length).fill(0);
  rawPlaces.forEach((p, i) => {
    const s = rawInitial[i];
    if (!isNonNegInt(s ?? '')) {
      const label = typeof p?.name === 'string' && p.name.trim() ? p.name.trim() : `#${i + 1}`;
      push('initial', label, `库所“${label}”的初始令牌数不是非负整数`);
    } else {
      initial[i] = Number(s.trim());
    }
  });

  // ---- 危险下限 ----------------------------------------------------------
  const hazards = [];
  if (rawHazards === null || typeof rawHazards !== 'object' || Array.isArray(rawHazards)) {
    push('hazards', null, '危险下限数据格式非法');
  } else {
    for (const [name, rawVal] of Object.entries(rawHazards)) {
      if (!placeIndex.has(name)) {
        push('hazards', name, `危险下限引用了不存在的库所：“${name}”（悬空引用）`);
        continue;
      }
      if (!isNonNegInt(rawVal ?? '')) {
        push('hazards', name, `危险库所“${name}”的最低令牌数不是非负整数`);
        continue;
      }
      const v = Number(rawVal.trim());
      if (v === 0) {
        push('hazards', name, `危险库所“${name}”的最低令牌数必须大于 0（阈值 0 恒被满足，不是危险下限）`);
        continue;
      }
      hazards.push({ place: name, index: placeIndex.get(name), threshold: v });
    }
    if (hazards.length === 0 && !errors.some((e) => e.scope === 'hazards')) {
      push('hazards', null, '至少需要声明一个危险库所的最低令牌数');
    }
  }

  if (errors.length > 0) return { ok: false, errors, model: null };

  return {
    ok: true,
    errors: [],
    model: { places: placeNames, initial, transitions, hazards },
  };
}

export { MAX_PLACES, MAX_TRANSITIONS };
