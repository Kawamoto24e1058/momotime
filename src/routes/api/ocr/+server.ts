import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { extractTimetableFromImage } from '$lib/gemini';
import { supabase } from '$lib/supabaseClient';

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		const { images, userId } = await request.json();

		if (!images || !Array.isArray(images) || !userId) {
			return json({ error: 'Missing required fields' }, { status: 400 });
		}

		// 1. Extract data from all images concurrently
		const results = await Promise.all(
			images.map(img => extractTimetableFromImage(img.image, img.mimeType))
		);

		// 2. Merge results with conflict resolution (later images overwrite)
		const mergedMap = new Map<string, any>();
		for (const extractedClasses of results) {
			for (const item of extractedClasses) {
				const slotKey = `${item.day_of_week}|${item.period}`;
				mergedMap.set(slotKey, item);
			}
		}
		const finalExtractedClasses = Array.from(mergedMap.values());

		// 3. Fetch current user classes to perform diff
		const { data: currentLinks, error: fetchError } = await supabase
			.from('User_Classes')
			.select(`
				id,
				class_id,
				Classes (name, day_of_week, period)
			`)
			.eq('user_id', userId);

		if (fetchError) throw fetchError;

		const currentMap = new Map();
		(currentLinks || []).forEach((link: any) => {
			const c = link.Classes;
			const key = `${c.name}|${c.day_of_week}|${c.period}`;
			currentMap.set(key, link);
		});

		const extractedKeys = new Set();
		const toAdd = [];

		for (const item of finalExtractedClasses) {
			const key = `${item.name}|${item.day_of_week}|${item.period}`;
			extractedKeys.add(key);

			if (!currentMap.has(key)) {
				toAdd.push(item);
			}
		}

		// 4. Remove classes that are no longer in the image(s)
		const toDelete = (currentLinks || []).filter((link: any) => {
			const c = link.Classes;
			const key = `${c.name}|${c.day_of_week}|${c.period}`;
			return !extractedKeys.has(key);
		});

		if (toDelete.length > 0) {
			await (supabase.from('User_Classes') as any)
				.delete()
				.in('id', toDelete.map(d => (d as any).id));
		}

		// 5. Add new classes
		for (const item of toAdd) {
			// Find or create the class
			const { data: classData } = await (supabase.from('Classes') as any)
				.select('id')
				.eq('name', item.name)
				.eq('day_of_week', item.day_of_week)
				.eq('period', item.period)
				.maybeSingle();

			let classId: string;

			if (classData) {
				classId = classData.id;
			} else {
				const { data: newClass, error: newClassError } = await (supabase.from('Classes') as any)
					.insert({
						name: item.name,
						teacher: item.teacher,
						room: item.room,
						day_of_week: item.day_of_week,
						period: item.period
					})
					.select()
					.single();

				if (newClassError) throw newClassError;
				classId = (newClass as any).id;
			}

			// Link to user
			await (supabase.from('User_Classes') as any).insert({
				user_id: userId,
				class_id: classId,
				color: getDynamicColor(item.day_of_week)
			});
		}

		return json({ 
			success: true, 
			added: toAdd.length, 
			removed: toDelete.length,
			total: finalExtractedClasses.length 
		});
	} catch (error: any) {
		console.error('OCR Error:', error);
		return json({ error: error.message }, { status: 500 });
	}
};

function getDynamicColor(day: number) {
	const colors = ['#fee2e2', '#fef3c7', '#dcfce7', '#dbeafe', '#f3e8ff', '#fae8ff'];
	return colors[day % colors.length];
}
