import React, { useState, useRef, useEffect } from 'react';
import { 
    Layout, Type, Palette, Move, Zap, ChevronRight, ChevronDown, 
    AlignLeft, AlignCenter, AlignRight, AlignJustify,
    ArrowUp, ArrowDown, ArrowLeft, ArrowRight,
    Maximize, Minimize, Plus, Trash2, Image as ImageIcon,
    Grid, Columns, Rows, Box, BoxSelect
} from 'lucide-react';
import { CSS_PROPERTY_VALUES } from '../utils/cssProperties';

interface DynamicSectionProps {
    styles: React.CSSProperties;
    onChange: (key: string, value: string | undefined) => void;
    availableFonts: string[];
    onBgImageUpload?: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

// --- Helper Components ---

const Label: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div 
        className="text-[10px] font-bold uppercase tracking-wider mb-1.5 flex items-center gap-1.5 border-l-2 border-indigo-500 pl-2"
        style={{ color: 'var(--text-main)' }}
    >
        {children}
    </div>
);

const IconButton: React.FC<{ 
    active?: boolean; 
    onClick: () => void; 
    children: React.ReactNode; 
    title?: string 
}> = ({ active, onClick, children, title }) => (
    <button 
        onClick={onClick}
        title={title}
        className={`p-1.5 rounded transition-all font-bold ${active 
            ? 'bg-indigo-600 text-white shadow-sm' 
            : 'hover:bg-black/10'}`}
        style={{ color: active ? '#ffffff' : 'var(--text-main)' }}
    >
        {children}
    </button>
);

const ColorInput: React.FC<{ value: string; onChange: (val: string) => void }> = ({ value, onChange }) => {
    return (
        <div className="flex items-center gap-2 group relative">
             <div 
                className="w-8 h-8 rounded-full overflow-hidden cursor-pointer shadow-sm relative shrink-0 transition-transform active:scale-90"
                style={{ border: '1px solid var(--border-color)' }}
             >
                <input 
                    type="color" 
                    value={value?.startsWith('#') ? value : '#000000'} 
                    onChange={(e) => onChange(e.target.value)}
                    className="absolute inset-0 w-[150%] h-[150%] -top-1/4 -left-1/4 cursor-pointer opacity-0 z-10"
                />
                 <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4IiBoZWlnaHQ9IjgiPjxwYXRoIGQ9Ik0wIDBoNHY0SDB6bTQgNGg0djRINHoiIGZpbGw9IiMzMzMiIGZpbGwtb3BhY2l0eT0iMC41Ii8+PC9zdmc+')] opacity-30"></div>
                <div className="absolute inset-0" style={{ backgroundColor: value || 'transparent' }}></div>
            </div>
            <input 
                type="text" 
                value={value || ''} 
                onChange={(e) => onChange(e.target.value)}
                placeholder="Hex / RGB"
                className="w-full input-dynamic p-1.5 text-xs font-mono uppercase rounded outline-none transition-all font-bold"
            />
        </div>
    );
};

const SelectInput: React.FC<{ 
    value: string; 
    options: string[]; 
    onChange: (val: string) => void;
    placeholder?: string;
    editable?: boolean;
}> = ({ value, options, onChange, placeholder, editable = false }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState('');
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const query = search.trim().toLowerCase();
    const filteredOptions = query
      ? options.filter((opt) => opt.toLowerCase().includes(query))
      : options;

    return (
        <div className="relative w-full" ref={containerRef}>
            <div 
                className="input-dynamic flex items-center justify-between p-1.5 text-xs cursor-pointer hover:border-indigo-500 transition-colors rounded font-medium shadow-sm"
                onClick={() => {
                    setIsOpen(!isOpen);
                    if (!isOpen && !editable) {
                        setSearch('');
                    }
                }}
            >
                {editable ? (
                     <input 
                        type="text" 
                        value={value || ''}
                        onChange={(e) => {
                            onChange(e.target.value);
                            setSearch(e.target.value);
                            setIsOpen(true);
                        }}
                        className="bg-transparent outline-none w-full font-bold"
                        style={{ color: 'var(--text-main)' }}
                        placeholder={placeholder}
                     />
                ) : (
                    <span className="truncate font-bold" style={{ color: 'var(--text-main)' }}>{value || placeholder || 'Select...'}</span>
                )}
                <ChevronDown size={12} className="shrink-0 ml-1" style={{ color: 'var(--text-muted)' }} />
            </div>
            
            {isOpen && (
                <div 
                    className="absolute top-full left-0 w-full z-50 mt-1 rounded-md shadow-xl max-h-48 overflow-y-auto custom-scrollbar animate-slideDown"
                    style={{ backgroundColor: 'var(--bg-panel)', border: '1px solid var(--border-color)' }}
                >
                    <div className="p-1">
                         {filteredOptions.length > 0 ? filteredOptions.map(opt => (
                             <div 
                                key={opt}
                                className="px-2 py-1.5 text-xs rounded cursor-pointer transition-colors"
                                style={{ 
                                    color: value === opt ? 'var(--accent-primary)' : 'var(--text-main)',
                                    fontWeight: value === opt ? 700 : 400,
                                    backgroundColor: value === opt ? 'var(--accent-glow)' : 'transparent'
                                }}
                                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--accent-glow)')}
                                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = value === opt ? 'var(--accent-glow)' : 'transparent')}
                                 onClick={() => {
                                     onChange(opt);
                                     setIsOpen(false);
                                     setSearch('');
                                 }}
                              >
                                 {opt}
                             </div>
                         )) : <div className="p-2 text-xs italic" style={{ color: 'var(--text-muted)' }}>No matches</div>}
                    </div>
                </div>
            )}
        </div>
    );
};

const UnitInput: React.FC<{
    value: any;
    onChange: (val: string) => void;
    label?: string;
    icon?: React.ReactNode;
}> = ({ value, onChange, label, icon }) => (
    <div className="flex items-center gap-2 group">
        {(label || icon) && (
            <div className="text-[10px] w-4 h-4 flex items-center justify-center shrink-0 font-extrabold" style={{ color: 'var(--text-main)' }}>
                {icon || label}
            </div>
        )}
        <input 
            type="text"
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            className="w-full input-dynamic p-1 text-xs text-right font-mono outline-none transition-all rounded-sm font-black tracking-wide"
            placeholder="-"
        />
    </div>
);

// --- Section Components ---

const LayoutSection: React.FC<DynamicSectionProps> = ({ styles, onChange }) => (
    <div className="space-y-4">
        {/* Display Mode */}
        <div>
            <Label>Display</Label>
            <div className="flex p-1 rounded-md justify-between" style={{ backgroundColor: 'var(--input-bg)' }}>
                {[
                    { val: 'block', icon: <Box size={14} />, label: 'Block' },
                    { val: 'flex', icon: <Columns size={14} />, label: 'Flex' },
                    { val: 'grid', icon: <Grid size={14} />, label: 'Grid' },
                    { val: 'none', icon: <Maximize size={14} />, label: 'None' }
                ].map(opt => (
                    <IconButton 
                        key={opt.val} 
                        active={styles.display === opt.val} 
                        onClick={() => onChange('display', opt.val)}
                        title={opt.label}
                    >
                        {opt.icon}
                    </IconButton>
                ))}
            </div>
        </div>

        {/* Flex Controls (Conditional) */}
        {styles.display === 'flex' && (
             <div 
                className="p-3 rounded-lg space-y-3 animate-fadeIn"
                style={{ backgroundColor: 'var(--accent-glow)', border: '1px solid rgba(99, 102, 241, 0.15)' }}
             >
                 <div className="flex justify-between items-center">
                    <span className="text-[10px] font-bold uppercase" style={{ color: 'var(--accent-primary)' }}>Flex Direction</span>
                    <div className="flex gap-1">
                        <IconButton active={styles.flexDirection === 'row' || !styles.flexDirection} onClick={() => onChange('flexDirection', 'row')}><ArrowRight size={12} /></IconButton>
                        <IconButton active={styles.flexDirection === 'column'} onClick={() => onChange('flexDirection', 'column')}><ArrowDown size={12} /></IconButton>
                    </div>
                 </div>
                 <div className="space-y-2">
                     <div className="flex justify-between items-center">
                        <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Align</span>
                        <div className="flex rounded p-0.5" style={{ backgroundColor: 'var(--input-bg)' }}>
                             {['start', 'center', 'end', 'stretch'].map(align => (
                                 <button 
                                    key={align}
                                    onClick={() => onChange('alignItems', align)}
                                    className={`p-1 rounded text-[10px] font-medium transition-all ${styles.alignItems === align ? 'shadow' : ''}`}
                                    style={{ 
                                        color: styles.alignItems === align ? 'var(--accent-primary)' : 'var(--text-muted)',
                                        backgroundColor: styles.alignItems === align ? 'var(--bg-panel)' : 'transparent'
                                    }}
                                 >
                                    {align === 'start' ? 'Start' : align === 'end' ? 'End' : align.charAt(0).toUpperCase() + align.slice(1)}
                                 </button>
                             ))}
                        </div>
                     </div>
                     <div className="flex justify-between items-center">
                        <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Justify</span>
                         <div className="flex rounded p-0.5" style={{ backgroundColor: 'var(--input-bg)' }}>
                             {['start', 'center', 'end', 'space-between'].map(justify => (
                                 <button 
                                    key={justify}
                                    onClick={() => onChange('justifyContent', justify)}
                                    className={`p-1 rounded text-[10px] font-medium transition-all ${styles.justifyContent === justify ? 'shadow' : ''}`}
                                    style={{ 
                                        color: styles.justifyContent === justify ? 'var(--accent-primary)' : 'var(--text-muted)',
                                        backgroundColor: styles.justifyContent === justify ? 'var(--bg-panel)' : 'transparent'
                                    }}
                                 >
                                    {justify === 'space-between' ? 'Space' : justify === 'start' ? 'Start' : justify === 'end' ? 'End' : 'Center'}
                                 </button>
                             ))}
                        </div>
                     </div>
                 </div>
                 <div className="flex items-center gap-2">
                     <span className="text-[10px] w-8" style={{ color: 'var(--text-muted)' }}>Gap</span>
                     <input type="text" className="input-dynamic flex-1 h-6 text-xs px-1" value={styles.gap || ''} onChange={e => onChange('gap', e.target.value)} placeholder="0px" />
                 </div>
             </div>
        )}

        {/* Dimensions */}
        <div>
            <Label>Size</Label>
            <div className="grid grid-cols-2 gap-2">
                 <UnitInput label="W" value={styles.width} onChange={(v) => onChange('width', v)} />
                 <UnitInput label="H" value={styles.height} onChange={(v) => onChange('height', v)} />
                 <UnitInput label="Min W" value={styles.minWidth} onChange={(v) => onChange('minWidth', v)} />
                 <UnitInput label="Min H" value={styles.minHeight} onChange={(v) => onChange('minHeight', v)} />
            </div>
        </div>

        {/* Spacing (Margin/Padding - Visual Box Model) */}
        <div>
           <Label>Spacing Model</Label>
           <div className="relative flex flex-col items-center justify-center text-[10px] font-mono select-none">
                
                {/* MARGIN ZONE */}
                <div 
                    className="relative w-full aspect-[16/9] rounded-lg flex items-center justify-center p-8 transition-colors"
                    style={{ backgroundColor: 'rgba(251, 146, 60, 0.1)', border: '1px solid rgba(251, 146, 60, 0.25)' }}
                >
                    <span className="absolute top-1 left-2 text-[8px] font-bold uppercase tracking-wider" style={{ color: '#f97316' }}>Margin</span>
                    
                    {/* Margin Inputs */}
                    <input className="absolute top-1.5 left-1/2 -translate-x-1/2 w-8 text-center bg-transparent hover:bg-white/90 focus:bg-white rounded font-extrabold outline-none transition-all" placeholder="-" value={styles.marginTop || styles.margin || ''} onChange={e => onChange('marginTop', e.target.value)} style={{ color: 'var(--text-main)' }} />
                    <input className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-8 text-center bg-transparent hover:bg-white/90 focus:bg-white rounded font-extrabold outline-none transition-all" placeholder="-" value={styles.marginBottom || styles.margin || ''} onChange={e => onChange('marginBottom', e.target.value)} style={{ color: 'var(--text-main)' }} />
                    <input className="absolute left-1 top-1/2 -translate-y-1/2 w-8 text-center bg-transparent hover:bg-white/90 focus:bg-white rounded font-extrabold outline-none transition-all" placeholder="-" value={styles.marginLeft || styles.margin || ''} onChange={e => onChange('marginLeft', e.target.value)} style={{ color: 'var(--text-main)' }} />
                    <input className="absolute right-1 top-1/2 -translate-y-1/2 w-8 text-center bg-transparent hover:bg-white/90 focus:bg-white rounded font-extrabold outline-none transition-all" placeholder="-" value={styles.marginRight || styles.margin || ''} onChange={e => onChange('marginRight', e.target.value)} style={{ color: 'var(--text-main)' }} />

                    {/* PADDING ZONE */}
                    <div 
                        className="relative w-full h-full rounded flex items-center justify-center"
                        style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.25)' }}
                    >
                         <span className="absolute top-0.5 left-1.5 text-[8px] font-bold uppercase tracking-wider" style={{ color: '#10b981' }}>Padding</span>
                         
                         {/* Padding Inputs */}
                         <input className="absolute top-1 left-1/2 -translate-x-1/2 w-8 text-center bg-transparent hover:bg-white/90 focus:bg-white rounded font-extrabold outline-none transition-all" placeholder="-" value={styles.paddingTop || styles.padding || ''} onChange={e => onChange('paddingTop', e.target.value)} style={{ color: 'var(--text-main)' }} />
                         <input className="absolute bottom-1 left-1/2 -translate-x-1/2 w-8 text-center bg-transparent hover:bg-white/90 focus:bg-white rounded font-extrabold outline-none transition-all" placeholder="-" value={styles.paddingBottom || styles.padding || ''} onChange={e => onChange('paddingBottom', e.target.value)} style={{ color: 'var(--text-main)' }} />
                         <input className="absolute left-1 top-1/2 -translate-y-1/2 w-6 text-center bg-transparent hover:bg-white/90 focus:bg-white rounded font-extrabold outline-none transition-all" placeholder="-" value={styles.paddingLeft || styles.padding || ''} onChange={e => onChange('paddingLeft', e.target.value)} style={{ color: 'var(--text-main)' }} />
                         <input className="absolute right-1 top-1/2 -translate-y-1/2 w-6 text-center bg-transparent hover:bg-white/90 focus:bg-white rounded font-extrabold outline-none transition-all" placeholder="-" value={styles.paddingRight || styles.padding || ''} onChange={e => onChange('paddingRight', e.target.value)} style={{ color: 'var(--text-main)' }} />
                         
                         {/* CONTENT ZONE */}
                         <div 
                            className="w-16 h-8 rounded flex items-center justify-center"
                            style={{ backgroundColor: 'var(--input-bg)', border: '1px solid var(--border-color)' }}
                         >
                             <div className="w-full h-px" style={{ backgroundColor: 'var(--border-color)' }}></div>
                             <div className="h-full w-px absolute" style={{ backgroundColor: 'var(--border-color)' }}></div>
                         </div>
                    </div>
               </div>
           </div>
        </div>
    </div>
);

const TypographySection: React.FC<DynamicSectionProps> = ({ styles, onChange, availableFonts }) => (
    <div className="space-y-4">
        <div>
            <Label>Font Family</Label>
            <SelectInput 
                value={String(styles.fontFamily || '')} 
                options={availableFonts} 
                onChange={(v) => onChange('fontFamily', v)} 
                placeholder="Default Font"
            />
        </div>
        
        <div className="grid grid-cols-2 gap-3">
             <div>
                <Label>Weight</Label>
                <SelectInput 
                    value={String(styles.fontWeight || '')} 
                    options={CSS_PROPERTY_VALUES.fontWeight} 
                    onChange={(v) => onChange('fontWeight', v)} 
                    placeholder="Normal"
                />
             </div>
             <div>
                <Label>Size</Label>
                <SelectInput 
                    editable
                    value={String(styles.fontSize || '')} 
                    options={CSS_PROPERTY_VALUES.fontSize} 
                    onChange={(v) => onChange('fontSize', v)} 
                    placeholder="16px"
                />
             </div>
        </div>

        <div className="flex justify-between items-center">
             <div className="flex p-1 rounded-md" style={{ backgroundColor: 'var(--input-bg)' }}>
                 <IconButton active={styles.textAlign === 'left'} onClick={() => onChange('textAlign', 'left')}><AlignLeft size={14} /></IconButton>
                 <IconButton active={styles.textAlign === 'center'} onClick={() => onChange('textAlign', 'center')}><AlignCenter size={14} /></IconButton>
                 <IconButton active={styles.textAlign === 'right'} onClick={() => onChange('textAlign', 'right')}><AlignRight size={14} /></IconButton>
                 <IconButton active={styles.textAlign === 'justify'} onClick={() => onChange('textAlign', 'justify')}><AlignJustify size={14} /></IconButton>
             </div>
             <div className="w-px h-6 mx-2" style={{ backgroundColor: 'var(--border-color)' }}></div>
             <ColorInput value={String(styles.color || '')} onChange={(v) => onChange('color', v)} />
        </div>
        
        <div className="grid grid-cols-2 gap-3">
             <UnitInput label="Line Ht" value={styles.lineHeight} onChange={v => onChange('lineHeight', v)} />
             <UnitInput label="Letter Sp" value={styles.letterSpacing} onChange={v => onChange('letterSpacing', v)} />
        </div>
    </div>
);

const EffectsSection: React.FC<DynamicSectionProps> = ({ styles, onChange }) => (
    <div className="space-y-4">
        <div>
            <Label>Opacity</Label>
            <input 
                type="range" min="0" max="1" step="0.05" 
                value={styles.opacity || '1'} 
                onChange={(e) => onChange('opacity', e.target.value)}
                className="w-full h-1.5 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                style={{ backgroundColor: 'var(--input-bg)' }}
            />
            <div className="flex justify-between text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
                <span>0%</span>
                <span style={{ color: 'var(--text-main)', fontWeight: 700 }}>{Math.round(Number(styles.opacity || 1) * 100)}%</span>
                <span>100%</span>
            </div>
        </div>
        
        <div>
            <Label>Background</Label>
            <ColorInput value={String(styles.backgroundColor || '')} onChange={(v) => onChange('backgroundColor', v)} />
        </div>
        
        <div>
            <Label>Radius & Border</Label>
             <div className="grid grid-cols-2 gap-2">
                 <UnitInput icon={<Zap size={10} />} value={styles.borderRadius} onChange={v => onChange('borderRadius', v)} />
                 <UnitInput icon={<BoxSelect size={10}/>} value={styles.borderWidth} onChange={v => onChange('borderWidth', v)} />
             </div>
             <div className="mt-2">
                 <ColorInput value={String(styles.borderColor || '')} onChange={(v) => onChange('borderColor', v)} />
             </div>
        </div>
    </div>
);


// --- Section Wrapper (Moved outside to prevent re-mounting) ---
const Section: React.FC<{ title: string; icon: React.ReactNode; children: React.ReactNode }> = ({ title, icon, children }) => {
    const [isOpen, setIsOpen] = useState(false);
    return (
        <div className="border-b last:border-0 transition-colors duration-200" style={{ borderColor: 'var(--border-color)' }}>
            <button 
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between p-3 transition-colors hover:bg-black/5"
            >
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--text-main)' }}>
                    <span style={{ color: 'var(--accent-primary)', opacity: 0.7 }}>{icon}</span>
                    {title}
                </div>
                <ChevronRight size={14} className={`transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`} style={{ color: 'var(--text-muted)' }} />
            </button>
            {isOpen && (
                <div className="p-4 animate-slideUp" style={{ backgroundColor: 'var(--input-bg)' }}>
                    {children}
                </div>
            )}
        </div>
    );
};

export const DynamicSections: React.FC<DynamicSectionProps> = (props) => {
    return (
        <div className="flex flex-col">
            <Section title="Layout" icon={<Layout size={14} />}>
                <LayoutSection {...props} />
            </Section>
            
            <Section title="Typography" icon={<Type size={14} />}>
                <TypographySection {...props} />
            </Section>
            
            <Section title="Appearance" icon={<Palette size={14} />}>
                <EffectsSection {...props} />
            </Section>
        </div>
    );
};
