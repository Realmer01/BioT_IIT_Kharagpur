import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "@fontsource-variable/inter/opsz.css";
import "@fontsource-variable/newsreader/opsz.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
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
