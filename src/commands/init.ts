/**
 * KLI init command — discovery bootstrap + agent onboarding
 *
 * Fetches the discovery surface and writes an agent-readable project context
 * file (AGENTS.md) in the current directory.
 *
 * Default: fail closed — if tools discovery or knowledge manifest fetch fails,
 * or the manifest parses to 0 units, the command exits non-zero and writes NO
 * context file.  Use --allow-partial to write an incomplete context with a
 * prominent warning banner.
 */

import { resolveApiUrl, fetchToolsWithFallback } from '../api';
import { getAuthStatus } from '../auth';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Public KCP manifest served by the project's discovery host. */
export const KNOWLEDGE_MANIFEST_URL = 'https://agent.kompo.se/knowledge.yaml';

/** Classify an optional init manifest override without doing I/O. */
export function resolveManifestSource(manifestSource?: string): {
  source: string;
  isUrl: boolean;
} {
  const source = manifestSource?.trim() || KNOWLEDGE_MANIFEST_URL;
  return { source, isUrl: /^https?:\/\//i.test(source) };
}

// ---------------------------------------------------------------------------
// Light YAML parser (zero runtime deps — no YAML library)
// ---------------------------------------------------------------------------

export interface KnowledgeUnit {
  id: string;
  intent?: string;
}

/** Count HTTP operations in an OpenAPI-style paths object. */
export function countToolsOperations(paths: unknown): number {
  if (!paths || typeof paths !== 'object') return 0;
  const methods = new Set(['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'trace']);
  return Object.values(paths as Record<string, unknown>).reduce<number>((count, pathItem) => {
    if (!pathItem || typeof pathItem !== 'object') return count;
    return count + Object.keys(pathItem).filter(key => methods.has(key.toLowerCase())).length;
  }, 0);
}

/**
 * Parse a knowledge.yaml string into a list of {id, intent?} objects.
 * Uses light line-by-line regex parsing — no YAML dependency.
 * Tolerates units without an intent field.
 */
export function parseKnowledgeYaml(yaml: string): KnowledgeUnit[] {
  const units: KnowledgeUnit[] = [];
  let current: Partial<KnowledgeUnit> | null = null;

  for (const line of yaml.split('\n')) {
    // Detect start of a unit entry: "  - id: <name>"
    const idMatch = line.match(/^\s{2}- id:\s*(\S+)/);
    if (idMatch) {
      if (current?.id) {
        units.push({ id: current.id, intent: current.intent });
      }
      current = { id: idMatch[1] };
      continue;
    }

    // Detect intent within a unit: "    intent: \"...\"" or "    intent: ..."
    if (current) {
      const intentMatch = line.match(/^\s{4}intent:\s*"?(.+?)"?\s*$/);
      if (intentMatch) {
        // Remove trailing quote if present
        const raw = intentMatch[1];
        current.intent = raw.endsWith('"') ? raw.slice(0, -1) : raw;
      }
    }
  }

  // Push the last unit
  if (current?.id) {
    units.push({ id: current.id, intent: current.intent });
  }

  return units;
}

// ---------------------------------------------------------------------------
// AGENTS.md template renderer (pure function, unit-testable)
// ---------------------------------------------------------------------------

export interface AgentContextInput {
  env: string;
  authStatus: 'authenticated' | 'not logged in';
  authEmail?: string;
  units: KnowledgeUnit[];
  toolsCount: number;
  generatedAt: string; // ISO string
  /** True when --allow-partial was used and some discovery steps failed. */
  partial?: boolean;
  /** Human-readable descriptions of what failed (only used when partial=true). */
  partialWarnings?: string[];
}

/**
 * Render the AGENTS.md content from a structured input.
 * Pure function — all dynamic values injected via the input object.
 */
export function renderAgentContext(input: AgentContextInput): string {
  const lines: string[] = [];

  // Partial-context warning banner (must be FIRST thing an LLM sees)
  if (input.partial && input.partialWarnings?.length) {
    lines.push('> ⚠️  **WARNING: INCOMPLETE CONTEXT**');
    lines.push('>');
    lines.push('> This AGENTS.md was generated with `--allow-partial` because one or more');
    lines.push('> discovery steps failed. It MUST NOT be treated as authoritative.');
    lines.push('>');
    lines.push('> Failed steps:');
    for (const w of input.partialWarnings) {
      lines.push(`> - ${w}`);
    }
    lines.push('>');
    lines.push('> Re-run `kli init` without `--allow-partial` when the issues are resolved.');
    lines.push('');
  }

  // Header
  lines.push('# Kompo.ai — Agent Context');
  lines.push('');
  lines.push(
    'This project uses [kompo.ai](https://ai.makeshitapp.com) via the `kli` CLI. Account access is invitation-only.',
  );
  lines.push('');

  // Current state
  lines.push('## Current State');
  lines.push('');
  lines.push(`- **Environment:** \`${input.env}\``);
  if (input.authStatus === 'authenticated' && input.authEmail) {
    lines.push(`- **Auth:** ✅ authenticated as \`${input.authEmail}\``);
  } else {
    lines.push(
      '- **Auth:** ❌ not logged in — run `kli auth/url` then `kli auth/complete "<callback-url>"`',
    );
  }
  lines.push(`- **Generated:** ${input.generatedAt}`);
  lines.push('');

  // Six core flows
  lines.push('## Six Core Flows');
  lines.push('');

  lines.push('### 1. Bootstrap & Discovery');
  lines.push('');
  lines.push(
    `- \`kli tools\` — fetch the full API tools manifest (${input.toolsCount} operations available)`,
  );
  lines.push(`- Manifest: \`${KNOWLEDGE_MANIFEST_URL}\``);
  lines.push('');

  lines.push('### 2. Authentication');
  lines.push('');
  lines.push('- `kli auth/url` — generate a PKCE login URL (open in browser)');
  lines.push('- `kli auth/complete "<callback-url>"` — complete login by pasting the full callback URL');
  lines.push('');

  lines.push('### 3. Upload');
  lines.push('');
  lines.push('- `kli upload-analyze <file>` — upload an audio file for BPM/MusicDNA analysis');
  lines.push('');

  lines.push('### 4. Analyze & Tag Kilder');
  lines.push('');
  lines.push('- `kli library` — list your media files (kilder)');
  lines.push('- See the [kilde docs unit](#knowledge-units) below for the full source workflow');
  lines.push('');

  lines.push('### 5. Compose');
  lines.push('');
  lines.push(
    '- `kli workstate/load-file <path>` — read a local `.v3.kompo.md`, POST to API, open in workstate',
  );
  lines.push(
    '- Units: `komposition-format` (markdown structure) + `komposition-v3` (z-ordered layers, blend modes, alpha_over)',
  );
  lines.push('');

  lines.push('### 6. Build + Poll + Download');
  lines.push('');
  lines.push('- `kli workstate/render` — submit current workstate komposition as a video build job');
  lines.push('- `kli job-status/<id>` — poll job status live until terminal state');
  lines.push('- `kli production-stream/<id>` — get playable stream URL for a finished production');
  lines.push('');

  // Knowledge units
  lines.push('## Knowledge Units');
  lines.push('');
  lines.push(
    `Manifest: \`${KNOWLEDGE_MANIFEST_URL}\` — fetch \`docs/kcp/<unit-id>.md\` from the same repository for the full unit.`,
  );
  lines.push('');

  if (input.units.length === 0) {
    lines.push('_(No knowledge units parsed — manifest may be unreachable.)_');
  } else {
    for (const unit of input.units) {
      // Trust boundary: unit.id / unit.intent are from the manifest repo maintainer.
      // AGENTS.md is advisory (not executable), so unescaped interpolation is accepted.
      const intent = unit.intent ? ` — ${unit.intent}` : '';
      lines.push(`- **\`${unit.id}\`**${intent}`);
    }
  }
  lines.push('');

  // Command reference
  lines.push('## Command Reference');
  lines.push('');
  lines.push('- Run `kli help` for the full command list and usage.');
  lines.push('');

  // Terminology
  lines.push('## Terminology');
  lines.push('');
  lines.push('- **kilde** (pl. **kilder**): a reusable multimedia source asset — audio track, video clip, or image source — with segment definitions and file-location fallback chains.');
  lines.push(
    '- **komposition**: a markdown document that describes a music video — written in beats, not milliseconds. Contains metadata, BPM, beat timings, and kilde references.',
  );

  return lines.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// Command handler
// ---------------------------------------------------------------------------

export async function handleInit(
  env: string,
  apiUrl: string,
  force: boolean,
  allowPartial: boolean,
  manifestSource?: string,
): Promise<void> {
  const failures: string[] = [];
  let toolsCount = 0;
  let units: KnowledgeUnit[] = [];
  let authEmail: string | undefined;
  let authStatus: 'authenticated' | 'not logged in' = 'not logged in';

  // Resolve manifest source: --manifest flag, or default URL
  const { source: resolvedManifest, isUrl } = resolveManifestSource(manifestSource);
  process.stderr.write(`[kli init] Manifest source: ${resolvedManifest}\n`);

  // Step 1: Fetch the tools manifest
  process.stderr.write('[kli init] Fetching tools manifest...\n');
  try {
    const result = await fetchToolsWithFallback(apiUrl, env);
    const paths = result.data?.paths ?? {};
    toolsCount = countToolsOperations(paths);
    process.stderr.write(`[kli init] Tools manifest: ${toolsCount} operations\n`);
  } catch (err: any) {
    failures.push(`Tools discovery failed: ${err.message}`);
    process.stderr.write(`[kli init] Tools discovery FAILED: ${err.message}\n`);
  }

  // Step 2: Fetch/read the KCP manifest (URL or local path)
  process.stderr.write('[kli init] Fetching knowledge manifest...\n');
  try {
    let yaml: string | undefined;

    if (isUrl) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30_000);
      let resp;
      try {
        resp = await fetch(resolvedManifest, { signal: controller.signal });
      } finally {
        clearTimeout(timer);
      }
      if (!resp.ok) {
        failures.push(`Knowledge manifest fetch failed: HTTP ${resp.status}`);
        process.stderr.write(`[kli init] Knowledge manifest fetch FAILED: HTTP ${resp.status}\n`);
      } else {
        yaml = await resp.text();
      }
    } else {
      // Local file path — resolve relative to cwd, read from disk
      const { existsSync, readFileSync } = await import('fs');
      const { resolve } = await import('path');
      const resolvedPath = resolve(process.cwd(), resolvedManifest);
      if (!existsSync(resolvedPath)) {
        failures.push(`Knowledge manifest file not found: ${resolvedPath}`);
        process.stderr.write(`[kli init] Knowledge manifest file not found: ${resolvedPath}\n`);
      } else {
        yaml = readFileSync(resolvedPath, 'utf-8');
      }
    }

    if (yaml !== undefined) {
      if (yaml.length > 1_000_000) {
        failures.push('Knowledge manifest too large (>1MB) — skipping unit parsing');
        process.stderr.write('[kli init] Knowledge manifest too large (>1MB)\n');
      } else {
        units = parseKnowledgeYaml(yaml);
        if (units.length === 0) {
          failures.push('Knowledge manifest parsed to 0 units');
          process.stderr.write('[kli init] Knowledge manifest: 0 units parsed\n');
        } else {
          process.stderr.write(`[kli init] Knowledge manifest: ${units.length} units\n`);
        }
      }
    }
  } catch (err: any) {
    failures.push(`Knowledge manifest fetch failed: ${err.message}`);
    process.stderr.write(`[kli init] Knowledge manifest fetch FAILED: ${err.message}\n`);
  }

  // Step 3: Check auth status (read-only — no login triggering)
  try {
    const status = getAuthStatus(env);
    if (status.hasTokens && !status.expired) {
      authEmail = status.email;
      authStatus = 'authenticated';
      process.stderr.write(`[kli init] Auth: authenticated as ${authEmail}\n`);
    } else {
      process.stderr.write('[kli init] Auth: not logged in\n');
    }
  } catch (err: any) {
    // Auth check is best-effort — never a hard failure
    process.stderr.write(`[kli init] Auth: unable to check (${err.message})\n`);
  }

  // -----------------------------------------------------------------------
  // Fail closed: if any discovery step failed and --allow-partial was not
  // passed, print what failed, exit non-zero, write NO context file.
  // -----------------------------------------------------------------------
  if (failures.length > 0 && !allowPartial) {
    console.error('');
    console.error('❌ kli init failed — discovery incomplete:');
    for (const f of failures) {
      console.error(`  - ${f}`);
    }
    console.error('');
    console.error('No AGENTS.md was written.');
    console.error('Re-run with --allow-partial to write a partial context file with a warning banner,');
    console.error('or fix the issues above and try again.');
    process.exit(1);
  }

  // Step 4: Write AGENTS.md
  const { lstatSync, unlinkSync, renameSync, writeFileSync } = await import('fs');
  const cwd = process.cwd();
  const agentsPath = `${cwd}/AGENTS.md`;
  let existingFile = false;
  try {
    existingFile = lstatSync(agentsPath).isFile();
  } catch (err: any) {
    if (err?.code !== 'ENOENT') throw err;
  }

  if (existingFile && !force) {
    console.log('');
    console.log('⚠  AGENTS.md already exists. Use --force to overwrite.');
    console.log('');
    console.log('→ Bootstrap summary (no file written):');
    console.log(`  Environment: ${env}`);
    console.log(`  Tools operations: ${toolsCount}`);
    console.log(`  Knowledge units: ${units.length}`);
    console.log(`  Auth: ${authStatus === 'authenticated' ? `✅ ${authEmail}` : '❌ not logged in'}`);
    if (failures.length > 0) {
      console.log(`  ⚠  Partial failures: ${failures.join('; ')}`);
    }
    return;
  }

  const generatedAt = new Date().toISOString();
  const content = renderAgentContext({
    env,
    authStatus,
    authEmail,
    units,
    toolsCount,
    generatedAt,
    partial: failures.length > 0,
    partialWarnings: failures.length > 0 ? failures : undefined,
  });

  // Symlink guard: refuse to write through a symlink (including dangling
  // links). The temporary-file + rename sequence also never follows a link.
  try {
    if (lstatSync(agentsPath).isSymbolicLink()) {
      console.error('Refusing to write through symlink: AGENTS.md');
      process.exit(1);
    }
  } catch (err: any) {
    if (err?.code !== 'ENOENT') throw err;
  }

  const tempPath = `${agentsPath}.tmp-${process.pid}-${Date.now()}`;
  try {
    writeFileSync(tempPath, content, { encoding: 'utf-8', mode: 0o644, flag: 'wx' });
    renameSync(tempPath, agentsPath);
  } finally {
    try { unlinkSync(tempPath); } catch {}
  }

  console.log('');
  if (failures.length > 0) {
    console.log('⚠  AGENTS.md written with INCOMPLETE context (--allow-partial).');
  } else {
    console.log(`✅ AGENTS.md written to ${agentsPath}`);
  }
  console.log('');
  console.log('→ Bootstrap summary:');
  console.log(`  Environment: ${env}`);
  console.log(`  Tools operations: ${toolsCount}`);
  console.log(`  Knowledge units: ${units.length}`);
  console.log(`  Auth: ${authStatus === 'authenticated' ? `✅ ${authEmail}` : '❌ not logged in'}`);
}
