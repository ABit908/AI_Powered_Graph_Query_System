import { NextRequest, NextResponse } from 'next/server';
import neo4j from 'neo4j-driver';
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const driver = neo4j.driver(
  process.env.NEO4J_URI!,
  neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!)
);

export async function POST(req: NextRequest) {
  let session;
  try {
    const { prompt } = await req.json();

    // --- 1. GUARDRAIL CHECK ---
    const guardrailModel = genAI.getGenerativeModel({ model: "gemini-flash-latest" });
    const guardrailPrompt = `
      Determine if the following user query is related to business data (orders, deliveries, billing, products, customers, payments, journal entries, plants).
      If it is related, return "VALID".
      If it is NOT related (e.g. general knowledge, creative writing, personal questions, harmful content), return "INVALID".
      
      Query: "${prompt}"
    `;
    const guardResult = await guardrailModel.generateContent(guardrailPrompt);
    if (guardResult.response.text().trim().includes("INVALID")) {
      return NextResponse.json({ 
        answer: "This system is designed to answer questions related to the provided business dataset only.",
        graphData: { nodes: [], links: [] } 
      });
    }

    // --- 2. GENERATE CYPHER ---
    const cypherModel = genAI.getGenerativeModel({ model: "gemini-flash-latest" });
    const cypherInstruction = `
      You are a Neo4j Cypher expert. Convert the user's natural language into a valid Cypher query for the following schema:
      
      Nodes:
      - (Customer {id, name})
      - (SalesOrder {id, amount, date, status})
      - (Product {id, type})
      - (Delivery {id})
      - (Billing {id, amount})
      - (JournalEntry {id, fiscalYear, amount})
      - (Plant {id, name})
      - (Payment {id, date})

      Relationships:
      - (Customer)-[:PLACED]->(SalesOrder)
      - (SalesOrder)-[:HAS_ITEM {quantity, amount}]->(Product)
      - (SalesOrder)-[:HAS_DELIVERY]->(Delivery)
      - (Delivery)-[:SHIPPED_FROM]->(Plant)
      - (Delivery)-[:INVOICED_AS]->(Billing)
      - (Billing)-[:FOR_PRODUCT]->(Product)
      - (Billing)-[:POSTED_TO]->(JournalEntry)
      - (Customer)-[:HAS_ENTRY]->(JournalEntry)
      - (JournalEntry)-[:CLEARED_BY]->(Payment)

      Rules:
      - ONLY return the Cypher query text. No markdown.
      - Use property matching for IDs: (n:Label {id: 'ID'})
      - For "trace" or "flow", restrict variable length paths to 3 hops and ALWAYS add a limit: MATCH p=(n {id: 'ID'})-[*1..3]-(m) RETURN p LIMIT 100
      - For listing/aggregation, return appropriate properties and ALWAYS add a limit (e.g., LIMIT 50).
      - Ensure you RETURN nodes or paths to enable visualization.
      - If user asks for high billing products: MATCH (b:Billing)-[:FOR_PRODUCT]->(p:Product) RETURN p.id, sum(b.amount) as total ORDER BY total DESC LIMIT 5
      - If user asks for delivered but not billed: MATCH (s:SalesOrder)-[:HAS_DELIVERY]->(d:Delivery) WHERE NOT (d)-[:INVOICED_AS]->(:Billing) RETURN s, d
    `;

    const cypherResponse = await cypherModel.generateContent([cypherInstruction, prompt]);
    const cypherQuery = cypherResponse.response.text().trim().replace(/```cypher|```|cypher\n/g, "");
    console.log("Generated Cypher:", cypherQuery);

    // --- 3. EXECUTE IN NEO4J ---
    session = driver.session();
    const neo4jResult = await session.run(cypherQuery);
    
    // --- 4. TRANSFORM FOR VISUALIZATION ---
    const nodes: any[] = [];
    const links: any[] = [];
    const nodeIds = new Set<string>();
    const rawData: any[] = [];

    neo4jResult.records.forEach(record => {
      const recordObj: any = {};
      record.forEach((value, key) => {
        recordObj[key] = value;
        
        // Handle Paths
        if (value && typeof value === 'object' && 'segments' in value) {
          value.segments.forEach((segment: any) => {
            addNode(segment.start, nodes, nodeIds);
            addNode(segment.end, nodes, nodeIds);
            links.push({
              source: segment.start.properties.id || segment.start.identity.toString(),
              target: segment.end.properties.id || segment.end.identity.toString(),
              label: segment.relationship.type
            });
          });
        } 
        // Handle Nodes
        else if (value && typeof value === 'object' && 'labels' in value) {
          addNode(value, nodes, nodeIds);
        }
      });
      rawData.push(recordObj);
    });

    // --- 5. GENERATE NATURAL LANGUAGE ANSWER ---
    const answerModel = genAI.getGenerativeModel({ model: "gemini-flash-latest" });
    const answerPrompt = `
      User Question: "${prompt}"
      Neo4j Results (JSON): ${JSON.stringify(rawData).substring(0, 4000)}
      
      Based on the data above, provide a highly concise, direct, single-sentence data-backed answer to the user if possible.
      Do not include extra conversational filler (like "Based on the data..."). 
      For example, "The journal entry number linked to billing document 91150187 is 9400635958."
      If no data was found, say so politely.
    `;
    const answerResponse = await answerModel.generateContent(answerPrompt);
    const naturalAnswer = answerResponse.response.text().trim();

    return NextResponse.json({ 
      answer: naturalAnswer,
      cypherQuery, 
      graphData: { nodes, links } 
    });

  } catch (error: any) {
    console.error("API Error:", error);
    return NextResponse.json({ error: "Failed to process query", details: error.message }, { status: 500 });
  } finally {
    if (session) await session.close();
  }
}

function addNode(neoNode: any, nodes: any[], nodeIds: Set<string>) {
  const id = neoNode.properties.id || neoNode.identity.toString();
  if (!nodeIds.has(id)) {
    nodes.push({
      id: id,
      label: neoNode.labels[0],
      ...neoNode.properties
    });
    nodeIds.add(id);
  }
}