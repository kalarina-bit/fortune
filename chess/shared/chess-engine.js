//chess-engine.js

const FILES = "abcdefgh";
const STARTING_BACK_RANK = ["R", "N", "B", "Q", "K", "B", "N", "R"];

function createPiece(color, type) {
  return { color, type };
}

function clonePiece(piece) {
  return piece ? { color: piece.color, type: piece.type } : null;
}

function cloneBoard(board) {
  return board.map((row) => row.map((piece) => clonePiece(piece)));
}

function colorLabel(color) {
  return color === "w" ? "White" : "Black";
}

export function opponentColor(color) {
  return color === "w" ? "b" : "w";
}

export function toSquare(x, y) {
  return `${FILES[x]}${8 - y}`;
}

export function fromSquare(square) {
  if (!square || square.length !== 2) {
    return null;
  }

  const file = square[0].toLowerCase();
  const rank = Number(square[1]);
  const x = FILES.indexOf(file);
  const y = 8 - rank;

  if (x < 0 || Number.isNaN(y) || y < 0 || y > 7) {
    return null;
  }

  return { x, y };
}

function inBounds(x, y) {
  return x >= 0 && x < 8 && y >= 0 && y < 8;
}

function createEmptyBoard() {
  return Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => null));
}

function createStartingBoard() {
  const board = createEmptyBoard();

  for (let index = 0; index < 8; index += 1) {
    board[0][index] = createPiece("b", STARTING_BACK_RANK[index]);
    board[1][index] = createPiece("b", "P");
    board[6][index] = createPiece("w", "P");
    board[7][index] = createPiece("w", STARTING_BACK_RANK[index]);
  }

  return board;
}

function createCastlingRights() {
  return {
    w: { k: true, q: true },
    b: { k: true, q: true },
  };
}

function createInitialState() {
  return {
    board: createStartingBoard(),
    turn: "w",
    castling: createCastlingRights(),
    enPassant: null,
    halfmoveClock: 0,
    fullmoveNumber: 1,
    history: [],
    positionCounts: {},
    status: null,
    lastMove: null,
  };
}

function cloneState(state) {
  return {
    board: cloneBoard(state.board),
    turn: state.turn,
    castling: {
      w: { ...state.castling.w },
      b: { ...state.castling.b },
    },
    enPassant: state.enPassant,
    halfmoveClock: state.halfmoveClock,
    fullmoveNumber: state.fullmoveNumber,
    history: state.history.map((entry) => ({ ...entry })),
    positionCounts: { ...state.positionCounts },
    status: state.status ? { ...state.status } : null,
    lastMove: state.lastMove ? { ...state.lastMove } : null,
  };
}

function boardToHash(board) {
  return board
    .map((row) =>
      row
        .map((piece) => {
          if (!piece) {
            return ".";
          }

          return piece.color === "w" ? piece.type : piece.type.toLowerCase();
        })
        .join(""),
    )
    .join("/");
}

function positionHash(state) {
  const castlingText = ["w", "b"]
    .map((color) => {
      const rights = [];
      if (state.castling[color].k) {
        rights.push("k");
      }
      if (state.castling[color].q) {
        rights.push("q");
      }
      return rights.length ? rights.join("") : "-";
    })
    .join("");

  return [
    boardToHash(state.board),
    state.turn,
    castlingText || "-",
    state.enPassant || "-",
  ].join("|");
}

function addPositionCount(state) {
  const hash = positionHash(state);
  state.positionCounts[hash] = (state.positionCounts[hash] || 0) + 1;
}

function pieceAt(board, x, y) {
  if (!inBounds(x, y)) {
    return null;
  }
  return board[y][x];
}

function setPiece(board, x, y, piece) {
  board[y][x] = piece;
}

function squareColor(x, y) {
  return (x + y) % 2 === 0 ? "dark" : "light";
}

function getKingPosition(board, color) {
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      const piece = board[y][x];
      if (piece && piece.color === color && piece.type === "K") {
        return { x, y };
      }
    }
  }

  return null;
}

function isSquareAttacked(state, x, y, byColor) {
  const board = state.board;
  const pawnOffset = byColor === "w" ? 1 : -1;

  for (const dx of [-1, 1]) {
    const piece = pieceAt(board, x + dx, y + pawnOffset);
    if (piece && piece.color === byColor && piece.type === "P") {
      return true;
    }
  }

  const knightOffsets = [
    [-2, -1],
    [-2, 1],
    [-1, -2],
    [-1, 2],
    [1, -2],
    [1, 2],
    [2, -1],
    [2, 1],
  ];

  for (const [dx, dy] of knightOffsets) {
    const piece = pieceAt(board, x + dx, y + dy);
    if (piece && piece.color === byColor && piece.type === "N") {
      return true;
    }
  }

  const slidingLines = [
    { directions: [[1, 0], [-1, 0], [0, 1], [0, -1]], pieces: ["R", "Q"] },
    { directions: [[1, 1], [1, -1], [-1, 1], [-1, -1]], pieces: ["B", "Q"] },
  ];

  for (const line of slidingLines) {
    for (const [dx, dy] of line.directions) {
      let nx = x + dx;
      let ny = y + dy;

      while (inBounds(nx, ny)) {
        const piece = pieceAt(board, nx, ny);
        if (piece) {
          if (piece.color === byColor && line.pieces.includes(piece.type)) {
            return true;
          }
          break;
        }
        nx += dx;
        ny += dy;
      }
    }
  }

  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) {
        continue;
      }
      const piece = pieceAt(board, x + dx, y + dy);
      if (piece && piece.color === byColor && piece.type === "K") {
        return true;
      }
    }
  }

  return false;
}

function isInCheck(state, color) {
  const king = getKingPosition(state.board, color);
  if (!king) {
    return false;
  }
  return isSquareAttacked(state, king.x, king.y, opponentColor(color));
}

function addMove(moves, state, x, y, nx, ny, extras = {}) {
  if (!inBounds(nx, ny)) {
    return;
  }

  const piece = state.board[y][x];
  const target = state.board[ny][nx];

  if (target && target.color === piece.color) {
    return;
  }

  moves.push({
    from: toSquare(x, y),
    to: toSquare(nx, ny),
    fromX: x,
    fromY: y,
    toX: nx,
    toY: ny,
    color: piece.color,
    piece: piece.type,
    capture: target ? target.type : extras.capture || null,
    captureColor: target ? target.color : extras.captureColor || null,
    promotion: extras.promotion || null,
    castle: extras.castle || null,
    enPassant: Boolean(extras.enPassant),
    doublePawnPush: Boolean(extras.doublePawnPush),
  });
}

function generatePawnMoves(state, x, y, piece, moves) {
  const direction = piece.color === "w" ? -1 : 1;
  const startRow = piece.color === "w" ? 6 : 1;
  const promotionRow = piece.color === "w" ? 0 : 7;
  const forwardY = y + direction;

  if (inBounds(x, forwardY) && !pieceAt(state.board, x, forwardY)) {
    if (forwardY === promotionRow) {
      for (const promotion of ["q", "r", "b", "n"]) {
        addMove(moves, state, x, y, x, forwardY, { promotion });
      }
    } else {
      addMove(moves, state, x, y, x, forwardY);
    }

    const doubleForwardY = y + direction * 2;
    if (y === startRow && !pieceAt(state.board, x, doubleForwardY)) {
      addMove(moves, state, x, y, x, doubleForwardY, { doublePawnPush: true });
    }
  }

  for (const dx of [-1, 1]) {
    const nx = x + dx;
    const ny = y + direction;
    if (!inBounds(nx, ny)) {
      continue;
    }

    const target = pieceAt(state.board, nx, ny);
    if (target && target.color !== piece.color) {
      if (ny === promotionRow) {
        for (const promotion of ["q", "r", "b", "n"]) {
          addMove(moves, state, x, y, nx, ny, { promotion });
        }
      } else {
        addMove(moves, state, x, y, nx, ny);
      }
      continue;
    }

    if (state.enPassant === toSquare(nx, ny)) {
      const capturedPawn = pieceAt(state.board, nx, y);
      if (capturedPawn && capturedPawn.color !== piece.color && capturedPawn.type === "P") {
        addMove(moves, state, x, y, nx, ny, {
          enPassant: true,
          capture: "P",
          captureColor: capturedPawn.color,
        });
      }
    }
  }
}

function generateSlidingMoves(state, x, y, moves, directions) {
  for (const [dx, dy] of directions) {
    let nx = x + dx;
    let ny = y + dy;

    while (inBounds(nx, ny)) {
      const target = pieceAt(state.board, nx, ny);
      if (!target) {
        addMove(moves, state, x, y, nx, ny);
      } else {
        if (target.color !== state.board[y][x].color) {
          addMove(moves, state, x, y, nx, ny);
        }
        break;
      }

      nx += dx;
      ny += dy;
    }
  }
}

function canCastle(state, color, side) {
  const homeRank = color === "w" ? 7 : 0;
  const rookFile = side === "k" ? 7 : 0;
  const king = pieceAt(state.board, 4, homeRank);
  const rook = pieceAt(state.board, rookFile, homeRank);

  if (!king || king.type !== "K" || king.color !== color) {
    return false;
  }
  if (!rook || rook.type !== "R" || rook.color !== color) {
    return false;
  }
  if (!state.castling[color][side] || isInCheck(state, color)) {
    return false;
  }

  const betweenSquares = side === "k" ? [5, 6] : [1, 2, 3];
  for (const file of betweenSquares) {
    if (pieceAt(state.board, file, homeRank)) {
      return false;
    }
  }

  const traverseSquares = side === "k" ? [5, 6] : [3, 2];
  for (const file of traverseSquares) {
    if (isSquareAttacked(state, file, homeRank, opponentColor(color))) {
      return false;
    }
  }

  return true;
}

function generateKingMoves(state, x, y, piece, moves) {
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) {
        continue;
      }
      addMove(moves, state, x, y, x + dx, y + dy);
    }
  }

  if (canCastle(state, piece.color, "k")) {
    addMove(moves, state, x, y, x + 2, y, { castle: "k" });
  }

  if (canCastle(state, piece.color, "q")) {
    addMove(moves, state, x, y, x - 2, y, { castle: "q" });
  }
}

function generatePseudoMoves(state, x, y) {
  const piece = pieceAt(state.board, x, y);
  if (!piece) {
    return [];
  }

  const moves = [];

  if (piece.type === "P") {
    generatePawnMoves(state, x, y, piece, moves);
  } else if (piece.type === "N") {
    const offsets = [
      [-2, -1],
      [-2, 1],
      [-1, -2],
      [-1, 2],
      [1, -2],
      [1, 2],
      [2, -1],
      [2, 1],
    ];
    for (const [dx, dy] of offsets) {
      addMove(moves, state, x, y, x + dx, y + dy);
    }
  } else if (piece.type === "B") {
    generateSlidingMoves(state, x, y, moves, [
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ]);
  } else if (piece.type === "R") {
    generateSlidingMoves(state, x, y, moves, [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]);
  } else if (piece.type === "Q") {
    generateSlidingMoves(state, x, y, moves, [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ]);
  } else if (piece.type === "K") {
    generateKingMoves(state, x, y, piece, moves);
  }

  return moves;
}

function updateCastlingRights(nextState, move) {
  const { color, piece, from, to, capture, captureColor } = move;

  if (piece === "K") {
    nextState.castling[color].k = false;
    nextState.castling[color].q = false;
  }

  if (piece === "R") {
    if (from === "a1") {
      nextState.castling.w.q = false;
    }
    if (from === "h1") {
      nextState.castling.w.k = false;
    }
    if (from === "a8") {
      nextState.castling.b.q = false;
    }
    if (from === "h8") {
      nextState.castling.b.k = false;
    }
  }

  if (capture === "R" && captureColor) {
    if (to === "a1") {
      nextState.castling.w.q = false;
    }
    if (to === "h1") {
      nextState.castling.w.k = false;
    }
    if (to === "a8") {
      nextState.castling.b.q = false;
    }
    if (to === "h8") {
      nextState.castling.b.k = false;
    }
  }
}

function buildMoveNotation(move, status) {
  if (move.castle === "k") {
    return status.reason === "checkmate" ? "O-O#" : status.check ? "O-O+" : "O-O";
  }

  if (move.castle === "q") {
    return status.reason === "checkmate" ? "O-O-O#" : status.check ? "O-O-O+" : "O-O-O";
  }

  const piecePrefix = move.piece === "P" ? "" : move.piece;
  const pawnCapturePrefix = move.piece === "P" && move.capture ? move.from[0] : "";
  const captureMarker = move.capture ? "x" : "";
  const promotionText = move.promotion ? `=${move.promotion.toUpperCase()}` : "";
  const suffix = status.reason === "checkmate" ? "#" : status.check ? "+" : "";

  return `${piecePrefix}${pawnCapturePrefix}${captureMarker}${move.to}${promotionText}${suffix}`;
}

function getMoveRecord(move, status, nextState) {
  return {
    from: move.from,
    to: move.to,
    color: move.color,
    piece: move.piece,
    capture: move.capture,
    promotion: move.promotion,
    castle: move.castle,
    enPassant: move.enPassant,
    notation: buildMoveNotation(move, status),
    turnNumber: nextState.fullmoveNumber - (move.color === "w" ? 0 : 1),
    fenKey: positionHash(nextState),
  };
}

function hasInsufficientMaterial(board) {
  const pieces = [];

  for (const row of board) {
    for (const piece of row) {
      if (piece) {
        pieces.push(piece);
      }
    }
  }

  const nonKings = pieces.filter((piece) => piece.type !== "K");
  if (nonKings.some((piece) => ["P", "R", "Q"].includes(piece.type))) {
    return false;
  }

  if (nonKings.length === 0 || nonKings.length === 1) {
    return true;
  }

  if (nonKings.length === 2) {
    const [first, second] = nonKings;
    if (first.color !== second.color) {
      return true;
    }
    if (first.type === "N" && second.type === "N") {
      return true;
    }
  }

  const bishops = [];
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      const piece = board[y][x];
      if (piece && piece.type === "B") {
        bishops.push({ ...piece, x, y });
      }
    }
  }

  if (nonKings.length === 2 && bishops.length === 2 && bishops[0].color !== bishops[1].color) {
    return squareColor(bishops[0].x, bishops[0].y) === squareColor(bishops[1].x, bishops[1].y);
  }

  return false;
}

function evaluateStatus(state) {
  const legalMoves = ChessEngine.generateLegalMovesForState(state, state.turn);
  const check = isInCheck(state, state.turn);
  const repetitionCount = state.positionCounts[positionHash(state)] || 0;

  const status = {
    phase: "playing",
    winner: null,
    reason: null,
    check,
    legalMoves: legalMoves.length,
    message: `${colorLabel(state.turn)} to move.`,
  };

  if (legalMoves.length === 0) {
    if (check) {
      status.phase = "checkmate";
      status.reason = "checkmate";
      status.winner = opponentColor(state.turn);
      status.message = `${colorLabel(status.winner)} wins by checkmate.`;
    } else {
      status.phase = "draw";
      status.reason = "stalemate";
      status.message = "Draw by stalemate.";
    }
    return status;
  }

  if (hasInsufficientMaterial(state.board)) {
    status.phase = "draw";
    status.reason = "insufficient-material";
    status.message = "Draw by insufficient material.";
    return status;
  }

  if (state.halfmoveClock >= 100) {
    status.phase = "draw";
    status.reason = "fifty-move";
    status.message = "Draw by fifty-move rule.";
    return status;
  }

  if (repetitionCount >= 3) {
    status.phase = "draw";
    status.reason = "threefold";
    status.message = "Draw by threefold repetition.";
    return status;
  }

  if (check) {
    status.message = `${colorLabel(state.turn)} to move. Check.`;
  }

  return status;
}

function applyMoveToState(state, move, options = {}) {
  const {
    recordHistory = false,
    computeStatus = true,
    updatePositionCounts = computeStatus || recordHistory,
  } = options;
  const nextState = cloneState(state);
  const movingPiece = pieceAt(nextState.board, move.fromX, move.fromY);

  if (!movingPiece) {
    throw new Error("No piece found on source square.");
  }

  setPiece(nextState.board, move.fromX, move.fromY, null);

  if (move.enPassant) {
    setPiece(nextState.board, move.toX, move.fromY, null);
  }

  const placedPiece = createPiece(
    movingPiece.color,
    move.promotion ? move.promotion.toUpperCase() : movingPiece.type,
  );
  setPiece(nextState.board, move.toX, move.toY, placedPiece);

  if (move.castle === "k") {
    const rook = pieceAt(nextState.board, 7, move.fromY);
    setPiece(nextState.board, 7, move.fromY, null);
    setPiece(nextState.board, 5, move.fromY, rook);
  } else if (move.castle === "q") {
    const rook = pieceAt(nextState.board, 0, move.fromY);
    setPiece(nextState.board, 0, move.fromY, null);
    setPiece(nextState.board, 3, move.fromY, rook);
  }

  updateCastlingRights(nextState, move);

  nextState.enPassant = move.doublePawnPush ? toSquare(move.fromX, (move.fromY + move.toY) / 2) : null;
  nextState.halfmoveClock = move.piece === "P" || move.capture ? 0 : nextState.halfmoveClock + 1;
  nextState.turn = opponentColor(state.turn);

  if (move.color === "b") {
    nextState.fullmoveNumber += 1;
  }

  nextState.lastMove = {
    from: move.from,
    to: move.to,
    color: move.color,
  };

  if (updatePositionCounts) {
    addPositionCount(nextState);
  }
  nextState.status = computeStatus ? evaluateStatus(nextState) : null;

  if (recordHistory) {
    nextState.history.push(getMoveRecord(move, nextState.status, nextState));
  }

  return nextState;
}

export class ChessEngine {
  constructor(snapshot = null) {
    this.state = snapshot ? cloneState(snapshot) : createInitialState();
    if (Object.keys(this.state.positionCounts).length === 0) {
      addPositionCount(this.state);
    }
    this.state.status = evaluateStatus(this.state);
  }

  reset() {
    this.state = createInitialState();
    addPositionCount(this.state);
    this.state.status = evaluateStatus(this.state);
    return this.getSnapshot();
  }

  getSnapshot() {
    return cloneState(this.state);
  }

  getPiece(square) {
    const coords = fromSquare(square);
    if (!coords) {
      return null;
    }
    return clonePiece(pieceAt(this.state.board, coords.x, coords.y));
  }

  getMovesFrom(square) {
    return this.getLegalMoves(this.state.turn).filter((move) => move.from === square);
  }

  getLegalMoves(color = this.state.turn) {
    return ChessEngine.generateLegalMovesForState(this.state, color);
  }

  makeMove(input) {
    const legalMove = ChessEngine.findLegalMove(this.state, input);
    if (!legalMove) {
      return {
        ok: false,
        error: "Illegal move.",
        state: this.getSnapshot(),
      };
    }

    this.state = applyMoveToState(this.state, legalMove, { recordHistory: true });
    return {
      ok: true,
      move: legalMove,
      state: this.getSnapshot(),
      status: { ...this.state.status },
    };
  }

  static positionHash(state) {
    return positionHash(state);
  }

  static isInCheck(state, color) {
    return isInCheck(state, color);
  }

  static evaluateStatus(state) {
    return evaluateStatus(state);
  }

  static playMove(state, move, options = {}) {
    return applyMoveToState(state, move, options);
  }

  static findLegalMove(state, input) {
    const from = typeof input.from === "string" ? input.from.toLowerCase() : "";
    const to = typeof input.to === "string" ? input.to.toLowerCase() : "";
    const promotion = input.promotion ? input.promotion.toLowerCase() : null;

    return ChessEngine.generateLegalMovesForState(state, state.turn).find(
      (move) =>
        move.from === from &&
        move.to === to &&
        (move.promotion || null) === (promotion || null),
    );
  }

  static generateLegalMovesForState(state, color = state.turn) {
    const legalMoves = [];

    for (let y = 0; y < 8; y += 1) {
      for (let x = 0; x < 8; x += 1) {
        const piece = pieceAt(state.board, x, y);
        if (!piece || piece.color !== color) {
          continue;
        }

        const pseudoMoves = generatePseudoMoves(state, x, y);
        for (const move of pseudoMoves) {
          const nextState = applyMoveToState(state, move, {
            recordHistory: false,
            computeStatus: false,
            updatePositionCounts: false,
          });
          if (!isInCheck(nextState, color)) {
            legalMoves.push(move);
          }
        }
      }
    }

    return legalMoves;
  }
}

export const ChessRules = {
  FILES,
  colorLabel,
  fromSquare,
  toSquare,
};
