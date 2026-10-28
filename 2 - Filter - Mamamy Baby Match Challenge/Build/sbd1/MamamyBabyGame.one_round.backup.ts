/**
 * MamamyBabyGame — "Món này dành cho bé nào?": give each Mamamy product to the baby who needs it.
 *
 * Four babies sit in the four corners (index 0 TL, 1 TR, 2 BL, 3 BR). Each baby has three
 * sprites that share one crop box, so a state change is only a texture swap:
 *   idle    — not served yet (the baby's problem is visible)
 *   wrong   — got the wrong product: cries at once, stays crying and can't be chosen again
 *   correct — got the right product: happy/clean for the rest of the round (no more picks)
 * products[i] is the product baby i needs; the round shows them one by one in a shuffled order.
 *
 * Flow: INTRO → press TikTok Record (or tap RECORD TO PLAY) → PLAYING
 *       each product gets one pick — tap a baby, or drag the product onto a baby:
 *         right → product flies into the baby, baby turns "correct"
 *         wrong → that baby cries for good (locked), the product is used up
 *       then the next product pops in — all four always show, even one whose baby is locked
 *       (any pick for it is then wrong). No products or no free babies left → babies still
 *       not served start crying too → RESULT:
 *         all four happy = logo + BÉ NÀO CŨNG VUI! + confetti, otherwise logo + TIẾC QUÁ!
 *       → tap to play again.
 * Screen = 720x1280, origin at the centre, y up.
 */
@component()
export class MamamyBabyGame extends APJS.BasicScriptComponent {
  @header("Theme & Assets")
  @serializeProperty @tooltip('Babies not served yet: TL, TR, BL, BR') babyIdle: APJS.Texture[] = [];
  @serializeProperty @tooltip('Babies after a wrong product: TL, TR, BL, BR') babyWrong: APJS.Texture[] = [];
  @serializeProperty @tooltip('Babies after the right product: TL, TR, BL, BR') babyCorrect: APJS.Texture[] = [];
  @serializeProperty @tooltip('Product each baby needs: TL, TR, BL, BR') products: APJS.Texture[] = [];
  @serializeProperty @tooltip('Result title when every baby is happy') titleWinTex: APJS.Texture;
  @serializeProperty @tooltip('Result title when a baby is still crying') titleLoseTex: APJS.Texture;

  @header("Gameplay Tuning")
  @serializeProperty @tooltip('How long a crying baby shakes (s)') @slider(0.3, 3, 0.1) wrongSec: number = 1.0;
  @serializeProperty @tooltip('Product fits inside this box (px)') @slider(120, 400, 5) productBoxW: number = 300;
  @serializeProperty @tooltip('Product fits inside this box (px)') @slider(120, 400, 5) productBoxH: number = 270;
  @serializeProperty @tooltip('Product centre Y (px)') @slider(-200, 250, 5) productY: number = 70;
  @serializeProperty @tooltip('Flight time of a product into a baby (s)') @slider(0.1, 1, 0.05) flySec: number = 0.35;
  @serializeProperty @tooltip('Pause before the next product appears (s)') @slider(0, 1.5, 0.05) nextDelay: number = 0.35;
  @serializeProperty @tooltip('Drag distance that counts as a drag, not a tap (px)') @slider(5, 80, 1) dragThreshold: number = 24;
  @serializeProperty @tooltip('Released this far from the centre = give to the baby on that side (px)') @slider(60, 300, 5) throwDistance: number = 150;
  @serializeProperty @tooltip('Demo video autoplay (starts itself after 2s): 0 off, 1 all right, 2 first pick wrong') @spinBox(0, 2, 1) demoMode: number = 0;

  @header("Advanced — Scene Wiring")
  @serializeProperty @tooltip('TL, TR, BL, BR') babies: APJS.SceneObject[] = [];
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

  private inited: boolean = false;
  private startOnInit: boolean = false;
  private state: string = "INTRO";
  private kids: Baby[] = [];
  private order: number[] = [];
  private step: number = 0;
  private need: number = -1;       // baby index the current product belongs to
  private t: number = 0;           // clock for idle motion
  private finishTime: number = 0;
  private resultTime: number = 0;
  private won: boolean = false;

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

  private touchId: number = -1;
  private downX: number = 0;
  private downY: number = 0;
  private grabDX: number = 0;
  private grabDY: number = 0;
  private dragging: boolean = false;
  private onProduct: boolean = false;

  private anim: AnimPart[] = [];
  private confetti: ConfettiLayer[] = [];

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
    if (this.babies.length < 4 || !this.product || this.products.length < 4 ||
        this.babyIdle.length < 4 || this.babyWrong.length < 4 || this.babyCorrect.length < 4) return false;
    for (let i = 0; i < 4; i++) {
      const b = new Baby();
      b.obj = this.babies[i];
      b.st = b.obj.getComponent("ScreenTransform") as APJS.ScreenTransform;
      b.img = b.obj.getComponent("Image") as APJS.Image;
      b.baseX = b.st.anchoredPosition.x;
      b.baseY = b.st.anchoredPosition.y;
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
    this.updateBabies(dt);
    this.updateProduct(dt);
    if (this.demoMode > 0 && this.state === "INTRO") {
      this.demoT += dt;
      if (this.demoT >= 2.0) { this.demoT = 0; this.startGame(); }
    }
    if (this.demoMode > 0 && this.state === "PLAYING" && this.prodMode === "IDLE") {
      this.demoT += dt;
      if (this.demoT >= 0.9) { this.demoT = 0; this.give(this.demoPick()); }
    }
    if (this.state === "PLAYING" && this.waitNext >= 0) {
      this.waitNext -= dt;
      if (this.waitNext < 0) this.nextProduct();
    }
    if (this.state === "FINISH") {
      this.finishTime += dt;
      if (this.finishTime >= this.finishDelay) this.showResult();
    }
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
        pick = (this.prodY < this.productY ? 2 : 0) + (this.prodX > 0 ? 1 : 0);
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

  private resetGame(): void {
    for (const b of this.kids) {
      b.done = false;
      b.locked = false;
      b.shakeT = -1;
      b.popT = -1;
      this.setBabyTex(b, 0);
    }
    this.hideProduct();
    this.touchId = -1;
    this.dragging = false;
    this.waitNext = -1;
    this.step = 0;
    this.need = -1;
    this.finishTime = 0;
    this.resultTime = 0;
    this.won = false;
    if (this.resultOverlay) this.resultOverlay.setEnabledInHierarchy(false);
    if (this.winEffect) this.winEffect.setEnabledInHierarchy(false);
    this.resetAnimParts();
    if (this.introOverlay) this.introOverlay.setEnabledInHierarchy(true);
    this.state = "INTRO";
  }

  private startGame(): void {
    if (this.introOverlay) this.introOverlay.setEnabledInHierarchy(false);
    this.order = [0, 1, 2, 3];
    for (let i = this.order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = this.order[i]; this.order[i] = this.order[j]; this.order[j] = tmp;
    }
    console.log("MamamyBabyGame order " + this.order.join(","));
    this.step = 0;
    this.state = "PLAYING";
    this.nextProduct();
  }

  // ---------- Choosing ----------
  // One pick per product. A wrong pick makes that baby cry for good (locked) and uses the product up.
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

  // Demo autoplay: the right baby when it can still be served, except the first pick in
  // mode 2 (a wrong baby); a product whose baby is locked goes to any free baby.
  private demoPick(): number {
    const free = [0, 1, 2, 3].filter((i) => this.kids[i].free());
    const wrong = free.filter((i) => i !== this.need);
    if (this.demoMode === 2 && this.step === 1 && wrong.length > 0) return wrong[wrong.length - 1];
    if (this.kids[this.need].free()) return this.need;
    return free.length > 0 ? free[0] : this.need;
  }

  // Which baby's sprite box is under the finger (the four boxes never overlap), or -1.
  private babyAt(pos: APJS.Vector2f): number {
    for (let i = 0; i < this.kids.length; i++) {
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

  // ---------- Product ----------
  // Next product in the shuffled order; none left, or no baby left to give it to → the round ends.
  private nextProduct(): void {
    this.waitNext = -1;
    if (this.step >= this.order.length || !this.kids.some((b) => b.free())) {
      this.finish();
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

  // Babies nobody helped start crying too, then the result shows.
  private finish(): void {
    this.hideProduct();
    this.won = true;
    for (const b of this.kids) {
      if (b.done) continue;
      this.won = false;
      if (!b.locked) { b.locked = true; this.setBabyTex(b, 1); b.shakeT = 0; }
    }
    this.state = "FINISH";
    this.finishTime = 0;
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
    this.state = "RESULT";
    this.resultTime = 0;
    this.setImage(this.resultTitle, this.won ? this.titleWinTex : this.titleLoseTex, this.titleH);
    if (this.resultOverlay) this.resultOverlay.setEnabledInHierarchy(true);
    if (this.winEffect) this.winEffect.setEnabledInHierarchy(this.won);
    this.updateResultAnim(0);
  }

  // Logo drops in, title pops, then the PLAY AGAIN button pops and keeps a gentle pulse.
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
    const kLogo = easeOutBack(seg(t, 0, 0.5));
    this.setPart(logo, 0, (1 - kLogo) * 320, 0.6 + 0.4 * kLogo);
    const kTitle = easeOutBack(seg(t, 0.3, 0.7));
    this.setPart(title, 0, 0, t > 1.5 ? 1 + 0.04 * Math.sin((t - 1.5) * 4) : kTitle);
    const kBtn = easeOutBack(seg(t, 0.8, 1.2));
    this.setPart(btn, 0, 0, t > 1.2 ? 1 + 0.05 * Math.sin((t - 1.2) * 5) : kBtn);
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

class Baby {
  obj!: APJS.SceneObject;
  st!: APJS.ScreenTransform;
  img!: APJS.Image;
  baseX: number = 0;
  baseY: number = 0;
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

function easeInOut(k: number): number {
  return k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
}
