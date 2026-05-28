import express from 'express';
import { MongoClient } from 'mongodb';

const app = express();
const port = process.env.PORT || 3000;

// 1. 구글 에이전트 빌더의 CORS(교차 출처) 차단 문제를 원천 봉쇄하는 헤더 미들웨어
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, x-requested-with");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

// 2. Initialize MongoDB Client (sample_airbnb)
const client = new MongoClient(process.env.MONGODB_URI);
let db;

(async function initializeServer() {
  try {
    console.log("🔄 Attempting to connect to MongoDB Atlas...");
    await client.connect();
    db = client.db("sample_airbnb"); 
    console.log("✅ Successfully connected to sample_airbnb database!");

    app.listen(port, () => {
      console.log(`🚀 Secure Express MCP Server is running perfectly on port ${port}!`);
    });
  } catch (err) {
    console.error("❌ Critical error during server initialization:", err);
    process.exit(1);
  }
})();

// 3. 구글 에이전트 빌더가 GET과 POST 모두로 툴 정보를 조회할 수 있도록 완벽 대응
const getManifest = () => ({
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
});

// 구글이 툴 등록 시 단순 JSON 또는 SSE 스트림 중 무엇을 요구하든 다 대응하도록 수정
app.get('/mcp', (req, res) => {
  if (req.headers.accept && req.headers.accept.includes('text/event-stream')) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });
    res.write(`data: ${JSON.stringify(getManifest())}\n\n`);
  } else {
    res.json(getManifest());
  }
});

// 4. MCP Tools Call Endpoint
app.post('/mcp/messages', express.json(), async (req, res) => {
  const { method, params } = req.body;

  if (method === "tools/call" && params?.name === "query_travel_intelligence") {
    const city = params.arguments?.city;
    
    if (!db) {
      return res.json({ result: { content: [{ type: "text", text: "Database connection has not been initialized yet." }] } });
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
