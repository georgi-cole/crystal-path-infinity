# CPI-005 / CPI-011 — Death Clock and survival rewards

Date: 5 November 2026. Owner-requested follow-up to PR #83.

## Versioned rules

The owner's request supersedes the original no-idle-death choice for new local
practice. `infinity-v2` keeps the existing route, mystery weights, damage,
400-SP cap and continuation schedule, and adds two active-time schedules:

- Each unresolved row gets 3,000 ms of grace, then a **5,000 ms Death Clock**.
  At exactly 8,000 ms since row entry, SP becomes zero and the life ends with
  cause `idle`. The fatal row earns no distance. A late choice cannot save it.
- Every full 60,000 ms of accumulated survival awards 5 SP, capped at 400.
  The next minute boundary is persisted, so resume or repeated ticks cannot
  award it twice. The visual counter animates already-committed SP.

A survived side choice, including wrong glass, resets row entry. Hints and
mysteries do not reset it. Explicit pause, background, death and recovery use
the existing active-time holds; menu and offline time buy neither bonuses nor
pressure. The bounded result/camera animations do not pause gameplay. Opening a
nonfatal mystery does not block the next choice while its symbol is travelling.

Settlement is chronological: remove expired effects, sum due effect pulses,
apply any resulting death, apply the row deadline, then award a minute bonus.
Thus a lethal pulse or expired row wins at a simultaneous minute boundary.
Revival preserves the unresolved row, clears effects as before, grants a new
row grace and schedules only future minute bonuses. An unplayed tail after
death is discarded by the existing timed-session owner.

## Compatibility and authority

`RULESET_VERSION` and the default core/server constructors remain `infinity-v1`.
Historical authoritative results and pinned source fixtures retain their exact
behavior. The mobile practice owner explicitly starts `infinity-v2`; it upgrades
a living local v1 checkpoint without changing its SP, hints, route, random
cursors or survived rows. Upgrade gives a fresh row grace and no retroactive
minute rewards. Existing v2 checkpoints retain their exact remaining time.
Finished/dead historical states are not rewritten.

The shared reducer also enforces v2 when an authority explicitly selects it.
Ranked public snapshots whitelist only `rowEnteredAt` and
`nextSurvivalBonusAt`; the strict client parser requires them for v2 and rejects
them on v1. Neither route answers nor RNG become public. This change does not
switch a deployed ranked policy, migrate official scores or mix rulesets in a
ranking. That rollout remains an explicit server operations decision.

## Presentation and voice

The right-hand Death Clock counts tenths against five marks, intensifies as
time runs out and triggers the existing original alarm for its final three
seconds. The whole bridge collapses before the death card appears. Low SP,
the scan projector and the clock share a vertical instrument stack. Time Alive
remains separate on the left; each minute produces a mint emphasis and `+5 SP`.
Mute, pause, background and reduced-motion preferences remain respected.

Hints project an original eye symbol on the right, send a trace to the current
row, sweep both panes and lock the safe pane in mint. The retained hint remains
readable after the 1.2-second scan. The mystery hologram is about 20% larger,
with denser faces and a brighter core.

English and Bulgarian gameplay, tutorial and menu narrative now share concise,
dark phrasing: “Time stands still. The abyss can wait.”, “Glass makes no
promises”, and “The abyss remembers”. Functional controls, account rights,
unavailable services and privacy choices remain explicit. Other existing
translations are preserved; added keys use the established English fallback.

## Glass research and implementation

[SideFX glass fracture documentation](https://www.sidefx.com/docs/houdini/nodes/sop/rbdmaterialfracture.html)
describes variable impact points, radial/concentric fracture structure and edge
detail. Its [fracturing guide](https://www.sidefx.com/docs/houdini/dyno/fracturing.html)
also separates fragments from constraints. These principles informed an original
seeded impact-biased Voronoi mesh with uneven rings, variable piece sizes and
thin retained rim chips in most patterns. Each run/life/row/side has a stable
visual seed independent of gameplay RNG. Falling and anchored pieces cover the
original pane; fatal collapse releases the anchors and frames as well. Far
collapse geometry uses fewer pieces to bound rendering work.

[Three.js physical material documentation](https://threejs.org/docs/pages/MeshPhysicalMaterial.html)
distinguishes transmission and reflection. The existing SVG/canvas renderer
approximates those cues with translucent faces, brighter grazing edges, rail
reflections and thin light strips. This is a perspective illustration, not a
new physical 3D simulation. No external art, image assets or rendering library
is imported.

## Verification

Core tests cover the exact 3 + 5 boundary, late inputs, pause/recovery, mystery
and hint behavior, minute caps, duplicate prevention, simultaneous death and
bonus, and revival. Integration tests cover local checkpoint migration,
authoritative v2 settlement, strict public projection, audio ownership, scan
lifetime and seeded glass coverage/variation. UI checks exercise narrow phones,
the scan, minute reward, pause copy and full idle collapse. Exact counts, built
revision and native results are recorded in PR #83; a physical-device or live
advertising result is not implied by these checks.
