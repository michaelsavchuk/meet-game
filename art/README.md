# Arena backgrounds (`arena.blend`)

Blender 5.2 file that renders the arena backdrops: one **scene per background**, all seen through the same camera
and sharing the same floor, border and entrances, so `ARENA` and `STAIRS` in `game/src/config.js` fit every one.
They're purely visual: switching backgrounds is just loading a different PNG. All packs are Kenney's (CC0), and their
textures are packed into the .blend, so it doesn't need the original downloads.

| Scene | Pack | Output (1280×720, the game canvas) | In the game |
|---|---|---|---|
| `Dungeon` | Mini Dungeon | `game/assets/bg-dungeon.png` | Battle/co-op (the original arena) |
| `Arcade` | Mini Arcade | `game/assets/bg-arcade.png` | Lobby |
| `Arena` | Mini Arena | `game/assets/bg-arena.png` | Battle/co-op |
| `Forest` | Mini Forest | `game/assets/bg-forest.png` | Battle/co-op |

The game picks among the battle ones (`game/src/backgrounds.js`; the host chooses on the control page, Random by
default). Re-rendering over an output updates the game; a new background also needs adding to `BATTLE` there.
Switch scenes with the scene selector at the top right of
Blender. Render the active scene with F12, then Image → Save As over its output file (Output Properties → Output
shows the path), or `bpy.ops.render.render(write_still=True)`, which writes it directly. Save the .blend afterward.
The Blender MCP server (`mcp__blender__*`) can inspect and edit the open file; prefer the Python API through
`execute_blender_code` for bulk changes. Each background scene also carries a `background` custom property (its
lowercase name) so code can find them all.

## How the file is organized
- **`Shared` collection**, linked into every scene (same objects, not copies):
  - `Camera` and `Light`. Moving the camera moves it for every background; then re-measure `ARENA` and `STAIRS`
    (see "Fitting the game").
  - Wireframe `Guide *` objects (not rendered, not selectable; show/hide them in the outliner): `Guide Floor` is the
    play floor (x ±6.5, y ±4, 13×8 one-meter cells centered on the origin), `Guide Walls` the 1 m border band
    around it, and `Guide Entry *` the four entrance lanes (back/front 1 m wide at x 0, left/right 2 m wide at y 0).
    Keep every background's floor, border and entrances on these lines, and keep tall things off the front border:
    anything in front of the floor that rises above about 1 m covers the floor in the picture.
- **`<Name>`** (for example `Forest`): everything that background's camera sees.
- **`<Name> Pack`**: the pack's models, out of view at x ≥ 14. Objects are named `<pack>-<model>` (for example
  `forest-tree`). Some placed decor also lives here, moved into view (the arena's columns and bricks, the forest's
  camp props), so a background is everything in view from both collections. Each pack has one packed texture (`<pack>-colormap.png`) and one material (`<pack>-colormap`) that
  runs through the shared `Toon Style` node (see "Look"), so every background is shaded alike.
- The world (dark backdrop) and render settings are the same in all scenes.

**Editing a layout by hand**
- Objects in the scenes are **linked duplicates** of the pack models: they share mesh data. Add pieces by selecting
  one (in the scene or in `<Name> Pack`), **Alt+D**, and moving it into the scene's collection (**M**). Don't edit a
  placed piece's mesh in Edit Mode unless you mean to change every copy; to change just one, make it single-user
  first (**U → Object & Data**).
- Pack objects keep the FBX import's `rotation_euler.x = 90°` and `scale = 0.01`; copies made from them keep it too.
  Turn pieces with `rotation_euler.z` only. Kenney models put their front (a wall's trim, a cabinet's screen) on
  local −Y, so the turn that faces the floor from each side is back 0, front π, left π/2, right −π/2.
- Most pieces sit on whole- or half-meter positions; Increment snapping helps.
- The FBX animations were removed when the packs were imported; a pack model with an animation would ignore any
  pose you set on a copy (that's how the arcade's doors were found out).

## Backgrounds
The entrances in the new backgrounds are flat hallways/trails rather than stairs, but characters still run in along
`STAIRS`, whose off-screen ends are 1.8 m up. Against the shared camera that path stays inside each entrance lane.

### Arcade (lobby)
- **Floor**: `arcade-floor` tiles (a 2×2 checker each), continuing through each doorway and down its hallway.
- **Walls**: plain `arcade-wall` (0.6 m thick, trim facing in) on lines 0.3 m outside the floor, so their inner
  faces sit on the floor's edge. Corners use the pack's `wall-corner`; its arms reach 0.2 m past the floor's edge,
  so the straight piece next to each corner is scaled to 0.8 m long to meet it without overlapping faces (which
  would flicker).
- **Entrances**: an open doorway on each side, no doors (characters are drawn over the background, so they'd seem to
  walk through them), each leading into a hallway walled on both sides with the trim facing in, running off screen.
  Where a room wall turns into a hallway wall is **`arcade-wall-corner-outer`** (`door-corner` objects), a custom
  piece in `Arcade Pack`: a straight wall bent a quarter turn so the trim curves round the outside of the bend,
  rounded like the pack's own corners. It fills a 0.6 m square with its origin at the doorway's corner and is
  symmetric, so one piece fits all eight spots by turning it (0 when its square points toward +x/+y, π/2 for −x/+y,
  −π/2 for +x/−y, π for −x/−y). The room wall next to it is scaled to 0.4 m, and a floor tile under it
  (`door-floor`) carries the checker into the rounded-off part.
  Four of the `door-corner` pieces are single-user copies (`arcade-wall-corner-outer.001` etc.), tweaked on their own.
- **Outside**: nothing; the world's dark backdrop shows around the room and hallways.
- **Decor**: none, so the floor reads clearly behind the lobby's floor text and characters.

### Arena
- **Floor**: `arena-floor`, with some `arena-floor-detail` away from the middle.
- **Border**: a ring of the pack's low `stairs` (0.5 m) climbing away from the floor, with `stairs-corner-inner` at
  the corners (it matches the straight runs on both of its sides; unturned, its low corner points to +x/−y).
- **Outside**: raised ground, level with the top step, filling the rest of the frame: six large scaled blocks
  (`ground`), one either side of each side path and two either side of the back path.
- **Entrances**: flat paths cut through the stairs and raised ground, lined on both sides with `border-straight`
  (`path-edge`) as low walls.
- **Decor** (kept sparse): a row of columns along the back rim and a few down the sides, some broken
  (`column-damaged`), with brick piles (`bricks`) between them; these are in `Arena Pack`, placed at z 0.5 on the raised
  ground. A banner either side of the back path, and trees (`arena-tree`) at the frame's corners.

### Forest
- **Clearing**: `Circle` (in `Forest Pack`), one large flat disc (about 18×19.5 m) at the origin using
  `forest-colormap`, so its green comes from the pack's texture and the `Distance Fade` darkens it toward the edges.
  The old `forest-grass` material (noise through a two-green ramp) is no longer used by anything.
- **Forest floor**: the same disc runs under the trees; the old grass tiles are gone except one raised `platform`
  (`ground-platform`).
- **Trees**: `tree` and `tree-high` (about 190), randomly turned and sized, standing on the disc, trunks kept off the floor and out
  of the entrance lanes. Trees in front of the floor are scaled down so their tops stay just below the floor's front
  edge in the picture (about where the dungeon's front wall is), and the ones on the camera's side of the side
  trails are kept small so the trail shows. One plant and two dirt patches sit near the clearing's edges.
- **Trails**: a `rocks-ramp` at the forest's edge climbing to `rocks-low` tiles with `patch-grass` on
  top, running off screen.
- **Camp decor** (in `Forest Pack`): a tent and fences back-left, an archery range (three targets and a flag)
  back-right and right, stones and a fence in the front corners, and two half-buried `Sphere` mounds.
- **Distance fade**: the `Distance Fade` node group sits between the color and `Toon Style` in `forest-colormap`. It
  blends the color toward `Tint` (the AO tint at a quarter brightness) by how far the surface is outside the floor
  rectangle in world space, so the forest darkens away from the clearing. It's set to `Start` −1.4 m (so the fade
  begins inside the floor, shading the clearing's edges), `End` 6.1 m and `Amount` 3.1. Add the group to another
  material the same way to use it elsewhere.

### Dungeon
The original arena, built before the others. These notes go into more detail.
- **`Dungeon` collection**: everything the camera sees (it was called `Arena` before the other backgrounds). 232 **linked duplicates** (they share mesh data with the pack
  originals, so editing an original's mesh or material updates every copy):
  - Floor: 13×8 grid of 1 m tiles centered on the origin (x −6..6, y −3.5..3.5). About 15% are `floor-detail`,
    chosen with `random.Random(7)` so a rebuild comes out the same. Then the three that sat under the game's floor text
    (`FloorText.js`, center of the screen) swapped meshes with plain tiles nearer the walls, so keep the band around
    screen y 320–470 free of `floor-detail` if you rebuild.
  - Walls: a ring at x = ±7, y = ±4.5. Straight runs use `wall-half` (trim on its local −Y face), turned with
    `rotation_euler.z` so the trim faces the floor: back 0, front π, left π/2, right −π/2. Corners use
    `wall-corner`, a custom asset (in `Dungeon Pack`): a `dirt` block with the pack's `column` scaled to
    0.3×0.3×1.0 m in its −X/−Y corner. Each corner is turned so the pillar sits at the floor's inner corner:
    back-right 0, back-left π/2, front-left π, front-right −π/2.
    To revert to the original full `wall` corners, run this for each corner object: `o.data = bpy.data.meshes[o['orig_mesh']]`,
    then `o.rotation_euler.z = o['orig_rot_z']`. The objects are `wall.001`–`wall.004`.
  - Stairs: copies of the pack's `stairs` replace the wall pieces at the middle of each side, so players can enter from
    any side: `stairs-back` (0, 4.5) and `stairs-front` (0, −4.5), and two wide on the sides (which have an even number
    of tiles) at y = ±0.5: `stairs-left`, `stairs-left.001`, `stairs-right`, `stairs-right.001`. The top step (0.9 m, level
    with the `dirt` outside) faces out, using the same `rotation_euler.z` as the wall it replaced. Each has a second flight,
    `<name>-upper`, stacked on it 0.9 m further out and 0.9 m up (keeping the 0.15 m step rhythm), so the steps keep
    climbing past the frame edge and players seem to come in from off screen rather than down from the dirt. Don't let the
    flights overlap: their side faces would be coplanar and z-fight.
  - Decor: a `banner` on the wall piece to each side of the back and side stairs (`banner-back-a/b`, `banner-left-a/b`,
    `banner-right-a/b`), placed one cell in from the wall with the wall's `rotation_euler.z`. The front wall gets none
    because its inner face points away from the camera, so only slivers would show. A few props sit in the floor corners
    (`decor-*`): two barrels back-left, `rocks` (scaled 0.007) back-right, `stones` front-left, a barrel front-right.
  - Dirt: 98 `dirt` blocks (random 90° turns) filling the ground outside the walls: 76 from `random.Random(11)`, plus 22
    `dirt-fill` copies added when the camera moved back. They're placed only where a tile is in view, so no world
    background shows in the render. Re-run that placement if the camera moves: for each 1 m cell outside the walls
    (integer x, half-integer y), add a `dirt` copy at z 0 if any corner at z 0 or 0.9 projects into the frame and no
    Dungeon object is already within 0.6 m.
  - All pack objects carry `rotation_euler.x = 90°` and `scale = 0.01` from the FBX import. Keep that when
    placing new copies.
- **`Dungeon Pack`**: the original pack assets (props, characters, weapons, every wall/floor variant), laid out in a
  grid at x ≥ 14, outside the camera's view. Copy from here (`obj.copy()` + link to `Dungeon`) to add props.

## Adding a background
1. Download and unzip the Kenney pack.
2. From the Dungeon scene, make a new scene with **New Scene → Linked Copy** (keeps the render and world settings),
   name it, unlink the Dungeon collections from it, and keep `Shared` linked. Add a `<Name>` collection and a
   `<Name> Pack` collection.
3. Import the pack's FBX models (`Models/FBX format`) into `<Name> Pack` and move them out of view (x ≥ 14). Clear
   their animation data and rename them `<pack>-<model>`.
4. Give them one material: copy an existing `<pack>-colormap` material, swap its image for the pack's
   `colormap.png`, pack the image (Image → Pack), and assign it to every slot in place of the imported materials.
5. Set Output Properties → Output to `//../game/assets/bg-<name>.png`, and add a `background` custom property
   (the lowercase name) on the scene.
6. Build the layout from linked duplicates within the guides, then render.

## Camera and light (shared)
- `Camera`: perspective, 50 mm, tilted 26° from straight down (`rotation_euler = (26°, 0, 0)`), roughly at
  (0, −10.30, 21.37). Framed so the whole walled room is centered vertically, with about 58 px of dirt above the back
  wall and 60 px below the front wall. The stairs still run off every edge of the frame.
- `Light`: sun, **shadows off** (`use_shadow = False`). It only matters if toon bands are turned on.
- World: `Background` (ambient fill) plus a `Camera BG` node mixed in by `Light Path → Is Camera Ray`, so
  the camera sees a dark backdrop (`#0b0b0f`-ish) in the corners above the back wall.
- Render: EEVEE, Standard view transform, exposure 0, 128 samples. **Ray tracing and Fast GI must stay on**: the
  AO node gets its data from them and renders nearly white without them.

## Look: the `Toon Style` node group (shared)
Every pack material is `Image Texture → Toon Style → Material Output` (the forest's materials put `Distance Fade`
in between). The original Principled BSDF is still in
each material, just unplugged. Reconnect it to Material Output to get the pack's stock shading back.

All look settings live in **one place**: open any material → select the `Toon Style` node → Tab → the
**Settings** node (a `Toon Core` group). Don't edit the `Toon Style` node's inputs in a material; it only passes the
texture color through. Changing Settings updates every material in every background.

| Settings input | Current | Meaning |
|---|---|---|
| Toon Amount | 0 | 0 = flat unlit texture (current look), 1 = three toon light bands |
| Shadow / Mid / Lit Color | blue / pale blue / warm yellow | Band tints (only with Toon Amount > 0) |
| Mid At / Lit At | 0.36 / 0.68 | Light levels (Shader to RGB, BW) where the mid/lit bands start |
| AO Strength | 4 | Multiplier on `1 − AO`, clamped. EEVEE's AO pass is faint (~0.85–0.95 in corners), so 1 barely shows |
| AO Distance | 2 m | AO reach |
| AO Tint | deep blue | Color that occluded areas multiply toward |

**Chosen look (Oct 2026): flat texture + strong blue AO**, no shadows, no toon bands. An alternative that was
tried and liked: crisp toon shading (Toon Amount 1, AO Strength 0, sun shadows on with angle 0, small
`shadow_filter_radius`). If shadows vanish after changing shadow settings, EEVEE's shadow pool overflowed;
lower `shadow_maximum_resolution` or raise `scene.eevee.shadow_pool_size`.

## Fitting the game
These measurements come from the shared camera and floor, so they hold for every background.

`ARENA` in `game/src/config.js` is the render's visible floor, a trapezoid in screen px. Its back edge is x 187–1094
at y 117. Its front edge is x 117–1163 at y 636, where the front wall's top starts hiding the floor. `Character.js` keeps
each character's feet inside it (`limits()`). If the camera, lens, or room size changes, re-render and re-measure
the floor corners. Project (±6.5, ±4, 0) and the front wall's inner top (0, −4, 1) with
`bpy_extras.object_utils.world_to_camera_view`, then update `ARENA`.

`STAIRS` in the same file is where characters run in: for each staircase, the bottom step's two ends at the floor
(z 0, on the wall's inner line) and the same line 2 m further out at z 1.8 (off screen), in px. Re-measure it the same
way if the stairs or camera move: `foot` is (±0.4, ±4, 0) for the back/front stairs and (±6.5, ±0.9, 0) for the sides;
`off` is (±0.3, ±6, 1.8) and (±8.6, ±0.8, 1.8).
