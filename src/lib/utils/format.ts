const GAME_LABELS: Record<string, string> = {
	AC:      'Assetto Corsa',
	ACC:     'Assetto Corsa Competizione',
	iRacing: 'iRacing',
	LMU:     'Le Mans Ultimate',
};

const GAME_SHORT: Record<string, string> = {
	AC:      'AC',
	ACC:     'ACC',
	iRacing: 'iRacing',
	LMU:     'LMU',
};

const NAME_OVERRIDES: Record<string, string> = {
	ks_porsche_919_hybrid: 'Porsche 919 Hybrid',
	ks_red_bull_ring:      'Red Bull Ring',
	ks_nurburgring:        'Nürburgring',
	imola:                 'Imola Circuit',
	spa:                   'Circuit de Spa-Francorchamps',
};

export function gameLabel(key: string): string {
	return GAME_LABELS[key] ?? key;
}

export function gameShort(key: string): string {
	return GAME_SHORT[key] ?? key;
}

export function formatName(raw: string): string {
	if (!raw) return 'Unknown';
	const lower = raw.toLowerCase();
	if (NAME_OVERRIDES[lower]) return NAME_OVERRIDES[lower];
	return raw
		.replace(/^(ks_|acu_|rt_)/i, '')
		.split('_')
		.map(w => w.charAt(0).toUpperCase() + w.slice(1))
		.join(' ');
}

export function parseLapTime(t: string | number): number {
	if (!t) return 0;
	if (typeof t === 'number') return t > 3600 ? t / 1000 : t;
	const s = String(t).trim();
	if (/^\d+$/.test(s)) return parseInt(s, 10) / 1000;
	if (/^\d+\.\d+$/.test(s)) {
		const v = parseFloat(s);
		return v > 3600 ? v / 1000 : v;
	}
	const m = s.match(/^(\d+):(\d+)[.:](\d+)$/);
	if (m) return parseInt(m[1]) * 60 + parseInt(m[2]) + parseInt(m[3]) / 1000;
	return parseFloat(s) || 0;
}

export function formatTime(s: number): string {
	const c = Math.max(0, s);
	const m = Math.floor(c / 60);
	return `${m}:${(c % 60).toFixed(2).padStart(5, '0')}`;
}
