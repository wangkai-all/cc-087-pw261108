// DOM 冒烟测试（可选，需先 `npm i -D jsdom esbuild`）：
// 1) 用 esbuild 把 src/app.js 打包成 IIFE（jsdom 不执行 type=module 脚本）
// 2) 生成引用 bundle 的临时 HTML
// 3) jsdom 驱动真实 DOM，断言渲染与核心交互
//
// 运行：node scripts/dom-smoke.mjs
// 依赖解析：优先使用仓库 node_modules；也可用 SMOKE_NODE_PATH 指向含 jsdom/esbuild 的目录
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const depRoot = process.env.SMOKE_NODE_PATH || ROOT;
const require = createRequire(join(depRoot, 'package.json'));
const { JSDOM } = require('jsdom');

const work = await mkdtemp(join(tmpdir(), 'catalog-smoke-'));
const bundlePath = join(work, 'app.bundle.js');
const htmlPath = join(work, 'test.html');

// 通过 Node 解析定位 esbuild（依赖装在 depRoot 的 node_modules 内）
const esbuildBin = require.resolve('esbuild/bin/esbuild');
execFileSync(esbuildBin, [join(ROOT, 'src', 'app.js'), '--bundle', '--format=iife', `--outfile=${bundlePath}`], { stdio: 'inherit' });

const sourceHtml = await readFile(join(ROOT, 'index.html'), 'utf8');
const testHtml = sourceHtml.replace(
  '<script type="module" src="./src/app.js"></script>',
  '<script src="./app.bundle.js"></script>',
);
await writeFile(htmlPath, testHtml);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dom = await JSDOM.fromFile(htmlPath, {
  runScripts: 'dangerously',
  resources: 'usable',
  pretendToBeVisual: true,
  beforeParse(win) {
    // jsdom 的 file:// opaque origin 无 localStorage，注入内存桩模拟真实浏览器同源环境
    const store = new Map();
    Object.defineProperty(win, 'localStorage', {
      configurable: true,
      value: {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => store.set(k, String(v)),
        removeItem: (k) => store.delete(k),
        clear: () => store.clear(),
      },
    });
  },
});
const w = dom.window;
const doc = w.document;
w.confirm = () => true;
await sleep(800);

let pass = 0;
const check = (name, cond) => {
  if (!cond) throw new Error('断言失败: ' + name);
  pass += 1;
  console.log('  ✓ ' + name);
};

console.log('# 初始渲染（CN 市场，默认问题筛选 OR 命中 P004/P005）');
check('默认筛选（缺译/长度/禁用词/冲突 OR）显示 2 行', doc.querySelectorAll('#grid-body tr').length === 2);
for (const c of doc.querySelectorAll('#filter-chips .chip')) {
  if (c.dataset.on === 'true') c.dispatchEvent(new w.Event('click'));
}
await sleep(60);
const allRows = doc.querySelectorAll('#grid-body tr');
check('关闭筛选后渲染全部 8 个商品行', allRows.length === 8);
check('版本徽标显示目录版本', doc.querySelector('#catalog-version').textContent.includes('2026.11.0-r1'));
check('市场选择器含 4 个市场', doc.querySelectorAll('#market-select option').length === 4);
check('语种选择器含「市场默认」+ CN 支持语种（zh/en）', doc.querySelectorAll('#language-select option').length === 3);
check('统计卡片已渲染', doc.querySelectorAll('#stats-row .stat').length === 5);
check('筛选 chips 渲染 6 个', doc.querySelectorAll('#filter-chips .chip').length === 6);
check('P004 行带冲突高亮', doc.querySelector('tr.row-conflict td.col-id')?.textContent.includes('P004'));
check('冲突徽标显示待处理数量', doc.querySelector('tr.row-conflict .badge-warn')?.textContent.includes('待处理'));

console.log('# 问题标识');
const p5Row = [...allRows].find((r) => r.textContent.includes('P005'));
check('P005 标题命中禁用词标签', p5Row.textContent.includes('禁用词'));
check('P005 类目映射缺失提示原值', p5Row.textContent.includes('wellness'));

console.log('# 切换到 JP 市场（市场规则隔离）');
const marketSel = doc.querySelector('#market-select');
marketSel.value = 'JP';
marketSel.dispatchEvent(new w.Event('change'));
await sleep(80);
check('JP 语种选择器含「市场默认」+ ja/en', doc.querySelectorAll('#language-select option').length === 3);
const jpRows = doc.querySelectorAll('#grid-body tr');
check('JP 下 P003 单位「缶」报不允许', [...jpRows].find((r) => r.textContent.includes('P003'))?.textContent.includes('不在允许列表'));
check('JP 下 P008 描述长度超限标签', [...jpRows].find((r) => r.textContent.includes('P008'))?.textContent.includes('长度超限·描述'));

console.log('# 筛选 OR 语义');
const lengthChip = [...doc.querySelectorAll('#filter-chips .chip')].find((c) => c.dataset.filter === 'length');
lengthChip.dispatchEvent(new w.Event('click'));
await sleep(60);
const filteredRows = doc.querySelectorAll('#grid-body tr');
check('长度筛选后仅 1 行（P008）', filteredRows.length === 1 && filteredRows[0].textContent.includes('P008'));
lengthChip.dispatchEvent(new w.Event('click'));
await sleep(60);
check('取消筛选后恢复 8 行', doc.querySelectorAll('#grid-body tr').length === 8);

console.log('# 搜索（与问题筛选 AND）');
const search = doc.querySelector('#search-input');
search.value = 'P004';
search.dispatchEvent(new w.Event('input'));
await sleep(60);
check('搜索 P004 仅 1 行', doc.querySelectorAll('#grid-body tr').length === 1);
search.value = '';
search.dispatchEvent(new w.Event('input'));
await sleep(60);

console.log('# 打开编辑器并逐项裁定 P004 同语言冲突');
[...doc.querySelectorAll('[data-edit]')].find((b) => b.dataset.edit === 'P004').click();
await sleep(60);
check('编辑器抽屉打开', doc.querySelector('#editor').hidden === false);
[...doc.querySelectorAll('#editor-tabs .lang-tab')].find((t) => t.dataset.lang === 'en').dispatchEvent(new w.Event('click'));
await sleep(60);
check('两个冲突字段块（标题、描述）各存在', doc.querySelectorAll('.field-block.conflict').length === 2);
check('共 4 个版本候选（2 字段 × 2 版本），系统不自动挑选', doc.querySelectorAll('[data-decide]').length === 4);
doc.querySelectorAll('.field-block.conflict')[0].querySelectorAll('[data-decide]')[1].click();
await sleep(60);
check('裁定标题后仍剩描述冲突块', doc.querySelectorAll('.field-block.conflict').length === 1);
doc.querySelectorAll('.field-block.conflict')[0].querySelectorAll('[data-decide]')[1].click();
await sleep(60);
check('全部裁定后无冲突块', doc.querySelectorAll('.field-block.conflict').length === 0);

console.log('# 编辑字段并保存为人工锁定译文');
doc.querySelector('[data-field="title"]').value = '裁定后手动修订标题';
doc.querySelector('[data-save="title"]').click();
await sleep(60);
check('保存后出现人工锁定徽标', doc.querySelector('#editor-body').textContent.includes('人工锁定'));
check('出现恢复原始/回退值按钮', doc.querySelector('[data-clear="title"]') !== null);
doc.querySelector('#editor-close').click();
await sleep(30);

console.log('# 市场最终内容预览（含来源标注）');
[...doc.querySelectorAll('[data-preview]')].find((b) => b.dataset.preview === 'P002').click();
await sleep(60);
check('预览弹窗打开', doc.querySelector('#preview').hidden === false);
check('预览含所有 JP 支持语种分区', doc.querySelectorAll('#preview .preview-section').length === 2);
check('预览显示来源徽标', doc.querySelectorAll('#preview .badge-outline').length >= 4);
doc.querySelector('#preview-close').click();
await sleep(30);

console.log('# 批量修改：先预演商品数与字段差异');
doc.querySelector('#batch-btn').click();
await sleep(60);
check('批量弹窗打开', doc.querySelector('#batch-modal').hidden === false);
doc.querySelector('#b-field').value = 'unit';
doc.querySelector('#b-value').value = '個';
doc.querySelector('#b-preview').click();
await sleep(60);
check('预演显示商品数/差异/排除/锁定统计', doc.querySelector('#b-result .summary-box') !== null);
check('预演列出差异表', doc.querySelector('#b-result .diff-table') !== null);
check('P004 裁定后不再被排除', !doc.querySelector('#b-result').textContent.includes('P004'));
const applyBtn = doc.querySelector('#b-apply');
check('存在可应用按钮', applyBtn !== null);
applyBtn.click();
await sleep(60);
check('应用后批量弹窗关闭', doc.querySelector('#batch-modal').hidden === true);
check('toast 提示完成', doc.querySelector('#toast-root').textContent.includes('批量修改完成'));

console.log('# 导出市场文件（标明目录版本）');
let downloaded = null;
w.URL.createObjectURL = () => 'blob:fake';
w.URL.revokeObjectURL = () => {};
w.HTMLAnchorElement.prototype.click = function () { downloaded = this.download; };
doc.querySelector('#export-btn').click();
await sleep(60);
check('触发下载且文件名含市场与目录版本',
  typeof downloaded === 'string' && downloaded.includes('JP') && downloaded.includes('2026.11.0-r1'));

await rm(work, { recursive: true, force: true });
console.log(`\n全部 ${pass} 项 DOM 冒烟断言通过 ✔`);
w.close();
process.exit(0);
