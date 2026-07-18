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
