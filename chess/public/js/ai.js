/*
=========================================================
 CHESS PARTY — STRONG AI
=========================================================

Особенности:

- Iterative Deepening
- Alpha-Beta pruning
- Quiescence Search
- Transposition Table
- Killer Moves
- History Heuristic
- MVV-LVA
- Piece Square Tables
- Pawn structure evaluation
- Passed pawns
- Open / semi-open files
- Mobility
- King safety
- Endgame evaluation
- Mate search

Ожидаемый API движка:

engine.state.board
engine.state.turn
engine.state.halfmove
engine.legalMoves(color)
engine.makeMove({ from, to, promotion })
engine.undo()
engine.getPiece(square)
engine.inCheck(state, color)

=========================================================
*/


/* =========================================================
   MATERIAL
========================================================= */

const PIECE_VALUE = {
    p: 100,
    n: 320,
    b: 330,
    r: 500,
    q: 900,
    k: 20000,
};


/* =========================================================
   LEVELS
========================================================= */

const LEVELS = {

    easy: {
        depth: 2,
        time: 350,
        randomness: 0.12,
    },

    intermediate: {
        depth: 4,
        time: 1000,
        randomness: 0.025,
    },

    hard: {
        depth: 5,
        time: 2500,
        randomness: 0,
    },

    expert: {
        depth: 6,
        time: 5000,
        randomness: 0,
    },

    master: {
        depth: 7,
        time: 10000,
        randomness: 0,
    },
};


/* =========================================================
   PIECE SQUARE TABLES
========================================================= */

const PST = {

    p: [
         0,   0,   0,   0,   0,   0,   0,   0,
        50,  50,  50,  50,  50,  50,  50,  50,
        10,  10,  20,  30,  30,  20,  10,  10,
         5,   5,  10,  27,  27,  10,   5,   5,
         0,   0,   0,  25,  25,   0,   0,   0,
         5,  -5, -10,   0,   0, -10,  -5,   5,
         5,  10,  10, -25, -25,  10,  10,   5,
         0,   0,   0,   0,   0,   0,   0,   0,
    ],

    n: [
        -50, -40, -30, -30, -30, -30, -40, -50,
        -40, -20,   0,   5,   5,   0, -20, -40,
        -30,   5,  10,  15,  15,  10,   5, -30,
        -30,   0,  15,  20,  20,  15,   0, -30,
        -30,   5,  15,  20,  20,  15,   5, -30,
        -30,   0,  10,  15,  15,  10,   0, -30,
        -40, -20,   0,   0,   0,   0, -20, -40,
        -50, -40, -30, -30, -30, -30, -40, -50,
    ],

    b: [
        -20, -10, -10, -10, -10, -10, -10, -20,
        -10,   5,   0,   0,   0,   0,   5, -10,
        -10,  10,  10,  10,  10,  10,  10, -10,
        -10,   0,  10,  10,  10,  10,   0, -10,
        -10,   5,   5,  10,  10,   5,   5, -10,
        -10,   0,   5,  10,  10,   5,   0, -10,
        -10,   0,   0,   0,   0,   0,   0, -10,
        -20, -10, -10, -10, -10, -10, -10, -20,
    ],

    r: [
         0,   0,   0,   5,   5,   0,   0,   0,
        -5,   0,   0,   0,   0,   0,   0,  -5,
        -5,   0,   0,   0,   0,   0,   0,  -5,
        -5,   0,   0,   0,   0,   0,   0,  -5,
        -5,   0,   0,   0,   0,   0,   0,  -5,
        -5,   0,   0,   0,   0,   0,   0,  -5,
         5,  10,  10,  10,  10,  10,  10,   5,
         0,   0,   0,   0,   0,   0,   0,   0,
    ],

    q: [
        -20, -10, -10,  -5,  -5, -10, -10, -20,
        -10,   0,   0,   0,   0,   0,   0, -10,
        -10,   0,   5,   5,   5,   5,   0, -10,
         -5,   0,   5,   5,   5,   5,   0,  -5,
          0,   0,   5,   5,   5,   5,   0,  -5,
        -10,   5,   5,   5,   5,   5,   0, -10,
        -10,   0,   5,   0,   0,   0,   0, -10,
        -20, -10, -10,  -5,  -5, -10, -10, -20,
    ],

    k: [
        -30, -40, -40, -50, -50, -40, -40, -30,
        -30, -40, -40, -50, -50, -40, -40, -30,
        -30, -40, -40, -50, -50, -40, -40, -30,
        -30, -40, -40, -50, -50, -40, -40, -30,
        -20, -30, -30, -40, -40, -30, -30, -20,
        -10, -20, -20, -20, -20, -20, -20, -10,
         20,  20,   0,   0,   0,   0,  20,  20,
         20,  30,  10,   0,   0,  10,  30,  20,
    ],
};


/* =========================================================
   ENDGAME KING TABLE
========================================================= */

const KING_ENDGAME = [
    -50, -30, -30, -30, -30, -30, -30, -50,
    -30, -10,   0,   5,   5,   0, -10, -30,
    -30,   0,  20,  30,  30,  20,   0, -30,
    -30,   5,  30,  40,  40,  30,   5, -30,
    -30,   5,  30,  40,  40,  30,   5, -30,
    -30,   0,  20,  30,  30,  20,   0, -30,
    -30, -10,   0,   0,   0,   0, -10, -30,
    -50, -30, -30, -30, -30, -30, -30, -50,
];


/* =========================================================
   SEARCH STATE
========================================================= */

let searchStart = 0;
let searchLimit = 5000;
let stopSearch = false;

const transpositionTable = new Map();

const killerMoves = new Map();
const historyTable = new Map();

const MAX_TT_SIZE = 100000;


/* =========================================================
   UTILS
========================================================= */

function opposite(color) {
    return color === "w" ? "b" : "w";
}


function squareIndex(square) {

    if (!square || square.length < 2) {
        return 0;
    }

    const file = square.charCodeAt(0) - 97;
    const rank = Number(square[1]) - 1;

    if (
        file < 0 ||
        file > 7 ||
        rank < 0 ||
        rank > 7
    ) {
        return 0;
    }

    return rank * 8 + file;
}


function mirroredIndex(square, color) {

    const index = squareIndex(square);

    if (color === "w") {
        return index;
    }

    const rank = Math.floor(index / 8);
    const file = index % 8;

    return (7 - rank) * 8 + file;
}


function moveKey(move) {

    return `${move.from}-${move.to}-${move.promotion || ""}`;
}


function isCapture(move) {
    return !!move.capture;
}


/* =========================================================
   POSITION KEY
========================================================= */

function positionKey(engine) {

    let key = `${engine.state.turn}|`;

    const board = engine.state.board || {};

    const squares = Object.keys(board).sort();

    for (const sq of squares) {

        const piece = board[sq];

        if (!piece) continue;

        key += `${sq}${piece.color}${piece.type};`;
    }

    return key;
}


/* =========================================================
   ENDGAME DETECTION
========================================================= */

function isEndgame(engine) {

    let nonPawnPieces = 0;
    let queens = 0;
    let rooks = 0;

    for (const piece of Object.values(engine.state.board || {})) {

        if (!piece) continue;

        if (piece.type === "q") queens++;

        if (piece.type === "r") rooks++;

        if (
            piece.type !== "p" &&
            piece.type !== "k"
        ) {
            nonPawnPieces++;
        }
    }

    return (
        queens === 0 &&
        nonPawnPieces <= 4 &&
        rooks <= 2
    );
}


/* =========================================================
   MATERIAL COUNT
========================================================= */

function materialScore(engine, color) {

    let score = 0;

    for (const piece of Object.values(engine.state.board || {})) {

        if (!piece) continue;

        const value = PIECE_VALUE[piece.type] || 0;

        if (piece.color === color) {
            score += value;
        } else {
            score -= value;
        }
    }

    return score;
}


/* =========================================================
   PAWN STRUCTURE
========================================================= */

function evaluatePawns(engine, color) {

    const board = engine.state.board || {};

    const ownPawns = [];
    const enemyPawns = [];

    for (const [sq, piece] of Object.entries(board)) {

        if (!piece || piece.type !== "p") continue;

        if (piece.color === color) {
            ownPawns.push(sq);
        } else {
            enemyPawns.push(sq);
        }
    }

    let score = 0;

    const ownFiles = Array(8).fill(0);
    const enemyFiles = Array(8).fill(0);

    for (const sq of ownPawns) {
        ownFiles[sq.charCodeAt(0) - 97]++;
    }

    for (const sq of enemyPawns) {
        enemyFiles[sq.charCodeAt(0) - 97]++;
    }

    /* doubled pawns */

    for (const count of ownFiles) {

        if (count > 1) {
            score -= (count - 1) * 18;
        }
    }

    /* isolated pawns */

    for (let file = 0; file < 8; file++) {

        if (ownFiles[file] !== 0) {

            const left =
                file > 0 ? ownFiles[file - 1] : 0;

            const right =
                file < 7 ? ownFiles[file + 1] : 0;

            if (!left && !right) {
                score -= 12;
            }
        }
    }

    /* passed pawns */

    for (const sq of ownPawns) {

        const file = sq.charCodeAt(0) - 97;
        const rank = Number(sq[1]) - 1;

        let blocked = false;

        for (const enemySq of enemyPawns) {

            const ef =
                enemySq.charCodeAt(0) - 97;

            const er =
                Number(enemySq[1]) - 1;

            if (Math.abs(ef - file) > 1) {
                continue;
            }

            if (
                color === "w" &&
                er > rank
            ) {
                blocked = true;
                break;
            }

            if (
                color === "b" &&
                er < rank
            ) {
                blocked = true;
                break;
            }
        }

        if (!blocked) {

            const advancement =
                color === "w"
                    ? rank
                    : 7 - rank;

            score += 15 + advancement * 12;
        }
    }

    return score;
}


/* =========================================================
   OPEN FILES
========================================================= */

function evaluateFiles(engine, color) {

    const board = engine.state.board || {};

    let score = 0;

    for (let file = 0; file < 8; file++) {

        let ownPawn = false;
        let enemyPawn = false;

        for (let rank = 1; rank <= 8; rank++) {

            const sq =
                String.fromCharCode(97 + file) + rank;

            const piece = board[sq];

            if (!piece || piece.type !== "p") {
                continue;
            }

            if (piece.color === color) {
                ownPawn = true;
            } else {
                enemyPawn = true;
            }
        }

        if (!ownPawn && !enemyPawn) {
            score += 8;
        } else if (!ownPawn) {
            score += 15;
        }
    }

    return score;
}


/* =========================================================
   PIECE POSITION
========================================================= */

function positionalScore(piece, square, endgame) {

    if (!piece) return 0;

    const index =
        mirroredIndex(square, piece.color);

    if (
        piece.type === "k" &&
        endgame
    ) {
        return KING_ENDGAME[index];
    }

    const table = PST[piece.type];

    if (!table) return 0;

    return table[index];
}


/* =========================================================
   KING SAFETY
========================================================= */

function evaluateKingSafety(engine, color) {

    const board = engine.state.board || {};

    let ownKing = null;
    let enemyKing = null;

    for (const [sq, piece] of Object.entries(board)) {

        if (!piece || piece.type !== "k") continue;

        if (piece.color === color) {
            ownKing = sq;
        } else {
            enemyKing = sq;
        }
    }

    if (!ownKing || !enemyKing) {
        return 0;
    }

    let score = 0;

    const file =
        ownKing.charCodeAt(0) - 97;

    const rank =
        Number(ownKing[1]);

    /* Corner / castled king */

    if (
        file <= 1 ||
        file >= 6
    ) {
        score += 18;
    }

    /* King in center */

    if (
        file >= 2 &&
        file <= 5 &&
        rank >= 3 &&
        rank <= 6
    ) {
        score -= 18;
    }

    /* Pawn shield */

    const direction =
        color === "w" ? 1 : -1;

    for (let df = -1; df <= 1; df++) {

        const f = file + df;

        if (f < 0 || f > 7) continue;

        const pawnRank = rank + direction;

        if (
            pawnRank >= 1 &&
            pawnRank <= 8
        ) {

            const sq =
                String.fromCharCode(97 + f) +
                pawnRank;

            const piece = board[sq];

            if (
                piece &&
                piece.color === color &&
                piece.type === "p"
            ) {
                score += 8;
            } else {
                score -= 6;
            }
        }
    }

    return score;
}


/* =========================================================
   MOBILITY
========================================================= */

function evaluateMobility(engine, color) {

    let ownMoves = 0;
    let enemyMoves = 0;

    try {
        ownMoves =
            engine.legalMoves(color).length;

        enemyMoves =
            engine.legalMoves(opposite(color)).length;
    } catch {
        return 0;
    }

    return (
        (ownMoves - enemyMoves) * 3
    );
}


/* =========================================================
   FULL POSITION EVALUATION
========================================================= */

function evaluate(engine, color) {

    const enemy = opposite(color);

    const endgame = isEndgame(engine);

    let score = 0;

    score += materialScore(engine, color);

    score += evaluatePawns(engine, color);

    score -= evaluatePawns(engine, enemy);

    score += evaluateFiles(engine, color);

    score -= evaluateFiles(engine, enemy);

    score += evaluateKingSafety(engine, color);

    score -= evaluateKingSafety(engine, enemy);

    score += evaluateMobility(engine, color);

    /* positional pieces */

    for (
        const [square, piece]
        of Object.entries(engine.state.board || {})
    ) {

        if (!piece) continue;

        const positional =
            positionalScore(
                piece,
                square,
                endgame
            );

        if (piece.color === color) {
            score += positional;
        } else {
            score -= positional;
        }
    }

    /* Bishop pair */

    let ownBishops = 0;
    let enemyBishops = 0;

    for (
        const piece
        of Object.values(engine.state.board || {})
    ) {

        if (!piece || piece.type !== "b") {
            continue;
        }

        if (piece.color === color) {
            ownBishops++;
        } else {
            enemyBishops++;
        }
    }

    if (ownBishops >= 2) {
        score += 35;
    }

    if (enemyBishops >= 2) {
        score -= 35;
    }

    return score;
}


/* =========================================================
   MOVE ORDERING
========================================================= */

function moveOrderingScore(
    engine,
    move,
    ply
) {

    let score = 0;

    const key = moveKey(move);

    /* TT move */

    if (
        move._ttMove
    ) {
        score += 10000000;
    }

    /* Promotion */

    if (move.promotion) {

        score +=
            900000 +
            (PIECE_VALUE[move.promotion] || 0);
    }

    /* Capture */

    if (move.capture) {

        const attacker =
            engine.getPiece(move.from);

        const victim =
            engine.getPiece(move.to);

        const victimValue =
            victim
                ? PIECE_VALUE[victim.type] || 0
                : 100;

        const attackerValue =
            attacker
                ? PIECE_VALUE[attacker.type] || 0
                : 100;

        score +=
            500000 +
            victimValue * 10 -
            attackerValue;
    }

    /* Killer */

    const killers =
        killerMoves.get(ply) || [];

    if (killers.includes(key)) {
        score += 300000;
    }

    /* History */

    score +=
        historyTable.get(key) || 0;

    return score;
}


function orderMoves(
    engine,
    moves,
    ply = 0,
    ttMove = null
) {

    const ttKey =
        ttMove
            ? moveKey(ttMove)
            : null;

    for (const move of moves) {

        move._ttMove =
            ttKey &&
            moveKey(move) === ttKey;

        move._order =
            moveOrderingScore(
                engine,
                move,
                ply
            );
    }

    moves.sort(
        (a, b) =>
            b._order - a._order
    );

    return moves;
}


/* =========================================================
   QUIESCENCE
========================================================= */

function quiescence(
    engine,
    alpha,
    beta,
    maximizingColor,
    ply = 0
) {

    if (
        Date.now() - searchStart >
        searchLimit
    ) {
        stopSearch = true;
        return 0;
    }

    const standPat =
        evaluate(
            engine,
            maximizingColor
        );

    if (standPat >= beta) {
        return beta;
    }

    if (standPat > alpha) {
        alpha = standPat;
    }

    let moves =
        engine.legalMoves(
            engine.state.turn
        );

    moves =
        moves.filter(
            move =>
                move.capture ||
                move.promotion
        );

    orderMoves(
        engine,
        moves,
        ply
    );

    for (const move of moves) {

        if (stopSearch) break;

        engine.makeMove({
            from: move.from,
            to: move.to,
            promotion: move.promotion
        });

        const score =
            -quiescence(
                engine,
                -beta,
                -alpha,
                opposite(maximizingColor),
                ply + 1
            );

        engine.undo();

        if (score >= beta) {
            return beta;
        }

        if (score > alpha) {
            alpha = score;
        }
    }

    return alpha;
}


/* =========================================================
   MINIMAX / NEGAMAX
========================================================= */

function search(
    engine,
    depth,
    alpha,
    beta,
    color,
    ply = 0
) {

    if (
        Date.now() - searchStart >
        searchLimit
    ) {
        stopSearch = true;
        return 0;
    }

    if (depth <= 0) {

        return quiescence(
            engine,
            alpha,
            beta,
            color,
            ply
        );
    }

    if (
        engine.state.halfmove >= 100
    ) {
        return 0;
    }

    const key =
        positionKey(engine);

    const cached =
        transpositionTable.get(key);

    if (
        cached &&
        cached.depth >= depth
    ) {

        if (
            cached.flag === "EXACT"
        ) {
            return cached.score;
        }

        if (
            cached.flag === "LOWER" &&
            cached.score > alpha
        ) {
            alpha = cached.score;
        }

        if (
            cached.flag === "UPPER" &&
            cached.score < beta
        ) {
            beta = cached.score;
        }

        if (alpha >= beta) {
            return cached.score;
        }
    }

    const turn =
        engine.state.turn;

    let moves =
        engine.legalMoves(turn);

    if (!moves.length) {

        if (
            engine.inCheck(
                engine.state,
                turn
            )
        ) {

            /*
             * Чем меньше ply,
             * тем быстрее мат.
             */

            if (turn === color) {
                return -1000000 + ply;
            }

            return 1000000 - ply;
        }

        return 0;
    }

    const alphaOriginal = alpha;

    let bestScore = -Infinity;
    let bestMove = null;

    let ttMove =
        cached?.bestMove || null;

    orderMoves(
        engine,
        moves,
        ply,
        ttMove
    );

    for (const move of moves) {

        if (stopSearch) {
            break;
        }

        engine.makeMove({
            from: move.from,
            to: move.to,
            promotion: move.promotion
        });

        const score =
            -search(
                engine,
                depth - 1,
                -beta,
                -alpha,
                opposite(color),
                ply + 1
            );

        engine.undo();

        if (score > bestScore) {

            bestScore = score;
            bestMove = move;
        }

        if (score > alpha) {

            alpha = score;

            /*
             * History heuristic
             */

            const keyMove =
                moveKey(move);

            const previous =
                historyTable.get(
                    keyMove
                ) || 0;

            historyTable.set(
                keyMove,
                Math.min(
                    100000,
                    previous +
                    depth * depth
                )
            );
        }

        /*
         * Killer move
         */

        if (
            !move.capture &&
            !move.promotion
        ) {

            if (score > alphaOriginal) {

                const killers =
                    killerMoves.get(ply) || [];

                const keyMove =
                    moveKey(move);

                if (
                    !killers.includes(
                        keyMove
                    )
                ) {

                    killers.unshift(
                        keyMove
                    );

                    if (killers.length > 2) {
                        killers.pop();
                    }

                    killerMoves.set(
                        ply,
                        killers
                    );
                }
            }
        }

        if (alpha >= beta) {
            break;
        }
    }

    if (stopSearch) {
        return bestScore;
    }

    let flag = "EXACT";

    if (bestScore <= alphaOriginal) {
        flag = "UPPER";
    } else if (bestScore >= beta) {
        flag = "LOWER";
    }

    /*
     * Prevent unlimited memory growth.
     */

    if (
        transpositionTable.size >
        MAX_TT_SIZE
    ) {
        transpositionTable.clear();
    }

    transpositionTable.set(
        key,
        {
            depth,
            score: bestScore,
            flag,
            bestMove,
        }
    );

    return bestScore;
}


/* =========================================================
   ROOT SEARCH
========================================================= */

function rootSearch(
    engine,
    depth,
    color
) {

    let moves =
        engine.legalMoves(color);

    if (!moves.length) {
        return null;
    }

    const rootKey =
        positionKey(engine);

    const cached =
        transpositionTable.get(
            rootKey
        );

    orderMoves(
        engine,
        moves,
        0,
        cached?.bestMove
    );

    let bestMove =
        moves[0];

    let bestScore =
        -Infinity;

    let alpha =
        -Infinity;

    const beta =
        Infinity;

    for (const move of moves) {

        if (stopSearch) {
            break;
        }

        engine.makeMove({
            from: move.from,
            to: move.to,
            promotion: move.promotion
        });

        const score =
            -search(
                engine,
                depth - 1,
                -beta,
                -alpha,
                opposite(color),
                1
            );

        engine.undo();

        if (score > bestScore) {

            bestScore = score;
            bestMove = move;
        }

        if (score > alpha) {
            alpha = score;
        }
    }

    transpositionTable.set(
        rootKey,
        {
            depth,
            score: bestScore,
            flag: "EXACT",
            bestMove,
        }
    );

    return {
        move: bestMove,
        score: bestScore,
    };
}


/* =========================================================
   ITERATIVE DEEPENING
========================================================= */

function iterativeSearch(
    engine,
    color,
    maxDepth
) {

    let bestMove = null;
    let bestScore = 0;

    for (
        let depth = 1;
        depth <= maxDepth;
        depth++
    ) {

        if (stopSearch) {
            break;
        }

        const result =
            rootSearch(
                engine,
                depth,
                color
            );

        if (!result) {
            break;
        }

        /*
         * Сохраняем только
         * полностью законченный слой.
         */

        if (!stopSearch) {

            bestMove =
                result.move;

            bestScore =
                result.score;
        }
    }

    return {
        move: bestMove,
        score: bestScore,
    };
}


/* =========================================================
   PUBLIC AI
========================================================= */

export const AI_LEVELS =
    LEVELS;


export function chooseComputerMove(
    engine,
    level = "intermediate"
) {

    const config =
        LEVELS[level] ||
        LEVELS.intermediate;

    const color =
        engine.state.turn;

    const moves =
        engine.legalMoves(color);

    if (!moves.length) {
        return null;
    }

    /*
     * Сбрасываем состояние поиска.
     */

    searchStart =
        Date.now();

    searchLimit =
        config.time;

    stopSearch = false;

    /*
     * Не даём старым killer/history
     * слишком сильно влиять на новую игру.
     */

    if (
        transpositionTable.size >
        MAX_TT_SIZE
    ) {
        transpositionTable.clear();
    }

    const result =
        iterativeSearch(
            engine,
            color,
            config.depth
        );

    let selected =
        result.move || moves[0];

    /*
     * Лёгкий уровень может иногда
     * выбрать один из лучших ходов.
     */

    if (
        config.randomness > 0 &&
        Math.random() <
        config.randomness
    ) {

        const candidates =
            moves
                .slice()
                .sort(
                    (a, b) =>
                        (b._order || 0) -
                        (a._order || 0)
                )
                .slice(0, 3);

        if (candidates.length) {

            selected =
                candidates[
                    Math.floor(
                        Math.random() *
                        candidates.length
                    )
                ];
        }
    }

    /*
     * Не передаём внутренние поля
     * движку.
     */

    return {
        from: selected.from,
        to: selected.to,
        promotion:
            selected.promotion
    };
}


/* =========================================================
   OPTIONAL HELPERS
========================================================= */

export function clearAI() {

    transpositionTable.clear();
    killerMoves.clear();
    historyTable.clear();

}


export function getAIStats() {

    return {
        transpositionTable:
            transpositionTable.size,

        killerMoves:
            killerMoves.size,

        historyMoves:
            historyTable.size,
    };
}
