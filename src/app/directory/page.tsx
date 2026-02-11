'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight, ChevronDown, FileText, Folder, FolderOpen, ExternalLink, Users, MapPin, Calendar } from 'lucide-react';
import { cn, getDisplayDate } from '@/lib/utils';

import ResultContextAssistant from '@/components/ResultContextAssistant';

interface DirectoryDocument {
  id: string;
  file_name: string;
  file_path: string;
  drive_file_id: string;
  web_view_link?: string;
  folder_path?: string;
  people: string[];
  locations: string[];
  dates: string[];
  summary: string;
  ocr_content: string;
}

interface FolderGroup {
  path: string;
  documents: DirectoryDocument[];
  count: number;
}

interface DirectoryResponse {
  folders: FolderGroup[];
  totalFolders: number;
  totalDocuments: number;
}

interface TreeNode {
  name: string;
  path: string;
  documents: DirectoryDocument[];
  children: TreeNode[];
  totalCount: number; // Total docs in this node and all descendants
}

function DirectoryContent() {
  const searchParams = useSearchParams();
  const [data, setData] = useState<DirectoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [expandedDocId, setExpandedDocId] = useState<string | null>(null);
  const [showAssistantFor, setShowAssistantFor] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Handle URL params for deep linking to a specific file (by ID or filename)
  useEffect(() => {
    const fileParam = searchParams.get('file');
    if (fileParam) {
      // Will be resolved to actual doc ID after data loads
      setExpandedDocId(fileParam);
    }
  }, [searchParams]);

  useEffect(() => {
    async function fetchDirectory() {
      try {
        const response = await fetch('/api/directory');
        if (!response.ok) throw new Error('Failed to fetch directory');
        const result = await response.json();
        setData(result);
        
        // If there's a file param in URL, find and expand the document
        const fileParam = searchParams.get('file');
        if (fileParam && result.folders) {
          for (const folder of result.folders) {
            // Search by both ID and filename
            const doc = folder.documents.find((d: DirectoryDocument) => 
              d.id === fileParam || d.file_name === fileParam
            );
            if (doc) {
              // Set the actual document ID for expansion
              setExpandedDocId(doc.id);
              
              // Expand all parent folders
              const DELIMITER = ' > ';
              const parts = folder.path.split(DELIMITER);
              const foldersToExpand = new Set<string>();
              let currentPath = '';
              for (const part of parts) {
                currentPath = currentPath ? `${currentPath}${DELIMITER}${part}` : part;
                foldersToExpand.add(currentPath);
              }
              setExpandedFolders(foldersToExpand);
              
              // Scroll to the document after a short delay
              setTimeout(() => {
                const element = document.getElementById(`doc-${doc.id}`);
                if (element) {
                  element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
              }, 300);
              break;
            }
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }
    fetchDirectory();
  }, [searchParams]);

  const toggleFolder = (path: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  // Build hierarchical tree from flat folder list
  const tree = useMemo(() => {
    if (!data?.folders) return [];
    
    // Use " > " as the delimiter (matches the ingestion script)
    const DELIMITER = ' > ';
    
    const folders = searchQuery 
      ? data.folders.filter(folder => {
          const query = searchQuery.toLowerCase();
          return (
            folder.path.toLowerCase().includes(query) ||
            folder.documents.some(doc => 
              doc.file_name.toLowerCase().includes(query) ||
              doc.summary.toLowerCase().includes(query)
            )
          );
        })
      : data.folders;

    // Create a map for quick lookup
    const nodeMap: Record<string, TreeNode> = {};
    const roots: TreeNode[] = [];

    // First pass: create all nodes
    for (const folder of folders) {
      const parts = folder.path.split(DELIMITER);
      let currentPath = '';
      
      for (let i = 0; i < parts.length; i++) {
        const name = parts[i];
        const prevPath = currentPath;
        currentPath = currentPath ? `${currentPath}${DELIMITER}${name}` : name;
        
        if (!nodeMap[currentPath]) {
          nodeMap[currentPath] = {
            name,
            path: currentPath,
            documents: [],
            children: [],
            totalCount: 0
          };
        }
        
        // Link to parent
        if (prevPath && nodeMap[prevPath]) {
          const parent = nodeMap[prevPath];
          if (!parent.children.find(c => c.path === currentPath)) {
            parent.children.push(nodeMap[currentPath]);
          }
        } else if (i === 0 && !roots.find(r => r.path === currentPath)) {
          roots.push(nodeMap[currentPath]);
        }
      }
      
      // Add documents to the leaf node
      if (nodeMap[folder.path]) {
        nodeMap[folder.path].documents = folder.documents;
      }
    }

    // Second pass: calculate total counts (bottom-up)
    const calculateTotals = (node: TreeNode): number => {
      let total = node.documents.length;
      for (const child of node.children) {
        total += calculateTotals(child);
      }
      node.totalCount = total;
      return total;
    };

    for (const root of roots) {
      calculateTotals(root);
    }

    // Sort children alphabetically
    const sortTree = (node: TreeNode) => {
      node.children.sort((a, b) => a.name.localeCompare(b.name));
      for (const child of node.children) {
        sortTree(child);
      }
    };

    roots.sort((a, b) => a.name.localeCompare(b.name));
    for (const root of roots) {
      sortTree(root);
    }

    return roots;
  }, [data, searchQuery]);

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

  // Recursive component to render tree nodes
  const TreeNodeComponent = ({ node, depth = 0 }: { node: TreeNode; depth?: number }) => {
    const isExpanded = expandedFolders.has(node.path);
    const hasChildren = node.children.length > 0;
    const hasDocuments = node.documents.length > 0;
    const isExpandable = hasChildren || hasDocuments;

    return (
      <div>
        {/* Folder row */}
        <button
          onClick={() => isExpandable && toggleFolder(node.path)}
          className={cn(
            "w-full flex items-center gap-2 py-3 hover:bg-[var(--bg-hover)] transition-colors text-left border-b border-[var(--border)]",
            !isExpandable && "cursor-default"
          )}
          style={{ paddingLeft: `${depth * 24 + 8}px` }}
        >
          <span className="text-[var(--text-muted)] w-4">
            {isExpandable && (
              isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />
            )}
          </span>
          {isExpanded && hasChildren ? (
            <FolderOpen size={16} className="text-[var(--text-muted)]" />
          ) : (
            <Folder size={16} className="text-[var(--text-muted)]" />
          )}
          <span className="flex-1 text-[var(--text)] font-medium truncate">
            {node.name}
          </span>
          <span className="text-sm text-[var(--text-subtle)] tabular-nums pr-4">
            {node.totalCount}
          </span>
        </button>

        {/* Children and documents */}
        {isExpanded && (
          <>
            {/* Render child folders first */}
            {node.children.map(child => (
              <TreeNodeComponent key={child.path} node={child} depth={depth + 1} />
            ))}

            {/* Render documents */}
            {hasDocuments && (
              <div 
                className="border-b border-[var(--border)]"
                style={{ paddingLeft: `${(depth + 1) * 24 + 8}px` }}
              >
                {node.documents.map((doc) => {
                  const displayDate = getDisplayDate(doc.file_name, doc.dates);
                  const isDocExpanded = expandedDocId === doc.id;
                  
                  // Format people names
                  const formatName = (name: string): string => {
                    return name.split(' ').map(word => {
                      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
                    }).join(' ');
                  };
                  const formattedPeople = doc.people.map(formatName);
                  
                  return (
                    <div key={doc.id} id={`doc-${doc.id}`} className="border-t border-[var(--border)]">
                      {/* Document row - clickable */}
                      <button
                        onClick={() => setExpandedDocId(isDocExpanded ? null : doc.id)}
                        className="w-full py-3 hover:bg-[var(--bg-hover)] transition-colors text-left"
                      >
                        <div className="flex items-start gap-2">
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
                          <div className="pl-8 pr-4 pb-4 space-y-4">
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
                              
                              {/* Date */}
                              <div>
                                <h4 className="mb-1 text-xs font-semibold uppercase tracking-widest text-[var(--text-subtle)] flex items-center gap-1">
                                  <Calendar size={10} />
                                  Date
                                </h4>
                                <p className="text-sm text-[var(--text-muted)]">
                                  {displayDate || 'None identified'}
                                </p>
                              </div>
                              
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
                })}
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      {/* Header */}
      <div className="mb-12">
        <h1 className="text-4xl font-medium tracking-tight text-[var(--text)] mb-4">
          Directory
        </h1>
        <p className="text-[var(--text-muted)] max-w-2xl">
          Browse documents organized by their archival folder structure.
        </p>
        <p className="mt-2 text-sm text-[var(--text-subtle)]">
          {data?.totalFolders} folders · {data?.totalDocuments} documents
        </p>
      </div>

      {/* Search */}
      <div className="mb-8">
        <input
          type="text"
          placeholder="Search folders and documents..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full max-w-md px-4 py-2 bg-transparent border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--text-subtle)] focus:outline-none focus:border-[var(--text)]"
        />
      </div>

      {/* Folder Tree */}
      <div className="border-t border-[var(--border)]">
        {tree.map((rootNode) => (
          <TreeNodeComponent key={rootNode.path} node={rootNode} depth={0} />
        ))}
      </div>

      {tree.length === 0 && (
        <p className="py-12 text-center text-[var(--text-muted)]">
          No folders match your search.
        </p>
      )}
    </div>
  );
}

export default function DirectoryPage() {
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
      <DirectoryContent />
    </Suspense>
  );
}
