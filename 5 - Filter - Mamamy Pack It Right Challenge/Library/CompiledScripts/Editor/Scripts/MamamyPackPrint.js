const APJS = globalThis.orion['@orion/orion-sdk/EditorFramework'].APJS;

const {BasicScriptNode} = require('../BasicScriptNode');
const {
  customNode,
  component,
  input,
  output,
  serializeSceneObjectFlag,
  serializeProperty,
  label, readOnly, slider, spinBox, dropDown,
  textArea, header, showIf, tooltip, separator,
  space, groupBegin, groupEnd, disablePin,
} = require('../OrionDecorators');

"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MamamyPackPrint = void 0;
/**
 * MamamyPackPrint — "Print the Mamamy packs": tap the print rollers in the right order, product
 * after product. A game is five rounds (client 2026-10-09), shown as five stars at the top: KUT,
 * KK, NGX and BTG in random order, and the MEGA MAMAMY 19 logo last. Finishing an item
 * lights its star and moves on. A wrong pack earns no star, but the game still goes on through all
 * five items (client 2026-10-09). After the logo: five stars wins; fewer shows the lose screen (sad
 * face + logo + PLAY AGAIN), and PLAY AGAIN starts a fresh game from the first item.
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
 * Flow: INTRO → press TikTok Record (the only way to start) → PLAYING ⇄ ROLLING (×3)
 *       → DONE_POP (star) | MISS_WAIT (no star) → (NEXT_IN → PLAYING … for each round)
 *       → RESULT (win with all stars, else lose) → tap PLAY AGAIN while recording (or Record again) → fresh game.
 * Positions are screen-space (720x1280, origin at the centre, y up) measured on mockup 1.
 */
class RollerView {
    constructor(obj) {
        this.used = false;
        this.obj = obj;
        this.st = obj.getComponent("ScreenTransform");
        this.img = obj.getComponent("Image");
        this.baseX = this.st.anchoredPosition.x;
        this.baseY = this.st.anchoredPosition.y;
    }
}
class AnimPart {
    constructor() {
        this.baseX = 0;
        this.baseY = 0;
    }
}
class ConfettiLayer {
    constructor() {
        this.baseY = 0;
        this.slide = true;
    }
}
function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
}
function seg(t, a, b) {
    return clamp((t - a) / (b - a), 0, 1);
}
function easeOutBack(k) {
    const c = 1.70158;
    return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2);
}
function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const t = arr[i];
        arr[i] = arr[j];
        arr[j] = t;
    }
    return arr;
}
// The editor may hand SceneObject array entries over as the object's ScreenTransform: use its owner.
function asObject(ref) {
    if (!ref)
        return undefined;
    if (ref.getComponent)
        return ref;
    return ref.getSceneObject ? ref.getSceneObject() : undefined;
}
function easeInOut(k) {
    return k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
}
let MamamyPackPrint = class MamamyPackPrint extends APJS.BasicScriptComponent {
    constructor() {
        super(...arguments);
        this.whiteRollerTex = [];
        this.patternRollerTex = [];
        this.pinkRollerTex = [];
        this.frameTex = [];
        this.whiteTex = [];
        this.printTex = [];
        this.fullTex = [];
        this.floodPatternTex = [];
        this.floodPinkTex = [];
        this.floodFirstTex = [];
        this.thumbTex = [];
        this.bodyOffsets = [];
        this.printOrders = [];
        this.fixedFirst = 2;
        this.randomMiddle = 2;
        this.fixedLast = 1;
        this.rollSec = 0.8;
        this.hintRounds = 1;
        this.loseDelay = 1.0;
        this.nextInSec = 0.5;
        this.logoShieldX = 0.374;
        this.logoShieldY = 0.122;
        this.paintedShieldX = 208;
        this.paintedShieldY = -80.7;
        this.paintedShieldScale = 0.67;
        this.demoMode = 0;
        this.rollers = [];
        this.stars = [];
        this.NAMES = ["WHITE", "PATTERN", "PINK"];
        // Which way each roller rolls: +1/-1 along x (axis 0) or y (axis 1).
        this.AXIS = [0, 1, 1];
        this.DIR = [1, 1, -1];
        this.retryDelay = 1.3;
        this.winPopSec = 0.5;
        this.fadeSec = 0.25;
        // PlayArea (pack + rollers) layout. Only the hint rounds (first product) shrink it a little, centred,
        // so the left arrow fits beside the roller handle; later products keep the full size and place
        // (client 2026-10-10 evening: the old x +55 / scale 0.82 on every product pushed too much and looked off-centre).
        this.HINT_SCALE = 0.9;
        // Guide arrow TIP per roller position, in PlayArea space (scaled with it). Each arrow runs PARALLEL
        // to its roller's handle, beside it (not in line with it; client 2026-10-10).
        this.TIP_X = [-300, -138, 187];
        this.TIP_Y = [-17, -458, 195];
        this.inited = false;
        this.startOnInit = false;
        this.recording = false; // the game is only playable while TikTok Record is on
        this.state = "INTRO";
        this.stateT = 0;
        this.t = 0;
        // Pack on screen: -1 empty outline, 0 first layer, 1 second, 2 finished,
        // 3 flooded by the bottom roller, 4 by the top roller, 5 by the left roller.
        this.layer = -1;
        this.rollTo = -1; // layer the rolling roller prints
        this.rolling = -1; // roller rolling now
        this.shakeT = -1; // pack shake after a flood / on losing
        this.won = false;
        this.order = []; // product indices for this round
        this.step = 0; // position in order
        this.views = [];
        this.packX = 0;
        this.packY = 0;
        this.packW = 1;
        this.packH = 1;
        this.anim = []; // logo, retry, intro button, sad face
        this.colourAt = [0, 1, 2]; // colour of the roller at each position this round
        this.rolls = 0; // rollers used on this pack
        this.starCount = 0; // items printed right this game
        this.games = 0; // games played since Record (demo misses only the first)
        this.starImgs = [];
        this.starSts = [];
        this.starPopT = -1;
        this.starPop = -1; // star popping now
        this.confetti = [];
        this.fadeImgs = [];
        this.demoWait = 0.8;
    }
    onStart() {
        APJS.EventManager.getGlobalEmitter().on(APJS.EventType.Touch, this.onTouch, this);
        APJS.EventManager.getGlobalEmitter().on(APJS.EventType.RecordStart, this.onRecordStart, this);
        APJS.EventManager.getGlobalEmitter().on(APJS.EventType.RecordEnd, this.onRecordEnd, this);
    }
    onDestroy() {
        APJS.EventManager.getGlobalEmitter().off(APJS.EventType.Touch, this.onTouch, this);
        APJS.EventManager.getGlobalEmitter().off(APJS.EventType.RecordStart, this.onRecordStart, this);
        APJS.EventManager.getGlobalEmitter().off(APJS.EventType.RecordEnd, this.onRecordEnd, this);
    }
    // Serialized refs are only populated after onStart, so wire everything lazily.
    initOnce() {
        if (this.inited)
            return true;
        if (this.rollers.length < 3 || !this.packFrame || !this.packDone || !this.packWipe ||
            this.fullTex.length === 0)
            return false;
        for (const obj of this.rollers)
            this.views.push(new RollerView(obj));
        this.frameImg = this.packFrame.getComponent("Image");
        if (this.thumb)
            this.thumbImg = this.thumb.getComponent("Image");
        this.doneImg = this.packDone.getComponent("Image");
        this.wipeImg = this.packWipe.getComponent("Image");
        this.packSt = this.packDone.getComponent("ScreenTransform");
        this.packX = this.packSt.anchoredPosition.x;
        this.packY = this.packSt.anchoredPosition.y;
        this.packW = this.packSt.sizeDelta.x;
        this.packH = this.packSt.sizeDelta.y;
        for (const ref of this.stars) {
            const obj = asObject(ref);
            if (!obj)
                continue;
            this.starImgs.push(obj.getComponent("Image"));
            this.starSts.push(obj.getComponent("ScreenTransform"));
        }
        for (const obj of [this.resultLogo, this.retryButton, this.introButton, this.loseIcon]) {
            const part = new AnimPart();
            if (obj) {
                part.st = obj.getComponent("ScreenTransform");
                part.baseX = part.st.anchoredPosition.x;
                part.baseY = part.st.anchoredPosition.y;
            }
            this.anim.push(part);
        }
        // The pack and target fade out when the logo comes in.
        for (const obj of [this.packDone, this.packFrame, this.thumb]) {
            const img = obj ? obj.getComponent("Image") : undefined;
            if (img)
                this.fadeImgs.push(img);
        }
        // Confetti layers (children of winEffect): falling pieces slide in, the glow overlay fades in.
        if (this.winEffect) {
            for (const child of this.winEffect.getChildren()) {
                const layer = new ConfettiLayer();
                layer.st = child.getComponent("ScreenTransform");
                layer.img = child.getComponent("Image");
                if (!layer.st || !layer.img)
                    continue;
                layer.baseY = layer.st.anchoredPosition.y;
                layer.slide = child.name.indexOf("Overlay") < 0;
                this.confetti.push(layer);
            }
        }
        if (this.guideArrow) {
            this.arrowSt = this.guideArrow.getComponent("ScreenTransform");
            this.arrowImg = this.guideArrow.getComponent("Image");
        }
        if (this.playArea)
            this.playSt = this.playArea.getComponent("ScreenTransform");
        this.inited = true;
        this.resetGame();
        if (this.startOnInit) {
            this.startOnInit = false;
            this.startGame();
        }
        return true;
    }
    onUpdate(dt) {
        this.updateFrame(dt);
        this.syncGlow();
    }
    // The soft white glow under the result logo copies the logo's place, size, scale, turn and fade.
    syncGlow() {
        if (!this.logoGlow || !this.resultLogo)
            return;
        const ls = this.resultLogo.getComponent("ScreenTransform");
        const gs = this.logoGlow.getComponent("ScreenTransform");
        const li = this.resultLogo.getComponent("Image");
        const gi = this.logoGlow.getComponent("Image");
        if (!ls || !gs || !li || !gi || !li.texture || !gi.texture)
            return;
        const k = ls.sizeDelta.x / Math.max(li.texture.getWidth(), 1);
        gs.sizeDelta = new APJS.Vector2f(gi.texture.getWidth() * k, gi.texture.getHeight() * k);
        gs.anchoredPosition = ls.anchoredPosition;
        gs.scale = ls.scale;
        gs.rotation = ls.rotation;
        gi.opacity = li.opacity;
    }
    updateFrame(dt) {
        if (!this.initOnce() || this.paused())
            return;
        this.t += dt;
        this.stateT += dt;
        this.updateShake(dt);
        this.updateStars(dt);
        if (this.state === "INTRO") {
            this.setPart(this.anim[2], 0, 0, 1 + 0.05 * Math.sin(this.t * 5));
            this.idleRollers();
            if (this.demoMode > 0 && this.stateT >= 3.0)
                this.startGame();
        }
        else if (this.state === "PLAYING") {
            this.idleRollers();
            if (this.demoMode > 0 && this.stateT >= this.demoWait)
                this.pick(this.demoPick());
        }
        else if (this.state === "ROLLING") {
            this.updateRoll();
        }
        else if (this.state === "DONE_POP") {
            const k = seg(this.stateT, 0, this.winPopSec);
            const s = 1 + 0.12 * Math.sin(k * Math.PI);
            this.packSt.scale = new APJS.Vector2f(s, s);
            if (k >= 1)
                this.nextItem();
        }
        else if (this.state === "NEXT_IN") {
            this.updateNextIn();
        }
        else if (this.state === "MISS_WAIT") {
            if (this.stateT >= this.loseDelay)
                this.nextItem();
        }
        else if (this.state === "RESULT") {
            this.updateResultAnim(this.stateT);
            if (this.demoMode > 0 && !this.won && this.stateT >= 3.0)
                this.playAgain(); // demo taps PLAY AGAIN
        }
    }
    // ---------- Input / lifecycle ----------
    onTouch(event) {
        if (!this.inited || this.paused())
            return;
        const touch = event.args[0];
        if (touch.phase !== APJS.TouchPhase.Began)
            return;
        // Only Record starts the game; PLAY AGAIN works while recording.
        if (this.state === "PLAYING") {
            for (let i = 0; i < this.views.length; i++) {
                const v = this.views[i];
                if (!v.used && APJS.TouchUtils.isScreenPointOnImage(touch.position, v.img)) {
                    this.pick(i);
                    return;
                }
            }
        }
        else if (this.state === "RESULT" && this.recording && this.stateT > this.retryDelay) {
            this.playAgain();
        }
    }
    // Pressing Record is the only way to start a round (client 2026-10-09: no play before Record).
    onRecordStart() {
        this.recording = true;
        if (!this.inited) {
            this.startOnInit = true;
            return;
        }
        if (this.state !== "INTRO" && this.state !== "RESULT")
            return; // Record on again mid-round: carry on
        this.games = 0;
        this.resetGame();
        this.startGame();
    }
    // Record stopped mid-round: the game freezes (no motion, touch or voice) until Record goes on again
    // (client 2026-10-09: "ấn dừng quay rồi vẫn chơi được"). The intro and result screens stay live.
    paused() {
        return this.demoMode === 0 && !this.recording && this.state !== "INTRO" && this.state !== "RESULT";
    }
    onRecordEnd() {
        this.recording = false;
    }
    resetGame() {
        const all = this.fullTex.map((_t, i) => i);
        const first = Math.min(this.fixedFirst, all.length);
        const last = Math.min(this.fixedLast, all.length - first);
        const middle = shuffle(all.slice(first, all.length - last)).slice(0, this.randomMiddle);
        this.order = all.slice(0, first).concat(middle, all.slice(all.length - last));
        this.step = 0;
        this.starCount = 0;
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
        for (const img of this.fadeImgs)
            img.opacity = 1;
        if (this.thumb)
            this.thumb.setEnabledInHierarchy(this.hintRounds > 0);
        this.starPopT = -1;
        for (let i = 0; i < this.starImgs.length; i++) {
            this.starImgs[i].getSceneObject().setEnabledInHierarchy(i < this.order.length);
            if (this.starOffTex)
                this.starImgs[i].texture = this.starOffTex;
            this.starSts[i].scale = new APJS.Vector2f(1, 1);
        }
        if (this.resultOverlay)
            this.resultOverlay.setEnabledInHierarchy(false);
        if (this.winEffect)
            this.winEffect.setEnabledInHierarchy(false);
        this.resetAnimParts();
        if (this.introOverlay)
            this.introOverlay.setEnabledInHierarchy(true);
        this.setState("INTRO");
    }
    startGame() {
        if (this.introOverlay)
            this.introOverlay.setEnabledInHierarchy(false);
        this.setState("PLAYING");
    }
    setState(s) {
        this.state = s;
        this.stateT = 0;
        if (s !== "PLAYING")
            this.placeArrow(-1);
    }
    // Unused rollers breathe a little so they read as tappable. In the hint rounds the next right
    // roller also wiggles in short bursts: "tap me".
    idleRollers() {
        const hint = this.state === "PLAYING" && this.step < this.hintRounds && this.rolls < 3 ? this.seqAt(this.rolls) : -1;
        for (let i = 0; i < this.views.length; i++) {
            const v = this.views[i];
            if (v.used)
                continue;
            let s = 1 + 0.03 * Math.sin(this.t * 4 + i * 2.1), rot = 0;
            if (i === hint) {
                const burst = Math.pow(Math.max(0, Math.sin(this.stateT * 3.2 - 0.6)), 2);
                rot = 7 * Math.sin(this.stateT * 22) * burst;
                s = 1 + 0.06 * burst;
            }
            v.st.scale = new APJS.Vector2f(s, s);
            v.st.rotation = rot;
        }
        this.placeArrow(hint);
    }
    // Hint rounds: a blinking arrow next to the roller to tap. All three point the way their roller
    // rolls (AXIS/DIR) and poke toward it, so they read as "press this roller" (client 2026-10-10:
    // same direction rule for all three). It never overlaps a roller: left roller → left of it, just above
    // and parallel to its handle, pointing right; bottom roller → below it pointing up; top roller → above it pointing down.
    // Index = roller position (0 left, 1 bottom, 2 top).
    placeArrow(i) {
        if (!this.guideArrow)
            return;
        const on = i >= 0 && !this.views[i].used;
        this.guideArrow.setEnabledInHierarchy(on);
        if (!on || !this.arrowSt)
            return;
        const tap = 10 * Math.max(0, Math.sin(this.stateT * 7)) * this.DIR[i]; // short pokes along the roll
        const alongX = this.AXIS[i] === 0;
        const s = this.playSt ? this.playSt.scale.x : 1;
        const ox = this.playSt ? this.playSt.anchoredPosition.x : 0, oy = this.playSt ? this.playSt.anchoredPosition.y : 0;
        const back = this.arrowSt.sizeDelta.x / 2 * this.DIR[i] - tap; // centre sits half an arrow behind the tip
        const x = ox + s * this.TIP_X[i] - (alongX ? back : 0);
        const y = oy + s * this.TIP_Y[i] - (alongX ? 0 : back);
        this.arrowSt.anchoredPosition = new APJS.Vector2f(x, y);
        this.arrowSt.rotation = alongX ? (this.DIR[i] > 0 ? 0 : 180) : (this.DIR[i] > 0 ? 90 : -90);
        if (this.arrowImg)
            this.arrowImg.opacity = Math.sin(this.stateT * 9) > -0.3 ? 1 : 0.15;
    }
    // ---------- Stars ----------
    lightStar(i) {
        if (i < 0 || i >= this.starImgs.length)
            return;
        if (this.starOnTex)
            this.starImgs[i].texture = this.starOnTex;
        this.starPop = i;
        this.starPopT = 0;
    }
    updateStars(dt) {
        if (this.starPopT < 0)
            return;
        this.starPopT += dt;
        const k = seg(this.starPopT, 0, 0.45);
        const st = this.starSts[this.starPop];
        if (st) {
            const s = 1 + 0.6 * Math.sin(k * Math.PI);
            st.scale = new APJS.Vector2f(s, s);
            st.rotation = 20 * Math.sin(k * Math.PI * 2) * (1 - k);
        }
        if (k >= 1)
            this.starPopT = -1;
    }
    // ---------- Products ----------
    product() {
        return this.order.length > 0 ? this.order[this.step] : 0;
    }
    // Swap every texture to the current product; positions stay (shared crop boxes). The left roller
    // is always the first colour (white / purple); the other two colours swap places (top ⇄ bottom)
    // at random every round — the print order by colour never changes (client 2026-10-09).
    loadProduct() {
        const p = this.product();
        this.colourAt = Math.random() < 0.5 ? [0, 1, 2] : [0, 2, 1];
        const rollerTex = [this.whiteRollerTex, this.patternRollerTex, this.pinkRollerTex];
        for (let i = 0; i < this.views.length; i++) {
            const c = this.colourAt[i];
            if (rollerTex[c][p])
                this.views[i].img.texture = rollerTex[c][p];
            this.views[i].img.flipY = c !== i; // a top roller moved to the bottom turns its handle down
        }
        if (this.frameTex[p])
            this.frameImg.texture = this.frameTex[p];
        if (this.thumbImg && this.thumbTex[p])
            this.thumbImg.texture = this.thumbTex[p];
        if (this.thumb)
            this.thumb.setEnabledInHierarchy(this.step < this.hintRounds);
        if (this.playSt) {
            const s = this.step < this.hintRounds ? this.HINT_SCALE : 1;
            this.playSt.anchoredPosition = new APJS.Vector2f(0, 0);
            this.playSt.scale = new APJS.Vector2f(s, s);
        }
        console.log("MamamyPackPrint round " + (this.step + 1) + " product " + p + " rollers L/B/T " +
            this.colourAt.map((c) => this.NAMES[c]).join("/"));
    }
    // Colour to print at step r (right order by colour, 0 left colour, 1 bottom, 2 top as designed).
    colourAtStep(r) {
        const k = this.product() * 3 + r;
        return k < this.printOrders.length ? this.printOrders[k] : r;
    }
    // Roller (view index) to use at print step r in this round.
    seqAt(r) {
        const c = this.colourAtStep(r);
        for (let i = 0; i < 3; i++)
            if (this.colourAt[i] === c)
                return i;
        return r;
    }
    rankOf(i) {
        for (let r = 0; r < 3; r++)
            if (this.seqAt(r) === i)
                return r;
        return i;
    }
    // floodFirstTex lines up with the end of the product list.
    floodFirst() {
        const k = this.product() - (this.fullTex.length - this.floodFirstTex.length);
        return k >= 0 ? this.floodFirstTex[k] : undefined;
    }
    // Body offset of the roller now at position i (mirrored when its image is flipped).
    bodyOffset(i) {
        const c = this.colourAt[i], k = this.product() * 3 + c;
        const off = k < this.bodyOffsets.length ? this.bodyOffsets[k] : 0;
        return c !== i ? -off : off;
    }
    // Next product: fresh outline and rollers grow back in.
    enterNextProduct() {
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
    updateNextIn() {
        const k = easeOutBack(seg(this.stateT, 0, this.nextInSec));
        const s = Math.max(0.001, k);
        for (const v of this.views)
            v.st.scale = new APJS.Vector2f(s, s);
        const frameSt = this.packFrame.getComponent("ScreenTransform");
        frameSt.scale = new APJS.Vector2f(s, s);
        if (this.thumbImg)
            this.thumbImg.opacity = seg(this.stateT, 0, this.nextInSec);
        const packSt = this.packDone.getComponent("ScreenTransform");
        packSt.anchoredPosition = new APJS.Vector2f(this.packX, this.packY);
        if (this.stateT >= this.nextInSec) {
            frameSt.scale = new APJS.Vector2f(1, 1);
            this.setState("PLAYING");
        }
    }
    // Demo autoplay: the next roller of the scripted sequence that is still unused.
    demoPick() {
        this.demoWait = 0.4 + Math.random() * 0.6; // a human-like pause before the next tap
        if (this.step < this.hintRounds)
            this.demoWait += 1.4; // let the guide arrow show in the video
        const right = [this.seqAt(0), this.seqAt(1), this.seqAt(2)];
        const wrongTry = this.demoMode === 2 && this.step === 2 && this.games === 0; // shows the lose screen once
        const seq = wrongTry ? [right[0], right[2], right[1]] : right;
        for (const i of seq)
            if (!this.views[i].used)
                return i;
        return 0;
    }
    // ---------- Printing ----------
    pick(i) {
        if (this.state !== "PLAYING" || i < 0 || i >= this.views.length || this.views[i].used)
            return;
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
        this.wipeImg.texture = this.rollTo > 2 ? floods[this.rollTo - 3] : prints[this.rollTo];
        this.wipeImg.setMaterialProperty("_filledType", this.AXIS[i]);
        this.setWipe(i, 0);
        this.packWipe.setEnabledInHierarchy(true);
        this.setState("ROLLING");
    }
    // The first roller lays a fresh base (or floods, when the product has floodFirstTex and the
    // pack is not empty); the second needs that base, the third needs the second layer.
    // Otherwise the roller floods the pack in its colour (3 pattern, 4 pink, 5 left colour).
    printResult(i) {
        const r = this.rankOf(i), c = this.colourAt[i];
        const flood = c === 1 ? 3 : c === 2 ? 4 : 5;
        if (r === 0)
            return this.layer === -1 || !this.floodFirst() ? 0 : flood;
        return this.layer === r - 1 ? r : flood;
    }
    // Pop, roll across the pack (the layer wipes in behind the body), then fade out past the edge.
    updateRoll() {
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
        let off;
        if (t < popSec) {
            const s = 1 + 0.1 * Math.sin(seg(t, 0, popSec) * Math.PI);
            v.st.scale = new APJS.Vector2f(s, s);
            off = 0;
        }
        else {
            off = travel * easeInOut(seg(t, popSec, popSec + this.rollSec));
            const past = seg(t, popSec + this.rollSec, popSec + this.rollSec + this.fadeSec);
            off += dir * 40 * past;
            v.img.opacity = 1 - past;
        }
        if (axis === 0)
            v.st.anchoredPosition = new APJS.Vector2f(base + off, v.baseY);
        else
            v.st.anchoredPosition = new APJS.Vector2f(v.baseX, base + off);
        const body = body0 + off;
        const k = dir > 0 ? (body - packLo) / (packHi - packLo) : (packHi - body) / (packHi - packLo);
        this.setWipe(i, clamp(k, 0, 1));
        if (t >= popSec + this.rollSec + this.fadeSec)
            this.finishRoll();
    }
    // Show share k of the new layer on the side the roller came from.
    setWipe(i, k) {
        const axis = this.AXIS[i], dir = this.DIR[i];
        // Horizontal fill runs left → right, vertical fill runs top → bottom.
        let start = 0;
        if (axis === 1 && dir > 0)
            start = 1 - k; // rolling upward: bottom part
        this.wipeImg.setMaterialProperty("_startPoint", start);
        this.wipeImg.setMaterialProperty("_filledRange", k);
    }
    finishRoll() {
        const i = this.rolling;
        this.views[i].obj.setEnabledInHierarchy(false);
        this.doneImg.texture = this.wipeImg.texture;
        this.packDone.setEnabledInHierarchy(true);
        this.packWipe.setEnabledInHierarchy(false);
        this.packFrame.setEnabledInHierarchy(false);
        this.rolling = -1;
        this.layer = this.rollTo;
        let left = 0;
        for (const v of this.views)
            if (!v.used)
                left++;
        if (left > 0) {
            if (this.layer > 2)
                this.shakeT = 0; // flooded: a little shake, keep playing
            this.setState("PLAYING");
        }
        else if (this.layer === 2) {
            this.lightStar(this.starCount); // stars fill left to right; a miss leaves the last ones off
            this.starCount++;
            this.setState("DONE_POP");
        }
        else {
            this.shakeT = 0; // wrong pack: no star, the game goes on
            this.setState("MISS_WAIT");
        }
    }
    updateShake(dt) {
        if (this.shakeT < 0)
            return;
        this.shakeT += dt;
        const k = this.shakeT / 0.35;
        const dx = k < 1 ? 8 * Math.sin(this.shakeT * 60) * (1 - k) : 0;
        this.packSt.anchoredPosition = new APJS.Vector2f(this.packX + dx, this.packY);
        if (k >= 1)
            this.shakeT = -1;
    }
    // ---------- Result ----------
    showResult(win) {
        this.won = win;
        console.log("MamamyPackPrint " + (win ? "WIN" : "LOSE") + " at t=" + this.t.toFixed(2));
        this.packSt.scale = new APJS.Vector2f(1, 1);
        this.packSt.anchoredPosition = new APJS.Vector2f(this.packX, this.packY);
        for (const v of this.views)
            v.obj.setEnabledInHierarchy(false);
        this.showStars(false); // final frame: logo only
        const dim = this.resultOverlay ? this.resultOverlay.getComponent("Image") : undefined;
        if (dim)
            dim.opacity = 1;
        if (this.resultOverlay)
            this.resultOverlay.setEnabledInHierarchy(true);
        if (this.winEffect)
            this.winEffect.setEnabledInHierarchy(win);
        if (this.retryButton)
            this.retryButton.setEnabledInHierarchy(!win);
        if (this.loseIcon)
            this.loseIcon.setEnabledInHierarchy(!win);
        this.setState("RESULT");
        this.updateResultAnim(0);
    }
    // Next item, or the result after the last one: all stars wins.
    nextItem() {
        if (this.step + 1 >= this.order.length) {
            this.showResult(this.starCount === this.order.length);
            return;
        }
        this.step++;
        this.loadProduct();
        this.enterNextProduct();
        this.setState("NEXT_IN");
    }
    // PLAY AGAIN: a fresh game from the first item.
    playAgain() {
        this.games++;
        this.resetGame();
        this.startGame();
    }
    showStars(on) {
        for (let i = 0; i < this.starImgs.length; i++) {
            this.starImgs[i].getSceneObject().setEnabledInHierarchy(on && i < this.order.length);
        }
    }
    // Final frame, no text (client). The pack fades as the logo comes in. Win: only the logo, growing
    // out of the painted one, with confetti. Lose: the logo drops in under a sad face, then PLAY AGAIN
    // pops and keeps a gentle pulse.
    updateResultAnim(t) {
        if (this.won) {
            const slideK = 1 - Math.pow(1 - seg(t, 0, 1.2), 3);
            for (const layer of this.confetti) {
                if (layer.slide) {
                    layer.st.anchoredPosition = new APJS.Vector2f(layer.st.anchoredPosition.x, layer.baseY + (1 - slideK) * 1280);
                    layer.img.opacity = seg(t, 0, 0.4);
                }
                else {
                    layer.img.opacity = seg(t, 0, 1.0);
                }
            }
        }
        for (const img of this.fadeImgs)
            img.opacity = 1 - seg(t, 0.15, 0.45);
        const title = this.anim[0], btn = this.anim[1], sad = this.anim[3];
        const kTitle = easeOutBack(seg(t, 0, 0.5));
        if (this.won && title.st) {
            // The banner starts with its shield exactly on the painted shield, then grows to its spot.
            const ax = this.logoShieldX * title.st.sizeDelta.x, ay = this.logoShieldY * title.st.sizeDelta.y;
            const k = easeOutBack(seg(t, 0.1, 0.7)), s0 = this.paintedShieldScale;
            let sl = Math.max(0.001, s0 + (1 - s0) * k);
            if (t > 1.0)
                sl = 1 + 0.03 * Math.sin((t - 1.0) * 3);
            const e = Math.min(1, k);
            const px = this.paintedShieldX + (title.baseX + ax - this.paintedShieldX) * e;
            const py = this.paintedShieldY + (title.baseY + ay - this.paintedShieldY) * e;
            this.setPart(title, px - ax * sl - title.baseX, py - ay * sl - title.baseY, sl);
        }
        else {
            this.setPart(title, 0, (1 - kTitle) * 320, 0.6 + 0.4 * kTitle);
        }
        const kBtn = easeOutBack(seg(t, 0.6, 1.0));
        this.setPart(btn, 0, 0, t > 1.0 ? 1 + 0.05 * Math.sin((t - 1.0) * 5) : kBtn);
        this.setPart(sad, 0, 0, easeOutBack(seg(t, 0.3, 0.7)));
    }
    setPart(part, dx, dy, scale) {
        if (!part || !part.st)
            return;
        const s = Math.max(0.001, scale);
        part.st.anchoredPosition = new APJS.Vector2f(part.baseX + dx, part.baseY + dy);
        part.st.scale = new APJS.Vector2f(s, s);
    }
    resetAnimParts() {
        for (const part of this.anim)
            this.setPart(part, 0, 0, 1);
        for (const layer of this.confetti) {
            layer.st.anchoredPosition = new APJS.Vector2f(layer.st.anchoredPosition.x, layer.baseY);
            layer.img.opacity = 1;
        }
    }
};
__decorate([
    header("Theme & Assets"),
    header("Products (one entry per product, same order in every list)"),
    serializeProperty,
    tooltip('White roller (left)')
], MamamyPackPrint.prototype, "whiteRollerTex", void 0);
__decorate([
    serializeProperty,
    tooltip('Pattern roller (bottom)')
], MamamyPackPrint.prototype, "patternRollerTex", void 0);
__decorate([
    serializeProperty,
    tooltip('Pink roller (top)')
], MamamyPackPrint.prototype, "pinkRollerTex", void 0);
__decorate([
    serializeProperty,
    tooltip('Empty pack outline')
], MamamyPackPrint.prototype, "frameTex", void 0);
__decorate([
    serializeProperty,
    tooltip('Pack with the white base')
], MamamyPackPrint.prototype, "whiteTex", void 0);
__decorate([
    serializeProperty,
    tooltip('Pack with the pattern printed')
], MamamyPackPrint.prototype, "printTex", void 0);
__decorate([
    serializeProperty,
    tooltip('Finished pack with the logo')
], MamamyPackPrint.prototype, "fullTex", void 0);
__decorate([
    serializeProperty,
    tooltip('Pack flooded by the pattern roller')
], MamamyPackPrint.prototype, "floodPatternTex", void 0);
__decorate([
    serializeProperty,
    tooltip('Pack flooded pink')
], MamamyPackPrint.prototype, "floodPinkTex", void 0);
__decorate([
    serializeProperty,
    tooltip('Pack flooded by the left roller, for the LAST products only (others: the left roller always lays a fresh base)')
], MamamyPackPrint.prototype, "floodFirstTex", void 0);
__decorate([
    serializeProperty,
    tooltip('Finished-pack thumbnail (target)')
], MamamyPackPrint.prototype, "thumbTex", void 0);
__decorate([
    serializeProperty,
    tooltip('Roller body centre vs roller image centre (px), 3 per product: white, pattern, pink')
], MamamyPackPrint.prototype, "bodyOffsets", void 0);
__decorate([
    serializeProperty,
    tooltip('Right colour order, 3 per product (0 left colour, 1 bottom colour, 2 top colour as designed); missing = 0 1 2')
], MamamyPackPrint.prototype, "printOrders", void 0);
__decorate([
    serializeProperty,
    tooltip('Products always played first, in list order'),
    spinBox(0, 7, 1)
], MamamyPackPrint.prototype, "fixedFirst", void 0);
__decorate([
    serializeProperty,
    tooltip('Products drawn at random from the middle of the list'),
    spinBox(0, 7, 1)
], MamamyPackPrint.prototype, "randomMiddle", void 0);
__decorate([
    serializeProperty,
    tooltip('Products always played last, in list order'),
    spinBox(0, 7, 1)
], MamamyPackPrint.prototype, "fixedLast", void 0);
__decorate([
    serializeProperty,
    tooltip('Round star, not won yet')
], MamamyPackPrint.prototype, "starOffTex", void 0);
__decorate([
    serializeProperty,
    tooltip('Round star, won')
], MamamyPackPrint.prototype, "starOnTex", void 0);
__decorate([
    header("Gameplay Tuning"),
    serializeProperty,
    tooltip('Roll across the pack (s)'),
    slider(0.3, 2, 0.05)
], MamamyPackPrint.prototype, "rollSec", void 0);
__decorate([
    serializeProperty,
    tooltip('Rounds that show the target and wiggle the next right roller'),
    spinBox(0, 5, 1)
], MamamyPackPrint.prototype, "hintRounds", void 0);
__decorate([
    serializeProperty,
    tooltip('Wrong pack stays this long before the result (s)'),
    slider(0.3, 3, 0.1)
], MamamyPackPrint.prototype, "loseDelay", void 0);
__decorate([
    serializeProperty,
    tooltip('Next product slides in (s)'),
    slider(0.2, 1.5, 0.05)
], MamamyPackPrint.prototype, "nextInSec", void 0);
__decorate([
    serializeProperty,
    tooltip('Shield centre inside the win logo, x as a share of the logo width from its centre')
], MamamyPackPrint.prototype, "logoShieldX", void 0);
__decorate([
    serializeProperty,
    tooltip('Shield centre inside the win logo, y (up) as a share of the logo height from its centre')
], MamamyPackPrint.prototype, "logoShieldY", void 0);
__decorate([
    serializeProperty,
    tooltip('Painted logo shield centre on screen (px)')
], MamamyPackPrint.prototype, "paintedShieldX", void 0);
__decorate([
    serializeProperty,
    tooltip('Painted logo shield centre on screen (px)')
], MamamyPackPrint.prototype, "paintedShieldY", void 0);
__decorate([
    serializeProperty,
    tooltip('Win logo scale at which its shield matches the painted shield')
], MamamyPackPrint.prototype, "paintedShieldScale", void 0);
__decorate([
    serializeProperty,
    tooltip('Demo video autoplay: 0 off, 1 right order, 2 a wrong third item in the first game'),
    spinBox(0, 2, 1)
], MamamyPackPrint.prototype, "demoMode", void 0);
__decorate([
    serializeSceneObjectFlag,
    header("Advanced — Scene Wiring"),
    serializeProperty,
    tooltip('Rollers in print order: white (left), pattern (bottom), pink (top)')
], MamamyPackPrint.prototype, "rollers", void 0);
__decorate([
    serializeSceneObjectFlag,
    serializeProperty,
    tooltip('Empty pack outline')
], MamamyPackPrint.prototype, "packFrame", void 0);
__decorate([
    serializeSceneObjectFlag,
    serializeProperty,
    tooltip('Pack printed so far (Normal draw mode)')
], MamamyPackPrint.prototype, "packDone", void 0);
__decorate([
    serializeSceneObjectFlag,
    serializeProperty,
    tooltip('Layer being printed (Filled draw mode, same rect as packDone)')
], MamamyPackPrint.prototype, "packWipe", void 0);
__decorate([
    serializeSceneObjectFlag,
    serializeProperty,
    tooltip('Finished-pack thumbnail (target)')
], MamamyPackPrint.prototype, "thumb", void 0);
__decorate([
    serializeSceneObjectFlag,
    serializeProperty
], MamamyPackPrint.prototype, "introOverlay", void 0);
__decorate([
    serializeSceneObjectFlag,
    serializeProperty
], MamamyPackPrint.prototype, "introButton", void 0);
__decorate([
    serializeSceneObjectFlag,
    serializeProperty
], MamamyPackPrint.prototype, "resultOverlay", void 0);
__decorate([
    serializeSceneObjectFlag,
    serializeProperty
], MamamyPackPrint.prototype, "winEffect", void 0);
__decorate([
    serializeSceneObjectFlag,
    serializeProperty
], MamamyPackPrint.prototype, "resultLogo", void 0);
__decorate([
    serializeSceneObjectFlag,
    serializeProperty,
    tooltip('Soft white glow drawn under the result logo; follows it')
], MamamyPackPrint.prototype, "logoGlow", void 0);
__decorate([
    serializeSceneObjectFlag,
    serializeProperty,
    tooltip('Sad face shown above the logo on a loss')
], MamamyPackPrint.prototype, "loseIcon", void 0);
__decorate([
    serializeSceneObjectFlag,
    serializeProperty
], MamamyPackPrint.prototype, "retryButton", void 0);
__decorate([
    serializeSceneObjectFlag,
    serializeProperty,
    tooltip('Round stars, left to right')
], MamamyPackPrint.prototype, "stars", void 0);
__decorate([
    serializeSceneObjectFlag,
    serializeProperty,
    tooltip('Blinking arrow (image points right) next to the roller to tap in the hint rounds, pointing the way it rolls')
], MamamyPackPrint.prototype, "guideArrow", void 0);
__decorate([
    serializeSceneObjectFlag,
    serializeProperty,
    tooltip('Holds the pack + rollers; shrunk a little in the hint rounds only, to make room for the left arrow')
], MamamyPackPrint.prototype, "playArea", void 0);
MamamyPackPrint = __decorate([
    component()
], MamamyPackPrint);
exports.MamamyPackPrint = MamamyPackPrint;
