import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, ChevronDown, Info, Minus, Undo2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import ThemedDialog from '../../shared/ThemedDialog';
import { getVisualizerModeLabel, hasVisualizerMode } from '../../visualizer/registry';
import { getVisualizerBackgroundModeLabel, hasVisualizerBackgroundMode } from '../../visualizer/backgrounds/registry';
import { THEME_DARK_KEY, THEME_LIGHT_KEY, type ImportChange, type ImportGroup, type ImportPlan } from '../../../utils/appearanceImportPlan';

// src/components/modal/settings/ImportConfirmDialog.tsx
// What an imported config would change, before it is applied, chosen field by field. Rows spell out
// their own before -> after so the choice is made on values rather than on field names, and a
// declined row shows what it keeps instead of what it would have become.
//
// Derived rows are the reason this dialog exists. They are changes the config never asked for --
// unpinning a custom theme, discarding an uploaded font -- so they are always shown, never folded
// into a collapsed list.

interface ImportConfirmDialogProps {
    isOpen: boolean;
    plan: ImportPlan | null;
    isDaylight: boolean;
    onCancel: () => void;
    onConfirm: (keys: string[]) => void;
}

const GROUP_LABEL_KEYS: Record<ImportGroup, string> = {
    theme: 'options.importGroupTheme',
    visualizer: 'options.importGroupVisualizer',
    fonts: 'options.importGroupFonts',
    background: 'options.importGroupBackground',
    songTheme: 'options.importGroupSongTheme',
};

const DERIVED_LABEL_KEYS: Record<string, string> = {
    isCustomThemePreferred: 'options.importDerivedUnpin',
    uploadedLyricsFont: 'options.importDerivedUploadedFont',
};

// Field names that already have a label elsewhere in settings are reused as-is; the rest get one.
const FIELD_LABEL_KEYS: Record<string, string> = {
    [THEME_LIGHT_KEY]: 'options.importFieldThemeLight',
    [THEME_DARK_KEY]: 'options.importFieldThemeDark',
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

// A single theme side, as split out by the plan.
const isThemeSide = (value: unknown): value is {
    name?: string;
    backgroundColor?: string;
    primaryColor?: string;
    accentColor?: string;
    secondaryColor?: string;
} => Boolean(value) && typeof value === 'object' && 'backgroundColor' in (value as object);

const ImportConfirmDialog: React.FC<ImportConfirmDialogProps> = ({
    isOpen, plan, isDaylight, onCancel, onConfirm,
}) => {
    const { t } = useTranslation();
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

    const selectableKeys = useMemo(
        () => (plan?.changes ?? []).filter(c => !c.derived).map(c => c.key),
        [plan],
    );

    // Everything starts accepted; the unchanged section starts closed since it is reference only.
    useEffect(() => {
        if (!isOpen || !plan) return;
        setSelected(new Set(selectableKeys));
        setCollapsed(new Set(['__unchanged']));
    }, [isOpen, plan, selectableKeys]);

    if (!plan) return null;

    const toggleKey = (key: string) => {
        const next = new Set(selected);
        if (next.has(key)) next.delete(key); else next.add(key);
        setSelected(next);
    };

    const toggleCollapse = (id: string) => {
        const next = new Set(collapsed);
        if (next.has(id)) next.delete(id); else next.add(id);
        setCollapsed(next);
    };

    const rowClass = isDaylight ? 'border-zinc-900/10 bg-zinc-900/[0.03]' : 'border-white/10 bg-white/[0.04]';
    const mutedColor = isDaylight ? 'text-zinc-500' : 'text-zinc-400';
    // Neutral rather than a status colour: checking a row is a choice, not a success.
    const checkedFill = isDaylight ? '#52525b' : '#71717a';
    const uncheckedBorder = isDaylight ? 'border-zinc-900/25' : 'border-white/25';

    const Box: React.FC<{ state: 'on' | 'off' | 'partial' | 'locked'; onClick?: () => void; }> = ({ state, onClick }) => (
        <button
            type="button"
            onClick={onClick}
            disabled={state === 'locked'}
            aria-pressed={state === 'on'}
            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
                state === 'off' ? `${uncheckedBorder} bg-transparent`
                    : state === 'locked' ? `${uncheckedBorder} opacity-40 cursor-default`
                        : 'border-transparent'
            }`}
            style={state === 'on' || state === 'partial' ? { backgroundColor: checkedFill } : undefined}
        >
            {state === 'partial' && <Minus size={13} className="text-white" />}
            {(state === 'on' || state === 'locked') && <Check size={13} className={state === 'locked' ? mutedColor : 'text-white'} />}
        </button>
    );

    const fieldLabel = (change: ImportChange) => {
        const mode = TUNING_MODES[change.key];
        if (mode) return t('options.importFieldTuningOf', { name: getVisualizerModeLabel(mode as never, k => t(k)) });
        const key = FIELD_LABEL_KEYS[change.key];
        return key ? t(key) : change.key;
    };

    const renderValue = (value: unknown, dimmed: boolean, key?: string) => {
        const cls = `text-xs ${dimmed ? `${mutedColor} line-through` : ''}`;

        // Theme sides are usually named after the preset they were seeded from, so the names would
        // read as an identical pair while the colours are what actually differ.
        if (isThemeSide(value)) {
            // Every colour that renders, so a difference is never hidden behind an identical accent.
            const swatches: Array<[string, string | undefined]> = [
                ['background', value.backgroundColor],
                ['primary', value.primaryColor],
                ['accent', value.accentColor],
                ['secondary', value.secondaryColor],
            ];
            return (
                <span className={`inline-flex items-center gap-1 ${dimmed ? mutedColor : ''}`}>
                    {swatches.map(([name, color]) => (
                        <span
                            key={name}
                            title={`${name} ${color ?? ''}`}
                            className={`h-3.5 w-3.5 rounded-sm border border-white/20 ${dimmed ? 'opacity-40' : ''}`}
                            style={{ backgroundColor: color }}
                        />
                    ))}
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

    const changeRow = (change: ImportChange) => {
        const on = selected.has(change.key);
        return (
            <li key={change.key} className="flex items-center gap-2 text-xs">
                <Box state={on ? 'on' : 'off'} onClick={() => toggleKey(change.key)} />
                <span className={`min-w-0 flex-1 truncate ${mutedColor}`}>{fieldLabel(change)}</span>
                {renderValue(change.from, false, change.key)}
                {on
                    ? <span className={`shrink-0 ${mutedColor}`}>→</span>
                    : <Undo2 size={12} className={`shrink-0 ${mutedColor}`} aria-label={t('options.importSkipped')} />}
                {renderValue(change.to, !on, change.key)}
            </li>
        );
    };

    const unchangedByGroup = plan.unchanged.reduce<Record<string, ImportChange[]>>((acc, change) => {
        (acc[change.group] ??= []).push(change);
        return acc;
    }, {});

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
            <div className="max-h-[400px] space-y-2 overflow-y-auto pr-1 custom-scrollbar">
                {plan.groups.map((group) => {
                    const changes = plan.changes.filter(c => c.group === group);
                    const derived = changes.filter(c => c.derived);
                    const plain = changes.filter(c => !c.derived);
                    const picked = plain.filter(c => selected.has(c.key)).length;
                    const groupState = picked === 0 ? 'off' : picked === plain.length ? 'on' : 'partial';
                    const isOpen = !collapsed.has(group);

                    return (
                        <div key={group} className={`rounded-2xl border px-4 py-3 ${rowClass}`}>
                            <div className="flex items-center gap-3">
                                <Box
                                    state={groupState}
                                    onClick={() => {
                                        const next = new Set(selected);
                                        if (groupState === 'on') plain.forEach(c => next.delete(c.key));
                                        else plain.forEach(c => next.add(c.key));
                                        setSelected(next);
                                    }}
                                />
                                <span className="text-sm font-medium">{t(GROUP_LABEL_KEYS[group])}</span>
                                <button
                                    type="button"
                                    onClick={() => toggleCollapse(group)}
                                    className={`ml-auto flex items-center gap-1 text-xs ${mutedColor} transition-opacity hover:opacity-100`}
                                >
                                    {t('options.importChangeCount', { count: changes.length })}
                                    <ChevronDown size={13} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                                </button>
                            </div>

                            {/* Always visible: these are the changes the config did not ask for. */}
                            {derived.map(change => (
                                <div key={change.key} className="mt-2 flex items-start gap-2 rounded-xl bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
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

                            {isOpen && plain.length > 0 && <ul className="mt-2 space-y-1.5">{plain.map(changeRow)}</ul>}
                        </div>
                    );
                })}

                {plan.unchanged.length > 0 && (
                    <div className={`rounded-2xl border px-4 py-3 ${rowClass} opacity-70`}>
                        <button
                            type="button"
                            onClick={() => toggleCollapse('__unchanged')}
                            className="flex w-full items-center gap-3"
                        >
                            <Box state="locked" />
                            <span className="text-sm font-medium">{t('options.importUnchanged')}</span>
                            <span className={`ml-auto flex items-center gap-1 text-xs ${mutedColor}`}>
                                {t('options.importChangeCount', { count: plan.unchanged.length })}
                                <ChevronDown size={13} className={`transition-transform ${collapsed.has('__unchanged') ? '' : 'rotate-180'}`} />
                            </span>
                        </button>

                        {!collapsed.has('__unchanged') && (
                            <div className="mt-2 space-y-2">
                                {Object.entries(unchangedByGroup).map(([group, rows]) => (
                                    <div key={group}>
                                        <div className={`text-[11px] ${mutedColor}`}>{t(GROUP_LABEL_KEYS[group as ImportGroup])}</div>
                                        <ul className="mt-1 space-y-1.5">
                                            {rows.map(change => (
                                                <li key={change.key} className="flex items-center gap-2 text-xs">
                                                    <span className={`min-w-0 flex-1 truncate ${mutedColor}`}>{fieldLabel(change)}</span>
                                                    {/* Identical on both sides, so one value says it. */}
                                                    {renderValue(change.from, false, change.key)}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </ThemedDialog>
    );
};

export default ImportConfirmDialog;
