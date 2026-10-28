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
exports.MamamyTowerGame = void 0;
/**
 * MamamyTowerGame — Claw-drop stacking, endless: stack until the tower falls; FLOOR + BEST on screen.
 * The taller it gets, the more it sways and bends; a lopsided tower leans and collapses.
 *
 * Flow: INTRO → press TikTok Record → AIMING (claw swings holding an item, tap to drop)
 *       → DROPPING (falls straight down: x + rotation frozen) → landed on the top:
 *           upper item overlaps the one below by >= minOverlap → joins the tower, +1 floor
 *           otherwise → the item tips off and the whole tower tumbles with it → RESULT
 *       Every frame the tower sways and bends (upper floors tilt more). The part above any
 *       floor must keep its centre of mass over that floor, else it COLLAPSES → RESULT.
 *       Order: openingTextures, then the other products once each (random, narrow and wide
 *       alternating); after that more shuffled runs of the products, forever.
 *       The 19 shield comes as every 12th piece (12, 24, 36…) and also as the piece that beats
 *       the previous BEST (BEST 15 → piece 16), client 2026-10-09. Landing it pops the MEGA MAMAMY 19
 *       logo (shaking, with confetti) for popupSec, then play goes on until the tower falls.
 *       → RESULT (client 10-08), like Effect 1: a light black dim, the MEGA MAMAMY 19 logo (with a
 *         soft white glow) low on the screen, the floor count + BEST card above;
 *         a new BEST also gets confetti. The next round starts by itself after autoRestartSec
 *         (a tap restarts sooner).
 *
 * "Tower space" keeps each floor's straight-stack position (lx, ly = centre, y up, origin at
 * the bottom-centre of the first floor); it drives the balance maths. On screen the stack is
 * drawn as a bending chain: floor i is rotated by angle * i/(n-1), so the base stays flat.
 * Screen = 720x1280, physics = 32 px/m. Items come from a pre-built pool (Items/Item..Item (11));
 * floors that scroll far below the screen give their object back but still count for balance.
 */
let MamamyTowerGame = class MamamyTowerGame extends APJS.BasicScriptComponent {
    constructor() {
        super(...arguments);
        this.easyTextures = [];
        this.mediumTextures = [];
        this.hardTextures = [];
        this.openingTextures = [];
        this.digitTextures = [];
        this.minOverlap = 0.3;
        this.swayStartFloor = 2;
        this.swayPerFloor = 18;
        this.swayMax = 160;
        this.swaySpeed = 1.8;
        this.leanPerPx = 0.03;
        this.swingSpeed = 160;
        this.swingSpeedPerFloor = 6;
        this.swingSpeedMax = 300;
        this.swingRange = 190;
        this.itemScale = 0.53;
        this.sizedTextures = [];
        this.sizedScales = [];
        this.finaleScale = 0.5;
        this.shieldAfter = 11;
        this.popupSec = 3.2;
        this.autoRestartSec = 3.8;
        this.fallGravityScale = 8;
        this.itemPool = [];
        this.hideOnIntro = [];
        // Layout invariants measured from the built scene.
        this.PPU = 32;
        this.swingCenterX = -30;
        this.clawTipSpan = 169; // px between the middles of the two arms at scale 1
        this.heldTopOffset = 69; // item top sits 41% down the 169px claw (shield peeks above)
        this.keepTopY = -150; // tower top is scrolled to stay below this
        this.settleSpeed = 0.25; // m/s
        this.settleFrames = 6;
        this.collapseLoseSec = 1.0;
        this.hudDigitH = 40;
        this.resultDigitH = 36;
        this.resultBestH = 36;
        this.maxLeanDeg = 8;
        this.releaseBelowY = -760; // floors whose top is below this give their object back
        this.inited = false;
        this.startOnInit = false;
        this.recording = false; // the game is only playable while TikTok Record is on
        this.state = "INTRO";
        this.items = [];
        this.floors = [];
        this.sequence = [];
        this.wideMinPx = 200; // on-screen width from which a product counts as a wide base
        // Pivot = bottom-centre of the first floor (screen px); angle = tilt at the top (rad, CCW +).
        this.pivotX = 0;
        this.pivotY = 0;
        this.angle = 0;
        this.lean = 0; // degrees
        this.swayT = 0;
        this.clawBaseY = 0;
        this.clawX = 0;
        this.clawDir = 1;
        this.clawScale = 1;
        this.clawHalfH = 0;
        this.groundBaseY = 0;
        this.score = 0;
        this.best = 0; // best floor count this session
        this.popupT = -1; // >= 0 while the logo popup runs
        this.shownScore = -1;
        this.newBest = false;
        this.cardScale = 1; // one-row score pill under the logo, above TikTok's record button
        this.heldAnim = 0;
        this.lowFrames = 0;
        this.endTime = 0;
        this.resultTime = 0;
        this.retryDelay = 0.8;
        this.anim = [];
        this.confetti = [];
        this.tumbling = [];
        this.tumbleGravity = 1800; // px/s² for the animated collapse
        this.dominoStep = 0.22; // s between one floor and the next
        this.tumbleSpan = 0; // s until the lowest floor starts to fall
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
        if (!this.claw || !this.ground || this.itemPool.length === 0 || this.easyTextures.length === 0)
            return false;
        this.clawSt = this.claw.getComponent("ScreenTransform");
        this.clawBaseY = this.clawSt.anchoredPosition.y;
        this.clawHalfH = this.clawSt.sizeDelta.y / 2;
        if (this.clawBadge)
            this.badgeSt = this.clawBadge.getComponent("ScreenTransform");
        this.groundSt = this.ground.getComponent("ScreenTransform");
        this.groundRb = this.ground.getComponent("RigidBody2D");
        this.groundBaseY = this.groundSt.anchoredPosition.y;
        if (this.nextThumb)
            this.nextImg = this.nextThumb.getComponent("Image");
        for (const obj of this.itemPool) {
            if (!obj)
                continue;
            const it = new TowerItem();
            it.obj = obj;
            it.st = obj.getComponent("ScreenTransform");
            it.rb = obj.getComponent("RigidBody2D");
            it.col = obj.getComponent("BoxCollider2D");
            it.img = obj.getComponent("Image");
            this.items.push(it);
        }
        for (const obj of [this.logoPopup, this.resultCard, this.resultLogo, this.logoBand]) {
            const part = new AnimPart();
            if (obj) {
                part.st = obj.getComponent("ScreenTransform");
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
                layer.st = child.getComponent("ScreenTransform");
                layer.img = child.getComponent("Image");
                if (!layer.st || !layer.img)
                    continue;
                layer.baseY = layer.st.anchoredPosition.y;
                layer.slide = child.name.indexOf("Overlay") < 0;
                this.confetti.push(layer);
            }
        }
        if (this.logoBand)
            this.bandImg = this.logoBand.getComponent("Image");
        this.inited = true;
        this.resetGame();
        if (this.startOnInit) {
            this.startOnInit = false;
            this.startGame();
        }
        return true;
    }
    onUpdate(dt) {
        if (!this.initOnce() || this.paused())
            return;
        this.updateClaw(dt);
        if (this.state === "AIMING" || this.state === "DROPPING") {
            this.updateTower(dt);
            this.checkStability();
        }
        if (this.popupT >= 0)
            this.updatePopup(dt);
        if (this.state === "AIMING") {
            this.updateHeld(dt);
            this.updateScroll(dt);
        }
        else if (this.state === "DROPPING") {
            this.updateFalling();
        }
        else if (this.state === "COLLAPSING") {
            this.updateTumble(dt);
            this.endTime += dt;
            if (this.endTime >= this.collapseLoseSec + this.tumbleSpan)
                this.showResult();
        }
        else if (this.state === "RESULT") {
            this.resultTime += dt;
            this.updateResultAnim(this.resultTime);
            if (this.recording && this.resultTime >= this.autoRestartSec)
                this.restart();
        }
    }
    // ---------- Input / lifecycle ----------
    onTouch(event) {
        const t = event.args[0];
        if (t.phase !== APJS.TouchPhase.Began || !this.inited || this.paused())
            return;
        // The round starts from the Record button (onRecordStart), not from a tap.
        if (this.state === "AIMING")
            this.drop();
        else if (this.state === "RESULT" && this.recording && this.resultTime > this.retryDelay)
            this.restart();
    }
    // Straight into the next round: no intro screen, the player keeps stacking.
    restart() {
        this.resetGame();
        this.startGame();
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
        this.resetGame();
        this.startGame();
    }
    // Record stopped mid-round: the game freezes (no motion, touch or voice) until Record goes on again
    // (client 2026-10-09: "ấn dừng quay rồi vẫn chơi được"). The intro and result screens stay live.
    paused() {
        return !this.recording && this.state !== "INTRO" && this.state !== "RESULT";
    }
    onRecordEnd() {
        this.recording = false;
    }
    resetGame() {
        for (const it of this.items)
            this.parkItem(it);
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
        this.stopPopup();
        this.clawX = this.swingCenterX;
        this.clawDir = 1;
        this.setGroundY(this.groundBaseY);
        this.nextTex = this.pickTexture(0);
        this.setNextThumb();
        if (this.resultOverlay)
            this.resultOverlay.setEnabledInHierarchy(false);
        this.resetAnimParts();
        this.updateHud();
        if (this.introOverlay)
            this.introOverlay.setEnabledInHierarchy(true);
        this.setIntroHidden(true);
        this.state = "INTRO";
    }
    startGame() {
        if (this.introOverlay)
            this.introOverlay.setEnabledInHierarchy(false);
        this.setIntroHidden(false);
        this.spawnHeld();
        this.state = "AIMING";
    }
    // The intro screen draws its own claw and tower, so the live claw and HUD wait for Record.
    setIntroHidden(hidden) {
        for (const obj of this.hideOnIntro)
            if (obj)
                obj.setEnabledInHierarchy(!hidden);
    }
    // ---------- Claw ----------
    currentSwingSpeed() {
        return Math.min(this.swingSpeed + this.score * this.swingSpeedPerFloor, this.swingSpeedMax);
    }
    updateClaw(dt) {
        if (this.state !== "RESULT") {
            this.clawX += this.clawDir * this.currentSwingSpeed() * dt;
            const lo = this.swingCenterX - this.swingRange, hi = this.swingCenterX + this.swingRange;
            if (this.clawX > hi) {
                this.clawX = 2 * hi - this.clawX;
                this.clawDir = -1;
            }
            if (this.clawX < lo) {
                this.clawX = 2 * lo - this.clawX;
                this.clawDir = 1;
            }
        }
        // Arms grip the held item's width; open wide when empty.
        const target = this.held ? clamp(this.held.w / this.clawTipSpan, 0.6, 2.4) : 1;
        this.clawScale += (target - this.clawScale) * Math.min(1, dt * 10);
        this.clawSt.anchoredPosition = new APJS.Vector2f(this.clawX, this.clawBaseY);
        this.clawSt.scale = new APJS.Vector2f(this.clawScale, 1);
        if (this.badgeSt)
            this.badgeSt.scale = new APJS.Vector2f(1 / this.clawScale, 1);
    }
    // ---------- Items ----------
    // One round = the opening products in order, then every other product once in random
    // order with narrow and wide ones alternating (a narrow top is followed by a wide
    // base so the next drop stays fair), then the finale piece.
    buildSequence() {
        const seq = this.openingTextures.filter((t) => !!t);
        this.appendRun(seq, false);
        return seq;
    }
    // One run of products (all of them, or all but the openers) shuffled, narrow and wide alternating.
    appendRun(seq, withOpeners) {
        const all = this.easyTextures.concat(this.mediumTextures, this.hardTextures);
        const rest = all.filter((t) => t && (withOpeners || this.openingTextures.indexOf(t) < 0));
        const wide = shuffle(rest.filter((t) => this.scaledWidth(t) >= this.wideMinPx));
        const narrow = shuffle(rest.filter((t) => this.scaledWidth(t) < this.wideMinPx));
        let takeNarrow = narrow.length >= wide.length;
        while (wide.length > 0 || narrow.length > 0) {
            const fromNarrow = narrow.length > 0 && (takeNarrow || wide.length === 0);
            seq.push(fromNarrow ? narrow.pop() : wide.pop());
            takeNarrow = !fromNarrow;
        }
    }
    // Piece `floor` (0-based) is the 19 shield: every (shieldAfter + 1)th piece, and the piece that
    // beats the previous BEST (the first round has none to beat).
    isShieldPiece(floor) {
        if (!this.finaleTexture)
            return false;
        return (floor + 1) % (this.shieldAfter + 1) === 0 || (this.best > 0 && floor === this.best);
    }
    // Shields sit between the products; endless: when the planned products run out, another
    // shuffled run of every product follows.
    pickTexture(floor) {
        if (this.isShieldPiece(floor))
            return this.finaleTexture;
        if (this.sequence.length === 0)
            return this.easyTextures[0];
        let k = floor;
        for (let f = 0; f < floor; f++)
            if (this.isShieldPiece(f))
                k--;
        while (k >= this.sequence.length)
            this.appendRun(this.sequence, true);
        return this.sequence[k];
    }
    scaleFor(tex) {
        if (tex === this.finaleTexture)
            return this.finaleScale;
        const i = this.sizedTextures.indexOf(tex);
        return i >= 0 && i < this.sizedScales.length ? this.sizedScales[i] : this.itemScale;
    }
    scaledWidth(tex) {
        return (tex.getWidth() > 0 ? tex.getWidth() : 400) * this.scaleFor(tex);
    }
    // A free pool object; when all are busy, the lowest floor that has scrolled far
    // below the screen gives its object back (its data still counts for balance).
    acquireItem() {
        for (const it of this.items)
            if (!it.inUse)
                return it;
        for (const f of this.floors) {
            if (!f.slot)
                continue;
            if (f.cy + f.h / 2 > this.releaseBelowY)
                break;
            const it = f.slot;
            f.slot = undefined;
            this.parkItem(it);
            return it;
        }
        return undefined;
    }
    spawnHeld() {
        const it = this.acquireItem();
        if (!it)
            return;
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
    updateHeld(dt) {
        const it = this.held;
        if (!it)
            return;
        this.heldAnim = Math.min(1, this.heldAnim + dt / 0.2);
        const k = 1 - Math.pow(1 - this.heldAnim, 3);
        const topY = this.clawBaseY + this.clawHalfH - this.heldTopOffset + (1 - k) * 420;
        this.placeItem(it, this.clawX, topY - it.h / 2, 0);
    }
    drop() {
        const it = this.held;
        if (!it || this.heldAnim < 1)
            return;
        it.rb.velocity = new APJS.Vector2f(0, 0);
        it.rb.freezeX = true; // falls straight down and stays where it lands
        it.rb.freezeZ = true; // no spinning while falling
        it.rb.gravityScale = this.fallGravityScale;
        it.rb.static = false;
        it.rb.useGravity = true;
        this.held = undefined;
        this.falling = it;
        this.lowFrames = 0;
        this.state = "DROPPING";
    }
    updateFalling() {
        const it = this.falling;
        if (!it)
            return;
        const p = it.rb.position;
        it.x = p.x * this.PPU;
        it.y = p.y * this.PPU;
        if (it.y < -900) {
            this.showResult();
            return;
        }
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
            if (touching && dy > top.h / 2) {
                this.onLanded(it);
                return;
            }
            if (dy < top.h / 2) {
                this.showResult();
                return;
            }
        }
        const v = it.rb.velocity;
        if (v.x * v.x + v.y * v.y < this.settleSpeed * this.settleSpeed)
            this.lowFrames++;
        else
            this.lowFrames = 0;
        if (this.lowFrames >= this.settleFrames)
            this.onLanded(it);
    }
    onLanded(it) {
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
        }
        else {
            // Measure the landing in the top floor's own (tilted) frame.
            const top = this.floors[this.floors.length - 1];
            const c = Math.cos(top.a), s = Math.sin(top.a);
            const ox = it.x - top.jx, oy = it.y - top.jy;
            const dx = ox * c + oy * s;
            const dy = -ox * s + oy * c;
            if (dy <= top.h / 2) {
                this.showResult();
                return;
            }
            f.lx = top.lx + dx;
            if (!this.landingOk(f, top)) {
                this.topple(it, dx < 0 ? -1 : 1);
                return;
            }
            f.ly = top.ly + top.h / 2 + f.h / 2; // sits exactly on the top
        }
        this.setStatic(it); // part of the tower now: moved only by the sway layout
        this.floors.push(f);
        this.falling = undefined;
        this.score++;
        this.layoutTower();
        this.updateHud();
        this.state = "AIMING";
        // The shield is on: the logo pops first, the claw brings the next piece once it has gone.
        if (it.img.texture === this.finaleTexture)
            this.startPopup();
        else
            this.spawnHeld();
    }
    // >= minOverlap of the upper item's width must rest on the lower item; a wider
    // item must also keep its centre over the lower one or it looks impossible.
    landingOk(up, low) {
        const overlap = Math.min(up.lx + up.w / 2, low.lx + low.w / 2) - Math.max(up.lx - up.w / 2, low.lx - low.w / 2);
        if (overlap / up.w < this.minOverlap)
            return false;
        if (up.w > low.w && Math.abs(up.lx - low.lx) > low.w / 2)
            return false;
        return true;
    }
    topple(it, dir) {
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
    updateTower(dt) {
        const n = this.floors.length;
        if (n === 0)
            return;
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
    layoutTower() {
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
            if (f.slot)
                this.placeItem(f.slot, f.cx, f.cy, f.a);
        }
    }
    // Each floor must carry the centre of mass of everything above it. The lean (from
    // off-centre weight) adds a sideways shift that grows with how high that mass sits.
    // The sway is visual only: it never knocks over a tower that was stacked well.
    checkStability() {
        const n = this.floors.length;
        if (n < 2)
            return;
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
        if (gx < base.lx - base.w / 2 || gx > base.lx + base.w / 2)
            this.collapse(gx > 0 ? 1 : -1);
    }
    centerOfMass(from) {
        let m = 0, x = 0, y = 0;
        for (let i = from; i < this.floors.length; i++) {
            const f = this.floors[i];
            const a = f.w * f.h;
            m += a;
            x += f.lx * a;
            y += f.ly * a;
        }
        return m > 0 ? new APJS.Vector2f(x / m, y / m) : new APJS.Vector2f(0, 0);
    }
    // Losing balance anywhere brings the whole tower down toward the heavy side.
    collapse(dir) {
        this.tumbleFloors(0, dir);
        if (this.held)
            this.held.obj.setEnabledInHierarchy(false);
        this.endTime = 0;
        this.state = "COLLAPSING";
    }
    // Floors stay static bodies (the engine ignores static -> dynamic switches mid-game),
    // so the fall is animated here like dominoes: the top floor tips first, then each
    // floor below follows one beat later. Floors already scrolled below the screen
    // fall together with the lowest visible one, so the player never waits on them.
    tumbleFloors(from, dir) {
        const n = this.floors.length;
        this.tumbleSpan = 0;
        let beat = 0;
        for (let i = n - 1; i >= from; i--) {
            const f = this.floors[i];
            if (!f.slot)
                continue;
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
            if (f.cy + f.h / 2 > -640)
                beat++; // still on screen: the next one waits a beat
            this.tumbleSpan = Math.max(this.tumbleSpan, p.delay);
            this.tumbling.push(p);
        }
    }
    updateTumble(dt) {
        for (const p of this.tumbling) {
            if (p.delay > 0) {
                p.delay -= dt;
                continue;
            }
            p.vy -= this.tumbleGravity * dt;
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.rot += p.spin * dt;
            if (p.y > -1400)
                this.placeItem(p.it, p.x, p.y, p.rot);
        }
    }
    // Keep the drop gap visible: slide the tower + ground down as it grows.
    updateScroll(dt) {
        const n = this.floors.length;
        if (n === 0)
            return;
        const top = this.floors[n - 1];
        const over = top.cy + top.h / 2 - this.keepTopY;
        if (over < 0.5)
            return;
        const step = over * Math.min(1, dt * 4);
        this.pivotY -= step;
        this.setGroundY(this.groundSt.anchoredPosition.y - step);
        this.layoutTower();
    }
    placeItem(it, x, y, rot) {
        it.x = x;
        it.y = y;
        it.st.anchoredPosition = new APJS.Vector2f(x, y);
        it.st.rotation = rot * 180 / Math.PI;
        it.rb.position = new APJS.Vector2f(x / this.PPU, y / this.PPU);
        it.rb.rotation = rot;
    }
    setStatic(it) {
        it.rb.static = true;
        it.rb.useGravity = false;
        it.rb.freezeX = false;
        it.rb.freezeZ = false;
        it.rb.velocity = new APJS.Vector2f(0, 0);
        it.rb.angularVelocity = 0;
        it.rb.rotation = 0;
        it.st.rotation = 0;
    }
    parkItem(it) {
        this.setStatic(it);
        it.st.scale = new APJS.Vector2f(1, 1);
        this.placeItem(it, 0, -1400, 0);
        it.obj.setEnabledInHierarchy(false);
        it.inUse = false;
    }
    setGroundY(y) {
        this.groundSt.anchoredPosition = new APJS.Vector2f(this.groundSt.anchoredPosition.x, y);
        if (this.groundRb)
            this.groundRb.position = new APJS.Vector2f(this.groundSt.anchoredPosition.x / this.PPU, y / this.PPU);
    }
    // ---------- UI ----------
    setNextThumb() {
        if (this.nextImg && this.nextTex)
            this.nextImg.texture = this.nextTex;
    }
    updateHud() {
        this.setNumber(this.scoreDigits, this.score, this.hudDigitH);
        this.setNumber(this.bestDigits, Math.max(this.best, this.score), this.hudDigitH);
    }
    // The 19 shield landed: the MEGA MAMAMY 19 logo pops in, shakes with confetti, then shrinks away.
    startPopup() {
        this.popupT = 0;
        if (this.logoPopup)
            this.logoPopup.setEnabledInHierarchy(true);
        if (this.winEffect)
            this.winEffect.setEnabledInHierarchy(true);
        this.updatePopup(0);
    }
    stopPopup() {
        this.popupT = -1;
        if (this.logoPopup)
            this.logoPopup.setEnabledInHierarchy(false);
        if (this.winEffect)
            this.winEffect.setEnabledInHierarchy(false);
    }
    updatePopup(dt) {
        this.popupT += dt;
        const t = this.popupT, end = this.popupSec;
        const logo = this.anim[0];
        const kIn = easeOutBack(seg(t, 0, 0.4));
        const kOut = seg(t, end - 0.35, end);
        const sc = Math.max(0.001, kIn * (1 - kOut) * (1 + 0.025 * Math.sin(t * 5)));
        this.setPart(logo, 0, 0, sc);
        if (logo.st)
            logo.st.rotation = 3 * Math.sin(t * 6) * (1 - kOut);
        this.updateConfetti(t, 1 - kOut);
        if (t >= end) {
            this.stopPopup();
            if (this.state === "AIMING" && !this.held)
                this.spawnHeld();
        }
    }
    // Confetti slides down from above the screen; `fade` scales its opacity.
    updateConfetti(t, fade) {
        const slideK = 1 - Math.pow(1 - seg(t, 0, 1.0), 3);
        for (const layer of this.confetti) {
            if (layer.slide) {
                layer.st.anchoredPosition = new APJS.Vector2f(layer.st.anchoredPosition.x, layer.baseY + (1 - slideK) * 1280);
                layer.img.opacity = seg(t, 0, 0.3) * fade;
            }
            else {
                layer.img.opacity = seg(t, 0, 0.8) * fade;
            }
        }
    }
    // The tower fell (or the drop missed): a white card with the floor count and BEST, then the
    // next round starts by itself (client 10-08: no logo, no PLAY AGAIN here).
    showResult() {
        this.state = "RESULT";
        this.resultTime = 0;
        this.stopPopup();
        if (this.held)
            this.parkItem(this.held); // don't leave an item hanging behind the result screen
        this.held = undefined;
        // Beating an earlier BEST counts as a record; the very first round has nothing to beat.
        this.newBest = this.best > 0 && this.score > this.best;
        if (this.score > this.best)
            this.best = this.score;
        this.updateHud();
        if (this.winEffect)
            this.winEffect.setEnabledInHierarchy(this.newBest);
        this.setNumber(this.resultBestDigits, this.best, this.resultBestH);
        this.shownScore = -1;
        if (this.resultOverlay)
            this.resultOverlay.setEnabledInHierarchy(true);
        this.updateResultAnim(0);
    }
    // The logo pops in with its glow (new BEST: bursts in and keeps a gentle wobble, with confetti;
    // otherwise it drops in from above). The card pops in above and the floor count ticks up.
    updateResultAnim(t) {
        if (this.bandImg)
            this.bandImg.opacity = seg(t, 0.1, 0.4);
        const logo = this.anim[2], glow = this.anim[3];
        if (this.newBest) {
            let sl = Math.max(0.001, easeOutBack(seg(t, 0.1, 0.65)));
            if (t > 0.95)
                sl = 1 + 0.03 * Math.sin((t - 0.95) * 3);
            this.setPart(logo, 0, 0, sl);
            this.setPart(glow, 0, 0, sl);
            this.updateConfetti(t, 1);
        }
        else {
            const k = easeOutBack(seg(t, 0.1, 0.6));
            this.setPart(logo, 0, (1 - k) * 320, Math.max(0.001, 0.6 + 0.4 * k));
            this.setPart(glow, 0, (1 - k) * 320, Math.max(0.001, 0.6 + 0.4 * k));
        }
        this.setPart(this.anim[1], 0, 0, this.cardScale * easeOutBack(seg(t, 0.3, 0.7)));
        const n = Math.round(this.score * seg(t, 0.2, 0.8));
        if (n !== this.shownScore) {
            this.shownScore = n;
            this.setNumber(this.resultDigits, n, this.resultDigitH);
        }
    }
    setImage(obj, tex, height) {
        if (!obj || !tex)
            return;
        const img = obj.getComponent("Image");
        const st = obj.getComponent("ScreenTransform");
        if (!img || !st)
            return;
        img.texture = tex;
        const w = tex.getWidth(), h = tex.getHeight();
        st.sizeDelta = new APJS.Vector2f(h > 0 ? height * w / h : height, height);
    }
    // Compose a number from the digit images: the box's child Images are digit slots,
    // laid out centred; unused slots are hidden.
    setNumber(box, n, height) {
        if (!box || this.digitTextures.length < 10)
            return;
        const slots = box.getChildren();
        const str = String(Math.max(0, Math.floor(n)));
        const widths = [];
        let total = 0;
        for (let i = 0; i < str.length && i < slots.length; i++) {
            const t = this.digitTextures[str.charCodeAt(i) - 48];
            const w = t.getHeight() > 0 ? height * t.getWidth() / t.getHeight() : height * 0.7;
            widths.push(w);
            total += w;
        }
        const gap = -height * 0.04;
        total += gap * Math.max(0, widths.length - 1);
        let x = -total / 2;
        for (let i = 0; i < slots.length; i++) {
            const slot = slots[i];
            if (i >= widths.length) {
                slot.setEnabledInHierarchy(false);
                continue;
            }
            slot.setEnabledInHierarchy(true);
            this.setImage(slot, this.digitTextures[str.charCodeAt(i) - 48], height);
            const st = slot.getComponent("ScreenTransform");
            st.anchoredPosition = new APJS.Vector2f(x + widths[i] / 2, 0);
            x += widths[i] + gap;
        }
    }
    setPart(part, dx, dy, scale) {
        if (!part.st)
            return;
        const s = Math.max(0.001, scale);
        part.st.anchoredPosition = new APJS.Vector2f(part.baseX + dx, part.baseY + dy);
        part.st.scale = new APJS.Vector2f(s, s);
    }
    resetAnimParts() {
        for (const part of this.anim) {
            this.setPart(part, 0, 0, 1);
            if (part.st)
                part.st.rotation = 0;
        }
        for (const layer of this.confetti) {
            layer.st.anchoredPosition = new APJS.Vector2f(layer.st.anchoredPosition.x, layer.baseY);
            layer.img.opacity = 1;
        }
    }
};
__decorate([
    header("Theme & Assets"),
    serializeProperty,
    tooltip('Products (wide ones)')
], MamamyTowerGame.prototype, "easyTextures", void 0);
__decorate([
    serializeProperty,
    tooltip('Products (bottles / pouches)')
], MamamyTowerGame.prototype, "mediumTextures", void 0);
__decorate([
    serializeProperty,
    tooltip('Products (tall and narrow)')
], MamamyTowerGame.prototype, "hardTextures", void 0);
__decorate([
    serializeProperty,
    tooltip('Dropped first, in this order; the other products follow once each in random order')
], MamamyTowerGame.prototype, "openingTextures", void 0);
__decorate([
    serializeProperty,
    tooltip('Last piece: placing it on the tower wins the round (19 shield)')
], MamamyTowerGame.prototype, "finaleTexture", void 0);
__decorate([
    serializeSceneObjectFlag,
    serializeProperty,
    tooltip('Confetti shown while the MEGA MAMAMY 19 logo pops')
], MamamyTowerGame.prototype, "winEffect", void 0);
__decorate([
    serializeProperty,
    tooltip('Digits 0-9 in order')
], MamamyTowerGame.prototype, "digitTextures", void 0);
__decorate([
    header("Gameplay Tuning"),
    serializeProperty,
    tooltip('Min overlap of the upper item on the one below'),
    slider(0.05, 0.9, 0.05)
], MamamyTowerGame.prototype, "minOverlap", void 0);
__decorate([
    serializeProperty,
    tooltip('Floors before the tower starts to sway'),
    spinBox(0, 20, 1)
], MamamyTowerGame.prototype, "swayStartFloor", void 0);
__decorate([
    serializeProperty,
    tooltip('Extra sway at the tower top per floor (px)'),
    slider(0, 40, 1)
], MamamyTowerGame.prototype, "swayPerFloor", void 0);
__decorate([
    serializeProperty,
    tooltip('Max sway at the tower top (px)'),
    slider(0, 200, 5)
], MamamyTowerGame.prototype, "swayMax", void 0);
__decorate([
    serializeProperty,
    tooltip('Sway speed (rad/s)'),
    slider(0.5, 5, 0.1)
], MamamyTowerGame.prototype, "swaySpeed", void 0);
__decorate([
    serializeProperty,
    tooltip('Lean per px of off-centre weight (deg/px)'),
    slider(0, 0.1, 0.005)
], MamamyTowerGame.prototype, "leanPerPx", void 0);
__decorate([
    serializeProperty,
    tooltip('Claw speed (px/s)'),
    slider(60, 500, 10)
], MamamyTowerGame.prototype, "swingSpeed", void 0);
__decorate([
    serializeProperty,
    tooltip('Extra claw speed per floor (px/s)'),
    slider(0, 40, 1)
], MamamyTowerGame.prototype, "swingSpeedPerFloor", void 0);
__decorate([
    serializeProperty,
    tooltip('Max claw speed (px/s)'),
    slider(60, 700, 10)
], MamamyTowerGame.prototype, "swingSpeedMax", void 0);
__decorate([
    serializeProperty,
    tooltip('Claw swing half-range (px)'),
    slider(50, 300, 5)
], MamamyTowerGame.prototype, "swingRange", void 0);
__decorate([
    serializeProperty,
    tooltip('Product size vs source image'),
    slider(0.3, 1, 0.01)
], MamamyTowerGame.prototype, "itemScale", void 0);
__decorate([
    serializeProperty,
    tooltip('Products drawn at their own size (detergent pouch, dry towels)')
], MamamyTowerGame.prototype, "sizedTextures", void 0);
__decorate([
    serializeProperty,
    tooltip('Size vs source image for each sizedTextures entry')
], MamamyTowerGame.prototype, "sizedScales", void 0);
__decorate([
    serializeProperty,
    tooltip('Finale piece size vs source image'),
    slider(0.2, 1.2, 0.01)
], MamamyTowerGame.prototype, "finaleScale", void 0);
__decorate([
    serializeProperty,
    tooltip('Products between two 19 shields (11 → the shield is piece 12, 24, 36…)'),
    spinBox(1, 40, 1)
], MamamyTowerGame.prototype, "shieldAfter", void 0);
__decorate([
    serializeProperty,
    tooltip('How long the MEGA MAMAMY 19 logo pops and shakes (s)'),
    slider(0.8, 5, 0.1)
], MamamyTowerGame.prototype, "popupSec", void 0);
__decorate([
    serializeProperty,
    tooltip('Result time before the next round starts by itself (s)'),
    slider(1, 8, 0.1)
], MamamyTowerGame.prototype, "autoRestartSec", void 0);
__decorate([
    serializeProperty,
    tooltip('Fall speed multiplier'),
    slider(1, 16, 0.5)
], MamamyTowerGame.prototype, "fallGravityScale", void 0);
__decorate([
    serializeSceneObjectFlag,
    header("Advanced — Scene Wiring"),
    serializeProperty
], MamamyTowerGame.prototype, "itemPool", void 0);
__decorate([
    serializeSceneObjectFlag,
    serializeProperty
], MamamyTowerGame.prototype, "claw", void 0);
__decorate([
    serializeSceneObjectFlag,
    serializeProperty,
    tooltip('Claw child that must not stretch with the arms (19 shield)')
], MamamyTowerGame.prototype, "clawBadge", void 0);
__decorate([
    serializeSceneObjectFlag,
    serializeProperty,
    tooltip('Hidden on the intro screen, shown when the round starts')
], MamamyTowerGame.prototype, "hideOnIntro", void 0);
__decorate([
    serializeSceneObjectFlag,
    serializeProperty
], MamamyTowerGame.prototype, "ground", void 0);
__decorate([
    serializeSceneObjectFlag,
    serializeProperty
], MamamyTowerGame.prototype, "nextThumb", void 0);
__decorate([
    serializeSceneObjectFlag,
    serializeProperty
], MamamyTowerGame.prototype, "introOverlay", void 0);
__decorate([
    serializeSceneObjectFlag,
    serializeProperty
], MamamyTowerGame.prototype, "resultOverlay", void 0);
__decorate([
    serializeSceneObjectFlag,
    serializeProperty,
    tooltip('MEGA MAMAMY 19 logo that pops when the shield lands')
], MamamyTowerGame.prototype, "logoPopup", void 0);
__decorate([
    serializeSceneObjectFlag,
    serializeProperty,
    tooltip('HUD: digit slots for the floor count')
], MamamyTowerGame.prototype, "scoreDigits", void 0);
__decorate([
    serializeSceneObjectFlag,
    serializeProperty,
    tooltip('HUD: digit slots for BEST')
], MamamyTowerGame.prototype, "bestDigits", void 0);
__decorate([
    serializeSceneObjectFlag,
    serializeProperty,
    tooltip('Score card (child of resultOverlay)')
], MamamyTowerGame.prototype, "resultCard", void 0);
__decorate([
    serializeSceneObjectFlag,
    serializeProperty,
    tooltip('Score card: digit slots for the floor count')
], MamamyTowerGame.prototype, "resultDigits", void 0);
__decorate([
    serializeSceneObjectFlag,
    serializeProperty,
    tooltip('Score card: digit slots for BEST')
], MamamyTowerGame.prototype, "resultBestDigits", void 0);
__decorate([
    serializeSceneObjectFlag,
    serializeProperty,
    tooltip('MEGA MAMAMY 19 logo on the result screen (child of resultOverlay)')
], MamamyTowerGame.prototype, "resultLogo", void 0);
__decorate([
    serializeSceneObjectFlag,
    serializeProperty,
    tooltip('Soft white glow under the result logo; it moves with the logo')
], MamamyTowerGame.prototype, "logoBand", void 0);
MamamyTowerGame = __decorate([
    component()
], MamamyTowerGame);
exports.MamamyTowerGame = MamamyTowerGame;
class TowerItem {
    constructor() {
        this.inUse = false;
        this.w = 0;
        this.h = 0;
        this.x = 0;
        this.y = 0;
    }
}
// One storey. lx/ly: straight-stack centre (balance maths). jx/jy: bottom-centre on screen,
// cx/cy: centre on screen, a: tilt (rad) from the bending layout. `slot` is the pool object
// drawing it; floors far below the screen drop their slot but keep counting for balance.
class Floor {
    constructor() {
        this.lx = 0;
        this.ly = 0;
        this.w = 0;
        this.h = 0;
        this.jx = 0;
        this.jy = 0;
        this.cx = 0;
        this.cy = 0;
        this.a = 0;
    }
}
class TumblePart {
    constructor() {
        this.x = 0;
        this.y = 0;
        this.rot = 0;
        this.vx = 0;
        this.vy = 0;
        this.spin = 0;
        this.delay = 0;
    }
}
class ConfettiLayer {
    constructor() {
        this.baseY = 0;
        this.slide = true;
    }
}
class AnimPart {
    constructor() {
        this.baseX = 0;
        this.baseY = 0;
    }
}
function seg(t, a, b) {
    return clamp((t - a) / (b - a), 0, 1);
}
function easeOutBack(x) {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
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
function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
}
