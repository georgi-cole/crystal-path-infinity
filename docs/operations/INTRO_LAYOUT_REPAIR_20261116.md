# Intro spacing repair - 16 November 2026

PR #149 removed the requested personal-best row from the home screen. That row also owned an automatic top margin, which had anchored the navigation at the bottom of the home composition. Removing the element unintentionally moved the navigation up against the title.

The repair transfers that automatic top margin to `.cpi-menu-actions`. The record row remains absent. Header, title, artwork, action order, labels, button styling and navigation behavior retain their previous implementation. The action group keeps its original bottom anchor across Obsidian and character Worlds; the released space belongs above the controls.

Validation: the existing 12 menu/navigation tests and mobile typecheck pass. A temporary fixture renders the real menu in previous, broken and repaired arrangements for 390x844, 375x667 and 430x932 viewports in Obsidian and Pawrachute. Browser inspection of the local fixture was blocked by local preview access restrictions, so this is not evidence of a completed visual or physical-device check. Required remote checks remain part of the PR gate.

No gameplay rules, ad cadence, reward amounts, purchases, saved attempts or business assumptions change. CURRENT_GAME_RULES.md and BUSINESS_PLAN.md therefore require no rule/economy revision for this layout-only repair.
