import { useState, useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Save, Loader2, Music, Bell, Radio, Server, Clock, Eye, EyeOff, Send, KeyRound, Copy, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import AppShell from "@/components/AppShell";
import { MagicCard } from "@/components/ui/magic-card";
import { BlurFade } from "@/components/ui/blur-fade";
import { ShimmerButton } from "@/components/ui/shimmer-button";
import { cn } from "@/lib/utils";
import { useSettings, useUpdateSettings, useApiKeys, useCreateApiKey, useRevokeApiKey } from "@/hooks/use-api";
import { integrationAPI } from "@/services/api";
import type { ApiSettingsUpdate, ApiKeyScope } from "@/types/music";
import { toast } from "sonner";

interface FieldConfig {
  key: string;
  label: string;
  placeholder: string;
  type?: "text" | "password" | "number";
  envOnly?: boolean;
}

interface SectionConfig {
  title: string;
  icon: React.ReactNode;
  description: string;
  fields: FieldConfig[];
  testAction?: () => Promise<{ success: boolean; message: string }>;
  testLabel?: string;
}

const sections: SectionConfig[] = [
  {
    title: "Spotify",
    icon: <Music className="size-4" />,
    description: "Spotify API credentials for artist search and release tracking",
    fields: [
      { key: "spotify_client_id", label: "Client ID", placeholder: "Your Spotify Client ID" },
      { key: "spotify_client_secret", label: "Client Secret", placeholder: "Set via environment", type: "password", envOnly: true },
    ],
  },
  {
    title: "Last.fm",
    icon: <Radio className="size-4" />,
    description: "Import your top artists from Last.fm",
    fields: [
      { key: "lastfm_api_key", label: "API Key", placeholder: "Set via environment", type: "password", envOnly: true },
      { key: "lastfm_username", label: "Username", placeholder: "Your Last.fm username" },
    ],
  },
  {
    title: "Jellyfin",
    icon: <Server className="size-4" />,
    description: "Check releases against your Jellyfin library",
    fields: [
      { key: "jellyfin_url", label: "Server URL", placeholder: "http://your-jellyfin:8096" },
      { key: "jellyfin_api_key", label: "API Key", placeholder: "Set via environment", type: "password", envOnly: true },
    ],
  },
  {
    title: "Plex",
    icon: <Server className="size-4" />,
    description: "Check releases against your Plex library",
    fields: [
      { key: "plex_url", label: "Server URL", placeholder: "http://your-plex:32400" },
      { key: "plex_token", label: "Token", placeholder: "Set via environment", type: "password", envOnly: true },
    ],
  },
  {
    title: "Navidrome",
    icon: <Server className="size-4" />,
    description: "Check releases against your Navidrome library (Subsonic API)",
    fields: [
      { key: "navidrome_url", label: "Server URL", placeholder: "http://your-navidrome:4533" },
      { key: "navidrome_username", label: "Username", placeholder: "Your Navidrome username" },
      { key: "navidrome_password", label: "Password", placeholder: "Set via environment", type: "password", envOnly: true },
    ],
  },
  {
    title: "Gotify",
    icon: <Bell className="size-4" />,
    description: "Push notifications via Gotify",
    fields: [
      { key: "gotify_url", label: "Server URL", placeholder: "http://your-gotify:8080" },
      { key: "gotify_token", label: "App Token", placeholder: "Set via environment", type: "password", envOnly: true },
    ],
    testAction: () => integrationAPI.testGotify(),
    testLabel: "Send Test Notification",
  },
  {
    title: "Ntfy",
    icon: <Bell className="size-4" />,
    description: "Push notifications via ntfy",
    fields: [
      { key: "ntfy_url", label: "Server URL", placeholder: "https://ntfy.sh" },
      { key: "ntfy_topic", label: "Topic", placeholder: "Your ntfy topic" },
      { key: "ntfy_username", label: "Username (optional)", placeholder: "Username for auth" },
      { key: "ntfy_password", label: "Password (optional)", placeholder: "Set via environment", type: "password", envOnly: true },
    ],
    testAction: () => integrationAPI.testNtfy(),
    testLabel: "Send Test Notification",
  },
  {
    title: "Telegram",
    icon: <Bell className="size-4" />,
    description: "Push notifications via a Telegram bot",
    fields: [
      { key: "telegram_bot_token", label: "Bot Token", placeholder: "Set via environment", type: "password", envOnly: true },
      { key: "telegram_chat_id", label: "Chat ID", placeholder: "e.g. 123456789" },
    ],
    testAction: () => integrationAPI.testTelegram(),
    testLabel: "Send Test Notification",
  },
  {
    title: "Application",
    icon: <Clock className="size-4" />,
    description: "General application settings",
    fields: [
      { key: "release_check_time", label: "Release Check Time", placeholder: "09:00 (24-hour format)" },
      { key: "timezone", label: "Timezone", placeholder: "UTC" },
      { key: "release_months_back", label: "Release Months Back", placeholder: "3", type: "number" },
    ],
  },
];

const API_KEY_SCOPE_OPTIONS: Array<{ scope: ApiKeyScope; label: string; description: string }> = [
  { scope: "read", label: "Read", description: "Access GET endpoints" },
  { scope: "write", label: "Write", description: "Run mutating API actions" },
  { scope: "admin", label: "Admin", description: "Manage settings and API keys" },
];

const Settings = () => {
  const { data: settings, isLoading } = useSettings();
  const updateSettings = useUpdateSettings();
  const { data: apiKeys, isLoading: apiKeysLoading } = useApiKeys();
  const createApiKey = useCreateApiKey();
  const revokeApiKey = useRevokeApiKey();
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [visibleSecrets, setVisibleSecrets] = useState<Set<string>>(new Set());
  const [testingSection, setTestingSection] = useState<string | null>(null);
  const [apiKeyName, setApiKeyName] = useState("");
  const [apiKeyScopes, setApiKeyScopes] = useState<Set<ApiKeyScope>>(new Set<ApiKeyScope>(["read"]));
  const [apiKeyExpiryDays, setApiKeyExpiryDays] = useState("90");
  const [latestCreatedApiKey, setLatestCreatedApiKey] = useState<string>("");

  useEffect(() => {
    if (settings) {
      const data: Record<string, string> = {};
      for (const section of sections) {
        for (const field of section.fields) {
          data[field.key] = String(settings[field.key] ?? "");
        }
      }
      setFormData(data);
      setDirty(new Set());
    }
  }, [settings]);

  const handleChange = (key: string, value: string) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
    setDirty((prev) => new Set(prev).add(key));
  };

  const toggleSecret = (key: string) => {
    setVisibleSecrets((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleTest = async (section: SectionConfig) => {
    if (!section.testAction) return;
    setTestingSection(section.title);
    try {
      const result = await section.testAction();
      if (result.success) {
        toast.success(`${section.title}: ${result.message || "Test notification sent!"}`);
      } else {
        toast.error(`${section.title}: ${result.message || "Test failed"}`);
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Test failed";
      toast.error(`${section.title}: ${message}`);
    } finally {
      setTestingSection(null);
    }
  };

  const toggleApiKeyScope = (scope: ApiKeyScope, checked: boolean) => {
    setApiKeyScopes((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(scope);
      } else {
        next.delete(scope);
      }
      if (next.size === 0) {
        next.add("read");
      }
      return next;
    });
  };

  const handleCreateApiKey = () => {
    const trimmedName = apiKeyName.trim();
    if (!trimmedName) {
      toast.error("API key name is required");
      return;
    }

    const expiryDays = parseInt(apiKeyExpiryDays, 10);
    const payload = {
      name: trimmedName,
      scopes: Array.from(apiKeyScopes),
      expires_in_days: Number.isFinite(expiryDays) && expiryDays > 0 ? expiryDays : undefined,
    };

    createApiKey.mutate(payload, {
      onSuccess: (result) => {
        setLatestCreatedApiKey(result.api_key);
        setApiKeyName("");
        setApiKeyScopes(new Set<ApiKeyScope>(["read"]));
        setApiKeyExpiryDays("90");
        toast.success("API key created. Copy it now; it will not be shown again.");
      },
      onError: (e) => toast.error(`Failed to create API key: ${e.message}`),
    });
  };

  const handleRevokeApiKey = (keyId: string) => {
    revokeApiKey.mutate(keyId, {
      onSuccess: () => toast.success("API key revoked"),
      onError: (e) => toast.error(`Failed to revoke API key: ${e.message}`),
    });
  };

  const copyLatestApiKey = async () => {
    if (!latestCreatedApiKey) return;
    try {
      await navigator.clipboard.writeText(latestCreatedApiKey);
      toast.success("API key copied");
    } catch {
      toast.error("Could not copy API key");
    }
  };

  const formatTimestamp = (value: string | null) => {
    if (!value) return "Never";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString();
  };

  const handleSave = () => {
    const changes: ApiSettingsUpdate = {};
    for (const key of dirty) {
      const value = formData[key];
      if (key === "release_months_back") {
        changes[key] = parseInt(value) || 3;
      } else {
        changes[key] = value;
      }
    }

    if (Object.keys(changes).length === 0) {
      toast.info("No changes to save");
      return;
    }

    updateSettings.mutate(changes, {
      onSuccess: () => {
        toast.success("Settings saved.");
        setDirty(new Set());
      },
      onError: (e) => toast.error(`Failed to save: ${e.message}`),
    });
  };

  const slug = (title: string) => title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const inputCls = "h-10 rounded-xl border-white/[0.07] bg-white/[0.03] font-mono text-sm focus-visible:border-primary/40 focus-visible:ring-0 disabled:opacity-60";
  const navItems = [...sections.map((s) => s.title), "API Keys"];

  return (
    <AppShell>
      <section className="container pt-10 pb-8 sm:pt-16">
        <BlurFade>
          <p className="mb-3 text-[11px] font-medium tracking-[0.25em] text-primary uppercase">Preferences</p>
          <h1 className="font-serif text-5xl leading-[0.95] tracking-tight sm:text-7xl">Settings</h1>
          <p className="mt-4 max-w-md text-sm text-muted-foreground">
            Configure integrations and application preferences.
            {settings?.app_version && <span className="ml-2 rounded-full bg-white/[0.05] px-2 py-0.5 font-mono text-[11px]">v{settings.app_version}</span>}
          </p>
        </BlurFade>
      </section>

      <main className="container grid gap-10 lg:grid-cols-[200px_minmax(0,1fr)]">
        <nav className="hidden lg:block">
          <ul className="sticky top-6 space-y-0.5">
            {navItems.map((title, i) => (
              <BlurFade key={title} delay={i * 0.03} direction="right" offset={6}>
                <li>
                  <a
                    href={`#${slug(title)}`}
                    className="block rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-white/[0.04] hover:text-foreground"
                  >
                    {title}
                  </a>
                </li>
              </BlurFade>
            ))}
          </ul>
        </nav>

        <div className="max-w-3xl space-y-4">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="surface h-44 animate-pulse" style={{ animationDelay: `${i * 80}ms` }} />
            ))
          ) : (
            <>
              {sections.map((section, i) => (
                <BlurFade key={section.title} inView delay={Math.min(i, 4) * 0.05} offset={10} direction="up">
                  <SettingsCard id={slug(section.title)} icon={section.icon} title={section.title} description={section.description}>
                    <div className="grid gap-4 sm:grid-cols-2">
                      {section.fields.map((field) => {
                        const isSecret = field.type === "password";
                        const isVisible = visibleSecrets.has(field.key);
                        const isDirty = dirty.has(field.key);

                        return (
                          <div key={field.key} className="space-y-1.5">
                            <Label htmlFor={field.key} className="flex items-center gap-2 text-xs font-normal text-muted-foreground">
                              {field.label}
                              {field.envOnly && <span className="rounded-full bg-white/[0.05] px-1.5 py-px text-[9px] tracking-wider uppercase">env</span>}
                              <AnimatePresence>
                                {isDirty && (
                                  <motion.span
                                    initial={{ opacity: 0, scale: 0.6 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.6 }}
                                    className="size-1.5 rounded-full bg-primary shadow-[0_0_8px] shadow-primary"
                                    title="Modified"
                                  />
                                )}
                              </AnimatePresence>
                            </Label>
                            <div className="relative">
                              <Input
                                id={field.key}
                                type={isSecret && !isVisible ? "password" : field.type === "number" ? "number" : "text"}
                                value={formData[field.key] ?? ""}
                                onChange={(e) => handleChange(field.key, e.target.value)}
                                placeholder={field.placeholder}
                                disabled={field.envOnly}
                                className={cn(inputCls, isSecret && "pr-10", isDirty && "border-primary/40")}
                              />
                              {isSecret && (
                                <button
                                  type="button"
                                  aria-label={isVisible ? "Hide value" : "Show value"}
                                  className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                                  onClick={() => toggleSecret(field.key)}
                                >
                                  {isVisible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {section.testAction && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 rounded-full"
                        disabled={testingSection === section.title}
                        onClick={() => handleTest(section)}
                      >
                        {testingSection === section.title ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
                        {section.testLabel}
                      </Button>
                    )}
                  </SettingsCard>
                </BlurFade>
              ))}

              <BlurFade inView offset={10} direction="up">
                <SettingsCard
                  id="api-keys"
                  icon={<KeyRound className="size-4" />}
                  title="API Keys"
                  description="Machine credentials for external apps. Raw keys are shown only once."
                >
                  <div className="grid gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="api-key-name" className="text-xs font-normal text-muted-foreground">Key name</Label>
                      <Input
                        id="api-key-name"
                        value={apiKeyName}
                        onChange={(e) => setApiKeyName(e.target.value)}
                        placeholder="Example: HomeAssistant read key"
                        className={inputCls}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-xs font-normal text-muted-foreground">Scopes</Label>
                      <div className="grid gap-2 sm:grid-cols-3">
                        {API_KEY_SCOPE_OPTIONS.map((option) => {
                          const on = apiKeyScopes.has(option.scope);
                          return (
                            <label
                              key={option.scope}
                              className={cn(
                                "flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2.5 text-xs transition-colors",
                                on ? "border-primary/40 bg-primary/[0.07]" : "border-white/[0.07] bg-white/[0.02] hover:border-white/[0.14]",
                              )}
                            >
                              <Checkbox
                                checked={on}
                                onCheckedChange={(checked) => toggleApiKeyScope(option.scope, checked === true)}
                                className="mt-0.5"
                              />
                              <span>
                                <span className="block font-medium">{option.label}</span>
                                <span className="text-muted-foreground">{option.description}</span>
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-end gap-3">
                      <div className="w-40 space-y-1.5">
                        <Label htmlFor="api-key-expiry" className="text-xs font-normal text-muted-foreground">Expiry (days, optional)</Label>
                        <Input
                          id="api-key-expiry"
                          type="number"
                          min={1}
                          value={apiKeyExpiryDays}
                          onChange={(e) => setApiKeyExpiryDays(e.target.value)}
                          placeholder="90"
                          className={inputCls}
                        />
                      </div>
                      <Button onClick={handleCreateApiKey} disabled={createApiKey.isPending} className="h-10 gap-1.5 rounded-xl">
                        {createApiKey.isPending ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
                        Create API key
                      </Button>
                    </div>

                    <AnimatePresence>
                      {latestCreatedApiKey && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="space-y-2.5 rounded-xl border border-status-available/30 bg-status-available/[0.07] p-3.5">
                            <p className="text-xs text-status-available">New key — copy it now, it cannot be retrieved later:</p>
                            <code className="block rounded-lg bg-black/40 p-2.5 font-mono text-[11px] break-all">{latestCreatedApiKey}</code>
                            <Button variant="outline" size="sm" className="gap-1.5 rounded-full" onClick={copyLatestApiKey}>
                              <Copy className="size-3.5" /> Copy key
                            </Button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  <div className="space-y-2 border-t border-white/[0.06] pt-5">
                    <h4 className="text-[11px] font-medium tracking-widest text-muted-foreground uppercase">Existing keys</h4>
                    {apiKeysLoading ? (
                      <div className="h-24 animate-pulse rounded-xl bg-white/[0.03]" />
                    ) : (apiKeys?.items.length ?? 0) === 0 ? (
                      <p className="text-xs text-muted-foreground">No API keys created yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {apiKeys?.items.map((item) => (
                          <div key={item.key_id} className="space-y-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-3 text-xs">
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <p className="flex items-center gap-2 text-sm font-medium">
                                  <span className="truncate">{item.name}</span>
                                  <span
                                    className={cn(
                                      "shrink-0 rounded-full px-2 py-px text-[10px] font-normal",
                                      item.is_active ? "bg-status-available/10 text-status-available" : "bg-status-partial/10 text-status-partial",
                                    )}
                                  >
                                    {item.is_active ? "Active" : item.revoked_at ? "Revoked" : "Expired"}
                                  </span>
                                </p>
                                <p className="font-mono text-muted-foreground">{item.key_prefix}…</p>
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                className="gap-1.5 rounded-full hover:border-destructive/40 hover:text-destructive"
                                disabled={!item.is_active || revokeApiKey.isPending}
                                onClick={() => handleRevokeApiKey(item.key_id)}
                              >
                                <Trash2 className="size-3.5" /> Revoke
                              </Button>
                            </div>
                            <div className="grid gap-x-4 gap-y-0.5 text-muted-foreground sm:grid-cols-2">
                              <p>Scopes: <span className="text-foreground/80">{item.scopes.join(", ")}</span></p>
                              <p>Created: {formatTimestamp(item.created_at)}</p>
                              <p>Last used: {formatTimestamp(item.last_used_at)}</p>
                              <p>Expires: {item.expires_at ? formatTimestamp(item.expires_at) : "Never"}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </SettingsCard>
              </BlurFade>
            </>
          )}
        </div>
      </main>

      <AnimatePresence>
        {(dirty.size > 0 || updateSettings.isPending) && (
          <motion.div
            initial={{ y: 40, opacity: 0, filter: "blur(6px)" }}
            animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
            exit={{ y: 40, opacity: 0, filter: "blur(6px)" }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            className="fixed inset-x-0 bottom-24 z-40 flex justify-center px-4"
          >
            <div className="flex items-center gap-4 rounded-full border border-white/[0.08] bg-[#111114]/95 py-1.5 pr-1.5 pl-5 shadow-2xl shadow-black/60">
              <span className="text-sm text-muted-foreground">
                <span className="font-mono text-foreground">{dirty.size}</span> unsaved change{dirty.size !== 1 ? "s" : ""}
              </span>
              <ShimmerButton
                onClick={handleSave}
                disabled={dirty.size === 0 || updateSettings.isPending}
                background="hsl(var(--primary))"
                shimmerColor="#ffffff"
                shimmerDuration="2.5s"
                className="h-9 gap-1.5 border-0 px-4 text-sm font-medium text-primary-foreground disabled:opacity-60"
              >
                {updateSettings.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                Save changes
              </ShimmerButton>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </AppShell>
  );
};

const SettingsCard = ({ id, icon, title, description, children }: { id: string; icon: React.ReactNode; title: string; description: string; children: React.ReactNode }) => (
  <MagicCard
    className="scroll-mt-6 rounded-2xl"
    gradientSize={360}
    gradientColor="hsl(var(--primary) / 0.05)"
    gradientOpacity={1}
    gradientFrom="hsl(var(--primary) / 0.7)"
    gradientTo="hsl(var(--primary) / 0.15)"
  >
    <div id={id} className="scroll-mt-6 space-y-5 p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">{icon}</span>
        <div>
          <h3 className="text-sm font-medium">{title}</h3>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      {children}
    </div>
  </MagicCard>
);

export default Settings;
