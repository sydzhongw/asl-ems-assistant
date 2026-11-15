import { createRoot } from "react-dom/client";
import CallScreenExample from "../components/Callscreenexample";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("React app root element was not found.");
}

createRoot(rootElement).render(<CallScreenExample />);
