const {
  categorize,
  categorizeItem,
  normalizeDescription,
  derivePatternFromDescription,
} = require("../defaults");

const CATEGORY_IDS = {
  Groceries: "cat-groceries",
  Dining: "cat-dining",
  Transport: "cat-transport",
  Health: "cat-health",
  Shopping: "cat-shopping",
};

describe("categorize (transaction description → merchant keywords)", () => {
  test("matches a default merchant keyword", () => {
    const result = categorize(normalizeDescription("TRADER JOE'S #123"), [], CATEGORY_IDS);
    expect(result).toBe("cat-groceries");
  });

  test("household rules win over the shipped defaults", () => {
    const householdRules = [{ pattern: "TRADER JOE", categoryId: "cat-custom-override" }];
    const result = categorize(normalizeDescription("TRADER JOE'S #123"), householdRules, CATEGORY_IDS);
    expect(result).toBe("cat-custom-override");
  });

  test("returns null when nothing matches", () => {
    expect(categorize(normalizeDescription("SOME RANDOM VENDOR"), [], CATEGORY_IDS)).toBeNull();
  });

  test("returns null when the matched default category doesn't exist for this household", () => {
    expect(categorize(normalizeDescription("STARBUCKS #55"), [], { Groceries: "cat-groceries" })).toBeNull();
  });
});

describe("categorizeItem (receipt item name → product keywords)", () => {
  test("matches a default item keyword", () => {
    expect(categorizeItem(normalizeDescription("Bananas"), [], CATEGORY_IDS)).toBe("cat-groceries");
    expect(categorizeItem(normalizeDescription("Flatbreads"), [], CATEGORY_IDS)).toBe("cat-dining");
  });

  test("word-boundary matching — a short keyword doesn't match inside an unrelated longer word", () => {
    // "HAM" is not a keyword here, but this guards the underlying phrase-match
    // helper: TEA is a real keyword and must not match inside STEAK.
    expect(categorizeItem(normalizeDescription("Ribeye Steak"), [], CATEGORY_IDS)).toBeNull();
  });

  test("multi-word phrase keywords match as a whole phrase, not each word independently", () => {
    expect(categorizeItem(normalizeDescription("Bounty Paper Towels 6pk"), [], CATEGORY_IDS)).toBe("cat-shopping");
  });

  test("household item rules win over the shipped item defaults", () => {
    const householdRules = [{ pattern: "ROSE MILBRANDT", categoryId: "cat-wine-club" }];
    const result = categorizeItem(normalizeDescription("9oz Rose, Milbrandt"), householdRules, CATEGORY_IDS);
    expect(result).toBe("cat-wine-club");
  });

  test("returns null for an item with no keyword match", () => {
    expect(categorizeItem(normalizeDescription("Misc Item 4471"), [], CATEGORY_IDS)).toBeNull();
  });
});

describe("derivePatternFromDescription", () => {
  test("takes the first three words", () => {
    expect(derivePatternFromDescription(normalizeDescription("9oz Rose, Milbrandt Vineyard"))).toBe("9OZ ROSE MILBRANDT");
  });
});
