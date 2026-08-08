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

  test('escapes user-controlled Markdown table content', () => {
    const md = formatSourcesMarkdown({
      sources: [{ id: 'source`1', name: 'A | B\nInjected', contentType: 'source|audio' }],
    });
    expect(md).toContain('| A \\| B Injected | source\\|audio | — | ``source`1`` |');
    expect(md).not.toContain('B\nInjected');
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

  test('does not coerce null, empty, or non-numeric analysis fields to numbers', () => {
    for (const bpm of [null, '', '128', Number.NaN, Number.POSITIVE_INFINITY]) {
      const md = formatMediaAnalysisMarkdown({
        fileId: 'audio-1',
        bpm,
        beat1Ms: null,
        analyzedAt: '2026-01-01T00:00:00Z',
      });
      expect(md).toContain('- status: pending');
      expect(md).toContain('- BPM: pending');
      expect(md).toContain('- beat1Ms: pending');
    }
  });
});
