import { getAuthUserId } from "@convex-dev/auth/server"
import { ConvexError, v } from "convex/values"
import type { Id } from "./_generated/dataModel"
import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server"
import { internal } from "./_generated/api"
import { callMacalyJson } from "./macaly"
import { completeAppFile, createAppFileDownloadUrl } from "./appFiles"

// The HORIZON assistant answers with the member's own data only: their ledger,
// their conversations and the public feed. Nothing is shared across accounts.

type Snapshot = {
  displayName: string
  horizonId: string
  ledger: {
    sales: number
    expenses: number
    debts: number
    debtsSettled: number
    balance: number
    recent: { type: string; label: string; amount: number }[]
    products: { name: string; stock: number; price: number; low: boolean }[]
    credits: { customer: string; remaining: number; dueDate: string; overdue: boolean }[]
    shops: string[]
  }
  messages: {
    unread: number
    recent: { direction: "sent" | "received"; from: string; preview: string }[]
  }
  news: { author: string; body: string }[]
}

export const snapshot = internalQuery({
  args: {},
  handler: async (ctx): Promise<Snapshot | null> => {
    const userId = await getAuthUserId(ctx)
    if (!userId) return null

    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique()

    const entries = await ctx.db
      .query("cahierEntries")
      .withIndex("by_owner", (q) => q.eq("ownerId", userId))
      .order("desc")
      .take(60)

    let sales = 0
    let expenses = 0
    let debts = 0
    let debtsSettled = 0
    for (const entry of entries) {
      if (entry.type === "sale") sales += entry.amount
      else if (entry.type === "expense") expenses += entry.amount
      else if (entry.settled) debtsSettled += entry.amount
      else debts += entry.amount
    }

    const sent = await ctx.db
      .query("messages")
      .withIndex("by_from", (q) => q.eq("fromId", userId))
      .collect()
    const received = await ctx.db
      .query("messages")
      .withIndex("by_to", (q) => q.eq("toId", userId))
      .collect()

    const names = new Map<string, string>()
    const resolveName = async (id: Id<"users">) => {
      const cached = names.get(id)
      if (cached) return cached
      const person = await ctx.db
        .query("profiles")
        .withIndex("by_user", (q) => q.eq("userId", id))
        .unique()
      const label = person ? `${person.displayName} (${person.handle}.HZ)` : "Membre"
      names.set(id, label)
      return label
    }

    const allMessages = [...sent, ...received]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 15)
    const recentMessages: Snapshot["messages"]["recent"] = []
    for (const message of allMessages) {
      const outgoing = message.fromId === userId
      recentMessages.push({
        direction: outgoing ? "sent" : "received",
        from: await resolveName(outgoing ? message.toId : message.fromId),
        preview:
          message.kind === "voice"
            ? "[message vocal]"
            : (message.body ?? "").slice(0, 200),
      })
    }

    const products = await ctx.db
      .query("products")
      .withIndex("by_owner", (q) => q.eq("ownerId", userId))
      .take(60)

    const creditDocs = await ctx.db
      .query("credits")
      .withIndex("by_owner", (q) => q.eq("ownerId", userId))
      .order("desc")
      .take(40)
    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)
    const creditRows: Snapshot["ledger"]["credits"] = []
    for (const credit of creditDocs) {
      const payments = await ctx.db
        .query("creditPayments")
        .withIndex("by_credit", (q) => q.eq("creditId", credit._id))
        .collect()
      const paid = payments.reduce((sum, row) => sum + row.amount, 0)
      const remaining = Math.max(0, credit.total - paid)
      if (remaining <= 0) continue
      creditRows.push({
        customer: credit.customerName,
        remaining,
        dueDate: new Date(credit.dueDate).toLocaleDateString("fr-FR"),
        overdue: credit.dueDate < startOfToday.getTime(),
      })
    }

    const shops = await ctx.db
      .query("shops")
      .withIndex("by_owner", (q) => q.eq("ownerId", userId))
      .take(20)

    const posts = await ctx.db
      .query("posts")
      .withIndex("by_createdAt")
      .order("desc")
      .take(10)
    const news: Snapshot["news"] = []
    for (const post of posts) {
      news.push({
        author: await resolveName(post.authorId),
        body: post.body.slice(0, 300),
      })
    }

    return {
      displayName: profile?.displayName ?? "Membre HORIZON",
      horizonId: profile ? `${profile.handle}.HZ` : "",
      ledger: {
        sales,
        expenses,
        debts,
        debtsSettled,
        balance: sales - expenses,
        recent: entries.slice(0, 12).map((entry) => ({
          type: entry.type,
          label: entry.label,
          amount: entry.amount,
        })),
        products: products.slice(0, 20).map((product) => ({
          name: product.name,
          stock: product.stock,
          price: product.price,
          low: product.stock <= product.minStock,
        })),
        credits: creditRows,
        shops: shops.map((shop) => shop.name),
      },
      messages: {
        unread: received.filter((m) => !m.readAt).length,
        recent: recentMessages,
      },
      news,
    }
  },
})

const HISTORY_ITEM = v.object({
  role: v.union(v.literal("user"), v.literal("assistant")),
  content: v.string(),
})

/** Loads the persisted conversation plus the long-term memory of one member. */
export const context = internalQuery({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx)
    if (!userId) return null

    const stored = await ctx.db
      .query("assistantMessages")
      .withIndex("by_owner", (q) => q.eq("ownerId", userId))
      .order("desc")
      .take(60)
    const history = stored
      .slice()
      .reverse()
      .map((row) => {
        const marker =
          row.kind === "image"
            ? "[photo envoyée]"
            : row.kind === "video"
              ? "[vidéo envoyée]"
              : row.kind === "audio"
                ? "[message vocal envoyé]"
                : ""
        // A transcribed voice note already carries its text: do not add a
        // second, redundant "[message vocal envoyé]" marker to it.
        const content =
          row.kind === "audio" && row.content.trim()
            ? row.content.trim()
            : [row.content, marker].filter(Boolean).join(" ").trim() || marker
        return { role: row.role, content }
      })
      .filter((row) => row.content.length > 0)

    const memory = await ctx.db
      .query("assistantMemory")
      .withIndex("by_owner", (q) => q.eq("ownerId", userId))
      .first()

    return { userId, history, memory: memory?.summary ?? "" }
  },
})

/** Public history for the CHARLES chat screen (empty before sign-in). */
export const history = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx)
    if (!userId) return []
    const stored = await ctx.db
      .query("assistantMessages")
      .withIndex("by_owner", (q) => q.eq("ownerId", userId))
      .order("desc")
      .take(120)
    const rows = stored.slice().reverse()
    return rows.map((row) => ({
        id: row._id,
        role: row.role,
        content: row.content,
        kind: row.kind ?? "text",
        fileId: row.fileId ?? null,
        mime: row.mime ?? null,
        durationMs: row.durationMs ?? null,
        createdAt: row.createdAt,
      }))
  },
})

/**
 * @deprecated Kept for older clients; new uploads go through api.appFiles.createUpload.
 */
export const uploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx)
    if (!userId) throw new ConvexError({ code: "UNAUTHENTICATED" })
    return await ctx.storage.generateUploadUrl()
  },
})

/** File id of one of the member's own messages, for a private read grant. */
export const ownedFile = internalQuery({
  args: { messageId: v.id("assistantMessages") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx)
    if (!userId) return null
    const row = await ctx.db.get(args.messageId)
    if (!row || row.ownerId !== userId) return null
    return { fileId: row.fileId ?? null, kind: row.kind ?? "text" }
  },
})

/** Starts a fresh conversation: the saved memory summary is kept. */
export const clear = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx)
    if (!userId) return { ok: false as const }
    const rows = await ctx.db
      .query("assistantMessages")
      .withIndex("by_owner", (q) => q.eq("ownerId", userId))
      .collect()
    for (const row of rows) await ctx.db.delete(row._id)
    return { ok: true as const }
  },
})

export const appendMessage = internalMutation({
  args: {
    userId: v.id("users"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
    kind: v.optional(
      v.union(
        v.literal("text"),
        v.literal("image"),
        v.literal("video"),
        v.literal("audio"),
      ),
    ),
    fileId: v.optional(v.string()),
    visibility: v.optional(v.union(v.literal("public"), v.literal("private"))),
    // Legacy field from the Convex-storage upload path, ignored.
    storageId: v.optional(v.id("_storage")),
    mime: v.optional(v.string()),
    durationMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("assistantMessages", {
      ownerId: args.userId,
      role: args.role,
      content: args.content,
      kind: args.kind ?? "text",
      ...(args.fileId ? { fileId: args.fileId } : {}),
      ...(args.visibility ? { visibility: args.visibility } : {}),
      ...(args.mime ? { mime: args.mime } : {}),
      ...(args.durationMs ? { durationMs: args.durationMs } : {}),
      createdAt: Date.now(),
    })
  },
})

export const setMemory = internalMutation({
  args: { userId: v.id("users"), summary: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("assistantMemory")
      .withIndex("by_owner", (q) => q.eq("ownerId", args.userId))
      .first()
    if (existing) {
      await ctx.db.patch(existing._id, { summary: args.summary, updatedAt: Date.now() })
    } else {
      await ctx.db.insert("assistantMemory", {
        ownerId: args.userId,
        summary: args.summary,
        updatedAt: Date.now(),
      })
    }
  },
})

function cleanText(input: string, max: number): string {
  return input
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
}

/**
 * Turns a recorded voice note into text before the assistant reasons about it.
 * The private App File is read through a short-lived download URL, which the
 * transcription service can fetch without exposing the file publicly.
 */
async function transcribeAudio(
  ctx: Parameters<typeof createAppFileDownloadUrl>[0],
  fileId: string,
): Promise<string> {
  try {
    const download = await createAppFileDownloadUrl(ctx, fileId)
    const result = await callMacalyJson("/api/client-app/transcription", {
      audio: download.url,
      model: "gpt-transcribe",
    })
    return typeof result.text === "string" ? cleanText(result.text, 2000) : ""
  } catch (error) {
    console.error(
      "assistant.transcribe failed",
      error instanceof Error ? error.message : String(error),
    )
    return ""
  }
}

function snapshotToText(data: Snapshot): string {
  const ledgerLines =
    data.ledger.recent.length === 0
      ? "aucune écriture"
      : data.ledger.recent
          .map((entry) => `- ${entry.type} : ${entry.label} (${entry.amount} CDF)`)
          .join("\n")
  const messageLines =
    data.messages.recent.length === 0
      ? "aucun message"
      : data.messages.recent
          .map(
            (message) =>
              `- ${message.direction === "sent" ? "envoyé à" : "reçu de"} ${message.from} : ${message.preview}`,
          )
          .join("\n")
  const newsLines =
    data.news.length === 0
      ? "aucune publication"
      : data.news
          .map((post) => `- ${post.author} : ${post.body}`)
          .join("\n")

  const stockLines =
    data.ledger.products.length === 0
      ? "aucun produit"
      : data.ledger.products
          .map(
            (product) =>
              `- ${product.name} : ${product.stock} en stock, ${product.price} CDF${product.low ? " (stock bas)" : ""}`,
          )
          .join("\n")
  const creditLines =
    data.ledger.credits.length === 0
      ? "aucun crédit client en cours"
      : data.ledger.credits
          .map(
            (credit) =>
              `- ${credit.customer} : ${credit.remaining} CDF restant, échéance ${credit.dueDate}${credit.overdue ? " (en retard)" : ""}`,
          )
          .join("\n")
  const shopLines =
    data.ledger.shops.length === 0 ? "aucune boutique" : data.ledger.shops.join(", ")

  return `MEMBRE : ${data.displayName} (${data.horizonId})
CAHIER DE COMPTE : ventes ${data.ledger.sales} CDF, dépenses ${data.ledger.expenses} CDF, solde ${data.ledger.balance} CDF, dettes ouvertes ${data.ledger.debts} CDF, dettes réglées ${data.ledger.debtsSettled} CDF.
BOUTIQUES : ${shopLines}
PRODUITS ET STOCK :
${stockLines}
CRÉDITS CLIENTS :
${creditLines}
DERNIÈRES ÉCRITURES :
${ledgerLines}
MESSAGES (${data.messages.unread} non lus) :
${messageLines}
ACTUALITÉS RÉCENTES :
${newsLines}`
}

export const ask = action({
  args: {
    question: v.string(),
    history: v.optional(v.array(HISTORY_ITEM)),
    attachment: v.optional(
      v.object({
        fileId: v.optional(v.string()),
        // Legacy Convex-storage upload id.
        storageId: v.optional(v.id("_storage")),
        kind: v.union(v.literal("image"), v.literal("video"), v.literal("audio")),
        mime: v.optional(v.string()),
        durationMs: v.optional(v.number()),
        name: v.optional(v.string()),
      }),
    ),
  },
  handler: async (
    ctx,
    args,
  ): Promise<
    { ok: true; text: string } | { ok: false; code: string }
  > => {
    const quota = await ctx.runMutation(internal.billing.consumeAiCredit, {})
    if (!quota.ok) return { ok: false, code: "AI_DAILY_LIMIT" }

    const question = cleanText(args.question, 1000)
    const attachment = args.attachment
    if (question.length === 0 && !attachment)
      return { ok: false, code: "EMPTY_QUESTION" }

    const data = await ctx.runQuery(internal.assistant.snapshot, {})
    if (!data) return { ok: false, code: "UNAUTHENTICATED" }

    const session = await ctx.runQuery(internal.assistant.context, {})
    if (!session) return { ok: false, code: "UNAUTHENTICATED" }

    // The server owns the conversation: history comes from the database, never
    // from the browser, so a reload keeps everything and nothing can be forged.
    const history = session.history.slice(-30)

    // Finish the upload before reading it: a download grant only exists once
    // the App File is marked ready.
    const uploaded = attachment?.fileId
      ? await completeAppFile(ctx, attachment.fileId)
      : null

    // Voice notes are transcribed first: the assistant must answer what was
    // said, not merely acknowledge that an audio file arrived.
    const transcript =
      attachment?.kind === "audio" && uploaded
        ? await transcribeAudio(ctx, uploaded.fileId)
        : ""
    const attachmentLabel =
      attachment?.kind === "image"
        ? "[photo envoyée]"
        : attachment?.kind === "video"
          ? "[vidéo envoyée]"
          : attachment?.kind === "audio" && !transcript
            ? "[message vocal envoyé]"
            : ""
    const spokenText = transcript
      ? `Transcription du message vocal : ${transcript}`
      : ""
    const questionText = [question, spokenText, attachmentLabel]
      .filter(Boolean)
      .join("\n")

    // Photos are sent to the model as real image parts, so it can read a
    // receipt, a price list or a product instead of guessing from a label.
    let imageUrl: string | null = null
    if (attachment?.kind === "image" && uploaded) {
      try {
        imageUrl = (await createAppFileDownloadUrl(ctx, uploaded.fileId)).url
      } catch (error) {
        console.error(
          "assistant.image grant failed",
          error instanceof Error ? error.message : String(error),
        )
      }
    }

    const analysis = /résum|resum|analys|analiz|bilan|summary|analy/i.test(question)
    type ContentPart =
      | { type: "text"; text: string }
      | { type: "image"; image: string; mediaType?: string }
    const messages: {
      role: "system" | "user" | "assistant"
      content: string | ContentPart[]
    }[] =
      [
        {
          role: "system",
          content: `Tu es CHARLES, l'assistant expert de HORIZON Workspace, l'application de gestion de commerce et de réseau social professionnel utilisée en République démocratique du Congo. Tu réponds dans la langue de la question (français, anglais ou kiswahili).

TES COMPÉTENCES :
1. COMPTABILITÉ : tenir un cahier de compte de commerce (ventes, dépenses, dettes, solde), calculer un bénéfice, une marge, un prix de revient, un seuil de rentabilité, une TVA (16 % en RDC), préparer un mini-bilan ou un compte de résultat, expliquer une écriture et conseiller sur la tenue des livres. Tous les montants sont en francs congolais (CDF).
2. GESTION DE COMMERCE : stock et ruptures, réapprovisionnement, prix de vente, promotions, crédit client et recouvrement, caisse et clôture journalière, objectifs de vente, budget de dépenses, comparaison entre boutiques et performance des vendeurs.
3. HORIZON UNIQUEMENT : tu es expert de la plateforme HORIZON Workspace (Cahier de Compte, crédits clients, boutiques et vendeurs, objectifs, caisse, rapports PDF/Excel, messages, notifications, profil et adresse HORIZON, offres premium). Tu refuses poliment toute demande concernant une autre plateforme, un autre réseau social, un autre logiciel de gestion ou un autre assistant, et tu proposes l'équivalent dans HORIZON.
4. Tu peux analyser les photos, vidéos ou messages vocaux que le membre t'envoie : décris ce que tu comprends, mais ne prétends jamais lire un chiffre illisible.

RÈGLES : sois concret, structuré et bref (moins de 220 mots sauf demande contraire), calcule étape par étape quand il y a des chiffres, utilise uniquement les données ci-dessous, n'invente jamais un chiffre, un nom ou une règle fiscale, et dis clairement quand une information manque. Ne révèle jamais d'adresse e-mail. Rappelle que tes réponses ne remplacent pas un comptable agréé pour les décisions officielles.
Tu gardes la mémoire de la conversation : tiens compte de ce qui a été dit avant et de ta mémoire résumée.

MÉMOIRE DES ÉCHANGES PASSÉS :
${session.memory || "aucune mémoire enregistrée pour l'instant"}

DONNÉES DU MEMBRE :
${snapshotToText(data)}`,
        },
        ...history,
        {
          role: "user" as const,
          content: imageUrl
            ? [
                {
                  type: "text" as const,
                  text: questionText || "Analyse cette image.",
                },
                {
                  type: "image" as const,
                  image: imageUrl,
                  ...(attachment?.mime ? { mediaType: attachment.mime } : {}),
                },
              ]
            : questionText,
        },
      ]

    await ctx.runMutation(internal.assistant.appendMessage, {
      userId: session.userId,
      role: "user",
      content: [question, transcript].filter(Boolean).join("\n"),
      ...(attachment && uploaded
        ? {
            kind: attachment.kind,
            fileId: uploaded.fileId,
            visibility: uploaded.visibility,
            ...(attachment.mime ? { mime: attachment.mime } : {}),
            ...(attachment.durationMs ? { durationMs: attachment.durationMs } : {}),
          }
        : { kind: "text" as const }),
    })

    try {
      const result = await callMacalyJson("/api/client-app/llm-usage", {
        preset: analysis ? "DOCS" : "FAST",
        temperature: 0.3,
        maxTokens: 1200,
        messages,
      })
      const text = typeof result.text === "string" ? result.text.trim() : ""
      if (!text) return { ok: false, code: "EMPTY_RESPONSE" }

      await ctx.runMutation(internal.assistant.appendMessage, {
        userId: session.userId,
        role: "assistant",
        content: text,
      })

      // Refresh the long-term memory every few exchanges.
      const userTurns = history.filter((item) => item.role === "user").length + 1
      if (userTurns % 6 === 0) {
        try {
          const digest = await callMacalyJson("/api/client-app/llm-usage", {
            preset: "FAST",
            temperature: 0.2,
            maxTokens: 400,
            messages: [
              {
                role: "system",
                content:
                  "Tu résumes en français, en moins de 120 mots, la mémoire utile d'un échange entre un membre de HORIZON Workspace et son assistant CHARLES : préférences, activités, décisions, chiffres cités. Garde uniquement ce qui servira plus tard. Réponds par le résumé seul.",
              },
              {
                role: "user",
                content: `MÉMOIRE ACTUELLE :\n${session.memory || "aucune"}\n\nÉCHANGES RÉCENTS :\n${[
                  ...history.slice(-12),
                  { role: "user" as const, content: question },
                  { role: "assistant" as const, content: text },
                ]
                  .map((item) => `${item.role === "user" ? "Membre" : "CHARLES"} : ${item.content}`)
                  .join("\n")}`,
              },
            ],
          })
          const summary =
            typeof digest.text === "string" ? cleanText(digest.text, 900) : ""
          if (summary) {
            await ctx.runMutation(internal.assistant.setMemory, {
              userId: session.userId,
              summary,
            })
          }
        } catch (error) {
          console.error("assistant.memory refresh failed", error)
        }
      }

      return { ok: true, text }
    } catch (error) {
      console.error("assistant.ask failed", error)
      return { ok: false, code: "ASSISTANT_UNAVAILABLE" }
    }
  },
})
