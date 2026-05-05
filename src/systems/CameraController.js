import { ARENA } from '../config/gameConfig.js';

/**
 * CameraController — multiplayer-ready camera manager.
 *
 * Single player:  camera.startFollow() on the player's container.
 * Future multi:   stopFollow(), manually pan to midpoint of all live targets,
 *                 optionally zoom out to keep all players in frame.
 *
 * Usage:
 *   const cc = new CameraController(this.cameras.main, arena.worldW, arena.worldH);
 *   cc.setTargets([player]);          // or [p1, p2, p3, ...]
 *   // in update():
 *   cc.update();
 */
export default class CameraController {
  constructor(camera, worldW, worldH) {
    this.camera = camera;
    this.worldW = worldW;
    this.worldH = worldH;
    this.targets = [];

    camera.setBounds(0, 0, worldW, worldH);
  }

  /**
   * Set the list of player entities to follow.
   * Each entity must expose { container, x, y, alive }.
   */
  setTargets(entities) {
    this.targets = entities;
    this._applyFollow();
  }

  /** Add a target (e.g., second player joining mid-run). */
  addTarget(entity) {
    if (!this.targets.includes(entity)) {
      this.targets.push(entity);
      this._applyFollow();
    }
  }

  /** Remove a target (e.g., player disconnected). */
  removeTarget(entity) {
    this.targets = this.targets.filter(t => t !== entity);
    this._applyFollow();
  }

  _applyFollow() {
    if (this.targets.length === 1) {
      this.camera.startFollow(
        this.targets[0].container,
        true,
        ARENA.CAMERA_LERP,
        ARENA.CAMERA_LERP
      );
    } else if (this.targets.length > 1) {
      // Multi-player: manual midpoint pan in update()
      this.camera.stopFollow();
    }
  }

  /**
   * Called every frame from ArenaScene.update().
   * No-op for single player (startFollow handles it).
   * For multi-player: pan to midpoint of all live players.
   */
  update() {
    if (this.targets.length <= 1) return;

    const live = this.targets.filter(t => t.alive);
    if (live.length === 0) return;

    // ── Future multiplayer: uncomment and tune ──────────────────────────────
    // const mid = live.reduce((acc, t) => ({ x: acc.x + t.x, y: acc.y + t.y }),
    //   { x: 0, y: 0 });
    // mid.x /= live.length;
    // mid.y /= live.length;
    // this.camera.pan(mid.x, mid.y, 120, 'Linear', false);
    //
    // // Optional: zoom to fit all players
    // const spread = Math.max(...live.map(t => Math.hypot(t.x - mid.x, t.y - mid.y)));
    // const zoom = Math.max(0.4, Math.min(1, 500 / Math.max(spread, 100)));
    // this.camera.zoomTo(zoom, 200);
  }

  destroy() {
    this.camera.stopFollow();
  }
}
