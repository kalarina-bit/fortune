const FILES = "abcdefgh";
const PIECES = ["p", "n", "b", "r", "q", "k"];
const VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

function square(file, rank) {
  return `${FILES[file]}${rank + 1}`;
}

function parseSquare(s) {
  if (!/^[a-h][1-8]$/.test(s || "")) return null;
  return { file: FILES.indexOf(s[0]), rank: Number(s[1]) - 1 };
}

function other(color) {
  return color === "w" ? "b" : "w";
}

function cloneBoard(board) {
  return Object.fromEntries(Object.entries(board).map(([s, p]) => [s, { ...p }]));
}

function cloneState(state) {
  return {
    board: cloneBoard(state.board),
    turn: state.turn,
    castling: {
      w: { ...state.castling.w },
      b: { ...state.castling.b }
    },
    ep: state.ep,
    halfmove: state.halfmove,
    fullmove: state.fullmove,
    lastMove: state.lastMove ? { ...state.lastMove } : null
  };
}

function initialBoard() {
  const board = {};
  const back = "rnbqkbnr";
  for (let f = 0; f < 8; f++) {
    board[square(f, 0)] = { color: "w", type: back[f] };
    board[square(f, 1)] = { color: "w", type: "p" };
    board[square(f, 6)] = { color: "b", type: "p" };
    board[square(f, 7)] = { color: "b", type: back[f] };
  }
  return board;
}

export class ChessEngine {
  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      board: initialBoard(),
      turn: "w",
      castling: {
        w: { k: true, q: true },
        b: { k: true, q: true }
      },
      ep: null,
      halfmove: 0,
      fullmove: 1,
      lastMove: null
    };
    this.history = [];
    this.positions = new Map([[this.positionKey(this.state), 1]]);
  }

  positionKey(state) {
    const board = Object.keys(state.board).sort().map(s => {
      const p = state.board[s];
      return `${s}${p.color}${p.type}`;
    }).join(",");
    return `${board}|${state.turn}|${state.castling.w.k ? "K" : ""}${state.castling.w.q ? "Q" : ""}${state.castling.b.k ? "k" : ""}${state.castling.b.q ? "q" : ""}|${state.ep || "-"}`;
  }

  getPiece(s) {
    return this.state.board[s] || null;
  }

  movesFrom(from) {
    const p = this.state.board[from];
    if (!p || p.color !== this.state.turn) return [];
    return this.legalMoves(this.state.turn).filter(m => m.from === from);
  }

  legalMoves(color = this.state.turn) {
    const pseudo = this.pseudoMoves(this.state, color);
    const legal = [];

    for (const move of pseudo) {
      const next = this.applyToClone(this.state, move);
      if (!this.inCheck(next, color)) legal.push(move);
    }
    return legal;
  }

  pseudoMoves(state, color) {
    const result = [];

    for (const [from, piece] of Object.entries(state.board)) {
      if (piece.color !== color) continue;
      const pos = parseSquare(from);
      if (!pos) continue;

      if (piece.type === "p") this.pawnMoves(state, from, piece, pos, result);
      else if (piece.type === "n") this.knightMoves(state, from, piece, pos, result);
      else if (piece.type === "b") this.slideMoves(state, from, piece, pos, result, [[1,1],[1,-1],[-1,1],[-1,-1]]);
      else if (piece.type === "r") this.slideMoves(state, from, piece, pos, result, [[1,0],[-1,0],[0,1],[0,-1]]);
      else if (piece.type === "q") this.slideMoves(state, from, piece, pos, result, [[1,1],[1,-1],[-1,1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]]);
      else if (piece.type === "k") this.kingMoves(state, from, piece, pos, result);
    }

    return result;
  }

  pushMove(state, result, from, to, promotion = null, special = null) {
    const target = state.board[to];
    if (target?.color === state.board[from]?.color) return;
    if (target?.type === "k") return;
    result.push({
      from, to,
      promotion,
      special,
      capture: Boolean(target) || special === "ep"
    });
  }

  pawnMoves(state, from, piece, pos, result) {
    const dir = piece.color === "w" ? 1 : -1;
    const startRank = piece.color === "w" ? 1 : 6;
    const promotionRank = piece.color === "w" ? 7 : 0;

    const oneRank = pos.rank + dir;
    if (oneRank >= 0 && oneRank <= 7) {
      const one = square(pos.file, oneRank);
      if (!state.board[one]) {
        if (oneRank === promotionRank) {
          for (const promotion of ["q","r","b","n"]) this.pushMove(state, result, from, one, promotion);
        } else {
          this.pushMove(state, result, from, one);
          if (pos.rank === startRank) {
            const two = square(pos.file, pos.rank + dir * 2);
            if (!state.board[two]) this.pushMove(state, result, from, two, null, "double");
          }
        }
      }
    }

    for (const df of [-1, 1]) {
      const f = pos.file + df;
      const r = pos.rank + dir;
      if (f < 0 || f > 7 || r < 0 || r > 7) continue;
      const to = square(f, r);
      const target = state.board[to];

      if (target && target.color !== piece.color && target.type !== "k") {
        if (r === promotionRank) {
          for (const promotion of ["q","r","b","n"]) this.pushMove(state, result, from, to, promotion);
        } else {
          this.pushMove(state, result, from, to);
        }
      } else if (state.ep === to) {
        this.pushMove(state, result, from, to, null, "ep");
      }
    }
  }

  knightMoves(state, from, piece, pos, result) {
    const jumps = [[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]];
    for (const [df, dr] of jumps) {
      const f = pos.file + df, r = pos.rank + dr;
      if (f >= 0 && f <= 7 && r >= 0 && r <= 7) this.pushMove(state, result, from, square(f,r));
    }
  }

  slideMoves(state, from, piece, pos, result, dirs) {
    for (const [df, dr] of dirs) {
      let f = pos.file + df, r = pos.rank + dr;
      while (f >= 0 && f <= 7 && r >= 0 && r <= 7) {
        const to = square(f, r);
        const target = state.board[to];
        if (!target) this.pushMove(state, result, from, to);
        else {
          if (target.color !== piece.color && target.type !== "k") this.pushMove(state, result, from, to);
          break;
        }
        f += df; r += dr;
      }
    }
  }

  kingMoves(state, from, piece, pos, result) {
    for (let df = -1; df <= 1; df++) {
      for (let dr = -1; dr <= 1; dr++) {
        if (!df && !dr) continue;
        const f = pos.file + df, r = pos.rank + dr;
        if (f >= 0 && f <= 7 && r >= 0 && r <= 7) {
          this.pushMove(state, result, from, square(f,r));
        }
      }
    }

    const rank = piece.color === "w" ? 0 : 7;
    const enemy = other(piece.color);

    if (pos.file === 4 && pos.rank === rank && !this.inCheck(state, piece.color)) {
      if (state.castling[piece.color].k &&
          !state.board[square(5,rank)] &&
          !state.board[square(6,rank)] &&
          state.board[square(7,rank)]?.type === "r" &&
          state.board[square(7,rank)]?.color === piece.color) {
        const through = square(5,rank), to = square(6,rank);
        if (!this.isAttacked(state, through, enemy) && !this.isAttacked(state, to, enemy)) {
          this.pushMove(state, result, from, to, null, "castle-k");
        }
      }

      if (state.castling[piece.color].q &&
          !state.board[square(1,rank)] &&
          !state.board[square(2,rank)] &&
          !state.board[square(3,rank)] &&
          state.board[square(0,rank)]?.type === "r" &&
          state.board[square(0,rank)]?.color === piece.color) {
        const through = square(3,rank), to = square(2,rank);
        if (!this.isAttacked(state, through, enemy) && !this.isAttacked(state, to, enemy)) {
          this.pushMove(state, result, from, to, null, "castle-q");
        }
      }
    }
  }

  applyToClone(state, move) {
    const next = cloneState(state);
    const piece = next.board[move.from];
    if (!piece) return next;

    delete next.board[move.from];

    if (move.special === "ep") {
      const to = parseSquare(move.to);
      const captured = square(to.file, to.rank + (piece.color === "w" ? -1 : 1));
      delete next.board[captured];
    }

    const captured = next.board[move.to];
    delete next.board[move.to];

    const moved = {
      color: piece.color,
      type: move.promotion || piece.type
    };
    next.board[move.to] = moved;

    if (piece.type === "k") {
      next.castling[piece.color].k = false;
      next.castling[piece.color].q = false;
      if (move.special === "castle-k") {
        const rank = piece.color === "w" ? 0 : 7;
        delete next.board[square(7,rank)];
        next.board[square(5,rank)] = { color: piece.color, type: "r" };
      }
      if (move.special === "castle-q") {
        const rank = piece.color === "w" ? 0 : 7;
        delete next.board[square(0,rank)];
        next.board[square(3,rank)] = { color: piece.color, type: "r" };
      }
    }

    if (piece.type === "r") {
      if (move.from === "a1") next.castling.w.q = false;
      if (move.from === "h1") next.castling.w.k = false;
      if (move.from === "a8") next.castling.b.q = false;
      if (move.from === "h8") next.castling.b.k = false;
    }

    if (captured?.type === "r") {
      if (move.to === "a1") next.castling.w.q = false;
      if (move.to === "h1") next.castling.w.k = false;
      if (move.to === "a8") next.castling.b.q = false;
      if (move.to === "h8") next.castling.b.k = false;
    }

    next.ep = null;
    if (piece.type === "p") {
      const a = parseSquare(move.from), b = parseSquare(move.to);
      if (Math.abs(b.rank - a.rank) === 2) {
        next.ep = square(a.file, (a.rank + b.rank) / 2);
      }
    }

    next.halfmove = piece.type === "p" || move.capture ? 0 : next.halfmove + 1;
    if (piece.color === "b") next.fullmove += 1;
    next.turn = other(piece.color);
    return next;
  }

  findKing(state, color) {
    for (const [s, p] of Object.entries(state.board)) {
      if (p.color === color && p.type === "k") return s;
    }
    return null;
  }

  inCheck(state, color) {
    const king = this.findKing(state, color);
    return !king || this.isAttacked(state, king, other(color));
  }

  isAttacked(state, target, byColor) {
    const t = parseSquare(target);
    if (!t) return false;

    for (const [from, piece] of Object.entries(state.board)) {
      if (piece.color !== byColor) continue;
      const p = parseSquare(from);
      const df = t.file - p.file;
      const dr = t.rank - p.rank;

      if (piece.type === "p") {
        const dir = byColor === "w" ? 1 : -1;
        if (dr === dir && Math.abs(df) === 1) return true;
      } else if (piece.type === "n") {
        if ((Math.abs(df) === 1 && Math.abs(dr) === 2) || (Math.abs(df) === 2 && Math.abs(dr) === 1)) return true;
      } else if (piece.type === "k") {
        if (Math.max(Math.abs(df), Math.abs(dr)) === 1) return true;
      } else {
        const diagonal = Math.abs(df) === Math.abs(dr);
        const straight = df === 0 || dr === 0;
        const allowed = piece.type === "b" ? diagonal : piece.type === "r" ? straight : diagonal || straight;
        if (!allowed) continue;

        const sf = Math.sign(df), sr = Math.sign(dr);
        let f = p.file + sf, r = p.rank + sr;
        let clear = true;
        while (f !== t.file || r !== t.rank) {
          if (state.board[square(f,r)]) { clear = false; break; }
          f += sf; r += sr;
        }
        if (clear) return true;
      }
    }
    return false;
  }

  sanForMove(move, legalBefore = null) {
    const piece = this.state.board[move.from];
    if (!piece) return "";
    if (move.special === "castle-k") return this.suffixAfter(move, "O-O");
    if (move.special === "castle-q") return this.suffixAfter(move, "O-O-O");

    const legal = legalBefore || this.legalMoves(this.state);
    let san = piece.type === "p" ? "" : piece.type.toUpperCase();

    const same = legal.filter(m =>
      m.to === move.to &&
      m.from !== move.from &&
      this.state.board[m.from]?.type === piece.type
    );

    if (same.length) {
      const from = parseSquare(move.from);
      const fileConflict = same.some(m => parseSquare(m.from).file === from.file);
      san += fileConflict ? move.from : move.from[0];
    }

    if (move.capture) {
      if (piece.type === "p") san += move.from[0];
      san += "x";
    }

    san += move.to;
    if (move.promotion) san += `=${move.promotion.toUpperCase()}`;

    return this.suffixAfter(move, san);
  }

  suffixAfter(move, san) {
    const next = this.applyToClone(this.state, move);
    if (this.inCheck(next, next.turn)) {
      const replies = this.legalMovesFromState(next, next.turn);
      return san + (replies.length ? "+" : "#");
    }
    return san;
  }

  legalMovesFromState(state, color) {
    return this.pseudoMoves(state, color).filter(m => !this.inCheck(this.applyToClone(state, m), color));
  }

  makeMove(input) {
    const from = String(input?.from || "").toLowerCase();
    const to = String(input?.to || "").toLowerCase();
    const promotion = String(input?.promotion || "q").toLowerCase();

    const legal = this.legalMoves(this.state);
    const move = legal.find(m =>
      m.from === from &&
      m.to === to &&
      (m.promotion ? m.promotion === promotion : !m.promotion)
    );

    if (!move) return { ok: false, error: "Недопустимый ход." };

    const san = this.sanForMove(move, legal);
    const piece = this.state.board[from];
    const capturedPiece =
      move.special === "ep"
        ? { type: "p", color: other(piece.color) }
        : this.state.board[to] || null;

    this.history.push({
      ...move,
      san,
      piece: { ...piece },
      captured: capturedPiece ? { ...capturedPiece } : null,
      before: cloneState(this.state)
    });

    this.state = this.applyToClone(this.state, move);
    this.state.lastMove = {
      from,
      to,
      san,
      piece: { ...piece },
      captured: capturedPiece ? { ...capturedPiece } : null
    };

    const key = this.positionKey(this.state);
    this.positions.set(key, (this.positions.get(key) || 0) + 1);

    return {
      ok: true,
      move: this.state.lastMove,
      status: this.getStatus()
    };
  }

  undo() {
    const last = this.history.pop();
    if (!last) return false;
    this.state = last.before;
    this.positions = new Map([[this.positionKey(this.state), 1]]);
    for (const h of this.history) {
      const key = this.positionKey(h.before);
      this.positions.set(key, (this.positions.get(key) || 0) + 1);
    }
    return true;
  }

  getStatus() {
    const color = this.state.turn;
    const moves = this.legalMoves(color);
    const check = this.inCheck(this.state, color);

    if (!moves.length && check) return { phase: "checkmate", turn: color, winner: other(color) };
    if (!moves.length) return { phase: "draw", reason: "stalemate", turn: color };
    if (this.state.halfmove >= 100) return { phase: "draw", reason: "50-move", turn: color };

    const key = this.positionKey(this.state);
    if ((this.positions.get(key) || 0) >= 3) return { phase: "draw", reason: "threefold", turn: color };

    if (this.insufficientMaterial()) return { phase: "draw", reason: "insufficient-material", turn: color };
    if (check) return { phase: "check", turn: color };
    return { phase: "playing", turn: color };
  }

  insufficientMaterial() {
    const pieces = Object.values(this.state.board);
    const nonKings = pieces.filter(p => p.type !== "k");
    if (!nonKings.length) return true;
    if (nonKings.length === 1 && (nonKings[0].type === "b" || nonKings[0].type === "n")) return true;
    if (nonKings.length === 2 && nonKings.every(p => p.type === "b")) {
      const bishops = Object.entries(this.state.board)
        .filter(([, p]) => p.type === "b")
        .map(([s, p]) => ({ s, color: p.color }));
      if (bishops.length === 2) {
        const colors = bishops.map(({ s }) => {
          const p = parseSquare(s);
          return (p.file + p.rank) % 2;
        });
        if (colors[0] === colors[1]) return true;
      }
    }
    return false;
  }

  material() {
    const captured = { w: [], b: [] };
    for (const h of this.history) {
      if (h.captured) captured[h.piece.color].push(h.captured.type);
    }

    const sort = a => a.sort((x,y) => VALUES[y] - VALUES[x]);
    sort(captured.w); sort(captured.b);

    const score = {
      w: captured.b.reduce((n,p) => n + VALUES[p], 0),
      b: captured.w.reduce((n,p) => n + VALUES[p], 0)
    };

    return { captured, score };
  }

  getSnapshot() {
    return {
      board: cloneBoard(this.state.board),
      turn: this.state.turn,
      castling: {
        w: { ...this.state.castling.w },
        b: { ...this.state.castling.b }
      },
      ep: this.state.ep,
      halfmove: this.state.halfmove,
      fullmove: this.state.fullmove,
      lastMove: this.state.lastMove ? { ...this.state.lastMove } : null,
      moves: this.history.map(h => ({
        number: this.history.indexOf(h) + 1,
        from: h.from,
        to: h.to,
        san: h.san,
        color: h.piece.color,
        piece: h.piece.type,
        capture: Boolean(h.captured)
      })),
      material: this.material(),
      status: this.getStatus()
    };
  }
}

export { FILES, VALUES };

