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

---
Task ID: 10
Agent: main
Task: Verify if MS Word paragraph shading (Home > Paragraph > Shading) is detectable programmatically in the real Agri MCQ docx

Work Log:
- Created scripts/inspect-agri-shading.py (zipfile + lxml: w:pPr/w:shd, w:rPr/w:shd, w:highlight, w:tcPr/w:shd, themeFill, styles.xml)
- Ran on upload/Agri MCQ Botany 997 mcq - Copy - type serial.docx
- Listed all shaded paragraph texts to map color->role

Stage Summary:
- Paragraph shading IS reliably detectable: w:pPr/w:shd @w:fill hex color
- File shading map: D0CECE (light gray) = 9 chapter headers (Aa¨vq-1..7, incl. 2 empty shaded separator paras at 1121/1195; note 'Aa¨vq 7' has NO hyphen - text matching would miss it, color catches it); 000000 (black) = exactly 126 Type headers (Type-1 x43, Type-2 x51, Type-3 x25, Type-4 x7)
- Questions/options/answers: zero shading; no run-level/highlight/table shading anywhere; styles.xml has none
- Design impact: shading color becomes the PRIMARY header detector (text patterns = fallback for unshaded files). Black-shaded para = serial restart point; gray-shaded = chapter boundary. Fully compatible with planned docx->docx surgical serial-fix pipeline (same XML we edit).

---
Task ID: 11
Agent: main
Task: রঙ-ভিত্তিক নেস্টিং-সচেতন সিরিয়াল সিস্টেম (color palette A1–J7, user's B1/A2/A5/A6 design)

Work Log:
- ইউজারের palette docx ডিকোড: 10×7 গ্রিড (A1–J7, ৭০ রঙ) → scripts/inspect-palette.py; সিদ্ধান্ত: ফিক্সড ৩-রঙ ম্যাপিং বাদ — যেকোনো প্যালেট/কাস্টম রঙ যেকোনো লেভেলে, রঙের ক্রম থেকে nesting অটো-ইনফার
- docx-xml.ts: SEP_CLASS-এ "|" যোগ (SutonnyMJ-এ pipe=দাড়ি "৪৪।" রেন্ডার করে — এতে ২৪১টা pipe-সিরিয়াল প্রশ্ন ডিটেক্ট হয়: ৩৮৩→৪৩৫); serialMatchSpans + replaceSpans (এক-পাস মাল্টি-স্প্যান — ডিজিট-দৈর্ঘ্য বদলালেও সেপ offset ঠিক); renumberSerialParaTo(p, n, sep=".") নরমালাইজিং রিনাম্বার; looksOptionLed/countRunTabs/isQuestionStart এক্সপোর্ট
- color-serial.ts (নতুন কোর): PALETTE_ROWS A1–J7 + paletteCodeOf/paletteHexOf; paraShadingKey (w:pPr/w:shd @fill, সাদা/auto বাদ, themeFill fallback কী); analyzeColorDocx (প্যারা-প্রতি রঙ+প্রশ্ন-শুরু, রঙ-সারাংশ); planSerialByColor — স্ট্যাক অ্যালগরিদম (same color=ভাই সেকশন pop&push, নতুন রঙ=গভীরতম সন্তান, X-হেডারে কাউন্টার ০, X স্ট্যাকে না থাকলে নম্বর বন্ধ — "অভিভাবক সীমানায় থেমে যাওয়া", গভীর রঙ X-নম্বর ভাঙে না); continuous স্কিম; applyColorSerialXml (শুধু প্ল্যানের প্যারা রিনাম্বার, বাকি XML হুবহু); downloadColorSerialDocx (JSZip রাউন্ডট্রিপ)
- color-serial-card.tsx (নতুন UI): রঙ-চিপ (সোয়াচ+প্যালেট কোড+সেকশন সংখ্যা), "পুরো ফাইলে একটানা" চিপ, নেস্টিং ব্যাখ্যা, সিরিয়াল-ডাউনলোড বাটন
- page.tsx: colorAnalysis useMemo, colorMode-এ ShuffleCard+DocxSetsResult লুকানো (ইউজারের সিদ্ধান্ত: স্ট্রাকচার্ড ফাইলে শাফল বন্ধ), আপলোড-টোস্ট, handleColorSerial
- টেস্ট: scripts/test-color-serial.ts — ৫৩/৫৩ পাস (ইউজারের B1/A2/A5/A6 হুবহু নেস্টিং উদাহরণ: A6-প্ল্যানে F/G=১,২ নতুন A5-এ থেমে J/L=১; A5-প্ল্যানে A6-প্রশ্ন অন্তর্ভুক্ত; A2-প্ল্যানে A5/A6 ভাঙে না; B1/একটানা ১..N; pipe→dot; বাংলা ডিজিট ৪৪|→৭.; মাল্টি-রান; ডেসিমাল-গার্ড; আসল ফাইল: B1×126+কাস্টম×৯, ৪৩৫ প্রশ্ন, ১২২ প্রশ্ন-যুক্ত Type-সেকশন সব ১..n, idempotent) + পুরনো ৪৩+৬১ টেস্ট অক্ষত
- E2E আসল ফাইল: scripts/e2e-color-agri.ts → download/Agri MCQ Botany (color serial - B1).docx; python যাচাই: ১৭৫৪ প্যারা অপরিবর্তিত, math ২৯→২৯, image1.png+ফন্ট অক্ষত, নন-প্রশ্ন লাইন ০ পরিবর্তন, প্রশ্ন-বডি সিরিয়ালের পরে ০ পরিবর্তন, pipe শূন্য, ১২২ সেকশন সব ১..n; LibreOffice PDF ২৭ পৃষ্ঠা ✓
- ব্রাউজার E2E (agent-browser): আসল ফাইল আপলোড → রঙ-কার্ড (B1 ১২৬/কাস্টম ৯/একটানা ৪৩৫) → B1 সিলেক্ট → ডাউনলোড → সফল টোস্ট; console/page error শূন্য

Stage Summary:
- নতুন ফিচার: রঙ-স্ট্রাকচার্ড .docx আপলোড হলে শাফল অটো-বন্ধ; ফাইলের রঙগুলো চিপ আকারে দেখায়; ইউজার রঙ বাছলে প্রতিটা ওই-রঙ-সেকশনের প্রশ্ন ১ থেকে নম্বর পায় (নেস্টিং-সচেতন — অভিভাবক রঙের সীমানায় ক্রম থেমে যায়, দুই জায়গার প্রশ্ন কখনো মেশে না); সেপারেটর সব "1." ডট-স্টাইলে নরমালাইজ; math/ছবি/ফন্ট/হেডার হুবহু অক্ষত (docx→docx)
- ডেলিভারেবল স্যাম্পল: download/Agri MCQ Botany (color serial - B1).docx (৪৩৫ প্রশ্ন, ১২৬ Type-সেকশনে ১ থেকে)
- সব প্রসেসিং client-side, ০ কস্ট

---
Task ID: 12
Agent: main
Task: Chemistry ফাইলে রঙ-সিরিয়াল ২টা বাগ ফিক্স — (১) B1 সিলেক্টে "নম্বর দেওয়ার মতো প্রশ্ন পাওয়া যায়নি" টোস্ট (plan=0), (২) ডাউনলোড করা .docx Word-এ করাপ্ট

Work Log:
- রোগনির্ণয়: upload/Final Chemistry 1st paper only varsity Question (1-5).docx — 16.5MB document.xml, ৯২৫২ প্যারা (টেবিলহীন), রঙ: A3(D9D9D9)×২৫৭ varsity, A4(BFBFBF)×২৭ Type, B1(000000)×৪ অধ্যায়-২..৫, B6(0D0D0D)×১ অধ্যায়-১; সিরিয়াল zero-padded "01." স্টাইল + রান-ট্যাব
- বাগ-১-এর কারণ: অধ্যায়ের রঙ ফাইলজুড়ে বদলায় (অধ্যায়-১=B6, অধ্যায়-২..৫=B1) — স্ট্যাকে আগের অধ্যায়ের স্টেল A4/A3 পুঁজে থাকায় নতুন অধ্যায়ের প্রথম Type হেডার lastIndexOf-পপে B1-সেকশন মেরে ফেলত → inX=false → plan=0
- বাগ-১ ফিক্স (planSerialByColor): X-প্রোটেকশন — C রি-অ্যারাইভ করে pop করতে গেলে যদি স্ট্যাকে C-এর ওপরে খোলা X-এন্ট্রি থাকে এবং C-এর সেকশন-সংখ্যা ≥ ২×X-এর সংখ্যা (ঘনত্ব=নিচু লেভেল অনুমান: Type×২৭ অধ্যায়×৪-এর ভিতরে), তবে X ধরে রেখে stack.length=xAt+1; নাহলে পুরনো ভাই-রিস্টার্ট। ১৫টা কেস-বিশ্লেষণে যাচাইকৃত (user-example/Agri/সিনথেটিক সব অপরিবর্তিত)
- বাগ-২-এর কারণ: 16.5MB XML-এ DOMParser ×২-৩ (parseDocxXml + analyzeColorDocx + applyColorSerialXml) + XMLSerializer — মেমোরি-চাপে আউটপুট ভাঙা (bun-এ নিশ্চিত: ২য় parse-এই OOM SIGKILL)
- বাগ-২ ফিক্স: color-serial.ts সম্পূর্ণ string-level রিরাইট — scanBodyChildren (depth-স্ক্যানার, self-closing w:p সহ), analyzeColorDocx (regex w:t/m:t + <w:tab/> + pPr>shd), applyColorSerialXml (para-range splice — বাকি বাইট byte-identical, ডিজিট-স্প্যান entity-safe র-ম্যাপিং, replaceDecodedSpan DOM-সেমান্টিক্স); DOMParser/XMLSerializer কালার-পাইপলাইনে আর নেই
- page.tsx: রঙ-ফাইলে parseDocxXml স্কিপ (DocxState.parse nullable, DocxDetectCard শুধু parse থাকলে) — রঙ-মোডে DOM পার্স শূন্য
- docx-xml.ts: serialMatchSpans এক্সপোর্ট; renumberSerialParaTo-তে জিরো-প্যাডিং সংরক্ষণ ("01." স্টাইলের ফাইলে ১→"01.")
- ডাউনলোড বিল্ডার: fresh JSZip-এ নন-dir এন্ট্রি কপি (JSZip-এর "word/" dir-entry ও remove()-এর রিকার্সিভ আচরণ এড়াতে; প্রথম চেষ্টায় remove() পুরো word/ মেরে 3KB ফাইল বানিয়েছিল — ধরা পড়ে ঠিক)
- টেস্ট: test-color-serial.ts এখন ৬৩/৬৩ (+১০ নতুন: Chemistry রিগ্রেশন B1/A3/A4/continuous, জিরো-প্যাডিং); test-docx ৪৩/৪৩, test-mcq ৬১/৬১; tsc src-ক্লিন
- E2E: scripts/e2e-color-chem.ts — B1 প্ল্যান ২৩৭১ (হুবহু ২৪৯৪−১২৩ অধ্যায়-১), ৪ রিসেট-পয়েন্ট সব "01.", A3=২৪৯৪/২৫৭ সেকশন, continuous=২৪৯৪; python lxml কঠোর পার্স + serial-only diff (২০৯৬ পরিবর্তিত, অনাকাংক্ষিত ০) + zip ইন্টিগ্রিটি + নন-document এন্ট্রি byte-identical; LibreOffice → ১৫৮ পৃষ্ঠা PDF, পেজ-ইমেজে math/isotope/varsity-হেডার অক্ষত
- ব্রাউজার E2E: scripts/e2e-browser-chem.ts — আপলোড→টোস্ট→৪ চিপ→B1→ডাউনলোড→সাফল্য-টোস্ট, error-টোস্ট নেই, JS-error শূন্য
- নোট: continuous মোডে ১০০০+ নন-ট্যাব সিরিয়াল tier-3 (num≤999) গার্ডে re-detect হয় না — ডাউনলোড-ফাইল সঠিক, শুধু re-upload-এ প্রভাব; e2e চেক fixpoint-ভিত্তিক

Stage Summary:
- দুটোই ফিক্সড ও যাচাইকৃত: B1 (এবং যেকোনো রঙ) সিলেক্টে ২৩৭১ প্রশ্ন ১-থেকে নম্বর পায়; ডাউনলোড Word/LibreOffice-উদ্দেশ্যে কঠোরভাবে বৈধ
- আর্কিটেকচার আপগ্রেড: কালার-পাইপলাইন এখন পুরো string-level — বড় ফাইলে মেমোরি-নিরাপদ (analyze ১৫৩ms, apply ১৪৮ms @16.5MB)
- ডেলিভারেবল: download/Chemistry (color serial - B1).docx (+A3/B6/continuous ভ্যারিয়েন্ট)

---
Task ID: 13-integrity
Agent: integrity-battery agent
Task: ZIP/XML/LibreOffice integrity battery on 5 user-downloaded Chemistry color-serial outputs

Work Log:
- Read worklog (tasks 1-3, 10-12) for context; verified env: python3.12 + lxml 6.0.2, soffice + pdfinfo present; file sizes: original 979,799 B, outputs 931,726-933,836 B
- Wrote scripts/integrity-battery.py (read-only, zero writes): per output file — (a) zipfile.testzip() + full per-member decompress/CRC + dup-name check, (b) entry-set diff vs original + uncompressed size & CRC-32 compare of every shared entry except word/document.xml, (c) strict lxml parse (recover=False) of word/document.xml with line/col + approx byte offset on failure, (d) strict parse of [Content_Types].xml + word/_rels/document.xml.rels, (e) <?xml decl + </w:document> tail + <w:p open/self-close/close tag counts + balance + top-level <w:p> count (lxml direct body children; depth-aware byte-scanner fallback), (f) <m:oMath lookahead-count vs original, (g) w:t-concat plain text of top-level paras 518/532/536/932/2120/7787 in output + orig-same-idx context
- Battery result 5/5 PASS: 0 bad CRC, 0 unreadable members, 0 duplicate names; no missing/extra FILE entries (outputs add 8 harmless dir-entries: _rels/, customXml/, customXml/_rels/, docProps/, word/, word/_rels/, word/media/, word/theme/); all shared non-document entries byte-identical (fontTable/settings/styles/numbering/theme1/media image1-10 untouched); document.xml strict-parse OK ×5 (16,549,700-16,554,805 B); Content_Types + rels parse OK ×5; 9252 top-level paras in every file == original; oMath=891 in every file == original
- LibreOffice smoke test (HOME=/tmp/lohome, isolated -env:UserInstallation, headless → PDF): 5/5 exit 0; pdfinfo pages: B1=158, A4=158, A3=153, B6=158, continuous=158
- Extra read-only forensics: B6 and continuous are content-identical archives — all 36 entries have identical CRC/size/flags, document.xml md5 both c54078fa277a7cd35a7cb6ee7f5b4bc7, only ZIP timestamps differ (08:09:32 vs 08:09:36, two separate downloads); whole-file md5 differs only due to those timestamps. Para-level text diff vs original: B1=2096, A4=517, A3=2215, B6=continuous=2447 changed paras. B6/continuous first change at para[169] orig '01.'→'42.' (Type-02 restart renumbered continuously), para[521] '12.'→'136.' — B6's open section scope is never closed by later B1 chapter headers (treated as children), so B6 renumber == file-wide continuous
- Suspicious paras identified: 518/532/536/932/2120 are OMML-only nuclear-chemistry equation paras (w:t empty/near-empty, text lives in m:t; oMath 1-3 each; orig-same-idx identical → math intact); 7787 is a Bijoy answer line 'K. ev®úxKiY Gb_vjwcL. B‡jKUªb Avmw³' identical to original

Stage Summary:
- VERDICT: ALL 5 OUTPUTS VALID (no corrupt file) — B1: zip OK / entries OK / XML OK / oMath 891=891 / 158 pp. A4: OK / OK / OK / 891=891 / 158 pp. A3: OK / OK / OK / 891=891 / 153 pp (shorter per-section serials → benign reflow). B6: OK / OK / OK / 891=891 / 158 pp. continuous: OK / OK / OK / 891=891 / 158 pp
- Entries missing in outputs: none (files); only extra ZIP dir-entries (8, harmless JSZip artifact) vs original
- Anomaly: B6 ≡ continuous byte-content — expected from nesting algorithm (B6 scope stays open across later chapter headers), but user should know both downloads contain the same numbering; A3's 153 vs 158 pages is reflow, not corruption

---
Task ID: 14
Agent: main
Task: ইউজারের ৫টা Chemistry আউটপুট ফরেনসিক অডিট + B6-বাগ ও আইসোটোপ-ভুয়া-সিরিয়াল ফিক্স

Work Log:
- ইউজারের ৫ আউটপুট md5/zip/XML ফরেনসিক (scripts/forensic-outputs.ts + integrity agent): B1/A4/A3/continuous সঠিক (প্ল্যানের প্রতিটা ডিজিট ম্যাচ, প্ল্যানের বাইরে ০ পরিবর্তন, LibreOffice 153-158 পৃষ্ঠা); B6 আউটপুট continuous-এর হুবহু কপি (sha 8a9eecc3) — B6-বাগ নিশ্চিত
- B6-বাগের কারণ: অধ্যায়ের রঙ বদলালে (অধ্যায়-১=B6 → অধ্যায়-২..৫=B1) নতুন রঙ B1 আগের অধ্যায়ের "সন্তান" হিসেবে স্ট্যাকে বসত → B6-সেকশন কখনো বন্ধ হতো না → পুরো ফাইল ১..২৪৯৪ নম্বর পেয়ে যেত
- ফিক্স (planSerialByColor v2): "অধ্যায়-সোদক সোয়াপ" — fresh রঙ C এলে যদি (১) স্ট্যাক-রুট R মাত্র ১ বার এসে থাকে, (২) R-এর সন্তান-রঙ ২+ বার এসে স্ট্রাকচার প্রতিষ্ঠিত, (৩) C প্রতিষ্ঠিত সন্তানদের চেয়ে রেয়ার, (৪) C রুট ছাড়া সব খোলা রঙের চেয়ে কঠোরভাবে রেয়ার, (৫) C-R ঘনত্ব ≤১০× — তবে C রুটের সোদক: রুট-সেকশন বন্ধ। + ২×-রিস্টার্ট-গার্ড (পুরনো X-প্রোটেকশনের সাধারণীকরণ, X-নিরপেক্ষ)
- ২য় বাগ (সব আউটপুটে ছিল): আইসোটোপ নোটেশনের ভুয়া সিরিয়াল — "714N"=₇¹⁴N, "12Cl2"=¹²Cl₂, "1224Mg" ইত্যাদি ১২টা পারমাণবিক-ইকুয়েশন লাইন প্রশ্ন ভেবে নম্বর খেয়ে ফেলত (৬টা apply-অক্ষম → সিরিয়ালে ফাঁক; ৬টা w:t-ডিজিটসহ → নীরব ভুল রিনাম্বার!)। ফিক্স: isotope-guard (detectSerialPrefix + serialMatchSpans) — ডিজিটের ঠিক পরে একই রানে ইংরেজি অক্ষর হলে সিরিয়াল নয়; রান-বাউন্ডারি ব্যতিক্রম ("02<tab>প্রশ্ন" টাইপ বাঁওয়ায়, idx=6201 কেস)
- প্রশ্ন-গণনা ২৪৯৪→২৪৮২ (১২ ভুয়া বাদ); B6-প্ল্যান = অধ্যায়-১-এর ঠিক ১২৩ প্রশ্ন ১..১২৩; B1=২৩৫৯(৪ সেকশন), A4=২৪৮২(২৭), A3=২৪৮২(২৫৭)
- টেস্ট: test-color-serial.ts ৭৪/৭৪ (নতুন: আইসোটোপ-গার্ড ×৫, বাস্তব-ঘনত্বের Chemistry সিনারিও B6-ফিক্স, ৩-অধ্যায় চেইন, সেপারেটরহীন '12 abc'), test-docx ৪৩/৪৩, test-mcq ৬১/৬১, src tsc-ক্লিন
- রিজেনারেশন: scripts/regen-chem-fixed.ts — ৫টা আউটপুট নতুন করে; প্রতিটায় প্ল্যান-ডিজিট ১০০% ম্যাচ, প্ল্যানের বাইরে byte-identical, zip CRC + lxml strict-parse OK, oMath ৮৯৪=৮৯৪, LibreOffice ৫টাই রেন্ডার OK
- ব্রাউজার E2E: B1+B6 ফ্লো — চিপ, ব্যাখ্যা, ডাউনলোড, সাফল্য-টোস্ট, JS-error শূন্য; ব্রাউজার-ডাউনলোড B6 == যাচাইকৃত আউটপুট byte-identical (md5 c0d1ad15)
- UI: color-serial-card ব্যাখ্যায় সোদক-অধ্যায় নিয়ম যোগ; ডেলিভারেবল টুল-স্টাইল নামে download/-এ

Stage Summary:
- ইউজারের ৫ ফাইলের রায়: B1/A4/A3/continuous = কাঠামোগতভাবে ঠিক ও Word-নিরাপদ (তবে ৬+৬ আইসোটোপ-ফাঁক/ভুল ছিল); B6 = ব্যর্থ (continuous-এর কপি)
- ২টা বাগ ফিক্সড: (১) অধ্যায়ের রঙ বদলালে B6-স্টাইল স্কিম পুরো ফাইল নম্বর দিয়ে ফেলত, (২) আইসোটোপ লাইন ভুয়া প্রশ্ন হয়ে সিরিয়াল-ফাঁক/ভুল রিনাম্বার হতো
- ফিক্সড ৫ আউটপুট: download/Final Chemistry 1st paper only varsity Question (1-5) (color serial - {B1,A4,A3,B6,continuous}).docx

---
Task ID: 15
Agent: main
Task: ইউজারের প্রশ্নের চূড়ান্ত যাচাই — "Website ki ok? Same somossa ki r hbe?"

Work Log:
- dev server চেক: HTTP 200 (localhost:3000)
- ফুল টেস্ট ব্যাটারি রি-রান: test-color-serial 74/74, test-docx 43/43, test-mcq 61/61 (মোট 178, 0 fail)
- e2e-browser-chem.ts-এ পুরনো comparison-পাথ প্যাচ (download/Chemistry (color serial - B6).docx → নতুন regen নাম)
- ফ্রেশ ব্রাউজার E2E (playwright, আসল Chemistry ফাইল): রঙ-কার্ড ✓ → ডিটেক্ট-টোস্ট ✓ → A3/A4/B1/B6 চিপ ✓ → B1 সিলেক্ট (৪ সেকশন — ইউজারের রিপোর্ট করা fail-কেস) ✓ → ডাউনলোড ✓ → error-টোস্ট নেই ✓ → B6 সিলেক্ট (১ সেকশন) ✓ → ব্রাউজার-ডাউনলোড B6 যাচাইকৃত আউটপুটের সাথে byte-identical (md5 c0d1ad15607b) ✓ → JS error শূন্য ✓

Stage Summary:
- ওয়েবসাইট সম্পূর্ণ OK: ইউজারের রিপোর্ট করা দুটো সমস্যাই (B1-ক্লিক error + করাপ্ট ডাউনলোড) ফিক্সড ও লাইভ-ভেরিফাইড
- ইউজার এখন নিজে ওয়েবসাইট থেকে বানাতে পারবে; ৫টা যাচাইকৃত আউটপুট download/-এ আগেই আছে

---
Task ID: 16
Agent: main
Task: উপরে দুইটা মোড-বাটন — "MCQ শাফল" ও "MCQ সিরিয়াল" (শাফল আর সিরিয়ালের কাজ সম্পূর্ণ আলাদা, স্ট্রেস কমানো)

Work Log:
- নতুন কম্পোনেন্ট mode-tabs.tsx — হেডারের নিচে দুইটা বড় বাটন (role=tablist/tab, aria-selected): 🔀 MCQ শাফল (শাফল+সেট) ও 🔢 MCQ সিরিয়াল (রঙ-অনুযায়ী নম্বর); active = emerald fill; শেষ মোড localStorage-এ মনে থাকে (mcq-shuffler-mode)
- নতুন serial-input-card.tsx — সিরিয়াল মোডের নিজস্ব .docx-only আপলোড (নন-docx-এ বাংলা error), লোডেড ফাইলনাম দেখায়
- নতুন serial-extra-cards.tsx — (১) ColorFileShuffleNotice: শাফল মোডে রঙ-ফাইল উঠলে শাফল বন্ধ-ব্যাখ্যা + "সিরিয়াল মোডে এই ফাইল খুলুন" বাটন (ফাইল ফ্রি-হাতে সিরিয়াল মোডে চলে যায়, re-upload লাগে না); (২) NoColorSerialCard: রঙ না পেলে {n} প্রশ্ন জেনে "একটানা ১..N সিরিয়াল" ডাউনলোড
- page.tsx রিফ্যাক্টর: mode স্টেট + SerialState (file/baseName/xml/analysis) সম্পূর্ণ শাফল-স্টেট থেকে আলাদা; handleSerialFile (আপলোডে analyzeColorDocx একবার, স্টোর); handleColorSerial এখন serialDoc থেকে; DocxState-এ colorAn যোগ (হাত-অফে reuse); পুরনো auto colorMode-hijack বাদ — মোড এখন ইউজারের হাতে; হেডার সাবটাইটেল আপডেট
- মোবাইল বাগ-ফিক্স: CardHeader (column-flex)-এর ভিতরের flex-row-এ min-w-0 না থাকায় truncate বিবরণ ~৭৫০px টেনে ওভারফ্লো করত (৩৫৯px) — serial-input-card / serial-extra-cards / color-serial-card-এ flex-row ও span-এ min-w-0 যোগ → overflow 0px (পুরনো color-serial-card-এর hidden বাগও ধরা পড়ে ঠিক)
- টেস্ট: e2e-mode-tabs.ts (playwright) ৮ চেক পাস — ডিফল্ট শাফল ট্যাব; সিরিয়াল মোডে Chemistry → ৪ চিপ → B1 ডাউনলোড (ফাইলনাম যাচাই); শাফল মোডে রঙ-ফাইল → নোটিস + হাত-অফ → সিরিয়াল মোডে ফাইলসহ পৌঁছয়; রঙহীন docx → নো-কালার কার্ড + continuous ডাউনলোড; reload-এ মোড স্মরণ; রঙহীন ফাইলে শাফল ফ্লো নোটিসহীন; JS error শূন্য; মোবাইল 390px overflow 0; lint ক্লিন; tsc src ক্লিন
- আবিষ্কার: নমুনা hsc27-physics-bijoy.docx নিজেই রঙ-স্ট্রাকচার্ড (B1×৬ কালো হেডার) — তাই রঙহীন-কেসের জন্য python-docx দিয়ে upload/color-free-test.docx (shd=0, ১২ প্রশ্ন) বানানো হয়েছে

Stage Summary:
- ওয়েবসাইটে এখন দুইটা স্পষ্ট আলাদা মোড: 🔀 MCQ শাফল (টেক্সট/ডক আপলোড → ডিটেক্ট → শাফল → সেট) ও 🔢 MCQ সিরিয়াল (docx → রঙ-চিপ → সেকশন-সিরিয়াল / একটানা সিরিয়াল) — আলাদা আপলোড, আলাদা স্টেট, আলাদা UI; ভুল মোডে ভুল ফাইল গেলে ব্যাখ্যাসহ হাত-অফ
- E2E-ভেরিফাইড, মোবাইল-নিরাপদ, JS-error শূন্য

---
Task ID: 17
Agent: main
Task: শাফল মোডে রঙ-হেডার ফাইলে হেডার বাদ দিয়ে সব প্রশ্ন এক সিরিয়ালে শাফল + সিরিয়াল মোডে হেডার না থাকলে অটো একটানা সিরিয়াল ("header takle bad diye sob ek serial e shuffle")

Work Log:
- color-serial.ts: নতুন stripShadedParasXml(xml) — টপ-লেভেল শেডেড w:p স্ট্রিং-লেভেল splice-এ সরায় (paraShadingKey নিয়মেই; টেবিল/টেক্সটবক্সের ভিতরের শেড স্পর্শ হয় না; বাকি বাইট byte-identical)
- serial-extra-cards.tsx: ColorFileShuffleNotice (অ্যাম্বার ব্লকিং) → ColorShuffleInfoCard (স্কাই নন-ব্লকিং) — কতটা হেডার বাদ যাবে, কত প্রশ্ন এক সিরিয়ালে শাফল হবে + outline "সিরিয়াল মোডে খুলুন" হাত-অফ বাটন
- page.tsx: handleDocxFile এখন রঙ-ফাইলে stripShadedParasXml → parseDocxXml সবসময় (রঙ-ফাইলেও পার্স null না); DocxState-এ originalXml (সিরিয়াল হাত-অফের জন্য) + headersStripped যোগ; আপলোড-টোস্ট "রঙ-হেডার N টি বাদ দিয়ে M প্রশ্ন এক সিরিয়ালে" + 8MB+ ফাইলে সতর্কতা-টোস্ট; openInSerialMode এখন originalXml পাঠায় (রঙ-ইনডেক্স অরিজিনালের সাথে মেলে); রেন্ডারে ইনফো-কার্ড + DocxDetectCard + ShuffleCard + DocxSetsResult সব একসাথে দেখায়
- 🔴 লুকানো বাগ ধরা পড়ল E2E-তে: buildShuffledXml-এ ব্রাউজারের XMLSerializer নিজেই <?xml?> দেয় + ম্যানুয়াল প্রিপেন্ড = ডাবল ডেক্লারেশন (Task 3 থেকে সব শাফল-ডাউনলোডে ছিল; Word সহজে নিত, strict XML অবৈধ) — ফিক্স: সিরিয়ালাইজার-আউটপুটে ডেক্লারেশন থাকলে কেটে নেওয়া
- টেস্ট: test-color-serial.ts ৯০/৯০ (+১৬: strip সিনথেটিক ৯, রঙহীন byte-identical, Agri রিয়েল (১৩৫ হেডার বাদ, ৪৩৫ প্রশ্ন == রঙ-বিশ্লেষণ, স্ট্রিপ-পরে শেড=০), HSC নমুনা (৬ বাদ, ৬০ প্রশ্ন)); test-docx ৪৩/৪৩, test-mcq ৬১/৬১; src tsc ক্লিন
- নোট: Agri ফাইলে ১টা নন-শেডেড "Aa¨vq-8" লাইন আছে — রঙ নেই বলে সেটা কনটেন্ট, প্রশ্নের সাথেই শাফল হয় (রঙই হেডারের একমাত্র নির্ভরযোগ্য চিহ্ন)
- E2E scripts/e2e-shuffle-headers.ts (playwright) ৯ চেক পাস: ইনফো-কার্ড (৬ হেডার/৬০ প্রশ্ন) ব্লকহীন → ৪ সেট শাফল → রিনাম্বার ডাউনলোড → আউটপুটে B1-শেড শূন্য, Set A–D + ৩ পেজ-ব্রেক, প্রতি সেটে সিরিয়াল ১..১৫, ৬০ প্রশ্নের কনটেন্ট মাল্টিসেট হুবহু → হাত-অফ → রঙহীন ফাইলে অটো continuous ডাউনলোড; JS error শূন্য
- e2e-mode-tabs.ts নতুন আচরণে আপডেট (CHEM→HSC, নতুন টেক্সট) — ৮ চেক পাস, JS error শূন্য
- আউটপুট ইন্টিগ্রিটি: strict lxml parse OK + LibreOffice রেন্ডার ৪ পৃষ্ঠা (৪ সেট); ডেমো: download/HSC'27 Physics (shuffle demo - header bad, 4 sets).docx

Stage Summary:
- শাফল মোড এখন রঙ-হেডার ফাইলও নেয় — হেডারগুলো বাদ দিয়ে সবগুলো প্রশ্ন এক সিরিয়ালে ধরে ইউজারের সেট-সেটিং (interleaved/chunk/random/original) অনুযায়ী শাফল; আউটপুটে হেডার যায়ই না, প্রতি সেট আলাদা পেজে ১,২,৩… ; চাইলে এক ক্লিকে সিরিয়াল মোডে হাত-অফ
- সিরিয়াল মোডে হেডার না থাকলে অটো NoColorSerialCard → একটানা ১..N ডাউনলোড (আগেই ছিল, এখন E2E-প্রমাণিত)
- বোনাস ফিক্স: সব শাফল/সিরিয়াল-ফিক্স ডাউনলোড এখন strict-XML পরিষ্কার (ডাবল ডেক্লারেশন নির্মূল)

---
Task ID: 18
Agent: main
Task: প্রজেক্ট ক্লিনআপ — দরকারি না থাকা সব ফাইল/ফোল্ডার ডিলিট (ইউজারের অনুরোধ)

Work Log:
- আগে পুরো dependency-map (grep দিয়ে প্রতিটা import যাচাই) — কোন ফাইল কোথায় ব্যবহৃত সেটা নিশ্চিত হয়ে তারপর ডিলিট
- scripts/ থেকে ডিলিট: ১৩টা probe/debug ts, forensic-outputs + regen-chem-fixed, ৭টা python ফরেনসিক স্ক্রিপ্ট, ৪টা পুরনো/stale E2E (e2e-browser-chem, e2e-color-chem, e2e-color-agri, e2e-mode-tabs-mobile), ১৮টা PNG স্ক্রিনশট, document.xml, test-export.docx, tmp-e2e/ — রাখা হয়েছে: test-mcq / test-docx / test-color-serial (১৯৪ টেস্ট) + e2e-mode-tabs / e2e-shuffle-headers (বর্তমান আচরণের E2E) + verify-export
- upload/ থেকে ডিলিট: palette docx, HSC Premedical, ৫টা Chemistry আউটপুট-কপি, ২টা pasted image, lipilab-index.html — রাখা হয়েছে ৩টা টেস্ট-নির্ভর ফাইল (Chemistry original, Agri original, color-free-test.docx)
- download/ খালি (সব যাচাইকৃত আউটপুট ইউজারের হাতে আগেই গেছে)
- স্ক্যাফোল্ড ডিলিট: examples/, tests/, tool-results/, db/, prisma/, src/lib/db.ts (অব্যবহৃত Prisma), src/app/api/route.ts (hello-world), src/hooks/use-mobile.ts (শুধু sidebar ব্যবহার করত), public/logo.svg (layout CDN লোগো ব্যবহার করে)
- ৩৫টা অব্যবহৃত shadcn ui কম্পোনেন্ট ডিলিট — ব্যবহৃত ১৩টা রাখা: badge, button, card, checkbox, input, label, radio-group, select, switch, tabs, textarea, toast, toaster (+use-toast hook)
- ভেরিফিকেশন: টেস্ট ৬১+৪৩+৯০ = ১৯৪/১৯৪ পাস; tsc --noEmit-এ src+scripts শূন্য এরর (skills/ ফোল্ডারের ২টা প্রি-একজিস্টিং এরর এনভায়রনমেন্টের নিজস্ব, স্পর্শ করা হয়নি); dev server HTTP 200; শাফল+সিরিয়াল দুই মোড-বাটনই রেন্ডার

Stage Summary:
- প্রজেক্টে এখন শুধু দরকারি জিনিস: অ্যাপ-কোড (src), ১৩টা ব্যবহৃত ui কম্পোনেন্ট, ৬টা ভেরিফিকেশন-স্ক্রিপ্ট, ৩টা টেস্ট docx অ্যাসেট, ফন্ট+নমুনা, কনফিগ; সব টেস্ট পাস, ওয়েবসাইট সম্পূর্ণ কার্যকর

---
Task ID: 19
Agent: main
Task: রঙহীন হেডার/নন-MCQ লাইন টেক্সট-প্যাটার্নে বাদ + বাদ-পড়া লাইনের আলাদা লিস্ট ("jeta mcq noi seta jate bad dey" + "kon kon line block hyce show kro")

Work Log:
- প্রোব (Agri/Chemistry/HSC/color-free): Agri-র রঙহীন নন-প্রশ্ন লাইনে হেডার-প্যাটার্নে ধরা পড়ে ঠিক ১টা — "Aa¨vq-8" (বাকি ১০৪৬টা অপশন-লাইন); Chemistry/HSC-তে প্যাটার্ন-ম্যাচ শূন্য — প্যাটার্ন ভুল লাইন ধরে না
- color-serial.ts: (১) BlockedLine টাইপ {text, reason: "color"|"pattern"}; (২) isNonMcqText — টাইট প্যাটার্ন (^Aa¨vq Bijoy অধ্যায়, ^অধ্যায়, ^chapter \d, ^type[-:]?\d) + ≤৮০ অক্ষর গার্ড; (৩) stripNonMcqLinesXml — শুধু রঙহীন + প্রশ্ন-শুরু নয় + অপশন-লেড নয় এমন টপ-লেভেল প্যারা কাটে (string-level splice, byte-identical বাকি অংশ, idempotent); (৪) stripShadedParasXml এখন বাদ-পড়া লাইনের টেক্সটও রিটার্ন করে
- page.tsx: handleDocxFile-এ রঙ-স্ট্রিপের পরে প্যাটার্ন-স্ট্রিপ; DocxState-এ blocked: BlockedLine[]; টোস্টে "রঙ-হেডার X টি + নন-MCQ লাইন Y টি বাদ দিয়ে Z প্রশ্ন"; রঙহীন ফাইলেও প্যাটার্ন-লাইন বাদ হলে টোস্ট
- serial-extra-cards.tsx: নতুন BlockedLinesCard — "বাদ পড়া লাইনসমূহ — N টি (শাফলে যাবে না)", রঙ-হেডার/নন-MCQ দুই ব্যাজ + প্রতি লাইনে কারণ-চিপ, কলাপ্সিবল লিস্ট (প্রথম ৮ + "আরও N টি দেখুন"), Bijoy লাইন tokfont-bijoy ফন্টে
- টেস্ট: test-color-serial.ts ৯০→১২৯ (+৩৯: isNonMcqText ৯+/৮-, সিনথেটিক স্ট্রিপ ১১, প্রশ্ন-শুরু গার্ড, idempotent, Agri রিয়েল: ১৩৫+১=১৩৬ ব্লকড + ৪৩৫ প্রশ্ন অক্ষত, HSC শূন্য-ম্যাচ); test-mcq ৬১, test-docx ৪৩ — মোট ২৩৩/২৩৩; tsc+lint ক্লিন
- E2E: e2e-shuffle-headers.ts ৯→১২ চেক (নতুন: Agri আপলোড → ব্লকড-কার্ড ১৩৬, expand করে রঙহীন "Aa¨vq-8" দৃশ্যমান, ৪৩৫ প্রশ্নের শাফল-ফ্লো চালু); e2e-mode-tabs.ts ৮ চেক অক্ষত; দুটোতেই JS-error শূন্য

Stage Summary:
- শাফল মোডে এখন ৩ স্তরের বাদ-দেওয়া: রঙ-হেডার (শেডিং) → নন-MCQ হেডার/শিরোনাম (টেক্সট-প্যাটার্ন: অধ্যায়/Aa¨vq/Chapter/Type-N) → বাকি সব প্রশ্ন এক সিরিয়ালে ইউজারের সেট-সেটিং অনুযায়ী
- বাদ পড়া প্রতিটা লাইন কারণসহ (রঙ-হেডার / নন-MCQ) UI-র আলাদা কলাপ্সিবল লিস্টে দেখা যায় — ভুল কিছু বাদ পড়লে ইউজার সাথে সাথে দেখতে পারবেন
- Agri ফাইলের রঙহীন "Aa¨vq-8" এখন আর প্রশ্ন-৯৯৭-এর সাথে শাফল হয় না — লিস্টে "নন-MCQ" চিপ দিয়ে দেখানো হয়

---
Task ID: 19-b
Agent: general-purpose
Task: মাল্টি-ফাইল মোডের দুইটা নতুন প্রেজেন্টেশনাল কম্পোনেন্ট — MultiFileList (ড্র্যাগ-রি-অর্ডার লিস্ট) ও MultiDownloadCard (মার্জ/ZIP ডাউনলোড কার্ড)

Work Log:
- স্টাইল কনসিস্টেন্সির জন্য আগে serial-input-card, serial-extra-cards, ui/card, ui/button, ui/badge, ui/radio-group, shuffle-card পড়া হয়েছে; docx-xml.ts-এর numberToDigits(n,"bn") সিরিয়ালে ব্যবহার
- `src/components/mcq/multi-file-list.tsx` নতুন: "use client", props MultiFileItem{id,name,status,error,questionCount} + MultiFileListProps{items,onReorder,onRemove,disabled}; প্রতি রো-তে GripVertical হ্যান্ডেল + HTML5 ড্র্যাগ (dragFrom state, onDragOver→preventDefault+hoverIndex, onDrop→onReorder(from,to), from===to/disabled গার্ড, dragEnd/drop-এ রিসেট) + মোবাইলের জন্য ChevronUp/Down ghost আইকন-বাটন (বাউন্ডারিতে disabled) + X রিমুভ বাটন; রো-কনটেন্ট: বাংলা নম্বর ব্যাজ (numberToDigits(i+1,"bn"), emerald স্কয়ার) + ট্রাংকেটেড ফাইলনেম (min-w-0 flex-1) + স্টেটাস (loading→Loader2 spin, ready→emerald Badge "N টি প্রশ্ন", error→red text-xs + লাল বর্ডার); ড্র্যাগিং রো opacity-50, হোভার-ড্রপ রো ring-2 ring-emerald-500, disabled→pointer-events-none opacity-60; খালি items→null
- `src/components/mcq/multi-download-card.tsx` নতুন: "use client", props MultiDownloadCardProps{title,description,stats,showSerialChoice,serialStrategy,onSerialStrategyChange,onDownloadMerged,onDownloadZip,mergedBusy,zipBusy,disabled} + SerialStrategy টাইপ; CardHeader-এ FileDown সবুজ আইকন-টাইল + stats মিউটেড লাইন; showSerialChoice হলে shadcn RadioGroup-এ দুই rounded-border অপশন (per-file: "প্রতি ফাইলে নতুন করে ১ থেকে" / global: "একটানা এক সিরিয়াল") বাংলা বর্ণনাসহ; sm:grid-cols-2 গ্রিডে দুই বড় বাটন — সবুজ প্রাইমারি "এক ফাইলে ডাউনলোড (.docx)" (FileText, পেজ-ব্রেক সাব-লাইন, mergedBusy→Loader2+"তৈরি হচ্ছে...") ও আউটলাইন "আলাদা আলাদা ডাউনলোড (.zip)" (Archive, zipBusy→Loader2+"ZIP হচ্ছে...")
- কোনো এক্সিস্টিং ফাইল মডিফাই করা হয়নি, page.tsx-এ ওয়্যার করা হয়নি (মেইন এজেন্টের কাজ); TypeScript strict, কোনো `any` নেই, সব UI টেক্সট বাংলা
- ভেরিফিকেশন: `bunx tsc --noEmit` — আমার ফাইল থেকে শূন্য এরর (শুধু skills/-এর ২টা প্রি-একজিস্টিং এরর, জানা); ডেভ-সার্ভার চালানো হয়নি

Stage Summary:
- মাল্টি-ফাইল মোডের দুই কম্পোনেন্ট তৈরি ও টাইপ-ক্লিন: multi-file-list.tsx (ড্র্যাগ + তীর-বাটন রি-অর্ডার, বাংলা সিরিয়াল নম্বর, লোডিং/রেডি/এরর স্টেট) এবং multi-download-card.tsx (সিরিয়াল-স্ট্র্যাটেজি রেডিও + মার্জ .docx / ZIP ডাউল ডাউনলোড বাটন, বিজি-স্টেটসহ)
- পরের এজেন্টের জন্য: page.tsx-এ এই দুটো কম্পোনেন্ট ওয়্যার করতে হবে — MultiFileList-এর onReorder(from,to)/onRemove(id) কলব্যাকে state অ্যারে আপডেট, MultiDownloadCard-এ mergedBusy/zipBusy ফ্ল্যাগ আর SerialStrategy অনুযায়ী এক্সপোর্ট লজিক

---
Task ID: 19-a
Agent: general-purpose
Task: নতুন lib মডিউল src/lib/mcq/multi-docx.ts (মাল্টি-docx মার্জ + zip বান্ডেল) + টেস্ট scripts/test-multi-docx.ts

Work Log:
- প্রাক-পাঠ: worklog শেষ ৩ এন্ট্রি, color-serial.ts-এর downloadColorSerialDocx (JSZip কপি-রিবিল্ড প্যাটার্ন + DOCX_MIME), docx-xml.ts (loadDocxXml/W_NS), test-color-serial.ts-এর assertion-স্টাইল — কোনো existing ফাইল স্পর্শ করা হয়নি
- src/lib/mcq/multi-docx.ts (নতুন): PAGE_BREAK_P কনস্ট্যান্ট; extractBodyInner (প্রথম <w:body>…</w:body>-এর ভিতরের অংশ, না পেলে বাংলা এরর); splitTrailingSectPr (lastIndexOf("<w:sectPr") → self-closing regex /^<w:sectPr[^>]*\/>/ নয়তো </w:sectPr> খোঁজা; কেবল remainder whitespace-only হলেই body-level ধরে স্ট্রিপ — pPr-লেভেল মিড-ডক sectPr কখনো কাটে না, defensive null); buildMergedDocumentXml (base-এর body-level sectPr-এর ঠিক আগে প্রতিটা extra-এর আগে PAGE_BREAK_P, extra-দের trailing sectPr বাদ, রিকনস্ট্রাকশন base-এর ORIGINAL offsets-এ — prologue/epilogue byte-হুবহু; খালি extras-এ "items খালি" এরর); DOCX_MIME + replaceDocumentXml (downloadColorSerialDocx-এর হুবহু JSZip প্যাটার্ন: loadAsync → non-dir এন্ট্রি uint8array কপি, document.xml বাদ → নতুন JSZip → document.xml আগে → generateAsync blob DEFLATE); buildMergedDocxBlob (items[0]=base container, merged XML দিয়ে base-এর document.xml রিপ্লেস); buildZipBlob (ডুপ্লিকেট নামে extension-এর আগে " (2)", " (3)" — set-ভিত্তিক লুপে "a (2).docx" নিজেই থাকলেও সংঘর্ষ-মুক্ত); offsetSerialPlan (সবসময় নতুন Map, আসলটা mutate না, offset 0 হলেও)
- scripts/test-multi-docx.ts (নতুন): test-color-serial-এর হুবহু ok()-কাউন্টার স্টাইল, বাংলা টেস্ট-নাম; ইন-মেমরি সিনথেটিক docx (JSZip → uint8array → Blob): BASE (BASE-Q1 + মিড-ডক pPr-sectPr-প্যারা BASE-Q2 + trailing body sectPr), EXTRA1 (আলাদা pgSz 21001 মার্কার), EXTRA2 (self-closing <w:sectPr/>) + প্রতিটায় মার্কার-যুক্ত styles.xml ও [Content_Types].xml; ৬ সেকশনে ৫৭ দাবি: extractBodyInner, splitTrailingSectPr (৪ ভ্যারিয়েন্ট incl. pPr-only-শেষ → null, whitespace-tail), buildMergedDocumentXml (অর্ডার, PAGE_BREAK_P×২, body-level sectPr×১, extras' sectPr বাদ, mid-doc অক্ষত, body-ট্যাগ×১, DOMParser well-formed, body-children=৭, ২টা page w:br, prologue/epilogue byte-হুবহু, খালি→এরর), replaceDocumentXml+buildMergedDocxBlob (MIME, styles BASE-এরটাই, extras' না, zip এন্ট্রি), buildZipBlob ডিডাপ (set.docx/set (2).docx + AAA/BBB/CCC ম্যাপিং), offsetSerialPlan (mutate-না/নতুন Map/offset-0)
- বান-এনভায়রনমেন্ট ২টা আবিষ্কার: (১) bun-এ FileReader নেই বলে JSZip-এর Blob-ইনপুট পথ (prepareContent) কাজ করে না — টেস্টে jsdom-DOMParser-পলিফিল-স্টাইলে মিনিমাল FileReaderShim বসানো হয়েছে (lib হুবহু ব্রাউজার-প্যাটার্নেই আছে, ব্রাউজারে FileReader নিজেই থাকে); (২) JSZip createFolders জেনারেটে "word/" ডিরেক্টরি-এন্ট্রি দেয় (downloadColorSerialDocx-এর আউটপুটও একই) — টেস্ট দাবি সেই অনুযায়ী
- ভেরিফিকেশন: bun scripts/test-multi-docx.ts → ৫৭/৫৭ পাস; রিগ্রেশন — test-mcq ৬১, test-docx ৪৩, test-color-serial ১২৯ (মোট ২৩৩) সব পাস; tsc --noEmit-এ src+scripts শূন্য এরর (skills/-এর ২টা প্রি-একজিস্টিং এরর ছাড়া); git status-এ নতুন মাত্র ২ ফাইল

Stage Summary:
- এক মডিউলে সম্পূর্ণ multi-docx স্ট্যাক: string-level (OOM-মুক্ত) body-extract → নিরাপদ sectPr-split (মিড-ডক সেকশন-ব্রেক প্রিজার্ভ) → পেজ-ব্রেক-সহ মার্জ → base-container সংরক্ষণে docx রি-বিল্ড → ডুপ্লিকেট-নাম-সচেতন zip বান্ডেল → গ্লোবাল সিরিয়াল-অফসেট; ৫৭ নতুন + ২৩৩ পুরনো = ২৯০/২৯০ টেস্ট পাস, কোনো existing ফাইল বদলায়নি

---
Task ID: 19
Agent: Main Agent (Super Z) + 2 subagents (19-a lib, 19-b UI)
Task: দুই মোডেই মাল্টি-ফাইল আপলোড — সিরিয়াল (মার্জ+পেজব্রেক+দুই সিরিয়াল-স্ট্র্যাটেজি+ZIP) ও শাফল (মাল্টি-শাফল+মার্জ/ZIP) + drag&drop ফিক্স + .txt client-side ফিক্স

Work Log:
- 19-a (subagent): src/lib/mcq/multi-docx.ts নতুন — extractBodyInner, splitTrailingSectPr (pPr-level sectPr রক্ষা করে), buildMergedDocumentXml (PAGE_BREAK_P স্প্লাইস), replaceDocumentXml, buildMergedDocxBlob (base=১ম ফাইল container), buildZipBlob (নাম-ডুপ্লিকেট dedupe), offsetSerialPlan; scripts/test-multi-docx.ts — ৫৭ টেস্ট
- 19-b (subagent): src/components/mcq/multi-file-list.tsx (HTML5 drag reorder + তীর-বাটন + remove + বাংলা নম্বর/স্ট্যাটাস ব্যাজ) ও multi-download-card.tsx (মার্জ/ZIP দুই বাটন + per-file/global সিরিয়াল RadioGroup) — দুটোই pure presentational
- 19-c/d (main): serial-input-card.tsx রিরাইট (multiple + drag&drop ড্রপজোন + "আরও ফাইল" append); input-card.tsx (multiple .docx + drag&drop + .txt/.csv client-side f.text() — মৃত /api/extract 404 বাগ ফিক্স + "সর্বোচ্চ ২০০০ প্রশ্ন" টেক্সট সরানো); page.tsx — serialDocs[]/shuffleItems[] লিস্ট-স্টেট, loadSerialFiles/reorder/remove, handleSerialMultiMerged (offsetSerialPlan দিয়ে global vs per-file), handleSerialMultiZip, handleShuffleFiles (প্রতি ফাইল আলাদা স্ট্রিপ+পার্স; ১ ফাইল হলে পুরনো একক পাইপলাইন), handleMultiShuffle/handleMultiMergedDownload/handleMultiZipDownload, multiGateReason, রেন্ডার শাখা
- ভেরিফিকেশন: tsc ক্লিন (skills/-এর ২ পুরনো এরর বাদে), ২৯০/২৯০ ইউনিট টেস্ট (৬১+৪৩+১২৯+৫৭), নতুন scripts/e2e-multi-file.ts — সিরিয়াল ৩-ফাইল (লিস্ট+reorder+মার্জ পেজব্রেক×২+ZIP×৩+একক-ফাইল রিগ্রেশন) ও শাফল ২-ফাইল (শাফল+মার্জ Set A×২+পেজব্রেক×৭+ZIP×২) সব পাস, কনসোল-এরর শূন্য; e2e-mode-tabs + e2e-shuffle-headers রিগ্রেশন-মুক্ত

Stage Summary:
- সিরিয়াল মোড: একসাথে একাধিক .docx → ক্রম-লিস্ট (টেনে/তীরে সাজানো) → মার্জ এক .docx (পেজ ব্রেকসহ; সিরিয়াল file-by-file বা শুরু-থেকে-শেষ একটানা — দুটোই) অথবা এক ক্লিকে ZIP (প্রতি ফাইল আলাদা সিরিয়াল)
- শাফল মোড: একসাথে একাধিক .docx → প্রতি ফাইল নিজের ভিতরে শাফল (একই সেট-কনফিগ) → মার্জ .docx বা ZIP
- ১ ফাইলের পুরনো ফ্লো (রঙ-চিপ সিরিয়াল, একক শাফল UI) অক্ষত; drag&drop আপলোড এখন দুই কার্ডেই কাজ করে; .txt আর সার্ভারে যায় না
- সিদ্ধান্ত: মাল্টি-ফাইল সিরিয়ালে রঙ-ভিত্তিক স্কিম UI দেওয়া হয়নি (continuous ধরা হয়েছে) — রঙ লাগলে একক-ফাইল মোড; ইউজার চাইলে পরে যোগ হবে

---
Task ID: 20-a
Agent: Explore (UI inventory)
Task: UI ফিচার-ইনভেন্টরি রিসার্চ (RESEARCH ONLY — কোনো কোড পরিবর্তন হয়নি)

Work Log:
- page.tsx সম্পূর্ণ পড়া (১২৭৩ লাইন — হেডার/মোড-ট্যাব/৩ শাখা-রেন্ডার/গেট/টোস্ট/ফুটার ম্যাপ করা)
- layout.tsx + globals.css পড়া (metadata, lang="bn", ফন্ট-face: Kalpurush/SutonnyMJ Web, tok-* রঙ-ক্লাস, mcq-scroll স্ক্রলবার)
- src/components/mcq/ এর সব ১৩টি ফাইল সম্পূর্ণ পড়া: input-card, detect-card, docx-detect-card, shuffle-card, sets-result, docx-sets-result, mode-tabs, multi-file-list, multi-download-card, serial-input-card, serial-extra-cards, color-serial-card, tok-text
- সাপোর্টিং টাইপ যাচাই: exporter.ts (ExportOptions/DEFAULT_EXPORT_OPTIONS), set-engine.ts (Distribution/NameStyle/getSetName), docx-exporter.ts (englishSetName)
- worklog.md পড়া (Task 17/18/19/19-a/19-b কনটেক্সট)
- structured markdown রিপোর্ট (৯ সেকশন, প্রতিটি দাবিতে file:line রেফ + হুবহু বাংলা লেবেল) মেইন এজেন্টকে রিটার্ন

Stage Summary:
- অ্যাপ = ২ মোড (🔀 শাফল / 🔢 সিরিয়াল) — ModeTabs-এ localStorage মনে রাখা; শাফল মোড ৩ পাইপলাইন (text paste, একক .docx, মাল্টি .docx), সিরিয়াল মোড = .docx-অনলি (paste নেই), ১ ফাইলে রঙ-চিপ স্কিম + ≥২ ফাইলে মার্জ/ZIP
- ধাপ-ব্যাজ ১→৪ (ইনপুট/ডিটেকশন/শাফল সেটিংস/রেজাল্ট); গেট-লজিক gateReason + multiGateReason টেক্সট-ভিত্তিক, ShuffleCard বাটন lock icon+কারণ দেখায়
- রেজাল্ট এক্সপোর্ট: text মোডে .docx/.doc/প্রিন্ট/কপি + ফন্ট/হেডার/সেট-নেমিং সেটিংস; docx মোডে দুই ডাউনলোড (রিনাম্বার/আসল নম্বর) + ক্লিকেবল সিরিয়াল টগল; মাল্টিতে মার্জ .docx + ZIP
- localStorage: mcq-shuffler-text (৬০০ms ডিবাউন্স) + mcq-shuffler-mode; ~৩০টি বাংলা toast; ফুটারে ক্লায়েন্ট-সাইড প্রসেসিং নোট
- মোবাইল: min-h-[44px] ট্যাব, তীর-বাটন রি-অর্ডার (ড্র্যাগের বিকল্প), grid-cols-1→sm/md/lg ব্রেকপয়েন্ট, কাস্টম mcq-scroll

---
Task ID: 20-b
Agent: Explore (lib capabilities)
Task: ইঞ্জিন ক্যাপাবিলিটি ম্যাপ রিসার্চ (RESEARCH ONLY — কোনো কোড পরিবর্তন নেই)

Work Log:
- worklog.md (Task 1–19) সম্পূর্ণ পড়ে প্রজেক্ট-বিবর্তনের কনটেক্সট নেওয়া হয়েছে
- src/lib/mcq/-এর ৯টা মডিউল লাইন-ধরে পড়া: parser (249), set-engine (137), encoding (214), exporter (340), docx-exporter (172), docx-xml (567), color-serial (750), multi-docx (176), sample (77) — প্রতিটার exported API, থ্রেশহোল্ড ও হার্ডকোড ম্যাপ করা
- layout.tsx + globals.css (font-face) + public/ অ্যাসেট (fonts: kalpurush.woff2/ttf 308K+112K, SutonnyMJ.woff 44K; sample/hsc27-physics-bijoy.docx 68K; robots.txt) যাচাই
- grep "2000|২০০০|MAX_": একমাত্র বাকি 2000-লিমিট = parser.ts:108 `num > 2000` (সিরিয়াল-নম্বর-ভ্যালু সিলিং, প্রশ্ন-কাউন্ট নয়); UI-র "সর্বোচ্চ ২০০০ প্রশ্ন" টেক্সট আগেই বাদ; MAX_ কনস্ট্যান্ট নেই
- ডিপেন্ডেন্সি অডিট: src/+scripts/-এর সব import গ্রেপ + node_modules/bun.lock চেক — ব্যবহৃত: docx, jszip, lucide-react, clsx, tailwind-merge, class-variance-authority, @radix-ui ৮টা (switch/slot/toast/select/checkbox/radio-group/tabs/label), tw-animate-css, next/react; অব্যবহৃত-প্রমাণিত ৩০+ (prisma/@prisma/client ইনস্টলড কিন্তু import শূন্য, next-auth, recharts, framer-motion, zod, zustand, @dnd-kit×৩, @tanstack×২, @mdxeditor, sonner, next-themes, next-intl, uuid, sharp, date-fns ইত্যাদি); mammoth আর package.json/node_modules-এই নেই (আগেই রিমুভড); e2e স্ক্রিপ্টগুলো playwright import করে যা package.json-এ ডিক্লেয়ারডই নেই
- ফরম্যাট/সীমা তথ্য সংগ্রহ: input accept (.docx/.txt/.csv শাফল; .docx-only সিরিয়াল), 8_000_000-char বিশাল-ফাইল টোস্ট (page.tsx), docx-xml isQuestionStart num≤5000/tier-3 ≤999, serial issues cap 30, set-engine original-retry 16, palette 70 রঙ, NON_MCQ ≤80 অক্ষর গার্ড

Stage Summary:
- ৯-মডিউল lib-লেয়ারের সম্পূর্ণ ক্যাপাবিলিটি-ম্যাপ (ফাইল:লাইন রেফসহ) রিপোর্ট আকারে দেওয়া হয়েছে — ২টা প্যারালাল পাইপলাইন (টেক্সট: parser/set-engine/exporter; docx: docx-xml/docx-exporter/color-serial/multi-docx) + ভাগ-করা encoding
- একমাত্র বাকি 2000 = parser.ts:108-এর সিরিয়াল-নম্বর সিলিং (২০০১+ নম্বরের প্রশ্ন টেক্সট-পার্সে ধরা পড়বে না); docx-পথে সিলিং 5000 — অসামঞ্জস্য নোট করা হয়েছে
- অব্যবহৃত ডিপেন্ডেন্সি নিশ্চিত-প্রমাণসহ তালিকাভুক্ত (import-শূন্য): package.json-এর ~৩৫টা এন্ট্রি; mammoth আর নেই; playwright ডিক্লেয়ার-অনুপস্থিত
- কোনো কোড পরিবর্তন হয়নি — শুধু worklog আপডেট

---
Task ID: 20
Agent: Main Agent (Super Z) + Explore ×2 (20-a UI inventory, 20-b lib capabilities)
Task: প্রজেক্ট ক্লিনআপ (অপ্রয়োজনীয় ফাইল/ফোল্ডার ডিলিট) + ফুল ওয়েবসাইট ফিচার-রিভিউ

Work Log:
- সার্ভে: root/src/scripts/public স্ট্রাকচার, git ls-files, .gitignore, package.json, dev HTTP 200 যাচাই
- ডিলিট (git rm): src/app/api/ (ডেড /api/extract রুট — .txt এখন ক্লায়েন্ট-সাইডে পড়ে), scripts/e2e-mode-tabs.png, scripts/e2e-shuffle-headers.png (ট্র্যাকড স্ক্রিনশট আর্টিফ্যাক্ট), scripts/tmp-e2e/ (টেম্প docx), tool-results/ (৮টা টুল-ডাম্প, ডিস্ক থেকে), tsconfig.tsbuildinfo
- .gitignore-এ tool-results/, scripts/*.png, scripts/tmp-e2e/ যোগ
- bun remove mammoth — শুধু ডেড API রুটই ব্যবহার করত; package.json + bun.lock আপডেট
- ভেরিফিকেশন: tsc --noEmit ক্লিন (skills/-এর ২ প্রি-একজিস্টিং এরর বাদে), ইউনিট টেস্ট ২৯০/২৯০ (test-mcq ৬১ + test-docx ৪৩ + test-color-serial ১২৯ + test-multi-docx ৫৭), dev HTTP 200
- git commit 78a01a0 "chore: প্রজেক্ট ক্লিনআপ…" (লোকাল — git remote কনফিগার্ড নেই, পুশ হয়নি)
- রিভিউ: Explore 20-a = UI ফিচার-ইনভেন্টরি (page.tsx 1273 লাইন + ১৩টা mcq কম্পোনেন্ট + layout/globals), Explore 20-b = lib ক্যাপাবিলিটি-ম্যাপ (৯ মডিউল + ডিপেন্ডেন্সি অডিট); main agent page.tsx:1-260 নিজে পড়ে ক্রস-যাচাই — অসামঞ্জস্য পাওয়া যায়নি

Stage Summary:
- প্রজেক্ট এখন ১০০% ক্লায়েন্ট-সাইড — src/app-এ API রুট নেই, ভবিষ্যতের স্ট্যাটিক এক্সপোর্ট/cPanel হোস্টিং-এর পথ প্রস্তুত
- রিভিউ থেকে চিহ্নিত গ্যাপ: parser.ts:108 সিরিয়াল-ভ্যালু সিলিং 2000 বনাম docx-xml.ts:207-এ 5000 (অসামঞ্জস্য), ~৩৫টা অব্যবহৃত টেমপ্লেট ডিপেন্ডেন্সি + মরা db:* স্ক্রিপ্ট (prisma/ ফোল্ডার নেই), playwright devDependency-তে ডিক্লেয়ারড নেই (E2E তবু চলে), সিরিয়াল-মাল্টিতে রঙ-স্কিম UI নেই (ইচ্ছাকৃত, continuous), সিরিয়াল মোডে paste ইনপুট নেই
- ইউজারকে দুই মোডের সম্পূর্ণ ইউজার-জার্নি, সব অপশন/ডাউনলোড, core/optional ফিচার-শ্রেণিবিভাগসহ বিস্তারিত রিভিউ চ্যাটে দেওয়া হয়েছে

---
Task ID: 21-a
Agent: General (ceiling unify)
Task: 2000/5000 সিরিয়াল-সিলিং → MAX_SERIAL_NUMBER=9999 ইউনিফাই + year-গার্ড

Work Log:
- প্রাক-পাঠ: worklog (Task 18–20) + parser.ts, docx-xml.ts, test-mcq.ts, test-docx.ts, test-color-serial.ts (সিনথেটিক-XML প্যাটার্ন); baseline টেস্ট ২৯০ (৬১+৪৩+১২৯+৫৭), isQuestionStart গ্রেপ — color-serial.ts-ও docx-xml-এর শেয়ার্ড সিলিং ব্যবহার করে (relaxation ওখানেও ধারাবাহিকভাবে প্রযোজ্য)
- src/lib/mcq/limits.ts (নতুন): export const MAX_SERIAL_NUMBER = 9999 — বাংলা কমেন্টে ৪-ডিজিট লিমিটের ব্যাখ্যা (Q_RE/SERIAL_RE উভয়েই ডিজিট-ক্লাস {1,4}, তাই ভ্যালু-সিলিং ঠিক সেই রেঞ্জের শেষ মান — বেশি দিলে মৃত-কোড, কম দিলে বৈধ সিরিয়াল হারায়)
- parser.ts: classifyLine-এ `num > 2000` → `num > MAX_SERIAL_NUMBER` (import limits); টাইট year-গার্ড যোগ — num ∈ [1900..2100] এবং সেপারেটরের পরের টেক্সটের প্রথম ~১০ অক্ষরে "সাল" বা "year" (toLowerCase, case-insensitive) হলে continuation (কারণ: "2024. সালের ফলাফল…" hasSep-পথে আগে ভুল প্রশ্ন হত; no-sep-পথে চেইন-রুল আগেই আটকাত); প্রথম-প্রশ্ন num ≤ 50 নিয়ম, চেইন-রুল, অপশন-ডিটেকশন — সব অপরিবর্তিত
- docx-xml.ts: isQuestionStart-এ `si.num > 5000` → `si.num > MAX_SERIAL_NUMBER` (import limits); tier-১ (রান-ট্যাব), tier-২ (অপশন-লেড), tier-৩ ডেসিমাল-গার্ড (num ≤ 999) — সব অপরিবর্তিত
- সেমান্টিক্স-আপডেটের যৌক্তিকতা: কোনো পুরনো টেস্ট 2000/5000-সিলিংয়ের উপর দাঁড়িয়ে ছিল না (grep দ্বারা নিশ্চিত — একমাত্র test-mcq-এর "২০০০ প্রশ্ন" টেস্টটা প্রশ্ন-কাউন্ট, সিরিয়াল-ভ্যালু নয়) — তাই কোনো পুরনো দাবি বদলাতে হয়নি, শুধু নতুন কেস যোগ হয়েছে
- test-mcq.ts (+১০, ৬১→৭১): টেস্ট ১৫ সিলিং-ইউনিফাই (সিরিয়াল 2500/6000 প্রশ্ন ডিটেক্ট, অপশন অক্ষত, বাউন্ডারি 9999) + টেস্ট ১৬ year-গার্ড ("2024. সালের ফলাফল…" কনটিনিউয়েশন+সংরক্ষিত, "২০২৫ সালে…" প্রশ্ন নয়, "2024. Year of…" case-insensitive প্রশ্ন নয়, গার্ড-রেঞ্জে 'সাল/year'-ছাড়া প্রশ্ন হয়, প্রথম-প্রশ্ন ≤50 অক্ষত)
- test-docx.ts (+৫, ৪৩→৪৮): নতুন সেকশন ৮ — সিনথেটিক XML ফিক্সচারে (test-color-serial-এর wrapDoc-প্যাটার্নে) সিরিয়াল 6000 টিয়ার-২ প্রশ্ন-স্টার্ট + অপশন, বাউন্ডারি 9999, টিয়ার-১ রান-ট্যাবে 6001, টিয়ার-৩ ডেসিমাল-গার্ড অপরিবর্তিত (2000 > 999 → প্রশ্ন নয়)
- ভেরিফিকেশন: npx tsc --noEmit → exit 0 (শূন্য এরর); bun test-mcq/test-docx/test-color-serial/test-multi-docx → ৭১ + ৪৮ + ১২৯ + ৫৭ = ৩০৫/৩০৫ পাস; dev server HTTP 200 (localhost:3000, bun run dev)

Stage Summary:
- টেক্সট ও docx দুই পাইপলাইনেই সিরিয়াল-সিলিং এখন এক — MAX_SERIAL_NUMBER = 9999 (limits.ts); ২০০১–৯৯৯৯ সিরিয়ালের প্রশ্ন টেক্সট-পার্সে আর হারায় না, docx-পার্সে ৫০০১–৯৯৯৯ নতুন ধরা পায় (tier-গার্ডগুলো আগের মতই ভুল-পজিটিভ আটকায়)
- নতুন year-গার্ড: 1900–2100-জাতীয় বছর-টোকেন ("2024 সালের ফলাফল", "2024. Year of…") লাইন-শুরুতে এলে আর ভুল প্রশ্ন হয় না — গার্ড টাইট (১৯০০–২১০০ রেঞ্জ + প্রথম ১০ অক্ষরে সাল/year), অন্য আচরণ অপরিবর্তিত
- টেস্ট ২৯০ → ৩০৫ (test-mcq ৭১, test-docx ৪৮, test-color-serial ১২৯, test-multi-docx ৫৭) — সব পাস; tsc শূন্য এরর; dev HTTP 200

---
Task ID: 21-c
Agent: General (static export + GH Pages)
Task: স্ট্যাটিক-এক্সপোর্ট, basePath, next/font ফন্ট, GitHub Actions ডিপ্লয়, README

Work Log:
- next.config.ts: STATIC_EXPORT=1 হলে output:"export" + images.unoptimized + distDir:".next-static", নাহলে আগের output:"standalone"; basePath = NEXT_PUBLIC_BASE_PATH ?? "" সব মোডে; typescript.ignoreBuildErrors/reactStrictMode অক্ষত
- নতুন src/lib/base-path.ts (BASE_PATH + withBase); input-card.tsx: SAMPLE_DOCX_URL = withBase("/sample/hsc27-physics-bijoy.docx") (import যোগ, setUploadName ফাইলনেম অপরিবর্তিত)
- src grep: পাবলিক-অ্যাসেট absolute-path ছিল শুধু input-card.tsx (/sample/) ও globals.css (/fonts/) — দুটোই নিচে ঠিক করা হয়েছে; অন্য কোথাও নেই
- layout.tsx: next/font/local দিয়ে Kalpurush (kalpurush.woff2) + SutonnyMJ (SutonnyMJ.woff), variable --font-kalpurush/--font-sutonny <html> className-এ; আগের Geist/Noto_Sans_Bengali ভ্যারিয়েবল (body-তে) অক্ষত। নোট: src/app/layout.tsx থেকে public-এ আপেক্ষিক পাথ "../../public/fonts/…" (টাস্ক-লেখার ../… হলে src/app বাদে ফাইল পাওয়া যেত না)
- globals.css: Kalpurush/SutonnyMJ @font-face ব্লক সরানো; --font-sans ও body font-family এখন var(--font-kalpurush) দিয়ে শুরু (আগের ফলব্যাক-স্ট্যাক অক্ষত); .tok-bijoy স্ট্যাক = "SutonnyMJ", var(--font-sutonny), "Bijoy", monospace, sans-serif; tw-animate-css @import ও বাকি সব অক্ষত
- package.json: scripts-এ "build:static": "STATIC_EXPORT=1 next build" যোগ (অন্য কিছু বদলায়নি, bun.lock অক্ষত)
- নতুন .github/workflows/deploy.yml: push(main)+workflow_dispatch, permissions (contents:read/pages:write/id-token:write), concurrency group pages, build job (checkout@v4 → setup-bun@v2 → bun install --frozen-lockfile → Compute base path: repo *.github.io হলে খালি নাহলে /$R → GITHUB_ENV → bun run build:static (NEXT_PUBLIC_BASE_PATH) → .nojekyll → upload-pages-artifact@v3) + deploy job (deploy-pages@v4, environment github-pages)। অ্যাডাপ্টেশন: Next.js 16-তে output=export + কাস্টম distDir দিলে এক্সপোর্ট সাইট distDir-ই লেখে (node_modules/next/dist/build/index.js-এ hasCustomExportOutput → configOutDir=config.distDir) — তাই স্টেপটি `rm -rf out && mv .next-static out && touch out/.nojekyll` (প্রমাণসহ কমেন্টেড)
- .gitignore: /.next-static/ যোগ (/out/ আগেই ছিল)
- লোকাল স্ট্যাটিক-বিল্ড: STATIC_EXPORT=1 NEXT_PUBLIC_BASE_PATH=/mcq-shuffler-pro npx next build → ✓ Compiled successfully in 7.9s, 3/3 static pages, Route: ○ / + ○ /_not-found (সব Static)
- out/ যাচাই: index.html ✓, .nojekyll ✓; HTML/JS অ্যাসেট সব /mcq-shuffler-pro/-প্রিফিক্সড; CSS-এ absolute "/fonts/" = 0 (সব url(../media/…)); JS চাংকে "/mcq-shuffler-pro/sample/hsc27-physics-bijoy.docx" (withBase ইনলাইন) ✓; media-তে kalpurush + SutonnyMJ ফন্ট
- ভেরিফিকেশন: tsc --noEmit → src/lib/base-path.ts/layout/input-card/globals ক্লিন; একটাই এরর src/app/page.tsx(1055) SerialInputCardProps প্রপস — অন্য এজেন্টের চলমান এডিট (স্পর্শ নিষিদ্ধ), আমার ফাইলে কোনো এরর নেই; ৪ ইউনিট-টেস্ট পাস (test-mcq 71 + test-docx 48 + test-color-serial 129 + test-multi-docx 57 = 305, 0 ফেল)
- dev (localhost:3000) → HTTP 200; <html>-এ দুই ফন্ট-ভ্যারিয়েবল ক্লাস; body computed font "kalpurush, …" দিয়ে শুরু; document.fonts.check → kalpurush:true, sutonny:true; স্যাম্পল-লোড+ডিটেক্টের পর .tok-bijoy computed font = "SutonnyMJ", sutonny, "sutonny Fallback", Bijoy, monospace, sans-serif; dev.log-এ 404/500 = 0; স্ক্রিনশট প্রমাণ tool-results/font-render-check.png
- নতুন README.md (বাংলা): পরিচিতি, ফিচার, লোকাল ডেভ, GitHub Pages ধাপে ধাপে (repo → push → Settings→Pages→GitHub Actions → লাইভ URL; username.github.io রুট-ডোমেইন নোট; কাস্টম ডোমেইন), স্ট্যাটিক-বিল্ড যাচাই কমান্ড

Stage Summary:
- স্ট্যাটিক-এক্সপোর্ট সম্পূর্ণ রেডি: STATIC_EXPORT=1 বিল্ড সফল, out/ (Next 16-তে .next-static হিসেবে জেনারেট হয়ে ওয়ার্কফ্লোতে mv হয়) পুরোপুরি সাবপাথ-প্রিফিক্সড — GitHub Pages প্রজেক্ট-সাইট ও username.github.io দুই কেসেই চলবে
- ফন্ট এখন next/font/local — CSS-এ কোনো url("/fonts/…") নেই; সাবপাথে ফন্ট 404-এর ঝুঁকি শেষ; PC-ইনস্টলড SutonnyMJ প্রায়োরিটি অক্ষত
- dev/স্যান্ডবক্স-প্রিভিউ (standalone) পাথ অক্ষত; সীমাবদ্ধতা: Next 16-এ export-মোডে বিল্ড-ইন্টারনাল .next-এই লেখে (distDir নির্বিশেষে) — dev তবু 200, Next নিজে .next/dev আলাদা রাখে; page.tsx-এর tsc এরর অন্য এজেন্টের ইন-ফ্লাইট কাজ, আমার স্কোপে নয়

---
Task ID: 21-b
Agent: Full-stack (serial paste + per-file scheme)
Task: সিরিয়াল মোড পেস্ট-ইনপুট + মাল্টি-ফাইল per-file রঙ-স্কিম

Work Log:
- প্রাক-পাঠ: worklog.md (Task 19-এর মাল্টি-ফাইল সিদ্ধান্তসহ) + page.tsx, serial-input-card, serial-extra-cards, multi-download-card, input-card (পেস্ট-ট্যাব প্যাটার্ন), parser.ts (parseMcq/ParseOutput/autoFixNumbering/formatNumberByScript), color-serial.ts (planSerialByColor/SerialScheme/ColorAnalysis/colorKeyHex/colorKeyName), exporter.ts (exportDocx — সেট-টাইটেল প্যারা অবাধ্য, নিচে নোট), set-engine.ts (getSetName), e2e দুটো স্ক্রিপ্ট (strict-selector সংঘর্ষ এড়ানোর প্ল্যানসহ)
- ফিচার ১ (পেস্ট): নতুন `src/lib/mcq/serial-paste.ts` — renumberQuestionsByPosition(): autoFixNumbering-এর হুবহু প্যাটার্নে (rawPrefix বাদ → formatNumberByScript + separator-fallback "." + স্পেস) প্রথম লাইনের লিডিং নম্বর পজিশন-অনুযায়ী ১..N; প্রতি প্রশ্ন নিজের numberScript-এ (bn/en), অরিজিনাল অ্যারে mutate-না
- serial-input-card.tsx: ইনার Tabs (defaultValue="upload") — "ফাইল আপলোড" (FileUp) / "পেস্ট করুন" (ClipboardPaste); পেস্ট ট্যাবে Textarea (min-h-[220px], font-mono, input-card-এর placeholder-স্টাইল) + বাটন "🔍 প্রশ্ন ডিটেক্ট করুন" (busy: "ডিটেক্ট হচ্ছে..."); বিদ্যমান props/ফাইল-ফ্লো হুবহু অক্ষত; লুকানো দুই file-input Tabs-এর বাইরে সরানো (paste-ট্যাবে থাকলেও আপলোড ও "আরও ফাইল যোগ করুন" কাজ করে — Radix inactive-ট্যাব unmount ব্যতিক্রম); কার্ড-টাইটেল "MCQ সিরিয়াল — ফাইল আপলোড" অক্ষত (e2e নির্ভরতা)
- নতুন `src/components/mcq/serial-paste-card.tsx` (SerialPasteCard): স্টেপ-ব্যাজ "২", টাইটেল "ডিটেকশন রেজাল্ট (পেস্ট)"; স্ট্যাট-গ্রিড মোট প্রশ্ন / অপশনসহ প্রশ্ন / নম্বরের ধরন; সিরিয়াল-স্ট্যাটাস (ok=সবুজ, broken=অ্যাম্বার + issues-প্রিভিউ + "🔧 অটো নম্বরিং ঠিক করুন"); অ্যাম্বার নোট "পেস্ট মোডে রঙ-ডিটেকশন হয় না — রঙ-ভিত্তিক সিরিয়ালের জন্য .docx ফাইল আপলোড করুন"; বড় বাটন "সিরিয়াল করে .docx ডাউনলোড (১..N)" (busy "তৈরি হচ্ছে...")
- page.tsx: serialPasteText/serialPaste/serialPasteBusy/serialPasteFixing/serialPasteDlBusy স্টেট; handleSerialPasteDetect (parseMcq → ফাইল-লিস্ট+স্কিম ক্লিয়ার → ডিটেক্ট-স্টাইল বাংলা toast: 0-প্রশ্ন/ok/broken তিন শাখা), handleSerialPasteFix (autoFixNumbering → টেক্সট+রেজাল্ট আপডেট), handleSerialPasteDownload (renumberQuestionsByPosition → exportDocx([এক সেট], {...DEFAULT_EXPORT_OPTIONS, includeHeader:false})); পারস্পরিক একচেটিয়া: ফাইল-লোড সাফল্যে serialPaste=null, পেস্ট-ডিটেক্টে serialDocs=[]+serialSchemes={}, serialDocs.length>0 হলে পেস্ট-কার্ড রেন্ডার নয়
- ফিচার ২ (per-file স্কিম): page.tsx-এ serialSchemes: Record<string, SerialScheme> (কী=SerialState.id); loadSerialFiles-এ প্রতি নতুন id-তে {kind:"continuous"} (replace-এ পুরনো ম্যাপ বদল, append-এ মার্জ), removeSerialDoc-এ কী-ডিলিট, openInSerialMode-এ ১-এন্ট্রি ম্যাপ; handleSerialMultiMerged/handleSerialMultiZip-এ plan = planSerialByColor(d.analysis, serialSchemes[d.id] ?? {kind:"continuous"}) — offsetSerialPlan-অফসেট লজিক হুবহু অক্ষত (offset += base.size)
- serial-extra-cards.tsx-এ নতুন MultiSerialSchemeCard: serialDocs.length ≥ 2 হলে MultiDownloadCard-এর ঠিক উপরে; টাইটেল "প্রতি ফাইলের সিরিয়াল-স্কিম"; প্রতি ফাইল-রোতে নাম+প্রশ্ন-ব্যাজ; রঙ থাকলে "একটানা" চিপ + প্রতি রঙের চিপ (SchemeSwatch = colorKeyHex, নাম = colorKeyName, ব্যাজ = sections) — color-serial-card-এর হুবহু চিপ-স্টাইল (border-primary bg-primary/10 ring-1 + CheckCircle2); রঙ না থাকলে "রঙ নেই — একটানা হবে"; ফাইলনাম span-এ flex-1+truncate ইচ্ছাকৃত এড়ানো (e2e-র span.flex-1.truncate===3 কাউন্টার রক্ষা)
- ভেরিফিকেশন: npx tsc --noEmit ০ এরর; bun run lint ক্লিন; ইউনিট ৭১+৪৮+১২৯+৫৭ = ৩০৫/৩০৫ পাস (অন্য এজেন্টের বাড়তি টেস্টসহ অপরিবর্তিত পাস); dev HTTP 200; e2e-multi-file.ts সব-স্টেপ পাস (ডিফল্ট continuous রিগ্রেশন-প্রুফ), e2e-mode-tabs.ts সব-স্টেপ পাস (JS-error শূন্য); নিজে playwright দিয়ে ম্যানুয়াল চেক (টেম্প-স্ক্রিপ্ট, পরে ডিলিট): পেস্ট-ট্যাব দৃশ্যমান → SAMPLE_MCQ প্রি-ফিল → ডিটেক্ট → ১২ প্রশ্ন/সিরিয়াল-ok → ডাউনলোড = বৈধ docx-এ ১..১২ bn-রিনাম্বার; একচেটিয়া দুই দিকেই যাচাই; ≥২ ফাইলে স্কিম-কার্ড + B1-টগল + ZIP; গভীর-প্রুফ: একই CHEM-এর continuous বনাম B1-স্কিম ZIP-আউটপুটের document.xml ভিন্ন (স্কিম সত্যিই প্রয়োগ হয়); কনসোল-এরর শূন্য

Stage Summary:
- সিরিয়াল মোডে এখন পেস্ট-ইনপুটও চলে: টেক্সট → ডিটেক্ট → (ভাঙা হলে অটো-ফিক্স) → পজিশন-অনুযায়ী ১..N সিরিয়াল বসানো এক-সেট .docx; ফাইল-ফ্লো ও পেস্ট-ফ্লো পারস্পরিক একচেটিয়া — একটার সাফল্য আরেকটার কার্ড মুছে দেয়
- মাল্টি-ফাইল সিরিয়ালে প্রতি ফাইলের নিজের সিরিয়াল-স্কিম: ডিফল্ট একটানা (আগের আচরণ byte-লেভেলেও অপরিবর্তিত — e2e সবুজ), রঙ-হেডারওয়ালা ফাইলে রঙ বাছলে প্রতি সেকশনে ১ থেকে রিস্টার্ট; মার্জ (.docx) ও ZIP দুই আউটপুটেই প্রযোজ্য
- exporter-সীমা নোট: exportDocx-এ প্রতি সেটের শুরুতে সেট-টাইটেল প্যারা ("সেট A") অবাধ্যভাবে আসে — ExportOptions-এ এড়ানোর কোনো বিদ্যমান উপায় নেই (includeHeader=false শুধু ইনস্টিটিউট-হেডার লাইন বাদ দেয়); তাই নির্দেশনামাফিক এক সেট + includeHeader:false-এ এক্সপোর্ট করা হয়েছে — আউটপুটের একদম শুরুতে একটাই "সেট A" লাইন থাকবে; আর ফাইলনেমও exporter-অন্তর্নিহিত ("MCQ-Sets-<টাইমস্ট্যাম্প>.docx") — "serial-pasted.docx" নাম দেওয়ার হুক ওখানে নেই; দুটোই ঠিক করতে exporter.ts-এ ছোট পরিবর্তন লাগবে (এই টাস্কে নিষিদ্ধ)
- রিটার্ন (structured):
  - নতুন ফাইল: src/lib/mcq/serial-paste.ts, src/components/mcq/serial-paste-card.tsx
  - বদলানো ফাইল: src/app/page.tsx, src/components/mcq/serial-input-card.tsx, src/components/mcq/serial-extra-cards.tsx (multi-download-card.tsx বদলানো হয়নি — দরকার হয়নি)
  - নতুন UI-লেবেল: ট্যাব "ফাইল আপলোড"/"পেস্ট করুন"; বাটন "🔍 প্রশ্ন ডিটেক্ট করুন" (busy "ডিটেক্ট হচ্ছে..."); কার্ড "ডিটেকশন রেজাল্ট (পেস্ট)"; স্ট্যাট "মোট প্রশ্ন"/"অপশনসহ প্রশ্ন"/"নম্বরের ধরন"; "🔧 অটো নম্বরিং ঠিক করুন"; নোট "পেস্ট মোডে রঙ-ডিটেকশন হয় না — রঙ-ভিত্তিক সিরিয়ালের জন্য .docx ফাইল আপলোড করুন"; বাটন "সিরিয়াল করে .docx ডাউনলোড (১..N)"; কার্ড "প্রতি ফাইলের সিরিয়াল-স্কিম"; চিপ "একটানা"; টেক্সট "রঙ নেই — একটানা হবে"; রঙ-চিপে "N সেকশন"
  - ভেরিফিকেশন: tsc ০-এরর, lint ক্লিন, টেস্ট ৩০৫/৩০৫, dev 200, e2e-multi-file ✓, e2e-mode-tabs ✓, ম্যানুয়াল playwright ✓ (কনসোল-এরর শূন্য)
  - সীমাবদ্ধতা: পেস্ট-এক্সপোর্টে exporter-এর "সেট A" টাইটেল-প্যারা + "MCQ-Sets-*" ফাইলনেম (exporter.ts স্পর্শ-নিষিদ্ধ বলে অপরিবর্তিত); পেস্ট-মোডে রঙ-ডিটেকশন প্রযোজ্য নয় (টেক্সট-পাইপলাইন, কার্ডে স্পষ্ট লেখা)

---
Task ID: 21
Agent: Main Agent (Super Z) + 21-a, 21-b, 21-c (parallel)
Task: "Sobgolo phase by phase complete + GitHub free hosting ready" — ডিপ-প্রুন, সিলিং-ইউনিফাই, সিরিয়াল paste ইনপুট, per-file রঙ-স্কিম, স্ট্যাটিক এক্সপোর্ট + GitHub Pages ডিপ্লয়

Work Log:
- Phase 1 (main): ৫৪টা অব্যবহৃত টেমপ্লেট ডিপ বাদ (bun remove) + মরা db:* স্ক্রিপ্ট সরানো; tsconfig-এ skills/ exclude; tailwind.config.ts থেকে tailwindcss-animate plugin বাদ (v4-তে tw-animate-css); commit 8c6c9eb + 2987a1c
- Phase 2 (21-a): src/lib/mcq/limits.ts নতুন — MAX_SERIAL_NUMBER=9999; parser.ts 2000→9999 + year-গার্ড (1900-2100 + "সাল/year" হলে continuation); docx-xml.ts 5000→9999; test-mcq ৬১→৭১, test-docx ৪৩→৪৮
- Phase 3 (21-b): সিরিয়াল মোডে পেস্ট ইনপুট — serial-input-card-এ ইনার ট্যাব (ফাইল/পেস্ট), serial-paste.ts (renumberQuestionsByPosition), serial-paste-card.tsx (স্ট্যাট+অটো-ফিক্স+ডাউনলোড), page.tsx হ্যান্ডলার+একচেটিয়া-ওয়্যারিং
- Phase 4 (21-b): মাল্টি-ফাইল সিরিয়ালে per-file রঙ-স্কিম — MultiSerialSchemeCard (চিপ-টগল, ডিফল্ট continuous), serialSchemes স্টেট, handleSerialMultiMerged/Zip প্রতি-ফাইল planSerialByColor
- Phase 5 (21-c): next.config — STATIC_EXPORT=1 হলে output:export + distDir:.next-static, নাহলে standalone; basePath=NEXT_PUBLIC_BASE_PATH; src/lib/base-path.ts (withBase); input-card SAMPLE_DOCX_URL withBase-যুক্ত; ফন্ট → next/font/local (Kalpurush/SutonnyMJ, globals.css-এর @font-face সরানো — Pages সাবপাথে 404-প্রুফ); .github/workflows/deploy.yml (bun build → rm -rf out && mv .next-static out → .nojekyll → Pages deploy; *.github.io হলে basePath খালি); package.json "build:static"; README.md (বাংলা হোস্টিং গাইড)
- Integration (main): exporter.ts-এ includeSetHeader + fileName অপশন যোগ (পেস্ট-সিরিয়াল এক্সপোর্টে জবরদস্তি "সেট A" টাইটেল বাদ, ফাইলনেম MCQ-Serial-Nq.docx); page.tsx পেস্ট-ডাউনলোড আপডেট
- ভেরিফিকেশন: tsc ০ error; টেস্ট ৩০৫/৩০৫ (৭১+৪৮+১২৯+৫৭); dev 200; e2e-multi-file + e2e-mode-tabs পাস (JS-error শূন্য); STATIC_EXPORT build সফল — out-এ basePath প্রিফিক্স, CSS-এ absolute /fonts/ শূন্য, .nojekyll আছে; CI-র mv .next-static→out লজিক যাচাইকৃত

Stage Summary:
- সাইট GitHub Pages-এ ফ্রি হোস্ট-রেডি: repo push + Settings→Pages→GitHub Actions = লাইভ
- ব্যবহৃত ফিচার-সেট সম্পূর্ণ: সিরিয়াল মোডে এখন paste ইনপুটও আছে; মাল্টি-ফাইল সিরিয়ালে প্রতি ফাইলে রঙ-স্কিম বাছা যায়; ৯৯৯৯ পর্যন্ত সিরিয়াল দুই পাইপলাইনেই ধরে
- node_modules 1.2G→997M, lockfile ৫৪ ডিপ হালকা — CI ইনস্টল দ্রুত
- অবশিষ্ট (ইচ্ছাকৃত-বাদ): .doc বাইনারি ইনপুট (ব্রাউজারে বাস্তবসম্মত নয়), পেস্টে রঙ-স্কিম (রঙের উৎসই নেই — নোট UI-তে)

---
Task ID: 28
Agent: Main Agent (Super Z)
Task: "Ekn poro project clean kre felo" + lipilab merge/revenue/marketing strategy consultation (স্যান্ডবক্স রোলব্যাক পুনঃস্থাপনসহ)

Work Log:
- স্যান্ডবক্স রোলব্যাক শনাক্ত: worklog/git-এ সর্বশেষ Task 21 (42de10b) — গত সেশনের Task 26 (redownload/renumber মোড) ও Task 27 (favicon) বর্তমান ফাইলসিস্টেমে নেই; ব্যবহারকারীকে জানানো হবে
- Word view সার্চ: src/-তে "word view/ওয়ার্ড ভিউ/previewMode" — কোনো ম্যাচ নেই (ফিচারটি রোলব্যাকে হারিয়েছে), তাই বাদ দেওয়ার কিছু অবশিষ্ট নেই
- Task 27 পুনঃস্থাপন: src/app/icon.svg (emerald #059669 rounded tile + সাদা lucide Dices), scripts/gen-favicon-png.js → icon.png 512px + apple-icon.png 180px (sharp), layout.tsx থেকে metadata.icons z-cdn URL বাদ
- ক্লিন-আপ যাচাই: tsc --noEmit ০ এরর, eslint ক্লিন, tool-results/tmp জাঞ্জ পরিষ্কার, টেস্ট/ই২ই স্ক্রিপ্ট অক্ষত
- ডেভ সার্ভার পুনরায় চালু (nohup bun run dev, port 3000) — curl 200
- ব্রাউজার e2e: হোম রেন্ডার ✓ (মোড-ট্যাব, আপলোড/পেস্ট ট্যাব), icon লিংক /icon.svg|icon.png|apple-icon.png ✓, নমুনা Bijoy .docx → অটো-ডিটেক্ট ৬০ প্রশ্ন ✓, pageerror/কনসোল-এরর শূন্য
- STATIC_EXPORT=1 NEXT_PUBLIC_BASE_PATH=/fix_mcq build সফল — .next-static root-এ icon.svg/png/apple-icon.png emit, index.html-এ basePath-যুক্ত href, z-cdn রেফারেন্স ০; বিল্ড আর্টিফ্যাক্ট পরিষ্কার
- লোকাল কমিট 5b754d1 (push করা হয়নি — ফ্রিজ বলবত)
- lipilab রিসার্চ: afnan-samin/lipilab = "Bangla Unicode ↔ Bijoy Converter", single-page vanilla JS + JSZip, কাস্টম ডোমেইন lipilab.pro.bd (CNAME), v2.0 master-prompt-এ points-wallet (1 BDT=2000 pts), SSLCommerz/ShurjoPay, freemium+quota, rewarded-ad cooldown ডিজাইন ও "MCQ Serial" LLM ফিচার পরিকল্পিত
- কনসালটেশন উত্তর (Banglish): স্ট্যাক-ভার্ডিক্ট (JS ইঞ্জিন রেখে হাইব্রিড ব্যাকএন্ড; Laravel=ব্যাকএন্ড+অ্যাডমিন+ব্লগ, UI/UX ফ্রন্টএন্ডনির্ভর), মার্জ আর্কিটেকচার (lipilab.pro.bd হাব + /mcq পাথ, এক repo), ads (AdSense→Ezoic/Mediavine) ও non-ads (points, প্রিমিয়াম, B2B কোচিং লাইসেন্স, API/white-label, সার্ভিস), মার্কেটিং (SEO বাংলা কিওয়ার্ড, FB টিচার-গ্রুপ, YouTube বাংলা টিউটোরিয়াল, পরীক্ষা-সিজন টাইমিং), দরকারি চেকলিস্ট

Stage Summary:
- প্রজেক্ট এখন ক্লিন + লোগো favicon সহ লাইভ প্রিভিউ চলছে (dev server 200, e2e ক্লিন)
- গত সেশনের redownload মোড বর্তমান কোডে নেই — ব্যবহারকারী চাইলে পুনর্নির্মাণ করতে হবে
- কৌশলগত সুপারিশ: উভয় টুল JS-ইঞ্জিন হিসেবে থেকে এক হাব-সাইটে মার্জ → হাইব্রিড ব্যাকএন্ড (auth/points/quota) → ads+freemium+B2B রাজস্ব
