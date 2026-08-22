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
   ELEMENTS
========================================================= */

const elements = {
    modeBadge:
        document.querySelector("#modeBadge"),

    connectionBadge:
        document.querySelector("#connectionBadge"),

    board:
        document.querySelector("#board"),

    statusMessage:
        document.querySelector("#statusMessage"),

    turnBadge:
        document.querySelector("#turnBadge"),

    modeAiButton:
        document.querySelector("#modeAiButton"),

    modePartyButton:
        document.querySelector("#modePartyButton"),

    playerNameInput:
        document.querySelector("#playerNameInput"),

    aiControls:
        document.querySelector("#aiControls"),

    partyControls:
        document.querySelector("#partyControls"),

    aiLevelSelect:
        document.querySelector("#aiLevelSelect"),

    playerColorSelect:
        document.querySelector("#playerColorSelect"),

    aiTimeControl:
        document.querySelector("#aiClockSelect"),

    partyTimeControl:
        document.querySelector("#partyClockSelect"),

    startAiButton:
        document.querySelector("#startAiButton"),

    createPartyButton:
        document.querySelector("#createPartyButton"),

    partyCodeInput:
        document.querySelector("#partyCodeInput"),

    joinPartyButton:
        document.querySelector("#joinPartyButton"),

    leavePartyButton:
        document.querySelector("#leavePartyButton"),

    partySummary:
        document.querySelector("#partySummary"),

    copyInviteButton:
        document.querySelector("#copyInviteButton"),

    flipBoardButton:
        document.querySelector("#flipBoardButton"),

    whitePlayerLabel:
        document.querySelector("#whitePlayerLabel"),

    blackPlayerLabel:
        document.querySelector("#blackPlayerLabel"),

    rosterWhite:
        document.querySelector("#rosterWhite"),

    rosterBlack:
        document.querySelector("#rosterBlack"),

    spectatorList:
        document.querySelector("#spectatorList"),

    spectatorCount:
        document.querySelector("#spectatorCount"),

    whiteClock:
        document.querySelector("#whiteClock"),

    blackClock:
        document.querySelector("#blackClock"),

    resignButton:
        document.querySelector("#resignButton"),

    drawButton:
        document.querySelector("#drawButton"),

    rematchButton:
        document.querySelector("#rematchButton"),

    drawRequest:
        document.querySelector("#drawRequest"),

    drawRequestName:
        document.querySelector("#drawRequestName"),

    acceptDrawButton:
        document.querySelector("#acceptDrawButton"),

    declineDrawButton:
        document.querySelector("#declineDrawButton"),

    chatPanel:
        document.querySelector("#chatPanel"),

    chatMessages:
        document.querySelector("#chatMessages"),

    chatForm:
        document.querySelector("#chatForm"),

    chatInput:
        document.querySelector("#chatInput"),

    promotionDialog:
        document.querySelector("#promotionDialog"),

    promotionOptions:
        document.querySelector("#promotionOptions"),

    toastHost:
        document.querySelector("#toastHost"),
};


/* =========================================================
   STATE
========================================================= */

const appState = {
    mode: "ai",

    engine:
        new ChessEngine(),

    orientation: "w",

    selectedSquare:
        null,

    aiLevel:
        "intermediate",

    playerColor:
        "w",

    aiTimeControl:
        "10+0",

    isAiThinking:
        false,

    pendingPromotionMoves:
        null,

    party:
        null,

    partySnapshot:
        null,

    partyStream:
        null,

    playerName:
        "Guest",

    gameOver:
        false,

    gameOverMessage:
        null,

    drawOfferPending:
        false,

    drawOfferFrom:
        null,

    localClocks: {
        white: 600,
        black: 600,
        running: false,
        lastTick: Date.now(),
        turn: "w",
    },

    aiClockTimer:
        null,
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

    if (
        appState.party.role === "white"
    ) {
        return "w";
    }

    if (
        appState.party.role === "black"
    ) {
        return "b";
    }

    return null;
}


function isHumanTurn() {
    const color =
        currentHumanColor();

    const status =
        currentStatus();

    return Boolean(
        color &&
        status.phase === "playing" &&
        appState.engine.state.turn === color &&
        !appState.isAiThinking &&
        !appState.gameOver
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


function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}


function formatClock(seconds) {
    const safe =
        Math.max(
            0,
            Number(seconds) || 0
        );

    const total =
        Math.ceil(safe);

    const minutes =
        Math.floor(total / 60);

    const secs =
        total % 60;

    if (minutes >= 60) {
        const hours =
            Math.floor(minutes / 60);

        const mins =
            minutes % 60;

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


/* =========================================================
   TOAST
========================================================= */

function showToast(
    message,
    type = "info"
) {
    if (!elements.toastHost) {
        alert(message);
        return;
    }

    const toast =
        document.createElement("div");

    toast.className =
        `toast ${type}`;

    toast.textContent =
        message;

    elements.toastHost.appendChild(
        toast
    );

    window.setTimeout(
        () => toast.remove(),
        3200
    );
}


/* =========================================================
   MODE
========================================================= */

function setMode(mode) {
    appState.mode = mode;

    elements.modeAiButton
        ?.classList.toggle(
            "active",
            mode === "ai"
        );

    elements.modePartyButton
        ?.classList.toggle(
            "active",
            mode === "party"
        );

    elements.aiControls
        ?.classList.toggle(
            "hidden",
            mode !== "ai"
        );

    elements.partyControls
        ?.classList.toggle(
            "hidden",
            mode !== "party"
        );

    elements.chatPanel
        ?.classList.toggle(
            "hidden",
            mode !== "party"
        );

    if (elements.modeBadge) {
        elements.modeBadge.textContent =
            mode === "ai"
                ? "AI Arena"
                : "Party Lounge";
    }

    render();
}


/* =========================================================
   URL
========================================================= */

function updatePartyUrl(code = null) {
    const url =
        new URL(
            window.location.href
        );

    if (code) {
        url.searchParams.set(
            "party",
            code
        );
    } else {
        url.searchParams.delete(
            "party"
        );
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

    const moveTargets =
        new Map(
            selectedMoves.map(
                move => [
                    move.to,
                    move,
                ]
            )
        );

    const orientation =
        appState.orientation;

    const xOrder =
        orientation === "w"
            ? [0, 1, 2, 3, 4, 5, 6, 7]
            : [7, 6, 5, 4, 3, 2, 1, 0];

    const yOrder =
        orientation === "w"
            ? [7, 6, 5, 4, 3, 2, 1, 0]
            : [0, 1, 2, 3, 4, 5, 6, 7];

    const status =
        currentStatus();

    const checkColor =
        status.check
            ? appState.engine.state.turn
            : null;

    const lastMove =
        appState.engine.state.lastMove;

    for (
        const y of yOrder
    ) {
        for (
            const x of xOrder
        ) {
            const squareName =
                ChessRules.toSquare(
                    x,
                    y
                );

            const piece =
                appState.engine.state.board[y][x];

            const square =
                document.createElement(
                    "button"
                );

            square.type = "button";

            square.className =
                `square ${
                    (x + y) % 2 === 0
                        ? "dark"
                        : "light"
                }`;

            square.dataset.square =
                squareName;

            if (
                appState.selectedSquare ===
                squareName
            ) {
                square.classList.add(
                    "selected"
                );
            }

            const move =
                moveTargets.get(
                    squareName
                );

            if (move) {
                square.classList.add(
                    move.capture
                        ? "capture-target"
                        : "legal-target"
                );
            }

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

            if (
                piece &&
                piece.type === "K" &&
                piece.color === checkColor
            ) {
                square.classList.add(
                    "check-square"
                );
            }

            if (piece) {
                const pieceNode =
                    document.createElement(
                        "span"
                    );

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

                square.appendChild(
                    pieceNode
                );
            }

            square.addEventListener(
                "click",
                () =>
                    handleSquareClick(
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
   STATUS
========================================================= */

function formatStatus() {
    if (appState.gameOver) {
        return getGameOverMessage();
    }

    const status =
        currentStatus();

    if (
        status.phase ===
        "checkmate"
    ) {
        return "Checkmate";
    }

    if (
        status.phase ===
        "draw"
    ) {
        return "Draw";
    }

    if (status.check) {
        return (
            appState.engine.state.turn === "w"
                ? "White is in check"
                : "Black is in check"
        );
    }

    return (
        appState.engine.state.turn === "w"
            ? "White to move"
            : "Black to move"
    );
}


/* =========================================================
   GAME OVER
========================================================= */

function getGameOverMessage() {
    if (!appState.partySnapshot) {
        return (
            appState.gameOverMessage ||
            "Game over."
        );
    }

    const reason =
        appState.partySnapshot
            .gameOverReason;

    const winner =
        appState.partySnapshot.winner;

    if (
        reason === "agreement"
    ) {
        return "Draw agreed.";
    }

    if (
        reason === "timeout"
    ) {
        return winner === "w"
            ? "White wins on time."
            : "Black wins on time.";
    }

    if (
        reason === "resignation"
    ) {
        return winner === "w"
            ? "White wins — Black resigned."
            : "Black wins — White resigned.";
    }

    if (
        reason === "checkmate"
    ) {
        return winner === "w"
            ? "White wins by checkmate."
            : "Black wins by checkmate.";
    }

    if (
        reason === "draw"
    ) {
        return "Draw.";
    }

    return "Game over.";
}


/* =========================================================
   ROSTER
========================================================= */

function renderRoster() {
    if (appState.mode === "ai") {
        const human =
            appState.playerName ||
            "You";

        const whiteName =
            appState.playerColor === "w"
                ? human
                : `Computer (${appState.aiLevel})`;

        const blackName =
            appState.playerColor === "b"
                ? human
                : `Computer (${appState.aiLevel})`;

        if (
            elements.whitePlayerLabel
        ) {
            elements.whitePlayerLabel.textContent =
                whiteName;
        }

        if (
            elements.blackPlayerLabel
        ) {
            elements.blackPlayerLabel.textContent =
                blackName;
        }

        if (
            elements.rosterWhite
        ) {
            elements.rosterWhite.textContent =
                whiteName;
        }

        if (
            elements.rosterBlack
        ) {
            elements.rosterBlack.textContent =
                blackName;
        }

        if (
            elements.spectatorList
        ) {
            elements.spectatorList.innerHTML =
                "<li>None in AI mode</li>";
        }

        if (
            elements.spectatorCount
        ) {
            elements.spectatorCount.textContent =
                "0 / 20";
        }

        return;
    }

    const white =
        appState.partySnapshot
            ?.players?.white;

    const black =
        appState.partySnapshot
            ?.players?.black;

    const whiteName =
        white
            ? `${white.name}${
                white.connected
                    ? ""
                    : " · offline"
            }`
            : "Open seat";

    const blackName =
        black
            ? `${black.name}${
                black.connected
                    ? ""
                    : " · offline"
            }`
            : "Open seat";

    if (
        elements.whitePlayerLabel
    ) {
        elements.whitePlayerLabel.textContent =
            whiteName;
    }

    if (
        elements.blackPlayerLabel
    ) {
        elements.blackPlayerLabel.textContent =
            blackName;
    }

    if (
        elements.rosterWhite
    ) {
        elements.rosterWhite.textContent =
            whiteName;
    }

    if (
        elements.rosterBlack
    ) {
        elements.rosterBlack.textContent =
            blackName;
    }

    const spectators =
        appState.partySnapshot
            ?.spectators || [];

    if (
        elements.spectatorCount
    ) {
        elements.spectatorCount.textContent =
            `${spectators.length} / 20`;
    }

    if (
        !elements.spectatorList
    ) {
        return;
    }

    if (!spectators.length) {
        elements.spectatorList.innerHTML =
            "<li>None yet</li>";

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
                            : " · offline"
                    }</li>`
            )
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
            "Create a room to become White. The next player joins as Black. Up to 20 spectators can watch live.";

        return;
    }

    const roleText =
        appState.party.role === "white"
            ? "playing as White"
            : appState.party.role === "black"
                ? "playing as Black"
                : "watching as a spectator";

    const timeLabel =
        appState.partySnapshot
            ?.timeControl?.label ||
        "Без часов";

    elements.partySummary.textContent =
        `Party ${appState.party.code} · ${roleText}. ${timeLabel}.`;
}


/* =========================================================
   CLOCKS
========================================================= */

function renderClocks() {
    let clocks;

    let timeControl;

    if (
        appState.mode === "party"
    ) {
        clocks =
            appState.partySnapshot
                ?.clocks;

        timeControl =
            appState.partySnapshot
                ?.timeControl;
    } else {
        clocks =
            appState.localClocks;

        const seconds =
            TIME_CONTROLS[
                appState.aiTimeControl
            ];

        timeControl = {
            initial: seconds,

            label:
                elements.aiTimeControl
                    ?.selectedOptions?.[0]
                    ?.textContent ||
                "Без часов",
        };
    }

    const hasClock =
        Boolean(
            timeControl &&
            timeControl.initial > 0
        );

    if (!hasClock) {
        if (elements.whiteClock) {
            elements.whiteClock.textContent =
                "∞";
        }

        if (elements.blackClock) {
            elements.blackClock.textContent =
                "∞";
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
    }
}


/* =========================================================
   BUTTONS
========================================================= */

function updateGameButtons() {
    const status =
        currentStatus();

    const finished =
        appState.gameOver ||
        status.phase === "checkmate" ||
        status.phase === "draw";

    const human =
        Boolean(
            currentHumanColor()
        );

    if (
        elements.resignButton
    ) {
        elements.resignButton.disabled =
            finished ||
            !human;
    }

    if (
        elements.drawButton
    ) {
        const show =
            appState.mode === "party" &&
            human;

        elements.drawButton.classList.toggle(
            "hidden",
            !show
        );

        elements.drawButton.disabled =
            finished ||
            !human ||
            appState.drawOfferPending;

        elements.drawButton.innerHTML =
            appState.drawOfferPending
                ? "🤝 Ничья предложена"
                : "🤝 Предложить ничью";
    }

    if (
        elements.rematchButton
    ) {
        const show =
            appState.mode === "party" &&
            human;

        elements.rematchButton.classList.toggle(
            "hidden",
            !show
        );

        elements.rematchButton.disabled =
            !show ||
            !finished;
    }
}


/* =========================================================
   RENDER
========================================================= */

function render() {
    renderBoard();

    renderRoster();

    renderPartySummary();

    renderClocks();

    updateGameButtons();

    if (
        elements.turnBadge
    ) {
        elements.turnBadge.textContent =
            formatStatus();
    }

    if (
        elements.statusMessage
    ) {
        elements.statusMessage.textContent =
            formatStatus();
    }

    if (
        elements.connectionBadge
    ) {
        if (appState.mode === "ai") {
            elements.connectionBadge.textContent =
                appState.isAiThinking
                    ? "Computer thinking"
                    : `AI: ${appState.aiLevel}`;
        } else if (appState.party) {
            const role =
                appState.party.role === "white"
                    ? "White"
                    : appState.party.role === "black"
                        ? "Black"
                        : "Spectator";

            elements.connectionBadge.textContent =
                `Party ${appState.party.code} · ${role}`;
        } else {
            elements.connectionBadge.textContent =
                "Party idle";
        }
    }

    elements.copyInviteButton
        ?.classList.toggle(
            "hidden",
            !appState.party
        );

    elements.leavePartyButton
        ?.classList.toggle(
            "hidden",
            !appState.party
        );

    renderDrawRequest();
}


/* =========================================================
   DRAW REQUEST
========================================================= */

function renderDrawRequest() {
    if (
        !elements.drawRequest
    ) {
        return;
    }

    const offer =
        appState.partySnapshot
            ?.drawOffer;

    const isIncoming =
        Boolean(
            offer &&
            offer.by !==
            appState.party?.clientId &&
            !appState.gameOver
        );

    elements.drawRequest.classList.toggle(
        "hidden",
        !isIncoming
    );

    if (
        isIncoming &&
        elements.drawRequestName
    ) {
        elements.drawRequestName.textContent =
            `${offer.name} предлагает ничью`;
    }
}


/* =========================================================
   SELECTION
========================================================= */

function clearSelection() {
    appState.selectedSquare =
        null;

    appState.pendingPromotionMoves =
        null;
}


/* =========================================================
   PROMOTION
========================================================= */

function openPromotionDialog(
    moves
) {
    appState.pendingPromotionMoves =
        moves;

    if (
        !elements.promotionOptions
    ) {
        return;
    }

    elements.promotionOptions.innerHTML =
        "";

    for (
        const move of moves
    ) {
        const button =
            document.createElement(
                "button"
            );

        button.type = "button";

        button.className =
            "promotion-button";

        button.textContent =
            PIECE_GLYPHS[
                move.color
            ][
                move.promotion.toUpperCase()
            ];

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

    elements.promotionDialog
        ?.classList.remove(
            "hidden"
        );
}


function closePromotionDialog() {
    appState.pendingPromotionMoves =
        null;

    elements.promotionDialog
        ?.classList.add(
            "hidden"
        );
}


/* =========================================================
   MOVE
========================================================= */

async function submitMove(
    move
) {
    if (
        appState.gameOver
    ) {
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

                    from:
                        move.from,

                    to:
                        move.to,

                    promotion:
                        move.promotion ||
                        null,
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
                    "Move rejected.",
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
            from:
                move.from,

            to:
                move.to,

            promotion:
                move.promotion ||
                null,
        });

    if (!result.ok) {
        showToast(
            result.error ||
                "Illegal move.",
            "error"
        );

        return;
    }

    updateAiClockAfterMove();

    render();

    scheduleAiTurn();
}


/* =========================================================
   BOARD CLICK
========================================================= */

function handleSquareClick(
    square
) {
    if (
        appState.pendingPromotionMoves ||
        appState.gameOver
    ) {
        return;
    }

    const piece =
        appState.engine.getPiece(
            square
        );

    const humanColor =
        currentHumanColor();

    if (
        appState.selectedSquare
    ) {
        const matchingMoves =
            getLegalMovesForSelected()
                .filter(
                    move =>
                        move.to ===
                        square
                );

        if (
            matchingMoves.length === 1
        ) {
            submitMove(
                matchingMoves[0]
            );

            return;
        }

        if (
            matchingMoves.length > 1
        ) {
            openPromotionDialog(
                matchingMoves
            );

            return;
        }
    }

    if (!isHumanTurn()) {
        clearSelection();

        renderBoard();

        return;
    }

    if (
        piece &&
        piece.color === humanColor &&
        piece.color ===
            appState.engine.state.turn
    ) {
        appState.selectedSquare =
            appState.selectedSquare ===
            square
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
    if (
        appState.mode !== "ai"
    ) {
        return;
    }

    const status =
        currentStatus();

    if (
        !status ||
        status.phase !== "playing" ||
        appState.gameOver
    ) {
        appState.isAiThinking =
            false;

        render();

        return;
    }

    if (
        appState.engine.state.turn ===
        appState.playerColor
    ) {
        appState.isAiThinking =
            false;

        render();

        return;
    }

    appState.isAiThinking =
        true;

    render();

    window.setTimeout(
        () => {
            if (
                appState.mode !== "ai" ||
                appState.gameOver
            ) {
                appState.isAiThinking =
                    false;

                return;
            }

            const move =
                chooseComputerMove(
                    appState.engine,
                    appState.aiLevel
                );

            appState.isAiThinking =
                false;

            if (!move) {
                render();
                return;
            }

            submitMove(move);
        },
        400
    );
}


/* =========================================================
   AI CLOCK
========================================================= */

function startAiClock() {
    stopAiClock();

    const seconds =
        TIME_CONTROLS[
            appState.aiTimeControl
        ] || 0;

    appState.localClocks = {
        white: seconds,
        black: seconds,
        running: seconds > 0,
        lastTick: Date.now(),
        turn:
            appState.engine.state.turn,
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

                if (
                    appState.gameOver
                ) {
                    stopAiClock();
                }
            },
            250
        );
}


function stopAiClock() {
    if (
        appState.aiClockTimer
    ) {
        window.clearInterval(
            appState.aiClockTimer
        );

        appState.aiClockTimer =
            null;
    }
}


function updateAiClock() {
    if (
        appState.mode !== "ai"
    ) {
        return;
    }

    const clocks =
        appState.localClocks;

    if (
        !clocks.running ||
        !TIME_CONTROLS[
            appState.aiTimeControl
        ]
    ) {
        return;
    }

    const now =
        Date.now();

    const elapsed =
        (now - clocks.lastTick) /
        1000;

    if (elapsed <= 0) {
        return;
    }

    const role =
        clocks.turn === "w"
            ? "white"
            : "black";

    clocks[role] =
        Math.max(
            0,
            clocks[role] -
                elapsed
        );

    clocks.lastTick =
        now;

    if (
        clocks[role] <= 0
    ) {
        clocks.running =
            false;

        appState.gameOver =
            true;

        appState.gameOverMessage =
            clocks.turn === "w"
                ? "Black wins on time."
                : "White wins on time.";

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

    const increment =
        getIncrementForTimeControl(
            appState.aiTimeControl
        );

    if (
        !clocks.running ||
        !TIME_CONTROLS[
            appState.aiTimeControl
        ]
    ) {
        return;
    }

    updateAiClock();

    const previousTurn =
        clocks.turn;

    const role =
        previousTurn === "w"
            ? "white"
            : "black";

    clocks[role] +=
        increment;

    clocks.turn =
        appState.engine.state.turn;

    clocks.lastTick =
        Date.now();
}


function getIncrementForTimeControl(
    value
) {
    const parts =
        String(value).split("+");

    return Number(
        parts[1] || 0
    );
}


/* =========================================================
   LOCAL RESET
========================================================= */

function resetLocalGame() {
    stopAiClock();

    closePromotionDialog();

    clearSelection();

    appState.engine =
        new ChessEngine();

    appState.partySnapshot =
        null;

    appState.orientation =
        appState.playerColor;

    appState.isAiThinking =
        false;

    appState.gameOver =
        false;

    appState.gameOverMessage =
        null;

    appState.drawOfferPending =
        false;

    appState.drawOfferFrom =
        null;

    startAiClock();

    render();

    scheduleAiTurn();
}


/* =========================================================
   API
========================================================= */

async function postJson(
    url,
    body
) {
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
                    `Server returned ${response.status} instead of JSON.`,
            };
        }

        return await response.json();
    } catch (error) {
        return {
            ok: false,
            error:
                error instanceof Error
                    ? error.message
                    : "Network error.",
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

    appState.party = {
        code:
            partyPayload.code,

        clientId:
            partyPayload.you?.id ||
            appState.party?.clientId ||
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

    appState.gameOver =
        Boolean(
            partyPayload.gameOverReason
        );

    appState.gameOverMessage =
        appState.gameOver
            ? getGameOverMessage()
            : null;

    appState.drawOfferPending =
        Boolean(
            partyPayload.drawOffer &&
            partyPayload.drawOffer.by ===
                appState.party.clientId
        );

    appState.drawOfferFrom =
        partyPayload.drawOffer
            ? partyPayload.drawOffer.name
            : null;

    if (
        appState.party.role === "white"
    ) {
        appState.orientation =
            "w";
    }

    if (
        appState.party.role === "black"
    ) {
        appState.orientation =
            "b";
    }

    setMode("party");

    updatePartyUrl(
        partyPayload.code
    );

    render();

    if (
        partyPayload.chat
    ) {
        renderChat(
            partyPayload.chat
        );
    }

    if (
        announce &&
        partyPayload.gameOverReason
    ) {
        showToast(
            getGameOverMessage(),
            "success"
        );
    }
}


/* =========================================================
   SSE
========================================================= */

function connectPartyStream() {
    if (!appState.party) {
        return;
    }

    if (
        appState.partyStream
    ) {
        appState.partyStream.close();
    }

    const url =
        `/api/party/events?partyCode=${
            encodeURIComponent(
                appState.party.code
            )
        }&clientId=${
            encodeURIComponent(
                appState.party.clientId
            )
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
                    error
                );
            }
        }
    );

    stream.addEventListener(
        "chat",
        event => {
            try {
                appendChatMessage(
                    JSON.parse(
                        event.data
                    )
                );
            } catch (error) {
                console.error(
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
                `Party ${appState.party.code} · reconnecting`;
        }
    };

    appState.partyStream =
        stream;
}


/* =========================================================
   CREATE PARTY
========================================================= */

async function createParty() {
    if (appState.party) {
        await leaveParty(true);
    }

    const timeControl =
        elements.partyTimeControl
            ?.value || "10+0";

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
                "Unable to create party.",
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
        `Party ${response.party.code} created.`,
        "success"
    );
}


/* =========================================================
   JOIN PARTY
========================================================= */

async function joinParty(
    code
) {
    const normalizedCode =
        String(code || "")
            .trim()
            .toUpperCase();

    if (!normalizedCode) {
        showToast(
            "Enter a party code first.",
            "error"
        );

        return;
    }

    if (
        appState.party?.code ===
        normalizedCode
    ) {
        showToast(
            `You are already in party ${normalizedCode}.`
        );

        return;
    }

    if (appState.party) {
        await leaveParty(true);
    }

    const storedIds =
        getStoredPartyIds();

    const storedId =
        storedIds[
            normalizedCode
        ] || null;

    const response =
        await postJson(
            "/api/party/join",
            {
                name:
                    appState.playerName,

                partyCode:
                    normalizedCode,

                clientId:
                    storedId,
            }
        );

    if (!response.ok) {
        showToast(
            response.error ||
                "Unable to join party.",
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
        `Joined party ${response.party.code}.`,
        "success"
    );
}


/* =========================================================
   LEAVE
========================================================= */

async function leaveParty(
    silent = false
) {
    if (!appState.party) {
        return;
    }

    const oldParty =
        appState.party;

    await postJson(
        "/api/party/leave",
        {
            partyCode:
                oldParty.code,

            clientId:
                oldParty.clientId,
        }
    );

    if (
        appState.partyStream
    ) {
        appState.partyStream.close();

        appState.partyStream =
            null;
    }

    removeStoredPartyId(
        oldParty.code
    );

    appState.party =
        null;

    appState.partySnapshot =
        null;

    updatePartyUrl(null);

    clearChat();

    setMode("ai");

    resetLocalGame();

    if (!silent) {
        showToast(
            "Left the party room."
        );
    }
}


/* =========================================================
   NEW PARTY GAME
========================================================= */

async function startNewPartyGame() {
    if (!appState.party) {
        return;
    }

    const response =
        await postJson(
            "/api/party/new-game",
            {
                partyCode:
                    appState.party.code,

                clientId:
                    appState.party.clientId,
            }
        );

    if (!response.ok) {
        showToast(
            response.error ||
                "Unable to start a new game.",
            "error"
        );

        return;
    }

    hydratePartyState(
        response.party,
        false
    );

    showToast(
        "New game started.",
        "success"
    );
}


/* =========================================================
   RESIGN
========================================================= */

async function resignGame() {
    if (appState.gameOver) {
        return;
    }

    const color =
        currentHumanColor();

    if (!color) {
        return;
    }

    if (
        !window.confirm(
            "Вы действительно хотите сдаться?"
        )
    ) {
        return;
    }

    if (
        appState.mode === "party" &&
        appState.party
    ) {
        const response =
            await postJson(
                "/api/party/resign",
                {
                    partyCode:
                        appState.party.code,

                    clientId:
                        appState.party.clientId,
                }
            );

        if (!response.ok) {
            showToast(
                response.error ||
                    "Unable to resign.",
                "error"
            );

            return;
        }

        hydratePartyState(
            response.party,
            false
        );

        showToast(
            "Вы сдались.",
            "info"
        );

        return;
    }

    appState.gameOver =
        true;

    appState.gameOverMessage =
        color === "w"
            ? "Black wins — White resigned."
            : "White wins — Black resigned.";

    stopAiClock();

    showToast(
        appState.gameOverMessage,
        "success"
    );

    render();
}


/* =========================================================
   DRAW
========================================================= */

async function offerDraw() {
    if (
        appState.mode !== "party" ||
        appState.gameOver ||
        !appState.party
    ) {
        return;
    }

    if (
        appState.drawOfferPending
    ) {
        showToast(
            "Вы уже предложили ничью."
        );

        return;
    }

    const response =
        await postJson(
            "/api/party/draw-offer",
            {
                partyCode:
                    appState.party.code,

                clientId:
                    appState.party.clientId,
            }
        );

    if (!response.ok) {
        showToast(
            response.error ||
                "Unable to offer draw.",
            "error"
        );

        return;
    }

    hydratePartyState(
        response.party,
        false
    );

    showToast(
        "Предложение ничьей отправлено.",
        "success"
    );
}


/* =========================================================
   DRAW RESPONSE
========================================================= */

async function respondToDraw(
    accept
) {
    if (
        !appState.party
    ) {
        return;
    }

    const response =
        await postJson(
            "/api/party/draw-response",
            {
                partyCode:
                    appState.party.code,

                clientId:
                    appState.party.clientId,

                accept:
                    Boolean(accept),
            }
        );

    if (!response.ok) {
        showToast(
            response.error ||
                "Unable to respond.",
            "error"
        );

        return;
    }

    hydratePartyState(
        response.party,
        false
    );

    showToast(
        accept
            ? "Ничья согласована."
            : "Предложение отклонено.",
        accept
            ? "success"
            : "info"
    );
}


/* =========================================================
   REMATCH
========================================================= */

async function requestRematch() {
    if (
        appState.mode !== "party" ||
        !appState.party
    ) {
        return;
    }

    if (!appState.gameOver) {
        showToast(
            "Реванш доступен после окончания партии."
        );

        return;
    }

    const response =
        await postJson(
            "/api/party/rematch",
            {
                partyCode:
                    appState.party.code,

                clientId:
                    appState.party.clientId,
            }
        );

    if (!response.ok) {
        showToast(
            response.error ||
                "Unable to request rematch.",
            "error"
        );

        return;
    }

    hydratePartyState(
        response.party,
        false
    );

    if (
        response.party.rematch.white &&
        response.party.rematch.black
    ) {
        showToast(
            "Реванш начинается!",
            "success"
        );
    } else {
        showToast(
            "Вы выбрали реванш. Ждём второго игрока.",
            "success"
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
            "Invite link copied.",
            "success"
        );
    } catch {
        showToast(
            `Party code: ${appState.party.code}`
        );
    }
}


/* =========================================================
   CHAT
========================================================= */

function clearChat() {
    if (
        elements.chatMessages
    ) {
        elements.chatMessages.innerHTML =
            `<div class="chat-empty">
                Chat becomes available in Party mode.
            </div>`;
    }
}


function renderChat(
    messages
) {
    clearChat();

    if (
        !messages ||
        !messages.length
    ) {
        showChatEmpty();

        return;
    }

    elements.chatMessages.innerHTML =
        "";

    for (
        const message of messages
    ) {
        appendChatMessage(
            message,
            false
        );
    }

    scrollChatToBottom();
}


function showChatEmpty() {
    if (
        elements.chatMessages
    ) {
        elements.chatMessages.innerHTML =
            `<div class="chat-empty">
                Пока сообщений нет.<br>
                Начните разговор.
            </div>`;
    }
}


function appendChatMessage(
    message,
    scroll = true
) {
    if (
        !elements.chatMessages
    ) {
        return;
    }

    const empty =
        elements.chatMessages
            .querySelector(
                ".chat-empty"
            );

    empty?.remove();

    const wrapper =
        document.createElement(
            "div"
        );

    wrapper.className =
        "chat-message";

    const meta =
        document.createElement(
            "div"
        );

    meta.className =
        "chat-meta";

    const name =
        document.createElement(
            "span"
        );

    name.className =
        "chat-name";

    name.textContent =
        message.name ||
        "Guest";

    const time =
        document.createElement(
            "span"
        );

    time.textContent =
        new Date(
            message.time ||
            Date.now()
        ).toLocaleTimeString(
            [],
            {
                hour: "2-digit",
                minute: "2-digit",
            }
        );

    meta.append(
        name,
        time
    );

    const text =
        document.createElement(
            "div"
        );

    text.className =
        "chat-text";

    text.textContent =
        message.text ||
        "";

    wrapper.append(
        meta,
        text
    );

    elements.chatMessages.appendChild(
        wrapper
    );

    if (scroll) {
        scrollChatToBottom();
    }
}


function scrollChatToBottom() {
    if (
        elements.chatMessages
    ) {
        elements.chatMessages.scrollTop =
            elements.chatMessages.scrollHeight;
    }
}


async function sendChatMessage(
    event
) {
    event.preventDefault();

    if (
        !appState.party
    ) {
        return;
    }

    const message =
        elements.chatInput?.value.trim();

    if (!message) {
        return;
    }

    const response =
        await postJson(
            "/api/party/chat",
            {
                partyCode:
                    appState.party.code,

                clientId:
                    appState.party.clientId,

                message,
            }
        );

    if (!response.ok) {
        showToast(
            response.error ||
                "Unable to send message.",
            "error"
        );

        return;
    }

    if (
        elements.chatInput
    ) {
        elements.chatInput.value =
            "";
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
    const ids =
        getStoredPartyIds();

    ids[code] =
        clientId;

    localStorage.setItem(
        STORAGE_KEYS.partyIds,
        JSON.stringify(ids)
    );
}


function removeStoredPartyId(
    code
) {
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
    elements.playerNameInput
        ?.addEventListener(
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


    elements.aiLevelSelect
        ?.addEventListener(
            "change",
            event => {
                appState.aiLevel =
                    event.target.value;

                render();
            }
        );


    elements.playerColorSelect
        ?.addEventListener(
            "change",
            event => {
                appState.playerColor =
                    event.target.value;

                if (
                    appState.mode ===
                    "ai"
                ) {
                    resetLocalGame();
                }
            }
        );


    elements.aiTimeControl
        ?.addEventListener(
            "change",
            event => {
                appState.aiTimeControl =
                    event.target.value;

                if (
                    appState.mode ===
                    "ai"
                ) {
                    resetLocalGame();
                }
            }
        );


    elements.modeAiButton
        ?.addEventListener(
            "click",
            async () => {
                if (appState.party) {
                    await leaveParty(true);
                } else {
                    setMode("ai");
                    resetLocalGame();
                }
            }
        );


    elements.modePartyButton
        ?.addEventListener(
            "click",
            () => {
                setMode("party");
            }
        );


    elements.startAiButton
        ?.addEventListener(
            "click",
            async () => {
                if (appState.party) {
                    await leaveParty(true);
                }

                setMode("ai");

                resetLocalGame();

                showToast(
                    "New AI game ready.",
                    "success"
                );
            }
        );


    elements.createPartyButton
        ?.addEventListener(
            "click",
            createParty
        );


    elements.joinPartyButton
        ?.addEventListener(
            "click",
            () =>
                joinParty(
                    elements.partyCodeInput
                        ?.value
                )
        );


    elements.leavePartyButton
        ?.addEventListener(
            "click",
            () =>
                leaveParty(false)
        );


    elements.copyInviteButton
        ?.addEventListener(
            "click",
            copyInviteLink
        );


    elements.flipBoardButton
        ?.addEventListener(
            "click",
            () => {
                appState.orientation =
                    appState.orientation ===
                    "w"
                        ? "b"
                        : "w";

                renderBoard();
            }
        );


    elements.resignButton
        ?.addEventListener(
            "click",
            resignGame
        );


    elements.drawButton
        ?.addEventListener(
            "click",
            offerDraw
        );


    elements.rematchButton
        ?.addEventListener(
            "click",
            requestRematch
        );


    elements.acceptDrawButton
        ?.addEventListener(
            "click",
            () =>
                respondToDraw(true)
        );


    elements.declineDrawButton
        ?.addEventListener(
            "click",
            () =>
                respondToDraw(false)
        );


    elements.chatForm
        ?.addEventListener(
            "submit",
            sendChatMessage
        );


    elements.partyCodeInput
        ?.addEventListener(
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


    elements.partyCodeInput
        ?.addEventListener(
            "keydown",
            event => {
                if (
                    event.key ===
                    "Enter"
                ) {
                    event.preventDefault();

                    joinParty(
                        elements.partyCodeInput.value
                    );
                }
            }
        );


    elements.promotionDialog
        ?.addEventListener(
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

        if (
            elements.playerNameInput
        ) {
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

        if (
            elements.partyCodeInput
        ) {
            elements.partyCodeInput.value =
                partyCode.toUpperCase();
        }

        await joinParty(
            partyCode
        );

        return;
    }

    setMode("ai");

    resetLocalGame();
}

init();
