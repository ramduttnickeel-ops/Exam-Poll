const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const startScreen = document.getElementById("startScreen");
const pauseOverlay = document.getElementById("pauseOverlay");
const gameOverOverlay = document.getElementById("gameOver");
const announcer = document.getElementById("announcer");
const announceTop = document.getElementById("announceTop");
const announceMain = document.getElementById("announceMain");
const hud = document.getElementById("hud");
const playerNameInput = document.getElementById("playerName");

const hudName = document.getElementById("hudName");
const hudWave = document.getElementById("hudWave");
const hudKills = document.getElementById("hudKills");
const hudScore = document.getElementById("hudScore");
const hudTime = document.getElementById("hudTime");
const healthFill = document.getElementById("healthFill");
const staminaFill = document.getElementById("staminaFill");
const healthText = document.getElementById("healthText");
const staminaText = document.getElementById("staminaText");
const bossBarWrap = document.getElementById("bossBarWrap");
const bossFill = document.getElementById("bossFill");
const bossText = document.getElementById("bossText");
const weaponText = document.getElementById("weaponText");
const weaponHint = document.getElementById("weaponHint");
const buffsEl = document.getElementById("buffs");

const finalWave = document.getElementById("finalWave");
const finalKills = document.getElementById("finalKills");
const finalScore = document.getElementById("finalScore");
const finalTime = document.getElementById("finalTime");
const scoreRows = document.getElementById("scoreRows");

const TILE = 56;
const MAP_COLS = 36;
const MAP_ROWS = 22;
const WORLD_W = TILE * MAP_COLS;
const WORLD_H = TILE * MAP_ROWS;
const SCORE_KEY = "ultraZombieSurvivalScoresV2";

const input = {
  keys: {},
  mouseX: window.innerWidth * 0.5,
  mouseY: window.innerHeight * 0.5,
  mouseDown: false
};

const rng = (min, max) => Math.random() * (max - min) + min;
const randInt = (min, max) => Math.floor(rng(min, max + 1));
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const lerp = (a, b, t) => a + (b - a) * t;

const WEAPONS = {
  pistol: {
    name: "Pistol",
    hint: "Balanced",
    cooldown: 0.18,
    speed: 980,
    damage: 34,
    spread: 0.018,
    pellets: 1,
    color: "#87f7ff",
    radius: 4,
    knockback: 90
  },
  smg: {
    name: "SMG",
    hint: "Rapid fire",
    cooldown: 0.075,
    speed: 1120,
    damage: 16,
    spread: 0.07,
    pellets: 1,
    color: "#b7fff2",
    radius: 3,
    knockback: 55
  },
  shotgun: {
    name: "Shotgun",
    hint: "Close range burst",
    cooldown: 0.52,
    speed: 920,
    damage: 18,
    spread: 0.28,
    pellets: 7,
    color: "#ffe89a",
    radius: 4,
    knockback: 140
  }
};

const PICKUPS = {
  medkit: { label: "Medkit", color: "#ff7d7d" },
  rapid: { label: "Rapid Fire", color: "#77f5ff" },
  damage: { label: "Damage Boost", color: "#ffd96b" },
  shield: { label: "Shield", color: "#b88cff" }
};

let dpr = Math.min(window.devicePixelRatio || 1, 2);
let cw = window.innerWidth;
let ch = window.innerHeight;

const game = {
  state: "start",
  map: [],
  floorShade: [],
  reachable: [],
  reachableSet: new Set(),
  distanceField: [],
  lastDistanceTile: { row: -1, col: -1 },
  distanceRebuildTimer: 0,
  player: null,
  zombies: [],
  bullets: [],
  enemyShots: [],
  particles: [],
  pickups: [],
  decals: [],
  wave: 0,
  kills: 0,
  score: 0,
  elapsed: 0,
  timeSinceWaveEnd: 0,
  spawnQueue: [],
  spawnTimer: 0,
  camera: { x: 0, y: 0, shake: 0 },
  announcementTimer: 0,
  bossRef: null,
  backgroundDrift: 0,
  startedAt: 0
};

function resizeCanvas() {
  cw = window.innerWidth;
  ch = window.innerHeight;
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(cw * dpr);
  canvas.height = Math.floor(ch * dpr);
  canvas.style.width = cw + "px";
  canvas.style.height = ch + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = true;
}
resizeCanvas();
window.addEventListener("resize", resizeCanvas);

function makePlayer(name) {
  return {
    name,
    x: WORLD_W * 0.5,
    y: WORLD_H * 0.5,
    radius: 16,
    speed: 275,
    sprintMult: 1.62,
    health: 100,
    maxHealth: 100,
    stamina: 100,
    maxStamina: 100,
    armor: 0,
    weapon: "pistol",
    fireCooldown: 0,
    invuln: 0,
    buffs: { rapid: 0, damage: 0 },
    angle: 0,
    muzzleFlash: 0,
    stepBob: 0
  };
}

function showAnnouncement(top, main, seconds = 1.8) {
  announceTop.textContent = top;
  announceMain.textContent = main;
  announcer.classList.add("show");
  game.announcementTimer = seconds;
}

function hideAnnouncement() {
  announcer.classList.remove("show");
}

function buildMap() {
  const centerCol = Math.floor(MAP_COLS / 2);
  const centerRow = Math.floor(MAP_ROWS / 2);

  for (let attempt = 0; attempt < 30; attempt++) {
    const map = Array.from({ length: MAP_ROWS }, () => Array(MAP_COLS).fill(0));
    const floorShade = Array.from({ length: MAP_ROWS }, () => Array(MAP_COLS).fill(0));

    for (let row = 0; row < MAP_ROWS; row++) {
      for (let col = 0; col < MAP_COLS; col++) {
        if (row === 0 || col === 0 || row === MAP_ROWS - 1 || col === MAP_COLS - 1) {
          map[row][col] = 1;
        }
        floorShade[row][col] = rng(0, 1);
      }
    }

    const safeCols = new Set([centerCol - 2, centerCol - 1, centerCol, centerCol + 1, centerCol + 2]);
    const safeRows = new Set([centerRow - 2, centerRow - 1, centerRow, centerRow + 1, centerRow + 2]);
    const laneCols = new Set([centerCol, randInt(7, MAP_COLS - 8)]);
    const laneRows = new Set([centerRow, randInt(5, MAP_ROWS - 6)]);

    for (let i = 0; i < 52; i++) {
      const w = randInt(1, 4);
      const h = randInt(1, 4);
      const startCol = randInt(1, MAP_COLS - w - 2);
      const startRow = randInt(1, MAP_ROWS - h - 2);
      let blocked = false;

      for (let row = startRow; row < startRow + h; row++) {
        for (let col = startCol; col < startCol + w; col++) {
          if (safeCols.has(col) || safeRows.has(row) || laneCols.has(col) || laneRows.has(row)) {
            blocked = true;
          }
        }
      }
      if (blocked) continue;

      for (let row = startRow; row < startRow + h; row++) {
        for (let col = startCol; col < startCol + w; col++) {
          map[row][col] = 1;
        }
      }
    }

    for (let i = 0; i < 24; i++) {
      const col = randInt(2, MAP_COLS - 3);
      const row = randInt(2, MAP_ROWS - 3);
      if (safeCols.has(col) || safeRows.has(row) || laneCols.has(col) || laneRows.has(row)) continue;
      map[row][col] = 1;
    }

    for (let row = centerRow - 3; row <= centerRow + 3; row++) {
      for (let col = centerCol - 3; col <= centerCol + 3; col++) {
        if (row > 0 && col > 0 && row < MAP_ROWS - 1 && col < MAP_COLS - 1) {
          map[row][col] = 0;
        }
      }
    }

    const reachable = floodFill(map, centerRow, centerCol);
    const interiorCells = (MAP_ROWS - 2) * (MAP_COLS - 2);

    if (reachable.length > interiorCells * 0.62) {
      game.map = map;
      game.floorShade = floorShade;
      game.reachable = reachable;
      game.reachableSet = new Set(reachable.map(cell => `${cell.row},${cell.col}`));
      return;
    }
  }

  game.map = Array.from({ length: MAP_ROWS }, (_, row) =>
    Array.from({ length: MAP_COLS }, (_, col) =>
      row === 0 || col === 0 || row === MAP_ROWS - 1 || col === MAP_COLS - 1 ? 1 : 0
    )
  );
  game.floorShade = Array.from({ length: MAP_ROWS }, () =>
    Array.from({ length: MAP_COLS }, () => rng(0, 1))
  );
  game.reachable = floodFill(game.map, Math.floor(MAP_ROWS / 2), Math.floor(MAP_COLS / 2));
  game.reachableSet = new Set(game.reachable.map(cell => `${cell.row},${cell.col}`));
}

function floodFill(map, startRow, startCol) {
  const cells = [];
  const visited = Array.from({ length: MAP_ROWS }, () => Array(MAP_COLS).fill(false));
  const queue = [{ row: startRow, col: startCol }];
  visited[startRow][startCol] = true;

  while (queue.length) {
    const current = queue.shift();
    cells.push(current);
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];

    for (const [dr, dc] of dirs) {
      const nr = current.row + dr;
      const nc = current.col + dc;
      if (nr < 1 || nc < 1 || nr >= MAP_ROWS - 1 || nc >= MAP_COLS - 1) continue;
      if (visited[nr][nc] || map[nr][nc] === 1) continue;
      visited[nr][nc] = true;
      queue.push({ row: nr, col: nc });
    }
  }

  return cells;
}

function buildDistanceField(targetRow, targetCol) {
  const dist = Array.from({ length: MAP_ROWS }, () => Array(MAP_COLS).fill(Infinity));
  if (game.map[targetRow]?.[targetCol] !== 0) {
    game.distanceField = dist;
    return;
  }

  const queue = [{ row: targetRow, col: targetCol }];
  dist[targetRow][targetCol] = 0;

  for (let i = 0; i < queue.length; i++) {
    const current = queue[i];
    const nextCost = dist[current.row][current.col] + 1;
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];

    for (const [dr, dc] of dirs) {
      const nr = current.row + dr;
      const nc = current.col + dc;
      if (nr <= 0 || nc <= 0 || nr >= MAP_ROWS - 1 || nc >= MAP_COLS - 1) continue;
      if (game.map[nr][nc] === 1) continue;
      if (nextCost < dist[nr][nc]) {
        dist[nr][nc] = nextCost;
        queue.push({ row: nr, col: nc });
      }
    }
  }

  game.distanceField = dist;
}

function isWall(row, col) {
  if (row < 0 || col < 0 || row >= MAP_ROWS || col >= MAP_COLS) return true;
  return game.map[row][col] === 1;
}

function circleHitsWall(x, y, radius) {
  const minCol = Math.floor((x - radius) / TILE);
  const maxCol = Math.floor((x + radius) / TILE);
  const minRow = Math.floor((y - radius) / TILE);
  const maxRow = Math.floor((y + radius) / TILE);

  for (let row = minRow; row <= maxRow; row++) {
    for (let col = minCol; col <= maxCol; col++) {
      if (!isWall(row, col)) continue;
      const nearestX = clamp(x, col * TILE, col * TILE + TILE);
      const nearestY = clamp(y, row * TILE, row * TILE + TILE);
      const dx = x - nearestX;
      const dy = y - nearestY;
      if (dx * dx + dy * dy < radius * radius) return true;
    }
  }

  return false;
}

function moveCircle(entity, vx, vy, dt) {
  const distance = Math.hypot(vx, vy) * dt;
  const steps = Math.max(1, Math.ceil(distance / 10));
  const stepX = (vx * dt) / steps;
  const stepY = (vy * dt) / steps;

  for (let i = 0; i < steps; i++) {
    if (!circleHitsWall(entity.x + stepX, entity.y, entity.radius)) {
      entity.x += stepX;
    }
    if (!circleHitsWall(entity.x, entity.y + stepY, entity.radius)) {
      entity.y += stepY;
    }
  }
}

function tileCenter(row, col) {
  return {
    x: col * TILE + TILE * 0.5,
    y: row * TILE + TILE * 0.5
  };
}

function randomReachableTile(minDistanceFromPlayer = 0) {
  const tries = 80;

  for (let i = 0; i < tries; i++) {
    const cell = game.reachable[randInt(0, game.reachable.length - 1)];
    const { x, y } = tileCenter(cell.row, cell.col);

    if (minDistanceFromPlayer > 0 && game.player) {
      const dist = Math.hypot(x - game.player.x, y - game.player.y);
      if (dist < minDistanceFromPlayer) continue;
    }

    return { row: cell.row, col: cell.col, x, y };
  }

  const fallback = game.reachable[0] || { row: 1, col: 1 };
  return { ...fallback, ...tileCenter(fallback.row, fallback.col) };
}

function spawnZombie(kind) {
  const tile = randomReachableTile(480);

  const base = {
    normal: { speed: 92, health: 44, radius: 16, color: "#ff5b61", damage: 10, touchCd: 0.75 },
    runner: { speed: 150, health: 26, radius: 13, color: "#ff9362", damage: 8, touchCd: 0.65 },
    brute: { speed: 72, health: 130, radius: 22, color: "#c43d54", damage: 18, touchCd: 0.92 },
    spitter: { speed: 84, health: 52, radius: 17, color: "#b975ff", damage: 10, touchCd: 0.8 },
    boss: { speed: 88, health: 420, radius: 30, color: "#f03eff", damage: 22, touchCd: 0.78 }
  }[kind];

  const scale = 1 + (game.wave - 1) * (kind === "boss" ? 0.15 : 0.07);

  const zombie = {
    kind,
    x: tile.x,
    y: tile.y,
    radius: base.radius,
    speed: base.speed * (kind === "runner" ? 1 + game.wave * 0.012 : 1),
    health: Math.round(base.health * scale),
    maxHealth: Math.round(base.health * scale),
    color: base.color,
    damage: base.damage,
    touchCooldown: 0,
    shootCooldown: rng(0.8, 1.7),
    heading: rng(0, Math.PI * 2),
    hitFlash: 0,
    isBoss: kind === "boss"
  };

  game.zombies.push(zombie);
  if (zombie.isBoss) game.bossRef = zombie;
}

function queueWave(waveNumber) {
  game.wave = waveNumber;
  game.spawnQueue = [];

  const count = 7 + waveNumber * 2;
  for (let i = 0; i < count; i++) {
    let kind = "normal";
    const roll = Math.random();

    if (waveNumber >= 2 && roll < 0.2) kind = "runner";
    if (waveNumber >= 3 && roll > 0.72) kind = "brute";
    if (waveNumber >= 4 && roll > 0.86) kind = "spitter";
    game.spawnQueue.push(kind);
  }

  if (waveNumber % 5 === 0) {
    game.spawnQueue.push("boss");
  }

  game.spawnTimer = 0.3;
  showAnnouncement("Incoming", waveNumber % 5 === 0 ? `Wave ${waveNumber} • Boss` : `Wave ${waveNumber}`);
  game.player.health = clamp(game.player.health + 10, 0, game.player.maxHealth);
  game.player.stamina = clamp(game.player.stamina + 25, 0, game.player.maxStamina);
}

function resetGame() {
  buildMap();

  const name = (playerNameInput.value || "Guest").trim() || "Guest";
  game.player = makePlayer(name);

  const spawn = tileCenter(Math.floor(MAP_ROWS / 2), Math.floor(MAP_COLS / 2));
  game.player.x = spawn.x;
  game.player.y = spawn.y;

  game.zombies = [];
  game.bullets = [];
  game.enemyShots = [];
  game.particles = [];
  game.pickups = [];
  game.decals = [];
  game.wave = 0;
  game.kills = 0;
  game.score = 0;
  game.elapsed = 0;
  game.timeSinceWaveEnd = 0;
  game.spawnQueue = [];
  game.spawnTimer = 0;
  game.camera = {
    x: spawn.x - cw * 0.5,
    y: spawn.y - ch * 0.5,
    shake: 0
  };
  game.announcementTimer = 0;
  game.bossRef = null;
  game.backgroundDrift = 0;
  game.startedAt = performance.now();
  game.lastDistanceTile = { row: -1, col: -1 };

  buildDistanceField(Math.floor(MAP_ROWS / 2), Math.floor(MAP_COLS / 2));
  queueWave(1);
  hud.style.display = "flex";
  hideAnnouncement();
}

function startGame() {
  resetGame();
  game.state = "playing";
  startScreen.style.display = "none";
  pauseOverlay.style.display = "none";
  gameOverOverlay.style.display = "none";
  hudName.textContent = game.player.name;
}

function saveScore() {
  const scores = JSON.parse(localStorage.getItem(SCORE_KEY) || "[]");
  scores.push({
    name: game.player.name,
    wave: game.wave,
    kills: game.kills,
    score: Math.round(game.score),
    time: Math.floor(game.elapsed)
  });
  scores.sort((a, b) => b.score - a.score || b.wave - a.wave || b.kills - a.kills || b.time - a.time);
  localStorage.setItem(SCORE_KEY, JSON.stringify(scores.slice(0, 10)));
}

function populateScoreboard() {
  const scores = JSON.parse(localStorage.getItem(SCORE_KEY) || "[]");
  scoreRows.innerHTML = "";

  if (!scores.length) {
    scoreRows.innerHTML = `<tr><td colspan="6" class="muted">No runs saved yet.</td></tr>`;
    return;
  }

  scores.forEach((score, index) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${index + 1}</td>
      <td>${score.name}</td>
      <td>${score.wave}</td>
      <td>${score.kills}</td>
      <td>${score.score}</td>
      <td>${score.time}s</td>
    `;
    scoreRows.appendChild(row);
  });
}

function endGame() {
  game.state = "gameover";
  saveScore();
  populateScoreboard();

  finalWave.textContent = game.wave;
  finalKills.textContent = game.kills;
  finalScore.textContent = Math.round(game.score);
  finalTime.textContent = Math.floor(game.elapsed) + "s";

  gameOverOverlay.style.display = "flex";
  pauseOverlay.style.display = "none";
}

function returnToMenu() {
  game.state = "start";
  startScreen.style.display = "flex";
  pauseOverlay.style.display = "none";
  gameOverOverlay.style.display = "none";
  hud.style.display = "none";
  hideAnnouncement();
}

function togglePause() {
  if (game.state === "playing") {
    game.state = "paused";
    pauseOverlay.style.display = "flex";
  } else if (game.state === "paused") {
    game.state = "playing";
    pauseOverlay.style.display = "none";
  }
}

function useWeaponByIndex(index) {
  if (!game.player) return;

  const allowed = ["pistol", "smg", "shotgun"];
  const selected = allowed[index];
  if (!selected) return;

  const unlockWave = {
    pistol: 1,
    smg: 2,
    shotgun: 4
  };

  if (game.wave >= unlockWave[selected]) {
    game.player.weapon = selected;
  }
}

function spawnPickup(x, y) {
  const roll = Math.random();
  if (roll > 0.2) return;

  let type = "medkit";
  if (roll < 0.05) type = "shield";
  else if (roll < 0.1) type = "damage";
  else if (roll < 0.15) type = "rapid";

  game.pickups.push({
    x,
    y,
    radius: 12,
    type,
    bob: rng(0, Math.PI * 2)
  });
}

function addParticles(x, y, color, amount, speed = 180, life = 0.45, size = 3) {
  for (let i = 0; i < amount; i++) {
    const angle = rng(0, Math.PI * 2);
    const power = rng(speed * 0.35, speed);

    game.particles.push({
      x,
      y,
      vx: Math.cos(angle) * power,
      vy: Math.sin(angle) * power,
      life,
      maxLife: life,
      size: rng(size * 0.5, size * 1.6),
      color
    });
  }
}

function damagePlayer(amount, sourceX, sourceY) {
  if (game.player.invuln > 0) return;

  let remaining = amount;

  if (game.player.armor > 0) {
    const blocked = Math.min(game.player.armor, remaining);
    game.player.armor -= blocked;
    remaining -= blocked;
  }

  game.player.health -= remaining;
  game.player.invuln = 0.32;
  game.camera.shake += 8;

  addParticles(game.player.x, game.player.y, "rgba(255,100,100,0.95)", 12, 220, 0.45, 3.5);

  if (sourceX != null && sourceY != null) {
    const angle = Math.atan2(game.player.y - sourceY, game.player.x - sourceX);
    moveCircle(game.player, Math.cos(angle) * 360, Math.sin(angle) * 360, 0.05);
  }

  if (game.player.health <= 0) {
    game.player.health = 0;
    endGame();
  }
}

function shootWeapon() {
  const player = game.player;
  if (!player || player.fireCooldown > 0) return;
  if (!input.mouseDown) return;

  const weapon = WEAPONS[player.weapon];
  let cooldown = weapon.cooldown;
  if (player.buffs.rapid > 0) cooldown *= 0.6;

  player.fireCooldown = cooldown;
  player.muzzleFlash = 0.08;
  game.camera.shake += player.weapon === "shotgun" ? 5 : player.weapon === "smg" ? 1.2 : 2.5;

  const damageMult = player.buffs.damage > 0 ? 1.45 : 1;
  const baseAngle = player.angle;

  for (let i = 0; i < weapon.pellets; i++) {
    const spread = weapon.spread * (weapon.pellets > 1 ? rng(-1, 1) : rng(-0.55, 0.55));
    const angle = baseAngle + spread;

    game.bullets.push({
      x: player.x + Math.cos(angle) * (player.radius + 10),
      y: player.y + Math.sin(angle) * (player.radius + 10),
      vx: Math.cos(angle) * weapon.speed,
      vy: Math.sin(angle) * weapon.speed,
      damage: weapon.damage * damageMult,
      radius: weapon.radius,
      life: player.weapon === "shotgun" ? 0.24 : 0.52,
      color: weapon.color,
      knockback: weapon.knockback
    });
  }
}

function lineOfSight(x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const distance = Math.hypot(dx, dy);
  const steps = Math.max(6, Math.ceil(distance / 18));

  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const x = x1 + dx * t;
    const y = y1 + dy * t;
    const row = Math.floor(y / TILE);
    const col = Math.floor(x / TILE);
    if (isWall(row, col)) return false;
  }

  return true;
}

function updatePlaying(dt) {
  const player = game.player;
  if (!player) return;

  game.elapsed += dt;
  game.backgroundDrift += dt;

  if (game.announcementTimer > 0) {
    game.announcementTimer -= dt;
    if (game.announcementTimer <= 0) hideAnnouncement();
  }

  player.invuln = Math.max(0, player.invuln - dt);
  player.fireCooldown = Math.max(0, player.fireCooldown - dt);
  player.muzzleFlash = Math.max(0, player.muzzleFlash - dt);
  player.buffs.rapid = Math.max(0, player.buffs.rapid - dt);
  player.buffs.damage = Math.max(0, player.buffs.damage - dt);

  let moveX = 0;
  let moveY = 0;

  if (input.keys.w) moveY -= 1;
  if (input.keys.s) moveY += 1;
  if (input.keys.a) moveX -= 1;
  if (input.keys.d) moveX += 1;

  const moving = moveX !== 0 || moveY !== 0;

  if (moving) {
    const length = Math.hypot(moveX, moveY);
    moveX /= length;
    moveY /= length;
  }

  const wantsSprint = moving && input.keys.shift && player.stamina > 1;
  const speedMult = wantsSprint ? player.sprintMult : 1;

  if (wantsSprint) {
    player.stamina = Math.max(0, player.stamina - 38 * dt);
  } else {
    player.stamina = Math.min(player.maxStamina, player.stamina + 24 * dt);
  }

  moveCircle(player, moveX * player.speed * speedMult, moveY * player.speed * speedMult, dt);
  player.stepBob += moving ? dt * (wantsSprint ? 14 : 9) : dt * 2;

  const targetCamX = clamp(player.x - cw * 0.5, 0, Math.max(0, WORLD_W - cw));
  const targetCamY = clamp(player.y - ch * 0.5, 0, Math.max(0, WORLD_H - ch));
  game.camera.x = lerp(game.camera.x, targetCamX, 0.12);
  game.camera.y = lerp(game.camera.y, targetCamY, 0.12);

  const mouseWorldX = input.mouseX + game.camera.x;
  const mouseWorldY = input.mouseY + game.camera.y;
  player.angle = Math.atan2(mouseWorldY - player.y, mouseWorldX - player.x);

  shootWeapon();

  const playerRow = clamp(Math.floor(player.y / TILE), 1, MAP_ROWS - 2);
  const playerCol = clamp(Math.floor(player.x / TILE), 1, MAP_COLS - 2);

  game.distanceRebuildTimer -= dt;
  if (
    playerRow !== game.lastDistanceTile.row ||
    playerCol !== game.lastDistanceTile.col ||
    game.distanceRebuildTimer <= 0
  ) {
    buildDistanceField(playerRow, playerCol);
    game.lastDistanceTile = { row: playerRow, col: playerCol };
    game.distanceRebuildTimer = 0.18;
  }

  for (let i = game.bullets.length - 1; i >= 0; i--) {
    const bullet = game.bullets[i];
    bullet.life -= dt;

    if (bullet.life <= 0) {
      game.bullets.splice(i, 1);
      continue;
    }

    const steps = Math.max(1, Math.ceil((Math.hypot(bullet.vx, bullet.vy) * dt) / 10));
    let dead = false;

    for (let s = 0; s < steps; s++) {
      bullet.x += (bullet.vx * dt) / steps;
      bullet.y += (bullet.vy * dt) / steps;

      if (circleHitsWall(bullet.x, bullet.y, bullet.radius)) {
        addParticles(bullet.x, bullet.y, "rgba(155,240,255,0.9)", 4, 120, 0.2, 2.4);
        game.bullets.splice(i, 1);
        dead = true;
        break;
      }

      for (let z = game.zombies.length - 1; z >= 0; z--) {
        const zombie = game.zombies[z];
        if (Math.hypot(bullet.x - zombie.x, bullet.y - zombie.y) <= zombie.radius + bullet.radius) {
          zombie.health -= bullet.damage;
          zombie.hitFlash = 0.08;

          const angle = Math.atan2(zombie.y - player.y, zombie.x - player.x);
          moveCircle(zombie, Math.cos(angle) * bullet.knockback, Math.sin(angle) * bullet.knockback, 0.05);

          addParticles(
            bullet.x,
            bullet.y,
            zombie.isBoss ? "rgba(255,82,239,0.95)" : "rgba(255,82,96,0.9)",
            zombie.isBoss ? 10 : 7,
            180,
            0.3,
            2.8
          );

          game.bullets.splice(i, 1);
          dead = true;

          if (zombie.health <= 0) {
            game.score += zombie.isBoss
              ? 650
              : zombie.kind === "brute"
              ? 180
              : zombie.kind === "spitter"
              ? 145
              : zombie.kind === "runner"
              ? 120
              : 90;

            game.kills += 1;

            game.decals.push({
              x: zombie.x,
              y: zombie.y,
              radius: rng(zombie.radius * 0.8, zombie.radius * 1.45),
              alpha: rng(0.18, 0.3),
              color: zombie.isBoss ? "rgba(230,80,255,0.18)" : "rgba(255,60,70,0.18)"
            });

            addParticles(
              zombie.x,
              zombie.y,
              zombie.isBoss ? "rgba(255,88,240,0.95)" : "rgba(255,70,90,0.95)",
              zombie.isBoss ? 28 : 16,
              240,
              0.55,
              3.2
            );

            spawnPickup(zombie.x, zombie.y);

            if (zombie.isBoss) {
              showAnnouncement("Target Down", "Boss Eliminated", 2.2);
              game.bossRef = null;
            }

            game.zombies.splice(z, 1);
          }

          break;
        }
      }

      if (dead) break;
    }
  }

  for (let i = game.enemyShots.length - 1; i >= 0; i--) {
    const shot = game.enemyShots[i];
    shot.life -= dt;

    if (shot.life <= 0) {
      game.enemyShots.splice(i, 1);
      continue;
    }

    const steps = Math.max(1, Math.ceil((Math.hypot(shot.vx, shot.vy) * dt) / 10));
    let remove = false;

    for (let s = 0; s < steps; s++) {
      shot.x += (shot.vx * dt) / steps;
      shot.y += (shot.vy * dt) / steps;

      if (circleHitsWall(shot.x, shot.y, shot.radius)) {
        addParticles(shot.x, shot.y, "rgba(195,120,255,0.8)", 5, 110, 0.22, 2.2);
        game.enemyShots.splice(i, 1);
        remove = true;
        break;
      }

      if (Math.hypot(shot.x - player.x, shot.y - player.y) <= shot.radius + player.radius) {
        damagePlayer(shot.damage, shot.x, shot.y);
        addParticles(shot.x, shot.y, "rgba(210,130,255,0.9)", 10, 200, 0.35, 3);
        game.enemyShots.splice(i, 1);
        remove = true;
        break;
      }
    }

    if (remove) continue;
  }

  for (let i = game.pickups.length - 1; i >= 0; i--) {
    const pickup = game.pickups[i];
    pickup.bob += dt * 3;

    if (Math.hypot(pickup.x - player.x, pickup.y - player.y) <= pickup.radius + player.radius) {
      if (pickup.type === "medkit") {
        player.health = clamp(player.health + 30, 0, player.maxHealth);
        showAnnouncement("Recovered", "Medkit Grabbed", 1.2);
      }
      if (pickup.type === "rapid") {
        player.buffs.rapid = 8;
        showAnnouncement("Boost Active", "Rapid Fire", 1.2);
      }
      if (pickup.type === "damage") {
        player.buffs.damage = 8;
        showAnnouncement("Boost Active", "Damage Boost", 1.2);
      }
      if (pickup.type === "shield") {
        player.armor = Math.min(60, player.armor + 35);
        showAnnouncement("Barrier Raised", "Shield +35", 1.2);
      }

      addParticles(pickup.x, pickup.y, PICKUPS[pickup.type].color, 12, 190, 0.4, 2.8);
      game.pickups.splice(i, 1);
    }
  }

  for (let i = game.particles.length - 1; i >= 0; i--) {
    const p = game.particles[i];
    p.life -= dt;

    if (p.life <= 0) {
      game.particles.splice(i, 1);
      continue;
    }

    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.96;
    p.vy *= 0.96;
  }

  for (let i = 0; i < game.zombies.length; i++) {
    const zombie = game.zombies[i];
    zombie.touchCooldown = Math.max(0, zombie.touchCooldown - dt);
    zombie.shootCooldown = Math.max(0, zombie.shootCooldown - dt);
    zombie.hitFlash = Math.max(0, zombie.hitFlash - dt);

    const dx = player.x - zombie.x;
    const dy = player.y - zombie.y;
    const distToPlayer = Math.hypot(dx, dy) || 1;
    const row = clamp(Math.floor(zombie.y / TILE), 1, MAP_ROWS - 2);
    const col = clamp(Math.floor(zombie.x / TILE), 1, MAP_COLS - 2);

    let dirX = dx / distToPlayer;
    let dirY = dy / distToPlayer;

    if (zombie.kind !== "boss" && zombie.kind !== "spitter") {
      let bestRow = row;
      let bestCol = col;
      let bestDist = game.distanceField[row]?.[col] ?? Infinity;

      for (let nr = row - 1; nr <= row + 1; nr++) {
        for (let nc = col - 1; nc <= col + 1; nc++) {
          if (nr <= 0 || nc <= 0 || nr >= MAP_ROWS - 1 || nc >= MAP_COLS - 1) continue;
          if (game.map[nr][nc] === 1) continue;
          const value = game.distanceField[nr][nc];
          if (value < bestDist) {
            bestDist = value;
            bestRow = nr;
            bestCol = nc;
          }
        }
      }

      const target = tileCenter(bestRow, bestCol);
      dirX = target.x - zombie.x;
      dirY = target.y - zombie.y;
      const len = Math.hypot(dirX, dirY) || 1;
      dirX /= len;
      dirY /= len;
    }

    if (zombie.kind === "spitter") {
      if (distToPlayer < 190) {
        dirX = -dx / distToPlayer;
        dirY = -dy / distToPlayer;
      } else if (distToPlayer > 290) {
        dirX = dx / distToPlayer;
        dirY = dy / distToPlayer;
      } else {
        const tangent = Math.atan2(dy, dx) + Math.PI / 2;
        dirX = Math.cos(tangent);
        dirY = Math.sin(tangent);
      }

      if (zombie.shootCooldown <= 0 && lineOfSight(zombie.x, zombie.y, player.x, player.y)) {
        const angle = Math.atan2(dy, dx);

        game.enemyShots.push({
          x: zombie.x,
          y: zombie.y,
          vx: Math.cos(angle) * 320,
          vy: Math.sin(angle) * 320,
          radius: 6,
          damage: 11,
          life: 2.2
        });

        zombie.shootCooldown = rng(1.5, 2.2);
        addParticles(zombie.x, zombie.y, "rgba(190,110,255,0.8)", 8, 120, 0.22, 2.5);
      }
    }

    if (zombie.kind === "boss") {
      if (distToPlayer > 150) {
        dirX = dx / distToPlayer;
        dirY = dy / distToPlayer;
      }

      if (zombie.shootCooldown <= 0) {
        for (let b = -1; b <= 1; b++) {
          const angle = Math.atan2(dy, dx) + b * 0.2;
          game.enemyShots.push({
            x: zombie.x,
            y: zombie.y,
            vx: Math.cos(angle) * 340,
            vy: Math.sin(angle) * 340,
            radius: 7,
            damage: 13,
            life: 2.1
          });
        }

        zombie.shootCooldown = 1.45;
        game.camera.shake += 2;
      }
    }

    let sepX = 0;
    let sepY = 0;

    for (let j = 0; j < game.zombies.length; j++) {
      if (i === j) continue;

      const other = game.zombies[j];
      const ddx = zombie.x - other.x;
      const ddy = zombie.y - other.y;
      const d = Math.hypot(ddx, ddy) || 1;
      const min = zombie.radius + other.radius + 4;

      if (d < min) {
        const strength = (min - d) / min;
        sepX += (ddx / d) * strength;
        sepY += (ddy / d) * strength;
      }
    }

    const sepLen = Math.hypot(sepX, sepY) || 1;
    sepX /= sepLen;
    sepY /= sepLen;

    const finalX = dirX * 0.82 + sepX * 0.7;
    const finalY = dirY * 0.82 + sepY * 0.7;
    const finalLen = Math.hypot(finalX, finalY) || 1;

    moveCircle(zombie, (finalX / finalLen) * zombie.speed, (finalY / finalLen) * zombie.speed, dt);

    if (distToPlayer <= zombie.radius + player.radius + 2 && zombie.touchCooldown <= 0) {
      damagePlayer(zombie.damage, zombie.x, zombie.y);
      zombie.touchCooldown =
        zombie.kind === "runner"
          ? 0.55
          : zombie.kind === "boss"
          ? 0.42
          : zombie.kind === "brute"
          ? 0.95
          : 0.75;
    }
  }

  if (game.spawnQueue.length > 0) {
    game.spawnTimer -= dt;
    if (game.spawnTimer <= 0) {
      spawnZombie(game.spawnQueue.shift());
      game.spawnTimer = Math.max(0.12, 0.42 - game.wave * 0.015);
    }
  }

  if (game.spawnQueue.length === 0 && game.zombies.length === 0) {
    game.timeSinceWaveEnd += dt;
    if (game.timeSinceWaveEnd > 2.2) {
      game.timeSinceWaveEnd = 0;
      queueWave(game.wave + 1);
    }
  } else {
    game.timeSinceWaveEnd = 0;
  }

  game.score += dt * 6 + (player.buffs.rapid > 0 || player.buffs.damage > 0 ? dt * 2 : 0);
  game.camera.shake = Math.max(0, game.camera.shake * 0.88 - dt * 18);
}

function formatTime(seconds) {
  return Math.floor(seconds) + "s";
}

function updateHUD() {
  if (!game.player) return;

  const player = game.player;
  hudName.textContent = player.name;
  hudWave.textContent = game.wave;
  hudKills.textContent = game.kills;
  hudScore.textContent = Math.round(game.score);
  hudTime.textContent = formatTime(game.elapsed);

  healthFill.style.width = `${(player.health / player.maxHealth) * 100}%`;
  staminaFill.style.width = `${(player.stamina / player.maxStamina) * 100}%`;
  healthText.textContent = `${Math.ceil(player.health)} / ${player.maxHealth}` + (player.armor > 0 ? ` + ${Math.ceil(player.armor)} armor` : "");
  staminaText.textContent = `${Math.ceil(player.stamina)} / ${player.maxStamina}`;

  weaponText.textContent = WEAPONS[player.weapon].name;
  weaponHint.textContent = WEAPONS[player.weapon].hint;

  if (game.bossRef && game.zombies.includes(game.bossRef)) {
    bossBarWrap.style.display = "grid";
    bossFill.style.width = `${(game.bossRef.health / game.bossRef.maxHealth) * 100}%`;
    bossText.textContent = `${Math.max(0, Math.ceil(game.bossRef.health))} / ${game.bossRef.maxHealth}`;
  } else {
    bossBarWrap.style.display = "none";
  }

  const buffs = [];
  if (player.buffs.rapid > 0) buffs.push(`<span class="buff">Rapid Fire ${player.buffs.rapid.toFixed(1)}s</span>`);
  if (player.buffs.damage > 0) buffs.push(`<span class="buff">Damage Boost ${player.buffs.damage.toFixed(1)}s</span>`);
  if (player.armor > 0) buffs.push(`<span class="buff">Shield ${Math.ceil(player.armor)}</span>`);

  buffsEl.innerHTML = buffs.length ? buffs.join("") : `<span class="buff muted">No active boosts</span>`;
}

function drawBackgroundOnly(time) {
  ctx.clearRect(0, 0, cw, ch);

  const grad = ctx.createRadialGradient(cw * 0.5, ch * 0.45, 60, cw * 0.5, ch * 0.5, Math.max(cw, ch));
  grad.addColorStop(0, "#132237");
  grad.addColorStop(0.45, "#0a1119");
  grad.addColorStop(1, "#04070b");

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, cw, ch);

  ctx.save();
  ctx.globalAlpha = 0.18;

  for (let i = 0; i < 36; i++) {
    const x = (i * 140 + Math.sin(time * 0.35 + i) * 45 + time * 16) % (cw + 220) - 110;
    const y = (i * 65 + Math.cos(time * 0.42 + i * 1.2) * 40) % (ch + 180) - 90;
    ctx.fillStyle = i % 6 === 0 ? "rgba(178,109,255,0.28)" : "rgba(98,238,255,0.2)";
    ctx.beginPath();
    ctx.arc(x, y, 2 + (i % 3), 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();

  ctx.save();
  ctx.strokeStyle = "rgba(98,238,255,0.08)";
  ctx.lineWidth = 1;

  const grid = 56;
  for (let x = -grid; x < cw + grid; x += grid) {
    ctx.beginPath();
    ctx.moveTo(x + (time * 12) % grid, 0);
    ctx.lineTo(x + (time * 12) % grid, ch);
    ctx.stroke();
  }

  for (let y = -grid; y < ch + grid; y += grid) {
    ctx.beginPath();
    ctx.moveTo(0, y + (time * 8) % grid);
    ctx.lineTo(cw, y + (time * 8) % grid);
    ctx.stroke();
  }

  ctx.restore();
}

function drawGame() {
  ctx.clearRect(0, 0, cw, ch);

  const shakeX = rng(-game.camera.shake, game.camera.shake);
  const shakeY = rng(-game.camera.shake, game.camera.shake);

  ctx.save();
  ctx.translate(-game.camera.x + shakeX, -game.camera.y + shakeY);

  const bg = ctx.createLinearGradient(0, 0, 0, WORLD_H);
  bg.addColorStop(0, "#0f1824");
  bg.addColorStop(1, "#090f16");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);

  const startCol = clamp(Math.floor(game.camera.x / TILE) - 1, 0, MAP_COLS - 1);
  const endCol = clamp(Math.ceil((game.camera.x + cw) / TILE) + 1, 0, MAP_COLS - 1);
  const startRow = clamp(Math.floor(game.camera.y / TILE) - 1, 0, MAP_ROWS - 1);
  const endRow = clamp(Math.ceil((game.camera.y + ch) / TILE) + 1, 0, MAP_ROWS - 1);

  for (let row = startRow; row <= endRow; row++) {
    for (let col = startCol; col <= endCol; col++) {
      const x = col * TILE;
      const y = row * TILE;

      if (game.map[row][col] === 0) {
        const shade = game.floorShade[row][col];
        ctx.fillStyle = shade > 0.72 ? "#111b27" : shade > 0.42 ? "#0d1721" : "#0b141d";
        ctx.fillRect(x, y, TILE, TILE);
        ctx.strokeStyle = "rgba(130, 225, 255, 0.035)";
        ctx.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);
      } else {
        ctx.fillStyle = "#1d2633";
        ctx.fillRect(x, y, TILE, TILE);
        ctx.fillStyle = "rgba(255,255,255,0.04)";
        ctx.fillRect(x + 4, y + 4, TILE - 8, 8);
        ctx.fillStyle = "rgba(0,0,0,0.18)";
        ctx.fillRect(x + 6, y + TILE - 14, TILE - 12, 8);
        ctx.strokeStyle = "rgba(98,238,255,0.08)";
        ctx.strokeRect(x + 0.5, y + 0.5, TILE - 1, TILE - 1);
      }
    }
  }

  for (const decal of game.decals) {
    ctx.fillStyle = decal.color;
    ctx.beginPath();
    ctx.arc(decal.x, decal.y, decal.radius, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const pickup of game.pickups) {
    const def = PICKUPS[pickup.type];
    const bob = Math.sin(pickup.bob) * 5;

    ctx.save();
    ctx.translate(pickup.x, pickup.y + bob);
    ctx.shadowColor = def.color;
    ctx.shadowBlur = 18;
    ctx.fillStyle = def.color;
    ctx.beginPath();
    ctx.arc(0, 0, pickup.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.font = "bold 10px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(def.label[0], 0, 0.5);
    ctx.restore();
  }

  for (const shot of game.enemyShots) {
    ctx.save();
    ctx.shadowColor = "rgba(190,110,255,0.95)";
    ctx.shadowBlur = 16;
    ctx.fillStyle = "#d59dff";
    ctx.beginPath();
    ctx.arc(shot.x, shot.y, shot.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  for (const bullet of game.bullets) {
    ctx.save();
    ctx.shadowColor = bullet.color;
    ctx.shadowBlur = 14;
    ctx.fillStyle = bullet.color;
    ctx.beginPath();
    ctx.arc(bullet.x, bullet.y, bullet.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  for (const zombie of game.zombies) {
    ctx.save();
    const flash = zombie.hitFlash > 0 ? 1 : 0;
    ctx.shadowColor = zombie.isBoss
      ? "rgba(240,62,255,0.85)"
      : zombie.kind === "spitter"
      ? "rgba(185,117,255,0.65)"
      : "rgba(255,80,95,0.38)";
    ctx.shadowBlur = zombie.isBoss ? 26 : 14;
    ctx.fillStyle = flash ? "#ffffff" : zombie.color;
    ctx.beginPath();
    ctx.arc(zombie.x, zombie.y, zombie.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    const eyeAngle = Math.atan2(game.player.y - zombie.y, game.player.x - zombie.x);
    const eyeOffset = zombie.radius * 0.35;
    const eyeSpread = zombie.radius * 0.38;

    ctx.fillStyle = "#14080f";
    ctx.beginPath();
    ctx.arc(
      zombie.x + Math.cos(eyeAngle - 0.5) * eyeOffset,
      zombie.y + Math.sin(eyeAngle - 0.5) * eyeOffset - eyeSpread * 0.18,
      Math.max(2.3, zombie.radius * 0.14),
      0,
      Math.PI * 2
    );
    ctx.arc(
      zombie.x + Math.cos(eyeAngle + 0.5) * eyeOffset,
      zombie.y + Math.sin(eyeAngle + 0.5) * eyeOffset - eyeSpread * 0.18,
      Math.max(2.3, zombie.radius * 0.14),
      0,
      Math.PI * 2
    );
    ctx.fill();

    if (zombie.health < zombie.maxHealth) {
      const w = zombie.radius * 1.8;
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.fillRect(zombie.x - w * 0.5, zombie.y - zombie.radius - 12, w, 4);
      ctx.fillStyle = zombie.isBoss ? "#ff66e6" : "#ff6a7c";
      ctx.fillRect(
        zombie.x - w * 0.5,
        zombie.y - zombie.radius - 12,
        w * (zombie.health / zombie.maxHealth),
        4
      );
    }
  }

  const player = game.player;
  if (player) {
    const bob = Math.sin(player.stepBob) * 1.5;
    const bodyColor = player.invuln > 0 ? "rgba(255,255,255,0.9)" : "#7ef4ff";
    const weaponLength = player.weapon === "shotgun" ? 28 : player.weapon === "smg" ? 24 : 26;
    const armAngle = player.angle;

    ctx.save();
    ctx.translate(player.x, player.y + bob);
    ctx.shadowColor = "rgba(126,244,255,0.45)";
    ctx.shadowBlur = 18;
    ctx.fillStyle = bodyColor;
    ctx.beginPath();
    ctx.arc(0, 0, player.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = "rgba(200,250,255,0.95)";
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(player.x, player.y + bob);
    ctx.lineTo(
      player.x + Math.cos(armAngle) * weaponLength,
      player.y + bob + Math.sin(armAngle) * weaponLength
    );
    ctx.stroke();

    ctx.fillStyle = "#03131a";
    const eyeOffset = 6;
    ctx.beginPath();
    ctx.arc(
      player.x + Math.cos(player.angle - 0.55) * eyeOffset,
      player.y + bob + Math.sin(player.angle - 0.55) * eyeOffset,
      2.7,
      0,
      Math.PI * 2
    );
    ctx.arc(
      player.x + Math.cos(player.angle + 0.55) * eyeOffset,
      player.y + bob + Math.sin(player.angle + 0.55) * eyeOffset,
      2.7,
      0,
      Math.PI * 2
    );
    ctx.fill();

    if (player.muzzleFlash > 0) {
      const muzzleX = player.x + Math.cos(player.angle) * (weaponLength + 3);
      const muzzleY = player.y + bob + Math.sin(player.angle) * (weaponLength + 3);

      ctx.save();
      ctx.shadowColor = player.weapon === "shotgun" ? "rgba(255,220,120,1)" : "rgba(135,247,255,1)";
      ctx.shadowBlur = 22;
      ctx.fillStyle = player.weapon === "shotgun" ? "#ffe39d" : "#bffcff";
      ctx.beginPath();
      ctx.arc(muzzleX, muzzleY, player.weapon === "shotgun" ? 7 : 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  for (const p of game.particles) {
    const alpha = p.life / p.maxLife;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  ctx.restore();

  drawVignette();
  drawMinimap();
  drawCrosshair();
}

function drawVignette() {
  const gradient = ctx.createRadialGradient(
    cw * 0.5,
    ch * 0.5,
    Math.min(cw, ch) * 0.2,
    cw * 0.5,
    ch * 0.5,
    Math.max(cw, ch) * 0.7
  );
  gradient.addColorStop(0, "rgba(0,0,0,0)");
  gradient.addColorStop(1, "rgba(0,0,0,0.55)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, cw, ch);
}

function drawCrosshair() {
  const mx = clamp(input.mouseX, 0, cw);
  const my = clamp(input.mouseY, 0, ch);
  const pulse = 1 + Math.sin(performance.now() * 0.01) * 0.06;
  const size = input.mouseDown ? 8 : 11;

  ctx.save();
  ctx.translate(mx, my);
  ctx.strokeStyle = input.mouseDown ? "rgba(255,244,175,0.95)" : "rgba(220,250,255,0.95)";
  ctx.lineWidth = 2;

  ctx.beginPath();
  ctx.moveTo(-size * pulse, 0);
  ctx.lineTo(-3, 0);
  ctx.moveTo(size * pulse, 0);
  ctx.lineTo(3, 0);
  ctx.moveTo(0, -size * pulse);
  ctx.lineTo(0, -3);
  ctx.moveTo(0, size * pulse);
  ctx.lineTo(0, 3);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(0, 0, 2.2, 0, Math.PI * 2);
  ctx.fillStyle = input.mouseDown ? "#ffe99e" : "#d6fbff";
  ctx.fill();

  ctx.restore();
}

function drawMinimap() {
  if (!game.player) return;

  const size = Math.min(190, Math.max(130, cw * 0.14));
  const x = cw - size - 18;
  const y = ch - size - 18;
  const sx = size / WORLD_W;
  const sy = size / WORLD_H;

  ctx.save();
  ctx.fillStyle = "rgba(8,14,22,0.82)";
  ctx.strokeStyle = "rgba(98,238,255,0.25)";
  ctx.lineWidth = 1;
  ctx.fillRect(x, y, size, size);
  ctx.strokeRect(x, y, size, size);

  for (let row = 0; row < MAP_ROWS; row++) {
    for (let col = 0; col < MAP_COLS; col++) {
      ctx.fillStyle = game.map[row][col] === 1 ? "rgba(85,110,130,0.95)" : "rgba(18,35,45,0.95)";
      ctx.fillRect(x + col * TILE * sx, y + row * TILE * sy, TILE * sx + 1, TILE * sy + 1);
    }
  }

  for (const pickup of game.pickups) {
    ctx.fillStyle = PICKUPS[pickup.type].color;
    ctx.fillRect(x + pickup.x * sx - 2, y + pickup.y * sy - 2, 4, 4);
  }

  for (const zombie of game.zombies) {
    ctx.fillStyle = zombie.isBoss ? "#ff6cf3" : "#ff646b";
    ctx.fillRect(x + zombie.x * sx - 1.5, y + zombie.y * sy - 1.5, 3, 3);
  }

  ctx.fillStyle = "#8df8ff";
  ctx.beginPath();
  ctx.arc(x + game.player.x * sx, y + game.player.y * sy, 3.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

let lastTime = performance.now();

function loop(now) {
  const dt = Math.min(0.033, (now - lastTime) / 1000);
  lastTime = now;

  if (game.state === "start") {
    drawBackgroundOnly(now * 0.001);
  } else {
    if (game.state === "playing") {
      updatePlaying(dt);
      updateHUD();
    }

    drawGame();

    if (game.state === "paused" || game.state === "gameover") {
      ctx.fillStyle = game.state === "paused" ? "rgba(0,0,0,0.36)" : "rgba(0,0,0,0.46)";
      ctx.fillRect(0, 0, cw, ch);
    }
  }

  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

document.addEventListener("keydown", (e) => {
  const key = e.key.toLowerCase();
  input.keys[key] = true;

  if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key)) {
    e.preventDefault();
  }

  if (key === "1") useWeaponByIndex(0);
  if (key === "2") useWeaponByIndex(1);
  if (key === "3") useWeaponByIndex(2);
  if (key === "escape" && game.state !== "start") togglePause();
});

document.addEventListener("keyup", (e) => {
  input.keys[e.key.toLowerCase()] = false;
});

canvas.addEventListener("mousemove", (e) => {
  const rect = canvas.getBoundingClientRect();
  input.mouseX = e.clientX - rect.left;
  input.mouseY = e.clientY - rect.top;
});

canvas.addEventListener("mousedown", () => {
  input.mouseDown = true;
});

document.addEventListener("mouseup", () => {
  input.mouseDown = false;
});

canvas.addEventListener("contextmenu", (e) => e.preventDefault());

document.getElementById("startBtn").addEventListener("click", startGame);
document.getElementById("guestBtn").addEventListener("click", () => {
  playerNameInput.value = "Guest";
  startGame();
});
document.getElementById("resumeBtn").addEventListener("click", togglePause);
document.getElementById("restartFromPauseBtn").addEventListener("click", startGame);
document.getElementById("restartBtn").addEventListener("click", startGame);
document.getElementById("menuBtn").addEventListener("click", returnToMenu);

playerNameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") startGame();
});

buildMap();
populateScoreboard();