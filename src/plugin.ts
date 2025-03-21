import { HvigorNode, HvigorPlugin } from '@ohos/hvigor';

import * as path from 'path';
import { constants, readFileSync } from 'node:fs';
import Handlebars from 'handlebars';
import { existsSync, mkdirSync, writeFileSync } from 'fs';

import { DecoratorParser } from './parser';

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
    // 查找生成struct的关键字
    viewKeyword?: string[];
    // 生成代码模板
    builderTpl?: string;

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
        apply(node: HvigorNode) {
            console.log(`Exec: ${PLUGIN_ID} ${__dirname}`);
            console.log(`node:${node.getNodeName()},nodePath:${node.getNodePath()}`);
            // 获取模块名
            pluginConfig.moduleName = node.getNodeName();
            // 获取模块路径
            pluginConfig.modulePath = node.getNodePath();
            pluginExec(pluginConfig);
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
    
    pluginExec(pluginConfig);
}

// 解析插件开始执行
function pluginExec(config: PluginConfig) {
    console.log(`plugin exec config:\n${JSON.stringify(config, null, '\t')}`);

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


    // 遍历需要扫描的文件列表
    config.scanFiles.forEach((file) => {
        // 文件绝对路径
        let sourcePath = `${config.modulePath}/${file}`;
        if (!sourcePath.endsWith('.ets')) {
            sourcePath = sourcePath + '.ets';
        }
        // 获取文件相对路径
        const importPath = path.relative(`${config.modulePath}/${config.builderDir}`, sourcePath).replaceAll("\\", "/")
            .replaceAll(".ets", "");
        console.log(`sourcePath:${sourcePath}`);
        console.log(`importPath:${importPath}`);
        const parser = new DecoratorParser(config.modulePath, sourcePath);
        const results = parser.parse();
        console.log(`results:${JSON.stringify(results, null, '\t')}`);

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

        console.log(`templateModel:${JSON.stringify(templateModel, null, '\t')}`);

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
    console.log(JSON.stringify(templateModel));
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
    if (!indexContent.includes(`export * from './${config.builderDir}/${config.builderFileName?.replace(".ets", "")}';`)) {
        indexContent = indexContent + "\n" + `export * from './${config.builderDir}/${config.builderFileName?.replace(".ets", "")}';`;
    }
    writeFileSync(indexPath, indexContent, { encoding: "utf8" });
}