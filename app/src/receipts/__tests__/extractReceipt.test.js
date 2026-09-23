const originalEnv = { ...process.env };
const originalFetch = global.fetch;

afterEach(() => {
  process.env = { ...originalEnv };
  global.fetch = originalFetch;
  jest.resetModules();
});

function loadModule() {
  // Env vars are read at module-load time, so each test needs a fresh
  // require after setting process.env — matches how Expo actually
  // inlines EXPO_PUBLIC_ vars (read once, not live).
  return require("../extractReceipt");
}

describe("extractReceipt (Azure)", () => {
  test("throws a clear error when unconfigured", async () => {
    delete process.env.EXPO_PUBLIC_AZURE_DOC_INTEL_ENDPOINT;
    delete process.env.EXPO_PUBLIC_AZURE_DOC_INTEL_KEY;
    const { extractReceipt } = loadModule();
    await expect(extractReceipt("base64img")).rejects.toThrow(/isn't set up/);
  });

  test("submits, polls, and parses items/tax/tip/total out of the analyze result", async () => {
    process.env.EXPO_PUBLIC_AZURE_DOC_INTEL_ENDPOINT = "https://example.cognitiveservices.azure.com";
    process.env.EXPO_PUBLIC_AZURE_DOC_INTEL_KEY = "test-key";
    const { extractReceipt } = loadModule();

    const submitResponse = {
      status: 202,
      headers: { get: (name) => (name === "operation-location" ? "https://example.com/poll" : null) },
    };
    const pollResponse = {
      json: async () => ({
        status: "succeeded",
        analyzeResult: {
          documents: [
            {
              confidence: 0.91,
              fields: {
                MerchantName: { valueString: "Trader Joe's" },
                TransactionDate: { valueDate: "2026-09-20" },
                TotalTax: { valueCurrency: { amount: 1.23 } },
                Tip: { valueCurrency: { amount: 0 } },
                Total: { valueCurrency: { amount: 12.99 } },
                Items: {
                  valueArray: [
                    { valueObject: { Description: { valueString: "Bananas" }, TotalPrice: { valueCurrency: { amount: 2.5 } } } },
                    { valueObject: { Description: { valueString: "Bread" }, TotalPrice: { valueCurrency: { amount: 4.0 } } } },
                  ],
                },
              },
            },
          ],
        },
      }),
    };

    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(submitResponse)
      .mockResolvedValueOnce(pollResponse);

    const result = await extractReceipt("base64img");

    expect(result).toEqual({
      vendor: "Trader Joe's",
      date: "2026-09-20",
      items: [
        { name: "Bananas", amount: 2.5 },
        { name: "Bread", amount: 4.0 },
      ],
      tax: 1.23,
      tip: 0,
      total: 12.99,
      confidence: 0.91,
    });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  test("throws when the analyze call itself is rejected (non-202)", async () => {
    process.env.EXPO_PUBLIC_AZURE_DOC_INTEL_ENDPOINT = "https://example.cognitiveservices.azure.com";
    process.env.EXPO_PUBLIC_AZURE_DOC_INTEL_KEY = "test-key";
    const { extractReceipt } = loadModule();

    global.fetch = jest.fn().mockResolvedValue({ status: 401, text: async () => "unauthorized" });
    await expect(extractReceipt("base64img")).rejects.toThrow(/HTTP 401/);
  });
});

describe("extractGeneric (Claude)", () => {
  test("throws a clear error when unconfigured", async () => {
    delete process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY;
    const { extractGeneric } = loadModule();
    await expect(extractGeneric("base64img", "image/jpeg", "gas_pump")).rejects.toThrow(/isn't set up/);
  });

  test("rejects an unknown capture kind before even checking config", async () => {
    const { extractGeneric } = loadModule();
    await expect(extractGeneric("base64img", "image/jpeg", "invoice")).rejects.toThrow(/Unknown capture kind/);
  });

  test("parses the forced tool_use block into a flat result", async () => {
    process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY = "test-key";
    const { extractGeneric } = loadModule();

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [
          {
            type: "tool_use",
            name: "record_transaction",
            input: { amount: 41.2, vendor: "Shell", date: "2026-09-22" },
          },
        ],
      }),
    });

    const result = await extractGeneric("base64img", "image/jpeg", "gas_pump");
    expect(result).toEqual({ vendor: "Shell", amount: 41.2, date: "2026-09-22", description: "Shell" });
  });
});

describe("extractFromImage", () => {
  test("routes 'receipt' to Azure and gas_pump/payment_screenshot to Claude", async () => {
    process.env.EXPO_PUBLIC_AZURE_DOC_INTEL_ENDPOINT = "https://example.cognitiveservices.azure.com";
    process.env.EXPO_PUBLIC_AZURE_DOC_INTEL_KEY = "test-key";
    process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY = "test-key";
    const { extractFromImage } = loadModule();

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ content: [{ type: "tool_use", name: "record_transaction", input: { amount: 5 } }] }),
    });
    const result = await extractFromImage("base64img", "image/jpeg", "payment_screenshot");
    expect(result.amount).toBe(5);

    await expect(extractFromImage("base64img", "image/jpeg", "bogus")).rejects.toThrow(/Unknown capture kind/);
  });
});
