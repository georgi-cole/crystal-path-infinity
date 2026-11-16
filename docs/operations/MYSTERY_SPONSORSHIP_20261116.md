# Optional mystery sponsorship — 16 November 2026

## Candidate behavior

Owner authorization: recurring optional mystery rewards in Infinity and Campaign, adapted to preserve mission tasks. This source candidate also removes the obsolete home-screen personal-best strip. It is not evidence of store publication or physical-device ad acceptance.

New Campaign and seasonal Infinity attempts opt in to the additive `sponsorship.version = 1` checkpoint extension. Existing checkpoints without that extension retain their original gameplay and cannot receive sponsored mystery grants. The authoritative legacy ranked adapter has no command enabling it.

Every fifth ordinary opened cache is an opportunity, subject to a compatible outcome, an existing native rewarded-ad adapter, current ad/privacy availability, a 90-second active-gameplay cooldown and Campaign compatibility. Missing opportunities are discarded rather than queued. Scripted encounter caches, World trials, mission objective rows, failed-objective attempts, lens-cache missions and the destination row are excluded. The ordinary-open counter persists across attempts and modes on this device. It is not an account-wide frequency guarantee across devices. Two consecutive declined offers quiet further offers for five active minutes.

The initial pool is: Marketing (+20 SP without selling a hint, resolving that pact); healing (+10 extra SP); recovering the one hint actually lost; restoring a nonlethal mystery loss of at most 15 SP after modifiers; and cleansing a newly revealed three-step bleed. Vault/debt sponsorship and a choose-your-supply cache remain deferred candidates. Opportunities with no compatible reward or insufficient SP headroom keep their ordinary outcome. Actual offer frequency is therefore lower than one in five in some sessions.

Small penalties resolve normally first, and the UI accurately offers to restore that exact loss before the next step. This avoids staging/replaying the mystery RNG or changing deaths. Lethal losses use the existing continuation flow. Declining adds no penalty. A sponsor reward never rerolls the box, repairs a broken tile, satisfies a trade/shield/hint objective, or automatically completes a mission.

## Reward and lifecycle boundary

This implementation reuses the existing native guest rewarded-ad adapter, including its UMP/privacy path. A local SDK completion callback earns a device-owned grant, exactly as local continuations do. It does not create a server-verified SSV grant or change the verified leaderboard. Infinity's existing device-reported score upload remains unchanged; no additional claim of anti-cheat verification is made.

The offer identity binds the run, unresolved row and life. Gameplay is blocked until the offer is dismissed; a dedicated ad pause lease freezes gameplay clocks/audio while the UI and fullscreen ad are open. Duplicate and late provider callbacks cannot award a second reward. Earned state is emitted as a checkpoint event before fullscreen dismissal, retained on restart, and acknowledged through a free Continue action. No-fill, early dismissal or provider errors grant nothing and retain the normal free continuation. An interrupted earned reward can be recovered from the checkpoint without watching again.

Both ordinary mission completion and first-clear rewards still require the existing objectives and Stability threshold. Any granted sponsor reward disqualifies this attempt from Mastery, disclosed before acceptance. Required mission rows and scripted encounters never receive sponsorship. Campaign interstitials and local continuation ads update the shared cooldown, and a recent sponsored ad suppresses a nearby Campaign interstitial.

## Validation and release status

Tests exercise exact-once grants, stale IDs, legacy exclusion, typed reward amounts, negative/zero outcomes, saved earned recovery, early dismissal, no-fill, provider error, late callbacks, shared cadence/cooldowns, objective rows across all Campaign missions and assisted Mastery. Existing AdMob adapter tests cover native event routing/privacy behavior using SDK doubles. These are automated provider-contract tests, not a claim that a real ad was watched on a phone.

Before public store publication, the exact candidate still needs required remote checks, a signed native build and real-device test-ad acceptance (completion, skip/no-fill, audio/timer restoration and restart after earning). Store processing/review and actual production inventory remain external outcomes. Never validate this by clicking live production ads.

No prices, purchase grants or historical simulation results change. Revenue uplift has not been measured. Compare offer acceptance, ads per active minute, mission completion, post-ad exit, retention and purchases before tightening cadence or increasing reward sizes.
