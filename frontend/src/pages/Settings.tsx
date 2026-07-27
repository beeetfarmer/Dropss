import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Save, Loader2, Music, Bell, Radio, Server, Clock, Eye, EyeOff, Send, KeyRound, Copy, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import AnimatedBackground from "@/components/AnimatedBackground";
import Header from "@/components/Header";
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
    icon: <Music className="h-5 w-5 text-green-400" />,
    description: "Spotify API credentials for artist search and release tracking",
    fields: [
      { key: "spotify_client_id", label: "Client ID", placeholder: "Your Spotify Client ID" },
      { key: "spotify_client_secret", label: "Client Secret", placeholder: "Set via environment", type: "password", envOnly: true },
    ],
  },
  {
    title: "Last.fm",
    icon: <Radio className="h-5 w-5 text-red-400" />,
    description: "Import your top artists from Last.fm",
    fields: [
      { key: "lastfm_api_key", label: "API Key", placeholder: "Set via environment", type: "password", envOnly: true },
      { key: "lastfm_username", label: "Username", placeholder: "Your Last.fm username" },
    ],
  },
  {
    title: "Jellyfin",
    icon: <Server className="h-5 w-5 text-purple-400" />,
    description: "Check releases against your Jellyfin library",
    fields: [
      { key: "jellyfin_url", label: "Server URL", placeholder: "http://your-jellyfin:8096" },
      { key: "jellyfin_api_key", label: "API Key", placeholder: "Set via environment", type: "password", envOnly: true },
    ],
  },
  {
    title: "Plex",
    icon: <Server className="h-5 w-5 text-yellow-400" />,
    description: "Check releases against your Plex library",
    fields: [
      { key: "plex_url", label: "Server URL", placeholder: "http://your-plex:32400" },
      { key: "plex_token", label: "Token", placeholder: "Set via environment", type: "password", envOnly: true },
    ],
  },
  {
    title: "Navidrome",
    icon: <Server className="h-5 w-5 text-orange-400" />,
    description: "Check releases against your Navidrome library (Subsonic API)",
    fields: [
      { key: "navidrome_url", label: "Server URL", placeholder: "http://your-navidrome:4533" },
      { key: "navidrome_username", label: "Username", placeholder: "Your Navidrome username" },
      { key: "navidrome_password", label: "Password", placeholder: "Set via environment", type: "password", envOnly: true },
    ],
  },
  {
    title: "Gotify",
    icon: <Bell className="h-5 w-5 text-blue-400" />,
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
    icon: <Bell className="h-5 w-5 text-emerald-400" />,
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
    icon: <Bell className="h-5 w-5 text-sky-400" />,
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
    icon: <Clock className="h-5 w-5 text-primary" />,
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
  const [searchQuery, setSearchQuery] = useState("");
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

  return (
    <div className="min-h-screen bg-background relative">
      <AnimatedBackground />
      <div className="relative z-10">
        <Header searchQuery={searchQuery} onSearchChange={setSearchQuery} />

        <main className="container mx-auto px-4 py-6 max-w-3xl">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-bold">Settings</h2>
              <p className="text-sm text-muted-foreground">Configure integrations and application preferences</p>
            </div>
            <Button
              onClick={handleSave}
              disabled={dirty.size === 0 || updateSettings.isPending}
              className="gap-1.5"
            >
              {updateSettings.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save Changes
              {dirty.size > 0 && (
                <span className="ml-1 bg-primary-foreground/20 px-1.5 py-0.5 rounded text-[10px] font-mono">
                  {dirty.size}
                </span>
              )}
            </Button>
          </div>

          {isLoading ? (
            <div className="space-y-6">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-40 rounded-lg" />
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              {sections.map((section, i) => (
                <motion.div
                  key={section.title}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="glass-card p-5 space-y-4"
                >
                  <div className="flex items-center gap-3">
                    {section.icon}
                    <div>
                      <h3 className="text-sm font-semibold">{section.title}</h3>
                      <p className="text-[11px] text-muted-foreground">{section.description}</p>
                    </div>
                  </div>

                  <div className="grid gap-3">
                    {section.fields.map((field) => {
                      const isSecret = field.type === "password";
                      const isVisible = visibleSecrets.has(field.key);
                      const isDirty = dirty.has(field.key);

                      return (
                        <div key={field.key} className="space-y-1.5">
                          <Label className="text-xs text-muted-foreground flex items-center gap-2">
                            {field.label}
                            {field.envOnly && <span className="text-[10px] text-muted-foreground">(env-only)</span>}
                            {isDirty && <span className="text-primary text-[10px]">(modified)</span>}
                          </Label>
                          <div className="relative">
                            <Input
                              type={isSecret && !isVisible ? "password" : field.type === "number" ? "number" : "text"}
                              value={formData[field.key] ?? ""}
                              onChange={(e) => handleChange(field.key, e.target.value)}
                              placeholder={field.placeholder}
                              disabled={field.envOnly}
                              className={`bg-secondary/50 border-border h-9 text-sm font-mono ${isSecret ? "pr-10" : ""} ${isDirty ? "border-primary/50" : ""}`}
                            />
                            {isSecret && (
                              <button
                                type="button"
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                onClick={() => toggleSecret(field.key)}
                              >
                                {isVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
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
                      className="gap-1.5"
                      disabled={testingSection === section.title}
                      onClick={() => handleTest(section)}
                    >
                      {testingSection === section.title ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Send className="h-3.5 w-3.5" />
                      )}
                      {section.testLabel}
                    </Button>
                  )}
                </motion.div>
              ))}

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: sections.length * 0.05 }}
                className="glass-card p-5 space-y-4"
              >
                <div className="flex items-center gap-3">
                  <KeyRound className="h-5 w-5 text-cyan-400" />
                  <div>
                    <h3 className="text-sm font-semibold">API Keys</h3>
                    <p className="text-[11px] text-muted-foreground">
                      Machine credentials for external apps. Raw keys are shown only once.
                    </p>
                  </div>
                </div>

                <div className="grid gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Key Name</Label>
                    <Input
                      value={apiKeyName}
                      onChange={(e) => setApiKeyName(e.target.value)}
                      placeholder="Example: HomeAssistant read key"
                      className="bg-secondary/50 border-border h-9 text-sm font-mono"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Scopes</Label>
                    <div className="grid gap-2 sm:grid-cols-3">
                      {API_KEY_SCOPE_OPTIONS.map((option) => (
                        <label
                          key={option.scope}
                          className="flex items-start gap-2 rounded border border-border/60 bg-secondary/30 px-3 py-2 text-xs"
                        >
                          <Checkbox
                            checked={apiKeyScopes.has(option.scope)}
                            onCheckedChange={(checked) => toggleApiKeyScope(option.scope, checked === true)}
                          />
                          <span>
                            <span className="block font-medium">{option.label}</span>
                            <span className="text-muted-foreground">{option.description}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Expiry (days, optional)</Label>
                    <Input
                      type="number"
                      min={1}
                      value={apiKeyExpiryDays}
                      onChange={(e) => setApiKeyExpiryDays(e.target.value)}
                      placeholder="90"
                      className="bg-secondary/50 border-border h-9 text-sm font-mono"
                    />
                  </div>

                  <Button
                    onClick={handleCreateApiKey}
                    disabled={createApiKey.isPending}
                    className="w-fit gap-1.5"
                  >
                    {createApiKey.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <KeyRound className="h-4 w-4" />
                    )}
                    Create API Key
                  </Button>

                  {latestCreatedApiKey && (
                    <div className="rounded border border-emerald-500/30 bg-emerald-500/10 p-3 space-y-2">
                      <p className="text-xs text-emerald-300">
                        New key (copy now, it cannot be retrieved later):
                      </p>
                      <code className="block text-[11px] break-all font-mono text-emerald-200">
                        {latestCreatedApiKey}
                      </code>
                      <Button variant="outline" size="sm" className="gap-1.5" onClick={copyLatestApiKey}>
                        <Copy className="h-3.5 w-3.5" />
                        Copy Key
                      </Button>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Existing Keys</h4>
                  {apiKeysLoading ? (
                    <Skeleton className="h-24 rounded-lg" />
                  ) : (apiKeys?.items.length ?? 0) === 0 ? (
                    <p className="text-xs text-muted-foreground">No API keys created yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {apiKeys?.items.map((item) => (
                        <div
                          key={item.key_id}
                          className="rounded border border-border/60 bg-secondary/30 px-3 py-2 text-xs space-y-1.5"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="font-medium text-sm">{item.name}</p>
                              <p className="text-muted-foreground font-mono">{item.key_prefix}...</p>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-1.5"
                              disabled={!item.is_active || revokeApiKey.isPending}
                              onClick={() => handleRevokeApiKey(item.key_id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Revoke
                            </Button>
                          </div>
                          <p className="text-muted-foreground">
                            Scopes: {item.scopes.join(", ")} | Created: {formatTimestamp(item.created_at)}
                          </p>
                          <p className="text-muted-foreground">
                            Last used: {formatTimestamp(item.last_used_at)} | Expires: {item.expires_at ? formatTimestamp(item.expires_at) : "Never"}
                          </p>
                          <p className={item.is_active ? "text-emerald-300" : "text-amber-300"}>
                            {item.is_active ? "Active" : item.revoked_at ? "Revoked" : "Expired"}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default Settings;
