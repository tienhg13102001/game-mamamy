// Mamamy Tower – ban test HTML5.
// Khung thiet ke 1080x1920 (giong khung anh TACH HINH), vat ly bang Matter.js.
(() => {
  'use strict';
  const { Engine, Body, Bodies, Composite, Events, Vertices } = Matter;

  const W = 1080, H = 1920;
  const STEP = 1000 / 60;

  // Tat ca thong so can chinh nam o day.
  const CFG = {
    itemScale: 0.8,          // ti le vat the so voi anh goc
    gravity: 1.7,
    clawY: 20,               // dinh moc gap (toa do man hinh)
    gripRatio: 0.42,         // dinh vat nam o 42% chieu cao moc
    swingCenter: 540,
    swingAmp: 300,
    // Moc chay deu toc (qua lai kieu ping-pong) thay vi hinh sin: hinh sin chay nhanh nhat
    // dung o giua man hinh - noi thap thuong dung - nen rat kho canh.
    // Cac gia tri duoi day bi ghi de boi preset do kho (DIFFICULTY).
    swingPx: 240,            // toc do moc, px/giay
    swingPxPerFloor: 6,
    swingPxMax: 420,
    inheritVx: 0,            // ti le van toc ngang cua moc truyen cho vat khi tha
    mediumFromFloor: 4,      // tu tang nay moi ra chai/tui
    hardFromFloor: 9,        // tu tang nay moi ra bo co rua
    groundY: 1800,           // mat san (toa do the gioi)
    towerTopScreenY: 1150,   // dinh thap duoc giu quanh vi tri nay khi cuon
    settleSpeed: 0.25,
    settleAngular: 0.012,
    settleFrames: 18,
    settleTimeoutMs: 5000,
    perfectPx: 18,
    // Che do "on dinh": vat roi khong xoay, dung collider day/dinh phang. Vat dap o dau thi nam yen o do,
    // chi lat do khi phan khoi tren con trung voi khoi duoi < minOverlap (xem landingOk).
    // Them ?free vao URL (hoac bam nut "Vat ly") de quay lai vat ly tu do de so sanh.
    stableMode: !/free/.test(location.search),
    minOverlap: 0.30,
    toppleFailMs: 1200,      // lat do bao lau thi tinh thua
    body: { friction: 0.9, frictionStatic: 1.4, restitution: 0, density: 0.002, slop: 0.02 },
  };

  const DIFFICULTY = {
    de:  { label: 'Dễ',  swingPx: 240, swingPxPerFloor: 6,  swingPxMax: 420, inheritVx: 0,    mediumFromFloor: 4, hardFromFloor: 9 },
    vua: { label: 'Vừa', swingPx: 300, swingPxPerFloor: 10, swingPxMax: 560, inheritVx: 0.05, mediumFromFloor: 3, hardFromFloor: 6 },
    kho: { label: 'Khó', swingPx: 380, swingPxPerFloor: 16, swingPxMax: 720, inheritVx: 0.12,  mediumFromFloor: 3, hardFromFloor: 6 },
  };
  let level = 'de';
  try { level = localStorage.getItem('mamamyTowerLevel') || 'de'; } catch (e) { /* ignore */ }
  const qLevel = (location.search.match(/level=(de|vua|kho)/) || [])[1];
  if (qLevel) level = qLevel;
  if (!DIFFICULTY[level]) level = 'de';
  function applyLevel() {
    const { label, ...p } = DIFFICULTY[level];
    Object.assign(CFG, p);
    try { localStorage.setItem('mamamyTowerLevel', level); } catch (e) { /* ignore */ }
  }
  applyLevel();

  // De: khan dep, rong. Vua: chai/tui (dinh hep -> mon sau kho dat). Kho: bo co rua.
  const POOL = {
    easy: ['khan_uot_do', 'khan_uot_xanh', 'khan_uot_tropical_1', 'khan_uot_tropical_2', 'khan_kho_tropical'],
    medium: ['bot_tam_goi', 'nuoc_rua_binh', 'nuoc_giat_xa'],
    hard: ['co_rua_binh'],
  };
  const TIER = {};
  for (const t in POOL) for (const n of POOL[t]) TIER[n] = t;

  // Collider on dinh cho mon cao/day tron (toa do pixel tren sprite GOC, chua scale).
  // Hinh thang: canh tren [tl..tr] o y0, canh day [bl..br] o y1 -> day phang, dinh phang.
  const STABLE_COLLIDER = {
    bot_tam_goi:   { y0: 0,  tl: 55, tr: 205, y1: 431, bl: 15, br: 285 },
    nuoc_rua_binh: { y0: 0,  tl: 30, tr: 170, y1: 430, bl: 10, br: 226 },
    co_rua_binh:   { y0: 28, tl: 0,  tr: 175, y1: 432, bl: 0,  br: 205 },
    nuoc_giat_xa:  { y0: 10, tl: 10, tr: 290, y1: 430, bl: 10, br: 290 },
  };

  const PINK = '#e8336d', PLUM = '#7a5470';

  // ---------- DOM ----------
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const toastEl = document.getElementById('toast');

  function fitCanvas() {
    const s = Math.min(innerWidth / W, innerHeight / H);
    canvas.style.width = W * s + 'px';
    canvas.style.height = H * s + 'px';
  }
  addEventListener('resize', fitCanvas);
  fitCanvas();

  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.style.display = 'block';
    clearTimeout(toast.t);
    toast.t = setTimeout(() => (toastEl.style.display = 'none'), 3500);
  }

  let best = 0;
  try { best = +localStorage.getItem('mamamyTowerBest') || 0; } catch (e) { /* private mode */ }
  function saveBest() { try { localStorage.setItem('mamamyTowerBest', best); } catch (e) { /* ignore */ } }

  // ---------- Anh ----------
  const IMG = {};
  function loadImages() {
    return Promise.all(Object.entries(window.SPRITES).map(([name, s]) => new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => { IMG[name] = im; res(); };
      im.onerror = () => rej(new Error('Khong tai duoc ' + s.file));
      im.src = s.file;
    })));
  }

  // Collider (toa do cuc bo da scale) + trong tam, tinh san cho tung vat:
  // hull = bam sat hinh, stable = hinh thang day/dinh phang (neu co khai bao).
  const SHAPE = {};
  function buildShapes() {
    const k = CFG.itemScale;
    const shape = (pts) => {
      const verts = Vertices.clockwiseSort(pts.map(([x, y]) => ({ x: x * k, y: y * k })));
      return { verts, c: Vertices.centre(verts) };
    };
    for (const [name, s] of Object.entries(window.SPRITES)) {
      if (s.kind !== 'item') continue;
      const st = STABLE_COLLIDER[name];
      SHAPE[name] = {
        hull: shape(s.hull),
        stable: st ? shape([[st.tl, st.y0], [st.tr, st.y0], [st.br, st.y1], [st.bl, st.y1]]) : null,
        w: s.w * k,
        h: s.h * k,
      };
    }
  }

  // ---------- Am thanh (bip nho bang WebAudio) ----------
  let actx = null;
  function beep(freq, dur = 0.08, type = 'sine', vol = 0.15) {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = type; o.frequency.value = freq;
      g.gain.setValueAtTime(vol, actx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + dur);
      o.connect(g).connect(actx.destination);
      o.start(); o.stop(actx.currentTime + dur);
    } catch (e) { /* khong co audio thi thoi */ }
  }

  // ---------- Vat ly ----------
  const engine = Engine.create({ positionIterations: 10, velocityIterations: 10 });
  engine.gravity.y = CFG.gravity;
  let ground;

  function makeItemBody(name, left, top) {
    const sh = SHAPE[name];
    const col = CFG.stableMode && sh.stable ? sh.stable : sh.hull;
    const b = Body.create({
      position: { x: left + col.c.x, y: top + col.c.y },
      vertices: col.verts,
      ...CFG.body,
    });
    b.itemName = name;
    b.shapeC = col.c;
    if (CFG.stableMode) {
      // Khoa xoay trong luc roi/dap -> khong bi lac lu roi do ngau nhien.
      b.savedInertia = b.inertia;
      Body.setInertia(b, Infinity);
    }
    return b;
  }

  // Phan be ngang cua khoi tren con nam tren khoi duoi (nhu nguoi choi nhin thay).
  function overlapRatio(upper, lower) {
    const a = upper.bounds, b = lower.bounds;
    const overlap = Math.max(0, Math.min(a.max.x, b.max.x) - Math.max(a.min.x, b.min.x));
    return overlap / Math.max(1, a.max.x - a.min.x);
  }

  // Dung duoc khi khoi tren con trung >= minOverlap. Neu khoi tren rong hon khoi duoi
  // (vd goi khan dat len chai) thi tam no con phai nam tren khoi duoi, khong thi trong vo ly.
  function landingOk(upper, lower) {
    if (overlapRatio(upper, lower) < CFG.minOverlap) return false;
    const a = upper.bounds, b = lower.bounds;
    if (a.max.x - a.min.x > b.max.x - b.min.x) {
      const cx = (a.min.x + a.max.x) / 2;
      if (cx < b.min.x || cx > b.max.x) return false;
    }
    return true;
  }

  function topple(b, dir) {
    b.toppling = true;
    S.toppleAt = performance.now();
    Body.setInertia(b, b.savedInertia);
    Body.setAngularVelocity(b, dir * 0.035);
    Body.setVelocity(b, { x: dir * 2.5, y: b.velocity.y });
    popup('Lệch rồi!', b.position.x, b.bounds.min.y + S.cam - 40, PLUM, 64);
    beep(260, 0.15, 'triangle', 0.1);
  }

  // ---------- Trang thai game ----------
  const S = {
    mode: 'loading',       // loading | intro | aiming | dropping | over
    t: 0,
    swingX: 0,             // lech so voi swingCenter
    swingDir: 1,
    clawX: CFG.swingCenter,
    clawVx: 0,
    clawOpen: 1,           // he so scaleX cua moc (mo/kep)
    held: null,            // { name, t }
    next: null,
    current: null,         // body dang roi
    still: 0,
    dropAt: 0,
    tower: [],             // body da dung yen (static)
    towerTop: CFG.groundY,
    cam: 0,
    score: 0,
    perfectStreak: 0,
    overAt: 0,
    overReason: '',
    popups: [],
    parts: [],
  };

  function pickItem(prevName, floor) {
    if (floor === 0) return 'khan_uot_do'; // tang de luon rong va chac
    // sau chai/tui (dinh hep) bat buoc ra mon de de van con co hoi dat duoc
    if (prevName && TIER[prevName] !== 'easy') return rand(POOL.easy);
    const r = Math.random();
    if (floor < CFG.mediumFromFloor) return rand(POOL.easy);
    if (floor < CFG.hardFromFloor) return r < 0.7 ? rand(POOL.easy) : rand(POOL.medium);
    return r < 0.45 ? rand(POOL.easy) : r < 0.85 ? rand(POOL.medium) : rand(POOL.hard);
  }
  function rand(a) { return a[(Math.random() * a.length) | 0]; }

  function reset() {
    Composite.clear(engine.world, false);
    ground = Bodies.rectangle(W / 2, CFG.groundY + 100, 6000, 200, { isStatic: true, label: 'ground', friction: 1 });
    Composite.add(engine.world, ground);
    Object.assign(S, {
      t: 0, swingX: 0, swingDir: 1, current: null, still: 0, tower: [], towerTop: CFG.groundY, cam: 0,
      score: 0, perfectStreak: 0, popups: [], parts: [], overReason: '',
    });
    S.held = { name: pickItem(null, 0), t: 0 };
    S.next = pickItem(S.held.name, 1);
  }

  function heldGeom() {
    const sh = SHAPE[S.held.name];
    const top = CFG.clawY + IMG.claw.height * CFG.gripRatio;
    return { left: S.clawX - sh.w / 2, top, sh };
  }

  function drop() {
    if (S.mode !== 'aiming' || !S.held || S.held.t < 0.3) return;
    const g = heldGeom();
    const b = makeItemBody(S.held.name, g.left, g.top - S.cam);
    Body.setVelocity(b, { x: (S.clawVx / 60) * CFG.inheritVx, y: 0 });
    Composite.add(engine.world, b);
    S.current = b;
    S.still = 0;
    S.dropAt = performance.now();
    S.held = null;
    S.mode = 'dropping';
    beep(520, 0.06, 'triangle');
  }

  function settle(b) {
    const prev = S.tower[S.tower.length - 1];
    if (prev && b.position.y > prev.position.y) return fail('Rơi lệch khỏi tháp!');
    Body.setStatic(b, true);
    S.tower.push(b);
    S.current = null;
    S.score++;
    S.towerTop = Math.min(S.towerTop, b.bounds.min.y);

    const sy = b.bounds.min.y + S.cam;
    let perfect = prev && Math.abs(b.position.x - prev.position.x) < CFG.perfectPx;
    if (perfect) {
      S.perfectStreak++;
      popup(S.perfectStreak > 1 ? `HOÀN HẢO x${S.perfectStreak}!` : 'HOÀN HẢO!', b.position.x, sy - 40, PINK, 76);
      burst(b.position.x, b.bounds.max.y, 26);
      beep(880, 0.12); setTimeout(() => beep(1320, 0.12), 90);
    } else {
      S.perfectStreak = 0;
      popup('+1', b.position.x, sy - 30, PLUM, 70);
      burst(b.position.x, b.bounds.max.y, 10);
      beep(330, 0.1, 'square', 0.08);
    }
    S.held = { name: S.next, t: 0 };
    S.next = pickItem(S.held.name, S.score + 1);
    S.mode = 'aiming';
  }

  function fail(reason) {
    if (S.mode === 'over') return;
    S.mode = 'over';
    S.overAt = performance.now();
    S.overReason = reason;
    S.held = null;
    if (S.score > best) { best = S.score; saveBest(); }
    beep(200, 0.25, 'sawtooth', 0.12); setTimeout(() => beep(140, 0.35, 'sawtooth', 0.12), 160);
  }

  Events.on(engine, 'collisionStart', (e) => {
    if (!S.current || S.mode !== 'dropping') return;
    const b = S.current, prev = S.tower[S.tower.length - 1];
    for (const p of e.pairs) {
      const other = p.bodyA === b ? p.bodyB : p.bodyB === b ? p.bodyA : null;
      if (!other) continue;
      if (other === ground && S.tower.length > 0) return fail(b.toppling ? 'Lệch quá, đổ rồi!' : 'Trượt xuống đất rồi!');
      // Che do on dinh: vua cham mat tren khoi duoi thi quyet dinh ngay - dung yen tai cho hay lat do.
      if (CFG.stableMode && other === prev && !b.landed && !b.toppling) {
        const prevH = prev.bounds.max.y - prev.bounds.min.y;
        if (b.bounds.max.y > prev.bounds.min.y + prevH * 0.4) continue; // chi quet canh ben, chua dap len mat
        if (!landingOk(b, prev)) {
          topple(b, b.position.x < prev.position.x ? -1 : 1);
        } else {
          b.landed = true;
          b.lockX = b.position.x; // khoa vi tri ngang: khong truot khoi mep, khong bi keo vao giua
        }
      }
    }
  });

  function postStep() {
    const b = S.current;
    if (!b || S.mode !== 'dropping') return;
    const sy = b.position.y + S.cam;
    if (sy > H + 400 || b.position.x < -400 || b.position.x > W + 400) return fail('Rơi ra ngoài rồi!');
    if (b.toppling) {
      if (performance.now() - S.toppleAt > CFG.toppleFailMs) fail('Lệch quá, không còn chỗ đỡ!');
      return;
    }
    if (b.landed) {
      Body.setPosition(b, { x: b.lockX, y: b.position.y });
      Body.setVelocity(b, { x: 0, y: b.velocity.y });
    }
    const calm = b.speed < CFG.settleSpeed && Math.abs(b.angularVelocity) < CFG.settleAngular;
    S.still = calm ? S.still + 1 : 0;
    const timedOut = performance.now() - S.dropAt > CFG.settleTimeoutMs;
    if (S.still >= CFG.settleFrames || timedOut) settle(b);
  }

  // ---------- Hieu ung ----------
  function popup(text, x, y, color, size) { S.popups.push({ text, x, y, color, size, t: 0 }); }
  function burst(x, y, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = 200 + Math.random() * 500;
      S.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 300, t: 0, life: 0.6 + Math.random() * 0.4,
        r: 6 + Math.random() * 10, c: Math.random() < 0.5 ? PINK : '#ffd3e2' });
    }
  }

  // ---------- Vong lap ----------
  let acc = 0;
  function update(dt) {
    S.t += dt;

    // Moc luon lac qua lai; nhanh dan theo so tang.
    const speed = Math.min(CFG.swingPx + S.score * CFG.swingPxPerFloor, CFG.swingPxMax);
    if (S.mode !== 'over') {
      S.swingX += S.swingDir * speed * dt;
      if (Math.abs(S.swingX) > CFG.swingAmp) {
        S.swingX = Math.sign(S.swingX) * (2 * CFG.swingAmp - Math.abs(S.swingX));
        S.swingDir = -S.swingDir;
      }
    }
    S.clawX = CFG.swingCenter + S.swingX;
    S.clawVx = S.mode === 'over' ? 0 : S.swingDir * speed;

    if (S.held) S.held.t += dt;

    // Moc kep vua be ngang mon dang giu, tha ra thi mo rong.
    const tipSpan = 316; // khoang cach 2 dau cang do trong anh goc
    const target = S.held ? clamp((SHAPE[S.held.name].w + 24) / tipSpan, 0.72, 1.4) : 1.15;
    S.clawOpen += (target - S.clawOpen) * Math.min(1, dt * 10);

    if (S.mode === 'dropping' || S.mode === 'over' || S.mode === 'aiming') {
      acc = Math.min(acc + dt * 1000, STEP * 5);
      while (acc >= STEP) { Engine.update(engine, STEP); postStep(); acc -= STEP; }
    }

    // Cuon thap: giu dinh thap quanh CFG.towerTopScreenY.
    const camTarget = Math.max(0, CFG.towerTopScreenY - S.towerTop);
    S.cam += (camTarget - S.cam) * Math.min(1, dt * 3);

    for (const p of S.popups) { p.t += dt; p.y -= 120 * dt; }
    S.popups = S.popups.filter((p) => p.t < 1.1);
    for (const p of S.parts) { p.t += dt; p.vy += 1600 * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
    S.parts = S.parts.filter((p) => p.t < p.life);
  }

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  const easeOutBack = (t) => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2);

  // ---------- Ve ----------
  const video = document.createElement('video');
  video.muted = true; video.playsInline = true;
  let camOn = false, safeOn = false, debugOn = /debug/.test(location.search);

  function drawBackground() {
    if (camOn && video.readyState >= 2) {
      const vw = video.videoWidth, vh = video.videoHeight, s = Math.max(W / vw, H / vh);
      ctx.save();
      ctx.translate(W, 0); ctx.scale(-1, 1); // guong nhu camera truoc
      ctx.drawImage(video, (W - vw * s) / 2, (H - vh * s) / 2, vw * s, vh * s);
      ctx.restore();
      return;
    }
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#f6eef4'); g.addColorStop(1, '#e9dbe6');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  function drawItemBody(b) {
    const sh = SHAPE[b.itemName];
    ctx.save();
    ctx.translate(b.position.x, b.position.y + S.cam);
    ctx.rotate(b.angle);
    ctx.drawImage(IMG[b.itemName], -b.shapeC.x, -b.shapeC.y, sh.w, sh.h);
    ctx.restore();
  }

  function drawGround() {
    const y = CFG.groundY + S.cam;
    if (y > H + 20) return;
    ctx.fillStyle = 'rgba(122,84,112,.18)';
    ctx.beginPath(); ctx.ellipse(W / 2, y + 6, 420, 26, 0, 0, Math.PI * 2); ctx.fill();
  }

  function drawClaw() {
    const claw = IMG.claw;
    ctx.strokeStyle = '#5b3f55'; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(S.clawX, -10); ctx.lineTo(S.clawX, CFG.clawY + 10); ctx.stroke();

    // Giong anh mau: mon hang che than moc, chi lo 2 cang o hai ben.
    ctx.save();
    ctx.translate(S.clawX, CFG.clawY);
    ctx.scale(S.clawOpen, 1);
    ctx.drawImage(claw, -claw.width / 2, 0);
    ctx.restore();
    if (S.held) {
      const g = heldGeom();
      const k = easeOutBack(Math.min(1, S.held.t / 0.35));
      const dy = (1 - k) * -520;
      ctx.drawImage(IMG[S.held.name], g.left, g.top + dy, g.sh.w, g.sh.h);
    }
  }

  function drawNext() {
    const p = window.SPRITES.next_panel, [x, y] = p.sourceBBox;
    ctx.drawImage(IMG.next_panel, x, y);
    if (!S.next || S.mode === 'intro') return;
    const im = IMG[S.next], box = 150, s = Math.min(box / im.width, box / im.height);
    ctx.drawImage(im, x + p.w * 0.63 - (im.width * s) / 2, y + p.h / 2 - (im.height * s) / 2, im.width * s, im.height * s);
  }

  function text(str, x, y, size, color, opts = {}) {
    ctx.font = `${opts.weight || 800} ${size}px "Baloo 2", system-ui, sans-serif`;
    ctx.textAlign = opts.align || 'center';
    ctx.textBaseline = 'middle';
    if (opts.stroke !== false) {
      ctx.lineJoin = 'round';
      ctx.lineWidth = size * 0.16;
      ctx.strokeStyle = opts.stroke || '#fff';
      ctx.strokeText(str, x, y);
    }
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  function drawScore() {
    const x = 36, y = 250, w = 210, h = 150;
    ctx.fillStyle = PLUM; roundRect(x, y + 8, w, h, 34); ctx.fill();
    ctx.fillStyle = PINK; roundRect(x, y, w, h, 34); ctx.fill();
    text('TẦNG', x + w / 2, y + 36, 34, '#ffd3e2', { stroke: false, weight: 600 });
    text(String(S.score), x + w / 2, y + 95, 84, '#fff', { stroke: false });
  }

  function drawIntro() {
    ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(0, 0, W, H);
    const lg = IMG.logo_text, s = 1.35;
    ctx.drawImage(lg, (W - lg.width * s) / 2, 700, lg.width * s, lg.height * s);
    text('Chạm màn hình để thả đồ', W / 2, 1060, 54, PLUM);
    text('xếp tháp Mamamy thật cao!', W / 2, 1125, 54, PLUM);
    const pulse = 1 + Math.sin(S.t * 5) * 0.05;
    ctx.save(); ctx.translate(W / 2, 1300); ctx.scale(pulse, pulse);
    ctx.fillStyle = PINK; roundRect(-250, -60, 500, 120, 60); ctx.fill();
    text('CHẠM ĐỂ CHƠI', 0, 4, 60, '#fff', { stroke: false });
    ctx.restore();
    if (best) text(`Kỷ lục: ${best} tầng`, W / 2, 1440, 44, PLUM);
    text(`Độ khó: ${DIFFICULTY[level].label}`, W / 2, 1510, 40, PLUM, { weight: 600 });
  }

  function drawOver() {
    const k = Math.min(1, (performance.now() - S.overAt) / 500);
    ctx.fillStyle = `rgba(40,20,35,${0.55 * k})`; ctx.fillRect(0, 0, W, H);
    if (k < 1) return;
    const x = 140, y = 620, w = W - 280, h = 640;
    ctx.fillStyle = '#fff'; roundRect(x, y, w, h, 60); ctx.fill();
    text('THÁP ĐỔ RỒI!', W / 2, y + 110, 88, PINK, { stroke: false });
    text(S.overReason, W / 2, y + 195, 44, PLUM, { stroke: false, weight: 600 });
    text(String(S.score), W / 2, y + 330, 170, PLUM, { stroke: false });
    text('tầng', W / 2, y + 430, 48, PLUM, { stroke: false, weight: 600 });
    text(S.score >= best && S.score > 0 ? 'KỶ LỤC MỚI!' : `Kỷ lục: ${best}`, W / 2, y + 520, 50, PINK, { stroke: false });
    if (performance.now() - S.overAt > 900) {
      text('Chạm để chơi lại', W / 2, y + h + 90, 56, '#fff', { stroke: PLUM });
    }
  }

  // Vung cac nut/chu cua TikTok de. Uoc luong tu anh chup MMM SBD Effect 2 1.jpg.
  function drawSafeZones() {
    ctx.fillStyle = 'rgba(0,120,255,.22)';
    ctx.fillRect(0, 0, W, 230);        // thanh tab tren
    ctx.fillRect(930, 1000, 150, 920); // cot like/comment/share
    ctx.fillRect(0, 1640, 930, 280);   // ten + caption
    text('vùng UI TikTok (ước lượng)', W / 2, 200, 30, '#0a5bd8', { stroke: false, weight: 600 });
  }

  function drawDebug() {
    ctx.strokeStyle = '#00d060'; ctx.lineWidth = 3;
    for (const b of Composite.allBodies(engine.world)) {
      ctx.beginPath();
      b.vertices.forEach((v, i) => (i ? ctx.lineTo(v.x, v.y + S.cam) : ctx.moveTo(v.x, v.y + S.cam)));
      ctx.closePath(); ctx.stroke();
    }
    text(`cam ${S.cam.toFixed(0)}  top ${S.towerTop.toFixed(0)}  mode ${S.mode}`, 20, H - 30, 28, '#000', { align: 'left', weight: 600 });
  }

  function render() {
    drawBackground();
    if (S.mode === 'loading') { text('Đang tải…', W / 2, H / 2, 60, PLUM); return; }
    drawGround();
    for (const b of S.tower) drawItemBody(b);
    if (S.current) drawItemBody(S.current);
    drawNext(); // ve truoc moc de mon dang giu nam tren o xem truoc
    drawClaw();
    if (S.mode !== 'intro') drawScore();
    for (const p of S.parts) {
      ctx.globalAlpha = 1 - p.t / p.life;
      ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x, p.y + S.cam, p.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (const p of S.popups) {
      ctx.globalAlpha = 1 - Math.max(0, p.t - 0.6) / 0.5;
      text(p.text, p.x, p.y, p.size, p.color);
    }
    ctx.globalAlpha = 1;
    if (S.mode === 'intro') drawIntro();
    if (S.mode === 'over') drawOver();
    if (safeOn) drawSafeZones();
    if (debugOn) drawDebug();
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (S.mode !== 'loading') update(dt);
    render();
    requestAnimationFrame(frame);
  }

  // ---------- Dieu khien ----------
  function onTap() {
    if (S.mode === 'intro') { S.mode = 'aiming'; S.held.t = 0; beep(660, 0.08); return; }
    if (S.mode === 'aiming') return drop();
    if (S.mode === 'over' && performance.now() - S.overAt > 900) { reset(); S.mode = 'aiming'; }
  }
  canvas.addEventListener('pointerdown', (e) => { e.preventDefault(); onTap(); });
  addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); onTap(); }
    if (e.code === 'KeyD') toggle(document.getElementById('btnDebug'), (v) => (debugOn = v));
    if (e.code === 'KeyR') { reset(); S.mode = 'aiming'; }
  });

  function toggle(btn, set) {
    const v = btn.getAttribute('aria-pressed') !== 'true';
    btn.setAttribute('aria-pressed', v);
    set(v);
    return v;
  }
  document.getElementById('btnSafe').onclick = (e) => toggle(e.currentTarget, (v) => (safeOn = v));
  document.getElementById('btnDebug').onclick = (e) => toggle(e.currentTarget, (v) => (debugOn = v));
  document.getElementById('btnDebug').setAttribute('aria-pressed', debugOn);
  const btnLevel = document.getElementById('btnLevel');
  const levelLabel = () => (btnLevel.textContent = 'Độ khó: ' + DIFFICULTY[level].label);
  levelLabel();
  btnLevel.onclick = () => {
    const keys = Object.keys(DIFFICULTY);
    level = keys[(keys.indexOf(level) + 1) % keys.length];
    applyLevel();
    levelLabel();
    reset();
    S.mode = 'intro';
  };
  const btnPhys = document.getElementById('btnPhys');
  const physLabel = () => {
    btnPhys.textContent = CFG.stableMode ? 'Vật lý: Ổn định' : 'Vật lý: Tự do';
    btnPhys.setAttribute('aria-pressed', CFG.stableMode);
  };
  physLabel();
  btnPhys.onclick = () => {
    CFG.stableMode = !CFG.stableMode;
    physLabel();
    reset();
    S.mode = 'intro';
    toast(CFG.stableMode ? 'Ổn định: đặt lệch vẫn đứng, chỉ đổ khi trùng nhau dưới 30%.' : 'Tự do: vật lý thật như bản đầu.');
  };
  document.getElementById('btnCam').onclick = async (e) => {
    const btn = e.currentTarget;
    if (camOn) {
      camOn = false; btn.setAttribute('aria-pressed', false);
      if (video.srcObject) video.srcObject.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
      return;
    }
    try {
      video.srcObject = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
      await video.play();
      camOn = true; btn.setAttribute('aria-pressed', true);
    } catch (err) {
      toast('Không mở được camera (cần localhost hoặc https): ' + err.message);
    }
  };

  // ---------- Khoi dong ----------
  requestAnimationFrame(frame);
  Promise.all([loadImages(), document.fonts ? document.fonts.load('800 60px "Baloo 2"').catch(() => {}) : null])
    .then(() => {
      buildShapes();
      reset();
      S.mode = 'intro';
    })
    .catch((err) => toast(err.message));

  // Mo cho console de test nhanh: MT.state, MT.drop()
  window.MT = { state: S, drop: onTap, reset, CFG, overlapRatio };
})();
