import React, { useEffect, useState } from 'react';
import { AlertTriangle, ChevronDown, Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import ThemedDialog from '../../shared/ThemedDialog';
import { getVisualizerModeLabel, hasVisualizerMode } from '../../visualizer/registry';
import { getVisualizerBackgroundModeLabel, hasVisualizerBackgroundMode } from '../../visualizer/backgrounds/registry';
import type { ImportChange, ImportGroup, ImportPlan } from '../../../utils/appearanceImportPlan';

// src/components/modal/settings/ImportConfirmDialog.tsx
// What an imported config would change, before it is applied. Selection is per group rather than per
// field: a config carries thirty-odd fields and nobody reads thirty checkboxes, while the groups map
// onto how the settings are presented anyway. Each row still spells out its own before -> after, so
// the choice is made on values rather than on field names.
//
// Derived rows are the reason this dialog exists. They are changes the config never asked for --
// unpinning a custom theme, discarding an uploaded font -- so they are always shown, never folded
// into a collapsed list.

interface ImportConfirmDialogProps {
    isOpen: boolean;
    plan: ImportPlan | null;
    isDaylight: boolean;
    onCancel: () => void;
    onConfirm: (groups: ImportGroup[]) => void;
}

const GROUP_LABEL_KEYS: Record<ImportGroup, string> = {
    theme: 'options.importGroupTheme',
    visualizer: 'options.importGroupVisualizer',
    fonts: 'options.importGroupFonts',
    background: 'options.importGroupBackground',
    songTheme: 'options.importGroupSongTheme',
};

// Derived changes read as prose, not as a from/to pair — the point is the consequence.
const DERIVED_LABEL_KEYS: Record<string, string> = {
    isCustomThemePreferred: 'options.importDerivedUnpin',
    uploadedLyricsFont: 'options.importDerivedUploadedFont',
};

// Field names that already have a label elsewhere in settings are reused as-is; the rest get one.
const FIELD_LABEL_KEYS: Record<string, string> = {
    theme: 'options.importGroupTheme',
    visualizerMode: 'options.visualizerMode',
    visualizerOpacity: 'options.visualizerOpacity',
    hidePlayerTranslationSubtitle: 'options.hidePlayerTranslationSubtitle',
    showSubtitleTranslation: 'options.showSubtitleTranslation',
    subtitleOverlayBackground: 'options.subtitleOverlayBackground',
    subtitleFontInheritsLyrics: 'options.subtitleFontInheritsLyrics',
    subtitleFontFamily: 'options.subtitleFontFamily',
    visualizerBackgroundMode: 'options.visualizerBackgroundMode',
    backgroundOpacity: 'options.backgroundOpacity',
    lyricsCustomFontFamily: 'options.customFont',
    songThemeAutoSwitchEnabled: 'options.autoSwitchSongTheme',
    songThemeAutoGenerateEnabled: 'options.autoGenerateSongTheme',
    randomVisualizerModePerSong: 'options.importFieldRandomMode',
    lyricsFontStyle: 'options.importFieldLyricsFontStyle',
    lyricsFontScale: 'options.importFieldLyricsFontScale',
    lyricsFontFallbackFamilies: 'options.importFieldLyricsFallback',
    subtitleFontStyle: 'options.importFieldSubtitleFontStyle',
    subtitleFontFallbackFamilies: 'options.importFieldSubtitleFallback',
    urlBackgroundList: 'options.importFieldUrlBackgroundList',
    urlBackgroundSelectedId: 'options.importFieldUrlBackgroundSelected',
    visualizerTunings: 'options.importFieldVisualizerTunings',
    monetBackgroundTuning: 'options.importFieldMonetBackgroundTuning',
    nomandBackgroundTuning: 'options.importFieldNomandBackgroundTuning',
    latentBackgroundTuning: 'options.importFieldLatentBackgroundTuning',
};

// The per-renderer tunings borrow the renderer's own display name instead of inventing one.
const TUNING_MODES: Record<string, string> = {
    classicTuning: 'classic',
    cadenzaTuning: 'cadenza',
    partitaTuning: 'partita',
    fumeTuning: 'fume',
    claddaghTuning: 'claddagh',
    cappellaTuning: 'cappella',
    tiltTuning: 'tilt',
    dioramaTuning: 'diorama',
    monetTuning: 'monet',
};

const isHexColor = (value: unknown): value is string =>
    typeof value === 'string' && /^#[0-9a-f]{3,8}$/i.test(value.trim());

const isDualTheme = (value: unknown): value is { light?: { name?: string; accentColor?: string; }; dark?: { name?: string; accentColor?: string; }; } =>
    Boolean(value) && typeof value === 'object' && 'light' in (value as object) && 'dark' in (value as object);

const ImportConfirmDialog: React.FC<ImportConfirmDialogProps> = ({
    isOpen, plan, isDaylight, onCancel, onConfirm,
}) => {
    const { t } = useTranslation();
    const [selected, setSelected] = useState<Set<ImportGroup>>(new Set());
    const [expanded, setExpanded] = useState<Set<ImportGroup>>(new Set());

    // Everything starts accepted, and every group starts open: the dialog exists to be read.
    useEffect(() => {
        if (!isOpen || !plan) return;
        setSelected(new Set(plan.groups));
        setExpanded(new Set(plan.groups));
    }, [isOpen, plan]);

    if (!plan) return null;

    const toggle = (group: ImportGroup, from: Set<ImportGroup>, setter: (s: Set<ImportGroup>) => void) => {
        const updated = new Set(from);
        if (updated.has(group)) updated.delete(group); else updated.add(group);
        setter(updated);
    };

    const rowClass = isDaylight ? 'border-zinc-900/10 bg-zinc-900/[0.03]' : 'border-white/10 bg-white/[0.04]';
    const mutedColor = isDaylight ? 'text-zinc-500' : 'text-zinc-400';

    const fieldLabel = (change: ImportChange) => {
        const mode = TUNING_MODES[change.key];
        if (mode) {
            return t('options.importFieldTuningOf', { name: getVisualizerModeLabel(mode as never, key => t(key)) });
        }
        const key = FIELD_LABEL_KEYS[change.key];
        return key ? t(key) : change.key;
    };

    // Values are rendered, not stringified: a colour shows as a swatch, a switch as on/off, and a
    // mode id shows the name the settings use for it.
    const renderValue = (value: unknown, dimmed: boolean, key?: string) => {
        const cls = `text-xs ${dimmed ? `${mutedColor} line-through` : ''}`;

        // Both sides of a theme are usually named after the preset they were seeded from, so the
        // names alone would read as an identical pair. The accents are what actually differ.
        if (isDualTheme(value)) {
            return (
                <span className={`inline-flex items-center gap-1 ${cls}`}>
                    <span className="h-3 w-3 rounded-sm border border-white/20" style={{ backgroundColor: value.light?.accentColor }} />
                    <span className="font-mono text-[11px]">{value.light?.accentColor}</span>
                    <span className="h-3 w-3 rounded-sm border border-white/20" style={{ backgroundColor: value.dark?.accentColor }} />
                    <span className="font-mono text-[11px]">{value.dark?.accentColor}</span>
                </span>
            );
        }
        if (key === 'visualizerMode' && typeof value === 'string' && hasVisualizerMode(value)) {
            return <span className={cls}>{getVisualizerModeLabel(value, k => t(k))}</span>;
        }
        if (key === 'visualizerBackgroundMode' && typeof value === 'string' && hasVisualizerBackgroundMode(value)) {
            return <span className={cls}>{getVisualizerBackgroundModeLabel(value, k => t(k))}</span>;
        }
        if (isHexColor(value)) {
            return (
                <span className={`inline-flex items-center gap-1 ${cls}`}>
                    <span className="h-3 w-3 rounded-sm border border-white/20" style={{ backgroundColor: value }} />
                    <span className="font-mono">{value}</span>
                </span>
            );
        }
        if (typeof value === 'boolean') return <span className={cls}>{t(value ? 'options.importValueOn' : 'options.importValueOff')}</span>;
        if (value === null || value === undefined || value === '') return <span className={`${cls} opacity-60`}>{t('options.importValueNone')}</span>;
        if (Array.isArray(value)) return <span className={cls}>{t('options.importValueCount', { count: value.length })}</span>;
        if (typeof value === 'object') return <span className={cls}>{t('options.importValueAdjusted')}</span>;
        return <span className={cls}>{String(value)}</span>;
    };

    return (
        <ThemedDialog
            isOpen={isOpen}
            onClose={onCancel}
            isDaylight={isDaylight}
            title={t('options.importConfirmTitle')}
            description={t('options.importConfirmDesc')}
            maxWidthClass="max-w-xl"
            footer={(
                <>
                    <button
                        type="button"
                        onClick={onCancel}
                        className={`rounded-xl px-4 py-2 text-sm font-medium transition-colors ${isDaylight ? 'hover:bg-zinc-200/60' : 'hover:bg-white/10'}`}
                    >
                        {t('status.cancel')}
                    </button>
                    <button
                        type="button"
                        onClick={() => onConfirm([...selected])}
                        disabled={selected.size === 0}
                        className="rounded-xl bg-white/15 px-4 py-2 text-sm font-semibold transition-colors hover:bg-white/25 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        {t('options.importApplySelected')}
                    </button>
                </>
            )}
        >
            <div className="max-h-[380px] space-y-2 overflow-y-auto pr-1 custom-scrollbar">
                {plan.groups.map((group) => {
                    const changes = plan.changes.filter(c => c.group === group);
                    const derived = changes.filter(c => c.derived);
                    const plain = changes.filter(c => !c.derived);
                    const isOn = selected.has(group);
                    const isOpenGroup = expanded.has(group);

                    return (
                        <div key={group} className={`rounded-2xl border px-4 py-3 ${rowClass} ${isOn ? '' : 'opacity-60'}`}>
                            <div className="flex items-center gap-3">
                                <button
                                    type="button"
                                    onClick={() => toggle(group, selected, setSelected)}
                                    className={`h-5 w-5 shrink-0 rounded-md border transition-colors ${isOn ? 'border-transparent bg-emerald-500/80' : isDaylight ? 'border-zinc-900/30' : 'border-white/30'}`}
                                    aria-pressed={isOn}
                                >
                                    {isOn && <span className="block text-center text-xs leading-5 text-white">✓</span>}
                                </button>
                                <span className="text-sm font-medium">{t(GROUP_LABEL_KEYS[group])}</span>
                                {!isOn && (
                                    <span className={`rounded-md px-1.5 py-0.5 text-[10px] ${isDaylight ? 'bg-zinc-900/10 text-zinc-500' : 'bg-white/10 text-zinc-400'}`}>
                                        {t('options.importSkipped')}
                                    </span>
                                )}
                                <button
                                    type="button"
                                    onClick={() => toggle(group, expanded, setExpanded)}
                                    className={`ml-auto flex items-center gap-1 text-xs ${mutedColor} transition-opacity hover:opacity-100`}
                                >
                                    {t('options.importChangeCount', { count: changes.length })}
                                    <ChevronDown size={13} className={`transition-transform ${isOpenGroup ? 'rotate-180' : ''}`} />
                                </button>
                            </div>

                            {/* Always visible: these are the changes the config did not ask for. */}
                            {derived.map(change => (
                                <div
                                    key={change.key}
                                    className="mt-2 flex items-start gap-2 rounded-xl bg-amber-500/10 px-3 py-2 text-xs text-amber-300"
                                >
                                    <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                                    <span>{t(DERIVED_LABEL_KEYS[change.key] ?? change.key)}</span>
                                </div>
                            ))}

                            {plain.some(c => c.note === 'fontUnavailable') && (
                                <div className={`mt-2 flex items-start gap-2 rounded-xl px-3 py-2 text-xs ${isDaylight ? 'bg-zinc-900/5 text-zinc-500' : 'bg-white/5 text-zinc-400'}`}>
                                    <Info size={13} className="mt-0.5 shrink-0" />
                                    <span>{t('options.importFontUnavailable')}</span>
                                </div>
                            )}

                            {isOpenGroup && plain.length > 0 && (
                                <ul className="mt-2 space-y-1.5">
                                    {plain.map(change => (
                                        <li key={change.key} className="flex items-center gap-2 text-xs">
                                            <span className={`min-w-0 flex-1 truncate ${mutedColor}`}>{fieldLabel(change)}</span>
                                            {renderValue(change.from, false, change.key)}
                                            <span className={`shrink-0 font-mono text-[11px] ${isOn ? mutedColor : 'text-rose-400/80'}`}>
                                                {isOn ? '→' : '─✕→'}
                                            </span>
                                            {renderValue(change.to, !isOn, change.key)}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    );
                })}
            </div>
        </ThemedDialog>
    );
};

export default ImportConfirmDialog;
