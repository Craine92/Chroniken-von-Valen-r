import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles/global.css";
import "./styles/living.css";
import "./styles/lobby.css";
import "./styles/overview.css";
import "./styles/inszenierung.css";

createRoot(document.getElementById("root")!).render(<App />);
