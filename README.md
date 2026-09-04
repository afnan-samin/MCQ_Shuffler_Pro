# MCQ Shuffler Pro — MCQ শাফল ও সেট তৈরির ফ্রি টুল

MCQ প্রশ্ন শাফল করে একাধিক সেটে ভাগ করার সম্পূর্ণ ফ্রি ওয়েব টুল। Word (.docx), টেক্সট ও CSV ফাইল থেকে প্রশ্ন পড়ে, সিরিয়াল ডিটেক্ট ও অটো-ফিক্স করে, এক্সাম-রেডি Word ফাইল এক্সপোর্ট করে। **১০০% ক্লায়েন্ট-সাইড** — কোনো ফাইল সার্ভারে যায় না।

## মূল ফিচার

- **শাফল + সেট তৈরি** — Fisher-Yates শাফল; interleaved / chunk / random ডিস্ট্রিবিউশনে একাধিক সেট, বা প্রতি সেটে সব প্রশ্ন (Original Shuffle)
- **রঙ-সিরিয়াল** — প্রতিটি প্রশ্নের সিরিয়াল রঙিন করে মূল-সেট ম্যাপিং সহ এক্সপোর্ট
- **মাল্টি-ফাইল মার্জ + ZIP** — একাধিক .docx একসাথে প্রসেস করে একটাই .docx বা ZIP ডাউনলোড
- **Bijoy ↔ ইউনিকোড ডিটেকশন** — শব্দ-ধরে ধরে Bijoy (ANSI) / ইউনিকোড বাংলা / English শনাক্ত ও রঙ-প্রিভিউ; ভাঙা সিরিয়াল ডিটেক্ট + অটো-ফিক্স
- **প্রাইভেসি** — পুরো পাইপলাইন ব্রাউজারেই চলে; কোনো API রুট নেই, কোনো আপলোড নেই

## লোকাল ডেভ

```bash
bun install
bun run dev        # http://localhost:3000
```

## GitHub Pages-এ ফ্রি হোস্টিং (ধাপে ধাপে)

এই প্রজেক্টে `.github/workflows/deploy.yml` রেডি করা আছে — push করলেই স্ট্যাটিক বিল্ড হয়ে GitHub Pages-এ ডিপ্লয় হবে।

1. **GitHub-এ নতুন repo খুলুন** (যেমন `mcq-shuffler-pro`) — Public রাখলে Pages ফ্রি।
2. **remote যোগ করে push করুন:**
   ```bash
   git remote add origin git@github.com:<username>/<repo>.git
   git push -u origin main
   ```
3. **Pages সোর্স সেট করুন:** repo-র **Settings → Pages → Build and deployment → Source: GitHub Actions** সিলেক্ট করুন।
4. **ওয়ার্কফ্লো অটো রান হবে** — push করার পরই Actions ট্যাবে "Deploy to GitHub Pages" চলবে (প্রথমবার Settings → Pages-এ Source সেট করা থাকতে হবে, নাহলে permission error আসতে পারে)। চাইলে Actions ট্যাব থেকে **Run workflow** দিয়ে ম্যানুয়ালি চালানোও যায়।
5. **লাইভ URL:** `https://<username>.github.io/<repo>/`
   - repo-র নাম **`<username>.github.io`** হলে সাইট রুট-ডোমেইনে চলবে: `https://<username>.github.io/` (ওয়ার্কফ্লো নিজেই base path খালি সেট করে)।
   - অন্য নাম হলে সাবপাথ (`/<repo>/`) ওয়ার্কফ্লো অটো কম্পিউট করে বিল্ডে বসায় — কিছু করতে হয় না।
6. **কাস্টম ডোমেইন (ঐচ্ছিক):** Settings → Pages → Custom domain-এ ডোমেইন দিন এবং DNS-এ CNAME রেকর্ড যোগ করুন; কাস্টম ডোমেইনেও সাইট রুট-পাথেই চলবে।

## স্ট্যাটিক-বিল্ড লোকাল যাচাই

```bash
# সাবপাথ-সহ (প্রজেক্ট-সাইট হিসেবে) বিল্ড:
STATIC_EXPORT=1 NEXT_PUBLIC_BASE_PATH=/mcq-shuffler-pro npx next build
# Next.js 16-তে এক্সপোর্ট সাইট .next-static/-এ লেখে; GitHub Pages আর্টিফ্যাক্ট এটাই:
ls .next-static/index.html
```

> নোট: Next.js 16-এ `output: "export"` + কাস্টম `distDir` দিলে এক্সপোর্ট আউটপুট সেই `distDir`-এই লেখা হয়; ওয়ার্কফ্লো এটিকে `out/`-এ এনে `.nojekyll` বসিয়ে আপলোড করে।

## টেক স্ট্যাক

Next.js 16 (App Router, Turbopack) + Tailwind CSS v4 + shadcn/ui + TypeScript। ফন্ট: Kalpurush ও SutonnyMJ (`next/font/local` দিয়ে এমবেড)।
