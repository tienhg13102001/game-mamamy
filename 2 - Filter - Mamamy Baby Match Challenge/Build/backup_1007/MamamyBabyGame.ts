/**
 * MamamyBabyGame — "Món này dành cho bé nào?": give each Mamamy product to the one who needs it.
 *
 * Two rounds of four slots (slot 0 TL, 1 TR, 2 BL, 3 BR). Object/texture index = round * 4 + slot.
 *   Round 1: four babies.
 *   Round 2: three babies plus the 19 shield in the TR slot (SHIELD_SLOT). The shield's product
 *            always comes last in round 2, so the shield is the final thing the player serves.
 * Every slot has three sprites that share one crop box, so a state change is only a texture swap:
 *   idle    — not served yet (the baby's problem is visible / the plain shield)
 *   wrong   — got the wrong product: cries (or the shield cracks) and can't be chosen again
 *   correct — got the right product: happy (or "19 năm kiên định chuẩn an toàn")
 * products[i] is the product slot i needs.
 *
 * Flow: INTRO → press TikTok Record (or tap RECORD TO PLAY) → PLAYING round 1
 *       each product gets one pick — tap a slot, or drag the product onto it:
 *         right → product flies in, slot turns "correct"; wrong → slot locked in "wrong"
 *       all four products always show (a product whose slot is locked can only be given wrongly).
 *       Round 1 all right → SWAP to round 2 (round-1 babies shrink away, round-2 slots pop in).
 *       Any slot not served right at the end of a round → the rest cry → RESULT lose (TIẾC QUÁ!).
 *       Round 2 all right → FINALE: the babies fade, the shield turns back into the plain 19 shield,
 *       flies to the shield's spot in the MEGA MAMAMY 19 logo and the logo bursts out of it
 *       → RESULT win (logo + BÉ NÀO CŨNG VUI! + confetti) → tap to play again.
 * Screen = 720x1280, origin at the centre, y up.
 */
const SLOTS = 4;
const ROUNDS = 2;
const SHIELD_SLOT = 1;

class Baby {
  obj!: APJS.SceneObject;
  st!: APJS.ScreenTransform;
  img!: APJS.Image;
  baseX: number = 0;
  baseY: number = 0;
  baseW: number = 0;
  baseH: number = 0;
  phase: number = 0;
  done: boolean = false;    // got the right product
  locked: boolean = false;  // got a wrong product: crying, can't be chosen again
  shown: number = -1;       // 0 idle, 1 wrong, 2 correct
  shakeT: number = -1;
  popT: number = -1;

  free(): boolean {
    return !this.done && !this.locked;
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

@component()
export class MamamyBabyGame extends APJS.BasicScriptComponent {
  @header("Theme & Assets")
  @serializeProperty @tooltip('Idle sprites: round 1 TL, TR, BL, BR, then round 2 TL, TR (shield), BL, BR') babyIdle: APJS.Texture[] = [];
  @serializeProperty @tooltip('Wrong sprites, same order as Idle') babyWrong: APJS.Texture[] = [];
  @serializeProperty @tooltip('Correct sprites, same order as Idle') babyCorrect: APJS.Texture[] = [];
  @serializeProperty @tooltip('Product each slot needs, same order as Idle') products: APJS.Texture[] = [];
  @serializeProperty @tooltip('Plain 19 shield that flies into the logo at the finale') shieldPlainTex: APJS.Texture;
  @serializeProperty @tooltip('Result title when every slot is happy') titleWinTex: APJS.Texture;
  @serializeProperty @tooltip('Result title when a baby is still crying') titleLoseTex: APJS.Texture;

  @header("Gameplay Tuning")
  @serializeProperty @tooltip('How long a crying baby shakes (s)') @slider(0.3, 3, 0.1) wrongSec: number = 1.0;
  @serializeProperty @tooltip('Product fits inside this box (px)') @slider(120, 400, 5) productBoxW: number = 300;
  @serializeProperty @tooltip('Product fits inside this box (px)') @slider(120, 400, 5) productBoxH: number = 270;
  @serializeProperty @tooltip('Product centre Y (px)') @slider(-200, 250, 5) productY: number = 70;
  @serializeProperty @tooltip('Flight time of a product into a baby (s)') @slider(0.1, 1, 0.05) flySec: number = 0.35;
  @serializeProperty @tooltip('Pause before the next product appears (s)') @slider(0, 1.5, 0.05) nextDelay: number = 0.35;
  @serializeProperty @tooltip('Drag distance that counts as a drag, not a tap (px)') @slider(5, 80, 1) dragThreshold: number = 24;
  @serializeProperty @tooltip('Released this far from the centre = give to the slot on that side (px)') @slider(60, 300, 5) throwDistance: number = 150;
  @serializeProperty @tooltip('Result logo width (px)') @slider(300, 700, 5) logoW: number = 560;
  @serializeProperty @tooltip('Shield centre inside the logo, x as a share of the logo width from its centre') logoShieldX: number = 0.3674;
  @serializeProperty @tooltip('Shield centre inside the logo, y (up) as a share of the logo height from its centre') logoShieldY: number = 0.1429;
  @serializeProperty @tooltip('Shield height as a share of the logo height') logoShieldH: number = 0.6851;
  @serializeProperty @tooltip('Demo video autoplay: 0 off, 1 a normal player who gets everything right, 2 first pick wrong, 3 round 2: first product given to the shield (it cracks)') @spinBox(0, 3, 1) demoMode: number = 0;

  @header("Advanced — Scene Wiring")
  @serializeProperty @tooltip('Round 1 TL, TR, BL, BR, then round 2 TL, TR (shield), BL, BR') babies: APJS.SceneObject[] = [];
  @serializeProperty product: APJS.SceneObject;
  @serializeProperty introOverlay: APJS.SceneObject;
  @serializeProperty introButton: APJS.SceneObject;
  @serializeProperty resultOverlay: APJS.SceneObject;
  @serializeProperty winEffect: APJS.SceneObject;
  @serializeProperty resultLogo: APJS.SceneObject;
  @serializeProperty resultTitle: APJS.SceneObject;
  @serializeProperty retryButton: APJS.SceneObject;

  private readonly titleH: number = 56;
  private readonly retryDelay: number = 1.3;
  private readonly finishDelay: number = 1.0;
  private readonly swapSec: number = 1.1;
  private readonly finaleSec: number = 1.9;   // shield hold + flight, then the logo bursts out
  private readonly burstSec: number = 0.55;

  private inited: boolean = false;
  private startOnInit: boolean = false;
  private state: string = "INTRO";   // INTRO | PLAYING | SWAP | FINALE | FINISH | RESULT
  private kids: Baby[] = [];
  private round: number = 0;
  private order: number[] = [];
  private step: number = 0;
  private need: number = -1;       // kid index the current product belongs to
  private t: number = 0;           // clock for idle motion
  private stateT: number = 0;
  private resultTime: number = 0;
  private won: boolean = false;
  private swapShown: boolean = false;

  private prodSt!: APJS.ScreenTransform;
  private prodImg!: APJS.Image;
  private prodMode: string = "HIDDEN"; // HIDDEN | IN | IDLE | DRAG | BACK | FLY
  private prodT: number = 0;
  private prodX: number = 0;
  private prodY: number = 0;
  private fromX: number = 0;
  private fromY: number = 0;
  private flyTo: number = -1;
  private flyRight: boolean = false;
  private waitNext: number = -1;
  private demoT: number = 0;
  private demoWait: number = 1.0;

  private touchId: number = -1;
  private downX: number = 0;
  private downY: number = 0;
  private grabDX: number = 0;
  private grabDY: number = 0;
  private dragging: boolean = false;
  private onProduct: boolean = false;

  private anim: AnimPart[] = [];
  private confetti: ConfettiLayer[] = [];
  private logoSt: APJS.ScreenTransform | undefined;
  private logoH: number = 238;
  private shieldFromX: number = 0;
  private shieldFromY: number = 0;
  private shieldFromS: number = 1;
  private resultDim: APJS.Image | undefined;

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
    const n = SLOTS * ROUNDS;
    if (this.babies.length < n || !this.product || this.products.length < n ||
        this.babyIdle.length < n || this.babyWrong.length < n || this.babyCorrect.length < n) return false;
    for (let i = 0; i < n; i++) {
      const b = new Baby();
      b.obj = this.babies[i];
      b.st = b.obj.getComponent("ScreenTransform") as APJS.ScreenTransform;
      b.img = b.obj.getComponent("Image") as APJS.Image;
      b.baseX = b.st.anchoredPosition.x;
      b.baseY = b.st.anchoredPosition.y;
      b.baseW = b.st.sizeDelta.x;
      b.baseH = b.st.sizeDelta.y;
      b.phase = i * 1.7;
      this.kids.push(b);
    }
    this.prodSt = this.product.getComponent("ScreenTransform") as APJS.ScreenTransform;
    this.prodImg = this.product.getComponent("Image") as APJS.Image;
    for (const obj of [this.resultLogo, this.resultTitle, this.retryButton, this.introButton]) {
      const part = new AnimPart();
      if (obj) {
        part.st = obj.getComponent("ScreenTransform") as APJS.ScreenTransform;
        part.baseX = part.st.anchoredPosition.x;
        part.baseY = part.st.anchoredPosition.y;
      }
      this.anim.push(part);
    }
    this.logoSt = this.anim[0].st;
    if (this.resultOverlay) this.resultDim = this.resultOverlay.getComponent("Image") as APJS.Image;
    // The logo keeps its texture's aspect ratio at logoW wide.
    const logoImg = this.resultLogo ? this.resultLogo.getComponent("Image") as APJS.Image : undefined;
    if (logoImg && logoImg.texture && this.logoSt) {
      const tex = logoImg.texture;
      this.logoH = this.logoW * tex.getHeight() / Math.max(tex.getWidth(), 1);
      this.logoSt.sizeDelta = new APJS.Vector2f(this.logoW, this.logoH);
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
    this.updateBabies(dt);
    this.updateProduct(dt);
    if (this.demoMode > 0 && this.state === "INTRO" && this.stateT >= 4.0) this.startGame();
    if (this.demoMode > 0 && this.state === "PLAYING" && this.prodMode === "IDLE") {
      this.demoT += dt;
      if (this.demoT >= this.demoWait) {
        this.demoT = 0;
        this.demoWait = 0.7 + Math.random() * 0.9;
        this.give(this.demoPick());
      }
    }
    if (this.state === "PLAYING" && this.waitNext >= 0) {
      this.waitNext -= dt;
      if (this.waitNext < 0) this.nextProduct();
    }
    if (this.state === "SWAP") this.updateSwap();
    if (this.state === "FINALE") this.updateFinale();
    if (this.state === "FINISH" && this.stateT >= this.finishDelay) this.showResult();
    if (this.state === "INTRO") {
      this.setPart(this.anim[3], 0, 0, 1 + 0.05 * Math.sin(this.t * 5));
    }
    if (this.state === "RESULT") {
      this.resultTime += dt;
      this.updateResultAnim(this.resultTime);
    }
  }

  // ---------- Input / lifecycle ----------
  private onTouch(event: APJS.IEvent): void {
    if (!this.inited) return;
    const touch = event.args[0] as APJS.TouchData;
    const x = touch.position.x * 720 - 360;
    const y = (1 - touch.position.y) * 1280 - 640;
    if (touch.phase === APJS.TouchPhase.Began) {
      if (this.state === "INTRO") {
        if (this.introButton && this.hitImage(touch.position, this.introButton)) this.startGame();
        return;
      }
      if (this.state === "RESULT") {
        if (this.resultTime > this.retryDelay) { this.resetGame(); this.startGame(); }
        return;
      }
      if (this.state !== "PLAYING" || this.touchId >= 0) return;
      this.touchId = touch.touchId;
      this.downX = x;
      this.downY = y;
      this.dragging = false;
      this.onProduct = this.prodMode === "IDLE" && this.hitImage(touch.position, this.product);
      this.grabDX = this.prodX - x;
      this.grabDY = this.prodY - y;
      return;
    }
    if (touch.touchId !== this.touchId) return;
    if (touch.phase === APJS.TouchPhase.Moved) {
      if (!this.dragging && this.onProduct && this.prodMode === "IDLE" &&
          Math.abs(x - this.downX) + Math.abs(y - this.downY) > this.dragThreshold) {
        this.dragging = true;
        this.prodMode = "DRAG";
      }
      if (this.dragging && this.prodMode === "DRAG") {
        this.prodX = x + this.grabDX;
        this.prodY = y + this.grabDY;
      }
      return;
    }
    // Ended / Canceled
    this.touchId = -1;
    if (this.state !== "PLAYING") return;
    if (this.dragging) {
      this.dragging = false;
      if (this.prodMode !== "DRAG") return;
      let pick = this.babyAt(touch.position);
      if (pick < 0 && Math.hypot(this.prodX, this.prodY - this.productY) >= this.throwDistance) {
        pick = this.round * SLOTS + (this.prodY < this.productY ? 2 : 0) + (this.prodX > 0 ? 1 : 0);
      }
      if (pick < 0 || !this.kids[pick].free()) this.sendBack();
      else this.give(pick);
      return;
    }
    if (touch.phase === APJS.TouchPhase.Canceled) return;
    const pick = this.babyAt(touch.position);
    if (pick >= 0 && (this.prodMode === "IDLE" || this.prodMode === "IN")) this.give(pick);
  }

  // Pressing Record starts a fresh round.
  private onRecordStart(): void {
    if (!this.inited) { this.startOnInit = true; return; }
    this.resetGame();
    this.startGame();
  }

  private setState(s: string): void {
    this.state = s;
    this.stateT = 0;
  }

  private resetGame(): void {
    for (const b of this.kids) {
      b.done = false;
      b.locked = false;
      b.shakeT = -1;
      b.popT = -1;
      b.shown = -1;
      this.setBabyTex(b, 0);
      b.st.sizeDelta = new APJS.Vector2f(b.baseW, b.baseH);
      b.img.opacity = 1;
    }
    this.showRound(0);
    this.hideProduct();
    this.touchId = -1;
    this.dragging = false;
    this.waitNext = -1;
    this.round = 0;
    this.step = 0;
    this.need = -1;
    this.resultTime = 0;
    this.won = false;
    if (this.resultOverlay) this.resultOverlay.setEnabledInHierarchy(false);
    if (this.winEffect) this.winEffect.setEnabledInHierarchy(false);
    this.resetAnimParts();
    if (this.introOverlay) this.introOverlay.setEnabledInHierarchy(true);
    this.demoT = 0;
    this.setState("INTRO");
  }

  // Only the given round's slots are on screen.
  private showRound(r: number): void {
    for (let i = 0; i < this.kids.length; i++) {
      this.kids[i].obj.setEnabledInHierarchy(Math.floor(i / SLOTS) === r);
    }
  }

  private startGame(): void {
    if (this.introOverlay) this.introOverlay.setEnabledInHierarchy(false);
    this.beginRound(0);
  }

  // Round 1: the four products shuffled. Round 2: the three baby products shuffled, the shield's last.
  private beginRound(r: number): void {
    this.round = r;
    this.showRound(r);
    const slots = r === ROUNDS - 1 ? [0, 1, 2, 3].filter((s) => s !== SHIELD_SLOT) : [0, 1, 2, 3];
    for (let i = slots.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = slots[i]; slots[i] = slots[j]; slots[j] = tmp;
    }
    if (r === ROUNDS - 1) slots.push(SHIELD_SLOT);
    this.order = slots.map((s) => r * SLOTS + s);
    console.log("MamamyBabyGame round " + (r + 1) + " order " + this.order.join(","));
    this.step = 0;
    this.setState("PLAYING");
    this.nextProduct();
  }

  private roundKids(): Baby[] {
    return this.kids.slice(this.round * SLOTS, this.round * SLOTS + SLOTS);
  }

  // ---------- Choosing ----------
  // One pick per product. A wrong pick locks that slot (crying / cracked) and uses the product up.
  private give(pick: number): void {
    const b = this.kids[pick];
    if (!b.free() || this.need < 0) return;
    const right = pick === this.need;
    if (right) {
      b.done = true;
    } else {
      b.locked = true;
      this.setBabyTex(b, 1);
      b.shakeT = 0;
    }
    this.fromX = this.prodX;
    this.fromY = this.prodY;
    this.flyTo = pick;
    this.flyRight = right;
    this.prodMode = "FLY";
    this.prodT = 0;
    this.need = -1;
  }

  // Demo autoplay: the right slot when it can still be served, except the first pick in
  // mode 2 (a wrong slot); a product whose slot is locked goes to any free slot.
  private demoPick(): number {
    const base = this.round * SLOTS;
    const free = [0, 1, 2, 3].map((s) => base + s).filter((i) => this.kids[i].free());
    const wrong = free.filter((i) => i !== this.need);
    if (this.demoMode === 2 && this.round === 0 && this.step === 1 && wrong.length > 0) return wrong[wrong.length - 1];
    const shield = (ROUNDS - 1) * SLOTS + SHIELD_SLOT;
    if (this.demoMode === 3 && this.round === ROUNDS - 1 && this.step === 1 && this.need !== shield) return shield;
    if (this.kids[this.need].free()) return this.need;
    return free.length > 0 ? free[0] : this.need;
  }

  // Which of this round's sprite boxes is under the finger (they never overlap), or -1.
  private babyAt(pos: APJS.Vector2f): number {
    for (let s = 0; s < SLOTS; s++) {
      const i = this.round * SLOTS + s;
      if (APJS.TouchUtils.isScreenPointOnImage(pos, this.kids[i].img)) return i;
    }
    return -1;
  }

  private hitImage(pos: APJS.Vector2f, obj: APJS.SceneObject): boolean {
    const img = obj ? obj.getComponent("Image") as APJS.Image : undefined;
    return img ? APJS.TouchUtils.isScreenPointOnImage(pos, img) : false;
  }

  // ---------- Babies ----------
  private setBabyTex(b: Baby, s: number): void {
    const i = this.kids.indexOf(b);
    const list = s === 2 ? this.babyCorrect : s === 1 ? this.babyWrong : this.babyIdle;
    if (b.shown === s) return;
    b.shown = s;
    b.img.texture = list[i];
  }

  private updateBabies(dt: number): void {
    // SWAP and FINALE place the slots themselves; after a win the result anim owns the shield.
    if (this.state === "SWAP" || this.state === "FINALE" || (this.state === "RESULT" && this.won)) return;
    for (const b of this.kids) {
      let dx = 0;
      let s = 1 + 0.015 * Math.sin(this.t * 2.2 + b.phase);
      let rot = 0;
      if (b.shakeT >= 0) {
        b.shakeT += dt;
        const fade = 1 - seg(b.shakeT, this.wrongSec * 0.6, this.wrongSec);
        dx = Math.sin(b.shakeT * 38) * 9 * fade;
        rot = Math.sin(b.shakeT * 30) * 3 * fade;
        if (b.shakeT >= this.wrongSec) b.shakeT = -1;
      }
      if (b.popT >= 0) {
        b.popT += dt;
        const k = seg(b.popT, 0, 0.45);
        s *= 1 + 0.22 * Math.sin(k * Math.PI) * (1 - k * 0.5);
        if (k >= 1) b.popT = -1;
      }
      b.st.anchoredPosition = new APJS.Vector2f(b.baseX + dx, b.baseY);
      b.st.scale = new APJS.Vector2f(s, s);
      b.st.rotation = rot;
    }
  }

  // Round 1 → round 2: the happy round-1 babies hop and shrink away, then round 2 pops in one by one.
  private updateSwap(): void {
    const t = this.stateT;
    const outEnd = 0.45;
    for (let s = 0; s < SLOTS; s++) {
      const a = this.kids[s];
      const k = seg(t, 0.05 * s, outEnd);
      const sc = Math.max(0.001, (1 + 0.15 * Math.sin(Math.min(k * 2, 1) * Math.PI)) * (1 - easeInCubic(k)));
      a.st.scale = new APJS.Vector2f(sc, sc);
      a.st.rotation = 0;
      a.st.anchoredPosition = new APJS.Vector2f(a.baseX, a.baseY);
      const b = this.kids[SLOTS + s];
      const kb = easeOutBack(seg(t, outEnd + 0.1 * s, outEnd + 0.1 * s + 0.4));
      b.st.scale = new APJS.Vector2f(Math.max(0.001, kb), Math.max(0.001, kb));
      b.st.rotation = 0;
      b.st.anchoredPosition = new APJS.Vector2f(b.baseX, b.baseY);
    }
    if (t >= outEnd && !this.swapShown) { this.swapShown = true; this.showRound(1); }
    if (t >= this.swapSec) this.beginRound(1);
  }

  // ---------- Product ----------
  // Next product in the shuffled order; none left, or no slot left to give it to → the round ends.
  private nextProduct(): void {
    this.waitNext = -1;
    if (this.step >= this.order.length || !this.roundKids().some((b) => b.free())) {
      this.endRound();
      return;
    }
    this.need = this.order[this.step];
    this.step++;
    const tex = this.products[this.need];
    this.prodImg.texture = tex;
    const w = tex.getWidth(), h = tex.getHeight();
    const k = Math.min(this.productBoxW / Math.max(w, 1), this.productBoxH / Math.max(h, 1));
    this.prodSt.sizeDelta = new APJS.Vector2f(w * k, h * k);
    this.prodX = 0;
    this.prodY = this.productY;
    this.prodMode = "IN";
    this.prodT = 0;
    this.product.setEnabledInHierarchy(true);
  }

  // A perfect round goes on (round 2, or the shield finale); otherwise everyone left cries → lose.
  private endRound(): void {
    this.hideProduct();
    const kids = this.roundKids();
    const perfect = kids.every((b) => b.done);
    if (perfect && this.round < ROUNDS - 1) {
      for (let i = SLOTS; i < SLOTS * 2; i++) this.kids[i].st.scale = new APJS.Vector2f(0.001, 0.001);
      this.swapShown = false;
      this.setState("SWAP");
      return;
    }
    if (perfect) {
      this.won = true;
      this.startFinale();
      return;
    }
    this.won = false;
    for (const b of kids) {
      if (!b.done && !b.locked) { b.locked = true; this.setBabyTex(b, 1); b.shakeT = 0; }
    }
    this.setState("FINISH");
  }

  // ---------- Finale: the shield turns into MEGA MAMAMY 19 ----------
  private shieldKid(): Baby {
    return this.kids[(ROUNDS - 1) * SLOTS + SHIELD_SLOT];
  }

  private startFinale(): void {
    const sh = this.shieldKid();
    this.shieldFromX = sh.baseX;
    this.shieldFromY = sh.baseY;
    this.shieldFromS = 1;
    sh.popT = -1;
    this.setState("FINALE");
  }

  // Where the shield sits inside the result logo (screen px) and how big it is there.
  private logoShieldX0(): number {
    const lp = this.anim[0];
    return lp.baseX + this.logoShieldX * this.logoW;
  }

  private logoShieldY0(): number {
    const lp = this.anim[0];
    return lp.baseY + this.logoShieldY * this.logoH;
  }

  // 0.0-0.7  the "19 năm kiên định" shield glows (pulse), the babies fade away
  // 0.7-0.9  it turns back into the plain 19 shield
  // 0.9-1.6  it flies to the logo's shield spot, growing to the logo's shield size
  // 1.6+     the logo bursts out of the shield (RESULT)
  private updateFinale(): void {
    const t = this.stateT;
    const sh = this.shieldKid();
    for (let s = 0; s < SLOTS; s++) {
      if (s === SHIELD_SLOT) continue;
      const b = this.kids[(ROUNDS - 1) * SLOTS + s];
      b.img.opacity = 1 - seg(t, 0.3, 0.9);
      b.st.scale = new APJS.Vector2f(1, 1);
    }
    if (t < 0.7) {
      const p = 1 + 0.08 * Math.sin(seg(t, 0, 0.7) * Math.PI * 2);
      sh.st.anchoredPosition = new APJS.Vector2f(sh.baseX, sh.baseY);
      sh.st.scale = new APJS.Vector2f(p, p);
      sh.st.rotation = 0;
      return;
    }
    if (sh.img.texture !== this.shieldPlainTex && this.shieldPlainTex) {
      sh.img.texture = this.shieldPlainTex;
      const w = this.shieldPlainTex.getWidth(), h = this.shieldPlainTex.getHeight();
      sh.st.sizeDelta = new APJS.Vector2f(this.shieldPlainH() * w / Math.max(h, 1), this.shieldPlainH());
    }
    const toS = this.logoShieldH * this.logoH / this.shieldPlainH();
    const k = easeInOut(seg(t, 0.9, 1.6));
    const flip = seg(t, 0.7, 0.9);
    const x = this.shieldFromX + (this.logoShieldX0() - this.shieldFromX) * k;
    const y = this.shieldFromY + (this.logoShieldY0() - this.shieldFromY) * k + Math.sin(k * Math.PI) * 90;
    const s = (this.shieldFromS + (toS - this.shieldFromS) * k) * (1 + 0.12 * Math.sin(flip * Math.PI));
    sh.st.anchoredPosition = new APJS.Vector2f(x, y);
    sh.st.scale = new APJS.Vector2f(s, s);
    sh.st.rotation = 360 * easeInOut(seg(t, 0.9, 1.6));
    if (t >= 1.6) this.showResult();
  }

  // Visible height of the plain shield on screen (the shield art in the TR slot is shield-sized).
  private shieldPlainH(): number {
    return 229.3;
  }

  private sendBack(): void {
    this.fromX = this.prodX;
    this.fromY = this.prodY;
    this.prodMode = "BACK";
    this.prodT = 0;
  }

  private hideProduct(): void {
    this.prodMode = "HIDDEN";
    if (this.product) this.product.setEnabledInHierarchy(false);
  }

  private updateProduct(dt: number): void {
    if (this.prodMode === "HIDDEN") return;
    this.prodT += dt;
    let x = this.prodX, y = this.prodY, s = 1, rot = 0;
    if (this.prodMode === "IN") {
      s = easeOutBack(seg(this.prodT, 0, 0.35));
      if (this.prodT >= 0.35) { this.prodMode = "IDLE"; this.prodT = 0; }
    } else if (this.prodMode === "IDLE") {
      y += 6 * Math.sin(this.t * 2.6);
      rot = 2 * Math.sin(this.t * 1.9);
    } else if (this.prodMode === "DRAG") {
      s = 1.06;
    } else if (this.prodMode === "BACK") {
      const k = easeOutCubic(seg(this.prodT, 0, 0.25));
      x = this.prodX = this.fromX + (0 - this.fromX) * k;
      y = this.prodY = this.fromY + (this.productY - this.fromY) * k;
      if (k >= 1) { this.prodMode = "IDLE"; this.prodT = 0; }
    } else if (this.prodMode === "FLY") {
      const b = this.kids[this.flyTo];
      const k = easeInOut(seg(this.prodT, 0, this.flySec));
      x = this.fromX + (b.baseX - this.fromX) * k;
      y = this.fromY + (b.baseY - this.fromY) * k + Math.sin(k * Math.PI) * 60;
      s = 1 - 0.75 * k;
      rot = 25 * k * (b.baseX > 0 ? -1 : 1);
      if (k >= 1) {
        if (this.flyRight) { this.setBabyTex(b, 2); b.popT = 0; }
        this.hideProduct();
        this.waitNext = this.nextDelay;
        return;
      }
    }
    this.prodSt.anchoredPosition = new APJS.Vector2f(x, y);
    this.prodSt.scale = new APJS.Vector2f(Math.max(0.001, s), Math.max(0.001, s));
    this.prodSt.rotation = rot;
  }

  // ---------- Result ----------
  private showResult(): void {
    this.setState("RESULT");
    this.resultTime = 0;
    this.setImage(this.resultTitle, this.won ? this.titleWinTex : this.titleLoseTex, this.titleH);
    // No dim on a win: the shield must stay bright while the logo bursts out of it.
    if (this.resultDim) this.resultDim.opacity = this.won ? 0 : 1;
    if (this.resultOverlay) this.resultOverlay.setEnabledInHierarchy(true);
    if (this.winEffect) this.winEffect.setEnabledInHierarchy(this.won);
    this.updateResultAnim(0);
  }

  // Win: the logo grows out of the shield (the shield's spot stays put), then the shield hides.
  // Lose: the logo drops in. Then the title pops, then PLAY AGAIN pops and keeps a gentle pulse.
  // Confetti (win only) slides down from above the screen.
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
    const logo = this.anim[0], title = this.anim[1], btn = this.anim[2];
    if (this.won) {
      const sh = this.shieldKid();
      const k = easeOutBack(seg(t, 0, this.burstSec));
      const s = Math.max(0.001, k);
      // keep the logo's shield spot fixed while the logo scales around it
      const ax = this.logoShieldX * this.logoW, ay = this.logoShieldY * this.logoH;
      this.setPart(logo, ax - ax * s, ay - ay * s, s);
      const wob = t > this.burstSec + 0.3 ? 1 + 0.03 * Math.sin((t - this.burstSec - 0.3) * 3) : 1;
      if (t > this.burstSec + 0.3) this.setPart(logo, ax - ax * wob, ay - ay * wob, wob);
      sh.obj.setEnabledInHierarchy(t < this.burstSec * 0.8);
      const toS = this.logoShieldH * this.logoH / this.shieldPlainH();
      const pop = toS * (1 + 0.15 * Math.sin(seg(t, 0, this.burstSec * 0.8) * Math.PI));
      sh.st.scale = new APJS.Vector2f(pop, pop);
      sh.st.rotation = 0;
    } else {
      const kLogo = easeOutBack(seg(t, 0, 0.5));
      this.setPart(logo, 0, (1 - kLogo) * 320, 0.6 + 0.4 * kLogo);
    }
    const t0 = this.won ? this.burstSec : 0.3;
    const kTitle = easeOutBack(seg(t, t0, t0 + 0.4));
    this.setPart(title, 0, 0, t > t0 + 1.2 ? 1 + 0.04 * Math.sin((t - t0 - 1.2) * 4) : kTitle);
    const kBtn = easeOutBack(seg(t, t0 + 0.5, t0 + 0.9));
    this.setPart(btn, 0, 0, t > t0 + 0.9 ? 1 + 0.05 * Math.sin((t - t0 - 0.9) * 5) : kBtn);
  }

  // Show a brand text image at a fixed on-screen height, keeping its aspect ratio.
  private setImage(obj: APJS.SceneObject, tex: APJS.Texture | undefined, height: number): void {
    if (!obj || !tex) return;
    const img = obj.getComponent("Image") as APJS.Image;
    const st = obj.getComponent("ScreenTransform") as APJS.ScreenTransform;
    if (!img || !st) return;
    img.texture = tex;
    const w = tex.getWidth(), h = tex.getHeight();
    st.sizeDelta = new APJS.Vector2f(h > 0 ? height * w / h : height, height);
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

function easeOutCubic(k: number): number {
  return 1 - Math.pow(1 - k, 3);
}

function easeInCubic(k: number): number {
  return k * k * k;
}

function easeInOut(k: number): number {
  return k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
}
