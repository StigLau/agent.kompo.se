/**
 * KLI Auth commands — auth/url, auth/complete, auth/refresh, auth/status
 */

import { cmdAuthUrl, cmdAuthComplete, cmdAuthRefresh, getAuthStatus } from '../auth';

export async function handleAuthUrl(env: string): Promise<void> {
  await cmdAuthUrl(env);
}

export async function handleAuthComplete(env: string, input: string): Promise<void> {
  await cmdAuthComplete(env, input);
}

export async function handleAuthRefresh(env: string): Promise<void> {
  try {
    await cmdAuthRefresh(env);
  } catch (err: any) {
    console.error(err.message);
    process.exit(1);
  }
}

export async function handleAuthStatus(env: string): Promise<void> {
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
  console.log(`- idToken: ${status.idTokenTail || '***'}`);
  console.log(
    `- expires: ${status.expiresAt ? new Date(status.expiresAt).toISOString() : 'unknown'}${status.expired ? ' ⚠ EXPIRED' : ''}`,
  );
  console.log(`- auth file: ~/.kompo/auth-${env}.json`);
  if (status.expired) {
    console.log('- Run kli auth/refresh to refresh, or auth/url + auth/complete to re-login.');
  }
}
