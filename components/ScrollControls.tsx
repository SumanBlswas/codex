import React from 'react';
import { MousePointer2, MoveVertical, LayoutGrid, EyeOff, Layers, ArrowUpCircle } from 'lucide-react';

interface ScrollControlsProps {
  styles: React.CSSProperties;
  onChange: (styles: Partial<React.CSSProperties>) => void;
}

const ScrollControls: React.FC<ScrollControlsProps> = ({ styles, onChange }) => {
  const currentOverflowY = styles.overflowY || styles.overflow || 'visible';
  const currentSnapType = styles.scrollSnapType || 'none';
  const currentSnapAlign = styles.scrollSnapAlign || 'none';
  
  return (
    <div className="space-y-4">
      {/* Container Settings */}
      <div className="space-y-2">
        <label className="text-[10px] text-slate-500 font-medium uppercase tracking-wide flex items-center gap-1">
             <Layers size={12} /> Container Scrolling
        </label>
        
        <div className="grid grid-cols-2 gap-2">
             <button
               onClick={() => onChange({ overflowY: 'visible' })}
               className={`glass-button px-3 py-2 rounded-md text-xs flex items-center justify-center gap-2 ${currentOverflowY === 'visible' ? 'active bg-indigo-500/20 text-indigo-300 border-indigo-500/30' : ''}`}
             >
                <EyeOff size={14} /> None
             </button>
             <button
               onClick={() => onChange({ overflowY: 'scroll', scrollBehavior: 'smooth' })}
               className={`glass-button px-3 py-2 rounded-md text-xs flex items-center justify-center gap-2 ${currentOverflowY === 'scroll' ? 'active bg-indigo-500/20 text-indigo-300 border-indigo-500/30' : ''}`}
             >
                <MoveVertical size={14} /> Scroll
             </button>
        </div>
      </div>

      {currentOverflowY === 'scroll' && (
          <div className="space-y-3 pl-2 border-l border-white/10 animate-fadeIn">
             <div className="space-y-1">
                <label className="text-[10px] text-slate-500">Snap Type</label>
                <select
                   value={String(currentSnapType)}
                   onChange={(e) => onChange({ scrollSnapType: e.target.value })}
                   className="w-full glass-input p-1.5 text-xs"
                >
                    <option value="none">None</option>
                    <option value="y mandatory">Vertical (Mandatory)</option>
                    <option value="y proximity">Vertical (Proximity)</option>
                    <option value="x mandatory">Horizontal (Mandatory)</option>
                    <option value="both mandatory">Both</option>
                </select>
             </div>
             
             <div className="flex items-center justify-between">
                <label className="text-[10px] text-slate-500">Hide Scrollbar</label>
                <input 
                    type="checkbox" 
                    onChange={(e) => {
                       // We can't easily toggle a class here without changing the data model to support classes better.
                       // For now, let's assume we toggle a specific style or use a workaround.
                       // Ideally, we'd add 'no-scrollbar' class.
                       // Since we only control inline styles here, detailed scrollbar styling is limited without class manipulation.
                       // Placeholder for now.
                    }}
                    className="rounded bg-slate-800 border-slate-700"
                />
             </div>
          </div>
      )}

      {/* Child Settings */}
      <div className="space-y-2 pt-2 border-t border-white/5">
        <label className="text-[10px] text-slate-500 font-medium uppercase tracking-wide flex items-center gap-1">
             <LayoutGrid size={12} /> Child Snap Alignment
        </label>
        <div className="grid grid-cols-4 gap-1">
             {['none', 'start', 'center', 'end'].map((align) => (
                <button
                    key={align}
                    onClick={() => onChange({ scrollSnapAlign: align })}
                    className={`glass-button p-1.5 rounded-md text-[10px] capitalize ${currentSnapAlign === align ? 'active bg-indigo-500/20 text-indigo-300' : ''}`}
                >
                    {align}
                </button>
             ))}
        </div>
      </div>
    </div>
  );
};

export default ScrollControls;
