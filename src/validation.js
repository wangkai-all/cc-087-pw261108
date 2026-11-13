// 按市场规则校验解析后的最终内容：缺译、长度超限、禁用词、单位不允许、类目映射缺失
// 所有规则均取自所选市场配置，切换市场后重新计算
import { FIELD_KEYS } from './catalog.js';

export const ISSUE_TYPES = {
  missing: { key: 'missing', label: '缺译', level: 'error' },
  length: { key: 'length', label: '长度超限', level: 'error' },
  banned: { key: 'banned', label: '禁用词', level: 'error' },
  unit: { key: 'unit', label: '单位不允许', level: 'warn' },
  category: { key: 'category', label: '类目映射缺失', level: 'warn' },
};

// 长度按 Unicode 码点计算，避免代理对/emoji 计数偏差
export const textLength = (s) => (s ? Array.from(String(s)).length : 0);

function findBanned(text, words) {
  const lower = String(text).toLowerCase();
  return words.filter((w) => lower.includes(w.toLowerCase()));
}

/**
 * 对单个商品、单个语种的解析结果做校验。
 * 返回 [{ type, field, message }]
 */
export function validateResolved(resolved, market) {
  const issues = [];
  for (const field of FIELD_KEYS) {
    const cell = resolved[field];
    const value = cell.value || '';

    // 冲突未裁定 / 人工锁定留空 / 完全缺失
    if (cell.conflict) {
      issues.push({ type: 'missing', field, message: '同语言多版本冲突待处理' });
      continue;
    }
    if (!value) {
      if (cell.lockedEmpty) {
        issues.push({ type: 'missing', field, message: '人工锁定为空，无法回退' });
      } else {
        issues.push({ type: 'missing', field, message: '字段缺失且回退链无可用值' });
      }
      continue;
    }

    if (field === 'title' || field === 'description') {
      const limit = market.limits[field];
      const len = textLength(value);
      if (len > limit) {
        issues.push({
          type: 'length',
          field,
          message: `${len} 字，超出 ${market.code} 市场上限 ${limit} 字`,
        });
      }
      const hit = findBanned(value, market.bannedWords);
      if (hit.length) {
        issues.push({ type: 'banned', field, message: `命中禁用词：${hit.join('、')}` });
      }
    }

    if (field === 'unit' && !market.units.includes(value)) {
      issues.push({
        type: 'unit',
        field,
        message: `单位「${value}」不在 ${market.code} 允许单位列表内`,
      });
    }

    if (field === 'category' && cell.category?.missingMap) {
      issues.push({
        type: 'category',
        field,
        message: `类目原值「${cell.category.code}」在 ${market.code} 市场无映射`,
      });
    }
  }
  return issues;
}

/** 计算某市场下全部商品（各语种）的问题，便于筛选与统计 */
export function validateAll(catalog, market, state, resolveProduct) {
  const out = {};
  for (const product of catalog.products) {
    out[product.productId] = {};
    for (const lang of market.languages) {
      const resolved = resolveProduct(product, lang, market, state);
      out[product.productId][lang] = validateResolved(resolved, market);
    }
  }
  return out;
}

export function issueTypesOf(issues) {
  return [...new Set(issues.map((i) => i.type))];
}
