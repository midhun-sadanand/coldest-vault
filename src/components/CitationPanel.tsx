'use client';

import { useState, useEffect } from 'react';
import { Copy, Check, Loader2, Search } from 'lucide-react';
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
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasFetched, setHasFetched] = useState(false);

  // Quote-to-page state
  const [quote, setQuote] = useState('');
  const [isPageLoading, setIsPageLoading] = useState(false);
  const [pageResult, setPageResult] = useState<{ page_number: string | null; page_context: string } | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);

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
        setHasFetched(true);
      }
    };

    fetchCitation();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFindPage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quote.trim() || isPageLoading) return;
    setIsPageLoading(true);
    setPageError(null);
    setPageResult(null);

    try {
      const response = await fetch('/api/cite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_name: doc.file_name,
          publication_date: doc.publication_date,
          source_type: doc.source_type,
          folder_path: doc.folder_path,
          people: doc.people,
          ocr_content: doc.ocr_content,
          quote: quote.trim()
        })
      });

      if (!response.ok) throw new Error('Page lookup failed');

      const data = await response.json();
      setPageResult({
        page_number: data.page_number,
        page_context: data.page_context
      });
    } catch (err: unknown) {
      setPageError(err instanceof Error ? err.message : 'Page lookup failed');
    } finally {
      setIsPageLoading(false);
    }
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

      {/* Find page for a quote */}
      <div className="border-t border-[var(--border)] px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-[var(--text-subtle)] mb-3">
          Find page for a quote
        </p>
        <form onSubmit={handleFindPage} className="flex gap-2">
          <input
            type="text"
            value={quote}
            onChange={(e) => setQuote(e.target.value)}
            placeholder="Paste a quote to find its page number..."
            className="flex-1 border-0 border-b border-[var(--input-border)] bg-transparent py-1.5 text-xs text-[var(--text)] placeholder:text-[var(--text-subtle)] focus:border-[var(--text)] focus:outline-none"
            disabled={isPageLoading}
          />
          <button
            type="submit"
            disabled={isPageLoading || !quote.trim()}
            className={cn(
              'flex items-center justify-center px-3 py-1.5 text-xs border border-[var(--border)] transition-colors flex-shrink-0',
              isPageLoading || !quote.trim()
                ? 'cursor-not-allowed text-[var(--text-subtle)]'
                : 'text-[var(--text)] hover:bg-[var(--bg-secondary)]'
            )}
          >
            {isPageLoading ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
          </button>
        </form>

        {pageError && (
          <p className="mt-2 text-xs text-red-500">{pageError}</p>
        )}

        {pageResult && (
          <div className="mt-3 space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-[var(--text)]">
                {pageResult.page_number || 'Page not identified'}
              </span>
              {pageResult.page_number && citation && (
                <CopyButton
                  text={`${citation[activeFormat]}${pageResult.page_number ? `, ${pageResult.page_number}` : ''}`}
                />
              )}
            </div>
            {pageResult.page_context && (
              <p className="text-xs text-[var(--text-subtle)] leading-relaxed italic">
                {pageResult.page_context}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
