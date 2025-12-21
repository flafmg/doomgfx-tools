const Controls = {
    elements: {},

    init() {
        this.cacheElements();
        this.bindEvents();
    },

    cacheElements() {
        this.elements = {
            zoomLevelEl: document.getElementById('zoomLevel'),
            zoomInBtn: document.getElementById('zoomIn'),
            zoomOutBtn: document.getElementById('zoomOut'),
            fitBtn: document.getElementById('fit'),
            actualBtn: document.getElementById('actual'),
            recenterBtn: document.getElementById('recenter'),
            imageSizeEl: document.getElementById('imageSize'),
            viewOffsetCheckbox: document.getElementById('viewOffset'),
            offsetXInput: document.getElementById('offsetXInput'),
            offsetYInput: document.getElementById('offsetYInput'),
            presetSelect: document.getElementById('presetSelect')
        };
    },

    bindEvents() {
        const {
            zoomInBtn, zoomOutBtn, fitBtn, actualBtn, recenterBtn,
            viewOffsetCheckbox, offsetXInput, offsetYInput, presetSelect
        } = this.elements;

        zoomInBtn.addEventListener('click', () => {
            const canvas = Renderer.canvas;
            Viewport.setZoom(EditorState.get('zoom') * 1.2, canvas.width / 2, canvas.height / 2);
        });

        zoomOutBtn.addEventListener('click', () => {
            const canvas = Renderer.canvas;
            Viewport.setZoom(EditorState.get('zoom') / 1.2, canvas.width / 2, canvas.height / 2);
        });

        fitBtn.addEventListener('click', () => Viewport.zoomToFit());

        actualBtn.addEventListener('click', () => {
            EditorState.setMultiple({ panX: 0, panY: 0 });
            Viewport.setZoom(1);
        });

        recenterBtn.addEventListener('click', () => Viewport.recenter());

        viewOffsetCheckbox.addEventListener('change', (e) => this.handleViewOffsetChange(e));
        offsetXInput.addEventListener('change', (e) => this.handleOffsetXChange(e));
        offsetYInput.addEventListener('change', (e) => this.handleOffsetYChange(e));
        presetSelect.addEventListener('change', (e) => this.handlePresetChange(e));
    },

    handleViewOffsetChange(e) {
        const viewOffset = e.target.checked;
        EditorState.set('viewOffset', viewOffset);
        
        const canvas = Renderer.canvas;
        canvas.style.cursor = viewOffset ? 'crosshair' : 'grab';

        if (viewOffset && EditorState.get('image')) {
            Viewport.zoomToFit();
        }

        Renderer.requestRender();

        VSCodeAPI.postMessage('view-offset-changed', { viewOffset });
    },

    handleOffsetXChange(e) {
        const newValue = parseInt(e.target.value) || 0;
        this.setOffset(newValue, EditorState.get('offsetY'));
        this.resetPresetSelect();
    },

    handleOffsetYChange(e) {
        const newValue = parseInt(e.target.value) || 0;
        this.setOffset(EditorState.get('offsetX'), newValue);
        this.resetPresetSelect();
    },

    handlePresetChange(e) {
        const presetValue = e.target.value;
        if (presetValue) {
            this.applyPreset(presetValue);
        }
    },

    setOffset(newX, newY, saveToHistory = true) {
        const currentX = EditorState.get('offsetX');
        const currentY = EditorState.get('offsetY');

        if (currentX === newX && currentY === newY) return;

        EditorState.setMultiple({ offsetX: newX, offsetY: newY });
        this.updateOffsetInputs();
        Renderer.requestRender();

        if (saveToHistory) {
            VSCodeAPI.postMessage('offset-changed', { offsetX: newX, offsetY: newY });
            Toolbar.markDirtyUI();
        }
    },

    applyPreset(presetName) {
        const width = EditorState.get('width');
        const height = EditorState.get('height');
        if (!width || !height) return;

        let newOffsetX = EditorState.get('offsetX');
        let newOffsetY = EditorState.get('offsetY');

        switch (presetName) {
            case 'monster':
                newOffsetX = Math.floor(width / 2);
                newOffsetY = height - 4;
                break;
            case 'monster-gl':
                newOffsetX = Math.floor(width / 2);
                newOffsetY = height;
                break;
            case 'projectile':
                newOffsetX = Math.floor(width / 2);
                newOffsetY = Math.floor(height / 2);
                break;
            default:
                const customPresets = EditorState.get('customPresets');
                const customPreset = customPresets.find(p => p.name === presetName);
                if (customPreset) {
                    newOffsetX = customPreset.offsetX;
                    newOffsetY = customPreset.offsetY;
                }
                break;
        }

        this.setOffset(newOffsetX, newOffsetY, true);
    },

    updateZoomDisplay() {
        const zoom = EditorState.get('zoom');
        this.elements.zoomLevelEl.textContent = Math.round(zoom * 100) + '%';
    },

    updateImageSize() {
        const width = EditorState.get('width');
        const height = EditorState.get('height');
        if (this.elements.imageSizeEl) {
            this.elements.imageSizeEl.textContent = `${width}×${height}`;
        }
    },

    updateOffsetInputs() {
        const offsetX = EditorState.get('offsetX');
        const offsetY = EditorState.get('offsetY');
        
        if (this.elements.offsetXInput) {
            this.elements.offsetXInput.value = offsetX;
        }
        if (this.elements.offsetYInput) {
            this.elements.offsetYInput.value = offsetY;
        }
    },

    updatePresetsDropdown() {
        const presetSelect = this.elements.presetSelect;
        const customPresets = EditorState.get('customPresets');

        const options = Array.from(presetSelect.options);
        options.forEach(opt => {
            if (opt.dataset.custom === 'true') {
                opt.remove();
            }
        });

        customPresets.forEach(preset => {
            const option = document.createElement('option');
            option.value = preset.name;
            option.textContent = preset.name;
            option.dataset.custom = 'true';
            presetSelect.appendChild(option);
        });
    },

    resetPresetSelect() {
        this.elements.presetSelect.value = '';
    },

    setViewOffsetChecked(checked) {
        this.elements.viewOffsetCheckbox.checked = checked;
        EditorState.set('viewOffset', checked);
        
        const canvas = Renderer.canvas;
        canvas.style.cursor = checked ? 'crosshair' : 'grab';
    }
};
