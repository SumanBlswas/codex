import React from 'react';
import { X, Circle } from 'lucide-react';

interface Tab {
  id: string;
  name: string;
  isDirty?: boolean;
}

interface TabsProps {
  tabs: Tab[];
  activeTabId: string | null;
  onTabClick: (id: string) => void;
  onTabClose: (id: string) => void;
}

const Tabs: React.FC<TabsProps> = ({ tabs, activeTabId, onTabClick, onTabClose }) => {
  return (
    <div className="flex items-center bg-slate-950 border-b border-slate-800 overflow-x-auto scrollbar-thin scrollbar-thumb-slate-700 h-9">
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className={`
            group flex items-center px-3 py-1 text-xs border-r border-slate-800 cursor-pointer select-none min-w-[100px] max-w-[200px] h-full transition-colors
            ${activeTabId === tab.id ? 'bg-slate-900 text-slate-100 border-t-2 border-t-blue-500' : 'bg-slate-950 text-slate-400 hover:bg-slate-900/50'}
          `}
          onClick={() => onTabClick(tab.id)}
        >
          <span className="truncate flex-1 mr-2">{tab.name}</span>
          <button
            onClick={(e) => { e.stopPropagation(); onTabClose(tab.id); }}
            className={`p-0.5 rounded-sm hover:bg-slate-700 opacity-0 group-hover:opacity-100 transition-opacity ${tab.isDirty ? 'hidden' : ''}`}
          >
            <X size={12} />
          </button>
          {tab.isDirty && <Circle size={8} fill="currentColor" className="text-slate-500" />}
        </div>
      ))}
    </div>
  );
};

export default Tabs;
