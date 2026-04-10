import { GoogleGenerativeAI } from '@google/generative-ai';
import { GEMINI_API_KEY } from '$env/static/private';

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

export async function extractTimetableFromImage(base64Image: string, mimeType: string) {
	const model = genAI.getGenerativeModel({ 
		model: 'gemini-2.5-flash-lite',
		generationConfig: { responseMimeType: 'application/json' }
	});

	const prompt = `
    あなたは桃山学院大学（桃大）の教務システム「WebClass」に精通したアシスタントです。
    アップロードされた時間割のスクリーンショットから、正確な情報をJSON形式で抽出してください。

    ### 思考プロセス (Chain of Thought):
    1. まず、画像全体のレイアウトを確認し、左端の「1限」「2限」...という時限のラベルを特定してください。
    2. 次に、上部の「月」「火」「水」「木」「金」「土」の各曜日カラムを識別してください。
    3. 各セル内の文字を読み取り、以下の情報を抽出してください。
    4. 授業名に学期や時限情報が含まれている場合（例：「経済原論 01＜春集＞(2026-春学期-月1-他)」）、純粋な授業名（例：「経済原論 01」）のみを抽出してください。
    5. 1つのセルに複数の授業が重なっている場合や、複数の曜日にまたがっている場合も、それぞれ個別の項目として分割してください。

    ### 抽出ルール:
    1. **授業名 (name)**: 余計な記号や学期情報を除いた純粋な名称。
    2. **教員名 (teacher)**: 記載がある場合は抽出、なければ null。
    3. **教室 (room)**: 記載がある場合は抽出、なければ null。
    4. **曜日 (day_of_week)**: 月=0, 火=1, 水=2, 木=3, 金=4, 土=5, 日=6
    5. **時限 (period)**: 1, 2, 3... という数値。

    ### 土曜日の扱い:
    - 土曜日の授業 (day_of_week: 5) を見逃さないでください。もし土曜日の欄があれば、必ず抽出してください。

    ### 出力形式:
    必ず以下のJSON配列のみを返してください。
    [
      {
        "name": "経済原論 01",
        "teacher": "桃山 太郎",
        "room": "1-201",
        "day_of_week": 0,
        "period": 1
      }
    ]
  `;

	const result = await model.generateContent([
		prompt,
		{
			inlineData: {
				data: base64Image,
				mimeType
			}
		}
	]);

	const response = await result.response;
	const text = response.text();
	
	try {
        // Clean the response in case Gemini adds markdown blocks
        const cleanedText = text.replace(/```json/g, '').replace(/```/g, '').trim();
		return JSON.parse(cleanedText);
	} catch (error) {
		console.error('Failed to parse Gemini response:', text);
		throw new Error('OCR結果の解析に失敗しました。');
	}
}
