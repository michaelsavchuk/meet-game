// Gameplay tuning in one place.
export const WIDTH = 1280;
export const HEIGHT = 720;

// Area characters roam in, by character position. Leaves room for bubbles under the title
// (~100px above a character) and the name/hearts and lobby buttons below (~75px under one).
export const ARENA = { x: 60, y: 200, width: WIDTH - 120, height: HEIGHT - 355 };
// Characters closer than this get nudged apart so names and bubbles stay readable. Wider than tall
// because word bubbles are.
export const PERSONAL_SPACE = { x: 140, y: 110 };

export const MAX_HP = 3;
export const DAMAGE = 1;

export const WANDER_SPEED = 70;     // px/s while bouncing around
export const CHASE_SPEED = 380;     // px/s while running at a target
export const ATTACK_RANGE = 55;     // how close an attacker gets before swinging
export const CHASE_TIMEOUT = 5000;  // ms; land the hit anyway if a chase drags on

export const CHAT_BUBBLE_MS = 4000; // how long lobby chat stays above a character
