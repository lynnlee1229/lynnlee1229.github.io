#!/usr/bin/env python3
"""Independently verify saved AQE evidence, including mechanism and task agreement."""
import argparse
import hashlib
import json
from pathlib import Path


def expected_output(rows, seed):
    # Different enumeration from the runtime oracle: solve 31*i+seed=k mod 1000,
    # then walk each key's arithmetic progression. 31 inverse mod 1000 is 871.
    result = []
    for key in range(1000):
        first = ((key - seed) * 871) % 1000
        indices = range(first, rows, 1000)
        result.append([key, len(indices), sum((17 * i + seed) % 101 - 50 for i in indices)])
    return result


def verify(report, expect=None):
    rows, seed = report['input']['rows'], report['input']['seed']
    expected = expected_output(rows, seed)
    assert report['output'] == expected, 'Full collected per-key output differs from independent oracle'
    digest = hashlib.sha256(json.dumps(expected, separators=(',', ':')).encode()).hexdigest()
    initial = report['environment']['sql_shuffle_partitions']
    variants = {'aqe-off', 'aqe-on-no-coalesce', 'aqe-on-coalesce'}
    assert {run['variant'] for run in report['runs']} == variants
    for run in report['runs']:
        assert run['output_sha256'] == digest, 'A run differs despite possibly identical global checksums'
        assert run['result'] == {'keys': 1000, 'rows': rows,
                                 'value_sum': sum(row[2] for row in expected), 'oracle_equal': True}
        a = run['adaptive']
        adaptive = run['variant'] != 'aqe-off'
        assert a['enabled'] == adaptive
        assert a['coalesce_enabled'] == (run['variant'] != 'aqe-on-no-coalesce')
        before, after = [report['plans'][run['group'] + ':' + phase] for phase in ('before', 'after')]
        if adaptive:
            assert a['is_final_plan'] is True
            assert 'isFinalPlan=false' in before and 'isFinalPlan=true' in after
        else:
            assert a['is_final_plan'] is None and 'AdaptiveSparkPlan' not in after
        partitions = a['output_partitions']
        if run['variant'] != 'aqe-on-coalesce':
            assert partitions == initial and not a['shuffle_reads'], 'Disabled coalescing changed readers'
        elif expect == 'coalesced':
            assert partitions < initial and a['shuffle_reads'], 'Coalescing was not observed'
        elif expect == 'unchanged':
            assert partitions == initial, 'Counterexample unexpectedly merged partitions'
        for reader in a['shuffle_reads']:
            assert reader['metrics']['numPartitions'] == partitions
            specs = reader['partition_specs']
            assert len(specs) == partitions
            assert all(s['kind'] == 'CoalescedPartitionSpec' for s in specs)
            assert specs[0]['start_reducer'] == 0 and specs[-1]['end_reducer'] == initial
            assert all(x['end_reducer'] == y['start_reducer'] for x, y in zip(specs, specs[1:]))
            assert 'AQEShuffleRead' in after
        own = [t for t in report['tasks'] if run['group'] in t['groups']]
        assert len(own) == run['metrics']['tasks'] == 8 + partitions
        assert all(t['successful'] and t['remote_read_bytes'] == 0 for t in own)
        stages = run['stage_metrics']
        assert [s['attempts'] for s in stages] == [8, partitions], 'Task stages disagree with final partitioning'
        assert stages[0]['shuffle_write_bytes'] > 0 and stages[1]['shuffle_read_bytes'] > 0
    return {'rows': rows, 'seed': seed, 'runs': len(report['runs']), 'oracle_sha256': digest,
            'partitions': {v: sorted({r['adaptive']['output_partitions'] for r in report['runs'] if r['variant'] == v}) for v in sorted(variants)}}


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('report', type=Path)
    p.add_argument('--expect', choices=['coalesced', 'unchanged'])
    a = p.parse_args()
    print(json.dumps(verify(json.loads(a.report.read_text()), a.expect), indent=2))
