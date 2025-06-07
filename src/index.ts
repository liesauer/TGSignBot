import { mkdirSync } from 'fs';
import { Api, Logger, TelegramClient } from 'telegram';
import { LogLevel } from 'telegram/extensions/Logger';
import { StringSession } from 'telegram/sessions';
import { Dialog } from 'telegram/tl/custom/dialog';
import * as Util from '@liesauer/util';

import { Tonfig } from '@liesauer/tonfig';

import {
    DataDir, waitForever, escapeHtml} from './functions';
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

    /**
     * https://github.com/gram-js/gramjs/issues/785
     * 
     * node_modules/telegram/client/dialogs.js#L129
     * 
     * if (!message) continue;
     */
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

        alias: {
            _: "频道备注",
        },

        pushme: {
            PUSHME_HOST: '',
            PUSHME_PUSH_KEY: '',
            PUSHME_TEMP_KEY: '',
            PUSHME_CHANNEL: '',
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

function getPushMeConfig() {
    const PUSHME_HOST = tonfig.get<string>("pushme.PUSHME_HOST", "");
    const PUSHME_PUSH_KEY = tonfig.get<string>("pushme.PUSHME_PUSH_KEY", "");
    const PUSHME_TEMP_KEY = tonfig.get<string>("pushme.PUSHME_TEMP_KEY", "");
    const PUSHME_CHANNEL = tonfig.get<string>("pushme.PUSHME_CHANNEL", "");

    return { PUSHME_HOST, PUSHME_PUSH_KEY, PUSHME_TEMP_KEY, PUSHME_CHANNEL };
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

    Util.setConsoleLog((message: string) => {
        logger.info(message);
    });

    mkdirSync(DataDir(), { recursive: true });

    await checkConfig();

    let { apiId, apiHash, account, session, deviceModel, systemVersion, appVersion, langCode, systemLangCode } = getAccountConfig();

    if (!session) {
        logger.info('请登录');
    }

    const pushme = getPushMeConfig();

    Object.entries(pushme).forEach(pair => {
        process.env[pair[0]] = pair[1];
    });

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

    const result: {
        username: string;
        name: string;
        status: string;
        details: string;
    }[] = [];

    // 用来调试通知
    const realSign = true;

    for (const username in commands) {
        if (!username || username == '_') continue;

        const bot = botInfos.find(v => v.username == username);

        const name = tonfig.get<string>(['alias', username], '') || bot?.name || username;

        if (!bot) {
            result.push({
                username,
                name: name,
                status: '❎',
                details: '用户不存在',
            });
            continue;
        };

        let command = tonfig.get<string>(['signin', username], '');

        if (!command) {
            result.push({
                username,
                name: name,
                status: '❎',
                details: '缺少签到指令',
            });
            continue;
        };

        if (!realSign) {
            result.push({
                username,
                name,
                status: '✅',
                details: '测试',
            });
            continue;
        }

        // 回复按钮
        if (command.includes(',btn:')) {
            const [_cmd, _btn] = command.split(',btn:', 2);

            command = _cmd;

            await client.sendMessage(username, {
                message: command,
            });

            // 最多等待5秒回复
            await Util.sleep(5000);

            const messages = await client.getMessages(username, { limit: 5 });

            let action = false;

            for (const message of messages) {
                if (!message.buttons?.length) continue;

                const btn = message.buttons.flat().find(v => v.text && v.text.includes(_btn));

                if (!btn) continue;

                await btn.click({});

                action = true;

                break;
            }

            if (!action) {
                result.push({
                    username,
                    name,
                    status: '❎',
                    details: '缺少签到按钮',
                });
                continue;
            }
        } else {
            await client.sendMessage(username, {
                message: command,
            });
        }

        result.push({
            username,
            name,
            status: '✅',
            details: '',
        });
    }

    result.sort((a, b) => {
        if (a.status == '✅' && b.status == '❎') return 1;
        if (a.status == '❎' && b.status == '✅') return -1;

        return 0;
    });

    const html = `
<body>
    <style>
        body {
            font-family: Arial, sans-serif;
            margin: 0px;
        }
        table {
            width: 100%;
            border-collapse: collapse;
        }
        th, td {
            padding: 8px;
            border: 1px solid #ddd;
            text-align: left;
        }
        th {
            background-color: #f5f5f5;
        }
        .name {
            width: auto;
            word-break: break-word;
        }
        .status {
            width: 40px;
            text-align: center;
        }
        .details {
            width: 100px;
            word-break: break-word;
        }
    </style>
    <table>
        <thead>
            <tr>
                <th class="name">项目</th>
                <th class="status">状态</th>
                <th class="details">详情</th>
            </tr>
        </thead>
        <tbody>
            ${result.map(v => `
            <tr>
                <td class="name"><a href="https://t.me/${v.username}" target="_blank">${escapeHtml(v.name)}</a></td>
                <td class="status">${v.status}</td>
                <td class="details">${v.details}</td>
            </tr>
            `).join('')}
        </tbody>
    </table>
</body>
`;

    for (const v of result) {
        if (v.status == '✅') {
            logger.info(`@${v.username} - ${v.name} - ${v.status}`);
        } else {
            logger.info(`@${v.username} - ${v.name} - ${v.status} - ${v.details}`);
        }
    }

    await Util.sendNotifyEx(["pushme"], {
        title: "TGSignBot",
        content: html,
        pushme: {
            type: "html",
        },
    });

    logger.info(`10 秒后自动退出！`);

    setTimeout(async () => {
        await client.destroy();
    }, 10 * 1000);
}

main();
