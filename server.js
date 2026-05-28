import express from 'express';
import { MongoClient } from 'mongodb';

const app = express();
const port = process.env.PORT || 3000;

// 1. Initialize MongoDB Client
const client = new MongoClient(process.env.MONGODB_URI);
let db;

// 2. Sequential Server Initialization using IIFE
(async function initializeServer() {
  try {
    console.log("🔄 Attempting to connect to MongoDB Atlas...");
    await client.connect();
    
    // ⚠️ 스크린샷에 맞춰 실제 존재하는 sample_airbnb 데이터베이스로 변경!
    db = client.db("sample_airbnb"); 
    console.log("✅ Successfully connected to sample_airbnb database!");

    // Start the web server only AFTER the database connection is fully established
    app.listen(port, () => {
      console.log(`🚀 Pure Express MCP Server is running perfectly on port ${port}!`);
    });

  } catch (err) {
    console.error("❌ Critical error during server initialization:", err);
    process.exit(1);
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
      // sample_airbnb 내부에 실제로 존재하는 listingsAndReviews 컬렉션 조회
      const records = await db.collection("listingsAndReviews")
        .find({ 
          $or: [ 
            { "address.market": new RegExp(city, 'i') }, 
            { "address.country": new RegExp(city, 'i') } 
          ] 
        })
        .project({ name: 1, space: 1, price: 1, room_type: 1, "address.market": 1, "address.country": 1 }) // 필요한 핵심 필드만 추출
        .limit(5)
        .toArray();

      if (records.length === 0) {
        return res.json({ result: { content: [{ type: "text", text: `No matching Airbnb listings found for: ${city}` }] } });
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
