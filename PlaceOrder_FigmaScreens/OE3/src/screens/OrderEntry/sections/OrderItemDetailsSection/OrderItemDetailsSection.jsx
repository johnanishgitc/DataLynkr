import { useState } from "react";

export const OrderItemDetailsSection = () => {
  const [formData, setFormData] = useState({
    description:
      "Lorem Ipsum is simply dummy text of the printing and typesetting industry. Lorem Ipsum has been the industry's standard dummy text ever since the 1500s.",
    qty: "01",
    rate: "1000.00",
    per: "12",
    discount: "0%",
    dueDate: "23-Dec-25",
    value: "1000.00",
  });

  const orderItems = [
    {
      id: 1,
      name: "500 Ml SP Buffalo Ghee-GRB",
      qty: 1,
      rate: 1000,
      discount: 0,
      total: 1000.0,
      stock: 12,
      tax: 5,
    },
  ];

  const handleInputChange = (field, value) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  return (
    <div className="flex flex-col h-[619px] items-start relative self-stretch w-full">
      <header className="flex flex-col w-[390px] items-start relative flex-[0_0_auto] bg-[#1e488f]">
        <div className="relative self-stretch w-full h-[47px]">
          <div className="absolute top-3.5 left-[calc(50.00%_-_168px)] w-[54px] h-[21px] flex justify-center">
            <div className="w-[54px] h-[21px] flex rounded-3xl">
              <time className="mt-px w-[54px] h-5 font-default-bold-body text-transparent text-[length:var(--default-bold-body-font-size)] text-center tracking-[var(--default-bold-body-letter-spacing)] leading-[var(--default-bold-body-line-height)] font-[number:var(--default-bold-body-font-weight)] whitespace-nowrap [font-style:var(--default-bold-body-font-style)]">
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

        <nav className="items-center justify-around px-4 py-[3px] flex relative self-stretch w-full flex-[0_0_auto]">
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
                Order Entry
              </h1>
            </div>
          </div>
        </nav>
      </header>

      <main className="flex flex-col items-start gap-2.5 relative flex-1 self-stretch w-full grow">
        <section className="flex-col items-start flex relative self-stretch w-full flex-[0_0_auto]">
          <div className="flex flex-col w-[390.45px] items-start gap-2 pt-1 pb-0 px-4 relative flex-[0_0_auto] mr-[-0.45px] bg-[#e6ecfd] border-b [border-bottom-style:solid] border-[#c4d4ff]">
            <div className="flex items-center justify-between pt-0 pb-1.5 px-0.5 self-stretch w-full relative flex-[0_0_auto]">
              <div className="flex items-center gap-1.5 relative flex-1 grow">
                <div className="relative w-[18px] h-[18px]" aria-hidden="true">
                  <img
                    className="absolute w-[75.00%] h-[83.32%] top-[5.19%] left-[9.36%]"
                    alt=""
                    src="/img/vector.svg"
                  />
                </div>

                <div className="relative w-[139px] h-5">
                  <h2 className="absolute top-[calc(50.00%_-_7px)] left-px [font-family:'Roboto',Helvetica] font-medium text-[#0e172b] text-[13px] tracking-[0] leading-[normal] whitespace-nowrap">
                    SP Buffalo Ghee-GRB 500 Ml
                  </h2>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="flex flex-col items-start relative self-stretch w-full flex-[0_0_auto] mb-[-33.00px]">
          <form className="flex flex-col items-start gap-2.5 relative self-stretch w-full flex-[0_0_auto]">
            <div className="flex items-end gap-2.5 px-4 py-0 relative self-stretch w-full flex-[0_0_auto]">
              <div className="flex flex-col w-[358px] items-start gap-2.5 relative">
                <div className="flex flex-col items-start gap-1 relative self-stretch w-full flex-[0_0_auto]">
                  <div className="flex items-end justify-between relative self-stretch w-full flex-[0_0_auto]">
                    <label
                      htmlFor="description"
                      className="relative w-fit mt-[-1.00px] [font-family:'Roboto',Helvetica] font-normal text-[#6a7282] text-sm tracking-[0] leading-[normal] whitespace-nowrap"
                    >
                      Description
                    </label>

                    <span className="relative w-fit [font-family:'Roboto',Helvetica] font-normal text-[#6a7282] text-[10px] tracking-[0] leading-[normal] whitespace-nowrap">
                      (max 500 characters)
                    </span>
                  </div>

                  <div className="inline-flex items-start gap-2.5 px-3 py-1.5 bg-[#d3d3d366] rounded border border-solid border-[#d3d3d3] relative flex-[0_0_auto]">
                    <textarea
                      id="description"
                      value={formData.description}
                      onChange={(e) =>
                        handleInputChange("description", e.target.value)
                      }
                      maxLength={500}
                      className="relative w-[334px] mt-[-1.00px] [font-family:'Roboto',Helvetica] font-normal text-[#0e172b] text-sm tracking-[0] leading-[normal] bg-transparent resize-none"
                      rows={4}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-end gap-2.5 px-4 py-0 relative self-stretch w-full flex-[0_0_auto]">
              <div className="flex flex-col items-start gap-1 relative flex-1 grow">
                <label
                  htmlFor="qty"
                  className="relative self-stretch h-5 mt-[-1.00px] [font-family:'Roboto',Helvetica] font-normal text-[#6a7282] text-sm tracking-[0] leading-5 whitespace-nowrap"
                >
                  Qty
                </label>

                <div className="flex items-center justify-around gap-[215px] px-3 py-2.5 relative self-stretch w-full flex-[0_0_auto] bg-[#d3d3d366] rounded border border-solid border-[#d3d3d3]">
                  <div className="relative flex-1 grow h-5">
                    <input
                      type="text"
                      id="qty"
                      value={formData.qty}
                      onChange={(e) => handleInputChange("qty", e.target.value)}
                      className="absolute top-[calc(50.00%_-_10px)] left-0 [font-family:'Roboto',Helvetica] font-normal text-[#0e172b] text-[15px] tracking-[0] leading-5 whitespace-nowrap bg-transparent w-full"
                    />
                  </div>
                </div>
              </div>

              <div className="flex flex-col items-start gap-1 relative flex-1 grow">
                <label
                  htmlFor="rate"
                  className="relative self-stretch h-5 mt-[-1.00px] [font-family:'Roboto',Helvetica] font-normal text-[#6a7282] text-sm tracking-[0] leading-5 whitespace-nowrap"
                >
                  Rate
                </label>

                <div className="flex items-center justify-around gap-[215px] px-3 py-2.5 relative self-stretch w-full flex-[0_0_auto] bg-[#d3d3d366] rounded border border-solid border-[#d3d3d3]">
                  <div className="relative flex-1 grow h-5">
                    <input
                      type="text"
                      id="rate"
                      value={formData.rate}
                      onChange={(e) =>
                        handleInputChange("rate", e.target.value)
                      }
                      className="[font-family:'Roboto',Helvetica] absolute top-[calc(50.00%_-_10px)] left-0 font-normal text-[#0e172b] text-[15px] tracking-[0] leading-5 whitespace-nowrap bg-transparent w-full"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-end gap-2.5 px-4 py-0 relative self-stretch w-full flex-[0_0_auto]">
              <div className="flex flex-col items-start gap-1 relative flex-1 grow">
                <label
                  htmlFor="per"
                  className="relative self-stretch h-5 mt-[-1.00px] [font-family:'Roboto',Helvetica] font-normal text-[#6a7282] text-sm tracking-[0] leading-5 whitespace-nowrap"
                >
                  Per
                </label>

                <div className="flex items-center justify-around gap-[215px] px-3 py-2.5 relative self-stretch w-full flex-[0_0_auto] bg-[#d3d3d366] rounded border border-solid border-[#d3d3d3]">
                  <div className="relative flex-1 grow h-5">
                    <input
                      type="text"
                      id="per"
                      value={formData.per}
                      onChange={(e) => handleInputChange("per", e.target.value)}
                      className="[font-family:'Roboto',Helvetica] absolute top-[calc(50.00%_-_10px)] left-0 font-normal text-[#0e172b] text-[15px] tracking-[0] leading-5 whitespace-nowrap bg-transparent w-full"
                    />
                  </div>
                </div>
              </div>

              <div className="flex flex-col items-start gap-1 relative flex-1 grow">
                <label
                  htmlFor="discount"
                  className="relative self-stretch h-5 mt-[-1.00px] [font-family:'Roboto',Helvetica] font-normal text-[#6a7282] text-sm tracking-[0] leading-5 whitespace-nowrap"
                >
                  Discount%
                </label>

                <div className="flex items-center justify-around gap-[215px] px-3 py-2.5 relative self-stretch w-full flex-[0_0_auto] bg-[#d3d3d366] rounded border border-solid border-[#d3d3d3]">
                  <div className="relative flex-1 grow h-5">
                    <input
                      type="text"
                      id="discount"
                      value={formData.discount}
                      onChange={(e) =>
                        handleInputChange("discount", e.target.value)
                      }
                      className="font-body-body-l-regular absolute top-[calc(50.00%_-_10px)] left-0 font-[number:var(--body-body-l-regular-font-weight)] text-[#0e172b] text-[length:var(--body-body-l-regular-font-size)] tracking-[var(--body-body-l-regular-letter-spacing)] leading-[var(--body-body-l-regular-line-height)] whitespace-nowrap [font-style:var(--body-body-l-regular-font-style)] bg-transparent w-full"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-end gap-2.5 px-4 py-0 relative self-stretch w-full flex-[0_0_auto]">
              <div className="flex flex-col items-start gap-1 relative flex-1 grow">
                <p className="relative self-stretch h-5 mt-[-1.00px] [font-family:'Roboto',Helvetica] font-normal text-transparent text-sm leading-[14px]">
                  <span className="text-[#6a7282] tracking-[0] leading-5">
                    Stock{" "}
                  </span>

                  <span className="text-[#0e172b] tracking-[0] leading-5">
                    :{" "}
                  </span>

                  <a
                    href="#"
                    className="font-medium text-[#1e488f] text-[13px] tracking-[0] underline"
                  >
                    12
                  </a>
                </p>
              </div>

              <div className="flex flex-col items-start gap-1 relative flex-1 grow">
                <div className="relative self-stretch h-5 mt-[-1.00px] [font-family:'Roboto',Helvetica] font-normal text-[#0e172b] text-sm tracking-[0] leading-5 whitespace-nowrap">
                  Tax% : 5
                </div>
              </div>
            </div>

            <div className="flex items-end gap-2.5 px-4 py-0 relative self-stretch w-full flex-[0_0_auto]">
              <div className="flex flex-col items-start gap-1 relative flex-1 grow">
                <label
                  htmlFor="dueDate"
                  className="relative self-stretch h-5 mt-[-1.00px] [font-family:'Roboto',Helvetica] font-normal text-[#6a7282] text-sm tracking-[0] leading-5 whitespace-nowrap"
                >
                  Due Date
                </label>

                <div className="flex items-center justify-between px-3 py-2.5 self-stretch w-full bg-[#d3d3d366] rounded border border-solid border-[#d3d3d3] relative flex-[0_0_auto]">
                  <div className="relative flex-1 grow h-5">
                    <input
                      type="text"
                      id="dueDate"
                      value={formData.dueDate}
                      onChange={(e) =>
                        handleInputChange("dueDate", e.target.value)
                      }
                      className="absolute top-[calc(50.00%_-_10px)] left-0 [font-family:'Roboto',Helvetica] font-normal text-[#0e172b] text-[15px] tracking-[0] leading-5 whitespace-nowrap bg-transparent w-full"
                    />
                  </div>

                  <button
                    type="button"
                    className="relative w-[18px] h-[18px]"
                    aria-label="Select date"
                  >
                    <img
                      className="absolute w-[75.00%] h-[83.33%] top-[5.19%] left-[9.36%]"
                      alt=""
                      src="/img/vector-1.svg"
                    />
                  </button>
                </div>
              </div>

              <div className="flex flex-col items-start gap-1 relative flex-1 grow">
                <label
                  htmlFor="value"
                  className="relative self-stretch h-5 mt-[-1.00px] [font-family:'Roboto',Helvetica] font-normal text-[#6a7282] text-sm tracking-[0] leading-5 whitespace-nowrap"
                >
                  Value
                </label>

                <div className="flex items-center justify-around gap-[215px] px-3 py-2.5 relative self-stretch w-full flex-[0_0_auto] bg-[#d3d3d366] rounded border border-solid border-[#d3d3d3]">
                  <div className="relative flex-1 grow h-5">
                    <input
                      type="text"
                      id="value"
                      value={formData.value}
                      onChange={(e) =>
                        handleInputChange("value", e.target.value)
                      }
                      className="[font-family:'Roboto',Helvetica] absolute top-[calc(50.00%_-_10px)] left-0 font-normal text-[#0e172b] text-[15px] tracking-[0] leading-5 whitespace-nowrap bg-transparent w-full"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-start gap-2.5 px-4 py-1.5 relative self-stretch w-full flex-[0_0_auto]">
              <div className="flex flex-col items-start gap-2.5 relative flex-1 grow bg-white">
                <div className="flex flex-col items-start gap-2.5 relative self-stretch w-full flex-[0_0_auto]">
                  <div className="gap-2 flex items-start relative self-stretch w-full flex-[0_0_auto]">
                    <div className="flex items-center gap-2 relative flex-1 self-stretch grow">
                      <button
                        type="button"
                        className="all-[unset] box-border px-2 py-1.5 flex-1 self-stretch grow bg-[#d3d3d3] flex items-center justify-center gap-2 relative rounded"
                      >
                        <span className="relative w-fit [font-family:'Roboto',Helvetica] font-medium text-[#0e172b] text-[15px] text-center tracking-[0] leading-5 whitespace-nowrap">
                          Cancel
                        </span>
                      </button>

                      <button
                        type="button"
                        className="px-6 py-2 flex-1 grow bg-[#f1c74b] flex items-center justify-center gap-2 relative rounded"
                      >
                        <span className="relative w-fit mt-[-1.00px] ml-[-2.50px] mr-[-2.50px] [font-family:'Roboto',Helvetica] font-medium text-[#0e172b] text-[15px] text-center tracking-[0] leading-5 whitespace-nowrap">
                          Add Item
                        </span>
                      </button>
                    </div>

                    <button
                      type="button"
                      className="w-[134px] px-6 py-2 bg-[#39b57c] flex items-center justify-center gap-2 relative rounded"
                    >
                      <span className="relative w-fit mt-[-1.00px] [font-family:'Roboto',Helvetica] font-medium text-white text-[15px] text-center tracking-[0] leading-5 whitespace-nowrap">
                        Add to Order
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </form>

          <section className="flex flex-col w-[390px] items-center gap-2 p-4 relative flex-[0_0_auto] bg-white overflow-y-scroll">
            <div className="flex items-center gap-2.5 relative self-stretch w-full flex-[0_0_auto]">
              <div className="relative w-5 h-5" aria-hidden="true">
                <img
                  className="absolute w-[75.00%] h-[83.32%] top-[8.34%] left-[12.50%]"
                  alt=""
                  src="/img/vector-2.svg"
                />

                <img
                  className="absolute w-0 h-[41.67%] top-[50.00%] left-[50.00%]"
                  alt=""
                  src="/img/vector-3.svg"
                />

                <img
                  className="absolute w-[72.58%] h-[20.83%] top-[29.16%] left-[13.71%]"
                  alt=""
                  src="/img/vector-4.svg"
                />

                <img
                  className="absolute w-[37.50%] h-[21.46%] top-[17.79%] left-[31.25%]"
                  alt=""
                  src="/img/vector-5.svg"
                />
              </div>

              <h2 className="relative w-fit mt-[-1.00px] [font-family:'Roboto',Helvetica] font-semibold text-[#1e488f] text-[17px] tracking-[0] leading-[normal] whitespace-nowrap">
                Items ({orderItems.length})
              </h2>
            </div>

            {orderItems.map((item) => (
              <article
                key={item.id}
                className="flex flex-col w-[360px] items-start gap-2.5 px-0 py-2 relative flex-[0_0_auto] ml-[-1.00px] mr-[-1.00px] bg-white border-b-2 [border-bottom-style:solid] border-[#e6ecfd]"
              >
                <div className="flex-col gap-2.5 flex items-start relative self-stretch w-full flex-[0_0_auto]">
                  <div className="flex-col gap-2 flex items-start relative self-stretch w-full flex-[0_0_auto]">
                    <div className="flex items-center justify-between relative self-stretch w-full flex-[0_0_auto]">
                      <h3 className="relative w-fit [font-family:'Roboto',Helvetica] font-semibold text-[#0e172b] text-sm tracking-[0] leading-[normal] whitespace-nowrap">
                        {item.name}
                      </h3>

                      <div className="inline-flex items-center justify-end gap-2 relative flex-[0_0_auto]">
                        <button
                          type="button"
                          className="flex flex-col w-6 h-6 items-center justify-center gap-2.5 relative bg-[#d3d3d3] rounded-[50px]"
                          aria-label="Remove item"
                        >
                          <img
                            className="relative w-4 h-1"
                            alt=""
                            src="/img/icon.svg"
                          />
                        </button>
                      </div>
                    </div>

                    <div className="flex flex-col items-start gap-[7px] relative self-stretch w-full flex-[0_0_auto]">
                      <div className="flex items-start justify-between px-0 py-0.5 relative self-stretch w-full flex-[0_0_auto]">
                        <div className="inline-flex items-center gap-[3px] relative flex-[0_0_auto]">
                          <span className="relative w-fit mt-[-1.00px] [font-family:'Roboto',Helvetica] font-normal text-[#6a7282] text-[13px] tracking-[0] leading-[normal] whitespace-nowrap">
                            Qty
                          </span>

                          <span className="relative w-fit mt-[-0.50px] [font-family:'Roboto',Helvetica] text-[#6a7282] text-xs tracking-[0] leading-[normal] font-normal whitespace-nowrap">
                            :
                          </span>

                          <p className="relative w-fit mt-[-1.00px] [font-family:'Roboto',Helvetica] font-normal text-transparent text-[13px] tracking-[0] leading-[normal] whitespace-nowrap">
                            <span className="text-[#0e172b]">
                              {item.qty} x ₹{item.rate} ({item.qty}-{" "}
                              {item.discount}%) =
                            </span>

                            <span className="font-semibold text-[#0e172b]">
                              &nbsp;
                            </span>

                            <span className="font-bold text-[#39b57c]">
                              ₹{item.total.toFixed(2)}
                            </span>
                          </p>
                        </div>

                        <div className="inline-flex flex-col h-[15px] items-start gap-2 relative flex-[0_0_auto]">
                          <div className="flex items-center gap-[5px] relative self-stretch w-full flex-[0_0_auto]">
                            <div className="inline-flex items-center gap-2.5 pl-0 pr-2.5 py-0 relative flex-[0_0_auto] border-r [border-right-style:solid] border-[#d3d3d3]">
                              <p className="relative w-fit mt-[-1.00px] [font-family:'Roboto',Helvetica] font-normal text-transparent text-[13px] tracking-[0] leading-[normal] whitespace-nowrap">
                                <span className="text-[#6a7282]">Stock :</span>

                                <span className="font-medium text-[#6a7282]">
                                  &nbsp;
                                </span>

                                <a
                                  href="#"
                                  className="font-semibold text-[#1e488f] underline"
                                >
                                  {item.stock}
                                </a>
                              </p>
                            </div>

                            <div className="inline-flex items-center gap-2.5 relative flex-[0_0_auto]">
                              <p className="relative w-fit mt-[-1.00px] [font-family:'Roboto',Helvetica] font-normal text-transparent text-[13px] tracking-[0] leading-[normal] whitespace-nowrap">
                                <span className="text-[#6a7282]">Tax% : </span>

                                <span className="text-[#0e172b]">
                                  {item.tax}%
                                </span>
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </section>
        </div>
      </main>
    </div>
  );
};
