import { FormEvent, useState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";

import { motion } from "motion/react";
import { Backdrop } from "@/components/AppShell";
import { BlurFade } from "@/components/ui/blur-fade";
import { BorderBeam } from "@/components/ui/border-beam";
import { getSavedAccent } from "@/lib/accent";
import { authAPI } from "@/services/api";

interface LoginProps {
  onAuthenticated: () => void;
}

const Login = ({ onAuthenticated }: LoginProps) => {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      await authAPI.login(password);
      setPassword("");
      onAuthenticated();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Login failed";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4">
      <Backdrop accent={getSavedAccent()} />
      <div className="relative z-10 w-full max-w-sm">
        <BlurFade className="mb-8 text-center">
          <h1 className="font-serif text-6xl tracking-tight italic">Dropss</h1>
          <p className="mt-2 text-sm text-muted-foreground">Never miss a release again.</p>
        </BlurFade>
        <BlurFade delay={0.1}>
          <motion.form
            onSubmit={onSubmit}
            animate={error ? { x: [0, -8, 8, -5, 5, 0] } : {}}
            transition={{ duration: 0.4 }}
            className="surface relative space-y-4 overflow-hidden bg-card p-6 shadow-2xl shadow-black/50"
          >
            <BorderBeam size={100} duration={7} colorFrom="hsl(var(--primary))" colorTo="hsl(var(--primary) / 0)" />
            <label htmlFor="password" className="block text-xs text-muted-foreground">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter your APP_PASSWORD"
              autoFocus
              required
              className="h-11 w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 font-mono text-sm transition-colors outline-none placeholder:font-sans placeholder:text-muted-foreground/60 focus:border-primary/50"
            />
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <button
              type="submit"
              disabled={loading}
              className="group inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-medium text-primary-foreground transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-60"
            >
              {loading ? <Loader2 className="size-4 animate-spin" /> : <>Sign in <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" /></>}
            </button>
          </motion.form>
        </BlurFade>
      </div>
    </div>
  );
};

export default Login;
