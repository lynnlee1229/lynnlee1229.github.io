import {validateCollection, geometryPoints, geometryPolygons, bounds, areaLocation, spatialJoin, annotateJoin, trajectory, benchmarkData} from './engine.mjs?v=1.1';
import {$, h, t, table, metric, badge, download, readJsonFile, showError, showStatus} from '/learning-lab-assets/shared.mjs';

let fc = null, mode = 'fence', exported = null, sampleText = '', overlay = null, probe = null, transform = null;
const number = (x, digits = 2) => Number(x).toLocaleString(undefined, {maximumFractionDigits: digits});
const featureId = (f, i) => String(f.id ?? `feature-${i}`);
const locationName = x => ({inside: t('Inside', '内部'), boundary: t('Boundary', '边界'), outside: t('Outside', '外部')})[x];

function invalidate(error) {
  fc = null; exported = null; overlay = null; probe = null;
  $('export').disabled = true; $('results').replaceChildren(); $('metrics').replaceChildren(); draw();
  showError(error);
}

function draw() {
  const canvas = $('map'), box = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(box.width * dpr); canvas.height = Math.round(box.height * dpr);
  const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr);
  const w = box.width, ht = box.height;
  ctx.fillStyle = '#fafbf9'; ctx.fillRect(0, 0, w, ht);
  ctx.strokeStyle = '#e5ebe6'; ctx.lineWidth = .5;
  for (let x = 20; x < w; x += 30) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, ht); ctx.stroke(); }
  for (let y = 20; y < ht; y += 30) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  if (!fc) { transform = null; $('extent').textContent = '—'; return; }
  const coords = fc.features.flatMap(f => geometryPoints(f.geometry));
  if (probe) coords.push(probe);
  const b = bounds(coords), centerX = (b[0] + b[2]) / 2, centerY = (b[1] + b[3]) / 2;
  const cos = Math.max(.02, Math.cos(centerY * Math.PI / 180));
  const scale = Math.min((w - 60) / Math.max((b[2] - b[0]) * cos, .001), (ht - 60) / Math.max(b[3] - b[1], .001));
  const xy = p => [w / 2 + (p[0] - centerX) * cos * scale, ht / 2 - (p[1] - centerY) * scale];
  transform = {inverse: (x, y) => [centerX + (x - w / 2) / scale / cos, centerY - (y - ht / 2) / scale]};
  function path(points) { points.forEach((p, i) => { const q = xy(p); i ? ctx.lineTo(...q) : ctx.moveTo(...q); }); }
  for (const f of fc.features) for (const rings of geometryPolygons(f.geometry)) {
    ctx.beginPath(); for (const ring of rings) { path(ring); ctx.closePath(); }
    ctx.fillStyle = '#2071631c'; ctx.fill('evenodd'); ctx.strokeStyle = '#397e70'; ctx.lineWidth = 1.5; ctx.stroke();
  }
  for (const f of fc.features.filter(f => f.geometry.type === 'LineString')) {
    ctx.beginPath(); path(f.geometry.coordinates); ctx.strokeStyle = '#ba8a4d'; ctx.lineWidth = 2; ctx.stroke();
    for (const p of f.geometry.coordinates) { ctx.beginPath(); ctx.arc(...xy(p), 3, 0, Math.PI * 2); ctx.fillStyle = '#ba8a4d'; ctx.fill(); }
  }
  for (const f of fc.features.filter(f => f.geometry.type === 'Point')) {
    ctx.beginPath(); ctx.arc(...xy(f.geometry.coordinates), 3.5, 0, Math.PI * 2); ctx.fillStyle = '#465670'; ctx.fill();
  }
  if (overlay) for (const f of overlay.features) {
    ctx.beginPath(); path(f.geometry.coordinates); ctx.strokeStyle = '#156b61'; ctx.lineWidth = 2.5; ctx.setLineDash([7, 4]); ctx.stroke(); ctx.setLineDash([]);
  }
  if (probe) {
    const [x, y] = xy(probe); ctx.strokeStyle = '#ac4837'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.moveTo(x - 11, y); ctx.lineTo(x + 11, y); ctx.moveTo(x, y - 11); ctx.lineTo(x, y + 11); ctx.stroke();
  }
  ctx.fillStyle = '#657476'; ctx.font = '10px system-ui'; ctx.fillText('N ↑', 15, 20);
  $('extent').textContent = `${number(b[0], 4)}, ${number(b[1], 4)} → ${number(b[2], 4)}, ${number(b[3], 4)}`;
}

function setMetrics(...values) { $('metrics').replaceChildren(...values); }

function geofence() {
  const polygons = fc.features.map((f, i) => ({f, id: featureId(f, i)})).filter(x => geometryPolygons(x.f.geometry).length);
  if (!polygons.length) throw new Error(t('Add a Polygon or MultiPolygon to test a geofence.', '围栏实验需要 Polygon 或 MultiPolygon 要素。'));
  const selected = $('polygon').value;
  $('polygon').replaceChildren(...polygons.map(x => h('option', {value: x.id}, x.id)));
  if (polygons.some(x => x.id === selected)) $('polygon').value = selected;
  const polygon = polygons.find(x => x.id === $('polygon').value);
  const lon = $('lon').value, lat = $('lat').value;
  probe = [Number(lon), Number(lat)];
  if (!lon.trim() || !lat.trim() || !probe.every(Number.isFinite) || Math.abs(probe[0]) > 180 || Math.abs(probe[1]) > 90) throw new Error(t('Enter valid WGS84 longitude and latitude.', '请输入有效的 WGS84 经度和纬度。'));
  const b = bounds(fc.features.flatMap(f => geometryPoints(f.geometry)));
  if (Math.max(b[2], probe[0]) - Math.min(b[0], probe[0]) > 30 || Math.max(b[3], probe[1]) - Math.min(b[1], probe[1]) > 30) throw new Error(t('Probe must remain within a 30° regional extent.', '测试点与数据须位于 30° 范围内。'));
  const location = areaLocation(probe, polygon.f.geometry);
  const accepted = location === 'inside' || $('boundary').checked && location === 'boundary';
  setMetrics(metric(t('Location', '位置关系'), locationName(location), t('Boundary is reported explicitly', '边界单独报告')),
    metric(t('Membership', '是否命中'), accepted ? t('Yes', '是') : t('No', '否'), $('boundary').checked ? t('Include boundary', '包含边界') : t('Exclude boundary', '排除边界')),
    metric(t('Polygon', '围栏'), polygon.id, t('Planar ray crossing', '平面射线法')));
  $('results').replaceChildren(h('p', {class: 'hint'}, t('Click the coordinate plot to move the probe, or edit longitude/latitude. Holes are excluded; the hole edge is a boundary.', '点击坐标图移动测试点，也可直接修改经纬度。孔洞内部不命中，孔洞边缘属于边界。')),
    h('pre', {}, JSON.stringify({coordinate: probe, polygonId: polygon.id, location, accepted}, null, 2)));
  exported = {schemaVersion: 1, coordinate: [...probe], polygonId: polygon.id, includeBoundary: $('boundary').checked, location, accepted};
}

function join() {
  probe = null;
  const result = spatialJoin(fc, $('boundary').checked, true);
  const unique = new Set(result.matches.map(m => m.pointId)).size;
  setMetrics(metric(t('Matched points', '命中点数'), `${unique} / ${result.points}`, t('A point can match multiple polygons', '一个点可能命中多个区域')),
    metric(t('Match pairs', '关联对数'), result.matches.length, `${result.polygons} ${t('regions', '个区域')} · ${result.polygonComponents} ${t('components', '个分量')}`),
    metric(t('Exact tests', '精确判断'), `${result.exactTests} / ${result.possiblePairs}`, t('Bounding boxes reject impossible pairs', '先用包围盒过滤不可能的关联')));
  $('results').replaceChildren(table([t('Point', '点'), t('Polygon', '区域'), t('Location', '位置')], result.matches.slice(0, 500).map(m => [m.pointId, m.polygonId, locationName(m.location)])),
    h('p', {class: 'hint'}, t('Table shows up to 500 pairs; the download includes every match. This is a bounding-box prefilter, not an R-tree.', '表格最多展示 500 对，导出包含全部结果。这里使用包围盒预过滤，不是 R-tree。')));
  exported = annotateJoin(fc, result);
}

function track() {
  probe = null;
  if (!$('speed').value.trim()) throw new Error(t('Enter a speed threshold.', '请填写速度阈值。'));
  const result = trajectory(fc, Number($('speed').value));
  overlay = result.preview;
  setMetrics(metric(t('Segments', '轨迹线段'), result.segments.length, t('Haversine distance / elapsed time', '球面距离 ÷ 时间差')),
    metric(t('Fast segments', '超速线段'), result.segments.filter(s => s.flagged).length, `> ${$('speed').value} km/h`),
    metric(t('Isolated spikes', '孤立跳点'), result.flagged.length, t('Candidates for manual review', '供人工复核的候选点')));
  $('results').replaceChildren(table([t('Line', '轨迹'), t('Segment', '线段'), t('Meters', '米'), t('Seconds', '秒'), 'km/h', t('Flag', '标记')], result.segments.slice(0, 500).map(s => [s.lineId, `${s.from} → ${s.to}`, number(s.meters), number(s.seconds), number(s.kmh), badge(s.flagged ? t('FAST', '超阈值') : t('OK', '正常'), !s.flagged)])),
    h('p', {class: 'hint'}, t('Amber: original. Teal dashed: review preview. Only isolated spikes with a plausible bridge are removed from the preview. Original input stays intact; this is not road map matching.', '琥珀色为原轨迹，青色虚线为复核预览。仅在前后线段超速、跨越该点的速度合理时，才从预览中去除孤立跳点；原始输入保留。这不是道路匹配。')));
  exported = result.preview;
}

function analyze() {
  try {
    if (new Blob([$('json').value]).size > 2 * 1024 * 1024) throw new Error(t('Input exceeds 2 MB.', '输入超过 2 MB。'));
    fc = validateCollection(JSON.parse($('json').value)); overlay = null; probe = null;
    ({fence: geofence, join, trajectory: track})[mode]();
    $('export').disabled = false; draw();
    showStatus(`${fc.features.length} ${t('features checked in this tab.', '个要素已在当前浏览器完成检查。')}`);
  } catch (error) { invalidate(error); }
}

function chooseMode(next) {
  mode = next;
  for (const button of document.querySelectorAll('[data-mode]')) {
    button.setAttribute('aria-selected', String(button.dataset.mode === mode));
    button.tabIndex = button.dataset.mode === mode ? 0 : -1;
  }
  $('fence-controls').hidden = mode !== 'fence'; $('speed-controls').hidden = mode !== 'trajectory';
  analyze();
}
for (const button of document.querySelectorAll('[data-mode]')) button.addEventListener('click', () => chooseMode(button.dataset.mode));
for (const button of document.querySelectorAll('[data-mode]')) button.addEventListener('keydown', event => {
  const tabs = [...document.querySelectorAll('[data-mode]')], index = tabs.indexOf(button);
  const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : null;
  if (next === null) return;
  event.preventDefault(); tabs[next].focus(); chooseMode(tabs[next].dataset.mode);
});
$('run').addEventListener('click', analyze);
$('sample').addEventListener('click', () => { $('json').value = sampleText; $('lon').value = '114.3'; $('lat').value = '30.59'; $('boundary').checked = true; $('speed').value = '120'; analyze(); });
$('islands')?.addEventListener('click', async () => {
  try {
    const response = await fetch(new URL('./islands.geojson', import.meta.url));
    if (!response.ok) throw new Error('Islands exercise unavailable');
    $('json').value = await response.text(); $('lon').value = '2.5'; $('lat').value = '2.5';
    $('boundary').checked = true; chooseMode('join');
  } catch (error) { invalidate(error); }
});
for (const id of ['boundary', 'polygon', 'lon', 'lat', 'speed']) $(id).addEventListener('change', analyze);
$('file').addEventListener('change', async event => {
  try { $('json').value = await readJsonFile(event.target.files[0]); analyze(); } catch (error) { invalidate(error); }
  event.target.value = '';
});
$('map').addEventListener('click', event => {
  if (!transform || mode !== 'fence') return;
  const rect = event.currentTarget.getBoundingClientRect(), p = transform.inverse(event.clientX - rect.left, event.clientY - rect.top);
  $('lon').value = p[0].toFixed(6); $('lat').value = p[1].toFixed(6); analyze();
});
$('export').addEventListener('click', () => { if (exported) download(mode === 'fence' ? 'geofence-result.json' : mode === 'trajectory' ? 'trajectory-review.geojson' : 'spatial-join.geojson', exported); });

const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
$('benchmark').addEventListener('click', async () => {
  const button = $('benchmark'); button.disabled = true;
  $('benchmark-result').replaceChildren(h('p', {class: 'hint'}, t('Running seeded data locally…', '正在本地运行固定种子数据…')));
  await new Promise(resolve => setTimeout(resolve, 20));
  try {
    const data = benchmarkData(1500, 36, 42), times = {scan: [], bbox: []};
    let scan, bbox;
    for (let i = 0; i < 6; i++) {
      // Alternate order to reduce a fixed first-run advantage. The warm-up pair is discarded.
      for (const key of i % 2 ? ['bbox', 'scan'] : ['scan', 'bbox']) {
        const start = performance.now(), result = spatialJoin(data, true, key === 'bbox'), elapsed = performance.now() - start;
        if (i) times[key].push(elapsed);
        if (key === 'scan') scan = result; else bbox = result;
      }
    }
    const same = JSON.stringify(scan.matches) === JSON.stringify(bbox.matches);
    if (!same) throw new Error('Benchmark mismatch: methods returned different pairs');
    const result = {seed: 42, points: 1500, polygons: 36, repetitions: 5, validationIncluded: true, matchesEqual: same, matches: bbox.matches.length,
      scan: {medianMs: median(times.scan), exactTests: scan.exactTests}, bbox: {medianMs: median(times.bbox), exactTests: bbox.exactTests}};
    $('benchmark-result').replaceChildren(
      table([t('Method', '方法'), t('Exact tests', '精确判断'), t('Median ms', '中位耗时 ms')], [
        [t('Full pair scan', '全部点面配对'), scan.exactTests, number(result.scan.medianMs, 3)],
        [t('Bounding-box prefilter', '包围盒预过滤'), bbox.exactTests, number(result.bbox.medianMs, 3)]]),
      h('p', {class: 'hint'}, t('1,500 points × 36 polygons · seed 42 · 1 warm-up + 5 measured runs per method · equal results verified. Timings include input validation, depend on this device and are not production capacity estimates.', '1,500 点 × 36 面 · 种子 42 · 每种方法预热 1 次并测量 5 次 · 已核对关联结果一致。耗时包含输入校验，取决于当前设备，不能用于推算生产容量。')),
      h('button', {class: 'secondary', onclick: () => download('spatial-benchmark.json', result)}, t('Download benchmark', '下载基准结果')));
  } catch (error) { $('benchmark-result').replaceChildren(h('p', {class: 'status error'}, error.message)); }
  finally { button.disabled = false; }
});
new ResizeObserver(() => draw()).observe($('map'));
try {
  const response = await fetch(new URL('./sample.geojson', import.meta.url));
  if (!response.ok) throw new Error(t('Sample unavailable. Import GeoJSON or reload.', '示例无法加载，可导入 GeoJSON 或刷新重试。'));
  sampleText = await response.text(); $('json').value = sampleText; $('sample').disabled = false; analyze();
  if (new URLSearchParams(location.search).get('example') === 'islands') $('islands')?.click();
} catch (error) { invalidate(error); }
