import express from 'express';
import { MongoClient } from 'mongodb';
import { McpServer } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';

const app = express();
const port = process.env.PORT || 3000;

const server = new McpServer({
  name: "mongodb-travel-server",
  version: "1.0.0"
});

const client = new MongoClient(process.env.MONGODB_URI);
let db;

async function connectDB() {
  try {
    await client.connect();
    db = client.db("travel_intelligence"); 
    console.log("✅ Connected straight to MongoDB Atlas.");
  } catch (err) {
    console.error("❌ MongoDB Connection failed:", err);
  }
}
connectDB();

server.tool(
  "query_travel_intelligence",
  "Searches historical travel records, hotel reviews, and restaurant logs for a target city.",
  async ({ city }) => {
    if (!db) return { content: [{ type: "text", text: "Database not initialized yet." }] };
    
    try {
      const records = await db.collection("travel_intelligence")
        .find({ $or: [ { city: new RegExp(city, 'i') }, { destination: new RegExp(city, 'i') } ] })
        .limit(10)
        .toArray();
        
      if (records.length === 0) {
        return { content: [{ type: "text", text: `No cached records found in database for: ${city}` }] };
      }
      
      return { content: [{ type: "text", text: JSON.stringify(records, null, 2) }] };
    } catch (error) {
      return { content: [{ type: "text", text: `Error querying collection: ${error.message}` }] };
    }
  },
  {
    city: { type: "string", description: "The name of the target holiday city or destination (e.g., 'New York City')" }
  }
);

let transport;

app.get('/mcp', async (req, res) => {
  transport = new SSEServerTransport('/mcp/messages', res);
  await server.connect(transport);
  console.log("🔗 SSE stream channel opened.");
});

app.post('/mcp/messages', express.json(), async (req, res) => {
  if (transport) {
    await transport.handleMessage(req, res);
  } else {
    res.sendStatus(400);
  }
});

app.listen(port, () => {
  console.log(`🚀 Server active on port ${port}`);
});
