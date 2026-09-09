/* Same Sun — realtime backend.
   One Durable Object per room. Both people join the same room and every
   click, cursor move and piece of activity state is broadcast to the other. */

const CAP_DEFAULT = 400;

/* Shared images live outside the broadcast blob, chunked so no single stored
   value is large. Chunks are well under the smallest per-value limit of either
   storage backend, so this holds regardless of which one the class uses. */
const IMG_CHUNK   = 64 * 1024;
const IMG_MAX     = 3 * 1024 * 1024;
const IMG_KEEP    = 60;                 // most recent images kept per room
const IMG_BUDGET  = 24 * 1024 * 1024;   // ...and no more than this in total
const IMG_TYPES   = ["image/png", "image/jpeg", "image/gif", "image/webp"];

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

  // Awaited by every mutation before it is broadcast: a fire-and-forget write
  // can be cut short when the object hibernates, and a peer must never be told
  // about a change that did not survive.
  save() {
    return this.ctx.storage.put("kv", this.kv);
  }

  /* ------------------------------ images ------------------------------ */

  async putImage(bytes, type) {
    const id = crypto.randomUUID().replace(/-/g, "").slice(0, 20);
    const total = Math.ceil(bytes.byteLength / IMG_CHUNK);

    for (let i = 0; i < total; i++) {
      const slice = bytes.slice(i * IMG_CHUNK, (i + 1) * IMG_CHUNK);
      await this.ctx.storage.put(`imgc:${id}:${i}`, slice);
    }
    await this.ctx.storage.put(`imgm:${id}`, { type, size: bytes.byteLength, chunks: total });

    const index = (await this.ctx.storage.get("img.index")) || [];
    index.push({ id, size: bytes.byteLength });
    await this.trim(index);
    return id;
  }

  /* Oldest-out, on both a count and a byte budget. */
  async trim(index) {
    let bytes = index.reduce((n, x) => n + x.size, 0);
    while (index.length > IMG_KEEP || (bytes > IMG_BUDGET && index.length > 1)) {
      const gone = index.shift();
      bytes -= gone.size;
      await this.dropImage(gone.id);
    }
    await this.ctx.storage.put("img.index", index);
  }

  async dropImage(id) {
    const meta = await this.ctx.storage.get(`imgm:${id}`);
    const keys = [`imgm:${id}`];
    for (let i = 0; i < (meta ? meta.chunks : 0); i++) keys.push(`imgc:${id}:${i}`);
    await this.ctx.storage.delete(keys);
  }

  async getImage(id) {
    if (!/^[0-9a-f]{1,32}$/.test(id || "")) return new Response("bad id", { status: 400 });
    const meta = await this.ctx.storage.get(`imgm:${id}`);
    if (!meta) return new Response("not found", { status: 404 });

    const parts = [];
    for (let i = 0; i < meta.chunks; i++) {
      const c = await this.ctx.storage.get(`imgc:${id}:${i}`);
      if (!c) return new Response("incomplete", { status: 404 });
      parts.push(new Uint8Array(c));
    }
    const out = new Uint8Array(meta.size);
    let at = 0;
    for (const p of parts) { out.set(p, at); at += p.byteLength; }

    return new Response(out, {
      headers: {
        "Content-Type": meta.type,
        "Content-Length": String(meta.size),
        // Bodies are addressed by a random id and never rewritten.
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  async wipeImages() {
    const index = (await this.ctx.storage.get("img.index")) || [];
    for (const x of index) await this.dropImage(x.id);
    await this.ctx.storage.delete("img.index");
  }

  /* ------------------------------ routing ----------------------------- */

  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/img") return this.getImage(url.searchParams.get("id"));

    if (url.pathname === "/upload") {
      const type = (request.headers.get("Content-Type") || "").split(";")[0].trim();
      if (!IMG_TYPES.includes(type)) {
        return Response.json({ error: "unsupported type" }, { status: 415 });
      }
      const bytes = await request.arrayBuffer();
      if (!bytes.byteLength) return Response.json({ error: "empty" }, { status: 400 });
      if (bytes.byteLength > IMG_MAX) {
        return Response.json({ error: "too large" }, { status: 413 });
      }
      const id = await this.putImage(bytes, type);
      return Response.json({ id });
    }

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
        await this.save();
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
        await this.save();
        // Echo to everyone, sender included, so ordering is the server's.
        this.broadcast({ t: "list", k: m.k, v: arr, by: att.id });
        break;
      }

      case "wipe": {
        const prefix = typeof m.k === "string" ? m.k : "";
        for (const key of Object.keys(kv)) {
          if (!prefix || key === prefix || key.startsWith(prefix)) delete kv[key];
        }
        await this.save();
        // Clearing everything, or the chat specifically, takes its images too.
        if (!prefix || prefix === "chat." || prefix === "chat.msgs") await this.wipeImages();
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

const roomName = (url) =>
  (url.searchParams.get("r") || "same-sun")
    .toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 40) || "same-sun";

/* Cloudflare returns one iceServers object; RTCPeerConnection wants a list of
   them. Accept either, and drop anything that has no urls. */
export function normaliseIce(body) {
  const raw = body && body.iceServers;
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return list
    .map((s) => (s && s.urls ? { ...s, urls: Array.isArray(s.urls) ? s.urls : [s.urls] } : null))
    .filter((s) => s && s.urls.length);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/room") {
      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("expected websocket", { status: 426 });
      }
      return env.ROOM.get(env.ROOM.idFromName(roomName(url))).fetch(request);
    }

    /* Two browsers that cannot reach each other directly need a relay. This
       hands the page short-lived credentials for Cloudflare's own TURN
       service; the API token never leaves the Worker. Unset, it says so and
       the page falls back to STUN alone. */
    if (url.pathname === "/ice") {
      const id = env.TURN_KEY_ID, token = env.TURN_KEY_API_TOKEN;
      const out = body => new Response(JSON.stringify(body), {
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      });
      if (!id || !token) return out({ turn: false, iceServers: [] });
      try {
        const r = await fetch(
          `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(id)}/credentials/generate`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ ttl: 14400 }),   // four hours; a long film fits
          },
        );
        const text = await r.text();
        if (!r.ok) return out({ turn: false, error: `turn ${r.status}`, detail: text.slice(0, 300) });
        return out({ turn: true, iceServers: normaliseIce(JSON.parse(text)) });
      } catch (e) {
        return out({ turn: false, error: "turn unreachable", detail: String(e).slice(0, 300) });
      }
    }

    /* YouTube's own search, so a song can be found by name instead of hunted
       for in another tab. The key is free and read-only; it stays on the
       Worker because a key in a page is a key anybody can spend.

       Two things narrow the results to something that will actually play:
       the Music category, and embeddable-only — an unembeddable video looks
       fine in a list and then refuses to load in the deck. If the Music
       category comes back empty the search runs again without it, because a
       lot of music is filed under nothing in particular. */
    if (url.pathname === "/youtube") {
      const out = body => new Response(JSON.stringify(body), {
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      });
      const q = (url.searchParams.get("q") || "").trim().slice(0, 120);
      if (!q) return out({ ok: true, tracks: [] });
      const key = env.YOUTUBE_API_KEY;
      if (!key) return out({ ok: false, why: "unset" });
      const ask = async (music) => {
        const bits = [
          "part=snippet", "type=video", "maxResults=8", "videoEmbeddable=true",
          music ? "videoCategoryId=10" : "",
          "q=" + encodeURIComponent(q), "key=" + encodeURIComponent(key),
        ].filter(Boolean).join("&");
        const r = await fetch("https://www.googleapis.com/youtube/v3/search?" + bits);
        return { ok: r.ok, status: r.status, text: await r.text() };
      };
      try {
        let r = await ask(true);
        if (!r.ok) return out({ ok: false, why: r.status === 403 ? "keys" : "search", detail: r.text.slice(0, 200) });
        let tracks = tidyTube(JSON.parse(r.text));
        if (!tracks.length) {
          r = await ask(false);
          if (r.ok) tracks = tidyTube(JSON.parse(r.text));
        }
        return out({ ok: true, tracks });
      } catch (e) {
        return out({ ok: false, why: "search", detail: String(e).slice(0, 200) });
      }
    }

    if (url.pathname === "/upload" || url.pathname === "/img") {
      const want = url.pathname === "/upload" ? "POST" : "GET";
      if (request.method !== want) return new Response("method not allowed", { status: 405 });
      return env.ROOM.get(env.ROOM.idFromName(roomName(url))).fetch(request);
    }

    return env.ASSETS.fetch(request);
  },
};

/* YouTube hands titles back HTML-escaped, and the page escapes again on the
   way to the screen, so an apostrophe would arrive as &#39; and stay that
   way. Undo theirs here. `&amp;` goes last or it undoes the rest twice. */
function unescapeEntities(v) {
  return String(v || "")
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

export function tidyTube(body) {
  const items = (body && body.items) || [];
  return items
    .filter((i) => i && i.id && i.id.videoId && i.snippet)
    .map((i) => {
      const th = i.snippet.thumbnails || {};
      const pic = th.medium || th.default || th.high || {};
      return {
        id: i.id.videoId,
        name: unescapeEntities(i.snippet.title).slice(0, 120),
        who: unescapeEntities(i.snippet.channelTitle).slice(0, 120),
        art: pic.url || "",
      };
    });
}
