export const OrderSummarySection = () => {
  const summaryData = {
    label: "ITEM TOTAL",
    amount: "₹1000.00",
  };

  return (
    <section
      className="flex flex-col items-start gap-3 relative self-stretch w-full flex-[0_0_auto]"
      aria-labelledby="order-summary-heading"
    >
      <div className="flex flex-col w-[390px] items-start gap-2.5 px-4 py-2.5 relative flex-[0_0_auto] bg-[#1e488f] border-t [border-top-style:solid] border-[#c4d4ff]">
        <div className="flex items-center justify-between relative self-stretch w-full flex-[0_0_auto]">
          <h2
            id="order-summary-heading"
            className="relative w-fit mt-[-1.00px] [font-family:'Roboto',Helvetica] font-semibold text-white text-[13px] tracking-[0] leading-[normal] whitespace-nowrap"
          >
            {summaryData.label}
          </h2>

          <p
            className="relative w-fit mt-[-1.00px] [font-family:'Roboto',Helvetica] font-semibold text-white text-[13px] tracking-[0] leading-[normal] whitespace-nowrap"
            aria-label={`Total amount ${summaryData.amount}`}
          >
            {summaryData.amount}
          </p>
        </div>
      </div>
    </section>
  );
};
