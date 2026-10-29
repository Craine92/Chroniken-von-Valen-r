import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles/global.css";
import "./styles/living.css";
import "./styles/lobby.css";
import "./styles/overview.css";
import "./styles/inszenierung.css";
import "./styles/feinschliff.css";
import "./styles/karten-und-sieg.css";
import "./styles/anleitung.css";

createRoot(document.getElementById("root")!).render(<App />);
