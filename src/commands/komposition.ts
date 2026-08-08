/** Local komposition authoring helpers. */

import * as fs from 'fs';
import * as path from 'path';

export function renderKompositionTemplate(title: string): string {
  return `# ${title}

## Metadata
- BPM: 120

## Tracks

### Visuals
- [VIDEO_FILE_ID](source-video) "Replace with your visual"
  - Start: 0 beats
  - End: 16 beats

### Audio
- [AUDIO_FILE_ID](source-audio) "Replace with your analyzed track"
  - Start: 0 beats
  - End: 16 beats
`;
}

function titleFromPath(filePath: string): string {
  const base = path.basename(filePath).replace(/\.(?:v3\.)?kompo\.md$/i, '');
  return base
    .split(/[-_]+/)
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ') || 'My Komposition';
}

/** Write a documented V1/V2 komposition skeleton without overwriting user work. */
export function handleKompositionTemplate(filePath: string): void {
  const resolvedPath = path.resolve(process.cwd(), filePath);
  if (fs.existsSync(resolvedPath)) {
    throw new Error(`Refusing to overwrite existing file: ${resolvedPath}`);
  }
  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  fs.writeFileSync(resolvedPath, renderKompositionTemplate(titleFromPath(resolvedPath)), 'utf8');
  console.log(`# Komposition template created\n\n- path: ${resolvedPath}\n- Next: replace VIDEO_FILE_ID and AUDIO_FILE_ID, then run:\n  kli workstate/load-file ${filePath}`);
}
