import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { OrderEntry } from "./screens/OrderEntry";

createRoot(document.getElementById("app")).render(
  <StrictMode>
    <OrderEntry />
  </StrictMode>,
);
