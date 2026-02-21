export const StockSummarySection = () => {
  const stockItems = [
    {
      id: 1,
      title: "Other Products",
      quantity: "- - -",
      rate: "- - -",
      value: "(-)16,60,320.00",
      highlighted: false,
    },
    {
      id: 2,
      title: "Services",
      quantity: "- - -",
      rate: "- - -",
      value: "(-)3,47,44,384.00",
      highlighted: false,
    },
    {
      id: 3,
      title: "Tally",
      quantity: "(-)8 Nos",
      rate: "739.38",
      value: "(-)5,915.00",
      highlighted: false,
    },
    {
      id: 4,
      title: "Tally Virtual User Renewal",
      quantity: "10 Nos",
      rate: "1200.38",
      value: "12000.00",
      highlighted: true,
    },
  ];

  return (
    <section className="flex flex-col items-start relative self-stretch w-full flex-[0_0_auto]">
      <header className="flex flex-col w-[390px] items-start relative flex-[0_0_auto] bg-[#1e488f]">
        <div className="relative self-stretch w-full h-[47px]">
          <div className="relative w-px h-px top-3.5 left-[27px]" />
        </div>

        <div className="items-center justify-between px-4 py-[3px] flex relative self-stretch w-full flex-[0_0_auto]">
          <div className="inline-flex items-center relative flex-[0_0_auto]">
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
                Stock Summary
              </h1>
            </div>
          </div>

          <button aria-label="More options">
            <img
              className="relative flex-[0_0_auto]"
              alt=""
              src="/img/icons.svg"
            />
          </button>
        </div>
      </header>

      <div className="flex-col items-start flex relative self-stretch w-full flex-[0_0_auto]">
        <div className="flex flex-col w-[390.45px] items-start gap-2 pt-1 pb-0 px-4 relative flex-[0_0_auto] mr-[-0.45px] bg-[#e6ecfd]">
          <div className="flex items-center justify-between pt-0 pb-1.5 px-0.5 relative self-stretch w-full flex-[0_0_auto] border-b [border-bottom-style:solid] border-[#c4d4ff]">
            <div className="relative w-5 h-5">
              <img
                className="absolute w-[70.05%] h-[71.58%] top-[15.00%] left-[11.91%]"
                alt=""
                src="/img/union.svg"
              />
            </div>

            <div className="flex items-center gap-1.5 relative flex-1 grow">
              <div className="relative w-[139px] h-5">
                <div className="absolute top-[calc(50.00%_-_7px)] left-1 [font-family:'Roboto',Helvetica] font-medium text-[#0e172b] text-[13px] tracking-[0] leading-[normal] whitespace-nowrap">
                  Primary
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-start gap-2 px-4 py-1 relative self-stretch w-full flex-[0_0_auto] bg-[#e6ecfd]">
          <div className="flex items-center gap-1.5 pt-0 pb-1 px-0.5 relative self-stretch w-full flex-[0_0_auto] bg-[#ffffff1a]">
            <div className="relative w-[18px] h-[18px]">
              <img
                className="absolute w-[75.00%] h-[83.33%] top-[5.19%] left-[9.36%]"
                alt=""
                src="/img/vector.svg"
              />
            </div>

            <time className="relative flex items-center justify-center w-fit [font-family:'Roboto',Helvetica] font-semibold text-[#0e172b] text-[13px] tracking-[0] leading-[normal] whitespace-nowrap">
              01-Jun-25 – 06-Jan-26
            </time>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between px-4 py-0 relative self-stretch w-full flex-[0_0_auto] bg-[#d3d3d3]">
        <div className="flex w-[186px] items-center gap-2.5 px-0 py-2 relative">
          <div className="relative flex-1 mt-[-1.00px] [font-family:'Roboto',Helvetica] font-semibold text-[#0e172b] text-sm tracking-[0] leading-[normal]">
            Particulars &amp; Qty
          </div>
        </div>

        <div className="flex items-center gap-[42px] relative flex-1 grow">
          <div className="inline-flex items-center justify-center gap-2.5 px-0 py-2 relative flex-[0_0_auto]">
            <div className="relative w-fit mt-[-1.00px] [font-family:'Roboto',Helvetica] font-semibold text-[#0e172b] text-sm tracking-[0] leading-[normal] whitespace-nowrap">
              Rate
            </div>
          </div>

          <div className="inline-flex px-0 py-2 flex-[0_0_auto] items-center gap-2.5 relative">
            <div className="relative w-fit mt-[-1.00px] [font-family:'Roboto',Helvetica] font-semibold text-[#0e172b] text-sm tracking-[0] leading-[normal] whitespace-nowrap">
              Value
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col items-start relative self-stretch w-full flex-[0_0_auto]">
        {stockItems.map((item, index) => (
          <div
            key={item.id}
            className={`flex flex-col items-start gap-2 px-4 ${
              item.highlighted ? "py-2.5 bg-[#f1c74b33]" : "py-0 bg-white"
            } relative self-stretch w-full flex-[0_0_auto]`}
          >
            {!item.highlighted && index < 3 && (
              <div className="flex flex-col w-[358px] items-start gap-[7px] relative flex-[0_0_auto] bg-white">
                <div className="flex flex-col items-start gap-2 px-0 py-1.5 relative self-stretch w-full flex-[0_0_auto] border-b [border-bottom-style:solid] border-[#c4d4ff]">
                  <div className="flex items-center justify-between relative self-stretch w-full flex-[0_0_auto]">
                    <div className="flex items-center justify-center gap-2.5 relative flex-1 grow">
                      <h2 className="relative flex-1 mt-[-1.00px] [font-family:'Roboto',Helvetica] font-semibold text-[#0e172b] text-[13px] tracking-[0] leading-[normal]">
                        {item.title}
                      </h2>
                    </div>
                  </div>

                  <div className="flex h-[15px] items-start gap-2 relative self-stretch w-full">
                    <div className="flex items-center gap-[5px] relative flex-1 grow">
                      <div className="w-[186px] flex items-center gap-2.5 pl-0 pr-2.5 py-0 relative">
                        <div className="relative w-fit mt-[-1.00px] [font-family:'Roboto',Helvetica] font-normal text-[#6a7282] text-[13px] tracking-[0] leading-[normal] whitespace-nowrap">
                          {item.quantity}
                        </div>
                      </div>

                      <div className="flex items-center gap-5 relative flex-1 grow">
                        <div className="flex items-center gap-2.5 pl-0 pr-2.5 py-0 relative flex-1 grow">
                          <div className="relative w-fit mt-[-1.00px] [font-family:'Roboto',Helvetica] font-normal text-[#6a7282] text-[13px] tracking-[0] leading-[normal] whitespace-nowrap">
                            {item.rate}
                          </div>
                        </div>

                        <div
                          className={`${
                            index === 2
                              ? "inline-flex flex-[0_0_auto]"
                              : "flex w-[101px]"
                          } items-center gap-2.5 relative`}
                        >
                          <div
                            className={`${
                              index === 2 ? "w-fit whitespace-nowrap" : "flex-1"
                            } font-semibold relative mt-[-1.00px] [font-family:'Roboto',Helvetica] text-[#0e172b] text-[13px] tracking-[0] leading-[normal]`}
                          >
                            {item.value}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {index === 2 && (
              <div className="flex flex-col h-[15px] items-start gap-2 relative self-stretch w-full">
                <div className="flex items-center justify-between relative self-stretch w-full flex-[0_0_auto]">
                  <div className="flex w-[185px] h-[9px] items-center gap-2.5 pl-0 pr-2.5 py-0 relative">
                    <div className="relative w-fit mt-[-4.00px] mb-[-2.00px] [font-family:'Roboto',Helvetica] font-normal text-[#0e172b] text-[13px] tracking-[0] leading-[normal] whitespace-nowrap">
                      {item.quantity}
                    </div>
                  </div>

                  <div className="gap-5 flex w-[172px] items-center relative self-stretch">
                    <div className="w-[51px] justify-end flex items-center gap-2.5 pl-0 pr-2.5 py-0 relative">
                      <div className="w-[41px] font-normal relative mt-[-1.00px] [font-family:'Roboto',Helvetica] text-[#0e172b] text-[13px] tracking-[0] leading-[normal]">
                        {item.rate}
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2.5 relative flex-1 grow">
                      <div className="w-fit font-semibold whitespace-nowrap relative mt-[-1.00px] [font-family:'Roboto',Helvetica] text-[#0e172b] text-[13px] tracking-[0] leading-[normal]">
                        {item.value}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {item.highlighted && (
              <>
                <div className="justify-around gap-[41px] flex items-center relative self-stretch w-full flex-[0_0_auto]">
                  <div className="flex items-center justify-center gap-2.5 relative flex-1 grow">
                    <h2 className="relative flex-1 mt-[-1.00px] [font-family:'Roboto',Helvetica] font-semibold text-[#0e172b] text-[13px] tracking-[0] leading-[normal]">
                      {item.title}
                    </h2>
                  </div>
                </div>

                <div className="flex flex-col h-[15px] items-start gap-2 relative self-stretch w-full">
                  <div className="flex items-center justify-between relative self-stretch w-full flex-[0_0_auto]">
                    <div className="flex items-center gap-2.5 pl-0 pr-2.5 py-0 relative flex-1 grow">
                      <div className="relative w-fit mt-[-1.00px] [font-family:'Roboto',Helvetica] font-normal text-[#0e172b] text-[13px] tracking-[0] leading-[normal] whitespace-nowrap">
                        {item.quantity}
                      </div>
                    </div>

                    <div className="gap-[23px] flex w-[172px] items-center relative self-stretch">
                      <div className="flex w-12 items-center gap-2.5 pl-0 pr-2.5 py-0 relative">
                        <div className="w-fit mr-[-10.00px] font-normal whitespace-nowrap relative mt-[-1.00px] [font-family:'Roboto',Helvetica] text-[#0e172b] text-[13px] tracking-[0] leading-[normal]">
                          {item.rate}
                        </div>
                      </div>

                      <div className="flex items-center justify-end gap-2.5 relative flex-1 grow">
                        <div className="w-fit font-semibold whitespace-nowrap relative mt-[-1.00px] [font-family:'Roboto',Helvetica] text-[#0e172b] text-[13px] tracking-[0] leading-[normal]">
                          {item.value}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </section>
  );
};
