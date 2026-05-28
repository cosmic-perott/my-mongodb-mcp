import express from 'express';
import { MongoClient } from 'mongodb';

const app = express();
const port = process.env.PORT || 3000;

// 1. 몽고디비 연결 세팅
const client = new MongoClient(process.env.MONGODB_URI);
let db;

async function connectDB() {
  try {
    await client.connect();
    db = client.db("travel_intelligence"); 
    console.log("✅ MongoDB Atlas에 직접 연결 성공!");
  } catch (err) {
    console.error("❌ MongoDB 연결 실패:", err);
  }
}
connectDB();

// 2. 구글 에이전트 빌더가 MCP 연결 초기화할 때 바라보는 SSE 엔드포인트
app.get('/mcp', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });
  
  // 에이전트 빌더에게 "나 이런 툴(함수) 가지고 있어"라고 규격에 맞춰 알려주기
  const manifest = {
    jsonrpc: "2.0",
    method: "notifications/initialized",
    params: {
      tools: [
        {
          name: "query_travel_intelligence",
          description: "지정된 도시의 과거 여행 기록, 호텔 리뷰, 맛집 로그를 몽고DB에서 검색합니다.",
          inputSchema: {
            type: "object",
            properties: {
              city: { type: "string", description: "조회할 도시 이름 (예: 'New York City')" }
            },
            required: ["city"]
          }
        }
      ]
    }
  };

  res.write(`data: ${JSON.stringify(manifest)}\n\n`);
  console.log("🔗 구글 에이전트 빌더가 채널을 열었습니다.");
});

// 3. 에이전트 빌더가 실제로 데이터 조회 명령(툴 호출)을 보낼 때 작동하는 곳
app.post('/mcp/messages', express.json(), async (req, res) => {
  const { method, params } = req.body;

  if (method === "tools/call" && params?.name === "query_travel_intelligence") {
    const city = params.arguments?.city;
    
    if (!db) {
      return res.json({ result: { content: [{ type: "text", text: "데이터베이스가 아직 준비되지 않았습니다." }] } });
    }

    try {
      // 대소문자 구분 없이 도시 이름으로 몽고DB 조회
      const records = await db.collection("travel_intelligence")
        .find({ $or: [ { city: new RegExp(city, 'i') }, { destination: new RegExp(city, 'i') } ] })
        .limit(10)
        .toArray();

      if (records.length === 0) {
        return res.json({ result: { content: [{ type: "text", text: `${city}에 대한 저장된 데이터가 DB에 없습니다.` }] } });
      }

      return res.json({
        result: {
          content: [{ type: "text", text: JSON.stringify(records, null, 2) }]
        }
      });
    } catch (error) {
      return res.json({ result: { content: [{ type: "text", text: `DB 조회 중 에러 발생: ${error.message}` }] } });
    }
  }

  res.sendStatus(200);
});

app.listen(port, () => {
  console.log(`🚀 순수 Express MCP 서버가 포트 ${port}에서 동작 중입니다!`);
});
