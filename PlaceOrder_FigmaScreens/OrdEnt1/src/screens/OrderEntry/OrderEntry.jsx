import { useState } from "react";

export const OrderEntry = () => {
  const [selectedCustomer, setSelectedCustomer] = useState("");
  const [selectedItem, setSelectedItem] = useState("");
  const [isPartyDetailsExpanded, setIsPartyDetailsExpanded] = useState(false);

  const handleCustomerClick = () => {
    console.log("Select customer clicked");
  };

  const handlePartyDetailsClick = () => {
    setIsPartyDetailsExpanded(!isPartyDetailsExpanded);
  };

  const handleItemSelect = (e) => {
    setSelectedItem(e.target.value);
  };

  const handleScanClick = () => {
    console.log("Scan QR code clicked");
  };

  const handleAddDetails = () => {
    console.log("Add details clicked");
  };

  const handlePlaceOrder = () => {
    console.log("Place order clicked");
  };

  return (
    <div className="w-[390px] flex" data-model-id="3067:40243">
      <div className="inline-flex w-[390px] h-[844px] relative flex-col items-start pt-0 pb-2.5 px-0 bg-white">
        <div className="flex flex-col w-[390px] items-start justify-between relative flex-1 grow">
          <div className="flex flex-col items-start relative self-stretch w-full flex-[0_0_auto]">
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

            <div className="flex flex-col items-start gap-2.5 relative self-stretch w-full flex-[0_0_auto]">
              <div className="flex-col items-start flex relative self-stretch w-full flex-[0_0_auto]">
                <div className="flex flex-col w-[390.45px] items-start gap-2 pt-1 pb-0 px-4 relative flex-[0_0_auto] mr-[-0.45px] bg-[#e6ecfd]">
                  <button
                    className="flex items-center justify-between pt-0 pb-1.5 px-0.5 relative self-stretch w-full flex-[0_0_auto] border-b [border-bottom-style:solid] border-[#c4d4ff]"
                    onClick={handleCustomerClick}
                    aria-label="Select customer"
                  >
                    <div className="flex items-center gap-1.5 relative flex-1 grow">
                      <div
                        className="relative w-[18px] h-[18px] aspect-[1]"
                        aria-hidden="true"
                      >
                        <img
                          className="absolute w-[79.43%] h-[77.79%] top-[9.35%] left-[9.36%]"
                          alt=""
                          src="/img/vector.svg"
                        />
                      </div>

                      <div className="relative w-[139px] h-5">
                        <span className="absolute top-[calc(50.00%_-_7px)] left-px [font-family:'Roboto',Helvetica] font-medium text-[#0e172b] text-[13px] tracking-[0] leading-[normal] whitespace-nowrap">
                          Select Customer
                        </span>
                      </div>
                    </div>

                    <div className="relative w-5 h-5" aria-hidden="true">
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
                    onClick={handlePartyDetailsClick}
                    aria-expanded={isPartyDetailsExpanded}
                    aria-label="Party details"
                  >
                    <div className="flex items-center gap-1.5 relative flex-1 grow">
                      <div
                        className="relative w-[18px] h-[18px]"
                        aria-hidden="true"
                      >
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

                    <div
                      className="relative w-5 h-5 -rotate-90"
                      aria-hidden="true"
                    >
                      <img
                        className="absolute w-[68.75%] h-[37.50%] top-[18.75%] left-[31.25%] rotate-90"
                        alt=""
                        src="/img/vector-2.svg"
                      />
                    </div>
                  </button>
                </div>
              </div>

              <div className="flex items-end gap-2.5 px-4 py-0 relative self-stretch w-full flex-[0_0_auto]">
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
                      value={selectedItem}
                      onChange={handleItemSelect}
                      className="relative flex-1 grow h-5 [font-family:'Roboto',Helvetica] font-normal text-[#0e172b] text-[15px] tracking-[0] leading-5 whitespace-nowrap appearance-none bg-transparent border-0 outline-none cursor-pointer"
                      aria-label="Select item name"
                    >
                      <option value="">Select Item Name</option>
                    </select>

                    <div
                      className="relative w-5 h-5 pointer-events-none"
                      aria-hidden="true"
                    >
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
                  onClick={handleScanClick}
                  aria-label="Scan QR code"
                >
                  <img
                    className="relative w-5 h-[20.01px] mt-[-1.00px] mb-[-1.00px] ml-[-1.00px] mr-[-1.00px]"
                    alt=""
                    src="/img/vector-4.svg"
                  />
                </button>
              </div>
            </div>
          </div>

          <footer className="flex flex-col items-start gap-2 relative self-stretch w-full flex-[0_0_auto] bg-white">
            <div className="flex flex-col items-start gap-2.5 px-4 py-0 relative self-stretch w-full flex-[0_0_auto] bg-white">
              <div className="flex flex-col items-start gap-2.5 relative self-stretch w-full flex-[0_0_auto]">
                <div className="flex items-start gap-2 relative self-stretch w-full flex-[0_0_auto]">
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
                    className="flex items-center justify-center gap-2 px-6 py-2.5 relative flex-1 grow bg-[#0e172b] rounded"
                    onClick={handleAddDetails}
                  >
                    <span className="relative w-fit mt-[-1.00px] [font-family:'Roboto',Helvetica] font-medium text-white text-[15px] text-center tracking-[0] leading-5 whitespace-nowrap">
                      Add Details
                    </span>
                  </button>

                  <button
                    className="flex items-center justify-center gap-2 px-6 py-2.5 relative flex-1 grow bg-[#39b57c] rounded"
                    onClick={handlePlaceOrder}
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
    </div>
  );
};
