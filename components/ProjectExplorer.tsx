import React, { useState } from 'react';
import { Folder, File, ChevronRight, ChevronDown, FileCode, FileImage, FileJson, FileType, Plus, Trash2, Edit2 } from 'lucide-react';

export interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileNode[];
}

interface ProjectExplorerProps {
  files: FileNode[];
  onFileSelect: (path: string) => void;
}

const FileIcon = ({ name }: { name: string }) => {
  const ext = name.split('.').pop()?.toLowerCase();
  if (['ts', 'tsx', 'js', 'jsx'].includes(ext || '')) return <FileCode size={16} className="text-blue-400" />;
  if (['css', 'scss'].includes(ext || '')) return <FileType size={16} className="text-pink-400" />;
  if (['json'].includes(ext || '')) return <FileJson size={16} className="text-yellow-400" />;
  if (['png', 'jpg', 'jpeg', 'svg', 'gif'].includes(ext || '')) return <FileImage size={16} className="text-purple-400" />;
  return <File size={16} className="text-slate-400" />;
};

interface FileTreeItemProps {
  node: FileNode;
  level: number;
  onSelect: (path: string) => void;
}

const FileTreeItem: React.FC<FileTreeItemProps> = ({ node, level, onSelect }) => {
  const [isOpen, setIsOpen] = useState(false);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (node.type === 'directory') {
      setIsOpen(!isOpen);
    } else {
      onSelect(node.path);
    }
  };

  return (
    <div className="select-none">
      <div
        className={`flex items-center py-1 px-2 cursor-pointer hover:bg-slate-800/50 transition-colors ${level > 0 ? 'ml-4' : ''}`}
        onClick={handleClick}
      >
        <span className="mr-1 opacity-70 w-4 flex justify-center">
          {node.type === 'directory' && (
            isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />
          )}
        </span>
        <span className="mr-2">
            {node.type === 'directory' ? <Folder size={16} className="text-amber-500" /> : <FileIcon name={node.name} />}
        </span>
        <span className="text-sm text-slate-300 truncate">{node.name}</span>
      </div>
      {isOpen && node.children && (
        <div className="border-l border-slate-800 ml-2">
          {node.children.map((child) => (
            <FileTreeItem key={child.path} node={child} level={level + 1} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  );
};

const ProjectExplorer: React.FC<ProjectExplorerProps> = ({ files, onFileSelect }) => {
  return (
    <div className="h-full bg-slate-950/50 backdrop-blur-md overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-slate-700 select-none">
      <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 px-2">Explorer</div>
      {files.map((node) => (
        <FileTreeItem key={node.path} node={node} level={0} onSelect={onFileSelect} />
      ))}
       {files.length === 0 && (
            <div className="text-center text-slate-600 text-sm mt-10 italic">
                No project open
            </div>
       )}
    </div>
  );
};

export default ProjectExplorer;
