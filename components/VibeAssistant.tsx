import React, { useState, useEffect, useRef } from 'react';
import { Send, Sparkles, X, Loader2, AlertCircle, CheckCircle2, ChevronDown, ChevronUp, Target } from 'lucide-react';
import { VirtualElement, FileMap } from '../types';
import { submitVibeCommand, checkOllamaStatus, VibeResponse } from '../utils/ollamaService';

interface VibeAssistantProps {
    isOpen: boolean;
    onClose: () => void;
    currentRoot: VirtualElement;
    selectedElement?: VirtualElement | null;
    fileMap: FileMap;
    onVibeUpdate: (response: VibeResponse) => void;
    lastErrorContext?: string;
    aiBackend: "local" | "colab";
    colabUrl: string;
}

interface Message {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    isError?: boolean;
}

const VibeAssistant: React.FC<VibeAssistantProps> = ({
    isOpen,
    onClose,
    currentRoot,
    selectedElement,
    fileMap,
    onVibeUpdate,
    lastErrorContext,
    aiBackend,
    colabUrl
}) => {
    // Only show targeting for specific elements, not root/body/html
    const isUsefulTarget = selectedElement &&
        !['body', 'html'].includes((selectedElement?.type || '').toLowerCase()) &&
        selectedElement?.id !== 'preview-live-root';

    const [messages, setMessages] = useState<Message[]>([
        { id: '1', role: 'assistant', content: "Hi! I'm your local Vibe Coding assistant. What should we change on this page?" }
    ]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isOllamaAvailable, setIsOllamaAvailable] = useState<boolean | null>(null);
    const [isMinimized, setIsMinimized] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        checkOllamaStatus({ aiBackend, colabUrl }).then(available => setIsOllamaAvailable(available));
    }, [aiBackend, colabUrl]);

    useEffect(() => {
        // Auto-feed error to AI if a crash happened right after an update
        if (lastErrorContext && messages.length > 1 && !isLoading) {
            const errMsg: Message = {
                id: Date.now().toString(),
                role: 'system',
                content: `Frontend React App crashed after your last change! Error: ${lastErrorContext}. Please fix the JSON structure.`,
                isError: true
            };
            setMessages(prev => [...prev, errMsg]);
            handleSendVibe(errMsg.content, true);
        }
    }, [lastErrorContext]);

    useEffect(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages, isOpen, isMinimized]);

    if (!isOpen) return null;

    const handleSendVibe = async (command: string = input, auto: boolean = false) => {
        if (!command.trim() || isLoading) return;

        if (!auto) {
            const userMsg: Message = { id: Date.now().toString(), role: 'user', content: command };
            setMessages(prev => [...prev, userMsg]);
            setInput('');
        }

        setIsLoading(true);

        try {
            const result = await submitVibeCommand(command, currentRoot, fileMap, { aiBackend, colabUrl }, isUsefulTarget ? selectedElement : null);

            if (result.error) {
                setMessages(prev => [...prev, {
                    id: Date.now().toString(),
                    role: 'system',
                    content: `Failed: ${result.error}`,
                    isError: true
                }]);
            } else {
                const successMsg: Message = {
                    id: Date.now().toString(),
                    role: 'assistant',
                    content: result.message || "Applied changes."
                };
                setMessages(prev => [...prev, successMsg]);
                // Only trigger onVibeUpdate (which modifies the page) for actual UI changes.
                // CHAT intent means it's a conversational reply — never touch the page.
                if (result.intent !== "CHAT") {
                    onVibeUpdate(result);
                }
            }
        } catch (err: any) {
            setMessages(prev => [...prev, {
                id: Date.now().toString(),
                role: 'system',
                content: `Network Error: ${err.message}`,
                isError: true
            }]);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className={`fixed bottom-6 right-6 z-[100] w-96 flex flex-col glass-panel shadow-2xl shadow-indigo-500/10 border border-slate-700/60 rounded-xl overflow-hidden transition-all duration-300 ${isMinimized ? 'h-14' : 'h-[500px]'}`}>
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-slate-900/80 border-b border-slate-700/50 cursor-pointer" onClick={() => setIsMinimized(!isMinimized)}>
                <div className="flex items-center gap-2">
                    <div className={aiBackend === 'colab' ? "bg-indigo-500/20 p-1.5 rounded-lg text-indigo-400" : "bg-cyan-500/20 p-1.5 rounded-lg text-cyan-400"}>
                        <Sparkles size={16} />
                    </div>
                    <span className="font-medium text-slate-200 text-sm">Vibe Assistant <span className="text-xs text-slate-500 font-normal ml-1">({aiBackend === 'colab' ? 'Colab Cloud' : 'Qwen Local'})</span></span>
                </div>
                <div className="flex items-center gap-2">
                    {!isMinimized && isOllamaAvailable === true && <span title="Ollama Connected"><CheckCircle2 size={14} className="text-green-500 opacity-70" /></span>}
                    {!isMinimized && isOllamaAvailable === false && <span title="Ollama Not Found (Localhost 11434)"><AlertCircle size={14} className="text-red-500 opacity-70" /></span>}
                    <button className="text-slate-400 hover:text-white transition-colors" title={isMinimized ? "Expand" : "Minimize"}>
                        {isMinimized ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); onClose(); }} className="text-slate-400 hover:text-red-400 transition-colors ml-1">
                        <X size={18} />
                    </button>
                </div>
            </div>

            {/* Targeting Banner */}
            {!isMinimized && isUsefulTarget && (
                <div className="flex items-center gap-1.5 px-4 py-1.5 bg-amber-500/10 border-b border-amber-500/20 text-amber-400 text-[10px]">
                    <Target size={10} />
                    <span className="font-medium">Targeting:</span>
                    <span className="font-mono opacity-80 truncate">&lt;{selectedElement.type}&gt; {selectedElement.name || selectedElement.id}</span>
                    {selectedElement.className && <span className="opacity-60 truncate">.{selectedElement.className.split(' ')[0]}</span>}
                </div>
            )}

            {/* Chat History */}
            {!isMinimized && (
                <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-900/30">
                    {messages.map((msg) => (
                        <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                            <div className={`
                  max-w-[85%] rounded-lg px-3 py-2 text-sm
                   ${msg.role === 'user' ? 'bg-indigo-600/90 text-white' :
                                    msg.role === 'system' && msg.isError ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                                        'bg-slate-800 text-slate-200 border border-slate-700/50'
                                }
               `}>
                                {msg.content}
                            </div>
                        </div>
                    ))}
                    {isLoading && (
                        <div className="flex items-start">
                            <div className="bg-slate-800 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-slate-400 flex items-center gap-2">
                                <Loader2 size={14} className="animate-spin text-indigo-400" />
                                Generating UI vibes...
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>
            )}

            {/* Input Area */}
            {!isMinimized && (
                <div className="p-3 bg-slate-900/80 border-t border-slate-700/50">
                    <div className="relative">
                        <textarea
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSendVibe();
                                }
                            }}
                            placeholder={aiBackend === 'colab' && !colabUrl ? "Set Colab URL in settings..." : isOllamaAvailable === false ? "AI Backend unreachable..." : isUsefulTarget ? `Ask AI about <${selectedElement!.type}>... e.g. "make this bold"` : "e.g. Change the background to dark blue"}
                            disabled={isLoading || (aiBackend === 'colab' && !colabUrl)}
                            className="w-full bg-slate-800/50 border border-slate-700 rounded-lg pl-3 pr-10 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 resize-none h-14"
                        />
                        <button
                            onClick={() => handleSendVibe()}
                            disabled={!input.trim() || isLoading}
                            className="absolute right-2 top-2  p-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md disabled:opacity-50 disabled:hover:bg-indigo-600 transition-colors"
                        >
                            <Send size={16} />
                        </button>
                    </div>
                    {isOllamaAvailable === false && (
                        <p className="text-[10px] text-red-400 mt-2 ml-1">
                            ⚠️ Warning: Could not reach {aiBackend === 'colab' ? 'Colab' : 'Ollama'} at {aiBackend === 'colab' ? (colabUrl || 'None') : 'localhost:11434'}.
                        </p>
                    )}
                </div>
            )}
        </div>
    );
};

export default VibeAssistant;
