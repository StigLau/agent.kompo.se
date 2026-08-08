/** Invitation inspection and acceptance via the public enrollment contract. */

import { jsonFetch } from '../api';

export function extractInvitationId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    const id = url.searchParams.get('invitation');
    return id?.trim() || null;
  } catch {
    return null;
  }
}

function invitationRole(data: any): string {
  const invitation = data?.invitation || data || {};
  return invitation.target_role || invitation.targetRole || 'unknown';
}

export type InvitationFetcher = (
  url: string,
  opts?: { method?: string; token?: string; body?: string; timeout?: number },
) => Promise<any>;

/**
 * Inspect an invitation first. Claiming requires an explicit --confirm flag so
 * the command never changes an account merely because a link was pasted.
 */
export async function handleInvitationClaim(
  apiUrl: string,
  token: string,
  invitationUrl: string,
  confirm: boolean,
  fetcher: InvitationFetcher = jsonFetch,
): Promise<void> {
  const invitationId = extractInvitationId(invitationUrl);
  if (!invitationId) {
    throw new Error('Expected an enrollment URL containing an invitation query parameter.');
  }

  const base = `${apiUrl}/api/invitations/${encodeURIComponent(invitationId)}`;
  const details = await fetcher(base, { token });
  const role = invitationRole(details);

  if (!confirm) {
    console.log('# Invitation ready');
    console.log('');
    console.log(`- role: ${role}`);
    console.log('- result: NOT CLAIMED');
    console.log('- Re-run with --confirm to accept this invitation.');
    return;
  }

  const result = await fetcher(`${base}/claim`, { method: 'POST', token });
  console.log('# Invitation claimed');
  console.log('');
  console.log(`- role: ${result?.role || role}`);
  console.log('- result: PASS');
}
