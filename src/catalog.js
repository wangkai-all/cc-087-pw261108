// 核心目录逻辑：按商品主键合并多语言条目、冲突检测、回退解析与来源标注
// 纯函数模块，不依赖 DOM，可直接在 Node 测试中引用
import { LANGUAGES, FALLBACK_CHAIN, DEFAULT_LANGUAGE } from './languages.js';

export const FIELDS = [
  { key: 'title', label: '标题' },
  { key: 'description', label: '描述' },
  { key: 'unit', label: '单位' },
  { key: 'category', label: '类目' },
];
export const FIELD_KEYS = FIELDS.map((f) => f.key);

const EMPTY = (v) => v === undefined || v === null || String(v).trim() === '';

/**
 * 按 productId 分组，再按 language 合并同语种多版本。
 * 同字段出现两个及以上不同非空值 → 冲突，进入待处理，绝不随机挑选。
 */
export function buildCatalog(rawEntries) {
  const grouped = new Map();
  for (const e of rawEntries) {
    if (!grouped.has(e.productId)) grouped.set(e.productId, new Map());
    const byLang = grouped.get(e.productId);
    if (!byLang.has(e.language)) byLang.set(e.language, []);
    byLang.get(e.language).push(e);
  }

  const products = [...grouped.entries()].map(([productId, byLang]) => {
    const entries = {};
    for (const [lang, list] of byLang) {
      const sorted = [...list].sort((a, b) => String(a.version).localeCompare(String(b.version)));
      const fields = {};
      const conflicts = {};
      const locked = sorted.some((e) => e.locked === true);

      for (const field of FIELD_KEYS) {
        const distinct = [];
        for (const e of sorted) {
          if (EMPTY(e[field])) continue;
          if (!distinct.some((d) => d.value === e[field])) {
            distinct.push({ value: e[field], version: e.version });
          }
        }
        if (distinct.length > 1) {
          conflicts[field] = { options: distinct, versions: sorted.map((e) => e.version) };
          fields[field] = ''; // 冲突未裁定前视为无可用值
        } else {
          fields[field] = distinct.length === 1 ? distinct[0].value : '';
        }
      }
      entries[lang] = { fields, conflicts, locked, versions: sorted.map((e) => e.version) };
    }
    return { productId, entries };
  });

  products.sort((a, b) => a.productId.localeCompare(b.productId));
  return { products };
}

/** 商品是否存在未裁定的同语言冲突（任意语种、任意字段） */
export function hasUnresolvedConflict(product, resolutions = {}) {
  const r = resolutions[product.productId] || {};
  for (const [lang, entry] of Object.entries(product.entries)) {
    const decided = r[lang] || {};
    for (const field of Object.keys(entry.conflicts)) {
      if (!decided[field]) return true;
    }
  }
  return false;
}

export function getConflictCount(product, resolutions = {}) {
  const r = resolutions[product.productId] || {};
  let n = 0;
  for (const [lang, entry] of Object.entries(product.entries)) {
    const decided = r[lang] || {};
    for (const field of Object.keys(entry.conflicts)) {
      if (!decided[field]) n += 1;
    }
  }
  return n;
}

/** 回退链：合并语种配置链、市场默认语种、全局默认语种，去重并限定在市场支持的语種内 */
export function fallbackChainFor(lang, market) {
  const chain = [
    ...(FALLBACK_CHAIN[lang] || []),
    market.defaultLanguage,
    DEFAULT_LANGUAGE,
  ].filter((l, i, arr) => l && l !== lang && arr.indexOf(l) === i);
  return chain.filter((l) => market.languages.includes(l));
}

/**
 * 解析某商品在指定市场、指定语种下四个字段的最终内容。
 * state = { edits: {pid: {lang: {field: {value, locked}}}}, resolutions: {pid: {lang: {field: {value, version}}}} }
 *
 * 优先级：人工译文（含锁定） > 冲突人工裁定 > 本语种原文 > 回退链首个非空值 > 缺失
 * 回退只填补空字段；本语种锁定留空时禁止回退；冲突未裁定不参与任何自动选择。
 */
export function resolveProduct(product, lang, market, state = {}) {
  const edits = (state.edits?.[product.productId]?.[lang]) || {};
  const resolutions = (state.resolutions?.[product.productId]?.[lang]) || {};
  const merged = product.entries[lang];

  function lookupAt(useLang, field) {
    const override = state.edits?.[product.productId]?.[useLang]?.[field];
    if (override) {
      const v = override.value ?? '';
      // 人工编辑始终优先；人工清空等同锁定留空，回退不得写入
      return EMPTY(v)
        ? { value: '', source: 'manual', sourceLang: useLang, locked: true, lockedEmpty: true }
        : { value: v, source: 'manual', sourceLang: useLang, locked: true };
    }
    const entry = product.entries[useLang];
    if (!entry) return null;

    if (entry.conflicts[field]) {
      const decision = state.resolutions?.[product.productId]?.[useLang]?.[field];
      if (decision) {
        return { value: decision.value, source: 'resolved', sourceLang: useLang, version: decision.version };
      }
      return { value: null, source: 'conflict', sourceLang: useLang, conflict: true };
    }

    const v = entry.fields[field];
    if (!EMPTY(v)) return { value: v, source: 'own', sourceLang: useLang };
    if (entry.locked) return { value: null, source: 'locked-empty', sourceLang: useLang, lockedEmpty: true };
    return null;
  }

  const result = {};
  for (const field of FIELD_KEYS) {
    let r = lookupAt(lang, field);
    const blocked = Boolean(r) && (r.conflict || r.lockedEmpty);
    if ((!r || EMPTY(r.value)) && !blocked) {
      for (const fbLang of fallbackChainFor(lang, market)) {
        const cand = lookupAt(fbLang, field);
        if (cand && !cand.conflict && !cand.lockedEmpty && !EMPTY(cand.value)) {
          r = { ...cand, isFallback: true };
          break;
        }
      }
    }

    if (!r) r = { value: '', source: 'missing', sourceLang: null };
    if (r.conflict || r.lockedEmpty || r.value === null || r.value === undefined) {
      r = { ...r, value: '' };
    }

    // 类目：保留原始 code，按市场映射；映射缺失时提示原值，不静默丢弃
    if (field === 'category' && r.value) {
      const mapped = market.categoryMap[r.value];
      r.category = { code: r.value, mapped: mapped ?? null, missingMap: mapped === undefined };
    }
    result[field] = r;
  }

  // 本语种合并条目是否处于锁定状态（供 UI 标识）
  result._meta = {
    mergedExists: Boolean(merged),
    locked: Boolean(merged?.locked),
    conflictFields: merged ? Object.keys(merged.conflicts) : [],
  };
  return result;
}

export const SOURCE_LABELS = {
  manual: '人工译文',
  own: '本语种原文',
  fallback: '回退',
  resolved: '冲突已裁定',
  conflict: '同语言冲突',
  'locked-empty': '人工锁定（留空）',
  missing: '缺失',
};

export function sourceLabel(resolved) {
  const langName = resolved.sourceLang
    ? LANGUAGES[resolved.sourceLang]?.nativeLabel || resolved.sourceLang
    : null;
  if (resolved.source === 'missing' || resolved.source === 'fallback') {
    return SOURCE_LABELS[resolved.source];
  }
  const base = SOURCE_LABELS[resolved.source] || resolved.source;
  if (resolved.isFallback && langName) return `回退·${langName}（${base}）`;
  if (langName && (resolved.source === 'manual' || resolved.source === 'resolved')) {
    return `${base}·${langName}`;
  }
  return base;
}
