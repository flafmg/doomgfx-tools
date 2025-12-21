export function rgbaToBase64PNG(rgba: Uint8Array, width: number, height: number): string {
    const pngBuffer = createPNG({ width, height, data: rgba });
    return `data:image/png;base64,${pngBuffer.toString('base64')}`;
}

export function createPNG(canvas: { width: number; height: number; data: Uint8Array }): Buffer {
    const PNG = require('pngjs').PNG;
    const png = new PNG({ width: canvas.width, height: canvas.height });
    png.data = Buffer.from(canvas.data);
    return PNG.sync.write(png);
}

export async function dataUriToRGBA(dataUri: string): Promise<{ data: Uint8Array; width: number; height: number }> {
    const response = await fetch(dataUri);
    const blob = await response.blob();
    const arrayBuffer = await blob.arrayBuffer();
    const pngBuffer = Buffer.from(arrayBuffer);

    const PNG = require('pngjs').PNG;
    const png = PNG.sync.read(pngBuffer);

    return {
        data: new Uint8Array(png.data),
        width: png.width,
        height: png.height
    };
}
