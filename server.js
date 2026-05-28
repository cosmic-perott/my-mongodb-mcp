import express from 'express';
import { MongoClient } from 'mongodb';

const app = express();
const port = process.env.PORT || 3000;

// 1. 몽고디비 래퍼 및 글로벌 변수 선언
const client = new MongoClient(process.env.MONGODB_URI);
let db;

// 2. 전체 초기화 과정을 순서대로 동기화 (IIFE 구조)
(async function initializeServer() {
  try {
    console.log("🔄 MongoDB Atlas에 연결을 시도 중...");
    await client.connect();
    db = client.db("travel_intelligence"); 
    console.log("✅ MongoDB Atlas에 완벽하게 연결되었습니다!");

    // DB 연결이 끝난 '후에' 웹 서버 포트를 활성화합니다.
    app.listen(port, () => {
      console.log(`🚀 순수 Express MCP 서버가 포트 ${port}에서 완벽하게 동작 중입니다!`);
    });

  } catch (err) {
    console.error("❌ 서버 초기화 중 치명적 오류 발생:", err);
    process.exit(1); // 연결 실패 시 프로세스 종료로 Render가 재시도하게 만듦
  }
})();

// 3. 구글 에이전트 빌더 SSE 초기화 엔드포인트
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
});

// 4. 에이전트 빌더 툴 호출 처리 (메시지 엔드포인트)
app.post('/mcp/messages', express.json(), async (req, res) => {
  const { method, params } = req.body;

  if (method === "tools/call" && params?.name === "query_travel_intelligence") {
    const city = params.arguments?.city;
    
    // 이제 위에서 완벽히 대기하므로 db가 없을 수가 없습니다.
    if (!db) {
      return res.json({ result: { content: [{ type: "text", text: "데이터베이스 연결이 초기화되지 않았습니다." }] } });
    }

    try {
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
