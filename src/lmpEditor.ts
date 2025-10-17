import * as vscode from 'vscode';
import * as fs from 'fs';
import { parseLMP, lmpToRGBA } from './lmpParser';
import { getCurrentPalette } from './palette';

class LMPDocument implements vscode.CustomDocument {
    constructor(
        public readonly uri: vscode.Uri,
        public readonly imageData: Uint8Array,
        public readonly width: number,
        public readonly height: number
    ) {}

    dispose(): void {}
}

export class LMPEditorProvider implements vscode.CustomReadonlyEditorProvider<LMPDocument> {
    private static readonly viewType = 'lmpReader.lmpEditor';

    public static register(context: vscode.ExtensionContext): vscode.Disposable {
        const provider = new LMPEditorProvider(context);
        return vscode.window.registerCustomEditorProvider(
            LMPEditorProvider.viewType,
            provider,
            {
                webviewOptions: {
                    retainContextWhenHidden: true
                },
                supportsMultipleEditorsPerDocument: true
            }
        );
    }

    constructor(private readonly context: vscode.ExtensionContext) {}

    async openCustomDocument(
        uri: vscode.Uri,
        openContext: vscode.CustomDocumentOpenContext,
        token: vscode.CancellationToken
    ): Promise<LMPDocument> {
        const buffer = Buffer.from(await vscode.workspace.fs.readFile(uri));
        
        try {
            const lmpImage = parseLMP(buffer);
            const rgbaData = lmpToRGBA(lmpImage, getCurrentPalette());
            
            return new LMPDocument(
                uri,
                rgbaData,
                lmpImage.header.width,
                lmpImage.header.height
            );
        } catch (error) {
            throw new Error(`Failed to parse LMP file: ${error}`);
        }
    }

    async resolveCustomEditor(
        document: LMPDocument,
        webviewPanel: vscode.WebviewPanel,
        token: vscode.CancellationToken
    ): Promise<void> {
        webviewPanel.webview.options = {
            enableScripts: true
        };

        webviewPanel.webview.html = this.getHtmlForWebview(
            webviewPanel.webview,
            document
        );
    }

    private getHtmlForWebview(webview: vscode.Webview, document: LMPDocument): string {
        const imageDataBase64 = this.rgbaToBase64PNG(
            document.imageData,
            document.width,
            document.height
        );

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body {
            margin: 0;
            padding: 20px;
            background: #1e1e1e;
            color: #d4d4d4;
            font-family: system-ui, -apple-system, sans-serif;
            display: flex;
            flex-direction: column;
            align-items: center;
        }
        .container {
            max-width: 100%;
            text-align: center;
        }
        .info {
            margin-bottom: 20px;
            font-size: 14px;
        }
        .image-container {
            background: repeating-conic-gradient(#808080 0% 25%, #606060 0% 50%) 50% / 20px 20px;
            display: inline-block;
            padding: 10px;
            border: 2px solid #3c3c3c;
        }
        img {
            image-rendering: pixelated;
            image-rendering: crisp-edges;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="info">
            <strong>${document.uri.fsPath.split('/').pop()}</strong><br>
            Dimensions: ${document.width} × ${document.height}
        </div>
        <div class="image-container">
            <img src="${imageDataBase64}" width="${document.width * 2}" height="${document.height * 2}" />
        </div>
    </div>
</body>
</html>`;
    }

    private rgbaToBase64PNG(rgba: Uint8Array, width: number, height: number): string {
        const canvas = { width, height, data: rgba };
        const pngBuffer = this.createPNG(canvas);
        return `data:image/png;base64,${pngBuffer.toString('base64')}`;
    }

    private createPNG(canvas: { width: number; height: number; data: Uint8Array }): Buffer {
        const PNG = require('pngjs').PNG;
        const png = new PNG({ width: canvas.width, height: canvas.height });
        png.data = Buffer.from(canvas.data);
        return PNG.sync.write(png);
    }
}
