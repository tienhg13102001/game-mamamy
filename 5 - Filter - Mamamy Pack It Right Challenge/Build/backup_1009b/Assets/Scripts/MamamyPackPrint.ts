/**
 * MamamyPackPrint — "Print the Mamamy packs": tap the print rollers in the right order, product
 * after product. A game is five rounds (client 2026-10-09), shown as five stars at the top: KUT,
 * KK, two of NRB / NGX / BTG / KUC at random, and the MEGA MAMAMY 19 logo last. Finishing an item
 * lights its star and moves on; finishing the logo wins. A wrong pack loses as before (sad face +
 * logo + PLAY AGAIN), but PLAY AGAIN replays only that round (same right order, stars kept).
 *
 * An empty pack outline sits mid-screen with three rollers around it: left (white; purple for the
 * MEGA logo), bottom and top. The colour order never changes (white → pattern → pink; MEGA purple →
 * pink → gold, printOrders) and the left roller always holds the first colour, but the other two
 * rollers swap places (top ⇄ bottom, image flipped) at random every round. Only the first round shows the finished item top-left as
 * the target, and there the next right roller wiggles to show the player what to tap; later
 * rounds have neither, so the player finds the order by trying.
 * Tapping a roller rolls it across the pack and its layer wipes in along the roll. Each roller is
 * used once, and the player always gets all three rolls. A colour used at its right step prints
 * the next layer (white base → printed → finished); out of turn it floods the pack in its colour
 * (floodPatternTex / floodPinkTex, and floodFirstTex for the left roller of the last products).
 * After the logo the MEGA MAMAMY 19 banner bursts out of the painted logo's 19 shield (the shield's
 * spot stays put while the banner grows around it) with confetti. No timer.
 *
 * Every product's images share the same crop boxes (Tools/make_sbd5.py), so changing product only
 * swaps textures; the roller bodies differ per product and come from bodyOffsets.
 *
 * Roller (view) index = position: 0 left, 1 bottom, 2 top; colourAt maps a position to its colour
 * this round (colour 0 white, 1 pattern, 2 pink for the packs; the texture lists use colours).
 * The wipe is an Image in Filled draw mode driven by the _filledType/_startPoint/_filledRange
 * material keys, with its edge following the roller body.
 *
 * Flow: INTRO → press TikTok Record (or tap RECORD TO PLAY) → PLAYING ⇄ ROLLING (×3)
 *       → DONE_POP → (NEXT_IN → PLAYING … for each round) → RESULT (win) → tap (or Record again)
 *       | LOSE_WAIT → RESULT (lose) → tap PLAY AGAIN → NEXT_IN (same round again);
 *       Record again always starts a fresh game.
 * Positions are screen-space (720x1280, origin at the centre, y up) measured on mockup 1.
 */
class RollerView {
  obj: APJS.SceneObject;
  st: APJS.ScreenTransform;
  img: APJS.Image;
  baseX: number;
  baseY: number;
  used: boolean = false;
  constructor(obj: APJS.SceneObject) {
    this.obj = obj;
    this.st = obj.getComponent("ScreenTransform") as APJS.ScreenTransform;
    this.img = obj.getComponent("Image") as APJS.Image;
    this.baseX = this.st.anchoredPosition.x;
    this.baseY = this.st.anchoredPosition.y;
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

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
  return arr;
}

// The editor may hand SceneObject array entries over as the object's ScreenTransform: use its owner.
function asObject(ref: any): APJS.SceneObject | undefined {
  if (!ref) return undefined;
  if (ref.getComponent) return ref as APJS.SceneObject;
  return ref.getSceneObject ? ref.getSceneObject() as APJS.SceneObject : undefined;
}

function easeInOut(k: number): number {
  return k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
}

@component()
export class MamamyPackPrint extends APJS.BasicScriptComponent {
  @header("Theme & Assets")
  @header("Products (one entry per product, same order in every list)")
  @serializeProperty @tooltip('White roller (left)') whiteRollerTex: APJS.Texture[] = [];
  @serializeProperty @tooltip('Pattern roller (bottom)') patternRollerTex: APJS.Texture[] = [];
  @serializeProperty @tooltip('Pink roller (top)') pinkRollerTex: APJS.Texture[] = [];
  @serializeProperty @tooltip('Empty pack outline') frameTex: APJS.Texture[] = [];
  @serializeProperty @tooltip('Pack with the white base') whiteTex: APJS.Texture[] = [];
  @serializeProperty @tooltip('Pack with the pattern printed') printTex: APJS.Texture[] = [];
  @serializeProperty @tooltip('Finished pack with the logo') fullTex: APJS.Texture[] = [];
  @serializeProperty @tooltip('Pack flooded by the pattern roller') floodPatternTex: APJS.Texture[] = [];
  @serializeProperty @tooltip('Pack flooded pink') floodPinkTex: APJS.Texture[] = [];
  @serializeProperty @tooltip('Pack flooded by the left roller, for the LAST products only (others: the left roller always lays a fresh base)') floodFirstTex: APJS.Texture[] = [];
  @serializeProperty @tooltip('Finished-pack thumbnail (target)') thumbTex: APJS.Texture[] = [];
  @serializeProperty @tooltip('Roller body centre vs roller image centre (px), 3 per product: white, pattern, pink') bodyOffsets: number[] = [];
  @serializeProperty @tooltip('Right colour order, 3 per product (0 left colour, 1 bottom colour, 2 top colour as designed); missing = 0 1 2') printOrders: number[] = [];
  @serializeProperty @tooltip('Products always played first, in list order') @spinBox(0, 7, 1) fixedFirst: number = 2;
  @serializeProperty @tooltip('Products drawn at random from the middle of the list') @spinBox(0, 7, 1) randomMiddle: number = 2;
  @serializeProperty @tooltip('Products always played last, in list order') @spinBox(0, 7, 1) fixedLast: number = 1;
  @serializeProperty @tooltip('Round star, not won yet') starOffTex: APJS.Texture;
  @serializeProperty @tooltip('Round star, won') starOnTex: APJS.Texture;

  @header("Gameplay Tuning")
  @serializeProperty @tooltip('Roll across the pack (s)') @slider(0.3, 2, 0.05) rollSec: number = 0.8;
  @serializeProperty @tooltip('Rounds that show the target and wiggle the next right roller') @spinBox(0, 5, 1) hintRounds: number = 1;
  @serializeProperty @tooltip('Wrong pack stays this long before the result (s)') @slider(0.3, 3, 0.1) loseDelay: number = 1.0;
  @serializeProperty @tooltip('Next product slides in (s)') @slider(0.2, 1.5, 0.05) nextInSec: number = 0.5;
  @serializeProperty @tooltip('Shield centre inside the win logo, x as a share of the logo width from its centre') logoShieldX: number = 0.374;
  @serializeProperty @tooltip('Shield centre inside the win logo, y (up) as a share of the logo height from its centre') logoShieldY: number = 0.122;
  @serializeProperty @tooltip('Painted logo shield centre on screen (px)') paintedShieldX: number = 208;
  @serializeProperty @tooltip('Painted logo shield centre on screen (px)') paintedShieldY: number = -80.7;
  @serializeProperty @tooltip('Win logo scale at which its shield matches the painted shield') paintedShieldScale: number = 0.67;
  @serializeProperty @tooltip('Demo video autoplay: 0 off, 1 right order, 2 a wrong first try on the third round') @spinBox(0, 2, 1) demoMode: number = 0;

  @header("Advanced — Scene Wiring")
  @serializeProperty @tooltip('Rollers in print order: white (left), pattern (bottom), pink (top)') rollers: APJS.SceneObject[] = [];
  @serializeProperty @tooltip('Empty pack outline') packFrame: APJS.SceneObject;
  @serializeProperty @tooltip('Pack printed so far (Normal draw mode)') packDone: APJS.SceneObject;
  @serializeProperty @tooltip('Layer being printed (Filled draw mode, same rect as packDone)') packWipe: APJS.SceneObject;
  @serializeProperty @tooltip('Finished-pack thumbnail (target)') thumb: APJS.SceneObject;
  @serializeProperty introOverlay: APJS.SceneObject;
  @serializeProperty introButton: APJS.SceneObject;
  @serializeProperty resultOverlay: APJS.SceneObject;
  @serializeProperty winEffect: APJS.SceneObject;
  @serializeProperty resultLogo: APJS.SceneObject;
  @serializeProperty @tooltip('Soft white glow drawn under the result logo; follows it') logoGlow: APJS.SceneObject;
  @serializeProperty @tooltip('Sad face shown above the logo on a loss') loseIcon: APJS.SceneObject;
  @serializeProperty retryButton: APJS.SceneObject;
  @serializeProperty @tooltip('Round stars, left to right') stars: APJS.SceneObject[] = [];

  private readonly NAMES: string[] = ["WHITE", "PATTERN", "PINK"];
  // Which way each roller rolls: +1/-1 along x (axis 0) or y (axis 1).
  private readonly AXIS: number[] = [0, 1, 1];
  private readonly DIR: number[] = [1, 1, -1];
  private readonly retryDelay: number = 1.3;
  private readonly winPopSec: number = 0.5;
  private readonly fadeSec: number = 0.25;

  private inited: boolean = false;
  private startOnInit: boolean = false;
  private state: string = "INTRO";
  private stateT: number = 0;
  private t: number = 0;
  // Pack on screen: -1 empty outline, 0 first layer, 1 second, 2 finished,
  // 3 flooded by the bottom roller, 4 by the top roller, 5 by the left roller.
  private layer: number = -1;
  private rollTo: number = -1;        // layer the rolling roller prints
  private rolling: number = -1;       // roller rolling now
  private shakeT: number = -1;        // pack shake after a flood / on losing
  private won: boolean = false;
  private order: number[] = [];       // product indices for this round
  private step: number = 0;           // position in order
  private views: RollerView[] = [];
  private frameImg!: APJS.Image;
  private thumbImg: APJS.Image | undefined;
  private doneImg!: APJS.Image;
  private wipeImg!: APJS.Image;
  private packSt!: APJS.ScreenTransform;
  private packX: number = 0;
  private packY: number = 0;
  private packW: number = 1;
  private packH: number = 1;
  private anim: AnimPart[] = [];      // logo, retry, intro button, sad face
  private colourAt: number[] = [0, 1, 2];   // colour of the roller at each position this round
  private rolls: number = 0;          // rollers used on this pack
  private tries: number = 0;          // attempts at this round
  private starImgs: APJS.Image[] = [];
  private starSts: APJS.ScreenTransform[] = [];
  private starPopT: number = -1;
  private starPop: number = -1;       // star popping now
  private confetti: ConfettiLayer[] = [];
  private fadeImgs: APJS.Image[] = [];
  private demoWait: number = 0.8;

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
    if (this.rollers.length < 3 || !this.packFrame || !this.packDone || !this.packWipe ||
        this.fullTex.length === 0) return false;
    for (const obj of this.rollers) this.views.push(new RollerView(obj));
    this.frameImg = this.packFrame.getComponent("Image") as APJS.Image;
    if (this.thumb) this.thumbImg = this.thumb.getComponent("Image") as APJS.Image;
    this.doneImg = this.packDone.getComponent("Image") as APJS.Image;
    this.wipeImg = this.packWipe.getComponent("Image") as APJS.Image;
    this.packSt = this.packDone.getComponent("ScreenTransform") as APJS.ScreenTransform;
    this.packX = this.packSt.anchoredPosition.x;
    this.packY = this.packSt.anchoredPosition.y;
    this.packW = this.packSt.sizeDelta.x;
    this.packH = this.packSt.sizeDelta.y;
    for (const ref of this.stars) {
      const obj = asObject(ref);
      if (!obj) continue;
      this.starImgs.push(obj.getComponent("Image") as APJS.Image);
      this.starSts.push(obj.getComponent("ScreenTransform") as APJS.ScreenTransform);
    }
    for (const obj of [this.resultLogo, this.retryButton, this.introButton, this.loseIcon]) {
      const part = new AnimPart();
      if (obj) {
        part.st = obj.getComponent("ScreenTransform") as APJS.ScreenTransform;
        part.baseX = part.st.anchoredPosition.x;
        part.baseY = part.st.anchoredPosition.y;
      }
      this.anim.push(part);
    }
    // The pack and target fade out when the logo comes in.
    for (const obj of [this.packDone, this.packFrame, this.thumb]) {
      const img = obj ? obj.getComponent("Image") as APJS.Image : undefined;
      if (img) this.fadeImgs.push(img);
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
    this.updateShake(dt);
    this.updateStars(dt);

    if (this.state === "INTRO") {
      this.setPart(this.anim[2], 0, 0, 1 + 0.05 * Math.sin(this.t * 5));
      this.idleRollers();
      if (this.demoMode > 0 && this.stateT >= 3.0) this.startGame();
    } else if (this.state === "PLAYING") {
      this.idleRollers();
      if (this.demoMode > 0 && this.stateT >= this.demoWait) this.pick(this.demoPick());
    } else if (this.state === "ROLLING") {
      this.updateRoll();
    } else if (this.state === "DONE_POP") {
      const k = seg(this.stateT, 0, this.winPopSec);
      const s = 1 + 0.12 * Math.sin(k * Math.PI);
      this.packSt.scale = new APJS.Vector2f(s, s);
      if (k >= 1) {
        if (this.step + 1 >= this.order.length) this.showResult(true);
        else { this.step++; this.tries = 0; this.loadProduct(); this.enterNextProduct(); this.setState("NEXT_IN"); }
      }
    } else if (this.state === "NEXT_IN") {
      this.updateNextIn();
    } else if (this.state === "LOSE_WAIT") {
      if (this.stateT >= this.loseDelay) this.showResult(false);
    } else if (this.state === "RESULT") {
      this.updateResultAnim(this.stateT);
      if (this.demoMode > 0 && !this.won && this.stateT >= 3.0) this.retryRound();   // demo taps PLAY AGAIN
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
    } else if (this.state === "PLAYING") {
      for (let i = 0; i < this.views.length; i++) {
        const v = this.views[i];
        if (!v.used && APJS.TouchUtils.isScreenPointOnImage(touch.position, v.img)) { this.pick(i); return; }
      }
    } else if (this.state === "RESULT" && this.stateT > this.retryDelay) {
      if (this.won) { this.resetGame(); this.startGame(); }
      else this.retryRound();
    }
  }

  // Pressing Record starts a fresh round.
  private onRecordStart(): void {
    if (!this.inited) { this.startOnInit = true; return; }
    this.resetGame();
    this.startGame();
  }

  private resetGame(): void {
    const all = this.fullTex.map((_t, i) => i);
    const first = Math.min(this.fixedFirst, all.length);
    const last = Math.min(this.fixedLast, all.length - first);
    const middle = shuffle(all.slice(first, all.length - last)).slice(0, this.randomMiddle);
    this.order = all.slice(0, first).concat(middle, all.slice(all.length - last));
    this.step = 0;
    this.tries = 0;
    console.log("MamamyPackPrint order " + this.order.join(","));
    this.loadProduct();
    this.layer = -1;
    this.rolling = -1;
    this.shakeT = -1;
    this.won = false;
    for (const v of this.views) {
      v.used = false;
      v.obj.setEnabledInHierarchy(true);
      v.st.anchoredPosition = new APJS.Vector2f(v.baseX, v.baseY);
      v.st.scale = new APJS.Vector2f(1, 1);
      v.img.opacity = 1;
    }
    this.packFrame.setEnabledInHierarchy(true);
    this.packDone.setEnabledInHierarchy(false);
    this.packWipe.setEnabledInHierarchy(false);
    this.packSt.anchoredPosition = new APJS.Vector2f(this.packX, this.packY);
    this.packSt.scale = new APJS.Vector2f(1, 1);
    for (const img of this.fadeImgs) img.opacity = 1;
    if (this.thumb) this.thumb.setEnabledInHierarchy(this.hintRounds > 0);
    this.starPopT = -1;
    for (let i = 0; i < this.starImgs.length; i++) {
      this.starImgs[i].getSceneObject().setEnabledInHierarchy(i < this.order.length);
      if (this.starOffTex) this.starImgs[i].texture = this.starOffTex;
      this.starSts[i].scale = new APJS.Vector2f(1, 1);
    }
    if (this.resultOverlay) this.resultOverlay.setEnabledInHierarchy(false);
    if (this.winEffect) this.winEffect.setEnabledInHierarchy(false);
    this.resetAnimParts();
    if (this.introOverlay) this.introOverlay.setEnabledInHierarchy(true);
    this.setState("INTRO");
  }

  private startGame(): void {
    if (this.introOverlay) this.introOverlay.setEnabledInHierarchy(false);
    this.setState("PLAYING");
  }

  private setState(s: string): void {
    this.state = s;
    this.stateT = 0;
  }

  // Unused rollers breathe a little so they read as tappable. In the hint rounds the next right
  // roller also wiggles in short bursts: "tap me".
  private idleRollers(): void {
    const hint = this.state === "PLAYING" && this.step < this.hintRounds && this.rolls < 3 ? this.seqAt(this.rolls) : -1;
    for (let i = 0; i < this.views.length; i++) {
      const v = this.views[i];
      if (v.used) continue;
      let s = 1 + 0.03 * Math.sin(this.t * 4 + i * 2.1), rot = 0;
      if (i === hint) {
        const burst = Math.pow(Math.max(0, Math.sin(this.stateT * 3.2 - 0.6)), 2);
        rot = 7 * Math.sin(this.stateT * 22) * burst;
        s = 1 + 0.06 * burst;
      }
      v.st.scale = new APJS.Vector2f(s, s);
      v.st.rotation = rot;
    }
  }

  // ---------- Stars ----------
  private lightStar(i: number): void {
    if (i < 0 || i >= this.starImgs.length) return;
    if (this.starOnTex) this.starImgs[i].texture = this.starOnTex;
    this.starPop = i;
    this.starPopT = 0;
  }

  private updateStars(dt: number): void {
    if (this.starPopT < 0) return;
    this.starPopT += dt;
    const k = seg(this.starPopT, 0, 0.45);
    const st = this.starSts[this.starPop];
    if (st) {
      const s = 1 + 0.6 * Math.sin(k * Math.PI);
      st.scale = new APJS.Vector2f(s, s);
      st.rotation = 20 * Math.sin(k * Math.PI * 2) * (1 - k);
    }
    if (k >= 1) this.starPopT = -1;
  }

  // ---------- Products ----------
  private product(): number {
    return this.order.length > 0 ? this.order[this.step] : 0;
  }

  // Swap every texture to the current product; positions stay (shared crop boxes). The left roller
  // is always the first colour (white / purple); the other two colours swap places (top ⇄ bottom)
  // at random every round — the print order by colour never changes (client 2026-10-09).
  private loadProduct(): void {
    const p = this.product();
    this.colourAt = Math.random() < 0.5 ? [0, 1, 2] : [0, 2, 1];
    const rollerTex = [this.whiteRollerTex, this.patternRollerTex, this.pinkRollerTex];
    for (let i = 0; i < this.views.length; i++) {
      const c = this.colourAt[i];
      if (rollerTex[c][p]) this.views[i].img.texture = rollerTex[c][p];
      this.views[i].img.flipY = c !== i;   // a top roller moved to the bottom turns its handle down
    }
    if (this.frameTex[p]) this.frameImg.texture = this.frameTex[p];
    if (this.thumbImg && this.thumbTex[p]) this.thumbImg.texture = this.thumbTex[p];
    if (this.thumb) this.thumb.setEnabledInHierarchy(this.step < this.hintRounds);
    console.log("MamamyPackPrint round " + (this.step + 1) + " product " + p + " rollers L/B/T " +
      this.colourAt.map((c) => this.NAMES[c]).join("/"));
  }

  // Colour to print at step r (right order by colour, 0 left colour, 1 bottom, 2 top as designed).
  private colourAtStep(r: number): number {
    const k = this.product() * 3 + r;
    return k < this.printOrders.length ? this.printOrders[k] : r;
  }

  // Roller (view index) to use at print step r in this round.
  private seqAt(r: number): number {
    const c = this.colourAtStep(r);
    for (let i = 0; i < 3; i++) if (this.colourAt[i] === c) return i;
    return r;
  }

  private rankOf(i: number): number {
    for (let r = 0; r < 3; r++) if (this.seqAt(r) === i) return r;
    return i;
  }

  // floodFirstTex lines up with the end of the product list.
  private floodFirst(): APJS.Texture | undefined {
    const k = this.product() - (this.fullTex.length - this.floodFirstTex.length);
    return k >= 0 ? this.floodFirstTex[k] : undefined;
  }

  // Body offset of the roller now at position i (mirrored when its image is flipped).
  private bodyOffset(i: number): number {
    const c = this.colourAt[i], k = this.product() * 3 + c;
    const off = k < this.bodyOffsets.length ? this.bodyOffsets[k] : 0;
    return c !== i ? -off : off;
  }

  // Next product: fresh outline and rollers grow back in.
  private enterNextProduct(): void {
    this.layer = -1;
    this.rolling = -1;
    this.rolls = 0;
    for (const v of this.views) {
      v.used = false;
      v.st.rotation = 0;
      v.obj.setEnabledInHierarchy(true);
      v.st.anchoredPosition = new APJS.Vector2f(v.baseX, v.baseY);
      v.img.opacity = 1;
    }
    this.packDone.setEnabledInHierarchy(false);
    this.packWipe.setEnabledInHierarchy(false);
    this.packFrame.setEnabledInHierarchy(true);
    this.packSt.scale = new APJS.Vector2f(1, 1);
  }

  private updateNextIn(): void {
    const k = easeOutBack(seg(this.stateT, 0, this.nextInSec));
    const s = Math.max(0.001, k);
    for (const v of this.views) v.st.scale = new APJS.Vector2f(s, s);
    const frameSt = this.packFrame.getComponent("ScreenTransform") as APJS.ScreenTransform;
    frameSt.scale = new APJS.Vector2f(s, s);
    if (this.thumbImg) this.thumbImg.opacity = seg(this.stateT, 0, this.nextInSec);
    const packSt = this.packDone.getComponent("ScreenTransform") as APJS.ScreenTransform;
    packSt.anchoredPosition = new APJS.Vector2f(this.packX, this.packY);
    if (this.stateT >= this.nextInSec) {
      frameSt.scale = new APJS.Vector2f(1, 1);
      this.setState("PLAYING");
    }
  }

  // Demo autoplay: the next roller of the scripted sequence that is still unused.
  private demoPick(): number {
    this.demoWait = 0.4 + Math.random() * 0.6;   // a human-like pause before the next tap
    const right = [this.seqAt(0), this.seqAt(1), this.seqAt(2)];
    const wrongTry = this.demoMode === 2 && this.step === 2 && this.tries === 0;   // shows the lose screen once
    const seq = wrongTry ? [right[0], right[2], right[1]] : right;
    for (const i of seq) if (!this.views[i].used) return i;
    return 0;
  }

  // ---------- Printing ----------
  private pick(i: number): void {
    if (this.state !== "PLAYING" || i < 0 || i >= this.views.length || this.views[i].used) return;
    const v = this.views[i];
    v.used = true;
    v.st.scale = new APJS.Vector2f(1, 1);
    v.st.rotation = 0;
    this.rolls++;
    this.rolling = i;
    this.rollTo = this.printResult(i);
    console.log("MamamyPackPrint pick " + this.NAMES[this.colourAt[i]] + (this.rollTo > 2 ? " FLOOD" : " ok") + " at t=" + this.t.toFixed(2));
    const p = this.product();
    const prints = [this.whiteTex[p], this.printTex[p], this.fullTex[p]];
    const floods = [this.floodPatternTex[p], this.floodPinkTex[p], this.floodFirst()];
    this.wipeImg.texture = this.rollTo > 2 ? floods[this.rollTo - 3] as APJS.Texture : prints[this.rollTo];
    this.wipeImg.setMaterialProperty("_filledType", this.AXIS[i]);
    this.setWipe(i, 0);
    this.packWipe.setEnabledInHierarchy(true);
    this.setState("ROLLING");
  }

  // The first roller lays a fresh base (or floods, when the product has floodFirstTex and the
  // pack is not empty); the second needs that base, the third needs the second layer.
  // Otherwise the roller floods the pack in its colour (3 pattern, 4 pink, 5 left colour).
  private printResult(i: number): number {
    const r = this.rankOf(i), c = this.colourAt[i];
    const flood = c === 1 ? 3 : c === 2 ? 4 : 5;
    if (r === 0) return this.layer === -1 || !this.floodFirst() ? 0 : flood;
    return this.layer === r - 1 ? r : flood;
  }

  // Pop, roll across the pack (the layer wipes in behind the body), then fade out past the edge.
  private updateRoll(): void {
    const i = this.rolling, v = this.views[i];
    const popSec = 0.15;
    const t = this.stateT;
    const axis = this.AXIS[i], dir = this.DIR[i];
    const base = axis === 0 ? v.baseX : v.baseY;
    const body0 = base + this.bodyOffset(i);
    const packLo = axis === 0 ? this.packX - this.packW / 2 : this.packY - this.packH / 2;
    const packHi = axis === 0 ? this.packX + this.packW / 2 : this.packY + this.packH / 2;
    const bodyEnd = dir > 0 ? packHi : packLo;
    const travel = bodyEnd - body0;
    let off: number;
    if (t < popSec) {
      const s = 1 + 0.1 * Math.sin(seg(t, 0, popSec) * Math.PI);
      v.st.scale = new APJS.Vector2f(s, s);
      off = 0;
    } else {
      off = travel * easeInOut(seg(t, popSec, popSec + this.rollSec));
      const past = seg(t, popSec + this.rollSec, popSec + this.rollSec + this.fadeSec);
      off += dir * 40 * past;
      v.img.opacity = 1 - past;
    }
    if (axis === 0) v.st.anchoredPosition = new APJS.Vector2f(base + off, v.baseY);
    else v.st.anchoredPosition = new APJS.Vector2f(v.baseX, base + off);
    const body = body0 + off;
    const k = dir > 0 ? (body - packLo) / (packHi - packLo) : (packHi - body) / (packHi - packLo);
    this.setWipe(i, clamp(k, 0, 1));
    if (t >= popSec + this.rollSec + this.fadeSec) this.finishRoll();
  }

  // Show share k of the new layer on the side the roller came from.
  private setWipe(i: number, k: number): void {
    const axis = this.AXIS[i], dir = this.DIR[i];
    // Horizontal fill runs left → right, vertical fill runs top → bottom.
    let start = 0;
    if (axis === 1 && dir > 0) start = 1 - k;   // rolling upward: bottom part
    this.wipeImg.setMaterialProperty("_startPoint", start);
    this.wipeImg.setMaterialProperty("_filledRange", k);
  }

  private finishRoll(): void {
    const i = this.rolling;
    this.views[i].obj.setEnabledInHierarchy(false);
    this.doneImg.texture = this.wipeImg.texture;
    this.packDone.setEnabledInHierarchy(true);
    this.packWipe.setEnabledInHierarchy(false);
    this.packFrame.setEnabledInHierarchy(false);
    this.rolling = -1;
    this.layer = this.rollTo;
    let left = 0;
    for (const v of this.views) if (!v.used) left++;
    if (left > 0) {
      if (this.layer > 2) this.shakeT = 0;          // flooded: a little shake, keep playing
      this.setState("PLAYING");
    } else if (this.layer === 2) {
      this.lightStar(this.step);
      this.setState("DONE_POP");
    } else {
      this.shakeT = 0;
      this.setState("LOSE_WAIT");
    }
  }

  private updateShake(dt: number): void {
    if (this.shakeT < 0) return;
    this.shakeT += dt;
    const k = this.shakeT / 0.35;
    const dx = k < 1 ? 8 * Math.sin(this.shakeT * 60) * (1 - k) : 0;
    this.packSt.anchoredPosition = new APJS.Vector2f(this.packX + dx, this.packY);
    if (k >= 1) this.shakeT = -1;
  }

  // ---------- Result ----------
  private showResult(win: boolean): void {
    this.won = win;
    console.log("MamamyPackPrint " + (win ? "WIN" : "LOSE") + " at t=" + this.t.toFixed(2));
    this.packSt.scale = new APJS.Vector2f(1, 1);
    this.packSt.anchoredPosition = new APJS.Vector2f(this.packX, this.packY);
    for (const v of this.views) v.obj.setEnabledInHierarchy(false);
    this.showStars(false);   // final frame: logo only
    const dim = this.resultOverlay ? this.resultOverlay.getComponent("Image") as APJS.Image : undefined;
    if (dim) dim.opacity = 1;
    if (this.resultOverlay) this.resultOverlay.setEnabledInHierarchy(true);
    if (this.winEffect) this.winEffect.setEnabledInHierarchy(win);
    if (this.retryButton) this.retryButton.setEnabledInHierarchy(!win);
    if (this.loseIcon) this.loseIcon.setEnabledInHierarchy(!win);
    this.setState("RESULT");
    this.updateResultAnim(0);
  }

  // PLAY AGAIN after a loss: the same round again (same product, same right order), stars kept.
  private retryRound(): void {
    console.log("MamamyPackPrint retry round " + (this.step + 1));
    this.tries++;
    if (this.resultOverlay) this.resultOverlay.setEnabledInHierarchy(false);
    this.resetAnimParts();
    for (const img of this.fadeImgs) img.opacity = 1;
    this.showStars(true);
    this.enterNextProduct();
    this.setState("NEXT_IN");
  }

  private showStars(on: boolean): void {
    for (let i = 0; i < this.starImgs.length; i++) {
      this.starImgs[i].getSceneObject().setEnabledInHierarchy(on && i < this.order.length);
    }
  }

  // Final frame, no text (client). The pack fades as the logo comes in. Win: only the logo, growing
  // out of the painted one, with confetti. Lose: the logo drops in under a sad face, then PLAY AGAIN
  // pops and keeps a gentle pulse.
  private updateResultAnim(t: number): void {
    if (this.won) {
      const slideK = 1 - Math.pow(1 - seg(t, 0, 1.2), 3);
      for (const layer of this.confetti) {
        if (layer.slide) {
          layer.st.anchoredPosition = new APJS.Vector2f(layer.st.anchoredPosition.x, layer.baseY + (1 - slideK) * 1280);
          layer.img.opacity = seg(t, 0, 0.4);
        } else {
          layer.img.opacity = seg(t, 0, 1.0);
        }
      }
    }
    for (const img of this.fadeImgs) img.opacity = 1 - seg(t, 0.15, 0.45);
    const title = this.anim[0], btn = this.anim[1], sad = this.anim[3];
    const kTitle = easeOutBack(seg(t, 0, 0.5));
    if (this.won && title.st) {
      // The banner starts with its shield exactly on the painted shield, then grows to its spot.
      const ax = this.logoShieldX * title.st.sizeDelta.x, ay = this.logoShieldY * title.st.sizeDelta.y;
      const k = easeOutBack(seg(t, 0.1, 0.7)), s0 = this.paintedShieldScale;
      let sl = Math.max(0.001, s0 + (1 - s0) * k);
      if (t > 1.0) sl = 1 + 0.03 * Math.sin((t - 1.0) * 3);
      const e = Math.min(1, k);
      const px = this.paintedShieldX + (title.baseX + ax - this.paintedShieldX) * e;
      const py = this.paintedShieldY + (title.baseY + ay - this.paintedShieldY) * e;
      this.setPart(title, px - ax * sl - title.baseX, py - ay * sl - title.baseY, sl);
    } else {
      this.setPart(title, 0, (1 - kTitle) * 320, 0.6 + 0.4 * kTitle);
    }
    const kBtn = easeOutBack(seg(t, 0.6, 1.0));
    this.setPart(btn, 0, 0, t > 1.0 ? 1 + 0.05 * Math.sin((t - 1.0) * 5) : kBtn);
    this.setPart(sad, 0, 0, easeOutBack(seg(t, 0.3, 0.7)));
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
