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
    "30+20": { key: "30+20", label: "30 + 20 • Classical", initial: 1800, increment: 20 },
};

const parties = new Map();

function safeName(name) {
    const value = typeof name === "string" ? name.trim() : "";
    return value ? value.replace(/[<>]/g, "").slice(0, 24) : "Guest";
}

function normalizeCode(code) {
    return String(code || "").trim().toUpperCase();
}

function getTimeControl(key) {
    return TIME_CONTROLS[key] || TIME_CONTROLS["10+0"];
}

function createClientId() {
    return crypto.randomUUID();
}

function createPartyCode() {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code;
    do {
        code = "";
        for (let i = 0; i < 6; i++) code += alphabet[crypto.randomInt(0, alphabet.length)];
    } while (parties.has(code));
    return code;
}

function getParty(code) {
    const party = parties.get(normalizeCode(code));
    if (!party) throw new Error("Party not found.");
    return party;
}

function getParticipant(party, clientId) {
    return (clientId && party.participants.get(clientId)) || null;
}

function getPlayer(party, role) {
    for (const participant of party.participants.values()) {
        if (participant.role === role) return participant;
    }
    return null;
}

function getOpponentRole(role) { return role === "white" ? "black" : "white"; }
function roleToColor(role) { return role === "white" ? "w" : "b"; }
function colorToRole(color) { return color === "w" ? "white" : "black"; }

function countSpectators(party) {
    let count = 0;
    for (const participant of party.participants.values()) {
        if (participant.role === "spectator") count++;
    }
    return count;
}

function createClocks(timeControl) {
    return { white: timeControl.initial, black: timeControl.initial, running: false, lastTick: Date.now(), turn: "w" };
}

function updateClock(party) {
    const clocks = party.clocks;
    if (!clocks || party.timeControl.initial <= 0 || !clocks.running || party.gameOverReason) return;

    const now = Date.now();
    const elapsed = (now - clocks.lastTick) / 1000;
    if (elapsed <= 0) return;

    const role = colorToRole(party.engine.state.turn);
    clocks[role] = Math.max(0, clocks[role] - elapsed);
    clocks.lastTick = now;
    clocks.turn = party.engine.state.turn;

    if (clocks[role] <= 0) {
        setGameOver(party, "timeout", roleToColor(getOpponentRole(role)));
    }
}

function startClockIfReady(party) {
    if (party.timeControl.initial <= 0 || party.gameOverReason || !clocksCanRun(party)) return;
    party.clocks.running = true;
    party.clocks.lastTick = Date.now();
    party.clocks.turn = party.engine.state.turn;
}

function clocksCanRun(party) {
    return Boolean(party.clocks && !party.gameOverReason && getPlayer(party, "white") && getPlayer(party, "black"));
}

function applyMoveClock(party, movingRole) {
    if (party.timeControl.initial <= 0) return;
    updateClock(party);
    if (party.gameOverReason) return;
    party.clocks[movingRole] += party.timeControl.increment;
    party.clocks.turn = party.engine.state.turn;
    party.clocks.lastTick = Date.now();
    party.clocks.running = true;
}

function getClockSnapshot(party) {
    updateClock(party);
    return {
        white: Math.max(0, Number(party.clocks.white) || 0),
        black: Math.max(0, Number(party.clocks.black) || 0),
        running: Boolean(party.clocks.running),
        turn: party.engine.state.turn,
    };
}

function getEngineStatus(party) {
    return party.engine.state.status || ChessEngine.evaluateStatus(party.engine.state);
}

function setGameOver(party, reason, winner = null) {
    if (party.gameOverReason) return;
    party.gameOverReason = reason;
    party.winner = winner;
    party.clocks.running = false;
    broadcastParty(party);
}

function updateGameResult(party) {
    if (party.gameOverReason) return;
    const status = getEngineStatus(party);
    if (!status) return;
    if (status.phase === "checkmate") {
        setGameOver(party, "checkmate", party.engine.state.turn === "w" ? "b" : "w");
    } else if (status.phase === "draw") {
        setGameOver(party, "draw", null);
    }
}

function serializeParticipant(participant) {
    return { id: participant.id, name: participant.name, role: participant.role, connected: participant.connected };
}

function serializeParty(party, clientId = null) {
    updateClock(party);
    const players = { white: null, black: null };
    const spectators = [];

    for (const participant of party.participants.values()) {
        if (participant.role === "white") players.white = serializeParticipant(participant);
        if (participant.role === "black") players.black = serializeParticipant(participant);
        if (participant.role === "spectator") spectators.push(serializeParticipant(participant));
    }

    const you = getParticipant(party, clientId);
    return {
        code: party.code,
        game: party.engine.getSnapshot(),
        players,
        spectators,
        spectatorCount: spectators.length,
        maxSpectators: MAX_SPECTATORS,
        timeControl: party.timeControl,
        clocks: getClockSnapshot(party),
        gameOverReason: party.gameOverReason || null,
        winner: party.winner || null,
        you: you ? { id: you.id, name: you.name, role: you.role } : null,
    };
}

function sendSSE(res, event, data) {
    try { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); } catch { }
}

function broadcastParty(party) {
    if (!party.sseClients.size) return;
    for (const client of party.sseClients) {
        sendSSE(client.res, "party", serializeParty(party, client.id));
    }
}

function addSSEClient(party, clientId, res) {
    const client = { id: clientId, res };
    party.sseClients.add(client);
    return client;
}

function removeSSEClient(party, client) { party.sseClients.delete(client); }

function disconnectParticipant(party, clientId) {
    const participant = getParticipant(party, clientId);
    if (!participant) return;
    participant.connected = false;
    broadcastParty(party);
}

function cleanupEmptyParty(party) {
    const hasConnectedPlayer = [...party.participants.values()].some(p => p.role !== "spectator" && p.connected);
    const hasConnectedSpectator = [...party.participants.values()].some(p => p.role === "spectator" && p.connected);
    if (!hasConnectedPlayer && !hasConnectedSpectator && party.sseClients.size === 0) parties.delete(party.code);
}

app.post("/api/party/create", (req, res) => {
    try {
        const name = safeName(req.body?.name);
        const timeControl = getTimeControl(req.body?.timeControl);
        const code = createPartyCode();
        const clientId = createClientId();
        const engine = new ChessEngine();

        const party = {
            code, engine, timeControl,
            clocks: createClocks(timeControl),
            gameOverReason: null, winner: null,
            participants: new Map(), sseClients: new Set(),
        };

        party.participants.set(clientId, { id: clientId, name, role: "white", connected: true });
        parties.set(code, party);
        res.json({ ok: true, party: serializeParty(party, clientId) });
    } catch (error) {
        res.status(400).json({ ok: false, error: error.message || "Unable to create party." });
    }
});

app.post("/api/party/join", (req, res) => {
    try {
        const code = normalizeCode(req.body?.partyCode);
        const name = safeName(req.body?.name);
        const party = getParty(code);
        let clientId = String(req.body?.clientId || "").trim();
        let participant = getParticipant(party, clientId);

        if (participant) {
            participant.name = name;
            participant.connected = true;
        } else {
            clientId = createClientId();
            let role = "spectator";
            if (!getPlayer(party, "white")) role = "white";
            else if (!getPlayer(party, "black")) role = "black";
            else if (countSpectators(party) >= MAX_SPECTATORS) return res.status(403).json({ ok: false, error: "Spectator limit reached." });

            participant = { id: clientId, name, role, connected: true };
            party.participants.set(clientId, participant);
        }

        startClockIfReady(party);
        broadcastParty(party);
        res.json({ ok: true, party: serializeParty(party, clientId) });
    } catch (error) {
        res.status(400).json({ ok: false, error: error.message || "Unable to join party." });
    }
});

app.post("/api/party/move", (req, res) => {
    try {
        const { partyCode, clientId, from, to, promotion } = req.body || {};
        const party = getParty(partyCode);
        const participant = getParticipant(party, clientId);

        if (!participant) return res.status(403).json({ ok: false, error: "Player session not found." });
        if (participant.role !== "white" && participant.role !== "black") return res.status(403).json({ ok: false, error: "Spectators cannot make moves." });
        if (party.gameOverReason) return res.status(400).json({ ok: false, error: "Game is already over.", party: serializeParty(party, clientId) });
        
        const playerColor = roleToColor(participant.role);
        if (party.engine.state.turn !== playerColor) return res.status(400).json({ ok: false, error: "It is not your turn." });
        
        updateClock(party);
        if (party.gameOverReason) return res.status(400).json({ ok: false, error: "Time has expired.", party: serializeParty(party, clientId) });

        const result = party.engine.makeMove({ from, to, promotion: promotion || null });
        if (!result?.ok) return res.status(400).json({ ok: false, error: result?.error || "Illegal move." });

        applyMoveClock(party, participant.role);
        updateGameResult(party);
        broadcastParty(party);
        res.json({ ok: true, party: serializeParty(party, clientId) });
    } catch (error) {
        res.status(400).json({ ok: false, error: error.message || "Move failed." });
    }
});

app.get("/api/party/events", (req, res) => {
    try {
        const partyCode = normalizeCode(req.query?.partyCode);
        const clientId = String(req.query?.clientId || "").trim();
        const party = getParty(partyCode);
        const participant = getParticipant(party, clientId);

        if (!participant) return res.status(403).end();

        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache, no-transform");
        res.setHeader("Connection", "keep-alive");
        res.setHeader("X-Accel-Buffering", "no");
        if (typeof res.flushHeaders === "function") res.flushHeaders();

        const client = addSSEClient(party, clientId, res);
        participant.connected = true;
        sendSSE(res, "party", serializeParty(party, clientId));
        broadcastParty(party);

        const heartbeat = setInterval(() => {
            try { res.write(": ping\n\n"); } catch { clearInterval(heartbeat); }
        }, 15000);

        req.on("close", () => {
            clearInterval(heartbeat);
            removeSSEClient(party, client);
            disconnectParticipant(party, clientId);
            cleanupEmptyParty(party);
        });
    } catch {
        res.status(404).end();
    }
});

app.post("/api/party/leave", (req, res) => {
    try {
        const party = getParty(req.body?.partyCode);
        const clientId = String(req.body?.clientId || "").trim();
        const participant = getParticipant(party, clientId);

        if (!participant) return res.json({ ok: true });
        
        if (participant.role === "spectator") {
            party.participants.delete(clientId);
        } else {
            participant.connected = false;
        }

        broadcastParty(party);
        cleanupEmptyParty(party);
        res.json({ ok: true });
    } catch (error) {
        res.status(400).json({ ok: false, error: error.message || "Unable to leave party." });
    }
});

const clockTimer = setInterval(() => {
    for (const party of parties.values()) {
        if (party.timeControl.initial <= 0 || !party.clocks.running || party.gameOverReason) continue;
        const beforeWhite = party.clocks.white;
        const beforeBlack = party.clocks.black;
        updateClock(party);
        if (beforeWhite !== party.clocks.white || beforeBlack !== party.clocks.black) {
            broadcastParty(party);
        }
    }
}, 1000);

function shutdown() {
    clearInterval(clockTimer);
    for (const party of parties.values()) {
        for (const client of party.sseClients) { try { client.res.end(); } catch {} }
        party.sseClients.clear();
    }
    parties.clear();
    process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

app.get("*", (req, res) => res.sendFile(path.join(PUBLIC_DIR, "index.html")));

app.listen(PORT, "0.0.0.0", () => {
    console.log(`Chess server running on port ${PORT}`);
});

