import { ChessEngine } from "/shared/chess-engine.js";

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

const state = {

mode: "ai",  

engine: new ChessEngine(),  

orientation: "w",  

selected: null,  

legalMoves: [],  

aiColor: "b",  

aiThinking: false,  

aiTimer: null,  

gameStarted: false,  

party: null,  

partyClientId: null,  

partyEvents: null,  

promotionResolver: null,  

clocks: {  
    white: 600,  
    black: 600,  
    running: false,  
    turn: "w"  
},  

clockTimer: null

};

const $ = id =>
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

const files =
"abcdefgh";

function showToast(
message,
type = ""
) {

const element =  
    document.createElement("div");  

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

function setStatus(message) {

statusMessage.textContent =  
    message;

}

function colorName(color) {

return color === "w"  
    ? "белых"  
    : "черных";

}

function getSquare(file, rank) {

return `${files[file]}${rank + 1}`;

}

function getCoordinates(
index
) {

if (state.orientation === "w") {  

    return {  
        file: index % 8,  
        rank: 7 - Math.floor(index / 8)  
    };  
}  

return {  
    file: 7 - index % 8,  
    rank: Math.floor(index / 8)  
};

}

function renderBoard() {

boardElement.innerHTML = "";  

const snapshot =  
    state.engine.state;  

const status =  
    state.engine.getStatus();  

let checkedKing = null;  

if (  
    status.phase === "check"  
) {  

    for (  
        const [squareName, piece]  
        of Object.entries(  
            snapshot.board  
        )  
    ) {  

        if (  
            piece.type === "k" &&  
            piece.color === snapshot.turn  
        ) {  
            checkedKing = squareName;  
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
    } = getCoordinates(index);  

    const squareName =  
        getSquare(file, rank);  

    const element =  
        document.createElement("button");  

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
        state.selected === squareName  
    ) {  
        element.classList.add(  
            "selected"  
        );  
    }  

    if (  
        snapshot.lastMove &&  
        (  
            snapshot.lastMove.from === squareName ||  
            snapshot.lastMove.to === squareName  
        )  
    ) {  
        element.classList.add(  
            "last-move"  
        );  
    }  

    if (  
        checkedKing === squareName  
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

        if (legal.capture) {  

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
        snapshot.board[squareName];  

    if (piece) {  

        const span =  
            document.createElement("span");  

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
        () => handleSquareClick(squareName)  
    );  

    boardElement.appendChild(  
        element  
    );  
}

}

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

    return (  
        state.engine.state.turn ===  
        (  
            role === "white"  
                ? "w"  
                : "b"  
        )  
    );  
}  

return (  
    state.engine.state.turn !==  
    state.aiColor  
);

}

function handleSquareClick(
squareName
) {

if (!canUserMove()) {  
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
    state.selected === squareName  
) {  

    clearSelection();  

    return;  
}  


const move =  
    state.legalMoves.find(  
        item =>  
            item.to === squareName  
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

function openPromotion(
move,
callback
) {

promotionOptions.innerHTML =  
    "";  

const color =  
    state.engine.state.turn;  

for (  
    const type  
    of ["q", "r", "b", "n"]  
) {  

    const button =  
        document.createElement("button");  

    button.type =  
        "button";  

    button.textContent =  
        PIECES[color][type];  

    button.addEventListener(  
        "click",  
        () => {  

            promotionDialog.classList.add(  
                "hidden"  
            );  

            state.promotionResolver =  
                null;  

            callback(type);  
        }  
    );  

    promotionOptions.appendChild(  
        button  
    );  
}  

promotionDialog.classList.remove(  
    "hidden"  
);

}

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

function scheduleAiMove() {

if (  
    state.aiThinking  
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
    $("aiLevelSelect").value;  

if (level === "easy") {  
    return 350;  
}  

if (level === "hard") {  
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

if (!legal.length) {  
    updateGameUI();  
    return;  
}  

const level =  
    $("aiLevelSelect").value;  

let move;  

if (level === "easy") {  

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
            legal  
        );  
}  

const result =  
    state.engine.makeMove({  
        from: move.from,  
        to: move.to,  
        promotion:  
            move.promotion || null  
    });  

if (!result.ok) {  

    showToast(  
        "ИИ не смог выполнить ход.",  
        "error"  
    );  

    return;  
}  

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
moves
) {

let bestScore =  
    -Infinity;  

let bestMoves = [];  


for (const move of moves) {  

    let score =  
        Math.random() * 0.4;  

    if (move.capture) {  
        score += 3;  
    }  

    if (move.promotion) {  
        score += 8;  
    }  

    if (  
        move.to[1] === "4" ||  
        move.to[1] === "5"  
    ) {  
        score += .15;  
    }  

    if (score > bestScore) {  

        bestScore =  
            score;  

        bestMoves = [  
            move  
        ];  

    } else if (  
        Math.abs(  
            score - bestScore  
        ) < .1  
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

function finishGame() {

state.aiThinking =  
    false;  

clearTimeout(  
    state.aiTimer  
);  

updateGameUI();

}

function updateGameUI() {

const status =  
    state.engine.getStatus();  

const turn =  
    state.engine.state.turn;  

turnBadge.textContent =  
    `Ход ${colorName(turn)}`;  

turnBadge.className =  
    `status-chip ${  
        turn === "w"  
            ? "turn-white"  
            : "turn-black"  
    }`;  


if (  
    status.phase === "checkmate"  
) {  

    setStatus(  
        `Мат. Победили ${colorName(status.winner)}.`  
    );  

} else if (  
    status.phase === "draw"  
) {  

    setStatus(  
        drawMessage(  
            status.reason  
        )  
    );  

} else if (  
    status.phase === "check"  
) {  

    setStatus(  
        `Шах — ход ${colorName(turn)}.`  
    );  

} else if (  
    state.mode === "party"  
) {  

    const role =  
        state.party?.you?.role;  

    if (  
        role === "spectator"  
    ) {  

        setStatus(  
            `Ход ${colorName(turn)}. Вы зритель.`  
        );  

    } else {  

        const myColor =  
            role === "white"  
                ? "w"  
                : "b";  

        setStatus(  
            myColor === turn  
                ? "Ваш ход."  
                : "Ход соперника."  
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

function startNewAiGame() {

state.mode =  
    "ai";  

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
    $("playerColorSelect").value;  

state.aiColor =  
    selectedColor === "w"  
        ? "b"  
        : "w";  

state.orientation =  
    selectedColor;  

setupAiPlayers();  

resetClockFromSelect(  
    $("aiClockSelect").value  
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
        .value  
        .trim();  

return value || "Вы";

}

function resetClockFromSelect(
value
) {

const seconds =  
    parseClock(  
        value  
    );  

state.clocks = {  
    white: seconds,  
    black: seconds,  
    running:  
        seconds > 0,  
    turn: "w"  
};  

updateClocks();

}

function parseClock(
value
) {

if (  
    value === "none"  
) {  
    return 0;  
}  

const [minutes] =  
    value.split("+");  

return (  
    Number(minutes) *  
    60  
);

}

function updateClocks() {

const white =  
    state.clocks.white;  

const black =  
    state.clocks.black;  

whiteClock.textContent =  
    formatTime(white);  

blackClock.textContent =  
    formatTime(black);  

whiteClock.classList.toggle(  
    "active",  
    state.clocks.running &&  
    state.clocks.turn === "w"  
);  

blackClock.classList.toggle(  
    "active",  
    state.clocks.running &&  
    state.clocks.turn === "b"  
);  

whiteClock.classList.toggle(  
    "low",  
    white > 0 &&  
    white < 30  
);  

blackClock.classList.toggle(  
    "low",  
    black > 0 &&  
    black < 30  
);

}

function formatTime(
seconds
) {

if (!seconds) {  
    return "—";  
}  

const value =  
    Math.max(  
        0,  
        Math.ceil(seconds)  
    );  

const minutes =  
    Math.floor(  
        value / 60  
    );  

const remaining =  
    value % 60;  

return (  
    String(minutes)  
        .padStart(2, "0") +  
    ":" +  
    String(remaining)  
        .padStart(2, "0")  
);

}

function startClockTimer() {

clearInterval(  
    state.clockTimer  
);  

state.clockTimer =  
    setInterval(  
        () => {  

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

            const key =  
                state.clocks.turn === "w"  
                    ? "white"  
                    : "black";  

            state.clocks[key] =  
                Math.max(  
                    0,  
                    state.clocks[key] -  
                    1  
                );  

            updateClocks();  

        },  
        1000  
    );

}

function switchMode(
mode
) {

if (  
    mode === "ai"  
) {  

    state.mode =  
        "ai";  

    modeAiButton.classList.add(  
        "active"  
    );  

    modePartyButton.classList.remove(  
        "active"  
    );  

    aiControls.classList.remove(  
        "hidden"  
    );  

    partyControls.classList.add(  
        "hidden"  
    );  

    modeBadge.textContent =  
        "AI Арена";  

    connectionBadge.textContent =  
        "Соло";  

    connectionBadge.className =  
        "status-chip connection-solo";  

    return;  
}  


state.mode =  
    "party";  

modePartyButton.classList.add(  
    "active"  
);  

modeAiButton.classList.remove(  
    "active"  
);  

aiControls.classList.add(  
    "hidden"  
);  

partyControls.classList.remove(  
    "hidden"  
);  

modeBadge.textContent =  
    "Party";  

connectionBadge.textContent =  
    "Онлайн";  

connectionBadge.className =  
    "status-chip connection-party";  

state.gameStarted =  
    false;  

state.engine =  
    new ChessEngine();  

state.selected =  
    null;  

state.legalMoves =  
    [];  

updateGameUI();

}

async function createParty() {

const name =  
    getPlayerName();  

try {  

    const response =  
        await fetch(  
            "/api/party/create",  
            {  
                method: "POST",  

                headers: {  
                    "Content-Type":  
                        "application/json"  
                },  

                body: JSON.stringify({  
                    name,  
                    timeControl:  
                        $("partyClockSelect")  
                            .value  
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

    state.engine =  
        createEngineFromSnapshot(  
            data.party.game  
        );  

    state.gameStarted =  
        true;  

    state.orientation =  
        "w";  

    $("partyCodeInput").value =  
        data.party.code;  

    $("leavePartyButton")  
        .classList.remove(  
            "hidden"  
        );  

    $("copyInviteButton")  
        .classList.remove(  
            "hidden"  
        );  

    $("partySummary")  
        .textContent =  
        `Комната ${data.party.code}. Вы играете белыми.`;  

    applyPartyState(  
        data.party  
    );  

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

async function joinParty() {

const code =  
    $("partyCodeInput")  
        .value  
        .trim()  
        .toUpperCase();  

if (  
    !/^[A-Z0-9]{6}$/.test(code)  
) {  

    showToast(  
        "Введите 6-значный код комнаты.",  
        "error"  
    );  

    return;  
}  

try {  

    const response =  
        await fetch(  
            "/api/party/join",  
            {  
                method: "POST",  

                headers: {  
                    "Content-Type":  
                        "application/json"  
                },  

                body: JSON.stringify({  
                    partyCode: code,  
                    name:  
                        getPlayerName(),  
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

    state.party =  
        data.party;  

    state.partyClientId =  
        data.party.you?.id ||  
        null;  

    state.gameStarted =  
        true;  

    applyPartyState(  
        data.party  
    );  

    $("leavePartyButton")  
        .classList.remove(  
            "hidden"  
        );  

    $("copyInviteButton")  
        .classList.remove(  
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
    ...party.clocks  
};  

state.selected =  
    null;  

state.legalMoves =  
    [];  

state.gameStarted =  
    true;  

updatePartyPlayers();  

updateSpectators();  

updateGameUI();

}

function updatePartyPlayers() {

const players =  
    state.party?.players || {};  

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

$("partySummary")  
    .textContent =  
    state.party?.code  
        ? `Комната ${state.party.code}`  
        : "Создайте комнату.";

}

function updateSpectators() {

const spectators =  
    state.party?.spectators ||  
    [];  

spectatorCount.textContent =  
    `${spectators.length} / ${  
        state.party?.maxSpectators || 20  
    }`;  

spectatorList.innerHTML =  
    "";  

if (!spectators.length) {  

    const li =  
        document.createElement("li");  

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
        document.createElement("li");  

    li.textContent =  
        spectator.name;  

    spectatorList.appendChild(  
        li  
    );  
}

}

function connectPartyEvents() {

if (  
    state.partyEvents  
) {  
    state.partyEvents.close();  
}  

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

source.onerror =  
    () => {  
        connectionBadge.textContent =  
            "Переподключение...";  

        connectionBadge.className =  
            "status-chip connection-solo";  
    };

}

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

try {  

    const response =  
        await fetch(  
            "/api/party/move",  
            {  
                method: "POST",  

                headers: {  
                    "Content-Type":  
                        "application/json"  
                },  

                body: JSON.stringify({  

                    partyCode:  
                        state.party.code,  

                    clientId:  
                        state.partyClientId,  

                    from,  
                    to,  

                    promotion:  
                        promotion || null  
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

    if (!data.ok) {  

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

async function leaveParty() {

if (  
    !state.party ||  
    !state.partyClientId  
) {  
    return;  
}  

try {  

    await fetch(  
        "/api/party/leave",  
        {  
            method: "POST",  

            headers: {  
                "Content-Type":  
                    "application/json"  
            },  

            body: JSON.stringify({  
                partyCode:  
                    state.party.code,  

                clientId:  
                    state.partyClientId  
            })  
        }  
    );  

} catch {  
    // ignore  
}  

if (  
    state.partyEvents  
) {  

    state.partyEvents.close();  

    state.partyEvents =  
        null;  
}  

state.party =  
    null;  

state.partyClientId =  
    null;  

$("leavePartyButton")  
    .classList.add(  
        "hidden"  
    );  

$("copyInviteButton")  
    .classList.add(  
        "hidden"  
    );  

$("partySummary")  
    .textContent =  
    "Создайте комнату, чтобы играть белыми.";  

state.engine =  
    new ChessEngine();  

state.gameStarted =  
    false;  

state.selected =  
    null;  

state.legalMoves =  
    [];  

switchMode("party");  

updateGameUI();

}

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

function loadPartyFromUrl() {

const code =  
    new URLSearchParams(  
        location.search  
    ).get("party");  

if (code) {  

    switchMode("party");  

    $("partyCodeInput").value =  
        code.toUpperCase();  
}

}

function flipBoard() {

state.orientation =  
    state.orientation === "w"  
        ? "b"  
        : "w";  

renderBoard();

}

function bindEvents() {

$("modeAiButton")  
    .addEventListener(  
        "click",  
        () => switchMode("ai")  
    );  

$("modePartyButton")  
    .addEventListener(  
        "click",  
        () => switchMode("party")  
    );  

$("startAiButton")  
    .addEventListener(  
        "click",  
        startNewAiGame  
    );  

$("newGameToolbarButton")  
    .addEventListener(  
        "click",  
        () => {  

            if (  
                state.mode === "party"  
            ) {  

                showToast(  
                    "В Party новую игру создаёт владелец комнаты."  
                );  

                return;  
            }  

            startNewAiGame();  
        }  
    );  

$("flipBoardButton")  
    .addEventListener(  
        "click",  
        flipBoard  
    );  

$("createPartyButton")  
    .addEventListener(  
        "click",  
        createParty  
    );  

$("joinPartyButton")  
    .addEventListener(  
        "click",  
        joinParty  
    );  

$("leavePartyButton")  
    .addEventListener(  
        "click",  
        leaveParty  
    );  

$("copyInviteButton")  
    .addEventListener(  
        "click",  
        copyInvite  
    );  

promotionDialog.addEventListener(  
    "click",  
    event => {  

        if (  
            event.target ===  
            promotionDialog  
        ) {  

            promotionDialog.classList.add(  
                "hidden"  
            );  
        }  
    }  
);

}

function initialize() {

bindEvents();  

state.engine =  
    new ChessEngine();  

state.orientation =  
    "w";  

state.gameStarted =  
    false;  

resetClockFromSelect(  
    $("aiClockSelect").value  
);  

setupAiPlayers();  

updateGameUI();  

startClockTimer();  

loadPartyFromUrl();

}

initialize();


