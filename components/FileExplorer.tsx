import React, { useEffect, useMemo, useState } from 'react';
import { FileMap, ProjectFile } from '../types';
import {
  FileText,
  Image as ImageIcon,
  FileCode,
  FileType,
  FolderOpen,
  Folder,
  ChevronRight,
  ChevronDown,
  FilePlus2,
  FolderPlus,
  RefreshCw,
  Pencil,
  Trash2,
  Copy,
} from 'lucide-react';

interface FileExplorerProps {
  files: FileMap;
  activeFile: string | null;
  onSelectFile: (path: string) => void;
  onAddFontToPresentationCss?: (path: string) => void;
  onCreateFile?: (parentPath: string) => void;
  onCreateFolder?: (parentPath: string) => void;
  onRenamePath?: (path: string) => void;
  onDeletePath?: (path: string, kind: 'file' | 'folder') => void;
  onDuplicateFile?: (path: string) => void;
  onRefreshFiles?: () => void;
  projectPath: string | null;
  theme: 'light' | 'dark';
}

interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'folder';
  fileType?: ProjectFile['type'];
  relativePath: string;
  children: Record<string, TreeNode>;
}

type ExplorerContextMenu = {
  x: number;
  y: number;
  node: TreeNode;
};

const getParentVirtualPath = (path: string): string => {
  const normalized = String(path || '').replace(/\\/g, '/').replace(/\/+$/, '');
  if (!normalized) return '';
  const index = normalized.lastIndexOf('/');
  if (index <= 0) return '';
  return normalized.slice(0, index);
};

const isSlideFolderPath = (path: string): boolean => {
  const normalized = String(path || '').replace(/\\/g, '/').replace(/\/+$/, '');
  const name = normalized.includes('/') ? normalized.slice(normalized.lastIndexOf('/') + 1) : normalized;
  return /_[0-9]{3,}$/i.test(name);
};

const FileExplorerBase: React.FC<FileExplorerProps> = ({
  files,
  activeFile,
  onSelectFile,
  onAddFontToPresentationCss,
  onCreateFile,
  onCreateFolder,
  onRenamePath,
  onDeletePath,
  onDuplicateFile,
  onRefreshFiles,
  projectPath,
  theme,
}) => {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<ExplorerContextMenu | null>(null);

  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener('click', close);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [contextMenu]);

  // Handle active file path resolution and auto-scroll
  useEffect(() => {
    if (!activeFile) return;

    let relativePath = activeFile.replace(/\\/g, '/');
    if (projectPath) {
      const normalizedRoot = projectPath.replace(/\\/g, '/');
      if (relativePath.startsWith(normalizedRoot)) {
        relativePath = relativePath.slice(normalizedRoot.length);
        if (relativePath.startsWith('/')) relativePath = relativePath.slice(1);
      }
    }

    const parts = relativePath.split('/').filter(Boolean);

    // Incrementally expand folders instead of replacing the state
    if (parts.length > 1) {
      setExpandedFolders((prev) => {
        const next = new Set(prev);
        let changed = false;
        for (let i = 0; i < parts.length - 1; i += 1) {
          const folderPath = parts.slice(0, i + 1).join('/');
          if (!next.has(folderPath)) {
            next.add(folderPath);
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }

    // Attempt to scroll the active file into view smoothly
    const scrollTimer = setTimeout(() => {
      try {
        const safeId = `file-node-${relativePath.replace(/[^a-zA-Z0-9]/g, '-')}`;
        const el = document.getElementById(safeId);
        if (el) {
          el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      } catch (err) {
        // Ignore scroll errors
      }
    }, 100);

    return () => clearTimeout(scrollTimer);
  }, [activeFile, projectPath]);

  const fileTree = useMemo(() => {
    const root: TreeNode = { name: 'root', path: '', type: 'folder', relativePath: '', children: {} };

    (Object.values(files) as ProjectFile[]).forEach((file) => {
      let relativePath = file.path;
      if (projectPath) {
        const normalizedFile = file.path.replace(/\\/g, '/');
        const normalizedRoot = projectPath.replace(/\\/g, '/');
        if (normalizedFile.startsWith(normalizedRoot)) {
          relativePath = normalizedFile.substring(normalizedRoot.length);
          if (relativePath.startsWith('/')) relativePath = relativePath.substring(1);
        }
      }

      const parts = relativePath.split('/');
      let current = root;

      parts.forEach((part, index) => {
        if (!part) return;
        const isFile = index === parts.length - 1;
        const relativeNodePath = parts.slice(0, index + 1).join('/');

        if (!current.children[part]) {
          const isActuallyFolder = isFile && file.isDirectory;
          current.children[part] = {
            name: part,
            path: relativeNodePath,
            type: isFile && !isActuallyFolder ? 'file' : 'folder',
            fileType: isFile && !isActuallyFolder ? file.type : undefined,
            relativePath: relativeNodePath,
            children: {},
          };
        }
        current = current.children[part];
      });
    });

    return root;
  }, [files, projectPath]);

  const toggleFolder = (path: string, event: React.MouseEvent) => {
    event.stopPropagation();
    const nextExpanded = new Set(expandedFolders);
    if (nextExpanded.has(path)) nextExpanded.delete(path);
    else nextExpanded.add(path);
    setExpandedFolders(nextExpanded);
  };

  const findPreferredHtmlPath = (folderNode: TreeNode): string | null => {
    const children = Object.values(folderNode.children) as TreeNode[];
    const directFiles = children
      .filter((child) => child.type === 'file' && child.fileType === 'html')
      .sort((a, b) => a.name.localeCompare(b.name));

    const directIndex = directFiles.find((file) => file.name.toLowerCase() === 'index.html');
    if (directIndex) return directIndex.path;
    if (directFiles.length > 0) return directFiles[0].path;

    const subFolders = children
      .filter((child) => child.type === 'folder')
      .sort((a, b) => a.name.localeCompare(b.name));

    for (const sub of subFolders) {
      const nested = findPreferredHtmlPath(sub);
      if (nested) return nested;
    }
    return null;
  };

  const getFileIcon = (type: ProjectFile['type']) => {
    switch (type) {
      case 'html':
        return <FileCode size={16} style={{ color: '#f97316' }} />;
      case 'css':
        return <FileType size={16} style={{ color: '#60a5fa' }} />;
      case 'js':
        return <FileText size={16} style={{ color: '#facc15' }} />;
      case 'image':
        return <ImageIcon size={16} style={{ color: '#a855f7' }} />;
      default:
        return <FileText size={16} style={{ color: 'var(--text-muted)' }} />;
    }
  };

  const renderNode = (node: TreeNode, depth: number) => {
    const isExpanded = expandedFolders.has(node.path);

    const isSelected = Boolean(
      activeFile &&
      activeFile.replace(/\\/g, '/') === node.path.replace(/\\/g, '/')
    );

    const sortedChildren = (Object.values(node.children) as TreeNode[]).sort((a, b) => {
      if (a.type === b.type) return a.name.localeCompare(b.name);
      return a.type === 'folder' ? -1 : 1;
    });

    return (
      <div key={node.path} style={{ paddingLeft: depth === 0 ? 0 : 12 }}>
        {node.path !== '' && (
          <div
            id={`file-node-${node.path.replace(/[^a-zA-Z0-9]/g, '-')}`}
            className={`flex items-center gap-1.5 p-1.5 rounded cursor-pointer text-sm mb-0.5 transition-all select-none ${isSelected ? 'shadow-sm' : ''
              }`}
            style={{
              backgroundColor: isSelected
                ? theme === 'dark'
                  ? 'rgba(79, 70, 229, 0.45)'
                  : 'var(--accent-glow)'
                : 'transparent',
              color: isSelected
                ? theme === 'dark'
                  ? '#eef2ff'
                  : 'var(--accent-primary)'
                : 'var(--text-main)',
              fontWeight: isSelected ? 600 : 400,
              border: isSelected
                ? theme === 'dark'
                  ? '1px solid rgba(129, 140, 248, 0.55)'
                  : '1px solid transparent'
                : '1px solid transparent',
            }}
            onMouseEnter={(event) => {
              if (!isSelected) {
                event.currentTarget.style.backgroundColor =
                  theme === 'dark' ? 'rgba(148,163,184,0.10)' : 'var(--input-bg)';
              }
            }}
            onMouseLeave={(event) => {
              if (!isSelected) event.currentTarget.style.backgroundColor = 'transparent';
            }}
            onClick={(event) => {
              if (node.type === 'folder') {
                toggleFolder(node.path, event);
                if (isSlideFolderPath(node.path)) {
                  const nextHtml = findPreferredHtmlPath(node);
                  if (nextHtml) onSelectFile(nextHtml);
                }
              } else {
                onSelectFile(node.path);
              }
            }}
            onContextMenu={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setContextMenu({
                x: event.clientX,
                y: event.clientY,
                node,
              });
            }}
            title={node.name}
          >
            {node.type === 'folder' && (
              <span className="shrink-0" style={{ color: 'var(--text-muted)' }}>
                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </span>
            )}
            {node.type === 'folder' ? (
              isExpanded ? (
                <FolderOpen
                  size={16}
                  className="shrink-0"
                  style={{ color: theme === 'dark' ? '#ffffff' : 'var(--accent-primary)' }}
                />
              ) : (
                <Folder
                  size={16}
                  className="shrink-0"
                  style={{ color: theme === 'dark' ? '#ffffff' : 'var(--accent-primary)' }}
                />
              )
            ) : (
              <span className="shrink-0" style={{ marginLeft: '22px' }}>
                {getFileIcon(node.fileType as any)}
              </span>
            )}
            <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{node.name}</span>
          </div>
        )}

        {node.type === 'folder' && (isExpanded || node.path === '') && (
          <div className="ml-2.5" style={{ borderLeft: '1px solid var(--border-color)' }}>
            {sortedChildren.map((child) => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const contextNode = contextMenu?.node ?? null;
  const contextIsFolder = contextNode?.type === 'folder';
  const contextFolderPath = contextNode
    ? contextNode.type === 'folder'
      ? contextNode.path
      : getParentVirtualPath(contextNode.path)
    : '';
  const canDuplicate = contextNode?.type === 'file';
  const canAddFontFace =
    contextNode?.type === 'file' &&
    contextNode.fileType === 'font' &&
    typeof onAddFontToPresentationCss === 'function';

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden" style={{ backgroundColor: 'var(--bg-glass)', color: 'var(--text-main)' }}>
      <div
        className="p-3 font-semibold flex items-center justify-between gap-2 text-sm uppercase tracking-wide"
        style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-main)' }}
      >
        <div className="flex items-center gap-2">
          <FolderOpen size={18} />
          <span>Files</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            title="New File"
            className="p-1 rounded hover:bg-black/10 transition-colors"
            onClick={() => onCreateFile?.('')}
          >
            <FilePlus2 size={14} />
          </button>
          <button
            type="button"
            title="New Folder"
            className="p-1 rounded hover:bg-black/10 transition-colors"
            onClick={() => onCreateFolder?.('')}
          >
            <FolderPlus size={14} />
          </button>
          <button
            type="button"
            title="Refresh File Index"
            className="p-1 rounded hover:bg-black/10 transition-colors"
            onClick={() => onRefreshFiles?.()}
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>
      <div
        className="flex-1 min-h-0 overflow-y-auto p-2 custom-scrollbar"
        style={{ overscrollBehavior: 'contain' }}
      >
        {Object.keys(fileTree.children).length === 0 ? (
          <div className="text-xs text-center mt-10" style={{ color: 'var(--text-muted)' }}>
            No files loaded.
            <br />
            Open a project folder.
          </div>
        ) : (
          (Object.values(fileTree.children) as TreeNode[])
            .sort((a, b) => {
              if (a.type === b.type) return a.name.localeCompare(b.name);
              return a.type === 'folder' ? -1 : 1;
            })
            .map((child) => renderNode(child, 0))
        )}
      </div>
      {contextMenu && contextNode && (
        <div
          className="fixed z-[4000] min-w-[220px] rounded-lg border shadow-xl backdrop-blur-md p-1"
          style={{
            left: contextMenu.x,
            top: contextMenu.y,
            backgroundColor: theme === 'dark' ? 'rgba(15,23,42,0.95)' : 'rgba(255,255,255,0.96)',
            borderColor: theme === 'dark' ? 'rgba(148,163,184,0.35)' : 'rgba(148,163,184,0.3)',
          }}
        >
          <button
            type="button"
            className="w-full text-left px-3 py-2 rounded text-xs font-medium transition-colors flex items-center gap-2"
            style={{ color: theme === 'dark' ? '#e2e8f0' : '#0f172a' }}
            onMouseEnter={(event) => {
              event.currentTarget.style.backgroundColor =
                theme === 'dark' ? 'rgba(56,189,248,0.18)' : 'rgba(14,165,233,0.14)';
            }}
            onMouseLeave={(event) => {
              event.currentTarget.style.backgroundColor = 'transparent';
            }}
            onClick={() => {
              onCreateFile?.(contextFolderPath);
              setContextMenu(null);
            }}
          >
            <FilePlus2 size={13} />
            New File Here
          </button>
          <button
            type="button"
            className="w-full text-left px-3 py-2 rounded text-xs font-medium transition-colors flex items-center gap-2"
            style={{ color: theme === 'dark' ? '#e2e8f0' : '#0f172a' }}
            onMouseEnter={(event) => {
              event.currentTarget.style.backgroundColor =
                theme === 'dark' ? 'rgba(56,189,248,0.18)' : 'rgba(14,165,233,0.14)';
            }}
            onMouseLeave={(event) => {
              event.currentTarget.style.backgroundColor = 'transparent';
            }}
            onClick={() => {
              onCreateFolder?.(contextFolderPath);
              setContextMenu(null);
            }}
          >
            <FolderPlus size={13} />
            New Folder Here
          </button>
          {canDuplicate && (
            <button
              type="button"
              className="w-full text-left px-3 py-2 rounded text-xs font-medium transition-colors flex items-center gap-2"
              style={{ color: theme === 'dark' ? '#e2e8f0' : '#0f172a' }}
              onMouseEnter={(event) => {
                event.currentTarget.style.backgroundColor =
                  theme === 'dark' ? 'rgba(56,189,248,0.18)' : 'rgba(14,165,233,0.14)';
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.backgroundColor = 'transparent';
              }}
              onClick={() => {
                onDuplicateFile?.(contextNode.path);
                setContextMenu(null);
              }}
            >
              <Copy size={13} />
              Duplicate
            </button>
          )}
          <button
            type="button"
            className="w-full text-left px-3 py-2 rounded text-xs font-medium transition-colors flex items-center gap-2"
            style={{ color: theme === 'dark' ? '#e2e8f0' : '#0f172a' }}
            onMouseEnter={(event) => {
              event.currentTarget.style.backgroundColor =
                theme === 'dark' ? 'rgba(56,189,248,0.18)' : 'rgba(14,165,233,0.14)';
            }}
            onMouseLeave={(event) => {
              event.currentTarget.style.backgroundColor = 'transparent';
            }}
            onClick={() => {
              onRenamePath?.(contextNode.path);
              setContextMenu(null);
            }}
          >
            <Pencil size={13} />
            Rename
          </button>
          <button
            type="button"
            className="w-full text-left px-3 py-2 rounded text-xs font-medium transition-colors flex items-center gap-2"
            style={{ color: '#ef4444' }}
            onMouseEnter={(event) => {
              event.currentTarget.style.backgroundColor =
                theme === 'dark' ? 'rgba(239,68,68,0.18)' : 'rgba(239,68,68,0.12)';
            }}
            onMouseLeave={(event) => {
              event.currentTarget.style.backgroundColor = 'transparent';
            }}
            onClick={() => {
              onDeletePath?.(contextNode.path, contextIsFolder ? 'folder' : 'file');
              setContextMenu(null);
            }}
          >
            <Trash2 size={13} />
            Delete
          </button>
          {canAddFontFace && (
            <button
              type="button"
              className="w-full text-left px-3 py-2 rounded text-xs font-medium transition-colors"
              style={{ color: theme === 'dark' ? '#e2e8f0' : '#0f172a' }}
              onMouseEnter={(event) => {
                event.currentTarget.style.backgroundColor =
                  theme === 'dark' ? 'rgba(56,189,248,0.18)' : 'rgba(14,165,233,0.14)';
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.backgroundColor = 'transparent';
              }}
              onClick={() => {
                onAddFontToPresentationCss?.(contextNode.path);
                setContextMenu(null);
              }}
            >
              Add @font-face to presentation.css
            </button>
          )}
          <div className="px-3 pt-1 pb-1 text-[10px]" style={{ color: theme === 'dark' ? '#94a3b8' : '#64748b' }}>
            {contextNode.name}
          </div>
        </div>
      )}
    </div>
  );
};

const hasSameFileStructure = (prevFiles: FileMap, nextFiles: FileMap): boolean => {
  if (prevFiles === nextFiles) return true;
  const prevKeys = Object.keys(prevFiles);
  const nextKeys = Object.keys(nextFiles);
  if (prevKeys.length !== nextKeys.length) return false;

  for (const key of prevKeys) {
    const prev = prevFiles[key];
    const next = nextFiles[key];
    if (!prev || !next) return false;
    if (
      prev.path !== next.path ||
      prev.name !== next.name ||
      prev.type !== next.type ||
      Boolean(prev.isDirectory) !== Boolean(next.isDirectory)
    ) {
      return false;
    }
  }
  return true;
};

const areFileExplorerPropsEqual = (
  prev: Readonly<FileExplorerProps>,
  next: Readonly<FileExplorerProps>,
): boolean => {
  return (
    hasSameFileStructure(prev.files, next.files) &&
    prev.activeFile === next.activeFile &&
    prev.projectPath === next.projectPath &&
    prev.theme === next.theme &&
    prev.onSelectFile === next.onSelectFile &&
    prev.onAddFontToPresentationCss === next.onAddFontToPresentationCss &&
    prev.onCreateFile === next.onCreateFile &&
    prev.onCreateFolder === next.onCreateFolder &&
    prev.onRenamePath === next.onRenamePath &&
    prev.onDeletePath === next.onDeletePath &&
    prev.onDuplicateFile === next.onDuplicateFile &&
    prev.onRefreshFiles === next.onRefreshFiles
  );
};

const FileExplorer = React.memo(FileExplorerBase, areFileExplorerPropsEqual);
FileExplorer.displayName = 'FileExplorer';

export default FileExplorer;