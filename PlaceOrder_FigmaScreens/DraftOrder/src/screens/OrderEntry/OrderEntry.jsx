import { useState } from "react";

export const OrderEntry = () => {
  const [isDraftMode, setIsDraftMode] = useState(true);
  const [description, setDescription] = useState("");

  const attachments = [
    { id: 1, label: "Attachment  #1" },
    { id: 2, label: "Attachment  #2" },
  ];

  const handleClearAll = () => {
    setDescription("");
  };

  const handlePlaceOrder = () => {
    console.log("Order placed");
  };

  return (
    <div
      className="inline-flex flex-col h-[844px] items-start pt-0 pb-2.5 px-0 relative bg-white"
      data-model-id="5067:55074"
    >
      <div className="flex flex-col w-[390px] items-start justify-between relative flex-1 grow">
        <div className="flex flex-col items-start relative self-stretch w-full flex-[0_0_auto]">
          <header className="flex flex-col w-[390px] items-start relative flex-[0_0_auto] bg-[#0e172b]">
            <div className="relative self-stretch w-full h-[47px]" />

            <div className="items-center justify-between px-4 py-[3px] flex relative self-stretch w-full flex-[0_0_auto]">
              <div className="flex items-center relative flex-1 grow">
                <button
                  className="inline-flex items-center gap-2.5 px-0 py-[9px] relative flex-[0_0_auto]"
                  aria-label="Menu"
                >
                  <div className="relative w-6 h-6">
                    <img
                      className="absolute w-[91.67%] h-[83.33%] top-[16.67%] left-[8.33%]"
                      alt="Menu"
                      src="/img/manu.svg"
                    />
                  </div>
                </button>

                <div className="inline-flex flex-col items-start gap-2.5 px-[5px] py-[11px] relative flex-[0_0_auto]">
                  <h1 className="relative w-fit mt-[-1.00px] [font-family:'Roboto',Helvetica] font-semibold text-white text-[17px] tracking-[0] leading-[normal] whitespace-nowrap">
                    Draft Mode
                  </h1>
                </div>
              </div>

              <div className="inline-flex items-center relative flex-[0_0_auto]">
                <button
                  className="relative w-[38.57px] h-6 bg-[#39b57c] rounded-[200px] overflow-hidden aspect-[1.61]"
                  onClick={() => setIsDraftMode(!isDraftMode)}
                  role="switch"
                  aria-checked={isDraftMode}
                  aria-label="Toggle draft mode"
                >
                  <div className="relative w-[44.44%] h-[71.43%] top-[14.29%] left-[46.67%] bg-neutrallightlightest rounded-[8.57px]" />
                </button>
              </div>
            </div>
          </header>

          <div className="flex flex-col items-start gap-2.5 relative self-stretch w-full flex-[0_0_auto]">
            <div className="flex-col items-start flex relative self-stretch w-full flex-[0_0_auto]">
              <div className="flex flex-col w-[390.45px] items-start gap-2 pt-1 pb-0 px-4 relative flex-[0_0_auto] mr-[-0.45px] bg-[#e6ecfd]">
                <div className="flex items-center justify-between pt-0 pb-1.5 px-0.5 relative self-stretch w-full flex-[0_0_auto] border-b [border-bottom-style:solid] border-[#c4d4ff]">
                  <div className="flex items-center gap-1.5 relative flex-1 grow">
                    <div className="relative w-[18px] h-[18px] aspect-[1]">
                      <img
                        className="absolute w-[90.64%] h-[90.65%] top-[9.35%] left-[9.36%]"
                        alt=""
                        src="/img/vector.svg"
                      />
                    </div>

                    <div className="relative w-[139px] h-5">
                      <p className="absolute top-[calc(50.00%_-_7px)] left-px [font-family:'Roboto',Helvetica] font-medium text-[#131313] text-[13px] tracking-[0] leading-[normal] whitespace-nowrap">
                        Akhil Marketing
                      </p>
                    </div>
                  </div>

                  <button className="relative w-5 h-5" aria-label="Search">
                    <img
                      className="absolute w-[83.09%] h-[85.00%] top-[15.00%] left-[16.91%]"
                      alt=""
                      src="/img/union.svg"
                    />
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between px-4 py-0 relative self-stretch w-full flex-[0_0_auto]">
              <div className="inline-flex items-center gap-2 relative flex-[0_0_auto]">
                <div className="inline-flex items-center justify-center gap-1 px-2.5 py-1.5 relative flex-[0_0_auto] bg-[#eb21221a] rounded border-[0.5px] border-solid border-red">
                  <span className="relative w-fit mt-[-0.50px] [font-family:'Roboto',Helvetica] font-normal text-[#0e172b] text-[13px] tracking-[0] leading-[normal] whitespace-nowrap">
                    Receivable:
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

            <div className="flex items-end gap-2.5 px-4 py-0 relative self-stretch w-full flex-[0_0_auto]">
              <div className="flex flex-col w-[358px] items-start gap-2.5 relative">
                <div className="flex flex-col items-start gap-1 relative self-stretch w-full flex-[0_0_auto]">
                  <div className="flex items-end justify-between relative self-stretch w-full flex-[0_0_auto]">
                    <label
                      htmlFor="description"
                      className="relative w-fit mt-[-1.00px] [font-family:'Roboto',Helvetica] font-normal text-[#6a7282] text-sm tracking-[0] leading-[normal] whitespace-nowrap"
                    >
                      Description
                    </label>

                    <span className="relative w-fit [font-family:'Roboto',Helvetica] font-normal text-[#6a7282] text-[10px] tracking-[0] leading-[normal] whitespace-nowrap">
                      (max 500 characters)
                    </span>
                  </div>

                  <textarea
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    maxLength={500}
                    className="w-full h-[133px] px-3 py-1.5 bg-white rounded border border-solid border-[#d3d3d3] [font-family:'Roboto',Helvetica] text-[#0e172b] text-sm resize-none"
                    placeholder=""
                  />
                </div>
              </div>
            </div>

            <section className="flex flex-col w-[390px] items-center gap-2 p-4 relative flex-[0_0_auto] bg-white overflow-y-scroll">
              <div className="flex items-center gap-2.5 relative self-stretch w-full flex-[0_0_auto]">
                <div className="relative w-5 h-5">
                  <img
                    className="absolute w-[87.50%] h-[91.66%] top-[8.34%] left-[12.50%]"
                    alt=""
                    src="/img/vector-1.svg"
                  />

                  <img
                    className="absolute w-[50.00%] h-[50.00%] top-[50.00%] left-[50.00%]"
                    alt=""
                    src="/img/vector-2.svg"
                  />

                  <img
                    className="absolute w-[86.29%] h-[70.84%] top-[29.16%] left-[13.71%]"
                    alt=""
                    src="/img/vector-3.svg"
                  />

                  <img
                    className="absolute w-[68.75%] h-[82.21%] top-[17.79%] left-[31.25%]"
                    alt=""
                    src="/img/vector-4.svg"
                  />
                </div>

                <h2 className="relative w-fit mt-[-1.00px] [font-family:'Roboto',Helvetica] font-semibold text-[#1e488f] text-[17px] tracking-[0] leading-[normal] whitespace-nowrap">
                  Attachments
                </h2>
              </div>

              {attachments.map((attachment) => (
                <article
                  key={attachment.id}
                  className="flex flex-col w-[360px] items-start gap-2.5 px-0 py-2 relative flex-[0_0_auto] ml-[-1.00px] mr-[-1.00px] bg-white border-b-2 [border-bottom-style:solid] border-[#e6ecfd]"
                >
                  <div className="flex-col gap-2.5 flex items-start relative self-stretch w-full flex-[0_0_auto]">
                    <div className="flex flex-col items-start gap-2 relative self-stretch w-full flex-[0_0_auto]">
                      <div className="flex items-center justify-between relative self-stretch w-full flex-[0_0_auto]">
                        <h3 className="relative w-fit [font-family:'Roboto',Helvetica] font-semibold text-[#0e172b] text-sm tracking-[0] leading-[normal] whitespace-nowrap">
                          {attachment.label}
                        </h3>

                        <div className="inline-flex items-center justify-end gap-2 relative flex-[0_0_auto]">
                          {attachment.id === 1 ? (
                            <button
                              className="flex flex-col w-6 h-6 items-center justify-center gap-2.5 relative bg-[#d3d3d3] rounded-[50px]"
                              aria-label="More options"
                            >
                              <img
                                className="relative w-4 h-1"
                                alt=""
                                src="/img/icon.svg"
                              />
                            </button>
                          ) : (
                            <button aria-label="More options">
                              <img
                                className="relative w-6 h-6"
                                alt=""
                                src="/img/more.svg"
                              />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </section>
          </div>
        </div>

        <footer className="flex flex-col w-[390px] items-start gap-2 relative flex-[0_0_auto] bg-white">
          <div className="flex flex-col items-start gap-2.5 px-4 py-0 relative self-stretch w-full flex-[0_0_auto] bg-white">
            <div className="flex-col gap-2.5 flex items-start relative self-stretch w-full flex-[0_0_auto]">
              <div className="gap-2 flex items-start relative self-stretch w-full flex-[0_0_auto]">
                <button
                  className="flex w-10 items-center justify-center gap-2.5 px-[15px] py-2.5 relative bg-[#f1c74b] rounded-[100px] overflow-hidden"
                  aria-label="Attach file"
                >
                  <img
                    className="relative w-[20.66px] h-[22px] mt-[-1.00px] mb-[-1.00px] ml-[-5.33px] mr-[-5.33px]"
                    alt=""
                    src="/img/vector-5.svg"
                  />
                </button>

                <button
                  onClick={handleClearAll}
                  className="flex items-center justify-center gap-2 px-6 py-2.5 relative flex-1 grow bg-[#d3d3d3] rounded"
                >
                  <span className="relative w-fit mt-[-1.00px] [font-family:'Roboto',Helvetica] font-medium text-[#0e172b] text-[15px] text-center tracking-[0] leading-5 whitespace-nowrap">
                    Clear All
                  </span>
                </button>

                <button
                  onClick={handlePlaceOrder}
                  className="flex items-center justify-center gap-2 px-6 py-2.5 relative flex-1 grow bg-[#39b57c] rounded"
                >
                  <span className="relative w-fit mt-[-1.00px] [font-family:'Roboto',Helvetica] font-medium text-white text-[15px] text-center tracking-[0] leading-5 whitespace-nowrap">
                    Place Order
                  </span>
                </button>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
};
