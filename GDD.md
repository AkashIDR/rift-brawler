# RIFT BRAWLER — Game Design Document
**Version:** 1.1  
**Date:** 2026-05-01  
**Status:** Draft

---

## Table of Contents
1. [Overview](#1-overview)
2. [Game Name](#2-game-name)
3. [Core Game Loop](#3-core-game-loop)
4. [Arena Design](#4-arena-design)
5. [Altar & Portal Mechanics](#5-altar--portal-mechanics)
6. [Player Character](#6-player-character)
7. [Boss Design](#7-boss-design)
8. [UI & UX](#8-ui--ux)
9. [Screens & Menus](#9-screens--menus)
10. [Scoring & Progression](#10-scoring--progression)
11. [Audio](#11-audio)
12. [Controls Reference](#12-controls-reference)
13. [Tech Stack](#13-tech-stack)
14. [Art Style](#14-art-style)
15. [Future Roadmap](#15-future-roadmap)

---

## 1. Overview

### 1.1 Concept
Rift Brawler is a top-down, single-player arcade/boss-battler hybrid with roguelite progression. Each level places the player in a unique arena where they summon a boss via an altar, defeat that boss, then leap through a portal into the next arena. Difficulty scales with each level, and the player grows stronger to match.

### 1.2 Genre
- Arcade
- Boss Battler
- Roguelite (progression, scaling difficulty, future runs)

### 1.3 Platform
- Web browser (desktop-first)
- Future: potential standalone export

### 1.4 Core Pillars
1. **Fair** — Every attack is telegraphed and can be dodged. The player always has a chance to react and survive.
2. **Punchy** — Combat feels satisfying and snappy with clear visual and audio feedback.
3. **Cute & Vibrant** — The aesthetic is fun, colorful, and inviting despite the challenge.
4. **Escalating** — Each arena feels meaningfully harder and more exciting than the last.

---

## 2. Game Name

### Chosen Name
**Rift Brawler**
Energetic, competitive, and communicates the portal-jumping brawl loop perfectly.

### Alternative Names (for future consideration)
| Name | Feel |
|---|---|
| **Boss Hopper!** | Silly, on-the-nose, arcade-coded |
| **Portal Slayer** | Punchy, action-forward |
| **Altar's Edge** | Mysterious, slightly dramatic |
| **The Summoning Grounds** | Atmospheric, roguelite-coded |
| **Arena Jumper** | Casual, accessible |
| **Rift Runners** | Multiplayer-forward feel |
| **The Last Summoner** | Narrative-leaning, dramatic |
| **Boss Blitz** | Fast, energetic, casual |
| **Warp & Wreck** | Playful, conveys portals + combat |
| **Brawl Beyond** | Punchy double-meaning (fighting + going further) |

---

## 3. Core Game Loop

```
START
  └─► Spawn in Arena
        └─► Walk up to / click Altar
              └─► Boss spawns at random location near player
                    └─► Fight Boss
                          ├─► Player dies → Game Over screen (show score, option to restart)
                          └─► Boss dies
                                └─► Portal opens
                                      └─► Player enters Portal
                                            └─► Screen transitions to new Arena (Level +1)
                                                  └─► Difficulty increases
                                                        └─► [LOOP]
```

### Loop Feel
- Pacing: **calm approach → tense reveal → chaotic fight → relief → anticipation**
- The altar interaction has a brief dramatic wind-up before the boss appears.
- Boss death should feel celebratory — burst of particles, fanfare, portal pulse-in.
- On death, the player restarts from Level 1 (no persistent run carry-over in v1.0).

---

## 4. Arena Design

### 4.1 Shape Variety
Arenas are enclosed play fields. Variety keeps each level feel fresh.

| Arena Type | Shape | Notes |
|---|---|---|
| Classic | Square | Standard baseline |
| Wide Open | Wide rectangle | Room to kite |
| Corridor | Narrow rectangle | Claustrophobic, intense |
| Cross | Plus/cross shape | Interesting corners and choke points |
| Circular | Circle/oval | No corners to hide in |
| L-Shape | L-shaped | Asymmetric, surprising |
| Diamond | Rotated square | Forces diagonal awareness |
| Custom | Unique geometry | Later levels, handcrafted per boss |

### 4.2 Arena Elements
- **Walls/Boundaries** — Solid; player and boss cannot pass through them.
- **Floor** — Decorative vector patterns. Different themes per level range.
- **Altar** — Centered or near-center. Glows gently to draw the player's eye.
- **Portal** — Spawns in a fixed or random safe location after boss death. Pulses with a distinctive color.

### 4.3 Level Theming (Milestones)
| Level Range | Theme | Palette |
|---|---|---|
| 1–5 | Green Fields / Stone Ruins | Greens, grays, warm stone |
| 6–10 | Crystal Caves | Blues, purples, cyan glow |
| 11–15 | Volcanic Depths | Reds, oranges, dark grays |
| 16–20 | Celestial Void | Deep navy, gold, white stars |
| 21+ | Chaos Realm | Shifting, glitching colors |

---

## 5. Altar & Portal Mechanics

### 5.1 Altar
- Visually distinct glowing geometric object in the arena center.
- Interaction trigger: player walks within interaction radius **or** left-clicks on it.
- On interaction: altar lights up, screen shakes lightly, dramatic music sting, then boss spawns.
- Altar disappears or dims after boss is summoned.

### 5.2 Portal
- Spawns ~0.5–1 second after boss death (gives player a moment to breathe).
- Visually: a swirling geometric portal (vector art), pulsing with color themed to the next level.
- Interaction: player walks into it or left-clicks it.
- On interaction: screen-wipe or fade-to-black transition, new arena loads.
- Portal placement avoids the boss's death position.

---

## 6. Player Character

### 6.1 Visual Design
The player character is a distinct, cute geometric humanoid — not just a simple circle. The design must be readable at small sizes, support animations, and allow for future class differentiation.

**Default class (Knight) structure:**
- **Body:** Rounded rectangular "torso" with a slight taper at the bottom. Acts as the character's core.
- **Head:** Circle sitting atop the torso, slightly larger than torso width.
- **Helmet:** A flat geometric visor/cap shape on top of the head — slightly different per class.
- **Arms:** Two small rounded rectangles on either side of the torso. Rotate to face cursor.
- **Legs:** Two short, stubby rectangles below the torso.
- **Weapon/Accessory:** Knight carries a small geometric shield on the off-arm.
- **Color Palette:** Knight = bright blue torso, silver helmet, gold shield accent.
- **Outline:** Thin dark outline on all parts for readability against any background.

**Class differentiation (future):**
| Class | Head Shape | Arm/Accessory | Color |
|---|---|---|---|
| Knight | Round + flat visor | Shield + Sword | Blue/Silver |
| Archer | Round + pointed hood | Bow + Quiver | Green/Brown |
| Wizard | Round + tall hat | Staff | Purple/Gold |
| Assassin | Angular + mask | Dual daggers | Dark red/Black |
| Healer | Round + halo ring | Orb/Staff | White/Teal |

### 6.2 Animations
All animations are implemented via Phaser tweens and Graphics redraws (no sprite sheets required in v1.0).

| State | Animation |
|---|---|
| **Idle** | Gentle vertical bob (body/head oscillate subtly up and down, ~1-second cycle) |
| **Moving** | Legs alternate stride motion; body tilts slightly in direction of travel |
| **Basic Attack** | Weapon arm extends rapidly toward cursor, snaps back; brief muzzle-flash particle at arm tip |
| **Skill Q (Power Strike)** | Body flashes bright, both arms thrust forward, large projectile launches |
| **Skill W (Shield Dash)** | Shield pulses, body stretches in dash direction, trail of particles behind |
| **Skill E (Ground Slam)** | Character jumps slightly, lands hard (stomp compression), expanding ring ripple |
| **Spacebar Dodge** | Body flickers/blurs in dash direction with a brief ghost trail; transparent during i-frames |
| **Hit (Damage Taken)** | Full body flashes red, brief knockback impulse in opposite direction of hit |
| **Death** | Body shatters into geometric fragments, dissolves with particle burst |

### 6.3 Movement
| Input | Action |
|---|---|
| Right-click | Move toward clicked position |
| Right-click + hold | Continuous movement toward cursor |

- Movement speed: moderate. Responsive but not instant.
- Arms always rotate to face the cursor regardless of movement direction.

### 6.4 Dodge Dash (Universal)
| Input | Action |
|---|---|
| Spacebar | Quick directional dash with i-frames |

- Dash direction: toward the cursor position at time of press.
- Duration of i-frames: ~0.3–0.4 seconds (short, precise window).
- Stamina cost: small (less than any skill).
- Cooldown: ~0.8–1 second (distinct cooldown indicator on HUD).
- Visual: brief ghost trail + character flicker during i-frames.
- This is a universal mechanic available to all classes.

### 6.5 Basic Attack
| Input | Action |
|---|---|
| Left-click | Fire a projectile toward cursor position |

- Short cooldown (~0.3–0.5s).
- No stamina cost.
- **Stamina regeneration:** each basic attack that hits the boss restores a small amount of stamina.
- Visual: small, fast geometric projectile with a subtle glow trail.

### 6.6 Skills
Three skills mapped to keyboard keys, all consuming Stamina.

| Key | Skill Name | Description | Stamina Cost |
|---|---|---|---|
| Q | Power Strike | A charged, fast projectile dealing high single-target damage | Medium |
| W | Shield Dash | A longer dash in cursor direction with brief i-frames, deals contact damage if passing through boss hitbox | High |
| E | Ground Slam | Sends a shockwave cone in front of the player dealing area damage | High |

- Spacebar Dodge costs less stamina than any of Q/W/E.
- All skills aim toward the cursor direction at cast time.
- All skills have visible cooldown sweep overlays on the HUD skill bar.

### 6.7 Stamina System
- Player starts each level with **full stamina**.
- Stamina is consumed by Spacebar Dodge and by Q/W/E skills.
- Stamina regenerates only by landing basic attacks on the boss.
- Stamina does **not** regenerate passively.
- This creates a core loop: use skills → dodge → basic attack to regen → use skills again.

### 6.8 Health
- Displayed as: floating bar above player sprite + health bar in HUD.
- Health does **not** regenerate between arenas.
- Max health increases as the player levels up.
- Health reaches 0 → Game Over.

### 6.9 Player Scaling (Per Level)
| Stat | Scaling |
|---|---|
| Max Health | Increases each level |
| Basic Attack Damage | Gradual curve increase |
| Skill Damage | Scales proportionally with basic attack |
| Movement Speed | Minor increases, softly capped |
| Stamina Pool | Slight increase over levels |
| Dodge Cooldown | Marginally decreases over levels |

---

## 7. Boss Design

### 7.1 Universal Boss Rules
- **Every attack must be dodgeable.** All attacks have a telegraph phase, a delay, then execution.
- Telegraphs are visual: glowing indicators, floor zones, directional arrows, wind-up animations.
- No attack is instant or undodgeable. The player always has a fair reaction window.
- On damage taken, boss briefly flashes white.

### 7.2 Spawn Behavior
- Boss spawns at a random arena location not directly on top of the player.
- Brief spawn animation: materialize effect, dramatic shake, particle burst.
- Brief invulnerability window (~0.5s) after spawn so the player can react.

### 7.3 Boss Health Bar
- Large, prominent bar at the **top of the screen** (not floating above boss).
- Boss name displayed above the health bar.
- Health bar color shifts: green → yellow → red as health decreases.
- Screenshake + flash when boss is hit.

### 7.4 Behavior State Machine
```
IDLE (brief, post-spawn) → TELEGRAPH → ATTACK → COOLDOWN → [repeat]
```
- Attack selection is randomized from the boss's available pool.
- As health decreases: **Enrage Phase** triggers (at ~50% and ~25% HP).
- Enrage: faster attack speed, shorter telegraph windows, new attack combinations.

### 7.5 Universal Attack Types

| Attack Type | Description | Telegraph |
|---|---|---|
| **Basic Melee** | Boss lunges directly at player | Directional wind-up arrow on boss, brief pause |
| **Projectile** | Single fast projectile toward player | Glowing charge orb builds on boss |
| **Spread Shot** | 3–5 projectiles in a fan toward player | Fan-shaped glow on boss |
| **Ring Burst** | Projectiles fired in all directions | Expanding ring indicator on boss body |
| **AoE Zone** | A floor zone glows, then explodes | Colored zone fills, pulses, then detonates |
| **Homing Orb** | Slow orb that tracks player | Distinct color from normal projectiles; pulsing |
| **Laser Sweep** | A beam rotates in a 180–360° arc | Preview beam line rotates before activating |
| **Ground Slam** | Boss stomps creating a radial shockwave | Expanding floor circle from boss position |
| **Wall Bounce Shot** | Projectile that bounces off arena walls | Yellow/green color differentiates from normal shots |
| **Mine Drop** | Boss drops mines on the floor | Mine indicator on ground, short fuse timer |
| **Spiral Spray** | Projectiles rotate in an expanding spiral | Spiral path drawn on floor beforehand |
| **Gravity Pull** | Boss briefly pulls player toward it | Suction visual + ring contracting toward boss |
| **Clone Dive** | Ghost copies launch at the player | Ghost copies flash into view before diving |

### 7.6 Boss Roster (Expanded)

---

#### BOSS 1 — "The Charger"
**Archetype:** Aggressive melee rusher  
**Visual:** Wide, stocky rounded triangle — head-like spike at the front, stubby legs. Bright red-orange with a mean brow.  
**Personality:** Impatient, always moving. Constantly circles the player between charges.  
**Attack Pool:**
- **Dash Charge** *(melee)*: Winds up facing player, then rockets across the arena. Leaves a brief dust trail. Dodge sideways.
- **Spin Crash** *(AoE)*: Spins in place, grows a rotating shockwave ring, then explodes outward. Move away from boss.
- **Triple Charge** *(enrage)*: Performs three charges in rapid succession with slight directional variation.

---

#### BOSS 2 — "The Gunner"
**Archetype:** Heavy projectile spammer  
**Visual:** A rotating hexagon with six "barrels" (small rectangles) evenly spaced around its perimeter. Purple with gold barrels. Slowly rotates at all times.  
**Personality:** Methodical and relentless.  
**Attack Pool:**
- **Aimed Shot** *(projectile)*: One barrel glows, fires a fast shot at the player.
- **Spread Burst** *(spread shot)*: Three barrels glow at once, fire a fan.
- **Full Rotation** *(ring burst)*: All six barrels fire simultaneously in a ring. Step between gaps.
- **Barrage** *(enrage)*: Rapid-fire aimed shots — three fast, with a 0.5s break between burst sets.

---

#### BOSS 3 — "The Stomper"
**Archetype:** Ground-control, AoE specialist  
**Visual:** A large dark-green circle with chunky short legs and a heavily furrowed brow. Has a crown of small rocky spikes.  
**Personality:** Slow but deliberate. Every move has massive presence.  
**Attack Pool:**
- **Big Stomp** *(AoE zone)*: Slams the ground creating a circle AoE that lingers for 1s.
- **Quake Line** *(AoE)*: A line of floor cracks shoots from the boss toward the player's current position. Dodge sideways off the line.
- **Tremor Field** *(AoE zone)*: Boss charges up, then covers 60% of the arena in random AoE zones with staggered timers. Find the safe gaps.
- **Leap Slam** *(enrage)*: Boss leaps toward the player's position, creating a massive impact AoE on landing.

---

#### BOSS 4 — "The Phantom"
**Archetype:** Evasive teleporter with homing attacks  
**Visual:** A thin, star-shaped or jellyfish-like form — mostly white/silver, slightly transparent. Leaves a wispy trail when teleporting.  
**Personality:** Taunting. Disappears just as the player attacks.  
**Attack Pool:**
- **Blink Strike** *(melee)*: Teleports directly behind the player, briefly visible, then slashes. Turn and dodge away on reappearance.
- **Homing Ghost Orb** *(homing orb)*: Fires a slow pulsing orb that follows the player. Circle-strafe or dodge through it.
- **Mirage Volley** *(clone dive)*: Creates 3 ghost copies that dive at the player from different directions. Only the real boss is colored; clones are translucent.
- **Blink Spam** *(enrage)*: Teleports rapidly around the arena, each teleport leaving a homing orb behind.

---

#### BOSS 5 — "The Titan"
**Archetype:** Slow powerhouse, devastating on hit  
**Visual:** A massive dark-red pentagon with heavy, craggy edges. Has a single glowing eye. Very slow movement.  
**Personality:** Unstoppable force. Each attack is infrequent but massive.  
**Attack Pool:**
- **Crushing Sweep** *(laser sweep)*: Raises one massive arm, drags a wide hit-zone across the arena slowly. Hug the edge it starts from.
- **Gravity Slam** *(gravity pull + AoE)*: Pulls all projectiles and the player toward its center, then detonates in a large AoE. Dodge outward after the pull.
- **Boulder Toss** *(projectile)*: Throws a large slow-moving projectile that rolls across the arena and bounces off walls once. Dodge around it.
- **Tantrum** *(enrage)*: Moves faster, sweeps constantly, shorter cooldowns. Becomes erratic and dangerous.

---

#### BOSS 6 — "The Conductor"
**Archetype:** Projectile orchestrator with rotating orb shields  
**Visual:** A rounded diamond shape with a small baton-like protrusion. Orbiting musical-note-like projectiles circle it constantly. Bright teal with yellow accents.  
**Personality:** Calculated. Doesn't rush, lets its orbiting minions do the pressure work.  
**Attack Pool:**
- **Orbital Launch** *(projectile)*: Flings one of its orbiting orbs directly at the player at high speed.
- **Symphony Burst** *(ring burst)*: Launches all orbiting projectiles outward simultaneously. Get between the gaps.
- **Recharge** *(special)*: Briefly charges, summoning new orbiting projectiles back up to max count.
- **Crescendo** *(enrage)*: Doubles the number of orbiting projectiles and increases orbit speed.

---

#### BOSS 7 — "The Jester"
**Archetype:** Unpredictable chaos clown  
**Visual:** Asymmetric, wobbly blob shape with two mismatched eyes and a chaotic color gradient. Randomly bounces around the arena even when not attacking.  
**Personality:** Random and gleeful. Attacks feel almost accidental, but they still hurt.  
**Attack Pool:**
- **Bounce Shot** *(wall bounce shot)*: Throws a projectile that bounces off arena walls 3 times before fading. Track the angle.
- **Confetti Burst** *(spread shot)*: Fires projectiles in a wide, slightly random spread. Not perfectly symmetric — keep moving.
- **Pratfall** *(AoE)*: Fakes a stumble, then creates a surprise AoE under the player's current position. Delay between tell and activation is shorter than usual.
- **Random Teleport Barrage** *(enrage)*: Teleports to random arena positions rapidly while continuously firing spread shots.

---

#### BOSS 8 — "The Riftkeeper"
**Archetype:** Portal manipulator  
**Visual:** A geometric ring (like a portal frame) with an inner color-shift core. Hovers. Radiates a faint aurora around it.  
**Personality:** Methodical. Creates traps across the entire arena. Forces constant repositioning.  
**Attack Pool:**
- **Portal Shot** *(special)*: Opens two small portals on opposite arena walls. Fires a projectile into one; it exits the other. Dodge the exit angle.
- **Rift Mine** *(mine drop)*: Places small rift circles on the floor. After 2s, they fire projectiles outward in 4 directions.
- **Warp Zone** *(AoE zone)*: Creates a zone that pulls the player slightly toward its center while active.
- **Rift Storm** *(enrage)*: Opens 4+ portals simultaneously and rapid-fires projectiles through them from random angles.

---

#### BOSS 9 — "The Weaver"
**Archetype:** Arena-control web/laser specialist  
**Visual:** A spider-like geometric shape — small central body (octagon) with 6–8 long thin geometric legs. Dark violet with glowing line-green highlights.  
**Personality:** Methodical and patient. Likes to fill the arena with hazard lines.  
**Attack Pool:**
- **Web Line** *(laser)*: Shoots a laser strand across the arena between two wall points. It lingers as a hazard for 3s. Dodge through the gap.
- **Cross Trap** *(AoE)*: Places a cross-shaped line pattern on the floor (horizontal + vertical). Both lines light up before activating.
- **Spiral Weave** *(spiral spray)*: Fires a slow rotating spiral of projectiles outward. The gaps are consistent — step through them.
- **Full Web** *(enrage)*: Rapidly weaves 4–6 laser strands in a chaotic pattern, briefly creating a near-full-coverage web that must be navigated.

---

#### BOSS 10 — "The Void Eater"
**Archetype:** Arena shrinker — the longer the fight, the less space you have  
**Visual:** A jet-black circle with a void-like absorbing center and a glowing purple ring outline. Edges of the arena slowly dissolve toward it.  
**Personality:** Patient and menacing. Just existing here feels threatening.  
**Attack Pool:**
- **Void Pulse** *(AoE zone)*: Emits a slow-expanding ring from its center. Jump over or dodge through the wave.
- **Consume** *(special — passive)*: Every 10 seconds, the arena walls shrink inward by a fixed amount. The arena never gets smaller than 40% of its original size.
- **Gravity Well** *(gravity pull)*: Briefly activates a powerful pull. Dodge outward or use the spacebar dash to resist.
- **Dark Nova** *(enrage)*: Fires a ring burst while simultaneously consuming arena space, creating maximum pressure.

---

#### BOSS 11 — "The Echomancer"
**Archetype:** Echo-clone specialist — fights alongside ghost copies of itself  
**Visual:** A diamond-shaped core that is bright and saturated. Its echoes are the same shape but faded/translucent, slightly smaller.  
**Personality:** Strategic. Creates confusion by making the player track which one is real.  
**Attack Pool:**
- **Echo Split** *(special)*: Creates 1–2 translucent ghost copies of itself. Copies share a simplified attack pool but deal reduced damage. Real boss takes damage normally; copies pop after 3 hits.
- **Mirror Volley** *(projectile)*: Boss and all active copies fire projectiles simultaneously.
- **Echo Dive** *(clone dive)*: All copies dive toward the player from different angles at the same time. Dodge through the widest gap.
- **Resonance Burst** *(enrage)*: Boss creates max copies (3) and all enter an aggressive firing state.

---

#### BOSS 12 — "The Mimic"
**Archetype:** Skill reflector — reads and copies the player  
**Visual:** A shifting blob that changes shape briefly after copying a skill. Has a large "eye" that stares directly at the player at all times. Color-shifts depending on which skill it last copied.  
**Personality:** Eerie and intelligent. Deliberately mirrors the player.  
**Attack Pool:**
- **Echo Skill** *(special)*: After the player uses Q, W, or E, The Mimic watches briefly then fires a larger version of that same skill back at the player. Dodge or use i-frames. Cooldown per copy: ~4s.
- **Stare Beam** *(laser)*: Fires a laser directly at the player that tracks slowly. Dodge sideways or use dash.
- **Mimicry Burst** *(spread shot)*: Fires a spread of smaller projectiles styled to look like the player's basic attack.
- **Perfect Copy** *(enrage)*: Copies skills faster (1.5s reaction instead of 3s), fires multiple copies simultaneously.

---

### 7.7 Boss Rotation
- Bosses are drawn from a curated pool per level range, with special milestone bosses at fixed levels.
- Early levels (1–5): Charger, Gunner, Stomper.
- Mid levels (6–12): Phantom, Titan, Conductor, Jester.
- Late levels (13–20): Riftkeeper, Weaver, Void Eater.
- High levels (21+): Echomancer, Mimic, and random mix from full roster.

---

## 8. UI & UX

### 8.1 HUD Layout (In-Game)

```
┌─────────────────────────────────────────────────────────┐
│         [BOSS NAME]                                      │
│   [BOSS HEALTH BAR ████████████░░░░░░░░]                 │
│                                                          │
│                                                          │
│                     [ARENA / GAMEPLAY]                   │
│                                                          │
│                                                          │
│  ♥ [PLAYER HP  ██████░░]                                 │
│  ⚡ [STAMINA   ████░░░░]   Score: 00000   Level: 3       │
│  [Q cooldown] [W cooldown] [E cooldown] [⎵ cooldown]    │
│                                    [⏸ Pause] [⚙ Settings]│
└─────────────────────────────────────────────────────────┘
```

### 8.2 HUD Elements

| Element | Position | Notes |
|---|---|---|
| Boss health bar | Top-center | Large, prominent. Boss name above it. |
| Boss name | Above boss HP bar | Visible only while boss is alive |
| Player health bar | Bottom-left | Primary HP display |
| Stamina bar | Below player HP | Gold/yellow fill |
| Skill bar | Bottom-center | Q, W, E + spacebar dodge slot, each with cooldown overlay |
| Score | Bottom-center-right | Running total |
| Level indicator | Bottom-center-right | "Level 3" |
| Pause button | Bottom-right | ⏸ icon |
| Settings button | Bottom-right | ⚙ icon (opens in-game settings) |
| Floating player HP | Above player sprite | Small bar, always visible in gameplay |

### 8.3 Visual Feedback
- **Damage taken:** Player flashes red briefly.
- **Boss hit:** Boss flashes white + subtle screenshake.
- **Skill on cooldown:** Sweep overlay darkens the skill button, fills back as cooldown completes.
- **Low health:** Player HP bar pulses red below 25%.
- **Portal appears:** Fanfare animation + glowing portal pulse-in.
- **Enrage phase:** Boss aura changes color (red glow), faster movement.
- **Level transition:** Fade-to-black then fade-in on new arena with "Level X" text.

---

## 9. Screens & Menus

### 9.1 Start Screen
- Game logo / title art: "RIFT BRAWLER"
- Background: animated looping arena or particle effect.
- Three buttons:
  - **Start** — begins the game, loads Level 1 arena
  - **Controls** — opens controls overlay
  - **Settings** — opens settings panel

### 9.2 Controls Screen
Overlay or dedicated screen:

| Input | Action |
|---|---|
| Right-click | Move to position |
| Right-click + hold | Continuous movement |
| Left-click | Basic attack |
| Left-click on Altar | Summon boss |
| Left-click on Portal | Enter portal |
| Spacebar | Dodge dash (i-frames) |
| Q | Skill 1 — Power Strike |
| W | Skill 2 — Shield Dash |
| E | Skill 3 — Ground Slam |
| ESC | Pause |

### 9.3 Settings Panel
- **Master Volume** slider
- **Music Volume** slider
- **SFX Volume** slider
- **Controls** (link to controls overlay)
- Accessible from: Start screen and in-game pause menu.

### 9.4 Pause Menu
- Triggered by: ESC or ⏸ button.
- Options:
  - **Resume**
  - **Settings**
  - **Quit to Main Menu**

### 9.5 Game Over Screen
- "GAME OVER"
- Final Score
- Levels Completed
- **Restart** button → Level 1
- **Main Menu** button

### 9.6 Level Transition
- Brief fade-to-black with "Level X" text centered.
- ~0.5–1 second duration.
- Then fade-in on new arena.

---

## 10. Scoring & Progression

### 10.1 Score
- Base points per boss killed.
- Bonus points for:
  - **Speed Kill** — boss killed under a time threshold
  - **No-Hit Bonus** — take no damage in the fight
  - **Low Stamina** — finish with less than 20% stamina (aggressive play rewarded)

### 10.2 Progression
- Level number increases by 1 per arena cleared.
- Player stats scale up each level (health, damage).
- Boss stats scale up each level.
- No persistent meta-progression in v1.0 — each run starts from Level 1.

---

## 11. Audio

### 11.1 Music
- **Start screen:** upbeat, catchy loop
- **Arena (pre-boss):** ambient, slightly tense
- **Boss fight:** energetic driving beat; tempo increases on enrage
- **Boss death (portal opens):** brief triumphant sting
- **Game Over:** short melancholy sting
- **Level transition:** short bright jingle

### 11.2 Sound Effects
| Event | SFX |
|---|---|
| Basic attack fire | Quick "pew" or "whoosh" |
| Basic attack hit | Satisfying "thwack" |
| Spacebar dodge | Quick "whoosh" with echo |
| Skill Q | Powerful "thump" + projectile hum |
| Skill W | Shield "clang" + dash whoosh |
| Skill E | Ground impact + rumble |
| Player takes damage | Impact + brief "oof" |
| Player death | Shatter sound |
| Boss spawn | Dramatic rumble + roar |
| Boss hit | Heavier impact |
| Boss enrage | Audio swell + distortion sting |
| Boss death | Explosion + fanfare |
| Portal opens | Magical whoosh/chime |
| Portal entered | Swoosh |
| Altar interaction | Mystical chime |
| UI button click | Soft click |

### 11.3 Volume Controls
- Master Volume, Music Volume, SFX Volume — all in Settings.
- Defaults: Master 80%, Music 60%, SFX 80%.

---

## 12. Controls Reference

| Input | Action |
|---|---|
| Right-click | Move to clicked position |
| Right-click + hold | Continuous movement toward cursor |
| Left-click | Basic attack toward cursor |
| Left-click (Altar) | Interact — summon boss |
| Left-click (Portal) | Enter portal |
| Spacebar | Dodge dash with i-frames (low stamina cost) |
| Q | Skill 1 — Power Strike (medium stamina) |
| W | Skill 2 — Shield Dash (high stamina) |
| E | Skill 3 — Ground Slam (high stamina) |
| ESC | Pause / Unpause |

---

## 13. Tech Stack

| Layer | Technology |
|---|---|
| Game Engine | **Phaser 3** (JavaScript) |
| Language | JavaScript (ES6+) |
| Renderer | Phaser WebGL/Canvas |
| Art | Phaser Graphics API (vector, no external sprites required) |
| Audio | Phaser Sound Manager |
| Dev Server & Build | **Vite** |
| Target Platform | Desktop browser (Chrome, Firefox, Edge) |

### Project Structure (Planned)
```
Project_1/
├── index.html
├── package.json
├── vite.config.js
├── GDD.md
└── src/
    ├── main.js                    # Phaser game config + boot
    ├── scenes/
    │   ├── BootScene.js           # Asset preload
    │   ├── StartScene.js          # Start screen
    │   ├── ArenaScene.js          # Core gameplay
    │   ├── UIScene.js             # HUD overlay (runs in parallel to ArenaScene)
    │   └── GameOverScene.js
    ├── entities/
    │   ├── Player.js              # Player class, animations, skills, stamina
    │   ├── Boss.js                # Base boss class
    │   ├── bosses/                # Individual boss implementations
    │   │   ├── Charger.js
    │   │   ├── Gunner.js
    │   │   └── ...
    │   └── Projectile.js
    ├── systems/
    │   ├── ProgressionSystem.js   # Level scaling
    │   ├── StaminaSystem.js
    │   └── ScoreSystem.js
    ├── arenas/
    │   ├── ArenaGenerator.js      # Generates arena geometry + decorations
    │   └── arenaConfigs.js        # Shape definitions per level range
    └── config/
        ├── gameConfig.js          # Global constants
        └── bossConfig.js          # Boss stat tables and attack configs
```

---

## 14. Art Style

### 14.1 Direction
**Vector / Geometric** — all art drawn with Phaser's Graphics API and tweens. No external sprite sheets required in v1.0. This ensures a crisp, scalable look and keeps the project self-contained.

### 14.2 Visual Language
- **Shapes:** Circles, polygons, rounded rectangles, smooth curves.
- **Characters:** Geometric humanoids (see Player section). Bosses are larger, more imposing shapes with distinct silhouettes.
- **Colors:** Bright, saturated, high-contrast. Each level theme has its own palette.
- **Outlines:** Thin dark outlines on all characters and objects for readability.
- **Particles:** Used extensively — attack impacts, boss death, portal swirl, altar glow, dodge trail.
- **Glow:** Key objects (altar, portal, skill projectiles, boss health bar) have soft glow halos.

### 14.3 Boss Visual Summary
| Boss | Shape | Colors |
|---|---|---|
| The Charger | Stocky triangle with spike | Red-orange / dark red |
| The Gunner | Rotating hexagon with barrels | Purple / gold |
| The Stomper | Heavy circle with spikes | Dark green / stone gray |
| The Phantom | Star/jellyfish, transparent | White / silver |
| The Titan | Massive pentagon, single eye | Deep red / near-black |
| The Conductor | Rounded diamond + orbiting orbs | Teal / yellow |
| The Jester | Wobbly asymmetric blob | Chaotic gradient |
| The Riftkeeper | Geometric ring with glowing core | Cyan / aurora |
| The Weaver | Octagon core + 8 thin legs | Dark violet / lime green |
| The Void Eater | Jet-black circle, void center | Black / purple |
| The Echomancer | Bright diamond + faded echoes | Gold / translucent copies |
| The Mimic | Color-shifting blob with eye | Shifts to match player's skills |

### 14.4 UI Style
- Flat, clean design. Rounded rectangles for bars and panels.
- Health bar: red fill on dark background.
- Stamina bar: gold/yellow fill on dark background.
- Skill buttons: colored squares with key label. Sweep overlay for cooldown.
- Font: Bold, readable, cute sans-serif — **Fredoka One** or **Nunito** (Google Fonts).

---

## 15. Future Roadmap

Features out of scope for v1.0 but architecturally considered so the codebase can accommodate them.

### 15.1 Player Classes
| Class | Playstyle |
|---|---|
| **Knight** *(v1.0 default)* | Balanced — melee/ranged mix, shield defensive dash |
| **Archer** | Long-range, high single-target DPS, fragile |
| **Wizard** | AoE magic, high stamina cost, devastating if landed |
| **Assassin** | Fast, close-range burst, blink/teleport skills |
| **Healer** | Support — passive regen, team buffs (multiplayer-first) |

Class selection would appear on the Start screen before the run begins.

### 15.2 Co-op Multiplayer
- Host creates a lobby, shares a code.
- Up to 4 players fight together.
- Boss stats scale for party size.
- Healer class becomes viable and essential.
- Architecture note: design ArenaScene with entity collections from the start (even for single player), making networked players a refactor rather than a rewrite.

### 15.3 Other Future Features
- Meta-progression (unlockable cosmetics, permanent upgrades between runs)
- Boss rotation pools (random boss selection per level)
- Leaderboards (high score tracking)
- Mobile touch controls

---

*End of Game Design Document v1.1*  
*Next: Project scaffold + Phaser 3 + Vite setup*
