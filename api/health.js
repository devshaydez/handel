import { handleHandelApi } from "../../lib/handel-api.js";

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "OPTIONS") {
    res.statusCode = 405;
    res.setHeader("allow", "GET, OPTIONS");
    res.end();
    return;
  }
  await handleHandelApi(req, res, "/health");
}
