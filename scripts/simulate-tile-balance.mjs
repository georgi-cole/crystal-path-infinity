import { mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  CLASSIC_STORE_RULESET_VERSION, createPracticeCursor, createRun,
  PRACTICE_RNG, transitionRun, tileExperimentVersion,
} from '../packages/game-core/src/index.ts';

export const COMBINATIONS = [
  {id:'classic',label:'Original 50/50',high:100,low:0,classic:true},
  ...[80,70,60,50,45,40,30,20,10].map(high=>({id:`${high}-1`,label:`${high}% / 1%`,high,low:1,classic:false})),
  {id:'50-50',label:'Independent 50% / 50%',high:50,low:50,classic:false},
];
export const MODES = [
  {id:'tiles-only',label:'Tiles only · 2s per step',stepMs:2000,mysteries:false,hints:false},
  {id:'full',label:'Mysteries + resource-aware bot · 2s per step',stepMs:2000,mysteries:true,hints:true},
  {id:'slow',label:'Same bot · 4s per step',stepMs:4000,mysteries:true,hints:true},
];
function coinSource(seed) {
  let value=(seed ^ 0xa531f967) >>> 0;
  if(!value)value=1;
  return ()=>{ value ^= value<<13; value ^= value>>>17; value ^= value<<5; return (value>>>0)/4294967296; };
}

/** Only public SP/hints/pact and the bot's observed break frequency inform deals.
 * No route, future tiles, RNG cursor, or hidden high/low assignment is available. */
export function chooseOffer(view, estimatedBreakRate) {
  const {pact,sp,hints}=view;
  switch(pact.kind) {
    case 'blood_oath': return 'accept';
    case 'false_oracle': return view.revealed ? 'decline' : 'accept';
    case 'marketing': return hints>0?'sell_all':'decline';
    case 'half_life': return sp>=2 && sp<=30 && hints<2?'accept':'decline';
    case 'borrowed_time': return sp<25?'accept':'decline';
    case 'soul_exchange': return hints>0?'hint':'sp';
    case 'hungry_vault': {
      const s=1-estimatedBreakRate;
      const expected=85*s*s*s-10*(1-s*s*s)-12;
      return sp>35 && expected>-8?'accept':'decline';
    }
    default: throw new Error('Unmodelled pact: '+pact.kind);
  }
}
function viewOf(state) {
  return {sp:state.sp,hints:state.hints,pact:state.pact,revealed:state.current.revealedSafeSide!==null||!!state.current.noSafeTile};
}
export function simulateRun(combination, mode, seed, horizonMs=600000, controls={}) {
  const {maxAdContinues=0,maxCreditContinues=0,reserveSp=0,adDurationMs=30000}=controls;
  if(!Number.isInteger(maxAdContinues)||maxAdContinues<0||maxAdContinues>10||!Number.isInteger(maxCreditContinues)||maxCreditContinues<0||maxCreditContinues+maxAdContinues>15||!Number.isInteger(reserveSp)||reserveSp<0||reserveSp>200||!Number.isFinite(adDurationMs)||adDurationMs<0)throw new Error('Invalid continuation controls.');
  const version=combination.classic?CLASSIC_STORE_RULESET_VERSION:tileExperimentVersion(combination.high,combination.low,true);
  const routeSeed=BigInt(seed)+0x71fa9b4d832e1471n;
  let state=createRun({runId:`practice-simulation-${seed}`,rulesetVersion:version,routeRng:createPracticeCursor(routeSeed),mysteryRng:createPracticeCursor(routeSeed^0x9e3779b97f4a7c15n),observedAt:0},PRACTICE_RNG);
  const random=coinSource(seed);
  let breakObservations=0,blindObservations=0;
  let lowSp=false,wrong=0,steps=0,hints=0,boxes=0,clockLoss=0,positiveSp=0,negativeSp=0;
  let guard=0;
  let ads=0,credits=0,adWallMs=0;
  const deaths=[];
  function resource(kind,amount=1) {
    const result=transitionRun(state,{type:'test-resource',resource:kind,amount,sequence:state.storeTest.sequence+1},{rng:PRACTICE_RNG,activeTimeMs:state.activeTimeMs,achievedAt:state.activeTimeMs});
    if(!result.accepted)throw new Error(`Resource rejected: ${result.reason} (${kind})`);
    state=result.state;
  }
  function act(command, delay=0) {
    if(state.status!=='playing'||state.activeTimeMs>=horizonMs)return false;
    const previousSp=state.sp;
    const target=Math.min(horizonMs,state.activeTimeMs+delay);
    const clipped=state.activeTimeMs+delay>horizonMs;
    const fullCommand=command.type==='tick'?command:{...command,row:state.currentRow,life:state.revivesApplied};
    const result=transitionRun(state,clipped?{type:'tick'}:fullCommand,{rng:PRACTICE_RNG,activeTimeMs:target,achievedAt:target});
    state=result.state;
    if(!result.accepted && state.status==='playing')throw new Error(`Bot rejected: ${result.reason} (${command.type})`);
    if(state.status==='playing'&&state.sp<=50)lowSp=true;
    positiveSp+=Math.max(0,state.sp-previousSp);
    negativeSp+=Math.max(0,previousSp-state.sp);
    for(const event of result.events) {
      if(event.type==='mystery-resolved')boxes++;
      if(event.type==='hint-used')hints++;
      if(event.type==='death-clock-ticked')clockLoss-=event.delta;
      if(event.type==='choice-resolved'){steps++;if(event.wrong)wrong++;}
    }
    if(state.status!=='playing' && state.death) {
      deaths.push({ordinal:deaths.length+1,activeTimeMs:state.activeTimeMs,wallTimeMs:state.activeTimeMs+adWallMs,rows:Number(state.lastClearedRow),ads,credits,cause:state.death.cause});
      if(state.status==='dead' && !clipped && state.activeTimeMs<horizonMs) {
        if(ads<maxAdContinues) {resource('ad');ads++;adWallMs+=adDurationMs;}
        else if(credits<maxCreditContinues) {resource('credit');credits++;}
      }
    }
    return !clipped && state.status==='playing' && state.activeTimeMs<horizonMs;
  }
  while(state.status==='playing' && state.activeTimeMs<horizonMs) {
    if(++guard>10000)throw new Error('Simulation command budget exceeded.');
    if(state.sp<=50 && state.storeTest && state.storeTest.reserveSpent<reserveSp)resource('sp',Math.min(100,reserveSp-state.storeTest.reserveSpent));
    const estimated=(breakObservations+2)/(blindObservations+4);
    if(mode.mysteries && state.pact?.phase==='active') {
      if(state.pact.kind==='hungry_vault' && state.pact.bank>0) {
        // Compare the next bank increase to the bank forfeited on a break.
        const nextBank=state.pact.bank===15?40:85;
        const gain=(1-estimated)*(nextBank-state.pact.bank)-estimated*(state.pact.bank+10);
        if(gain<=0 || state.sp<25) if(!act({type:'pact',option:'cashout'},150))break;
      } else if(state.pact.kind==='borrowed_time' && state.pact.rowsLeft<3 && state.sp>=85) {
        if(!act({type:'pact',option:'settle'},150))break;
      }
    }
    // hasMystery is already a visible box on the current row. No hidden risk is read.
    const current=state.rows.find(row=>BigInt(row.index)+1n===BigInt(state.currentRow));
    if(mode.mysteries && current.hasMystery && state.current.mysteryOutcome===null) {
      if(!act({type:'mystery'},350))break;
      if(state.pact?.phase==='offered') {
        if(!act({type:'pact',option:chooseOffer(viewOf(state),estimated)},2000))break;
      } else if(!act({type:'tick'},state.discovery?.introduction?1500:500))break;
    }
    const oracle=state.pact?.kind==='false_oracle' && state.pact.phase==='active';
    const protectBank=state.pact?.kind==='hungry_vault' && state.pact.bank>=40;
    if(mode.hints && state.hints>0 && !oracle && !state.current.revealedSafeSide && !state.current.noSafeTile && (state.sp<=50 || protectBank)) {
      if(!act({type:'hint'},800))break;
    }
    const confirmed=state.current.revealedSafeSide;
    const omen=oracle?state.pact.omen:null;
    const side=confirmed??omen??(random()<.5?'left':'right');
    const oldWrong=wrong;
    if(!act({type:'choose',side},mode.stepMs))break;
    if(!confirmed && !omen) {blindObservations++;breakObservations+=wrong-oldWrong;}
  }
  return {timeMs:state.activeTimeMs,alive:state.status==='playing',rows:Number(state.lastClearedRow),sp:state.sp,lowSp,wrong,steps,hints,boxes,clockLoss,positiveSp,negativeSp,deathCause:state.death?.cause??null,...(Object.keys(controls).length?{deaths,ads,credits,wallTimeMs:state.activeTimeMs+adWallMs,reserveSp:state.storeTest.reserveSpent}:{} )};
}
export function wilson(success,n) {
  if(!n)return [0,0];
  const z=1.959963984540054,p=success/n,d=1+z*z/n,c=(p+z*z/(2*n))/d,e=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n))/d;
  return [c-e,c+e];
}
export function summarize(runs,horizonMs) {
  const n=runs.length,dead=runs.filter(r=>!r.alive).map(r=>r.timeMs).sort((a,b)=>a-b);
  const alive=runs.filter(r=>r.alive).length;
  const average=key=>runs.reduce((sum,r)=>sum+r[key],0)/n;
  const median=dead.length>=Math.ceil(n/2)?dead[Math.ceil(n/2)-1]:null;
  return {
    n,medianDeathMinutes:median===null?null:median/60000,
    survivalAtHorizon:alive/n,survival95CI:wilson(alive,n),
    restrictedMeanMinutes:average('timeMs')/60000,
    lowSpFraction:runs.filter(r=>r.lowSp).length/n,
    averageRows:average('rows'),averageEndSp:average('sp'),
    averageWrongTiles:average('wrong'),averageHintsUsed:average('hints'),averageBoxes:average('boxes'),
    averageClockSpLoss:average('clockLoss'),
    observedBreakRate:runs.reduce((s,r)=>s+r.wrong,0)/Math.max(1,runs.reduce((s,r)=>s+r.steps,0)),
    deathCauses:Object.fromEntries(['wrong_tile','mystery','drain','death_clock'].map(c=>[c,runs.filter(r=>r.deathCause===c).length])),
    survivalCurve:Array.from({length:21},(_,i)=>{const at=horizonMs*i/20;return {minutes:at/60000,fraction:runs.filter(r=>r.timeMs>at || (r.alive && r.timeMs>=at)).length/n};}),
  };
}
export function engineFingerprint() {
  const folder=fileURLToPath(new URL('../packages/game-core/src/',import.meta.url));
  const hash=createHash('sha256');
  for(const name of readdirSync(folder).filter(n=>n.endsWith('.ts')).sort())hash.update(name).update(readFileSync(resolve(folder,name)));
  return hash.digest('hex');
}
function table(results,mode,minutes=10) {
  const percent=p=>(p*100).toFixed(1)+'%';
  return [`| Combination | Blind break chance | Median to death | Alive at ${minutes} min | Reached ≤50 SP while alive | Mean rows |`, '|---|---:|---:|---:|---:|---:|',...results.filter(r=>r.mode===mode).map(r=>`| ${r.label} | ${percent(r.blindBreakProbability)} | ${r.medianDeathMinutes===null?'>'+minutes+' min':r.medianDeathMinutes.toFixed(2)+' min'} | ${percent(r.survivalAtHorizon)} | ${percent(r.lowSpFraction)} | ${r.averageRows.toFixed(1)} |`)].join('\n');
}
export function renderHtml(report) {
  const data=JSON.stringify(report).replaceAll('<','\\u003c');
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Crystal Path · Tile balance simulations</title><style>body{font:16px/1.5 system-ui;max-width:1150px;margin:2rem auto;padding:0 1rem;background:#101018;color:#e9e3ef}h1{font-size:1.8rem}p,small{color:#b6adbf}select{padding:.7rem;background:#221b2d;color:inherit;border:1px solid #8d6a9a;border-radius:6px}svg{width:100%;background:#17141d;border-radius:10px;margin:1rem 0}table{border-collapse:collapse;width:100%;font-size:.88rem}th,td{text-align:right;padding:.7rem;border-bottom:1px solid #43364c}th:first-child,td:first-child{text-align:left}.scroll{overflow:auto}.legend{display:flex;flex-wrap:wrap;gap:1rem}.legend span{white-space:nowrap}a{color:#9ce1d8}</style><h1>Crystal Path · Tile balance simulations</h1><p>Mechanical survival, not human engagement or purchase intent. ${report.runsPerCell.toLocaleString()} runs per combination and bot mode. ${report.horizonMinutes}-minute administrative cutoff. No purchases or continuations.</p><label>Bot mode <select id="mode">${MODES.filter(m=>report.results.some(r=>r.mode===m.id)).map(m=>`<option value="${m.id}">${m.label}</option>`).join('')}</select></label><p id="assumptions"></p><div class="legend" id="legend"></div><div id="plot"></div><div class="scroll"><table><thead><tr><th>Combination</th><th>Blind break</th><th>Both break</th><th>Median death</th><th>Alive at cutoff (95% CI)</th><th>Reached ≤50 SP</th><th>Mean rows</th><th>Mean end SP</th></tr></thead><tbody id="rows"></tbody></table></div><p>“&gt;cutoff” means the median has not been observed. Dead runs contribute zero ending SP. Low SP means observed while still alive. Confidence intervals describe Monte Carlo sampling error only.</p><details><summary>Reproducibility and limitations</summary><pre id="meta"></pre><p>Same seeds across combinations; independent bot choice stream. Current game reducer, mystery weights, cooldowns and progressive clock. Human learning, voluntary quitting, retention and sales are not modelled. The resource-aware bot uses its observed break frequency, hints, public omens and balances, never the private tile assignments.</p></details><script>const report=${data};const colors=['#f6c778','#aab5ff','#bc8bcf','#73d4e1','#e998b0','#a2e093','#68b8ff','#f7a065','#a1d8cf','#d59cf2','#d2d1dd'];const pct=n=>(n*100).toFixed(1)+'%';const pct2=n=>(n*100).toFixed(2)+'%';const selected=new Set(['classic','80-1','70-1','60-1','40-1','20-1']);function draw(){const id=document.querySelector('#mode').value,items=report.results.filter(r=>r.mode===id);document.querySelector('#assumptions').textContent=id==='tiles-only'?'No hints or mystery boxes. This control isolates tile odds and constant 5 SP damage.':'All visible boxes opened; hints at low SP or to protect a vault; public-omen following, SP/hint trades and fixed pact decisions. '+(id==='slow'?'Four-second steps activate the progressive death clock.':'Two-second steps.');document.querySelector('#rows').innerHTML=items.map(r=>'<tr><td>'+r.label+'</td><td>'+pct(r.blindBreakProbability)+'</td><td>'+pct2(r.bothBreakProbability)+'</td><td>'+(r.medianDeathMinutes===null?'&gt;'+report.horizonMinutes:r.medianDeathMinutes.toFixed(2))+' min</td><td>'+pct(r.survivalAtHorizon)+' ('+r.survival95CI.map(pct).join('–')+')</td><td>'+pct(r.lowSpFraction)+'</td><td>'+r.averageRows.toFixed(1)+'</td><td>'+r.averageEndSp.toFixed(1)+'</td></tr>').join('');let svg='<svg viewBox="0 0 900 420" role="img" aria-label="Mechanical survival curves"><text x="58" y="25" fill="#b6adbf" font-size="14">Share of runs still alive</text>';for(let i=0;i<=4;i++){let y=45+i*75;svg+='<path d="M60 '+y+'H860" stroke="#43364c"/><text x="50" y="'+(y+5)+'" fill="#aaa" font-size="12" text-anchor="end">'+(100-i*25)+'%</text>';}for(let i=0;i<=10;i+=2)svg+='<text x="'+(60+i/10*800)+'" y="375" fill="#aaa" font-size="12" text-anchor="middle">'+(i/10*report.horizonMinutes)+'</text>';svg+='<text x="460" y="402" fill="#aaa" text-anchor="middle" font-size="13">Minutes in a run</text>';let legend='';items.forEach((r,i)=>{if(!selected.has(r.id))return;svg+='<polyline points="'+r.survivalCurve.map(p=>(60+p.minutes/report.horizonMinutes*800)+','+(345-p.fraction*300)).join(' ')+'" fill="none" stroke="'+colors[i]+'" stroke-width="2.5"/>';legend+='<span style="color:'+colors[i]+'">● '+r.label+'</span>';});document.querySelector('#legend').innerHTML=legend;document.querySelector('#plot').innerHTML=svg+'</svg>';}document.querySelector('#mode').value='full';document.querySelector('#mode').addEventListener('change',draw);document.querySelector('#meta').textContent=JSON.stringify({seed:report.seed,node:report.node,engineSha256:report.engineSha256,totalRuns:report.totalRuns,assumptions:report.assumptions},null,2);draw();</script></html>`;
}
export function reportTables(report) { return MODES.filter(m=>report.results.some(r=>r.mode===m.id)).map(m=>'## '+m.label+'\n\n'+table(report.results,m.id,report.horizonMinutes)).join('\n\n')+'\n'; }
export async function main(args=process.argv.slice(2)) {
  const arg=(key,fallback)=>{const i=args.indexOf(key);return i<0?fallback:args[i+1];};
  const runs=Number(arg('--runs',1000)),seed=Number(arg('--seed',20261106)),horizonMinutes=Number(arg('--minutes',10));
  if(!Number.isInteger(runs)||runs<1||!Number.isInteger(seed)||!Number.isFinite(horizonMinutes)||horizonMinutes<=0)throw new Error('Invalid simulation settings.');
  const wanted=arg('--combinations','').split(',').filter(Boolean),wantedModes=arg('--modes','').split(',').filter(Boolean);
  const combinations=wanted.length?COMBINATIONS.filter(c=>wanted.includes(c.id)):COMBINATIONS;
  const modes=wantedModes.length?MODES.filter(m=>wantedModes.includes(m.id)):MODES;
  if(!combinations.length||!modes.length)throw new Error('No matching combinations/modes.');
  const results=[],start=performance.now();
  for(const mode of modes) for(const combination of combinations) {
    const samples=Array.from({length:runs},(_,i)=>simulateRun(combination,mode,seed+i,horizonMinutes*60000));
    results.push({id:combination.id,label:combination.label,mode:mode.id,highBreakPercent:combination.high,lowBreakPercent:combination.low,blindBreakProbability:(combination.high+combination.low)/200,bothBreakProbability:combination.classic?0:combination.high*combination.low/10000,...summarize(samples,horizonMinutes*60000)});
    process.stdout.write(`${mode.id} ${combination.label}: ${runs} runs (${((performance.now()-start)/1000).toFixed(1)}s)\n`);
  }
  const report={schemaVersion:1,seed,node:process.version,runsPerCell:runs,totalRuns:runs*results.length,horizonMinutes,engineSha256:engineFingerprint(),assumptions:{startingSp:300,wrongTileSp:5,startingHints:2,mysteries:'current production reducer, 5–7 rows with rifts/cooldowns',purchases:0,continuations:0,firstDiscoveryReadMs:1500,pactReadMs:2000,hintReadMs:800,sideChoice:'independent seeded coin, except a public hint or oracle omen',pactPolicy:'blood oath/oracle accepted; half life only at ≤30 SP with <2 hints; loans below25; all hints sold; sacrifice hint if possible; vault decisions from observed break frequency with Beta(2,2) prior'},results};
  const out=resolve(arg('--out','docs/analysis/tile-balance-2026-11-06'));
  mkdirSync(out,{recursive:true});
  writeFileSync(resolve(out,'results.json'),JSON.stringify(report,null,2)+'\n');
  const fields=['id','mode','n','blindBreakProbability','bothBreakProbability','medianDeathMinutes','survivalAtHorizon','restrictedMeanMinutes','lowSpFraction','averageRows','averageEndSp','averageWrongTiles','averageHintsUsed','averageBoxes','averageClockSpLoss','observedBreakRate'];
  writeFileSync(resolve(out,'results.csv'),fields.join(',')+'\n'+results.map(r=>fields.map(k=>r[k]??'').join(',')).join('\n')+'\n');
  writeFileSync(resolve(out,'report.html'),renderHtml(report));
  writeFileSync(resolve(out,'TABLES.md'),reportTables(report));
  process.stdout.write(`Saved ${report.totalRuns} simulated runs to ${out}\n`);
  return report;
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)await main();
