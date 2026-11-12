import { handleHandelApi } from "../../../lib/handel-api.js";

export default async function handler(req, res) {
  await handleHandelApi(req, res, "/v1/advisory/proposals");
}
