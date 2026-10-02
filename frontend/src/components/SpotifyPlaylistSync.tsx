import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, ArrowUpRight, Check, Copy, ListMusic, Loader2, LogOut, Music, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  useSpotifyAccount,
  useSpotifyConnect,
  useSpotifyCreatePlaylist,
  useSpotifyDisconnect,
  useSpotifyPlaylists,
  useSpotifyPlaylistTypes,
  useSpotifySelectPlaylist,
} from "@/hooks/use-api";
import type { ApiSpotifyPlaylist, SpotifyPlaylistType } from "@/types/music";
import { cn } from "@/lib/utils";

const CALLBACK_PATH = "/api/spotify/callback";
const swap = {
  initial: { opacity: 0, y: 8, filter: "blur(4px)" },
  animate: { opacity: 1, y: 0, filter: "blur(0px)" },
  exit: { opacity: 0, y: -8, filter: "blur(4px)" },
  transition: { duration: 0.25, ease: [0.22, 1, 0.36, 1] as const },
};

const Cover = ({ playlist, className = "size-10" }: { playlist?: ApiSpotifyPlaylist | null; className?: string }) => (
  <div className={`${className} shrink-0 overflow-hidden rounded-lg bg-white/[0.05] ring-1 ring-white/10`}>
    {playlist?.image_url ? (
      <img src={playlist.image_url} alt="" className="size-full object-cover" />
    ) : (
      <div className="flex size-full items-center justify-center"><Music className="size-4 text-muted-foreground" /></div>
    )}
  </div>
);

const SpotifyPlaylistSync = () => {
  const { data: account, isLoading } = useSpotifyAccount();
  const connect = useSpotifyConnect();
  const disconnect = useSpotifyDisconnect();
  const select = useSpotifySelectPlaylist();
  const create = useSpotifyCreatePlaylist();
  const setTypes = useSpotifyPlaylistTypes();
  const { data: playlists, isLoading: playlistsLoading, isError: playlistsError } = useSpotifyPlaylists(!!account?.connected);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("Dropss · New releases");

  const onLocalhost = !account?.fixed_redirect_uri && window.location.hostname === "localhost";
  // Show the URI that will actually be used once on 127.0.0.1.
  const redirectUri =
    account?.fixed_redirect_uri ?? `${window.location.origin.replace("//localhost", "//127.0.0.1")}${CALLBACK_PATH}`;
  const loopbackUrl = window.location.href.replace("//localhost", "//127.0.0.1");

  const startConnect = () =>
    connect.mutate(redirectUri, {
      onSuccess: ({ authorize_url }) => window.location.assign(authorize_url),
      onError: (e) => toast.error(`Could not start Spotify sign-in: ${e.message}`),
    });

  const choose = (id: string) =>
    select.mutate(id === "none" ? "" : id, {
      onSuccess: () => toast.success(id === "none" ? "Playlist sync turned off" : "Playlist selected"),
      onError: (e) => toast.error(e.message),
    });

  const createPlaylist = () =>
    create.mutate(newName.trim(), {
      onSuccess: (p) => {
        setCreating(false);
        toast.success(`Created “${p.name}” and selected it`);
      },
      onError: (e) => toast.error(e.message),
    });

  const toggleType = (type: SpotifyPlaylistType) => {
    const current = new Set(account?.playlist_types ?? []);
    if (current.has(type)) current.delete(type);
    else current.add(type);
    if (current.size === 0) {
      toast.info("Keep at least one release type, or choose “Don't sync”.");
      return;
    }
    setTypes.mutate([...current], { onError: (e) => toast.error(e.message) });
  };

  const copyRedirect = async () => {
    try {
      await navigator.clipboard.writeText(redirectUri);
      toast.success("Redirect URI copied");
    } catch {
      toast.error("Could not copy");
    }
  };

  const state = isLoading ? "loading" : !account?.credentials_configured ? "no-creds" : account.connected ? "connected" : "disconnected";

  return (
    <div className="space-y-4 border-t border-white/[0.06] pt-5">
      <div className="flex items-start gap-3">
        <ListMusic className="mt-0.5 size-4 shrink-0 text-primary" />
        <div>
          <h4 className="text-sm font-medium">Playlist sync</h4>
          <p className="text-xs text-muted-foreground">Add every track of each newly found release to a Spotify playlist.</p>
        </div>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {state === "loading" && (
          <motion.div key="loading" {...swap} className="h-16 animate-pulse rounded-xl bg-white/[0.03]" />
        )}

        {state === "no-creds" && (
          <motion.p key="no-creds" {...swap} className="rounded-xl bg-white/[0.03] px-3.5 py-3 text-xs text-muted-foreground">
            Set the Spotify Client ID and Client Secret first.
          </motion.p>
        )}

        {state === "disconnected" && (
          <motion.div key="disconnected" {...swap} className="space-y-3">
            <div className="space-y-1.5 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3.5">
              <p className="text-xs text-muted-foreground">
                1. In your Spotify app's dashboard, add this <span className="text-foreground">Redirect URI</span>:
              </p>
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-lg bg-black/40 px-2.5 py-1.5 font-mono text-[11px]" title={redirectUri}>
                  {redirectUri}
                </code>
                <button
                  type="button"
                  onClick={copyRedirect}
                  aria-label="Copy redirect URI"
                  className="inline-flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground"
                >
                  <Copy className="size-3.5" />
                </button>
              </div>
              <p className="pt-1 text-xs text-muted-foreground">2. Connect the Spotify account that owns the playlist.</p>
            </div>

            {onLocalhost && (
              <div className="flex items-start gap-2 rounded-xl border border-status-partial/30 bg-status-partial/[0.07] p-3 text-xs">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-status-partial" />
                <p className="text-muted-foreground">
                  Spotify rejects <code className="font-mono">localhost</code> redirect URIs. Open Dropss at{" "}
                  <a href={loopbackUrl} className="font-mono text-foreground underline underline-offset-2">127.0.0.1</a> instead, then connect.
                </p>
              </div>
            )}

            <Button onClick={startConnect} disabled={connect.isPending || onLocalhost} className="gap-1.5 rounded-full">
              {connect.isPending ? <Loader2 className="size-4 animate-spin" /> : <ArrowUpRight className="size-4" />}
              Connect Spotify account
            </Button>
          </motion.div>
        )}

        {state === "connected" && account && (
          <motion.div key="connected" {...swap} className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="size-1.5 rounded-full bg-status-available shadow-[0_0_6px] shadow-status-available" />
                Connected as <span className="font-medium text-foreground">{account.display_name}</span>
              </p>
              <button
                type="button"
                onClick={() => disconnect.mutate(undefined, { onSuccess: () => toast.success("Spotify account disconnected") })}
                disabled={disconnect.isPending}
                className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
              >
                <LogOut className="size-3" /> Disconnect
              </button>
            </div>

            <AnimatePresence mode="popLayout" initial={false}>
              {account.playlist && (
                <motion.a
                  key={account.playlist.id}
                  {...swap}
                  href={account.playlist.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-center gap-3 rounded-xl border border-primary/25 bg-primary/[0.06] p-2.5 transition-colors hover:border-primary/40"
                >
                  <Cover playlist={account.playlist} className="size-12" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] tracking-widest text-primary uppercase">Syncing to</p>
                    <p className="truncate text-sm font-medium">{account.playlist.name}</p>
                  </div>
                  <ArrowUpRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-primary" />
                </motion.a>
              )}
            </AnimatePresence>

            <AnimatePresence mode="wait" initial={false}>
              {creating ? (
                <motion.form
                  key="create"
                  {...swap}
                  onSubmit={(e) => { e.preventDefault(); createPlaylist(); }}
                  className="flex gap-2"
                >
                  <Input
                    autoFocus
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    maxLength={100}
                    aria-label="New playlist name"
                    className="h-10 rounded-xl border-white/[0.07] bg-white/[0.03] text-sm focus-visible:border-primary/40 focus-visible:ring-0"
                  />
                  <Button type="submit" disabled={!newName.trim() || create.isPending} className="h-10 gap-1.5 rounded-xl">
                    {create.isPending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Create
                  </Button>
                  <Button type="button" variant="ghost" size="icon" className="size-10 shrink-0" onClick={() => setCreating(false)} aria-label="Cancel">
                    <X className="size-4" />
                  </Button>
                </motion.form>
              ) : (
                <motion.div key="pick" {...swap} className="flex gap-2">
                  <Select value={account.playlist?.id ?? "none"} onValueChange={choose} disabled={select.isPending || playlistsLoading}>
                    <SelectTrigger className="h-10 flex-1 rounded-xl border-white/[0.07] bg-white/[0.03] text-sm focus:ring-0">
                      <SelectValue placeholder={playlistsLoading ? "Loading playlists…" : "Choose a playlist"} />
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                      <SelectItem value="none">Don't sync</SelectItem>
                      {(playlists ?? []).map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                      {account.playlist && !playlists?.some((p) => p.id === account.playlist!.id) && (
                        <SelectItem value={account.playlist.id}>{account.playlist.name}</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                  <Button variant="outline" className="h-10 gap-1.5 rounded-xl" onClick={() => setCreating(true)}>
                    <Plus className="size-4" /> New
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
            {playlistsError && <p className="text-xs text-destructive">Could not load your playlists from Spotify.</p>}

            <div className="space-y-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="mr-1 text-xs text-muted-foreground">Add</span>
                {([["album", "Albums"], ["single", "Singles & EPs"]] as const).map(([type, label]) => {
                  const on = account.playlist_types.includes(type);
                  return (
                    <button
                      key={type}
                      type="button"
                      role="checkbox"
                      aria-checked={on}
                      disabled={setTypes.isPending}
                      onClick={() => toggleType(type)}
                      className={cn(
                        "inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-xs transition-all active:scale-95",
                        on ? "border-primary/40 bg-primary/10 text-primary" : "border-dashed border-white/10 text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <AnimatePresence initial={false}>
                        {on && (
                          <motion.span initial={{ width: 0, opacity: 0 }} animate={{ width: "auto", opacity: 1 }} exit={{ width: 0, opacity: 0 }} className="overflow-hidden">
                            <Check className="size-3" />
                          </motion.span>
                        )}
                      </AnimatePresence>
                      {label}
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] leading-relaxed text-muted-foreground/80">
                Songs already in the playlist are skipped. Album versions take priority: when an album arrives, it replaces
                any single or EP copy of the same song.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default SpotifyPlaylistSync;
