import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { ArrowLeft } from "lucide-react";
import AppShell from "@/components/AppShell";
import { BlurFade } from "@/components/ui/blur-fade";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <AppShell>
      <div className="container flex flex-col items-center pt-24 text-center">
        <BlurFade>
          <p className="font-mono text-sm text-primary">404</p>
        </BlurFade>
        <BlurFade delay={0.08}>
          <h1 className="mt-3 font-serif text-6xl tracking-tight sm:text-8xl">Off the record.</h1>
        </BlurFade>
        <BlurFade delay={0.16}>
          <p className="mt-4 text-muted-foreground">This page doesn't exist.</p>
          <Link
            to="/"
            className="group mt-8 inline-flex h-10 items-center gap-2 rounded-full border border-white/10 px-5 text-sm transition-colors hover:bg-white/[0.05]"
          >
            <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-0.5" /> Return home
          </Link>
        </BlurFade>
      </div>
    </AppShell>
  );
};

export default NotFound;
