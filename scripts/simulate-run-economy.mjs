import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { COMBINATIONS, MODES, simulateRun, engineFingerprint } from './simulate-tile-balance.mjs';

const args=process.argv.slice(2),arg=(name,fallback)=>args.includes(name)?args[args.indexOf(name)+1]:fallback;
const business=args.includes('--business'),mode=MODES[args.includes('--slow')?2:1];
const seed=20261106,runs=Number(arg('--runs',200)),horizonMs=120*60000;
if(!Number.isInteger(runs)||runs<1)throw new Error('Invalid run count.');
const output=resolve(arg('--out',business?'docs/analysis/run-economy-business-2026-11-06':'docs/analysis/run-economy-2026-11-06'));
const ids=arg('--ids','').split(',').filter(Boolean);
const scenarios=[
  ...COMBINATIONS.filter(c=>['classic','80-1','70-1','60-1'].includes(c.id)).map(combination=>({id:combination.id,combination,controls:{maxAdContinues:10}})),
  {id:'classic-paid',combination:COMBINATIONS[0],controls:{maxAdContinues:10,maxCreditContinues:5,reserveSp:200}},
].filter(s=>!ids.length||ids.includes(s.id)).map(s=>({...s,controls:{...s.controls,...(business?{business:true}:{})}}));
if(!scenarios.length)throw new Error('No matching scenarios.');
const results=[];
function quantile(values,fraction=.5) {
  // Missing milestones are right censored at the common active-time cutoff.
  const sorted=values.filter(v=>v!==null).sort((a,b)=>a-b);
  return sorted.length>=Math.ceil(values.length*fraction)?sorted[Math.ceil(values.length*fraction)-1]/60000:null;
}
for(const scenario of scenarios) {
  const samples=Array.from({length:runs},(_,i)=>simulateRun(scenario.combination,mode,seed+i,horizonMs,scenario.controls));
  const milestone=(ordinal,field)=>samples.map(r=>r.deaths[ordinal-1]?.[field]??null);
  const terminalOrdinal=scenario.controls.maxCreditContinues?16:11;
  const first=milestone(1,'activeTimeMs'),two=milestone(3,'wallTimeMs'),ten=milestone(11,'wallTimeMs'),terminal=milestone(terminalOrdinal,'wallTimeMs');
  const result={id:scenario.id,label:scenario.combination.label,controls:scenario.controls,n:runs,firstDeathMedianMinutes:quantile(first),firstDeathP25Minutes:quantile(first,.25),firstDeathP75Minutes:quantile(first,.75),afterTwoAdsMedianWallMinutes:quantile(two),afterTenAdsMedianWallMinutes:quantile(ten),afterTenAdsP25WallMinutes:quantile(ten,.25),afterTenAdsP75WallMinutes:quantile(ten,.75),terminalMedianWallMinutes:quantile(terminal),medianFirstCreditOfferWallMinutes:quantile(ten),fractionReachingCreditOnlyOffer:ten.filter(x=>x!==null).length/runs,aliveAt120ActiveMinutes:samples.filter(x=>x.alive).length/runs,medianSecondLifeActiveMinutes:quantile(samples.map(r=>r.deaths.length>=2?r.deaths[1].activeTimeMs-r.deaths[0].activeTimeMs:null)),averageAdsAtCutoff:samples.reduce((s,r)=>s+r.ads,0)/runs};
  results.push(result);
  process.stdout.write(JSON.stringify(result)+'\n');
}
mkdirSync(output,{recursive:true});
const assumptions={seed,node:process.version,engineSha256:engineFingerprint(),runsPerScenario:runs,totalRuns:runs*scenarios.length,horizonActiveMinutes:120,startingSp:300,startingHints:2,baseWrongTileDamage:5,stepMs:2000,mysteries:'All current core effects, cooldowns and pact policy from simulate-tile-balance.mjs',adAssumedSeconds:30,adClock:'Game clock frozen during ad; wall time includes completed ads',adAcceptance:'All available continues accepted, with guaranteed availability: mechanical upper-bound scenarios, not human behaviour',credits:'Paid case takes ten ads then five credits',reserve:'Paid case transfers 100 SP at <=50 SP until the actual 200 SP per-run allowance is exhausted',excluded:'Human quitting, ad no-fill, ad skipping, consent eligibility, purchase propensity, loading/store dwell time; no bought hints',censoring:'Null median if fewer than half reach a milestone before 120 active minutes; all cases share a common active-time cutoff'};
Object.assign(assumptions,{business,mode:mode.id,stepMs:mode.stepMs});
writeFileSync(resolve(output,'results.json'),JSON.stringify({assumptions,results},null,2)+'\n');
const fields=['id','n','firstDeathMedianMinutes','afterTwoAdsMedianWallMinutes','afterTenAdsMedianWallMinutes','medianSecondLifeActiveMinutes','terminalMedianWallMinutes','aliveAt120ActiveMinutes'];
writeFileSync(resolve(output,'results.csv'),fields.join(',')+'\n'+results.map(r=>fields.map(k=>r[k]??'').join(',')).join('\n')+'\n');
