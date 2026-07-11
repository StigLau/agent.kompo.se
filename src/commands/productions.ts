/**
 * KLI Production commands — outputs, productions, productions/<id>,
 * productions/by-komposition/<id>, production-stream/<id>
 */

import { mdFetch, jsonFetch } from '../api';
import {
  formatProductionsMarkdown,
  formatProductionsByKompositionMarkdown,
  formatProductionMarkdown,
  formatProductionStreamMarkdown,
} from '../formatters';

export async function handleOutputs(apiUrl: string, token: string): Promise<void> {
  const md = await mdFetch(`${apiUrl}/api/outputs`, { token });
  console.log(md);
}

export async function handleProductions(apiUrl: string, token: string): Promise<void> {
  const data = await jsonFetch(`${apiUrl}/api/productions`, { token });
  const productions = Array.isArray(data?.productions) ? data.productions : [];
  console.log(formatProductionsMarkdown(productions));
}

export async function handleProductionById(
  apiUrl: string,
  token: string,
  id: string,
): Promise<void> {
  const data = await jsonFetch(`${apiUrl}/api/productions/${encodeURIComponent(id)}`, {
    token,
  });
  console.log(formatProductionMarkdown(id, data));
}

export async function handleProductionsByKomposition(
  apiUrl: string,
  token: string,
  kompositionId: string,
): Promise<void> {
  const data = await jsonFetch(
    `${apiUrl}/api/productions/by-komposition/${encodeURIComponent(kompositionId)}`,
    { token },
  );
  const productions = Array.isArray(data?.productions) ? data.productions : [];
  console.log(formatProductionsByKompositionMarkdown(kompositionId, productions));
}

export async function handleProductionStream(
  apiUrl: string,
  token: string,
  id: string,
): Promise<void> {
  const data = await jsonFetch(
    `${apiUrl}/api/productions/${encodeURIComponent(id)}/stream`,
    { token },
  );
  console.log(formatProductionStreamMarkdown(id, data));
}
