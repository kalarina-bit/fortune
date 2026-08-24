// js/ai.js
import { ChessEngine, FILES, VALUES } from "/shared/chess-engine.js";

/* ---------- Материал (в сотых пешки) ---------- */
const MATERIAL = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };

/* ---------- Piece-square таблицы (ряд 0 = 1-я горизонталь для белых) ---------- */
const TABLES = {
    p: [
        [0,0,0,0,0,0,0,0],
        [5,10,10,-20,-20,10,10,5],
        [5,-5,-10,0,0,-10,-5,5],
        [0,0,0,20,20,0,0,0],
        [5,5,10,25,25,10,5,5],
        [10,10,20,30,30,20,10,10],
        [50,50,50,50,50,50,50,50],
        [0,0,0,0,0,0,0,0],
    ],
    n: [
        [-50,-40,-30,-30,-30,-30,-40,-50],
        [-40,-20,0,5,5,0,-20,-40],
        [-30,5,10,15,15,10,5,-30],
        [-30,0,15,20,20,15,0,-30],
        [-30,5,15,20,20,15,5,-30],
        [-30,0,10,15,15,10,0,-30],
        [-40,-20,0,0,0,0,-20,-40],
        [-50,-40,-30,-30,-30,-30,-40,-50],
    ],
    b: [
        [-20,-10,-10,-10,-10,-10,-10,-20],
        [-10,5,0,0,0,0,5,-10],
        [-10,10,10,10,10,10,10,-10],
        [-10,0,10,10,10,10,0,-10],
        [-10,5,5,10,10,5,5,-10],
        [-10,0,5,10,10,5,0,-10],
        [-10,0,0,0,0,0,0,-10],
        [-20,-10,-10,-10,-10,-10,-10,-20],
    ],
    r: [
        [0,0,0,5,5,0,0,0],
        [-5,0,0,0,0,0,0,-5],
        [-5,0,0,0,0,0,0,-5],
        [-5,0,0,0,0,0,0,-5],
        [-5,0,0,0,0,0,0,-5],
        [-5,0,0,0,0,0,0,-5],
        [5,10,10,10,10,10,10,5],
        [0,0,0,0,0,0,0,0],
    ],
    q: [
        [-20,-10,-10,-5,-5,-10,-10,-20],
        [-10,0,0,0,0,0,0,-10],
        [-10,0,5,5,5,5,0,-10],
        [-5,0,5,5,5,5,0,-5],
        [0,0,5,5,5,5,0,-5],
        [-10,5,5,5,5,5,0,-10],
        [-10,0,5,0,0,0,0,-10],
        [-20,-10,-10,-5,-5,-10,-10,-20],
    ],
    k: [
        [-30,-40,-40,-50,-50,-40,-40,-30],
        [-30,-40,-40,-50,-50,-40,-40,-30],
        [-30,-40,-40,-50,-50,-40,-40,-30],
        [-30,-40,-40,-50,-50,-40,-40,-30],
        [-20,-30,-30,-40,-40,-30,-30,-20],
        [-10,-20,-20,-20,-20,-20,-20,-10],
        [20,20,0,0,0,0,20,20],
        [20,30,10,0,0,10,30,20],
    ],
};

export const AI_LEVELS = {
    easy:         { depth: 1, spread: 110 },
    intermediate: { depth: 2, spread: 45 },
    hard:         { depth: 3, spread: 12 },
};

/* ---------- Утилиты, работающие с доской-ОБЪЕКТОМ ---------- */

// "e4" -> {file:4, rank:3}
function coords(squareName) {
    return {
        file: FILES.indexOf(squareName[0]),
        rank: Number(squareName[1]) - 1,
    };
}

function tableScore(type, color, file, rank) {
    const row = color === "w" ? rank : 7 - rank;
    return TABLES[type][row][file] || 0;
}

function positionKey(state) {
    const parts = [state.turn];
    for (const sq of Object.keys(state.board).sort()) {
        const p = state.board[sq];
        parts.push(`${sq}${p.type}${p.color}`);
    }
    return parts.join("");
}

/* ---------- Оценка позиции (с точки зрения perspective) ---------- */

function evaluateMaterialAndSpace(state, perspective) {
    let score = 0;
    for (const [sq, piece] of Object.entries(state.board)) {
        const { file, rank } = coords(sq);
        const value =
            (MATERIAL[piece.type] || 0) +
            tableScore(piece.type, piece.color, file, rank);
        score += piece.color === perspective ? value : -value;
    }
    return score;
}

function evaluateState(state, perspective) {
    const status = state.status || ChessEngine.evaluateStatus(state);

    if (status.phase === "checkmate") {
        return status.winner === perspective ? 100000 : -100000;
    }
    if (status.phase === "draw") return 0;

    const other = perspective === "w" ? "b" : "w";
    const ownMobility = ChessEngine.generateLegalMovesForState(state, perspective).length;
    const enemyMobility = ChessEngine.generateLegalMovesForState(state, other).length;
    const pressure = status.phase === "check"
        ? (state.turn === perspective ? -18 : 18)
        : 0;

    return (
        evaluateMaterialAndSpace(state, perspective) +
        (ownMobility - enemyMobility) * 4 +
        pressure
    );
}

/* ---------- Quiescence: доигрываем взятия ---------- */

function quiescence(state, alpha, beta, perspective) {
    const standPat = evaluateState(state, perspective);
    if (standPat >= beta) return beta;
    if (alpha < standPat) alpha = standPat;

    const captures = ChessEngine
        .generateLegalMovesForState(state, state.turn)
        .filter((m) => m.capture || m.promotion);

    if (!captures.length) return standPat;

    captures.sort((a, b) => {
        const va = (a.capture ? 100 : 0) + (a.promotion ? MATERIAL[a.promotion] : 0);
        const vb = (b.capture ? 100 : 0) + (b.promotion ? MATERIAL[b.promotion] : 0);
        return vb - va;
    });

    for (const m of captures) {
        const next = ChessEngine.playMove(state, m, { computeStatus: false });
        const score = -quiescence(next, -beta, -alpha, perspective);
        if (score >= beta) return beta;
        if (score > alpha) alpha = score;
    }
    return alpha;
}

/* ---------- Negamax + alpha-beta + transposition table ---------- */

function negamax(state, depth, alpha, beta, perspective, tt) {
    const status = state.status || ChessEngine.evaluateStatus(state);
    if (depth === 0 || status.phase === "checkmate" || status.phase === "draw") {
        return quiescence(state, alpha, beta, perspective);
    }

    const key = positionKey(state) + "|" + depth;
    const hit = tt.get(key);
    if (hit !== undefined) return hit;

    const moves = ChessEngine.generateLegalMovesForState(state, state.turn);
    if (!moves.length) return evaluateState(state, perspective);

    // Move ordering по быстрой материальной оценке
    const scored = moves.map((m) => {
        const ns = ChessEngine.playMove(state, m, { computeStatus: false });
        return { m, s: evaluateMaterialAndSpace(ns, perspective) };
    });
    scored.sort((a, b) => b.s - a.s);

    let max = -Infinity;
    for (const { m } of scored) {
        const next = ChessEngine.playMove(state, m, { computeStatus: false });
        const val = -negamax(next, depth - 1, -beta, -alpha, perspective, tt);
        if (val > max) max = val;
        if (val > alpha) alpha = val;
        if (alpha >= beta) break;
    }

    tt.set(key, max);
    return max;
}

/* ---------- Публичная функция выбора хода ---------- */

export function chooseComputerMove(engine, level = "intermediate") {
    const config = AI_LEVELS[level] || AI_LEVELS.intermediate;

    // Работаем с чистым снимком state (объект доски)
    const snapshot = engine.getSnapshot();
    const root = {
        board: snapshot.board,
        turn: snapshot.turn,
        castling: snapshot.castling,
        ep: snapshot.ep,
        halfmove: snapshot.halfmove,
        fullmove: snapshot.fullmove,
        lastMove: snapshot.lastMove,
    };

    const legal = ChessEngine.generateLegalMovesForState(root, root.turn);
    if (!legal.length) return null;

    const perspective = root.turn;
    const tt = new Map();

    const scored = legal.map((move) => {
        const next = ChessEngine.playMove(root, move, { computeStatus: false });
        const score = -negamax(
            next,
            Math.max(0, config.depth - 1),
            -Infinity,
            Infinity,
            perspective,
            tt
        );
        return { move, score };
    });

    scored.sort((a, b) => b.score - a.score);

    const best = scored[0].score;
    const pool = scored
        .filter((e) => best - e.score <= config.spread)
        .slice(0, 4);

    const choice = pool[Math.floor(Math.random() * pool.length)];
    return choice.move;
}

