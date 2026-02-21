import { BottomNavigationSection } from "./sections/BottomNavigationSection";
import { StockSummarySection } from "./sections/StockSummarySection";

export const StockSummary = () => {
  return (
    <div
      className="inline-flex flex-col h-[879px] items-start justify-between relative bg-white"
      data-model-id="3062:32895"
    >
      <StockSummarySection />
      <BottomNavigationSection />
    </div>
  );
};
