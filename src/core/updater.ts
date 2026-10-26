/**
 * On-Demand GitHub Releases Update Checker for Otium Scan.
 * 100% Private & Polite: Never polls the network in the background.
 * Only executes when explicitly requested by the user.
 */

export const APP_CURRENT_VERSION = '0.2.4';

export interface ReleaseAsset {
  name: string;
  size: number;
  downloadUrl: string;
}

export interface UpdateCheckResult {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseUrl: string;
  releaseNotes?: string;
  publishedAt?: string;
  matchedAsset?: ReleaseAsset;
  allAssets: ReleaseAsset[];
}

/**
 * Compares two semantic version strings (e.g. "0.2.1" vs "0.2.0").
 * Returns true if vCandidate is strictly greater than vCurrent.
 */
export function isNewerVersion(vCandidate: string, vCurrent: string): boolean {
  const cleanCand = vCandidate.replace(/^v/i, '').trim();
  const cleanCurr = vCurrent.replace(/^v/i, '').trim();

  const partsCand = cleanCand.split('.').map((p) => parseInt(p, 10) || 0);
  const partsCurr = cleanCurr.split('.').map((p) => parseInt(p, 10) || 0);

  const maxLen = Math.max(partsCand.length, partsCurr.length);
  for (let i = 0; i < maxLen; i++) {
    const c = partsCand[i] || 0;
    const cur = partsCurr[i] || 0;
    if (c > cur) return true;
    if (c < cur) return false;
  }
  return false;
}

/**
 * Detects the likely Android CPU architecture of the device.
 * Defaults to 'arm64-v8a' which powers over 95% of modern Android devices.
 */
export function detectDeviceArchitecture(): 'arm64-v8a' | 'armeabi-v7a' | 'x86_64' {
  if (typeof navigator === 'undefined') return 'arm64-v8a';
  const ua = (navigator.userAgent || '').toLowerCase();

  if (ua.includes('x86_64') || ua.includes('x86-64') || ua.includes('amd64')) {
    return 'x86_64';
  }
  if (ua.includes('armv7') || ua.includes('armeabi')) {
    return 'armeabi-v7a';
  }
  return 'arm64-v8a';
}

/**
 * Checks GitHub Releases API for the latest version.
 * Times out gracefully after 6 seconds to prevent hanging if offline.
 */
export async function checkForAppUpdates(): Promise<UpdateCheckResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);

  try {
    const response = await fetch(
      'https://api.github.com/repos/XRTM8/Otium-Scan/releases/latest',
      {
        signal: controller.signal,
        headers: {
          Accept: 'application/vnd.github.v3+json',
        },
      }
    );

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`GitHub API HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    const tag = (data.tag_name || '').replace(/^v/i, '');
    const hasUpdate = isNewerVersion(tag, APP_CURRENT_VERSION);

    const assets: ReleaseAsset[] = Array.isArray(data.assets)
      ? data.assets.map((a: any) => ({
          name: a.name,
          size: a.size,
          downloadUrl: a.browser_download_url,
        }))
      : [];

    const targetAbi = detectDeviceArchitecture();
    const matchedAsset =
      assets.find((a) => a.name.includes(targetAbi) && a.name.endsWith('.apk')) ||
      assets.find((a) => a.name.endsWith('.apk'));

    return {
      hasUpdate,
      currentVersion: APP_CURRENT_VERSION,
      latestVersion: tag || APP_CURRENT_VERSION,
      releaseUrl: data.html_url || 'https://github.com/XRTM8/Otium-Scan/releases',
      releaseNotes: data.body || '',
      publishedAt: data.published_at,
      matchedAsset,
      allAssets: assets,
    };
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error('انتهت مهلة الاتصال بالخادم. يرجى التحقق من اتصالك بالإنترنت.');
    }
    throw new Error(err.message || 'تعذر الاتصال بـ GitHub للتحقق من التحديثات.');
  }
}
