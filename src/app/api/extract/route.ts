import { NextResponse } from "next/server";
import mammoth from "mammoth";

export const runtime = "nodejs";

/**
 * POST /api/extract — আপলোড করা .docx / .txt ফাইল থেকে টেক্সট বের করে
 * (client-এ mammoth bundle এড়াতে সার্ভারে এক্সট্র্যাক্ট করা হয়)
 */
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "কোনো ফাইল পাওয়া যায়নি।" }, { status: 400 });
    }

    const name = file.name.toLowerCase();

    if (name.endsWith(".txt") || name.endsWith(".csv")) {
      const text = await file.text();
      return NextResponse.json({ text });
    }

    if (name.endsWith(".docx")) {
      const buffer = Buffer.from(await file.arrayBuffer());
      const result = await mammoth.extractRawText({ buffer });
      return NextResponse.json({ text: result.value });
    }

    if (name.endsWith(".doc")) {
      return NextResponse.json(
        {
          error:
            "পুরনো .doc ফরম্যাট সরাসরি সাপোর্ট করে না। ফাইলটি Word-এ খুলে 'Save As' দিয়ে .docx করে আপলোড করুন, অথবা টেক্সট কপি করে পেস্ট করুন।",
        },
        { status: 415 }
      );
    }

    return NextResponse.json(
      { error: "সাপোর্টেড ফরম্যাট: .docx, .txt" },
      { status: 415 }
    );
  } catch (err) {
    console.error("extract error:", err);
    return NextResponse.json(
      { error: "ফাইল থেকে টেক্সট বের করা যায়নি। ফাইলটি ঠিক আছে কিনা দেখুন।" },
      { status: 500 }
    );
  }
}
