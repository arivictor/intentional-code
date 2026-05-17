import React, { useState } from "react";
import { Copy, Check } from "lucide-react";

function highlightGo(code) {
  // Simple Go syntax highlighting using regex
  const keywords = /\b(package|import|func|return|if|else|for|range|switch|case|default|type|struct|interface|map|chan|go|defer|select|var|const|break|continue|fallthrough|nil|true|false|make|new|len|cap|append|delete|close|panic|recover|error)\b/g;
  const types = /\b(string|int|int8|int16|int32|int64|uint|uint8|uint16|uint32|uint64|float32|float64|bool|byte|rune|any|error|context\.Context)\b/g;
  const strings = /(\"[^\"]*\"|`[^`]*`|'[^']*')/g;
  const comments = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)/g;
  const numbers = /\b(\d+\.?\d*)\b/g;
  const funcNames = /\b([A-Z]\w*)\s*\(/g;
  const constructors = /\b(New\w+)\b/g;

  let result = code
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Order matters: comments and strings first to avoid highlighting inside them
  const tokens = [];
  let idx = 0;
  
  // Simple approach: just apply classes
  result = result
    .replace(comments, '<span class="text-code-comment italic">$1</span>')
    .replace(strings, '<span class="text-code-string">$1</span>')
    .replace(keywords, '<span class="text-code-keyword font-medium">$1</span>')
    .replace(types, '<span class="text-code-type">$1</span>')
    .replace(numbers, '<span class="text-code-number">$1</span>');

  return result;
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
        <div className="flex items-center gap-2">
          {filename && (
            <span className="text-xs font-mono font-medium text-muted-foreground">{filename}</span>
          )}
          {!filename && (
            <span className="text-xs font-mono text-muted-foreground">{language}</span>
          )}
        </div>
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