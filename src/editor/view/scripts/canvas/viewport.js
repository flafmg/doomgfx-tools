const Viewport = {
    isPanning: false,
    lastMouseX: 0,
    lastMouseY: 0,
    isDraggingOffset: false,
    dragStartX: 0,
    dragStartY: 0,
    dragStartOffsetX: 0,
    dragStartOffsetY: 0,

    init() {
        this.bindEvents();
    },

    bindEvents() {
        const canvas = Renderer.canvas;

        canvas.addEventListener('wheel', (e) => this.handleWheel(e), { passive: false });
        canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        canvas.addEventListener('mouseup', (e) => this.handleMouseUp(e));
        canvas.addEventListener('mouseleave', () => this.handleMouseLeave());
    },

    handleWheel(e) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        this.setZoom(EditorState.get('zoom') * delta, e.clientX, e.clientY);
    },

    handleMouseDown(e) {
        const canvas = Renderer.canvas;
        
        if (e.button === 1) {
            e.preventDefault();
            this.isPanning = true;
            this.lastMouseX = e.clientX;
            this.lastMouseY = e.clientY;
            canvas.style.cursor = 'grabbing';
        } else if (e.button === 0 && EditorState.get('viewOffset')) {
            this.tryStartOffsetDrag(e);
        }
    },

    tryStartOffsetDrag(e) {
        const canvas = Renderer.canvas;
        const rect = canvas.getBoundingClientRect();
        const mouseCanvasX = e.clientX - rect.left;
        const mouseCanvasY = e.clientY - rect.top;

        const { drawX, drawY, scaledWidth, scaledHeight } = Renderer.getImageDrawPosition();

        if (mouseCanvasX >= drawX && mouseCanvasX <= drawX + scaledWidth &&
            mouseCanvasY >= drawY && mouseCanvasY <= drawY + scaledHeight) {
            e.preventDefault();
            this.isDraggingOffset = true;
            this.dragStartX = e.clientX;
            this.dragStartY = e.clientY;
            this.dragStartOffsetX = EditorState.get('offsetX');
            this.dragStartOffsetY = EditorState.get('offsetY');
            canvas.style.cursor = 'move';
        }
    },

    handleMouseMove(e) {
        if (this.isPanning) {
            this.handlePan(e);
        } else if (this.isDraggingOffset) {
            this.handleOffsetDrag(e);
        }
    },

    handlePan(e) {
        const dx = e.clientX - this.lastMouseX;
        const dy = e.clientY - this.lastMouseY;
        
        EditorState.setMultiple({
            panX: EditorState.get('panX') + dx,
            panY: EditorState.get('panY') + dy
        });
        
        this.lastMouseX = e.clientX;
        this.lastMouseY = e.clientY;
        Renderer.requestRender();
        this.saveViewState();
    },

    handleOffsetDrag(e) {
        const zoom = EditorState.get('zoom');
        const dx = e.clientX - this.dragStartX;
        const dy = e.clientY - this.dragStartY;
        const newOffsetX = Math.round(this.dragStartOffsetX - dx / zoom);
        const newOffsetY = Math.round(this.dragStartOffsetY - dy / zoom);
        
        Controls.setOffset(newOffsetX, newOffsetY, false);
    },

    handleMouseUp(e) {
        const canvas = Renderer.canvas;
        const viewOffset = EditorState.get('viewOffset');

        if (e.button === 1) {
            this.isPanning = false;
            canvas.style.cursor = 'grab';
        } else if (e.button === 0 && this.isDraggingOffset) {
            this.isDraggingOffset = false;
            canvas.style.cursor = viewOffset ? 'crosshair' : 'grab';
            this.finalizeOffsetDrag();
        }
    },

    handleMouseLeave() {
        const canvas = Renderer.canvas;
        
        if (this.isPanning) {
            this.isPanning = false;
            canvas.style.cursor = 'grab';
        }
        if (this.isDraggingOffset) {
            this.isDraggingOffset = false;
            canvas.style.cursor = 'grab';
            this.finalizeOffsetDrag();
        }
    },

    finalizeOffsetDrag() {
        const offsetX = EditorState.get('offsetX');
        const offsetY = EditorState.get('offsetY');

        if (offsetX !== this.dragStartOffsetX || offsetY !== this.dragStartOffsetY) {
            VSCodeAPI.postMessage('offset-changed', { offsetX, offsetY });
            Toolbar.markDirtyUI();
            Controls.resetPresetSelect();
        }
    },

    setZoom(newZoom, focusX, focusY) {
        const canvas = Renderer.canvas;
        const oldZoom = EditorState.get('zoom');
        const zoom = Math.max(0.1, Math.min(32, newZoom));

        if (focusX !== undefined && focusY !== undefined) {
            const rect = canvas.getBoundingClientRect();
            const mouseCanvasX = focusX - rect.left;
            const mouseCanvasY = focusY - rect.top;

            const panX = EditorState.get('panX');
            const panY = EditorState.get('panY');
            
            const beforePanX = mouseCanvasX - canvas.width / 2 - panX;
            const beforePanY = mouseCanvasY - canvas.height / 2 - panY;

            const scaleFactor = zoom / oldZoom;

            EditorState.setMultiple({
                zoom,
                panX: mouseCanvasX - canvas.width / 2 - beforePanX * scaleFactor,
                panY: mouseCanvasY - canvas.height / 2 - beforePanY * scaleFactor
            });
        } else {
            EditorState.set('zoom', zoom);
        }

        Controls.updateZoomDisplay();
        Renderer.requestRender();
        this.saveViewState();
    },

    zoomToFit() {
        const canvas = Renderer.canvas;
        const padding = 20;
        const availWidth = canvas.width - padding * 2;
        const availHeight = canvas.height - padding * 2;
        const viewOffset = EditorState.get('viewOffset');
        const width = EditorState.get('width');
        const height = EditorState.get('height');

        let newZoom;

        if (viewOffset) {
            const offsetX = EditorState.get('offsetX');
            const offsetY = EditorState.get('offsetY');

            const left = -offsetX;
            const right = width - offsetX;
            const top = -offsetY;
            const bottom = height - offsetY;

            const boundsWidth = Math.max(Math.abs(left), Math.abs(right)) * 2;
            const boundsHeight = Math.max(Math.abs(top), Math.abs(bottom)) * 2;

            const scaleX = availWidth / boundsWidth;
            const scaleY = availHeight / boundsHeight;
            newZoom = Math.min(scaleX, scaleY);
        } else {
            const scaleX = availWidth / width;
            const scaleY = availHeight / height;
            newZoom = Math.min(scaleX, scaleY);
        }

        EditorState.setMultiple({ panX: 0, panY: 0 });
        this.setZoom(newZoom);
    },

    recenter() {
        EditorState.setMultiple({ panX: 0, panY: 0 });
        Renderer.requestRender();
    },

    saveViewState() {
        VSCodeAPI.postMessage('view-state-changed', {
            zoom: EditorState.get('zoom'),
            panX: EditorState.get('panX'),
            panY: EditorState.get('panY')
        });
    }
};
