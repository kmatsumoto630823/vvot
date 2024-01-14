※名称が有名なマルウェアとかぶってるので変更を検討中  

# zBot
音声変換にVOICEVOXを利用したDiscord用読み上げ（TTS）Bot  
複数のサーバー（ギルド）でも動作するように設計してますが、基本はサーバーごとにBotを用意してください  
VOICEVOXエンジン側は大量のリクエストを想定していないので、パブリックに公開する用途で使う場合は冗長化するなりLB挟むなりして各自対策してください

※VOICEVOXのエンジンは付属しません、各自で用意してください  
※DiscordのBotアカウントも各自で用意してください  

# Help(slach commnad)
/connect  
　・・・zBotを接続します  
/list  
　・・・話者IDの一覧を表示します  
/speaker  
　・・・話者を変更します  
/random  
　・・・話者をランダムに変更します  
/dict  
　・・・単語または絵文字の読みを辞書登録します  
/reaction  
　・・・リアクションスタンプ読み上げの有効・無効を切り替えます  
/export  
　・・・zBotの設定をエクスポートします  
/disconnect  
　・・・zBotを切断します  
/help  
　・・・ヘルプを表示します  

# Dependencies
- Redhat Enterprise Linux 9（Windows上ではまだ上手くいってない）
- Node.js v20
- NPM Packages
  - "@discordjs/opus"
  - "@discordjs/voice"
  - "axios"
  - "discord.js"
  - "dotenv"
  - "ffmpeg-static"
  - "sodium"

@discordjs/voiceの依存パッケージは代替できるものがあるので各自の判断で読み替えること  
https://discordjs.guide/voice/#extra-dependencies

# Install
node.js環境を用意  
Bot用のディレクトリ作成※以降はこのディレクトリで作業  
gitコマンドでファイル一式を配置  
必要なパッケージをnpmコマンドで導入  
ディレクトリ「guild_configs」と「guild_dictionaries」を作成  
env_sampleを参考にご各自の環境に適した.envを作成  
node zBot.jsでBotを実行してください  

Linux上での実行例
```
$ mkdir your_bot_dir
$ cd your_bot_dir
$ git clone https://github.com/kmatsumoto630823/zbot .

$ npm install discord.js
$ npm install @discordjs/voice
$ npm install @discordjs/opus
$ npm install ffmpeg-static
$ npm install sodium
$ npm install axios
$ npm install dotenv

$ mkdir guild_configs
$ mkdir guild_dictionaries
$ cp env_sample .env
$ vi .env
```

viが立ち上がるので各自の環境に合わせて編集してください  
tokenにはBotアカウントのトークンを  
serverIdsには対象サーバーのIDをセミコロン区切りで記載  
voiceServersにはhttp://[ホスト名]:[ポート]?engine=[エンジン名]の形で記載  
※VOICEVOX互換のAPIならセミコロン区切りで複数指定可能、[エンジン名]は内部的な識別に使うので同じものを指定しないでください
```
# Edit and Rename ".env"
token = "Your token"
serverIds = "Your server IDs separated by semicolon(;)"

# voiceServers = "http://localhost:50021?engine=VOICEVOX;http://localhost:50025?engine=SHAREVOX"
voiceServers = "http://localhost:50021?engine=VOICEVOX"

voiceServerTextLengthLimit = 128

# VOICEVOX:ずんだもん（ノーマル）
defaultSpeakerEngine = "VOICEVOX"
defaultSpeakerId = 3

speakerSpeedScaleUpperLimit = 1.50
speakerSpeedScaleLowerLimit = 0.50

speakerPitchScaleUpperLimit = 0.15
speakerPitchScaleLowerLimit = -0.15

samplingRate = 48000

serverConfigsDir = "./guild_configs"
serverDictionaryDir = "./guild_dictionaries"
```

準備ができたら実行
```
$ node zBot.js
```

# Author
kmatsumoto630823

k.matsumoto.s630823@gmail.com

何かありましたらこのメール宛てにでも

# License
MIT License

詳細はLicenseファイルをお読みください

