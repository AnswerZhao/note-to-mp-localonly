#!/bin/bash

npm install
npm run build

#替换成你自己的 Obsidian 的
obsidian_repo="$HOME/Documents/obsidian/mynotes/"

obsidian_note2mp="${obsidian_repo}.obsidian/plugins/note-to-mp"


cp main.js ${obsidian_note2mp}/main.js
cp manifest.json ${obsidian_note2mp}/manifest.json
cp styles.css ${obsidian_note2mp}/styles.css

cp -r assets ${obsidian_note2mp}

echo "已经同步插件 NoteToMPLocal 配置到你的 Obsidian 仓库: ${obsidian_note2mp}"