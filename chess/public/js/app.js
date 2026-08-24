import {
    ChessEngine
} from "/shared/chess-engine.js";


/* =========================================================
   PIECES
========================================================= */


const PIECES = {

    w: {
        k: "♔",
        q: "♕",
        r: "♖",
        b: "♗",
        n: "♘",
        p: "♙"
    },

    b: {
        k: "♚",
        q: "♛",
        r: "♜",
        b: "♝",
        n: "♞",
        p: "♟"
    }
};


/* =========================================================
   STATE
========================================================= */


const state = {

    mode:
        "ai",

    engine:
        new ChessEngine(),

    orientation:
        "w",

    selected:
        null,

    legalMoves:
        [],

    aiColor:
        "b",

    aiThinking:
        false,

    aiTimer:
        null,

    gameStarted:
        false,


    party:
        null,

    partyClientId:
        null,

    partyEvents:
        null,

    partyReconnectTimer:
        null,


    promotionResolver:
        null,


    clocks: {

        white:
            600,

        black:
            600,

        running:
            false,

        turn:
            "w"
    },


    clockTimer:
        null,


    /*
     * Local AI clock timestamp.
     */

    localClockLastTick:
        Date.now(),


    /*
     * Party clock synchronization.
     */

    partyClockSyncedAt:
        Date.now()
};


/* =========================================================
   DOM
========================================================= */


const $ =
    id =>
        document.getElementById(id);


const boardElement =
    $("board");

const statusMessage =
    $("statusMessage");

const turnBadge =
    $("turnBadge");

const connectionBadge =
    $("connectionBadge");

const modeBadge =
    $("modeBadge");

const aiControls =
    $("aiControls");

const partyControls =
    $("partyControls");


const whitePlayerLabel =
    $("whitePlayerLabel");

const blackPlayerLabel =
    $("blackPlayerLabel");

const whiteClock =
    $("whiteClock");

const blackClock =
    $("blackClock");


const spectatorCount =
    $("spectatorCount");

const spectatorList =
    $("spectatorList");


const toastHost =
    $("toastHost");


const promotionDialog =
    $("promotionDialog");

const promotionOptions =
    $("promotionOptions");


/*
 * These were missing in the previous version.
 */

const modeAiButton =
    $("modeAiButton");

const modePartyButton =
    $("modePartyButton");


const files =
    "abcdefgh";


/* =========================================================
   UI
========================================================= */


function showToast(
    message,
    type = ""
) {

    if (!toastHost) {
        return;
    }

    const element =
        document.createElement(
            "div"
        );

    element.className =
        `toast ${type}`;

    element.textContent =
        message;

    toastHost.appendChild(
        element
    );

    setTimeout(
        () => element.remove(),
        3200
    );
}


function setStatus(
    message
) {

    if (statusMessage) {

        statusMessage.textContent =
            message;
    }
}


function colorName(
    color
) {

    return color === "w"
        ? "белых"
        : "черных";
}


function getSquare(
    file,
    rank
) {

    return `${files[file]}${rank + 1}`;
}


function getCoordinates(
    index
) {

    if (
        state.orientation === "w"
    ) {

        return {

            file:
                index % 8,

            rank:
                7 -
                Math.floor(
                    index / 8
                )
        };
    }

    return {

        file:
            7 -
            index % 8,

        rank:
            Math.floor(
                index / 8
            )
    };
}


/* =========================================================
   BOARD
========================================================= */


function renderBoard() {

    if (!boardElement) {
        return;
    }

    boardElement.innerHTML =
        "";


    const snapshot =
        state.engine.state;


    const status =
        state.engine.getStatus();


    let checkedKing =
        null;


    if (
        status.phase === "check"
    ) {

        for (
            const [
                squareName,
                piece
            ]
            of Object.entries(
                snapshot.board
            )
        ) {

            if (
                piece.type === "k" &&
                piece.color ===
                    snapshot.turn
            ) {

                checkedKing =
                    squareName;

                break;
            }
        }
    }


    const legalMap =
        new Map();


    for (
        const move
        of state.legalMoves
    ) {

        legalMap.set(
            move.to,
            move
        );
    }


    for (
        let index = 0;
        index < 64;
        index++
    ) {

        const {
            file,
            rank
        } =
            getCoordinates(
                index
            );


        const squareName =
            getSquare(
                file,
                rank
            );


        const element =
            document.createElement(
                "button"
            );


        element.type =
            "button";


        element.className =
            "square";


        if (
            (file + rank) % 2 === 0
        ) {

            element.classList.add(
                "light"
            );

        } else {

            element.classList.add(
                "dark"
            );
        }


        if (
            state.selected ===
            squareName
        ) {

            element.classList.add(
                "selected"
            );
        }


        if (
            snapshot.lastMove &&
            (
                snapshot.lastMove.from ===
                    squareName ||
                snapshot.lastMove.to ===
                    squareName
            )
        ) {

            element.classList.add(
                "last-move"
            );
        }


        if (
            checkedKing ===
            squareName
        ) {

            element.classList.add(
                "check-square"
            );
        }


        const legal =
            legalMap.get(
                squareName
            );


        if (legal) {

            if (
                legal.capture
            ) {

                element.classList.add(
                    "capture-target"
                );

            } else {

                element.classList.add(
                    "legal-target"
                );
            }
        }


        const piece =
            snapshot.board[
                squareName
            ];


        if (piece) {

            const span =
                document.createElement(
                    "span"
                );


            span.className =
                `piece ${
                    piece.color === "w"
                        ? "white"
                        : "black"
                }`;


            span.textContent =
                PIECES[
                    piece.color
                ][
                    piece.type
                ];


            element.appendChild(
                span
            );
        }


        element.dataset.square =
            squareName;


        element.addEventListener(
            "click",
            () =>
                handleSquareClick(
                    squareName
                )
        );


        boardElement.appendChild(
            element
        );
    }
}


/* =========================================================
   MOVE PERMISSION
========================================================= */


function canUserMove() {

    if (
        !state.gameStarted
    ) {

        return false;
    }


    const status =
        state.engine.getStatus();


    if (
        status.phase === "checkmate" ||
        status.phase === "draw"
    ) {

        return false;
    }


    if (
        state.aiThinking
    ) {

        return false;
    }


    if (
        state.mode === "party"
    ) {

        if (!state.party) {
            return false;
        }


        const role =
            state.party.you?.role;


        if (
            role !== "white" &&
            role !== "black"
        ) {

            return false;
        }


        const myColor =
            role === "white"
                ? "w"
                : "b";


        return (
            state.engine.state.turn ===
            myColor
        );
    }


    return (
        state.engine.state.turn !==
        state.aiColor
    );
}


/* =========================================================
   BOARD CLICK
========================================================= */


function handleSquareClick(
    squareName
) {

    if (
        !canUserMove()
    ) {

        return;
    }


    const piece =
        state.engine.getPiece(
            squareName
        );


    if (!state.selected) {

        if (
            piece &&
            piece.color ===
                state.engine.state.turn
        ) {

            selectSquare(
                squareName
            );
        }

        return;
    }


    if (
        state.selected ===
        squareName
    ) {

        clearSelection();

        return;
    }


    const move =
        state.legalMoves.find(
            item =>
                item.to ===
                squareName
        );


    if (move) {

        if (
            move.promotion
        ) {

            openPromotion(
                move,
                promotion =>
                    performMove(
                        move.from,
                        move.to,
                        promotion
                    )
            );

        } else {

            performMove(
                move.from,
                move.to,
                null
            );
        }

        return;
    }


    if (
        piece &&
        piece.color ===
            state.engine.state.turn
    ) {

        selectSquare(
            squareName
        );

        return;
    }


    clearSelection();
}


/* =========================================================
   SELECTION
========================================================= */


function selectSquare(
    squareName
) {

    state.selected =
        squareName;

    state.legalMoves =
        state.engine.movesFrom(
            squareName
        );

    renderBoard();
}


function clearSelection() {

    state.selected =
        null;

    state.legalMoves =
        [];

    renderBoard();
}


/* =========================================================
   PROMOTION
========================================================= */


function openPromotion(
    move,
    callback
) {

    if (
        !promotionDialog ||
        !promotionOptions
    ) {

        callback("q");

        return;
    }


    promotionOptions.innerHTML =
        "";


    const color =
        state.engine.state.turn;


    for (
        const type
        of [
            "q",
            "r",
            "b",
            "n"
        ]
    ) {

        const button =
            document.createElement(
                "button"
            );


        button.type =
            "button";


        button.textContent =
            PIECES[
                color
            ][
                type
            ];


        button.addEventListener(
            "click",
            () => {

                promotionDialog
                    .classList
                    .add(
                        "hidden"
                    );


                state.promotionResolver =
                    null;


                callback(
                    type
                );
            }
        );


        promotionOptions.appendChild(
            button
        );
    }


    promotionDialog
        .classList
        .remove(
            "hidden"
        );
}


/* =========================================================
   MOVE
========================================================= */


function performMove(
    from,
    to,
    promotion
) {

    if (
        state.mode === "party"
    ) {

        performPartyMove(
            from,
            to,
            promotion
        );

        return;
    }


    performAiGameMove(
        from,
        to,
        promotion
    );
}


/* =========================================================
   AI GAME MOVE
========================================================= */


function performAiGameMove(
    from,
    to,
    promotion
) {

    /*
     * Update the local clock before
     * modifying the chess position.
     */

    updateLocalClock();


    if (
        isLocalTimeout()
    ) {

        finishLocalTimeout();

        return;
    }


    const movingColor =
        state.engine.state.turn;


    const result =
        state.engine.makeMove({

            from,

            to,

            promotion
        });


    if (!result.ok) {

        showToast(
            result.error,
            "error"
        );

        clearSelection();

        return;
    }


    applyLocalMoveClock(
        movingColor
    );


    clearSelection();


    state.gameStarted =
        true;


    updateGameUI();


    if (
        result.status.phase ===
            "checkmate" ||
        result.status.phase ===
            "draw"
    ) {

        finishGame();

        return;
    }


    if (
        state.engine.state.turn ===
        state.aiColor
    ) {

        scheduleAiMove();
    }
}


/* =========================================================
   AI
========================================================= */


function scheduleAiMove() {

    if (
        state.aiThinking
    ) {

        return;
    }


    if (
        state.mode !== "ai"
    ) {

        return;
    }


    state.aiThinking =
        true;


    setStatus(
        "Компьютер думает..."
    );


    renderBoard();


    clearTimeout(
        state.aiTimer
    );


    state.aiTimer =
        setTimeout(
            () => {

                try {

                    makeAiMove();

                } finally {

                    state.aiThinking =
                        false;
                }

            },
            getAiDelay()
        );
}


function getAiDelay() {

    const level =
        $("aiLevelSelect")?.value;


    if (
        level === "easy"
    ) {

        return 350;
    }


    if (
        level === "hard"
    ) {

        return 800;
    }


    return 550;
}


function makeAiMove() {

    if (
        state.mode !== "ai"
    ) {

        return;
    }


    updateLocalClock();


    if (
        isLocalTimeout()
    ) {

        finishLocalTimeout();

        return;
    }


    const status =
        state.engine.getStatus();


    if (
        status.phase === "checkmate" ||
        status.phase === "draw"
    ) {

        return;
    }


    const legal =
        state.engine.legalMoves(
            state.aiColor
        );


    if (
        !legal.length
    ) {

        updateGameUI();

        return;
    }


    const level =
        $("aiLevelSelect")?.value;


    let move;


    if (
        level === "easy"
    ) {

        move =
            legal[
                Math.floor(
                    Math.random() *
                    legal.length
                )
            ];

    } else {

        move =
            chooseAiMove(
                legal,
                level
            );
    }


    const movingColor =
        state.engine.state.turn;


    const result =
        state.engine.makeMove({

            from:
                move.from,

            to:
                move.to,

            promotion:
                move.promotion ||
                null
        });


    if (!result.ok) {

        showToast(
            "ИИ не смог выполнить ход.",
            "error"
        );

        return;
    }


    applyLocalMoveClock(
        movingColor
    );


    updateGameUI();


    if (
        result.status.phase ===
            "checkmate" ||
        result.status.phase ===
            "draw"
    ) {

        finishGame();
    }
}


function chooseAiMove(
    moves,
    level
) {

    let bestScore =
        -Infinity;


    let bestMoves =
        [];


    const values = {

        p: 100,

        n: 320,

        b: 330,

        r: 500,

        q: 900,

        k: 20000
    };


    for (
        const move
        of moves
    ) {

        let score =
            Math.random() *
            0.4;


        if (
            move.capture
        ) {

            score += 3;
        }


        if (
            move.promotion
        ) {

            score += 8;
        }


        if (
            move.to[1] === "4" ||
            move.to[1] === "5"
        ) {

            score += 0.15;
        }


        /*
         * Slight bonus for developing
         * pieces and center control.
         */

        const piece =
            state.engine.getPiece(
                move.from
            );


        if (piece) {

            if (
                piece.type === "n" ||
                piece.type === "b"
            ) {

                score += 0.1;
            }
        }


        if (
            move.capture
        ) {

            /*
             * If ChessEngine exposes
             * captured piece information,
             * use it.
             */

            if (
                move.captured?.type
            ) {

                score +=
                    (
                        values[
                            move.captured.type
                        ] || 0
                    ) / 100;
            }
        }


        if (
            score >
            bestScore
        ) {

            bestScore =
                score;

            bestMoves =
                [move];

        } else if (
            Math.abs(
                score -
                bestScore
            ) < 0.1
        ) {

            bestMoves.push(
                move
            );
        }
    }


    return bestMoves[
        Math.floor(
            Math.random() *
            bestMoves.length
        )
    ];
}


/* =========================================================
   GAME END
========================================================= */


function finishGame() {

    state.aiThinking =
        false;


    clearTimeout(
        state.aiTimer
    );


    stopLocalClock();


    updateGameUI();
}


/* =========================================================
   AI CLOCK
========================================================= */


function parseClock(
    value
) {

    if (
        !value ||
        value === "none"
    ) {

        return {

            initial:
                0,

            increment:
                0
        };
    }


    const [
        minutes,
        increment
    ] =
        String(value)
            .split("+");


    return {

        initial:
            Number(minutes) *
            60,

        increment:
            Number(increment || 0)
    };
}


function resetClockFromSelect(
    value
) {

    const control =
        parseClock(
            value
        );


    state.clocks = {

        white:
            control.initial,

        black:
            control.initial,

        running:
            control.initial > 0,

        turn:
            "w"
    };


    state.localClockLastTick =
        Date.now();


    updateClocks();
}


function updateLocalClock() {

    if (
        state.mode !== "ai"
    ) {

        return;
    }


    if (
        !state.clocks.running
    ) {

        return;
    }


    if (
        state.clocks.white <= 0 ||
        state.clocks.black <= 0
    ) {

        return;
    }


    const now =
        Date.now();


    const elapsed =
        (
            now -
            state.localClockLastTick
        ) / 1000;


    if (
        elapsed <= 0
    ) {

        return;
    }


    const key =
        state.clocks.turn === "w"
            ? "white"
            : "black";


    state.clocks[key] =
        Math.max(
            0,
            state.clocks[key] -
            elapsed
        );


    state.localClockLastTick =
        now;


    if (
        state.clocks[key] <= 0
    ) {

        state.clocks[key] =
            0;

        state.clocks.running =
            false;
    }
}


function applyLocalMoveClock(
    movingColor
) {

    const value =
        $("aiClockSelect")?.value;


    const control =
        parseClock(
            value
        );


    if (
        !control.initial
    ) {

        return;
    }


    const key =
        movingColor === "w"
            ? "white"
            : "black";


    state.clocks[key] +=
        control.increment;


    state.clocks.turn =
        state.engine.state.turn;


    state.clocks.running =
        true;


    state.localClockLastTick =
        Date.now();


    updateClocks();
}


function isLocalTimeout() {

    if (
        !state.clocks.running
    ) {

        return false;
    }


    return (
        state.clocks.white <= 0 ||
        state.clocks.black <= 0
    );
}


function finishLocalTimeout() {

    const loser =
        state.clocks.white <= 0
            ? "w"
            : "b";


    const winner =
        loser === "w"
            ? "b"
            : "w";


    state.clocks.running =
        false;


    setStatus(
        `Время вышло. Победили ${colorName(winner)}.`
    );


    showToast(
        `Время ${colorName(loser)} вышло.`,
        "error"
    );


    renderBoard();

    updateClocks();
}


function stopLocalClock() {

    state.clocks.running =
        false;

    updateClocks();
}


/* =========================================================
   UI STATE
========================================================= */


function updateGameUI() {

    if (
        state.mode === "ai"
    ) {

        updateLocalClock();
    }


    const status =
        state.engine.getStatus();


    const turn =
        state.engine.state.turn;


    if (turnBadge) {

        turnBadge.textContent =
            `Ход ${colorName(turn)}`;


        turnBadge.className =
            `status-chip ${
                turn === "w"
                    ? "turn-white"
                    : "turn-black"
            }`;
    }


    if (
        status.phase ===
        "checkmate"
    ) {

        setStatus(
            `Мат. Победили ${colorName(status.winner)}.`
        );

    } else if (
        status.phase ===
        "draw"
    ) {

        setStatus(
            drawMessage(
                status.reason
            )
        );

    } else if (
        status.phase ===
        "check"
    ) {

        setStatus(
            `Шах — ход ${colorName(turn)}.`
        );

    } else if (
        state.mode ===
        "party"
    ) {

        const role =
            state.party?.you?.role;


        if (
            role === "spectator"
        ) {

            setStatus(
                `Ход ${colorName(turn)}. Вы зритель.`
            );

        } else if (
            role === "white" ||
            role === "black"
        ) {

            const myColor =
                role === "white"
                    ? "w"
                    : "b";


            setStatus(
                myColor === turn
                    ? "Ваш ход."
                    : "Ход соперника."
            );

        } else {

            setStatus(
                "Ожидание игрока."
            );
        }

    } else if (
        state.gameStarted
    ) {

        setStatus(
            turn === state.aiColor
                ? "Ход компьютера."
                : "Ваш ход."
        );

    } else {

        setStatus(
            "Новая игра готова."
        );
    }


    renderBoard();

    updateClocks();
}


function drawMessage(
    reason
) {

    switch (reason) {

        case "stalemate":
            return "Ничья — пат.";

        case "50-move":
            return "Ничья — правило 50 ходов.";

        case "threefold":
            return "Ничья — троекратное повторение.";

        case "insufficient-material":
            return "Ничья — недостаточно материала.";

        default:
            return "Ничья.";
    }
}


/* =========================================================
   AI NEW GAME
========================================================= */


function startNewAiGame() {

    closePartyEvents();


    state.mode =
        "ai";


    state.party =
        null;


    state.partyClientId =
        null;


    state.engine =
        new ChessEngine();


    state.selected =
        null;


    state.legalMoves =
        [];


    state.gameStarted =
        true;


    state.aiThinking =
        false;


    clearTimeout(
        state.aiTimer
    );


    const selectedColor =
        $("playerColorSelect")?.value ||
        "w";


    state.aiColor =
        selectedColor === "w"
            ? "b"
            : "w";


    state.orientation =
        selectedColor;


    setupAiPlayers();


    resetClockFromSelect(
        $("aiClockSelect")?.value
    );


    updateGameUI();


    if (
        state.aiColor === "w"
    ) {

        scheduleAiMove();
    }
}


function setupAiPlayers() {

    const name =
        getPlayerName();


    if (
        state.aiColor === "b"
    ) {

        whitePlayerLabel.textContent =
            name;

        blackPlayerLabel.textContent =
            "Компьютер";

    } else {

        whitePlayerLabel.textContent =
            "Компьютер";

        blackPlayerLabel.textContent =
            name;
    }
}


function getPlayerName() {

    const value =
        $("playerNameInput")
            ?.value
            ?.trim();


    return value ||
        "Вы";
}


/* =========================================================
   MODE
========================================================= */


function switchMode(
    mode
) {

    if (
        mode === "ai"
    ) {

        state.mode =
            "ai";


        modeAiButton?.classList.add(
            "active"
        );


        modePartyButton?.classList.remove(
            "active"
        );


        aiControls?.classList.remove(
            "hidden"
        );


        partyControls?.classList.add(
            "hidden"
        );


        if (modeBadge) {

            modeBadge.textContent =
                "AI Арена";
        }


        if (connectionBadge) {

            connectionBadge.textContent =
                "Соло";

            connectionBadge.className =
                "status-chip connection-solo";
        }


        return;
    }


    state.mode =
        "party";


    modePartyButton?.classList.add(
        "active"
    );


    modeAiButton?.classList.remove(
        "active"
    );


    aiControls?.classList.add(
        "hidden"
    );


    partyControls?.classList.remove(
        "hidden"
    );


    if (modeBadge) {

        modeBadge.textContent =
            "Party";
    }


    if (connectionBadge) {

        connectionBadge.textContent =
            "Онлайн";

        connectionBadge.className =
            "status-chip connection-party";
    }


    state.gameStarted =
        false;


    state.engine =
        new ChessEngine();


    state.selected =
        null;


    state.legalMoves =
        [];


    stopLocalClock();


    updateGameUI();
}


/* =========================================================
   PARTY STORAGE
========================================================= */


function partyStorageKey(
    code
) {

    return `chessParty:${String(code).toUpperCase()}`;
}


function savePartyClientId(
    code,
    clientId
) {

    if (
        !code ||
        !clientId
    ) {

        return;
    }


    try {

        localStorage.setItem(
            partyStorageKey(code),
            clientId
        );

    } catch {
        // localStorage unavailable
    }
}


function loadPartyClientId(
    code
) {

    if (!code) {
        return null;
    }


    try {

        return localStorage.getItem(
            partyStorageKey(code)
        );

    } catch {

        return null;
    }
}


function removePartyClientId(
    code
) {

    if (!code) {
        return;
    }


    try {

        localStorage.removeItem(
            partyStorageKey(code)
        );

    } catch {
        // ignore
    }
}


/* =========================================================
   CREATE PARTY
========================================================= */


async function createParty() {

    const name =
        getPlayerName();


    try {

        const response =
            await fetch(
                "/api/party/create",
                {

                    method:
                        "POST",

                    headers: {

                        "Content-Type":
                            "application/json"
                    },

                    body:
                        JSON.stringify({

                            name,

                            timeControl:
                                $("partyClockSelect")
                                    ?.value ||
                                "10+0"
                        })
                }
            );


        const data =
            await response.json();


        if (!data.ok) {

            throw new Error(
                data.error
            );
        }


        state.party =
            data.party;


        state.partyClientId =
            data.party.you?.id ||
            null;


        savePartyClientId(
            data.party.code,
            state.partyClientId
        );


        applyPartyState(
            data.party
        );


        $("partyCodeInput").value =
            data.party.code;


        $("leavePartyButton")
            ?.classList
            .remove(
                "hidden"
            );


        $("copyInviteButton")
            ?.classList
            .remove(
                "hidden"
            );


        $("newGameToolbarButton")
            ?.classList
            .remove(
                "hidden"
            );


        $("partySummary")
            .textContent =
            `Комната ${data.party.code}. Вы играете белыми.`;


        connectPartyEvents();


        showToast(
            `Комната ${data.party.code} создана.`,
            "success"
        );

    } catch (error) {

        showToast(
            error.message ||
            "Не удалось создать комнату.",
            "error"
        );
    }
}


/* =========================================================
   JOIN PARTY
========================================================= */


async function joinParty() {

    const code =
        $("partyCodeInput")
            ?.value
            ?.trim()
            ?.toUpperCase();


    if (
        !/^[A-Z0-9]{6}$/.test(
            code
        )
    ) {

        showToast(
            "Введите 6-значный код комнаты.",
            "error"
        );

        return;
    }


    /*
     * Try reconnecting with the old ID
     * belonging to this room.
     */

    const storedClientId =
        loadPartyClientId(
            code
        );


    try {

        const response =
            await fetch(
                "/api/party/join",
                {

                    method:
                        "POST",

                    headers: {

                        "Content-Type":
                            "application/json"
                    },

                    body:
                        JSON.stringify({

                            partyCode:
                                code,

                            name:
                                getPlayerName(),

                            clientId:
                                storedClientId
                        })
                }
            );


        const data =
            await response.json();


        if (!data.ok) {

            throw new Error(
                data.error
            );
        }


        state.party =
            data.party;


        state.partyClientId =
            data.party.you?.id ||
            null;


        savePartyClientId(
            code,
            state.partyClientId
        );


        applyPartyState(
            data.party
        );


        $("leavePartyButton")
            ?.classList
            .remove(
                "hidden"
            );


        $("copyInviteButton")
            ?.classList
            .remove(
                "hidden"
            );


        $("newGameToolbarButton")
            ?.classList
            .remove(
                "hidden"
            );


        connectPartyEvents();


        showToast(
            `Вы вошли в комнату ${code}.`,
            "success"
        );

    } catch (error) {

        showToast(
            error.message ||
            "Не удалось войти в комнату.",
            "error"
        );
    }
}


/* =========================================================
   SNAPSHOT
========================================================= */


function createEngineFromSnapshot(
    snapshot
) {

    const engine =
        new ChessEngine(
            snapshot.fen
        );


    engine.state.lastMove =
        snapshot.lastMove
            ? {
                ...snapshot.lastMove
            }
            : null;


    return engine;
}


/* =========================================================
   PARTY STATE
========================================================= */


function applyPartyState(
    party
) {

    state.party =
        party;


    state.engine =
        createEngineFromSnapshot(
            party.game
        );


    state.clocks = {

        white:
            Number(
                party.clocks?.white || 0
            ),

        black:
            Number(
                party.clocks?.black || 0
            ),

        running:
            Boolean(
                party.clocks?.running
            ),

        turn:
            party.clocks?.turn ||
            party.game?.turn ||
            "w"
    };


    state.partyClockSyncedAt =
        Date.now();


    state.selected =
        null;


    state.legalMoves =
        [];


    state.gameStarted =
        true;


    updatePartyPlayers();

    updateSpectators();

    updatePartyConnection();


    updateGameUI();
}


/* =========================================================
   PARTY PLAYERS
========================================================= */


function updatePartyPlayers() {

    const players =
        state.party?.players ||
        {};


    whitePlayerLabel.textContent =
        players.white?.name ||
        "Ожидание игрока";


    blackPlayerLabel.textContent =
        players.black?.name ||
        "Ожидание игрока";


    if (
        state.party?.you?.role ===
        "white"
    ) {

        state.orientation =
            "w";

    } else if (
        state.party?.you?.role ===
        "black"
    ) {

        state.orientation =
            "b";
    }


    const owner =
        state.party?.ownerId;


    const isOwner =
        owner &&
        owner ===
            state.partyClientId;


    const newGameButton =
        $("newGameToolbarButton");


    if (newGameButton) {

        newGameButton.classList.toggle(
            "hidden",
            !isOwner
        );
    }


    $("partySummary")
        ?.textContent =
        state.party?.code
            ? `Комната ${state.party.code}`
            : "Создайте комнату.";
}


/* =========================================================
   SPECTATORS
========================================================= */


function updateSpectators() {

    if (
        !spectatorCount ||
        !spectatorList
    ) {

        return;
    }


    const spectators =
        state.party?.spectators ||
        [];


    spectatorCount.textContent =
        `${spectators.length} / ${
            state.party?.maxSpectators ||
            20
        }`;


    spectatorList.innerHTML =
        "";


    if (
        !spectators.length
    ) {

        const li =
            document.createElement(
                "li"
            );


        li.className =
            "empty-state";


        li.textContent =
            "Пока никого нет";


        spectatorList.appendChild(
            li
        );


        return;
    }


    for (
        const spectator
        of spectators
    ) {

        const li =
            document.createElement(
                "li"
            );


        li.textContent =
            spectator.name;


        spectatorList.appendChild(
            li
        );
    }
}


/* =========================================================
   PARTY CONNECTION
========================================================= */


function updatePartyConnection() {

    if (
        !connectionBadge
    ) {

        return;
    }


    if (
        state.partyEvents
    ) {

        connectionBadge.textContent =
            "Онлайн";

        connectionBadge.className =
            "status-chip connection-party";
    }
}


function closePartyEvents() {

    clearTimeout(
        state.partyReconnectTimer
    );


    if (
        state.partyEvents
    ) {

        state.partyEvents.close();

        state.partyEvents =
            null;
    }
}


function connectPartyEvents() {

    clearTimeout(
        state.partyReconnectTimer
    );


    closePartyEvents();


    if (
        !state.party?.code ||
        !state.partyClientId
    ) {

        return;
    }


    const params =
        new URLSearchParams({

            partyCode:
                state.party.code,

            clientId:
                state.partyClientId
        });


    const source =
        new EventSource(
            `/api/party/events?${params}`
        );


    state.partyEvents =
        source;


    source.addEventListener(
        "party",
        event => {

            try {

                const party =
                    JSON.parse(
                        event.data
                    );


                applyPartyState(
                    party
                );

            } catch {

                showToast(
                    "Ошибка обновления игры.",
                    "error"
                );
            }
        }
    );


    source.onopen =
        () => {

            if (
                state.partyEvents ===
                source
            ) {

                updatePartyConnection();
            }
        };


    source.onerror =
        () => {

            if (
                state.partyEvents !==
                source
            ) {

                return;
            }


            if (
                connectionBadge
            ) {

                connectionBadge.textContent =
                    "Переподключение...";

                connectionBadge.className =
                    "status-chip connection-solo";
            }


            source.close();


            state.partyEvents =
                null;


            clearTimeout(
                state.partyReconnectTimer
            );


            state.partyReconnectTimer =
                setTimeout(
                    () => {

                        if (
                            state.mode ===
                                "party" &&
                            state.party
                        ) {

                            connectPartyEvents();
                        }

                    },
                    2500
                );
        };
}


/* =========================================================
   PARTY CLOCK DISPLAY
========================================================= */


function getPartyDisplayedClock(
    color
) {

    let seconds =
        Number(
            state.clocks[color] ||
            0
        );


    if (
        state.clocks.running &&
        state.clocks.turn === color
    ) {

        const elapsed =
            (
                Date.now() -
                state.partyClockSyncedAt
            ) / 1000;


        seconds =
            Math.max(
                0,
                seconds -
                elapsed
            );
    }


    return seconds;
}


/* =========================================================
   PARTY MOVE
========================================================= */


async function performPartyMove(
    from,
    to,
    promotion
) {

    if (
        !state.party ||
        !state.partyClientId
    ) {

        return;
    }


    if (
        !canUserMove()
    ) {

        return;
    }


    try {

        const response =
            await fetch(
                "/api/party/move",
                {

                    method:
                        "POST",

                    headers: {

                        "Content-Type":
                            "application/json"
                    },

                    body:
                        JSON.stringify({

                            partyCode:
                                state.party.code,

                            clientId:
                                state.partyClientId,

                            from,

                            to,

                            promotion:
                                promotion ||
                                null
                        })
                }
            );


        const data =
            await response.json();


        if (
            data.party
        ) {

            applyPartyState(
                data.party
            );
        }


        if (
            !data.ok
        ) {

            showToast(
                data.error ||
                "Ход отклонён.",
                "error"
            );
        }

    } catch (error) {

        showToast(
            error.message ||
            "Ошибка соединения.",
            "error"
        );
    }
}


/* =========================================================
   NEW PARTY GAME
========================================================= */


async function newPartyGame() {

    if (
        !state.party ||
        !state.partyClientId
    ) {

        return;
    }


    if (
        state.party.ownerId !==
        state.partyClientId
    ) {

        showToast(
            "Только владелец комнаты может начать новую игру.",
            "error"
        );

        return;
    }


    try {

        const response =
            await fetch(
                "/api/party/new-game",
                {

                    method:
                        "POST",

                    headers: {

                        "Content-Type":
                            "application/json"
                    },

                    body:
                        JSON.stringify({

                            partyCode:
                                state.party.code,

                            clientId:
                                state.partyClientId
                        })
                }
            );


        const data =
            await response.json();


        if (!data.ok) {

            throw new Error(
                data.error
            );
        }


        applyPartyState(
            data.party
        );


        showToast(
            "Новая партия началась.",
            "success"
        );

    } catch (error) {

        showToast(
            error.message ||
            "Не удалось начать новую игру.",
            "error"
        );
    }
}


/* =========================================================
   LEAVE
========================================================= */


async function leaveParty() {

    const partyCode =
        state.party?.code;


    if (
        state.party &&
        state.partyClientId
    ) {

        try {

            await fetch(
                "/api/party/leave",
                {

                    method:
                        "POST",

                    headers: {

                        "Content-Type":
                            "application/json"
                    },

                    body:
                        JSON.stringify({

                            partyCode,

                            clientId:
                                state.partyClientId
                        })
                }
            );

        } catch {
            // ignore
        }
    }


    closePartyEvents();


    removePartyClientId(
        partyCode
    );


    state.party =
        null;


    state.partyClientId =
        null;


    state.gameStarted =
        false;


    state.engine =
        new ChessEngine();


    state.selected =
        null;


    state.legalMoves =
        [];


    $("leavePartyButton")
        ?.classList
        .add(
            "hidden"
        );


    $("copyInviteButton")
        ?.classList
        .add(
            "hidden"
        );


    $("newGameToolbarButton")
        ?.classList
        .add(
            "hidden"
        );


    $("partySummary")
        ?.textContent =
        "Создайте комнату, чтобы играть белыми.";


    updateGameUI();
}


/* =========================================================
   COPY INVITE
========================================================= */


async function copyInvite() {

    if (
        !state.party?.code
    ) {

        return;
    }


    const url =
        `${location.origin}${location.pathname}?party=${state.party.code}`;


    try {

        await navigator.clipboard.writeText(
            url
        );


        showToast(
            "Ссылка скопирована.",
            "success"
        );

    } catch {

        showToast(
            `Код комнаты: ${state.party.code}`
        );
    }
}


/* =========================================================
   URL PARTY
========================================================= */


function loadPartyFromUrl() {

    const code =
        new URLSearchParams(
            location.search
        ).get("party");


    if (!code) {
        return;
    }


    switchMode(
        "party"
    );


    $("partyCodeInput")
        ?.value =
        code.toUpperCase();
}


/* =========================================================
   FLIP
========================================================= */


function flipBoard() {

    state.orientation =
        state.orientation === "w"
            ? "b"
            : "w";


    renderBoard();
}


/* =========================================================
   CLOCK UPDATE
========================================================= */


function updateClocks() {

    let white =
        state.clocks.white;


    let black =
        state.clocks.black;


    if (
        state.mode === "party"
    ) {

        white =
            getPartyDisplayedClock(
                "white"
            );


        black =
            getPartyDisplayedClock(
                "black"
            );
    }


    if (whiteClock) {

        whiteClock.textContent =
            formatTime(
                white
            );


        whiteClock.classList.toggle(
            "active",
            state.clocks.running &&
            state.clocks.turn === "w"
        );


        whiteClock.classList.toggle(
            "low",
            white > 0 &&
            white < 30
        );
    }


    if (blackClock) {

        blackClock.textContent =
            formatTime(
                black
            );


        blackClock.classList.toggle(
            "active",
            state.clocks.running &&
            state.clocks.turn === "b"
        );


        blackClock.classList.toggle(
            "low",
            black > 0 &&
            black < 30
        );
    }
}


function formatTime(
    seconds
) {

    if (
        !seconds
    ) {

        return "—";
    }


    const value =
        Math.max(
            0,
            Math.ceil(
                seconds
            )
        );


    const minutes =
        Math.floor(
            value / 60
        );


    const remaining =
        value % 60;


    return (
        String(minutes)
            .padStart(
                2,
                "0"
            ) +
        ":" +
        String(remaining)
            .padStart(
                2,
                "0"
            )
    );
}


/* =========================================================
   CLOCK UI TIMER
========================================================= */


function startClockTimer() {

    clearInterval(
        state.clockTimer
    );


    state.clockTimer =
        setInterval(
            () => {

                if (
                    state.mode ===
                    "ai"
                ) {

                    updateLocalClock();

                } else {

                    /*
                     * Party clock is only
                     * visual interpolation.
                     *
                     * Server remains authoritative.
                     */

                    updateClocks();
                }

            },
            250
        );
}


/* =========================================================
   EVENTS
========================================================= */


function bindEvents() {

    modeAiButton?.addEventListener(
        "click",
        () =>
            switchMode("ai")
    );


    modePartyButton?.addEventListener(
        "click",
        () =>
            switchMode("party")
    );


    $("startAiButton")
        ?.addEventListener(
            "click",
            startNewAiGame
        );


    $("newGameToolbarButton")
        ?.addEventListener(
            "click",
            () => {

                if (
                    state.mode ===
                    "party"
                ) {

                    newPartyGame();

                } else {

                    startNewAiGame();
                }
            }
        );


    $("flipBoardButton")
        ?.addEventListener(
            "click",
            flipBoard
        );


    $("createPartyButton")
        ?.addEventListener(
            "click",
            createParty
        );


    $("joinPartyButton")
        ?.addEventListener(
            "click",
            joinParty
        );


    $("leavePartyButton")
        ?.addEventListener(
            "click",
            leaveParty
        );


    $("copyInviteButton")
        ?.addEventListener(
            "click",
            copyInvite
        );


    promotionDialog
        ?.addEventListener(
            "click",
            event => {

                if (
                    event.target ===
                    promotionDialog
                ) {

                    promotionDialog
                        .classList
                        .add(
                            "hidden"
                        );

                    state.promotionResolver =
                        null;
                }
            }
        );
}


/* =========================================================
   INITIALIZE
========================================================= */


function initialize() {

    bindEvents();


    state.engine =
        new ChessEngine();


    state.orientation =
        "w";


    state.gameStarted =
        false;


    resetClockFromSelect(
        $("aiClockSelect")
            ?.value ||
        "10+0"
    );


    setupAiPlayers();


    updateGameUI();


    startClockTimer();


    loadPartyFromUrl();
}


initialize();
