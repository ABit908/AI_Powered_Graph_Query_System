import fs from 'fs';
import path from 'path';
import readline from 'readline';
import neo4j from 'neo4j-driver';
import dotenv from 'dotenv';

dotenv.config();

const uri = process.env.NEO4J_URI;
const user = process.env.NEO4J_USER;
const password = process.env.NEO4J_PASSWORD;

if (!uri || !user || !password) {
  console.error("Missing Neo4j credentials in .env file.");
  process.exit(1);
}

const driver = neo4j.driver(uri, neo4j.auth.basic(user, password));

function sanitizeProps(obj) {
  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    if (['string', 'number', 'boolean'].includes(typeof value)) {
      sanitized[key] = value;
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
       // Optional: Flatten one level? No, let's just ignore complex objects for now.
    }
  }
  return sanitized;
}

async function createIndexes(session) {
  console.log("Creating constraints and indexes...");
  const queries = [
    "CREATE CONSTRAINT IF NOT EXISTS FOR (c:Customer) REQUIRE c.id IS UNIQUE",
    "CREATE CONSTRAINT IF NOT EXISTS FOR (s:SalesOrder) REQUIRE s.id IS UNIQUE",
    "CREATE CONSTRAINT IF NOT EXISTS FOR (p:Product) REQUIRE p.id IS UNIQUE",
    "CREATE CONSTRAINT IF NOT EXISTS FOR (d:Delivery) REQUIRE d.id IS UNIQUE",
    "CREATE CONSTRAINT IF NOT EXISTS FOR (b:Billing) REQUIRE b.id IS UNIQUE",
    "CREATE CONSTRAINT IF NOT EXISTS FOR (j:JournalEntry) REQUIRE j.id IS UNIQUE",
    "CREATE CONSTRAINT IF NOT EXISTS FOR (pl:Plant) REQUIRE pl.id IS UNIQUE",
    "CREATE CONSTRAINT IF NOT EXISTS FOR (py:Payment) REQUIRE py.id IS UNIQUE"
  ];
  for (const q of queries) {
    try {
      await session.run(q);
    } catch (e) {
      console.warn(`Constraint already exists or error: ${e.message}`);
    }
  }
  console.log("Constraints prepared.");
}

async function processFile(session, filePath, type) {
  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({ input: fileStream });

  for await (const line of rl) {
    if (!line.trim()) continue;
    let data;
    try {
      data = JSON.parse(line);
    } catch (e) {
      continue;
    }
    
    switch (type) {
      case 'CUSTOMER':
        if (data.customer) {
          await session.run(
            `MERGE (c:Customer {id: $id}) SET c += $props, c.name = $name`,
            { id: data.customer, name: data.businessPartnerFullName || data.businessPartnerName || "", props: sanitizeProps(data) }
          );
        }
        break;

      case 'PRODUCT':
        if (data.product) {
          await session.run(
            `MERGE (p:Product {id: $id}) SET p += $props, p.type = $type`,
            { id: data.product, type: data.productType || "", props: sanitizeProps(data) }
          );
        }
        break;

      case 'PLANT':
        if (data.plant) {
          await session.run(
            `MERGE (pl:Plant {id: $id}) SET pl += $props, pl.name = $name`,
            { id: data.plant, name: data.plantName || "", props: sanitizeProps(data) }
          );
        }
        break;

      case 'SALES_ORDER':
        if (data.salesOrder) {
          await session.run(
            `MERGE (s:SalesOrder {id: $id}) 
             SET s += $props, s.amount = toFloat($amount), s.date = $date, s.status = $status`,
            { 
              id: data.salesOrder, 
              amount: data.totalNetAmount || 0, 
              date: data.creationDate,
              status: data.overallDeliveryStatus,
              props: sanitizeProps(data)
            }
          );
          if (data.soldToParty) {
            await session.run(
              `MATCH (c:Customer {id: $customerId})
               MATCH (s:SalesOrder {id: $soId})
               MERGE (c)-[:PLACED]->(s)`,
              { customerId: data.soldToParty, soId: data.salesOrder }
            );
          }
        }
        break;

      case 'SALES_ITEM':
        if (data.salesOrder && data.material) {
          await session.run(
            `MATCH (s:SalesOrder {id: $soId})
             MERGE (p:Product {id: $productId})
             MERGE (s)-[r:HAS_ITEM]->(p)
             SET r += $props, r.quantity = toFloat($qty), r.amount = toFloat($amt)`,
            { 
              soId: data.salesOrder, 
              productId: data.material, 
              qty: data.requestedQuantity || 0,
              amt: data.netAmount || 0,
              props: sanitizeProps(data)
            }
          );
        }
        break;

      case 'DELIVERY':
        if (data.deliveryDocument && data.referenceSdDocument) {
          await session.run(
            `MATCH (s:SalesOrder {id: $soId})
             MERGE (d:Delivery {id: $dId})
             SET d += $props
             MERGE (s)-[:HAS_DELIVERY]->(d)`,
            { soId: data.referenceSdDocument, dId: data.deliveryDocument, props: sanitizeProps(data) }
          );
          if (data.plant) {
            await session.run(
              `MATCH (d:Delivery {id: $dId})
               MERGE (pl:Plant {id: $pId})
               MERGE (d)-[:SHIPPED_FROM]->(pl)`,
              { dId: data.deliveryDocument, pId: data.plant }
            );
          }
        }
        break;

      case 'BILLING':
        if (data.billingDocument && data.referenceSdDocument) {
          await session.run(
            `MATCH (d:Delivery {id: $dId})
             MERGE (b:Billing {id: $bId})
             SET b += $props, b.amount = toFloat($amount)
             MERGE (d)-[:INVOICED_AS]->(b)`,
            { dId: data.referenceSdDocument, bId: data.billingDocument, amount: data.netAmount || 0, props: sanitizeProps(data) }
          );
          if (data.material) {
            await session.run(
              `MATCH (b:Billing {id: $bId})
               MERGE (p:Product {id: $pId})
               MERGE (b)-[:FOR_PRODUCT]->(p)`,
              { bId: data.billingDocument, pId: data.material }
            );
          }
        }
        break;

      case 'JOURNAL':
        if (data.accountingDocument && data.referenceDocument) {
          await session.run(
            `MATCH (b:Billing {id: $bId})
             MERGE (j:JournalEntry {id: $jId})
             SET j += $props, j.fiscalYear = $year, j.amount = toFloat($amount)
             MERGE (b)-[:POSTED_TO]->(j)`,
            { bId: data.referenceDocument, jId: data.accountingDocument, year: data.fiscalYear, amount: data.amountInCompanyCodeCurrency || 0, props: sanitizeProps(data) }
          );
          if (data.customer) {
            await session.run(
              `MATCH (c:Customer {id: $cId})
               MATCH (j:JournalEntry {id: $jId})
               MERGE (c)-[:HAS_ENTRY]->(j)`,
              { cId: data.customer, jId: data.accountingDocument }
            );
          }
          if (data.clearingAccountingDocument && data.clearingAccountingDocument !== "0000000000") {
            await session.run(
              `MATCH (j:JournalEntry {id: $jId})
               MERGE (py:Payment {id: $pId})
               SET py.date = $date
               MERGE (j)-[:CLEARED_BY]->(py)`,
              { jId: data.accountingDocument, pId: data.clearingAccountingDocument, date: data.clearingDate }
            );
          }
        }
        break;
    }
  }
}

async function processDirectory(session, dirPath, type) {
  if (!fs.existsSync(dirPath)) {
    console.warn(`Directory not found: ${dirPath}`);
    return;
  }
  const files = fs.readdirSync(dirPath);
  for (const file of files) {
    if (file.endsWith('.jsonl')) {
       console.log(`Processing ${file} for ${type}...`);
       await processFile(session, path.join(dirPath, file), type);
    }
  }
}

async function main() {
  const session = driver.session();
  try {
    await createIndexes(session);

    const baseDataDir = path.join(process.cwd(), 'data', 'sap-o2c-data');
    
    console.log("--- Phase 1: Master Data ---");
    await processDirectory(session, path.join(baseDataDir, 'business_partners'), 'CUSTOMER');
    await processDirectory(session, path.join(baseDataDir, 'products'), 'PRODUCT');
    await processDirectory(session, path.join(baseDataDir, 'plants'), 'PLANT');

    console.log("--- Phase 2: Transactional Data ---");
    await processDirectory(session, path.join(baseDataDir, 'sales_order_headers'), 'SALES_ORDER');
    await processDirectory(session, path.join(baseDataDir, 'sales_order_items'), 'SALES_ITEM');
    await processDirectory(session, path.join(baseDataDir, 'outbound_delivery_items'), 'DELIVERY');
    await processDirectory(session, path.join(baseDataDir, 'billing_document_items'), 'BILLING');
    await processDirectory(session, path.join(baseDataDir, 'journal_entry_items_accounts_receivable'), 'JOURNAL');

    console.log("Data import completed successfully.");
  } catch (error) {
    console.error("Error importing data:", error);
  } finally {
    await session.close();
    await driver.close();
  }
}

main();