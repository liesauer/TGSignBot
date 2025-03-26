import { mkdirSync } from 'fs';
import { Api, Logger, TelegramClient } from 'telegram';
import { LogLevel } from 'telegram/extensions/Logger';
import { StringSession } from 'telegram/sessions';
import { Dialog } from 'telegram/tl/custom/dialog';

import { Tonfig } from '@liesauer/tonfig';

import {
    DataDir, waitForever} from './functions';
import { AnnotatedDictionary } from './types';

class MyLogger extends Logger {
    public format(message: string, level: string, messageFormat?: string) {
        return (messageFormat || this.messageFormat)
            .replace("%t", this.getDateTime())
            .replace("%l", level.toUpperCase())
            .replace("%m", message);
    }
    public log(level: LogLevel, message: string, color: string) {
        let multiLine = message.includes("\n");
        let messageFormat = "";

        if (multiLine) {
            messageFormat = "[%t] [%l]\n%m";
        } else {
            messageFormat = "[%t] [%l] - %m";
        }

        const log = color + this.format(message, level, messageFormat) + this['colors'].end;

        console.log(log);
    }
}

async function getBotInfos(client: TelegramClient) {
    let dialogs: Dialog[] = [];

    for await (const dialog of client.iterDialogs()) {
        dialogs.push(dialog);
    }

    return dialogs
        .filter(v => !!v.entity['bot'] || !!v.isChannel || !!v.isGroup)
        .map(v => {
            const entity = v.entity as Api.User;

            let username = '';

            if (entity.username) {
                username = entity.username;
            } else if (entity.usernames?.length) {
                username = entity.usernames[0].username;
            }

            return {
                peer: v.dialog.peer as Api.PeerUser,
                username: username,
                name: v.name,
            };

        });
}

let logger: Logger = new MyLogger();
let client: TelegramClient;
let tonfig: Tonfig;

let botInfos: Awaited<ReturnType<typeof getBotInfos>>;

async function loadConfig() {
    tonfig = await Tonfig.loadFile(DataDir() + '/config.toml', {
        account: {
            apiId: 0,
            apiHash: '',
            session: '',
            account: '',
            deviceModel: '',
            systemVersion: '',
            appVersion: '',
            langCode: '',
            systemLangCode: '',
        },

        signin: {
            _: "/sign",
        },

        proxy: {
            ip: "127.0.0.1",
            port: 0,
            username: "",
            password: "",
            MTProxy: false,
            secret: "",
            socksType: 5,
            timeout: 2,
        },
    });

    await tonfig.save();
}

function getAccountConfig() {
    const apiId = tonfig.get<number>("account.apiId");
    const apiHash = tonfig.get<string>("account.apiHash");
    const account = tonfig.get<string>("account.account");
    const session = tonfig.get<string>("account.session", "");

    const deviceModel = tonfig.get<string>("account.deviceModel", "");
    const systemVersion = tonfig.get<string>("account.systemVersion", "");
    const appVersion = tonfig.get<string>("account.appVersion", "");
    const langCode = tonfig.get<string>("account.langCode", "");
    const systemLangCode = tonfig.get<string>("account.systemLangCode", "");

    return { apiId, apiHash, account, session, deviceModel, systemVersion, appVersion, langCode, systemLangCode };
}

function getProxyConfig() {
    const ip = tonfig.get<string>("proxy.ip", "");
    const port = tonfig.get<number>("proxy.port", 0);
    const username = tonfig.get<string>("proxy.username", "");
    const password = tonfig.get<string>("proxy.password", "");
    const MTProxy = tonfig.get<boolean>("proxy.MTProxy", false);
    const secret = tonfig.get<string>("proxy.secret", "");
    const socksType = tonfig.get<5 | 4>("proxy.socksType", 5);
    const timeout = tonfig.get<number>("proxy.timeout", 2);

    return { ip, port, username, password, MTProxy, secret, socksType, timeout };
}

async function checkConfig() {
    await loadConfig();

    const { apiId, apiHash, account } = getAccountConfig();

    if (!apiId || !apiHash || !account) {
        logger.info('请登录');
        await waitForever();
    }
}

async function main() {
    logger = new MyLogger();

    mkdirSync(DataDir(), { recursive: true });

    await checkConfig();

    let { apiId, apiHash, account, session, deviceModel, systemVersion, appVersion, langCode, systemLangCode } = getAccountConfig();

    if (!session) {
        logger.info('请登录');
    }

    const proxy = getProxyConfig();

    client = new TelegramClient(new StringSession(session), apiId, apiHash, {
        baseLogger: logger,
        connectionRetries: 5,
        useWSS: false,
        proxy: proxy.ip && proxy.port ? proxy : undefined,
        deviceModel: deviceModel || undefined,
        systemVersion: systemVersion || undefined,
        appVersion: appVersion || undefined,
        langCode: langCode || "en",
        systemLangCode: systemLangCode || "en-US",
    });

    await client.start({
        phoneNumber: account,
        password: async () => "",
        phoneCode: async () => "",
        onError: (err) => logger.error(err.message),
    });

    botInfos = await getBotInfos(client);

    const commands = tonfig.get<AnnotatedDictionary<string, "username">>('signin', {});

    for (const username in commands) {
        if (!username || username == '_') continue;

        const bot = botInfos.find(v => v.username == username);

        if (!bot) continue;

        const command = tonfig.get<string>(['signin', username], '');

        if (!command) continue;

        await client.sendMessage(username, {
            message: command,
        });

        logger.info(`BOT签到，${bot.name}`);
    }

    logger.info(`全部签到完毕！`);

    logger.info(`10 秒后自动退出！`);

    setTimeout(async () => {
        await client.destroy();
    }, 10 * 1000);
}

main();
