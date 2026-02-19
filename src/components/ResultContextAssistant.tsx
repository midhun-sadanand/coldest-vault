'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Loader2, Quote } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ContextHistoryItem, TokenUsage } from '@/types';
import CitationPanel from './CitationPanel';

interface ResultContextAssistantProps {
  resultMetadata: {
    file_path: string;
    summary: string;
    people: string[];
    locations: string[];
    dates: string[];
    ocr_content: string;
    // Optional citation metadata — passed when available from search results
    file_name?: string;
    publication_date?: string;
    source_type?: 'primary' | 'secondary';
    folder_path?: string;
  };
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

// Simple markdown-like formatting
const formatResponse = (text: string) => {
  // Split into paragraphs
  const paragraphs = text.split(/\n\n+/);
  
  return paragraphs.map((para, i) => {
    // Handle numbered lists
    if (/^\d+\.\s/.test(para)) {
      const items = para.split(/(?=\d+\.\s)/);
      return (
        <ol key={i} className="list-decimal list-inside space-y-1 my-2">
          {items.filter(item => item.trim()).map((item, j) => (
            <li key={j} className="text-sm">
              {formatInlineText(item.replace(/^\d+\.\s*/, ''))}
            </li>
          ))}
        </ol>
      );
    }
    
    // Handle bullet lists
    if (/^[-•]\s/.test(para)) {
      const items = para.split(/(?=[-•]\s)/);
      return (
        <ul key={i} className="list-disc list-inside space-y-1 my-2">
          {items.filter(item => item.trim()).map((item, j) => (
            <li key={j} className="text-sm">
              {formatInlineText(item.replace(/^[-•]\s*/, ''))}
            </li>
          ))}
        </ul>
      );
    }
    
    // Regular paragraph
    return <p key={i} className="my-2">{formatInlineText(para)}</p>;
  });
};

// Format inline text (bold, etc.)
const formatInlineText = (text: string) => {
  // Replace **text** with bold
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="font-semibold text-[var(--text)]">{part.slice(2, -2)}</strong>;
    }
    return part;
  });
};

export default function ResultContextAssistant({ resultMetadata }: ResultContextAssistantProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tokenUsage, setTokenUsage] = useState<TokenUsage | null>(null);
  const [showCitation, setShowCitation] = useState(false);
  
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  // Scroll within the messages container only, not the page
  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    setError(null);

    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);

    try {
      const conversationHistory: ContextHistoryItem[] = messages.map(m => ({
        role: m.role,
        content: m.content
      }));

      const response = await fetch('/api/context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: userMessage,
          result_metadata: resultMetadata,
          conversation_history: conversationHistory
        })
      });

      if (!response.ok) {
        throw new Error('Failed to get response');
      }

      const data = await response.json();
      
      setMessages(prev => [...prev, { role: 'assistant', content: data.response }]);
      
      if (data.token_usage) {
        setTokenUsage(data.token_usage);
      }

    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const suggestedQuestions = [
    "What is the main topic of this document?",
    "Who are the key people mentioned?",
    "What are the significant dates?",
    "Summarize the key points"
  ];

  // Derive file_name from file_path if not explicitly provided
  const fileName = resultMetadata.file_name ||
    resultMetadata.file_path.split('/').pop() || resultMetadata.file_path;

  return (
    <div className="border border-[var(--border)]">
      {/* Messages area */}
      <div 
        ref={messagesContainerRef}
        className="max-h-80 space-y-3 overflow-y-auto p-4"
        style={{ overflowAnchor: 'none' }}
      >
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-8">
            <p className="mb-4 text-sm text-[var(--text-muted)]">Ask a question about this document</p>
            <div className="flex flex-wrap justify-center gap-2">
              {suggestedQuestions.map((q, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setInput(q)}
                  className="border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-muted)] transition-colors hover:border-[var(--text)] hover:text-[var(--text)]"
                >
                  {q}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setShowCitation(prev => !prev)}
                className={cn(
                  "flex items-center gap-1.5 border px-3 py-1.5 text-xs transition-colors",
                  showCitation
                    ? "border-[var(--text)] text-[var(--text)]"
                    : "border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--text)] hover:text-[var(--text)]"
                )}
              >
                <Quote size={11} />
                Cite document
              </button>
            </div>
            {showCitation && (
              <div className="mt-4 w-full text-left">
                <CitationPanel
                  document={{
                    file_name: fileName,
                    publication_date: resultMetadata.publication_date,
                    source_type: resultMetadata.source_type,
                    folder_path: resultMetadata.folder_path,
                    people: resultMetadata.people,
                    ocr_content: resultMetadata.ocr_content
                  }}
                />
              </div>
            )}
          </div>
        ) : (
          messages.map((message, index) => (
            <div
              key={index}
              className={cn(
                "max-w-[90%] rounded-sm p-3 text-sm",
                message.role === 'user'
                  ? "ml-auto border border-[var(--border)] bg-[var(--bg-secondary)] text-[var(--text)]"
                  : "border border-[var(--border)] bg-transparent text-[var(--text-muted)]"
              )}
            >
              {message.role === 'assistant' ? formatResponse(message.content) : message.content}
            </div>
          ))
        )}
        
        {isLoading && (
          <div className="flex items-center gap-2 text-[var(--text-subtle)]">
            <Loader2 size={16} className="animate-spin" />
            <span className="text-sm">Thinking...</span>
          </div>
        )}
        
        {error && (
          <div className="rounded-sm border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-600 dark:text-red-400">
            {error}
          </div>
        )}
      </div>

      {/* Token usage */}
      {tokenUsage && (
        <div className="border-t border-[var(--border)] px-4 py-2 text-xs text-[var(--text-subtle)]">
          Tokens: {tokenUsage.total_tokens} (prompt: {tokenUsage.prompt_tokens}, completion: {tokenUsage.completion_tokens})
        </div>
      )}

      {/* Input area */}
      <form onSubmit={handleSubmit} className="border-t border-[var(--border)] p-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about this document..."
            className="flex-1 border-0 border-b border-[var(--input-border)] bg-transparent py-2 text-sm text-[var(--text)] placeholder:text-[var(--text-subtle)] focus:border-[var(--text)] focus:outline-none"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className={cn(
              "flex items-center justify-center border border-[var(--border)] px-4 py-2 text-sm transition-colors",
              isLoading || !input.trim()
                ? "cursor-not-allowed border-[var(--border)] text-[var(--text-subtle)]"
                : "border-[var(--text)] text-[var(--text)] hover:bg-[var(--bg-secondary)]"
            )}
          >
            <Send size={16} />
          </button>
        </div>
      </form>
    </div>
  );
}
