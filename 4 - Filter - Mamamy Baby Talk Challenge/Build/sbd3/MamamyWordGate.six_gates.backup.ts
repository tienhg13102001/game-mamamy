/**
 * MamamyWordGate — "Say the word": read the word on the near gate aloud to pass it.
 *
 * A winding road fills the lower screen. The near gate (large, left) carries the word to say,
 * the far gate (small, right) previews the next one, and the big baby in the bottom-right is
 * the near gate's baby. The player is running down the road toward the gates (the gates jog
 * gently on the spot while waiting). A KeywordDetector listens to the microphone for every gate's
 * words (the list is set once — changing it mid-round stopped detection in tests):
 *   - a hit on the near gate's accepted words = we go THROUGH the gate: it slides along the near
 *     stretch of the road to the big baby and frames it (drawn behind the baby, so the baby stands
 *     inside the arch), then jumps in front of the baby and slides on down the road off the
 *     bottom-right of the screen (no zoom to full screen). The big baby switches to the next gate's
 *     baby at that moment, the far gate glides forward and a new far gate fades in;
 *   - a hit on any other gate's word = we CRASH into the near gate: it slides along the road up to
 *     the big baby, bumps into it (the baby jolts in place) and backs off to its spot; the say-it
 *     hint shows. The gate stays, so the player reads again (no losing).
 * After the last gate (NINETEEN) the MEGA MAMAMY 19 result shows. No timer and no touch input for
 * gates: the round waits until the word is heard.
 *
 * Flow: INTRO → press TikTok Record (or tap RECORD TO PLAY) → LISTEN ⇄ PASSING → RESULT
 *       → tap PLAY AGAIN (or Record again).
 * Gate poses are in 720x1280 screen space (centre origin, y up); a pose's y is the gate's FEET
 * (bottom), so a gate always stands on the road. The path follows the S-shaped road: a new gate
 * enters on the far stretch at the right edge, walks left to the far spot, bends down along the
 * road to the near spot, and when passed follows the near stretch through the big baby and away.
 */
class Pose {
  x: number;
  bottom: number;
  s: number;
  a: number;
  constructor(x: number, bottom: number, s: number, a: number) {
    this.x = x;
    this.bottom = bottom;
    this.s = s;
    this.a = a;
  }
}

class GateView {
  obj: APJS.SceneObject;
  st: APJS.ScreenTransform;
  img: APJS.Image;
  w: number = 0;
  h: number = 0;
  from: Pose = new Pose(0, 0, 1, 1);
  to: Pose = new Pose(0, 0, 1, 1);
  ctrl: Pose | null = null;   // optional bezier control points for a curved move (cubic when ctrl2 is set)
  ctrl2: Pose | null = null;
  band: number = 0;           // transparent strip under the gate's legs (px at scale 1)
  run: boolean = false;       // being run through: accelerates, and only fades once off screen
  sec: number = 0;
  t: number = 0;
  active: boolean = false;
  constructor(obj: APJS.SceneObject) {
    this.obj = obj;
    this.st = obj.getComponent("ScreenTransform") as APJS.ScreenTransform;
    this.img = obj.getComponent("Image") as APJS.Image;
  }
}

class AnimPart {
  st: APJS.ScreenTransform | undefined;
  baseX: number = 0;
  baseY: number = 0;
}

class ConfettiLayer {
  st!: APJS.ScreenTransform;
  img!: APJS.Image;
  baseY: number = 0;
  slide: boolean = true;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function seg(t: number, a: number, b: number): number {
  return clamp((t - a) / (b - a), 0, 1);
}

function easeOutBack(k: number): number {
  const c = 1.70158;
  return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2);
}

function cub(a: number, c1: number, c2: number, b: number, t: number): number {
  const u = 1 - t;
  return u * u * u * a + 3 * u * u * t * c1 + 3 * u * t * t * c2 + t * t * t * b;
}

function bez(a: number, c: number, b: number, t: number): number {
  return (1 - t) * (1 - t) * a + 2 * (1 - t) * t * c + t * t * b;
}

function easeInOut(k: number): number {
  return k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
}

@component()
export class MamamyWordGate extends APJS.BasicScriptComponent {
  @header("Theme & Assets")
  @serializeProperty @tooltip('Gates in play order') gateTextures: APJS.Texture[] = [];
  @serializeProperty @tooltip('Big baby for each gate, same order') babyTextures: APJS.Texture[] = [];
  @serializeProperty @tooltip('Big baby centre X for each gate (px)') babyX: number[] = [];
  @serializeProperty @tooltip('Big baby centre Y for each gate (px)') babyY: number[] = [];
  @serializeProperty @tooltip('Accepted spoken words per gate, comma-separated, same order') accepted: string[] = [];

  @header("Gameplay Tuning")
  @serializeProperty @tooltip('Silence before the say-it hint shows (s)') @slider(1, 10, 0.5) hintAfterSec: number = 4;
  @serializeProperty @tooltip('Running through a gate (s)') @slider(0.2, 1.5, 0.05) passSec: number = 0.6;
  @serializeProperty @tooltip('Ignore hits this soon after a pass, so one word never passes two gates (s)') @slider(0, 1.5, 0.05) cooldownSec: number = 0.5;
  @serializeProperty @tooltip('Demo video autoplay (starts itself): 0 off, 1 passes a gate every 1.4s, 2 crashes into each gate once, then passes') @spinBox(0, 2, 1) demoMode: number = 0;
  @serializeProperty @tooltip('Phone test only: show every word the detector hears at the top of the screen') showHeard: boolean = false;

  @header("Advanced — Scene Wiring")
  @serializeProperty @tooltip('Far gate, drawn behind the near gate') gateFar: APJS.SceneObject;
  @serializeProperty gateNear: APJS.SceneObject;
  @serializeProperty @tooltip('Passed gate while still ahead of the big baby (drawn under the baby)') gateExit: APJS.SceneObject;
  @serializeProperty @tooltip('Passed gate once the baby has gone through it (drawn over the baby)') gateExitFront: APJS.SceneObject;
  @serializeProperty bigBaby: APJS.SceneObject;
  @serializeProperty sayHint: APJS.SceneObject;
  @serializeProperty introOverlay: APJS.SceneObject;
  @serializeProperty introButton: APJS.SceneObject;
  @serializeProperty resultOverlay: APJS.SceneObject;
  @serializeProperty winEffect: APJS.SceneObject;
  @serializeProperty resultLogo: APJS.SceneObject;
  @serializeProperty retryButton: APJS.SceneObject;
  @serializeProperty @tooltip('2D Text used by showHeard') heardText: APJS.SceneObject;
  @serializeProperty @tooltip('Editor test only: plays this clip at game start and listens to it instead of the microphone. Leave empty to publish.') testAudio: APJS.AudioComponent;

  private readonly SCALE: number = 720 / 1080;   // source px -> screen px
  // Poses are the gate's VISIBLE feet (the leg tips), checked against the road layer so both legs
  // always stand on the road, also all along the far → near move.
  private readonly SPAWN: Pose = new Pose(407, -134, 0.32, 0);  // far stretch, at the right edge
  private readonly FAR: Pose = new Pose(195, -190, 0.6, 1);     // far gate, fully on the far stretch
  private readonly BEND1: Pose = new Pose(-120, -230, 0.7, 1);  // far → near follows the road's left bend
  private readonly BEND2: Pose = new Pose(-120, -230, 0.88, 1);
  private readonly NEAR: Pose = new Pose(-81, -394, 1, 1);      // mockup near gate
  // Transparent strip under the legs of each gate image (share of its height), same order as the
  // gates: EAT, POO, SLEEP, CRY, PEE, NINETEEN. Used so every gate's legs land on its pose.
  private readonly FEET_BAND: number[] = [0.078, 0.072, 0.035, 0.008, 0.008, 0.008];
  // Going through: the gate frames the big baby at this scale, then carries on along the near
  // stretch (NEAR → baby direction) for EXIT_RUN times that distance, off the bottom-right.
  private readonly CROSS_SCALE: number = 1.2;
  private readonly EXIT_RUN: number = 1.7;
  private readonly EXIT_SCALE: number = 1.5;
  private exitFront: GateView | undefined;
  private exitT: number = -1;         // passed-gate clock, -1 = none
  private exitCross: Pose = new Pose(0, 0, 1, 1);
  private exitEnd: Pose = new Pose(0, 0, 1, 1);
  private nextBaby: number = -1;      // baby shown once we are through the gate (-1 none, -2 hide)
  private bumpT: number = -1;         // crash animation clock, -1 = none
  private babyHitT: number = -1;      // baby jolt when a gate bumps into it
  private bumpF: number = 0;          // how far the near gate is into its bump (0 = at its spot)
  // Crash: slide BUMP_REACH of the way to the baby (0.35s), hold the hit (0.1s), back off (0.45s).
  private readonly BUMP_REACH: number = 0.62;
  private readonly BUMP_SEC: number = 0.9;
  private demoBumped: boolean = false;
  private readonly retryDelay: number = 1.3;
  private readonly finishDelay: number = 0.5;

  private inited: boolean = false;
  private startOnInit: boolean = false;
  private detector: APJS.KeywordDetector | null = null;
  private state: string = "INTRO";
  private gate: number = 0;          // index of the near gate
  private t: number = 0;
  private stateT: number = 0;
  private silenceT: number = 0;
  private coolT: number = 0;
  private heardCount: number = 0;

  private far!: GateView;
  private near!: GateView;
  private exit!: GateView;
  private babySt!: APJS.ScreenTransform;
  private babyImg!: APJS.Image;
  private babyPopT: number = -1;
  private hintSt: APJS.ScreenTransform | undefined;
  private anim: AnimPart[] = [];
  private confetti: ConfettiLayer[] = [];

  // Detector builders only work in onInit.
  onInit(): void {
    const builder = APJS.AudioDetectionModule.getOrCreateAudioDetectionBuilder(APJS.AudioDetectionType.Keyword) as APJS.KeywordDetectorBuilder;
    if (!builder) return;
    if (this.testAudio) builder.setDetectorSource(APJS.AudioSourceType.ExternalFile, this.testAudio);
    else builder.setDetectorSource(APJS.AudioSourceType.Microphone, null);
    this.detector = builder.build();
    console.log("MamamyWordGate detector " + (this.detector ? "ready" : "unavailable") + ", source " + (this.testAudio ? "test clip" : "microphone"));
    if (!this.detector) return;
    this.detector.eventEmitter.on(APJS.KeywordEventType.KeywordHit, this.onKeywordHit, this);
    this.detector.eventEmitter.on(APJS.KeywordEventType.KeywordMiss, this.onKeywordMiss, this);
  }

  onStart(): void {
    APJS.EventManager.getGlobalEmitter().on(APJS.EventType.Touch, this.onTouch, this);
    APJS.EventManager.getGlobalEmitter().on(APJS.EventType.RecordStart, this.onRecordStart, this);
  }

  onDestroy(): void {
    APJS.EventManager.getGlobalEmitter().off(APJS.EventType.Touch, this.onTouch, this);
    APJS.EventManager.getGlobalEmitter().off(APJS.EventType.RecordStart, this.onRecordStart, this);
    if (this.detector) {
      this.detector.eventEmitter.off(APJS.KeywordEventType.KeywordHit, this.onKeywordHit, this);
      this.detector.eventEmitter.off(APJS.KeywordEventType.KeywordMiss, this.onKeywordMiss, this);
    }
  }

  // Serialized refs are only populated after onStart, so wire everything lazily.
  private initOnce(): boolean {
    if (this.inited) return true;
    if (!this.gateFar || !this.gateNear || !this.gateExit || !this.bigBaby ||
        this.gateTextures.length === 0 || this.babyTextures.length < this.gateTextures.length) return false;
    this.far = new GateView(this.gateFar);
    this.near = new GateView(this.gateNear);
    this.exit = new GateView(this.gateExit);
    if (this.gateExitFront) this.exitFront = new GateView(this.gateExitFront);
    this.babySt = this.bigBaby.getComponent("ScreenTransform") as APJS.ScreenTransform;
    this.babyImg = this.bigBaby.getComponent("Image") as APJS.Image;
    if (this.sayHint) this.hintSt = this.sayHint.getComponent("ScreenTransform") as APJS.ScreenTransform;
    for (const obj of [this.resultLogo, this.retryButton, this.introButton]) {
      const part = new AnimPart();
      if (obj) {
        part.st = obj.getComponent("ScreenTransform") as APJS.ScreenTransform;
        part.baseX = part.st.anchoredPosition.x;
        part.baseY = part.st.anchoredPosition.y;
      }
      this.anim.push(part);
    }
    // Confetti layers (children of winEffect): falling pieces slide in, the glow overlay fades in.
    if (this.winEffect) {
      for (const child of this.winEffect.getChildren()) {
        const layer = new ConfettiLayer();
        layer.st = child.getComponent("ScreenTransform") as APJS.ScreenTransform;
        layer.img = child.getComponent("Image") as APJS.Image;
        if (!layer.st || !layer.img) continue;
        layer.baseY = layer.st.anchoredPosition.y;
        layer.slide = child.name.indexOf("Overlay") < 0;
        this.confetti.push(layer);
      }
    }
    this.inited = true;
    this.resetGame();
    if (this.startOnInit) { this.startOnInit = false; this.startGame(); }
    return true;
  }

  onUpdate(dt: number): void {
    if (!this.initOnce()) return;
    this.t += dt;
    this.stateT += dt;
    this.coolT = Math.max(0, this.coolT - dt);
    for (const g of [this.far, this.near]) this.updateGate(g, dt);
    this.updateExit(dt);
    this.updateIdle(dt);
    this.updateBaby(dt);

    if (this.state === "INTRO") {
      this.setPart(this.anim[2], 0, 0, 1 + 0.05 * Math.sin(this.t * 5));
      if (this.demoMode > 0 && this.stateT >= 2.0) this.startGame();
    } else if (this.state === "LISTEN") {
      this.silenceT += dt;
      this.updateHint();
      if (this.demoMode === 1 && this.stateT >= 1.4) this.pass();
      if (this.demoMode === 2) {
        if (!this.demoBumped && this.stateT >= 0.9) { this.demoBumped = true; this.bump(); }
        if (this.stateT >= 2.3) this.pass();
      }
    } else if (this.state === "PASSING") {
      if (this.stateT >= this.passSec) {
        if (this.gate >= this.gateTextures.length) this.setState("FINISH");
        else this.listen();
      }
    } else if (this.state === "FINISH") {
      if (this.stateT >= this.finishDelay) this.showResult();
    } else if (this.state === "RESULT") {
      this.updateResultAnim(this.stateT);
    }
  }

  // ---------- Input / lifecycle ----------
  private onTouch(event: APJS.IEvent): void {
    if (!this.inited) return;
    const touch = event.args[0] as APJS.TouchData;
    if (touch.phase !== APJS.TouchPhase.Began) return;
    if (this.state === "INTRO") {
      if (this.introButton && this.hitImage(touch.position, this.introButton)) this.startGame();
    } else if (this.state === "RESULT" && this.stateT > this.retryDelay) {
      this.resetGame();
      this.startGame();
    }
  }

  // Pressing Record starts a fresh round.
  private onRecordStart(): void {
    if (!this.inited) { this.startOnInit = true; return; }
    this.resetGame();
    this.startGame();
  }

  // Every gate's words are targets; only the near gate's accepted words pass it.
  private onKeywordHit(event: APJS.IEvent): void {
    const words = event.args[0] as string[];
    if (!this.inited) return;
    if (this.state !== "LISTEN" || this.coolT > 0) {
      this.setHeard("heard (ignored): " + words.join(", "));
      return;
    }
    const ok = this.acceptedFor(this.gate);
    console.log("MamamyWordGate heard " + words.join(",") + " at gate " + this.gate);
    this.heardCount++;
    this.setHeard("#" + this.heardCount + " heard: " + words.join(", ") + "  (gate " + (this.gate + 1) + ")");
    for (const w of words) {
      if (ok.indexOf(w.toLowerCase().trim()) >= 0) { this.pass(); return; }
    }
    this.bump();   // a word of another gate: we run into this one
  }

  private resetGame(): void {
    this.gate = 0;
    this.showGate(this.near, 0, this.NEAR, this.NEAR, 0);
    this.showGate(this.far, 1, this.FAR, this.FAR, 0);
    this.exit.obj.setEnabledInHierarchy(false);
    this.exit.active = false;
    if (this.exitFront) { this.exitFront.obj.setEnabledInHierarchy(false); this.exitFront.active = false; }
    this.exitT = -1;
    this.nextBaby = -1;
    this.babyHitT = -1;
    this.setBaby(0, false);
    this.listenFor(-1);
    if (this.testAudio) this.testAudio.stop();
    if (this.sayHint) this.sayHint.setEnabledInHierarchy(false);
    if (this.resultOverlay) this.resultOverlay.setEnabledInHierarchy(false);
    if (this.winEffect) this.winEffect.setEnabledInHierarchy(false);
    this.resetAnimParts();
    if (this.introOverlay) this.introOverlay.setEnabledInHierarchy(true);
    this.setHeard(this.detector ? "listening... say a word" : "keyword detection unavailable");
    this.setState("INTRO");
  }

  private startGame(): void {
    if (this.introOverlay) this.introOverlay.setEnabledInHierarchy(false);
    if (this.testAudio) this.testAudio.play();
    this.listen();
  }

  private listen(): void {
    this.silenceT = 0;
    this.demoBumped = false;
    this.bumpT = -1;
    this.listenFor(this.gate);
    this.setState("LISTEN");
  }

  // ---------- Gates ----------
  // We run through the near gate (it swells past the camera), the far gate moves to the front
  // and a new far gate fades in.
  private pass(): void {
    this.listenFor(-1);
    this.coolT = this.cooldownSec;
    if (this.sayHint) this.sayHint.setEnabledInHierarchy(false);
    const n = this.gate;
    this.startExit(n);
    this.bumpT = -1;
    this.gate = n + 1;
    if (this.gate < this.gateTextures.length) {
      // Same time window as the passed gate sliding up to the baby.
      this.showGate(this.near, this.gate, this.FAR, this.NEAR, this.passSec * 0.5, this.BEND1, false, this.BEND2);
      this.nextBaby = this.gate;
    } else {
      this.near.obj.setEnabledInHierarchy(false);
      this.near.active = false;
      this.nextBaby = -2;
    }
    if (this.gate + 1 < this.gateTextures.length) this.showGate(this.far, this.gate + 1, this.SPAWN, this.FAR, this.passSec * 0.5);
    else { this.far.obj.setEnabledInHierarchy(false); this.far.active = false; }
    this.setState("PASSING");
  }

  // The passed gate heads for the big baby: its feet land on the baby's feet, framing it.
  private startExit(n: number): void {
    this.showGate(this.exit, n, this.NEAR, this.NEAR, 0);
    if (this.exitFront) this.showGate(this.exitFront, n, this.NEAR, this.NEAR, 0);
    if (this.exitFront) { this.exitFront.obj.setEnabledInHierarchy(false); this.exitFront.active = false; }
    this.exitCross = this.crossPose();
    const bx = this.exitCross.x, feet = this.exitCross.bottom;
    const dx = bx - this.NEAR.x, dy = feet - this.NEAR.bottom;
    this.exitEnd = new Pose(bx + dx * this.EXIT_RUN, feet + dy * this.EXIT_RUN - 260, this.EXIT_SCALE, 1);
    this.exitT = 0;
  }

  // Where a gate stands when it frames the big baby: its feet on the baby's feet.
  private crossPose(): Pose {
    const bx = this.babySt.anchoredPosition.x;
    const feet = this.babySt.anchoredPosition.y - this.babySt.sizeDelta.y / 2;
    return new Pose(bx, feet, this.CROSS_SCALE, 1);
  }

  private updateExit(dt: number): void {
    if (this.exitT < 0) return;
    this.exitT += dt;
    const k = seg(this.exitT, 0, this.passSec), k1 = 0.5;
    const mix = (a: Pose, b: Pose, e: number, al: number) =>
      new Pose(a.x + (b.x - a.x) * e, a.bottom + (b.bottom - a.bottom) * e, a.s + (b.s - a.s) * e, al);
    if (k < k1) {
      this.placeAt(this.exit, mix(this.NEAR, this.exitCross, Math.pow(k / k1, 1.5), 1));
      return;
    }
    const front = this.exitFront ? this.exitFront : this.exit;
    if (front !== this.exit && this.exit.active) {
      this.exit.obj.setEnabledInHierarchy(false);
      this.exit.active = false;
      front.obj.setEnabledInHierarchy(true);
      front.active = true;
    }
    if (this.nextBaby >= 0) { this.setBaby(this.nextBaby, true); this.nextBaby = -1; }   // we are through
    const u = (k - k1) / (1 - k1);
    this.placeAt(front, mix(this.exitCross, this.exitEnd, Math.pow(u, 0.9), 1 - seg(u, 0.85, 1)));
    if (k >= 1) {
      front.obj.setEnabledInHierarchy(false);
      front.active = false;
      this.exit.obj.setEnabledInHierarchy(false);
      this.exit.active = false;
      this.exitT = -1;
    }
  }

  private placeAt(g: GateView, p: Pose): void {
    g.st.anchoredPosition = new APJS.Vector2f(p.x, this.centreY(g, p.bottom, p.s));
    g.st.scale = new APJS.Vector2f(Math.max(0.001, p.s), Math.max(0.001, p.s));
    g.img.opacity = p.a;
  }

  // Centre y of a gate whose leg tips stand at feetY.
  private centreY(g: GateView, feetY: number, s: number): number {
    return feetY + (g.h / 2 - g.band) * s;
  }

  private showGate(g: GateView, index: number, from: Pose, to: Pose, sec: number, ctrl: Pose | null = null, run: boolean = false, ctrl2: Pose | null = null): void {
    if (index >= this.gateTextures.length) { g.obj.setEnabledInHierarchy(false); g.active = false; return; }
    const tex = this.gateTextures[index];
    g.img.texture = tex;
    g.w = tex.getWidth() * this.SCALE;
    g.h = tex.getHeight() * this.SCALE;
    g.st.sizeDelta = new APJS.Vector2f(g.w, g.h);
    g.band = (index < this.FEET_BAND.length ? this.FEET_BAND[index] : 0) * g.h;
    g.from = from;
    g.to = to;
    g.ctrl = ctrl;
    g.ctrl2 = ctrl2;
    g.run = run;
    g.sec = sec;
    g.t = 0;
    g.active = true;
    g.obj.setEnabledInHierarchy(true);
    this.placeGate(g, sec > 0 ? 0 : 1);
  }

  private updateGate(g: GateView, dt: number): void {
    if (!g || !g.active || g.sec <= 0) return;
    g.t += dt;
    const k = seg(g.t, 0, g.sec);
    this.placeGate(g, k);
    if (k >= 1) {
      g.sec = 0;
      if (g.to.a <= 0) { g.obj.setEnabledInHierarchy(false); g.active = false; }
    }
  }

  private placeGate(g: GateView, k: number): void {
    const e = g.run ? Math.pow(k, 1.8) : easeInOut(k);   // running through: speeds up into the arch
    const a = g.from, b = g.to, c = g.ctrl ? g.ctrl : null, d = g.ctrl2;
    const lerp = (p: number, q: number) => p + (q - p) * e;
    const s = c && d ? cub(a.s, c.s, d.s, b.s, e) : c ? bez(a.s, c.s, b.s, e) : lerp(a.s, b.s);
    const x = c && d ? cub(a.x, c.x, d.x, b.x, e) : c ? bez(a.x, c.x, b.x, e) : lerp(a.x, b.x);
    const bottom = c && d ? cub(a.bottom, c.bottom, d.bottom, b.bottom, e) : c ? bez(a.bottom, c.bottom, b.bottom, e) : lerp(a.bottom, b.bottom);
    g.st.anchoredPosition = new APJS.Vector2f(x, this.centreY(g, bottom, s));
    g.st.scale = new APJS.Vector2f(Math.max(0.001, s), Math.max(0.001, s));
    g.img.opacity = g.run ? 1 - seg(k, 0.8, 1) : g.from.a + (g.to.a - g.from.a) * e;
  }

  // ---------- Running on the spot / crashing ----------
  // Waiting gates jog a little (we are running toward them). A wrong word makes the near gate
  // lunge at us, shake and rebound.
  private bump(): void {
    if (this.state !== "LISTEN" || this.bumpT >= 0) return;
    this.bumpT = 0;
    this.coolT = Math.max(this.coolT, this.BUMP_SEC);
    this.silenceT = Math.max(this.silenceT, this.hintAfterSec);   // show "say it" right away
    console.log("MamamyWordGate bump at gate " + this.gate + " t=" + this.t.toFixed(2));
  }

  private updateIdle(dt: number): void {
    const jog = this.state === "LISTEN" || this.state === "INTRO";
    this.bumpF = 0;
    for (const [g, pose, phase] of [[this.near, this.NEAR, 0], [this.far, this.FAR, 0]] as [GateView, Pose, number][]) {
      if (!g || !g.active || g.sec > 0) continue;
      let s = 1, dx = 0, dy = 0;
      if (jog) {
        const w = this.t * 5.5 + phase;
        dy = 3 * Math.abs(Math.sin(w));
        s = 1 + 0.008 * Math.sin(w);
      }
      if (g === this.near && this.bumpT >= 0) {
        // Slide along the road toward the baby, bump into it, back off to the gate's spot.
        const before = this.bumpT;
        this.bumpT += dt;
        const t = this.bumpT;
        let f: number;
        if (t < 0.35) f = this.BUMP_REACH * Math.pow(t / 0.35, 2);
        else if (t < 0.45) f = this.BUMP_REACH;
        else f = this.BUMP_REACH * (1 - (1 - Math.pow(1 - seg(t, 0.45, this.BUMP_SEC), 2)));
        if (before < 0.35 && t >= 0.35) this.babyHitT = 0;
        this.bumpF = f;
        const c = this.crossPose();
        const p = new Pose(pose.x + (c.x - pose.x) * f, pose.bottom + (c.bottom - pose.bottom) * f,
          pose.s + (c.s - pose.s) * f, 1);
        if (t >= 0.35 && t < 0.45) s *= 1 - 0.04 * Math.sin(Math.PI * (t - 0.35) / 0.1);   // the knock
        if (t >= this.BUMP_SEC) this.bumpT = -1;
        g.st.anchoredPosition = new APJS.Vector2f(p.x, this.centreY(g, p.bottom + dy, p.s * s));
        g.st.scale = new APJS.Vector2f(p.s * s, p.s * s);
        continue;
      }
      if (g === this.far && this.bumpF > 0) {
        // The far gate moves with the near one: the same share of its way along the road bend.
        const f = this.bumpF, a = this.FAR, c = this.BEND1, d = this.BEND2, b = this.NEAR;
        const q = new Pose(cub(a.x, c.x, d.x, b.x, f), cub(a.bottom, c.bottom, d.bottom, b.bottom, f), cub(a.s, c.s, d.s, b.s, f), 1);
        g.st.anchoredPosition = new APJS.Vector2f(q.x + dx, this.centreY(g, q.bottom + dy, q.s * s));
        g.st.scale = new APJS.Vector2f(q.s * s, q.s * s);
        continue;
      }
      g.st.anchoredPosition = new APJS.Vector2f(pose.x + dx, this.centreY(g, pose.bottom + dy, pose.s * s));
      g.st.scale = new APJS.Vector2f(pose.s * s, pose.s * s);
    }
  }

  // ---------- Big baby ----------
  private setBaby(index: number, pop: boolean): void {
    const tex = this.babyTextures[index];
    this.babyImg.texture = tex;
    this.babySt.sizeDelta = new APJS.Vector2f(tex.getWidth() * this.SCALE, tex.getHeight() * this.SCALE);
    const x = index < this.babyX.length ? this.babyX[index] : 160;
    const y = index < this.babyY.length ? this.babyY[index] : -464;
    this.babySt.anchoredPosition = new APJS.Vector2f(x, y);
    this.bigBaby.setEnabledInHierarchy(true);
    this.babyPopT = pop ? 0 : -1;
    if (!pop) this.babySt.scale = new APJS.Vector2f(1, 1);
  }

  private updateBaby(dt: number): void {
    if (!this.babySt) return;
    let s = 1 + 0.015 * Math.sin(this.t * 2.2);
    if (this.babyPopT >= 0) {
      this.babyPopT += dt;
      // The next baby pops in the moment we are through the gate.
      s *= easeOutBack(seg(this.babyPopT, 0, 0.35));
      if (this.babyPopT >= 0.35) this.babyPopT = -1;
    }
    let sx = 1, sy = 1;
    if (this.babyHitT >= 0) {           // knocked by the gate: a quick squash, it stays in place
      this.babyHitT += dt;
      const k = seg(this.babyHitT, 0, 0.3), j = Math.sin(k * Math.PI) * (1 - k);
      sx = 1 + 0.12 * j; sy = 1 - 0.1 * j;
      if (k >= 1) this.babyHitT = -1;
    }
    this.babySt.scale = new APJS.Vector2f(Math.max(0.001, s * sx), Math.max(0.001, s * sy));
  }

  private onKeywordMiss(): void {
    // Needed: in tests the detector only reported hits while a Miss listener was attached too.
  }

  // ---------- Listening ----------
  private acceptedFor(index: number): string[] {
    if (index < 0 || index >= this.accepted.length) return [];
    return this.accepted[index].split(",").map((w) => w.toLowerCase().trim()).filter((w) => w.length > 0);
  }

  // Set the target list once: the union of every gate's accepted words.
  private listenFor(index: number): void {
    if (!this.detector || index < 0 || this.detector.targetKeywords.length > 0) return;
    const all: string[] = [];
    for (let i = 0; i < this.accepted.length; i++) {
      for (const w of this.acceptedFor(i)) if (all.indexOf(w) < 0) all.push(w);
    }
    this.detector.targetKeywords = all;
    console.log("MamamyWordGate listening for " + all.join("|"));
  }

  private updateHint(): void {
    if (!this.sayHint) return;
    const show = this.silenceT >= this.hintAfterSec;
    this.sayHint.setEnabledInHierarchy(show);
    if (show && this.hintSt) {
      const s = 1 + 0.06 * Math.sin(this.t * 6);
      this.hintSt.scale = new APJS.Vector2f(s, s);
    }
  }

  private setHeard(msg: string): void {
    if (!this.heardText) return;
    this.heardText.setEnabledInHierarchy(this.showHeard);
    if (!this.showHeard) return;
    const txt = this.heardText.getComponent("Text") as APJS.Text;
    if (txt) txt.text = msg;
  }

  private hitImage(pos: APJS.Vector2f, obj: APJS.SceneObject): boolean {
    const img = obj ? obj.getComponent("Image") as APJS.Image : undefined;
    return img ? APJS.TouchUtils.isScreenPointOnImage(pos, img) : false;
  }

  private setState(s: string): void {
    this.state = s;
    this.stateT = 0;
  }

  // ---------- Result ----------
  private showResult(): void {
    this.setState("RESULT");
    this.bigBaby.setEnabledInHierarchy(false);
    if (this.testAudio) this.testAudio.stop();
    if (this.resultOverlay) this.resultOverlay.setEnabledInHierarchy(true);
    if (this.winEffect) this.winEffect.setEnabledInHierarchy(true);
    this.updateResultAnim(0);
  }

  // Confetti slides down, the logo drops in, then PLAY AGAIN pops and keeps a gentle pulse.
  private updateResultAnim(t: number): void {
    const slideK = 1 - Math.pow(1 - seg(t, 0, 1.2), 3);
    for (const layer of this.confetti) {
      if (layer.slide) {
        layer.st.anchoredPosition = new APJS.Vector2f(layer.st.anchoredPosition.x, layer.baseY + (1 - slideK) * 1280);
        layer.img.opacity = seg(t, 0, 0.4);
      } else {
        layer.img.opacity = seg(t, 0, 1.0);
      }
    }
    const logo = this.anim[0], btn = this.anim[1];
    const kLogo = easeOutBack(seg(t, 0, 0.5));
    this.setPart(logo, 0, (1 - kLogo) * 320, 0.6 + 0.4 * kLogo);
    const kBtn = easeOutBack(seg(t, 0.6, 1.0));
    this.setPart(btn, 0, 0, t > 1.0 ? 1 + 0.05 * Math.sin((t - 1.0) * 5) : kBtn);
  }

  private setPart(part: AnimPart, dx: number, dy: number, scale: number): void {
    if (!part || !part.st) return;
    const s = Math.max(0.001, scale);
    part.st.anchoredPosition = new APJS.Vector2f(part.baseX + dx, part.baseY + dy);
    part.st.scale = new APJS.Vector2f(s, s);
  }

  private resetAnimParts(): void {
    for (const part of this.anim) this.setPart(part, 0, 0, 1);
    for (const layer of this.confetti) {
      layer.st.anchoredPosition = new APJS.Vector2f(layer.st.anchoredPosition.x, layer.baseY);
      layer.img.opacity = 1;
    }
  }
}
