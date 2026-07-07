#!/usr/bin/env bash
# elgt 安裝腳本（EleGent）——從 GitHub Releases 下載最新的 elgt-darwin-arm64 編譯執行檔，
# 裝到 ~/.local/bin/elgt。目前只支援 macOS（Darwin）arm64（Task 26 build 範圍，
# 見 scripts/build.ts 的 --target=bun-darwin-arm64）。
#
# 用法：curl -fsSL https://raw.githubusercontent.com/<REPO>/main/install.sh | bash
set -euo pipefail

# 換成自己 fork 的 owner/repo 就能安裝自己編譯的版本。
REPO="neokn/EleGent"

INSTALL_DIR="${HOME}/.local/bin"
BIN_NAME="elgt"
ASSET_NAME="elgt-darwin-arm64"

os="$(uname -s)"
arch="$(uname -m)"

if [[ "${os}" != "Darwin" || "${arch}" != "arm64" ]]; then
  echo "錯誤：elgt 目前只提供 macOS (Darwin) arm64 的編譯執行檔。" >&2
  echo "偵測到的環境是 ${os} ${arch}。" >&2
  echo "如需其他平台，請自行從原始碼跑 \`bun run build\`（見 scripts/build.ts）。" >&2
  exit 1
fi

echo "偵測到 ${os} ${arch}，從 https://github.com/${REPO} 的最新 release 下載 ${ASSET_NAME}..."

mkdir -p "${INSTALL_DIR}"
download_url="https://github.com/${REPO}/releases/latest/download/${ASSET_NAME}"
tmp_file="$(mktemp)"
trap 'rm -f "${tmp_file}"' EXIT

if ! curl -fsSL "${download_url}" -o "${tmp_file}"; then
  echo "錯誤：下載失敗（${download_url}）。請確認 ${REPO} 已發佈過 release，且該 release 附有 ${ASSET_NAME}。" >&2
  exit 1
fi

install_path="${INSTALL_DIR}/${BIN_NAME}"
mv "${tmp_file}" "${install_path}"
chmod +x "${install_path}"
trap - EXIT

echo "已安裝 ${install_path}"

# macOS Gatekeeper 會對「非透過瀏覽器／App Store 下載」的執行檔加上 quarantine
# 屬性，直接執行會被擋下（"cannot be opened because the developer cannot be
# verified"）。curl 下載一般不會被標記，但保險起見主動移除，避免使用者卡關。
if xattr -p com.apple.quarantine "${install_path}" >/dev/null 2>&1; then
  xattr -d com.apple.quarantine "${install_path}"
  echo "已移除 macOS quarantine 屬性"
fi

case ":${PATH}:" in
  *":${INSTALL_DIR}:"*)
    echo "elgt 已安裝完成，可直接執行 \`elgt version\` 驗證。"
    ;;
  *)
    echo
    echo "注意：${INSTALL_DIR} 不在你的 PATH 裡。請把以下這行加進你的 shell 設定檔"
    echo "（~/.zshrc、~/.bashrc 等）："
    echo
    echo "    export PATH=\"${INSTALL_DIR}:\$PATH\""
    echo
    echo "設定完成後重開一個新 shell，再執行 \`elgt version\` 驗證安裝。"
    ;;
esac
