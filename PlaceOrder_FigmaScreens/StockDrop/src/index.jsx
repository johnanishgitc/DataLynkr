import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { DropdownMenuItems } from "./screens/DropdownMenuItems";

createRoot(document.getElementById("app")).render(
  <StrictMode>
    <DropdownMenuItems />
  </StrictMode>,
);
