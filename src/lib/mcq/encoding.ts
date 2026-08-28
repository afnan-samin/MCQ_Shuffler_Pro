// ============================================================
// Encoding Detector — শব্দ ধরে ধরে লেখার ধরন শনাক্তকরণ
// তিনটি ক্লাস: "bijoy" (Bijoy/ANSI লিগ্যাসি এনকোডিং),
// "unicode" (ইউনিকোড বাংলা — অভ্র/ইউনিকোড), "english", "neutral"
// Bijoy লেখা SutonnyMJ ফন্টে দেখানো হয় (ওয়েব + Word এক্সপোর্ট দুটোতেই)
// ============================================================

export type Enc = "bijoy" | "unicode" | "english" | "neutral";

export interface Tok {
  text: string;
  enc: Enc;
}

export interface EncodingStats {
  /** মোট শব্দ (স্পেস বাদে) */
  total: number;
  bijoy: number;
  unicode: number;
  english: number;
  neutral: number;
  /** ডকুমেন্টের প্রধান লেখার ধরন (strong সিগন্যাল থেকে) */
  dominant: Enc | null;
}

// ---------- সিগন্যাল রেজেক্স ----------

/** ইউনিকোড বাংলা ক্যারেক্টার ব্লক (U+0980–U+09FF) */
const BN_RE = /[\u0980-\u09FF]/;

/**
 * Bijoy/ANSI লিগ্যাসি এনকোডিংয়ের STRONG মার্কার —
 * এই ক্যারেক্টারগুলো English/Unicode MCQ টেক্সটে প্রায় কখনোই আসে না,
 * কিন্তু Bijoy (SutonnyMJ) টাইপ করা বাংলায় খুব কমন (কার-চিহ্ন, যুক্তবর্ণ ইত্যাদি)।
 */
const BIJOY_STRONG = /[†‡Öµ¶¼½¾«»ßàáâãäåæçèéêëìíîïðñòóôõöùúûüýþÿÐÑÒÓÔÕŒœ“”‘’‗…]/;

/**
 * WEAK মার্কার — গণিত/সিম্বলেও দেখা যায় (×, ÷, ±), তাই শুধু
 * Latin অক্ষরসহ থাকলে বিজয় ধরা হয়।
 */
const BIJOY_WEAK = /[×÷±§¤¦¯°¡¿¬­®™‰]/;

const ALPHA_RE = /[A-Za-z]/;

/** খাঁটি সংখ্যা/সিম্বল টোকেন (কোনো ভাষাই না) */
const NUM_ONLY_RE = /^[0-9.,%:;\/\-–—+=°"'()]+$/;

// ---------- কমন English শব্দ (MCQ পরীক্ষায় সবচেয়ে বেশি দেখা যায়) ----------

const ENGLISH_COMMON = new Set([
  "the","of","and","is","are","was","were","be","been","being","in","on","at","to","for","from","with","by","as","it","its","this","that","these","those","which","what","who","whom","whose","when","where","why","how","not","no","yes","all","any","each","both","few","more","most","other","some","such","only","own","same","so","than","too","very","can","will","just","should","now","one","two","three","four","five","first","second","third","fourth","fifth","none","except","but","or","nor","either","neither","a","an","has","have","had","do","does","did","done","may","might","must","shall","would","could","also","them","they","their","there","here","we","you","your","our","his","her","him","she","he","i","me","my","us","am","if","then","else","because","while","about","into","over","under","after","before","during","without","within","between","among","above","below","up","down","out","off","again","further","once","question","questions","option","options","answer","answers","choose","correct","incorrect","right","wrong","true","false","statement","statements","given","following","according","known","called","used","example","examples","best","which one","select","match","fill","blanks","blank","write","read","paragraph","passage","word","words","sentence","sentences","meaning","opposite","similar","sound","made","make","makes","take","takes","go","goes","come","comes","get","gets","give","gives","find","finds","know","knows","think","thinks","see","sees","use","uses","want","wants","work","works","call","calls","try","tries","ask","asks","need","needs","feel","feels","become","becomes","leave","leaves","put","puts","mean","means","keep","keeps","let","lets","begin","begins","seem","seems","help","helps","talk","talks","turn","turns","start","starts","show","shows","hear","hears","play","plays","run","runs","move","moves","live","lives","believe","believes","hold","holds","bring","brings","happen","happens","sit","sits","stand","stands","lose","loses","pay","pays","meet","meets","include","includes","continue","continues","set","learn","learned","change","changes","lead","leads","understand","understood","watch","watches","follow","follows","stop","stops","create","creates","speak","speaks","spend","spends","grow","grows","open","opens","walk","walks","win","wins","teach","teaches","offer","offers","remember","remembers","consider","considers","appear","appears","buy","buys","wait","waits","serve","serves","die","dies","send","sends","expect","expects","build","builds","stay","stays","fall","falls","cut","cuts","reach","reaches","kill","kills","remain","remains","time","year","years","day","days","way","ways","man","men","woman","women","child","children","world","life","hand","part","place","case","week","company","system","program","number","group","problem","fact","water","money","month","lot","book","school","word","business","issue","side","kind","head","house","service","friend","father","power","hour","game","line","end","member","law","car","city","name","team","minute","idea","body","back","parent","face","level","door","art","war","history","result","change","morning","reason","research","girl","guy","moment","air","teacher","force","education","foot","boy","age","policy","process","music","market","sense","nation","plan","college","interest","death","experience","effect","class","control","care","field","development","role","effort","rate","heart","drug","show","leader","light","voice","wife","police","mind","price","report","decision","son","view","relationship","town","road","arm","difference","value","building","action","model","season","society","tax","director","position","player","record","paper","space","ground","form","event","official","matter","center","couple","site","project","activity","star","table","court","oil","situation","cost","industry","figure","street","image","phone","data","picture","practice","piece","land","product","doctor","wall","patient","worker","news","test","movie","north","love","support","technology","step","baby","computer","type","attention","film","tree","source","truth","performance","song","front","east","west","science","unit","units","km","kg","ml",
]);

// ---------- মূল ক্লাসিফায়ার ----------

/**
 * একটি শব্দের লেখার ধরন নির্ণয়। `dominant` = লাইন/ডকুমেন্টের প্রধান ধরন
 * (কনটেক্সট) — Bijoy ডকুমেন্টের খাঁটি-ASCII শব্দগুলো বিজয় ধরা হয়।
 */
export function classifyWord(word: string, dominant: Enc | null): Enc {
  const w = word.trim();
  if (!w) return "neutral";

  // ১) ইউনিকোড বাংলা
  if (BN_RE.test(w)) return "unicode";

  // ২) Bijoy strong মার্কার (কার/যুক্তবর্ণ চিহ্ন)
  if (BIJOY_STRONG.test(w)) return "bijoy";

  // ৩) Bijoy weak মার্কার — শুধু অক্ষরসহ থাকলে
  if (ALPHA_RE.test(w) && BIJOY_WEAK.test(w)) return "bijoy";

  // ৪) শুধু চিহ্ন/সিম্বল — ভাষা নেই
  if (!/[A-Za-z0-9]/.test(w)) return "neutral";

  // ৫) খাঁটি সংখ্যা
  if (NUM_ONLY_RE.test(w)) return "neutral";

  // ৬) খাঁটি ASCII — English কমন লিস্ট বা কনটেক্সট দেখে
  const lower = w.toLowerCase().replace(/[^a-z']/g, "");
  if (ENGLISH_COMMON.has(lower)) return "english";

  if (dominant === "bijoy") return "bijoy";
  if (dominant === "english") return "english";
  if (dominant === "unicode") return "english"; // ইউনিকোড বাংলা লাইনের ASCII শব্দ = English হিসেবেই দেখাও

  // ৭) কনটেক্সট নেই — ASCII শব্দ ডিফল্টভাবে English
  return "english";
}

/** একটি লাইনের নিজস্ব strong কনটেক্সট (এক্সপোর্টে লাইন-ভিত্তিক ফন্টের জন্য) */
export function lineDominantOf(line: string): Enc | null {
  if (BN_RE.test(line)) return "unicode";
  if (BIJOY_STRONG.test(line)) return "bijoy";
  return null;
}

/** লাইনকে টোকেনে ভাগ করে (স্পেসসহ) প্রতিটির ধরন বসায় */
export function tokenizeWithContext(line: string, dominant: Enc | null): Tok[] {
  const parts = line.split(/(\s+)/);
  const toks: Tok[] = [];
  for (const p of parts) {
    if (!p) continue;
    if (/^\s+$/.test(p)) {
      toks.push({ text: p, enc: "neutral" });
      continue;
    }
    toks.push({ text: p, enc: classifyWord(p, dominant) });
  }
  return toks;
}

/**
 * লাইন → ফন্ট-রান সেগমেন্ট (docx/html এক্সপোর্টের জন্য)।
 * পরপর একই ধরনের টোকেন মার্জ হয়; neutral স্পেস/চিহ্ন আগের সেগমেন্টে যুক্ত হয়।
 */
export function splitLineSegments(line: string): Tok[] {
  const toks = tokenizeWithContext(line, lineDominantOf(line));
  const out: Tok[] = [];
  for (const t of toks) {
    if (!t.text) continue;
    if (out.length === 0) {
      out.push({ ...t });
      continue;
    }
    const last = out[out.length - 1];
    if (last.enc === t.enc) {
      last.text += t.text;
    } else if (t.enc === "neutral") {
      // স্পেস/চিহ্ন আগের সেগমেন্টের সাথেই থাকুক
      last.text += t.text;
    } else if (last.enc === "neutral") {
      // লিডিং/স্ট্যান্ডঅ্যালোন neutral — পরের শব্দের ধরন নেয়
      last.text += t.text;
      last.enc = t.enc;
    } else {
      out.push({ ...t });
    }
  }
  return out;
}

// ---------- ডকুমেন্ট-লেভেল অ্যানালাইসিস ----------

/**
 * পুরো টেক্সট শব্দ ধরে ধরে বিশ্লেষণ করে স্ট্যাটস দেয়।
 * দুই-পাস: প্রথমে strong সিগন্যাল থেকে ডকুমেন্টের প্রধান ধরন, তারপর সব শব্দ।
 */
export function analyzeText(text: string): EncodingStats {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");

  // পাস ১ — strong সিগন্যাল
  const strongCount: Record<"bijoy" | "unicode" | "english", number> = {
    bijoy: 0,
    unicode: 0,
    english: 0,
  };
  for (const line of lines) {
    if (!line.trim()) continue;
    for (const w of line.split(/\s+/)) {
      if (!w) continue;
      if (BN_RE.test(w)) strongCount.unicode++;
      else if (BIJOY_STRONG.test(w)) strongCount.bijoy++;
      else {
        const lower = w.toLowerCase().replace(/[^a-z']/g, "");
        if (lower.length > 2 && ENGLISH_COMMON.has(lower)) strongCount.english++;
      }
    }
  }

  let dominant: Enc | null = null;
  let max = 0;
  (["bijoy", "unicode", "english"] as const).forEach((k) => {
    if (strongCount[k] > max) {
      max = strongCount[k];
      dominant = k;
    }
  });

  // পাস ২ — কনটেক্সটসহ পূর্ণ ক্লাসিফিকেশন
  const stats: EncodingStats = {
    total: 0,
    bijoy: 0,
    unicode: 0,
    english: 0,
    neutral: 0,
    dominant,
  };
  for (const line of lines) {
    if (!line.trim()) continue;
    for (const w of line.split(/\s+/)) {
      if (!w) continue;
      stats.total++;
      const enc = classifyWord(w, dominant);
      stats[enc]++;
    }
  }
  return stats;
}

// ---------- UI হেল্পার ----------

export const ENC_LABEL: Record<Enc, string> = {
  bijoy: "Bijoy (SutonnyMJ)",
  unicode: "ইউনিকোড বাংলা",
  english: "English",
  neutral: "অন্যান্য",
};

export function encPercent(count: number, total: number): number {
  if (!total) return 0;
  return Math.round((count / total) * 100);
}
