import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url),
  command = process.argv[2];
if (command === 'init') {
  let text = await readFile(new URL('.env.live.example', root), 'utf8');
  const names = [
    'CPI_PRIVATE_PEPPER',
    'CPI_ENCRYPTION_KEY',
    'CPI_GATEWAY_KEY',
    'CPI_WORKER_KEY',
    'CPI_RUNTIME_DB_PASSWORD',
  ];
  for (const name of names)
    text = text.replace(
      new RegExp('^' + name + '=.*$', 'm'),
      name + '=' + randomBytes(32).toString('hex'),
    );
  try {
    await writeFile(new URL('.env.live.local', root), text, { flag: 'wx', mode: 0o600 });
    console.log(
      'Created ignored backend/.env.live.local with independent private keys and runtime password. No secrets were printed.',
    );
  } catch (error) {
    if (error.code === 'EEXIST')
      console.log('Kept existing private configuration; no keys were replaced.');
    else throw new Error('Could not create private configuration');
  }
} else if (command === 'catalog') {
  const proposal = JSON.parse(
    await readFile(new URL('commerce-products.proposed.json', root), 'utf8'),
  );
  const products = ['android', 'ios'].flatMap((platform) =>
    proposal.products.map(({ key, proposedSku, kind, quantity, theme }) => ({
      platform,
      key,
      sku: proposedSku,
      kind,
      quantity,
      ...(theme ? { theme } : {}),
      available: true,
    })),
  );
  await writeFile(
    new URL('commerce-products.live.example.json', root),
    JSON.stringify({ status: 'unconfirmed', products }, null, 2) + '\n',
  );
  console.log('Prepared 36 product mappings. These are unconfirmed and do not activate billing.');
} else {
  console.error('Usage: node backend/scripts/prepare-live.mjs init|catalog');
  process.exitCode = 1;
}
