import { useEffect, useState } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import Index from "./pages/Index";
import ArtistDetail from "./pages/ArtistDetail";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";
import Login from "./pages/Login";
import { authAPI } from "./services/api";

const queryClient = new QueryClient();

const App = () => {
  const [authState, setAuthState] = useState<"loading" | "authenticated" | "unauthenticated">("loading");
  const [authEnabled, setAuthEnabled] = useState(true);

  useEffect(() => {
    let mounted = true;
    authAPI
      .me()
      .then((result) => {
        if (!mounted) return;
        setAuthEnabled(result.auth_enabled);
        setAuthState(result.authenticated ? "authenticated" : "unauthenticated");
      })
      .catch(() => {
        if (mounted) setAuthState("unauthenticated");
      });
    return () => {
      mounted = false;
    };
  }, []);

  if (authState === "loading") {
    return <div className="min-h-screen bg-background" />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route
              path="/login"
              element={
                !authEnabled || authState === "authenticated" ? (
                  <Navigate to="/" replace />
                ) : (
                  <Login onAuthenticated={() => setAuthState("authenticated")} />
                )
              }
            />
            <Route
              path="/"
              element={!authEnabled || authState === "authenticated" ? <Index /> : <Navigate to="/login" replace />}
            />
            <Route
              path="/artist/:id"
              element={!authEnabled || authState === "authenticated" ? <ArtistDetail /> : <Navigate to="/login" replace />}
            />
            <Route
              path="/settings"
              element={!authEnabled || authState === "authenticated" ? <Settings /> : <Navigate to="/login" replace />}
            />
            <Route
              path="*"
              element={!authEnabled || authState === "authenticated" ? <NotFound /> : <Navigate to="/login" replace />}
            />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
