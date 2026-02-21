import { useState } from "react";

export const BottomNavigationSection = () => {
  const [activeTab, setActiveTab] = useState("Summary");

  const navigationItems = [
    {
      id: "Home",
      label: "Home",
      icon: (
        <div className="relative w-6 h-6 aspect-[1]">
          <img
            className="absolute w-[25.00%] h-[37.50%] top-[47.92%] left-[35.42%]"
            alt=""
            src="/img/vector-2.svg"
          />
          <img
            className="absolute w-[75.00%] h-[79.16%] top-[6.25%] left-[10.42%]"
            alt=""
            src="/img/vector-3.svg"
          />
        </div>
      ),
    },
    {
      id: "Orders",
      label: "Orders",
      icon: (
        <div className="relative w-6 h-6 aspect-[1]">
          <div className="relative w-[83.33%] h-[83.33%] top-[8.33%] left-[8.33%] aspect-[1]">
            <img
              className="absolute w-full h-[75.00%] top-0 left-0"
              alt=""
              src="/img/vector-4.svg"
            />
            <img
              className="absolute w-[21.88%] h-[21.88%] top-[77.19%] left-[24.05%]"
              alt=""
              src="/img/vector-5.svg"
            />
            <img
              className="absolute w-[21.88%] h-[21.88%] top-[77.19%] left-[70.93%]"
              alt=""
              src="/img/vector-6.svg"
            />
          </div>
        </div>
      ),
    },
    {
      id: "Ledger",
      label: "Ledger",
      icon: (
        <div className="relative w-6 h-6">
          <img
            className="absolute w-[83.33%] h-[75.00%] top-[10.42%] left-[6.25%]"
            alt=""
            src="/img/vector-7.svg"
          />
        </div>
      ),
    },
    {
      id: "Approvals",
      label: "Approvals",
      icon: (
        <div className="relative w-6 h-6">
          <img
            className="absolute w-[95.07%] h-[95.08%] top-0 left-0"
            alt=""
            src="/img/vector-8.svg"
          />
        </div>
      ),
    },
    {
      id: "Summary",
      label: "Summary",
      icon: (
        <div className="relative w-6 h-6 aspect-[1]">
          <div className="relative w-[80.00%] h-[79.44%] top-[10.28%] left-[10.00%] bg-[url(/img/vector-9.svg)] bg-[100%_100%]" />
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col items-start relative self-stretch w-full flex-[0_0_auto]">
      <button
        className="flex flex-col w-[390px] items-start gap-2.5 px-4 py-2.5 relative flex-[0_0_auto] bg-[#1e488f] border-t [border-top-style:solid] border-[#c4d4ff]"
        aria-label="Grand Total"
        type="button"
      >
        <div className="flex items-center justify-between relative self-stretch w-full flex-[0_0_auto]">
          <span className="relative w-fit [font-family:'Roboto',Helvetica] font-semibold text-white text-[13px] tracking-[0] leading-[normal] whitespace-nowrap">
            GRAND TOTAL
          </span>

          <div className="relative w-5 h-5 -rotate-90" aria-hidden="true">
            <img
              className="absolute w-[68.75%] h-[37.50%] top-[18.75%] left-[31.25%] rotate-90"
              alt=""
              src="/img/vector-1.svg"
            />
          </div>
        </div>
      </button>

      <nav
        className="flex flex-col w-[390px] h-[54px] items-center justify-around gap-2.5 px-5 py-2 relative bg-white border-t [border-top-style:solid] [border-right-style:none] [border-bottom-style:none] [border-left-style:none] border-[#d3d3d366]"
        aria-label="Main navigation"
      >
        <ul className="items-start gap-[22px] self-stretch w-full flex-[0_0_auto] flex relative">
          {navigationItems.map((item) => (
            <li
              key={item.id}
              className={`flex ${
                item.id === "Orders" ||
                item.id === "Approvals" ||
                item.id === "Summary"
                  ? "flex-col w-16"
                  : item.id === "Ledger"
                    ? "flex-col w-[41px]"
                    : "flex-col w-[41px]"
              } items-center ${
                item.id === "Orders" ||
                item.id === "Approvals" ||
                item.id === "Summary"
                  ? "px-[9px]"
                  : "px-[5px]"
              } py-0 relative`}
            >
              <button
                className="flex flex-col items-center w-full"
                onClick={() => setActiveTab(item.id)}
                aria-label={item.label}
                aria-current={activeTab === item.id ? "page" : undefined}
                type="button"
              >
                <div aria-hidden="true">{item.icon}</div>

                <span
                  className={`relative self-stretch [font-family:'Roboto',Helvetica] ${
                    activeTab === item.id
                      ? "font-medium text-[#1e488f]"
                      : item.id === "Approvals"
                        ? "font-normal text-[#6a7282]"
                        : "font-light text-[#6a7282]"
                  } text-[10px] text-center tracking-[0] leading-[14px]`}
                >
                  {item.label}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
};
