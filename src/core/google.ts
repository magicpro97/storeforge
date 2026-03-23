import { readFileSync, existsSync, statSync } from 'fs';
import type {
  GoogleConfig,
  GoogleTrack,
  AppMetadata,
  UploadResult,
  ReviewStatus,
} from '../types/index.js';

const PLAY_API_BASE = 'https://androidpublisher.googleapis.com/androidpublisher/v3';

interface ServiceAccountKey {
  type: string;
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri: string;
  token_uri: string;
}

async function getAccessToken(config: GoogleConfig): Promise<string> {
  if (!existsSync(config.serviceAccountPath)) {
    throw new Error(`Service account key not found: ${config.serviceAccountPath}`);
  }

  const keyFile = JSON.parse(
    readFileSync(config.serviceAccountPath, 'utf-8'),
  ) as ServiceAccountKey;

  // Build JWT for Google OAuth2
  const jwtModule = await import('jsonwebtoken');
  const sign = jwtModule.default.sign;

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: keyFile.client_email,
    scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: keyFile.token_uri,
    iat: now,
    exp: now + 3600,
  };

  const token = sign(payload, keyFile.private_key, { algorithm: 'RS256' });

  // Exchange JWT for access token
  const response = await fetch(keyFile.token_uri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: token,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to get access token: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as { access_token: string };
  return data.access_token;
}

function getHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };
}

export async function createEdit(config: GoogleConfig): Promise<string> {
  const accessToken = await getAccessToken(config);
  const headers = getHeaders(accessToken);

  const response = await fetch(
    `${PLAY_API_BASE}/applications/${config.packageName}/edits`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({}),
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to create edit: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as { id: string };
  return data.id;
}

export async function commitEdit(config: GoogleConfig, editId: string): Promise<void> {
  const accessToken = await getAccessToken(config);
  const headers = getHeaders(accessToken);

  const response = await fetch(
    `${PLAY_API_BASE}/applications/${config.packageName}/edits/${editId}:commit`,
    { method: 'POST', headers },
  );

  if (!response.ok) {
    throw new Error(`Failed to commit edit: ${response.status} ${response.statusText}`);
  }
}

export async function uploadAAB(
  config: GoogleConfig,
  aabPath: string,
  track: string = 'internal',
): Promise<UploadResult> {
  const validTracks = ['internal', 'alpha', 'beta', 'production'];
  if (!validTracks.includes(track)) {
    throw new Error(`Invalid track: ${track}. Valid tracks: ${validTracks.join(', ')}`);
  }

  if (!existsSync(aabPath)) {
    throw new Error(`AAB file not found: ${aabPath}`);
  }

  const stat = statSync(aabPath);
  if (!aabPath.endsWith('.aab')) {
    throw new Error('File must be an .aab file');
  }

  const accessToken = await getAccessToken(config);
  const editId = await createEdit(config);
  const fileSizeMB = (stat.size / (1024 * 1024)).toFixed(2);

  // Upload the AAB binary
  const aabBuffer = readFileSync(aabPath);
  const uploadResponse = await fetch(
    `https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/${config.packageName}/edits/${editId}/bundles?uploadType=media`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(stat.size),
      },
      body: aabBuffer,
    },
  );

  if (!uploadResponse.ok) {
    const errorBody = await uploadResponse.text();
    throw new Error(`Failed to upload AAB: ${uploadResponse.status} ${errorBody}`);
  }

  const uploadData = await uploadResponse.json() as { versionCode: number };

  // Assign to track
  const trackResponse = await fetch(
    `${PLAY_API_BASE}/applications/${config.packageName}/edits/${editId}/tracks/${track}`,
    {
      method: 'PUT',
      headers: getHeaders(accessToken),
      body: JSON.stringify({
        track,
        releases: [
          {
            versionCodes: [String(uploadData.versionCode)],
            status: 'completed',
          },
        ],
      }),
    },
  );

  if (!trackResponse.ok) {
    const errorBody = await trackResponse.text();
    throw new Error(`Failed to assign track: ${trackResponse.status} ${errorBody}`);
  }

  // Commit the edit
  await commitEdit(config, editId);

  return {
    success: true,
    platform: 'android',
    message: `AAB uploaded successfully (${fileSizeMB} MB) to ${track} track`,
    versionCode: String(uploadData.versionCode),
  };
}

export async function getTracks(config: GoogleConfig): Promise<GoogleTrack[]> {
  const accessToken = await getAccessToken(config);
  const headers = getHeaders(accessToken);

  const editId = await createEdit(config);

  const response = await fetch(
    `${PLAY_API_BASE}/applications/${config.packageName}/edits/${editId}/tracks`,
    { headers },
  );

  if (!response.ok) {
    throw new Error(`Failed to get tracks: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as { tracks: GoogleTrack[] };

  // Clean up the edit since we only needed to read
  try {
    await fetch(
      `${PLAY_API_BASE}/applications/${config.packageName}/edits/${editId}`,
      { method: 'DELETE', headers }
    );
  } catch { /* ignore cleanup errors */ }

  return data.tracks || [];
}

export async function getReviewStatus(config: GoogleConfig): Promise<ReviewStatus> {
  const tracks = await getTracks(config);

  const productionTrack = tracks.find((t) => t.track === 'production');
  if (!productionTrack || !productionTrack.releases.length) {
    return {
      platform: 'android',
      status: 'NO_ACTIVE_RELEASE',
    };
  }

  const latestRelease = productionTrack.releases[0]!;
  return {
    platform: 'android',
    status: latestRelease.status,
    version: latestRelease.versionCodes?.[0],
  };
}

export async function promoteTrack(
  config: GoogleConfig,
  fromTrack: string,
  toTrack: string,
): Promise<void> {
  const accessToken = await getAccessToken(config);
  const editId = await createEdit(config);
  const headers = getHeaders(accessToken);

  // Get the source track
  const sourceResponse = await fetch(
    `${PLAY_API_BASE}/applications/${config.packageName}/edits/${editId}/tracks/${fromTrack}`,
    { headers },
  );

  if (!sourceResponse.ok) {
    throw new Error(`Failed to get ${fromTrack} track: ${sourceResponse.status}`);
  }

  const sourceData = await sourceResponse.json() as GoogleTrack;

  if (!sourceData.releases.length) {
    throw new Error(`No releases found in ${fromTrack} track`);
  }

  const latestRelease = sourceData.releases[0]!;

  // Set target track
  const targetResponse = await fetch(
    `${PLAY_API_BASE}/applications/${config.packageName}/edits/${editId}/tracks/${toTrack}`,
    {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        track: toTrack,
        releases: [
          {
            versionCodes: latestRelease.versionCodes,
            status: 'completed',
            releaseNotes: latestRelease.releaseNotes,
          },
        ],
      }),
    },
  );

  if (!targetResponse.ok) {
    const errorBody = await targetResponse.text();
    throw new Error(`Failed to promote to ${toTrack}: ${targetResponse.status} ${errorBody}`);
  }

  await commitEdit(config, editId);
}

export async function getStoreListing(
  config: GoogleConfig,
  language: string = 'en-US',
): Promise<AppMetadata> {
  const accessToken = await getAccessToken(config);
  const headers = getHeaders(accessToken);
  const editId = await createEdit(config);

  const response = await fetch(
    `${PLAY_API_BASE}/applications/${config.packageName}/edits/${editId}/listings/${language}`,
    { headers },
  );

  if (!response.ok) {
    throw new Error(`Failed to get store listing: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as {
    title: string;
    shortDescription: string;
    fullDescription: string;
    language: string;
  };

  // Clean up the edit since we only needed to read
  try {
    await fetch(
      `${PLAY_API_BASE}/applications/${config.packageName}/edits/${editId}`,
      { method: 'DELETE', headers }
    );
  } catch { /* ignore cleanup errors */ }

  return {
    title: data.title,
    shortDescription: data.shortDescription,
    description: data.fullDescription,
    locale: data.language,
  };
}

export async function updateStoreListing(
  config: GoogleConfig,
  metadata: AppMetadata,
  language: string = 'en-US',
): Promise<void> {
  const accessToken = await getAccessToken(config);
  const headers = getHeaders(accessToken);
  const editId = await createEdit(config);

  const response = await fetch(
    `${PLAY_API_BASE}/applications/${config.packageName}/edits/${editId}/listings/${language}`,
    {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        language,
        title: metadata.title,
        shortDescription: metadata.shortDescription || '',
        fullDescription: metadata.description,
      }),
    },
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Failed to update store listing: ${response.status} ${errorBody}`);
  }

  await commitEdit(config, editId);
}
