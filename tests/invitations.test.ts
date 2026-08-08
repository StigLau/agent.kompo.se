import { describe, expect, test } from 'bun:test';
import { extractInvitationId, handleInvitationClaim } from '../src/commands/invitations';

describe('extractInvitationId', () => {
  test('extracts an invitation from an enrollment URL', () => {
    expect(extractInvitationId('https://example.test/enroll.html?invitation=abc123')).toBe('abc123');
  });

  test('rejects missing, malformed, and non-URL input', () => {
    expect(extractInvitationId('')).toBeNull();
    expect(extractInvitationId('https://example.test/enroll.html')).toBeNull();
    expect(extractInvitationId('abc123')).toBeNull();
    expect(extractInvitationId('not a URL')).toBeNull();
  });
});

describe('handleInvitationClaim safety', () => {
  test('inspection performs exactly one GET and never claims', async () => {
    const calls: Array<{ url: string; opts: any }> = [];
    const fetcher = async (url: string, opts?: any) => {
      calls.push({ url, opts });
      return { invitation: { targetRole: 'producer' } };
    };

    await handleInvitationClaim(
      'https://api.example.test',
      'test-token',
      'https://example.test/enroll?invitation=abc123',
      false,
      fetcher,
    );

    expect(calls).toEqual([{
      url: 'https://api.example.test/api/invitations/abc123',
      opts: { token: 'test-token' },
    }]);
  });

  test('explicit confirmation inspects first and then posts to the claim route', async () => {
    const calls: Array<{ url: string; opts: any }> = [];
    const fetcher = async (url: string, opts?: any) => {
      calls.push({ url, opts });
      return url.endsWith('/claim') ? { role: 'producer' } : { target_role: 'producer' };
    };

    await handleInvitationClaim(
      'https://api.example.test',
      'test-token',
      'https://example.test/enroll?invitation=abc/123',
      true,
      fetcher,
    );

    expect(calls).toEqual([
      {
        url: 'https://api.example.test/api/invitations/abc%2F123',
        opts: { token: 'test-token' },
      },
      {
        url: 'https://api.example.test/api/invitations/abc%2F123/claim',
        opts: { method: 'POST', token: 'test-token' },
      },
    ]);
  });
});
