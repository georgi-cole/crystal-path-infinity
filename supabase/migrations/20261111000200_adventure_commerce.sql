-- Additive source migration. Activation still requires verified checkout and spending.
begin;
alter table cpi_private.commerce_wallets
  add column shields bigint not null default 0 check (shields >= 0),
  add column season_changes bigint not null default 0 check (season_changes >= 0),
  add column unlocks text[] not null default array[]::text[],
  add constraint commerce_unlocks_valid check (
    unlocks <@ array['unlock.no_clock','unlock.all_seasons','bridge.bounce','bridge.cookie',
      'style.cosmic_kit','gear.umbrella','gear.sunshades','gear.sun_balm',
      'gear.frost_runners','gear.storm_boots','gear.trail_scarf']::text[]
  );
alter table cpi_private.purchase_deliveries
  drop constraint purchase_deliveries_product_kind_check,
  add constraint purchase_deliveries_product_kind_check
    check (product_kind in ('sp','hints','credit','theme','shields','season_changes','unlock')),
  add column unlock_key text,
  add constraint purchase_unlock_valid check (
    (product_kind = 'unlock' and quantity = 1 and unlock_key is not null and unlock_key = any(
      array['unlock.no_clock','unlock.all_seasons','bridge.bounce','bridge.cookie',
        'style.cosmic_kit','gear.umbrella','gear.sunshades','gear.sun_balm',
        'gear.frost_runners','gear.storm_boots','gear.trail_scarf']::text[]
    )) or (product_kind is distinct from 'unlock' and unlock_key is null)
  );
-- Existing table RLS, server-only grants and deletion guards remain in force.
-- Export new balances and entitlements without provider proof or account aliases.
create or replace function cpi_private.export_own_commerce(p_user uuid,p_purchase uuid,p_spend uuid,p_session uuid,p_assisted uuid) returns jsonb
language sql security invoker set search_path=pg_catalog as $$
  with wallet as (select * from cpi_private.commerce_wallets where user_id=p_user),
  purchases as (select d.* from cpi_private.purchase_deliveries d join wallet w on w.id=d.wallet_id where p_purchase is null or d.export_id>p_purchase order by d.export_id limit 101),
  spends as (select * from cpi_private.resource_spends where user_id=p_user and (p_spend is null or id>p_spend) order by id limit 101),
  sessions as (select * from cpi_private.account_families where user_id=p_user and (p_session is null or id>p_session) order by id limit 101),
  assisted as (select * from cpi_private.assisted_results where user_id=p_user and (p_assisted is null or run_id>p_assisted) order by run_id limit 101)
  select jsonb_build_object('wallet',(select jsonb_build_object('sp',sp,'hints',hints,'credits',credits,'shields',shields,'seasonChanges',season_changes,'unlocks',unlocks,'owned',owned,'equipped',equipped,'revision',revision,'blocked',blocked) from wallet),
    'purchases',coalesce((select jsonb_agg(jsonb_build_object('id',export_id,'platform',platform,'environment',environment,'transactionId',transaction_id,'sku',sku,'productKey',product_key,'kind',product_kind,'quantity',quantity,'theme',theme,'unlock',unlock_key,'grantedAt',granted_at,'revokedAt',revoked_at) order by export_id) from(select * from purchases order by export_id limit 100) page),'[]'),
    'spends',coalesce((select jsonb_agg(jsonb_build_object('id',id,'runId',run_id,'resource',resource,'amount',amount,'createdAt',created_at) order by id) from(select * from spends order by id limit 100) page),'[]'),
    'sessions',coalesce((select jsonb_agg(jsonb_build_object('id',id,'platform',platform,'createdAt',created_at,'expiresAt',expires_at,'revokedAt',revoked_at,'privacyContext',privacy_context,'country',country,'policyVersion',policy_version) order by id) from(select * from sessions order by id limit 100) page),'[]'),
    'assistedResults',coalesce((select jsonb_agg(jsonb_build_object('id',run_id,'runId',run_id,'rulesetVersion',ruleset_version,'lastClearedRow',last_cleared_row,'revivesToReachScore',revives_to_reach_score,'achievedAt',achieved_at,'finalizedAt',finalized_at) order by run_id) from(select * from assisted order by run_id limit 100) page),'[]'),
    'next',jsonb_build_object('purchase',case when(select count(*) from purchases)>100 then(select export_id from purchases order by export_id offset 99 limit 1) else null end,
      'spend',case when(select count(*) from spends)>100 then(select id from spends order by id offset 99 limit 1) else null end,
      'session',case when(select count(*) from sessions)>100 then(select id from sessions order by id offset 99 limit 1) else null end,
      'assistedResult',case when(select count(*) from assisted)>100 then(select run_id from assisted order by run_id offset 99 limit 1) else null end));
$$;
commit;
