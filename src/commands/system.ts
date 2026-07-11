/**
 * KLI System commands — health, tools
 */

import { mdFetch, resolveApiUrl, fetchToolsWithFallback } from '../api';
import { resolveFrontendUrl } from '../auth';

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
  let kcpOk = false;
  let lastKcpError = '';
  for (const kcpUrl of [...new Set(kcpCandidates)]) {
    try {
      const res = await fetch(kcpUrl);
      if (!res.ok) {
        lastKcpError = `GET ${kcpUrl} → HTTP ${res.status}`;
        continue;
      }
      const yaml = await res.text();
      const updatedMatch = yaml.match(/^updated:\s*"?([^"\n]+)"?/m);
      const versionMatch = yaml.match(/^kcp_version:\s*"?([^"\n]+)"?/m);
      const unitCount = (yaml.match(/^  - id:/gm) ?? []).length;
      console.log('\n# KCP Discovery Chain');
      console.log(
        `- knowledge.yaml: OK (kcp_version: ${versionMatch?.[1] ?? '?'}, units: ${unitCount}, updated: ${updatedMatch?.[1] ?? '?'})`,
      );
      console.log(`- source: ${kcpUrl}`);
      kcpOk = true;
      break;
    } catch (e: any) {
      lastKcpError = e.message;
    }
  }
  if (!kcpOk && process.env.KLI_KCP_DEBUG === '1') {
    console.log(
      `\n⚠ KCP: knowledge.yaml unavailable (${lastKcpError || 'unknown error'})`,
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
