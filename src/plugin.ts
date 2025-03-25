import { HvigorNode, HvigorPlugin, HvigorTaskContext, hvigor } from '@ohos/hvigor';
import { harTasks, OhosHarContext, OhosHapContext, OhosHspContext, OhosPluginId, Target } from '@ohos/hvigor-ohos-plugin';


import * as path from 'path';
import { constants, readFileSync } from 'node:fs';
import Handlebars, { K, logger } from 'handlebars';
import { existsSync, mkdirSync, rmdirSync, writeFileSync } from 'fs';

import { DecoratorParser } from './parser';

import { Logger } from './logger';

const PLUGIN_ID = "auto-router-generator-plugin";
const ROUTER_BUILDER_PATH = "src/main/ets/auto_router_generated";
const ROUTER_BUILDER_NAME = "RouterBuilder.ets";
const ROUTER_MAP_PATH = "src/main/resources/base/profile";
const ROUTER_ANNOTATION_NAME = "AppRouter";
const ROUTER_BUILDER_TEMPLATE = "viewBuilder.tpl";
const ROUTER_LIB_NAME = "autorouter";


interface TemplateModel {
    // 模块名称
    moduleName: string;
    // libraries名称
    libName: string;
    // 路由信息
    routers: TemplateRouterModel[];
}

interface TemplateRouterModel {
    view: ViewInfo;
    router: RouterItem;
}

// 用于生成组件注册类
interface ViewInfo {
    // 路由名，自定义装饰器中配置的参数值
    name: string;
    // 自定义组件的名字
    componentName: string;
    // import路径
    importPath: string;
    // 组件注册方法名
    buildFunction: string;
    // 方法是否有参数
    hasParam: boolean;
    // 参数名称
    paramName: string;
}

interface RouterItem {
    // 路由名，自定义装饰器中配置的参数值
    name: string;
    // 加载的页面的路径
    pageSourceFile: string;
    // 注册路由的方法
    buildFunction: string;
    // 元信息
    data?: RouterMetadata;
}

interface RouterMetadata {
    description?: string;
    moduleName?: string;
    login?: string;
    hasParam?: string;
    paramName?: string;
}

// 路由表
interface RouterMap {
    routerMap: RouterItem[];
}

interface ENVConfig {
    module: string;
    product: string;
}

// 配置文件，在hvigor中配置
export interface PluginConfig {
    mainTarget?: boolean;
    // 注册路由的方法的文件名
    builderFileName?: string;
    // 注册路由的方法的文件路径
    builderDir?: string;
    // 路由表所在路径
    routerMapDir?: string;
    // 模块名
    moduleName: string;
    // libraries名称
    libName?: string;
    // 模块路径
    modulePath: string;
    // 装饰器名称
    annotation?: string;
    // 扫描的文件路径
    scanFiles?: string[];
    // 特别的扫描文件，比如内部debug文件
    specialScanFiles?: Record<string, string[]>;
    // 查找生成struct的关键字
    viewKeyword?: string[];
    // 生成代码模板
    builderTpl?: string;
    // 是否开启日志
    enableLog?: boolean;

}


// hvigor中配置的插件方法
export function AutoRouterGeneratorPlugin(pluginConfig: PluginConfig): HvigorPlugin {
    pluginConfig.routerMapDir = pluginConfig.routerMapDir ?? ROUTER_MAP_PATH;
    pluginConfig.libName = pluginConfig.libName ?? ROUTER_LIB_NAME;
    pluginConfig.annotation = pluginConfig.annotation ?? ROUTER_ANNOTATION_NAME;
    pluginConfig.builderTpl = pluginConfig.builderTpl ?? ROUTER_BUILDER_TEMPLATE;
    pluginConfig.builderDir = pluginConfig.builderDir ?? ROUTER_BUILDER_PATH;
    pluginConfig.builderFileName = pluginConfig.builderFileName ?? ROUTER_BUILDER_NAME;


    return {
        pluginId: PLUGIN_ID,
        async apply(currentNode: HvigorNode): Promise<void> {

            Logger.setEnable(pluginConfig.enableLog ?? false);

            Logger.log(`Exec: ${PLUGIN_ID} ${__dirname}`);
            Logger.log(`node:${currentNode.getNodeName()},nodePath:${currentNode.getNodePath()}`);
            // 获取模块名
            pluginConfig.moduleName = currentNode.getNodeName();
            // 获取模块路径
            pluginConfig.modulePath = currentNode.getNodePath();

            hvigor.nodesEvaluated(async () => {
                const hapContext = currentNode.getContext(OhosPluginId.OHOS_HAP_PLUGIN) as OhosHapContext;
                const hspContext = currentNode.getContext(OhosPluginId.OHOS_HSP_PLUGIN) as OhosHspContext;
                const harContext = currentNode.getContext(OhosPluginId.OHOS_HAR_PLUGIN) as OhosHarContext;
                Logger.log(`${PLUGIN_ID} hapContext: ${hapContext}`);
                Logger.log(`${PLUGIN_ID} hspContext: ${hspContext}`);
                Logger.log(`${PLUGIN_ID} harContext: ${harContext}`);

                const moduleContext = hapContext ?? hspContext ?? harContext;

                const moduleName = moduleContext.getModuleName();
                Logger.log(`${PLUGIN_ID} moduleName: ${moduleName}`);


                moduleContext?.targets((target: Target) => {
                    const targetName = target.getTargetName();
                    Logger.log(`${PLUGIN_ID} target: ${targetName}`);
                    currentNode.registerTask({
                        name: `${targetName}@GenRouter`,
                        postDependencies: [`${targetName}@PreBuild`],
                        run() {
                            Logger.log(`${PLUGIN_ID} run ${targetName}@GenRouter`);
                            pluginExec(pluginConfig);
                        }
                    });

                    currentNode.registerTask({
                        name: `${targetName}@CleanGenRouter`,
                        postDependencies: ['clean'],
                        run() {
                            Logger.log(`${PLUGIN_ID} run ${targetName}@CleanGenRouter`);
                            pluginClean(pluginConfig);
                        }
                    });
                })


            });
        }
    }
}

export function testAutoRouterGeneratorPlugin(pluginConfig: PluginConfig) {
    pluginConfig.routerMapDir = pluginConfig.routerMapDir ?? ROUTER_MAP_PATH;
    pluginConfig.libName = pluginConfig.libName ?? ROUTER_LIB_NAME;
    pluginConfig.annotation = pluginConfig.annotation ?? ROUTER_ANNOTATION_NAME;
    pluginConfig.builderTpl = pluginConfig.builderTpl ?? ROUTER_BUILDER_TEMPLATE;
    pluginConfig.builderDir = pluginConfig.builderDir ?? ROUTER_BUILDER_PATH;
    pluginConfig.builderFileName = pluginConfig.builderFileName ?? ROUTER_BUILDER_NAME;
    Logger.setEnable(pluginConfig.enableLog ?? false);

    pluginExec(pluginConfig);
}

function pluginClean(config: PluginConfig) {
    const routerMap: RouterMap = {
        routerMap: []
    };

    cleanBuilder(config);
    generateRouterMap(routerMap, config);
    if (!config.mainTarget) {
        cleanIndex(config);
    }
}

// 解析插件开始执行
function pluginExec(config: PluginConfig) {
    Logger.log(`plugin exec config:\n${JSON.stringify(config, null, '\t')}`);

    if (config.scanFiles === undefined) {
        return;
    }

    const templateModel: TemplateModel = {
        moduleName: config.moduleName,
        libName: config.libName!,
        routers: []
    };

    const routerMap: RouterMap = {
        routerMap: []
    };



    let scanFiles = config.scanFiles ?? [];
    Logger.info(`process.env: ${JSON.stringify(process.env, null, '\t')}`);
    if (process.env.config && config.specialScanFiles) {
        const envConfig = JSON.parse(process.env.config) as ENVConfig;
        for (const key in config.specialScanFiles) {
            if (envConfig.product === key || (envConfig.module && envConfig.module.endsWith(`@${key}`))) {
                const files = config.specialScanFiles[key];
                Logger.info(`specialScanFiles: key ${key} files ${JSON.stringify(files)}`);
                scanFiles = scanFiles.concat(files);
            }
        }
    }

    // 遍历需要扫描的文件列表
    scanFiles.forEach((file) => {
        // 文件绝对路径
        let sourcePath = `${config.modulePath}/${file}`;
        if (!sourcePath.endsWith('.ets')) {
            sourcePath = sourcePath + '.ets';
        }
        // 获取文件相对路径
        const importPath = path.relative(`${config.modulePath}/${config.builderDir}`, sourcePath).replaceAll("\\", "/")
            .replaceAll(".ets", "");
        Logger.log(`sourcePath:${sourcePath}`);
        Logger.log(`importPath:${importPath}`);
        const parser = new DecoratorParser(config.modulePath, sourcePath);
        const results = parser.parse();
        Logger.log(`results:${JSON.stringify(results, null, '\t')}`);

        // 如果解析的文件中存在装饰器，则将结果保存到列表中
        if (results && results.length > 0) {
            for (let i = 0; i < results.length; i++) {
                const analyzer = results[i];
                templateModel.routers.push({
                    view: {
                        name: analyzer.name,
                        componentName: analyzer.componentName,
                        importPath: importPath,
                        hasParam: analyzer.hasParam,
                        paramName: analyzer.paramName,
                        buildFunction: `${analyzer.componentName}Builder`
                    },
                    router: {
                        name: analyzer.name,
                        pageSourceFile: `${config.builderDir}/${config.builderFileName}`,
                        buildFunction: `${analyzer.componentName}Builder`
                    }
                });
                routerMap.routerMap.push({
                    name: analyzer.name,
                    pageSourceFile: `${config.builderDir}/${config.builderFileName}`,
                    buildFunction: `${analyzer.componentName}Builder`,
                    data: {
                        moduleName: config.moduleName,
                        login: analyzer.login.toString(),
                        hasParam: analyzer.hasParam.toString(),
                        paramName: analyzer.paramName,
                    }
                });
            }

        }

        Logger.log(`templateModel:${JSON.stringify(templateModel, null, '\t')}`);

    })
    // 生成路由方法文件
    generateBuilder(templateModel, config);
    // 生成路由表文件
    generateRouterMap(routerMap, config);
    if (!config.mainTarget) {
        // 生成Index.ets文件
        generateIndex(config);
    }
}

// 根据模板生成路由方法文件
function generateBuilder(templateModel: TemplateModel, config: PluginConfig) {
    Logger.log(JSON.stringify(templateModel));
    const builderPath = path.resolve(__dirname, `../${config.builderTpl}`);
    const tpl = readFileSync(builderPath, { encoding: "utf8" });
    const template = Handlebars.compile(tpl);
    const output = template({
        moduleName: config.moduleName,
        libName: templateModel.libName,
        routers: templateModel.routers
    });

    const routerBuilderDir = `${config.modulePath}/${config.builderDir}`;
    if (!existsSync(routerBuilderDir)) {
        mkdirSync(routerBuilderDir, { recursive: true });
    }
    writeFileSync(`${routerBuilderDir}/${config.builderFileName}`, output, { encoding: "utf8" });
}

function cleanBuilder(config: PluginConfig) {
    const routerBuilderDir = `${config.modulePath}/${config.builderDir}`;
    if (existsSync(routerBuilderDir)) {
        rmdirSync(routerBuilderDir, { recursive: true });
    }
    Logger.debug(`clean ${routerBuilderDir}`);
}

function cleanIndex(config: PluginConfig) {
    const indexPath = `${config.modulePath}/Index.ets`;
    if (!existsSync(indexPath)) {
        return;
    }
    Logger.debug(`clean Index`);
    let indexContent: string = readFileSync(indexPath, { encoding: "utf8" });
    let lines = indexContent.split('\n');
    let insetLine = `export * from './${config.builderDir}/${config.builderFileName?.replace(".ets", "")}';`;
    const index = lines.indexOf(insetLine);
    if (index > -1) {
        lines.splice(index, 1);
    }

    const modifyCotent = lines.join('\n');
    writeFileSync(indexPath, modifyCotent, { encoding: "utf8" });
}

// 以json的格式生成路由表
function generateRouterMap(routerMap: RouterMap, config: PluginConfig) {
    const jsonOutput = JSON.stringify(routerMap, null, '\t');
    const routerMapDir = `${config.modulePath}/${config.routerMapDir}`;
    if (!existsSync(routerMapDir)) {
        mkdirSync(routerMapDir, { recursive: true });
    }
    writeFileSync(`${routerMapDir}/route_map.json`, jsonOutput, { encoding: "utf8" });
}

// 生成Index.ets，导出路由方法
function generateIndex(config: PluginConfig) {
    const indexPath = `${config.modulePath}/Index.ets`;
    if (!existsSync(indexPath)) {
        writeFileSync(indexPath, '', 'utf-8');
    }
    let indexContent: string = readFileSync(indexPath, { encoding: "utf8" });
    let lines = indexContent.split('\n');
    let insetLine = `export * from './${config.builderDir}/${config.builderFileName?.replace(".ets", "")}';`;
    if (!lines.includes(insetLine)) {
        lines.push(insetLine);
    }
    const modifyCotent = lines.join('\n');
    writeFileSync(indexPath, modifyCotent, { encoding: "utf8" });
}