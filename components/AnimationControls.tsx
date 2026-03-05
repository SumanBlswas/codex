import React from 'react';
import { PlayCircle, Clock, Zap, Repeat } from 'lucide-react';
import { ANIMATIONS } from '../constants';

interface AnimationControlsProps {
  element: any;
  onUpdateAnimation: (anim: string) => void;
  onUpdateStyle: (styles: Partial<React.CSSProperties>) => void;
}

const AnimationControls: React.FC<AnimationControlsProps> = ({ element, onUpdateAnimation, onUpdateStyle }) => {
  // Parse current animation string: "name duration timing-function delay iteration-count direction fill-mode"
  // e.g., "fadeIn 0.5s ease-in 0s 1 normal forwards"
  const currentAnim = element.animation || '';
  const parts = currentAnim.split(' ');
  const name = parts[0] || '';
  
  // Helpers to update specific parts of the animation shorthand
  // This is a bit naive, but works for the presets we have
  const updateAnimPart = (index: number, value: string) => {
     let newParts = [...parts];
     // Ensure we have enough parts to cover the index
     while (newParts.length <= index) newParts.push('0s'); // Default filler
     
     // Specific fix for presets
     if (index === 0) {
         // Changing the animation name usually resets everything to the preset's defaults
         const preset = ANIMATIONS.find(a => a.value.startsWith(value));
         if (preset) {
             onUpdateAnimation(preset.value);
             return;
         }
         newParts = [value, '1s', 'ease', '0s', '1', 'normal', 'forwards'];
     } else {
         newParts[index] = value;
     }
     
     onUpdateAnimation(newParts.join(' '));
  };
  
  return (
    <div className="space-y-4">
      {/* Animation Selector */}
      <div className="space-y-1">
         <label className="text-[10px] text-slate-500 font-medium uppercase tracking-wide flex items-center gap-1">
             <PlayCircle size={12} /> Entrance Animation
         </label>
         <select
           value={name}
           onChange={(e) => updateAnimPart(0, e.target.value)}
           className="w-full glass-input p-2 text-xs"
         >
            <option value="">None</option>
            {ANIMATIONS.map(a => {
                const val = a.value.split(' ')[0];
                return <option key={val} value={val}>{a.label}</option>;
            })}
         </select>
      </div>

      {name && (
          <div className="grid grid-cols-2 gap-3 animate-fadeIn">
             {/* Duration */}
             <div className="space-y-1">
                <label className="text-[10px] text-slate-500 flex items-center gap-1"><Clock size={10}/> Duration</label>
                <input 
                    type="text" 
                    className="w-full glass-input p-1.5 text-xs font-mono"
                    placeholder="0.5s" 
                    value={parts[1] || ''}
                    onChange={(e) => updateAnimPart(1, e.target.value)}
                />
             </div>

             {/* Delay */}
             <div className="space-y-1">
                 <label className="text-[10px] text-slate-500 flex items-center gap-1"><Clock size={10}/> Delay</label>
                 <input 
                    type="text" 
                    className="w-full glass-input p-1.5 text-xs font-mono"
                    placeholder="0s" 
                    value={parts[3] || ''}
                    onChange={(e) => updateAnimPart(3, e.target.value)}
                 />
             </div>
             
             {/* Iteration */}
             <div className="space-y-1">
                 <label className="text-[10px] text-slate-500 flex items-center gap-1"><Repeat size={10}/> Repeat</label>
                 <select 
                    className="w-full glass-input p-1.5 text-xs"
                    value={parts[4] || '1'}
                    onChange={(e) => updateAnimPart(4, e.target.value)}
                 >
                    <option value="1">Once</option>
                    <option value="2">Twice</option>
                    <option value="infinite">Loop</option>
                 </select>
             </div>
             
             {/* Timing */}
             <div className="space-y-1">
                 <label className="text-[10px] text-slate-500 flex items-center gap-1"><Zap size={10}/> Easing</label>
                 <select 
                    className="w-full glass-input p-1.5 text-xs"
                    value={parts[2] || 'ease'}
                    onChange={(e) => updateAnimPart(2, e.target.value)}
                 >
                    <option value="linear">Linear</option>
                    <option value="ease">Ease</option>
                    <option value="ease-in">Ease In</option>
                    <option value="ease-out">Ease Out</option>
                    <option value="ease-in-out">Ease In Out</option>
                    <option value="cubic-bezier(0.68, -0.55, 0.27, 1.55)">Bounce</option>
                 </select>
             </div>
          </div>
      )}
      
      {/* Scroll Trigger */}
      <div className="pt-2 border-t border-white/5">
        <label className="flex items-center gap-2 cursor-pointer group">
            <input 
                type="checkbox" 
                className="rounded bg-white/10 border-white/10 text-indigo-500 focus:ring-indigo-500/50"
                checked={element.className?.includes('reveal-on-scroll')}
                onChange={(e) => {
                    // This requires a way to update className which sits in `attributes` or a dedicated field
                    // `PropertiesPanel` needs to pass a handler for class updates or we use `onUpdateAttributes`
                    // Hacky way: assume we can update className via onUpdateAttributes or similar
                    // Actually, `element` has `className` prop in `types.ts`, but update logic in App.tsx might need tweak
                }}
            />
            <span className="text-xs text-slate-400 group-hover:text-slate-200 transition-colors">Trigger on Scroll</span>
        </label>
      </div>
    </div>
  );
};

export default AnimationControls;
