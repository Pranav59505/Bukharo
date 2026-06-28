// app.js — Bukharo frontend

// ── STATE ──
let ws = null;
let myPlayerId = null;
let myRoomId = null;
let myName = null;
let myTeam = null;
let gameState = null;
let selectedCardIds = new Set();
let hostId = null;
let chatOpen = true;
let handSorted = false;

const SUIT_COLOR = { '♠': 'black', '♣': 'black', '♥': 'red', '♦': 'red' };

// ── INIT ──
window.onload = () => {
  // Check URL for room code
  const urlParams = new URLSearchParams(window.location.search);
  const roomCode = urlParams.get('room');
  if (roomCode) {
    document.getElementById('join-code').value = roomCode.toUpperCase();
    showScreen('lobby');
  }

  // Enter key for inputs
  document.getElementById('create-name').addEventListener('keydown', e => { if (e.key === 'Enter') createRoom(); });
  document.getElementById('join-name').addEventListener('keydown', e => { if (e.key === 'Enter') joinRoom(); });
  document.getElementById('join-code').addEventListener('keydown', e => { if (e.key === 'Enter') joinRoom(); });
};

// ── WEBSOCKET ──
function connect(callback) {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}`);

  ws.onopen = () => { if (callback) callback(); };
  ws.onerror = () => showError('Connection failed. Is the server running?');
  ws.onclose = () => {
    if (myRoomId) showToast('Disconnected from server', 'error');
  };
  ws.onmessage = (evt) => {
    const msg = JSON.parse(evt.data);
    handleMessage(msg);
  };
}

function send(data) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(data));
  else showToast('Not connected', 'error');
}

// ── MESSAGE HANDLER ──
function handleMessage(msg) {
  switch (msg.type) {
    case 'ROOM_CREATED':
      myPlayerId = msg.playerId;
      myRoomId = msg.roomId;
      myName = msg.name;
      document.getElementById('display-room-code').textContent = msg.roomId;
      document.getElementById('tb-room-code').textContent = `Room: ${msg.roomId}`;
      showScreen('waiting');
      break;

    case 'ROOM_JOINED':
      myPlayerId = msg.playerId;
      myRoomId = msg.roomId;
      myName = msg.name;
      document.getElementById('display-room-code').textContent = msg.roomId;
      document.getElementById('tb-room-code').textContent = `Room: ${msg.roomId}`;
      showScreen('waiting');
      break;

    case 'LOBBY_UPDATE':
      hostId = msg.host;
      renderLobby(msg.players);
      break;

    case 'GAME_STARTED':
      showScreen('game');
      addSystemChat(msg.isRestart ? 'Game restarted!' : 'Game started! Good luck!');
      selectedCardIds.clear();
      break;

    case 'GAME_STATE':
      gameState = msg.state;
      renderGame();
      break;

    case 'ACTION':
      handleAction(msg);
      break;

    case 'CHAT':
      addChat(msg.name, msg.message);
      break;

    case 'GAME_OVER':
      showGameOver(msg);
      break;

    case 'PLAYER_LEFT':
      addSystemChat(`${msg.name} left the game`);
      break;

    case 'ERROR':
      showToast(msg.message, 'error');
      break;
  }
}

function handleAction(msg) {
  const actionTexts = {
    DRAW_CLOSED: `${msg.playerName} drew from the closed pile`,
    TAKE_OPEN: `${msg.playerName} took ${msg.count || 'all'} cards from the open pile`,
    OPEN_SEQUENCE: `${msg.playerName} opened a new sequence!`,
    ADD_TO_SEQUENCE: `${msg.playerName} added to a sequence`,
    DISCARD: `${msg.playerName} discarded a card`,
    PUT: `🔁 ${msg.playerName} PUT! +50 points (${msg.bukharasLeft} bukharas left)`
  };
  const text = actionTexts[msg.action] || msg.action;
  addSystemChat(text);
  if (msg.action === 'PUT') showToast(`${msg.playerName} PUT! +50 points`, 'success');
}

// ── LOBBY ACTIONS ──
function createRoom() {
  const name = document.getElementById('create-name').value.trim();
  if (!name) { showError('Enter your name'); return; }
  connect(() => send({ type: 'CREATE_ROOM', name }));
}

function joinRoom() {
  const name = document.getElementById('join-name').value.trim();
  const code = document.getElementById('join-code').value.trim().toUpperCase();
  if (!name) { showError('Enter your name'); return; }
  if (!code) { showError('Enter room code'); return; }
  connect(() => send({ type: 'JOIN_ROOM', name, roomId: code }));
}

function startGame() { send({ type: 'START_GAME' }); }
function restartGame() { send({ type: 'RESTART_GAME' }); closeGameOver(); }

function copyRoomLink() {
  const url = `${location.origin}?room=${myRoomId}`;
  navigator.clipboard.writeText(url).then(() => showToast('Link copied! Share with friends', 'success'));
}

// ── LOBBY RENDER ──
function renderLobby(players) {
  const list = document.getElementById('player-list');
  const taPreview = document.getElementById('team-a-preview');
  const tbPreview = document.getElementById('team-b-preview');
  list.innerHTML = '';
  taPreview.innerHTML = '';
  tbPreview.innerHTML = '';

  players.forEach((p, i) => {
    const team = i % 2 === 0 ? 'A' : 'B';
    const div = document.createElement('div');
    div.className = `player-item team-${team.toLowerCase()}`;
    div.innerHTML = `
      <div class="player-num">${i + 1}</div>
      <div class="player-name">${escHtml(p.name)}</div>
      ${p.id === hostId ? '<span class="host-badge">Host</span>' : ''}
    `;
    list.appendChild(div);

    const m = document.createElement('div');
    m.className = 'tp-member';
    m.textContent = `${i + 1}. ${p.name}`;
    (team === 'A' ? taPreview : tbPreview).appendChild(m);
  });

  const hint = document.getElementById('waiting-hint');
  const btnStart = document.getElementById('btn-start');
  const isHost = myPlayerId === hostId;
  const enough = players.length >= 4 && players.length % 2 === 0;

  if (!enough) {
    hint.textContent = `Need at least 4 players (even number). ${players.length} joined.`;
    hint.style.display = 'block';
    btnStart.style.display = 'none';
  } else if (isHost) {
    hint.style.display = 'none';
    btnStart.style.display = 'inline-block';
  } else {
    hint.textContent = `${players.length} players ready. Waiting for host to start...`;
    hint.style.display = 'block';
    btnStart.style.display = 'none';
  }
}

// ── GAME RENDER ──
function renderGame() {
  if (!gameState) return;

  const isMyTurn = gameState.currentPlayer?.id === myPlayerId;
  myTeam = gameState.teams.A.members.includes(myPlayerId) ? 'A' : 'B';

  // Topbar
  const turnEl = document.getElementById('tb-turn');
  if (isMyTurn) {
    turnEl.textContent = gameState.hasDrawn ? 'Your turn — Play cards or Discard' : 'Your turn — Draw a card';
    turnEl.className = 'tb-turn my-turn';
  } else {
    turnEl.textContent = `${gameState.currentPlayer?.id === myPlayerId ? 'Your' : playerName(gameState.currentPlayer?.id)}'s turn`;
    turnEl.className = 'tb-turn';
    const cp = gameState.players.find(p => p.id === gameState.currentPlayer?.id);
    turnEl.textContent = `${cp ? escHtml(cp.name) : '?'}'s turn`;
  }

  document.getElementById('tb-closed-count').textContent = gameState.closedPileCount;
  document.getElementById('tb-bukharas').textContent = gameState.bukharasLeft;

  // Opponents
  renderOpponents();

  // Piles
  renderPiles();

  // Sequences
  renderSequences('A');
  renderSequences('B');

  // Hand
  renderHand();

  // Buttons
  updateButtons();
}

function renderOpponents() {
  const row = document.getElementById('opponents-row');
  row.innerHTML = '';
  if (!gameState) return;

  gameState.players.forEach((p, i) => {
    if (p.id === myPlayerId) return;
    const team = gameState.teams.A.members.includes(p.id) ? 'A' : 'B';
    const isCurrent = gameState.currentPlayer?.id === p.id;
    const count = gameState.playerHandCounts[p.id] || 0;
    const chip = document.createElement('div');
    chip.className = `opponent-chip team-${team.toLowerCase()} ${isCurrent ? 'current-turn' : ''}`;
    chip.innerHTML = `<span class="opp-name">${escHtml(p.name)}</span><span class="opp-count">${count} cards</span>${team === myTeam ? ' 🤝' : ''}`;
    row.appendChild(chip);
  });
}

function renderPiles() {
  if (!gameState) return;

  // Closed pile
  const closedEl = document.getElementById('closed-pile');
  const countEl = document.getElementById('closed-count');
  countEl.textContent = gameState.closedPileCount;
  closedEl.style.opacity = gameState.closedPileCount > 0 ? '1' : '0.3';
  closedEl.style.cursor = gameState.closedPileCount > 0 ? 'pointer' : 'not-allowed';

  // Open pile
  const openContainer = document.getElementById('open-pile-cards');
  openContainer.innerHTML = '';
  const openCount = document.getElementById('open-count');
  const pile = gameState.openPile || [];
  openCount.textContent = `${pile.length} card${pile.length !== 1 ? 's' : ''}`;

  if (pile.length === 0) {
    openContainer.innerHTML = '<div class="pile-empty">Empty</div>';
  } else {
    // Show ALL cards as a scrollable row — most recent on the right
    pile.forEach((card) => {
      const el = buildCard(card);
      el.style.pointerEvents = 'none';
      openContainer.appendChild(el);
    });
    setTimeout(() => { openContainer.scrollLeft = openContainer.scrollWidth; }, 0);
  }
}

function renderSequences(team) {
  const seqList = document.getElementById(`seq-list-${team.toLowerCase()}`);
  seqList.innerHTML = '';
  const seqs = gameState?.teams[team]?.sequences || [];

  if (seqs.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'seq-empty';
    empty.textContent = 'No sequences yet';
    seqList.appendChild(empty);
    return;
  }

  const RANK_VALUE = { 'A': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13 };
  const isMyTeam = team === myTeam;

  // Group sequences by suit so same-suit sequences sit side by side.
  const SUIT_ORDER = { '♠': 0, '♥': 1, '♦': 2, '♣': 3 };
  const seqSuit = (seq) => (seq.cards.find(c => c.rank !== '2') || {}).suit || '';
  const orderedSeqs = [...seqs].sort((a, b) =>
    (SUIT_ORDER[seqSuit(a)] ?? 9) - (SUIT_ORDER[seqSuit(b)] ?? 9)
  );

  orderedSeqs.forEach(seq => {
    const v = seq.validation || {};
    const isPure = v.pure;
    const isAK = v.isAK;
    const len = v.length || seq.cards.length;

    const row = document.createElement('div');
    row.className = `sequence-row ${isPure ? 'pure' : 'impure'} ${isMyTeam ? 'my-team' : ''}`;
    if (isMyTeam) row.onclick = () => handleSequenceClick(seq.id, team);

    // Compact badge text so the column stays card-width.
    let badgeText = isPure ? 'PURE' : 'IMP';
    let badgeClass = isPure ? 'pure' : 'impure';
    if (isAK) { badgeText = 'AK⭐'; badgeClass = 'ak'; }
    if (len >= 7 && isPure) badgeText = `7+⭐`;

    const header = document.createElement('div');
    header.innerHTML = `<span class="seq-badge ${badgeClass}">${badgeText}</span><span class="seq-len">${len}</span>`;
    header.className = 'seq-header';
    row.appendChild(header);

    // Sort cards: get non-jokers, sort by value, then insert joker at correct position
    const nonJokers = seq.cards.filter(c => c.rank !== '2');
    const joker = seq.cards.find(c => c.rank === '2');
    
    // Check if we have both K and A - if so, treat A as 14
    const hasK = nonJokers.some(c => c.rank === 'K');
    const hasA = nonJokers.some(c => c.rank === 'A');
    const treatAAs14 = hasK && hasA;
    
    // Sort non-jokers
    let sortedCards = nonJokers.sort((a, b) => {
      let aVal = RANK_VALUE[a.rank];
      let bVal = RANK_VALUE[b.rank];
      // Treat A as 14 if K is present
      if (treatAAs14) {
        if (a.rank === 'A') aVal = 14;
        if (b.rank === 'A') bVal = 14;
      }
      return aVal - bVal;
    });
    
    // If there's a joker, find its position and insert it
    if (joker && v.jokerValue !== undefined && v.jokerValue !== null) {
      const jokerPos = v.jokerValue;
      // Find where to insert the joker (before the first card with value > jokerPos)
      let insertIdx = sortedCards.length;
      for (let i = 0; i < sortedCards.length; i++) {
        let cardVal = RANK_VALUE[sortedCards[i].rank];
        if (treatAAs14 && sortedCards[i].rank === 'A') cardVal = 14;
        if (cardVal > jokerPos) {
          insertIdx = i;
          break;
        }
      }
      sortedCards.splice(insertIdx, 0, joker);
    } else if (joker) {
      sortedCards.push(joker);
    }

    // Render cards vertically stacked
    const cardsCol = document.createElement('div');
    cardsCol.className = 'seq-cards-col';
    sortedCards.forEach(card => {
      const cardEl = buildCard(card);
      cardEl.classList.add('seq-card');
      cardEl.style.pointerEvents = 'none';
      cardsCol.appendChild(cardEl);
    });
    row.appendChild(cardsCol);
    seqList.appendChild(row);
  });
}

function renderHand() {
  const hand = gameState?.myHand || [];
  const container = document.getElementById('hand-cards');
  container.innerHTML = '';
  document.getElementById('hand-count').textContent = hand.length;

  const toRender = handSorted ? sortCards([...hand]) : hand;

  toRender.forEach(card => {
    const el = buildCard(card);
    if (selectedCardIds.has(card.id)) el.classList.add('selected');
    el.onclick = () => toggleCardSelect(card.id);
    container.appendChild(el);
  });
}

// ── CARD BUILDERS ──
function buildCard(card) {
  const el = document.createElement('div');
  const colorClass = SUIT_COLOR[card.suit] || 'black';
  // 2s (jokers) render exactly like a normal card — no special styling.
  el.className = `card ${colorClass}`;
  el.dataset.cardId = card.id;

  // Render every card (including 2s) the same way — suit symbol in the middle.
  el.innerHTML = `
    <div class="card-rank-top">${card.rank}<br>${card.suit}</div>
    <div class="card-suit-mid">${card.suit}</div>
    <div class="card-rank-bot">${card.rank}<br>${card.suit}</div>
  `;
  return el;
}

function buildCardMini(card) {
  const el = document.createElement('div');
  const colorClass = SUIT_COLOR[card.suit] || 'black';
  el.className = `card-mini ${colorClass}`;
  el.innerHTML = `<span>${card.rank}</span><span>${card.suit}</span>`;
  return el;
}

// ── INTERACTIONS ──
function toggleCardSelect(cardId) {
  const isMyTurn = gameState?.currentPlayer?.id === myPlayerId;
  if (!isMyTurn || !gameState?.hasDrawn) {
    showToast(isMyTurn ? 'Draw a card first' : 'Wait for your turn', 'error');
    return;
  }
  if (selectedCardIds.has(cardId)) selectedCardIds.delete(cardId);
  else selectedCardIds.add(cardId);
  renderHand();
  updateButtons();
  updateSelectionHint();
}

function updateSelectionHint() {
  const hint = document.getElementById('selection-hint');
  const count = selectedCardIds.size;
  if (count === 0) hint.textContent = 'Select cards from your hand to play';
  else if (count === 1) hint.textContent = '1 card selected — open sequence (need 2+ more), add to existing, or discard';
  else hint.textContent = `${count} cards selected — open sequence or add to existing`;
}

function updateButtons() {
  const isMyTurn = gameState?.currentPlayer?.id === myPlayerId;
  const hasDrawn = gameState?.hasDrawn;
  const hand = gameState?.myHand || [];
  const team = myTeam;
  const teamData = gameState?.teams?.[team];
  const eligibleForPut = teamData?.eligibleForPut;

  const btnOpenSeq = document.getElementById('btn-open-seq');
  const btnDiscard = document.getElementById('btn-discard');
  const btnPut = document.getElementById('btn-put');

  btnOpenSeq.disabled = !isMyTurn || !hasDrawn || selectedCardIds.size < 3;
  btnDiscard.disabled = !isMyTurn || !hasDrawn || selectedCardIds.size !== 1;
  btnPut.disabled = !isMyTurn || !hasDrawn || selectedCardIds.size !== 1 || hand.length !== 1 || !eligibleForPut;
}

function clearSelection() { selectedCardIds.clear(); renderHand(); updateButtons(); updateSelectionHint(); }
function selectAll() {
  const hand = gameState?.myHand || [];
  hand.forEach(c => selectedCardIds.add(c.id));
  renderHand(); updateButtons(); updateSelectionHint();
}
function sortHand() { handSorted = !handSorted; renderHand(); }

function sortCards(cards) {
  const RANK_ORDER = { 'A': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13 };
  const SUIT_ORDER = { '♠': 0, '♥': 1, '♦': 2, '♣': 3 };
  
  // Check if hand has both K and A - if so, treat A as 14
  const hasK = cards.some(c => c.rank === 'K');
  const hasA = cards.some(c => c.rank === 'A');
  const treatAAs14 = hasK && hasA;
  
  return cards.sort((a, b) => {
    const sd = SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit];
    if (sd !== 0) return sd;
    
    let aVal = RANK_ORDER[a.rank];
    let bVal = RANK_ORDER[b.rank];
    
    if (treatAAs14) {
      if (a.rank === 'A') aVal = 14;
      if (b.rank === 'A') bVal = 14;
    }
    
    return aVal - bVal;
  });
}

function drawClosed() {
  const isMyTurn = gameState?.currentPlayer?.id === myPlayerId;
  if (!isMyTurn) { showToast('Not your turn', 'error'); return; }
  if (gameState?.hasDrawn) { showToast('Already drew this turn', 'error'); return; }
  send({ type: 'DRAW_CLOSED' });
}

function takeOpenPile() {
  const isMyTurn = gameState?.currentPlayer?.id === myPlayerId;
  if (!isMyTurn) { showToast('Not your turn', 'error'); return; }
  if (gameState?.hasDrawn) { showToast('Already drew this turn', 'error'); return; }
  if (!gameState?.openPile?.length) { showToast('Open pile is empty', 'error'); return; }
  send({ type: 'TAKE_OPEN' });
}

function openNewSequence() {
  if (selectedCardIds.size < 3) { showToast('Select at least 3 cards', 'error'); return; }
  send({ type: 'OPEN_SEQUENCE', cardIds: [...selectedCardIds] });
  clearSelection();
}

function handleSequenceClick(seqId, team) {
  const isMyTurn = gameState?.currentPlayer?.id === myPlayerId;
  if (!isMyTurn || !gameState?.hasDrawn) return;
  if (selectedCardIds.size === 0) { showToast('Select cards to add first', 'error'); return; }
  if (team !== myTeam) { showToast("Can't add to opponent team sequences", 'error'); return; }

  // Add selected cards to this sequence
  send({ type: 'ADD_TO_SEQUENCE', seqId, cardIds: [...selectedCardIds] });
  clearSelection();
}

function discardSelected(isPut) {
  if (selectedCardIds.size !== 1) { showToast('Select exactly 1 card to discard', 'error'); return; }
  const cardId = [...selectedCardIds][0];

  if (isPut) {
    const hand = gameState?.myHand || [];
    if (hand.length !== 1) { showToast('Can only PUT when this is your last card', 'error'); return; }
    const team = myTeam;
    if (!gameState?.teams?.[team]?.eligibleForPut) {
      showToast('Not eligible for PUT — need 7-card pure or A-K sequence', 'error'); return;
    }
    if (!confirm('PUT? This will flip your last card and get a new set of 13 cards.')) return;
  }

  send({ type: 'DISCARD', cardId, isPut });
  clearSelection();
}

// ── CHAT ──
function toggleChat() {
  chatOpen = !chatOpen;
  document.getElementById('chat-panel').classList.toggle('collapsed', !chatOpen);
}

function sendChat() {
  const input = document.getElementById('chat-input');
  const msg = input.value.trim();
  if (!msg) return;
  send({ type: 'CHAT', message: msg });
  input.value = '';
}

function addChat(name, message) {
  const container = document.getElementById('chat-messages');
  const div = document.createElement('div');
  div.className = 'chat-msg';
  div.innerHTML = `<div class="chat-name">${escHtml(name)}</div><div>${escHtml(message)}</div>`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function addSystemChat(message) {
  const container = document.getElementById('chat-messages');
  const div = document.createElement('div');
  div.className = 'chat-msg system';
  div.textContent = message;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

// ── GAME OVER ──
function showGameOver(msg) {
  const overlay = document.getElementById('modal-gameover');
  const title = document.getElementById('go-title');
  const desc = document.getElementById('go-desc');
  const btnRestart = document.getElementById('btn-restart');

  const winTeam = msg.winnerTeam;
  const isMyTeam = winTeam === myTeam;
  title.textContent = isMyTeam ? '🎉 Your Team Wins!' : '😔 Opponent Wins';
  desc.innerHTML = `<strong>${escHtml(msg.winnerName)}</strong> ${msg.reason === 'put' ? 'PUT and won the game!' : 'ended the game.'}<br>Team ${winTeam} wins!`;

  btnRestart.style.display = myPlayerId === hostId ? 'inline-block' : 'none';
  overlay.style.display = 'flex';
}

function closeGameOver() { document.getElementById('modal-gameover').style.display = 'none'; }
function closeModal() { document.getElementById('modal-add').style.display = 'none'; }

// ── UTILS ──
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(`screen-${name}`).classList.add('active');
}

function showError(msg) {
  document.getElementById('lobby-error').textContent = msg;
  setTimeout(() => document.getElementById('lobby-error').textContent = '', 3000);
}

let toastTimer = null;
function showToast(message, type = '') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast show ${type}`;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
}

function playerName(id) {
  const p = gameState?.players?.find(p => p.id === id);
  return p ? p.name : 'Unknown';
}

function escHtml(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
