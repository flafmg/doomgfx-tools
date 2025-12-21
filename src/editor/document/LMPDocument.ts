import * as vscode from 'vscode';

export interface DocumentState {
    dataUri: string;
    width: number;
    height: number;
    offsetX: number;
    offsetY: number;
}

export class LMPDocument implements vscode.CustomDocument {
    private _undoStack: Array<DocumentState> = [];
    private _redoStack: Array<DocumentState> = [];
    private _currentState: DocumentState;
    private _savedState: DocumentState;
    private readonly MAX_HISTORY = 100;

    private readonly _onDidDispose = new vscode.EventEmitter<void>();
    public readonly onDidDispose = this._onDidDispose.event;

    constructor(
        public readonly uri: vscode.Uri,
        public readonly originalData: { dataUri: string; width: number; height: number },
        offsetX: number,
        offsetY: number
    ) {
        this._currentState = {
            ...originalData,
            offsetX,
            offsetY
        };
        this._savedState = { ...this._currentState };
    }

    dispose(): void {
        this._onDidDispose.fire();
        this._onDidDispose.dispose();
    }

    makeEdit(edit: Partial<DocumentState>): void {
        this._undoStack.push({ ...this._currentState });
        if (this._undoStack.length > this.MAX_HISTORY) {
            this._undoStack.shift();
        }
        this._currentState = { ...this._currentState, ...edit };
        this._redoStack = [];
    }

    undo(): DocumentState | null {
        if (this._undoStack.length === 0) {
            return null;
        }

        this._redoStack.push({ ...this._currentState });
        if (this._redoStack.length > this.MAX_HISTORY) {
            this._redoStack.shift();
        }

        this._currentState = this._undoStack.pop()!;
        return { ...this._currentState };
    }

    redo(): DocumentState | null {
        if (this._redoStack.length === 0) {
            return null;
        }

        this._undoStack.push({ ...this._currentState });
        if (this._undoStack.length > this.MAX_HISTORY) {
            this._undoStack.shift();
        }

        this._currentState = this._redoStack.pop()!;
        return { ...this._currentState };
    }

    save(): void {
        this._savedState = { ...this._currentState };
    }

    revert(): void {
        this._undoStack = [];
        this._redoStack = [];
        this._currentState = { ...this._savedState };
    }

    get currentEdit(): DocumentState {
        return this._currentState;
    }

    get savedState(): DocumentState {
        return this._savedState;
    }

    get isDirty(): boolean {
        return (
            this._currentState.dataUri !== this._savedState.dataUri ||
            this._currentState.width !== this._savedState.width ||
            this._currentState.height !== this._savedState.height ||
            this._currentState.offsetX !== this._savedState.offsetX ||
            this._currentState.offsetY !== this._savedState.offsetY
        );
    }

    get canUndo(): boolean {
        return this._undoStack.length > 0;
    }

    get canRedo(): boolean {
        return this._redoStack.length > 0;
    }
}
