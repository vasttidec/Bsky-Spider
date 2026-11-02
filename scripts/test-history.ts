/**
 * Verifies that search history is stored per account and that the shared list
 * from older versions is adopted by only one account.
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const work = path.join(root, '.tmp', 'history-test');
await fs.rm(work, { recursive: true, force: true });
await fs.mkdir(work, { recursive: true });
process.env.BSKY_SPIDER_DATA_DIR = path.join(work, 'data');
await fs.mkdir(path.join(work, 'data'), { recursive: true });
// Version 1 style file: one shared list.
await fs.writeFile(
  path.join(work, 'data', 'history.json'),
  JSON.stringify(['legacy-one', 'legacy-two']),
  'utf8',
);

const { initHistory, getSearchHistory, addSearchHistory, clearSearchHistory } =
  await import('../server/history');

await initHistory();

const accountA = 'did:plc:aaaaaaaaaaaaaaaaaaaaaaaa';
const accountB = 'did:plc:bbbbbbbbbbbbbbbbbbbbbbbb';

const firstA = await getSearchHistory(accountA);
if (firstA.join(',') !== 'legacy-one,legacy-two') {
  throw new Error(`legacy history was not adopted: ${JSON.stringify(firstA)}`);
}
const firstB = await getSearchHistory(accountB);
if (firstB.length !== 0) {
  throw new Error(`second account saw shared history: ${JSON.stringify(firstB)}`);
}

await addSearchHistory(accountA, 'alpha.bsky.social');
await addSearchHistory(accountB, 'beta.bsky.social');
const listA = await getSearchHistory(accountA);
const listB = await getSearchHistory(accountB);
if (!listA.includes('alpha.bsky.social') || listB.includes('alpha.bsky.social')) {
  throw new Error(`history leaked between accounts: A=${JSON.stringify(listA)} B=${JSON.stringify(listB)}`);
}
if (!listB.includes('beta.bsky.social') || listA.includes('beta.bsky.social')) {
  throw new Error(`history leaked between accounts: A=${JSON.stringify(listA)} B=${JSON.stringify(listB)}`);
}

await clearSearchHistory(accountA);
const clearedA = await getSearchHistory(accountA);
const keptB = await getSearchHistory(accountB);
if (clearedA.length !== 0) throw new Error('clear did not empty the account list');
if (!keptB.includes('beta.bsky.social')) {
  throw new Error('clearing one account removed another account history');
}

const anonymous = await getSearchHistory(null);
if (anonymous.length !== 0) {
  throw new Error('anonymous requests must not see any history');
}

const stored = JSON.parse(
  await fs.readFile(path.join(work, 'data', 'history.json'), 'utf8'),
);
if (stored.version !== 2 || !stored.byAccount || !stored.byAccount[accountB]) {
  throw new Error(`unexpected history file: ${JSON.stringify(stored)}`);
}
console.log(
  'PASS: search history is isolated per account and legacy lists are adopted once',
);
