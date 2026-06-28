// game.js - Core Bukharo game logic

const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const RANK_VALUES = { 'A': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13 };

function createDeck(deckIndex = 0) {
  const cards = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      cards.push({ rank, suit, id: `${rank}${suit}_${deckIndex}` });
    }
  }
  return cards;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function createGameDeck(numDecks) {
  let all = [];
  for (let i = 0; i < numDecks; i++) all = all.concat(createDeck(i));
  return shuffle(all);
}

function isJoker(card) {
  return card.rank === '2';
}

// Check if a set of cards forms a valid sequence
// Returns { valid, pure, length, jokerValue }
function validateSequence(cards) {
  if (!cards || cards.length < 3) return { valid: false };

  const jokerCount = cards.filter(isJoker).length;
  if (jokerCount > 1) return { valid: false }; // max one 2 in a sequence

  const nonJokers = cards.filter(c => !isJoker(c));
  if (nonJokers.length === 0) return { valid: false };

  // All non-jokers must be same suit
  const suit = nonJokers[0].suit;
  if (!nonJokers.every(c => c.suit === suit)) return { valid: false };

  // Check for duplicate ranks (can't have same rank twice)
  const ranks = nonJokers.map(c => c.rank);
  if (ranks.length !== new Set(ranks).size) {
    return { valid: false }; // has duplicate ranks
  }

  // Get card values
  let values = nonJokers.map(c => RANK_VALUES[c.rank]);
  
  // Reject sequences with A (1) and 2 (joker) and 3 as first 3 cards
  // A,2,3 is only valid if it's a full A-K wrap sequence
  if (values.includes(1) && jokerCount === 1 && values.includes(3)) {
    // Has A (1), joker (2), and 3 - only valid if it's the full 13-card sequence
    if (cards.length + jokerCount !== 13) {
      return { valid: false };
    }
  }

  // Check if we have K (13) and A (1), if so, treat A as 14 for this check
  const hasK = values.includes(13);
  const hasA = values.includes(1);
  if (hasK && hasA && (values.length + jokerCount) >= 3) {
    values = values.map(v => v === 1 ? 14 : v);
  }
  
  values.sort((a, b) => a - b);
  
  // Check for A-K sequence (special: A=1, 2,3,...,K=13)
  if (values.length + jokerCount === 13) {
    const allValues = new Set([1,2,3,4,5,6,7,8,9,10,11,12,13]);
    const presentValues = new Set(values.map(v => v === 14 ? 1 : v));
    const missing = [...allValues].filter(v => !presentValues.has(v));
    if (missing.length === jokerCount) {
      const jokerCard = cards.find(isJoker);
      let pure = true;
      if (jokerCount === 1) {
        if (!missing.includes(2)) pure = false;
        else if (jokerCard && jokerCard.suit !== suit) pure = false;
        else pure = true;
      }
      return { valid: true, pure, length: 13, isAK: true, jokerValue: missing[0] };
    }
  }

  // Normal sequence check
  const min = values[0];
  const max = values[values.length - 1];
  const totalSpan = max - min + 1;
  const gapsFilled = totalSpan - values.length;

  if (gapsFilled > jokerCount) return { valid: false };
  
  let jokerValue = null;
  if (gapsFilled < jokerCount) {
    const jokerCard = cards.find(isJoker);
    const seqLen = values.length + jokerCount;
    let pure = true;
    if (jokerCount === 1) {
      const edgePositions = [min - 1, max + 1].filter(v => v >= 1 && v <= 13);
      const jokerIsAt2 = edgePositions.includes(2) && jokerCard.suit === suit;
      if (!jokerIsAt2) pure = false;
      jokerValue = min - 1;
    }
    return { valid: true, pure, length: seqLen, jokerValue };
  }

  if (jokerCount === 0) {
    return { valid: true, pure: true, length: values.length };
  }

  // Has a joker filling an internal gap
  const jokerCard = cards.find(isJoker);
  const missingVal = [];
  for (let v = min; v <= max; v++) {
    if (!values.includes(v)) missingVal.push(v);
  }
  
  if (missingVal.length === 1) {
    jokerValue = missingVal[0];
  }
  
  const pure = missingVal.length === 1 && missingVal[0] === 2 && jokerCard.suit === suit;
  return { valid: true, pure, length: values.length + jokerCount, jokerValue };
}

// Check if a joker (2) in a sequence can be moved (replaced by real card)
function canMoveJoker(sequence, newCard) {
  if (newCard.rank === '2') return false;
  const jokerIdx = sequence.cards.findIndex(isJoker);
  if (jokerIdx === -1) return false;

  const jokerInSequence = sequence.cards[jokerIdx];
  const nonJokers = sequence.cards.filter(c => !isJoker(c));
  const suit = nonJokers[0]?.suit;
  if (!suit || newCard.suit !== suit) return false;
  // Off-suit joker (e.g. 2♠ in a hearts run) is locked and cannot be moved.
  if (jokerInSequence.suit !== suit) return false;

  // What value does the joker represent?
  const values = nonJokers.map(c => RANK_VALUES[c.rank]).sort((a, b) => a - b);
  const min = values[0];
  const max = values[values.length - 1];
  const totalExpected = max - min + 1;

  let jokerValue = null;
  if (totalExpected > values.length) {
    // Internal gap
    for (let v = min; v <= max; v++) {
      if (!values.includes(v)) { jokerValue = v; break; }
    }
  } else {
    // Edge - joker at top or bottom
    // Check which position the new card would fit
    const newVal = RANK_VALUES[newCard.rank];
    if (newVal === min - 1 || newVal === max + 1) {
      // newCard extends the sequence, joker moves to other edge
      jokerValue = newVal < min ? max + 1 : min - 1;
    }
    return newVal === min - 1 || newVal === max + 1 ? { canMove: true, jokerValue } : { canMove: false };
  }

  if (RANK_VALUES[newCard.rank] === jokerValue) {
    return { canMove: true, jokerValue };
  }
  return { canMove: false };
}

// Check team eligibility for "put" action
function isEligibleForPut(teamSequences) {
  const sevenPure = teamSequences.some(s => {
    const v = validateSequence(s.cards);
    return v.valid && v.pure && v.length >= 7;
  });
  const ak = teamSequences.some(s => {
    const v = validateSequence(s.cards);
    return v.valid && v.isAK;
  });
  return sevenPure || ak;
}

// Check if there's at least one pure sequence among team sequences
function hasPureSequence(teamSequences) {
  return teamSequences.some(s => {
    const v = validateSequence(s.cards);
    return v.valid && v.pure;
  });
}

class BukharoGame {
  constructor(roomId, players) {
    this.roomId = roomId;
    this.players = players; // [{id, name}]
    this.numPlayers = players.length;
    // Ensure enough cards for players + 4 bukharas + at least 14 centre cards
    this.numDecks = Math.max(
      Math.ceil(this.numPlayers / 2),
      Math.ceil((this.numPlayers * 13 + 4 * 13 + 14) / 52)
    );
    this.phase = 'playing'; // 'playing' | 'ended'
    this.winner = null;
    this.winnerTeam = null;

    // Teams: 0, 2, 4 are team A; 1, 3, 5 are team B
    this.teams = {
      A: { sequences: [], members: [] },
      B: { sequences: [], members: [] }
    };
    players.forEach((p, i) => {
      const team = i % 2 === 0 ? 'A' : 'B';
      this.teams[team].members.push(p.id);
    });

    this.hands = {}; // playerId -> cards[]
    this.bukharas = []; // array of 13-card groups
    this.closedPile = []; // face-down draw pile
    this.openPile = []; // face-up discard pile
    this.currentPlayerIdx = 0;
    this.hasDrawn = false; // current player has drawn this turn

    this._deal();
  }

  _deal() {
    const totalCards = this.numDecks * 52;
    const deck = createGameDeck(this.numDecks);

    // Deal 13 cards to each player
    let idx = 0;
    for (const p of this.players) {
      this.hands[p.id] = deck.slice(idx, idx + 13);
      idx += 13;
    }

    // 4 bukhara groups of 13
    const numBukharas = 4;
    for (let i = 0; i < numBukharas; i++) {
      this.bukharas.push(deck.slice(idx, idx + 13));
      idx += 13;
    }

    // Remaining cards: closed pile (with one open)
    const remaining = deck.slice(idx);
    if (remaining.length > 0) {
      this.openPile = [remaining[0]];
      this.closedPile = remaining.slice(1);
    } else {
      this.openPile = [];
      this.closedPile = [];
    }
  }

  get currentPlayer() {
    return this.players[this.currentPlayerIdx];
  }

  getTeamOf(playerId) {
    if (this.teams.A.members.includes(playerId)) return 'A';
    if (this.teams.B.members.includes(playerId)) return 'B';
    return null;
  }

  // Draw from closed pile
  drawFromClosed(playerId) {
    if (this.currentPlayer.id !== playerId) return { error: 'Not your turn' };
    if (this.hasDrawn) return { error: 'Already drew this turn' };
    if (this.closedPile.length === 0) return { error: 'No cards in closed pile' };

    const card = this.closedPile.pop();
    this.hands[playerId].push(card);
    this.hasDrawn = true;
    return { success: true, card };
  }

  // Take all cards from open pile
  takeOpenPile(playerId) {
    if (this.currentPlayer.id !== playerId) return { error: 'Not your turn' };
    if (this.hasDrawn) return { error: 'Already drew this turn' };
    if (this.openPile.length === 0) return { error: 'Open pile is empty' };

    const cards = [...this.openPile];
    this.hands[playerId].push(...cards);
    this.openPile = [];
    this.hasDrawn = true;
    return { success: true, cards };
  }

  // Open a new sequence for the team (minimum 3 cards)
  openSequence(playerId, cardIds) {
    if (this.currentPlayer.id !== playerId) return { error: 'Not your turn' };
    if (!this.hasDrawn) return { error: 'Draw a card first' };

    const team = this.getTeamOf(playerId);
    const hand = this.hands[playerId];
    const cards = cardIds.map(id => hand.find(c => c.id === id)).filter(Boolean);

    if (cards.length !== cardIds.length) return { error: 'Invalid cards' };
    if (cards.length < 3) return { error: 'Need at least 3 cards to open a sequence' };

    const validation = validateSequence(cards);
    if (!validation.valid) return { error: 'Invalid sequence' };

    // Check pure sequence constraint
    const teamSeqs = this.teams[team].sequences;
    const tempSeqs = [...teamSeqs, { cards, id: Date.now() }];
    if (!hasPureSequence(tempSeqs)) return { error: 'Team must always have at least one pure sequence' };

    // Remove cards from hand
    const usedIds = new Set(cardIds);
    this.hands[playerId] = hand.filter(c => !usedIds.has(c.id));

    const seqId = `seq_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    this.teams[team].sequences.push({ id: seqId, cards, openedBy: playerId });

    return { success: true, seqId, validation };
  }

  // Add cards to existing team sequence
  addToSequence(playerId, seqId, cardIds, positions) {
    if (this.currentPlayer.id !== playerId) return { error: 'Not your turn' };
    if (!this.hasDrawn) return { error: 'Draw a card first' };

    const team = this.getTeamOf(playerId);
    const seq = this.teams[team].sequences.find(s => s.id === seqId);
    if (!seq) return { error: 'Sequence not found' };

    const hand = this.hands[playerId];
    const cards = cardIds.map(id => hand.find(c => c.id === id)).filter(Boolean);
    if (cards.length !== cardIds.length) return { error: 'Invalid cards' };

    // Check for duplicate card ranks in the same sequence
    const existingRanks = new Set(seq.cards.filter(c => c.rank !== '2').map(c => c.rank));
    for (const card of cards) {
      if (card.rank !== '2' && existingRanks.has(card.rank)) {
        return { error: `Cannot add duplicate ${card.rank} to this sequence` };
      }
    }

    // Try adding cards (at start or end, or replacing joker)
    let newCards = [...seq.cards];
    for (const card of cards) {
      const jokerIdx = newCards.findIndex(isJoker);
      const nonJokers = newCards.filter(c => !isJoker(c));
      const suit = nonJokers[0]?.suit;

      // A joker (2) can only be moved/replaced when it is the SAME suit as the
      // sequence (a "pure" joker). An off-suit 2 (e.g. 2♠ inside a hearts run)
      // is locked: it permanently represents one fixed value, so it can never be
      // replaced and the run cannot be re-interpreted to shift its value.
      const jokerSuitMatches = jokerIdx !== -1 && newCards[jokerIdx].suit === suit;

      if (jokerIdx !== -1 && !jokerSuitMatches) {
        // Off-suit (locked) joker. Determine the value it currently stands for
        // and only accept additions that keep that exact value (joker stays put).
        const lockedValue = validateSequence(newCards).jokerValue;
        if (lockedValue == null) {
          return { error: `Cannot add ${card.rank}${card.suit} to this sequence` };
        }
        const testStart = [card, ...newCards];
        const testEnd = [...newCards, card];
        const vStart = validateSequence(testStart);
        const vEnd = validateSequence(testEnd);
        if (vStart.valid && vStart.jokerValue === lockedValue) {
          newCards = testStart;
        } else if (vEnd.valid && vEnd.jokerValue === lockedValue) {
          newCards = testEnd;
        } else {
          return { error: `Cannot add ${card.rank}${card.suit} to this sequence` };
        }
        continue;
      }

      // Try to replace joker if card matches joker's position
      if (jokerIdx !== -1 && suit && card.suit === suit && jokerSuitMatches) {
        const nonJokerValues = nonJokers.map(c => RANK_VALUES[c.rank]).sort((a, b) => a - b);
        const min = nonJokerValues[0];
        const max = nonJokerValues[nonJokerValues.length - 1];
        const newVal = RANK_VALUES[card.rank];
        
        // Check if card can replace joker (fill internal gap or extend edge)
        let canReplace = false;
        let resultCards = null;
        
        if (nonJokerValues.length + 1 === max - min + 1) {
          // Joker is filling a single internal gap or at edge
          const totalSpan = max - min + 1;
          if (totalSpan === nonJokerValues.length + 1) {
            // Check if new card fills a gap
            for (let v = min; v <= max; v++) {
              if (!nonJokerValues.includes(v) && v === newVal) {
                // Card fills the gap
                canReplace = true;
                resultCards = newCards.filter((_, i) => i !== jokerIdx);
                // Insert card in proper position
                let insertPos = 0;
                for (let i = 0; i < resultCards.length; i++) {
                  if (RANK_VALUES[resultCards[i].rank] < newVal) insertPos = i + 1;
                }
                resultCards.splice(insertPos, 0, card);
                // Now try to add joker back at edge
                const vals = resultCards.filter(c => !isJoker(c)).map(c => RANK_VALUES[c.rank]).sort((a,b)=>a-b);
                const minV = vals[0];
                const maxV = vals[vals.length - 1];
                const jokerCard = newCards[jokerIdx];
                if (minV - 1 >= 1) {
                  resultCards.unshift(jokerCard);
                } else if (maxV + 1 <= 13) {
                  resultCards.push(jokerCard);
                }
                newCards = resultCards;
                break;
              }
            }
          }
        }
        
        if (!canReplace) {
          // Try regular add at start/end
          const testStart = [card, ...newCards];
          const testEnd = [...newCards, card];
          const validStart = validateSequence(testStart);
          const validEnd = validateSequence(testEnd);
          if (validStart.valid) newCards = testStart;
          else if (validEnd.valid) newCards = testEnd;
          else return { error: `Cannot add ${card.rank}${card.suit} to this sequence` };
        }
      } else {
        // No joker or different suit - try adding at start or end
        const testStart = [card, ...newCards];
        const testEnd = [...newCards, card];
        const validStart = validateSequence(testStart);
        const validEnd = validateSequence(testEnd);
        if (validStart.valid) newCards = testStart;
        else if (validEnd.valid) newCards = testEnd;
        else return { error: `Cannot add ${card.rank}${card.suit} to this sequence` };
      }
    }

    const finalValidation = validateSequence(newCards);
    if (!finalValidation.valid) return { error: 'Resulting sequence would be invalid' };

    // Check pure constraint
    const otherSeqs = this.teams[team].sequences.filter(s => s.id !== seqId);
    const tempSeqs = [...otherSeqs, { cards: newCards, id: seqId }];
    if (!hasPureSequence(tempSeqs)) return { error: 'Cannot make all sequences impure' };

    // Update
    const usedIds = new Set(cardIds);
    this.hands[playerId] = hand.filter(c => !usedIds.has(c.id));
    seq.cards = newCards;

    return { success: true, validation: finalValidation };
  }

  // Discard a card to end turn (or "put" = flip + take bukhara)
  discard(playerId, cardId, isPut) {
    if (this.currentPlayer.id !== playerId) return { error: 'Not your turn' };
    if (!this.hasDrawn) return { error: 'Draw a card first' };

    const hand = this.hands[playerId];
    const cardIdx = hand.findIndex(c => c.id === cardId);
    if (cardIdx === -1) return { error: 'Card not in hand' };

    const card = hand[cardIdx];

    if (isPut) {
      // Validate put eligibility
      const team = this.getTeamOf(playerId);
      if (!isEligibleForPut(this.teams[team].sequences)) {
        return { error: 'Not eligible to put. Need a 7-card pure sequence or A-K sequence.' };
      }
      // Must have exactly 1 card left (this card being thrown is the last)
      if (hand.length !== 1) {
        return { error: 'Can only "put" when this is your last card' };
      }

      if (this.bukharas.length === 0) {
        // Game ends!
        this.phase = 'ended';
        this.winnerTeam = team;
        this.winner = playerId;
        // Card goes face-up (flipped) to open pile
        this.hands[playerId] = [];
        this.openPile.push(card);
        return { success: true, put: true, gameOver: true, winnerTeam: team, winner: playerId };
      }

      // Get next bukhara
      const newGroup = this.bukharas.shift();
      this.hands[playerId] = [];
      this.openPile.push(card); // card goes to open pile face-up (flipped)
      // Give player new group
      this.hands[playerId] = newGroup;
      this.hasDrawn = false;
      this._nextTurn();

      return { success: true, put: true, newCards: newGroup, bukharasLeft: this.bukharas.length };
    }

    // Normal discard
    this.hands[playerId].splice(cardIdx, 1);
    this.openPile.push(card);

    // Check if closed pile ran out
    if (this.closedPile.length === 0 && !isPut) {
      this.phase = 'ended';
      return { success: true, gameOver: true, reason: 'Closed pile exhausted' };
    }

    this.hasDrawn = false;
    this._nextTurn();
    return { success: true };
  }

  _nextTurn() {
    this.currentPlayerIdx = (this.currentPlayerIdx + 1) % this.numPlayers;
    this.hasDrawn = false;
  }

  getState(forPlayerId) {
    const state = {
      phase: this.phase,
      currentPlayer: this.currentPlayer,
      currentPlayerIdx: this.currentPlayerIdx,
      hasDrawn: this.hasDrawn,
      teams: {
        A: {
          sequences: this.teams.A.sequences.map(s => ({
            ...s,
            validation: validateSequence(s.cards)
          })),
          members: this.teams.A.members,
          eligibleForPut: isEligibleForPut(this.teams.A.sequences),
          hasPure: hasPureSequence(this.teams.A.sequences)
        },
        B: {
          sequences: this.teams.B.sequences.map(s => ({
            ...s,
            validation: validateSequence(s.cards)
          })),
          members: this.teams.B.members,
          eligibleForPut: isEligibleForPut(this.teams.B.sequences),
          hasPure: hasPureSequence(this.teams.B.sequences)
        }
      },
      openPile: this.openPile,
      closedPileCount: this.closedPile.length,
      bukharasLeft: this.bukharas.length,
      playerHandCounts: {},
      myHand: forPlayerId ? this.hands[forPlayerId] : undefined,
      winner: this.winner,
      winnerTeam: this.winnerTeam,
      players: this.players
    };

    for (const p of this.players) {
      state.playerHandCounts[p.id] = this.hands[p.id]?.length || 0;
    }

    return state;
  }
}

module.exports = { BukharoGame, validateSequence, isJoker, SUITS, RANKS };
