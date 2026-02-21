import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { StockSummary } from "./screens/StockSummary";

createRoot(document.getElementById("app")).render(
  <StrictMode>
    <StockSummary />
  </StrictMode>,
);
