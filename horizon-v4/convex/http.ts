{
  "file": {
    "path": "convex/http.ts",
    "content": "import { httpRouter } from \"convex/server\"\nimport { internal } from \"./_generated/api\"\nimport { httpAction } from \"./_generated/server\"\nimport { auth } from \"./auth\"\n\nconst http = httpRouter()\n\nauth.addHttpRoutes(http)\n\nhttp.route({\n  path: \"/stripe/webhook\",\n  method: \"POST\",\n  handler: httpAction(async (ctx, req) => {\n    const signature = req.headers.get(\"stripe-signature\")\n    if (!signature) {\n      return new Response(JSON.stringify({ received: false }), { status: 400 })\n    }\n    const mode = req.headers.get(\"x-stripe-mode\") === \"live\" ? \"live\" : \"test\"\n    const payload = await req.text()\n    const result = await ctx.runAction(internal.stripe.handleWebhook, {\n      payload,\n      signature,\n      mode,\n    })\n    return new Response(JSON.stringify({ received: result.success }), {\n      status: result.success ? 200 : 400,\n    })\n  }),\n})\n\nexport default http\n",
    "totalLines": 31
  }
}