export enum ColorApproximationMode {
    NearestColor = 'nearest',
    FloydSteinberg = 'floyd-steinberg',
    Atkinson = 'atkinson',
    Bayer2x2 = 'bayer-2x2',
    Bayer4x4 = 'bayer-4x4',
    Bayer8x8 = 'bayer-8x8'
}

interface RGB {
    r: number;
    g: number;
    b: number;
}

const BAYER_MATRIX_2x2 = [
    [0, 2],
    [3, 1],
];

const BAYER_MATRIX_4x4 = [
    [0,  8,  2,  10],
    [12, 4,  14, 6],
    [3,  11, 1,  9],
    [15, 7,  13, 5]
];
const BAYER_MATRIX_8x8 = [
    [0,  32, 8,  40, 2,  34, 10, 42],
    [48, 16, 56, 24, 50, 18, 58, 26],
    [12, 44, 4,  36, 14, 46, 6,  38],
    [60, 28, 52, 20, 62, 30, 54, 22],
    [3,  35, 11, 43, 1,  33, 9,  41],
    [51, 19, 59, 27, 49, 17, 57, 25],
    [15, 47, 7,  39, 13, 45, 5,  37],
    [63, 31, 55, 23, 61, 29, 53, 21]
];

function findNearestPaletteIndex(r: number, g: number, b: number, palette: Uint8Array): number {
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

    return bestIndex;
}

export function approximateColorsNearest(
    rgba: Uint8Array,
    width: number,
    height: number,
    palette: Uint8Array
): Uint8Array {
    const pixels = new Uint8Array(width * height);
    
    const colorCache = new Map<number, number>();

    for (let i = 0; i < width * height; i++) {
        const r = rgba[i * 4];
        const g = rgba[i * 4 + 1];
        const b = rgba[i * 4 + 2];
        const a = rgba[i * 4 + 3];

        if (a < 128) {
            pixels[i] = 247;
            continue;
        }

        const colorKey = (r << 16) | (g << 8) | b;
        let paletteIndex = colorCache.get(colorKey); //it in cache?
    
        if (paletteIndex === undefined) {
            // not in cache! calculate it
            paletteIndex = findNearestPaletteIndex(r, g, b, palette);
            
            // Do not use 247 otherwise things go KABUM
            if (paletteIndex === 247) {
                let bestDist = Infinity;
                let bestAlt = 0;
                for (let p = 0; p < 256; p++) {
                    if (p === 247) {
                        continue;
                    }
                    const pr = palette[p * 3];
                    const pg = palette[p * 3 + 1];
                    const pb = palette[p * 3 + 2];
                    const dist = Math.sqrt(
                        Math.pow(r - pr, 2) +
                        Math.pow(g - pg, 2) +
                        Math.pow(b - pb, 2)
                    );
                    if (dist < bestDist) {
                        bestDist = dist;
                        bestAlt = p;
                    }
                }
                paletteIndex = bestAlt;
            }
            
            //store in cache for lookups
            colorCache.set(colorKey, paletteIndex);
        }
        
        pixels[i] = paletteIndex;
    }

    return pixels;
}

export function approximateColorsFloydSteinberg(
    rgba: Uint8Array,
    width: number,
    height: number,
    palette: Uint8Array
): Uint8Array {
    const pixels = new Uint8Array(width * height);
    const errorBuffer: RGB[] = [];

    for (let i = 0; i < width * height; i++) {
        errorBuffer.push({ r: 0, g: 0, b: 0 });
    }

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = y * width + x;
            
            const a = rgba[i * 4 + 3];
            if (a < 128) {
                pixels[i] = 247;
                continue;
            }

            let r = rgba[i * 4] + errorBuffer[i].r;
            let g = rgba[i * 4 + 1] + errorBuffer[i].g;
            let b = rgba[i * 4 + 2] + errorBuffer[i].b;

            r = Math.max(0, Math.min(255, r));
            g = Math.max(0, Math.min(255, g));
            b = Math.max(0, Math.min(255, b));

            const paletteIndex = findNearestPaletteIndex(r, g, b, palette);
            
            let finalIndex = paletteIndex;
            if (paletteIndex === 247) {
                let bestDist = Infinity;
                let bestAlt = 0;
                for (let p = 0; p < 256; p++) {
                    if (p === 247) {
                        continue;
                    }
                    const pr = palette[p * 3];
                    const pg = palette[p * 3 + 1];
                    const pb = palette[p * 3 + 2];
                    const dist = Math.sqrt(
                        Math.pow(r - pr, 2) +
                        Math.pow(g - pg, 2) +
                        Math.pow(b - pb, 2)
                    );
                    if (dist < bestDist) {
                        bestDist = dist;
                        bestAlt = p;
                    }
                }
                finalIndex = bestAlt;
            }
            
            pixels[i] = finalIndex;

            const pr = palette[finalIndex * 3];
            const pg = palette[finalIndex * 3 + 1];
            const pb = palette[finalIndex * 3 + 2];

            const errR = r - pr;
            const errG = g - pg;
            const errB = b - pb;

            if (x + 1 < width) {
                const idx = i + 1;
                errorBuffer[idx].r += errR * 7 / 16;
                errorBuffer[idx].g += errG * 7 / 16;
                errorBuffer[idx].b += errB * 7 / 16;
            }

            if (y + 1 < height) {
                if (x > 0) {
                    const idx = i + width - 1;
                    errorBuffer[idx].r += errR * 3 / 16;
                    errorBuffer[idx].g += errG * 3 / 16;
                    errorBuffer[idx].b += errB * 3 / 16;
                }

                const idx = i + width;
                errorBuffer[idx].r += errR * 5 / 16;
                errorBuffer[idx].g += errG * 5 / 16;
                errorBuffer[idx].b += errB * 5 / 16;

                if (x + 1 < width) {
                    const idx = i + width + 1;
                    errorBuffer[idx].r += errR * 1 / 16;
                    errorBuffer[idx].g += errG * 1 / 16;
                    errorBuffer[idx].b += errB * 1 / 16;
                }
            }
        }
    }

    return pixels;
}

export function approximateColorsAtkinson(
    rgba: Uint8Array,
    width: number,
    height: number,
    palette: Uint8Array
): Uint8Array {
    const pixels = new Uint8Array(width * height);
    const errorBuffer: RGB[] = [];

    for (let i = 0; i < width * height; i++) {
        errorBuffer.push({ r: 0, g: 0, b: 0 });
    }

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = y * width + x;
            
            const a = rgba[i * 4 + 3];
            if (a < 128) {
                pixels[i] = 247;
                continue;
            }

            let r = rgba[i * 4] + errorBuffer[i].r;
            let g = rgba[i * 4 + 1] + errorBuffer[i].g;
            let b = rgba[i * 4 + 2] + errorBuffer[i].b;

            r = Math.max(0, Math.min(255, Math.round(r)));
            g = Math.max(0, Math.min(255, Math.round(g)));
            b = Math.max(0, Math.min(255, Math.round(b)));

            const paletteIndex = findNearestPaletteIndex(r, g, b, palette);
            
            //no kabum here
            let finalIndex = paletteIndex;
            if (paletteIndex === 247) {
                let bestDist = Infinity;
                let bestAlt = 0;
                for (let p = 0; p < 256; p++) {
                    if (p === 247) {
                        continue;
                    }
                    const pr = palette[p * 3];
                    const pg = palette[p * 3 + 1];
                    const pb = palette[p * 3 + 2];
                    const dist = Math.sqrt(
                        Math.pow(r - pr, 2) +
                        Math.pow(g - pg, 2) +
                        Math.pow(b - pb, 2)
                    );
                    if (dist < bestDist) {
                        bestDist = dist;
                        bestAlt = p;
                    }
                }
                finalIndex = bestAlt;
            }
            
            pixels[i] = finalIndex;

            const pr = palette[finalIndex * 3];
            const pg = palette[finalIndex * 3 + 1];
            const pb = palette[finalIndex * 3 + 2];

            const errR = r - pr;
            const errG = g - pg;
            const errB = b - pb;

            if (x + 1 < width) {
                const idx = i + 1;
                errorBuffer[idx].r += errR / 8;
                errorBuffer[idx].g += errG / 8;
                errorBuffer[idx].b += errB / 8;
            }

            if (x + 2 < width) {
                const idx = i + 2;
                errorBuffer[idx].r += errR / 8;
                errorBuffer[idx].g += errG / 8;
                errorBuffer[idx].b += errB / 8;
            }

            if (y + 1 < height) {
                if (x > 0) {
                    const idx = i + width - 1;
                    errorBuffer[idx].r += errR / 8;
                    errorBuffer[idx].g += errG / 8;
                    errorBuffer[idx].b += errB / 8;
                }

                const idx = i + width;
                errorBuffer[idx].r += errR / 8;
                errorBuffer[idx].g += errG / 8;
                errorBuffer[idx].b += errB / 8;

                if (x + 1 < width) {
                    const idx = i + width + 1;
                    errorBuffer[idx].r += errR / 8;
                    errorBuffer[idx].g += errG / 8;
                    errorBuffer[idx].b += errB / 8;
                }
            }

            if (y + 2 < height) {
                const idx = i + width * 2;
                errorBuffer[idx].r += errR / 8;
                errorBuffer[idx].g += errG / 8;
                errorBuffer[idx].b += errB / 8;
            }
        }
    }

    return pixels;
}

function approximateColorsBayer(
    rgba: Uint8Array,
    width: number,
    height: number,
    palette: Uint8Array,
    matrix: number[][],
    matrixSize: number
): Uint8Array {
    const pixels = new Uint8Array(width * height);
    const scale = 255 / (matrixSize * matrixSize);
    const colorCache = new Map<number, number>();

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = y * width + x;
            
            const a = rgba[i * 4 + 3];
            if (a < 128) {
                pixels[i] = 247;
                continue;
            }

            const threshold = (matrix[y % matrixSize][x % matrixSize] / (matrixSize * matrixSize) - 0.5) * scale;

            let r = rgba[i * 4] + threshold;
            let g = rgba[i * 4 + 1] + threshold;
            let b = rgba[i * 4 + 2] + threshold;

            r = Math.max(0, Math.min(255, Math.round(r)));
            g = Math.max(0, Math.min(255, Math.round(g)));
            b = Math.max(0, Math.min(255, Math.round(b)));

            const colorKey = (r << 16) | (g << 8) | b;
            let paletteIndex = colorCache.get(colorKey);
            
            if (paletteIndex === undefined) {
                paletteIndex = findNearestPaletteIndex(r, g, b, palette);
                
                if (paletteIndex === 247) {
                    let bestDist = Infinity;
                    let bestAlt = 0;
                    for (let p = 0; p < 256; p++) {
                        if (p === 247) {
                            continue;
                        }
                        const pr = palette[p * 3];
                        const pg = palette[p * 3 + 1];
                        const pb = palette[p * 3 + 2];
                        const dist = Math.sqrt(
                            Math.pow(r - pr, 2) +
                            Math.pow(g - pg, 2) +
                            Math.pow(b - pb, 2)
                        );
                        if (dist < bestDist) {
                            bestDist = dist;
                            bestAlt = p;
                        }
                    }
                    paletteIndex = bestAlt;
                }
                colorCache.set(colorKey, paletteIndex);
            }
            
            pixels[i] = paletteIndex;
        }
    }

    return pixels;
}

export function approximateColors(
    rgba: Uint8Array,
    width: number,
    height: number,
    palette: Uint8Array,
    mode: ColorApproximationMode
): Uint8Array {
    switch (mode) {
        case ColorApproximationMode.FloydSteinberg:
            return approximateColorsFloydSteinberg(rgba, width, height, palette);
        case ColorApproximationMode.Atkinson:
            return approximateColorsAtkinson(rgba, width, height, palette);
        case ColorApproximationMode.Bayer2x2:
            return approximateColorsBayer(rgba, width, height, palette, BAYER_MATRIX_2x2, 2);
        case ColorApproximationMode.Bayer4x4:
            return approximateColorsBayer(rgba, width, height, palette, BAYER_MATRIX_4x4, 4);
        case ColorApproximationMode.Bayer8x8:
            return approximateColorsBayer(rgba, width, height, palette, BAYER_MATRIX_8x8, 8);
        case ColorApproximationMode.NearestColor:
        default:
            return approximateColorsNearest(rgba, width, height, palette);
    }
}
