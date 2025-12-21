const Toolbar = {
    elements: {},

    init() {
        this.cacheElements();
        this.bindEvents();
    },

    cacheElements() {
        this.elements = {
            saveBtn: document.getElementById('saveBtn'),
            revertBtn: document.getElementById('revertBtn'),
            flipHBtn: document.getElementById('flipHBtn'),
            flipVBtn: document.getElementById('flipVBtn'),
            rotateLeftBtn: document.getElementById('rotateLeftBtn'),
            rotateRightBtn: document.getElementById('rotateRightBtn'),
            fileNameEl: document.getElementById('fileName')
        };
    },

    bindEvents() {
        const { saveBtn, revertBtn, flipHBtn, flipVBtn, rotateLeftBtn, rotateRightBtn } = this.elements;

        saveBtn.addEventListener('click', () => this.handleSave());
        revertBtn.addEventListener('click', () => this.handleRevert());
        flipHBtn.addEventListener('click', () => Transform.flipHorizontal());
        flipVBtn.addEventListener('click', () => Transform.flipVertical());
        rotateLeftBtn.addEventListener('click', () => Transform.rotateLeft());
        rotateRightBtn.addEventListener('click', () => Transform.rotateRight());
    },

    handleSave() {
        const isDirty = EditorState.get('isDirty');
        const currentImageData = EditorState.get('currentImageData');

        if (isDirty && currentImageData) {
            VSCodeAPI.postMessage('save', {
                dataUri: currentImageData,
                width: EditorState.get('width'),
                height: EditorState.get('height')
            });
        }
    },

    handleRevert() {
        if (EditorState.get('isDirty')) {
            VSCodeAPI.postMessage('revert');
        }
    },

    setFileName(name) {
        if (this.elements.fileNameEl) {
            this.elements.fileNameEl.textContent = name;
        }
    },

    setDirty(dirty) {
        EditorState.set('isDirty', dirty);
        this.elements.saveBtn.disabled = !dirty;
        this.elements.revertBtn.disabled = !dirty;

        if (dirty) {
            const currentImageData = EditorState.get('currentImageData');
            if (currentImageData) {
                VSCodeAPI.postMessage('dirty', {
                    dataUri: currentImageData,
                    width: EditorState.get('width'),
                    height: EditorState.get('height')
                });
            }
        }
    },

    markDirtyUI() {
        const isDirty = EditorState.get('isDirty');
        if (!isDirty) {
            EditorState.set('isDirty', true);
            this.elements.saveBtn.disabled = false;
            this.elements.revertBtn.disabled = false;
        }
    },

    updateFromState() {
        const isDirty = EditorState.get('isDirty');
        this.elements.saveBtn.disabled = !isDirty;
        this.elements.revertBtn.disabled = !isDirty;
    }
};
