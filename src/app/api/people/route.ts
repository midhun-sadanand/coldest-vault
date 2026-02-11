import { NextResponse } from 'next/server';
import { getTypesenseClient, getCollectionName } from '@/lib/typesense';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const personName = searchParams.get('name');
    
    const client = getTypesenseClient();
    
    if (personName) {
      // Get documents for a specific person
      const response = await client
        .collections(getCollectionName())
        .documents()
        .search({
          q: '*',
          query_by: 'file_name',
          filter_by: `people:=${personName}`,
          per_page: 100,
          include_fields: 'id,file_path,file_name,drive_file_id,web_view_link,folder_path,people,dates,summary'
        });
      
      const documents = (response.hits || []).map((hit: any) => ({
        id: hit.document.id,
        file_name: hit.document.file_name,
        file_path: hit.document.file_path,
        drive_file_id: hit.document.drive_file_id,
        web_view_link: hit.document.web_view_link,
        folder_path: hit.document.folder_path,
        people: hit.document.people || [],
        dates: hit.document.dates || [],
        summary: hit.document.summary || ''
      }));
      
      return NextResponse.json({
        person: personName,
        documents,
        count: documents.length
      });
    }
    
    // Get all people with their document counts using facets
    const response = await client
      .collections(getCollectionName())
      .documents()
      .search({
        q: '*',
        query_by: 'file_name',
        facet_by: 'people',
        max_facet_values: 1000,
        per_page: 0
      });
    
    const peopleCounts: Array<{ name: string; documentCount: number }> = [];
    
    for (const facet of response.facet_counts || []) {
      if (facet.field_name === 'people') {
        for (const value of facet.counts || []) {
          peopleCounts.push({
            name: value.value,
            documentCount: value.count
          });
        }
      }
    }
    
    // Sort by document count (descending), then by name
    peopleCounts.sort((a, b) => {
      if (b.documentCount !== a.documentCount) {
        return b.documentCount - a.documentCount;
      }
      return a.name.localeCompare(b.name);
    });
    
    return NextResponse.json({
      people: peopleCounts,
      totalPeople: peopleCounts.length
    });
    
  } catch (error) {
    console.error('People API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch people data' },
      { status: 500 }
    );
  }
}
