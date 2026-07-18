// src/services/webAiConfig.ts
// Web 端 AI 主题配置（localStorage）。Electron 在"桌面设置"里配 key（走 electron store）；web 无桌面设置，
// 故独立存这里，供 AppearanceSettingsSubview 的 web AI 段与 src/services/gemini.ts 共用。
// 用户自带 key，请求经 SWA 无密钥中继（swa-api/）。不含"系统代理"项：浏览器（尤其 OBS 内）无法走系统代理。

export type WebAiProvider = 'gemini' | 'openai';

export interface WebAiConfig {
    provider: WebAiProvider;
    geminiApiKey: string;
    openaiApiKey: string;
    openaiApiUrl: string;
    openaiApiModel: string;
}

const KEYS = {
    provider: 'web_ai_provider',
    geminiApiKey: 'web_gemini_api_key',
    openaiApiKey: 'web_openai_api_key',
    openaiApiUrl: 'web_openai_api_url',
    openaiApiModel: 'web_openai_api_model',
} as const;

const EMPTY: WebAiConfig = {
    provider: 'gemini',
    geminiApiKey: '',
    openaiApiKey: '',
    openaiApiUrl: '',
    openaiApiModel: '',
};

export function getWebAiConfig(): WebAiConfig {
    if (typeof window === 'undefined') return { ...EMPTY };
    return {
        provider: localStorage.getItem(KEYS.provider) === 'openai' ? 'openai' : 'gemini',
        geminiApiKey: localStorage.getItem(KEYS.geminiApiKey) || '',
        openaiApiKey: localStorage.getItem(KEYS.openaiApiKey) || '',
        openaiApiUrl: localStorage.getItem(KEYS.openaiApiUrl) || '',
        openaiApiModel: localStorage.getItem(KEYS.openaiApiModel) || '',
    };
}

export function setWebAiConfig(patch: Partial<WebAiConfig>): void {
    if (typeof window === 'undefined') return;
    if (patch.provider !== undefined) localStorage.setItem(KEYS.provider, patch.provider);
    if (patch.geminiApiKey !== undefined) localStorage.setItem(KEYS.geminiApiKey, patch.geminiApiKey);
    if (patch.openaiApiKey !== undefined) localStorage.setItem(KEYS.openaiApiKey, patch.openaiApiKey);
    if (patch.openaiApiUrl !== undefined) localStorage.setItem(KEYS.openaiApiUrl, patch.openaiApiUrl);
    if (patch.openaiApiModel !== undefined) localStorage.setItem(KEYS.openaiApiModel, patch.openaiApiModel);
}
