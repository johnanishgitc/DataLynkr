import { useState } from "react";

export const Popup = () => {
  const [isOpen, setIsOpen] = useState(true);

  const uploadOptions = [
    {
      id: "camera",
      label: "Camera",
      icon: "/img/frame-2147225875.svg",
      bgColor: "bg-[#ff4444]",
      iconType: "image",
    },
    {
      id: "gallery",
      label: "Gallery",
      icon: "/img/vector.svg",
      bgColor: "bg-[#3cb77e]",
      iconType: "vector",
    },
    {
      id: "files",
      label: "Files",
      icon: "/img/vector-1.svg",
      bgColor: "bg-[#91b3fa]",
      iconType: "vector",
    },
  ];

  const handleClose = () => {
    setIsOpen(false);
  };

  const handleOptionClick = (optionId) => {
    console.log(`Selected option: ${optionId}`);
  };

  if (!isOpen) return null;

  return (
    <div
      className="flex flex-col w-[390px] items-center gap-3 pt-3 pb-6 px-2.5 relative bg-white overflow-hidden"
      data-model-id="3067:41308"
      role="dialog"
      aria-modal="true"
      aria-labelledby="popup-title"
    >
      <div className="flex flex-col w-[390px] items-center px-5 py-0 relative flex-[0_0_auto] ml-[-10.00px] mr-[-10.00px]">
        <div className="inline-flex flex-col items-start gap-2.5 relative flex-[0_0_auto]">
          <img
            className="relative w-12 h-1 mt-[-4.00px]"
            alt="Drag handle"
            src="/img/line-25.svg"
            role="presentation"
          />
        </div>

        <div className="flex items-start justify-between relative self-stretch w-full flex-[0_0_auto]">
          <div className="inline-flex flex-col items-start gap-1 relative flex-[0_0_auto]" />

          <button
            onClick={handleClose}
            className="relative w-4 h-4 aspect-[1] cursor-pointer"
            aria-label="Close popup"
            type="button"
          >
            <img className="w-full h-full" alt="" src="/img/close.svg" />
          </button>
        </div>
      </div>

      <div className="flex flex-col w-[390.5px] items-start gap-3 relative flex-[0_0_auto] ml-[-10.25px] mr-[-10.25px] overflow-y-scroll">
        <div className="flex flex-col items-start gap-4 px-4 py-0 relative self-stretch w-full flex-[0_0_auto]">
          <div className="flex flex-col items-start gap-4 relative self-stretch w-full flex-[0_0_auto]">
            <nav
              className="flex items-start gap-6 relative self-stretch w-full flex-[0_0_auto]"
              aria-label="Upload options"
            >
              {uploadOptions.map((option) => (
                <button
                  key={option.id}
                  onClick={() => handleOptionClick(option.id)}
                  className="inline-flex flex-col items-center justify-center gap-2.5 relative flex-[0_0_auto] cursor-pointer"
                  type="button"
                  aria-label={`Upload from ${option.label}`}
                >
                  {option.id === "camera" ? (
                    <img
                      className="relative w-[60px] h-[60px]"
                      alt=""
                      src={option.icon}
                    />
                  ) : (
                    <div
                      className={`relative w-[60px] h-[60px] ${option.bgColor} rounded-[30px] ${option.id === "gallery" ? "mr-[-0.09px]" : ""}`}
                    >
                      <img
                        className={
                          option.id === "gallery"
                            ? "absolute top-[13px] left-[13px] w-[34px] h-[34px]"
                            : "absolute w-[52.92%] h-[55.56%] top-[22.10%] left-[23.75%]"
                        }
                        alt=""
                        src={option.icon}
                      />
                    </div>
                  )}

                  <span className="relative w-fit [font-family:'Roboto',Helvetica] font-medium text-black text-[13px] text-center tracking-[0] leading-5 whitespace-nowrap">
                    {option.label}
                  </span>
                </button>
              ))}
            </nav>
          </div>
        </div>
      </div>
    </div>
  );
};
