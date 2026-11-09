// Copies shipped files into dist/site (GitHub Pages) and dist/extension (zip for Releases).
import { cp, rm, mkdir, access } from "node:fs/promises"
import { dirname, join } from "node:path"
import { SHARED, SITE_ONLY, EXTENSION_ONLY, EXTENSION_EXCLUDE } from "./files.mjs"

const exists = (p) => access(p).then(() => true, () => false)

async function copyAll(list, outDir, { required = true } = {}) {
  for (const rel of list) {
    if (!(await exists(rel))) {
      if (required) throw new Error(`Missing shipped file: ${rel}`)
      continue
    }
    await mkdir(dirname(join(outDir, rel)), { recursive: true })
    await cp(rel, join(outDir, rel), { recursive: true })
  }
}

await rm("dist", { recursive: true, force: true })
await copyAll([...SHARED, ...SITE_ONLY], "dist/site")
await copyAll([...SHARED, ...EXTENSION_ONLY], "dist/extension")
for (const rel of EXTENSION_EXCLUDE) await rm(join("dist/extension", rel), { force: true })
console.log("Packaged dist/site and dist/extension")
