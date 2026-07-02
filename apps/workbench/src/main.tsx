import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "./styles/theme.css";
import { App } from "./App.js";

const queryClient = new QueryClient();

const root = document.getElementById("root");
if (!root) throw new Error("#root 없음");

createRoot(root).render(
    <StrictMode>
        <QueryClientProvider client={queryClient}>
            <App />
        </QueryClientProvider>
    </StrictMode>,
);
