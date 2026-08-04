-- Backs ReportService.logRevenue's WHERE {month, year} lookup and
-- getRevenueRecords/getSuperDashboard's ORDER BY year, month.
CREATE INDEX "RevenueRecord_year_month_idx" ON "RevenueRecord"("year", "month");
