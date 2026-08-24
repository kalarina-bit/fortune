import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

import express from "express";

import { ChessEngine } from "./shared/chess-engine.js";


const __filename =
    fileURLToPath(import.meta.url);

const __dirname =
    path.dirname(__filename);


const PUBLIC_DIR =
    path.join(
        __dirname,
        "public"
    );

const SHARED_DIR =
    path.join(
        __dirname,
        "shared"
    );


const PORT =
    Number(
        process.env.PORT || 3015
    );


const app =
    express();


app.disable(
    "x-powered-by"
);


app.use(
    express.json({
        limit: "32kb"
    })
);


app.use(
    express.static(
        PUBLIC_DIR,
        {
            extensions: ["html"],
            maxAge: "1h"
        }
    )
);


app.use(
    "/shared",
    express.static(
        SHARED_DIR,
        {
            maxAge: "1h"
        }
    )
);


/* =========================================================
   CONFIG
========================================================= */


const MAX_SPECTATORS = 20;


const TIME_CONTROLS = {

    none: {
        key: "none",
        label: "Без часов",
        initial: 0,
        increment: 0
    },

    "1+0": {
        key: "1+0",
        label: "1 + 0 • Bullet",
        initial: 60,
        increment: 0
    },

    "3+0": {
        key: "3+0",
        label: "3 + 0 • Blitz",
        initial: 180,
        increment: 0
    },

    "3+2": {
        key: "3+2",
        label: "3 + 2 • Blitz",
        initial: 180,
        increment: 2
    },

    "5+0": {
        key: "5+0",
        label: "5 + 0 • Blitz",
        initial: 300,
        increment: 0
    },

    "5+3": {
        key: "5+3",
        label: "5 + 3 • Blitz",
        initial: 300,
        increment: 3
    },

    "10+0": {
        key: "10+0",
        label: "10 + 0 • Rapid",
        initial: 600,
        increment: 0
    },

    "15+10": {
        key: "15+10",
        label: "15 + 10 • Rapid",
        initial: 900,
        increment: 10
    },

    "30+0": {
        key: "30+0",
        label: "30 + 0 • Classical",
        initial: 1800,
        increment: 0
    },

    "30+20": {
        key: "30+20",
        label: "30 + 20 • Classical",
        initial: 1800,
        increment: 20
    }
};


const parties =
    new Map();


/* =========================================================
   HELPERS
========================================================= */


function safeName(name) {

    const value =
        typeof name === "string"
            ? name.trim()
            : "";

    if (!value) {
        return "Guest";
    }

    return value
        .replace(/[<>]/g, "")
        .slice(0, 24);
}


function normalizeCode(code) {

    return String(code || "")
        .trim()
        .toUpperCase();
}


function getTimeControl(key) {

    return (
        TIME_CONTROLS[key] ||
        TIME_CONTROLS["10+0"]
    );
}


function createClientId() {

    return crypto.randomUUID();
}


function createPartyCode() {

    const alphabet =
        "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    let code;

    do {

        code = "";

        for (
            let i = 0;
            i < 6;
            i++
        ) {

            code +=
                alphabet[
                    crypto.randomInt(
                        0,
                        alphabet.length
                    )
                ];
        }

    } while (
        parties.has(code)
    );

    return code;
}


function getParty(code) {

    const normalized =
        normalizeCode(code);

    const party =
        parties.get(normalized);

    if (!party) {
        throw new Error(
            "Комната не найдена."
        );
    }

    return party;
}


function getParticipant(
    party,
    clientId
) {

    if (!clientId) {
        return null;
    }

    return (
        party.participants.get(
            String(clientId).trim()
        ) ||
        null
    );
}


function getPlayer(
    party,
    role
) {

    for (
        const participant
        of party.participants.values()
    ) {

        if (
            participant.role === role
        ) {
            return participant;
        }
    }

    return null;
}


function roleColor(role) {

    return role === "white"
        ? "w"
        : "b";
}


function oppositeColor(color) {

    return color === "w"
        ? "b"
        : "w";
}


function countSpectators(party) {

    let count = 0;

    for (
        const participant
        of party.participants.values()
    ) {

        if (
            participant.role === "spectator"
        ) {
            count++;
        }
    }

    return count;
}


/* =========================================================
   CLOCKS
========================================================= */


function createClocks(
    timeControl
) {

    return {

        white:
            timeControl.initial,

        black:
            timeControl.initial,

        running: false,

        turn: "w",

        lastTick:
            Date.now()
    };
}


function updateClock(party) {

    if (
        !party.timeControl.initial
    ) {
        return;
    }

    if (
        !party.clocks.running
    ) {
        return;
    }

    if (
        party.gameOverReason
    ) {
        return;
    }

    const now =
        Date.now();

    const elapsed =
        (
            now -
            party.clocks.lastTick
        ) / 1000;

    if (
        elapsed <= 0
    ) {
        return;
    }

    const color =
        party.engine.state.turn;

    const key =
        color === "w"
            ? "white"
            : "black";

    party.clocks[key] =
        Math.max(
            0,
            party.clocks[key] -
            elapsed
        );

    party.clocks.turn =
        color;

    party.clocks.lastTick =
        now;

    if (
        party.clocks[key] <= 0
    ) {

        party.clocks[key] =
            0;

        party.gameOverReason =
            "timeout";

        party.winner =
            oppositeColor(
                color
            );

        party.clocks.running =
            false;
    }
}


function startClock(party) {

    if (
        !party.timeControl.initial
    ) {
        return;
    }

    const white =
        getPlayer(
            party,
            "white"
        );

    const black =
        getPlayer(
            party,
            "black"
        );

    if (
        !white ||
        !black
    ) {
        return;
    }

    if (
        party.gameOverReason
    ) {
        return;
    }

    party.clocks.running =
        true;

    party.clocks.turn =
        party.engine.state.turn;

    party.clocks.lastTick =
        Date.now();
}


function applyMoveClock(
    party,
    movingColor
) {

    if (
        !party.timeControl.initial
    ) {
        return;
    }

    updateClock(
        party
    );

    if (
        party.gameOverReason
    ) {
        return;
    }

    const key =
        movingColor === "w"
            ? "white"
            : "black";

    party.clocks[key] +=
        party.timeControl.increment;

    party.clocks.turn =
        party.engine.state.turn;

    party.clocks.lastTick =
        Date.now();

    party.clocks.running =
        true;
}


/* =========================================================
   GAME
========================================================= */


function getEngineStatus(party) {

    return party.engine.getStatus();
}


function updateGameResult(party) {

    if (
        party.gameOverReason
    ) {
        return;
    }

    const status =
        getEngineStatus(
            party
        );

    if (
        status.phase === "checkmate"
    ) {

        party.gameOverReason =
            "checkmate";

        party.winner =
            status.winner;

        party.clocks.running =
            false;

    } else if (
        status.phase === "draw"
    ) {

        party.gameOverReason =
            "draw";

        party.winner =
            null;

        party.clocks.running =
            false;
    }
}


function resetPartyGame(party) {

    party.engine =
        new ChessEngine();

    party.clocks =
        createClocks(
            party.timeControl
        );

    party.gameOverReason =
        null;

    party.winner =
        null;

    startClock(
        party
    );
}


/* =========================================================
   SERIALIZATION
========================================================= */


function serializeParticipant(
    participant
) {

    return {

        id:
            participant.id,

        name:
            participant.name,

        role:
            participant.role,

        connected:
            participant.connected
    };
}


function serializeParty(
    party,
    clientId
) {

    updateClock(
        party
    );

    const players = {
        white: null,
        black: null
    };

    const spectators = [];

    for (
        const participant
        of party.participants.values()
    ) {

        if (
            participant.role === "white"
        ) {

            players.white =
                serializeParticipant(
                    participant
                );

        } else if (
            participant.role === "black"
        ) {

            players.black =
                serializeParticipant(
                    participant
                );

        } else {

            spectators.push(
                serializeParticipant(
                    participant
                )
            );
        }
    }

    const you =
        getParticipant(
            party,
            clientId
        );

    return {

        code:
            party.code,

        ownerId:
            party.ownerId,

        game:
            party.engine.getSnapshot(),

        players,

        spectators,

        spectatorCount:
            spectators.length,

        maxSpectators:
            MAX_SPECTATORS,

        timeControl:
            party.timeControl,

        clocks: {

            white:
                party.clocks.white,

            black:
                party.clocks.black,

            running:
                party.clocks.running,

            turn:
                party.clocks.turn
        },

        gameOverReason:
            party.gameOverReason ||
            null,

        winner:
            party.winner ||
            null,

        you:
            you
                ? {
                    id: you.id,
                    name: you.name,
                    role: you.role
                }
                : null
    };
}


/* =========================================================
   SSE
========================================================= */


function sendSSE(
    response,
    event,
    data
) {

    try {

        response.write(
            `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
        );

    } catch {
        // connection closed
    }
}


function broadcastParty(party) {

    for (
        const client
        of party.sseClients
    ) {

        sendSSE(
            client.res,
            "party",
            serializeParty(
                party,
                client.id
            )
        );
    }
}


/* =========================================================
   CREATE PARTY
========================================================= */


app.post(
    "/api/party/create",
    (req, res) => {

        try {

            const name =
                safeName(
                    req.body?.name
                );

            const timeControl =
                getTimeControl(
                    req.body?.timeControl
                );

            const code =
                createPartyCode();

            const clientId =
                createClientId();

            const party = {

                code,

                ownerId:
                    clientId,

                engine:
                    new ChessEngine(),

                timeControl,

                clocks:
                    createClocks(
                        timeControl
                    ),

                participants:
                    new Map(),

                sseClients:
                    new Set(),

                gameOverReason:
                    null,

                winner:
                    null
            };


            party.participants.set(
                clientId,
                {

                    id:
                        clientId,

                    name,

                    role:
                        "white",

                    connected:
                        true
                }
            );


            parties.set(
                code,
                party
            );


            res.json({

                ok: true,

                party:
                    serializeParty(
                        party,
                        clientId
                    )
            });

        } catch (error) {

            res.status(400).json({

                ok: false,

                error:
                    error.message ||
                    "Ошибка создания комнаты."
            });
        }
    }
);


/* =========================================================
   JOIN PARTY
========================================================= */


app.post(
    "/api/party/join",
    (req, res) => {

        try {

            const code =
                normalizeCode(
                    req.body?.partyCode
                );

            const name =
                safeName(
                    req.body?.name
                );

            const party =
                getParty(code);


            let clientId =
                String(
                    req.body?.clientId || ""
                ).trim();


            let participant =
                getParticipant(
                    party,
                    clientId
                );


            /*
             * Existing participant reconnects.
             */

            if (participant) {

                participant.name =
                    name;

                participant.connected =
                    true;

            } else {

                clientId =
                    createClientId();

                let role =
                    "spectator";


                if (
                    !getPlayer(
                        party,
                        "white"
                    )
                ) {

                    role =
                        "white";

                } else if (
                    !getPlayer(
                        party,
                        "black"
                    )
                ) {

                    role =
                        "black";

                } else if (
                    countSpectators(
                        party
                    ) >= MAX_SPECTATORS
                ) {

                    return res.status(403).json({

                        ok: false,

                        error:
                            "Достигнут лимит зрителей."
                    });
                }


                participant = {

                    id:
                        clientId,

                    name,

                    role,

                    connected:
                        true
                };


                party.participants.set(
                    clientId,
                    participant
                );
            }


            /*
             * Start clock only when
             * both players exist.
             */

            startClock(
                party
            );


            broadcastParty(
                party
            );


            res.json({

                ok: true,

                party:
                    serializeParty(
                        party,
                        clientId
                    )
            });

        } catch (error) {

            res.status(400).json({

                ok: false,

                error:
                    error.message ||
                    "Ошибка входа в комнату."
            });
        }
    }
);


/* =========================================================
   MAKE MOVE
========================================================= */


app.post(
    "/api/party/move",
    (req, res) => {

        try {

            const {

                partyCode,

                clientId,

                from,

                to,

                promotion

            } = req.body || {};


            const party =
                getParty(
                    partyCode
                );


            const participant =
                getParticipant(
                    party,
                    clientId
                );


            if (!participant) {

                return res.status(403).json({

                    ok: false,

                    error:
                        "Игрок не найден."
                });
            }


            if (
                participant.role !== "white" &&
                participant.role !== "black"
            ) {

                return res.status(403).json({

                    ok: false,

                    error:
                        "Зритель не может делать ходы."
                });
            }


            if (
                party.gameOverReason
            ) {

                return res.status(400).json({

                    ok: false,

                    error:
                        "Игра уже закончена.",

                    party:
                        serializeParty(
                            party,
                            clientId
                        )
                });
            }


            const color =
                roleColor(
                    participant.role
                );


            if (
                party.engine.state.turn !== color
            ) {

                return res.status(400).json({

                    ok: false,

                    error:
                        "Сейчас не ваш ход."
                });
            }


            /*
             * Authoritative server clock.
             */

            updateClock(
                party
            );


            if (
                party.gameOverReason
            ) {

                return res.status(400).json({

                    ok: false,

                    error:
                        "Время закончилось.",

                    party:
                        serializeParty(
                            party,
                            clientId
                        )
                });
            }


            const result =
                party.engine.makeMove({

                    from,

                    to,

                    promotion:
                        promotion || null
                });


            if (!result.ok) {

                return res.status(400).json({

                    ok: false,

                    error:
                        result.error
                });
            }


            applyMoveClock(
                party,
                color
            );


            updateGameResult(
                party
            );


            broadcastParty(
                party
            );


            res.json({

                ok: true,

                party:
                    serializeParty(
                        party,
                        clientId
                    )
            });

        } catch (error) {

            res.status(400).json({

                ok: false,

                error:
                    error.message ||
                    "Ошибка выполнения хода."
            });
        }
    }
);


/* =========================================================
   NEW PARTY GAME
========================================================= */


app.post(
    "/api/party/new-game",
    (req, res) => {

        try {

            const party =
                getParty(
                    req.body?.partyCode
                );


            const clientId =
                String(
                    req.body?.clientId || ""
                ).trim();


            const participant =
                getParticipant(
                    party,
                    clientId
                );


            if (!participant) {

                return res.status(403).json({

                    ok: false,

                    error:
                        "Игрок не найден."
                });
            }


            if (
                clientId !==
                party.ownerId
            ) {

                return res.status(403).json({

                    ok: false,

                    error:
                        "Только владелец комнаты может начать новую игру."
                });
            }


            resetPartyGame(
                party
            );


            broadcastParty(
                party
            );


            res.json({

                ok: true,

                party:
                    serializeParty(
                        party,
                        clientId
                    )
            });

        } catch (error) {

            res.status(400).json({

                ok: false,

                error:
                    error.message ||
                    "Не удалось начать новую игру."
            });
        }
    }
);


/* =========================================================
   PARTY EVENTS / SSE
========================================================= */


app.get(
    "/api/party/events",
    (req, res) => {

        try {

            const code =
                normalizeCode(
                    req.query?.partyCode
                );


            const clientId =
                String(
                    req.query?.clientId || ""
                ).trim();


            const party =
                getParty(code);


            const participant =
                getParticipant(
                    party,
                    clientId
                );


            if (!participant) {

                return res
                    .status(403)
                    .end();
            }


            res.setHeader(
                "Content-Type",
                "text/event-stream"
            );

            res.setHeader(
                "Cache-Control",
                "no-cache, no-transform"
            );

            res.setHeader(
                "Connection",
                "keep-alive"
            );

            res.setHeader(
                "X-Accel-Buffering",
                "no"
            );


            if (
                typeof res.flushHeaders ===
                "function"
            ) {

                res.flushHeaders();
            }


            const client = {

                id:
                    clientId,

                res
            };


            party.sseClients.add(
                client
            );


            participant.connected =
                true;


            sendSSE(
                res,
                "party",
                serializeParty(
                    party,
                    clientId
                )
            );


            const heartbeat =
                setInterval(
                    () => {

                        try {

                            res.write(
                                ": ping\n\n"
                            );

                        } catch {

                            clearInterval(
                                heartbeat
                            );
                        }

                    },
                    15000
                );


            req.on(
                "close",
                () => {

                    clearInterval(
                        heartbeat
                    );


                    party.sseClients.delete(
                        client
                    );


                    const current =
                        getParticipant(
                            party,
                            clientId
                        );


                    if (current) {

                        current.connected =
                            false;
                    }


                    broadcastParty(
                        party
                    );
                }
            );

        } catch {

            res
                .status(404)
                .end();
        }
    }
);


/* =========================================================
   LEAVE PARTY
========================================================= */


app.post(
    "/api/party/leave",
    (req, res) => {

        try {

            const party =
                getParty(
                    req.body?.partyCode
                );


            const clientId =
                String(
                    req.body?.clientId || ""
                ).trim();


            const participant =
                getParticipant(
                    party,
                    clientId
                );


            if (!participant) {

                return res.json({
                    ok: true
                });
            }


            /*
             * Spectators are completely removed.
             */

            if (
                participant.role ===
                "spectator"
            ) {

                party.participants.delete(
                    clientId
                );

            } else {

                /*
                 * Players stay in the room
                 * so they can reconnect.
                 */

                participant.connected =
                    false;
            }


            broadcastParty(
                party
            );


            res.json({

                ok: true
            });

        } catch (error) {

            res.status(400).json({

                ok: false,

                error:
                    error.message ||
                    "Ошибка выхода."
            });
        }
    }
);


/* =========================================================
   CLOCK BROADCAST
========================================================= */


setInterval(
    () => {

        for (
            const party
            of parties.values()
        ) {

            if (
                !party.timeControl.initial ||
                !party.clocks.running ||
                party.gameOverReason
            ) {
                continue;
            }


            const beforeWhite =
                party.clocks.white;

            const beforeBlack =
                party.clocks.black;


            updateClock(
                party
            );


            if (
                beforeWhite !==
                    party.clocks.white ||
                beforeBlack !==
                    party.clocks.black
            ) {

                broadcastParty(
                    party
                );
            }
        }

    },
    1000
);


/* =========================================================
   FRONTEND FALLBACK
========================================================= */

/*
 * Не используем app.get("*"),
 * чтобы не зависеть от версии Express/path-to-regexp.
 */

app.use(
    (req, res, next) => {

        if (
            req.method !== "GET"
        ) {

            return next();
        }

        res.sendFile(
            path.join(
                PUBLIC_DIR,
                "index.html"
            )
        );
    }
);


/* =========================================================
   SERVER
========================================================= */


app.listen(
    PORT,
    "0.0.0.0",
    () => {

        console.log(
            `Chess server running on port ${PORT}`
        );
    }
);
