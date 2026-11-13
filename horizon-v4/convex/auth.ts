{
  "file": {
    "path": "convex/auth.ts",
    "content": "import { convexAuth } from \"@convex-dev/auth/server\"\nimport { ResendOTP } from \"./ResendOTP\"\nimport { MacalyGoogle } from \"./MacalyGoogle\"\nimport { HorizonPassword } from \"./HorizonPassword\"\nimport { HorizonPhone } from \"./HorizonPhone\"\nimport { createProviderUser } from \"./authUsers\"\n\nexport const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({\n  providers: [ResendOTP, MacalyGoogle, HorizonPassword, HorizonPhone],\n  callbacks: { createOrUpdateUser: createProviderUser },\n  // Explicit finite session length (30 days maximum).\n  session: { totalDurationMs: 1000 * 60 * 60 * 24 * 30 },\n})\n",
    "totalLines": 13
  }
}