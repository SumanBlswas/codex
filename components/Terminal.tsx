import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as Neutralino from '@neutralinojs/lib';

const MAX_TERMINAL_LINES = 500;

const TerminalBase: React.FC = () => {
  const [output, setOutput] = useState<string[]>(['> Ready.']);
  const [input, setInput] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const appendOutput = useCallback((lines: string[]) => {
    if (lines.length === 0) return;
    setOutput(prev => {
      const next = [...prev, ...lines];
      return next.length > MAX_TERMINAL_LINES
        ? next.slice(next.length - MAX_TERMINAL_LINES)
        : next;
    });
  }, []);

  const executeCommand = async (cmd: string) => {
    if (!cmd.trim()) return;
    
    appendOutput([`$ ${cmd}`]);
    try {
        // @ts-ignore
      const result = await Neutralino.os.execCommand(cmd);
      const lines = result.stdOut.split('\n').filter(Boolean);
      const errors = result.stdErr.split('\n').filter(Boolean);
      appendOutput([...lines, ...errors]);
    } catch (e) {
      appendOutput([`Error: ${JSON.stringify(e)}`]);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      executeCommand(input);
      setInput('');
    }
  };

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'auto' });
  }, [output]);

  return (
    <div 
      className="h-full font-mono text-xs p-3 overflow-hidden flex flex-col"
      style={{ backgroundColor: 'transparent', color: 'var(--text-main)' }}
    >
      <div className="flex-1 overflow-y-auto mb-2 space-y-1.5 no-scrollbar">
        {output.map((line, i) => (
          <div 
            key={i} 
            className="break-words whitespace-pre-wrap px-2.5 py-1.5 rounded-md border"
            style={{
              borderColor: 'var(--border-color)',
              backgroundColor: line.startsWith('$')
                ? 'rgba(59, 130, 246, 0.08)'
                : line.startsWith('Error')
                  ? 'rgba(239, 68, 68, 0.10)'
                  : 'rgba(15, 23, 42, 0.05)',
              color: line.startsWith('$')
                ? '#2563eb'
                : line.startsWith('Error')
                  ? '#dc2626'
                  : 'var(--text-main)',
            }}
          >
            {line}
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <div
        className="flex items-center gap-2 p-2 rounded-lg shrink-0"
        style={{
          border: '1px solid var(--border-color)',
          backgroundColor: 'rgba(15, 23, 42, 0.04)',
        }}
      >
        <span className="font-bold text-[11px] px-2 py-1 rounded-md" style={{ color: 'var(--accent-primary)', backgroundColor: 'rgba(99,102,241,0.12)' }}>{'>'}</span>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          className="flex-1 bg-transparent outline-none placeholder-slate-500"
          style={{ color: 'var(--text-main)' }}
          placeholder="Type command and press Enter..."
          autoFocus
        />
      </div>
    </div>
  );
};

const Terminal = React.memo(TerminalBase);
Terminal.displayName = 'Terminal';

export default Terminal;
