import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { supabase } from '$lib/supabaseClient';

// Supabase の無料プランは 7 日間アクセスが無いとプロジェクトが自動停止する。
// Vercel Cron (vercel.json) から毎日呼び出して DB にアクセスし、停止を防ぐ。
export const GET: RequestHandler = async ({ request }) => {
	// Vercel は CRON_SECRET が設定されていると Authorization: Bearer <CRON_SECRET> を付けて呼ぶ
	if (env.CRON_SECRET && request.headers.get('authorization') !== `Bearer ${env.CRON_SECRET}`) {
		return json({ error: 'unauthorized' }, { status: 401 });
	}

	const { error } = await supabase.from('Classes').select('id').limit(1);
	if (error) {
		console.error('Keepalive query failed:', error);
		return json({ ok: false, error: error.message }, { status: 500 });
	}
	return json({ ok: true, at: new Date().toISOString() });
};
