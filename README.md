# aws-tts-api

Museの返答テキストをAmazon Pollyで日本語MP3に変換するAPI。
API Gateway REST API → Lambda（Node.js 24 / ARM64）→ Polly。

## ツールチェイン

shuntaka-dev/mainに合わせてBun、TypeScript、tsx、Vitest、esbuild、CDK v2を使用。
Node.jsとBunの指定は`.node-version`、`.bun-version`を参照。依存関係は`bun.lock`で固定。

```bash
bun install --frozen-lockfile
bun run type-check
bun run test
bun run lint
bun run synth
```

## デプロイ

AWS認証を設定したシェルで実行する。デフォルトリージョンは東京。
初回のみ対象アカウント・リージョンをCDK bootstrapする。

```bash
export AWS_PROFILE=your-profile
export AWS_REGION=ap-northeast-1
bun run cdk bootstrap
bun run diff
bun run deploy
```

出力の`TtsEndpoint`が接続先、`ApiKeyId`がAPIキーのID。
値はAPI Gatewayコンソール、または権限を持つAWS CLIで取得する。

```bash
export TTS_ENDPOINT='https://example.execute-api.ap-northeast-1.amazonaws.com/v1/tts'
export TTS_API_KEY_ID='出力されたApiKeyId'
export TTS_API_KEY="$(aws apigateway get-api-key --api-key "$TTS_API_KEY_ID" --include-value --query value --output text)"
curl --fail-with-body "$TTS_ENDPOINT" \
  -H "x-api-key: $TTS_API_KEY" \
  -H 'Content-Type: application/json' \
  -H 'Accept: audio/mpeg' \
  --data '{"text":"こんにちは。今日も良い一日を。"}' \
  --output reply.mp3
```

## API

`POST /tts`に`{"text":"読み上げる文章"}`を送信。
`x-api-key`、`Content-Type: application/json`、`Accept: audio/mpeg`が必要。
本文は最大16KiB、前後の空白を除いたテキストは1〜1,000 Unicodeコードポイント。
SSMLは使用せず、プレーンテキストとして合成する。
成功時は`audio/mpeg`（16kHz・モノラル）、エラー時はJSON。
400: 入力不正、413: サイズ超過、415: Content-Type不正、502: Polly処理失敗。
API Gateway側でもキー不正の403、スロットリング時の429などが返る。

Lambda環境変数はCDKで`POLLY_VOICE_ID=Kazuha`、`POLLY_ENGINE=neural`を指定。
変更時は対応する声とエンジンを組み合わせる。AWSアクセスキーは本体に保存せず、Lambda実行ロールにPolly呼び出し権限を付与する。

## APIキーについて

この構成は希望されたAPI Gateway標準のAPIキー必須設定とUsage Planを使用する。
AWSはAPIキーを利用量管理用と位置づけており、認証・認可への使用を推奨していない。
認証が必要な運用ではIAM、Cognito、Lambda Authorizerなどを追加する。
https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-api-usage-plans.html

1キーあたり1リクエスト/秒（バースト2）、月1,000リクエストのクォータ。
これらはベストエフォートで、厳密な課金上限ではない。Polly・Lambda・API Gateway等の料金が発生する。
会話本文とキーはアプリケーションログに出力しない。Lambdaログは7日保持、スタック削除時に削除。

## Core2への接続

SDKの`start_tts()`から、Museの返答テキストをこのAPIへHTTPS POSTする処理を追加する。
受け取ったMP3を既存のデコーダーへ渡す。エンドポイント設定だけでは動かない。
このリポジトリはAWS側のAPIのみを含み、ファームウェア変更・実機検証は別途必要。
現在の実装は音声全体の生成を待って返すため、ストリーミング再生開始の最適化は未対応。

## ローカルで試す

デプロイせずに本番と共通の入力検証・Polly処理をHTTP経由で呼び出せる。

### 本物のPollyで日本語を合成

`polly:SynthesizeSpeech`権限のあるAWS認証を設定して起動する。

```bash
AWS_PROFILE=your-profile AWS_REGION=ap-northeast-1 bun run dev
```

別のターミナルから日本語音声を取得して再生する。

```bash
curl --fail-with-body http://127.0.0.1:3000/tts \
  -H 'x-api-key: local-dev-key' \
  -H 'Content-Type: application/json' \
  -H 'Accept: audio/mpeg' \
  --data '{"text":"こんにちは"}' --output reply.mp3
afplay reply.mp3
```

CDKのデプロイは不要だがPollyの料金は発生する。
SDKの標準認証情報チェーンを利用するため、SSOプロファイルの場合は先にログインする。
`POLLY_VOICE_ID`と`POLLY_ENGINE`で声・エンジンも変更可能。

### 同じLANのCore2からアクセス

```bash
HOST=0.0.0.0 TTS_API_KEY='自分で設定した開発用キー' bun run dev
```

Core2にはMacのLAN IPを使った`http://<MacのIP>:3000/tts`と開発用キーを設定する。
`PORT`でポート変更も可能。ファイアウォールで接続を許可する必要がある場合がある。
ローカルサーバーはHTTPなので信頼できる開発用LANのみで使う。本番はAPI GatewayのHTTPSを使う。
クォータ・スロットリングやAWS側の権限判定はローカルでは再現しない。
終了はCtrl+C。
