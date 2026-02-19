import OpenAI from 'openai';
import type { SearchResult, SpicyResult, ContextHistoryItem, ResearchMessage, ResearchSource, CitationRequest, CitationResponse, CitationMetadata } from '@/types';

let openaiClient: OpenAI | null = null;

export function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }
  return openaiClient;
}

// Simple in-memory cache for embeddings
const embeddingCache = new Map<string, number[]>();

export async function getEmbedding(text: string): Promise<number[]> {
  // Check cache first
  const cacheKey = text.slice(0, 100); // Use first 100 chars as key
  if (embeddingCache.has(cacheKey)) {
    return embeddingCache.get(cacheKey)!;
  }

  const client = getOpenAIClient();
  
  const response = await client.embeddings.create({
    model: 'text-embedding-3-small',
    input: text.slice(0, 8000) // Limit input size
  });

  const embedding = response.data[0].embedding;
  
  // Cache the result
  embeddingCache.set(cacheKey, embedding);
  
  return embedding;
}

const CONTEXT_SYSTEM_PROMPT = `You are a helpful research assistant analyzing historical documents from an archive. 
You have access to a specific document's metadata and content. 
Answer questions about this document accurately and concisely.
If you don't know something or it's not in the document, say so.
Keep responses focused and informative.`;

export async function generateContext(
  query: string,
  metadata: {
    file_path: string;
    summary: string;
    people: string[];
    locations: string[];
    dates: string[];
    ocr_content: string;
  },
  conversationHistory: ContextHistoryItem[] = []
): Promise<{ response: string; usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } }> {
  const client = getOpenAIClient();

  // Build context from metadata
  const documentContext = `
Document: ${metadata.file_path}
Summary: ${metadata.summary}
People mentioned: ${metadata.people.join(', ') || 'None identified'}
Locations: ${metadata.locations.join(', ') || 'None identified'}
Dates: ${metadata.dates.join(', ') || 'None identified'}

Document content (excerpt):
${metadata.ocr_content.slice(0, 4000)}
`;

  const messages: any[] = [
    { role: 'system', content: CONTEXT_SYSTEM_PROMPT },
    { role: 'system', content: `Here is the document you're analyzing:\n${documentContext}` }
  ];

  // Add conversation history
  for (const msg of conversationHistory) {
    messages.push({ role: msg.role, content: msg.content });
  }

  // Add current query
  messages.push({ role: 'user', content: query });

  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages,
    temperature: 0.3,
    max_tokens: 500
  });

  return {
    response: response.choices[0].message.content || '',
    usage: {
      prompt_tokens: response.usage?.prompt_tokens || 0,
      completion_tokens: response.usage?.completion_tokens || 0,
      total_tokens: response.usage?.total_tokens || 0
    }
  };
}

const SPICY_RANKING_PROMPT = `You are ranking search results by "interestingness" or "spiciness" for a researcher.
Rate each result from 1-10 based on how interesting, surprising, or historically significant it might be.
Consider: unusual connections, controversial topics, previously unknown information, key historical figures, etc.

Return ONLY a JSON array of objects with "index" and "score" fields, nothing else.
Example: [{"index": 0, "score": 8}, {"index": 1, "score": 5}]`;

export async function getSpicyRankings(
  query: string,
  results: SearchResult[]
): Promise<SpicyResult[]> {
  if (results.length === 0) return [];

  const client = getOpenAIClient();

  // Build results summary for GPT
  const resultsSummary = results.map((r, i) => 
    `[${i}] ${r.document.file_name}: ${r.document.summary.slice(0, 200)}...`
  ).join('\n');

  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SPICY_RANKING_PROMPT },
        { role: 'user', content: `Query: "${query}"\n\nResults:\n${resultsSummary}` }
      ],
      temperature: 0.5,
      max_tokens: 500
    });

    const content = response.choices[0].message.content || '[]';
    
    // Parse rankings
    let rankings: { index: number; score: number }[];
    try {
      rankings = JSON.parse(content);
    } catch {
      // If parsing fails, return original order
      return results.map((r, i) => ({ ...r, spicy_rank: i + 1 }));
    }

    // Sort by score descending
    rankings.sort((a, b) => b.score - a.score);

    // Map back to results
    return rankings.map((ranking, newIndex) => ({
      ...results[ranking.index],
      spicy_rank: newIndex + 1,
      score: ranking.score / 10 // Normalize to 0-1
    }));

  } catch (error) {
    console.error('Error getting spicy rankings:', error);
    return results.map((r, i) => ({ ...r, spicy_rank: i + 1 }));
  }
}

// ============================================================================
// Citation generation
// ============================================================================

// System prompt used only for secondary sources (academic papers, books, etc.)
// Primary sources are handled deterministically without GPT.
const SECONDARY_CITATION_PROMPT = `You are a citation specialist for academic and published documents. Produce accurate MLA 9th, APA 7th, and Chicago 17th (notes-bibliography) citations.

AUTHORSHIP DETECTION — follow in strict order:
1. JSTOR PDFs: look for "Author(s):" line in the document text — use exactly those names.
2. Filename encodes author: if the filename starts with a person's name (e.g. "Roger Dingman, Title.pdf" or "H.W. Brands Title.pdf"), use it.
3. No clear author: set authors to [] — do NOT guess.

⚠️ CRITICAL: Do NOT use people mentioned in the document content as authors. Only use names confirmed by rules 1 or 2.

The publication_date is AUTHORITATIVE — use it exactly, never alter it.

Return ONLY valid JSON, no other text:
{
  "document_type": "journal_article" | "book_chapter" | "newspaper_article" | "dissertation" | "other",
  "metadata": {
    "authors": ["Last, First"],
    "title": "...",
    "container": "Journal or Book name or null",
    "volume": "..." or null,
    "issue": "..." or null,
    "year": "...",
    "pages": "507-522" or null,
    "publisher": "..." or null
  },
  "mla": "Full MLA 9th citation.",
  "apa": "Full APA 7th citation.",
  "chicago": "Full Chicago 17th bibliography entry."
}`;

// Pre-format the full archival location from the folder_path hierarchy.
// folder_path uses " > " to separate series from box, e.g. "DDE Diary Series > Box 4"
//
// The correct archival citation order is:
//   Series[, Box] → Parent Collection → Repository, Location
//
// We derive the parent collection from the series name using known Eisenhower Library structure.
function buildArchivalLocation(folderPath: string | undefined): string {
  const REPO = 'Dwight D. Eisenhower Presidential Library, Abilene, KS';
  if (!folderPath) return REPO;

  const parts = folderPath.split(' > ').map(p => p.trim()).filter(Boolean);
  const series = parts[0];

  // Map series prefixes to their parent record group / collection
  let collection: string | null = null;

  if (/^DDE\s+Diary/i.test(series) || /^Eisenhower\s+(Personal\s+)?Diar/i.test(series)) {
    collection = 'Papers of Dwight D. Eisenhower as President (Ann Whitman File)';
  } else if (/^JFD\s+/i.test(series)) {
    collection = 'John Foster Dulles Papers';
  } else if (
    /^NSC\s+/i.test(series) ||
    /^Executive\s+Secretary/i.test(series) ||
    /^White\s+House\s+Office/i.test(series) ||
    /^Special\s+Assistant/i.test(series)
  ) {
    collection = 'White House Office, NSC Staff Papers';
  }
  // Named personal papers collections (e.g. "J. Lawton Collins Papers") need no parent

  const components = [...parts];
  if (collection) components.push(collection);
  components.push(REPO);

  return components.join(', ');
}

// ── Deterministic helpers for primary source citations ──────────────────────

const MONTH_ABBR: Record<string, string> = {
  January: 'Jan.', February: 'Feb.', March: 'Mar.', April: 'Apr.',
  May: 'May', June: 'June', July: 'July', August: 'Aug.',
  September: 'Sept.', October: 'Oct.', November: 'Nov.', December: 'Dec.'
};

const SMALL_WORDS = new Set([
  'a', 'an', 'the', 'and', 'but', 'or', 'for', 'nor', 'on', 'at',
  'to', 'by', 'of', 'in', 'is', 'with', 'from', 'into', 'than', 'as', 'via'
]);

function toTitleCase(str: string): string {
  return str
    .split(/(\s+)/)
    .map((word, i) => {
      if (/^\s+$/.test(word)) return word;
      // Preserve words that are already all-caps (acronyms: NSC, AEC, CIA, USSR, UN, US, ROK, etc.)
      if (word === word.toUpperCase() && /^[A-Z]{2,}$/.test(word)) return word;
      const lower = word.toLowerCase();
      if (i !== 0 && SMALL_WORDS.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join('');
}

// Parse the structured filename convention: [YYYYMMDD]-[Context]-[FORMAL TITLE]
// Returns the formal title (last ALL-CAPS segment) and optional context label.
//
// Examples:
//   "19530606-Project Solarium (3)-JFD PRINCIPAL POINTS.pdf"
//     → { title: "JFD Principal Points", context: "Project Solarium (3)" }
//   "19510409-MacArthur Insubordination and Korea.pdf"
//     → { title: "MacArthur Insubordination and Korea", context: null }
//   "19530930-Psychological Strategy following Jackson Report-PROGRESS REPORT TO THE NSC.pdf"
//     → { title: "Progress Report to the NSC", context: "Psychological Strategy following Jackson Report" }
function parseFilename(fileName: string): { title: string; context: string | null; documentType: string | null } {
  let name = fileName.replace(/\.(pdf|docx|doc)$/i, '');
  // Strip leading YYYYMMDD-
  name = name.replace(/^\d{8}[-\s]/, '').trim();

  // Split on " - " or plain "-" that acts as a segment separator.
  // We split only on dashes that separate major segments (not mid-word dashes).
  const segments = name.split(/-(?=[A-Z\s(])/).map(s => s.trim()).filter(Boolean);

  // Detect if a segment is primarily uppercase (a formal document title)
  const isUppercaseSegment = (s: string) => {
    const letters = s.replace(/[^a-zA-Z]/g, '');
    if (letters.length === 0) return false;
    const upperCount = (s.match(/[A-Z]/g) || []).length;
    return upperCount / letters.length > 0.6;
  };

  // Detect document type from the formal title
  const detectDocumentType = (s: string): string | null => {
    const u = s.toUpperCase();
    if (/\bMEMORANDUM\b/.test(u)) return '[Memorandum]';
    if (/\bLETTER\b/.test(u)) return '[Letter]';
    if (/\bREPORT\b/.test(u)) return '[Report]';
    if (/\bTELEGRAM\b/.test(u)) return '[Telegram]';
    if (/\bCABLE\b/.test(u)) return '[Cable]';
    if (/\bDIARY\b|\bDIARIES\b/.test(u)) return '[Diary entry]';
    if (/\bMINUTES\b/.test(u)) return '[Meeting minutes]';
    if (/\bSTATEMENT\b/.test(u)) return '[Statement]';
    if (/\bSPEECH\b/.test(u)) return '[Speech]';
    return null;
  };

  if (segments.length === 1) {
    const title = toTitleCase(segments[0]);
    return { title, context: null, documentType: detectDocumentType(segments[0]) };
  }

  // Find the last uppercase segment — that's the formal document title
  let titleIdx = -1;
  for (let i = segments.length - 1; i >= 0; i--) {
    if (isUppercaseSegment(segments[i])) { titleIdx = i; break; }
  }

  if (titleIdx === -1) {
    // No uppercase segment — use the last segment as title, rest as context
    const title = toTitleCase(segments[segments.length - 1]);
    const context = segments.slice(0, -1).join(' — ') || null;
    return { title, context, documentType: detectDocumentType(title) };
  }

  const formalTitle = toTitleCase(segments[titleIdx]);
  const contextParts = [...segments.slice(0, titleIdx), ...segments.slice(titleIdx + 1)];
  const context = contextParts.length > 0 ? contextParts.join(' — ') : null;
  return { title: formalTitle, context, documentType: detectDocumentType(formalTitle) };
}

function titleFromFilename(fileName: string): string {
  return parseFilename(fileName).title;
}

function extractYear(date: string): string {
  const m = date.match(/\b(\d{4})\b/);
  return m ? m[1] : date;
}

// "December 11, 1953" → "11 Dec. 1953"  |  "December 1953" → "Dec. 1953"
function toMlaDate(date: string): string {
  const full = date.match(/^(\w+)\s+(\d+),\s+(\d{4})$/);
  if (full) return `${full[2]} ${MONTH_ABBR[full[1]] ?? full[1]} ${full[3]}`;
  const partial = date.match(/^(\w+)\s+(\d{4})$/);
  if (partial) return `${MONTH_ABBR[partial[1]] ?? partial[1]} ${partial[2]}`;
  return date;
}

// "December 11, 1953" → "1953, December 11"  |  "December 1953" → "1953, December"
function toApaDate(date: string): string {
  const full = date.match(/^(\w+)\s+(\d+),\s+(\d{4})$/);
  if (full) return `${full[3]}, ${full[1]} ${full[2]}`;
  const partial = date.match(/^(\w+)\s+(\d{4})$/);
  if (partial) return `${partial[2]}, ${partial[1]}`;
  return date;
}

// Build all three citation formats deterministically for a primary source
function buildPrimaryCitations(
  title: string,
  date: string,
  archivalLocation: string
): { chicago: string; mla: string; apa: string } {
  const chicago = `"${title}." ${date}. ${archivalLocation}.`;
  const mla     = `"${title}." ${archivalLocation}, ${toMlaDate(date)}.`;
  const apa     = `${title}. (${toApaDate(date)}). ${archivalLocation}.`;
  return { chicago, mla, apa };
}

// ── Primary source draft (deterministic, synchronous) ───────────────────────

export function generatePrimaryCitationDraft(request: CitationRequest): CitationResponse {
  const parsed   = parseFilename(request.file_name);
  const title    = parsed.title;
  const date     = request.publication_date || extractYear(request.file_name);
  const location = buildArchivalLocation(request.folder_path);
  const { chicago, mla, apa } = buildPrimaryCitations(title, date, location);
  const year = extractYear(date);

  return {
    document_type: parsed.documentType ?? 'archival_document',
    metadata: {
      authors: [],
      title,
      container: null,
      volume: null,
      issue: null,
      year,
      pages: null,
      publisher: null,
      repository: 'Dwight D. Eisenhower Presidential Library, Abilene, KS',
      collection: request.folder_path ?? null
    },
    chicago,
    mla,
    apa
  };
}

// ── GPT refinement pass for primary sources ──────────────────────────────────

const REFINE_CITATION_PROMPT = `You are an archival citation specialist refining an auto-generated citation.
The citation was built from structured filename metadata and may contain errors.

FILENAME CONVENTION:
Files follow the pattern: [YYYYMMDD]-[Context label, if any]-[FORMAL DOCUMENT TITLE IN CAPS]
- The CONTEXT LABEL (mixed case, middle segment) is an archivist's descriptive tag — NOT the document title.
- The FORMAL DOCUMENT TITLE (last segment, mostly uppercase) is the actual document name.
- If the title is a document-type phrase (e.g. "MEMORANDUM FOR THE RECORD"), use it as the title.
- If the filename has only one segment after the date, that whole segment is the title.

You are given:
- PARSED TITLE: the formal title already extracted from the filename
- CONTEXT LABEL: the archivist's descriptive tag (may be null)
- FILE NAME: the raw filename for reference

COMMON ERRORS TO FIX:
1. FILENAME IS THE ARCHIVAL REFERENCE, NOT THE TITLE: If the filename looks like
   "Collection Name, Box N (F).pdf" (e.g. "C.D. Jackson Papers, Box 50 (1).pdf"),
   the filename encodes collection + box + folder — it is NOT the document title.
   In this case, infer the title from the document content preview or use [Untitled Document].

2. CAPITALIZATION: Fix initials like "C.d." → "C.D.", preserve acronyms (NSC, AEC, CIA, USSR, UK, US, ROK, POW, NATO).

3. MISSING PARENT COLLECTION: Use your knowledge of Eisenhower Library record groups to
   add the correct parent collection if missing (e.g. "DDE Diary Series" belongs to
   "Papers of Dwight D. Eisenhower as President (Ann Whitman File)").

4. REDUNDANCY: If the collection name appears both as the title and in the archival location,
   remove it from the title and use [Untitled Document] or the context label as the title.

5. TITLE FROM CONTENT: If PARSED TITLE is clearly wrong or just an archival reference,
   look at the DOCUMENT CONTENT PREVIEW to find the actual title (often the first heading
   or all-caps line at the top). Use that instead.

NEVER use the context label alone as the full document title.
NEVER alter the publication date.
NEVER omit the repository (Dwight D. Eisenhower Presidential Library, Abilene, KS).
NEVER omit the collection name from the archival location.

CITATION FORMATS:
- Chicago: "Title." Date. Collection[, Box N, Folder F]. Repository, Location.
- MLA: "Title." Collection[, Box N, Folder F], Repository, Date.
- APA: Title. (Date). Collection[, Box N, Folder F]. Repository, Location.

Return ONLY valid JSON: { "chicago": "...", "mla": "...", "apa": "..." }`;

export async function refinePrimaryCitation(
  draft: CitationResponse,
  request: CitationRequest
): Promise<CitationResponse> {
  const client = getOpenAIClient();
  const archivalLocation = buildArchivalLocation(request.folder_path);
  const docPreview = request.ocr_content.slice(0, 500);

  const parsed = parseFilename(request.file_name);

  const userContent = `DRAFT CITATION (Chicago): ${draft.chicago}

PARSED TITLE: ${parsed.title}
CONTEXT LABEL: ${parsed.context ?? 'none'}
FILE NAME: ${request.file_name}
FOLDER PATH: ${request.folder_path || 'none'}
ARCHIVAL LOCATION (pre-built): ${archivalLocation}
PUBLICATION DATE: ${request.publication_date || 'unknown'}

DOCUMENT CONTENT PREVIEW (first 500 chars — may contain actual title):
${docPreview}`;

  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: REFINE_CITATION_PROMPT },
        { role: 'user', content: userContent }
      ],
      temperature: 0.1,
      max_tokens: 800,
      response_format: { type: 'json_object' }
    });

    const raw = response.choices[0].message.content || '{}';
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = JSON.parse(raw.replace(/[\x00-\x1F\x7F]/g, ' '));
    }

    return {
      ...draft,
      chicago: parsed.chicago || draft.chicago,
      mla:     parsed.mla     || draft.mla,
      apa:     parsed.apa     || draft.apa
    };
  } catch {
    // Fall back to the deterministic draft on any GPT failure
    return draft;
  }
}

// ── Main export ──────────────────────────────────────────────────────────────

export async function generateCitation(request: CitationRequest): Promise<CitationResponse> {

  // ── PRIMARY SOURCES: deterministic draft + GPT refinement ──
  if (request.source_type === 'primary') {
    const draft = generatePrimaryCitationDraft(request);
    return refinePrimaryCitation(draft, request);
  }

  // ── SECONDARY SOURCES: GPT extracts author/journal metadata ──
  const client  = getOpenAIClient();
  const docStart = request.ocr_content.slice(0, 2500);

  const userContent = `FILE NAME: ${request.file_name}
PUBLICATION DATE (authoritative): ${request.publication_date || 'unknown'}
DOCUMENT START (first 2500 chars):
${docStart}`;

  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: SECONDARY_CITATION_PROMPT },
      { role: 'user', content: userContent }
    ],
    temperature: 0.1,
    max_tokens: 1200,
    response_format: { type: 'json_object' }
  });

  const raw = response.choices[0].message.content || '{}';

  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const cleaned = raw.replace(/[\x00-\x1F\x7F]/g, ' ');
    parsed = JSON.parse(cleaned);
  }

  return {
    document_type: parsed.document_type || 'other',
    metadata: parsed.metadata as CitationMetadata,
    mla: parsed.mla || '',
    apa: parsed.apa || '',
    chicago: parsed.chicago || ''
  };
}

// Parse --- Page N --- markers from ocr_content into page blocks
function parseOcrPages(ocrContent: string): Array<{ pageNum: number; text: string }> {
  const parts = ocrContent.split(/(--- Page \d+ ---)/);
  const pages: Array<{ pageNum: number; text: string }> = [];

  for (let i = 0; i < parts.length; i++) {
    const headerMatch = parts[i].match(/--- Page (\d+) ---/);
    if (headerMatch) {
      const pageNum = parseInt(headerMatch[1]);
      const text = parts[i + 1] || '';
      pages.push({ pageNum, text });
    }
  }
  return pages;
}

const PAGE_NUMBER_PROMPT = `You are reading a page from a scanned document. Running headers and footers often contain the actual published page number.

Look at the first 3 lines and last 3 lines of this page text for a standalone number that is the printed page number.
Ignore: dates, footnote numbers, section numbers, years like "1953", "1982", phone numbers, or page numbers embedded in sentences.
A page number is typically a short standalone integer (e.g. "512", "47") appearing at the top or bottom of the page.

Return ONLY a JSON object: {"printed_page": "512"} or {"printed_page": null} if none found.`;

export async function findQuotePage(
  ocrContent: string,
  quote: string
): Promise<{ page_number: string | null; page_context: string }> {
  const pages = parseOcrPages(ocrContent);

  if (pages.length === 0) {
    return { page_number: null, page_context: 'No page markers found in this document.' };
  }

  // Normalize quote for matching
  const normalizedQuote = quote.toLowerCase().replace(/\s+/g, ' ').trim();
  const shortQuote = normalizedQuote.slice(0, 50);

  // Find page containing the quote
  let matchedPage: { pageNum: number; text: string } | null = null;
  let matchContext = '';

  for (const page of pages) {
    const normalizedText = page.text.toLowerCase().replace(/\s+/g, ' ');
    if (normalizedText.includes(normalizedQuote) || (shortQuote.length >= 20 && normalizedText.includes(shortQuote))) {
      matchedPage = page;
      // Extract surrounding context (~200 chars around the match)
      const idx = normalizedText.indexOf(shortQuote);
      if (idx !== -1) {
        const start = Math.max(0, idx - 80);
        const end = Math.min(page.text.length, idx + shortQuote.length + 80);
        matchContext = '...' + page.text.slice(start, end).trim() + '...';
      }
      break;
    }
  }

  if (!matchedPage) {
    return {
      page_number: null,
      page_context: 'Quote not found in document. Try a shorter or slightly different excerpt.'
    };
  }

  // Ask GPT to identify the printed page number from the page's header/footer lines
  const pageLines = matchedPage.text.split('\n').filter(l => l.trim());
  const headerLines = pageLines.slice(0, 3).join('\n');
  const footerLines = pageLines.slice(-3).join('\n');
  const edgeText = `FIRST 3 LINES:\n${headerLines}\n\nLAST 3 LINES:\n${footerLines}`;

  const client = getOpenAIClient();
  const pageResponse = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: PAGE_NUMBER_PROMPT },
      { role: 'user', content: edgeText }
    ],
    temperature: 0,
    max_tokens: 50,
    response_format: { type: 'json_object' }
  });

  const pageRaw = pageResponse.choices[0].message.content || '{}';
  const pageParsed = JSON.parse(pageRaw);
  const printedPage: string | null = pageParsed.printed_page || null;

  return {
    page_number: printedPage ? `p. ${printedPage}` : `OCR page ${matchedPage.pageNum} (printed page number not detected)`,
    page_context: matchContext || matchedPage.text.slice(0, 200).trim() + '...'
  };
}

// Research mode - corpus-wide Q&A with citations
const RESEARCH_SYSTEM_PROMPT = `You are a research assistant helping users explore a historical document archive containing declassified documents from the Eisenhower administration, primarily relating to the Korean War and early Cold War national security policy.

You have access to multiple relevant documents from this archive. Answer questions thoroughly based on these documents.

CRITICAL INSTRUCTIONS FOR CITATIONS:
- You MUST cite your sources using numbered references like [1], [2], [3] etc.
- Place citations immediately after the relevant information
- Each number corresponds to a document in the source list provided
- If information comes from multiple sources, cite all relevant ones like [1][3]
- If you cannot find information in the provided documents, say so clearly
- Be specific and quote relevant passages when helpful

Example response format:
"Project Solarium was initiated by President Eisenhower in 1953 [1]. The project examined three alternative strategies for containing Soviet expansion [2]. Option B, advocated primarily by Air Force leadership, proposed a more aggressive approach relying on nuclear deterrence [1][3]."`;

export async function generateResearchResponse(
  query: string,
  documents: Array<{
    file_name: string;
    file_path: string;
    web_view_link: string;
    folder_path?: string;
    summary: string;
    ocr_content: string;
  }>,
  conversationHistory: ResearchMessage[] = []
): Promise<{ 
  response: string; 
  sources: ResearchSource[];
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } 
}> {
  const client = getOpenAIClient();

  // Build source list and context
  const sources: ResearchSource[] = documents.map((doc, idx) => ({
    index: idx + 1,
    file_name: doc.file_name,
    file_path: doc.file_path,
    web_view_link: doc.web_view_link,
    folder_path: doc.folder_path,
    summary: doc.summary
  }));

  // Build document context for the model
  const documentContext = documents.map((doc, idx) => {
    const excerpt = doc.ocr_content.slice(0, 2000); // Limit each doc's content
    return `[${idx + 1}] ${doc.file_name}
Summary: ${doc.summary}
Content excerpt:
${excerpt}
---`;
  }).join('\n\n');

  const messages: any[] = [
    { role: 'system', content: RESEARCH_SYSTEM_PROMPT },
    { role: 'system', content: `Here are the relevant documents from the archive:\n\n${documentContext}\n\nRemember to cite sources using [1], [2], etc.` }
  ];

  // Add conversation history (excluding sources from messages)
  for (const msg of conversationHistory) {
    messages.push({ role: msg.role, content: msg.content });
  }

  // Add current query
  messages.push({ role: 'user', content: query });

  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages,
    temperature: 0.3,
    max_tokens: 1500
  });

  return {
    response: response.choices[0].message.content || '',
    sources,
    usage: {
      prompt_tokens: response.usage?.prompt_tokens || 0,
      completion_tokens: response.usage?.completion_tokens || 0,
      total_tokens: response.usage?.total_tokens || 0
    }
  };
}
