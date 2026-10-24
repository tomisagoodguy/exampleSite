# 照片收件匣

1. 照片放進 `photos-inbox/<地點名稱>/`，例如 `photos-inbox/小油坑/`（HEIC、JPG、PNG 都可以）
2. 要寫說明就在同資料夾放 `說明.txt`，每行「原檔名 說明」：

   ```text
   IMG_1234.HEIC 霧太大什麼都沒看到
   IMG_1240.HEIC 硫磺味好重
   ```

3. 執行 `uv run scripts/add-photos.py`，壓縮後的照片會放進 `static/adventure-map/photos/<地點 id>/`
4. commit + push，約 2 分鐘後上線

- 用名稱查地點要在專案根目錄的 `.env` 寫一行 `DATING_MAP_PASSPHRASE=<破關地圖密碼>`
- 同名地點不只一個時，腳本會列出候選，把資料夾改成「`361 小油坑`」直接指定 id
- 處理完的原圖移到 `_done/`，不會刪除；這個資料夾除了本說明外都不進 git
