// ============================================================
// mobile.js — Mobile touch controls, virtual analog stick,
//             screen orientation auto-lock & landscape prompt
// ============================================================

export class MobileControlsManager {
  constructor(player, shootingSystem) {
    this.player = player;
    this.shootingSystem = shootingSystem;
    this.isTouchDevice =
      "ontouchstart" in window ||
      navigator.maxTouchPoints > 0 ||
      navigator.msMaxTouchPoints > 0;

    this.joystickActive = false;
    this.joystickTouchId = null;
    this.joystickCenter = { x: 0, y: 0 };
    this.lookTouchId = null;
    this.lastLookPos = { x: 0, y: 0 };
    this._autoShootInterval = null;

    this._initUI();
    this._bindEvents();
    this.checkOrientation();
  }

  _initUI() {
    if (!this.isTouchDevice) return;

    const touchUI = document.getElementById("mobile-touch-controls");
    if (touchUI) touchUI.style.display = "block";

    // Setup action buttons
    const shootBtn = document.getElementById("btn-touch-shoot");
    const jumpBtn = document.getElementById("btn-touch-jump");
    const reloadBtn = document.getElementById("btn-touch-reload");
    const weaponBtn = document.getElementById("btn-touch-weapon");

    if (shootBtn) {
      shootBtn.addEventListener("touchstart", (e) => {
        e.preventDefault();
        window._shootingSystem?.triggerShoot();
        this._autoShootInterval = setInterval(() => {
          window._shootingSystem?.triggerShoot();
        }, 120);
      });
      shootBtn.addEventListener("touchend", (e) => {
        e.preventDefault();
        if (this._autoShootInterval) clearInterval(this._autoShootInterval);
      });
      shootBtn.addEventListener("touchcancel", (e) => {
        e.preventDefault();
        if (this._autoShootInterval) clearInterval(this._autoShootInterval);
      });
    }

    if (jumpBtn) {
      jumpBtn.addEventListener("touchstart", (e) => {
        e.preventDefault();
        if (this.player && this.player.onGround) {
          this.player.velocity.y = 10.5; // JUMP_FORCE
          this.player.onGround = false;
        }
      });
    }

    if (reloadBtn) {
      reloadBtn.addEventListener("touchstart", (e) => {
        e.preventDefault();
        window._shootingSystem?.reload();
      });
    }

    if (weaponBtn) {
      weaponBtn.addEventListener("touchstart", (e) => {
        e.preventDefault();
        window._shootingSystem?.cycleNextWeapon();
      });
    }
  }

  _bindEvents() {
    window.addEventListener("resize", () => this.checkOrientation());
    window.addEventListener("orientationchange", () => this.checkOrientation());

    if (!this.isTouchDevice) return;

    const joystickZone = document.getElementById("touch-joystick-zone");
    const lookZone = document.getElementById("touch-look-zone");
    const stick = document.getElementById("touch-joystick-stick");
    const base = document.getElementById("touch-joystick-base");

    if (joystickZone) {
      joystickZone.addEventListener("touchstart", (e) => {
        e.preventDefault();
        const touch = e.targetTouches[0];
        this.joystickTouchId = touch.identifier;
        this.joystickActive = true;
        const rect = base.getBoundingClientRect();
        this.joystickCenter = {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        };
        this._updateJoystick(touch, stick);
      });

      joystickZone.addEventListener("touchmove", (e) => {
        e.preventDefault();
        for (let i = 0; i < e.changedTouches.length; i++) {
          const touch = e.changedTouches[i];
          if (touch.identifier === this.joystickTouchId) {
            this._updateJoystick(touch, stick);
          }
        }
      });

      const endJoystick = (e) => {
        for (let i = 0; i < e.changedTouches.length; i++) {
          if (e.changedTouches[i].identifier === this.joystickTouchId) {
            this.joystickActive = false;
            this.joystickTouchId = null;
            if (stick) stick.style.transform = `translate(0px, 0px)`;
            this.player._keys["KeyW"] = false;
            this.player._keys["KeyS"] = false;
            this.player._keys["KeyA"] = false;
            this.player._keys["KeyD"] = false;
          }
        }
      };

      joystickZone.addEventListener("touchend", endJoystick);
      joystickZone.addEventListener("touchcancel", endJoystick);
    }

    if (lookZone) {
      lookZone.addEventListener("touchstart", (e) => {
        const touch = e.targetTouches[0];
        this.lookTouchId = touch.identifier;
        this.lastLookPos = { x: touch.clientX, y: touch.clientY };
      });

      lookZone.addEventListener("touchmove", (e) => {
        for (let i = 0; i < e.changedTouches.length; i++) {
          const touch = e.changedTouches[i];
          if (touch.identifier === this.lookTouchId) {
            const dx = touch.clientX - this.lastLookPos.x;
            const dy = touch.clientY - this.lastLookPos.y;
            this.lastLookPos = { x: touch.clientX, y: touch.clientY };

            const sens = 0.0038;
            this.player._yaw -= dx * sens;
            this.player._pitch -= dy * sens;
            this.player._pitch = Math.max(
              -Math.PI / 2.2,
              Math.min(Math.PI / 2.2, this.player._pitch)
            );
          }
        }
      });

      const endLook = (e) => {
        for (let i = 0; i < e.changedTouches.length; i++) {
          if (e.changedTouches[i].identifier === this.lookTouchId) {
            this.lookTouchId = null;
          }
        }
      };

      lookZone.addEventListener("touchend", endLook);
      lookZone.addEventListener("touchcancel", endLook);
    }
  }

  _updateJoystick(touch, stick) {
    const dx = touch.clientX - this.joystickCenter.x;
    const dy = touch.clientY - this.joystickCenter.y;
    const maxRadius = 45;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const clampedDist = Math.min(dist, maxRadius);
    const angle = Math.atan2(dy, dx);

    const stickX = Math.cos(angle) * clampedDist;
    const stickY = Math.sin(angle) * clampedDist;

    if (stick) {
      stick.style.transform = `translate(${stickX}px, ${stickY}px)`;
    }

    // Map to WASD
    const threshold = 10;
    this.player._keys["KeyW"] = stickY < -threshold;
    this.player._keys["KeyS"] = stickY > threshold;
    this.player._keys["KeyA"] = stickX < -threshold;
    this.player._keys["KeyD"] = stickX > threshold;
  }

  checkOrientation() {
    const isPortrait = window.innerHeight > window.innerWidth;
    const portraitOverlay = document.getElementById("portrait-warning-overlay");
    if (portraitOverlay) {
      portraitOverlay.style.display = isPortrait ? "flex" : "none";
    }

    // Request Screen Orientation Lock to Landscape if supported by device
    if (!isPortrait && screen.orientation && screen.orientation.lock) {
      screen.orientation.lock("landscape").catch(() => {});
    }
  }
}
