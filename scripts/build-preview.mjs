import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const expectedBranch = "feature/mobile-header-ux-20261101";
const expectedProjectRef = "jxinfdlkqaqgbbwxojwo";
const productionRef = "csbaxyzfcaxhyyzxfxjw";
const fail = (message) => { throw new Error(`GENMERCH Preview safety check failed: ${message}`); };

if (process.env.VERCEL_ENV !== "preview") fail("deployment target must be Preview.");
if (process.env.VERCEL_GIT_COMMIT_REF !== expectedBranch) fail("only the approved redesign branch may build.");
if (Object.keys(process.env).some((name) => name.includes("SERVICE_ROLE") || name.includes("SECRET_KEY"))) {
  fail("service-role or secret credentials must not be present in the build environment.");
}

const supabaseUrl = process.env.GENMERCH_SUPABASE_URL;
const publishableKey = process.env.GENMERCH_SUPABASE_PUBLISHABLE_KEY;
let parsedUrl;
try { parsedUrl = new URL(supabaseUrl); } catch { fail("GENMERCH_SUPABASE_URL must be a valid staging URL."); }
if (parsedUrl.protocol !== "https:" || parsedUrl.hostname !== `${expectedProjectRef}.supabase.co`) {
  fail("Supabase URL must point exclusively to the approved staging project.");
}
if (typeof publishableKey !== "string" || !publishableKey.startsWith("sb_publishable_") || publishableKey.length < 30) {
  fail("an active public publishable key is required; service-role keys are forbidden.");
}

const root = process.cwd();
const output = path.join(root, "dist");
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
const excludedAtRoot = new Set([
  ".git", ".github", ".deployment-trigger", "supabase", "docs",
  "node_modules", "dist", "scripts", "CNAME", "README.md",
  "cloud-cleanup-once.html", "vercel.json"
]);

async function copyRuntimeTree(from, to, relative = "") {
  for (const entry of await readdir(from, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    if (!relative && excludedAtRoot.has(entry.name)) continue;
    const source = path.join(from, entry.name);
    const destination = path.join(to, entry.name);
    if (entry.isDirectory()) {
      await mkdir(destination, { recursive: true });
      await copyRuntimeTree(source, destination, path.join(relative, entry.name));
    } else if (entry.isFile()) {
      await cp(source, destination);
    }
  }
}

await copyRuntimeTree(root, output);
const indexPath = path.join(output, "index.html");
let html = await readFile(indexPath, "utf8");
const urlPlaceholder = "const GENMERCH_SUPABASE_URL = '__GENMERCH_SUPABASE_URL__';";
const keyPlaceholder = "const GENMERCH_SUPABASE_PUBLISHABLE_KEY = '__GENMERCH_SUPABASE_PUBLISHABLE_KEY__';";
if (!html.includes(urlPlaceholder) || !html.includes(keyPlaceholder)) fail("staging placeholders are missing.");
html = html.replace(urlPlaceholder, `const GENMERCH_SUPABASE_URL = ${JSON.stringify(supabaseUrl)};`);
html = html.replace(keyPlaceholder, `const GENMERCH_SUPABASE_PUBLISHABLE_KEY = ${JSON.stringify(publishableKey)};`);
if (html.includes(productionRef) || html.includes("https://" + productionRef + ".supabase.co")) {
  fail("production Supabase reference remains in the browser application.");
}
if (!html.includes('<meta name="robots"')) {
  html = html.replace("<head>", '<head>\n  <meta name="robots" content="noindex,nofollow">');
}
await writeFile(indexPath, html, "utf8");
await writeFile(path.join(output, "robots.txt"), "User-agent: *\nDisallow: /\n", "utf8");

async function assertNoProductionReference(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const filePath = path.join(dir, entry.name);
    if (entry.isDirectory()) await assertNoProductionReference(filePath);
    else if (entry.isFile()) {
      const bytes = await readFile(filePath);
      if (bytes.includes(Buffer.from(productionRef))) fail(`production Supabase reference found in ${path.relative(output, filePath)}.`);
    }
  }
}
await assertNoProductionReference(output);
console.log("GENMERCH isolated Preview build passed; browser output targets staging only.");
