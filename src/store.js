// 应用状态：市场选择、筛选、人工 edits、冲突裁定结果；localStorage 持久化
import { RAW_ENTRIES } from './sample-data.js';
import { buildCatalog } from './catalog.js';
import { MARKETS } from './markets.js';

const STORAGE_KEY = 'ml-catalog-state-v1';

export const catalog = buildCatalog(RAW_ENTRIES);

export const state = {
  marketCode: 'CN',
  previewLanguage: null, // null = 跟随市场默认语种
  filters: { missing: true, length: true, banned: true, unit: false, category: false, conflict: true },
  search: '',
  selectedIds: [],
  edits: {}, // {pid: {lang: {field: {value, locked}}}}
  resolutions: {}, // {pid: {lang: {field: {value, version}}}}
};

export function loadPersisted() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (saved.edits) state.edits = saved.edits;
    if (saved.resolutions) state.resolutions = saved.resolutions;
    // 恢复前校验市场代码合法性，避免脏数据导致整个应用指向不存在的市场
    if (saved.marketCode && MARKETS[saved.marketCode]) state.marketCode = saved.marketCode;
    // 预览语种必须仍被该市场支持，否则丢弃，回落到市场默认语种
    const mkt = MARKETS[state.marketCode];
    if (saved.previewLanguage && mkt.languages.includes(saved.previewLanguage)) {
      state.previewLanguage = saved.previewLanguage;
    } else {
      state.previewLanguage = null;
    }
  } catch (err) {
    console.warn('持久化状态读取失败，使用默认状态', err);
  }
}

export function persist() {
  // 隐私模式/禁用存储/opaque origin 下 setItem 可能抛错，持久化失败不应阻断 UI 交互
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        edits: state.edits,
        resolutions: state.resolutions,
        marketCode: state.marketCode,
        previewLanguage: state.previewLanguage,
      }),
    );
  } catch (err) {
    console.warn('状态持久化失败，本次修改仅保留在内存中', err);
  }
}

export function resetAll() {
  state.edits = {};
  state.resolutions = {};
  state.selectedIds = [];
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    console.warn('清除持久化状态失败', err);
  }
}

// ---------- 编辑 ----------
export function setEdit(pid, lang, field, value, locked = true) {
  state.edits[pid] ??= {};
  state.edits[pid][lang] ??= {};
  state.edits[pid][lang][field] = { value, locked };
  persist();
}

export function clearEdit(pid, lang, field) {
  const cell = state.edits?.[pid]?.[lang]?.[field];
  if (!cell) return;
  delete state.edits[pid][lang][field];
  if (Object.keys(state.edits[pid][lang]).length === 0) delete state.edits[pid][lang];
  if (state.edits[pid] && Object.keys(state.edits[pid]).length === 0) delete state.edits[pid];
  persist();
}

// ---------- 冲突裁定 ----------
export function resolveConflict(pid, lang, field, option) {
  state.resolutions[pid] ??= {};
  state.resolutions[pid][lang] ??= {};
  state.resolutions[pid][lang][field] = { value: option.value, version: option.version };
  persist();
}

// ---------- 选择 ----------
export function toggleSelect(pid) {
  const i = state.selectedIds.indexOf(pid);
  if (i >= 0) state.selectedIds.splice(i, 1);
  else state.selectedIds.push(pid);
}
