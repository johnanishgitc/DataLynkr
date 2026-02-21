import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ApprovalsPending } from "./screens/ApprovalsPending";

createRoot(document.getElementById("app")).render(
  <StrictMode>
    <ApprovalsPending />
  </StrictMode>,
);
