# CPI-002 volatile probe server

This is a **test-only**, dependency-free Node fixture, not CPI-005 gameplay, a production service, or a leaderboard. Every run is `official: false`. It has no account data, persistence, seasons, mystery effects, or production grant endpoint. Start with Node 22.23+:

```sh
node --experimental-strip-types spikes/mobile/server/index.ts
```

Defaults: `127.0.0.1:8787`; set `PROBE_HOST` explicitly for a physical-device LAN/tunnel. `PROBE_PORT` changes the port. `PROBE_ORIGINS` is a comma-separated exact CORS allowlist (no wildcard/null); defaults include localhost/127.0.0.1:5173 and the standard localhost Capacitor origins. No credentialed wildcard CORS. `PROBE_SYNTHETIC_DELAY_MS=250` deliberately delays synthetic **step** handling; metrics expose this artificial delay. Native steps are not delayed by that setting. This service must not be exposed as a production backend.

## API

All paths except `/ssv` are under `/v1/probe`. POST bodies are JSON objects, at most 4 KiB, with only listed fields. Errors are `{error: "stable_code", official:false}` and never include a raw callback, token or stack. Creation returns the opaque token once; all run routes need `Authorization: Bearer TOKEN`. Keep that token in the private spike session, not logs or URLs.

| Method/path | Body | Response |
| --- | --- | --- |
| `POST /runs` | `{mode:"synthetic",platform:"web"}` or native + android/ios | `{runId,token,state}` |
| `GET /runs/:id` | — | `{state}` |
| `POST /runs/:id/step` | `{sequence:1,side:"left",idempotencyKey:"unique-key"}` | `{state,step,duplicate}` |
| `POST /runs/:id/death` | `{}` | `{state,debugOnly:true}`; authenticated lab fixture only |
| `POST /runs/:id/reward-intent` | `{}` | `{intentId,reviveNumber,restoreSp,ssvCustomData,ssvUserId,adUnitId,rulesetVersion,status,official:false}` |
| `POST /runs/:id/synthetic-grant` | `{intentId}` | `{state,duplicate}`; **403 for native runs** |
| `POST /runs/:id/restore` | `{intentId}` | `{state,duplicate}`; requires granted entitlement |
| `POST /runs/:id/client-event` | `{event:"earned"}`; also dismissed/no-fill/error/background/foreground | Recorded metric only; **never grants or restores** |
| `GET /health` | — | Test-service status |
| `GET /metrics` | — | Counts/bytes/timing, bounded state counts, explicit estimate limitations |
| `GET /ssv?RAW_GOOGLE_QUERY` | — | Public provider callback, also available at `/v1/probe/ssv`; signed verification precedes trusting fields |

Example creation:

```sh
curl -sS http://127.0.0.1:8787/v1/probe/runs -H 'Content-Type: application/json' --data '{"mode":"synthetic","platform":"web"}'
```

Use returned values in a private local shell session. Example subsequent command (replace the placeholders):

```sh
curl -sS http://127.0.0.1:8787/v1/probe/runs/RUN_ID/step -H 'Authorization: Bearer TOKEN' -H 'Content-Type: application/json' --data '{"sequence":1,"side":"left","idempotencyKey":"step-1"}'
```

## Fixture/state semantics

`state` includes `runId, mode, platform, official:false, evidence, rulesetVersion, sp, maxSp, lastClearedRow, currentRow, nextSequence, status, deathSequence, revivesGranted, revivesApplied, verifiedSsvGrants, lastStep, intent`. Status is playing/dead/finished. `evidence` names the run channel (`synthetic` or `native-test-ssv`); **it is not proof that an SSV callback has happened**. `verifiedSsvGrants` starts at zero. `lastStep` exposes only an already attempted outcome, never the hidden current/future safe side.

Start 300 SP, maximum label 400. This reduced fixture uses **20 damage on every wrong step**, not the full game's early damage bands. Survived steps increment progress; fatal attempts do not. The current hidden side is retained across death/revive. The debug death action is deliberately available to exercise rewards. It is not a production gameplay endpoint.

Step sequence begins at 1; only the exact next sequence is accepted. Repeating the same key/body returns the original step outcome plus **current** state without mutation; key reuse with altered input or an out-of-order/new-key replay is rejected. All successful mutations are synchronous in one Node process; this is not a database transaction or multi-instance guarantee.

Rewards set SP to **200 for applications 1–5, 150 for 6–10**, never add it. The run ruleset, intent ordinal, and amount are fixed. Repeated intent requests for the same death return the same intent (including no-fill retries). Only a synthetic grant in a synthetic run or validated Google SSV in a native run increments granted. Restore increments applied once. Replay after gameplay returns current state without healing again. The tenth restore gives 150; the next death is finished, with no new intent. Keep UI input/audio paused until fullscreen dismissal AND valid restoration AND foreground. The server cannot observe actual fullscreen dismissal; a client event is only an observation. SDK-earned/dismissed/background ordering belongs to the client controller tests.

Native restore can occur after authoritative SSV even if the local earned callback was lost. Pending verification is not automatic failure; there is no timeout that fabricates a grant or silently consumes the ordinal. Unknown/late events never grant to a new run.

## SSV trust boundary

Primary source: [Google manual rewarded SSV verification](https://developers.google.com/admob/android/ssv). `signature` and `key_id` must be the last two query fields in that order. SHA-256/ECDSA DER verification uses the **unchanged UTF-8 query prefix before `&signature=`**, including its original escapes/order. Only after signature verification are parameters decoded; duplicate names are rejected. `verifyGoogleSsv(rawQuery,pem)` is exported for local-key unit tests. Those tests prove verifier behavior, not Google delivery.

Runtime public keys come only from `https://www.gstatic.com/admob/reward/verifier-keys.json`, with a 5-second timeout, 64-KiB limit, no redirects, coalesced fetches, a refresh cooldown and a 20-hour cache (below Google's 24-hour maximum). No callback/user-provided URL is fetched. Failed key fetches fail closed.

After verification the service checks opaque intent and user, native mode, matching platform test ad unit, positive provider reward amount/item, millisecond timestamp near/after intent creation (five-minute clock tolerance), and transaction identity. Late arrival is allowed; old earned timestamps do not expire just because delivery was delayed. A transaction cannot reward another intent, and a death cannot receive two grants. Provider reward amount does **not** determine restored SP.

Allowed rewarded demo units, from [Android test ads](https://developers.google.com/admob/android/test-ads) and [iOS test ads](https://developers.google.com/admob/ios/test-ads):

- Android: `ca-app-pub-3940256099942544/5224354917`.
- iOS: `ca-app-pub-3940256099942544/1712485313`.

The callback may name the full unit or its exact numeric suffix, as Google's SSV parameter documentation uses numeric ad-unit identifiers. No other unit is accepted. **SDK custom-data support and demo-ad display do not establish that Google will deliver an SSV callback to this server.** Google's SSV setup requires a configured callback URL on an ad unit; official demo units are not owned by this project. Record delivery/configuration as unproven until observed, without substituting a synthetic grant or enabling live ad units to mark it complete.

## Bounds and honest measurements

Maximum 20 runs, 1,000 unique step actions per run, 10 intents/grants per run, 32 active HTTP handlers, bounded request URL/header/body sizes. Limits return explicit lab-budget errors; they never silently evict pending rewards or invent a game finish. Restart is the explicit lab reset and discards **all** volatile runs/tokens/grants; this is not production recovery. Do not restart while collecting a pending-delivery observation unless recording that loss as a limitation.

Metrics count HTTP bodies (not TLS/header bytes), handler wall time (including waits/artificial delay), retained actions and JSON-serialized public checkpoint bytes. These are local proxies, **not measured database storage, mobile frame latency, infrastructure cost, production anti-cheat, or native-device evidence**. Real cloud cost and physical-device/SDK integration remain CPI-002 gates; full persistence/ledger implementation stays downstream.
