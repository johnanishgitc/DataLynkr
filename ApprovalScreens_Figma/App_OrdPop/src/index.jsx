import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Popup } from "./screens/Popup";

createRoot(document.getElementById("app")).render(
  <StrictMode>
    <Popup />
  </StrictMode>,
);
