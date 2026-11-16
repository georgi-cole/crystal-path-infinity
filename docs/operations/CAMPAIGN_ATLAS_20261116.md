# Campaign atlas and crossing clarity — 16 November 2026

CPI-045 follow-up to [#121](https://github.com/georgi-cole/crystal-path-infinity/issues/121) and PR #144. Candidate based on main `3c37f89c42c71841be9d4803db9f686354979e22`. This record describes source changes, not a TestFlight upload or production rollout.

## Map and presentation

- Thirty authored, asymmetric locations replace the horizontal crossing strip. A single transformed scene contains the artwork, region landmarks, marker buttons and SVG route. Every curve starts and ends at the same world coordinates as its markers, avoiding the former disconnected CSS dotted lines.
- Drag in either direction, pinch to zoom, use the minus/plus controls, or use a trackpad. Zoom is bounded to 0.7–1.3; the camera stays within the scene. Ctrl/Cmd plus wheel zooms around the pointer. Keyboard arrows select adjacent crossings, +/- zoom and Home returns to the current crossing.
- A Current crossing control recenters the view. Expand map hides the briefing while retaining its selected crossing; Show crossing details restores it. Every cleared mission remains replayable, including after the finale. Only the current crossing and its immediate next preview are exposed beyond cleared crossings; later mission names remain hidden.
- Successful result cards use a floating/swaying signal, a softly pulsing ring, an orbiting highlight and an occasional reward sheen. Motion uses CSS transforms and opacity. Reduced-motion preferences remove the animations. The existing success cue and Campaign music sequence remain in place.
- Bridge detail pages hide Try a step and Try a break. Buying/equipping and the static material preview remain available. The generic safe/hinted/cleared fill previously overrode every bridge's material. Those states now retain the authored face paint and give successful steps a stroke highlight, preserving wood, cosmic, frost and other materials.
- Rankings use the available viewport height, with filters and refresh above a scrolling score list and a personal-position area below. Both Play Infinity and the legacy play/connect action are removed from this screen; Infinity is entered from Home. Sparse and empty boards display actual results only.

## Mission objectives and revision 0.5

Briefings show the landing, required Stability and a list of objective tasks with icons, progress counts and target-row markers. Gameplay uses a compact version beneath the HUD; Pause shows the full mission reminder and the same saved evidence, including completed target rows.

New attempts use content revision **0.5**. Once a required fixed row has been passed without its evidence, the attempt ends with the missed row and a free Retry action. This covers required caches, safe marked steps, hint/follow landings, trades and shield blocks, including compound objectives. Spending more than an explicit hint allowance is also terminal. The current row is still recoverable until it is passed. Low Stability alone does not trigger an early prediction of failure, since later encounters can recover it. Landing evaluation and rewards retain their existing requirements.

Persisted revisions 0.1–0.4 keep their original landing-only evaluation. Snapshot reading does not upgrade an active attempt. Impossible revision-0.5 checkpoints offer Retry rather than resuming an attempt that cannot be cleared. Reward grants, first-clear ad cadence, mission kits, shop prices and Infinity/server scoring are unchanged. No business assumptions or revenue simulations are revised.

## Design references

- [King: Level Design Saga, GDC Europe 2016](https://media.gdcvault.com/gdceurope2016/presentations/KANG_Jeremy_LevelDesignSaga.pdf), especially the Saga map/progression examples. The implementation borrows the spatial-node and continuous-route pattern; it uses Crystal Path's own artwork and authored coordinates, without copying game assets or claiming knowledge of King's internal code.
- [Supercell: Ranked](https://support.clashroyale.com/hc/en-us/articles/49484907381019-Ranked) and [Global Tournaments](https://support.clashroyale.com/hc/en-us/articles/49484915041435-Global-Tournaments), as references for rankings centered on placement and global/local comparisons. The viewport, scrolling list and personal-position layout are our design choice.

## Verification

Automated checks cover marker/path coordinate agreement, camera and zoom bounds, pinch-point preservation, required-row evidence, compound goals, exceeded hint allowances and unchanged earlier snapshots. Existing Campaign/audio, leaderboard, account entry, bridge projection, game-core and server tests are included in the verification run. A disposable local screening page uses actual components and clearly labeled sample progress/scores; it does not publish scores, charge purchases or change the production account.

Browser checks include the briefing and target-row task list, pause reminder, ranking filters and scrolling, material paint retention and map selection/recentering. Physical iPhone pinch/audio and native launch checks must be distinguished from these browser checks. Exact command results and CI status are recorded in the PR.
