#!/bin/zsh
cd /private/tmp/claude-502/-Users-tiennguyen-Documents-Game-Mamamy/1d12604c-ace4-4609-8a32-883b1e7441fd/scratchpad
p=$(python3 tteh.py call interact_by_dsl "{\"intention\":\"record demo\",\"commands\":[{\"commandType\":\"reset_preview\"},{\"commandType\":\"record_preview_video_mp4\",\"params\":{\"duration_seconds\":$2}}]}" | grep -o '/var/folders[^"]*mp4'); sleep 5; cp "$p" "$1"
