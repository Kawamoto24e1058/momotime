import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { Config } from '@sveltejs/adapter-vercel';
import { extractTimetable, type TimetableInput } from '$lib/gemini';
import { supabase } from '$lib/supabaseClient';

// Edge ランタイムは 25 秒以内に応答を始めないとタイムアウトし、
// 画像が多いと Gemini の処理が間に合わず失敗していたため Node.js + 60 秒に変更。
export const config: Config = {
	runtime: 'nodejs22.x',
	maxDuration: 60
};

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'];
const MAX_FILES = 8;
const MAX_TEXT_LENGTH = 30000;

export const POST: RequestHandler = async ({ request }) => {
	// ログイン中のユーザーだけが使えるようにする（API キーの無断利用対策）
	const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
	if (!token) {
		return json({ error: 'ログインが必要です。再ログインしてください。' }, { status: 401 });
	}
	const { data: authData, error: authError } = await supabase.auth.getUser(token);
	if (authError || !authData.user) {
		return json({ error: 'ログインの有効期限が切れています。再ログインしてください。' }, { status: 401 });
	}

	let body: any;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'リクエストが大きすぎるか、形式が不正です。画像の枚数を減らしてください。' }, { status: 400 });
	}

	const input: TimetableInput = {};
	if (Array.isArray(body.files) && body.files.length > 0) {
		if (body.files.length > MAX_FILES) {
			return json({ error: `一度に送れるのは${MAX_FILES}枚までです。` }, { status: 400 });
		}
		for (const f of body.files) {
			if (typeof f?.data !== 'string' || !ALLOWED_MIME.includes(f?.mimeType)) {
				return json({ error: '対応していないファイル形式です（画像またはPDFのみ）。' }, { status: 400 });
			}
		}
		input.files = body.files;
	}
	if (typeof body.text === 'string' && body.text.trim()) {
		input.text = body.text.trim().slice(0, MAX_TEXT_LENGTH);
	}
	if (!input.files && !input.text) {
		return json({ error: '画像またはテキストを送信してください。' }, { status: 400 });
	}

	let extracted;
	try {
		extracted = await extractTimetable(input);
	} catch (error: any) {
		console.error('🚨 All Gemini models failed:', error);
		const status = error?.status;
		const message =
			status === 429
				? 'AIの利用上限に達しました。しばらく時間をおいてから再度お試しください。'
				: status === 400
					? '画像を読み込めませんでした。別のスクリーンショットでお試しください。'
					: 'AIサーバーが混み合っています。少し時間をおいてから再度お試しください。';
		return json({ error: message }, { status: 503 });
	}

	// 検証・正規化して、同じコマの重複を除去する
	const dayMap: Record<string, number> = { 月: 0, 火: 1, 水: 2, 木: 3, 金: 4, 土: 5 };
	const seen = new Set<string>();
	const classes = [];
	for (const item of extracted.classes) {
		const day = dayMap[String(item.day ?? '').trim().charAt(0)];
		const period = Number(item.period);
		const name = String(item.name ?? '').trim();
		if (day === undefined || !Number.isInteger(period) || period < 1 || period > 6 || !name) continue;

		const key = `${day}-${period}`;
		if (seen.has(key)) continue;
		seen.add(key);

		classes.push({
			name,
			teacher: item.professor?.trim() || null,
			room: item.room?.trim() || null,
			day_of_week: day,
			period,
			is_remote: Boolean(item.isRemote),
			color: getDynamicColor(day),
			isPending: true
		});
	}

	return json({ success: true, classes, model: extracted.model });
};

function getDynamicColor(day: number) {
	const colors = ['#fee2e2', '#fef3c7', '#dcfce7', '#dbeafe', '#f3e8ff', '#fae8ff'];
	return colors[day % colors.length];
}
