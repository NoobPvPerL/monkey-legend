# P1 成员测试预发布

版本：0.1.0-p1.1；Git标签：v0.1.0-p1.1；规则：web-v0.1.1。定位是供项目成员本地试玩的预发布，不代表负责人P1正式验收或平衡验证通过。

## 成员下载与启动

从[GitHub Release](https://github.com/NoobPvPerL/monkey-legend/releases/tag/v0.1.0-p1.1)下载monkey-legend-0.1.0-p1.1-windows-x64.zip，完整解压后双击“启动游戏.cmd”。运行时内置，不需要Node、npm、Git或安装依赖。不要在压缩软件中直接运行脚本。

支持目标是Windows 10/11 x64；已在当前Windows主机的独立解压目录验证，尚未在其他成员电脑或全新系统上验收。脚本尝试打开默认浏览器；未自动打开时，手动访问窗口显示的本机地址。默认127.0.0.1:5180，占用时尝试后续端口。关闭窗口或按Ctrl+C停止。首次或再次开局均从页面选择模式，运行时不会自动保存对局；需要保留时在复现工具导出JSON。

这是一台电脑上的四座轮换测试桌。请根据交接提示轮换操作；响应和技能限10秒，交接不停表。尚无房间、远端联机或独立客户端隐私。

Release附件仅提供游戏ZIP与SHA256SUMS.txt。GitHub自动生成的Source code归档是源码入口，不是免安装游戏包。开发说明、计划、测试报告、反馈模板均保留在仓库，不打入游戏ZIP。

## 发布包内容

| 内容 | 用途 |
|---|---|
| 启动游戏.cmd | Windows双击入口 |
| dist/ | 构建后的游戏页面、JS/CSS和16张游戏内牌面参考 |
| tools/start-local.mjs、local-server.mjs | 仅本机静态服务和启动逻辑，无第三方服务依赖 |
| runtime/node.exe、LICENSE.txt | Node 24 Windows x64运行时及原始许可 |
| licenses/ | 游戏前端所含React、React DOM、Scheduler的必要许可证 |
| release-manifest.json | 游戏/规则版本、来源提交、运行时来源及文件SHA-256 |

不包含docs/、tests/、测试场景、报告、源码工程、node_modules、.git或开发缓存。游戏规则数值和原始图文未因打包改动。

## 开发者复现发布

源码克隆后也可双击仓库根目录start-local.cmd：需要系统Node 24；没有dist时安装锁定依赖并构建。修改源码后用start-local.cmd --rebuild。Release内置运行时的启动分支不执行npm，也不需要网络。

```powershell
npm ci
npm test
npm run verify:data
npm run build
powershell -NoProfile -File tools/package-release.ps1
```

打包脚本要求Git工作区干净，记录准确来源提交。它从Node官方下载固定版本Windows x64 ZIP及SHASUMS256.txt，核对ZIP和node.exe两项SHA-256，只复制所需运行时及许可证。默认输出releases/final/；已存在输出时拒绝覆盖，重打使用新的-OutputDirectory。releases/和.release-cache/不提交Git。

把生成ZIP解压到另一个含中文和空格的目录，再验证：

```powershell
node tools/verify-release.mjs '独立解压后的游戏目录' '验证结果.json'
```

验证器检查精确文件清单和哈希，移除系统Node/npm的PATH后执行包内CMD，检查HTML、JS/CSS、全部16张牌面和HTTP边界，最后结束本次启动的进程树并确认服务停止。它不把同机独立解压冒充其他成员电脑或全新系统验收。

## 进度与意见

规则与页面实现、开发验证已完成；本次增加分发脚本、发布包独立验证和文档收尾。正式包、远程Release及反馈Issue的最终状态登记在[开发日志](development-log.md)。实际测试证据见[p1-validation.md](p1-validation.md)。

成员建议反馈：启动环境及失败信息、手牌/目标/响应流程、四角色技能、两模式结果、规则描述是否清晰。问题应带版本、模式、种子、复现步骤、预期/实际和截图或复现JSON。不要把尚未启用的原作全部牌池当成P1缺陷。
