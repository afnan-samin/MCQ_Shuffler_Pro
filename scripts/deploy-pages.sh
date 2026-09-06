#!/usr/bin/env bash
# ============================================================
# MCQ Shuffler Pro — GitHub Pages deploy (workflow ছাড়া)
# ব্যবহার:  bash scripts/deploy-pages.sh ghp_XXXXXXXXXXXX
# কাজ:
#   1. টোকেন যাচাই
#   2. .next-static/ → orphan `gh-pages` branch → force push
#   3. Pages API দিয়ে gh-pages (root) সোর্স সেট
#   4. লাইভ URL পোল করে সফল হলে লিংক প্রিন্ট
# টোকেন কোনো tracked ফাইলে/config-এ জমা হয় না — শেষে পরিষ্কার।
# ============================================================
set -euo pipefail

REPO="afnan-samin/MCQ_Shuffler_Pro"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILD_DIR="$ROOT/.next-static"
DEPLOY_DIR="$ROOT/.gh-pages-deploy"
LIVE_URL="https://afnan-samin.github.io/MCQ_Shuffler_Pro/"
TOKEN="${1:-}"

[ -n "$TOKEN" ] || { echo "❌ টোকেন দিন:  bash scripts/deploy-pages.sh ghp_XXXX"; exit 1; }
[ -d "$BUILD_DIR" ] || { echo "❌ আগে বিল্ড করুন: STATIC_EXPORT=1 NEXT_PUBLIC_BASE_PATH=/MCQ_Shuffler_Pro npx next build"; exit 1; }

echo "1/4 টোকেন যাচাই..."
CODE=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: token $TOKEN" "https://api.github.com/repos/$REPO")
[ "$CODE" = "200" ] || { echo "❌ টোকেন অবৈধ/মেয়াদ-উত্তীর্ণ (HTTP $CODE)। নতুন টোকেন নিন: github.com/settings/tokens/new (classic, 'repo' scope)"; exit 1; }
echo "   ✓ টোকেন ঠিক আছে"

echo "2/4 gh-pages branch তৈরি + push..."
rm -rf "$DEPLOY_DIR" && mkdir -p "$DEPLOY_DIR"
cp -r "$BUILD_DIR/." "$DEPLOY_DIR/"
touch "$DEPLOY_DIR/.nojekyll"
cd "$DEPLOY_DIR"
git init -q -b gh-pages .
git add -A
git commit -qm "deploy: static export $(date -u '+%Y-%m-%d %H:%M UTC')"
git push -qf "https://$TOKEN@github.com/$REPO.git" gh-pages
cd "$ROOT"
rm -rf "$DEPLOY_DIR"   # টোকেন-যুক্ত .git ডিস্ক থেকেও মুছে ফেলা
echo "   ✓ gh-pages push সম্পন্ন"

echo "3/4 Pages সেটিং (সোর্স: gh-pages / root)..."
EXIST=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: token $TOKEN" "https://api.github.com/repos/$REPO/pages")
BODY='{"source":{"branch":"gh-pages","path":"/"}}'
if [ "$EXIST" = "404" ]; then
  curl -s -X POST -H "Authorization: token $TOKEN" -H "Accept: application/vnd.github+json" \
    "https://api.github.com/repos/$REPO/pages" -d "$BODY" | grep -qE '"(status|html_url|source)"' \
    && echo "   ✓ Pages চালু হলো" || echo "   ⚠ Pages POST রেসপন্স যাচাই করুন"
else
  curl -s -X PUT -H "Authorization: token $TOKEN" -H "Accept: application/vnd.github+json" \
    "https://api.github.com/repos/$REPO/pages" -d "$BODY" > /dev/null && echo "   ✓ Pages সোর্স আপডেট হলো"
fi

echo "4/4 লাইভ হওয়া পর্যন্ত অপেক্ষা (সাধারণত ১–৩ মিনিট)..."
for i in $(seq 1 30); do
  HTTP=$(curl -s -o /dev/null -w "%{http_code}" -L "$LIVE_URL")
  if [ "$HTTP" = "200" ]; then
    echo ""
    echo "🎉 লাইভ: $LIVE_URL"
    exit 0
  fi
  echo "   ...$HTTP (চেষ্টা $i/30)"
  sleep 10
done
echo "⚠ Push হয়েছে কিন্তু URL এখনো 200 হয়নি — ২-৩ মিনিট পর নিজে দেখুন: $LIVE_URL"
