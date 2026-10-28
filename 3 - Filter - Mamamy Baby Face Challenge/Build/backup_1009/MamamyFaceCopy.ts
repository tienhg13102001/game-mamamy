/**
 * MamamyFaceCopy — "Copy the baby face": make the expression on the front card to pass it.
 *
 * A queue of six expression cards stands on a diagonal road (front card = target). The big baby
 * face stays put on the road as a live mirror: every frame the player's face is classified into
 * one of the six expressions and the mirror shows it. We are running down the road toward the
 * cards (like the gates of Game 3), so the road and the cards jog while the baby stands still:
 *   - Wrong expression: we keep running into the front card: it slides down the road up to the
 *     baby, bumps into it (the baby jolts in place) and backs off to its spot, over and over.
 *   - Target expression held for holdSec: we keep running: the front card slides past us down
 *     the road and off the bottom-left of the screen while the whole queue moves up the road.
 * A round is roundCards random cards (from the eleven designs) and then the 19 shield card. When
 * the shield card is matched it does not leave: it turns into the plain 19 shield, flies to the
 * shield's spot in the MEGA MAMAMY 19 logo and the logo bursts out of it (FINALE). No timer.
 *
 * Expression classes (index order used everywhere): 0 tongue / open mouth, 1 cry, 2 wink, 3 sad,
 * 4 neutral, 5 smile / grin, 6 laugh / eyes-shut smile. Each card names its class (cardClass).
 * Classification uses documented face tracking only (106 landmarks + expression attributes):
 *   eye openness = eyelid gap / eye width, judged against the player's own open-eye baseline
 *   (people's eyes differ a lot), mouth openness = inner-lip gap / mouth width, mouth-corner
 *   drop (frown) against the player's own resting mouth, happyScore (0-100), the Sad
 *   probability and the tracker's one-eye blink actions.
 *   Wink = one eye clearly more shut than the other (the other eye often squints too). Tongue-out has no documented signal, so it is
 *   "mouth open, eyes open, not laughing"; if the undocumented avatar-drive blendshapes ever
 *   report data, their tongueOut channel is used as well.
 *
 * Flow: INTRO → press TikTok Record (or tap RECORD TO PLAY) → PLAYING ⇄ PASSING → FINALE → RESULT
 *       → only the logo + confetti (client: no PLAY AGAIN on a win) → tap (or Record again).
 * Card poses are screen-space centres (720x1280, origin at the centre, y up) taken from mockup 1
 * and moved into the lower band of the screen so the player's face is never covered (see SLOTS).
 */
class Pose {
  x: number;
  y: number;
  s: number;
  a: number;
  constructor(x: number, y: number, s: number, a: number) {
    this.x = x;
    this.y = y;
    this.s = s;
    this.a = a;
  }
}

class CardView {
  obj: APJS.SceneObject;
  st: APJS.ScreenTransform;
  img: APJS.Image;
  from: Pose = new Pose(0, 0, 1, 1);
  to: Pose = new Pose(0, 0, 1, 1);
  sec: number = 0;
  t: number = 0;
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

function easeInOut(k: number): number {
  return k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
}

@component()
export class MamamyFaceCopy extends APJS.BasicScriptComponent {
  @header("Theme & Assets")
  @serializeProperty @tooltip('Expression cards; the LAST one is the 19 shield card that ends every round') cardTextures: APJS.Texture[] = [];
  @serializeProperty @tooltip('Expression class each card asks for, same order (0 tongue, 1 cry, 2 wink, 3 sad, 4 neutral, 5 smile, 6 laugh)') cardClass: number[] = [];
  @serializeProperty @tooltip('Mirror face per class: tongue, cry, wink, sad, neutral, smile, laugh') faceTextures: APJS.Texture[] = [];
  @serializeProperty @tooltip('Each card\'s own big face, same order as the cards: the mirror shows it while the player makes that card\'s expression') cardFaceTextures: APJS.Texture[] = [];
  @serializeProperty @tooltip('Plain 19 shield the shield card turns into at the finale') shieldPlainTex: APJS.Texture;
  @serializeProperty @tooltip('Random expression cards before the shield card') @spinBox(1, 10, 1) roundCards: number = 6;
  @serializeProperty @tooltip('Result logo width (px)') @slider(300, 700, 5) logoW: number = 520;
  @serializeProperty @tooltip('Shield centre inside the logo, x as a share of the logo width from its centre') logoShieldX: number = 0.3674;
  @serializeProperty @tooltip('Shield centre inside the logo, y (up) as a share of the logo height from its centre') logoShieldY: number = 0.1429;
  @serializeProperty @tooltip('Shield height as a share of the logo height') logoShieldH: number = 0.6851;

  @header("Gameplay Tuning")
  @serializeProperty @tooltip('Hold the right expression this long to pass a card (s)') @slider(0.1, 2, 0.05) holdSec: number = 0.5;
  @serializeProperty @tooltip('Eye counts as closed below this share of the player own open-eye size') @slider(0.2, 0.9, 0.01) eyeClosedRatio: number = 0.6;
  @serializeProperty @tooltip('Mouth counts as open above this openness (lip gap / mouth width)') @slider(0.03, 0.5, 0.01) mouthOpen: number = 0.12;
  @serializeProperty @tooltip('happyScore (0-100) that counts as a smile') @slider(10, 100, 1) smileHappy: number = 45;
  @serializeProperty @tooltip('An open mouth this happy counts as laughing (smile), not tongue-out') @slider(10, 100, 1) laughHappy: number = 70;
  @serializeProperty @tooltip('Sad probability (0-1) that counts as sad') @slider(0.05, 0.9, 0.01) sadProb: number = 0.25;
  @serializeProperty @tooltip('Wink: the more-shut eye is below this share of the other eye') @slider(0.3, 0.95, 0.01) winkRatio: number = 0.7;
  @serializeProperty @tooltip('Sad: mouth corners dropped by this much (share of mouth width) below the resting mouth') @slider(0.005, 0.1, 0.001) frownDrop: number = 0.02;
  @serializeProperty @tooltip('A new expression must last this long before the mirror switches (s)') @slider(0, 0.5, 0.01) mirrorDelay: number = 0.12;
  @serializeProperty @tooltip('Running through a card (s)') @slider(0.3, 2, 0.05) passSec: number = 0.8;
  @serializeProperty @tooltip('Demo video autoplay (starts itself): 0 off, 1 matches each card, 2 runs into each card first, then matches') @spinBox(0, 2, 1) demoMode: number = 0;
  @serializeProperty @tooltip('Phone test only: show the classifier readings at the top of the screen') showDebug: boolean = false;
  @serializeProperty @tooltip('Tuning only: write the classifier readings to the console 4x per second') logReadings: boolean = false;

  @header("Advanced — Scene Wiring")
  @serializeProperty @tooltip('Queue slots, FRONT first (slot 0 = target card)') cardSlots: APJS.SceneObject[] = [];
  @serializeProperty @tooltip('Passed card while still ahead of the baby (drawn under the baby)') cardExit: APJS.SceneObject;
  @serializeProperty @tooltip('Passed card once the baby has gone through it (drawn over the baby)') cardExitFront: APJS.SceneObject;
  @serializeProperty @tooltip('Road images, they jog with the cards while we run') roadParts: APJS.SceneObject[] = [];
  @serializeProperty mirrorFace: APJS.SceneObject;
  @serializeProperty introOverlay: APJS.SceneObject;
  @serializeProperty introButton: APJS.SceneObject;
  @serializeProperty resultOverlay: APJS.SceneObject;
  @serializeProperty winEffect: APJS.SceneObject;
  @serializeProperty resultLogo: APJS.SceneObject;
  @serializeProperty @tooltip('Soft white glow drawn under the result logo; follows it') logoGlow: APJS.SceneObject;
  @serializeProperty @tooltip('2D Text used by showDebug') debugText: APJS.SceneObject;

  private readonly NAMES: string[] = ["TONGUE", "CRY", "WINK", "SAD", "NEUTRAL", "SMILE", "LAUGH"];
  private readonly CLASSES: number = 7;
  // The whole board (road, cards, baby) sits in the lower band so the player's face stays
  // visible (client feedback 2026-09-30): mockup 1's layout squashed with y' = -40 + (y − 308)·0.62,
  // cards at 0.7 and the baby at 0.58 of their mockup size.
  // Queue slot poses (front → back) along the road in perspective: the road vanishes toward
  // (540, 76) and slot k is at V + (front − V)·s, s = 1, .72, .52, .38, .28, .2.
  // Wide spacing; back slots run off the right edge.
  private readonly SLOTS: Pose[] = [
    new Pose(154, -188.8, 0.7, 1),
    new Pose(262, -114.4, 0.504, 1),
    new Pose(339, -61.7, 0.364, 1),
    new Pose(393, -24.5, 0.266, 1),
    new Pose(432, 1.5, 0.196, 1),
    new Pose(463, 23.2, 0.14, 1),
  ];
  // Passing a card: it keeps sliding down the same road line toward us and leaves the screen at
  // the bottom-left, growing only a little (no zoom to full screen).
  private readonly EXIT: Pose = new Pose(-700, -776.6, 1.26, 1);
  // Card size when it frames the baby (the baby sits inside the card at the crossing).
  private readonly CROSS_SCALE: number = 0.75;
  private readonly BUMP_CYCLE: number = 1.5;   // slide in 0.35s, hit 0.1s, back off 0.45s, wait
  private readonly BUMP_REACH: number = 0.6;    // share of the way to the baby a bump reaches
  private readonly retryDelay: number = 1.3;
  private readonly burstSec: number = 0.55;
  private cardPx: number = 1;          // screen px per card texture px (from the slot size)
  private logoH: number = 220;
  private finFrom: Pose = new Pose(0, 0, 1, 1);

  private inited: boolean = false;
  private startOnInit: boolean = false;
  private state: string = "INTRO";
  private stateT: number = 0;
  private t: number = 0;
  private order: number[] = [];
  private step: number = 0;          // index into order of the front card
  private slots: CardView[] = [];
  private exit!: CardView;
  private exitFront: CardView | undefined;
  private exitFrom: Pose = new Pose(0, 0, 1, 1);
  private exitT: number = -1;        // passed-card clock, -1 = none
  private faceSt!: APJS.ScreenTransform;
  private faceImg!: APJS.Image;
  private faceBaseX: number = 0;
  private faceBaseY: number = 0;
  private cycT: number = 1.2;       // bump cycle clock (starts near the end: the first bump comes soon)
  private bobY: number = 0;          // running jog shared by the road and the cards
  private roadSt: APJS.ScreenTransform[] = [];
  private roadBase: APJS.Vector2f[] = [];
  private popT: number = -1;         // baby's happy pop after a pass (scale only, it stays put)
  private hitT: number = -1;         // baby's jolt when the card bumps into it
  private bumpF: number = 0;         // how far the front card is into its bump (0 = at its slot)
  private bumpPrev: number = 0;
  private anim: AnimPart[] = [];
  private confetti: ConfettiLayer[] = [];

  // Classifier state
  private seen: number = 4;          // expression the mirror shows
  private candidate: number = 4;
  private candidateT: number = 0;
  private holdT: number = 0;
  private eyeL: number = 0.22;
  private eyeR: number = 0.22;
  private open: number = 0;
  private happy: number = 0;
  private sad: number = 0;
  private tongueBs: number = -1;
  private hasFace: boolean = false;
  private eyeBase: number = 0.2;     // player's open-eye openness: rises fast, sinks slowly
  private curve: number = 0;         // mouth-corner drop: + = corners below the lip centre (frown)
  private curveBase: number = -0.04; // player's resting mouth, learned while the face is calm
  private blinkOne: boolean = false; // tracker reports exactly one eye blinking
  private pout: boolean = false;     // tracker reports puckered / pouting lips
  private logT: number = 0;

  onStart(): void {
    APJS.EventManager.getGlobalEmitter().on(APJS.EventType.Touch, this.onTouch, this);
    APJS.EventManager.getGlobalEmitter().on(APJS.EventType.RecordStart, this.onRecordStart, this);
  }

  onDestroy(): void {
    APJS.EventManager.getGlobalEmitter().off(APJS.EventType.Touch, this.onTouch, this);
    APJS.EventManager.getGlobalEmitter().off(APJS.EventType.RecordStart, this.onRecordStart, this);
  }

  // Serialized refs are only populated after onStart, so wire everything lazily.
  private initOnce(): boolean {
    if (this.inited) return true;
    if (this.cardSlots.length < 6 || !this.cardExit || !this.mirrorFace || this.cardTextures.length < 2 ||
        this.cardClass.length < this.cardTextures.length || this.faceTextures.length < this.CLASSES) return false;
    for (const obj of this.cardSlots) this.slots.push(new CardView(obj));
    this.exit = new CardView(this.cardExit);
    if (this.cardExitFront) this.exitFront = new CardView(this.cardExitFront);
    this.faceSt = this.mirrorFace.getComponent("ScreenTransform") as APJS.ScreenTransform;
    this.faceImg = this.mirrorFace.getComponent("Image") as APJS.Image;
    this.faceBaseX = this.faceSt.anchoredPosition.x;
    for (const obj of this.roadParts) {
      const st = obj ? obj.getComponent("ScreenTransform") as APJS.ScreenTransform : undefined;
      if (!st) continue;
      this.roadSt.push(st);
      this.roadBase.push(new APJS.Vector2f(st.anchoredPosition.x, st.anchoredPosition.y));
    }
    this.faceBaseY = this.faceSt.anchoredPosition.y;
    // Cards keep their own aspect (the shield card is narrower) at the size the slots were built for.
    const st0 = this.slots[0].st, t0 = this.cardTextures[0];
    this.cardPx = st0.sizeDelta.x / Math.max(t0.getWidth(), 1);
    for (const obj of [this.resultLogo, this.introButton]) {
      const part = new AnimPart();
      if (obj) {
        part.st = obj.getComponent("ScreenTransform") as APJS.ScreenTransform;
        part.baseX = part.st.anchoredPosition.x;
        part.baseY = part.st.anchoredPosition.y;
      }
      this.anim.push(part);
    }
    const logoImg = this.resultLogo ? this.resultLogo.getComponent("Image") as APJS.Image : undefined;
    if (logoImg && logoImg.texture && this.anim[0].st) {
      this.logoH = this.logoW * logoImg.texture.getHeight() / Math.max(logoImg.texture.getWidth(), 1);
      this.anim[0].st.sizeDelta = new APJS.Vector2f(this.logoW, this.logoH);
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
    this.updateFrame(dt);
    this.syncGlow();
  }

  // The soft white glow under the result logo copies the logo's place, size, scale, turn and fade.
  private syncGlow(): void {
    if (!this.logoGlow || !this.resultLogo) return;
    const ls = this.resultLogo.getComponent("ScreenTransform") as APJS.ScreenTransform;
    const gs = this.logoGlow.getComponent("ScreenTransform") as APJS.ScreenTransform;
    const li = this.resultLogo.getComponent("Image") as APJS.Image;
    const gi = this.logoGlow.getComponent("Image") as APJS.Image;
    if (!ls || !gs || !li || !gi || !li.texture || !gi.texture) return;
    const k = ls.sizeDelta.x / Math.max(li.texture.getWidth(), 1);
    gs.sizeDelta = new APJS.Vector2f(gi.texture.getWidth() * k, gi.texture.getHeight() * k);
    gs.anchoredPosition = ls.anchoredPosition;
    gs.scale = ls.scale;
    gs.rotation = ls.rotation;
    gi.opacity = li.opacity;
  }

  private updateFrame(dt: number): void {
    if (!this.initOnce()) return;
    this.t += dt;
    this.stateT += dt;
    this.readFace(dt);
    this.updateMirror(dt);
    this.updateWorld(dt);

    if (this.state === "INTRO") {
      this.setPart(this.anim[1], 0, 0, 1 + 0.05 * Math.sin(this.t * 5));
      if (this.demoMode > 0 && this.stateT >= 2.0) this.startGame();
    } else if (this.state === "PLAYING") {
      const target = this.targetClass();
      this.holdT = this.seen === target ? this.holdT + dt : 0;
      if (this.holdT >= this.holdSec) this.pass();
    } else if (this.state === "PASSING") {
      if (this.stateT >= this.passSec) this.settle();
    } else if (this.state === "FINALE") {
      this.updateFinale();
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
      const img = this.introButton ? this.introButton.getComponent("Image") as APJS.Image : undefined;
      if (img && APJS.TouchUtils.isScreenPointOnImage(touch.position, img)) this.startGame();
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

  private resetGame(): void {
    this.order = this.pickOrder();
    this.step = 0;
    this.holdT = 0;
    this.showQueue();
    this.exit.obj.setEnabledInHierarchy(false);
    if (this.exitFront) this.exitFront.obj.setEnabledInHierarchy(false);
    this.exitT = -1;
    this.popT = -1;
    this.hitT = -1;
    this.cycT = 1.2;
    this.bumpPrev = 1.2;
    this.mirrorFace.setEnabledInHierarchy(true);
    if (this.resultOverlay) this.resultOverlay.setEnabledInHierarchy(false);
    if (this.winEffect) this.winEffect.setEnabledInHierarchy(false);
    this.resetAnimParts();
    if (this.introOverlay) this.introOverlay.setEnabledInHierarchy(true);
    this.setState("INTRO");
  }

  private startGame(): void {
    if (this.introOverlay) this.introOverlay.setEnabledInHierarchy(false);
    console.log("MamamyFaceCopy order " + this.order.map((i) => i + ":" + this.NAMES[this.cardClass[i]]).join(","));
    this.holdT = 0;
    this.cycT = 1.2;
    this.setState("PLAYING");
  }

  private setState(s: string): void {
    this.state = s;
    this.stateT = 0;
  }

  // roundCards random cards (never two of the same class in a row, while possible), then the shield.
  private pickOrder(): number[] {
    const shield = this.cardTextures.length - 1;
    const pool: number[] = [];
    for (let i = 0; i < shield; i++) pool.push(i);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp;
    }
    const out: number[] = [];
    while (out.length < Math.min(this.roundCards, shield) && pool.length > 0) {
      const last = out.length > 0 ? this.cardClass[out[out.length - 1]] : -1;
      let k = pool.findIndex((c) => this.cardClass[c] !== last);
      if (k < 0) k = 0;
      out.push(pool.splice(k, 1)[0]);
    }
    out.push(shield);
    return out;
  }

  private targetClass(): number {
    return this.cardClass[this.order[this.step]];
  }

  private isShieldStep(): boolean {
    return this.order[this.step] === this.cardTextures.length - 1;
  }

  private setCardTex(c: CardView, tex: APJS.Texture): void {
    c.img.texture = tex;
    c.st.sizeDelta = new APJS.Vector2f(tex.getWidth() * this.cardPx, tex.getHeight() * this.cardPx);
  }

  // ---------- Card queue ----------
  // Slot k shows card order[step + k]; slots past the last card are hidden.
  private showQueue(): void {
    for (let k = 0; k < this.slots.length; k++) {
      const c = this.slots[k];
      const i = this.step + k;
      c.sec = 0;
      if (i >= this.order.length) { c.obj.setEnabledInHierarchy(false); continue; }
      this.setCardTex(c, this.cardTextures[this.order[i]]);
      c.obj.setEnabledInHierarchy(true);
      this.place(c, this.SLOTS[k]);
    }
  }

  // We run through the front card (it swells past us and off the screen) while every other card
  // steps one slot forward. The baby stays where it is.
  private pass(): void {
    console.log("MamamyFaceCopy passed " + this.NAMES[this.targetClass()] + " at t=" + this.t.toFixed(2));
    this.holdT = 0;
    if (this.isShieldStep()) { this.startFinale(); return; }
    const front = this.slots[0];
    this.setCardTex(this.exit, front.img.texture);
    if (this.exitFront) this.setCardTex(this.exitFront, front.img.texture);
    this.exitFrom = this.frontPose();
    this.exitT = 0;
    this.exit.obj.setEnabledInHierarchy(true);
    this.place(this.exit, this.exitFrom);
    front.obj.setEnabledInHierarchy(false);
    for (let k = 1; k < this.slots.length; k++) {
      // Same time window as the front card sliding up to the baby.
      if (this.step + k < this.order.length) this.move(this.slots[k], this.SLOTS[k], this.SLOTS[k - 1], this.passSec * 0.5);
    }
    this.step++;
    this.setState("PASSING");
  }

  private settle(): void {
    this.showQueue();
    this.cycT = 1.2;
    this.holdT = 0;
    this.setState("PLAYING");
  }

  private move(c: CardView, from: Pose, to: Pose, sec: number): void {
    c.from = from;
    c.to = to;
    c.sec = sec;
    c.t = 0;
    this.place(c, from);
  }

  private updateCard(c: CardView, dt: number): void {
    if (!c || c.sec <= 0) return;
    c.t += dt;
    const e = easeInOut(seg(c.t, 0, c.sec));
    this.place(c, new Pose(c.from.x + (c.to.x - c.from.x) * e, c.from.y + (c.to.y - c.from.y) * e,
      c.from.s + (c.to.s - c.from.s) * e, c.from.a + (c.to.a - c.from.a) * e));
    if (c.t >= c.sec) {
      c.sec = 0;
      if (c.to.a <= 0) c.obj.setEnabledInHierarchy(false);
    }
  }

  // The passed card slides down the road to the baby and frames it (drawn behind the baby, so the
  // baby is inside the card), then the baby is through: the card jumps in front of the baby and
  // keeps sliding down the road off the bottom-left of the screen.
  private updateExit(dt: number): void {
    if (this.exitT < 0) return;
    this.exitT += dt;
    const k = seg(this.exitT, 0, this.passSec), k1 = 0.5;
    const cross = new Pose(this.faceBaseX, this.faceBaseY, this.CROSS_SCALE, 1);
    const lerp = (a: Pose, b: Pose, e: number, al: number) =>
      new Pose(a.x + (b.x - a.x) * e, a.y + (b.y - a.y) * e, a.s + (b.s - a.s) * e, al);
    if (k < k1) {
      const e = Math.pow(k / k1, 1.5);   // speeds up toward the baby
      this.place(this.exit, lerp(this.exitFrom, cross, e, 1));
      return;
    }
    const back = this.exitFront ? this.exitFront : this.exit;
    if (back !== this.exit && this.exit.obj.enabled) {
      this.exit.obj.setEnabledInHierarchy(false);
      back.obj.setEnabledInHierarchy(true);
      this.popT = 0;                     // the baby bursts through
    }
    const u = (k - k1) / (1 - k1);
    this.place(back, lerp(cross, this.EXIT, Math.pow(u, 0.9), 1 - seg(u, 0.85, 1)));
    if (k >= 1) {
      back.obj.setEnabledInHierarchy(false);
      this.exit.obj.setEnabledInHierarchy(false);
      this.exitT = -1;
    }
  }

  private place(c: CardView, p: Pose): void {
    c.st.anchoredPosition = new APJS.Vector2f(p.x, p.y + this.bobY);
    c.st.scale = new APJS.Vector2f(Math.max(0.001, p.s), Math.max(0.001, p.s));
    c.img.opacity = p.a;
  }

  // ---------- Face reading ----------
  private readFace(dt: number): void {
    const r = APJS.AlgorithmManager.getResult();
    this.hasFace = r.getFaceCount() > 0;
    if (this.hasFace) {
      const f = r.getFaceBaseInfo(0);
      const P = f.pointsArray;
      if (P && P.length >= 212) {
        const d = (a: number, b: number) => Math.hypot(P[2 * a] - P[2 * b], P[2 * a + 1] - P[2 * b + 1]);
        const k = clamp(dt * 15, 0, 1);  // light smoothing, ~70 ms
        this.eyeL += (d(72, 73) / Math.max(1e-6, d(52, 55)) - this.eyeL) * k;
        this.eyeR += (d(75, 76) / Math.max(1e-6, d(58, 61)) - this.eyeR) * k;
        this.open += (d(98, 102) / Math.max(1e-6, d(84, 90)) - this.open) * k;
        // y grows upward: corners lower than the lip centre = frown = positive
        const cornerY = (P[2 * 84 + 1] + P[2 * 90 + 1]) / 2, centreY = (P[2 * 87 + 1] + P[2 * 93 + 1]) / 2;
        this.curve += ((centreY - cornerY) / Math.max(1e-6, d(84, 90)) - this.curve) * k;
        const eyes = Math.max(this.eyeL, this.eyeR);
        if (eyes > this.eyeBase) this.eyeBase += (eyes - this.eyeBase) * clamp(dt * 4, 0, 1);
        else this.eyeBase += (eyes - this.eyeBase) * clamp(dt * 0.05, 0, 1);
        // Learn the resting mouth while calm (mouth shut, no smile, eyes open). It follows a
        // relaxed mouth quickly but a dropping one only very slowly, so holding a sad face
        // never becomes the new "normal".
        if (this.open < this.mouthOpen && this.happy < 30 && eyes > this.eyeBase * 0.8) {
          const rate = this.curve < this.curveBase ? 1.0 : 0.03;
          this.curveBase += (this.curve - this.curveBase) * clamp(dt * rate, 0, 1);
        }
      }
      this.blinkOne = f.hasAction(APJS.FaceAction.EyeBlinkLeft) !== f.hasAction(APJS.FaceAction.EyeBlinkRight);
      this.pout = f.hasAction(APJS.FaceAction.MouthPout);
    }
    if (r.getFaceAttributeCount() > 0) {
      const a = r.getFaceAttributeInfo(0);
      this.happy = a.happyScore;
      const p = a.expressionProbabilities;   // [Angry, Disgust, Fear, Happy, Sad, Surprise, Neutral]
      this.sad = p && p.length > 4 ? p[4] : 0;
    }
    this.tongueBs = -1;
    try {
      const nav = (r as any).getNaviAvatarDriveInfo ? (r as any).getNaviAvatarDriveInfo() : undefined;
      const w = nav ? nav.blendshapeWeights : undefined;
      if (w && w.length > 51) this.tongueBs = Number(w[51]);
    } catch (e) {
      this.tongueBs = -1;
    }
  }

  // One of the six expressions, from the smoothed readings.
  private classify(): number {
    const shut = this.eyeBase * this.eyeClosedRatio;
    const lo = Math.min(this.eyeL, this.eyeR), hi = Math.max(this.eyeL, this.eyeR);
    const mouthOpen = this.open > this.mouthOpen;
    if (this.tongueBs > 0.4) return 0;
    // Wink: one eye clearly more shut than the other (the open one may squint while smiling).
    const wink = (lo < hi * this.winkRatio && lo < shut * 1.2) || (this.blinkOne && lo < hi * 0.85);
    if (wink && !(mouthOpen && hi < shut)) return 2;
    // Both eyes shut: happy = laughing / eyes-shut smile; open mouth = crying; else just a blink.
    if (hi < shut) return this.happy >= this.smileHappy ? 6 : mouthOpen ? 1 : this.seen;
    if (mouthOpen) return this.happy >= this.laughHappy ? 6 : this.happy >= this.smileHappy ? 5 : 0;
    if (this.happy >= this.smileHappy) return 5;
    if (this.curve - this.curveBase >= this.frownDrop || this.sad >= this.sadProb || this.pout) return 3;
    return 4;
  }

  private updateMirror(dt: number): void {
    if (this.state === "PLAYING" || this.state === "INTRO") {
      let c = this.hasFace ? this.classify() : this.seen;
      if (this.demoMode > 0 && this.state === "PLAYING") {
        const target = this.targetClass();
        const right = this.demoMode === 2 ? this.stateT > 1.5 : this.stateT > 0.8;
        c = right ? target : (this.demoMode === 2 ? (target + 1) % this.CLASSES : this.seen);
      }
      if (c !== this.candidate) { this.candidate = c; this.candidateT = 0; }
      else this.candidateT += dt;
      if (this.candidate !== this.seen && this.candidateT >= this.mirrorDelay) this.seen = this.candidate;
    }
    if (this.state === "FINALE" || this.state === "RESULT") { this.updateDebug(); return; }
    // Matching the front card shows that card's own face, so a pass always looks like the card.
    const card = this.state === "PLAYING" ? this.order[this.step] : -1;
    const own = card >= 0 && this.seen === this.cardClass[card] && card < this.cardFaceTextures.length;
    this.faceImg.texture = own ? this.cardFaceTextures[card] : this.faceTextures[this.seen];
    // The baby stands still: only a gentle breath, and a happy pop when a card is passed.
    let sc = 1 + 0.02 * Math.sin(this.t * 2.4);
    if (this.popT >= 0) {
      this.popT += dt;
      const k = seg(this.popT, 0, 0.4);
      sc *= 1 + 0.15 * Math.sin(k * Math.PI);
      if (k >= 1) this.popT = -1;
    }
    let sx = 1, sy = 1;
    if (this.hitT >= 0) {              // knocked by the card: a quick squash, it stays in place
      this.hitT += dt;
      const k = seg(this.hitT, 0, 0.3), j = Math.sin(k * Math.PI) * (1 - k);
      sx = 1 + 0.12 * j; sy = 1 - 0.1 * j;
      if (k >= 1) this.hitT = -1;
    }
    this.faceSt.anchoredPosition = new APJS.Vector2f(this.faceBaseX, this.faceBaseY);
    this.faceSt.scale = new APJS.Vector2f(sc * sx, sc * sy);
    this.updateDebug();
  }

  // ---------- Running toward the cards ----------
  // The road and the cards jog together (we are running). The front card: swells a little while
  // the right face is held; otherwise we keep running into it: it lunges at us, shakes, rebounds.
  private updateWorld(dt: number): void {
    const running = this.state === "INTRO" || this.state === "PLAYING" || this.state === "PASSING";
    if (this.state === "FINALE" || this.state === "RESULT") { this.bobY = 0; return; }
    this.bobY = running ? 4 * Math.abs(Math.sin(this.t * 5.5)) : 0;
    for (let i = 0; i < this.roadSt.length; i++) {
      this.roadSt[i].anchoredPosition = new APJS.Vector2f(this.roadBase[i].x, this.roadBase[i].y + this.bobY);
    }
    for (let k = 0; k < this.slots.length; k++) {
      const c = this.slots[k];
      if (c.sec > 0) { this.updateCard(c, dt); continue; }
      // While passing, a card that has already stepped forward stays there until the queue
      // re-seats (placing it at its slot now would snap it back).
      if (this.state === "PASSING") continue;
      if (this.step + k >= this.order.length) continue;
      if (k === 0) { this.place(c, this.frontPose(dt)); continue; }
      // Cards behind move with the front card: the same share of the way to the next slot.
      const a = this.SLOTS[k], b = this.SLOTS[k - 1], f = this.bumpF;
      this.place(c, new Pose(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f, a.s + (b.s - a.s) * f, 1));
    }
    this.updateExit(dt);
  }

  // Front card pose: hold swell, or the bump cycle while the face is wrong.
  private frontPose(dt: number = 0): Pose {
    const p = this.SLOTS[0];
    if (this.state !== "PLAYING") { this.bumpF = 0; return p; }
    const hold = clamp(this.holdT / this.holdSec, 0, 1);
    const bx = this.faceBaseX, by = this.faceBaseY, bs = this.CROSS_SCALE;
    if (hold > 0) {
      // Right face: stop bumping. A bump in progress backs off smoothly (never snaps back).
      this.cycT = this.BUMP_CYCLE * 0.8;
      this.bumpF = Math.max(0, this.bumpF - dt * 2.5);
      const f = this.bumpF, sw = 1 + 0.08 * hold;
      return new Pose(p.x + (bx - p.x) * f, p.y + (by - p.y) * f, (p.s + (bs - p.s) * f) * sw, 1);
    }
    // Slide down the road toward the baby, bump into it, back off to the slot.
    this.cycT += dt;
    const c = this.cycT % this.BUMP_CYCLE;
    if (dt > 0 && this.bumpPrev < 0.35 && c >= 0.35 && c - this.bumpPrev < 0.2) this.hitT = 0;   // the hit
    if (dt > 0) this.bumpPrev = c;
    let f = 0, knock = 1;
    if (c < 0.35) f = this.BUMP_REACH * Math.pow(c / 0.35, 2);
    else if (c < 0.45) { f = this.BUMP_REACH; knock = 1 - 0.04 * Math.sin(Math.PI * (c - 0.35) / 0.1); }
    else if (c < 0.9) f = this.BUMP_REACH * Math.pow(1 - seg(c, 0.45, 0.9), 2);
    if (f < this.bumpF - dt * 2.5) f = this.bumpF - dt * 2.5;   // never snap back mid-bump
    this.bumpF = f;
    return new Pose(p.x + (bx - p.x) * f, p.y + (by - p.y) * f, (p.s + (bs - p.s) * f) * knock, 1);
  }

  private updateDebug(): void {
    if (this.debugText) this.debugText.setEnabledInHierarchy(this.showDebug);
    if (!this.showDebug && !this.logReadings) return;
    const line = (this.hasFace ? "see " + this.NAMES[this.seen] : "no face") +
      "  eyes " + this.eyeL.toFixed(2) + "/" + this.eyeR.toFixed(2) + " base " + this.eyeBase.toFixed(2) +
      "  mouth " + this.open.toFixed(2) + "  happy " + this.happy.toFixed(0) +
      "  sad " + this.sad.toFixed(2) + "  frown " + (this.curve - this.curveBase).toFixed(3) +
      (this.pout ? "  POUT" : "") + (this.tongueBs >= 0 ? "  tongue " + this.tongueBs.toFixed(2) : "");
    const txt = this.debugText && this.showDebug ? this.debugText.getComponent("Text") as APJS.Text : undefined;
    if (txt) txt.text = line;
    if (this.logReadings && this.t >= this.logT) { this.logT = this.t + 0.25; console.log("FaceDbg t=" + this.t.toFixed(2) + " " + line); }
  }

  // ---------- Finale: the shield card turns into MEGA MAMAMY 19 ----------
  // 0-0.6 the shield card swells (the baby laughs with it); 0.6-0.8 it flips to the plain 19 shield;
  // 0.8-1.5 it flies (spinning) to the shield's spot in the logo, growing to the logo's shield size.
  private startFinale(): void {
    const front = this.slots[0];
    this.finFrom = this.frontPose();
    front.obj.setEnabledInHierarchy(false);
    this.setCardTex(this.exitFront ? this.exitFront : this.exit, front.img.texture);
    this.finCard().obj.setEnabledInHierarchy(true);
    this.place(this.finCard(), this.finFrom);
    this.popT = 0;
    this.setState("FINALE");
  }

  // Drawn over the baby.
  private finCard(): CardView {
    return this.exitFront ? this.exitFront : this.exit;
  }

  private logoShieldPose(): Pose {
    const lp = this.anim[0];
    return new Pose(lp.baseX + this.logoShieldX * this.logoW, lp.baseY + this.logoShieldY * this.logoH, 1, 1);
  }

  private updateFinale(): void {
    const t = this.stateT, c = this.finCard(), p = this.finFrom;
    if (t < 0.6) {
      const sw = 1 + 0.12 * Math.sin(seg(t, 0, 0.6) * Math.PI);
      this.place(c, new Pose(p.x, p.y, p.s * sw, 1));
      c.st.rotation = 0;
      return;
    }
    if (t < 0.8) {   // flip: squeeze to an edge, swap to the plain shield, open up again
      const k = seg(t, 0.6, 0.8), w = Math.abs(Math.cos(k * Math.PI));
      if (k >= 0.5 && this.shieldPlainTex && c.img.texture !== this.shieldPlainTex) {
        const h = c.st.sizeDelta.y;
        c.img.texture = this.shieldPlainTex;
        c.st.sizeDelta = new APJS.Vector2f(h * this.shieldPlainTex.getWidth() / Math.max(this.shieldPlainTex.getHeight(), 1), h);
      }
      c.st.anchoredPosition = new APJS.Vector2f(p.x, p.y);
      c.st.scale = new APJS.Vector2f(Math.max(0.001, p.s * w), p.s);
      return;
    }
    const to = this.logoShieldPose();
    const toS = this.logoShieldH * this.logoH / Math.max(c.st.sizeDelta.y, 1);
    const k = easeInOut(seg(t, 0.8, 1.5));
    const s = p.s + (toS - p.s) * k;
    c.st.anchoredPosition = new APJS.Vector2f(p.x + (to.x - p.x) * k, p.y + (to.y - p.y) * k + Math.sin(k * Math.PI) * 140);
    c.st.scale = new APJS.Vector2f(Math.max(0.001, s), Math.max(0.001, s));
    c.st.rotation = 360 * k;
    c.img.opacity = 1;
    if (t >= 1.5) this.showResult();
  }

  // ---------- Result ----------
  private showResult(): void {
    this.setState("RESULT");
    this.finCard().st.rotation = 0;
    this.mirrorFace.setEnabledInHierarchy(false);   // the logo takes its place on the road
    for (const c of this.slots) c.obj.setEnabledInHierarchy(false);
    if (this.resultOverlay) this.resultOverlay.setEnabledInHierarchy(true);
    if (this.winEffect) this.winEffect.setEnabledInHierarchy(true);
    this.updateResultAnim(0);
  }

  // Confetti slides down and the logo drops in.
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
    const logo = this.anim[0];
    // The logo grows out of the shield: the shield's spot in the logo stays put while it scales.
    const ax = this.logoShieldX * this.logoW, ay = this.logoShieldY * this.logoH;
    let sl = Math.max(0.001, easeOutBack(seg(t, 0, this.burstSec)));
    if (t > this.burstSec + 0.3) sl = 1 + 0.03 * Math.sin((t - this.burstSec - 0.3) * 3);
    this.setPart(logo, ax - ax * sl, ay - ay * sl, sl);
    const c = this.finCard();
    const toS = this.logoShieldH * this.logoH / Math.max(c.st.sizeDelta.y, 1);
    const pop = toS * (1 + 0.15 * Math.sin(seg(t, 0, this.burstSec * 0.8) * Math.PI));
    c.st.scale = new APJS.Vector2f(pop, pop);
    c.obj.setEnabledInHierarchy(t < this.burstSec * 0.8);
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
