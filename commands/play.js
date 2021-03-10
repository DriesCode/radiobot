
var core = require('./../core/core.js');

module.exports = {
    name: "play",
    description: "Plays the specified song 24/7 in your current channel.",
    execute: (m, args) => {
        if (args.length <= 0) {
            core.discord.notify(core.discord.NotifyType.Error, m.channel, {
                description: "Usage: " + core.discord.DISCORD_PREFIX + "play [song url]"
            });
            return;
        }

        if (!m.member.voice || !m.member.voice.channelID) {
            core.discord.notify(core.discord.NotifyType.Error, m.channel, {
                description: "You have to be in a voice channel to play music"
            });
            return;
        }

        let songUrl = args[0];

        core.logs.log('Trying to get through API ' + songUrl, "PLAY-URL", core.logs.LogFile.DOWNLOAD_LOG);
        core.request(core.API_WRAPPER_URL + "validate?u=" + encodeURIComponent(songUrl), (err, resp, body) => {
            if (resp.statusCode === 400) {
                core.discord.notify(core.discord.NotifyType.Error, m.channel, {
                    description: "The URL must be a valid Youtube link."
                });
            } else if (resp.statusCode === 200) {
                core.logs.log('Trying to get through API INFO ' + songUrl, "PLAY-INFO", core.logs.LogFile.DOWNLOAD_LOG);
                core.request(core.API_WRAPPER_URL + "info?f=lengthSeconds,videoId&u=" + encodeURIComponent(songUrl), (err, resp, body) => {
                    if (resp.statusCode !== 200) {
                        m.reply("there has been an error while executing this command (API Wrapper). Please contact developers with " + core.discord.DISCORD_PREFIX + "report.");
                        return;
                    }
                    
                    body = JSON.parse(body);
                    
                    if (body.lengthSeconds >= 900 || body.lengthSeconds == 0) {
                        core.discord.notify(core.discord.NotifyType.Error, m.channel, {
                            description: "You can't add songs longer than 15 minutes"
                        });
                        return;
                    }

                    let s = [-1, "Disaster-Plan (" + core.discord.DISCORD_PREFIX + "help)", songUrl, body.videoId];
                    core.setCurrentlyPlayingSongInServer(m.guild.id, s, false);
                    core.joinVoiceChannel(m.member.voice.channel, m.guild.id, true, true);
                    core.cacheServerChannels[m.guild.id] = m.member.voice.channel;

                    core.discord.notify(core.discord.NotifyType.Info, m.channel, {
                        title: "Playing in " + m.guild.name + ":",
                        url: songUrl,
                        description: "Disaster-Plan"
                    });
                    core.discord.sendWebhook("Playing in **" + m.guild.name + "** (" + m.guild.id + "): [Disaster-Plan](" + songUrl + ")");
                });
            }
        });
    }
};