import { NextResponse } from 'next/server';
import { getTypesenseClient, getCollectionName } from '@/lib/typesense';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

// Validate date components
function isValidDate(year: number, month: number, day: number): boolean {
  return year >= 1900 && year <= 2100 && month >= 1 && month <= 12 && day >= 1 && day <= 31;
}

// Try to extract a full date (with month and day) from a string
function tryExtractFullDate(trimmed: string): { year: string; month: string; day: string; sortKey: string } | null {
  // Try "Month Day, Year" or "Month Day Year" format (e.g., "December 1, 1950")
  const monthDayYear = trimmed.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
  if (monthDayYear) {
    const monthName = monthDayYear[1].toLowerCase();
    const monthIndex = MONTHS.findIndex(m => m.toLowerCase().startsWith(monthName.slice(0, 3)));
    if (monthIndex !== -1) {
      const year = parseInt(monthDayYear[3]);
      const month = monthIndex + 1;
      const day = parseInt(monthDayYear[2]);
      if (isValidDate(year, month, day)) {
        return {
          year: monthDayYear[3],
          month: String(month).padStart(2, '0'),
          day: String(day).padStart(2, '0'),
          sortKey: `${monthDayYear[3]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
        };
      }
    }
  }
  
  // Try "Day Month Year" format (e.g., "1 December 1950")
  const dayMonthYear = trimmed.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (dayMonthYear) {
    const monthName = dayMonthYear[2].toLowerCase();
    const monthIndex = MONTHS.findIndex(m => m.toLowerCase().startsWith(monthName.slice(0, 3)));
    if (monthIndex !== -1) {
      const year = parseInt(dayMonthYear[3]);
      const month = monthIndex + 1;
      const day = parseInt(dayMonthYear[1]);
      if (isValidDate(year, month, day)) {
        return {
          year: dayMonthYear[3],
          month: String(month).padStart(2, '0'),
          day: String(day).padStart(2, '0'),
          sortKey: `${dayMonthYear[3]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
        };
      }
    }
  }
  
  // Try YYYY-MM-DD format
  const isoMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    const year = parseInt(isoMatch[1]);
    const month = parseInt(isoMatch[2]);
    const day = parseInt(isoMatch[3]);
    if (isValidDate(year, month, day)) {
      return { 
        year: isoMatch[1], 
        month: String(month).padStart(2, '0'), 
        day: String(day).padStart(2, '0'), 
        sortKey: `${isoMatch[1]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` 
      };
    }
  }
  
  // Try MM/DD/YYYY format
  const mdyMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (mdyMatch) {
    const year = parseInt(mdyMatch[3]);
    const month = parseInt(mdyMatch[1]);
    const day = parseInt(mdyMatch[2]);
    if (isValidDate(year, month, day)) {
      return { 
        year: mdyMatch[3], 
        month: String(month).padStart(2, '0'), 
        day: String(day).padStart(2, '0'), 
        sortKey: `${mdyMatch[3]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` 
      };
    }
  }
  
  // Try YYYYMMDD format
  const yyyymmdd = trimmed.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (yyyymmdd) {
    const year = parseInt(yyyymmdd[1]);
    const month = parseInt(yyyymmdd[2]);
    const day = parseInt(yyyymmdd[3]);
    if (isValidDate(year, month, day)) {
      return {
        year: yyyymmdd[1],
        month: yyyymmdd[2],
        day: yyyymmdd[3],
        sortKey: `${yyyymmdd[1]}-${yyyymmdd[2]}-${yyyymmdd[3]}`
      };
    }
  }
  
  return null;
}

// Extract a sortable date key from filename or dates array
function extractDateKey(filename: string, dates: string[]): { year: string; month: string; day: string; sortKey: string } | null {
  // First try filename (YYYYMMDD format at start)
  const filenameMatch = filename.match(/^(\d{4})(\d{2})(\d{2})/);
  if (filenameMatch) {
    const year = parseInt(filenameMatch[1]);
    const month = parseInt(filenameMatch[2]);
    const day = parseInt(filenameMatch[3]);
    
    // Validate the date is reasonable for this archive (Korean War / Cold War era)
    if (isValidDate(year, month, day) && year >= 1945 && year <= 1975) {
      return { 
        year: filenameMatch[1], 
        month: filenameMatch[2], 
        day: filenameMatch[3], 
        sortKey: `${filenameMatch[1]}-${filenameMatch[2]}-${filenameMatch[3]}` 
      };
    }
  }
  
  // FIRST PASS: Try to find a FULL date (with month and day) from the dates array
  // This prevents year-only values like "1913" from being picked up when a full date exists
  for (const date of dates) {
    const result = tryExtractFullDate(date.trim());
    if (result) {
      return result;
    }
  }
  
  // SECOND PASS: If no full date found, try year-only but restrict to reasonable years (1945-1975)
  for (const date of dates) {
    const trimmed = date.trim();
    const yearMatch = trimmed.match(/^(\d{4})$/);
    if (yearMatch) {
      const year = parseInt(yearMatch[1]);
      // Only accept years in the Korean War / Cold War era range
      if (year >= 1945 && year <= 1975) {
        return { year: yearMatch[1], month: '00', day: '00', sortKey: `${yearMatch[1]}-00-00` };
      }
    }
  }
  
  return null;
}

// Get month name from number
function getMonthName(month: string): string {
  const idx = parseInt(month, 10) - 1;
  return idx >= 0 && idx < 12 ? MONTHS[idx] : 'Unknown Month';
}

export async function GET() {
  try {
    const client = getTypesenseClient();
    
    // Get all documents
    const documents: any[] = [];
    let page = 1;
    const perPage = 250;
    
    while (true) {
      const response = await client
        .collections(getCollectionName())
        .documents()
        .search({
          q: '*',
          query_by: 'file_name',
          per_page: perPage,
          page: page,
          include_fields: 'id,file_path,file_name,drive_file_id,web_view_link,folder_path,source_type,publication_date,people,dates,summary,ocr_content,locations'
        });
      
      const hits = response.hits || [];
      if (hits.length === 0) break;
      
      for (const hit of hits) {
        const doc = hit.document as any;
        documents.push({
          id: doc.id,
          file_name: doc.file_name,
          file_path: doc.file_path,
          drive_file_id: doc.drive_file_id,
          web_view_link: doc.web_view_link,
          folder_path: doc.folder_path,
          source_type: doc.source_type,
          publication_date: doc.publication_date,
          people: doc.people || [],
          locations: doc.locations || [],
          dates: doc.dates || [],
          summary: doc.summary || '',
          ocr_content: doc.ocr_content || ''
        });
      }
      
      if (hits.length < perPage) break;
      page++;
    }
    
    // Group by year > month
    const yearGroups: Record<string, Record<string, any[]>> = {};
    const undated: any[] = [];
    
    for (const doc of documents) {
      const dateKey = extractDateKey(doc.file_name, doc.dates);
      
      if (dateKey) {
        const { year, month, sortKey } = dateKey;
        
        if (!yearGroups[year]) {
          yearGroups[year] = {};
        }
        
        const monthKey = month === '00' ? 'Unknown Month' : getMonthName(month);
        if (!yearGroups[year][monthKey]) {
          yearGroups[year][monthKey] = [];
        }
        
        yearGroups[year][monthKey].push({ ...doc, sortKey });
      } else {
        undated.push(doc);
      }
    }
    
    // Sort documents within each month by sortKey
    for (const year of Object.keys(yearGroups)) {
      for (const month of Object.keys(yearGroups[year])) {
        yearGroups[year][month].sort((a, b) => a.sortKey.localeCompare(b.sortKey));
      }
    }
    
    // Build response structure
    const years = Object.entries(yearGroups)
      .map(([year, months]) => ({
        year,
        months: Object.entries(months)
          .map(([month, docs]) => ({
            month,
            documents: docs,
            count: docs.length
          }))
          .sort((a, b) => {
            // Sort months chronologically
            const monthOrder = ['January', 'February', 'March', 'April', 'May', 'June',
              'July', 'August', 'September', 'October', 'November', 'December', 'Unknown Month'];
            return monthOrder.indexOf(a.month) - monthOrder.indexOf(b.month);
          }),
        totalCount: Object.values(months).reduce((sum, docs) => sum + docs.length, 0)
      }))
      .sort((a, b) => b.year.localeCompare(a.year)); // Most recent first
    
    return NextResponse.json({
      years,
      undated: undated.length > 0 ? {
        documents: undated.sort((a, b) => a.file_name.localeCompare(b.file_name)),
        count: undated.length
      } : null,
      totalYears: years.length,
      totalDocuments: documents.length,
      datedDocuments: documents.length - undated.length,
      undatedDocuments: undated.length
    });
    
  } catch (error) {
    console.error('Chronology API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch chronology data' },
      { status: 500 }
    );
  }
}
