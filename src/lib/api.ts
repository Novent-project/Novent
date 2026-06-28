const BASE = 'http://127.0.0.1:8000';

export interface Lap {
	uuid:     string;
	game:     string;
	track:    string;
	car:      string;
	lap_time: string;
	time?:    string;
	date_time?: string;
}

export interface Telemetry {
	gas:                    number[];
	brake:                  number[];
	steering:               number[];
	normalizedCarPosition:  number[];
	worldX:                 number[];
	worldZ:                 number[];
	time:                   number[];
}

export interface TrackBoundaries {
	inner: { x: number; z: number }[];
	outer: { x: number; z: number }[];
}

export interface BackendStatus {
	connected: boolean;
	game:      string | null;
}

export interface GameConfig {
	games: Record<string, string>;
}

export async function fetchLaps(): Promise<Lap[]> {
	const res = await fetch(`${BASE}/laps`);
	if (!res.ok) throw new Error('Failed to fetch laps');
	return res.json();
}

export async function fetchTelemetry(uuid: string): Promise<Telemetry> {
	const res = await fetch(`${BASE}/laps/${uuid}/telemetry`);
	if (!res.ok) throw new Error('Failed to fetch telemetry');
	return res.json();
}

export async function fetchBoundaries(
	simId: string,
	trackId: string,
	uuid: string
): Promise<TrackBoundaries | null> {
	try {
		const res = await fetch(
			`${BASE}/boundaries/${encodeURIComponent(simId)}/${encodeURIComponent(trackId)}/${encodeURIComponent(uuid)}`
		);
		return res.ok ? res.json() : null;
	} catch {
		return null;
	}
}

export async function fetchStatus(): Promise<BackendStatus> {
	const res = await fetch(`${BASE}/status`);
	if (!res.ok) throw new Error('Failed to fetch status');
	return res.json();
}

export async function fetchConfig(): Promise<GameConfig> {
	const res = await fetch(`${BASE}/config`);
	if (!res.ok) throw new Error('Failed to fetch config');
	return res.json();
}

export async function saveConfig(games: Record<string, string>): Promise<boolean> {
	const res = await fetch(`${BASE}/config/games`, {
		method:  'POST',
		headers: { 'Content-Type': 'application/json' },
		body:    JSON.stringify({ games }),
	});
	return res.ok;
}
