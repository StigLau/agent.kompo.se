/**
 * Tests for KLI formatters
 */

import { describe, test, expect } from 'bun:test';
import {
  formatProductionsMarkdown,
  formatProductionsByKompositionMarkdown,
  formatProductionMarkdown,
  formatProductionStreamMarkdown,
  formatFreshBuildQcMarkdown,
  buildLoadFilePostBody,
  parseLoadFileResponse,
  extractIdsFromJson,
} from '../src/formatters';

// ---------------------------------------------------------------------------
// formatProductionsMarkdown
// ---------------------------------------------------------------------------

describe('formatProductionsMarkdown', () => {
  test('empty list', () => {
    const result = formatProductionsMarkdown([]);
    expect(result).toContain('# Productions');
    expect(result).toContain('- count: 0');
  });

  test('single production', () => {
    const productions = [
      {
        productionId: 'prod-abc123',
        name: 'My First Video',
        status: 'READY',
        kompositionId: 'komp-xyz789',
      },
    ];
    const result = formatProductionsMarkdown(productions);
    expect(result).toContain('prod-abc123');
    expect(result).toContain('My First Video');
    expect(result).toContain('READY');
    expect(result).toContain('komp-xyz789');
  });

  test('multiple productions', () => {
    const productions = [
      { productionId: 'p1', name: 'Video A', status: 'READY', kompositionId: 'k1' },
      { id: 'p2', title: 'Video B', status: 'PROCESSING', kompositionId: 'k2' },
    ];
    const result = formatProductionsMarkdown(productions);
    expect(result).toContain('- count: 2');
    expect(result).toContain('p1');
    expect(result).toContain('p2');
    expect(result).toContain('Video B');
  });

  test('handles missing fields gracefully', () => {
    const productions = [{}];
    const result = formatProductionsMarkdown(productions);
    expect(result).toContain('(untitled)');
    expect(result).toContain('unknown');
  });
});

// ---------------------------------------------------------------------------
// formatProductionsByKompositionMarkdown
// ---------------------------------------------------------------------------

describe('formatProductionsByKompositionMarkdown', () => {
  test('with productions', () => {
    const productions = [
      { productionId: 'p1', name: 'Video A', status: 'READY', jobId: 'job-1' },
    ];
    const result = formatProductionsByKompositionMarkdown('komp-123', productions);
    expect(result).toContain('# Productions for komposition komp-123');
    expect(result).toContain('- count: 1');
    expect(result).toContain('job=job-1');
  });
});

// ---------------------------------------------------------------------------
// formatProductionMarkdown
// ---------------------------------------------------------------------------

describe('formatProductionMarkdown', () => {
  test('flat object', () => {
    const production = {
      productionId: 'prod-1',
      name: 'My Video',
      status: 'READY',
      kompositionId: 'komp-1',
      jobId: 'job-1',
    };
    const result = formatProductionMarkdown('prod-1', production);
    expect(result).toContain('# Production prod-1');
    expect(result).toContain('- name: My Video');
    expect(result).toContain('- status: READY');
    expect(result).toContain('- jobId: job-1');
  });

  test('with outputUrl', () => {
    const production = {
      productionId: 'prod-1',
      name: 'My Video',
      status: 'READY',
      kompositionId: 'komp-1',
      jobId: 'job-1',
      outputUrl: 'https://example.com/video.mp4',
    };
    const result = formatProductionMarkdown('prod-1', production);
    expect(result).toContain('[present]');
  });

  test('wrapped in production key', () => {
    const data = {
      production: {
        id: 'prod-1',
        title: 'Wrapped Video',
        status: 'PROCESSING',
        kompositionId: 'komp-1',
        jobId: 'job-1',
      },
    };
    const result = formatProductionMarkdown('prod-1', data);
    expect(result).toContain('- name: Wrapped Video');
    expect(result).toContain('- status: PROCESSING');
  });

  test('missing fields fill with unknown', () => {
    const result = formatProductionMarkdown('prod-1', {});
    expect(result).toContain('- name: (untitled)');
    expect(result).toContain('- status: unknown');
    expect(result).toContain('- kompositionId: unknown');
  });
});

// ---------------------------------------------------------------------------
// formatProductionStreamMarkdown
// ---------------------------------------------------------------------------

describe('formatProductionStreamMarkdown', () => {
  test('with streamUrl', () => {
    const result = formatProductionStreamMarkdown('prod-1', {
      streamUrl: 'https://cdn.example.com/stream.m3u8',
    });
    expect(result).toContain('[present]');
    expect(result).toContain('urlPrefix');
  });

  test('without streamUrl', () => {
    const result = formatProductionStreamMarkdown('prod-1', {});
    expect(result).toContain('[missing]');
  });
});

// ---------------------------------------------------------------------------
// formatFreshBuildQcMarkdown
// ---------------------------------------------------------------------------

describe('formatFreshBuildQcMarkdown', () => {
  test('success case', () => {
    const result = formatFreshBuildQcMarkdown({
      kompositionId: 'komp-1',
      kompositionTitle: 'Test Komposition',
      jobId: 'job-1',
      jobStatus: 'SUCCEEDED',
      productionId: 'prod-1',
      streamUrlPresent: true,
    });
    expect(result).toContain('# Muse Fresh Build QC');
    expect(result).toContain('Test Komposition');
    expect(result).toContain('SUCCEEDED');
    expect(result).toContain('prod-1');
    expect(result).toContain('[present]');
  });

  test('missing production and stream', () => {
    const result = formatFreshBuildQcMarkdown({
      kompositionId: 'komp-1',
      kompositionTitle: 'Test Komposition',
      jobId: 'job-1',
      jobStatus: 'FAILED',
      streamUrlPresent: false,
    });
    expect(result).toContain('FAILED');
    expect(result).toContain('[missing]');
  });
});

// ---------------------------------------------------------------------------
// buildLoadFilePostBody + parseLoadFileResponse
// ---------------------------------------------------------------------------

describe('workstate/load-file helpers', () => {
  test('buildLoadFilePostBody', () => {
    const body = buildLoadFilePostBody('# My Komposition\n\nbpm: 120');
    const parsed = JSON.parse(body);
    expect(parsed.content).toBe('# My Komposition\n\nbpm: 120');
    expect(parsed.contentType).toBe('markdown');
    expect(parsed.status).toBe('draft');
  });

  test('parseLoadFileResponse with komposition wrapper', () => {
    const apiResponse = {
      komposition: {
        id: 'komp-abc',
        name: 'My Kompo',
        status: 'draft',
      },
    };
    const result = parseLoadFileResponse(apiResponse, 'fallback.md');
    expect(result.id).toBe('komp-abc');
    expect(result.title).toBe('My Kompo');
    expect(result.status).toBe('draft');
  });

  test('parseLoadFileResponse flat', () => {
    const apiResponse = {
      id: 'komp-xyz',
      title: 'Flat Kompo',
      status: 'active',
    };
    const result = parseLoadFileResponse(apiResponse, 'fallback.md');
    expect(result.id).toBe('komp-xyz');
    expect(result.title).toBe('Flat Kompo');
    expect(result.status).toBe('active');
  });

  test('parseLoadFileResponse fallback', () => {
    const result = parseLoadFileResponse({}, 'myfile.md');
    expect(result.id).toBe('');
    expect(result.title).toBe('myfile.md');
    expect(result.status).toBe('draft');
  });

  test('parseLoadFileResponse kompositionId fallback', () => {
    const apiResponse = {
      kompositionId: 'k-123',
      status: 'ready',
    };
    const result = parseLoadFileResponse(apiResponse, 'test.md');
    expect(result.id).toBe('k-123');
    expect(result.title).toBe('test.md');
    expect(result.status).toBe('ready');
  });
});

// ---------------------------------------------------------------------------
// extractIdsFromJson
// ---------------------------------------------------------------------------

describe('extractIdsFromJson', () => {
  test('extracts ids from common keys', () => {
    const data = {
      id: 'root-id',
      jobId: 'job-123',
      komposition_id: 'komp-456',
      file_id: 'file-789',
      nested: { jobId: 'nested-job' },
      items: [{ id: 'item-1' }, { id: 'item-2' }],
    };
    const ids = extractIdsFromJson(data);
    expect(ids).toContain('root-id');
    expect(ids).toContain('job-123');
    expect(ids).toContain('komp-456');
    expect(ids).toContain('file-789');
    expect(ids).toContain('nested-job');
    expect(ids).toContain('item-1');
    expect(ids).toContain('item-2');
  });

  test('extracts created_*_ids arrays', () => {
    const data = {
      created_komposition_ids: ['k1', 'k2'],
      created_video_ids: ['v1'],
    };
    const ids = extractIdsFromJson(data);
    expect(ids).toContain('k1');
    expect(ids).toContain('k2');
    expect(ids).toContain('v1');
  });

  test('deduplicates', () => {
    const data = {
      id: 'dup',
      items: [{ id: 'dup' }],
    };
    const ids = extractIdsFromJson(data);
    expect(ids.filter(id => id === 'dup').length).toBe(1);
  });
});
