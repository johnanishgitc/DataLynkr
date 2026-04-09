import { useState } from "react";

export const Frame = () => {
  const [selectedItem, setSelectedItem] = useState("");
  const [isItemDropdownOpen, setIsItemDropdownOpen] = useState(false);

  const handleItemSelect = (item) => {
    setSelectedItem(item);
    setIsItemDropdownOpen(false);
  };

  const handleAddDetails = () => {
    console.log("Add Details clicked");
  };

  const handlePlaceOrder = () => {
    console.log("Place Order clicked");
  };

  const handleScanBarcode = () => {
    console.log("Scan Barcode clicked");
  };

  const handleMenuClick = () => {
    console.log("Menu clicked");
  };

  const handlePartyDetailsClick = () => {
    console.log("Party Details clicked");
  };

  const handleSearchClick = () => {
    console.log("Search clicked");
  };

  return (
    <div
      className="flex flex-col w-[390px] items-start justify-between relative"
      data-model-id="3067:40359"
    >
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
                onClick={handleMenuClick}
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
              <div className="flex items-center justify-between pt-0 pb-1.5 px-0.5 relative self-stretch w-full flex-[0_0_auto] border-b [border-bottom-style:solid] border-[#c4d4ff]">
                <div className="flex items-center gap-1.5 relative flex-1 grow">
                  <div className="relative w-[18px] h-[18px] aspect-[1]">
                    <img
                      className="absolute w-[79.43%] h-[77.79%] top-[9.35%] left-[9.36%]"
                      alt=""
                      src="/img/vector.svg"
                    />
                  </div>

                  <div className="relative w-[139px] h-5">
                    <p className="absolute top-[calc(50.00%_-_7px)] left-px [font-family:'Roboto',Helvetica] font-medium text-[#0e172b] text-[13px] tracking-[0] leading-[normal] whitespace-nowrap">
                      Akhil Marketing
                    </p>
                  </div>
                </div>

                <button
                  className="relative w-5 h-5"
                  onClick={handleSearchClick}
                  aria-label="Search"
                >
                  <img
                    className="absolute w-[70.05%] h-[71.58%] top-[15.00%] left-[16.91%]"
                    alt=""
                    src="/img/union.svg"
                  />
                </button>
              </div>
            </div>

            <div className="flex flex-col w-[390.45px] items-start gap-2 pt-1 pb-0 px-4 relative flex-[0_0_auto] mr-[-0.45px] bg-[#e6ecfd]">
              <button
                className="justify-between pt-0 pb-1.5 px-0 border-b [border-bottom-style:solid] border-[#c4d4ff] flex items-center relative self-stretch w-full flex-[0_0_auto]"
                onClick={handlePartyDetailsClick}
              >
                <div className="flex items-center gap-1.5 relative flex-1 grow">
                  <div className="relative w-[18px] h-[18px]">
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

                <div className="relative w-5 h-5 -rotate-90">
                  <img
                    className="absolute w-[68.75%] h-[37.50%] top-[18.75%] left-[31.25%] rotate-90"
                    alt=""
                    src="/img/vector-2.svg"
                  />
                </div>
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between px-4 py-0 relative self-stretch w-full flex-[0_0_auto]">
            <div className="inline-flex items-center gap-2 relative flex-[0_0_auto]">
              <div className="inline-flex items-center justify-center gap-1 px-2.5 py-1.5 relative flex-[0_0_auto] bg-[#eb21221a] rounded border-[0.5px] border-solid border-red">
                <span className="relative w-fit mt-[-0.50px] [font-family:'Roboto',Helvetica] font-normal text-[#0e172b] text-[13px] tracking-[0] leading-[normal] whitespace-nowrap">
                  Closing Balance:
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
            <div className="flex flex-col items-start gap-1 relative flex-1 grow">
              <label
                htmlFor="item-select"
                className="relative self-stretch h-5 mt-[-1.00px] [font-family:'Roboto',Helvetica] font-normal text-[#6a7282] text-sm tracking-[0] leading-5 whitespace-nowrap"
              >
                Select Item
              </label>

              <button
                id="item-select"
                className="gap-[215px] px-3 py-2.5 bg-white rounded border border-solid border-[#d3d3d3] flex items-center relative self-stretch w-full flex-[0_0_auto]"
                onClick={() => setIsItemDropdownOpen(!isItemDropdownOpen)}
                aria-haspopup="listbox"
                aria-expanded={isItemDropdownOpen}
              >
                <div className="relative flex-1 grow h-5">
                  <span className="absolute top-[calc(50.00%_-_10px)] left-0 [font-family:'Roboto',Helvetica] font-normal text-[#0e172b] text-[15px] tracking-[0] leading-5 whitespace-nowrap">
                    {selectedItem || "Select Item Name"}
                  </span>
                </div>

                <div className="relative w-5 h-5">
                  <img
                    className="absolute w-[68.75%] h-[37.50%] top-[34.38%] left-[15.62%]"
                    alt=""
                    src="/img/vector-3.svg"
                  />
                </div>
              </button>
            </div>

            <button
              className="inline-flex items-center gap-2.5 p-[11px] relative flex-[0_0_auto] bg-white rounded overflow-hidden border border-solid border-[#d3d3d3]"
              onClick={handleScanBarcode}
              aria-label="Scan barcode"
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
                aria-label="Attachment"
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
  );
};
