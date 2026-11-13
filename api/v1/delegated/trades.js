import { handleHandelApi } from "../../../lib/handel-api.js";

export const config = { api: { bodyParser: false } };

// Keep the delegated bearer token exclusively in the server environment.
export default async function handler(req, res) {
  if (req.method !== "POST" && req.method !== "OPTIONS") {
    res.statusCode = 405;
    res.setHeader("allow", "POST, OPTIONS");
    res.end();
    return;
  }
  if (process.env.HANDEL_AGENT_API_TOKEN) {
    req.headers = { ...req.headers, authorization: "Bearer " + process.env.HANDEL_AGENT_API_TOKEN };
  }
  await handleHandelApi(req, res, "/v1/delegated/trades");
}
