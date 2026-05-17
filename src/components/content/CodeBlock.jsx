import React, { useState } from "react";
import { Copy, Check } from "lucide-react";

const KEYWORDS = new Set([
  "package","import","func","return","if","else","for","range","switch","case",
  "default","type","struct","interface","map","chan","go","defer","select","var",
  "const","break","continue","fallthrough","nil","true","false","make","new","len",
  "cap","append","delete","close","panic","recover","error",
]);

const TYPES = new Set([
  "string","int","int8","int16","int32","int64","uint","uint8","uint16","uint32",
  "uint64","float32","float64","bool","byte","rune","any",
]);

function escape(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function span(cls, text) {
  return `<span class="${cls}">${escape(text)}</span>`;
}

/**
 * Single-pass tokenizer. We scan left-to-right, match the longest token at
 * each position, emit a styled span, and advance past it. This prevents any
 * regex from matching inside an already-emitted span.
 */
function highlightGo(code) {
  // Ordered list of token types. First match wins.
  const TOKEN_RE = [
    // line comment
    { re: /^\/\/[^\n]*/,           emit: (m) => span("text-code-comment italic", m) },
    // block comment
    { re: /^\/\*[\s\S]*?\*\//,     emit: (m) => span("text-code-comment italic", m) },
    // backtick string
    { re: /^`[^`]*`/,              emit: (m) => span("text-code-string", m) },
    // double-quoted string
    { re: /^"(?:[^"\\]|\\.)*"/,    emit: (m) => span("text-code-string", m) },
    // single-quoted rune
    { re: /^'(?:[^'\\]|\\.)*'/,    emit: (m) => span("text-code-string", m) },
    // number
    { re: /^\b\d+\.?\d*\b/,        emit: (m) => span("text-code-number", m) },
    // identifier or keyword
    {
      re: /^[A-Za-z_]\w*/,
      emit: (m) => {
        if (KEYWORDS.has(m)) return span("text-code-keyword font-medium", m);
        if (TYPES.has(m))    return span("text-code-type", m);
        return escape(m);
      },
    },
    // anything else (punctuation, whitespace handled char-by-char below)
  ];

  let out = "";
  let i = 0;
  while (i < code.length) {
    let matched = false;
    const slice = code.slice(i);
    for (const { re, emit } of TOKEN_RE) {
      const m = slice.match(re);
      if (m) {
        out += emit(m[0]);
        i += m[0].length;
        matched = true;
        break;
      }
    }
    if (!matched) {
      // Emit the raw character (escaped for safety)
      const ch = code[i];
      out += ch === "&" ? "&amp;" : ch === "<" ? "&lt;" : ch === ">" ? "&gt;" : ch;
      i++;
    }
  }
  return out;
}

export default function CodeBlock({ code, filename, language = "go" }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-4 rounded-lg border border-code-border overflow-hidden bg-code-bg">
      <div className="flex items-center justify-between px-4 py-2 border-b border-code-border bg-code-bg">
        <span className="text-xs font-mono font-medium text-muted-foreground">
          {filename || language}
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors p-1 rounded"
          aria-label="Copy code"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
          <span>{copied ? "Copied" : "Copy"}</span>
        </button>
      </div>
      <div className="overflow-x-auto">
        <pre className="p-4 text-sm font-mono leading-relaxed text-code-text whitespace-pre">
          <code dangerouslySetInnerHTML={{ __html: highlightGo(code) }} />
        </pre>
      </div>
    </div>
  );
}