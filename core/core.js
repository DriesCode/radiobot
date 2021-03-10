const logs = require('./core_logs.js');
const discord = require('./core_discord.js');
const config = require('./core_config.json');

const ytdl = require('ytdl-core');
const ytsr = require('ytsr');
var fs = require('fs');
const md5 = require('md5');
const request = require('request');

// guild id -> songs [id, name, url]
var serverSongs = {};
// song id -> song [id, name, url]
var songsById = {};
// guild id -> song [id, name, url]
var currentlyPlayingSongs = {};
// guild id -> channel id
var serverChannels = {};
// guild id -> voice conn
var serverVoiceConnection = {};
// guild id -> voice dis
var serverVoiceDispatcher = {};
// guild id -> [ user id, callback ]
var serverUsersWaitingResponse = {};
// guild id -> channel id
var serverLastUsedChannel = {};
// guild id
var disconnectedServers = [];
// report id -> channel
var serverReports = {};
// guild id -> queue state (true/false)
var serverQueues = {};
// song id -> song video id
var songsVideoId = {};
// guild id -> unix next time to refresh last play
var songLastPlayUpdateTimeout = {};
// guild id
var serverCooldown = [];
// userid -> votes
var userVotes = {};
// userid -> pack array [0,1,2...]
var userPacks = {};
// serverid -> max songs
var serverMaxSongs = {};

//guild id -> channel
var cacheServerChannels = {};

var totalSongs = 0;

var numbers = ['0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣'];

const MAX_SERVER_SONGS = 10;
const CACHE_PATH = "cache/";
var TECH_DIF = false;
var API_WRAPPER_URL = config.api_url;
var CLIENT_ID = "";

async function init(callback) {
    await logs.init();
    await discord.init();
    // await mysql.init();
    callback();
}

function addSongToServer(song, server_id, video_id = "", saveToDb=false) {
    if (!serverSongs[server_id]) {
        serverSongs[server_id] = [];
    }

    if (!saveToDb) {
        serverSongs[server_id].push(song);
    } else {
        let name = song[0].replace(/[\\$'"]/g, "\\$&");
        mysql.queryGetInsertedId(`INSERT INTO song(name, url, serverid) VALUES('${name}', '${song[1]}', ${server_id})`, id => {
            serverSongs[server_id].push([id].concat(song));
            if (video_id.length <= 0 && saveToDb) {
                logs.log('Trying to get through API INFO ' + song[1], "CORE-addSongToServer", logs.LogFile.DOWNLOAD_LOG);
                request(API_WRAPPER_URL + "info?f=videoId&u=" + encodeURIComponent(song[1]), (err, resp, body) => {
                    if (resp.statusCode === 200) {
                        body = JSON.parse(body);
                        setVideoId(id, body.videoId);
                    }
                });
            }

            if (video_id.length > 0) {
                setVideoId(id, video_id);
            }
        });
    }
}

function addSongById(id, song) {
    songsById[id] = song;
}

function removeSongFromServer(song, serverid, saveToDb=true) {
    if (!serverSongs[serverid]) {
        serverSongs[serverid] = [];
    }

    let idx = serverSongs[serverid].indexOf(song);

    if (!saveToDb) {
        if (idx > -1)
            serverSongs[serverid].splice(idx, 1);
    } else {
        mysql.query(`DELETE FROM song WHERE id=${song[0]}`);
        if (idx > -1)
            serverSongs[serverid].splice(idx, 1);
    }
}

function getSongById(id) {
    if (!songsById[id]) {
        songsById[id] = [];
    }

    return songsById[id];
}

function setCurrentlyPlayingSongInServer(serverid, song, saveToDb=false) {
    if (!song || song.length <= 0) return;
    if (!serverid) return;
    currentlyPlayingSongs[serverid] = song;
    
    if (saveToDb) {
        mysql.queryGetResult("SELECT * FROM current_playing WHERE serverid=" + serverid, res => {
            if (res.length > 0) {
                mysql.query("UPDATE current_playing SET song_id=" + song[0] + " WHERE serverid=" + serverid);
            } else {
                mysql.query("INSERT INTO current_playing(serverid, song_id) VALUES(" + serverid + ", " + song[0] + ")");
            }
        });
    }
}

function clearCurrentlyPlayingSongInServer(serverid) {
    currentlyPlayingSongs[serverid] = [];
    mysql.query("DELETE FROM current_playing WHERE serverid=" + serverid);
}

function getServerSongs(server_id, updateFromDb=false) {
    if (!serverSongs[server_id]) {
        serverSongs[server_id] = [];
    }

    if (updateFromDb) {
        mysql.queryGetResult("SELECT * FROM song WHERE serverid=" + server_id, res => {
            for (let song of res) {
                addSongToServer([song.id, song.name, song.url], server_id);
            }

            return serverSongs[server_id];
        });
    } else {
        return serverSongs[server_id];
    }
}

function getCurrentlyPlayingSongInServer(serverid) {
    if (!currentlyPlayingSongs[serverid]) {
        currentlyPlayingSongs[serverid] = [];
    }

    return currentlyPlayingSongs[serverid];
}

function getServerChannel(serverid) {
    if (!cacheServerChannels[serverid]) {
        return "";
    }

    return cacheServerChannels[serverid].id;
}

function setServerChannel(serverid, channelid, saveToDb=false) {
    serverChannels[serverid] = channelid;

    if (saveToDb) {
        mysql.queryGetResult("SELECT channelid FROM channel WHERE serverid=" + serverid, res => {
            if (res.length > 0) {
                mysql.query("UPDATE channel SET channelid=" + channelid + " WHERE serverid=" + serverid);
            } else {
                mysql.query("INSERT INTO channel(serverid, channelid) VALUES(" + serverid + ", " + channelid + ")");
            }
        });
    }
}

function clearServerChannel(serverid) {
    serverChannels[serverid] = "";
    mysql.query("DELETE FROM channel WHERE serverid=" + serverid);
    leaveVoiceChannel(serverid);
}

function getServerLastUsedChannel(serverid) {
    if (!serverLastUsedChannel.hasOwnProperty(serverid)) {
        serverLastUsedChannel[serverid] = "";
    }

    return serverLastUsedChannel[serverid];
}

function setServerLastUsedChannel(serverid, channelid) {
    serverLastUsedChannel[serverid] = channelid;
}

function pauseCurrentlyPlayingSong(serverid) {
    if (serverVoiceDispatcher.hasOwnProperty(serverid)) {
        serverVoiceDispatcher[serverid].pause();
    }
}

function resumeCurrentlyPlayingSong(serverid) {
    if (serverVoiceDispatcher.hasOwnProperty(serverid)) {
        serverVoiceDispatcher[serverid].resume();
    }
}

function disconnectFromVoiceChannel(serverid) {
    disconnectedServers.push(serverid);
    leaveVoiceChannel(serverid);
}

function isServerDisconnected(serverid) {
    return disconnectedServers.indexOf(serverid) > -1;
}

function joinVoiceChannel(client, serverid, refresh=true, songCommand=false) {
    if (songCommand) {
        startLoopPlay(client, refresh, songCommand);
    } else {
        startLoopPlay(cacheServerChannels[serverid], refresh, songCommand);
    }
}

function removeServer(serverid) {
    mysql.query("DELETE FROM song WHERE serverid=" + serverid);
    mysql.query("DELETE FROM current_playing WHERE serverid=" + serverid);
    mysql.query("DELETE FROM channel WHERE serverid=" + serverid);

    delete serverSongs[serverid];
    delete currentlyPlayingSongs[serverid];
    delete serverChannels[serverid];
    delete serverVoiceConnection[serverid];
    delete serverVoiceDispatcher[serverid];
    delete serverLastUsedChannel[serverid];
    delete serverUsersWaitingResponse[serverid];
    
    let idx = disconnectedServers.indexOf(serverid);
    if (idx > -1) disconnectedServers.splice(idx, 1);

    logs.log("Removed server ID " + serverid, "COMMON", logs.LogFile.COMMON_LOG);
}

async function startLoopPlay(channel, refresh, songCommand) {
    let songUrl = "";
    let song = [];

    song = getCurrentlyPlayingSongInServer(channel.guild.id);
    songUrl = song[2];
    if (typeof songUrl !== 'string' && song.length > 0) {
        logs.log("WARNING! Could not play song in channel (" + channel.guild.id + ") " + channel.id + ": Song URL is undefined.", "ERROR", logs.LogFile.ERROR_LOG);
        return;
    }

    if (refresh) {
        if (serverVoiceDispatcher[channel.guild.id]) {
            serverVoiceDispatcher[channel.guild.id].destroy();
        }
    
        if (serverVoiceConnection[channel.guild.id]) {
            serverVoiceConnection[channel.guild.id].disconnect();
        }
    }

    setTimeout(async () => {
        try {
            let voiceConnection = await channel.join();
            voiceConnection.voice.setDeaf(true);

            if (channel.members.array().length <= 0 || (channel.members.array().length == 1 && channel.members.array()[0].id == CLIENT_ID)) return;

            if (fs.existsSync(CACHE_PATH + getMD5(song[3]) + ".mp3")) {
                let filename = getMD5(song[3])+".mp3";
                logs.log("Reading from cache: " + song[3] + " | " + filename);
                let voiceDispatcher = voiceConnection.play(fs.createReadStream(CACHE_PATH + filename));
                //voiceDispatcher.setVolume(0.3);

                serverVoiceDispatcher[channel.guild.id] = voiceDispatcher;
                serverVoiceConnection[channel.guild.id] = voiceConnection;

                voiceDispatcher.once('finish', () => {
                    voiceDispatcher.destroy();
                    startLoopPlay(channel, false);
                });
            } else {
                let hash_id = getMD5(song[3]);
                
                logs.log('Trying to download through API ' + songUrl, "SONG", logs.LogFile.DOWNLOAD_LOG);
                let pipe_proc = request(API_WRAPPER_URL + "audio?u=" + encodeURIComponent(songUrl)).pipe(fs.createWriteStream(CACHE_PATH + hash_id + ".mp3"));

                pipe_proc.once('finish', () => {
                    let voiceDispatcher = voiceConnection.play(fs.createReadStream(CACHE_PATH + hash_id + ".mp3"));
                    //voiceDispatcher.setVolume(0.3);

                    serverVoiceDispatcher[channel.guild.id] = voiceDispatcher;
                    serverVoiceConnection[channel.guild.id] = voiceConnection;

                    voiceDispatcher.once('finish', () => {
                        voiceDispatcher.destroy();
                        startLoopPlay(channel, false);
                    });

                });
            }

        } catch (e) {
            logs.log("WARNING! Could not connect to voice channel: (" + channel.guild.id + ") " + e, "ERROR", logs.LogFile.ERROR_LOG);
        }
        // try {
        //     let voiceConnection = await channel.join();

        //     if (channel.members.array().length <= 0 || (channel.members.array().length == 1 && channel.members.array()[0].id == CLIENT_ID)) return;

        //     logs.log('Trying to get through API ' + songUrl, "PLAY-FINAL-URL", logs.LogFile.DOWNLOAD_LOG);
        //     request(API_WRAPPER_URL + "validate?u=" + encodeURIComponent(songUrl), (err, resp, body) => {
        //         if (resp.statusCode === 200) {
        //             let voiceDispatcher = voiceConnection.play(API_WRAPPER_URL + "audio?u=" + encodeURIComponent(songUrl));

        //             serverVoiceDispatcher[channel.guild.id] = voiceDispatcher;
        //             serverVoiceConnection[channel.guild.id] = voiceConnection;

        //             voiceDispatcher.once('finish', () => {
        //                 voiceDispatcher.destroy();
        //                 startLoopPlay(channel, false);
        //             });
        //         }
        //     });
        // } catch (e) {
        //     logs.log("WARNING! Could not connect to voice channel: (" + channel.guild.id + ") " + e, "ERROR", logs.LogFile.ERROR_LOG);
        // }
    }, 500);
}

function leaveVoiceChannel(serverid, clearPlayingSong=true) {
    if (serverVoiceConnection.hasOwnProperty(serverid)) {
        serverVoiceConnection[serverid].disconnect();
        delete serverVoiceConnection[serverid];
    }

    if (serverVoiceDispatcher.hasOwnProperty(serverid)) {
        serverVoiceDispatcher[serverid].destroy();
        delete serverVoiceDispatcher[serverid];
    }

    if (clearPlayingSong)
        clearCurrentlyPlayingSongInServer(serverid);
}

function buildSongList(guild, discord) {
    let embed = new discord.MessageEmbed()
        .setColor("#fc9c1e")
        .setTitle(guild.name + " song list (" + getServerSongs(guild.id).length + "/" + getServerMaxSongs(guild.id) + "):")
        .setFooter('RadioBot')
        .setTimestamp();
    
    let serverSongs = getServerSongs(guild.id);
    for (let i = 0; i < serverSongs.length; i++) {
        if (i < 10)
            embed.addField("Song " + numbers[i], serverSongs[i][1]);
        else {
            let digits = [];
            let istr = i.toString();
            for (let j = 0, len = istr.length; j < len; j++) {
                digits.push(+istr.charAt(j));
            }

            let numbersEmoji = "";
            for (let d of digits) {
                numbersEmoji += numbers[d];
            }
            embed.addField("Song " + numbersEmoji, serverSongs[i][1]);
        }
    }

    return embed;
}

function sendSongListAwaitReaction(user, channel, guild, discord, callback) {
    let e = buildSongList(guild, discord);
    
    channel.send(e).then(async _m => {
        let songs = getServerSongs(guild.id);
        for (let i = 0; i < songs.length; i++) {
            await _m.react(numbers[i]);
        }

        const filter = (r, u) => { return numbers.includes(r.emoji.name) && u.id == user.id };
        _m.awaitReactions(filter, { max: 1, time: 30000 }).then(collect => {
            let r = collect.first();
            callback(r);
        }).catch(err => {
            logs.log("ERROR! At sendSongListAwaitReaction (" + guild.id + ") " + err, "DISCORD", logs.LogFile.ERROR_LOG)
        });
    });
}

function getUserWaitingForResponse(serverid) {
    if (!serverUsersWaitingResponse.hasOwnProperty(serverid)) {
        serverUsersWaitingResponse[serverid] = [];
    }

    return serverUsersWaitingResponse[serverid];
}

function clearUserWaitingForResponse(serverid) {
    if (serverUsersWaitingResponse[serverid] && serverUsersWaitingResponse[serverid][2]) {
        clearTimeout(serverUsersWaitingResponse[serverid][2]);
    }

    serverUsersWaitingResponse[serverid] = [];
}

function waitForUserResponse(user, channel, _discord, callback, notifyPassed=true, deleteInput=false) {
    if (getUserWaitingForResponse(channel.guild.id).length > 0) {
        return;
    }

    let _t = setTimeout(() => {
        if (getUserWaitingForResponse(channel.guild.id).length > 0) {
            let u = getUserWaitingForResponse(channel.guild.id);
            if (u[0] == user.id) {
                if (notifyPassed) {
                    discord.notify(discord.NotifyType.Error, channel, {
                        description: "Time passed! The operation was cancelled"
                    });
                }
                clearUserWaitingForResponse(channel.guild.id);
            }
        }
    }, 30*1000);

    serverUsersWaitingResponse[channel.guild.id] = [user.id, callback, _t, deleteInput];
}

function addReport(channel) {
    let id = 0;
    while (serverReports.hasOwnProperty(id)) id++;

    serverReports[id] = channel;
    return id;
}

function replyReport(id, discord, text) {
    if (serverReports.hasOwnProperty(id)) {
        let channel = serverReports[id];
        if (channel) {
            let e = new discord.MessageEmbed()
            .setTitle("Your report has been attended")
            .setDescription(text)
            .setColor('#00ba4a');

            channel.send(e);
            delete serverReports[id];
            return true;
        } else {
            return false;
        }
    } else {
        return false;
    }
}

function setQueue(serverid, queue, saveToDb=true) {
    serverQueues[serverid] = queue;

    if (saveToDb) {
        mysql.queryGetResult("SELECT state FROM queue WHERE serverid=" +serverid, res => {
            if (res.length <= 0) {
                mysql.query("INSERT INTO queue(serverid, state) VALUES(" + serverid + ", " + queue + ")");
            } else {
                mysql.query("UPDATE queue SET state=" + queue + " WHERE serverid=" +serverid);
            }
        });
    }
}

function getQueue(serverid) {
    if (!serverQueues.hasOwnProperty(serverid)) {
        return -1;
        //serverQueues[serverid] = false;
    }

    return serverQueues[serverid];
}

function getNextSongId(serverid) {
    if (!serverSongs.hasOwnProperty(serverid)) {
        serverSongs[serverid] = [];
    }
    let songPlaying = getCurrentlyPlayingSongInServer(serverid);
    if (songPlaying.length > 0) {
        let idx = getArrayIndex(serverSongs[serverid], songPlaying);
        if (idx >= 0 && idx < serverSongs[serverid].length-1) {
            idx++;
            return serverSongs[serverid][idx][0];
            //return idx+1;
        } else if (idx >= serverSongs[serverid].length-1) {
            return serverSongs[serverid][0][0];
            //return 0;
        } else if (idx < 0) {
            return -1;
        }
    } else {
        return serverSongs[serverid][0][0];
        // return 0;
    }
}

function getVideoId(song_id) {
    if (!songsVideoId.hasOwnProperty(song_id))
        return "";
    else return songsVideoId[song_id];
}

function setVideoId(song_id, video_id, saveToDb=true) {
    if (saveToDb)
        mysql.query("UPDATE song SET video_id='" + video_id + "' WHERE id=" + song_id);

    songsVideoId[song_id] = video_id;
    logs.log("Set video ID " + video_id + " of song ID (" + song_id + ")", "COMMON", logs.LogFile.COMMON_LOG);
}

function updateLastPlayTime(serverid, songId) {
    if (songsById === undefined) return;
    
    // mysql.query("UPDATE song SET last_play=" + getUnixTimeNow() + " WHERE id=" + songId);

    if (serverid !== undefined) {
        // songLastPlayUpdateTimeout[serverid] = getUnixTimeNow() + 300;
    }
}

function setServerCooldown(serverid, time) {
    if (!serverCooldown.includes(serverid)) {
        serverCooldown.push(serverid);
        setTimeout(() => {
            let idx = serverCooldown.indexOf(serverid);
            if (idx > -1)
                serverCooldown.splice(idx, 1);
        }, time);
    }
}

function isServerOnCooldown(serverid) {
    return serverCooldown.includes(serverid);
}

function setUserVotes(userid, votes) {
    userVotes[userid] = votes;
}

function getUserVotes(userid) {
    if (userVotes.hasOwnProperty(userid)) {
        return userVotes[userid];
    } else {
        return 0;
    }
}

function clearUserVotes(userid, updateBd = true) {
    delete userVotes[userid];

    if (updateBd) {
        mysql.query("DELETE FROM votes WHERE userid=" + userid);
    }
}

function addUserVote(userid) {
    setUserVotes(userid, getUserVotes(userid) + 1);
}

function getUserPacks(userid) {
    if (!userPacks.hasOwnProperty(userid)) {
        userPacks[userid] =  [];
    }

    return userPacks[userid];
}

function addUserPack(userid, pack, updateBd = false) {
    if (!userPacks.hasOwnProperty(userid)) {
        userPacks[userid] =  [];
    }

    userPacks[userid].push(pack);

    if (updateBd) {
        mysql.query("INSERT INTO vote_packs(userid, pack) VALUES(" + userid + "," + pack + ")");
    }
}

function userHasPack(userid, pack) {
    if (!userPacks.hasOwnProperty(userid)) {
        userPacks[userid] =  [];
    }

    let idx = userPacks[userid].indexOf(pack);
    return idx >= 0;
}

function getUserPackAmount(userid, pack) {
    if (!userPacks.hasOwnProperty(userid)) {
        userPacks[userid] =  [];
    }

    let count = 0;
    for (let p of userPacks[userid]) {
        if (p == pack) count++;
    }

    return count;
}

function removeUserPack(userid, pack, updateBd = true) {
    if (!userPacks.hasOwnProperty(userid)) {
        userPacks[userid] =  [];
    }

    let idx = userPacks[userid].indexOf(pack);
    if (idx >= 0) {
        userPacks[userid].splice(idx, 1);
    }

    if (updateBd) {
        mysql.query("DELETE FROM vote_packs WHERE userid=" + userid+ " AND pack =" + pack);
    }
}

function setServerMaxSongs(serverid, maxsongs, updateBd = false) {
    serverMaxSongs[serverid] = maxsongs;

    if (updateBd) {
        mysql.queryGetResult("SELECT max_songs FROM server_maxsongs WHERE serverid=" +serverid, res => {
            if (res.length <= 0) {
                mysql.query("INSERT INTO server_maxsongs(serverid, max_songs) VALUES(" + serverid + ", " + maxsongs + ")");
            } else {
                mysql.query("UPDATE server_maxsongs SET max_songs=" + maxsongs + " WHERE serverid=" +serverid);
            }
        });
    }
}

function getServerMaxSongs(serverid) {
    if (!serverMaxSongs.hasOwnProperty(serverid)) {
        return MAX_SERVER_SONGS;
    }

    return serverMaxSongs[serverid];
}

function stopPlayingCurrentSong(serverid) {
    if (serverVoiceDispatcher[serverid]) {
        serverVoiceDispatcher[serverid].destroy();
    }
}

function getUnixTimeNow() {
    return Math.floor(new Date().getTime() / 1000);
}

function areIdenticalArrays(array1, array2) {
    if (!array1 || !array2) return -1;

    let c = true;
    for (let i = 0; i < array1.length; i++) {
        if (array1[i] != array2[i]) {
            c = false;
            break;
        }
    }

    return c;
}

function getArrayIndex(container, content) {
    let idx = -1;
    for (let i = 0; i < container.length; i++) {
        if (areIdenticalArrays(container[i], content)) {
            idx = i;
            break;
        }
    }

    return idx;
}

function getMD5(text) {
    return md5(text);
}

function getAllSongs() {
    return serverSongs;
}

function getAllServers() {
    let servers = [];
    for (let serverid in serverSongs) {
        servers.push(serverid);
    }

    return servers;
}

// https://github.com/fent/node-ytdl-core/issues/635
function getFirefoxUserAgent() {
    let date = new Date()
    let version = ((date.getFullYear() - 2018) * 4 + Math.floor(date.getMonth() / 4) + 58) + ".0"
    return `Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:${version} Gecko/20100101 Firefox/${version}`
}

function setClientId(_CLIENT_ID) {
    CLIENT_ID = _CLIENT_ID;
}

module.exports = {
    logs: logs,
    discord: discord,
    // mysql: mysql,
    config: config,

    ytdl: ytdl,
    ytsr: ytsr,
    request: request,

    addSongToServer: addSongToServer,
    getServerSongs: getServerSongs,
    getAllSongs: getAllSongs,
    addSongById: addSongById,
    getSongById: getSongById,
    getAllServers: getAllServers,
    getCurrentlyPlayingSongInServer: getCurrentlyPlayingSongInServer,
    setCurrentlyPlayingSongInServer: setCurrentlyPlayingSongInServer,
    getServerChannel: getServerChannel,
    setServerChannel: setServerChannel,
    joinVoiceChannel: joinVoiceChannel,
    startLoopPlay: startLoopPlay,
    buildSongList: buildSongList,
    sendSongListAwaitReaction: sendSongListAwaitReaction,
    getUserWaitingForResponse: getUserWaitingForResponse,
    waitForUserResponse: waitForUserResponse,
    clearUserWaitingForResponse: clearUserWaitingForResponse,
    removeSongFromServer: removeSongFromServer,
    leaveVoiceChannel: leaveVoiceChannel,
    clearServerChannel: clearServerChannel,
    getServerLastUsedChannel: getServerLastUsedChannel,
    setServerLastUsedChannel: setServerLastUsedChannel,
    pauseCurrentlyPlayingSong: pauseCurrentlyPlayingSong,
    resumeCurrentlyPlayingSong: resumeCurrentlyPlayingSong,
    disconnectFromVoiceChannel: disconnectFromVoiceChannel,
    isServerDisconnected: isServerDisconnected,
    removeServer: removeServer,
    addReport: addReport,
    replyReport: replyReport,
    setQueue: setQueue,
    getQueue: getQueue,
    getNextSongId: getNextSongId,
    getVideoId: getVideoId,
    setVideoId: setVideoId,
    getMD5: getMD5,
    updateLastPlayTime: updateLastPlayTime,
    getUnixTimeNow: getUnixTimeNow,
    setServerCooldown: setServerCooldown,
    isServerOnCooldown: isServerOnCooldown,
    setUserVotes: setUserVotes,
    getUserVotes: getUserVotes,
    clearUserVotes: clearUserVotes,
    addUserVote: addUserVote,
    getUserPacks: getUserPacks,
    addUserPack: addUserPack,
    removeUserPack: removeUserPack,
    userHasPack: userHasPack,
    getUserPackAmount: getUserPackAmount,
    getServerMaxSongs: getServerMaxSongs,
    setServerMaxSongs: setServerMaxSongs,
    setClientId: setClientId,
    stopPlayingCurrentSong: stopPlayingCurrentSong,

    totalSongs: totalSongs,
    cacheServerChannels: cacheServerChannels,

    numbers: numbers,
    MAX_SERVER_SONGS: MAX_SERVER_SONGS,
    TECH_DIF: TECH_DIF,
    CACHE_PATH: CACHE_PATH,
    //YOUTUBE_DEFAULT_HEADERS: YOUTUBE_DEFAULT_HEADERS,
    API_WRAPPER_URL: API_WRAPPER_URL,

    init: init
}