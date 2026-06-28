<script lang="ts">
	import { gameLabel } from '$lib/utils/format.js';
	import { saveConfig } from '$lib/api.js';

	interface Props {
		gamePaths: Record<string, string>;
		appZoom:   number;
		onClose:   () => void;
	}

	let { gamePaths = $bindable(), appZoom = $bindable(), onClose }: Props = $props();

	const ZOOM_STEP = 0.1;
	const ZOOM_MIN  = 0.5;
	const ZOOM_MAX  = 2.0;

	const PLACEHOLDERS: Record<string, string> = {
		AC:      'C:/Program Files (x86)/Steam/steamapps/common/assettocorsa/acs.exe',
		ACC:     'C:/Program Files (x86)/Steam/steamapps/common/Assetto Corsa Competizione/AC2.exe',
		LMU:     'C:/Program Files (x86)/Steam/steamapps/common/Le Mans Ultimate/Le Mans Ultimate.exe',
		iRacing: 'C:/Users/username/Documents/iRacing/iRacingSim64DX11.exe',
	};

	let saveStatus = $state<'saved' | 'error' | null>(null);

	async function save() {
		const ok = await saveConfig(gamePaths);
		saveStatus = ok ? 'saved' : 'error';
		setTimeout(() => saveStatus = null, 2000);
	}

	function adjustZoom(delta: number) {
		appZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round((appZoom + delta) * 10) / 10));
	}
</script>

<div class="settings">
	<header class="settings-header">
		<div class="settings-title">
			<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
				<circle cx="8" cy="8" r="2.5"/>
				<path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.1 3.1l1.4 1.4M11.5 11.5l1.4 1.4M3.1 12.9l1.4-1.4M11.5 4.5l1.4-1.4"/>
			</svg>
			Settings
		</div>
		<button class="close-btn" onclick={onClose} aria-label="Close settings">
			<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
				<path d="M4 4l8 8M12 4l-8 8"/>
			</svg>
		</button>
	</header>

	<div class="settings-body">
		<section>
			<h2>Game detection</h2>
			<p>Point each entry to the game's executable so Novent can detect when it's running and capture telemetry automatically.</p>

			<div class="game-list">
				{#each Object.keys(gamePaths) as key}
					<div class="game-entry">
						<div class="game-entry-header">
							<span class="game-tag">{key}</span>
							<span class="game-name">{gameLabel(key)}</span>
							<span class="game-status" class:configured={!!gamePaths[key]}>
								{gamePaths[key] ? 'Configured' : 'Not set'}
							</span>
						</div>
						<div class="path-input-wrap">
							<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
								<path d="M2 4.5A1.5 1.5 0 0 1 3.5 3H7l2 2h3.5A1.5 1.5 0 0 1 14 6.5V12a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 12V4.5z"/>
							</svg>
							<input
								type="text"
								bind:value={gamePaths[key]}
								placeholder={PLACEHOLDERS[key] ?? 'Path to game executable (.exe)'}
							/>
						</div>
					</div>
				{/each}
			</div>

			<div class="save-row">
				<button class="save-btn" onclick={save}>
					<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
						<path d="M3 3h8l2 2v8H3V3zM6 3v4h4V3M5 13v-4h6v4"/>
					</svg>
					Save changes
				</button>
				{#if saveStatus}
					<span class="save-status" class:ok={saveStatus === 'saved'} class:err={saveStatus === 'error'}>
						{saveStatus === 'saved' ? 'Saved' : 'Failed to save'}
					</span>
				{/if}
			</div>
		</section>

		<section>
			<h2>Display</h2>
			<p>Scale the entire interface. You can also press Ctrl&nbsp;+ / Ctrl&nbsp;− while focused, or Ctrl&nbsp;0 to reset.</p>

			<div class="zoom-row">
				<div class="zoom-label">
					<span>Interface zoom</span>
					<span class="zoom-pct">{Math.round(appZoom * 100)}% scale</span>
				</div>
				<div class="zoom-controls">
					<button onclick={() => adjustZoom(-ZOOM_STEP)}>−</button>
					<span>{Math.round(appZoom * 100)}%</span>
					<button onclick={() => adjustZoom(ZOOM_STEP)}>+</button>
					<button class="reset-btn" onclick={() => appZoom = 1}>Reset</button>
				</div>
			</div>
		</section>
	</div>
</div>

<style>
	.settings {
		position: absolute;
		inset: 0;
		z-index: 40;
		background: #08090b;
		display: flex;
		flex-direction: column;
	}

	.settings-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		height: 44px;
		padding: 0 16px;
		border-bottom: 1px solid rgba(255,255,255,0.06);
		background: rgba(12,13,16,0.8);
		backdrop-filter: blur(8px);
		flex-shrink: 0;
	}

	.settings-title {
		display: flex;
		align-items: center;
		gap: 7px;
		font-size: 11px;
		font-family: var(--font-mono);
		text-transform: uppercase;
		letter-spacing: 0.12em;
		color: rgba(255,255,255,0.5);
	}

	.settings-title svg {
		width: 14px;
		height: 14px;
	}

	.close-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border-radius: 4px;
		background: none;
		border: none;
		cursor: pointer;
		color: rgba(255,255,255,0.35);
		transition: color 0.15s, background 0.15s;
	}

	.close-btn:hover {
		color: #fff;
		background: rgba(255,255,255,0.06);
	}

	.close-btn svg {
		width: 14px;
		height: 14px;
	}

	.settings-body {
		flex: 1;
		overflow-y: auto;
		padding: 32px 24px;
		display: flex;
		flex-direction: column;
		gap: 40px;
	}

	section {
		max-width: 640px;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	h2 {
		font-size: 14px;
		font-weight: 600;
		letter-spacing: -0.01em;
		color: #fff;
		margin: 0;
	}

	p {
		font-size: 12px;
		color: rgba(255,255,255,0.4);
		line-height: 1.6;
		margin: 0;
		max-width: 56ch;
	}

	.game-list {
		display: flex;
		flex-direction: column;
		border-radius: 6px;
		background: rgba(255,255,255,0.02);
		box-shadow: inset 0 0 0 1px rgba(255,255,255,0.06);
		overflow: hidden;
	}

	.game-entry {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 14px 16px;
		border-bottom: 1px solid rgba(255,255,255,0.04);
	}

	.game-entry:last-child {
		border-bottom: none;
	}

	.game-entry-header {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.game-tag {
		font-size: 10px;
		font-family: var(--font-mono);
		font-weight: 600;
		color: #6ee7b7;
		background: rgba(16,185,129,0.10);
		box-shadow: inset 0 0 0 1px rgba(16,185,129,0.20);
		border-radius: 3px;
		padding: 1px 6px;
	}

	.game-name {
		font-size: 12px;
		font-weight: 500;
		color: rgba(255,255,255,0.8);
	}

	.game-status {
		margin-left: auto;
		font-size: 9px;
		font-family: var(--font-mono);
		text-transform: uppercase;
		letter-spacing: 0.10em;
		color: rgba(255,255,255,0.2);
	}

	.game-status.configured {
		color: #10b981;
	}

	.path-input-wrap {
		position: relative;
		display: flex;
		align-items: center;
	}

	.path-input-wrap svg {
		position: absolute;
		left: 9px;
		width: 13px;
		height: 13px;
		color: rgba(255,255,255,0.2);
		pointer-events: none;
	}

	.path-input-wrap input {
		width: 100%;
		background: rgba(0,0,0,0.30);
		border: 1px solid rgba(255,255,255,0.08);
		border-radius: 5px;
		padding: 7px 10px 7px 28px;
		font-size: 11px;
		font-family: var(--font-mono);
		color: rgba(255,255,255,0.75);
		outline: none;
		transition: border-color 0.15s, box-shadow 0.15s;
	}

	.path-input-wrap input::placeholder {
		color: rgba(255,255,255,0.18);
	}

	.path-input-wrap input:focus {
		border-color: rgba(16,185,129,0.45);
		box-shadow: 0 0 0 3px rgba(16,185,129,0.10);
	}

	.save-row {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.save-btn {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 7px 14px;
		border-radius: 5px;
		background: #10b981;
		border: none;
		cursor: pointer;
		font-size: 11px;
		font-family: var(--font-mono);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: #000;
		transition: background 0.15s, transform 0.1s;
	}

	.save-btn:hover  { background: #34d399; }
	.save-btn:active { transform: scale(0.98); }

	.save-btn svg {
		width: 13px;
		height: 13px;
	}

	.save-status {
		font-size: 11px;
		font-family: var(--font-mono);
	}

	.save-status.ok  { color: #10b981; }
	.save-status.err { color: #ef4444; }

	.zoom-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		padding: 14px 16px;
		border-radius: 6px;
		background: rgba(255,255,255,0.02);
		box-shadow: inset 0 0 0 1px rgba(255,255,255,0.06);
	}

	.zoom-label {
		display: flex;
		flex-direction: column;
		gap: 3px;
	}

	.zoom-label span:first-child {
		font-size: 12px;
		font-weight: 500;
		color: rgba(255,255,255,0.8);
	}

	.zoom-pct {
		font-size: 9px;
		font-family: var(--font-mono);
		text-transform: uppercase;
		letter-spacing: 0.10em;
		color: rgba(255,255,255,0.25);
	}

	.zoom-controls {
		display: flex;
		align-items: center;
		gap: 2px;
		background: rgba(255,255,255,0.03);
		box-shadow: inset 0 0 0 1px rgba(255,255,255,0.06);
		border-radius: 5px;
		padding: 3px;
	}

	.zoom-controls button {
		width: 28px;
		height: 28px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 3px;
		background: none;
		border: none;
		cursor: pointer;
		font-size: 14px;
		color: rgba(255,255,255,0.4);
		transition: color 0.12s, background 0.12s;
	}

	.zoom-controls button:hover {
		color: #fff;
		background: rgba(255,255,255,0.06);
	}

	.zoom-controls span {
		font-size: 11px;
		font-family: var(--font-mono);
		color: rgba(255,255,255,0.6);
		width: 40px;
		text-align: center;
		font-variant-numeric: tabular-nums;
	}

	.reset-btn {
		margin-left: 4px;
		padding: 0 8px !important;
		width: auto !important;
		font-size: 10px !important;
		font-family: var(--font-mono);
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}
</style>