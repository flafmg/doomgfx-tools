const VSCodeAPI = {
    _api: null,

    init() {
        this._api = acquireVsCodeApi();
    },

    postMessage(type, data = {}) {
        this._api.postMessage({ type, ...data });
    },

    onMessage(callback) {
        window.addEventListener('message', (e) => callback(e.data));
    }
};
