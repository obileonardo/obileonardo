// Hold the Keep: the rules. Pure functions over a plain JSON state, so they can be tested without
// GitHub and the state file stays readable.
//
// The board is 7 by 7, columns A to G and rows 1 to 7. The keep stands at D4 inside a ring of eight
// stones. Visitors make one of three moves, each by opening an issue:
//
//   keep: build C2       lay a stone on open ground next to the castle
//   keep: fire C3        fire the trebuchet at a stone that faces open ground
//   keep: forge iron     add iron, ember or rune to the bellows; every third forges a weapon
//
// A stone with a wall running both across and down from it is a tower. Weapons are mounted on
// towers in reading order and guard their tower and its four neighbours; a shot at a guarded square
// is repelled and costs the weapon a charge. A stone takes two hits, the keep five. When the keep
// falls the age ends, its record goes into the chronicle and a new castle is raised.

export const COLS = 'ABCDEFG';
export const ROWS = 7;
export const KEEP = 'D4';
export const KEEP_HP = 5;
export const STONE_HP = 2;
export const CHARGES = 3;
export const COOLDOWN_MS = 10 * 60 * 1000;
export const MATERIALS = ['iron', 'ember', 'rune'];
const DEEDS_KEPT = 8;
const SEEN_KEPT = 500;

// Every mix of three materials has a name. Keys are the materials sorted alphabetically.
export const WEAPONS = {
  'iron,iron,iron': 'Iron Mace',
  'ember,ember,ember': 'Firebrand',
  'rune,rune,rune': 'Runestaff',
  'ember,iron,iron': 'Forged Sword',
  'iron,iron,rune': 'Warded Shield',
  'ember,ember,iron': 'Burning Axe',
  'ember,ember,rune': 'Wyrmfire Bow',
  'iron,rune,rune': 'Runeblade',
  'ember,rune,rune': 'Starfire Crossbow',
  'ember,iron,rune': 'Crownbreaker',
};

// ---------------------------------------------------------------- coordinates

export const squares = () => {
  const out = [];
  for (let r = 1; r <= ROWS; r++) for (const c of COLS) out.push(`${c}${r}`);
  return out;
};

const at = (sq) => ({ c: COLS.indexOf(sq[0]), r: Number(sq.slice(1)) });
const name = (c, r) => (c >= 0 && c < COLS.length && r >= 1 && r <= ROWS ? `${COLS[c]}${r}` : null);

export function neighbours(sq) {
  const { c, r } = at(sq);
  return { up: name(c, r - 1), down: name(c, r + 1), left: name(c - 1, r), right: name(c + 1, r) };
}

const around = (sq) => Object.values(neighbours(sq));

// ---------------------------------------------------------------- state

export function newAge(age, startedAt, carry = {}) {
  const cells = { [KEEP]: { kind: 'keep', hp: KEEP_HP } };
  for (const sq of ['C3', 'D3', 'E3', 'C4', 'E4', 'C5', 'D5', 'E5']) cells[sq] = { kind: 'stone', hp: STONE_HP };
  return {
    version: 1,
    age,
    startedAt,
    cells,
    bellows: [],
    weapons: [],
    tally: { stones: 0, forged: 0, shots: 0, repelled: 0 },
    players: carry.players ?? {},
    deeds: carry.deeds ?? [],
    ages: carry.ages ?? [],
    seen: carry.seen ?? [],
  };
}

const isStone = (s, sq) => s.cells[sq]?.kind === 'stone';
const isBuilt = (s, sq) => Boolean(sq && s.cells[sq]);

// Open ground reachable from beyond the board. Raiders stand there.
export function outside(s) {
  const seen = new Set();
  const queue = squares().filter((sq) => {
    const { c, r } = at(sq);
    return !isBuilt(s, sq) && (c === 0 || r === 1 || c === COLS.length - 1 || r === ROWS);
  });
  for (const sq of queue) seen.add(sq);
  while (queue.length) {
    for (const n of around(queue.shift())) {
      if (n && !seen.has(n) && !isBuilt(s, n)) {
        seen.add(n);
        queue.push(n);
      }
    }
  }
  return seen;
}

// A built square faces open ground if it sits on the board's edge or next to the outside.
export function exposed(s) {
  const out = outside(s);
  return new Set(
    Object.keys(s.cells).filter((sq) => {
      const { c, r } = at(sq);
      const edge = c === 0 || r === 1 || c === COLS.length - 1 || r === ROWS;
      return edge || around(sq).some((n) => n && out.has(n));
    }),
  );
}

// A tower is a stone with a stone beside it and a stone above or below it.
export function towers(s) {
  return squares().filter((sq) => {
    if (!isStone(s, sq)) return false;
    const n = neighbours(sq);
    return (isStone(s, n.left) || isStone(s, n.right)) && (isStone(s, n.up) || isStone(s, n.down));
  });
}

// A weapon stays on its tower (`at`) while that tower stands; a weapon without one goes to the first
// free tower in reading order. Returns the armed towers (square -> weapon index) and every guarded
// square, the earlier weapon winning where guards overlap.
export function mounts(s) {
  const free = towers(s);
  const armed = new Map();
  s.weapons.forEach((w, i) => {
    if (w.at && free.includes(w.at)) {
      armed.set(w.at, i);
      free.splice(free.indexOf(w.at), 1);
    }
  });
  s.weapons.forEach((w, i) => {
    if (![...armed.values()].includes(i) && free.length) armed.set(free.shift(), i);
  });
  const guard = new Map();
  for (const [sq, i] of armed) {
    for (const g of [sq, ...around(sq)]) if (g && !guard.has(g)) guard.set(g, i);
  }
  return { armed, guard };
}

export const buildable = (s, sq) => !isBuilt(s, sq) && around(sq).some((n) => isBuilt(s, n));

// ---------------------------------------------------------------- moves

// Titles are untrusted input from anyone on GitHub, so only these exact shapes are accepted.
export function parseMove(title) {
  const t = String(title ?? '').trim();
  let m = /^keep:\s*(build|fire)\s+([a-g])\s*([1-7])$/i.exec(t);
  if (m) return { action: m[1].toLowerCase(), square: `${m[2].toUpperCase()}${m[3]}` };
  m = /^keep:\s*forge\s+(iron|ember|rune)$/i.exec(t);
  if (m) return { action: 'forge', material: m[1].toLowerCase() };
  return null;
}

const clone = (s) => JSON.parse(JSON.stringify(s));
const link = (login) => `@${login}`;

// Applies one move. Returns { ok, reply, state }: on a refusal the state is unchanged and the reply
// says why. `at` is an ISO timestamp (the issue's creation time), `id` the issue number.
export function play(state, { title, user, at: when, id }) {
  if (id != null && state.seen.includes(id)) return { ok: false, duplicate: true, reply: 'Already played.', state };
  const move = parseMove(title);
  if (!move) {
    return refuse(state, id, 'I couldn\'t read that move. Use one of the links under **Hold the Keep** on the profile, which fill in the title for you: `keep: build C2`, `keep: fire C3` or `keep: forge iron`.');
  }
  const player = state.players[user];
  const now = Date.parse(when);
  if (player?.last && now - Date.parse(player.last) < COOLDOWN_MS) {
    const next = new Date(Date.parse(player.last) + COOLDOWN_MS).toISOString().slice(11, 16);
    return refuse(state, id, `Each player gets one move every 10 minutes. Your next move opens at ${next} UTC.`);
  }

  const s = clone(state);
  const p = (s.players[user] ??= { built: 0, forged: 0, fired: 0, last: null });
  let reply;
  let deed;

  if (move.action === 'build') {
    const sq = move.square;
    if (isBuilt(s, sq)) return refuse(state, id, `${sq} is already built. Build on open ground next to the castle.`);
    if (!buildable(s, sq)) return refuse(state, id, `${sq} isn't next to the castle. Stones have to touch a wall, a tower or the keep.`);
    s.cells[sq] = { kind: 'stone', hp: STONE_HP, by: user };
    s.tally.stones++;
    p.built++;
    const tower = towers(s).includes(sq);
    deed = `laid a stone at ${sq}${tower ? ' and raised a tower' : ''}`;
    reply = `Your stone is laid at **${sq}**${tower ? ', and it stands as a tower' : ''}. The castle now has ${countStones(s)} stones.`;
  } else if (move.action === 'fire') {
    const sq = move.square;
    const cell = s.cells[sq];
    if (!cell) return refuse(state, id, `${sq} is open ground; there's nothing there to hit. Fire at a stone that faces open ground.`);
    if (!exposed(state).has(sq)) return refuse(state, id, `${sq} is behind the walls, out of the trebuchet's reach. Fire at a stone that faces open ground.`);
    s.tally.shots++;
    p.fired++;
    const { guard } = mounts(state);
    if (guard.has(sq)) {
      const w = s.weapons[guard.get(sq)];
      w.charges--;
      s.tally.repelled++;
      const broke = w.charges <= 0;
      if (broke) s.weapons.splice(guard.get(sq), 1);
      deed = `fired at ${sq}; the ${w.name} turned the shot${broke ? ' and broke' : ''}`;
      reply = `Your shot at **${sq}** was turned aside by the **${w.name}**${broke ? ', which broke doing it' : ` (${w.charges} ${w.charges === 1 ? 'charge' : 'charges'} left)`}.`;
    } else {
      cell.hp--;
      if (cell.kind === 'keep' && cell.hp <= 0) {
        const fallen = fall(s, user, when);
        fallen.players[user].last = when;
        return done(fallen, id, user, when, `breached the keep and ended the ${ordinal(state.age)} Age`,
          `**The keep has fallen.** Your shot ended the ${ordinal(state.age)} Age, which stood for ${duration(state.startedAt, when)}. A new castle rises for the ${ordinal(fallen.age)} Age.`);
      }
      if (cell.hp <= 0) {
        delete s.cells[sq];
        deed = `broke the stone at ${sq}`;
        reply = `Your shot broke the stone at **${sq}**.`;
      } else if (cell.kind === 'keep') {
        deed = `struck the keep (${cell.hp} of ${KEEP_HP} left)`;
        reply = `Your shot struck **the keep**. It has ${cell.hp} of ${KEEP_HP} strength left.`;
      } else {
        deed = `cracked the stone at ${sq}`;
        reply = `Your shot cracked the stone at **${sq}**. One more hit breaks it.`;
      }
    }
  } else {
    s.bellows.push(move.material);
    p.forged++;
    if (s.bellows.length >= 3) {
      const key = [...s.bellows].sort().join(',');
      const w = { name: WEAPONS[key], charges: CHARGES, by: user };
      s.weapons.push(w);
      s.bellows = [];
      s.tally.forged++;
      const { armed } = mounts(s);
      const on = [...armed].find(([, i]) => i === s.weapons.length - 1)?.[0];
      deed = `added ${move.material} and forged the ${w.name}`;
      reply = `You added **${move.material}** and the forge gave up a **${w.name}**. ${on ? `It's mounted on the tower at ${on}.` : 'It waits in the armoury until a tower is raised.'}`;
    } else {
      deed = `added ${move.material} to the forge`;
      const left = 3 - s.bellows.length;
      reply = `You added **${move.material}** to the forge. ${left} more ${left === 1 ? 'material forges' : 'materials forge'} a weapon.`;
    }
  }
  p.last = when;
  return done(s, id, user, when, deed, reply);
}

function done(s, id, user, when, deed, reply) {
  // Record where each weapon now hangs, so it stays there on later moves.
  const { armed } = mounts(s);
  const where = new Map([...armed].map(([sq, i]) => [i, sq]));
  s.weapons.forEach((w, i) => { w.at = where.get(i) ?? null; });
  s.deeds = [{ at: when, user, deed }, ...s.deeds].slice(0, DEEDS_KEPT);
  if (id != null) s.seen = [...s.seen, id].slice(-SEEN_KEPT);
  return { ok: true, reply, state: s };
}

function refuse(state, id, reply) {
  const s = id != null ? { ...state, seen: [...state.seen, id].slice(-SEEN_KEPT) } : state;
  return { ok: false, reply, state: s };
}

function fall(s, user, when) {
  const record = {
    age: s.age,
    startedAt: s.startedAt,
    endedAt: when,
    stones: s.tally.stones,
    forged: s.tally.forged,
    shots: s.tally.shots,
    repelled: s.tally.repelled,
    fellTo: user,
  };
  return newAge(s.age + 1, when, { players: s.players, deeds: s.deeds, ages: [record, ...s.ages], seen: s.seen });
}

const countStones = (s) => Object.values(s.cells).filter((c) => c.kind === 'stone').length;
export { countStones, link };

export function ordinal(n) {
  const words = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth'];
  if (n <= words.length) return words[n - 1];
  const sfx = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
  return `${n}${sfx}`;
}

export function duration(from, to) {
  const mins = Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / 60000));
  if (mins < 60) return `${mins} ${mins === 1 ? 'minute' : 'minutes'}`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  const days = Math.round(hours / 24);
  return `${days} days`;
}
