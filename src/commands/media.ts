/**
 * KLI Media commands — upload-analyze <path>
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

  // Step 4: poll for analysisJob DDB marker (fire-and-forget — allow up to 20s)
  let analysisJob: any = null;
  for (let i = 0; i < 5 && !analysisJob?.jobId; i++) {
    await new Promise(r => setTimeout(r, 4000));
    const res = await fetch(`${apiUrl}/api/multimedia/${fileId}/analysis`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    }).catch(() => null);
    const aData = res ? await res.json().catch(() => null) : null;
    analysisJob = aData?.analysisJob ?? null;
  }

  console.log('# upload-analyze');
  console.log('');
  console.log(`- fileId: ${fileId}`);
  console.log(`- analysisStatus (response): ${completeData.analysisStatus ?? 'not set'}`);
  console.log(`- analysisJob.jobId: ${analysisJob?.jobId ?? 'MISSING'}`);
  console.log(`- result: ${analysisJob?.jobId ? 'PASS' : 'FAIL'}`);

  if (!analysisQueued || !analysisJob?.jobId) {
    console.error(
      '\nupload-analyze FAILED — analysisJob marker not written to DynamoDB after upload',
    );
    process.exit(1);
  }
}
