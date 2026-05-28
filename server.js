import express from 'express';
import { MongoClient } from 'mongodb';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

const app = express();
const port = process.env.PORT || 3000;

// 1. Initialize MongoDB Client
const client = new MongoClient(process.env.MONGODB_URI);
let db;

// 2. Initialize Official MCP Server
const mcpServer = new Server(
  { name: "mongodb-mcp-server", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

// Define the tool according to strict MCP specs
mcpServer.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "query_travel_intelligence",
      description: "Search Airbnb hotel listings, room types, and accommodation records in MongoDB for a target market or country.",
      inputSchema: {
        type: "object",
        properties: {
          city: { type: "string", description: "The target market/country to search (e.g., 'United States', 'Brazil', 'Portugal')" }
        },
        required: ["city"]
      }
    }
  ]
}));

// Handle the tool execution according to strict MCP specs
mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name !== "query_travel_intelligence") {
    throw new Error(`Unknown tool: ${request.params.name}`);
  }

  const city = request.params.arguments?.city;
  if (!db) {
    return { content: [{ type: "text", text: "Database connection has not been initialized yet." }] };
  }

  try {
    const records = await db.collection("listingsAndReviews")
      .find({ 
        $or: [ 
          { "address.market": new RegExp(city, 'i') }, 
          { "address.country": new RegExp(city, 'i') } 
        ] 
      })
      .project({ name: 1, space: 1, price: 1, room_type: 1, "address.market": 1, "address.country": 1 })
      .limit(5)
      .toArray();

    if (records.length === 0) {
      return { content: [{ type: "text", text: `No matching Airbnb listings found for: ${city}` }] };
    }

    return {
      content: [{ type: "text", text: JSON.stringify(records, null, 2) }]
    };
  } catch (error) {
    return { content: [{ type: "text", text: `Database query error: ${error.message}` }] };
  }
});

// 3. Connect DB & Setup Routes
let sseTransport;
(async function initializeServer() {
  try {
    console.log("🔄 Connecting to MongoDB...");
    await client.connect();
    db = client.db("sample_airbnb");
    console.log("✅ Connected to sample_airbnb database!");

    // Route for Google to establish the live SSE connection stream
    app.get('/mcp', (req, res) => {
      sseTransport = new SSEServerTransport('/mcp/messages', res);
      mcpServer.connect(sseTransport);
    });

    // Route for Google to post messages back to the server
    app.post('/mcp/messages', express.json(), async (req, res) => {
      if (sseTransport) {
        await sseTransport.handleMessage(req, res);
      } else {
        res.sendStatus(400);
      }
    });

    app.listen(port, () => {
      console.log(`🚀 Compliant MCP Server running on port ${port}!`);
    });
  } catch (err) {
    console.error("❌ Initialization error:", err);
    process.exit(1);
  }
})();
