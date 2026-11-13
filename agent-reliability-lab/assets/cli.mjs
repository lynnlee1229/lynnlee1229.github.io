#!/usr/bin/env node
import {readFile, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';
import {runScenario, evaluateBundle} from './engine.mjs';

const args = process.argv.slice(2);
const get = key => args.includes(key) ? args[args.indexOf(key) + 1] : undefined;
try {
  if (args.includes('--help')) {
    console.log('node cli.mjs [--policy direct|guarded|both] [--input runs.json] [--out report.json]\nNo network or model calls. Exit 1 means at least one case failed; 2 means invalid input.');
  } else {
    const policy = get('--policy') || 'guarded';
    if (!['direct', 'guarded', 'both'].includes(policy)) throw new Error('Unknown policy');
    const bundle = get('--input') ? JSON.parse(await readFile(get('--input'), 'utf8')) : {
      schemaVersion: 1,
      runs: JSON.parse(await readFile(join(dirname(fileURLToPath(import.meta.url)), 'scenarios.json'), 'utf8')).flatMap(s =>
        (policy === 'both' ? ['direct', 'guarded'] : [policy]).map(p => runScenario(s, p))),
    };
    const report = evaluateBundle(bundle);
    const output = {schemaVersion: 1, runs: bundle.runs, report};
    if (get('--out')) await writeFile(get('--out'), JSON.stringify(output, null, 2) + '\n');
    console.log(JSON.stringify(report.summary, null, 2));
    if (report.results.some(r => !r.pass)) process.exitCode = 1;
  }
} catch (error) { console.error(error.message); process.exitCode = 2; }
