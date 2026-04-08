import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AddDetailsBuyer } from "./screens/AddDetailsBuyer";

createRoot(document.getElementById("app")).render(
  <StrictMode>
    <AddDetailsBuyer />
  </StrictMode>,
);
