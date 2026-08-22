import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { ChessEngine } from "./shared/chess-engine.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.join(__dirname, "public");
const SHARED_DIR = path.join(__dirname, "shared");
const PORT = Number(process.env.PORT || 3015);

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "32kb" }));
app.use(express.static(PUBLIC_DIR, { extensions: ["html"], maxAge: "1h" }));
app.use("/shared", express.static(SHARED_DIR, { maxAge: "1h" }));

const MAX_SPECTATORS = 20;
const MAX_CHAT = 100;

const TIME_CONTROLS = {
  none: { key: "none", label: "Без часов", initial: 0, increment: 0 },
  "1+0": { key: "1+0", label: "1 + 0 • Bullet", initial: 60, increment: 0 },
  "3+0": { key: "3+0", label: "3 + 0 • Blitz", initial: 180, increment: 0 },
  "3+2": { key: "3+2", label: "3 + 2 • Blitz", initial: 180, increment: 2 },
  "5+0": { key: "5+0", label: "5 + 0 • Blitz", initial: 300, increment: 0 },
  "5+3": { key: "5+3", label: "5 + 3 • Blitz", initial: 300, increment: 3 },
  "10+0": { key: "10+0", label: "10 + 0 • Rapid", initial: 600, increment: 0 },
  "15+10": { key: "15+10", label: "15 + 10 • Rapid", initial: 900, increment: 10 },
  "30+0": { key: "30+0", label: "30 + 0 • Classical", initial: 1800, increment: 0 },
  "30+20": { key: "30+20", label: "30 + 20 • Classical", initial: 1800, increment: 20 }
};

const parties = new Map();

const safeName = (value) => {
  const name = String(value ?? "").trim().replace(/[<>]/g, "").slice(0, 24);
  return name || "Guest";
};

const normalizeCode = (value) => String(value ?? "").trim().toUpperCase();

const clientId = () => crypto.randomUUID();

function partyCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code;
  do {
    code = Array.from({ length: 6 }, () =>
      alphabet[crypto.randomInt(0, alphabet.length)]
    ).join("");
  } while (parties.has(code));
  return code;
}

function getParty(code) {
  const party = parties.get(normalizeCode(code));
  if (!party) throw new Error("Комната не найдена.");
  return party;
}

function participant(party, id) {
  return party.participants.get(String(id || "")) || null;
}

function player(party, role) {
  for (const p of party.participants.values()) {
    if (p.role === role) return p;
  }
  return null;
}

function roleColor(role) {
  return role === "white" ? "w" : "b";
}

function colorRole(color) {
  return color === "w" ? "white" : "black";
}

function makeClocks(tc) {
  return {
    white: tc.initial,
    black: tc.initial,
    running: false,
    lastTick: Date.now()
  };
}

function updateClock(party) {
  if (!party.clocks.running || !party.timeControl.initial || party.gameOverReason) return;

  const now = Date.now();
  const elapsed = Math.max(0, (now - party.clocks.lastTick) / 1000);
  const side = colorRole(party.engine.state.turn);

  party.clocks[side] = Math.max(0, party.clocks[side] - elapsed);
  party.clocks.lastTick = now;

  if (party.clocks[side] <= 0) {
    party.clocks.running = false;
    party.gameOverReason = "timeout";
    party.winner = side === "w" ? "b" : "w";
  }
}

function startClockIfReady(party) {
  if (!party.timeControl.initial || party.gameOverReason) return;
  if (!player(party, "white") || !player(party, "black")) return;

  party.clocks.running = true;
  party.clocks.lastTick = Date.now();
}

function applyMoveClock(party, movingRole) {
  if (!party.timeControl.initial || party.gameOverReason) return;

  updateClock(party);
  if (party.gameOverReason) return;

  party.clocks[movingRole] += party.timeControl.increment;
  party.clocks.lastTick = Date.now();
  party.clocks.running = true;
}

function resetGame(party) {
  party.engine = new ChessEngine();
  party.clocks = makeClocks(party.timeControl);
  party.gameOverReason = null;
  party.winner = null;
  party.drawOffer = null;
  party.gameNumber += 1;
  startClockIfReady(party);
}

function serializeParticipant(p) {
  return {
    id: p.id,
    name: p.name,
    role: p.role,
    connected: Boolean(p.connected)
  };
}

function serializeParty(party, me = null) {
  updateClock(party);

  const players = { white: null, black: null };
  const spectators = [];

  for (const p of party.participants.values()) {
    if (p.role === "white") players.white = serializeParticipant(p);
    else if (p.role === "black") players.black = serializeParticipant(p);
    else spectators.push(serializeParticipant(p));
  }

  const you = participant(party, me);

  return {
    code: party.code,
    gameNumber: party.gameNumber,
    game: party.engine.getSnapshot(),
    players,
    spectators,
    spectatorCount: spectators.length,
    maxSpectators: MAX_SPECTATORS,
    timeControl: party.timeControl,
    clocks: {
      white: Math.max(0, party.clocks.white),
      black: Math.max(0, party.clocks.black),
      running: Boolean(party.clocks.running),
      turn: party.engine.state.turn
    },
    gameOverReason: party.gameOverReason || null,
    winner: party.winner || null,
    drawOffer: party.drawOffer
      ? { from: party.drawOffer.from, name: party.drawOffer.name }
      : null,
    chat: party.chat.slice(-MAX_CHAT),
    you: you ? { id: you.id, name: you.name, role: you.role } : null
  };
}

function send(res, event, data) {
  try {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  } catch {}
}

function broadcast(party) {
  for (const c of party.sse) {
    send(c.res, "party", serializeParty(party, c.id));
  }
}

function createParty(name, timeControl) {
  const tc = TIME_CONTROLS[timeControl] || TIME_CONTROLS["10+0"];
  const code = partyCode();
  const id = clientId();

  const party = {
    code,
    engine: new ChessEngine(),
    timeControl: tc,
    clocks: makeClocks(tc),
    gameOverReason: null,
    winner: null,
    drawOffer: null,
    gameNumber: 1,
    participants: new Map(),
    sse: new Set(),
    chat: []
  };

  party.participants.set(id, {
    id,
    name: safeName(name),
    role: "white",
    connected: true
  });

  parties.set(code, party);
  return { party, id };
}

function cleanup(party) {
  const active = [...party.participants.values()].some(p => p.connected);
  if (!active && party.sse.size === 0) parties.delete(party.code);
}

app.post("/api/party/create", (req, res) => {
  try {
    const { party, id } = createParty(req.body?.name, req.body?.timeControl);
    res.json({ ok: true, party: serializeParty(party, id) });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

app.post("/api/party/join", (req, res) => {
  try {
    const code = normalizeCode(req.body?.partyCode);
    const party = getParty(code);
    const name = safeName(req.body?.name);
    let id = String(req.body?.clientId || "").trim();
    let p = participant(party, id);

    if (p) {
      p.name = name;
      p.connected = true;
    } else {
      id = clientId();
      let role = "spectator";
      if (!player(party, "white")) role = "white";
      else if (!player(party, "black")) role = "black";
      else if (party.participants.size >= MAX_SPECTATORS + 2) {
        return res.status(403).json({ ok: false, error: "Лимит зрителей достигнут." });
      }

      p = { id, name, role, connected: true };
      party.participants.set(id, p);
    }

    startClockIfReady(party);
    broadcast(party);
    res.json({ ok: true, party: serializeParty(party, id) });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

app.post("/api/party/move", (req, res) => {
  try {
    const party = getParty(req.body?.partyCode);
    const p = participant(party, req.body?.clientId);

    if (!p || !["white", "black"].includes(p.role)) {
      return res.status(403).json({ ok: false, error: "Вы не игрок этой партии." });
    }

    updateClock(party);
    if (party.gameOverReason) {
      return res.status(400).json({
        ok: false,
        error: "Игра уже завершена.",
        party: serializeParty(party, p.id)
      });
    }

    const color = roleColor(p.role);
    if (party.engine.state.turn !== color) {
      return res.status(400).json({ ok: false, error: "Сейчас ход соперника." });
    }

    const result = party.engine.makeMove({
      from: req.body?.from,
      to: req.body?.to,
      promotion: req.body?.promotion || "q"
    });

    if (!result.ok) {
      return res.status(400).json({ ok: false, error: result.error });
    }

    applyMoveClock(party, p.role);

    const status = party.engine.getStatus();
    if (status.phase === "checkmate") {
      party.gameOverReason = "checkmate";
      party.winner = party.engine.state.turn === "w" ? "b" : "w";
      party.clocks.running = false;
    } else if (status.phase === "draw") {
      party.gameOverReason = "draw";
      party.winner = null;
      party.clocks.running = false;
    }

    party.drawOffer = null;
    broadcast(party);
    res.json({ ok: true, party: serializeParty(party, p.id) });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

app.post("/api/party/rematch", (req, res) => {
  try {
    const party = getParty(req.body?.partyCode);
    const p = participant(party, req.body?.clientId);
    if (!p) return res.status(403).json({ ok: false, error: "Сессия не найдена." });

    resetGame(party);
    broadcast(party);
    res.json({ ok: true, party: serializeParty(party, p.id) });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

app.post("/api/party/resign", (req, res) => {
  try {
    const party = getParty(req.body?.partyCode);
    const p = participant(party, req.body?.clientId);
    if (!p || !["white", "black"].includes(p.role)) {
      return res.status(403).json({ ok: false, error: "Вы не игрок." });
    }
    if (party.gameOverReason) return res.json({ ok: true, party: serializeParty(party, p.id) });

    party.gameOverReason = "resign";
    party.winner = roleColor(p.role) === "w" ? "b" : "w";
    party.clocks.running = false;
    party.drawOffer = null;
    broadcast(party);
    res.json({ ok: true, party: serializeParty(party, p.id) });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

app.post("/api/party/draw", (req, res) => {
  try {
    const party = getParty(req.body?.partyCode);
    const p = participant(party, req.body?.clientId);
    if (!p || !["white", "black"].includes(p.role)) {
      return res.status(403).json({ ok: false, error: "Вы не игрок." });
    }
    if (party.gameOverReason) return res.json({ ok: true, party: serializeParty(party, p.id) });

    if (party.drawOffer && party.drawOffer.from !== p.id) {
      party.gameOverReason = "draw";
      party.winner = null;
      party.drawOffer = null;
      party.clocks.running = false;
    } else {
      party.drawOffer = { from: p.id, name: p.name };
    }

    broadcast(party);
    res.json({ ok: true, party: serializeParty(party, p.id) });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

app.post("/api/party/chat", (req, res) => {
  try {
    const party = getParty(req.body?.partyCode);
    const p = participant(party, req.body?.clientId);
    if (!p) return res.status(403).json({ ok: false, error: "Сессия не найдена." });

    const text = String(req.body?.text ?? "").trim().replace(/[<>]/g, "").slice(0, 300);
    if (!text) return res.status(400).json({ ok: false, error: "Пустое сообщение." });

    party.chat.push({
      id: crypto.randomUUID(),
      name: p.name,
      text,
      at: Date.now()
    });
    if (party.chat.length > MAX_CHAT) party.chat.splice(0, party.chat.length - MAX_CHAT);

    broadcast(party);
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

app.get("/api/party/events", (req, res) => {
  try {
    const party = getParty(req.query?.partyCode);
    const id = String(req.query?.clientId || "").trim();
    if (!participant(party, id)) return res.status(403).end();

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();

    const client = { id, res };
    party.sse.add(client);
    participant(party, id).connected = true;

    send(res, "party", serializeParty(party, id));
    broadcast(party);

    const heartbeat = setInterval(() => {
      try { res.write(": ping\n\n"); } catch { clearInterval(heartbeat); }
    }, 15000);

    req.on("close", () => {
      clearInterval(heartbeat);
      party.sse.delete(client);
      const p = participant(party, id);
      if (p) p.connected = false;
      broadcast(party);
      cleanup(party);
    });
  } catch {
    res.status(404).end();
  }
});

app.post("/api/party/leave", (req, res) => {
  try {
    const party = getParty(req.body?.partyCode);
    const p = participant(party, req.body?.clientId);
    if (p) {
      if (p.role === "spectator") party.participants.delete(p.id);
      else p.connected = false;
    }
    broadcast(party);
    cleanup(party);
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

setInterval(() => {
  for (const party of parties.values()) {
    const before = party.gameOverReason;
    updateClock(party);
    if (!before && party.gameOverReason) broadcast(party);
  }
}, 250);

app.get("*", (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Chess Party running on port ${PORT}`);
});

