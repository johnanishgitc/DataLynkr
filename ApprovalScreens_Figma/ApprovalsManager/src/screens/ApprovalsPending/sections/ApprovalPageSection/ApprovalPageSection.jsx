import { useState } from "react";

export const ApprovalPageSection = () => {
  const [searchQuery, setSearchQuery] = useState("");

  const tabsData = [
    { label: "Pending", count: 5, active: true },
    { label: "Waiting", count: 3, active: false },
    { label: "Approved", count: 3, active: false },
    { label: "Rejected", count: 2, active: false },
  ];

  const approvalsData = [
    {
      id: 1,
      type: "Tour Advance",
      amount: "₹5,000",
      code: "ADV-1023",
      submitter: "John Smith",
      date: "06-Jan-2026",
      description: "Business trip to Chicago - 3 days",
    },
    {
      id: 2,
      type: "Expense Claim",
      amount: "₹1,250",
      code: "EXP-2045",
      submitter: "Sara Johnson",
      date: "06-Jan-20266",
      description: "Client dinner and transportation",
    },
    {
      id: 3,
      type: "Vendor Payment",
      amount: "₹23,400",
      code: "PAY-5612",
      submitter: "Mike Davis",
      date: "06-Jan-20266",
      description: "Office supplies - ABC Vendors",
    },
    {
      id: 4,
      type: "Vendor Payment",
      amount: "₹23,400",
      code: "PAY-5612",
      submitter: "Mike Davis",
      date: "06-Jan-20266",
      description: "Office supplies - ABC Vendors",
    },
    {
      id: 5,
      type: "Tour Advance",
      amount: "₹3,500",
      code: "ADV-1019",
      submitter: "Emily Chen",
      date: "06-Jan-2026",
      description: "Customer visit - West Coast",
    },
    {
      id: 6,
      type: "Expense Claim",
      amount: "₹890",
      code: "EXP-2042",
      submitter: "Robert Wilson",
      date: "06-Jan-2026",
      description: "Hotel and meals",
    },
  ];

  const handleReject = (id) => {
    console.log("Reject approval:", id);
  };

  const handleApprove = (id) => {
    console.log("Approve approval:", id);
  };

  return (
    <div className="w-[390px] gap-3 p-4 bg-[#fafafd] flex flex-col items-start relative flex-[0_0_auto]">
      <div className="flex items-start gap-1.5 relative self-stretch w-full flex-[0_0_auto]">
        <div className="flex items-center gap-2.5 px-3 py-[11.5px] relative flex-1 grow bg-white rounded-[56px] border border-solid border-[#d3d3d3]">
          <div className="relative w-4 h-4">
            <img
              className="absolute w-[87.56%] h-[89.47%] top-[6.88%] left-[6.88%]"
              alt="Search"
              src="/img/union.svg"
            />
          </div>

          <input
            className="relative flex items-center justify-center w-fit mt-[-1.00px] [font-family:'Roboto',Helvetica] font-normal text-[#6a7282] text-sm tracking-[0] leading-[16.8px] whitespace-nowrap [background:transparent] border-[none] p-0"
            placeholder="Search Files..."
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search Files"
          />
        </div>

        <div className="inline-flex items-center relative flex-[0_0_auto]">
          <button
            className="inline-flex items-center gap-2.5 px-1 py-2 relative flex-[0_0_auto] rounded overflow-hidden"
            aria-label="Filter"
          >
            <div className="relative w-6 h-6">
              <img
                className="absolute top-[calc(50.00%_-_10px)] left-[calc(50.00%_-_11px)] w-[22px] h-[21px]"
                alt="Filter"
                src="/img/vector-1.svg"
              />
            </div>
          </button>

          <button
            className="inline-flex items-center gap-2.5 px-1 py-2 relative flex-[0_0_auto] rounded overflow-hidden"
            aria-label="Sort"
          >
            <div className="relative w-6 h-6">
              <img
                className="absolute top-[calc(50.00%_-_9px)] left-[calc(50.00%_-_10px)] w-5 h-[18px]"
                alt="Sort"
                src="/img/vector-6.svg"
              />
            </div>
          </button>
        </div>
      </div>

      <div
        className="flex items-center p-0.5 relative self-stretch w-full flex-[0_0_auto] bg-[#e6ecfd] rounded overflow-hidden"
        role="tablist"
      >
        {tabsData.map((tab, index) => (
          <div key={index}>
            {index > 0 && index < 3 && (
              <div className="relative w-px h-4 bg-[#6a7282] rounded-[0.5px]" />
            )}
            <button
              className={`${
                tab.active
                  ? "inline-flex items-center justify-center gap-[5px] px-2.5 py-[5px] relative self-stretch flex-[0_0_auto] bg-[#1e488f] rounded border border-solid border-[#0000000a] shadow-[0px_3px_1px_#0000000a,0px_3px_8px_#0000001f]"
                  : "px-3 py-[5px] inline-flex items-center justify-center gap-[5px] relative flex-[0_0_auto] rounded-md"
              } ${index === 1 ? "px-3" : index === 2 ? "px-1.5" : index === 3 ? "px-[8.5px]" : ""}`}
              role="tab"
              aria-selected={tab.active}
            >
              <div
                className={`relative ${
                  tab.active
                    ? "flex items-center justify-center w-fit mt-[-1.00px]"
                    : "w-fit mt-[-1.00px]"
                } [font-family:'Roboto',Helvetica] font-normal ${
                  tab.active ? "text-white" : "text-[#0e172b]"
                } text-[13px] text-center tracking-[-0.08px] leading-[18px] whitespace-nowrap`}
              >
                {tab.label}
              </div>

              <div className="flex w-4 h-4 items-center justify-center gap-2.5 px-1.5 py-px relative bg-white rounded-[50px] aspect-[1]">
                <div className="relative flex items-center justify-center w-2 h-[14.79px] mt-[-1.39px] ml-[-2.00px] mr-[-2.00px] [font-family:'Roboto',Helvetica] font-normal text-[#0e172b] text-[10px] text-center tracking-[-0.08px] leading-[12.0px]">
                  {tab.count}
                </div>
              </div>
            </button>
          </div>
        ))}
      </div>

      {approvalsData.map((approval) => (
        <article
          key={approval.id}
          className="flex flex-col items-start justify-center gap-3.5 p-3 relative self-stretch w-full flex-[0_0_auto] bg-white rounded border border-solid border-[#e2eaf2]"
        >
          <div className="flex flex-col items-start gap-2 relative self-stretch w-full flex-[0_0_auto]">
            <div className="flex items-center justify-between relative self-stretch w-full flex-[0_0_auto]">
              <span className="inline-flex items-center px-2.5 py-0.5 relative flex-[0_0_auto] bg-[#f1c74b] rounded-[50px]">
                <span className="relative w-fit mt-[-1.00px] [font-family:'Roboto',Helvetica] font-normal text-[#0e172b] text-[11px] tracking-[0] leading-4 whitespace-nowrap">
                  {approval.type}
                </span>
              </span>

              <div className="mt-[-1.00px] font-semibold text-[#131313] text-[19px] relative w-fit [font-family:'Roboto',Helvetica] tracking-[0] leading-[normal] whitespace-nowrap">
                {approval.amount}
              </div>
            </div>

            <div className="flex items-center justify-between relative self-stretch w-full flex-[0_0_auto]">
              <div className="inline-flex items-center justify-center gap-2.5 relative flex-[0_0_auto]">
                <div className="relative w-fit mt-[-1.00px] [font-family:'Roboto',Helvetica] font-normal text-[#131313] text-[15px] tracking-[0] leading-[normal] whitespace-nowrap">
                  {approval.code}, By {approval.submitter}
                </div>
              </div>

              <time className="inline-flex items-center justify-center gap-2.5 relative flex-[0_0_auto]">
                <span className="relative w-fit mt-[-1.00px] [font-family:'Roboto',Helvetica] font-normal text-[#131313] text-[15px] tracking-[0] leading-[normal] whitespace-nowrap">
                  {approval.date}
                </span>
              </time>
            </div>

            <div className="inline-flex items-center gap-2.5 relative flex-[0_0_auto]">
              <div className="inline-flex items-center justify-center gap-2.5 relative flex-[0_0_auto]">
                <p className="relative w-fit mt-[-1.00px] [font-family:'Roboto',Helvetica] font-normal text-[#131313] text-[15px] tracking-[0] leading-[normal] whitespace-nowrap">
                  {approval.description}
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-start gap-4 relative self-stretch w-full flex-[0_0_auto]">
            <button
              className="flex items-center justify-center gap-2 px-6 py-1.5 relative flex-1 grow bg-white rounded border border-solid border-[#eb2122]"
              onClick={() => handleReject(approval.id)}
              aria-label={`Reject ${approval.type} ${approval.code}`}
            >
              <span className="relative w-fit mt-[-1.00px] [font-family:'Roboto',Helvetica] font-medium text-[#eb2122] text-sm text-center tracking-[0] leading-5 whitespace-nowrap">
                Reject
              </span>
            </button>

            <button
              className="flex items-center justify-center gap-2 px-6 py-1.5 relative flex-1 grow bg-[#39b57c] rounded"
              onClick={() => handleApprove(approval.id)}
              aria-label={`Approve ${approval.type} ${approval.code}`}
            >
              <span className="relative w-fit mt-[-1.00px] [font-family:'Roboto',Helvetica] font-medium text-white text-sm text-center tracking-[0] leading-5 whitespace-nowrap">
                Approve
              </span>
            </button>
          </div>
        </article>
      ))}
    </div>
  );
};
