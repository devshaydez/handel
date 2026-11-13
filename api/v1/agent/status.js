import { getDelegatedAgentStatus } from "../../../lib/delegated-agent.js";

export default async function handler(req, res) {
  res.setHeader("cache-control", "no-store");
  res.setHeader("content-type", "application/json; charset=utf-8");
  if (req.method !== "GET") {
    res.setHeader("allow", "GET");
    res.statusCode = 405;
    res.end(JSON.stringify({ error: "method_not_allowed" }));
    return;
  }
  try {
    const status = await getDelegatedAgentStatus();
    res.statusCode = 200;
    res.end(JSON.stringify(status));
  } catch (error) {
    res.statusCode = 503;
    res.end(JSON.stringify({
      network: "testnet",
      keyScopeVerified: false,
      error: error instanceof Error ? error.message : "Testnet agent preflight failed",
    }));
  }
}
