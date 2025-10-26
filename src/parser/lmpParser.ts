import { approximateColors, ColorApproximationMode } from './colorApproximation';

export interface LMPHeader {
    width: number;
    height: number;
    leftOffset: number;
    topOffset: number;
}

export interface LMPImage {
    header: LMPHeader;
    pixels: Uint8Array;
    transparency: Uint8Array;
}

export { ColorApproximationMode };
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
    const transparency = new Uint8Array(header.width * header.height);
    pixels.fill(0);
    transparency.fill(1);

    const columnOffsets: number[] = [];
    for (let i = 0; i < header.width; i++) {
        const offset = buffer.readInt32LE(8 + i * 4);
        columnOffsets.push(offset);
    }

    for (let col = 0; col < header.width; col++) {
        let offset = columnOffsets[col];
        let topRow = -1;
        
        while (offset < buffer.length) {
            const rowStart = buffer[offset];
            if (rowStart === 255) {
                break;
            }
            
            let actualRow = rowStart;
            if (rowStart <= topRow) {
                actualRow = topRow + rowStart;
            }
            topRow = actualRow;
            
            const pixelCount = buffer[offset + 1];
            offset += 2;
            offset += 1;
            
            for (let i = 0; i < pixelCount && offset < buffer.length; i++) {
                const row = actualRow + i;
                if (row < header.height) {
                    const pixelIndex = row * header.width + col;
                    pixels[pixelIndex] = buffer[offset];
                    transparency[pixelIndex] = 0;
                }
                offset++;
            }
            
            offset += 1;
        }
    }

    return { header, pixels, transparency };
}

export function lmpToRGBA(lmpImage: LMPImage, palette: Uint8Array): Uint8Array {
    const { width, height } = lmpImage.header;
    const rgba = new Uint8Array(width * height * 4);

    for (let i = 0; i < lmpImage.pixels.length; i++) {
        const paletteIndex = lmpImage.pixels[i];
        const r = palette[paletteIndex * 3];
        const g = palette[paletteIndex * 3 + 1];
        const b = palette[paletteIndex * 3 + 2];
        const a = lmpImage.transparency[i] === 1 ? 0 : 255;

        rgba[i * 4] = r;
        rgba[i * 4 + 1] = g;
        rgba[i * 4 + 2] = b;
        rgba[i * 4 + 3] = a;
    }

    return rgba;
}

export function rgbaToLMP(rgba: Uint8Array, width: number, height: number, palette: Uint8Array, offsetX: number = 0, offsetY: number = 0, mode: ColorApproximationMode = ColorApproximationMode.NearestColor): Buffer {
    const pixels = approximateColors(rgba, width, height, palette, mode);

    const headerSize = 8;
    const offsetTableSize = width * 4;
    let dataSize = 0;

    const columns: Buffer[] = [];

    for (let col = 0; col < width; col++) {
        const columnData: number[] = [];
        let topRow = -1;

        let row = 0;
        while (row < height) {
            const pixelIndex = row * width + col;
            const paletteIndex = pixels[pixelIndex];

            if (paletteIndex === 247) {
                row++;
                continue;
            }

            const postPixels: number[] = [];
            const postStartRow = row;

            while (row < height && pixels[row * width + col] !== 247) {
                const postLength = row - postStartRow;
                
                if (postLength >= 254) {
                    break;
                }
                
                const splitPoint = height >= 256 ? 254 : 128;
                if (postStartRow < splitPoint && row >= splitPoint) {
                    break;
                }

                postPixels.push(pixels[row * width + col]);
                row++;
            }

            let topdelta: number;
            
            if (topRow < 0) {
                topdelta = postStartRow;
            } else if (postStartRow <= topRow) {
                topdelta = postStartRow - topRow;
            } else {
                topdelta = postStartRow;
            }

            columnData.push(topdelta, postPixels.length, 0);
            columnData.push(...postPixels);
            columnData.push(0);

            topRow = postStartRow;

            const postEndRow = postStartRow + postPixels.length - 1;
            
            if (height >= 256 && postEndRow >= 254 && topRow < 254 && row < height) {
                columnData.push(254, 0, 0, 0);
                topRow = 254;
            }
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
    buffer.writeInt16LE(offsetX, 4);
    buffer.writeInt16LE(offsetY, 6);

    let currentOffset = headerSize + offsetTableSize;
    for (let i = 0; i < width; i++) {
        buffer.writeInt32LE(currentOffset, 8 + i * 4);
        columns[i].copy(buffer, currentOffset);
        currentOffset += columns[i].length;
    }

    return buffer;
}
