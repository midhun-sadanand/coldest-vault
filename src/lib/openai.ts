import OpenAI from 'openai';
import type { SearchResult, SpicyResult, ContextHistoryItem, ResearchMessage, ResearchSource } from '@/types';

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
