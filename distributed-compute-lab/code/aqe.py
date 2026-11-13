#!/usr/bin/env python3
"""Original bounded AQE coalescing exercise, not a university assignment solution."""
import argparse
import hashlib
import json
import platform
import time
from datetime import datetime, timezone
from pathlib import Path

from pyspark.sql import SparkSession, functions as F


def oracle(rows, seed):
    # No Spark, partition layout, or output from the implementation is consulted.
    totals = {}
    for i in range(rows):
        key = (31 * i + seed) % 1000
        count, value = totals.get(key, (0, 0))
        totals[key] = (count + 1, value + (17 * i + seed) % 101 - 50)
    return [[key, *totals[key]] for key in sorted(totals)]


def scala_values(seq):
    it = seq.iterator()
    while it.hasNext():
        yield it.next()


def inspect_plan(root):
    """Allowlist physical operator names + SQLMetrics, never arbitrary JVM state.

    SparkPlan.children omits query-stage and adaptive wrappers. Explicitly unwrap
    them; deduplicate node ids so query stages aren't counted twice. Pinned 3.5.8
    JVM internals are used only for observation, not to produce the result.
    """
    seen, nodes = set(), []

    def visit(node):
        ident = node.id()
        if ident in seen:
            return
        seen.add(ident)
        metrics = {}
        for pair in scala_values(node.metrics()):
            metric = pair._2()
            metrics[pair._1()] = int(metric.value())
        item = {'node': node.nodeName(), 'metrics': metrics}
        if node.nodeName() == 'AQEShuffleRead':
            specs = list(scala_values(node.partitionSpecs()))
            item['partition_specs'] = [
                {'kind': spec.getClass().getSimpleName(),
                 'start_reducer': int(spec.startReducerIndex()),
                 'end_reducer': int(spec.endReducerIndex())}
                for spec in specs
            ]
        nodes.append(item)
        if node.nodeName() == 'AdaptiveSparkPlan':
            visit(node.executedPlan())
        elif node.nodeName() in ('ShuffleQueryStage', 'BroadcastQueryStage'):
            visit(node.plan())
        else:
            for child in scala_values(node.children()):
                visit(child)

    visit(root)
    return nodes


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--rows', type=int, default=240000)
    p.add_argument('--repeats', type=int, default=3)
    p.add_argument('--seed', type=int, default=42)
    p.add_argument('--shuffle-partitions', type=int, default=32)
    p.add_argument('--advisory-bytes', type=int, default=1048576)
    p.add_argument('--out', type=Path, required=True)
    a = p.parse_args()
    if not (10000 <= a.rows <= 1000000 and 1 <= a.repeats <= 5
            and 2 <= a.shuffle_partitions <= 128 and 1 <= a.advisory_bytes <= 67108864
            and 0 <= a.seed <= 1000000):
        p.error('rows 10000..1000000; repeats 1..5; partitions 2..128; bytes 1..67108864; seed 0..1000000')
    a.out.mkdir(parents=True, exist_ok=True)
    events = (a.out / 'events').resolve()
    events.mkdir(exist_ok=True)
    spark = (SparkSession.builder.appName('distributed-compute-aqe')
             .master('local[2,2]').config('spark.driver.bindAddress', '127.0.0.1')
             .config('spark.driver.host', '127.0.0.1')
             .config('spark.hadoop.fs.defaultFS', 'file:///')
             .config('spark.ui.enabled', 'false')
             .config('spark.sql.shuffle.partitions', str(a.shuffle_partitions))
             .config('spark.sql.autoBroadcastJoinThreshold', '-1')
             .config('spark.sql.adaptive.autoBroadcastJoinThreshold', '-1')
             .config('spark.sql.adaptive.skewJoin.enabled', 'false')
             .config('spark.sql.adaptive.localShuffleReader.enabled', 'false')
             .config('spark.sql.adaptive.coalescePartitions.parallelismFirst', 'false')
             .config('spark.sql.adaptive.coalescePartitions.minPartitionSize', '1')
             .config('spark.sql.adaptive.advisoryPartitionSizeInBytes', str(a.advisory_bytes))
             .config('spark.eventLog.enabled', 'true')
             .config('spark.eventLog.compress', 'false')
             .config('spark.eventLog.dir', events.as_uri())
             .config('spark.local.dir', str((a.out / 'scratch').resolve())).getOrCreate())
    sc = spark.sparkContext
    sc.setLogLevel('ERROR')
    expected = oracle(a.rows, a.seed)
    report = {
        'schema_version': 1, 'experiment': 'aqe',
        'created_utc': datetime.now(timezone.utc).isoformat(),
        'environment': {'spark': spark.version, 'python': platform.python_version(),
                        'java': sc._jvm.java.lang.System.getProperty('java.version'),
                        'os': platform.system(), 'architecture': platform.machine(),
                        'master': sc.master,
                        'driver_heap_bytes': sc._jvm.java.lang.Runtime.getRuntime().maxMemory(),
                        'sql_shuffle_partitions': a.shuffle_partitions,
                        'aqe': 'per variant', 'broadcast_threshold': -1},
        'input': {'rows': a.rows, 'seed': a.seed, 'source_partitions': 8,
                  'keys': 1000, 'external_data': False,
                  'generator': 'k=(31*i+seed)%1000; v=(17*i+seed)%101-50; integer i=0..rows-1'},
        'runs': [], 'plans': {},
        'observations': {
            'oracle': 'independent Python per-key count and sum; full equality for every action',
            'advisory_bytes': a.advisory_bytes, 'min_partition_bytes': 1,
            'parallelism_first': False, 'skew_join': False,
            'scope': 'SQL aggregation post-shuffle coalescing only; no join, executor, or multi-host claim',
            'timing': 'plan construction, collect, Python validation and plan/metric inspection; no application startup',
        },
    }
    variants = [('aqe-off', False, True), ('aqe-on-no-coalesce', True, False),
                ('aqe-on-coalesce', True, True)]

    def run(variant, adaptive, coalesce, repeat):
        group = f'{variant}-{repeat}'
        sc.setJobGroup(group, group)
        start = time.perf_counter()
        spark.conf.set('spark.sql.adaptive.enabled', str(adaptive).lower())
        spark.conf.set('spark.sql.adaptive.coalescePartitions.enabled', str(coalesce).lower())
        # Reconstruct the query each time: do not reuse an already-finalized plan.
        source = spark.range(a.rows, numPartitions=8).select(
            ((F.col('id') * 31 + a.seed) % 1000).alias('k'),
            (((F.col('id') * 17 + a.seed) % 101) - 50).alias('v'))
        query = source.groupBy('k').agg(F.count('*').alias('n'), F.sum('v').alias('total'))
        before = query._jdf.queryExecution().executedPlan().toString()
        got = sorted([[int(row.k), int(row.n), int(row.total)] for row in query.collect()])
        assert got == expected, 'Full per-key oracle mismatch'
        if 'output' not in report:
            report['output'] = got  # An actual collected result, not the oracle fixture.
        executed = query._jdf.queryExecution().executedPlan()
        after = executed.toString()
        if adaptive:
            assert executed.isFinalPlan(), 'Observed a provisional AQE plan'
        nodes = inspect_plan(executed)
        reads = [node for node in nodes if node['node'] == 'AQEShuffleRead']
        final = executed.executedPlan() if adaptive else executed
        partitions = int(final.outputPartitioning().numPartitions())
        # Read the same executed query, not .rdd or a second action's plan.
        report['plans'][group + ':before'] = before
        report['plans'][group + ':after'] = after
        report['runs'].append({
            'group': group, 'variant': variant, 'repeat': repeat, 'warmup': repeat == -1,
            'wall_ms': round((time.perf_counter() - start) * 1000, 3),
            'result': {'keys': len(got), 'rows': sum(row[1] for row in got),
                       'value_sum': sum(row[2] for row in got), 'oracle_equal': True},
            'output_sha256': hashlib.sha256(json.dumps(got, separators=(',', ':')).encode()).hexdigest(),
            'adaptive': {'enabled': adaptive, 'coalesce_enabled': coalesce,
                         'is_final_plan': bool(executed.isFinalPlan()) if adaptive else None,
                         'output_partitions': partitions, 'shuffle_reads': reads,
                         'sql_operators': nodes},
        })
        sc.setLocalProperty('spark.jobGroup.id', None)
        print(json.dumps({'completed': group, 'partitions': partitions,
                          'wall_ms': report['runs'][-1]['wall_ms']}), flush=True)

    try:
        for variant in variants:
            run(*variant, -1)
        for repeat in range(a.repeats):
            for variant in variants if repeat % 2 == 0 else list(reversed(variants)):
                run(*variant, repeat)
    finally:
        spark.stop()
    # Source has no file scans, UDF paths, or exception content. Exporter performs
    # a second private-content guard on the complete allowlisted report.
    (a.out / 'report.json').write_text(json.dumps(report, indent=2) + '\n')
    print('REPORT_OK aqe', flush=True)


if __name__ == '__main__':
    main()
