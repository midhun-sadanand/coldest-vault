'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight, ChevronDown, FileText, Calendar, ExternalLink, Users, Folder } from 'lucide-react';
import { cn, getDisplayDate } from '@/lib/utils';
import ResultContextAssistant from '@/components/ResultContextAssistant';

interface ChronologyDocument {
  id: string;
  file_name: string;
  file_path: string;
  drive_file_id: string;
  web_view_link?: string;
  folder_path?: string;
  source_type?: 'primary' | 'secondary';
  publication_date?: string;
  people: string[];
  locations: string[];
  dates: string[];
  summary: string;
  ocr_content: string;
  sortKey?: string;
}

interface MonthGroup {
  month: string;
  documents: ChronologyDocument[];
  count: number;
}

interface YearGroup {
  year: string;
  months: MonthGroup[];
  totalCount: number;
}

interface ChronologyResponse {
  years: YearGroup[];
  undated: { documents: ChronologyDocument[]; count: number } | null;
  totalYears: number;
  totalDocuments: number;
  datedDocuments: number;
  undatedDocuments: number;
}

function ChronologyContent() {
  const searchParams = useSearchParams();
  const [data, setData] = useState<ChronologyResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedYears, setExpandedYears] = useState<Set<string>>(new Set());
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());
  const [expandedDocId, setExpandedDocId] = useState<string | null>(null);
  const [showAssistantFor, setShowAssistantFor] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Handle URL params for deep linking to a specific file
  useEffect(() => {
    const fileId = searchParams.get('file');
    if (fileId) {
      setExpandedDocId(fileId);
    }
  }, [searchParams]);

  useEffect(() => {
    async function fetchChronology() {
      try {
        const response = await fetch('/api/chronology');
        if (!response.ok) throw new Error('Failed to fetch chronology');
        const result = await response.json();
        setData(result);
        
        // If there's a file ID in URL, expand the year/month containing it
        const fileId = searchParams.get('file');
        if (fileId && result.years) {
          for (const yearGroup of result.years) {
            for (const monthGroup of yearGroup.months) {
              const doc = monthGroup.documents.find((d: ChronologyDocument) => d.id === fileId);
              if (doc) {
                setExpandedYears(new Set([yearGroup.year]));
                setExpandedMonths(new Set([`${yearGroup.year}-${monthGroup.month}`]));
                return;
              }
            }
          }
          // Check undated
          if (result.undated?.documents.find((d: ChronologyDocument) => d.id === fileId)) {
            setExpandedYears(new Set(['Undated']));
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }
    fetchChronology();
  }, [searchParams]);

  const toggleYear = (year: string) => {
    setExpandedYears(prev => {
      const next = new Set(prev);
      if (next.has(year)) {
        next.delete(year);
      } else {
        next.add(year);
      }
      return next;
    });
  };

  const toggleMonth = (yearMonth: string) => {
    setExpandedMonths(prev => {
      const next = new Set(prev);
      if (next.has(yearMonth)) {
        next.delete(yearMonth);
      } else {
        next.add(yearMonth);
      }
      return next;
    });
  };

  // Filter data based on search
  const filteredYears = data?.years.filter(yearGroup => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    
    return (
      yearGroup.year.includes(query) ||
      yearGroup.months.some(monthGroup => 
        monthGroup.month.toLowerCase().includes(query) ||
        monthGroup.documents.some(doc =>
          doc.file_name.toLowerCase().includes(query) ||
          doc.summary.toLowerCase().includes(query)
        )
      )
    );
  }) || [];

  const showUndated = !searchQuery || 
    data?.undated?.documents.some(doc =>
      doc.file_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.summary.toLowerCase().includes(searchQuery.toLowerCase())
    );

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="animate-pulse">
          <div className="h-12 w-48 bg-[var(--border)] mb-8" />
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 bg-[var(--border)]" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-12">
        <p className="text-red-500">Error: {error}</p>
      </div>
    );
  }

  // Document row component
  const DocumentRow = ({ doc, depth = 0 }: { doc: ChronologyDocument; depth?: number }) => {
    const displayDate = getDisplayDate(doc.file_name, doc.dates);
    const isDocExpanded = expandedDocId === doc.id;
    
    const formatName = (name: string): string => {
      return name.split(' ').map(word => {
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      }).join(' ');
    };
    const formattedPeople = doc.people.map(formatName);
    
    return (
      <div className="border-t border-[var(--border)]">
        <button
          onClick={() => setExpandedDocId(isDocExpanded ? null : doc.id)}
          className="w-full py-3 hover:bg-[var(--bg-hover)] transition-colors text-left"
          style={{ paddingLeft: `${depth * 24 + 8}px` }}
        >
          <div className="flex items-start gap-2 pr-4">
            <span className={cn(
              "text-[var(--text-subtle)] transition-transform duration-150 mt-0.5",
              isDocExpanded && "rotate-90"
            )}>
              <ChevronRight size={14} />
            </span>
            <FileText size={14} className="text-[var(--text-subtle)] mt-0.5 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <p className={cn(
                "text-sm text-[var(--text)]",
                isDocExpanded ? "" : "truncate"
              )}>
                {doc.file_name}
              </p>
              {!isDocExpanded && doc.summary && (
                <p className="text-xs text-[var(--text-muted)] line-clamp-1 mt-0.5">
                  {doc.summary}
                </p>
              )}
            </div>
            <span className="text-sm text-[var(--text-muted)] flex-shrink-0">
              {displayDate || ''}
            </span>
          </div>
        </button>
        
        {/* Expanded document details */}
        <div className={cn(
          "grid transition-all duration-300 ease-out",
          isDocExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        )}>
          <div className="overflow-hidden">
            <div className="pl-12 pr-4 pb-4 space-y-4" style={{ marginLeft: `${depth * 24}px` }}>
              {/* Summary */}
              {doc.summary && (
                <div>
                  <h4 className="mb-1 text-xs font-semibold uppercase tracking-widest text-[var(--text-subtle)]">Summary</h4>
                  <p className="text-sm text-[var(--text-muted)] leading-relaxed">
                    {doc.summary}
                  </p>
                </div>
              )}
              
              {/* Metadata grid */}
              <div className="grid gap-4 sm:grid-cols-2">
                {/* People */}
                <div>
                  <h4 className="mb-1 text-xs font-semibold uppercase tracking-widest text-[var(--text-subtle)] flex items-center gap-1">
                    <Users size={10} />
                    People
                  </h4>
                  <p className="text-sm text-[var(--text-muted)]">
                    {formattedPeople.length > 0 ? (
                      formattedPeople.map((name, i) => (
                        <span key={name}>
                          <Link
                            href={`/people?name=${encodeURIComponent(name)}`}
                            className="hover:text-[var(--text)] hover:underline underline-offset-2 transition-colors"
                          >
                            {name}
                          </Link>
                          {i < formattedPeople.length - 1 && ', '}
                        </span>
                      ))
                    ) : (
                      'None identified'
                    )}
                  </p>
                </div>
                
                {/* Folder */}
                {doc.folder_path && (
                  <div>
                    <h4 className="mb-1 text-xs font-semibold uppercase tracking-widest text-[var(--text-subtle)] flex items-center gap-1">
                      <Folder size={10} />
                      Folder
                    </h4>
                    <p className="text-sm text-[var(--text-muted)]">
                      {doc.folder_path}
                    </p>
                  </div>
                )}
                
                {/* Source */}
                <div>
                  <h4 className="mb-1 text-xs font-semibold uppercase tracking-widest text-[var(--text-subtle)]">Source</h4>
                  {doc.web_view_link ? (
                    <a 
                      href={doc.web_view_link} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm text-[var(--text)] underline underline-offset-2 hover:opacity-80"
                    >
                      View Original <ExternalLink size={12} />
                    </a>
                  ) : (
                    <p className="text-sm text-[var(--text-subtle)]">No link available</p>
                  )}
                </div>
              </div>
              
              {/* AI Assistant */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowAssistantFor(showAssistantFor === doc.id ? null : doc.id)}
                  className="text-sm text-[var(--text)] underline underline-offset-2 hover:opacity-80"
                >
                  {showAssistantFor === doc.id ? 'Hide AI Assistant' : 'Ask AI about this document'}
                </button>
                
                {showAssistantFor === doc.id && (
                  <div className="mt-4" style={{ overflowAnchor: 'none' }}>
                    <ResultContextAssistant 
                      resultMetadata={{
                        file_path: doc.file_path,
                        file_name: doc.file_name,
                        summary: doc.summary,
                        people: doc.people,
                        locations: doc.locations,
                        dates: doc.dates,
                        ocr_content: doc.ocr_content,
                        folder_path: doc.folder_path,
                        source_type: doc.source_type,
                        publication_date: doc.publication_date
                      }}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      {/* Header */}
      <div className="mb-12">
        <h1 className="text-4xl font-medium tracking-tight text-[var(--text)] mb-4">
          Chronology
        </h1>
        <p className="text-[var(--text-muted)] max-w-2xl">
          Browse documents organized by date.
        </p>
        <p className="mt-2 text-sm text-[var(--text-subtle)]">
          {data?.datedDocuments} dated · {data?.undatedDocuments} undated · {data?.totalDocuments} total
        </p>
      </div>

      {/* Search */}
      <div className="mb-8">
        <input
          type="text"
          placeholder="Search by year, month, or document..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full max-w-md px-4 py-2 bg-transparent border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--text-subtle)] focus:outline-none focus:border-[var(--text)]"
        />
      </div>

      {/* Timeline */}
      <div className="border-t border-[var(--border)]">
        {filteredYears.map((yearGroup) => {
          const isYearExpanded = expandedYears.has(yearGroup.year);
          
          return (
            <div key={yearGroup.year}>
              {/* Year row */}
              <button
                onClick={() => toggleYear(yearGroup.year)}
                className="w-full flex items-center gap-2 py-3 hover:bg-[var(--bg-hover)] transition-colors text-left border-b border-[var(--border)] px-2"
              >
                <span className="text-[var(--text-muted)] w-4">
                  {isYearExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </span>
                <Calendar size={16} className="text-[var(--text-muted)]" />
                <span className="flex-1 text-[var(--text)] font-medium">
                  {yearGroup.year}
                </span>
                <span className="text-sm text-[var(--text-subtle)] tabular-nums pr-2">
                  {yearGroup.totalCount}
                </span>
              </button>

              {/* Months */}
              {isYearExpanded && (
                <>
                  {yearGroup.months.map((monthGroup) => {
                    const monthKey = `${yearGroup.year}-${monthGroup.month}`;
                    const isMonthExpanded = expandedMonths.has(monthKey);
                    
                    return (
                      <div key={monthKey}>
                        {/* Month row */}
                        <button
                          onClick={() => toggleMonth(monthKey)}
                          className="w-full flex items-center gap-2 py-3 hover:bg-[var(--bg-hover)] transition-colors text-left border-b border-[var(--border)]"
                          style={{ paddingLeft: '32px' }}
                        >
                          <span className="text-[var(--text-muted)] w-4">
                            {isMonthExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </span>
                          <span className="flex-1 text-[var(--text-muted)]">
                            {monthGroup.month}
                          </span>
                          <span className="text-sm text-[var(--text-subtle)] tabular-nums pr-4">
                            {monthGroup.count}
                          </span>
                        </button>

                        {/* Documents */}
                        {isMonthExpanded && (
                          <div className="border-b border-[var(--border)]">
                            {monthGroup.documents.map((doc) => (
                              <DocumentRow key={doc.id} doc={doc} depth={2} />
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          );
        })}

        {/* Undated documents */}
        {showUndated && data?.undated && (
          <div>
            <button
              onClick={() => toggleYear('Undated')}
              className="w-full flex items-center gap-2 py-3 hover:bg-[var(--bg-hover)] transition-colors text-left border-b border-[var(--border)] px-2"
            >
              <span className="text-[var(--text-muted)] w-4">
                {expandedYears.has('Undated') ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </span>
              <Calendar size={16} className="text-[var(--text-subtle)]" />
              <span className="flex-1 text-[var(--text-muted)] font-medium">
                Undated
              </span>
              <span className="text-sm text-[var(--text-subtle)] tabular-nums pr-2">
                {data.undated.count}
              </span>
            </button>

            {expandedYears.has('Undated') && (
              <div className="border-b border-[var(--border)]">
                {data.undated.documents.map((doc) => (
                  <DocumentRow key={doc.id} doc={doc} depth={1} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {filteredYears.length === 0 && !showUndated && (
        <p className="py-12 text-center text-[var(--text-muted)]">
          No documents match your search.
        </p>
      )}
    </div>
  );
}

export default function ChronologyPage() {
  return (
    <Suspense fallback={
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="animate-pulse">
          <div className="h-12 w-48 bg-[var(--border)] mb-8" />
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 bg-[var(--border)]" />
            ))}
          </div>
        </div>
      </div>
    }>
      <ChronologyContent />
    </Suspense>
  );
}
