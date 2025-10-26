import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { parseLMP, lmpToRGBA, rgbaToLMP, ColorApproximationMode } from '../parser/lmpParser';
import { getCurrentPalette } from '../parser/palette';

function getColorMode(): ColorApproximationMode {
    const config = vscode.workspace.getConfiguration('doomgfxTools');
    const mode = config.get<string>('colorApproximationMode', 'nearest');
    return mode as ColorApproximationMode;
}

interface DocumentState {
    dataUri: string;
    width: number;
    height: number;
    offsetX: number;
    offsetY: number;
}

class LMPDocument implements vscode.CustomDocument {
    private _undoStack: Array<DocumentState> = [];
    private _redoStack: Array<DocumentState> = [];
    private _currentState: DocumentState;
    private _savedState: DocumentState;
    private readonly MAX_HISTORY = 100;

    constructor(
        public readonly uri: vscode.Uri,
        public readonly originalData: {dataUri: string, width: number, height: number},
        offsetX: number,
        offsetY: number
    ) {
        
        this._currentState = {
            ...originalData,
            offsetX,
            offsetY
        };
        this._savedState = {...this._currentState};
    }

    private readonly _onDidDispose = new vscode.EventEmitter<void>();
    public readonly onDidDispose = this._onDidDispose.event;

    dispose(): void {
        this._onDidDispose.fire();
        this._onDidDispose.dispose();
    }

    makeEdit(edit: Partial<DocumentState>) {
        this._undoStack.push({...this._currentState});
        if (this._undoStack.length > this.MAX_HISTORY) {
            this._undoStack.shift();
        }
        this._currentState = {...this._currentState, ...edit};
        this._redoStack = [];
    }

    undo(): DocumentState | null {
        if (this._undoStack.length === 0) {
            return null;
        }
        
        this._redoStack.push({...this._currentState});
        if (this._redoStack.length > this.MAX_HISTORY) {
            this._redoStack.shift();
        }
        
        this._currentState = this._undoStack.pop()!;
        return {...this._currentState};
    }

    redo(): DocumentState | null {
        if (this._redoStack.length === 0) {
            return null;
        }
        
        this._undoStack.push({...this._currentState});
        if (this._undoStack.length > this.MAX_HISTORY) {
            this._undoStack.shift();
        }
        
        this._currentState = this._redoStack.pop()!;
        return {...this._currentState};
    }

    get currentEdit() {
        return this._currentState;
    }

    get isDirty(): boolean {
        return this._currentState.dataUri !== this._savedState.dataUri ||
               this._currentState.width !== this._savedState.width ||
               this._currentState.height !== this._savedState.height ||
               this._currentState.offsetX !== this._savedState.offsetX ||
               this._currentState.offsetY !== this._savedState.offsetY;
    }

    get canUndo(): boolean {
        return this._undoStack.length > 0;
    }

    get canRedo(): boolean {
        return this._redoStack.length > 0;
    }

    save() {
        this._savedState = {...this._currentState};
    }

    revert() {
        this._undoStack = [];
        this._redoStack = [];
        this._currentState = {...this._savedState};
    }

    get savedState() {
        return this._savedState;
    }
}

export class LMPEditorProvider implements vscode.CustomEditorProvider<LMPDocument> {
    private static readonly viewType = 'doomgfxTools.lmpEditor';
    private static readonly VIEW_OFFSET_KEY = 'doomgfxTools.viewOffsetEnabled';
    private static readonly VIEW_STATE_KEY = 'doomgfxTools.viewState'; //this right now?

    private readonly _onDidChangeCustomDocument = new vscode.EventEmitter<vscode.CustomDocumentEditEvent<LMPDocument>>();
    public readonly onDidChangeCustomDocument = this._onDidChangeCustomDocument.event;

    private readonly webviewPanels = new Map<string, vscode.WebviewPanel>();

    public static register(context: vscode.ExtensionContext): vscode.Disposable {
        const provider = new LMPEditorProvider(context);
        return vscode.window.registerCustomEditorProvider(
            LMPEditorProvider.viewType,
            provider,
            {
                webviewOptions: {
                    retainContextWhenHidden: true
                },
                supportsMultipleEditorsPerDocument: false
            }
        );
    }

    constructor(private readonly context: vscode.ExtensionContext) {}

    private getViewOffsetState(): boolean {
        const config = vscode.workspace.getConfiguration('doomgfxTools');
        const persistOffsetToggle = config.get<boolean>('persistOffsetToggle', true);
        
        if (!persistOffsetToggle) {
            return false;
        }
        
        return this.context.globalState.get<boolean>(LMPEditorProvider.VIEW_OFFSET_KEY, false);
    }

    private setViewOffsetState(enabled: boolean): void {
        this.context.globalState.update(LMPEditorProvider.VIEW_OFFSET_KEY, enabled);
    }

    private getViewState(): {zoom: number, panX: number, panY: number} | undefined {
        const config = vscode.workspace.getConfiguration('doomgfxTools');
        const persistViewState = config.get<boolean>('persistViewState', false);
        
        if (!persistViewState) {
            return undefined;
        }
        
        return this.context.globalState.get<{zoom: number, panX: number, panY: number}>(LMPEditorProvider.VIEW_STATE_KEY);
    }

    private setViewState(zoom: number, panX: number, panY: number): void {
        this.context.globalState.update(LMPEditorProvider.VIEW_STATE_KEY, {zoom, panX, panY});
    }

    async openCustomDocument(
        uri: vscode.Uri,
        openContext: vscode.CustomDocumentOpenContext,
        token: vscode.CancellationToken
    ): Promise<LMPDocument> {
        const buffer = Buffer.from(await vscode.workspace.fs.readFile(uri));
        
        try {
            const lmpImage = parseLMP(buffer);
            const rgbaData = lmpToRGBA(lmpImage, getCurrentPalette());
            
            const dataUri = this.rgbaToBase64PNG(rgbaData, lmpImage.header.width, lmpImage.header.height);
            
            return new LMPDocument(
                uri,
                {dataUri, width: lmpImage.header.width, height: lmpImage.header.height},
                lmpImage.header.leftOffset,
                lmpImage.header.topOffset
            );
        } catch (error) {
            throw new Error(`Failed to parse LMP file: ${error}`);
        }
    }

    async saveCustomDocument(document: LMPDocument, cancellation: vscode.CancellationToken): Promise<void> {
        const currentData = document.currentEdit;
        
        const response = await fetch(currentData.dataUri);
        const blob = await response.blob();
        const arrayBuffer = await blob.arrayBuffer();
        const pngBuffer = Buffer.from(arrayBuffer);
        
        const PNG = require('pngjs').PNG;
        const png = PNG.sync.read(pngBuffer);
        
        const colorMode = getColorMode();
        const lmpBuffer = rgbaToLMP(
            new Uint8Array(png.data),
            currentData.width,
            currentData.height,
            getCurrentPalette(),
            currentData.offsetX,
            currentData.offsetY,
            colorMode
        );
        
        await vscode.workspace.fs.writeFile(document.uri, lmpBuffer);
        
        document.save();
        
        const panel = this.webviewPanels.get(document.uri.toString());
        if (panel) {
            panel.webview.postMessage({
                type: 'saved'
            });
        }
    }

    async saveCustomDocumentAs(document: LMPDocument, destination: vscode.Uri, cancellation: vscode.CancellationToken): Promise<void> {
        const currentData = document.currentEdit;
        
        const response = await fetch(currentData.dataUri);
        const blob = await response.blob();
        const arrayBuffer = await blob.arrayBuffer();
        const pngBuffer = Buffer.from(arrayBuffer);
        
        const PNG = require('pngjs').PNG;
        const png = PNG.sync.read(pngBuffer);
        
        const colorMode = getColorMode();
        const lmpBuffer = rgbaToLMP(
            new Uint8Array(png.data),
            currentData.width,
            currentData.height,
            getCurrentPalette(),
            currentData.offsetX,
            currentData.offsetY,
            colorMode
        );
        
        await vscode.workspace.fs.writeFile(destination, lmpBuffer);
    }

    async revertCustomDocument(document: LMPDocument, cancellation: vscode.CancellationToken): Promise<void> {
        document.revert();
        this._onDidChangeCustomDocument.fire({
            document,
            undo: () => {},
            redo: () => {}
        });
    }

    async backupCustomDocument(document: LMPDocument, context: vscode.CustomDocumentBackupContext, cancellation: vscode.CancellationToken): Promise<vscode.CustomDocumentBackup> {
        return {
            id: context.destination.toString(),
            delete: async () => {
                try {
                    await vscode.workspace.fs.delete(context.destination);
                } catch {}
            }
        };
    }

    async resolveCustomEditor(
        document: LMPDocument,
        webviewPanel: vscode.WebviewPanel,
        token: vscode.CancellationToken
    ): Promise<void> {
        webviewPanel.webview.options = {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'src/editor/view')]
        };

        this.webviewPanels.set(document.uri.toString(), webviewPanel);
        
        webviewPanel.onDidDispose(() => {
            this.webviewPanels.delete(document.uri.toString());
        });

        const html = await this.getHtmlForWebview(webviewPanel.webview, document);
        webviewPanel.webview.html = html;

        const fileName = path.basename(document.uri.fsPath);

        const config = vscode.workspace.getConfiguration('lmpreader');
        const customPresets = config.get<Array<{name: string, offsetX: number, offsetY: number}>>('customPresets', []);
        const viewOffsetEnabled = this.getViewOffsetState();
        const viewState = this.getViewState();
        
        webviewPanel.webview.postMessage({
            type: 'init-image',
            dataUri: document.originalData.dataUri,
            width: document.originalData.width,
            height: document.originalData.height,
            offsetX: document.currentEdit.offsetX,
            offsetY: document.currentEdit.offsetY,
            fileName: fileName,
            customPresets: customPresets,
            viewOffset: viewOffsetEnabled,
            viewState: viewState
        });

        webviewPanel.webview.onDidReceiveMessage(async message => {
            switch (message.type) {
                case 'dirty':
                    document.makeEdit({
                        dataUri: message.dataUri,
                        width: message.width,
                        height: message.height
                    });
                    this._onDidChangeCustomDocument.fire({
                        document,
                        undo: () => {},
                        redo: () => {}
                    });
                    break;
                    
                case 'save':
                    await vscode.commands.executeCommand('workbench.action.files.save');
                    break;
                    
                case 'revert':
                    document.revert();
                    const fileName = path.basename(document.uri.fsPath);
                    webviewPanel.webview.postMessage({
                        type: 'init-image',
                        dataUri: document.savedState.dataUri,
                        width: document.savedState.width,
                        height: document.savedState.height,
                        offsetX: document.savedState.offsetX,
                        offsetY: document.savedState.offsetY,
                        fileName: fileName
                    });
                    this._onDidChangeCustomDocument.fire({
                        document,
                        undo: () => {},
                        redo: () => {}
                    });
                    break;
                    
                case 'undo':
                    const undoState = document.undo();
                    if (undoState) {
                        webviewPanel.webview.postMessage({
                            type: 'update-image',
                            dataUri: undoState.dataUri,
                            width: undoState.width,
                            height: undoState.height,
                            offsetX: undoState.offsetX,
                            offsetY: undoState.offsetY,
                            canUndo: document.canUndo,
                            canRedo: document.canRedo,
                            isDirty: document.isDirty
                        });
                        this._onDidChangeCustomDocument.fire({
                            document,
                            undo: () => {},
                            redo: () => {}
                        });
                    }
                    break;
                    
                case 'redo':
                    const redoState = document.redo();
                    if (redoState) {
                        webviewPanel.webview.postMessage({
                            type: 'update-image',
                            dataUri: redoState.dataUri,
                            width: redoState.width,
                            height: redoState.height,
                            offsetX: redoState.offsetX,
                            offsetY: redoState.offsetY,
                            canUndo: document.canUndo,
                            canRedo: document.canRedo,
                            isDirty: document.isDirty
                        });
                        this._onDidChangeCustomDocument.fire({
                            document,
                            undo: () => {},
                            redo: () => {}
                        });
                    }
                    break;
                    
                case 'offset-changed':
                    document.makeEdit({
                        offsetX: message.offsetX,
                        offsetY: message.offsetY
                    });
                    break;
                    
                case 'view-offset-changed':
                    this.setViewOffsetState(message.viewOffset);
                    this._onDidChangeCustomDocument.fire({
                        document,
                        undo: () => {},
                        redo: () => {}
                    });
                    break;
                    
                case 'view-state-changed':
                    this.setViewState(message.zoom, message.panX, message.panY);
                    break;
                    
                case 'save-custom-presets':
                    const config = vscode.workspace.getConfiguration('lmpreader');
                    await config.update('customPresets', message.presets, vscode.ConfigurationTarget.Global);
                    break;
            }
        });
    }

    private async getHtmlForWebview(webview: vscode.Webview, document: LMPDocument): Promise<string> {
        const mediaPath = path.join(this.context.extensionPath, 'src/editor/view', 'viewer.html');
        let html = fs.readFileSync(mediaPath, 'utf8');

        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'src/editor/view', 'viewer.js'));
        html = html.replace(/<script\s+src=\"viewer.js\"\s*>\s*<\/script>/i, `<script src=\"${scriptUri}\"></script>`);

        return html;
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
