#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const appFile = path.join(root, 'second_version/index.html');
const source = fs.readFileSync(appFile, 'utf8');
const results = JSON.parse(fs.readFileSync(path.join(root, 'results.json'), 'utf8'));

function assert(ok, message) { if (!ok) throw new Error(message); }
function extractFunction(name) {
  const token = `function ${name}(`;
  let start = source.indexOf(token);
  assert(start >= 0, `${name}: function not found`);
  if (source.slice(Math.max(0, start - 6), start) === 'async ') start -= 6;
  const brace = source.indexOf('{', start);
  let depth = 0, quote = '', escaped = false;
  for (let i = brace; i < source.length; i++) {
    const ch = source[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if (ch === '{') depth++;
    if (ch === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`${name}: closing brace not found`);
}
function extractLots() {
  const marker = 'const LOTS=', start = source.indexOf(marker);
  const end = source.indexOf('\n};\nfunction resolveGameKey', start);
  assert(start >= 0 && end >= 0, 'LOTS registry not found');
  return Function(`"use strict";return (${source.slice(start + marker.length, end + 2)});`)();
}
function seededMath(seed = 0x8badf00d) {
  const m = Object.create(Math);
  let state = seed >>> 0;
  m.random = () => ((state = (state * 1664525 + 1013904223) >>> 0) / 4294967296);
  return m;
}

const helperNames = ['weightedDistinct', 'balancedAllocation', 'physicsDraw', 'chaosDraw', 'buildFreq', 'rangeNums', 'uniqValid'];
const helperSource = helperNames.map(extractFunction).join('\n');
const generateSource = extractFunction('generateRowsByAlgo');

function makeGenerator(lot, fixture, seed = 1) {
  const localMath = seededMath(seed);
  return Function('fixture', 'lot', 'Math', 'performance', `
    let cur=lot.id,lastQuantumSrc='';
    function L(){return lot;}
    async function loadD(){return fixture;}
    function IF_window(draws){return draws;}
    function drawBonusCount(l){return l.pBo||0;}
    function secureUint32(){return Math.floor(Math.random()*4294967296)>>>0;}
    function secureInt(max){return Math.floor(Math.random()*max);}
    function rnd(max,cnt,ex=[]){const a=[];for(let n=1;n<=max;n++)if(!ex.includes(n))a.push(n);for(let i=a.length-1;i>0;i--){const j=secureInt(i+1);[a[i],a[j]]=[a[j],a[i]];}return a.slice(0,cnt).sort((x,y)=>x-y);}
    function shufSlice(arr,n){const a=[...arr];for(let i=a.length-1;i>0;i--){const j=secureInt(i+1);[a[i],a[j]]=[a[j],a[i]];}return a.slice(0,n).sort((x,y)=>x-y);}
    function genBonus(l){return l.pBo&&l.bB?rnd(l.bB,l.pBo):[];}
    function getFilterSettings(){return{parity:false,sum:false,consecutive:false};}
    function normalizeRow(r,l){return{m:[...new Set(r.m||[])].filter(n=>Number.isInteger(n)&&n>=1&&n<=l.mB).sort((a,b)=>a-b).slice(0,l.pM),b:[...new Set(r.b||[])].filter(n=>Number.isInteger(n)&&n>=1&&n<=l.bB).sort((a,b)=>a-b).slice(0,l.pBo||0)};}
    function filterGeneratedRows(out,count,l){const rows=[],seen=new Set();for(const raw of out||[]){const r=normalizeRow(raw,l),key=r.m.join(',');if(r.m.length===l.pM&&!seen.has(key)){seen.add(key);rows.push(r);if(rows.length===count)break;}}while(rows.length<count){const r={m:rnd(l.mB,l.pM),b:genBonus(l)},key=r.m.join(',');if(!seen.has(key)){seen.add(key);rows.push(r);}}return rows;}
    async function quantumStream(){let x=0x12345678;return{src:'audit deterministic QRNG stub',next:()=>((x=(x*1664525+1013904223)>>>0)/4294967296)};}
    ${helperSource}
    ${generateSource}
    return generateRowsByAlgo;
  `)(fixture, lot, localMath, { now: () => 1234.567 });
}

function validateRows(rows, l, label) {
  assert(Array.isArray(rows) && rows.length > 0, `${label}: no rows`);
  const seen = new Set();
  for (const row of rows) {
    assert(row.m.length === l.pM, `${label}: main count ${row.m.length}`);
    assert(new Set(row.m).size === row.m.length, `${label}: duplicate main number`);
    assert(row.m.every((n) => Number.isInteger(n) && n >= 1 && n <= l.mB), `${label}: main range`);
    assert((row.b || []).length === (l.pBo || 0), `${label}: bonus count`);
    assert((row.b || []).every((n) => Number.isInteger(n) && n >= 1 && n <= l.bB), `${label}: bonus range`);
    const key = row.m.join(',');
    assert(!seen.has(key), `${label}: repeated row in batch`);
    seen.add(key);
  }
}

/* Exact source-level invariants: names must correspond to the implemented formula. */
const formulaChecks = [
  ['frequency weights', /\(freq\.get\(n\)\|\|0\)\+\.05/],
  ['balanced 40/30/30 allocation', /Math\.round\(k\*\.4\)/],
  ['Markov Laplace conditional probability', /\(T\.get\(a\+'-'\+n\)\|\|0\)\+1\)\/\(\(originTotals\.get\(a\)\|\|0\)\+l\.mB\)/],
  ['Gaussian finite-population variance', /l\.pM\*\(l\.mB\+1\)\*\(l\.mB-l\.pM\)\/12/],
  ['interval bootstrap', /pool\.push\(s\[i\]-s\[i-1\]\)/],
  ['Dirichlet alpha 3', /\(freq\.get\(n\)\|\|0\)\+3/],
  ['gap ratio exponent', /Math\.pow\(gapOf\(n\)\/expGap,1\.6\)\+\.15/],
  ['logistic chaos r=3.99', /const R=3\.99/],
  ['physical equal-mass normal impulse', /a\.vx\+=rel\*nx.*d\.vx-=rel\*nx/],
  ['quantum exponential barrier', /Math\.exp\(-1\.15\*\(freq\.get\(n\)\|\|0\)\/avg\)\+\.02/]
];
for (const [name, re] of formulaChecks) assert(re.test(source), `formula missing: ${name}`);

/* Allocation is exactly 40/30/30 in aggregate for the common five-number games. */
const balancedAllocation = Function(`${extractFunction('balancedAllocation')};return balancedAllocation;`)();
const allocation = Array.from({ length: 10 }, (_, i) => balancedAllocation(5, i));
assert(allocation.reduce((s, x) => s + x.hot, 0) === 20, 'balance: hot aggregate');
assert(allocation.reduce((s, x) => s + x.mid, 0) === 15, 'balance: mid aggregate');
assert(allocation.reduce((s, x) => s + x.cold, 0) === 15, 'balance: cold aggregate');

const lots = extractLots();
const dbToApp = { lotto: 'lotto', vikinglotto: 'viking', eurojackpot: 'euro', powerball: 'powerball', megaMillions: 'mega', euroMillions: 'euromillions', superEnalotto: 'superenalotto', lottoMax: 'lottomax', powerballAustralia: 'powerballau' };
const coreModels = ['freq', 'bal', 'rnd', 'man', 'markov', 'gauss', 'delta', 'bayes', 'overdue', 'phys', 'chaos', 'quantum'];
const reports = [];

for (const [dbId, appId] of Object.entries(dbToApp)) {
  const l = lots[appId], draws = results.games?.[dbId] || [];
  assert(l && draws.length >= 5, `${dbId}: insufficient fixture data`);
  let testedRows = 0;
  for (let i = 0; i < coreModels.length; i++) {
    const model = coreModels[i], count = model === 'phys' ? 4 : 12;
    const rows = await makeGenerator(l, draws, i + 1000 * (reports.length + 1))(model, count);
    validateRows(rows, l, `${dbId}/${model}`);
    testedRows += rows.length;
  }
  reports.push({ game: dbId, draws: draws.length, models: coreModels.length, testedRows });
}

/* Behavioural checks on deliberately skewed history. */
const toy = { id: 'toy', mB: 20, pM: 5, bB: 0, pBo: 0 };
const skewed = Array.from({ length: 80 }, (_, i) => ({
  date: `2025-${String(1 + Math.floor(i / 28)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`,
  main: [1, 2, 3, 4, 5 + (i % 15)].sort((a, b) => a - b), bonus: []
})).reverse();
for (const model of ['freq', 'bayes']) {
  let hot = 0, cold = 0;
  for (let seed = 1; seed <= 180; seed++) {
    const [row] = await makeGenerator(toy, skewed, seed)(model, 1);
    hot += row.m.includes(1); cold += row.m.includes(20);
  }
  assert(hot > cold * 2, `${model}: observed frequencies do not influence weights`);
}
{
  const l = { ...toy, pM: 1, mB: 8 };
  const chain = Array.from({ length: 80 }, (_, i) => ({ main: [i % 2 ? 2 : 1], bonus: [] }));
  let target = 0, other = 0;
  for (let seed = 1; seed <= 240; seed++) {
    const [row] = await makeGenerator(l, chain, seed)('markov', 1);
    target += row.m[0] === 2; other += row.m[0] === 8;
  }
  assert(target > other * 3, 'markov: learned transition is not reflected in output');
}

console.log(JSON.stringify({ ok: true, games: reports.length, modelRuns: reports.length * coreModels.length, formulaChecks: formulaChecks.length, reports }, null, 2));
