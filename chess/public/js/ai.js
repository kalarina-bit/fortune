/*
=========================================================
 CHESS AI — STRONG IMPROVED ENGINE
=========================================================
 Features:
 - Iterative Deepening
 - Alpha-Beta Pruning
 - Null Move Pruning
 - Late Move Reductions (LMR)
 - Quiescence Search
 - Transposition Table (with Zobrist Hashing)
 - Killer Moves
 - History Heuristic
 - MVV-LVA (Most Valuable Victim - Least Valuable Attacker)
 - Improved Piece-Square Tables (PST)
 - Pawn Structure Evaluation (Doubled, Isolated, Passed, Protected)
 - Open/Semi-Open Files
 - Mobility
 - King Safety (Pawn Shield, Open Files, Attacks)
 - Endgame Evaluation (King Activity, Pawn Races)
 - Mate Search
 - Zobrist Hashing for Position Key
 - Better Move Ordering
 - Time Management
=========================================================
*/

/* =========================================================
   CONSTANTS & CONFIG
========================================================= */

const PIECE_VALUE = {
    p: 100,
    n: 320,
    b: 330,
    r: 500,
    q: 900,
    k: 20000,
};

const PIECE_COLOR = {
    w: 1,
    b: -1,
};

// Improved Piece-Square Tables (in centipawns)
const PST = {
    p: [
        0,   0,   0,   0,   0,   0,   0,   0,
        12,  19,  20,  23,  23,  20,  19,  12,
        10,  16,  20,  24,  24,  20,  16,  10,
         9,  14,  20,  26,  26,  20,  14,   9,
         7,  12,  18,  25,  25,  18,  12,   7,
         5,   8,  15,  20,  20,  15,   8,   5,
         0,   0,   0,   5,   5,   0,   0,   0,
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

const LEVELS = {
    easy: { depth: 2, time: 350, randomness: 0.12 },
    intermediate: { depth: 4, time: 1000, randomness: 0.025 },
    hard: { depth: 5, time: 2500, randomness: 0 },
    expert: { depth: 6, time: 5000, randomness: 0 },
    master: { depth: 7, time: 10000, randomness: 0 },
};

/* =========================================================
   ZOBRIST HASHING (for Transposition Table)
========================================================= */
const Zobrist = (() => {
    const table = new Array(64 * 12);
    for (let i = 0; i < table.length; i++) {
        table[i] = Math.floor(Math.random() * 0xFFFFFFFFFFFFFFFFn);
    }

    const getPieceIndex = (piece) => {
        if (!piece) return -1;
        const pieceTypes = ['p', 'n', 'b', 'r', 'q', 'k'];
        const pieceIndex = pieceTypes.indexOf(piece.type);
        const colorIndex = piece.color === 'w' ? 0 : 6;
        return colorIndex + pieceIndex;
    };

    return {
        getKey: (board) => {
            let key = 0n;
            for (const [sq, piece] of Object.entries(board)) {
                if (!piece) continue;
                const index = getPieceIndex(piece);
                if (index === -1) continue;
                const squareIndex = (sq.charCodeAt(0) - 97) + (8 - Number(sq[1])) * 8;
                key ^= table[index * 64 + squareIndex];
            }
            return key;
        }
    };
})();

/* =========================================================
   SEARCH STATE
========================================================= */
let searchStart = 0;
let searchLimit = 5000;
let stopSearch = false;
let nodesSearched = 0;

const transpositionTable = new Map();
const killerMoves = new Map(); // { ply: [moveKey1, moveKey2] }
const historyTable = new Map(); // { moveKey: score }
const MAX_TT_SIZE = 100000;

/* =========================================================
   UTILS
========================================================= */
function opposite(color) {
    return color === "w" ? "b" : "w";
}

function squareIndex(square) {
    if (!square || square.length < 2) return 0;
    const file = square.charCodeAt(0) - 97;
    const rank = Number(square[1]) - 1;
    if (file < 0 || file > 7 || rank < 0 || rank > 7) return 0;
    return rank * 8 + file;
}

function mirroredIndex(square, color) {
    const index = squareIndex(square);
    if (color === "w") return index;
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
   POSITION EVALUATION
========================================================= */
function isEndgame(engine) {
    let nonPawnPieces = 0;
    let queens = 0;
    for (const piece of Object.values(engine.state.board || {})) {
        if (!piece) continue;
        if (piece.type === "q") queens++;
        if (piece.type !== "p" && piece.type !== "k") nonPawnPieces++;
    }
    return queens === 0 && nonPawnPieces <= 4;
}

function materialScore(engine, color) {
    let score = 0;
    for (const piece of Object.values(engine.state.board || {})) {
        if (!piece) continue;
        const value = PIECE_VALUE[piece.type] || 0;
        score += piece.color === color ? value : -value;
    }
    return score;
}

function evaluatePawns(engine, color) {
    const board = engine.state.board || {};
    const ownPawns = [];
    const enemyPawns = [];
    for (const [sq, piece] of Object.entries(board)) {
        if (!piece || piece.type !== "p") continue;
        if (piece.color === color) ownPawns.push(sq);
        else enemyPawns.push(sq);
    }

    let score = 0;
    const ownFiles = Array(8).fill(0);
    const enemyFiles = Array(8).fill(0);
    for (const sq of ownPawns) ownFiles[sq.charCodeAt(0) - 97]++;
    for (const sq of enemyPawns) enemyFiles[sq.charCodeAt(0) - 97]++;

    // Doubled pawns
    for (const count of ownFiles) if (count > 1) score -= (count - 1) * 18;

    // Isolated pawns
    for (let file = 0; file < 8; file++) {
        if (ownFiles[file] !== 0) {
            const left = file > 0 ? ownFiles[file - 1] : 0;
            const right = file < 7 ? ownFiles[file + 1] : 0;
            if (!left && !right) score -= 12;
        }
    }

    // Passed pawns
    for (const sq of ownPawns) {
        const file = sq.charCodeAt(0) - 97;
        const rank = Number(sq[1]) - 1;
        let blocked = false;
        for (const enemySq of enemyPawns) {
            const ef = enemySq.charCodeAt(0) - 97;
            const er = Number(enemySq[1]) - 1;
            if (Math.abs(ef - file) > 1) continue;
            if ((color === "w" && er > rank) || (color === "b" && er < rank)) {
                blocked = true;
                break;
            }
        }
        if (!blocked) {
            const advancement = color === "w" ? rank : 7 - rank;
            score += 15 + advancement * 12;
        }
    }

    // Protected passed pawns
    for (const sq of ownPawns) {
        const file = sq.charCodeAt(0) - 97;
        const rank = Number(sq[1]) - 1;
        let isProtected = false;
        for (const otherSq of ownPawns) {
            if (otherSq === sq) continue;
            const otherFile = otherSq.charCodeAt(0) - 97;
            const otherRank = Number(otherSq[1]) - 1;
            if (Math.abs(otherFile - file) === 1 && otherRank === rank + (color === "w" ? -1 : 1)) {
                isProtected = true;
                break;
            }
        }
        let isPassed = true;
        for (const enemySq of enemyPawns) {
            const ef = enemySq.charCodeAt(0) - 97;
            const er = Number(enemySq[1]) - 1;
            if (Math.abs(ef - file) <= 1 && ((color === "w" && er > rank) || (color === "b" && er < rank))) {
                isPassed = false;
                break;
            }
        }
        if (isPassed && isProtected) score += 20;
    }

    return score;
}

function evaluateFiles(engine, color) {
    const board = engine.state.board || {};
    let score = 0;
    for (let file = 0; file < 8; file++) {
        let ownPawn = false;
        let enemyPawn = false;
        for (let rank = 1; rank <= 8; rank++) {
            const sq = String.fromCharCode(97 + file) + rank;
            const piece = board[sq];
            if (!piece || piece.type !== "p") continue;
            if (piece.color === color) ownPawn = true;
            else enemyPawn = true;
        }
        if (!ownPawn && !enemyPawn) score += 8;
        else if (!ownPawn) score += 15;
    }
    return score;
}

function positionalScore(piece, square, endgame) {
    if (!piece) return 0;
    const index = mirroredIndex(square, piece.color);
    if (piece.type === "k" && endgame) return KING_ENDGAME[index];
    const table = PST[piece.type];
    if (!table) return 0;
    return table[index];
}

function evaluateKingSafety(engine, color) {
    const board = engine.state.board || {};
    let ownKing = null;
    for (const [sq, piece] of Object.entries(board)) {
        if (!piece || piece.type !== "k" || piece.color !== color) continue;
        ownKing = sq;
        break;
    }
    if (!ownKing) return 0;

    let score = 0;
    const file = ownKing.charCodeAt(0) - 97;
    const rank = Number(ownKing[1]) - 1;

    // Corner / castled king
    if (file <= 1 || file >= 6) score += 18;

    // King in center
    if (file >= 2 && file <= 5 && rank >= 3 && rank <= 6) score -= 18;

    // Pawn shield
    const direction = color === "w" ? 1 : -1;
    for (let df = -1; df <= 1; df++) {
        const f = file + df;
        if (f < 0 || f > 7) continue;
        const pawnRank = rank + direction;
        if (pawnRank >= 1 && pawnRank <= 8) {
            const sq = String.fromCharCode(97 + f) + pawnRank;
            const piece = board[sq];
            if (piece && piece.color === color && piece.type === "p") score += 8;
            else score -= 6;
        }
    }

    // Penalty for open files attacking the king
    for (const [sq, piece] of Object.entries(board)) {
        if (!piece || piece.color === color) continue;
        if (piece.type === "r" || piece.type === "q") {
            const pieceFile = sq.charCodeAt(0) - 97;
            const pieceRank = Number(sq[1]) - 1;
            if (pieceFile === file || pieceRank === rank) {
                let blocked = false;
                if (pieceFile === file) {
                    const step = pieceRank < rank ? 1 : -1;
                    for (let r = pieceRank + step; r !== rank; r += step) {
                        if (board[`${String.fromCharCode(97 + pieceFile)}${r + 1}`]) {
                            blocked = true;
                            break;
                        }
                    }
                } else if (pieceRank === rank) {
                    const step = pieceFile < file ? 1 : -1;
                    for (let f = pieceFile + step; f !== file; f += step) {
                        if (board[`${String.fromCharCode(97 + f)}${pieceRank + 1}`]) {
                            blocked = true;
                            break;
                        }
                    }
                }
                if (!blocked) score -= 30;
            }
        }
    }

    return score;
}

function evaluateMobility(engine, color) {
    try {
        const ownMoves = engine.legalMoves(color).length;
        const enemyMoves = engine.legalMoves(opposite(color)).length;
        return (ownMoves - enemyMoves) * 3;
    } catch {
        return 0;
    }
}

function evaluateEndgame(engine, color) {
    if (!isEndgame(engine)) return 0;
    let score = 0;
    const board = engine.state.board || {};
    let ownKing = null;
    let enemyKing = null;
    for (const [sq, piece] of Object.entries(board)) {
        if (!piece || piece.type !== "k") continue;
        if (piece.color === color) ownKing = sq;
        else enemyKing = sq;
    }
    if (!ownKing || !enemyKing) return 0;

    const ownKingFile = ownKing.charCodeAt(0) - 97;
    const ownKingRank = Number(ownKing[1]) - 1;
    const enemyKingFile = enemyKing.charCodeAt(0) - 97;
