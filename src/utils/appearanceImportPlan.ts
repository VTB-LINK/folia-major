import {
    resolveSongThemeAutoGenerateChange,
    resolveSongThemeAutoSwitchChange,
    type ThemePreferenceSwitchState,
} from '../services/themePreferences';

// src/utils/appearanceImportPlan.ts
// What an imported config would actually change, computed before anything is applied. Pure: the
// caller passes the incoming config and a snapshot of the current one, both in the shape
// decompressConfig/buildVisualSettingsConfig already speak, so the diff is a field-by-field compare.
//
// The point of doing this up front is the derived changes. The three song-theme switches are
// mutually exclusive by construction (see themePreferences resolvers), so accepting an incoming
// auto-switch value can also flip "prefer custom theme" — a setting that is not in the config at
// all and would otherwise change with no warning.

export type ImportGroup = 'theme' | 'visualizer' | 'fonts' | 'background' | 'songTheme';

export const IMPORT_GROUPS: ImportGroup[] = ['theme', 'visualizer', 'fonts', 'background', 'songTheme'];

export interface ImportChange {
    group: ImportGroup;
    // Config field name, or the state field for a derived change.
    key: string;
    from: unknown;
    to: unknown;
    // True when the config never mentioned this field and the change follows from a resolver rule.
    derived?: boolean;
    // Informational, does not block the row: the incoming font is not installed here, so it will be
    // accepted but render through the fallback stack.
    note?: 'fontUnavailable';
}

export interface ImportPlan {
    changes: ImportChange[];
    // Groups with at least one change, in display order.
    groups: ImportGroup[];
}

// Every config field the import path actually applies, mapped to the group it is presented under.
// Fields the codec round-trips but the import path does not apply are deliberately absent, so the
// plan can never promise a change that will not happen.
const FIELD_GROUPS: Record<string, ImportGroup> = {
    visualizerMode: 'visualizer',
    randomVisualizerModePerSong: 'visualizer',
    visualizerOpacity: 'visualizer',
    hidePlayerTranslationSubtitle: 'visualizer',
    showSubtitleTranslation: 'visualizer',
    subtitleOverlayBackground: 'visualizer',
    visualizerTunings: 'visualizer',
    classicTuning: 'visualizer',
    cadenzaTuning: 'visualizer',
    partitaTuning: 'visualizer',
    fumeTuning: 'visualizer',
    claddaghTuning: 'visualizer',
    cappellaTuning: 'visualizer',
    tiltTuning: 'visualizer',
    dioramaTuning: 'visualizer',
    monetTuning: 'visualizer',

    lyricsFontStyle: 'fonts',
    lyricsFontScale: 'fonts',
    lyricsFontFallbackFamilies: 'fonts',
    lyricsCustomFontFamily: 'fonts',
    subtitleFontInheritsLyrics: 'fonts',
    subtitleFontStyle: 'fonts',
    subtitleFontFamily: 'fonts',
    subtitleFontFallbackFamilies: 'fonts',

    visualizerBackgroundMode: 'background',
    backgroundOpacity: 'background',
    monetBackgroundTuning: 'background',
    nomandBackgroundTuning: 'background',
    latentBackgroundTuning: 'background',
    urlBackgroundList: 'background',
    urlBackgroundSelectedId: 'background',

    songThemeAutoSwitchEnabled: 'songTheme',
    songThemeAutoGenerateEnabled: 'songTheme',
};

// Per-renderer tunings the import skips whenever the visualizerTunings bundle is present. The three
// background tunings are not in this set: they are applied unconditionally.
const BUNDLED_TUNING_FIELDS = new Set([
    'classicTuning',
    'cadenzaTuning',
    'partitaTuning',
    'fumeTuning',
    'claddaghTuning',
    'cappellaTuning',
    'tiltTuning',
    'dioramaTuning',
    'monetTuning',
]);

// Structural compare over the plain JSON the codec emits — enough for tunings and font arrays, and
// it keeps the module dependency-free.
const isSameValue = (a: unknown, b: unknown): boolean => {
    if (a === b) return true;
    if (a === undefined || b === undefined || a === null || b === null) return false;
    if (typeof a !== 'object' || typeof b !== 'object') return false;
    try {
        return JSON.stringify(a) === JSON.stringify(b);
    } catch {
        return false;
    }
};

export interface ImportPlanInput {
    // decompressConfig output.
    incoming: Record<string, unknown>;
    // Same field names, read from the live settings (buildVisualSettingsConfig plus the theme).
    current: Record<string, unknown>;
    // Drives the derived song-theme changes; isCustomThemePreferred is not a config field.
    switches: ThemePreferenceSwitchState;
    // Only a system font family is portable, so an uploaded font is never in the config — but
    // accepting a family replaces it and deletes the stored file. Pass the current source so that
    // loss can be shown rather than discovered afterwards.
    customFontSource?: 'system' | 'uploaded' | null;
    // What the user sees named in the font picker. An uploaded font exports as null, so without this
    // the row would claim the user currently has no font at all.
    customFontLabel?: string | null;
    // From isFontFamilyAvailable. Undefined means it was not measured, which stays quiet.
    incomingFontAvailable?: boolean;
}

export function buildImportPlan({
    incoming,
    current,
    switches,
    customFontSource,
    customFontLabel,
    incomingFontAvailable,
}: ImportPlanInput): ImportPlan {
    const changes: ImportChange[] = [];

    // The theme is applied whole (save + apply), so it is one change rather than a per-colour diff.
    if (incoming.theme) {
        changes.push({ group: 'theme', key: 'theme', from: current.theme ?? null, to: incoming.theme });
    }

    // The import applies the per-renderer tunings only when the bundle is absent, so listing them
    // alongside a bundle would promise changes that never happen.
    const bundled = incoming.visualizerTunings !== undefined;

    for (const [key, group] of Object.entries(FIELD_GROUPS)) {
        if (incoming[key] === undefined) continue;
        if (bundled && BUNDLED_TUNING_FIELDS.has(key)) continue;

        // The font row names what the picker shows, which for an uploaded font is not in `current`
        // at all — reporting "none -> X" there would contradict the screen.
        if (key === 'lyricsCustomFontFamily') {
            const from = customFontLabel ?? (current[key] as string | null | undefined) ?? null;
            if (isSameValue(incoming[key], from)) continue;
            const change: ImportChange = { group, key, from, to: incoming[key] };
            if (incomingFontAvailable === false) change.note = 'fontUnavailable';
            changes.push(change);
            continue;
        }

        if (isSameValue(incoming[key], current[key])) continue;
        changes.push({ group, key, from: current[key], to: incoming[key] });
    }

    // Derived: taking a system font family evicts an uploaded one, and the stored file is deleted
    // with it. The config cannot carry an uploaded font, so this loss is invisible in the diff above.
    if (incoming.lyricsCustomFontFamily && customFontSource === 'uploaded') {
        changes.push({
            group: 'fonts',
            key: 'uploadedLyricsFont',
            from: true,
            to: false,
            derived: true,
        });
    }

    // Derived: replay the resolvers in the order the import applies them, threading the state so the
    // second resolver sees the first one's result — the same composition the theme controller uses.
    const wantsSwitch = incoming.songThemeAutoSwitchEnabled;
    const wantsGenerate = incoming.songThemeAutoGenerateEnabled;
    if (wantsSwitch !== undefined || wantsGenerate !== undefined) {
        let next = switches;
        if (wantsSwitch !== undefined) next = resolveSongThemeAutoSwitchChange(next, Boolean(wantsSwitch));
        if (wantsGenerate !== undefined) next = resolveSongThemeAutoGenerateChange(next, Boolean(wantsGenerate));
        if (next.isCustomThemePreferred !== switches.isCustomThemePreferred) {
            changes.push({
                group: 'songTheme',
                key: 'isCustomThemePreferred',
                from: switches.isCustomThemePreferred,
                to: next.isCustomThemePreferred,
                derived: true,
            });
        }
    }

    const present = new Set(changes.map(c => c.group));
    return { changes, groups: IMPORT_GROUPS.filter(g => present.has(g)) };
}
