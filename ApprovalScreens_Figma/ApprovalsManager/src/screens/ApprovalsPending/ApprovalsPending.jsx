import { ApprovalListSection } from "./sections/ApprovalListSection";
import { ApprovalPageSection } from "./sections/ApprovalPageSection";

export const ApprovalsPending = () => {
  return (
    <div
      className="relative w-[390px] h-[1197px] bg-white overflow-hidden"
      data-model-id="3159:58375"
    >
      <div className="flex flex-col w-[390px] items-start gap-2.5 px-6 py-0 absolute top-px left-0 bg-[#1e488f]" />

      <div className="flex flex-col w-[390px] items-center gap-3 absolute top-px left-0">
        <ApprovalListSection />
        <ApprovalPageSection />
      </div>
    </div>
  );
};
