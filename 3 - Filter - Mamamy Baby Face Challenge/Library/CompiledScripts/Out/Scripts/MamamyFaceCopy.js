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
exports.MamamyFaceCopy = void 0;
/**
 * MamamyFaceCopy — "Copy the baby face" as an expression roulette with photo capture
 * (client feedback 2026-10-09, reference: the TikTok "emoji imitation" filter).
 *
 * All twelve emoji (eleven baby faces + the 19 shield) ride a ring around the player's face and
 * follow it (face tracking). The ring spins, slows down and stops with a random emoji at the top
 * (12 o'clock): the others shrink away, the chosen one sticks to the top edge of a polaroid frame
 * that appears around the face. The player copies it; holdSec (1 s) later a photo is taken, with no
 * expression check (client 2026-10-09; the version that read the face is in Build/backup_1009/):
 * a flash, the polaroid freezes with the player's face (camera capture) and flies up to be pinned
 * in a row at the top of the screen; then the ring comes back and spins again. A round is
 * roundCards faces — always the requiredEmoji (angry, pout, teeth grin; client 2026-10-09), the
 * rest random — in random order, and then the 19 shield (laugh-squint emoji). The shield photo ends the
 * round: the photos of the round come back one by one, big in the frame's place: every full-screen
 * flash cuts to the next photo, each at a different tilt, with a hard jolt (REPLAY, client
 * 2026-10-09); then they jump into a grid on the upper half and the 19 shield flips, flies to the shield's spot in the MEGA MAMAMY 19 logo and
 * the logo bursts out of it (FINALE → RESULT: photo grid + logo + confetti). No losing.
 *
 * emojiClass names the expression each emoji shows (0 tongue / open mouth, 1 pout, 2 wink, 3 sad,
 * 4 angry, 5 smile / grin, 6 laugh); it only keeps two alike emoji from coming one after another.
 *
 * Photos: APJS.CaptureFrameHelper copies the 3D Camera's render texture (it renders first, so the
 * copy is the camera feed without our UI). The engine ignores the crop rect, so the whole frame is
 * captured and the pins use the PhotoCrop material (Assets/Materials/PhotoCrop.omtl: uv * _Tiling +
 * _UVOffset) to show exactly the polaroid's photo window, as it looked when the photo was taken.
 * One capture per photo, at most roundCards + 1 per round, dropped on restart.
 *
 * The intro already shows the ring, standing still around the face, under RECORD TO PLAY (at chest
 * height, clear of the face); it starts spinning when the game starts.
 * Flow: INTRO → press TikTok Record (touch does nothing) → SPIN → LAND → MATCH → SNAP → SPIN … →
 *       REPLAY → FINALE → RESULT (photo grid + logo + confetti, no PLAY AGAIN) → Record again.
 * Poses are screen-space centres (720x1280, origin at the centre, y up).
 */
function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = a[i];
        a[i] = a[j];
        a[j] = tmp;
    }
    return a;
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
// One pinned polaroid: the root image is the photo, children are the frame and the small emoji.
class Pin {
    constructor(obj) {
        this.fromX = 0;
        this.fromY = 0;
        this.fromS = 1;
        this.fromR = 0;
        this.toX = 0;
        this.toY = 0;
        this.toS = 1;
        this.toR = 0;
        this.t = -1;
        this.sec = 0;
        this.delay = 0;
        this.obj = obj;
        this.st = obj.getComponent("ScreenTransform");
        this.photo = obj.getComponent("Image");
        this.photo.stretchMode = APJS.StretchMode.Stretch;
        for (const c of obj.getChildren()) {
            if (c.name.indexOf("Emoji") < 0)
                continue;
            this.emoji = c.getComponent("Image");
            this.emojiSt = c.getComponent("ScreenTransform");
        }
    }
}
class RingSlot {
    constructor(obj) {
        this.obj = obj;
        this.st = obj.getComponent("ScreenTransform");
        this.img = obj.getComponent("Image");
    }
}
// The editor may hand SceneObject array entries over as the object's ScreenTransform: use its owner.
function asObject(ref) {
    if (!ref)
        return undefined;
    if (ref.getComponent)
        return ref;
    return ref.getSceneObject ? ref.getSceneObject() : undefined;
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
function easeInOut(k) {
    return k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
}
let MamamyFaceCopy = class MamamyFaceCopy extends APJS.BasicScriptComponent {
    constructor() {
        super(...arguments);
        this.emojiTextures = [];
        this.emojiClass = [];
        this.roundCards = 6;
        this.requiredEmoji = [];
        this.logoW = 560;
        this.logoShieldX = 0.3674;
        this.logoShieldY = 0.1429;
        this.logoShieldH = 0.6851;
        this.holdSec = 3;
        this.spinSec = 2.0;
        this.snapSec = 0.9;
        this.demoMode = 0;
        this.ringItems = [];
        this.pins = [];
        this.NAMES = ["TONGUE", "POUT", "WINK", "SAD", "ANGRY", "SMILE", "LAUGH"];
        // Polaroid card 500x666 (image 524x690 with its shadow), photo window 440x551, 30 px border, 85 px
        // strip, all × FRAME_K on screen; the card centre is FRAME_OFF below the photo centre. The pins are
        // built at ×1 and drawn at FRAME_K while they are big. Internal players 2026-10-10: frame ×1.2 and
        // taller (faces held close to the phone were cut off); the card spans y -400..399 on screen.
        this.FRAME_K = 1.2;
        this.FRAME_OFF = 27.5;
        this.PHOTO_W = 440;
        this.PHOTO_H = 551;
        this.PHOTO_Y = 32; // photo window centre
        this.BADGE_Y = 372; // chosen emoji centre, on the frame's top edge
        this.BADGE_H = 250;
        this.LAND_SEC = 0.8;
        this.RING_UP = 0.18; // ring centre above the face box centre (share of face height)
        this.SHIELD_H = 290;
        this.HOLD_W = 456;
        // Pinned row at the top (frame centres), and the result grid on the upper half.
        this.ROW_Y = 550;
        this.ROW_DX = 86;
        this.ROW_S = 0.16;
        this.GRID_S = 0.3;
        this.REPLAY_SEC = 0.8;
        this.REPLAY_ROT = [-7, 6, -4, 8, -6, 5, -3]; // each photo in the end replay
        this.TILT = [-5, 4, -3, 5, -4, 3, -2];
        this.burstSec = 0.55;
        this.logoH = 220;
        this.inited = false;
        this.startOnInit = false;
        this.recording = false; // the game is only playable while TikTok Record is on
        this.state = "INTRO";
        this.stateT = 0;
        this.t = 0;
        this.order = [];
        this.step = 0;
        this.pinViews = [];
        this.flashT = -1;
        this.ringViews = [];
        this.ringAng = 0; // angle of emoji 0 on the ring (rad, 0 = right, CCW)
        this.ringFrom = 0;
        this.ringTo = 0;
        this.spinShow0 = 0; // ring already shown when the spin starts (1 when coming from the intro)
        this.landX = 0;
        this.landY = 0;
        this.finX = 0;
        this.finY = 0;
        // tracked face (screen units), smoothed; defaults = a face in the middle
        this.faceX = 0;
        this.faceY = 120;
        this.faceW = 270;
        this.faceH = 265;
        this.landT = -1; // emoji pop after the roulette lands
        this.replayIdx = -1; // photo shown in the end replay
        this.anim = [];
        this.confetti = [];
        this.holdT = 0;
        this.guideHome = false;
        this.guideY = 0; // time since the emoji landed on the frame
    }
    onStart() {
        APJS.EventManager.getGlobalEmitter().on(APJS.EventType.RecordStart, this.onRecordStart, this);
        APJS.EventManager.getGlobalEmitter().on(APJS.EventType.RecordEnd, this.onRecordEnd, this);
    }
    onDestroy() {
        APJS.EventManager.getGlobalEmitter().off(APJS.EventType.RecordStart, this.onRecordStart, this);
        APJS.EventManager.getGlobalEmitter().off(APJS.EventType.RecordEnd, this.onRecordEnd, this);
    }
    // Serialized refs are only populated after onStart, so wire everything lazily.
    initOnce() {
        if (this.inited)
            return true;
        if (!this.badge || !this.polaroid || this.pins.length < 2 || this.ringItems.length < 2 || this.emojiTextures.length < 2 ||
            this.emojiClass.length < this.emojiTextures.length)
            return false;
        this.camera = this.cameraObject ? this.cameraObject.getComponent("Camera") : undefined;
        for (const ref of this.pins) {
            const obj = asObject(ref);
            if (obj)
                this.pinViews.push(new Pin(obj));
        }
        for (let i = 0; i < this.ringItems.length && i < this.emojiTextures.length; i++) {
            const obj = asObject(this.ringItems[i]);
            if (!obj)
                continue;
            const r = new RingSlot(obj);
            r.img.texture = this.emojiTextures[i];
            this.ringViews.push(r);
        }
        this.badgeSt = this.badge.getComponent("ScreenTransform");
        this.badgeImg = this.badge.getComponent("Image");
        if (this.badgeBack)
            this.badgeBack.setEnabledInHierarchy(false); // not used by the ring design
        if (this.holdFill)
            this.fillSt = this.holdFill.getComponent("ScreenTransform");
        if (this.flash)
            this.flashImg = this.flash.getComponent("Image");
        for (const obj of [this.resultLogo, this.introButton]) {
            const part = new AnimPart();
            if (obj) {
                part.st = obj.getComponent("ScreenTransform");
                part.baseX = part.st.anchoredPosition.x;
                part.baseY = part.st.anchoredPosition.y;
            }
            this.anim.push(part);
        }
        const logoImg = this.resultLogo ? this.resultLogo.getComponent("Image") : undefined;
        if (logoImg && logoImg.texture && this.anim[0].st) {
            this.logoH = this.logoW * logoImg.texture.getHeight() / Math.max(logoImg.texture.getWidth(), 1);
            this.anim[0].st.sizeDelta = new APJS.Vector2f(this.logoW, this.logoH);
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
        this.readFace(dt);
        this.updatePins(dt);
        this.updateFlash(dt);
        if (this.state === "INTRO") {
            // The ring waits around the face, still; it only spins once the game starts (client 2026-10-09).
            this.placeRing(seg(this.stateT, 0, 0.4), -1, 1);
            this.setPart(this.anim[1], 0, 0, 1 + 0.05 * Math.sin(this.t * 5));
            if (this.demoMode > 0 && this.stateT >= 3.5)
                this.startGame();
        }
        else if (this.state === "SPIN") {
            this.updateSpin();
        }
        else if (this.state === "LAND") {
            this.updateLand();
        }
        else if (this.state === "MATCH") {
            this.holdT += dt; // no expression check: the photo is taken after holdSec (client 2026-10-09)
            // demoMode 2 (ending clip only): the first five photos are quick so the 60 s video reaches the end
            const hold = this.demoMode === 2 && this.step < 5 ? 0.3 : this.matchSec();
            if (this.holdT >= hold)
                this.snap();
        }
        else if (this.state === "SNAP") {
            if (this.stateT >= this.snapSec) {
                if (this.isShieldStep())
                    this.startReplay();
                else
                    this.nextEmoji();
            }
        }
        else if (this.state === "REPLAY") {
            this.updateReplay();
        }
        else if (this.state === "FINALE") {
            this.updateFinale();
        }
        else if (this.state === "RESULT") {
            this.updateResultAnim(this.stateT);
        }
        this.updateBadge(dt);
        this.updateHoldBar();
        this.updateGuide();
    }
    // "Làm mặt biểu cảm" above the frame (client 2026-10-10) while the first photo of the game is coming
    // (internal players 2026-10-10).
    updateGuide() {
        if (!this.guideText)
            return;
        const on = this.step === 0 && ((this.state === "LAND" && this.stateT >= 0.3) || this.state === "MATCH");
        this.guideText.setEnabledInHierarchy(on);
        if (!on)
            return;
        // bobs up and down so the eye goes to it (client 2026-10-10)
        const st = this.guideText.getComponent("ScreenTransform");
        if (!this.guideHome) {
            this.guideHome = true;
            this.guideY = st.anchoredPosition.y;
        }
        st.anchoredPosition = new APJS.Vector2f(st.anchoredPosition.x, this.guideY + 6 * Math.sin(this.t * 4));
    }
    // holdSec counts from the moment the ring stops, so the photo is taken exactly holdSec later (client
    // 2026-10-10: "chụp đúng 3s"); the emoji's flight onto the frame (LAND_SEC) is part of it.
    matchSec() {
        return Math.max(this.holdSec - this.LAND_SEC, 0.3);
    }
    // ---------- Input / lifecycle ----------
    // Pressing TikTok Record is the only way to start a round; touch does nothing (client 2026-10-09) (the intro ring keeps showing as it starts spinning).
    onRecordStart() {
        this.recording = true;
        if (!this.inited) {
            this.startOnInit = true;
            return;
        }
        if (this.state !== "INTRO" && this.state !== "RESULT")
            return; // Record on again mid-round: carry on
        const shown = this.state === "INTRO" ? seg(this.stateT, 0, 0.4) : 0;
        this.resetGame();
        this.startGame(shown);
    }
    onRecordEnd() {
        this.recording = false;
    }
    // Record stopped mid-round: the game freezes (no motion, touch or voice) until Record goes on again
    // (client 2026-10-09: "ấn dừng quay rồi vẫn chơi được"). The intro and result screens stay live.
    paused() {
        return this.demoMode === 0 && !this.recording && this.state !== "INTRO" && this.state !== "RESULT";
    }
    resetGame() {
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
        for (const r of this.ringViews)
            r.obj.setEnabledInHierarchy(false);
        if (this.flash)
            this.flash.setEnabledInHierarchy(false);
        if (this.resultOverlay)
            this.resultOverlay.setEnabledInHierarchy(false);
        if (this.winEffect)
            this.winEffect.setEnabledInHierarchy(false);
        this.resetAnimParts();
        if (this.introOverlay)
            this.introOverlay.setEnabledInHierarchy(true);
        this.setState("INTRO");
    }
    startGame(shown = this.state === "INTRO" ? seg(this.stateT, 0, 0.4) : 0) {
        if (this.introOverlay)
            this.introOverlay.setEnabledInHierarchy(false);
        console.log("MamamyFaceCopy order " + this.order.map((i) => i + ":" + this.NAMES[this.emojiClass[i]]).join(","));
        this.startSpin(shown);
    }
    setState(s) {
        this.state = s;
        this.stateT = 0;
    }
    // roundCards emoji: the requiredEmoji plus random others, in random order (never two of the same
    // class in a row, while possible), then the shield.
    pickOrder() {
        const shield = this.emojiTextures.length - 1;
        const n = Math.min(this.roundCards, shield, this.pinViews.length - 1);
        const must = this.requiredEmoji.filter((e, k) => e >= 0 && e < shield && this.requiredEmoji.indexOf(e) === k).slice(0, n);
        const rest = [];
        for (let i = 0; i < shield; i++)
            if (must.indexOf(i) < 0)
                rest.push(i);
        shuffle(rest);
        const pool = shuffle(must.concat(rest.slice(0, n - must.length)));
        const out = [];
        while (out.length < n && pool.length > 0) {
            const last = out.length > 0 ? this.emojiClass[out[out.length - 1]] : -1;
            let k = pool.findIndex((c) => this.emojiClass[c] !== last);
            if (k < 0)
                k = 0;
            out.push(pool.splice(k, 1)[0]);
        }
        out.push(shield);
        return out;
    }
    targetClass() {
        return this.emojiClass[this.order[this.step]];
    }
    isShieldStep() {
        return this.order[this.step] === this.emojiTextures.length - 1;
    }
    // ---------- Roulette ----------
    // All emoji (the shield too) ride a ring around the player's face and follow it. The ring
    // spins, slows down and stops with the chosen emoji at the top (12 o'clock).
    startSpin(shown = 0) {
        this.spinShow0 = shown;
        this.holdT = 0;
        const n = this.ringViews.length, step = 2 * Math.PI / Math.max(n, 1);
        const a0 = this.ringAng % (2 * Math.PI);
        let target = Math.PI / 2 - this.order[this.step] * step;
        while (target < a0 + 4 * Math.PI)
            target += 2 * Math.PI;
        this.ringFrom = a0;
        this.ringTo = target;
        this.ringAng = a0;
        this.badge.setEnabledInHierarchy(false);
        this.setPolaroid(0);
        this.setState("SPIN");
    }
    updateSpin() {
        const k = seg(this.stateT, 0, this.spinSec);
        this.ringAng = this.ringFrom + (this.ringTo - this.ringFrom) * (1 - Math.pow(1 - k, 3));
        this.placeRing(this.spinShow0 + (1 - this.spinShow0) * seg(this.stateT, 0, 0.3), -1, 1);
        if (k >= 1)
            this.land();
    }
    // The chosen emoji pops at the top of the ring, the others shrink away into the face.
    land() {
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
    updateLand() {
        const t = this.stateT;
        this.placeRing(1 - seg(t, 0, 0.3), this.order[this.step], 1 - seg(t, 0, 0.3) * 0.6);
        this.setPolaroid(seg(t, 0.3, this.LAND_SEC));
        if (t >= this.LAND_SEC) {
            for (const r of this.ringViews)
                r.obj.setEnabledInHierarchy(false);
            this.landT = 0;
            this.setState("MATCH");
        }
    }
    // Ring emoji height: a share of the face width (only guarded against tracking glitches).
    ringSize() {
        return clamp(this.faceW * 0.27, 17, 145);
    }
    // Ring centre height: a little above the face box centre, so the ring sits around the head.
    ringY() {
        return this.faceY + this.faceH * this.RING_UP;
    }
    // Ring slot centre (screen) for emoji i at the current ring angle.
    ringPos(i) {
        const n = this.ringViews.length;
        const a = this.ringAng + i * 2 * Math.PI / Math.max(n, 1);
        // Radius and emoji size follow the face size, so the ring keeps its proportions near or far.
        const rx = clamp(this.faceW * 0.68, 35, 370), ry = clamp(this.faceH * 0.86, 45, 490);
        return [this.faceX + rx * Math.cos(a), this.ringY() + ry * Math.sin(a)];
    }
    // Shows the ring: show = 0..1 appear, skip = the emoji that left the ring (-1 none),
    // pull = 1 at the ring, < 1 shrinks toward the face centre.
    placeRing(show, skip, pull) {
        const size = this.ringSize();
        for (let i = 0; i < this.ringViews.length; i++) {
            const r = this.ringViews[i];
            const on = i !== skip && show > 0.001;
            r.obj.setEnabledInHierarchy(on);
            if (!on)
                continue;
            const p = this.ringPos(i);
            const a = this.ringAng + i * 2 * Math.PI / this.ringViews.length;
            const top = Math.pow(Math.max(0, Math.sin(a)), 12); // the one passing 12 o'clock grows
            const sc = easeOutBack(show) * (1 + 0.35 * top) * (0.4 + 0.6 * pull);
            const cy = this.ringY();
            r.st.anchoredPosition = new APJS.Vector2f(this.faceX + (p[0] - this.faceX) * pull, cy + (p[1] - cy) * pull);
            const tex = r.img.texture;
            const k = i === this.ringViews.length - 1 ? 1.25 : 1; // the shield is a bit bigger
            r.st.sizeDelta = new APJS.Vector2f(size * k * tex.getWidth() / Math.max(tex.getHeight(), 1), size * k);
            r.st.scale = new APJS.Vector2f(Math.max(0.001, sc), Math.max(0.001, sc));
            r.img.opacity = clamp(show * 1.5, 0, 1);
        }
    }
    setPolaroid(a) {
        const on = a > 0.001;
        this.polaroid.setEnabledInHierarchy(on);
        if (this.holdTrack)
            this.holdTrack.setEnabledInHierarchy(on);
        if (this.holdFill)
            this.holdFill.setEnabledInHierarchy(on);
        if (!on)
            return;
        const s = 0.9 + 0.1 * easeOutBack(a);
        for (const obj of [this.polaroid, this.holdTrack, this.holdFill]) {
            if (!obj)
                continue;
            const img = obj.getComponent("Image");
            if (img)
                img.opacity = a;
        }
        const st = this.polaroid.getComponent("ScreenTransform");
        st.scale = new APJS.Vector2f(s, s);
    }
    showEmoji(i) {
        const tex = this.emojiTextures[i];
        this.badgeImg.texture = tex;
        const shield = i === this.emojiTextures.length - 1;
        const h = shield ? this.SHIELD_H : this.BADGE_H;
        this.badgeSt.sizeDelta = new APJS.Vector2f(h * tex.getWidth() / Math.max(tex.getHeight(), 1), h);
    }
    // Stuck on the polaroid's top edge, over the photo window's top border (as in the reference).
    headPos() {
        return [0, this.BADGE_Y];
    }
    // LAND: pops at the ring top, then flies onto the frame's top edge. MATCH / SNAP: stays there,
    // gently bobbing, swelling while the right face is held.
    updateBadge(dt) {
        if (this.state !== "LAND" && this.state !== "MATCH" && this.state !== "SNAP")
            return;
        const h = this.headPos();
        let x = h[0], y = h[1], s = 1, rot = 0;
        if (this.state === "LAND") {
            const k = easeInOut(seg(this.stateT, 0.25, this.LAND_SEC));
            x = this.landX + (h[0] - this.landX) * k;
            y = this.landY + (h[1] - this.landY) * k;
            const s0 = this.ringSize() / this.badgeSt.sizeDelta.y; // leaves the ring at the ring's size
            s = s0 + (1 - s0) * k + 0.4 * s0 * Math.sin(seg(this.stateT, 0, 0.3) * Math.PI);
        }
        else {
            y += 3 * Math.sin(this.t * 3);
            rot = 3 * Math.sin(this.t * 2.2);
            s = 1 + 0.12 * clamp(this.holdT / this.matchSec(), 0, 1);
        }
        if (this.landT >= 0) {
            this.landT += dt;
            const k = seg(this.landT, 0, 0.35);
            s *= 1 + 0.15 * Math.sin(k * Math.PI);
            if (k >= 1)
                this.landT = -1;
        }
        this.badgeSt.anchoredPosition = new APJS.Vector2f(x, y);
        this.badgeSt.scale = new APJS.Vector2f(s, s);
        this.badgeSt.rotation = rot;
    }
    updateHoldBar() {
        if (!this.fillSt)
            return;
        const k = this.state === "MATCH" ? clamp(this.holdT / this.matchSec(), 0, 1) : this.state === "SNAP" ? 1 : 0;
        const w = Math.max(0.001, this.HOLD_W * k);
        this.fillSt.sizeDelta = new APJS.Vector2f(w, this.fillSt.sizeDelta.y);
        this.fillSt.anchoredPosition = new APJS.Vector2f(-this.HOLD_W / 2 + w / 2, this.fillSt.anchoredPosition.y);
    }
    // ---------- Photo ----------
    // Flash, copy the camera feed in the photo window, freeze it in the frame, fly it to its pin.
    snap() {
        console.log("MamamyFaceCopy photo " + this.NAMES[this.targetClass()] + " at t=" + this.t.toFixed(2));
        const pin = this.pinViews[this.step];
        if (pin) {
            const tex = this.capture();
            if (tex) {
                pin.photo.texture = tex;
                // PhotoCrop material: shows only the photo window of the full-screen capture.
                pin.photo.setMaterialProperty("_AlbedoTexture", tex);
                const pw = this.PHOTO_W * this.FRAME_K, ph = this.PHOTO_H * this.FRAME_K;
                pin.photo.setMaterialProperty("_Tiling", new APJS.Vector2f(pw / 720, ph / 1280));
                pin.photo.setMaterialProperty("_UVOffset", new APJS.Vector2f((360 - pw / 2) / 720, (640 + this.PHOTO_Y - ph / 2) / 1280));
            }
            if (pin.emoji && pin.emojiSt) {
                const et = this.emojiTextures[this.order[this.step]];
                pin.emoji.texture = et;
                const eh = (this.isShieldStep() ? this.SHIELD_H : this.BADGE_H) / this.FRAME_K; // same as on the frame (pin drawn at FRAME_K)
                pin.emojiSt.sizeDelta = new APJS.Vector2f(eh * et.getWidth() / Math.max(et.getHeight(), 1), eh);
            }
            pin.obj.setEnabledInHierarchy(true);
            pin.st.sizeDelta = new APJS.Vector2f(this.PHOTO_W, this.PHOTO_H);
            const r = this.rowPose(this.step);
            this.flyPin(pin, 0, this.PHOTO_Y, this.FRAME_K, 0, r[0], r[1], this.ROW_S, r[2], this.snapSec * 0.7, this.snapSec * 0.3);
        }
        this.flashT = 0;
        if (this.flash)
            this.flash.setEnabledInHierarchy(true);
        this.holdT = 0;
        this.setState("SNAP");
    }
    capture() {
        if (!this.camera)
            return null;
        // The crop rect is ignored by this engine (the whole frame comes back), so the full frame is
        // captured and the pins' PhotoCrop material shows only the photo window.
        return APJS.CaptureFrameHelper.captureCameraOutput(this.camera, new APJS.Rect(0, 0, 1, 1), 0.6);
    }
    nextEmoji() {
        this.step++;
        this.startSpin();
    }
    // Pin i in the top row: photo centre (the frame centre is 35 px lower at full size).
    rowPose(i) {
        const n = this.order.length;
        const x = (i - (n - 1) / 2) * this.ROW_DX;
        return [x, this.ROW_Y + this.FRAME_OFF * this.ROW_S, this.ROW_S, this.TILT[i % this.TILT.length]];
    }
    // Result grid: four on top, the rest below, on the upper half (clear of the logo).
    gridPose(i) {
        const n = this.order.length, top = Math.min(4, Math.ceil(n / 2));
        const row = i < top ? 0 : 1, k = row === 0 ? i : i - top, cnt = row === 0 ? top : n - top;
        const x = (k - (cnt - 1) / 2) * 165, y = (row === 0 ? 430 : 200) + this.FRAME_OFF * this.GRID_S;
        return [x, y, this.GRID_S, this.TILT[i % this.TILT.length] * 0.8];
    }
    flyPin(p, fx, fy, fs, fr, tx, ty, ts, tr, sec, delay) {
        p.fromX = fx;
        p.fromY = fy;
        p.fromS = fs;
        p.fromR = fr;
        p.toX = tx;
        p.toY = ty;
        p.toS = ts;
        p.toR = tr;
        p.t = 0;
        p.sec = sec;
        p.delay = delay;
        this.placePin(p, 0);
    }
    updatePins(dt) {
        for (const p of this.pinViews) {
            if (p.t < 0)
                continue;
            p.t += dt;
            const k = easeInOut(seg(p.t - p.delay, 0, p.sec));
            this.placePin(p, k);
            if (p.t >= p.delay + p.sec)
                p.t = -1;
        }
    }
    placePin(p, k) {
        const s = p.fromS + (p.toS - p.fromS) * k;
        const arc = Math.sin(k * Math.PI) * 40 * (p.fromS > p.toS ? 1 : 0.5);
        p.st.anchoredPosition = new APJS.Vector2f(p.fromX + (p.toX - p.fromX) * k, p.fromY + (p.toY - p.fromY) * k + arc);
        p.st.scale = new APJS.Vector2f(Math.max(0.001, s), Math.max(0.001, s));
        p.st.rotation = p.fromR + (p.toR - p.fromR) * k;
    }
    updateFlash(dt) {
        if (this.flashT < 0 || !this.flashImg)
            return;
        this.flashT += dt;
        this.flashImg.opacity = 0.85 * (1 - seg(this.flashT, 0.05, 0.4));
        if (this.flashT >= 0.4) {
            this.flashT = -1;
            if (this.flash)
                this.flash.setEnabledInHierarchy(false);
        }
    }
    // ---------- Face tracking ----------
    // Face box (normalized, origin bottom-left) → screen units, smoothed; the ring follows it.
    readFace(dt) {
        const r = APJS.AlgorithmManager.getResult();
        if (r.getFaceCount() <= 0)
            return;
        const rc = r.getFaceBaseInfo(0).rect, kf = clamp(dt * 10, 0, 1);
        this.faceX += ((rc.x + rc.width / 2 - 0.5) * 720 - this.faceX) * kf;
        this.faceY += ((rc.y + rc.height / 2 - 0.5) * 1280 - this.faceY) * kf;
        this.faceW += (rc.width * 720 - this.faceW) * kf;
        this.faceH += (rc.height * 1280 - this.faceH) * kf;
    }
    // ---------- Replay: the round's photos one by one, each with a full-screen flash ----------
    // The ring, frame, emoji and pinned row go away; every flash cuts to the next photo, big in the
    // frame's place, each at its own tilt, with a hard jolt (no easing). After the last one the photos
    // jump into the result grid.
    startReplay() {
        this.setPolaroid(0);
        this.badge.setEnabledInHierarchy(false);
        for (const p of this.pinViews) {
            p.obj.setEnabledInHierarchy(false);
            p.t = -1;
        }
        this.replayIdx = -1;
        this.setState("REPLAY");
    }
    replayCount() {
        return Math.min(this.order.length, this.pinViews.length);
    }
    updateReplay() {
        const n = this.replayCount();
        const idx = Math.floor(this.stateT / this.REPLAY_SEC);
        if (idx !== this.replayIdx) {
            if (this.replayIdx >= 0 && this.replayIdx < n)
                this.pinViews[this.replayIdx].obj.setEnabledInHierarchy(false);
            this.replayIdx = idx;
            this.flashT = 0;
            if (this.flash)
                this.flash.setEnabledInHierarchy(true);
            if (idx >= n) { // all shown: the 19 shield takes the stage and turns into the logo
                this.showEmoji(this.emojiTextures.length - 1);
                this.badgeSt.anchoredPosition = new APJS.Vector2f(0, this.PHOTO_Y);
                this.badge.setEnabledInHierarchy(true);
                for (let i = 0; i < n; i++) { // the photos jump into the grid, one after another
                    const p = this.pinViews[i], g = this.gridPose(i);
                    p.obj.setEnabledInHierarchy(true);
                    this.flyPin(p, 0, this.PHOTO_Y, 0.6 * this.FRAME_K, this.REPLAY_ROT[i % this.REPLAY_ROT.length], g[0], g[1], g[2], g[3], 0.35, 0.05 * i);
                }
                this.startFinale();
                return;
            }
            this.pinViews[idx].obj.setEnabledInHierarchy(true);
        }
        if (idx >= n)
            return;
        const p = this.pinViews[idx];
        // Jolt: a few hard steps (no easing) — big and over-tilted, then a kick back, then it sits.
        const lt = this.stateT - idx * this.REPLAY_SEC, rot = this.REPLAY_ROT[idx % this.REPLAY_ROT.length];
        const step = lt < 0.06 ? 0 : lt < 0.12 ? 1 : lt < 0.18 ? 2 : 3;
        const s = [1.12, 0.96, 1.03, 1][step], dr = [4, -3, 1.5, 0][step], dx = [-8, 7, -3, 0][step];
        p.st.anchoredPosition = new APJS.Vector2f(dx, this.PHOTO_Y);
        p.st.scale = new APJS.Vector2f(s * this.FRAME_K, s * this.FRAME_K);
        p.st.rotation = rot + dr * Math.sign(rot);
    }
    // ---------- Finale: the shield turns into MEGA MAMAMY 19 ----------
    // 0-0.9 the shield swells; 0.9-1.1 it flips to the plain 19 shield; 1.1-1.8 it flies (spinning)
    // to the shield's spot in the logo, growing to the logo's shield size.
    startFinale() {
        this.badgeSt.rotation = 0;
        this.finX = this.badgeSt.anchoredPosition.x;
        this.finY = this.badgeSt.anchoredPosition.y;
        this.setState("FINALE");
    }
    logoShieldPose() {
        const lp = this.anim[0];
        return [lp.baseX + this.logoShieldX * this.logoW, lp.baseY + this.logoShieldY * this.logoH];
    }
    updateFinale() {
        const t = this.stateT, st = this.badgeSt, x0 = this.finX, y0 = this.finY;
        if (this.holdFill)
            this.holdFill.setEnabledInHierarchy(false);
        if (t < 0.9) {
            const sw = 1 + 0.15 * Math.sin(seg(t, 0, 0.9) * Math.PI);
            st.anchoredPosition = new APJS.Vector2f(x0, y0);
            st.scale = new APJS.Vector2f(sw, sw);
            return;
        }
        if (t < 1.1) { // flip: squeeze to an edge, swap to the plain shield, open up again
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
        const to = this.logoShieldPose();
        const toS = this.logoShieldH * this.logoH / Math.max(st.sizeDelta.y, 1);
        const k = easeInOut(seg(t, 1.1, 1.8));
        const s = 1 + (toS - 1) * k;
        st.anchoredPosition = new APJS.Vector2f(x0 + (to[0] - x0) * k, y0 + (to[1] - y0) * k + Math.sin(k * Math.PI) * 100);
        st.scale = new APJS.Vector2f(Math.max(0.001, s), Math.max(0.001, s));
        st.rotation = 360 * k;
        if (t >= 1.8)
            this.showResult();
    }
    // ---------- Result ----------
    showResult() {
        this.setState("RESULT");
        this.badgeSt.rotation = 0;
        this.polaroid.setEnabledInHierarchy(false);
        if (this.resultOverlay)
            this.resultOverlay.setEnabledInHierarchy(true);
        if (this.winEffect)
            this.winEffect.setEnabledInHierarchy(true);
        this.updateResultAnim(0);
    }
    // Confetti slides down and the logo bursts out of the shield.
    updateResultAnim(t) {
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
        const logo = this.anim[0];
        // The logo grows out of the shield: the shield's spot in the logo stays put while it scales.
        const ax = this.logoShieldX * this.logoW, ay = this.logoShieldY * this.logoH;
        let sl = Math.max(0.001, easeOutBack(seg(t, 0, this.burstSec)));
        if (t > this.burstSec + 0.3)
            sl = 1 + 0.03 * Math.sin((t - this.burstSec - 0.3) * 3);
        this.setPart(logo, ax - ax * sl, ay - ay * sl, sl);
        const st = this.badgeSt;
        const toS = this.logoShieldH * this.logoH / Math.max(st.sizeDelta.y, 1);
        const pop = toS * (1 + 0.15 * Math.sin(seg(t, 0, this.burstSec * 0.8) * Math.PI));
        st.scale = new APJS.Vector2f(pop, pop);
        this.badge.setEnabledInHierarchy(t < this.burstSec * 0.8);
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
    serializeProperty,
    tooltip('Roulette emoji; the LAST one is the 19 shield that ends every round')
], MamamyFaceCopy.prototype, "emojiTextures", void 0);
__decorate([
    serializeProperty,
    tooltip('Expression each emoji shows, same order (0 tongue, 1 pout, 2 wink, 3 sad, 4 angry, 5 smile, 6 laugh): only keeps two alike apart')
], MamamyFaceCopy.prototype, "emojiClass", void 0);
__decorate([
    serializeProperty,
    tooltip('Plain 19 shield the shield emoji turns into at the finale')
], MamamyFaceCopy.prototype, "shieldPlainTex", void 0);
__decorate([
    serializeProperty,
    tooltip('Emoji before the shield'),
    spinBox(1, 10, 1)
], MamamyFaceCopy.prototype, "roundCards", void 0);
__decorate([
    serializeProperty,
    tooltip('Emoji (index in emojiTextures) in every round; the rest of roundCards is random')
], MamamyFaceCopy.prototype, "requiredEmoji", void 0);
__decorate([
    serializeProperty,
    tooltip('Result logo width (px)'),
    slider(300, 700, 5)
], MamamyFaceCopy.prototype, "logoW", void 0);
__decorate([
    serializeProperty,
    tooltip('Shield centre inside the logo, x as a share of the logo width from its centre')
], MamamyFaceCopy.prototype, "logoShieldX", void 0);
__decorate([
    serializeProperty,
    tooltip('Shield centre inside the logo, y (up) as a share of the logo height from its centre')
], MamamyFaceCopy.prototype, "logoShieldY", void 0);
__decorate([
    serializeProperty,
    tooltip('Shield height as a share of the logo height')
], MamamyFaceCopy.prototype, "logoShieldH", void 0);
__decorate([
    header("Gameplay Tuning"),
    serializeProperty,
    tooltip('The photo is taken this long after the ring stops (s)'),
    slider(0.3, 10, 0.1)
], MamamyFaceCopy.prototype, "holdSec", void 0);
__decorate([
    serializeProperty,
    tooltip('Ring spin before it stops (s)'),
    slider(0.3, 4, 0.05)
], MamamyFaceCopy.prototype, "spinSec", void 0);
__decorate([
    serializeProperty,
    tooltip('Photo flies to its pin (s)'),
    slider(0.3, 2, 0.05)
], MamamyFaceCopy.prototype, "snapSec", void 0);
__decorate([
    serializeProperty,
    tooltip('Demo video: 1 = start by itself after the intro, 2 = same but the first five photos are quick (ending clip)'),
    spinBox(0, 2, 1)
], MamamyFaceCopy.prototype, "demoMode", void 0);
__decorate([
    serializeSceneObjectFlag,
    header("Advanced — Scene Wiring"),
    serializeProperty,
    tooltip('3D Camera: it renders the camera feed first, the photos copy its output')
], MamamyFaceCopy.prototype, "cameraObject", void 0);
__decorate([
    serializeSceneObjectFlag,
    serializeProperty,
    tooltip('Polaroid frame around the face (transparent photo window)')
], MamamyFaceCopy.prototype, "polaroid", void 0);
__decorate([
    serializeSceneObjectFlag,
    serializeProperty,
    tooltip('Roulette emoji on the frame top edge')
], MamamyFaceCopy.prototype, "badge", void 0);
__decorate([
    serializeSceneObjectFlag,
    serializeProperty,
    tooltip('White disc behind the roulette emoji')
], MamamyFaceCopy.prototype, "badgeBack", void 0);
__decorate([
    serializeSceneObjectFlag,
    serializeProperty,
    tooltip('Hold bar track and fill in the frame bottom strip')
], MamamyFaceCopy.prototype, "holdTrack", void 0);
__decorate([
    serializeSceneObjectFlag,
    serializeProperty
], MamamyFaceCopy.prototype, "holdFill", void 0);
__decorate([
    serializeSceneObjectFlag,
    serializeProperty,
    tooltip('Ring of emoji around the face, same order as emojiTextures')
], MamamyFaceCopy.prototype, "ringItems", void 0);
__decorate([
    serializeSceneObjectFlag,
    serializeProperty,
    tooltip('Pinned photos, in shot order (root image = photo, children = frame + emoji)')
], MamamyFaceCopy.prototype, "pins", void 0);
__decorate([
    serializeSceneObjectFlag,
    serializeProperty,
    tooltip('White full-screen flash for the photo')
], MamamyFaceCopy.prototype, "flash", void 0);
__decorate([
    serializeSceneObjectFlag,
    serializeProperty
], MamamyFaceCopy.prototype, "introOverlay", void 0);
__decorate([
    serializeSceneObjectFlag,
    serializeProperty
], MamamyFaceCopy.prototype, "introButton", void 0);
__decorate([
    serializeSceneObjectFlag,
    serializeProperty
], MamamyFaceCopy.prototype, "resultOverlay", void 0);
__decorate([
    serializeSceneObjectFlag,
    serializeProperty
], MamamyFaceCopy.prototype, "winEffect", void 0);
__decorate([
    serializeSceneObjectFlag,
    serializeProperty
], MamamyFaceCopy.prototype, "resultLogo", void 0);
__decorate([
    serializeSceneObjectFlag,
    serializeProperty,
    tooltip('Soft white glow drawn under the result logo; follows it')
], MamamyFaceCopy.prototype, "logoGlow", void 0);
__decorate([
    serializeSceneObjectFlag,
    serializeProperty,
    tooltip('"Làm mặt biểu cảm" hint in the frame strip, on the first photo of the game')
], MamamyFaceCopy.prototype, "guideText", void 0);
MamamyFaceCopy = __decorate([
    component()
], MamamyFaceCopy);
exports.MamamyFaceCopy = MamamyFaceCopy;
