import React, { Component, ErrorInfo, ReactNode } from "react";

interface Props {
    children: ReactNode;
    onErrorCatched: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
    hasError: boolean;
    error?: Error;
}

class VibeErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false
    };

    public static getDerivedStateFromError(error: Error): State {
        // Update state so the next render will show the fallback UI.
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error("Uncaught error in Vibe Canvas:", error, errorInfo);
        this.props.onErrorCatched(error, errorInfo);
    }

    public render() {
        if (this.state.hasError) {
            return (
                <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900/5 p-8 text-center">
                    <div className="bg-red-500/10 border border-red-500/30 p-6 rounded-xl max-w-lg">
                        <h2 className="text-red-500 font-bold mb-2">Canvas Rendering Error</h2>
                        <p className="text-slate-600 dark:text-slate-400 text-sm mb-4">
                            The AI generated an invalid component structure that crashed the React renderer.
                        </p>
                        <div className="bg-slate-900 rounded p-3 text-left overflow-auto max-h-40">
                            <code className="text-red-400 text-xs font-mono whitespace-pre-wrap">
                                {this.state.error?.message}
                            </code>
                        </div>
                        <p className="text-xs text-slate-500 mt-4 italic">
                            The issue has been automatically reported to the Vibe Assistant for correction.
                        </p>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default VibeErrorBoundary;
