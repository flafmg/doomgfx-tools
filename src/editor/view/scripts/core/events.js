const EventBus = {
    _listeners: {},

    on(event, callback) {
        if (!this._listeners[event]) {
            this._listeners[event] = [];
        }
        this._listeners[event].push(callback);
        
        return () => this.off(event, callback);
    },

    off(event, callback) {
        if (!this._listeners[event]) return;
        
        const index = this._listeners[event].indexOf(callback);
        if (index > -1) {
            this._listeners[event].splice(index, 1);
        }
    },

    emit(event, data) {
        if (!this._listeners[event]) return;
        
        this._listeners[event].forEach(callback => {
            callback(data);
        });
    },

    once(event, callback) {
        const wrapper = (data) => {
            callback(data);
            this.off(event, wrapper);
        };
        this.on(event, wrapper);
    }
};
