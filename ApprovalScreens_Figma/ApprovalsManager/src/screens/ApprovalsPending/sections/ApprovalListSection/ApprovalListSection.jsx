export const ApprovalListSection = () => {
  return (
    <header className="gap-2.5 self-stretch w-full flex flex-col items-start relative flex-[0_0_auto]">
      <div className="flex flex-col w-[390px] items-start relative flex-[0_0_auto] bg-[#1e488f]">
        <div
          className="relative self-stretch w-full h-[47px] overflow-hidden opacity-0"
          aria-hidden="true"
        >
          <div className="absolute top-3.5 left-[calc(50.00%_-_168px)] w-[54px] h-[21px] flex justify-center">
            <div className="w-[54px] h-[21px] flex rounded-3xl">
              <time className="mt-px w-[54px] h-5 font-default-bold-body font-[number:var(--default-bold-body-font-weight)] text-white text-[length:var(--default-bold-body-font-size)] text-center tracking-[var(--default-bold-body-letter-spacing)] leading-[var(--default-bold-body-line-height)] whitespace-nowrap [font-style:var(--default-bold-body-font-style)]">
                9:41
              </time>
            </div>
          </div>

          <img
            className="absolute top-[-60876px] left-[calc(50.00%_+_11166px)] w-[77px] h-[13px]"
            alt=""
            src="/img/right-side.png"
          />
        </div>

        <div className="flex items-center justify-between px-4 py-[3px] relative self-stretch w-full flex-[0_0_auto]">
          <div className="flex w-[137px] items-center relative">
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

            <div className="flex flex-col items-start gap-2.5 px-[5px] py-[11px] relative flex-1 grow">
              <h1 className="relative w-fit mt-[-1.00px] [font-family:'Roboto',Helvetica] font-semibold text-white text-[17px] tracking-[0] leading-[normal] whitespace-nowrap">
                Approvals
              </h1>
            </div>
          </div>

          <img
            className="relative flex-[0_0_auto]"
            alt="Notification and menu icons"
            src="/img/icons.svg"
          />
        </div>
      </div>

      <div className="flex items-center gap-[3px] px-4 py-0 relative self-stretch w-full flex-[0_0_auto]">
        <button
          className="inline-flex h-7 items-center gap-1.5 px-3 py-2 relative flex-[0_0_auto] bg-[#ffffff1a] rounded-lg"
          type="button"
          aria-label="Date range filter: 01/01/2026 to 31/01/2026"
        >
          <div
            className="relative w-3 h-[12.26px] mt-[-0.13px] mb-[-0.13px] aspect-[0.98]"
            aria-hidden="true"
          >
            <img
              className="absolute w-full h-[88.47%] top-[6.91%] left-[-4.70%]"
              alt=""
              src="/img/vector.svg"
            />

            <img
              className="absolute w-full h-0 top-[33.83%] left-[-4.70%]"
              alt=""
              src="/img/vector-2.svg"
            />

            <img
              className="absolute w-0 h-[23.08%] top-[-4.62%] left-[18.37%]"
              alt=""
              src="/img/vector-4.svg"
            />

            <img
              className="absolute w-0 h-[23.08%] top-[-4.62%] left-[72.22%]"
              alt=""
              src="/img/vector-4.svg"
            />

            <img
              className="absolute w-[38.46%] h-0 top-[6.91%] left-[18.37%]"
              alt=""
              src="/img/vector-5.svg"
            />
          </div>

          <span className="flex items-center justify-center mt-[-1.50px] font-normal text-white text-[11px] relative w-fit [font-family:'Roboto',Helvetica] tracking-[0] leading-[normal] whitespace-nowrap">
            01/01/2026 – 31/01/2026
          </span>
        </button>
      </div>
    </header>
  );
};
