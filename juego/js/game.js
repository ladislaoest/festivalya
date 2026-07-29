(() => {
    'use strict';

    // --- Lienzo y resolución lógica del mundo (se escala por CSS al tamaño real) ---
    const canvas = document.getElementById('game-canvas');
    const ctx = canvas.getContext('2d');
    const WORLD_W = 960, WORLD_H = 600;

    function resizeCanvas() {
        const dpr = window.devicePixelRatio || 1;
        canvas.width = WORLD_W * dpr;
        canvas.height = WORLD_H * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        // Ajuste del tamaño visible: todo el mundo visible sin recortar,
        // respetando el hueco disponible en pantalla (importante en móvil,
        // donde el viewport es mucho más alto que ancho que el mundo 960x600).
        const wrap = document.getElementById('game-wrap');
        const availW = wrap.clientWidth - 4;
        const availH = wrap.clientHeight - 4;
        const scale = Math.min(availW / WORLD_W, availH / WORLD_H);
        canvas.style.width = `${WORLD_W * scale}px`;
        canvas.style.height = `${WORLD_H * scale}px`;
    }
    window.addEventListener('resize', resizeCanvas);

    // --- Detección de dispositivo táctil (muestra el D-Pad en pantalla) ---
    if (('ontouchstart' in window) || navigator.maxTouchPoints > 0) {
        document.body.classList.add('touch-device');
    }

    // --- Constantes de juego ---
    const PLAYER_R = 20;
    const PLAYER_SPEED = 190;
    const PLAYER_SPEED_TIRED = 105;
    const PLAYER_SPEED_BOOST = 260;
    const CHAVALA_R = 17;
    const CHAVALA_BASE_SPEED = 128;
    const CHASE_RANGE = 230;
    const ENERGY_DRAIN_RATE = 14;
    const ENERGY_REGEN_RATE = 4;
    const CATCH_ENERGY_LOSS = 35;
    const CATCH_INVULN_TIME = 1.6;
    const BOLSITA_TIME_LIMIT = 15;
    const BOLSITA_SPAWN_MIN = 10, BOLSITA_SPAWN_MAX = 18;
    const CUBATA_MAX_ON_FIELD = 5;
    const CUBATA_RESPAWN_DELAY = 1.2;
    const MAX_CHAVALAS = 5;
    const CHAVALA_EVERY_POINTS = 300;

    // --- Escenario: barras, baño y escenario decorativo ---
    const bars = [
        { x: 70, y: 70, w: 110, h: 60, label: 'BARRA' },
        { x: WORLD_W - 180, y: 70, w: 110, h: 60, label: 'BARRA' },
        { x: 70, y: WORLD_H - 130, w: 110, h: 60, label: 'BARRA' },
        { x: WORLD_W - 180, y: WORLD_H - 130, w: 110, h: 60, label: 'BARRA' }
    ];
    const bathroom = { x: WORLD_W / 2 - 55, y: WORLD_H - 70, w: 110, h: 50, label: 'BAÑO' };
    const stage = { x: WORLD_W / 2 - 100, y: 20, w: 200, h: 44 };

    const solids = [...bars, bathroom];

    function rectsOverlap(ax, ay, ar, rect, margin) {
        margin = margin || 0;
        return ax + ar > rect.x - margin && ax - ar < rect.x + rect.w + margin &&
               ay + ar > rect.y - margin && ay - ar < rect.y + rect.h + margin;
    }

    function randomFreePosition(r) {
        for (let i = 0; i < 30; i++) {
            const x = 40 + Math.random() * (WORLD_W - 80);
            const y = 110 + Math.random() * (WORLD_H - 200);
            if (!solids.some(s => rectsOverlap(x, y, r + 14, s, 10)) && !rectsOverlap(x, y, r + 14, stage, 10)) {
                return { x, y };
            }
        }
        return { x: WORLD_W / 2, y: WORLD_H / 2 };
    }

    // --- Estado del juego ---
    let running = false;
    let score = 0;
    let highScore = Number(localStorage.getItem('bradwather_highscore') || 0);
    let cubatas = [];
    let bolsita = null; // { x, y } o null si no hay ninguna en el campo
    let nextBolsitaAt = 0;
    let elapsed = 0;
    let chavalas = [];
    let particles = []; // pequeños textos flotantes ("+10", "¡RECARGA!"...)

    const player = {
        x: WORLD_W / 2, y: WORLD_H / 2 + 40, r: PLAYER_R,
        facing: 1,
        energy: 100,
        invuln: 0,
        boost: 0,
        carryingBolsita: false,
        bolsitaTimer: 0
    };

    function resetGame() {
        score = 0;
        elapsed = 0;
        player.x = WORLD_W / 2; player.y = WORLD_H / 2 + 40;
        player.energy = 100;
        player.invuln = 0;
        player.boost = 0;
        player.carryingBolsita = false;
        player.bolsitaTimer = 0;
        particles = [];

        cubatas = [];
        for (let i = 0; i < CUBATA_MAX_ON_FIELD; i++) spawnCubata();

        bolsita = null;
        nextBolsitaAt = BOLSITA_SPAWN_MIN + Math.random() * (BOLSITA_SPAWN_MAX - BOLSITA_SPAWN_MIN);

        chavalas = [];
        spawnChavala(); spawnChavala();
    }

    function spawnCubata() {
        const pos = randomFreePosition(10);
        cubatas.push({ x: pos.x, y: pos.y, r: 11 });
    }

    function spawnChavala() {
        // Aparecen pegadas a un borde del recinto, nunca encima del jugador.
        const edge = Math.floor(Math.random() * 4);
        let x, y;
        if (edge === 0) { x = 20; y = Math.random() * WORLD_H; }
        else if (edge === 1) { x = WORLD_W - 20; y = Math.random() * WORLD_H; }
        else if (edge === 2) { x = Math.random() * WORLD_W; y = 20; }
        else { x = Math.random() * WORLD_W; y = WORLD_H - 20; }

        const hueOptions = ['#ff6fa5', '#ff8f6b', '#c86bff', '#ff5c8a', '#ffb04d'];
        chavalas.push({
            x, y, r: CHAVALA_R,
            color: hueOptions[Math.floor(Math.random() * hueOptions.length)],
            speedMul: 0.9 + Math.random() * 0.25,
            bob: Math.random() * Math.PI * 2
        });
    }

    function addParticle(x, y, text, color) {
        particles.push({ x, y, text, color: color || '#fff', life: 1.0 });
    }

    // --- Entrada: teclado + D-Pad táctil ---
    const keys = {};
    window.addEventListener('keydown', (e) => { keys[e.key.toLowerCase()] = true; });
    window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });

    const touchDir = { up: false, down: false, left: false, right: false };
    document.querySelectorAll('.dpad-btn').forEach(btn => {
        const dir = btn.dataset.dir;
        const press = (e) => { e.preventDefault(); touchDir[dir] = true; btn.classList.add('pressed'); };
        const release = (e) => { e.preventDefault(); touchDir[dir] = false; btn.classList.remove('pressed'); };
        btn.addEventListener('touchstart', press, { passive: false });
        btn.addEventListener('touchend', release, { passive: false });
        btn.addEventListener('touchcancel', release, { passive: false });
        btn.addEventListener('mousedown', press);
        btn.addEventListener('mouseup', release);
        btn.addEventListener('mouseleave', release);
    });

    function readInput() {
        let dx = 0, dy = 0;
        if (keys['arrowup'] || keys['w'] || touchDir.up) dy -= 1;
        if (keys['arrowdown'] || keys['s'] || touchDir.down) dy += 1;
        if (keys['arrowleft'] || keys['a'] || touchDir.left) dx -= 1;
        if (keys['arrowright'] || keys['d'] || touchDir.right) dx += 1;
        if (dx !== 0 && dy !== 0) { dx *= 0.7071; dy *= 0.7071; }
        return { dx, dy };
    }

    // --- Audio mínimo (sin archivos externos, generado con WebAudio) ---
    let audioCtx = null;
    function beep(freq, duration, type, gain) {
        try {
            if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = audioCtx.createOscillator();
            const g = audioCtx.createGain();
            osc.type = type || 'sine';
            osc.frequency.value = freq;
            g.gain.value = gain || 0.08;
            osc.connect(g); g.connect(audioCtx.destination);
            osc.start();
            g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
            osc.stop(audioCtx.currentTime + duration);
        } catch (err) { /* Audio no disponible: se ignora, no es crítico para jugar */ }
    }

    // --- Bucle principal ---
    let lastTs = 0;

    function update(dt) {
        elapsed += dt;
        const input = readInput();
        if (input.dx !== 0) player.facing = input.dx > 0 ? 1 : -1;

        let speed = PLAYER_SPEED;
        if (player.boost > 0) speed = PLAYER_SPEED_BOOST;
        else if (player.energy <= 0) speed = PLAYER_SPEED_TIRED;

        player.x += input.dx * speed * dt;
        player.y += input.dy * speed * dt;
        player.x = Math.max(PLAYER_R, Math.min(WORLD_W - PLAYER_R, player.x));
        player.y = Math.max(PLAYER_R, Math.min(WORLD_H - PLAYER_R, player.y));

        if (player.invuln > 0) player.invuln -= dt;
        if (player.boost > 0) player.boost -= dt;

        // Cubatas: recoger = puntos
        for (let i = cubatas.length - 1; i >= 0; i--) {
            const c = cubatas[i];
            const dist = Math.hypot(player.x - c.x, player.y - c.y);
            if (dist < player.r + c.r) {
                cubatas.splice(i, 1);
                score += 10;
                addParticle(c.x, c.y, '+10', '#f2c85c');
                beep(880, 0.12, 'triangle', 0.07);
                setTimeout(spawnCubata, CUBATA_RESPAWN_DELAY * 1000);
                maybeSpawnChavalaByScore();
            }
        }

        // Bolsita: aparición aleatoria si no hay ninguna y el jugador no lleva una
        if (!bolsita && !player.carryingBolsita) {
            nextBolsitaAt -= dt;
            if (nextBolsitaAt <= 0) {
                const pos = randomFreePosition(9);
                bolsita = { x: pos.x, y: pos.y, r: 10 };
            }
        }
        if (bolsita) {
            const dist = Math.hypot(player.x - bolsita.x, player.y - bolsita.y);
            if (dist < player.r + bolsita.r) {
                bolsita = null;
                player.carryingBolsita = true;
                player.bolsitaTimer = BOLSITA_TIME_LIMIT;
                addParticle(player.x, player.y - 30, '¡AL BAÑO!', '#7fd4ff');
                beep(520, 0.15, 'square', 0.06);
            }
        }

        if (player.carryingBolsita) {
            player.bolsitaTimer -= dt;
            if (player.bolsitaTimer <= 0) {
                player.carryingBolsita = false;
                addParticle(player.x, player.y - 30, 'se perdió...', '#9a9aa2');
                nextBolsitaAt = BOLSITA_SPAWN_MIN + Math.random() * (BOLSITA_SPAWN_MAX - BOLSITA_SPAWN_MIN);
            } else if (rectsOverlap(player.x, player.y, player.r, bathroom, 6)) {
                player.carryingBolsita = false;
                player.energy = 100;
                player.boost = 3;
                player.invuln = Math.max(player.invuln, 2);
                score += 25;
                addParticle(player.x, player.y - 30, '¡ENERGÍA A TOPE!', '#3fb950');
                beep(660, 0.1, 'sine', 0.08);
                beep(990, 0.15, 'sine', 0.08);
                nextBolsitaAt = BOLSITA_SPAWN_MIN + Math.random() * (BOLSITA_SPAWN_MAX - BOLSITA_SPAWN_MIN);
            }
        }

        // Chavalas: persiguen al jugador
        let minDist = Infinity;
        chavalas.forEach(ch => {
            ch.bob += dt * 6;
            const dist = Math.hypot(player.x - ch.x, player.y - ch.y);
            minDist = Math.min(minDist, dist);
            if (dist > 1) {
                const speed = CHAVALA_BASE_SPEED * ch.speedMul;
                ch.x += (player.x - ch.x) / dist * speed * dt;
                ch.y += (player.y - ch.y) / dist * speed * dt;
            }
            if (dist < player.r + ch.r && player.invuln <= 0) {
                if (player.energy > 0) {
                    player.energy = Math.max(0, player.energy - CATCH_ENERGY_LOSS);
                    player.invuln = CATCH_INVULN_TIME;
                    const away = Math.atan2(player.y - ch.y, player.x - ch.x);
                    player.x += Math.cos(away) * 50;
                    player.y += Math.sin(away) * 50;
                    addParticle(player.x, player.y - 30, '¡TE PILLÓ!', '#e5484d');
                    beep(180, 0.2, 'sawtooth', 0.1);
                    const pos = randomFreePosition(CHAVALA_R);
                    ch.x = pos.x; ch.y = pos.y;
                } else {
                    gameOver('caught');
                }
            }
        });

        // Energía: se agota si hay alguna chavala cerca, se recupera si estás a salvo
        if (minDist < CHASE_RANGE) {
            player.energy = Math.max(0, player.energy - ENERGY_DRAIN_RATE * dt);
        } else {
            player.energy = Math.min(100, player.energy + ENERGY_REGEN_RATE * dt);
        }

        particles.forEach(p => { p.y -= 24 * dt; p.life -= dt * 0.9; });
        particles = particles.filter(p => p.life > 0);

        document.getElementById('hud-score').textContent = `🍹 ${score}`;
        document.getElementById('hud-best').textContent = `🏆 ${Math.max(score, highScore)}`;
    }

    function maybeSpawnChavalaByScore() {
        const target = Math.min(MAX_CHAVALAS, 2 + Math.floor(score / CHAVALA_EVERY_POINTS));
        if (chavalas.length < target) spawnChavala();
    }

    // --- Dibujado ---
    function drawStall(rect, color, label) {
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fillRect(rect.x + 4, rect.y + rect.h - 6, rect.w, 10);
        ctx.fillStyle = '#4a2f1c';
        ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
        ctx.fillStyle = color;
        ctx.fillRect(rect.x - 6, rect.y - 16, rect.w + 12, 18);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(label, rect.x + rect.w / 2, rect.y + rect.h / 2 + 5);
    }

    function drawCubata(c) {
        const bob = Math.sin(elapsed * 4 + c.x) * 2;
        ctx.save();
        ctx.translate(c.x, c.y + bob);
        ctx.fillStyle = '#e8e8e8';
        ctx.fillRect(-6, -10, 12, 16);
        ctx.fillStyle = '#e8912e';
        ctx.fillRect(-6, -2, 12, 8);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(4, -12); ctx.lineTo(7, -20); ctx.stroke();
        ctx.restore();
    }

    function drawBolsita(b) {
        const pulse = 1 + Math.sin(elapsed * 8) * 0.15;
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.scale(pulse, pulse);
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.strokeStyle = '#7fd4ff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-8, -8); ctx.lineTo(8, -8); ctx.lineTo(6, 9); ctx.lineTo(-6, 9); ctx.closePath();
        ctx.fill(); ctx.stroke();
        ctx.restore();
    }

    function drawChavala(ch) {
        const bob = Math.sin(ch.bob) * 3;
        ctx.save();
        ctx.translate(ch.x, ch.y + bob);
        // Vestido
        ctx.fillStyle = ch.color;
        ctx.beginPath();
        ctx.moveTo(-11, 10); ctx.lineTo(-6, -10); ctx.lineTo(6, -10); ctx.lineTo(11, 10);
        ctx.closePath(); ctx.fill();
        // Cabeza
        ctx.fillStyle = '#ffd9b3';
        ctx.beginPath(); ctx.arc(0, -16, 8, 0, Math.PI * 2); ctx.fill();
        // Pelo
        ctx.fillStyle = '#3a2416';
        ctx.beginPath(); ctx.arc(0, -19, 8.5, Math.PI, Math.PI * 2.15); ctx.fill();
        ctx.restore();
    }

    function drawPlayer() {
        const flash = player.invuln > 0 && Math.floor(elapsed * 12) % 2 === 0;
        ctx.save();
        ctx.translate(player.x, player.y);
        ctx.scale(player.facing, 1);
        if (flash) ctx.globalAlpha = 0.4;

        if (player.boost > 0) {
            ctx.strokeStyle = 'rgba(63, 185, 80, 0.6)';
            ctx.lineWidth = 3;
            ctx.beginPath(); ctx.arc(0, 0, PLAYER_R + 6, 0, Math.PI * 2); ctx.stroke();
        }

        // Piernas (vaqueros)
        ctx.fillStyle = '#3a5c8a';
        ctx.fillRect(-10, 6, 8, 16);
        ctx.fillRect(2, 6, 8, 16);
        // Sudadera gris
        ctx.fillStyle = '#8a8a8f';
        ctx.beginPath();
        ctx.moveTo(-13, 10); ctx.lineTo(-13, -8); ctx.quadraticCurveTo(0, -16, 13, -8); ctx.lineTo(13, 10);
        ctx.closePath(); ctx.fill();
        // Cabeza
        ctx.fillStyle = '#e0ac7a';
        ctx.beginPath(); ctx.arc(0, -16, 9, 0, Math.PI * 2); ctx.fill();
        // Pelo + barba corta
        ctx.fillStyle = '#2a1c12';
        ctx.beginPath(); ctx.arc(0, -19, 9.5, Math.PI, Math.PI * 2); ctx.fill();
        ctx.fillRect(-5, -13, 10, 4);
        // Vaso en la mano
        ctx.fillStyle = '#e8e8e8';
        ctx.fillRect(11, -4, 6, 9);

        ctx.restore();

        if (player.carryingBolsita) {
            ctx.save();
            ctx.translate(player.x, player.y - 40);
            ctx.font = '18px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('🛍️', 0, 0);
            ctx.restore();
        }
    }

    function drawEnergyBar() {
        const barW = 220, barH = 14;
        const x = WORLD_W / 2 - barW / 2, y = WORLD_H - 22;
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(x - 3, y - 3, barW + 6, barH + 6);
        ctx.fillStyle = '#2a2a30';
        ctx.fillRect(x, y, barW, barH);
        const pct = player.energy / 100;
        ctx.fillStyle = pct > 0.35 ? '#3fb950' : '#e5484d';
        ctx.fillRect(x, y, barW * pct, barH);
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.strokeRect(x, y, barW, barH);

        if (player.carryingBolsita) {
            const tPct = Math.max(0, player.bolsitaTimer / BOLSITA_TIME_LIMIT);
            ctx.fillStyle = '#7fd4ff';
            ctx.fillRect(x, y - 10, barW * tPct, 5);
        }
    }

    function draw() {
        // Césped
        ctx.fillStyle = '#2f7d3d';
        ctx.fillRect(0, 0, WORLD_W, WORLD_H);
        ctx.fillStyle = 'rgba(0,0,0,0.06)';
        for (let i = 0; i < 40; i++) {
            const gx = (i * 137) % WORLD_W, gy = (i * 251) % WORLD_H;
            ctx.fillRect(gx, gy, 3, 3);
        }

        // Escenario decorativo
        ctx.fillStyle = '#1c1d23';
        ctx.fillRect(stage.x, stage.y, stage.w, stage.h);
        ctx.fillStyle = '#d9a935';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('ESCENARIO', stage.x + stage.w / 2, stage.y + stage.h / 2 + 4);

        bars.forEach(b => drawStall(b, '#c0392b', b.label));
        drawStall(bathroom, '#2f7dbf', bathroom.label);

        cubatas.forEach(drawCubata);
        if (bolsita) drawBolsita(bolsita);
        chavalas.forEach(drawChavala);
        drawPlayer();

        particles.forEach(p => {
            ctx.globalAlpha = Math.max(0, p.life);
            ctx.fillStyle = p.color;
            ctx.font = 'bold 14px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(p.text, p.x, p.y);
            ctx.globalAlpha = 1;
        });

        drawEnergyBar();
    }

    function loop(ts) {
        if (!running) return;
        const dt = Math.min(0.05, (ts - lastTs) / 1000 || 0);
        lastTs = ts;
        update(dt);
        draw();
        requestAnimationFrame(loop);
    }

    // --- Flujo de pantallas ---
    function startGame() {
        resetGame();
        document.getElementById('start-screen').classList.add('hidden');
        document.getElementById('gameover-screen').classList.add('hidden');
        running = true;
        lastTs = performance.now();
        requestAnimationFrame(loop);
    }

    function gameOver(reason) {
        running = false;
        if (score > highScore) {
            highScore = score;
            localStorage.setItem('bradwather_highscore', String(highScore));
        }
        document.getElementById('gameover-reason').textContent = reason === 'caught'
            ? 'Sin energía para escapar, las chavalas te han cazado.'
            : 'Se acabó la fiesta por hoy.';
        document.getElementById('final-score').textContent = score;
        document.getElementById('final-best').textContent = highScore;
        document.getElementById('gameover-screen').classList.remove('hidden');
        beep(140, 0.4, 'sawtooth', 0.12);
    }

    document.getElementById('btn-start').addEventListener('click', startGame);
    document.getElementById('btn-retry').addEventListener('click', startGame);
    document.getElementById('hud-best').textContent = `🏆 ${highScore}`;

    resizeCanvas();
    resetGame();
    draw();
})();
