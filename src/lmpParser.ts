export interface LMPHeader {
    width: number;
    height: number;
    leftOffset: number;
    topOffset: number;
}

export interface LMPImage {
    header: LMPHeader;
    pixels: Uint8Array;
}

export function parseLMP(buffer: Buffer): LMPImage {
    if (buffer.length < 8) {
        throw new Error('Invalid LMP file: too small');
    }

    const header: LMPHeader = {
        width: buffer.readInt16LE(0),
        height: buffer.readInt16LE(2),
        leftOffset: buffer.readInt16LE(4),
        topOffset: buffer.readInt16LE(6)
    };

    if (header.width <= 0 || header.height <= 0) {
        throw new Error('Invalid LMP file: invalid dimensions');
    }

    const pixels = new Uint8Array(header.width * header.height);
    pixels.fill(247);

    const columnOffsets: number[] = [];
    for (let i = 0; i < header.width; i++) {
        const offset = buffer.readInt32LE(8 + i * 4);
        columnOffsets.push(offset);
    }

    for (let col = 0; col < header.width; col++) {
        let offset = columnOffsets[col];
        
        while (offset < buffer.length) {
            const rowStart = buffer[offset];
            if (rowStart === 255) {
                break;
            }
            
            const pixelCount = buffer[offset + 1];
            offset += 3;
            
            for (let i = 0; i < pixelCount && offset < buffer.length; i++) {
                const row = rowStart + i;
                if (row < header.height) {
                    const pixelIndex = row * header.width + col;
                    pixels[pixelIndex] = buffer[offset];
                }
                offset++;
            }
            
            offset++;
        }
    }

    return { header, pixels };
}

export function lmpToRGBA(lmpImage: LMPImage, palette: Uint8Array): Uint8Array {
    const { width, height } = lmpImage.header;
    const rgba = new Uint8Array(width * height * 4);

    for (let i = 0; i < lmpImage.pixels.length; i++) {
        const paletteIndex = lmpImage.pixels[i];
        const r = palette[paletteIndex * 3];
        const g = palette[paletteIndex * 3 + 1];
        const b = palette[paletteIndex * 3 + 2];
        const a = paletteIndex === 247 ? 0 : 255;

        rgba[i * 4] = r;
        rgba[i * 4 + 1] = g;
        rgba[i * 4 + 2] = b;
        rgba[i * 4 + 3] = a;
    }

    return rgba;
}

export function rgbaToLMP(rgba: Uint8Array, width: number, height: number, palette: Uint8Array): Buffer {
    const pixels = new Uint8Array(width * height);

    for (let i = 0; i < width * height; i++) {
        const r = rgba[i * 4];
        const g = rgba[i * 4 + 1];
        const b = rgba[i * 4 + 2];
        const a = rgba[i * 4 + 3];

        if (a < 128) {
            pixels[i] = 247;
            continue;
        }

        let bestIndex = 0;
        let bestDistance = Infinity;

        for (let p = 0; p < 256; p++) {
            const pr = palette[p * 3];
            const pg = palette[p * 3 + 1];
            const pb = palette[p * 3 + 2];

            const distance = Math.sqrt(
                Math.pow(r - pr, 2) +
                Math.pow(g - pg, 2) +
                Math.pow(b - pb, 2)
            );

            if (distance < bestDistance) {
                bestDistance = distance;
                bestIndex = p;
            }
        }

        pixels[i] = bestIndex;
    }

    const headerSize = 8;
    const offsetTableSize = width * 4;
    let dataSize = 0;

    const columns: Buffer[] = [];

    for (let col = 0; col < width; col++) {
        const columnData: number[] = [];
        let inPost = false;
        let postStart = 0;
        const postPixels: number[] = [];

        for (let row = 0; row < height; row++) {
            const pixelIndex = row * width + col;
            const paletteIndex = pixels[pixelIndex];

            if (paletteIndex !== 247) {
                if (!inPost) {
                    inPost = true;
                    postStart = row;
                    postPixels.length = 0;
                }
                postPixels.push(paletteIndex);
            } else {
                if (inPost) {
                    columnData.push(postStart, postPixels.length, 0);
                    columnData.push(...postPixels);
                    columnData.push(0);
                    inPost = false;
                }
            }
        }

        if (inPost) {
            columnData.push(postStart, postPixels.length, 0);
            columnData.push(...postPixels);
            columnData.push(0);
        }

        columnData.push(255);
        const columnBuffer = Buffer.from(columnData);
        columns.push(columnBuffer);
        dataSize += columnBuffer.length;
    }

    const totalSize = headerSize + offsetTableSize + dataSize;
    const buffer = Buffer.alloc(totalSize);

    buffer.writeInt16LE(width, 0);
    buffer.writeInt16LE(height, 2);
    buffer.writeInt16LE(0, 4);
    buffer.writeInt16LE(0, 6);

    let currentOffset = headerSize + offsetTableSize;
    for (let i = 0; i < width; i++) {
        buffer.writeInt32LE(currentOffset, 8 + i * 4);
        columns[i].copy(buffer, currentOffset);
        currentOffset += columns[i].length;
    }

    return buffer;
}
