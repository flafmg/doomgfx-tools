# LMP Reader
View and convert Doom/Doom-based games .lmp image files in VS Code.

## Features

- View .lmp files directly in the editor
- Convert LMP to PNG
- Convert PNG to LMP
- Load custom palettes

## Usage

**View an LMP file:**
- Open any .lmp file

**Convert LMP to PNG:**
- Right-click .lmp file -> "LMP: Convert to PNG"

**Convert PNG to LMP:**
- Right-click .png file -> "LMP: Convert PNG to LMP"

**Load custom palette:**
1. Press `Ctrl+Shift+P`
2. Type "LMP: Load Custom Palette"
3. Select your PLAYPAL file
4. Pick a palette if the file has multiple

**Or use Settings:**
- Search for "LMP Reader" in settings
- Set palette path and index

## Palette Files
To extract from WAD/PK3 using Slade:
1. Open the file in Slade
2. Find the PLAYPAL lump
3. Export it
