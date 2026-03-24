# Graph Query System (SAP O2C)

This project is a specialized graph-based query system designed to navigate and analyze SAP Order-to-Cash (O2C) data. By combining Neo4j's relational strengths with Gemini's natural language capabilities, it allows users to trace the entire lifecycle of a business process—from a customer's initial order down to the final clearing payment—using simple conversational English.

## Architecture Decisions

The system is built on a modern full-stack architecture designed for high performance and deep data traceability:

*   **Frontend**: Built with **Next.js (App Router)** and **TypeScript**. I used **Tailwind CSS** for the UI and **React Force Graph** for the interactive visualization layer.
*   **Database**: **Neo4j** was the deliberate choice here. SAP O2C data is inherently relational but highly transitive. Tracing a Sales Order through Deliveries, Billings, and Journal Entries in a traditional SQL DB would require massive, multi-join queries. A graph database allows us to treat these business links as first-class citizens, making "path-finding" queries significantly faster and more intuitive.
*   **LLM Pipeline**: We use **Google Gemini 1.5 Flash**. The decision to use a multi-stage pipeline instead of a single prompt was to ensure reliability and safety (see Prompting Strategy below).

## Database Choice & Data Model

The core of the system is the graph schema which maps out the SAP O2C flow:

*   **Entities**: `Customer`, `SalesOrder`, `Product`, `Delivery`, `Billing`, `JournalEntry`, `Plant`, and `Payment`.
*   **Key Relationships**: 
    *   `Customer -[:PLACED]-> SalesOrder`
    *   `SalesOrder -[:HAS_DELIVERY]-> Delivery`
    *   `Delivery -[:INVOICED_AS]-> Billing`
    *   `Billing -[:POSTED_TO]-> JournalEntry`
    *   `JournalEntry -[:CLEARED_BY]-> Payment`

This model allows for complex "traceability" queries, such as identifying which specific plant shipped a product that ended up in a specific journal entry.

## LLM Prompting Strategy

The system doesn't just pass your text to the LLM. It follows a structured **3-stage execution pipeline**:

1.  **Intent Classification (Guardrail)**: Before any query is generated, a "Guardrail Model" checks if the input is actually related to our business domain. If you ask about the weather or general trivia, the system politely declines to keep the focus on the data.
2.  **Text-to-Cypher Generation**: Once validated, a specialized prompt converts the natural language into a Cypher query. This prompt is injected with the full graph schema (nodes, properties, and relationship directions) to ensure the generated code is syntactically correct and context-aware.
3.  **Contextual Summarization**: After Neo4j returns the raw JSON data, a final LLM pass "reads" the result and summarizes it into a concise, human-readable answer. This ensures you get a direct answer (e.g., "The payment was cleared on Oct 12th") rather than just a table of data.

## Guardrails & Security

To maintain system integrity and prevent "hallucinations" or runaway queries, several guardrails are in place:

*   **Domain Restriction**: The first-stage intent check acts as a firewall against off-topic queries.
*   **Query Constraints**: The Cypher generator is strictly instructed to always include `LIMIT` clauses and restrict "trace" (variable-length) paths to a maximum of 3 hops. This prevents accidental "full graph" scans that could hang the database.
*   **Property Sanitization**: The system only exposes specific business-relevant properties to the LLM, ensuring internal system metadata remains hidden.

## Getting Started

### Prerequisites
- Neo4j Instance (Local or AuraDB)
- Google Gemini API Key

### Setup
1. Clone the repo and install dependencies:
   ```bash
   npm install
   ```
2. Configure your `.env` file with Neo4j and Gemini credentials.
3. Import the dataset:
   ```bash
   node scripts/importData.mjs
   ```
4. Run the development server:
   ```bash
   npm run dev
   ```
