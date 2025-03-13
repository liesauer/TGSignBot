Telegram BOT签到机器人

## 使用说明
1. 支持BOT、频道、群组签到

## 账号配置
使用 [登录器](https://github.com/liesauer/TGLogin) 获取到 Session 后，填写账号信息到 `data/config.toml` 配置文件中即可。

## 签到配置
修改配置中的 `signin` 节点：

**BOT、频道用户名可以直接在TG客户端看得到，必须填写正确的用户名**

示例：

```toml
[signin]
myqiandaobot = "/signin"
xxx_checkin = "签到"
```


## 代理设置

如果你所在的地区无法直连TG服务器，可使用代理进行连接

不支持 secret 以 `ee` 开头的 MTProxy，相关issue：[gram-js/gramjs#426](https://github.com/gram-js/gramjs/issues/426)

参考：
<br />
[Using MTProxies and Socks5 Proxies](https://gram.js.org/getting-started/authorization#using-mtproxies-and-socks5-proxies)

## 配置说明

**修改任意配置都需要重启软件生效**

**配置文件中所有的 `_` 配置项都是占位，用来当成示例配置供参考填写的，删除无实际影响。**
