import { onRequestPost } from "./functions/api/generate.js";

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/generate") {
      if (request.method !== "POST") {
        return json({ error: "Method not allowed." }, 405);
      }

      return onRequestPost({ request });
    }

    return env.ASSETS.fetch(request);
  },
};
