// UI 入口：渲染、交互、编辑器、批量修改预演、市场预览与导出
import { MARKETS, MARKET_ORDER, CATALOG_VERSION } from './markets.js';
import { LANGUAGES, LANGUAGE_ORDER } from './languages.js';
import {
  catalog, state, loadPersisted, persist, resetAll,
  setEdit, clearEdit, resolveConflict, toggleSelect,
} from './store.js';
import {
  resolveProduct, sourceLabel, hasUnresolvedConflict, getConflictCount, FIELD_KEYS,
} from './catalog.js';
import { validateAll, validateResolved, ISSUE_TYPES, textLength } from './validation.js';
import { planBatchEdit, applyBatchEdit } from './batch.js';
import { buildMarketFile, downloadMarketFile } from './export.js';

const $ = (sel) => document.querySelector(sel);
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let editorPid = null;
let editorLang = null;
let issuesCache = {};

const market = () => MARKETS[state.marketCode];
const currentLang = () => state.previewLanguage || market().defaultLanguage;

function toast(msg, kind = '') {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = msg;
  $('#toast-root').appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

// ---------- 计算：解析 + 校验 + 筛选 ----------
function resolveRow(product, lang) {
  return resolveProduct(product, lang, market(), state);
}

function recomputeIssues() {
  issuesCache = validateAll(catalog, market(), state, resolveProduct);
}

function issueSummary(pid) {
  const byLang = issuesCache[pid] || {};
  const all = Object.values(byLang).flat();
  return all;
}

function productHasIssueType(pid, type) {
  return issueSummary(pid).some((i) => i.type === type);
}

function filteredProducts() {
  const q = state.search.trim().toLowerCase();
  const lang = currentLang();
  // 问题类筛选之间是 OR（命中任一开启的问题即保留）；搜索与问题筛选是 AND
  const activeIssueTypes = Object.entries(state.filters)
    .filter(([key, on]) => on && key !== 'conflict')
    .map(([key]) => key);
  const conflictOn = state.filters.conflict;

  return catalog.products.filter((p) => {
    const conflict = hasUnresolvedConflict(p, state.resolutions);
    const issueTypes = new Set(issueSummary(p.productId).map((i) => i.type));

    const matchConflict = conflictOn ? conflict : false;
    const matchIssue = activeIssueTypes.some((t) => issueTypes.has(t));
    // 只要有任一筛选开启，命中其一即可；全部关闭时不过滤
    const anyFilterOn = conflictOn || activeIssueTypes.length > 0;
    if (anyFilterOn && !(matchConflict || matchIssue)) return false;

    if (q) {
      const resolved = resolveRow(p, lang);
      const hay = [
        p.productId,
        resolved.title.value,
        resolved.description.value,
        resolved.category.value,
      ].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

// ---------- 顶部控件 ----------
function initSelectors() {
  $('#catalog-version').textContent = `目录版本 ${CATALOG_VERSION}`;

  const marketSel = $('#market-select');
  marketSel.innerHTML = MARKET_ORDER.map(
    (code) => `<option value="${code}">${MARKETS[code].name}（${code}）</option>`,
  ).join('');
  marketSel.value = state.marketCode;
  marketSel.addEventListener('change', () => {
    state.marketCode = marketSel.value;
    state.previewLanguage = null;
    state.selectedIds = [];
    persist();
    render();
  });

  buildLanguageSelector();
  $('#language-select').addEventListener('change', (e) => {
    state.previewLanguage = e.target.value === '__default__' ? null : e.target.value;
    persist();
    render();
  });

  $('#search-input').addEventListener('input', (e) => {
    state.search = e.target.value;
    render();
  });

  $('#reset-btn').addEventListener('click', () => {
    if (!confirm('确认清空全部人工译文、锁定与冲突裁定结果？')) return;
    resetAll();
    toast('已恢复为原始目录数据', 'ok');
    render();
  });

  $('#export-btn').addEventListener('click', onExport);
  $('#batch-btn').addEventListener('click', openBatchModal);
}

function buildLanguageSelector() {
  const sel = $('#language-select');
  const opts = ['<option value="__default__">市场默认（' +
    LANGUAGES[market().defaultLanguage].nativeLabel + '）</option>'];
  for (const code of market().languages) {
    opts.push(`<option value="${code}">${LANGUAGES[code].nativeLabel}</option>`);
  }
  sel.innerHTML = opts.join('');
  sel.value = state.previewLanguage && market().languages.includes(state.previewLanguage)
    ? state.previewLanguage
    : '__default__';
}

function initFilterChips() {
  const defs = [
    ...Object.values(ISSUE_TYPES),
    { key: 'conflict', label: '同语言冲突待处理', level: 'warn' },
  ];
  const root = $('#filter-chips');
  root.innerHTML = defs.map((d) => {
    const count = countByFilter(d.key);
    return `
      <button type="button" class="chip" data-filter="${d.key}" data-on="${!!state.filters[d.key]}">
        ${d.label}<span class="n">${count}</span>
      </button>`;
  }).join('');
  root.querySelectorAll('.chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const key = chip.dataset.filter;
      state.filters[key] = !state.filters[key];
      render();
    });
  });
}

function countByFilter(key) {
  if (key === 'conflict') {
    return catalog.products.filter((p) => hasUnresolvedConflict(p, state.resolutions)).length;
  }
  return catalog.products.filter((p) => productHasIssueType(p.productId, key)).length;
}

// ---------- 统计 ----------
function renderStats(rows) {
  const total = catalog.products.length;
  const conflictN = catalog.products.filter((p) =>
    hasUnresolvedConflict(p, state.resolutions)).length;
  const issueN = catalog.products.filter((p) => issueSummary(p.productId).length > 0).length;
  const manualN = Object.keys(state.edits).length;
  const html = [
    stat('商品总数', total),
    stat('筛选结果', rows.length),
    stat('待处理冲突', conflictN, conflictN ? 'warn' : ''),
    stat('存在问题商品', issueN, issueN ? 'alert' : ''),
    stat('含人工译文商品', manualN, '', 'ok'),
  ].join('');
  $('#stats-row').innerHTML = html;
}
function stat(k, v, cls = '', badge = '') {
  return `<div class="stat ${cls}"><div class="k">${k}</div><div class="v">${v}
    ${badge === 'ok' ? '<span class="badge badge-ok">已锁定</span>' : ''}</div></div>`;
}

// ---------- 表格 ----------
function renderGrid(rows) {
  const lang = currentLang();
  const body = $('#grid-body');
  if (!rows.length) {
    body.innerHTML = '';
    $('#empty-hint').hidden = false;
  } else {
    $('#empty-hint').hidden = true;
    body.innerHTML = rows.map((p) => rowHtml(p, lang)).join('');
    body.querySelectorAll('[data-edit]').forEach((b) =>
      b.addEventListener('click', () => openEditor(b.dataset.edit, lang)));
    body.querySelectorAll('[data-preview]').forEach((b) =>
      b.addEventListener('click', () => openPreview(b.dataset.preview)));
    body.querySelectorAll('[data-rowcheck]').forEach((cb) =>
      cb.addEventListener('change', () => {
        toggleSelect(cb.dataset.rowcheck);
        renderGrid(filteredProducts());
      }));
  }

  const checkAll = $('#check-all');
  checkAll.checked = rows.length > 0 && rows.every((p) => state.selectedIds.includes(p.productId));
  checkAll.onchange = () => {
    const ids = rows.map((p) => p.productId);
    if (checkAll.checked) {
      state.selectedIds = [...new Set([...state.selectedIds, ...ids])];
    } else {
      state.selectedIds = state.selectedIds.filter((id) => !ids.includes(id));
    }
    renderGrid(rows);
  };

  const selectable = rows.filter((p) => !hasUnresolvedConflict(p, state.resolutions));
  $('#batch-btn').disabled = selectable.length === 0;
  $('#scope-info').textContent = state.selectedIds.length
    ? `已勾选 ${state.selectedIds.length} 项（批量仅作用于勾选项）`
    : `未勾选时批量作用于当前筛选结果 ${rows.length} 项`;
}

function rowHtml(product, lang) {
  const r = resolveRow(product, lang);
  const conflict = hasUnresolvedConflict(product, state.resolutions);
  const issues = issuesCache[product.productId]?.[lang] || [];
  const checked = state.selectedIds.includes(product.productId);
  const limit = market().limits;

  const titleCell = r.title.conflict
    ? '<span class="cell-conflict">⚠ 同语言冲突，待裁定</span>'
    : r.title.lockedEmpty
      ? '<span class="cell-conflict">人工锁定为空</span>'
      : esc(r.title.value) || '<span class="muted">— 缺失 —</span>';

  const titleLen = textLength(r.title.value);
  const titleOver = titleLen > limit.title;

  const catCell = r.category.category?.missingMap
    ? `<span class="cat-missing">⚠ 映射缺失</span><div class="cat-code">原值：${esc(r.category.value)}</div>`
    : r.category.category?.mapped
      ? `${esc(r.category.category.mapped)}<div class="cat-code">${esc(r.category.value)}</div>`
      : '<span class="muted">—</span>';

  const unitBad = !r.unit.conflict && r.unit.value && !market().units.includes(r.unit.value);

  return `
  <tr class="${conflict ? 'row-conflict' : ''}">
    <td><input type="checkbox" data-rowcheck="${product.productId}" ${checked ? 'checked' : ''}
      ${conflict ? 'title="存在冲突，批量修改前需先裁定或排除"' : ''} /></td>
    <td class="col-id">${esc(product.productId)}
      ${conflict ? `<div><span class="badge badge-warn">待处理 ×${getConflictCount(product, state.resolutions)}</span></div>` : ''}
    </td>
    <td class="col-title">
      ${titleCell}
      ${titleOver ? `<div class="badge badge-error" style="margin-top:4px">${titleLen}/${limit.title} 字</div>` : ''}
      ${r.title.locked ? '<div class="badge badge-ok" style="margin-top:4px">已锁定</div>' : ''}
    </td>
    <td class="col-desc"><div class="desc-snippet">${esc(r.description.value) || '—'}</div></td>
    <td>${esc(r.unit.value) || '—'}
      ${unitBad ? '<div class="badge badge-warn" style="margin-top:4px">不在允许列表</div>' : ''}
    </td>
    <td class="col-cat">${catCell}</td>
    <td><span class="badge badge-outline">${esc(sourceLabel(r.title))}</span></td>
    <td class="col-issue"><div class="issue-list">${issueTags(issues)}</div></td>
    <td class="col-actions">
      <button class="btn btn-sm" data-edit="${product.productId}">编辑</button>
      <button class="btn btn-sm" data-preview="${product.productId}">预览</button>
    </td>
  </tr>`;
}

function issueTags(issues) {
  if (!issues.length) return '<span class="badge badge-ok">通过</span>';
  return issues.map((i) => {
    const def = ISSUE_TYPES[i.type];
    return `<span class="issue-tag ${def.level}" title="${esc(i.message)}">${def.label}·${esc(FIELD_KEYS.indexOf(i.field) >= 0
      ? ({ title: '标题', description: '描述', unit: '单位', category: '类目' })[i.field]
      : i.field)}</span>`;
  }).join('');
}

// ---------- 编辑抽屉 ----------
function openEditor(pid, lang) {
  editorPid = pid;
  const product = catalog.products.find((p) => p.productId === pid);
  const langs = LANGUAGE_ORDER.filter((l) => product.entries[l]);
  editorLang = langs.includes(lang) ? lang : langs[0];
  $('#editor-title').textContent = `编辑商品 ${pid}`;
  $('#editor').hidden = false;
  $('#editor-backdrop').hidden = false;
  renderEditor();
}

function closeEditor() {
  $('#editor').hidden = true;
  $('#editor-backdrop').hidden = true;
  editorPid = null;
}

function renderEditor() {
  const product = catalog.products.find((p) => p.productId === editorPid);
  const langs = LANGUAGE_ORDER.filter((l) => product.entries[l]);
  const tabs = langs.map((l) =>
    `<button class="lang-tab" data-lang="${l}" data-on="${l === editorLang}">
      ${LANGUAGES[l].flag} ${LANGUAGES[l].nativeLabel}
      ${product.entries[l].locked ? ' 🔒' : ''}
    </button>`).join('');

  const entry = product.entries[editorLang];
  const resolved = resolveRow(product, editorLang);

  const blocks = FIELD_KEYS.map((field) => fieldBlock(product, entry, resolved, field)).join('');

  $('#editor-body').innerHTML = `
    <div class="lang-tabs" id="editor-tabs">${tabs}</div>
    ${entry.locked ? '<div class="warning-box">该语种条目在源系统中被标记为人工锁定：回退语言不会写入此字段，仍可在本地显式编辑（编辑后继续保持锁定）。</div>' : ''}
    ${blocks}`;

  $('#editor-tabs').querySelectorAll('.lang-tab').forEach((t) =>
    t.addEventListener('click', () => { editorLang = t.dataset.lang; renderEditor(); }));
}

function fieldBlock(product, entry, resolved, field) {
  const labels = { title: '标题', description: '描述', unit: '单位', category: '类目' };
  const cell = resolved[field];
  const override = state.edits?.[editorPid]?.[editorLang]?.[field];
  const conflict = entry.conflicts[field];
  const decision = state.resolutions?.[editorPid]?.[editorLang]?.[field];
  const limit = market().limits[field];
  const len = textLength(cell.value);
  const over = limit && len > limit;

  let input;
  if (field === 'description') {
    input = `<textarea data-field="${field}" ${override?.locked ? '' : ''}>${esc(cell.value)}</textarea>
      <div class="char-count ${over ? 'over-limit' : ''}">${len}${limit ? ` / ${limit}` : ''} 字</div>`;
  } else if (field === 'unit') {
    const opts = market().units.map((u) =>
      `<option value="${esc(u)}" ${u === cell.value ? 'selected' : ''}>${esc(u)}</option>`).join('');
    input = `<input type="text" list="unit-list-${editorLang}" data-field="${field}" value="${esc(cell.value)}" />
      <datalist id="unit-list-${editorLang}">${opts}</datalist>`;
  } else if (field === 'category') {
    const codes = [...new Set(Object.values(catalog.products).flatMap((p) =>
      Object.values(p.entries).map((e) => e.fields.category).filter(Boolean)))];
    const opts = codes.map((c) =>
      `<option value="${esc(c)}" ${c === cell.value ? 'selected' : ''}></option>`).join('');
    input = `<input type="text" list="cat-list" data-field="${field}" value="${esc(cell.value)}" />
      <datalist id="cat-list">${opts}</datalist>`;
  } else {
    input = `<input type="text" data-field="${field}" value="${esc(cell.value)}" />
      <div class="char-count ${over ? 'over-limit' : ''}">${len}${limit ? ` / ${limit}` : ''} 字</div>`;
  }

  let conflictHtml = '';
  if (conflict && !decision) {
    conflictHtml = `
      <div class="conflict-options">
        <div class="muted">检测到同语种 ${conflict.versions.join('、')} 版本存在不同值，请逐项裁定（系统不会自动挑选）：</div>
        ${conflict.options.map((o) => `
          <button class="conflict-option" type="button" data-decide='${esc(JSON.stringify(o))}'>
            <div>${esc(o.value)}</div><div class="ver">版本 ${esc(o.version)}</div>
          </button>`).join('')}
      </div>`;
  } else if (decision) {
    conflictHtml = `<div class="badge badge-ok">已裁定：采用版本 ${esc(decision.version)}</div>`;
  }

  const fieldIssues = (issuesCache[editorPid]?.[editorLang] || []).filter((i) => i.field === field);

  return `
  <div class="field-block ${conflict && !decision ? 'conflict' : ''} ${override?.locked ? 'locked' : ''}" data-block="${field}">
    <div class="field-head">
      <label>${labels[field]}</label>
      <div class="field-meta">
        <span class="badge badge-outline">${esc(sourceLabel(cell))}</span>
        ${override?.locked ? '<span class="badge badge-ok">人工锁定</span>' : ''}
        ${cell.category?.missingMap ? '<span class="badge badge-warn">类目映射缺失，保留原值</span>' : ''}
      </div>
    </div>
    ${conflictHtml}
    ${input}
    ${fieldIssues.length ? `<div class="issue-list" style="margin-top:6px">${issueTags(fieldIssues)}</div>` : ''}
    <div class="field-actions">
      <button class="btn btn-sm btn-primary" type="button" data-save="${field}">保存为人工译文（锁定）</button>
      ${override ? '<button class="btn btn-sm btn-ghost" type="button" data-clear="' + field + '">恢复原始/回退值</button>' : ''}
    </div>
  </div>`;
}

function initEditorEvents() {
  $('#editor-close').addEventListener('click', closeEditor);
  $('#editor-backdrop').addEventListener('click', closeEditor);

  $('#editor-body').addEventListener('click', (e) => {
    const saveBtn = e.target.closest('[data-save]');
    const clearBtn = e.target.closest('[data-clear]');
    const decideBtn = e.target.closest('[data-decide]');

    if (decideBtn) {
      const option = JSON.parse(decideBtn.dataset.decide.replace(/&quot;/g, '"'));
      const field = decideBtn.closest('.field-block').dataset.block;
      resolveConflict(editorPid, editorLang, field, option);
      recomputeIssues();
      renderEditor();
      toast('冲突已裁定，可继续编辑其他字段', 'ok');
      return;
    }
    if (saveBtn) {
      const field = saveBtn.dataset.save;
      const input = $(`#editor-body [data-field="${field}"]`);
      setEdit(editorPid, editorLang, field, input.value, true);
      recomputeIssues();
      renderEditor();
      toast(`已保存 ${editorPid} 的${({ title: '标题', description: '描述', unit: '单位', category: '类目' })[field]}并锁定`, 'ok');
      return;
    }
    if (clearBtn) {
      const field = clearBtn.dataset.clear;
      clearEdit(editorPid, editorLang, field);
      recomputeIssues();
      renderEditor();
      toast('已恢复为原始/回退值');
    }
  });
}

// ---------- 市场最终内容预览 ----------
function openPreview(pid) {
  const product = catalog.products.find((p) => p.productId === pid);
  $('#preview-title').textContent = `${market().name}（${market().code}）最终内容 · ${pid}`;
  const sections = market().languages.map((lang) => {
    const r = resolveProduct(product, lang, market(), state);
    const issues = validateResolved(r, market());
    const kv = FIELD_KEYS.map((field) => {
      const cell = r[field];
      let display = esc(cell.value) || '<span class="muted">（空）</span>';
      if (field === 'category' && cell.category?.mapped) {
        display = `${esc(cell.category.mapped)} <span class="cat-code">(${esc(cell.category.code)})</span>`;
      }
      if (field === 'category' && cell.category?.missingMap) {
        display = `<span class="cat-missing">⚠ 映射缺失，保留原值「${esc(cell.category.code)}」</span>`;
      }
      return `
        <div class="preview-kv">
          <div class="k">${({ title: '标题', description: '描述', unit: '单位', category: '类目' })[field]}</div>
          <div class="v">${display}
            <div class="preview-meta"><span class="badge badge-outline">${esc(sourceLabel(cell))}</span></div>
          </div>
        </div>`;
    }).join('');
    return `
      <section class="preview-section">
        <h3>${LANGUAGES[lang].flag} ${LANGUAGES[lang].nativeLabel}
          ${r._meta.locked ? '<span class="badge badge-ok">源条目锁定</span>' : ''}
          ${r._meta.conflictFields.length ? '<span class="badge badge-warn">含冲突字段</span>' : ''}
        </h3>
        ${kv}
        <div class="issue-list" style="margin-top:8px">${issueTags(issues)}</div>
      </section>`;
  }).join('');

  $('#preview-body').innerHTML =
    `<div class="warning-box">预览基于目录版本 <b>${CATALOG_VERSION}</b> 与 ${market().code} 市场规则（长度 ${market().limits.title}/${market().limits.description}，禁用词 ${market().bannedWords.length} 个，单位 ${market().units.length} 种）。</div>${sections}`;
  $('#preview').hidden = false;
  $('#preview-backdrop').hidden = false;
}

function initPreviewEvents() {
  $('#preview-close').addEventListener('click', closePreview);
  $('#preview-backdrop').addEventListener('click', closePreview);
}
function closePreview() {
  $('#preview').hidden = true;
  $('#preview-backdrop').hidden = true;
}

// ---------- 批量修改 ----------
function openBatchModal() {
  const rows = filteredProducts();
  const langs = market().languages;
  $('#batch-body').innerHTML = `
    <div class="form-row">
      <label>目标语种
        <select id="b-lang">${langs.map((l) =>
          `<option value="${l}" ${l === currentLang() ? 'selected' : ''}>${LANGUAGES[l].nativeLabel}</option>`).join('')}</select>
      </label>
      <label>目标字段
        <select id="b-field">
          <option value="title">标题</option>
          <option value="description">描述</option>
          <option value="unit">单位</option>
          <option value="category">类目（原始 code）</option>
        </select>
      </label>
    </div>
    <label class="muted" style="display:block;margin-bottom:6px">新值（空提交表示批量清空，将按人工锁定留空处理）</label>
    <textarea id="b-value" rows="3" style="width:100%;padding:9px 11px;border:1px solid var(--border);border-radius:8px;font:inherit"></textarea>
    <div style="margin-top:12px;display:flex;gap:10px">
      <button class="btn btn-primary" id="b-preview" type="button">预演差异</button>
    </div>
    <div id="b-result" style="margin-top:16px"></div>`;
  $('#batch-modal').hidden = false;
  $('#batch-backdrop').hidden = false;

  $('#b-preview').onclick = () => {
    const language = $('#b-lang').value;
    const field = $('#b-field').value;
    const newValue = $('#b-value').value;
    const plan = planBatchEdit({
      products: rows,
      selectedIds: state.selectedIds,
      language, field, newValue, state,
      currentOf: (pid) => {
        const p = catalog.products.find((x) => x.productId === pid);
        return resolveProduct(p, language, market(), state)[field].value;
      },
    });
    renderBatchPlan(plan, language, field, newValue);
  };
}

function renderBatchPlan(plan, language, field, newValue) {
  const fieldLabel = { title: '标题', description: '描述', unit: '单位', category: '类目' }[field];
  let html = `
    <div class="summary-box">
      <div><div class="muted">涉及商品数</div><b>${plan.eligible.length}</b></div>
      <div><div class="muted">字段差异条数</div><b>${plan.changes.length}</b></div>
      <div><div class="muted">冲突排除</div><b>${plan.excluded.length}</b></div>
      <div><div class="muted">锁定跳过</div><b>${plan.skippedLocked}</b></div>
    </div>`;

  if (plan.excluded.length) {
    html += `<div class="warning-box">以下商品存在同语言冲突，已自动排除，请先在编辑抽屉中逐项裁定：
      ${plan.excluded.map((x) => `<b>${esc(x.productId)}</b>`).join('、')}</div>`;
  }
  if (plan.skippedLocked) {
    html += `<div class="warning-box">${plan.skippedLocked} 个商品的该字段已人工锁定，不会被覆盖。</div>`;
  }
  if (!plan.changes.length) {
    html += '<div class="error-box">没有产生任何字段差异（值相同、被锁定或被排除）。</div>';
  } else {
    html += `
      <table class="diff-table">
        <thead><tr><th>商品主键</th><th>字段</th><th>当前值</th><th>新值</th></tr></thead>
        <tbody>${plan.changes.slice(0, 50).map((c) => `
          <tr>
            <td>${esc(c.productId)}</td><td>${fieldLabel}</td>
            <td class="diff-from">${esc(c.from) || '（空）'}</td>
            <td class="diff-to">${esc(c.to) || '（清空）'}</td>
          </tr>`).join('')}</tbody>
      </table>
      ${plan.changes.length > 50 ? `<p class="muted">仅展示前 50 条，共 ${plan.changes.length} 条。</p>` : ''}
      <div style="margin-top:14px;display:flex;gap:10px">
        <button class="btn btn-accent" id="b-apply" type="button">确认应用（${plan.changes.length} 项，全部标记人工锁定）</button>
      </div>`;
  }

  $('#b-result').innerHTML = html;
  const applyBtn = $('#b-apply');
  if (applyBtn) {
    applyBtn.onclick = () => {
      const next = applyBatchEdit(state, plan, language, field, newValue);
      state.edits = next.edits;
      persist();
      recomputeIssues();
      closeBatchModal();
      render();
      toast(`批量修改完成：${plan.changes.length} 项已锁定`, 'ok');
    };
  }
}

function initBatchEvents() {
  $('#batch-close').addEventListener('click', closeBatchModal);
  $('#batch-backdrop').addEventListener('click', closeBatchModal);
}
function closeBatchModal() {
  $('#batch-modal').hidden = true;
  $('#batch-backdrop').hidden = true;
}

// ---------- 导出 ----------
function onExport() {
  const payload = buildMarketFile(catalog, market(), state);
  const conflictN = payload.skippedCount;
  const issueItems = payload.items.filter((it) =>
    Object.values(it.localizations).some((l) => l.issues.length > 0)).length;
  const go = () => {
    downloadMarketFile(payload);
    toast(`已导出 ${payload.market} 市场文件：${payload.productCount} 个商品，目录版本 ${payload.catalogVersion}`, 'ok');
  };
  if (conflictN) {
    if (!confirm(`有 ${conflictN} 个商品因同语言冲突未裁定将被剔除，${issueItems} 个商品仍带校验问题。确认继续导出？`)) return;
  }
  go();
}

// ---------- 总渲染 ----------
function render() {
  buildLanguageSelector();
  recomputeIssues();
  initFilterChips();
  const rows = filteredProducts();
  renderStats(rows);
  renderGrid(rows);
}

function init() {
  loadPersisted();
  initSelectors();
  initFilterChips();
  initEditorEvents();
  initPreviewEvents();
  initBatchEvents();
  render();
}

init();
