// Minimal ZIP writer/reader. We implement just enough to create and
// read a store-only archive (no compression). This is small,
// dependency-free, and enough for `genmem export` / `genmem import`.
//
// Format reference: APPNOTE.TXT (PKWARE). Each entry is a local
// file header + filename + data, followed by a central directory at
// the end. CRC32 is computed over the file data.

import { createWriteStream } from "node:fs";
import { mkdir, readFile, readdir } from "node:fs/promises";
import { dirname, join, normalize, relative } from "node:path";
import { Transform } from "node:stream";

// --- CRC32 (IEEE 802.3) ---------------------------------------------------
const CRC_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_END = 0x06054b50;

const VERSION_NEEDED = 20;
const METHOD_STORE = 0;

interface CentralEntry {
  name: string;
  crc: number;
  size: number;
  headerOffset: number;
  dosTime: number;
}

export class ZipSupportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ZipSupportError";
  }
}

export async function ensureZipSupport(): Promise<void> {
  if (typeof createWriteStream !== "function") {
    throw new ZipSupportError("node:fs streams are not available");
  }
}

async function* walkDir(
  absDir: string,
  root: string,
): AsyncGenerator<{ abs: string; rel: string }> {
  let entries;
  try {
    entries = await readdir(absDir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const abs = join(absDir, entry.name);
    if (entry.isDirectory()) {
      yield* walkDir(abs, root);
    } else if (entry.isFile()) {
      const rel = relative(root, abs).replace(/\\/g, "/");
      yield { abs, rel };
    }
  }
}

export interface ZipDirOptions {
  source: string;
  outFile: string;
  includeDirs: string[];
  excludeDirs?: string[];
  includeFiles?: string[];
  onFile?: (relPath: string) => void;
}

export interface ZipDirStats {
  fileCount: number;
  totalBytes: number;
}

/**
 * Pack a filtered subset of `source` into `outFile`. We buffer the
 * entire output to compute byte offsets correctly — this is fine for
 * the scope sizes we expect (hundreds to a few thousand files).
 */
export async function zipDirectoryToFile(opts: ZipDirOptions): Promise<ZipDirStats> {
  await mkdir(dirname(opts.outFile), { recursive: true });

  const parts: Buffer[] = [];
  const entries: CentralEntry[] = [];
  let fileCount = 0;
  let totalBytes = 0;

  function writeChunk(buf: Buffer): void {
    parts.push(buf);
  }

  function writeLocalHeader(name: string, crc: number, size: number): number {
    const offset = parts.reduce((sum, p) => sum + p.length, 0);
    const nameBytes = Buffer.from(name, "utf8");
    const dosTime = packDosTime(new Date());
    const header = Buffer.alloc(30);
    header.writeUInt32LE(SIG_LOCAL, 0);
    header.writeUInt16LE(VERSION_NEEDED, 4);
    header.writeUInt16LE(0, 6);
    header.writeUInt16LE(METHOD_STORE, 8);
    header.writeUInt16LE(dosTime & 0xffff, 10);
    header.writeUInt16LE((dosTime >>> 16) & 0xffff, 12);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(size, 18);
    header.writeUInt32LE(size, 22);
    header.writeUInt16LE(nameBytes.length, 26);
    header.writeUInt16LE(0, 28);
    writeChunk(header);
    writeChunk(nameBytes);
    return offset;
  }

  async function streamFile(abs: string, rel: string): Promise<void> {
    const data = await readFile(abs);
    const crc = crc32(data);
    const offset = writeLocalHeader(rel, crc, data.length);
    writeChunk(data);
    fileCount++;
    totalBytes += data.length;
    entries.push({ name: rel, crc, size: data.length, headerOffset: offset, dosTime: packDosTime(new Date()) });
    opts.onFile?.(rel);
  }

  // Collect files to include.
  const toWrite: Array<{ abs: string; rel: string }> = [];
  const root = normalize(opts.source).replace(/\\/g, "/");
  for (const dir of opts.includeDirs) {
    for await (const f of walkDir(dir, root)) {
      const excluded = (opts.excludeDirs ?? []).some((ex) =>
        f.abs.toLowerCase().startsWith(ex.toLowerCase()),
      );
      if (excluded) continue;
      toWrite.push(f);
    }
  }
  for (const file of opts.includeFiles ?? []) {
    try {
      const s = await import("node:fs/promises").then((m) => m.stat(file));
      if (s.isFile()) {
        toWrite.push({ abs: file, rel: relative(opts.source, file).replace(/\\/g, "/") });
      }
    } catch {
      // skip missing optional files (e.g. config.json when --include-config)
    }
  }

  for (const f of toWrite) {
    await streamFile(f.abs, f.rel);
  }

  // Central directory.
  const cdStart = parts.reduce((sum, p) => sum + p.length, 0);
  let cdSize = 0;
  for (const e of entries) {
    const nameBytes = Buffer.from(e.name, "utf8");
    const header = Buffer.alloc(46);
    header.writeUInt32LE(SIG_CENTRAL, 0);
    header.writeUInt16LE(VERSION_NEEDED, 4);
    header.writeUInt16LE(VERSION_NEEDED, 6);
    header.writeUInt16LE(0, 8);
    header.writeUInt16LE(METHOD_STORE, 10);
    header.writeUInt16LE(e.dosTime & 0xffff, 12);
    header.writeUInt16LE((e.dosTime >>> 16) & 0xffff, 14);
    header.writeUInt32LE(e.crc, 16);
    header.writeUInt32LE(e.size, 20);
    header.writeUInt32LE(e.size, 24);
    header.writeUInt16LE(nameBytes.length, 28);
    header.writeUInt16LE(0, 30);
    header.writeUInt16LE(0, 32);
    header.writeUInt16LE(0, 34);
    header.writeUInt16LE(0, 36);
    header.writeUInt32LE(0, 38);
    header.writeUInt32LE(e.headerOffset, 42);
    writeChunk(header);
    writeChunk(nameBytes);
    cdSize += 46 + nameBytes.length;
  }

  // End of central directory.
  const end = Buffer.alloc(22);
  end.writeUInt32LE(SIG_END, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cdSize, 12);
  end.writeUInt32LE(cdStart, 16);
  end.writeUInt16LE(0, 20);
  writeChunk(end);

  // Flush all buffered parts to disk in a single write.
  const out = createWriteStream(opts.outFile);
  await new Promise<void>((resolve, reject) => {
    out.once("finish", () => resolve());
    out.once("error", reject);
    for (const p of parts) {
      out.write(p);
    }
    out.end();
  });

  return { fileCount, totalBytes };
}

// --- Reader ----------------------------------------------------------------
export interface ZipEntry {
  name: string;
  size: number;
  data: Buffer;
}

export async function readZipFile(path: string): Promise<ZipEntry[]> {
  const buf = await readFile(path);

  let eocdOffset = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 0xffff - 22); i--) {
    if (buf.readUInt32LE(i) === SIG_END) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset < 0) {
    throw new ZipSupportError(`not a valid zip: no EOCD record in ${path}`);
  }

  const totalEntries = buf.readUInt16LE(eocdOffset + 10);
  const cdOffset = buf.readUInt32LE(eocdOffset + 16);
  const entries: ZipEntry[] = [];

  let p = cdOffset;
  for (let i = 0; i < totalEntries; i++) {
    if (buf.readUInt32LE(p) !== SIG_CENTRAL) {
      throw new ZipSupportError(`bad central directory at offset ${p}`);
    }
    const method = buf.readUInt16LE(p + 10);
    const crc = buf.readUInt32LE(p + 16);
    const csize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.slice(p + 46, p + 46 + nameLen).toString("utf8");

    if (method !== METHOD_STORE) {
      throw new ZipSupportError(
        `unsupported compression method ${method} for entry ${name}`,
      );
    }

    if (buf.readUInt32LE(localOffset) !== SIG_LOCAL) {
      throw new ZipSupportError(`bad local header at offset ${localOffset}`);
    }
    const localNameLen = buf.readUInt16LE(localOffset + 26);
    const localExtraLen = buf.readUInt16LE(localOffset + 28);
    const dataOffset = localOffset + 30 + localNameLen + localExtraLen;

    const data = Buffer.from(buf.slice(dataOffset, dataOffset + csize));
    const actualCrc = crc32(data);
    if (actualCrc !== crc) {
      throw new ZipSupportError(
        `crc mismatch for ${name}: expected ${crc.toString(16)}, got ${actualCrc.toString(16)}`,
      );
    }

    entries.push({ name, size: csize, data });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function packDosTime(d: Date): number {
  const time =
    ((d.getHours() & 0x1f) << 11) |
    ((d.getMinutes() & 0x3f) << 5) |
    ((d.getSeconds() >> 1) & 0x1f);
  const date =
    (((d.getFullYear() - 1980) & 0x7f) << 9) |
    (((d.getMonth() + 1) & 0x0f) << 5) |
    (d.getDate() & 0x1f);
  return (date << 16) | time;
}

// Suppress unused
void Transform;
