/** KLI source (kilde) commands. */

import { jsonFetch } from '../api';

export interface SourceSummary {
  id: string;
  name: string;
  contentType?: string;
  status?: string;
}

export function extractSources(data: any): SourceSummary[] {
  const raw = Array.isArray(data) ? data : data?.sources || data?.kompositions || [];
  if (!Array.isArray(raw)) return [];
  return raw
    .map((source: any) => ({
      id: source.kompositionId || source.id || '',
      name: source.name || source.title || source.kompositionId || source.id || '(unnamed)',
      contentType: source.contentType,
      status: source.status,
    }))
    .filter((source: SourceSummary) => source.id);
}

export function formatSourcesMarkdown(data: any): string {
  const sources = extractSources(data);
  const lines = [`# Sources (${sources.length})`, '', '| Name | Type | Status | ID |', '|------|------|--------|----|'];
  for (const source of sources) {
    lines.push(`| ${source.name} | ${source.contentType || '—'} | ${source.status || '—'} | \`${source.id}\` |`);
  }
  return lines.join('\n');
}

export async function handleSources(apiUrl: string, token: string): Promise<void> {
  const data = await jsonFetch(`${apiUrl}/api/kompositions/sources`, { token });
  console.log(formatSourcesMarkdown(data));
}
