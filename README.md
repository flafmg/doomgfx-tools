# DoomGFX Tools
A VS Code extension for viewing and editing Doom-format LMP images with a SLADE-inspired interface.

<placeholder, put images here>

## Features

### Image Viewer & Editor
- View and edit .lmp files directly in VS Code

### Image Transformations
- Flip Horizontal - Mirror the image horizontally
- Flip Vertical - Mirror the image vertically
- Rotate Left/Right - Rotate image 90° in either direction
- Undo/Redo - Full history support (50 levels) with Ctrl+Z / Ctrl+Y

### Offset System
- View and edit image offsets
- Drag to adjust offset (click and drag inside image bounds)
- Offset presets:
  - Monster: `offsetX = width/2`, `offsetY = height - 4`
  - Monster GL: `offsetX = width/2`, `offsetY = height`
  - Projectile: `offsetX = width/2`, `offsetY = height/2` (centered)
  - Custom presets: Save your own presets (stored in settings)

### Navigation
- Zoom controls: Mouse wheel
- Zoom to fit: Automatically fit image to viewport
- Pan: Middle mouse button to drag the view
- Re-center: Reset view to center

### Palette and convertion
- Convert LMP to PNG and PNG to LMP
- Support for custom game palettes (Doom, Heretic, Hexen, SRB2, etc.)


## Usage

### View and Edit LMP Files
1. Open any .lmp file in VS Code
2. The custom editor opens automatically
3. Use the toolbar to transform, adjust offsets, or zoom
4. Click Save when done, or Revert to discard changes

### Image Transformations
- Click the flip/rotate buttons in the toolbar
- Changes are applied immediately
- Use Ctrl+Z to undo, Ctrl+Y to redo

### Adjust Sprite Offsets
1. Check "View offset" to see crosshair guides
2. Edit offset values directly in the input fields, or
3. Click and drag the image to adjust offset visually
4. Use the preset dropdown to apply common offset patterns

### Convert Between Formats

Convert LMP to PNG:
- Right-click a .lmp file → "DoomGFX: Convert to PNG"
- Or use Command Palette: `DoomGFX: Convert to PNG`

Convert PNG to LMP:
- Right-click a .png file → "DoomGFX: Convert PNG to LMP"
- Or use Command Palette: `DoomGFX: Convert PNG to LMP`

### Custom Palettes

Load custom palette:
1. Press Ctrl+Shift+P (or Cmd+Shift+P on Mac)
2. Type "DoomGFX: Load Custom Palette"
3. Select your palette file (PLAYPAL or similar)
4. If the file has multiple palettes, pick which one to use
5. Close and reopen .lmp files to apply the new palette

Use Settings for persistent palette:
- Open VS Code Settings
- Search for "DoomGFX Tools"
- Set `doomgfxTools.palettePath` to your palette file path
- Set `doomgfxTools.paletteIndex` to select which palette page to use

## Extracting Palette Files

To extract from WAD/PK3 using Slade:
1. Open the game file in Slade
2. Find the PLAYPAL lump
3. Right-click → Export
4. Save the file

Common palette sources:
- Doom/Doom 2: PLAYPAL in DOOM.WAD or DOOM2.WAD
- Heretic: PLAYPAL in HERETIC.WAD
- Hexen: PLAYPAL in HEXEN.WAD
- SRB2: PLAYPAL in SRB2.PK3 (contains 14 palettes)

### Custom Presets
Custom offset presets are stored in VS Code settings (`lmpreader.customPresets`) and persist across sessions. You can manually edit them in your settings.json if needed:

```json
{
  "lmpreader.customPresets": [
    {
      "name": "My Custom Preset",
      "offsetX": 32,
      "offsetY": 64
    }
  ]
}
```

