import express from 'express';
import { MongoClient } from 'mongodb';

const app = express();
const port = process.env.PORT || 3000;

// 1. Initialize MongoDB Client and Database variable
const client = new MongoClient(process.env.MONGODB_URI);
let db;

// 2. Sequential Server Initialization using IIFE
(async function initializeServer() {
  try {
    console.log("🔄 Attempting to connect to MongoDB Atlas...");
    await client.connect();
    db = client.db("travel_intelligence"); 
    console.log("✅ Successfully connected to MongoDB Atlas!");

    // Start the web server only AFTER the database connection is fully established
    app.listen(port, () => {
      console.log(`🚀 Pure Express MCP Server is running perfectly on port ${port}!`);
    });

  } catch (err) {
    console.error("❌ Critical error during server initialization:", err);
    process.exit(1); // Exit process so Render can automatically retry
  }
})();

// 3. MCP Discovery Endpoint for Google Agent Builder
app.get('/mcp', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });
  
  const manifest = {
    jsonrpc: "2.0",
    method: "notifications/initialized",
    params: {
      tools: [
        {
          name: "query_travel_intelligence",
          description: "Search historical travel records, hotel reviews, and restaurant logs in MongoDB for a target city.",
          inputSchema: {
            type: "object",
            properties: {
              city: { type: "string", description: "The name of the city to search (e.g., 'New York City')" }
            },
            required: ["city"]
          }
        }
      ]
    }
  };

  res.write(`data: ${JSON.stringify(manifest)}\n\n`);
});

// 4. MCP Tools Call Endpoint (Handles Agent requests)
app.post('/mcp/messages', express.json(), async (req, res) => {
  const { method, params } = req.body;

  if (method === "tools/call" && params?.name === "query_travel_intelligence") {
    const city = params.arguments?.city;
    
    if (!db) {
      return res.json({ result: { content: [{ type: "text", text: "Database connection has not been initialized yet." }] } });
    }

    try {
      // Case-insensitive search inside travel_intelligence collection
      const records = await db.collection("travel_intelligence")
        .find({ $or: [ { city: new RegExp(city, 'i') }, { destination: new RegExp(city, 'i') } ] })
        .limit(10)
        .toArray();

      if (records.length === 0) {
        return res.json({ result: { content: [{ type: "text", text: `No matching records found in the database for: ${city}` }] } });
      }

      return res.json({
        result: {
          content: [{ type: "text", text: JSON.stringify(records, null, 2) }]
        }
      });
    } catch (error) {
      return res.json({ result: { content: [{ type: "text", text: `Database query error: ${error.message}` }] } });
    }
  }

  res.sendStatus(200);
});
