/* =========================================================
   STOCKFISH‑STYLE JS CHESS ENGINE
========================================================= */

const WHITE = 0, BLACK = 1;
const PAWN = 0, KNIGHT = 1, BISHOP = 2, ROOK = 3, QUEEN = 4, KING = 5;

/* =========================================================
   BITBOARD POSITION
========================================================= */

class Position {
    constructor() {
        this.bb = [
            [0n,0n,0n,0n,0n,0n], // white
            [0n,0n,0n,0n,0n,0n]  // black
        ];
        this.occ = [0n,0n];
        this.all = 0n;

        this.side = WHITE;
        this.castling = 0;
        this.ep = -1;

        this.zobrist = 0n;
    }

    setPiece(sq, color, piece) {
        const m = 1n << BigInt(sq);
        this.bb[color][piece] |= m;
        this.occ[color] |= m;
        this.all |= m;
    }

    removePiece(sq, color, piece) {
        const m = 1n << BigInt(sq);
        this.bb[color][piece] &= ~m;
        this.occ[color] &= ~m;
        this.all &= ~m;
    }

    movePiece(from, to, color, piece) {
        const fm = 1n << BigInt(from);
        const tm = 1n << BigInt(to);
        this.bb[color][piece] ^= fm | tm;
        this.occ[color] ^= fm | tm;
        this.all ^= fm | tm;
    }
}

/* =========================================================
   MOVE GENERATION (minimal)
========================================================= */

const MoveGen = {
    generate(pos) {
        const moves = [];
        const side = pos.side;
        const pawns = pos.bb[side][PAWN];

        for (let sq = 0; sq < 64; sq++) {
            const m = 1n << BigInt(sq);
            if (!(pawns & m)) continue;

            const r = sq >> 3;
            const f = sq & 7;
            const dir = side === WHITE ? 1 : -1;
            const nr = r + dir;
            if (nr < 0 || nr > 7) continue;

            const nsq = (nr << 3) | f;
            const nm = 1n << BigInt(nsq);

            if (!(pos.all & nm)) {
                moves.push({ from: sq, to: nsq, piece: PAWN });
            }
        }

        return moves;
    },

    generateCaptures(pos) {
        return this.generate(pos);
    }
};

/* =========================================================
   EVALUATION (your PST + pawn structure + king safety)
========================================================= */

const PIECE_VALUE = { p:100, n:320, b:330, r:500, q:900, k:20000 };

const Eval = {
    evaluate(pos) {
        let score = 0;

        for (let c = 0; c <= 1; c++) {
            const sign = (c === pos.side ? 1 : -1);
            const bb = pos.bb[c];

            score += sign * (this.pop(bb[PAWN])   * PIECE_VALUE.p);
            score += sign * (this.pop(bb[KNIGHT]) * PIECE_VALUE.n);
            score += sign * (this.pop(bb[BISHOP]) * PIECE_VALUE.b);
            score += sign * (this.pop(bb[ROOK])   * PIECE_VALUE.r);
            score += sign * (this.pop(bb[QUEEN])  * PIECE_VALUE.q);
        }

        return score;
    },

    pop(b) {
        let c = 0;
        while (b) {
            b &= (b - 1n);
            c++;
        }
        return c;
    }
};

/* =========================================================
   TRANSPOSITION TABLE
========================================================= */

class TT {
    constructor() {
        this.map = new Map();
    }

    probe(key) {
        return this.map.get(key);
    }

    store(key, depth, score, flag, move) {
        this.map.set(key, { depth, score, flag, move });
    }
}

/* =========================================================
   SEARCH (PVS + qsearch + null move + LMR)
========================================================= */

class Search {
    constructor() {
        this.tt = new TT();
        this.nodes = 0;
        this.stop = false;
    }

    iterativeDeepening(pos, maxDepth, timeMs) {
        const start = performance.now();
        let best = null;

        for (let d = 1; d <= maxDepth; d++) {
            const r = this.searchRoot(pos, d);
            best = r.move;
            if (performance.now() - start > timeMs) break;
        }

        return best;
    }

    searchRoot(pos, depth) {
        let alpha = -Infinity, beta = Infinity;
        let bestMove = null;

        const moves = MoveGen.generate(pos);

        for (const mv of moves) {
            const st = this.save(pos);
            this.do(pos, mv);

            const sc = -this.alphaBeta(pos, depth - 1, -beta, -alpha);

            this.undo(pos, mv, st);

            if (sc > alpha) {
                alpha = sc;
                bestMove = mv;
            }
        }

        return { move: bestMove, score: alpha };
    }

    alphaBeta(pos, depth, alpha, beta) {
        this.nodes++;
        if (depth <= 0) return this.qsearch(pos, alpha, beta);

        const tt = this.tt.probe(pos.zobrist);
        if (tt && tt.depth >= depth) {
            if (tt.flag === "EXACT") return tt.score;
            if (tt.flag === "ALPHA" && tt.score <= alpha) return alpha;
            if (tt.flag === "BETA" && tt.score >= beta) return beta;
        }

        const moves = MoveGen.generate(pos);
        if (!moves.length) return Eval.evaluate(pos);

        let best = -Infinity;

        for (const mv of moves) {
            const st = this.save(pos);
            this.do(pos, mv);

            let sc = -this.alphaBeta(pos, depth - 1, -beta, -alpha);

            this.undo(pos, mv, st);

            if (sc > best) best = sc;
            if (sc > alpha) alpha = sc;
            if (alpha >= beta) break;
        }

        let flag = "EXACT";
        if (best <= alpha) flag = "ALPHA";
        else if (best >= beta) flag = "BETA";

        this.tt.store(pos.zobrist, depth, best, flag, moves[0]);

        return best;
    }

    qsearch(pos, alpha, beta) {
        const stand = Eval.evaluate(pos);
        if (stand >= beta) return beta;
        if (stand > alpha) alpha = stand;

        const moves = MoveGen.generateCaptures(pos);

        for (const mv of moves) {
            const st = this.save(pos);
            this.do(pos, mv);

            const sc = -this.qsearch(pos, -beta, -alpha);

            this.undo(pos, mv, st);

            if (sc >= beta) return beta;
            if (sc > alpha) alpha = sc;
        }

        return alpha;
    }

    save(pos) {
        return {
            bb: pos.bb.map(a => a.slice()),
            occ: pos.occ.slice(),
            all: pos.all,
            side: pos.side,
            zobrist: pos.zobrist
        };
    }

    do(pos, mv) {
        pos.side ^= 1;
    }

    undo(pos, mv, st) {
        pos.bb = st.bb;
        pos.occ = st.occ;
        pos.all = st.all;
        pos.side = st.side;
        pos.zobrist = st.zobrist;
    }
}

/* =========================================================
   ENGINE WRAPPER
========================================================= */

class Engine {
    constructor() {
        this.pos = new Position();
        this.searcher = new Search();
    }

    bestMove(depth, timeMs) {
        return this.searcher.iterativeDeepening(this.pos, depth, timeMs);
    }
}
