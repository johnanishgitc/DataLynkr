import { useState } from "react";

export const OrderEntrySection = () => {
  const [isPartyDetailsExpanded, setIsPartyDetailsExpanded] = useState(false);

  const items = [
    {
      id: 1,
      name: "500 Ml SP Buffalo Ghee-GRB",
      quantity: 1,
      price: 1000,
      discount: 0,
      total: 1000.0,
      stock: 12,
      taxPercent: 5,
    },
  ];

  return (
    <section className="flex flex-col items-start relative self-stretch w-full flex-[0_0_auto]">
      <header className="flex flex-col w-[390px] items-start relative flex-[0_0_auto] bg-[#1e488f]">
        <div className="relative self-stretch w-full h-[47px]">
          <div className="absolute top-3.5 left-[calc(50.00%_-_168px)] w-[54px] h-[21px] flex justify-center">
            <div className="w-[54px] h-[21px] flex rounded-3xl">
              <time className="mt-px w-[54px] h-5 font-default-bold-body font-[number:var(--default-bold-body-font-weight)] text-transparent text-[length:var(--default-bold-body-font-size)] text-center tracking-[var(--default-bold-body-letter-spacing)] leading-[var(--default-bold-body-line-height)] whitespace-nowrap [font-style:var(--default-bold-body-font-style)]">
                9:41
              </time>
            </div>
          </div>

          <img
            className="absolute top-[19px] left-[calc(50.00%_+_91px)] w-[77px] h-[13px]"
            alt="Battery and signal indicators"
            src="/img/right-side.png"
          />
        </div>

        <div className="items-center justify-around px-4 py-[3px] flex relative self-stretch w-full flex-[0_0_auto]">
          <div className="flex items-center relative flex-1 grow">
            <button
              className="inline-flex items-center gap-2.5 px-0 py-[9px] relative flex-[0_0_auto]"
              aria-label="Open menu"
            >
              <div className="relative w-6 h-6">
                <img
                  className="absolute w-[75.00%] h-[58.33%] top-[16.67%] left-[8.33%]"
                  alt=""
                  src="/img/manu.svg"
                />
              </div>
            </button>

            <div className="inline-flex flex-col items-start gap-2.5 px-[5px] py-[11px] relative flex-[0_0_auto]">
              <h1 className="relative w-fit mt-[-1.00px] [font-family:'Roboto',Helvetica] font-semibold text-white text-[17px] tracking-[0] leading-[normal] whitespace-nowrap">
                Order Entry
              </h1>
            </div>
          </div>
        </div>
      </header>

      <main className="flex flex-col items-start gap-2.5 relative self-stretch w-full flex-[0_0_auto]">
        <div className="flex-col items-start flex relative self-stretch w-full flex-[0_0_auto]">
          <div className="flex-col w-[390.45px] items-start gap-2 pt-1 pb-0 px-4 mr-[-0.45px] bg-[#e6ecfd] flex relative flex-[0_0_auto]">
            <button
              className="flex items-center justify-between pt-0 pb-1.5 px-0.5 relative self-stretch w-full flex-[0_0_auto] border-b [border-bottom-style:solid] border-[#c4d4ff]"
              aria-label="Akhil Marketing details"
            >
              <div className="flex items-center gap-1.5 relative flex-1 grow">
                <div className="relative w-[18px] h-[18px] aspect-[1]">
                  <img
                    className="absolute w-[79.43%] h-[77.79%] top-[9.35%] left-[9.36%]"
                    alt=""
                    src="/img/vector.svg"
                  />
                </div>

                <div className="relative w-[139px] h-5">
                  <span className="absolute top-[calc(50.00%_-_7px)] left-px [font-family:'Roboto',Helvetica] font-medium text-[#0e172b] text-[13px] tracking-[0] leading-[normal] whitespace-nowrap">
                    Akhil Marketing
                  </span>
                </div>
              </div>

              <div className="relative w-5 h-5">
                <img
                  className="absolute w-[70.05%] h-[71.58%] top-[15.00%] left-[16.91%]"
                  alt=""
                  src="/img/union.svg"
                />
              </div>
            </button>
          </div>

          <div className="flex flex-col w-[390.45px] items-start gap-2 pt-1 pb-0 px-4 relative flex-[0_0_auto] mr-[-0.45px] bg-[#e6ecfd]">
            <button
              className="justify-between pt-0 pb-1.5 px-0 border-b [border-bottom-style:solid] border-[#c4d4ff] flex items-center relative self-stretch w-full flex-[0_0_auto]"
              onClick={() => setIsPartyDetailsExpanded(!isPartyDetailsExpanded)}
              aria-expanded={isPartyDetailsExpanded}
              aria-label="Toggle party details"
            >
              <div className="flex items-center gap-1.5 relative flex-1 grow">
                <div className="relative w-[18px] h-[18px]">
                  <img
                    className="absolute w-[75.00%] h-[58.33%] top-[16.67%] left-[8.33%]"
                    alt=""
                    src="/img/vector-1.svg"
                  />
                </div>

                <div className="relative w-[139px] h-5">
                  <span className="absolute top-[calc(50.00%_-_7px)] left-px [font-family:'Roboto',Helvetica] font-medium text-[#0e172b] text-[13px] tracking-[0] leading-[normal] whitespace-nowrap">
                    Party Details
                  </span>
                </div>
              </div>

              <div className="relative w-5 h-5 -rotate-90">
                <img
                  className="absolute w-[68.75%] h-[37.50%] top-[18.75%] left-[31.25%] rotate-90"
                  alt=""
                  src="/img/vector-2.svg"
                />
              </div>
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between px-4 py-0 relative self-stretch w-full flex-[0_0_auto]">
          <div className="inline-flex items-center gap-2 relative flex-[0_0_auto]">
            <div className="inline-flex items-center justify-center gap-1 px-2.5 py-1.5 relative flex-[0_0_auto] bg-[#eb21221a] rounded border-[0.5px] border-solid border-red">
              <span className="relative w-fit mt-[-0.50px] [font-family:'Roboto',Helvetica] font-normal text-[#0e172b] text-[13px] tracking-[0] leading-[normal] whitespace-nowrap">
                Closing Balance:
              </span>

              <span className="relative w-fit mt-[-0.50px] [font-family:'Roboto',Helvetica] font-medium text-red text-[13px] tracking-[0] leading-[normal] underline whitespace-nowrap">
                ₹94652.46 Dr
              </span>
            </div>
          </div>

          <p className="relative w-fit [font-family:'Roboto',Helvetica] font-normal text-transparent text-[13px] tracking-[0] leading-[normal] whitespace-nowrap">
            <span className="text-[#0e172b]">Credit Limit: </span>

            <span className="font-medium text-[#39b57c]">₹0.00 Cr</span>
          </p>
        </div>

        <div className="items-end gap-2.5 px-4 py-0 self-stretch w-full flex relative flex-[0_0_auto]">
          <div className="flex flex-col items-start gap-1 relative flex-1 grow">
            <label
              htmlFor="item-select"
              className="relative self-stretch h-5 mt-[-1.00px] [font-family:'Roboto',Helvetica] font-normal text-[#6a7282] text-sm tracking-[0] leading-5 whitespace-nowrap"
            >
              Select Item
            </label>

            <div className="gap-[215px] px-3 py-2.5 bg-white rounded border border-solid border-[#d3d3d3] flex items-center relative self-stretch w-full flex-[0_0_auto]">
              <select
                id="item-select"
                className="relative flex-1 grow h-5 [font-family:'Roboto',Helvetica] font-normal text-[#0e172b] text-[15px] tracking-[0] leading-5 whitespace-nowrap appearance-none bg-transparent border-0 outline-none"
                defaultValue=""
              >
                <option value="" disabled>
                  Select Item Name
                </option>
              </select>

              <div className="relative w-5 h-5 pointer-events-none">
                <img
                  className="absolute w-[68.75%] h-[37.50%] top-[34.38%] left-[15.62%]"
                  alt=""
                  src="/img/vector-3.svg"
                />
              </div>
            </div>
          </div>

          <button
            className="inline-flex items-center gap-2.5 p-[11px] relative flex-[0_0_auto] bg-white rounded overflow-hidden border border-solid border-[#d3d3d3]"
            aria-label="Scan barcode"
          >
            <img
              className="relative w-5 h-[20.01px] mt-[-1.00px] mb-[-1.00px] ml-[-1.00px] mr-[-1.00px]"
              alt=""
              src="/img/vector-4.svg"
            />
          </button>
        </div>

        <div className="flex flex-col w-[390px] items-center gap-2 p-4 relative flex-[0_0_auto] bg-white overflow-y-scroll">
          <div className="flex items-center gap-2.5 relative self-stretch w-full flex-[0_0_auto]">
            <div className="relative w-5 h-5" aria-hidden="true">
              <img
                className="absolute w-[75.00%] h-[83.32%] top-[8.34%] left-[12.50%]"
                alt=""
                src="/img/vector-5.svg"
              />

              <img
                className="absolute w-0 h-[41.67%] top-[50.00%] left-[50.00%]"
                alt=""
                src="/img/vector-6.svg"
              />

              <img
                className="absolute w-[72.58%] h-[20.83%] top-[29.16%] left-[13.71%]"
                alt=""
                src="/img/vector-7.svg"
              />

              <img
                className="absolute w-[37.50%] h-[21.46%] top-[17.79%] left-[31.25%]"
                alt=""
                src="/img/vector-8.svg"
              />
            </div>

            <h2 className="relative w-fit mt-[-1.00px] [font-family:'Roboto',Helvetica] font-semibold text-[#1e488f] text-[17px] tracking-[0] leading-[normal] whitespace-nowrap">
              Items ({items.length})
            </h2>
          </div>

          {items.map((item) => (
            <article
              key={item.id}
              className="flex flex-col w-[360px] items-start gap-2.5 px-0 py-2 relative flex-[0_0_auto] ml-[-1.00px] mr-[-1.00px] bg-white border-b-2 [border-bottom-style:solid] border-[#e6ecfd]"
            >
              <div className="flex flex-col items-start gap-2.5 relative self-stretch w-full flex-[0_0_auto]">
                <div className="flex-col gap-2 flex items-start relative self-stretch w-full flex-[0_0_auto]">
                  <div className="flex items-center justify-between relative self-stretch w-full flex-[0_0_auto]">
                    <h3 className="relative w-fit [font-family:'Roboto',Helvetica] font-semibold text-[#0e172b] text-sm tracking-[0] leading-[normal] whitespace-nowrap">
                      {item.name}
                    </h3>

                    <div className="inline-flex items-center justify-end gap-2 relative flex-[0_0_auto]">
                      <button
                        className="flex flex-col w-6 h-6 items-center justify-center gap-2.5 relative bg-[#d3d3d3] rounded-[50px]"
                        aria-label="Remove item"
                      >
                        <img
                          className="relative w-4 h-1"
                          alt=""
                          src="/img/icon.svg"
                        />
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-col items-start gap-[7px] relative self-stretch w-full flex-[0_0_auto]">
                    <div className="flex items-start justify-between px-0 py-0.5 relative self-stretch w-full flex-[0_0_auto]">
                      <div className="inline-flex items-center gap-[3px] relative flex-[0_0_auto]">
                        <span className="relative w-fit mt-[-1.00px] [font-family:'Roboto',Helvetica] font-normal text-[#6a7282] text-[13px] tracking-[0] leading-[normal] whitespace-nowrap">
                          Qty
                        </span>

                        <span className="relative w-fit mt-[-0.50px] [font-family:'Roboto',Helvetica] font-normal text-[#6a7282] text-xs tracking-[0] leading-[normal] whitespace-nowrap">
                          :
                        </span>

                        <p className="relative w-fit mt-[-1.00px] [font-family:'Roboto',Helvetica] font-normal text-transparent text-[13px] tracking-[0] leading-[normal] whitespace-nowrap">
                          <span className="text-[#0e172b]">
                            {item.quantity} x ₹{item.price} ({item.quantity}-{" "}
                            {item.discount}%) =
                          </span>

                          <span className="font-semibold text-[#0e172b]">
                            &nbsp;
                          </span>

                          <span className="font-bold text-[#39b57c]">
                            ₹{item.total.toFixed(2)}
                          </span>
                        </p>
                      </div>

                      <div className="inline-flex flex-col h-[15px] items-start gap-2 relative flex-[0_0_auto]">
                        <div className="flex items-center gap-[5px] relative self-stretch w-full flex-[0_0_auto]">
                          <div className="inline-flex items-center gap-2.5 pl-0 pr-2.5 py-0 relative flex-[0_0_auto] border-r [border-right-style:solid] border-[#d3d3d3]">
                            <p className="relative w-fit mt-[-1.00px] [font-family:'Roboto',Helvetica] font-normal text-transparent text-[13px] tracking-[0] leading-[normal] whitespace-nowrap">
                              <span className="text-[#6a7282]">Stock :</span>

                              <span className="font-medium text-[#6a7282]">
                                &nbsp;
                              </span>

                              <span className="font-semibold text-[#1e488f] underline">
                                {item.stock}
                              </span>
                            </p>
                          </div>

                          <div className="inline-flex items-center gap-2.5 relative flex-[0_0_auto]">
                            <p className="relative w-fit mt-[-1.00px] [font-family:'Roboto',Helvetica] font-normal text-transparent text-[13px] tracking-[0] leading-[normal] whitespace-nowrap">
                              <span className="text-[#6a7282]">Tax% : </span>

                              <span className="text-[#0e172b]">
                                {item.taxPercent}%
                              </span>
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      </main>
    </section>
  );
};
