import React, { useEffect, useState } from 'react';
import FileExplorer from './FileExplorer';
import Toolbox from './Toolbox';
import LayersPanel from './LayersPanel';
import ImagesPanel from './ImagesPanel';
import MasterFeaturePanel from './MasterFeaturePanel';
import { FileMap, VirtualElement } from '../types';
import { FolderOpen, Box, Layers, MousePointer2, PenTool, Sparkles, Plus, Move, Settings2, Image as ImageIcon, Wand2 } from 'lucide-react';

interface SidebarProps {
  files: FileMap;
  projectPath: string | null;
  activeFile: string | null;
  onSelectFile: (path: string) => void;
  onAddFontToPresentationCss: (path: string) => void;
  onCreateFile: (parentPath: string) => void;
  onCreateFolder: (parentPath: string) => void;
  onRenamePath: (path: string) => void;
  onDeletePath: (path: string, kind: 'file' | 'folder') => void;
  onDuplicateFile: (path: string) => void;
  onRefreshFiles: () => void;
  onAddElement: (type: string) => void;
  root: VirtualElement;
  selectedId: string | null;
  onSelectElement: (id: string) => void;
  interactionMode: 'edit' | 'preview' | 'inspect' | 'draw' | 'move';
  setInteractionMode: (mode: 'edit' | 'preview' | 'inspect' | 'draw' | 'move') => void;
  drawElementTag: string;
  setDrawElementTag: (tag: string) => void;
  theme: 'light' | 'dark';
  showConfigButton: boolean;
  onOpenConfig: () => void;
  onLoadImage: (path: string) => void;
  isPanelOpen: boolean;
  showMasterTools?: boolean;
}

const TAB_ITEMS = [
  { key: 'files', icon: FolderOpen, label: 'Explorer' },
  { key: 'images', icon: ImageIcon, label: 'Images' },
  { key: 'layers', icon: Layers, label: 'Layers' },
  { key: 'toolbox', icon: Box, label: 'Add' },
  { key: 'master', icon: Wand2, label: 'Master', beta: true },
] as const;

type TabKey = typeof TAB_ITEMS[number]['key'];

const SidebarBase: React.FC<SidebarProps> = ({
  files,
  projectPath,
  activeFile,
  onSelectFile,
  onAddFontToPresentationCss,
  onCreateFile,
  onCreateFolder,
  onRenamePath,
  onDeletePath,
  onDuplicateFile,
  onRefreshFiles,
  onAddElement,
  root,
  selectedId,
  onSelectElement,
  interactionMode,
  setInteractionMode,
  drawElementTag,
  setDrawElementTag,
  theme,
  showConfigButton,
  onOpenConfig,
  onLoadImage,
  isPanelOpen,
  showMasterTools = true,
}) => {
  const [activeTab, setActiveTab] = useState<TabKey>('files');
  const visibleTabs = (showMasterTools
    ? TAB_ITEMS
    : TAB_ITEMS.filter((tab) => tab.key !== 'master')
  ).filter((tab) => tab.key !== 'toolbox');
  const selectedAccent = theme === 'dark' ? '#67e8f9' : '#0891b2';
  const selectedGlow = theme === 'dark' ? 'rgba(103, 232, 249, 0.4)' : 'rgba(8, 145, 178, 0.22)';

  useEffect(() => {
    if (!showMasterTools && activeTab === 'master') {
      setActiveTab('files');
    }
  }, [showMasterTools, activeTab]);

  return (
    <div
      className="flex h-full min-h-0 shrink-0 z-10 overflow-hidden"
      style={
        {
          ['--accent-primary' as any]: selectedAccent,
          ['--accent-glow' as any]: selectedGlow,
        } as React.CSSProperties
      }
    >
      {/* ─── Icon Rail ─── */}
      <div
        className="w-12 flex flex-col items-center py-3 gap-1 border-r shrink-0"
        style={{
          backgroundColor: 'var(--bg-glass-strong)',
          borderColor: 'var(--border-color)'
        }}
      >
        {/* Mode Toggles */}
        <div className="flex flex-col gap-1 mb-3 pb-3 border-b w-8" style={{ borderColor: 'var(--border-color)' }}>
          <button
            onClick={() => setInteractionMode('edit')}
            title="Select / Edit"
            className={`p-2 rounded-lg transition-all duration-200 group relative ${interactionMode === 'edit' || interactionMode === 'inspect'
                ? 'tab-active-glow animate-neonPulse'
                : 'hover:bg-black/5'
              }`}
            style={{
              color:
                (interactionMode === 'edit' || interactionMode === 'inspect')
                  ? selectedAccent
                  : 'var(--icon-color)'
            }}
          >
            <MousePointer2 size={16} />
          </button>
          <button
            onClick={() => setInteractionMode('move')}
            title="Move Element"
            className={`p-2 rounded-lg transition-all duration-200 group relative ${interactionMode === 'move'
                ? 'bg-amber-500/20 text-amber-400 shadow-lg shadow-amber-500/10'
                : 'hover:bg-black/5'
              }`}
            style={{ color: interactionMode === 'move' ? undefined : 'var(--icon-color)' }}
          >
            <Move size={16} />
          </button>
          <button
            onClick={() => setInteractionMode('draw')}
            title="Draw Element"
            className={`p-2 rounded-lg transition-all duration-200 group relative ${interactionMode === 'draw'
                ? 'bg-emerald-500/20 text-emerald-400 shadow-lg shadow-emerald-500/10'
                : 'hover:bg-black/5'
              }`}
            style={{ color: interactionMode === 'draw' ? undefined : 'var(--icon-color)' }}
          >
            <PenTool size={16} />
          </button>
        </div>

        {/* Tab Icons */}
        {visibleTabs.map(({ key, icon: Icon, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            title={key === 'master' ? `${label} (Beta)` : label}
            className={`p-2 rounded-lg transition-all duration-200 relative glow-indicator ${activeTab === key ? 'tab-active-glow' : 'hover:bg-black/5'
              }`}
            style={{
              color:
                activeTab === key
                  ? selectedAccent
                  : 'var(--icon-color)'
            }}
          >
            <Icon size={16} />
            {/* Active dot indicator */}
            {activeTab === key && (
              <span
                className="absolute -right-[7px] top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-l-full transition-all"
                style={{ backgroundColor: selectedAccent }}
              />
            )}
          </button>
        ))}

        {/* Spacer */}
        <div className="flex-1" />

        {showConfigButton && (
          <button
            onClick={onOpenConfig}
            title="Presentation Settings"
            className="p-2 rounded-lg transition-all duration-200 hover:bg-black/5"
            style={{ color: 'var(--icon-color)' }}
          >
            <Settings2 size={16} />
          </button>
        )}

        {/* Quick Add FAB - hidden for production */}
        {/* <button
          onClick={() => { setActiveTab('toolbox'); }}
          title="Quick Add Element"
          className={`p-2 rounded-xl text-white shadow-lg active:scale-95 transition-all duration-200 ${
            theme === 'dark'
              ? 'bg-gradient-to-br from-cyan-500 to-blue-500 shadow-cyan-500/35'
              : 'bg-gradient-to-br from-cyan-600 to-sky-600 shadow-cyan-500/25'
          }`}
        >
          <Plus size={16} />
        </button> */}
      </div>

      {/* ─── Content Panel ─── */}
      <div className="flex-1 min-w-0 flex flex-col h-full min-h-0 overflow-hidden" style={{ backgroundColor: 'var(--bg-glass)', color: 'var(--text-main)' }}>
        {/* Panel Header */}
        <div
          className="px-3 py-2.5 border-b flex items-center justify-between backdrop-blur-sm"
          style={{ borderColor: 'var(--border-color)', backgroundColor: 'var(--bg-glass-strong)' }}
        >
          <div className="flex items-center gap-2">
            <Sparkles size={12} style={{ color: selectedAccent }} />
            <span className="text-[11px] font-bold uppercase tracking-widest flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
              <span>{TAB_ITEMS.find(t => t.key === activeTab)?.label}</span>
              {showMasterTools && activeTab === 'master' ? (
                <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold tracking-normal uppercase" style={{ color: '#1d4ed8', backgroundColor: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.35)' }}>
                  Beta
                </span>
              ) : null}
            </span>
          </div>
        </div>

        {/* Draw Mode Selector (only when draw mode active) */}
        {interactionMode === 'draw' && (
          <div className="p-2 border-b animate-slideUp" style={{ borderColor: 'var(--border-color)', backgroundColor: 'rgba(16,185,129,0.05)' }}>
            <label className="text-[9px] font-bold uppercase tracking-wider mb-1 block" style={{ color: 'var(--text-muted)' }}>
              Drawing Element
            </label>
            <select
              value={drawElementTag}
              onChange={(e) => setDrawElementTag(e.target.value)}
              className="w-full h-7 text-xs glass-input px-2 focus:outline-none rounded-md"
              style={{ color: 'var(--text-main)' }}
            >
              <option value="div">Box (div)</option>
              <option value="section">Section</option>
              <option value="p">Paragraph</option>
              <option value="span">Span</option>
              <option value="h1">Heading 1</option>
              <option value="h2">Heading 2</option>
              <option value="h3">Heading 3</option>
              <option value="button">Button</option>
              <option value="img">Image</option>
            </select>
          </div>
        )}

        {/* Tab Content */}
        <div
          className="flex-1 h-0 min-h-0 overflow-hidden custom-scrollbar animate-slideInLeft"
          style={{ overscrollBehavior: 'contain' }}
        >
          {activeTab === 'files' ? (
            <FileExplorer
              files={files}
              projectPath={projectPath}
              activeFile={activeFile}
              onSelectFile={onSelectFile}
              onAddFontToPresentationCss={onAddFontToPresentationCss}
              onCreateFile={onCreateFile}
              onCreateFolder={onCreateFolder}
              onRenamePath={onRenamePath}
              onDeletePath={onDeletePath}
              onDuplicateFile={onDuplicateFile}
              onRefreshFiles={onRefreshFiles}
              theme={theme}
            />
          ) : activeTab === 'images' ? (
            <ImagesPanel files={files} activeFile={activeFile} onLoadImage={onLoadImage} theme={theme} />
          ) : activeTab === 'layers' ? (
            <LayersPanel root={root} selectedId={selectedId} onSelect={onSelectElement} theme={theme} />
          ) : showMasterTools && activeTab === 'master' ? (
            <MasterFeaturePanel files={files} onAddElement={onAddElement} isVisible={isPanelOpen && activeTab === 'master'} theme={theme} />
          ) : (
            <Toolbox onAddElement={onAddElement} />
          )}
        </div>
      </div>
    </div>
  );
};

const hasSameFileList = (prevFiles: FileMap, nextFiles: FileMap): boolean => {
  if (prevFiles === nextFiles) return true;
  const prevKeys = Object.keys(prevFiles);
  const nextKeys = Object.keys(nextFiles);
  if (prevKeys.length !== nextKeys.length) return false;
  const nextSet = new Set(nextKeys);
  for (const key of prevKeys) {
    if (!nextSet.has(key)) return false;
  }
  return true;
};

const areSidebarPropsEqual = (
  prev: Readonly<SidebarProps>,
  next: Readonly<SidebarProps>,
): boolean => {
  return (
    hasSameFileList(prev.files, next.files) &&
    prev.projectPath === next.projectPath &&
    prev.activeFile === next.activeFile &&
    prev.onSelectFile === next.onSelectFile &&
    prev.onAddFontToPresentationCss === next.onAddFontToPresentationCss &&
    prev.onCreateFile === next.onCreateFile &&
    prev.onCreateFolder === next.onCreateFolder &&
    prev.onRenamePath === next.onRenamePath &&
    prev.onDeletePath === next.onDeletePath &&
    prev.onDuplicateFile === next.onDuplicateFile &&
    prev.onRefreshFiles === next.onRefreshFiles &&
    prev.onAddElement === next.onAddElement &&
    prev.root === next.root &&
    prev.selectedId === next.selectedId &&
    prev.onSelectElement === next.onSelectElement &&
    prev.interactionMode === next.interactionMode &&
    prev.setInteractionMode === next.setInteractionMode &&
    prev.drawElementTag === next.drawElementTag &&
    prev.setDrawElementTag === next.setDrawElementTag &&
    prev.theme === next.theme &&
    prev.showConfigButton === next.showConfigButton &&
    prev.onOpenConfig === next.onOpenConfig &&
    prev.onLoadImage === next.onLoadImage &&
    prev.isPanelOpen === next.isPanelOpen &&
    prev.showMasterTools === next.showMasterTools
  );
};

const Sidebar = React.memo(SidebarBase, areSidebarPropsEqual);
Sidebar.displayName = 'Sidebar';

export default Sidebar;
