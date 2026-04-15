import { GoogleGenerativeAI } from '@google/generative-ai';
import { GEMINI_API_KEY } from '$env/static/private';

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

export async function extractTimetableFromImages(images: { image: string, mimeType: string }[], modelName = 'gemini-3-flash') {
	const model = genAI.getGenerativeModel({ 
		model: modelName,
		generationConfig: { responseMimeType: 'application/json' }
	});

	const prompt = `
    添付された複数の画像から、時間割データを統合して抽出してください。
    あなたは桃山学院大学の学生向け時間割アプリで利用される、データ抽出の専門アシスタントです。
    ユーザーから送信される複数の画像（学内ポータル「M-Port」の時間割画面のスクリーンショット）を解析し、以下の厳格なルールに従って授業データを抽出してください。

    【絶対厳守のルール（ハルシネーションの防止）】
    1. 捏造の禁止: 画像内に明記されている文字のみを忠実に抽出してください。AIによる文脈からの推測や、架空の教授名・授業名の補完は絶対にしないでください。
    2. 情報の欠落時の対応: 画像が不鮮明で見えない部分や、該当する情報が存在しない項目は、無理に推測せず「空文字("")」または「null」を出力してください。
    3. 重複の統合: ユーザーは画面に収まりきらない時間割をスクロールして複数枚撮影しています。複数の画像間で「同じ曜日・同じ時限」の同一授業データが重複して読み取れた場合は、それらを統合し、一意のデータとして出力してください。
    4. 遠隔授業のフラグ: 授業名や備考に「※遠隔授業（同時双方向型）」「※遠隔授業（オンデマンド型）」などの記載が含まれている場合のみ、isRemoteを true にしてください。記載がない場合は false にしてください。
    5. 余計なテキストの排除: 挨拶や説明、「抽出しました」などのテキストは一切不要です。純粋なJSON配列のみを返してください。
    6. 文脈の保持: ユーザーはスマホの縦長画面をスクロールして複数枚撮影しています。画像が切り替わっても、直前に表示されていた『曜日』のヘッダーを強く意識し、決して他の曜日と混同しないでください。
    7. 厳格なマッピング: 各授業のブロック内に記載されている情報だけでなく、そのブロックが『どの曜日』の『何限』の区画に属しているかを、画面全体のレイアウトから慎重に逆算して特定してください。
    8. 情報のクリーニング（重要）: 科目名の中に含まれる「<春>」や「<通期>」などの学期情報、および「(2026-春学期-月1-他)」のようなシステム上の不要な文字列は完全に削除し、純粋な『科目名』のみを抽出してください。
    9. 【重要：見切れた曜日の逆算推論】: M-Portのモバイル画面は、上から下へ『月→火→水→木→金→土』の順番で縦に曜日ブロックが並んでいます。ユーザーのスクロールにより、特定の曜日ヘッダー（例：『木』）が画面外に見切れており、いきなり授業データから始まっている画像が送られてくることがあります。その場合、絶対に曜日を勘違いせず、画像内のさらに下部にある曜日のヘッダー（例：『金』や『土』）を探してください。そして、『金曜日のブロックの直上にあるのだから、見切れているこのブロックは木曜日である』というように、前後の配置順から逆算して曜日を正確に特定してください。

    【出力スキーマ（JSON）】
    以下の構造を持つJSON配列として出力してください。
    [
      {
        "day": "月",
        "period": 1,
        "name": "経済原論 01",
        "professor": "金江 亮",
        "isRemote": false
      }
    ]
  `;

	const imageParts = images.map(img => ({
		inlineData: {
			data: img.image,
			mimeType: img.mimeType
		}
	}));

	const result = await model.generateContent([
		prompt,
		...imageParts
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
