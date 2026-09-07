/* Same Sun — realtime backend.
   One Durable Object per room. Both people join the same room and every
   click, cursor move and piece of activity state is broadcast to the other. */

const CAP_DEFAULT = 400;

export class DayRoom {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.kv = null;
    this.seq = 0;
  }

  async load() {
    if (this.kv) return this.kv;
    this.kv = (await this.ctx.storage.get("kv")) || {};
    return this.kv;
  }

  save() {
    // Fire and forget; the DO keeps the in-memory copy authoritative.
    this.ctx.waitUntil(this.ctx.storage.put("kv", this.kv));
  }

  async fetch(request) {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ id: null, name: "", side: "guest", color: "#3FA396" });
    return new Response(null, { status: 101, webSocket: client });
  }

  peers() {
    return this.ctx.getWebSockets()
      .map((ws) => {
        try { return ws.deserializeAttachment(); } catch { return null; }
      })
      .filter((a) => a && a.id)
      .map(({ id, name, side, color }) => ({ id, name, side, color }));
  }

  broadcast(msg, except) {
    const s = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except) continue;
      try { ws.send(s); } catch { /* closing */ }
    }
  }

  async webSocketMessage(ws, raw) {
    if (typeof raw !== "string") return;
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    const kv = await this.load();
    const att = ws.deserializeAttachment() || {};

    switch (m.t) {
      case "hello": {
        const side = m.side === "her" || m.side === "you" ? m.side : "guest";
        const next = {
          id: att.id || `p${++this.seq}-${Math.random().toString(36).slice(2, 7)}`,
          name: String(m.name || "someone").slice(0, 24),
          side,
          color: side === "her" ? "#E2707E" : side === "you" ? "#F4A93C" : "#3FA396",
        };
        ws.serializeAttachment(next);
        ws.send(JSON.stringify({
          t: "init", id: next.id, now: Date.now(), kv, peers: this.peers(),
        }));
        this.broadcast({ t: "peers", peers: this.peers() });
        break;
      }

      case "set": {
        if (typeof m.k !== "string") return;
        kv[m.k] = m.v;
        this.save();
        this.broadcast({ t: "set", k: m.k, v: m.v, by: att.id }, ws);
        break;
      }

      case "push": {
        if (typeof m.k !== "string") return;
        const cap = Number.isFinite(m.cap) ? m.cap : CAP_DEFAULT;
        const arr = Array.isArray(kv[m.k]) ? kv[m.k] : [];
        arr.push(m.v);
        while (arr.length > cap) arr.shift();
        kv[m.k] = arr;
        this.save();
        // Echo to everyone, sender included, so ordering is the server's.
        this.broadcast({ t: "list", k: m.k, v: arr, by: att.id });
        break;
      }

      case "wipe": {
        const prefix = typeof m.k === "string" ? m.k : "";
        for (const key of Object.keys(kv)) {
          if (!prefix || key === prefix || key.startsWith(prefix)) delete kv[key];
        }
        this.save();
        this.broadcast({ t: "wipe", k: prefix, by: att.id });
        break;
      }

      case "ev": {
        // Ephemeral: cursors, clicks, live pen strokes. Never stored.
        if (typeof m.k !== "string") return;
        this.broadcast({ t: "ev", k: m.k, v: m.v, by: att.id }, ws);
        break;
      }

      case "ping":
        ws.send(JSON.stringify({ t: "pong", now: Date.now() }));
        break;
    }
  }

  async webSocketClose(ws) {
    try { ws.close(1000, "bye"); } catch { /* already closed */ }
    this.broadcast({ t: "peers", peers: this.peers() });
  }

  async webSocketError(ws) {
    this.broadcast({ t: "peers", peers: this.peers() });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/room") {
      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("expected websocket", { status: 426 });
      }
      const room = (url.searchParams.get("r") || "same-sun")
        .toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 40) || "same-sun";
      const id = env.ROOM.idFromName(room);
      return env.ROOM.get(id).fetch(request);
    }

    return env.ASSETS.fetch(request);
  },
};
