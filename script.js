const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const TILE = 50;
const MAP_ROWS = 20;
const MAP_COLS = 35;

let map = [];

let player = { x: 0, y: 0, size: 20, speed: 3, health: 100 };
let bullets = [], zombies = [], zombieBullets = [], powerups = [];
let wave = 1, kills = 0;
let keys = {}, mouseX = 0, mouseY = 0, mouseDown = false;
let camX = 0, camY = 0;
let startTime, elapsedTime = 0;
let activePowerups = { speed: 0, damage: 0 };

const startScreen = document.getElementById("startScreen");
const playerLabel = document.getElementById("playerLabel");
const ui = document.getElementById("ui");
const healthEl = document.getElementById("health");
const waveEl = document.getElementById("wave");
const killsEl = document.getElementById("kills");
const timeEl = document.getElementById("time");
const powerupsEl = document.getElementById("powerups");
const scoreboard = document.getElementById("scoreboard");
const scoresTable = document.getElementById("scoresTable");
const restartBtn = document.getElementById("restartBtn");

document.addEventListener("keydown", e => keys[e.key.toLowerCase()] = true);
document.addEventListener("keyup", e => keys[e.key.toLowerCase()] = false);
canvas.addEventListener("mousemove", e => { mouseX = e.clientX; mouseY = e.clientY; });
canvas.addEventListener("mousedown", () => mouseDown = true);
canvas.addEventListener("mouseup", () => mouseDown = false);

document.getElementById("startBtn").onclick = startGame;
document.getElementById("guestBtn").onclick = () => { document.getElementById("playerName").value = "Guest"; startGame(); };
restartBtn.onclick = () => { scoreboard.style.display = "none"; startScreen.style.display = "flex"; generateMap(); };

function generateMap() {
    map = [];
    for (let r = 0; r < MAP_ROWS; r++) {
        map[r] = [];
        for (let c = 0; c < MAP_COLS; c++) {
            // outer walls
            if (r === 0 || r === MAP_ROWS - 1 || c === 0 || c === MAP_COLS - 1) map[r][c] = 1;
            else map[r][c] = 0;
        }
    }

    // add random internal walls (like obstacles)
    for (let i = 0; i < 70; i++) {
        let rw = Math.floor(Math.random() * (MAP_ROWS - 2)) + 1;
        let cw = Math.floor(Math.random() * (MAP_COLS - 2)) + 1;
        map[rw][cw] = 1;
    }
}

// find free tile for player spawn
function findFreeTile() {
    for (let r = 1; r < MAP_ROWS - 1; r++) {
        for (let c = 1; c < MAP_COLS - 1; c++) {
            if (map[r][c] === 0) return { x: c * TILE + TILE / 2, y: r * TILE + TILE / 2 };
        }
    }
    return { x: TILE * 2, y: TILE * 2 };
}

// zombies spawn at edges
function randomSpawnPoint() {
    const edge = Math.floor(Math.random() * 4);
    let x, y;
    if (edge === 0) { x = TILE; y = Math.random() * MAP_ROWS * TILE; }
    if (edge === 1) { x = MAP_COLS * TILE - TILE; y = Math.random() * MAP_ROWS * TILE; }
    if (edge === 2) { x = Math.random() * MAP_COLS * TILE; y = TILE; }
    if (edge === 3) { x = Math.random() * MAP_COLS * TILE; y = MAP_ROWS * TILE - TILE; }
    return { x, y };
}

function spawnZombies(n) {
    for (let i = 0; i < n; i++) {
        const p = randomSpawnPoint();
        const type = Math.random() < 0.2 ? "shooter" : Math.random() < 0.4 ? "fast" : Math.random() < 0.6 ? "tank" : "normal";
        zombies.push({
            x: p.x,
            y: p.y,
            size: type === "tank" ? 40 : 30,
            speed: type === "fast" ? 2 : type === "tank" ? 0.8 : 1.2,
            type: type,
            health: type === "tank" ? 5 : 3,
            shootTimer: 0
        });
    }
}

function spawnPowerup() {
    const types = ["speed", "health", "damage"];
    const p = { x: Math.random() * (MAP_COLS * TILE - 50) + 25, y: Math.random() * (MAP_ROWS * TILE - 50) + 25, type: types[Math.floor(Math.random() * types.length)], active: false, duration: 0 };
    powerups.push(p);
}

function shoot() {
    const angle = Math.atan2(mouseY - canvas.height / 2, mouseX - canvas.width / 2);
    bullets.push({ x: player.x, y: player.y, dx: Math.cos(angle) * (10 + activePowerups.damage * 2), dy: Math.sin(angle) * (10 + activePowerups.damage * 2), size: 6 });
}

setInterval(() => { if (mouseDown) shoot(); }, 150);

function checkCollision(x, y) {
    const row = Math.floor(y / TILE);
    const col = Math.floor(x / TILE);
    if (row < 0 || row >= MAP_ROWS || col < 0 || col >= MAP_COLS) return true;
    return map[row][col] === 1;
}

function update() {
    // player movement
    let speed = player.speed + (activePowerups.speed || 0);
    if (keys["w"] && !checkCollision(player.x, player.y - speed)) player.y -= speed;
    if (keys["s"] && !checkCollision(player.x, player.y + speed)) player.y += speed;
    if (keys["a"] && !checkCollision(player.x - speed, player.y)) player.x -= speed;
    if (keys["d"] && !checkCollision(player.x + speed, player.y)) player.x += speed;

    // bullets
    bullets.forEach((b, i) => {
        let nx = b.x + b.dx, ny = b.y + b.dy;
        if (checkCollision(nx, ny)) return bullets.splice(i, 1);
        b.x = nx; b.y = ny;
        zombies.forEach((z, zi) => {
            if (Math.hypot(b.x - z.x, b.y - z.y) < z.size / 2) { z.health--; bullets.splice(i, 1); if (z.health <= 0) { zombies.splice(zi, 1); kills++; } }
        });
    });

    // zombies with wall avoidance
    zombies.forEach(z => {
        const dx = player.x - z.x, dy = player.y - z.y, dist = Math.hypot(dx, dy);
        if (dist > 0) {
            let nx = z.x + (dx / dist) * z.speed;
            let ny = z.y + (dy / dist) * z.speed;
            if (!checkCollision(nx, ny)) { z.x = nx; z.y = ny; }
            else {
                let try1 = { x: z.x - dy / dist * z.speed, y: z.y + dx / dist * z.speed };
                let try2 = { x: z.x + dy / dist * z.speed, y: z.y - dx / dist * z.speed };
                if (!checkCollision(try1.x, try1.y)) { z.x = try1.x; z.y = try1.y; }
                else if (!checkCollision(try2.x, try2.y)) { z.x = try2.x; z.y = try2.y; }
            }
        }

        // collision with player
        if (dist < (player.size + z.size) / 2) player.health -= 0.3;

        // shooter zombies
        if (z.type === "shooter") { z.shootTimer++; if (z.shootTimer > 100) { const angle = Math.atan2(player.y - z.y, player.x - z.x); zombieBullets.push({ x: z.x, y: z.y, dx: Math.cos(angle) * 4, dy: Math.sin(angle) * 4, size: 5 }); z.shootTimer = 0; } }
    });

    // zombie bullets
    zombieBullets.forEach((zb, i) => {
        if (checkCollision(zb.x + zb.dx, zb.y + zb.dy)) { zombieBullets.splice(i, 1); return; }
        zb.x += zb.dx; zb.y += zb.dy;
        if (Math.hypot(zb.x - player.x, zb.y - player.y) < player.size / 2) { player.health -= 1; zombieBullets.splice(i, 1); }
    });

    // powerups
    powerups.forEach((p, i) => {
        if (Math.hypot(player.x - p.x, player.y - p.y) < player.size / 2 + 10) {
            p.active = true;
            if (p.type === "health") { player.health = Math.min(player.health + 20, 100); powerups.splice(i, 1); }
            else { activePowerups[p.type] = 5 * 60; powerups.splice(i, 1); }
        }
    });

    Object.keys(activePowerups).forEach(k => { if (activePowerups[k] > 0) activePowerups[k]--; });

    // next wave
    if (zombies.length === 0) { wave++; spawnZombies(10 + wave * 2); spawnPowerup(); }

    // camera
    camX = player.x - canvas.width / 2;
    camY = player.y - canvas.height / 2;

    // UI
    healthEl.textContent = Math.floor(player.health);
    waveEl.textContent = wave;
    killsEl.textContent = kills;
    elapsedTime = Math.floor((Date.now() - startTime) / 1000);
    timeEl.textContent = elapsedTime;
    powerupsEl.textContent = "Boosters active: " + Object.keys(activePowerups).filter(k => activePowerups[k] > 0).join(", ");

    if (player.health <= 0) { saveScore(); showScoreboard(); }
}

function draw() {
    ctx.fillStyle = "#222"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.save(); ctx.translate(-camX, -camY);

    // map
    for (let r = 0; r < MAP_ROWS; r++) {
        for (let c = 0; c < MAP_COLS; c++) {
            ctx.fillStyle = map[r][c] ? "#666" : "#333";
            ctx.fillRect(c * TILE, r * TILE, TILE, TILE);
        }
    }

    // powerups
    powerups.forEach(p => {
        ctx.fillStyle = p.type === "speed" ? "#0f0" : p.type === "damage" ? "#ff0" : "#f00";
        ctx.beginPath(); ctx.arc(p.x, p.y, 10, 0, Math.PI * 2); ctx.fill();
    });

    // player stickman
    ctx.strokeStyle = "cyan"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(player.x, player.y, player.size / 2, 0, Math.PI * 2); ctx.stroke();
    let angle = Math.atan2(mouseY - canvas.height / 2, mouseX - canvas.width / 2);
    ctx.beginPath(); ctx.moveTo(player.x, player.y); ctx.lineTo(player.x + Math.cos(angle) * player.size, player.y + Math.sin(angle) * player.size); ctx.stroke();

    // zombies
    zombies.forEach(z => {
        ctx.fillStyle = z.type === "tank" ? "#800" : z.type === "fast" ? "#f55" : z.type === "shooter" ? "#f80" : "#f00";
        ctx.fillRect(z.x - z.size / 2, z.y - z.size / 2, z.size, z.size);
    });

    // bullets
    bullets.forEach(b => { ctx.fillStyle = "#0ff"; ctx.shadowColor = "#0ff"; ctx.shadowBlur = 10; ctx.fillRect(b.x - b.size / 2, b.y - b.size / 2, b.size, b.size); });
    ctx.shadowBlur = 0;
    zombieBullets.forEach(b => { ctx.fillStyle = "orange"; ctx.fillRect(b.x - b.size / 2, b.y - b.size / 2, b.size, b.size); });

    ctx.restore();

    // crosshair
    ctx.fillStyle = "white";
    ctx.fillRect(canvas.width / 2 - 5, canvas.height / 2, 10, 2);
    ctx.fillRect(canvas.width / 2, canvas.height / 2 - 5, 2, 10);
}

function saveScore() {
    const name = document.getElementById("playerName").value || "Guest";
    const scoreData = { name: name, wave: wave, kills: kills, time: elapsedTime };
    let scores = JSON.parse(localStorage.getItem("scores") || "[]");
    scores.push(scoreData);
    localStorage.setItem("scores", JSON.stringify(scores));
}

function showScoreboard() {
    scoreboard.style.display = "block";
    ui.style.display = "none";
    scoresTable.innerHTML = "";
    const scores = JSON.parse(localStorage.getItem("scores") || "[]");
    scores.forEach(s => {
        const row = document.createElement("tr");
        row.innerHTML = `<td>${s.name}</td><td>${s.wave}</td><td>${s.kills}</td><td>${s.time}</td>`;
        scoresTable.appendChild(row);
    });
}

function startGame() {
    startScreen.style.display = "none";
    ui.style.display = "block";
    generateMap();
    const spawn = findFreeTile();
    player.x = spawn.x;
    player.y = spawn.y;
    playerLabel.textContent = document.getElementById("playerName").value || "Guest";
    player.health = 100;
    bullets = []; zombieBullets = []; zombies = []; wave = 1; kills = 0; elapsedTime = 0; powerups = [];
    activePowerups = { speed: 0, damage: 0 };
    spawnZombies(15); spawnPowerup();
    startTime = Date.now();
    loop();
}

function loop() { if (player.health > 0) { update(); draw(); requestAnimationFrame(loop); } }