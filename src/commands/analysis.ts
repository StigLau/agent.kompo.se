/** Read-only audio analysis inspection. */

import { jsonFetch } from '../api';

export function formatMediaAnalysisMarkdown(data: any): string {
  const bpm = Number(data?.bpm);
  const complete = !!data?.analyzedAt && Number.isFinite(bpm);
  const beats = Array.isArray(data?.beats) ? data.beats.length : 0;
  const downbeats = Array.isArray(data?.downbeats) ? data.downbeats.length : 0;
  return [
    '# Media Analysis',
    '',
    `- status: ${complete ? 'complete' : 'pending'}`,
    `- fileId: ${data?.fileId || 'unknown'}`,
    `- BPM: ${Number.isFinite(bpm) ? bpm : 'pending'}`,
    `- confidence: ${data?.confidence || 'pending'}`,
    `- beat1Ms: ${Number.isFinite(Number(data?.beat1Ms)) ? data.beat1Ms : 'pending'}`,
    `- beats: ${beats}`,
    `- downbeats: ${downbeats}`,
    `- analyzedAt: ${data?.analyzedAt || 'pending'}`,
  ].join('\n');
}

export async function handleMediaAnalysis(
  apiUrl: string,
  token: string,
  fileId: string,
): Promise<void> {
  const data = await jsonFetch(`${apiUrl}/api/multimedia/${encodeURIComponent(fileId)}/analysis`, { token });
  console.log(formatMediaAnalysisMarkdown(data));
}
