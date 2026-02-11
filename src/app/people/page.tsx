'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Search, ChevronRight, X, Folder } from 'lucide-react';
import { cn, getDisplayDate } from '@/lib/utils';

interface PersonEntry {
  name: string;
  documentCount: number;
}

interface PersonDocument {
  id: string;
  file_name: string;
  file_path: string;
  drive_file_id: string;
  web_view_link?: string;
  folder_path?: string;
  people: string[];
  dates: string[];
  summary: string;
}

interface PeopleResponse {
  people: PersonEntry[];
  totalPeople: number;
}

interface PersonDocumentsResponse {
  person: string;
  documents: PersonDocument[];
  count: number;
}

export default function PeoplePage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [data, setData] = useState<PeopleResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPerson, setSelectedPerson] = useState<string | null>(null);
  const [personDocuments, setPersonDocuments] = useState<PersonDocumentsResponse | null>(null);
  const [loadingDocuments, setLoadingDocuments] = useState(false);

  const fetchPersonDocuments = useCallback(async (name: string) => {
    setSelectedPerson(name);
    setLoadingDocuments(true);
    try {
      const response = await fetch(`/api/people?name=${encodeURIComponent(name)}`);
      if (!response.ok) throw new Error('Failed to fetch documents');
      const data = await response.json();
      setPersonDocuments(data);
    } catch (err) {
      console.error('Error fetching person documents:', err);
    } finally {
      setLoadingDocuments(false);
    }
  }, []);

  useEffect(() => {
    async function fetchPeople() {
      try {
        const response = await fetch('/api/people');
        if (!response.ok) throw new Error('Failed to fetch people');
        const data = await response.json();
        setData(data);
        
        // Check if there's a name in the URL params
        const nameFromUrl = searchParams.get('name');
        if (nameFromUrl) {
          fetchPersonDocuments(nameFromUrl);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }
    fetchPeople();
  }, [searchParams, fetchPersonDocuments]);

  const filteredPeople = data?.people.filter(person => {
    if (!searchQuery) return true;
    return person.name.toLowerCase().includes(searchQuery.toLowerCase());
  }) || [];

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="animate-pulse">
          <div className="h-12 w-48 bg-[var(--border)] mb-8" />
          <div className="space-y-2">
            {[...Array(10)].map((_, i) => (
              <div key={i} className="h-12 bg-[var(--border)]" />
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

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      {/* Header */}
      <div className="mb-12">
        <h1 className="text-4xl font-medium tracking-tight text-[var(--text)] mb-4">
          People
        </h1>
        <p className="text-[var(--text-muted)] max-w-2xl">
          A directory of individuals mentioned across the document collection. 
          Click on a person to see which documents reference them.
        </p>
        <p className="mt-2 text-sm text-[var(--text-subtle)]">
          {data?.totalPeople} people identified
        </p>
      </div>

      <div className="flex gap-8">
        {/* People List */}
        <div className={cn("flex-1 min-w-0", selectedPerson && "max-w-md")}>
          {/* Search */}
          <div className="mb-6 relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-subtle)]" />
            <input
              type="text"
              placeholder="Search people..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-transparent border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--text-subtle)] focus:outline-none focus:border-[var(--text)]"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-subtle)] hover:text-[var(--text)]"
              >
                <X size={16} />
              </button>
            )}
          </div>

          {/* Table Header */}
          <div className="flex items-center gap-4 py-2 text-xs text-[var(--text-subtle)] uppercase tracking-wider border-b border-[var(--border)]">
            <span className="w-6"></span>
            <span className="flex-1">Name</span>
            <span className="w-20 text-right">Documents</span>
          </div>

          {/* People List */}
          <div className="divide-y divide-[var(--border)]">
            {filteredPeople.map((person, index) => (
              <button
                key={person.name}
                onClick={() => fetchPersonDocuments(person.name)}
                className={cn(
                  "w-full flex items-center gap-4 py-3 hover:bg-[var(--bg-hover)] transition-colors text-left",
                  selectedPerson === person.name && "bg-[var(--bg-hover)]"
                )}
              >
                <span className="w-6 text-xs text-[var(--text-subtle)] tabular-nums">
                  {selectedPerson === person.name ? <ChevronRight size={14} /> : ''}
                </span>
                <span className="flex-1 text-[var(--text)] truncate">
                  {person.name}
                </span>
                <span className="w-20 text-right text-sm text-[var(--text-muted)] tabular-nums">
                  {person.documentCount}
                </span>
              </button>
            ))}
          </div>

          {filteredPeople.length === 0 && (
            <p className="py-12 text-center text-[var(--text-muted)]">
              No people match your search.
            </p>
          )}
        </div>

        {/* Document Panel */}
        {selectedPerson && (
          <div className="flex-1 min-w-0 border-l border-[var(--border)] pl-8">
            <div className="sticky top-24">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-xl font-medium text-[var(--text)]">
                    {selectedPerson}
                  </h2>
                  <p className="text-sm text-[var(--text-muted)]">
                    {personDocuments?.count || 0} documents
                  </p>
                </div>
                <button
                  onClick={() => {
                    setSelectedPerson(null);
                    setPersonDocuments(null);
                  }}
                  className="text-[var(--text-subtle)] hover:text-[var(--text)]"
                >
                  <X size={20} />
                </button>
              </div>

              {loadingDocuments ? (
                <div className="space-y-3">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="h-20 bg-[var(--border)] animate-pulse" />
                  ))}
                </div>
              ) : (
                <div className="space-y-3 max-h-[calc(100vh-200px)] overflow-y-auto">
                  {personDocuments?.documents.map((doc) => {
                    const displayDate = getDisplayDate(doc.file_name, doc.dates);
                    return (
                      <button
                        key={doc.id}
                        onClick={() => router.push(`/directory?file=${doc.id}`)}
                        className="w-full text-left p-4 border border-[var(--border)] hover:border-[var(--text-muted)] hover:bg-[var(--bg-hover)] transition-colors"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-[var(--text)] font-medium truncate">
                              {doc.file_name}
                            </p>
                            {displayDate && (
                              <p className="text-xs text-[var(--text-muted)] mt-1">
                                {displayDate}
                              </p>
                            )}
                            {doc.summary && (
                              <p className="text-xs text-[var(--text-muted)] mt-2 line-clamp-2">
                                {doc.summary}
                              </p>
                            )}
                            {doc.folder_path && (
                              <p className="text-xs text-[var(--text-subtle)] mt-2 truncate flex items-center gap-1">
                                <Folder size={10} />
                                {doc.folder_path}
                              </p>
                            )}
                          </div>
                          <ChevronRight size={16} className="flex-shrink-0 text-[var(--text-subtle)]" />
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
