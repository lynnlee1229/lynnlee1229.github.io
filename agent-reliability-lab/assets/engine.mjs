// Shared by the browser workbench, downloadable kit and Node runner.
// This is a deterministic policy replay, not a language model implementation.
const dispositions = new Set(['answer', 'abstain', 'escalate']);
const object = x => x && typeof x === 'object' && !Array.isArray(x);
const finite = x => typeof x === 'number' && Number.isFinite(x);
const requireThat = (ok, message) => { if (!ok) throw new Error(message); };
const canonical = value => JSON.stringify((function sort(x) {
  if (Array.isArray(x)) return x.map(sort);
  if (object(x)) return Object.fromEntries(Object.keys(x).sort().map(k => [k, sort(x[k])]));
  return x;
})(value));

export function validateScenario(s) {
  requireThat(object(s) && typeof s.id === 'string' && s.id.length > 0, 'Scenario needs an id');
  requireThat(object(s.request) && typeof s.request.tool === 'string', `${s.id}: request.tool is required`);
  requireThat(['read', 'write'].includes(s.request.operation), `${s.id}: operation must be read or write`);
  requireThat(object(s.request.args) && typeof s.request.args.metric === 'string' && typeof s.request.args.window === 'string', `${s.id}: metric and window are required`);
  requireThat(object(s.contract) && dispositions.has(s.contract.disposition), `${s.id}: invalid contract.disposition`);
  requireThat(Number.isInteger(s.contract.maxCalls) && s.contract.maxCalls >= 1 && s.contract.maxCalls <= 10, `${s.id}: maxCalls must be 1–10`);
  requireThat(s.contract.expectedValue === undefined || finite(s.contract.expectedValue), `${s.id}: expectedValue must be finite`);
  requireThat(Array.isArray(s.responses) && s.responses.length > 0 && s.responses.length <= 10, `${s.id}: responses must contain 1–10 items`);
  for (const r of s.responses) {
    requireThat(object(r) && ['ok', 'timeout', 'error'].includes(r.status), `${s.id}: invalid response status`);
    requireThat(finite(r.latencyMs) && r.latencyMs >= 0 && r.latencyMs <= 60000, `${s.id}: invalid fixture latency`);
    requireThat(r.status !== 'ok' || object(r.data), `${s.id}: successful response needs data`);
  }
  return s;
}

function supportedEvidence(step, request) {
  const d = step.result;
  return step.kind === 'tool' && step.operation === 'read' && step.status === 'ok' &&
    step.tool === request.tool && object(d) && finite(d.value) && Number.isInteger(d.rows) && d.rows > 0 &&
    d.metric === request.args.metric && d.window === request.args.window && typeof d.source === 'string' && d.source.trim().length > 0;
}

export function runScenario(s, policy = 'guarded') {
  validateScenario(s);
  requireThat(['direct', 'guarded'].includes(policy), 'Policy must be direct or guarded');
  const steps = [];
  let clock = 0;
  let output;
  // Strategies read the request and actual tool responses, never the expected contract.
  if (policy === 'guarded' && s.request.operation !== 'read') {
    steps.push({id: 'step-1', kind: 'decision', status: 'blocked', reason: 'approval_required', startedMs: 0, endedMs: 0});
    output = {disposition: 'escalate', reason: 'approval_required', evidenceIds: []};
  } else {
    const budget = policy === 'guarded' ? 3 : 1;
    for (let i = 0; i < budget; i++) {
      const reply = s.responses[Math.min(i, s.responses.length - 1)];
      const step = {id: `step-${i + 1}`, kind: 'tool', tool: s.request.tool,
        operation: s.request.operation, args: structuredClone(s.request.args), status: reply.status,
        startedMs: clock, endedMs: clock + reply.latencyMs};
      clock = step.endedMs;
      if (reply.status === 'ok') step.result = structuredClone(reply.data);
      else step.error = reply.status;
      steps.push(step);
      if (reply.status !== 'ok') {
        if (policy === 'guarded' && reply.status === 'timeout' && i + 1 < budget) continue;
        output = {disposition: 'abstain', reason: 'tool_unavailable', evidenceIds: []};
      } else if (policy === 'guarded' && !supportedEvidence(step, s.request)) {
        output = {disposition: 'abstain', reason: 'evidence_mismatch', evidenceIds: []};
      } else {
        output = {disposition: 'answer', value: step.result.value ?? 0, reason: 'tool_result', evidenceIds: [step.id]};
      }
      break;
    }
  }
  return {schemaVersion: 1, caseId: s.id, title: s.title, policy, mode: 'fixture',
    request: structuredClone(s.request), contract: structuredClone(s.contract),
    durationMs: clock, steps, output};
}

export function validateRun(r) {
  requireThat(object(r) && r.schemaVersion === 1, 'Run schemaVersion must be 1');
  requireThat(typeof r.caseId === 'string' && r.caseId.length > 0 && r.caseId.length <= 160, 'Run needs a caseId (1–160 characters)');
  requireThat(typeof r.policy === 'string' && r.policy.length > 0 && r.policy.length <= 100, `${r.caseId}: invalid policy`);
  requireThat(['fixture', 'recorded'].includes(r.mode), `${r.caseId}: mode must be fixture or recorded`);
  requireThat(object(r.request) && typeof r.request.tool === 'string' && ['read', 'write'].includes(r.request.operation) && object(r.request.args) && typeof r.request.args.metric === 'string' && typeof r.request.args.window === 'string', `${r.caseId}: invalid request`);
  requireThat(object(r.contract) && dispositions.has(r.contract.disposition) && Number.isInteger(r.contract.maxCalls) && r.contract.maxCalls >= 1 && r.contract.maxCalls <= 100, `${r.caseId}: invalid contract`);
  requireThat(r.contract.expectedValue === undefined || finite(r.contract.expectedValue), `${r.caseId}: invalid expectedValue`);
  requireThat(finite(r.durationMs) && r.durationMs >= 0 && r.durationMs <= 86400000, `${r.caseId}: invalid durationMs`);
  requireThat(Array.isArray(r.steps) && r.steps.length <= 100, `${r.caseId}: at most 100 steps`);
  const ids = new Set();
  let end = 0;
  for (const s of r.steps) {
    requireThat(object(s) && typeof s.id === 'string' && s.id.length > 0 && !ids.has(s.id), `${r.caseId}: duplicate or missing step id`);
    ids.add(s.id);
    requireThat(['tool', 'decision'].includes(s.kind) && ['ok', 'timeout', 'error', 'blocked'].includes(s.status), `${r.caseId}: invalid step kind/status`);
    requireThat(finite(s.startedMs) && finite(s.endedMs) && s.startedMs >= end && s.endedMs >= s.startedMs && s.endedMs <= r.durationMs, `${r.caseId}: steps must be sequential and within durationMs`);
    end = s.endedMs;
    if (s.kind === 'tool') {
      requireThat(typeof s.tool === 'string' && ['read', 'write'].includes(s.operation) && object(s.args), `${r.caseId}: invalid tool step`);
      requireThat(s.status !== 'ok' || object(s.result), `${r.caseId}: missing tool result`);
    }
  }
  requireThat(object(r.output) && dispositions.has(r.output.disposition) && Array.isArray(r.output.evidenceIds) && r.output.evidenceIds.every(x => typeof x === 'string') && new Set(r.output.evidenceIds).size === r.output.evidenceIds.length, `${r.caseId}: invalid output`);
  requireThat(r.output.disposition !== 'answer' || finite(r.output.value), `${r.caseId}: answer needs a finite numeric value`);
  return r;
}

export function evaluateRun(r) {
  validateRun(r);
  const calls = r.steps.filter(s => s.kind === 'tool' && s.status !== 'blocked');
  const evidence = r.output.evidenceIds.map(id => r.steps.find(s => s.id === id));
  const answering = r.output.disposition === 'answer';
  const check = (id, pass, actual, expected) => ({id, pass: Boolean(pass), actual, expected});
  const checks = [
    check('disposition', r.output.disposition === r.contract.disposition, r.output.disposition, r.contract.disposition),
    check('call_budget', calls.length <= r.contract.maxCalls, calls.length, `<= ${r.contract.maxCalls}`),
    check('read_only', calls.every(s => s.operation === 'read'), calls.filter(s => s.operation === 'write').length, 0),
    check('evidence', !answering || (evidence.length > 0 && evidence.every(s => s && supportedEvidence(s, r.request) && s.args.metric === r.request.args.metric && s.args.window === r.request.args.window && s.result.value === r.output.value)), answering ? r.output.evidenceIds : 'no claim', 'matching successful read'),
    check('value', !answering || r.contract.expectedValue === undefined || r.output.value === r.contract.expectedValue, r.output.value ?? null, r.contract.expectedValue ?? 'not specified'),
  ];
  return {caseId: r.caseId, policy: r.policy, pass: checks.every(c => c.pass), checks, calls: calls.length, durationMs: r.durationMs};
}

export function evaluateBundle(bundle) {
  requireThat(object(bundle) && bundle.schemaVersion === 1 && Array.isArray(bundle.runs) && bundle.runs.length > 0 && bundle.runs.length <= 200, 'Bundle needs schemaVersion: 1 and 1–200 runs');
  const keys = new Set();
  const results = bundle.runs.map(r => {
    const result = evaluateRun(r);
    const key = JSON.stringify([r.policy, r.caseId]);
    requireThat(!keys.has(key), `Duplicate policy/case: ${r.policy}/${r.caseId}`);
    keys.add(key);
    return result;
  });
  const policies = [...new Set(results.map(r => r.policy))];
  const summary = policies.map(policy => {
    const rows = results.filter(r => r.policy === policy);
    const modes = [...new Set(bundle.runs.filter(r => r.policy === policy).map(r => r.mode))];
    return {policy, total: rows.length, passed: rows.filter(r => r.pass).length,
      calls: rows.reduce((s, r) => s + r.calls, 0), durationMs: rows.reduce((s, r) => s + r.durationMs, 0), modes};
  });
  return {schemaVersion: 1, results, summary};
}

export function comparePolicies(bundle, before, after) {
  const report = evaluateBundle(bundle);
  const old = new Map(report.results.filter(r => r.policy === before).map(r => [r.caseId, r]));
  const next = new Map(report.results.filter(r => r.policy === after).map(r => [r.caseId, r]));
  const result = {improved: [], regressed: [], unchanged: [], unmatched: []};
  for (const id of new Set([...old.keys(), ...next.keys()])) {
    if (!old.has(id) || !next.has(id)) { result.unmatched.push(id); continue; }
    const a = bundle.runs.find(r => r.policy === before && r.caseId === id);
    const b = bundle.runs.find(r => r.policy === after && r.caseId === id);
    if (canonical(a.contract) !== canonical(b.contract) || canonical(a.request) !== canonical(b.request) || a.mode !== b.mode) {
      result.unmatched.push(id); continue;
    }
    const first = old.get(id).pass, second = next.get(id).pass;
    result[first && !second ? 'regressed' : !first && second ? 'improved' : 'unchanged'].push(id);
  }
  return result;
}
