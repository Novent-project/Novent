<script lang="ts">
  import * as Sidebar from "$lib/components/ui/sidebar/index.js";
  import * as Collapsible from "$lib/components/ui/collapsible/index.js";
  import { ChevronRight, Calendar, Trophy, GitCompareArrows, X } from "lucide-svelte";
  import type { ComponentProps } from "svelte";

  type Props = {
  groupedLaps?:  Record<string, Record<string, Record<string, Record<string, any>>>>;
  activeGame?:   string | null;
  selectedLap?:  any;
  compLapIds?:   string[];
  canAddComp?:   boolean;
  onSelectLap?:  (lap: any) => void;
  onAddComp?:    (lap: any) => void;
  onRemoveComp?: (uuid: string) => void;
};

let {
  groupedLaps  = {},
  activeGame   = $bindable(null),
  selectedLap  = undefined,
  compLapIds   = [] as string[],
  canAddComp   = true,
  onSelectLap,
  onAddComp,
  onRemoveComp,
}: Props = $props();

  const LAP_COLORS = ['#ffffff', '#f59e0b', '#3b82f6'];

  const games = $derived(Object.keys(groupedLaps));

  $effect(() => {
    if ((!activeGame || !games.includes(activeGame)) && games.length > 0) activeGame = games[0];
  });

function formatGame(raw: string): string {
  const labels: Record<string, string> = {
    AC:      "AC",
    ACC:     "ACC",
    iRacing: "iRacing",
    LMU:     "LMU",
  };
  return labels[raw] ?? raw;
}

function formatGameFull(raw: string): string {
  const labels: Record<string, string> = {
    AC:      "Assetto Corsa",
    ACC:     "Assetto Corsa Competizione",
    iRacing: "iRacing",
    LMU:     "Le Mans Ultimate",
  };
  return labels[raw] ?? raw;
}

  function formatName(raw: string): string {
    if (!raw) return "Unknown";
    const overrides: Record<string, string> = {
      "ks_porsche_919_hybrid": "Porsche 919 Hybrid",
      "ks_red_bull_ring":      "Red Bull Ring",
      "ks_nurburgring":        "Nürburgring",
      "imola":                 "Imola Circuit",
      "spa":                   "Circuit de Spa-Francorchamps",
    };
    const lowerRaw = raw.toLowerCase();
    if (overrides[lowerRaw]) return overrides[lowerRaw];
    return raw
      .replace(/^(ks_|acu_|rt_)/i, "")
      .split("_")
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  }

  // Colour for a comp lap by its position in compLapIds
  function compColor(uuid: string): string {
    const i = compLapIds.indexOf(uuid);
    return i >= 0 ? LAP_COLORS[i + 1] : '';
  }
</script>

{#snippet googleFolder(cssClass: string)}
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class={cssClass}>
    <path fill="currentColor" opacity="0.25" d="M4 6h5.17l2 2H20v10H4z"/>
    <path fill="currentColor" d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2zM4 6h5.17l2 2H20v10H4V6z"/>
  </svg>
{/snippet}

<Sidebar.Root>
  <Sidebar.Header class="p-4 border-b border-white/[0.06] overflow-hidden">
    <div class="flex items-center gap-2.5 truncate">
      <svg class="h-7 w-7 shrink-0 text-emerald-500" viewBox="0 0 64 64" fill="none" aria-hidden="true">
        <path d="M14 8 H50 a6 6 0 0 1 6 6 V42 L42 56 H14 a6 6 0 0 1 -6 -6 V14 a6 6 0 0 1 6 -6 Z" fill="currentColor" fill-opacity="0.12" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/>
        <path d="M24 45 V21 L40 45 V21" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <span class="truncate font-bold text-[15px] tracking-tight text-white">Novent</span>
    </div>
  </Sidebar.Header>

  <!-- Game tabs -->
  {#if games.length > 0}
    <div class="flex border-b border-white/[0.06] shrink-0">
      {#each games as game}
        <button
          onclick={() => activeGame = game}
          title={formatGameFull(game)}
          class="
            flex-1 py-2.5 px-1 text-[11px] font-semibold tracking-wide uppercase truncate
            transition-colors border-b-2
            {activeGame === game
              ? 'border-emerald-400 text-white bg-emerald-500/[0.08]'
              : 'border-transparent text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.03]'}
          "
        >
          {formatGame(game)}
        </button>
      {/each}
    </div>
  {/if}

  <Sidebar.Content>
    {#if activeGame && groupedLaps[activeGame]}
      {@const tracks = groupedLaps[activeGame]}
      <Sidebar.Group>
        <Sidebar.GroupLabel class="text-xs uppercase tracking-widest text-muted-foreground mt-4 mb-2 px-2 truncate">
          Telemetry Database
        </Sidebar.GroupLabel>

        <Sidebar.Menu>
          {#each Object.entries(tracks) as [track, cars]}
            <Collapsible.Root class="group/track" open>
              <Sidebar.MenuItem>
                <Collapsible.Trigger>
                  {#snippet child({ props })}
                    <Sidebar.MenuButton {...props} class="text-zinc-300 hover:bg-zinc-800/50 w-full overflow-hidden px-2">
                      {@render googleFolder("w-3.5 h-3.5 mr-1 shrink-0")}
                      <span class="truncate flex-1 text-left">{formatName(track)}</span>
                      <ChevronRight class="w-3 h-3 shrink-0 transition-transform group-data-[state=open]/track:rotate-90" />
                    </Sidebar.MenuButton>
                  {/snippet}
                </Collapsible.Trigger>

                <Collapsible.Content>
                  <Sidebar.MenuSub class="ml-2 pl-2 pr-0 mr-0 border-l border-border/20">
                    {#each Object.entries(cars) as [car, sessions]}
                      <Collapsible.Root class="group/car" open>
                        <Sidebar.MenuItem>
                          <Collapsible.Trigger>
                            {#snippet child({ props })}
                              <Sidebar.MenuButton {...props} class="text-zinc-400 hover:bg-zinc-800/50 w-full overflow-hidden px-1.5">
                                {@render googleFolder("w-3.5 h-3.5 mr-1 shrink-0")}
                                <span class="truncate flex-1 text-left">{formatName(car)}</span>
                                <ChevronRight class="w-3 h-3 shrink-0 transition-transform group-data-[state=open]/car:rotate-90" />
                              </Sidebar.MenuButton>
                            {/snippet}
                          </Collapsible.Trigger>

                          <Collapsible.Content>
                            <Sidebar.MenuSub class="ml-1.5 pl-1.5 pr-0 mr-0 border-l border-border/20">
                              {#each Object.entries(sessions) as [date, sessionData]}
                                <Collapsible.Root class="group/session" open>
                                  <Sidebar.MenuItem>
                                    <Collapsible.Trigger>
                                      {#snippet child({ props })}
                                        <Sidebar.MenuButton {...props} class="text-zinc-400 hover:bg-zinc-800/50 w-full overflow-hidden px-1">
                                          <Calendar class="w-3 h-3 mr-1 shrink-0 text-zinc-400/80" />
                                          <span class="font-medium text-[11px] truncate flex-1 text-left">
                                            {date} <span class="opacity-60">({sessionData.laps.length})</span>
                                          </span>
                                          <ChevronRight class="w-3 h-3 shrink-0 transition-transform group-data-[state=open]/session:rotate-90" />
                                        </Sidebar.MenuButton>
                                      {/snippet}
                                    </Collapsible.Trigger>

                                    <Collapsible.Content>
                                      <Sidebar.MenuSub class="ml-0.5 pl-1 pr-0 mr-0 border-l border-border/20">
                                        {#each sessionData.laps as lap, index}
                                          {@const isPrimary  = selectedLap?.uuid === lap.uuid}
                                          {@const isComp     = compLapIds.includes(lap.uuid)}
                                          {@const color      = isComp ? compColor(lap.uuid) : null}

                                          <Sidebar.MenuItem>
                                            <!-- Outer row: lap button + action icon -->
                                            <div class="group/lap flex items-center w-full">
                                              <Sidebar.MenuButton
                                                isActive={isPrimary}
                                                onclick={() => onSelectLap?.(lap)}
                                                class="flex-1 h-auto py-1 my-0.5 overflow-hidden px-1 rounded-sm transition-colors
                                                       data-[active=true]:bg-emerald-500/10 data-[active=true]:text-white
                                                       data-[active=true]:ring-1 data-[active=true]:ring-emerald-500/25
                                                       hover:bg-white/[0.04] min-w-0"
                                              >
                                                <div class="flex items-center justify-between w-full min-w-0 gap-1">
                                                  <div class="flex items-center gap-1.5 truncate min-w-0">
                                                    <!-- Colour dot for comp laps -->
                                                    {#if isComp && color}
                                                      <span
                                                        class="shrink-0 w-1.5 h-1.5 rounded-full"
                                                        style="background:{color}"
                                                      ></span>
                                                    {:else if isPrimary}
                                                      <span class="shrink-0 w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                                                    {:else}
                                                      <span class="shrink-0 w-1.5 h-1.5"></span>
                                                    {/if}
                                                    <span class="text-zinc-500 text-[10px] font-mono shrink-0">L{index + 1}:</span>
                                                    <span class="text-[11px] font-mono truncate {sessionData.fastestId === lap.uuid ? 'font-bold text-emerald-400' : 'text-zinc-300'}">
                                                      {lap.lap_time || lap.time}
                                                    </span>
                                                  </div>
                                                  {#if sessionData.fastestId === lap.uuid}
                                                    <Trophy class="w-2 h-2 text-emerald-400 shrink-0" />
                                                  {/if}
                                                </div>
                                              </Sidebar.MenuButton>

                                              <!-- Compare / remove button — visible on hover or when active -->
                                              {#if !isPrimary}
                                                {#if isComp}
                                                  <button
                                                    onclick={() => onRemoveComp?.(lap.uuid)}
                                                    class="shrink-0 opacity-0 group-hover/lap:opacity-100 transition-opacity
                                                           w-6 h-6 flex items-center justify-center rounded
                                                           text-zinc-500 hover:text-red-400 hover:bg-zinc-800"
                                                    title="Remove from comparison"
                                                    aria-label="Remove from comparison"
                                                  >
                                                    <X class="w-3 h-3" />
                                                  </button>
                                                {:else if canAddComp}
                                                  <button
                                                    onclick={() => onAddComp?.(lap)}
                                                    class="shrink-0 opacity-0 group-hover/lap:opacity-100 transition-opacity
                                                           w-6 h-6 flex items-center justify-center rounded
                                                           text-zinc-500 hover:text-amber-400 hover:bg-zinc-800"
                                                    title="Add to comparison"
                                                    aria-label="Add to comparison"
                                                  >
                                                    <GitCompareArrows class="w-3 h-3" />
                                                  </button>
                                                {/if}
                                              {/if}
                                            </div>
                                          </Sidebar.MenuItem>
                                        {/each}
                                      </Sidebar.MenuSub>
                                    </Collapsible.Content>
                                  </Sidebar.MenuItem>
                                </Collapsible.Root>
                              {/each}
                            </Sidebar.MenuSub>
                          </Collapsible.Content>
                        </Sidebar.MenuItem>
                      </Collapsible.Root>
                    {/each}
                  </Sidebar.MenuSub>
                </Collapsible.Content>
              </Sidebar.MenuItem>
            </Collapsible.Root>
          {/each}
        </Sidebar.Menu>
      </Sidebar.Group>
    {:else}
      <div class="flex flex-col items-center justify-center h-40 gap-2 text-zinc-600">
        <span class="text-xs uppercase tracking-widest">No data</span>
      </div>
    {/if}
  </Sidebar.Content>
  <Sidebar.Rail />
</Sidebar.Root>