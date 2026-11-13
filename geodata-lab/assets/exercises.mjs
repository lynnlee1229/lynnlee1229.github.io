// Original GeoData Lab exercises. These are not university assignment solutions.
import {validateCollection, areaLocation, polygonLocation, bounds, geometryPoints, spatialJoin, annotateJoin, haversine, trajectory} from './engine.mjs?v=1.1';

export const rect = (x, y, w, h) => [[x,y],[x+w,y],[x+w,y+h],[x,y+h],[x,y]];
export const feature = (id, geometry) => ({type:'Feature', id, properties:{source:'synthetic-lab'}, geometry});
export const collection = features => ({type:'FeatureCollection', features});
export function studyData() {
  return collection([
    feature('archipelago', {type:'MultiPolygon', coordinates:[
      [rect(0,0,6,6), rect(1,1,4,4)], [rect(8,0,2,2)], [rect(2,2,1,1)],
    ]}),
    feature('overlap-zone', {type:'Polygon', coordinates:[rect(8.5,.5,1,1)]}),
    ...[
      ['shell',[.5,.5]], ['hole',[4,4]], ['hole-edge',[1,3]], ['island',[2.5,2.5]],
      ['east',[9,1]], ['gap',[7,1]], ['outside',[11,1]], ['shell-edge',[0,3]], ['east-vertex',[8,0]],
    ].map(([id,coordinates]) => feature(id,{type:'Point',coordinates})),
  ]);
}
export function rejectionCases() {
  const multi = coordinates => collection([feature('region',{type:'MultiPolygon',coordinates})]);
  const single = coordinates => collection([feature('region',{type:'Polygon',coordinates})]);
  return [
    {id:'overlapping-components', input:multi([[rect(0,0,3,3)],[rect(2,2,3,3)]]), reason:'disjoint', geosValid:false},
    {id:'contained-component', input:multi([[rect(0,0,6,6)],[rect(2,2,1,1)]]), reason:'disjoint', geosValid:false},
    {id:'edge-touch', input:multi([[rect(0,0,2,2)],[rect(2,0,2,2)]]), reason:'disjoint', geosValid:false},
    {id:'point-touch-valid-ogc', input:multi([[rect(0,0,2,2)],[rect(2,2,2,2)]]), reason:'disjoint', geosValid:true},
    {id:'empty-multipart', input:multi([]), reason:'components'},
    {id:'malformed-multipart', input:multi([[null]]), reason:'positions'},
    {id:'unclosed-ring', input:single([rect(0,0,2,2).slice(0,-1)]), reason:'closed'},
    {id:'bow-tie', input:single([[[0,0],[3,2],[0,3],[3,0],[0,0]]]), reason:'intersect|area', geosValid:false},
    {id:'outside-hole', input:single([rect(0,0,3,3),rect(2,2,2,2)]), reason:'hole', geosValid:false},
    {id:'legacy-collection-crs', input:{...studyData(),crs:null}, reason:'crs'},
    {id:'legacy-feature-crs', input:collection([{...feature('p',{type:'Point',coordinates:[24,60]}),crs:{name:'EPSG:4326'}}]), reason:'crs'},
    {id:'legacy-geometry-crs', input:collection([feature('p',{type:'Point',coordinates:[24,60],crs:{name:'EPSG:4326'}})]), reason:'crs'},
    {id:'projected-meters', input:collection([feature('p',{type:'Point',coordinates:[385700,6672000]})]), reason:'WGS84'},
    {id:'altitude', input:collection([feature('p',{type:'Point',coordinates:[24,60,10]})]), reason:'2D'},
    {id:'antimeridian', input:single([[[179,0],[-179,0],[-179,1],[179,1],[179,0]]]), reason:'regional'},
    {id:'unsupported-collection', input:collection([feature('g',{type:'GeometryCollection',geometries:[]})]), reason:'supported'},
  ];
}
const equal = (a,b,label) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${label}: unexpected result`); };
const check = (ok,label) => { if (!ok) throw new Error(label); };
const pairs = result => result.matches.map(m => `${m.pointId}/${m.polygonId}`).sort();
export const unitIds = ['coordinates','boundary','multipart','join','prefilter','trajectory'];
export function runExercise(unit) {
  const data = studyData(), area = data.features[0].geometry;
  if (unit === 'coordinates') {
    const ids = ['legacy-collection-crs','legacy-feature-crs','legacy-geometry-crs','projected-meters','altitude','antimeridian','unsupported-collection'];
    const rejected = rejectionCases().filter(c => ids.includes(c.id)).map(c => {
      let message = '';
      try { validateCollection(c.input); } catch (error) { message = error.message; }
      check(new RegExp(c.reason).test(message), c.id);
      return {case:c.id, rejected:true, message};
    });
    const plausibleAxisOrders = [[24,60],[60,24]].map(coordinates => {
      validateCollection(collection([feature('p',{type:'Point',coordinates})])); return coordinates;
    });
    return {rejected, plausibleAxisOrders, lesson:'Range validation cannot detect plausible axis swaps or a mislabeled CRS.'};
  }
  if (unit === 'boundary') {
    const locations = [[.5,.5],[4,4],[1,3],[0,3]].map(point => ({point,location:areaLocation(point,area)}));
    equal(locations.map(r=>r.location), ['inside','outside','boundary','boundary'], 'shell and hole');
    const near = [-1e-11,1e-11,-1e-8,1e-8].map(x => ({point:[x,3],location:areaLocation([x,3],area)}));
    equal(near.map(r=>r.location), ['boundary','boundary','outside','inside'], 'tolerance band');
    return {locations, nearBoundary:near, toleranceDegrees:1e-10, lesson:'A numerical boundary tolerance is not a physical accuracy guarantee.'};
  }
  if (unit === 'multipart') {
    validateCollection(data);
    const locations = [[2.5,2.5],[9,1],[7,1],[4,4]].map(point=>({point,location:areaLocation(point,area)}));
    equal(locations.map(r=>r.location), ['inside','inside','outside','outside'], 'multipart');
    const rejected = rejectionCases().slice(0,9).map(c=> {
      let message=''; try { validateCollection(c.input); } catch(error) { message=error.message; }
      check(new RegExp(c.reason).test(message),c.id); return {case:c.id,message};
    });
    return {components:3,locations,rejected,lesson:'One feature can include an island in a hole and a detached component. Point touching is intentionally unsupported.'};
  }
  if (unit === 'join') {
    const original = JSON.stringify(data), included = spatialJoin(data), excluded = spatialJoin(data,false);
    equal(pairs(included), ['east/archipelago','east/overlap-zone','east-vertex/archipelago','hole-edge/archipelago','island/archipelago','shell/archipelago','shell-edge/archipelago'].sort(), 'inclusive join');
    equal(pairs(excluded), ['east/archipelago','east/overlap-zone','island/archipelago','shell/archipelago'].sort(), 'strict join');
    const annotated = annotateJoin(data,included);
    equal(JSON.stringify(data),original,'input immutability');
    check(annotated.features.find(f=>f.id==='hole').properties.lab_matches.length===0,'hole export');
    return {includeBoundary:included, excludeBoundary:excluded, originalUnchanged:true, lesson:'Contains excludes boundaries; covers includes them. Overlap yields two region IDs, not two component matches.'};
  }
  if (unit === 'prefilter') {
    const indexed=spatialJoin(data), scan=spatialJoin(data,true,false);
    equal(indexed.matches,scan.matches,'prefilter equivalence');
    const b=bounds(geometryPoints(area));
    const controls=data.features.filter(f=>['hole','gap','island','east','east-vertex'].includes(f.id)).map(f=>{
      const p=f.geometry.coordinates;
      return {pointId:f.id, exact:areaLocation(p,area), bboxCandidate:p[0]>=b[0]&&p[0]<=b[2]&&p[1]>=b[1]&&p[1]<=b[3], firstComponent:polygonLocation(p,area.coordinates[0])};
    });
    equal(controls.filter(r=>r.bboxCandidate&&r.exact==='outside').map(r=>r.pointId),['hole','gap'],'envelope false positives');
    equal(controls.filter(r=>r.firstComponent==='outside'&&r.exact!=='outside').map(r=>r.pointId),['island','east','east-vertex'],'first-component false negatives');
    return {matchesEqual:true, exactTests:{scan:scan.exactTests,prefilter:indexed.exactTests}, controls, lesson:'An envelope is a candidate filter. The first component is not a MultiPolygon.'};
  }
  if (unit === 'trajectory') {
    const line=feature('route',{type:'LineString',coordinates:[[0,0],[.001,0],[1,0],[.003,0],[.004,0]]});
    line.properties.timestamps=[0,1,2,3,4].map(i=>`2026-01-01T00:0${i}:00Z`);
    const input=collection([line]), original=JSON.stringify(input), report=trajectory(input,120);
    equal(report.flagged.map(p=>p.index),[2],'isolated spike'); equal(JSON.stringify(input),original,'track immutability');
    const distances = [0,60].map(lat=>({from:[0,lat],to:[1,lat],sphereMeters:haversine([0,lat],[1,lat])}));
    check(Math.abs(distances[0].sphereMeters-111195.0802335329)<1e-6,'one degree sphere');
    return {distances,fastSegments:report.segments.filter(s=>s.flagged).length,removedIndices:report.flagged.map(p=>p.index),retained:report.preview.features[0].geometry.coordinates.length,originalUnchanged:true,lesson:'Spherical distance differs from a WGS84 ellipsoidal inverse; speed spikes are review candidates.'};
  }
  throw new Error('Unknown exercise');
}
