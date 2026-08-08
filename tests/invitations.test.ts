import { describe, expect, test } from 'bun:test';
import { extractInvitationId } from '../src/commands/invitations';

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
