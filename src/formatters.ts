/**
 * KLI Formatters — markdown output formatters for API responses
 */

// ---------------------------------------------------------------------------
// Production formatters
// ---------------------------------------------------------------------------

export function formatProductionsMarkdown(productions: any[]): string {
  const lines = ['# Productions', '', `- count: ${productions.length}`];
  for (const p of productions) {
    lines.push(
      `- ${p.productionId || p.id}: ${p.name || p.title || '(untitled)'} (${p.status || 'unknown'}) komposition=${p.kompositionId || 'unknown'}`,
    );
  }
  return lines.join('\n');
}

export function formatProductionsByKompositionMarkdown(
  kompositionId: string,
  productions: any[],
): string {
  const lines = [
    `# Productions for komposition ${kompositionId}`,
    '',
    `- count: ${productions.length}`,
  ];
  for (const p of productions) {
    lines.push(
      `- ${p.productionId || p.id}: ${p.name || p.title || '(untitled)'} (${p.status || 'unknown'}) job=${p.jobId || 'unknown'}`,
    );
  }
  return lines.join('\n');
}

export function formatProductionMarkdown(id: string, production: any): string {
  const p = production?.production || production || {};
  return [
    `# Production ${id}`,
    '',
    `- id: ${p.productionId || p.id || id}`,
    `- name: ${p.name || p.title || '(untitled)'}`,
    `- status: ${p.status || 'unknown'}`,
    `- kompositionId: ${p.kompositionId || 'unknown'}`,
    `- jobId: ${p.jobId || 'unknown'}`,
    `- outputUrl: ${p.outputUrl ? '[present]' : '[missing]'}`,
  ].join('\n');
}

export function formatProductionStreamMarkdown(id: string, body: any): string {
  return [
    `# Production stream ${id}`,
    '',
    `- streamUrl: ${body?.streamUrl ? '[present]' : '[missing]'}`,
    ...(body?.streamUrl ? [`- urlPrefix: ${String(body.streamUrl).slice(0, 80)}`] : []),
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Render QC formatter
// ---------------------------------------------------------------------------

export function formatFreshBuildQcMarkdown(input: {
  kompositionId: string;
  kompositionTitle: string;
  jobId: string;
  jobStatus: string;
  productionId?: string;
  streamUrlPresent: boolean;
}): string {
  return [
    '# Muse Fresh Build QC',
    '',
    `- Komposition: ${input.kompositionTitle} (${input.kompositionId})`,
    `- Job: ${input.jobId}`,
    `- Job status: ${input.jobStatus}`,
    `- Production: ${input.productionId || '[missing]'}`,
    `- Stream URL: ${input.streamUrlPresent ? '[present]' : '[missing]'}`,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Workstate load-file helpers
// ---------------------------------------------------------------------------

export function buildLoadFilePostBody(content: string): string {
  return JSON.stringify({ content, contentType: 'markdown', status: 'draft' });
}

export function parseLoadFileResponse(
  apiResponse: any,
  fallbackTitle: string,
): { id: string; title: string; status: string } {
  const k = apiResponse.komposition || apiResponse;
  return {
    id: k.id || k.kompositionId || '',
    title: k.name || k.title || fallbackTitle,
    status: k.status || 'draft',
  };
}

// ---------------------------------------------------------------------------
// ID extraction from JSON responses
// ---------------------------------------------------------------------------

export function extractIdsFromJson(data: any): string[] {
  const out = new Set<string>();
  const collect = (v: any) => {
    if (Array.isArray(v)) {
      for (const item of v) collect(item);
      return;
    }
    if (v && typeof v === 'object') {
      for (const [k, value] of Object.entries(v)) {
        if (
          /(^|_)(id|jobId|job_id|komposition_id|fileId|file_id)$/i.test(k) &&
          typeof value === 'string'
        ) {
          out.add(value);
        }
        if (/^created_.*_ids$/i.test(k) && Array.isArray(value)) {
          for (const item of value) {
            if (typeof item === 'string') out.add(item);
          }
        }
        collect(value);
      }
    }
  };
  collect(data);
  return [...out];
}
