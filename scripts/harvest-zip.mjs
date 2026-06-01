#!/usr/bin/env node
/**
 * Create a .zip of a directory (store only, no compression) — no npm deps.
 * Usage: node scripts/harvest-zip.mjs <sourceDir> <output.zip>
 */
import { createWriteStream } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

async function collectFiles(root, base = root) {
  const entries = await readdir(root, { withFileTypes: true });
  const out = [];
  for (const ent of entries) {
    const full = path.join(root, ent.name);
    if (ent.isDirectory()) {
      out.push(...(await collectFiles(full, base)));
    } else if (ent.isFile()) {
      const rel = path.relative(base, full).split(path.sep).join("/");
      out.push({ full, rel });
    }
  }
  return out;
}

function u16(n) {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(n, 0);
  return b;
}

function u32(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n, 0);
  return b;
}

async function main() {
  const [src, dest] = process.argv.slice(2);
  if (!src || !dest) {
    console.error("Usage: node scripts/harvest-zip.mjs <sourceDir> <output.zip>");
    process.exit(1);
  }
  const absSrc = path.resolve(src);
  const st = await stat(absSrc).catch(() => null);
  if (!st?.isDirectory()) {
    console.error(`Not a directory: ${absSrc}`);
    process.exit(1);
  }

  const files = await collectFiles(absSrc);
  if (files.length === 0) {
    console.error(`No files under ${absSrc}`);
    process.exit(1);
  }

  const out = createWriteStream(dest);
  const central = [];
  let offset = 0;

  const write = (chunk) =>
    new Promise((resolve, reject) => {
      out.write(chunk, (err) => (err ? reject(err) : resolve()));
    });

  for (const { full, rel } of files) {
    const data = await readFile(full);
    const name = Buffer.from(rel, "utf8");
    const c = crc32(data);
    const local = Buffer.concat([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(c),
      u32(data.length),
      u32(data.length),
      u16(name.length),
      u16(0),
      name,
      data,
    ]);
    await write(local);
    central.push({ rel, c, size: data.length, offset });
    offset += local.length;
  }

  const centralStart = offset;
  let centralSize = 0;
  for (const { rel, c, size, offset: off } of central) {
    const name = Buffer.from(rel, "utf8");
    const header = Buffer.concat([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(c),
      u32(size),
      u32(size),
      u16(name.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(off),
      name,
    ]);
    await write(header);
    centralSize += header.length;
  }

  const end = Buffer.concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(central.length),
    u16(central.length),
    u32(centralSize),
    u32(centralStart),
    u16(0),
  ]);
  await write(end);
  await new Promise((resolve, reject) => out.end((err) => (err ? reject(err) : resolve())));

  console.log(`Wrote ${dest} (${files.length} files)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
