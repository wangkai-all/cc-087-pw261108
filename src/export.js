// 导出市场文件：仅包含所选市场支持的语种；带未裁定冲突的商品剔除并列出；
// 文件头标明目录版本、市场版本规则与生成时间，保证可追溯。
import { resolveProduct, hasUnresolvedConflict } from './catalog.js';
import { validateResolved } from './validation.js';
import { CATALOG_VERSION } from './markets.js';

export function buildMarketFile(catalog, market, state, generatedAt = new Date().toISOString()) {
  const items = [];
  const skipped = [];

  for (const product of catalog.products) {
    if (hasUnresolvedConflict(product, state.resolutions)) {
      skipped.push({ productId: product.productId, reason: '同语言多版本冲突未裁定' });
      continue;
    }
    const localizations = {};
    for (const lang of market.languages) {
      const resolved = resolveProduct(product, lang, market, state);
      const category = resolved.category;
      localizations[lang] = {
        title: resolved.title.value,
        description: resolved.description.value,
        unit: resolved.unit.value,
        category: {
          code: category.value || null,
          label: category.category?.mapped ?? null,
          mappingMissing: Boolean(category.category?.missingMap),
        },
        sources: {
          title: resolved.title.source,
          description: resolved.description.source,
          unit: resolved.unit.source,
          category: resolved.category.source,
        },
        issues: validateResolved(resolved, market),
      };
    }
    items.push({ productId: product.productId, localizations });
  }

  return {
    catalogVersion: CATALOG_VERSION,
    market: market.code,
    marketName: market.name,
    rules: {
      languages: market.languages,
      defaultLanguage: market.defaultLanguage,
      units: market.units,
      limits: market.limits,
      bannedWords: market.bannedWords,
    },
    generatedAt,
    productCount: items.length,
    skippedCount: skipped.length,
    skipped,
    items,
  };
}

/** 浏览器端触发下载 */
export function downloadMarketFile(payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `catalog-${payload.market}-${payload.catalogVersion}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
