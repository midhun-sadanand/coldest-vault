'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronRight, ExternalLink, Users, MapPin, Calendar } from 'lucide-react';
import { cn, getDisplayDate } from '@/lib/utils';
import type { SpicyResult } from '@/types';
import ResultContextAssistant from './ResultContextAssistant';

// Simple tooltip component
const Tooltip = ({ children, content }: { children: React.ReactNode; content: string }) => {
  const [show, setShow] = useState(false);
  
  return (
    <div 
      className="relative inline-block"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
        <div className="absolute top-full left-0 mt-1 px-3 py-1.5 text-xs border border-[var(--border)] bg-[var(--bg)] text-[var(--text-muted)] z-50 whitespace-nowrap">
          {content}
        </div>
      )}
    </div>
  );
};

interface SearchResultProps {
  result: SpicyResult;
  query: string;
  rank: number;
}

export default function SearchResult({ result, query, rank }: SearchResultProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showAssistant, setShowAssistant] = useState(false);
  
  const { document: doc, score } = result;
  
  // Filter out "Eisenhower Library" from locations - it's the archive source, not a document location
  const filteredLocations = doc.locations.filter(loc => 
    !loc.toLowerCase().includes('eisenhower library') &&
    !loc.toLowerCase().includes('eisenhower presidential')
  );
  
  // Properly capitalize names (convert "JAMES S. LAY" to "James S. Lay")
  const formatName = (name: string): string => {
    return name.split(' ').map(word => {
      if (word.length <= 2 && word === word.toUpperCase()) {
        // Keep short abbreviations like "S." or "Jr" as-is or title case
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      }
      // Title case the word
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    }).join(' ');
  };
  
  const formattedPeople = doc.people.map(formatName);

  // Clickable person name link
  const PersonLink = ({ name, className }: { name: string; className?: string }) => (
    <Link
      href={`/people?name=${encodeURIComponent(name)}`}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        "hover:text-[var(--text)] hover:underline underline-offset-2 transition-colors",
        className
      )}
    >
      {name}
    </Link>
  );

  return (
    <div className="py-6">
      {/* Header - clickable row */}
      <button
        type="button"
        className="w-full text-left"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-1 min-w-0 items-start gap-3">
            <span className={cn(
              "mt-1.5 flex-shrink-0 text-[var(--text-subtle)] transition-transform duration-150",
              isExpanded && "rotate-90"
            )}>
              <ChevronRight size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex items-center gap-3">
                <span className="text-xs text-[var(--text-subtle)]">#{rank}</span>
                {/* Show percentage for normalized scores (0-1 range from semantic search) */}
                {/* New scoring: 75%+ = text match, 50-75% = good semantic, <50% = weak/no match */}
                {score !== undefined && score <= 1 && score > 0.1 && (
                  <span className={cn(
                    "text-xs",
                    score >= 0.75 ? "text-emerald-500" :
                    score >= 0.50 ? "text-amber-500" :
                    "text-[var(--text-subtle)]"
                  )}>
                    {(score * 100).toFixed(0)}% match
                  </span>
                )}
              </div>
              
              <h3 className={cn(
                "font-medium text-[var(--text)]",
                isExpanded ? "" : "truncate"
              )}>
                {doc.file_name}
              </h3>
              
              <p className="mt-1 text-sm text-[var(--text-muted)]">
                {doc.summary || 'No summary available'}
              </p>
            </div>
          </div>
        </div>

        {/* Quick metadata */}
        <div className="mt-3 flex flex-wrap gap-6 pl-9 text-xs text-[var(--text-subtle)]">
          {formattedPeople.length > 0 && (
            formattedPeople.length > 3 ? (
              <Tooltip content={formattedPeople.join(', ')}>
                <div className="flex items-center gap-1.5">
                  <Users size={12} />
                  <span>
                    {formattedPeople.slice(0, 3).map((name, i) => (
                      <span key={name}>
                        <PersonLink name={name} />
                        {i < Math.min(formattedPeople.length, 3) - 1 && ', '}
                      </span>
                    ))}
                    ...
                  </span>
                </div>
              </Tooltip>
            ) : (
              <div className="flex items-center gap-1.5">
                <Users size={12} />
                <span>
                  {formattedPeople.slice(0, 3).map((name, i) => (
                    <span key={name}>
                      <PersonLink name={name} />
                      {i < formattedPeople.length - 1 && ', '}
                    </span>
                  ))}
                </span>
              </div>
            )
          )}
          {filteredLocations.length > 0 && (
            <Tooltip content={filteredLocations.join(', ')}>
              <div className="flex items-center gap-1.5 cursor-help">
                <MapPin size={12} />
                <span>{filteredLocations.slice(0, 2).join(', ')}{filteredLocations.length > 2 ? '...' : ''}</span>
              </div>
            </Tooltip>
          )}
          {(() => {
            const displayDate = getDisplayDate(doc.file_name, doc.dates);
            return displayDate ? (
              <div className="flex items-center gap-1.5">
                <Calendar size={12} />
                <span>{displayDate}</span>
              </div>
            ) : null;
          })()}
        </div>
      </button>

      {/* Expanded content with smooth animation */}
      <div 
        className={cn(
          "grid transition-all duration-300 ease-out",
          isExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        )}
      >
        <div className="overflow-hidden">
          <div className="mt-6 space-y-6 border-t border-[var(--border)] pt-6 pl-9">
            {/* Full summary */}
            {doc.summary && (
              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-widest text-[var(--text-subtle)]">Summary</h4>
                <p className="text-sm text-[var(--text-muted)] leading-relaxed">
                  {doc.summary}
                </p>
              </div>
            )}
            
            {/* Full metadata */}
            <div className="grid gap-6 sm:grid-cols-2">
              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-widest text-[var(--text-subtle)]">People</h4>
                <p className="text-sm text-[var(--text-muted)]">
                  {formattedPeople.length > 0 ? (
                    formattedPeople.map((name, i) => (
                      <span key={name}>
                        <PersonLink name={name} />
                        {i < formattedPeople.length - 1 && ', '}
                      </span>
                    ))
                  ) : (
                    'None identified'
                  )}
                </p>
              </div>
              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-widest text-[var(--text-subtle)]">Locations</h4>
                <p className="text-sm text-[var(--text-muted)]">
                  {filteredLocations.length > 0 ? filteredLocations.join(', ') : 'None identified'}
                </p>
              </div>
              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-widest text-[var(--text-subtle)]">Date</h4>
                <p className="text-sm text-[var(--text-muted)]">
                  {getDisplayDate(doc.file_name, doc.dates) || 'None identified'}
                </p>
              </div>
              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-widest text-[var(--text-subtle)]">Source</h4>
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

            {/* AI Assistant toggle */}
            <div>
              <button
                type="button"
                onClick={() => setShowAssistant(!showAssistant)}
                className="text-sm text-[var(--text)] underline underline-offset-2 hover:opacity-80"
              >
                {showAssistant ? 'Hide AI Assistant' : 'Ask AI about this document'}
              </button>
              
              {showAssistant && (
                <div className="mt-4">
                  <ResultContextAssistant 
                    resultMetadata={{
                      file_path: doc.file_path,
                      summary: doc.summary,
                      people: doc.people,
                      locations: doc.locations,
                      dates: doc.dates,
                      ocr_content: doc.ocr_content
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
}
