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

function normalizedTableValue(value: unknown): string {
  return String(value).replace(/[\r\n]+/g, ' ').replace(/\|/g, '\\|');
}

function markdownTableCell(value: unknown): string {
  return normalizedTableValue(value).replace(/`/g, '\\`');
}

function markdownInlineCode(value: unknown): string {
  const normalized = normalizedTableValue(value);
  const longestRun = Math.max(0, ...Array.from(normalized.matchAll(/`+/g), match => match[0].length));
  const delimiter = '`'.repeat(longestRun + 1);
  return `${delimiter}${normalized}${delimiter}`;
}

export function formatSourcesMarkdown(data: any): string {
  const sources = extractSources(data);
  const lines = [`# Sources (${sources.length})`, '', '| Name | Type | Status | ID |', '|------|------|--------|----|'];
  for (const source of sources) {
    const name = markdownTableCell(source.name);
    const type = markdownTableCell(source.contentType || '—');
    const status = markdownTableCell(source.status || '—');
    const id = markdownInlineCode(source.id);
    lines.push(`| ${name} | ${type} | ${status} | ${id} |`);
  }
  return lines.join('\n');
}

export async function handleSources(apiUrl: string, token: string): Promise<void> {
  const data = await jsonFetch(`${apiUrl}/api/kompositions/sources`, { token });
  console.log(formatSourcesMarkdown(data));
}
