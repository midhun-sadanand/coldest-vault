import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function highlightText(text: string, query: string): string {
  if (!query.trim()) return text;
  
  const words = query.split(/\s+/).filter(w => w.length > 2);
  if (words.length === 0) return text;
  
  const regex = new RegExp(`(${words.join('|')})`, 'gi');
  return text.replace(regex, '<mark class="bg-yellow-200 px-0.5 rounded">$1</mark>');
}

export function truncate(str: string, length: number): string {
  if (str.length <= length) return str;
  return str.slice(0, length) + '...';
}

export function getMatchColor(score: number): string {
  if (score >= 0.9) return 'bg-green-100 text-green-800';
  if (score >= 0.7) return 'bg-yellow-100 text-yellow-800';
  if (score >= 0.5) return 'bg-orange-100 text-orange-800';
  return 'bg-gray-100 text-gray-800';
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

// Extract date from filename if it starts with YYYYMMDD
export function extractDateFromFilename(filename: string): string | null {
  const match = filename.match(/^(\d{4})(\d{2})(\d{2})/);
  if (!match) return null;
  
  const year = parseInt(match[1]);
  const month = parseInt(match[2]);
  const day = parseInt(match[3]);
  
  // Validate
  if (year < 1900 || year > 2100) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  
  return `${MONTHS[month - 1]} ${day}, ${year}`;
}

// Format a date string to "Month Day, Year" format
// Returns null if the date is incomplete or invalid
export function formatDate(dateStr: string): string | null {
  if (!dateStr) return null;
  
  const trimmed = dateStr.trim();
  
  // Try to parse YYYYMMDD format
  const yyyymmdd = trimmed.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (yyyymmdd) {
    const year = parseInt(yyyymmdd[1]);
    const month = parseInt(yyyymmdd[2]);
    const day = parseInt(yyyymmdd[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${MONTHS[month - 1]} ${day}, ${year}`;
    }
  }
  
  // Try to parse various date formats
  // "July 16, 1953", "16 July 1953", "1953-07-16", etc.
  const datePatterns = [
    // "Month Day, Year" or "Month Day Year"
    /^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/,
    // "Day Month Year"
    /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/,
    // "YYYY-MM-DD"
    /^(\d{4})-(\d{1,2})-(\d{1,2})$/,
    // "MM/DD/YYYY"
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
  ];
  
  for (const pattern of datePatterns) {
    const match = trimmed.match(pattern);
    if (match) {
      let year: number, month: number, day: number;
      
      if (pattern === datePatterns[0]) {
        // Month Day, Year
        const monthName = match[1].toLowerCase();
        const monthIndex = MONTHS.findIndex(m => m.toLowerCase().startsWith(monthName.slice(0, 3)));
        if (monthIndex === -1) continue;
        month = monthIndex + 1;
        day = parseInt(match[2]);
        year = parseInt(match[3]);
      } else if (pattern === datePatterns[1]) {
        // Day Month Year
        day = parseInt(match[1]);
        const monthName = match[2].toLowerCase();
        const monthIndex = MONTHS.findIndex(m => m.toLowerCase().startsWith(monthName.slice(0, 3)));
        if (monthIndex === -1) continue;
        month = monthIndex + 1;
        year = parseInt(match[3]);
      } else if (pattern === datePatterns[2]) {
        // YYYY-MM-DD
        year = parseInt(match[1]);
        month = parseInt(match[2]);
        day = parseInt(match[3]);
      } else {
        // MM/DD/YYYY
        month = parseInt(match[1]);
        day = parseInt(match[2]);
        year = parseInt(match[3]);
      }
      
      if (year >= 1900 && year <= 2100 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        return `${MONTHS[month - 1]} ${day}, ${year}`;
      }
    }
  }
  
  // Check if it's just a year or incomplete - return null
  if (/^\d{4}$/.test(trimmed)) return null; // Just a year
  if (/^\d{1,2},?\s*\d{4}$/.test(trimmed)) return null; // Day, Year (missing month)
  if (/^[A-Za-z]+\s+\d{4}$/.test(trimmed)) return null; // Month Year (missing day)
  
  return null;
}

// Get the best date to display for a document
export function getDisplayDate(filename: string, dates: string[]): string | null {
  // First, try to extract from filename (most reliable)
  const filenameDate = extractDateFromFilename(filename);
  if (filenameDate) return filenameDate;
  
  // Otherwise, try to format the first valid date from the dates array
  for (const date of dates) {
    const formatted = formatDate(date);
    if (formatted) return formatted;
  }
  
  return null;
}
