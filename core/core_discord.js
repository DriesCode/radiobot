const fs = require('fs');
const request = require('request');

const config = require('./core_config.json');
var logs = null;
var core = null;

const Discord = require('discord.js');
const whStatus = new Discord.WebhookClient(config.discord_statuswh_id, config.discord_statuswh_token);
const whAdmin = new Discord.WebhookClient(config.discord_adminwh_id, config.discord_adminwh_token);

const DISCORD_TOKEN = config.discord_token;
const DISCORD_PREFIX = config.discord_prefix;

const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));

const NotifyType = {
    Error: "#ff0000",
    Info: "#9514b3",
    Success: "#9514b3",
    Special: "#9514b3"
};

function getCommandFiles() {
    return fs.readdirSync('./commands').filter(file => file.endsWith('.js'));
}

// guild id -> song name
var serverAddSongNames = {};

function messageParser(client, discord) {
    client.commands = new Discord.Collection();
    client.aliases = {};

    for (const file of commandFiles) {
        const command = require('./../commands/' + file);
        client.commands.set(command.name, command);
        client.aliases[command.name] = command.alias;
    }

    client.on('message', m => {
        if (m.author.bot) return;
        if (m.channel.type === 'dm') return;
        
        core.setServerLastUsedChannel(m.guild.id, m.channel.id);

        if (!m.content.startsWith(DISCORD_PREFIX)) {
            if (core.getUserWaitingForResponse(m.guild.id).length > 0) {
                let u = core.getUserWaitingForResponse(m.guild.id);
                if (u[0] == m.author.id) {
                    core.clearUserWaitingForResponse(m.guild.id);
                    u[1](m.content, u[3] ? m : undefined);
                    // if (u[3]) {
                    //     m.delete();
                    // }
                }
            }
            return;
        }

        // if sends command while waiting for response, we cancel that
        if (core.getUserWaitingForResponse(m.guild.id).length > 0) {
            let u = core.getUserWaitingForResponse(m.guild.id);
            if (u[0] == m.author.id) {
                core.clearUserWaitingForResponse(m.guild.id);
            }
        }

        const args = m.content.slice(DISCORD_PREFIX.length).trim().split(/ +/);
        let command = args.shift().toLowerCase();
        
        if (!client.commands.has(command)) {
            for (let _command in client.aliases) {
                if (client.aliases[_command]) {
                    if (client.aliases[_command].includes(command)) {
                        command = _command;
                        break;
                    }
                }
            }
        }

        if (!client.commands.has(command)) return;

        try {
            client.commands.get(command).execute(m, args, discord, client);
        } catch (e) {
            m.reply("an error ocurred while executing that command. My team is probably already working for a solution, so don't worry!");
            logs.log("Error executing command " + command + " (" + JSON.stringify(args) + ") -> " + e, "ERROR", logs.LogFile.ERROR_LOG);
        }
    });
}

function getSongNameAddingToServer(serverid) {
    if (!serverAddSongNames.hasOwnProperty(serverid)) {
        serverAddSongNames[serverid] = "";
    }

    return serverAddSongNames[serverid];
}

function notify(notifyType, channel, data) {
    let e = new Discord.MessageEmbed()
        .setColor(notifyType)
        .setFooter("RadioBot")
        .setTimestamp();
    
    if (data.title) {
        e.setTitle(data.title)
    }

    if (data.description) {
        e.setDescription(data.description);
    }

    if (data.url) {
        e.setURL(data.url);
    }

    channel.send(e);
}

function setActivity(client, activity) {
    client.user.setActivity(activity);
}

function noticeOnline() {
    let e = new Discord.MessageEmbed()
    .setColor('#00ba4a');

    core.logs.log('Trying to get through API', "HEARTBEAT", core.logs.LogFile.DOWNLOAD_LOG);
    request(core.API_WRAPPER_URL, (err, res, body) => {
        if (res.statusCode === 200) {
            e.setDescription("RadioBot is now online. Working API on " + core.API_WRAPPER_URL);
        } else {
            e.setDescription("RadioBot is now online. Could not load API on " + core.API_WRAPPER_URL);
        }

        whStatus.send('', {
            embeds: [e],
            username: 'RadioBot Status',
            avatarURL: 'https://cdn.discordapp.com/attachments/490470376380432389/793454290727337984/icon.jpg'
        });
    })
}

function sendWebhook(text) {
    let e = new Discord.MessageEmbed()
    .setDescription(text)
    .setColor('#00ba4a');

    whStatus.send('', {
        embeds: [e],
        username: 'RadioBot Status',
        avatarURL: 'https://cdn.discordapp.com/attachments/490470376380432389/793454290727337984/icon.jpg'
    });
}

function sendAdminWebhook(text) {
    let e = new Discord.MessageEmbed()
    .setDescription(text)
    .setColor('#fcba03');

    whAdmin.send('', {
        embeds: [e],
        username: 'RadioBot Admin',
        avatarURL: 'https://cdn.discordapp.com/attachments/490470376380432389/793454290727337984/icon.jpg'
    });
}

async function init() {
    logs = require('./core_logs.js');
    core = require('./core.js');
}

module.exports = {
    messageParser: messageParser,
    notify: notify,
    setActivity: setActivity,
    noticeOnline: noticeOnline,
    getSongNameAddingToServer: getSongNameAddingToServer,
    getCommandFiles: getCommandFiles,
    sendWebhook: sendWebhook,
    sendAdminWebhook: sendAdminWebhook,

    NotifyType: NotifyType,
    DISCORD_TOKEN: DISCORD_TOKEN,
    DISCORD_PREFIX: DISCORD_PREFIX,

    init: init
}