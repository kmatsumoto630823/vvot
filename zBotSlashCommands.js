require("dotenv").config();

const envVoiceServers = process.env.voiceServers;

const envSpeakerSpeedScaleUpperLimit = Number(process.env.speakerSpeedScaleUpperLimit);
const envSpeakerSpeedScaleLowerLimit = Number(process.env.speakerSpeedScaleLowerLimit);

const envSpeakerPitchScaleUpperLimit = Number(process.env.speakerPitchScaleUpperLimit);
const envSpeakerPitchScaleLowerLimit = Number(process.env.speakerPitchScaleLowerLimit);

const envSpeakerIntonationScaleUpperLimit = Number(process.env.speakerIntonationScaleUpperLimit);
const envSpeakerIntonationScaleLowerLimit = Number(process.env.speakerIntonationScaleLowerLimit);

const envSpeakerVolumeScaleUpperLimit = Number(process.env.speakerVolumeScaleUpperLimit);
const envSpeakerVolumeScaleLowerLimit = Number(process.env.speakerVolumeScaleLowerLimit);

const envAutocompleteLimit = parseInt(process.env.autocompleteLimit);

const { getVoiceConnection } = require("@discordjs/voice");
const { joinVoiceChannel } = require("@discordjs/voice");
const { createAudioPlayer, NoSubscriberBehavior } = require("@discordjs/voice");

const { ApplicationCommandOptionType } = require('discord.js');
const { ChannelType } = require('discord.js');

const { AttachmentBuilder } = require("discord.js");

const zBotTextPreprocessor = require("./zBotTextPreprocessor");
const zBotTextToSpeech = require("./zBotTextToSpeech");

const { setTimeout } = require("timers/promises");

const zBotSlashCommands = [
    {
        "name": "connect",
        "description": "ボットを接続します",
        "options": [
            {
                "type": ApplicationCommandOptionType.Channel,
                "channel_types": [ChannelType.GuildText],
                "name": "text",
                "description": "読み上げ「元」の「テキスト」チャンネルを選択してください",
                "required": true
            },
            
            {
                "type": ApplicationCommandOptionType.Channel,
                "channel_types": [ChannelType.GuildVoice],
                "name": "voice",
                "description": "読み上げ「先」の「ボイス」チャンネルを選択してください",
                "required": true
            }
        ],

        "excute": async function(interaction, zBotGData){
            const guildId = interaction.guildId;

            const textCannelId = interaction.options.getChannel("text").id;
            const voiceCannelId = interaction.options.getChannel("voice").id;
            const adapterCreator = interaction.guild.voiceAdapterCreator;
    
            //const { joinVoiceChannel } = require("@discordjs/voice");
            const connection = joinVoiceChannel({
                "channelId": voiceCannelId,
                "guildId": guildId,
                "adapterCreator": adapterCreator
            });
    
            if(!connection){
                await interaction.reply("接続に失敗しました");
                return;
            }
    
            //const { createAudioPlayer, NoSubscriberBehavior } = require("@discordjs/voice");
            const player = createAudioPlayer({
                "behaviors": {
                  "noSubscriber": NoSubscriberBehavior.Pause,
                },
            });
    
            if(!player){
                connection.destroy();

                await interaction.reply("プレイヤーの生成に失敗しました");
                return;
            }
    
            const subscribe = connection.subscribe(player);

            if(!subscribe){
                connection.destroy();
                
                await interaction.reply("音声チャンネルへのプレイヤーの接続に失敗しました");
                return;
            }            
    
            const guildConfig = zBotGData.restoreConfig(guildId);
            guildConfig.textChannelId = textCannelId;
            //guildConfig.voiceChannelId = voiceCannelId;

            zBotGData.restoreDictionary(guildId);
            zBotGData.initGuildQueueIfUndefined(guildId);

            await interaction.reply("こんにちは!zBotを接続しました");
            return;            
        }
    },

    {
        "name": "list",
        "description": "話者IDの一覧を表示します",

        "excute": async function(interaction, zBotGData){
            let list = "";

            const speakers = await getSpeakersWithStyles();

            if(!speakers){
                await interaction.reply("話者IDの一覧を作成に失敗しました");
                return;
            };

            for(const speaker of speakers){
                list += speaker.fqn + "\r\n";
            }
 
            const buffer = Buffer.from(list);
            //const { AttachmentBuilder } = require("discord.js");
            const attachment = new AttachmentBuilder(buffer, { "name": "speakers.txt" });

            await interaction.reply({ "content": "話者IDの一覧を作成しました", "files": [attachment] });
            return;
        }
    },

    {
        "name": "speaker",
        "description": "話者を変更します",
        "options": [
            {
                "type": ApplicationCommandOptionType.String,
                "name": "speaker",
                "description": `話者を「エンジン名(省略可)/話者名(省略可)/ID」の形式で指定、または候補から選択してください※候補表示の上限が${envAutocompleteLimit}のためをキーワードで絞り込んでください`,
                "required": true,
                "autocomplete": true
            }
        ],
        
        "excute": async function(interaction, zBotGData){
            const guildId = interaction.guildId;
        
            //const { getVoiceConnection } = require("@discordjs/voice");
            const connection = getVoiceConnection(guildId);
        
            if(!connection){
                await interaction.reply("まだ部屋にお呼ばれされてません・・・");
                return;
            }

            const [speakerEngine, speakerName, speakerId] = 
                interaction.options.getString("speaker").trim().split("/");
        
            const speakers = await getSpeakersWithStyles();

            const speaker = speakers.find(
                (x) => {
                    if(speakerEngine !== x.engine && speakerEngine) return false;
                    if(speakerName !== `${x.speakerName}(${x.styleName})` && speakerName) /*return false*/;
                    if(parseInt(speakerId) !== x.id) return false;
                    
                    return true;
                }
            );

            if(!speaker){
                await interaction.reply("話者の指定が不正です");
                return;                
            }

            const memberId = interaction.member.id;
            const memberName = interaction.member.displayName + "さん";

            const memberSpeakerConfig = zBotGData.initMemberSpeakerConfig(guildId, memberId);

            memberSpeakerConfig.engine = speaker.engine;
            memberSpeakerConfig.id = speaker.id;

            const message = `${memberName}の話者を「${speaker.fqn}」に変更しました`;
        
            await interaction.reply(message);
            return;
        },

        "autocomplete": async function(interaction, zBotGData){
            const focusedOption = interaction.options.getFocused(true);

            if(focusedOption.name !== "speaker"){
                await interaction.respond([]);
                return;
            }
        
            const speakers = await getSpeakersWithStyles();
        
            if(!speakers){
                await interaction.respond([]);
                return;               
            }

            const value = focusedOption.value ?? "";

            const keywords = value.trim().split("/");

            const filtered = speakers.filter(
                (x) => {
                    for(const keyword of keywords){
                        if(!x.fqn.includes(keyword)){
                            return false;
                        }
                    }

                    return true;
                }
            );

            const choices = filtered.map(
                (x) => ({ "name": x.fqn, "value": x.fqn })
            );
        
            if(choices.length > envAutocompleteLimit){
                choices.length = envAutocompleteLimit;         
            }

            await interaction.respond(choices);
            return;        
        }

    },

    {
        "name": "random",
        "description": "話者をランダムに変更します",
        
        "excute": async function(interaction, zBotGData){
            const guildId = interaction.guildId;
        
            //const { getVoiceConnection } = require("@discordjs/voice");
            const connection = getVoiceConnection(guildId);
        
            if(!connection){
                await interaction.reply("まだ部屋にお呼ばれされてません・・・");
                return;
            }
        
            const memberId = interaction.member.id;
            const memberName = interaction.member.displayName + "さん" ;
        
            const speakers = await getSpeakersWithStyles();
        
            if(!speakers){
                await interaction.reply("話者IDの一覧を作成に失敗しました");
                return;
            };

            const randomNumber = Math.floor(Math.random() * speakers.length);
            const speaker = speakers[randomNumber];

            const memberSpeakerConfig = zBotGData.initMemberSpeakerConfig(guildId, memberId);

            memberSpeakerConfig.engine = speaker.engine;
            memberSpeakerConfig.id = speaker.id;
        
            const message = `${memberName}の話者を「${speaker.fqn}」に変更しました`;
        
            await interaction.reply(message);
            return;
        }
    },

    {
        "name": "speed",
        "description": "話者の話速を変更します",
        "options": [
            {
                "type": ApplicationCommandOptionType.Number,
                "name": "scale",
                "description": `話者の話速倍率を入力してください※範囲は${envSpeakerSpeedScaleLowerLimit}～${envSpeakerSpeedScaleUpperLimit}`,
                "max_value": envSpeakerSpeedScaleUpperLimit,
                "min_value": envSpeakerSpeedScaleLowerLimit,
                "required": true
            }
        ],

        "excute": async function(interaction, zBotGData){
            const guildId = interaction.guildId;
        
            //const { getVoiceConnection } = require("@discordjs/voice");
            const connection = getVoiceConnection(guildId);
        
            if(!connection){
                await interaction.reply("まだ部屋にお呼ばれされてません・・・");
                return;
            }

            const memberId = interaction.member.id;
            const memberName = interaction.member.displayName + "さん";

            const memberSpeakerConfig = zBotGData.initMemberSpeakerConfigIfUndefined(guildId, memberId);

            const currentScale = memberSpeakerConfig.speedScale;

            const scale = clamp(
                interaction.options.getNumber("scale") ?? currentScale,
                this.options[0].min_value,
                this.options[0].max_value
            );

            memberSpeakerConfig.speedScale = scale;
         
            const message = 
                memberName + "の話者を「" +
                    "#話速:" + String(memberSpeakerConfig.speedScale     ) + " " + 
                    "#音高:" + String(memberSpeakerConfig.pitchScale     ) + " " +
                    "#抑揚:" + String(memberSpeakerConfig.intonationScale) + " " +
                    "#音量:" + String(memberSpeakerConfig.volumeScale    ) +
                "」に変更しました"
            ;
        
            await interaction.reply(message);
            return;
        }
    },

    {
        "name": "pitch",
        "description": "話者の音高を変更します",
        "options": [
            {
                "type": ApplicationCommandOptionType.Number,
                "name": "scale",
                "description": `話者の音高倍率を入力してください※範囲は${envSpeakerPitchScaleLowerLimit}～${envSpeakerPitchScaleUpperLimit}`,
                "max_value": envSpeakerPitchScaleUpperLimit,
                "min_value": envSpeakerPitchScaleLowerLimit,
                "required": true
            }
        ],

        "excute": async function(interaction, zBotGData){
            const guildId = interaction.guildId;
        
            //const { getVoiceConnection } = require("@discordjs/voice");
            const connection = getVoiceConnection(guildId);
        
            if(!connection){
                await interaction.reply("まだ部屋にお呼ばれされてません・・・");
                return;
            }

            const memberId = interaction.member.id;
            const memberName = interaction.member.displayName + "さん";

            const memberSpeakerConfig = zBotGData.initMemberSpeakerConfigIfUndefined(guildId, memberId);

            const currentScale = memberSpeakerConfig.pitchScale;

            const scale = clamp(
                interaction.options.getNumber("scale") ?? currentScale,
                this.options[0].min_value,
                this.options[0].max_value
            );

            memberSpeakerConfig.pitchScale = scale;

            const message = 
                memberName + "の話者を「" +
                    "#話速:" + String(memberSpeakerConfig.speedScale     ) + " " + 
                    "#音高:" + String(memberSpeakerConfig.pitchScale     ) + " " +
                    "#抑揚:" + String(memberSpeakerConfig.intonationScale) + " " +
                    "#音量:" + String(memberSpeakerConfig.volumeScale    ) +
                "」に変更しました"
            ;
        
            await interaction.reply(message);
            return;
        }
    },

    {
        "name": "intonation",
        "description": "話者の抑揚を変更します",
        "options": [
            {
                "type": ApplicationCommandOptionType.Number,
                "name": "scale",
                "description":`話者の抑揚倍率を入力してください※範囲は${envSpeakerIntonationScaleLowerLimit}～${envSpeakerIntonationScaleUpperLimit}`,
                "max_value": envSpeakerIntonationScaleUpperLimit,
                "min_value": envSpeakerIntonationScaleLowerLimit,
                "required": true
            }
        ],

        "excute": async function(interaction, zBotGData){
            const guildId = interaction.guildId;
        
            //const { getVoiceConnection } = require("@discordjs/voice");
            const connection = getVoiceConnection(guildId);
        
            if(!connection){
                await interaction.reply("まだ部屋にお呼ばれされてません・・・");
                return;
            }

            const memberId = interaction.member.id;
            const memberName = interaction.member.displayName + "さん";

            const memberSpeakerConfig = zBotGData.initMemberSpeakerConfigIfUndefined(guildId, memberId);

            const currentScale = memberSpeakerConfig.intonationScale;

            const scale = clamp(
                interaction.options.getNumber("scale") ?? currentScale,
                this.options[0].min_value,
                this.options[0].max_value
            );

            memberSpeakerConfig.intonationScale = scale;

            const message = 
                memberName + "の話者を「" +
                    "#話速:" + String(memberSpeakerConfig.speedScale     ) + " " + 
                    "#音高:" + String(memberSpeakerConfig.pitchScale     ) + " " +
                    "#抑揚:" + String(memberSpeakerConfig.intonationScale) + " " +
                    "#音量:" + String(memberSpeakerConfig.volumeScale    ) +
                "」に変更しました"
            ;
        
            await interaction.reply(message);
            return;
        }
    },

    {
        "name": "volume",
        "description": "話者の音量を変更します",
        "options": [
            {
                "type": ApplicationCommandOptionType.Number,
                "name": "scale",
                "description": `話者の音量倍率を入力してください※範囲は${envSpeakerVolumeScaleLowerLimit}～${envSpeakerVolumeScaleUpperLimit}`,
                "max_value": envSpeakerVolumeScaleUpperLimit,
                "min_value": envSpeakerVolumeScaleLowerLimit,
                "required": true
            }
        ],

        "excute": async function(interaction, zBotGData){
            const guildId = interaction.guildId;
        
            //const { getVoiceConnection } = require("@discordjs/voice");
            const connection = getVoiceConnection(guildId);
        
            if(!connection){
                await interaction.reply("まだ部屋にお呼ばれされてません・・・");
                return;
            }

            const memberId = interaction.member.id;
            const memberName = interaction.member.displayName + "さん";

            const memberSpeakerConfig = zBotGData.initMemberSpeakerConfigIfUndefined(guildId, memberId);

            const currentScale = memberSpeakerConfig.volumeScale;

            const scale = clamp(
                interaction.options.getNumber("scale") ?? currentScale,
                this.options[0].min_value,
                this.options[0].max_value
            );

            memberSpeakerConfig.volumeScale = scale;

            const message = 
                memberName + "の話者を「" +
                    "#話速:" + String(memberSpeakerConfig.speedScale     ) + " " + 
                    "#音高:" + String(memberSpeakerConfig.pitchScale     ) + " " +
                    "#抑揚:" + String(memberSpeakerConfig.intonationScale) + " " +
                    "#音量:" + String(memberSpeakerConfig.volumeScale    ) +
                "」に変更しました"
            ;
        
            await interaction.reply(message);
            return;
        }
    },

    {
        "name": "dict",
        "description": "単語または絵文字の読みを辞書登録します",
        "options": [
            {
                "type": ApplicationCommandOptionType.String,
                "name": "key",
                "description": "単語または絵文字を入力してください",
                "required": true
            },

            {
                "type": ApplicationCommandOptionType.String,
                "name": "value",
                "description": "読みを入力してください、登録解除する場合は「delete」または「null」と入力してください",
                "required": true
            }
        ],

        "excute": async function(interaction, zBotGData){
            const guildId = interaction.guildId;

            //const { getVoiceConnection } = require("@discordjs/voice");
            const connection = getVoiceConnection(guildId);
    
            if(!connection){
                await interaction.reply("まだ部屋にお呼ばれされてません・・・");
                return;
            }

            let key   = (interaction.options.getString("key")   ?? "").trim();
            let value = (interaction.options.getString("value") ?? "").trim();

            if(key === "" || value === ""){
                await interaction.reply("keyまたはvalueが入力されてません");
                return;
            }

            const guildDictionary = zBotGData.initGuildDictionaryIfUndefined(guildId);
            
            const matches = /^<:[a-zA-Z0-9_]+:([0-9]+)>$/.exec(key);

            if(matches){
                key = `<:CustomEmoji:${matches[1]}>`;
            }
    
            if(value === "delete" || value === "null"){
                if(guildDictionary[key] === void 0){
                    await interaction.reply(`「${key}」は辞書登録されていません`);
                    return;
                }

                delete guildDictionary[key];
                
                await interaction.reply(`「${key}」の辞書登録を解除しました`);
                return;
            }
    
            guildDictionary[key] = value;

            await interaction.reply(`「${key}」を「${value}」に辞書登録しました`);
            return;
        }
    },


    {
        "name": "stealth",
        "description": "隠れてそっと発言します",
        "options": [
            {
                "type": ApplicationCommandOptionType.String,
                "name": "sentence",
                "description": "隠れてそっと発言したいコメントを入力してください",
                "required": true
            },

            {
                "type": ApplicationCommandOptionType.Integer,
                "name": "delay",
                "description": "発言を遅らせたい秒数を指定してください",
                "required": false
            }
        ],

        "excute": async function(interaction, zBotGData){
            const guildId = interaction.guildId;

            //const { getVoiceConnection } = require("@discordjs/voice");
            const connection = getVoiceConnection(guildId);
    
            if(!connection){
                await interaction.reply({ "content": "まだ部屋にお呼ばれされてません・・・", "ephemeral": true });
                return;
            }
            const memberId = interaction.member.id;
            const memberSpeakerConfig = zBotGData.initMemberSpeakerConfigIfUndefined(guildId, memberId);

            const text = (interaction.options.getString("sentence") ?? "").trim();
            const delayTime = interaction.options.getInteger("delay") ?? 0;

            const dictionary = zBotGData.initGuildDictionaryIfUndefined(guildId);
            
            //const zBotTextPreprocessor = require("./zBotTextPreprocessor");
            const splitedText = zBotTextPreprocessor(text, dictionary);
    
            const speaker = memberSpeakerConfig;
            const player = connection.state.subscription.player;
            const queue = zBotGData.initGuildQueueIfUndefined(guildId);

            await interaction.reply({ "content": "隠れてそっと発言します", "ephemeral": true });

            //const { setTimeout } = require("timers/promises");
            await setTimeout(delayTime * 1000);

            //const zBotTextToSpeech = require("./zBotTextToSpeech");
            await zBotTextToSpeech(splitedText, speaker, player, queue);

            return;
        }

    },

    {
        "name": "reaction",
        "description": "リアクションスタンプ読み上げの有効・無効を切り替えます",

        
        "excute": async function(interaction, zBotGData){
            const guildId = interaction.guildId;
        
            //const { getVoiceConnection } = require("@discordjs/voice");
            const connection = getVoiceConnection(guildId);
        
            if(!connection){
                await interaction.reply("まだ部屋にお呼ばれされてません・・・");
                return;
            }

            const guildConfig = zBotGData.initGuildConfigIfUndefined(guildId);

            const current = guildConfig.isReactionSpeach;
            guildConfig.isReactionSpeach = !current;
            
            if(guildConfig.isReactionSpeach){
                await interaction.reply("リアクションスタンプの読み上げを有効にしました");
            }else{
                await interaction.reply("リアクションスタンプの読み上げを無効にしました");
            }
        
            return;
        },
    },

    {
        "name": "export",
        "description": "ギルドの設定をエクスポートします",

        "excute": async function(interaction, zBotGData){
            const guildId = interaction.guildId;

            //const { getVoiceConnection } = require("@discordjs/voice");
            const connection = getVoiceConnection(guildId);
    
            if(!connection){
                await interaction.reply("まだ部屋にお呼ばれされてません・・・");
                return;
            }

            const guildConfig = zBotGData.initGuildConfigIfUndefined(guildId);
            const guildDictionary = zBotGData.initGuildDictionaryIfUndefined(guildId);

            const server = {
                "config": guildConfig,
                "dict": guildDictionary
            };

            //const { AttachmentBuilder } = require("discord.js");
            const buffer = Buffer.from(JSON.stringify(server, null, 2));
            const attachment = new AttachmentBuilder(buffer, {"name": "zbot.json"});

            await interaction.reply({ "content": "zBotの設定をエクスポートしました", "files": [attachment] });
            return;
        }
    },

    {
        "name" : "disconnect",
        "description": "ボットを切断します",

        "excute": async function(interaction, zBotGData){
            const guildId = interaction.guildId;

            //const { getVoiceConnection } = require("@discordjs/voice");
            const connection = getVoiceConnection(guildId);
    
            if(!connection){
                interaction.reply("まだ部屋にお呼ばれされてません・・・");
                return;
            }
    
            connection.state.subscription.player.stop();
            connection.destroy();

            const guildConfig = zBotGData.restoreConfig(guildId);
            guildConfig.textChannelId = "";
            //guildConfig.voiceChannelId = "";
    
            zBotGData.saveConfig(guildId);
            zBotGData.saveDictionary(guildId);
            
            zBotGData.deleteGuildData(guildId);
            
            await interaction.reply("さようなら!zBotを切断します");
            return;
        }
    },

    {
        "name": "help",
        "description": "ヘルプを表示します",

        "excute": async function(interaction, zBotGData){
            let message = "";
            for(const command of zBotSlashCommands){
                message += "/" + command.name + "\r\n";
                message += "    ・・・" + command.description + "\r\n";
            }

            await interaction.reply(message);
            return;
        }
    }
];

function clamp(value, min, max){
    return Math.min(Math.max(value, min), max);
}

async function getSpeakersWithStyles(){

    if(this.speakersWithStyles !== void 0){
        return this.speakersWithStyles;
    }

    this.speakersWithStyles = [];

    for(const splited of envVoiceServers.split(";")){
        const url = new URL(splited);

        const engine = url.searchParams.get("engine");
        const baseURL = url.origin;

        if(!engine) return;

        const { "default": axios } = require("axios");
        const rpc = axios.create({ "baseURL": baseURL, "proxy": false, "timeout": 30 * 1000 });

        const response = await rpc.get("speakers", {
            headers: { "accept" : "application/json" },
        });

        if(!response) return;
        if(response.status !== 200) return;
        
        const speakers = JSON.parse(JSON.stringify(response.data));

        for(const speaker of speakers){
            for(const style of speaker.styles){
            
                this.speakersWithStyles.push({
                    "engine": engine,
                    "id": style.id,
                    "speakerName": speaker.name,
                    "styleName": style.name,
                    "fqn": `${engine}/${speaker.name}(${style.name})/${style.id}`
                });
            }
        }
    }
    
    return this.speakersWithStyles;
}

module.exports = zBotSlashCommands;