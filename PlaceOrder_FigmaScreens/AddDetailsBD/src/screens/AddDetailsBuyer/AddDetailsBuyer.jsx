import { useState } from "react";

export const AddDetailsBuyer = () => {
  const [activeTab, setActiveTab] = useState("buyer");
  const [formData, setFormData] = useState({
    buyer: "",
    mailingName: "",
    address: "",
    state: "",
    country: "",
    pinCode: "",
    gstRegistrationType: "",
    gstin: "",
    placeOfSupply: "",
    contactPerson: "",
    phone: "",
    email: "",
    billOfLanding: "",
    date: "",
  });

  const tabs = [
    { id: "buyer", label: "Buyer Details" },
    { id: "consignee", label: "Consignee Details" },
    { id: "order", label: "Order Details" },
  ];

  const buyerDetailsFields = [
    { id: "buyer", label: "Buyer (Bill to)", type: "text" },
    { id: "mailingName", label: "Mailing Name", type: "text" },
    { id: "address", label: "Address", type: "text" },
    { id: "state", label: "State", type: "text" },
    { id: "country", label: "Country", type: "text" },
    { id: "pinCode", label: "Pin code", type: "text" },
    { id: "gstRegistrationType", label: "GST Registration Type", type: "text" },
    { id: "gstin", label: "GSTIN / UIN", type: "text" },
    { id: "placeOfSupply", label: "Place of Supply", type: "text" },
  ];

  const contactPersonFields = [
    { id: "contactPerson", label: "Contact Person", type: "text" },
    { id: "phone", label: "Phone", type: "tel" },
    { id: "email", label: "Email", type: "email" },
    { id: "billOfLanding", label: "Bill of Landing / LR-RR No.", type: "text" },
    { id: "date", label: "Date:", type: "date", hasIcon: true },
  ];

  const handleInputChange = (id, value) => {
    setFormData((prev) => ({
      ...prev,
      [id]: value,
    }));
  };

  const handleClear = () => {
    setFormData({
      buyer: "",
      mailingName: "",
      address: "",
      state: "",
      country: "",
      pinCode: "",
      gstRegistrationType: "",
      gstin: "",
      placeOfSupply: "",
      contactPerson: "",
      phone: "",
      email: "",
      billOfLanding: "",
      date: "",
    });
  };

  const handleSubmit = () => {
    console.log("Form submitted:", formData);
  };

  return (
    <div
      className="inline-flex flex-col h-[1372px] items-start pt-0 pb-5 px-0 relative bg-white"
      data-model-id="3067:64055"
    >
      <div className="flex flex-col w-[390px] items-start relative flex-[0_0_auto]">
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

            <div className="flex items-center justify-around px-4 py-[3px] relative self-stretch w-full flex-[0_0_auto]">
              <div className="flex items-center relative flex-1 grow">
                <button
                  className="inline-flex items-center gap-2.5 px-0 py-[9px] relative flex-[0_0_auto]"
                  aria-label="Go back"
                >
                  <img
                    className="relative w-6 h-6"
                    alt=""
                    src="/img/caretleft.svg"
                  />
                </button>

                <div className="inline-flex flex-col items-start gap-2.5 px-[5px] py-[11px] relative flex-[0_0_auto]">
                  <h1 className="relative w-fit mt-[-1.00px] [font-family:'Roboto',Helvetica] font-semibold text-white text-[17px] tracking-[0] leading-[normal] whitespace-nowrap">
                    Add Details
                  </h1>
                </div>
              </div>
            </div>
          </header>

          <div className="flex flex-col items-start gap-2.5 relative self-stretch w-full flex-[0_0_auto]">
            <nav className="flex flex-col w-[390px] items-center gap-2 pt-2 pb-0 px-0 relative flex-[0_0_auto]">
              <div
                className="flex items-start justify-center relative self-stretch w-full flex-[0_0_auto]"
                role="tablist"
              >
                {tabs.map((tab) => (
                  <div
                    key={tab.id}
                    className={`inline-flex flex-col items-center px-[5px] py-0 relative flex-[0_0_auto] ${tab.id === "consignee" ? "mt-[-2.00px]" : ""}`}
                  >
                    <button
                      role="tab"
                      aria-selected={activeTab === tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`inline-flex items-start justify-center px-2.5 py-1.5 relative flex-[0_0_auto] ${
                        activeTab === tab.id
                          ? "border-b-2 [border-bottom-style:solid] border-[#1e488f]"
                          : ""
                      }`}
                    >
                      <span
                        className={`relative w-fit ${tab.id === "buyer" ? "mt-[-2.00px]" : tab.id === "consignee" ? "mt-[-2.00px]" : "mt-[-1.33px]"} [font-family:'Roboto',Helvetica] ${
                          activeTab === tab.id
                            ? "font-semibold text-[#1e488f]"
                            : "font-normal text-[#0e172b]"
                        } ${tab.id === "order" ? "text-[#000000de]" : ""} text-[13px] text-center tracking-[0] leading-[normal] whitespace-nowrap`}
                      >
                        {tab.label}
                      </span>
                    </button>

                    <div className="relative self-stretch w-full h-1" />
                  </div>
                ))}
              </div>
            </nav>

            <main className="flex flex-col w-[390px] items-center gap-3.5 pt-0 pb-6 px-0 relative flex-[0_0_auto]">
              <section className="flex flex-col items-start gap-2.5 relative self-stretch w-full flex-[0_0_auto]">
                <div className="flex items-start gap-2 px-4 py-1.5 relative self-stretch w-full flex-[0_0_auto] bg-[#e6ecfd] border-b [border-bottom-style:solid] border-[#c4d4ff]">
                  <h2 className="relative w-fit mt-[-1.00px] [font-family:'Roboto',Helvetica] font-medium text-[#0e172b] text-[15px] tracking-[0] leading-[normal] whitespace-nowrap">
                    Buyer Details
                  </h2>
                </div>

                {buyerDetailsFields.map((field) => (
                  <div
                    key={field.id}
                    className="flex items-end gap-2.5 px-4 py-0 relative self-stretch w-full flex-[0_0_auto]"
                  >
                    <div className="flex flex-col items-start gap-1 relative flex-1 grow">
                      <label
                        htmlFor={field.id}
                        className="relative self-stretch h-5 mt-[-1.00px] [font-family:'Roboto',Helvetica] font-normal text-[#6a7282] text-sm tracking-[0] leading-5 whitespace-nowrap"
                      >
                        {field.label}
                      </label>

                      <div className="flex items-center gap-[215px] px-3 py-2.5 relative self-stretch w-full flex-[0_0_auto] bg-white rounded border border-solid border-[#d3d3d3]">
                        <input
                          type={field.type}
                          id={field.id}
                          name={field.id}
                          value={formData[field.id]}
                          onChange={(e) =>
                            handleInputChange(field.id, e.target.value)
                          }
                          className="relative flex-1 grow h-5 [font-family:'Roboto',Helvetica] text-sm text-[#0e172b]"
                          aria-label={field.label}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </section>

              <section className="flex flex-col items-start gap-2.5 relative self-stretch w-full flex-[0_0_auto]">
                <div className="flex items-start gap-2 px-4 py-1.5 relative self-stretch w-full flex-[0_0_auto] bg-[#e6ecfd] border-b [border-bottom-style:solid] border-[#c4d4ff]">
                  <h2 className="relative w-fit mt-[-1.00px] [font-family:'Roboto',Helvetica] font-medium text-[#0e172b] text-[15px] tracking-[0] leading-[normal] whitespace-nowrap">
                    Contact Person Details
                  </h2>
                </div>

                {contactPersonFields.map((field) => (
                  <div
                    key={field.id}
                    className="flex items-end gap-2.5 px-4 py-0 relative self-stretch w-full flex-[0_0_auto]"
                  >
                    <div className="flex flex-col items-start gap-1 relative flex-1 grow">
                      <label
                        htmlFor={field.id}
                        className="relative self-stretch h-5 mt-[-1.00px] [font-family:'Roboto',Helvetica] font-normal text-[#6a7282] text-sm tracking-[0] leading-5 whitespace-nowrap"
                      >
                        {field.label}
                      </label>

                      <div className="flex items-center gap-[215px] px-3 py-2.5 relative self-stretch w-full flex-[0_0_auto] bg-white rounded border border-solid border-[#d3d3d3]">
                        <input
                          type={field.type}
                          id={field.id}
                          name={field.id}
                          value={formData[field.id]}
                          onChange={(e) =>
                            handleInputChange(field.id, e.target.value)
                          }
                          className="relative flex-1 grow h-5 [font-family:'Roboto',Helvetica] text-sm text-[#0e172b]"
                          aria-label={field.label}
                        />

                        {field.hasIcon && (
                          <div className="relative w-[18px] h-[18px]">
                            <img
                              className="absolute w-[75.00%] h-[83.33%] top-[5.19%] left-[9.36%]"
                              alt=""
                              src="/img/vector.svg"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </section>
            </main>
          </div>
        </div>
      </div>

      <div className="flex items-start gap-4 px-4 py-0 relative self-stretch w-full flex-[0_0_auto]">
        <button
          onClick={handleClear}
          className="flex items-center justify-center gap-2 px-6 py-2.5 relative flex-1 grow bg-[#d3d3d3] rounded"
          type="button"
        >
          <span className="relative w-fit mt-[-1.00px] [font-family:'Roboto',Helvetica] font-medium text-[#0e172b] text-[15px] text-center tracking-[0] leading-5 whitespace-nowrap">
            Clear
          </span>
        </button>

        <button
          onClick={handleSubmit}
          className="all-[unset] box-border flex items-center justify-center gap-2 px-6 py-2.5 relative flex-1 grow bg-[#1e488f] rounded"
          type="button"
        >
          <span className="relative w-fit mt-[-1.00px] [font-family:'Roboto',Helvetica] font-medium text-neutral50-ffffff-text-light text-[15px] text-center tracking-[0] leading-5 whitespace-nowrap">
            Submit
          </span>
        </button>
      </div>
    </div>
  );
};
