export default {
  async fetch(request, env) {
    try {
      return await env.ASSETS.fetch(request);
    } catch {
      // Preserve the existing public error boundary without disclosing details.
      return new Response(JSON.stringify({ error: "internal_error" }), {
        status: 500,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    }
  },
};
