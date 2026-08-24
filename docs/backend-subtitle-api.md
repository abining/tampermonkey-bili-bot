# 字幕后端 API 约定

油猴脚本优先从 B站播放器和字幕接口获取字幕。只有两种方式都未命中、并且用户启用了“字幕后端”时，才调用此接口。

推荐让前端发送 `BVID + CID + P`，由后端负责下载当前分集、提取音频并执行语音识别。不要让浏览器上传完整视频文件，这会引入登录态、跨域、带宽和断点续传问题。

## 创建字幕任务

用户在设置页填写的是完整任务地址，例如：

```text
POST https://example.com/v1/subtitle-jobs
Authorization: Bearer <可选 API Key>
Content-Type: application/json
```

Bearer 密钥只会发送到任务地址的同源 URL。若 `status_url` 或 `subtitle_url` 指向其他域名，脚本不会向该域名转发密钥；跨域字幕文件应使用无需额外鉴权的短期签名 URL。

请求体：

```json
{
  "version": 1,
  "input": {
    "type": "bilibili",
    "bvid": "BVxxxxxxxxxx",
    "cid": "123456789",
    "aid": "987654321",
    "page": 4
  },
  "video": {
    "platform": "bilibili",
    "bvid": "BVxxxxxxxxxx",
    "cid": "123456789",
    "aid": "987654321",
    "page": 4,
    "page_url": "https://www.bilibili.com/video/BVxxxxxxxxxx?p=4",
    "title": "视频标题",
    "part_title": "当前分集标题",
    "duration": 1200
  },
  "output": {
    "language": "zh-CN",
    "timestamps": true,
    "preferred_format": "json",
    "accepted_formats": ["json", "srt", "text"]
  }
}
```

如果设置为“页面链接”模式，`input` 改为：

```json
{
  "type": "url",
  "url": "https://www.bilibili.com/video/BVxxxxxxxxxx?p=4"
}
```

脚本会把页面链接规范化为 `https://www.bilibili.com/video/<BVID>?p=<当前分集>`，不会把页面上的跟踪参数发送给后端。

## 直接返回字幕

后端可以直接返回带时间轴的 JSON：

```json
{
  "status": "completed",
  "transcript": "完整字幕文本",
  "segments": [
    { "from": 0.2, "to": 3.8, "content": "第一句字幕" }
  ]
}
```

也可以直接返回纯文本、SRT，或者返回字幕文件地址：

```json
{
  "status": "completed",
  "subtitle_url": "https://example.com/files/job-123.srt"
}
```

## 异步任务

创建任务后返回：

```json
{
  "status": "queued",
  "job_id": "job-123",
  "status_url": "https://example.com/v1/subtitle-jobs/job-123"
}
```

脚本会按照设置中的轮询间隔请求 `status_url`。如果没有返回 `status_url`，脚本会请求：

```text
GET <任务提交地址>/<job_id>
```

处理中：

```json
{
  "status": "processing",
  "job_id": "job-123"
}
```

完成时返回 `transcript + segments` 或 `subtitle_url`。失败时返回：

```json
{
  "status": "failed",
  "error": "视频下载失败"
}
```

脚本兼容以下状态：

- 等待/处理中：`accepted`、`pending`、`queued`、`processing`、`running`、`transcribing`
- 失败：`error`、`failed`、`rejected`、`canceled`

## 后端实现建议

后端的处理链路建议为：

1. 校验请求和鉴权。
2. 根据 `BVID/CID/P` 或页面 URL 下载准确的当前分集。
3. 使用 FFmpeg 提取单声道音频。
4. 调用 Whisper、FunASR 或其他 ASR 服务。
5. 保存 JSON/SRT 字幕并返回结果。
6. 使用任务 ID 去重，避免同一分集重复转写。

建议以 `bvid + cid + page` 作为任务和缓存键，不能只使用 BVID，否则多 P 视频仍会串集。
