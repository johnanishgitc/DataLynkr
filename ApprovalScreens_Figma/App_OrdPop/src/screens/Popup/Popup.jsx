import { LedgerDetailsSection } from "./sections/LedgerDetailsSection";
import { OrderItemsSection } from "./sections/OrderItemsSection";
import { OrderSummarySection } from "./sections/OrderSummarySection";

export const Popup = () => {
  return (
    <div
      className="w-[390px] h-[1187px] flex bg-[#00000099]"
      data-model-id="3159:62395"
      role="dialog"
      aria-modal="true"
      aria-labelledby="popup-title"
    >
      <div className="mt-12 w-[332px] ml-[29px] flex overflow-y-scroll">
        <div className="flex w-[332px] h-[689px] relative flex-col items-start bg-white">
          <OrderItemsSection />
          <LedgerDetailsSection />
          <OrderSummarySection />
          <div className="all-[unset] box-border flex items-start gap-2.5 px-3.5 py-2.5 relative self-stretch w-full flex-[0_0_auto] bg-[#fafafd]">
            <button
              className="flex items-center justify-center gap-2 px-[15px] py-2.5 relative flex-1 grow bg-[#39b57c] rounded cursor-pointer"
              type="button"
              aria-label="Update Order"
            >
              <span className="relative w-fit mt-[-1.00px] [font-family:'Roboto',Helvetica] font-medium text-white text-[15px] text-center tracking-[0] leading-5 whitespace-nowrap">
                Update Order
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
