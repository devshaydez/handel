import { handleHandelApi } from "../../../lib/handel-api.js";

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== "POST" && req.method !== "OPTIONS") {
    res.statusCode = 405;
    res.setHeader("allow", "POST, OPTIONS");
    res.end();
    return;
  }
  await handleHandelApi(req, res, "/v1/delegated/trades");
}
