import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { ClockProvider } from "./lib/clock";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ClockProvider>
        <App />
      </ClockProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
