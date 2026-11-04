/** Disposable CI databases only. No live policy change is invoked by this helper. */
export async function enableFixtureOperations(admin) {
  const result = await admin.query('select cpi_private.get_operations_policy() as policy');
  const original = result.rows[0].policy;
  await admin.query(
    "select cpi_private.set_operations_policy($1::bigint,true,true,1,1,'infinity-v1',ARRAY['infinity-v1'],'none','CI:runtime')",
    [original.revision],
  );
  return async () => {
    const current = await admin.query('select cpi_private.get_operations_policy() as policy');
    await admin.query(
      'select cpi_private.set_operations_policy($1::bigint,$2::boolean,$3::boolean,$4::integer,$5::integer,$6::text,$7::text[],$8::text,$9::text)',
      [
        current.rows[0].policy.revision,
        original.rankedStartsEnabled,
        original.adStartsEnabled,
        original.minimumClientBuild,
        original.recoveryMinimumClientBuild,
        original.startRuleset,
        original.recoveryRulesets,
        original.maintenanceCode,
        'CI:runtime-restore',
      ],
    );
  };
}
