import React, { useState, useRef, useEffect } from "react";
import {
  Undo,
  Redo,
  Code,
  Eye,
  Save,
  MonitorSmartphone,
  FolderOpen,
  Smartphone,
  Monitor,
  MousePointer2,
  Play,
  Search,
  FilePlus,
  Settings2,
} from "lucide-react";

type MobileFrameStyle = "dynamic-island" | "punch-hole";
type DesktopResolution = "1080p" | "1.5k" | "2k" | "4k" | "resizable";

interface ToolbarProps {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  viewMode: "edit" | "code";
  onToggleView: () => void;
  onOpenFolder: () => void;
  onNewProject: () => void;
  onExport: () => void;
  onRunProject: () => void;
  deviceMode: "desktop" | "mobile";
  setDeviceMode: (mode: "desktop" | "mobile") => void;
  interactionMode: "edit" | "preview" | "inspect" | "draw";
  setInteractionMode: (mode: "edit" | "preview" | "inspect" | "draw") => void;
  drawElementTag: string;
  setDrawElementTag: (tag: string) => void;
  mobileFrameStyle: MobileFrameStyle;
  setMobileFrameStyle: (style: MobileFrameStyle) => void;
  desktopResolution: DesktopResolution;
  setDesktopResolution: (res: DesktopResolution) => void;
  onOpenSettings?: () => void;
}

// --- Context Menu Component ---
interface ContextMenuItem {
  label: string;
  value: string;
  active: boolean;
  icon?: string;
}

const ContextMenu: React.FC<{
  items: ContextMenuItem[];
  position: { x: number; y: number };
  onSelect: (value: string) => void;
  onClose: () => void;
}> = ({ items, position, onSelect, onClose }) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="fixed z-[200] py-1 rounded-xl overflow-hidden animate-fadeIn"
      style={{
        left: position.x,
        top: position.y,
        minWidth: "180px",
        background: "var(--bg-glass-strong)",
        backdropFilter: "blur(24px)",
        border: "1px solid var(--border-color)",
        boxShadow: "0 12px 40px -8px rgba(0,0,0,0.45)",
      }}
    >
      {items.map((item, i) => (
        <button
          key={item.value}
          onClick={() => {
            onSelect(item.value);
            onClose();
          }}
          className="w-full px-3 py-2 text-left text-[12px] font-medium flex items-center gap-2 transition-all duration-150"
          style={{
            color: item.active ? "var(--accent-primary)" : "var(--text-main)",
            backgroundColor: item.active ? "var(--accent-glow)" : "transparent",
          }}
          onMouseEnter={(e) => {
            if (!item.active)
              e.currentTarget.style.backgroundColor = "var(--input-bg)";
          }}
          onMouseLeave={(e) => {
            if (!item.active)
              e.currentTarget.style.backgroundColor = "transparent";
          }}
        >
          {item.icon && <span className="text-sm">{item.icon}</span>}
          <span>{item.label}</span>
          {item.active && (
            <span className="ml-auto text-[10px] opacity-60">✓</span>
          )}
        </button>
      ))}
    </div>
  );
};

const Toolbar: React.FC<ToolbarProps> = ({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  viewMode,
  onToggleView,
  onOpenFolder,
  onNewProject,
  onExport,
  onRunProject,
  deviceMode,
  setDeviceMode,
  interactionMode,
  setInteractionMode,
  drawElementTag,
  setDrawElementTag,
  mobileFrameStyle,
  setMobileFrameStyle,
  desktopResolution,
  setDesktopResolution,
  onOpenSettings,
}) => {
  const [contextMenu, setContextMenu] = useState<{
    type: "mobile" | "desktop";
    x: number;
    y: number;
  } | null>(null);

  const handleDesktopContext = (e: React.MouseEvent) => {
    e.preventDefault();
    setDeviceMode("desktop");
    setContextMenu({ type: "desktop", x: e.clientX, y: e.clientY });
  };

  const handleMobileContext = (e: React.MouseEvent) => {
    e.preventDefault();
    setDeviceMode("mobile");
    setContextMenu({ type: "mobile", x: e.clientX, y: e.clientY });
  };

  const mobileMenuItems: ContextMenuItem[] = [
    {
      label: "iPhone — Dynamic Island",
      value: "dynamic-island",
      active: mobileFrameStyle === "dynamic-island",
      icon: "📱",
    },
    {
      label: "Android — Punch Hole",
      value: "punch-hole",
      active: mobileFrameStyle === "punch-hole",
      icon: "🤖",
    },
  ];

  const desktopMenuItems: ContextMenuItem[] = [
    {
      label: "1080p  (1920 × 1080)",
      value: "1080p",
      active: desktopResolution === "1080p",
      icon: "🖥️",
    },
    {
      label: "1.5K   (2560 × 1440)",
      value: "1.5k",
      active: desktopResolution === "1.5k",
      icon: "🖥️",
    },
    {
      label: "2K     (2560 × 1440)",
      value: "2k",
      active: desktopResolution === "2k",
      icon: "🖥️",
    },
    {
      label: "4K     (3840 × 2160)",
      value: "4k",
      active: desktopResolution === "4k",
      icon: "🖥️",
    },
    {
      label: "Resizable",
      value: "resizable",
      active: desktopResolution === "resizable",
      icon: "↔️",
    },
  ];

  return (
    <>
      <div className="h-16 glass-panel border-b-0 flex items-center justify-between px-6 z-20 shrink-0">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-br from-indigo-500 to-violet-600 p-2 rounded-lg shadow-lg shadow-indigo-900/50">
            <MonitorSmartphone className="text-white w-6 h-6" />
          </div>
          <h1 className="font-bold text-xl text-slate-100 tracking-tight hidden md:block">
            Nocode-X <span className="text-indigo-400">Studio</span>
          </h1>
        </div>

        <div className="flex items-center gap-4">
          {viewMode === "edit" && (
            <div className="flex items-center gap-1 bg-slate-900/50 p-1 rounded-lg border border-slate-700/50">
              <button
                onClick={() => setDeviceMode("desktop")}
                onContextMenu={handleDesktopContext}
                className={`p-2 rounded-md transition-all ${deviceMode === "desktop" ? "bg-indigo-600 text-white shadow-sm" : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"}`}
                title="Desktop View (right-click for options)"
              >
                <Monitor size={18} />
              </button>
              <button
                onClick={() => setDeviceMode("mobile")}
                onContextMenu={handleMobileContext}
                className={`p-2 rounded-md transition-all ${deviceMode === "mobile" ? "bg-indigo-600 text-white shadow-sm" : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"}`}
                title="Mobile View (right-click for options)"
              >
                <Smartphone size={18} />
              </button>
            </div>
          )}

          <div className="flex items-center gap-2 bg-slate-900/50 p-1 rounded-lg border border-slate-700/50">
            <button
              onClick={onUndo}
              disabled={!canUndo}
              className="p-2 text-slate-400 hover:bg-slate-800 hover:text-indigo-400 rounded-md disabled:opacity-30 disabled:hover:bg-transparent transition-all"
              title="Undo (Ctrl+Z)"
            >
              <Undo size={18} />
            </button>
            <button
              onClick={onRedo}
              disabled={!canRedo}
              className="p-2 text-slate-400 hover:bg-slate-800 hover:text-indigo-400 rounded-md disabled:opacity-30 disabled:hover:bg-transparent transition-all"
              title="Redo (Ctrl+Shift+Z)"
            >
              <Redo size={18} />
            </button>
          </div>

          {/* Interaction Mode Toggle */}
          {viewMode === "edit" && (
            <div className="flex items-center gap-1 bg-slate-900/50 p-1 rounded-lg border border-slate-700/50">
              <button
                onClick={() => setInteractionMode("edit")}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                  interactionMode === "edit"
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                }`}
              >
                <MousePointer2 size={16} />{" "}
                <span className="hidden lg:inline">Edit</span>
              </button>
              <button
                onClick={() => setInteractionMode("inspect")}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                  interactionMode === "inspect"
                    ? "bg-violet-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                }`}
              >
                <Search size={16} />{" "}
                <span className="hidden lg:inline">Inspect</span>
              </button>
              <button
                onClick={() => setInteractionMode("preview")}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                  interactionMode === "preview"
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                }`}
              >
                <Play size={16} />{" "}
                <span className="hidden lg:inline">Preview</span>
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={onNewProject}
            className="flex items-center gap-2 px-3 py-2 text-slate-300 hover:bg-slate-800 hover:text-white rounded-md font-medium text-sm transition-colors border border-transparent hover:border-slate-700"
            title="New Project"
          >
            <FilePlus size={16} /> <span className="hidden sm:inline">New</span>
          </button>

          {onOpenSettings && (
            <button
              onClick={onOpenSettings}
              className="flex items-center gap-2 px-3 py-2 text-slate-300 hover:bg-slate-800 hover:text-white rounded-md font-medium text-sm transition-colors border border-transparent hover:border-slate-700"
              title="Presentation Settings"
            >
              <Settings2 size={16} />{" "}
              <span className="hidden sm:inline">Settings</span>
            </button>
          )}

          <button
            onClick={onOpenFolder}
            className="flex items-center gap-2 px-3 py-2 text-slate-300 hover:bg-slate-800 hover:text-white rounded-md font-medium text-sm transition-colors border border-transparent hover:border-slate-700"
            title="Open Project Folder"
          >
            <FolderOpen size={16} /> <span className="sm:inline">Open</span>
          </button>

          <button
            onClick={onRunProject}
            className="flex items-center gap-2 px-3 py-2 text-green-400 hover:bg-green-900/30 hover:text-green-300 rounded-md font-medium text-sm transition-colors border border-green-900/50 hover:border-green-700"
            title="Run Project"
          >
            <Play size={16} /> <span className="hidden sm:inline">Run</span>
          </button>

          <button
            onClick={onToggleView}
            className={`flex items-center gap-2 px-4 py-2 rounded-md font-medium text-sm transition-all border ${
              viewMode === "code"
                ? "bg-slate-800 text-white border-slate-700 shadow-inner"
                : "glass-button"
            }`}
          >
            {viewMode === "code" ? (
              <>
                <Eye size={16} /> Visual
              </>
            ) : (
              <>
                <Code size={16} /> Code
              </>
            )}
          </button>

          <button
            onClick={onExport}
            className="hidden sm:flex items-center gap-2 px-4 py-2 glass-button-primary rounded-md font-medium text-sm transition-colors"
          >
            <Save size={16} /> Export
          </button>
        </div>
      </div>

      {/* Context Menus */}
      {contextMenu?.type === "mobile" && (
        <ContextMenu
          items={mobileMenuItems}
          position={{ x: contextMenu.x, y: contextMenu.y }}
          onSelect={(v) => setMobileFrameStyle(v as MobileFrameStyle)}
          onClose={() => setContextMenu(null)}
        />
      )}
      {contextMenu?.type === "desktop" && (
        <ContextMenu
          items={desktopMenuItems}
          position={{ x: contextMenu.x, y: contextMenu.y }}
          onSelect={(v) => setDesktopResolution(v as DesktopResolution)}
          onClose={() => setContextMenu(null)}
        />
      )}
    </>
  );
};

export default Toolbar;
