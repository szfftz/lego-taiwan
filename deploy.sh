#!/bin/bash
# 建置後把 dist/ 推到 gh-pages 分支（同 K30DayMapChallenge-2026 的做法）
set -e

echo "📦 建置專案..."
npm run build

cd dist
rm -rf .git
git init -q -b gh-pages
git remote add origin https://github.com/szfftz/lego-taiwan.git
git config user.name "szfftz"
git config user.email "szfftz@users.noreply.github.com"
# gh 的 active 帳號可能不是 szfftz，這裡固定用 szfftz 的 token
git config credential.https://github.com.helper ""
git config --add credential.https://github.com.helper '!f() { test "$1" = get && echo username=x-access-token && echo "password=$(gh auth token -u szfftz)"; }; f'
# 讓 GitHub Pages 不要用 Jekyll 處理
touch .nojekyll
git add -A
git commit -q -m "Deploy to GitHub Pages - $(date +'%Y-%m-%d %H:%M:%S')"

echo "📤 推送到 gh-pages 分支..."
git push -f origin gh-pages
rm -rf .git
cd ..

echo "✅ 部署完成！幾分鐘內會更新：https://szfftz.github.io/lego-taiwan/"
