begin;

alter table cpi_private.commerce_wallets drop constraint commerce_owned_valid;
alter table cpi_private.commerce_wallets add constraint commerce_owned_valid check (
  owned <@ array['obsidian', 'chaos', 'jelly', 'wilds', 'league', 'puppy', 'kitten', 'moonpatch', 'candy']::text[]
  and 'obsidian' = any(owned)
);

commit;
