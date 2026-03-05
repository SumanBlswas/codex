
import React, { useState, useEffect, useRef } from 'react';
import { VirtualElement } from '../types';
import { ChevronRight, ChevronDown, Box, Type, Image as ImageIcon, Link as LinkIcon, FileText, Layers, Search, X } from 'lucide-react';

interface LayersPanelProps {
    root: VirtualElement;
    selectedId: string | null;
    onSelect: (id: string) => void;
    theme: 'light' | 'dark';
}

const LayersPanelBase: React.FC<LayersPanelProps> = ({ root, selectedId, onSelect, theme }) => {
    const [expanded, setExpanded] = useState<Set<string>>(new Set(['root']));
    const [searchQuery, setSearchQuery] = useState('');
    const [searchFocused, setSearchFocused] = useState(false);
    const selectedRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!selectedId) return;
        setExpanded((prev) => {
            const nextExpanded = new Set(prev);
            const findAndExpandPath = (element: VirtualElement, path: string[] = []): boolean => {
                if (element.id === selectedId) {
                    path.forEach(id => nextExpanded.add(id));
                    nextExpanded.add(selectedId);
                    return true;
                }
                for (const child of element.children) {
                    if (findAndExpandPath(child, [...path, element.id])) return true;
                }
                return false;
            };
            findAndExpandPath(root);
            return nextExpanded;
        });
        const timer = window.setTimeout(() => {
            selectedRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 100);
        return () => window.clearTimeout(timer);
    }, [root, selectedId]);

    const toggleExpand = (id: string) => {
        const newExpanded = new Set(expanded);
        if (newExpanded.has(id)) newExpanded.delete(id);
        else newExpanded.add(id);
        setExpanded(newExpanded);
    };

    const getIcon = (element: VirtualElement) => {
        if (element.type === 'img') return <ImageIcon size={13} style={{ color: '#a855f7' }} />;
        if (element.type === 'a') return <LinkIcon size={13} style={{ color: '#3b82f6' }} />;
        if (element.type === 'text') return <Type size={13} style={{ color: 'var(--text-muted)' }} />;
        if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span'].includes(element.type)) return <FileText size={13} style={{ color: '#6366f1' }} />;
        return <Box size={13} style={{ color: 'var(--text-muted)' }} />;
    };

    const matchesSearch = (element: VirtualElement, query: string): boolean => {
        if (!query) return true;
        const lowerQuery = query.toLowerCase();
        return (
            element.type.toLowerCase().includes(lowerQuery) ||
            element.name.toLowerCase().includes(lowerQuery) ||
            element.id.toLowerCase().includes(lowerQuery) ||
            (element.content && element.content.toLowerCase().includes(lowerQuery))
        );
    };

    const matchesSearchRecursive = (element: VirtualElement, query: string): boolean => {
        if (matchesSearch(element, query)) return true;
        return element.children.some(child => matchesSearchRecursive(child, query));
    };

    const renderElement = (element: VirtualElement, depth: number = 0): React.ReactElement | null => {
        const hasChildren = element.children.length > 0;
        const isExpanded = expanded.has(element.id);
        const isSelected = selectedId === element.id;
        const indent = depth * 14;
        const elementMatches = matchesSearch(element, searchQuery);
        const hasMatchingChildren = hasChildren && element.children.some(child => matchesSearchRecursive(child, searchQuery));

        if (!elementMatches && !hasMatchingChildren) return null;

        return (
            <div key={element.id}>
                <div
                    ref={isSelected ? selectedRef : null}
                    className={`flex items-center gap-1.5 py-1 px-2 cursor-pointer transition-all duration-150 border-l-2 group relative ${
                        isSelected 
                            ? 'border-indigo-500' 
                            : 'border-transparent hover:border-indigo-500/30'
                    }`}
                    style={{ 
                        paddingLeft: `${indent + 8}px`,
                        backgroundColor: isSelected ? 'var(--accent-glow)' : 'transparent',
                        color: 'var(--text-main)'
                    }}
                    onClick={(e) => { e.stopPropagation(); onSelect(element.id); }}
                >
                    {/* Tree connector line */}
                    {depth > 0 && (
                        <div 
                            className="absolute top-0 bottom-0"
                            style={{ 
                                left: `${(depth - 1) * 14 + 14}px`, 
                                width: '1px', 
                                backgroundColor: 'var(--border-color)' 
                            }} 
                        />
                    )}

                    {hasChildren ? (
                        <button 
                            onClick={(e) => { e.stopPropagation(); toggleExpand(element.id); }} 
                            className="p-0.5 rounded transition-colors flex-shrink-0"
                            style={{ color: 'var(--text-muted)' }}
                        >
                            {isExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                        </button>
                    ) : <div style={{ width: '16px' }} />}

                    <div className="flex-shrink-0">{getIcon(element)}</div>

                    <div className="flex-1 flex items-center gap-1.5 min-w-0">
                        <span 
                            className={`text-[11px] font-mono truncate ${isSelected ? 'font-semibold' : ''}`}
                            style={{ color: isSelected ? 'var(--accent-primary)' : 'var(--text-main)' }}
                        >
                            {element.type}
                        </span>
                        {element.name && element.type !== element.name && (
                            <span
                                className="text-[9px] truncate"
                                style={{
                                    color: theme === 'dark' ? '#94a3b8' : 'var(--text-muted)',
                                    opacity: theme === 'dark' ? 1 : 0.6,
                                }}
                            >
                                {element.name}
                            </span>
                        )}
                    </div>

                    {/* Children count badge */}
                    {hasChildren && (
                        <span 
                            className="text-[9px] px-1 rounded-full font-mono opacity-0 group-hover:opacity-100 transition-opacity"
                            style={{ backgroundColor: 'var(--border-color)', color: 'var(--text-muted)' }}
                        >
                            {element.children.length}
                        </span>
                    )}
                </div>

                {/* Children with smooth transition */}
                {hasChildren && isExpanded && (
                    <div className="relative">
                        {element.children.map((child) => renderElement(child, depth + 1))}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="h-full min-h-0 flex flex-col overflow-hidden" style={{ backgroundColor: 'var(--bg-glass)', color: 'var(--text-main)' }}>
            {/* Search */}
            <div className="p-2 border-b" style={{ borderColor: 'var(--border-color)' }}>
                <div 
                    className={`relative rounded-lg transition-all duration-200 ${searchFocused ? 'ring-1' : ''}`}
                    style={{ 
                        backgroundColor: 'var(--input-bg)', 
                        boxShadow: searchFocused ? '0 0 0 1px var(--accent-primary)' : 'none'
                    }}
                >
                    <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
                    <input
                        type="text"
                        placeholder="Search layers..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onFocus={() => setSearchFocused(true)}
                        onBlur={() => setSearchFocused(false)}
                        className="w-full pl-7 pr-7 py-1.5 text-[11px] bg-transparent rounded-lg outline-none placeholder:opacity-50"
                        style={{ color: 'var(--text-main)' }}
                    />
                    {searchQuery && (
                        <button 
                            onClick={() => setSearchQuery('')} 
                            className="absolute right-2 top-1/2 -translate-y-1/2 hover:opacity-70"
                            style={{ color: 'var(--text-muted)' }}
                        >
                            <X size={12} />
                        </button>
                    )}
                </div>
            </div>

            {/* Tree */}
            <div
                className="flex-1 min-h-0 overflow-y-auto custom-scrollbar"
                style={{ overscrollBehavior: 'contain' }}
            >
                {renderElement(root)}
            </div>
        </div>
    );
};

const areLayersPanelPropsEqual = (
    prev: Readonly<LayersPanelProps>,
    next: Readonly<LayersPanelProps>,
): boolean => {
    return (
        prev.root === next.root &&
        prev.selectedId === next.selectedId &&
        prev.onSelect === next.onSelect &&
        prev.theme === next.theme
    );
};

const LayersPanel = React.memo(LayersPanelBase, areLayersPanelPropsEqual);
LayersPanel.displayName = 'LayersPanel';

export default LayersPanel;
