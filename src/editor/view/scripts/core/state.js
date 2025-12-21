const EditorState = {
    image: null,
    imageData: null,
    currentImageData: null,
    width: 0,
    height: 0,

    zoom: 1,
    panX: 0,
    panY: 0,

    offsetX: 0,
    offsetY: 0,
    viewOffset: false,

    isDirty: false,
    canUndo: false,
    canRedo: false,

    customPresets: [],
    fileName: '',

    _listeners: [],

    get(key) {
        return this[key];
    },

    set(key, value) {
        const oldValue = this[key];
        if (oldValue === value) return;
        
        this[key] = value;
        this._notifyListeners(key, value, oldValue);
    },

    setMultiple(updates) {
        const changes = [];
        for (const [key, value] of Object.entries(updates)) {
            const oldValue = this[key];
            if (oldValue !== value) {
                this[key] = value;
                changes.push({ key, value, oldValue });
            }
        }
        changes.forEach(change => {
            this._notifyListeners(change.key, change.value, change.oldValue);
        });
    },

    subscribe(callback) {
        this._listeners.push(callback);
        return () => {
            const index = this._listeners.indexOf(callback);
            if (index > -1) {
                this._listeners.splice(index, 1);
            }
        };
    },

    _notifyListeners(key, value, oldValue) {
        this._listeners.forEach(callback => {
            callback(key, value, oldValue);
        });
    }
};
