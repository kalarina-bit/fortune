// Ценность фигур (обрати внимание, ключи теперь в нижнем регистре под новый движок)
const PIECE_VALUE = {
    p: 100,
    n: 320,
    b: 330,
    r: 500,
    q: 900,
    k: 20000,
};

const LEVELS = {
    easy: { depth: 1, randomness: 0.35 },
    intermediate: { depth: 2, randomness: 0.08 },
    hard: { depth: 3, randomness: 0.01 },
    expert: { depth: 4, randomness: 0 },
};

// 1. АЛГОРИТМИЧЕСКАЯ ПОЗИЦИОННАЯ ОЦЕНКА
// Вычисляет бонус для фигуры в зависимости от ее положения на доске
function getPositionalBonus(piece, sqStr) {
    const file = sqStr.charCodeAt(0) - 97; // 0 до 7 (от 'a' до 'h')
    const rank = sqStr.charCodeAt(1) - 49; // 0 до 7 (от '1' до '8')
    
    // Относительная горизонталь: 0 - домашняя линия, 7 - линия превращения
    const relativeRank = piece.color === "w" ? rank : 7 - rank; 
    
    // Близость к центру (чем больше, тем ближе)
    const centerDistX = Math.abs(3.5 - file);
    const centerDistY = Math.abs(3.5 - relativeRank);
    const centerScore = 7 - (centerDistX + centerDistY);

    let bonus = 0;
    
    switch (piece.type) {
        case "p":
            bonus += (relativeRank * relativeRank) * 2; // Мощный бонус за продвижение
            if (file > 2 && file < 5) bonus += 15; // Центральные пешки сильнее
            break;
        case "n":
            bonus += centerScore * 8; // Кони требуют центра
            if (file === 0 || file === 7 || rank === 0 || rank === 7) bonus -= 25; // Кони на краю - позор
            break;
        case "b":
            bonus += centerScore * 5; // Слонам нравятся центральные диагонали
            if (relativeRank === 0) bonus -= 10; // Штраф за пассивность на задней линии
            break;
        case "r":
            if (relativeRank === 6) bonus += 35; // Ладьи на 7-й горизонтали смертоносны
            if (file === 3 || file === 4) bonus += 15; // Давим на центральные вертикали
            break;
        case "q":
            bonus += centerScore * 3; // Ферзю легкий бонус за центр
            break;
        case "k":
            if (relativeRank < 2) {
                if (file < 2 || file > 5) bonus += 40; // Безопасность (рокировка)
                if (file === 3 || file === 4) bonus -= 20; // Опасность в центре
            } else {
                bonus -= relativeRank * 15; // В миттельшпиле королю не стоит гулять
            }
            break;
    }
    return bonus;
}

// 2. БЫСТРЫЙ ОЦЕНЩИК
function evaluate(engine, color) {
    let score = 0;
    // Перебираем только словарь активных фигур (вместо пустых клеток 8х8)
    for (const [sq, piece] of Object.entries(engine.state.board)) {
        const val = PIECE_VALUE[piece.type] || 0;
        const positional = getPositionalBonus(piece, sq);
        
        const total = val + positional;
        
        if (piece.color === color) {
            score += total;
        } else {
            score -= total;
        }
    }
    return score;
}

// 3. MVV-LVA СОРТИРОВКА (Most Valuable Victim - Least Valuable Attacker)
function orderMoves(engine, moves) {
    for (const move of moves) {
        let score = 0;
        if (move.capture) {
            const attacker = engine.getPiece(move.from);
            const victim = engine.getPiece(move.to) || { type: "p" }; // Фолбэк для взятия на проходе
            if (attacker && victim) {
                // Если пешка(100) бьет ферзя(900) -> огромный приоритет
                score += 1000 + PIECE_VALUE[victim.type] - PIECE_VALUE[attacker.type];
            }
        }
        if (move.promotion) {
            score += PIECE_VALUE[move.promotion] + 900;
        }
        move._score = score;
    }
    return moves.sort((a, b) => b._score - a._score);
}

// 4. МИНИМАКС С ОТСЕЧЕНИЕМ И МГНОВЕННОЙ ОТМЕНОЙ (UNDO)
function minimax(engine, depth, alpha, beta, maximizingColor) {
    // Быстрая проверка на ничью (правило 50 ходов)
    if (engine.state.halfmove >= 100) return 0;
    
    if (depth <= 0) {
        return evaluate(engine, maximizingColor);
    }

    const turn = engine.state.turn;
    const moves = engine.legalMoves(turn);

    if (!moves.length) {
        if (engine.inCheck(engine.state, turn)) {
            // Предпочитаем самые быстрые маты, прибавляя остаточную глубину
            return turn === maximizingColor ? -1000000 - depth : 1000000 + depth;
        }
        return 0; // Пат
    }

    orderMoves(engine, moves);

    const maximizing = turn === maximizingColor;
    let bestScore = maximizing ? -Infinity : Infinity;

    for (const move of moves) {
        // Делаем ход напрямую в оригинальном движке
        engine.makeMove({ from: move.from, to: move.to, promotion: move.promotion });
        
        const score = minimax(engine, depth - 1, alpha, beta, maximizingColor);
        
        // Моментально откатываем
        engine.undo();

        if (maximizing) {
            bestScore = Math.max(bestScore, score);
            alpha = Math.max(alpha, bestScore);
        } else {
            bestScore = Math.min(bestScore, score);
            beta = Math.min(beta, bestScore);
        }

        if (beta <= alpha) break; // Альфа-бета отсечение
    }

    return bestScore;
}

export const AI_LEVELS = LEVELS;

export function chooseComputerMove(engine, level = "intermediate") {
    const config = LEVELS[level] || LEVELS.intermediate;
    const color = engine.state.turn;
    
    const moves = engine.legalMoves(color);
    if (!moves.length) return null;

    // Первичная сортировка для эффективного начала
    orderMoves(engine, moves);
    const ranked = [];

    for (const move of moves) {
        engine.makeMove({ from: move.from, to: move.to, promotion: move.promotion });
        const score = minimax(engine, Math.max(0, config.depth - 1), -Infinity, Infinity, color);
        engine.undo();
        
        ranked.push({ move, score });
    }

    ranked.sort((a, b) => b.score - a.score);

    if (!ranked.length) return moves[0];

    // Применяем процент случайности для уровней ниже эксперта
    if (Math.random() < config.randomness) {
        const count = Math.min(3, ranked.length);
        return ranked[Math.floor(Math.random() * count)].move;
    }

    return ranked[0].move;
}

