// Rounds and the match: a buy phase, a live round, a short end banner, and a
// match to 5 rounds (at most 9). This module owns the clock, the score and the
// difficulty curve; main.js owns what happens on each event (spawning, money,
// the banner). A round ends by elimination, by the bomb, by a defuse, or by
// the clock running out with no plant.
//
// Difficulty grows as the match goes on, so the challenge keeps rising:
// - from round 3 a fifth defender joins the UMBRA team;
// - defenders react a little faster and shoot a little truer every round;
// - every third round is a SURGE round: defenders move faster and press
//   harder, and the HUD says so.
export const BUY_TIME = 12;
export const ROUND_TIME = 100;
export const END_TIME = 5;
export const WIN_ROUNDS = 5;
export const MAX_ROUNDS = 9;

export function difficultyFor(round) {
  const index = Math.max(0, round - 1);
  return {
    // A fifth defender joins from round 3 on.
    defenderCount: round >= 3 ? 5 : 4,
    // Reaction time shrinks ~4% a round (floored at 70% of base).
    reactionScale: Math.max(0.7, 1 - index * 0.04),
    // Bot skill rises ~0.02 a round (capped at 0.95).
    skillBonus: Math.min(0.23, index * 0.02),
    // Every third round is a SURGE round: defenders move 15% faster.
    surge: round % 3 === 0,
    surgeSpeed: round % 3 === 0 ? 1.15 : 1,
  };
}

export function createRounds() {
  const state = {
    phase: 'menu', // menu | buy | live | end | matchEnd
    round: 0,
    scoreV: 0,
    scoreE: 0,
    timer: 0,
    reason: '',
    winner: null,
    matchWinner: null,
  };

  return {
    state,
    startMatch() {
      state.phase = 'buy';
      state.round = 0;
      state.scoreV = 0;
      state.scoreE = 0;
      state.timer = BUY_TIME;
      state.reason = '';
      state.winner = null;
      state.matchWinner = null;
    },
    startRound() {
      state.round += 1;
      state.phase = 'buy';
      state.timer = BUY_TIME;
      state.reason = '';
      state.winner = null;
    },
    beginLive() {
      state.phase = 'live';
      state.timer = ROUND_TIME;
    },
    endRound(winner, reason) {
      if (state.phase === 'end' || state.phase === 'matchEnd') return false;
      state.phase = 'end';
      state.timer = END_TIME;
      state.winner = winner;
      state.reason = reason;
      if (winner === 'ORBIT') state.scoreV += 1;
      else state.scoreE += 1;
      return true;
    },
    endMatch() {
      state.phase = 'matchEnd';
      state.matchWinner = state.scoreV > state.scoreE ? 'ORBIT' : 'UMBRA';
      state.timer = 0;
    },
    matchOver() {
      return (
        state.scoreV >= WIN_ROUNDS ||
        state.scoreE >= WIN_ROUNDS ||
        state.round >= MAX_ROUNDS
      );
    },
    step(dt) {
      if (state.phase === 'buy' || state.phase === 'live' || state.phase === 'end') {
        state.timer -= dt;
      }
      return state.timer;
    },
  };
}
