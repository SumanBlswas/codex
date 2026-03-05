import React, { useMemo, useRef } from "react";

type CodeLanguage = "html" | "css" | "js" | "json" | "svg" | "text";

interface ColorCodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  language: CodeLanguage;
  theme: "light" | "dark";
  minHeight?: string;
  className?: string;
  style?: React.CSSProperties;
  spellCheck?: boolean;
  onKeyDown?: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onScroll?: (event: React.UIEvent<HTMLTextAreaElement>) => void;
  wrap?: "soft" | "off";
  whiteSpace?: "pre" | "pre-wrap";
  tabSize?: number;
  lineHeight?: string;
  fontSize?: string;
  readOnly?: boolean;
}

const escapeHtml = (input: string) =>
  input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const highlightCode = (
  raw: string,
  language: CodeLanguage,
  theme: "light" | "dark",
) => {
  let out = escapeHtml(raw);
  const palette =
    theme === "dark"
      ? {
          comment: "#64748b",
          string: "#fbbf24",
          keyword: "#a78bfa",
          number: "#22d3ee",
          property: "#93c5fd",
          tag: "#f472b6",
        }
      : {
          comment: "#64748b",
          string: "#b45309",
          keyword: "#7c3aed",
          number: "#0e7490",
          property: "#1d4ed8",
          tag: "#be185d",
        };

  // Use placeholders to avoid re-highlighting inside injected <span> markup.
  const tokens: string[] = [];
  const markerStart = "__NXTOK_START__";
  const markerEnd = "__NXTOK_END__";
  const stash = (regex: RegExp, color: string) => {
    out = out.replace(regex, (match) => {
      const id = tokens.length;
      tokens.push(`<span style="color:${color}">${match}</span>`);
      return `${markerStart}${id}${markerEnd}`;
    });
  };
  const restore = () => {
    const restoreRegex = new RegExp(`${markerStart}(\\d+)${markerEnd}`, "g");
    out = out.replace(restoreRegex, (_, idx) => tokens[Number(idx)] || "");
  };

  if (language === "html" || language === "svg") {
    stash(/&lt;!--[\s\S]*?--&gt;/g, palette.comment);
    // Tag-name highlighting only (safe, no attribute rewriting).
    out = out.replace(/(&lt;\/?)([A-Za-z0-9:-]+)/g, (_m, p1, p2) => {
      return `${p1}<span style="color:${palette.tag}">${p2}</span>`;
    });
    restore();
    return out;
  }

  // Common comment/string extraction first
  stash(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, palette.comment);

  if (language === "css") {
    stash(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, palette.string);
    stash(/#[0-9a-fA-F]{3,8}\b|\b\d+(\.\d+)?(px|em|rem|%|vh|vw)?\b/g, palette.number);
    stash(/\b([A-Za-z-]+)(?=\s*:)/g, palette.property);
    stash(/([.#]?[A-Za-z0-9_:-]+)(?=\s*\{)/g, palette.tag);
  } else if (language === "js" || language === "json") {
    stash(/&quot;(?:\\.|[^\\])*?&quot;|'(?:\\.|[^'\\])*?'/g, palette.string);
    stash(
      /\b(const|let|var|function|return|if|else|for|while|switch|case|break|true|false|null|undefined|import|from|export|default|new|async|await)\b/g,
      palette.keyword,
    );
    stash(/\b\d+(\.\d+)?\b/g, palette.number);
    stash(/&quot;[^&]*?&quot;(?=\s*:)/g, palette.property);
  }

  restore();

  return out;
};

const ColorCodeEditor: React.FC<ColorCodeEditorProps> = ({
  value,
  onChange,
  language,
  theme,
  minHeight = "320px",
  className = "",
  style,
  spellCheck = false,
  onKeyDown,
  onScroll,
  wrap = "soft",
  whiteSpace = "pre-wrap",
  tabSize = 2,
  lineHeight = "1.5rem",
  fontSize = "13px",
  readOnly = false,
}) => {
  const preRef = useRef<HTMLElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const html = useMemo(
    () => highlightCode(value || "", language, theme),
    [language, theme, value],
  );

  const handleScroll = (event: React.UIEvent<HTMLTextAreaElement>) => {
    if (!preRef.current) return;
    preRef.current.scrollTop = event.currentTarget.scrollTop;
    preRef.current.scrollLeft = event.currentTarget.scrollLeft;
    if (onScroll) onScroll(event);
  };

  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={{ minHeight, ...style }}
    >
      <pre
        ref={preRef as any}
        aria-hidden="true"
        className="absolute inset-0 m-0 p-3 overflow-auto pointer-events-none font-mono"
        style={{
          whiteSpace,
          lineHeight,
          fontSize,
          tabSize,
          color: theme === "dark" ? "#cbd5e1" : "#1e293b",
          background: "transparent",
        }}
      >
        <code dangerouslySetInnerHTML={{ __html: html || " " }} />
      </pre>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onScroll={handleScroll}
        spellCheck={spellCheck}
        onKeyDown={onKeyDown}
        className="absolute inset-0 p-3 outline-none resize-none font-mono bg-transparent color-code-editor-input"
        style={{
          whiteSpace,
          lineHeight,
          fontSize,
          tabSize,
          color: "transparent",
          caretColor: theme === "dark" ? "#e2e8f0" : "#0f172a",
        }}
        wrap={wrap}
        readOnly={readOnly}
      />
    </div>
  );
};

export default ColorCodeEditor;
