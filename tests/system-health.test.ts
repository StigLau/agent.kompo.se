/**
 * Tests for KCP manifest evaluation — kli health degraded-state detection.
 */

import { describe, test, expect } from 'bun:test';
import { evaluateKcpManifest } from '../src/commands/system';
import type { KcpManifestStatus } from '../src/commands/system';

// ---------------------------------------------------------------------------
// evaluateKcpManifest
// ---------------------------------------------------------------------------

describe('evaluateKcpManifest', () => {
  test('healthy manifest with units → OK', () => {
    const yaml = `kcp_version: "0.21"
project: kompo.ai
updated: 2026-07-11
units:
  - id: service-overview
    path: docs/kcp/service-overview.md
    intent: "What is kompo.ai?"
  - id: authentication
    path: docs/kcp/authentication.md
    intent: "How to auth?"
`;
    const result = evaluateKcpManifest(yaml);
    expect(result.ok).toBe(true);
    expect(result.kcpVersion).toBe('0.21');
    expect(result.unitCount).toBe(2);
    expect(result.updated).toBe('2026-07-11');
    expect(result.degradedReason).toBeNull();
  });

  test('healthy manifest with single unit → OK', () => {
    const yaml = `kcp_version: "0.5"
updated: 2025-01-01
units:
  - id: only-unit
    path: docs/only.md
`;
    const result = evaluateKcpManifest(yaml);
    expect(result.ok).toBe(true);
    expect(result.kcpVersion).toBe('0.5');
    expect(result.unitCount).toBe(1);
  });

  // ── Degraded: 0 units ───────────────────────────────────────────────

  test('0-unit manifest → degraded', () => {
    const yaml = `kcp_version: "0.1"
project: kompo.ai
units:
`;
    const result = evaluateKcpManifest(yaml);
    expect(result.ok).toBe(false);
    expect(result.unitCount).toBe(0);
    expect(result.degradedReason).toContain('0 knowledge units');
  });

  test('0-unit with kcp_version 0.1 (deployed test stub) → degraded', () => {
    const yaml = `kcp_version: "0.1"
project: kompo.ai
version: 1.0.0
updated: 2024-01-01
links:
  web_manifest: /knowledge.yaml
# This is a stub — real manifest at /v2/knowledge.yaml
units:
`;
    const result = evaluateKcpManifest(yaml);
    expect(result.ok).toBe(false);
    expect(result.kcpVersion).toBe('0.1');
    expect(result.unitCount).toBe(0);
    expect(result.degradedReason).toContain('0 knowledge units');
  });

  test('empty string → degraded (0 units)', () => {
    const result = evaluateKcpManifest('');
    expect(result.ok).toBe(false);
    expect(result.unitCount).toBe(0);
    expect(result.degradedReason).toContain('0 knowledge units');
  });

  test('whitespace-only → degraded (0 units)', () => {
    const result = evaluateKcpManifest('   \n  \n  ');
    expect(result.ok).toBe(false);
    expect(result.unitCount).toBe(0);
  });

  // ── Degraded: HTML redirect stubs ───────────────────────────────────

  test('HTML doctype redirect → degraded', () => {
    const yaml = `<!DOCTYPE html>
<html>
<head>
  <meta http-equiv="refresh" content="0;url=https://example.com/v2/knowledge.yaml">
</head>
<body>Redirecting…</body>
</html>`;
    const result = evaluateKcpManifest(yaml);
    expect(result.ok).toBe(false);
    expect(result.degradedReason).toContain('HTML redirect');
    expect(result.unitCount).toBe(0);
  });

  test('HTML with window.location redirect → degraded', () => {
    const yaml = `<html>
<body>
  <script>window.location = "https://example.com/v2";</script>
</body>
</html>`;
    const result = evaluateKcpManifest(yaml);
    expect(result.ok).toBe(false);
    expect(result.degradedReason).toContain('HTML redirect');
    expect(result.unitCount).toBe(0);
  });

  // ── Degraded: redirect language in body, 0 units ────────────────────

  test('redirect stub language with 0 units → degraded', () => {
    const yaml = `# Redirect to the real manifest
redirect: /v2/knowledge.yaml
units:
`;
    const result = evaluateKcpManifest(yaml);
    expect(result.ok).toBe(false);
    // Hits the redirect-stub detection first (0 units + redirect keyword)
    expect(result.degradedReason).toContain('redirect stub');
  });

  // ── Degraded: unparseable / missing kcp_version ─────────────────────

  test('missing kcp_version with units → degraded', () => {
    const yaml = `project: kompo.ai
units:
  - id: test-unit
    path: docs/test.md
`;
    const result = evaluateKcpManifest(yaml);
    expect(result.ok).toBe(false);
    expect(result.degradedReason).toContain('missing kcp_version');
    expect(result.unitCount).toBe(1); // has a unit but no version
  });

  test('garbage non-YAML text → degraded (0 units)', () => {
    const yaml = 'NOT YAML AT ALL\nJUST SOME RANDOM TEXT\n!!!@@@###$';
    const result = evaluateKcpManifest(yaml);
    expect(result.ok).toBe(false);
    expect(result.unitCount).toBe(0);
    expect(result.degradedReason).toContain('0 knowledge units');
  });

  // ── Edge cases ──────────────────────────────────────────────────────

  test('version without quotes → OK', () => {
    const yaml = `kcp_version: 3
units:
  - id: u1
    path: docs/u1.md
`;
    const result = evaluateKcpManifest(yaml);
    expect(result.ok).toBe(true);
    expect(result.kcpVersion).toBe('3');
    expect(result.unitCount).toBe(1);
  });

  test('updated field not present → null', () => {
    const yaml = `kcp_version: "0.21"
units:
  - id: u1
    path: docs/u1.md
`;
    const result = evaluateKcpManifest(yaml);
    expect(result.ok).toBe(true);
    expect(result.updated).toBeNull();
  });

  test('kcp_version with no units section at all → degraded', () => {
    const yaml = `kcp_version: "0.1"
project: test
`;
    const result = evaluateKcpManifest(yaml);
    expect(result.ok).toBe(false);
    expect(result.unitCount).toBe(0);
    expect(result.kcpVersion).toBe('0.1');
    expect(result.degradedReason).toContain('0 knowledge units');
  });
});
