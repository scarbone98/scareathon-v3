import fs from "node:fs";
import crypto from "node:crypto";
import zlib from "node:zlib";
import { createClient } from "@supabase/supabase-js";

loadEnvFile(".env");
loadEnvFile("server/.env");

const SIZE = 256;
const avatarSpriteBucket = process.env.AVATAR_SPRITE_BUCKET || "avatar-sprites";
const avatarCompositeBucket =
  process.env.AVATAR_COMPOSITE_BUCKET || "avatar-composites";
const supabaseUrl =
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  (process.env.SUPABASE_PROJECT_REF
    ? `https://${process.env.SUPABASE_PROJECT_REF}.supabase.co`
    : "");
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
const supabaseAnonKey =
  process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabaseJwtSecret = process.env.SUPABASE_JWT_SECRET;

const options = parseOptions(process.argv.slice(2));

function parseOptions(args) {
  const parsed = {
    dryRun: false,
    force: false,
    limit: Infinity,
    userId: "",
  };

  for (const arg of args) {
    if (arg === "--dry-run") parsed.dryRun = true;
    if (arg === "--force") parsed.force = true;
    if (arg.startsWith("--limit=")) parsed.limit = Number(arg.slice("--limit=".length));
    if (arg.startsWith("--user-id=")) parsed.userId = arg.slice("--user-id=".length);
  }

  return parsed;
}

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;

  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || process.env[match[1]] !== undefined) continue;

    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

function base64url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function signSupabaseUserJwt(userId) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({
      aud: "authenticated",
      exp: now + 5 * 60,
      iat: now,
      role: "authenticated",
      sub: userId,
    })
  );
  const signature = crypto
    .createHmac("sha256", supabaseJwtSecret)
    .update(`${header}.${payload}`)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  return `${header}.${payload}.${signature}`;
}

function makeCanvas(width = SIZE, height = SIZE) {
  return {
    width,
    height,
    pixels: new Uint8ClampedArray(width * height * 4),
  };
}

function readUInt32(buffer, offset) {
  return buffer.readUInt32BE(offset);
}

function paethPredictor(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function decodePng(input) {
  const buffer = Buffer.from(input);
  const signature = buffer.subarray(0, 8);
  if (!signature.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    throw new Error("Invalid PNG signature");
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  const idatChunks = [];

  while (offset < buffer.length) {
    const length = readUInt32(buffer, offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;

    if (type === "IHDR") {
      width = readUInt32(data, 0);
      height = readUInt32(data, 4);
      const bitDepth = data[8];
      colorType = data[9];
      const compression = data[10];
      const filter = data[11];
      const interlace = data[12];
      if (
        bitDepth !== 8 ||
        colorType !== 6 ||
        compression !== 0 ||
        filter !== 0 ||
        interlace !== 0
      ) {
        throw new Error("Only non-interlaced 8-bit RGBA PNGs are supported");
      }
    }

    if (type === "IDAT") idatChunks.push(data);
    if (type === "IEND") break;
  }

  if (!width || !height || colorType !== 6) {
    throw new Error("PNG is missing a valid IHDR");
  }

  const bytesPerPixel = 4;
  const stride = width * bytesPerPixel;
  const inflated = zlib.inflateSync(Buffer.concat(idatChunks));
  const pixels = new Uint8ClampedArray(width * height * 4);
  const previous = Buffer.alloc(stride);
  const current = Buffer.alloc(stride);
  let inputOffset = 0;

  for (let y = 0; y < height; y++) {
    const filterType = inflated[inputOffset++];
    for (let x = 0; x < stride; x++) {
      const raw = inflated[inputOffset++];
      const left = x >= bytesPerPixel ? current[x - bytesPerPixel] : 0;
      const up = previous[x];
      const upLeft = x >= bytesPerPixel ? previous[x - bytesPerPixel] : 0;

      if (filterType === 0) current[x] = raw;
      else if (filterType === 1) current[x] = (raw + left) & 255;
      else if (filterType === 2) current[x] = (raw + up) & 255;
      else if (filterType === 3) current[x] = (raw + Math.floor((left + up) / 2)) & 255;
      else if (filterType === 4) current[x] = (raw + paethPredictor(left, up, upLeft)) & 255;
      else throw new Error(`Unsupported PNG filter type: ${filterType}`);
    }

    pixels.set(current, y * stride);
    previous.set(current);
  }

  return { width, height, pixels };
}

function alphaOver(target, source) {
  for (let y = 0; y < SIZE; y++) {
    const sy = Math.floor((y * source.height) / SIZE);
    for (let x = 0; x < SIZE; x++) {
      const sx = Math.floor((x * source.width) / SIZE);
      const si = (sy * source.width + sx) * 4;
      const di = (y * SIZE + x) * 4;
      const alpha = source.pixels[si + 3] / 255;
      if (alpha <= 0) continue;

      const inverseAlpha = 1 - alpha;
      target.pixels[di] = Math.round(
        source.pixels[si] * alpha + target.pixels[di] * inverseAlpha
      );
      target.pixels[di + 1] = Math.round(
        source.pixels[si + 1] * alpha + target.pixels[di + 1] * inverseAlpha
      );
      target.pixels[di + 2] = Math.round(
        source.pixels[si + 2] * alpha + target.pixels[di + 2] * inverseAlpha
      );
      target.pixels[di + 3] = Math.round(
        source.pixels[si + 3] + target.pixels[di + 3] * inverseAlpha
      );
    }
  }
}

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePng(canvas) {
  const raw = Buffer.alloc((canvas.width * 4 + 1) * canvas.height);
  for (let y = 0; y < canvas.height; y++) {
    const rowStart = y * (canvas.width * 4 + 1);
    raw[rowStart] = 0;
    for (let x = 0; x < canvas.width; x++) {
      const si = (y * canvas.width + x) * 4;
      const di = rowStart + 1 + x * 4;
      raw[di] = canvas.pixels[si];
      raw[di + 1] = canvas.pixels[si + 1];
      raw[di + 2] = canvas.pixels[si + 2];
      raw[di + 3] = canvas.pixels[si + 3];
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(canvas.width, 0);
  ihdr.writeUInt32BE(canvas.height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function normalizeStoragePath(assetPath) {
  return assetPath.replace(/^\/+/, "").replace(/^avatar\//, "");
}

async function downloadLayer(supabase, assetPath) {
  if (/^https?:\/\//.test(assetPath)) {
    const response = await fetch(assetPath);
    if (!response.ok) {
      throw new Error(`Unable to download ${assetPath}: ${response.status}`);
    }
    return Buffer.from(await response.arrayBuffer());
  }

  const { data, error } = await supabase.storage
    .from(avatarSpriteBucket)
    .download(normalizeStoragePath(assetPath));

  if (error) {
    throw new Error(`Unable to download ${assetPath}: ${error.message}`);
  }

  return Buffer.from(await data.arrayBuffer());
}

async function avatarCompositeAlreadyExists(supabase, userId) {
  const { error } = await supabase.storage
    .from(avatarCompositeBucket)
    .download(`${userId}.png`);

  return !error;
}

async function ensureCompositeBucket(supabase) {
  if (!supabaseServiceKey) return;

  const { data: bucket, error: getError } =
    await supabase.storage.getBucket(avatarCompositeBucket);

  if (getError) {
    const { error: createError } = await supabase.storage.createBucket(
      avatarCompositeBucket,
      {
        public: true,
        allowedMimeTypes: ["image/png"],
        fileSizeLimit: 1024 * 1024,
      }
    );
    if (createError) {
      throw new Error(
        `Unable to create storage bucket "${avatarCompositeBucket}": ${createError.message}`
      );
    }
    return;
  }

  if (!bucket.public) {
    const { error: updateError } = await supabase.storage.updateBucket(
      avatarCompositeBucket,
      {
        public: true,
        allowedMimeTypes: ["image/png"],
        fileSizeLimit: 1024 * 1024,
      }
    );
    if (updateError) {
      throw new Error(
        `Unable to make storage bucket "${avatarCompositeBucket}" public: ${updateError.message}`
      );
    }
  }
}

async function selectAllUsers(supabase) {
  if (options.userId) return [{ id: options.userId }];

  const users = [];
  const pageSize = 1000;
  for (let from = 0; users.length < options.limit; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from("users")
      .select("id")
      .order("id", { ascending: true })
      .range(from, to);

    if (error) throw new Error(`Unable to fetch users: ${error.message}`);
    if (!data?.length) break;
    users.push(...data);
    if (data.length < pageSize) break;
  }

  return users.slice(0, options.limit);
}

async function getEquippedLayers(supabase, userId) {
  if (!options.dryRun) {
    const { error: seedError } = await supabase.rpc("seed_user_avatar_defaults", {
      target_user_id: userId,
    });
    if (seedError) {
      throw new Error(`Unable to seed avatar defaults for ${userId}: ${seedError.message}`);
    }
  }

  const { data, error } = await supabase
    .from("user_avatar")
    .select(
      `
        item_instance_id,
        avatar_items (
          id,
          item_key,
          name,
          slot,
          layer_order,
          asset_path
        )
      `
    )
    .eq("user_id", userId);

  if (error) {
    throw new Error(`Unable to fetch avatar for ${userId}: ${error.message}`);
  }

  return (data || [])
    .map((row) => row.avatar_items)
    .filter(Boolean)
    .sort((a, b) => a.layer_order - b.layer_order || a.id - b.id);
}

async function createComposite(supabase, layers, layerCache) {
  const canvas = makeCanvas();

  for (const layer of layers) {
    if (!layer.asset_path) continue;
    let decoded = layerCache.get(layer.asset_path);
    if (!decoded) {
      decoded = decodePng(await downloadLayer(supabase, layer.asset_path));
      layerCache.set(layer.asset_path, decoded);
    }
    alphaOver(canvas, decoded);
  }

  return encodePng(canvas);
}

async function run() {
  if (!supabaseUrl) {
    throw new Error("Missing SUPABASE_URL, VITE_SUPABASE_URL, or SUPABASE_PROJECT_REF.");
  }
  if (!supabaseServiceKey && !supabaseAnonKey) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY, SUPABASE_SERVICE_KEY, SUPABASE_ANON_KEY, or VITE_SUPABASE_ANON_KEY."
    );
  }
  if (!supabaseServiceKey && !supabaseJwtSecret) {
    throw new Error(
      "Missing SUPABASE_JWT_SECRET. It is required when no service-role key is available."
    );
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey || supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  await ensureCompositeBucket(supabase);

  const users = await selectAllUsers(supabase);
  const layerCache = new Map();
  let uploaded = 0;
  let skipped = 0;

  for (const user of users) {
    if (!options.force && (await avatarCompositeAlreadyExists(supabase, user.id))) {
      skipped += 1;
      console.log(`Skipped ${user.id}; composite already exists.`);
      continue;
    }

    const layers = await getEquippedLayers(supabase, user.id);
    if (!layers.length) {
      skipped += 1;
      console.log(`Skipped ${user.id}; no equipped avatar layers.`);
      continue;
    }

    if (options.dryRun) {
      console.log(`Would upload ${avatarCompositeBucket}/${user.id}.png`);
      continue;
    }

    const file = await createComposite(supabase, layers, layerCache);
    const uploadClient = supabaseServiceKey
      ? supabase
      : createClient(supabaseUrl, supabaseAnonKey, {
          auth: {
            autoRefreshToken: false,
            persistSession: false,
          },
          global: {
            headers: {
              Authorization: `Bearer ${signSupabaseUserJwt(user.id)}`,
            },
          },
        });

    const { error } = await uploadClient.storage
      .from(avatarCompositeBucket)
      .upload(`${user.id}.png`, file, {
        cacheControl: "60",
        contentType: "image/png",
        upsert: true,
      });

    if (error) {
      throw new Error(`Unable to upload composite for ${user.id}: ${error.message}`);
    }

    uploaded += 1;
    console.log(`Uploaded ${avatarCompositeBucket}/${user.id}.png`);
  }

  console.log(`Done. Uploaded ${uploaded}; skipped ${skipped}.`);
}

run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
