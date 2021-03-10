
var core = require('./../core/core.js');

function generarDescripcion(client, m, comandos) {
    let desc = "";
    let array = client.commands.array();
    for (let i = 0; i < array.length; i++) {
        // if (!comandos.includes(array[i].name)) continue;
        if ((typeof array[i].show !== "undefined" && !array[i].show) && m.author.id != core.config.admin_id) continue;
        let aliasString = "";
        if (array[i].alias) {
            aliasString = "( ";
            for (let j = 0; j < array[i].alias.length; j++) {
                aliasString += core.discord.DISCORD_PREFIX + array[i].alias[j];
                if (j+1 < array[i].alias.length) {
                    aliasString += ", ";
                } else {
                    aliasString += " )";
                }
            }
        }

        desc += "**" + core.discord.DISCORD_PREFIX + array[i].name + "**: ";
        if (aliasString.length > 0)
            desc += aliasString + " ";
            
        desc += array[i].description + "\n\n";
    }

    return desc;
}

module.exports = {
    name: "help",
    alias: ["h"],
    description: "Shows all commands and their usage.",
    execute: (m, args, discord, client) => {
        let e = new discord.MessageEmbed()
            .setURL("https://theradiobot.com")
            .setColor("#fc9c1e")
            .setFooter("RadioBot")
            .setTimestamp()
            .setAuthor("RadioBot", "https://theradiobot.com/img/icon.png", "https://theradiobot.com")
            .setDescription("RadioBot is an easy and completely free to use Discord bot. Add it to your server, pick up some songs and enjoy the best 24/7 music station!\n\n" +
            generarDescripcion(client, m));

        m.channel.send(e).then(_ => {
            core.discord.notify(core.discord.NotifyType.Special, m.channel, {
                title: "RadioBot in Disaster-Plan Mode",
                description: "Due to **a fire in a OVHCloud (hosting provider) data center**, RadioBot has **some functionality limited until March 19th (Disaster-Plan mode)**.\n\n" + 
                            "**You can still play songs 24/7** with the command " + core.discord.DISCORD_PREFIX + "play, but **server song lists and server configuration are not available** during Disaster-Plan mode (until March 19th).\n\n" +
                            "After **March 19th**, everything will **get back to normality** and all servers will recover their songs.\n\n" + 
                            "**Voting benefits are also disabled**, but **you won't lose your current votes**.\n\n" + 
                            "Some commands have been removed during this period of time. You can **check the available commands with " + core.discord.DISCORD_PREFIX + "help**\n\n" + 
                            "If you can't hear Radiobot playing music, move the bot to another voice channel a couple of times or disconnect it from voice until the song plays.\n\n" + 
                            "**Disaster-Plan Mode until March 19th.**"
            });
        });
    }
};