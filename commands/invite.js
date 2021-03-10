
var core = require('./../core/core.js');

module.exports = {
    name: "invite",
    description: "Shows the invite link for the bot.",
    execute: (m, args, discord, client) => {
        try {
            m.reply("here's the link for RadioBot: https://discord.com/oauth2/authorize?client_id=778044858760953866&permissions=28403776&scope=bot");
        } catch (e) {
            core.logs.log("ERROR! Executing server command invite: " + e, "DISCORD", core.logs.LogFile.ERROR_LOG);
        }
    }
};