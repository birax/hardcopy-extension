/**
 * Fixture harness: auto-discovers every conversation JSON in tests/fixtures.
 *
 * Reused by the parser snapshot suite today and by serializer suites in M2 —
 * each suite iterates `loadFixtures()` (times its own options matrix) so that
 * adding a fixture file re-verifies the whole pipeline with no harness changes.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** One discovered fixture: its short name and the raw parsed JSON payload. */
export interface Fixture {
  /** File name without extension, e.g. `'branched-tree'`. */
  name: string;
  /** The raw conversation payload, exactly as the API would return it. */
  raw: unknown;
}

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

/** Load every `tests/fixtures/*.json` fixture, sorted by name. */
export function loadFixtures(): Fixture[] {
  return readdirSync(FIXTURES_DIR)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => ({
      name: basename(file, '.json'),
      raw: JSON.parse(readFileSync(join(FIXTURES_DIR, file), 'utf8')) as unknown,
    }));
}

/** Look up a single fixture by name; throws when it does not exist. */
export function loadFixture(name: string): Fixture {
  const fixture = loadFixtures().find((candidate) => candidate.name === name);
  if (fixture === undefined) {
    throw new Error(`No fixture named "${name}" in tests/fixtures`);
  }
  return fixture;
}
