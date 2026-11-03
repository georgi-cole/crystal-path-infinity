import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const yaml = readFileSync(
  new URL('../../.github/workflows/supabase-development-preview.yml', import.meta.url),
  'utf8',
);

test('development preview is only manual, only on main and uses a scoped environment', () => {
  assert.match(yaml, /^on:\n  workflow_dispatch:\s*$/m);
  assert.doesNotMatch(yaml, /^  (pull_request|push|schedule):/m);
  assert.match(yaml, /^    if: \$\{\{ github\.ref == 'refs\/heads\/main' \}\}$/m);
  assert.match(yaml, /^    environment: cpi-development$/m);
  assert.match(yaml, /^permissions:\n  contents: read$/m);
});

test('target is fixed to the supplied development ref and credentials come only from secrets', () => {
  assert.match(yaml, /^      CPI_SUPABASE_DEV_REF: jbyguybxhezjhdbenevh$/m);
  assert.match(yaml, /^      SUPABASE_PROJECT_ID: jbyguybxhezjhdbenevh$/m);
  assert.match(yaml, /SUPABASE_ACCESS_TOKEN: \$\{\{ secrets\.CPI_DEV_SUPABASE_ACCESS_TOKEN \}\}/);
  assert.match(yaml, /SUPABASE_DB_PASSWORD: \$\{\{ secrets\.CPI_DEV_SUPABASE_DB_PASSWORD \}\}/);
});

test('no remote write, reset, seeding, or automatic confirmation is possible', () => {
  const commands = yaml
    .split('\n')
    .filter((line) => /^\s+(?:if ! )?supabase\s/.test(line))
    .map((line) => line.trim());
  assert.deepEqual(commands, [
    'supabase link --project-ref "$CPI_SUPABASE_DEV_REF"',
    'supabase db query "select 1 as cpi_readonly_probe" --read-only --remote="$CPI_SUPABASE_DEV_REF" > "$output" 2>&1; then',
    'supabase db push --dry-run --remote="$CPI_SUPABASE_DEV_REF"',
  ]);
  assert.doesNotMatch(yaml, /^\s+supabase\s+(?:db reset|migration repair|seed)/m);
  assert.doesNotMatch(yaml, /\bSUPABASE_YES\b|^\s+supabase\s+db push --remote/m);
  assert.match(yaml, /Supabase Database Read scope confirmed with read-only SQL/);
  assert.match(yaml, /check-cpi017-deploy-output\.mjs failure "\$output"/);
});
