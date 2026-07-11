/**
 * KLI Workstate commands — workstate, workstate/show, workstate/clear,
 * workstate/open, workstate/load-file, workstate/render, workstate/render-qc
 */

import * as fs from 'fs';
import * as path from 'path';
import { jsonFetch } from '../api';
import {
  loadWorkstate,
  clearWorkstate,
  openKompositionWorkstate,
  renderWorkstateMarkdown,
  resolveSingleKomposition,
  saveWorkstate,
  createRenderabilityJobRequest,
  extractKompositionIdsFromChatResponse,
  type KompositionSummary,
} from '../workstate';
import {
  buildLoadFilePostBody,
  parseLoadFileResponse,
  formatFreshBuildQcMarkdown,
} from '../formatters';

// ---------------------------------------------------------------------------
// Workstate show
// ---------------------------------------------------------------------------

export async function handleWorkstateShow(
  projectRoot: string,
  env: string,
): Promise<void> {
  console.log(renderWorkstateMarkdown(loadWorkstate(projectRoot, env)));
}

// ---------------------------------------------------------------------------
// Workstate clear
// ---------------------------------------------------------------------------

export async function handleWorkstateClear(
  projectRoot: string,
  env: string,
): Promise<void> {
  console.log(renderWorkstateMarkdown(clearWorkstate(projectRoot, env)));
}

// ---------------------------------------------------------------------------
// Workstate load-file
// ---------------------------------------------------------------------------

export async function handleWorkstateLoadFile(
  projectRoot: string,
  env: string,
  apiUrl: string,
  token: string,
  filePath: string,
): Promise<void> {
  const resolvedPath = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(resolvedPath)) {
    console.error(`File not found: ${resolvedPath}`);
    process.exit(1);
  }
  const content = fs.readFileSync(resolvedPath, 'utf-8');
  const created = await jsonFetch(`${apiUrl}/api/kompositions`, {
    method: 'POST',
    token,
    body: buildLoadFilePostBody(content),
    timeout: 60_000,
  });
  const { id: newId, title: newTitle, status: newStatus } = parseLoadFileResponse(
    created,
    path.basename(resolvedPath),
  );
  const state = openKompositionWorkstate(projectRoot, env, {
    id: newId,
    title: newTitle,
    status: newStatus,
    content,
  });
  console.log(renderWorkstateMarkdown(state));
}

// ---------------------------------------------------------------------------
// Workstate open
// ---------------------------------------------------------------------------

export async function handleWorkstateOpen(
  projectRoot: string,
  env: string,
  apiUrl: string,
  token: string,
  query: string,
): Promise<void> {
  const listData = await jsonFetch(`${apiUrl}/api/kompositions`, { token });
  const rawKompositions = Array.isArray(listData)
    ? listData
    : listData.kompositions || [];
  const kompositions: KompositionSummary[] = rawKompositions
    .map((k: any) => ({
      id: k.id || k.kompositionId,
      title: k.name || k.title || k.id || k.kompositionId,
      status: k.status,
    }))
    .filter((k: KompositionSummary) => k.id && k.title);

  const resolved = resolveSingleKomposition(query, kompositions);
  if (!resolved.ok) {
    console.error(resolved.reason);
    if (resolved.matches.length > 0) {
      for (const m of resolved.matches.slice(0, 10)) {
        console.error(`- ${m.title} (${m.id})`);
      }
    }
    process.exit(1);
  }

  const detail = await jsonFetch(
    `${apiUrl}/api/kompositions/${resolved.komposition.id}`,
    { token },
  );
  const body = detail.komposition || detail;
  const content = body.content || body.markdown || resolved.komposition.content || '';
  const state = openKompositionWorkstate(projectRoot, env, {
    ...resolved.komposition,
    title: body.name || body.title || resolved.komposition.title,
    status: body.status || resolved.komposition.status,
    content,
  });
  console.log(renderWorkstateMarkdown(state));
}

// ---------------------------------------------------------------------------
// Workstate render / render-qc
// ---------------------------------------------------------------------------

export async function handleWorkstateRender(
  projectRoot: string,
  env: string,
  apiUrl: string,
  token: string,
  renderQc: boolean,
): Promise<void> {
  const state = loadWorkstate(projectRoot, env);
  if (!state.current_object) {
    console.error(
      'No current workstate object. Run: kli workstate/open komposition <id-or-title>',
    );
    process.exit(1);
  }
  const detail = await jsonFetch(
    `${apiUrl}/api/kompositions/${state.current_object.id}`,
    { token },
  );
  const body = detail.komposition || detail;
  const content = body.content || body.markdown || '';
  const request = createRenderabilityJobRequest(state.current_object.id, content);
  const result = await jsonFetch(`${apiUrl}/api/jobs`, {
    method: 'POST',
    token,
    body: JSON.stringify(request),
    timeout: 60_000,
  });
  const jobId = result.job_id || result.id;
  console.log('# Muse Renderability Lock');
  console.log('');
  console.log(`- Komposition: ${state.current_object.title} (${state.current_object.id})`);
  console.log(`- Job: ${jobId || '?'}`);
  console.log(`- Status: ${result.status || '?'}`);
  if (jobId) console.log(`- Poll: kli --env ${env} job-status/${jobId}`);

  if (!renderQc) return;

  if (!jobId) {
    console.error('Cannot run render QC: job response did not include job_id/id');
    process.exit(1);
  }
  const terminal = new Set(['SUCCEEDED', 'FAILED', 'CANCELLED', 'TIMED_OUT']);
  let job: any = result;
  const start = Date.now();
  while (Date.now() - start < 10 * 60 * 1000) {
    job = await jsonFetch(`${apiUrl}/api/jobs/${encodeURIComponent(jobId)}`, {
      token,
      timeout: 60_000,
    });
    const status = job.status || job.job?.status || 'UNKNOWN';
    if (terminal.has(status)) break;
    await new Promise(r => setTimeout(r, 5_000));
  }
  const finalStatus = job.status || job.job?.status || 'UNKNOWN';
  if (finalStatus !== 'SUCCEEDED') {
    console.error(
      formatFreshBuildQcMarkdown({
        kompositionId: state.current_object.id,
        kompositionTitle: state.current_object.title,
        jobId,
        jobStatus: finalStatus,
        streamUrlPresent: false,
      }),
    );
    process.exit(1);
  }

  let productions: any[] = [];
  for (let attempt = 0; attempt < 12; attempt++) {
    const byKomposition = await jsonFetch(
      `${apiUrl}/api/productions/by-komposition/${encodeURIComponent(state.current_object.id)}`,
      { token },
    );
    productions = Array.isArray(byKomposition?.productions) ? byKomposition.productions : [];
    if (productions.length > 0) break;
    await new Promise(r => setTimeout(r, 5_000));
  }
  const production = productions.find((p: any) => p.jobId === jobId) || productions[0];
  const productionId = production?.productionId || production?.id;
  if (!productionId) {
    console.error(
      formatFreshBuildQcMarkdown({
        kompositionId: state.current_object.id,
        kompositionTitle: state.current_object.title,
        jobId,
        jobStatus: finalStatus,
        streamUrlPresent: false,
      }),
    );
    process.exit(1);
  }
  const stream = await jsonFetch(
    `${apiUrl}/api/productions/${encodeURIComponent(productionId)}/stream`,
    { token },
  );
  console.log('');
  console.log(
    formatFreshBuildQcMarkdown({
      kompositionId: state.current_object.id,
      kompositionTitle: state.current_object.title,
      jobId,
      jobStatus: finalStatus,
      productionId,
      streamUrlPresent: !!stream?.streamUrl,
    }),
  );
  if (!stream?.streamUrl) process.exit(1);
}
