import { describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { handleKompositionTemplate, renderKompositionTemplate } from '../src/commands/komposition';

describe('komposition template', () => {
  test('renders the documented V1/V2 skeleton', () => {
    const template = renderKompositionTemplate('My Video');
    expect(template).toStartWith('# My Video\n');
    expect(template).toContain('## Metadata\n- BPM: 120');
    expect(template).toContain('[VIDEO_FILE_ID](source-video)');
    expect(template).toContain('[AUDIO_FILE_ID](source-audio)');
    expect(template).toContain('Start: 0 beats');
  });

  test('writes a titled template and refuses overwrite', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kli-komposition-template-'));
    const file = join(dir, 'my-first-video.kompo.md');
    try {
      handleKompositionTemplate(file);
      expect(existsSync(file)).toBe(true);
      expect(readFileSync(file, 'utf8')).toStartWith('# My First Video\n');
      expect(() => handleKompositionTemplate(file)).toThrow('Refusing to overwrite existing file');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
