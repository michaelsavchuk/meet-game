# Arena background (`arena.blend`)

Blender 5.2 scene that renders the battle arena backdrop: a walled dungeon room seen from above, built
from Kenney's **Mini Dungeon** pack (CC0). Rendering (F12, then Image → Save, or
`bpy.ops.render.render(write_still=True)`) writes `//../game/assets/arena.png`, a 1280×720 image that matches the game canvas.
Textures are packed into the .blend, so it doesn't need the original download.

The Blender MCP server (`mcp__blender__*`) can inspect and edit the open file. Prefer the Python API through
`execute_blender_code` for bulk changes (150 tiles, 31 materials).

## Scene layout
- **`Arena` collection**: everything the camera sees. 232 **linked duplicates** (they share mesh data with the pack
  originals, so editing an original's mesh or material updates every copy):
  - Floor: 13×8 grid of 1 m tiles centered on the origin (x −6..6, y −3.5..3.5). About 15% are `floor-detail`,
    chosen with `random.Random(7)` so a rebuild comes out the same. Then the three that sat under the game's floor text
    (`FloorText.js`, center of the screen) swapped meshes with plain tiles nearer the walls, so keep the band around
    screen y 320–470 free of `floor-detail` if you rebuild.
  - Walls: a ring at x = ±7, y = ±4.5. Straight runs use `wall-half` (trim on its local −Y face), turned with
    `rotation_euler.z` so the trim faces the floor: back 0, front π, left π/2, right −π/2. Corners use
    `wall-corner`, a custom asset (in `Collection`): a `dirt` block with the pack's `column` scaled to
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
  - Dirt: 76 `dirt` blocks (random 90° turns, `random.Random(11)`) filling the ground outside the walls. They're placed only
    where a tile is in view, so no world background shows in the render. Re-run that placement if the camera moves.
  - All pack objects carry `rotation_euler.x = 90°` and `scale = 0.01` from the FBX import. Keep that when
    placing new copies.
- **`Collection`**: the original pack assets (props, characters, weapons, every wall/floor variant), laid out in a
  grid at x ≥ 14, outside the camera's view. Copy from here (`obj.copy()` + link to `Arena`) to add props.

## Camera and light
- `Camera`: perspective, 50 mm, tilted 26° from straight down (`rotation_euler = (26°, 0, 0)`), roughly at
  (0, −9.36, 19.76). Framed so the side walls just reach the frame edges at the front and the back wall's top
  sits at the top edge. Front-wall face is cropped at the bottom.
- `Light`: sun, **shadows off** (`use_shadow = False`). It only matters if toon bands are turned on.
- World: `Background` (ambient fill) plus a `Camera BG` node mixed in by `Light Path → Is Camera Ray`, so
  the camera sees a dark backdrop (`#0b0b0f`-ish) in the corners above the back wall.
- Render: EEVEE, Standard view transform, exposure 0, 128 samples. **Ray tracing and Fast GI must stay on**: the
  AO node gets its data from them and renders nearly white without them.

## Look: the `Toon Style` node group
Every pack material is `Image Texture → Toon Style → Material Output`. The original Principled BSDF is still in
each material, just unplugged. Reconnect it to Material Output to get the pack's stock shading back.

All look settings live in **one place**: open any material → select the `Toon Style` node → Tab → the
**Settings** node (a `Toon Core` group). Don't edit the `Toon Style` node's inputs in a material; it only passes the
texture color through. Changing Settings updates all 31 materials.

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
`ARENA` in `game/src/config.js` is this render's visible floor, a trapezoid in screen px. Its back edge is x 151–1129
at y 108. Its front edge is x 69–1211 at y 675, where the front wall's top starts hiding the floor. `Character.js` keeps
each character's feet inside it (`limits()`). If the camera, lens, or room size changes, re-render and re-measure
the floor corners. Project (±6.5, ±4, 0) and the front wall's inner top (0, −4, 1) with
`bpy_extras.object_utils.world_to_camera_view`, then update `ARENA`.

`STAIRS` in the same file is where characters run in: for each staircase, the bottom step's two ends at the floor
(z 0, on the wall's inner line) and the same line 2 m further out at z 1.8 (off screen), in px. Re-measure it the same
way if the stairs or camera move.
