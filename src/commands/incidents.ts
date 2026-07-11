/**
 * KLI Incident commands — incidents, incident-download <token>, incident-replay <dir>
 */

import * as fs from 'fs';
import * as path from 'path';
import { jsonFetch } from '../api';

export async function handleIncidents(apiUrl: string, token: string): Promise<void> {
  const data = await jsonFetch(`${apiUrl}/api/incidents`, { token });
  const incidents = data?.incidents || [];
  console.log(`# Incidents (${incidents.length})`);
  console.log('');
  if (incidents.length === 0) {
    console.log('No incidents found.');
  } else {
    for (const inc of incidents) {
      const status = inc.status || 'unknown';
      const date = inc.createdAt
        ? new Date(inc.createdAt).toISOString().slice(0, 10)
        : '?';
      console.log(
        `- **${inc.incidentId}** (${status}) — job: ${inc.jobId || '?'}, created: ${date}`,
      );
      if (inc.errorMessage) console.log(`  error: ${inc.errorMessage}`);
    }
  }
}

export async function handleIncidentDownload(
  apiUrl: string,
  token: string,
  incidentToken: string,
  outputDir?: string,
): Promise<void> {
  // Step 1: Fetch incident metadata via public token endpoint
  console.log('Fetching incident metadata...');
  let incident: any;
  try {
    incident = await jsonFetch(`${apiUrl}/api/incidents/t/${incidentToken}`);
  } catch {
    console.error('Failed to fetch incident. Token may be invalid or expired.');
    process.exit(1);
  }

  if (!incident?.incidentId) {
    console.error('Invalid response: no incidentId in incident metadata');
    process.exit(1);
  }

  console.log(`Incident: ${incident.incidentId}`);
  console.log(`  Job: ${incident.jobId || '?'}`);
  console.log(`  Status: ${incident.status || '?'}`);
  if (incident.errorMessage) console.log(`  Error: ${incident.errorMessage}`);

  // Step 2: Download the package archive via token-scoped download endpoint
  console.log('Downloading incident package...');
  const downloadUrl = `${apiUrl}/api/incidents/t/${incidentToken}/download`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000);
  let downloadRes: Response;
  try {
    downloadRes = await fetch(downloadUrl, { signal: controller.signal });
  } catch (err: any) {
    clearTimeout(timer);
    console.error(`Download failed: ${err.message}`);
    process.exit(1);
  }
  clearTimeout(timer);

  if (!downloadRes.ok) {
    const errText = await downloadRes.text().catch(() => '');
    if (downloadRes.status === 404) {
      console.error('Package not found. The incident may not have been packaged yet.');
      console.error('Artifact collection runs asynchronously after incident creation.');
    } else if (downloadRes.status === 410) {
      console.error('Token has expired.');
    } else {
      console.error(`HTTP ${downloadRes.status}: ${errText}`);
    }
    process.exit(1);
  }

  // Step 3: Write the archive to disk and extract
  const destDir = outputDir || `./incident-${incident.incidentId}`;
  fs.mkdirSync(destDir, { recursive: true });

  const archivePath = path.join(destDir, 'package.tar');
  const archiveBuffer = Buffer.from(await downloadRes.arrayBuffer());
  fs.writeFileSync(archivePath, archiveBuffer);
  console.log(`Archive saved: ${archivePath} (${archiveBuffer.length} bytes)`);

  // Step 4: Extract tar archive
  const { spawnSync } = await import('child_process');
  const tarResult = spawnSync('tar', ['xf', archivePath, '-C', destDir], {
    stdio: 'pipe',
  });
  if (tarResult.status !== 0) {
    console.error(
      `tar extraction failed: ${tarResult.stderr?.toString() || 'unknown error'}`,
    );
    console.error(
      'Archive saved but could not be extracted. Try manually: tar xf ' + archivePath,
    );
    process.exit(1);
  }

  // Clean up archive after extraction
  fs.unlinkSync(archivePath);

  // List extracted contents
  const extracted = fs.readdirSync(destDir);
  console.log(`\nExtracted to: ${destDir}`);
  console.log('Contents:');
  for (const f of extracted) {
    const stat = fs.statSync(path.join(destDir, f));
    console.log(`  ${f} (${stat.size} bytes)`);
  }
  console.log('\nUse "incident-replay" to reproduce the failure locally.');
}

export async function handleIncidentReplay(packageDir: string): Promise<void> {
  // Validate package directory exists and has expected files
  if (!fs.existsSync(packageDir)) {
    console.error(`Directory not found: ${packageDir}`);
    process.exit(1);
  }

  const contents = fs.readdirSync(packageDir);
  console.log(`# Incident Replay: ${packageDir}`);
  console.log('');

  // Load job metadata
  const metadataPath = path.join(packageDir, 'job-metadata.json');
  let metadata: any = null;
  if (fs.existsSync(metadataPath)) {
    metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
    console.log('## Job Metadata');
    console.log(`- Incident: ${metadata.incidentId || '?'}`);
    console.log(`- Job: ${metadata.jobId || '?'}`);
    console.log(`- Komposition: ${metadata.kompositionId || '?'}`);
    console.log(`- Region: ${metadata.region || '?'}`);
    console.log(`- Environment: ${metadata.environment || '?'}`);
    console.log(`- Collected: ${metadata.collectedAt || '?'}`);
    if (metadata.batchJobId) console.log(`- Batch Job: ${metadata.batchJobId}`);
    if (metadata.jobRecord?.status)
      console.log(`- Job Status: ${metadata.jobRecord.status}`);
    if (metadata.jobRecord?.error_message)
      console.log(`- Error: ${metadata.jobRecord.error_message}`);
    if (metadata.jobRecord?.error_code || metadata.jobRecord?.exitCode) {
      console.log(
        `- Exit Code: ${metadata.jobRecord.error_code || metadata.jobRecord.exitCode}`,
      );
    }
    console.log('');
  }

  // Show render graph summary
  const graphPath = path.join(packageDir, 'graph.json');
  if (fs.existsSync(graphPath)) {
    const graph = JSON.parse(fs.readFileSync(graphPath, 'utf-8'));
    console.log('## Render Graph');
    if (graph.nodes) {
      console.log(
        `- Nodes: ${Array.isArray(graph.nodes) ? graph.nodes.length : Object.keys(graph.nodes).length}`,
      );
    }
    if (graph.edges) {
      console.log(
        `- Edges: ${Array.isArray(graph.edges) ? graph.edges.length : Object.keys(graph.edges).length}`,
      );
    }
    if (graph.executionOrder) {
      console.log(`- Execution order: ${graph.executionOrder.length} steps`);
    }
    console.log('');
  }

  // Show execution progress
  const progressPath = path.join(packageDir, 'progress.json');
  if (fs.existsSync(progressPath)) {
    const progress = JSON.parse(fs.readFileSync(progressPath, 'utf-8'));
    console.log('## Execution Progress');
    if (progress.completedNodes) {
      console.log(`- Completed nodes: ${progress.completedNodes.length}`);
    }
    if (progress.failedNode) {
      console.log(`- Failed at node: ${progress.failedNode}`);
    }
    if (progress.percentage !== undefined) {
      console.log(`- Progress: ${progress.percentage}%`);
    }
    console.log('');
  }

  // Show FFMPEG / Batch logs
  const logsPath = path.join(packageDir, 'batch-logs.txt');
  if (fs.existsSync(logsPath)) {
    const logs = fs.readFileSync(logsPath, 'utf-8');
    const lines = logs.split('\n');
    console.log('## Batch Logs');
    console.log(`- Total lines: ${lines.length}`);

    const errorLines = lines.filter(
      l =>
        /error|fail|fatal|exit code|errno|segfault|killed/i.test(l) &&
        !/\berror_code\b/.test(l),
    );
    if (errorLines.length > 0) {
      console.log(`- Error lines (${errorLines.length}):`);
      const tail = errorLines.slice(-20);
      for (const line of tail) {
        console.log(`  ${line.trim()}`);
      }
    }

    console.log('');
    console.log('### Last 10 lines:');
    const lastLines = lines.filter(l => l.trim()).slice(-10);
    for (const line of lastLines) {
      console.log(`  ${line.trim()}`);
    }
    console.log('');
  }

  // Attempt local FFMPEG replay if graph.json exists
  if (fs.existsSync(graphPath)) {
    console.log('## Replay');
    console.log('');

    const { spawnSync } = await import('child_process');

    const ffmpegCheck = spawnSync('ffmpeg', ['-version'], { stdio: 'pipe' });
    if (ffmpegCheck.status !== 0) {
      console.log('FFMPEG not found locally. Install with: brew install ffmpeg');
      console.log('Without FFMPEG, only log analysis is available.');
    } else {
      const graph = JSON.parse(fs.readFileSync(graphPath, 'utf-8'));

      const ffmpegCommands: string[][] = [];
      const extractCommands = (node: any) => {
        if (node?.command && Array.isArray(node.command)) {
          ffmpegCommands.push(node.command);
        }
        if (node?.ffmpegArgs && Array.isArray(node.ffmpegArgs)) {
          ffmpegCommands.push(['ffmpeg', ...node.ffmpegArgs]);
        }
      };

      if (Array.isArray(graph.nodes)) {
        for (const node of graph.nodes) extractCommands(node);
      } else if (graph.nodes && typeof graph.nodes === 'object') {
        for (const node of Object.values(graph.nodes)) extractCommands(node);
      }

      if (ffmpegCommands.length === 0) {
        console.log('No FFMPEG commands found in render graph.');
        console.log(
          'The graph may use a different command format. Inspect graph.json manually.',
        );
      } else {
        console.log(
          `Found ${ffmpegCommands.length} FFMPEG command(s) in render graph.`,
        );
        console.log('');
        console.log(
          'NOTE: Source media files may not be included in the package.',
        );
        console.log(
          'Commands reference S3 paths that would need to be resolved locally.',
        );
        console.log('');

        for (let i = 0; i < ffmpegCommands.length; i++) {
          const cmd = ffmpegCommands[i];
          console.log(`### Command ${i + 1}/${ffmpegCommands.length}`);
          console.log('```bash');
          console.log(cmd.join(' '));
          console.log('```');
          console.log('');
        }
      }
    }
  }

  // Summary
  console.log('## Package Contents');
  for (const f of contents) {
    const stat = fs.statSync(path.join(packageDir, f));
    console.log(`- ${f} (${stat.size} bytes)`);
  }
}
