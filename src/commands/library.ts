/**
 * KLI Library commands — library, staging, promote/<ids>
 */

import { mdFetch, jsonFetch } from '../api';
import { extractIdsFromJson } from '../formatters';

export async function handleLibrary(apiUrl: string, token: string): Promise<void> {
  const md = await mdFetch(`${apiUrl}/api/files/user`, { token });
  console.log(md);
}

export async function handleStaging(apiUrl: string, token: string): Promise<void> {
  const md = await mdFetch(`${apiUrl}/api/multimedia/staging`, { token });
  console.log(md);
}

export async function handlePromote(
  apiUrl: string,
  token: string,
  ids: string[],
): Promise<void> {
  const data = await jsonFetch(`${apiUrl}/api/multimedia/promote`, {
    method: 'POST',
    token,
    body: JSON.stringify({ fileIds: ids }),
    timeout: 60_000,
  });
  console.log('# Promote Result');
  console.log('');
  console.log(`- success: ${String(!!data?.success)}`);
  console.log(`- promoted: ${String(data?.promoted ?? 0)}`);
  console.log(`- failed: ${String(data?.failed ?? 0)}`);
  const resultIds = extractIdsFromJson(data);
  if (resultIds.length > 0) {
    console.log('- IDs:');
    for (const id of resultIds) {
      console.log(`  - ${id}`);
    }
  }
}
