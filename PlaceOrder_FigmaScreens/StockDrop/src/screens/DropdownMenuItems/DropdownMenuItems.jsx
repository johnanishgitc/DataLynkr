export const DropdownMenuItems = () => {
  const menuItems = [
    {
      id: 1,
      name: "SP Buffalo Ghee-GRB 500 Ml",
      stockAvailable: "Yes",
      textColor: "#121212",
      stockColor: "#131313",
    },
    {
      id: 2,
      name: "Arun Ice Cream",
      stockAvailable: "Yes",
      textColor: "#0e172b",
      stockColor: "#0e172b",
    },
    {
      id: 3,
      name: "Idhayam Oil, 500 ml Pouch",
      stockAvailable: "Yes",
      textColor: "#121212",
      stockColor: "#131313",
    },
  ];

  return (
    <div
      className="flex flex-col w-[358px] h-[179px] items-start gap-1 p-1.5 relative bg-[#e6ecfd] rounded border border-solid border-[#d3d3d3]"
      data-model-id="3067:43286"
      role="menu"
      aria-label="Product dropdown menu"
    >
      {menuItems.map((item) => (
        <div
          key={item.id}
          className="flex flex-col w-[350px] items-start gap-1 relative flex-[0_0_auto] mr-[-4.00px]"
        >
          <div
            className="flex flex-col items-start gap-[5px] px-3 py-1.5 relative self-stretch w-full flex-[0_0_auto] bg-white rounded border border-solid border-[#d3d3d3]"
            role="menuitem"
            tabIndex={0}
          >
            <p
              className="relative w-[326px] mt-[-1.00px] [font-family:'Roboto',Helvetica] font-semibold text-sm tracking-[0] leading-[normal]"
              style={{ color: item.textColor }}
            >
              {item.name}
            </p>

            <div className="flex items-center gap-2.5 relative self-stretch w-full flex-[0_0_auto]">
              <div
                className="relative w-fit [font-family:'Roboto',Helvetica] font-normal text-sm tracking-[0] leading-[normal] whitespace-nowrap"
                style={{ color: item.textColor }}
              >
                Stock Available
              </div>

              <div className="relative w-fit mt-[-1.00px] font-body-body-l-regular font-[number:var(--body-body-l-regular-font-weight)] text-[#121212] text-[length:var(--body-body-l-regular-font-size)] tracking-[var(--body-body-l-regular-letter-spacing)] leading-[var(--body-body-l-regular-line-height)] whitespace-nowrap [font-style:var(--body-body-l-regular-font-style)]">
                :
              </div>

              <div
                className="relative w-fit [font-family:'Roboto',Helvetica] font-semibold text-sm tracking-[0] leading-[normal] whitespace-nowrap"
                style={{ color: item.stockColor }}
              >
                {item.stockAvailable}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
