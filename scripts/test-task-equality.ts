/**
 * Unit test for the polling equality helper: identical payloads must compare
 * equal (so the download list is not re-rendered on every poll tick), while
 * any task or counter change must compare different.
 */
import assert from 'node:assert/strict';
import { tasksPayloadEqual } from '../src/utils/taskEquality';

const counts = {
  downloading: 1,
  waiting: 0,
  paused: 0,
  error: 0,
  completed: 2,
};

const task = (overrides: Record<string, unknown> = {}) => ({
  id: 'task-1',
  status: 'downloading',
  progress: 42,
  downloadedBytes: 1024,
  totalBytes: 4096,
  speed: 512,
  eta: 12,
  fileName: 'a.jpg',
  relativePath: 'user/a.jpg',
  filePath: '/tmp/a.jpg',
  skipped: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const base = { tasks: [task()], counts, concurrency: 3 };

assert.equal(tasksPayloadEqual(base, { ...base }), true);
assert.equal(
  tasksPayloadEqual(base, { ...base, tasks: [task()] }),
  true,
  'same task values in a new array must be equal',
);
assert.equal(
  tasksPayloadEqual(base, { ...base, tasks: [task({ progress: 43 })] }),
  false,
  'progress change must differ',
);
assert.equal(
  tasksPayloadEqual(base, {
    ...base,
    counts: { ...counts, completed: 3 },
  }),
  false,
  'count change must differ',
);
assert.equal(
  tasksPayloadEqual(base, { ...base, concurrency: 4 }),
  false,
  'concurrency change must differ',
);
assert.equal(
  tasksPayloadEqual(base, { ...base, tasks: [task(), task({ id: 'task-2' })] }),
  false,
  'extra task must differ',
);

console.log('PASS: tasksPayloadEqual');
