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

        const wrap = document.getElementById('game-wrap');
        const availW = wrap.clientWidth - 4;
        const availH = wrap.clientHeight - 4;
        const scale = Math.min(availW / WORLD_W, availH / WORLD_H);
        canvas.style.width = `${WORLD_W * scale}px`;
        canvas.style.height = `${WORLD_H * scale}px`;
    }
    window.addEventListener('resize', resizeCanvas);

    if (('ontouchstart' in window) || navigator.maxTouchPoints > 0) {
        document.body.classList.add('touch-device');
    }

    // --- Sprite real del personaje (recorte del vídeo de referencia) ---
    const playerImg = new Image();
    let playerImgReady = false;
    playerImg.onload = () => { playerImgReady = true; };
    playerImg.src = 'assets/player.png';
    const PLAYER_IMG_H = 78; // alto al que se dibuja en el mundo
    const PLAYER_IMG_W = PLAYER_IMG_H * (playerImg.naturalWidth ? playerImg.naturalWidth / playerImg.naturalHeight : 0.446);

    // --- Constantes de juego (reajustadas: partidas más largas, menos brutal) ---
    const PLAYER_R = 18;
    const PLAYER_SPEED = 200;
    const PLAYER_SPEED_TIRED = 145;
    const PLAYER_SPEED_BOOST = 265;
    const CHAVALA_R = 16;
    const CHAVALA_BASE_SPEED = 92;
    const CHASE_RANGE = 130;
    const ENERGY_DRAIN_RATE = 7;
    const ENERGY_REGEN_RATE = 9;
    const CATCH_ENERGY_LOSS = 18;
    const CATCH_INVULN_TIME = 2.3;
    const START_GRACE_TIME = 2.5;
    const BOLSITA_TIME_LIMIT = 15;
    const BOLSITA_SPAWN_MIN = 10, BOLSITA_SPAWN_MAX = 18;
    const CUBATA_MAX_ON_FIELD = 5;
    const CUBATA_RESPAWN_DELAY = 1.2;
    const MAX_CHAVALAS = 5;
    const CHAVALA_EVERY_POINTS = 450;

    // --- Escenario: barras, baño, escenario decorativo y valla perimetral ---
    const bars = [
        { x: 70, y: 70, w: 110, h: 60, label: 'BARRA' },
        { x: WORLD_W - 180, y: 70, w: 110, h: 60, label: 'BARRA' },
        { x: 70, y: WORLD_H - 130, w: 110, h: 60, label: 'BARRA' },
        { x: WORLD_W - 180, y: WORLD_H - 130, w: 110, h: 60, label: 'BARRA' }
    ];
    const bathroom = { x: WORLD_W / 2 - 55, y: WORLD_H - 70, w: 110, h: 50, label: 'BAÑO' };
    const stage = { x: WORLD_W / 2 - 110, y: 18, w: 220, h: 50 };

    const solids = [...bars, bathroom];

    // Puntos de paso (centro de cada punto de interés) para dibujar "caminos
    // trillados" de tierra entre ellos, como en un recinto real pisoteado.
    const paths = [];
    const hub = { x: WORLD_W / 2, y: WORLD_H / 2 };
    [...bars, bathroom, stage].forEach(s => {
        paths.push({ x1: s.x + s.w / 2, y1: s.y + s.h, x2: hub.x, y2: hub.y });
    });

    // Público decorativo estático (solo ambientación, no interactúa)
    const crowd = [];
    for (let i = 0; i < 26; i++) {
        crowd.push({
            x: 40 + Math.random() * (WORLD_W - 80),
            y: 40 + Math.random() * (WORLD_H - 80),
            hue: ['#ffb4a2', '#a2d2ff', '#cdb4db', '#ffd6a5', '#b9fbc0'][i % 5],
            phase: Math.random() * Math.PI * 2
        });
    }

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
    let bolsita = null;
    let nextBolsitaAt = 0;
    let elapsed = 0;
    let chavalas = [];
    let particles = [];

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
        player.invuln = START_GRACE_TIME;
        player.boost = 0;
        player.carryingBolsita = false;
        player.bolsitaTimer = 0;
        particles = [];

        cubatas = [];
        for (let i = 0; i < CUBATA_MAX_ON_FIELD; i++) spawnCubata();

        bolsita = null;
        nextBolsitaAt = BOLSITA_SPAWN_MIN + Math.random() * (BOLSITA_SPAWN_MAX - BOLSITA_SPAWN_MIN);

        chavalas = [];
        spawnChavala();
    }

    function spawnCubata() {
        const pos = randomFreePosition(10);
        cubatas.push({ x: pos.x, y: pos.y, r: 11 });
    }

    function spawnChavala() {
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
            speedMul: 0.82 + Math.random() * 0.18,
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

    // ==============================
    // --- Motor de sonido (WebAudio, sin archivos externos) ---
    // ==============================
    const SFX = (() => {
        let actx = null;
        let master = null;
        let delaySend = null;
        let noiseBuffer = null;
        let ambienceSource = null;
        let ambienceGain = null;

        function ensure() {
            if (actx) return;
            actx = new (window.AudioContext || window.webkitAudioContext)();
            master = actx.createGain();
            master.gain.value = 0.5;
            master.connect(actx.destination);

            // Pequeño eco por realimentación: da algo de "sala" sin necesitar
            // un impulso de reverb ni archivos de audio externos.
            delaySend = actx.createDelay();
            delaySend.delayTime.value = 0.16;
            const feedback = actx.createGain();
            feedback.gain.value = 0.28;
            const delayGain = actx.createGain();
            delayGain.gain.value = 0.35;
            delaySend.connect(feedback);
            feedback.connect(delaySend);
            delaySend.connect(delayGain);
            delayGain.connect(master);

            // Buffer de ruido blanco reutilizable (percusión + ambiente)
            const len = actx.sampleRate * 2;
            noiseBuffer = actx.createBuffer(1, len, actx.sampleRate);
            const data = noiseBuffer.getChannelData(0);
            for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
        }

        function tone(freq, duration, opts) {
            opts = opts || {};
            ensure();
            const t0 = actx.currentTime;
            const osc = actx.createOscillator();
            osc.type = opts.type || 'sine';
            osc.frequency.setValueAtTime(freq, t0);
            if (opts.sweepTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.sweepTo), t0 + duration);

            const g = actx.createGain();
            g.gain.setValueAtTime(0.0001, t0);
            g.gain.exponentialRampToValueAtTime(opts.gain || 0.16, t0 + Math.min(0.02, duration * 0.2));
            g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

            osc.connect(g);
            g.connect(master);
            if (opts.wet) g.connect(delaySend);
            osc.start(t0);
            osc.stop(t0 + duration + 0.02);
        }

        function noiseBurst(duration, opts) {
            opts = opts || {};
            ensure();
            const t0 = actx.currentTime;
            const src = actx.createBufferSource();
            src.buffer = noiseBuffer;
            const filt = actx.createBiquadFilter();
            filt.type = opts.filterType || 'bandpass';
            filt.frequency.value = opts.freq || 900;
            filt.Q.value = opts.q || 0.8;
            const g = actx.createGain();
            g.gain.setValueAtTime(opts.gain || 0.18, t0);
            g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
            src.connect(filt); filt.connect(g); g.connect(master);
            if (opts.wet) g.connect(delaySend);
            src.start(t0);
            src.stop(t0 + duration + 0.02);
        }

        return {
            pickup() {
                tone(740, 0.09, { type: 'triangle', gain: 0.14 });
                tone(1180, 0.14, { type: 'sine', gain: 0.1, wet: true });
            },
            caught() {
                noiseBurst(0.18, { filterType: 'lowpass', freq: 500, gain: 0.22 });
                tone(220, 0.28, { type: 'sawtooth', sweepTo: 90, gain: 0.16 });
            },
            bolsitaFound() {
                tone(420, 0.16, { type: 'square', sweepTo: 700, gain: 0.1, wet: true });
            },
            bolsitaLost() {
                tone(300, 0.3, { type: 'sine', sweepTo: 120, gain: 0.08 });
            },
            refill() {
                [523, 659, 784, 1047].forEach((f, i) => {
                    setTimeout(() => tone(f, 0.22, { type: 'sine', gain: 0.12, wet: true }), i * 70);
                });
            },
            gameOver() {
                [420, 340, 260, 180].forEach((f, i) => {
                    setTimeout(() => tone(f, 0.4, { type: 'sawtooth', gain: 0.14 }), i * 150);
                });
            },
            startAmbience() {
                ensure();
                if (ambienceSource) return;
                ambienceSource = actx.createBufferSource();
                ambienceSource.buffer = noiseBuffer;
                ambienceSource.loop = true;
                const filt = actx.createBiquadFilter();
                filt.type = 'bandpass';
                filt.frequency.value = 420;
                filt.Q.value = 0.5;
                ambienceGain = actx.createGain();
                ambienceGain.gain.value = 0.02;
                ambienceSource.connect(filt);
                filt.connect(ambienceGain);
                ambienceGain.connect(master);
                ambienceSource.start();
            },
            resume() {
                ensure();
                if (actx.state === 'suspended') actx.resume();
            }
        };
    })();

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

        for (let i = cubatas.length - 1; i >= 0; i--) {
            const c = cubatas[i];
            const dist = Math.hypot(player.x - c.x, player.y - c.y);
            if (dist < player.r + c.r) {
                cubatas.splice(i, 1);
                score += 10;
                addParticle(c.x, c.y, '+10', '#f2c85c');
                SFX.pickup();
                setTimeout(spawnCubata, CUBATA_RESPAWN_DELAY * 1000);
                maybeSpawnChavalaByScore();
            }
        }

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
                SFX.bolsitaFound();
            }
        }

        if (player.carryingBolsita) {
            player.bolsitaTimer -= dt;
            if (player.bolsitaTimer <= 0) {
                player.carryingBolsita = false;
                addParticle(player.x, player.y - 30, 'se perdió...', '#9a9aa2');
                nextBolsitaAt = BOLSITA_SPAWN_MIN + Math.random() * (BOLSITA_SPAWN_MAX - BOLSITA_SPAWN_MIN);
                SFX.bolsitaLost();
            } else if (rectsOverlap(player.x, player.y, player.r, bathroom, 6)) {
                player.carryingBolsita = false;
                player.energy = 100;
                player.boost = 3;
                player.invuln = Math.max(player.invuln, 2);
                score += 25;
                addParticle(player.x, player.y - 30, '¡ENERGÍA A TOPE!', '#3fb950');
                SFX.refill();
                nextBolsitaAt = BOLSITA_SPAWN_MIN + Math.random() * (BOLSITA_SPAWN_MAX - BOLSITA_SPAWN_MIN);
            }
        }

        let minDist = Infinity;
        chavalas.forEach(ch => {
            ch.bob += dt * 6;
            const dist = Math.hypot(player.x - ch.x, player.y - ch.y);
            minDist = Math.min(minDist, dist);
            if (dist > 1) {
                const spd = CHAVALA_BASE_SPEED * ch.speedMul;
                ch.x += (player.x - ch.x) / dist * spd * dt;
                ch.y += (player.y - ch.y) / dist * spd * dt;
            }
            if (dist < player.r + ch.r && player.invuln <= 0) {
                if (player.energy > 0) {
                    player.energy = Math.max(0, player.energy - CATCH_ENERGY_LOSS);
                    player.invuln = CATCH_INVULN_TIME;
                    const away = Math.atan2(player.y - ch.y, player.x - ch.x);
                    player.x += Math.cos(away) * 50;
                    player.y += Math.sin(away) * 50;
                    addParticle(player.x, player.y - 30, '¡TE PILLÓ!', '#e5484d');
                    SFX.caught();
                    const pos = randomFreePosition(CHAVALA_R);
                    ch.x = pos.x; ch.y = pos.y;
                } else {
                    gameOver('caught');
                }
            }
        });

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
        const target = Math.min(MAX_CHAVALAS, 1 + Math.floor(score / CHAVALA_EVERY_POINTS));
        if (chavalas.length < target) spawnChavala();
    }

    // ==============================
    // --- Dibujado del escenario ---
    // ==============================
    function drawGround() {
        const grad = ctx.createLinearGradient(0, 0, 0, WORLD_H);
        grad.addColorStop(0, '#3a8a49');
        grad.addColorStop(1, '#276236');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, WORLD_W, WORLD_H);

        // Textura de césped (trama cruzada sutil)
        ctx.strokeStyle = 'rgba(0,0,0,0.05)';
        ctx.lineWidth = 1;
        for (let i = -WORLD_H; i < WORLD_W; i += 22) {
            ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + WORLD_H, WORLD_H); ctx.stroke();
        }
        ctx.strokeStyle = 'rgba(255,255,255,0.03)';
        for (let i = 0; i < WORLD_W + WORLD_H; i += 22) {
            ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i - WORLD_H, WORLD_H); ctx.stroke();
        }

        // Caminos de tierra trillados entre los puntos de interés
        ctx.strokeStyle = 'rgba(120, 94, 60, 0.35)';
        ctx.lineWidth = 16;
        ctx.lineCap = 'round';
        paths.forEach(p => {
            ctx.beginPath(); ctx.moveTo(p.x1, p.y1); ctx.lineTo(p.x2, p.y2); ctx.stroke();
        });
        ctx.strokeStyle = 'rgba(150, 118, 78, 0.25)';
        ctx.lineWidth = 8;
        paths.forEach(p => {
            ctx.beginPath(); ctx.moveTo(p.x1, p.y1); ctx.lineTo(p.x2, p.y2); ctx.stroke();
        });
    }

    function drawFence() {
        ctx.strokeStyle = 'rgba(220, 220, 225, 0.55)';
        ctx.lineWidth = 3;
        ctx.strokeRect(4, 4, WORLD_W - 8, WORLD_H - 8);
        ctx.strokeStyle = 'rgba(150, 150, 155, 0.4)';
        ctx.lineWidth = 1;
        const step = 18;
        for (let x = 8; x < WORLD_W - 8; x += step) {
            ctx.beginPath(); ctx.moveTo(x, 4); ctx.lineTo(x, 12); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(x, WORLD_H - 12); ctx.lineTo(x, WORLD_H - 4); ctx.stroke();
        }
        for (let y = 8; y < WORLD_H - 8; y += step) {
            ctx.beginPath(); ctx.moveTo(4, y); ctx.lineTo(12, y); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(WORLD_W - 12, y); ctx.lineTo(WORLD_W - 4, y); ctx.stroke();
        }
    }

    function drawCrowdDot(p) {
        const bob = Math.sin(elapsed * 2 + p.phase) * 2;
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.beginPath(); ctx.ellipse(p.x, p.y + 9, 6, 2.5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = p.hue;
        ctx.beginPath(); ctx.arc(p.x, p.y + bob, 5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#3a2416';
        ctx.beginPath(); ctx.arc(p.x, p.y - 4 + bob, 3, 0, Math.PI * 2); ctx.fill();
    }

    function drawStage() {
        // Trussing (marco metálico)
        ctx.strokeStyle = '#7a7a82';
        ctx.lineWidth = 4;
        ctx.strokeRect(stage.x - 8, stage.y - 8, stage.w + 16, stage.h + 26);
        ctx.beginPath();
        ctx.moveTo(stage.x - 8, stage.y - 8); ctx.lineTo(stage.x, stage.y);
        ctx.moveTo(stage.x + stage.w + 8, stage.y - 8); ctx.lineTo(stage.x + stage.w, stage.y);
        ctx.stroke();

        // Pantalla de fondo con resplandor
        const glow = ctx.createLinearGradient(0, stage.y, 0, stage.y + stage.h);
        glow.addColorStop(0, '#3a1f5c');
        glow.addColorStop(1, '#0f0a1a');
        ctx.fillStyle = glow;
        ctx.fillRect(stage.x, stage.y, stage.w, stage.h);

        // Luces
        const lightColors = ['#ff6b6b', '#f2c85c', '#6bc9ff', '#8affc1'];
        for (let i = 0; i < 8; i++) {
            ctx.fillStyle = lightColors[i % lightColors.length];
            ctx.globalAlpha = 0.6 + Math.sin(elapsed * 3 + i) * 0.4;
            ctx.beginPath();
            ctx.arc(stage.x + 6 + i * (stage.w - 12) / 7, stage.y - 8, 2.5, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;

        // Cabina de DJ
        ctx.fillStyle = '#2a2a30';
        ctx.fillRect(stage.x + stage.w / 2 - 22, stage.y + stage.h - 14, 44, 14);

        ctx.fillStyle = '#d9a935';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('ESCENARIO', stage.x + stage.w / 2, stage.y + stage.h + 16);
    }

    function drawStall(rect, color, label) {
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.beginPath();
        ctx.ellipse(rect.x + rect.w / 2, rect.y + rect.h + 6, rect.w / 2 + 6, 8, 0, 0, Math.PI * 2);
        ctx.fill();

        // Mostrador con degradado (algo de volumen)
        const bodyGrad = ctx.createLinearGradient(0, rect.y, 0, rect.y + rect.h);
        bodyGrad.addColorStop(0, '#5a3c24');
        bodyGrad.addColorStop(1, '#3a2414');
        ctx.fillStyle = bodyGrad;
        ctx.fillRect(rect.x, rect.y, rect.w, rect.h);

        // Botellas/vasos en el mostrador
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        for (let i = 0; i < 5; i++) ctx.fillRect(rect.x + 8 + i * 20, rect.y + 6, 6, 12);

        // Toldo a rayas
        const stripeW = 14;
        for (let sx = 0; sx < rect.w + 12; sx += stripeW) {
            ctx.fillStyle = (Math.floor(sx / stripeW) % 2 === 0) ? color : '#fff5e6';
            ctx.fillRect(rect.x - 6 + sx, rect.y - 18, stripeW, 20);
        }
        // Borde festoneado del toldo
        ctx.fillStyle = 'rgba(0,0,0,0.15)';
        for (let sx = 0; sx < rect.w + 12; sx += stripeW) {
            ctx.beginPath();
            ctx.arc(rect.x - 6 + sx + stripeW / 2, rect.y + 2, stripeW / 2, 0, Math.PI);
            ctx.fill();
        }

        // Banderín
        ctx.fillStyle = color;
        ctx.fillRect(rect.x + rect.w / 2 - 1, rect.y - 30, 2, 12);
        ctx.beginPath();
        ctx.moveTo(rect.x + rect.w / 2 + 1, rect.y - 30);
        ctx.lineTo(rect.x + rect.w / 2 + 11, rect.y - 26);
        ctx.lineTo(rect.x + rect.w / 2 + 1, rect.y - 22);
        ctx.closePath(); ctx.fill();

        ctx.fillStyle = '#fff';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(label, rect.x + rect.w / 2, rect.y + rect.h / 2 + 5);
    }

    function drawBathroom(rect) {
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.beginPath();
        ctx.ellipse(rect.x + rect.w / 2, rect.y + rect.h + 6, rect.w / 2 + 6, 8, 0, 0, Math.PI * 2);
        ctx.fill();

        const n = 3;
        const cw = rect.w / n;
        for (let i = 0; i < n; i++) {
            const cx = rect.x + i * cw;
            const grad = ctx.createLinearGradient(0, rect.y, 0, rect.y + rect.h);
            grad.addColorStop(0, '#4a9bd6');
            grad.addColorStop(1, '#2f6fa8');
            ctx.fillStyle = grad;
            ctx.fillRect(cx + 2, rect.y, cw - 4, rect.h);
            ctx.strokeStyle = 'rgba(255,255,255,0.5)';
            ctx.strokeRect(cx + 2, rect.y, cw - 4, rect.h);
            ctx.fillStyle = 'rgba(255,255,255,0.7)';
            ctx.fillRect(cx + cw / 2 - 1, rect.y + 6, 2, rect.h - 12);
        }
        ctx.fillStyle = '#173a52';
        ctx.fillRect(rect.x - 4, rect.y - 8, rect.w + 8, 8);

        ctx.fillStyle = '#fff';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('🚻 ' + bathroom.label, rect.x + rect.w / 2, rect.y + rect.h + 20);
    }

    function drawCubata(c) {
        const bob = Math.sin(elapsed * 4 + c.x) * 2;
        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.beginPath(); ctx.ellipse(c.x, c.y + 10, 7, 2.5, 0, 0, Math.PI * 2); ctx.fill();
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
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.beginPath(); ctx.ellipse(ch.x, ch.y + 13, 8, 3, 0, 0, Math.PI * 2); ctx.fill();
        ctx.save();
        ctx.translate(ch.x, ch.y + bob);
        ctx.fillStyle = ch.color;
        ctx.beginPath();
        ctx.moveTo(-11, 10); ctx.lineTo(-6, -10); ctx.lineTo(6, -10); ctx.lineTo(11, 10);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#ffd9b3';
        ctx.beginPath(); ctx.arc(0, -16, 8, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#3a2416';
        ctx.beginPath(); ctx.arc(0, -19, 8.5, Math.PI, Math.PI * 2.15); ctx.fill();
        ctx.restore();
    }

    function drawPlayerFallback() {
        // Silueta vectorial de repuesto por si la imagen aún no cargó
        ctx.fillStyle = '#3a5c8a';
        ctx.fillRect(-10, 6, 8, 16);
        ctx.fillRect(2, 6, 8, 16);
        ctx.fillStyle = '#8a8a8f';
        ctx.beginPath();
        ctx.moveTo(-13, 10); ctx.lineTo(-13, -8); ctx.quadraticCurveTo(0, -16, 13, -8); ctx.lineTo(13, 10);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#e0ac7a';
        ctx.beginPath(); ctx.arc(0, -16, 9, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#2a1c12';
        ctx.beginPath(); ctx.arc(0, -19, 9.5, Math.PI, Math.PI * 2); ctx.fill();
    }

    function drawPlayer() {
        const flash = player.invuln > 0 && Math.floor(elapsed * 12) % 2 === 0;

        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.beginPath(); ctx.ellipse(player.x, player.y + 16, 14, 5, 0, 0, Math.PI * 2); ctx.fill();

        ctx.save();
        ctx.translate(player.x, player.y);
        ctx.scale(player.facing, 1);
        if (flash) ctx.globalAlpha = 0.4;

        if (player.boost > 0) {
            ctx.strokeStyle = 'rgba(63, 185, 80, 0.6)';
            ctx.lineWidth = 3;
            ctx.beginPath(); ctx.arc(0, 0, PLAYER_R + 8, 0, Math.PI * 2); ctx.stroke();
        }

        if (playerImgReady) {
            const w = PLAYER_IMG_H * (playerImg.naturalWidth / playerImg.naturalHeight);
            ctx.drawImage(playerImg, -w / 2, -PLAYER_IMG_H + 14, w, PLAYER_IMG_H);
        } else {
            drawPlayerFallback();
        }

        ctx.restore();

        if (player.carryingBolsita) {
            ctx.save();
            ctx.translate(player.x, player.y - 62);
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
        drawGround();
        drawFence();
        crowd.forEach(drawCrowdDot);
        drawStage();
        bars.forEach(b => drawStall(b, '#c0392b', b.label));
        drawBathroom(bathroom);

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
        SFX.resume();
        SFX.startAmbience();
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
        SFX.gameOver();
    }

    document.getElementById('btn-start').addEventListener('click', startGame);
    document.getElementById('btn-retry').addEventListener('click', startGame);
    document.getElementById('hud-best').textContent = `🏆 ${highScore}`;

    resizeCanvas();
    resetGame();
    draw();
})();
