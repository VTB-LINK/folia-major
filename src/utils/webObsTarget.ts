import { useSettingsUiStore } from '../stores/useSettingsUiStore';
import { getWebAiConfig } from '../services/webAiConfig';

// src/utils/webObsTarget.ts
// Resolve which browser-direct OBS source the web stage selection targets, plus its connection
// params, for the copy-OBS-URL buttons. Kept separate from currentObsUrl/obsUrl so appearance
// components can import the selector without a cycle through the appearance codec.

export type WebObsSource = 'now-playing' | 'playercap';

// Stable module-scope selector so it can drive both a store subscription and URL building
// (null = no web stage source is on).
export function selectWebObsSource(
  s: { enableNowPlayingStage: boolean; enablePlayerCapStage: boolean },
): WebObsSource | null {
  return s.enablePlayerCapStage ? 'playercap' : s.enableNowPlayingStage ? 'now-playing' : null;
}

export interface WebObsTarget {
  source: WebObsSource;
  host: string;
  extra: Record<string, string>;
}

// The active source plus, for PlayerCap, its non-default connection params. Returns null when no
// web stage source is selected (buttons are disabled in that case).
export function resolveWebObsTarget(): WebObsTarget | null {
  const s = useSettingsUiStore.getState();
  const source = selectWebObsSource(s);
  if (!source) return null;
  const extra: Record<string, string> = {};
  // Explicit mode marker (static | builtin | ai) so the mode is readable from the URL's technical
  // params (ahead of cfg) at a glance; the overlay behaves the same whether or not it reads it.
  extra.obsTheme = s.webObsThemeMode;
  // Dynamic·AI (source-neutral): flag the overlay to regenerate per song, and — on the fork's keyless
  // relay — carry the user's own AI key so the overlay (a separate browser context that can't read
  // webAiConfig) can generate. Server-key deploys leave the key out and the endpoint uses its env key.
  // All ride in `extra` (before cfg), i.e. the leading part OBS's URL field scrolls out of view.
  if (s.webObsThemeMode === 'ai') {
    extra.aiFollow = '1';
    const ai = getWebAiConfig();
    // Provider selects the overlay's generate endpoint and must ride along even when no key is in the
    // URL (server-key deploys), or an openai deploy would be hit at the gemini endpoint and fail silently.
    extra.aiProvider = ai.provider;
    const key = ai.provider === 'openai' ? ai.openaiApiKey : ai.geminiApiKey;
    if (key) {
      extra.aiKey = key;
      if (ai.provider === 'openai') {
        if (ai.openaiApiUrl) extra.aiUrl = ai.openaiApiUrl;
        if (ai.openaiApiModel) extra.aiModel = ai.openaiApiModel;
      }
    }
  }
  if (source === 'now-playing') return { source, host: '', extra };
  // PlayerCap: omit params equal to the OBS page defaults (host localhost:8765, player '',
  // basis play_time, sticky on) so default setups produce a clean URL.
  const host = s.playerCapHost && s.playerCapHost !== 'localhost:8765' ? s.playerCapHost : '';
  if (s.playerCapPlayer) extra.nxpcPlayer = s.playerCapPlayer;
  if (s.playerCapTimeBasis === 'timestamp') extra.nxpcBasis = 'timestamp';
  if (s.playerCapSticky === false) extra.nxpcSticky = '0';
  return { source, host, extra };
}
