(function() {
    function init() {
        VSCodeAPI.init();

        const canvas = document.getElementById('gfxCanvas');
        const canvasWrap = document.getElementById('canvasWrap');

        Renderer.init(canvas, canvasWrap);
        Viewport.init();
        Toolbar.init();
        Controls.init();
        Modal.init();

        setupMessageHandlers();
        setupKeyboardShortcuts();
        setupResizeHandler();

        Renderer.startRenderLoop();
        VSCodeAPI.postMessage('ready');
    }

    function setupMessageHandlers() {
        VSCodeAPI.onMessage((msg) => {
            switch (msg.type) {
                case 'init-image':
                    handleInitImage(msg);
                    break;
                case 'update-image':
                    handleUpdateImage(msg);
                    break;
                case 'saved':
                    handleSaved();
                    break;
            }
        });
    }

    function handleInitImage(msg) {
        EditorState.setMultiple({
            imageData: msg.dataUri,
            currentImageData: msg.dataUri,
            width: msg.width,
            height: msg.height,
            offsetX: msg.offsetX || 0,
            offsetY: msg.offsetY || 0,
            fileName: msg.fileName || ''
        });

        if (msg.viewOffset !== undefined) {
            Controls.setViewOffsetChecked(msg.viewOffset);
        }

        if (msg.customPresets) {
            EditorState.set('customPresets', msg.customPresets);
            Controls.updatePresetsDropdown();
        }

        Toolbar.setFileName(msg.fileName);

        const image = new Image();
        image.onload = () => {
            EditorState.set('image', image);
            Renderer.resize();

            if (msg.viewState) {
                EditorState.setMultiple({
                    zoom: msg.viewState.zoom,
                    panX: msg.viewState.panX,
                    panY: msg.viewState.panY
                });
                Controls.updateZoomDisplay();
            } else {
                Viewport.zoomToFit();
            }

            Controls.updateImageSize();
            Controls.updateOffsetInputs();
            Toolbar.setDirty(false);
            Renderer.requestRender();
        };
        image.src = msg.dataUri;
    }

    function handleUpdateImage(msg) {
        EditorState.setMultiple({
            currentImageData: msg.dataUri,
            width: msg.width,
            height: msg.height,
            canUndo: msg.canUndo,
            canRedo: msg.canRedo
        });

        if (msg.offsetX !== undefined) {
            EditorState.set('offsetX', msg.offsetX);
        }
        if (msg.offsetY !== undefined) {
            EditorState.set('offsetY', msg.offsetY);
        }

        if (msg.isDirty !== undefined) {
            EditorState.set('isDirty', msg.isDirty);
            Toolbar.updateFromState();
        }

        const image = new Image();
        image.onload = () => {
            EditorState.set('image', image);
            Renderer.requestRender();
            Controls.updateImageSize();
            Controls.updateOffsetInputs();
        };
        image.src = msg.dataUri;
    }

    function handleSaved() {
        Toolbar.setDirty(false);
    }

    function setupKeyboardShortcuts() {
        window.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
                e.preventDefault();
                e.stopPropagation();
                VSCodeAPI.postMessage('undo');
            } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
                e.preventDefault();
                e.stopPropagation();
                VSCodeAPI.postMessage('redo');
            }
        });
    }

    function setupResizeHandler() {
        window.addEventListener('resize', () => {
            Renderer.resize();
        });
    }

    document.addEventListener('DOMContentLoaded', init);
})();
