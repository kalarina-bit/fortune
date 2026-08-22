import { ChessEngine, VALUES } from "/shared/chess-engine.js";

const PIECES = {
  w: { k:"♔", q:"♕", r:"♖", b:"♗", n:"♘", p:"♙" },
  b: { k:"♚", q:"♛", r:"♜", b:"♝", n:"♞", p:"♟" }
};

const $ = (id) => document.getElementById(id);

const state = {
  mode: null,
  engine: new ChessEngine(),
  orientation: "w",
  selected: null,
  legal: [],
  party: null,
  clientId: localStorage.getItem("chess-client-id") || crypto.randomUUID(),
  eventSource: null,
  pendingPromotion: null,
  aiBusy: false,
  localGameOver: false
};

localStorage.setItem("chess-client-id", state.clientId);

function show(view) {
  $("homeView").classList.toggle("hidden", view !== "home");
  $("gameView").classList.toggle("hidden", view !== "game");
}

function toast(text) {
  const el = $("toast");
  el.textContent = text;
  el.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove("show"), 2200);
}

function resetSelection() {
  state.selected = null;
  state.legal = [];
}

function boardOrder() {
  const files = "abcdefgh".split("");
  const ranks = [8,7,6,5,4,3,2,1];
  if (state.orientation === "b") {
    files.reverse();
    ranks.reverse();
  }
  return { files, ranks };
}

function snapshot() {
  return state.mode === "party" ? state.party?.game : state.engine.getSnapshot();
}

function renderBoard() {
  const snap = snapshot();
  if (!snap) return;

  const board = $("board");
  board.innerHTML = "";
  const { files, ranks } = boardOrder();

  const legalMap = new Map(state.legal.map(m => [m.to, m]));
  const last = snap.lastMove;

  for (const rank of ranks) {
    for (const file of files) {
      const name = `${file}${rank}`;
      const f = "abcdefgh".indexOf(file);
      const r = rank - 1;
      const el = document.createElement("button");
      el.type = "button";
      el.className = `square ${((f+r)%2===0) ? "light" : "dark"}`;
      el.dataset.square = name;

      if (state.selected === name) el.classList.add("selected");
      if (state.selected && state.legal.some(m => m.to === name)) {
        el.classList.add(snap.board[name] ? "capture" : "legal");
      }
      if (last?.from === name) el.classList.add("last-from");
      if (last?.to === name) el.classList.add("last-to");
      if (state.selected && state.legal.some(m => m.to === name)) el.classList.add("trajectory");

      const piece = snap.board[name];
      if (piece) {
        const span = document.createElement("span");
        span.className = "piece";
        span.textContent = PIECES[piece.color][piece.type];
        el.appendChild(span);
      }

      const fileLabel = document.createElement("span");
      fileLabel.className = "coord file";
      fileLabel.textContent = file;
      el.appendChild(fileLabel);

      const rankLabel = document.createElement("span");
      rankLabel.className = "coord rank";
      rankLabel.textContent = rank;
      el.appendChild(rankLabel);

      el.addEventListener("click", () => handleSquare(name));
      board.appendChild(el);
    }
  }
}

function canUserMove() {
  if (state.mode === "ai") return state.engine.state.turn === "w" && !state.aiBusy && !state.localGameOver;
  if (state.mode === "party") {
    return state.party?.you?.role === (state.party.game.turn === "w" ? "white" : "black")
      && !state.party.gameOverReason;
  }
  return false;
}

function handleSquare(name) {
  if (!canUserMove()) return;

  const snap = snapshot();
  const piece = snap.board[name];

  if (state.selected) {
    const candidate = state.legal.filter(m => m.to === name);
    if (candidate.length) {
      if (candidate.some(m => m.promotion)) {
        state.pendingPromotion = { from: state.selected, to: name };
        $("promotionModal").classList.remove("hidden");
      } else {
        playMove(state.selected, name, candidate[0].promotion || null);
      }
      return;
    }
  }

  if (piece && piece.color === snap.turn) {
    state.selected = name;
    if (state.mode === "ai") state.legal = state.engine.movesFrom(name);
    else state.legal = state.partyEngineMoves(name);
  } else {
    resetSelection();
  }
  renderBoard();
  updateStatus();
}

function partyEngineMoves(from) {
  // The server is authoritative. The snapshot contains enough board state to
  // calculate normal movement hints locally; the server validates the final move.
  const temp = new ChessEngine();
  temp.state = JSON.parse(JSON.stringify({
    board: state.party.game.board,
    turn: state.party.game.turn,
    castling: state.party.game.castling,
    ep: state.party.game.ep,
    halfmove: state.party.game.halfmove,
    fullmove: state.party.game.fullmove,
    lastMove: state.party.game.lastMove
  }));
  return temp.movesFrom(from);
}

async function playMove(from, to, promotion = null) {
  resetSelection();
  $("promotionModal").classList.add("hidden");

  if (state.mode === "ai") {
    const result = state.engine.makeMove({ from, to, promotion: promotion || "q" });
    if (!result.ok) {
      toast(result.error);
      renderBoard();
      return;
    }
    renderAll();
    if (!state.engine.getStatus().phase.match(/checkmate|draw/)) {
      state.aiBusy = true;
      renderAll();
      setTimeout(aiMove, 220);
    }
    return;
  }

  try {
    const response = await fetch("/api/party/move", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        partyCode: state.party.code,
        clientId: state.clientId,
        from, to, promotion: promotion || "q"
      })
    });
    const data = await response.json();
    if (!data.ok) toast(data.error || "Ход не выполнен.");
    if (data.party) applyParty(data.party);
  } catch {
    toast("Нет соединения с сервером.");
  }
}

function aiMove() {
  const moves = state.engine.legalMoves("b");
  if (!moves.length) {
    state.aiBusy = false;
    renderAll();
    return;
  }

  // Small deterministic evaluation: captures, promotion, checks, center.
  let best = moves[0];
  let bestScore = -Infinity;

  for (const move of moves) {
    const piece = state.engine.state.board[move.from];
    const captured = state.engine.state.board[move.to];
    let score = Math.random() * 0.15;
    if (captured) score += VALUES[captured.type] * 2.5;
    if (move.promotion) score += 9;
    if (["d4","e4","d5","e5"].includes(move.to)) score += .5;
    if (piece?.type === "p" && Math.abs(Number(move.to[1]) - Number(move.from[1])) === 2) score += .1;
    if (score > bestScore) { bestScore = score; best = move; }
  }

  state.engine.makeMove({
    from: best.from,
    to: best.to,
    promotion: best.promotion || "q"
  });
  state.aiBusy = false;
  renderAll();
}

function renderMoves(snap) {
  const list = $("movesList");
  list.innerHTML = "";
  const moves = snap.moves || [];

  for (let i = 0; i < moves.length; i += 2) {
    const row = document.createElement("div");
    row.className = "move";
    row.innerHTML = `
      <span class="move-number">${Math.floor(i/2)+1}.</span>
      <span>${escapeHtml(moves[i]?.san || "")}</span>
      <span>${escapeHtml(moves[i+1]?.san || "")}</span>
    `;
    list.appendChild(row);
  }
  $("moveCount").textContent = moves.length;
  list.scrollTop = list.scrollHeight;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));
}

function renderMaterial(snap) {
  const mat = snap.material || { captured:{w:[],b:[]},score:{w:0,b:0} };
  const icon = (color, type) => PIECES[color][type];
  $("material").innerHTML = `
    <span>${mat.captured.w.map(p => icon("w",p)).join("") || "—"}</span>
    <b>Δ ${mat.score.w - mat.score.b}</b>
    <span>${mat.captured.b.map(p => icon("b",p)).join("") || "—"}</span>
  `;
}

function updateStatus() {
  const snap = snapshot();
  if (!snap) return;

  const status = snap.status || { phase:"playing", turn:snap.turn };
  let text = state.selected ? "Выберите клетку назначения." : "Выберите фигуру.";

  if (status.phase === "check") text = "Шах.";
  if (status.phase === "checkmate") text = "Мат.";
  if (status.phase === "draw") text = `Ничья: ${status.reason || "правило"}.`;
  if (state.mode === "ai" && state.aiBusy) text = "ИИ думает…";
  if (state.mode === "ai" && state.localGameOver) text = "Партия завершена сдачей.";
  if (state.mode === "party" && state.party?.gameOverReason === "resign") text = "Партия завершена сдачей.";
  if (state.mode === "party" && state.party?.gameOverReason === "timeout") text = "Время закончилось.";
  if (state.mode === "party" && state.party?.drawOffer) text = `${state.party.drawOffer.name} предложил(а) ничью.`;

  $("gameStatus").textContent = text;
  $("turnBadge").textContent = snap.turn === "w" ? "Ход белых" : "Ход чёрных";
}

function renderPlayers() {
  if (state.mode === "ai") {
    $("whiteName").textContent = "Вы";
    $("blackName").textContent = "ИИ";
    $("whiteMeta").textContent = "Белые";
    $("blackMeta").textContent = "Чёрные";
    $("whiteClock").textContent = "—";
    $("blackClock").textContent = "—";
    return;
  }

  const p = state.party;
  $("whiteName").textContent = p.players.white?.name || "Ожидание…";
  $("blackName").textContent = p.players.black?.name || "Ожидание…";
  $("whiteMeta").textContent = p.players.white?.connected ? "Белые • онлайн" : "Белые • офлайн";
  $("blackMeta").textContent = p.players.black?.connected ? "Чёрные • онлайн" : "Чёрные • офлайн";
  $("whiteClock").textContent = formatClock(p.clocks.white, p.timeControl.initial);
  $("blackClock").textContent = formatClock(p.clocks.black, p.timeControl.initial);
}

function formatClock(seconds, enabled) {
  if (!enabled) return "—";
  const total = Math.max(0, Math.ceil(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
}

function renderAll() {
  renderBoard();
  renderMoves(snapshot());
  renderMaterial(snapshot());
  renderPlayers();
  updateStatus();
}

function startAI() {
  closeParty();
  state.mode = "ai";
  state.engine = new ChessEngine();
  state.orientation = "w";
  state.localGameOver = false;
  resetSelection();
  $("chatPanel").classList.add("hidden");
  show("game");
  renderAll();
}

async function createParty() {
  const name = $("nameInput").value.trim() || "Guest";
  const timeControl = $("timeControl").value;
  await enterParty("/api/party/create", { name, timeControl });
}

async function joinParty() {
  const name = $("nameInput").value.trim() || "Guest";
  const partyCode = $("partyCodeInput").value.trim().toUpperCase();
  if (!partyCode) {
    $("setupError").textContent = "Введите код комнаты.";
    return;
  }
  await enterParty("/api/party/join", { name, partyCode, clientId: state.clientId });
}

async function enterParty(url, body) {
  $("setupError").textContent = "";
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = await response.json();
    if (!data.ok) {
      $("setupError").textContent = data.error || "Ошибка.";
      return;
    }

    state.mode = "party";
    state.party = data.party;
    state.orientation = state.party.you?.role === "black" ? "b" : "w";
    resetSelection();
    $("chatPanel").classList.remove("hidden");
    show("game");
    connectEvents();
    renderAll();
  } catch {
    $("setupError").textContent = "Сервер недоступен.";
  }
}

function connectEvents() {
  if (state.eventSource) state.eventSource.close();
  state.eventSource = new EventSource(
    `/api/party/events?partyCode=${encodeURIComponent(state.party.code)}&clientId=${encodeURIComponent(state.clientId)}`
  );
  state.eventSource.addEventListener("party", e => {
    try { applyParty(JSON.parse(e.data)); } catch {}
  });
  state.eventSource.onerror = () => {};
}

function applyParty(party) {
  state.party = party;
  // Important: orientation is never changed by a received move.
  // It only changes when the user presses "Повернуть".
  renderAll();
  renderChat();
}

function renderChat() {
  if (state.mode !== "party") return;
  const box = $("chatMessages");
  box.innerHTML = "";
  for (const msg of state.party.chat || []) {
    const row = document.createElement("div");
    row.className = "chat-message";
    row.innerHTML = `<b>${escapeHtml(msg.name)}</b> <span>${escapeHtml(msg.text)}</span>`;
    box.appendChild(row);
  }
  box.scrollTop = box.scrollHeight;
}

async function partyAction(endpoint) {
  if (!state.party) return;
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ partyCode: state.party.code, clientId: state.clientId })
    });
    const data = await response.json();
    if (!data.ok) toast(data.error || "Операция не выполнена.");
    if (data.party) applyParty(data.party);
  } catch {
    toast("Нет соединения с сервером.");
  }
}

function newGame() {
  if (state.mode === "ai") {
    state.engine = new ChessEngine();
    state.aiBusy = false;
    state.localGameOver = false;
    state.orientation = "w";
    resetSelection();
    renderAll();
    return;
  }

  if (state.mode === "party") {
    partyAction("/api/party/rematch");
    return;
  }

  $("partySetup").classList.add("hidden");
  show("home");
}

function closeParty() {
  state.eventSource?.close();
  state.eventSource = null;
  state.party = null;
}

function backHome() {
  if (state.mode === "party") {
    partyAction("/api/party/leave");
    closeParty();
  }
  state.mode = null;
  state.engine = new ChessEngine();
  resetSelection();
  $("partySetup").classList.add("hidden");
  show("home");
}

$("newGameBtn").addEventListener("click", newGame);
$("flipBtn").addEventListener("click", () => {
  state.orientation = state.orientation === "w" ? "b" : "w";
  renderBoard();
});
$("backHomeBtn").addEventListener("click", backHome);
$("resignBtn").addEventListener("click", () => {
  if (state.mode === "party") partyAction("/api/party/resign");
  else {
    const snap = state.engine.getSnapshot();
    if (!snap.status.phase.match(/checkmate|draw/)) {
      state.localGameOver = true;
    state.aiBusy = false;
    resetSelection();
    renderAll();
    toast("Вы сдались.");
    }
  }
});
$("drawBtn").addEventListener("click", () => {
  if (state.mode === "party") partyAction("/api/party/draw");
  else toast("Предложение ничьей доступно в Party.");
});
$("rematchBtn").addEventListener("click", newGame);

document.querySelectorAll(".mode-card").forEach(btn => {
  btn.addEventListener("click", () => {
    if (btn.dataset.mode === "ai") startAI();
    else $("partySetup").classList.remove("hidden");
  });
});

$("createPartyBtn").addEventListener("click", createParty);
$("joinPartyBtn").addEventListener("click", joinParty);
$("partyCodeInput").addEventListener("input", e => {
  e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,"");
});

$("chatForm").addEventListener("submit", async e => {
  e.preventDefault();
  if (!state.party) return;
  const input = $("chatInput");
  const text = input.value.trim();
  if (!text) return;
  input.value = "";
  try {
    await fetch("/api/party/chat", {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        partyCode:state.party.code,
        clientId:state.clientId,
        text
      })
    });
  } catch {
    toast("Не удалось отправить сообщение.");
  }
});

document.querySelectorAll("[data-promotion]").forEach(btn => {
  btn.addEventListener("click", () => {
    const p = state.pendingPromotion;
    if (!p) return;
    state.pendingPromotion = null;
    playMove(p.from, p.to, btn.dataset.promotion);
  });
});

show("home");

