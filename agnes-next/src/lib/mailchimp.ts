// Server-only Mailchimp helpers for Next.js App Router
import crypto from "crypto";

const API_KEY = process.env.MAILCHIMP_API_KEY!;
const DC = process.env.MAILCHIMP_SERVER_PREFIX!;
const LIST_ID = process.env.MAILCHIMP_AUDIENCE_ID || process.env.MAILCHIMP_LIST_ID;

if (!API_KEY || !DC || !LIST_ID) {
  // Don't crash import; throw when used so server can still boot
  console.warn("[MC] Missing env: MAILCHIMP_API_KEY / MAILCHIMP_SERVER_PREFIX / MAILCHIMP_AUDIENCE_ID");
}

const BASE = `https://${DC}.api.mailchimp.com/3.0`;

function authHeaders() {
  const token = Buffer.from(`anystring:${API_KEY}`).toString("base64");
  return { Authorization: `Basic ${token}`, "Content-Type": "application/json" };
}

export function memberHash(email: string) {
  return crypto.createHash("md5").update(email.trim().toLowerCase()).digest("hex");
}

export async function upsertContact(
  email: string,
  merge_fields: Record<string, any>
) {
  if (!API_KEY || !DC || !LIST_ID) throw new Error("MAILCHIMP_ENV_MISSING");
  const hash = memberHash(email);
  const body = {
    email_address: email,
    status_if_new: "subscribed",
    merge_fields,
  };
  const res = await fetch(`${BASE}/lists/${LIST_ID}/members/${hash}`, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`MC_UPSERT_${res.status}: ${await res.text()}`);
  return res.json();
}

export async function addTags(email: string, tags: string[]) {
  if (!API_KEY || !DC || !LIST_ID) throw new Error("MAILCHIMP_ENV_MISSING");
  if (!tags?.length) return;
  const hash = memberHash(email);
  const body = { tags: tags.map((name) => ({ name, status: "active" as const })) };
  const res = await fetch(`${BASE}/lists/${LIST_ID}/members/${hash}/tags`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`MC_TAGS_${res.status}: ${await res.text()}`);
  return res.json();
}

export async function sendEvent(email: string, name: string, properties?: Record<string, any>) {
  if (!API_KEY || !DC || !LIST_ID) throw new Error("MAILCHIMP_ENV_MISSING");
  const hash = memberHash(email);
  const res = await fetch(`${BASE}/lists/${LIST_ID}/members/${hash}/events`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ name, properties }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`MC_EVENT_${res.status}: ${await res.text()}`);
  return res.json();
}
