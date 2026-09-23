// Two providers for two jobs (PRD §8.6): Azure AI Document Intelligence's
// prebuilt-receipt model for itemized receipts, and Claude's vision API
// for gas pumps / payment-app screenshots (no line items to extract, just
// a total + vendor guess). Both keys are embedded client-side and called
// directly from the phone — see §8.6's "API key handling" decision for
// why that's fine here (our backend never sees the image either way).
//
// Neither is wired to a live key in this dev environment yet — Azure and
// Anthropic accounts still need to be set up (see PRD §8.6) — so both
// throw a clear, catchable "not configured" error rather than silently
// no-opping if the env vars are missing.
const AZURE_ENDPOINT = process.env.EXPO_PUBLIC_AZURE_DOC_INTEL_ENDPOINT;
const AZURE_KEY = process.env.EXPO_PUBLIC_AZURE_DOC_INTEL_KEY;
const ANTHROPIC_KEY = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY;
const CLAUDE_MODEL = "claude-haiku-4-5-20251001";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function currencyAmount(field) {
  return field?.valueCurrency?.amount ?? null;
}

/**
 * Azure's analyze API is async: the initial POST returns 202 with an
 * Operation-Location header, which is polled until status is "succeeded"
 * (or "failed") — see the prebuilt-receipt REST docs. ~800ms-1s per poll,
 * receipts typically finish in 2-4 polls.
 */
export async function extractReceipt(imageBase64) {
  if (!AZURE_ENDPOINT || !AZURE_KEY) {
    throw new Error(
      "Receipt scanning isn't set up yet — add EXPO_PUBLIC_AZURE_DOC_INTEL_ENDPOINT and EXPO_PUBLIC_AZURE_DOC_INTEL_KEY (PRD §8.6)."
    );
  }

  const submitUrl = `${AZURE_ENDPOINT.replace(/\/+$/, "")}/documentintelligence/documentModels/prebuilt-receipt:analyze?api-version=2024-11-30`;
  const submitResponse = await fetch(submitUrl, {
    method: "POST",
    headers: { "Ocp-Apim-Subscription-Key": AZURE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ base64Source: imageBase64 }),
  });
  if (submitResponse.status !== 202) {
    const text = await submitResponse.text().catch(() => "");
    throw new Error(`Receipt scan failed to start (HTTP ${submitResponse.status}): ${text}`);
  }
  const operationLocation = submitResponse.headers.get("operation-location");
  if (!operationLocation) throw new Error("Receipt scan didn't return an operation to poll");

  let result = null;
  for (let attempt = 0; attempt < 20 && !result; attempt++) {
    await sleep(attempt === 0 ? 800 : 1000);
    const pollResponse = await fetch(operationLocation, { headers: { "Ocp-Apim-Subscription-Key": AZURE_KEY } });
    const body = await pollResponse.json();
    if (body.status === "succeeded") result = body;
    else if (body.status === "failed") throw new Error(`Receipt scan failed: ${body.error?.message || "unknown error"}`);
  }
  if (!result) throw new Error("Receipt scan timed out — try again");

  const doc = result.analyzeResult?.documents?.[0];
  if (!doc) throw new Error("Couldn't read that receipt — try a clearer, flatter photo");
  const fields = doc.fields || {};

  const items = (fields.Items?.valueArray || []).map((item) => {
    const obj = item.valueObject || {};
    return { name: obj.Description?.valueString || "Item", amount: currencyAmount(obj.TotalPrice) ?? 0 };
  });

  return {
    vendor: fields.MerchantName?.valueString || null,
    date: fields.TransactionDate?.valueDate || null,
    items,
    tax: currencyAmount(fields.TotalTax) ?? 0,
    tip: currencyAmount(fields.Tip) ?? 0,
    total: currencyAmount(fields.Total),
    confidence: doc.confidence ?? null,
  };
}

const EXTRACTION_TOOL = {
  name: "record_transaction",
  description: "Record the transaction details visible in the photo.",
  input_schema: {
    type: "object",
    properties: {
      amount: { type: "number", description: "The total dollar amount of the transaction" },
      vendor: { type: "string", description: "Gas station name, merchant, or the other party's name, if visible" },
      date: { type: "string", description: "Transaction date in YYYY-MM-DD format, if visible" },
      description: { type: "string", description: "Short human-readable label, e.g. 'Shell gas' or 'Venmo to Alex'" },
    },
    required: ["amount"],
  },
};

const KIND_PROMPTS = {
  gas_pump: "This is a photo of a gas pump display. Extract the total dollar amount charged, the gas station name if visible, and today's date if shown. Call record_transaction with what you can read.",
  payment_screenshot: "This is a screenshot of a payment app (Venmo, Zelle, Cash App, PayPal, etc). Extract the dollar amount, the other party's name, and the date if shown. Call record_transaction with what you can read.",
};

/** Gas pumps and payment screenshots aren't itemized receipts — Azure's model doesn't fit, so this asks Claude directly instead (PRD §8.6). */
export async function extractGeneric(imageBase64, mimeType, kind) {
  const prompt = KIND_PROMPTS[kind];
  if (!prompt) throw new Error(`Unknown capture kind: ${kind}`);
  if (!ANTHROPIC_KEY) {
    throw new Error("Scanning isn't set up yet — add EXPO_PUBLIC_ANTHROPIC_API_KEY (PRD §8.6).");
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 1024,
      tools: [EXTRACTION_TOOL],
      tool_choice: { type: "tool", name: "record_transaction" },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mimeType, data: imageBase64 } },
            { type: "text", text: prompt },
          ],
        },
      ],
    }),
  });

  const body = await response.json();
  if (!response.ok) throw new Error(`Scan failed (HTTP ${response.status}): ${body.error?.message || "unknown error"}`);

  const toolUse = body.content?.find((block) => block.type === "tool_use");
  if (!toolUse) throw new Error("Couldn't read that photo — try again with better lighting");

  return {
    vendor: toolUse.input.vendor || null,
    amount: toolUse.input.amount ?? null,
    date: toolUse.input.date || null,
    description: toolUse.input.description || toolUse.input.vendor || null,
  };
}

/**
 * Single entry point the capture UI calls — it only needs to know which
 * of the three input types it's dealing with, not which provider handles
 * which (that mapping is this module's job, per §8.6).
 */
export async function extractFromImage(imageBase64, mimeType, kind) {
  if (kind === "receipt") return extractReceipt(imageBase64);
  if (kind === "gas_pump" || kind === "payment_screenshot") return extractGeneric(imageBase64, mimeType, kind);
  throw new Error(`Unknown capture kind: ${kind}`);
}
