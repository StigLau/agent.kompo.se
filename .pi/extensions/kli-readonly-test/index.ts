import { spawnSync } from 'node:child_process';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { truncateTail } from '@earendil-works/pi-coding-agent';
import { StringEnum } from '@earendil-works/pi-ai';
import { Type } from 'typebox';

const ACTIONS = {
  unit: ['bun', 'test', 'tests/'],
  'contract-public': ['bun', 'run', 'contract:public'],
  'verify-test': ['bun', 'scripts/verify-access.ts', '--env', 'test', '--require-producer'],
  'contract-auth': ['bun', 'run', 'contract:auth'],
} as const;

type Action = keyof typeof ACTIONS;

function redact(output: string): string {
  return output
    .replace(/^\[kli\] authenticated as:.*$/gim, '[kli] authenticated as: [REDACTED]')
    .replace(/^(- identity:).*$/gim, '$1 [REDACTED]')
    .replace(/(Authorization:\s*Bearer\s+)\S+/gi, '$1[REDACTED]')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[REDACTED_EMAIL]')
    .replace(/\b((?:id_token|access_token|refresh_token)\b\s*[:=])\s*[^\s,]+/gi, '$1 [REDACTED]');
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: 'kli_readonly_test',
    label: 'KLI Read-only Test',
    description: 'Run one approved read-only KLI client test gate. It cannot run arbitrary shell commands or mutating workflows.',
    promptSnippet: 'Run one approved read-only KLI client test gate.',
    promptGuidelines: [
      'Use kli_readonly_test only for unit tests or the listed read-only KLI client gates; it cannot run uploads, invitation claims, renders, promotions, or arbitrary commands.',
    ],
    parameters: Type.Object({
      action: StringEnum(['unit', 'contract-public', 'verify-test', 'contract-auth'] as const, {
        description: 'The approved test gate to run.',
      }),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      if (signal?.aborted) throw new Error('Cancelled before test execution.');
      const action = params.action as Action;
      const [command, ...args] = ACTIONS[action];
      const result = spawnSync(command, args, {
        cwd: ctx.cwd,
        encoding: 'utf8',
        timeout: 180_000,
        env: {
          ...process.env,
          KOMPO_CONTRACT_MUTATING: undefined,
          KOMPO_CONTRACT_FULL: undefined,
          KOMPO_CONTRACT_KOMPOSITION_FILE: undefined,
        },
      });
      const combined = redact(`${result.stdout ?? ''}${result.stderr ?? ''}`);
      const truncated = truncateTail(combined, { maxBytes: 20_000, maxLines: 500 });
      const suffix = truncated.truncated
        ? '\n\n[Output truncated; only the final 500 lines / 20KB are shown.]'
        : '';
      return {
        content: [{
          type: 'text',
          text: `Command: ${[command, ...args].join(' ')}\nExit status: ${result.status ?? 1}\n\n${truncated.content}${suffix}`,
        }],
        details: { action, exitCode: result.status ?? 1, timedOut: result.error?.name === 'Error' },
      };
    },
  });
}
