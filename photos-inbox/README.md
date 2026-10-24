# 照片收件匣

照片放進 `photos-inbox/<地點名稱>/`，例如 `photos-inbox/小油坑/`（HEIC、JPG、PNG 都可以），**照平常一樣 commit + push 就好**。

commit 時 pre-commit hook（`.githooks/pre-commit`）會自動：

1. 依資料夾名稱查地點 id，把照片壓縮、去掉 GPS，放進 `static/adventure-map/photos/<id>/`
2. 這次 commit 只帶壓縮版，原圖移到 `_done/`（只留在本機，不會上傳）

- **說明（選填）**：同資料夾放 `說明.txt`，每行「原檔名 說明」，例如 `IMG_1234.HEIC 霧太大什麼都沒看到`
- **沒處理**：資料夾留在原地並出現 `處理失敗.txt` 寫原因；常見是同名地點不只一個，把資料夾改成「`361 小油坑`」指定 id 再 commit 一次
- 用名稱查地點需要專案根目錄 `.env` 有 `DATING_MAP_PASSPHRASE`
- 換新電腦 clone 後要先執行一次 `git config core.hooksPath .githooks`
