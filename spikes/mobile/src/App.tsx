import { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as NativeApp } from '@capacitor/app';
import type { PluginListenerHandle } from '@capacitor/core';
import { adEvent, beginAttempt, mayRestore, recordRestore, recordVerification } from './ad-gate';
import type { AdEvent, AdGate } from './ad-gate';
import { NativeAdProbe } from './native-ads';
import { AudioProbe } from './audio-probe';
import { normalizeEndpoint, ProbeApi } from './probe-api';
import type { ProbeState, ProbeSession, RewardIntent, TimingSample } from './probe-api';

type Log = { time: string; message: string };
type StepCommand = { sequence: number; side: 'left' | 'right'; idempotencyKey: string };
const native = Capacitor.isNativePlatform();
const platform = Capacitor.getPlatform();
const validPlatform = platform === 'android' || platform === 'ios' ? platform : 'web';
const formatMs = (value: number | undefined) => value === undefined ? '—' : `${Math.round(value)} ms`;
function percentile(samples: number[], q: number) {
  if (!samples.length) return undefined;
  const sorted = [...samples].sort((a,b) => a-b);
  return sorted[Math.max(0, Math.ceil(sorted.length * q) - 1)];
}

export function App() {
  const [endpoint, setEndpoint] = useState('');
  const [session, setSession] = useState<ProbeSession | null>(null);
  const [state, setState] = useState<ProbeState | null>(null);
  const [gate, setGate] = useState<AdGate | null>(null);
  const [intent, setIntent] = useState<RewardIntent | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [logs, setLogs] = useState<Log[]>([]);
  const [samples, setSamples] = useState<TimingSample[]>([]);
  const [frameSamples, setFrameSamples] = useState<number[]>([]);
  const [visible, setVisible] = useState(!document.hidden);
  const [nativeActive, setNativeActive] = useState(true);
  const [paused, setPaused] = useState(false);
  const [sound, setSound] = useState(false);
  const [callbackOnly, setCallbackOnly] = useState(false);
  const [metrics, setMetrics] = useState<Record<string, unknown> | null>(null);
  const [pendingStep, setPendingStep] = useState<StepCommand | null>(null);
  const pendingStepRef = useRef<StepCommand | null>(null);
  const gateRef = useRef<AdGate | null>(null);
  const stateRef = useRef<ProbeState | null>(null);
  const apiRef = useRef<ProbeApi | null>(null);
  const busyRef = useRef(false);
  const alive = useRef(true);
  const audio = useRef<AudioProbe | null>(null);
  const ads = useRef<NativeAdProbe | null>(null);
  const foreground = visible && nativeActive;
  const fullscreen = Boolean(gate && gate.showRequested && !gate.adClosed);
  const pendingNative = gate?.mode === 'native' && gate.phase !== 'failed' && gate.phase !== 'restored';
  const inputAllowed = state?.status === 'playing' && foreground && !paused && !fullscreen && !busy && !callbackOnly && !pendingStep;
  const sp = state?.sp ?? 300;
  const nextRevive = (state?.revivesApplied ?? 0) + 1;
  const nextSp = nextRevive <= 5 ? 200 : 150;

  function log(message: string) {
    if (alive.current) setLogs(previous => [...previous.slice(-149), { time: new Date().toISOString(), message }]);
  }
  function changeGate(next: AdGate | null) { gateRef.current = next; if (alive.current) setGate(next); }
  function changePendingStep(next: StepCommand | null) { pendingStepRef.current = next; if (alive.current) setPendingStep(next); }
  function handleAdEvent(attemptId: string, event: AdEvent) {
    const current = gateRef.current;
    if (!current || current.attemptId !== attemptId) return;
    changeGate(adEvent(current, attemptId, event)); log(`Ad ${event} · ${current.mode}`);
  }
  function applyState(next: ProbeState) {
    if (next.official !== false) throw new Error('This lab accepts only non-official probe state.');
    const old = stateRef.current;
    stateRef.current = next; setState(next);
    if (pendingStepRef.current && next.nextSequence > pendingStepRef.current.sequence) changePendingStep(null);
    if (old && next.deathSequence !== old.deathSequence) { changeGate(null); setIntent(null); audio.current?.play('death'); }
    const current = gateRef.current;
    if (current && next.intent?.intentId === current.intentId && next.intent.status !== 'pending') {
      const evidence = next.mode === 'synthetic' ? 'synthetic' : 'native-test-ssv';
      const verified = recordVerification(current, next.intent.intentId, evidence);
      changeGate(next.intent.status === 'applied' ? recordRestore(verified, next.intent.intentId) : verified);
    }
  }
  async function action(work: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError('');
    try { await work(); }
    catch (failure) { const message = failure instanceof Error ? failure.message : 'The probe request failed.'; setError(message); log(`Error: ${message}`); }
    finally { busyRef.current = false; if (alive.current) setBusy(false); }
  }
  function api() { if (!apiRef.current || !session) throw new Error('Start a probe run first.'); return apiRef.current; }
  function path(suffix = '') { if (!session) throw new Error('No probe run.'); return `/runs/${session.runId}${suffix}`; }

  useEffect(() => {
    alive.current = true;
    audio.current = new AudioProbe();
    ads.current = new NativeAdProbe(handleAdEvent, log);
    const visibility = () => { setVisible(!document.hidden); log(document.hidden ? 'Document background' : 'Document foreground'); };
    document.addEventListener('visibilitychange', visibility);
    let handle: PluginListenerHandle | undefined; let removed = false;
    if (native) {
      void NativeApp.getState().then(result => { if (!removed) setNativeActive(result.isActive); }).catch(() => log('Native app-state lookup failed.'));
      void NativeApp.addListener('appStateChange', result => { if (!removed) { setNativeActive(result.isActive); log(result.isActive ? 'Native foreground' : 'Native background'); } }).then(result => { if (removed) void result.remove().catch(() => {}); else handle = result; }).catch(() => {
        if (!removed) { setNativeActive(false); setError('Native lifecycle listener failed. Restart the lab before continuing the device test.'); log('Native lifecycle registration failed; input remains paused.'); }
      });
    }
    return () => { alive.current = false; removed = true; document.removeEventListener('visibilitychange', visibility); void handle?.remove().catch(() => {}); void ads.current?.dispose(); audio.current?.dispose(); };
    // The single adapter instance reports through refs so callbacks always see the current attempt.
  }, []);
  useEffect(() => { audio.current?.setBlocked(!foreground || paused || fullscreen); }, [foreground, paused, fullscreen]);

  async function start() {
    if (fullscreen || pendingNative || busyRef.current) return;
    await action(async () => {
      const client = new ProbeApi(normalizeEndpoint(endpoint, native), sample => {
        if (alive.current) setSamples(previous => [...previous.slice(-199), sample]);
      });
      const result = await client.request<ProbeSession>('create', '/runs', 'POST', undefined, { mode: native ? 'native' : 'synthetic', platform: validPlatform });
      apiRef.current = client; setSession(result); stateRef.current = null; changePendingStep(null); applyState(result.state);
      changeGate(null); setIntent(null); setCallbackOnly(false); setPaused(false); setMetrics(null);
      log(`Started ${result.state.mode} probe · never ranked`);
    });
  }
  async function step(side: 'left' | 'right') {
    if (!inputAllowed || busyRef.current || !stateRef.current || !session) return;
    const command = { sequence: stateRef.current.nextSequence, side, idempotencyKey: crypto.randomUUID() };
    changePendingStep(command);
    await submitStep(command);
  }
  async function submitStep(command: StepCommand) {
    if (!session || !foreground || paused || fullscreen || busyRef.current) return;
    await action(async () => {
      const result = await api().request<{state: ProbeState}>('step', path('/step'), 'POST', session.token, command);
      const responseAt = performance.now(); applyState(result.state); if (result.state.sp > 0) audio.current?.play('step');
      requestAnimationFrame(() => { if (alive.current) setFrameSamples(previous => [...previous.slice(-199), performance.now() - responseAt]); });
      log(`Step ${command.sequence}: ${result.state.lastStep?.correct ? 'safe' : 'wrong'} · row ${result.state.lastClearedRow}`);
    });
  }
  async function forceDeath() {
    if (!inputAllowed || !session) return;
    await action(async () => { const result = await api().request<{state: ProbeState}>('test-death', path('/death'), 'POST', session.token, {}); applyState(result.state); log('Test death requested'); });
  }
  async function prepare(callbackProbe = false) {
    if (busyRef.current || fullscreen || pendingNative || (!callbackProbe && state?.status !== 'dead')) return;
    await action(async () => {
      let currentIntent: RewardIntent;
      if (callbackProbe) {
        currentIntent = { intentId: crypto.randomUUID(), reviveNumber: 1, restoreSp: 200, ssvCustomData: crypto.randomUUID(), ssvUserId: crypto.randomUUID(), adUnitId: null, rulesetVersion: 'callback-only', status: 'pending', official: false };
      } else {
        currentIntent = await api().request<RewardIntent>('intent', path('/reward-intent'), 'POST', session!.token, {});
        if (currentIntent.status !== 'pending') {
          const snapshot = await api().request<{state: ProbeState}>('reconcile', path(), 'GET', session!.token);
          applyState(snapshot.state);
          throw new Error('This continuation already has a grant. Reconcile and restore it; another ad is not needed.');
        }
      }
      setIntent(currentIntent); setCallbackOnly(callbackProbe);
      const attempt = beginAttempt(crypto.randomUUID(), currentIntent.intentId, native ? 'native' : 'synthetic', gateRef.current);
      changeGate(attempt); log(`Prepared ${callbackProbe ? 'callback-only' : `revive ${currentIntent.reviveNumber} / ${currentIntent.restoreSp} SP`} intent`);
      if (native) await ads.current!.prepare(attempt.attemptId, currentIntent.ssvUserId, currentIntent.ssvCustomData);
      else handleAdEvent(attempt.attemptId, 'loaded');
    });
  }
  async function synthetic(order: 'earned-first' | 'dismissed-first' | 'no-fill') {
    const current = gateRef.current;
    if (native || !current || !intent || current.phase !== 'loaded' || !session) return;
    await action(async () => {
      if (order === 'no-fill') { handleAdEvent(current.attemptId, 'load-failed'); log('Synthetic no-fill: no grant request'); return; }
      handleAdEvent(current.attemptId, 'show-requested');
      for (const event of order === 'earned-first' ? ['earned', 'dismissed'] as const : ['dismissed', 'earned'] as const) handleAdEvent(current.attemptId, event);
      const result = await api().request<{state: ProbeState}>('synthetic-grant', path('/synthetic-grant'), 'POST', session.token, { intentId: intent.intentId });
      applyState(result.state); log('Synthetic verification fixture granted · no Google callback');
    });
  }
  async function refresh() {
    if (!session) return;
    await action(async () => { const result = await api().request<{state: ProbeState}>('reconcile', path(), 'GET', session.token); applyState(result.state); log('Read authoritative probe state'); });
  }
  async function restore() {
    if (!mayRestore(gateRef.current, foreground, paused) || !session || !intent || callbackOnly) return;
    await action(async () => {
      const result = await api().request<{state: ProbeState}>('restore', path('/restore'), 'POST', session.token, { intentId: intent.intentId });
      applyState(result.state); audio.current?.play('revive'); log(`Restored to ${result.state.sp} SP; ${result.state.revivesApplied}/10`);
    });
  }
  async function readMetrics() {
    if (!session) return;
    await action(async () => { const result = await api().request<Record<string, unknown>>('metrics', '/metrics', 'GET'); setMetrics(result); });
  }
  function endUnverifiedNativeProbe() {
    const current = gateRef.current;
    if (busyRef.current || callbackOnly || current?.mode !== 'native' || current.phase !== 'pending' || !current.adClosed || current.verified) return;
    // Demo units cannot send our account-configured SSV. Discard only this local
    // diagnostic session. Its server intent stays pending; no grant or restore.
    changeGate(null); changePendingStep(null); setIntent(null); setSession(null); setState(null); stateRef.current = null; apiRef.current = null; setMetrics(null);
    log('Unverified native probe ended locally; no reward granted and server intent retained.');
  }
  function exportEvidence() {
    const report = { kind: 'CPI-002 lab observations', createdAt: new Date().toISOString(), platform, native, official: false,
      appVersion: '0.0.0', dependencyCandidate: { capacitor: '8.5.3', admob: '8.2.1' },
      limitations: ['Browser observations are not device validation.', 'A callback is not SSV.', 'Frame timing is a requestAnimationFrame proxy.', 'Memory byte counts are not database storage or cloud cost.'],
      state: state ? { mode: state.mode, sp: state.sp, lastClearedRow: state.lastClearedRow, revivesApplied: state.revivesApplied, revivesGranted: state.revivesGranted, verifiedSsvGrants: state.verifiedSsvGrants } : null,
      gate: gate ? { phase: gate.phase, mode: gate.mode, earnedSignal: gate.earnedSignal, verified: gate.verified, evidence: gate.evidence, adClosed: gate.adClosed } : null,
      samples, nextFrameAfterResponseMs: frameSamples, metrics, logs };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = `cpi002-${validPlatform}-evidence.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    log('Exported evidence without run credentials');
  }
  const httpSamples = samples.filter(sample => sample.operation === 'step' && sample.ok).map(sample => sample.milliseconds);
  const retryAllowed = !gate || gate.phase === 'failed' || gate.phase === 'restored';
  const verifiedNative = (state?.verifiedSsvGrants ?? 0) > 0;

  return <main className="lab">
    <header className="topbar"><div><p className="eyebrow">CPI-002 · MOBILE LAB</p><h1>Crystal Path<span>Infinity</span></h1></div><span className="platform">{validPlatform}</span></header>
    <div className="evidence-banner"><span className="status-dot"/><strong>{native ? verifiedNative ? 'Native test · SSV observed' : 'Native test · SSV unproven' : 'Browser fixture · simulated rewards'}</strong><span>Never ranked</span></div>
    <section className="stage" aria-label="Crystal bridge input probe">
      <div className="hud"><div><span>Completed rows</span><strong data-testid="row">{state?.lastClearedRow ?? 0}</strong></div><div className="sp-readout"><span>Stability</span><strong data-testid="sp">{sp}<small> / 400 SP</small></strong></div></div>
      <div className="sp-track" role="progressbar" aria-label="Stability points" aria-valuemin={0} aria-valuemax={400} aria-valuenow={sp}><div style={{width: `${sp / 4}%`}}/></div>
      <div className="bridge" aria-hidden="true">{[0,1,2,3,4].map(row => <div className="ghost-row" key={row} style={{opacity: .2 + row * .12, transform: `scale(${.48 + row * .09})`}}><i/><i/></div>)}</div>
      <div className="current-row"><button className="crystal" disabled={!inputAllowed} onClick={() => void step('left')} aria-label="Choose left tile"><span>LEFT</span><i/></button><button className="crystal" disabled={!inputAllowed} onClick={() => void step('right')} aria-label="Choose right tile"><span>RIGHT</span><i/></button></div>
      <div className="stage-caption" aria-live="polite">{fullscreen ? 'Ad open · input and sound paused' : paused ? 'Paused' : !foreground ? 'App backgrounded' : !state ? 'Connect the probe to test the bridge' : state.status === 'finished' ? 'Run finished · ten continuations used' : state.status === 'dead' ? `Death recorded · next revive ${nextSp} SP` : busy ? 'Waiting for the server…' : pendingStep ? 'Step response missing · retry or check server state' : `Choose a tile · test row ${state.currentRow}`}</div>
      <div className="stage-actions"><button className="subtle" onClick={() => setPaused(value => !value)} disabled={fullscreen}>{paused ? 'Resume' : 'Pause'}</button><button className="subtle" onClick={() => void action(async () => { if (sound) { audio.current?.mute(); setSound(false); } else { await audio.current?.enable(); setSound(true); audio.current?.play('step'); } })}>{sound ? 'Mute sound' : 'Enable sound probe'}</button><button className="subtle danger" disabled={!inputAllowed} onClick={() => void forceDeath()}>Test death</button></div>
    </section>
    <section className="card revive-panel" aria-labelledby="revive-title"><div className="section-title"><h2 id="revive-title">Continuation probe</h2><span>{state?.revivesApplied ?? 0} / 10 used</span></div>
      <p className="muted">Revives 1–5 restore 200 SP. Revives 6–10 restore 150 SP. The next death after revive ten ends the run.</p>
      {callbackOnly && <p className="notice">Callback-only test. No SP reward or server grant is attached to this ad.</p>}
      <div className="facts"><div><span>Client reward signal</span><b>{gate?.earnedSignal ? 'Received' : 'None'}</b></div><div><span>Verification</span><b>{gate?.verified ? gate.evidence === 'synthetic' ? 'Simulated' : 'SSV verified' : 'Unproven'}</b></div><div><span>Ad state</span><b>{gate?.phase ?? 'No attempt'}</b></div></div>
      <div className="button-row">
        <button className="primary" disabled={busy || state?.status !== 'dead' || !retryAllowed || !foreground || paused} onClick={() => void prepare()}>{native ? 'Load Google test ad' : 'Prepare simulated continuation'}</button>
        {native && gate?.phase === 'loaded' && <button className="primary" disabled={busy || !foreground || paused} onClick={() => { try { ads.current?.show(gate.attemptId); } catch { setError('The prepared ad is no longer available.'); } }}>Show test ad</button>}
        {!native && gate?.phase === 'loaded' && <><button onClick={() => void synthetic('earned-first')} disabled={busy}>Earned → dismiss</button><button onClick={() => void synthetic('dismissed-first')} disabled={busy}>Dismiss → earned</button><button onClick={() => void synthetic('no-fill')} disabled={busy}>Simulate no-fill</button></>}
        <button disabled={busy || !mayRestore(gate, foreground, paused) || callbackOnly} onClick={() => void restore()}>Restore {intent?.restoreSp ?? nextSp} SP</button>
        <button disabled={busy || !session || fullscreen} onClick={() => void refresh()}>Check server state</button>
        {pendingStep && <button disabled={busy || !foreground || paused || fullscreen} onClick={() => void submitStep(pendingStep)}>Retry unconfirmed step</button>}
      </div>
      {native && <div className="native-test"><p className="muted">Google demo ads can test presentation and callbacks. Their ad units do not belong to this project, so they cannot prove delivery to our SSV endpoint.</p><button disabled={busy || Boolean(pendingNative) || fullscreen || !foreground || paused} onClick={() => void prepare(true)}>Native callbacks only · no server needed</button>{callbackOnly && gate?.adClosed && gate.phase === 'pending' && <button onClick={() => { changeGate(null); setIntent(null); setCallbackOnly(false); log('Callback-only trace ended; no grant was created'); }}>Finish callback-only trace</button>}{!callbackOnly && gate?.adClosed && gate.phase === 'pending' && !gate.verified && <button disabled={busy} onClick={endUnverifiedNativeProbe}>End unverified probe · no reward</button>}</div>}
    </section>
    <section className="card connection"><h2>Probe connection</h2><p className="muted">{native ? 'Enter the HTTPS address of the test server. Local emulator loopback is also accepted.' : 'Leave blank to use the local server through Vite. Run npm run probe in another terminal.'}</p><label htmlFor="endpoint">Server address</label><input id="endpoint" inputMode="url" type="text" placeholder={native ? 'https://your-test-server.example/v1/probe' : 'Local proxy: /v1/probe'} value={endpoint} onChange={event => setEndpoint(event.target.value)} disabled={busy || Boolean(pendingNative) || fullscreen}/><div className="button-row"><button className="primary" disabled={busy || Boolean(pendingNative) || fullscreen} onClick={() => void start()}>{session ? 'Start another probe run' : 'Start probe run'}</button><button disabled={busy || !session} onClick={() => void readMetrics()}>Read server metrics</button></div><p className="fine">This server is a bounded, volatile lab fixture. Restarting it discards probe runs. It does not implement production persistence or rankings.</p></section>
    {error && <div className="error" role="alert">{error.replaceAll('_',' ')}</div>}
    <section className="card"><div className="section-title"><h2>Observations</h2><button className="subtle" onClick={exportEvidence}>Export JSON</button></div><div className="facts"><div><span>Step round trip · p50</span><b>{formatMs(percentile(httpSamples,.5))}</b></div><div><span>Step round trip · p95</span><b>{formatMs(percentile(httpSamples,.95))}</b></div><div><span>Samples</span><b>{httpSamples.length}</b></div></div><p className="fine">HTTP timings include server work. Next-frame samples are scheduling proxies, not measured tap-to-photon latency. No physical-device result is inferred from this screen.</p>{metrics && <details><summary>Server counters and byte estimates</summary><pre>{JSON.stringify(metrics,null,2)}</pre></details>}<ol className="event-log" aria-label="Recent probe events">{logs.slice(-12).reverse().map((entry,index) => <li key={`${entry.time}-${index}`}><time>{entry.time.slice(11,19)}</time><span>{entry.message}</span></li>)}</ol></section>
    <footer>Isolated diagnostic scene · 20 SP per wrong test step · no mystery system or public scores</footer>
  </main>;
}
