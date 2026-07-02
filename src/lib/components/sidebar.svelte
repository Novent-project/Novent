<script lang="ts">
	import { formatName } from '$lib/utils/format.js';
	import type { Lap } from '$lib/api.js';

	interface SessionData {
		laps:      Lap[];
		fastestId: string | null;
		minTime:   number;
	}

	type GroupedLaps = Record<string, Record<string, Record<string, Record<string, SessionData>>>>;

	interface Props {
		groupedLaps:  GroupedLaps;
		activeGame:   string | null;
		selectedLap:  Lap | null;
		compLapIds:   string[];
		canAddComp:   boolean;
		collapsed:    boolean;
		onSelectLap:  (lap: Lap) => void;
		onAddComp:    (lap: Lap) => void;
		onRemoveComp: (uuid: string) => void;
		onToggle:     () => void;
	}

	let {
		groupedLaps,
		activeGame   = $bindable(null),
		selectedLap,
		compLapIds,
		canAddComp,
		collapsed,
		onSelectLap,
		onAddComp,
		onRemoveComp,
		onToggle,
	}: Props = $props();

	const LAP_COLORS = ['#ffffff', '#f59e0b', '#3b82f6'] as const;

	const games = $derived(Object.keys(groupedLaps));

	$effect(() => {
		if ((!activeGame || !games.includes(activeGame)) && games.length > 0) {
			activeGame = games[0];
		}
	});

	function compColor(uuid: string): string | null {
		const i = compLapIds.indexOf(uuid);
		return i >= 0 ? LAP_COLORS[i + 1] : null;
	}

	let openTracks = $state<Record<string, boolean>>({});
	let openCars   = $state<Record<string, boolean>>({});
	let openDates  = $state<Record<string, boolean>>({});

	function toggle(store: Record<string, boolean>, key: string) {
		store[key] = !(store[key] ?? true);
	}
</script>

<aside class="sidebar" class:collapsed>
	<div class="sidebar-header">
		{#if !collapsed}
			<svg class="logo" viewBox="0 0 64 64" fill="none" aria-hidden="true">
				<path d="M14 8 H50 a6 6 0 0 1 6 6 V42 L42 56 H14 a6 6 0 0 1 -6 -6 V14 a6 6 0 0 1 6 -6 Z"
					fill="currentColor" fill-opacity="0.12" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/>
				<path transform="translate(16 23.2) scale(0.2)"
					d="M0,88 L30,88 L46,44 L64,44 L80,88 L110,88 L126,44 L144,44 L160,0 L130,0 L114,44 L96,44 L80,0 L50,0 L34,44 L16,44 Z"
					fill="currentColor"/>
			</svg>
			<span class="logo-name">Novent</span>
		{/if}
		<button class="icon-btn" onclick={onToggle} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
			<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
				{#if collapsed}
					<path d="M6 3l5 5-5 5"/>
				{:else}
					<path d="M10 3L5 8l5 5"/>
				{/if}
			</svg>
		</button>
	</div>

	{#if !collapsed}
		<div class="sidebar-content">
			{#if activeGame && groupedLaps[activeGame]}
				{@const tracks = groupedLaps[activeGame]}
				<p class="section-label">Telemetry Database</p>

				{#each Object.entries(tracks) as [track, cars]}
					{@const trackOpen = openTracks[track] ?? true}
					<div class="tree-node">
						<button class="tree-row track-row" onclick={() => toggle(openTracks, track)}>
							<svg class="folder-icon" viewBox="0 0 24 24">
								<path fill="currentColor" opacity="0.2" d="M4 6h5.17l2 2H20v10H4z"/>
								<path fill="currentColor" d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2zM4 6h5.17l2 2H20v10H4V6z"/>
							</svg>
							<span class="tree-label">{formatName(track)}</span>
							<svg class="chevron" class:open={trackOpen} viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
								<path d="M6 4l4 4-4 4"/>
							</svg>
						</button>

						{#if trackOpen}
							{#each Object.entries(cars) as [car, sessions]}
								{@const carKey = `${track}__${car}`}
								{@const carOpen = openCars[carKey] ?? true}
								<div class="tree-indent">
									<button class="tree-row car-row" onclick={() => toggle(openCars, carKey)}>
										<svg class="folder-icon" viewBox="0 0 24 24">
											<path fill="currentColor" opacity="0.2" d="M4 6h5.17l2 2H20v10H4z"/>
											<path fill="currentColor" d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2zM4 6h5.17l2 2H20v10H4V6z"/>
										</svg>
										<span class="tree-label">{formatName(car)}</span>
										<svg class="chevron" class:open={carOpen} viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
											<path d="M6 4l4 4-4 4"/>
										</svg>
									</button>

									{#if carOpen}
										{#each Object.entries(sessions) as [date, session]}
											{@const dateKey = `${carKey}__${date}`}
											{@const dateOpen = openDates[dateKey] ?? true}
											<div class="tree-indent">
												<button class="tree-row date-row" onclick={() => toggle(openDates, dateKey)}>
													<svg class="date-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
														<rect x="2" y="3" width="12" height="11" rx="1.5"/>
														<path d="M5 1v4M11 1v4M2 7h12"/>
													</svg>
													<span class="tree-label">{date}</span>
													<span class="lap-count">({session.laps.length})</span>
													<svg class="chevron" class:open={dateOpen} viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
														<path d="M6 4l4 4-4 4"/>
													</svg>
												</button>

												{#if dateOpen}
													<div class="tree-indent">
														{#each session.laps as lap, i}
															{@const isPrimary = selectedLap?.uuid === lap.uuid}
															{@const color     = compColor(lap.uuid)}
															{@const isComp    = color !== null}
															{@const isFastest = session.fastestId === lap.uuid}

															<div class="lap-row-wrap">
																<button
																	class="lap-btn"
																	class:active={isPrimary}
																	onclick={() => onSelectLap(lap)}
																>
																	{#if isPrimary}
																		<span class="dot" style="background:#10b981"></span>
																	{:else if isComp}
																		<span class="dot" style="background:{color}"></span>
																	{:else}
																		<span class="dot invisible"></span>
																	{/if}
																	<span class="lap-num">L{i + 1}:</span>
																	<span class="lap-time" class:fastest={isFastest}>
																		{lap.lap_time || lap.time}
																	</span>
																	{#if isFastest}
																		<svg class="trophy" viewBox="0 0 16 16" fill="currentColor">
																			<path d="M3 2h10v5a5 5 0 0 1-10 0V2zM1 3h2v2H1V3zM13 3h2v2h-2V3zM6 12v2H5v1h6v-1H9v-2"/>
																		</svg>
																	{/if}
																</button>

																{#if !isPrimary}
																	{#if isComp}
																		<button
																			class="lap-action remove"
																			onclick={() => onRemoveComp(lap.uuid)}
																			title="Remove comparison"
																		>
																			<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
																				<path d="M4 4l8 8M12 4l-8 8"/>
																			</svg>
																		</button>
																	{:else if canAddComp}
																		<button
																			class="lap-action add"
																			onclick={() => onAddComp(lap)}
																			title="Add to comparison"
																		>
																			<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
																				<path d="M3 8h10M8 3v10"/>
																				<circle cx="5" cy="8" r="1" fill="currentColor" stroke="none"/>
																				<circle cx="11" cy="8" r="1" fill="currentColor" stroke="none"/>
																			</svg>
																		</button>
																	{/if}
																{/if}
															</div>
														{/each}
													</div>
												{/if}
											</div>
										{/each}
									{/if}
								</div>
							{/each}
						{/if}
					</div>
				{/each}
			{:else}
				<div class="empty">
					<span>No data</span>
				</div>
			{/if}
		</div>
	{/if}
</aside>

<style>
	.sidebar {
		display: flex;
		flex-direction: column;
		width: 260px;
		height: 100%;
		background: #0b0c0e;
		border-right: 1px solid rgba(255,255,255,0.06);
		flex-shrink: 0;
		overflow: hidden;
		transition: width 0.2s ease;
	}

	.sidebar.collapsed {
		width: 44px;
	}

	.sidebar-header {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 12px 10px;
		border-bottom: 1px solid rgba(255,255,255,0.06);
		flex-shrink: 0;
	}

	.logo {
		width: 26px;
		height: 26px;
		color: #10b981;
		flex-shrink: 0;
	}

	.logo-name {
		font-size: 14px;
		font-weight: 700;
		letter-spacing: -0.02em;
		color: #fff;
		flex: 1;
		white-space: nowrap;
		overflow: hidden;
	}

	.icon-btn {
		width: 24px;
		height: 24px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 4px;
		color: rgba(255,255,255,0.3);
		background: none;
		border: none;
		cursor: pointer;
		flex-shrink: 0;
		transition: color 0.15s, background 0.15s;
	}

	.icon-btn:hover {
		color: #fff;
		background: rgba(255,255,255,0.06);
	}

	.icon-btn svg {
		width: 14px;
		height: 14px;
	}


	.sidebar-content {
		flex: 1;
		overflow-y: auto;
		padding: 8px 4px;
	}

	.section-label {
		font-size: 9px;
		font-family: var(--font-mono);
		text-transform: uppercase;
		letter-spacing: 0.14em;
		color: rgba(255,255,255,0.25);
		padding: 8px 8px 6px;
		margin: 0;
	}

	.tree-node {
		display: flex;
		flex-direction: column;
	}

	.tree-indent {
		padding-left: 10px;
		border-left: 1px solid rgba(255,255,255,0.06);
		margin-left: 10px;
	}

	.tree-row {
		display: flex;
		align-items: center;
		gap: 5px;
		width: 100%;
		padding: 4px 6px;
		border-radius: 4px;
		background: none;
		border: none;
		cursor: pointer;
		color: rgba(255,255,255,0.55);
		text-align: left;
		transition: background 0.12s, color 0.12s;
	}

	.tree-row:hover {
		background: rgba(255,255,255,0.04);
		color: rgba(255,255,255,0.85);
	}

	.folder-icon {
		width: 13px;
		height: 13px;
		flex-shrink: 0;
		color: rgba(255,255,255,0.35);
	}

	.date-icon {
		width: 11px;
		height: 11px;
		flex-shrink: 0;
	}

	.tree-label {
		font-size: 11px;
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.lap-count {
		font-size: 10px;
		color: rgba(255,255,255,0.25);
		flex-shrink: 0;
	}

	.chevron {
		width: 10px;
		height: 10px;
		flex-shrink: 0;
		color: rgba(255,255,255,0.2);
		transform: rotate(0deg);
		transition: transform 0.15s;
	}

	.chevron.open {
		transform: rotate(90deg);
	}

	.lap-row-wrap {
		display: flex;
		align-items: center;
		border-radius: 4px;
		transition: background 0.12s;
	}

	.lap-row-wrap:hover {
		background: rgba(255,255,255,0.03);
	}

	.lap-btn {
		display: flex;
		align-items: center;
		gap: 5px;
		flex: 1;
		padding: 4px 6px;
		border-radius: 4px;
		background: none;
		border: none;
		cursor: pointer;
		text-align: left;
		min-width: 0;
		transition: background 0.12s;
	}

	.lap-btn.active {
		background: rgba(16,185,129,0.10);
		box-shadow: inset 0 0 0 1px rgba(16,185,129,0.20);
	}

	.dot {
		width: 6px;
		height: 6px;
		border-radius: 9999px;
		flex-shrink: 0;
	}

	.dot.invisible {
		background: transparent;
	}

	.lap-num {
		font-size: 10px;
		font-family: var(--font-mono);
		color: rgba(255,255,255,0.25);
		flex-shrink: 0;
	}

	.lap-time {
		font-size: 11px;
		font-family: var(--font-mono);
		color: rgba(255,255,255,0.75);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.lap-time.fastest {
		color: #10b981;
		font-weight: 700;
	}

	.trophy {
		width: 9px;
		height: 9px;
		color: #10b981;
		flex-shrink: 0;
	}

	.lap-action {
		width: 24px;
		height: 24px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 4px;
		background: none;
		border: none;
		cursor: pointer;
		opacity: 0;
		flex-shrink: 0;
		transition: opacity 0.12s, color 0.12s, background 0.12s;
	}

	.lap-row-wrap:hover .lap-action {
		opacity: 1;
	}

	.lap-action svg {
		width: 11px;
		height: 11px;
	}

	.lap-action.add {
		color: rgba(255,255,255,0.3);
	}

	.lap-action.add:hover {
		color: #f59e0b;
		background: rgba(245,158,11,0.10);
	}

	.lap-action.remove {
		color: rgba(255,255,255,0.3);
	}

	.lap-action.remove:hover {
		color: #ef4444;
		background: rgba(239,68,68,0.10);
	}

	.empty {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100px;
		font-size: 10px;
		font-family: var(--font-mono);
		text-transform: uppercase;
		letter-spacing: 0.12em;
		color: rgba(255,255,255,0.15);
	}
</style>