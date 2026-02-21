export const StockSummaryContentSection = () => {
  const monthlyData = [
    { month: "Apr'25" },
    { month: "May' 25" },
    { month: "Jun' 25" },
    { month: "Jul' 25" },
    { month: "Aug' 25" },
    { month: "Sep' 25" },
    { month: "Oct' 25" },
  ];

  const renderInwardsIcon = () => (
    <div className="w-[15.99px] h-[15.99px] relative aspect-[1]">
      <img
        className="absolute w-[83.33%] h-[83.33%] top-[8.33%] left-[6.26%]"
        alt="Vector"
        src="/img/vector-43.svg"
      />
      <img
        className="absolute w-0 h-[33.33%] top-[33.32%] left-[47.93%]"
        alt="Vector"
        src="/img/vector-44.svg"
      />
      <img
        className="absolute w-[33.33%] h-[16.67%] top-[50.01%] left-[31.26%]"
        alt="Vector"
        src="/img/vector-45.svg"
      />
    </div>
  );

  const renderOutwardsIcon = () => (
    <div className="relative w-[15.99px] h-[15.99px]">
      <img
        className="absolute w-[83.33%] h-[83.33%] top-[8.33%] left-[6.26%]"
        alt="Vector"
        src="/img/vector-46.svg"
      />
      <img
        className="absolute w-[33.33%] h-[16.67%] top-[33.32%] left-[31.26%]"
        alt="Vector"
        src="/img/vector-47.svg"
      />
      <img
        className="absolute w-0 h-[33.33%] top-[33.32%] left-[47.93%]"
        alt="Vector"
        src="/img/vector-48.svg"
      />
    </div>
  );

  const renderDataRow = (label, type = null) => (
    <div className="flex items-center justify-between relative self-stretch w-full flex-[0_0_auto]">
      <div className="inline-flex items-center gap-1.5 relative flex-[0_0_auto]">
        {type === "inwards" && renderInwardsIcon()}
        {type === "outwards" && renderOutwardsIcon()}
        {type && (
          <div className="relative w-fit mt-[-1.00px] [font-family:'Roboto',Helvetica] font-normal text-[#354152] text-[13px] text-center tracking-[0] leading-5 whitespace-nowrap">
            {label}
          </div>
        )}
        {!type && (
          <div className="inline-flex flex-[0_0_auto] items-center gap-2.5 pl-0 pr-2.5 py-0 relative">
            <div className="relative w-fit mt-[-1.00px] [font-family:'Roboto',Helvetica] font-normal text-[#0e172b] text-[13px] tracking-[0] leading-[normal] whitespace-nowrap">
              {label}
            </div>
          </div>
        )}
      </div>
      <div className="flex w-[172px] items-center gap-[23px] relative self-stretch">
        <div className="flex w-12 items-center gap-2.5 pl-0 pr-2.5 py-0 relative">
          <div className="relative w-fit mt-[-1.00px] [font-family:'Roboto',Helvetica] font-normal text-[#0e172b] text-[13px] tracking-[0] leading-[normal] whitespace-nowrap">
            - - - -
          </div>
        </div>
        <div className="flex items-center justify-end gap-2.5 relative flex-1 grow">
          <div className="relative w-fit mt-[-1.00px] [font-family:'Roboto',Helvetica] font-normal text-[#0e172b] text-[13px] tracking-[0] leading-[normal] whitespace-nowrap">
            - - - -
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col items-start relative self-stretch w-full flex-[0_0_auto]">
      <header className="flex flex-col w-[390px] items-start relative flex-[0_0_auto] bg-[#1e488f]">
        <div className="relative self-stretch w-full h-[47px]" />

        <div className="items-center justify-between px-4 py-[3px] flex relative self-stretch w-full flex-[0_0_auto]">
          <div className="inline-flex items-center relative flex-[0_0_auto]">
            <button
              className="inline-flex items-center gap-2.5 px-0 py-[9px] relative flex-[0_0_auto]"
              aria-label="Go back"
            >
              <div className="relative w-6 h-6">
                <img
                  className="absolute w-[29.57%] h-[66.00%] top-[12.83%] left-[8.33%]"
                  alt="Back"
                  src="/img/back.svg"
                />
              </div>
            </button>

            <div className="inline-flex flex-col items-start gap-2.5 px-[5px] py-[11px] relative flex-[0_0_auto]">
              <h1 className="relative w-fit mt-[-1.00px] [font-family:'Roboto',Helvetica] font-semibold text-white text-[17px] tracking-[0] leading-[normal] whitespace-nowrap">
                Stock Item Monthly Summary
              </h1>
            </div>
          </div>

          <div className="inline-flex items-center gap-2.5 relative flex-[0_0_auto]">
            <button aria-label="Share">
              <img
                className="relative flex-[0_0_auto]"
                alt="Icons"
                src="/img/icons.svg"
              />
            </button>
          </div>
        </div>
      </header>

      <div className="flex-col items-start flex relative self-stretch w-full flex-[0_0_auto]">
        <div className="flex flex-col w-[390.45px] items-start gap-2 pt-1 pb-0 px-4 relative flex-[0_0_auto] mr-[-0.45px] bg-[#e6ecfd]">
          <div className="flex items-center justify-between pt-0 pb-1.5 px-0.5 relative self-stretch w-full flex-[0_0_auto] border-b [border-bottom-style:solid] border-[#c4d4ff]">
            <button className="relative w-5 h-5" aria-label="Search">
              <img
                className="absolute w-[70.05%] h-[71.58%] top-[15.00%] left-[11.91%]"
                alt="Union"
                src="/img/union.svg"
              />
            </button>

            <div className="flex items-center gap-1.5 relative flex-1 grow">
              <div className="relative w-[139px] h-5">
                <div className="absolute top-[calc(50.00%_-_7px)] left-1 [font-family:'Roboto',Helvetica] font-medium text-[#0e172b] text-[13px] tracking-[0] leading-[normal] whitespace-nowrap">
                  Tally Prime Silver
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
                alt="Vector"
                src="/img/vector.svg"
              />
            </div>

            <div className="relative flex items-center justify-center w-fit [font-family:'Roboto',Helvetica] font-semibold text-[#0e172b] text-[13px] tracking-[0] leading-[normal] whitespace-nowrap">
              01-Jun-25 – 06-Jan-26
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-start gap-2.5 px-4 py-0 relative self-stretch w-full flex-[0_0_auto]">
        <button className="inline-flex items-center gap-1.5 relative flex-[0_0_auto]">
          <div className="relative w-[15.99px] h-[15.99px]">
            <img
              className="absolute w-[83.33%] h-[83.33%] top-[4.15%] left-[4.17%]"
              alt="Vector"
              src="/img/vector-1.svg"
            />

            <img
              className="absolute w-0 h-[33.33%] top-[29.15%] left-[45.83%]"
              alt="Vector"
              src="/img/vector-2.svg"
            />

            <img
              className="absolute w-[33.33%] h-[16.67%] top-[45.83%] left-[29.16%]"
              alt="Vector"
              src="/img/vector-3.svg"
            />
          </div>

          <span className="relative w-fit mt-[-1.00px] [font-family:'Roboto',Helvetica] font-normal text-[#354152] text-sm text-center tracking-[0] leading-5 whitespace-nowrap">
            Inwards
          </span>
        </button>

        <button className="flex items-center gap-1.5 relative flex-1 grow">
          <div className="relative w-[15.99px] h-[15.99px]">
            <img
              className="absolute w-[83.33%] h-[83.33%] top-[4.15%] left-[4.17%]"
              alt="Vector"
              src="/img/vector-4.svg"
            />

            <img
              className="absolute w-[33.33%] h-[16.67%] top-[29.15%] left-[29.16%]"
              alt="Vector"
              src="/img/vector-5.svg"
            />

            <img
              className="absolute w-0 h-[33.33%] top-[29.15%] left-[45.83%]"
              alt="Vector"
              src="/img/vector-6.svg"
            />
          </div>

          <div className="flex h-[19.99px] items-start relative flex-1 grow">
            <span className="relative w-fit mt-[-1.00px] [font-family:'Roboto',Helvetica] font-normal text-[#354152] text-sm text-center tracking-[0] leading-5 whitespace-nowrap">
              Outwards
            </span>
          </div>
        </button>
      </div>

      <div className="flex items-center justify-between px-4 py-0 relative self-stretch w-full flex-[0_0_auto] bg-[#d3d3d3]">
        <div className="flex w-[186px] items-center gap-2.5 px-0 py-2 relative">
          <div className="relative flex-1 mt-[-1.00px] [font-family:'Roboto',Helvetica] font-semibold text-[#0e172b] text-sm tracking-[0] leading-[normal]">
            Particulars
          </div>
        </div>

        <div className="flex items-center gap-[115px] relative flex-1 grow">
          <div className="inline-flex items-center justify-center gap-2.5 px-0 py-2 relative flex-[0_0_auto]">
            <div className="relative w-fit mt-[-1.00px] [font-family:'Roboto',Helvetica] font-semibold text-[#0e172b] text-sm tracking-[0] leading-[normal] whitespace-nowrap">
              Qty
            </div>
          </div>

          <div className="inline-flex items-center gap-2.5 px-0 py-2 relative flex-[0_0_auto] mr-[-1.00px]">
            <div className="relative w-fit mt-[-1.00px] [font-family:'Roboto',Helvetica] font-semibold text-[#0e172b] text-sm tracking-[0] leading-[normal] whitespace-nowrap">
              Value
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col items-start px-4 py-0 relative self-stretch w-full flex-[0_0_auto] border-b [border-bottom-style:solid] border-[#c4d4ff] overflow-y-scroll">
        <div className="px-0 py-2 flex items-center justify-between relative self-stretch w-full flex-[0_0_auto]">
          {renderDataRow("Opening Balance")}
        </div>
      </div>

      <div className="flex flex-col items-start relative self-stretch w-full flex-[0_0_auto] overflow-y-scroll">
        <div className="flex flex-col h-[548px] items-start gap-2 px-4 py-0 relative self-stretch w-full bg-white overflow-hidden overflow-y-scroll">
          <div className="flex flex-col w-[358px] h-[586px] items-start gap-1.5 relative bg-white overflow-hidden overflow-y-scroll">
            {monthlyData.map((data, index) => (
              <div
                key={index}
                className="flex flex-col items-start gap-2 px-0 py-1.5 relative self-stretch w-full flex-[0_0_auto] border-b [border-bottom-style:solid] border-[#c4d4ff]"
              >
                <div className="flex items-center justify-between relative self-stretch w-full flex-[0_0_auto]">
                  <div className="flex items-center justify-center gap-2.5 relative flex-1 grow">
                    <div className="relative flex-1 mt-[-1.00px] [font-family:'Roboto',Helvetica] font-semibold text-[#0e172b] text-[13px] tracking-[0] leading-[normal]">
                      {data.month}
                    </div>
                  </div>

                  <div className="relative w-[172px] h-[15px]" />
                </div>

                <div className="flex flex-col items-start gap-2 relative self-stretch w-full flex-[0_0_auto]">
                  {renderDataRow("Inwards", "inwards")}
                </div>

                <div className="flex flex-col items-start gap-2 relative self-stretch w-full flex-[0_0_auto]">
                  {renderDataRow("Outwards", "outwards")}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
