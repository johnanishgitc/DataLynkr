import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { UpdateOrderEntry } from "./screens/UpdateOrderEntry";

createRoot(document.getElementById("app")).render(
  <StrictMode>
    <UpdateOrderEntry />
  </StrictMode>,
);
