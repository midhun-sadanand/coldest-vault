import { NextResponse } from 'next/server';
import { getTypesenseClient, getCollectionName } from '@/lib/typesense';

export async function GET() {
  try {
    const client = getTypesenseClient();
    
    // Get all documents with folder_path
    const searchParams = {
      q: '*',
      query_by: 'file_name',
      per_page: 250,
      page: 1,
      facet_by: 'folder_path',
      max_facet_values: 500,
      include_fields: 'file_path,file_name,drive_file_id,web_view_link,folder_path,people,dates,summary'
    };
    
    // First, get the facet counts to know all folders
    const facetResponse = await client
      .collections(getCollectionName())
      .documents()
      .search({
        q: '*',
        query_by: 'file_name',
        facet_by: 'folder_path',
        max_facet_values: 500,
        per_page: 0
      });
    
    const folderCounts: Record<string, number> = {};
    for (const facet of facetResponse.facet_counts || []) {
      if (facet.field_name === 'folder_path') {
        for (const value of facet.counts || []) {
          folderCounts[value.value] = value.count;
        }
      }
    }
    
    // Get all documents grouped by folder
    const folders: Record<string, any[]> = {};
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
        const folderPath = doc.folder_path || 'Uncategorized';
        
        if (!folders[folderPath]) {
          folders[folderPath] = [];
        }
        
        folders[folderPath].push({
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
    
    // Convert to sorted array
    const sortedFolders = Object.entries(folders)
      .map(([path, documents]) => ({
        path,
        documents: documents.sort((a, b) => a.file_name.localeCompare(b.file_name)),
        count: documents.length
      }))
      .sort((a, b) => a.path.localeCompare(b.path));
    
    return NextResponse.json({
      folders: sortedFolders,
      totalFolders: sortedFolders.length,
      totalDocuments: Object.values(folders).reduce((sum, docs) => sum + docs.length, 0)
    });
    
  } catch (error) {
    console.error('Directory API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch directory data' },
      { status: 500 }
    );
  }
}
