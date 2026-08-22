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

const MAX_SPECTATORS = 20;
const MAX_CHAT_MESSAGES = 100;
const MAX_CHAT_LENGTH = 300;

const parties = new Map();

const TIME_CONTROLS = {
    none: {
        key: "none",
        label: "Без часов",
        initial: 0,
        increment: 0,
    },

    "1+0": {
        key: "1+0",
        label: "1 + 0 • Bullet",
        initial: 60,
        increment: 0,
    },

    "3+0": {
        key: "3+0",
        label: "3 + 0 • Blitz",
        initial: 180,
        increment: 0,
    },

    "3+2": {
        key: "3+2",
        label: "3 + 2 • Blitz",
        initial: 180,
        increment: 2,
    },

    "5+0": {
        key: "5+0",
        label: "5 + 0 • Blitz",
        initial: 300,
        increment: 0,
    },

    "5+3": {
        key: "5+3",
        label: "5 + 3 • Blitz",
        initial: 300,
        increment: 3,
    },

    "10+0": {
        key: "10+0",
        label: "10 + 0 • Rapid",
        initial: 600,
        increment: 0,
    },

    "15+10": {
        key: "15+10",
        label: "15 + 10 • Rapid",
        initial: 900,
        increment: 10,
    },

    "30+0": {
        key: "30+0",
        label: "30 + 0 • Classical",
        initial: 1800,
        increment: 0,
    },

    "30+20": {
        key: "30+20",
        label: "30 + 20 • Classical",
        initial: 1800,
        increment: 20,
    },
};

/* =========================================================
   HELPERS
========================================================= */

function safeName(name) {
    const value = typeof name === "string"
        ? name.trim()
        : "";

    if (!value) {
        return "Guest";
    }

    return value
        .replace(/[<>]/g, "")
        .slice(0, 24);
}

function safeChatMessage(message) {
    if (typeof message !== "string") {
        return "";
    }

    return message
        .trim()
        .replace(/\s+/g, " ")
        .replace(/[<>]/g, "")
        .slice(0, MAX_CHAT_LENGTH);
}

function getTimeControl(key) {
    return TIME_CONTROLS[key] || TIME_CONTROLS["10+0"];
}

function generatePartyCode() {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    let code;

    do {
        code = Array.from(
            { length: 6 },
            () => alphabet[Math.floor(Math.random() * alphabet.length)]
        ).join("");
    } while (parties.has(code));

    return code;
}

function ensureParty(code) {
    const normalized = String(code || "")
        .trim()
        .toUpperCase();

    const party = parties.get(normalized);

    if (!party) {
        throw new Error("Party not found.");
    }

    return party;
}

function getPlayerByRole(party, role) {
    for (const participant of party.participants.values()) {
        if (participant.role === role) {
            return participant;
        }
    }

    return null;
}

function countSpectators(party) {
    let count = 0;

    for (const participant of party.participants.values()) {
        if (participant.role === "spectator") {
            count++;
        }
    }

    return count;
}

function getOpponentRole(role) {
    return role === "white" ? "black" : "white";
}

function roleToColor(role) {
    return role === "white" ? "w" : "b";
}

function colorToRole(color) {
    return color === "w" ? "white" : "black";
}

/* =========================================================
   CLOCKS
========================================================= */

function createClocks(timeControl) {
    return {
        white: timeControl.initial,
        black: timeControl.initial,
        running: false,
        lastTick: Date.now(),
    };
}

function updateClock(party) {
    const clocks = party.clocks;

    if (!clocks) {
        return;
    }

    if (
        party.timeControl.initial <= 0 ||
        party.gameOverReason ||
        !clocks.running
    ) {
        return;
    }

    const now = Date.now();

    const elapsed = (now - clocks.lastTick) / 1000;

    if (elapsed <= 0) {
        return;
    }

    const turnRole = colorToRole(party.engine.state.turn);

    clocks[turnRole] = Math.max(
        0,
        clocks[turnRole] - elapsed
    );

    clocks.lastTick = now;

    if (clocks[turnRole] <= 0) {
        const winnerRole = getOpponentRole(turnRole);
        const winner = roleToColor(winnerRole);

        setGameOver(
            party,
            "timeout",
            winner
        );
    }
}

function switchClockAfterMove(party, movingRole) {
    if (party.timeControl.initial <= 0) {
        return;
    }

    const clocks = party.clocks;
    const now = Date.now();

    if (clocks.running) {
        const elapsed = (now - clocks.lastTick) / 1000;

        clocks[movingRole] = Math.max(
            0,
            clocks[movingRole] - elapsed
        );
    }

    clocks[movingRole] += party.timeControl.increment;

    clocks.lastTick = now;

    if (!party.gameOverReason) {
        clocks.running = true;
    }
}

function startClockIfReady(party) {
    if (
        party.timeControl.initial <= 0 ||
        party.gameOverReason
    ) {
        return;
    }

    const white = getPlayerByRole(party, "white");
    const black = getPlayerByRole(party, "black");

    if (white && black) {
        party.clocks.running = true;
        party.clocks.lastTick = Date.now();
    }
}

function getClockSnapshot(party) {
    updateClock(party);

    return {
        white: Math.max(0, party.clocks.white),
        black: Math.max(0, party.clocks.black),
        running: party.clocks.running,
        turn: party.engine.state.turn,
    };
}

/* =========================================================
   GAME STATE
========================================================= */

function setGameOver(party, reason, winner = null) {
    party.gameOverReason = reason;
    party.winner = winner;
    party.drawOffer = null;

    if (party.clocks) {
        updateClock(party);
        party.clocks.running = false;
    }
}

function resetGame(party) {
    party.engine = new ChessEngine();

    party.drawOffer = null;

    party.gameOverReason = null;
    party.winner = null;

    party.rematch.white = false;
    party.rematch.black = false;

    party.clocks = createClocks(
        party.timeControl
    );

    startClockIfReady(party);
}

/* =========================================================
   PARTICIPANTS
========================================================= */

function getOrCreateParticipant(
    party,
    name,
    clientId = null
) {
    if (
        clientId &&
        party.participants.has(clientId)
    ) {
        const existing =
            party.participants.get(clientId);

        if (name) {
            existing.name = safeName(name);
        }

        return existing;
    }

    const participant = {
        id: clientId || crypto.randomUUID(),
        name: safeName(name),
        role: "spectator",
        connected: false,
        stream: null,
    };

    const hasWhite = Boolean(
        getPlayerByRole(party, "white")
    );

    const hasBlack = Boolean(
        getPlayerByRole(party, "black")
    );

    if (!hasWhite) {
        participant.role = "white";
    } else if (!hasBlack) {
        participant.role = "black";
    } else {
        if (
            countSpectators(party) >=
            MAX_SPECTATORS
        ) {
            throw new Error(
                `Party is full. Maximum ${MAX_SPECTATORS} spectators.`
            );
        }

        participant.role = "spectator";
    }

    party.participants.set(
        participant.id,
        participant
    );

    startClockIfReady(party);

    return participant;
}

function ensureParticipant(
    party,
    clientId
) {
    const participant =
        party.participants.get(clientId);

    if (!participant) {
        throw new Error(
            "You are not part of this party."
        );
    }

    return participant;
}

function ensurePlayer(
    party,
    clientId
) {
    const participant =
        ensureParticipant(
            party,
            clientId
        );

    if (
        participant.role !== "white" &&
        participant.role !== "black"
    ) {
        throw new Error(
            "Spectators cannot perform this action."
        );
    }

    return participant;
}

function ensurePlayerTurn(
    party,
    clientId
) {
    const participant =
        ensurePlayer(
            party,
            clientId
        );

    updateClock(party);

    if (party.gameOverReason) {
        throw new Error(
            "The game is already over."
        );
    }

    const expectedRole =
        party.engine.state.turn === "w"
            ? "white"
            : "black";

    if (
        participant.role !==
        expectedRole
    ) {
        throw new Error(
            "It is not your turn."
        );
    }

    return participant;
}

/* =========================================================
   SERIALIZATION
========================================================= */

function serializeParty(
    party,
    viewerId = null
) {
    updateClock(party);

    const participants =
        Array.from(
            party.participants.values()
        );

    const white =
        participants.find(
            p => p.role === "white"
        ) || null;

    const black =
        participants.find(
            p => p.role === "black"
        ) || null;

    const spectators =
        participants
            .filter(
                p => p.role === "spectator"
            )
            .map(p => ({
                id: p.id,
                name: p.name,
                connected: p.connected,
            }));

    const you =
        viewerId
            ? party.participants.get(viewerId) || null
            : null;

    return {
        code: party.code,

        players: {
            white: white
                ? {
                    id: white.id,
                    name: white.name,
                    connected: white.connected,
                }
                : null,

            black: black
                ? {
                    id: black.id,
                    name: black.name,
                    connected: black.connected,
                }
                : null,
        },

        spectators,

        limits: {
            players: 2,
            spectators: MAX_SPECTATORS,
        },

        you: you
            ? {
                id: you.id,
                name: you.name,
                role: you.role,
                connected: you.connected,
            }
            : null,

        game: party.engine.getSnapshot(),

        timeControl: {
            key: party.timeControl.key,
            label: party.timeControl.label,
            initial: party.timeControl.initial,
            increment: party.timeControl.increment,
        },

        clocks: getClockSnapshot(party),

        drawOffer: party.drawOffer
            ? {
                by: party.drawOffer.by,
                name: party.drawOffer.name,
                role: party.drawOffer.role,
            }
            : null,

        rematch: {
            white: Boolean(
                party.rematch.white
            ),
            black: Boolean(
                party.rematch.black
            ),
        },

        gameOverReason:
            party.gameOverReason || null,

        winner:
            party.winner || null,

        chat:
            party.chat.slice(
                -MAX_CHAT_MESSAGES
            ),
    };
}

/* =========================================================
   SSE
========================================================= */

function writeSseEvent(
    res,
    eventName,
    payload
) {
    try {
        if (res.writableEnded) {
            return;
        }

        res.write(
            `event: ${eventName}\n`
        );

        res.write(
            `data: ${JSON.stringify(payload)}\n\n`
        );
    } catch {
        // Client disconnected.
    }
}

function broadcastParty(party) {
    for (
        const participant
        of party.participants.values()
    ) {
        if (!participant.stream) {
            continue;
        }

        writeSseEvent(
            participant.stream,
            "party",
            serializeParty(
                party,
                participant.id
            )
        );
    }
}

function broadcastChat(
    party,
    message
) {
    for (
        const participant
        of party.participants.values()
    ) {
        if (!participant.stream) {
            continue;
        }

        writeSseEvent(
            participant.stream,
            "chat",
            message
        );
    }
}

/* =========================================================
   EXPRESS
========================================================= */

const app = express();

app.disable("x-powered-by");

app.use(
    express.json({
        limit: "1mb",
    })
);

app.use(
    express.static(
        PUBLIC_DIR
    )
);

app.use(
    "/shared",
    express.static(
        SHARED_DIR
    )
);

/* =========================================================
   PARTY EVENTS
========================================================= */

app.get(
    "/api/party/events",
    (req, res) => {
        try {
            const party =
                ensureParty(
                    req.query.partyCode
                );

            const clientId =
                String(
                    req.query.clientId || ""
                );

            const participant =
                party.participants.get(
                    clientId
                );

            if (!participant) {
                return res
                    .status(404)
                    .json({
                        ok: false,
                        error:
                            "Participant not found.",
                    });
            }

            res.writeHead(
                200,
                {
                    "Content-Type":
                        "text/event-stream; charset=utf-8",

                    "Cache-Control":
                        "no-cache, no-transform",

                    Connection:
                        "keep-alive",

                    "X-Accel-Buffering":
                        "no",
                }
            );

            participant.connected = true;
            participant.stream = res;

            writeSseEvent(
                res,
                "party",
                serializeParty(
                    party,
                    participant.id
                )
            );

            req.on(
                "close",
                () => {
                    participant.connected =
                        false;

                    participant.stream =
                        null;

                    broadcastParty(
                        party
                    );
                }
            );

            broadcastParty(party);
        } catch (err) {
            if (!res.headersSent) {
                res.status(400).json({
                    ok: false,
                    error: err.message,
                });
            }
        }
    }
);

/* =========================================================
   CREATE
========================================================= */

app.post(
    "/api/party/create",
    (req, res) => {
        try {
            const code =
                generatePartyCode();

            const timeControl =
                getTimeControl(
                    req.body?.timeControl
                );

            const party = {
                code,

                engine:
                    new ChessEngine(),

                participants:
                    new Map(),

                createdAt:
                    Date.now(),

                timeControl,

                clocks:
                    createClocks(
                        timeControl
                    ),

                drawOffer:
                    null,

                rematch: {
                    white: false,
                    black: false,
                },

                gameOverReason:
                    null,

                winner:
                    null,

                chat: [],
            };

            const participant =
                getOrCreateParticipant(
                    party,
                    req.body?.name,
                    req.body?.clientId ||
                        null
                );

            parties.set(
                code,
                party
            );

            res.json({
                ok: true,

                clientId:
                    participant.id,

                party:
                    serializeParty(
                        party,
                        participant.id
                    ),
            });
        } catch (err) {
            res.status(400).json({
                ok: false,
                error: err.message,
            });
        }
    }
);

/* =========================================================
   JOIN
========================================================= */

app.post(
    "/api/party/join",
    (req, res) => {
        try {
            const party =
                ensureParty(
                    req.body?.partyCode
                );

            const participant =
                getOrCreateParticipant(
                    party,
                    req.body?.name,
                    req.body?.clientId ||
                        null
                );

            startClockIfReady(
                party
            );

            broadcastParty(
                party
            );

            res.json({
                ok: true,

                clientId:
                    participant.id,

                party:
                    serializeParty(
                        party,
                        participant.id
                    ),
            });
        } catch (err) {
            res.status(400).json({
                ok: false,
                error: err.message,
            });
        }
    }
);

/* =========================================================
   MOVE
========================================================= */

app.post(
    "/api/party/move",
    (req, res) => {
        try {
            const party =
                ensureParty(
                    req.body?.partyCode
                );

            const participant =
                ensurePlayerTurn(
                    party,
                    req.body?.clientId
                );

            const movingRole =
                participant.role;

            const result =
                party.engine.makeMove({
                    from: req.body?.from,
                    to: req.body?.to,
                    promotion:
                        req.body?.promotion ||
                        null,
                });

            if (!result.ok) {
                return res.status(400).json({
                    ok: false,
                    error:
                        result.error ||
                        "Illegal move.",

                    party:
                        serializeParty(
                            party,
                            req.body?.clientId
                        ),
                });
            }

            party.drawOffer = null;

            switchClockAfterMove(
                party,
                movingRole
            );

            const status =
                party.engine.state.status;

            if (
                status?.phase ===
                "checkmate"
            ) {
                setGameOver(
                    party,
                    "checkmate",
                    status.winner
                );
            } else if (
                status?.phase ===
                "draw"
            ) {
                setGameOver(
                    party,
                    "draw",
                    null
                );
            }

            broadcastParty(
                party
            );

            res.json({
                ok: true,

                party:
                    serializeParty(
                        party,
                        req.body?.clientId
                    ),
            });
        } catch (err) {
            res.status(400).json({
                ok: false,
                error: err.message,
            });
        }
    }
);

/* =========================================================
   RESIGN
========================================================= */

app.post(
    "/api/party/resign",
    (req, res) => {
        try {
            const party =
                ensureParty(
                    req.body?.partyCode
                );

            const participant =
                ensurePlayer(
                    party,
                    req.body?.clientId
                );

            if (party.gameOverReason) {
                return res.status(400).json({
                    ok: false,
                    error:
                        "The game is already over.",

                    party:
                        serializeParty(
                            party,
                            req.body?.clientId
                        ),
                });
            }

            const winner =
                roleToColor(
                    getOpponentRole(
                        participant.role
                    )
                );

            setGameOver(
                party,
                "resignation",
                winner
            );

            broadcastParty(
                party
            );

            res.json({
                ok: true,

                party:
                    serializeParty(
                        party,
                        req.body?.clientId
                    ),
            });
        } catch (err) {
            res.status(400).json({
                ok: false,
                error: err.message,
            });
        }
    }
);

/* =========================================================
   DRAW OFFER
========================================================= */

app.post(
    "/api/party/draw-offer",
    (req, res) => {
        try {
            const party =
                ensureParty(
                    req.body?.partyCode
                );

            const participant =
                ensurePlayer(
                    party,
                    req.body?.clientId
                );

            if (party.gameOverReason) {
                return res.status(400).json({
                    ok: false,
                    error:
                        "The game is already over.",
                });
            }

            if (party.drawOffer) {
                return res.status(400).json({
                    ok: false,
                    error:
                        "A draw offer is already pending.",
                });
            }

            party.drawOffer = {
                by:
                    participant.id,

                name:
                    participant.name,

                role:
                    participant.role,
            };

            broadcastParty(
                party
            );

            res.json({
                ok: true,

                party:
                    serializeParty(
                        party,
                        participant.id
                    ),
            });
        } catch (err) {
            res.status(400).json({
                ok: false,
                error: err.message,
            });
        }
    }
);

/* =========================================================
   DRAW RESPONSE
========================================================= */

app.post(
    "/api/party/draw-response",
    (req, res) => {
        try {
            const party =
                ensureParty(
                    req.body?.partyCode
                );

            const participant =
                ensurePlayer(
                    party,
                    req.body?.clientId
                );

            if (!party.drawOffer) {
                return res.status(400).json({
                    ok: false,
                    error:
                        "There is no draw offer.",
                });
            }

            if (
                party.drawOffer.by ===
                participant.id
            ) {
                return res.status(400).json({
                    ok: false,
                    error:
                        "You cannot respond to your own draw offer.",
                });
            }

            if (
                req.body?.accept === true
            ) {
                setGameOver(
                    party,
                    "agreement",
                    null
                );
            } else {
                party.drawOffer = null;
            }

            broadcastParty(
                party
            );

            res.json({
                ok: true,

                party:
                    serializeParty(
                        party,
                        participant.id
                    ),
            });
        } catch (err) {
            res.status(400).json({
                ok: false,
                error: err.message,
            });
        }
    }
);

/* =========================================================
   REMATCH
========================================================= */

app.post(
    "/api/party/rematch",
    (req, res) => {
        try {
            const party =
                ensureParty(
                    req.body?.partyCode
                );

            const participant =
                ensurePlayer(
                    party,
                    req.body?.clientId
                );

            if (!party.gameOverReason) {
                return res.status(400).json({
                    ok: false,
                    error:
                        "The game is still running.",
                });
            }

            party.rematch[
                participant.role
            ] = true;

            if (
                party.rematch.white &&
                party.rematch.black
            ) {
                resetGame(party);
            }

            broadcastParty(
                party
            );

            res.json({
                ok: true,

                party:
                    serializeParty(
                        party,
                        participant.id
                    ),
            });
        } catch (err) {
            res.status(400).json({
                ok: false,
                error: err.message,
            });
        }
    }
);

/* =========================================================
   NEW GAME
========================================================= */

app.post(
    "/api/party/new-game",
    (req, res) => {
        try {
            const party =
                ensureParty(
                    req.body?.partyCode
                );

            ensurePlayer(
                party,
                req.body?.clientId
            );

            resetGame(party);

            broadcastParty(
                party
            );

            res.json({
                ok: true,

                party:
                    serializeParty(
                        party,
                        req.body?.clientId
                    ),
            });
        } catch (err) {
            res.status(400).json({
                ok: false,
                error: err.message,
            });
        }
    }
);

/* =========================================================
   CHAT
========================================================= */

app.post(
    "/api/party/chat",
    (req, res) => {
        try {
            const party =
                ensureParty(
                    req.body?.partyCode
                );

            const participant =
                ensureParticipant(
                    party,
                    req.body?.clientId
                );

            const text =
                safeChatMessage(
                    req.body?.message
                );

            if (!text) {
                return res.status(400).json({
                    ok: false,
                    error:
                        "Message cannot be empty.",
                });
            }

            const message = {
                id:
                    crypto.randomUUID(),

                participantId:
                    participant.id,

                name:
                    participant.name,

                role:
                    participant.role,

                text,

                time:
                    Date.now(),
            };

            party.chat.push(
                message
            );

            if (
                party.chat.length >
                MAX_CHAT_MESSAGES
            ) {
                party.chat =
                    party.chat.slice(
                        -MAX_CHAT_MESSAGES
                    );
            }

            broadcastChat(
                party,
                message
            );

            res.json({
                ok: true,
                message,
            });
        } catch (err) {
            res.status(400).json({
                ok: false,
                error: err.message,
            });
        }
    }
);

/* =========================================================
   LEAVE
========================================================= */

app.post(
    "/api/party/leave",
    (req, res) => {
        try {
            const party =
                ensureParty(
                    req.body?.partyCode
                );

            const participant =
                party.participants.get(
                    req.body?.clientId
                );

            if (participant?.stream) {
                try {
                    participant.stream.end();
                } catch {
                    // ignore
                }
            }

            party.participants.delete(
                req.body?.clientId
            );

            if (
                party.drawOffer?.by ===
                req.body?.clientId
            ) {
                party.drawOffer = null;
            }

            if (
                participant &&
                (
                    participant.role === "white" ||
                    participant.role === "black"
                )
            ) {
                party.clocks.running = false;
            }

            if (
                party.participants.size === 0
            ) {
                parties.delete(
                    party.code
                );
            } else {
                broadcastParty(
                    party
                );
            }

            res.json({
                ok: true,
            });
        } catch (err) {
            res.status(400).json({
                ok: false,
                error: err.message,
            });
        }
    }
);

/* =========================================================
   UNKNOWN API ROUTE
========================================================= */

app.use(
    "/api",
    (req, res) => {
        res.status(404).json({
            ok: false,
            error: "API route not found.",
            path: req.path,
        });
    }
);

/* =========================================================
   FRONTEND FALLBACK
========================================================= */

app.use(
    (req, res, next) => {
        if (
            req.method === "GET" &&
            req.accepts("html")
        ) {
            return res.sendFile(
                path.join(
                    PUBLIC_DIR,
                    "index.html"
                )
            );
        }

        next();
    }
);

/* =========================================================
   CLOCK LOOP
========================================================= */

setInterval(() => {
    for (
        const party
        of parties.values()
    ) {
        updateClock(party);
        broadcastParty(party);
    }
}, 1000);

/* =========================================================
   SSE KEEP ALIVE
========================================================= */

setInterval(() => {
    for (
        const party
        of parties.values()
    ) {
        for (
            const participant
            of party.participants.values()
        ) {
            if (!participant.stream) {
                continue;
            }

            writeSseEvent(
                participant.stream,
                "ping",
                {
                    now: Date.now(),
                }
            );
        }
    }
}, 15000);

/* =========================================================
   START
========================================================= */

app.listen(
    PORT,
    "0.0.0.0",
    () => {
        console.log(
            `Chess Party server running on port ${PORT}`
        );

        console.log(
            `Open: http://localhost:${PORT}`
        );
    }
);
