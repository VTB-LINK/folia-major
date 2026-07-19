import { useEffect, useRef, useState } from 'react';
import type { DualTheme } from '../types';
import type { WebLyricSourceState } from '../types/webLyricSource';
import { generateObsThemeFromLyrics, type ObsAiConfig } from '../services/gemini';

// Dynamic·AI web OBS overlay (obs-endpoint-enhance): regenerate an AI DualTheme once per song from
// the lyrics the source provides. Returns null until (and unless) one is generated, so the overlay
// shows the cover-derived builtin theme meanwhile and on any failure. Runs in the OBS browser
// context, so it never touches the app's localStorage/cache: a replayed song regenerates, and the
// AI key (if any) comes from the caller (parsed off the URL), not webAiConfig.
export function useObsAiTheme(params: {
  enabled: boolean;
  aiConfig: ObsAiConfig | null;
  state: WebLyricSourceState;
}): DualTheme | null {
  const { enabled, aiConfig, state } = params;
  const [aiTheme, setAiTheme] = useState<DualTheme | null>(null);
  // The song this hook has already kicked a generation for; also the reset key on song change.
  const generatedForRef = useRef<string>('');

  const track = state.track;
  const trackName = track?.name;
  const trackKey = track ? `${track.name} ${track.artist}` : '';
  const lyricsText = (state.lyrics?.lines ?? []).map((line) => line.fullText).join('\n').trim();

  useEffect(() => {
    if (!enabled || !aiConfig || !trackKey) {
      setAiTheme(null);
      generatedForRef.current = '';
      return;
    }
    // Already handled this song: keep its AI theme, don't regenerate on later lyric/cover updates.
    if (generatedForRef.current === trackKey) return;
    // New / not-yet-generated song: drop any prior AI theme so the cover builtin shows meanwhile.
    setAiTheme(null);
    if (!lyricsText) return; // lyrics not in yet — wait (this effect re-runs when they arrive)

    // Debounce on lyric settle: lyricsText is a dependency, so each update reschedules; the request
    // fires ~1s after lyrics stop changing, avoiding generating from a previous song's stale lyrics.
    const controller = new AbortController();
    let cancelled = false;
    const timer = setTimeout(() => {
      generatedForRef.current = trackKey;
      void generateObsThemeFromLyrics(
        lyricsText,
        trackName ? { songTitle: trackName } : undefined,
        aiConfig,
        controller.signal,
      )
        .then((theme) => { if (!cancelled) setAiTheme(theme); })
        .catch(() => { /* keep null -> cover builtin fallback */ });
    }, 1000);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [enabled, aiConfig, trackKey, trackName, lyricsText]);

  return aiTheme;
}
