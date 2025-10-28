console.log("🟢 Booting DEV API… (hard override active)");
const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

// health
app.get("/ping", (req, res) => res.send("pong"));

// ✅ always succeed here (temporary, to prove the path works)
app.post("/api/subscribe", (req, res) => {
  console.log("🔥 DEV HIT /api/subscribe", req.body);
  res.json({ ok: true, status: "dev", message: "Access Granted! (dev mode)" });
});

// keep checkout available (best effort)
try {
  const checkoutHandler = require("../api/create-checkout-session.cjs");
  app.post("/api/create-checkout-session", checkoutHandler);
  console.log("✅ Mounted /api/create-checkout-session");
} catch (e) {
  console.warn("⚠️ Checkout route skipped:", e?.message || e);
}

const PORT = 5088;
app.listen(PORT, () => {
  console.log(`🚀 DEV server running on http://localhost:${PORT}`);
});
