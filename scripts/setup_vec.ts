import { mkdir, readdir, rename } from "node:fs/promises";
import { join } from "node:path";
import { $ } from "bun";

// Try v0.1.5 if v0.1.6 is problematic, or just try v0.1.6 again with curl
// I will check the exact filename for v0.1.6 if my previous guess was wrong.
// Based on typical releases: sqlite-vec-v0.1.6-loadable-macos-aarch64.tar.gz

const VERSION = "v0.1.5";
const ASSET_NAME = `sqlite-vec-${VERSION}-loadable-macos-aarch64.tar.gz`;
const URL = `https://github.com/asg017/sqlite-vec/releases/download/${VERSION}/${ASSET_NAME}`;
const OUTPUT_DIR = join(process.cwd(), "lib");

console.log(`Downloading ${ASSET_NAME} from ${URL}...`);

try {
  await mkdir(OUTPUT_DIR, { recursive: true });

  // -L follow redirects
  // -f fail silently on server errors (so we don't save a 404 html page)
  await $`curl -L -f -o ${join(OUTPUT_DIR, ASSET_NAME)} ${URL}`;
  console.log("Download complete. Extracting...");

  await $`tar -xzf ${join(OUTPUT_DIR, ASSET_NAME)} -C ${OUTPUT_DIR}`;

  // Find the dylib and rename/ensure it is vec0.dylib for simplicity
  // The tar usually contains a file like 'vec0.dylib' or 'sqlite-vec.dylib'.
  // Let's list and rename.
  const files = await readdir(OUTPUT_DIR);
  const dylib = files.find((f) => f.endsWith(".dylib") || f.endsWith(".so"));
  if (dylib) {
    console.log(`Found extension binary: ${dylib}`);
    await rename(join(OUTPUT_DIR, dylib), join(OUTPUT_DIR, "vec0.dylib"));
    console.log("Renamed to vec0.dylib");
  } else {
    console.error("No .dylib or .so found in extracted archive!");
  }

  // Clean up tar
  await $`rm ${join(OUTPUT_DIR, ASSET_NAME)}`;
} catch (error) {
  console.error(
    "Failed to setup sqlite-vec. If 404, check version/filename.",
    error
  );
  process.exit(1);
}
