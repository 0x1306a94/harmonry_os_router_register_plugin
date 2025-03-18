import { testAutoRouterGeneratorPlugin, PluginConfig } from '../src/plugin';
import { writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname, resolve } from 'path';



describe('Plugin with tests', () => {
    it('generated code', () => {

        const moduleName = 'home';
        const modulePath = resolve(__dirname, '../sample/feature/home');

        console.log(`moduleName:${moduleName},modulePath:${modulePath}`);
        let pluginConfig: PluginConfig = {
            mainTarget: false,
            moduleName: moduleName,
            modulePath: modulePath,
            scanFiles: [
                'src/main/ets/components/HomePage.ets'
            ],
        };

        testAutoRouterGeneratorPlugin(pluginConfig);
    });

});