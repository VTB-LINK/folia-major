import { DualTheme } from "../types";
import { applyStoredAnimationIntensityToDualTheme } from "./themePreferences";
import { sanitizeDualTheme } from "./themeSanitizer";
import { getWebAiConfig } from "./webAiConfig";

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error ?? '');
};

export const isMissingAiApiKeyError = (error: unknown) => {
  const message = getErrorMessage(error);
  return /(?:openai_api_key|gemini_api_key|api key)/i.test(message)
    && /(?:not configured|missing|configure)/i.test(message);
};

export const generateThemeFromLyrics = async (
  lyricsText: string,
  options?: { isPureMusic?: boolean; songTitle?: string }
): Promise<DualTheme> => {
  try {
    // Check if running in Electron environment
    if ((window as any).electron && typeof (window as any).electron.generateTheme === 'function') {
      const dualTheme = await (window as any).electron.generateTheme(lyricsText, options);
      return sanitizeDualTheme(dualTheme);
    }

    // Web：用户自带 key（存于 webAiConfig），随请求走 SWA 无密钥中继（swa-api/）。
    const webAi = getWebAiConfig();
    const provider = webAi.provider;
    const apiKey = provider === 'openai' ? webAi.openaiApiKey : webAi.geminiApiKey;
    if (!apiKey) {
      // 未配置 key：客户端直接抛出，交由 isMissingAiApiKeyError 捕获并回退内置主题，省一次注定失败的请求。
      throw new Error(provider === 'openai' ? 'OpenAI API key is not configured' : 'Gemini API key is not configured');
    }
    const endpoint = provider === 'openai' ? '/api/generate-theme_openai' : '/api/generate-theme';
    const requestBody = provider === 'openai'
      ? { lyricsText, ...options, apiKey, apiUrl: webAi.openaiApiUrl || undefined, apiModel: webAi.openaiApiModel || undefined }
      : { lyricsText, ...options, apiKey };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to generate theme');
    }

    const dualTheme = await response.json();
    return applyStoredAnimationIntensityToDualTheme(sanitizeDualTheme(dualTheme as DualTheme));
  } catch (error) {
    console.error("Failed to generate theme via API:", error);
    throw error;
  }
};

// AI connection carried by the web OBS overlay URL (Dynamic·AI mode). The overlay runs in a separate
// browser context and cannot read the main app's webAiConfig, so the key (if any) rides in via the URL.
export interface ObsAiConfig {
  provider: 'gemini' | 'openai';
  apiKey?: string;  // fork Azure keyless relay: supplied from the URL; server-key deploys: omitted.
  apiUrl?: string;
  apiModel?: string;
}

// OBS-overlay variant of generateThemeFromLyrics: unlike the main-window path it never reads
// webAiConfig and does NOT require a key up front — on a server-key deploy (upstream CF/Vercel) the
// endpoint uses its own env key and ignores the (absent) body key; on the fork's keyless relay the
// key must be present (from the URL) or the server returns an error (caller falls back to builtin).
export const generateObsThemeFromLyrics = async (
  lyricsText: string,
  options: { isPureMusic?: boolean; songTitle?: string } | undefined,
  aiConfig: ObsAiConfig,
  signal?: AbortSignal,
): Promise<DualTheme> => {
  const endpoint = aiConfig.provider === 'openai' ? '/api/generate-theme_openai' : '/api/generate-theme';
  const requestBody: Record<string, unknown> = { lyricsText, ...(options ?? {}) };
  if (aiConfig.apiKey) requestBody.apiKey = aiConfig.apiKey;
  if (aiConfig.provider === 'openai') {
    if (aiConfig.apiUrl) requestBody.apiUrl = aiConfig.apiUrl;
    if (aiConfig.apiModel) requestBody.apiModel = aiConfig.apiModel;
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
    signal,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error((errorData as { error?: string }).error || 'Failed to generate theme');
  }

  const dualTheme = await response.json();
  return applyStoredAnimationIntensityToDualTheme(sanitizeDualTheme(dualTheme as DualTheme));
};
