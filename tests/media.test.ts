import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { handleUploadMedia } from '../src/commands/media';

const originalFetch = globalThis.fetch;
const tempDirs: string[] = [];

afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('handleUploadMedia', () => {
  const cases: [string, string][] = [
    ['mp4', 'video/mp4'],
    ['mov', 'video/quicktime'],
    ['webm', 'video/webm'],
    ['mkv', 'video/x-matroska'],
    ['jpg', 'image/jpeg'],
    ['jpeg', 'image/jpeg'],
    ['png', 'image/png'],
    ['webp', 'image/webp'],
    ['gif', 'image/gif'],
  ];

  test.each(cases)('detects .%s as %s', async (extension, contentType) => {
    const dir = mkdtempSync(join(tmpdir(), 'kli-media-'));
    tempDirs.push(dir);
    const filePath = join(dir, `sample.${extension}`);
    writeFileSync(filePath, 'media bytes');
    const requests: { url: string; init?: RequestInit }[] = [];

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      requests.push({ url, init });
      if (url.endsWith('/presigned-url')) {
        return new Response(JSON.stringify({ fileId: 'file-1', uploadUrl: 'https://s3.test/put', key: 's3-key' }), { status: 200 });
      }
      if (url === 'https://s3.test/put') return new Response(null, { status: 200 });
      if (url.endsWith('/upload/complete')) return new Response(JSON.stringify({ success: true }), { status: 200 });
      throw new Error(`unexpected URL: ${url}`);
    }) as unknown as typeof fetch;

    await handleUploadMedia('https://api.test', 'token', filePath);

    expect(requests).toHaveLength(3);
    const presignBody = JSON.parse(String(requests[0].init?.body));
    expect(presignBody.contentType).toBe(contentType);
    expect(JSON.parse(String(requests[2].init?.body)).contentType).toBe(contentType);
    expect((requests[1].init?.headers as Record<string, string>)['Content-Type']).toBe(contentType);
  });

  test('rejects unsupported extensions before making network calls', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'kli-media-'));
    tempDirs.push(dir);
    const filePath = join(dir, 'sample.txt');
    writeFileSync(filePath, 'not media');
    let networkCalls = 0;
    globalThis.fetch = (async () => {
      networkCalls++;
      return new Response(null, { status: 500 });
    }) as unknown as typeof fetch;
    const errors: string[] = [];
    const originalError = console.error;
    const originalExit = process.exit;
    console.error = (...args: unknown[]) => errors.push(args.join(' '));
    process.exit = ((code?: number) => {
      throw new Error(`EXIT:${code}`);
    }) as never;

    try {
      await expect(handleUploadMedia('https://api.test', 'token', filePath)).rejects.toThrow('EXIT:1');
    } finally {
      console.error = originalError;
      process.exit = originalExit;
    }

    expect(networkCalls).toBe(0);
    expect(errors.join('\n')).toContain('Unsupported file extension');
    expect(errors.join('\n')).toContain('mp4');
    expect(errors.join('\n')).toContain('gif');
  });
});
