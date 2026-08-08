#!/usr/bin/env bun
/**
 * KLI — Markdown-first API client for kompo.ai
 *
 * Usage: kli [--env <env>] <command> [args...]
 *
 * Default env: prod. KOMPO_ENV env var overrides default; --env flag overrides both.
 */

import * as path from 'path';
import { resolveApiUrl, validateEnv } from './api';
import { getToken } from './auth';

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

export function parseArgs(rawArgs: string[]): {
  env: string;
  command: string;
  cmdArgs: string[];
  manifestSource?: string;
} {
  const args = [...rawArgs];
  let env = process.env.KOMPO_ENV?.trim() || 'prod';
  let manifestSource: string | undefined;

  // Parse global flags wherever they appear in the command line.
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--env' && args[i + 1]) {
      env = args[i + 1];
      args.splice(i, 2);
      i--;
      continue;
    }
    if (args[i] === '--manifest' && args[i + 1]) {
      manifestSource = args[i + 1];
      args.splice(i, 2);
      i--;
      continue;
    }
  }

  const command = args[0] || '';
  const cmdArgs = args.slice(1);

  return { env, command, cmdArgs, manifestSource };
}

// ---------------------------------------------------------------------------
// Help text
// ---------------------------------------------------------------------------

const HELP_TEXT = `KLI — kompo.ai CLI client

Usage: kli [--env <env>] <command> [args...]

Environment:
  Default: prod. Set KOMPO_ENV to override, or use --env flag.
  Known envs: prod, test, sandbox-use2, sandbox-eun1

Commands:

  Project:
    init [--manifest <path-or-url>]
                             Bootstrap agent context — fetches discovery surface and writes AGENTS.md
                             Fails closed if discovery is incomplete. Use --allow-partial to
                             write a clearly-marked partial context instead. --manifest accepts
                             a local knowledge.yaml path or an http(s) URL.
    komposition-template <path>
                             Write a local V1/V2 komposition skeleton. It never overwrites a file.

  Auth:
    auth/url                 Generate a PKCE login URL (entry point for first-time users)
    auth/complete <url>      Complete login by pasting the full callback URL
    auth/refresh             Refresh stored tokens
    auth/status              Show current auth identity and token expiry

  Kompositions:
    kompositions             List all kompositions
    kompositions/<id>        Get a specific komposition

  Workstate:
    workstate                Show current Muse Workbench workstate
    workstate/open komposition <id-or-title>  Open a komposition into workstate
    workstate/clear          Clear current workstate
    workstate/render         Submit current workstate komposition as a video_build job
    workstate/render-qc      Submit build, poll job, resolve production, fetch stream URL
    workstate/load-file <path>  Read a local .v3.kompo.md, POST to api, open in workstate

  Library:
    library                  List your media files (kilder)
    staging                  List multimedia staging files
    promote/<id[,id2]>       Promote staging files to library

  Media:
    upload-analyze <path>    Upload an audio file for analysis (BPM, MusicDNA)
    upload-media <path>      Upload a video or image file to the media library

  Jobs:
    jobs                     List all jobs
    jobs/<id>                Get job details
    job-status/<id>          Poll job status live until terminal state
    tasks/<id>               Get a multimedia task

  Productions:
    outputs                  List video outputs
    productions              List portfolio productions
    productions/<id>         Get production details
    productions/by-komposition/<id>  List productions for a komposition
    production-stream/<id>   Get playable stream URL for a production

  Chat:
    chat "<message>"         Send a chat message
    chat-md "<message>"      Send a chat message (markdown response)
    chat-workstate "<msg>"   Send chat with current Muse workstate komposition context
    chat-multimedia "<msg>"  Send chat through multimedia endpoint

  Incidents:
    incidents                List incidents for the authenticated user
    incident-download <token> [--output <dir>]  Download an incident package
    incident-replay <dir>    Replay an incident from a downloaded package directory

  System:
    health                   Health check (API + KCP discovery chain)
    tools                    Fetch /api/tools manifest

First time? Run: kli auth/url`;

// ---------------------------------------------------------------------------
// Known command validation — must happen BEFORE any token loading
// ---------------------------------------------------------------------------

/**
 * Validate a command name against the known command set.
 * Returns true for all valid commands (auth, public, and authenticated).
 * This check runs BEFORE getToken() to prevent token refresh for unknown commands.
 */
export function isKnownCommand(command: string): boolean {
  // Exact-match commands (auth + public + authenticated exact names)
  const exactCommands = new Set([
    'help',
    // Auth
    'auth/url', 'auth/complete', 'auth/refresh', 'auth/status',
    // Public
    'init', 'komposition-template', 'health', 'tools', 'incident-download', 'incident-replay',
    // Authenticated exact
    'kompositions', 'jobs', 'library', 'staging',
    'outputs', 'productions',
    'workstate', 'workstate/show', 'workstate/clear',
    'workstate/load-file', 'workstate/render', 'workstate/render-qc',
    'workstate/open',
    'chat', 'chat-md', 'chat-workstate', 'chat-multimedia',
    'incidents',
  ]);

  if (exactCommands.has(command)) return true;

  // Prefix-match commands
  const prefixes = [
    'kompositions/',
    'jobs/',
    'job-status/',
    'tasks/',
    'promote/',
    'productions/',
    'production-stream/',
    'upload-analyze',
    'upload-media',
  ];

  return prefixes.some(p => command.startsWith(p));
}

// ---------------------------------------------------------------------------
// Main dispatch
// ---------------------------------------------------------------------------

async function main() {
  const rawArgs = process.argv.slice(2);

  if (rawArgs.length === 0 || rawArgs[0] === 'help' || rawArgs[0] === '--help') {
    console.log(HELP_TEXT);
    return;
  }

  const { env, command, cmdArgs, manifestSource } = parseArgs(rawArgs);

  // Help is global and must not require an auth file.
  if (command === 'help' || command === '--help') {
    console.log(HELP_TEXT);
    return;
  }

  // Validate env against known environments
  const envError = validateEnv(env);
  if (envError) {
    console.error(envError);
    process.exit(1);
  }

  if (!command) {
    console.log(HELP_TEXT);
    return;
  }

  // projectRoot for workstate commands — uses cwd instead of repo-internal paths
  const projectRoot = process.cwd();
  const apiUrl = resolveApiUrl(env);

  // -----------------------------------------------------------------------
  // Auth commands (no token required)
  // -----------------------------------------------------------------------
  if (command === 'auth/url') {
    const { cmdAuthUrl } = await import('./auth');
    await cmdAuthUrl(env);
    return;
  }
  if (command === 'auth/complete') {
    const { cmdAuthComplete } = await import('./auth');
    await cmdAuthComplete(env, cmdArgs.join(' '));
    return;
  }
  if (command === 'auth/refresh') {
    const { cmdAuthRefresh } = await import('./auth');
    try {
      await cmdAuthRefresh(env);
    } catch (err: any) {
      console.error(err.message);
      process.exit(1);
    }
    return;
  }
  if (command === 'auth/status') {
    const { getAuthStatus, formatRoleInfo } = await import('./auth');
    const status = getAuthStatus(env);
    console.log(`# Auth Status (${env})`);

    if (!status.hasTokens) {
      console.log('- source: none (no user auth file)');
      console.log(`- auth file: ~/.kompo/auth-${env}.json — not found`);
      console.log('- Run kli auth/url + auth/complete to log in.');
      return;
    }

    console.log('- source: user auth');
    console.log(`- identity: ${status.email || '(unknown)'}`);
    for (const line of formatRoleInfo(status.groups || [])) console.log(line);
    console.log(
      `- expires: ${status.expiresAt ? new Date(status.expiresAt).toISOString() : 'unknown'}${status.expired ? ' ⚠ EXPIRED' : ''}`,
    );
    console.log(`- auth file: ~/.kompo/auth-${env}.json`);
    if (status.expired) {
      console.log(
        '- Run kli auth/refresh to refresh, or auth/url + auth/complete to re-login.',
      );
    }
    return;
  }

  // -----------------------------------------------------------------------
  // Public commands (no token required)
  // -----------------------------------------------------------------------
  if (command === 'init') {
    const { handleInit } = await import('./commands/init');
    const force = cmdArgs.includes('--force');
    const allowPartial = cmdArgs.includes('--allow-partial');
    await handleInit(env, apiUrl, force, allowPartial, manifestSource);
    return;
  }
  if (command === 'komposition-template') {
    const { handleKompositionTemplate } = await import('./commands/komposition');
    const filePath = cmdArgs[0];
    if (!filePath) {
      console.error('Usage: kli komposition-template <path-to-.kompo.md>');
      process.exit(1);
    }
    try {
      handleKompositionTemplate(filePath);
    } catch (err: any) {
      console.error(err.message);
      process.exit(1);
    }
    return;
  }
  if (command === 'health') {
    const { handleHealth } = await import('./commands/system');
    await handleHealth(env, apiUrl);
    return;
  }
  if (command === 'tools') {
    const { handleTools } = await import('./commands/system');
    await handleTools(env, apiUrl);
    return;
  }
  if (command === 'incident-download') {
    const { handleIncidentDownload } = await import('./commands/incidents');
    const incidentToken = cmdArgs[0];
    if (!incidentToken) {
      console.error('Usage: kli incident-download <token> [--output <dir>]');
      process.exit(1);
    }
    // Parse optional --output flag
    let outputDir: string | undefined;
    for (let i = 1; i < cmdArgs.length; i++) {
      if (cmdArgs[i] === '--output' && cmdArgs[i + 1]) {
        outputDir = cmdArgs[i + 1];
        break;
      }
    }
    await handleIncidentDownload(apiUrl, incidentToken, outputDir);
    return;
  }
  if (command === 'incident-replay') {
    const { handleIncidentReplay } = await import('./commands/incidents');
    const packageDir = cmdArgs[0];
    if (!packageDir) {
      console.error('Usage: kli incident-replay <package-dir>');
      process.exit(1);
    }
    await handleIncidentReplay(packageDir);
    return;
  }

  // -----------------------------------------------------------------------
  // Validate command name BEFORE any token loading or refresh activity.
  // An unknown command must exit immediately — no network, no token I/O.
  // -----------------------------------------------------------------------
  if (!isKnownCommand(command)) {
    console.error(`Unknown command: ${command}`);
    console.error('Run "kli help" for available commands.');
    process.exit(1);
  }

  // -----------------------------------------------------------------------
  // All remaining commands require a token
  // -----------------------------------------------------------------------
  const token = await getToken(env);

  // -----------------------------------------------------------------------
  // Command dispatch
  // -----------------------------------------------------------------------

  if (command === 'kompositions') {
    const { handleKompositions } = await import('./commands/kompositions');
    await handleKompositions(apiUrl, token);
  } else if (command.startsWith('kompositions/')) {
    const { handleKompositionById } = await import('./commands/kompositions');
    const id = command.split('/')[1];
    await handleKompositionById(apiUrl, token, id);
  } else if (command === 'jobs') {
    const { handleJobs } = await import('./commands/jobs');
    await handleJobs(apiUrl, token);
  } else if (command.startsWith('job-status/')) {
    const { handleJobStatus } = await import('./commands/jobs');
    const id = command.split('/').slice(1).join('/');
    await handleJobStatus(apiUrl, token, id);
  } else if (command.startsWith('tasks/')) {
    const { handleTaskById } = await import('./commands/jobs');
    const id = command.split('/').slice(1).join('/');
    await handleTaskById(apiUrl, token, id);
  } else if (command.startsWith('jobs/')) {
    const { handleJobById } = await import('./commands/jobs');
    const id = command.split('/').slice(1).join('/');
    await handleJobById(apiUrl, token, id);
  } else if (command === 'library') {
    const { handleLibrary } = await import('./commands/library');
    await handleLibrary(apiUrl, token);
  } else if (command === 'staging') {
    const { handleStaging } = await import('./commands/library');
    await handleStaging(apiUrl, token);
  } else if (command.startsWith('promote/')) {
    const { handlePromote } = await import('./commands/library');
    const ids = command
      .split('/')
      .slice(1)
      .join('/')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    if (ids.length === 0) {
      console.error('Usage: kli promote/<fileId[,fileId2]>');
      process.exit(1);
    }
    await handlePromote(apiUrl, token, ids);
  } else if (command === 'outputs') {
    const { handleOutputs } = await import('./commands/productions');
    await handleOutputs(apiUrl, token);
  } else if (command === 'productions') {
    const { handleProductions } = await import('./commands/productions');
    await handleProductions(apiUrl, token);
  } else if (command.startsWith('productions/by-komposition/')) {
    const { handleProductionsByKomposition } = await import('./commands/productions');
    const id = command.split('/').slice(2).join('/');
    await handleProductionsByKomposition(apiUrl, token, id);
  } else if (command.startsWith('production-stream/')) {
    const { handleProductionStream } = await import('./commands/productions');
    const id = command.split('/').slice(1).join('/');
    await handleProductionStream(apiUrl, token, id);
  } else if (command.startsWith('productions/')) {
    const { handleProductionById } = await import('./commands/productions');
    const id = command.split('/').slice(1).join('/');
    await handleProductionById(apiUrl, token, id);
  } else if (command === 'workstate' || command === 'workstate/show') {
    const { handleWorkstateShow } = await import('./commands/workstate');
    await handleWorkstateShow(projectRoot, env);
  } else if (command === 'workstate/clear') {
    const { handleWorkstateClear } = await import('./commands/workstate');
    await handleWorkstateClear(projectRoot, env);
  } else if (command === 'workstate/load-file') {
    const { handleWorkstateLoadFile } = await import('./commands/workstate');
    const filePath = cmdArgs[0];
    if (!filePath) {
      console.error('Usage: kli workstate/load-file <path-to-.v3.kompo.md>');
      process.exit(1);
    }
    await handleWorkstateLoadFile(projectRoot, env, apiUrl, token, filePath);
  } else if (command === 'workstate/render' || command === 'workstate/render-qc') {
    const { handleWorkstateRender } = await import('./commands/workstate');
    await handleWorkstateRender(projectRoot, env, apiUrl, token, command === 'workstate/render-qc');
  } else if (command === 'workstate/open') {
    const { handleWorkstateOpen } = await import('./commands/workstate');
    const kind = cmdArgs[0];
    const query = cmdArgs.slice(1).join(' ').trim();
    if (kind !== 'komposition' || !query) {
      console.error('Usage: kli workstate/open komposition <id-or-title>');
      process.exit(1);
    }
    await handleWorkstateOpen(projectRoot, env, apiUrl, token, query);
  } else if (
    command === 'chat' ||
    command === 'chat-md' ||
    command === 'chat-workstate' ||
    command === 'chat-multimedia'
  ) {
    const { handleChat } = await import('./commands/chat');
    const message = cmdArgs[0];
    if (!message) {
      console.error(`Usage: kli ${command} "<message>"`);
      process.exit(1);
    }
    await handleChat(projectRoot, env, apiUrl, token, command, message);
  } else if (command === 'incidents') {
    const { handleIncidents } = await import('./commands/incidents');
    await handleIncidents(apiUrl, token);
  } else if (command.startsWith('upload-analyze')) {
    const { handleUploadAnalyze } = await import('./commands/media');
    const filePath = cmdArgs[0];
    if (!filePath) {
      console.error('Usage: kli upload-analyze <path-to-audio-file>');
      process.exit(1);
    }
    await handleUploadAnalyze(apiUrl, token, filePath);
  } else if (command.startsWith('upload-media')) {
    const { handleUploadMedia } = await import('./commands/media');
    const filePath = cmdArgs[0];
    if (!filePath) {
      console.error('Usage: kli upload-media <path-to-media-file>');
      process.exit(1);
    }
    await handleUploadMedia(apiUrl, token, filePath);
  } else {
    console.error(`Unknown command: ${command}`);
    console.error('Run "kli help" for available commands.');
    process.exit(1);
  }
}

// Run when executed directly
const _g = globalThis as any;
if ((_g.Bun && _g.Bun.main === (import.meta as any).path) || process.argv[1]?.endsWith('cli.ts')) {
  main().catch((err: any) => {
    console.error(`Fatal error: ${err.message}`);
    process.exit(1);
  });
}
