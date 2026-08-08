import { describe, expect, test } from 'bun:test';
import { formatMediaAnalysisMarkdown } from '../src/commands/analysis';
import { extractSources, formatSourcesMarkdown } from '../src/commands/sources';

describe('sources formatting', () => {
  test('extracts and renders documented source response shapes', () => {
    const data = { sources: [{ kompositionId: 'source-1', name: 'Track', contentType: 'source-audio', status: 'complete' }] };
    expect(extractSources(data)).toEqual([{ id: 'source-1', name: 'Track', contentType: 'source-audio', status: 'complete' }]);
    expect(formatSourcesMarkdown(data)).toContain('| Track | source-audio | complete | `source-1` |');
  });

  test('handles an empty or malformed source response', () => {
    expect(extractSources({})).toEqual([]);
    expect(formatSourcesMarkdown({})).toContain('# Sources (0)');
  });
});

describe('media analysis formatting', () => {
  test('reports complete analysis only with analyzedAt and a finite BPM', () => {
    const md = formatMediaAnalysisMarkdown({ fileId: 'audio-1', bpm: 128, confidence: 'HIGH', beat1Ms: 20, beats: [20, 489], downbeats: [20], analyzedAt: '2026-01-01T00:00:00Z' });
    expect(md).toContain('- status: complete');
    expect(md).toContain('- BPM: 128');
    expect(md).toContain('- beats: 2');
  });

  test('reports pending incomplete analysis', () => {
    expect(formatMediaAnalysisMarkdown({ fileId: 'audio-1' })).toContain('- status: pending');
  });
});
