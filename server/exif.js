import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Extracts EXIF, TIFF, SOF and camera metadata from image files
 */
export async function getExifData(filePath) {
  if (!fs.existsSync(filePath)) return null;

  const filename = path.basename(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const stats = fs.statSync(filePath);

  let buffer;
  try {
    // Read up to first 256KB where EXIF APP markers and headers reside
    const fd = fs.openSync(filePath, 'r');
    const readLen = Math.min(stats.size, 262144);
    buffer = Buffer.alloc(readLen);
    fs.readSync(fd, buffer, 0, readLen, 0);
    fs.closeSync(fd);
  } catch (err) {
    console.error(`[EXIF Read Error]: ${filePath}`, err.message);
    return null;
  }

  let rawData = null;
  let dims = null;

  if (ext === '.jpg' || ext === '.jpeg') {
    rawData = parseJpegExif(buffer);
    dims = parseJpegDimensions(buffer);
  } else if (ext === '.png') {
    dims = parsePngDimensions(buffer);
  }

  const result = formatExifOutput(rawData, dims, {
    filename,
    sizeBytes: stats.size,
    mtime: stats.mtime.toISOString(),
    ext
  });

  // If dimensions or model missing, enrich via macOS sips
  if (!result.dimensions.width || !result.camera.model) {
    try {
      const enriched = await querySipsMetadata(filePath);
      if (enriched) {
        if (!result.dimensions.width && enriched.width) {
          result.dimensions.width = enriched.width;
          result.dimensions.height = enriched.height;
          result.dimensions.resolution = `${enriched.width} × ${enriched.height}`;
          result.dimensions.megaPixels = `${((enriched.width * enriched.height) / 1e6).toFixed(1)} MP`;
        }
        if (!result.camera.model && enriched.model) {
          result.camera.model = enriched.model;
        }
        if (!result.camera.make && enriched.make) {
          result.camera.make = enriched.make;
        }
      }
    } catch {}
  }

  return result;
}

/**
 * Parses APP1 Exif segment from JPEG buffer
 */
function parseJpegExif(buffer) {
  if (!buffer || buffer.length < 14) return null;
  if (buffer[0] !== 0xFF || buffer[1] !== 0xD8) return null; // Not a valid JPEG

  let offset = 2;
  let exifBlock = null;

  while (offset + 4 < buffer.length) {
    if (buffer[offset] !== 0xFF) break;
    const marker = buffer[offset + 1];
    if (marker === 0xDA || marker === 0xD9) break; // Start of Scan or End of Image
    const len = buffer.readUInt16BE(offset + 2);

    if (marker === 0xE1 && offset + 10 <= buffer.length) {
      const header = buffer.toString('ascii', offset + 4, offset + 10);
      if (header === 'Exif\0\0') {
        exifBlock = buffer.subarray(offset + 10, offset + 2 + len);
        break;
      }
    }
    offset += 2 + len;
  }

  if (!exifBlock || exifBlock.length < 14) return null;

  const isLE = exifBlock.toString('ascii', 0, 2) === 'II';
  const readU16 = (o) => (isLE ? exifBlock.readUInt16LE(o) : exifBlock.readUInt16BE(o));
  const readU32 = (o) => (isLE ? exifBlock.readUInt32LE(o) : exifBlock.readUInt32BE(o));
  const readI32 = (o) => (isLE ? exifBlock.readInt32LE(o) : exifBlock.readInt32BE(o));

  if (readU16(2) !== 0x002A) return null; // TIFF validity check
  const ifd0Offset = readU32(4);

  const readValue = (type, count, valOrOffset) => {
    try {
      if (type === 2) {
        // ASCII string
        const strBuf = exifBlock.subarray(valOrOffset, valOrOffset + count);
        const str = strBuf.toString('utf8');
        const nullIdx = str.indexOf('\0');
        return nullIdx !== -1 ? str.slice(0, nullIdx) : str;
      }
      if (type === 3) {
        // SHORT
        return valOrOffset & 0xFFFF;
      }
      if (type === 4) {
        // LONG
        return valOrOffset;
      }
      if (type === 5) {
        // RATIONAL (uint32 / uint32)
        if (count === 1) {
          if (valOrOffset + 8 <= exifBlock.length) {
            const num = readU32(valOrOffset);
            const den = readU32(valOrOffset + 4);
            return den === 0 ? 0 : num / den;
          }
        } else {
          const list = [];
          for (let c = 0; c < count; c++) {
            const pos = valOrOffset + c * 8;
            if (pos + 8 <= exifBlock.length) {
              const num = readU32(pos);
              const den = readU32(pos + 4);
              list.push(den === 0 ? 0 : num / den);
            }
          }
          return list;
        }
      }
      if (type === 10) {
        // SRATIONAL (int32 / int32)
        if (valOrOffset + 8 <= exifBlock.length) {
          const num = readI32(valOrOffset);
          const den = readI32(valOrOffset + 4);
          return den === 0 ? 0 : num / den;
        }
      }
    } catch {}
    return null;
  };

  const readIFD = (startOffset) => {
    if (startOffset + 2 > exifBlock.length) return {};
    const entriesCount = readU16(startOffset);
    const tags = {};
    let cur = startOffset + 2;

    for (let i = 0; i < entriesCount && cur + 12 <= exifBlock.length; i++, cur += 12) {
      const tag = readU16(cur);
      const type = readU16(cur + 2);
      const count = readU32(cur + 4);
      let valOrOffset;

      if ((type === 3 && count === 1) || (type === 1 && count <= 4)) {
        valOrOffset = isLE ? exifBlock.readUInt16LE(cur + 8) : exifBlock.readUInt16BE(cur + 8);
      } else if (type === 2 && count <= 4) {
        valOrOffset = cur + 8;
      } else {
        valOrOffset = readU32(cur + 8);
      }
      tags[tag] = readValue(type, count, valOrOffset);
    }
    return tags;
  };

  const ifd0 = readIFD(ifd0Offset);
  const exifSubIFD = ifd0[0x8769] ? readIFD(ifd0[0x8769]) : {};
  const gpsSubIFD = ifd0[0x8825] ? readIFD(ifd0[0x8825]) : {};

  return { ifd0, exifSubIFD, gpsSubIFD };
}

/**
 * Extracts true JPEG pixel dimensions from SOF0/SOF2 marker
 */
function parseJpegDimensions(buffer) {
  let offset = 2;
  while (offset + 4 < buffer.length) {
    if (buffer[offset] !== 0xFF) break;
    const marker = buffer[offset + 1];
    const len = buffer.readUInt16BE(offset + 2);

    // SOF0 (Baseline), SOF1 (Extended Sequential), SOF2 (Progressive)
    if (marker === 0xC0 || marker === 0xC1 || marker === 0xC2) {
      if (offset + 9 <= buffer.length) {
        const height = buffer.readUInt16BE(offset + 5);
        const width = buffer.readUInt16BE(offset + 7);
        return { width, height };
      }
    }
    offset += 2 + len;
  }
  return null;
}

/**
 * Extracts PNG dimensions from IHDR chunk
 */
function parsePngDimensions(buffer) {
  if (buffer.length >= 24 && buffer.toString('ascii', 1, 4) === 'PNG') {
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    return { width, height };
  }
  return null;
}

/**
 * Formats parsed tags into a clean, normalized structure
 */
function formatExifOutput(raw, dims, fileInfo) {
  const ifd0 = raw?.ifd0 || {};
  const exifSubIFD = raw?.exifSubIFD || {};
  const gpsSubIFD = raw?.gpsSubIFD || {};

  const make = (ifd0[0x010F] || '').trim();
  const model = (ifd0[0x0110] || '').trim();
  const software = (ifd0[0x0131] || '').trim();
  const orientation = ifd0[0x0112] || 1;

  const dateOriginal = exifSubIFD[0x9003] || ifd0[0x0132] || '';
  const fNumber = exifSubIFD[0x829D];
  const exposureTime = exifSubIFD[0x829A];
  const iso = exifSubIFD[0x8827];
  const focalLength = exifSubIFD[0x920A];
  const focal35 = exifSubIFD[0xA405];
  const width = dims?.width || exifSubIFD[0xA002] || ifd0[0x0100] || null;
  const height = dims?.height || exifSubIFD[0xA003] || ifd0[0x0101] || null;
  const flash = exifSubIFD[0x9209];
  const whiteBalance = exifSubIFD[0xA403];

  let exposureStr = '';
  if (typeof exposureTime === 'number' && exposureTime > 0) {
    if (exposureTime < 1) {
      exposureStr = `1/${Math.round(1 / exposureTime)}s`;
    } else {
      exposureStr = `${exposureTime < 10 ? exposureTime.toFixed(1) : Math.round(exposureTime)}s`;
    }
  }

  let apertureStr = '';
  if (typeof fNumber === 'number' && fNumber > 0) {
    apertureStr = `f/${fNumber.toFixed(1)}`;
  }

  let focalStr = '';
  if (typeof focalLength === 'number' && focalLength > 0) {
    focalStr = `${focalLength.toFixed(1)} mm`;
    if (focal35) focalStr += ` (${focal35} mm eq.)`;
  }

  let resolutionStr = '';
  let megaPixelsStr = '';
  if (width && height) {
    resolutionStr = `${width} × ${height}`;
    megaPixelsStr = `${((width * height) / 1e6).toFixed(1)} MP`;
  }

  let gps = null;
  const latArr = gpsSubIFD[0x0002];
  const latRef = gpsSubIFD[0x0001] || 'N';
  const lonArr = gpsSubIFD[0x0004];
  const lonRef = gpsSubIFD[0x0003] || 'E';
  const alt = gpsSubIFD[0x0006];

  if (Array.isArray(latArr) && latArr.length === 3 && Array.isArray(lonArr) && lonArr.length === 3) {
    let lat = latArr[0] + latArr[1] / 60 + latArr[2] / 3600;
    let lon = lonArr[0] + lonArr[1] / 60 + lonArr[2] / 3600;
    if (latRef === 'S') lat = -lat;
    if (lonRef === 'W') lon = -lon;
    gps = {
      latitude: Number(lat.toFixed(6)),
      longitude: Number(lon.toFixed(6)),
      altitude: typeof alt === 'number' ? Math.round(alt) : null,
      mapsUrl: `https://www.google.com/maps?q=${lat.toFixed(6)},${lon.toFixed(6)}`
    };
  }

  return {
    camera: {
      make,
      model,
      software
    },
    exposure: {
      aperture: apertureStr,
      shutter: exposureStr,
      iso: iso ? `ISO ${iso}` : '',
      focalLength: focalStr,
      flash: flash === 0 ? 'Off' : (flash & 1 ? 'Fired' : 'Auto / Off'),
      whiteBalance: whiteBalance === 1 ? 'Manual' : 'Auto'
    },
    dimensions: {
      width,
      height,
      resolution: resolutionStr,
      megaPixels: megaPixelsStr
    },
    dateTime: dateOriginal ? dateOriginal.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3') : '',
    gps,
    orientation,
    file: {
      filename: fileInfo.filename,
      sizeBytes: fileInfo.sizeBytes,
      mtime: fileInfo.mtime,
      format: (fileInfo.ext || '').replace('.', '').toUpperCase()
    }
  };
}

/**
 * Fallback to macOS sips if direct buffer parsing misses basic metadata
 */
async function querySipsMetadata(filePath) {
  try {
    const { stdout } = await execAsync(`sips -g pixelWidth -g pixelHeight -g make -g model "${filePath}" 2>/dev/null`);
    const widthMatch = stdout.match(/pixelWidth:\s*(\d+)/);
    const heightMatch = stdout.match(/pixelHeight:\s*(\d+)/);
    const makeMatch = stdout.match(/make:\s*(.+)/);
    const modelMatch = stdout.match(/model:\s*(.+)/);

    const makeVal = makeMatch ? makeMatch[1].trim() : '';
    const modelVal = modelMatch ? modelMatch[1].trim() : '';

    return {
      width: widthMatch ? parseInt(widthMatch[1], 10) : null,
      height: heightMatch ? parseInt(heightMatch[1], 10) : null,
      make: makeVal === '<nil>' ? '' : makeVal,
      model: modelVal === '<nil>' ? '' : modelVal
    };
  } catch {
    return null;
  }
}
