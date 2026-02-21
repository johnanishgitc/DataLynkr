import { NavigationFooterSection } from "./sections/NavigationFooterSection";
import { StockSummaryContentSection } from "./sections/StockSummaryContentSection";

export const StockGroupSummary = () => {
  return (
    <div
      className="inline-flex flex-col h-[879px] items-start justify-between relative bg-white"
      data-model-id="3062:34150"
    >
      <StockSummaryContentSection />
      <NavigationFooterSection />
    </div>
  );
};
