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

function squareSafe(file, rank) {
  if (file < 0 || file > 7 || rank < 0 || rank > 7) return null;
  return square(file, rank);
}

function other(color) {
  return color === "w" ? "b" : "w";
}

// ОПТИМИЗАЦИЯ: Поверхностное копирование. Фигуры иммутабельны при ходах, 
// поэтому достаточно скопировать ссылки на объекты, что работает мгновенно.
function cloneState(state) {
  return {
    board: { ...state.board },
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

export class ChessEngine {
  constructor(fen = null) {
    if (fen) {
      this.loadFen(fen);
    } else {
      this.reset();
    }
  }

  reset() {
    this.loadFen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
  }

  loadFen(fen) {
    const [placement, turn, castling, enPassant, halfmove, fullmove] = fen.split(" ");
    const board = {};
    let rank = 7, file = 0;

    for (const char of placement) {
      if (char === "/") {
        rank--; file = 0;
      } else if (/\d/.test(char)) {
        file += parseInt(char, 10);
      } else {
        const color = char === char.toUpperCase() ? "w" : "b";
        board[square(file, rank)] = { color, type: char.toLowerCase() };
        file++;
      }
    }

    this.state = {
      board,
      turn: turn === "w" ? "w" : "b",
      castling: {
        w: { k: castling.includes("K"), q: castling.includes("Q") },
        b: { k: castling.includes("k"), q: castling.includes("q") }
      },
      ep: enPassant === "-" ? null : enPassant,
      halfmove: parseInt(halfmove || 0, 10),
      fullmove: parseInt(fullmove || 1, 10),
      lastMove: null
    };
    
    this.history = [];
    this.positions = new Map([[this.positionKey(this.state), 1]]);
  }

  get fen() {
    let fen = "";
    for (let r = 7; r >= 0; r--) {
      let empty = 0;
      for (let f = 0; f < 8; f++) {
        const p = this.state.board[square(f, r)];
        if (p) {
          if (empty > 0) { fen += empty; empty = 0; }
          fen += p.color === "w" ? p.type.toUpperCase() : p.type;
        } else {
          empty++;
        }
      }
      if (empty > 0) fen += empty;
      if (r > 0) fen += "/";
    }

    let castling = "";
    if (this.state.castling.w.k) castling += "K";
    if (this.state.castling.w.q) castling += "Q";
    if (this.state.castling.b.k) castling += "k";
    if (this.state.castling.b.q) castling += "q";
    
    return `${fen} ${this.state.turn} ${castling || "-"} ${this.state.ep || "-"} ${this.state.halfmove} ${this.state.fullmove}`;
  }

  get pgn() {
    let pgn = "";
    for (let i = 0; i < this.history.length; i++) {
      if (this.history[i].piece.color === "w") {
        pgn += `${Math.floor(i / 2) + 1}. ${this.history[i].san} `;
      } else {
        pgn += `${this.history[i].san} `;
      }
    }
    const status = this.getStatus();
    if (status.phase === "checkmate") pgn += status.winner === "w" ? "1-0" : "0-1";
    else if (status.phase === "draw") pgn += "1/2-1/2";
    
    return pgn.trim();
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
      from, to, promotion, special,
      capture: Boolean(target) || special === "ep"
    });
  }

  pawnMoves(state, from, piece, pos, result) {
    const dir = piece.color === "w" ? 1 : -1;
    const startRank = piece.color === "w" ? 1 : 6;
    const promotionRank = piece.color === "w" ? 7 : 0;

    const one = squareSafe(pos.file, pos.rank + dir);
    if (one && !state.board[one]) {
      if (pos.rank + dir === promotionRank) {
        for (const p of ["q","r","b","n"]) this.pushMove(state, result, from, one, p);
      } else {
        this.pushMove(state, result, from, one);
        if (pos.rank === startRank) {
          const two = squareSafe(pos.file, pos.rank + dir * 2);
          if (two && !state.board[two]) this.pushMove(state, result, from, two, null, "double");
        }
      }
    }

    for (const df of [-1, 1]) {
      const to = squareSafe(pos.file + df, pos.rank + dir);
      if (!to) continue;
      
      const target = state.board[to];
      if (target && target.color !== piece.color && target.type !== "k") {
        if (pos.rank + dir === promotionRank) {
          for (const p of ["q","r","b","n"]) this.pushMove(state, result, from, to, p);
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
      const to = squareSafe(pos.file + df, pos.rank + dr);
      if (to) this.pushMove(state, result, from, to);
    }
  }

  slideMoves(state, from, piece, pos, result, dirs) {
    for (const [df, dr] of dirs) {
      let f = pos.file + df, r = pos.rank + dr;
      while (f >= 0 && f <= 7 && r >= 0 && r <= 7) {
        const to = square(f, r);
        const target = state.board[to];
        if (!target) {
          this.pushMove(state, result, from, to);
        } else {
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
        const to = squareSafe(pos.file + df, pos.rank + dr);
        if (to) this.pushMove(state, result, from, to);
      }
    }

    const rank = piece.color === "w" ? 0 : 7;
    const enemy = other(piece.color);

    if (pos.file === 4 && pos.rank === rank && !this.inCheck(state, piece.color)) {
      // King-side
      if (state.castling[piece.color].k && !state.board[square(5,rank)] && !state.board[square(6,rank)] && 
          state.board[square(7,rank)]?.type === "r") {
        if (!this.isAttacked(state, square(5,rank), enemy) && !this.isAttacked(state, square(6,rank), enemy)) {
          this.pushMove(state, result, from, square(6,rank), null, "castle-k");
        }
      }
      // Queen-side
      if (state.castling[piece.color].q && !state.board[square(1,rank)] && !state.board[square(2,rank)] && 
          !state.board[square(3,rank)] && state.board[square(0,rank)]?.type === "r") {
        if (!this.isAttacked(state, square(3,rank), enemy) && !this.isAttacked(state, square(2,rank), enemy)) {
          this.pushMove(state, result, from, square(2,rank), null, "castle-q");
        }
      }
    }
  }

  applyToClone(state, move) {
    const next = cloneState(state);
    const piece = next.board[move.from];
    delete next.board[move.from];

    if (move.special === "ep") {
      const toSq = parseSquare(move.to);
      delete next.board[square(toSq.file, toSq.rank + (piece.color === "w" ? -1 : 1))];
    }

    const captured = next.board[move.to];
    next.board[move.to] = { color: piece.color, type: move.promotion || piece.type };

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
    if (piece.type === "p" && Math.abs(parseSquare(move.to).rank - parseSquare(move.from).rank) === 2) {
      next.ep = square(parseSquare(move.from).file, (parseSquare(move.from).rank + parseSquare(move.to).rank) / 2);
    }

    next.halfmove = piece.type === "p" || move.capture ? 0 : next.halfmove + 1;
    if (piece.color === "b") next.fullmove += 1;
    next.turn = other(piece.color);
    return next;
  }

  inCheck(state, color) {
    const kingEntry = Object.entries(state.board).find(([, p]) => p.color === color && p.type === "k");
    return kingEntry ? this.isAttacked(state, kingEntry[0], other(color)) : false;
  }

  // ОПТИМИЗАЦИЯ: Reverse Raycasting (Обратная трассировка). Ищем атакующих вокруг клетки, 
  // вместо того чтобы перебирать все фигуры на доске. Работает в разы быстрее.
  isAttacked(state, targetSq, byColor) {
    const t = parseSquare(targetSq);
    if (!t) return false;

    // 1. Проверяем коней
    const knightJumps = [[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]];
    for (const [df, dr] of knightJumps) {
      const p = state.board[squareSafe(t.file + df, t.rank + dr)];
      if (p && p.color === byColor && p.type === "n") return true;
    }

    // 2. Проверяем королей
    for (let df = -1; df <= 1; df++) {
      for (let dr = -1; dr <= 1; dr++) {
        if (!df && !dr) continue;
        const p = state.board[squareSafe(t.file + df, t.rank + dr)];
        if (p && p.color === byColor && p.type === "k") return true;
      }
    }

    // 3. Проверяем пешки (смотрим в сторону откуда могла прийти пешка врага)
    const pDir = byColor === "w" ? -1 : 1; 
    for (const df of [-1, 1]) {
      const p = state.board[squareSafe(t.file + df, t.rank + pDir)];
      if (p && p.color === byColor && p.type === "p") return true;
    }

    // 4. Проверяем дальнобойные фигуры (Слоны, Ладьи, Ферзи)
    const dirs = [
      { df: 1, dr: 1, types: ["b", "q"] }, { df: -1, dr: -1, types: ["b", "q"] },
      { df: 1, dr: -1, types: ["b", "q"] }, { df: -1, dr: 1, types: ["b", "q"] },
      { df: 1, dr: 0, types: ["r", "q"] }, { df: -1, dr: 0, types: ["r", "q"] },
      { df: 0, dr: 1, types: ["r", "q"] }, { df: 0, dr: -1, types: ["r", "q"] }
    ];

    for (const { df, dr, types } of dirs) {
      let f = t.file + df, r = t.rank + dr;
      while (f >= 0 && f <= 7 && r >= 0 && r <= 7) {
        const p = state.board[square(f, r)];
        if (p) {
          if (p.color === byColor && types.includes(p.type)) return true;
          break; // Наткнулись на любую другую фигуру — луч блокирован
        }
        f += df; r += dr;
      }
    }

    return false;
  }

  sanForMove(move, legalBefore = null) {
    const piece = this.state.board[move.from];
    if (!piece) return "";
    if (move.special === "castle-k") return this.suffixAfter(move, "O-O");
    if (move.special === "castle-q") return this.suffixAfter(move, "O-O-O");

    const legal = legalBefore || this.legalMoves(this.state.turn);
    let san = piece.type === "p" ? "" : piece.type.toUpperCase();

    const same = legal.filter(m => m.to === move.to && m.from !== move.from && this.state.board[m.from]?.type === piece.type);

    // Улучшенная дисамбигуация (правила SAN)
    if (same.length) {
      const fromSq = parseSquare(move.from);
      const sameFile = same.some(m => parseSquare(m.from).file === fromSq.file);
      const sameRank = same.some(m => parseSquare(m.from).rank === fromSq.rank);

      if (!sameFile) {
        san += move.from[0]; // Отличаются по вертикали
      } else if (!sameRank) {
        san += move.from[1]; // Отличаются по горизонтали
      } else {
        san += move.from; // Приходится указывать и то, и другое
      }
    }

    if (move.capture) {
      if (piece.type === "p" && same.length === 0) san += move.from[0];
      san += "x";
    }

    san += move.to;
    if (move.promotion) san += `=${move.promotion.toUpperCase()}`;

    return this.suffixAfter(move, san);
  }

  suffixAfter(move, san) {
    const next = this.applyToClone(this.state, move);
    if (this.inCheck(next, next.turn)) {
      const replies = this.legalMoves(next.turn).filter(m => !this.inCheck(this.applyToClone(next, m), next.turn));
      return san + (replies.length ? "+" : "#");
    }
    return san;
  }

  makeMove(input) {
    const from = String(input?.from || "").toLowerCase();
    const to = String(input?.to || "").toLowerCase();
    const promotion = String(input?.promotion || "q").toLowerCase();

    const legal = this.legalMoves(this.state.turn);
    const move = legal.find(m => m.from === from && m.to === to && (m.promotion ? m.promotion === promotion : true));

    if (!move) return { ok: false, error: "Недопустимый ход." };

    const san = this.sanForMove(move, legal);
    const piece = this.state.board[from];
    const capturedPiece = move.special === "ep" ? { type: "p", color: other(piece.color) } : this.state.board[to] || null;

    this.history.push({
      ...move, san, piece: { ...piece },
      captured: capturedPiece ? { ...capturedPiece } : null,
      before: cloneState(this.state)
    });

    this.state = this.applyToClone(this.state, move);
    this.state.lastMove = { from, to, san, piece: { ...piece }, captured: capturedPiece ? { ...capturedPiece } : null };

    const key = this.positionKey(this.state);
    this.positions.set(key, (this.positions.get(key) || 0) + 1);

    return { ok: true, move: this.state.lastMove, status: this.getStatus() };
  }

  // ОПТИМИЗАЦИЯ: O(1) Undo (Мгновенная отмена хода)
  undo() {
    const last = this.history.pop();
    if (!last) return false;
    
    // Декрементируем счетчик текущей позиции
    const currentKey = this.positionKey(this.state);
    const count = this.positions.get(currentKey);
    if (count === 1) this.positions.delete(currentKey);
    else this.positions.set(currentKey, count - 1);

    this.state = last.before;
    return true;
  }

  getStatus() {
    const color = this.state.turn;
    const moves = this.legalMoves(color);
    const check = this.inCheck(this.state, color);

    if (!moves.length) return check ? { phase: "checkmate", turn: color, winner: other(color) } : { phase: "draw", reason: "stalemate", turn: color };
    if (this.state.halfmove >= 100) return { phase: "draw", reason: "50-move", turn: color };
    
    const key = this.positionKey(this.state);
    if ((this.positions.get(key) || 0) >= 3) return { phase: "draw", reason: "threefold", turn: color };
    if (this.insufficientMaterial()) return { phase: "draw", reason: "insufficient-material", turn: color };
    if (check) return { phase: "check", turn: color };
    
    return { phase: "playing", turn: color };
  }

  insufficientMaterial() {
    const pieces = Object.values(this.state.board).filter(p => p.type !== "k");
    if (pieces.length === 0) return true;
    if (pieces.length === 1 && ["n", "b"].includes(pieces[0].type)) return true;
    
    // Два слона одноцветных полей у разных сторон
    if (pieces.length === 2 && pieces.every(p => p.type === "b")) {
      const bishops = Object.entries(this.state.board).filter(([, p]) => p.type === "b");
      const c1 = parseSquare(bishops[0][0]);
      const c2 = parseSquare(bishops[1][0]);
      if ((c1.file + c1.rank) % 2 === (c2.file + c2.rank) % 2) return true;
    }
    return false;
  }

  material() {
    const captured = { w: [], b: [] };
    for (const h of this.history) if (h.captured) captured[h.piece.color].push(h.captured.type);
    
    const sort = a => a.sort((x, y) => VALUES[y] - VALUES[x]);
    sort(captured.w); sort(captured.b);

    return {
      captured,
      score: {
        w: captured.b.reduce((n, p) => n + VALUES[p], 0),
        b: captured.w.reduce((n, p) => n + VALUES[p], 0)
      }
    };
  }

  getSnapshot() {
    return {
      ...cloneState(this.state),
      moves: this.history.map((h, i) => ({
        number: i + 1,
        from: h.from, to: h.to,
        san: h.san, color: h.piece.color,
        piece: h.piece.type, capture: Boolean(h.captured)
      })),
      material: this.material(),
      status: this.getStatus(),
      fen: this.fen,
      pgn: this.pgn
    };
  }
}

export { FILES, VALUES };

