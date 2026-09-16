#!/usr/bin/env bash
# ============================================================
# নতুন GitHub repo-তে push স্ক্রিপ্ট — এক কমান্ডে সব
# ব্যবহার: নিচের REPO ভেরিয়েবলটা বদলে চালান
#   bash scripts/push-new-repo.sh
# ============================================================
# ধাপ ১: GitHub-এ খালি নতুন repo তৈরি করুন (README/license ছাড়া খালি):
#   https://github.com/new → নাম দিন (যেমন: mcq-shuffler-pro) → Create
#
# ধাপ ২: নিচের REPO-তে সেই নাম বসান, তারপর এই স্ক্রিপ্ট চালান।
# Git push-এর সময় GitHub নিজেই লগইন চাইবে (browser/CLI auth)।
# ============================================================

set -euo pipefail

# ⬇️ এখানে নতুন repo-র নাম বসান (GitHub username ঠিক আছে কিনা দেখে নিন)
REPO="mcq-shuffler-pro"
USER="afnan-samin"

cd "$(dirname "$0")/.."

URL="https://github.com/${USER}/${REPO}.git"

# রিমোট সেট (আগে থাকলে আপডেট)
if git remote get-url newrepo >/dev/null 2>&1; then
  git remote set-url newrepo "$URL"
else
  git remote add newrepo "$URL"
fi

echo "→ Pushing main → ${URL}"
git push -u newrepo main

echo ""
echo "✅ Push সম্পন্ন! এখন শুধু GitHub Pages চালু করুন:"
echo "   1. https://github.com/${USER}/${REPO}/settings/pages"
echo "   2. Source: GitHub Actions বাছুন"
echo "   3. Actions ট্যাবে বিল্ড সবুজ হলে সাইট লাইভ:"
echo "      https://${USER}.github.io/${REPO}/"
echo ""
echo "লক্ষ্য: deploy workflow repo-নাম নিজে থেকেই ধরে নেয় —"
echo "যে নামই দেন, basePath অটো-সেট হবে (কিছু বদলাতে হবে না)।"
