-- OPERATOR TEMPLATE. Do not run until the isolated target, client version and release evidence are reviewed.
-- Runtime service_role cannot enable its own starts or approve ad inventory.
-- Use the actual revision from select cpi_private.get_operations_policy(); not a guessed revision.
-- New runs take v11-live; historical v1 recovery remains available.
-- select cpi_private.set_operations_policy(REPLACE_CURRENT_REVISION,true,false,REPLACE_BUILD,1,
--   'infinity-v11-live',array['infinity-v1','infinity-v11-live'],'none','owner:release-review');

-- Configure BOTH real platform inventories with reviewed SDK versions, rewarded amount/item and Google SSV ad_unit format.
-- Android: GMA 25.4.0, rewarded ca-app-pub-9243398419153145/5387868010.
-- iOS: GMA 13.11.0, rewarded ca-app-pub-9243398419153145/4563926844.
-- Keep enabled/reviewed/families_reviewed/closeability_reviewed FALSE until phone acceptance.
-- Development/staging use official Google demo IDs, NEVER production inventory for tests.
-- Populate reward_launch_reviews per approved country/platform/policy only after that review.
-- Do not grant INSERT/UPDATE on approval tables to the normal runtime role.

-- Emergency pause: leave recovery rules intact, suspend NEW ranked/ad starts with a new reviewed revision.
-- Disabling a country review also requires revoking its outstanding authorizations (up to 10 minutes):
-- update cpi_private.reward_authorizations set revoked_at=clock_timestamp()
-- where revoked_at is null and configuration_id=REPLACE_CONFIGURATION_UUID;
