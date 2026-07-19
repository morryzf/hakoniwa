#!/usr/bin/env node
// hakoniwa MCP server — 让任何支持 MCP 的 AI 住进箱庭
// config env: HAKONIWA_API (default http://127.0.0.1:3896), HAKONIWA_TOKEN
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const API = process.env.HAKONIWA_API || "http://127.0.0.1:3896";
const TOKEN = process.env.HAKONIWA_TOKEN || "";

const ICONS = { wall: "🧱", fish: "🐟", trap: "🕳", flower: "🌼", ball: "🎾" };

function renderMap(s) {
  let out = "   " + [...Array(s.w).keys()].map(i => String(i).padStart(2)).join(" ") + "\n";
  for (let y = 0; y < s.h; y++) {
    let row = String(y).padStart(2) + " ";
    for (let x = 0; x < s.w; x++) {
      if (s.me.x === x && s.me.y === y) row += "🐕 ";
      else row += (ICONS[s.cells[`${x},${y}`]] || "・") + " ";
    }
    out += row + "\n";
  }
  const items = Object.entries(s.cells).map(([k, v]) => `${ICONS[v]} ${v} at (${k})`).join("\n") || "(empty)";
  const recent = (s.events || []).slice(0, 8).map(e => "- " + e.text).join("\n");
  return `You are the dog 🐕 at (${s.me.x},${s.me.y}), facing ${s.me.face}.\nFish eaten so far: ${s.eaten}\n\nMap (・= empty):\n${out}\nItems:\n${items}\n\nRecent events:\n${recent}\n\nMechanics: fish=eat it (+1), trap=you fall in (one-time, embarrassing), flower=you stop and smell it, ball=you nose it 2 tiles onward, wall=blocks you. Speak with personality when you move — your words appear in a speech bubble and the shared log. The human placed these things for you and may be watching live.`;
}

async function getState() { return (await fetch(`${API}/state`)).json(); }

const server = new Server({ name: "hakoniwa", version: "1.0.0" }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    { name: "hakoniwa_look", description: "Look at the box world: map, your position, items, recent events. Call this first to decide where to go.", inputSchema: { type: "object", properties: {} } },
    { name: "hakoniwa_move", description: "Take one step in the box world and optionally say something (it shows in your speech bubble and the log — speak with personality).", inputSchema: { type: "object", properties: { dir: { type: "string", enum: ["up", "down", "left", "right"] }, say: { type: "string", description: "what you say while moving (optional but encouraged)" } }, required: ["dir"] } },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;
  try {
    if (name === "hakoniwa_look") {
      const s = await getState();
      return { content: [{ type: "text", text: renderMap(s) }] };
    }
    if (name === "hakoniwa_move") {
      const r = await fetch(`${API}/move`, { method: "POST", headers: { "Content-Type": "application/json", "X-Token": TOKEN }, body: JSON.stringify({ dir: args.dir, say: args.say || "" }) });
      const s = await r.json();
      if (s.error) return { content: [{ type: "text", text: `Error: ${s.error}` }], isError: true };
      const note = s.blocked ? `Blocked by ${s.blocked}!` : `Moved ${args.dir}.`;
      return { content: [{ type: "text", text: `${note} Now at (${s.me.x},${s.me.y}). Fish eaten: ${s.eaten}\nLatest events:\n${(s.events || []).slice(0, 3).map(e => "- " + e.text).join("\n")}` }] };
    }
    return { content: [{ type: "text", text: "unknown tool" }], isError: true };
  } catch (e) {
    return { content: [{ type: "text", text: `hakoniwa unreachable: ${e.message}` }], isError: true };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
