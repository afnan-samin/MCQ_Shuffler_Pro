# Worklog

---
Task ID: 1
Agent: Main Agent (Super Z)
Task: MCQ Shuffler Pro — MCQ শাফল, সেট তৈরি, সিরিয়াল ডিটেক্ট ও Word এক্সপোর্ট টুল (Type 3: Interactive Web Development)

Work Log:
- fullstack-dev স্কিল লোড করে এনভায়রনমেন্ট ইনিশিয়ালাইজ করা হয়েছে (Next.js 16 + Tailwind 4 + shadcn/ui)
- `docx` (client-side .docx generation) ও `mammoth` (.docx import) প্যাকেজ ইনস্টল
- `src/lib/mcq/parser.ts` — MCQ পার্সার: বাংলা (০-৯) ও English (0-9) নম্বর ডিটেকশন, অপশন (ক/খ/গ/ঘ, a-d) ডিটেকশন, সিরিয়াল অ্যানালাইসিস (ভাঙা সিরিয়াল + কোথায় ভাঙা রিপোর্ট), অটো-ফিক্স রিনাম্বারিং (বাংলা সংখ্যা প্রিজার্ভ করে)
- `src/lib/mcq/set-engine.ts` — Fisher-Yates shuffle, ৩ ধরনের ডিস্ট্রিবিউশন (interleaved round-robin / chunk block / random), সেট নেমিং (সেট A/ক/১/Set 1)
- `src/lib/mcq/exporter.ts` — .docx (Packer.toBlob, pageBreakBefore দিয়ে প্রতি সেট আলাদা পেজে, প্রতি লাইনে স্ক্রিপ্ট অনুযায়ী ফন্ট: Bijoy=SutonnyMJ / Unicode=Nirmala UI), .doc (HTML ফলব্যাক), প্রিন্ট উইন্ডো, ক্লিপবোর্ড
- `src/app/api/extract/route.ts` — সার্ভার-সাইড ফাইল এক্সট্র্যাকশন (mammoth, .docx/.txt)
- `src/app/page.tsx` + 4টা UI কম্পোনেন্ট (input/detect/shuffle/sets-result) — ৪-ধাপের ওয়ার্কফ্লো, সিরিয়াল ঠিক না থাকলে শাফল বাটন লক (auto-detect gate), প্রশ্ন সিলেকশন (সব/রেঞ্জ/একক), localStorage অটো-সেভ
- layout.tsx-এ Noto Sans Bengali ফন্ট যোগ, globals.css-এ কাস্টম স্ক্রলবার
- ৩১টা ইউনিট টেস্ট পাস (scripts/test-mcq.ts) — ২০০০ প্রশ্ন ৮.৩ms এ পার্স
- Agent Browser দিয়ে E2E ভেরিফিকেশন: নমুনা→ডিটেক্ট→সিরিয়াল OK→শাফল→৪ সেট→রি-সিরিয়াল→.docx ডাউনলোড (পেজ ব্রেক+ফন্ট ভেরিফাইড)→.doc ডাউনলোড→কপি→ভাঙা সিরিয়াল ডিটেক্ট→অটো-ফিক্স→মোবাইল ভিউ — সব পাস, কোনো console error নেই

Stage Summary:
- ডেলিভারেবল: ফ্রি ওয়েব টুল (localhost:3000, preview link ব্যবহারযোগ্য) — MCQ paste/upload → auto serial detect → সিলেক্ট → ২-৫০ সেটে শাফল → প্রতি সেট আলাদা পেজে Word (.docx/.doc) এক্সপোর্ট, রি-সিরিয়াল টগল, Bijoy (SutonnyMJ) ও Unicode বাংলা ফন্ট সাপোর্ট
- সব প্রসেসিং client-side (প্রাইভেসি), ২০-২০০০ প্রশ্ন সাপোর্ট, 0 কস্ট
- টেস্ট কভারেজ: ৩১ ইউনিট টেস্ট + ফুল E2E ব্রাউজার ভেরিফিকেশন

---
Task ID: 2
Agent: Main Agent (Super Z)
Task: MCQ Shuffler Pro আপডেট — শব্দ-ধরে Bijoy/Unicode/English ডিটেক্টর + Original Shuffle মোড + Kalpurush ফন্ট + প্লেইন টেক্সট সিরিয়াল

Work Log:
- Kalpurush (woff2+ttf, fonts.maateen.me) ও SutonnyMJ (woff, noorshahbaj/add-bijoy-font-in-webpage রিপো) ওয়েব-ফন্ট ডাউনলোড করে public/fonts/-এ যোগ; globals.css-এ @font-face
- `src/lib/mcq/encoding.ts` (নতুন) — শব্দ-ধরে ক্লাসিফায়ার: unicode (U+0980–09FF), bijoy (strong মার্কার †‡Öµ½¾“”‗…, weak ×÷±§ + Latin, কনটেক্সট-ইনহেরিটেন্স), english (কমন-ওয়ার্ড লিস্ট + কনটেক্সট), neutral; analyzeText (২-পাস dominant ডিটেকশন), splitLineSegments (docx ফন্ট-রানের জন্য), lineDominantOf
- `set-engine.ts` — ৪র্থ ডিস্ট্রিবিউশন "original" (Original Shuffle): প্রতি সেটে সবগুলো প্রশ্ন, সিরিয়াল ক্রম সেটভেদে ইউনিক (অরিজিনাল ক্রম + আগের সেটের ক্রমের সাথে মিলবে না, retry-loop); isSetCountLimitedByPool হেল্পার
- `exporter.ts` — auto মোডে শব্দ-ধরে ফন্ট রান (Bijoy→SutonnyMJ, Unicode→unicodeFont, English→englishFont); englishFont নতুন অপশন (Times New Roman); .doc HTML-এও স্প্যান-ভিত্তিক ফন্ট; সিরিয়াল প্লেইন টেক্সট (numPr=0 ভেরিফাইড)
- `tok-text.tsx` (নতুন) — টোকেন-ভিত্তিক রেন্ডারার; DetectCard-এ "শব্দ ধরে ধরে ডিটেক্টর" সেকশন (মোট/Bijoy%/ইউনিকোড%/English% স্ট্যাট + রঙিন প্রিভিউ + লিজেন্ড); প্রশ্ন লিস্ট ও SetsResult প্রিভিউতেও SutonnyMJ ফন্ট প্রয়োগ
- ShuffleCard-এ ৪ নম্বর রেডিও "⭐ Original Shuffle — সব সেটে সব প্রশ্ন" (উদাহরণসহ: A: ১,২,৩,৪… / B: ৪,১,২,৫,৩…); original মোডে setCount≤pool ভ্যালিডেশন বাদ, shuffleWithin সুইচ লুকানো
- page.tsx — loadAndDetect (আপলোড/নমুনার পরে অটো-ডিটেক্ট), encData useMemo, InputCard-এ onFileLoaded প্রপ
- globals.css — body font-family Kalpurush (পুরো সাইট), .tok-bijoy (SutonnyMJ স্ট্যাক + সোনালি রঙ), .tok-unicode (সবুজ), .tok-english (নীল) + ডার্ক ভ্যারিয়েন্ট
- টেস্ট: test-mcq.ts-এ নতুন ১৪ নম্বর পর্যন্ত ৬১ টেস্ট পাস (Original Shuffle ইনভ্যারিয়েন্ট, এনকোডিং ক্লাসিফায়ার, ফন্ট-রান); scripts/verify-export.ts — docx XML ভেরিফাই: pageBreakBefore=sets−1, numPr=0, SutonnyMJ রান, প্রতি সেটে সব প্রশ্ন
- E2E (agent-browser): নমুনা→অটো-ডিটেক্ট→ডিটেক্টর স্ট্যাট (২০২ শব্দ: ৫৯% ইউনিকোড, ৩৬% English)→Bijoy টেক্সটে ৬২% Bijoy ডিটেক্ট→Original Shuffle ৩ সেট (প্রতিটিতে ১২ প্রশ্ন, ক্রম ভিন্ন — স্ক্রিনশটসহ)→.docx এক্সপোর্ট টোস্ট OK, কোনো console error নেই; body computed font = Kalpurush, .tok-bijoy = SutonnyMJ স্ট্যাক
- Turbopack CSS স্টেল-ক্যাশ সমস্যা পাওয়া গেছে — ফাইলে append করে রিকম্পাইল করায় সমাধান (body font-family রুল @layer base-এ)

Stage Summary:
- ইউজারের ৪টি নতুন চাহিদা পূরণ: ① আপলোডের পরেই শব্দ-ধরে Bijoy/Unicode/English ডিটেক্টর (রঙ + পরিসংখ্যান, Bijoy শব্দ SutonnyMJ ফন্টে দেখায় — PC-তে ফন্ট থাকলে সেটাই, নাহলে এমবেডেড ওয়েব-ফন্ট) ② Original Shuffle মোড — ১০০ প্রশ্ন × ৫ সেট = প্রতি সেটে ১০০টাই, সিরিয়াল ক্রম সেটভেদে ভিন্ন ③ আউটপুটে সিরিয়াল প্লেইন টেক্সট (নমPr=0 প্রমাণিত), প্রতি সেট আলাদা পেজ/সেগমেন্টে ④ পুরো ওয়েবসাইট Kalpurush ফন্ট
- Word এক্সপোর্ট এখন মিক্সড ফাইলেও শব্দ ধরে ফন্ট বসায় (Bijoy→SutonnyMJ, ইউনিকোড→Nirmala UI/Kalpurush, English→Times) — ইউজার চাইলে বদলানো যায়
- মোট টেস্ট: ৬১ ইউনিট + ৭ এক্সপোর্ট-XML + ব্রাউজার E2E — সব পাস, 0 কস্ট, সব প্রসেসিং client-side

---
Task ID: 3
Agent: Main Agent (Super Z)
Task: আসল Bijoy .docx ফাইল সাপোর্ট — XML-preserving pipeline (tab/equation/sub/sup হুবহু), serial replace (click toggle + ২ ডাউনলোড), মোবাইল পলিশ

Work Log:
- ইউজারের আসল ফাইল (HSC'27 Physics, ৬০ প্রশ্ন, ৬ সেকশন) inspect: pure Bijoy (SutonnyMJ ×৯৯১), ৩০ OMML equation, ৪৭৩ run-tab, ৩৯ vertAlign, ০ Unicode; সিরিয়াল ডুপ্লিকেট/লাফানো (32..40,5,19,13,13,2,...); অপশন "K. L. M. N." + উত্তর "Dt K" bold
- jszip + jsdom ইনস্টল; আসল ফাইল public/sample/hsc27-physics-bijoy.docx হিসেবে বান্ডেল (নমুনা বাটন + E2E)
- `src/lib/mcq/docx-xml.ts` (নতুন কোর) — docx-এর word/document.xml সরাসরি: extractParaText (w:t/w:tab/w:sym/oMath-linear, pPr স্কিপ), প্রশ্ন-ব্লক বিল্ডার (serial + tab টিয়ার-১ / অপশন-লেড টিয়ার-২ / ডেসিমাল-গার্ড টিয়ার-৩), সেকশন-সেপারেটর (PHYSICS, A), সিরিয়াল ডিটেক্ট en/bn/Bijoy-ডিজিট («ˆµ∏Ï¾˜Ùœø), অপশন+উত্তর স্ক্যান (K/L/M/N ফ্যামিলি + Dt), Unicode-স্ক্যান, renumberSerialPara (মাল্টি-রান সিরিয়াল "3"+"2." ক্রস-রান রিপ্লেস, সেপারেটর/ট্যাব অক্ষত)
- `src/lib/mcq/docx-exporter.ts` (নতুন) — buildShuffledXml: অরিজিনাল XML-এর ব্লক cloneNode করে সেট-প্রতি সাজায়, position-based renumber (প্রথম=১), "Set A/B/C" ASCII হেডার, পেজ-ব্রেক প্যারা, sectPr শেষে; downloadShuffledDocx (JSZip রাউন্ডট্রিপ) + downloadSerialFixedDocx (অরিজিনাল অর্ডারে ১..N)
- set-engine buildSets এখন generic (DocxQuestion-ও চলে)
- UI: `docx-detect-card.tsx` (স্ট্যাট/ডিটেক্টর/সিরিয়াল-রিপোর্ট/Unicode-warning/প্রশ্ন-লিস্ট, সিরিয়াল SutonnyMJ ওয়েবফন্টে ৩২→৩২ লুক), `docx-sets-result.tsx` (সেট ফ্র্যাগমেন্ট, সিরিয়াল-এ ক্লিক করলেই renumber ON/OFF টগল, ২ ডাউনলোড: রিনাম্বারড + আসল-নম্বরসহ), input-card-এ .docx client-side রাউট + নমুনা Bijoy .docx বাটন, page.tsx-এ docx/text মোড রাউটিং (docx মোডে সিরিয়াল gate নেই — renumber অটো ঠিক করে)
- মোবাইল ফিক্স: shuffle-card-এর ৪টা রেডিও লেবেল flex-col (আগে চাপা লাগছিল)
- টেস্ট: scripts/test-docx.ts — ৪৩ টেস্ট আসল ফাইলে পাস (৬০ প্রশ্ন, ডুপ্লিকেট সিরিয়াল, রিনাম্বার মাল্টি-রান, এক্সপোর্টে tab ৪৭৩×২ / oMath ৩০×২ / vertAlign ৩৯×২ অক্ষত, আউটপুটে ০ Unicode, ZIP রাউন্ডট্রিপ); পুরনো ৬১ + verify-export ৭ টেস্টও পাস; lint ক্লিন (পুরনো verify-export-এর require ফিক্স)
- E2E (agent-browser, মোবাইল 390×844 + ডেস্কটপ): নমুনা Bijoy .docx→৬০ প্রশ্ন ডিটেক্ট (১৬৮৯ শব্দ: ৮২% Bijoy, ০% Unicode)→Original Shuffle ৩ সেট×৬০→সিরিয়াল-এ ক্লিক টগল (১,২,৩ ↔ ৩৮,৪০,১৯…)→৩টাই ডাউনলোড সফল; ডাউনলোড হওয়া আসল ফাইল python দিয়ে যাচাই: Set A/B/C, সিরিয়াল ১..৬০/সেট, tab-স্ট্রাকচার+রান হুবহু, ০ Unicode; console/page error শূন্য

Stage Summary:
- মূল আর্কিটেকচার বদল: mammoth-টেক্সট-রিজেনারেশন → সরাসরি docx XML manipulation — তাই আপলোড করা ফাইলের tab, ইকুয়েশন (OMML), sub/superscript, সিম্বল, ছবি, SutonnyMJ ফন্ট-রান হুবহু অক্ষত থাকে; আউটপুটে নতুন Unicode ঢোকে না (নতুন সিরিয়ালও ফাইলের নিজের ডিজিট-স্টাইলে)
- ইউজারের চাহিদা পূরণ: উদাহরণের tab-ফরম্যাট ডাউনলোডে অটল, serial replace = পজিশন-ভিত্তিক ১,২,৩… (ক্লিক টগল + রিনাম্বারড/আসল-নম্বর দুই ডাউনলোড), সিরিয়াল-ফিক্স .docx (Start), মোবাইল-ফার্স্ট UI
- সব টেস্ট: ৪৩ (docx) + ৬১ (টেক্সট) + ৭ (এক্সপোর্ট) পাস, E2E ব্রাউজার-ভেরিফাইড, ০ কস্ট, client-side
