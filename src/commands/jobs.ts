/**
 * KLI Job commands — jobs, jobs/<id>, job-status/<id>, tasks/<id>
 */

import { mdFetch, jsonFetch } from '../api';

export async function handleJobs(apiUrl: string, token: string): Promise<void> {
  const md = await mdFetch(`${apiUrl}/api/jobs`, { token });
  console.log(md);
}

export async function handleJobById(
  apiUrl: string,
  token: string,
  id: string,
): Promise<void> {
  const md = await mdFetch(`${apiUrl}/api/jobs/${id}`, { token });
  console.log(md);
}

export async function handleJobStatus(
  apiUrl: string,
  token: string,
  id: string,
): Promise<void> {
  const POLL_INTERVAL = 5_000;
  const TIMEOUT = 10 * 60 * 1000; // 10 minutes
  const TERMINAL = new Set(['SUCCEEDED', 'FAILED', 'CANCELLED', 'TIMED_OUT']);
  const start = Date.now();
  let lastStatus = '';
  console.log(`Polling job status for: ${id}`);
  while (Date.now() - start < TIMEOUT) {
    const res = await fetch(`${apiUrl}/api/jobs/${id}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    if (!res.ok) {
      console.error(`HTTP ${res.status}`);
      process.exit(1);
    }
    const job = (await res.json()) as {
      status: string;
      error_message?: string;
      short_url?: string;
      output_files?: { s3_key: string; download_url?: string }[];
    };
    const elapsed = ((Date.now() - start) / 1000).toFixed(0);
    if (job.status !== lastStatus) {
      console.log(`[${elapsed}s] ${job.status}`);
      lastStatus = job.status;
    }
    if (TERMINAL.has(job.status)) {
      if (job.status === 'SUCCEEDED') {
        if (job.short_url) {
          console.log(`Short URL: ${job.short_url}`);
        }
        if (job.output_files?.length) {
          console.log(
            `Output: ${job.output_files[0].download_url || job.output_files[0].s3_key}`,
          );
        }
      } else {
        console.log(`Error: ${job.error_message || 'unknown'}`);
      }
      console.log(`\nFinal status: ${job.status}`);
      process.exit(job.status === 'SUCCEEDED' ? 0 : 1);
    }
    await new Promise(r => setTimeout(r, POLL_INTERVAL));
  }
  console.error('Timeout waiting for job');
  process.exit(1);
}

export async function handleTaskById(
  apiUrl: string,
  token: string,
  id: string,
): Promise<void> {
  const md = await mdFetch(`${apiUrl}/api/multimedia/tasks/${id}`, { token });
  console.log(md);
}
