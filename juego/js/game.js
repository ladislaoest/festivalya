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

    // El mapa es apaisado: en un móvil en vertical siempre va a quedar con
    // franjas negras arriba/abajo, pida o no pantalla completa. Girar el
    // teléfono es lo que de verdad soluciona eso.
    function updateOrientationHint() {
        document.body.classList.toggle('is-portrait', window.innerHeight > window.innerWidth);
    }
    window.addEventListener('resize', updateOrientationHint);
    window.addEventListener('orientationchange', updateOrientationHint);
    updateOrientationHint();

    // ==============================
    // --- Marcador compartido (Supabase, mismo proyecto que festivalya) ---
    // ==============================
    const Leaderboard = (() => {
        const SUPABASE_URL = 'https://atmxqrkcvvatfqsvkdcm.supabase.co';
        const SUPABASE_KEY = 'sb_publishable_jAo0VLnlU5UFF2J5rl4LJQ_UGlSaMPu';
        const NAME_KEY = 'bradwather_playername';

        function getSavedName() {
            return localStorage.getItem(NAME_KEY) || '';
        }
        function saveName(name) {
            localStorage.setItem(NAME_KEY, name);
        }

        async function submitScore(name, scoreValue) {
            try {
                await fetch(`${SUPABASE_URL}/rest/v1/bread_wather_scores`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'apikey': SUPABASE_KEY,
                        'Authorization': `Bearer ${SUPABASE_KEY}`,
                        'Prefer': 'return=minimal'
                    },
                    body: JSON.stringify({ player_name: name, score: scoreValue })
                });
            } catch (err) {
                console.warn('[Bread & Wather] No se pudo guardar la puntuación en el marcador compartido.', err);
            }
        }

        async function fetchTop(limit) {
            try {
                const res = await fetch(
                    `${SUPABASE_URL}/rest/v1/bread_wather_scores?select=player_name,score&order=score.desc&limit=${limit}`,
                    { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
                );
                if (!res.ok) return [];
                return await res.json();
            } catch (err) {
                console.warn('[Bread & Wather] No se pudo cargar el marcador compartido.', err);
                return [];
            }
        }

        function render(listEl, rows, myName) {
            if (!rows || rows.length === 0) {
                listEl.innerHTML = '<li class="leaderboard-empty">Todavía nadie ha puntuado. ¡Sé el primero!</li>';
                return;
            }
            listEl.innerHTML = rows.map((r, i) => `
                <li class="${myName && r.player_name === myName ? 'lb-me' : ''}">
                    <span class="lb-rank">${i + 1}º</span>
                    <span class="lb-name">${escapeHtml(r.player_name)}</span>
                    <span class="lb-score">${r.score}</span>
                </li>
            `).join('');
        }

        function escapeHtml(str) {
            const div = document.createElement('div');
            div.textContent = str;
            return div.innerHTML;
        }

        async function refreshInto(listElId, myName) {
            const listEl = document.getElementById(listElId);
            if (!listEl) return;
            const rows = await fetchTop(10);
            render(listEl, rows, myName);
        }

        return { getSavedName, saveName, submitScore, refreshInto };
    })();

    // Contador de "partidas jugadas" en la pantalla de fin de partida: es
    // de broma, no un dato real -empieza en 30 y suma 2 por cada partida
    // de verdad, para que el juego parezca más popular de lo que es-.
    const GamesPlayedCounter = (() => {
        const KEY = 'bradwather_games_played_fake';
        let count = Number(localStorage.getItem(KEY)) || 30;
        return {
            bump() {
                count += 2;
                localStorage.setItem(KEY, String(count));
                return count;
            }
        };
    })();

    // --- Sprite real del personaje, partido en torso + piernas para poder
    // animar el andar (el recorte original es una única foto de pie, ver
    // juego/assets/player.png del que salen estas tres piezas) ---
    function loadImg(src) {
        const img = new Image();
        img.src = src;
        return img;
    }
    const playerTorso = loadImg('assets/player_torso.png');
    const playerLegL = loadImg('assets/player_leg_l.png');
    const playerLegR = loadImg('assets/player_leg_r.png');
    let playerPartsReady = false;
    let partsLoaded = 0;
    [playerTorso, playerLegL, playerLegR].forEach(img => {
        img.onload = () => { partsLoaded++; if (partsLoaded === 3) playerPartsReady = true; };
    });

    // Dimensiones y puntos de articulación de la foto ORIGINAL (250x560) antes
    // de partirla: el torso ocupa (0,0)-(250,400) y cada pierna nace en la
    // cadera, en (91,398) la izquierda y (162,398) la derecha -ver el recorte
    // hecho con Pillow-. Todo se escala igual para que encajen sin costuras.
    const ORIG_W = 250, ORIG_H = 560, HIP_Y = 398;
    const HIP_L_X = 91, HIP_R_X = 162;
    const PLAYER_IMG_H = 78; // alto final en el mundo del juego
    const SPR_SCALE = PLAYER_IMG_H / ORIG_H;

    // --- Constantes de juego ---
    const PLAYER_R = 18;
    const PLAYER_SPEED = 200;
    const PLAYER_SPEED_TIRED = 145;
    const PLAYER_SPEED_BOOST = 265;
    const CHAVALA_R = 16;
    const CHAVALA_BASE_SPEED = 92;
    const CHAVALA_FLEE_SPEED = 150;
    const CHASE_RANGE = 130;
    const ENERGY_DRAIN_RATE = 7;
    const ENERGY_REGEN_RATE = 9;
    const CATCH_ENERGY_LOSS = 18;
    const CATCH_INVULN_TIME = 2.3;
    const START_GRACE_TIME = 2.5;

    const BAR_COOLDOWN = 3.5;
    const BAR_SERVE_SCORE = 10;

    const BOLSITA_TIME_LIMIT = 15;
    const BOLSITA_SPAWN_MIN = 10, BOLSITA_SPAWN_MAX = 18;

    const PASTILLA_SPAWN_MIN = 22, PASTILLA_SPAWN_MAX = 38;
    const POWER_DURATION = 8;
    const EAT_SCORE = 50;
    const CHAVALA_RESPAWN_DELAY = 1.6;

    const STAGE_SAFE_MAX = 6;
    const STAGE_RECHARGE_TIME = 10;

    const MAX_CHAVALAS = 5;
    const CHAVALA_EVERY_POINTS = 450;
    const DIFFICULTY_RAMP_INTERVAL = 25;
    const MAX_DIFFICULTY_LEVEL = 6;
    const TIBURON_TRIGGER_DRINKS = 8;
    const TIBURON_STEAL_SCORE = 30;
    const BILLETES_NEEDED = 4;
    const BILLETE_SPAWN_MIN = 4, BILLETE_SPAWN_MAX = 9;

    // --- Escenario: barras, baño, escenario y valla perimetral ---
    const bars = [
        { x: 70, y: 70, w: 110, h: 60, label: 'BARRA', ready: true, cooldownTimer: 0 },
        { x: WORLD_W - 180, y: 70, w: 110, h: 60, label: 'BARRA', ready: true, cooldownTimer: 0 },
        { x: 70, y: WORLD_H - 130, w: 110, h: 60, label: 'BARRA', ready: true, cooldownTimer: 0 },
        { x: WORLD_W - 180, y: WORLD_H - 130, w: 110, h: 60, label: 'BARRA', ready: true, cooldownTimer: 0 }
    ];
    // Más arriba que antes: pegado del todo al borde inferior se solapaba
    // visualmente con la barra de energía (ver drawEnergyBar).
    const bathroom = { x: WORLD_W / 2 - 60, y: WORLD_H - 168, w: 120, h: 52, label: 'BAÑO' };
    const stage = { x: WORLD_W / 2 - 110, y: 18, w: 220, h: 50 };

    const solids = [...bars, bathroom];

    const paths = [];
    const hub = { x: WORLD_W / 2, y: WORLD_H / 2 };
    [...bars, bathroom, stage].forEach(s => {
        paths.push({ x1: s.x + s.w / 2, y1: s.y + s.h, x2: hub.x, y2: hub.y });
    });

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

    function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

    // --- Estado del juego ---
    let running = false;
    let score = 0;
    let highScore = Number(localStorage.getItem('bradwather_highscore') || 0);
    let bolsita = null;
    let nextBolsitaAt = 0;
    let pastilla = null;
    let nextPastillaAt = 0;
    let powerMode = false;
    let powerTimer = 0;
    let elapsed = 0;
    let chavalas = [];
    let drinksCount = 0;
    let tiburonSpawned = false;
    let lastDifficultyLevel = 0;
    let billete = null;
    let nextBilleteAt = 0;
    let billetesCollected = 0;
    let marcosTimer = 0;
    let marcosX = 0, marcosY = 0;
    let particles = [];
    let bursts = [];
    let flashAlpha = 0;
    let flashColor = '#ffffff';

    const player = {
        x: WORLD_W / 2, y: WORLD_H / 2 + 40, r: PLAYER_R,
        facing: 1,
        energy: 100,
        invuln: 0,
        boost: 0,
        carryingBolsita: false,
        bolsitaTimer: 0,
        legPhase: 0,
        legSwing: 0,
        onStage: false,
        dancing: false,
        stageSafeTime: STAGE_SAFE_MAX,
        batSwing: 0,
        stageKicked: false
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
        player.legPhase = 0;
        player.legSwing = 0;
        player.onStage = false;
        player.dancing = false;
        player.stageSafeTime = STAGE_SAFE_MAX;
        player.batSwing = 0;
        player.stageKicked = false;
        marcosTimer = 0;
        particles = [];
        bursts = [];
        flashAlpha = 0;

        bars.forEach(b => { b.ready = true; b.cooldownTimer = 0; });

        bolsita = null;
        nextBolsitaAt = BOLSITA_SPAWN_MIN + Math.random() * (BOLSITA_SPAWN_MAX - BOLSITA_SPAWN_MIN);

        pastilla = null;
        nextPastillaAt = PASTILLA_SPAWN_MIN + Math.random() * (PASTILLA_SPAWN_MAX - PASTILLA_SPAWN_MIN);
        powerMode = false;
        powerTimer = 0;

        chavalas = [];
        spawnChavala();
        drinksCount = 0;
        tiburonSpawned = false;
        lastDifficultyLevel = 0;
        billete = null;
        nextBilleteAt = 0;
        billetesCollected = 0;
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
            bob: Math.random() * Math.PI * 2,
            wanderTarget: null,
            wanderTimer: 0
        });
    }

    function maybeSpawnChavalaByScore() {
        const target = Math.min(MAX_CHAVALAS, 1 + Math.floor(score / CHAVALA_EVERY_POINTS));
        if (chavalas.length < target) spawnChavala();
    }

    // El tiburón de la barra: aparece una sola vez, cuando ya se han pedido
    // demasiadas copas, a cobrar lo bebido. Persigue igual que las chavalas
    // pero la pastilla no lo asusta ni se lo puede comer -ver el chequeo
    // "!ch.isTiburon" en el bucle de chavalas-.
    function spawnTiburon(bar) {
        chavalas.push({
            x: bar.x + bar.w / 2, y: bar.y + bar.h / 2,
            r: CHAVALA_R + 6,
            isTiburon: true,
            speedMul: 1.05,
            bob: Math.random() * Math.PI * 2,
            wanderTarget: null,
            wanderTimer: 0
        });
        addParticle(bar.x + bar.w / 2, bar.y - 24, '¡El tiburón viene a cobrarte!', '#4a6fa5');
        setTimeout(() => addParticle(bar.x + bar.w / 2, bar.y - 24, '¡Llevas demasiadas copas!', '#4a6fa5'), 500);
        SFX.tiburonAlert();
    }

    function addParticle(x, y, text, color) {
        particles.push({ x, y, text, color: color || '#fff', life: 1.0 });
    }

    // Ráfaga de partículas físicas (explosión de azúcar, "comerse" a una
    // chavala...): reutilizable para cualquier efecto de impacto.
    function burst(x, y, count, colors, opts) {
        opts = opts || {};
        const spread = opts.spread || 220;
        const life = opts.life || 0.8;
        for (let i = 0; i < count; i++) {
            const ang = Math.random() * Math.PI * 2;
            const spd = spread * (0.4 + Math.random() * 0.6);
            bursts.push({
                x, y,
                vx: Math.cos(ang) * spd,
                vy: Math.sin(ang) * spd - (opts.upBias || 0),
                size: (opts.size || 4) * (0.6 + Math.random() * 0.8),
                color: colors[Math.floor(Math.random() * colors.length)],
                life,
                maxLife: life,
                gravity: opts.gravity != null ? opts.gravity : 260
            });
        }
    }

    function flash(color, amount) {
        flashColor = color;
        flashAlpha = Math.max(flashAlpha, amount);
    }

    // --- Entrada: teclado + joystick táctil flotante ---
    const keys = {};
    window.addEventListener('keydown', (e) => { keys[e.key.toLowerCase()] = true; });
    window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });

    // Joystick que aparece justo donde tocas (no un D-pad fijo en una
    // esquina): funciona en cualquier parte de la pantalla y no estorba
    // mientras las pantallas de inicio/game over están tapando el juego
    // -"touch-zone" queda por debajo de esos overlays en el z-index-.
    const JOY_MAX_RADIUS = 46;
    let joystickPointerId = null;
    let joystickOrigin = { x: 0, y: 0 };
    let joystickVector = { x: 0, y: 0 };

    function setupJoystick() {
        const zone = document.getElementById('touch-zone');
        const base = document.getElementById('joystick-base');
        const nub = document.getElementById('joystick-nub');
        if (!zone || !base || !nub) return;

        function showAt(x, y) {
            base.style.left = `${x}px`; base.style.top = `${y}px`;
            nub.style.left = `${x}px`; nub.style.top = `${y}px`;
            base.style.display = 'block'; nub.style.display = 'block';
        }
        function hide() {
            base.style.display = 'none'; nub.style.display = 'none';
            joystickVector.x = 0; joystickVector.y = 0;
        }
        function updateNub(dx, dy) {
            const dist = Math.min(JOY_MAX_RADIUS, Math.hypot(dx, dy));
            const ang = Math.atan2(dy, dx);
            const nx = Math.cos(ang) * dist, ny = Math.sin(ang) * dist;
            nub.style.left = `${joystickOrigin.x + nx}px`;
            nub.style.top = `${joystickOrigin.y + ny}px`;
            joystickVector.x = nx / JOY_MAX_RADIUS;
            joystickVector.y = ny / JOY_MAX_RADIUS;
        }

        zone.addEventListener('pointerdown', (e) => {
            if (joystickPointerId !== null) return;
            joystickPointerId = e.pointerId;
            joystickOrigin = { x: e.clientX, y: e.clientY };
            showAt(e.clientX, e.clientY);
            zone.setPointerCapture(e.pointerId);
        });
        zone.addEventListener('pointermove', (e) => {
            if (e.pointerId !== joystickPointerId) return;
            updateNub(e.clientX - joystickOrigin.x, e.clientY - joystickOrigin.y);
        });
        const endTouch = (e) => {
            if (e.pointerId !== joystickPointerId) return;
            joystickPointerId = null;
            hide();
        };
        zone.addEventListener('pointerup', endTouch);
        zone.addEventListener('pointercancel', endTouch);
    }

    function readInput() {
        let dx = 0, dy = 0;
        if (keys['arrowup'] || keys['w']) dy -= 1;
        if (keys['arrowdown'] || keys['s']) dy += 1;
        if (keys['arrowleft'] || keys['a']) dx -= 1;
        if (keys['arrowright'] || keys['d']) dx += 1;
        if (dx !== 0 && dy !== 0) { dx *= 0.7071; dy *= 0.7071; }

        if (joystickPointerId !== null && (joystickVector.x !== 0 || joystickVector.y !== 0)) {
            dx = joystickVector.x;
            dy = joystickVector.y;
            const mag = Math.hypot(dx, dy);
            if (mag > 1) { dx /= mag; dy /= mag; }
        }
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
        let ambienceSource = null, ambienceGain = null;
        let loopTimer = null;
        let currentLoop = null;

        function ensure() {
            if (actx) return;
            actx = new (window.AudioContext || window.webkitAudioContext)();
            master = actx.createGain();
            master.gain.value = 0.5;
            master.connect(actx.destination);

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

        function stopAmbience() {
            if (ambienceSource) { try { ambienceSource.stop(); } catch (e) {} ambienceSource = null; }
        }

        function startAmbience() {
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
        }

        function stopScheduledLoop() {
            if (loopTimer) { clearInterval(loopTimer); loopTimer = null; }
        }

        function startActionLoop() {
            stopScheduledLoop();
            const bassNotes = [110, 110, 146.83, 130.81];
            let step = 0;
            loopTimer = setInterval(() => {
                tone(bassNotes[step % bassNotes.length], 0.16, { type: 'sawtooth', gain: 0.12 });
                noiseBurst(0.05, { filterType: 'highpass', freq: 4200, gain: 0.09 });
                if (step % 2 === 0) tone(bassNotes[step % bassNotes.length] * 2, 0.1, { type: 'square', gain: 0.05 });
                step++;
            }, 170);
        }

        // Bombo de "cuatro por compás" (el golpe grave típico de techno/house:
        // un seno que cae rapidísimo de ~150Hz a ~45Hz).
        function kick(t0) {
            ensure();
            const osc = actx.createOscillator();
            const g = actx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(155, t0);
            osc.frequency.exponentialRampToValueAtTime(46, t0 + 0.11);
            g.gain.setValueAtTime(0.85, t0);
            g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.17);
            osc.connect(g); g.connect(master);
            osc.start(t0); osc.stop(t0 + 0.2);
        }

        function hat(t0, open) {
            ensure();
            const src = actx.createBufferSource();
            src.buffer = noiseBuffer;
            const filt = actx.createBiquadFilter();
            filt.type = 'highpass';
            filt.frequency.value = 7500;
            const g = actx.createGain();
            g.gain.setValueAtTime(open ? 0.1 : 0.06, t0);
            g.gain.exponentialRampToValueAtTime(0.0001, t0 + (open ? 0.16 : 0.045));
            src.connect(filt); filt.connect(g); g.connect(master);
            src.start(t0); src.stop(t0 + 0.2);
        }

        function bassPluck(t0, freq) {
            ensure();
            const osc = actx.createOscillator();
            const filt = actx.createBiquadFilter();
            const g = actx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(freq, t0);
            filt.type = 'lowpass';
            filt.frequency.value = 500;
            g.gain.setValueAtTime(0.0001, t0);
            g.gain.linearRampToValueAtTime(0.16, t0 + 0.01);
            g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.15);
            osc.connect(filt); filt.connect(g); g.connect(master);
            osc.start(t0); osc.stop(t0 + 0.18);
        }

        // Música de pista de verdad -house/techno de "cuatro por compás"-, no
        // una melodía suelta: bombo en cada negra, hi-hats en corcheas y un
        // bajo sincopado, como una caja de ritmos de 16 pasos a 126 BPM.
        function startDanceLoop() {
            stopScheduledLoop();
            ensure();
            const bpm = 126;
            const stepDur = 60 / bpm / 4;
            const bassPattern = [110, 0, 0, 110, 0, 146.83, 0, 0, 110, 0, 0, 110, 0, 130.81, 0, 0];
            let step = 0;
            loopTimer = setInterval(() => {
                const t0 = actx.currentTime;
                if (step % 4 === 0) kick(t0);
                if (step % 2 === 0) hat(t0, step % 4 === 2);
                if (bassPattern[step]) bassPluck(t0, bassPattern[step]);
                step = (step + 1) % 16;
            }, stepDur * 1000);
        }

        function setLoop(name) {
            if (currentLoop === name) return;
            currentLoop = name;
            stopScheduledLoop();
            stopAmbience();
            if (name === 'ambience') startAmbience();
            else if (name === 'action') startActionLoop();
            else if (name === 'dance') startDanceLoop();
        }

        return {
            pickup() {
                tone(740, 0.09, { type: 'triangle', gain: 0.14 });
                tone(1180, 0.14, { type: 'sine', gain: 0.1, wet: true });
            },
            serve() {
                tone(523, 0.08, { type: 'sine', gain: 0.12 });
                tone(784, 0.16, { type: 'triangle', gain: 0.12, wet: true });
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
            sugarExplosion() {
                noiseBurst(0.35, { filterType: 'highpass', freq: 1200, gain: 0.22 });
                [880, 1320, 1760].forEach((f, i) => setTimeout(() => tone(f, 0.18, { type: 'sine', gain: 0.14, wet: true }), i * 40));
            },
            refill() {
                [523, 659, 784, 1047].forEach((f, i) => {
                    setTimeout(() => tone(f, 0.22, { type: 'sine', gain: 0.12, wet: true }), i * 70);
                });
            },
            pastillaFound() {
                // Fanfarria alegre de "ta-chán", no solo un barrido serio.
                tone(200, 0.15, { type: 'sawtooth', sweepTo: 500, gain: 0.14 });
                [392, 494, 587, 784].forEach((f, i) => {
                    setTimeout(() => tone(f, 0.22, { type: 'square', gain: 0.13, wet: true }), 90 + i * 90);
                });
            },
            tiburonAlert() {
                // Sonsonete propio de "alarma de tiburón" (sin usar canciones
                // con copyright): bajo amenazante + un riff pegadizo.
                tone(90, 0.6, { type: 'sawtooth', sweepTo: 60, gain: 0.18 });
                setTimeout(() => tone(90, 0.6, { type: 'sawtooth', sweepTo: 60, gain: 0.16 }), 350);
                [220, 220, 330, 220, 220, 392].forEach((f, i) => {
                    setTimeout(() => tone(f, 0.14, { type: 'square', gain: 0.1, wet: true }), 700 + i * 130);
                });
            },
            levelUp() {
                tone(330, 0.12, { type: 'square', gain: 0.13 });
                setTimeout(() => tone(220, 0.25, { type: 'sawtooth', gain: 0.14 }), 90);
            },
            tiburonPaid() {
                [392, 523, 659].forEach((f, i) => setTimeout(() => tone(f, 0.2, { type: 'sine', gain: 0.13, wet: true }), i * 90));
            },
            kicked() {
                noiseBurst(0.15, { filterType: 'lowpass', freq: 400, gain: 0.24 });
                tone(140, 0.2, { type: 'square', sweepTo: 60, gain: 0.16 });
            },
            eatChavala() {
                noiseBurst(0.12, { filterType: 'bandpass', freq: 1400, gain: 0.2 });
                tone(660, 0.14, { type: 'square', sweepTo: 220, gain: 0.14 });
            },
            gameOver() {
                stopScheduledLoop();
                stopAmbience();
                [420, 340, 260, 180].forEach((f, i) => {
                    setTimeout(() => tone(f, 0.4, { type: 'sawtooth', gain: 0.14 }), i * 150);
                });
            },
            setLoop,
            resume() {
                ensure();
                if (actx.state === 'suspended') actx.resume();
            },
            // En iOS/Safari (y varios WebViews de apps como WhatsApp)
            // "resume()" no basta para desbloquear el audio del todo: hace
            // falta además reproducir algo, aunque sea silencio, DENTRO del
            // gesto de toque real -si no, el contexto queda "running" pero
            // no suena nada durante el resto de la partida-.
            unlock() {
                ensure();
                if (actx.state === 'suspended') actx.resume();
                const buffer = actx.createBuffer(1, 1, 22050);
                const src = actx.createBufferSource();
                src.buffer = buffer;
                src.connect(actx.destination);
                src.start(0);
            }
        };
    })();

    // --- Bucle principal ---
    let lastTs = 0;

    function update(dt) {
        elapsed += dt;

        // Dificultad progresiva: cuanto más dura la partida, más rápidas y
        // pegajosas se ponen las chavalas -no solo "más chavalas" al sumar
        // puntos, sino que las que ya hay aprietan más-. Se avisa con un
        // aviso de nivel la primera vez que sube, para que se note.
        const difficultyLevel = Math.min(MAX_DIFFICULTY_LEVEL, Math.floor(elapsed / DIFFICULTY_RAMP_INTERVAL));
        if (difficultyLevel > lastDifficultyLevel) {
            lastDifficultyLevel = difficultyLevel;
            addParticle(player.x, player.y - 50, `¡Nivel ${difficultyLevel + 1}! Se complica...`, '#ff6b6b');
            flash('#ff6b6b', 0.25);
            SFX.levelUp();
        }
        const difficultyMul = 1 + difficultyLevel * 0.07;

        const input = readInput();
        const isMoving = input.dx !== 0 || input.dy !== 0;
        if (input.dx !== 0) player.facing = input.dx > 0 ? 1 : -1;

        let speed = PLAYER_SPEED;
        if (player.boost > 0) speed = PLAYER_SPEED_BOOST;
        else if (player.energy <= 0) speed = PLAYER_SPEED_TIRED;

        player.x += input.dx * speed * dt;
        player.y += input.dy * speed * dt;
        player.x = clamp(player.x, PLAYER_R, WORLD_W - PLAYER_R);
        player.y = clamp(player.y, PLAYER_R, WORLD_H - PLAYER_R);

        // Animación de piernas: fase siempre avanza, pero la amplitud se
        // atenúa suavemente a 0 al pararse (si no, se queda a media zancada).
        player.legPhase += dt * 9;
        const swingTarget = (isMoving || player.dancing) ? 1 : 0;
        player.legSwing += (swingTarget - player.legSwing) * Math.min(1, dt * 8);

        if (player.invuln > 0) player.invuln -= dt;
        if (player.boost > 0) player.boost -= dt;
        if (player.batSwing > 0) player.batSwing = Math.max(0, player.batSwing - dt * 4);

        // --- Barras: hay que ir a por cada cubata, no aparecen solas en el suelo ---
        bars.forEach(bar => {
            if (!bar.ready) {
                bar.cooldownTimer -= dt;
                if (bar.cooldownTimer <= 0) bar.ready = true;
            } else if (rectsOverlap(player.x, player.y, player.r, bar, 4)) {
                bar.ready = false;
                bar.cooldownTimer = BAR_COOLDOWN;
                score += BAR_SERVE_SCORE;
                addParticle(bar.x + bar.w / 2, bar.y - 10, '+10 🍹', '#f2c85c');
                SFX.serve();
                maybeSpawnChavalaByScore();

                drinksCount++;
                if (!tiburonSpawned && drinksCount >= TIBURON_TRIGGER_DRINKS) {
                    tiburonSpawned = true;
                    billetesCollected = 0;
                    nextBilleteAt = BILLETE_SPAWN_MIN + Math.random() * (BILLETE_SPAWN_MAX - BILLETE_SPAWN_MIN);
                    spawnTiburon(bar);
                }
            }
        });

        // --- Billetes: la forma de quitarse al tiburón de encima sin
        // esperar a que se canse -recoge los que hagan falta y le pagas-.
        if (tiburonSpawned) {
            if (!billete) {
                nextBilleteAt -= dt;
                if (nextBilleteAt <= 0) {
                    const pos = randomFreePosition(9);
                    billete = { x: pos.x, y: pos.y, r: 10 };
                }
            } else {
                const dist = Math.hypot(player.x - billete.x, player.y - billete.y);
                if (dist < player.r + billete.r) {
                    billete = null;
                    billetesCollected++;
                    addParticle(player.x, player.y - 30, `💵 ${billetesCollected}/${BILLETES_NEEDED}`, '#8affc1');
                    SFX.pickup();
                    if (billetesCollected >= BILLETES_NEEDED) {
                        const idx = chavalas.findIndex(c => c.isTiburon);
                        if (idx !== -1) chavalas.splice(idx, 1);
                        tiburonSpawned = false;
                        drinksCount = 0;
                        billete = null;
                        addParticle(player.x, player.y - 50, '¡Pagado! El tiburón se va tranquilo...', '#4a6fa5');
                        SFX.tiburonPaid();
                    } else {
                        nextBilleteAt = BILLETE_SPAWN_MIN + Math.random() * (BILLETE_SPAWN_MAX - BILLETE_SPAWN_MIN);
                    }
                }
            }
        }

        // --- Bolsita de azúcar ---
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
                addParticle(player.x, player.y - 46, '¡ENERGÍA A TOPE!', '#3fb950');
                burst(player.x, player.y - 10, 30, ['#ffffff', '#f5efe0', '#e8dcc0'], { spread: 260, life: 0.9, upBias: 90, size: 5 });
                flash('#ffffff', 0.75);
                SFX.sugarExplosion();
                setTimeout(() => SFX.refill(), 120);
                nextBolsitaAt = BOLSITA_SPAWN_MIN + Math.random() * (BOLSITA_SPAWN_MAX - BOLSITA_SPAWN_MIN);
            }
        }

        // --- Pastilla (modo "azote del festival") ---
        if (!pastilla && !powerMode) {
            nextPastillaAt -= dt;
            if (nextPastillaAt <= 0) {
                const pos = randomFreePosition(9);
                pastilla = { x: pos.x, y: pos.y, r: 10 };
            }
        }
        if (pastilla) {
            const dist = Math.hypot(player.x - pastilla.x, player.y - pastilla.y);
            if (dist < player.r + pastilla.r) {
                pastilla = null;
                powerMode = true;
                powerTimer = POWER_DURATION;
                addParticle(player.x, player.y - 46, '¡Te comiste una viagra!', '#2f80ed');
                setTimeout(() => addParticle(player.x, player.y - 46, '¡Estás en modo azote!', '#2f80ed'), 550);
                burst(player.x, player.y - 10, 24, ['#f2c85c', '#ff6b6b', '#6bc9ff', '#8affc1', '#c86bff'], { spread: 210, life: 0.8, upBias: 70, size: 5 });
                flash('#f2c85c', 0.45);
                SFX.pastillaFound();
                SFX.setLoop('action');
            }
        }
        if (powerMode) {
            powerTimer -= dt;
            if (powerTimer <= 0) {
                powerMode = false;
                SFX.setLoop(player.dancing ? 'dance' : 'ambience');
                nextPastillaAt = PASTILLA_SPAWN_MIN + Math.random() * (PASTILLA_SPAWN_MAX - PASTILLA_SPAWN_MIN);
            }
        }

        // --- Escenario: refugio temporal donde se pone a bailar ---
        player.onStage = rectsOverlap(player.x, player.y, player.r, stage, 4);
        if (player.onStage && player.stageSafeTime > 0) {
            player.dancing = true;
            player.stageSafeTime -= dt;
            player.stageKicked = false;
            if (!powerMode) SFX.setLoop('dance');
        } else {
            if (player.dancing && !powerMode) SFX.setLoop('ambience');
            const wasDancing = player.dancing;
            player.dancing = false;
            // Se le acabó el tiempo a mitad de estar en el escenario:
            // aparece Marcos y lo echa a patadas, en vez de dejarlo ahí
            // plantado y vulnerable sin que se note por qué.
            if (player.onStage && wasDancing && !player.stageKicked) {
                player.stageKicked = true;
                marcosTimer = 1.4;
                marcosX = player.x;
                marcosY = stage.y + stage.h + 14;
                player.y = stage.y + stage.h + 50;
                player.x = clamp(player.x, PLAYER_R, WORLD_W - PLAYER_R);
                player.invuln = Math.max(player.invuln, 2);
                addParticle(player.x, player.y - 40, '¡MARCOS TE HA ECHADO!', '#e5484d');
                SFX.kicked();
            }
            if (!player.onStage) {
                player.stageSafeTime = Math.min(STAGE_SAFE_MAX, player.stageSafeTime + dt * (STAGE_SAFE_MAX / STAGE_RECHARGE_TIME));
                player.stageKicked = false;
            }
        }
        if (marcosTimer > 0) marcosTimer -= dt;

        // --- Chavalas ---
        const playerIsSafe = player.dancing || player.invuln > 0;
        let minDist = Infinity;
        for (let i = chavalas.length - 1; i >= 0; i--) {
            const ch = chavalas[i];
            ch.bob += dt * 6;
            const dist = Math.hypot(player.x - ch.x, player.y - ch.y);
            minDist = Math.min(minDist, dist);

            if (powerMode && !ch.isTiburon) {
                // Huyen del jugador (el tiburón no: a él la pastilla no le da miedo)
                if (dist > 1) {
                    ch.x -= (player.x - ch.x) / dist * CHAVALA_FLEE_SPEED * dt;
                    ch.y -= (player.y - ch.y) / dist * CHAVALA_FLEE_SPEED * dt;
                }
            } else if (player.dancing) {
                // A salvo en el escenario: no tiene sentido que se queden
                // apelotonadas esperando al pie -se van a dar una vuelta por
                // ahí hasta que baje-.
                if (!ch.wanderTarget || ch.wanderTimer <= 0 || Math.hypot(ch.wanderTarget.x - ch.x, ch.wanderTarget.y - ch.y) < 18) {
                    ch.wanderTarget = { x: 60 + Math.random() * (WORLD_W - 120), y: 150 + Math.random() * (WORLD_H - 260) };
                    ch.wanderTimer = 2 + Math.random() * 3;
                }
                ch.wanderTimer -= dt;
                const wdist = Math.hypot(ch.wanderTarget.x - ch.x, ch.wanderTarget.y - ch.y);
                if (wdist > 1) {
                    const wspd = CHAVALA_BASE_SPEED * 0.55;
                    ch.x += (ch.wanderTarget.x - ch.x) / wdist * wspd * dt;
                    ch.y += (ch.wanderTarget.y - ch.y) / wdist * wspd * dt;
                }
            } else {
                ch.wanderTarget = null;
                if (dist > 1) {
                    const spd = CHAVALA_BASE_SPEED * ch.speedMul * (ch.isTiburon ? 1 : difficultyMul);
                    ch.x += (player.x - ch.x) / dist * spd * dt;
                    ch.y += (player.y - ch.y) / dist * spd * dt;
                }
            }
            ch.x = clamp(ch.x, CHAVALA_R, WORLD_W - CHAVALA_R);
            ch.y = clamp(ch.y, CHAVALA_R, WORLD_H - CHAVALA_R);

            if (dist < player.r + ch.r) {
                if (powerMode && !ch.isTiburon) {
                    score += EAT_SCORE;
                    player.batSwing = 1;
                    addParticle(ch.x, ch.y - 20, `¡ÑAM! +${EAT_SCORE}`, '#2f80ed');
                    burst(ch.x, ch.y, 16, [ch.color, '#ffffff'], { spread: 180, life: 0.6, size: 4 });
                    SFX.eatChavala();
                    chavalas.splice(i, 1);
                    setTimeout(spawnChavala, CHAVALA_RESPAWN_DELAY * 1000);
                } else if (!playerIsSafe) {
                    if (player.energy > 0) {
                        player.energy = Math.max(0, player.energy - CATCH_ENERGY_LOSS);
                        player.invuln = CATCH_INVULN_TIME;
                        const away = Math.atan2(player.y - ch.y, player.x - ch.x);
                        player.x += Math.cos(away) * 50;
                        player.y += Math.sin(away) * 50;
                        if (ch.isTiburon) {
                            score = Math.max(0, score - TIBURON_STEAL_SCORE);
                            addParticle(player.x, player.y - 30, `¡Te cobró! -${TIBURON_STEAL_SCORE}`, '#4a6fa5');
                        } else {
                            addParticle(player.x, player.y - 30, '¡TE PILLÓ!', '#e5484d');
                        }
                        SFX.caught();
                        const pos = ch.isTiburon
                            ? randomFreePosition(CHAVALA_R + 6)
                            : randomFreePosition(CHAVALA_R);
                        ch.x = pos.x; ch.y = pos.y;
                    } else {
                        gameOver(ch.isTiburon ? 'tiburon' : 'caught');
                    }
                }
            }
        }

        if (!player.dancing && !powerMode) {
            if (minDist < CHASE_RANGE) {
                player.energy = Math.max(0, player.energy - ENERGY_DRAIN_RATE * difficultyMul * dt);
            } else {
                player.energy = Math.min(100, player.energy + ENERGY_REGEN_RATE * dt);
            }
        } else {
            player.energy = Math.min(100, player.energy + ENERGY_REGEN_RATE * dt);
        }

        particles.forEach(p => { p.y -= 24 * dt; p.life -= dt * 0.9; });
        particles = particles.filter(p => p.life > 0);

        bursts.forEach(b => {
            b.vy += b.gravity * dt;
            b.x += b.vx * dt;
            b.y += b.vy * dt;
            b.life -= dt;
        });
        bursts = bursts.filter(b => b.life > 0);

        if (flashAlpha > 0) flashAlpha = Math.max(0, flashAlpha - dt * 2.2);

        document.getElementById('hud-score').textContent = `🍹 ${score}`;
        document.getElementById('hud-level').textContent = `⚡ Nivel ${difficultyLevel + 1}`;
        document.getElementById('hud-best').textContent = `🏆 ${Math.max(score, highScore)}`;
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

        ctx.strokeStyle = 'rgba(0,0,0,0.05)';
        ctx.lineWidth = 1;
        for (let i = -WORLD_H; i < WORLD_W; i += 22) {
            ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + WORLD_H, WORLD_H); ctx.stroke();
        }
        ctx.strokeStyle = 'rgba(255,255,255,0.03)';
        for (let i = 0; i < WORLD_W + WORLD_H; i += 22) {
            ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i - WORLD_H, WORLD_H); ctx.stroke();
        }

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
        ctx.strokeStyle = player.dancing ? '#f2c85c' : '#7a7a82';
        ctx.lineWidth = 4;
        ctx.strokeRect(stage.x - 8, stage.y - 8, stage.w + 16, stage.h + 26);
        ctx.beginPath();
        ctx.moveTo(stage.x - 8, stage.y - 8); ctx.lineTo(stage.x, stage.y);
        ctx.moveTo(stage.x + stage.w + 8, stage.y - 8); ctx.lineTo(stage.x + stage.w, stage.y);
        ctx.stroke();

        const glow = ctx.createLinearGradient(0, stage.y, 0, stage.y + stage.h);
        glow.addColorStop(0, player.dancing ? '#6c2f9c' : '#3a1f5c');
        glow.addColorStop(1, '#0f0a1a');
        ctx.fillStyle = glow;
        ctx.fillRect(stage.x, stage.y, stage.w, stage.h);

        const lightColors = ['#ff6b6b', '#f2c85c', '#6bc9ff', '#8affc1'];
        const speedMul = player.dancing ? 8 : 3;
        for (let i = 0; i < 8; i++) {
            ctx.fillStyle = lightColors[i % lightColors.length];
            ctx.globalAlpha = 0.6 + Math.sin(elapsed * speedMul + i) * 0.4;
            ctx.beginPath();
            ctx.arc(stage.x + 6 + i * (stage.w - 12) / 7, stage.y - 8, 2.5, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;

        ctx.fillStyle = '#2a2a30';
        ctx.fillRect(stage.x + stage.w / 2 - 22, stage.y + stage.h - 14, 44, 14);

        ctx.fillStyle = '#d9a935';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(player.dancing ? '¡A BAILAR!' : 'ESCENARIO', stage.x + stage.w / 2, stage.y + stage.h + 16);

        // Barra de "tiempo a salvo" restante sobre el escenario
        const pct = player.stageSafeTime / STAGE_SAFE_MAX;
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(stage.x, stage.y + stage.h + 20, stage.w, 5);
        ctx.fillStyle = pct > 0.3 ? '#f2c85c' : '#e5484d';
        ctx.fillRect(stage.x, stage.y + stage.h + 20, stage.w * Math.max(0, pct), 5);
    }

    function drawBarIndicator(bar) {
        const cx = bar.x + bar.w / 2, cy = bar.y - 40;
        if (bar.ready) {
            const pulse = 0.55 + 0.45 * Math.sin(elapsed * 4);
            ctx.fillStyle = `rgba(63,185,80,${pulse})`;
            ctx.beginPath(); ctx.arc(cx, cy, 9, 0, Math.PI * 2); ctx.fill();
            ctx.font = '13px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('🍹', cx, cy + 4);
        } else {
            const pct = 1 - bar.cooldownTimer / BAR_COOLDOWN;
            ctx.strokeStyle = 'rgba(0,0,0,0.35)';
            ctx.lineWidth = 4;
            ctx.beginPath(); ctx.arc(cx, cy, 8, 0, Math.PI * 2); ctx.stroke();
            ctx.strokeStyle = '#d9a935';
            ctx.lineWidth = 4;
            ctx.beginPath(); ctx.arc(cx, cy, 8, -Math.PI / 2, -Math.PI / 2 + pct * Math.PI * 2); ctx.stroke();
        }
    }

    function drawStall(rect, color, label) {
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.beginPath();
        ctx.ellipse(rect.x + rect.w / 2, rect.y + rect.h + 6, rect.w / 2 + 6, 8, 0, 0, Math.PI * 2);
        ctx.fill();

        const bodyGrad = ctx.createLinearGradient(0, rect.y, 0, rect.y + rect.h);
        bodyGrad.addColorStop(0, '#5a3c24');
        bodyGrad.addColorStop(1, '#3a2414');
        ctx.fillStyle = bodyGrad;
        ctx.fillRect(rect.x, rect.y, rect.w, rect.h);

        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        for (let i = 0; i < 5; i++) ctx.fillRect(rect.x + 8 + i * 20, rect.y + 6, 6, 12);

        const stripeW = 14;
        for (let sx = 0; sx < rect.w + 12; sx += stripeW) {
            ctx.fillStyle = (Math.floor(sx / stripeW) % 2 === 0) ? color : '#fff5e6';
            ctx.fillRect(rect.x - 6 + sx, rect.y - 18, stripeW, 20);
        }
        ctx.fillStyle = 'rgba(0,0,0,0.15)';
        for (let sx = 0; sx < rect.w + 12; sx += stripeW) {
            ctx.beginPath();
            ctx.arc(rect.x - 6 + sx + stripeW / 2, rect.y + 2, stripeW / 2, 0, Math.PI);
            ctx.fill();
        }

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

        drawBarIndicator(rect);
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
        // Cartel arriba, DENTRO del bloque de la caseta (no vuela suelto
        // por debajo, donde antes se comía la barra de energía).
        ctx.fillStyle = '#173a52';
        ctx.fillRect(rect.x - 4, rect.y - 18, rect.w + 8, 16);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('🚻 ' + rect.label, rect.x + rect.w / 2, rect.y - 6);
    }

    function drawCubataIcon(x, y, scale) {
        scale = scale || 1;
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(scale, scale);
        ctx.fillStyle = '#e8e8e8';
        ctx.fillRect(-6, -10, 12, 16);
        ctx.fillStyle = '#e8912e';
        ctx.fillRect(-6, -2, 12, 8);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(4, -12); ctx.lineTo(7, -20); ctx.stroke();
        ctx.restore();
    }

    // Bolsita de azúcar de verdad: sobrecito de papel con el borde
    // festoneado arriba, en vez del rombo genérico de antes.
    function drawBolsita(b) {
        const pulse = 1 + Math.sin(elapsed * 8) * 0.12;
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.scale(pulse, pulse);

        // Solo la bolsa, sin más dibujos encima.
        ctx.fillStyle = '#f7f3ea';
        ctx.strokeStyle = '#c9bfa6';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-7, -6); ctx.lineTo(7, -6); ctx.lineTo(6, 9); ctx.lineTo(-6, 9);
        ctx.closePath(); ctx.fill(); ctx.stroke();

        ctx.restore();
    }

    // Billete para pagarle al tiburón (solo aparece mientras anda suelto)
    function drawBillete(b) {
        const bob = Math.sin(elapsed * 5 + b.x) * 2;
        ctx.save();
        ctx.translate(b.x, b.y + bob);
        ctx.rotate(Math.sin(elapsed * 2) * 0.15);
        ctx.fillStyle = '#3fa15a';
        ctx.strokeStyle = '#28753f';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(-11, -6, 22, 12, 2) : ctx.rect(-11, -6, 22, 12);
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#eafff0';
        ctx.beginPath(); ctx.arc(0, 0, 3.5, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
    }

    // Pequeña explosión de "azúcar" al llegar al baño con la bolsita
    function drawBursts() {
        bursts.forEach(b => {
            ctx.globalAlpha = Math.max(0, b.life / b.maxLife);
            ctx.fillStyle = b.color;
            ctx.fillRect(b.x - b.size / 2, b.y - b.size / 2, b.size, b.size);
        });
        ctx.globalAlpha = 1;
    }

    // Pastilla "de la energía": rombo azul con la ranura característica.
    function drawPastilla(p) {
        const pulse = 1 + Math.sin(elapsed * 10) * 0.18;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.scale(pulse, pulse);
        ctx.shadowColor = '#2f80ed';
        ctx.shadowBlur = 10;
        ctx.fillStyle = '#2f80ed';
        ctx.beginPath();
        ctx.moveTo(0, -10); ctx.lineTo(9, 0); ctx.lineTo(0, 10); ctx.lineTo(-9, 0);
        ctx.closePath(); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = 'rgba(255,255,255,0.8)';
        ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(0, 10); ctx.stroke();
        ctx.restore();
    }

    // El tiburón de la barra: un tiburón de verdad (cuerpo de torpedo,
    // aletas, dientes), de pie como el resto de personajes para que la
    // silueta funcione igual en el juego. Lleva SIEMPRE una factura
    // flotando encima -para que no haya duda de que viene a cobrar, no
    // solo a perseguir, y se distinga a la legua de las chavalas-.
    function drawTiburon(ch) {
        const bob = Math.sin(ch.bob) * 3;
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.beginPath(); ctx.ellipse(ch.x, ch.y + 18, 13, 4, 0, 0, Math.PI * 2); ctx.fill();
        ctx.save();
        ctx.translate(ch.x, ch.y + bob);

        // Cuerpo (torpedo, de pie sobre la cola)
        ctx.fillStyle = '#4a6a7a';
        ctx.beginPath();
        ctx.moveTo(0, -29);
        ctx.quadraticCurveTo(11, -20, 10, -1);
        ctx.quadraticCurveTo(9, 12, 0, 16);
        ctx.quadraticCurveTo(-9, 12, -10, -1);
        ctx.quadraticCurveTo(-11, -20, 0, -29);
        ctx.closePath();
        ctx.fill();

        // Vientre más claro
        ctx.fillStyle = '#cfe0e6';
        ctx.beginPath();
        ctx.moveTo(0, -19);
        ctx.quadraticCurveTo(6, -11, 5, 4);
        ctx.quadraticCurveTo(3, 12, 0, 14);
        ctx.quadraticCurveTo(-3, 12, -5, 4);
        ctx.quadraticCurveTo(-6, -11, 0, -19);
        ctx.closePath();
        ctx.fill();

        // Aletas pectorales (a los lados, como brazos)
        ctx.fillStyle = '#37505f';
        ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(-19, 7); ctx.lineTo(-8, 7); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(19, 7); ctx.lineTo(8, 7); ctx.closePath(); ctx.fill();

        // Aleta caudal (cola)
        ctx.beginPath(); ctx.moveTo(-4, 13); ctx.lineTo(-10, 24); ctx.lineTo(0, 16); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(4, 13); ctx.lineTo(10, 24); ctx.lineTo(0, 16); ctx.closePath(); ctx.fill();

        // Aleta dorsal (bien grande, la seña de identidad del tiburón)
        ctx.beginPath();
        ctx.moveTo(-4, -7); ctx.lineTo(0, -26); ctx.lineTo(5, -7);
        ctx.closePath(); ctx.fill();

        // Ojos
        ctx.fillStyle = '#16232a';
        ctx.beginPath(); ctx.arc(-4, -21, 1.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(4, -21, 1.5, 0, Math.PI * 2); ctx.fill();

        // Boca con dientes afilados
        ctx.strokeStyle = '#16232a';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(-5, -14); ctx.lineTo(5, -14); ctx.stroke();
        ctx.fillStyle = '#fff';
        for (let tx = -4; tx <= 4; tx += 2.6) {
            ctx.beginPath();
            ctx.moveTo(tx - 1.1, -14); ctx.lineTo(tx + 1.1, -14); ctx.lineTo(tx, -11.6);
            ctx.closePath(); ctx.fill();
        }

        ctx.restore();

        // Bocadillo con texto legible, siempre encima: un emoji suelto no
        // se entendía a simple vista -esto deja claro de un vistazo que
        // viene a cobrar, no solo a perseguir-.
        const iconBob = Math.sin(elapsed * 3) * 2;
        ctx.save();
        ctx.translate(ch.x, ch.y - 42 + iconBob);
        const bw = 78, bh = 18;
        ctx.fillStyle = 'rgba(255,255,255,0.95)';
        ctx.strokeStyle = '#16232a';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(-bw / 2, -bh / 2, bw, bh, 5);
        else ctx.rect(-bw / 2, -bh / 2, bw, bh);
        ctx.fill(); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-4, bh / 2 - 1); ctx.lineTo(0, bh / 2 + 6); ctx.lineTo(4, bh / 2 - 1);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#16232a';
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`PAGA YA (${billetesCollected}/${BILLETES_NEEDED})`, 0, 4);
        ctx.restore();
    }

    // Marcos, el gorila de seguridad: aparece un instante a echarte del
    // escenario a patadas si te quedas ahí más de la cuenta.
    function drawMarcos(x, y) {
        ctx.save();
        ctx.translate(x, y);
        ctx.globalAlpha = Math.min(1, marcosTimer / 0.3);

        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath(); ctx.ellipse(0, 18, 15, 4, 0, 0, Math.PI * 2); ctx.fill();

        ctx.fillStyle = '#1a1a22';
        ctx.beginPath();
        ctx.moveTo(-13, 14); ctx.lineTo(-9, -14); ctx.lineTo(9, -14); ctx.lineTo(13, 14);
        ctx.closePath(); ctx.fill();

        ctx.fillStyle = '#d8a878';
        ctx.beginPath(); ctx.arc(0, -20, 9, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#111';
        ctx.fillRect(-7, -22, 14, 4);

        // Pierna dando la patada
        ctx.fillStyle = '#1a1a22';
        ctx.beginPath();
        ctx.moveTo(6, 10); ctx.lineTo(28, 0); ctx.lineTo(24, 10); ctx.lineTo(10, 16);
        ctx.closePath(); ctx.fill();

        ctx.fillStyle = '#fff';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('MARCOS', 0, -34);
        ctx.restore();
    }

    function drawChavala(ch) {
        const bob = Math.sin(ch.bob) * 3;
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.beginPath(); ctx.ellipse(ch.x, ch.y + 13, 8, 3, 0, 0, Math.PI * 2); ctx.fill();
        ctx.save();
        ctx.translate(ch.x, ch.y + bob);

        const scared = powerMode;
        const flicker = scared && Math.floor(elapsed * 10) % 2 === 0;
        ctx.fillStyle = flicker ? '#5b7fff' : (scared ? '#dfe6ff' : ch.color);

        ctx.beginPath();
        ctx.moveTo(-11, 10); ctx.lineTo(-6, -10); ctx.lineTo(6, -10); ctx.lineTo(11, 10);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = scared ? '#dfe6ff' : '#ffd9b3';
        ctx.beginPath(); ctx.arc(0, -16, 8, 0, Math.PI * 2); ctx.fill();

        if (scared) {
            ctx.strokeStyle = '#2a2a30';
            ctx.lineWidth = 1.4;
            ctx.beginPath(); ctx.arc(-3, -17, 1.6, 0, Math.PI * 2); ctx.stroke();
            ctx.beginPath(); ctx.arc(3, -17, 1.6, 0, Math.PI * 2); ctx.stroke();
            ctx.beginPath(); ctx.arc(0, -12, 3, 0, Math.PI); ctx.stroke();
        } else {
            ctx.fillStyle = '#3a2416';
            ctx.beginPath(); ctx.arc(0, -19, 8.5, Math.PI, Math.PI * 2.15); ctx.fill();
        }
        ctx.restore();
    }

    // --- Personaje: torso fijo + piernas que rotan sobre la cadera para
    // simular la zancada (ver el recorte en tres piezas más arriba) ---
    function drawLeg(img, hipOriginX, localPivotX, angle) {
        if (!img.naturalWidth) return;
        const pivotX = -ORIG_W / 2 * SPR_SCALE + hipOriginX * SPR_SCALE;
        const pivotY = -PLAYER_IMG_H + 14 + HIP_Y * SPR_SCALE;
        ctx.save();
        ctx.translate(pivotX, pivotY);
        ctx.rotate(angle);
        ctx.drawImage(img, -localPivotX * SPR_SCALE, 0, img.naturalWidth * SPR_SCALE, img.naturalHeight * SPR_SCALE);
        ctx.restore();
    }

    // Bate de béisbol que empuña mientras dura el "modo azote" (pastilla):
    // el mango arranca DENTRO de la silueta del cuerpo (x negativa), pegado
    // a la bragueta, para que no se vea un hueco flotando aparte del
    // personaje. Da un latigazo rápido cada vez que se come a una chavala
    // (ver player.batSwing).
    function drawBat() {
        if (!powerMode) return;
        const swing = player.batSwing || 0;
        // Reposo: casi horizontal, saliendo de la cadera hacia delante (+x,
        // que tras el flip de "facing" siempre queda de cara). El golpe le
        // da un latigazo hacia abajo-adelante.
        const angle = -0.1 - swing * 1.1;
        ctx.save();
        // A la altura de la entrepierna/bragueta (borde inferior de la
        // sudadera), no de la rodilla: ahí el mango queda tapado por la
        // tela y no se ve un hueco flotando aparte del cuerpo.
        ctx.translate(2, -29);
        ctx.rotate(angle);
        ctx.fillStyle = '#6b4423';
        ctx.fillRect(-6, -2.5, 15, 5);
        ctx.fillStyle = '#c8935a';
        ctx.beginPath();
        ctx.moveTo(9, -3.5);
        ctx.quadraticCurveTo(24, -8, 36, -6);
        ctx.lineTo(36, 6);
        ctx.quadraticCurveTo(24, 8, 9, 3.5);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#8a5a30';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
    }

    function drawPlayerFallback() {
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
        const flashOn = player.invuln > 0 && Math.floor(elapsed * 12) % 2 === 0;

        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.beginPath(); ctx.ellipse(player.x, player.y + 16, 14, 5, 0, 0, Math.PI * 2); ctx.fill();

        ctx.save();
        ctx.translate(player.x, player.y);
        ctx.scale(player.facing, 1);
        if (flashOn) ctx.globalAlpha = 0.4;

        if (player.boost > 0 || powerMode) {
            ctx.strokeStyle = powerMode ? 'rgba(47, 128, 237, 0.75)' : 'rgba(63, 185, 80, 0.6)';
            ctx.lineWidth = 3;
            ctx.beginPath(); ctx.arc(0, 0, PLAYER_R + 8 + Math.sin(elapsed * 10) * 2, 0, Math.PI * 2); ctx.stroke();
        }

        if (playerPartsReady) {
            const swingAngle = Math.sin(player.legPhase) * 0.55 * player.legSwing;
            const bobY = -Math.abs(Math.sin(player.legPhase)) * 3 * player.legSwing;

            drawLeg(playerLegL, HIP_L_X, HIP_L_X, swingAngle);
            drawLeg(playerLegR, HIP_R_X, HIP_R_X - ORIG_W / 2, -swingAngle);

            const w = ORIG_W * SPR_SCALE;
            ctx.drawImage(playerTorso, -w / 2, -PLAYER_IMG_H + 14 + bobY, w, 400 * SPR_SCALE);
        } else {
            drawPlayerFallback();
        }

        drawBat();

        ctx.restore();

        if (player.carryingBolsita) {
            ctx.save();
            ctx.translate(player.x, player.y - 62);
            ctx.font = '16px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('🧂', 0, 0);
            ctx.restore();
        }
        if (player.dancing) {
            ctx.save();
            ctx.translate(player.x + Math.sin(elapsed * 5) * 10, player.y - 70 - Math.sin(elapsed * 5) * 4);
            ctx.font = '16px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('🎵', 0, 0);
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
        } else if (powerMode) {
            const tPct = Math.max(0, powerTimer / POWER_DURATION);
            ctx.fillStyle = '#2f80ed';
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

        if (bolsita) drawBolsita(bolsita);
        if (billete) drawBillete(billete);
        if (marcosTimer > 0) drawMarcos(marcosX, marcosY);
        if (pastilla) drawPastilla(pastilla);
        chavalas.forEach(ch => ch.isTiburon ? drawTiburon(ch) : drawChavala(ch));
        drawPlayer();
        drawBursts();

        particles.forEach(p => {
            ctx.globalAlpha = Math.max(0, p.life);
            ctx.fillStyle = p.color;
            ctx.font = 'bold 14px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(p.text, p.x, p.y);
            ctx.globalAlpha = 1;
        });

        drawEnergyBar();

        if (flashAlpha > 0) {
            ctx.fillStyle = flashColor;
            ctx.globalAlpha = flashAlpha;
            ctx.fillRect(0, 0, WORLD_W, WORLD_H);
            ctx.globalAlpha = 1;
        }
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
    function requestFullscreenSafe() {
        const el = document.documentElement;
        const req = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
        if (req) { try { req.call(el); } catch (err) { /* algunos navegadores móviles simplemente no lo permiten */ } }
    }

    let currentPlayerName = '';

    function startGame() {
        const nameInput = document.getElementById('player-name-input');
        const name = (nameInput.value || '').trim();
        if (!name) {
            nameInput.closest('.name-field').classList.add('invalid');
            nameInput.focus();
            return;
        }
        nameInput.closest('.name-field').classList.remove('invalid');
        currentPlayerName = name;
        Leaderboard.saveName(name);

        SFX.unlock();
        requestFullscreenSafe();
        resetGame();
        SFX.setLoop('ambience');
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
        let reasonText = 'Se acabó la fiesta por hoy.';
        if (reason === 'caught') reasonText = 'Sin energía para escapar, las chavalas te han cazado.';
        else if (reason === 'tiburon') reasonText = 'El tiburón de la barra te ha cobrado todas las copas... con intereses.';
        document.getElementById('gameover-reason').textContent = reasonText;
        document.getElementById('final-score').textContent = score;
        document.getElementById('final-best').textContent = highScore;
        document.getElementById('gameover-screen').classList.remove('hidden');
        document.getElementById('games-played-count').textContent = GamesPlayedCounter.bump();
        SFX.gameOver();

        Leaderboard.submitScore(currentPlayerName, score).then(() => {
            Leaderboard.refreshInto('leaderboard-gameover', currentPlayerName);
            Leaderboard.refreshInto('leaderboard-start', currentPlayerName);
        });
    }

    document.getElementById('btn-start').addEventListener('click', startGame);
    document.getElementById('btn-retry').addEventListener('click', startGame);
    document.getElementById('hud-best').textContent = `🏆 ${highScore}`;

    const nameInputEl = document.getElementById('player-name-input');
    nameInputEl.value = Leaderboard.getSavedName();
    nameInputEl.addEventListener('input', () => nameInputEl.closest('.name-field').classList.remove('invalid'));
    Leaderboard.refreshInto('leaderboard-start', nameInputEl.value.trim());

    setupJoystick();
    resizeCanvas();
    resetGame();
    draw();
})();
