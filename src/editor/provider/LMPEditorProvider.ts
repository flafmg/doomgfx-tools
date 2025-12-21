import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { LMPDocument } from '../document/LMPDocument';
import { rgbaToBase64PNG, dataUriToRGBA } from '../utils/imageUtils';
import { parseLMP, lmpToRGBA, rgbaToLMP, ColorApproximationMode } from '../../parser/lmpParser';
import { getCurrentPalette } from '../../parser/palette';

function getColorMode(): ColorApproximationMode {
    const config = vscode.workspace.getConfiguration('doomgfxTools');
    const mode = config.get<string>('colorApproximationMode', 'nearest');
    return mode as ColorApproximationMode;
}

export class LMPEditorProvider implements vscode.CustomEditorProvider<LMPDocument> {
    private static readonly viewType = 'doomgfxTools.lmpEditor';
    private static readonly VIEW_OFFSET_KEY = 'doomgfxTools.viewOffsetEnabled';
    private static readonly VIEW_STATE_KEY = 'doomgfxTools.viewState';

    private readonly _onDidChangeCustomDocument = new vscode.EventEmitter<vscode.CustomDocumentEditEvent<LMPDocument>>();
    public readonly onDidChangeCustomDocument = this._onDidChangeCustomDocument.event;

    private readonly webviewPanels = new Map<string, vscode.WebviewPanel>();

    constructor(private readonly context: vscode.ExtensionContext) {}

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

    async openCustomDocument(
        uri: vscode.Uri,
        openContext: vscode.CustomDocumentOpenContext,
        token: vscode.CancellationToken
    ): Promise<LMPDocument> {
        const buffer = Buffer.from(await vscode.workspace.fs.readFile(uri));

        try {
            const lmpImage = parseLMP(buffer);
            const rgbaData = lmpToRGBA(lmpImage, getCurrentPalette());
            const dataUri = rgbaToBase64PNG(rgbaData, lmpImage.header.width, lmpImage.header.height);

            return new LMPDocument(
                uri,
                { dataUri, width: lmpImage.header.width, height: lmpImage.header.height },
                lmpImage.header.leftOffset,
                lmpImage.header.topOffset
            );
        } catch (error) {
            throw new Error(`Failed to parse LMP file: ${error}`);
        }
    }

    async saveCustomDocument(document: LMPDocument, cancellation: vscode.CancellationToken): Promise<void> {
        const currentData = document.currentEdit;
        const { data: rgbaData } = await dataUriToRGBA(currentData.dataUri);

        const colorMode = getColorMode();
        const lmpBuffer = rgbaToLMP(
            rgbaData,
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
            panel.webview.postMessage({ type: 'saved' });
        }
    }

    async saveCustomDocumentAs(
        document: LMPDocument,
        destination: vscode.Uri,
        cancellation: vscode.CancellationToken
    ): Promise<void> {
        const currentData = document.currentEdit;
        const { data: rgbaData } = await dataUriToRGBA(currentData.dataUri);

        const colorMode = getColorMode();
        const lmpBuffer = rgbaToLMP(
            rgbaData,
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
        this.fireDocumentChange(document);
    }

    async backupCustomDocument(
        document: LMPDocument,
        context: vscode.CustomDocumentBackupContext,
        cancellation: vscode.CancellationToken
    ): Promise<vscode.CustomDocumentBackup> {
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
        this.setupWebviewOptions(webviewPanel);
        this.registerWebviewPanel(document, webviewPanel);

        webviewPanel.webview.html = await this.getHtmlForWebview(webviewPanel.webview);
        this.sendInitialData(document, webviewPanel);
        this.setupMessageHandler(document, webviewPanel);
    }

    private setupWebviewOptions(webviewPanel: vscode.WebviewPanel): void {
        webviewPanel.webview.options = {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'src/editor/view')]
        };
    }

    private registerWebviewPanel(document: LMPDocument, webviewPanel: vscode.WebviewPanel): void {
        this.webviewPanels.set(document.uri.toString(), webviewPanel);
        webviewPanel.onDidDispose(() => {
            this.webviewPanels.delete(document.uri.toString());
        });
    }

    private sendInitialData(document: LMPDocument, webviewPanel: vscode.WebviewPanel): void {
        const fileName = path.basename(document.uri.fsPath);
        const config = vscode.workspace.getConfiguration('lmpreader');
        const customPresets = config.get<Array<{ name: string; offsetX: number; offsetY: number }>>('customPresets', []);

        webviewPanel.webview.postMessage({
            type: 'init-image',
            dataUri: document.originalData.dataUri,
            width: document.originalData.width,
            height: document.originalData.height,
            offsetX: document.currentEdit.offsetX,
            offsetY: document.currentEdit.offsetY,
            fileName,
            customPresets,
            viewOffset: this.getViewOffsetState(),
            viewState: this.getViewState()
        });
    }

    private setupMessageHandler(document: LMPDocument, webviewPanel: vscode.WebviewPanel): void {
        webviewPanel.webview.onDidReceiveMessage(async (message) => {
            switch (message.type) {
                case 'dirty':
                    this.handleDirtyMessage(document, message);
                    break;
                case 'save':
                    await vscode.commands.executeCommand('workbench.action.files.save');
                    break;
                case 'revert':
                    this.handleRevertMessage(document, webviewPanel);
                    break;
                case 'undo':
                    this.handleUndoMessage(document, webviewPanel);
                    break;
                case 'redo':
                    this.handleRedoMessage(document, webviewPanel);
                    break;
                case 'offset-changed':
                    this.handleOffsetChanged(document, message);
                    break;
                case 'view-offset-changed':
                    this.handleViewOffsetChanged(document, message);
                    break;
                case 'view-state-changed':
                    this.setViewState(message.zoom, message.panX, message.panY);
                    break;
                case 'save-custom-presets':
                    await this.handleSaveCustomPresets(message);
                    break;
            }
        });
    }

    private handleDirtyMessage(document: LMPDocument, message: any): void {
        document.makeEdit({
            dataUri: message.dataUri,
            width: message.width,
            height: message.height
        });
        this.fireDocumentChange(document);
    }

    private handleRevertMessage(document: LMPDocument, webviewPanel: vscode.WebviewPanel): void {
        document.revert();
        const fileName = path.basename(document.uri.fsPath);

        webviewPanel.webview.postMessage({
            type: 'init-image',
            dataUri: document.savedState.dataUri,
            width: document.savedState.width,
            height: document.savedState.height,
            offsetX: document.savedState.offsetX,
            offsetY: document.savedState.offsetY,
            fileName
        });

        this.fireDocumentChange(document);
    }

    private handleUndoMessage(document: LMPDocument, webviewPanel: vscode.WebviewPanel): void {
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
            this.fireDocumentChange(document);
        }
    }

    private handleRedoMessage(document: LMPDocument, webviewPanel: vscode.WebviewPanel): void {
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
            this.fireDocumentChange(document);
        }
    }

    private handleOffsetChanged(document: LMPDocument, message: any): void {
        document.makeEdit({
            offsetX: message.offsetX,
            offsetY: message.offsetY
        });
    }

    private handleViewOffsetChanged(document: LMPDocument, message: any): void {
        this.setViewOffsetState(message.viewOffset);
        this.fireDocumentChange(document);
    }

    private async handleSaveCustomPresets(message: any): Promise<void> {
        const config = vscode.workspace.getConfiguration('lmpreader');
        await config.update('customPresets', message.presets, vscode.ConfigurationTarget.Global);
    }

    private fireDocumentChange(document: LMPDocument): void {
        this._onDidChangeCustomDocument.fire({
            document,
            undo: () => {},
            redo: () => {}
        });
    }

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

    private getViewState(): { zoom: number; panX: number; panY: number } | undefined {
        const config = vscode.workspace.getConfiguration('doomgfxTools');
        const persistViewState = config.get<boolean>('persistViewState', false);

        if (!persistViewState) {
            return undefined;
        }

        return this.context.globalState.get<{ zoom: number; panX: number; panY: number }>(
            LMPEditorProvider.VIEW_STATE_KEY
        );
    }

    private setViewState(zoom: number, panX: number, panY: number): void {
        this.context.globalState.update(LMPEditorProvider.VIEW_STATE_KEY, { zoom, panX, panY });
    }

    private async getHtmlForWebview(webview: vscode.Webview): Promise<string> {
        const viewPath = path.join(this.context.extensionPath, 'src/editor/view');

        let html = fs.readFileSync(path.join(viewPath, 'index.html'), 'utf8');

        const cssFiles = ['base', 'toolbar', 'canvas', 'controls', 'modal'];
        let allCss = '';
        for (const file of cssFiles) {
            const cssPath = path.join(viewPath, 'styles', `${file}.css`);
            if (fs.existsSync(cssPath)) {
                allCss += fs.readFileSync(cssPath, 'utf8') + '\n';
            }
        }

        const jsFiles = [
            'core/state',
            'core/events',
            'core/vscodeApi',
            'canvas/renderer',
            'canvas/viewport',
            'canvas/transform',
            'ui/toolbar',
            'ui/controls',
            'ui/modal',
            'main'
        ];
        let allJs = '';
        for (const file of jsFiles) {
            const jsPath = path.join(viewPath, 'scripts', `${file}.js`);
            if (fs.existsSync(jsPath)) {
                allJs += fs.readFileSync(jsPath, 'utf8') + '\n';
            }
        }

        html = html.replace('/* INJECTED_STYLES */', allCss);
        html = html.replace('/* INJECTED_SCRIPTS */', allJs);

        return html;
    }
}
