const Transform = {
    apply(transformType) {
        const currentImageData = EditorState.get('currentImageData');
        const image = EditorState.get('image');
        if (!currentImageData || !image) return;

        const width = EditorState.get('width');
        const height = EditorState.get('height');

        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');

        let newWidth = width;
        let newHeight = height;

        if (transformType === 'rotate-left' || transformType === 'rotate-right') {
            newWidth = height;
            newHeight = width;
        }

        tempCanvas.width = newWidth;
        tempCanvas.height = newHeight;
        tempCtx.imageSmoothingEnabled = false;

        this.applyTransformation(tempCtx, transformType, newWidth, newHeight);
        tempCtx.drawImage(image, 0, 0);

        const newDataUri = tempCanvas.toDataURL('image/png');

        EditorState.setMultiple({
            width: newWidth,
            height: newHeight,
            currentImageData: newDataUri
        });

        const newImage = new Image();
        newImage.onload = () => {
            EditorState.set('image', newImage);
            Renderer.requestRender();
            Controls.updateImageSize();
            Toolbar.setDirty(true);
        };
        newImage.src = newDataUri;
    },

    applyTransformation(ctx, type, width, height) {
        switch (type) {
            case 'flip-h':
                ctx.translate(width, 0);
                ctx.scale(-1, 1);
                break;
            case 'flip-v':
                ctx.translate(0, height);
                ctx.scale(1, -1);
                break;
            case 'rotate-left':
                ctx.translate(0, height);
                ctx.rotate(-Math.PI / 2);
                break;
            case 'rotate-right':
                ctx.translate(width, 0);
                ctx.rotate(Math.PI / 2);
                break;
        }
    },

    flipHorizontal() {
        this.apply('flip-h');
    },

    flipVertical() {
        this.apply('flip-v');
    },

    rotateLeft() {
        this.apply('rotate-left');
    },

    rotateRight() {
        this.apply('rotate-right');
    }
};
