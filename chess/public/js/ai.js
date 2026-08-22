const PIECE_VALUE = {
    P: 100,
    N: 320,
    B: 330,
    R: 500,
    Q: 900,
    K: 20_000,
};

const LEVELS = {
    easy: {
        depth: 1,
        randomness: 0.35,
    },

    intermediate: {
        depth: 2,
        randomness: 0.08,
    },

    hard: {
        depth: 3,
        randomness: 0.01,
    },

    expert: {
        depth: 4,
        randomness: 0,
    },
};

const CENTER = new Set([
    "d4",
    "e4",
    "d5",
    "e5",
]);

const EXTENDED_CENTER = new Set([
    "c3",
    "d3",
    "e3",
    "f3",
    "c4",
    "d4",
    "e4",
    "f4",
    "c5",
    "d5",
    "e5",
    "f5",
    "c6",
    "d6",
    "e6",
    "f6",
]);

function cloneEngine(engine) {
    return new engine.constructor(
        engine.getSnapshot(),
    );
}

function opposite(color) {
    return color === "w"
        ? "b"
        : "w";
}

function squareName(x, y) {
    return String.fromCharCode(
        97 + x,
    ) + (8 - y);
}

function getAllMoves(engine, color) {
    const moves = [];

    for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
            const square =
                squareName(x, y);

            const piece =
                engine.state.board[y][x];

            if (
                !piece ||
                piece.color !== color
            ) {
                continue;
            }

            const pieceMoves =
                engine.getMovesFrom(
                    square,
                );

            for (const move of pieceMoves) {
                moves.push(move);
            }
        }
    }

    return moves;
}

function evaluateMaterial(engine, color) {
    let score = 0;

    for (const row of engine.state.board) {
        for (const piece of row) {
            if (!piece) {
                continue;
            }

            const value =
                PIECE_VALUE[piece.type] ||
                0;

            score +=
                piece.color === color
                    ? value
                    : -value;
        }
    }

    return score;
}

function evaluatePosition(engine, color) {
    let score = 0;

    for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
            const piece =
                engine.state.board[y][x];

            if (!piece) {
                continue;
            }

            const square =
                squareName(x, y);

            const sign =
                piece.color === color
                    ? 1
                    : -1;

            if (
                CENTER.has(square)
            ) {
                score +=
                    sign *
                    (piece.type === "P"
                        ? 30
                        : 18);
            }

            if (
                EXTENDED_CENTER.has(
                    square,
                )
            ) {
                score += sign * 6;
            }

            if (
                piece.type === "N"
            ) {
                const edgePenalty =
                    Math.abs(3.5 - x) +
                    Math.abs(3.5 - y);

                score +=
                    sign *
                    Math.max(
                        0,
                        18 - edgePenalty * 4,
                    );
            }

            if (
                piece.type === "P"
            ) {
                const advancement =
                    piece.color === "w"
                        ? 6 - y
                        : y - 1;

                score +=
                    sign *
                    advancement *
                    8;
            }

            if (
                piece.type === "B"
            ) {
                score += sign * 4;
            }

            if (
                piece.type === "R" &&
                (y === 0 ||
                    y === 7)
            ) {
                score += sign * 5;
            }
        }
    }

    return score;
}

function evaluateMobility(
    engine,
    color,
) {
    const own =
        getAllMoves(
            engine,
            color,
        ).length;

    const enemy =
        getAllMoves(
            engine,
            opposite(color),
        ).length;

    return (own - enemy) * 3;
}

function evaluateKings(engine, color) {
    let score = 0;

    const status =
        engine.state.status;

    if (!status) {
        return 0;
    }

    if (status.check) {
        const turn =
            engine.state.turn;

        if (turn === color) {
            score -= 35;
        } else {
            score += 35;
        }
    }

    return score;
}

function evaluate(engine, color) {
    const status =
        engine.state.status;

    if (
        status?.phase ===
        "checkmate"
    ) {
        if (
            status.winner === color
        ) {
            return 1_000_000;
        }

        return -1_000_000;
    }

    if (
        status?.phase === "draw"
    ) {
        return 0;
    }

    return (
        evaluateMaterial(
            engine,
            color,
        ) +
        evaluatePosition(
            engine,
            color,
        ) +
        evaluateMobility(
            engine,
            color,
        ) +
        evaluateKings(
            engine,
            color,
        )
    );
}

function orderMoves(
    engine,
    moves,
) {
    return [...moves].sort(
        (a, b) => {
            const captureA =
                a.capture ? 1 : 0;

            const captureB =
                b.capture ? 1 : 0;

            const promotionA =
                a.promotion ? 1 : 0;

            const promotionB =
                b.promotion ? 1 : 0;

            return (
                captureB -
                    captureA ||
                promotionB -
                    promotionA
            );
        },
    );
}

function minimax(
    engine,
    depth,
    alpha,
    beta,
    maximizingColor,
) {
    const status =
        engine.state.status;

    if (
        depth <= 0 ||
        status?.phase ===
            "checkmate" ||
        status?.phase === "draw"
    ) {
        return {
            score: evaluate(
                engine,
                maximizingColor,
            ),
            move: null,
        };
    }

    const turn =
        engine.state.turn;

    const moves =
        orderMoves(
            engine,
            getAllMoves(
                engine,
                turn,
            ),
        );

    if (!moves.length) {
        return {
            score: evaluate(
                engine,
                maximizingColor,
            ),
            move: null,
        };
    }

    const maximizing =
        turn === maximizingColor;

    let bestScore = maximizing
        ? -Infinity
        : Infinity;

    let bestMove = null;

    for (const move of moves) {
        const child =
            cloneEngine(engine);

        const result =
            child.makeMove({
                from: move.from,
                to: move.to,
                promotion:
                    move.promotion ||
                    null,
            });

        if (!result.ok) {
            continue;
        }

        const resultNode =
            minimax(
                child,
                depth - 1,
                alpha,
                beta,
                maximizingColor,
            );

        const score =
            resultNode.score;

        if (maximizing) {
            if (
                score >
                bestScore
            ) {
                bestScore = score;
                bestMove = move;
            }

            alpha = Math.max(
                alpha,
                bestScore,
            );
        } else {
            if (
                score <
                bestScore
            ) {
                bestScore = score;
                bestMove = move;
            }

            beta = Math.min(
                beta,
                bestScore,
            );
        }

        if (beta <= alpha) {
            break;
        }
    }

    return {
        score: bestScore,
        move: bestMove,
    };
}

export const AI_LEVELS = LEVELS;

export function chooseComputerMove(
    engine,
    level = "intermediate",
) {
    const config =
        LEVELS[level] ||
        LEVELS.intermediate;

    const color =
        engine.state.turn;

    const moves =
        getAllMoves(
            engine,
            color,
        );

    if (!moves.length) {
        return null;
    }

    const ranked = [];

    for (const move of moves) {
        const child =
            cloneEngine(engine);

        const result =
            child.makeMove({
                from: move.from,
                to: move.to,
                promotion:
                    move.promotion ||
                    null,
            });

        if (!result.ok) {
            continue;
        }

        const score =
            minimax(
                child,
                Math.max(
                    0,
                    config.depth - 1,
                ),
                -Infinity,
                Infinity,
                color,
            ).score;

        ranked.push({
            move,
            score,
        });
    }

    ranked.sort(
        (a, b) =>
            b.score - a.score,
    );

    if (!ranked.length) {
        return moves[0];
    }

    if (
        Math.random() <
        config.randomness
    ) {
        const count =
            Math.min(
                3,
                ranked.length,
            );

        return ranked[
            Math.floor(
                Math.random() *
                    count,
            )
        ].move;
    }

    return ranked[0].move;
}