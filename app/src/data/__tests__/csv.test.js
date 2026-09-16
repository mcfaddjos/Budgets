const { parseCsv, validateRow } = require("../csv");

describe("parseCsv", () => {
  test("parses headers and rows regardless of column order", () => {
    const text = "category,date,amount,description\nHome Fud,2026-09-05,42.5,Groceries\n";
    const { headers, rows } = parseCsv(text);
    expect(headers).toEqual(["category", "date", "amount", "description"]);
    expect(rows).toEqual([{ category: "Home Fud", date: "2026-09-05", amount: "42.5", description: "Groceries" }]);
  });

  test("handles a quoted field containing a comma", () => {
    const text = 'date,amount,description,category\n2026-09-05,10,"Coffee, small",Outside Fud\n';
    const { rows } = parseCsv(text);
    expect(rows[0].description).toBe("Coffee, small");
  });

  test("handles an escaped quote inside a quoted field", () => {
    const text = 'date,amount,description,category\n2026-09-05,10,"Joe""s Diner",Outside Fud\n';
    const { rows } = parseCsv(text);
    expect(rows[0].description).toBe('Joe"s Diner');
  });

  test("ignores blank lines", () => {
    const text = "date,amount,description,category\n2026-09-05,10,Coffee,Outside Fud\n\n\n";
    const { rows } = parseCsv(text);
    expect(rows).toHaveLength(1);
  });

  test("empty input yields no headers or rows", () => {
    expect(parseCsv("")).toEqual({ headers: [], rows: [] });
  });
});

describe("validateRow", () => {
  const categoryIdByLowerName = { "home fud": "cat-1" };

  test("accepts a fully valid row", () => {
    const result = validateRow(
      { date: "2026-09-05", amount: "42.50", description: "Groceries", category: "Home Fud" },
      categoryIdByLowerName
    );
    expect(result.errors).toEqual([]);
    expect(result.amount).toBe(42.5);
    expect(result.categoryId).toBe("cat-1");
  });

  test("category match is case-insensitive", () => {
    const result = validateRow(
      { date: "2026-09-05", amount: "10", description: "", category: "HOME FUD" },
      categoryIdByLowerName
    );
    expect(result.errors).toEqual([]);
    expect(result.categoryId).toBe("cat-1");
  });

  test("flags a malformed date", () => {
    const result = validateRow(
      { date: "9/5/2026", amount: "10", description: "", category: "Home Fud" },
      categoryIdByLowerName
    );
    expect(result.errors).toContain("date must be YYYY-MM-DD");
  });

  test("flags a non-numeric amount", () => {
    const result = validateRow(
      { date: "2026-09-05", amount: "forty two", description: "", category: "Home Fud" },
      categoryIdByLowerName
    );
    expect(result.errors).toContain("amount is not a number");
  });

  test("flags an unknown category rather than guessing", () => {
    const result = validateRow(
      { date: "2026-09-05", amount: "10", description: "", category: "Nonexistent" },
      categoryIdByLowerName
    );
    expect(result.errors).toEqual(['category "Nonexistent" doesn\'t exist']);
  });

  test("a blank category is allowed (uncategorized), not an error", () => {
    const result = validateRow(
      { date: "2026-09-05", amount: "10", description: "", category: "" },
      categoryIdByLowerName
    );
    expect(result.errors).toEqual([]);
    expect(result.categoryId).toBeUndefined();
  });
});
