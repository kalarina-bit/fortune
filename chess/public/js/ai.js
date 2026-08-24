// ai.js
import { ChessEngine } from "/shared/chess-engine.js";

/* ---------- Константы ---------- */
const MATERIAL = {
  P: 100,
  N: 320,
  B: 330,
  R: 500,
  Q: 900,
  K: 0,
};

const TABLES = {
  P: [
    [0,0,0,0,0,0,0,0],
    [5,10,10,-20,-20,10,10,5],
    [5,-5,-10,0,0,-10,-5,5],
    [0,0,0,20,20,0,0,0],
    [5,5,10,25,25,10,5,5],
    [10,10,20,30,30,20,10,10],
    [50,50,50,50,50,50,50,50],
    [0,0,0,0,0,0,0,0],
  ],
  N: [
    [-50,-40,-30,-30,-30,-30,-40,-50],
    [-40,-20,0,5,5,0,-20,-40],
    [-30,5,10,15,15,10,5,-30],
    [-30,0,15,20,20,15,0,-30],
    [-30,5,15,20,20,15,5,-30],
    [-30,0,10,15,15,10,0,-30],
    [-40,-20,0,0,0,0,-20,-40],
    [-50,-40,-30,-30,-30,-30,-40,-50],
  ],
  B: [
    [-20,-10,-10,-10,-10,-10,-10,-20],
    [-10,5,0,0,0,0,5,-10],
    [-10,10,10,10,10,10,10,-10],
    [-10,0,10,10,10,10,0,-10],
    [-10,5,5,10,10,5,5,-10],
    [-10,0,5,10,10,5,0,-10],
    [-10,0,0,0,0,0,0,-10],
    [-20,-10,-10,-10,-10,-10,-10,-20],
  ],
  R: [
    [0,0,0,5,5,0,0,0],
    [-5,0,0,0,0,0,0,-5],
    [-5,0,0,0,0,0,0,-5],
    [-5,0,0,0,0,0,0,-5],
    [-5,0,0,0,0,0,0,-5],
    [-5,0,0,0,0,0,0,-5],
    [5,10,10,10,10,10,10,5],
    [0,0,0,0,0,0,0,0],
  ],
  Q: [
    [-20,-10,-10,-5,-5,-10,-10,-20],
    [-10,0,0,0,0,0,0,-10],
    [-10,0,5,5,5,5,0,-10],
    [-5,0,5,5,5,5,0,-5],
    [0,0,5,5,5,5,0,-5],
    [-10,5,5,5,5,5,0,-10],
    [-10,0,5,0,0,0,0,-10],
    [-20,-10,-10,-5,-5,-10,-10,-20],
  ],
  K: [
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
  easy: { depth: 1, spread: 110 },
  intermediate: { depth: 2, spread: 45 },
  hard: { depth: 3, spread: 12 },
};

/* ---------- Утилиты ---------- */

// Быстрая статическая оценка таблицы (учёт цвета)
function tableScore(type, color, x, y) {
  const row = color === "w" ? y : 7 - y;
  return TABLES[type][row][x] || 0;
}

// Быстрая строка-представление позиции для кэша.
// Формируем ключ из turn + последовательности фигур (тип+цвет или .)
function positionKey(state) {
  // state.board — предполагается [8][8] с null или {type,color}
  const parts = [state.turn];
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const p = state.board[y][x];
      parts.push(p ? `${p.type}${p.color}` : ".");
    }
  }
  return parts.join("");
}

/* ---------- Оценка позиции ---------- */

function evaluateMaterialAndSpace(state, perspective) {
  let score = 0;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const piece = state.board[y][x];
      if (!piece) continue;
      const base = MATERIAL[piece.type] || 0;
      const ps = tableScore(piece.type, piece.color, x, y);
      const value = base + ps;
      score += piece.color === perspective ? value : -value;
    }
  }
  return score;
}

function evaluateState(state, perspective) {
  const status = state.status || ChessEngine.evaluateStatus(state);

  if (status.phase === "checkmate") {
    return status.winner === perspective ? 100_000 : -100_000;
  }
  if (status.phase === "draw") {
    return 0;
  }

  const ownMobility = ChessEngine.generateLegalMovesForState(state, perspective).length;
  const otherColor = perspective === "w" ? "b" : "w";
  const enemyMobility = ChessEngine.generateLegalMovesForState(state, otherColor).length;
  const pressure = status.check ? (state.turn === perspective ? -18 : 18) : 0;

  return evaluateMaterialAndSpace(state, perspective) + (ownMobility - enemyMobility) * 4 + pressure;
}

/* ---------- Поиск: Negamax + Alpha-Beta + Transposition Table + Quiescence ---------- */

class TranspositionTable {
  constructor() {
    this.table = new Map();
  }
  // flag: "EXACT", "LOWER", "UPPER"
  store(key, depth, score, flag) {
    this.table.set(key, { depth, score, flag });
  }
  probe(key, depth, alpha, beta) {
    const entry = this.table.get(key);
    if (!entry) return null;
    if (entry.depth >= depth) {
      if (entry.flag === "EXACT") return entry.score;
      if (entry.flag === "LOWER" && entry.score > alpha) alpha = entry.score;
      if (entry.flag === "UPPER" && entry.score < beta) beta = entry.score;
      if (alpha >= beta) return entry.score;
    }
    return null;
  }
}

function materialOnly(state, perspective) {
  return evaluateMaterialAndSpace(state, perspective);
}

// Quiescence: только взятия и проверки (упрощённо — расширяем, пока меняется материал)
function quiescence(state, alpha, beta, perspective) {
  const standPat = evaluateState(state, perspective);
  if (standPat >= beta) return beta;
  if (alpha < standPat) alpha = standPat;

  const moves = ChessEngine.generateLegalMovesForState(state, state.turn);
  // Фильтруем ходы, которые, вероятно, меняют материал: если ход явно захватывает фигуру.
  const captureMoves = moves.filter((m) => m.captured || m.promotion || m.isCapture);
  // Если движений захвата нет — возвращаем статическую оценку
  if (captureMoves.length === 0) return standPat;

  // Упорядочим захваты по простой эвристике (взятие более ценной фигуры первым)
  captureMoves.sort((a, b) => {
    const va = (a.captured ? MATERIAL[a.captured] || 0 : 0) - (a.promotion ? MATERIAL[a.promotion] || 0 : 0);
    const vb = (b.captured ? MATERIAL[b.captured] || 0 : 0) - (b.promotion ? MATERIAL[b.promotion] || 0 : 0);
    return vb - va;
  });

  for (const m of captureMoves) {
    const next = ChessEngine.playMove(state, m, { computeStatus: false, updatePositionCounts: true });
    const score = -quiescence(next, -beta, -alpha, perspective);
    if (score >= beta) return beta;
    if (score > alpha) alpha = score;
  }
  return alpha;
}

function negamax(state, depth, alpha, beta, perspective, tt) {
  const status = state.status || ChessEngine.evaluateStatus(state);
  if (depth === 0 || status.phase !== "playing") {
    // на глубине 0 — запускаем quiescence, чтобы избежать так называемой "horizon effect"
    return quiescence(state, alpha, beta, perspective);
  }

  const key = positionKey(state);
  const ttHit = tt.table.get(key);
  if (ttHit && ttHit.depth >= depth) {
    if (ttHit.flag === "EXACT") return ttHit.score;
    if (ttHit.flag === "LOWER" && ttHit.score > alpha) alpha = ttHit.score;
    if (ttHit.flag === "UPPER" && ttHit.score < beta) beta = ttHit.score;
    if (alpha >= beta) return ttHit.score;
  }

  let max = -Infinity;
  const moves = ChessEngine.generateLegalMovesForState(state, state.turn);
  if (moves.length === 0) {
    // нет ходов — оценка статуса
    return evaluateState(state, perspective);
  }

  // Move ordering: быстрые оценки для сортировки
  const scored = moves.map((m) => {
    const ns = ChessEngine.playMove(state, m, { computeStatus: false, updatePositionCounts: false });
    const s = materialOnly(ns, perspective);
    return { m, s };
  });
  scored.sort((a, b) => b.s - a.s);

  for (const { m } of scored) {
    const next = ChessEngine.playMove(state, m, { computeStatus: false, updatePositionCounts: true });
    const val = -negamax(next, depth - 1, -beta, -alpha, perspective, tt);
    if (val > max) max = val;
    if (val > alpha) alpha = val;
    if (alpha >= beta) break; // beta cut-off
  }

  // Сохраняем в таблицу транспозиций
  let flag = "EXACT";
  if (max <= alpha) flag = "UPPER";
  else if (max >= beta) flag = "LOWER";
  tt.table.set(key, { depth, score: max, flag });

  return max;
}

/* ---------- Выбор хода ---------- */

export function chooseComputerMove(engine, level = "intermediate") {
  const config = AI_LEVELS[level] || AI_LEVELS.intermediate;
  const snapshot = engine.getSnapshot();
  const legalMoves = ChessEngine.generateLegalMovesForState(snapshot, snapshot.turn);
  if (legalMoves.length === 0) return null;

  const perspective = snapshot.turn;
  const tt = new TranspositionTable();

  // Оцениваем каждый ход с помощью negamax (глубина = config.depth)
  const scored = [];
  for (const move of legalMoves) {
    const next = ChessEngine.playMove(snapshot, move, { computeStatus: false, updatePositionCounts: true });
    const score = -negamax(next, Math.max(0, config.depth - 1), -Infinity, Infinity, perspective, tt);
    scored.push({ move, score });
  }

  // Сортируем и выбираем пул кандидатов
  scored.sort((a, b) => b.score - a.score);
  const bestScore = scored[0].score;
  const candidatePool = scored.filter((e) => bestScore - e.score <= config.spread).slice(0, 4);
  const choice = candidatePool[Math.floor(Math.random() * candidatePool.length)];
  return choice.move;
}
