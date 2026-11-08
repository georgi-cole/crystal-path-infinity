# CPI-011 — Publish the reviewed PR as the guest Pages preview

5 November 2026. The owner explicitly chose to keep PR #83 open and allow its
`design/obsidian-glass` branch to publish the existing GitHub Pages guest site.

The Pages workflow still builds pull requests without publishing them. Main
publishes on push or manual dispatch. The exact approved PR branch publishes
only through a manual workflow dispatch; ordinary branch pushes, other refs,
tags and pull-request events do not publish. The live deployment job serializes
publication across branches. Tests exercise the actual workflow condition.

The `github-pages` environment retains its custom branch policy and adds only
the exact `design/obsidian-glass` branch alongside `main`. No wildcard, branch
protection bypass, automatic merge, native gate change or secret is introduced.
Deployment uses the existing project-base build with accounts, ranked services
and advertisements disabled. `deployment-info.json` identifies the deployed
source SHA so the public site can be compared to the PR head after publication.

This is a guest web preview. It does not claim an iOS simulator launch or a
production release, and it does not merge the PR. Current CI and deployment
evidence are recorded in PR #83.

## Production artifact after phone approval · 8 November 2026

The owner approved the gameplay at `9311fd7` in PR #86. The Pages workflow
publishes the production player build from `apps/mobile/dist-pages` on main.
It also compiles QA into `apps/mobile/dist-qa` for checks. The phone tester
link serves the separate QA output on its review host. Production publication
checks reject preview markers, tester routes and simulated pricing.
