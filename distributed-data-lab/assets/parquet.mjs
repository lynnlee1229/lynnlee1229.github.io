/* Original compact-protocol metadata reader. Format definitions: Apache parquet.thrift.
 * Footer inspection only: no page decode, no SQL, no upload. MIT. */
const td = new TextDecoder();
class Compact {
  constructor(bytes) {
    this.b = bytes;
    this.p = 0;
    this.items = 0;
  }
  byte() {
    if (this.p >= this.b.length) throw Error("Truncated Compact metadata");
    return this.b[this.p++];
  }
  varint() {
    let n = 0n;
    for (let s = 0n; s < 70n; s += 7n) {
      const b = this.byte();
      n |= BigInt(b & 127) << s;
      if (!(b & 128)) return n;
    }
    throw Error("Invalid varint");
  }
  int() {
    const x = this.varint();
    const n = (x >> 1n) ^ -(x & 1n);
    return n <= BigInt(Number.MAX_SAFE_INTEGER) &&
      n >= BigInt(Number.MIN_SAFE_INTEGER)
      ? Number(n)
      : n;
  }
  count() {
    let n = Number(this.varint());
    if (!Number.isSafeInteger(n) || n > 1000000 || n < 0)
      throw Error("Metadata collection too large");
    return n;
  }
  value(t, depth = 0, inCollection = false) {
    if (depth > 64 || ++this.items > 2000000)
      throw Error("Metadata complexity limit");
    if (t === 1 || t === 2) {
      if (inCollection) {
        const b = this.byte();
        if (b !== 1 && b !== 2) throw Error("Invalid bool");
        return b === 1;
      }
      return t === 1;
    }
    if (t === 3) {
      const b = this.byte();
      return b > 127 ? b - 256 : b;
    }
    if (t === 4 || t === 5 || t === 6) return this.int();
    if (t === 7) {
      if (this.p + 8 > this.b.length) throw Error("Truncated double");
      const n = new DataView(
        this.b.buffer,
        this.b.byteOffset + this.p,
        8,
      ).getFloat64(0, true);
      this.p += 8;
      return n;
    }
    if (t === 8) {
      const n = this.count();
      if (this.p + n > this.b.length) throw Error("Truncated binary");
      const x = this.b.slice(this.p, this.p + n);
      this.p += n;
      return x;
    }
    if (t === 9 || t === 10) {
      const h = this.byte();
      const n = h >> 4 === 15 ? this.count() : h >> 4;
      const type = h & 15;
      if (n > 1000000) throw Error("List too large");
      return Array.from({ length: n }, () => this.value(type, depth + 1, true));
    }
    if (t === 11) {
      const n = this.count();
      if (!n) return [];
      const h = this.byte();
      return Array.from({ length: n }, () => [
        this.value(h >> 4, depth + 1, true),
        this.value(h & 15, depth + 1, true),
      ]);
    }
    if (t === 12) {
      let prev = 0;
      const out = Object.create(null);
      while (true) {
        const h = this.byte();
        if (h === 0) break;
        const delta = h >> 4;
        const id = delta ? prev + delta : this.int();
        if (typeof id !== "number" || id <= 0) throw Error("Invalid field");
        prev = id;
        out[id] = this.value(h & 15, depth + 1);
      }
      return out;
    }
    throw Error("Unsupported Compact type " + t);
  }
}
const types = [
  "BOOLEAN",
  "INT32",
  "INT64",
  "INT96",
  "FLOAT",
  "DOUBLE",
  "BYTE_ARRAY",
  "FIXED_LEN_BYTE_ARRAY",
];
const codecs = [
  "UNCOMPRESSED",
  "SNAPPY",
  "GZIP",
  "LZO",
  "BROTLI",
  "LZ4",
  "ZSTD",
  "LZ4_RAW",
];
const encodings = {
  0: "PLAIN",
  2: "PLAIN_DICTIONARY",
  3: "RLE",
  4: "BIT_PACKED",
  5: "DELTA_BINARY_PACKED",
  6: "DELTA_LENGTH_BYTE_ARRAY",
  7: "DELTA_BYTE_ARRAY",
  8: "RLE_DICTIONARY",
  9: "BYTE_STREAM_SPLIT",
};
function scalar(bytes, type, schema) {
  if (!(bytes instanceof Uint8Array)) return null;
  const d = new DataView(bytes.buffer, bytes.byteOffset, bytes.length);
  try {
    if (type === 0 && bytes.length === 1) return !!bytes[0];
    if (type === 1 && bytes.length === 4)
      return schema?.[6] === 13 || schema?.[10]?.[10]?.[2] === false
        ? d.getUint32(0, true)
        : d.getInt32(0, true);
    if (type === 2 && bytes.length === 8) {
      const unsigned = schema?.[6] === 14 || schema?.[10]?.[10]?.[2] === false;
      return (
        unsigned ? d.getBigUint64(0, true) : d.getBigInt64(0, true)
      ).toString();
    }
    if (type === 4 && bytes.length === 4) return d.getFloat32(0, true);
    if (type === 5 && bytes.length === 8) return d.getFloat64(0, true);
    if (type === 6 && (schema?.[6] === 0 || schema?.[10]?.[1]))
      return td.decode(bytes);
  } catch {}
  return (
    "hex:" +
    Array.from(bytes.slice(0, 128), (b) =>
      b.toString(16).padStart(2, "0"),
    ).join("") +
    (bytes.length > 128 ? "…" : "")
  );
}
export function decodeFooter(bytes, fileBytes, footerBytes = bytes.length) {
  const reader = new Compact(bytes);
  const f = reader.value(12);
  if (!Array.isArray(f[2]) || !Array.isArray(f[4]))
    throw Error("Missing Parquet schema or row groups");
  // Derive full leaf paths, preserving nested-schema names and annotations.
  let index = 0;
  const leaves = new Map();
  function walk(parent = []) {
    const s = f[2][index++];
    if (!s) throw Error("Invalid schema tree");
    const path =
      index === 1 ? [] : [...parent, td.decode(s[4] || new Uint8Array())];
    if (s[5]) {
      for (let i = 0; i < s[5]; i++) walk(path);
    } else leaves.set(path.join("."), s);
  }
  walk();
  const groups = f[4].map((r, index) => ({
    index,
    rows: String(r[3]),
    columns: (r[1] || []).map((chunk) => {
      const c = chunk[3];
      if (!c) return { path: "encrypted / unavailable", unsupported: true };
      const path = (c[3] || []).map((x) => td.decode(x)).join(".");
      const s = c[12] || {};
      return {
        path,
        physical_type: types[c[1]] ?? c[1],
        codec: codecs[c[4]] ?? c[4],
        encodings: (c[2] || []).map((x) => encodings[x] ?? x),
        compressed_bytes: Number(c[7]),
        uncompressed_bytes: Number(c[6]),
        num_values: String(c[5]),
        null_count: s[3] === undefined ? null : String(s[3]),
        min: scalar(s[6] ?? s[2], c[1], leaves.get(path)),
        max: scalar(s[5] ?? s[1], c[1], leaves.get(path)),
        min_exact: s[8] ?? null,
        max_exact: s[7] ?? null,
        data_page_offset: String(c[9]),
        dictionary_page_offset: c[11] === undefined ? null : String(c[11]),
      };
    }),
  }));
  return {
    format_version: f[1],
    rows: String(f[3]),
    file_bytes: fileBytes,
    footer_bytes: footerBytes,
    row_groups: groups,
    columns: [...leaves].map(([path, s]) => ({
      path,
      physical_type: types[s[1]],
      converted_type: s[6] ?? null,
      logical_annotation_fields: s[10] ? Object.keys(s[10]) : [],
    })),
    scope:
      "Footer metadata only. No pages decoded. Raw physical statistics; decimals/timestamps may require logical interpretation. Metadata bounds are not proof of engine pruning. Encrypted column metadata, INT96 and exotic logical types are not decoded.",
  };
}
export async function inspectParquet(file) {
  if (file.size < 12) throw Error("Not a Parquet file (too short)");
  const header = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  const tail = new Uint8Array(await file.slice(-8).arrayBuffer());
  if (td.decode(header) !== "PAR1" || td.decode(tail.slice(4)) !== "PAR1")
    throw Error("Only standard unencrypted PAR1 footer files are supported");
  const n = new DataView(tail.buffer).getUint32(0, true);
  if (n < 1 || n > 16 * 1024 * 1024 || n > file.size - 12)
    throw Error("Invalid footer or footer exceeds 16 MiB safety limit");
  const bytes = new Uint8Array(
    await file.slice(file.size - 8 - n, file.size - 8).arrayBuffer(),
  );
  return decodeFooter(bytes, file.size, n);
}
export function candidateGroups(report, column, lo, hi) {
  if (!Number.isSafeInteger(lo) || !Number.isSafeInteger(hi) || lo > hi)
    throw Error("Use safe integer inclusive bounds with lower ≤ upper");
  const allowed = new Set(["INT32", "INT64"]);
  return report.row_groups.map((g) => {
    const c = g.columns.find((c) => c.path === column);
    if (!c || !allowed.has(c.physical_type) || c.min === null || c.max === null)
      return {
        index: g.index,
        candidate: true,
        reason: "unknown / unsupported statistics",
      };
    // BigInt avoids rounding INT64 footer bounds; bounds apply to raw physical integer values.
    const min = BigInt(c.min),
      max = BigInt(c.max);
    return {
      index: g.index,
      candidate: !(max < BigInt(lo) || min > BigInt(hi)),
      reason: "raw integer min/max overlap",
    };
  });
}
