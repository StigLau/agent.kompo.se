/**
 * KLI System commands — health, tools
 */

import { mdFetch, resolveApiUrl, fetchToolsWithFallback } from '../api';
import { resolveFrontendUrl } from '../auth';

// ---------------------------------------------------------------------------
// KCP manifest evaluation (exported for unit testing)
// ---------------------------------------------------------------------------

export interface KcpManifestStatus {
  ok: boolean;
  kcpVersion: string | null;
  unitCount: number;
  updated: string | null;
  degradedReason: string | null;
}

export interface KcpDiscoveryResult {
  status: KcpManifestStatus | null;
  sourceUrl: string | null;
  fetchError: string | null;
}

type KcpFetcher = (url: string) => Promise<Response>;

/**
 * Evaluate a fetched knowledge.yaml body for fitness-for-agent-use.
 *
 * Degraded states that agents cannot act on:
 * - HTML redirect pages (server returns HTML instead of YAML)
 * - 0 knowledge units (stub manifest, no actionable content)
 * - Missing kcp_version field (unparseable or not a KCP document)
 *
 * Healthy: kcp_version present AND at least one unit.
 */
export function evaluateKcpManifest(yaml: string): KcpManifestStatus {
  const trimmed = yaml.trim();

  // Detect HTML redirect stubs (server returns web redirect page as
  // knowledge.yaml — common on incomplete deployments).
  if (/<(!DOCTYPE|html|meta\s+http-equiv|script\b[^>]*>\s*window\.location)/i.test(trimmed)) {
    return {
      ok: false,
      kcpVersion: null,
      unitCount: 0,
      updated: null,
      degradedReason:
        'Manifest appears to be an HTML redirect page, not a valid KCP YAML manifest.',
    };
  }

  const versionMatch = trimmed.match(/^kcp_version:\s*"?([^"\n]+)"?/m);
  const updatedMatch = trimmed.match(/^updated:\s*"?([^"\n]+)"?/m);
  const unitCount = (trimmed.match(/^[ \t]+- id:/gm) ?? []).length;

  // redirect-stub detection: 0 units + "redirect" language in the body
  if (unitCount === 0 && /\bredirect\b/i.test(trimmed) && !versionMatch) {
    return {
      ok: false,
      kcpVersion: versionMatch?.[1] ?? null,
      unitCount: 0,
      updated: updatedMatch?.[1] ?? null,
      degradedReason:
        'Manifest appears to be a redirect stub — no KCP units and contains redirect language.',
    };
  }

  // 0 units — stub, nothing an agent can act on
  if (unitCount === 0) {
    return {
      ok: false,
      kcpVersion: versionMatch?.[1] ?? null,
      unitCount: 0,
      updated: updatedMatch?.[1] ?? null,
      degradedReason:
        'Manifest has 0 knowledge units — unusable for agent discovery.',
    };
  }

  // Unparseable / not a KCP document: has units but no kcp_version
  if (!versionMatch) {
    return {
      ok: false,
      kcpVersion: null,
      unitCount,
      updated: updatedMatch?.[1] ?? null,
      degradedReason:
        'Manifest is missing kcp_version — may not be a valid KCP document.',
    };
  }

  // Healthy
  return {
    ok: true,
    kcpVersion: versionMatch[1],
    unitCount,
    updated: updatedMatch?.[1] ?? null,
    degradedReason: null,
  };
}

/** Try each discovery URL, preferring a healthy manifest over a degraded one. */
export async function discoverKcpManifest(
  urls: string[],
  fetcher: KcpFetcher = fetch,
): Promise<KcpDiscoveryResult> {
  let firstDegraded: KcpDiscoveryResult | null = null;
  let lastFetchError: string | null = null;

  for (const url of [...new Set(urls)]) {
    try {
      const res = await fetcher(url);
      if (!res.ok) {
        lastFetchError = `GET ${url} → HTTP ${res.status}`;
        continue;
      }
      const status = evaluateKcpManifest(await res.text());
      if (status.ok) return { status, sourceUrl: url, fetchError: null };
      firstDegraded ??= { status, sourceUrl: url, fetchError: null };
    } catch (e: any) {
      lastFetchError = e.message;
    }
  }

  return firstDegraded ?? { status: null, sourceUrl: null, fetchError: lastFetchError };
}

// ---------------------------------------------------------------------------
// Health command
// ---------------------------------------------------------------------------

export async function handleHealth(
  env: string,
  apiUrl: string,
): Promise<void> {
  const md = await mdFetch(`${apiUrl}/api/health`);
  console.log(md);

  // KCP discovery chain check — knowledge.yaml freshness
  const frontendUrl = resolveFrontendUrl(env);
  const kcpCandidates = [
    `${frontendUrl}/knowledge.yaml`,
    ...(env === 'sandbox-use2'
      ? ['https://use2.sandbox.makeshitapp.com/knowledge.yaml']
      : []),
  ];
  const kcp = await discoverKcpManifest(kcpCandidates);
  if (kcp.status) {
    console.log('\n# KCP Discovery Chain');
    if (kcp.status.ok) {
      console.log(
        `- knowledge.yaml: OK (kcp_version: ${kcp.status.kcpVersion}, units: ${kcp.status.unitCount}, updated: ${kcp.status.updated ?? '?'})`,
      );
    } else {
      console.log(
        `- knowledge.yaml: DEGRADED (kcp_version: ${kcp.status.kcpVersion ?? '?'}, units: ${kcp.status.unitCount}, updated: ${kcp.status.updated ?? '?'})`,
      );
      console.log(`- reason: ${kcp.status.degradedReason}`);
    }
    console.log(`- source: ${kcp.sourceUrl}`);
  }
  if (!kcp.status?.ok) {
    console.log(
      `\n⚠ KCP: knowledge.yaml is unavailable or degraded (${kcp.status?.degradedReason ?? kcp.fetchError ?? 'unknown error'})`,
    );
  }
}

export async function handleTools(env: string, apiUrl: string): Promise<void> {
  try {
    const result = await fetchToolsWithFallback(apiUrl, env);
    console.log(JSON.stringify(result.data, null, 2));
  } catch (err: any) {
    console.error(`⚠  ${err.message}`);
    process.exit(1);
  }
}
