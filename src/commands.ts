import * as vscode from 'vscode';
import * as path from 'path';
import { parseLMP, lmpToRGBA, rgbaToLMP } from './lmpParser';
import { getCurrentPalette, loadPaletteFromFile, setCustomPalette } from './palette';

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

async function convertToPNG(uri?: vscode.Uri): Promise<void> {
    if (!uri && vscode.window.activeTextEditor) {
        uri = vscode.window.activeTextEditor.document.uri;
    }

    if (!uri) {
        vscode.window.showErrorMessage('No LMP file selected');
        return;
    }

    if (!uri.fsPath.toLowerCase().endsWith('.lmp')) {
        vscode.window.showErrorMessage('Selected file is not a .lmp file');
        return;
    }

    try {
        const buffer = Buffer.from(await vscode.workspace.fs.readFile(uri));
        const lmpImage = parseLMP(buffer);
        const rgbaData = lmpToRGBA(lmpImage, getCurrentPalette());

        const PNG = require('pngjs').PNG;
        const png = new PNG({
            width: lmpImage.header.width,
            height: lmpImage.header.height
        });
        png.data = Buffer.from(rgbaData);
        const pngBuffer = PNG.sync.write(png);

        const pngPath = uri.fsPath.replace(/\.lmp$/i, '.png');
        await vscode.workspace.fs.writeFile(
            vscode.Uri.file(pngPath),
            pngBuffer
        );

        vscode.window.showInformationMessage(`Converted to ${path.basename(pngPath)}`);
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to convert LMP to PNG: ${error}`);
    }
}

async function convertFromPNG(uri?: vscode.Uri): Promise<void> {
    if (!uri && vscode.window.activeTextEditor) {
        uri = vscode.window.activeTextEditor.document.uri;
    }

    if (!uri) {
        const uris = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
            filters: {
                'PNG Images': ['png']
            }
        });

        if (!uris || uris.length === 0) {
            return;
        }

        uri = uris[0];
    }

    if (!uri.fsPath.toLowerCase().endsWith('.png')) {
        vscode.window.showErrorMessage('Selected file is not a .png file');
        return;
    }

    try {
        const pngBuffer = Buffer.from(await vscode.workspace.fs.readFile(uri));
        
        const PNG = require('pngjs').PNG;
        const png = PNG.sync.read(pngBuffer);

        const lmpBuffer = rgbaToLMP(
            new Uint8Array(png.data),
            png.width,
            png.height,
            getCurrentPalette()
        );

        const lmpPath = uri.fsPath.replace(/\.png$/i, '.lmp');
        await vscode.workspace.fs.writeFile(
            vscode.Uri.file(lmpPath),
            lmpBuffer
        );

        vscode.window.showInformationMessage(`Converted to ${path.basename(lmpPath)}`);
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to convert PNG to LMP: ${error}`);
    }
}
