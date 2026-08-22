import {
    ChessEngine,
    ChessRules,
} from "/shared/chess-engine.js";

import {
    chooseComputerMove,
} from "/js/ai.js";


/* =========================================================
   PIECES
========================================================= */

const PIECE_GLYPHS = {
    w: {
        K: "♔",
        Q: "♕",
        R: "♖",
        B: "♗",
        N: "♘",
        P: "♙",
    },

    b: {
        K: "♚",
        Q: "♛",
        R: "♜",
        B: "♝",
        N: "♞",
        P: "♟",
    },
};


/* =========================================================
   STORAGE
========================================================= */

const STORAGE_KEYS = {
    name: "chess-party:name",
    partyIds: "chess-party:party-ids",
};


/* =========================================================
   TIME CONTROLS
========================================================= */

const TIME_CONTROLS = {
    none: 0,

    "1+0": 60,
    "3+0": 180,
    "3+2": 180,
    "5+0": 300,
    "5+3": 300,
    "10+0": 600,
    "15+10": 900,
    "30+0": 1800,
    "30+20": 1800,
};


/* =========================================================
   ELEMENTS
========================================================= */

const elements = {
    modeBadge: document.querySelector("#modeBadge"),
    connectionBadge: document.querySelector("#connectionBadge"),

    board: document.querySelector("#board"),

    statusMessage: document.querySelector("#statusMessage"),
    turnBadge: document.querySelector("#turnBadge"),

    modeAiButton: document.querySelector("#modeAiButton"),
    modePartyButton: document.querySelector("#modePartyButton"),

    playerNameInput: document.querySelector("#playerNameInput"),

    aiControls: document.querySelector("#aiControls"),
    partyControls: document.querySelector("#partyControls"),

    aiLevelSelect: document.querySelector("#aiLevelSelect"),
    playerColorSelect: document.querySelector("#playerColorSelect"),

    aiTimeControl: document.querySelector("#aiClockSelect"),
    partyTimeControl: document.querySelector("#partyClockSelect"),

    startAiButton: document.querySelector("#startAiButton"),
    newGameToolbarButton: document.querySelector("#newGameToolbarButton"),

    createPartyButton: document.querySelector("#createPartyButton"),
    newPartyGameButton: document.querySelector("#newPartyGameButton"),

    partyCodeInput: document.querySelector("#partyCodeInput"),
    joinPartyButton: document.querySelector("#joinPartyButton"),
    leavePartyButton: document.querySelector("#leavePartyButton"),

    partySummary: document.querySelector("#partySummary"),
    copyInviteButton: document.querySelector("#copyInviteButton"),

    flipBoardButton: document.querySelector("#flipBoardButton"),

    whitePlayerLabel: document.querySelector("#whitePlayerLabel"),
    blackPlayerLabel: document.querySelector("#blackPlayerLabel"),

    rosterWhite: document.querySelector("#rosterWhite"),
    rosterBlack: document.querySelector("#rosterBlack"),

    spectatorList: document.querySelector("#spectatorList"),
    spectatorCount: document.querySelector("#spectatorCount"),

    whiteClock: document.querySelector("#whiteClock"),
    blackClock: document.querySelector("#blackClock"),

    capturedByWhite: document.querySelector("#capturedByWhite"),
    capturedByBlack: document.querySelector("#capturedByBlack"),

    moveHistory: document.querySelector("#moveHistory"),

    promotionDialog: document.querySelector("#promotionDialog"),
    promotionOptions: document.querySelector("#promotionOptions"),

    toastHost: document.querySelector("#toastHost"),
};


/* =========================================================
   STATE
========================================================= */

const appState = {
    mode: "ai",

    engine: new ChessEngine(),

    orientation: "w",
    selectedSquare: null,

    aiLevel: "intermediate",
    playerColor: "w",
    aiTimeControl: "10+0",

    isAiThinking: false,
    aiMoveTimer: null,
    aiClockTimer: null,

    pendingPromotionMoves: null,

    playerName: "Guest",

    party: null,
    partySnapshot: null,
    partyStream: null,

    gameOver: false,
    gameOverMessage: null,

    localClocks: {
        white: 0,
        black: 0,
        running: false,
        turn: "w",
        lastTick: 0,
    },
};


/* =========================================================
   HELPERS
========================================================= */

function currentStatus() {
    return (
        appState.engine.state.status ||
        ChessEngine.evaluateStatus(
            appState.engine.state
        )
    );
}


function currentHumanColor() {
    if (appState.mode === "ai") {
        return appState.playerColor;
    }

    if (!appState.party) {
        return null;
    }

    if (appState.party.role === "white") {
        return "w";
    }

    if (appState.party.role === "black") {
        return "b";
    }

    return null;
}


function isHumanTurn() {
    const color = currentHumanColor();
    const status = currentStatus();

    return Boolean(
        color &&
        status.phase === "playing" &&
        appState.engine.state.turn === color &&
        !appState.isAiThinking &&
        !appState.gameOver
    );
}


function isFinished() {
    const status = currentStatus();

    return Boolean(
        appState.gameOver ||
        status.phase === "checkmate" ||
        status.phase === "draw"
    );
}


function getLegalMovesForSelected() {
    if (!appState.selectedSquare) {
        return [];
    }

    return appState.engine.getMovesFrom(
        appState.selectedSquare
    );
}


function clearSelection() {
    appState.selectedSquare = null;
    appState.pendingPromotionMoves = null;
}


function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}


function formatClock(seconds) {
    const total = Math.max(
        0,
        Math.ceil(Number(seconds) || 0)
    );

    const minutes = Math.floor(total / 60);
    const secs = total % 60;

    if (minutes >= 60) {
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;

        return (
            `${String(hours).padStart(2, "0")}:` +
            `${String(mins).padStart(2, "0")}:` +
            `${String(secs).padStart(2, "0")}`
        );
    }

    return (
        `${String(minutes).padStart(2, "0")}:` +
        `${String(secs).padStart(2, "0")}`
    );
}


function getIncrementForTimeControl(value) {
    const parts = String(value || "").split("+");
    return Number(parts[1] || 0);
}


function getTimeControlSeconds(value) {
    return TIME_CONTROLS[value] || 0;
}


/* =========================================================
   TOAST
========================================================= */

function showToast(message, type = "info") {
    if (!elements.toastHost) {
        console.log(message);
        return;
    }

    const toast = document.createElement("div");

    toast.className = `toast ${type}`;
    toast.textContent = message;

    elements.toastHost.appendChild(toast);

    window.setTimeout(() => {
        toast.remove();
    }, 3200);
}


/* =========================================================
   MODE
========================================================= */

function setMode(mode) {
    appState.mode = mode;

    const isAi = mode === "ai";
    const isParty = mode === "party";

    elements.modeAiButton?.classList.toggle(
        "active",
        isAi
    );

    elements.modePartyButton?.classList.toggle(
        "active",
        isParty
    );

    elements.aiControls?.classList.toggle(
        "hidden",
        !isAi
    );

    elements.partyControls?.classList.toggle(
        "hidden",
        !isParty
    );

    if (elements.modeBadge) {
        elements.modeBadge.textContent =
            isAi
                ? "AI Arena"
                : "Party Lounge";
    }
}


/* =========================================================
   URL
========================================================= */

function updatePartyUrl(code = null) {
    const url = new URL(window.location.href);

    if (code) {
        url.searchParams.set("party", code);
    } else {
        url.searchParams.delete("party");
    }

    window.history.replaceState(
        {},
        "",
        url
    );
}


/* =========================================================
   BOARD
========================================================= */

function renderBoard() {
    if (!elements.board) {
        return;
    }

    elements.board.innerHTML = "";

    const selectedMoves =
        getLegalMovesForSelected();

    const moveTargets = new Map();

    for (const move of selectedMoves) {
        moveTargets.set(move.to, move);
    }

    const orientation = appState.orientation;

    const xOrder =
        orientation === "w"
            ? [0, 1, 2, 3, 4, 5, 6, 7]
            : [7, 6, 5, 4, 3, 2, 1, 0];

    const yOrder =
        orientation === "w"
            ? [7, 6, 5, 4, 3, 2, 1, 0]
            : [0, 1, 2, 3, 4, 5, 6, 7];

    const status = currentStatus();

    const checkColor =
        status.check
            ? appState.engine.state.turn
            : null;

    const lastMove =
        appState.engine.state.lastMove;

    for (const y of yOrder) {
        for (const x of xOrder) {
            const squareName =
                ChessRules.toSquare(x, y);

            const piece =
                appState.engine.state.board[y][x];

            const square =
                document.createElement("button");

            square.type = "button";

            /*
             * ВАЖНО:
             * Теперь цвет клетки задаётся непосредственно
             * через .light / .dark.
             */
            const isDark =
                (x + y) % 2 === 0;

            square.className =
                `square ${
                    isDark ? "dark" : "light"
                }`;

            square.dataset.square =
                squareName;

            /* Selected */
            if (
                appState.selectedSquare ===
                squareName
            ) {
                square.classList.add(
                    "selected"
                );
            }

            /* Legal move */
            const move =
                moveTargets.get(squareName);

            if (move) {
                square.classList.add(
                    move.capture
                        ? "capture-target"
                        : "legal-target"
                );
            }

            /* Last move */
            if (
                lastMove &&
                (
                    lastMove.from === squareName ||
                    lastMove.to === squareName
                )
            ) {
                square.classList.add(
                    "last-move"
                );
            }

            /* Check */
            if (
                piece &&
                piece.type === "K" &&
                piece.color === checkColor
            ) {
                square.classList.add(
                    "check-square"
                );
            }

            /* Piece */
            if (piece) {
                const pieceNode =
                    document.createElement("span");

                pieceNode.className =
                    `piece ${
                        piece.color === "w"
                            ? "white"
                            : "black"
                    }`;

                pieceNode.textContent =
                    PIECE_GLYPHS[
                        piece.color
                    ][piece.type];

                pieceNode.setAttribute(
                    "aria-hidden",
                    "true"
                );

                square.appendChild(
                    pieceNode
                );
            }

            square.addEventListener(
                "click",
                () => handleSquareClick(
                    squareName
                )
            );

            elements.board.appendChild(
                square
            );
        }
    }
}


/* =========================================================
   GAME STATUS
========================================================= */

function formatStatus() {
    if (appState.gameOver) {
        return getGameOverMessage();
    }

    const status = currentStatus();

    if (status.phase === "checkmate") {
        return "Мат";
    }

    if (status.phase === "draw") {
        return "Ничья";
    }

    if (status.check) {
        return appState.engine.state.turn === "w"
            ? "Белые под шахом"
            : "Чёрные под шахом";
    }

    return appState.engine.state.turn === "w"
        ? "Ход белых"
        : "Ход чёрных";
}


function getGameOverMessage() {
    const snapshot =
        appState.partySnapshot;

    if (!snapshot) {
        return (
            appState.gameOverMessage ||
            "Игра окончена."
        );
    }

    const reason =
        snapshot.gameOverReason;

    const winner =
        snapshot.winner;

    switch (reason) {
        case "timeout":
            return winner === "w"
                ? "Белые победили по времени."
                : "Чёрные победили по времени.";

        case "checkmate":
            return winner === "w"
                ? "Белые победили матом."
                : "Чёрные победили матом.";

        case "draw":
            return "Ничья.";

        default:
            return (
                appState.gameOverMessage ||
                "Игра окончена."
            );
    }
}


/* =========================================================
   ROSTER
========================================================= */

function renderRoster() {
    if (appState.mode === "ai") {
        const human =
            appState.playerName || "Вы";

        const whiteName =
            appState.playerColor === "w"
                ? human
                : `Компьютер (${appState.aiLevel})`;

        const blackName =
            appState.playerColor === "b"
                ? human
                : `Компьютер (${appState.aiLevel})`;

        if (elements.whitePlayerLabel) {
            elements.whitePlayerLabel.textContent =
                whiteName;
        }

        if (elements.blackPlayerLabel) {
            elements.blackPlayerLabel.textContent =
                blackName;
        }

        if (elements.rosterWhite) {
            elements.rosterWhite.textContent =
                whiteName;
        }

        if (elements.rosterBlack) {
            elements.rosterBlack.textContent =
                blackName;
        }

        if (elements.spectatorList) {
            elements.spectatorList.innerHTML =
                "<li>В режиме AI зрителей нет</li>";
        }

        if (elements.spectatorCount) {
            elements.spectatorCount.textContent =
                "0 / 20";
        }

        return;
    }

    const white =
        appState.partySnapshot?.players?.white;

    const black =
        appState.partySnapshot?.players?.black;

    const whiteName =
        white
            ? `${white.name}${
                white.connected
                    ? ""
                    : " · офлайн"
            }`
            : "Свободно";

    const blackName =
        black
            ? `${black.name}${
                black.connected
                    ? ""
                    : " · офлайн"
            }`
            : "Свободно";

    if (elements.whitePlayerLabel) {
        elements.whitePlayerLabel.textContent =
            whiteName;
    }

    if (elements.blackPlayerLabel) {
        elements.blackPlayerLabel.textContent =
            blackName;
    }

    if (elements.rosterWhite) {
        elements.rosterWhite.textContent =
            whiteName;
    }

    if (elements.rosterBlack) {
        elements.rosterBlack.textContent =
            blackName;
    }

    const spectators =
        appState.partySnapshot?.spectators || [];

    if (elements.spectatorCount) {
        elements.spectatorCount.textContent =
            `${spectators.length} / 20`;
    }

    if (!elements.spectatorList) {
        return;
    }

    if (!spectators.length) {
        elements.spectatorList.innerHTML =
            "<li>Пока никого нет</li>";

        return;
    }

    elements.spectatorList.innerHTML =
        spectators
            .map(
                spectator =>
                    `<li>${escapeHtml(
                        spectator.name
                    )}${
                        spectator.connected
                            ? ""
                            : " · офлайн"
                    }</li>`
            )
            .join("");
}


/* =========================================================
   CAPTURED PIECES
========================================================= */

function renderCaptured() {
    if (
        !elements.capturedByWhite &&
        !elements.capturedByBlack
    ) {
        return;
    }

    /*
     * Поддерживаем несколько возможных форматов
     * истории движка, если они присутствуют.
     */
    const history =
        appState.engine.state.moveHistory ||
        appState.engine.state.history ||
        [];

    const whiteCaptured = [];
    const blackCaptured = [];

    for (const move of history) {
        if (!move) {
            continue;
        }

        const captured =
            move.captured ||
            move.capturedPiece ||
            null;

        if (!captured) {
            continue;
        }

        const color =
            captured.color ||
            (captured.type
                ? (move.color === "w" ? "b" : "w")
                : null);

        const type =
            captured.type ||
            (
                typeof captured === "string"
                    ? captured
                    : null
            );

        if (!type) {
            continue;
        }

        const glyph =
            PIECE_GLYPHS[color]?.[type];

        if (!glyph) {
            continue;
        }

        if (move.color === "w") {
            whiteCaptured.push(glyph);
        } else {
            blackCaptured.push(glyph);
        }
    }

    if (elements.capturedByWhite) {
        elements.capturedByWhite.textContent =
            whiteCaptured.join(" ");
    }

    if (elements.capturedByBlack) {
        elements.capturedByBlack.textContent =
            blackCaptured.join(" ");
    }
}


/* =========================================================
   MOVE HISTORY
========================================================= */

function renderMoveHistory() {
    if (!elements.moveHistory) {
        return;
    }

    const history =
        appState.engine.state.moveHistory ||
        appState.engine.state.history ||
        [];

    if (!Array.isArray(history) || !history.length) {
        elements.moveHistory.innerHTML =
            "<li class=\"empty-state\">Ходов пока нет</li>";

        return;
    }

    elements.moveHistory.innerHTML =
        history
            .map((move, index) => {
                if (typeof move === "string") {
                    return `<li>${escapeHtml(move)}</li>`;
                }

                const from =
                    move?.from || "";

                const to =
                    move?.to || "";

                const promotion =
                    move?.promotion
                        ? `=${String(move.promotion).toUpperCase()}`
                        : "";

                const text =
                    from && to
                        ? `${from} → ${to}${promotion}`
                        : JSON.stringify(move);

                return (
                    `<li>${escapeHtml(
                        `${index + 1}. ${text}`
                    )}</li>`
                );
            })
            .join("");
}


/* =========================================================
   PARTY SUMMARY
========================================================= */

function renderPartySummary() {
    if (!elements.partySummary) {
        return;
    }

    if (!appState.party) {
        elements.partySummary.textContent =
            "Создайте комнату, чтобы играть белыми. Следующий игрок присоединится за чёрных. До 20 зрителей.";

        return;
    }

    const role =
        appState.party.role;

    const roleText =
        role === "white"
            ? "вы играете белыми"
            : role === "black"
                ? "вы играете чёрными"
                : "вы зритель";

    const timeLabel =
        appState.partySnapshot
            ?.timeControl?.label ||
        "Без часов";

    elements.partySummary.textContent =
        `Комната ${appState.party.code} · ${roleText} · ${timeLabel}.`;
}


/* =========================================================
   CLOCKS
========================================================= */

function renderClocks() {
    let clocks;
    let timeControl;

    if (appState.mode === "party") {
        clocks =
            appState.partySnapshot?.clocks;

        timeControl =
            appState.partySnapshot?.timeControl;
    } else {
        clocks =
            appState.localClocks;

        timeControl = {
            initial:
                getTimeControlSeconds(
                    appState.aiTimeControl
                ),

            label:
                elements.aiTimeControl
                    ?.selectedOptions?.[0]
                    ?.textContent ||
                "Без часов",
        };
    }

    const enabled =
        Boolean(
            timeControl?.initial > 0
        );

    if (!enabled) {
        if (elements.whiteClock) {
            elements.whiteClock.textContent = "∞";

            elements.whiteClock.classList.remove(
                "active",
                "low",
                "danger"
            );
        }

        if (elements.blackClock) {
            elements.blackClock.textContent = "∞";

            elements.blackClock.classList.remove(
                "active",
                "low",
                "danger"
            );
        }

        return;
    }

    const white =
        clocks?.white ?? 0;

    const black =
        clocks?.black ?? 0;

    if (elements.whiteClock) {
        elements.whiteClock.textContent =
            formatClock(white);

        elements.whiteClock.classList.toggle(
            "active",
            clocks?.turn === "w" &&
            clocks?.running
        );

        elements.whiteClock.classList.toggle(
            "low",
            white <= 10
        );

        elements.whiteClock.classList.toggle(
            "danger",
            white <= 5
        );
    }

    if (elements.blackClock) {
        elements.blackClock.textContent =
            formatClock(black);

        elements.blackClock.classList.toggle(
            "active",
            clocks?.turn === "b" &&
            clocks?.running
        );

        elements.blackClock.classList.toggle(
            "low",
            black <= 10
        );

        elements.blackClock.classList.toggle(
            "danger",
            black <= 5
        );
    }
}


/* =========================================================
   CONNECTION BADGE
========================================================= */

function renderConnectionBadge() {
    if (!elements.connectionBadge) {
        return;
    }

    if (appState.mode === "ai") {
        elements.connectionBadge.textContent =
            appState.isAiThinking
                ? "Компьютер думает"
                : `AI · ${appState.aiLevel}`;

        elements.connectionBadge.className =
            "status-chip connection-solo";

        return;
    }

    if (!appState.party) {
        elements.connectionBadge.textContent =
            "Party ожидание";

        elements.connectionBadge.className =
            "status-chip connection-solo";

        return;
    }

    const role =
        appState.party.role === "white"
            ? "Белые"
            : appState.party.role === "black"
                ? "Чёрные"
                : "Зритель";

    elements.connectionBadge.textContent =
        `${appState.party.code} · ${role}`;

    elements.connectionBadge.className =
        "status-chip connection-party";
}


/* =========================================================
   STATUS BADGE
========================================================= */

function renderTurnBadge() {
    if (!elements.turnBadge) {
        return;
    }

    const turn =
        appState.engine.state.turn;

    elements.turnBadge.classList.toggle(
        "turn-white",
        turn === "w"
    );

    elements.turnBadge.classList.toggle(
        "turn-black",
        turn === "b"
    );
}


/* =========================================================
   RENDER
========================================================= */

function render() {
    renderBoard();
    renderRoster();
    renderPartySummary();
    renderClocks();
    renderConnectionBadge();
    renderTurnBadge();
    renderCaptured();
    renderMoveHistory();

    const status =
        formatStatus();

    if (elements.turnBadge) {
        elements.turnBadge.textContent =
            status;
    }

    if (elements.statusMessage) {
        elements.statusMessage.textContent =
            status;
    }

    elements.copyInviteButton?.classList.toggle(
        "hidden",
        !appState.party
    );

    elements.leavePartyButton?.classList.toggle(
        "hidden",
        !appState.party
    );
}


/* =========================================================
   PROMOTION
========================================================= */

function openPromotionDialog(moves) {
    appState.pendingPromotionMoves =
        moves;

    if (!elements.promotionOptions) {
        return;
    }

    elements.promotionOptions.innerHTML = "";

    for (const move of moves) {
        const button =
            document.createElement("button");

        button.type = "button";
        button.className =
            "promotion-button";

        const promotion =
            String(move.promotion || "Q")
                .toUpperCase();

        button.textContent =
            PIECE_GLYPHS[
                move.color ||
                appState.engine.state.turn
            ][promotion];

        button.addEventListener(
            "click",
            () => {
                closePromotionDialog();
                submitMove(move);
            }
        );

        elements.promotionOptions.appendChild(
            button
        );
    }

    elements.promotionDialog?.classList.remove(
        "hidden"
    );
}


function closePromotionDialog() {
    appState.pendingPromotionMoves = null;

    elements.promotionDialog?.classList.add(
        "hidden"
    );
}


/* =========================================================
   MOVE
========================================================= */

async function submitMove(move) {
    if (appState.gameOver) {
        return;
    }

    clearSelection();

    if (
        appState.mode === "party" &&
        appState.party
    ) {
        const response =
            await postJson(
                "/api/party/move",
                {
                    partyCode:
                        appState.party.code,

                    clientId:
                        appState.party.clientId,

                    from: move.from,
                    to: move.to,

                    promotion:
                        move.promotion || null,
                }
            );

        if (!response.ok) {
            if (response.party) {
                hydratePartyState(
                    response.party,
                    false
                );
            }

            showToast(
                response.error ||
                    "Ход отклонён.",
                "error"
            );

            return;
        }

        hydratePartyState(
            response.party,
            false
        );

        return;
    }

    const result =
        appState.engine.makeMove({
            from: move.from,
            to: move.to,
            promotion:
                move.promotion || null,
        });

    if (!result.ok) {
        showToast(
            result.error ||
                "Недопустимый ход.",
            "error"
        );

        return;
    }

    updateAiClockAfterMove();

    render();

    scheduleAiTurn();
}


/* =========================================================
   BOARD INPUT
========================================================= */

function handleSquareClick(square) {
    if (
        appState.pendingPromotionMoves ||
        appState.gameOver
    ) {
        return;
    }

    if (!isHumanTurn()) {
        clearSelection();
        renderBoard();
        return;
    }

    const piece =
        appState.engine.getPiece(square);

    if (appState.selectedSquare) {
        const matchingMoves =
            getLegalMovesForSelected()
                .filter(
                    move =>
                        move.to === square
                );

        if (matchingMoves.length === 1) {
            submitMove(
                matchingMoves[0]
            );

            return;
        }

        if (matchingMoves.length > 1) {
            openPromotionDialog(
                matchingMoves
            );

            return;
        }
    }

    const humanColor =
        currentHumanColor();

    if (
        piece &&
        piece.color === humanColor &&
        piece.color ===
            appState.engine.state.turn
    ) {
        appState.selectedSquare =
            appState.selectedSquare === square
                ? null
                : square;

        renderBoard();

        return;
    }

    clearSelection();
    renderBoard();
}


/* =========================================================
   AI
========================================================= */

function scheduleAiTurn() {
    stopAiMoveTimer();

    if (appState.mode !== "ai") {
        return;
    }

    const status = currentStatus();

    if (
        !status ||
        status.phase !== "playing" ||
        appState.gameOver
    ) {
        appState.isAiThinking = false;
        render();
        return;
    }

    if (
        appState.engine.state.turn ===
        appState.playerColor
    ) {
        appState.isAiThinking = false;
        render();
        return;
    }

    appState.isAiThinking = true;
    render();

    appState.aiMoveTimer =
        window.setTimeout(
            () => {
                appState.aiMoveTimer = null;

                if (
                    appState.mode !== "ai" ||
                    appState.gameOver
                ) {
                    appState.isAiThinking = false;
                    render();
                    return;
                }

                const move =
                    chooseComputerMove(
                        appState.engine,
                        appState.aiLevel
                    );

                appState.isAiThinking = false;

                if (!move) {
                    render();
                    return;
                }

                submitMove(move);
            },
            400
        );
}


function stopAiMoveTimer() {
    if (appState.aiMoveTimer) {
        window.clearTimeout(
            appState.aiMoveTimer
        );

        appState.aiMoveTimer = null;
    }

    appState.isAiThinking = false;
}


/* =========================================================
   AI CLOCK
========================================================= */

function startAiClock() {
    stopAiClock();

    const seconds =
        getTimeControlSeconds(
            appState.aiTimeControl
        );

    appState.localClocks = {
        white: seconds,
        black: seconds,

        running: seconds > 0,

        turn:
            appState.engine.state.turn,

        lastTick:
            Date.now(),
    };

    render();

    if (!seconds) {
        return;
    }

    appState.aiClockTimer =
        window.setInterval(
            () => {
                updateAiClock();
                renderClocks();
            },
            250
        );
}


function stopAiClock() {
    if (appState.aiClockTimer) {
        window.clearInterval(
            appState.aiClockTimer
        );

        appState.aiClockTimer = null;
    }
}


function updateAiClock() {
    if (
        appState.mode !== "ai" ||
        appState.gameOver
    ) {
        return;
    }

    const clocks =
        appState.localClocks;

    if (!clocks.running) {
        return;
    }

    const now = Date.now();

    const elapsed =
        Math.max(
            0,
            (now - clocks.lastTick) / 1000
        );

    if (!elapsed) {
        return;
    }

    clocks.lastTick = now;

    const color =
        clocks.turn;

    const key =
        color === "w"
            ? "white"
            : "black";

    clocks[key] =
        Math.max(
            0,
            clocks[key] - elapsed
        );

    if (clocks[key] <= 0) {
        clocks.running = false;

        appState.gameOver = true;

        appState.gameOverMessage =
            color === "w"
                ? "Чёрные победили по времени."
                : "Белые победили по времени.";

        stopAiClock();

        showToast(
            appState.gameOverMessage,
            "error"
        );

        render();
    }
}


function updateAiClockAfterMove() {
    const clocks =
        appState.localClocks;

    if (!clocks.running) {
        return;
    }

    updateAiClock();

    if (appState.gameOver) {
        return;
    }

    const previousTurn =
        clocks.turn;

    const key =
        previousTurn === "w"
            ? "white"
            : "black";

    clocks[key] +=
        getIncrementForTimeControl(
            appState.aiTimeControl
        );

    clocks.turn =
        appState.engine.state.turn;

    clocks.lastTick =
        Date.now();
}


/* =========================================================
   LOCAL GAME
========================================================= */

function resetLocalGame() {
    stopAiMoveTimer();
    stopAiClock();

    closePromotionDialog();

    appState.engine =
        new ChessEngine();

    appState.partySnapshot = null;
    appState.selectedSquare = null;

    appState.orientation =
        appState.playerColor;

    appState.gameOver = false;
    appState.gameOverMessage = null;

    startAiClock();
    scheduleAiTurn();
}


/* =========================================================
   API
========================================================= */

async function postJson(url, body) {
    try {
        const response =
            await fetch(
                url,
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json",
                    },

                    body:
                        JSON.stringify(body),
                }
            );

        const contentType =
            response.headers.get(
                "content-type"
            ) || "";

        if (
            !contentType.includes(
                "application/json"
            )
        ) {
            return {
                ok: false,

                error:
                    `Сервер вернул ${response.status} вместо JSON.`,
            };
        }

        return await response.json();
    } catch (error) {
        return {
            ok: false,

            error:
                error instanceof Error
                    ? error.message
                    : "Ошибка сети.",
        };
    }
}


/* =========================================================
   PARTY STATE
========================================================= */

function hydratePartyState(
    partyPayload,
    announce = true
) {
    if (!partyPayload) {
        return;
    }

    const previousCode =
        appState.party?.code;

    const previousClientId =
        appState.party?.clientId;

    appState.party = {
        code:
            partyPayload.code,

        clientId:
            partyPayload.you?.id ||
            previousClientId ||
            null,

        role:
            partyPayload.you?.role ||
            appState.party?.role ||
            "spectator",
    };

    appState.partySnapshot =
        partyPayload;

    appState.engine =
        new ChessEngine(
            partyPayload.game
        );

    appState.selectedSquare = null;

    appState.gameOver =
        Boolean(
            partyPayload.gameOverReason
        );

    appState.gameOverMessage =
        appState.gameOver
            ? getGameOverMessage()
            : null;

    if (
        appState.party.role === "white"
    ) {
        appState.orientation = "w";
    } else if (
        appState.party.role === "black"
    ) {
        appState.orientation = "b";
    }

    setMode("party");

    updatePartyUrl(
        partyPayload.code
    );

    render();

    if (
        announce &&
        partyPayload.gameOverReason
    ) {
        showToast(
            getGameOverMessage(),
            "success"
        );
    }

    if (
        previousCode &&
        previousCode !== partyPayload.code
    ) {
        console.info(
            "Party changed:",
            previousCode,
            "→",
            partyPayload.code
        );
    }
}


/* =========================================================
   PARTY SSE
========================================================= */

function connectPartyStream() {
    if (!appState.party) {
        return;
    }

    closePartyStream();

    const {
        code,
        clientId,
    } = appState.party;

    const url =
        `/api/party/events?partyCode=${
            encodeURIComponent(code)
        }&clientId=${
            encodeURIComponent(clientId)
        }`;

    const stream =
        new EventSource(url);

    stream.addEventListener(
        "party",
        event => {
            try {
                const party =
                    JSON.parse(
                        event.data
                    );

                hydratePartyState(
                    party,
                    false
                );
            } catch (error) {
                console.error(
                    "Party SSE error:",
                    error
                );
            }
        }
    );

    stream.onerror = () => {
        if (
            appState.mode === "party" &&
            elements.connectionBadge
        ) {
            elements.connectionBadge.textContent =
                `Party ${code} · переподключение`;
        }
    };

    appState.partyStream = stream;
}


function closePartyStream() {
    if (appState.partyStream) {
        appState.partyStream.close();
        appState.partyStream = null;
    }
}


/* =========================================================
   CREATE PARTY
========================================================= */

async function createParty() {
    if (appState.party) {
        await leaveParty(true);
    }

    const timeControl =
        elements.partyTimeControl?.value ||
        "10+0";

    const response =
        await postJson(
            "/api/party/create",
            {
                name:
                    appState.playerName,

                timeControl,
            }
        );

    if (!response.ok) {
        showToast(
            response.error ||
                "Не удалось создать комнату.",
            "error"
        );

        return;
    }

    setStoredPartyId(
        response.party.code,
        response.clientId
    );

    hydratePartyState(
        response.party,
        false
    );

    connectPartyStream();

    showToast(
        `Комната ${response.party.code} создана.`,
        "success"
    );
}


/* =========================================================
   JOIN PARTY
========================================================= */

async function joinParty(code) {
    const normalizedCode =
        String(code || "")
            .trim()
            .toUpperCase();

    if (!normalizedCode) {
        showToast(
            "Введите код комнаты.",
            "error"
        );

        return;
    }

    if (
        appState.party?.code ===
        normalizedCode
    ) {
        showToast(
            `Вы уже в комнате ${normalizedCode}.`
        );

        return;
    }

    if (appState.party) {
        await leaveParty(true);
    }

    const storedIds =
        getStoredPartyIds();

    const response =
        await postJson(
            "/api/party/join",
            {
                name:
                    appState.playerName,

                partyCode:
                    normalizedCode,

                clientId:
                    storedIds[normalizedCode] ||
                    null,
            }
        );

    if (!response.ok) {
        showToast(
            response.error ||
                "Не удалось войти в комнату.",
            "error"
        );

        return;
    }

    setStoredPartyId(
        response.party.code,
        response.clientId
    );

    hydratePartyState(
        response.party,
        false
    );

    connectPartyStream();

    showToast(
        `Вы вошли в комнату ${response.party.code}.`,
        "success"
    );
}


/* =========================================================
   LEAVE PARTY
========================================================= */

async function leaveParty(
    silent = false
) {
    if (!appState.party) {
        return;
    }

    const party =
        appState.party;

    closePartyStream();

    await postJson(
        "/api/party/leave",
        {
            partyCode:
                party.code,

            clientId:
                party.clientId,
        }
    );

    removeStoredPartyId(
        party.code
    );

    appState.party = null;
    appState.partySnapshot = null;

    updatePartyUrl(null);

    setMode("ai");

    resetLocalGame();

    if (!silent) {
        showToast(
            "Вы покинули комнату."
        );
    }
}


/* =========================================================
   INVITE
========================================================= */

async function copyInviteLink() {
    if (!appState.party) {
        return;
    }

    const inviteUrl =
        `${window.location.origin}` +
        `${window.location.pathname}` +
        `?party=${encodeURIComponent(
            appState.party.code
        )}`;

    try {
        await navigator.clipboard.writeText(
            inviteUrl
        );

        showToast(
            "Ссылка скопирована.",
            "success"
        );
    } catch {
        showToast(
            `Код комнаты: ${appState.party.code}`
        );
    }
}


/* =========================================================
   STORAGE
========================================================= */

function getStoredPartyIds() {
    try {
        return JSON.parse(
            localStorage.getItem(
                STORAGE_KEYS.partyIds
            ) || "{}"
        );
    } catch {
        return {};
    }
}


function setStoredPartyId(
    code,
    clientId
) {
    if (!code || !clientId) {
        return;
    }

    const ids =
        getStoredPartyIds();

    ids[code] = clientId;

    localStorage.setItem(
        STORAGE_KEYS.partyIds,
        JSON.stringify(ids)
    );
}


function removeStoredPartyId(code) {
    if (!code) {
        return;
    }

    const ids =
        getStoredPartyIds();

    delete ids[code];

    localStorage.setItem(
        STORAGE_KEYS.partyIds,
        JSON.stringify(ids)
    );
}


/* =========================================================
   EVENTS
========================================================= */

function bindEvents() {
    elements.playerNameInput?.addEventListener(
        "input",
        event => {
            appState.playerName =
                event.target.value.trim() ||
                "Guest";

            localStorage.setItem(
                STORAGE_KEYS.name,
                appState.playerName
            );

            renderRoster();
        }
    );


    elements.aiLevelSelect?.addEventListener(
        "change",
        event => {
            appState.aiLevel =
                event.target.value;

            render();
        }
    );


    elements.playerColorSelect?.addEventListener(
        "change",
        event => {
            appState.playerColor =
                event.target.value;

            if (appState.mode === "ai") {
                resetLocalGame();
            }
        }
    );


    elements.aiTimeControl?.addEventListener(
        "change",
        event => {
            appState.aiTimeControl =
                event.target.value;

            if (appState.mode === "ai") {
                resetLocalGame();
            }
        }
    );


    elements.modeAiButton?.addEventListener(
        "click",
        async () => {
            if (appState.party) {
                await leaveParty(true);
                return;
            }

            setMode("ai");
            resetLocalGame();
        }
    );


    elements.modePartyButton?.addEventListener(
        "click",
        () => {
            setMode("party");
            render();
        }
    );


    elements.startAiButton?.addEventListener(
        "click",
        async () => {
            if (appState.party) {
                await leaveParty(true);
            }

            setMode("ai");
            resetLocalGame();

            showToast(
                "Новая партия с ИИ готова.",
                "success"
            );
        }
    );


    elements.newGameToolbarButton?.addEventListener(
        "click",
        async () => {
            if (appState.mode === "party") {
                showToast(
                    "Для новой партии создайте новую комнату."
                );

                return;
            }

            resetLocalGame();

            showToast(
                "Новая партия.",
                "success"
            );
        }
    );


    elements.createPartyButton?.addEventListener(
        "click",
        createParty
    );


    elements.newPartyGameButton?.addEventListener(
        "click",
        createParty
    );


    elements.joinPartyButton?.addEventListener(
        "click",
        () =>
            joinParty(
                elements.partyCodeInput?.value
            )
    );


    elements.leavePartyButton?.addEventListener(
        "click",
        () => leaveParty(false)
    );


    elements.copyInviteButton?.addEventListener(
        "click",
        copyInviteLink
    );


    elements.flipBoardButton?.addEventListener(
        "click",
        () => {
            appState.orientation =
                appState.orientation === "w"
                    ? "b"
                    : "w";

            renderBoard();
        }
    );


    elements.partyCodeInput?.addEventListener(
        "input",
        event => {
            event.target.value =
                event.target.value
                    .toUpperCase()
                    .replace(
                        /[^A-Z0-9]/g,
                        ""
                    );
        }
    );


    elements.partyCodeInput?.addEventListener(
        "keydown",
        event => {
            if (event.key !== "Enter") {
                return;
            }

            event.preventDefault();

            joinParty(
                elements.partyCodeInput.value
            );
        }
    );


    elements.promotionDialog?.addEventListener(
        "click",
        event => {
            if (
                event.target ===
                elements.promotionDialog
            ) {
                closePromotionDialog();
            }
        }
    );


    window.addEventListener(
        "beforeunload",
        () => {
            stopAiMoveTimer();
            stopAiClock();
            closePartyStream();
        }
    );
}


/* =========================================================
   INIT
========================================================= */

async function init() {
    bindEvents();

    const savedName =
        localStorage.getItem(
            STORAGE_KEYS.name
        );

    if (savedName) {
        appState.playerName =
            savedName;

        if (elements.playerNameInput) {
            elements.playerNameInput.value =
                savedName;
        }
    }

    const params =
        new URLSearchParams(
            window.location.search
        );

    const partyCode =
        params.get("party");

    if (partyCode) {
        setMode("party");

        if (elements.partyCodeInput) {
            elements.partyCodeInput.value =
                partyCode.toUpperCase();
        }

        await joinParty(partyCode);
        return;
    }

    setMode("ai");
    resetLocalGame();
}


/* =========================================================
   START
========================================================= */

init();
