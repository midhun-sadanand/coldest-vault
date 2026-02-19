'use client';

import { useState, useEffect } from 'react';
import { Copy, Check, Search, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CitationResponse } from '@/types';

interface CitationDocumentProps {
  file_name: string;
  publication_date?: string;
  source_type?: 'primary' | 'secondary';
  folder_path?: string;
  people?: string[];
  ocr_content: string;
}

interface CitationPanelProps {
  document: CitationDocumentProps;
}

type CitationFormat = 'mla' | 'apa' | 'chicago';

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="flex-shrink-0 text-[var(--text-subtle)] hover:text-[var(--text)] transition-colors"
      title="Copy to clipboard"
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
    </button>
  );
}

export default function CitationPanel({ document: doc }: CitationPanelProps) {
  const [activeFormat, setActiveFormat] = useState<CitationFormat>('chicago');
  const [citation, setCitation] = useState<CitationResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [pageInput, setPageInput] = useState('');
  const [pageResult, setPageResult] = useState<string | null>(null);

  // Fetch base citation once on mount
  useEffect(() => {
    const fetchCitation = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch('/api/cite', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            file_name: doc.file_name,
            publication_date: doc.publication_date,
            source_type: doc.source_type,
            folder_path: doc.folder_path,
            ocr_content: doc.ocr_content
          })
        });

        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          throw new Error(err.error || 'Failed to generate citation');
        }

        const data: CitationResponse = await response.json();
        setCitation(data);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Citation generation failed');
      } finally {
        setIsLoading(false);
      }
    };

    fetchCitation();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCitePage = (e: React.FormEvent) => {
    e.preventDefault();
    const raw = pageInput.trim();
    if (!raw) return;
    // Format: bare numbers get "p." prefix, ranges get "pp." prefix, otherwise use as-is
    const isRange = /^\d+\s*[-–]\s*\d+$/.test(raw);
    const isNumber = /^\d+$/.test(raw);
    const formatted = isRange ? `pp. ${raw.replace(/\s*[-–]\s*/, '–')}` : isNumber ? `p. ${raw}` : raw;
    setPageResult(formatted);
  };

  const formats: { key: CitationFormat; label: string }[] = [
    { key: 'chicago', label: 'Chicago' },
    { key: 'mla', label: 'MLA' },
    { key: 'apa', label: 'APA' }
  ];

  const activeCitationText = citation?.[activeFormat] || '';

  return (
    <div className="border border-[var(--border)] text-sm">
      {/* Format tabs */}
      <div className="flex items-center border-b border-[var(--border)] px-4 gap-5">
        {formats.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveFormat(key)}
            className={cn(
              'py-3 text-xs font-medium uppercase tracking-widest transition-colors border-b-2 -mb-px',
              activeFormat === key
                ? 'border-[var(--text)] text-[var(--text)]'
                : 'border-transparent text-[var(--text-subtle)] hover:text-[var(--text-muted)]'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Citation body */}
      <div className="p-4">
        {isLoading && (
          <div className="flex items-center gap-2 py-3 text-[var(--text-subtle)]">
            <Loader2 size={14} className="animate-spin" />
            <span className="text-xs">Generating citation...</span>
          </div>
        )}

        {error && (
          <p className="text-xs text-red-500 py-2">{error}</p>
        )}

        {citation && !isLoading && (
          <div className="flex items-start justify-between gap-3">
            <p className="text-xs leading-relaxed text-[var(--text-muted)] flex-1 font-mono">
              {activeCitationText}
            </p>
            <CopyButton text={activeCitationText} />
          </div>
        )}
      </div>

      {/* Cite page(s) */}
      <div className="border-t border-[var(--border)] px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-[var(--text-subtle)] mb-3">
          Cite page(s)
        </p>
        <form onSubmit={handleCitePage} className="flex items-center gap-2">
          <input
            type="text"
            value={pageInput}
            onChange={(e) => { setPageInput(e.target.value); setPageResult(null); }}
            placeholder="e.g. 1  or  4–6"
            className="flex-1 min-w-0 border-0 border-b border-[var(--input-border)] bg-transparent py-1.5 text-xs text-[var(--text)] placeholder:text-[var(--text-subtle)] focus:border-[var(--text)] focus:outline-none"
          />
          <button
            type="submit"
            disabled={!pageInput.trim()}
            className={cn(
              'flex items-center justify-center px-3 py-1.5 text-xs border border-[var(--border)] transition-colors flex-shrink-0',
              !pageInput.trim()
                ? 'cursor-not-allowed text-[var(--text-subtle)]'
                : 'text-[var(--text)] hover:bg-[var(--bg-secondary)]'
            )}
          >
            <Search size={13} />
          </button>
        </form>

        {pageResult && citation && (
          <div className="mt-3 flex items-start gap-2">
            <p className="text-xs leading-relaxed text-[var(--text-muted)] flex-1 font-mono">
              {`${citation[activeFormat].replace(/\.$/, '')}, ${pageResult}.`}
            </p>
            <CopyButton text={`${citation[activeFormat].replace(/\.$/, '')}, ${pageResult}.`} />
          </div>
        )}
      </div>
    </div>
  );
}
