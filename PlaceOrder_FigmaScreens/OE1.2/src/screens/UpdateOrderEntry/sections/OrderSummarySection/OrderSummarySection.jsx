import { useState } from "react";

export const OrderSummarySection = () => {
  const [isExpanded, setIsExpanded] = useState(true);

  const handleToggleExpand = () => {
    setIsExpanded(!isExpanded);
  };

  const handleAddDetails = () => {
    console.log("Add Details clicked");
  };

  const handlePlaceOrder = () => {
    console.log("Place Order clicked");
  };

  return (
    <section className="flex flex-col w-[390px] items-start gap-2 relative flex-[0_0_auto] bg-white">
      <div className="flex flex-col items-start relative self-stretch w-full flex-[0_0_auto]">
        <header className="flex flex-col w-[390px] items-start gap-2.5 px-4 py-2.5 relative flex-[0_0_auto] bg-[#1e488f] border-t [border-top-style:solid] border-[#c4d4ff]">
          <button
            className="flex items-center justify-between relative self-stretch w-full flex-[0_0_auto] cursor-pointer"
            onClick={handleToggleExpand}
            aria-expanded={isExpanded}
            aria-controls="ledger-details-content"
            type="button"
          >
            <h2 className="relative w-fit [font-family:'Roboto',Helvetica] font-semibold text-white text-[13px] tracking-[0] leading-[normal] whitespace-nowrap">
              LEDGER DETAILS
            </h2>

            <div className="relative w-5 h-5 -rotate-90" aria-hidden="true">
              <img
                className="absolute w-[68.75%] h-[37.50%] top-[18.75%] left-[31.25%] rotate-90"
                alt=""
                src="/img/vector-9.svg"
              />
            </div>
          </button>
        </header>

        {isExpanded && (
          <div
            id="ledger-details-content"
            className="flex flex-col items-start gap-2.5 px-4 py-2.5 relative self-stretch w-full flex-[0_0_auto] rounded-[20px]"
          >
            <div className="flex-col gap-2.5 flex items-start relative self-stretch w-full flex-[0_0_auto]">
              <div className="flex-col gap-3 flex items-start relative self-stretch w-full flex-[0_0_auto]">
                <div className="flex items-center justify-between relative self-stretch w-full flex-[0_0_auto]">
                  <div className="inline-flex items-center justify-center gap-2.5 relative flex-[0_0_auto]">
                    <p className="relative w-fit mt-[-1.00px] [font-family:'Roboto',Helvetica] font-semibold text-[#0e172b] text-[17px] tracking-[0] leading-[normal] whitespace-nowrap">
                      Grand Total
                    </p>
                  </div>

                  <div className="inline-flex items-center justify-center gap-2.5 relative flex-[0_0_auto]">
                    <p className="relative w-fit mt-[-1.00px] [font-family:'Roboto',Helvetica] font-semibold text-[#0e172b] text-[17px] tracking-[0] leading-[normal] whitespace-nowrap">
                      ₹1000.00
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col items-start gap-2.5 px-4 py-0 relative self-stretch w-full flex-[0_0_auto] bg-white">
        <div className="flex-col gap-2.5 flex items-start relative self-stretch w-full flex-[0_0_auto]">
          <div className="gap-2 flex items-start relative self-stretch w-full flex-[0_0_auto]">
            <button
              className="flex w-10 items-center justify-center gap-2.5 px-[15px] py-2.5 relative bg-[#f1c74b] rounded-[100px] overflow-hidden cursor-pointer"
              onClick={handleAddDetails}
              aria-label="Add attachment"
              type="button"
            >
              <img
                className="relative w-[20.66px] h-[22px] mt-[-1.00px] mb-[-1.00px] ml-[-5.33px] mr-[-5.33px]"
                alt=""
                src="/img/vector-10.svg"
              />
            </button>

            <button
              className="flex items-center justify-center gap-2 px-6 py-2.5 relative flex-1 grow bg-[#0e172b] rounded cursor-pointer"
              onClick={handleAddDetails}
              type="button"
            >
              <span className="relative w-fit mt-[-1.00px] [font-family:'Roboto',Helvetica] font-medium text-white text-[15px] text-center tracking-[0] leading-5 whitespace-nowrap">
                Add Details
              </span>
            </button>

            <button
              className="flex items-center justify-center gap-2 px-6 py-2.5 relative flex-1 grow bg-[#39b57c] rounded cursor-pointer"
              onClick={handlePlaceOrder}
              type="button"
            >
              <span className="relative w-fit mt-[-1.00px] [font-family:'Roboto',Helvetica] font-medium text-white text-[15px] text-center tracking-[0] leading-5 whitespace-nowrap">
                Place Order
              </span>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};
