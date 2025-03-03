import { harTasks } from '@ohos/hvigor-ohos-plugin';
import { AutoRouterGeneratorPlugin, PluginConfig } from 'router-register-plugin'

const config: PluginConfig = {
  mainTarget: false,
  scanFiles: [
    "src/main/ets/components/HomePage.ets",
  ]
}

export default {
  system: harTasks, /* Built-in plugin of Hvigor. It cannot be modified. */
  plugins: [
    AutoRouterGeneratorPlugin(config)
  ]         /* Custom plugin to extend the functionality of Hvigor. */
}
