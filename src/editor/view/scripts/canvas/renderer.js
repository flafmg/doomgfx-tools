const Renderer = {
    canvas: null,
    ctx: null,
    canvasWrap: null,
    needsRender: true,

    init(canvas, canvasWrap) {
        this.canvas = canvas;
        this.canvasWrap = canvasWrap;
        this.ctx = canvas.getContext('2d', { alpha: true });
        this.resize();
    },

    resize() {
        const rect = this.canvasWrap.getBoundingClientRect();
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;
        this.needsRender = true;
    },

    render() {
        const image = EditorState.get('image');
        if (!image) return;

        this.ctx.imageSmoothingEnabled = false;
        this.drawBackground();
        this.drawImage(image);
        
        if (EditorState.get('viewOffset')) {
            this.drawOffsetOverlay();
        }
    },

    drawBackground() {
        const bgColor1 = '#404050';
        const bgColor2 = '#383844';
        const patternSize = 8;

        this.ctx.fillStyle = bgColor1;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this.ctx.fillStyle = bgColor2;
        for (let y = 0; y < this.canvas.height; y += patternSize) {
            for (let x = 0; x < this.canvas.width; x += patternSize) {
                if ((Math.floor(x / patternSize) + Math.floor(y / patternSize)) % 2 === 0) {
                    this.ctx.fillRect(x, y, patternSize, patternSize);
                }
            }
        }
    },

    drawImage(image) {
        const zoom = EditorState.get('zoom');
        const panX = EditorState.get('panX');
        const panY = EditorState.get('panY');
        const width = EditorState.get('width');
        const height = EditorState.get('height');
        const viewOffset = EditorState.get('viewOffset');
        const offsetX = EditorState.get('offsetX');
        const offsetY = EditorState.get('offsetY');

        const scaledWidth = width * zoom;
        const scaledHeight = height * zoom;

        const centerX = this.canvas.width / 2 + panX;
        const centerY = this.canvas.height / 2 + panY;

        let drawX, drawY;

        if (viewOffset) {
            drawX = centerX - offsetX * zoom;
            drawY = centerY - offsetY * zoom;
        } else {
            drawX = centerX - scaledWidth / 2;
            drawY = centerY - scaledHeight / 2;
        }

        this.ctx.save();
        this.ctx.strokeStyle = 'rgba(96, 96, 96, 0.4)';
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(drawX - 0.5, drawY - 0.5, scaledWidth + 1, scaledHeight + 1);
        this.ctx.restore();

        this.ctx.drawImage(image, drawX, drawY, scaledWidth, scaledHeight);
    },

    drawOffsetOverlay() {
        const panX = EditorState.get('panX');
        const panY = EditorState.get('panY');

        const centerX = this.canvas.width / 2 + panX;
        const centerY = this.canvas.height / 2 + panY;

        this.ctx.save();
        this.ctx.strokeStyle = '#00ff00';
        this.ctx.lineWidth = 1;
        this.ctx.setLineDash([4, 4]);

        this.ctx.beginPath();
        this.ctx.moveTo(centerX, 0);
        this.ctx.lineTo(centerX, this.canvas.height);
        this.ctx.stroke();

        this.ctx.beginPath();
        this.ctx.moveTo(0, centerY);
        this.ctx.lineTo(this.canvas.width, centerY);
        this.ctx.stroke();

        this.ctx.restore();
    },

    requestRender() {
        this.needsRender = true;
    },

    startRenderLoop() {
        const loop = () => {
            if (this.needsRender) {
                this.render();
                this.needsRender = false;
            }
            requestAnimationFrame(loop);
        };
        loop();
    },

    getImageDrawPosition() {
        const zoom = EditorState.get('zoom');
        const panX = EditorState.get('panX');
        const panY = EditorState.get('panY');
        const width = EditorState.get('width');
        const height = EditorState.get('height');
        const viewOffset = EditorState.get('viewOffset');
        const offsetX = EditorState.get('offsetX');
        const offsetY = EditorState.get('offsetY');

        const scaledWidth = width * zoom;
        const scaledHeight = height * zoom;

        const centerX = this.canvas.width / 2 + panX;
        const centerY = this.canvas.height / 2 + panY;

        let drawX, drawY;

        if (viewOffset) {
            drawX = centerX - offsetX * zoom;
            drawY = centerY - offsetY * zoom;
        } else {
            drawX = centerX - scaledWidth / 2;
            drawY = centerY - scaledHeight / 2;
        }

        return { drawX, drawY, scaledWidth, scaledHeight };
    }
};
