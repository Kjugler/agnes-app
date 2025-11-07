/**
 * GET /api/ok
 * Micro health check endpoint for ngrok pre-handoff validation
 * Returns minimal JSON response for fast parsing
 */
export async function GET() {
  return Response.json(
    { ok: true, ts: Date.now(), app: 'agnes-next' },
    { status: 200 }
  );
}

