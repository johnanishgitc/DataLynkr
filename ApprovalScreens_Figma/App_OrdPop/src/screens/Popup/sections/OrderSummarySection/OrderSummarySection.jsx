import { useState } from "react";

export const OrderSummarySection = () => {
  const [isLedgerExpanded, setIsLedgerExpanded] = useState(false);

  const itemTotal = "30,000.00 Dr";
  const grandTotal = "30,600.00 Dr";

  const handleLedgerToggle = () => {
    setIsLedgerExpanded(!isLedgerExpanded);
  };

  return (
    <section className="flex flex-col items-start relative self-stretch w-full flex-[0_0_auto]">
      <div className="flex flex-col items-start relative self-stretch w-full flex-[0_0_auto]">
        <div className="flex flex-col h-10 items-start justify-end gap-2.5 px-3.5 py-0 relative self-stretch w-full bg-white shadow-[0px_-4px_4px_#0000000a]">
          <div className="flex flex-col items-start gap-2.5 px-0 py-[13px] relative self-stretch w-full flex-[0_0_auto] mt-[-1.00px] rounded-[20px]">
            <div className="gap-2.5 flex flex-col items-start relative self-stretch w-full flex-[0_0_auto]">
              <div className="gap-3 flex flex-col items-start relative self-stretch w-full flex-[0_0_auto]">
                <div className="flex items-center justify-between relative self-stretch w-full flex-[0_0_auto]">
                  <div className="inline-flex justify-center gap-2.5 items-center relative flex-[0_0_auto]">
                    <h3 className="relative w-fit mt-[-1.00px] [font-family:'Roboto',Helvetica] font-semibold text-[#0e172b] text-[13px] tracking-[0] leading-[normal] whitespace-nowrap">
                      ITEM TOTAL
                    </h3>
                  </div>

                  <div className="inline-flex items-center justify-center gap-2.5 relative flex-[0_0_auto]">
                    <p className="relative w-fit mt-[-1.00px] [font-family:'Roboto',Helvetica] font-semibold text-[#0e172b] text-[13px] tracking-[0] leading-[normal] whitespace-nowrap">
                      {itemTotal}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <button
          className="gap-2.5 px-3.5 py-2.5 self-stretch w-full bg-[#1e488f] border-t [border-top-style:solid] border-[#c4d4ff] flex flex-col items-start relative flex-[0_0_auto] cursor-pointer"
          onClick={handleLedgerToggle}
          aria-expanded={isLedgerExpanded}
          aria-controls="ledger-details-content"
          type="button"
        >
          <div className="flex items-center justify-between relative self-stretch w-full flex-[0_0_auto]">
            <h3 className="relative w-fit [font-family:'Roboto',Helvetica] font-semibold text-white text-[13px] tracking-[0] leading-[normal] whitespace-nowrap">
              LEDGER DETAILS
            </h3>

            <div className="relative w-5 h-5 -rotate-90">
              <img
                className="absolute w-[68.75%] h-[37.50%] top-[18.75%] left-[31.25%] rotate-90"
                alt="Toggle ledger details"
                src="/img/vector-5.svg"
              />
            </div>
          </div>
        </button>

        <div className="flex flex-col items-start justify-end gap-2.5 px-3.5 py-0 relative self-stretch w-full flex-[0_0_auto] bg-white shadow-[0px_-4px_4px_#0000000a]">
          <div className="flex flex-col items-start gap-2.5 px-0 py-2.5 relative self-stretch w-full flex-[0_0_auto] rounded-[20px]">
            <div className="gap-2.5 flex flex-col items-start relative self-stretch w-full flex-[0_0_auto]">
              <div className="gap-3 flex flex-col items-start relative self-stretch w-full flex-[0_0_auto]">
                <div className="flex justify-between self-stretch w-full items-center relative flex-[0_0_auto]">
                  <div className="inline-flex justify-center gap-2.5 items-center relative flex-[0_0_auto]">
                    <h2 className="relative w-fit mt-[-1.00px] [font-family:'Roboto',Helvetica] font-semibold text-[#0e172b] text-[17px] tracking-[0] leading-[normal] whitespace-nowrap">
                      Grand Total
                    </h2>
                  </div>

                  <div className="inline-flex items-center justify-center gap-2.5 relative flex-[0_0_auto]">
                    <p className="relative w-fit mt-[-1.00px] [font-family:'Roboto',Helvetica] font-semibold text-[#0e172b] text-[17px] tracking-[0] leading-[normal] whitespace-nowrap">
                      {grandTotal}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
