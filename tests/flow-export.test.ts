// @vitest-environment happy-dom
/**
 * Orchestrator ladder tests (issue #7): every predictable failure maps to a
 * typed ExportOutcome, the DOM fallback rescues shape/network failures when
 * the page has content, and parser issues always propagate as warnings.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing';

import { EXPORT_FORMAT_LIST } from '../src/lib/export/options';
import { saveFilenameTemplate } from '../src/lib/export/storage';
import { serializeConversation } from '../src/lib/export/serialize';
import { EXPORT_FAILURE_MESSAGES, runExport } from '../src/lib/flow/export';
import type { ExportFlowDeps } from '../src/lib/flow/export';
import type { DownloadRequest } from '../src/lib/flow/download';
import { loadFixture } from './harness';

const CONV = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const ORG = '11111111-2222-4333-8444-555555555555';
const CHAT_PATH = `/chat/${CONV}`;
const FIXED_NOW = new Date('2026-07-06T12:00:00Z');

const DOM_FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'dom');

function loadDomFixture(name: string): Document {
  return new DOMParser().parseFromString(
    readFileSync(join(DOM_FIXTURES_DIR, name), 'utf8'),
    'text/html',
  );
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

/** Route /api/organizations and /chat_conversations to canned responses. */
function apiFetch(handlers: {
  orgs?: () => Response | Promise<Response>;
  conversation?: () => Response | Promise<Response>;
}): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    // Order matters: the conversation URL contains /api/organizations/ too.
    if (url.includes('/chat_conversations/')) {
      return handlers.conversation?.() ?? json(loadFixture('simple-text').raw);
    }
    if (url.includes('/api/organizations')) {
      return handlers.orgs?.() ?? json([{ uuid: ORG }]);
    }
    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;
}

/** Deps with a captured download and everything else deterministic. */
function makeDeps(overrides: Partial<ExportFlowDeps> = {}): {
  deps: ExportFlowDeps;
  downloads: DownloadRequest[];
} {
  const downloads: DownloadRequest[] = [];
  return {
    downloads,
    deps: {
      fetchImpl: apiFetch({}),
      pathname: CHAT_PATH,
      cookie: '',
      domRoot: loadDomFixture('unrelated-page.html'),
      download: (request) => downloads.push(request),
      serialize: serializeConversation,
      now: () => FIXED_NOW,
      ...overrides,
    },
  };
}

describe('runExport failure ladder', () => {
  it('returns no-conversation when the tab is not on a /chat/{uuid} page', async () => {
    const { deps } = makeDeps({ pathname: '/new' });
    await expect(runExport({ format: 'markdown' }, deps)).resolves.toEqual({
      ok: false,
      kind: 'no-conversation',
      message: EXPORT_FAILURE_MESSAGES['no-conversation'],
    });
  });

  it('returns logged-out on a 401, without attempting the DOM fallback', async () => {
    const { deps, downloads } = makeDeps({
      fetchImpl: apiFetch({ orgs: () => json({}, 401) }),
      // A page full of content: must still NOT be exported when logged out.
      domRoot: loadDomFixture('full-conversation.html'),
    });
    const outcome = await runExport({ format: 'markdown' }, deps);
    expect(outcome).toMatchObject({ ok: false, kind: 'logged-out' });
    expect(outcome.ok === false && outcome.message).toMatch(/log in/i);
    expect(downloads).toHaveLength(0);
  });

  it('returns logged-out when the session has no organizations', async () => {
    const { deps } = makeDeps({ fetchImpl: apiFetch({ orgs: () => json([]) }) });
    await expect(runExport({ format: 'markdown' }, deps)).resolves.toMatchObject({
      ok: false,
      kind: 'logged-out',
      detail: expect.stringContaining('organizations') as string,
    });
  });

  it('returns not-found for a deleted conversation, without the DOM fallback', async () => {
    const { deps, downloads } = makeDeps({
      fetchImpl: apiFetch({ conversation: () => json({}, 404) }),
      domRoot: loadDomFixture('full-conversation.html'),
    });
    const outcome = await runExport({ format: 'markdown' }, deps);
    expect(outcome).toMatchObject({ ok: false, kind: 'not-found' });
    expect(downloads).toHaveLength(0);
  });

  it('rescues an api-shape-change with the DOM fallback when the page has content', async () => {
    const { deps, downloads } = makeDeps({
      // An array where an object is expected -> UnexpectedShapeError.
      fetchImpl: apiFetch({ conversation: () => json([]) }),
      domRoot: loadDomFixture('full-conversation.html'),
    });
    const outcome = await runExport({ format: 'markdown' }, deps);
    expect(outcome).toMatchObject({ ok: true, degraded: true });
    if (outcome.ok) {
      expect(outcome.byteCount).toBeGreaterThan(0);
      expect(outcome.filename).toMatch(/\.md$/);
      // The first warning explains why the fallback ran; the rest are the
      // extraction's own limitations.
      expect(outcome.warnings[0]).toMatch(/rendered page/i);
      expect(outcome.warnings.join('\n')).toMatch(/thinking blocks/i);
    }
    expect(downloads).toHaveLength(1);
    expect(downloads[0]?.mimeType).toBe('text/markdown');
  });

  it('returns api-shape-change when the fallback finds no content', async () => {
    const { deps, downloads } = makeDeps({
      fetchImpl: apiFetch({ conversation: () => json([]) }),
      domRoot: loadDomFixture('unrelated-page.html'),
    });
    const outcome = await runExport({ format: 'markdown' }, deps);
    expect(outcome).toMatchObject({
      ok: false,
      kind: 'api-shape-change',
      message: EXPORT_FAILURE_MESSAGES['api-shape-change'],
      detail: expect.stringContaining('object') as string,
    });
    expect(downloads).toHaveLength(0);
  });

  it('returns network when claude.ai is unreachable and the fallback is empty', async () => {
    const { deps } = makeDeps({
      fetchImpl: apiFetch({
        conversation: () => {
          throw new TypeError('Failed to fetch');
        },
      }),
    });
    await expect(runExport({ format: 'markdown' }, deps)).resolves.toMatchObject({
      ok: false,
      kind: 'network',
    });
  });

  it('rescues a network failure with the DOM fallback when the page has content', async () => {
    const { deps } = makeDeps({
      fetchImpl: apiFetch({
        conversation: () => {
          throw new TypeError('Failed to fetch');
        },
      }),
      domRoot: loadDomFixture('full-conversation.html'),
    });
    await expect(runExport({ format: 'text' }, deps)).resolves.toMatchObject({
      ok: true,
      degraded: true,
    });
  });

  it('falls back to the page document when no domRoot is injected', async () => {
    // happy-dom provides an (empty) global document: fallback runs, finds
    // nothing, and the original error kind survives.
    const { deps } = makeDeps({
      fetchImpl: apiFetch({ conversation: () => json([]) }),
      domRoot: undefined,
    });
    await expect(runExport({ format: 'markdown' }, deps)).resolves.toMatchObject({
      ok: false,
      kind: 'api-shape-change',
    });
  });

  it('returns serializer-failure when the serializer throws', async () => {
    const { deps } = makeDeps({
      serialize: async () => {
        throw new Error('font table exploded');
      },
    });
    await expect(runExport({ format: 'pdf' }, deps)).resolves.toEqual({
      ok: false,
      kind: 'serializer-failure',
      message: EXPORT_FAILURE_MESSAGES['serializer-failure'],
      detail: 'font table exploded',
    });
  });

  it('returns serializer-failure when the download trigger throws', async () => {
    const { deps } = makeDeps({
      download: () => {
        throw new Error('blocked by the browser');
      },
    });
    await expect(runExport({ format: 'markdown' }, deps)).resolves.toMatchObject({
      ok: false,
      kind: 'serializer-failure',
      detail: 'blocked by the browser',
    });
  });

  it('rethrows non-API errors (programming bugs must not masquerade as outcomes)', async () => {
    const broken = vi.fn(async () => undefined) as unknown as typeof fetch;
    const { deps } = makeDeps({ fetchImpl: broken });
    await expect(runExport({ format: 'markdown' }, deps)).rejects.toThrow(TypeError);
  });
});

describe('runExport happy path', () => {
  it.each(EXPORT_FORMAT_LIST.map((info) => [info.format, info] as const))(
    'exports the current conversation as %s',
    async (format, info) => {
      const { deps, downloads } = makeDeps();
      const outcome = await runExport({ format }, deps);
      expect(outcome).toMatchObject({ ok: true, warnings: [] });
      if (outcome.ok) {
        expect(outcome.filename).toBe(`Planning a vegetable garden - 2026-05-14.${info.extension}`);
        expect(outcome.byteCount).toBeGreaterThan(0);
        expect(outcome.degraded).toBeUndefined();
      }
      expect(downloads).toHaveLength(1);
      expect(downloads[0]).toMatchObject({ mimeType: info.mimeType });
      expect(downloads[0]?.bytes.byteLength).toBe(outcome.ok ? outcome.byteCount : -1);
    },
  );

  it('propagates parser issues as warnings (API-shape early warning)', async () => {
    const raw = JSON.parse(JSON.stringify(loadFixture('simple-text').raw)) as Record<
      string,
      unknown
    >;
    delete raw['uuid'];
    const { deps } = makeDeps({ fetchImpl: apiFetch({ conversation: () => json(raw) }) });
    const outcome = await runExport({ format: 'markdown' }, deps);
    expect(outcome).toMatchObject({ ok: true });
    if (outcome.ok) {
      expect(outcome.warnings).toContain('uuid: Conversation has no uuid');
      expect(outcome.degraded).toBeUndefined();
    }
  });

  it('applies export option overrides end to end', async () => {
    const { deps, downloads } = makeDeps();
    const withHeader = await runExport({ format: 'markdown' }, deps);
    const withoutHeader = await runExport(
      { format: 'markdown', options: { includeConversationMetadata: false } },
      deps,
    );
    expect(withHeader.ok && withoutHeader.ok).toBe(true);
    if (withHeader.ok && withoutHeader.ok) {
      expect(withoutHeader.byteCount).toBeLessThan(withHeader.byteCount);
    }
    expect(downloads).toHaveLength(2);
  });

  it('falls back to the injected clock for the filename date when createdAt is missing', async () => {
    const raw = JSON.parse(JSON.stringify(loadFixture('simple-text').raw)) as Record<
      string,
      unknown
    >;
    delete raw['created_at'];
    const { deps } = makeDeps({ fetchImpl: apiFetch({ conversation: () => json(raw) }) });
    const outcome = await runExport({ format: 'text' }, deps);
    expect(outcome).toMatchObject({
      ok: true,
      filename: 'Planning a vegetable garden - 2026-07-06.txt',
    });
  });
});

describe('runExport filename template (issue #15)', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('names the download from the template stored by the options page', async () => {
    await saveFilenameTemplate('{date} {title}.{ext}');
    const { deps, downloads } = makeDeps();
    const outcome = await runExport({ format: 'markdown' }, deps);
    expect(outcome).toMatchObject({
      ok: true,
      filename: '2026-05-14 Planning a vegetable garden.md',
    });
    expect(downloads[0]?.filename).toBe('2026-05-14 Planning a vegetable garden.md');
  });

  it('uses an injected template loader when provided', async () => {
    const { deps } = makeDeps({ loadFilenameTemplate: async () => '{title}.{ext}' });
    await expect(runExport({ format: 'pdf' }, deps)).resolves.toMatchObject({
      ok: true,
      filename: 'Planning a vegetable garden.pdf',
    });
  });

  it('degrades to the default template when the loader fails', async () => {
    const { deps } = makeDeps({
      loadFilenameTemplate: async () => {
        throw new Error('storage unavailable');
      },
    });
    await expect(runExport({ format: 'markdown' }, deps)).resolves.toMatchObject({
      ok: true,
      filename: 'Planning a vegetable garden - 2026-05-14.md',
    });
  });
});
