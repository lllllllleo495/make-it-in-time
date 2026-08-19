import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RescueApp } from "../../app/RescueApp";
import "../../app/globals.css";

const runtime = globalThis as typeof globalThis & {
  __USPET_API_BASE_URL__?: string;
};

runtime.__USPET_API_BASE_URL__ = (
  import.meta.env.VITE_API_BASE_URL || ""
).replace(/\/$/u, "");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RescueApp />
  </StrictMode>,
);
