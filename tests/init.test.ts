/**
 * Tests for kli init — renderAgentContext + knowledge.yaml light parser
 */

import { describe, test, expect } from 'bun:test';
import {
  renderAgentContext,
  parseKnowledgeYaml,
  KNOWLEDGE_MANIFEST_URL,
} from '../src/commands/init';
import type { AgentContextInput, KnowledgeUnit } from '../src/commands/init';

// ---------------------------------------------------------------------------
// parseKnowledgeYaml
// ---------------------------------------------------------------------------

describe('parseKnowledgeYaml', () => {
  test('parses ids and intents from a real-looking manifest snippet', () => {
    const yaml = `kcp_version: "0.21"
project: kompo.ai
version: 1.0.0
updated: 2026-07-11
links:
  web_manifest: /knowledge.yaml

units:
  - id: service-overview
    path: docs/kcp/service-overview.md
    intent: "What is kompo.ai and what six workflows does it support?"
    scope: global
    audience: [human, agent]
    validated: 2026-07-11
    triggers:
      - "what is kompo.ai"

  - id: authentication
    path: docs/kcp/authentication.md
    intent: "How do I obtain a JWT bearer token via kli auth?"
    scope: global
    audience: [agent, developer]
    validated: 2026-07-11
    triggers:
      - "how do I log in"

  - id: tools-manifest
    path: docs/kcp/tools-manifest.md
    intent: "What are the exact callable operations, their HTTP methods, paths, and input schemas?"
    scope: global
    audience: [agent]
    validated: 2026-07-11
    triggers:
      - "what API endpoints are available"
`;

    const units = parseKnowledgeYaml(yaml);
    expect(units.length).toBe(3);
    expect(units[0].id).toBe('service-overview');
    expect(units[0].intent).toBe(
      'What is kompo.ai and what six workflows does it support?',
    );
    expect(units[1].id).toBe('authentication');
    expect(units[1].intent).toBe('How do I obtain a JWT bearer token via kli auth?');
    expect(units[2].id).toBe('tools-manifest');
    expect(units[2].intent).toBe(
      'What are the exact callable operations, their HTTP methods, paths, and input schemas?',
    );
  });

  test('tolerates units without intent', () => {
    const yaml = `units:
  - id: bare-unit
    path: docs/bare.md
    scope: global

  - id: with-intent
    path: docs/with-intent.md
    intent: "This one has an intent"
`;

    const units = parseKnowledgeYaml(yaml);
    expect(units.length).toBe(2);
    expect(units[0].id).toBe('bare-unit');
    expect(units[0].intent).toBeUndefined();
    expect(units[1].id).toBe('with-intent');
    expect(units[1].intent).toBe('This one has an intent');
  });

  test('handles empty yaml', () => {
    expect(parseKnowledgeYaml('')).toEqual([]);
  });

  test('handles yaml with no units section', () => {
    const yaml = `kcp_version: "0.21"
project: kompo.ai
`;
    expect(parseKnowledgeYaml(yaml)).toEqual([]);
  });

  test('handles units section with no entries', () => {
    const yaml = `units:
# empty
`;
    expect(parseKnowledgeYaml(yaml)).toEqual([]);
  });

  test('strips trailing quotes from intent', () => {
    const yaml = `units:
  - id: test
    intent: "quoted intent"
`;
    const units = parseKnowledgeYaml(yaml);
    expect(units[0].intent).toBe('quoted intent');
  });

  test('handles non-YAML garbage without crashing', () => {
    const garbage = 'NOT YAML AT ALL\nJUST SOME RANDOM TEXT\n!!!@@@###$\n'.repeat(100);
    const start = Date.now();
    const units = parseKnowledgeYaml(garbage);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(1000);
    expect(Array.isArray(units)).toBe(true);
  });

  test('handles input with control characters without crashing', () => {
    const controlChars = 'units:\n  - id: test\x00unit\n    intent: "hello\x1bworld"\n';
    const units = parseKnowledgeYaml(controlChars);
    expect(Array.isArray(units)).toBe(true);
  });

  test('handles >1MB synthetic string without hanging', () => {
    let yaml = 'units:\n';
    for (let i = 0; i < 25000; i++) {
      yaml += `  - id: unit-${i}\n    intent: "Intent ${i}"\n`;
    }
    expect(yaml.length).toBeGreaterThan(1_000_000);
    const start = Date.now();
    const units = parseKnowledgeYaml(yaml);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(5000);
    expect(units.length).toBe(25000);
  });
});

// ---------------------------------------------------------------------------
// renderAgentContext
// ---------------------------------------------------------------------------

function makeInput(overrides: Partial<AgentContextInput> = {}): AgentContextInput {
  return {
    env: 'prod',
    authStatus: 'not logged in',
    units: [],
    toolsCount: 42,
    generatedAt: '2026-07-11T12:00:00.000Z',
    ...overrides,
  };
}

describe('renderAgentContext', () => {
  test('header and basic structure', () => {
    const md = renderAgentContext(makeInput());
    expect(md).toContain('# Kompo.ai — Agent Context');
    expect(md).toContain('invitation-only');
    expect(md).toContain('## Current State');
    expect(md).toContain('## Six Core Flows');
    expect(md).toContain('## Knowledge Units');
    expect(md).toContain('## Command Reference');
    expect(md).toContain('## Terminology');
  });

  test('includes env', () => {
    const md = renderAgentContext(makeInput({ env: 'sandbox-use2' }));
    expect(md).toContain('`sandbox-use2`');
  });

  test('authenticated variant', () => {
    const md = renderAgentContext(
      makeInput({
        authStatus: 'authenticated',
        authEmail: 'user@example.com',
      }),
    );
    expect(md).toContain('✅ authenticated as `user@example.com`');
    expect(md).not.toContain('❌ not logged in');
  });

  test('unauthenticated variant', () => {
    const md = renderAgentContext(makeInput({ authStatus: 'not logged in' }));
    expect(md).toContain('❌ not logged in');
    expect(md).toContain('kli auth/url');
    expect(md).not.toContain('✅ authenticated as');
  });

  test('includes toolsCount', () => {
    const md = renderAgentContext(makeInput({ toolsCount: 99 }));
    expect(md).toContain('99 operations');
  });

  test('includes knowledge manifest URL', () => {
    const md = renderAgentContext(makeInput());
    expect(md).toContain(KNOWLEDGE_MANIFEST_URL);
  });

  test('renders unit list', () => {
    const units: KnowledgeUnit[] = [
      { id: 'service-overview', intent: 'What is kompo.ai?' },
      { id: 'authentication', intent: 'How to get a JWT?' },
    ];
    const md = renderAgentContext(makeInput({ units }));
    expect(md).toContain('**`service-overview`** — What is kompo.ai?');
    expect(md).toContain('**`authentication`** — How to get a JWT?');
  });

  test('renders units without intent gracefully', () => {
    const units: KnowledgeUnit[] = [
      { id: 'bare-unit' },
      { id: 'with-intent', intent: 'Has intent' },
    ];
    const md = renderAgentContext(makeInput({ units }));
    expect(md).toContain('**`bare-unit`**');
    expect(md).toContain('**`with-intent`** — Has intent');
    // bare-unit line should just end without " — "
    const bareLine = md.split('\n').find(l => l.includes('`bare-unit`'));
    expect(bareLine).not.toContain(' — ');
  });

  test('empty-units fallback message', () => {
    const md = renderAgentContext(makeInput({ units: [] }));
    expect(md).toContain('_(No knowledge units parsed');
  });

  test('includes generatedAt ISO string', () => {
    const md = renderAgentContext(makeInput({ generatedAt: '2026-07-11T12:00:00.000Z' }));
    expect(md).toContain('2026-07-11T12:00:00.000Z');
  });

  test('includes six flows with primary kli commands', () => {
    const md = renderAgentContext(makeInput());
    expect(md).toContain('`kli tools`');
    expect(md).toContain('`kli auth/url`');
    expect(md).toContain('`kli auth/complete');
    expect(md).toContain('`kli upload-analyze');
    expect(md).toContain('`kli library`');
    expect(md).toContain('`kli workstate/load-file');
    expect(md).toContain('`kli workstate/render`');
    expect(md).toContain('`kli job-status/');
    expect(md).toContain('`kli production-stream/');
  });

  test('includes terminology section', () => {
    const md = renderAgentContext(makeInput());
    expect(md).toContain('**kilde** (pl. **kilder**)');
    expect(md).toContain('**komposition**');
    expect(md).toContain('beats, not milliseconds');
  });

  test('template is ≤ 120 lines', () => {
    const md = renderAgentContext(makeInput({ units: [] }));
    const lineCount = md.split('\n').length;
    expect(lineCount).toBeLessThanOrEqual(121); // 120 content lines + trailing newline
  });

  test('template with many units is still well under limits', () => {
    const units: KnowledgeUnit[] = Array.from({ length: 20 }, (_, i) => ({
      id: `unit-${i}`,
      intent: `Intent for unit ${i}`,
    }));
    const md = renderAgentContext(makeInput({ units }));
    const lineCount = md.split('\n').length;
    // Even with 20 units it should be fine — the template is compact
    expect(lineCount).toBeLessThan(200);
  });
});
