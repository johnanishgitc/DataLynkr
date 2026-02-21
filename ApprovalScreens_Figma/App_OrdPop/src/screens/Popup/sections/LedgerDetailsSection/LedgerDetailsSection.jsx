import { useState } from "react";

export const LedgerDetailsSection = () => {
  const [isInventoryExpanded, setIsInventoryExpanded] = useState(true);

  const ledgerHeader = {
    title: "GRB Food Items 1",
    amount: "30,600.00",
    type: "Dr.",
    date: "23-Dec-25",
    transactionType: "Receipt",
    referenceNumber: "SRN-F36/2025-26",
  };

  const inventoryItems = [
    {
      id: 1,
      name: "500 Ml SP Buffalo Ghee-GRB",
      amount: "₹5,000.00",
      qty: 5,
      rate: "1,000/cases",
      discount: 0,
    },
    {
      id: 2,
      name: "iPhone 12",
      amount: "₹30000.00",
      qty: 3,
      rate: "1,000/cases",
      discount: 0,
    },
    {
      id: 3,
      name: "500 Ml Ghee-GRB",
      amount: "₹5000.00",
      qty: 5,
      rate: "1,000/cases",
      discount: 0,
    },
    {
      id: 4,
      name: "500 Ml SP Buffalo Ghee-GRB",
      amount: "₹5,000.00",
      qty: 5,
      rate: "1,000/cases",
      discount: 0,
    },
    {
      id: 5,
      name: "500 Ml SP Buffalo Ghee-GRB",
      amount: "₹5,000.00",
      qty: 5,
      rate: "1,000/cases",
      discount: 0,
    },
    {
      id: 6,
      name: "500 Ml SP Buffalo Ghee-GRB",
      amount: "₹5,000.00",
      qty: 5,
      rate: "1,000/cases",
      discount: 0,
    },
  ];

  return (
    <section
      className="flex flex-col items-start gap-2 pt-2 pb-3 px-3.5 relative self-stretch w-full flex-[0_0_auto] overflow-y-scroll"
      aria-label="Ledger Details"
    >
      <header className="w-[306px] gap-2.5 px-0 py-1 ml-[-1.00px] mr-[-1.00px] bg-white border-b [border-bottom-style:solid] border-[#e6ecfd] flex flex-col items-start relative flex-[0_0_auto]">
        <div className="gap-2.5 flex flex-col items-start relative self-stretch w-full flex-[0_0_auto]">
          <div className="gap-2 flex flex-col items-start relative self-stretch w-full flex-[0_0_auto]">
            <div className="flex items-center justify-between relative self-stretch w-full flex-[0_0_auto]">
              <h2 className="relative w-fit mt-[-1.00px] [font-family:'Roboto',Helvetica] font-semibold text-[#0e172b] text-sm tracking-[0] leading-6 whitespace-nowrap">
                {ledgerHeader.title}
              </h2>

              <div className="inline-flex items-center gap-0.5 relative flex-[0_0_auto]">
                <span className="text-[#131313] relative w-fit mt-[-1.00px] [font-family:'Roboto',Helvetica] font-semibold text-[15px] tracking-[0] leading-6 whitespace-nowrap">
                  {ledgerHeader.amount}
                </span>

                <span className="relative w-fit [font-family:'Roboto',Helvetica] font-normal text-[#0e172b] text-xs tracking-[0] leading-[normal] whitespace-nowrap">
                  {ledgerHeader.type}
                </span>
              </div>
            </div>

            <div className="flex flex-col items-start gap-2 relative self-stretch w-full flex-[0_0_auto]">
              <div className="flex items-center gap-[5px] relative self-stretch w-full flex-[0_0_auto]">
                <div className="inline-flex items-center gap-2.5 pl-0 pr-2.5 py-0 relative flex-[0_0_auto] border-r [border-right-style:solid] border-[#d3d3d3]">
                  <time className="relative w-fit mt-[-1.00px] [font-family:'Roboto',Helvetica] font-medium text-[#6a7282] text-[13px] tracking-[0] leading-[normal] whitespace-nowrap">
                    {ledgerHeader.date}
                  </time>
                </div>

                <div className="inline-flex items-center gap-2.5 pl-0 pr-2.5 py-0 relative flex-[0_0_auto] border-r [border-right-style:solid] border-[#d3d3d3]">
                  <span className="relative w-fit mt-[-1.00px] [font-family:'Roboto',Helvetica] font-medium text-[#6a7282] text-[13px] tracking-[0] leading-[normal] whitespace-nowrap">
                    {ledgerHeader.transactionType}
                  </span>
                </div>

                <div className="inline-flex items-center relative flex-[0_0_auto]">
                  <span className="mt-[-1.00px] font-normal text-[#6a7282] text-[13px] leading-[normal] relative w-fit [font-family:'Roboto',Helvetica] tracking-[0] whitespace-nowrap">
                    #
                  </span>

                  <span className="relative w-fit mt-[-1.00px] [font-family:'Roboto',Helvetica] font-semibold text-[#6a7282] text-[13px] tracking-[0] leading-[normal] whitespace-nowrap">
                    {ledgerHeader.referenceNumber}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="flex flex-col w-[304px] items-center gap-2 relative flex-[0_0_auto] bg-[#fafafd] overflow-y-scroll">
        <div className="flex items-center justify-between relative self-stretch w-full flex-[0_0_auto]">
          <div className="inline-flex items-center gap-2.5 relative flex-[0_0_auto]">
            <div className="relative w-5 h-5" aria-hidden="true">
              <img
                className="absolute w-[75.00%] h-[83.32%] top-[10.84%] left-[12.50%]"
                alt=""
                src="/img/vector-1.svg"
              />

              <img
                className="absolute w-0 h-[41.67%] top-[52.50%] left-[50.00%]"
                alt=""
                src="/img/vector-2.svg"
              />

              <img
                className="absolute w-[72.58%] h-[20.83%] top-[31.66%] left-[13.71%]"
                alt=""
                src="/img/vector-3.svg"
              />

              <img
                className="absolute w-[37.50%] h-[21.46%] top-[20.29%] left-[31.25%]"
                alt=""
                src="/img/vector-4.svg"
              />
            </div>

            <h3 className="relative w-fit mt-[-1.00px] [font-family:'Roboto',Helvetica] font-semibold text-[#1e488f] text-[17px] tracking-[0] leading-[normal] whitespace-nowrap">
              Inventory Allocations ({inventoryItems.length})
            </h3>
          </div>

          <button
            className="relative w-[33.75px] h-[21px] bg-[#d3d3d3] rounded-[150px] overflow-hidden cursor-pointer"
            onClick={() => setIsInventoryExpanded(!isInventoryExpanded)}
            aria-label={
              isInventoryExpanded
                ? "Collapse inventory allocations"
                : "Expand inventory allocations"
            }
            aria-expanded={isInventoryExpanded}
          >
            <div
              className={`relative w-[44.44%] h-[71.43%] top-[14.29%] bg-neutrallightlightest rounded-[7.5px] transition-all duration-200 ${
                isInventoryExpanded ? "left-[8.89%]" : "left-[46.67%]"
              }`}
            />
          </button>
        </div>

        {isInventoryExpanded && (
          <div className="flex flex-col items-start relative self-stretch w-full flex-[0_0_auto]">
            {inventoryItems.map((item, index) => (
              <article
                key={item.id}
                className={`flex flex-col items-start gap-2.5 px-0 py-2 relative self-stretch w-full flex-[0_0_auto] ml-[-1.00px] mr-[-1.00px] bg-white border-b-2 [border-bottom-style:solid] border-[#e6ecfd] ${
                  index === 0 ? "mt-[-1.00px]" : ""
                } ${index === inventoryItems.length - 1 ? "mb-[-1.00px]" : ""}`}
              >
                <div className="gap-2.5 flex flex-col items-start relative self-stretch w-full flex-[0_0_auto]">
                  <div className="gap-2 flex flex-col items-start relative self-stretch w-full flex-[0_0_auto]">
                    <div className="flex items-center justify-between relative self-stretch w-full flex-[0_0_auto]">
                      <h4 className="relative w-fit mt-[-1.00px] [font-family:'Roboto',Helvetica] font-semibold text-[#0e172b] text-sm tracking-[0] leading-6 whitespace-nowrap">
                        {item.name}
                      </h4>

                      <div className="inline-flex items-center gap-0.5 relative flex-[0_0_auto]">
                        <span className="mt-[-1.00px] font-semibold text-[#0e172b] text-[15px] leading-6 relative w-fit [font-family:'Roboto',Helvetica] tracking-[0] whitespace-nowrap">
                          {item.amount}
                        </span>
                      </div>
                    </div>

                    <dl
                      className={`flex flex-col gap-[7px] relative self-stretch w-full flex-[0_0_auto] ${
                        index === 1 ? "items-center" : "items-start"
                      }`}
                    >
                      <div className="flex items-center justify-between px-0 py-0.5 relative self-stretch w-full flex-[0_0_auto]">
                        <div className="inline-flex items-center gap-[3px] relative flex-[0_0_auto]">
                          <dt className="relative w-fit mt-[-1.00px] [font-family:'Roboto',Helvetica] font-normal text-[#6a7282] text-[13px] tracking-[0] leading-[normal] whitespace-nowrap">
                            Qty
                          </dt>

                          <span
                            className="mt-[-0.50px] font-normal text-[#6a7282] text-xs leading-[normal] relative w-fit [font-family:'Roboto',Helvetica] tracking-[0] whitespace-nowrap"
                            aria-hidden="true"
                          >
                            :
                          </span>

                          <dd className="text-[#1e488f] underline relative w-fit mt-[-1.00px] [font-family:'Roboto',Helvetica] font-normal text-[13px] tracking-[0] leading-[normal] whitespace-nowrap">
                            {item.qty}
                          </dd>
                        </div>

                        <div className="inline-flex items-center gap-[3px] relative flex-[0_0_auto]">
                          <dt className="relative w-fit mt-[-1.00px] [font-family:'Roboto',Helvetica] font-normal text-[#6a7282] text-[13px] tracking-[0] leading-[normal] whitespace-nowrap">
                            Rate
                          </dt>

                          <span
                            className="mt-[-0.50px] font-normal text-[#6a7282] text-xs leading-[normal] relative w-fit [font-family:'Roboto',Helvetica] tracking-[0] whitespace-nowrap"
                            aria-hidden="true"
                          >
                            :
                          </span>

                          <dd className="relative w-fit mt-[-1.00px] [font-family:'Roboto',Helvetica] font-normal text-[#1e488f] text-[13px] tracking-[0] leading-[normal] underline whitespace-nowrap">
                            {item.rate}
                          </dd>
                        </div>

                        <div className="inline-flex items-center gap-[3px] relative flex-[0_0_auto]">
                          <dt className="relative w-fit mt-[-1.00px] [font-family:'Roboto',Helvetica] font-normal text-[#6a7282] text-[13px] tracking-[0] leading-[normal] whitespace-nowrap">
                            Discount
                          </dt>

                          <span
                            className="mt-[-0.50px] font-normal text-[#6a7282] text-xs leading-[normal] relative w-fit [font-family:'Roboto',Helvetica] tracking-[0] whitespace-nowrap"
                            aria-hidden="true"
                          >
                            :
                          </span>

                          <dd className="text-[#0e172b] relative w-fit mt-[-1.00px] [font-family:'Roboto',Helvetica] font-normal text-[13px] tracking-[0] leading-[normal] whitespace-nowrap">
                            {item.discount}
                          </dd>
                        </div>
                      </div>
                    </dl>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};
