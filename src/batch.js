// 批量修改：先预演（商品数 + 逐商品字段差异），存在同语言冲突的商品先排除，
// 已人工锁定的字段不覆盖。确认后才落盘到 state.edits。
import { hasUnresolvedConflict } from './catalog.js';

/**
 * 预演一次批量修改。
 * 参数：
 *   products   参与筛选后的全部商品
 *   selectedIds 勾选的商品主键（为空时表示对筛选结果全部执行）
 *   market, language, field, newValue
 *   state      当前 edits/resolutions
 *   currentOf(pid) -> 当前解析值字符串（由 UI 注入，保证与预览一致）
 *
 * 返回 { eligible, excluded, changes, skippedLocked }
 */
export function planBatchEdit({ products, selectedIds, language, field, newValue, state, currentOf }) {
  const scope = selectedIds?.length
    ? products.filter((p) => selectedIds.includes(p.productId))
    : products;

  const excluded = [];
  const eligible = [];
  const changes = [];
  let skippedLocked = 0;

  for (const product of scope) {
    if (hasUnresolvedConflict(product, state.resolutions)) {
      excluded.push({ productId: product.productId, reason: '存在未裁定的同语言冲突' });
      continue;
    }
    const current = currentOf(product.productId);
    const override = state.edits?.[product.productId]?.[language]?.[field];
    if (override?.locked) {
      skippedLocked += 1;
      continue;
    }
    if (current === newValue) continue; // 无差异不产生修改
    eligible.push(product.productId);
    changes.push({ productId: product.productId, field, from: current, to: newValue });
  }

  return { eligible, excluded, changes, skippedLocked };
}

/** 确认批量修改：仅写入预演中的差异，全部标记为人工锁定译文 */
export function applyBatchEdit(state, plan, language, field, newValue) {
  // state 为纯 JSON 可序列化结构，用 JSON 深拷贝保证不可变更新，兼容无 structuredClone 的环境
  const nextEdits = JSON.parse(JSON.stringify(state.edits || {}));
  for (const pid of plan.eligible) {
    nextEdits[pid] ??= {};
    nextEdits[pid][language] ??= {};
    nextEdits[pid][language][field] = { value: newValue, locked: true };
  }
  return { ...state, edits: nextEdits };
}
