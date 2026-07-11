/**
 * KLI Komposition commands — kompositions, kompositions/<id>
 */

import { mdFetch } from '../api';

export async function handleKompositions(apiUrl: string, token: string): Promise<void> {
  const md = await mdFetch(`${apiUrl}/api/kompositions`, { token });
  console.log(md);
}

export async function handleKompositionById(
  apiUrl: string,
  token: string,
  id: string,
): Promise<void> {
  const md = await mdFetch(`${apiUrl}/api/kompositions/${id}`, { token });
  console.log(md);
}
