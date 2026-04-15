import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { extractTimetableFromImages } from '$lib/gemini';
import { supabase } from '$lib/supabaseClient';

export const config = {
	runtime: 'edge'
};

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		const { images, userId } = await request.json();

		if (!images || !Array.isArray(images) || !userId) {
			return json({ error: 'Missing required fields' }, { status: 400 });
		}

		// 1. Extract data with fallback logic
		let extractedClasses;
		try {
			// Primary: Gemini 3 Flash Preview
			extractedClasses = await extractTimetableFromImages(images, 'gemini-3-flash-preview');
			console.log("✅ OCR success using primary model (gemini-3-flash-preview)");
		} catch (primaryError) {
			console.warn("⚠️ Primary model (gemini-3-flash-preview) failed, attempting fallback to gemini-3.1-flash-lite-preview...");
			try {
				// Fallback: Gemini 3.1 Flash Lite Preview
				extractedClasses = await extractTimetableFromImages(images, 'gemini-3.1-flash-lite-preview');
				console.log("✅ OCR success using fallback model (gemini-3.1-flash-lite-preview)");
			} catch (fallbackError) {
				console.error("🚨 All Gemini models failed:", fallbackError);
				return json({ 
					error: '現在AIサーバーが非常に混み合っています。少し時間をおいてから再度お試しください。' 
				}, { status: 503 });
			}
		}

		// 2. Map results to frontend expected structure
		const dayMap: Record<string, number> = { '月': 0, '火': 1, '水': 2, '木': 3, '金': 4, '土': 5, '日': 6 };
		const finalExtractedClasses = extractedClasses.map((item: any) => {
			const dayIdx = dayMap[item.day] ?? 0;
			return {
				name: item.name,
				teacher: item.professor || null,
				room: null,
				day_of_week: dayIdx,
				period: item.period,
				is_remote: item.isRemote || false,
				color: getDynamicColor(dayIdx),
				isPending: true // Flag for frontend
			};
		});

		return json({ 
			success: true, 
			classes: finalExtractedClasses
		});
	} catch (error: any) {
		console.error("🚨 OCR API Error:", error);
		return json({ error: error.message }, { status: 500 });
	}
};

function getDynamicColor(day: number) {
	const colors = ['#fee2e2', '#fef3c7', '#dcfce7', '#dbeafe', '#f3e8ff', '#fae8ff'];
	return colors[day % colors.length];
}
