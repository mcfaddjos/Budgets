import CategorySpendReport from "./CategorySpendReport";
import YearSurplusReport from "./YearSurplusReport";
import CategoryTrendReport from "./CategoryTrendReport";
import DailySpendingReport from "./DailySpendingReport";

/**
 * Every report the app can show, in the order they appear as picker
 * chips. Adding a new report type is: write the component (self-
 * contained — it fetches its own data and owns its own settings/filters,
 * same pattern as these), then add one entry here. ReportsScreen.js never
 * needs to change.
 */
export const REPORTS = [
  { id: "category-spend", title: "By Category", Component: CategorySpendReport },
  { id: "year-surplus", title: "Year Surplus", Component: YearSurplusReport },
  { id: "category-trend", title: "Category Trend", Component: CategoryTrendReport },
  { id: "daily-spending", title: "Day by Day", Component: DailySpendingReport },
];
