// 纯逻辑测试：node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MARKETS } from '../src/markets.js';
import { RAW_ENTRIES } from '../src/sample-data.js';
import {
  buildCatalog, resolveProduct, hasUnresolvedConflict, getConflictCount,
  fallbackChainFor, FIELD_KEYS,
} from '../src/catalog.js';
import { validateResolved, textLength } from '../src/validation.js';
import { planBatchEdit, applyBatchEdit } from '../src/batch.js';
import { buildMarketFile } from '../src/export.js';

const catalog = buildCatalog(RAW_ENTRIES);
const product = (id) => catalog.products.find((p) => p.productId === id);
const emptyState = { edits: {}, resolutions: {} };

test('按主键合并：8 个商品，每商品按语种归并', () => {
  assert.equal(catalog.products.length, 8);
  const p1 = product('P001');
  assert.deepEqual(Object.keys(p1.entries).sort(), ['en', 'ja', 'zh']);
  assert.equal(p1.entries.en.fields.title, 'Stainless Steel Vacuum Bottle 500ml');
});

test('同语言多版本冲突进入待处理，且不随机选值', () => {
  const p4 = product('P004');
  assert.ok(p4.entries.en.conflicts.title, '英语标题应标记冲突');
  assert.ok(p4.entries.en.conflicts.description, '英语描述应标记冲突');
  assert.equal(p4.entries.en.fields.title, '', '冲突字段在裁定前必须为空');
  assert.equal(hasUnresolvedConflict(p4, {}), true);
  assert.equal(getConflictCount(p4, {}), 2);
  // 未冲突字段不受影响
  assert.equal(p4.entries.en.fields.unit, 'piece');
});

test('冲突裁定后恢复正常，且同值重复版本不算冲突（P001 无冲突）', () => {
  const p1 = product('P001');
  assert.equal(hasUnresolvedConflict(p1, {}), false);
  const p4 = product('P004');
  const state = {
    edits: {},
    resolutions: {
      P004: {
        en: {
          title: { value: 'ANC Wireless Over-Ear Headphones', version: 'v2' },
          description: { value: 'Over-ear ANC headphones, 30h playback, Bluetooth 5.3, USB-C fast charge.', version: 'v2' },
        },
      },
    },
  };
  assert.equal(hasUnresolvedConflict(p4, state.resolutions), false);
  const r = resolveProduct(p4, 'en', MARKETS.US, state);
  assert.equal(r.title.value, 'ANC Wireless Over-Ear Headphones');
  assert.equal(r.title.source, 'resolved');
});

test('回退只填补空字段：P002 英语描述回退中文，并标注来源语种', () => {
  const r = resolveProduct(product('P002'), 'en', MARKETS.US, emptyState);
  assert.equal(r.description.value, '进口有机燕麦，无添加糖，富含膳食纤维，适合早餐冲调。');
  assert.equal(r.description.isFallback, true);
  assert.equal(r.description.sourceLang, 'zh');
  // 英语标题自有值不被回退覆盖
  assert.equal(r.title.value, 'Organic Rolled Oats 1kg');
  assert.equal(r.title.source, 'own');
});

test('回退链顺序：日语先取英语；回退链按市场支持语种裁剪', () => {
  // JP 支持 ja/en，zh 被裁剪
  assert.deepEqual(fallbackChainFor('ja', MARKETS.JP), ['en']);
  // SG 支持 en/zh/ja，完整链路保留
  assert.deepEqual(fallbackChainFor('ja', MARKETS.SG), ['en', 'zh']);
  const r = resolveProduct(product('P003'), 'ja', MARKETS.JP, emptyState);
  assert.equal(r.title.value, 'Cold Brew Coffee Pack of 24');
  assert.equal(r.title.sourceLang, 'en');
});

test('回退链限定在市场支持语種内', () => {
  // CN 市场不支持日语，en 回退链中不会出现 ja
  const chain = fallbackChainFor('en', MARKETS.CN);
  assert.ok(!chain.includes('ja'));
  assert.deepEqual(chain, ['zh']);
});

test('人工锁定留空时回退不得写入（P007 日语）', () => {
  const r = resolveProduct(product('P007'), 'ja', MARKETS.JP, emptyState);
  assert.equal(r.title.value, '');
  assert.equal(r.title.lockedEmpty, true);
  assert.equal(r.description.value, '');
  // 未锁定字段不影响：单位有值
  assert.equal(r.unit.value, '個');
  const issues = validateResolved(r, MARKETS.JP);
  assert.ok(issues.some((i) => i.field === 'title' && i.message.includes('锁定')));
});

test('人工清空（编辑为空）同样阻止回退，并保持锁定', () => {
  const state = {
    edits: { P002: { en: { description: { value: '', locked: true } } } },
    resolutions: {},
  };
  const r = resolveProduct(product('P002'), 'en', MARKETS.US, state);
  assert.equal(r.description.value, '');
  assert.equal(r.description.lockedEmpty, true);
});

test('人工译文优先于回退且不被覆盖（P001 英语标题被人工修改）', () => {
  const state = {
    edits: { P001: { en: { title: { value: 'Manual English Title', locked: true } } } },
    resolutions: {},
  };
  const r = resolveProduct(product('P001'), 'en', MARKETS.US, state);
  assert.equal(r.title.value, 'Manual English Title');
  assert.equal(r.title.source, 'manual');
});

test('市场规则因市场不同：禁用词按市场判定', () => {
  // P006 英语标题含 best：US/SG 禁用，JP 禁用词表不含 best
  const us = validateResolved(resolveProduct(product('P006'), 'en', MARKETS.US, emptyState), MARKETS.US);
  const jp = validateResolved(resolveProduct(product('P006'), 'en', MARKETS.JP, emptyState), MARKETS.JP);
  assert.ok(us.some((i) => i.type === 'banned' && i.field === 'title'));
  assert.ok(!jp.some((i) => i.type === 'banned'));
});

test('长度限制按市场判定（P005 中文描述 CN 300 超限，SG 400 不超限）', () => {
  const r = resolveProduct(product('P005'), 'zh', MARKETS.CN, emptyState);
  const len = textLength(r.description.value);
  assert.ok(len > MARKETS.CN.limits.description, `样例长度 ${len} 应大于 300`);
  const cn = validateResolved(r, MARKETS.CN);
  assert.ok(cn.some((i) => i.type === 'length' && i.field === 'description'));
  const sg = validateResolved(r, MARKETS.SG);
  assert.ok(!sg.some((i) => i.type === 'length'), 'SG 描述上限 400，不应超长');
});

test('单位规则按市场：「缶」不在 JP 允许列表，「bottle」不在 JP 列表', () => {
  const jpP3 = validateResolved(resolveProduct(product('P003'), 'ja', MARKETS.JP, emptyState), MARKETS.JP);
  assert.ok(jpP3.some((i) => i.type === 'unit' && i.message.includes('缶')));
  const jpP6 = validateResolved(resolveProduct(product('P006'), 'en', MARKETS.JP, emptyState), MARKETS.JP);
  assert.ok(jpP6.some((i) => i.type === 'unit'));
  // 同值在 US 合法
  const usP6 = validateResolved(resolveProduct(product('P006'), 'en', MARKETS.US, emptyState), MARKETS.US);
  assert.ok(!usP6.some((i) => i.type === 'unit'));
});

test('类目映射缺失时保留原值并提示（wellness 无映射）', () => {
  const r = resolveProduct(product('P005'), 'zh', MARKETS.CN, emptyState);
  assert.equal(r.category.value, 'wellness');
  assert.equal(r.category.category.missingMap, true);
  const issues = validateResolved(r, MARKETS.CN);
  assert.ok(issues.some((i) => i.type === 'category' && i.message.includes('wellness')));
  // 正常类目有映射
  const ok = resolveProduct(product('P001'), 'zh', MARKETS.CN, emptyState);
  assert.equal(ok.category.category.mapped, '家居生活');
});

test('缺失且回退链无值时报缺译（构造空商品场景）', () => {
  const cat = buildCatalog([
    { productId: 'X1', language: 'en', version: 'v1', title: '', description: '', unit: '', category: '' },
  ]);
  const r = resolveProduct(cat.products[0], 'en', MARKETS.US, { edits: {}, resolutions: {} });
  const issues = validateResolved(r, MARKETS.US);
  for (const f of FIELD_KEYS) {
    assert.ok(issues.some((i) => i.field === f && i.type === 'missing'), `${f} 应缺译`);
  }
});

test('批量修改预演：统计商品数与字段差异，冲突商品被排除，锁定字段被跳过', () => {
  const rows = catalog.products;
  const state = {
    edits: { P001: { en: { unit: { value: 'box', locked: true } } } },
    resolutions: {},
  };
  const plan = planBatchEdit({
    products: rows, selectedIds: [],
    language: 'en', field: 'unit', newValue: 'case', state,
    currentOf: (pid) => resolveProduct(
      rows.find((p) => p.productId === pid), 'en', MARKETS.US, state).unit.value,
  });
  // P004 因冲突被排除
  assert.ok(plan.excluded.some((x) => x.productId === 'P004'));
  // P001 已锁定被跳过
  assert.equal(plan.skippedLocked >= 1, true);
  assert.ok(!plan.eligible.includes('P004'));
  assert.ok(!plan.eligible.includes('P001'));
  // 每条差异都有 from/to
  assert.ok(plan.changes.every((c) => 'from' in c && c.to === 'case'));
});

test('批量修改应用后写入人工锁定译文，且不会触及冲突商品', () => {
  const state = { edits: {}, resolutions: {} };
  const plan = { eligible: ['P001', 'P002'], changes: [], excluded: [], skippedLocked: 0 };
  const next = applyBatchEdit(state, plan, 'en', 'title', 'New Batch Title');
  assert.equal(next.edits.P001.en.title.value, 'New Batch Title');
  assert.equal(next.edits.P001.en.title.locked, true);
  // 原 state 不可变
  assert.deepEqual(state.edits, {});
});

test('导出市场文件：标明目录版本、剔除未裁定冲突商品、逐字段带来源', () => {
  const file = buildMarketFile(catalog, MARKETS.US, emptyState, '2026-11-13T00:00:00.000Z');
  assert.equal(file.catalogVersion, '2026.11.0-r1');
  assert.equal(file.market, 'US');
  assert.equal(file.skippedCount, 1);
  assert.equal(file.skipped[0].productId, 'P004');
  assert.equal(file.productCount, 7);
  const p2 = file.items.find((i) => i.productId === 'P002');
  assert.equal(p2.localizations.en.sources.description, 'own');
  // 回退来源在 sources 中体现为 own/ manual 等 source 字段；回退命中保留 isFallback 信息于解析层
  const p2Resolved = resolveProduct(product('P002'), 'en', MARKETS.US, emptyState);
  assert.equal(p2Resolved.description.isFallback, true);
  // 市场规则写入文件头
  assert.deepEqual(file.rules.limits, MARKETS.US.limits);
  assert.ok(file.rules.bannedWords.includes('best'));
});

test('冲突裁定后导出不再剔除该商品', () => {
  const state = {
    edits: {},
    resolutions: {
      P004: {
        en: {
          title: { value: 'ANC Wireless Over-Ear Headphones', version: 'v2' },
          description: { value: 'Over-ear ANC headphones, 30h playback, Bluetooth 5.3, USB-C fast charge.', version: 'v2' },
        },
      },
    },
  };
  const file = buildMarketFile(catalog, MARKETS.US, state, '2026-11-13T00:00:00.000Z');
  assert.equal(file.skippedCount, 0);
  assert.equal(file.productCount, 8);
});

test('P008 日语描述超 JP 250 字限制', () => {
  const r = resolveProduct(product('P008'), 'ja', MARKETS.JP, emptyState);
  const issues = validateResolved(r, MARKETS.JP);
  assert.ok(issues.some((i) => i.type === 'length' && i.field === 'description'));
  // 英语标题 #1 在 US 命中禁用词
  const en = validateResolved(resolveProduct(product('P008'), 'en', MARKETS.US, emptyState), MARKETS.US);
  assert.ok(en.some((i) => i.type === 'banned'));
});
