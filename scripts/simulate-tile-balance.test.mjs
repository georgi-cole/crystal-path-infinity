import assert from 'node:assert/strict';
import test from 'node:test';
import { COMBINATIONS, MODES, chooseOffer, simulateRun, summarize } from './simulate-tile-balance.mjs';

test('all-breaking control loses the first life on the 60th step',()=>{
  const result=simulateRun({classic:false,high:100,low:100},MODES[0],20261106);
  assert.equal(result.alive,false);assert.equal(result.rows,59);assert.equal(result.steps,60);assert.equal(result.timeMs,120000);assert.equal(result.sp,0);
});
test('all-intact control is right censored with its SP intact',()=>{
  const result=simulateRun({classic:false,high:0,low:0},MODES[0],20261106,60000);
  assert.equal(result.alive,true);assert.equal(result.sp,300);assert.equal(result.rows,30);
  const summary=summarize([result],60000);assert.equal(summary.medianDeathMinutes,null);assert.equal(summary.survivalAtHorizon,1);
});
test('seeded original control agrees with the negative-binomial 119 cleared-row expectation',()=>{
  const results=Array.from({length:300},(_,i)=>simulateRun(COMBINATIONS[0],MODES[0],20261106+i));
  const average=results.reduce((s,r)=>s+r.rows,0)/results.length;
  assert.ok(average>114 && average<124,`mean ${average}`);
  assert.equal(summarize(results,600000).survivalAtHorizon,0);
});
test('full-game runs reproduce exactly and deal policy needs no private route',()=>{
  assert.deepEqual(simulateRun(COMBINATIONS[3],MODES[1],44),simulateRun(COMBINATIONS[3],MODES[1],44));
  const view={sp:100,hints:1,pact:{kind:'hungry_vault'},revealed:false,get rows(){throw Error('Private route read');},get mysteryRng(){throw Error('Private RNG read');}};
  assert.equal(chooseOffer(view,.5),'decline');assert.equal(chooseOffer(view,.1),'accept');
});
