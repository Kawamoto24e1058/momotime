import { GoogleGenerativeAI, SchemaType, type Part, type ResponseSchema } from '@google/generative-ai';
import { GEMINI_API_KEY } from '$env/static/private';
import { env } from '$env/dynamic/private';

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// プレビュー版モデルは予告なく廃止されるので、上から順に試す。
// Vercel の環境変数 GEMINI_MODELS (カンマ区切り) でコード変更なしに差し替え可能。
export const GEMINI_MODELS = (env.GEMINI_MODELS || 'gemini-3-flash-preview,gemini-3.5-flash,gemini-3.1-flash-lite')
	.split(',')
	.map((m) => m.trim())
	.filter(Boolean);

export type TimetableInput = {
	files?: { data: string; mimeType: string }[];
	text?: string;
};

export type ExtractedClass = {
	day: string;
	period: number;
	name: string;
	professor: string | null;
	room: string | null;
	isRemote: boolean;
};

const responseSchema: ResponseSchema = {
	type: SchemaType.ARRAY,
	items: {
		type: SchemaType.OBJECT,
		properties: {
			day: { type: SchemaType.STRING, enum: ['月', '火', '水', '木', '金', '土'], format: 'enum' },
			period: { type: SchemaType.INTEGER },
			name: { type: SchemaType.STRING },
			professor: { type: SchemaType.STRING, nullable: true },
			room: { type: SchemaType.STRING, nullable: true },
			isRemote: { type: SchemaType.BOOLEAN }
		},
		required: ['day', 'period', 'name', 'isRemote']
	}
};

const PROMPT = `
あなたは桃山学院大学の学生向け時間割アプリのデータ抽出アシスタントです。
入力は学内ポータル「M-Port」の時間割画面（スクリーンショット画像・PDF・またはコピーしたテキスト）です。
時間割に登録されている授業を抽出して JSON 配列で返してください。

【ルール】
1. 捏造禁止: 入力に書かれている文字だけを使うこと。読めない・存在しない項目は null にする。
2. 重複統合: スクロールして複数枚撮影されているため、同じ曜日・同じ時限の同一授業は 1 件にまとめる。
3. 曜日の特定: M-Port のスマホ画面は上から「月→火→水→木→金→土」の順に曜日ブロックが縦に並ぶ。
   画像の先頭で曜日ヘッダーが見切れている場合は、画像内の次の曜日ヘッダーから逆算する（例: 直下が「金」なら見切れているのは「木」）。
   PC 版の表形式の場合は列見出しの曜日・行見出しの時限を使う。
4. 時限: 「1限」「1時限」「月1」などの数字を period に入れる。
5. 科目名のクリーニング: 「<春>」「<通期>」「(2026-春学期-月1-他)」のような学期・システム用の文字列は削除し、純粋な科目名だけにする。クラス番号（例: "01"）は残す。
6. 教員名は professor、教室（例: "1-201", "聖アンデレ館 3F"）が書かれていれば room に入れる。
7. 「遠隔授業」「オンデマンド」「同時双方向」の記載がある場合のみ isRemote を true にする。
8. 授業が無いコマ（空欄・「-」）は出力しない。
`;

function buildParts(input: TimetableInput): (string | Part)[] {
	const parts: (string | Part)[] = [PROMPT];
	if (input.text) {
		parts.push(`【M-Port からコピーしたテキスト】\n${input.text}`);
	}
	for (const f of input.files ?? []) {
		parts.push({ inlineData: { data: f.data, mimeType: f.mimeType } });
	}
	return parts;
}

// Vercel の maxDuration (60 秒) 内に全モデルの試行を収める
const TOTAL_DEADLINE_MS = 55_000;
const PER_MODEL_TIMEOUT_MS = 35_000;

async function extractWithModel(input: TimetableInput, modelName: string, timeout: number): Promise<ExtractedClass[]> {
	const model = genAI.getGenerativeModel(
		{
			model: modelName,
			generationConfig: {
				responseMimeType: 'application/json',
				responseSchema,
				temperature: 0
			}
		},
		{ timeout }
	);

	const result = await model.generateContent(buildParts(input));
	const text = result.response.text();

	try {
		const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
		const parsed = JSON.parse(cleaned);
		if (!Array.isArray(parsed)) throw new Error('not an array');
		return parsed;
	} catch {
		console.error(`[${modelName}] Failed to parse Gemini response:`, text.slice(0, 500));
		throw new Error('AIの応答を解析できませんでした');
	}
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * GEMINI_MODELS を順番に試し、最初に成功した結果を返す。
 * Gemini は混雑時に 503 を頻繁に返すので、全モデル失敗したら少し待ってもう一巡する。
 */
export async function extractTimetable(input: TimetableInput): Promise<{ classes: ExtractedClass[]; model: string }> {
	const deadline = Date.now() + TOTAL_DEADLINE_MS;
	let lastError: unknown;
	for (let round = 0; round < 2; round++) {
		if (round > 0) await sleep(1500);
		for (const modelName of GEMINI_MODELS) {
			const remaining = deadline - Date.now();
			if (remaining < 5_000) throw lastError ?? new Error('timeout');
			try {
				const classes = await extractWithModel(input, modelName, Math.min(PER_MODEL_TIMEOUT_MS, remaining));
				console.log(`✅ OCR success using ${modelName} (${classes.length} classes)`);
				return { classes, model: modelName };
			} catch (err: any) {
				console.warn(`⚠️ ${modelName} failed: ${err?.status ?? ''} ${err?.message ?? err}`);
				lastError = err;
				// 画像が不正など、リトライしても直らないエラーは即終了
				if (err?.status === 400) throw err;
			}
		}
	}
	throw lastError;
}
