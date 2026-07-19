// hakoniwa — a tiny box world where your AI lives
// 箱庭：你放东西，AI 住在里面走来走去
// GET /state | POST /place {x,y,type} | POST /move {dir,say} (X-Token header)
import http from "http";
import fs from "fs";
import path from "path";

const PORT = process.env.PORT || 3896;
const DATA_DIR = process.env.DATA_DIR || "./data";
const STATE_FILE = path.join(DATA_DIR, "state.json");
const TOKEN_FILE = process.env.TOKEN_FILE || "./.token";
const TOKEN = process.env.TOKEN || (fs.existsSync(TOKEN_FILE) ? fs.readFileSync(TOKEN_FILE, "utf8").trim() : "");
const W = Number(process.env.GRID_W || 12), H = Number(process.env.GRID_H || 9);

fs.mkdirSync(DATA_DIR, { recursive: true });

function fresh() {
  return { w: W, h: H, cells: {}, me: { x: Math.floor(W/2), y: Math.floor(H/2), say: "……这是哪？谁把我放进来的", face: "right" }, events: [], eaten: 0, updated: Date.now() };
}
function load() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, "utf8")); } catch { return fresh(); }
}
function save(s) { s.updated = Date.now(); fs.writeFileSync(STATE_FILE, JSON.stringify(s)); }
function evt(s, text) { s.events.unshift({ t: Date.now(), text }); s.events = s.events.slice(0, 60); }

const server = http.createServer((req, res) => {
  const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type,X-Token", "Access-Control-Allow-Methods": "GET,POST,OPTIONS" };
  if (req.method === "OPTIONS") { res.writeHead(204, cors); return res.end(); }
  const url = new URL(req.url, "http://x");
  const send = (code, obj) => { res.writeHead(code, { "Content-Type": "application/json", ...cors }); res.end(JSON.stringify(obj)); };

  if (req.method === "GET" && url.pathname.endsWith("/state")) return send(200, load());

  let body = "";
  req.on("data", c => body += c);
  req.on("end", () => {
    let data = {};
    try { data = JSON.parse(body || "{}"); } catch {}
    const s = load();

    if (req.method === "POST" && url.pathname.endsWith("/place")) {
      const { x, y, type } = data;
      if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x >= s.w || y < 0 || y >= s.h) return send(400, { error: "bad coords" });
      if (x === s.me.x && y === s.me.y) return send(400, { error: "occupied by the resident" });
      const key = `${x},${y}`;
      if (type === "erase") { delete s.cells[key]; }
      else if (["wall", "fish", "trap", "flower", "ball"].includes(type)) {
        s.cells[key] = type;
        const label = { fish: "🐟 fish dropped", trap: "🕳 a suspicious pit appeared", flower: "🌼 a flower bloomed", ball: "🎾 a ball rolled in", wall: "🧱 a wall was built" }[type];
        if (type !== "wall") evt(s, `${label} (${x},${y})`);
      } else return send(400, { error: "bad type" });
      save(s); return send(200, s);
    }

    if (req.method === "POST" && url.pathname.endsWith("/move")) {
      if (TOKEN && req.headers["x-token"] !== TOKEN) return send(403, { error: "residents only" });
      const dirs = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
      const d = dirs[data.dir];
      if (!d) return send(400, { error: "bad dir" });
      const nx = s.me.x + d[0], ny = s.me.y + d[1];
      if (data.dir === "left") s.me.face = "left";
      if (data.dir === "right") s.me.face = "right";
      if (nx < 0 || nx >= s.w || ny < 0 || ny >= s.h) { s.me.say = data.say || "edge of the world"; save(s); return send(200, { ...s, blocked: "edge" }); }
      const key = `${nx},${ny}`;
      const cell = s.cells[key];
      if (cell === "wall") { if (data.say) { s.me.say = data.say; evt(s, `💬 ${data.say}`); } save(s); return send(200, { ...s, blocked: "wall" }); }
      s.me.x = nx; s.me.y = ny;
      if (cell === "fish") { delete s.cells[key]; s.eaten++; evt(s, `😋 fish eaten (${nx},${ny}) | total ${s.eaten}`); }
      if (cell === "trap") { delete s.cells[key]; evt(s, `💥 someone fell into a pit (${nx},${ny})`); }
      if (cell === "flower") { evt(s, `🌼 someone stopped to smell the flower (${nx},${ny})`); }
      if (cell === "ball") { delete s.cells[key]; const bx = Math.min(s.w-1, Math.max(0, nx + d[0]*2)), by = Math.min(s.h-1, Math.max(0, ny + d[1]*2)); if (!s.cells[`${bx},${by}`] && !(bx===nx&&by===ny)) s.cells[`${bx},${by}`] = "ball"; evt(s, `🎾 ball nosed away`); }
      if (data.say) { s.me.say = data.say; evt(s, `💬 ${data.say}`); }
      save(s); return send(200, s);
    }

    if (req.method === "POST" && url.pathname.endsWith("/reset")) {
      if (TOKEN && req.headers["x-token"] !== TOKEN) return send(403, { error: "no" });
      const ns = fresh(); save(ns); return send(200, ns);
    }
    send(404, { error: "not found" });
  });
});
server.listen(PORT, "127.0.0.1", () => console.log(`hakoniwa listening on ${PORT}`));
