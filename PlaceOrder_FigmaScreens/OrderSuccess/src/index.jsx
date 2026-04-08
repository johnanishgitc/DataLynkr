import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Congratulations } from "./screens/Congratulations";

createRoot(document.getElementById("app")).render(
  <StrictMode>
    <Congratulations />
  </StrictMode>,
);
