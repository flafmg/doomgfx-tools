import * as vscode from 'vscode';
import * as path from 'path';
import { parseLMP, lmpToRGBA, rgbaToLMP, ColorApproximationMode } from './parser/lmpParser';
import { getCurrentPalette, loadPaletteFromFile, setCustomPalette } from './parser/palette';

export function registerCommands(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('doomgfxTools.convertToPNG', convertToPNG)
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('doomgfxTools.convertFromPNG', convertFromPNG)
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('doomgfxTools.loadPalette', loadPalette)
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('doomgfxTools.resetPalette', resetPalette)
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('doomgfxTools.applyPalette', applyPalette)
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('doomgfxTools.setColorMode', setColorMode)
    );
}

function getColorMode(): ColorApproximationMode {
    const config = vscode.workspace.getConfiguration('doomgfxTools');
    const mode = config.get<string>('colorApproximationMode', 'nearest');
    return mode as ColorApproximationMode;
}

async function setColorMode(): Promise<void> {
    const config = vscode.workspace.getConfiguration('doomgfxTools');
    const currentMode = config.get<string>('colorApproximationMode', 'nearest');

    const options = [
        {
            label: currentMode === 'nearest' ? '$(check) Nearest Color' : 'Nearest Color',
            description: 'No dithering - Fast',
            detail: currentMode === 'nearest' ? 'Currently selected' : 'Simple color matching, may show banding',
            mode: 'nearest'
        },
        {
            label: currentMode === 'bayer-2x2' ? '$(check) Bayer 2×2' : 'Bayer 2×2',
            description: 'Ordered dithering - Very fast',
            detail: currentMode === 'bayer-2x2' ? 'Currently selected' : 'Subtle crosshatch pattern, good for small images',
            mode: 'bayer-2x2'
        },
        {
            label: currentMode === 'bayer-4x4' ? '$(check) Bayer 4×4' : 'Bayer 4×4',
            description: 'Ordered dithering - Fast',
            detail: currentMode === 'bayer-4x4' ? 'Currently selected' : 'Balanced pattern, recommended for most textures',
            mode: 'bayer-4x4'
        },
        {
            label: currentMode === 'bayer-8x8' ? '$(check) Bayer 8×8' : 'Bayer 8×8',
            description: 'Ordered dithering - Fast',
            detail: currentMode === 'bayer-8x8' ? 'Currently selected' : 'Smoothest ordered dithering, best for gradients',
            mode: 'bayer-8x8'
        },
        {
            label: currentMode === 'floyd-steinberg' ? '$(check) Floyd-Steinberg' : 'Floyd-Steinberg',
            description: 'Error diffusion - Slower',
            detail: currentMode === 'floyd-steinberg' ? 'Currently selected' : 'Serpentine pattern, good for photographic images',
            mode: 'floyd-steinberg'
        },
        {
            label: currentMode === 'atkinson' ? '$(check) Atkinson' : 'Atkinson',
            description: 'Error diffusion - Medium speed',
            detail: currentMode === 'atkinson' ? 'Currently selected' : 'Preserves detail, faster than Floyd-Steinberg, classic Mac look',
            mode: 'atkinson'
        }
    ];

    const selected = await vscode.window.showQuickPick(options, {
        placeHolder: 'Select color approximation mode',
        title: 'Color Approximation Mode'
    });

    if (!selected) {
        return;
    }

    await config.update('colorApproximationMode', selected.mode, vscode.ConfigurationTarget.Global);
    
    const modeNames: Record<string, string> = {
        'nearest': 'Nearest Color',
        'bayer-2x2': 'Bayer 2×2',
        'bayer-4x4': 'Bayer 4×4',
        'bayer-8x8': 'Bayer 8×8',
        'floyd-steinberg': 'Floyd-Steinberg',
        'atkinson': 'Atkinson'
    };
    
    vscode.window.showInformationMessage(`Color mode set to: ${modeNames[selected.mode]}`);
}

async function loadPalette(): Promise<void> {
    const uris = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        filters: {
            'Palette Files': ['pal', 'lmp', 'dat'],
            'All Files': ['*']
        },
        title: 'Select Palette File (768 bytes, 256 RGB colors)'
    });

    if (!uris || uris.length === 0) {
        return;
    }

    try {
        const fs = require('fs');
        const buffer = await fs.promises.readFile(uris[0].fsPath);
        const numPalettes = Math.floor(buffer.length / 768);
        
        let paletteIndex = 0;
        
        if (numPalettes > 1) {
            const options = [];
            for (let i = 0; i < numPalettes; i++) {
                options.push({
                    label: `Palette ${i + 1}`,
                    description: i === 0 ? '(Default/Main palette)' : `(Palette page ${i + 1})`,
                    index: i
                });
            }
            
            const selected = await vscode.window.showQuickPick(options, {
                placeHolder: `File contains ${numPalettes} palettes. Select one:`,
                title: 'Select Palette Page'
            });
            
            if (!selected) {
                return;
            }
            
            paletteIndex = selected.index;
        }
        
        const palette = new Uint8Array(buffer.slice(paletteIndex * 768, (paletteIndex + 1) * 768));
        setCustomPalette(palette);
        
        const msg = numPalettes > 1 
            ? `Palette ${paletteIndex + 1}/${numPalettes} loaded from ${path.basename(uris[0].fsPath)}`
            : `Palette loaded: ${path.basename(uris[0].fsPath)}`;
        
        vscode.window.showInformationMessage(`${msg}. Close and reopen LMP files to apply.`);
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to load palette: ${error}`);
    }
}

async function resetPalette(): Promise<void> {
    setCustomPalette(null);
    vscode.window.showInformationMessage('Palette reset to default (Doom). Close and reopen LMP files to apply.');
}

async function applyPalette(): Promise<void> {
    const config = vscode.workspace.getConfiguration('doomgfxTools');
    const palettePath = config.get<string>('palettePath');
    
    if (!palettePath) {
        vscode.window.showWarningMessage('No palette path configured. Set "doomgfxTools.palettePath" in settings first.');
        return;
    }

    try {
        const fs = require('fs');
        const buffer = await fs.promises.readFile(palettePath);
        const numPalettes = Math.floor(buffer.length / 768);
        const currentIndex = config.get<number>('paletteIndex', 0);
        
        if (numPalettes > 1) {
            const options = [];
            for (let i = 0; i < numPalettes; i++) {
                const isCurrent = i === currentIndex;
                options.push({
                    label: isCurrent ? `$(check) Palette ${i + 1}` : `Palette ${i + 1}`,
                    description: i === 0 ? '(Default/Main palette)' : `(Palette page ${i + 1})`,
                    detail: isCurrent ? 'Currently selected' : undefined,
                    index: i
                });
            }
            
            const selected = await vscode.window.showQuickPick(options, {
                placeHolder: `File contains ${numPalettes} palettes. Select one:`,
                title: 'Select Palette Page'
            });
            
            if (!selected) {
                return;
            }
            
            await config.update('paletteIndex', selected.index, vscode.ConfigurationTarget.Global);
            vscode.window.showInformationMessage(`Palette ${selected.index + 1}/${numPalettes} selected. Close and reopen LMP files to apply.`);
        } else {
            vscode.window.showInformationMessage('Palette file contains only one palette.');
        }
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to read palette: ${error}`);
    }
}

async function convertToPNG(uri?: vscode.Uri, allUris?: vscode.Uri[]): Promise<void> {
    const urisToProcess: vscode.Uri[] = [];

    if (allUris && allUris.length > 0) {
        urisToProcess.push(...allUris.filter(u => u.fsPath.toLowerCase().endsWith('.lmp')));
    } else if (uri) {
        urisToProcess.push(uri);
    } else if (vscode.window.activeTextEditor) {
        urisToProcess.push(vscode.window.activeTextEditor.document.uri);
    }

    if (urisToProcess.length === 0) {
        vscode.window.showErrorMessage('No LMP file selected');
        return;
    }

    let successCount = 0;
    let errorCount = 0;

    for (const fileUri of urisToProcess) {
        if (!fileUri.fsPath.toLowerCase().endsWith('.lmp')) {
            errorCount++;
            continue;
        }

        try {
            const buffer = Buffer.from(await vscode.workspace.fs.readFile(fileUri));
            const lmpImage = parseLMP(buffer);
            const rgbaData = lmpToRGBA(lmpImage, getCurrentPalette());

            const PNG = require('pngjs').PNG;
            const png = new PNG({
                width: lmpImage.header.width,
                height: lmpImage.header.height
            });
            png.data = Buffer.from(rgbaData);
            const pngBuffer = PNG.sync.write(png);

            const pngPath = fileUri.fsPath.replace(/\.lmp$/i, '.png');
            await vscode.workspace.fs.writeFile(
                vscode.Uri.file(pngPath),
                pngBuffer
            );
            successCount++;
        } catch (error) {
            errorCount++;
            if (urisToProcess.length === 1) {
                vscode.window.showErrorMessage(`Failed to convert LMP to PNG: ${error}`);
                return;
            }
        }
    }

    if (urisToProcess.length === 1) {
        vscode.window.showInformationMessage(`Converted to ${path.basename(urisToProcess[0].fsPath.replace(/\.lmp$/i, '.png'))}`);
    } else {
        const message = `Converted ${successCount} file(s) to PNG` + (errorCount > 0 ? `, ${errorCount} failed` : '');
        vscode.window.showInformationMessage(message);
    }
}

async function convertFromPNG(uri?: vscode.Uri, allUris?: vscode.Uri[]): Promise<void> {
    const urisToProcess: vscode.Uri[] = [];

    if (allUris && allUris.length > 0) {
        urisToProcess.push(...allUris.filter(u => u.fsPath.toLowerCase().endsWith('.png')));
    } else if (uri) {
        urisToProcess.push(uri);
    } else if (vscode.window.activeTextEditor) {
        urisToProcess.push(vscode.window.activeTextEditor.document.uri);
    }

    if (urisToProcess.length === 0) {
        const uris = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: true,
            filters: {
                'PNG Images': ['png']
            }
        });

        if (!uris || uris.length === 0) {
            return;
        }

        urisToProcess.push(...uris);
    }

    let successCount = 0;
    let errorCount = 0;
    const colorMode = getColorMode();

    for (const fileUri of urisToProcess) {
        if (!fileUri.fsPath.toLowerCase().endsWith('.png')) {
            errorCount++;
            continue;
        }

        try {
            const pngBuffer = Buffer.from(await vscode.workspace.fs.readFile(fileUri));
            
            const PNG = require('pngjs').PNG;
            const png = PNG.sync.read(pngBuffer);

            const lmpBuffer = rgbaToLMP(
                new Uint8Array(png.data),
                png.width,
                png.height,
                getCurrentPalette(),
                0,
                0,
                colorMode
            );

            const lmpPath = fileUri.fsPath.replace(/\.png$/i, '.lmp');
            await vscode.workspace.fs.writeFile(
                vscode.Uri.file(lmpPath),
                lmpBuffer
            );
            successCount++;
        } catch (error) {
            errorCount++;
            if (urisToProcess.length === 1) {
                vscode.window.showErrorMessage(`Failed to convert PNG to LMP: ${error}`);
                return;
            }
        }
    }

    if (urisToProcess.length === 1) {
        vscode.window.showInformationMessage(`Converted to ${path.basename(urisToProcess[0].fsPath.replace(/\.png$/i, '.lmp'))}`);
    } else {
        const message = `Converted ${successCount} file(s) to LMP` + (errorCount > 0 ? `, ${errorCount} failed` : '');
        vscode.window.showInformationMessage(message);
    }
}
