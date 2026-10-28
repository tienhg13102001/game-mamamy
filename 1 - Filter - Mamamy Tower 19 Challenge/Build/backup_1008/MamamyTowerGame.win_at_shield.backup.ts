/**
 * MamamyTowerGame — Claw-drop stacking: stack every product once and crown the tower with the 19 shield.
 * The taller it gets, the more it sways and bends; a lopsided tower leans and collapses.
 *
 * Flow: INTRO → press TikTok Record → AIMING (claw swings holding an item, tap to drop)
 *       → DROPPING (falls straight down: x + rotation frozen) → landed on the top:
 *           upper item overlaps the one below by >= minOverlap → joins the tower, +1 floor
 *           otherwise → the item tips off and the whole tower tumbles with it → RESULT
 *       Every frame the tower sways and bends (upper floors tilt more). The part above any
 *       floor must keep its centre of mass over that floor, else it COLLAPSES → RESULT.
 *       Order per round: openingTextures, then the other products once each (random, narrow and
 *       wide alternating), then finaleTexture; landing the finale → FINISHED: the 19 shield on top
 *       pulses, leaves the tower, flies to the shield's spot in the MEGA MAMAMY 19 logo and the
 *       logo bursts out of it → win celebration.
 *       → RESULT win = MEGA MAMAMY 19 logo + confetti; lose = sad face + logo + PLAY AGAIN
 *         → tap retry / Record again.
 *       No text on screen besides the CTAs (client): no HUD, popups, titles or floor count.
 *
 * "Tower space" keeps each floor's straight-stack position (lx, ly = centre, y up, origin at
 * the bottom-centre of the first floor); it drives the balance maths. On screen the stack is
 * drawn as a bending chain: floor i is rotated by angle * i/(n-1), so the base stays flat.
 * Screen = 720x1280, physics = 32 px/m. Items come from a pre-built pool (Items/Item..Item (11));
 * floors that scroll far below the screen give their object back but still count for balance.
 */
@component()
export class MamamyTowerGame extends APJS.BasicScriptComponent {
  @header("Theme & Assets")
  @serializeProperty @tooltip('Products (wide ones)') easyTextures: APJS.Texture[] = [];
  @serializeProperty @tooltip('Products (bottles / pouches)') mediumTextures: APJS.Texture[] = [];
  @serializeProperty @tooltip('Products (tall and narrow)') hardTextures: APJS.Texture[] = [];
  @serializeProperty @tooltip('Dropped first, in this order; the other products follow once each in random order') openingTextures: APJS.Texture[] = [];
  @serializeProperty @tooltip('Last piece: placing it on the tower wins the round (19 shield)') finaleTexture: APJS.Texture;
  @serializeProperty @tooltip('Celebration shown on a win') winEffect: APJS.SceneObject;

  @header("Gameplay Tuning")
  @serializeProperty @tooltip('Min overlap of the upper item on the one below') @slider(0.05, 0.9, 0.05) minOverlap: number = 0.3;
  @serializeProperty @tooltip('Floors before the tower starts to sway') @spinBox(0, 20, 1) swayStartFloor: number = 2;
  @serializeProperty @tooltip('Extra sway at the tower top per floor (px)') @slider(0, 40, 1) swayPerFloor: number = 18;
  @serializeProperty @tooltip('Max sway at the tower top (px)') @slider(0, 200, 5) swayMax: number = 160;
  @serializeProperty @tooltip('Sway speed (rad/s)') @slider(0.5, 5, 0.1) swaySpeed: number = 1.8;
  @serializeProperty @tooltip('Lean per px of off-centre weight (deg/px)') @slider(0, 0.1, 0.005) leanPerPx: number = 0.03;
  @serializeProperty @tooltip('Claw speed (px/s)') @slider(60, 500, 10) swingSpeed: number = 160;
  @serializeProperty @tooltip('Extra claw speed per floor (px/s)') @slider(0, 40, 1) swingSpeedPerFloor: number = 6;
  @serializeProperty @tooltip('Max claw speed (px/s)') @slider(60, 700, 10) swingSpeedMax: number = 300;
  @serializeProperty @tooltip('Claw swing half-range (px)') @slider(50, 300, 5) swingRange: number = 190;
  @serializeProperty @tooltip('Product size vs source image') @slider(0.3, 1, 0.01) itemScale: number = 0.53;
  @serializeProperty @tooltip('Products drawn at their own size (detergent pouch, dry towels)') sizedTextures: APJS.Texture[] = [];
  @serializeProperty @tooltip('Size vs source image for each sizedTextures entry') sizedScales: number[] = [];
  @serializeProperty @tooltip('Finale piece size vs source image') @slider(0.2, 1.2, 0.01) finaleScale: number = 0.5;
  @serializeProperty @tooltip('Shield centre inside the win logo, x as a share of the logo width from its centre') logoShieldX: number = 0.3674;
  @serializeProperty @tooltip('Shield centre inside the win logo, y (up) as a share of the logo height from its centre') logoShieldY: number = 0.1429;
  @serializeProperty @tooltip('Shield height as a share of the win logo height') logoShieldH: number = 0.6851;
  @serializeProperty @tooltip('Fall speed multiplier') @slider(1, 16, 0.5) fallGravityScale: number = 8;

  @header("Advanced — Scene Wiring")
  @serializeProperty itemPool: APJS.SceneObject[] = [];
  @serializeProperty claw: APJS.SceneObject;
  @serializeProperty @tooltip('Claw child that must not stretch with the arms (19 shield)') clawBadge: APJS.SceneObject;
  @serializeProperty @tooltip('Hidden on the intro screen, shown when the round starts') hideOnIntro: APJS.SceneObject[] = [];
  @serializeProperty ground: APJS.SceneObject;
  @serializeProperty nextThumb: APJS.SceneObject;
  @serializeProperty introOverlay: APJS.SceneObject;
  @serializeProperty resultOverlay: APJS.SceneObject;
  @serializeProperty winLogo: APJS.SceneObject;
  @serializeProperty retryButton: APJS.SceneObject;
  @serializeProperty @tooltip('Sad face shown above the logo on a loss') loseIcon: APJS.SceneObject;

  // Layout invariants measured from the built scene.
  private readonly PPU: number = 32;
  private readonly swingCenterX: number = -30;
  private readonly clawTipSpan: number = 169;   // px between the middles of the two arms at scale 1
  private readonly heldTopOffset: number = 69;  // item top sits 41% down the 169px claw (shield peeks above)
  private readonly keepTopY: number = -150;     // tower top is scrolled to stay below this
  private readonly settleSpeed: number = 0.25;  // m/s
  private readonly settleFrames: number = 6;
  private readonly collapseLoseSec: number = 1.0;
  private readonly maxLeanDeg: number = 8;
  private readonly releaseBelowY: number = -760; // floors whose top is below this give their object back

  private inited: boolean = false;
  private startOnInit: boolean = false;
  private state: string = "INTRO";
  private items: TowerItem[] = [];
  private floors: Floor[] = [];
  private held: TowerItem | undefined;
  private falling: TowerItem | undefined;
  private nextTex: APJS.Texture | undefined;
  private sequence: APJS.Texture[] = [];
  private readonly wideMinPx: number = 200;     // on-screen width from which a product counts as a wide base

  // Pivot = bottom-centre of the first floor (screen px); angle = tilt at the top (rad, CCW +).
  private pivotX: number = 0;
  private pivotY: number = 0;
  private angle: number = 0;
  private lean: number = 0;     // degrees
  private swayT: number = 0;

  private clawSt!: APJS.ScreenTransform;
  private clawBaseY: number = 0;
  private clawX: number = 0;
  private clawDir: number = 1;
  private clawScale: number = 1;
  private clawHalfH: number = 0;
  private badgeSt: APJS.ScreenTransform | undefined;
  private groundSt!: APJS.ScreenTransform;
  private groundRb!: APJS.RigidBody2D;
  private groundBaseY: number = 0;
  private nextImg!: APJS.Image;

  private score: number = 0;
  private heldAnim: number = 0;
  private lowFrames: number = 0;
  private endTime: number = 0;
  private resultTime: number = 0;
  private retryDelay: number = 0.8;
  private winAnim: boolean = false;
  private anim: AnimPart[] = [];
  private confetti: ConfettiLayer[] = [];
  private tumbling: TumblePart[] = [];
  private readonly tumbleGravity: number = 1800; // px/s² for the animated collapse
  private readonly dominoStep: number = 0.22;     // s between one floor and the next
  private tumbleSpan: number = 0;                 // s until the lowest floor starts to fall
  private won: boolean = false;
  private readonly finishedShowSec: number = 1.3; // finished tower: shield pulse 0.6s, then its flight into the logo
  private readonly burstSec: number = 0.55;       // the logo bursting out of the shield
  private finItem: TowerItem | undefined;         // the 19 shield on top of the finished tower
  private finX: number = 0;
  private finY: number = 0;
  private finRot: number = 0;

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
    if (!this.claw || !this.ground || this.itemPool.length === 0 || this.easyTextures.length === 0) return false;
    this.clawSt = this.claw.getComponent("ScreenTransform") as APJS.ScreenTransform;
    this.clawBaseY = this.clawSt.anchoredPosition.y;
    this.clawHalfH = this.clawSt.sizeDelta.y / 2;
    if (this.clawBadge) this.badgeSt = this.clawBadge.getComponent("ScreenTransform") as APJS.ScreenTransform;
    this.groundSt = this.ground.getComponent("ScreenTransform") as APJS.ScreenTransform;
    this.groundRb = this.ground.getComponent("RigidBody2D") as APJS.RigidBody2D;
    this.groundBaseY = this.groundSt.anchoredPosition.y;
    if (this.nextThumb) this.nextImg = this.nextThumb.getComponent("Image") as APJS.Image;
    for (const obj of this.itemPool) {
      if (!obj) continue;
      const it = new TowerItem();
      it.obj = obj;
      it.st = obj.getComponent("ScreenTransform") as APJS.ScreenTransform;
      it.rb = obj.getComponent("RigidBody2D") as APJS.RigidBody2D;
      it.col = obj.getComponent("BoxCollider2D") as APJS.BoxCollider2D;
      it.img = obj.getComponent("Image") as APJS.Image;
      this.items.push(it);
    }
    for (const obj of [this.winLogo, this.retryButton, this.loseIcon]) {
      const part = new AnimPart();
      if (obj) {
        part.st = obj.getComponent("ScreenTransform") as APJS.ScreenTransform;
        const p = part.st.anchoredPosition;
        part.baseX = p.x;
        part.baseY = p.y;
      }
      this.anim.push(part);
    }
    // Confetti layers (children of winEffect): the falling pieces slide in, the glow overlay fades in.
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
    this.updateClaw(dt);

    if (this.state === "AIMING" || this.state === "DROPPING") {
      this.updateTower(dt);
      this.checkStability();
    }

    if (this.state === "AIMING") {
      this.updateHeld(dt);
      this.updateScroll(dt);
    } else if (this.state === "DROPPING") {
      this.updateFalling();
    } else if (this.state === "FINISHED") {
      this.endTime += dt;
      this.updateFinale();
      if (this.endTime >= this.finishedShowSec) this.showResult();
    } else if (this.state === "COLLAPSING") {
      this.updateTumble(dt);
      this.endTime += dt;
      if (this.endTime >= this.collapseLoseSec + this.tumbleSpan) this.showResult();
    } else if (this.state === "RESULT") {
      this.resultTime += dt;
      if (this.winAnim) this.updateWinAnim(this.resultTime);
    }
  }

  // ---------- Input / lifecycle ----------
  private onTouch(event: APJS.IEvent): void {
    const t = event.args[0] as APJS.TouchData;
    if (t.phase !== APJS.TouchPhase.Began || !this.inited) return;
    // The round starts from the Record button (onRecordStart), not from a tap.
    if (this.state === "AIMING") this.drop();
    else if (this.state === "RESULT" && this.resultTime > this.retryDelay) { this.resetGame(); this.startGame(); }
  }

  // Pressing Record starts a fresh round.
  private onRecordStart(): void {
    if (!this.inited) { this.startOnInit = true; return; }
    this.resetGame();
    this.startGame();
  }

  private resetGame(): void {
    for (const it of this.items) this.parkItem(it);
    this.floors = [];
    this.tumbling = [];
    this.tumbleSpan = 0;
    this.held = undefined;
    this.falling = undefined;
    this.score = 0;
    this.angle = 0;
    this.lean = 0;
    this.swayT = 0;
    this.sequence = this.buildSequence();
    this.won = false;
    this.finItem = undefined;
    this.clawX = this.swingCenterX;
    this.clawDir = 1;
    this.setGroundY(this.groundBaseY);
    this.nextTex = this.pickTexture(0);
    this.setNextThumb();
    if (this.resultOverlay) this.resultOverlay.setEnabledInHierarchy(false);
    if (this.winEffect) this.winEffect.setEnabledInHierarchy(false);
    this.winAnim = false;
    this.resetAnimParts();
    if (this.introOverlay) this.introOverlay.setEnabledInHierarchy(true);
    this.setIntroHidden(true);
    this.state = "INTRO";
  }

  private startGame(): void {
    if (this.introOverlay) this.introOverlay.setEnabledInHierarchy(false);
    this.setIntroHidden(false);
    this.spawnHeld();
    this.state = "AIMING";
  }

  // The intro screen draws its own claw and tower, so the live claw and HUD wait for Record.
  private setIntroHidden(hidden: boolean): void {
    for (const obj of this.hideOnIntro) if (obj) obj.setEnabledInHierarchy(!hidden);
  }

  // ---------- Claw ----------
  private currentSwingSpeed(): number {
    return Math.min(this.swingSpeed + this.score * this.swingSpeedPerFloor, this.swingSpeedMax);
  }

  private updateClaw(dt: number): void {
    if (this.state !== "RESULT") {
      this.clawX += this.clawDir * this.currentSwingSpeed() * dt;
      const lo = this.swingCenterX - this.swingRange, hi = this.swingCenterX + this.swingRange;
      if (this.clawX > hi) { this.clawX = 2 * hi - this.clawX; this.clawDir = -1; }
      if (this.clawX < lo) { this.clawX = 2 * lo - this.clawX; this.clawDir = 1; }
    }
    // Arms grip the held item's width; open wide when empty.
    const target = this.held ? clamp(this.held.w / this.clawTipSpan, 0.6, 2.4) : 1;
    this.clawScale += (target - this.clawScale) * Math.min(1, dt * 10);
    this.clawSt.anchoredPosition = new APJS.Vector2f(this.clawX, this.clawBaseY);
    this.clawSt.scale = new APJS.Vector2f(this.clawScale, 1);
    if (this.badgeSt) this.badgeSt.scale = new APJS.Vector2f(1 / this.clawScale, 1);
  }

  // ---------- Items ----------
  // One round = the opening products in order, then every other product once in random
  // order with narrow and wide ones alternating (a narrow top is followed by a wide
  // base so the next drop stays fair), then the finale piece.
  private buildSequence(): APJS.Texture[] {
    const all = this.easyTextures.concat(this.mediumTextures, this.hardTextures);
    const rest = all.filter((t) => t && this.openingTextures.indexOf(t) < 0);
    const wide = shuffle(rest.filter((t) => this.scaledWidth(t) >= this.wideMinPx));
    const narrow = shuffle(rest.filter((t) => this.scaledWidth(t) < this.wideMinPx));
    const seq = this.openingTextures.filter((t) => !!t);
    let takeNarrow = narrow.length >= wide.length;
    while (wide.length > 0 || narrow.length > 0) {
      const fromNarrow = narrow.length > 0 && (takeNarrow || wide.length === 0);
      seq.push(fromNarrow ? narrow.pop()! : wide.pop()!);
      takeNarrow = !fromNarrow;
    }
    if (this.finaleTexture) seq.push(this.finaleTexture);
    return seq;
  }

  private pickTexture(floor: number): APJS.Texture {
    if (this.sequence.length === 0) return this.easyTextures[0];
    return this.sequence[Math.min(floor, this.sequence.length - 1)];
  }

  private scaleFor(tex: APJS.Texture): number {
    if (tex === this.finaleTexture) return this.finaleScale;
    const i = this.sizedTextures.indexOf(tex);
    return i >= 0 && i < this.sizedScales.length ? this.sizedScales[i] : this.itemScale;
  }

  private scaledWidth(tex: APJS.Texture): number {
    return (tex.getWidth() > 0 ? tex.getWidth() : 400) * this.scaleFor(tex);
  }

  // A free pool object; when all are busy, the lowest floor that has scrolled far
  // below the screen gives its object back (its data still counts for balance).
  private acquireItem(): TowerItem | undefined {
    for (const it of this.items) if (!it.inUse) return it;
    for (const f of this.floors) {
      if (!f.slot) continue;
      if (f.cy + f.h / 2 > this.releaseBelowY) break;
      const it = f.slot;
      f.slot = undefined;
      this.parkItem(it);
      return it;
    }
    return undefined;
  }

  private spawnHeld(): void {
    const it = this.acquireItem();
    if (!it) return;
    it.inUse = true;
    const tex = this.nextTex ? this.nextTex : this.easyTextures[0];
    const tw = tex.getWidth() > 0 ? tex.getWidth() : 400;
    const th = tex.getHeight() > 0 ? tex.getHeight() : 250;
    const scale = this.scaleFor(tex);
    it.w = tw * scale;
    it.h = th * scale;
    it.img.texture = tex;
    it.st.sizeDelta = new APJS.Vector2f(it.w, it.h);
    it.col.size = new APJS.Vector2f(it.w / this.PPU, it.h / this.PPU);
    this.setStatic(it);
    it.obj.setEnabledInHierarchy(true);
    this.held = it;
    this.heldAnim = 0;
    this.nextTex = this.pickTexture(this.score + 1);
    this.setNextThumb();
    this.updateHeld(0);
  }

  private updateHeld(dt: number): void {
    const it = this.held;
    if (!it) return;
    this.heldAnim = Math.min(1, this.heldAnim + dt / 0.2);
    const k = 1 - Math.pow(1 - this.heldAnim, 3);
    const topY = this.clawBaseY + this.clawHalfH - this.heldTopOffset + (1 - k) * 420;
    this.placeItem(it, this.clawX, topY - it.h / 2, 0);
  }

  private drop(): void {
    const it = this.held;
    if (!it || this.heldAnim < 1) return;
    it.rb.velocity = new APJS.Vector2f(0, 0);
    it.rb.freezeX = true;   // falls straight down and stays where it lands
    it.rb.freezeZ = true;   // no spinning while falling
    it.rb.gravityScale = this.fallGravityScale;
    it.rb.static = false;
    it.rb.useGravity = true;
    this.held = undefined;
    this.falling = it;
    this.lowFrames = 0;
    this.state = "DROPPING";
  }

  private updateFalling(): void {
    const it = this.falling;
    if (!it) return;
    const p = it.rb.position;
    it.x = p.x * this.PPU;
    it.y = p.y * this.PPU;
    if (it.y < -900) { this.showResult(); return; }
    // On a swaying tower the item never fully rests, so land it as soon as it touches
    // the top surface (measured in the top floor's tilted frame).
    const n = this.floors.length;
    if (n > 0) {
      const top = this.floors[n - 1];
      const c = Math.cos(top.a), s = Math.sin(top.a);
      const ox = it.x - top.jx, oy = it.y - top.jy;
      const dx = ox * c + oy * s;
      const dy = -ox * s + oy * c;
      const touching = dy - it.h / 2 <= top.h + 3 && Math.abs(dx) < (top.w + it.w) / 2 - 2;
      if (touching && dy > top.h / 2) { this.onLanded(it); return; }
      if (dy < top.h / 2) { this.showResult(); return; }
    }
    const v = it.rb.velocity;
    if (v.x * v.x + v.y * v.y < this.settleSpeed * this.settleSpeed) this.lowFrames++;
    else this.lowFrames = 0;
    if (this.lowFrames >= this.settleFrames) this.onLanded(it);
  }

  private onLanded(it: TowerItem): void {
    const f = new Floor();
    f.slot = it;
    f.w = it.w;
    f.h = it.h;
    if (this.floors.length === 0) {
      // First item founds the tower: its bottom-centre becomes the pivot.
      this.pivotX = it.x;
      this.pivotY = it.y - it.h / 2;
      this.angle = 0;
      this.swayT = 0;
      f.lx = 0;
      f.ly = it.h / 2;
    } else {
      // Measure the landing in the top floor's own (tilted) frame.
      const top = this.floors[this.floors.length - 1];
      const c = Math.cos(top.a), s = Math.sin(top.a);
      const ox = it.x - top.jx, oy = it.y - top.jy;
      const dx = ox * c + oy * s;
      const dy = -ox * s + oy * c;
      if (dy <= top.h / 2) { this.showResult(); return; }
      f.lx = top.lx + dx;
      if (!this.landingOk(f, top)) { this.topple(it, dx < 0 ? -1 : 1); return; }
      f.ly = top.ly + top.h / 2 + f.h / 2; // sits exactly on the top
    }
    this.setStatic(it); // part of the tower now: moved only by the sway layout
    this.floors.push(f);
    this.falling = undefined;
    this.score++;
    this.layoutTower();
    if (this.score >= this.sequence.length) {
      // The finale piece is on: the tower is complete.
      this.won = true;
      this.endTime = 0;
      this.finItem = it;
      this.finX = it.x;
      this.finY = it.y;
      this.finRot = it.st.rotation;
      this.state = "FINISHED";
      return;
    }
    this.spawnHeld();
    this.state = "AIMING";
  }

  // >= minOverlap of the upper item's width must rest on the lower item; a wider
  // item must also keep its centre over the lower one or it looks impossible.
  private landingOk(up: Floor, low: Floor): boolean {
    const overlap = Math.min(up.lx + up.w / 2, low.lx + low.w / 2) - Math.max(up.lx - up.w / 2, low.lx - low.w / 2);
    if (overlap / up.w < this.minOverlap) return false;
    if (up.w > low.w && Math.abs(up.lx - low.lx) > low.w / 2) return false;
    return true;
  }

  private topple(it: TowerItem, dir: number): void {
    it.rb.freezeX = false;
    it.rb.freezeZ = false;
    it.rb.angularVelocity = -dir * 3;
    it.rb.velocity = new APJS.Vector2f(dir * 2.5, 0);
    // The bad landing shakes the whole tower down with it, toward the same side.
    this.tumbleFloors(0, dir);
    this.endTime = 0;
    this.state = "COLLAPSING";
  }

  // ---------- Tower sway, lean and balance ----------
  // Sway grows with height (px of movement at the top); lean follows the off-centre
  // weight, so a lopsided tower tilts further toward its heavy side.
  private updateTower(dt: number): void {
    const n = this.floors.length;
    if (n === 0) return;
    this.swayT += dt;
    const top = this.floors[n - 1];
    const height = Math.max(1, top.ly + top.h / 2);
    const swayPx = clamp((n - this.swayStartFloor) * this.swayPerFloor, 0, this.swayMax);
    const swayDeg = Math.asin(clamp(swayPx / height, 0, 0.5)) * 180 / Math.PI * Math.sin(this.swayT * this.swaySpeed);
    const com = this.centerOfMass(0);
    const targetLean = clamp(-com.x * this.leanPerPx, -this.maxLeanDeg, this.maxLeanDeg);
    this.lean += (targetLean - this.lean) * Math.min(1, dt * 3);
    this.angle = (swayDeg + this.lean) * Math.PI / 180;
    this.layoutTower();
  }

  // Draw the stack as a bending chain: floor i tilts by angle * i/(n-1), so the base
  // stays flat on the ground and the top leans the most.
  private layoutTower(): void {
    const n = this.floors.length;
    let jx = this.pivotX, jy = this.pivotY;
    for (let i = 0; i < n; i++) {
      const f = this.floors[i];
      f.a = n > 1 ? this.angle * i / (n - 1) : 0;
      if (i > 0) {
        const p = this.floors[i - 1];
        const dx = f.lx - p.lx;
        jx = p.jx + dx * Math.cos(p.a) - p.h * Math.sin(p.a);
        jy = p.jy + dx * Math.sin(p.a) + p.h * Math.cos(p.a);
      }
      f.jx = jx;
      f.jy = jy;
      f.cx = jx - (f.h / 2) * Math.sin(f.a);
      f.cy = jy + (f.h / 2) * Math.cos(f.a);
      if (f.slot) this.placeItem(f.slot, f.cx, f.cy, f.a);
    }
  }

  // Each floor must carry the centre of mass of everything above it. The lean (from
  // off-centre weight) adds a sideways shift that grows with how high that mass sits.
  // The sway is visual only: it never knocks over a tower that was stacked well.
  private checkStability(): void {
    const n = this.floors.length;
    if (n < 2) return;
    const s = Math.sin(this.lean * Math.PI / 180);
    for (let i = 1; i < n; i++) {
      const low = this.floors[i - 1];
      const com = this.centerOfMass(i);
      const x = com.x - (com.y - (low.ly + low.h / 2)) * s;
      if (x < low.lx - low.w / 2 || x > low.lx + low.w / 2) {
        this.collapse(x > low.lx ? 1 : -1);
        return;
      }
    }
    const base = this.floors[0];
    const all = this.centerOfMass(0);
    const gx = all.x - all.y * s;
    if (gx < base.lx - base.w / 2 || gx > base.lx + base.w / 2) this.collapse(gx > 0 ? 1 : -1);
  }

  private centerOfMass(from: number): APJS.Vector2f {
    let m = 0, x = 0, y = 0;
    for (let i = from; i < this.floors.length; i++) {
      const f = this.floors[i];
      const a = f.w * f.h;
      m += a; x += f.lx * a; y += f.ly * a;
    }
    return m > 0 ? new APJS.Vector2f(x / m, y / m) : new APJS.Vector2f(0, 0);
  }

  // Losing balance anywhere brings the whole tower down toward the heavy side.
  private collapse(dir: number): void {
    this.tumbleFloors(0, dir);
    if (this.held) this.held.obj.setEnabledInHierarchy(false);
    this.endTime = 0;
    this.state = "COLLAPSING";
  }

  // Floors stay static bodies (the engine ignores static -> dynamic switches mid-game),
  // so the fall is animated here like dominoes: the top floor tips first, then each
  // floor below follows one beat later. Floors already scrolled below the screen
  // fall together with the lowest visible one, so the player never waits on them.
  private tumbleFloors(from: number, dir: number): void {
    const n = this.floors.length;
    this.tumbleSpan = 0;
    let beat = 0;
    for (let i = n - 1; i >= from; i--) {
      const f = this.floors[i];
      if (!f.slot) continue;
      const k = (i - from + 1) / Math.max(1, n - from); // 0..1, low -> high
      const p = new TumblePart();
      p.it = f.slot;
      p.x = f.slot.x;
      p.y = f.slot.y;
      p.rot = f.a;
      p.vx = dir * (140 + 80 * k);
      p.vy = 60 + 100 * k;
      p.spin = -dir * (2 + 1.5 * k);
      p.delay = beat * this.dominoStep;
      if (f.cy + f.h / 2 > -640) beat++; // still on screen: the next one waits a beat
      this.tumbleSpan = Math.max(this.tumbleSpan, p.delay);
      this.tumbling.push(p);
    }
  }

  private updateTumble(dt: number): void {
    for (const p of this.tumbling) {
      if (p.delay > 0) { p.delay -= dt; continue; }
      p.vy -= this.tumbleGravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
      if (p.y > -1400) this.placeItem(p.it, p.x, p.y, p.rot);
    }
  }

  // Keep the drop gap visible: slide the tower + ground down as it grows.
  private updateScroll(dt: number): void {
    const n = this.floors.length;
    if (n === 0) return;
    const top = this.floors[n - 1];
    const over = top.cy + top.h / 2 - this.keepTopY;
    if (over < 0.5) return;
    const step = over * Math.min(1, dt * 4);
    this.pivotY -= step;
    this.setGroundY(this.groundSt.anchoredPosition.y - step);
    this.layoutTower();
  }

  private placeItem(it: TowerItem, x: number, y: number, rot: number): void {
    it.x = x;
    it.y = y;
    it.st.anchoredPosition = new APJS.Vector2f(x, y);
    it.st.rotation = rot * 180 / Math.PI;
    it.rb.position = new APJS.Vector2f(x / this.PPU, y / this.PPU);
    it.rb.rotation = rot;
  }

  private setStatic(it: TowerItem): void {
    it.rb.static = true;
    it.rb.useGravity = false;
    it.rb.freezeX = false;
    it.rb.freezeZ = false;
    it.rb.velocity = new APJS.Vector2f(0, 0);
    it.rb.angularVelocity = 0;
    it.rb.rotation = 0;
    it.st.rotation = 0;
  }

  private parkItem(it: TowerItem): void {
    this.setStatic(it);
    it.st.scale = new APJS.Vector2f(1, 1);
    this.placeItem(it, 0, -1400, 0);
    it.obj.setEnabledInHierarchy(false);
    it.inUse = false;
  }

  private setGroundY(y: number): void {
    this.groundSt.anchoredPosition = new APJS.Vector2f(this.groundSt.anchoredPosition.x, y);
    if (this.groundRb) this.groundRb.position = new APJS.Vector2f(this.groundSt.anchoredPosition.x / this.PPU, y / this.PPU);
  }

  // ---------- UI ----------
  private setNextThumb(): void {
    if (this.nextImg && this.nextTex) this.nextImg.texture = this.nextTex;
  }

  // Final frame (client): a win shows only the MEGA MAMAMY 19 logo bursting out of the 19 shield,
  // with confetti; a loss drops the logo in under a sad face, with PLAY AGAIN and no confetti.
  // Tapping after retryDelay plays again either way.
  private showResult(): void {
    this.state = "RESULT";
    this.resultTime = 0;
    if (this.held) this.parkItem(this.held); // don't leave an item hanging behind the result screen
    this.held = undefined;
    if (this.resultOverlay) this.resultOverlay.setEnabledInHierarchy(true);
    if (this.winEffect) this.winEffect.setEnabledInHierarchy(this.won);
    if (this.retryButton) this.retryButton.setEnabledInHierarchy(!this.won);
    if (this.loseIcon) this.loseIcon.setEnabledInHierarchy(!this.won);
    this.winAnim = true;
    this.retryDelay = this.won ? 1.3 : 0.8;
    this.updateWinAnim(0);
  }

  // The shield on top of the finished tower pulses, then flies (spinning) to the shield's spot in the
  // win logo, growing to the logo's shield size. Only its picture moves; the tower is done.
  private updateFinale(): void {
    const it = this.finItem;
    if (!it) return;
    const t = this.endTime;
    if (t < 0.6) {
      const p = 1 + 0.12 * Math.sin(seg(t, 0, 0.6) * Math.PI * 2);
      it.st.scale = new APJS.Vector2f(p, p);
      return;
    }
    const k = easeInOutQ(seg(t, 0.6, this.finishedShowSec));
    const tx = this.logoShieldPosX(), ty = this.logoShieldPosY(), toS = this.logoShieldScale(it);
    const sc = 1 + (toS - 1) * k;
    it.st.anchoredPosition = new APJS.Vector2f(this.finX + (tx - this.finX) * k, this.finY + (ty - this.finY) * k + Math.sin(k * Math.PI) * 120);
    it.st.scale = new APJS.Vector2f(Math.max(0.001, sc), Math.max(0.001, sc));
    it.st.rotation = this.finRot * (1 - k) + 360 * k;
  }

  private logoShieldPosX(): number {
    const lp = this.anim[0];
    return lp.baseX + this.logoShieldX * (lp.st ? lp.st.sizeDelta.x : 0);
  }

  private logoShieldPosY(): number {
    const lp = this.anim[0];
    return lp.baseY + this.logoShieldY * (lp.st ? lp.st.sizeDelta.y : 0);
  }

  private logoShieldScale(it: TowerItem): number {
    const lp = this.anim[0];
    return this.logoShieldH * (lp.st ? lp.st.sizeDelta.y : it.h) / Math.max(it.h, 1);
  }

  // Result entrance: the logo arrives, then the retry button pops and keeps a gentle pulse.
  private updateWinAnim(t: number): void {
    // Confetti slides down from above the screen and eases to rest over ~1.2s.
    const kIn = seg(t, 0, 1.2);
    const slideK = 1 - Math.pow(1 - kIn, 3);
    for (const layer of this.confetti) {
      if (layer.slide) {
        layer.st.anchoredPosition = new APJS.Vector2f(layer.st.anchoredPosition.x, layer.baseY + (1 - slideK) * 1280);
        layer.img.opacity = seg(t, 0, 0.4);
      } else {
        layer.img.opacity = seg(t, 0, 1.0);
      }
    }
    const logo = this.anim[0], btn = this.anim[1], sad = this.anim[2];
    if (this.won && this.finItem && logo.st) {
      // The logo grows out of the shield: the shield's spot in the logo stays put while it scales.
      const ax = this.logoShieldX * logo.st.sizeDelta.x, ay = this.logoShieldY * logo.st.sizeDelta.y;
      let sl = Math.max(0.001, easeOutBack(seg(t, 0, this.burstSec)));
      if (t > this.burstSec + 0.3) sl = 1 + 0.03 * Math.sin((t - this.burstSec - 0.3) * 3);
      this.setPart(logo, ax - ax * sl, ay - ay * sl, sl);
      const it = this.finItem;
      const pop = this.logoShieldScale(it) * (1 + 0.15 * Math.sin(seg(t, 0, this.burstSec * 0.8) * Math.PI));
      it.st.scale = new APJS.Vector2f(pop, pop);
      it.obj.setEnabledInHierarchy(t < this.burstSec * 0.8);
    } else {
      const kLogo = easeOutBack(seg(t, 0, 0.5));
      this.setPart(logo, 0, (1 - kLogo) * 320, 0.6 + 0.4 * kLogo);
    }
    const kBtn = easeOutBack(seg(t, 0.6, 1.0));
    this.setPart(btn, 0, 0, t > 1.0 ? 1 + 0.05 * Math.sin((t - 1.0) * 5) : kBtn);
    this.setPart(sad, 0, 0, easeOutBack(seg(t, 0.3, 0.7)));
  }

  private setPart(part: AnimPart, dx: number, dy: number, scale: number): void {
    if (!part.st) return;
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

class TowerItem {
  obj!: APJS.SceneObject;
  st!: APJS.ScreenTransform;
  rb!: APJS.RigidBody2D;
  col!: APJS.BoxCollider2D;
  img!: APJS.Image;
  inUse: boolean = false;
  w: number = 0;
  h: number = 0;
  x: number = 0;
  y: number = 0;
}

// One storey. lx/ly: straight-stack centre (balance maths). jx/jy: bottom-centre on screen,
// cx/cy: centre on screen, a: tilt (rad) from the bending layout. `slot` is the pool object
// drawing it; floors far below the screen drop their slot but keep counting for balance.
class Floor {
  slot: TowerItem | undefined;
  lx: number = 0;
  ly: number = 0;
  w: number = 0;
  h: number = 0;
  jx: number = 0;
  jy: number = 0;
  cx: number = 0;
  cy: number = 0;
  a: number = 0;
}

class TumblePart {
  it!: TowerItem;
  x: number = 0;
  y: number = 0;
  rot: number = 0;
  vx: number = 0;
  vy: number = 0;
  spin: number = 0;
  delay: number = 0;
}

class ConfettiLayer {
  st!: APJS.ScreenTransform;
  img!: APJS.Image;
  baseY: number = 0;
  slide: boolean = true;
}

class AnimPart {
  st!: APJS.ScreenTransform;
  baseX: number = 0;
  baseY: number = 0;
}

function seg(t: number, a: number, b: number): number {
  return clamp((t - a) / (b - a), 0, 1);
}

function easeOutBack(x: number): number {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
  return arr;
}

function clamp(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v));
}

function easeInOutQ(k: number): number {
  return k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
}
