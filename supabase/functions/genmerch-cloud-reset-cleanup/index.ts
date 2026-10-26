import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://shopgenmerch.com",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed." }, 405);

  const authorization = req.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) return json({ ok: false, error: "Admin sign-in is required." }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const publishableKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SECRET_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !publishableKey || !serviceRoleKey) {
    return json({ ok: false, error: "Required server environment is missing. No files were removed." }, 500);
  }

  const jwt = authorization.slice("Bearer ".length);
  const userClient = createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: "Bearer " + jwt } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  const user = userData?.user;
  const allowedEmails = ["jelsonroqueza@gmail.com", "negosyonipinoy@gmail.com"];
  const isAllowedAdmin = Boolean(
    user &&
    user.app_metadata?.role === "admin" &&
    allowedEmails.includes(String(user.email || "").toLowerCase())
  );
  if (userError || !isAllowedAdmin) return json({ ok: false, error: "Authorized GENMERCH administrator access is required." }, 403);

  let body: { confirm?: string };
  try { body = await req.json(); } catch { return json({ ok: false, error: "Invalid request body." }, 400); }
  if (body?.confirm !== "CLEAN_ORPHANED_FILES") {
    return json({ ok: false, error: "Explicit cloud-file cleanup confirmation is required." }, 400);
  }

  const [productsResult, reviewsResult] = await Promise.all([
    userClient.from("products").select("id", { count: "exact", head: true }),
    userClient.from("product_reviews").select("id", { count: "exact", head: true }),
  ]);
  if (productsResult.error || reviewsResult.error) {
    console.error("Cloud cleanup safety check failed", {
      productsError: productsResult.error?.message || null,
      reviewsError: reviewsResult.error?.message || null,
    });
    return json({
      ok: false,
      error: "Could not verify the empty catalog/reviews using the admin session. No files were removed.",
      diagnostics: {
        products: productsResult.error?.message || null,
        reviews: reviewsResult.error?.message || null,
      },
    }, 500);
  }
  if ((productsResult.count || 0) !== 0 || (reviewsResult.count || 0) !== 0) {
    return json({
      ok: false,
      error: "Safety lock: cleanup stopped because product or review records exist. No files were removed.",
      productCount: productsResult.count || 0,
      reviewCount: reviewsResult.count || 0,
    }, 409);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  async function listFilesRecursively(bucket: string, prefix = ""): Promise<string[]> {
    const paths: string[] = [];
    let offset = 0;
    const limit = 1000;
    while (true) {
      const { data, error } = await admin.storage.from(bucket).list(prefix, {
        limit,
        offset,
        sortBy: { column: "name", order: "asc" },
      });
      if (error) throw new Error(bucket + " list failed: " + error.message);
      const entries = data || [];
      for (const entry of entries) {
        const path = prefix ? prefix + "/" + entry.name : entry.name;
        if (entry.id == null) paths.push(...await listFilesRecursively(bucket, path));
        else paths.push(path);
      }
      if (entries.length < limit) break;
      offset += entries.length;
    }
    return paths;
  }

  const results: Record<string, unknown> = {};
  for (const bucket of ["product-images", "genmerch-review-photos"]) {
    try {
      const paths = await listFilesRecursively(bucket);
      let removedCount = 0;
      const errors: string[] = [];
      for (let i = 0; i < paths.length; i += 100) {
        const { data, error } = await admin.storage.from(bucket).remove(paths.slice(i, i + 100));
        if (error) errors.push(error.message);
        else removedCount += (data || []).length;
      }
      results[bucket] = { found: paths.length, removed: removedCount, errors };
    } catch (error) {
      results[bucket] = { found: null, removed: 0, errors: [error instanceof Error ? error.message : String(error)] };
    }
  }

  const allClean = Object.values(results).every((entry: any) => entry && Array.isArray(entry.errors) && entry.errors.length === 0 && entry.found === entry.removed);
  return json({ ok: allClean, results, completedAt: new Date().toISOString() }, allClean ? 200 : 500);
});
