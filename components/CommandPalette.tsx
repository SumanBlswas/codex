import React, { useState, useEffect, useRef } from 'react';
import { Search, Zap, Layout, Type, Image as ImageIcon, BoxSelect, Monitor, Smartphone, Eraser } from 'lucide-react';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onAction: (actionId: string, payload?: any) => void;
}

interface CommandItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  category: 'General' | 'Insert' | 'View';
  payload?: any;
  shortcut?: string;
}

const COMMANDS: CommandItem[] = [
  // Insert
  { id: 'add-div', label: 'Add Container (Div)', icon: <BoxSelect size={14} />, category: 'Insert', payload: 'div' },
  { id: 'add-section', label: 'Add Section', icon: <Layout size={14} />, category: 'Insert', payload: 'section' },
  { id: 'add-text', label: 'Add Paragraph', icon: <Type size={14} />, category: 'Insert', payload: 'p' },
  { id: 'add-h1', label: 'Add Heading 1', icon: <Type size={14} />, category: 'Insert', payload: 'h1' },
  { id: 'add-h2', label: 'Add Heading 2', icon: <Type size={14} />, category: 'Insert', payload: 'h2' },
  { id: 'add-button', label: 'Add Button', icon: <Zap size={14} />, category: 'Insert', payload: 'button' },
  { id: 'add-image', label: 'Add Image', icon: <ImageIcon size={14} />, category: 'Insert', payload: 'img' },
  
  // General
  { id: 'clear-selection', label: 'Deselect Element', icon: <Eraser size={14} />, category: 'General', shortcut: 'Esc' },
  { id: 'undo', label: 'Undo', icon: <Zap size={14} />, category: 'General', shortcut: 'Ctrl+Z' },
  { id: 'redo', label: 'Redo', icon: <Zap size={14} />, category: 'General', shortcut: 'Ctrl+Y' },

  // View
  { id: 'view-desktop', label: 'Switch to Desktop View', icon: <Monitor size={14} />, category: 'View' },
  { id: 'view-mobile', label: 'Switch to Mobile View', icon: <Smartphone size={14} />, category: 'View' },
  { id: 'toggle-preview', label: 'Toggle Preview Mode', icon: <Monitor size={14} />, category: 'View', shortcut: 'Ctrl+P' },
];

const CommandPalette: React.FC<CommandPaletteProps> = ({ isOpen, onClose, onAction }) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filteredCommands = COMMANDS.filter(cmd => 
    cmd.label.toLowerCase().includes(query.toLowerCase()) || 
    cmd.category.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery('');
      setSelectedIndex(0);
    }
  }, [isOpen]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => Math.min(prev + 1, filteredCommands.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredCommands[selectedIndex]) {
        executeCommand(filteredCommands[selectedIndex]);
      }
    } else if (e.key === 'Escape') {
        onClose();
    }
  };

  const executeCommand = (cmd: CommandItem) => {
    onAction(cmd.id, cmd.payload);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] bg-black/60 backdrop-blur-sm animate-fadeIn" onClick={onClose}>
      <div 
        className="w-[500px] max-w-[90vw] rounded-xl overflow-hidden shadow-2xl flex flex-col backdrop-blur-xl"
        style={{ 
          backgroundColor: 'var(--bg-glass-strong)', 
          border: '1px solid var(--border-color)',
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)'
        }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center px-4 py-3" style={{ borderBottom: '1px solid var(--border-color)' }}>
          <Search size={18} className="mr-3" style={{ color: 'var(--text-muted)' }} />
          <input
            ref={inputRef}
            type="text"
            className="flex-1 bg-transparent border-none outline-none text-sm"
            style={{ color: 'var(--text-main)' }}
            placeholder="Type a command..."
            value={query}
            onChange={e => {
                setQuery(e.target.value);
                setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
          />
          <div className="flex gap-1">
             <span 
               className="text-[10px] px-1.5 py-0.5 rounded font-mono"
               style={{ backgroundColor: 'var(--input-bg)', color: 'var(--text-muted)' }}
             >Esc</span>
          </div>
        </div>
        
        <div className="max-h-[300px] overflow-y-auto py-2 custom-scrollbar">
            {filteredCommands.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>No commands found</div>
            ) : (
                filteredCommands.map((cmd, index) => (
                    <div
                        key={cmd.id}
                        onClick={() => executeCommand(cmd)}
                        className="mx-2 px-3 py-2 rounded-lg flex items-center justify-between cursor-pointer transition-all"
                        style={{
                            backgroundColor: index === selectedIndex ? 'var(--accent-glow)' : 'transparent',
                            color: index === selectedIndex ? 'var(--accent-primary)' : 'var(--text-main)',
                        }}
                        onMouseEnter={(e) => { if (index !== selectedIndex) e.currentTarget.style.backgroundColor = 'var(--input-bg)'; }}
                        onMouseLeave={(e) => { if (index !== selectedIndex) e.currentTarget.style.backgroundColor = 'transparent'; }}
                    >
                        <div className="flex items-center gap-3">
                            <span style={{ color: index === selectedIndex ? 'var(--accent-primary)' : 'var(--icon-color)' }}>{cmd.icon}</span>
                            <span className="text-sm font-medium">{cmd.label}</span>
                        </div>
                        <div className="flex items-center gap-2">
                             {cmd.shortcut && (
                               <span 
                                 className="text-[10px] px-1.5 py-0.5 rounded font-mono"
                                 style={{ backgroundColor: 'var(--input-bg)', color: 'var(--text-muted)' }}
                               >{cmd.shortcut}</span>
                             )}
                             {index === selectedIndex && <Zap size={12} style={{ color: 'var(--accent-primary)' }} />}
                        </div>
                    </div>
                ))
            )}
        </div>
        
        <div 
          className="px-4 py-2 text-[10px] flex justify-between"
          style={{ borderTop: '1px solid var(--border-color)', backgroundColor: 'var(--input-bg)', color: 'var(--text-muted)' }}
        >
           <span>Select <strong>↑↓</strong></span>
           <span>Confirm <strong>Enter</strong></span>
        </div>
      </div>
    </div>
  );
};

export default CommandPalette;
