import { NextResponse } from 'next/server';
import neo4j from 'neo4j-driver';

const driver = neo4j.driver(
  process.env.NEO4J_URI!,
  neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!)
);

export async function GET() {
  let session;
  try {
    session = driver.session();
    
    // Fetch a sample of all paths to populate the initial graph view.
    // LIMIT 1000 provides a dense but readable initial network.
    const cypherQuery = `
      MATCH p=()-->() 
      RETURN p 
      LIMIT 1000
    `;
    
    const neo4jResult = await session.run(cypherQuery);
    
    const nodes: any[] = [];
    const links: any[] = [];
    const nodeIds = new Set();
    const linkIds = new Set();

    neo4jResult.records.forEach(record => {
      record.forEach((value) => {
        // Handle Paths
        if (value && typeof value === 'object' && 'segments' in value) {
          value.segments.forEach((segment: any) => {
            // Add Start Node
            const startNodeId = segment.start.properties.id || segment.start.identity.toString();
            if (!nodeIds.has(startNodeId)) {
              nodes.push({
                id: startNodeId,
                label: segment.start.labels[0],
                ...segment.start.properties
              });
              nodeIds.add(startNodeId);
            }

            // Add End Node
            const endNodeId = segment.end.properties.id || segment.end.identity.toString();
            if (!nodeIds.has(endNodeId)) {
              nodes.push({
                id: endNodeId,
                label: segment.end.labels[0],
                ...segment.end.properties
              });
              nodeIds.add(endNodeId);
            }

            // Add Link
            const linkId = `${startNodeId}-${segment.relationship.type}-${endNodeId}`;
            if (!linkIds.has(linkId)) {
              links.push({
                source: startNodeId,
                target: endNodeId,
                label: segment.relationship.type
              });
              linkIds.add(linkId);
            }
          });
        }
      });
    });

    return NextResponse.json({ graphData: { nodes, links } });

  } catch (error: any) {
    console.error("Initial graph fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch initial graph", details: error.message }, { status: 500 });
  } finally {
    if (session) await session.close();
  }
}
