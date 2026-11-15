# Local Infinity and top 10 — 15 November 2026

New Infinity play runs entirely on the device using the existing seasonal game and lifecycle clock. Starting, jumping, bridge movement, hints, pauses and normal continuation do not await the ranking service. Native advertising and purchases still need their providers when requested; those are separate from movement. Campaign stays local and non-ranked.

The previous ranked mode waited for each command and a three-second heartbeat. Network delays therefore interrupted an otherwise single-player crossing. New menu entries, including the Rankings play button and the play deep link, lead to the local game. The old server authority remains available only for explicit recovery of existing ranked saves and pending rewards.

## End-of-run upload

At the first checkpoint of a new Infinity run, a random upload ID is bound to the current public profile. After the run is explicitly finished and any revive decision resolved, an improvement to the personal best is committed to a bounded local outbox. Its five fields are schema version, opaque run ID, completed rows as a decimal string, revives needed to reach that score, and elapsed active milliseconds. No route, answer, seed, input stream, email or login ID is uploaded. Zero-row runs, Campaign, World trials and older unbound checkpoints are excluded.

The asynchronous queue has a twelve-second request deadline and thirty-second retry, retries on reconnection, and survives a restart. Only an acknowledged matching ID clears an outbox entry; a newer queued best survives an older response. A fresh profile/session binds uploads, and account changes abort and fence late responses. An offline account restoration may continue the last device-bound run, but cannot upload using another account. Guests may play freely; joining rankings requires signing in and creating a profile before the run.

`POST /cpi/infinity/score` requires the existing authenticated session/privacy authorization, origin restrictions and durable rate limits, including ten submissions per account per minute. It derives ownership from that session and region from the profile. A private SQL function locks the owner, deduplicates the retained best, ignores inferior scores, and timestamps improvements on the server. The new migration is additive and required before the updated host/client is released. Account export includes the best and account deletion cascades to it.

## Integrity boundary

`infinity-device-v1` is a device-reported board, separate from `verified_results`. Integer/size/revive/time checks are coarse plausibility checks, not replay verification or protection from a modified client. No score submission grants money, supplies, purchases or ad rewards. Legacy verified results and rulesets retain their meaning. The existing local gear, seasonal rules, prices and continuation limits are unchanged.

## Rankings

World, continent and country filters remain. The screen displays ten compact player cards with position, name and completed rows. The current player is highlighted in that list or appears once below it. Pending offline scores have a clear sync state. Rule identifiers, snapshots, duplicate nearby tables and the separate revive column are removed from this presentation. Profile region selects the initial regional filter; players can change it.

## Reference guidance

- [Apple: Creating engaging challenges from leaderboards](https://developer.apple.com/documentation/gamekit/creating-engaging-challenges-from-leaderboards): submit after gameplay/attempt and after the revive decision; platform score submission supports offline recovery.
- [Google: LeaderboardsClient](https://developers.google.com/android/reference/com/google/android/gms/games/LeaderboardsClient.html): score submission may wait until the next sync; worse scores are ignored, with separate top-score and current-player reads.

These establish a platform-supported pattern, not knowledge of Subway Surfers' private implementation. Crystal Path uses its existing cross-platform account service and outbox rather than introducing Game Center/Play Games sign-in.

## Validation and rollout

Focused tests pass for real local rows without HTTP, saving only at the end, durable retry across reload, late account-switch responses, Campaign exclusion, strict summary parsing, authenticated owner stamping, rate limits, actual migrated PostgreSQL top 10/personal ranking, idempotence, inferior results, direct-access grants, export, deletion and no fabricated verified results. Embedded PostgreSQL is not independent multi-connection concurrency evidence. Disposable SQL fixtures roll back and are never deployed to production.

Local source checks passed: workspace typechecking, lint, formatting, all three web builds, 1,539 application tests plus six balance tests, thirteen planning tests and seventeen CI-selection tests. Two additional menu/presentation tests and the changed real-runtime score-binding test also passed in the focused rerun. The browser check at an effective 390-pixel width confirmed no horizontal overflow, the top 10 and separate personal position, profile-selected country filtering, cached offline rows and the pending personal score. Actual `InfinityPractice` accepted jumps and pause/end actions with the score transport offline, made zero upload requests during play, and displayed the saved result after ending. Preview leaderboard entries were isolated samples, not production scores.

Remote CI, production migration/host deployment and the exact-source TestFlight build are still pending. No new app build or real-device acceptance is claimed by this candidate record.

## Merged source and production rollout — 15 November 2026

PR [#142](https://github.com/georgi-cole/crystal-path-infinity/pull/142) merged as `869c9c68598baa993d6d707275c785e6056ef4db` after all required checks passed. The exact merged commit also passed [full main CI](https://github.com/georgi-cole/crystal-path-infinity/actions/runs/43661247123), including application quality, PostgreSQL schema/access controls, three Android cold starts and two iPhone cold starts with OS lifecycle round trips. The iPhone diagnostic report contains zero blocking JavaScript/runtime errors. The PR simulator home screenshot was inspected and shows the local Play Infinity entry. These launch checks are separate from physical-device gameplay, ads and production account acceptance.

The additive migration `20261115000100_local_infinity_scores` is applied to the independently verified production project `wtldjvzvpcfkwfacgsqj` and recorded in migration history. A production preflight first created it inside a rolled-back transaction and checked the effective `service_role` boundary. Post-deployment world, Bulgaria and Europe reads succeeded under that role; direct authenticated RPC/writes remain blocked. The board is empty at this checkpoint. No synthetic production profiles, runs or scores were created; no historical local score was backfilled.

Supabase's dashboard could not re-bundle the existing parent-directory shared imports (`file:///packages/...`). Those failed deployments did not replace the live function. The same checked source was then packaged with installed Rolldown 1.0.3 as one ESM entrypoint: tree shaking disabled, game-core resolved to the repository source, `pg`, the Apple SDK and `node:` imports left external under the unchanged pinned Deno import map. All 67 source input hashes matched the merged code. The generated module passed syntax/import and missing-configuration fail-closed checks.

Production `cpi-live` version **12** became `ACTIVE` at **2026-11-15T01:14:36.545Z**. Its published entrypoint was read back through the editor and matched the complete package, SHA256 `510cae2d587a40fe8705adff9420bf7669045088644078bafdcad1a02cb60be9`. A rollback package was also prepared from the 66 original deployed inputs, all matching the previous baseline, SHA256 `a04b4b1fd7ec7b06d241072c2429d938c3665d005c91cd35301ed7cfc6b42511`. Gateway settings, provider secrets, JWT/gateway authentication and existing purchase/reward gates were unchanged.

Live gateway checks returned 204 for score CORS preflight, 401 `account_required` for a score POST without authentication, and 200 for the correctly formed operations-status read (policy revision 2, server-ranked ad starts still disabled). This proves the deployed route rejects unauthenticated submission and the existing host remains operational; a genuine authenticated phone result is still required for end-to-end publication acceptance.

## TestFlight 1.0.2 (77)

The owner explicitly approved the existing production-service TestFlight configuration. Upload workflow [#77](https://github.com/georgi-cole/crystal-path-infinity/actions/runs/43662689485) uses the checked merged source above, `upload_to_testflight=true` and `public_release=true`; all alternate beta/review and external-distribution inputs are false. Signed export and upload succeeded at **2026-11-15T01:24:54Z**. Apple lists version **1.0.2 (77)**, build ID `191886f3-d1ce-4726-bce5-a59ff86d1234`, as **Processing** at this checkpoint. Internal distribution and encryption metadata will be checked after processing; no public App Store review was submitted. The current-source upload gate is complete.

AdMob test mode is tied to marketing version 1.0.2 for this inspection build. Real ad serving readiness remains separate; disable that version-specific override before submitting 1.0.2 publicly. New signed-in Infinity attempts may publish their finished best; Campaign, previews and old unbound local saves remain outside this board. On-device offline play, reconnect/upload, own position and ad presentation still need the owner's acceptance.
