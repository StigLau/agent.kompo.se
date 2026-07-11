/**
 * KLI Workstate — local Muse Workbench state types and file I/O
 *
 * The workstate is stored in .muse/workstate/<env>/current.json relative to cwd.
 */

import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WorkstateObject = {
  type: 'komposition';
  id: string;
  title: string;
  status?: string;
};

export type MuseWorkstate = {
  schema: 'muse-workstate/1.0';
  env: string;
  updated_at: string;
  current_object: WorkstateObject | null;
  selection: null | Record<string, unknown>;
  visible_pane?: string;
  route?: string;
  dirty: boolean;
  visible_context: Record<string, string>;
  last_action: null | { type: string; summary: string };
};

export type KompositionSummary = {
  id: string;
  title: string;
  status?: string;
  content?: string;
};

// ---------------------------------------------------------------------------
// Paths (relative to cwd)
// ---------------------------------------------------------------------------

export function workstateDir(projectRoot: string, env: string): string {
  return path.join(projectRoot, '.muse', 'workstate', env);
}

export function workstatePath(projectRoot: string, env: string): string {
  return path.join(workstateDir(projectRoot, env), 'current.json');
}

export function kompositionCachePath(projectRoot: string, env: string): string {
  return path.join(workstateDir(projectRoot, env), 'current-komposition.md');
}

// ---------------------------------------------------------------------------
// Core workstate operations
// ---------------------------------------------------------------------------

export function emptyWorkstate(env: string): MuseWorkstate {
  return {
    schema: 'muse-workstate/1.0',
    env,
    updated_at: new Date().toISOString(),
    current_object: null,
    selection: null,
    visible_pane: 'portfolio',
    route: '/app',
    dirty: false,
    visible_context: {},
    last_action: null,
  };
}

export function loadWorkstate(projectRoot: string, env: string): MuseWorkstate {
  const file = workstatePath(projectRoot, env);
  if (!fs.existsSync(file)) return emptyWorkstate(env);
  return JSON.parse(fs.readFileSync(file, 'utf8')) as MuseWorkstate;
}

export function saveWorkstate(projectRoot: string, state: MuseWorkstate): void {
  const dir = workstateDir(projectRoot, state.env);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(workstatePath(projectRoot, state.env), JSON.stringify(state, null, 2) + '\n');
  fs.appendFileSync(path.join(dir, 'history.ndjson'), JSON.stringify(state) + '\n');
}

export function clearWorkstate(projectRoot: string, env: string): MuseWorkstate {
  const state = emptyWorkstate(env);
  state.updated_at = new Date().toISOString();
  state.last_action = { type: 'clear', summary: 'Cleared Muse workstate' };
  saveWorkstate(projectRoot, state);
  return state;
}

export function openKompositionWorkstate(
  projectRoot: string,
  env: string,
  komposition: KompositionSummary,
): MuseWorkstate {
  const dir = workstateDir(projectRoot, env);
  fs.mkdirSync(dir, { recursive: true });
  if (komposition.content) {
    fs.writeFileSync(kompositionCachePath(projectRoot, env), komposition.content);
  }
  const ref = path.relative(projectRoot, kompositionCachePath(projectRoot, env));
  const state: MuseWorkstate = {
    schema: 'muse-workstate/1.0',
    env,
    updated_at: new Date().toISOString(),
    current_object: {
      type: 'komposition',
      id: komposition.id,
      title: komposition.title,
      status: komposition.status,
    },
    selection: null,
    visible_pane: 'kompositions',
    route: '/app',
    dirty: false,
    visible_context: komposition.content ? { komposition_ref: ref } : {},
    last_action: { type: 'open', summary: `Opened komposition ${komposition.title}` },
  };
  saveWorkstate(projectRoot, state);
  return state;
}

export function renderWorkstateMarkdown(state: MuseWorkstate): string {
  const lines: string[] = ['# Muse Workstate', ''];
  lines.push(`- **Environment:** ${state.env}`);
  lines.push(`- **Updated:** ${state.updated_at}`);
  lines.push(`- **Dirty:** ${state.dirty ? 'yes' : 'no'}`);
  if (state.visible_pane) lines.push(`- **Visible pane:** ${state.visible_pane}`);
  if (state.route) lines.push(`- **Route:** ${state.route}`);
  lines.push('');
  if (!state.current_object) {
    lines.push('No current object.');
    lines.push('');
    lines.push('Open one with:');
    lines.push('```bash');
    lines.push(`kli --env ${state.env} workstate/open komposition <id-or-title>`);
    lines.push('```');
    return lines.join('\n') + '\n';
  }
  lines.push('## Current Object');
  lines.push(`- **Type:** ${state.current_object.type}`);
  lines.push(`- **Title:** ${state.current_object.title}`);
  lines.push(`- **ID:** \`${state.current_object.id}\``);
  if (state.current_object.status) lines.push(`- **Status:** ${state.current_object.status}`);
  lines.push('');
  lines.push('## Visible Context');
  const entries = Object.entries(state.visible_context);
  if (entries.length === 0) lines.push('- none');
  for (const [k, v] of entries) lines.push(`- **${k}:** ${v}`);
  if (state.last_action) {
    lines.push('');
    lines.push('## Last Action');
    lines.push(`- ${state.last_action.summary}`);
  }
  return lines.join('\n') + '\n';
}

export function resolveSingleKomposition(
  query: string,
  kompositions: KompositionSummary[],
):
  | { ok: true; komposition: KompositionSummary }
  | { ok: false; reason: string; matches: KompositionSummary[] } {
  const q = query.trim().toLowerCase();
  const exact = kompositions.filter(k => k.id === query || k.title.toLowerCase() === q);
  if (exact.length === 1) return { ok: true, komposition: exact[0] };
  if (exact.length > 1)
    return { ok: false, reason: `Ambiguous exact match for "${query}"`, matches: exact };
  const matches = kompositions.filter(
    k => k.id.includes(query) || k.title.toLowerCase().includes(q),
  );
  if (matches.length === 1) return { ok: true, komposition: matches[0] };
  if (matches.length === 0)
    return { ok: false, reason: `No komposition matched "${query}"`, matches };
  return { ok: false, reason: `Multiple kompositions matched "${query}"`, matches };
}

// ---------------------------------------------------------------------------
// Muse Workbench contract helpers (ported from muse-workbench-contract.ts)
// ---------------------------------------------------------------------------

/**
 * Build a chat message with workstate context for the LLM.
 */
export function buildWorkstateChatMessage(
  userMessage: string,
  workstateMarkdown: string,
  currentKompositionMarkdown?: string,
): string {
  const sections = [
    'You are operating inside Muse Workbench. Treat the following workstate as the CLI analogue of the Web UI work pane.',
    '',
    '## Current Workstate',
    workstateMarkdown.trim(),
  ];
  if (currentKompositionMarkdown?.trim()) {
    sections.push('', '## Current Komposition Content', currentKompositionMarkdown.trim());
  }
  sections.push('', '## User Request', userMessage.trim());
  return sections.join('\n');
}

/**
 * Create a video_build job request for the render pipeline.
 */
export function createRenderabilityJobRequest(kompositionId: string, content: string) {
  if (!kompositionId.trim()) throw new Error('kompositionId is required');
  if (!content.trim()) throw new Error('komposition content is required');
  return {
    type: 'video_build' as const,
    params: {
      komposition_id: kompositionId,
      content,
      pipeline: 'kompostrict' as const,
    },
  };
}

/**
 * Extract komposition IDs from a chat response (JSON + response text).
 */
export function extractKompositionIdsFromChatResponse(
  data: unknown,
  responseText = '',
): string[] {
  const out = new Set<string>();
  const addCandidate = (value: string) => {
    const trimmed = value.trim();
    if (/^[A-Za-z0-9_-]{12,64}$/.test(trimmed) && !/^job_/i.test(trimmed)) out.add(trimmed);
  };
  const collect = (value: unknown) => {
    if (Array.isArray(value)) {
      for (const item of value) collect(item);
      return;
    }
    if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
        if (/(^|_)(id|komposition_id|kompositionId)$/i.test(key) && typeof child === 'string')
          addCandidate(child);
        collect(child);
      }
    }
  };
  collect(data);
  for (const match of responseText.matchAll(/[`*_\s(]([A-Za-z0-9_-]{12,64})[`*_)\s.,]/g)) {
    addCandidate(match[1]);
  }
  return [...out];
}
