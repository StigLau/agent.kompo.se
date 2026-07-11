/**
 * KLI Chat commands — chat, chat-md, chat-workstate, chat-multimedia
 */

import * as fs from 'fs';
import * as path from 'path';
import { mdFetch, jsonFetch, getChatModel } from '../api';
import {
  loadWorkstate,
  renderWorkstateMarkdown,
  buildWorkstateChatMessage,
  openKompositionWorkstate,
  saveWorkstate,
  extractKompositionIdsFromChatResponse,
} from '../workstate';
import { extractIdsFromJson } from '../formatters';

export async function handleChat(
  projectRoot: string,
  env: string,
  apiUrl: string,
  token: string,
  command: string,
  message: string,
): Promise<void> {
  const state = command === 'chat-workstate' ? loadWorkstate(projectRoot, env) : null;
  const kompositionRef = state?.visible_context.komposition_ref;
  const currentMd = kompositionRef
    ? fs.readFileSync(path.join(projectRoot, kompositionRef), 'utf-8')
    : undefined;
  const effectiveMessage =
    command === 'chat-workstate'
      ? buildWorkstateChatMessage(message, renderWorkstateMarkdown(state!), currentMd)
      : message;

  if (command === 'chat-md') {
    const model = getChatModel();
    const md = await mdFetch(`${apiUrl}/api/multimedia/chat`, {
      method: 'POST',
      token,
      body: JSON.stringify(
        model ? { message: effectiveMessage, model } : { message: effectiveMessage },
      ),
      timeout: 60_000,
    });
    console.log(md);
    return;
  }

  const model = getChatModel();
  const useMultimedia = command === 'chat-multimedia';
  const endpoint = useMultimedia
    ? `${apiUrl}/api/multimedia/chat`
    : `${apiUrl}/api/chat`;
  const payloadObject = useMultimedia
    ? model
      ? { message: effectiveMessage, model }
      : { message: effectiveMessage }
    : {
        message: command === 'chat-workstate' ? message : effectiveMessage,
        ...(currentMd ? { current_komposition_content: currentMd } : {}),
        ...(state?.current_object
          ? { current_komposition: { id: state.current_object.id, content: currentMd } }
          : {}),
      };

  const data = await jsonFetch(endpoint, {
    method: 'POST',
    token,
    body: JSON.stringify(payloadObject),
    timeout: 60_000,
  });
  const responseText =
    typeof data?.response === 'string'
      ? data.response.trim()
      : typeof data?.message?.content === 'string'
        ? data.message.content.trim()
        : '';

  if (responseText) {
    console.log(responseText);
  }
  if (data?.error) {
    console.log(`Error: ${data.error}`);
  }
  const ids = extractIdsFromJson(data);
  console.log('');
  console.log('## Tool Metadata');
  if (ids.length > 0) {
    for (const id of ids) {
      console.log(`- ${id}`);
    }
  } else {
    console.log('- No IDs found in JSON response');
  }
  if (data?.llm_metadata) {
    console.log(`- llm_metadata: ${JSON.stringify(data.llm_metadata)}`);
  }
  if (data?.success !== undefined) {
    console.log(`- success: ${String(data.success)}`);
  }

  // For chat-workstate: auto-update workstate if a modified komposition was created
  if (command === 'chat-workstate' && state?.current_object) {
    const candidateIds = extractKompositionIdsFromChatResponse(data, responseText).filter(
      id => id !== state.current_object!.id,
    );
    for (const candidateId of candidateIds) {
      try {
        const res = await fetch(`${apiUrl}/api/kompositions/${candidateId}`, {
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${token}`,
          },
        });
        if (!res.ok) continue;
        const detail = await res.json();
        const body = detail.komposition || detail;
        const content = body.content || body.markdown || '';
        const title = body.name || body.title || candidateId;
        const looksModified =
          content.includes(`Based on komposition \`${state.current_object.id}\``) ||
          /modified|preserv(?:e|ed) the original|original remains unchanged/i.test(responseText);
        if (!looksModified) continue;
        const newState = openKompositionWorkstate(projectRoot, env, {
          id: candidateId,
          title,
          status: body.status || 'draft',
          content,
        });
        newState.dirty = true;
        newState.last_action = {
          type: 'modified-version',
          summary: `Chat created modified draft ${title} (${candidateId}) from ${state.current_object.id}`,
        };
        saveWorkstate(projectRoot, newState);
        console.log(`- workstate_updated: ${candidateId}`);
        break;
      } catch {
        // Candidate IDs can appear in prose; ignore ones that are not readable kompositions.
      }
    }
  }

  if (!responseText && ids.length === 0) {
    const raw = JSON.stringify(data);
    console.log(`- raw_json: ${raw.length > 1200 ? `${raw.slice(0, 1200)}...` : raw}`);
  }
  console.log('');
  console.log('---');
  console.log('*chat rendered from JSON for deterministic metadata*');
}
