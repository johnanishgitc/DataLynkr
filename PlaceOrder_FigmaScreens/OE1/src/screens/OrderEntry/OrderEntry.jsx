import { useState } from "react";

export const OrderEntry = () => {
  const [selectedCustomer, setSelectedCustomer] = useState("");
  const [selectedItem, setSelectedItem] = useState("");
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const handleCustomerSelect = () => {
    console.log("Open customer selection");
  };

  const handlePartyDetails = () => {
    console.log("Navigate to party details");
  };

  const handleItemSelect = (e) => {
    setSelectedItem(e.target.value);
  };

  const handleQRScan = () => {
    console.log("Open QR scanner");
  };

  const handleAddDetails = () => {
    console.log("Add details");
  };

  const handlePlaceOrder = () => {
    console.log("Place order");
  };

  const handleAttachment = () => {
    console.log("Add attachment");
  };

  return (
    <div
      className="w-[390px] h-[844px] bg-white flex flex-col"
      data-model-id="3067:40243"
    >
      <header className="bg-[#2B5BA6] px-5 py-6 flex items-center gap-3">
        <button
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className="w-8 h-6 flex flex-col justify-between cursor-pointer"
          aria-label="Toggle menu"
          aria-expanded={isMenuOpen}
        >
          <span className="w-full h-0.5 bg-white"></span>
          <span className="w-full h-0.5 bg-white"></span>
          <span className="w-full h-0.5 bg-white"></span>
        </button>
        <h1 className="text-white text-xl font-semibold">Order Entry</h1>
      </header>

      <section className="bg-[#E8EEF7] px-5 py-3">
        <button
          onClick={handleCustomerSelect}
          className="w-full bg-white rounded-lg px-4 py-3 flex items-center justify-between cursor-pointer mb-3"
          aria-label="Select customer"
        >
          <div className="flex items-center gap-3">
            <svg
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path
                d="M10 10C12.7614 10 15 7.76142 15 5C15 2.23858 12.7614 0 10 0C7.23858 0 5 2.23858 5 5C5 7.76142 7.23858 10 10 10Z"
                fill="#6B7280"
              />
              <path
                d="M10 12.5C5.16667 12.5 1.25 14.4167 1.25 16.6667V20H18.75V16.6667C18.75 14.4167 14.8333 12.5 10 12.5Z"
                fill="#6B7280"
              />
            </svg>
            <span className="text-[#374151] text-base">Select Customer</span>
          </div>
          <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path
              d="M12.9167 11.6667C12.6833 11.6667 12.45 11.5833 12.2667 11.4L8.33333 7.46667C7.96667 7.1 7.96667 6.5 8.33333 6.13333C8.7 5.76667 9.3 5.76667 9.66667 6.13333L12.9167 9.38333L16.1667 6.13333C16.5333 5.76667 17.1333 5.76667 17.5 6.13333C17.8667 6.5 17.8667 7.1 17.5 7.46667L13.5667 11.4C13.3833 11.5833 13.15 11.6667 12.9167 11.6667Z"
              fill="#6B7280"
            />
          </svg>
        </button>

        <button
          onClick={handlePartyDetails}
          className="w-full bg-white rounded-lg px-4 py-3 flex items-center justify-between cursor-pointer"
          aria-label="View party details"
        >
          <div className="flex items-center gap-3">
            <svg
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path
                d="M2.5 5.83333H17.5"
                stroke="#6B7280"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <path
                d="M2.5 10H17.5"
                stroke="#6B7280"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <path
                d="M2.5 14.1667H17.5"
                stroke="#6B7280"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            <span className="text-[#374151] text-base font-medium">
              Party Details
            </span>
          </div>
          <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path
              d="M7.5 15L12.5 10L7.5 5"
              stroke="#6B7280"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </section>

      <main className="flex-1 px-5 py-6">
        <div className="mb-2">
          <label
            htmlFor="item-select"
            className="text-[#6B7280] text-sm block mb-2"
          >
            Select Item
          </label>
          <div className="flex items-center gap-3">
            <div className="flex-1 relative">
              <select
                id="item-select"
                value={selectedItem}
                onChange={handleItemSelect}
                className="w-full bg-white border border-[#D1D5DB] rounded-lg px-4 py-3 text-[#374151] text-base appearance-none cursor-pointer pr-10"
                aria-label="Select item name"
              >
                <option value="">Select Item Name</option>
                <option value="item1">Item 1</option>
                <option value="item2">Item 2</option>
                <option value="item3">Item 3</option>
              </select>
              <svg
                className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none"
                width="20"
                height="20"
                viewBox="0 0 20 20"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <path
                  d="M5 7.5L10 12.5L15 7.5"
                  stroke="#6B7280"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <button
              onClick={handleQRScan}
              className="w-12 h-12 bg-white border border-[#D1D5DB] rounded-lg flex items-center justify-center cursor-pointer flex-shrink-0"
              aria-label="Scan QR code"
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <rect x="3" y="3" width="8" height="8" rx="1" fill="#374151" />
                <rect x="13" y="3" width="8" height="8" rx="1" fill="#374151" />
                <rect x="3" y="13" width="8" height="8" rx="1" fill="#374151" />
                <rect x="13" y="13" width="3" height="3" fill="#374151" />
                <rect x="18" y="13" width="3" height="3" fill="#374151" />
                <rect x="13" y="18" width="3" height="3" fill="#374151" />
                <rect x="18" y="18" width="3" height="3" fill="#374151" />
              </svg>
            </button>
          </div>
        </div>
      </main>

      <footer className="px-5 py-4 flex items-center gap-3 border-t border-[#E5E7EB]">
        <button
          onClick={handleAttachment}
          className="w-14 h-14 bg-[#FCD34D] rounded-full flex items-center justify-center cursor-pointer flex-shrink-0"
          aria-label="Add attachment"
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path
              d="M21.44 11.05L12.25 20.24C11.1242 21.3658 9.59718 21.9983 8.005 21.9983C6.41282 21.9983 4.88584 21.3658 3.76 20.24C2.63416 19.1142 2.00166 17.5872 2.00166 15.995C2.00166 14.4028 2.63416 12.8758 3.76 11.75L12.95 2.56C13.7006 1.80944 14.7186 1.38787 15.78 1.38787C16.8414 1.38787 17.8594 1.80944 18.61 2.56C19.3606 3.31056 19.7821 4.32863 19.7821 5.39C19.7821 6.45137 19.3606 7.46944 18.61 8.22L9.41 17.41C9.03472 17.7853 8.52569 17.9961 7.995 17.9961C7.46431 17.9961 6.95528 17.7853 6.58 17.41C6.20472 17.0347 5.99389 16.5257 5.99389 15.995C5.99389 15.4643 6.20472 14.9553 6.58 14.58L15.07 6.1"
              stroke="#1F2937"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <button
          onClick={handleAddDetails}
          className="flex-1 bg-[#1F2937] text-white rounded-lg px-6 py-4 text-base font-medium cursor-pointer"
        >
          Add Details
        </button>
        <button
          onClick={handlePlaceOrder}
          className="flex-1 bg-[#10B981] text-white rounded-lg px-6 py-4 text-base font-medium cursor-pointer"
        >
          Place Order
        </button>
      </footer>
    </div>
  );
};
