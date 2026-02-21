export const OrderItemsSection = () => {
  return (
    <header className="flex flex-col items-start relative self-stretch w-full flex-[0_0_auto]">
      <div className="flex w-[332px] items-center justify-end gap-2 p-2 relative flex-[0_0_auto] bg-[#1e488f] rounded">
        <h1 className="relative w-[291.5px] mt-[-1.00px] [font-family:'Roboto',Helvetica] font-normal text-white text-sm tracking-[0] leading-[normal]">
          Order
        </h1>

        <button
          type="button"
          aria-label="Close order"
          className="relative w-4 h-4 aspect-[1] cursor-pointer"
        >
          <img
            className="relative w-4 h-4 aspect-[1]"
            alt="Close"
            src="/img/close.svg"
          />
        </button>
      </div>

      <div className="gap-2 pt-1 pb-0 px-3.5 self-stretch w-full bg-[#e6ecfd] border-b [border-bottom-style:solid] border-[#c4d4ff] flex flex-col items-start relative flex-[0_0_auto]">
        <div className="inline-flex items-center gap-1.5 pt-0 pb-1.5 px-0.5 relative flex-[0_0_auto]">
          <div className="inline-flex items-center gap-1.5 relative flex-[0_0_auto]">
            <div
              className="relative w-[18px] h-[18px] aspect-[1]"
              aria-hidden="true"
            >
              <img
                className="absolute w-[79.43%] h-[77.79%] top-[12.50%] left-[12.50%]"
                alt=""
                src="/img/vector.svg"
              />
            </div>

            <div className="relative w-[139px] h-5">
              <div className="absolute top-[calc(50.00%_-_7px)] left-px [font-family:'Roboto',Helvetica] font-medium text-[#131313] text-[13px] tracking-[0] leading-[normal] whitespace-nowrap">
                Akhil Marketing
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
