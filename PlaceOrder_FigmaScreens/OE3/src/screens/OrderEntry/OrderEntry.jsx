import { OrderItemDetailsSection } from "./sections/OrderItemDetailsSection";
import { OrderSummarySection } from "./sections/OrderSummarySection";

export const OrderEntry = () => {
  return (
    <div className="w-[390px] flex" data-model-id="3067:52684">
      <div className="inline-flex w-[390px] h-[844px] relative flex-col items-start pt-0 pb-2.5 px-0 bg-white">
        <div className="flex flex-col w-[390px] items-start justify-between relative flex-1 grow">
          <OrderItemDetailsSection />
          <OrderSummarySection />
        </div>
      </div>
    </div>
  );
};
