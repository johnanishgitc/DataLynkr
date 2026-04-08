import { useState } from "react";

export const Congratulations = () => {
  const [activeButton, setActiveButton] = useState(null);

  const handleViewOrder = () => {
    setActiveButton("view");
  };

  const handlePlaceNewOrder = () => {
    setActiveButton("new");
  };

  return (
    <div
      className="inline-flex flex-col h-[844px] items-start pt-0 pb-2.5 px-0 relative bg-white"
      data-model-id="3067:64915"
    >
      <div className="flex flex-col w-[390px] items-start justify-around relative flex-1 grow">
        <div className="flex flex-col items-start relative flex-1 self-stretch w-full grow">
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

            <nav className="flex items-center justify-around px-4 py-[3px] relative self-stretch w-full flex-[0_0_auto]">
              <div className="flex items-center relative flex-1 grow">
                <button
                  className="inline-flex items-center gap-2.5 px-0 py-[9px] relative flex-[0_0_auto]"
                  aria-label="Go back"
                  type="button"
                >
                  <img
                    className="relative w-6 h-6"
                    alt=""
                    src="/img/caretleft.svg"
                  />
                </button>

                <div className="relative w-[113px] h-[42px]" />
              </div>
            </nav>
          </header>

          <main className="relative self-stretch w-full h-[524px]">
            <div className="flex flex-col w-[390px] items-start gap-3 absolute top-[432px] left-0">
              <div className="flex flex-col items-start gap-2.5 px-4 py-0 relative self-stretch w-full flex-[0_0_auto] bg-white">
                <div className="flex flex-col items-start gap-2.5 relative self-stretch w-full flex-[0_0_auto]">
                  <div className="flex items-start gap-2 relative self-stretch w-full flex-[0_0_auto]">
                    <button
                      className="flex items-center justify-center gap-2 px-6 py-2.5 relative flex-1 grow bg-[#1e488f] rounded"
                      onClick={handleViewOrder}
                      type="button"
                    >
                      <span className="relative w-fit mt-[-1.00px] [font-family:'Roboto',Helvetica] font-medium text-white text-[15px] text-center tracking-[0] leading-5 whitespace-nowrap">
                        View Order
                      </span>
                    </button>

                    <button
                      className="flex items-center justify-center gap-2 px-6 py-2.5 relative flex-1 grow bg-[#39b57c] rounded"
                      onClick={handlePlaceNewOrder}
                      type="button"
                    >
                      <span className="relative w-fit mt-[-1.00px] [font-family:'Roboto',Helvetica] font-medium text-white text-[15px] text-center tracking-[0] leading-5 whitespace-nowrap">
                        Place a New Order
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <img
              className="absolute w-[270px] h-[157px] top-[189px] left-[60px]"
              alt=""
              src="/img/group.png"
            />

            <div className="flex flex-col w-[390px] items-center justify-center gap-[18px] absolute top-[223px] left-0">
              <div className="inline-flex flex-col items-center gap-4 relative flex-[0_0_auto]">
                <img
                  className="relative flex-[0_0_auto] mt-[-2.85px]"
                  alt="Success checkmark with confetti"
                  src="/img/graphics.svg"
                />

                <h1 className="relative w-fit [font-family:'Roboto',Helvetica] font-medium text-[#1e488f] text-[19px] tracking-[0] leading-[normal] whitespace-nowrap">
                  Congratulations!
                </h1>
              </div>

              <p className="relative w-fit [font-family:'Roboto',Helvetica] font-normal text-[#6a7282] text-[15px] tracking-[0] leading-[normal] whitespace-nowrap">
                Your order has been placed successfully.
              </p>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
};
