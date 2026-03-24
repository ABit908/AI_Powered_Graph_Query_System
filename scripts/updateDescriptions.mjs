import fs from 'fs';
import path from 'path';
import readline from 'readline';
import neo4j from 'neo4j-driver';
import dotenv from 'dotenv';

dotenv.config();

const driver = neo4j.driver(process.env.NEO4J_URI, neo4j.auth.basic(process.env.NEO4J_USER, process.env.NEO4J_PASSWORD));

async function main() {
  const session = driver.session();
  try {
    const dirPath = path.join(process.cwd(), 'data', 'sap-o2c-data', 'product_descriptions');
    const files = fs.readdirSync(dirPath);
    for (const file of files) {
      if (file.endsWith('.jsonl')) {
        const fileStream = fs.createReadStream(path.join(dirPath, file));
        const rl = readline.createInterface({ input: fileStream });

        for await (const line of rl) {
          if (!line.trim()) continue;
          const data = JSON.parse(line);
          if (data.product && data.productDescription) {
            await session.run(
              `MATCH (p:Product {id: $id}) SET p.name = $name`,
              { id: data.product, name: data.productDescription }
            );
          }
        }
      }
    }
    console.log("Product descriptions updated.");
  } finally {
    await session.close();
    await driver.close();
  }
}
main();
