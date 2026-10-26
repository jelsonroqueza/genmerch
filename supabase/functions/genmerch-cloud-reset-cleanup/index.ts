function json(body: unknown, status = 410) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Access-Control-Allow-Origin": "https://shopgenmerch.com",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

Deno.serve((req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", {
    headers: {
      "Access-Control-Allow-Origin": "https://shopgenmerch.com",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    },
  });
  // One-time cleanup successfully completed on 2026-10-26.
  // This endpoint is intentionally disarmed so it cannot be used to delete future production uploads.
  return json({
    ok: false,
    completed: true,
    error: "The one-time cloud cleanup is already complete. No files were changed.",
  }, 410);
});
