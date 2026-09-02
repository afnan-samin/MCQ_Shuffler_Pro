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
