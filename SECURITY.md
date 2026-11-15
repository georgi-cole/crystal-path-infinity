# Security and ranked integrity

Public reports must not include tokens, signing materials, private age data or exploitable production details. An owner-controlled private support route is established in CPI-037.

The mobile client is untrusted. The legacy verified-run protocol keeps progression, hidden future answers and reward verification on the server. Authentication, RLS and server authorization remain separate controls.

The 2026-11-15 local Infinity board (`infinity-device-v1`) intentionally accepts authenticated, device-reported end-of-run summaries. Basic size, integer, revive and elapsed-time checks are not replay verification or cheat prevention. These scores live in a separate private table and must never create `verified_results`, reward grants or purchases. The server derives owner identity from the session and region from the profile, retains one best result per owner, and exposes only publishable profile fields. Campaign and preview runs are excluded. See `docs/operations/LOCAL_INFINITY_20261115.md`.

No production infrastructure is provisioned by this planning package. Release requires hostile-client API checks, duplicate/reordered input and reward tests, deletion tests and verified secret handling. See CPI-021, CPI-028, CPI-030, CPI-031 and CPI-033.
