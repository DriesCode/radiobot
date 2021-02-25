
var core = require('./../core/core.js');

module.exports = {
    name: "dc",
    description: "Disconnects the bot from the voice channel (requires using `" + core.discord.DISCORD_PREFIX + "song` again).",
    execute: (m, args, discord) => {
        if (!core.getServerSongs(m.guild.id) || core.getServerSongs(m.guild.id).length <= 0) {
            core.discord.notify(core.discord.NotifyType.Error, m.channel, {
                description: "There aren't any songs added in " + m.guild.name + " yet! Try adding some with **" + core.discord.DISCORD_PREFIX + "add**"
            });
            return;
        }

        if (core.isServerDisconnected(m.guild.id) || core.getServerChannel(m.guild.id).length <= 0) {
            core.discord.notify(core.discord.NotifyType.Error, m.channel, {
                description: "I'm already disconnected in **" + m.guild.name + "**!"
            });
            return;
        }

        core.disconnectFromVoiceChannel(m.guild.id);

        core.discord.notify(core.discord.NotifyType.Success, m.channel, {
            description: "Disconnected from " + m.guild.name + " voice channel. Don't forget to use **" + core.discord.DISCORD_PREFIX + "song** after disconnecting the bot with **" + core.discord.DISCORD_PREFIX + "dc**"
        })

        core.logs.log("Disconnected from " + m.guild.id, "COMMON", core.logs.LogFile.COMMON_LOG);
    }
};