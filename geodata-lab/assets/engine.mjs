// Small-region, WGS84 2D geometry. No network, map tiles or third-party runtime.
const EPS = 1e-10;
const assert = (ok, msg) => { if (!ok) throw new Error(msg); };
const finite = n => typeof n === 'number' && Number.isFinite(n);
const same = (a, b) => a[0] === b[0] && a[1] === b[1];
const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
const onSegment = (p, a, b) => Math.abs(cross(a, b, p)) <= EPS * Math.hypot(b[0] - a[0], b[1] - a[1]) &&
  p[0] >= Math.min(a[0], b[0]) - EPS && p[0] <= Math.max(a[0], b[0]) + EPS &&
  p[1] >= Math.min(a[1], b[1]) - EPS && p[1] <= Math.max(a[1], b[1]) + EPS;

function intersects(a, b, c, d) {
  const x = cross(a, b, c), y = cross(a, b, d), z = cross(c, d, a), w = cross(c, d, b);
  const ab = EPS * Math.hypot(b[0] - a[0], b[1] - a[1]), cd = EPS * Math.hypot(d[0] - c[0], d[1] - c[1]);
  return ((x > ab && y < -ab || x < -ab && y > ab) && (z > cd && w < -cd || z < -cd && w > cd)) ||
    onSegment(a, c, d) || onSegment(b, c, d) || onSegment(c, a, b) || onSegment(d, a, b);
}

export function ringLocation(p, ring) {
  let inside = false;
  for (let i = 0; i < ring.length - 1; i++) {
    const a = ring[i], b = ring[i + 1];
    if (onSegment(p, a, b)) return 'boundary';
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside ? 'inside' : 'outside';
}

export function polygonLocation(p, rings) {
  const outer = ringLocation(p, rings[0]);
  if (outer !== 'inside') return outer;
  for (const hole of rings.slice(1)) {
    const where = ringLocation(p, hole);
    if (where === 'boundary') return 'boundary';
    if (where === 'inside') return 'outside';
  }
  return 'inside';
}

export function bounds(coords) {
  return coords.reduce((b, p) => [Math.min(b[0], p[0]), Math.min(b[1], p[1]), Math.max(b[2], p[0]), Math.max(b[3], p[1])], [Infinity, Infinity, -Infinity, -Infinity]);
}
export const geometryPolygons = g => g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
export const geometryPoints = g => g.type === 'Point' ? [g.coordinates] : g.type === 'LineString' ? g.coordinates : geometryPolygons(g).flat(2);

// One region ID can contain disconnected components. Never treat its envelope as its area.
export function areaLocation(p, geometry) {
  let boundary = false;
  for (const rings of geometryPolygons(geometry)) {
    const location = polygonLocation(p, rings);
    if (location === 'inside') return 'inside';
    if (location === 'boundary') boundary = true;
  }
  return boundary ? 'boundary' : 'outside';
}

function ringsIntersect(a, b) {
  for (let i = 0; i < a.length - 1; i++) for (let j = 0; j < b.length - 1; j++)
    if (intersects(a[i], a[i + 1], b[j], b[j + 1])) return true;
  return false;
}

export function validateCollection(fc) {
  assert(fc && fc.type === 'FeatureCollection' && Array.isArray(fc.features), 'Expected a GeoJSON FeatureCollection');
  assert(!Object.hasOwn(fc, 'crs'), 'Use WGS84 longitude/latitude; legacy crs is unsupported');
  assert(fc.features.length > 0 && fc.features.length <= 10000, 'Use 1–10,000 features');
  let total = 0, polygonCount = 0;
  const all = [], ids = new Set();
  fc.features.forEach((f, index) => {
    assert(f && f.type === 'Feature' && f.geometry && ['Point', 'Polygon', 'MultiPolygon', 'LineString'].includes(f.geometry.type), `Feature ${index}: supported types are Point, Polygon, MultiPolygon, LineString`);
    assert(!Object.hasOwn(f, 'crs') && !Object.hasOwn(f.geometry, 'crs'), `Feature ${index}: legacy crs is unsupported; convert to WGS84 before importing`);
    assert(f.properties === null || f.properties === undefined || (typeof f.properties === 'object' && !Array.isArray(f.properties)), `Feature ${index}: invalid properties`);
    const id = f.id ?? `feature-${index}`;
    assert((typeof id === 'string' || typeof id === 'number' && finite(id)) && !ids.has(String(id)), `Feature ${index}: duplicate or invalid id`);
    ids.add(String(id));
    const g = f.geometry;
    assert(Array.isArray(g.coordinates), `Feature ${index}: coordinates must be an array`);
    if (g.type === 'MultiPolygon') assert(g.coordinates.length > 0 && g.coordinates.length <= 20 && g.coordinates.every(Array.isArray), `Feature ${index}: use 1–20 MultiPolygon components`);
    const components = geometryPolygons(g);
    polygonCount += components.length;
    assert(polygonCount <= 200, 'At most 200 polygon components per input');
    for (const rings of components) {
      assert(rings.length > 0 && rings.length <= 20, `Feature ${index}: use 1–20 polygon rings per component`);
      assert(rings.every(r => Array.isArray(r) && r.length >= 4 && r.length <= 600 && r.every(Array.isArray)), `Feature ${index}: rings need 4–600 positions`);
    }
    if (g.type === 'LineString') assert(g.coordinates.length >= 2 && g.coordinates.every(Array.isArray), `Feature ${index}: a line needs at least 2 positions`);
    const points = geometryPoints(g);
    for (const p of points) {
      assert(Array.isArray(p) && p.length === 2 && finite(p[0]) && finite(p[1]) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90, `Feature ${index}: positions must be [longitude, latitude] in WGS84 (2D)`);
    }
    total += points.length;
    assert(total <= 20000, 'At most 20,000 positions per input');
    all.push(...points);
    for (const rings of components) {
      for (const ring of rings) {
        assert(same(ring[0], ring.at(-1)), `Feature ${index}: polygon rings must be closed`);
        assert(ring.slice(1).every((p, i) => !same(p, ring[i])), `Feature ${index}: repeated adjacent ring vertex`);
        // Translate before area calculation to reduce cancellation at large longitudes.
        const o = ring[0];
        const area2 = ring.slice(0, -1).reduce((sum, a, i) => sum + cross(o, a, ring[i + 1]), 0);
        assert(Math.abs(area2) > EPS ** 2, `Feature ${index}: polygon ring has zero area`);
        for (let i = 0; i < ring.length - 1; i++) for (let j = i + 2; j < ring.length - 1; j++) {
          if (i === 0 && j === ring.length - 2) continue;
          assert(!intersects(ring[i], ring[i + 1], ring[j], ring[j + 1]), `Feature ${index}: self-intersecting ring`);
        }
      }
      for (let i = 1; i < rings.length; i++) {
        const h = rings[i];
        assert(ringLocation(h[0], rings[0]) === 'inside' && !ringsIntersect(h, rings[0]), `Feature ${index}: hole must be strictly within exterior ring`);
        for (let j = 1; j < i; j++) assert(!ringsIntersect(h, rings[j]) && ringLocation(h[0], rings[j]) === 'outside' && ringLocation(rings[j][0], h) === 'outside', `Feature ${index}: holes must be disjoint`);
      }
    }
    for (let i = 1; i < components.length; i++) for (let j = 0; j < i; j++) {
      const a = components[i], b = components[j];
      // Deliberately narrower than OGC: even point-touching components are rejected.
      // A component wholly within another component's hole is allowed.
      assert(!a.some(r => b.some(s => ringsIntersect(r, s))) && polygonLocation(a[0][0], b) === 'outside' && polygonLocation(b[0][0], a) === 'outside', `Feature ${index}: MultiPolygon components must be strictly disjoint (touching is unsupported)`);
    }
  });
  const b = bounds(all);
  assert(b[2] - b[0] <= 30 && b[3] - b[1] <= 30, 'Use a regional extent up to 30° per axis; antimeridian/global geometry is unsupported');
  return fc;
}

function items(fc, type) {
  const types = Array.isArray(type) ? type : [type];
  return fc.features.map((f, i) => ({...f, id: String(f.id ?? `feature-${i}`)})).filter(f => types.includes(f.geometry.type));
}

export function spatialJoin(fc, includeBoundary = true, indexed = true) {
  validateCollection(fc);
  const points = items(fc, 'Point'), polygons = items(fc, ['Polygon', 'MultiPolygon']);
  const polygonComponents = polygons.reduce((n, f) => n + geometryPolygons(f.geometry).length, 0);
  assert(points.length > 0 && polygons.length > 0, 'Spatial join needs Point and Polygon or MultiPolygon features');
  assert(points.length * polygonComponents <= 1000000, 'At most 1,000,000 point/component pairs per analysis');
  const prepared = polygons.map(f => ({feature: f, bbox: bounds(geometryPoints(f.geometry))}));
  let exactTests = 0;
  const matches = [];
  for (const p of points) for (const polygon of prepared) {
    const [x, y] = p.geometry.coordinates, b = polygon.bbox;
    if (indexed && (x < b[0] - EPS || x > b[2] + EPS || y < b[1] - EPS || y > b[3] + EPS)) continue;
    exactTests++;
    const location = areaLocation(p.geometry.coordinates, polygon.feature.geometry);
    if (location === 'inside' || includeBoundary && location === 'boundary') {
      assert(matches.length < 100000, 'More than 100,000 matches; split the input into smaller regions');
      matches.push({pointId: p.id, polygonId: polygon.feature.id, location});
    }
  }
  return {matches, exactTests, possiblePairs: points.length * polygons.length, points: points.length, polygons: polygons.length, polygonComponents};
}

export function haversine(a, b) {
  const rad = Math.PI / 180, dLat = (b[1] - a[1]) * rad, dLon = (b[0] - a[0]) * rad;
  const q = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLon / 2) ** 2;
  return 6371008.8 * 2 * Math.asin(Math.sqrt(Math.max(0, Math.min(1, q))));
}

export function trajectory(fc, maxKmh = 120) {
  validateCollection(fc);
  assert(finite(maxKmh) && maxKmh > 0 && maxKmh <= 2000, 'Speed threshold must be > 0 and <= 2000 km/h');
  const lines = items(fc, 'LineString');
  assert(lines.length > 0, 'Trajectory checks need a LineString with properties.timestamps');
  const segments = [], flagged = [], retained = [];
  for (const line of lines) {
    const points = line.geometry.coordinates, timestamps = line.properties?.timestamps;
    assert(Array.isArray(timestamps) && timestamps.length === points.length, `${line.id}: timestamps must match positions`);
    const times = timestamps.map(t => {
      const parts = typeof t === 'string' && /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/.exec(t);
      if (!parts) return NaN;
      const [, ys, ms, ds, hs, mins, ss] = parts, y = +ys, month = +ms, day = +ds;
      const days = [31, y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
      if (month < 1 || month > 12 || day < 1 || day > days[month - 1] || +hs > 23 || +mins > 59 || +ss > 59) return NaN;
      return Date.parse(t);
    });
    assert(times.every(finite) && times.slice(1).every((t, i) => t > times[i]), `${line.id}: use strictly increasing ISO timestamps with timezone`);
    for (let i = 1; i < points.length; i++) {
      const meters = haversine(points[i - 1], points[i]);
      const seconds = (times[i] - times[i - 1]) / 1000, kmh = meters / seconds * 3.6;
      segments.push({lineId: line.id, from: i - 1, to: i, meters, seconds, kmh, flagged: kmh > maxKmh});
    }
    // Flag an isolated spike only when both adjacent edges are fast but its bridge is plausible.
    // Adjacent candidate spikes are deliberately not auto-selected.
    const selected = [];
    for (let i = 1; i < points.length - 1; i++) {
      const before = haversine(points[i - 1], points[i]) / (times[i] - times[i - 1]) * 3600;
      const after = haversine(points[i], points[i + 1]) / (times[i + 1] - times[i]) * 3600;
      const bridge = haversine(points[i - 1], points[i + 1]) / (times[i + 1] - times[i - 1]) * 3600;
      if (before > maxKmh && after > maxKmh && bridge <= maxKmh) selected.push(i);
    }
    const isolated = selected.filter(i => !selected.includes(i - 1) && !selected.includes(i + 1));
    for (const i of isolated) flagged.push({lineId: line.id, index: i, coordinate: points[i]});
    const keep = points.map((_, i) => i).filter(i => !isolated.includes(i));
    retained.push({...line, properties: {...line.properties, timestamps: keep.map(i => timestamps[i]), lab: {method: 'isolated-speed-spike', maxKmh, removedIndices: isolated}}, geometry: {...line.geometry, coordinates: keep.map(i => points[i])}});
  }
  return {segments, flagged, preview: {type: 'FeatureCollection', features: retained}};
}

export function annotateJoin(fc, result) {
  const byPoint = new Map();
  for (const match of result.matches) {
    if (!byPoint.has(match.pointId)) byPoint.set(match.pointId, []);
    byPoint.get(match.pointId).push(match);
  }
  return {type: 'FeatureCollection', features: fc.features.map((f, i) => f.geometry.type !== 'Point' ? structuredClone(f) : {
    ...structuredClone(f), properties: {...f.properties, lab_matches: byPoint.get(String(f.id ?? `feature-${i}`)) || []},
  })};
}

export function benchmarkData(pointCount = 1500, polygonCount = 36, seed = 42) {
  assert(Number.isInteger(pointCount) && pointCount > 0 && pointCount <= 8000 && Number.isInteger(polygonCount) && polygonCount > 0 && polygonCount <= 100, 'Benchmark bounds exceeded');
  let state = seed >>> 0;
  const random = () => ((state = (Math.imul(1664525, state) + 1013904223) >>> 0) / 4294967296);
  const features = [], n = Math.ceil(Math.sqrt(polygonCount));
  for (let i = 0; i < polygonCount; i++) {
    const x = 114 + i % n * .015, y = 30 + Math.floor(i / n) * .015;
    features.push({type: 'Feature', id: `zone-${i}`, properties: {}, geometry: {type: 'Polygon', coordinates: [[[x, y], [x + .009, y], [x + .009, y + .009], [x, y + .009], [x, y]]]}});
  }
  for (let i = 0; i < pointCount; i++) features.push({type: 'Feature', id: `point-${i}`, properties: {}, geometry: {type: 'Point', coordinates: [114 + random() * n * .015, 30 + random() * n * .015]}});
  return {type: 'FeatureCollection', features};
}
