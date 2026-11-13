#!/usr/bin/env python3
"""Bounded, real Spark experiments. No network service or external dataset needed."""
import argparse, json, os, platform, sys, time
from pathlib import Path
from datetime import datetime, timezone
from pyspark.sql import SparkSession, functions as F
from pyspark import TaskContext, StorageLevel

parser = argparse.ArgumentParser()
parser.add_argument('--experiment', choices=['parallel','aggregation','join','recovery','resources'], required=True)
parser.add_argument('--rows', type=int, default=240000)
parser.add_argument('--repeats', type=int, default=3)
parser.add_argument('--out', type=Path, default=Path('build/run'))
a = parser.parse_args()
if not 10000 <= a.rows <= 1000000 or not 1 <= a.repeats <= 5:
    parser.error('rows must be 10000..1000000; repeats 1..5')
a.out.mkdir(parents=True, exist_ok=True)
events = (a.out/'events').resolve(); events.mkdir(exist_ok=True)
builder = (SparkSession.builder.appName('distributed-compute-'+a.experiment)
    .master('local[2,2]').config('spark.driver.bindAddress','127.0.0.1')
    .config('spark.driver.host','127.0.0.1')
    .config('spark.hadoop.fs.defaultFS','file:///').config('spark.ui.enabled','false').config('spark.default.parallelism','8')
    .config('spark.sql.shuffle.partitions','8').config('spark.sql.adaptive.enabled','false')
    .config('spark.sql.autoBroadcastJoinThreshold','-1')
    .config('spark.eventLog.enabled','true').config('spark.eventLog.compress','false')
    .config('spark.eventLog.dir',events.as_uri())
    .config('spark.local.dir',str((a.out/'scratch').resolve())))
if a.experiment == 'resources':
    # Pedagogical forcing of spill, NOT a production tuning recommendation.
    builder = builder.config('spark.shuffle.spill.numElementsForceSpillThreshold','8192')
spark = builder.getOrCreate(); sc = spark.sparkContext; sc.setLogLevel('ERROR')
report = {'schema_version':1,'experiment':a.experiment,'created_utc':datetime.now(timezone.utc).isoformat(),
    'environment':{'spark':spark.version,'python':platform.python_version(),
      'java':sc._jvm.java.lang.System.getProperty('java.version'),
      'os':platform.system(),'architecture':platform.machine(),
      'master':sc.master,'driver_heap_bytes':sc._jvm.java.lang.Runtime.getRuntime().maxMemory(),
      'sql_shuffle_partitions':8,'aqe':False,'broadcast_threshold':-1,
      'spill_element_threshold':8192 if a.experiment=='resources' else None},
    'input':{'rows':a.rows,'generator':'integer ranges; key/payload formulas in experiments/run.py','external_data':False},
    'runs':[],'plans':{},'observations':{}}

def action(label, fn, repeat, variant, warmup=False):
    group = f'{label}-{repeat}'; sc.setJobGroup(group,group)
    start = time.perf_counter(); value = fn(); elapsed = (time.perf_counter()-start)*1000
    row={'group':group,'variant':variant,'repeat':repeat,'warmup':warmup,'wall_ms':round(elapsed,3),'result':value}
    report['runs'].append(row); print(json.dumps({'completed':group,'wall_ms':row['wall_ms']}),flush=True)
    sc.clearJobGroup() if hasattr(sc,'clearJobGroup') else sc.setLocalProperty('spark.jobGroup.id',None)
    return value

def trial(variants):
    # One warm-up per variant; alternate measured order to expose order effects.
    for name,fn in variants: action(name,fn,-1,name,True)
    for r in range(a.repeats):
        for name,fn in (variants if r%2==0 else list(reversed(variants))): action(name,fn,r,name)

def partition_join(rows):
    count=total=0
    for row in rows:
        count+=1; total+=row.weight
    return count,total

def resource_partition(rows):
    count=total=chars=0; previous=None; ordered=True
    for row in rows:
        count+=1; total+=row.id; chars+=len(row.payload)
        if previous is not None and row.sort_key<previous:ordered=False
        previous=row.sort_key
    yield count,total,chars,ordered

if a.experiment=='parallel':
    def run(p):
        return int(sc.parallelize(range(a.rows),p).map(lambda x:(x*31)%997).sum())
    expected=sum((x*31)%997 for x in range(a.rows))
    trial([(f'partitions-{p}',lambda p=p:run(p)) for p in [1,8,64]])
    assert all(r['result']==expected for r in report['runs'])
    report['observations']={'expected_sum':expected,'available_task_slots':2}

elif a.experiment=='aggregation':
    data=sc.parallelize(range(a.rows),8).map(lambda i:(i%1000,i%17))
    # Persist common input and materialize outside the measured comparisons.
    data.persist(StorageLevel.MEMORY_ONLY); data.count()
    def combine():return sorted(data.reduceByKey(lambda x,y:x+y,8).collect())
    def group():return sorted(data.groupByKey(8).mapValues(sum).collect())
    report['plans']['reduceByKey']=data.reduceByKey(lambda x,y:x+y,8).toDebugString().decode()
    report['plans']['groupByKey']=data.groupByKey(8).toDebugString().decode()
    trial([('group-values',group),('combine-locally',combine)])
    expected=[(k,sum(i%17 for i in range(k,a.rows,1000))) for k in range(1000)]
    assert all(r['result']==expected for r in report['runs'])
    # Keep the full logical output once; comparisons carry checksums and count.
    report['output']=expected
    for r in report['runs']:r['result']={'keys':len(r['result']),'sum':sum(v for k,v in r['result'])}
    data.unpersist()

elif a.experiment=='join':
    fact=spark.range(a.rows,numPartitions=8).select(F.col('id').alias('i'),
        F.when(F.col('id')%10<8,F.lit(0)).otherwise((F.col('id')%999)+1).alias('k'))
    dim=spark.range(1000,numPartitions=2).select(F.col('id').alias('k'),(F.col('id')%7+1).alias('weight'))
    expected={'rows':a.rows,'weighted_sum':sum((0 if i%10<8 else i%999+1)%7+1 for i in range(a.rows))}
    def build(kind):
        if kind=='broadcast':return fact.join(F.broadcast(dim),'k')
        if kind=='salted':
            left=fact.withColumn('salt',(F.col('i')%8).cast('int'))
            right=dim.crossJoin(spark.range(8).select(F.col('id').cast('int').alias('salt')))
            return left.hint('merge').join(right.hint('merge'),['k','salt'])
        return fact.hint('merge').join(dim.hint('merge'),'k')
    def run(kind):
        q=build(kind); report['plans'][kind]=q._jdf.queryExecution().executedPlan().toString()
        # Capture distribution of the JOIN output before a final checksum aggregation.
        bins=q.rdd.mapPartitionsWithIndex(lambda p,rows:iter([(p,)+partition_join(rows)])).collect()
        return {'rows':sum(x[1] for x in bins),'weighted_sum':sum(x[2] for x in bins),
                'partition_rows':[x[1] for x in sorted(bins)]}
    trial([(name,lambda name=name:run(name)) for name in ['shuffle','broadcast','salted']])
    assert all({k:r['result'][k] for k in expected}==expected for r in report['runs'])
    report['observations']={'expected':expected,'hot_key_fraction':0.8,'dimension_rows':1000,
        'salt_buckets':8,'salted_dimension_rows':8000,
        'skew_note':'partition row counts measure imbalance; no network latency or production speedup claim'}

elif a.experiment=='recovery':
    def flaky(partition, rows):
        context=TaskContext.get()
        if partition==0 and context.attemptNumber()==0:
            raise RuntimeError('LAB_INJECTED_FIRST_ATTEMPT_FAILURE')
        yield (partition,context.attemptNumber(),sum(rows))
    traces=[]
    for repeat in range(a.repeats):
        got=action('retry',lambda:sc.parallelize(range(a.rows),8).mapPartitionsWithIndex(flaky).collect(),repeat,'retry')
        assert sum(x[2] for x in got)==a.rows*(a.rows-1)//2
        assert any(x[0]==0 and x[1]==1 for x in got)
        counter=sc.accumulator(0)
        def counted(rows):
            counter.add(1)
            for x in rows:yield x*2
        mapped=sc.parallelize(range(a.rows),8).mapPartitions(counted).persist(StorageLevel.MEMORY_ONLY)
        checkpoints=[]
        for label,drop in [('materialize',False),('reuse-cache',False),('after-unpersist',True)]:
            if drop:mapped.unpersist(blocking=True)
            before=counter.value
            value=action(label,lambda:int(mapped.sum()),repeat,label)
            checkpoints.append({'phase':label,'successful_partition_evaluations':counter.value-before,'sum':value})
        assert [x['successful_partition_evaluations'] for x in checkpoints]==[8,0,8]
        sc.setCheckpointDir((a.out/'checkpoints').resolve().as_uri())
        cp=sc.parallelize(range(a.rows),8).map(lambda x:x*2)
        before_lineage=cp.toDebugString().decode();cp.checkpoint()
        action('checkpoint',lambda:int(cp.sum()),repeat,'checkpoint')
        assert cp.isCheckpointed()
        after_lineage=cp.toDebugString().decode()
        assert 'ReliableCheckpointRDD' in after_lineage
        traces.append({'repeat':repeat,'cache_evaluations':checkpoints,'checkpoint_materialized':True,
                       'checkpoint_lineage_truncated':True})
    report['observations']={'traces':traces,
        'failure_scope':'one owned task raises an exception; no node/executor kill; local retry budget=2'}
    report['plans']={'before_checkpoint':before_lineage,'after_checkpoint':after_lineage}

elif a.experiment=='resources':
    source=spark.range(a.rows,numPartitions=8).select('id',
        ((F.col('id')*104729)%1000003).alias('sort_key'),
        F.concat_ws('',*[F.sha2(F.col('id').cast('string'),256)]*2).alias('payload'))
    def run(p):
        q=source.repartition(p).sortWithinPartitions('sort_key')
        report['plans'][f'partitions-{p}']=q._jdf.queryExecution().executedPlan().toString()
        bins=q.rdd.mapPartitions(resource_partition).collect()
        assert all(x[3] for x in bins)
        return {'rows':sum(x[0] for x in bins),'id_sum':sum(x[1] for x in bins),
                'payload_chars':sum(x[2] for x in bins),'locally_sorted':True}
    trial([(f'partitions-{p}',lambda p=p:run(p)) for p in [2,16]])
    assert all(r['result']['rows']==a.rows and r['result']['id_sum']==a.rows*(a.rows-1)//2
        and r['result']['payload_chars']==a.rows*128 for r in report['runs'])
    report['observations']={'spill_is_forced':True,'force_spill_element_threshold':8192,
        'payload_chars_per_row':128,'sort_scope':'within each partition; no global order guarantee',
        'warning':'Internal diagnostic knob, not an out-of-memory experiment or recommended production setting.'}

spark.stop()
# Plans can contain private local paths. Publish only cleaned text.
import re
for k,v in report['plans'].items():
    v=re.sub(r'file:/[^\s\],)]+','<local-file>',v)
    v=re.sub(r'/(?:Users|home|private|tmp)/[^\s\],)]+','<local-path>',v)
    report['plans'][k]=v
(a.out/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print('REPORT_OK',a.experiment,flush=True)
