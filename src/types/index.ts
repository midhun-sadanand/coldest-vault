// Document types - mirroring the epsteinarchives structure

export interface Document {
  file_path: string;
  file_name: string;
  drive_file_id?: string;
  web_view_link?: string;
  folder_path?: string;
  people: string[];
  locations: string[];
  dates: string[];
  summary: string;
  ocr_content: string;
  text_for_search?: string;
  embedding?: number[];
  created_at?: number;
  updated_at?: number;
}

export interface SearchResult {
  document: Document;
  score: number;
  highlights?: Record<string, string[]>;
}

export interface SpicyResult extends SearchResult {
  spicy_rank?: number;
  spicy_reason?: string;
}

export interface SearchRequest {
  query: string;
  limit?: number;
  offset?: number;
  search_type?: 'fuzzy' | 'semantic' | 'spicy';
}

export interface FolderSearchResult {
  folder_path: string;
  matching_documents: number;
  sample_documents: Array<{
    file_name: string;
    summary: string;
  }>;
}

export interface SearchResponse {
  results: SearchResult[] | SpicyResult[];
  folder_results?: FolderSearchResult[];
  total: number;
  has_more: boolean;
  query: string;
  search_type: string;
  processing_time_ms?: number;
}

export interface ContextHistoryItem {
  role: 'user' | 'assistant';
  content: string;
}

export interface ResultContextRequest {
  query: string;
  result_metadata: {
    file_path: string;
    summary: string;
    people: string[];
    locations: string[];
    dates: string[];
    ocr_content: string;
  };
  conversation_history?: ContextHistoryItem[];
}

export interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface ResultContextResponse {
  response: string;
  token_usage?: TokenUsage;
}

export interface TypeSenseDocument {
  id?: string;
  file_path: string;
  file_name: string;
  drive_file_id: string;
  web_view_link: string;
  folder_path?: string;
  people: string[];
  locations: string[];
  dates: string[];
  summary: string;
  ocr_content: string;
  text_for_search: string;
  embedding: number[];
  created_at: number;
  updated_at: number;
}

// Directory types
export interface FolderGroup {
  path: string;
  documents: TypeSenseDocument[];
  count: number;
}

// People types
export interface PersonEntry {
  name: string;
  documentCount: number;
}

export interface HealthResponse {
  status: 'healthy' | 'unhealthy';
  document_count: number;
  timestamp: string;
}

export interface CountResponse {
  count: number;
}

// Research mode types (corpus-wide chatbot)
export interface ResearchSource {
  index: number;
  file_name: string;
  file_path: string;
  web_view_link: string;
  folder_path?: string;
  summary: string;
}

export interface ResearchMessage {
  role: 'user' | 'assistant';
  content: string;
  sources?: ResearchSource[];
}

export interface ResearchRequest {
  query: string;
  conversation_history?: ResearchMessage[];
}

export interface ResearchResponse {
  response: string;
  sources: ResearchSource[];
  token_usage?: TokenUsage;
}
