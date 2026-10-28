/**
 * MamamyFaceCopy — "Copy the baby face" as an expression roulette with photo capture
 * (client feedback 2026-10-09, reference: the TikTok "emoji imitation" filter).
 *
 * All twelve emoji (eleven baby faces + the 19 shield) ride a ring around the player's face and
 * follow it (face tracking). The ring spins, slows down and stops with a random emoji at the top
 * (12 o'clock): the others shrink away, the chosen one jumps onto the player's head and a polaroid
 * frame appears around the face. Making that expression and holding it for holdSec takes a photo:
 * a flash, the polaroid freezes with the player's face (camera capture) and flies up to be pinned
 * in a row at the top of the screen; then the ring comes back and spins again. A round is
 * roundCards random faces and then the 19 shield (laugh-squint emoji). The shield photo ends the
 * round: the shield flips to the plain 19 shield, flies to the shield's spot in the MEGA MAMAMY 19
 * logo and the logo bursts out of it, while the seven photos gather in a grid on the upper half
 * (FINALE → RESULT). No timer, no losing: the emoji waits until the player makes the face.
 *
 * Expression classes (index order used everywhere): 0 tongue / open mouth, 1 pout (kiss),
 * 2 wink, 3 sad, 4 angry, 5 smile / grin, 6 laugh / eyes-shut smile; -1 = none of them.
 * Classification uses documented face tracking only (106 landmarks + expression attributes):
 *   eye openness = eyelid gap / eye width against the player's own open-eye baseline,
 *   mouth openness = inner-lip gap / mouth width, mouth-corner drop against the resting mouth,
 *   mouth width / face width against the resting mouth (pout = lips pushed together),
 *   inner-brow height over the eyes against the resting brows (angry = brows pulled down),
 *   happyScore (0-100), the Angry and Sad probabilities and the tracker's pout / one-eye blink actions.
 *
 * Photos: APJS.CaptureFrameHelper copies the 3D Camera's render texture (it renders first, so the
 * copy is the camera feed without our UI) cropped to the polaroid's photo window (fixed in the middle of the screen). One capture per
 * photo, at most roundCards + 1 per round, dropped on restart.
 *
 * Flow: INTRO → press TikTok Record (or tap RECORD TO PLAY) → SPIN → LAND → MATCH → SNAP → SPIN … →
 *       FINALE → RESULT (photos + logo + confetti, no PLAY AGAIN) → tap (or Record again).
 * Poses are screen-space centres (720x1280, origin at the centre, y up).
 */
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

// One pinned polaroid: the root image is the photo, children are the frame and the small emoji.
class Pin {
  obj: APJS.SceneObject;
  st: APJS.ScreenTransform;
  photo: APJS.Image;
  emoji: APJS.Image | undefined;
  emojiSt: APJS.ScreenTransform | undefined;
  fromX: number = 0; fromY: number = 0; fromS: number = 1; fromR: number = 0;
  toX: number = 0; toY: number = 0; toS: number = 1; toR: number = 0;
  t: number = -1;
  sec: number = 0;
  delay: number = 0;
  constructor(obj: APJS.SceneObject) {
    this.obj = obj;
    this.st = obj.getComponent("ScreenTransform") as APJS.ScreenTransform;
    this.photo = obj.getComponent("Image") as APJS.Image;
    for (const c of obj.getChildren()) {
      if (c.name.indexOf("Emoji") < 0) continue;
      this.emoji = c.getComponent("Image") as APJS.Image;
      this.emojiSt = c.getComponent("ScreenTransform") as APJS.ScreenTransform;
    }
  }
}

class RingSlot {
  obj: APJS.SceneObject;
  st: APJS.ScreenTransform;
  img: APJS.Image;
  constructor(obj: APJS.SceneObject) {
    this.obj = obj;
    this.st = obj.getComponent("ScreenTransform") as APJS.ScreenTransform;
    this.img = obj.getComponent("Image") as APJS.Image;
  }
}

// The editor may hand SceneObject array entries over as the object's ScreenTransform: use its owner.
function asObject(ref: any): APJS.SceneObject | undefined {
  if (!ref) return undefined;
  if (ref.getComponent) return ref as APJS.SceneObject;
  return ref.getSceneObject ? ref.getSceneObject() as APJS.SceneObject : undefined;
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
  @serializeProperty @tooltip('Roulette emoji; the LAST one is the 19 shield that ends every round') emojiTextures: APJS.Texture[] = [];
  @serializeProperty @tooltip('Expression class each emoji asks for, same order (0 tongue, 1 pout, 2 wink, 3 sad, 4 angry, 5 smile, 6 laugh)') emojiClass: number[] = [];
  @serializeProperty @tooltip('Plain 19 shield the shield emoji turns into at the finale') shieldPlainTex: APJS.Texture;
  @serializeProperty @tooltip('Random emoji before the shield') @spinBox(1, 10, 1) roundCards: number = 6;
  @serializeProperty @tooltip('Result logo width (px)') @slider(300, 700, 5) logoW: number = 560;
  @serializeProperty @tooltip('Shield centre inside the logo, x as a share of the logo width from its centre') logoShieldX: number = 0.3674;
  @serializeProperty @tooltip('Shield centre inside the logo, y (up) as a share of the logo height from its centre') logoShieldY: number = 0.1429;
  @serializeProperty @tooltip('Shield height as a share of the logo height') logoShieldH: number = 0.6851;

  @header("Gameplay Tuning")
  @serializeProperty @tooltip('Hold the right expression this long to take the photo (s)') @slider(0.1, 2, 0.05) holdSec: number = 0.5;
  @serializeProperty @tooltip('Roulette spin before it lands (s)') @slider(0.3, 3, 0.05) spinSec: number = 1.2;
  @serializeProperty @tooltip('Photo flies to its pin (s)') @slider(0.3, 2, 0.05) snapSec: number = 0.9;
  @serializeProperty @tooltip('Eye counts as closed below this share of the player own open-eye size') @slider(0.2, 0.9, 0.01) eyeClosedRatio: number = 0.6;
  @serializeProperty @tooltip('Mouth counts as open above this openness (lip gap / mouth width)') @slider(0.03, 0.5, 0.01) mouthOpen: number = 0.12;
  @serializeProperty @tooltip('happyScore (0-100) that counts as a smile') @slider(10, 100, 1) smileHappy: number = 45;
  @serializeProperty @tooltip('An open mouth this happy counts as laughing (smile), not tongue-out') @slider(10, 100, 1) laughHappy: number = 70;
  @serializeProperty @tooltip('Sad probability (0-1) that counts as sad') @slider(0.05, 0.9, 0.01) sadProb: number = 0.25;
  @serializeProperty @tooltip('Angry probability (0-1) that counts as angry') @slider(0.05, 0.9, 0.01) angryProb: number = 0.3;
  @serializeProperty @tooltip('Angry: inner brows lowered by this share of their resting height over the eyes') @slider(0.03, 0.5, 0.01) browDrop: number = 0.15;
  @serializeProperty @tooltip('Pout: mouth narrower than this share of the resting mouth width') @slider(0.5, 0.98, 0.01) poutWidth: number = 0.85;
  @serializeProperty @tooltip('Wink: the more-shut eye is below this share of the other eye') @slider(0.3, 0.95, 0.01) winkRatio: number = 0.7;
  @serializeProperty @tooltip('Sad: mouth corners dropped by this much (share of mouth width) below the resting mouth') @slider(0.005, 0.1, 0.001) frownDrop: number = 0.02;
  @serializeProperty @tooltip('A new expression must last this long before it counts (s)') @slider(0, 0.5, 0.01) mirrorDelay: number = 0.12;
  @serializeProperty @tooltip('Demo video autoplay (starts itself): 0 off, 1 matches each emoji, 2 tries a wrong face first, then matches') @spinBox(0, 2, 1) demoMode: number = 0;
  @serializeProperty @tooltip('Phone test only: show the classifier readings at the top of the screen') showDebug: boolean = false;
  @serializeProperty @tooltip('Tuning only: write the classifier readings to the console 4x per second') logReadings: boolean = false;

  @header("Advanced — Scene Wiring")
  @serializeProperty @tooltip('3D Camera: it renders the camera feed first, the photos copy its output') cameraObject: APJS.SceneObject;
  @serializeProperty @tooltip('Polaroid frame around the face (transparent photo window)') polaroid: APJS.SceneObject;
  @serializeProperty @tooltip('Roulette emoji on the frame top edge') badge: APJS.SceneObject;
  @serializeProperty @tooltip('White disc behind the roulette emoji') badgeBack: APJS.SceneObject;
  @serializeProperty @tooltip('Hold bar track and fill in the frame bottom strip') holdTrack: APJS.SceneObject;
  @serializeProperty holdFill: APJS.SceneObject;
  @serializeProperty @tooltip('Ring of emoji around the face, same order as emojiTextures') ringSlots: APJS.SceneObject[] = [];
  @serializeProperty @tooltip('Pinned photos, in shot order (root image = photo, children = frame + emoji)') pins: APJS.SceneObject[] = [];
  @serializeProperty @tooltip('White full-screen flash for the photo') flash: APJS.SceneObject;
  @serializeProperty introOverlay: APJS.SceneObject;
  @serializeProperty introButton: APJS.SceneObject;
  @serializeProperty resultOverlay: APJS.SceneObject;
  @serializeProperty winEffect: APJS.SceneObject;
  @serializeProperty resultLogo: APJS.SceneObject;
  @serializeProperty @tooltip('Soft white glow drawn under the result logo; follows it') logoGlow: APJS.SceneObject;
  @serializeProperty @tooltip('2D Text used by showDebug') debugText: APJS.SceneObject;

  private readonly NAMES: string[] = ["TONGUE", "POUT", "WINK", "SAD", "ANGRY", "SMILE", "LAUGH"];
  private readonly CLASSES: number = 7;
  // Polaroid: frame 500x600 centred at FRAME_Y, photo window 440x470 (30 px border, 100 px strip).
  private readonly FRAME_Y: number = 40;
  private readonly PHOTO_W: number = 440;
  private readonly PHOTO_H: number = 470;
  private readonly PHOTO_Y: number = 75;           // photo window centre
  private readonly BADGE_Y: number = 318;          // chosen emoji centre, on the frame's top edge
  private readonly BADGE_H: number = 160;
  private readonly LAND_SEC: number = 0.8;
  private readonly SHIELD_H: number = 200;
  private readonly HOLD_W: number = 380;
  // Pinned row at the top (frame centres), and the result grid on the upper half.
  private readonly ROW_Y: number = 505;
  private readonly ROW_DX: number = 86;
  private readonly ROW_S: number = 0.16;
  private readonly GRID_S: number = 0.3;
  private readonly TILT: number[] = [-5, 4, -3, 5, -4, 3, -2];
  private readonly retryDelay: number = 1.3;
  private readonly burstSec: number = 0.55;
  private logoH: number = 220;

  private inited: boolean = false;
  private startOnInit: boolean = false;
  private state: string = "INTRO";
  private stateT: number = 0;
  private t: number = 0;
  private order: number[] = [];
  private step: number = 0;
  private camera: APJS.Camera | undefined;
  private pinViews: Pin[] = [];
  private badgeSt!: APJS.ScreenTransform;
  private badgeImg!: APJS.Image;
  private fillSt: APJS.ScreenTransform | undefined;
  private flashImg: APJS.Image | undefined;
  private flashT: number = -1;
  private ringViews: RingSlot[] = [];
  private ringAng: number = 0;       // angle of emoji 0 on the ring (rad, 0 = right, CCW)
  private ringFrom: number = 0;
  private ringTo: number = 0;
  private landX: number = 0;
  private landY: number = 0;
  private finX: number = 0;
  private finY: number = 0;
  // tracked face (screen units), smoothed; defaults = a face in the middle
  private faceX: number = 0;
  private faceY: number = 120;
  private faceW: number = 270;
  private faceH: number = 265;
  private landT: number = -1;        // emoji pop after the roulette lands
  private gathered: boolean = false; // photos sent to the result grid
  private anim: AnimPart[] = [];
  private confetti: ConfettiLayer[] = [];

  // Classifier state
  private seen: number = -1;         // expression currently read (-1 = none)
  private candidate: number = -1;
  private candidateT: number = 0;
  private holdT: number = 0;
  private eyeL: number = 0.22;
  private eyeR: number = 0.22;
  private open: number = 0;
  private happy: number = 0;
  private sad: number = 0;
  private angry: number = 0;
  private tongueBs: number = -1;
  private hasFace: boolean = false;
  private eyeBase: number = 0.2;     // player's open-eye openness: rises fast, sinks slowly
  private curve: number = 0;         // mouth-corner drop: + = corners below the lip centre (frown)
  private curveBase: number = -0.04; // player's resting mouth, learned while the face is calm
  private width: number = 0.4;       // mouth width / face width
  private widthBase: number = 0;     // resting mouth width (0 = not learned yet)
  private brow: number = 0.5;        // inner-brow height over the eyes / eye width
  private browBase: number = 0;      // resting brows (0 = not learned yet)
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
    if (!this.badge || !this.polaroid || this.pins.length < 2 || this.ringSlots.length < 2 || this.emojiTextures.length < 2 ||
        this.emojiClass.length < this.emojiTextures.length) return false;
    this.camera = this.cameraObject ? this.cameraObject.getComponent("Camera") as APJS.Camera : undefined;
    for (const ref of this.pins) {
      const obj = asObject(ref);
      if (obj) this.pinViews.push(new Pin(obj));
    }
    for (let i = 0; i < this.ringSlots.length && i < this.emojiTextures.length; i++) {
      const obj = asObject(this.ringSlots[i]);
      if (!obj) continue;
      const r = new RingSlot(obj);
      r.img.texture = this.emojiTextures[i];
      this.ringViews.push(r);
    }
    this.badgeSt = this.badge.getComponent("ScreenTransform") as APJS.ScreenTransform;
    this.badgeImg = this.badge.getComponent("Image") as APJS.Image;
    if (this.badgeBack) this.badgeBack.setEnabledInHierarchy(false);   // not used by the ring design
    if (this.holdFill) this.fillSt = this.holdFill.getComponent("ScreenTransform") as APJS.ScreenTransform;
    if (this.flash) this.flashImg = this.flash.getComponent("Image") as APJS.Image;
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
    this.updateSeen(dt);
    this.updatePins(dt);
    this.updateFlash(dt);

    if (this.state === "INTRO") {
      this.setPart(this.anim[1], 0, 0, 1 + 0.05 * Math.sin(this.t * 5));
      if (this.demoMode > 0 && this.stateT >= 3.5) this.startGame();
    } else if (this.state === "SPIN") {
      this.updateSpin();
    } else if (this.state === "LAND") {
      this.updateLand();
    } else if (this.state === "MATCH") {
      this.holdT = this.seen === this.targetClass() ? this.holdT + dt : Math.max(0, this.holdT - dt * 2);
      if (this.holdT >= this.holdSec) this.snap();
    } else if (this.state === "SNAP") {
      if (this.stateT >= this.snapSec) this.nextEmoji();
    } else if (this.state === "FINALE") {
      this.updateFinale();
    } else if (this.state === "RESULT") {
      this.updateResultAnim(this.stateT);
    }
    this.updateBadge(dt);
    this.updateHoldBar();
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
    this.flashT = -1;
    this.landT = -1;
    for (const p of this.pinViews) {
      p.obj.setEnabledInHierarchy(false);
      p.t = -1;
    }
    this.setPolaroid(0);
    this.badge.setEnabledInHierarchy(false);
    for (const r of this.ringViews) r.obj.setEnabledInHierarchy(false);
    if (this.flash) this.flash.setEnabledInHierarchy(false);
    if (this.resultOverlay) this.resultOverlay.setEnabledInHierarchy(false);
    if (this.winEffect) this.winEffect.setEnabledInHierarchy(false);
    this.resetAnimParts();
    if (this.introOverlay) this.introOverlay.setEnabledInHierarchy(true);
    this.setState("INTRO");
  }

  private startGame(): void {
    if (this.introOverlay) this.introOverlay.setEnabledInHierarchy(false);
    console.log("MamamyFaceCopy order " + this.order.map((i) => i + ":" + this.NAMES[this.emojiClass[i]]).join(","));
    this.startSpin();
  }

  private setState(s: string): void {
    this.state = s;
    this.stateT = 0;
  }

  // roundCards random emoji (never two of the same class in a row, while possible), then the shield.
  private pickOrder(): number[] {
    const shield = this.emojiTextures.length - 1;
    const pool: number[] = [];
    for (let i = 0; i < shield; i++) pool.push(i);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp;
    }
    const out: number[] = [];
    const n = Math.min(this.roundCards, shield, this.pinViews.length - 1);
    while (out.length < n && pool.length > 0) {
      const last = out.length > 0 ? this.emojiClass[out[out.length - 1]] : -1;
      let k = pool.findIndex((c) => this.emojiClass[c] !== last);
      if (k < 0) k = 0;
      out.push(pool.splice(k, 1)[0]);
    }
    out.push(shield);
    return out;
  }

  private targetClass(): number {
    return this.emojiClass[this.order[this.step]];
  }

  private isShieldStep(): boolean {
    return this.order[this.step] === this.emojiTextures.length - 1;
  }

  // ---------- Roulette ----------
  // All emoji (the shield too) ride a ring around the player's face and follow it. The ring
  // spins, slows down and stops with the chosen emoji at the top (12 o'clock).
  private startSpin(): void {
    this.holdT = 0;
    const n = this.ringViews.length, step = 2 * Math.PI / Math.max(n, 1);
    const a0 = this.ringAng % (2 * Math.PI);
    let target = Math.PI / 2 - this.order[this.step] * step;
    while (target < a0 + 4 * Math.PI) target += 2 * Math.PI;
    this.ringFrom = a0;
    this.ringTo = target;
    this.ringAng = a0;
    this.badge.setEnabledInHierarchy(false);
    this.setPolaroid(0);
    this.setState("SPIN");
  }

  private updateSpin(): void {
    const k = seg(this.stateT, 0, this.spinSec);
    this.ringAng = this.ringFrom + (this.ringTo - this.ringFrom) * (1 - Math.pow(1 - k, 3));
    this.placeRing(seg(this.stateT, 0, 0.3), -1, 1);
    if (k >= 1) this.land();
  }

  // The chosen emoji pops at the top of the ring, the others shrink away into the face.
  private land(): void {
    const i = this.order[this.step];
    this.showEmoji(i);
    const p = this.ringPos(i);
    this.landX = p[0];
    this.landY = p[1];
    this.badgeSt.anchoredPosition = new APJS.Vector2f(p[0], p[1]);
    this.badge.setEnabledInHierarchy(true);
    this.holdT = 0;
    this.setState("LAND");
  }

  private updateLand(): void {
    const t = this.stateT;
    this.placeRing(1 - seg(t, 0, 0.3), this.order[this.step], 1 - seg(t, 0, 0.3) * 0.6);
    this.setPolaroid(seg(t, 0.3, this.LAND_SEC));
    if (t >= this.LAND_SEC) {
      for (const r of this.ringViews) r.obj.setEnabledInHierarchy(false);
      this.landT = 0;
      this.setState("MATCH");
    }
  }

  // Ring slot centre (screen) for emoji i at the current ring angle.
  private ringPos(i: number): number[] {
    const n = this.ringViews.length;
    const a = this.ringAng + i * 2 * Math.PI / Math.max(n, 1);
    const rx = clamp(this.faceW * 0.78, 130, 270), ry = clamp(this.faceH * 0.98, 150, 330);
    return [this.faceX + rx * Math.cos(a), this.faceY + ry * Math.sin(a)];
  }

  // Shows the ring: show = 0..1 appear, skip = the emoji that left the ring (-1 none),
  // pull = 1 at the ring, < 1 shrinks toward the face centre.
  private placeRing(show: number, skip: number, pull: number): void {
    const size = clamp(this.faceW * 0.38, 80, 115);
    for (let i = 0; i < this.ringViews.length; i++) {
      const r = this.ringViews[i];
      const on = i !== skip && show > 0.001;
      r.obj.setEnabledInHierarchy(on);
      if (!on) continue;
      const p = this.ringPos(i);
      const a = this.ringAng + i * 2 * Math.PI / this.ringViews.length;
      const top = Math.pow(Math.max(0, Math.sin(a)), 12);   // the one passing 12 o'clock grows
      const sc = easeOutBack(show) * (1 + 0.35 * top) * (0.4 + 0.6 * pull);
      r.st.anchoredPosition = new APJS.Vector2f(this.faceX + (p[0] - this.faceX) * pull, this.faceY + (p[1] - this.faceY) * pull);
      const tex = r.img.texture;
      const k = i === this.ringViews.length - 1 ? 1.25 : 1;   // the shield is a bit bigger
      r.st.sizeDelta = new APJS.Vector2f(size * k * tex.getWidth() / Math.max(tex.getHeight(), 1), size * k);
      r.st.scale = new APJS.Vector2f(Math.max(0.001, sc), Math.max(0.001, sc));
      r.img.opacity = clamp(show * 1.5, 0, 1);
    }
  }

  private setPolaroid(a: number): void {
    const on = a > 0.001;
    this.polaroid.setEnabledInHierarchy(on);
    if (this.holdTrack) this.holdTrack.setEnabledInHierarchy(on);
    if (this.holdFill) this.holdFill.setEnabledInHierarchy(on);
    if (!on) return;
    const s = 0.9 + 0.1 * easeOutBack(a);
    for (const obj of [this.polaroid, this.holdTrack, this.holdFill]) {
      if (!obj) continue;
      const img = obj.getComponent("Image") as APJS.Image;
      if (img) img.opacity = a;
    }
    const st = this.polaroid.getComponent("ScreenTransform") as APJS.ScreenTransform;
    st.scale = new APJS.Vector2f(s, s);
  }

  private showEmoji(i: number): void {
    const tex = this.emojiTextures[i];
    this.badgeImg.texture = tex;
    const shield = i === this.emojiTextures.length - 1;
    const h = shield ? this.SHIELD_H : this.BADGE_H;
    this.badgeSt.sizeDelta = new APJS.Vector2f(h * tex.getWidth() / Math.max(tex.getHeight(), 1), h);
  }

  // Stuck on the polaroid's top edge, over the photo window's top border (as in the reference).
  private headPos(): number[] {
    return [0, this.BADGE_Y];
  }

  // LAND: pops at the ring top, then flies onto the frame's top edge. MATCH / SNAP: stays there,
  // gently bobbing, swelling while the right face is held.
  private updateBadge(dt: number): void {
    if (this.state !== "LAND" && this.state !== "MATCH" && this.state !== "SNAP") return;
    const h = this.headPos();
    let x = h[0], y = h[1], s = 1, rot = 0;
    if (this.state === "LAND") {
      const k = easeInOut(seg(this.stateT, 0.25, this.LAND_SEC));
      x = this.landX + (h[0] - this.landX) * k;
      y = this.landY + (h[1] - this.landY) * k;
      s = 0.7 + 0.3 * k + 0.5 * Math.sin(seg(this.stateT, 0, 0.3) * Math.PI);
    } else {
      y += 3 * Math.sin(this.t * 3);
      rot = 3 * Math.sin(this.t * 2.2);
      s = 1 + 0.12 * clamp(this.holdT / this.holdSec, 0, 1);
    }
    if (this.landT >= 0) {
      this.landT += dt;
      const k = seg(this.landT, 0, 0.35);
      s *= 1 + 0.15 * Math.sin(k * Math.PI);
      if (k >= 1) this.landT = -1;
    }
    this.badgeSt.anchoredPosition = new APJS.Vector2f(x, y);
    this.badgeSt.scale = new APJS.Vector2f(s, s);
    this.badgeSt.rotation = rot;
  }

  private updateHoldBar(): void {
    if (!this.fillSt) return;
    const k = this.state === "MATCH" ? clamp(this.holdT / this.holdSec, 0, 1) : this.state === "SNAP" ? 1 : 0;
    const w = Math.max(0.001, this.HOLD_W * k);
    this.fillSt.sizeDelta = new APJS.Vector2f(w, this.fillSt.sizeDelta.y);
    this.fillSt.anchoredPosition = new APJS.Vector2f(-this.HOLD_W / 2 + w / 2, this.fillSt.anchoredPosition.y);
  }

  // ---------- Photo ----------
  // Flash, copy the camera feed in the photo window, freeze it in the frame, fly it to its pin.
  private snap(): void {
    console.log("MamamyFaceCopy photo " + this.NAMES[this.targetClass()] + " at t=" + this.t.toFixed(2));
    const pin = this.pinViews[this.step];
    if (pin) {
      const tex = this.capture();
      if (tex) pin.photo.texture = tex;
      if (pin.emoji && pin.emojiSt) {
        const et = this.emojiTextures[this.order[this.step]];
        pin.emoji.texture = et;
        const eh = this.isShieldStep() ? this.SHIELD_H : this.BADGE_H;   // same as on the frame
        pin.emojiSt.sizeDelta = new APJS.Vector2f(eh * et.getWidth() / Math.max(et.getHeight(), 1), eh);
      }
      pin.obj.setEnabledInHierarchy(true);
      pin.st.sizeDelta = new APJS.Vector2f(this.PHOTO_W, this.PHOTO_H);
      const r = this.rowPose(this.step);
      this.flyPin(pin, 0, this.PHOTO_Y, 1, 0, r[0], r[1], this.ROW_S, r[2], this.snapSec * 0.7, this.snapSec * 0.3);
    }
    this.flashT = 0;
    if (this.flash) this.flash.setEnabledInHierarchy(true);
    this.holdT = 0;
    if (this.isShieldStep()) { this.startFinale(); return; }
    this.setState("SNAP");
  }

  private capture(): APJS.Texture | null {
    if (!this.camera) return null;
    const x = (360 - this.PHOTO_W / 2) / 720, y = (640 + this.PHOTO_Y - this.PHOTO_H / 2) / 1280;
    return APJS.CaptureFrameHelper.captureCameraOutput(this.camera,
      new APJS.Rect(x, y, this.PHOTO_W / 720, this.PHOTO_H / 1280), 0.6);
  }

  private nextEmoji(): void {
    this.step++;
    this.startSpin();
  }

  // Pin i in the top row: photo centre (the frame centre is 35 px lower at full size).
  private rowPose(i: number): number[] {
    const n = this.order.length;
    const x = (i - (n - 1) / 2) * this.ROW_DX;
    return [x, this.ROW_Y + 35 * this.ROW_S, this.ROW_S, this.TILT[i % this.TILT.length]];
  }

  // Result grid: four on top, the rest below, on the upper half (clear of the logo).
  private gridPose(i: number): number[] {
    const n = this.order.length, top = Math.min(4, Math.ceil(n / 2));
    const row = i < top ? 0 : 1, k = row === 0 ? i : i - top, cnt = row === 0 ? top : n - top;
    const x = (k - (cnt - 1) / 2) * 165, y = (row === 0 ? 430 : 215) + 35 * this.GRID_S;
    return [x, y, this.GRID_S, this.TILT[i % this.TILT.length] * 0.8];
  }

  private flyPin(p: Pin, fx: number, fy: number, fs: number, fr: number,
                 tx: number, ty: number, ts: number, tr: number, sec: number, delay: number): void {
    p.fromX = fx; p.fromY = fy; p.fromS = fs; p.fromR = fr;
    p.toX = tx; p.toY = ty; p.toS = ts; p.toR = tr;
    p.t = 0; p.sec = sec; p.delay = delay;
    this.placePin(p, 0);
  }

  private updatePins(dt: number): void {
    for (const p of this.pinViews) {
      if (p.t < 0) continue;
      p.t += dt;
      const k = easeInOut(seg(p.t - p.delay, 0, p.sec));
      this.placePin(p, k);
      if (p.t >= p.delay + p.sec) p.t = -1;
    }
  }

  private placePin(p: Pin, k: number): void {
    const s = p.fromS + (p.toS - p.fromS) * k;
    const arc = Math.sin(k * Math.PI) * 40 * (p.fromS > p.toS ? 1 : 0.5);
    p.st.anchoredPosition = new APJS.Vector2f(p.fromX + (p.toX - p.fromX) * k, p.fromY + (p.toY - p.fromY) * k + arc);
    p.st.scale = new APJS.Vector2f(Math.max(0.001, s), Math.max(0.001, s));
    p.st.rotation = p.fromR + (p.toR - p.fromR) * k;
  }

  private updateFlash(dt: number): void {
    if (this.flashT < 0 || !this.flashImg) return;
    this.flashT += dt;
    this.flashImg.opacity = 0.85 * (1 - seg(this.flashT, 0.05, 0.4));
    if (this.flashT >= 0.4) { this.flashT = -1; if (this.flash) this.flash.setEnabledInHierarchy(false); }
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
        const eyeW = Math.max(1e-6, (d(52, 55) + d(58, 61)) / 2);
        this.eyeL += (d(72, 73) / Math.max(1e-6, d(52, 55)) - this.eyeL) * k;
        this.eyeR += (d(75, 76) / Math.max(1e-6, d(58, 61)) - this.eyeR) * k;
        this.open += (d(98, 102) / Math.max(1e-6, d(84, 90)) - this.open) * k;
        // y grows upward: corners lower than the lip centre = frown = positive
        const cornerY = (P[2 * 84 + 1] + P[2 * 90 + 1]) / 2, centreY = (P[2 * 87 + 1] + P[2 * 93 + 1]) / 2;
        this.curve += ((centreY - cornerY) / Math.max(1e-6, d(84, 90)) - this.curve) * k;
        this.width += (d(84, 90) / Math.max(1e-6, d(0, 32)) - this.width) * k;
        // inner brow ends (37, 38) over the upper eyelids (72, 75)
        this.brow += ((d(37, 72) + d(38, 75)) / 2 / eyeW - this.brow) * k;
        const eyes = Math.max(this.eyeL, this.eyeR);
        if (eyes > this.eyeBase) this.eyeBase += (eyes - this.eyeBase) * clamp(dt * 4, 0, 1);
        else this.eyeBase += (eyes - this.eyeBase) * clamp(dt * 0.05, 0, 1);
        // Learn the resting face while calm (mouth shut, no smile, eyes open). Each baseline
        // follows a relaxed face quickly but the expression's direction only very slowly, so
        // holding a face never becomes the new "normal".
        if (this.open < this.mouthOpen && this.happy < 30 && eyes > this.eyeBase * 0.8 && !this.pout) {
          const rate = this.curve < this.curveBase ? 1.0 : 0.03;
          this.curveBase += (this.curve - this.curveBase) * clamp(dt * rate, 0, 1);
          if (this.widthBase <= 0) this.widthBase = this.width;
          else this.widthBase += (this.width - this.widthBase) * clamp(dt * (this.width > this.widthBase ? 1.0 : 0.03), 0, 1);
          if (this.angry < this.angryProb) {
            if (this.browBase <= 0) this.browBase = this.brow;
            else this.browBase += (this.brow - this.browBase) * clamp(dt * (this.brow > this.browBase ? 0.5 : 0.03), 0, 1);
          }
        }
      }
      // Face box (normalized, origin bottom-left) → screen units for the ring.
      const rc = f.rect, kf = clamp(dt * 10, 0, 1);
      this.faceX += ((rc.x + rc.width / 2 - 0.5) * 720 - this.faceX) * kf;
      this.faceY += ((rc.y + rc.height / 2 - 0.5) * 1280 - this.faceY) * kf;
      this.faceW += (rc.width * 720 - this.faceW) * kf;
      this.faceH += (rc.height * 1280 - this.faceH) * kf;
      this.blinkOne = f.hasAction(APJS.FaceAction.EyeBlinkLeft) !== f.hasAction(APJS.FaceAction.EyeBlinkRight);
      this.pout = f.hasAction(APJS.FaceAction.MouthPout);
    }
    if (r.getFaceAttributeCount() > 0) {
      const a = r.getFaceAttributeInfo(0);
      this.happy = a.happyScore;
      const p = a.expressionProbabilities;   // [Angry, Disgust, Fear, Happy, Sad, Surprise, Neutral]
      this.sad = p && p.length > 4 ? p[4] : 0;
      this.angry = p && p.length > 1 ? Math.max(p[0], p[1] * 0.7) : 0;
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

  private browLowered(): boolean {
    return this.browBase > 0 && this.brow < this.browBase * (1 - this.browDrop);
  }

  // One of the seven expressions (or -1), from the smoothed readings.
  private classify(): number {
    const shut = this.eyeBase * this.eyeClosedRatio;
    const lo = Math.min(this.eyeL, this.eyeR), hi = Math.max(this.eyeL, this.eyeR);
    const mouthOpen = this.open > this.mouthOpen;
    const angry = this.happy < this.smileHappy && (this.angry >= this.angryProb || this.browLowered());
    if (this.tongueBs > 0.4) return 0;
    // Wink: one eye clearly more shut than the other (the open one may squint while smiling).
    const wink = (lo < hi * this.winkRatio && lo < shut * 1.2) || (this.blinkOne && lo < hi * 0.85);
    if (wink && !(mouthOpen && hi < shut)) return 2;
    // Both eyes shut: happy = laughing / eyes-shut smile; scowling = angry; else just a blink.
    if (hi < shut) return this.happy >= this.smileHappy ? 6 : angry ? 4 : this.seen;
    if (mouthOpen) return this.happy >= this.laughHappy ? 6 : this.happy >= this.smileHappy ? 5 : angry ? 4 : 0;
    if (this.happy >= this.smileHappy) return 5;
    // Pout: lips pushed together (narrow mouth), or the tracker's pout action.
    if (this.pout || (this.widthBase > 0 && this.width < this.widthBase * this.poutWidth)) return 1;
    if (angry) return 4;
    if (this.curve - this.curveBase >= this.frownDrop || this.sad >= this.sadProb) return 3;
    return -1;
  }

  private updateSeen(dt: number): void {
    if (this.state === "FINALE" || this.state === "RESULT") { this.updateDebug(); return; }
    let c = this.hasFace ? this.classify() : this.seen;
    if (this.demoMode > 0 && this.state === "MATCH") {
      const target = this.targetClass();
      const right = this.demoMode === 2 ? this.stateT > 1.6 : this.stateT > 0.8;
      c = right ? target : (this.demoMode === 2 && this.stateT > 0.4 ? (target + 3) % this.CLASSES : -1);
    }
    if (c !== this.candidate) { this.candidate = c; this.candidateT = 0; }
    else this.candidateT += dt;
    if (this.candidate !== this.seen && this.candidateT >= this.mirrorDelay) this.seen = this.candidate;
    this.updateDebug();
  }

  private updateDebug(): void {
    if (this.debugText) this.debugText.setEnabledInHierarchy(this.showDebug);
    if (!this.showDebug && !this.logReadings) return;
    const line = (this.hasFace ? "see " + (this.seen >= 0 ? this.NAMES[this.seen] : "NONE") : "no face") +
      "  eyes " + this.eyeL.toFixed(2) + "/" + this.eyeR.toFixed(2) + " base " + this.eyeBase.toFixed(2) +
      "  mouth " + this.open.toFixed(2) + "  happy " + this.happy.toFixed(0) +
      "  sad " + this.sad.toFixed(2) + "  angry " + this.angry.toFixed(2) +
      "  frown " + (this.curve - this.curveBase).toFixed(3) +
      "  brow " + (this.browBase > 0 ? (this.brow / this.browBase).toFixed(2) : "-") +
      "  width " + (this.widthBase > 0 ? (this.width / this.widthBase).toFixed(2) : "-") +
      (this.pout ? "  POUT" : "") + (this.tongueBs >= 0 ? "  tongue " + this.tongueBs.toFixed(2) : "");
    const txt = this.debugText && this.showDebug ? this.debugText.getComponent("Text") as APJS.Text : undefined;
    if (txt) txt.text = line;
    if (this.logReadings && this.t >= this.logT) { this.logT = this.t + 0.25; console.log("FaceDbg t=" + this.t.toFixed(2) + " " + line); }
  }

  // ---------- Finale: the shield turns into MEGA MAMAMY 19, the photos gather ----------
  // 0-0.9 the last photo flies to its pin while the shield swells; 0.9-1.1 it flips to the plain
  // 19 shield; 1.1-1.8 it flies (spinning) to the shield's spot in the logo, growing to the logo's
  // shield size, while the photos move from the row into the result grid.
  private startFinale(): void {
    this.badgeSt.rotation = 0;
    this.finX = this.badgeSt.anchoredPosition.x;
    this.finY = this.badgeSt.anchoredPosition.y;
    this.gathered = false;
    this.setState("FINALE");
  }

  private logoShieldPose(): number[] {
    const lp = this.anim[0];
    return [lp.baseX + this.logoShieldX * this.logoW, lp.baseY + this.logoShieldY * this.logoH];
  }

  private updateFinale(): void {
    const t = this.stateT, st = this.badgeSt, x0 = this.finX, y0 = this.finY;
    this.setPolaroid(1 - seg(t, 0.5, 0.9));
    if (this.holdFill) this.holdFill.setEnabledInHierarchy(false);
    if (t < 0.9) {
      const sw = 1 + 0.15 * Math.sin(seg(t, 0, 0.9) * Math.PI);
      st.anchoredPosition = new APJS.Vector2f(x0, y0);
      st.scale = new APJS.Vector2f(sw, sw);
      return;
    }
    if (t < 1.1) {   // flip: squeeze to an edge, swap to the plain shield, open up again
      const k = seg(t, 0.9, 1.1), w = Math.abs(Math.cos(k * Math.PI));
      if (k >= 0.5 && this.shieldPlainTex && this.badgeImg.texture !== this.shieldPlainTex) {
        this.badgeImg.texture = this.shieldPlainTex;
        const h = this.SHIELD_H;
        st.sizeDelta = new APJS.Vector2f(h * this.shieldPlainTex.getWidth() / Math.max(this.shieldPlainTex.getHeight(), 1), h);
      }
      st.anchoredPosition = new APJS.Vector2f(x0, y0);
      st.scale = new APJS.Vector2f(Math.max(0.001, w), 1);
      return;
    }
    if (!this.gathered) { this.gathered = true; this.gatherPins(); }
    const to = this.logoShieldPose();
    const toS = this.logoShieldH * this.logoH / Math.max(st.sizeDelta.y, 1);
    const k = easeInOut(seg(t, 1.1, 1.8));
    const s = 1 + (toS - 1) * k;
    st.anchoredPosition = new APJS.Vector2f(x0 + (to[0] - x0) * k, y0 + (to[1] - y0) * k + Math.sin(k * Math.PI) * 100);
    st.scale = new APJS.Vector2f(Math.max(0.001, s), Math.max(0.001, s));
    st.rotation = 360 * k;
    if (t >= 1.8) this.showResult();
  }

  // Photos leave the row for the result grid, one after another.
  private gatherPins(): void {
    for (let i = 0; i < this.pinViews.length && i < this.order.length; i++) {
      const p = this.pinViews[i];
      const from = this.rowPose(i), to = this.gridPose(i);
      this.flyPin(p, from[0], from[1], from[2], from[3], to[0], to[1], to[2], to[3], 0.6, 0.06 * i);
    }
  }

  // ---------- Result ----------
  private showResult(): void {
    this.setState("RESULT");
    this.badgeSt.rotation = 0;
    this.polaroid.setEnabledInHierarchy(false);
    if (this.resultOverlay) this.resultOverlay.setEnabledInHierarchy(true);
    if (this.winEffect) this.winEffect.setEnabledInHierarchy(true);
    this.updateResultAnim(0);
  }

  // Confetti slides down and the logo bursts out of the shield.
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
    const st = this.badgeSt;
    const toS = this.logoShieldH * this.logoH / Math.max(st.sizeDelta.y, 1);
    const pop = toS * (1 + 0.15 * Math.sin(seg(t, 0, this.burstSec * 0.8) * Math.PI));
    st.scale = new APJS.Vector2f(pop, pop);
    this.badge.setEnabledInHierarchy(t < this.burstSec * 0.8);
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
