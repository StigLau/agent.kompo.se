import { describe, expect, test } from 'bun:test';
import {
  isProducerCapableAuthOutput,
  isPublicToolsResult,
} from '../scripts/verify-access';

describe('access verification output checks', () => {
  test('accepts producer/admin in singular and plural auth output', () => {
    expect(isProducerCapableAuthOutput('- Role: producer')).toBe(true);
    expect(isProducerCapableAuthOutput('- Role: admin')).toBe(true);
    expect(isProducerCapableAuthOutput('- Roles: viewer, producer')).toBe(true);
    expect(isProducerCapableAuthOutput('- Roles: viewer, admin')).toBe(true);
  });

  test('rejects missing and non-producer roles', () => {
    expect(isProducerCapableAuthOutput('- Roles: (none)')).toBe(false);
    expect(isProducerCapableAuthOutput('- Role: viewer')).toBe(false);
  });

  test('only accepts a directly public JSON tools response', () => {
    expect(isPublicToolsResult({ code: 0, out: '{"tools":[]}', err: '' })).toBe(true);
    expect(isPublicToolsResult({ code: 1, out: '{"tools":[]}', err: '' })).toBe(false);
    expect(isPublicToolsResult({ code: 0, out: 'not json', err: '' })).toBe(false);
  });

  test('rejects a successful authenticated fallback', () => {
    expect(isPublicToolsResult({
      code: 0,
      out: '{"tools":[]}',
      err: 'note: /api/tools requires login on this deployment — used stored credentials.\n',
    })).toBe(false);
  });
});
