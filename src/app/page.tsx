'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { Search, Loader2, Zap, Type, Brain, Folder, ChevronRight, MessageSquare, Send, ExternalLink, ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import SearchResult from '@/components/SearchResult';
import type { SpicyResult, SearchResponse, FolderSearchResult, ResearchMessage, ResearchSource } from '@/types';

type SearchType = 'spicy' | 'fuzzy' | 'semantic' | 'research';

const RESULTS_PER_PAGE = 20;

// Research mode suggestions
const RESEARCH_SUGGESTIONS = [
  'Find quotes analyzing NSC assessments of Soviet nuclear capabilities',
  'What were the military vs. diplomatic arguments in the Korean armistice negotiations?',
  'How did Eisenhower weigh the three Solarium policy alternatives?',
  'What specific concerns did advisors raise about nuclear weapon deployment in Asia?'
];

// Search mode suggestions
const SEARCH_SUGGESTIONS = [
  'Korean armistice',
  'nuclear deterrence',
  'Project Solarium',
  'Mao Zedong',
  'POW repatriation',
  'massive retaliation',
  'NSC 162',
  'Red China'
];

export default function Home() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SpicyResult[]>([]);
  const [folderResults, setFolderResults] = useState<FolderSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchType, setSearchType] = useState<SearchType>('semantic');
  const [documentCount, setDocumentCount] = useState<number | null>(null);
  const [processingTime, setProcessingTime] = useState<number | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [totalResults, setTotalResults] = useState(0);
  
  // Research mode state
  const [researchMessages, setResearchMessages] = useState<ResearchMessage[]>([]);
  const [isResearchLoading, setIsResearchLoading] = useState(false);
  const [expandedSources, setExpandedSources] = useState<number[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/count')
      .then(res => res.json())
      .then(data => setDocumentCount(data.count))
      .catch(console.error);
  }, []);

  const performSearch = useCallback(async (searchQuery: string, type: SearchType, offset: number = 0, append: boolean = false) => {
    if (!searchQuery.trim()) return;

    if (append) {
      setIsLoadingMore(true);
    } else {
      setIsLoading(true);
      setError(null);
      setResults([]);
      setFolderResults([]);
      setHasSearched(true);
    }

    try {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: searchQuery.trim(),
          limit: RESULTS_PER_PAGE,
          offset,
          search_type: type
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Search failed');
      }

      const data: SearchResponse = await response.json();
      
      if (append) {
        setResults(prev => [...prev, ...(data.results as SpicyResult[])]);
      } else {
        setResults(data.results as SpicyResult[]);
        setFolderResults(data.folder_results || []);
        setProcessingTime(data.processing_time_ms || null);
      }
      
      setHasMore(data.has_more);
      setTotalResults(data.total);

    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (searchType === 'research') {
      handleResearchSubmit(e);
    } else {
      performSearch(query, searchType);
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    setQuery(suggestion);
    if (searchType === 'research') {
      // For research, submit the question
      submitResearchQuery(suggestion);
    } else {
      performSearch(suggestion, searchType);
    }
  };

  const handleLoadMore = () => {
    performSearch(query, searchType, results.length, true);
  };

  const handleInputFocus = () => {
    if (searchType !== 'research') {
      setResults([]);
      setFolderResults([]);
      setHasSearched(false);
      setError(null);
      setProcessingTime(null);
      setHasMore(false);
      setTotalResults(0);
    }
  };

  // Research mode functions
  const scrollToBottom = () => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const submitResearchQuery = async (questionText: string) => {
    if (!questionText.trim() || isResearchLoading) return;

    const userMessage: ResearchMessage = { role: 'user', content: questionText.trim() };
    setResearchMessages(prev => [...prev, userMessage]);
    setQuery('');
    setIsResearchLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: userMessage.content,
          conversation_history: researchMessages
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Research failed');
      }

      const data = await response.json();
      const assistantMessage: ResearchMessage = {
        role: 'assistant',
        content: data.response,
        sources: data.sources
      };
      setResearchMessages(prev => [...prev, assistantMessage]);
      scrollToBottom();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsResearchLoading(false);
    }
  };

  const handleResearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    submitResearchQuery(query);
  };

  // Format text with paragraphs, markdown bold (**text**), numbered lists, and citations
  const formatResearchText = (text: string, sources: ResearchSource[] = []) => {
    // Split into paragraphs by double newlines or numbered list items
    const paragraphs = text.split(/\n\n+|\n(?=\d+\.)/g).filter(p => p.trim());
    
    return paragraphs.map((paragraph, pIdx) => {
      // Check if it's a numbered list item
      const listMatch = paragraph.match(/^(\d+)\.\s*(.+)$/s);
      if (listMatch) {
        return (
          <div key={pIdx} className="flex gap-3 my-3">
            <span className="text-[var(--text-muted)] font-medium flex-shrink-0">{listMatch[1]}.</span>
            <div className="flex-1">{formatInlineText(listMatch[2], sources)}</div>
          </div>
        );
      }
      
      // Regular paragraph
      return (
        <p key={pIdx} className="my-3 first:mt-0 last:mb-0">
          {formatInlineText(paragraph, sources)}
        </p>
      );
    });
  };

  // Format inline text (bold and citations)
  const formatInlineText = (text: string, sources: ResearchSource[] = []) => {
    // Split by bold markers
    const boldParts = text.split(/(\*\*[^*]+\*\*)/g);
    
    return boldParts.map((boldPart, boldIdx) => {
      const boldMatch = boldPart.match(/^\*\*([^*]+)\*\*$/);
      if (boldMatch) {
        return (
          <strong key={boldIdx} className="font-semibold text-[var(--text)]">
            {renderCitations(boldMatch[1], sources)}
          </strong>
        );
      }
      return <span key={boldIdx}>{renderCitations(boldPart, sources)}</span>;
    });
  };

  // State for citation tooltip
  const [hoveredCitation, setHoveredCitation] = useState<{ index: number; name: string } | null>(null);

  // Render citation links - superscript style with tooltip
  const renderCitations = (text: string, sources: ResearchSource[] = []) => {
    const parts = text.split(/(\[\d+\])/g);
    
    return parts.map((part, idx) => {
      const citationMatch = part.match(/\[(\d+)\]/);
      if (citationMatch) {
        const sourceIndex = parseInt(citationMatch[1]);
        const source = sources.find(s => s.index === sourceIndex);
        if (source) {
          return (
            <span key={idx} className="relative inline">
              <Link
                href={`/directory?file=${encodeURIComponent(source.file_name)}`}
                className="text-[9px] text-[var(--text-muted)] hover:text-[var(--text)] transition-colors align-super"
                onMouseEnter={() => setHoveredCitation({ index: sourceIndex, name: source.file_name })}
                onMouseLeave={() => setHoveredCitation(null)}
              >
                [{sourceIndex}]
              </Link>
              {hoveredCitation?.index === sourceIndex && (
                <span className="absolute left-0 top-full mt-1 px-2 py-1 text-xs bg-[var(--bg)] border border-[var(--border)] text-[var(--text-muted)] whitespace-nowrap rounded shadow-lg z-50">
                  {source.file_name.length > 60 ? source.file_name.slice(0, 60) + '...' : source.file_name}
                </span>
              )}
            </span>
          );
        }
      }
      return <span key={idx}>{part}</span>;
    });
  };

  const searchTypeOptions: { value: SearchType; label: string; icon: typeof Zap; description: string }[] = [
    { value: 'semantic', label: 'Semantic', icon: Brain, description: 'Meaning-based search' },
    { value: 'fuzzy', label: 'Text', icon: Type, description: 'Traditional keyword search' },
    { value: 'spicy', label: 'Hybrid', icon: Zap, description: 'Combines semantic + text, AI-ranked' },
    { value: 'research', label: 'Research', icon: MessageSquare, description: 'Ask questions, get cited answers' }
  ];

  const isResearchMode = searchType === 'research';
  const hasResearchMessages = researchMessages.length > 0;

  return (
    <div className={cn(
      "mx-auto max-w-4xl px-6 py-12"
    )}>
      {/* Back button for research mode */}
      {isResearchMode && hasResearchMessages && (
        <button
          onClick={() => {
            setResearchMessages([]);
            setQuery('');
            setExpandedSources([]);
          }}
          className="flex items-center gap-2 text-sm text-[var(--text-muted)] hover:text-[var(--text)] transition-colors mb-6"
        >
          <ArrowLeft size={16} />
          <span>Back</span>
        </button>
      )}

      {/* Header - hide when research conversation is active */}
      {!(isResearchMode && hasResearchMessages) && (
        <div className="mb-12 pt-12">
          <h1 className="mb-4 text-4xl font-medium tracking-tight text-[var(--text)]">
            Search the Coldest Vault
          </h1>
          <div className="grid gap-6 text-sm text-[var(--text-muted)] md:grid-cols-2">
            <p className="leading-relaxed">
              {documentCount !== null ? (
                <>{documentCount.toLocaleString()} declassified documents from the Eisenhower Library relating to the Korean War and early Cold War national security policy.</>
              ) : (
                <>Loading document count...</>
              )}
            </p>
          </div>
        </div>
      )}

      {/* Search/Research form - changes based on mode */}
      {!(isResearchMode && hasResearchMessages) && (
        <form onSubmit={handleSearch} className="mb-12">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="relative flex-1">
              {isResearchMode ? (
                <MessageSquare className="absolute left-0 top-1/2 -translate-y-1/2 text-[var(--text-subtle)]" size={20} />
              ) : (
                <Search className="absolute left-0 top-1/2 -translate-y-1/2 text-[var(--text-subtle)]" size={20} />
              )}
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={handleInputFocus}
                placeholder={isResearchMode ? "Ask a question about the archives..." : "Search documents, people, places, dates..."}
                className="w-full border-0 border-b border-[var(--input-border)] bg-transparent py-3 pl-8 pr-4 text-[var(--text)] placeholder:text-[var(--text-subtle)] focus:border-[var(--text)] focus:outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={(isResearchMode ? isResearchLoading : isLoading) || !query.trim()}
              className={cn(
                "flex items-center justify-center gap-2 border border-[var(--border)] px-6 py-3 text-sm font-medium transition-colors",
                ((isResearchMode ? isResearchLoading : isLoading) || !query.trim())
                  ? "cursor-not-allowed border-[var(--border)] text-[var(--text-subtle)]"
                  : "border-[var(--text)] text-[var(--text)] hover:bg-[var(--bg-secondary)]"
              )}
            >
              {(isResearchMode ? isResearchLoading : isLoading) ? (
                <Loader2 className="animate-spin" size={18} />
              ) : isResearchMode ? (
                <Send size={18} />
              ) : (
                'Search'
              )}
            </button>
          </div>

          {/* Search type selector */}
          <div className="mt-6 flex flex-wrap gap-4">
            {searchTypeOptions.map((option) => {
              const Icon = option.icon;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setSearchType(option.value);
                  }}
                  className={cn(
                    "flex items-center gap-2 border-b-2 pb-1 text-sm transition-colors cursor-pointer",
                    searchType === option.value
                      ? "border-[var(--text)] text-[var(--text)]"
                      : "border-transparent text-[var(--text-muted)] hover:text-[var(--text)]"
                  )}
                >
                  <Icon size={14} />
                  <span>{option.label}</span>
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-[var(--text-subtle)]">
            {searchTypeOptions.find(o => o.value === searchType)?.description}
          </p>
        </form>
      )}

      {/* Error state */}
      {error && (
        <div className="mb-8 border border-red-500/30 bg-red-500/5 p-4">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Research Mode - Messages flow down the page */}
      {isResearchMode && (
        <>
          {/* Initial state - suggestions */}
          {!hasResearchMessages && !isResearchLoading && (
            <div className="py-16">
              <p className="mb-6 text-sm text-[var(--text-muted)]">Try asking:</p>
              <div className="flex flex-wrap gap-3">
                {RESEARCH_SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => handleSuggestionClick(suggestion)}
                    className="border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-muted)] transition-colors hover:border-[var(--text)] hover:text-[var(--text)]"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Messages - flow naturally down the page */}
          {hasResearchMessages && (
            <div className="pt-8 space-y-6">
              {researchMessages.map((msg, idx) => (
                <div
                  key={idx}
                  className={cn(
                    "max-w-3xl",
                    msg.role === 'user' ? "ml-auto" : "mr-auto"
                  )}
                >
                  {msg.role === 'user' ? (
                    <div className="p-4 border border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text)] text-sm rounded">
                      {msg.content}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="text-sm text-[var(--text)] leading-relaxed">
                        {formatResearchText(msg.content, msg.sources)}
                      </div>
                      {msg.sources && msg.sources.length > 0 && (
                        <div className="mt-4 pt-3 border-t border-[var(--border)]">
                          <button
                            onClick={() => setExpandedSources(prev => 
                              prev.includes(idx) 
                                ? prev.filter(i => i !== idx) 
                                : [...prev, idx]
                            )}
                            className="flex items-center gap-2 text-xs text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
                          >
                            <ChevronRight 
                              size={14} 
                              className={cn(
                                "transition-transform duration-150",
                                expandedSources.includes(idx) && "rotate-90"
                              )}
                            />
                            <span className="uppercase tracking-widest font-medium">
                              Sources ({msg.sources.length})
                            </span>
                          </button>
                          {expandedSources.includes(idx) && (
                            <div className="mt-2 ml-5 space-y-1">
                              {msg.sources.map((source) => (
                                <Link
                                  key={source.index}
                                  href={`/directory?file=${encodeURIComponent(source.file_name)}`}
                                  className="flex items-start gap-2 py-1 text-xs text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
                                >
                                  <span className="text-[var(--text-subtle)]">[{source.index}]</span>
                                  <span className="line-clamp-1">{source.file_name}</span>
                                </Link>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
              
              {/* Loading indicator */}
              {isResearchLoading && (
                <div className="max-w-3xl mr-auto">
                  <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
                    <Loader2 className="animate-spin" size={16} />
                    <span>Researching...</span>
                  </div>
                </div>
              )}
              
              <div ref={messagesEndRef} />
            </div>
          )}

        </>
      )}

      {/* Follow-up input for research mode - at end of content, above footer */}
      {isResearchMode && hasResearchMessages && (
        <div className="mt-12 mb-8">
          <form onSubmit={handleResearchSubmit} className="flex gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ask a follow-up question..."
              className="flex-1 border border-[var(--border)] px-4 py-3 text-[var(--text)] placeholder:text-[var(--text-subtle)] focus:border-[var(--text)] focus:outline-none"
              style={{ backgroundColor: 'var(--bg)', color: 'var(--text)' }}
              disabled={isResearchLoading}
            />
            <button
              type="submit"
              disabled={isResearchLoading || !query.trim()}
              className={cn(
                "flex items-center justify-center border border-[var(--border)] px-4 transition-colors",
                isResearchLoading || !query.trim()
                  ? "cursor-not-allowed text-[var(--text-subtle)]"
                  : "border-[var(--text)] text-[var(--text)] hover:bg-[var(--bg-secondary)]"
              )}
            >
              {isResearchLoading ? (
                <Loader2 className="animate-spin" size={18} />
              ) : (
                <Send size={18} />
              )}
            </button>
          </form>
        </div>
      )}

      {/* Search Results UI - only show when not in research mode */}
      {searchType !== 'research' && (
        <>
          {/* Folder Results */}
          {folderResults.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-[var(--text-subtle)]">
            Related Folders
          </h2>
          <div className="space-y-2">
            {folderResults.map((folder) => (
              <Link
                key={folder.folder_path}
                href={`/directory?search=${encodeURIComponent(query)}`}
                className="group flex items-center gap-3 border border-[var(--border)] p-4 transition-colors hover:border-[var(--text)] hover:bg-[var(--bg-secondary)]"
              >
                <Folder size={18} className="text-[var(--text-muted)] flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-[var(--text)] truncate">
                      {folder.folder_path}
                    </span>
                    <span className="text-xs text-[var(--text-subtle)] flex-shrink-0">
                      {folder.matching_documents} matching documents
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-[var(--text-muted)] truncate">
                    {folder.sample_documents.map(d => d.file_name).join(', ')}
                  </p>
                </div>
                <ChevronRight size={16} className="text-[var(--text-subtle)] flex-shrink-0 group-hover:text-[var(--text)]" />
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div>
          <div className="mb-6 flex items-center justify-between border-b border-[var(--border)] pb-4">
            <p className="text-sm text-[var(--text-muted)]">
              {results.length} of {totalResults} result{totalResults !== 1 ? 's' : ''}
            </p>
            {processingTime && (
              <p className="text-xs text-[var(--text-subtle)]">
                {processingTime}ms
              </p>
            )}
          </div>
          
          <div className="divide-y divide-[var(--border)]">
            {results.map((result, index) => (
              <SearchResult 
                key={result.document.file_path} 
                result={result} 
                query={query}
                rank={index + 1}
              />
            ))}
          </div>

          {/* See More button */}
          {hasMore && (
            <div className="mt-8 flex justify-center">
              <button
                type="button"
                onClick={handleLoadMore}
                disabled={isLoadingMore}
                className={cn(
                  "flex items-center gap-2 border border-[var(--border)] px-6 py-3 text-sm font-medium uppercase tracking-wide transition-colors",
                  isLoadingMore
                    ? "cursor-not-allowed text-[var(--text-subtle)]"
                    : "text-[var(--text)] hover:border-[var(--text)] hover:bg-[var(--bg-secondary)]"
                )}
              >
                {isLoadingMore ? (
                  <>
                    <Loader2 className="animate-spin" size={16} />
                    Loading...
                  </>
                ) : (
                  'See More'
                )}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Empty state - only show after an actual search was performed */}
      {!isLoading && hasSearched && results.length === 0 && !error && (
        <div className="py-16 text-center">
          <p className="text-[var(--text-muted)]">No results found for &quot;{query}&quot;</p>
          <p className="mt-2 text-sm text-[var(--text-subtle)]">Try different keywords or search type</p>
        </div>
      )}

      {/* Initial state - show suggestions when no search has been performed */}
      {!hasSearched && results.length === 0 && !isLoading && (
        <div className="py-16">
          <p className="mb-6 text-sm text-[var(--text-muted)]">Try searching for:</p>
          <div className="flex flex-wrap gap-3">
            {SEARCH_SUGGESTIONS.map((suggestion) => (
              <button
                key={suggestion}
                onClick={() => handleSuggestionClick(suggestion)}
                className="border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-muted)] transition-colors hover:border-[var(--text)] hover:text-[var(--text)]"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
}
