import React, { useEffect, useState } from 'react';
import { AlertTriangle, ChevronDown, Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import ThemedDialog from '../../shared/ThemedDialog';
import type { ImportChange, ImportGroup, ImportPlan } from '../../../utils/appearanceImportPlan';

// src/components/modal/settings/ImportConfirmDialog.tsx
// What an imported config would change, before it is applied. Selection is per group rather than per
// field: a config carries thirty-odd fields and nobody reads thirty checkboxes, while the groups map
// onto how the settings are presented anyway.
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

const ImportConfirmDialog: React.FC<ImportConfirmDialogProps> = ({
    isOpen, plan, isDaylight, onCancel, onConfirm,
}) => {
    const { t } = useTranslation();
    const [selected, setSelected] = useState<Set<ImportGroup>>(new Set());
    const [expanded, setExpanded] = useState<Set<ImportGroup>>(new Set());

    // Everything starts accepted: the dialog is a chance to opt out, not a setup step.
    useEffect(() => {
        if (!isOpen || !plan) return;
        setSelected(new Set(plan.groups));
        setExpanded(new Set());
    }, [isOpen, plan]);

    if (!plan) return null;

    const toggle = (group: ImportGroup, next: Set<ImportGroup>, setter: (s: Set<ImportGroup>) => void) => {
        const updated = new Set(next);
        if (updated.has(group)) updated.delete(group); else updated.add(group);
        setter(updated);
    };

    const rowClass = isDaylight
        ? 'border-zinc-900/10 bg-zinc-900/[0.03]'
        : 'border-white/10 bg-white/[0.04]';
    const mutedColor = isDaylight ? 'text-zinc-500' : 'text-zinc-400';

    const describe = (change: ImportChange) => {
        if (change.derived) return t(DERIVED_LABEL_KEYS[change.key] ?? change.key);
        return change.key;
    };

    return (
        <ThemedDialog
            isOpen={isOpen}
            onClose={onCancel}
            isDaylight={isDaylight}
            title={t('options.importConfirmTitle')}
            description={t('options.importConfirmDesc')}
            maxWidthClass="max-w-lg"
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
            <div className="max-h-[340px] space-y-2 overflow-y-auto pr-1 custom-scrollbar">
                {plan.groups.map((group) => {
                    const changes = plan.changes.filter(c => c.group === group);
                    const derived = changes.filter(c => c.derived);
                    const plain = changes.filter(c => !c.derived);
                    const isOn = selected.has(group);
                    const isOpenGroup = expanded.has(group);

                    return (
                        <div key={group} className={`rounded-2xl border px-4 py-3 ${rowClass}`}>
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
                                    <span>{describe(change)}</span>
                                </div>
                            ))}

                            {plain.some(c => c.note === 'fontUnavailable') && (
                                <div className={`mt-2 flex items-start gap-2 rounded-xl px-3 py-2 text-xs ${isDaylight ? 'bg-zinc-900/5 text-zinc-500' : 'bg-white/5 text-zinc-400'}`}>
                                    <Info size={13} className="mt-0.5 shrink-0" />
                                    <span>{t('options.importFontUnavailable')}</span>
                                </div>
                            )}

                            {isOpenGroup && plain.length > 0 && (
                                <ul className={`mt-2 space-y-1 text-xs ${mutedColor}`}>
                                    {plain.map(change => (
                                        <li key={change.key} className="font-mono">{describe(change)}</li>
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
