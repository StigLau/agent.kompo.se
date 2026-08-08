#!/usr/bin/env bun
/**
 * Read-only verification of public discovery and authenticated KLI access.
 * It never accepts or stores invitation links, tokens, or credentials.
 */

import * as path from 'path';

const ROOT = path.resolve(import.meta.dir, '..');
type Env = 'test' | 'prod';

function usage(): never {
  console.error('Usage: bun scripts/verify-access.ts [--env test|prod] [--public-only] [--require-producer]');
  process.exit(1);
}

function run(env: Env, command: string[]): { code: number; out: string; err: string } {
  const result = Bun.spawnSync({
    cmd: ['bun', 'src/cli.ts', '--env', env, ...command],
    cwd: ROOT,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  return {
    code: result.exitCode,
    out: result.stdout.toString(),
    err: result.stderr.toString(),
  };
}

function check(label: string, passed: boolean, detail?: string): boolean {
  console.log(`- ${label}: ${passed ? 'PASS' : 'FAIL'}${detail ? ` — ${detail}` : ''}`);
  return passed;
}

export function isProducerCapableAuthOutput(output: string): boolean {
  return /^- Roles?:.*\b(?:producer|admin)\b/im.test(output);
}

export function isPublicToolsResult(result: { code: number; out: string; err: string }): boolean {
  if (result.code !== 0 || /used stored credentials/i.test(result.err)) return false;
  try {
    JSON.parse(result.out);
    return true;
  } catch {
    return false;
  }
}

export function main(args: string[] = process.argv.slice(2)): never {
  let environments: Env[] = ['test', 'prod'];
  let publicOnly = false;
  let requireProducer = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--env') {
      const value = args[++i];
      if (value !== 'test' && value !== 'prod') usage();
      environments = [value];
    } else if (args[i] === '--public-only') {
      publicOnly = true;
    } else if (args[i] === '--require-producer') {
      requireProducer = true;
    } else {
      usage();
    }
  }

  let passed = true;
  for (const env of environments) {
    console.log(`\n# KLI access verification (${env})`);

    const health = run(env, ['health']);
    passed = check('public health', health.code === 0 && /healthy|ok|up|running|status/i.test(`${health.out}${health.err}`)) && passed;

    const tools = run(env, ['tools']);
    passed = check(
      'public tools manifest',
      isPublicToolsResult(tools),
      /used stored credentials/i.test(tools.err) ? 'endpoint required stored authentication' : undefined,
    ) && passed;

    if (publicOnly) continue;

    const auth = run(env, ['auth/status']);
    const authenticated = auth.code === 0 && auth.out.includes('- source: user auth') && !auth.out.includes('⚠ EXPIRED');
    passed = check('valid user authentication', authenticated, authenticated ? undefined : 'run kli auth/url then kli auth/complete') && passed;
    if (!authenticated) continue;

    if (requireProducer) {
      passed = check('producer-capable role', isProducerCapableAuthOutput(auth.out)) && passed;
    }

    for (const command of ['kompositions', 'library', 'jobs', 'outputs']) {
      const result = run(env, [command]);
      passed = check(`authenticated ${command}`, result.code === 0) && passed;
    }
  }

  console.log(`\n# Overall: ${passed ? 'PASS' : 'FAIL'}`);
  process.exit(passed ? 0 : 1);
}

if (import.meta.main) main();
