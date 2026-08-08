/**
 * KLI Media commands — upload-analyze <path>, upload-media <path>
 */

import * as fs from 'fs';
import * as path from 'path';
import { jsonFetch } from '../api';

export async function handleUploadAnalyze(
  apiUrl: string,
  token: string,
  filePath: string,
): Promise<void> {
  if (!fs.existsSync(filePath)) {
    console.error(`Usage: kli upload-analyze <path-to-audio-file>`);
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }
  const fileName = path.basename(filePath);
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  const contentTypeMap: Record<string, string> = {
    wav: 'audio/wav',
    mp3: 'audio/mpeg',
    flac: 'audio/flac',
    aac: 'audio/aac',
    ogg: 'audio/ogg',
    m4a: 'audio/mp4',
  };
  const contentType = contentTypeMap[ext] ?? 'audio/wav';
  const fileSize = fs.statSync(filePath).size;

  // Step 1: get presigned URL
  const presignData = await jsonFetch(`${apiUrl}/api/upload/presigned-url`, {
    method: 'POST',
    token,
    body: JSON.stringify({ fileName, contentType, fileSize }),
  });
  if (!presignData?.uploadUrl) {
    console.error('# upload-analyze FAILED: presigned-url returned no uploadUrl');
    console.error(JSON.stringify(presignData));
    process.exit(1);
  }
  const { fileId, uploadUrl, key: s3Key } = presignData;

  // Step 2: PUT to S3
  const s3Res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: fs.readFileSync(filePath),
  });
  if (!s3Res.ok) {
    console.error(`# upload-analyze FAILED: S3 PUT returned ${s3Res.status}`);
    process.exit(1);
  }

  // Step 3: register via /api/upload/complete (triggers analysis auto-submit)
  const completeData = await jsonFetch(`${apiUrl}/api/upload/complete`, {
    method: 'POST',
    token,
    body: JSON.stringify({ fileId, fileName, fileSize, contentType, s3Key }),
  });
  if (!completeData?.success) {
    console.error('# upload-analyze FAILED: upload/complete returned non-success');
    console.error(JSON.stringify(completeData));
    process.exit(1);
  }
  const analysisQueued = completeData.analysisStatus === 'queued';

  console.log('# upload-analyze');
  console.log('');
  console.log(`- fileId: ${fileId}`);
  console.log(`- analysisStatus (response): ${completeData.analysisStatus ?? 'not set'}`);
  console.log(`- result: ${analysisQueued ? 'PASS' : 'FAIL'}`);
  console.log(`- Next: kli media-analysis/${fileId}`);

  if (!analysisQueued) {
    console.error('\nupload-analyze FAILED — the upload response did not confirm queued analysis.');
    process.exit(1);
  }
}

/**
 * Upload a video or image to the media library without starting audio analysis.
 */
export async function handleUploadMedia(
  apiUrl: string,
  token: string,
  filePath: string,
): Promise<void> {
  if (!fs.existsSync(filePath)) {
    console.error('Usage: kli upload-media <path-to-media-file>');
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  const fileName = path.basename(filePath);
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  const contentTypeMap: Record<string, string> = {
    wav: 'audio/wav',
    mp3: 'audio/mpeg',
    flac: 'audio/flac',
    aac: 'audio/aac',
    ogg: 'audio/ogg',
    m4a: 'audio/mp4',
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    webm: 'video/webm',
    mkv: 'video/x-matroska',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    gif: 'image/gif',
  };
  const contentType = contentTypeMap[ext];
  if (!contentType) {
    console.error(
      `Unsupported file extension '.${ext || '(none)'}'. Supported extensions: ${Object.keys(contentTypeMap).join(', ')}`,
    );
    process.exit(1);
  }

  const fileSize = fs.statSync(filePath).size;

  // Step 1: get presigned URL
  const presignData = await jsonFetch(`${apiUrl}/api/upload/presigned-url`, {
    method: 'POST',
    token,
    body: JSON.stringify({ fileName, contentType, fileSize }),
  });
  if (!presignData?.uploadUrl) {
    console.error('# upload-media FAILED: presigned-url returned no uploadUrl');
    console.error(JSON.stringify(presignData));
    process.exit(1);
  }
  const { fileId, uploadUrl, key: s3Key } = presignData;

  // Step 2: PUT to S3
  const s3Res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: fs.readFileSync(filePath),
  });
  if (!s3Res.ok) {
    console.error(`# upload-media FAILED: S3 PUT returned ${s3Res.status}`);
    process.exit(1);
  }

  // Step 3: register via /api/upload/complete
  const completeData = await jsonFetch(`${apiUrl}/api/upload/complete`, {
    method: 'POST',
    token,
    body: JSON.stringify({ fileId, fileName, fileSize, contentType, s3Key }),
  });
  if (!completeData?.success) {
    console.error('# upload-media FAILED: upload/complete returned non-success');
    console.error(JSON.stringify(completeData));
    process.exit(1);
  }

  console.log('# upload-media');
  console.log('');
  console.log(`- fileId: ${fileId}`);
  console.log(`- result: ${completeData.success ? 'PASS' : 'FAIL'}`);
}
