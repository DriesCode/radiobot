const Discord = require('discord.js');
const client = new Discord.Client();
const DBL = require("dblapi.js");
const fs = require('fs');

var core = require('./core/core.js');
// var web = require('./webserver.js');

const dbl = new DBL(core.config.dbl_token, client);

const DEBUG = false;

core.init(() => {
    core.logs.log("Initialized core modules", "LOAD", core.logs.LogFile.LOAD_LOG);

    core.discord.messageParser(client, Discord);

    client.once("ready", () => {
        core.logs.log("Logged in " + client.user.tag, "DISCORD", core.logs.LogFile.DISCORD_LOG);
        core.discord.setActivity(client, core.discord.DISCORD_PREFIX + "help");
        
        core.setClientId(client.user.id);

        if (!DEBUG) {
            core.discord.noticeOnline();
        }
        client.setInterval(() => {
            core.discord.setActivity(client, core.discord.DISCORD_PREFIX + "help | Disaster-Plan Mode");
        }, 7200);

        if (!DEBUG) {
            dbl.postStats(client.guilds.cache.array().length);
            client.setInterval(() => {
                dbl.postStats(client.guilds.cache.array().length);
            }, 1800 * 1000);

            core.logs.log('Trying to get through API', "HEARTBEAT", core.logs.LogFile.DOWNLOAD_LOG);
            core.request(core.API_WRAPPER_URL, (err, resp, body) => {
                if (resp.statusCode !== 200) {
                    core.discord.sendAdminWebhook("COULD NOT VERIFY API WORKING STATUS!! PLEASE CHECK [RADIOBOT YOUTUBE API WRAPPER](" + core.API_WRAPPER_URL + ").");
                }
            });
            client.setInterval(() => {
                core.logs.log('Trying to get through API', "HEARTBEAT", core.logs.LogFile.DOWNLOAD_LOG);
                core.request(core.API_WRAPPER_URL, (err, resp, body) => {
                    if (resp.statusCode !== 200) {
                        core.discord.sendAdminWebhook("COULD NOT VERIFY API WORKING STATUS!! PLEASE CHECK [RADIOBOT YOUTUBE API WRAPPER](" + core.API_WRAPPER_URL + ").");
                    }
                });
            }, 1800 * 1000);
        }
    });

    client.on("guildCreate", guild => {
        let ownerId = guild.ownerID;

        client.users.fetch(ownerId).then(owner => {
            let e = new Discord.MessageEmbed()
                .setColor(core.discord.NotifyType.Info)
                .setFooter("RadioBot");

            e.setTimestamp();
            e.setDescription("Thanks for adding me to your server!\n\n" + 
                            "Before you can actually play songs non-stop, you'll need to configure me first.\n\n" + 
                            "First of all, choose a voice channel for me. You can do this with `" + core.discord.DISCORD_PREFIX + "channel [name / part of name]`.\n\n" +
                            "You will also need to add songs to the server. You can do this with `" + core.discord.DISCORD_PREFIX + "add`.\n\n"+
                            "If you need more help, you can type `" + core.discord.DISCORD_PREFIX + "help`.\n\n" +
                            "I really hope you enjoy me!\n\n");
            owner.send(e).then().catch(err => {
                core.logs.log("ERROR! Sending DM to user " + ownerId + " at guildCreate event " + err, "DISCORD", core.logs.LogFile.ERROR_LOG);
            });
        }).catch(err => {
            core.logs.log("ERROR! Fetching member " + ownerId + " at guildCreate event " + err, "DISCORD", core.logs.LogFile.ERROR_LOG);
        });

        core.logs.log("Joined " + guild.name + " (" + guild.id + ")", "JOIN", core.logs.log.COMMON_LOG);
        core.discord.sendWebhook("Joined " + guild.name + " (" + guild.id + ")");
    });

    client.on("voiceStateUpdate", async (oldState, newState) => {
        if (newState.member.id == client.user.id) {
            if (core.isServerDisconnected(newState.member.guild.id)) return;
            
            try {
                let voiceChannel = core.getServerChannel(newState.member.guild.id);
                if (newState.member.voice.channelID != voiceChannel) {
                    if (!newState.channelID) {
                        core.joinVoiceChannel(client, newState.member.guild.id);
                        return;
                    } else {
                        if ((newState.connection && oldState.connection) && newState.member.voice.channelID && (newState.member.voice.channelID != core.getServerChannel(newState.member.guild.id))) {
                            if (voiceChannel.length > 0) {
                                if (voiceChannel == oldState.channelID) {
                                    if (newState.connection.status != 0) {
                                        let _i = client.setInterval(() => {
                                            if (newState.connection.status == 0) {
                                                setTimeout(() => {
                                                    newState.setChannel(oldState.channelID);
                                                }, 200);   
                                                clearInterval(_i);
                                                _i = null;
                                            }
                                        }, 10);
                                    } else {
                                        if (newState.connection.status == 0) {
                                            setTimeout(() => {
                                                newState.setChannel(oldState.channelID);
                                            }, 200);
                                        }
                                    }
                                    return;
                                }
                            }
                        }
                    }
                }
        
                if (newState.member.voice && newState.member.voice.channelID == voiceChannel) {
                    if (!newState.serverDeaf && (oldState.serverDeaf || !oldState.member.voice)) {
                        newState.setDeaf(true);
                        let e = new Discord.MessageEmbed()
                            .setColor(core.discord.NotifyType.Info)
                            .setFooter("RadioBot")
                            .setTimestamp()
                            .setDescription("Hey! Looks like I was undeafened in **" + newState.member.guild.name + "**. Take into consideration the fact that I'm deafened to reduce bandwidth usage and increase your privacy.");
            
                        let channel_id = core.getServerLastUsedChannel(newState.member.guild.id);
                        if (channel_id.length > 0) {
                            client.channels.fetch(channel_id).then(c => {
                                c.send(e);
                            }).catch(err => {
                                core.logs.log("ERROR! Sending message to server " + newState.member.guild.id + " to channel " + channel_id + " at voiceStatusUpdate event " + err, "DISCORD", core.logs.LogFile.ERROR_LOG);
                            });
                        } else {
                            core.logs.log("Could not send bot deafen warning due to server last used channel being null on " + newState.member.guild.id, "DISCORD", core.logs.LogFile.ERROR_LOG);
                        }
                    }
                }
            } catch (e) {
                core.logs.log("ERROR! At voiceStatusUpdate... " + e, "DISCORD", core.logs.LogFile.ERROR_LOG);
            }
        } else {
            if (newState.channelID != oldState.channelID) {
                if (newState.member.voice) {
                    if (newState.channelID == core.getServerChannel(newState.guild.id)) {
                        if (newState.channel.members.array().length == 2 && !core.isServerDisconnected(newState.guild.id)) {
                            core.startLoopPlay(newState.channel, false, false);
                        }
                    }
                }
    
                if (oldState.member.voice && oldState.channel && oldState.channel.members.array().length == 1 && oldState.channel.members.array()[0].id == client.user.id) {
                    core.stopPlayingCurrentSong(oldState.guild.id);
                }
            }
        }
    });

    setTimeout(() => {
        client.login(core.discord.DISCORD_TOKEN);
    }, 500);
});