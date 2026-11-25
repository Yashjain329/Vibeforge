// A local stand-in for OpenRouter's chat API, for testing CodeMind's AI → graph-fallback → AI behaviour
// without spending credit. Run: MOCK_FAIL=3-4 node scripts/mock-openrouter.mjs   (port 8787)
// Then start the app with OPENROUTER_API_KEY=test OPENROUTER_BASE_URL=http://127.0.0.1:8787/api/v1
//
// Requests numbered inside MOCK_FAIL (e.g. "3-4") get OpenRouter's real daily-limit error; all others answer:
// a user turn gets an analyzeImpact tool call, a tool result gets a text answer starting "AI ANSWER".
import http from "node:http";

const [failFrom, failTo] = (process.env.MOCK_FAIL ?? "0-0").split("-").map(Number);
let n = 0;

const sse = (res, chunks) => {
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
  for (const c of chunks) res.write(`data: ${JSON.stringify({ id: "mock", object: "chat.completion.chunk", created: 0, model: "mock", ...c })}\n\n`);
  res.end("data: [DONE]\n\n");
};

http
  .createServer((req, res) => {
    let raw = "";
    req.on("data", (d) => (raw += d));
    req.on("end", () => {
      n += 1;
      const body = JSON.parse(raw || "{}");
      const last = body.messages?.at(-1);
      console.log(`#${n} ${req.method} ${req.url} last=${last?.role}`);
      if (n >= failFrom && n <= failTo) {
        res.writeHead(429, { "content-type": "application/json" });
        return res.end(JSON.stringify({ error: { message: "Rate limit exceeded: free-models-per-day", code: 429 } }));
      }
      if (last?.role === "tool") {
        return sse(res, [
          { choices: [{ index: 0, delta: { role: "assistant", content: "AI ANSWER: written by the model from the impact analysis." }, finish_reason: null }] },
          { choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } },
        ]);
      }
      const text = typeof last?.content === "string" ? last.content : JSON.stringify(last?.content ?? "");
      const node = /change\s+`?([\w.()]+)/i.exec(text)?.[1] ?? "main";
      sse(res, [
        { choices: [{ index: 0, delta: { role: "assistant", tool_calls: [{ index: 0, id: `call_${n}`, type: "function", function: { name: "analyzeImpact", arguments: JSON.stringify({ node }) } }] }, finish_reason: null }] },
        { choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } },
      ]);
    });
  })
  .listen(8787, "127.0.0.1", () => console.log(`mock OpenRouter on :8787, failing requests ${failFrom}-${failTo}`));
