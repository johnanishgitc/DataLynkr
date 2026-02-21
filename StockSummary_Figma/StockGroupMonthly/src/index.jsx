import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { StockGroupSummary } from "./screens/StockGroupSummary";

createRoot(document.getElementById("app")).render(
  <StrictMode>
    <StockGroupSummary />
  </StrictMode>,
);
