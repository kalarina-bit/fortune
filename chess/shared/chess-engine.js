const FILES = "abcdefgh";

const VALUES = {
    p: 1,
    n: 3,
    b: 3,
    r: 5,
    q: 9,
    k: 0
};

const PIECES = ["q", "r", "b", "n"];

function square(file, rank) {
    return `${FILES[file]}${rank + 1}`;
}

function parseSquare(value) {
    if (!/^[a-h][1-8]$/.test(value || "")) {
        return null;
    }

    return {
        file: FILES.indexOf(value[0]),
        rank: Number(value[1]) - 1
    };
}

function safeSquare(file, rank) {
    if (
        file < 0 ||
        file > 7 ||
        rank < 0 ||
        rank > 7
    ) {
        return null;
    }

    return square(file, rank);
}

function opposite(color) {
    return color === "w" ? "b" : "w";
}

function cloneState(state) {
    const board = {};

    for (const [sq, piece] of Object.entries(state.board)) {
        board[sq] = {
            color: piece.color,
            type: piece.type
        };
    }

    return {
        board,
        turn: state.turn,

        castling: {
            w: { ...state.castling.w },
            b: { ...state.castling.b }
        },

        ep: state.ep,
        halfmove: state.halfmove,
        fullmove: state.fullmove,

        lastMove: state.lastMove
            ? { ...state.lastMove }
            : null
    };
}

export class ChessEngine {

    constructor(fen = null) {
        this.reset();

        if (fen) {
            this.loadFen(fen);
        }
    }

    reset() {
        this.loadFen(
            "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
        );
    }

    loadFen(fen) {
        const parts = String(fen).trim().split(/\s+/);

        const placement = parts[0];
        const turn = parts[1] || "w";
        const castling = parts[2] || "-";
        const ep = parts[3] || "-";
        const halfmove = Number(parts[4] || 0);
        const fullmove = Number(parts[5] || 1);

        const board = {};

        let rank = 7;
        let file = 0;

        for (const char of placement) {
            if (char === "/") {
                rank--;
                file = 0;
                continue;
            }

            if (/^\d$/.test(char)) {
                file += Number(char);
                continue;
            }

            const color =
                char === char.toUpperCase()
                    ? "w"
                    : "b";

            board[square(file, rank)] = {
                color,
                type: char.toLowerCase()
            };

            file++;
        }

        this.state = {
            board,

            turn:
                turn === "b"
                    ? "b"
                    : "w",

            castling: {
                w: {
                    k: castling.includes("K"),
                    q: castling.includes("Q")
                },

                b: {
                    k: castling.includes("k"),
                    q: castling.includes("q")
                }
            },

            ep:
                ep === "-"
                    ? null
                    : ep,

            halfmove,
            fullmove,
            lastMove: null
        };

        this.history = [];
        this.positions = new Map();

        this.positions.set(
            this.positionKey(this.state),
            1
        );
    }

    get fen() {
        let result = "";

        for (let rank = 7; rank >= 0; rank--) {
            let empty = 0;

            for (let file = 0; file < 8; file++) {
                const piece =
                    this.state.board[
                        square(file, rank)
                    ];

                if (!piece) {
                    empty++;
                    continue;
                }

                if (empty) {
                    result += empty;
                    empty = 0;
                }

                result +=
                    piece.color === "w"
                        ? piece.type.toUpperCase()
                        : piece.type;
            }

            if (empty) {
                result += empty;
            }

            if (rank > 0) {
                result += "/";
            }
        }

        let rights = "";

        if (this.state.castling.w.k) rights += "K";
        if (this.state.castling.w.q) rights += "Q";
        if (this.state.castling.b.k) rights += "k";
        if (this.state.castling.b.q) rights += "q";

        return [
            result,
            this.state.turn,
            rights || "-",
            this.state.ep || "-",
            this.state.halfmove,
            this.state.fullmove
        ].join(" ");
    }

    positionKey(state) {
        const pieces = Object
            .keys(state.board)
            .sort()
            .map(sq => {
                const p = state.board[sq];
                return `${sq}${p.color}${p.type}`;
            })
            .join(",");

        let rights = "";

        if (state.castling.w.k) rights += "K";
        if (state.castling.w.q) rights += "Q";
        if (state.castling.b.k) rights += "k";
        if (state.castling.b.q) rights += "q";

        return [
            pieces,
            state.turn,
            rights || "-",
            state.ep || "-"
        ].join("|");
    }

    getPiece(squareName) {
        return this.state.board[squareName] || null;
    }

    movesFrom(from) {
        const piece = this.state.board[from];

        if (!piece) {
            return [];
        }

        if (piece.color !== this.state.turn) {
            return [];
        }

        return this.legalMoves(
            this.state.turn
        ).filter(
            move => move.from === from
        );
    }

    legalMoves(color = this.state.turn) {
        const pseudo =
            this.pseudoMoves(
                this.state,
                color
            );

        const result = [];

        for (const move of pseudo) {
            const next =
                this.applyMoveToState(
                    this.state,
                    move
                );

            if (!this.inCheck(next, color)) {
                result.push(move);
            }
        }

        return result;
    }

    pseudoMoves(state, color) {
        const result = [];

        for (const [from, piece] of Object.entries(state.board)) {
            if (piece.color !== color) {
                continue;
            }

            const pos = parseSquare(from);

            if (!pos) {
                continue;
            }

            switch (piece.type) {
                case "p":
                    this.pawnMoves(
                        state,
                        from,
                        piece,
                        pos,
                        result
                    );
                    break;

                case "n":
                    this.knightMoves(
                        state,
                        from,
                        piece,
                        pos,
                        result
                    );
                    break;

                case "b":
                    this.slideMoves(
                        state,
                        from,
                        piece,
                        pos,
                        result,
                        [
                            [1, 1],
                            [1, -1],
                            [-1, 1],
                            [-1, -1]
                        ]
                    );
                    break;

                case "r":
                    this.slideMoves(
                        state,
                        from,
                        piece,
                        pos,
                        result,
                        [
                            [1, 0],
                            [-1, 0],
                            [0, 1],
                            [0, -1]
                        ]
                    );
                    break;

                case "q":
                    this.slideMoves(
                        state,
                        from,
                        piece,
                        pos,
                        result,
                        [
                            [1, 1],
                            [1, -1],
                            [-1, 1],
                            [-1, -1],
                            [1, 0],
                            [-1, 0],
                            [0, 1],
                            [0, -1]
                        ]
                    );
                    break;

                case "k":
                    this.kingMoves(
                        state,
                        from,
                        piece,
                        pos,
                        result
                    );
                    break;
            }
        }

        return result;
    }

    addMove(
        state,
        result,
        from,
        to,
        promotion = null,
        special = null
    ) {
        const target = state.board[to];

        if (
            target &&
            target.color === state.board[from].color
        ) {
            return;
        }

        if (
            target &&
            target.type === "k"
        ) {
            return;
        }

        result.push({
            from,
            to,
            promotion,
            special,
            capture:
                Boolean(target) ||
                special === "ep"
        });
    }

    pawnMoves(
        state,
        from,
        piece,
        pos,
        result
    ) {
        const direction =
            piece.color === "w"
                ? 1
                : -1;

        const startRank =
            piece.color === "w"
                ? 1
                : 6;

        const promotionRank =
            piece.color === "w"
                ? 7
                : 0;

        const one =
            safeSquare(
                pos.file,
                pos.rank + direction
            );

        if (
            one &&
            !state.board[one]
        ) {
            if (
                pos.rank + direction ===
                promotionRank
            ) {
                for (const type of PIECES) {
                    this.addMove(
                        state,
                        result,
                        from,
                        one,
                        type
                    );
                }
            } else {
                this.addMove(
                    state,
                    result,
                    from,
                    one
                );

                if (
                    pos.rank === startRank
                ) {
                    const two =
                        safeSquare(
                            pos.file,
                            pos.rank +
                            direction * 2
                        );

                    if (
                        two &&
                        !state.board[two]
                    ) {
                        this.addMove(
                            state,
                            result,
                            from,
                            two,
                            null,
                            "double"
                        );
                    }
                }
            }
        }

        for (const df of [-1, 1]) {
            const to =
                safeSquare(
                    pos.file + df,
                    pos.rank + direction
                );

            if (!to) {
                continue;
            }

            const target =
                state.board[to];

            if (
                target &&
                target.color !== piece.color &&
                target.type !== "k"
            ) {
                if (
                    pos.rank + direction ===
                    promotionRank
                ) {
                    for (const type of PIECES) {
                        this.addMove(
                            state,
                            result,
                            from,
                            to,
                            type
                        );
                    }
                } else {
                    this.addMove(
                        state,
                        result,
                        from,
                        to
                    );
                }
            } else if (
                state.ep === to
            ) {
                this.addMove(
                    state,
                    result,
                    from,
                    to,
                    null,
                    "ep"
                );
            }
        }
    }

    knightMoves(
        state,
        from,
        piece,
        pos,
        result
    ) {
        const jumps = [
            [1, 2],
            [2, 1],
            [-1, 2],
            [-2, 1],
            [1, -2],
            [2, -1],
            [-1, -2],
            [-2, -1]
        ];

        for (const [df, dr] of jumps) {
            const to =
                safeSquare(
                    pos.file + df,
                    pos.rank + dr
                );

            if (to) {
                this.addMove(
                    state,
                    result,
                    from,
                    to
                );
            }
        }
    }

    slideMoves(
        state,
        from,
        piece,
        pos,
        result,
        directions
    ) {
        for (const [df, dr] of directions) {
            let file = pos.file + df;
            let rank = pos.rank + dr;

            while (
                file >= 0 &&
                file < 8 &&
                rank >= 0 &&
                rank < 8
            ) {
                const to =
                    square(file, rank);

                const target =
                    state.board[to];

                if (!target) {
                    this.addMove(
                        state,
                        result,
                        from,
                        to
                    );
                } else {
                    if (
                        target.color !== piece.color &&
                        target.type !== "k"
                    ) {
                        this.addMove(
                            state,
                            result,
                            from,
                            to
                        );
                    }

                    break;
                }

                file += df;
                rank += dr;
            }
        }
    }

    kingMoves(
        state,
        from,
        piece,
        pos,
        result
    ) {
        for (let df = -1; df <= 1; df++) {
            for (let dr = -1; dr <= 1; dr++) {
                if (!df && !dr) {
                    continue;
                }

                const to =
                    safeSquare(
                        pos.file + df,
                        pos.rank + dr
                    );

                if (to) {
                    this.addMove(
                        state,
                        result,
                        from,
                        to
                    );
                }
            }
        }

        const rank =
            piece.color === "w"
                ? 0
                : 7;

        const enemy =
            opposite(piece.color);

        if (
            pos.file !== 4 ||
            pos.rank !== rank
        ) {
            return;
        }

        if (
            this.inCheck(
                state,
                piece.color
            )
        ) {
            return;
        }

        if (
            state.castling[piece.color].k &&
            !state.board[square(5, rank)] &&
            !state.board[square(6, rank)] &&
            state.board[square(7, rank)]?.type === "r"
        ) {
            if (
                !this.isAttacked(
                    state,
                    square(5, rank),
                    enemy
                ) &&
                !this.isAttacked(
                    state,
                    square(6, rank),
                    enemy
                )
            ) {
                this.addMove(
                    state,
                    result,
                    from,
                    square(6, rank),
                    null,
                    "castle-k"
                );
            }
        }

        if (
            state.castling[piece.color].q &&
            !state.board[square(1, rank)] &&
            !state.board[square(2, rank)] &&
            !state.board[square(3, rank)] &&
            state.board[square(0, rank)]?.type === "r"
        ) {
            if (
                !this.isAttacked(
                    state,
                    square(3, rank),
                    enemy
                ) &&
                !this.isAttacked(
                    state,
                    square(2, rank),
                    enemy
                )
            ) {
                this.addMove(
                    state,
                    result,
                    from,
                    square(2, rank),
                    null,
                    "castle-q"
                );
            }
        }
    }

    applyMoveToState(
        state,
        move
    ) {
        const next =
            cloneState(state);

        const piece =
            next.board[move.from];

        if (!piece) {
            return next;
        }

        delete next.board[move.from];

        if (move.special === "ep") {
            const target =
                parseSquare(move.to);

            const capturedSquare =
                square(
                    target.file,
                    target.rank +
                    (piece.color === "w" ? -1 : 1)
                );

            delete next.board[capturedSquare];
        }

        const captured =
            next.board[move.to];

        next.board[move.to] = {
            color: piece.color,
            type:
                move.promotion ||
                piece.type
        };

        if (piece.type === "k") {
            next.castling[piece.color].k = false;
            next.castling[piece.color].q = false;

            const rank =
                piece.color === "w"
                    ? 0
                    : 7;

            if (
                move.special === "castle-k"
            ) {
                delete next.board[
                    square(7, rank)
                ];

                next.board[
                    square(5, rank)
                ] = {
                    color: piece.color,
                    type: "r"
                };
            }

            if (
                move.special === "castle-q"
            ) {
                delete next.board[
                    square(0, rank)
                ];

                next.board[
                    square(3, rank)
                ] = {
                    color: piece.color,
                    type: "r"
                };
            }
        }

        if (piece.type === "r") {
            if (move.from === "a1")
                next.castling.w.q = false;

            if (move.from === "h1")
                next.castling.w.k = false;

            if (move.from === "a8")
                next.castling.b.q = false;

            if (move.from === "h8")
                next.castling.b.k = false;
        }

        if (captured?.type === "r") {
            if (move.to === "a1")
                next.castling.w.q = false;

            if (move.to === "h1")
                next.castling.w.k = false;

            if (move.to === "a8")
                next.castling.b.q = false;

            if (move.to === "h8")
                next.castling.b.k = false;
        }

        next.ep = null;

        if (piece.type === "p") {
            const from =
                parseSquare(move.from);

            const to =
                parseSquare(move.to);

            if (
                Math.abs(
                    to.rank -
                    from.rank
                ) === 2
            ) {
                next.ep =
                    square(
                        from.file,
                        (from.rank + to.rank) / 2
                    );
            }
        }

        next.halfmove =
            piece.type === "p" ||
            move.capture
                ? 0
                : next.halfmove + 1;

        if (piece.color === "b") {
            next.fullmove++;
        }

        next.turn =
            opposite(piece.color);

        return next;
    }

    inCheck(
        state,
        color
    ) {
        const king =
            Object.entries(
                state.board
            ).find(
                ([, piece]) =>
                    piece.color === color &&
                    piece.type === "k"
            );

        if (!king) {
            return true;
        }

        return this.isAttacked(
            state,
            king[0],
            opposite(color)
        );
    }

    isAttacked(
        state,
        target,
        attacker
    ) {
        const pos =
            parseSquare(target);

        if (!pos) {
            return false;
        }

        const knightMoves = [
            [1, 2],
            [2, 1],
            [-1, 2],
            [-2, 1],
            [1, -2],
            [2, -1],
            [-1, -2],
            [-2, -1]
        ];

        for (const [df, dr] of knightMoves) {
            const sq =
                safeSquare(
                    pos.file + df,
                    pos.rank + dr
                );

            const piece =
                sq
                    ? state.board[sq]
                    : null;

            if (
                piece &&
                piece.color === attacker &&
                piece.type === "n"
            ) {
                return true;
            }
        }

        for (let df = -1; df <= 1; df++) {
            for (let dr = -1; dr <= 1; dr++) {
                if (!df && !dr) {
                    continue;
                }

                const sq =
                    safeSquare(
                        pos.file + df,
                        pos.rank + dr
                    );

                const piece =
                    sq
                        ? state.board[sq]
                        : null;

                if (
                    piece &&
                    piece.color === attacker &&
                    piece.type === "k"
                ) {
                    return true;
                }
            }
        }

        const pawnDirection =
            attacker === "w"
                ? -1
                : 1;

        for (const df of [-1, 1]) {
            const sq =
                safeSquare(
                    pos.file + df,
                    pos.rank + pawnDirection
                );

            const piece =
                sq
                    ? state.board[sq]
                    : null;

            if (
                piece &&
                piece.color === attacker &&
                piece.type === "p"
            ) {
                return true;
            }
        }

        const rays = [
            {
                df: 1,
                dr: 1,
                pieces: ["b", "q"]
            },
            {
                df: -1,
                dr: -1,
                pieces: ["b", "q"]
            },
            {
                df: 1,
                dr: -1,
                pieces: ["b", "q"]
            },
            {
                df: -1,
                dr: 1,
                pieces: ["b", "q"]
            },
            {
                df: 1,
                dr: 0,
                pieces: ["r", "q"]
            },
            {
                df: -1,
                dr: 0,
                pieces: ["r", "q"]
            },
            {
                df: 0,
                dr: 1,
                pieces: ["r", "q"]
            },
            {
                df: 0,
                dr: -1,
                pieces: ["r", "q"]
            }
        ];

        for (const ray of rays) {
            let file =
                pos.file + ray.df;

            let rank =
                pos.rank + ray.dr;

            while (
                file >= 0 &&
                file < 8 &&
                rank >= 0 &&
                rank < 8
            ) {
                const sq =
                    square(file, rank);

                const piece =
                    state.board[sq];

                if (piece) {
                    if (
                        piece.color === attacker &&
                        ray.pieces.includes(piece.type)
                    ) {
                        return true;
                    }

                    break;
                }

                file += ray.df;
                rank += ray.dr;
            }
        }

        return false;
    }

    makeMove(input) {
        const from =
            String(input?.from || "")
                .toLowerCase();

        const to =
            String(input?.to || "")
                .toLowerCase();

        let promotion =
            String(
                input?.promotion || "q"
            ).toLowerCase();

        if (!["q", "r", "b", "n"].includes(promotion)) {
            promotion = "q";
        }

        const legal =
            this.legalMoves(
                this.state.turn
            );

        const candidates =
            legal.filter(
                move =>
                    move.from === from &&
                    move.to === to
            );

        let move = null;

        if (candidates.length === 1) {
            move = candidates[0];
        } else {
            move =
                candidates.find(
                    candidate =>
                        candidate.promotion === promotion
                );
        }

        if (!move) {
            return {
                ok: false,
                error: "Недопустимый ход."
            };
        }

        const piece =
            this.state.board[from];

        const captured =
            move.special === "ep"
                ? {
                    color: opposite(piece.color),
                    type: "p"
                }
                : this.state.board[to] || null;

        const before =
            cloneState(this.state);

        this.state =
            this.applyMoveToState(
                this.state,
                move
            );

        const san =
            this.createSan(
                before,
                move,
                legal
            );

        this.state.lastMove = {
            from,
            to,
            san,

            piece: {
                ...piece
            },

            captured:
                captured
                    ? { ...captured }
                    : null
        };

        this.history.push({
            ...move,
            san,

            piece: {
                ...piece
            },

            captured:
                captured
                    ? { ...captured }
                    : null,

            before
        });

        const key =
            this.positionKey(
                this.state
            );

        this.positions.set(
            key,
            (this.positions.get(key) || 0) + 1
        );

        return {
            ok: true,
            move: this.state.lastMove,
            status: this.getStatus()
        };
    }

    createSan(
        before,
        move,
        legalBefore
    ) {
        const piece =
            before.board[move.from];

        if (
            move.special === "castle-k"
        ) {
            return this.sanSuffix(
                before,
                move,
                "O-O"
            );
        }

        if (
            move.special === "castle-q"
        ) {
            return this.sanSuffix(
                before,
                move,
                "O-O-O"
            );
        }

        let san =
            piece.type === "p"
                ? ""
                : piece.type.toUpperCase();

        const conflicts =
            legalBefore.filter(
                other =>
                    other.from !== move.from &&
                    other.to === move.to &&
                    before.board[other.from]?.type === piece.type
            );

        if (conflicts.length) {
            const from =
                parseSquare(move.from);

            const sameFile =
                conflicts.some(
                    item =>
                        parseSquare(item.from).file === from.file
                );

            const sameRank =
                conflicts.some(
                    item =>
                        parseSquare(item.from).rank === from.rank
                );

            if (!sameFile) {
                san += move.from[0];
            } else if (!sameRank) {
                san += move.from[1];
            } else {
                san += move.from;
            }
        }

        if (move.capture) {
            if (piece.type === "p") {
                san += move.from[0];
            }

            san += "x";
        }

        san += move.to;

        if (move.promotion) {
            san +=
                "=" +
                move.promotion.toUpperCase();
        }

        return this.sanSuffix(
            before,
            move,
            san
        );
    }

    sanSuffix(
        before,
        move,
        san
    ) {
        const next =
            this.applyMoveToState(
                before,
                move
            );

        if (
            this.inCheck(
                next,
                next.turn
            )
        ) {
            const replies =
                this.legalMovesForState(
                    next,
                    next.turn
                );

            return (
                san +
                (
                    replies.length
                        ? "+"
                        : "#"
                )
            );
        }

        return san;
    }

    legalMovesForState(
        state,
        color
    ) {
        const pseudo =
            this.pseudoMoves(
                state,
                color
            );

        return pseudo.filter(
            move => {
                const next =
                    this.applyMoveToState(
                        state,
                        move
                    );

                return !this.inCheck(
                    next,
                    color
                );
            }
        );
    }

    getStatus() {
        const color =
            this.state.turn;

        const moves =
            this.legalMoves(color);

        const check =
            this.inCheck(
                this.state,
                color
            );

        if (!moves.length) {
            if (check) {
                return {
                    phase: "checkmate",
                    turn: color,
                    winner: opposite(color)
                };
            }

            return {
                phase: "draw",
                reason: "stalemate",
                turn: color
            };
        }

        if (
            this.state.halfmove >= 100
        ) {
            return {
                phase: "draw",
                reason: "50-move",
                turn: color
            };
        }

        const key =
            this.positionKey(
                this.state
            );

        if (
            (this.positions.get(key) || 0) >= 3
        ) {
            return {
                phase: "draw",
                reason: "threefold",
                turn: color
            };
        }

        if (this.insufficientMaterial()) {
            return {
                phase: "draw",
                reason: "insufficient-material",
                turn: color
            };
        }

        if (check) {
            return {
                phase: "check",
                turn: color
            };
        }

        return {
            phase: "playing",
            turn: color
        };
    }

    insufficientMaterial() {
        const pieces =
            Object.values(
                this.state.board
            ).filter(
                piece =>
                    piece.type !== "k"
            );

        if (!pieces.length) {
            return true;
        }

        if (
            pieces.length === 1 &&
            ["b", "n"].includes(
                pieces[0].type
            )
        ) {
            return true;
        }

        if (
            pieces.length === 2 &&
            pieces.every(
                piece =>
                    piece.type === "b"
            )
        ) {
            const bishops =
                Object.entries(
                    this.state.board
                ).filter(
                    ([, piece]) =>
                        piece.type === "b"
                );

            const a =
                parseSquare(
                    bishops[0][0]
                );

            const b =
                parseSquare(
                    bishops[1][0]
                );

            if (
                (a.file + a.rank) % 2 ===
                (b.file + b.rank) % 2
            ) {
                return true;
            }
        }

        return false;
    }

    material() {
        const captured = {
            w: [],
            b: []
        };

        for (const move of this.history) {
            if (!move.captured) {
                continue;
            }

            captured[
                move.piece.color
            ].push(
                move.captured.type
            );
        }

        const sort =
            list =>
                list.sort(
                    (a, b) =>
                        VALUES[b] -
                        VALUES[a]
                );

        sort(captured.w);
        sort(captured.b);

        return {
            captured,

            score: {
                w: captured.b.reduce(
                    (sum, piece) =>
                        sum + VALUES[piece],
                    0
                ),

                b: captured.w.reduce(
                    (sum, piece) =>
                        sum + VALUES[piece],
                    0
                )
            }
        };
    }

    getSnapshot() {
        return {
            ...cloneState(
                this.state
            ),

            moves:
                this.history.map(
                    (move, index) => ({
                        number: index + 1,
                        from: move.from,
                        to: move.to,
                        san: move.san,
                        color: move.piece.color,
                        piece: move.piece.type,
                        capture:
                            Boolean(
                                move.captured
                            )
                    })
                ),

            material:
                this.material(),

            status:
                this.getStatus(),

            fen:
                this.fen,

            pgn:
                this.pgn
        };
    }

    get pgn() {
        let result = "";

        for (
            let i = 0;
            i < this.history.length;
            i++
        ) {
            const move =
                this.history[i];

            if (
                move.piece.color === "w"
            ) {
                result +=
                    `${Math.floor(i / 2) + 1}. ${move.san} `;
            } else {
                result +=
                    `${move.san} `;
            }
        }

        const status =
            this.getStatus();

        if (
            status.phase === "checkmate"
        ) {
            result +=
                status.winner === "w"
                    ? "1-0"
                    : "0-1";
        } else if (
            status.phase === "draw"
        ) {
            result += "1/2-1/2";
        }

        return result.trim();
    }

    undo() {
        const last =
            this.history.pop();

        if (!last) {
            return false;
        }

        const current =
            this.positionKey(
                this.state
            );

        const count =
            this.positions.get(
                current
            );

        if (count <= 1) {
            this.positions.delete(
                current
            );
        } else {
            this.positions.set(
                current,
                count - 1
            );
        }

        this.state =
            last.before;

        return true;
    }

    static evaluateStatus(state) {
        const engine = new ChessEngine();
        engine.state = cloneState(state);
        return engine.getStatus();
    }

    static generateLegalMovesForState(
        state,
        color = state.turn
    ) {
        const engine = new ChessEngine();
        engine.state = cloneState(state);

        return engine.legalMovesForState(
            engine.state,
            color
        );
    }

    static playMove(
        state,
        move,
        options = {}
    ) {
        const engine = new ChessEngine();
        engine.state = cloneState(state);

        const next =
            engine.applyMoveToState(
                engine.state,
                move
            );

        if (options.computeStatus) {
            const probe = new ChessEngine();
            probe.state = next;
            next.status = probe.getStatus();
        }

        return next;
    }
}

export {
    FILES,
    VALUES
};
