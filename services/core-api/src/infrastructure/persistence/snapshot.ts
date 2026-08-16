import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/**
 * File-backed durability for the `memory` driver.
 *
 * ## What this is, and what it is not
 *
 * This makes the in-memory stores survive a restart so the product can be **trialled** —
 * a clinic that disappears when the API restarts is not something anyone can evaluate.
 * It is one file, rewritten atomically, holding the collections the application mutates.
 *
 * It is **not a database**, and it is not for real patient data. There are no
 * transactions, no concurrent-writer safety, and no row-level security — the last of
 * which is the second layer of tenant isolation that a production deployment is required
 * to have (§17.3). Postgres remains the production path; the migrations for it are
 * already written.
 *
 * Deliberately refused when `NODE_ENV=production`, for the same reason the `memory`
 * driver itself is: a system that quietly runs a trial-grade datastore in production is
 * worse than one that will not start.
 *
 * ## Why a JSON snapshot rather than SQLite
 *
 * `node:sqlite` is available and would be more robust. Using it would mean a *third*
 * persistence implementation beside `memory` and `postgres` — one that has to be written,
 * kept correct as the domain changes, and then deleted. This adds durability to the code
 * path that already exists, and vanishes in one commit when Postgres arrives.
 */

/** How long to wait after a change before writing. Batches a burst into one write. */
const DEBOUNCE_MS = 250;

interface Collection {
  readonly name: string;
  /** Current contents, for writing. */
  readonly read: () => unknown[];
  /** Replaces contents in place, for loading. */
  readonly restore: (rows: unknown[]) => void;
}

const collections: Collection[] = [];

let snapshotPath: string | null = null;
let timer: NodeJS.Timeout | null = null;
let loaded = false;

/**
 * Registers a mutable array.
 *
 * The array is restored **in place** rather than reassigned, because every store closes
 * over its own module-level reference. Handing back a new array would leave each store
 * reading the old one.
 */
export function persistArray<T>(name: string, array: T[]): void {
  collections.push({
    name,
    read: () => array,
    restore: (rows) => {
      array.length = 0;
      array.push(...(rows as T[]));
    },
  });
}

/** Registers a mutable `Map`, persisted as its values. */
export function persistMap<T>(name: string, map: Map<string, T>, keyOf: (row: T) => string): void {
  collections.push({
    name,
    read: () => [...map.values()],
    restore: (rows) => {
      map.clear();
      for (const row of rows as T[]) map.set(keyOf(row), row);
    },
  });
}

/**
 * Loads the snapshot, if one exists.
 *
 * Called once at boot, **before** anything reads. A missing file is normal — it is the
 * first run. A corrupt file is not silently ignored: it throws, because starting with a
 * blank slate would look like a working system that has lost every clinic on it.
 */
export function loadSnapshot(enabled: boolean, path: string, isProduction: boolean): void {
  if (!enabled) return;
  if (isProduction) {
    throw new Error(
      'Snapshot persistence is refused when NODE_ENV=production. It is a trial affordance, ' +
        'not a database. Set DATA_DRIVER=postgres.',
    );
  }

  snapshotPath = resolve(path);
  loaded = true;

  let raw: string;
  try {
    raw = readFileSync(snapshotPath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; // First run.
    throw error;
  }

  let parsed: Record<string, unknown[]>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown[]>;
  } catch (cause) {
    throw new Error(
      `The snapshot at ${snapshotPath} is not valid JSON. Refusing to start with an empty ` +
        `dataset — move the file aside deliberately if you meant to reset. (${String(cause)})`,
    );
  }

  for (const collection of collections) {
    const rows = parsed[collection.name];
    if (Array.isArray(rows)) collection.restore(rows);
  }
}

/** Absolute path in use, for logging. `null` before {@link loadSnapshot} runs. */
export function snapshotLocation(): string | null {
  return snapshotPath;
}

/** Marks the dataset changed. Cheap and safe to call from every mutation. */
export function persist(): void {
  if (!loaded || !snapshotPath) return;

  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    writeSnapshot();
  }, DEBOUNCE_MS);
  // Do not hold the process open just to flush a snapshot; shutdown flushes explicitly.
  timer.unref?.();
}

/** Writes immediately. Called on shutdown so a pending debounce is not lost. */
export function flushSnapshot(): void {
  if (!loaded || !snapshotPath) return;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  writeSnapshot();
}

function writeSnapshot(): void {
  if (!snapshotPath) return;

  const payload: Record<string, unknown[]> = {};
  for (const collection of collections) {
    payload[collection.name] = collection.read();
  }

  // Written to a sibling then renamed. `rename` is atomic within a filesystem, so a crash
  // mid-write leaves the previous good snapshot rather than a truncated one.
  const temporary = `${snapshotPath}.tmp`;
  mkdirSync(dirname(snapshotPath), { recursive: true });
  writeFileSync(temporary, JSON.stringify(payload, null, 2), 'utf8');
  renameSync(temporary, snapshotPath);
}
