import React, { useState, useEffect, useRef } from 'react';
import { VirtualElement } from '../types';
import { Plus, Trash2, AlertCircle, ChevronDown } from 'lucide-react';
import { CSS_PROPERTY_VALUES, CSS_PROPERTY_NAMES, filterAndSortProperties } from '../utils/cssProperties';

interface StyleInspectorPanelProps {
    element: VirtualElement | null;
    onUpdateStyle: (styles: Partial<React.CSSProperties>) => void;
    computedStyles?: React.CSSProperties | null;
}

const StyleInspectorPanel: React.FC<StyleInspectorPanelProps> = ({
    element,
    onUpdateStyle,
    computedStyles
}) => {
    const [styles, setStyles] = useState<{ key: string; value: string }[]>([]);
    const [newPropName, setNewPropName] = useState('');
    const [newPropValue, setNewPropValue] = useState('');
    const [activeSuggestionField, setActiveSuggestionField] = useState<{ index: number, type: 'key' | 'value' } | null>(null);
    const [filteredSuggestions, setFilteredSuggestions] = useState<string[]>([]);
    const [showComputed, setShowComputed] = useState(false);

    useEffect(() => {
        if (element) {
            const styleEntries = Object.entries(element.styles || {}).map(([key, value]) => ({
                key,
                value: String(value)
            }));
            setStyles(styleEntries);
        } else {
            setStyles([]);
        }
    }, [element?.id, element?.styles]);

    const updateStyleAtIndex = (index: number, newKey: string, newValue: string) => {
        const newStyles = [...styles];
        newStyles[index] = { key: newKey, value: newValue };
        setStyles(newStyles);
        const styleObj: any = {};
        let key = newKey;
        if (key.includes('-') && !CSS_PROPERTY_VALUES[key]) {
            key = key.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
        }
        onUpdateStyle({ [key]: newValue });
    };

    const handleStyleFocus = (index: number, field: 'key' | 'value') => {
        if (field === 'value') {
            const currentStyle = styles[index];
            let propKey = currentStyle.key;
            if (propKey.includes('-')) {
                propKey = propKey.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
            }
            const suggestions = CSS_PROPERTY_VALUES[propKey] || [];
            if (suggestions.length > 0) {
                setFilteredSuggestions(suggestions);
                setActiveSuggestionField({ index, type: 'value' });
            } else {
                setActiveSuggestionField(null);
            }
        } else {
            setFilteredSuggestions(filterAndSortProperties('', 20));
            setActiveSuggestionField({ index, type: 'key' });
        }
    };

    const handleNewPropFocus = (field: 'key' | 'value') => {
        if (field === 'value') {
            let propKey = newPropName;
            if (propKey.includes('-')) propKey = propKey.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
            const suggestions = CSS_PROPERTY_VALUES[propKey] || [];
            if (suggestions.length > 0) {
                setFilteredSuggestions(suggestions);
                setActiveSuggestionField({ index: -1, type: 'value' });
            } else {
                setActiveSuggestionField(null);
            }
        } else {
            setFilteredSuggestions(filterAndSortProperties('', 20));
            setActiveSuggestionField({ index: -1, type: 'key' });
        }
    };

    const handleStyleChange = (index: number, field: 'key' | 'value', newValue: string) => {
        const currentStyle = styles[index];
        const newKey = field === 'key' ? newValue : currentStyle.key;
        const newVal = field === 'value' ? newValue : currentStyle.value;

        updateStyleAtIndex(index, newKey, newVal);

        if (field === 'value') {
            let propKey = newKey;
            if (propKey.includes('-')) propKey = propKey.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
            const suggestions = CSS_PROPERTY_VALUES[propKey] || [];
            if (suggestions.length > 0) {
                const matches = newValue.trim() === ''
                    ? suggestions
                    : suggestions.filter(v => v.toLowerCase().startsWith(newValue.toLowerCase()));
                setFilteredSuggestions(matches);
                setActiveSuggestionField({ index, type: 'value' });
            } else {
                setActiveSuggestionField(null);
            }
        } else if (field === 'key') {
            const matches = newKey.trim() === ''
                ? CSS_PROPERTY_NAMES.slice(0, 20)
                : CSS_PROPERTY_NAMES.filter(p => p.toLowerCase().includes(newKey.toLowerCase()));
            if (matches.length > 0) {
                setFilteredSuggestions(matches.slice(0, 15));
                setActiveSuggestionField({ index, type: 'key' });
            } else {
                setActiveSuggestionField(null);
            }
        }
    };

    const deleteStyle = (index: number) => {
        const styleToDelete = styles[index];
        const newStyles = styles.filter((_, i) => i !== index);
        setStyles(newStyles);
        if (styleToDelete.key) {
            let key = styleToDelete.key;
            if (key.includes('-')) key = key.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
            onUpdateStyle({ [key]: '' } as any);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent, index: number, field: 'key' | 'value') => {
        if (e.key === 'Enter') {
            setActiveSuggestionField(null);
            (e.currentTarget as HTMLInputElement).blur();
        }
    };

    const applySuggestion = (suggestion: string) => {
        if (activeSuggestionField) {
            const { index, type } = activeSuggestionField;
            if (index === -1) {
                if (type === 'key') setNewPropName(suggestion);
                if (type === 'value') setNewPropValue(suggestion);
            } else {
                if (type === 'key') updateStyleAtIndex(index, suggestion, styles[index].value);
                if (type === 'value') updateStyleAtIndex(index, styles[index].key, suggestion);
            }
            setActiveSuggestionField(null);
        }
    };

    const handleNewPropChange = (field: 'key' | 'value', value: string) => {
        if (field === 'key') {
            setNewPropName(value);
            const matches = filterAndSortProperties(value, 15);
            if (matches.length > 0) {
                setFilteredSuggestions(matches);
                setActiveSuggestionField({ index: -1, type: 'key' });
            } else {
                setActiveSuggestionField(null);
            }
        } else {
            setNewPropValue(value);
            let propKey = newPropName;
            if (propKey.includes('-')) propKey = propKey.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
            const suggestions = CSS_PROPERTY_VALUES[propKey] || [];
            if (suggestions.length > 0) {
                const matches = value.trim() === '' ? suggestions : suggestions.filter(v => v.toLowerCase().startsWith(value.toLowerCase()));
                setFilteredSuggestions(matches);
                setActiveSuggestionField({ index: -1, type: 'value' });
            } else {
                setActiveSuggestionField(null);
            }
        }
    };

    const addNewProperty = () => {
        if (newPropName && newPropValue) {
            let key = newPropName;
            if (key.includes('-')) key = key.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
            onUpdateStyle({ [key]: newPropValue });
            setNewPropName('');
            setNewPropValue('');
        }
    };

    const activeComputed = computedStyles ? Object.entries(computedStyles).filter(([_, v]) => {
        const val = String(v).trim();
        return v !== undefined && v !== null && val !== '' && val !== 'undefined' && val !== 'null' && val !== 'none' && val !== 'normal' && val !== 'auto' && val !== '0px' && val !== 'rgba(0, 0, 0, 0)';
    }) : [];

    if (!element) return (
        <div className="p-8 text-center h-full flex flex-col items-center justify-center backdrop-blur-xl border-l" style={{ backgroundColor: 'var(--bg-glass)', borderColor: 'var(--border-color)', color: 'var(--text-muted)' }}>
            <AlertCircle className="mx-auto mb-4 opacity-50" size={32} />
            <p>Select an element to inspect styles</p>
        </div>
    );

    return (
        <div className="flex flex-col h-full backdrop-blur-xl text-sm font-sans" style={{ backgroundColor: 'var(--bg-glass)', color: 'var(--text-main)' }} onClick={() => setActiveSuggestionField(null)}>
            <div className="p-3 border-b font-semibold flex justify-between items-center text-[10px] uppercase tracking-wider" style={{ backgroundColor: 'var(--bg-glass)', borderColor: 'var(--border-color)', color: 'var(--text-muted)' }}>
                Styles
                <span className="bg-cyan-500/20 text-cyan-300 px-2 py-0.5 rounded-full border border-cyan-500/30">INSPECT MODE</span>
            </div>

            <div className="flex-1 overflow-y-auto p-2 no-scrollbar">
                <div className="space-y-4">
                    <div className="space-y-1">
                        <div className="text-xs text-slate-500 mb-2 px-1">Element: <strong>{element.name}</strong> (#{element.id})</div>
                        <div className="border rounded p-2 shadow-sm font-mono text-xs" style={{ borderColor: 'var(--border-color)', backgroundColor: 'rgba(0,0,0,0.05)' }}>
                            <div className="text-slate-500 mb-1 select-none">element.style &#123;</div>
                            <div className="pl-4 space-y-1 relative">
                                {styles.map((style, index) => (
                                    <div key={index} className="flex items-center group relative">
                                        <div className="relative">
                                            <input
                                                className="w-[100px] text-cyan-400 border-b border-transparent focus:border-cyan-500/50 outline-none bg-transparent"
                                                value={style.key}
                                                onChange={(e) => handleStyleChange(index, 'key', e.target.value)}
                                                onKeyDown={(e) => handleKeyDown(e, index, 'key')}
                                                onFocus={() => handleStyleFocus(index, 'key')}
                                                onClick={(e) => e.stopPropagation()}
                                            />
                                            {activeSuggestionField?.index === index && activeSuggestionField?.type === 'key' && filteredSuggestions.length > 0 && (
                                                <div className="absolute top-full left-0 z-50 w-48 bg-slate-800 border border-white/10 shadow-xl rounded mt-1 max-h-40 overflow-y-auto custom-scrollbar">
                                                    {filteredSuggestions.map(s => (
                                                        <div key={s} className="px-2 py-1 hover:bg-white/10 cursor-pointer text-slate-300 border-b border-white/5 last:border-0" onMouseDown={(e) => { e.stopPropagation(); updateStyleAtIndex(index, s, style.value); setActiveSuggestionField(null); }}>{s}</div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                        <span className="mx-1 text-slate-500">:</span>
                                        <div className="relative flex-1 flex items-center">
                                            {(/color|fill|stroke/i.test(style.key) || style.key === 'background') && (
                                                <div className="relative mr-1.5 flex-shrink-0 w-3 h-3 rounded-sm border border-slate-600 shadow-sm overflow-hidden cursor-pointer">
                                                    <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4IiBoZWlnaHQ9IjgiPjxwYXRoIGQ9Ik0wIDBoNHY0SDB6bTQgNGg0djRINHoiIGZpbGw9IiMzMzMiIGZpbGwtb3BhY2l0eT0iMC41Ii8+PC9zdmc+')] opacity-50"></div>
                                                    <div className="absolute inset-0" style={{ backgroundColor: style.value }}></div>
                                                    <input type="color" className="absolute -top-1 -left-1 w-6 h-6 opacity-0 cursor-pointer" onChange={(e) => handleStyleChange(index, 'value', e.target.value)} value={style.value.startsWith('#') && style.value.length === 7 ? style.value : undefined} />
                                                </div>
                                            )}
                                            <input
                                                className="w-full text-slate-300 border-b border-transparent focus:border-cyan-500/50 outline-none bg-transparent"
                                                value={style.value}
                                                onChange={(e) => handleStyleChange(index, 'value', e.target.value)}
                                                onKeyDown={(e) => handleKeyDown(e, index, 'value')}
                                                onFocus={() => handleStyleFocus(index, 'value')}
                                                onClick={(e) => e.stopPropagation()}
                                            />
                                            {activeSuggestionField?.index === index && activeSuggestionField?.type === 'value' && filteredSuggestions.length > 0 && (
                                                <div className="absolute top-full left-0 z-50 w-full bg-slate-800 border border-white/10 shadow-xl rounded mt-1 max-h-40 overflow-y-auto custom-scrollbar">
                                                    {filteredSuggestions.map(s => (
                                                        <div key={s} className="px-2 py-1 hover:bg-white/10 cursor-pointer text-slate-300 border-b border-white/5 last:border-0" onMouseDown={(e) => { e.stopPropagation(); applySuggestion(s); }}>{s}</div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                        <span className="text-slate-500">;</span>
                                        <button onClick={() => deleteStyle(index)} className="ml-2 opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 transition-all"><Trash2 size={12} /></button>
                                    </div>
                                ))}

                                <div className="flex items-center mt-2 group relative">
                                    <div className="relative">
                                        <input
                                            className="w-[100px] text-cyan-400/70 border-b border-white/10 focus:border-cyan-500/50 outline-none bg-transparent placeholder:text-slate-600"
                                            value={newPropName}
                                            onChange={(e) => handleNewPropChange('key', e.target.value)}
                                            onFocus={() => handleNewPropFocus('key')}
                                            onClick={(e) => e.stopPropagation()}
                                            placeholder="new-property"
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                   const inputs = e.currentTarget.parentElement?.parentElement?.querySelectorAll('input');
                                                   if (inputs && inputs[1]) (inputs[1] as HTMLInputElement).focus();
                                                }
                                            }}
                                        />
                                        {activeSuggestionField?.index === -1 && activeSuggestionField?.type === 'key' && filteredSuggestions.length > 0 && (
                                            <div className="absolute top-full left-0 z-50 w-48 bg-slate-800 border border-white/10 shadow-xl rounded mt-1 max-h-40 overflow-y-auto custom-scrollbar">
                                                {filteredSuggestions.map(s => (
                                                    <div key={s} className="px-2 py-1 hover:bg-white/10 cursor-pointer text-slate-300 border-b border-white/5 last:border-0" onMouseDown={(e) => { e.stopPropagation(); setNewPropName(s); setActiveSuggestionField(null); }}>{s}</div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    <span className="mx-1 text-slate-500">:</span>
                                    <div className="relative flex-1">
                                        <input
                                            className="w-full text-slate-300 border-b border-white/10 focus:border-cyan-500/50 outline-none bg-transparent placeholder:text-slate-600"
                                            value={newPropValue}
                                            onChange={(e) => handleNewPropChange('value', e.target.value)}
                                            onFocus={() => handleNewPropFocus('value')}
                                            onClick={(e) => e.stopPropagation()}
                                            placeholder="value"
                                            onKeyDown={(e) => { if (e.key === 'Enter') addNewProperty(); }}
                                        />
                                        {activeSuggestionField?.index === -1 && activeSuggestionField?.type === 'value' && filteredSuggestions.length > 0 && (
                                            <div className="absolute top-full left-0 z-50 w-full bg-slate-800 border border-white/10 shadow-xl rounded mt-1 max-h-40 overflow-y-auto custom-scrollbar">
                                                {filteredSuggestions.map(s => (
                                                    <div key={s} className="px-2 py-1 hover:bg-white/10 cursor-pointer text-slate-300 border-b border-white/5 last:border-0" onMouseDown={(e) => { e.stopPropagation(); setNewPropValue(s); setActiveSuggestionField(null); }}>{s}</div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    <span className="text-slate-500">;</span>
                                    <button onClick={addNewProperty} className="ml-2 text-slate-500 hover:text-green-500 transition-colors"><Plus size={14} /></button>
                                </div>
                            </div>
                            <div className="text-slate-500 mt-1 select-none">&#125;</div>
                        </div>
                    </div>

                    {activeComputed.length > 0 && (
                        <div className="border border-white/10 rounded bg-black/20 overflow-hidden">
                            <button onClick={() => setShowComputed(!showComputed)} className="w-full flex items-center justify-between p-2 text-xs font-semibold text-slate-500 hover:bg-white/5 transition-colors">
                                <span>Computed</span>
                                <ChevronDown size={14} className={`transition-transform duration-200 ${showComputed ? 'rotate-180' : ''}`} />
                            </button>
                            {showComputed && (
                                <div className="p-2 bg-black/10 border-t border-white/5 grid grid-cols-1 gap-0.5">
                                    {activeComputed.sort((a, b) => a[0].localeCompare(b[0])).map(([key, value]) => (
                                        <div key={key} className="flex items-start text-xs font-mono group hover:bg-white/5 p-0.5 rounded">
                                            <span className="text-slate-500 w-1/3 min-w-[100px] truncate" title={key}>{key}</span>
                                            <span className="text-slate-300 flex-1 break-all">{String(value)}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default StyleInspectorPanel;
