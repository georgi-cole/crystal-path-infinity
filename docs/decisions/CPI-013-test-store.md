# CPI-013 / CPI-005 — Test store, resource reserve and original worlds

Owner-authorized implementation, 5 November 2026. Follows the catalog preview
in PR #83 and the owner's approved continuation/SP proposal. Payments remain
**simulated**, with no financial transaction, provider account or live billing SDK.

## Delivered behavior

- Worlds, Essentials and My collection replace the category-only storefront.
  Every checkout says “Test store · No real charges”; displayed EUR prices are
  editable reference prices, not actual platform products or price quotes.
- Continuation packs contain 3, 5, 10 or 25 individual credits. SP reserve packs
  contain 100, 500, 1,000, 2,500, 5,000 or 10,000 SP. Hint packs contain 3 or 10.
  Unused resources persist across runs without expiry or automatic spending.
  Resource shelves switch between continuations, SP and hints instead of stacking
  vertically. Compact illustrated cards pair live quantities with a single test
  price/action. Complete use limits and Assisted eligibility are expandable;
  checkout still displays the product and test-only disclosure before approval.
- A checkout can be approved, cancelled, failed or left pending. A pending
  purchase survives reload without granting anything. Completion is idempotent;
  owned themes cannot be repurchased. Reset removes only test store data.
- Chaos Workshop is original copper/mint machinery with robot companions.
  Jellyverse is original opalescent crystal, cosmic scenery and jelly companions.
  Both include palette/material changes, backgrounds, companion reactions,
  original synthesized music and step/record sounds. Obsidian remains free.
  Owned themes persist and can be equipped; unowned themes can be rehearsed in
  an isolated trial that changes neither the saved run nor any personal best.
- Generated SVG/CSS visuals and deterministic synthesized WAVs are original
  project assets. The 6 November world revision adds original generated portrait
  scenery and transparent three-pose companion sheets, optimized to under 1 MB
  combined for both runtime world kits. Source masters, the final generation
  prompts, research references, reusable layer templates and focus/motion rules
  are retained in [the world production guide](../../design/worlds/README.md).
  The same scene and bridge renderers compose the store preview. In actual play,
  the scenery is subdued beneath a center veil; the live crystal path remains
  in front. Material inlays, restrained step sparks/ripples and tinted fractures
  use public presentation data only. Pip/Lumi hop only after a resolved choice,
  celebrate or recoil, and stay behind the next actionable row. Core choices,
  hit regions, scan meaning and input/cinematic timing do not change.
  `apps/mobile/scripts/generate-theme-audio.mjs` reproduces the
  bundled audio. No Minions or other licensed character assets are included.

## Versioned test rules and score eligibility

New local runs with the store provider explicitly use `infinity-store-test-v1`.
It retains v3 pacing, hint holds, route generation, mystery weights and damage.
Historical practice retains its existing pacing migration and cannot spend test
resources. Ranked/server defaults, APIs, schema and leaderboards are unchanged.

- Start with 300 SP and 2 hints; active SP remains capped at 400.
- Reserve transfers occur only while alive, from the paused run. Each transfer
  is at most 100 SP and debits only the exact amount that fits. The cumulative
  reserve allowance is 200 SP per run, including after continuations.
- A reserve hint transfers one hint into the run. Neither SP nor hints resurrect
  a dead run. Every resource spend has an explicit confirmation.
- Continuations 1–10 offer a simulated rewarded ad or one owned credit. An early
  credit occupies the same slot as the ad it replaces. Continuations 11–15 require
  credits. Death after continuation 15 is terminal.
- Continuations 1–5 restore 200 SP; 6–15 restore 150. The first ten-ad simulation
  options never claim a real ad or verified advertising reward.
- The first reserve SP, reserve hint or credit use marks the entire run Assisted.
  Test ad simulation alone leaves it Classic. A permanent Assisted marker and
  separate local personal-best storage prevent paid resources contaminating the
  existing Classic local record. Theme buying/equipping never marks a run Assisted.
  Both are local practice; neither becomes an official server score.
- Dead test runs can be saved and resumed, including after visiting the store.
  Old practice's declined-death finalization remains intact.

## Persistence and recovery

`cpi.store.test.v1` is a device/browser-origin-local simulator record, separate
from future live entitlements, account identity and existing practice settings.
It contains the test wallet, owned themes, pending test checkout, Assisted local
best and the test run checkpoint. It is not authenticated payment proof.

The core session's optional before-commit hook persists a resource debit and its
resulting checkpoint in one atomic storage write **before** changing the owned
session. A failed write leaves gameplay and balances untouched and permits a
safe retry. Resource sequence guards reject replay and stale saves cannot roll
back a committed spend. Corrupt storage blocks shopping rather than silently
resetting purchased test balances. The intended preview has one active test run;
this local simulator is not a multi-client authoritative economy.

Mute, foreground lifecycle, disposal and reduced motion apply to both worlds.
Theme music is bundled and never depends on remote streaming. Canonical danger,
hint and fracture cues remain readable; cosmetic choices do not change outcomes.

## Verification and release boundary

Behavioral tests cover purchase failure/cancellation/pending recovery, duplicate
delivery, owned themes, corrupt storage, atomic debit failure/retry, exact partial
refills, the cumulative SP cap, 10/15 continuation boundaries, frozen pause time,
unchanged route/RNG, historical-rule isolation and separate local records.
Browser walkthroughs exercise checkout, equipping, trials, reserve/hint spending,
credit revival and reload recovery. Phone layouts and desktop are inspected.

Before live sales, replace the simulator with platform product discovery and
localized prices, verified server-side receipts, authoritative account wallets,
refund/revocation handling and actual Apple/Google test-store transactions.
Local test balances and cosmetic unlocks must never migrate into live purchases.
Signed physical-device billing/ads and production ranked assisted standings are
not represented as implemented or tested. The owner authorized updating the
GitHub Pages guest preview on 6 November 2026. Its build asserts simulated payment
mode and records that boundary in deployment-info.json. Publication is manual
from the explicitly allowed test-store branch (or main); PR events cannot publish.
This does not enable live services, submit a store listing or authorize live sales.
