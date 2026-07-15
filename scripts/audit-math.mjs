import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(new URL('..',import.meta.url).pathname);
const files=['second_version/index.html'];

function assert(ok,message){if(!ok)throw new Error(message);}
function comb(n,k){
  if(k<0||k>n)return 0;
  k=Math.min(k,n-k);let r=1;
  for(let i=1;i<=k;i++)r=r*(n-k+i)/i;
  return Math.round(r);
}
function extractLots(source){
  const marker='const LOTS=',start=source.indexOf(marker);
  assert(start>=0,'LOTS not found');
  const end=source.indexOf('\n};\nfunction resolveGameKey',start);
  assert(end>=0,'LOTS end not found');
  const objectSource=source.slice(start+marker.length,end+2);
  return Function('"use strict";return ('+objectSource+');')();
}
function extractFunction(source,name){
  const token='function '+name+'(',start=source.indexOf(token);
  assert(start>=0,name+' not found');
  let brace=source.indexOf('{',start),depth=0,quote='',escaped=false;
  for(let i=brace;i<source.length;i++){
    const ch=source[i];
    if(quote){
      if(escaped)escaped=false;
      else if(ch==='\\')escaped=true;
      else if(ch===quote)quote='';
      continue;
    }
    if(ch==='"'||ch==="'"||ch==='`'){quote=ch;continue;}
    if(ch==='{')depth++;
    if(ch==='}'&&--depth===0)return source.slice(start,i+1);
  }
  throw new Error(name+' closing brace not found');
}
function buildCase(l,match){
  const [mText,bText]=String(match).split('+'),mainHits=Number(mText),bonusHits=bText===undefined?0:Number(bText);
  const drawMain=Array.from({length:l.pM},(_,i)=>i+1);
  const drawBonus=l.pBo>0?Array.from({length:l.pBo},(_,i)=>i+1):[l.pM+1];
  const ticketMain=drawMain.slice(0,mainHits);
  if(l.pBo===0&&bonusHits===1)ticketMain.push(drawBonus[0]);
  for(let n=l.mB;ticketMain.length<l.pM&&n>=1;n--){
    if(!drawMain.includes(n)&&!drawBonus.includes(n)&&!ticketMain.includes(n))ticketMain.push(n);
  }
  const ticketBonus=[];
  if(l.pBo>0){
    ticketBonus.push(...drawBonus.slice(0,bonusHits));
    for(let n=l.bB;ticketBonus.length<l.pBo&&n>=1;n--){if(!drawBonus.includes(n)&&!ticketBonus.includes(n))ticketBonus.push(n);}
  }
  return{ticketMain,ticketBonus,drawMain,drawBonus};
}

const reports=[];
for(const relative of files){
  const source=fs.readFileSync(path.join(root,relative),'utf8');
  const lots=extractLots(source);
  const checkSource=extractFunction(source,'checkPrize');
  const multiplierSource=extractFunction(source,'megaMultiplier');
  const estimateSource=extractFunction(source,'estimatePrizeNok');
  const chooseSource=extractFunction(source,'chooseBig');
  const rankSource=extractFunction(source,'combinationRank');
  const unrankSource=extractFunction(source,'combinationUnrank');
  const api=Function(checkSource+'\n'+multiplierSource+'\n'+estimateSource+'\nreturn {checkPrize,estimatePrizeNok};')();
  const uniqueApi=Function(chooseSource+'\n'+rankSource+'\n'+unrankSource+'\nreturn {chooseBig,combinationRank,combinationUnrank};')();
  let tierTests=0;
  let uniqueTests=0;
  for(const [id,l] of Object.entries(lots)){
    assert(l.id===id,relative+': '+id+' id mismatch');
    const combinations=comb(l.mB,l.pM)*(l.pBo?comb(l.bB,l.pBo):1);
    assert(combinations===l.combos,relative+': '+id+' jackpot combinations '+combinations+' != '+l.combos);
    assert(l.timeZone&&l.tzLabel,relative+': '+id+' timezone missing');
    assert(Array.isArray(l.tiers)&&l.tiers.length,relative+': '+id+' prize tiers missing');
    const totalMain=uniqueApi.chooseBig(l.mB,l.pM);
    assert(totalMain===BigInt(comb(l.mB,l.pM)),relative+': '+id+' unique-cycle size mismatch');
    for(const rank of [0n,totalMain/2n,totalMain-1n]){
      const row=uniqueApi.combinationUnrank(rank,l.mB,l.pM);
      assert(row.length===l.pM&&new Set(row).size===l.pM,relative+': '+id+' invalid unranked row');
      assert(uniqueApi.combinationRank(row,l.mB,l.pM)===rank,relative+': '+id+' rank/unrank mismatch at '+rank);
      uniqueTests++;
    }
    for(const tier of l.tiers){
      const c=buildCase(l,tier.match),prize=api.checkPrize(c.ticketMain,c.ticketBonus,c.drawMain,c.drawBonus,l);
      const expected=tier.match;
      assert(prize?.key===expected,relative+': '+id+' tier '+tier.match+' resolved as '+(prize?.key||'none'));
      const value=api.estimatePrizeNok({key:tier.match,name:tier.label,lvl:0},l);
      assert(Number.isFinite(value)&&value>0,relative+': '+id+' tier '+tier.match+' has no positive estimate');
      tierTests++;
    }
    const first=l.tiers[0],last=l.tiers[l.tiers.length-1];
    assert(api.estimatePrizeNok({key:first.match},l)>api.estimatePrizeNok({key:last.match},l),relative+': '+id+' jackpot and minimum payout must differ');
  }
  assert(lots.superenalotto.drawDays.includes(5),relative+': SuperEnalotto Friday missing');
  assert(lots.lottomax.price===1.5&&lots.lottomax.minR===4&&lots.lottomax.packagePrice===6,relative+': Lotto Max package pricing wrong');
  assert(lots.euro.tiers[5].match==='3+2'&&lots.euro.tiers[6].match==='4+0',relative+': EuroJackpot categories 6/7 wrong');
  assert(/nextUniqueMain\(l,'simulation'\)/.test(source),relative+': simulator does not use the no-repeat sequence');
  assert(source.includes('UNIQUE_MODEL_HISTORY_LIMIT=20000'),relative+': generated-row history protection missing');
  assert(source.includes('В реальном независимом тираже повтор возможен'),relative+': repeat-behaviour disclosure missing');
  reports.push({file:relative,games:Object.keys(lots).length,tierTests,uniqueTests});
}

/* Exhaustively prove the combinatorial rank/unrank bijection on a compact model. */
{
  const source=fs.readFileSync(path.join(root,'second_version/index.html'),'utf8');
  const uniqueApi=Function(extractFunction(source,'chooseBig')+'\n'+extractFunction(source,'combinationRank')+'\n'+extractFunction(source,'combinationUnrank')+'\nreturn {chooseBig,combinationRank,combinationUnrank};')();
  const total=uniqueApi.chooseBig(10,5),seen=new Set();
  for(let rank=0n;rank<total;rank++){
    const row=uniqueApi.combinationUnrank(rank,10,5),key=row.join(',');
    assert(!seen.has(key),'duplicate in compact no-repeat cycle at rank '+rank);
    seen.add(key);
    assert(uniqueApi.combinationRank(row,10,5)===rank,'compact cycle round-trip failed at '+rank);
  }
  assert(seen.size===Number(total),'compact cycle did not cover every combination');
}

const results=JSON.parse(fs.readFileSync(path.join(root,'results.json'),'utf8'));
const updateScript=fs.readFileSync(path.join(root,'scripts/update-results-db.mjs'),'utf8');
const packageJson=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
assert(updateScript.includes('fetchLottoMaxArchivePdf')&&updateScript.includes("pdfjs-dist/legacy/build/pdf.mjs"),'lottoMax: automatic WCLC PDF parser missing');
assert(packageJson.dependencies?.['pdfjs-dist'],'lottoMax: PDF parser dependency missing');
const resultToApp={lotto:'lotto',vikinglotto:'viking',eurojackpot:'euro',powerball:'powerball',megaMillions:'mega',euroMillions:'euromillions',superEnalotto:'superenalotto',lottoMax:'lottomax',powerballAustralia:'powerballau'};
const auditLots=extractLots(fs.readFileSync(path.join(root,'second_version/index.html'),'utf8'));
let drawCount=0;
for(const [id,draws] of Object.entries(results.games||{})){
  const l=auditLots[resultToApp[id]];assert(l,id+': no matching game rules');
  const seen=new Set();
  for(const draw of draws){
    assert(/^\d{4}-\d{2}-\d{2}$/.test(draw.date),id+': invalid date');
    assert(!seen.has(draw.date),id+': duplicate date '+draw.date);seen.add(draw.date);
    assert(draw.main.length===l.pM,id+': wrong main count '+draw.date);
    assert((draw.bonus||[]).length===(l.offBo||l.pBo),id+': wrong bonus count '+draw.date);
    assert(new Set(draw.main).size===draw.main.length,id+': duplicated main number '+draw.date);
    assert(new Set(draw.bonus||[]).size===(draw.bonus||[]).length,id+': duplicated bonus number '+draw.date);
    assert(draw.main.every(n=>Number.isInteger(n)&&n>=1&&n<=l.mB),id+': main range error '+draw.date);
    assert((draw.bonus||[]).every(n=>Number.isInteger(n)&&n>=1&&n<=l.bB),id+': bonus range error '+draw.date);
    drawCount++;
  }
}

let archiveDrawCount=0;
const archivePath=path.join(root,'results-archive.json');
if(fs.existsSync(archivePath)){
  const archive=JSON.parse(fs.readFileSync(archivePath,'utf8'));
  assert(archive.purpose==='historical-display-and-research','archive: unsafe or missing purpose marker');
  const minimumArchiveDepth={
    lotto:758,vikinglotto:751,eurojackpot:972,powerball:1966,
    megaMillions:2519,euroMillions:1963,superEnalotto:4231,
    lottoMax:1250,powerballAustralia:1573
  };
  const expectedOldest={
    lotto:'2012-01-07',vikinglotto:'2012-02-22',eurojackpot:'2012-03-23',
    powerball:'2010-02-03',megaMillions:'2002-05-17',euroMillions:'2004-02-13',
    superEnalotto:'1997-12-03',lottoMax:'2009-09-25',powerballAustralia:'1996-05-23'
  };
  const lottoMaxArchive=archive.games?.lottoMax||[];
  assert(lottoMaxArchive.length>=1200,'lottoMax: full WCLC PDF archive was not imported');
  assert(lottoMaxArchive.at(-1)?.date==='2009-09-25','lottoMax: WCLC archive inception date missing');
  for(const [id,draws] of Object.entries(archive.games||{})){
    assert(draws.length>=(minimumArchiveDepth[id]||0),id+': archive depth regressed to '+draws.length);
    assert(draws.at(-1)?.date===expectedOldest[id],id+': archive start regressed to '+draws.at(-1)?.date);
    const versions=archive.ruleVersions?.[id]||[];
    assert(versions.length>0,id+': historical rule registry missing');
    const seen=new Set(),currentByDate=new Map((results.games?.[id]||[]).map(d=>[d.date,d]));
    for(const draw of draws){
      assert(/^\d{4}-\d{2}-\d{2}$/.test(draw.date),id+': archive invalid date');
      assert(!seen.has(draw.date),id+': archive duplicate date '+draw.date);seen.add(draw.date);
      assert(draw.ruleEra==='current'||draw.ruleEra==='legacy',id+': archive rule era missing '+draw.date);
      const era=versions.find(v=>v.id===draw.ruleVersion&&draw.date>=v.from&&(!v.to||draw.date<=v.to));
      assert(era,id+': unknown or date-incompatible rule version '+draw.ruleVersion+' '+draw.date);
      assert(Array.isArray(draw.main)&&draw.main.length>0,id+': archive empty main '+draw.date);
      assert(draw.main.length===era.mainCount,id+': archive main count does not match '+era.id+' '+draw.date);
      const archiveBonus=Array.isArray(draw.extraGroups)&&draw.extraGroups.length
        ? draw.extraGroups.flatMap(group=>group.numbers||[])
        : (draw.bonus||[]);
      assert(archiveBonus.length===era.bonusCount,id+': archive bonus count does not match '+era.id+' '+draw.date);
      assert(new Set(draw.main).size===draw.main.length,id+': archive duplicate main '+draw.date);
      assert(draw.main.every(n=>Number.isInteger(n)&&n>=1&&n<=era.mainMax),id+': archive main range '+draw.date);
      assert(archiveBonus.every(n=>Number.isInteger(n)&&n>=1&&n<=era.bonusMax),id+': archive bonus range '+draw.date);
      if(draw.ruleEra==='current'&&currentByDate.has(draw.date)){
        const live=currentByDate.get(draw.date);
        assert(draw.main.join(',')===live.main.join(',')&&(draw.bonus||[]).join(',')===(live.bonus||[]).join(','),id+': archive/live mismatch '+draw.date);
      }
      archiveDrawCount++;
    }
  }
}
console.log(JSON.stringify({ok:true,reports,drawCount,archiveDrawCount},null,2));
