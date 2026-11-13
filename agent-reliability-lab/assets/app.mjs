import {runScenario, evaluateBundle, comparePolicies} from './engine.mjs';
import {$, h, t, table, metric, badge, download, readJsonFile, showError, showStatus} from '/learning-lab-assets/shared.mjs';

let scenarios = [], bundle = null, report = null, activeId = null;
const title = run => run.title && typeof run.title === 'object' ? (run.title[document.documentElement.lang.startsWith('zh') ? 'zh' : 'en'] || run.caseId) : run.caseId;
const checkNames = {
  disposition: t('Expected action', '预期行动'), call_budget: t('Call budget', '调用预算'), read_only: t('Read-only boundary', '只读边界'),
  evidence: t('Evidence supports answer', '证据支持结论'), value: t('Expected value', '预期数值'),
};
const actions = {answer: t('Answer', '回答'), abstain: t('Abstain', '暂不回答'), escalate: t('Escalate', '请求人工处理')};
const policyLabel = x => ({direct: t('Direct · 1 call', '直接策略 · 单次调用'), guarded: t('Guarded · verify + retry', '校验策略 · 验证与重试')})[x] || x;

function invalidate(error) {
  bundle = report = null; activeId = null;
  $('results').replaceChildren(h('p', {class: 'empty'}, t('No valid report. Load the example or import a valid run bundle.', '当前没有有效报告。请载入示例或导入有效的运行记录。')));
  $('case-detail').replaceChildren();
  $('export').disabled = true;
  if (error) showError(error);
}

function inspect(caseId, policy) {
  activeId = caseId;
  const run = bundle.runs.find(r => r.caseId === caseId && r.policy === policy);
  if (!run) { $('case-detail').replaceChildren(); return; }
  const result = report.results.find(r => r.caseId === caseId && r.policy === policy);
  const timeline = h('ol', {class: 'timeline'});
  for (const step of run.steps) {
    const duration = step.endedMs - step.startedMs;
    const track = h('div', {class: 'timebar'}, h('span', {style: `width:${Math.max(1, run.durationMs ? duration / run.durationMs * 100 : 0)}%;margin-left:${run.durationMs ? step.startedMs / run.durationMs * 100 : 0}%`}));
    timeline.append(h('li', {},
      h('div', {class: 'step-head'}, h('strong', {}, `${step.id} · ${step.tool || t('Policy decision', '策略决策')}`), badge(step.status, step.status === 'ok' || step.status === 'blocked'), h('span', {class: 'muted'}, `${step.startedMs}–${step.endedMs} ms`)),
      track,
      h('details', {}, h('summary', {}, t('Inspect recorded step', '查看步骤记录')), h('pre', {}, JSON.stringify(step, null, 2)))));
  }
  $('case-detail').replaceChildren(
    h('div', {class: 'section-line'}, h('h3', {}, title(run)), badge(result.pass ? t('PASS', '通过') : t('FAIL', '失败'), result.pass)),
    h('p', {class: 'hint'}, `${policyLabel(policy)} · ${run.caseId} · ${run.mode === 'fixture' ? t('Fixture clock; no model call', '样例时钟；未调用模型') : t('Imported sequential run', '导入的顺序运行记录')}`),
    table([t('Check', '检查项'), t('Result', '结果'), t('Actual', '实际'), t('Expected', '预期')], result.checks.map(c => [checkNames[c.id], badge(c.pass ? t('PASS', '通过') : t('FAIL', '失败'), c.pass), String(c.actual), String(c.expected)])),
    h('h3', {class: 'spaced'}, t('Trace replay', '执行过程回放')), timeline,
    h('details', {}, h('summary', {}, t('Output and case contract', '输出与案例契约')), h('pre', {}, JSON.stringify({request: run.request, contract: run.contract, output: run.output}, null, 2))));
}

function render() {
  const before = $('before').value, after = $('after').value;
  const comparison = comparePolicies(bundle, before, after);
  const summary = report.summary.find(r => r.policy === after);
  const modes = summary.modes.join(' / ');
  const rows = report.results.filter(r => r.policy === after);
  const contents = [
    h('div', {class: 'metrics'},
      metric(t('Cases passed', '通过案例'), `${summary.passed} / ${summary.total}`, policyLabel(after)),
      metric(t('Tool calls', '工具调用'), summary.calls, t('Attempts count; blocked actions excluded', '按尝试计数；拦截动作不计入')),
      metric(summary.modes.length > 1 ? t('Mixed timing modes', '混合时间模式') : modes === 'fixture' ? t('Fixture clock', '样例时钟') : t('Recorded duration', '记录耗时'), summary.modes.length > 1 ? '—' : `${summary.durationMs} ms`, t('Sum across cases; not a live latency benchmark', '案例耗时合计；不是线上延迟基准'))),
    h('div', {class: 'comparison-note'},
      `${t('Comparison', '对比')} ${before} → ${after}: ${comparison.improved.length} ${t('improved', '改善')} · ${comparison.regressed.length} ${t('regressed', '退化')} · ${comparison.unchanged.length} ${t('unchanged', '不变')} · ${comparison.unmatched.length} ${t('unmatched', '不可配对')}. `,
      t('Pairing requires the same case, request, contract and timing mode.', '仅配对案例、请求、契约和时间模式一致的记录。')),
    table([t('Case', '案例'), t('Before', '之前'), t('After', '之后'), t('Action', '行动'), t('Trace', '记录')], rows.map(r => {
      const run = bundle.runs.find(x => x.caseId === r.caseId && x.policy === after);
      const old = report.results.find(x => x.caseId === r.caseId && x.policy === before);
      return [title(run), old ? badge(old.pass ? t('PASS', '通过') : t('FAIL', '失败'), old.pass) : '—',
        badge(r.pass ? t('PASS', '通过') : t('FAIL', '失败'), r.pass), actions[run.output.disposition],
        h('button', {class: 'secondary', onclick: () => inspect(r.caseId, after), 'aria-label': `${t('Inspect', '查看')} ${title(run)}`}, t('Inspect →', '查看 →'))];
    })),
    h('p', {class: 'hint'}, t('These scores check the supplied contract. They do not judge free-form reasoning, answer quality, or the correctness of your ground truth.', '评分只检查所提供的契约，不评价自由文本推理、答案质量，也不证明你填写的标准答案正确。')),
  ];
  $('results').replaceChildren(...contents);
  const choose = rows.find(r => r.caseId === activeId) || rows.find(r => comparison.improved.includes(r.caseId)) || rows[0];
  inspect(choose.caseId, after);
}

function useBundle(value, label) {
  const next = evaluateBundle(value);
  bundle = value; report = next;
  const policies = next.summary.map(r => r.policy);
  for (const id of ['before', 'after']) $(id).replaceChildren(...policies.map(p => h('option', {value: p}, policyLabel(p))));
  $('before').value = policies[0]; $('after').value = policies.at(-1);
  $('export').disabled = false;
  render();
  showStatus(label);
}

$('run').addEventListener('click', () => {
  try {
    $('json').value = '';
    useBundle({schemaVersion: 1, runs: scenarios.flatMap(s => ['direct', 'guarded'].map(p => runScenario(s, p)))},
      t('Replayed 8 fixture cases with both policies. No model or tool service was called.', '已用两种策略回放 8 个样例；未调用模型或工具服务。'));
  } catch (error) { invalidate(error); }
});
$('import').addEventListener('click', () => {
  try {
    if (new Blob([$('json').value]).size > 2 * 1024 * 1024) throw new Error(t('Input exceeds 2 MB.', '输入超过 2 MB。'));
    useBundle(JSON.parse($('json').value), t('Imported run bundle evaluated locally.', '已在当前浏览器完成导入记录评分。'));
  } catch (error) { invalidate(error); }
});
$('file').addEventListener('change', async event => {
  try { $('json').value = await readJsonFile(event.target.files[0]); $('import').click(); }
  catch (error) { invalidate(error); }
  event.target.value = '';
});
for (const id of ['before', 'after']) $(id).addEventListener('change', () => { if (bundle) render(); });
$('export').addEventListener('click', () => { if (bundle) download('agent-reliability-report.json', {schemaVersion: 1, runs: bundle.runs, report, comparison: comparePolicies(bundle, $('before').value, $('after').value)}); });

try {
  const response = await fetch(new URL('./scenarios.json', import.meta.url));
  if (!response.ok) throw new Error(t('Example unavailable. Import your run bundle or reload.', '示例暂时无法加载。可导入运行记录，或刷新重试。'));
  scenarios = await response.json();
  $('run').disabled = false; $('run').click();
} catch (error) { invalidate(error); }
