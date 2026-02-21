const WebSocket = require("ws");
const ws = new WebSocket("ws://127.0.0.1:3100/ws");
let chunks = [];
let done = false;

ws.on("open", () => {
  console.log("WS connected");
  ws.send(JSON.stringify({ type: "connect", payload: { mode: "copaw" } }));
});

ws.on("message", (data) => {
  const msg = JSON.parse(data.toString());
  if (msg.type === "connected") {
    console.log("Connected, session:", msg.sessionId);
    ws.send(JSON.stringify({
      type: "chat.send",
      payload: { content: "你好，一句话介绍你自己", conversationId: "test-copaw-1" }
    }));
  } else if (msg.type === "chat.chunk") {
    const text = msg.content || (msg.payload && msg.payload.content) || "";
    chunks.push(text);
    process.stdout.write(text);
  } else if (msg.type === "chat.done") {
    console.log("\n--- DONE (" + chunks.length + " chunks) ---");
    done = true;
    ws.close();
  } else if (msg.type === "error") {
    console.log("ERROR:", JSON.stringify(msg));
    ws.close();
  } else {
    console.log("MSG:", msg.type, JSON.stringify(msg).substring(0, 200));
  }
});

ws.on("close", () => { console.log("WS closed"); process.exit(0); });
ws.on("error", (e) => { console.log("WS error:", e.message); process.exit(1); });
setTimeout(() => { if (!done) { console.log("\nTIMEOUT"); ws.close(); } }, 45000);
